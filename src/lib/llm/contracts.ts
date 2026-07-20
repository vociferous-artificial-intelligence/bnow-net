// AI Search Phase 5: the provider-neutral gateway contracts (§12 — frozen
// before the extraction; deviations need a decision-register entry).
//
// Three seams, kept separate because their capabilities, pricing, and caching
// differ (architecture review §4.1). The GUARD LIVES INSIDE the adapter
// boundary: every adapter method that can dispatch a paid call takes the
// stage's guard and runs init → tryReserve → dispatch → record itself, so a
// new provider structurally cannot bypass reservation/metering (ruling 4/8).
// A budget refusal throws LlmBudgetError BEFORE any dispatch; the stages keep
// their existing degradation branches.
//
// STREAMING exception (registered): GenerationProvider.stream() is DISPATCH
// ONLY. The streaming reserve/settle lifecycle, §6.3 buffered release, and
// the Gate 3 abort semantics live in src/lib/ask/answer-stream.ts — that
// module IS the streaming gateway component (register #40 designated its
// factory as this seam), and re-homing its hardened money paths would re-open
// Gate 3 surface for zero contract gain.
//
// RERANK (registered): the OpenAI rerank is a structured-output chat
// completion, so its implementation COMPOSES GenerationProvider.generate()
// with a responseFormat; prompts/parsing/fallback stay in the rerank stage
// (they are product logic, not transport). One dispatch primitive, three
// stage contracts.

import type { StageGuard } from "../usage/reservations";

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface GenerationMessage {
  role: "system" | "user";
  content: string;
}

export interface GenerationRequest {
  model: string;
  messages: GenerationMessage[];
  maxOutputTokens: number;
  reasoningEffort: "minimal" | "low";
  /** strict structured output (rerank) — provider maps to its native shape */
  responseFormat?: { name: string; schema: object };
}

export interface GenerationResult {
  content: string | null;
  refusal: string | null;
  finishReason: string | null;
  usage: NormalizedUsage;
  /** provider request id — internal diagnostics only, never user-facing */
  requestId: string | null;
}

/** Minimal streamed-chunk shape (mirrors answer-stream.ts's AnswerStreamChunk
 *  structurally — the consumer owns the §6.3 lifecycle). */
export interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; refusal?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export interface GenerationProvider {
  /** Guarded non-streaming completion: init → reserve (LlmBudgetError on
   *  refusal, BEFORE dispatch) → dispatch → record (BEFORE any body read —
   *  ruling 8) → normalize. */
  generate(req: GenerationRequest, guard: StageGuard): Promise<GenerationResult>;
  /** Dispatch-only stream construction (see the streaming exception above). */
  stream(req: Omit<GenerationRequest, "responseFormat"> & { signal?: AbortSignal }): Promise<AsyncIterable<StreamChunk>>;
}

export interface EmbedBatchesRequest {
  model: string;
  /** pre-truncated inputs, embedded in order */
  inputs: string[];
  batchSize: number;
  /** flat per-input-token price — the embed stage owns its price constant */
  costPerToken: number;
  guard?: StageGuard;
}

export interface EmbedBatchesResult {
  vectors: number[][];
  tokens: number;
  costUsd: number;
}

export interface EmbeddingProvider {
  /** Guarded batched embedding: per batch, reserve BEFORE the request
   *  (LlmBudgetError on refusal) and record AFTER it; vectors return in input
   *  order. */
  embedBatches(req: EmbedBatchesRequest): Promise<EmbedBatchesResult>;
}

/** Stage-level rerank contract (documentation of the seam; the OpenAI
 *  implementation composes generate() — see the module docblock). */
export interface RerankOutcome {
  ids: number[];
  relevantCount?: number;
  usage: NormalizedUsage;
}
