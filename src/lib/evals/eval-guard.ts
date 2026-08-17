// Analysis-eval control plane, C3: the LIVE eval runner's SpendGuard.
//
// Own provider row (openai_eval) so eval spend never blends into any
// production ledger. Template: reduceGuardFromEnv (src/lib/usage/llm-guard.ts),
// with ONE deliberate difference — there is NO out-of-production default for
// the daily cap. An eval run is always an operator act, so EVAL_USD_CAP_DAILY
// unset means the guard refuses EVERYWHERE (standing ruling 4's fail-closed
// contract, applied strictly). The all-time backstop stays the shared
// LLM_SPRINT_USD_CAP every OpenAI path honours.
//
// No existing guard is touched by this module.

import { SpendGuard, envCap, envNum, pgUsageStore } from "../usage/spend-guard";

/** provider_usage.provider for live analysis-eval dispatches. */
export const EVAL_PROVIDER = "openai_eval";

export function evalGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: EVAL_PROVIDER,
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      // strict: unset ANYWHERE -> null -> tryReserve refuses (daily_usd_unset)
      dailyUsdCap: envCap("EVAL_USD_CAP_DAILY"),
      dailyRequestCap: envNum("EVAL_DAILY_REQUEST_CAP", 300),
      runRequestCap: envNum("EVAL_RUN_REQUEST_CAP", 200),
    },
    pgUsageStore,
  );
}
