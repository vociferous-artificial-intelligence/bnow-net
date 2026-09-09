// Analysis-eval control plane, C3: the LIVE eval runner's SpendGuard.
//
// Own provider row PER VENDOR (openai_eval, anthropic_eval) so eval spend
// never blends into any production ledger and never blends two vendors
// together. Template: reduceGuardFromEnv (src/lib/usage/llm-guard.ts), with
// ONE deliberate difference — there is NO out-of-production default for the
// daily cap. An eval run is always an operator act, so EVAL_USD_CAP_DAILY
// unset means the guard refuses EVERYWHERE (standing ruling 4's fail-closed
// contract, applied strictly). The all-time backstop stays the shared
// LLM_SPRINT_USD_CAP every paid path honours.
//
// No existing guard is touched by this module.

import { SpendGuard, envCap, envNum, pgUsageStore } from "../usage/spend-guard";
import type { AnalysisProviderId } from "../llm/providers";

/** provider_usage.provider for live analysis-eval dispatches, PER VENDOR.
 *
 *  One row each, for the reason every other row in the ledger is separate: a
 *  vendor's eval spend must be readable on its own, and one vendor's budget
 *  stop must not be indistinguishable from another's. They share the cap
 *  ENVELOPE (EVAL_USD_CAP_DAILY + LLM_SPRINT_USD_CAP, both campaign-local and
 *  never in Vercel) but not the counters — pgUsageStore.load filters
 *  WHERE provider = $1, so each row gets its own full day allowance. */
export const EVAL_PROVIDER_ROWS: Record<AnalysisProviderId, string> = {
  openai: "openai_eval",
  anthropic: "anthropic_eval",
  openai_compatible: "openai_compatible_eval",
};

/** The historical row name. Kept as the OpenAI row's constant so every
 *  existing reference (reports, ledger reads, the exposure ledger) still names
 *  the same string. */
export const EVAL_PROVIDER = EVAL_PROVIDER_ROWS.openai;

export function evalGuardFromEnv(provider: AnalysisProviderId = "openai"): SpendGuard {
  return new SpendGuard(
    {
      provider: EVAL_PROVIDER_ROWS[provider],
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      // strict: unset ANYWHERE -> null -> tryReserve refuses (daily_usd_unset)
      dailyUsdCap: envCap("EVAL_USD_CAP_DAILY"),
      dailyRequestCap: envNum("EVAL_DAILY_REQUEST_CAP", 300),
      runRequestCap: envNum("EVAL_RUN_REQUEST_CAP", 200),
    },
    pgUsageStore,
  );
}
