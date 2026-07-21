import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskAnswer } from "./answer";
import type { AskAnswerV2 } from "./types";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// ask() (workstream D) and the Neon Pool are mocked: no LLM, no DB. The Pool's
// query() dispatches by SQL text — the SELECT returns today's usage snapshot; the
// INSERT is captured so we can assert the exact column mapping.
const h = vi.hoisted(() => {
  const askMock = vi.fn();
  const queryMock = vi.fn();
  const endMock = vi.fn();
  const poolCtor = vi.fn(() => ({ query: queryMock, end: endMock }));
  const createRunMock = vi.fn();
  const reserveAllowanceMock = vi.fn();
  const finalizeRunMock = vi.fn();
  const expireStaleRunsMock = vi.fn();
  const buildGuardsMock = vi.fn();
  const cacheKeyMock = vi.fn();
  const cacheLookupMock = vi.fn();
  const cacheStoreMock = vi.fn();
  const corpusVersionMock = vi.fn();
  return {
    askMock, queryMock, endMock, poolCtor,
    createRunMock, reserveAllowanceMock, finalizeRunMock, expireStaleRunsMock, buildGuardsMock,
    cacheKeyMock, cacheLookupMock, cacheStoreMock, corpusVersionMock,
    sweepRetentionMock: vi.fn(),
  };
});

vi.mock("./answer", () => ({ ask: h.askMock }));
vi.mock("@neondatabase/serverless", () => ({ Pool: h.poolCtor }));
// Phase 1: the run-persistence and guard-factory modules are mocked — their SQL
// is covered by runs.test.ts and the real-Postgres integration suite; here we
// pin askWithLimits' MODE LOGIC (shadow vs enforce).
vi.mock("./runs", () => ({
  createRun: h.createRunMock,
  reserveAllowance: h.reserveAllowanceMock,
  finalizeRun: h.finalizeRunMock,
  expireStaleRuns: h.expireStaleRunsMock,
}));
vi.mock("./run-guards", () => ({ buildAskRunGuards: h.buildGuardsMock }));
// Release hardening: the retention sweep is mocked (its SQL is covered by
// retention.test.ts + the itest); here we pin WHEN it rides the money path.
vi.mock("./retention", () => ({ sweepAskRetentionThrottled: h.sweepRetentionMock }));
// Phase 4: the exact-cache module is mocked (its own SQL is covered by
// cache.test.ts + the real-Postgres itest); here we pin the WIRING —
// flag-gating, hit short-circuit, store policy.
vi.mock("./cache", () => ({
  cacheKey: h.cacheKeyMock,
  cacheLookup: h.cacheLookupMock,
  cacheStore: h.cacheStoreMock,
  corpusVersion: h.corpusVersionMock,
}));

const {
  askWithLimits,
  estimateCostUsd,
  evaluateAllowance,
  globalDailyBudgetUsd,
  limitMessage,
  recordEntryTimings,
  totalCostUsd,
  userDailyLimit,
} = await import("./limits");

const SAVED = {
  ASK_USER_DAILY_LIMIT: process.env.ASK_USER_DAILY_LIMIT,
  ASK_GLOBAL_DAILY_BUDGET_USD: process.env.ASK_GLOBAL_DAILY_BUDGET_USD,
};

// ask_usage INSERT param order ($1-based, so index = position - 1).
const COL = {
  email: 0,
  question: 1,
  provider: 2,
  promptTokens: 3,
  completionTokens: 4,
  costUsd: 5,
  retrievalMode: 6,
  state: 7,
  rerankModel: 8,
  answerModel: 9,
  rerankUsed: 10,
  embedTokens: 11,
  embedCostUsd: 12,
  rerankPromptTokens: 13,
  rerankCompletionTokens: 14,
  rerankCostUsd: 15,
  answerPromptTokens: 16,
  answerCompletionTokens: 17,
  answerCostUsd: 18,
  candidatesCount: 19,
  evidenceCount: 20,
  totalMatching: 21,
  windowFrom: 22,
  windowTo: 23,
  // Phase 0 measurement columns (2026-07-19)
  runId: 24,
  startedAt: 25,
  stageTimingsMs: 26,
} as const;

let usage = { user_count: 0, global_cost: 0 };

beforeEach(() => {
  delete process.env.ASK_USER_DAILY_LIMIT;
  delete process.env.ASK_GLOBAL_DAILY_BUDGET_USD;
  delete process.env.ASK_RUNS_ENFORCE; // default: persistence OFF
  delete process.env.ASK_RUNS_SHADOW;
  delete process.env.ASK_PROGRESSIVE;
  delete process.env.ASK_CONTENT_RETENTION_DAYS;
  delete process.env.ASK_CACHE_TTL_DAYS;
  usage = { user_count: 0, global_cost: 0 };
  h.askMock.mockReset();
  h.queryMock.mockReset();
  h.endMock.mockReset();
  h.endMock.mockResolvedValue(undefined);
  h.poolCtor.mockClear();
  h.createRunMock.mockReset();
  h.reserveAllowanceMock.mockReset();
  h.finalizeRunMock.mockReset();
  h.expireStaleRunsMock.mockReset();
  h.buildGuardsMock.mockReset();
  h.cacheKeyMock.mockReset();
  h.cacheLookupMock.mockReset();
  h.cacheStoreMock.mockReset();
  h.corpusVersionMock.mockReset();
  h.cacheStoreMock.mockResolvedValue(undefined);
  h.sweepRetentionMock.mockReset();
  h.sweepRetentionMock.mockResolvedValue(undefined);
  delete process.env.ASK_EXACT_CACHE;
  delete process.env.ASK_ROUTER;
  // shadow-mode defaults: run writes succeed quietly and change nothing
  h.createRunMock.mockImplementation(async (o: { runId: string; question: string }) => ({
    run: { id: o.runId, userEmail: "u", question: o.question, status: "created", state: null, result: null, finishedAt: null, expired: false },
    replayed: false,
  }));
  h.reserveAllowanceMock.mockResolvedValue({ ok: true });
  h.finalizeRunMock.mockResolvedValue(true);
  h.expireStaleRunsMock.mockResolvedValue(undefined);
  h.buildGuardsMock.mockReturnValue({ embed: "G_EMBED", rerank: "G_RERANK", answer: "G_ANSWER" });
  h.queryMock.mockImplementation(async (text: string) => {
    if (String(text).includes("INSERT INTO ask_usage")) return { rows: [] };
    return { rows: [{ user_count: usage.user_count, global_cost: usage.global_cost }] };
  });
});

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** The captured INSERT parameter array, or undefined if no INSERT ran. */
function insertParams(): unknown[] | undefined {
  const call = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_usage"));
  return call?.[1] as unknown[] | undefined;
}

function v2Full(overrides: Partial<AskAnswerV2> = {}): AskAnswerV2 {
  return {
    answer: "Answer text [c1].",
    citedClaimIds: [1],
    evidenceCount: 5,
    terms: ["kherson"],
    provider: "openai:gpt-5-mini",
    state: "answered",
    relatedClaimIds: [2, 3],
    window: { from: "2026-07-01", to: "2026-07-08", matchedPhrase: "since july 1" },
    totalMatching: 42,
    sampled: true,
    retrievalMode: "v2",
    usage: { promptTokens: 900, completionTokens: 120, costUsd: 0.005 },
    usageByStage: {
      embed: { promptTokens: 30, completionTokens: 0, costUsd: 0.0006 },
      rerank: { promptTokens: 400, completionTokens: 50, costUsd: 0.002 },
      answer: { promptTokens: 900, completionTokens: 120, costUsd: 0.005 },
    },
    rerankUsed: true,
    ...overrides,
  };
}

describe("/ask allowance decision", () => {
  it("allows under both caps", () => {
    const a = evaluateAllowance(5, 0.1, 100, 10);
    expect(a.allowed).toBe(true);
    expect(a.reason).toBe("ok");
  });

  it("blocks at the per-user daily limit", () => {
    expect(evaluateAllowance(100, 0.1, 100, 10).reason).toBe("user_limit");
    expect(evaluateAllowance(101, 0.1, 100, 10).allowed).toBe(false);
    expect(evaluateAllowance(99, 0.1, 100, 10).allowed).toBe(true);
  });

  it("blocks when the global daily budget is spent", () => {
    expect(evaluateAllowance(0, 10, 100, 10).reason).toBe("global_budget");
    expect(evaluateAllowance(0, 25, 100, 10).allowed).toBe(false);
  });

  it("user limit takes precedence in the message", () => {
    const a = evaluateAllowance(100, 50, 100, 10);
    expect(a.reason).toBe("user_limit");
    expect(limitMessage(a, 100)).toContain("100/day");
    const b = evaluateAllowance(0, 50, 100, 10);
    expect(limitMessage(b, 100)).toContain("budget");
  });
});

describe("/ask default caps (Tier-2+ raised defaults)", () => {
  it("default caps are 100 questions/user/day and $10/day global", () => {
    expect(userDailyLimit()).toBe(100);
    expect(globalDailyBudgetUsd()).toBe(10);
  });

  it("both caps stay env-tunable", () => {
    process.env.ASK_USER_DAILY_LIMIT = "250";
    process.env.ASK_GLOBAL_DAILY_BUDGET_USD = "42";
    expect(userDailyLimit()).toBe(250);
    expect(globalDailyBudgetUsd()).toBe(42);
  });

  it("ignores non-positive / non-finite overrides", () => {
    process.env.ASK_USER_DAILY_LIMIT = "0";
    process.env.ASK_GLOBAL_DAILY_BUDGET_USD = "nope";
    expect(userDailyLimit()).toBe(100);
    expect(globalDailyBudgetUsd()).toBe(10);
  });
});

describe("cost estimation price table", () => {
  it("estimates gpt-4o-mini cost from list price (unchanged)", () => {
    // 1500 prompt + 200 completion ≈ $0.000345
    expect(estimateCostUsd("gpt-4o-mini", 1500, 200)).toBeCloseTo(0.000345, 6);
  });

  it("keeps the gpt-4o entry", () => {
    expect(estimateCostUsd("gpt-4o", 1_000_000, 0)).toBeCloseTo(2.5, 6);
    expect(estimateCostUsd("gpt-4o", 0, 1_000_000)).toBeCloseTo(10, 6);
  });

  it("prices the gpt-5 family from list price", () => {
    expect(estimateCostUsd("gpt-5", 1_000_000, 0)).toBeCloseTo(1.25, 6);
    expect(estimateCostUsd("gpt-5", 0, 1_000_000)).toBeCloseTo(10, 6);
    expect(estimateCostUsd("gpt-5-mini", 1_000_000, 1_000_000)).toBeCloseTo(0.125 + 1, 6);
    expect(estimateCostUsd("gpt-5-nano", 1_000_000, 1_000_000)).toBeCloseTo(0.05 + 0.4, 6);
  });

  it("unknown models get a conservative over-estimate (dearer than any known model)", () => {
    expect(estimateCostUsd("mystery-model", 1000, 1000)).toBeGreaterThan(
      estimateCostUsd("gpt-4o", 1000, 1000),
    );
    expect(estimateCostUsd("mystery-model", 1000, 1000)).toBeGreaterThan(
      estimateCostUsd("gpt-5", 1000, 1000),
    );
  });
});

describe("totalCostUsd — coherent stage settlement", () => {
  it("sums embed+rerank+answer when the per-stage breakdown is present", () => {
    expect(
      totalCostUsd({
        usageByStage: {
          embed: { costUsd: 0.0006 },
          rerank: { costUsd: 0.002 },
          answer: { costUsd: 0.005 },
        },
      }),
    ).toBeCloseTo(0.0076, 6);
  });

  it("falls back to answer-stage usage cost when usageByStage is absent (legacy path)", () => {
    expect(totalCostUsd({ usage: { costUsd: 0.004 } })).toBeCloseTo(0.004, 6);
  });

  it("does NOT double-count: usage is ignored once usageByStage is present", () => {
    expect(
      totalCostUsd({ usage: { costUsd: 999 }, usageByStage: { answer: { costUsd: 0.005 } } }),
    ).toBeCloseTo(0.005, 6);
  });

  it("a mid-pipeline failure settles to only the stages that ran (answer absent)", () => {
    expect(
      totalCostUsd({ usageByStage: { embed: { costUsd: 0.0006 }, rerank: { costUsd: 0.002 } } }),
    ).toBeCloseTo(0.0026, 6);
  });

  it("is zero when nothing was metered", () => {
    expect(totalCostUsd({})).toBe(0);
  });
});

describe("askWithLimits — gate, run, log", () => {
  it("logs a v2 question: cost_usd = stage sum; prompt/completion = answer stage", async () => {
    h.askMock.mockResolvedValue(v2Full());
    const res = await askWithLimits("What happened in Kherson?", "user@x.com");

    // Phase 0: askWithLimits threads its run's stage-timings collector into ask()
    expect(h.askMock).toHaveBeenCalledWith("What happened in Kherson?", {
      timings: expect.any(Object),
    });
    const p = insertParams()!;
    expect(p[COL.email]).toBe("user@x.com");
    expect(p[COL.provider]).toBe("openai:gpt-5-mini");
    expect(p[COL.costUsd]).toBeCloseTo(0.0076, 6); // 0.0006 + 0.002 + 0.005
    expect(p[COL.promptTokens]).toBe(900); // answer-stage token cols keep historical meaning
    expect(p[COL.completionTokens]).toBe(120);
    expect(p[COL.answerPromptTokens]).toBe(900);
    expect(p[COL.answerCompletionTokens]).toBe(120);
    expect(p[COL.answerCostUsd]).toBeCloseTo(0.005, 6);
    expect(p[COL.embedTokens]).toBe(30);
    expect(p[COL.embedCostUsd]).toBeCloseTo(0.0006, 6);
    expect(p[COL.rerankPromptTokens]).toBe(400);
    expect(p[COL.rerankCompletionTokens]).toBe(50);
    expect(p[COL.rerankCostUsd]).toBeCloseTo(0.002, 6);
    expect(p[COL.retrievalMode]).toBe("v2");
    expect(p[COL.state]).toBe("answered");
    expect(p[COL.rerankUsed]).toBe(true);
    expect(p[COL.evidenceCount]).toBe(5);
    expect(p[COL.totalMatching]).toBe(42);
    expect(p[COL.windowFrom]).toBe("2026-07-01");
    expect(p[COL.windowTo]).toBe("2026-07-08");
    // columns with no frozen-AskAnswerV2 source are inserted NULL
    expect(p[COL.rerankModel]).toBeNull();
    expect(p[COL.answerModel]).toBeNull();
    expect(p[COL.candidatesCount]).toBeNull();
    // returns a complete AskAnswerV2 and closes the pool
    expect(res.state).toBe("answered");
    expect(res.retrievalMode).toBe("v2");
    expect(res.totalMatching).toBe(42);
    expect(h.endMock.mock.calls.length).toBe(h.poolCtor.mock.calls.length); // every pool ended (Phase 1: shadow run-writes add pools)
  });

  it("legacy answer (no usageByStage): cost from usage; stage cols NULL; neutral-filled return", async () => {
    const legacy: AskAnswer = {
      answer: "Top matching evidence…",
      citedClaimIds: [7],
      evidenceCount: 3,
      terms: ["iran"],
      provider: "openai:gpt-4o-mini",
      usage: { promptTokens: 700, completionTokens: 90, costUsd: 0.004 },
    };
    h.askMock.mockResolvedValue(legacy);
    const res = await askWithLimits("q", "u@x.com");

    const p = insertParams()!;
    expect(p[COL.costUsd]).toBeCloseTo(0.004, 6);
    expect(p[COL.promptTokens]).toBe(700);
    expect(p[COL.completionTokens]).toBe(90);
    expect(p[COL.answerPromptTokens]).toBe(700);
    expect(p[COL.answerCompletionTokens]).toBe(90);
    expect(p[COL.answerCostUsd]).toBeCloseTo(0.004, 6);
    expect(p[COL.embedTokens]).toBeNull();
    expect(p[COL.embedCostUsd]).toBeNull();
    expect(p[COL.rerankPromptTokens]).toBeNull();
    expect(p[COL.rerankCostUsd]).toBeNull();
    // v2 fields absent on the result -> NULL in the ledger, no invention
    expect(p[COL.retrievalMode]).toBeNull();
    expect(p[COL.state]).toBeNull();
    expect(p[COL.rerankUsed]).toBeNull();
    expect(p[COL.totalMatching]).toBeNull();
    expect(p[COL.windowFrom]).toBeNull();
    expect(p[COL.evidenceCount]).toBe(3);
    // return is normalized to a complete AskAnswerV2 with the documented neutral fills
    expect(res.retrievalMode).toBe("legacy");
    expect(res.state).toBe("answered");
    expect(res.totalMatching).toBe(3); // = evidenceCount
    expect(res.relatedClaimIds).toEqual([]);
    expect(res.sampled).toBe(false);
    expect(res.window).toBeNull();
  });

  it("coherent settlement: embed+rerank ran, answer errored → cost = embed+rerank only", async () => {
    h.askMock.mockResolvedValue(
      v2Full({
        usage: undefined,
        usageByStage: {
          embed: { promptTokens: 30, completionTokens: 0, costUsd: 0.0006 },
          rerank: { promptTokens: 400, completionTokens: 50, costUsd: 0.002 },
          // answer stage never ran
        },
        state: "error",
        provider: "error",
      }),
    );
    const res = await askWithLimits("q", "u@x.com");

    const p = insertParams()!;
    expect(p[COL.costUsd]).toBeCloseTo(0.0026, 6); // NOT including a never-run answer stage
    expect(p[COL.promptTokens]).toBeNull(); // no answer stage, no legacy usage fallback
    expect(p[COL.answerPromptTokens]).toBeNull();
    expect(p[COL.answerCostUsd]).toBeNull();
    expect(p[COL.embedCostUsd]).toBeCloseTo(0.0006, 6);
    expect(p[COL.rerankCostUsd]).toBeCloseTo(0.002, 6);
    expect(p[COL.state]).toBe("error");
    expect(res.state).toBe("error");
  });

  it("defaults the logged email to 'anonymous' when no user is signed in", async () => {
    h.askMock.mockResolvedValue(v2Full());
    await askWithLimits("q", null);
    expect(insertParams()![COL.email]).toBe("anonymous");
  });

  it("truncates the logged question to 400 chars", async () => {
    h.askMock.mockResolvedValue(v2Full());
    await askWithLimits("x".repeat(1000), "u@x.com");
    expect(String(insertParams()![COL.question]).length).toBe(400);
  });

  it("user gate refuses BEFORE ask() runs and writes no row", async () => {
    usage.user_count = 100; // at the default per-user cap
    const res = await askWithLimits("q", "u@x.com");

    expect(h.askMock).not.toHaveBeenCalled();
    expect(insertParams()).toBeUndefined();
    expect(res.provider).toBe("limit");
    expect(res.state).toBe("limit");
    expect(res.answer).toContain("100/day");
    expect(h.endMock.mock.calls.length).toBe(h.poolCtor.mock.calls.length); // every pool ended (Phase 1: shadow run-writes add pools)
  });

  it("global budget gate refuses BEFORE ask() runs and writes no row", async () => {
    usage.global_cost = 10; // at the default global budget
    const res = await askWithLimits("q", "u@x.com");

    expect(h.askMock).not.toHaveBeenCalled();
    expect(insertParams()).toBeUndefined();
    expect(res.state).toBe("limit");
    expect(res.answer).toContain("budget");
  });

  it("ask() throwing still logs one row (state error, cost 0) so the question counts", async () => {
    h.askMock.mockRejectedValue(new Error("retrieve exploded"));
    const res = await askWithLimits("crash me", "u@x.com");

    const p = insertParams()!;
    expect(p[COL.email]).toBe("u@x.com");
    expect(p[COL.provider]).toBe("error");
    expect(p[COL.state]).toBe("error");
    expect(p[COL.costUsd]).toBe(0); // stage spend already landed in provider_usage; ledger cost is 0
    expect(p[COL.embedCostUsd]).toBeNull();
    expect(p[COL.answerCostUsd]).toBeNull();
    // the user gets a graceful AskAnswerV2, not a thrown error
    expect(res.state).toBe("error");
    expect(res.provider).toBe("error");
    expect(h.endMock.mock.calls.length).toBe(h.poolCtor.mock.calls.length); // every pool ended (Phase 1: shadow run-writes add pools)
  });
});

describe("askWithLimits — metering-field mapping + DB-outage hardening (post-review glue)", () => {
  it("maps candidatesCount/rerankModel/answerModel into their columns when the pipeline reports them", async () => {
    h.askMock.mockResolvedValue(
      v2Full({ candidatesCount: 300, rerankModel: "gpt-5-mini", answerModel: "gpt-5" }),
    );
    await askWithLimits("q", "u@x.com");

    const p = insertParams()!;
    expect(p[COL.candidatesCount]).toBe(300);
    expect(p[COL.rerankModel]).toBe("gpt-5-mini");
    expect(p[COL.answerModel]).toBe("gpt-5");
  });

  it("leaves the three columns NULL when the pipeline omits them (legacy / degraded)", async () => {
    h.askMock.mockResolvedValue(v2Full()); // fixture has no candidatesCount/models
    await askWithLimits("q", "u@x.com");

    const p = insertParams()!;
    expect(p[COL.candidatesCount]).toBeNull();
    expect(p[COL.rerankModel]).toBeNull();
    expect(p[COL.answerModel]).toBeNull();
  });

  it("usage-gate DB failure fails CLOSED: no ask() call, graceful contract-complete error", async () => {
    h.queryMock.mockRejectedValue(new Error("pool is down"));
    const res = await askWithLimits("q", "u@x.com");

    expect(h.askMock).not.toHaveBeenCalled();
    expect(res.state).toBe("error");
    expect(res.provider).toBe("error");
    expect(res.relatedClaimIds).toEqual([]);
    expect(res.window).toBeNull();
    expect(h.endMock.mock.calls.length).toBe(h.poolCtor.mock.calls.length); // every pool ended (Phase 1: shadow run-writes add pools)
  });

  it("success-row insert failure still returns the (already paid-for) answer", async () => {
    h.askMock.mockResolvedValue(v2Full());
    h.queryMock.mockImplementation(async (text: string) => {
      if (String(text).includes("INSERT INTO ask_usage")) throw new Error("insert failed");
      return { rows: [{ user_count: 0, global_cost: 0 }] };
    });
    const res = await askWithLimits("q", "u@x.com");

    expect(res.state).toBe("answered");
    expect(res.citedClaimIds).toEqual([1]);
    expect(h.endMock.mock.calls.length).toBe(h.poolCtor.mock.calls.length); // every pool ended (Phase 1: shadow run-writes add pools)
  });

  it("error-row insert failure does not mask the original ask() error", async () => {
    h.askMock.mockRejectedValue(new Error("retrieve exploded"));
    h.queryMock.mockImplementation(async (text: string) => {
      if (String(text).includes("INSERT INTO ask_usage")) throw new Error("insert also failed");
      return { rows: [{ user_count: 0, global_cost: 0 }] };
    });
    const res = await askWithLimits("q", "u@x.com");

    expect(res.state).toBe("error");
    expect(res.answer).toContain("retrieve exploded"); // the ORIGINAL cause, not the insert failure
    expect(h.endMock.mock.calls.length).toBe(h.poolCtor.mock.calls.length); // every pool ended (Phase 1: shadow run-writes add pools)
  });
});

// ---- Phase 0 measurement: run identity + stage timings (2026-07-19) --------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("askWithLimits — run id, started_at, stage timings", () => {
  it("a successful run's row carries run_id (UUID) + started_at + timings with pipelineMs; the payload's runId matches the row", async () => {
    h.askMock.mockResolvedValue(v2Full());
    const res = await askWithLimits("What happened in Kherson?", "user@x.com");

    const p = insertParams()!;
    expect(p[COL.runId]).toMatch(UUID_RE);
    expect(p[COL.startedAt]).toBeInstanceOf(Date);
    const timings = JSON.parse(String(p[COL.stageTimingsMs]));
    expect(typeof timings.pipelineMs).toBe("number");
    expect(timings.pipelineMs).toBeGreaterThanOrEqual(0);
    expect(res.runId).toBe(p[COL.runId]);
  });

  it("stage timings collected before a thrown pipeline survive onto the error row", async () => {
    // ask() records some stage keys onto the shared collector, then throws.
    h.askMock.mockImplementation(async (_q: string, opts?: { timings?: Record<string, number> }) => {
      if (opts?.timings) {
        opts.timings.embedMs = 42;
        opts.timings.lexicalMs = 7;
      }
      throw new Error("mid-pipeline crash");
    });
    const res = await askWithLimits("q", "u@x.com");

    expect(res.state).toBe("error");
    expect(res.runId).toMatch(UUID_RE);
    const p = insertParams()!;
    expect(p[COL.runId]).toBe(res.runId);
    const timings = JSON.parse(String(p[COL.stageTimingsMs]));
    expect(timings.embedMs).toBe(42);
    expect(timings.lexicalMs).toBe(7);
    expect(typeof timings.pipelineMs).toBe("number");
  });

  it("two runs mint distinct run ids", async () => {
    h.askMock.mockResolvedValue(v2Full());
    const a = await askWithLimits("q1", "u@x.com");
    const b = await askWithLimits("q2", "u@x.com");
    expect(a.runId).toMatch(UUID_RE);
    expect(b.runId).toMatch(UUID_RE);
    expect(a.runId).not.toBe(b.runId);
  });

  it("a limit refusal writes no row and carries NO runId (nothing exists to patch)", async () => {
    usage = { user_count: 100, global_cost: 0 }; // at the default per-user cap
    const res = await askWithLimits("q", "u@x.com");
    expect(res.state).toBe("limit");
    expect(res.runId).toBeUndefined();
    expect(insertParams()).toBeUndefined();
  });

  it("a gate-unavailable refusal carries NO runId either", async () => {
    h.queryMock.mockImplementation(async (text: string) => {
      if (String(text).includes("INSERT INTO ask_usage")) return { rows: [] };
      throw new Error("gate read failed");
    });
    const res = await askWithLimits("q", "u@x.com");
    expect(res.state).toBe("error");
    expect(res.runId).toBeUndefined();
    expect(insertParams()).toBeUndefined();
  });
});

describe("recordEntryTimings — entry-point patch", () => {
  it("merges the patch into the run's row by run_id via jsonb ||", async () => {
    await recordEntryTimings("11111111-2222-4333-8444-555555555555", { hydrateMs: 12, totalMs: 340 });
    const call = h.queryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE ask_usage"));
    expect(call).toBeTruthy();
    expect(String(call![0])).toContain("stage_timings_ms = coalesce(stage_timings_ms, '{}'::jsonb) || $2::jsonb");
    const params = call![1] as unknown[];
    expect(params[0]).toBe("11111111-2222-4333-8444-555555555555");
    expect(JSON.parse(String(params[1]))).toEqual({ hydrateMs: 12, totalMs: 340 });
    expect(h.endMock).toHaveBeenCalled();
  });

  it("is fail-soft: a failed patch never throws (telemetry only, answer unaffected)", async () => {
    h.queryMock.mockRejectedValue(new Error("db down"));
    await expect(
      recordEntryTimings("11111111-2222-4333-8444-555555555555", { apiTotalMs: 5 }),
    ).resolves.toBeUndefined();
    expect(h.endMock).toHaveBeenCalled();
  });
});

// ---- Phase 1: enforce mode (ASK_RUNS_ENFORCE=1) ----------------------------------

describe("askWithLimits — Phase 1 enforce mode", () => {
  beforeEach(() => {
    process.env.ASK_RUNS_ENFORCE = "1";
    process.env.ASK_CONTENT_RETENTION_DAYS = "30"; // enforce requires retention (features.ts)
  });

  it("threads the atomic stage guards into ask() and finalizes the run with the settled cost", async () => {
    h.askMock.mockResolvedValue(v2Full());
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.state).toBe("answered");
    expect(h.buildGuardsMock).toHaveBeenCalledTimes(1);
    expect(h.askMock).toHaveBeenCalledWith("q", {
      timings: expect.any(Object),
      guards: { embed: "G_EMBED", rerank: "G_RERANK", answer: "G_ANSWER" },
    });
    expect(h.finalizeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ state: "answered", settledCostUsd: expect.closeTo(0.0076, 6) }),
    );
    expect(h.createRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "key-1", userEmail: "u@x.com" }),
    );
    expect(h.expireStaleRunsMock).toHaveBeenCalledTimes(1); // lazy sweep ran
  });

  it("a replayed TERMINAL run returns the stored result with the ORIGINAL runId, replayed:true, zero pipeline calls", async () => {
    const stored = v2Full({ answer: "stored answer [c1]." });
    h.createRunMock.mockResolvedValue({
      run: { id: "orig-run-id", userEmail: "u", question: "q", status: "finished", state: "answered", result: stored, finishedAt: "2026-07-19T00:00:00Z", expired: false },
      replayed: true,
    });
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.answer).toBe("stored answer [c1].");
    expect(res.runId).toBe("orig-run-id");
    expect(res.replayed).toBe(true); // entry points must not patch the original's timings
    expect(h.askMock).not.toHaveBeenCalled(); // zero provider work
    expect(h.reserveAllowanceMock).not.toHaveBeenCalled(); // zero new allowance
    expect(insertParams()).toBeUndefined(); // zero new usage rows
  });

  it("a replayed IN-FLIGHT run returns the honest duplicate copy, zero pipeline calls", async () => {
    h.createRunMock.mockResolvedValue({
      run: { id: "orig-run-id", userEmail: "u", question: "q", status: "running", state: null, result: null, finishedAt: null, expired: false },
      replayed: true,
    });
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.provider).toBe("duplicate"); // NOT "limit" — the API 429 mapping keys on provider
    expect(res.state).toBe("limit");
    expect(res.answer).toContain("still being processed");
    expect(res.runId).toBe("orig-run-id");
    expect(res.replayed).toBe(true);
    expect(h.askMock).not.toHaveBeenCalled();
  });

  it("a replayed EXPIRED run (terminal, no result) returns the honest 'did not complete' copy — never the false promise (Gate 1)", async () => {
    h.createRunMock.mockResolvedValue({
      run: { id: "orig-run-id", userEmail: "u", question: "q", status: "expired", state: null, result: null, finishedAt: "2026-07-19T00:15:00Z", expired: true },
      replayed: true,
    });
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.provider).toBe("duplicate");
    expect(res.state).toBe("error");
    expect(res.answer).toContain("did not complete");
    expect(res.answer).not.toContain("will return the answer");
    expect(res.replayed).toBe(true);
    expect(h.askMock).not.toHaveBeenCalled();
  });

  it("G6: a replayed key whose run's content was DELETED (§7.7) returns the honest deleted copy — not question-mismatch, not expired", async () => {
    h.createRunMock.mockResolvedValue({
      run: { id: "orig-run-id", userEmail: "u", question: "[deleted]", status: "finished", state: "answered", result: null, finishedAt: "2026-07-19T00:00:00Z", expired: false },
      replayed: true,
    });
    const res = await askWithLimits("the original question", "u@x.com", { idempotencyKey: "key-1" });
    expect(res.answer).toContain("deleted at the owner's request");
    expect(res.answer).not.toContain("different question"); // the old FALSE copy
    expect(res.answer).not.toContain("did not complete");
    expect(h.askMock).not.toHaveBeenCalled();
  });

  it("a reused key with a DIFFERENT question refuses honestly — never the wrong stored answer (Gate 1)", async () => {
    const stored = v2Full({ answer: "stored answer for the OTHER question." });
    h.createRunMock.mockResolvedValue({
      run: { id: "orig-run-id", userEmail: "u", question: "the original question", status: "finished", state: "answered", result: stored, finishedAt: "2026-07-19T00:00:00Z", expired: false },
      replayed: true,
    });
    const res = await askWithLimits("a completely different question", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.provider).toBe("duplicate");
    expect(res.state).toBe("error");
    expect(res.answer).toContain("different question");
    expect(res.answer).not.toContain("stored answer");
    expect(res.replayed).toBe(true);
    expect(h.askMock).not.toHaveBeenCalled();
  });

  it("an allowance user_limit refusal finalizes the run as 'limit' and never calls ask()", async () => {
    h.reserveAllowanceMock.mockResolvedValue({ ok: false, reason: "user_limit" });
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.state).toBe("limit");
    expect(res.provider).toBe("limit");
    expect(res.runId).toBeTruthy(); // enforce mode: the run row exists
    expect(h.askMock).not.toHaveBeenCalled();
    expect(h.finalizeRunMock).toHaveBeenCalledWith(expect.objectContaining({ state: "limit" }));
  });

  it("an unavailable allowance gate fails CLOSED as an error run", async () => {
    h.reserveAllowanceMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.state).toBe("error");
    expect(h.askMock).not.toHaveBeenCalled();
    expect(h.finalizeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ state: "error", errorClass: "allowance_unavailable" }),
    );
  });

  it("run persistence failure fails CLOSED before any gate or pipeline work", async () => {
    h.createRunMock.mockRejectedValue(new Error("ask_runs unavailable"));
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.state).toBe("error");
    expect(res.answer).toContain("run persistence unavailable");
    expect(h.askMock).not.toHaveBeenCalled();
    expect(h.reserveAllowanceMock).not.toHaveBeenCalled();
  });

  it("the GLOBAL daily budget still refuses (legacy read-check retained by contract §3)", async () => {
    usage = { user_count: 0, global_cost: 10 }; // at the default $10 global budget
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(res.state).toBe("limit");
    expect(res.answer).toContain("shared daily analysis budget");
    expect(h.reserveAllowanceMock).not.toHaveBeenCalled(); // refused before the slot
    expect(h.askMock).not.toHaveBeenCalled();
  });
});

describe("askWithLimits — Phase 1 shadow mode stays byte-equivalent", () => {
  beforeEach(() => {
    // Release hardening: shadow persistence is an explicit opt-in + retention.
    process.env.ASK_RUNS_SHADOW = "1";
    process.env.ASK_CONTENT_RETENTION_DAYS = "30";
  });

  it("shadow createRun failure never blocks the request", async () => {
    h.createRunMock.mockRejectedValue(new Error("ask_runs table missing"));
    h.askMock.mockResolvedValue(v2Full());
    const res = await askWithLimits("q", "u@x.com");

    expect(res.state).toBe("answered"); // request unaffected
    expect(h.askMock).toHaveBeenCalledTimes(1);
  });

  it("shadow mode never builds atomic guards and never enforces replay", async () => {
    h.createRunMock.mockResolvedValue({
      run: { id: "orig", userEmail: "u", question: "q", status: "finished", state: "answered", result: v2Full(), finishedAt: "t", expired: false },
      replayed: true, // a shadow-detected collision must change NOTHING
    });
    h.askMock.mockResolvedValue(v2Full());
    const res = await askWithLimits("q", "u@x.com", { idempotencyKey: "key-1" });

    expect(h.buildGuardsMock).not.toHaveBeenCalled();
    expect(h.askMock).toHaveBeenCalledTimes(1); // pipeline ran despite the collision
    expect(res.runId).not.toBe("orig"); // fresh run identity as always
  });
});

// ---- Phase 4: exact-cache wiring + route recording -------------------------------

describe("askWithLimits — Phase 4 exact cache (ASK_EXACT_CACHE)", () => {
  const SNAPSHOT = { version: 1, candidates: [], selectedClaimIds: [] };

  beforeEach(() => {
    // Release hardening: exact cache is effective only on the full progressive
    // stack (enforce + retention + progressive + cache TTL — features.ts).
    process.env.ASK_RUNS_ENFORCE = "1";
    process.env.ASK_CONTENT_RETENTION_DAYS = "30";
    process.env.ASK_PROGRESSIVE = "1";
    process.env.ASK_CACHE_TTL_DAYS = "7";
  });

  it("flag OFF (default): the cache module is never consulted", async () => {
    h.askMock.mockResolvedValue(v2Full());
    await askWithLimits("q", "u@x.com");
    expect(h.corpusVersionMock).not.toHaveBeenCalled();
    expect(h.cacheLookupMock).not.toHaveBeenCalled();
    expect(h.cacheStoreMock).not.toHaveBeenCalled();
  });

  it("flag ON + HIT: the stored payload returns with THIS gesture's runId and cacheStatus, the paid pipeline never runs, a $0 usage row is written", async () => {
    vi.stubEnv("ASK_EXACT_CACHE", "1");
    h.corpusVersionMock.mockResolvedValue("100:50");
    h.cacheKeyMock.mockReturnValue("key-abc");
    h.cacheLookupMock.mockResolvedValue({
      result: v2Full({ answer: "Cached answer [c1]." }),
      snapshot: SNAPSHOT,
      createdAt: "2026-07-20",
    });
    const res = await askWithLimits("cached question", "u@x.com");

    expect(h.askMock).not.toHaveBeenCalled(); // zero provider pipeline
    expect(res.answer).toBe("Cached answer [c1].");
    expect(res.cacheStatus).toBe("exact");
    expect(res.provider).toBe("openai:gpt-5-mini"); // the USER-facing payload keeps its true provider
    expect(res.runId).toBeTruthy();
    const usageInsert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_usage"));
    expect(usageInsert).toBeTruthy();
    expect(usageInsert![1][5]).toBe(0); // cost_usd = $0
    // Gate 4: the hit's accounting row is marked and carries NO paid stage
    // columns (they'd replay the ORIGINAL run's spend into a $0 row)
    expect(usageInsert![1][2]).toBe("cache:exact"); // provider marker
    expect(usageInsert![1][3]).toBeNull(); // prompt_tokens
    expect(usageInsert![1][18]).toBeNull(); // answer_cost_usd
    // the frozen snapshot is re-persisted onto THIS run's row (F11 hydration)
    const snapPersist = h.queryMock.mock.calls.find((c) => String(c[0]).includes("SET evidence_snapshot"));
    expect(snapPersist).toBeTruthy();
  });

  it("Gate 4: anonymous identities never touch the cache (no pooled 'anonymous' namespace)", async () => {
    vi.stubEnv("ASK_EXACT_CACHE", "1");
    h.askMock.mockResolvedValue(v2Full());
    await askWithLimits("q", null); // FEATURE_AUTH_GATE-off dev path
    expect(h.corpusVersionMock).not.toHaveBeenCalled();
    expect(h.cacheLookupMock).not.toHaveBeenCalled();
    expect(h.cacheStoreMock).not.toHaveBeenCalled();
  });

  it("flag ON + MISS: the pipeline runs and an ANSWERED result with a snapshot is stored", async () => {
    vi.stubEnv("ASK_EXACT_CACHE", "1");
    h.corpusVersionMock.mockResolvedValue("100:50");
    h.cacheKeyMock.mockReturnValue("key-abc");
    h.cacheLookupMock.mockResolvedValue(null);
    h.askMock.mockResolvedValue(v2Full({ provider: "openai:gpt-5" }));
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_usage")) return { rows: [] };
      if (String(sql).includes("evidence_snapshot")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      return { rows: [{ user_count: 0, global_cost: 0 }] };
    });
    await askWithLimits("q", "u@x.com");
    expect(h.askMock).toHaveBeenCalledTimes(1);
    expect(h.cacheStoreMock).toHaveBeenCalledTimes(1);
    const stored = h.cacheStoreMock.mock.calls[0][0] as { key: string; snapshot: unknown };
    expect(stored.key).toBe("key-abc");
    expect(stored.snapshot).toEqual(SNAPSHOT);
  });

  it("flag ON + MISS without a snapshot (action path): nothing is stored", async () => {
    vi.stubEnv("ASK_EXACT_CACHE", "1");
    h.corpusVersionMock.mockResolvedValue("100:50");
    h.cacheKeyMock.mockReturnValue("key-abc");
    h.cacheLookupMock.mockResolvedValue(null);
    h.askMock.mockResolvedValue(v2Full({ provider: "openai:gpt-5" }));
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_usage")) return { rows: [] };
      if (String(sql).includes("evidence_snapshot")) return { rows: [{ evidence_snapshot: null }] };
      return { rows: [{ user_count: 0, global_cost: 0 }] };
    });
    await askWithLimits("q", "u@x.com");
    expect(h.cacheStoreMock).not.toHaveBeenCalled();
  });

  it("degraded providers (stub/budget) are NEVER cached (truth-in-UI)", async () => {
    vi.stubEnv("ASK_EXACT_CACHE", "1");
    h.corpusVersionMock.mockResolvedValue("100:50");
    h.cacheKeyMock.mockReturnValue("key-abc");
    h.cacheLookupMock.mockResolvedValue(null);
    h.askMock.mockResolvedValue(v2Full({ provider: "stub" }));
    await askWithLimits("q", "u@x.com");
    expect(h.cacheStoreMock).not.toHaveBeenCalled();
  });

  it("a cache-path failure is a MISS, never a failed question", async () => {
    vi.stubEnv("ASK_EXACT_CACHE", "1");
    h.corpusVersionMock.mockRejectedValue(new Error("cache db down"));
    h.askMock.mockResolvedValue(v2Full());
    const res = await askWithLimits("q", "u@x.com");
    expect(res.state).toBe("answered");
    expect(h.askMock).toHaveBeenCalledTimes(1);
  });
});

describe("askWithLimits — Phase 4 route recording (ASK_ROUTER)", () => {
  it("flag OFF (default): route_policy stays null in the usage row", async () => {
    h.askMock.mockResolvedValue(v2Full());
    await askWithLimits("q", "u@x.com");
    const usageInsert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_usage"));
    expect(usageInsert![1][27]).toBeNull(); // route_policy param
  });

  it("flag ON: the Auto policy string is recorded; behavior (the ask() call) is untouched", async () => {
    vi.stubEnv("ASK_ROUTER", "1");
    h.askMock.mockResolvedValue(v2Full());
    await askWithLimits("q", "u@x.com");
    const usageInsert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_usage"));
    expect(String(usageInsert![1][27])).toMatch(/^route-v1:auto:/);
    expect(h.askMock).toHaveBeenCalledTimes(1); // same single pipeline call as ever
  });
});
