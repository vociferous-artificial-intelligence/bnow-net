import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- hoisted mocks (factories run before module-level consts) -----------------
const { queryMock, endMock, embedTextsMock, guardInitMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(),
  embedTextsMock: vi.fn(),
  guardInitMock: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = queryMock;
    end = endMock;
  },
}));

vi.mock("../embeddings/client", () => ({
  embedTexts: embedTextsMock,
  embedModel: () => "text-embedding-3-small",
}));

vi.mock("../embeddings/guard", () => ({
  embedGuardFromEnv: () => ({ init: guardInitMock }),
}));

import { retrieveV2 } from "./retrieve-v2";

const NOW = new Date(Date.UTC(2026, 6, 11, 12)); // 2026-07-11

// --- row factories ------------------------------------------------------------
type Row = Record<string, unknown>;
function vrow(id: number, o: Row = {}): Row {
  return { id, text: `claim ${id}`, hedging: "unknown", d: "2026-07-11", iso2: "ru", track: "military", confidence: null, vector_score: 0.5, ...o };
}
function lrow(id: number, o: Row = {}): Row {
  return { id, text: `claim ${id}`, hedging: "unknown", d: "2026-07-11", iso2: "ru", track: "military", confidence: null, rank: 0.1, ...o };
}

// Dispatch pool.query by SQL shape so the mock is order-independent.
function setupPool(opts: { vector?: Row[]; lexCount?: number; lexical?: Row[]; entities?: Row[]; entityList?: Row[] } = {}) {
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("ce.embedding <=>")) return { rows: opts.vector ?? [] };
    if (sql.includes("count(*)")) return { rows: [{ n: opts.lexCount ?? 0 }] };
    if (sql.includes("ORDER BY rank")) return { rows: opts.lexical ?? [] };
    if (sql.includes("ORDER BY pressure")) return { rows: opts.entityList ?? [] };
    if (sql.includes("ce.claim_id, e.name")) return { rows: opts.entities ?? [] };
    return { rows: [] };
  });
}

/** First pool.query call whose SQL contains `needle` (else undefined). */
function callWith(needle: string): unknown[] | undefined {
  return queryMock.mock.calls.find((c) => typeof c[0] === "string" && (c[0] as string).includes(needle));
}

const ENV_KEYS = ["OPENAI_API_KEY", "ANALYSIS_PROVIDER", "LLM_DISABLE", "ASK_CANDIDATES", "DATABASE_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  vi.clearAllMocks();
  endMock.mockResolvedValue(undefined);
  guardInitMock.mockResolvedValue(undefined);
  process.env.DATABASE_URL = "postgres://mock";
  // default: vector arm ON with a real (non-stub) embed result
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.ANALYSIS_PROVIDER;
  delete process.env.LLM_DISABLE;
  delete process.env.ASK_CANDIDATES;
  embedTextsMock.mockResolvedValue({ vectors: [[0.1, 0.2, 0.3]], tokens: 7, costUsd: 0.0009, provider: "openai:text-embedding-3-small" });
  setupPool();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("retrieveV2 — hybrid union + window", () => {
  it("merges a claim hit by BOTH arms, applies the window to every SQL arm, sets embedUsage", async () => {
    setupPool({
      vector: [vrow(1, { vector_score: 0.9, d: "2026-07-01" })],
      lexCount: 5,
      lexical: [lrow(1, { rank: 0.5, d: "2026-07-01" }), lrow(2, { rank: 0.4, d: "2026-06-20" })],
    });

    const r = await retrieveV2("sanctions since 2026-03-15", { now: NOW });

    expect(r.window).toEqual({ from: "2026-03-15", to: "2026-07-11", matchedPhrase: "since 2026-03-15" });
    expect(r.mode).toBe("v2");
    expect(r.embedUsage).toEqual({ promptTokens: 7, completionTokens: 0, costUsd: 0.0009 });
    expect(r.terms).toEqual(["sanctions"]); // temporal phrase excluded

    const c1 = r.claims.find((c) => c.claimId === 1)!;
    const c2 = r.claims.find((c) => c.claimId === 2)!;
    expect(c1.vectorScore).toBe(0.9);
    expect(c1.lexicalHit).toBe(true); // in both arms
    expect(c2.vectorScore).toBeNull();
    expect(c2.lexicalHit).toBe(true);

    // union size 2 but lexicalMatchCount 5 -> totalMatching = 5 (D9 disclosure)
    expect(r.totalMatching).toBe(5);

    // window bounds threaded into the vector arm AND the lexical arm params
    const vec = callWith("ce.embedding <=>")!;
    expect(vec[1]).toEqual(["[0.1,0.2,0.3]", "text-embedding-3-small", "2026-03-15", "2026-07-11", 150]);
    const page = callWith("ORDER BY rank")![1] as unknown[];
    expect(page).toContain("2026-03-15");
    expect(page).toContain("2026-07-11");

    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("no window -> no claim_date bounds in the SQL and window is null", async () => {
    setupPool({ vector: [vrow(1)], lexCount: 1, lexical: [lrow(1)] });
    const r = await retrieveV2("sanctions oil exports", { now: NOW });

    expect(r.window).toBeNull();
    const vecSql = queryMock.mock.calls.find((c) => (c[0] as string).includes("ce.embedding <=>"))![0] as string;
    expect(vecSql).not.toContain("claim_date >=");
    const vecParams = callWith("ce.embedding <=>")![1] as unknown[];
    // only [vector, model, limit] — no date bounds
    expect(vecParams).toEqual(["[0.1,0.2,0.3]", "text-embedding-3-small", 150]);
  });
});

describe("retrieveV2 — composite ordering, cap, totalMatching", () => {
  it("orders by compositeScore DESC and enforces ASK_CANDIDATES cap", async () => {
    process.env.ASK_CANDIDATES = "2";
    setupPool({
      vector: [
        vrow(1, { vector_score: 0.3 }),
        vrow(2, { vector_score: 0.9 }),
        vrow(3, { vector_score: 0.6 }),
      ],
    });
    const r = await retrieveV2("oil sanctions", { now: NOW });
    expect(r.claims.map((c) => c.claimId)).toEqual([2, 3]); // 0.9, 0.6 win; 0.3 capped out
    expect(r.claims).toHaveLength(2);
    // compositeScore monotonic non-increasing
    expect(r.claims[0].compositeScore).toBeGreaterThanOrEqual(r.claims[1].compositeScore);
  });

  it("totalMatching = union size when the union exceeds the lexical count", async () => {
    setupPool({ vector: [vrow(1), vrow(2), vrow(3)], lexCount: 1, lexical: [lrow(4)] });
    const r = await retrieveV2("oil sanctions", { now: NOW });
    expect(r.claims).toHaveLength(4); // union of {1,2,3} and {4}
    expect(r.totalMatching).toBe(4);
  });
});

describe("retrieveV2 — vector arm disabled -> v2-lexical-only, no embed call", () => {
  it.each([
    ["no OPENAI_API_KEY", () => delete process.env.OPENAI_API_KEY],
    ["ANALYSIS_PROVIDER=stub", () => (process.env.ANALYSIS_PROVIDER = "stub")],
    ["LLM_DISABLE=1", () => (process.env.LLM_DISABLE = "1")],
  ])("%s: skips the arm entirely (embedTexts NOT called)", async (_label, apply) => {
    apply();
    setupPool({ lexCount: 3, lexical: [lrow(9, { confidence: 0.8 })] });
    const r = await retrieveV2("oil sanctions", { now: NOW });

    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(callWith("ce.embedding <=>")).toBeUndefined(); // vector SQL never issued
    expect(r.mode).toBe("v2-lexical-only");
    expect(r.embedUsage).toBeUndefined();
    expect(r.claims.map((c) => c.claimId)).toEqual([9]);
    // lexical-only mode: semantic is 1, so score = recency(1) * reliability(0.9)
    expect(r.claims[0].compositeScore).toBeCloseTo(0.9, 10);
  });

  it("embed FAILURE degrades gracefully (embedTexts called, then lexical-only)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    embedTextsMock.mockRejectedValueOnce(new Error("budget refused"));
    setupPool({ lexCount: 2, lexical: [lrow(5)] });

    const r = await retrieveV2("oil sanctions", { now: NOW });

    expect(embedTextsMock).toHaveBeenCalledTimes(1);
    expect(r.mode).toBe("v2-lexical-only");
    expect(r.embedUsage).toBeUndefined();
    expect(r.claims.map((c) => c.claimId)).toEqual([5]); // lexical evidence still returned
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("embedTexts returning provider 'stub' is treated as no vector arm", async () => {
    embedTextsMock.mockResolvedValueOnce({ vectors: [[0.1]], tokens: 0, costUsd: 0, provider: "stub" });
    setupPool({ lexCount: 1, lexical: [lrow(6)] });
    const r = await retrieveV2("oil sanctions", { now: NOW });
    expect(callWith("ce.embedding <=>")).toBeUndefined();
    expect(r.mode).toBe("v2-lexical-only");
    expect(r.embedUsage).toBeUndefined();
  });

  it("real embed but ZERO vector rows (no embeddings for the model) -> v2-lexical-only, embedUsage still set", async () => {
    setupPool({ vector: [], lexCount: 1, lexical: [lrow(7)] });
    const r = await retrieveV2("oil sanctions", { now: NOW });
    expect(embedTextsMock).toHaveBeenCalledTimes(1);
    expect(r.mode).toBe("v2-lexical-only");
    expect(r.embedUsage).toEqual({ promptTokens: 7, completionTokens: 0, costUsd: 0.0009 });
    expect(r.claims.map((c) => c.claimId)).toEqual([7]);
  });
});

describe("retrieveV2 — term extraction and lexical-arm predicates", () => {
  it("temporal words never become search terms", async () => {
    delete process.env.OPENAI_API_KEY; // lexical-only, simpler
    setupPool({ lexCount: 0, lexical: [] });
    const r = await retrieveV2("prosecutions in the past 7 days", { now: NOW });
    expect(r.window?.matchedPhrase).toBe("past 7 days");
    expect(r.terms).toEqual(["prosecutions"]);
    expect(r.terms).not.toContain("past");
    expect(r.terms).not.toContain("days");
    // the tsquery input is the question MINUS the window phrase
    const page = callWith("ORDER BY rank")![1] as unknown[];
    expect(page).toContain("prosecutions in the");
    expect(page.join(" ")).not.toContain("past 7 days");
  });

  it("empty terms but a non-empty question still runs the lexical arm via tsquery ONLY", async () => {
    delete process.env.OPENAI_API_KEY;
    setupPool({ lexCount: 0, lexical: [] });
    const r = await retrieveV2("what are the", { now: NOW }); // all stopwords -> terms []
    expect(r.terms).toEqual([]);
    const pageSql = queryMock.mock.calls.find((c) => (c[0] as string).includes("ORDER BY rank"))![0] as string;
    expect(pageSql).toContain("websearch_to_tsquery");
    expect(pageSql).not.toContain("ILIKE ANY"); // no term patterns -> no ILIKE clause
    expect(callWith("ORDER BY pressure")).toBeUndefined(); // no terms -> no entity list
    expect(r.entities).toEqual([]);
  });

  it("whole question consumed by the window (no terms, no tsquery) -> empty, no SQL at all", async () => {
    delete process.env.OPENAI_API_KEY;
    setupPool();
    const r = await retrieveV2("yesterday", { now: NOW });
    expect(r.window).toMatchObject({ from: "2026-07-10", to: "2026-07-10" });
    expect(r.terms).toEqual([]);
    expect(r.claims).toEqual([]);
    expect(r.entities).toEqual([]);
    expect(r.totalMatching).toBe(0);
    expect(r.mode).toBe("v2-lexical-only");
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled(); // legacy-consistent: nothing to query
    expect(endMock).toHaveBeenCalledTimes(1); // pool still closed
  });

  it("attaches entities per claim and returns the entity list", async () => {
    delete process.env.OPENAI_API_KEY;
    setupPool({
      lexCount: 1,
      lexical: [lrow(1)],
      entities: [{ claim_id: 1, name: "FSB" }, { claim_id: 1, name: "Shoigu" }],
      entityList: [{ id: 42, name: "Shoigu", kind: "person", sanctioned: true, pressure: 4 }],
    });
    const r = await retrieveV2("shoigu sanctions", { now: NOW });
    expect(r.claims[0].entities).toEqual(["FSB", "Shoigu"]);
    expect(r.entities).toEqual([{ entityId: 42, name: "Shoigu", kind: "person", pressure: 4, sanctioned: true }]);
  });
});

// ---- Phase 0 stage timings (2026-07-19) ------------------------------------------

describe("retrieveV2 — stage timings", () => {
  it("full v2 run records embed/vector/lexical/entity/merge keys (all non-negative ints)", async () => {
    setupPool({
      vector: [vrow(1, { vector_score: 0.9 })],
      lexCount: 2,
      lexical: [lrow(1), lrow(2)],
      entities: [{ claim_id: 1, name: "OFAC" }],
      entityList: [{ id: 9, name: "OFAC", kind: "org", sanctioned: null, pressure: 3 }],
    });
    const timings: Record<string, number> = {};
    const r = await retrieveV2("sanctions oil exports", { now: NOW, timings });

    expect(r.mode).toBe("v2");
    for (const key of ["embedMs", "vectorMs", "lexicalMs", "entityMs", "mergeMs"] as const) {
      expect(timings[key], key).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(timings[key]), `${key} integer`).toBe(true);
    }
  });

  it("vector arm disabled -> no embedMs/vectorMs; lexical+merge still recorded", async () => {
    process.env.LLM_DISABLE = "1";
    setupPool({ lexCount: 1, lexical: [lrow(1)] });
    const timings: Record<string, number> = {};
    const r = await retrieveV2("sanctions", { now: NOW, timings });

    expect(r.mode).toBe("v2-lexical-only");
    expect(timings.embedMs).toBeUndefined();
    expect(timings.vectorMs).toBeUndefined();
    expect(timings.lexicalMs).toBeGreaterThanOrEqual(0);
    expect(timings.mergeMs).toBeGreaterThanOrEqual(0);
  });

  it("without a collector the result is unchanged (passthrough, no throw)", async () => {
    setupPool({ vector: [vrow(1)], lexCount: 1, lexical: [lrow(1)] });
    const r = await retrieveV2("sanctions", { now: NOW });
    expect(r.claims.length).toBeGreaterThan(0);
  });
});

// ---- Phase 2: concurrent arms + lexical partial ---------------------------------

describe("retrieveV2 — concurrent arms (Phase 2)", () => {
  it("onLexicalPartial fires with the lexical rows BEFORE a slow vector arm settles; final result identical to the fast case", async () => {
    setupPool({
      vector: [vrow(1, { vector_score: 0.9 })],
      lexCount: 2,
      lexical: [lrow(1), lrow(2)],
    });
    // slow embed: the vector arm settles ~40ms after the lexical arm
    embedTextsMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ vectors: [[0.1, 0.2, 0.3]], tokens: 7, costUsd: 0.0009, provider: "openai:text-embedding-3-small" }),
            40,
          ),
        ),
    );

    const seen: Array<{ ids: number[]; totalMatching: number; atMs: number }> = [];
    const t0 = performance.now();
    const r = await retrieveV2("sanctions oil exports", {
      now: NOW,
      onLexicalPartial: (p) => {
        seen.push({
          ids: p.claims.map((c) => c.claimId),
          totalMatching: p.totalMatching,
          atMs: performance.now() - t0,
        });
      },
    });
    const totalMs = performance.now() - t0;

    expect(seen).toHaveLength(1);
    expect(seen[0].ids).toEqual([1, 2]);
    expect(seen[0].totalMatching).toBe(2);
    expect(seen[0].atMs).toBeLessThan(totalMs); // partial arrived before completion
    // determinism: the slow-vector union equals the fast case's shape
    const c1 = r.claims.find((c) => c.claimId === 1)!;
    expect(c1.vectorScore).toBe(0.9);
    expect(c1.lexicalHit).toBe(true);
    expect(r.mode).toBe("v2");
    expect(r.totalMatching).toBe(2);
  });

  it("a throwing onLexicalPartial never fails retrieval", async () => {
    setupPool({ vector: [vrow(1)], lexCount: 1, lexical: [lrow(1)] });
    const r = await retrieveV2("sanctions", {
      now: NOW,
      onLexicalPartial: () => {
        throw new Error("progress display exploded");
      },
    });
    expect(r.claims.length).toBeGreaterThan(0);
  });

  it("retrieveV2 awaits the async partial's settlement before returning (seq-order commit — supplementary Gate 2)", async () => {
    setupPool({ vector: [vrow(1)], lexCount: 1, lexical: [lrow(1)] });
    let partialSettled = false;
    const r = await retrieveV2("sanctions", {
      now: NOW,
      onLexicalPartial: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            partialSettled = true;
            resolve();
          }, 30),
        ),
    });
    // the slow persist finished BEFORE retrieveV2 resolved — the next sink
    // emit (retrieval.completed) can never commit ahead of the partial
    expect(partialSettled).toBe(true);
    expect(r.claims.length).toBeGreaterThan(0);
  });

  it("a REJECTING async partial is swallowed and still awaited (no unhandled rejection, no retrieval failure)", async () => {
    setupPool({ vector: [vrow(1)], lexCount: 1, lexical: [lrow(1)] });
    const r = await retrieveV2("sanctions", {
      now: NOW,
      onLexicalPartial: () => Promise.reject(new Error("persist failed")),
    });
    expect(r.claims.length).toBeGreaterThan(0);
  });

  it("a vector-arm failure still degrades to lexical-only under concurrency", async () => {
    setupPool({ lexCount: 1, lexical: [lrow(1)] });
    embedTextsMock.mockRejectedValue(new Error("embed exploded"));
    const r = await retrieveV2("sanctions", { now: NOW });
    expect(r.mode).toBe("v2-lexical-only");
    expect(r.claims.map((c) => c.claimId)).toEqual([1]);
  });
});
