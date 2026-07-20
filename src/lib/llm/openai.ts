// AI Search Phase 5: the OpenAI adapter — the ONLY Ask-pipeline module allowed
// to import the vendor SDK (import-graph test). Code here was MOVED from the
// stage call sites (answer.ts non-streaming block, rerank.ts dispatch block,
// embeddings/client.ts batch loop, answer-stream.ts default factory), not
// rewritten: the existing stage suites pin byte-equivalence because they mock
// the "openai" package, which intercepts identically here.
//
// Guard discipline (rulings 4/8, unchanged shape): generate() and
// embedBatches() run init → tryReserve → dispatch → record INSIDE the
// adapter; a refusal throws LlmBudgetError BEFORE dispatch; record happens
// AFTER the request and BEFORE any read of the body. stream() is dispatch
// only (the streaming lifecycle lives in answer-stream.ts — contracts.ts
// docblock).

import OpenAI from "openai";
import { LlmBudgetError } from "../usage/llm-guard";
import type { StageGuard } from "../usage/reservations";
import { chatParamsForModel } from "../ask/llm-params";
import { estimateCostUsd } from "./pricing";
import { withRetry } from "./retry";
import type {
  EmbedBatchesRequest,
  EmbedBatchesResult,
  GenerationProvider,
  GenerationRequest,
  GenerationResult,
  StreamChunk,
} from "./contracts";

export const openaiGeneration: GenerationProvider = {
  async generate(req: GenerationRequest, guard: StageGuard): Promise<GenerationResult> {
    await guard.init();
    // Reserve BEFORE the billed call; a refusal throws (fail closed) before we
    // dispatch — the stage's degradation branch catches it (ruling 4).
    const reserve = await guard.tryReserve();
    if (!reserve.ok) throw new LlmBudgetError(reserve.reason);

    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      ...(req.responseFormat
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: req.responseFormat.name,
                schema: req.responseFormat.schema as never,
                strict: true,
              },
            },
          }
        : {}),
      ...chatParamsForModel(req.model, req.maxOutputTokens, {
        reasoningEffort: req.reasoningEffort,
      }),
    });

    // Meter AFTER the request but BEFORE any read of the response body, so even
    // a shape-anomalous completion (no choices) is recorded — it was billed in
    // full (ruling 8).
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const costUsd = estimateCostUsd(req.model, promptTokens, completionTokens);
    await guard.record(1, promptTokens + completionTokens, costUsd);

    const choice = completion.choices?.[0];
    return {
      content: choice?.message?.content ?? null,
      refusal: choice?.message?.refusal ?? null,
      finishReason: choice?.finish_reason ?? null,
      usage: { promptTokens, completionTokens, costUsd },
      requestId: completion.id ?? null,
    };
  },

  async stream(
    req: Omit<GenerationRequest, "responseFormat"> & { signal?: AbortSignal },
  ): Promise<AsyncIterable<StreamChunk>> {
    const client = new OpenAI();
    return client.chat.completions.create(
      {
        model: req.model,
        messages: req.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...chatParamsForModel(req.model, req.maxOutputTokens, {
          reasoningEffort: req.reasoningEffort,
        }),
      },
      { signal: req.signal },
    ) as Promise<AsyncIterable<StreamChunk>>;
  },
};

/** RAW dispatch for the LEGACY ask pipeline (ASK_PIPELINE=legacy — the
 *  byte-faithful rollback whose charter forbids improvement). The request
 *  payload is EXACTLY what the legacy call site always sent (temperature 0.1,
 *  no param shaping); only the SDK construction moved here so the import-graph
 *  rule holds. Do not normalize or guard here — the legacy stage owns its own
 *  behavior. */
export async function openaiLegacyChatCompletion(req: {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
}): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = new OpenAI();
  return client.chat.completions.create({
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
  });
}

/** Guarded batched embeddings (moved from embedTexts' loop). Vectors return in
 *  input order; each batch reserves before its request and records after it. */
export async function openaiEmbedBatches(req: EmbedBatchesRequest): Promise<EmbedBatchesResult> {
  const client = new OpenAI();
  const vectors: number[][] = [];
  let tokens = 0;
  let costUsd = 0;

  for (let i = 0; i < req.inputs.length; i += req.batchSize) {
    const batch = req.inputs.slice(i, i + req.batchSize);
    // Reserve BEFORE the billed request; a refusal throws (fail closed) before we call.
    if (req.guard) {
      const r = await req.guard.tryReserve();
      if (!r.ok) throw new LlmBudgetError(r.reason);
    }
    const resp = await withRetry(() => client.embeddings.create({ model: req.model, input: batch }));
    const batchTokens = resp.usage?.total_tokens ?? 0;
    const batchCost = batchTokens * req.costPerToken;
    tokens += batchTokens;
    costUsd += batchCost;
    // Record AFTER the request: 1 request, batch.length units, measured cost.
    if (req.guard) await req.guard.record(1, batch.length, batchCost);
    // Defensive: OpenAI returns data in input order, but sort on index anyway.
    const sorted = [...resp.data].sort((a, b) => a.index - b.index);
    for (const d of sorted) vectors.push(d.embedding as number[]);
  }

  return { vectors, tokens, costUsd };
}
