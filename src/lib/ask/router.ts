// AI Search Phase 4: the pure versioned router (§8). A deterministic function
// from features to a route policy — no LLM call, no I/O beyond the same env
// config the pipeline already reads. Auto REPRODUCES today's behavior exactly
// (equivalence-pinned in router.test.ts against the very config functions the
// pipeline consumes); Fast and Deep are POLICY SHAPES ONLY and stay
// unavailable until the paid answer-model scorecard (incl. the named-person
// source-fidelity fixtures) passes — no cost/latency argument can enable a
// route by itself (§8.4 gate discipline).
//
// Phase 4 wiring (registered): with ASK_ROUTER=1 the policy is consulted and
// RECORDED per run (ask_usage.route_policy, reserved in Phase 0); the pipeline
// keeps reading its own constants, which the equivalence pin proves identical.
// Routing models THROUGH the policy object arrives with the first non-Auto
// route (post-scorecard) so flag-on stays literally behavior-identical today.

import { askAnswerModel, askCandidates, askEvidenceK, askRerankModel } from "./config";
import { ASK_ANSWER_SUITE, hasScorecard } from "./registry";

/** Mirrors answer.ts ANSWER_MAX_OUTPUT_TOKENS — NOT imported (the router must
 *  stay free of the answer module's provider graph); router.test.ts pins the
 *  two equal so they cannot drift. */
const DEFAULT_ANSWER_MAX_OUTPUT_TOKENS = 2500;

export const ROUTE_POLICY_VERSION = "route-v1";

export type AskMode = "auto" | "fast" | "deep";

export interface RouteFeatures {
  mode: AskMode;
  /** person entities present — a fidelity-gated question may never take a
   *  route whose model lacks the source-fidelity scorecard (§8.3) */
  nameBearing?: boolean;
}

export interface RoutePolicy {
  policyVersion: string;
  mode: AskMode;
  answerModel: string;
  rerankModel: string;
  evidenceK: number;
  candidatesCap: number;
  maxOutputTokens: number;
  reasoningEffort: "minimal" | "low" | "medium";
  reason: string;
}

export interface RouteRefusal {
  policyVersion: string;
  available: false;
  reason: "scorecard_missing" | "unknown_mode";
}

function answerMaxOutputTokens(): number {
  // EXACT parity with answer.ts's envNum semantics (Gate 4: a >0 floor here
  // recorded 2500 while the pipeline actually used a degenerate 0/negative
  // env value — the recorded policy must never claim what the pipeline
  // doesn't do). NOTE: the policy is ANSWER-STAGE-scoped — rerank runs its
  // own effort ("minimal") and output ceiling, and the evidence trim floor is
  // a separate knob; those are deliberately not part of this record.
  const raw = process.env.ASK_ANSWER_MAX_OUTPUT_TOKENS;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_ANSWER_MAX_OUTPUT_TOKENS;
}

/** The scorecarded production baseline answer model (registry). */
const BASELINE_ANSWER_MODEL = "gpt-5";

/** The recorded reason for an Auto policy. Pure and exported so both branches
 *  stay covered: `auto_env_override` is unreachable through route() while gpt-5
 *  is the only model carrying the answer suite (every possible override is
 *  therefore unscorecarded), and becomes reachable again the moment a second
 *  model is scorecarded — testing it through env alone would have deleted that
 *  coverage instead of keeping it.
 *
 *  Precedence is deliberate: `auto_scorecard_missing` outranks the
 *  baseline/override distinction because it is the consequential fact — since
 *  2026-09-06 the pipeline will NOT dispatch that model (answer.ts /
 *  answer-stream.ts refuse before any reservation), so a recorded
 *  `auto_env_override` would describe a paid run that never happens. */
export function autoPolicyReason(answerModel: string, scorecarded: boolean): string {
  if (!scorecarded) return "auto_scorecard_missing";
  return answerModel === BASELINE_ANSWER_MODEL ? "auto_baseline" : "auto_env_override";
}

/** The one policy that may serve today: Auto ≡ the production constants.
 *  An env-overridden answer model is RECORDED here but no longer served: the
 *  money path gates on the same scorecard (R3, 2026-09-06), so the reason below
 *  now reports the gate. The router itself stays recording-only — behaviour
 *  flows from the pipeline's own check, never from this function. */
function autoPolicy(): RoutePolicy {
  const answerModel = askAnswerModel();
  return {
    policyVersion: ROUTE_POLICY_VERSION,
    mode: "auto",
    answerModel,
    rerankModel: askRerankModel(),
    evidenceK: askEvidenceK(),
    candidatesCap: askCandidates(),
    maxOutputTokens: answerMaxOutputTokens(),
    reasoningEffort: "low",
    reason: autoPolicyReason(answerModel, hasScorecard(answerModel, ASK_ANSWER_SUITE)),
  };
}

/** Pure route decision. Fast/Deep return a refusal (never a silent Auto
 *  downgrade — callers decide how to surface it) until their models carry the
 *  answer-suite scorecard. */
export function route(features: RouteFeatures): RoutePolicy | RouteRefusal {
  switch (features.mode) {
    case "auto":
      return autoPolicy();
    case "fast": {
      // A Fast route would swap the answer model — allowed ONLY with a
      // recorded answer-suite scorecard for the candidate (none exists; the
      // paid matrix is operator-blocked). Name-bearing questions ADDITIONALLY
      // require the source-fidelity suite (§8.3) — encoded as its own check
      // (Gate 4: a future answer-matrix addition alone must not unlock
      // name-bearing traffic).
      const candidate = "gpt-5-nano";
      if (!hasScorecard(candidate, "answer-matrix")) {
        return { policyVersion: ROUTE_POLICY_VERSION, available: false, reason: "scorecard_missing" };
      }
      if (features.nameBearing && !hasScorecard(candidate, "fidelity-fixtures")) {
        return { policyVersion: ROUTE_POLICY_VERSION, available: false, reason: "scorecard_missing" };
      }
      return { ...autoPolicy(), mode: "fast", answerModel: candidate, reason: "fast_scorecarded" };
    }
    case "deep": {
      // Deep is a budget-shape sketch (larger K within the ranked pool); it
      // may not serve without its own eval — same gate as Fast, including the
      // fidelity leg for name-bearing questions.
      if (!hasScorecard(askAnswerModel(), "deep-k")) {
        return { policyVersion: ROUTE_POLICY_VERSION, available: false, reason: "scorecard_missing" };
      }
      if (features.nameBearing && !hasScorecard(askAnswerModel(), "fidelity-fixtures")) {
        return { policyVersion: ROUTE_POLICY_VERSION, available: false, reason: "scorecard_missing" };
      }
      return { ...autoPolicy(), mode: "deep", reason: "deep_scorecarded" };
    }
    default:
      return { policyVersion: ROUTE_POLICY_VERSION, available: false, reason: "unknown_mode" };
  }
}

/** Compact recording string for ask_usage.route_policy. */
export function routePolicyString(p: RoutePolicy): string {
  return `${p.policyVersion}:${p.mode}:${p.answerModel}:k${p.evidenceK}`;
}
