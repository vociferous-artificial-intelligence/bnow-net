import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpendGuard } from "../usage/spend-guard";

// spend-guard lazily imports @/db only inside a paid call site; set a URL anyway
// so nothing at module load can complain.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// Mock the OpenAI SDK: capture every embeddings.create call, never hit the network.
const { embeddingsCreate } = vi.hoisted(() => ({ embeddingsCreate: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    embeddings = { create: embeddingsCreate };
  },
}));

const {
  embedTexts,
  stubVector,
  truncateInput,
  embedCostUsd,
  embedStubReason,
  EMBED_MAX_INPUT_CHARS,
  EMBED_MAX_INPUTS_PER_REQUEST,
  EMBED_STUB_PROVIDER,
  EMBED_DIMS,
} = await import("./client");

/** OpenAI-style embeddings response. */
function resp(vectors: number[][], totalTokens: number) {
  return {
    data: vectors.map((embedding, index) => ({ index, embedding })),
    usage: { total_tokens: totalTokens },
  };
}

/** Minimal SpendGuard test double recording reserve/record call order. */
function fakeGuard(reserveOk: boolean) {
  const calls: string[] = [];
  const guard = {
    tryReserve: () => {
      calls.push("reserve");
      return reserveOk ? { ok: true } : { ok: false, reason: "test cap reached" };
    },
    record: async (requests: number, units: number, usd: number) => {
      calls.push(`record:${requests}:${units}:${usd.toFixed(6)}`);
    },
  } as unknown as SpendGuard;
  return { guard, calls };
}

beforeEach(() => {
  embeddingsCreate.mockReset();
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.ANALYSIS_PROVIDER;
  delete process.env.LLM_DISABLE;
  delete process.env.ASK_EMBED_MODEL;
});

describe("embedTexts — live (mocked OpenAI)", () => {
  it("splits into <=128-per-request batches", async () => {
    embeddingsCreate.mockImplementation(async ({ input }: { input: string[] }) =>
      resp(
        input.map(() => [1]),
        input.length,
      ),
    );
    const texts = Array.from({ length: EMBED_MAX_INPUTS_PER_REQUEST + 5 }, (_, i) => `t${i}`);
    const out = await embedTexts(texts);
    expect(embeddingsCreate).toHaveBeenCalledTimes(2);
    expect((embeddingsCreate.mock.calls[0][0] as { input: string[] }).input).toHaveLength(
      EMBED_MAX_INPUTS_PER_REQUEST,
    );
    expect((embeddingsCreate.mock.calls[1][0] as { input: string[] }).input).toHaveLength(5);
    expect(out.vectors).toHaveLength(texts.length);
    expect(out.provider).toBe("openai:text-embedding-3-small");
  });

  it("returns vectors in input order even when the API returns them shuffled", async () => {
    embeddingsCreate.mockImplementation(async ({ input }: { input: string[] }) => {
      const data = input.map((_, index) => ({ index, embedding: [index] }));
      return { data: data.reverse(), usage: { total_tokens: input.length } };
    });
    const out = await embedTexts(["a", "b", "c"]);
    expect(out.vectors).toEqual([[0], [1], [2]]);
  });

  it("truncates each input to the per-text char guard before sending", async () => {
    embeddingsCreate.mockImplementation(async ({ input }: { input: string[] }) =>
      resp(
        input.map(() => [1]),
        1,
      ),
    );
    const long = "x".repeat(EMBED_MAX_INPUT_CHARS + 500);
    await embedTexts([long]);
    const sent = (embeddingsCreate.mock.calls[0][0] as { input: string[] }).input[0];
    expect(sent).toHaveLength(EMBED_MAX_INPUT_CHARS);
  });

  it("uses ASK_EMBED_MODEL when set", async () => {
    process.env.ASK_EMBED_MODEL = "text-embedding-3-large";
    embeddingsCreate.mockImplementation(async ({ input }: { input: string[] }) =>
      resp(
        input.map(() => [1]),
        1,
      ),
    );
    const out = await embedTexts(["a"]);
    expect((embeddingsCreate.mock.calls[0][0] as { model: string }).model).toBe(
      "text-embedding-3-large",
    );
    expect(out.provider).toBe("openai:text-embedding-3-large");
  });
});

describe("embedTexts — guard metering order", () => {
  it("reserves BEFORE the call and records AFTER, with measured cost/tokens", async () => {
    const { guard, calls } = fakeGuard(true);
    embeddingsCreate.mockImplementation(async ({ input }: { input: string[] }) => {
      // the reservation must already have happened when the API call fires
      expect(calls).toEqual(["reserve"]);
      return resp(
        input.map(() => [1]),
        42,
      );
    });
    const out = await embedTexts(["a", "b"], { guard });
    expect(calls[0]).toBe("reserve");
    expect(calls[1]).toBe(`record:1:2:${embedCostUsd(42).toFixed(6)}`);
    expect(out.tokens).toBe(42);
    expect(out.costUsd).toBeCloseTo(embedCostUsd(42), 12);
  });

  it("throws LlmBudgetError BEFORE any API call when the guard refuses", async () => {
    const { guard, calls } = fakeGuard(false);
    await expect(embedTexts(["a"], { guard })).rejects.toMatchObject({ code: "LLM_BUDGET" });
    expect(embeddingsCreate).not.toHaveBeenCalled();
    expect(calls).toEqual(["reserve"]); // reserved, refused, never recorded
  });
});

describe("embedTexts — stub path (fail toward offline/deterministic)", () => {
  it("with no OPENAI_API_KEY: deterministic unit-norm vectors, no network, cost 0", async () => {
    delete process.env.OPENAI_API_KEY;
    const a = await embedTexts(["hello", "world"]);
    const b = await embedTexts(["hello", "world"]);
    expect(embeddingsCreate).not.toHaveBeenCalled();
    expect(a.provider).toBe(EMBED_STUB_PROVIDER);
    expect(a.tokens).toBe(0);
    expect(a.costUsd).toBe(0);
    expect(a.vectors).toEqual(b.vectors); // determinism
    expect(a.vectors[0]).not.toEqual(a.vectors[1]); // distinct texts -> distinct vectors
    for (const v of a.vectors) {
      expect(v).toHaveLength(EMBED_DIMS);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 6);
    }
  });

  it("embedStubReason reports each trigger in priority order", () => {
    process.env.LLM_DISABLE = "1";
    expect(embedStubReason()).toBe("LLM_DISABLE=1");
    delete process.env.LLM_DISABLE;
    process.env.ANALYSIS_PROVIDER = "stub";
    expect(embedStubReason()).toBe("ANALYSIS_PROVIDER=stub");
    delete process.env.ANALYSIS_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    expect(embedStubReason()).toBe("no OPENAI_API_KEY");
    process.env.OPENAI_API_KEY = "sk-test";
    expect(embedStubReason()).toBeNull();
  });
});

describe("stubVector + truncateInput units", () => {
  it("stubVector is deterministic, 1536-dim, unit-norm, text-sensitive", () => {
    expect(stubVector("abc")).toEqual(stubVector("abc"));
    expect(stubVector("abc")).not.toEqual(stubVector("abd"));
    const v = stubVector("abc");
    expect(v).toHaveLength(EMBED_DIMS);
    expect(Math.sqrt(v.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 6);
  });

  it("truncateInput caps at the guard length, leaves short text untouched", () => {
    expect(truncateInput("short")).toBe("short");
    expect(truncateInput("y".repeat(EMBED_MAX_INPUT_CHARS + 1))).toHaveLength(EMBED_MAX_INPUT_CHARS);
  });
});
