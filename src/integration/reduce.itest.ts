import { Pool } from "@neondatabase/serverless";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { isSkipped, persistDigest } from "../lib/analysis/digest-persist";

// Integration coverage for the shared digest persist path (MR sprint 3):
// the thin-/empty-regen overwrite guards (#32) and the mapreduce engine's
// write shape, against a real Neon branch schema (trigger included).

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const TEST_DATE = "2030-02-01"; // far future — empty corpus on the fork

let pool: Pool;
let uaId: number;
let docId: number;

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  const { rows } = await pool.query(`SELECT id FROM countries WHERE iso2 = 'ua'`);
  uaId = rows[0].id;
  const doc = await pool.query(
    `INSERT INTO raw_documents (adapter, content, content_hash, country_iso2)
     VALUES ('manual', 'reduce itest doc', 'reduce-itest-' || now()::text, 'ua') RETURNING id`,
  );
  docId = doc.rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

afterEach(() => {
  delete process.env.FORCE_REGEN;
});

const eventWith = (claimTexts: string[]) => ({
  title: "Test event",
  type: "strike",
  summary: "itest",
  claims: claimTexts.map((text) => ({
    text,
    claimType: "factual" as const,
    hedging: "claimed" as const,
    docIds: [docId],
    entities: [],
  })),
});

describe("persistDigest overwrite guards (#32)", () => {
  it("writes, then refuses a thin regeneration, then obeys FORCE_REGEN", async () => {
    const base = {
      pool,
      countryId: uaId,
      countryIso2: "ua",
      date: TEST_DATE,
      track: "military" as const,
      provider: "itest",
      structured: { stats: { itest: true } },
    };

    // 1. initial write: 4 claims
    const first = await persistDigest({
      ...base,
      events: [eventWith(["c1", "c2", "c3", "c4"])],
    });
    expect(isSkipped(first)).toBe(false);
    if (isSkipped(first)) throw new Error("unreachable");
    expect(first.claimCount).toBe(4);

    // 2. thin regeneration (1 < 4 * 0.5) is refused; claims stay intact
    const thin = await persistDigest({ ...base, events: [eventWith(["only one"])] });
    expect(isSkipped(thin)).toBe(true);
    if (!isSkipped(thin)) throw new Error("unreachable");
    expect(thin.skipped).toBe("thin-regen");
    expect(thin.priorClaims).toBe(4);
    const { rows: kept } = await pool.query(
      `SELECT count(*)::int AS n FROM claims WHERE digest_id = $1`,
      [first.digestId],
    );
    expect(kept[0].n).toBe(4);

    // 3. empty regeneration is refused too
    const empty = await persistDigest({ ...base, events: [] });
    expect(isSkipped(empty) && empty.skipped === "empty-regen").toBe(true);

    // 4. FORCE_REGEN=1 lets the thin roll through (same digest row, upserted)
    process.env.FORCE_REGEN = "1";
    const forced = await persistDigest({ ...base, events: [eventWith(["forced"])] });
    expect(isSkipped(forced)).toBe(false);
    if (isSkipped(forced)) throw new Error("unreachable");
    expect(forced.digestId).toBe(first.digestId);
    expect(forced.claimCount).toBe(1);
  });

  it("keeps every persisted claim traceable (trigger holds on the shared path)", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM claims cl
       WHERE cl.country_id = $1 AND cl.claim_date = $2
         AND NOT EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.claim_id = cl.id)`,
      [uaId, TEST_DATE],
    );
    expect(rows[0].n).toBe(0);
  });
});
