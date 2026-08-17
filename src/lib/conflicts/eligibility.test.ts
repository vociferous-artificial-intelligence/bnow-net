import { describe, expect, it } from "vitest";
import { conflictDefinition } from "./definitions";
import { computeEvaluationWindow } from "./evaluation-window";
import {
  evaluateCorpusRecallEligibility,
  evaluatePublishedRetentionEligibility,
  independentSourceCount,
  LEGACY_CONTRIBUTOR_TRACKS,
  type EligibilityContext,
} from "./eligibility";
import {
  CANDIDATE_CLAIM_KEYS,
  CANDIDATE_DOC_KEYS,
  type CandidateClaim,
  type CandidateDoc,
} from "./evidence-records";
import { loadConflictFixtureScenarios } from "./fixture-corpus";

function doc(overrides: Partial<CandidateDoc> = {}): CandidateDoc {
  return {
    docId: 1,
    adapter: "rss",
    platform: null,
    sourceDomain: "wire.example",
    publishedAt: "2026-08-10T06:00:00Z",
    fetchedAt: "2026-08-10T07:00:00Z",
    mirrorOfDocId: null,
    sourceLanguage: null,
    ...overrides,
  };
}

function claim(overrides: Partial<CandidateClaim> = {}): CandidateClaim {
  return {
    claimId: 1,
    theater: "ua",
    track: "military",
    text: "Ukrainian units repelled Russian assaults near Kupiansk on August 10.",
    hedging: "claimed",
    claimDate: "2026-08-10",
    docs: [doc()],
    engine: "mapreduce",
    currentExtractorVersion: true,
    extractorVersion: "gpt-4o-mini:test-hash",
    published: true,
    stub: false,
    sourceReliability: null,
    ...overrides,
  };
}

function ctxFor(
  conflictId: "russia_ukraine" | "iran_regional" = "russia_ukraine",
  anchors: { cutoffAt?: string | null; publishedAt?: string | null; reportDate?: string } = {},
): EligibilityContext {
  const reportDate = anchors.reportDate ?? "2026-08-10";
  const cutoffAt = anchors.cutoffAt !== undefined ? anchors.cutoffAt : "2026-08-10T19:45:00Z";
  const publishedAt = anchors.publishedAt !== undefined ? anchors.publishedAt : "2026-08-10T23:30:00Z";
  return {
    def: conflictDefinition(conflictId),
    window: computeEvaluationWindow({ reportDate, cutoffAt, publishedAt }),
    reportDate,
    cutoffAt,
    publishedAt,
  };
}

describe("corpus-recall eligibility — the 8 predicates individually", () => {
  it("a clean current-version in-window in-scope claim is included, lane via the fail-closed helpers", () => {
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim());
    expect(ev.record).toEqual({
      included: true,
      lane: "frontline_maneuver",
      reasons: ["geo:ua-frontline", "lane:frontline_maneuver", "window:in"],
    });
    expect(ev.applicableExclusions).toEqual([]);
    expect(ev.independentSourceCount).toBe(1);
    expect(ev.earliestIngestAt).toBe("2026-08-10T07:00:00Z");
  });

  it("P7 stub → stub_fixture (truth-in-UI, ruling 3)", () => {
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ stub: true }));
    expect(ev.record).toEqual({ included: false, reason: "stub_fixture" });
  });

  it("P7 zero raw-document links → missing_source (ruling 2 fail-closed)", () => {
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ docs: [] }));
    expect(ev.record).toEqual({ included: false, reason: "missing_source" });
  });

  it("P6 superseded mapreduce version → superseded_version (rulings 13/18)", () => {
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ currentExtractorVersion: false }));
    expect(ev.record).toEqual({ included: false, reason: "superseded_version" });
  });

  it("P7 only mirror documents → mirror_only", () => {
    const ev = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ docs: [doc({ mirrorOfDocId: 999 })] }),
    );
    expect(ev.record).toEqual({ included: false, reason: "mirror_only" });
  });

  it("P2 day outside the frozen window → off_window", () => {
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ claimDate: "2026-08-03" }));
    expect(ev.record).toEqual({ included: false, reason: "off_window" });
  });

  it("P2 missing/malformed claimDate → off_window (conservative bounded treatment, Gate-3 missing-timestamps case)", () => {
    for (const bad of ["", "not-a-date", "2026-02-30"]) {
      const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ claimDate: bad }));
      expect(ev.record).toEqual({ included: false, reason: "off_window" });
    }
  });

  it("P1 theater outside the conflict's contributor roster → off_scope", () => {
    const ev = evaluateCorpusRecallEligibility(
      ctxFor("iran_regional", { reportDate: "2026-08-08", cutoffAt: "2026-08-08T16:00:00Z" }),
      claim({
        theater: "ru",
        text: "IRGC Navy fast boats shadowed a tanker in the Strait of Hormuz.",
        claimDate: "2026-08-08",
      }),
    );
    expect(ev.record).toEqual({ included: false, reason: "off_scope" });
  });

  it("P6 track not designated for the conflict → off_scope", () => {
    // russia_ukraine designates only the military track
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ track: "nuclear" }));
    expect(ev.record).toEqual({ included: false, reason: "off_scope" });
  });

  it("P3-P5 classifier off_scope and unclassified map to their bounded reasons", () => {
    const offScope = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ text: "EU agriculture ministers failed to agree on a dairy subsidy compromise." }),
    );
    expect(offScope.record).toEqual({ included: false, reason: "off_scope" });
    const unclassified = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ text: "A completely unrelated sentence about gardening." }),
    );
    expect(unclassified.record).toEqual({ included: false, reason: "unclassified" });
  });

  it("P8 legacy engine → legacy_incomparable (comparability honesty)", () => {
    const ev = evaluateCorpusRecallEligibility(
      ctxFor("iran_regional", { reportDate: "2026-08-08", cutoffAt: "2026-08-08T16:00:00Z" }),
      claim({
        theater: "bh",
        engine: "legacy",
        currentExtractorVersion: false,
        text: "Gulf reporting claimed increased interceptor stocks at a base in Bahrain.",
        claimDate: "2026-08-08",
      }),
    );
    expect(ev.record).toEqual({ included: false, reason: "legacy_incomparable" });
  });
});

describe("corpus-recall eligibility — frozen exclusion precedence (dominant reason)", () => {
  it("collects ALL applicable reasons and records the frozen-precedence dominant", () => {
    // stub AND off-scope content AND out of window: integrity wins
    const ev = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({
        stub: true,
        claimDate: "2026-07-01",
        text: "A Gulf hotel chain reported record summer occupancy.",
      }),
    );
    expect(ev.record).toEqual({ included: false, reason: "stub_fixture" });
    expect(ev.applicableExclusions).toContain("off_window");
    expect(ev.applicableExclusions).toContain("stub_fixture");
  });

  it("missing_source beats off_scope; off_window beats off_scope; off_scope beats legacy_incomparable", () => {
    const ms = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ docs: [], text: "EU ministers debated dairy subsidies." }),
    );
    expect(ms.record).toEqual({ included: false, reason: "missing_source" });

    const ow = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ claimDate: "2026-08-01", text: "EU ministers debated dairy subsidies." }),
    );
    expect(ow.record).toEqual({ included: false, reason: "off_window" });

    const iranCtx = ctxFor("iran_regional", {
      reportDate: "2026-08-08",
      cutoffAt: "2026-08-08T16:00:00Z",
    });
    const legacyOffScope = evaluateCorpusRecallEligibility(
      iranCtx,
      claim({
        theater: "il",
        engine: "legacy",
        currentExtractorVersion: false,
        text: "An Israeli municipal coalition dispute over budgets continued.",
        claimDate: "2026-08-08",
      }),
    );
    expect(legacyOffScope.record).toEqual({ included: false, reason: "off_scope" });
    expect(legacyOffScope.applicableExclusions).toContain("legacy_incomparable");
  });

  it("superseded_version beats mirror_only", () => {
    const ev = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ currentExtractorVersion: false, docs: [doc({ mirrorOfDocId: 7 })] }),
    );
    expect(ev.record).toEqual({ included: false, reason: "superseded_version" });
    expect(ev.applicableExclusions).toEqual(["superseded_version", "mirror_only"]);
  });

  it("applicableExclusions carries each reason at most once (roster + classifier both off_scope)", () => {
    // theater outside the roster AND classifier-off-scope content: the same
    // reason applies through two predicate families but appears once
    const cases = [
      evaluateCorpusRecallEligibility(
        ctxFor(),
        claim({ theater: "xx", text: "EU ministers debated dairy subsidies." }),
      ),
      evaluatePublishedRetentionEligibility(
        ctxFor(),
        claim({ theater: "xx", text: "EU ministers debated dairy subsidies." }),
      ),
    ];
    for (const ev of cases) {
      expect(ev.record).toEqual({ included: false, reason: "off_scope" });
      expect(ev.applicableExclusions).toEqual(["off_scope"]);
    }
  });
});

describe("window reason labels", () => {
  it("start-edge day is labeled window:in-edge", () => {
    const ev = evaluateCorpusRecallEligibility(ctxFor(), claim({ claimDate: "2026-08-08" }));
    expect(ev.record.included).toBe(true);
    if (ev.record.included) expect(ev.record.reasons).toContain("window:in-edge");
  });

  it("a post-report-day claim included only through the published END rung is labeled window:in-published-end", () => {
    const ctx = ctxFor("russia_ukraine", {
      reportDate: "2026-08-13",
      cutoffAt: "cutoff 1500 hrs local time", // malformed → falls to published
      publishedAt: "2026-08-14T01:15:00Z",
    });
    expect(ctx.window.windowEndSource).toBe("published");
    const ev = evaluateCorpusRecallEligibility(
      ctx,
      claim({
        claimDate: "2026-08-14",
        text: "A drone strike damaged a berth in Izmail overnight.",
      }),
    );
    expect(ev.record.included).toBe(true);
    if (ev.record.included) expect(ev.record.reasons).toContain("window:in-published-end");
  });

  it("a post-report-day claim included through a late parseable CUTOFF is labeled window:in-cutoff-end", () => {
    const ctx = ctxFor("russia_ukraine", {
      reportDate: "2026-08-13",
      cutoffAt: "2026-08-14T03:00:00Z", // a late-ET declared cutoff lands past midnight UTC
      publishedAt: "2026-08-14T04:15:00Z",
    });
    expect(ctx.window.windowEndSource).toBe("cutoff");
    const ev = evaluateCorpusRecallEligibility(
      ctx,
      claim({
        claimDate: "2026-08-14",
        text: "A drone strike damaged a berth in Izmail overnight.",
      }),
    );
    expect(ev.record.included).toBe(true);
    if (ev.record.included) expect(ev.record.reasons).toContain("window:in-cutoff-end");
  });
});

describe("availability diagnostics (unknown ≠ false; equality inclusive)", () => {
  it("null when the anchor is missing/malformed or ingest is unknown", () => {
    const malformed = evaluateCorpusRecallEligibility(
      ctxFor("russia_ukraine", { cutoffAt: "3:45 pm ET", publishedAt: null, reportDate: "2026-08-10" }),
      claim(),
    );
    expect(malformed.availability).toEqual({ atCutoff: null, atPublication: null });

    const noIngest = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ docs: [doc({ fetchedAt: null })] }),
    );
    expect(noIngest.availability).toEqual({ atCutoff: null, atPublication: null });
  });

  it("ingest exactly AT the cutoff instant counts as available (at-or-before)", () => {
    const ev = evaluateCorpusRecallEligibility(
      ctxFor(),
      claim({ docs: [doc({ fetchedAt: "2026-08-10T19:45:00Z" })] }),
    );
    expect(ev.availability.atCutoff).toBe(true);
  });

  it("offset and Z forms of the same instant are treated identically", () => {
    const ev = evaluateCorpusRecallEligibility(
      ctxFor("russia_ukraine", { cutoffAt: "2026-08-10T15:45:00-04:00" }),
      claim({ docs: [doc({ fetchedAt: "2026-08-10T19:45:00Z" })] }),
    );
    expect(ev.availability.atCutoff).toBe(true);
  });
});

describe("published-retention eligibility (separate population, register #4)", () => {
  const iranCtx = () =>
    ctxFor("iran_regional", { reportDate: "2026-08-08", cutoffAt: "2026-08-08T16:00:00Z" });

  it("an unpublished claim can NEVER be a member (evidence existence ≠ retention)", () => {
    const ev = evaluatePublishedRetentionEligibility(ctxFor(), claim({ published: false }));
    expect(ev.record.included).toBe(false);
  });

  it("a published LEGACY digest claim IS a member here", () => {
    const ev = evaluatePublishedRetentionEligibility(
      iranCtx(),
      claim({
        theater: "bh",
        engine: "legacy",
        currentExtractorVersion: false,
        text: "Gulf reporting claimed increased interceptor stocks at a base in Bahrain.",
        claimDate: "2026-08-08",
      }),
    );
    expect(ev.record.included).toBe(true);
  });

  it("legacy contributor theaters designate only their military-track digests", () => {
    expect(LEGACY_CONTRIBUTOR_TRACKS).toEqual(["military"]);
    const ev = evaluatePublishedRetentionEligibility(
      iranCtx(),
      claim({
        theater: "bh",
        track: "nuclear",
        engine: "legacy",
        currentExtractorVersion: false,
        text: "The IAEA said access to a workshop was declined.",
        claimDate: "2026-08-08",
      }),
    );
    expect(ev.record.included).toBe(false);
  });

  it("a published SUPERSEDED mapreduce claim is still a member: retention asks what the OUTPUT contained", () => {
    const ev = evaluatePublishedRetentionEligibility(
      ctxFor(),
      claim({ currentExtractorVersion: false }),
    );
    expect(ev.record.included).toBe(true);
  });

  it("integrity, window, and scope predicates still apply", () => {
    expect(
      evaluatePublishedRetentionEligibility(ctxFor(), claim({ stub: true })).record,
    ).toEqual({ included: false, reason: "stub_fixture" });
    expect(
      evaluatePublishedRetentionEligibility(ctxFor(), claim({ claimDate: "2026-08-01" })).record,
    ).toEqual({ included: false, reason: "off_window" });
    expect(
      evaluatePublishedRetentionEligibility(
        ctxFor(),
        claim({ text: "EU ministers debated dairy subsidies." }),
      ).record,
    ).toEqual({ included: false, reason: "off_scope" });
    expect(
      evaluatePublishedRetentionEligibility(
        ctxFor(),
        claim({ docs: [doc({ mirrorOfDocId: 3 })] }),
      ).record,
    ).toEqual({ included: false, reason: "mirror_only" });
  });
});

describe("independence and structural anti-gaming", () => {
  it("independentSourceCount counts non-mirror docs only", () => {
    expect(
      independentSourceCount(
        claim({
          docs: [
            doc({ docId: 1 }),
            doc({ docId: 2, mirrorOfDocId: 1 }),
            doc({ docId: 3, mirrorOfDocId: 1 }),
          ],
        }),
      ),
    ).toBe(1);
  });

  it("candidate shapes carry EXACTLY the allowlisted keys — no field can smuggle reference text", () => {
    // pin the allowlists themselves (a new field is a deliberate, reviewed act)
    expect([...CANDIDATE_CLAIM_KEYS].sort()).toEqual(
      [
        "claimId",
        "theater",
        "track",
        "text",
        "hedging",
        "claimDate",
        "docs",
        "engine",
        "currentExtractorVersion",
        "extractorVersion",
        "published",
        "stub",
        "sourceReliability",
      ].sort(),
    );
    expect([...CANDIDATE_DOC_KEYS].sort()).toEqual(
      [
        "docId",
        "adapter",
        "platform",
        "sourceDomain",
        "publishedAt",
        "fetchedAt",
        "mirrorOfDocId",
        "sourceLanguage",
      ].sort(),
    );
    // and the fixture loader's rebuilt candidates conform (unknown keys dropped)
    const scenarios = loadConflictFixtureScenarios();
    for (const s of scenarios) {
      for (const c of s.evidence) {
        expect(Object.keys(c).sort()).toEqual([...CANDIDATE_CLAIM_KEYS].sort());
        for (const d of c.docs) {
          expect(Object.keys(d).sort()).toEqual([...CANDIDATE_DOC_KEYS].sort());
        }
      }
    }
  });
});
