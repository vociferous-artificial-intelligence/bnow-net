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

/** Per-day USD cap used when LLM_DIGEST_USD_CAP is unset OUTSIDE production.
 *  In production an unset cap fails closed — see llmDailyUsdCap(). */
export const DIGEST_DAILY_USD_CAP_DEFAULT = 2;

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
  constructor(reason: string) {
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
