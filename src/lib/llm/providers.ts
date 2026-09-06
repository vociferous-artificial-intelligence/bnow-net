// The PROVIDER dimension of the analysis routing seam (2026-09-06, WS-2.2).
//
// Before this module the seam answered "which MODEL does this workload
// dispatch, at what reasoning effort" and silently assumed OpenAI everywhere.
// Adding a second vendor to that assumption is how an unmetered, unregistered
// dispatch path gets built by accident (the Anthropic digest seam, OPEN-TASKS
// #83, is exactly that shape). So the vendor is now an explicit, validated,
// per-workload-allowlisted routing input, refused BEFORE any SpendGuard
// reservation and BEFORE any provider client is constructed (standing ruling 4).
//
// Vocabulary vs. permission — the distinction this file exists to keep:
// - ANALYSIS_PROVIDER_IDS is the set of provider ids the seam can NAME. A name
//   here is not permission to dispatch.
// - WORKLOAD_PROVIDER_ALLOWLIST is the set a workload may actually dispatch.
//   Today every entry is exactly {openai}. WIDENING AN ENTRY IS A REVIEWED PR
//   PLUS A DECISION-LOG ENTRY — and, on its own, still dispatches nothing: the
//   model must also be priced FOR THAT PROVIDER in pricing.ts and approved for
//   the exact (workload, provider, model, effort) in analysis-registry.ts.
//
// This module is deliberately leaf-level: it imports nothing from the seam, so
// pricing.ts, analysis-registry.ts, model-config.ts and the eval live-runner can
// all depend on it without an import cycle. AnalysisWorkload lives here for the
// same reason (model-config.ts re-exports it, so every existing import path
// keeps working unchanged).
//
// NOT a routing switch: the legacy `ANALYSIS_PROVIDER` env keeps its own
// meaning (stub = the deterministic offline extractor; anthropic = refused,
// src/lib/analysis/provider.ts) and is never read here.

export type AnalysisWorkload = "map" | "reduce" | "digest" | "validation" | "entity_audit";

/** Provider ids the routing seam can NAME. Naming is not permission — see
 *  WORKLOAD_PROVIDER_ALLOWLIST. `openai_compatible` is reserved for a future
 *  base-URL-addressed OpenAI-protocol endpoint; no code routes to it today. */
export const ANALYSIS_PROVIDER_IDS = ["openai", "anthropic", "openai_compatible"] as const;
export type AnalysisProviderId = (typeof ANALYSIS_PROVIDER_IDS)[number];

/** The provider every workload resolves to when `<WORKLOAD>_PROVIDER` is
 *  absent — i.e. everywhere today, in every environment. */
export const ANALYSIS_DEFAULT_PROVIDER: AnalysisProviderId = "openai";

/** Per-workload DISPATCH allowlist. Every entry is {openai} at 2026-09-06.
 *  Widening one is a reviewed PR + a decision-log entry, and still leaves the
 *  pricing and quality-registry gates in force. */
export const WORKLOAD_PROVIDER_ALLOWLIST: Record<
  AnalysisWorkload,
  ReadonlySet<AnalysisProviderId>
> = {
  map: new Set<AnalysisProviderId>(["openai"]),
  reduce: new Set<AnalysisProviderId>(["openai"]),
  digest: new Set<AnalysisProviderId>(["openai"]),
  validation: new Set<AnalysisProviderId>(["openai"]),
  entity_audit: new Set<AnalysisProviderId>(["openai"]),
};

/** Models that reject a non-default `temperature` and accept `reasoning_effort`.
 *  Mirrors the Ask gateway's GPT5_FAMILY split (src/lib/ask/llm-params.ts) and
 *  adds the o-series defensively; unpriced models cannot dispatch regardless.
 *  Moved verbatim from model-config.ts when the provider dimension landed. */
const OPENAI_REASONING_MODEL = /^(gpt-5|o\d)/;

/** Does (provider, model) accept a `reasoning_effort` parameter?
 *
 *  The regex is an OPENAI model-name convention and means nothing for another
 *  vendor, so every non-OpenAI provider answers false until its own capability
 *  probe lands with its wiring. That is the fail-closed answer: a non-OpenAI
 *  provider carrying a `<W>_REASONING_EFFORT` is refused rather than silently
 *  dropping the parameter. */
export function analysisReasoningCapable(provider: AnalysisProviderId, model: string): boolean {
  return provider === "openai" ? OPENAI_REASONING_MODEL.test(model) : false;
}

/** Is `raw` one of the ids the seam knows? (Membership only — see the
 *  allowlist for permission.) */
export function isAnalysisProviderId(raw: string): raw is AnalysisProviderId {
  return (ANALYSIS_PROVIDER_IDS as readonly string[]).includes(raw);
}
