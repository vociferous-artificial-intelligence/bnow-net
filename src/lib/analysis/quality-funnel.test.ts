import { describe, expect, it } from "vitest";
import { currentVersion } from "./map-versions";
import { MAP_EPOCH } from "./map-worker";
import {
  FUNNEL_VERSION,
  PRE_HARDENING_DISPATCH,
  aggregateCorpus,
  aggregateDigest,
  buildAdapterConversions,
  citationLinksSql,
  docClaimCountsSql,
  digestRowSql,
  eligibleDocsSql,
  loadQualityFunnel,
  mapStateSql,
  persistedCountsSql,
  type CitationLinkRow,
  type DocClaimCountRow,
  type EligibleDocRow,
  type MapStateRow,
  type QueryFn,
} from "./quality-funnel";

const THEATER = "ir";
const TRACK = "military" as const;
const DATE = "2026-08-16";
const CURRENT = currentVersion(TRACK, THEATER)!;
const OLD = "superseded-v0";

// ---- fixtures ----------------------------------------------------------------

const doc = (id: number, adapter: string, over: Partial<EligibleDocRow> = {}): EligibleDocRow => ({
  id,
  adapter,
  lang: "en",
  platform: "web",
  processed: true,
  canonicalDocId: null,
  mirrorMethod: null,
  ...over,
});

const state = (docId: number, version: string, claimCount: number): MapStateRow => ({
  rawDocumentId: docId,
  extractorVersion: version,
  claimCount,
});

const claimRows = (docId: number, version: string, claims: number): DocClaimCountRow => ({
  rawDocumentId: docId,
  extractorVersion: version,
  claims,
});

const link = (docId: number, adapter: string, day = DATE, platform: string | null = "web"): CitationLinkRow => ({
  rawDocumentId: docId,
  adapter,
  platform,
  day,
});

// eligible corpus: 3 canonical + 1 mirror
const DOCS = [
  doc(1, "rss", { lang: "fa" }),
  doc(2, "x_api", { platform: "x" }),
  doc(3, "telegram_web", { platform: "telegram" }),
  doc(4, "x_api", { platform: "x", canonicalDocId: 2, mirrorMethod: "minhash" }),
];

// map rows deliberately include superseded versions AND rows on the mirror —
// the aggregator must exclude every one of them from the current stages
const STATES = [
  state(1, CURRENT, 2),
  state(2, CURRENT, 0),
  state(1, OLD, 3), // superseded on a canonical doc
  state(4, CURRENT, 5), // current-version row on a MIRROR — anomalous, excluded
  state(4, OLD, 1), // superseded on the mirror — excluded entirely
];

const CLAIM_COUNTS = [
  claimRows(1, CURRENT, 2),
  claimRows(1, OLD, 3),
  claimRows(4, CURRENT, 5), // mirror rows never inflate mapClaims
];

// ---- corpus aggregation ------------------------------------------------------

describe("aggregateCorpus", () => {
  it("splits eligible docs by adapter/platform/lang and excludes mirrors from map stages", () => {
    const warnings: string[] = [];
    const unknown: string[] = [];
    const c = aggregateCorpus(DOCS, STATES, CLAIM_COUNTS, CURRENT, warnings, unknown);
    expect(c.rawEligibleDocs).toBe(4);
    expect(c.byAdapter).toEqual({ rss: 1, x_api: 2, telegram_web: 1 });
    expect(c.byPlatform).toEqual({ web: 1, x: 2, telegram: 1 });
    expect(c.byLang).toEqual({ fa: 1, en: 3 });
    expect(c.mirrorDocs).toBe(1);
    expect(c.mirrorMethods).toEqual({ minhash: 1 });
    expect(c.canonicalDocs).toBe(3);
    // mirror + superseded rows do NOT inflate any current stage
    expect(c.mapDispositions).toBe(2); // docs 1 and 2 only
    expect(c.docsWithClaims).toBe(1); // doc 1
    expect(c.docsNoClaims).toBe(1); // doc 2
    // doc 3 has NO state row for this track and processed=true: the track's
    // lexicon never applied — NOT unmapped backlog, NOT extraction loss
    expect(c.pendingDocs).toBe(0);
    expect(c.notApplicableDocs).toBe(1);
    expect(c.mapClaims).toBe(2); // doc 1's current rows only
    expect(c.supersededDispositions).toBe(1); // doc 1's OLD row (mirror rows excluded)
    expect(c.supersededClaims).toBe(3);
    expect(c.supersededOnly).toBe(false);
    // the anomalous mirror map rows are flagged, not silently dropped
    expect(warnings.some((w) => w.includes("MIRROR"))).toBe(true);
  });

  it("splits undispositioned canonical docs by `processed`: backlog vs lexicon skip", () => {
    // Mutation direction: an implementation that ignores `processed` (all
    // pending, or all notApplicable) fails BOTH assertions below.
    const c = aggregateCorpus(
      [
        doc(1, "rss", { processed: false }), // genuine unmapped backlog
        doc(2, "rss", { processed: true }), // track lexicon never matched
      ],
      [],
      [],
      CURRENT,
      [],
      [],
    );
    expect(c.pendingDocs).toBe(1);
    expect(c.notApplicableDocs).toBe(1);
    expect(c.mapDispositions).toBe(0);
  });

  it("a processed doc with ONLY superseded rows is a remap target — in neither split bucket", () => {
    const c = aggregateCorpus(
      [doc(1, "rss", { processed: true })],
      [state(1, OLD, 2)],
      [],
      CURRENT,
      [],
      [],
    );
    expect(c.pendingDocs).toBe(0);
    expect(c.notApplicableDocs).toBe(0);
    expect(c.supersededDispositions).toBe(1);
    expect(c.supersededOnly).toBe(true);
  });

  it("mirrors never land in the pending/notApplicable buckets", () => {
    const c = aggregateCorpus(
      [doc(1, "rss", { processed: false, canonicalDocId: 9, mirrorMethod: "exact" })],
      [],
      [],
      CURRENT,
      [],
      [],
    );
    expect(c.pendingDocs).toBe(0);
    expect(c.notApplicableDocs).toBe(0);
    expect(c.mirrorDocs).toBe(1);
  });

  it("flags superseded-only coverage as a version bump, never a gap", () => {
    const warnings: string[] = [];
    const c = aggregateCorpus(
      [doc(1, "rss")],
      [state(1, OLD, 2)],
      [claimRows(1, OLD, 2)],
      CURRENT,
      warnings,
      [],
    );
    expect(c.mapDispositions).toBe(0);
    expect(c.supersededDispositions).toBe(1);
    expect(c.supersededOnly).toBe(true);
    expect(warnings.some((w) => w.includes("version bump") && w.includes(CURRENT))).toBe(true);
  });

  it("an unrecognized dedup method lands in unknown with its raw label preserved", () => {
    const unknown: string[] = [];
    const c = aggregateCorpus(
      [doc(1, "rss", { canonicalDocId: 9, mirrorMethod: "simhash-v9" })],
      [],
      [],
      CURRENT,
      [],
      unknown,
    );
    expect(c.mirrorMethods).toEqual({ unknown: 1 });
    expect(unknown).toEqual(["doc_dedup.method=simhash-v9"]);
  });

  it("null version (track not configured) yields zero map stages and a warning", () => {
    const warnings: string[] = [];
    const c = aggregateCorpus([doc(1, "rss")], [state(1, CURRENT, 2)], [], null, warnings, []);
    expect(c.mapDispositions).toBe(0);
    expect(c.supersededDispositions).toBe(1); // nothing can be "current"
    expect(warnings.some((w) => w.includes("not configured"))).toBe(true);
  });

  it("reconciles doc_map_state claim declarations against actual doc_claims rows", () => {
    const warnings: string[] = [];
    aggregateCorpus(
      [doc(1, "rss")],
      [state(1, CURRENT, 2)], // declares claims...
      [], // ...but no doc_claims rows exist
      CURRENT,
      warnings,
      [],
    );
    expect(warnings.some((w) => w.includes("reconciliation") && w.includes("doc_claims"))).toBe(true);
  });
});

// ---- digest aggregation ------------------------------------------------------

const REDUCE_STATS = {
  dispatch: { workload: "reduce", model: "gpt-4o-mini", reasoningEffort: null },
  window: { from: "2026-08-15", to: "2026-08-17", mode: "rolling" },
  claims: 40,
  metaDropped: 1,
  groupsTotal: 30,
  groupsFed: 20,
  quotesBackfilled: 0,
  votes: 5,
  votesRequested: 5,
  failedVotes: 0,
  eventsPerVote: [6, 6, 5, 6, 6],
  survivingEvents: 5,
  droppedGidRefs: 2,
  gidsCitedAnyVote: 15,
  gidsMajority: 9,
};

function mapreduceRow(over: Record<string, unknown> = {}) {
  return {
    id: 77,
    provider: "openai:gpt-4o-mini+mapreduce",
    structured: {
      stats: {
        engine: "mapreduce",
        reduce: { ...REDUCE_STATS, ...(over.reduce as Record<string, unknown> | undefined) },
        docsAnalyzed: 18,
        publicationGuard: { attributedClaims: 1, droppedClaims: 0 },
        evidenceRecency: { version: 1, claimCount: 9 },
        ...over,
      },
    },
  };
}

describe("aggregateDigest (mapreduce)", () => {
  const LINKS = [link(1, "rss"), link(1, "rss"), link(2, "x_api", "2026-08-15", "x")];

  it("passes reduce/guard/recency/dispatch through verbatim and counts relational stages", () => {
    const warnings: string[] = [];
    const d = aggregateDigest(mapreduceRow(), { events: 4, claims: 9 }, LINKS, warnings, []);
    expect(d.engine).toBe("mapreduce");
    expect(d.reduce).toEqual(REDUCE_STATS);
    expect(d.dispatch).toEqual(REDUCE_STATS.dispatch);
    expect(d.legacyStages).toBeNull();
    expect(d.publicationGuard).toEqual({ attributedClaims: 1, droppedClaims: 0 });
    expect(d.evidenceRecency).toEqual({ version: 1, claimCount: 9 });
    expect(d.persisted).toEqual({ events: 4, claims: 9, citationLinks: 3, citedDocs: 2 });
    expect(d.byPlatformLinks).toEqual({ web: { links: 2, docs: 1 }, x: { links: 1, docs: 1 } });
    expect(warnings).toEqual([]); // all invariants hold on this fixture
  });

  it("reports the pre-hardening baseline when no dispatch identity was persisted", () => {
    const row = mapreduceRow();
    delete (row.structured.stats.reduce as Record<string, unknown>).dispatch;
    const d = aggregateDigest(row, { events: 4, claims: 9 }, LINKS, [], []);
    expect(d.dispatch).toBe(PRE_HARDENING_DISPATCH);
  });

  it("warns on every violated stage invariant", () => {
    const warnings: string[] = [];
    aggregateDigest(
      mapreduceRow({
        reduce: { groupsFed: 40, groupsTotal: 30, gidsCitedAnyVote: 50, gidsMajority: 60, survivingEvents: 2 },
        evidenceRecency: { version: 1, claimCount: 5 },
      }),
      { events: 4, claims: 9 },
      [],
      warnings,
      [],
    );
    expect(warnings.some((w) => w.includes("groupsFed 40 > groupsTotal 30"))).toBe(true);
    expect(warnings.some((w) => w.includes("gidsMajority 60 > gidsCitedAnyVote 50"))).toBe(true);
    expect(warnings.some((w) => w.includes("gidsCitedAnyVote 50 > groupsFed 40"))).toBe(true);
    expect(warnings.some((w) => w.includes("4 persisted events exceed 2 surviving"))).toBe(true);
    expect(warnings.some((w) => w.includes("claimCount 5 != relational claims 9"))).toBe(true);
  });

  it("reconciles cited docs against the reduce window, not the single report day", () => {
    const warnings: string[] = [];
    aggregateDigest(
      mapreduceRow(),
      { events: 4, claims: 9 },
      [
        link(1, "rss", "2026-08-15"), // window start day — inside [from, to)
        link(2, "x_api", "2026-08-16"),
        link(3, "rss", "2026-08-17"), // = to (exclusive) — OUTSIDE
        link(4, "rss", "2026-08-10"), // before from — OUTSIDE
      ],
      warnings,
      [],
    );
    expect(warnings.some((w) => w.includes("2 cited doc(s) fall outside the reduce window"))).toBe(true);
  });

  it("preserves an unrecognized window mode in unknownReasons", () => {
    const unknown: string[] = [];
    aggregateDigest(
      mapreduceRow({ reduce: { window: { from: "2026-08-15", to: "2026-08-17", mode: "sliding" } } }),
      { events: 4, claims: 9 },
      [],
      [],
      unknown,
    );
    expect(unknown).toContain("reduce.window.mode=sliding");
  });
});

describe("aggregateDigest (legacy)", () => {
  it("reports only its own honest stages — never coerced into map stages", () => {
    const d = aggregateDigest(
      {
        id: 33,
        provider: "openai:gpt-4o-mini",
        structured: {
          stats: {
            docsAnalyzed: 100,
            docsRaw: 400,
            trackRows: 350,
            droppedClaims: 2,
            llmDispatch: { workload: "digest", model: "gpt-4o-mini" },
          },
        },
      },
      { events: 6, claims: 20 },
      [link(1, "rss")],
      [],
      [],
    );
    expect(d.engine).toBe("legacy");
    expect(d.reduce).toBeNull();
    expect(d.legacyStages).toEqual({ docsRaw: 400, trackRows: 350, docsAnalyzed: 100, droppedClaims: 2 });
    expect(d.dispatch).toEqual({ workload: "digest", model: "gpt-4o-mini" });
    expect(d.persisted.claims).toBe(20);
  });

  it("a digest without stats.engine is legacy with the pre-hardening dispatch label", () => {
    const d = aggregateDigest(
      { id: 12, provider: "openai:gpt-4o-mini", structured: { stats: {} } },
      { events: 1, claims: 1 },
      [],
      [],
      [],
    );
    expect(d.engine).toBe("legacy");
    expect(d.dispatch).toBe(PRE_HARDENING_DISPATCH);
    expect(d.legacyStages).toEqual({
      docsRaw: null,
      trackRows: null,
      docsAnalyzed: null,
      droppedClaims: null,
    });
  });
});

// ---- adapter conversions -----------------------------------------------------

describe("buildAdapterConversions", () => {
  it("computes link shares and report-date doc conversion per adapter", () => {
    const links = [link(1, "rss"), link(1, "rss"), link(2, "x_api"), link(99, "gdelt", "2026-08-15")];
    const out = buildAdapterConversions(DOCS, STATES, CLAIM_COUNTS, links, CURRENT);
    expect(out.rss).toEqual({
      eligibleDocs: 1,
      pendingDocs: 0,
      notApplicableDocs: 0,
      docsWithClaims: 1,
      mapClaims: 2,
      citedDocs: 1,
      citationLinks: 2,
      linkSharePct: 50,
      docConversionPct: 100,
    });
    // the mirror still counts as an eligible x_api doc, but no map stage counts it
    expect(out.x_api).toMatchObject({ eligibleDocs: 2, docsWithClaims: 0, mapClaims: 0, citedDocs: 1 });
    expect(out.x_api.linkSharePct).toBe(25);
    // doc 3 (telegram_web) is undispositioned + processed -> per-adapter lexicon skip
    expect(out.telegram_web.notApplicableDocs).toBe(1);
    expect(out.telegram_web.pendingDocs).toBe(0);
    // cited-only adapter (rolling-window doc from a neighboring day): honest null rate
    expect(out.gdelt).toEqual({
      eligibleDocs: 0,
      pendingDocs: 0,
      notApplicableDocs: 0,
      docsWithClaims: 0,
      mapClaims: 0,
      citedDocs: 1,
      citationLinks: 1,
      linkSharePct: 25,
      docConversionPct: null,
    });
    // adapter with no links at all: null share, 0% conversion is not fabricated
    expect(out.telegram_web.citationLinks).toBe(0);
    expect(out.telegram_web.docConversionPct).toBe(0);
  });

  it("per-adapter pending vs notApplicable split follows `processed` (mutation direction)", () => {
    const out = buildAdapterConversions(
      [doc(1, "rss", { processed: false }), doc(2, "telegram_web", { processed: true })],
      [],
      [],
      [],
      CURRENT,
    );
    expect(out.rss.pendingDocs).toBe(1);
    expect(out.rss.notApplicableDocs).toBe(0);
    expect(out.telegram_web.pendingDocs).toBe(0);
    expect(out.telegram_web.notApplicableDocs).toBe(1);
  });

  it("no links at all: every linkSharePct is null, never NaN", () => {
    const out = buildAdapterConversions(DOCS, [], [], [], CURRENT);
    expect(out.rss.linkSharePct).toBeNull();
  });
});

// ---- SQL builders ------------------------------------------------------------

describe("SQL builders", () => {
  it("eligibleDocsSql pins theater/day/epoch/stub-exclusion and selects the processed flag", () => {
    const q = eligibleDocsSql(THEATER, DATE);
    expect(q.sql).toContain("COALESCE(rd.published_at, rd.fetched_at)::date = $2::date");
    expect(q.sql).toContain("length(rd.content) >= 40");
    expect(q.sql).toContain("content NOT LIKE $4");
    expect(q.sql).toContain("rd.processed");
    expect(q.params).toEqual([THEATER, DATE, MAP_EPOCH, "[STUB FIXTURE]%"]);
  });

  it("map-state and doc-claims builders parameterize doc ids and track", () => {
    expect(mapStateSql([1, 2], TRACK).params).toEqual([[1, 2], TRACK]);
    expect(docClaimCountsSql([3], TRACK).params).toEqual([[3], TRACK]);
    expect(digestRowSql(THEATER, TRACK, DATE).params).toEqual([THEATER, TRACK, DATE]);
    expect(persistedCountsSql(9).params).toEqual([9]);
  });

  it("citationLinksSql excludes stub docs like every other population read", () => {
    const q = citationLinksSql(9);
    expect(q.sql).toContain("rd.content NOT LIKE $2");
    expect(q.params).toEqual([9, "[STUB FIXTURE]%"]);
  });
});

// ---- loader (injected query fn, fixture-backed) ------------------------------

function fakeQuery(fixtures: {
  docs?: Array<Record<string, unknown>>;
  states?: Array<Record<string, unknown>>;
  claimCounts?: Array<Record<string, unknown>>;
  digest?: Record<string, unknown> | null;
  counts?: Record<string, unknown>;
  links?: Array<Record<string, unknown>>;
}): { query: QueryFn; calls: string[] } {
  const calls: string[] = [];
  const query: QueryFn = async (sql) => {
    calls.push(sql);
    if (/FROM raw_documents rd/.test(sql)) return fixtures.docs ?? [];
    if (/FROM doc_map_state/.test(sql)) return fixtures.states ?? [];
    if (/FROM doc_claims/.test(sql)) return fixtures.claimCounts ?? [];
    if (/FROM digests d/.test(sql)) return fixtures.digest ? [fixtures.digest] : [];
    if (/FROM claims WHERE digest_id/.test(sql)) return [fixtures.counts ?? { claims: 0, events: 0 }];
    if (/FROM claim_sources cs/.test(sql)) return fixtures.links ?? [];
    throw new Error(`unexpected sql: ${sql}`);
  };
  return { query, calls };
}

describe("loadQualityFunnel", () => {
  it("assembles the full report; superseded and mirror rows inflate nothing end-to-end", async () => {
    const { query } = fakeQuery({
      // driver-realistic: numeric-ish values as strings survive the Number() folds
      docs: [
        { id: "1", adapter: "rss", lang: "fa", platform: "web", processed: true, canonical_doc_id: null, mirror_method: null },
        { id: "2", adapter: "x_api", lang: "en", platform: "x", processed: false, canonical_doc_id: null, mirror_method: null },
        { id: "4", adapter: "x_api", lang: "en", platform: "x", processed: true, canonical_doc_id: "2", mirror_method: "minhash" },
      ],
      states: [
        { raw_document_id: "1", extractor_version: CURRENT, claim_count: "2" },
        { raw_document_id: "1", extractor_version: OLD, claim_count: "3" },
        { raw_document_id: "4", extractor_version: CURRENT, claim_count: "5" },
      ],
      claimCounts: [
        { raw_document_id: "1", extractor_version: CURRENT, claims: "2" },
        { raw_document_id: "1", extractor_version: OLD, claims: "3" },
        { raw_document_id: "4", extractor_version: CURRENT, claims: "5" },
      ],
      digest: { id: "77", provider: "openai:gpt-4o-mini+mapreduce", structured: mapreduceRow().structured },
      counts: { claims: "9", events: "4" },
      links: [
        { raw_document_id: "1", adapter: "rss", platform: "web", day: "2026-08-16" },
        { raw_document_id: "2", adapter: "x_api", platform: "x", day: "2026-08-15" },
      ],
    });
    const report = await loadQualityFunnel(query, { theater: THEATER, track: TRACK, date: DATE });
    expect(report.funnelVersion).toBe(FUNNEL_VERSION);
    expect(report.currentExtractorVersion).toBe(CURRENT);
    expect(report.corpus.rawEligibleDocs).toBe(3);
    expect(report.corpus.mirrorDocs).toBe(1);
    expect(report.corpus.mapDispositions).toBe(1); // doc 1 only
    expect(report.corpus.mapClaims).toBe(2);
    expect(report.corpus.supersededDispositions).toBe(1);
    // doc 2: no state row + processed=false -> genuine backlog, per-adapter too
    expect(report.corpus.pendingDocs).toBe(1);
    expect(report.corpus.notApplicableDocs).toBe(0);
    expect(report.adapters.x_api.pendingDocs).toBe(1);
    expect(report.digest?.digestId).toBe(77);
    expect(report.digest?.persisted).toEqual({ events: 4, claims: 9, citationLinks: 2, citedDocs: 2 });
    expect(report.adapters.rss.mapClaims).toBe(2);
    expect(report.adapters.x_api.mapClaims).toBe(0); // mirror inflates nothing
  });

  it("an empty corpus skips the doc_map_state/doc_claims reads entirely", async () => {
    const { query, calls } = fakeQuery({ docs: [], digest: null });
    const report = await loadQualityFunnel(query, { theater: THEATER, track: TRACK, date: DATE });
    expect(report.corpus.rawEligibleDocs).toBe(0);
    expect(report.digest).toBeNull();
    expect(calls.some((s) => /FROM doc_map_state/.test(s))).toBe(false);
    expect(calls.some((s) => /FROM doc_claims/.test(s))).toBe(false);
  });

  it("issues only SELECT statements (read-only by construction)", async () => {
    const { query, calls } = fakeQuery({
      docs: [{ id: 1, adapter: "rss", lang: null, platform: null, canonical_doc_id: null, mirror_method: null }],
      digest: { id: 5, provider: null, structured: { stats: {} } },
    });
    await loadQualityFunnel(query, { theater: THEATER, track: TRACK, date: DATE });
    expect(calls.length).toBeGreaterThan(0);
    for (const sql of calls) expect(sql.trimStart()).toMatch(/^SELECT/);
  });
});
