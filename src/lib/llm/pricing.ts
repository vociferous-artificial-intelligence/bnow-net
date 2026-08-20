// AI Search Phase 5: chat-model pricing moves INTO the gateway layer (the
// register #53 consolidation) — src/lib/ask/limits.ts re-exports
// estimateCostUsd from here so every historical call site keeps its import,
// and src/lib/ask/registry.ts's parity test keeps pinning these numbers
// against the model registry.

/** List price per 1M tokens. gpt-5 family for the Tier-2+ ASK pipeline;
 *  gpt-4o entries retained; unknown models fall back to a conservative
 *  over-estimate.
 *
 *  gpt-5-mini CORRECTED 2026-08-17 from $0.125/$1 to the official $0.25 in /
 *  $2.00 out (cached input $0.025 — no cached-input dimension exists in this
 *  estimator, so estimates stay conservative for cached traffic). The old
 *  numbers UNDERSTATED spend 2×: Ask's measured/reserved rerank cost rises
 *  ~2× from this correction even though the provider's actual billing never
 *  changed — the application had been under-metering it. */
export const PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICES_PER_MTOK[model] ?? { in: 5, out: 15 };
  return (promptTokens * p.in + completionTokens * p.out) / 1_000_000;
}
