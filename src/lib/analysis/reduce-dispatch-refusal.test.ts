import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Refuse-before-reserve at the REDUCE dispatch site (2026-09-06 provider
// dimension). generateMapReduceDigest resolves workloadDispatchConfig("reduce")
// before it opens a Pool, before reduceGuardFromEnv().init(), and before the
// OpenAI client exists — so a provider outside the workload allowlist spends
// nothing, opens no connection and writes nothing (standing ruling 4).
//
// The DB, guard, persist layer and SDK are all mocked, so every "never called"
// assertion is literal rather than inferred.

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { poolCtor, poolQuery, guardInit, guardReserve, guardRecord, ctorSpy, createSpy, persistDigest, loadReduceClaims } =
  vi.hoisted(() => ({
    poolCtor: vi.fn(),
    poolQuery: vi.fn(),
    guardInit: vi.fn(async () => {}),
    guardReserve: vi.fn(() => ({ ok: true as const })),
    guardRecord: vi.fn(async () => {}),
    ctorSpy: vi.fn(),
    createSpy: vi.fn(),
    persistDigest: vi.fn(),
    loadReduceClaims: vi.fn(),
  }));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    constructor(opts?: unknown) {
      poolCtor(opts);
    }
    query = poolQuery;
    connect = async () => ({ query: poolQuery, release: () => {} });
    end = async () => {};
  },
}));

vi.mock("../usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/llm-guard")>();
  return {
    ...actual,
    reduceGuardFromEnv: () => ({ init: guardInit, tryReserve: guardReserve, record: guardRecord }),
  };
});

vi.mock("./openai-client", () => ({
  analysisOpenAiClient: () => {
    ctorSpy();
    return { chat: { completions: { create: createSpy } } };
  },
}));

vi.mock("./digest-persist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./digest-persist")>();
  return { ...actual, persistDigest };
});

vi.mock("./reduce-io", () => ({ loadReduceClaims }));

const { generateMapReduceDigest } = await import("./synthesize");

const ENV_KEYS = [
  "REDUCE_PROVIDER",
  "REDUCE_MODEL",
  "REDUCE_REASONING_EFFORT",
  "OPENAI_MODEL",
  "LLM_DISABLE",
  "ANALYSIS_PROVIDER",
] as const;
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  poolCtor.mockClear();
  poolQuery.mockReset();
  guardInit.mockClear();
  guardReserve.mockClear();
  guardRecord.mockClear();
  ctorSpy.mockClear();
  createSpy.mockReset();
  persistDigest.mockReset();
  loadReduceClaims.mockReset();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

function expectNothingHappened() {
  expect(poolCtor).not.toHaveBeenCalled();
  expect(poolQuery).not.toHaveBeenCalled();
  expect(guardInit).not.toHaveBeenCalled();
  expect(guardReserve).not.toHaveBeenCalled();
  expect(guardRecord).not.toHaveBeenCalled();
  expect(ctorSpy).not.toHaveBeenCalled();
  expect(createSpy).not.toHaveBeenCalled();
  expect(persistDigest).not.toHaveBeenCalled();
  expect(loadReduceClaims).not.toHaveBeenCalled();
}

describe("reduce dispatch site — provider refused before reservation", () => {
  it("REDUCE_PROVIDER=anthropic throws typed and touches nothing", async () => {
    process.env.REDUCE_PROVIDER = "anthropic";
    await expect(generateMapReduceDigest("ua", "2026-08-17", "military")).rejects.toThrow(
      /not allowed for workload "reduce"/,
    );
    expectNothingHappened();
  });

  it("an unknown REDUCE_PROVIDER throws typed and touches nothing", async () => {
    process.env.REDUCE_PROVIDER = "not-a-vendor";
    await expect(generateMapReduceDigest("ua", "2026-08-17", "military")).rejects.toThrow(
      /is not a known provider/,
    );
    expectNothingHappened();
  });

  it("REDUCE_PROVIDER=stub is refused too (the offline switch is ANALYSIS_PROVIDER)", async () => {
    process.env.REDUCE_PROVIDER = "stub";
    await expect(generateMapReduceDigest("ua", "2026-08-17", "military")).rejects.toThrow(
      /not a dispatch provider/,
    );
    expectNothingHappened();
  });

  it("the refusal is a ModelConfigError, so digest.ts's truncation ladder rethrows it", async () => {
    // the ladder retries only on a message containing "truncated" — a config
    // refusal must not burn the smaller rungs
    process.env.REDUCE_PROVIDER = "anthropic";
    const err = await generateMapReduceDigest("ua", "2026-08-17", "military").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("MODEL_CONFIG");
    expect((err as Error).message).not.toContain("truncated");
  });

  it("the pin is not vacuous: with the provider absent the same call proceeds past the gate", async () => {
    // no claims in window -> null, but only AFTER the pool was opened, which
    // proves the refusals above stopped strictly earlier
    poolQuery.mockImplementation(async (sql: string) =>
      /FROM countries/.test(sql) ? { rows: [{ id: 3 }] } : { rows: [] },
    );
    loadReduceClaims.mockResolvedValue({ claims: [], mirrorOf: new Map(), quotesBackfilled: 0 });
    await expect(generateMapReduceDigest("ua", "2026-08-17", "military")).resolves.toBeNull();
    expect(poolCtor).toHaveBeenCalled();
  });
});
