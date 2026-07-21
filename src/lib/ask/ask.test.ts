import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTerms } from "./retrieve";
import type { CandidateClaim, RankedEvidence, RetrievalV2Result, StageUsage } from "./types";

// Shared mocks, hoisted above the module mocks below (vi.mock factories run first).
const mocks = vi.hoisted(() => ({
  createMock: vi.fn(),
  retrieveMock: vi.fn(),
  retrieveV2Mock: vi.fn(),
  rerankMock: vi.fn(),
  currencyMock: vi.fn(),
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

// currency: mocked so no DB is touched and each test drives the corpus-currency read.
vi.mock("./currency", () => ({
  dataCurrentThrough: mocks.currencyMock,
  _resetCurrencyCacheForTests: vi.fn(),
}));

// llm-guard: keep the real LlmBudgetError + isLlmDisabled (driven via env), swap the guard.
vi.mock("../usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/llm-guard")>();
  return { ...actual, askGuardFromEnv: () => mocks.guard };
});

import { ask, answerFromEvidence, beginsWithDenial, SYSTEM_V2 } from "./answer";
import { estimateCostUsd } from "./limits";
import {
  DENIAL_LANGUAGE_PATTERN,
  isNegativeAnswerHonest,
  NEGATIVE_DENIAL_LEAD_CHARS,
} from "./eval-run";

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
  return {
    claims: o.claims ?? [],
    rerankUsed: o.rerankUsed ?? false,
    rerankUsage: o.rerankUsage,
    ...(o.relevantCount !== undefined ? { relevantCount: o.relevantCount } : {}),
  };
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
  // Default: currency unknown → no short-circuit, no context line, no field. Tests
  // that exercise currency override this per-case.
  mocks.currencyMock.mockResolvedValue(null);
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

describe("ask() — legacy pipeline (ASK_PIPELINE=legacy, faithful rollback)", () => {
  it("runs today's retrieve(limit 40) + one-shot answer, wrapped with neutral v2 fills", async () => {
    vi.stubEnv("ASK_PIPELINE", "legacy"); // exact-match rollback (default is v2 since the 2026-07-11 flip)
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
    vi.stubEnv("ASK_PIPELINE", "legacy");
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
    candidate({ claimId: 3, text: "claim three", vectorScore: 0.6 }), // clears the 0.5 floor (W4)
    candidate({ claimId: 4, text: "claim four", vectorScore: 0.3 }), // below the floor -> dropped
    candidate({ claimId: 5, text: "claim five" }), // vectorScore null (lexical-only) -> dropped
  ];

  it("happy path: citation filter, related floored+capped (uncited, vectorScore >= floor, ranked order), usageByStage, spend, gpt-5 params", async () => {
    envPaidV2();
    const retrieval = retrievalV2({
      claims: pool, // pre-rerank pool of 5 => candidatesCount 5
      entities: [{ entityId: 9, name: "FSB", kind: "org", pressure: 3 }],
      terms: ["strike"],
      totalMatching: 500, // > askCandidates() 300 => sampled
      embedUsage: EMBED_USAGE,
    });
    const rk = ranked({
      claims: [pool[1], pool[0], pool[2], pool[3], pool[4]], // reranked order: 2, 1, 3, 4, 5
      rerankUsed: true,
      rerankUsage: RERANK_USAGE,
    });
    // dupes + one id (99) NOT in the shown evidence — both must be dropped
    mocks.createMock.mockResolvedValue(
      completion({ content: "Per [c2] and again [c2], plus [c1]; bogus [c99].", promptTokens: 100, completionTokens: 20 }),
    );

    const res = await answerFromEvidence("what happened?", retrieval, rk);

    // sacred citation filter: dedup + keep only ids in ranked.claims {1,2,3,4,5}
    expect(res.citedClaimIds).toEqual([2, 1]);
    // related = uncited ranked order [3,4,5] floored at 0.5 (W4): 3 (0.6) survives,
    // 4 (0.3, below floor) and 5 (null, lexical-only) are dropped
    expect(res.relatedClaimIds).toEqual([3]);

    expect(res.provider).toBe("openai:gpt-5");
    expect(res.state).toBe("answered");
    expect(res.retrievalMode).toBe("v2");
    expect(res.rerankUsed).toBe(true);
    expect(res.sampled).toBe(true);
    expect(res.evidenceCount).toBe(6); // 5 ranked claims + 1 entity

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

// ---- 2026-07-21 match-safety ruling: no OpenSanctions categorical assertions ----

describe("Ask prompts carry no OpenSanctions-derived categorical entity assertion", () => {
  it("v2 evidence block: entity lines have no SANCTIONED/PEP marker; source-backed sanctions claim text still flows", async () => {
    envPaidV2();
    const c = candidate({
      claimId: 11,
      text: "OFAC sanctioned Aurora Logistics LLC on 2026-06-01, freezing its US assets.",
      hedging: "confirmed",
    });
    const retrieval = retrievalV2({
      claims: [c],
      entities: [{ entityId: 9, name: "Aurora Logistics LLC", kind: "company", pressure: 2 }],
      totalMatching: 1,
    });
    const rk = ranked({ claims: [c], rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Noted [c11]." }));

    await answerFromEvidence("was aurora logistics sanctioned?", retrieval, rk);

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    // ordinary claim evidence about a sanctions ACTION flows through verbatim
    expect(userMessage).toContain(
      "OFAC sanctioned Aurora Logistics LLC on 2026-06-01, freezing its US assets.",
    );
    // …but the entity line carries no categorical marker
    expect(userMessage).toContain("[e9] Aurora Logistics LLC (company, pressure 2)");
    expect(userMessage).not.toContain("SANCTIONED");
    expect(userMessage).not.toMatch(/\bPEP\b/);
  });

  it("legacy evidence block: entity lines have no SANCTIONED marker either", async () => {
    vi.stubEnv("ASK_PIPELINE", "legacy");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("ANALYSIS_PROVIDER", "");
    vi.stubEnv("LLM_DISABLE", "");
    mocks.retrieveMock.mockResolvedValue({
      claims: [
        {
          claimId: 3,
          text: "The EU added two officials to its sanctions list.",
          hedging: "reported",
          claimDate: "2026-07-05",
          countryIso2: "ru",
          track: null,
          entities: [],
        },
      ],
      entities: [{ entityId: 9, name: "FSB", kind: "org", pressure: 3 }],
      terms: ["sanctions"],
    });
    mocks.createMock.mockResolvedValue(completion({ content: "Reported [c3]." }));

    await ask("who was sanctioned?");

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain("The EU added two officials to its sanctions list.");
    expect(userMessage).toContain("[e9] FSB (org, pressure 3)");
    expect(userMessage).not.toContain("SANCTIONED");
  });
});

// ---- W1: no-coverage short-circuit ($0, before retrieveV2) --------------------

describe("ask() — no-coverage short-circuit (W1)", () => {
  it("fires when the window begins entirely after currency: NO retrieveV2/rerank/LLM, $0 payload", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2000-01-01"); // corpus ends long ago

    const res = await ask("did russia strike kyiv today"); // window.from = real today > 2000

    expect(mocks.retrieveV2Mock).not.toHaveBeenCalled();
    expect(mocks.rerankMock).not.toHaveBeenCalled();
    expect(mocks.createMock).not.toHaveBeenCalled();

    expect(res.state).toBe("insufficient");
    expect(res.provider).toBe("none");
    expect(res.retrievalMode).toBe("v2"); // NOT "v2-lexical-only" (degraded-run tell)
    expect(res.candidatesCount).toBe(0);
    expect(res.citedClaimIds).toEqual([]);
    expect(res.relatedClaimIds).toEqual([]);
    expect(res.evidenceCount).toBe(0);
    expect(res.totalMatching).toBe(0);
    expect(res.sampled).toBe(false);
    expect(res.rerankUsed).toBe(false);
    expect(res.dataCurrentThrough).toBe("2000-01-01");
    expect(res.window?.from).toBeTruthy();
    // cost-free shape: no answer-stage usage recorded at all
    expect(res.usage).toBeUndefined();
    expect(res.usageByStage).toBeUndefined();
  });

  it("does NOT fire when window.from == currency (boundary, strict >)", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-12");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [] }));

    const res = await ask("what changed since 2026-07-12"); // window.from == currency

    expect(mocks.retrieveV2Mock).toHaveBeenCalled();
    expect(res.provider).toBe("none"); // fell through to the empty-retrieval path
  });

  it("does NOT fire when the window straddles/predates currency", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-05");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [] }));

    await ask("strikes since 2000-01-01"); // from 2000 <= currency

    expect(mocks.retrieveV2Mock).toHaveBeenCalled();
  });

  it("does NOT fire when the question has no time window", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2000-01-01");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [] }));

    await ask("russia ukraine strikes"); // parseTimeWindow → null

    expect(mocks.retrieveV2Mock).toHaveBeenCalled();
  });

  it("does NOT fire when currency is null (fail open to the real pipeline)", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue(null);
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [] }));

    await ask("did russia strike kyiv today");

    expect(mocks.retrieveV2Mock).toHaveBeenCalled();
  });

  it("does NOT fire when the env knob is off (ASK_NO_COVERAGE_SHORTCIRCUIT=0)", async () => {
    envPaidV2();
    vi.stubEnv("ASK_NO_COVERAGE_SHORTCIRCUIT", "0");
    mocks.currencyMock.mockResolvedValue("2000-01-01");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [] }));

    await ask("did russia strike kyiv today"); // would fire if the knob were on

    expect(mocks.retrieveV2Mock).toHaveBeenCalled();
  });

  it("no-evidence path carries the currency through to the payload", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-05");
    mocks.retrieveV2Mock.mockResolvedValue(
      retrievalV2({ claims: [], entities: [], totalMatching: 0 }),
    );

    const res = await ask("obscure topic with no matches");

    expect(res.state).toBe("insufficient");
    expect(res.dataCurrentThrough).toBe("2026-07-05");
  });
});

// ---- W1: currency context line on the answer stage ---------------------------

describe("answerFromEvidence() — currency context (W1)", () => {
  const pool = [candidate({ claimId: 1, text: "claim one" }), candidate({ claimId: 2, text: "claim two" })];

  it("appends a currency + window line to the USER message and sets dataCurrentThrough", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-11");
    const retrieval = retrievalV2({
      claims: pool,
      totalMatching: 2,
      window: { from: "2026-07-01", to: "2026-07-10", matchedPhrase: "last week" },
    });
    const rk = ranked({ claims: pool, rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    const res = await answerFromEvidence("q", retrieval, rk);

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain("Data current through: 2026-07-11 (UTC).");
    expect(userMessage).toContain("Question window: 2026-07-01..2026-07-10");
    expect(res.dataCurrentThrough).toBe("2026-07-11");
    // the system prompt is SYSTEM_V2, not the legacy SYSTEM
    expect(mocks.createMock.mock.calls[0][0].messages[0].content).toBe(SYSTEM_V2);
  });

  it("omits the window line when the question carried no window", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-11");
    const retrieval = retrievalV2({ claims: pool, totalMatching: 2, window: null });
    const rk = ranked({ claims: pool, rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    await answerFromEvidence("q", retrieval, rk);

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain("Data current through: 2026-07-11 (UTC).");
    expect(userMessage).not.toContain("Question window:");
  });

  it("omits the currency line entirely when currency is null", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue(null);
    const retrieval = retrievalV2({ claims: pool, totalMatching: 2 });
    const rk = ranked({ claims: pool, rerankUsed: false });
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    const res = await answerFromEvidence("q", retrieval, rk);

    const userMessage = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).not.toContain("Data current through");
    expect(res.dataCurrentThrough).toBeUndefined();
  });
});

// ---- W1: persona + legacy rollback guard --------------------------------------

/** FROZEN legacy system prompt — a byte-for-byte copy of the SYSTEM const in
 *  answer.ts. Guards the ASK_PIPELINE=legacy rollback: any edit to the legacy prompt
 *  string breaks this, since the legacy path must send it unchanged. */
const FROZEN_LEGACY_SYSTEM = `You answer questions about geopolitical/OSINT intelligence STRICTLY from the provided evidence rows (claims + entities from the BNOW database). Rules:
1. Use ONLY the evidence provided. Never use outside knowledge or invent facts.
2. Cite the claim ids you rely on inline as [c<ID>] (e.g. [c1438]). Every factual sentence needs a citation.
3. If the evidence is insufficient to answer, say so plainly and suggest a narrower question. Do not speculate.
4. Be concise (<= 180 words). Note hedging where relevant ("reportedly", "unverified").
5. These are open-source-derived claims of varying reliability, not confirmed truth — reflect that.`;

describe("SYSTEM_V2 persona + legacy rollback (W1)", () => {
  it("addresses the END USER and forbids requesting claim ids / pipeline internals", () => {
    expect(SYSTEM_V2.toLowerCase()).toContain("end user");
    // no instruction telling the reader to hand over ids/datasets — the persona
    // explicitly PROHIBITS it (case-insensitive on "never ask the reader")
    expect(/never ask the reader/i.test(SYSTEM_V2)).toBe(true);
    expect(/claim ids/i.test(SYSTEM_V2)).toBe(true);
  });

  it("retains the citation instruction, the <=180-word cap, hedging + reliability framing", () => {
    expect(SYSTEM_V2).toContain("[c<ID>]");
    expect(SYSTEM_V2).toContain("<= 180 words");
    expect(SYSTEM_V2).toContain("hedging");
    expect(SYSTEM_V2.toLowerCase()).toContain("open-source-derived");
    // insufficient-vs-refusal distinction preserved
    expect(SYSTEM_V2.toLowerCase()).toContain("not a refusal");
  });

  it("instructs honest denials to LEAD with denial phrasing the honesty metric recognizes", () => {
    // the leading example phrasing must itself trip DENIAL_LANGUAGE_PATTERN
    expect(DENIAL_LANGUAGE_PATTERN.test("No claims in the covered data address that.")).toBe(true);
    expect(DENIAL_LANGUAGE_PATTERN.test("The evidence is insufficient to determine that.")).toBe(true);
  });

  it("legacy path sends the byte-identical frozen SYSTEM (ASK_PIPELINE=legacy rollback)", async () => {
    vi.stubEnv("ASK_PIPELINE", "legacy");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("ANALYSIS_PROVIDER", "");
    vi.stubEnv("LLM_DISABLE", "");
    mocks.retrieveMock.mockResolvedValue({
      claims: [{ claimId: 1, text: "x", hedging: "reported", claimDate: "2026-07-05", countryIso2: "ru", track: null, entities: [] }],
      entities: [],
      terms: ["x"],
    });
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    await ask("q");

    expect(mocks.createMock.mock.calls[0][0].messages[0].content).toBe(FROZEN_LEGACY_SYSTEM);
  });
});

// ---- W1: denial-language compatibility ---------------------------------------

describe("denial-language compatibility (W1)", () => {
  it("the short-circuit payload answer reads as an honest denial", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2000-01-01");

    const res = await ask("did russia strike kyiv today");

    expect(res.answer.startsWith("No claims yet cover")).toBe(true);
    expect(DENIAL_LANGUAGE_PATTERN.test(res.answer.slice(0, NEGATIVE_DENIAL_LEAD_CHARS))).toBe(true);
  });
});

// ---- Workstream D (2026-07-13): relevance boundary + negative-control honesty ------

describe("relevance boundary — negative controls stop before the answer model", () => {
  const pool = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      candidate({ claimId: i + 1, text: `Ukraine/Iran evidence row ${i + 1}`, vectorScore: 0.7 }),
    );

  function offTopicScenario(question: string) {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-13");
    const retrieval = retrievalV2({ claims: pool(5), entities: [], totalMatching: 156 });
    const rk = ranked({
      claims: pool(5),
      rerankUsed: true,
      rerankUsage: RERANK_USAGE,
      relevantCount: 0,
    });
    return answerFromEvidence(question, retrieval, rk);
  }

  it("Antarctic negative control: insufficient, zero citations, zero related, no paid answer call", async () => {
    const res = await offTopicScenario(
      "What significant operational changes occurred at Antarctic research stations since July 9, 2026?",
    );
    expect(res.state).toBe("insufficient");
    expect(res.citedClaimIds).toEqual([]);
    expect(res.relatedClaimIds).toEqual([]);
    expect(res.evidenceCount).toBe(0);
    expect(res.provider).toBe("none");
    expect(res.relevantCount).toBe(0);
    // The expensive answer model was never called.
    expect(mocks.createMock).not.toHaveBeenCalled();
    // No Ukraine/Iran event summary leaks into the answer.
    expect(res.answer).not.toContain("evidence row");
    // Denial leads within the evaluator's window.
    expect(DENIAL_LANGUAGE_PATTERN.test(res.answer.slice(0, NEGATIVE_DENIAL_LEAD_CHARS))).toBe(true);
    // The already-incurred embed/rerank usage is preserved for the ledger.
    expect(res.usageByStage?.rerank).toEqual(RERANK_USAGE);
    expect(res.rerankModel).toBeTruthy();
    expect(res.dataCurrentThrough).toBe("2026-07-13");
    expect(res.candidatesCount).toBe(5);
  });

  it("second out-of-domain control behaves identically", async () => {
    const res = await offTopicScenario(
      "Which coral-reef restoration grants did Australia announce since July 9, 2026?",
    );
    expect(res.state).toBe("insufficient");
    expect(res.citedClaimIds).toEqual([]);
    expect(res.relatedClaimIds).toEqual([]);
    expect(mocks.createMock).not.toHaveBeenCalled();
  });

  it("fails OPEN when the rerank fell back (relevantCount unknown): the answer stage still runs", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]" }));
    const retrieval = retrievalV2({ claims: pool(3) });
    const rk = ranked({ claims: pool(3), rerankUsed: false }); // fallback path, no count
    const res = await answerFromEvidence("q", retrieval, rk);
    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(res.state).toBe("answered");
  });

  it("rollback: ASK_RELEVANCE_BOUNDARY=0 disables the stop", async () => {
    envPaidV2();
    vi.stubEnv("ASK_RELEVANCE_BOUNDARY", "0");
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]" }));
    const retrieval = retrievalV2({ claims: pool(3) });
    const rk = ranked({ claims: pool(3), rerankUsed: true, relevantCount: 0 });
    const res = await answerFromEvidence("q", retrieval, rk);
    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(res.state).toBe("answered");
  });

  it("passes only the relevant prefix (floored at 8) to the answer stage when relevant_count > 0", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(completion({ content: "Focused answer [c1] [c2]" }));
    const retrieval = retrievalV2({ claims: pool(12) });
    const rk = ranked({ claims: pool(12), rerankUsed: true, relevantCount: 2 });
    const res = await answerFromEvidence("q", retrieval, rk);

    const userMsg = mocks.createMock.mock.calls[0][0].messages[1].content as string;
    // Floor of 8 protects against reranker underestimation; the tail is trimmed.
    for (let id = 1; id <= 8; id++) expect(userMsg).toContain(`[c${id}]`);
    for (let id = 9; id <= 12; id++) expect(userMsg).not.toContain(`[c${id}]`);
    expect(res.evidenceCount).toBe(8); // what the model actually saw
    expect(res.state).toBe("answered");
    expect(res.citedClaimIds).toEqual([1, 2]);
  });
});

describe("post-answer state correction — denial-led replies persist as insufficient", () => {
  const pool3 = [
    candidate({ claimId: 1, vectorScore: 0.8 }),
    candidate({ claimId: 2, vectorScore: 0.7 }),
    candidate({ claimId: 3, vectorScore: 0.6 }),
  ];

  it("corrects an 'answered' reply that leads with denial language: state insufficient, citations stripped, related omitted", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(
      completion({
        content:
          "No claims in the covered data address Antarctic research stations. The corpus does cover Ukraine strikes [c1] and Iran prosecutions [c2].",
      }),
    );
    const retrieval = retrievalV2({ claims: pool3 });
    const rk = ranked({ claims: pool3, rerankUsed: true, relevantCount: 3 });
    const res = await answerFromEvidence("Antarctic bases?", retrieval, rk);
    expect(res.state).toBe("insufficient");
    expect(res.citedClaimIds).toEqual([]);
    expect(res.relatedClaimIds).toEqual([]);
  });

  it("REPLACES the rendered answer: no [cN] markers, no irrelevant cited facts survive (Antarctic defect)", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-13");
    mocks.createMock.mockResolvedValue(
      completion({
        content:
          "No claims in the covered data address Antarctic research stations. The corpus does cover Ukraine strikes [c1] and Iran prosecutions [c2].",
      }),
    );
    const retrieval = retrievalV2({ claims: pool3 });
    const rk = ranked({ claims: pool3, rerankUsed: true, rerankUsage: RERANK_USAGE, relevantCount: 3 });
    const res = await answerFromEvidence("Antarctic bases?", retrieval, rk);

    // The model's citing tail is gone from the user-visible text, not just the metadata.
    expect(res.answer).not.toMatch(/\[c\d+\]/);
    expect(res.answer).not.toContain("Ukraine strikes");
    expect(res.answer).not.toContain("Iran prosecutions");
    // Deterministic replacement: denial-led, generic covered scope, data currency.
    expect(beginsWithDenial(res.answer)).toBe(true);
    expect(res.answer).toContain("current through 2026-07-13");
    // The recalibrated evaluator scores the ACTUAL rendered text honest.
    expect(isNegativeAnswerHonest(res.state, res.answer, res.citedClaimIds.length)).toBe(true);
    // Provider/usage/model stay truthful — the paid call happened and is billed.
    expect(res.provider.startsWith("openai:")).toBe(true);
    expect(res.answerModel).toBeDefined();
    expect(res.usage).toBeDefined();
    expect(res.usageByStage?.answer).toBeDefined();
    expect(res.usageByStage?.rerank).toEqual(RERANK_USAGE);
  });

  it("the evaluator cannot score a denial with surviving citation syntax as honest", () => {
    // The pre-fix payload shape: metadata emptied, [cN] still in the text.
    expect(
      isNegativeAnswerHonest(
        "insufficient",
        "No claims in the covered data address Antarctic research stations. The corpus does cover Ukraine strikes [c1] and Iran prosecutions [c2].",
        0,
      ),
    ).toBe(false);
  });

  it("leaves a genuine answer alone when negation appears past the lead anchor", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(
      completion({
        content:
          "Ukrainian drones struck the Moscow region on July 13 [c1]; officials say there are no reports of casualties so far [c2].",
      }),
    );
    const retrieval = retrievalV2({ claims: pool3 });
    const rk = ranked({ claims: pool3, rerankUsed: true, relevantCount: 3 });
    const res = await answerFromEvidence("Moscow strikes?", retrieval, rk);
    expect(res.state).toBe("answered");
    expect(res.citedClaimIds).toEqual([1, 2]);
  });

  it("never reclassifies a provider safety refusal as insufficient", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(completion({ refusal: "I can't help with that." }));
    const retrieval = retrievalV2({ claims: pool3 });
    const rk = ranked({ claims: pool3, rerankUsed: true, relevantCount: 3 });
    const res = await answerFromEvidence("q", retrieval, rk);
    expect(res.state).toBe("refused");
  });
});

describe("beginsWithDenial anchor", () => {
  it("recognizes denial families at or near the start only", () => {
    expect(beginsWithDenial("No claims in the covered data address this.")).toBe(true);
    expect(beginsWithDenial("  The evidence is insufficient to answer.")).toBe(true);
    expect(beginsWithDenial("Based on the evidence, no claims address this.")).toBe(true);
    expect(
      beginsWithDenial(
        "Ukrainian drones struck the Moscow region overnight; there are no reports of casualties.",
      ),
    ).toBe(false);
  });
});

// ---- Phase 0 stage timings + metering invariance (2026-07-19) --------------------

describe("stage timings — terminal paths and metering invariance", () => {
  const pool = [candidate({ claimId: 1 }), candidate({ claimId: 2 })];

  it("answered path records answerMs + validateMs; metering args identical with and without the collector", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(
      completion({ content: "Answer [c1].", promptTokens: 500, completionTokens: 80 }),
    );
    const retrieval = retrievalV2({ claims: pool });
    const rk = ranked({ claims: pool });

    // Baseline: no collector.
    const baseline = await answerFromEvidence("q", retrieval, rk);
    expect(baseline.state).toBe("answered");
    const baselineRecordArgs = mocks.guard.record.mock.calls[0];

    // With collector: same metering call, byte-identical args.
    mocks.guard.record.mockClear();
    mocks.guard.tryReserve.mockClear();
    const timings: Record<string, number> = {};
    const res = await answerFromEvidence("q", retrieval, rk, { timings });
    expect(res.state).toBe("answered");
    expect(mocks.guard.tryReserve).toHaveBeenCalledTimes(1);
    expect(mocks.guard.record).toHaveBeenCalledTimes(1);
    expect(mocks.guard.record.mock.calls[0]).toEqual(baselineRecordArgs);
    expect(timings.answerMs).toBeGreaterThanOrEqual(0);
    expect(timings.validateMs).toBeGreaterThanOrEqual(0);
  });

  it("refusal path records answerMs (billed call) without validateMs (deterministic copy)", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(completion({ refusal: "cannot help" }));
    const timings: Record<string, number> = {};
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), { timings });
    expect(res.state).toBe("refused");
    expect(timings.answerMs).toBeGreaterThanOrEqual(0);
    expect(timings.validateMs).toBeUndefined();
    expect(mocks.guard.record).toHaveBeenCalledTimes(1); // billed exactly once, unchanged
  });

  it("provider-throw path still records answerMs on the error result", async () => {
    envPaidV2();
    mocks.createMock.mockRejectedValue(new Error("boom"));
    const timings: Record<string, number> = {};
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), { timings });
    expect(res.state).toBe("error");
    expect(timings.answerMs).toBeGreaterThanOrEqual(0);
    expect(mocks.guard.record).not.toHaveBeenCalled(); // threw before billing — unchanged behavior
  });

  it("budget-refusal path records NO answerMs (no paid boundary ran) and no metering", async () => {
    envPaidV2();
    mocks.guard.tryReserve.mockReturnValue({ ok: false, reason: "cap" });
    const timings: Record<string, number> = {};
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), { timings });
    expect(res.provider).toBe("budget");
    expect(timings.answerMs).toBeUndefined();
    expect(mocks.createMock).not.toHaveBeenCalled();
    expect(mocks.guard.record).not.toHaveBeenCalled();
  });

  it("offline path records NO answerMs and makes no call", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", "");
    const timings: Record<string, number> = {};
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), { timings });
    expect(res.provider).toBe("stub");
    expect(timings.answerMs).toBeUndefined();
    expect(mocks.createMock).not.toHaveBeenCalled();
  });

  it("ask() v2 records currencyMs + rerankMs and threads the collector into retrieveV2", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-18");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: pool }));
    mocks.rerankMock.mockResolvedValue(ranked({ claims: pool }));
    mocks.createMock.mockResolvedValue(completion({ content: "Answer [c1]." }));

    const timings: Record<string, number> = {};
    const res = await ask("what happened in kherson", { timings });
    expect(res.state).toBe("answered");
    expect(timings.currencyMs).toBeGreaterThanOrEqual(0);
    expect(timings.rerankMs).toBeGreaterThanOrEqual(0);
    expect(mocks.retrieveV2Mock).toHaveBeenCalledWith("what happened in kherson", { timings });
  });

  it("ask() short-circuits (no evidence) still record currencyMs; no rerank/answer keys", async () => {
    envPaidV2();
    mocks.currencyMock.mockResolvedValue("2026-07-18");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [] }));

    const timings: Record<string, number> = {};
    const res = await ask("nothing matches", { timings });
    expect(res.state).toBe("insufficient");
    expect(timings.currencyMs).toBeGreaterThanOrEqual(0);
    expect(timings.rerankMs).toBeUndefined();
    expect(timings.answerMs).toBeUndefined();
  });
});

// ---- Phase 2: run-event emission + snapshot freeze -------------------------------

const p2 = vi.hoisted(() => ({
  fetchDocsMock: vi.fn(),
  persistSnapMock: vi.fn(),
}));
vi.mock("./events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./events")>();
  return { ...actual, fetchSourceDocIds: p2.fetchDocsMock, persistEvidenceSnapshot: p2.persistSnapMock };
});

interface Emitted {
  type: string;
  payload: Record<string, unknown>;
}

function fakeSink() {
  const events: Emitted[] = [];
  return {
    events,
    emit: vi.fn(async (type: string, payload: Record<string, unknown>) => {
      events.push({ type, payload });
    }),
  };
}

describe("ask() — Phase 2 progressive event emission", () => {
  const pool = [candidate({ claimId: 1 }), candidate({ claimId: 2 })];

  beforeEach(() => {
    p2.fetchDocsMock.mockReset();
    p2.persistSnapMock.mockReset();
    p2.fetchDocsMock.mockResolvedValue(new Map([[1, [100]], [2, [100, 101]]]));
    p2.persistSnapMock.mockResolvedValue(true);
  });

  it("release hardening: the snapshot-persist outcome rides the result as snapshotPersisted (true and false)", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", "");
    mocks.currencyMock.mockResolvedValue("2026-07-18");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: pool, totalMatching: 5 }));
    mocks.rerankMock.mockResolvedValue(ranked({ claims: pool, rerankUsed: false }));

    const ok = await ask("what happened in kherson", {
      sink: fakeSink(),
      snapshotRunId: "11111111-2222-4333-8444-555555555555",
    });
    expect(ok.snapshotPersisted).toBe(true);

    p2.persistSnapMock.mockResolvedValue(false); // injected persist failure (bounded retries exhausted)
    const lost = await ask("what happened in kherson", {
      sink: fakeSink(),
      snapshotRunId: "11111111-2222-4333-8444-555555555555",
    });
    expect(lost.snapshotPersisted).toBe(false); // honest — feeds the durable verdict
    expect(lost.provider).toBe("stub"); // the answer itself is unaffected ($0 offline path)

    // no snapshot obligation (no sink/runId) → the field stays absent
    const plain = await ask("what happened in kherson");
    expect(plain.snapshotPersisted).toBeUndefined();
  });

  it("emits lexical_partial -> retrieval.completed -> rerank.skipped -> answer.started in order and freezes the snapshot ($0 offline path)", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", ""); // offline: no paid calls anywhere
    mocks.currencyMock.mockResolvedValue("2026-07-18");
    mocks.retrieveV2Mock.mockImplementation(
      async (_q: string, opts?: { onLexicalPartial?: (p: { claims: unknown[]; totalMatching: number }) => void }) => {
        opts?.onLexicalPartial?.({ claims: pool, totalMatching: 5 });
        return retrievalV2({ claims: pool, totalMatching: 5 });
      },
    );
    mocks.rerankMock.mockResolvedValue(ranked({ claims: pool, rerankUsed: false }));

    const sink = fakeSink();
    const res = await ask("what happened in kherson", {
      sink,
      snapshotRunId: "11111111-2222-4333-8444-555555555555",
    });

    expect(res.provider).toBe("stub"); // offline deterministic answer, $0
    expect(sink.events.map((e) => e.type)).toEqual([
      "retrieval.lexical_partial",
      "retrieval.completed",
      "rerank.skipped",
      "answer.started",
    ]);
    const completed = sink.events[1].payload;
    expect(completed.candidatesCount).toBe(2);
    expect(completed.totalMatching).toBe(5);
    expect(completed.uniqueSources).toBe(2); // docs 100+101, deduped
    expect(completed.currentThrough).toBe("2026-07-18");
    expect(sink.events[2].payload.reasonClass).toBe("pool_fits"); // 2 <= K

    expect(p2.persistSnapMock).toHaveBeenCalledTimes(1);
    const [runId, snapshot] = p2.persistSnapMock.mock.calls[0] as [string, {
      version: number; candidates: Array<{ claimId: number; text: string; sourceDocIds: number[] }>;
      selectedClaimIds: number[];
    }];
    expect(runId).toBe("11111111-2222-4333-8444-555555555555");
    expect(snapshot.version).toBe(1);
    expect(snapshot.candidates.map((c) => c.claimId)).toEqual([1, 2]);
    expect(snapshot.candidates[0].text).toBe("claim 1"); // CONTENT, not just ids (F11)
    expect(snapshot.candidates[1].sourceDocIds).toEqual([100, 101]); // stable doc ids
    expect(snapshot.selectedClaimIds).toEqual([1, 2]);
  });

  it("without a sink nothing changes: no doc prefetch, no snapshot, no emissions (byte-identity with Phase 1)", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", "");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: pool }));
    mocks.rerankMock.mockResolvedValue(ranked({ claims: pool }));

    const res = await ask("what happened in kherson");
    expect(res.provider).toBe("stub");
    expect(p2.fetchDocsMock).not.toHaveBeenCalled();
    expect(p2.persistSnapMock).not.toHaveBeenCalled();
  });

  it("no-evidence short-circuit still emits an honest zero-count retrieval.completed", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", "");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: [], entities: [], totalMatching: 0 }));

    const sink = fakeSink();
    const res = await ask("nothing matches", { sink });
    expect(res.state).toBe("insufficient");
    expect(sink.events.map((e) => e.type)).toEqual(["retrieval.completed"]);
    expect(sink.events[0].payload.candidatesCount).toBe(0);
    expect(p2.persistSnapMock).not.toHaveBeenCalled(); // no snapshot for an empty run
  });

  it("a rerank that RAN emits rerank.completed with the selected ids", async () => {
    vi.stubEnv("ASK_PIPELINE", "v2");
    vi.stubEnv("OPENAI_API_KEY", "");
    mocks.retrieveV2Mock.mockResolvedValue(retrievalV2({ claims: pool }));
    mocks.rerankMock.mockResolvedValue(ranked({ claims: [pool[1], pool[0]], rerankUsed: true, relevantCount: 1 }));

    const sink = fakeSink();
    await ask("q", { sink });
    const rr = sink.events.find((e) => e.type === "rerank.completed")!;
    expect(rr.payload.selectedClaimIds).toEqual([2, 1]);
    expect(rr.payload.relevantCount).toBe(1);
  });
});

// ---- Phase 3 Increment B: streaming wiring (flagged) -----------------------------

const p3 = vi.hoisted(() => ({ streamAnswerMock: vi.fn(), watchStop: vi.fn() }));
vi.mock("./answer-stream", () => {
  class StreamDispatchError extends Error {
    constructor(
      cause: unknown,
      public readonly settledUsage: { promptTokens: number; completionTokens: number; costUsd: number },
    ) {
      super(cause instanceof Error ? cause.message : String(cause));
      this.name = "StreamDispatchError";
    }
  }
  return {
    streamAnswer: p3.streamAnswerMock,
    StreamDispatchError,
    watchCancelMarker: vi.fn(() => p3.watchStop),
    STREAM_DEATH_INPUT_EST_TOKENS: 30_000,
  };
});

describe("answerFromEvidence — ASK_STREAM_ANSWER wiring", () => {
  const pool = [candidate({ claimId: 1 })];
  const USAGE = { promptTokens: 500, completionTokens: 80, costUsd: 0.001 };

  beforeEach(() => {
    p3.streamAnswerMock.mockReset();
    p3.watchStop.mockClear();
    // Release hardening (features.ts): streaming is effective only on the full
    // progressive stack — enforce (with retention) + progressive + the flag.
    vi.stubEnv("ASK_RUNS_ENFORCE", "1");
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
    vi.stubEnv("ASK_PROGRESSIVE", "1");
  });

  it("flag ON + real sink: streams, emits answer.validating, terminal payload through the SAME assemble path", async () => {
    envPaidV2();
    vi.stubEnv("ASK_STREAM_ANSWER", "1");
    p3.streamAnswerMock.mockResolvedValue({
      content: "Streamed answer [c1].",
      refusal: "",
      finishReason: "stop",
      usage: USAGE,
      denialLed: false,
      cancelled: false,
      releasedCount: 1,
    });
    const sink = fakeSink();
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), {
      sink,
      runId: "11111111-2222-4333-8444-555555555555",
    });

    expect(p3.streamAnswerMock).toHaveBeenCalledTimes(1);
    expect(mocks.createMock).not.toHaveBeenCalled(); // the non-streaming call never fires
    expect(sink.events.map((e) => e.type)).toContain("answer.validating");
    expect(res.state).toBe("answered");
    expect(res.answer).toBe("Streamed answer [c1].");
    expect(res.citedClaimIds).toEqual([1]); // terminal reconciliation ran the same filter
    expect(res.answerModel).toBeTruthy();
    expect(p3.watchStop).toHaveBeenCalled(); // the cancel watch was cleaned up
  });

  it("a cancelled stream returns the provider 'cancelled' payload the route maps to run.cancelled", async () => {
    envPaidV2();
    vi.stubEnv("ASK_STREAM_ANSWER", "1");
    p3.streamAnswerMock.mockResolvedValue({
      content: "partial",
      refusal: "",
      finishReason: "cancelled",
      usage: USAGE,
      denialLed: false,
      cancelled: true,
      releasedCount: 0,
    });
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), {
      sink: fakeSink(),
      runId: "11111111-2222-4333-8444-555555555555",
    });
    expect(res.provider).toBe("cancelled");
    expect(res.state).toBe("error");
    expect(res.answer).toContain("stopped");
  });

  it("a refusal outcome maps through the identical refused terminal", async () => {
    envPaidV2();
    vi.stubEnv("ASK_STREAM_ANSWER", "1");
    p3.streamAnswerMock.mockResolvedValue({
      content: "",
      refusal: "cannot",
      finishReason: "stop",
      usage: USAGE,
      denialLed: false,
      cancelled: false,
      releasedCount: 0,
    });
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), {
      sink: fakeSink(),
    });
    expect(res.state).toBe("refused");
  });

  it("G3: a stream that DIED with empty content maps to state 'error' (interrupted), never a model refusal", async () => {
    envPaidV2();
    vi.stubEnv("ASK_STREAM_ANSWER", "1");
    p3.streamAnswerMock.mockResolvedValue({
      content: "",
      refusal: "",
      finishReason: "error", // the synthetic death marker
      usage: USAGE,
      denialLed: false,
      cancelled: false,
      releasedCount: 0,
    });
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), {
      sink: fakeSink(),
    });
    expect(res.state).toBe("error");
    expect(res.answer).toContain("interrupted");
    expect(res.usage).toEqual(USAGE); // billed usage attributed
  });

  it("G3: a dispatch failure (StreamDispatchError) reports the settled ceiling usage and the model in the error payload", async () => {
    envPaidV2();
    vi.stubEnv("ASK_STREAM_ANSWER", "1");
    const { StreamDispatchError } = await import("./answer-stream");
    const ceiling = { promptTokens: 30_000, completionTokens: 2500, costUsd: 0.006 };
    p3.streamAnswerMock.mockRejectedValue(new StreamDispatchError(new Error("dispatch failed"), ceiling));
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), {
      sink: fakeSink(),
    });
    expect(res.state).toBe("error");
    expect(res.usage).toEqual(ceiling); // the billed ceiling is not dropped
    expect(res.answerModel).toBeTruthy();
  });

  it("flag OFF: the non-streaming path runs even with a real sink (default behavior preserved)", async () => {
    envPaidV2();
    mocks.createMock.mockResolvedValue(completion({ content: "Non-streamed [c1]." }));
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }), {
      sink: fakeSink(),
    });
    expect(p3.streamAnswerMock).not.toHaveBeenCalled();
    expect(mocks.createMock).toHaveBeenCalledTimes(1);
    expect(res.answer).toBe("Non-streamed [c1].");
  });

  it("flag ON without a sink (action/eval paths): non-streaming, byte-identical", async () => {
    envPaidV2();
    vi.stubEnv("ASK_STREAM_ANSWER", "1");
    mocks.createMock.mockResolvedValue(completion({ content: "Non-streamed [c1]." }));
    const res = await answerFromEvidence("q", retrievalV2({ claims: pool }), ranked({ claims: pool }));
    expect(p3.streamAnswerMock).not.toHaveBeenCalled();
    expect(res.answer).toBe("Non-streamed [c1].");
  });
});
