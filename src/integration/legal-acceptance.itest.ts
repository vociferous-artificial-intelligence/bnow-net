import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";

// Real-Postgres coverage for the append-only legal-acceptance record. The disposable branch is
// forked at the production head and does NOT auto-apply new migrations, so this test applies
// drizzle/0017 itself (idempotent IF-NOT-EXISTS DDL), then exercises the actual app code
// path (recordAcceptance / hasCurrentPolicyAcceptance) end-to-end: DB-generated timestamp,
// idempotency, append-only version bumps, the unique constraint, and FK cascade.
//
// Version-agnostic ON PURPOSE: the current pair comes from the policy constants, never from a
// literal. Pinning a version here made this file go stale the moment Terms shipped 1.1 — the
// policy bump was correct and the test was wrong, which is exactly backwards.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL; // @/db (recordAcceptance) reads this — point it at the branch

const EMAIL = "legal-itest@example.com";

// Synthetic "next policy bump" pair. Test-only sentinels: high enough that they cannot collide
// with a real current pair (the unique constraint is on user_id + both versions), and obviously
// not a shippable version number.
const FUTURE_TERMS_VERSION = "99.0";
const FUTURE_PRIVACY_VERSION = "99.0";

let pool: Pool;
let userId: string;

async function applyMigration(file: string) {
  const body = readFileSync(join(process.cwd(), "drizzle", file), "utf8");
  for (const stmt of body.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
}

async function ensureAnalyticsMigration() {
  const existing = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name = 'analytics_preference'`,
  );
  if (existing.rowCount === 0) await applyMigration("0020_reflective_karnak.sql");
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await applyMigration("0017_flashy_photon.sql");
  await ensureAnalyticsMigration();
  await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]); // clean slate (cascades)
  // users.id has no DB default (it's a Drizzle $defaultFn) — supply one explicitly.
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, $1, 'user') RETURNING id`,
    [EMAIL],
  );
  userId = rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]).catch(() => {});
  await pool.end();
});

describe("policy_acceptances: append-only clickwrap record", () => {
  it("records one row with a DB-generated timestamp and stored attestations", async () => {
    const { recordAcceptance, hasCurrentPolicyAcceptance } = await import("@/lib/legal/acceptance");

    const res = await recordAcceptance({
      email: EMAIL,
      adultAttested: true,
      privacyAcknowledged: true,
      locale: "en",
    });
    expect(res.ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT terms_version, privacy_version, adult_attested, privacy_acknowledged,
              acceptance_method, locale, accepted_at
       FROM policy_acceptances WHERE user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(r.privacy_version).toBe(CURRENT_PRIVACY_VERSION);
    expect(r.adult_attested).toBe(true);
    expect(r.privacy_acknowledged).toBe(true);
    expect(r.acceptance_method).toBe("first_login_clickwrap");
    expect(r.locale).toBe("en");
    expect(r.accepted_at).toBeTruthy(); // server/DB-generated, never null
    expect(await hasCurrentPolicyAcceptance(userId)).toBe(true);
  });

  it("is idempotent: a repeat records no second row and returns the original timestamp", async () => {
    const { recordAcceptance } = await import("@/lib/legal/acceptance");
    const first = await pool.query(
      `SELECT accepted_at FROM policy_acceptances WHERE user_id = $1`,
      [userId],
    );
    const res = await recordAcceptance({ email: EMAIL, adultAttested: true, privacyAcknowledged: true });
    expect(res.ok).toBe(true);

    const after = await pool.query(
      `SELECT accepted_at FROM policy_acceptances WHERE user_id = $1`,
      [userId],
    );
    expect(after.rows).toHaveLength(1); // still exactly one row
    expect(new Date(after.rows[0].accepted_at).getTime()).toBe(
      new Date(first.rows[0].accepted_at).getTime(),
    );
  });

  it("is append-only: a version bump inserts a NEW row and leaves the old one untouched", async () => {
    // The current-version row is the one recordAcceptance wrote in the first test; this stands in
    // for the NEXT policy bump landing on top of it.
    await pool.query(
      `INSERT INTO policy_acceptances
         (user_id, terms_version, privacy_version, adult_attested, privacy_acknowledged, acceptance_method)
       VALUES ($1, $2, $3, true, true, 'first_login_clickwrap')`,
      [userId, FUTURE_TERMS_VERSION, FUTURE_PRIVACY_VERSION],
    );
    const { rows } = await pool.query(
      `SELECT terms_version, privacy_version FROM policy_acceptances WHERE user_id = $1`,
      [userId],
    );
    // Both pairs must survive: a bump APPENDS, it never rewrites the record of what the user
    // actually agreed to. Compared as unordered pairs — row order is not part of the contract,
    // and terms/privacy versions move independently, so neither column alone identifies a row.
    const pairs = rows.map((r) => `${r.terms_version}/${r.privacy_version}`);
    expect(pairs).toHaveLength(2);
    expect(pairs).toEqual(
      expect.arrayContaining([
        `${CURRENT_TERMS_VERSION}/${CURRENT_PRIVACY_VERSION}`,
        `${FUTURE_TERMS_VERSION}/${FUTURE_PRIVACY_VERSION}`,
      ]),
    );
  });

  it("enforces one row per (user, terms_version, privacy_version)", async () => {
    // duplicates the current-version row inserted by the first test
    await expect(
      pool.query(
        `INSERT INTO policy_acceptances
           (user_id, terms_version, privacy_version, adult_attested, privacy_acknowledged)
         VALUES ($1, $2, $3, true, true)`,
        [userId, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("cascades on user delete (no orphan acceptance rows)", async () => {
    const { rows: u } = await pool.query(
      `INSERT INTO users (id, email, role)
       VALUES (gen_random_uuid()::text, 'legal-itest-cascade@example.com', 'user') RETURNING id`,
    );
    const cascadeUser = u[0].id;
    // Any valid pair works here — this proves FK cascade, not version behavior — so it tracks the
    // current constants rather than carrying its own copy of policy-version knowledge to go stale.
    await pool.query(
      `INSERT INTO policy_acceptances (user_id, terms_version, privacy_version, adult_attested, privacy_acknowledged)
       VALUES ($1, $2, $3, true, true)`,
      [cascadeUser, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [cascadeUser]);
    const { rows } = await pool.query(
      `SELECT 1 FROM policy_acceptances WHERE user_id = $1`,
      [cascadeUser],
    );
    expect(rows).toHaveLength(0);
  });
});
