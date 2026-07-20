// AI Search Phase 5: chat-model pricing moves INTO the gateway layer (the
// register #53 consolidation) — src/lib/ask/limits.ts re-exports
// estimateCostUsd from here so every historical call site keeps its import,
// and src/lib/ask/registry.ts's parity test keeps pinning these numbers
// against the model registry.

/** List price per 1M tokens. gpt-5 family for the Tier-2+ ASK pipeline;
 *  gpt-4o entries retained; unknown models fall back to a conservative
 *  over-estimate. */
export const PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.125, out: 1 },
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
