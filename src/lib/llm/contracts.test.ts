import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5 contract suite: the SAME fixtures run against the OpenAI adapter
// (SDK mocked) and the stub adapter — pinning the normalized shapes, the
// guard discipline (reserve BEFORE dispatch, record AFTER it and BEFORE any
// body read — rulings 4/8), and metering on anomalous outputs.
//
// FUTURE-PROVIDER checklist (Gate 5 note — register #61): the dispatch-order
// and anomalous-output assertions below observe the OPENAI mock's dispatch;
// a new provider added to describe.each MUST also supply its own dispatch
// spy so reserve<dispatch<record ordering and the five anomalous-output
// fixtures run against ITS transport — the generic rows alone are not a
// sufficient gate.

const h = vi.hoisted(() => ({
  createMock: vi.fn(),
  embeddingsMock: vi.fn(),
  ctorOpts: [] as unknown[],
}));
vi.mock("openai", () => ({
  default: class {
    constructor(opts?: unknown) {
      h.ctorOpts.push(opts);
    }
    chat = { completions: { create: h.createMock } };
    embeddings = { create: h.embeddingsMock };
  },
}));

const { openaiGeneration, openaiEmbedBatches, openaiLegacyChatCompletion } = await import("./openai");
const { stubGeneration, stubEmbedBatches } = await import("./stub");
const { LlmBudgetError } = await import("../usage/llm-guard");
import type { GenerationProvider } from "./contracts";

function guardSpy(reserveOk = true) {
  const calls: string[] = [];
  return {
    calls,
    init: vi.fn(async () => {
      calls.push("init");
    }),
    tryReserve: vi.fn(async () => {
      calls.push("reserve");
      return reserveOk ? { ok: true as const } : { ok: false as const, reason: "cap" };
    }),
    record: vi.fn(async () => {
      calls.push("record");
    }),
  };
}

const REQ = {
  model: "gpt-5",
  messages: [
    { role: "system" as const, content: "sys" },
    { role: "user" as const, content: "q" },
  ],
  maxOutputTokens: 100,
  reasoningEffort: "low" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.ctorOpts.length = 0;
});

describe.each([
  ["openai", () => openaiGeneration],
  ["stub", () => stubGeneration],
] as Array<[string, () => GenerationProvider]>)("GenerationProvider contract — %s", (name, get) => {
  beforeEach(() => {
    h.createMock.mockResolvedValue({
      id: "req-1",
      choices: [{ message: { content: "Answer text.", refusal: null }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
  });

  it("reserve precedes dispatch; record follows it; normalized result shape", async () => {
    const guard = guardSpy();
    const r = await get().generate(REQ, guard as never);
    expect(guard.calls[0]).toBe("init");
    expect(guard.calls[1]).toBe("reserve");
    expect(guard.calls[guard.calls.length - 1]).toBe("record");
    if (name === "openai") {
      // dispatch happened between reserve and record
      expect(guard.tryReserve.mock.invocationCallOrder[0]).toBeLessThan(
        h.createMock.mock.invocationCallOrder[0],
      );
      expect(h.createMock.mock.invocationCallOrder[0]).toBeLessThan(
        guard.record.mock.invocationCallOrder[0],
      );
      expect(r.content).toBe("Answer text.");
      expect(r.finishReason).toBe("stop");
      expect(r.usage.promptTokens).toBe(100);
      expect(r.requestId).toBe("req-1");
    }
    expect(typeof r.usage.costUsd).toBe("number");
    expect(r.refusal).toBeNull();
  });

  it("a budget refusal throws LlmBudgetError BEFORE any dispatch and records nothing", async () => {
    const guard = guardSpy(false);
    await expect(get().generate(REQ, guard as never)).rejects.toThrow(LlmBudgetError);
    expect(h.createMock).not.toHaveBeenCalled();
    expect(guard.record).not.toHaveBeenCalled();
  });

  it("stream() yields delta chunks ending in a usage-bearing frame shape", async () => {
    if (name === "openai") {
      h.createMock.mockResolvedValue(
        (async function* () {
          yield { choices: [{ delta: { content: "hi" }, finish_reason: null }] };
          yield { usage: { prompt_tokens: 1, completion_tokens: 1 } };
        })(),
      );
    }
    const stream = await get().stream(REQ);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.usage)).toBe(true);
    if (name === "openai") {
      // dispatch-only: NO guard interaction inside stream() (the streaming
      // lifecycle lives in answer-stream.ts — contracts.ts docblock)
      const params = h.createMock.mock.calls[0][0];
      expect(params.stream).toBe(true);
      expect(params.stream_options).toEqual({ include_usage: true });
    }
  });
});

describe("GenerationProvider contract — metering on anomalous outputs (openai)", () => {
  it("a shape-anomalous completion (no choices) still records before any body read", async () => {
    h.createMock.mockResolvedValue({ id: "x", choices: [], usage: { prompt_tokens: 50, completion_tokens: 0 } });
    const guard = guardSpy();
    const r = await openaiGeneration.generate(REQ, guard as never);
    expect(guard.record).toHaveBeenCalledTimes(1); // billed in full (ruling 8)
    expect(r.content).toBeNull();
    expect(r.finishReason).toBeNull();
  });

  it("a refusal is normalized and still metered", async () => {
    h.createMock.mockResolvedValue({
      choices: [{ message: { content: null, refusal: "cannot" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    const guard = guardSpy();
    const r = await openaiGeneration.generate(REQ, guard as never);
    expect(r.refusal).toBe("cannot");
    expect(guard.record).toHaveBeenCalledTimes(1);
  });

  it("a truncated (length) empty completion is normalized and still metered", async () => {
    h.createMock.mockResolvedValue({
      choices: [{ message: { content: "", refusal: null }, finish_reason: "length" }],
      usage: { prompt_tokens: 10, completion_tokens: 100 },
    });
    const guard = guardSpy();
    const r = await openaiGeneration.generate(REQ, guard as never);
    expect(r.finishReason).toBe("length");
    expect(guard.record).toHaveBeenCalledTimes(1);
  });

  it("missing usage meters zero tokens (never throws pre-record)", async () => {
    h.createMock.mockResolvedValue({ choices: [{ message: { content: "x" }, finish_reason: "stop" }] });
    const guard = guardSpy();
    const r = await openaiGeneration.generate(REQ, guard as never);
    expect(guard.record).toHaveBeenCalledWith(1, 0, 0);
    expect(r.usage.costUsd).toBe(0);
  });

  it("structured-output requests map to the native strict json_schema shape", async () => {
    h.createMock.mockResolvedValue({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    await openaiGeneration.generate(
      { ...REQ, responseFormat: { name: "rerank", schema: { type: "object" } } },
      guardSpy() as never,
    );
    const params = h.createMock.mock.calls[0][0];
    expect(params.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "rerank", schema: { type: "object" }, strict: true },
    });
  });
});

describe.each([
  ["openai", openaiEmbedBatches],
  ["stub", stubEmbedBatches],
] as Array<[string, typeof openaiEmbedBatches]>)("EmbeddingProvider contract — %s", (name, embed) => {
  beforeEach(() => {
    h.embeddingsMock.mockImplementation(async ({ input }: { input: string[] }) => ({
      data: input.map((_, i) => ({ index: i, embedding: [i, 0, 0] })),
      usage: { total_tokens: input.length * 3 },
    }));
  });

  it("batches by batchSize with per-batch reserve/record; vectors in input order", async () => {
    const guard = guardSpy();
    const inputs = ["a", "b", "c", "d", "e"];
    const r = await embed({ model: "m", inputs, batchSize: 2, costPerToken: 0.001, guard: guard as never });
    expect(r.vectors).toHaveLength(5);
    expect(guard.tryReserve).toHaveBeenCalledTimes(3); // ceil(5/2) batches
    expect(guard.record).toHaveBeenCalledTimes(3);
    if (name === "openai") {
      expect(r.tokens).toBe(15);
      expect(r.costUsd).toBeCloseTo(0.015, 10);
      // reserve #1 preceded request #1
      expect(guard.tryReserve.mock.invocationCallOrder[0]).toBeLessThan(
        h.embeddingsMock.mock.invocationCallOrder[0],
      );
    }
  });

  it("a mid-batch refusal throws before that batch's request", async () => {
    let calls = 0;
    const guard = {
      init: async () => {},
      tryReserve: vi.fn(async () => (++calls === 2 ? { ok: false as const, reason: "cap" } : { ok: true as const })),
      record: vi.fn(async () => {}),
    };
    await expect(
      embed({ model: "m", inputs: ["a", "b", "c"], batchSize: 2, costPerToken: 0, guard: guard as never }),
    ).rejects.toThrow(LlmBudgetError);
    if (name === "openai") expect(h.embeddingsMock).toHaveBeenCalledTimes(1); // batch 2 never dispatched
    expect(guard.record).toHaveBeenCalledTimes(1);
  });

  it("openai: out-of-order response data is re-sorted by index (defensive)", async () => {
    if (name !== "openai") return;
    h.embeddingsMock.mockResolvedValue({
      data: [
        { index: 1, embedding: [1] },
        { index: 0, embedding: [0] },
      ],
      usage: { total_tokens: 2 },
    });
    const r = await embed({ model: "m", inputs: ["a", "b"], batchSize: 2, costPerToken: 0 });
    expect(r.vectors).toEqual([[0], [1]]);
  });
});

// ---- release hardening 2026-07-21: retry/spend discipline --------------------------
// One successful reservation covers exactly ONE physical dispatch, always. The
// SDK's hidden auto-retry (default maxRetries: 2) is disabled on every client;
// the only retry loop (embed batches) reserves afresh per attempt.

describe("retry/spend discipline — SDK auto-retries disabled, per-attempt reservations", () => {
  const noSleep = { baseMs: 1, sleep: async () => {} };

  it("every SDK client is constructed with maxRetries: 0 (generate/stream/legacy/embed)", async () => {
    h.createMock.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    h.embeddingsMock.mockResolvedValue({ data: [{ index: 0, embedding: [1] }], usage: { total_tokens: 1 } });
    await openaiGeneration.generate(REQ, guardSpy() as never);
    h.createMock.mockResolvedValue((async function* () {})());
    await openaiGeneration.stream(REQ);
    h.createMock.mockResolvedValue({ choices: [], usage: {} });
    await openaiLegacyChatCompletion({ model: "m", messages: [{ role: "user", content: "q" }], temperature: 0.1 });
    await openaiEmbedBatches({ model: "m", inputs: ["a"], batchSize: 1, costPerToken: 0 });
    expect(h.ctorOpts.length).toBe(4);
    for (const opts of h.ctorOpts) expect(opts).toEqual({ maxRetries: 0 });
  });

  it("generate: a 429 propagates after exactly ONE dispatch — no hidden second dispatch", async () => {
    h.createMock.mockRejectedValue({ status: 429 });
    const guard = guardSpy();
    await expect(openaiGeneration.generate(REQ, guard as never)).rejects.toEqual({ status: 429 });
    expect(h.createMock).toHaveBeenCalledTimes(1);
    expect(guard.tryReserve).toHaveBeenCalledTimes(1);
    // no $0 settle: the reservation stays open for the conservative expiry path
    expect(guard.record).not.toHaveBeenCalled();
  });

  it("embed: a 429 retry settles the failed attempt $0 and takes a NEW reservation before the second dispatch", async () => {
    h.embeddingsMock
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ data: [{ index: 0, embedding: [1] }], usage: { total_tokens: 4 } });
    const guard = guardSpy();
    const r = await openaiEmbedBatches({
      model: "m", inputs: ["a"], batchSize: 1, costPerToken: 0.001, guard: guard as never, retry: noSleep,
    });
    expect(r.tokens).toBe(4);
    expect(h.embeddingsMock).toHaveBeenCalledTimes(2);
    expect(guard.tryReserve).toHaveBeenCalledTimes(2); // one reservation PER dispatch
    expect(guard.record.mock.calls).toEqual([[1, 0, 0], [1, 1, 0.004]]);
    // strict interleaving: reserve1 < dispatch1 < settle1 < reserve2 < dispatch2 < record2
    const order = [
      guard.tryReserve.mock.invocationCallOrder[0],
      h.embeddingsMock.mock.invocationCallOrder[0],
      guard.record.mock.invocationCallOrder[0],
      guard.tryReserve.mock.invocationCallOrder[1],
      h.embeddingsMock.mock.invocationCallOrder[1],
      guard.record.mock.invocationCallOrder[1],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("embed: a refused re-reservation stops the retry BEFORE any second dispatch", async () => {
    h.embeddingsMock.mockRejectedValue({ status: 503 });
    let calls = 0;
    const guard = {
      init: async () => {},
      tryReserve: vi.fn(async () => (++calls >= 2 ? { ok: false as const, reason: "cap" } : { ok: true as const })),
      record: vi.fn(async () => {}),
    };
    await expect(
      openaiEmbedBatches({ model: "m", inputs: ["a"], batchSize: 1, costPerToken: 0, guard: guard as never, retry: noSleep }),
    ).rejects.toThrow(LlmBudgetError);
    expect(h.embeddingsMock).toHaveBeenCalledTimes(1); // the retry never dispatched
  });

  it("embed: persistent 5xx exhausts the bounded retries — one reservation per dispatch — then throws", async () => {
    h.embeddingsMock.mockRejectedValue({ status: 502 });
    const guard = guardSpy();
    await expect(
      openaiEmbedBatches({
        model: "m", inputs: ["a"], batchSize: 1, costPerToken: 0, guard: guard as never,
        retry: { ...noSleep, maxRetries: 1 },
      }),
    ).rejects.toEqual({ status: 502 });
    expect(h.embeddingsMock).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(guard.tryReserve).toHaveBeenCalledTimes(2);
    expect(guard.record.mock.calls).toEqual([[1, 0, 0], [1, 0, 0]]);
  });

  it("embed: a non-retryable 400 settles its attempt $0 and throws without retrying", async () => {
    h.embeddingsMock.mockRejectedValue({ status: 400 });
    const guard = guardSpy();
    await expect(
      openaiEmbedBatches({ model: "m", inputs: ["a"], batchSize: 1, costPerToken: 0, guard: guard as never, retry: noSleep }),
    ).rejects.toEqual({ status: 400 });
    expect(h.embeddingsMock).toHaveBeenCalledTimes(1);
    expect(guard.record.mock.calls).toEqual([[1, 0, 0]]);
  });

  it("embed: a connection-class failure (no status) leaves the reservation OPEN and never retries", async () => {
    h.embeddingsMock.mockRejectedValue(new Error("socket hang up"));
    const guard = guardSpy();
    await expect(
      openaiEmbedBatches({ model: "m", inputs: ["a"], batchSize: 1, costPerToken: 0, guard: guard as never, retry: noSleep }),
    ).rejects.toThrow("socket hang up");
    expect(h.embeddingsMock).toHaveBeenCalledTimes(1);
    expect(guard.tryReserve).toHaveBeenCalledTimes(1);
    // dispatch outcome unknown → NO $0 settle; expiry ceiling-settles conservatively
    expect(guard.record).not.toHaveBeenCalled();
  });
});
