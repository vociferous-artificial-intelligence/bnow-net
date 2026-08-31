import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapLeaseDriver } from "./map-lease";

// ---------------------------------------------------------------------------
// Flood bounds for the steady map selection + dedup reference window
// (2026-08-31 incident: a 447-doc MTProto catch-up dated back eight weeks made
// the hourly selection span 58 days; the [min-1, max+1] reference BETWEEN then
// materialized 419K rows and the instance was OOM-killed after lease
// acquisition, every hour, because nothing was ever dispositioned).
//
// Everything here runs against an in-memory Pool — no database, no network,
// no paid call. Most tests drive runMapCycle in dryRun mode (selection + gate
// only, structurally zero writes); the write-refusal test drives a real cycle
// with an injected lease driver and asserts on the captured SQL.
// ---------------------------------------------------------------------------

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

type Q = { sql: string; params: unknown[] };

const h = vi.hoisted(() => ({
  queries: [] as Q[],
  rowsFor: ((): unknown[] => []) as (sql: string, params: unknown[]) => unknown[],
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class FakePool {
    async query(sql: string, params: unknown[] = []) {
      h.queries.push({ sql, params });
      return { rows: h.rowsFor(sql, params) };
    }
    async connect() {
      return {
        query: async (sql: string, params: unknown[] = []) => {
          h.queries.push({ sql, params });
          return { rows: h.rowsFor(sql, params) };
        },
        release: () => {},
      };
    }
    async end() {}
  },
}));

const {
  MAP_FRESH_WINDOW_DAYS,
  MAP_REF_ROW_CAP,
  MAP_STEADY_SPAN_DAYS,
  dedupRefDays,
  runMapCycle,
  shiftDay,
} = await import("./map-worker");

const isProbe = (sql: string) => /SELECT DISTINCT/.test(sql);
const isCutoff = (sql: string) => /now\(\) at time zone 'utc'/.test(sql);
const isCandidate = (sql: string) => /canonical_url AS source_key/.test(sql);
const isFreshSelect = (sql: string) => isCandidate(sql) && />= \$5::date/.test(sql);
const isOldSelect = (sql: string) => isCandidate(sql) && /= ANY\(\$5::date\[\]\)/.test(sql);
const isPlainSelect = (sql: string) => isCandidate(sql) && !/\$5/.test(sql);
const isRefCount = (sql: string) => /count\(\*\)::int AS n/.test(sql);
const isRefFetch = (sql: string) => /AS text2k/.test(sql) && /rd\.processed = true/.test(sql);
const isWrite = (sql: string) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim());

/** raw_documents row as the candidate/reference SELECTs return it. Content
 *  passes the ru military lexicon so track applicability yields work. */
const doc = (id: number, day: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  title: "Front line report",
  content: `Shelling reported near the front line overnight, item ${id}, no casualties given.`,
  adapter: "rss",
  theater: "ru",
  day,
  source_key: "example.test/feed",
  reliability: 0.5,
  content_md5: `md5-${id}`,
  text2k: `Front line report Shelling reported near the front line overnight, item ${id}`,
  ...over,
});

/** Reference row shape as the ref fetch returns it (contentMd5 aliased to the
 *  DedupDoc field name — the pinned repair of the dead exact arm). */
const ref = (id: number, day: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  theater: "ru",
  day,
  contentMd5: `md5-${id}`,
  text2k: `Front line report Shelling reported near the front line overnight, item ${id}`,
  ...over,
});

function leaseDriver(): MapLeaseDriver {
  return {
    async read() {
      return null;
    },
    async tryAcquire(owner, token) {
      return {
        fence: 1,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        owner,
        token,
      } as never;
    },
    async renew() {
      return true;
    },
    async release() {
      return true;
    },
  };
}

beforeEach(() => {
  h.queries.length = 0;
  h.rowsFor = () => [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("shiftDay + dedupRefDays (pure day math)", () => {
  it("shiftDay moves across month and year boundaries in UTC", () => {
    expect(shiftDay("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-08-15", 0)).toBe("2026-08-15");
  });

  it("contiguous candidate days yield exactly the historical BETWEEN window", () => {
    expect(dedupRefDays(["2026-08-10", "2026-08-11"])).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("sparse candidate days exclude never-matchable interior days", () => {
    const days = dedupRefDays(["2026-07-05", "2026-08-29"]);
    expect(days).toEqual([
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    // the old BETWEEN would have spanned the whole 07-04..08-30 range
    expect(days).not.toContain("2026-08-01");
  });

  it("a 1-day gap keeps the bridge day (still ±1-matchable from both sides)", () => {
    expect(dedupRefDays(["2026-08-10", "2026-08-12"])).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });
});

describe("ordinary path — span within MAP_STEADY_SPAN_DAYS is byte-compatible", () => {
  it("runs ONE plain candidate query (no $5 narrowing, no floodGuard) and an IN-list ref fetch", async () => {
    h.rowsFor = (sql) => {
      if (isProbe(sql)) return [{ day: "2026-08-30" }, { day: "2026-08-31" }];
      if (isPlainSelect(sql)) return [doc(1, "2026-08-30"), doc(2, "2026-08-31")];
      if (isRefCount(sql)) return [{ n: 2 }];
      if (isRefFetch(sql)) return [];
      return [];
    };
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    expect(counts.selected).toBe(2);
    expect(counts.floodGuard).toBeUndefined();
    expect(h.queries.filter((q) => isFreshSelect(q.sql) || isOldSelect(q.sql))).toHaveLength(0);
    const plain = h.queries.filter((q) => isPlainSelect(q.sql));
    expect(plain).toHaveLength(1);
    // the historical selection, verbatim: same predicates, oldest-first, LIMIT $4
    expect(plain[0].sql).toContain("WHERE rd.processed = false");
    expect(plain[0].sql).toContain("ORDER BY COALESCE(rd.published_at, rd.fetched_at) ASC, rd.id ASC");
    expect(plain[0].params[3]).toBe(500);
    // ref fetch is the exact ±1-day set of the two contiguous candidate days
    const refFetch = h.queries.find((q) => isRefFetch(q.sql))!;
    expect(refFetch.params[1]).toEqual(["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"]);
  });

  it("date-scoped backfill mode stays single-query (probe returns one day)", async () => {
    h.rowsFor = (sql) => {
      if (isProbe(sql)) return [{ day: "2026-07-08" }];
      if (isPlainSelect(sql)) return [doc(9, "2026-07-08")];
      if (isRefCount(sql)) return [{ n: 0 }];
      return [];
    };
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"], date: "2026-07-08" });
    expect(counts.selected).toBe(1);
    expect(counts.floodGuard).toBeUndefined();
    const refFetch = h.queries.find((q) => isRefFetch(q.sql))!;
    expect(refFetch.params[1]).toEqual(["2026-07-07", "2026-07-08", "2026-07-09"]);
  });
});

describe("flood path — old/fresh split with bounded reference window", () => {
  /** Probe shows 4+ distinct days (flood); DB cutoff day is 2026-08-30. */
  const floodResponder =
    (over: (sql: string, params: unknown[]) => unknown[] | null) =>
    (sql: string, params: unknown[]) => {
      const o = over(sql, params);
      if (o !== null) return o;
      if (isProbe(sql))
        return [
          { day: "2026-07-05" },
          { day: "2026-07-09" },
          { day: "2026-08-12" },
          { day: "2026-08-30" },
        ];
      if (isCutoff(sql)) return [{ d: "2026-08-30" }];
      if (isRefCount(sql)) return [{ n: 0 }];
      return [];
    };

  it("selects fresh first (ceil(cap/2)), old takes the remainder, ordering old-first", async () => {
    h.rowsFor = floodResponder((sql, params) => {
      if (isFreshSelect(sql)) {
        expect(params[3]).toBe(250); // ceil(500/2)
        expect(params[4]).toBe("2026-08-30"); // DB-clock cutoff
        return [doc(100, "2026-08-30"), doc(101, "2026-08-31")];
      }
      if (isOldSelect(sql)) {
        expect(params[3]).toBe(498); // docCap - freshSelected
        // OLDEST span-cap days, all strictly before the fresh cutoff
        expect(params[4]).toEqual(["2026-07-05", "2026-07-09", "2026-08-12"]);
        return [doc(1, "2026-07-05"), doc(2, "2026-07-09"), doc(3, "2026-08-12")];
      }
      return null;
    });
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    expect(counts.selected).toBe(5);
    expect(counts.floodGuard).toEqual({ oldDays: 3, selectedOld: 3, selectedFresh: 2 });
    // reference days: exact ±1 of each candidate day — NOT the 57-day BETWEEN
    const refFetch = h.queries.find((q) => isRefFetch(q.sql))!;
    const days = refFetch.params[1] as string[];
    expect(days).toEqual(
      [
        ...["2026-07-04", "2026-07-05", "2026-07-06"],
        ...["2026-07-08", "2026-07-09", "2026-07-10"],
        ...["2026-08-11", "2026-08-12", "2026-08-13"],
        ...["2026-08-29", "2026-08-30", "2026-08-31"],
        "2026-09-01",
      ].sort(),
    );
    expect(days.length).toBeLessThanOrEqual(3 * (MAP_STEADY_SPAN_DAYS + MAP_FRESH_WINDOW_DAYS));
    expect(days).not.toContain("2026-08-01"); // interior of the old span, unmatchable
  });

  it("candidate-to-candidate near-dupes across the old/fresh partition still collapse (adjacent days, one gate)", async () => {
    const shared = "Front line report Shelling reported near the front line overnight, same event";
    h.rowsFor = floodResponder((sql) => {
      if (isFreshSelect(sql))
        return [
          doc(200, "2026-08-30", {
            content_md5: "md5-fresh-twin",
            text2k: shared,
            content: shared,
          }),
        ];
      if (isOldSelect(sql))
        return [
          // old candidate on the day ADJACENT to the fresh cutoff
          doc(50, "2026-08-29", { content_md5: "md5-old-twin", text2k: shared, content: shared }),
        ];
      if (isProbe(sql))
        return [
          { day: "2026-07-05" },
          { day: "2026-07-06" },
          { day: "2026-08-29" },
          { day: "2026-08-30" },
        ];
      return null;
    });
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    // the old candidate is seen first (ordering) => canonical; the fresh twin
    // one day later minhash-mirrors it across the partition boundary
    expect(counts.mirrors).toBe(1);
    expect(counts.mirrorsMinhash).toBe(1);
    expect(counts.canonical).toBe(1);
  });

  it("same-day same-md5 docs in DIFFERENT theaters never collapse", async () => {
    h.rowsFor = floodResponder((sql) => {
      if (isFreshSelect(sql))
        return [
          doc(300, "2026-08-30", { content_md5: "md5-same", theater: "ru" }),
          doc(301, "2026-08-30", { content_md5: "md5-same", theater: "ua" }),
        ];
      if (isOldSelect(sql)) return [doc(1, "2026-07-05")];
      return null;
    });
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru", "ua"] });
    expect(counts.mirrors).toBe(0);
    expect(counts.canonical).toBe(3);
  });

  it("a candidate matching a persisted REFERENCE becomes its mirror (reference precedence)", async () => {
    h.rowsFor = floodResponder((sql) => {
      if (isFreshSelect(sql)) return [doc(400, "2026-08-30", { content_md5: "md5-ref-twin" })];
      if (isOldSelect(sql)) return [doc(1, "2026-07-05")];
      if (isRefCount(sql)) return [{ n: 1 }];
      if (isRefFetch(sql)) return [ref(9000, "2026-08-31", { contentMd5: "md5-ref-twin" })];
      return null;
    });
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    expect(counts.mirrorsExact).toBe(1);
    expect(counts.refRows).toBe(1);
    // SQL-level pin of the exact-arm repair: the historical snake_case alias
    // (AS content_md5) left DedupDoc.contentMd5 undefined on every reference
    // row, silently disabling the exact arm against references. The fixture
    // rows above bypass SQL, so without this assertion an alias revert
    // survives the whole suite.
    const refFetch = h.queries.find((q) => isRefFetch(q.sql))!;
    expect(refFetch.sql).toContain('AS "contentMd5"');
  });

  it(">SPAN distinct days ALL at/after the fresh cutoff falls back to the plain bounded query", async () => {
    // future-dated stragglers: more distinct days than the span cap, none
    // older than the fresh window — the split has no old segment to protect,
    // and the reference fetch stays day-IN-list bounded regardless.
    h.rowsFor = (sql) => {
      if (isProbe(sql))
        return [
          { day: "2026-08-30" },
          { day: "2026-08-31" },
          { day: "2026-09-01" },
          { day: "2026-09-15" },
        ];
      if (isCutoff(sql)) return [{ d: "2026-08-30" }];
      if (isPlainSelect(sql)) return [doc(1, "2026-08-30")];
      if (isRefCount(sql)) return [{ n: 0 }];
      return [];
    };
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    expect(counts.floodGuard).toBeUndefined();
    expect(h.queries.filter((q) => isOldSelect(q.sql) || isFreshSelect(q.sql))).toHaveLength(0);
    expect(h.queries.filter((q) => isPlainSelect(q.sql))).toHaveLength(1);
    const refFetch = h.queries.find((q) => isRefFetch(q.sql))!;
    expect(refFetch.params[1]).toEqual(["2026-08-29", "2026-08-30", "2026-08-31"]);
  });
});

describe("reference-row hard cap — explicit refusal instead of silent OOM death", () => {
  it("dry run: throws before the reference fetch; the big set is never materialized", async () => {
    h.rowsFor = (sql) => {
      if (isProbe(sql)) return [{ day: "2026-08-31" }];
      if (isPlainSelect(sql)) return [doc(1, "2026-08-31")];
      if (isRefCount(sql)) return [{ n: MAP_REF_ROW_CAP + 1 }];
      return [];
    };
    await expect(runMapCycle({ dryRun: true, theaters: ["ru"] })).rejects.toThrow(
      /reference window overflow/,
    );
    expect(h.queries.filter((q) => isRefFetch(q.sql))).toHaveLength(0);
  });

  it("real cycle: throws with ZERO writes — nothing marked processed, no verdict fabricated", async () => {
    h.rowsFor = (sql) => {
      if (isProbe(sql)) return [{ day: "2026-08-31" }];
      if (isPlainSelect(sql)) return [doc(1, "2026-08-31")];
      if (isRefCount(sql)) return [{ n: MAP_REF_ROW_CAP + 1 }];
      return [];
    };
    await expect(
      runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() }),
    ).rejects.toThrow(/reference window overflow/);
    expect(h.queries.filter((q) => isWrite(q.sql))).toHaveLength(0);
  });

  it("exactly at the cap proceeds (the bound is a ceiling, not a shrink of the examined set)", async () => {
    h.rowsFor = (sql) => {
      if (isProbe(sql)) return [{ day: "2026-08-31" }];
      if (isPlainSelect(sql)) return [doc(1, "2026-08-31")];
      if (isRefCount(sql)) return [{ n: MAP_REF_ROW_CAP }];
      if (isRefFetch(sql)) return [];
      return [];
    };
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    expect(counts.refRows).toBe(MAP_REF_ROW_CAP);
    expect(counts.canonical).toBe(1);
  });
});

describe("progress safety — unselected backlog is untouched, not lost", () => {
  it("out-of-window docs appear in NO query result and NO write; the next run's probe re-finds them", async () => {
    // flood: only the three oldest days + fresh window are selected; days
    // 2026-07-20 .. 2026-08-11 are outside both windows this run
    h.rowsFor = (sql) => {
      if (isProbe(sql))
        return [
          { day: "2026-07-05" },
          { day: "2026-07-06" },
          { day: "2026-07-07" },
          { day: "2026-07-20" },
        ];
      if (isCutoff(sql)) return [{ d: "2026-08-30" }];
      if (isFreshSelect(sql)) return [];
      if (isOldSelect(sql)) return [doc(1, "2026-07-05"), doc(2, "2026-07-06")];
      if (isRefCount(sql)) return [{ n: 0 }];
      return [];
    };
    const counts = await runMapCycle({ dryRun: true, theaters: ["ru"] });
    // the old query was restricted to the three OLDEST days — 07-20 excluded
    const old = h.queries.find((q) => isOldSelect(q.sql))!;
    expect(old.params[4]).toEqual(["2026-07-05", "2026-07-06", "2026-07-07"]);
    expect(counts.selected).toBe(2);
    // dry run + no writes: structurally nothing to lose; the exclusion is
    // selection-only (processed=false rows remain eligible next run)
    expect(h.queries.filter((q) => isWrite(q.sql))).toHaveLength(0);
  });
});
