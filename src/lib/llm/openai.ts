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
import type {
  EmbedBatchesRequest,
  EmbedBatchesResult,
  GenerationProvider,
  GenerationRequest,
  GenerationResult,
  StreamChunk,
} from "./contracts";

// Release hardening 2026-07-21: EVERY client here is constructed with SDK
// auto-retries DISABLED. The SDK default (maxRetries: 2) re-dispatches 429/
// 5xx/connection failures invisibly, so one successful guard.tryReserve()
// could cover up to three physical billed attempts — a structural breach of
// the one-reservation-per-dispatch rule (contract §2). Retries, where they
// exist at all, are explicit loops that take a FRESH reservation per attempt
// (see openaiEmbedBatches).
function client(): OpenAI {
  return new OpenAI({ maxRetries: 0 });
}

export const openaiGeneration: GenerationProvider = {
  async generate(req: GenerationRequest, guard: StageGuard): Promise<GenerationResult> {
    await guard.init();
    // Reserve BEFORE the billed call; a refusal throws (fail closed) before we
    // dispatch — the stage's degradation branch catches it (ruling 4).
    const reserve = await guard.tryReserve();
    if (!reserve.ok) throw new LlmBudgetError(reserve.reason);

    const completion = await client().chat.completions.create({
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
    return client().chat.completions.create(
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
  return client().chat.completions.create({
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
  });
}

const EMBED_MAX_RETRIES = 3;
const EMBED_RETRY_BASE_MS = 500;

/** HTTP status of a provider rejection, or null for connection-class errors
 *  whose dispatch outcome is unknown (nothing definitive came back). */
function errorStatus(e: unknown): number | null {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/** Guarded batched embeddings (moved from embedTexts' loop). Vectors return in
 *  input order. Retry discipline (release hardening, contract §2): every
 *  PHYSICAL dispatch takes its own reservation immediately beforehand — a
 *  429/5xx retry first settles its failed attempt ($0: the server definitively
 *  rejected the call, nothing was billed) and then reserves afresh, so a
 *  refused re-reservation stops the retry BEFORE dispatch (fail closed). A
 *  connection-class failure (no HTTP status) leaves its reservation open for
 *  the conservative ceiling-settle expiry path — the dispatch outcome is
 *  unknown and is never retried. */
export async function openaiEmbedBatches(req: EmbedBatchesRequest): Promise<EmbedBatchesResult> {
  const c = client();
  const vectors: number[][] = [];
  let tokens = 0;
  let costUsd = 0;
  const maxRetries = req.retry?.maxRetries ?? EMBED_MAX_RETRIES;
  const baseMs = req.retry?.baseMs ?? EMBED_RETRY_BASE_MS;
  const sleep = req.retry?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let i = 0; i < req.inputs.length; i += req.batchSize) {
    const batch = req.inputs.slice(i, i + req.batchSize);
    let resp: Awaited<ReturnType<typeof c.embeddings.create>> & {
      usage?: { total_tokens?: number };
      data: Array<{ index: number; embedding: unknown }>;
    };
    for (let attempt = 0; ; attempt++) {
      // Reserve BEFORE the billed request; a refusal throws (fail closed)
      // before we call. Each loop iteration is a NEW reservation.
      if (req.guard) {
        const r = await req.guard.tryReserve();
        if (!r.ok) throw new LlmBudgetError(r.reason);
      }
      try {
        resp = (await c.embeddings.create({ model: req.model, input: batch })) as typeof resp;
        break;
      } catch (e) {
        const status = errorStatus(e);
        if (status !== null) {
          // Definitive server rejection: settle THIS attempt's reservation as a
          // dispatched-but-unbilled request so a retry can never ride on it.
          if (req.guard) await req.guard.record(1, 0, 0);
          if ((status === 429 || (status >= 500 && status < 600)) && attempt < maxRetries) {
            await sleep(baseMs * 2 ** attempt);
            continue;
          }
        }
        throw e;
      }
    }
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
