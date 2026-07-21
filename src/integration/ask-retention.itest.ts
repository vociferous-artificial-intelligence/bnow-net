import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Release hardening 2026-07-21: operator-governed retention on REAL Postgres —
// content past the configured windows is redacted/deleted while accounting
// metadata survives; fresh content is untouched; a redacted idempotency key is
// freed (a resubmission is honestly a new gesture). $0 by construction.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}
process.env.ASK_RUNS_ENFORCE = "1";
process.env.ASK_CONTENT_RETENTION_DAYS = "30";
process.env.ASK_EVENTS_RETENTION_DAYS = "7";
process.env.ASK_CACHE_TTL_DAYS = "7";

const { runMigrations } = await import("../../scripts/migrations-lib");
const { sweepAskRetention } = await import("@/lib/ask/retention");
const { createRun } = await import("@/lib/ask/runs");

const USER = "itest-retention@x.test";
let pool: Pool;
const uuid = () => crypto.randomUUID();

async function cleanup() {
  await pool.query(`DELETE FROM ask_run_events WHERE run_id IN (SELECT id FROM ask_runs WHERE user_email = $1)`, [USER]);
  await pool.query(`DELETE FROM ask_turns WHERE session_id IN (SELECT id FROM ask_sessions WHERE user_email = $1)`, [USER]);
  await pool.query(`DELETE FROM ask_sessions WHERE user_email = $1`, [USER]);
  await pool.query(`DELETE FROM ask_answer_cache WHERE user_email = $1`, [USER]);
  await pool.query(`DELETE FROM ask_usage WHERE user_email = $1`, [USER]);
  await pool.query(`DELETE FROM ask_runs WHERE user_email = $1`, [USER]);
}

beforeAll(async () => {
  await runMigrations(URL!);
  pool = new Pool({ connectionString: URL });
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

async function seedRun(opts: { runId: string; key: string; ageDays: number }) {
  await pool.query(
    `INSERT INTO ask_runs (id, user_email, question, idempotency_key, status, state, result,
                           evidence_snapshot, settled_cost_usd, units, created_at, finished_at)
     VALUES ($1, $2, 'seeded question', $3, 'finished', 'answered',
             '{"answer":"seeded answer"}'::jsonb, '{"version":1}'::jsonb, 0.0123, 1,
             now() - ($4 || ' days')::interval, now() - ($4 || ' days')::interval)`,
    [opts.runId, USER, opts.key, String(opts.ageDays)],
  );
}

describe("sweepAskRetention on real Postgres", () => {
  it("redacts old run/usage content, deletes old events/cache/sessions; preserves accounting; frees the idempotency key", async () => {
    await cleanup();
    const oldRun = uuid();
    const freshRun = uuid();
    const oldKey = `old-key-${oldRun.slice(0, 8)}`;
    await seedRun({ runId: oldRun, key: oldKey, ageDays: 40 });
    await seedRun({ runId: freshRun, key: `fresh-key-${freshRun.slice(0, 8)}`, ageDays: 1 });

    await pool.query(
      `INSERT INTO ask_usage (user_email, question, provider, cost_usd, evidence_count, created_at)
       VALUES ($1, 'old usage question', 'openai:gpt-5', 0.01, 3, now() - interval '40 days'),
              ($1, 'fresh usage question', 'openai:gpt-5', 0.01, 3, now() - interval '1 day')`,
      [USER],
    );
    await pool.query(
      `INSERT INTO ask_run_events (run_id, seq, type, payload, at)
       VALUES ($1, 1, 'run.created', '{}'::jsonb, now() - interval '10 days'),
              ($2, 1, 'run.created', '{}'::jsonb, now() - interval '1 day')`,
      [oldRun, freshRun],
    );
    await pool.query(
      `INSERT INTO ask_answer_cache (user_email, cache_key, corpus_version, question, result, snapshot, created_at)
       VALUES ($1, 'old-cache-key', '1:1', 'old q', '{}'::jsonb, '{}'::jsonb, now() - interval '10 days'),
              ($1, 'fresh-cache-key', '1:1', 'fresh q', '{}'::jsonb, '{}'::jsonb, now() - interval '1 day')`,
      [USER],
    );
    const oldSession = (
      await pool.query(
        `INSERT INTO ask_sessions (user_email, title, last_active_at)
         VALUES ($1, 'old investigation', now() - interval '40 days') RETURNING id`,
        [USER],
      )
    ).rows[0].id as string;
    await pool.query(
      `INSERT INTO ask_turns (session_id, seq, run_id, scope) VALUES ($1, 1, $2, 'new')`,
      [oldSession, oldRun],
    );

    const r = await sweepAskRetention();
    expect(r).not.toBeNull();
    expect(r!.runsRedacted).toBeGreaterThanOrEqual(1);
    expect(r!.eventsDeleted).toBeGreaterThanOrEqual(1);

    // old run: content gone, accounting intact, key rotated
    const oldRow = (
      await pool.query(
        `SELECT question, result, evidence_snapshot, idempotency_key, settled_cost_usd, units, state, status
         FROM ask_runs WHERE id = $1`,
        [oldRun],
      )
    ).rows[0];
    expect(oldRow.question).toBe("[deleted]");
    expect(oldRow.result).toBeNull();
    expect(oldRow.evidence_snapshot).toBeNull();
    expect(String(oldRow.idempotency_key)).toBe(`expired:${oldRun}`);
    expect(Number(oldRow.settled_cost_usd)).toBeCloseTo(0.0123, 6);
    expect(Number(oldRow.units)).toBe(1);
    expect(oldRow.state).toBe("answered");
    expect(oldRow.status).toBe("finished");

    // fresh run untouched
    const freshRow = (
      await pool.query(`SELECT question, result FROM ask_runs WHERE id = $1`, [freshRun])
    ).rows[0];
    expect(freshRow.question).toBe("seeded question");
    expect(freshRow.result).not.toBeNull();

    // usage: old question redacted, cost preserved; fresh untouched
    const usage = (
      await pool.query(
        `SELECT question, cost_usd FROM ask_usage WHERE user_email = $1 ORDER BY created_at`,
        [USER],
      )
    ).rows;
    expect(usage[0].question).toBe("[deleted]");
    expect(Number(usage[0].cost_usd)).toBeCloseTo(0.01, 6);
    expect(usage[1].question).toBe("fresh usage question");

    // events: 10-day-old row deleted (7-day window), fresh one kept
    const events = (
      await pool.query(`SELECT run_id FROM ask_run_events WHERE run_id IN ($1, $2)`, [oldRun, freshRun])
    ).rows;
    expect(events).toHaveLength(1);
    expect(events[0].run_id).toBe(freshRun);

    // cache: old entry deleted (7-day TTL), fresh kept
    const cache = (
      await pool.query(`SELECT cache_key FROM ask_answer_cache WHERE user_email = $1`, [USER])
    ).rows;
    expect(cache.map((c) => c.cache_key)).toEqual(["fresh-cache-key"]);

    // idle session + its turns deleted
    const sessions = await pool.query(`SELECT 1 FROM ask_sessions WHERE id = $1`, [oldSession]);
    expect(sessions.rows).toHaveLength(0);
    const turns = await pool.query(`SELECT 1 FROM ask_turns WHERE session_id = $1`, [oldSession]);
    expect(turns.rows).toHaveLength(0);

    // the redacted key is FREED: the same (user, key) now creates a NEW run
    const recreated = await createRun({
      runId: uuid(),
      userEmail: USER,
      question: "a new gesture with the retired key",
      idempotencyKey: oldKey,
    });
    expect(recreated.replayed).toBe(false);

    // idempotent: a second sweep finds no run content left to redact (the
    // recreated run is fresh; every old row was handled by the first pass)
    const again = await sweepAskRetention();
    expect(again!.runsRedacted).toBe(0);
  });
});
