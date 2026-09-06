// ASK Tier-2+ embedding client (workstream A). The one paid embedding seam:
// batched OpenAI embeddings with bounded retry, per-request SpendGuard metering,
// and a deterministic STUB path that fails toward the cheaper/offline branch.
//
// Fail-toward-cheaper (never toward an unguarded paid call): with no
// OPENAI_API_KEY, ANALYSIS_PROVIDER=stub, or LLM_DISABLE=1, embedTexts returns
// hash-seeded pseudo-vectors, provider "stub", cost 0, and makes NO network call.
// Stub vectors are IN-MEMORY ONLY — the persist layer refuses to store them
// (truth-in-UI analog of standing ruling 3).

import { wellFormedSlice } from "../text/well-formed-slice";
import { openaiEmbedBatches } from "../llm/openai";
import {
  EMBED_PRICES_PER_MTOK,
  embedPriced,
  estimateEmbedCostUsd,
} from "../llm/pricing";
import type { StageGuard } from "../usage/reservations";

/** ASK_EMBED_MODEL default. 1536-dim, matches the claim_embeddings vector width. */
export const EMBED_MODEL_DEFAULT = "text-embedding-3-small";
/** Vector width the schema pins (claim_embeddings.embedding is vector(1536)). */
export const EMBED_DIMS = 1536;
/** OpenAI accepts many inputs per embeddings request; keep batches bounded. */
export const EMBED_MAX_INPUTS_PER_REQUEST = 128;
/** Per-text input-size guard. Claims are <=500 chars already; this is a backstop. */
export const EMBED_MAX_INPUT_CHARS = 2000;
/** Per-token price of the DEFAULT model. Compatibility export only (2026-09-06):
 *  prices now live in src/lib/llm/pricing.ts, the one price authority, and every
 *  live call site resolves the price from the model it is actually going to
 *  send. Kept — and test-pinned against the table — so the historical constant
 *  and the table can never silently disagree. */
export const EMBED_USD_PER_TOKEN = EMBED_PRICES_PER_MTOK[EMBED_MODEL_DEFAULT] / 1e6;
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

/** Thrown when the configured embedding model has no price row, so no honest
 *  metering is possible. The dispatch path refuses on it BEFORE reserving and
 *  before the SDK is constructed; Ask's vector arm catches it and degrades to
 *  lexical-only (ruling 9), the backfill script exits non-zero. */
export class EmbedModelUnpricedError extends Error {
  readonly code = "EMBED_MODEL_UNPRICED";
  constructor(model: string) {
    super(
      `embeddings: ASK_EMBED_MODEL="${model}" has no entry in EMBED_PRICES_PER_MTOK ` +
        `(src/lib/llm/pricing.ts) — refusing to dispatch unpriced`,
    );
    this.name = "EmbedModelUnpricedError";
  }
}

/** MEASURED cost of `tokens` input tokens for `model`. Unlike the estimator in
 *  pricing.ts this refuses an unpriced model instead of falling back: a fallback
 *  price on the metering path would record a number OpenAI never billed. */
export function embedCostUsd(tokens: number, model = embedModel()): number {
  if (!embedPriced(model)) throw new EmbedModelUnpricedError(model);
  return estimateEmbedCostUsd(model, tokens);
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

/** Truncate one input to the per-text char guard (claims are <=500 anyway) and
 *  keep the provider-bound string WELL-FORMED (#97): the budget stays 2,000
 *  UTF-16 code units, a surrogate pair straddling the cutoff loses only its
 *  orphaned high half, and an isolated surrogate is dropped even when the input
 *  is under the limit — an orphan would poison the whole batched embeddings
 *  request as a `\udXXX` JSON escape. Well-formed input at or under the limit
 *  is returned unchanged. The stub path shares this repair, so a previously
 *  malformed text now seeds its deterministic stub vector from the repaired
 *  text (well-formed inputs' stub vectors are unchanged). */
export function truncateInput(text: string): string {
  return wellFormedSlice(text, EMBED_MAX_INPUT_CHARS);
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
  // Fail closed on an UNPRICED model — before openaiEmbedBatches, which is where
  // the SDK client is constructed (llm/openai.ts:142) and where the reservation
  // is taken (:160). Dispatching a model we cannot price would meter the call at
  // a made-up rate, so it is refused instead (ruling 4). Placed AFTER the stub
  // check above, so an offline environment still returns stub vectors at $0.
  if (!embedPriced(model)) throw new EmbedModelUnpricedError(model);

  // Phase 5: the batched guarded dispatch (per-batch reserve → request →
  // record, retry, index-order defense) moved VERBATIM into the OpenAI
  // adapter; this stage keeps the stub path, truncation, price constant, and
  // provider naming.
  const { vectors, tokens, costUsd } = await openaiEmbedBatches({
    model,
    inputs,
    batchSize: EMBED_MAX_INPUTS_PER_REQUEST,
    costPerToken: embedCostUsd(1, model),
    guard: opts?.guard,
  });

  return { vectors, tokens, costUsd, provider: `openai:${model}` };
}
