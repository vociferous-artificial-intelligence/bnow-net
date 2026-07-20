// AI Search Phase 4: the versioned model capability/price registry (§8.4).
// One config-not-env-scatter source for what each model can do, what it costs,
// and — the QUALITY GATE — which eval scorecard (if any) it has passed. No
// route/model pair may serve users without a recorded passing scorecard; the
// paid answer-model matrix has NOT run (operator-blocked), so only the
// production baseline (validated by the checked-in 2026-07-11 eval) carries
// one.
//
// Pricing NOTE (registered deviation): src/lib/ask/limits.ts's PRICES_PER_MTOK
// remains the metering call sites' lookup for now — this registry mirrors it
// EXACTLY (parity-pinned by registry.test.ts) and becomes the single source
// when Phase 5 moves price knowledge into the provider adapters. Diverging the
// two tables fails the test suite.

export const REGISTRY_VERSION = "reg-v1";

export interface ModelEntry {
  /** price per 1M tokens — MUST mirror limits.ts PRICES_PER_MTOK */
  pricePerMTok: { in: number; out: number };
  capabilities: {
    streaming: boolean;
    structuredOutput: boolean;
    reasoningControl: boolean;
  };
  /** Recorded eval scorecard reference (docs/evals/*) — absent = the model has
   *  NOT passed the Ask gate and no route may serve it. */
  scorecard?: { ref: string; date: string; suites: string[] };
}

export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  "gpt-5": {
    pricePerMTok: { in: 1.25, out: 10 },
    capabilities: { streaming: true, structuredOutput: true, reasoningControl: true },
    // The production baseline: v2 K=60 answer stage, validated by the
    // checked-in eval (97.0% recall / 96.9% citation accuracy) — the ONLY
    // scorecarded answer model until the paid matrix runs.
    scorecard: { ref: "docs/evals/ASK-EVAL-2026-07-11.md", date: "2026-07-11", suites: ["v2-k60"] },
  },
  "gpt-5-mini": {
    pricePerMTok: { in: 0.125, out: 1 },
    capabilities: { streaming: true, structuredOutput: true, reasoningControl: true },
    // Scorecarded as the RERANK stage of the same baseline (not as an answer
    // model — a Fast answer route needs its own matrix run).
    scorecard: { ref: "docs/evals/ASK-EVAL-2026-07-11.md", date: "2026-07-11", suites: ["v2-k60-rerank"] },
  },
  "gpt-5-nano": {
    pricePerMTok: { in: 0.05, out: 0.4 },
    capabilities: { streaming: true, structuredOutput: true, reasoningControl: true },
    // no scorecard: a Fast-route CANDIDATE only; unusable until the paid
    // matrix (incl. the named-person source-fidelity fixtures) passes
  },
  "gpt-4o-mini": {
    pricePerMTok: { in: 0.15, out: 0.6 },
    capabilities: { streaming: true, structuredOutput: true, reasoningControl: false },
  },
  "gpt-4o": {
    pricePerMTok: { in: 2.5, out: 10 },
    capabilities: { streaming: true, structuredOutput: true, reasoningControl: false },
  },
};

/** Conservative unknown-model fallback — identical to limits.ts's backstop. */
export const UNKNOWN_MODEL_PRICE = { in: 5, out: 15 };

export function modelEntry(model: string): ModelEntry | null {
  return MODEL_REGISTRY[model] ?? null;
}

/** Has this model a recorded passing scorecard covering the given suite? */
export function hasScorecard(model: string, suite: string): boolean {
  const e = MODEL_REGISTRY[model];
  return e?.scorecard?.suites.includes(suite) ?? false;
}
