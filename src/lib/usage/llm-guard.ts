// Global LLM controls shared by every OpenAI call site: a kill-switch, the
// gpt-4o-mini price table, and the digest path's SpendGuard.
//
// Before this module the digest extract call — ~98% of true LLM spend
// (docs/reviews/PIPELINE-AUDIT-2026-07.md §7c) — wrote nothing to provider_usage
// and passed no guard: OPENAI_API_KEY alone enabled uncapped spend.

import { SpendGuard, envCap, envNum, pgUsageStore } from "./spend-guard";

/** provider_usage.provider for the digest extract call (audit Site A). */
export const DIGEST_PROVIDER = "openai_digest";

/** provider_usage.provider for the entity-audit route (audit Site D). Its own row
 *  so the digest ledger stays a clean measure of the digest path, even though both
 *  draw on the one LLM_DIGEST_USD_CAP per-day envelope. */
export const ENTITY_AUDIT_PROVIDER = "openai_entity_audit";

/** provider_usage.provider for the shadow map stage's extract calls. Its own
 *  ledger row AND its own daily-cap env (MAP_USD_CAP_DAILY) — never shared with
 *  LLM_DIGEST_USD_CAP, so a map backfill can neither starve nor be starved by
 *  the production digest path. */
export const MAP_PROVIDER = "openai_map";

/** Per-day USD cap used when LLM_DIGEST_USD_CAP is unset OUTSIDE production.
 *  In production an unset cap fails closed — see llmDailyUsdCap(). */
export const DIGEST_DAILY_USD_CAP_DEFAULT = 2;

/** Per-day USD cap used when MAP_USD_CAP_DAILY is unset OUTSIDE production. */
export const MAP_DAILY_USD_CAP_DEFAULT = 3;

/** Output-token ceiling for the digest extract call. Measured outputs are
 *  <= 1,448 pretty-JSON tokens (audit §4c); 4096 is ~3x headroom and caps a
 *  truncated-and-discarded response at 1/4 of gpt-4o-mini's 16,384 default. */
export const DIGEST_MAX_OUTPUT_TOKENS_DEFAULT = 4096;

/** Thrown by every LLM call site when LLM_DISABLE=1. */
export class LlmDisabledError extends Error {
  readonly code = "LLM_DISABLED";
  constructor(site: string) {
    super(`llm: LLM_DISABLE=1 — ${site} refused`);
    this.name = "LlmDisabledError";
  }
}

/** Thrown when a SpendGuard refuses a reservation. Distinct from provider
 *  errors so callers never mistake a budget stop for a retryable failure. */
export class LlmBudgetError extends Error {
  readonly code = "LLM_BUDGET";
  constructor(
    /** the raw refusal reason (additive, Gate 5: callers logging the reason
     *  keep exact pre-gateway log wording) */
    public readonly reason: string,
  ) {
    super(`llm: budget stop — ${reason}`);
    this.name = "LlmBudgetError";
  }
}

export function isLlmDisabled(): boolean {
  return process.env.LLM_DISABLE === "1";
}

export function assertLlmEnabled(site: string): void {
  if (isLlmDisabled()) throw new LlmDisabledError(site);
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

// gpt-4o-mini list price, VERIFIED 2026-07-09 (audit §7): $0.15 in / $0.60 out per 1M.
export const USD_PER_PROMPT_TOKEN = 0.15 / 1e6;
export const USD_PER_COMPLETION_TOKEN = 0.6 / 1e6;

export function estimateUsd(promptTokens: number, completionTokens: number): number {
  return promptTokens * USD_PER_PROMPT_TOKEN + completionTokens * USD_PER_COMPLETION_TOKEN;
}

/** Resolved per-day USD cap for the unmetered-until-now OpenAI paths (digest
 *  extract, entity audit). null => the guard fails closed: production with
 *  LLM_DIGEST_USD_CAP unset must not spend. Outside production an unset cap falls
 *  back to the documented default so local runs and tests work. */
export function llmDailyUsdCap(): number | null {
  return envCap("LLM_DIGEST_USD_CAP") ?? (isProduction() ? null : DIGEST_DAILY_USD_CAP_DEFAULT);
}

export function digestMaxOutputTokens(): number {
  return envNum("LLM_DIGEST_MAX_OUTPUT_TOKENS", DIGEST_MAX_OUTPUT_TOKENS_DEFAULT);
}

/** One guard instance per LLM call — the daily and total caps live in
 *  provider_usage, so they hold across serverless invocations; runRequestCap
 *  therefore just says how many requests one reservation cycle may buy. */
function openAiGuard(provider: string, dailyRequestCap: number, runRequestCap: number): SpendGuard {
  return new SpendGuard(
    {
      provider,
      // all-time backstop: the same sprint ceiling llm_match already honours
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      dailyUsdCap: llmDailyUsdCap(),
      dailyRequestCap,
      runRequestCap,
    },
    pgUsageStore,
  );
}

/** Guard for the digest extract call — the ~98% of LLM spend that had none. */
export function digestGuardFromEnv(): SpendGuard {
  return openAiGuard(
    DIGEST_PROVIDER,
    envNum("LLM_DIGEST_DAILY_REQUEST_CAP", 400),
    envNum("LLM_DIGEST_RUN_REQUEST_CAP", 1),
  );
}

/** Guard for the unscheduled entity-audit route, whose single prompt grows with
 *  the entity graph and was never metered (audit §7a site D, §12 #2). */
export function entityAuditGuardFromEnv(): SpendGuard {
  return openAiGuard(
    ENTITY_AUDIT_PROVIDER,
    envNum("LLM_ENTITY_AUDIT_DAILY_REQUEST_CAP", 10),
    envNum("LLM_ENTITY_AUDIT_RUN_REQUEST_CAP", 1),
  );
}

/** Resolved per-day USD cap for the map worker. Same fail-closed contract as the
 *  digest cap, but its OWN env var: production with MAP_USD_CAP_DAILY unset must
 *  not map. */
export function mapDailyUsdCap(): number | null {
  return envCap("MAP_USD_CAP_DAILY") ?? (isProduction() ? null : MAP_DAILY_USD_CAP_DEFAULT);
}

/** Guard for the map worker. One instance per run (the worker makes many calls
 *  per run, unlike the digest's one-reservation cycle); daily/total caps are
 *  DB-backed so they hold across runs regardless. LLM_SPRINT_USD_CAP stays the
 *  all-time backstop every OpenAI path honours. */
export function mapGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: MAP_PROVIDER,
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      dailyUsdCap: mapDailyUsdCap(),
      dailyRequestCap: envNum("MAP_DAILY_REQUEST_CAP", 1500),
      runRequestCap: envNum("MAP_RUN_REQUEST_CAP", 80),
    },
    pgUsageStore,
  );
}

/** provider_usage.provider for the reduce synthesis calls (MR sprint 3). Its own
 *  ledger row AND its own daily-cap env, isolated from the digest and map
 *  envelopes for the same reason MAP_USD_CAP_DAILY is: an A/B backfill must
 *  neither starve nor be starved by the other pipelines. */
export const REDUCE_PROVIDER = "openai_reduce";

/** Per-day USD cap used when REDUCE_USD_CAP_DAILY is unset OUTSIDE production. */
export const REDUCE_DAILY_USD_CAP_DEFAULT = 2;

/** Resolved per-day USD cap for the reduce synthesis — fail-closed in
 *  production when REDUCE_USD_CAP_DAILY is unset (standing ruling 4). */
export function reduceDailyUsdCap(): number | null {
  return envCap("REDUCE_USD_CAP_DAILY") ?? (isProduction() ? null : REDUCE_DAILY_USD_CAP_DEFAULT);
}

/** Output-token ceiling for one synthesis vote: <=12 events of title+summary+
 *  claims over group ids — comfortably under 6K; capped so a truncated vote
 *  can never bill gpt-4o-mini's full 16,384 default. */
export function reduceMaxOutputTokens(): number {
  const v = Number(process.env.REDUCE_MAX_OUTPUT_TOKENS);
  const n = Number.isFinite(v) && v >= 1000 ? Math.floor(v) : 6000;
  return Math.min(16_384, n);
}

/** Guard for the reduce synthesis (K votes per digest = several calls per run). */
export function reduceGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: REDUCE_PROVIDER,
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      dailyUsdCap: reduceDailyUsdCap(),
      dailyRequestCap: envNum("REDUCE_DAILY_REQUEST_CAP", 500),
      runRequestCap: envNum("REDUCE_RUN_REQUEST_CAP", 40),
    },
    pgUsageStore,
  );
}

// ---------- ASK (/ask) paid-stage guard (Tier-2+ sprint, 2026-07-11) ----------
// The /ask money path has TWO independent gates. The FIRST is the ask-specific
// daily budget + per-user question cap in src/lib/ask/limits.ts (evaluateAllowance),
// which runs once per question before the pipeline starts. This — askGuardFromEnv —
// is the SECOND gate: a SpendGuard on provider "openai_ask" that every paid ASK
// stage (embed / rerank / answer, wired inside the stages by workstreams C and D)
// passes via tryReserve() BEFORE its call, so spend fails closed at the provider
// level even if the first gate's cost estimate lags. Own provider_usage row and own
// daily-cap env, isolated from the digest/map/reduce/embed envelopes.

/** provider_usage.provider for every paid /ask stage call. */
export const ASK_PROVIDER = "openai_ask";

/** Per-day USD cap used when ASK_USD_CAP_DAILY is unset OUTSIDE production.
 *  In production an unset cap fails closed — see askDailyUsdCap(). */
export const ASK_DAILY_USD_CAP_DEFAULT = 2;

/** Resolved per-day USD cap for the ASK path. null => the guard fails closed:
 *  production with ASK_USD_CAP_DAILY unset must not spend (standing ruling 4).
 *  Outside production an unset cap falls back to the documented default. */
export function askDailyUsdCap(): number | null {
  return envCap("ASK_USD_CAP_DAILY") ?? (isProduction() ? null : ASK_DAILY_USD_CAP_DEFAULT);
}

/** Guard shared by the ASK embed/rerank/answer stages (several calls per question,
 *  so the run cap bounds one question's pipeline). Daily/total caps live in
 *  provider_usage so they hold across serverless invocations; LLM_SPRINT_USD_CAP
 *  stays the shared all-time backstop every OpenAI path honours. */
export function askGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: ASK_PROVIDER,
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      dailyUsdCap: askDailyUsdCap(),
      dailyRequestCap: envNum("ASK_DAILY_REQUEST_CAP", 500),
      runRequestCap: envNum("ASK_RUN_REQUEST_CAP", 10),
    },
    pgUsageStore,
  );
}
