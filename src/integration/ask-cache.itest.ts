import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// AI Search Phase 4: the exact answer cache on REAL Postgres — store/lookup
// roundtrip, per-user isolation, corpus-version invalidation (F11), and the
// end-to-end $0 cache-hit through askWithLimits. $0 by construction: paid keys
// scrubbed, the stored pipeline is never re-run on a hit and the miss path
// degrades to the deterministic stub.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}

const { runMigrations } = await import("../../scripts/migrations-lib");
const { cacheKey, cacheLookup, cacheStore, corpusVersion, normalizeQuestion } = await import(
  "@/lib/ask/cache"
);
const { askWithLimits } = await import("@/lib/ask/limits");
const { PgRunEventSink } = await import("@/lib/ask/events");
import type { AskAnswerV2 } from "@/lib/ask/types";
import type { EvidenceSnapshot } from "@/lib/ask/events";

const USER = "itest-cache@x.test";
let pool: Pool;

async function cleanup() {
  await pool.query(`DELETE FROM ask_answer_cache WHERE user_email LIKE 'itest-cache%'`);
  await pool.query(`DELETE FROM ask_run_events WHERE run_id IN (SELECT id FROM ask_runs WHERE user_email LIKE 'itest-cache%')`);
  await pool.query(`DELETE FROM ask_allowance_reservations WHERE user_email LIKE 'itest-cache%'`);
  await pool.query(`DELETE FROM ask_usage WHERE user_email LIKE 'itest-cache%'`);
  await pool.query(`DELETE FROM ask_runs WHERE user_email LIKE 'itest-cache%'`);
}

const RESULT: AskAnswerV2 = {
  answer: "Cached answer [c7].",
  citedClaimIds: [7],
  evidenceCount: 1,
  terms: ["strike"],
  provider: "openai:gpt-5",
  state: "answered",
  relatedClaimIds: [],
  window: null,
  totalMatching: 1,
  sampled: false,
  retrievalMode: "v2",
};

const SNAPSHOT: EvidenceSnapshot = {
  version: 1,
  retrievalMode: "v2",
  window: null,
  totalMatching: 1,
  candidatesCount: 1,
  corpusCurrentThrough: "2026-07-18",
  candidates: [
    { claimId: 7, text: "Snapshot claim text.", hedging: "confirmed", claimDate: "2026-07-15", countryIso2: "ua", track: null, confidence: null, sourceDocIds: [] },
  ],
  selectedClaimIds: [7],
};

beforeAll(async () => {
  await runMigrations(URL!);
  pool = new Pool({ connectionString: URL });
  await cleanup();
});

afterAll(async () => {
  delete process.env.ASK_EXACT_CACHE;
  delete process.env.ASK_RUNS_ENFORCE;
  delete process.env.ASK_CONTENT_RETENTION_DAYS;
  delete process.env.ASK_PROGRESSIVE;
  delete process.env.ASK_CACHE_TTL_DAYS;
  await cleanup();
  await pool.end();
});

describe("exact cache on real Postgres (Phase 4)", () => {
  it("store → lookup roundtrip; hit accounting increments; per-user isolation holds", async () => {
    const corpus = await corpusVersion(pool);
    const key = cacheKey({ question: "What strikes happened?", window: null, corpusVersion: corpus });
    await cacheStore({ userEmail: USER, key, corpusVersion: corpus, question: "What strikes happened?", result: RESULT, snapshot: SNAPSHOT });

    const hit = await cacheLookup(USER, key);
    expect(hit?.result.answer).toBe("Cached answer [c7].");
    expect(hit?.snapshot.candidates[0]?.text).toBe("Snapshot claim text.");

    const { rows } = await pool.query(
      `SELECT hit_count FROM ask_answer_cache WHERE user_email = $1 AND cache_key = $2`,
      [USER, key],
    );
    expect((rows[0] as { hit_count: number }).hit_count).toBe(1);

    // another user NEVER sees this entry (strict per-user isolation)
    expect(await cacheLookup("itest-cache-other@x.test", key)).toBeNull();
  });

  it("a corpus-version bump (simulated digest regeneration) misses — F11 invalidation", async () => {
    const corpus = await corpusVersion(pool);
    const keyBefore = cacheKey({ question: "Corpus bump question?", window: null, corpusVersion: corpus });
    await cacheStore({ userEmail: USER, key: keyBefore, corpusVersion: corpus, question: "Corpus bump question?", result: RESULT, snapshot: SNAPSHOT });
    expect(await cacheLookup(USER, keyBefore)).not.toBeNull();

    // regeneration replaces claim rows -> max(id)/count move -> a NEW key
    const bumped = `${Number(corpus.split(":")[0]) + 100}:${corpus.split(":")[1]}`;
    const keyAfter = cacheKey({ question: "Corpus bump question?", window: null, corpusVersion: bumped });
    expect(keyAfter).not.toBe(keyBefore);
    expect(await cacheLookup(USER, keyAfter)).toBeNull(); // the stale entry cannot serve
  });

  it("end-to-end $0 hit through askWithLimits (enforce mode): stored payload returns, no pipeline, snapshot re-persisted onto the new run", async () => {
    process.env.ASK_RUNS_ENFORCE = "1";
    process.env.ASK_EXACT_CACHE = "1";
    // release hardening: the cache stack requires retention + progressive + TTL
    process.env.ASK_CONTENT_RETENTION_DAYS = "30";
    process.env.ASK_PROGRESSIVE = "1";
    process.env.ASK_CACHE_TTL_DAYS = "7";
    process.env.ASK_GLOBAL_DAILY_BUDGET_USD = "1000";
    const question = "Itest cache end to end question";
    const corpus = await corpusVersion(pool);
    const key = cacheKey({ question, window: null, corpusVersion: corpus });
    await cacheStore({ userEmail: USER, key, corpusVersion: corpus, question, result: RESULT, snapshot: SNAPSHOT });

    const sink = new PgRunEventSink(crypto.randomUUID(), pool);
    void sink; // progressive machinery not needed for the hit path
    const res = await askWithLimits(question, USER, { idempotencyKey: `itc-${Date.now()}` });

    expect(res.cacheStatus).toBe("exact");
    expect(res.answer).toBe("Cached answer [c7].");
    expect(res.runId).toBeTruthy();

    // $0: the usage row records zero cost; the run finalized with the cached state
    const { rows: usage } = await pool.query(
      `SELECT cost_usd FROM ask_usage WHERE user_email = $1 AND question = $2 ORDER BY id DESC LIMIT 1`,
      [USER, question],
    );
    expect(Number((usage[0] as { cost_usd: number }).cost_usd)).toBe(0);
    const { rows: run } = await pool.query(
      `SELECT state, units, evidence_snapshot FROM ask_runs WHERE id = $1`,
      [res.runId],
    );
    expect((run[0] as { state: string }).state).toBe("answered");
    // Phase 7: a cache hit settles ZERO analysis units (§9.5)
    expect((run[0] as { units: number }).units).toBe(0);
    // the frozen snapshot landed on THIS run's row (cache-hit hydration source)
    expect((run[0] as { evidence_snapshot: EvidenceSnapshot | null }).evidence_snapshot?.candidates[0]?.text).toBe(
      "Snapshot claim text.",
    );
    // and zero provider reservations were created for this run (no paid stage ran)
    const { rows: resv } = await pool.query(
      `SELECT count(*)::int AS n FROM provider_usage_reservations WHERE run_id = $1`,
      [res.runId],
    );
    expect((resv[0] as { n: number }).n).toBe(0);
  });

  it("normalized question variants share one entry", async () => {
    const corpus = await corpusVersion(pool);
    const a = cacheKey({ question: "  What   HAPPENED in kherson?? ", window: null, corpusVersion: corpus });
    const b = cacheKey({ question: "what happened in kherson", window: null, corpusVersion: corpus });
    expect(normalizeQuestion("  What   HAPPENED in kherson?? ")).toBe("what happened in kherson");
    expect(a).toBe(b);
  });
});
