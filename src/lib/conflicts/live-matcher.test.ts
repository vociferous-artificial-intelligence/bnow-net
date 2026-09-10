import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The paid surface of the whole conflict layer is one function, so every
// assertion here is about MONEY: which refusal fires first, whether a client is
// ever constructed, and whether a billed round is metered before its body is
// interpreted. The vendor SDK and the database are mocked so "zero provider
// calls" and "zero client construction" are literal facts, not inferences.
// Shape copied from src/lib/validation/llm-match-guard.test.ts.

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

const dbState = { totalUsd: 0, dayUsd: 0, dayRequests: 0, records: [] as Array<{ provider: string; usd: number }> };
const querySpy = vi.fn(async (sql: string, params?: unknown[]) => {
  if (/INSERT INTO provider_usage/.test(sql)) {
    dbState.records.push({ provider: params?.[0] as string, usd: params?.[4] as number });
    return [];
  }
  if (/FROM provider_usage/.test(sql)) {
    return [
      {
        total_usd: dbState.totalUsd,
        total_requests: 0,
        day_usd: dbState.dayUsd,
        day_requests: dbState.dayRequests,
      },
    ];
  }
  return [];
});
vi.mock("@/db", () => ({ rawSql: { query: querySpy } }));

import { CONFLICT_MATCH_PROVIDER, conflictMatchGuardFromEnv } from "../usage/llm-guard";
import { createLiveMatcher } from "./live-matcher";
import type { MatchableUnit, MatcherClaim } from "./match-contract";

const UNITS: MatchableUnit[] = [
  {
    unitId: "u0",
    ordinal: 0,
    text: "Synthetic forces struck an invented depot near a fictional town.",
    lane: "strikes_air_defense",
    compound: false,
    negative: false,
  },
];
const CLAIMS: MatcherClaim[] = [
  { claimId: 101, text: "An invented depot was reportedly struck.", hedging: "claimed" },
];

const okBody = '{"matches":[{"takeawayIndex":0,"claimId":101,"confidence":0.9}]}';
const completion = (content: string) => ({
  usage: { prompt_tokens: 1000, completion_tokens: 200 },
  choices: [{ message: { content } }],
});

const SAVED = new Map<string, string | undefined>();
function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (!SAVED.has(k)) SAVED.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  createSpy.mockReset();
  ctorSpy.mockReset();
  querySpy.mockClear();
  dbState.totalUsd = 0;
  dbState.dayUsd = 0;
  dbState.dayRequests = 0;
  dbState.records = [];
  setEnv({
    OPENAI_API_KEY: "sk-test",
    ANALYSIS_PROVIDER: undefined,
    LLM_DISABLE: undefined,
    LLM_SPRINT_USD_CAP: "10",
    CONFLICT_MATCH_USD_CAP_DAILY: "2",
    CONFLICT_MATCH_DAILY_REQUEST_CAP: undefined,
    CONFLICT_MATCH_RUN_REQUEST_CAP: undefined,
    MATCH_VOTES: undefined,
    MATCHER_MODE: undefined,
    VALIDATION_MODEL: undefined,
    VALIDATION_REASONING_EFFORT: undefined,
    OPENAI_MODEL: undefined,
  });
});

afterEach(() => {
  for (const [k, v] of SAVED) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  SAVED.clear();
});

describe("createLiveMatcher — the refusals, in order", () => {
  it("refuses with NO client and NO database read when the daily cap is unset", async () => {
    setEnv({ CONFLICT_MATCH_USD_CAP_DAILY: undefined });
    const out = await createLiveMatcher("roca");
    expect(out).toEqual({ ok: false, reason: "daily_usd_cap_unset" });
    // before tryReserve, before guard.init(), before any client: the resting
    // state of this window, and the reason the route is inert on the money path
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("refuses on the kill switch, the stub provider and a missing key", async () => {
    setEnv({ LLM_DISABLE: "1" });
    expect(await createLiveMatcher("roca")).toEqual({ ok: false, reason: "llm_disabled" });
    setEnv({ LLM_DISABLE: undefined, ANALYSIS_PROVIDER: "stub" });
    expect(await createLiveMatcher("roca")).toEqual({ ok: false, reason: "stub_provider" });
    setEnv({ ANALYSIS_PROVIDER: undefined, OPENAI_API_KEY: "" });
    expect(await createLiveMatcher("roca")).toEqual({ ok: false, reason: "no_api_key" });
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("refuses a blocked routing configuration before any reservation (ruling 4)", async () => {
    setEnv({ VALIDATION_MODEL: "not-a-priced-model" });
    expect(await createLiveMatcher("roca")).toEqual({
      ok: false,
      reason: "dispatch_config_refused",
    });
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("even with the guard exhausted, the SpendGuard itself refuses `daily_usd_unset`", async () => {
    setEnv({ CONFLICT_MATCH_USD_CAP_DAILY: undefined });
    const guard = conflictMatchGuardFromEnv();
    const r = guard.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("daily_usd_unset");
  });
});

describe("createLiveMatcher — the paid path", () => {
  it("reserves 5 times, dispatches 5 times, meters on its OWN ledger row, and resolves the majority", async () => {
    createSpy.mockResolvedValue(completion(okBody));
    const out = await createLiveMatcher("roca");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const outcome = await out.live.matcher.match(UNITS, CLAIMS);
    expect(createSpy).toHaveBeenCalledTimes(5);
    expect(outcome.label).toBe("llm-majority");
    expect(outcome.voteRounds).toBe(5);
    expect(outcome.votesK).toBe(5);
    expect(outcome.model).toBe(out.live.dispatch.model);
    // memo C12: never production's llm_match row
    expect(dbState.records).toHaveLength(5);
    expect(new Set(dbState.records.map((r) => r.provider))).toEqual(
      new Set([CONFLICT_MATCH_PROVIDER]),
    );
    expect(CONFLICT_MATCH_PROVIDER).toBe("llm_conflict_match");
    // the client is built once, lazily, after the FIRST successful reservation
    expect(ctorSpy).toHaveBeenCalledTimes(1);
  });

  it("degrades to the `llm` rung when only two rounds are usable", async () => {
    createSpy
      .mockResolvedValueOnce(completion(okBody))
      .mockResolvedValueOnce(completion(okBody))
      .mockResolvedValue(completion("not json at all"));
    const out = await createLiveMatcher("roca");
    if (!out.ok) throw new Error(out.reason);
    const outcome = await out.live.matcher.match(UNITS, CLAIMS);
    expect(outcome.label).toBe("llm");
    expect(outcome.voteRounds).toBe(2);
    // ruling 8: the three malformed bodies were BILLED and are metered — the
    // provider charges for them whether or not JSON.parse succeeds
    expect(dbState.records).toHaveLength(5);
  });

  it("a mid-run budget stop discards the remaining rounds, it does not fail the day", async () => {
    // two rounds' worth of daily headroom, then the daily cap bites
    setEnv({ CONFLICT_MATCH_USD_CAP_DAILY: "0.001" });
    createSpy.mockImplementation(async () => {
      dbState.dayUsd += 0.0005;
      return completion(okBody);
    });
    const out = await createLiveMatcher("roca");
    if (!out.ok) throw new Error(out.reason);
    const outcome = await out.live.matcher.match(UNITS, CLAIMS);
    expect(createSpy.mock.calls.length).toBeLessThan(5);
    expect(["llm", "llm-majority", "keyword"]).toContain(outcome.label);
  });

  it("falls all the way to the keyword rung when every round is refused, and spends nothing", async () => {
    dbState.totalUsd = 999; // the shared all-time backstop is already blown
    const out = await createLiveMatcher("roca");
    if (!out.ok) throw new Error(out.reason);
    const outcome = await out.live.matcher.match(UNITS, CLAIMS);
    expect(createSpy).not.toHaveBeenCalled();
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(dbState.records).toHaveLength(0);
    expect(outcome.label).toBe("keyword");
    // requested-k identity is carried through the fallback so a fully degraded
    // k=5 run groups with other k=5 runs in the soak's variance analysis
    expect(outcome.votesK).toBe(5);
    expect(outcome.gazetteerVersion).toBe("ru-ua-v1");
  });

  it("scores an Iran day's keyword fallback under the IRAN gazetteer", async () => {
    dbState.totalUsd = 999;
    const out = await createLiveMatcher("iran_update");
    if (!out.ok) throw new Error(out.reason);
    const outcome = await out.live.matcher.match(UNITS, CLAIMS);
    expect(outcome.label).toBe("keyword");
    expect(outcome.gazetteerVersion).toBe("iran-levant-v1");
  });

  it("ignores MATCH_VOTES and MATCHER_MODE — production knobs must not retune the soak", async () => {
    setEnv({ MATCH_VOTES: "1", MATCHER_MODE: "single" });
    createSpy.mockResolvedValue(completion(okBody));
    const out = await createLiveMatcher("roca");
    if (!out.ok) throw new Error(out.reason);
    const outcome = await out.live.matcher.match(UNITS, CLAIMS);
    expect(outcome.votesK).toBe(5);
    expect(createSpy).toHaveBeenCalledTimes(5);
  });
});
