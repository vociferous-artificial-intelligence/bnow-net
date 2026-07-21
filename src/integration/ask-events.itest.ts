import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// AI Search Phase 2 transport spike (contract §6 proof obligations 1–3, 5) on
// real Postgres over PRODUCTION-SHAPED fork data. $0 by construction: every
// paid-provider key is scrubbed at module load, so retrieval is lexical-only
// and the answer is the deterministic stub — zero provider calls anywhere.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}

const { runMigrations } = await import("../../scripts/migrations-lib");
const { askWithLimits } = await import("@/lib/ask/limits");
const { PgRunEventSink, readRunEvents } = await import("@/lib/ask/events");
const { retrieveV2 } = await import("@/lib/ask/retrieve-v2");

const USER = "itest-events@x.test";
let pool: Pool;

async function cleanup() {
  await pool.query(`DELETE FROM ask_run_events WHERE run_id IN (SELECT id FROM ask_runs WHERE user_email = $1)`, [USER]);
  await pool.query(`DELETE FROM ask_allowance_reservations WHERE user_email = $1`, [USER]);
  await pool.query(`DELETE FROM ask_usage WHERE user_email = $1`, [USER]);
  await pool.query(`DELETE FROM ask_runs WHERE user_email = $1`, [USER]);
}

beforeAll(async () => {
  await runMigrations(URL!);
  pool = new Pool({ connectionString: URL });
  await cleanup();
  process.env.ASK_RUNS_ENFORCE = "1";
  process.env.ASK_CONTENT_RETENTION_DAYS = "30"; // enforce requires retention (features.ts)
  process.env.ASK_GLOBAL_DAILY_BUDGET_USD = "1000";
});

afterAll(async () => {
  delete process.env.ASK_RUNS_ENFORCE;
  delete process.env.ASK_CONTENT_RETENTION_DAYS;
  delete process.env.ASK_GLOBAL_DAILY_BUDGET_USD;
  await cleanup();
  await pool.end();
});

describe("run-event transport on real Postgres (contract §6)", () => {
  it("a $0 orchestrated run persists the exact event sequence; replay matches; snapshot frozen with content + doc ids", async () => {
    const runId = crypto.randomUUID();
    const streamed: Array<{ seq: number; type: string }> = [];
    const sink = new PgRunEventSink(runId, (e) => {
      streamed.push({ seq: e.seq, type: e.type });
    });

    const result = await askWithLimits("What happened in Kherson this week?", USER, {
      idempotencyKey: crypto.randomUUID(),
      sink,
      runId,
    });
    await sink.emit("run.completed", { result });

    // exact sequence (lexical_partial fires iff the keyword pass found rows —
    // assert its position when present)
    const types = streamed.map((e) => e.type);
    expect(types[0]).toBe("run.created");
    expect(types[1]).toBe("run.authorized");
    expect(types[types.length - 1]).toBe("run.completed");
    expect(types).toContain("retrieval.completed");
    const iPartial = types.indexOf("retrieval.lexical_partial");
    const iRetr = types.indexOf("retrieval.completed");
    if (iPartial !== -1) expect(iPartial).toBeLessThan(iRetr);
    const iRerank = types.findIndex((t) => t === "rerank.completed" || t === "rerank.skipped");
    const iAnswer = types.indexOf("answer.started");
    if (result.state === "answered") {
      expect(iRerank).toBeGreaterThan(iRetr);
      expect(iAnswer).toBeGreaterThan(iRerank);
    }
    // seqs strictly monotonic from 1
    expect(streamed.map((e) => e.seq)).toEqual(streamed.map((_, i) => i + 1));

    // replay equality (obligation 1)
    const replayed = await readRunEvents(runId);
    expect(replayed.map((e) => ({ seq: e.seq, type: e.type }))).toEqual(streamed);
    // after= filtering
    const tail = await readRunEvents(runId, streamed.length - 2);
    expect(tail.map((e) => e.seq)).toEqual([streamed.length - 1, streamed.length]);

    // snapshot (obligation: content + STABLE doc ids + selection)
    if (result.state === "answered") {
      const { rows } = await pool.query(`SELECT evidence_snapshot FROM ask_runs WHERE id = $1`, [runId]);
      const snap = rows[0]?.evidence_snapshot as {
        version: number;
        candidates: Array<{ claimId: number; text: string; sourceDocIds: number[] }>;
        selectedClaimIds: number[];
        corpusCurrentThrough: string | null;
      } | null;
      expect(snap).toBeTruthy();
      expect(snap!.version).toBe(1);
      expect(snap!.candidates.length).toBeGreaterThan(0);
      expect(snap!.candidates[0].text.length).toBeGreaterThan(10); // CONTENT, not bare ids (F11)
      expect(snap!.candidates.some((c) => c.sourceDocIds.length > 0)).toBe(true); // stable raw_documents ids
      expect(snap!.selectedClaimIds.length).toBeGreaterThan(0);
    }
  });

  it("replay/tail reads make zero provider calls and zero new events (read-only by construction)", async () => {
    const runId = crypto.randomUUID();
    const sink = new PgRunEventSink(runId);
    await sink.emit("run.created", {});
    await sink.emit("run.completed", { result: { answer: "x" } as never });

    const before = await pool.query(`SELECT count(*)::int AS n FROM ask_run_events WHERE run_id = $1`, [runId]);
    await readRunEvents(runId);
    await readRunEvents(runId, 1);
    const after = await pool.query(`SELECT count(*)::int AS n FROM ask_run_events WHERE run_id = $1`, [runId]);
    expect(after.rows[0].n).toBe(before.rows[0].n); // nothing written by reads
    await pool.query(`DELETE FROM ask_run_events WHERE run_id = $1`, [runId]);
  });

  it("p50 time-to-first-candidate (lexical partial) on production-shaped data is under the 2s target", async () => {
    const QUESTIONS = [
      "strikes in Ukraine",
      "Iran nuclear enrichment",
      "Russian officials prosecuted",
      "sanctions on Russian banks",
      "drone attacks on infrastructure",
    ];
    const samples: number[] = [];
    for (const q of QUESTIONS) {
      const t0 = performance.now();
      let ttfc: number | null = null;
      await retrieveV2(q, {
        onLexicalPartial: () => {
          ttfc = performance.now() - t0;
        },
      });
      if (ttfc !== null) samples.push(ttfc);
    }
    expect(samples.length).toBeGreaterThanOrEqual(3); // most questions hit candidates
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    console.log(
      `TTFC (lexical partial) samples ms: [${samples.map((s) => Math.round(s)).join(", ")}], p50=${Math.round(p50)}ms`,
    );
    expect(p50).toBeLessThan(2000); // Phase 2 acceptance target
  });
});
