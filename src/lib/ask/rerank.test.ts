import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateCostUsd } from "./limits";
import type { CandidateClaim } from "./types";

// --- hoisted mocks (factories run before module-level consts) -----------------
const { createMock, chatParamsMock, guardFactoryMock, initMock, reserveMock, recordMock, order } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    chatParamsMock: vi.fn(),
    guardFactoryMock: vi.fn(),
    initMock: vi.fn(),
    reserveMock: vi.fn(),
    recordMock: vi.fn(),
    order: [] as string[],
  }));

// The OpenAI client is mocked ENTIRELY — no rerank test ever makes a paid call.
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

// Workstream D's module — provided by factory (vi.mock serves it before the
// import graph resolves, so the real file need not exist yet).
vi.mock("./llm-params", () => ({ chatParamsForModel: chatParamsMock }));

// Workstream E adds askGuardFromEnv to the real llm-guard; keep the rest of the
// module (isLlmDisabled reads process.env) and inject the guard factory.
vi.mock("../usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/llm-guard")>();
  return { ...actual, askGuardFromEnv: guardFactoryMock };
});

import {
  rerankCandidates,
  serializeCandidate,
  serializeCandidates,
  parseRerankIds,
  parseRerankResponse,
  rerankResponseSchema,
  rerankOfflineReason,
  RERANK_SNIPPET_CHARS,
  RERANK_MAX_OUTPUT_TOKENS,
} from "./rerank";

// --- fixtures -----------------------------------------------------------------
function cand(id: number, over: Partial<CandidateClaim> = {}): CandidateClaim {
  return {
    claimId: id,
    text: `claim ${id} text`,
    hedging: "unknown",
    claimDate: "2026-07-11",
    countryIso2: "ru",
    track: "military",
    entities: [],
    confidence: null,
    vectorScore: null,
    lexicalHit: true,
    compositeScore: 0,
    ...over,
  };
}

/** Candidates in composite order (array order == compositeScore DESC). */
function pool(ids: number[]): CandidateClaim[] {
  return ids.map((id, i) => cand(id, { compositeScore: ids.length - i }));
}

interface Completion {
  choices: Array<{ message: { content: string | null }; finish_reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}
function completion(
  content: string | null,
  usage = { prompt_tokens: 1000, completion_tokens: 50 },
): Completion {
  return { choices: [{ message: { content }, finish_reason: "stop" }], usage };
}
const idsResponse = (ids: number[], relevantCount?: number) =>
  completion(JSON.stringify(relevantCount === undefined ? { ids } : { ids, relevant_count: relevantCount }));

interface CreateArg {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format: {
    json_schema: {
      name: string;
      strict: boolean;
      schema: { properties: { ids: { minItems: number; maxItems: number; items: { type: string } } } };
    };
  };
  max_completion_tokens?: number;
  reasoning_effort?: string;
}
const firstCreateArg = () => createMock.mock.calls[0][0] as CreateArg;

// mutable per-test knobs the mock implementations return
let reserveResult: { ok: true } | { ok: false; reason: string };
let completionResult: Completion;

const ENV_KEYS = ["OPENAI_API_KEY", "ANALYSIS_PROVIDER", "LLM_DISABLE", "ASK_RERANK_MODEL", "ASK_EVIDENCE_K"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  vi.clearAllMocks();
  order.length = 0;
  reserveResult = { ok: true };
  completionResult = idsResponse([8, 6, 4, 2]);

  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.ANALYSIS_PROVIDER;
  delete process.env.LLM_DISABLE;
  delete process.env.ASK_RERANK_MODEL; // default model gpt-5-mini
  delete process.env.ASK_EVIDENCE_K;

  initMock.mockImplementation(async () => {
    order.push("init");
  });
  reserveMock.mockImplementation(() => {
    order.push("reserve");
    return reserveResult;
  });
  recordMock.mockImplementation(async () => {
    order.push("record");
  });
  createMock.mockImplementation(async () => {
    order.push("create");
    return completionResult;
  });
  chatParamsMock.mockReturnValue({ max_completion_tokens: RERANK_MAX_OUTPUT_TOKENS, reasoning_effort: "minimal" });
  guardFactoryMock.mockReturnValue({ init: initMock, tryReserve: reserveMock, record: recordMock });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ids = (r: { claims: CandidateClaim[] }) => r.claims.map((c) => c.claimId);

// --- pure helpers -------------------------------------------------------------
describe("serialization", () => {
  it("one tab-separated line per candidate: id, date, iso2, clipped text", () => {
    const line = serializeCandidate(cand(42, { claimDate: "2026-07-01", countryIso2: "ua", text: "  a  b\tc  " }));
    expect(line).toBe("42\t2026-07-01\tua\ta b c");
    expect(line.split("\t")).toHaveLength(4);
  });

  it("clips text to RERANK_SNIPPET_CHARS and marks null dates undated", () => {
    const long = "x".repeat(500);
    const line = serializeCandidate(cand(1, { claimDate: null, text: long }));
    const parts = line.split("\t");
    expect(parts[1]).toBe("undated");
    expect(parts[3]).toHaveLength(RERANK_SNIPPET_CHARS);
  });

  it("prepends a single column header", () => {
    const block = serializeCandidates(pool([1, 2]));
    const lines = block.split("\n");
    expect(lines[0]).toBe("id\tdate\tiso2\ttext");
    expect(lines).toHaveLength(3);
  });
});

describe("rerankResponseSchema", () => {
  it("pins integer items with minItems = maxItems = k (ruling 7)", () => {
    const s = rerankResponseSchema(7);
    expect(s.properties.ids.minItems).toBe(7);
    expect(s.properties.ids.maxItems).toBe(7);
    expect(s.properties.ids.items).toEqual({ type: "integer" });
  });

  it("requires a bounded relevant_count (Workstream D relevance boundary)", () => {
    const s = rerankResponseSchema(7);
    // Strict structured outputs reject optional properties, so relevant_count is
    // REQUIRED and bounded — the model always states its relevance boundary.
    expect(s.properties.relevant_count).toEqual({ type: "integer", minimum: 0, maximum: 7 });
    expect(s.required).toEqual(["ids", "relevant_count"]);
    expect(s.additionalProperties).toBe(false);
  });
});

describe("parseRerankResponse — relevant_count validation", () => {
  it("accepts an in-range integer count", () => {
    expect(parseRerankResponse('{"ids":[3,1,2],"relevant_count":2}', 3)).toEqual({
      ids: [3, 1, 2],
      relevantCount: 2,
    });
  });
  it("accepts zero — the genuine none-relevant outcome", () => {
    expect(parseRerankResponse('{"ids":[3,1,2],"relevant_count":0}', 3)!.relevantCount).toBe(0);
  });
  it.each([
    ['{"ids":[1,2],"relevant_count":-1}'],
    ['{"ids":[1,2],"relevant_count":99}'],
    ['{"ids":[1,2],"relevant_count":1.5}'],
    ['{"ids":[1,2],"relevant_count":"2"}'],
    ['{"ids":[1,2]}'],
  ])("maps malformed/absent count to null (fail-open) for %s", (raw) => {
    const out = parseRerankResponse(raw, 2);
    expect(out).not.toBeNull();
    expect(out!.relevantCount).toBeNull();
  });
  it("keeps the null-on-garbage contract for the whole payload", () => {
    expect(parseRerankResponse("not json{{", 5)).toBeNull();
    expect(parseRerankResponse('{"nope":1}', 5)).toBeNull();
  });
});

describe("parseRerankIds", () => {
  it("parses the {ids:[...]} wrapper", () => {
    expect(parseRerankIds('{"ids":[3,1,2]}')).toEqual([3, 1, 2]);
  });
  it("tolerates a bare array", () => {
    expect(parseRerankIds("[5,4]")).toEqual([5, 4]);
  });
  it("coerces numeric strings and truncates floats", () => {
    expect(parseRerankIds('{"ids":["7",2.9,3]}')).toEqual([7, 2, 3]);
  });
  it("drops non-numeric entries", () => {
    expect(parseRerankIds('{"ids":[1,"abc",null,2]}')).toEqual([1, 2]);
  });
  it("returns null for malformed / empty / non-array payloads", () => {
    expect(parseRerankIds("not json{{")).toBeNull();
    expect(parseRerankIds("")).toBeNull();
    expect(parseRerankIds(null)).toBeNull();
    expect(parseRerankIds('{"nope":1}')).toBeNull();
  });
});

describe("rerankOfflineReason", () => {
  it("null when a real call is allowed, non-null offline", () => {
    expect(rerankOfflineReason()).toBeNull();
    delete process.env.OPENAI_API_KEY;
    expect(rerankOfflineReason()).toBe("no OPENAI_API_KEY");
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANALYSIS_PROVIDER = "stub";
    expect(rerankOfflineReason()).toBe("ANALYSIS_PROVIDER=stub");
    process.env.LLM_DISABLE = "1";
    expect(rerankOfflineReason()).toBe("LLM_DISABLE=1");
  });
});

// --- rerankCandidates ---------------------------------------------------------
describe("rerankCandidates — deterministic short-circuits", () => {
  it("pool already fits (length <= k): composite order, no call, no guard", async () => {
    const res = await rerankCandidates("q", pool([1, 2, 3]), 4);
    expect(ids(res)).toEqual([1, 2, 3]);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage).toBeUndefined();
    expect(guardFactoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("length == k also short-circuits", async () => {
    const res = await rerankCandidates("q", pool([1, 2, 3, 4]), 4);
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    expect(res.rerankUsed).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("k defaults to askEvidenceK() (60) — a small pool short-circuits with no call", async () => {
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5]));
    expect(res.rerankUsed).toBe(false);
    expect(guardFactoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no OPENAI_API_KEY", () => delete process.env.OPENAI_API_KEY],
    ["ANALYSIS_PROVIDER=stub", () => (process.env.ANALYSIS_PROVIDER = "stub")],
    ["LLM_DISABLE=1", () => (process.env.LLM_DISABLE = "1")],
  ])("offline (%s): composite fallback, no guard init, no call", async (_label, setEnv) => {
    setEnv();
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage).toBeUndefined();
    expect(guardFactoryMock).not.toHaveBeenCalled();
    expect(initMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("rerankCandidates — happy path", () => {
  it("returns the reranked order, rerankUsed true, with usage", async () => {
    completionResult = idsResponse([8, 6, 4, 2]);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([8, 6, 4, 2]);
    expect(res.rerankUsed).toBe(true);
    expect(res.rerankUsage).toEqual({
      promptTokens: 1000,
      completionTokens: 50,
      costUsd: estimateCostUsd("gpt-5-mini", 1000, 50),
    });
  });

  it("propagates a validated relevant count (Workstream D)", async () => {
    completionResult = idsResponse([8, 6, 4, 2], 2);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(res.relevantCount).toBe(2);
    expect(ids(res)).toEqual([8, 6, 4, 2]);
  });

  it("propagates relevant_count=0 — the genuine none-relevant outcome", async () => {
    completionResult = idsResponse([8, 6, 4, 2], 0);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(res.relevantCount).toBe(0);
    expect(res.rerankUsed).toBe(true); // the ranking itself is still used
  });

  it("shrinks the relevant count when validation drops an id inside the prefix", async () => {
    // Model says the first 3 are relevant, but 999 is hallucinated: 2 survive.
    completionResult = idsResponse([8, 999, 6, 4], 3);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(res.relevantCount).toBe(2);
  });

  it("leaves relevantCount undefined when the model omitted/malformed it (fail-open)", async () => {
    completionResult = idsResponse([8, 6, 4, 2]); // no relevant_count key
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(res.relevantCount).toBeUndefined();
  });

  it("trims to k when the model overproduces", async () => {
    completionResult = idsResponse([8, 7, 6, 5, 4]); // 5 valid ids, k=4
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([8, 7, 6, 5]);
    expect(res.rerankUsed).toBe(true);
  });

  it("tops up from composite order when fewer than k valid ids come back", async () => {
    completionResult = idsResponse([8, 6]); // 2 valid, k=4, minValid=2 -> passes
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    // reranked prefix, then composite order skipping already-picked {8,6}
    expect(ids(res)).toEqual([8, 6, 1, 2]);
    expect(res.rerankUsed).toBe(true);
  });

  it("drops unknown ids and dedupes keeping first occurrence", async () => {
    completionResult = idsResponse([8, 999, 8, 6, 2, 6]);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    // 999 dropped (not a candidate), duplicate 8/6 collapsed -> [8,6,2] then top-up 1
    expect(ids(res)).toEqual([8, 6, 2, 1]);
    expect(res.claims.map((c) => c.claimId)).not.toContain(999);
    expect(res.rerankUsed).toBe(true);
  });

  it("full-k response with a few unknown ids still clears ceil(k/2) and tops up to k", async () => {
    // exactly-k=4 response (the minItems=maxItems=k schema shape) where the
    // model slipped in one hallucinated id: 3 valid >= ceil(4/2)=2 -> reranked
    // prefix survives and composite top-up restores the full k
    completionResult = idsResponse([8, 999, 6, 4]);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([8, 6, 4, 1]);
    expect(res.claims).toHaveLength(4);
    expect(res.rerankUsed).toBe(true);
    expect(res.rerankUsage).toBeDefined();
  });

  it("reserves BEFORE the request and records AFTER", async () => {
    await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(order).toEqual(["init", "reserve", "create", "record"]);
    // units = real token count (F14 fix, Phase 1): 1000 prompt + 50 completion.
    expect(recordMock).toHaveBeenCalledWith(1, 1050, estimateCostUsd("gpt-5-mini", 1000, 50));
  });

  it("passes RERANK_MAX_OUTPUT_TOKENS + reasoningEffort minimal to chatParamsForModel and spreads them", async () => {
    await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(chatParamsMock).toHaveBeenCalledWith("gpt-5-mini", RERANK_MAX_OUTPUT_TOKENS, {
      reasoningEffort: "minimal",
    });
    const arg = firstCreateArg();
    expect(arg.model).toBe("gpt-5-mini");
    expect(arg.max_completion_tokens).toBe(RERANK_MAX_OUTPUT_TOKENS);
    expect(arg.reasoning_effort).toBe("minimal");
    expect(arg.response_format.json_schema.strict).toBe(true);
    expect(arg.response_format.json_schema.schema.properties.ids.minItems).toBe(4);
    expect(arg.response_format.json_schema.schema.properties.ids.maxItems).toBe(4);
  });
});

describe("rerankCandidates — failure falls back, never throws", () => {
  it("malformed JSON: composite fallback, usage still recorded (billed)", async () => {
    completionResult = completion("not json{{");
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage?.costUsd).toBe(estimateCostUsd("gpt-5-mini", 1000, 50));
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("empty response content: composite fallback, usage recorded", async () => {
    completionResult = completion(null);
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage).toBeDefined();
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("fewer than ceil(k/2) valid ids: composite fallback, usage recorded", async () => {
    completionResult = idsResponse([999, 8]); // only 1 valid, minValid = 2
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage).toBeDefined();
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("guard refusal: composite fallback, NO OpenAI call, NO usage", async () => {
    reserveResult = { ok: false, reason: "openai_ask: total cap env unset — failing closed" };
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage).toBeUndefined();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("provider error thrown by the client: composite fallback, no usage (nothing billed)", async () => {
    createMock.mockImplementation(async () => {
      order.push("create");
      throw new Error("503 upstream");
    });
    const res = await rerankCandidates("q", pool([1, 2, 3, 4, 5, 6, 7, 8]), 4);
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    expect(res.rerankUsed).toBe(false);
    expect(res.rerankUsage).toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
