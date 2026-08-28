import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the #98 timeout sweep against a disposable Neon
// branch: synthetic cron_runs rows in every relevant state, one sweep call,
// exact classification asserted. Zero provider traffic (pure bookkeeping SQL).

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const { sweepTimedOutRuns, withCronRun } = await import("@/lib/usage/cron-run");

let pool: Pool;
const ids: Record<string, number> = {};

async function seed(name: string, job: string, ageSec: number, finished: boolean): Promise<void> {
  const rows = (
    await pool.query(
      `INSERT INTO cron_runs (job, started_at, finished_at, ok)
       VALUES ($1, now() - make_interval(secs => $2),
               CASE WHEN $3 THEN now() - make_interval(secs => $2 - 30) END,
               CASE WHEN $3 THEN true END)
       RETURNING id`,
      [job, ageSec, finished],
    )
  ).rows as Array<{ id: number }>;
  ids[name] = rows[0].id;
}

async function row(name: string): Promise<{ ok: boolean | null; error: string | null; finished_at: string | null; counts: Record<string, unknown> }> {
  const r = await pool.query(`SELECT ok, error, finished_at, counts FROM cron_runs WHERE id = $1`, [
    ids[name],
  ]);
  return r.rows[0];
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  // fresh: just started (the row the current invocation itself would hold)
  await seed("fresh", "ingest:telegram", 5, false);
  // slow-but-alive: inside the 300+120s ingest ceiling
  await seed("slow", "ingest:telegram", 380, false);
  // dead: past the ingest ceiling (the real #98 signature)
  await seed("dead_ingest", "ingest:telegram", 700, false);
  // dead digest: inside the ingest ceiling but that is irrelevant — digest's
  // own ceiling is 800+120, so at 700s it must NOT be swept…
  await seed("alive_digest", "digest:intraday", 700, false);
  // …and at 1000s it must be.
  await seed("dead_digest", "digest:finalize", 1000, false);
  // unknown family: falls back to the widest ceiling (920s)
  await seed("dead_unknown", "somejob:variant", 1000, false);
  await seed("alive_unknown", "somejob:variant", 700, false);
  // recovered: finished long ago — never touched
  await seed("recovered", "ingest:telegram", 700, true);
});

afterAll(async () => {
  await pool.query(`DELETE FROM cron_runs WHERE id = ANY($1)`, [Object.values(ids)]);
  await pool.end();
});

describe("#98 timeout sweep (real Postgres)", () => {
  it("classifies exactly the definitionally-dead rows, preserving ruling 10's NULL finish", async () => {
    const swept = await sweepTimedOutRuns();
    expect(swept).toBeGreaterThanOrEqual(3); // ours; a fork can carry real hung rows too

    for (const name of ["dead_ingest", "dead_digest", "dead_unknown"]) {
      const r = await row(name);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/^timeout: no finish recorded/);
      expect(r.finished_at).toBeNull(); // never fabricated
      const sweep = r.counts.timeoutSweep as Record<string, number>;
      expect(sweep.sweptAtEpoch).toBeGreaterThan(1_700_000_000);
      expect(sweep.ceilingSec).toBe(
        name === "dead_ingest" ? 420 : 920, // 300+120 / 800+120 (unknown → widest)
      );
    }
    for (const name of ["fresh", "slow", "alive_digest", "alive_unknown"]) {
      const r = await row(name);
      expect(r.ok).toBeNull();
      expect(r.error).toBeNull();
      expect(r.counts.timeoutSweep).toBeUndefined();
    }
    const rec = await row("recovered");
    expect(rec.ok).toBe(true);
    expect(rec.counts.timeoutSweep).toBeUndefined();
  });

  it("is idempotent: a second sweep re-marks nothing", async () => {
    const before = await row("dead_ingest");
    const sweptAt = (before.counts.timeoutSweep as Record<string, number>).sweptAtEpoch;
    await new Promise((r) => setTimeout(r, 1100));
    await sweepTimedOutRuns();
    const after = await row("dead_ingest");
    expect((after.counts.timeoutSweep as Record<string, number>).sweptAtEpoch).toBe(sweptAt);
  });

  it("every job start runs the sweep, and the starting job itself is unaffected", async () => {
    await seed("dead_late", "validate", 600, false); // validate ceiling 420
    await withCronRun("itest-sweep-host", async (counts) => {
      counts.touched = 1;
      return null;
    });
    const late = await row("dead_late");
    expect(late.ok).toBe(false);
    expect(late.error).toMatch(/^timeout/);
    const host = await pool.query(
      `SELECT ok, error FROM cron_runs WHERE job = 'itest-sweep-host' ORDER BY id DESC LIMIT 1`,
    );
    expect(host.rows[0].ok).toBe(true);
    expect(host.rows[0].error).toBeNull();
    await pool.query(`DELETE FROM cron_runs WHERE job = 'itest-sweep-host'`);
  });
});
