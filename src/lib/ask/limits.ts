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
import {
  askRunsEnforce,
  createRun,
  expireStaleRuns,
  finalizeRun,
  reserveAllowance,
  type CreateRunResult,
} from "./runs";
import { buildAskRunGuards } from "./run-guards";
import { NULL_EVENT_SINK, persistEvidenceSnapshot, type EvidenceSnapshot, type RunEventSink } from "./events";
import { askExactCache, askRouter } from "./config";
import { cacheKey, cacheLookup, cacheStore, corpusVersion } from "./cache";
import { route, routePolicyString } from "./router";
import { analysisUnits } from "./units";
import { parseTimeWindow } from "./window";

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

// Phase 5: the price table moved into the gateway layer (src/lib/llm/
// pricing.ts — the register #53 consolidation); re-exported here so every
// historical call site keeps its import and the registry parity test keeps
// pinning the numbers.
export { estimateCostUsd } from "../llm/pricing";

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

/** Shared skeleton for the enforce-mode replay refusal payloads: zero charge,
 *  provider "duplicate" (NOT "limit" — the API route's 429 mapping keys on
 *  provider, and none of these are over-cap), `replayed: true` so entry points
 *  skip the timing patch (the runId names the ORIGINAL run's rows). */
function replayRefusal(answer: string, runId: string, state: "limit" | "error"): AskAnswerV2 {
  return {
    answer,
    citedClaimIds: [],
    evidenceCount: 0,
    terms: [],
    provider: "duplicate",
    state,
    relatedClaimIds: [],
    window: null,
    totalMatching: 0,
    sampled: false,
    retrievalMode: "legacy",
    runId,
    replayed: true,
  };
}

/** Replayed key, run still in flight. Phase 2 upgrades this into a real
 *  reconnect to the running pipeline. */
function duplicateInFlightAnswer(runId: string): AskAnswerV2 {
  return replayRefusal(
    "This exact question was just submitted and is still being processed. " +
      "The original submission will return the answer — nothing additional was charged.",
    runId,
    "limit",
  );
}

/** Replayed key whose run terminated WITHOUT a stored result (expired after a
 *  crash/timeout, or its finalize was lost). Honest copy — the original will
 *  never return anything, and this key stays bound to the failed gesture
 *  (Gate 1 finding: the previous in-flight copy falsely promised an answer,
 *  forever). A NEW submission (new gesture = new key) creates a new run. */
function expiredRunAnswer(runId: string): AskAnswerV2 {
  return replayRefusal(
    "The original submission of this question did not complete — it timed out or " +
      "was interrupted, and nothing additional was charged. Please submit the " +
      "question again.",
    runId,
    "error",
  );
}

/** Replayed key whose run's content was deleted at the owner's request
 *  (§7.7 session deletion — Phase 6/Gate 6). The run completed and was
 *  billed once; only its content is gone. */
function deletedRunAnswer(runId: string): AskAnswerV2 {
  return replayRefusal(
    "The original submission's content was deleted at the owner's request. " +
      "Nothing additional was charged. Please submit the question again if needed.",
    runId,
    "error",
  );
}

/** Replayed key whose stored question DIFFERS from the incoming one. Returning
 *  the stored answer would silently present the WRONG question's answer as this
 *  one's (Gate 1 finding); refuse honestly instead — standard idempotency-key
 *  semantics (a key binds one payload). */
function questionMismatchAnswer(runId: string): AskAnswerV2 {
  return replayRefusal(
    "This submission reused a request key that was already used for a different " +
      "question, so it was not processed and nothing was charged. Please submit " +
      "the question again.",
    runId,
    "error",
  );
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
       run_id, started_at, stage_timings_ms, route_policy
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13,
       $14, $15, $16,
       $17, $18, $19,
       $20, $21, $22, $23, $24,
       $25, $26, $27::jsonb, $28
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
      run.routePolicy ?? null,
    ],
  );
}

/** Patch an entry point's own timing keys onto its run's already-written row.
 *  Phase 0 contract (Gate 0: scopes must not conflate): the server action patches
 *  {hydrateMs, totalMs}; the JSON route patches {apiTotalMs}; nothing else calls
 *  this. The jsonb || merge preserves every pipeline-recorded key. Callers AWAIT
 *  it (a serverless response must not race the write) but it NEVER throws: the
 *  answer was already produced and returned — a lost patch is lost telemetry,
 *  never a lost answer (mirrors the logUsage failure stance). A runId that
 *  matches no row (e.g. the row insert itself failed) is a silent no-op. */
export async function recordEntryTimings(
  runId: string,
  patch: Partial<StageTimings>,
): Promise<void> {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(
        `UPDATE ask_usage
         SET stage_timings_ms = coalesce(stage_timings_ms, '{}'::jsonb) || $2::jsonb
         WHERE run_id = $1`,
        [runId, JSON.stringify(patch)],
      );
    } finally {
      // end() inside the outer catch too: a teardown rejection must not
      // propagate into the entry point after the answer was already produced
      // (Gate 0 finding — the never-throws contract has to be airtight).
      await pool.end();
    }
  } catch (e) {
    console.warn(
      `recordEntryTimings: patch failed (telemetry only, answer unaffected): ${e instanceof Error ? e.message : e}`,
    );
  }
}

/** Shadow-mode helper: a run-table write that must NEVER affect the request. */
async function shadowSafe<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`askWithLimits(shadow): ${what} failed (non-blocking): ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Finalize the run row, fail-soft in BOTH modes: the answer already exists and
 *  the reservations already settled — a lost finalize leaves the run open for
 *  the lazy expiry sweep, never a lost answer. */
async function finalizeSafe(opts: Parameters<typeof finalizeRun>[0]): Promise<void> {
  try {
    await finalizeRun(opts);
  } catch (e) {
    console.warn(`askWithLimits: finalize failed (expiry will reconcile): ${e instanceof Error ? e.message : e}`);
  }
}

/** Gate + run + log. Both the /ask page and the API route go through here.
 *
 *  Phase 0 (2026-07-19): every invocation mints an AskRunMeta (run UUID + wall
 *  startedAt + monotonic stage-timings collector) threaded through ask() into the
 *  pipeline stages. Rows carry run_id/started_at/stage_timings_ms.
 *  Metering is untouched: the collector never wraps guard.tryReserve/record.
 *
 *  Phase 1 (2026-07-19, contract:
 *  docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md), two modes:
 *  - shadow (ASK_RUNS_ENFORCE unset/0, DEFAULT): behavior byte-equivalent to
 *    Phase 0 — the legacy read-then-act allowance and synchronous SpendGuards
 *    stay authoritative; ask_runs rows are written best-effort for the soak.
 *  - enforce (=1): idempotent replay (duplicate key -> stored result, zero
 *    provider calls), atomic per-user allowance slot, and atomic per-stage
 *    provider reservations become authoritative. Run-persistence failures FAIL
 *    CLOSED. The payload carries runId whenever a persistent record exists. */
export async function askWithLimits(
  question: string,
  userEmail: string | null,
  opts?: {
    idempotencyKey?: string;
    sink?: RunEventSink;
    runId?: string;
    /** Phase 6 (sessions): a follow-up turn answered from this frozen
     *  snapshot — zero retrieval/embed; the exact cache is bypassed (a
     *  session turn is scoped to ITS snapshot, never the global cache). */
    sessionReuse?: { snapshot: EvidenceSnapshot; historyBlock?: string };
  },
): Promise<AskAnswerV2> {
  const email = userEmail ?? "anonymous";
  const run = createAskRunMeta(opts?.runId);
  // Phase 4 (ASK_ROUTER=1): consult the versioned router and RECORD its policy
  // (ask_usage.route_policy). Telemetry only — Auto is equivalence-pinned to
  // the constants the pipeline reads, so behavior is identical either way.
  if (askRouter()) {
    const policy = route({ mode: "auto" });
    if ("mode" in policy) run.routePolicy = routePolicyString(policy);
  }
  const t0 = monotonicMs();
  const enforce = askRunsEnforce();
  // Phase 2: the progressive transport's event sink. run.created/run.authorized
  // are emitted HERE (the one money path); the pipeline events come from ask();
  // the route emits the terminal event with the returned payload. NULL sink =
  // byte-identical Phase 1 behavior.
  const sink = opts?.sink ?? NULL_EVENT_SINK;
  const progressive = sink !== NULL_EVENT_SINK;
  // No client key -> the run's own UUID: unique per invocation, so it can never
  // replay (the replay-safety contract requires a client-held key).
  const idempotencyKey = opts?.idempotencyKey ?? run.runId;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let created: CreateRunResult | null = null;
    if (enforce) {
      await expireStaleRuns(); // lazy sweep, fail-soft internally
      try {
        created = await createRun({ runId: run.runId, userEmail: email, question, idempotencyKey });
      } catch (e) {
        // A run that cannot be recorded must not spend (fail closed).
        console.warn(`askWithLimits: run persistence unavailable — refusing: ${e instanceof Error ? e.message : e}`);
        return errorAnswer(new Error("run persistence unavailable; question refused"));
      }
      if (created.replayed) {
        const existing = created.run;
        // §7.7 content deletion (Phase 6 / Gate 6): a replayed key whose run's
        // content was deleted at the owner's request gets the honest deleted
        // copy — NOT the question-mismatch refusal (the question is redacted,
        // not different) and NOT the expired copy (the run completed fine).
        if (existing.question === "[deleted]") {
          return deletedRunAnswer(existing.id);
        }
        // A reused key with a DIFFERENT question never returns the stored answer
        // (Gate 1 finding) — refuse honestly, charge nothing.
        if (existing.question !== question.slice(0, 400)) {
          return questionMismatchAnswer(existing.id);
        }
        if (existing.finishedAt !== null && existing.result) {
          // Idempotent replay: the stored terminal payload, zero provider calls,
          // zero new allowance. The runId is the ORIGINAL run's id; replayed:true
          // tells the entry point not to patch the original gesture's timings.
          return { ...existing.result, runId: existing.id, replayed: true };
        }
        if (existing.finishedAt !== null || existing.expired) {
          // Terminal WITHOUT a result: the run crashed/timed out and was expired
          // (result stays NULL forever — finalize requires finished_at IS NULL).
          // The old in-flight copy falsely promised an answer (Gate 1 finding).
          return expiredRunAnswer(existing.id);
        }
        return duplicateInFlightAnswer(existing.id);
      }
    } else {
      created = await shadowSafe("createRun", () =>
        createRun({ runId: run.runId, userEmail: email, question, idempotencyKey }),
      );
      // Shadow replay detection changes NOTHING (legacy gates stay authoritative);
      // the collision is only visible in the soak telemetry.
    }
    if (progressive) await sink.emit("run.created", {});

    let usage: { count: number; cost: number };
    try {
      usage = await todayUsage(pool, email);
    } catch (e) {
      // Gate unavailable = gate REFUSES (fail closed): if we cannot read today's
      // usage we must not run the pipeline on an unknown budget. Degrade to a
      // contract-complete error answer instead of 500ing the /ask surface.
      console.warn(`askWithLimits: usage gate unavailable — refusing without ask(): ${e instanceof Error ? e.message : e}`);
      const err = errorAnswer(new Error("usage gate unavailable; question refused"));
      if (enforce) {
        await finalizeSafe({ runId: run.runId, state: "error", result: err, settledCostUsd: 0, errorClass: "gate_unavailable" });
        return { ...err, runId: run.runId };
      }
      return err;
    }
    const limit = userDailyLimit();

    if (enforce) {
      // Global daily budget: the legacy read-check, deliberately retained
      // (contract §3) — hard provider caps backstop it. userCount 0 so only the
      // global leg of evaluateAllowance applies; the user slot is atomic below.
      const globalGate = evaluateAllowance(0, usage.cost, limit, globalDailyBudgetUsd());
      if (!globalGate.allowed) {
        const refusal = limitAnswer(limitMessage(globalGate, limit));
        await finalizeSafe({ runId: run.runId, state: "limit", result: refusal, settledCostUsd: 0 });
        return { ...refusal, runId: run.runId };
      }
      const slot = await reserveAllowance({ runId: run.runId, userEmail: email, limit });
      if (slot.ok && progressive) await sink.emit("run.authorized", {});
      if (!slot.ok) {
        const refusal =
          slot.reason === "user_limit"
            ? limitAnswer(
                limitMessage(
                  { allowed: false, reason: "user_limit", userCountToday: limit, globalCostToday: usage.cost },
                  limit,
                ),
              )
            : errorAnswer(new Error("allowance gate unavailable; question refused"));
        await finalizeSafe({
          runId: run.runId,
          state: slot.reason === "user_limit" ? "limit" : "error",
          result: refusal,
          settledCostUsd: 0,
          errorClass: slot.reason === "user_limit" ? undefined : "allowance_unavailable",
        });
        return { ...refusal, runId: run.runId };
      }
    } else {
      const allowance = evaluateAllowance(usage.count, usage.cost, limit, globalDailyBudgetUsd());
      if (!allowance.allowed) {
        // First gate refused: no pipeline runs, no ask() call, no ask_usage row
        // (the refusal is not a metered question). The user gets a complete
        // AskAnswerV2; no runId in shadow mode (behavior-identical to Phase 0).
        return limitAnswer(limitMessage(allowance, limit));
      }
      if (progressive) await sink.emit("run.authorized", {});
    }

    // ---- Phase 4: per-user EXACT cache (flag-gated; default OFF) ----------------
    // Sits AFTER the allowance gates (a hit still counts as one of the user's
    // daily questions — strictly conservative, registered) and BEFORE the paid
    // pipeline: a hit costs $0 and makes zero provider calls. The stored
    // snapshot is re-persisted onto THIS run's row so hydration resolves cited
    // evidence from it (F11 — live claim ids may have churned).
    let cacheCtx: { key: string; corpus: string } | null = null;
    // Anonymous identities never touch the cache (Gate 4: with the auth gate
    // off, every visitor folds to one "anonymous" namespace — caching there
    // would pool answers across people). Session reuse turns bypass it too:
    // their answer is scoped to the SESSION's frozen snapshot.
    if (askExactCache() && userEmail !== null && !opts?.sessionReuse) {
      try {
        const corpus = await corpusVersion(pool);
        const key = cacheKey({ question, window: parseTimeWindow(question), corpusVersion: corpus });
        cacheCtx = { key, corpus };
        const hit = await cacheLookup(email, key);
        if (hit) {
          const payload: AskAnswerV2 = { ...hit.result, runId: run.runId, cacheStatus: "exact" };
          recordStage(run.timings, "pipelineMs", monotonicMs() - t0);
          try {
            // The hit's accounting row must not replay the ORIGINAL run's paid
            // stage columns (Gate 4: a $0 row asserting stage costs is
            // incoherent and double-counts in any stage aggregation). The
            // provider marker makes hit rows queryable; the payload the USER
            // sees keeps its true provider.
            const hitRow = { ...payload, provider: "cache:exact", usage: undefined, usageByStage: undefined };
            await logUsage(pool, email, question, hitRow as RawAskResult, 0, run);
          } catch (logErr) {
            console.warn(`askWithLimits: cache-hit usage row failed (answer still returned): ${logErr instanceof Error ? logErr.message : logErr}`);
          }
          await persistEvidenceSnapshot(run.runId, hit.snapshot);
          if (enforce) {
            await finalizeSafe({ runId: run.runId, state: payload.state, result: payload, settledCostUsd: 0, units: analysisUnits(payload) });
          } else if (created) {
            await shadowSafe("finalizeRun", () =>
              finalizeRun({ runId: run.runId, state: payload.state, result: payload, settledCostUsd: 0, units: analysisUnits(payload) }),
            );
          }
          return payload;
        }
      } catch (e) {
        // A cache problem is a MISS, never a failed question.
        console.warn(`askWithLimits: exact-cache path failed (running the pipeline): ${e instanceof Error ? e.message : e}`);
      }
    }

    let raw: RawAskResult;
    try {
      raw = await ask(question, {
        timings: run.timings,
        // Enforce mode: atomic reservation-backed guards, one per stage. Absent
        // (shadow/default), every stage builds its legacy SpendGuard as always.
        ...(enforce ? { guards: buildAskRunGuards(run.runId) } : {}),
        ...(progressive ? { sink, snapshotRunId: run.runId } : {}),
        ...(opts?.sessionReuse
          ? {
              reuseSnapshot: opts.sessionReuse.snapshot,
              historyBlock: opts.sessionReuse.historyBlock,
              // the reuse turn's run row still records its snapshot (F11)
              snapshotRunId: run.runId,
            }
          : {}),
      });
    } catch (e) {
      // ask() is designed to degrade internally (ruling 9), not throw. If it throws
      // anyway, still write ONE ask_usage row (state "error", cost 0) so the crashed
      // question increments the per-user daily count — an attacker must not get free
      // retries by crashing the pipeline. Any stage spend already landed in
      // provider_usage via the stage guards (enforce: settled reservations); the
      // timings collected before the throw survive on the shared collector.
      const errRow = errorAnswer(e);
      recordStage(run.timings, "pipelineMs", monotonicMs() - t0);
      try {
        await logUsage(pool, email, question, errRow, 0, run);
      } catch (logErr) {
        // The row is diagnostics + rate-count; losing it must not mask the ORIGINAL
        // failure the user needs reported (E adversarial review finding 2).
        console.warn(`askWithLimits: error-row insert failed: ${logErr instanceof Error ? logErr.message : logErr}`);
      }
      const errPayload = { ...errRow, runId: run.runId };
      if (enforce) {
        await finalizeSafe({ runId: run.runId, state: "error", result: errPayload, settledCostUsd: 0, errorClass: "pipeline_throw" });
      } else if (created) {
        await shadowSafe("finalizeRun", () =>
          finalizeRun({ runId: run.runId, state: "error", result: errPayload, settledCostUsd: 0, errorClass: "pipeline_throw" }),
        );
      }
      return errPayload;
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
    const payload = { ...normalizeV2(raw), runId: run.runId };
    if (enforce) {
      await finalizeSafe({ runId: run.runId, state: payload.state, result: payload, settledCostUsd: totalCost, units: analysisUnits(payload) });
    } else if (created) {
      await shadowSafe("finalizeRun", () =>
        finalizeRun({ runId: run.runId, state: payload.state, result: payload, settledCostUsd: totalCost, units: analysisUnits(payload) }),
      );
    }
    // ---- Phase 4: exact-cache store (flag-gated; fail-soft) ---------------------
    // Only billed ANSWERED pipeline results WITH a frozen snapshot are
    // cacheable (progressive runs persist one; snapshotless answers cannot
    // hydrate F11-safely after claim-id churn — registered bound). Stub/
    // budget/error/cancelled providers never enter the cache (truth-in-UI:
    // degraded answers must not be re-served as the real thing).
    if (cacheCtx && payload.state === "answered" && payload.provider.startsWith("openai")) {
      try {
        const { rows } = await pool.query(
          `SELECT evidence_snapshot FROM ask_runs WHERE id = $1`,
          [run.runId],
        );
        const snapshot = (rows[0] as { evidence_snapshot: EvidenceSnapshot | null } | undefined)
          ?.evidence_snapshot;
        if (snapshot) {
          await cacheStore({
            userEmail: email,
            key: cacheCtx.key,
            corpusVersion: cacheCtx.corpus,
            question,
            result: payload,
            snapshot,
          });
        }
      } catch (e) {
        console.warn(`askWithLimits: cache store skipped: ${e instanceof Error ? e.message : e}`);
      }
    }
    return payload;
  } finally {
    await pool.end();
  }
}
