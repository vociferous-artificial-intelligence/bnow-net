// AI Search Phase 5: chat-model pricing moves INTO the gateway layer (the
// register #53 consolidation) — src/lib/ask/limits.ts re-exports
// estimateCostUsd from here so every historical call site keeps its import,
// and src/lib/ask/registry.ts's parity test keeps pinning these numbers
// against the model registry.

import type { AnalysisProviderId } from "./providers";

/** A price row. `provider` is ABSENT on every row today and means "openai" —
 *  the whole table predates the provider dimension. It is written out only for
 *  a non-OpenAI vendor, so a same-named model on two vendors can never share
 *  one price by accident (see pricedFor). */
export interface ModelPrice {
  in: number;
  out: number;
  provider?: AnalysisProviderId;
}

export type PriceTable = Record<string, ModelPrice>;

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
export const PRICES_PER_MTOK: PriceTable = {
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

// ---------------------------------------------------------------------------
// Embedding prices (WS-2.1, PR-2.1-2). A SEPARATE table because embeddings have
// no output side: one price per 1M INPUT tokens. This is the single price
// authority for the embedding path exactly as PRICES_PER_MTOK is for chat —
// src/lib/embeddings/client.ts refuses to dispatch a model with no entry here,
// BEFORE any reservation and before the SDK is constructed.
//
// Pricing is necessary, never sufficient, and never an authorization: an entry
// means the model can be METERED honestly, nothing more. Adding a row is a code
// PR carrying the operator-verified list price in its body (decision R8).

/** Embedding list price per 1M input tokens. */
export const EMBED_PRICES_PER_MTOK: Record<string, number> = {
  "text-embedding-3-small": 0.02, // VERIFIED 2026-07-11
};

/** Conservative per-1M fallback for CEILING math only (a reservation ceiling
 *  must never understate an unknown model). It is >= every entry above, pinned
 *  by test. It is NOT a dispatch price: an unpriced model is refused, so this
 *  number can never be used to meter a real call. */
export const EMBED_UNKNOWN_PRICE_PER_MTOK = 0.13;

/** True when the model has an operator-verified embedding price. */
export function embedPriced(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(EMBED_PRICES_PER_MTOK, model);
}

/** Per-1M price used for estimates: the exact entry, or the conservative
 *  fallback for an unpriced model. */
export function embedPricePerMtok(model: string): number {
  return embedPriced(model) ? EMBED_PRICES_PER_MTOK[model] : EMBED_UNKNOWN_PRICE_PER_MTOK;
}

/** Estimated cost of `tokens` embedding input tokens. Over-estimates an unpriced
 *  model rather than pretending it is free. Grouped as tokens * (price / 1e6) —
 *  the same association the pre-2026-09-06 EMBED_USD_PER_TOKEN constant used, so
 *  the default model's numbers are bit-identical to the old ones. */
export function estimateEmbedCostUsd(model: string, tokens: number): number {
  return tokens * (embedPricePerMtok(model) / 1_000_000);
}

/** Is `model` priced FOR THIS PROVIDER? A row with no `provider` field is an
 *  OpenAI row (the whole table predates the provider dimension), so an absent
 *  field must read as "openai", never as "any provider" — otherwise the first
 *  non-OpenAI wiring would inherit OpenAI's price table wholesale and meter a
 *  different vendor's tokens at OpenAI rates.
 *
 *  `table` is injectable for TESTS only; production callers use the default. */
export function pricedFor(
  provider: AnalysisProviderId,
  model: string,
  table: PriceTable = PRICES_PER_MTOK,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(table, model)) return false;
  return (table[model].provider ?? "openai") === provider;
}
