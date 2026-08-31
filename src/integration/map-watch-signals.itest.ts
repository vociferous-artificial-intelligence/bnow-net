import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the #103 watchdog's signal queries: the swept-row
// count keys on the exact #98 sweep signature (ok=false, finished_at NULL),
// ages derive from the DB clock, and the eligibility EXISTS matches the map
// worker's predicate family. No email, no state writes — signals only.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const { loadMapWatchSignals, mapWatchConfigFromEnv } = await import("@/lib/analysis/map-watch");

let pool: Pool;
const seededRunIds: number[] = [];

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
});

afterAll(async () => {
  if (seededRunIds.length) {
    await pool.query(`DELETE FROM cron_runs WHERE id = ANY($1)`, [seededRunIds]);
  }
  await pool.end();
});

describe("loadMapWatchSignals against a production fork", () => {
  it("counts freshly swept map rows, ignores finished failures, and reads DB-clock ages", async () => {
    const q = (sql: string, params: unknown[]) =>
      pool.query(sql, params).then((r) => r.rows) as Promise<Array<Record<string, unknown>>>;
    const before = await loadMapWatchSignals(q, mapWatchConfigFromEnv());
    expect(before.lastStartAgeSec).not.toBeNull(); // the fork carries real map history
    expect(typeof before.eligibleExists).toBe("boolean");

    // seed one row in the EXACT sweep shape (ok=false, finished_at NULL) and
    // one finished failure that must NOT count
    const swept = await pool.query(
      `INSERT INTO cron_runs (job, ok, error) VALUES ('map', false, 'timeout: itest seed') RETURNING id`,
    );
    seededRunIds.push(swept.rows[0].id);
    const finishedFail = await pool.query(
      `INSERT INTO cron_runs (job, ok, error, finished_at) VALUES ('map', false, 'itest finished failure', now()) RETURNING id`,
    );
    seededRunIds.push(finishedFail.rows[0].id);

    const after = await loadMapWatchSignals(q, mapWatchConfigFromEnv());
    expect(after.sweptRecent).toBe(before.sweptRecent + 1); // swept shape counted
    expect(after.lastStartAgeSec).toBeLessThanOrEqual(60); // the seed just started
  });
});

describe("pgClaimWatchSlot against a production fork", () => {
  it("first claim wins, an immediate second claim throttles, an aged slot re-claims", async () => {
    const { pgClaimWatchSlot } = await import("@/lib/analysis/map-watch");
    const q = (sql: string, params: unknown[]) =>
      pool.query(sql, params).then((r) => r.rows) as Promise<Array<Record<string, unknown>>>;
    await pool.query(`DELETE FROM provider_state WHERE provider = 'map_watch'`);
    try {
      const t = 1_788_200_000_000;
      expect(await pgClaimWatchSlot(q, t, 600_000)).toBe(true); // fresh row
      expect(await pgClaimWatchSlot(q, t + 1_000, 600_000)).toBe(false); // inside interval
      expect(await pgClaimWatchSlot(q, t + 600_000, 600_000)).toBe(true); // slot aged out
    } finally {
      await pool.query(`DELETE FROM provider_state WHERE provider = 'map_watch'`);
    }
  });
});
