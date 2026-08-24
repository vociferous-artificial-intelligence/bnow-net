import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Engine-level asOf wiring (quality foundation, 2026-08-17): BOTH engines reach
// the shared persist boundary — and with it the evidence-recency calculator —
// carrying an HONEST analysis cutoff: legacy = the exclusive end of its fixed
// UTC gather day; mapreduce day mode = the window-end midnight; rolling mode =
// the injected run clock. persistDigest is mocked as a spy so no DB or LLM is
// touched; the calculator itself is covered by evidence-recency.test.ts and the
// persist wiring by digest-persist.test.ts.

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { poolQueryMock, persistDigestMock, loadReduceClaimsMock, createMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  persistDigestMock: vi.fn(),
  loadReduceClaimsMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = poolQueryMock;
    connect = async () => ({ query: poolQueryMock, release: () => {} });
    end = async () => {};
  },
}));

vi.mock("./digest-persist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./digest-persist")>();
  return { ...actual, persistDigest: persistDigestMock };
});

vi.mock("./reduce-io", () => ({ loadReduceClaims: loadReduceClaimsMock }));

vi.mock("../usage/llm-guard", () => ({
  LlmBudgetError: class LlmBudgetError extends Error {},
  assertLlmEnabled: vi.fn(),
  reduceGuardFromEnv: () => ({
    init: async () => {},
    tryReserve: () => ({ ok: true }),
    record: async () => {},
  }),
  reduceMaxOutputTokens: () => 4_000,
}));

vi.mock("./openai-client", () => ({
  analysisOpenAiClient: () => ({ chat: { completions: { create: createMock } } }),
}));

const { generateDigest } = await import("./digest");
const { generateMapReduceDigest } = await import("./synthesize");

const VOTE = JSON.stringify({
  events: [
    {
      title: "Odesa strikes",
      type: "strike",
      summary: "Port infrastructure struck.",
      claims: [{ text: "Odesa port struck", gids: [1] }],
    },
  ],
});

function reduceClaim(claimDate: string, publishedAt: string) {
  return {
    id: 1,
    docId: 10,
    textEn: "Russian forces struck the port of Odesa with missiles",
    quoteOrig: null,
    quoteVerified: false,
    claimType: "factual" as const,
    hedging: "claimed" as const,
    entities: [],
    eventHint: null,
    claimDate,
    sourceDomain: "mil.ru",
    sourceKey: "mil.ru",
    reliability: 0.6,
    adapter: "rss",
    platform: "web",
    publishedAt,
  };
}

beforeEach(() => {
  poolQueryMock.mockReset();
  persistDigestMock.mockReset();
  loadReduceClaimsMock.mockReset();
  createMock.mockReset();
  persistDigestMock.mockResolvedValue({ digestId: 9, claimCount: 1 });
  createMock.mockResolvedValue({
    choices: [{ message: { content: VOTE }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  });
});

afterEach(() => {
  delete process.env.ANALYSIS_PROVIDER;
});

describe("legacy engine asOf", () => {
  it("passes the exclusive end of the fixed UTC gather day to persistDigest", async () => {
    process.env.ANALYSIS_PROVIDER = "stub";
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM countries/.test(sql)) return { rows: [{ id: 1 }] };
      if (/FROM raw_documents rd/.test(sql)) {
        return {
          rows: [
            {
              id: 5,
              title: "Strike report",
              content:
                "Russian forces conducted a missile strike on port infrastructure in Odesa Oblast overnight",
              lang: "en",
              url: "https://example.com/1",
              published_at: null,
              adapter: "rss",
              source_key: "mil.ru",
              reliability: 0.5,
              platform: "web",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const out = await generateDigest("ua", "2026-07-11", "military");
    expect(out).toMatchObject({ digestId: 9 });
    expect(persistDigestMock).toHaveBeenCalledOnce();
    const args = persistDigestMock.mock.calls[0][0];
    expect(args.asOf).toBe("2026-07-12T00:00:00.000Z");
    // regression pin: the legacy stats keys are unchanged by the recency work
    // (persistDigest appends publicationGuard/evidenceRecency itself)
    expect(Object.keys(args.structured.stats)).toEqual([
      "docsAnalyzed",
      "docsRaw",
      "trackRows",
      "sourceMix",
      "droppedClaims",
      "ladder",
      "sentDocIds",
    ]);
  });
});

describe("mapreduce engine asOf + vote-stage counters", () => {
  beforeEach(() => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (/FROM countries/.test(sql)) return { rows: [{ id: 3 }] };
      return { rows: [] }; // rolling-mode prior-docs read -> no prior digest
    });
  });

  it("day mode: asOf is the window-end midnight (same instant as the ranking clock)", async () => {
    loadReduceClaimsMock.mockResolvedValue({
      claims: [reduceClaim("2026-07-11", "2026-07-11T10:00:00Z")],
      mirrorOf: new Map(),
      quotesBackfilled: 0,
    });
    const out = await generateMapReduceDigest("ua", "2026-07-11", "military");
    expect(out).toMatchObject({ digestId: 9 });
    expect(persistDigestMock).toHaveBeenCalledOnce();
    const args = persistDigestMock.mock.calls[0][0];
    expect(args.asOf).toBe("2026-07-12T00:00:00.000Z");

    // additive reduce counters: existing keys byte-identical, two appended
    expect(Object.keys(args.structured.stats)).toEqual([
      "engine",
      "reduce",
      "docsAnalyzed",
      "llm",
    ]);
    expect(Object.keys(args.structured.stats.reduce)).toEqual([
      "dispatch",
      "window",
      "claims",
      "metaDropped",
      "groupsTotal",
      "groupsFed",
      "quotesBackfilled",
      "votes",
      "votesRequested",
      "failedVotes",
      "eventsPerVote",
      "survivingEvents",
      "droppedGidRefs",
      "gidsCitedAnyVote",
      "gidsMajority",
    ]);
    expect(args.structured.stats.reduce.gidsCitedAnyVote).toBe(1);
    expect(args.structured.stats.reduce.gidsMajority).toBe(1);
  });

  it("rolling mode: asOf is the injected run clock, not a wall-clock read", async () => {
    const NOW_MS = Date.parse("2026-07-11T18:30:00Z");
    loadReduceClaimsMock.mockResolvedValue({
      claims: [reduceClaim("2026-07-11", "2026-07-11T10:00:00Z")], // within the last 24h
      mirrorOf: new Map(),
      quotesBackfilled: 0,
    });
    const out = await generateMapReduceDigest("ua", "2026-07-11", "military", {
      window: "rolling",
      nowMs: NOW_MS,
    });
    expect(out).toMatchObject({ digestId: 9 });
    const args = persistDigestMock.mock.calls[0][0];
    expect(args.asOf).toBe("2026-07-11T18:30:00.000Z");
    expect(args.structured.stats.reduce.window).toEqual({
      from: "2026-07-10",
      to: "2026-07-12",
      mode: "rolling",
    });
  });
});
