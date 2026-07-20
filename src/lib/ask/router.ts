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
import { hasScorecard } from "./registry";

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
  const n = Number(process.env.ASK_ANSWER_MAX_OUTPUT_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ANSWER_MAX_OUTPUT_TOKENS;
}

/** The one policy that may serve today: Auto ≡ the production constants. */
function autoPolicy(): RoutePolicy {
  return {
    policyVersion: ROUTE_POLICY_VERSION,
    mode: "auto",
    answerModel: askAnswerModel(),
    rerankModel: askRerankModel(),
    evidenceK: askEvidenceK(),
    candidatesCap: askCandidates(),
    maxOutputTokens: answerMaxOutputTokens(),
    reasoningEffort: "low",
    reason: "auto_baseline",
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
      // paid matrix is operator-blocked). Name-bearing questions additionally
      // require the fidelity suite (§8.3) — same missing scorecard today.
      const candidate = "gpt-5-nano";
      if (!hasScorecard(candidate, "answer-matrix")) {
        return { policyVersion: ROUTE_POLICY_VERSION, available: false, reason: "scorecard_missing" };
      }
      return { ...autoPolicy(), mode: "fast", answerModel: candidate, reason: "fast_scorecarded" };
    }
    case "deep": {
      // Deep is a budget-shape sketch (larger K within the ranked pool); it
      // may not serve without its own eval — same gate as Fast.
      if (!hasScorecard(askAnswerModel(), "deep-k")) {
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
