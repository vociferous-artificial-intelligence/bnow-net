import { Pool } from "@neondatabase/serverless";
import { ask, type AskAnswer } from "./answer";
import type { AskAnswerV2 } from "./types";
import {
  createAskRunMeta,
  monotonicMs,
  recordStage,
  type AskRunMeta,
  type StageTimings,
} from "./timings";

// /ask spend control: an authenticated user could otherwise run up LLM cost with
// unlimited questions. This is the FIRST of two gates on the /ask money path:
//   ASK_USER_DAILY_LIMIT        questions per user per UTC day (default 100)
//   ASK_GLOBAL_DAILY_BUDGET_USD LLM spend across all users per UTC day (default $10)
// The SECOND gate is askGuardFromEnv() (provider "openai_ask") in
// src/lib/usage/llm-guard.ts, enforced INSIDE each paid stage (embed/rerank/answer)
// via SpendGuard.tryReserve() before its call.
// Every question is logged to ask_usage (per-user rows double as billing data).
// ask_usage.cost_usd is the TOTAL question cost across ALL stages, so the
// global-budget SUM(cost_usd) query below keeps covering the whole pipeline.

export interface Allowance {
  allowed: boolean;
  reason: "ok" | "user_limit" | "global_budget";
  userCountToday: number;
  globalCostToday: number;
}

export function userDailyLimit(): number {
  const n = Number(process.env.ASK_USER_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function globalDailyBudgetUsd(): number {
  const n = Number(process.env.ASK_GLOBAL_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/** Pure decision given today's usage. Exported for tests. */
export function evaluateAllowance(
  userCountToday: number,
  globalCostToday: number,
  limit: number,
  budgetUsd: number,
): Allowance {
  if (userCountToday >= limit)
    return { allowed: false, reason: "user_limit", userCountToday, globalCostToday };
  if (globalCostToday >= budgetUsd)
    return { allowed: false, reason: "global_budget", userCountToday, globalCostToday };
  return { allowed: true, reason: "ok", userCountToday, globalCostToday };
}

// List price per 1M tokens. gpt-5 family added for the Tier-2+ ASK pipeline;
// gpt-4o entries retained; unknown models fall back to a conservative over-estimate.
const PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.125, out: 1 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICES_PER_MTOK[model] ?? { in: 5, out: 15 };
  return (promptTokens * p.in + completionTokens * p.out) / 1_000_000;
}

export function limitMessage(a: Allowance, limit: number): string {
  return a.reason === "user_limit"
    ? `Daily question limit reached (${limit}/day). Your allowance resets at midnight UTC — or contact us to raise it.`
    : "The shared daily analysis budget is exhausted. It resets at midnight UTC; please try again tomorrow.";
}

// The pipeline may return a complete AskAnswerV2 (v2 path) or a legacy AskAnswer
// (pre-v2 / degraded path) whose v2-only fields are absent. Model that reality so
// the reads below are honestly optional, not casts that pretend absent fields exist.
type RawAskResult = AskAnswer &
  Partial<
    Pick<
      AskAnswerV2,
      | "state"
      | "relatedClaimIds"
      | "window"
      | "totalMatching"
      | "sampled"
      | "retrievalMode"
      | "usageByStage"
      | "rerankUsed"
      | "candidatesCount"
      | "rerankModel"
      | "answerModel"
      | "dataCurrentThrough"
    >
  >;

/** Fill the neutral v2 values (types.ts contract) so callers always get a complete
 *  AskAnswerV2, whatever shape ask() returned. */
function normalizeV2(raw: RawAskResult): AskAnswerV2 {
  return {
    answer: raw.answer,
    citedClaimIds: raw.citedClaimIds,
    evidenceCount: raw.evidenceCount,
    terms: raw.terms,
    provider: raw.provider,
    state: raw.state ?? "answered",
    relatedClaimIds: raw.relatedClaimIds ?? [],
    window: raw.window ?? null,
    totalMatching: raw.totalMatching ?? raw.evidenceCount,
    sampled: raw.sampled ?? false,
    retrievalMode: raw.retrievalMode ?? "legacy",
    usage: raw.usage,
    usageByStage: raw.usageByStage,
    rerankUsed: raw.rerankUsed,
    // additive (W1): surfaced to the UI so the insufficient/no-coverage callout can
    // state data currency; undefined on the legacy path and when the read was null.
    dataCurrentThrough: raw.dataCurrentThrough,
  };
}

/** Total question cost across every paid stage. When the per-stage breakdown is
 *  present, sum embed+rerank+answer; the answer stage is NOT also folded in via
 *  usage (D reports stage cost only in usageByStage, so no double counting). When
 *  usageByStage is absent (legacy path), fall back to the answer-stage usage cost. */
export function totalCostUsd(r: {
  usage?: { costUsd: number };
  usageByStage?: { embed?: { costUsd: number }; rerank?: { costUsd: number }; answer?: { costUsd: number } };
}): number {
  const s = r.usageByStage;
  if (s) {
    return (s.embed?.costUsd ?? 0) + (s.rerank?.costUsd ?? 0) + (s.answer?.costUsd ?? 0);
  }
  return r.usage?.costUsd ?? 0;
}

function limitAnswer(message: string): AskAnswerV2 {
  return {
    answer: message,
    citedClaimIds: [],
    evidenceCount: 0,
    terms: [],
    provider: "limit",
    state: "limit",
    relatedClaimIds: [],
    window: null,
    totalMatching: 0,
    sampled: false,
    retrievalMode: "legacy",
  };
}

function errorAnswer(e: unknown): AskAnswerV2 {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    answer: `Query failed: ${msg}. Evidence may have been retrieved; please try again.`,
    citedClaimIds: [],
    evidenceCount: 0,
    terms: [],
    provider: "error",
    state: "error",
    relatedClaimIds: [],
    window: null,
    totalMatching: 0,
    sampled: false,
    retrievalMode: "legacy",
  };
}

async function todayUsage(pool: Pool, email: string): Promise<{ count: number; cost: number }> {
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE user_email = $1)::int AS user_count,
       coalesce(sum(cost_usd), 0)::float AS global_cost
     FROM ask_usage
     WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`,
    [email],
  );
  return { count: rows[0].user_count, cost: rows[0].global_cost };
}

/** Log one ask_usage row. cost_usd carries the whole-pipeline total; the per-stage
 *  columns record exactly what the pipeline reported (NULL where a stage is absent).
 *  run (Phase 0) adds the run's UUID, wall-clock start, and the stage-timings JSON
 *  collected so far — including on the thrown-pipeline error row, where the timings
 *  of every stage that completed before the throw survive. */
async function logUsage(
  pool: Pool,
  email: string,
  question: string,
  r: RawAskResult,
  totalCost: number,
  run: AskRunMeta,
): Promise<void> {
  const s = r.usageByStage;
  await pool.query(
    `INSERT INTO ask_usage (
       user_email, question, provider, prompt_tokens, completion_tokens, cost_usd,
       retrieval_mode, state, rerank_model, answer_model, rerank_used,
       embed_tokens, embed_cost_usd,
       rerank_prompt_tokens, rerank_completion_tokens, rerank_cost_usd,
       answer_prompt_tokens, answer_completion_tokens, answer_cost_usd,
       candidates_count, evidence_count, total_matching, window_from, window_to,
       run_id, started_at, stage_timings_ms
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13,
       $14, $15, $16,
       $17, $18, $19,
       $20, $21, $22, $23, $24,
       $25, $26, $27::jsonb
     )`,
    [
      email,
      question.slice(0, 400),
      r.provider,
      // prompt_tokens/completion_tokens keep their historical meaning: answer-stage.
      s?.answer?.promptTokens ?? r.usage?.promptTokens ?? null,
      s?.answer?.completionTokens ?? r.usage?.completionTokens ?? null,
      totalCost,
      r.retrievalMode ?? null,
      r.state ?? null,
      r.rerankModel ?? null,
      r.answerModel ?? null,
      r.rerankUsed ?? null,
      s?.embed?.promptTokens ?? null,
      s?.embed?.costUsd ?? null,
      s?.rerank?.promptTokens ?? null,
      s?.rerank?.completionTokens ?? null,
      s?.rerank?.costUsd ?? null,
      s?.answer?.promptTokens ?? r.usage?.promptTokens ?? null,
      s?.answer?.completionTokens ?? r.usage?.completionTokens ?? null,
      s?.answer?.costUsd ?? r.usage?.costUsd ?? null,
      r.candidatesCount ?? null,
      r.evidenceCount,
      r.totalMatching ?? null,
      r.window?.from ?? null,
      r.window?.to ?? null,
      run.runId,
      run.startedAt,
      // Explicit stringify + ::jsonb cast — never rely on driver object-to-json
      // coercion for a column the entry points later patch with a jsonb || merge.
      JSON.stringify(run.timings),
    ],
  );
}

/** Patch an entry point's own timing keys onto its run's already-written row.
 *  Phase 0 contract (Gate 0: scopes must not conflate): the server action patches
 *  {hydrateMs, totalMs}; the JSON route patches {apiTotalMs}; nothing else calls
 *  this. The jsonb || merge preserves every pipeline-recorded key. Fire-and-forget
 *  fail-soft: the answer was already produced and returned — a lost patch is lost
 *  telemetry, never a lost answer (mirrors the logUsage failure stance). A runId
 *  that matches no row (e.g. the row insert itself failed) is a silent no-op. */
export async function recordEntryTimings(
  runId: string,
  patch: Partial<StageTimings>,
): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE ask_usage
       SET stage_timings_ms = coalesce(stage_timings_ms, '{}'::jsonb) || $2::jsonb
       WHERE run_id = $1`,
      [runId, JSON.stringify(patch)],
    );
  } catch (e) {
    console.warn(
      `recordEntryTimings: patch failed (telemetry only, answer unaffected): ${e instanceof Error ? e.message : e}`,
    );
  } finally {
    await pool.end();
  }
}

/** Gate + run + log. Both the /ask page and the API route go through here.
 *
 *  Phase 0 (2026-07-19): every invocation mints an AskRunMeta (run UUID + wall
 *  startedAt + monotonic stage-timings collector) threaded through ask() into the
 *  pipeline stages. Rows carry run_id/started_at/stage_timings_ms; the returned
 *  payload carries runId ONLY when a row was written (limit/gate refusals write no
 *  row and get no runId), so entry points patch exactly the rows that exist.
 *  Metering is untouched: the collector never wraps guard.tryReserve/record. */
export async function askWithLimits(
  question: string,
  userEmail: string | null,
): Promise<AskAnswerV2> {
  const email = userEmail ?? "anonymous";
  const run = createAskRunMeta();
  const t0 = monotonicMs();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let usage: { count: number; cost: number };
    try {
      usage = await todayUsage(pool, email);
    } catch (e) {
      // Gate unavailable = gate REFUSES (fail closed): if we cannot read today's
      // usage we must not run the pipeline on an unknown budget. Degrade to a
      // contract-complete error answer instead of 500ing the /ask surface.
      // No row is written on this path, so no runId is attached.
      console.warn(`askWithLimits: usage gate unavailable — refusing without ask(): ${e instanceof Error ? e.message : e}`);
      return errorAnswer(new Error("usage gate unavailable; question refused"));
    }
    const limit = userDailyLimit();
    const allowance = evaluateAllowance(usage.count, usage.cost, limit, globalDailyBudgetUsd());
    if (!allowance.allowed) {
      // First gate refused: no pipeline runs, no ask() call, no row (the refusal is
      // not a metered question). The user gets a complete AskAnswerV2.
      return limitAnswer(limitMessage(allowance, limit));
    }

    let raw: RawAskResult;
    try {
      raw = await ask(question, { timings: run.timings });
    } catch (e) {
      // ask() is designed to degrade internally (ruling 9), not throw. If it throws
      // anyway, still write ONE ask_usage row (state "error", cost 0) so the crashed
      // question increments the per-user daily count — an attacker must not get free
      // retries by crashing the pipeline. Any stage spend already landed in
      // provider_usage via the stage guards; ask_usage is the per-question ledger and
      // a thrown question produced no answer to meter, so cost_usd is 0 here.
      // The timings collected by stages that completed before the throw survive on
      // the shared collector and land on the error row.
      const errRow = errorAnswer(e);
      recordStage(run.timings, "pipelineMs", monotonicMs() - t0);
      try {
        await logUsage(pool, email, question, errRow, 0, run);
      } catch (logErr) {
        // The row is diagnostics + rate-count; losing it must not mask the ORIGINAL
        // failure the user needs reported (E adversarial review finding 2).
        console.warn(`askWithLimits: error-row insert failed: ${logErr instanceof Error ? logErr.message : logErr}`);
      }
      return { ...errRow, runId: run.runId };
    }

    // Coherent settlement: cost_usd is exactly the stages that actually ran. A
    // mid-pipeline failure (e.g. embed+rerank present, answer absent) still writes
    // one row summing only the reported stages — nothing double-counted.
    const totalCost = totalCostUsd(raw);
    recordStage(run.timings, "pipelineMs", monotonicMs() - t0);
    try {
      await logUsage(pool, email, question, raw, totalCost, run);
    } catch (logErr) {
      // The answer exists and was already paid for — return it. The lost row means
      // this question escapes the ask-budget sum; real spend stays bounded by the
      // per-stage SpendGuard caps (provider_usage recorded inside each stage).
      console.warn(`askWithLimits: usage-row insert failed (answer still returned): ${logErr instanceof Error ? logErr.message : logErr}`);
    }
    return { ...normalizeV2(raw), runId: run.runId };
  } finally {
    await pool.end();
  }
}
