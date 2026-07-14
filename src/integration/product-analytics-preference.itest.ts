import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const EMAIL = "analytics-preference-itest@example.com";
const ACCESS_EMAIL = "analytics-attribution-itest@example.com";
let pool: Pool;
let userId: string;
let accessId: number;

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
  await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  await pool.query(`DELETE FROM subscribe_intents WHERE email = $1`, [ACCESS_EMAIL]);
  const user = await pool.query(
    `INSERT INTO users (id, email, role)
     VALUES (gen_random_uuid()::text, $1, 'user') RETURNING id`,
    [EMAIL],
  );
  userId = user.rows[0].id;
  const access = await pool.query(
    `INSERT INTO subscribe_intents (email, source) VALUES ($1, 'access_form') RETURNING id`,
    [ACCESS_EMAIL],
  );
  accessId = access.rows[0].id;
  await pool.query(
    `INSERT INTO policy_acceptances
       (user_id, terms_version, privacy_version, adult_attested, privacy_acknowledged)
     VALUES ($1, '1.0', '1.0', true, true)`,
    [userId],
  );
  await ensureAnalyticsMigration();
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]).catch(() => {});
  await pool.query(`DELETE FROM subscribe_intents WHERE email = $1`, [ACCESS_EMAIL]).catch(() => {});
  await pool.end();
});

describe("0020 product analytics preference and attribution", () => {
  it("backfills pre-existing users to unset and enforces the closed value set", async () => {
    const result = await pool.query(
      `SELECT analytics_preference, analytics_preference_updated_at
       FROM users WHERE id = $1`,
      [userId],
    );
    expect(result.rows[0]).toMatchObject({
      analytics_preference: "unset",
      analytics_preference_updated_at: null,
    });
    await expect(
      pool.query(`UPDATE users SET analytics_preference = 'maybe' WHERE id = $1`, [userId]),
    ).rejects.toThrow(/check|users_analytics_preference_check/i);
  });

  it("grants and denies with a DB timestamp without mutating legal history", async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS count FROM policy_acceptances WHERE user_id = $1`,
      [userId],
    );
    const { updateAnalyticsPreferenceForEmail } = await import("@/lib/legal/acceptance");
    await expect(updateAnalyticsPreferenceForEmail(EMAIL, "granted")).resolves.toEqual({
      ok: true,
      preference: "granted",
    });
    const user = await pool.query(
      `SELECT analytics_preference, analytics_preference_updated_at
       FROM users WHERE id = $1`,
      [userId],
    );
    expect(user.rows[0].analytics_preference).toBe("granted");
    expect(user.rows[0].analytics_preference_updated_at).toBeTruthy();
    const after = await pool.query(
      `SELECT count(*)::int AS count FROM policy_acceptances WHERE user_id = $1`,
      [userId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("atomically replaces a prior grant when the current Privacy version is accepted unchecked", async () => {
    const { recordAcceptance } = await import("@/lib/legal/acceptance");
    await expect(
      recordAcceptance({
        email: EMAIL,
        adultAttested: true,
        privacyAcknowledged: true,
        locale: "en",
      }),
    ).resolves.toMatchObject({ ok: true });
    const user = await pool.query(
      `SELECT analytics_preference FROM users WHERE id = $1`,
      [userId],
    );
    expect(user.rows[0].analytics_preference).toBe("denied");
    const versions = await pool.query(
      `SELECT terms_version, privacy_version FROM policy_acceptances
       WHERE user_id = $1 ORDER BY accepted_at`,
      [userId],
    );
    expect(versions.rows).toEqual([
      { terms_version: "1.0", privacy_version: "1.0" },
      { terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION },
    ]);
  });

  it("preserves old access rows and accepts validated nullable attribution", async () => {
    const old = await pool.query(
      `SELECT utm_source, utm_medium, utm_campaign, landing_path, referrer_host
       FROM subscribe_intents WHERE id = $1`,
      [accessId],
    );
    expect(old.rows[0]).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      landing_path: null,
      referrer_host: null,
    });
    await pool.query(
      `UPDATE subscribe_intents
       SET utm_source = 'newsletter', utm_medium = 'email', utm_campaign = 'beta-01',
           landing_path = '/access', referrer_host = 'publisher.example'
       WHERE id = $1`,
      [accessId],
    );
    const updated = await pool.query(
      `SELECT utm_source, landing_path, referrer_host FROM subscribe_intents WHERE id = $1`,
      [accessId],
    );
    expect(updated.rows[0]).toEqual({
      utm_source: "newsletter",
      landing_path: "/access",
      referrer_host: "publisher.example",
    });
  });
});
