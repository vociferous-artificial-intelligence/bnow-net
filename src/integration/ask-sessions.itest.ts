import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// AI Search Phase 6: sessions on REAL Postgres — ownership, turn lifecycle,
// §7.7 delete/export, and the reuse follow-up's zero-retrieval money story.
// $0 by construction (keys scrubbed → offline deterministic answers).

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}
process.env.ASK_SESSIONS = "1";
process.env.ASK_RUNS_ENFORCE = "1";
process.env.ASK_CONTENT_RETENTION_DAYS = "30"; // enforce/sessions require retention (features.ts)
process.env.ASK_GLOBAL_DAILY_BUDGET_USD = "1000";

const { runMigrations } = await import("../../scripts/migrations-lib");
const {
  appendTurn,
  deleteSession,
  exportSession,
  getSession,
  latestSnapshot,
  listTurns,
  runReuseFollowupTurn,
  startSessionFromRun,
} = await import("@/lib/ask/sessions");
import type { EvidenceSnapshot } from "@/lib/ask/events";

const USER = "itest-sessions@x.test";
const OTHER = "itest-sessions-other@x.test";
let pool: Pool;

const SNAPSHOT: EvidenceSnapshot = {
  version: 1,
  retrievalMode: "v2",
  window: null,
  totalMatching: 1,
  candidatesCount: 1,
  corpusCurrentThrough: "2026-07-18",
  candidates: [
    { claimId: 42, text: "Frozen snapshot claim for sessions.", hedging: "claimed", claimDate: "2026-07-15", countryIso2: "ua", track: null, confidence: null, sourceDocIds: [] },
  ],
  selectedClaimIds: [42],
};

async function cleanup() {
  await pool.query(`DELETE FROM ask_turns WHERE session_id IN (SELECT id FROM ask_sessions WHERE user_email LIKE 'itest-sessions%')`);
  await pool.query(`DELETE FROM ask_sessions WHERE user_email LIKE 'itest-sessions%'`);
  await pool.query(`DELETE FROM ask_allowance_reservations WHERE user_email LIKE 'itest-sessions%'`);
  await pool.query(`DELETE FROM ask_usage WHERE user_email LIKE 'itest-sessions%'`);
  await pool.query(`DELETE FROM ask_runs WHERE user_email LIKE 'itest-sessions%'`);
}

/** Seed a finished run WITH a snapshot (as a progressive Phase 2+ run would). */
async function seedRun(userEmail: string, question: string): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO ask_runs (id, user_email, question, idempotency_key, status, state, result, finished_at, evidence_snapshot)
     VALUES ($1, $2, $3, $4, 'finished', 'answered', $5::jsonb, now(), $6::jsonb)`,
    [
      id, userEmail, question, `seed-${id}`,
      JSON.stringify({ answer: "Seed answer [c42].", state: "answered", citedClaimIds: [42], provider: "openai:gpt-5", evidenceCount: 1, terms: [], relatedClaimIds: [], window: null, totalMatching: 1, sampled: false, retrievalMode: "v2" }),
      JSON.stringify(SNAPSHOT),
    ],
  );
  return id;
}

beforeAll(async () => {
  await runMigrations(URL!);
  pool = new Pool({ connectionString: URL });
  await cleanup();
});

afterAll(async () => {
  delete process.env.ASK_SESSIONS;
  delete process.env.ASK_RUNS_ENFORCE;
  delete process.env.ASK_CONTENT_RETENTION_DAYS;
  delete process.env.ASK_GLOBAL_DAILY_BUDGET_USD;
  await cleanup();
  await pool.end();
});

describe("sessions on real Postgres (Phase 6)", () => {
  it("start-from-run, ownership isolation, and turn ordering", async () => {
    const runId = await seedRun(USER, "original question");
    const started = await startSessionFromRun({ userEmail: USER, runId, title: "Investigation A" });
    expect(started.ok).toBe(true);
    const sessionId = started.ok ? started.session.id : "";

    // ownership: the other user sees nothing
    expect(await getSession(sessionId, OTHER)).toBeNull();
    expect(await exportSession(sessionId, OTHER)).toBeNull();
    expect(await latestSnapshot(sessionId, OTHER)).toBeNull();

    const turns = await listTurns(sessionId, USER);
    expect(turns).toHaveLength(1);
    expect(turns[0].scope).toBe("new");
    expect(await latestSnapshot(sessionId, USER)).toEqual(SNAPSHOT);
  });

  it("a REUSE follow-up bills through the normal money path with ZERO retrieval/embed and re-persists the snapshot (F11)", async () => {
    const runId = await seedRun(USER, "origin for reuse");
    const started = await startSessionFromRun({ userEmail: USER, runId, title: "Investigation B" });
    expect(started.ok).toBe(true);
    const sessionId = started.ok ? started.session.id : "";

    const r = await runReuseFollowupTurn({
      sessionId,
      userEmail: USER,
      question: "Any interceptions reported?",
      idempotencyKey: `itest-follow-${Date.now()}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.provider).toBe("stub"); // offline deterministic = $0
    expect(r.result.citedClaimIds).toContain(42); // evidence FROM the frozen snapshot
    expect(r.seq).toBe(2);

    // zero provider reservations for the turn's run (no embed, no rerank, no answer call)
    const { rows: resv } = await pool.query(
      `SELECT count(*)::int AS n FROM provider_usage_reservations WHERE run_id = $1`,
      [r.result.runId],
    );
    expect((resv[0] as { n: number }).n).toBe(0);
    // usage row carries no embed tokens (retrieval never ran)
    const { rows: usage } = await pool.query(
      `SELECT embed_tokens, cost_usd FROM ask_usage WHERE run_id = $1`,
      [r.result.runId],
    );
    expect((usage[0] as { embed_tokens: number | null }).embed_tokens).toBeNull();
    expect(Number((usage[0] as { cost_usd: number }).cost_usd)).toBe(0);
    // F11: the turn's run row carries the SAME frozen snapshot
    const { rows: run } = await pool.query(
      `SELECT evidence_snapshot, units FROM ask_runs WHERE id = $1`,
      [r.result.runId],
    );
    expect((run[0] as { evidence_snapshot: EvidenceSnapshot }).evidence_snapshot).toEqual(SNAPSHOT);
    // Phase 7 (post-Gate-7): this itest runs OFFLINE, so the answer is the
    // deterministic stub — a DEGRADED provider bills 0 units (a real paid
    // reuse turn bills 1; units.test.ts pins both classes).
    expect((run[0] as { units: number }).units).toBe(0);
  });

  it("§7.7 delete: owner removes turns + content EVERYWHERE (runs, events, cache, usage question); accounting rows survive; foreign delete inert", async () => {
    const runId = await seedRun(USER, "to be deleted");
    // content copies in the side tables (as a real progressive+cached run would leave)
    await pool.query(
      `INSERT INTO ask_run_events (run_id, seq, type, payload) VALUES ($1, 1, 'answer.section', '{"text":"streamed prose","citedClaimIds":[]}'::jsonb)`,
      [runId],
    );
    await pool.query(
      `INSERT INTO ask_answer_cache (user_email, cache_key, corpus_version, question, result, snapshot)
       VALUES ($1, 'del-key', '1:1', 'to be deleted', '{}'::jsonb, '{}'::jsonb)`,
      [USER],
    );
    await pool.query(
      `INSERT INTO ask_usage (user_email, question, provider, cost_usd, evidence_count, run_id)
       VALUES ($1, 'to be deleted', 'openai:gpt-5', 0.01, 1, $2)`,
      [USER, runId],
    );
    const started = await startSessionFromRun({ userEmail: USER, runId, title: "Investigation C" });
    const sessionId = started.ok ? started.session.id : "";

    // foreign delete: nothing happens
    expect((await deleteSession(sessionId, OTHER)).deleted).toBe(false);
    expect(await getSession(sessionId, USER)).not.toBeNull();

    const del = await deleteSession(sessionId, USER);
    expect(del.deleted).toBe(true);
    expect(del.turnsRemoved).toBe(1);
    expect(await getSession(sessionId, USER)).toBeNull();
    // the run row SURVIVES as an accounting record, its content removed
    const { rows } = await pool.query(
      `SELECT question, result, evidence_snapshot FROM ask_runs WHERE id = $1`,
      [runId],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0] as { question: string; result: unknown; evidence_snapshot: unknown };
    expect(row.question).toBe("[deleted]");
    expect(row.result).toBeNull();
    expect(row.evidence_snapshot).toBeNull();
    // G6 high fix: events gone, cache row gone, usage question redacted, usage COST kept
    const { rows: ev } = await pool.query(`SELECT count(*)::int AS n FROM ask_run_events WHERE run_id = $1`, [runId]);
    expect((ev[0] as { n: number }).n).toBe(0);
    const { rows: cache } = await pool.query(
      `SELECT count(*)::int AS n FROM ask_answer_cache WHERE user_email = $1 AND question = 'to be deleted'`,
      [USER],
    );
    expect((cache[0] as { n: number }).n).toBe(0);
    const { rows: usage } = await pool.query(
      `SELECT question, cost_usd FROM ask_usage WHERE run_id = $1`,
      [runId],
    );
    expect((usage[0] as { question: string }).question).toBe("[deleted]");
    expect(Number((usage[0] as { cost_usd: number }).cost_usd)).toBe(0.01); // accounting retained
  });

  it("export returns the owner's turns in order with content; append respects the unique (session, seq) under sequential use", async () => {
    const runId = await seedRun(USER, "export origin");
    const started = await startSessionFromRun({ userEmail: USER, runId, title: "Investigation D" });
    const sessionId = started.ok ? started.session.id : "";
    const run2 = await seedRun(USER, "second turn q");
    const appended = await appendTurn({ sessionId, userEmail: USER, runId: run2, scope: "expand" });
    expect(appended).toEqual({ ok: true, seq: 2 });

    const exp = await exportSession(sessionId, USER);
    expect(exp?.turns.map((t) => t.seq)).toEqual([1, 2]);
    expect(exp?.turns[0].question).toBe("export origin");
    expect(exp?.turns[1].scope).toBe("expand");
    expect(exp?.turns[0].snapshot).toEqual(SNAPSHOT);
  });

  it("a session whose origin run has no snapshot cannot start (the continuity unit is required)", async () => {
    const bare = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ask_runs (id, user_email, question, idempotency_key, status, state, finished_at)
       VALUES ($1, $2, 'bare', $3, 'finished', 'answered', now())`,
      [bare, USER, `seed-${bare}`],
    );
    const r = await startSessionFromRun({ userEmail: USER, runId: bare, title: "no snapshot" });
    expect(r).toEqual({ ok: false, reason: "no_snapshot" });
  });
});

describe("transactional sessions (release hardening)", () => {
  it("startSessionFromRun is ATOMIC: a run already claimed by another session refuses run_in_session with ZERO new session rows", async () => {
    const runId = await seedRun(USER, "atomicity origin");
    const first = await startSessionFromRun({ userEmail: USER, runId, title: "First claim" });
    expect(first.ok).toBe(true);

    const before = await pool.query(`SELECT count(*)::int AS n FROM ask_sessions WHERE user_email = $1`, [USER]);
    const second = await startSessionFromRun({ userEmail: USER, runId, title: "Second claim" });
    expect(second).toEqual({ ok: false, reason: "run_in_session" });
    const after = await pool.query(`SELECT count(*)::int AS n FROM ask_sessions WHERE user_email = $1`, [USER]);
    // the rolled-back transaction left no turnless orphan session behind
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("two CONCURRENT starts from the same run: exactly one session wins, the loser leaves no orphan", async () => {
    const runId = await seedRun(USER, "concurrent start origin");
    const [a, b] = await Promise.all([
      startSessionFromRun({ userEmail: USER, runId, title: "racer A" }),
      startSessionFromRun({ userEmail: USER, runId, title: "racer B" }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    const loser = [a, b].find((r) => !r.ok)!;
    expect(loser.ok === false && loser.reason).toBe("run_in_session");
    const turns = await pool.query(`SELECT count(*)::int AS n FROM ask_turns WHERE run_id = $1`, [runId]);
    expect(turns.rows[0].n).toBe(1);
    // every surviving session for this user has at least one turn (no orphans)
    const orphans = await pool.query(
      `SELECT count(*)::int AS n FROM ask_sessions s
       WHERE s.user_email = $1 AND NOT EXISTS (SELECT 1 FROM ask_turns t WHERE t.session_id = s.id)`,
      [USER],
    );
    expect(orphans.rows[0].n).toBe(0);
  });

  it("two CONCURRENT appends to one session get DISTINCT seqs (FOR UPDATE serializes; last_active_at bumped)", async () => {
    const origin = await seedRun(USER, "concurrent append origin");
    const started = await startSessionFromRun({ userEmail: USER, runId: origin, title: "Concurrent appends" });
    expect(started.ok).toBe(true);
    const sessionId = started.ok ? started.session.id : "";
    const runA = await seedRun(USER, "turn A");
    const runB = await seedRun(USER, "turn B");

    const beforeActive = (
      await pool.query(`SELECT last_active_at FROM ask_sessions WHERE id = $1`, [sessionId])
    ).rows[0].last_active_at as string;

    const [ra, rb] = await Promise.all([
      appendTurn({ sessionId, userEmail: USER, runId: runA, scope: "reuse" }),
      appendTurn({ sessionId, userEmail: USER, runId: runB, scope: "reuse" }),
    ]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    const seqs = [ra, rb].map((r) => (r.ok ? r.seq : -1)).sort();
    expect(seqs).toEqual([2, 3]); // distinct, gap-free — the lock serialized them

    const afterActive = (
      await pool.query(`SELECT last_active_at FROM ask_sessions WHERE id = $1`, [sessionId])
    ).rows[0].last_active_at as string;
    expect(new Date(afterActive).getTime()).toBeGreaterThan(new Date(beforeActive).getTime());
  });

  it("deleteSession racing an append never yields a partially-deleted session or an orphan turn", async () => {
    const origin = await seedRun(USER, "delete-race origin");
    const started = await startSessionFromRun({ userEmail: USER, runId: origin, title: "Delete race" });
    expect(started.ok).toBe(true);
    const sessionId = started.ok ? started.session.id : "";
    const runC = await seedRun(USER, "turn C");

    const [del, app] = await Promise.all([
      deleteSession(sessionId, USER),
      appendTurn({ sessionId, userEmail: USER, runId: runC, scope: "reuse" }),
    ]);
    expect(del.deleted).toBe(true);
    // the append either landed BEFORE the delete (its turn was removed with the
    // session) or lost the lock race and refused not_found — never a raw throw
    if (!app.ok) expect(app.reason).toBe("not_found");
    // in both cases: no turns survive for a deleted session
    const leftover = await pool.query(`SELECT count(*)::int AS n FROM ask_turns WHERE session_id = $1`, [sessionId]);
    expect(leftover.rows[0].n).toBe(0);
    const sessionRow = await pool.query(`SELECT 1 FROM ask_sessions WHERE id = $1`, [sessionId]);
    expect(sessionRow.rows).toHaveLength(0);
  });
});
