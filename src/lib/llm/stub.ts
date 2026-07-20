// AI Search Phase 5: the stub adapter — used by the CONTRACT TEST SUITE only.
// The RUNTIME stub/offline behavior remains the stages' existing checks
// (answerOffline/rerankOfflineReason/embedStubReason take their deterministic
// paths BEFORE any adapter is consulted — ruling 9's degradation contract is
// stage-owned and unchanged). This adapter exists so the contract suite can
// run identical fixtures against a second implementation and pin the
// normalized shapes a future real provider must satisfy.

import { LlmBudgetError } from "../usage/llm-guard";
import type { StageGuard } from "../usage/reservations";
import type {
  EmbedBatchesRequest,
  EmbedBatchesResult,
  GenerationProvider,
  GenerationRequest,
  GenerationResult,
  StreamChunk,
} from "./contracts";

export const stubGeneration: GenerationProvider = {
  async generate(req: GenerationRequest, guard: StageGuard): Promise<GenerationResult> {
    await guard.init();
    const reserve = await guard.tryReserve();
    if (!reserve.ok) throw new LlmBudgetError(reserve.reason);
    // $0 deterministic completion; still records (contract: record after
    // dispatch, before interpretation — a provider that bills $0 still meters)
    await guard.record(1, 0, 0);
    const seed = req.messages.map((m) => m.content).join("\n");
    return {
      content: `stub:${req.model}:${seed.length}`,
      refusal: null,
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      requestId: "stub-request",
    };
  },

  async stream(
    req: Omit<GenerationRequest, "responseFormat"> & { signal?: AbortSignal },
  ): Promise<AsyncIterable<StreamChunk>> {
    const content = `stub:${req.model}`;
    async function* chunks(): AsyncIterable<StreamChunk> {
      yield { choices: [{ delta: { content }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: "stop" }] };
      yield { usage: { prompt_tokens: 0, completion_tokens: 0 } };
    }
    return chunks();
  },
};

export async function stubEmbedBatches(req: EmbedBatchesRequest): Promise<EmbedBatchesResult> {
  const vectors: number[][] = [];
  for (let i = 0; i < req.inputs.length; i += req.batchSize) {
    const batch = req.inputs.slice(i, i + req.batchSize);
    if (req.guard) {
      const r = await req.guard.tryReserve();
      if (!r.ok) throw new LlmBudgetError(r.reason);
    }
    if (req.guard) await req.guard.record(1, batch.length, 0);
    for (const input of batch) vectors.push([input.length, 0, 0]);
  }
  return { vectors, tokens: 0, costUsd: 0 };
}
