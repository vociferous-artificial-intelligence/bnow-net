import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  loadParsedReportById,
  refreshReportCitations,
  refreshSourceStats,
  type QueryFn,
} from "./load";
import { parseReport, type ParsedReport } from "./parse";
import { iranUpdateUrlCandidatesForDate } from "../validation/run";

const FIXTURE_URL =
  "https://understandingwar.org/research/middle-east/iran-update-special-report-july-24-2026/";
const html = readFileSync(join(process.cwd(), "fixtures/isw/iran-update-2026-07-24.html"), "utf8");

describe("parseReport on a modern Iran Update (2026-07-24 fixture)", () => {
  const parsed = parseReport(FIXTURE_URL, html);

  it("parses title, date, endnotes and citations", () => {
    expect(parsed.parseOk).toBe(true);
    expect(parsed.title).toContain("Iran Update Special Report");
    expect(parsed.reportDate).toBe("2026-07-24");
    expect(parsed.endnoteCount).toBeGreaterThan(10);
    expect(parsed.citations.length).toBeGreaterThan(parsed.endnoteCount * 0.5);
  });

  it("supports multiple URLs per endnote (shared endnoteIndex)", () => {
    const byIndex = new Map<number, number>();
    for (const c of parsed.citations) byIndex.set(c.endnoteIndex, (byIndex.get(c.endnoteIndex) ?? 0) + 1);
    expect([...byIndex.values()].some((n) => n > 1)).toBe(true);
  });

  it("citation URLs are cleaned http(s) URLs with valid hedging values", () => {
    const hedges = new Set(["confirmed", "claimed", "unverified", "assessed", "unknown"]);
    for (const c of parsed.citations) {
      expect(c.rawUrl).toMatch(/^https?:\/\//);
      expect(hedges.has(c.hedging)).toBe(true);
      if (c.hedgingCue) expect(c.hedgingCue.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("iranUpdateUrlCandidatesForDate", () => {
  it("probes every observed slug shape, most likely first", () => {
    const urls = iranUpdateUrlCandidatesForDate("2026-08-11");
    expect(urls[0]).toContain("iran-update-special-report-august-11-2026");
    expect(urls[1]).toContain("iran-update-evening-special-report-august-11-2026");
    expect(urls[2]).toContain("iran-update-morning-special-report-august-11-2026");
    expect(urls[3]).toContain("/iran-update-august-11-2026");
    expect(new Set(urls).size).toBe(urls.length);
  });
});

// -- loader over an injectable query fake -------------------------------------

interface Call {
  sql: string;
  params: unknown[];
}

/** Stateful DB fake: answers the loader's statement shapes, records every
 *  call, and PERSISTS sources/citations across loader invocations so replays
 *  hit real conflicts. `existingCitations` pre-absorbs every citation insert
 *  (dedupe index full); `failStatsRefreshOnce` makes the next
 *  source_theater_stats upsert throw — the partial-failure injection point
 *  (citations already committed, aggregates never refreshed). */
function fakeDb(opts: {
  priorStatus: string;
  existingCitations?: boolean;
  failStatsRefreshOnce?: boolean;
}) {
  const calls: Call[] = [];
  let nextSourceId = 100;
  let priorStatus = opts.priorStatus;
  let failStatsRefresh = opts.failStatsRefreshOnce ?? false;
  const sourceIds = new Map<string, number>();
  const citationKeys = new Set<string>(); // (report_id, raw_url, endnote_index)
  const statsRefreshCalls: number[][] = []; // source-id arrays passed to the stats upsert
  const query: QueryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT parse_status")) return [{ parse_status: priorStatus }];
    if (sql.startsWith("INSERT INTO sources")) {
      const created: Array<Record<string, unknown>> = [];
      for (let i = 0; i < params.length; i += 4) {
        const key = String(params[i]);
        if (!sourceIds.has(key)) {
          sourceIds.set(key, nextSourceId++);
          created.push({ id: sourceIds.get(key) });
        }
      }
      return created;
    }
    if (sql.includes("SELECT id, canonical_url FROM sources"))
      return [...sourceIds.entries()].map(([canonical_url, id]) => ({ id, canonical_url }));
    if (sql.startsWith("INSERT INTO source_citations")) {
      if (opts.existingCitations) return []; // dedupe index absorbed everything
      const out: Array<Record<string, unknown>> = [];
      for (let i = 0; i < params.length; i += 6) {
        const key = `${params[i]}|${params[i + 2]}|${params[i + 3]}`;
        if (citationKeys.has(key)) continue;
        citationKeys.add(key);
        out.push({ source_id: params[i + 1] });
      }
      return out;
    }
    if (sql.includes("SET parse_status = 'parsed'")) {
      priorStatus = "parsed";
      return [];
    }
    if (sql.includes("INSERT INTO source_theater_stats")) {
      if (failStatsRefresh) {
        failStatsRefresh = false;
        throw new Error("injected stats-refresh outage");
      }
      const ids = params[0] as number[];
      statsRefreshCalls.push([...ids]);
      return ids.map((id) => ({ source_id: id }));
    }
    return [];
  };
  return { query, calls, sourceIds, citationKeys, statsRefreshCalls };
}

const parsedFixture = parseReport(FIXTURE_URL, html);

function failedParse(): ParsedReport {
  return {
    url: FIXTURE_URL,
    title: "",
    reportDate: null,
    endnoteCount: 0,
    citations: [],
    bodyMarkerCount: 0,
    parseOk: false,
    parseNotes: ["no-endnote-block"],
  };
}

describe("loadParsedReportById", () => {
  it("loads a parsed report: sources, citations, honest status, stats refresh", async () => {
    const db = fakeDb({ priorStatus: "pending" });
    const r = await loadParsedReportById(db.query, 42, "ir", parsedFixture);
    expect(r.action).toBe("parsed");
    expect(r.citationsInserted).toBeGreaterThan(0);
    expect(r.sourcesCreated).toBeGreaterThan(0);
    expect(r.statsRefreshed).toBe(db.sourceIds.size); // every resolved source, not a subset
    // the status update targets the id — never ON CONFLICT (url)
    const statusUpdate = db.calls.find((c) => c.sql.includes("SET parse_status = 'parsed'"));
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate!.params![0]).toBe(42);
    expect(statusUpdate!.sql).not.toContain("ON CONFLICT");
    // citations dedupe on the unique triple
    const cit = db.calls.find((c) => c.sql.startsWith("INSERT INTO source_citations"));
    expect(cit!.sql).toContain("ON CONFLICT (report_id, raw_url, endnote_index) DO NOTHING");
  });

  it("replaying the same report inserts zero new citations yet still refreshes every resolved source", async () => {
    const db = fakeDb({ priorStatus: "parsed", existingCitations: true });
    const r = await loadParsedReportById(db.query, 42, "ir", parsedFixture);
    expect(r.action).toBe("parsed");
    expect(r.citationsInserted).toBe(0);
    // zero inserts must NOT skip the stats refresh: an earlier run may have
    // committed these exact citations and then died before refreshing
    // aggregates — the replay is the self-healing path
    expect(db.statsRefreshCalls).toHaveLength(1);
    const refreshed = [...db.statsRefreshCalls[0]].sort((a, b) => a - b);
    expect(refreshed).toEqual([...db.sourceIds.values()].sort((a, b) => a - b));
    expect(r.statsRefreshed).toBe(refreshed.length);
    expect(r.statsRefreshed).toBeGreaterThan(0);
  });

  it("a parse failure never downgrades an already-parsed report (kept_prior, zero writes)", async () => {
    const db = fakeDb({ priorStatus: "parsed" });
    const r = await loadParsedReportById(db.query, 42, "ir", failedParse());
    expect(r.action).toBe("kept_prior");
    expect(db.calls).toHaveLength(1); // only the status SELECT
  });

  it("a parse failure on a pending report records 'failed' honestly", async () => {
    const db = fakeDb({ priorStatus: "pending" });
    const r = await loadParsedReportById(db.query, 42, "ir", failedParse());
    expect(r.action).toBe("failed");
    const upd = db.calls.find((c) => c.sql.includes("'failed'"));
    expect(upd).toBeDefined();
    expect(upd!.params![0]).toBe(42);
  });

  it("a partial failure (citations committed, stats refresh died) is repaired by a conflict-only replay", async () => {
    const db = fakeDb({ priorStatus: "pending", failStatsRefreshOnce: true });
    // run 1 through the VALIDATION-PATH wrapper: citations commit, then the
    // stats upsert throws; the wrapper must swallow the infrastructure error
    // (a citation refresh never costs a validation run)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const first = await refreshReportCitations(db.query, 42, FIXTURE_URL, "ir", html);
      expect(first).toBeNull();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
    const committed = db.citationKeys.size;
    expect(committed).toBeGreaterThan(0); // the failed run really persisted citations
    expect(db.statsRefreshCalls).toHaveLength(0); // and refreshed no aggregates

    // run 2 (replay): every citation conflicts — zero inserted — yet stats are
    // recomputed for the COMPLETE resolved source set, repairing the aggregates
    const second = await refreshReportCitations(db.query, 42, FIXTURE_URL, "ir", html);
    expect(second).not.toBeNull();
    expect(second!.action).toBe("parsed");
    expect(second!.citationsInserted).toBe(0);
    expect(db.citationKeys.size).toBe(committed); // replay duplicated nothing
    expect(db.statsRefreshCalls).toHaveLength(1);
    const refreshed = [...db.statsRefreshCalls[0]].sort((a, b) => a - b);
    expect(refreshed).toEqual([...db.sourceIds.values()].sort((a, b) => a - b));
    expect(second!.statsRefreshed).toBe(refreshed.length);
  });

  it("LEGAL: no persisted parameter carries ISW prose — URLs, enums, cues, counts only", async () => {
    const db = fakeDb({ priorStatus: "pending" });
    await loadParsedReportById(db.query, 42, "ir", parsedFixture);
    for (const call of db.calls) {
      for (const p of call.params ?? []) {
        if (typeof p !== "string") continue;
        // longest legitimate strings are citation URLs; hedging cues are ≤60
        // chars by construction; a takeaway/endnote sentence would exceed this
        if (!/^https?:\/\//.test(p)) expect(p.length).toBeLessThanOrEqual(120);
        expect(p).not.toMatch(/key takeaway/i);
      }
    }
  });
});

describe("refreshSourceStats", () => {
  it("is upsert-only — no DELETE window — and keyed on (source_id, theater)", async () => {
    const calls: Call[] = [];
    const query: QueryFn = async (sql, params = []) => {
      calls.push({ sql, params });
      return sql.includes("INSERT INTO source_theater_stats") ? [{ source_id: 1 }] : [];
    };
    const n = await refreshSourceStats(query, [1, 2], "ir");
    expect(n).toBe(1);
    expect(calls.some((c) => /DELETE/i.test(c.sql))).toBe(false);
    const stats = calls.find((c) => c.sql.includes("INSERT INTO source_theater_stats"))!;
    expect(stats.sql).toContain("ON CONFLICT (source_id, theater) DO UPDATE");
    expect(stats.params).toEqual([[1, 2], "ir"]);
    const global = calls.find((c) => c.sql.includes("UPDATE sources"))!;
    expect(global.sql).toContain("WHERE s.id = a.source_id");
  });
});
