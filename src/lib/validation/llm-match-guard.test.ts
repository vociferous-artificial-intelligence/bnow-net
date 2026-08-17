import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SpendGuard coverage of EVERY llm-match dispatch path (release hardening
// 2026-08-17): the pre-hardening single-shot path dispatched with no guard and
// no provider_usage row. These tests mock the vendor SDK and the DB so every
// assertion about "zero provider calls" and "metered exactly once" is literal.

const createSpy = vi.fn();
const ctorSpy = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createSpy } };
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
  },
}));

const dbState = {
  totalUsd: 0,
  records: [] as Array<{ provider: string; requests: number; usd: number }>,
};
const querySpy = vi.fn(async (sql: string, params?: unknown[]) => {
  if (/INSERT INTO provider_usage/.test(sql)) {
    dbState.records.push({
      provider: params?.[0] as string,
      requests: params?.[2] as number,
      usd: params?.[4] as number,
    });
    return [];
  }
  if (/FROM provider_usage/.test(sql)) {
    return [
      {
        total_usd: dbState.totalUsd,
        total_requests: 0,
        day_usd: dbState.totalUsd,
        day_requests: 0,
      },
    ];
  }
  return [];
});
vi.mock("@/db", () => ({ rawSql: { query: querySpy } }));

import { llmMatchTakeaways } from "./llm-match";
import type { ClaimForValidation } from "./score";

const CLAIMS = [{ claimId: 1, text: "Ukrainian forces struck the depot" }] as ClaimForValidation[];
const TAKEAWAYS = ["Strike on a depot reported"];

const okCompletion = () => ({
  usage: { prompt_tokens: 1000, completion_tokens: 200 },
  choices: [
    {
      message: {
        content: '{"matches":[{"takeawayIndex":0,"claimId":1,"confidence":0.9}]}',
      },
    },
  ],
});

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANALYSIS_PROVIDER",
  "LLM_DISABLE",
  "LLM_SPRINT_USD_CAP",
  "LLM_MATCH_DAILY_USD_CAP",
  "MATCHER_MODE",
  "MATCH_VOTES",
  "VALIDATION_MODEL",
  "VALIDATION_REASONING_EFFORT",
  "OPENAI_MODEL",
] as const;
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.OPENAI_API_KEY = "test-key";
  process.env.LLM_SPRINT_USD_CAP = "10";
  dbState.totalUsd = 0;
  dbState.records = [];
  createSpy.mockReset();
  ctorSpy.mockClear();
  querySpy.mockClear();
  // pre-warm the mocked module: spend-guard lazy-imports "@/db" from CONCURRENT
  // vote callbacks, and un-warmed concurrent dynamic imports can race past the
  // mock registry into the real module (which throws without DATABASE_URL)
  await import("@/db");
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("llm-match SpendGuard coverage (every dispatch reserved + recorded)", () => {
  it("guarded single-shot: one reservation -> exactly one physical call, metered once", async () => {
    process.env.MATCHER_MODE = "single";
    createSpy.mockResolvedValue(okCompletion());
    const out = await llmMatchTakeaways(TAKEAWAYS, CLAIMS);
    expect(out?.matcher).toBe("llm");
    expect(out?.matches[0]).toMatchObject({ takeawayIndex: 0, claimId: 1 });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(dbState.records).toHaveLength(1);
    expect(dbState.records[0].provider).toBe("llm_match");
    expect(dbState.records[0].requests).toBe(1);
    // model-aware metering: gpt-4o-mini list price on the actual usage
    expect(dbState.records[0].usd).toBeCloseTo((1000 * 0.15 + 200 * 0.6) / 1e6, 12);
    // durable dispatch identity rides the outcome for validation_runs.details
    expect(out?.dispatch).toEqual({
      workload: "validation",
      model: "gpt-4o-mini",
      reasoningEffort: null,
      registryVersion: "analysis-reg-v1",
      approval: "baseline",
    });
    // the analysis client is constructed with SDK retries disabled
    expect(ctorSpy).toHaveBeenCalledWith({ maxRetries: 0 });
  });

  it("cap UNSET fails closed: keyword fallback, ZERO provider calls, nothing metered", async () => {
    delete process.env.LLM_SPRINT_USD_CAP;
    process.env.MATCHER_MODE = "single";
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
    expect(dbState.records).toHaveLength(0);
  });

  it("cap unset also blocks the majority path — zero calls", async () => {
    delete process.env.LLM_SPRINT_USD_CAP;
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("cap EXHAUSTED fails closed before any dispatch", async () => {
    dbState.totalUsd = 10; // >= LLM_SPRINT_USD_CAP
    process.env.MATCHER_MODE = "single";
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
    expect(dbState.records).toHaveLength(0);
  });

  it("majority voting: k reservations -> k physical calls -> k metering rows (1:1:1)", async () => {
    process.env.MATCH_VOTES = "5";
    createSpy.mockResolvedValue(okCompletion());
    const out = await llmMatchTakeaways(TAKEAWAYS, CLAIMS);
    expect(out?.matcher).toBe("llm-majority");
    expect(out?.voteRounds).toBe(5);
    expect(createSpy).toHaveBeenCalledTimes(5);
    expect(dbState.records).toHaveLength(5);
    expect(out?.dispatch?.model).toBe("gpt-4o-mini");
  });

  it("provider failure degrades to keywords and records nothing for the failed call", async () => {
    process.env.MATCHER_MODE = "single";
    createSpy.mockRejectedValue(new Error("boom 500"));
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(dbState.records).toHaveLength(0); // no usage came back; nothing to meter
  });

  it("an unparseable response is METERED before being discarded (ruling 8)", async () => {
    // the provider billed this response in full even though its body is junk —
    // recording must not depend on JSON.parse succeeding (hardening review 1,
    // finding 2)
    process.env.MATCHER_MODE = "single";
    createSpy.mockResolvedValue({
      usage: { prompt_tokens: 800, completion_tokens: 300 },
      choices: [{ message: { content: "not json at all {" } }],
    });
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull(); // degrades to keywords
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(dbState.records).toHaveLength(1); // the billed throwaway IS recorded
    expect(dbState.records[0].usd).toBeCloseTo((800 * 0.15 + 300 * 0.6) / 1e6, 12);
  });

  it("LLM_DISABLE=1 refuses with zero calls (site-specific degradation preserved)", async () => {
    process.env.LLM_DISABLE = "1";
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled(); // refused before the guard even loads
  });

  it("a scorecard-blocked model degrades BEFORE client construction — zero calls, zero DB", async () => {
    process.env.VALIDATION_MODEL = "gpt-5"; // priced but not registry-approved
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("no API key / stub provider short-circuit unchanged", async () => {
    delete process.env.OPENAI_API_KEY;
    expect(await llmMatchTakeaways(TAKEAWAYS, CLAIMS)).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
