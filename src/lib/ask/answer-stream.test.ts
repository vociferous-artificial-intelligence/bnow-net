import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// The provider stream is a plain async iterable via the test seam; the guard is
// mocked; the DB Pool is mocked (only the cancel watcher touches it here).
const h = vi.hoisted(() => ({
  guard: { init: vi.fn(), tryReserve: vi.fn(), record: vi.fn() },
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));
vi.mock("../usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/llm-guard")>();
  return { ...actual, askGuardFromEnv: () => h.guard };
});
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));

const { streamAnswer, watchCancelMarker, STREAM_DEATH_INPUT_EST_TOKENS } = await import("./answer-stream");
const { LlmBudgetError } = await import("../usage/llm-guard");
import type { AnswerStreamChunk } from "./answer-stream";
import type { CandidateClaim, RankedEvidence } from "./types";

function candidate(claimId: number, text: string, hedging = "confirmed"): CandidateClaim {
  return {
    claimId, text, hedging, claimDate: "2026-07-10", countryIso2: "ru", track: null,
    entities: [], confidence: 0.8, vectorScore: null, lexicalHit: true, compositeScore: 1,
  };
}
const RANKED: RankedEvidence = {
  claims: [candidate(1, "Strikes hit the depot overnight.")],
  rerankUsed: false,
};

function sinkSpy() {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    emit: vi.fn(async (type: string, payload: Record<string, unknown>) => {
      events.push({ type, payload });
    }),
  };
}

async function* chunks(items: AnswerStreamChunk[]): AsyncIterable<AnswerStreamChunk> {
  for (const c of items) yield c;
}

const FILLER = "Filler sentence with sufficient length to cross the holdback boundary. ".repeat(4);

const BASE = {
  model: "gpt-5",
  messages: [{ role: "system" as const, content: "sys" }],
  maxOutputTokens: 2500,
  ranked: RANKED,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.guard.init.mockResolvedValue(undefined);
  h.guard.tryReserve.mockResolvedValue({ ok: true });
  h.guard.record.mockResolvedValue(undefined);
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [] });
});

describe("streamAnswer — money discipline", () => {
  it("reserves BEFORE the stream and records EXACTLY once with the terminal usage frame", async () => {
    const sink = sinkSpy();
    const outcome = await streamAnswer({
      ...BASE,
      sink,
      streamFactory: async () => {
        expect(h.guard.tryReserve).toHaveBeenCalledTimes(1); // reserve preceded dispatch
        return chunks([
          { choices: [{ delta: { content: FILLER + "Strikes hit the depot [c1]. " } }] },
          { choices: [{ delta: { content: "More text arrives here." }, finish_reason: "stop" }] },
          { usage: { prompt_tokens: 800, completion_tokens: 120 } },
        ]);
      },
    });
    expect(h.guard.record).toHaveBeenCalledTimes(1);
    const [reqs, units] = h.guard.record.mock.calls[0] as [number, number, number];
    expect(reqs).toBe(1);
    expect(units).toBe(920); // real token units
    expect(outcome.usage.promptTokens).toBe(800);
    expect(outcome.releasedCount).toBeGreaterThanOrEqual(1);
    expect(sink.events.every((e) => e.type === "answer.section")).toBe(true);
    expect(outcome.content).toContain("More text arrives here.");
  });

  it("a budget refusal throws BEFORE any stream and records nothing", async () => {
    h.guard.tryReserve.mockResolvedValue({ ok: false, reason: "cap" });
    const factory = vi.fn();
    await expect(
      streamAnswer({ ...BASE, sink: sinkSpy(), streamFactory: factory as never }),
    ).rejects.toThrow(LlmBudgetError);
    expect(factory).not.toHaveBeenCalled();
    expect(h.guard.record).not.toHaveBeenCalled();
  });

  it("a stream that DIES before a usage frame settles the conservative ceiling exactly once and resolves", async () => {
    async function* dying(): AsyncIterable<AnswerStreamChunk> {
      yield { choices: [{ delta: { content: FILLER + "Strikes hit the depot [c1]. " } }] };
      throw new Error("network reset");
    }
    const sink = sinkSpy();
    const outcome = await streamAnswer({ ...BASE, sink, streamFactory: async () => dying() });
    expect(outcome.finishReason).toBe("error");
    expect(h.guard.record).toHaveBeenCalledTimes(1);
    const [, units, usd] = h.guard.record.mock.calls[0] as [number, number, number];
    expect(units).toBe(STREAM_DEATH_INPUT_EST_TOKENS + 2500); // ceiling, never unrecorded
    expect(usd).toBeGreaterThan(0);
    // the pre-death validated section still went out; nothing after the death
    expect(sink.events.length).toBeGreaterThanOrEqual(1);
  });

  it("an ABORT settles once and reports cancelled", async () => {
    const controller = new AbortController();
    async function* aborting(): AsyncIterable<AnswerStreamChunk> {
      yield { choices: [{ delta: { content: FILLER } }] };
      controller.abort();
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    const outcome = await streamAnswer({
      ...BASE,
      sink: sinkSpy(),
      signal: controller.signal,
      streamFactory: async () => aborting(),
    });
    expect(outcome.cancelled).toBe(true);
    expect(outcome.finishReason).toBe("cancelled");
    expect(h.guard.record).toHaveBeenCalledTimes(1);
  });

  it("a stream construction failure settles the ceiling and rethrows (possibly-billed, never unrecorded)", async () => {
    await expect(
      streamAnswer({
        ...BASE,
        sink: sinkSpy(),
        streamFactory: async () => {
          throw new Error("dispatch failed");
        },
      }),
    ).rejects.toThrow("dispatch failed");
    expect(h.guard.record).toHaveBeenCalledTimes(1);
  });
});

describe("streamAnswer — §6.3 release safety", () => {
  it("refusal deltas suppress ALL release; the refusal is reported for the shared terminal mapping", async () => {
    const sink = sinkSpy();
    const outcome = await streamAnswer({
      ...BASE,
      sink,
      streamFactory: async () =>
        chunks([
          { choices: [{ delta: { refusal: "I cannot help with that." }, finish_reason: "stop" }] },
          { usage: { prompt_tokens: 100, completion_tokens: 5 } },
        ]),
    });
    expect(outcome.refusal).toBe("I cannot help with that.");
    expect(sink.events).toHaveLength(0); // nothing rendered
    expect(h.guard.record).toHaveBeenCalledTimes(1); // still billed (ruling 8)
  });

  it("a denial-led reply releases nothing (the terminal insufficient path governs)", async () => {
    const sink = sinkSpy();
    const outcome = await streamAnswer({
      ...BASE,
      sink,
      streamFactory: async () =>
        chunks([
          { choices: [{ delta: { content: "No claims in the covered data address this question. " + FILLER }, finish_reason: "stop" }] },
          { usage: { prompt_tokens: 100, completion_tokens: 50 } },
        ]),
    });
    expect(outcome.denialLed).toBe(true);
    expect(sink.events).toHaveLength(0);
  });

  it("fabricated citations never render mid-stream (held, terminal-stripped)", async () => {
    const sink = sinkSpy();
    await streamAnswer({
      ...BASE,
      sink,
      streamFactory: async () =>
        chunks([
          { choices: [{ delta: { content: FILLER + "A fabricated fact [c999]. A real fact [c1]. " }, finish_reason: "stop" }] },
          { usage: { prompt_tokens: 100, completion_tokens: 50 } },
        ]),
    });
    const texts = sink.events.map((e) => String(e.payload.text));
    expect(texts.some((t) => t.includes("[c999]"))).toBe(false);
    expect(texts.some((t) => t.includes("[c1]"))).toBe(true);
  });
});

describe("watchCancelMarker", () => {
  it("fires onCancel once when the marker exists and stops cleanly", async () => {
    h.queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const onCancel = vi.fn();
    const stop = watchCancelMarker("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", onCancel, 10);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("polling failures are swallowed (a watch error never breaks a paid run)", async () => {
    h.queryMock.mockRejectedValue(new Error("db down"));
    const onCancel = vi.fn();
    const stop = watchCancelMarker("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", onCancel, 10);
    await new Promise((r) => setTimeout(r, 40));
    stop();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
