// The conflict SHADOW matcher — the one module in src/lib/conflicts that may
// reach the provider (PLAN-WS-3 §3.4b, memo C12/N1).
//
// Everything else in this package is pure by contract, and
// matcher-import-hygiene.test.ts is what keeps it that way; this file is the
// single named exemption, so the paid surface of the whole conflict layer is
// one file and one function.
//
// FOUR REFUSALS BEFORE ANY MONEY, in this order — each one earlier than the
// last, which is the point:
//
//   1. NO ROUTE AT ALL. No `OPENAI_API_KEY`, `ANALYSIS_PROVIDER=stub`, or
//      `LLM_DISABLE=1` -> null, and the caller uses the keyword matcher
//      directly. Ruling 9's site-specific degrade: the same shape as
//      llm-match.ts:248-255, because losing the conflict day entirely would be
//      worse than losing its LLM assist.
//   2. NO CAP -> NO RUNG. `CONFLICT_MATCH_USD_CAP_DAILY` absent -> null,
//      BEFORE a SpendGuard is built, before `guard.init()` reads the database,
//      and before any client could be constructed. This is the RESTING STATE of
//      this window: the cap does not exist in any Vercel environment, so the
//      paid rung is unreachable even if the route were scheduled. Setting the
//      cap in all three environments is the ruling-4 ordering step that
//      precedes adding the cron line (WS-3.6).
//   3. CONFIGURATION FAILS CLOSED. `workloadDispatchConfig("validation")`
//      refuses an invalid effort, an unpriced model, or a (workload, model,
//      effort) with no analysis-reg-v1 approval — before any reservation and
//      before any client (ruling 4's configuration clause).
//   4. THE GUARD. Every round reserves; a refusal THROWS the round away, and
//      the LlmCompatibleMatcher treats a thrown round exactly as production
//      treats a failed vote — discarded, never repaired. Zero usable rounds
//      lands on the keyword rung, honestly labeled.
//
// The client is constructed LAZILY, inside the vote function, AFTER a
// successful reservation: a matcher that never gets to spend never builds one.
//
// The ledger row is `llm_conflict_match`, never production's `llm_match`
// (memo C12) — a shadow budget stop must not starve production validation —
// and never `openai_eval`, which would drag src/lib/evals into a cron route's
// module graph and break the eval-library isolation contract.

import { analysisOpenAiClient } from "../analysis/openai-client";
import {
  dispatchIdentity,
  workloadDispatchConfig,
  type AnalysisDispatchConfig,
  type AnalysisDispatchIdentity,
} from "../llm/model-config";
import { gazetteerFor } from "../validation/gazetteer";
import { MATCH_VOTES_DEFAULT, dispatchMatchVote } from "../validation/llm-match";
import { conflictMatchGuardFromEnv, isLlmDisabled } from "../usage/llm-guard";
import { envCap } from "../usage/spend-guard";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { LlmCompatibleMatcher } from "./llm-compatible-matcher";
import type { ConflictMatcher } from "./match-contract";

export interface LiveMatcher {
  matcher: ConflictMatcher;
  /** the dispatch identity of the rung that MAY have spent — recorded on the
   *  observation so a row scored by a paid rung names the exact model, effort,
   *  registry version and approval status that produced it */
  dispatch: AnalysisDispatchIdentity;
}

/** Why the live matcher was not built. Returned rather than logged-and-lost so
 *  the pipeline can put it in the cron counts: "the paid rung did not run" and
 *  "the paid rung ran and found nothing" are different operational facts. */
export type LiveMatcherRefusal =
  | "no_api_key"
  | "stub_provider"
  | "llm_disabled"
  | "daily_usd_cap_unset"
  | "dispatch_config_refused";

export type LiveMatcherResult =
  | { ok: true; live: LiveMatcher }
  | { ok: false; reason: LiveMatcherRefusal };

/**
 * Build the conflict shadow matcher for one reference series, or explain why
 * not. `series` is a `gazetteerFor` key (`roca` / `iran_update`) — the keyword
 * fallback must score under the series' OWN vocabulary, or a fully degraded
 * Iran day would be scored against the RU/UA gazetteer and read as a coverage
 * failure rather than a vocabulary mismatch.
 *
 * `MATCH_VOTES` and `MATCHER_MODE` are deliberately NOT read: k is
 * `MATCH_VOTES_DEFAULT` (ruling 18's validated K=5), so an operator knob aimed
 * at production validation cannot silently change the shadow soak's
 * configuration identity mid-soak.
 */
export async function createLiveMatcher(series: string): Promise<LiveMatcherResult> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "no_api_key" };
  if (process.env.ANALYSIS_PROVIDER === "stub") return { ok: false, reason: "stub_provider" };
  if (isLlmDisabled()) return { ok: false, reason: "llm_disabled" };
  // refusal 2: before the guard exists, before init() touches the database,
  // before any client could be constructed
  if (envCap("CONFLICT_MATCH_USD_CAP_DAILY") === null) {
    return { ok: false, reason: "daily_usd_cap_unset" };
  }

  let dispatch: AnalysisDispatchConfig;
  try {
    dispatch = workloadDispatchConfig("validation");
  } catch {
    // fail-closed configuration: degrade like every other llm-match failure so
    // the keyword rung still scores the day (ruling 9)
    return { ok: false, reason: "dispatch_config_refused" };
  }

  const guard = conflictMatchGuardFromEnv();
  await guard.init();

  let client: ReturnType<typeof analysisOpenAiClient> | null = null;
  const matcher = new LlmCompatibleMatcher({
    votesK: MATCH_VOTES_DEFAULT,
    model: dispatch.model,
    keywordFallback: new ConflictKeywordMatcher(gazetteerFor(series)),
    voteFn: async (_round, prompt) => {
      const reservation = guard.tryReserve();
      if (!reservation.ok) throw new Error(reservation.reason);
      // lazy, post-reservation construction
      client ??= analysisOpenAiClient();
      // the adapter owns the prompt pair (it is the production
      // MATCH_SYSTEM_PROMPT + buildMatchUserPrompt); pass it through verbatim
      const { raw } = await dispatchMatchVote(client, guard, dispatch, prompt);
      return raw;
    },
  });

  return { ok: true, live: { matcher, dispatch: dispatchIdentity(dispatch) } };
}
