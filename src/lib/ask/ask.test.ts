import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTerms } from "./retrieve";
import type { CandidateClaim, RankedEvidence, RetrievalV2Result, StageUsage } from "./types";

// Shared mocks, hoisted above the module mocks below (vi.mock factories run first).
const mocks = vi.hoisted(() => ({
  createMock: vi.fn(),
  retrieveMock: vi.fn(),
  retrieveV2Mock: vi.fn(),
  rerankMock: vi.fn(),
  guard: { init: vi.fn(), tryReserve: vi.fn(), record: vi.fn() },
}));

// OpenAI: `new OpenAI()` yields a client whose chat.completions.create is our spy.
vi.mock("openai", () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mocks.createMock } } })),
}));

// retrieve.ts: keep the real extractTerms (its own describe block below), stub retrieve().
vi.mock("./retrieve", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./retrieve")>();
  return { ...actual, retrieve: mocks.retrieveMock };
});

// retrieve-v2 / rerank are workstreams F1/C — replaced wholesale so no DB/LLM loads.
vi.mock("./retrieve-v2", () => ({ retrieveV2: mocks.retrieveV2Mock }));
vi.mock("./rerank", () => ({ rerankCandidates: mocks.rerankMock }));

// llm-guard: keep the real LlmBudgetError + isLlmDisabled (driven via env), swap the guard.
vi.mock("../usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/llm-guard")>();
  return { ...actual, askGuardFromEnv: () => mocks.guard };
});

import { ask, answerFromEvidence } from "./answer";
import { estimateCostUsd } from "./limits";

// ---- fixtures -----------------------------------------------------------------

function candidate(o: Partial<CandidateClaim> & { claimId: number }): CandidateClaim {
  return {
    claimId: o.claimId,
    text: o.text ?? `claim ${o.claimId}`,
    hedging: o.hedging ?? "unknown",
    claimDate: o.claimDate === undefined ? "2026-07-05" : o.claimDate,
    countryIso2: o.countryIso2 ?? "ru",
    track: o.track === undefined ? null : o.track,
    entities: o.entities ?? [],
    confidence: o.confidence === undefined ? null : o.confidence,
    vectorScore: o.vectorScore === undefined ? null : o.vectorScore,
    lexicalHit: o.lexicalHit ?? true,
    compositeScore: o.compositeScore ?? 0,
  };
}

function retrievalV2(o: Partial<RetrievalV2Result> = {}): RetrievalV2Result {
  return {
    claims: o.claims ?? [],
    entities: o.entities ?? [],
    terms: o.terms ?? ["term"],
    window: o.window ?? null,
    totalMatching: o.totalMatching ?? (o.claims?.length ?? 0),
    mode: o.mode ?? "v2",
    embedUsage: o.embedUsage,
  };
}

function ranked(o: Partial<RankedEvidence> = {}): RankedEvidence {
  return { claims: o.claims ?? [], rerankUsed: o.rerankUsed ?? false, rerankUsage: o.rerankUsage };
}

function completion(o: {
  content?: string | null;
  refusal?: string | null;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  return {
    choices: [
      {
        message: { content: o.content ?? null, refusal: o.refusal ?? null },
        finish_reason: o.finishReason ?? "stop",
      },
    ],
    usage: { prompt_tokens: o.promptTokens ?? 100, completion_tokens: o.completionTokens ?? 20 },
  };
}

const EMBED_USAGE: StageUsage = { promptTokens: 12, completionTokens: 0, costUsd: 0.0000012 };
const RERANK_USAGE: StageUsage = { promptTokens: 200, completionTokens: 5, costUsd: 0.000205 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.init.mockResolvedValue(undefined);
  mocks.guard.tryReserve.mockReturnValue({ ok: true });
  mocks.guard.record.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Paid v2 environment: v2 pipeline, key present, no stub/kill. */
function envPaidV2() {
  vi.stubEnv("ASK_PIPELINE", "v2");
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("ANALYSIS_PROVIDER", "");
  vi.stubEnv("LLM_DISABLE", "");
}

describe("extractTerms", () => {
  it("keeps salient tokens, drops stopwords", () => {
    const t = extractTerms("Which Russian officials were prosecuted recently?");
    expect(t).toContain("russian");
    expect(t).toContain("officials");
    expect(t).toContain("prosecuted");
    expect(t).not.toContain("were");
    expect(t).not.toContain("which");
    expect(t).not.toContain("recently");
  });
  it("caps term count and dedupes", () => {
    const t = extractTerms("sanctions sanctions sanctions oil gas oil gas nuclear iran russia china usa");
    expect(t.length).toBeLessThanOrEqual(8);
    expect(new Set(t).size).toBe(t.length);
  });
  it("handles empty/punctuation-only", () => {
    expect(extractTerms("?? !!")).toEqual([]);
  });
});

describe("ask() — legacy pipeline (ASK_PIPELINE unset, faithful rollback)", () => {
  it("runs today's retrieve(limit 40) + one-shot answer, wrapped with neutral v2 fills", async () => {
    vi.stubEnv("ASK_PIPELINE", ""); // not "v2" => legacy
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("ANALYSIS_PROVIDER", "");
    vi.stubEnv("LLM_DISABLE", "");
    vi.stubEnv("OPENAI_MODEL", undefined); // unset => legacy default gpt-4o-mini
    mocks.retrieveMock.mockResolvedValue({
      claims: [{ claimId: 1, text: "A strike hit the depot", hedging: "reported", claimDate: "2026-07-05", countryIso2: "ru", track: null, entities: [] }],
      entities: [],
      terms: ["strike"],
    });
    mocks.createMock.mockResolvedValue(completion({ content: "A strike occurred [c1]." }));

    const res = await ask("what strikes happened?");

    // legacy retrieval only — no v2 stages touched
    expect(mocks.retrieveMock).toHaveBeenCalledWith("what strikes happened?", { limit: 40 });
    expect(mocks.retrieveV2Mock).not.toHaveBeenCalled();
    expect(mocks.rerankMock).not.toHaveBeenCalled();

    // legacy answer shape preserved
    const createArgs = mocks.createMock.mock.calls[0][0];
    expect(createArgs.model).toBe("gpt-4o-mini");
    expect(createArgs.temperature).toBe(0.1);
    expect(createArgs.max_tokens).toBeUndefined();
    expect(createArgs.max_completion_tokens).toBeUndefined();

    expect(res.answer).toBe("A strike occurred [c1].");
    expect(res.citedClaimIds).toEqual([1]);
    expect(res.provider).toBe("openai:gpt-4o-mini");
    expect(res.state).toBe("answered");
    expect(res.usage).toBeDefined();

    // neutral v2 fills
    expect(res.retrievalMode).toBe("legacy");
    expect(res.relatedClaimIds).toEqual([]);
    expect(res.window).toBeNull();
    expect(res.sampled).toBe(false);
    expect(res.totalMatching).toBe(res.evidenceCount);
    // addendum: all three stage-model fields ABSENT on the legacy path
    expect(res.candidatesCount).toBeUndefined();
    expect(res.rerankModel).toBeUndefined();
    expect(res.answerModel).toBeUndefined();
  });

  it("no-evidence legacy short-circuit → insufficient / provider none", async () => {
    vi.stubEnv("ASK_PIPELINE", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.retrieveMock.mockResolvedValue({ claims: [], entities: [], terms: [] });

    const res = await ask("something with no matches");

    expect(mocks.createMock).not.toHaveBeenCalled();
    expect(res.provider).toBe("none");
    expect(res.state).toBe("insufficient");
    expect(res.answer).toMatch(/^No matching evidence/);
    expect(res.retrievalMode).toBe("legacy");
  });
});

describe("ask() — v2 no-evidence short-circuit", () => {
  it("zero candidates AND zero entities → NO rerank, NO LLM call", async () => {
    envPaidV2();
    mocks.retrieveV2Mock.mockResolvedValue(
      retrievalV2({ claims: [], entities: [], terms: ["obscure"], totalMatching: 0, embedUsage: EMBED_USAGE }),
    );

    const res = await ask("obscure question");

    expect(mocks.rerankMock).not.toHaveBeenCalled();
    expect(mocks.createMock).not.toHaveBeenCalled();
    expect(res.state).toBe("insufficient");
    expect(res.provider).toBe("none");
    expect(res.answer).toMatch(/^No matching evidence/);
    expect(res.candidatesCount).toBe(0);
    expect(res.usageByStage?.embed).toEqual(EMBED_USAGE);
  });
});

describe("answerFromEvidence() — v2 answer stage", () => {
  const pool = [
    candidate({ claimId: 1, text: "claim one" }),
    candidate({ claimId: 2, text: "claim two" }),
    candidate({ claimId: 3, text: "claim three" }),
    candidate({ claimId: 4, text: "claim four" }),
    candidate({ claimId: 5, text: "claim five" }),
  ];

  it("happy path: citation filter, related = rerank order minus cited (top 10), usageByStage, spend, gpt-5 params", async () => {
    envPaidV2();
    const retrieval = retrievalV2({
      claims: pool, // pre-rerank pool of 5 => candidatesCount 5
      entities: [{ entityId: 9, name: "FSB", kind: "org", pressure: 3, sanctioned: false }],
      terms: ["strike"],
      totalMatching: 500, // > askCandidates() 300 => sampled
      embedUsage: EMBED_USAGE,
    });
    const rk = ranked({
      claims: [pool[1], pool[0], pool[2]], // reranked order: 2, 1, 3
      rerankUsed: true,
      rerankUsage: RERANK_USAGE,
    });
    // dupes + one id (99) NOT in the shown evidence — both must be dropped
    mocks.createMock.mockResolvedValue(
      completion({ content: "Per [c2] and again [c2], plus [c1]; bogus [c99].", promptTokens: 100, completionTokens: 20 }),
    );

    const res = await answerFromEvidence("what happened?", retrieval, rk);

    // sacred citation filter: dedup + keep only ids in ranked.claims {1,2,3}
    expect(res.citedClaimIds).toEqual([2, 1]);
    // related = ranked order [2,1,3] minus cited {2,1}
    expect(res.relatedClaimIds).toEqual([3]);

    expect(res.provider).toBe("openai:gpt-5");
    expect(res.state).toBe("answered");
    expect(res.retrievalMode).toBe("v2");
    expect(res.rerankUsed).toBe(true);
    expect(res.sampled).toBe(true);
    expect(res.evidenceCount).toBe(4); // 3 ranked claims + 1 entity

    // stage-model fields (addendum): all three present on the paid happy path
    expect(res.candidatesCount).toBe(5);
    expect(res.rerankModel).toBe("gpt-5-mini");
    expect(res.answerModel).toBe("gpt-5");

    // usage assembly
    const expectedCost = estimateCostUsd("gpt-5", 100, 20);
    expect(res.usage).toEqual({ promptTokens: 100, completionTokens: 20, costUsd: expectedCost });
    expect(res.usageByStage).toEqual({
      embed: EMBED_USAGE,
      rerank: RERANK_USAGE,
      answer: { promptTokens: 100, completionTokens: 20, costUsd: expectedCost },
    });

    // guard was reserved and recorded (1 request, tokens, cost)
    expect(mocks.guard.tryReserve).toHaveBeenCalled();
    expect(mocks.guard.record).toHaveBeenCalledWith(1, 120, expectedCost);

    // gpt-5 params: max_completion_tokens (default ceiling 2500 — raised from 1200
    // after live truncations) + reasoning_effort, never temperature
    const createArgs = mocks.createMock.mock.calls[0][0];
    expect(createArgs.model).toBe("gpt-5");
    expect(createArgs.max_completion_tokens).toBe(2500);
    expect(createArgs.reasoning_effort).toBe("low");
    expect(createArgs.temperature).toBeUndefined();
    expect(createArgs.max_tokens).toBeUndefined();
  });

  it("ASK_ANSWER_MAX_OUTPUT_TOKENS env override sets the output ceiling", async () => {
    envPaidV2();
    vi.stubEnv("ASK_ANSWER_MAX_OUTPUT_TOKENS", "3000");
    const retrieval = retrievalV2({ claims: pool.slice(0, 2), totalMatching: 2 });
    const rk = ranked({ claims: pool.slice(0, 2), rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    await answerFromEvidence("q", retrieval, rk);

    expect(mocks.createMock.mock.calls[0][0].max_completion_tokens).toBe(3000);
  });

  it("sampled=false when totalMatching is within the candidate cap", async () => {
    envPaidV2();
    const retrieval = retrievalV2({ claims: pool.slice(0, 3), totalMatching: 3 });
    const rk = ranked({ claims: pool.slice(0, 3), rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    const res = await answerFromEvidence("q", retrieval, rk);
    expect(res.sampled).toBe(false);
    // rerank had no billed call here => rerankModel absent even though answered
    expect(res.rerankModel).toBeUndefined();
    expect(res.answerModel).toBe("gpt-5");
  });

  it("refusal → state 'refused', empty citations, usage still recorded", async () => {
    envPaidV2();
    const retrieval = retrievalV2({ claims: pool, totalMatching: 5 });
    const rk = ranked({ claims: pool.slice(0, 3), rerankUsed: true, rerankUsage: RERANK_USAGE });
    mocks.createMock.mockResolvedValue(completion({ refusal: "I can't help with that.", content: null }));

    const res = await answerFromEvidence("q", retrieval, rk);

    expect(res.state).toBe("refused");
    expect(res.answer).toBe("The model declined to answer this phrasing.");
    expect(res.citedClaimIds).toEqual([]);
    expect(res.usage).toBeDefined(); // billed even though declined
    expect(mocks.guard.record).toHaveBeenCalledTimes(1);
    // a billed answer call happened => answerModel present
    expect(res.answerModel).toBe("gpt-5");
  });

  it("empty/whitespace content WITHOUT finish_reason 'length' → state 'refused'", async () => {
    envPaidV2();
    const retrieval = retrievalV2({ claims: pool, totalMatching: 5 });
    const rk = ranked({ claims: pool.slice(0, 3), rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "   ", finishReason: "stop" }));

    const res = await answerFromEvidence("q", retrieval, rk);
    expect(res.state).toBe("refused");
    expect(res.answer).toBe("The model declined to answer this phrasing.");
    expect(res.citedClaimIds).toEqual([]);
  });

  it("truncation (empty content + finish_reason 'length') → state 'error', distinct message, usage recorded", async () => {
    envPaidV2();
    const retrieval = retrievalV2({ claims: pool, totalMatching: 5 });
    const rk = ranked({ claims: pool.slice(0, 3), rerankUsed: false });
    // reasoning consumed the whole max_completion_tokens budget → no content
    mocks.createMock.mockResolvedValue(
      completion({ content: null, finishReason: "length", promptTokens: 100, completionTokens: 2500 }),
    );

    const res = await answerFromEvidence("q", retrieval, rk);

    expect(res.state).toBe("error"); // NOT "refused" — the model did not decline
    expect(res.answer).toBe(
      "The answer exceeded its output budget — ask a narrower question, or try again.",
    );
    expect(res.citedClaimIds).toEqual([]);
    // billed in full: usage + answerModel still reported, guard recorded
    const expectedCost = estimateCostUsd("gpt-5", 100, 2500);
    expect(res.usage).toEqual({ promptTokens: 100, completionTokens: 2500, costUsd: expectedCost });
    expect(mocks.guard.record).toHaveBeenCalledWith(1, 2600, expectedCost);
    expect(res.answerModel).toBe("gpt-5");
    expect(res.provider).toBe("openai:gpt-5");
  });

  it("budget refusal (tryReserve not ok) → provider 'budget', deterministic claims, NO LLM call", async () => {
    envPaidV2();
    mocks.guard.tryReserve.mockReturnValue({ ok: false, reason: "openai_ask: daily cap reached" });
    const retrieval = retrievalV2({ claims: pool, totalMatching: 5 });
    const rk = ranked({ claims: pool.slice(0, 3), rerankUsed: false });

    const res = await answerFromEvidence("q", retrieval, rk);

    expect(mocks.createMock).not.toHaveBeenCalled();
    expect(mocks.guard.record).not.toHaveBeenCalled();
    expect(res.provider).toBe("budget");
    expect(res.state).toBe("answered");
    expect(res.answer).toMatch(/^Top matching evidence:/);
    expect(res.citedClaimIds).toEqual([1, 2, 3]); // top-6 ranked, cited verbatim
    expect(res.answerModel).toBeUndefined(); // no billed answer call
    expect(res.candidatesCount).toBe(5);
  });

  it("offline (no key) → provider 'stub', deterministic claims, NO LLM/guard call", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", ""); // offline
    const retrieval = retrievalV2({ claims: pool, totalMatching: 5 });
    const rk = ranked({ claims: pool.slice(0, 3), rerankUsed: false }); // no rerankUsage

    const res = await answerFromEvidence("q", retrieval, rk);

    expect(mocks.createMock).not.toHaveBeenCalled();
    expect(mocks.guard.tryReserve).not.toHaveBeenCalled();
    expect(res.provider).toBe("stub");
    expect(res.state).toBe("answered");
    expect(res.citedClaimIds).toEqual([1, 2, 3]);
    // addendum: candidatesCount present, both model fields absent
    expect(res.candidatesCount).toBe(5);
    expect(res.rerankModel).toBeUndefined();
    expect(res.answerModel).toBeUndefined();
  });

  it("serializes one enriched evidence line (D7): iso2/track, date, hedging, reliability, up-to-4 entities", async () => {
    envPaidV2();
    const c = candidate({
      claimId: 42,
      text: "A court convicted the official.",
      hedging: "reported",
      claimDate: "2026-07-05",
      countryIso2: "ru",
      track: "prosecutions",
      confidence: 0.5,
      entities: ["FSB", "GRU", "SVR", "MoD", "overflow"],
    });
    const retrieval = retrievalV2({ claims: [c], totalMatching: 1 });
    const rk = ranked({ claims: [c], rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Noted [c42]." }));

    await answerFromEvidence("q", retrieval, rk);

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain(
      "[c42] (ru/prosecutions, 2026-07-05, reported, reliability 0.50, entities: FSB, GRU, SVR, MoD) A court convicted the official.",
    );
  });

  it("null confidence and undated claim render reliability '?' and 'undated'", async () => {
    envPaidV2();
    const c = candidate({
      claimId: 7,
      text: "Undated unreliable claim.",
      hedging: "unknown",
      claimDate: null,
      countryIso2: "ua",
      track: null,
      confidence: null,
      entities: [],
    });
    const retrieval = retrievalV2({ claims: [c], totalMatching: 1 });
    const rk = ranked({ claims: [c], rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Noted [c7]." }));

    await answerFromEvidence("q", retrieval, rk);

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain(
      "[c7] (ua/-, undated, unknown, reliability ?, entities: ) Undated unreliable claim.",
    );
  });
});
