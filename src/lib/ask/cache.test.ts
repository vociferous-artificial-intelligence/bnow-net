import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const h = vi.hoisted(() => ({ queryMock: vi.fn(), endMock: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));

const { cacheKey, cacheLookup, cacheStore, corpusVersion, normalizeQuestion, promptVersion } =
  await import("./cache");
import type { AskAnswerV2 } from "./types";
import type { EvidenceSnapshot } from "./events";

const WINDOW = { from: "2026-07-01", to: "2026-07-07", matchedPhrase: "last week" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("normalizeQuestion — exact-match normalization only (no semantic folding)", () => {
  it("folds case/whitespace/trailing punctuation; distinct wording stays distinct", () => {
    expect(normalizeQuestion("  What   strikes HAPPENED?  ")).toBe("what strikes happened");
    expect(normalizeQuestion("what strikes happened")).toBe("what strikes happened");
    expect(normalizeQuestion("what strike happened")).not.toBe(
      normalizeQuestion("what strikes happened"),
    );
  });
});

describe("cacheKey — every answer-shaping input participates (Gate 4 sensitivity matrix)", () => {
  const base = () => cacheKey({ question: "What strikes happened?", window: null, corpusVersion: "100:50" });

  it("identical inputs produce the identical key; normalization folds cosmetic variants", () => {
    expect(base()).toBe(base());
    expect(
      cacheKey({ question: "  what STRIKES happened  ", window: null, corpusVersion: "100:50" }),
    ).toBe(base());
  });

  it("question, window, corpus version, K, candidate cap, and prompt hash each miss on change", () => {
    expect(cacheKey({ question: "Different question?", window: null, corpusVersion: "100:50" })).not.toBe(base());
    expect(cacheKey({ question: "What strikes happened?", window: WINDOW, corpusVersion: "100:50" })).not.toBe(base());
    expect(cacheKey({ question: "What strikes happened?", window: null, corpusVersion: "101:51" })).not.toBe(base());
    const before = base();
    vi.stubEnv("ASK_EVIDENCE_K", "40");
    expect(base()).not.toBe(before);
    vi.unstubAllEnvs();
    vi.stubEnv("ASK_CANDIDATES", "200");
    expect(base()).not.toBe(before);
  });

  it("Gate 4: model/pipeline/toggle knobs each miss on change (a rollback can never re-serve old-config entries)", () => {
    const before = base();
    const knobs: Array<[string, string]> = [
      ["ASK_ANSWER_MODEL", "gpt-4o"],
      ["ASK_RERANK_MODEL", "gpt-4o-mini"],
      ["ASK_PIPELINE", "legacy"],
      ["ASK_ANSWER_MAX_OUTPUT_TOKENS", "500"],
      ["ASK_VECTOR_TOP", "10"],
      ["ASK_LEXICAL_TOP", "10"],
      ["ASK_RELEVANT_EVIDENCE_FLOOR", "20"],
      ["ASK_RELEVANCE_BOUNDARY", "0"],
      ["ASK_NO_COVERAGE_SHORTCIRCUIT", "0"],
      ["ASK_FIDELITY_FALLBACK", "0"],
    ];
    for (const [k, v] of knobs) {
      vi.stubEnv(k, v);
      expect(base(), `${k} must move the key`).not.toBe(before);
      vi.unstubAllEnvs();
    }
  });

  it("Gate 4: the window's matchedPhrase casing does NOT split entries (resolved dates only)", () => {
    const a = cacheKey({
      question: "strikes past week",
      window: { from: "2026-07-13", to: "2026-07-20", matchedPhrase: "Past Week" } as never,
      corpusVersion: "100:50",
    });
    const b = cacheKey({
      question: "strikes past week",
      window: { from: "2026-07-13", to: "2026-07-20", matchedPhrase: "past week" } as never,
      corpusVersion: "100:50",
    });
    expect(a).toBe(b);
  });

  it("promptVersion is a stable hash of SYSTEM_V2 (prompt edits invalidate everything)", () => {
    expect(promptVersion()).toMatch(/^[0-9a-f]{12}$/);
    expect(promptVersion()).toBe(promptVersion());
  });
});

describe("corpusVersion", () => {
  it("derives maxId:count from the claims table", async () => {
    h.queryMock.mockResolvedValue({ rows: [{ max_id: "4242", n: "1516" }] });
    expect(await corpusVersion()).toBe("4242:1516");
    expect(String(h.queryMock.mock.calls[0][0])).toContain("FROM claims");
  });
});

describe("cacheLookup / cacheStore", () => {
  const RESULT = { answer: "A [c1].", state: "answered", citedClaimIds: [1], provider: "openai:gpt-5", evidenceCount: 1, terms: [], relatedClaimIds: [], window: null, totalMatching: 1, sampled: false, retrievalMode: "v2", runId: "orig-run", replayed: undefined } as unknown as AskAnswerV2;
  const SNAPSHOT = { version: 1, candidates: [], selectedClaimIds: [], retrievalMode: "v2", window: null, totalMatching: 1, candidatesCount: 1, corpusCurrentThrough: null } as unknown as EvidenceSnapshot;

  it("lookup returns the stored entry and bumps hit accounting in one statement", async () => {
    h.queryMock.mockResolvedValue({
      rows: [{ result: RESULT, snapshot: SNAPSHOT, created_at: "2026-07-20" }],
    });
    const hit = await cacheLookup("u@example.com", "k1");
    expect(hit?.result.answer).toBe("A [c1].");
    const sql = String(h.queryMock.mock.calls[0][0]);
    expect(sql).toContain("hit_count = hit_count + 1");
    expect(h.queryMock.mock.calls[0][1]).toEqual(["u@example.com", "k1"]);
  });

  it("lookup fails SOFT to a miss on a DB error", async () => {
    h.queryMock.mockRejectedValue(new Error("db down"));
    expect(await cacheLookup("u@example.com", "k1")).toBeNull();
  });

  it("store strips per-gesture fields (runId/replayed/cacheStatus) and upserts on the per-user key", async () => {
    await cacheStore({
      userEmail: "u@example.com",
      key: "k1",
      corpusVersion: "100:50",
      question: "q",
      result: { ...RESULT, cacheStatus: "exact" } as AskAnswerV2,
      snapshot: SNAPSHOT,
    });
    const sql = String(h.queryMock.mock.calls[0][0]);
    expect(sql).toContain("ON CONFLICT (user_email, cache_key)");
    const storedResult = JSON.parse(h.queryMock.mock.calls[0][1][4] as string);
    expect(storedResult.runId).toBeUndefined();
    expect(storedResult.replayed).toBeUndefined();
    expect(storedResult.cacheStatus).toBeUndefined();
    expect(storedResult.answer).toBe("A [c1].");
    // Gate 4: the lazy retention sweep runs with the store (orphaned rows die)
    const sweep = h.queryMock.mock.calls.find((c) => String(c[0]).includes("DELETE FROM ask_answer_cache"));
    expect(String(sweep?.[0] ?? "")).toContain("interval '7 days'");
  });

  it("store fails SOFT (the answer was already returned)", async () => {
    h.queryMock.mockRejectedValue(new Error("db down"));
    await expect(
      cacheStore({ userEmail: "u", key: "k", corpusVersion: "1:1", question: "q", result: RESULT, snapshot: SNAPSHOT }),
    ).resolves.toBeUndefined();
  });
});
