import type { Pool } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";
import { lexicalClaimSearch, stripWindowPhrase, windowClause } from "./lexical";

// Money-adjacent test: lexical.ts is the $0 deterministic retrieval arm shared by
// retrieveV2 and /search. It must issue SELECT-only SQL, never construct a guard,
// never call a provider. The pool here is a bare fake object (no real driver, no
// module mock needed) — proof the module has no hidden provider/guard dependency
// to mock around.

type Row = Record<string, unknown>;

/** Fake pool: a bare { query } object, cast to Pool since lexicalClaimSearch only
 *  ever calls .query on it — no real driver, no @neondatabase/serverless mock. */
function fakePool(opts: { count?: number; page?: Row[] } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    // lexicalClaimSearch reuses ONE params array across the count and page
    // queries (pushing the limit only before the second) — snapshot a copy at
    // call time so later mutation doesn't retroactively change earlier calls.
    calls.push({ sql, params: [...params] });
    if (sql.includes("count(*)")) return { rows: [{ n: opts.count ?? 0 }] };
    return { rows: opts.page ?? [] };
  });
  const pool = { query } as unknown as Pool;
  return { pool, query, calls };
}

const NO_WINDOW = null;

describe("lexicalClaimSearch — no predicate at all", () => {
  it("empty stripped question AND no terms -> no SQL issued, zeroed result", async () => {
    const { pool, query } = fakePool();
    const r = await lexicalClaimSearch(pool, {
      qStripped: "",
      terms: [],
      window: NO_WINDOW,
      limit: 50,
    });
    expect(r).toEqual({ rows: [], matchCount: 0 });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("lexicalClaimSearch — only SELECT statements, expected shape", () => {
  it("issues exactly two queries, both SELECT, count then ranked page", async () => {
    const { pool, calls } = fakePool({ count: 7, page: [{ id: 1 }] });
    await lexicalClaimSearch(pool, {
      qStripped: "oil sanctions",
      terms: ["oil", "sanctions"],
      window: NO_WINDOW,
      limit: 50,
    });

    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.sql.trim().toUpperCase().startsWith("SELECT")).toBe(true);
    }
  });

  it("tsquery + ILIKE + entity-name subquery all present, OR'd, count query runs first", async () => {
    const { pool, calls } = fakePool({ count: 3, page: [] });
    await lexicalClaimSearch(pool, {
      qStripped: "oil sanctions",
      terms: ["oil", "sanctions"],
      window: NO_WINDOW,
      limit: 25,
    });

    const [countCall, pageCall] = calls;
    expect(countCall.sql).toContain("count(*)::int AS n");
    expect(countCall.sql).toContain("websearch_to_tsquery('english', $1)");
    expect(countCall.sql).toContain("cl.text ILIKE ANY($2)");
    expect(countCall.sql).toContain(
      "cl.id IN (SELECT ce2.claim_id FROM claim_entities ce2 JOIN entities e ON e.id = ce2.entity_id WHERE e.name ILIKE ANY($2))",
    );
    expect(countCall.params).toEqual(["oil sanctions", ["%oil%", "%sanctions%"]]);

    expect(pageCall.sql).toContain("ts_rank(to_tsvector('english', cl.text)");
    expect(pageCall.sql).toContain("ORDER BY rank DESC, cl.claim_date DESC NULLS LAST, cl.id DESC");
    expect(pageCall.sql).toContain(`LIMIT $${pageCall.params.length}`);
    expect(pageCall.params).toEqual(["oil sanctions", ["%oil%", "%sanctions%"], 25]);
  });

  it("terms-only (empty stripped question): no tsquery clause, no ILIKE-less entity gap", async () => {
    const { pool, calls } = fakePool({ count: 1, page: [] });
    await lexicalClaimSearch(pool, {
      qStripped: "",
      terms: ["shoigu"],
      window: NO_WINDOW,
      limit: 10,
    });
    const [countCall] = calls;
    expect(countCall.sql).not.toContain("websearch_to_tsquery");
    expect(countCall.sql).toContain("cl.text ILIKE ANY($1)");
    expect(countCall.params).toEqual([["%shoigu%"]]);
  });

  it("tsquery-only (no terms): no ILIKE clause, rank comes from ts_rank", async () => {
    const { pool, calls } = fakePool({ count: 0, page: [] });
    await lexicalClaimSearch(pool, {
      qStripped: "what are the",
      terms: [],
      window: NO_WINDOW,
      limit: 10,
    });
    const [countCall, pageCall] = calls;
    expect(countCall.sql).not.toContain("ILIKE ANY");
    expect(pageCall.sql).toContain("websearch_to_tsquery");
  });

  it("window bounds appended to BOTH queries, params shared/pushed once per query", async () => {
    const { pool, calls } = fakePool({ count: 2, page: [] });
    const window = { from: "2026-07-01", to: "2026-07-10", matchedPhrase: "since july 1" };
    await lexicalClaimSearch(pool, {
      qStripped: "strikes",
      terms: ["strikes"],
      window,
      limit: 50,
    });
    const [countCall, pageCall] = calls;
    expect(countCall.sql).toContain("cl.claim_date >= $3 AND cl.claim_date <= $4");
    expect(countCall.params).toEqual(["strikes", ["%strikes%"], "2026-07-01", "2026-07-10"]);
    expect(pageCall.params).toEqual(["strikes", ["%strikes%"], "2026-07-01", "2026-07-10", 50]);
  });
});

describe("lexicalClaimSearch — results and totalMatching round-trip", () => {
  it("returns the page rows and the uncapped count untouched", async () => {
    const pageRows = [
      { id: 5, text: "claim 5", hedging: "assessed", d: "2026-07-10", iso2: "ua", track: "military", confidence: 0.7, rank: 0.4 },
      { id: 3, text: "claim 3", hedging: "unknown", d: null, iso2: "ru", track: null, confidence: null, rank: 0.1 },
    ];
    const { pool } = fakePool({ count: 42, page: pageRows });
    const r = await lexicalClaimSearch(pool, {
      qStripped: "drone strikes",
      terms: ["drone", "strikes"],
      window: NO_WINDOW,
      limit: 50,
    });
    expect(r.matchCount).toBe(42);
    expect(r.rows).toEqual(pageRows);
  });

  it("missing count row -> matchCount defaults to 0", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("count(*)")) return { rows: [] };
      return { rows: [] };
    });
    const r = await lexicalClaimSearch({ query } as never, {
      qStripped: "x",
      terms: [],
      window: NO_WINDOW,
      limit: 5,
    });
    expect(r.matchCount).toBe(0);
  });
});

describe("windowClause", () => {
  it("null window -> empty fragment, no params pushed", () => {
    const params: unknown[] = [];
    expect(windowClause(null, params)).toBe("");
    expect(params).toEqual([]);
  });

  it("both bounds -> AND'd fragment, params appended in order", () => {
    const params: unknown[] = ["seed"];
    const clause = windowClause({ from: "2026-01-01", to: "2026-01-31", matchedPhrase: "x" }, params);
    expect(clause).toBe(" AND cl.claim_date >= $2 AND cl.claim_date <= $3");
    expect(params).toEqual(["seed", "2026-01-01", "2026-01-31"]);
  });

  it("from-only -> single bound", () => {
    const params: unknown[] = [];
    const clause = windowClause({ from: "2026-01-01", matchedPhrase: "x" }, params);
    expect(clause).toBe(" AND cl.claim_date >= $1");
    expect(params).toEqual(["2026-01-01"]);
  });
});

describe("stripWindowPhrase", () => {
  it("null window -> question unchanged", () => {
    expect(stripWindowPhrase("kharkiv strikes", null)).toBe("kharkiv strikes");
  });

  it("strips the matched phrase once, case-insensitively, collapses whitespace", () => {
    const window = { from: "2026-07-01", to: "2026-07-10", matchedPhrase: "PAST 7 DAYS" };
    expect(stripWindowPhrase("strikes in the past 7 days please", window)).toBe("strikes in the please");
  });
});
