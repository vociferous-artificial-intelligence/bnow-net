// ASK Tier-2+ embedding client (workstream A). The one paid embedding seam:
// batched OpenAI embeddings with bounded retry, per-request SpendGuard metering,
// and a deterministic STUB path that fails toward the cheaper/offline branch.
//
// Fail-toward-cheaper (never toward an unguarded paid call): with no
// OPENAI_API_KEY, ANALYSIS_PROVIDER=stub, or LLM_DISABLE=1, embedTexts returns
// hash-seeded pseudo-vectors, provider "stub", cost 0, and makes NO network call.
// Stub vectors are IN-MEMORY ONLY — the persist layer refuses to store them
// (truth-in-UI analog of standing ruling 3).

import { openaiEmbedBatches } from "../llm/openai";
import type { StageGuard } from "../usage/reservations";

/** ASK_EMBED_MODEL default. 1536-dim, matches the claim_embeddings vector width. */
export const EMBED_MODEL_DEFAULT = "text-embedding-3-small";
/** Vector width the schema pins (claim_embeddings.embedding is vector(1536)). */
export const EMBED_DIMS = 1536;
/** OpenAI accepts many inputs per embeddings request; keep batches bounded. */
export const EMBED_MAX_INPUTS_PER_REQUEST = 128;
/** Per-text input-size guard. Claims are <=500 chars already; this is a backstop. */
export const EMBED_MAX_INPUT_CHARS = 2000;
/** text-embedding-3-small list price, VERIFIED 2026-07-11: $0.02 per 1M input tokens. */
export const EMBED_USD_PER_1M_TOKENS = 0.02;
export const EMBED_USD_PER_TOKEN = EMBED_USD_PER_1M_TOKENS / 1e6;
/** provider string returned (and stored) when a real embedding was computed. */
export const EMBED_STUB_PROVIDER = "stub";

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
  costUsd: number;
  provider: string;
}

/** Active embedding model — env-overridable so a model swap is a config change. */
export function embedModel(): string {
  const v = process.env.ASK_EMBED_MODEL;
  return v && v.trim() ? v.trim() : EMBED_MODEL_DEFAULT;
}

/** Cost of `tokens` input tokens at the embedding list price. */
export function embedCostUsd(tokens: number): number {
  return tokens * EMBED_USD_PER_TOKEN;
}

/** Non-null reason string when the client must take the offline stub path;
 *  null when a real (paid, guarded) call is allowed. Order: kill-switch, forced
 *  stub provider, then absent key. */
export function embedStubReason(): string | null {
  if (process.env.LLM_DISABLE === "1") return "LLM_DISABLE=1";
  if (process.env.ANALYSIS_PROVIDER === "stub") return "ANALYSIS_PROVIDER=stub";
  if (!process.env.OPENAI_API_KEY) return "no OPENAI_API_KEY";
  return null;
}

/** Truncate one input to the per-text char guard (claims are <=500 anyway). */
export function truncateInput(text: string): string {
  return text.length > EMBED_MAX_INPUT_CHARS ? text.slice(0, EMBED_MAX_INPUT_CHARS) : text;
}

// -- deterministic stub vectors -------------------------------------------------
// FNV-1a seed -> mulberry32 PRNG -> unit-norm 1536-vector. Same text => byte-for-
// byte the same vector; no crypto, no allocation surprises, no network.

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic unit-norm pseudo-vector for a text (in-memory only). */
export function stubVector(text: string, dims = EMBED_DIMS): number[] {
  const rand = mulberry32(fnv1a(text));
  const v = new Array<number>(dims);
  let norm = 0;
  for (let i = 0; i < dims; i++) {
    const x = rand() * 2 - 1;
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) v[i] /= norm;
  return v;
}

// -- retry ----------------------------------------------------------------------
// Phase 5: moved verbatim into the gateway layer; re-exported so every
// historical import keeps working.
export { withRetry } from "../llm/retry";

// -- main -----------------------------------------------------------------------

/** Embed texts. Batched (<=128/request), retried, metered through `guard` when
 *  passed (reserve BEFORE each request, record AFTER using usage.total_tokens; a
 *  refusal throws LlmBudgetError before any call is made). Returns vectors in
 *  input order. Takes the offline stub path when embedStubReason() is set.
 *  `guard` is any StageGuard — the legacy SpendGuard or (Phase 1 enforce mode)
 *  the atomic reservation guard; tryReserve is awaited, compatible with both. */
export async function embedTexts(
  texts: string[],
  opts?: { guard?: StageGuard },
): Promise<EmbedResult> {
  const inputs = texts.map(truncateInput);

  if (embedStubReason() !== null) {
    return {
      vectors: inputs.map((t) => stubVector(t)),
      tokens: 0,
      costUsd: 0,
      provider: EMBED_STUB_PROVIDER,
    };
  }

  const model = embedModel();
  // Phase 5: the batched guarded dispatch (per-batch reserve → request →
  // record, retry, index-order defense) moved VERBATIM into the OpenAI
  // adapter; this stage keeps the stub path, truncation, price constant, and
  // provider naming.
  const { vectors, tokens, costUsd } = await openaiEmbedBatches({
    model,
    inputs,
    batchSize: EMBED_MAX_INPUTS_PER_REQUEST,
    costPerToken: EMBED_USD_PER_TOKEN,
    guard: opts?.guard,
  });

  return { vectors, tokens, costUsd, provider: `openai:${model}` };
}
