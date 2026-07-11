// SpendGuard for the ASK embedding path — its own provider_usage ledger row and
// its own daily-cap env, isolated from the digest/map/reduce envelopes so an ASK
// backfill can neither starve nor be starved by the production pipelines. Follows
// src/lib/usage/llm-guard.ts exactly; LLM_SPRINT_USD_CAP stays the shared all-time
// backstop every OpenAI path honours (fail closed when it is unset — ruling 4).
//
// (Workstream E may consolidate this into llm-guard.ts later; kept separate here.)

import { SpendGuard, envCap, envNum, pgUsageStore } from "../usage/spend-guard";

/** provider_usage.provider for the ASK embedding calls. */
export const EMBED_PROVIDER = "openai_embed";

/** Per-day USD cap used when EMBED_USD_CAP_DAILY is unset OUTSIDE production.
 *  In production an unset cap fails closed — see embedDailyUsdCap(). */
export const EMBED_DAILY_USD_CAP_DEFAULT = 1;

// Copied from llm-guard.ts (its isProduction is not exported) so the fail-closed
// semantics are identical.
function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/** Resolved per-day USD cap for the embedding path. null => the guard fails
 *  closed: production with EMBED_USD_CAP_DAILY unset must not spend. Outside
 *  production an unset cap falls back to the documented default. */
export function embedDailyUsdCap(): number | null {
  return envCap("EMBED_USD_CAP_DAILY") ?? (isProduction() ? null : EMBED_DAILY_USD_CAP_DEFAULT);
}

/** Guard for the ASK embedding calls. Daily/total caps live in provider_usage so
 *  they hold across serverless invocations; the run cap bounds one process. */
export function embedGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: EMBED_PROVIDER,
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      dailyUsdCap: embedDailyUsdCap(),
      dailyRequestCap: envNum("EMBED_DAILY_REQUEST_CAP", 2000),
      runRequestCap: envNum("EMBED_RUN_REQUEST_CAP", 500),
    },
    pgUsageStore,
  );
}
