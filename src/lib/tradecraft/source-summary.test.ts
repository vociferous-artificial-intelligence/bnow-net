import { describe, expect, it } from "vitest";
import type { ClaimSourceDoc } from "@/components/claim-evidence-model";
import {
  SOURCE_SUMMARY_LABEL,
  SOURCE_SUMMARY_VERSION,
  readRecordedSourceMix,
  sourceMixFact,
  summarizeDigestSources,
  type SummaryClaim,
} from "./source-summary";

// GOLDEN-FILE TESTS (WS-7.3 acceptance). The summary statement is a customer-facing
// provenance claim, so the whole rendered paragraph is pinned. A wording change must be
// deliberate and must bump SOURCE_SUMMARY_VERSION.

let nextDocId = 1;
function doc(overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: nextDocId++,
    url: "https://example.org/a",
    title: "A story",
    adapter: "rss",
    sourceId: 1,
    sourceName: "Example News",
    sourceKey: "https://example.org",
    sourceDomain: "example.org",
    platform: "independent_media",
    reliability: 0.7,
    publishedAt: "2026-08-14T09:00:00Z",
    firstSeenAt: "2026-08-14T09:30:00Z",
    ...overrides,
  };
}

/** `structured.stats.sourceMix` as `digest.ts:202-206` persists it. */
const RECORDED_MIX = {
  docsRaw: { byAdapter: { rss: 400 }, byPlatform: { independent_media: 400 } },
  trackRows: { byAdapter: { rss: 300 }, byPlatform: { independent_media: 300 } },
  docsAnalyzed: {
    byAdapter: { rss: 40, telegram: 35, x: 25 },
    byPlatform: { independent_media: 40, telegram: 35, x: 25 },
  },
};

describe("source summary golden text", () => {
  it("renders the full statement for a corroborated digest with a recorded source mix", () => {
    nextDocId = 1;
    const claims: SummaryClaim[] = [
      {
        hedging: "confirmed",
        docs: [
          doc(),
          doc({ sourceId: 2, sourceName: "Telegram Channel", adapter: "telegram", platform: "telegram" }),
        ],
      },
      { hedging: "assessed", docs: [doc()] },
      { hedging: "claimed", docs: [doc({ sourceId: 3, sourceName: "Wire Desk" })] },
    ];
    const s = summarizeDigestSources(claims, readRecordedSourceMix(RECORDED_MIX));
    expect(s.version).toBe(SOURCE_SUMMARY_VERSION);
    expect(s.label).toBe(SOURCE_SUMMARY_LABEL);
    expect(s.text).toBe(
      "This digest publishes 3 claims resting on 4 distinct documents from 3 channels across 2 platforms. " +
        "Evidence for this digest is gathered from this theater's own document corpus only, ordered by the registry's citation history. " +
        "1 of 3 claims (33%) cite two or more documents, 1 (33%) cite two or more channels, and 1 (33%) cite two or more platforms. " +
        "Near-duplicate records from the same theater within a day of each other are collapsed before a claim is written, " +
        "so a second document here is a surviving distinct record, not an independent confirmation. " +
        "The 3 sources supporting the most claims are Example News (2 claims), Telegram Channel (1 claim) and Wire Desk (1 claim). " +
        "1 claim rests on a single document carried as claimed or unverified. " +
        "The analysis batch behind this digest was capped at 40% per platform and per adapter; of the 100 documents it contained, " +
        "the largest platform share was 40% (independent_media) and the largest transport share was 40% (rss). " +
        "Whether that cap held a document back or dropped one from the batch is not recorded.",
    );
  });

  it("says 'not recorded for this digest' when the digest persisted no source mix", () => {
    nextDocId = 1;
    const s = summarizeDigestSources([{ hedging: "confirmed", docs: [doc()] }], null);
    expect(s.mix).toBeNull();
    expect(s.text).toContain(
      "Source-mix figures were not recorded for this digest, so the platform and adapter cap " +
        "cannot be reported for it.",
    );
    // never inferred from the rendered rows — no share, no cap percentage, no batch size
    expect(s.text).not.toContain("40%");
    expect(s.text).not.toContain("analysis batch");
  });

  it("counts corroboration per claim, not per digest", () => {
    nextDocId = 1;
    const shared = doc();
    const claims: SummaryClaim[] = [
      // two documents, but the SAME channel: multi-document, not multi-channel
      { hedging: "confirmed", docs: [shared, doc()] },
      { hedging: "confirmed", docs: [doc({ sourceId: 9, sourceName: "Other" })] },
    ];
    const s = summarizeDigestSources(claims, null);
    expect(s.multiDocumentClaims).toEqual({ claims: 1, percent: 50 });
    expect(s.multiChannelClaims).toEqual({ claims: 0, percent: 0 });
    expect(s.multiPlatformClaims).toEqual({ claims: 0, percent: 0 });
  });

  it("does not double-count a source that cited the same claim with several documents", () => {
    nextDocId = 1;
    const claims: SummaryClaim[] = [
      { hedging: "confirmed", docs: [doc(), doc(), doc()] },
      { hedging: "confirmed", docs: [doc({ sourceId: 2, sourceName: "Second" })] },
    ];
    const s = summarizeDigestSources(claims, null);
    expect(s.topSources).toEqual([
      { label: "Example News", claims: 1, sourceId: 1 },
      { label: "Second", claims: 1, sourceId: 2 },
    ]);
  });

  it("de-duplicates a document cited by two claims in the digest-wide totals", () => {
    nextDocId = 1;
    const shared = doc();
    const s = summarizeDigestSources(
      [
        { hedging: "confirmed", docs: [shared] },
        { hedging: "confirmed", docs: [shared] },
      ],
      null,
    );
    expect(s.documents).toBe(1);
    expect(s.claims).toBe(2);
  });

  it("counts single-document claims only when the hedging class is claimed or unverified", () => {
    nextDocId = 1;
    const s = summarizeDigestSources(
      [
        { hedging: "claimed", docs: [doc()] },
        { hedging: "UNVERIFIED", docs: [doc()] }, // case-insensitive
        { hedging: "unverified", docs: [doc(), doc()] }, // two documents: not single
        { hedging: "confirmed", docs: [doc()] },
        { hedging: "unknown", docs: [doc()] },
      ],
      null,
    );
    expect(s.singleDocumentWeakClaims).toBe(2);
    expect(s.text).toContain("2 claims rest on a single document carried as claimed or unverified.");
  });

  it("states the zero case positively rather than omitting the sentence", () => {
    nextDocId = 1;
    const s = summarizeDigestSources([{ hedging: "confirmed", docs: [doc()] }], null);
    expect(s.singleDocumentWeakClaims).toBe(0);
    expect(s.text).toContain(
      "No claim rests on a single document that ISW's vocabulary carries as claimed or unverified.",
    );
  });

  it("renders a defined statement for a digest with no claims", () => {
    const s = summarizeDigestSources([], null);
    expect(s.text).toBe(
      "This digest has no published claims, so there is nothing to summarize. " +
        "Source-mix figures were not recorded for this digest, so the platform and adapter cap " +
        "cannot be reported for it.",
    );
    expect(s.multiDocumentClaims).toEqual({ claims: 0, percent: 0 });
  });

  it("uses singular grammar for a one-source, one-claim, one-document digest", () => {
    nextDocId = 1;
    const s = summarizeDigestSources([{ hedging: "confirmed", docs: [doc()] }], null);
    expect(s.text).toContain(
      "This digest publishes 1 claim resting on 1 distinct document from 1 channel across 1 platform.",
    );
    expect(s.text).toContain("The source supporting the most claims is Example News (1 claim).");
  });

  it("orders top sources by claims supported, breaking ties by label", () => {
    nextDocId = 1;
    const s = summarizeDigestSources(
      [
        { hedging: "confirmed", docs: [doc({ sourceId: 1, sourceName: "Zulu" })] },
        { hedging: "confirmed", docs: [doc({ sourceId: 2, sourceName: "Alpha" })] },
        { hedging: "confirmed", docs: [doc({ sourceId: 3, sourceName: "Mike" })] },
        { hedging: "confirmed", docs: [doc({ sourceId: 3, sourceName: "Mike" })] },
      ],
      null,
    );
    expect(s.topSources).toEqual([
      { label: "Mike", claims: 2, sourceId: 3 },
      { label: "Alpha", claims: 1, sourceId: 2 },
      { label: "Zulu", claims: 1, sourceId: 1 },
    ]);
  });
});

describe("recorded source mix — fail-closed parsing", () => {
  it("reads the docsAnalyzed counts the legacy engine persists", () => {
    expect(readRecordedSourceMix(RECORDED_MIX)).toEqual({
      byAdapter: { rss: 40, telegram: 35, x: 25 },
      byPlatform: { independent_media: 40, telegram: 35, x: 25 },
    });
  });

  it("returns null for every malformed or absent record", () => {
    expect(readRecordedSourceMix(null)).toBeNull();
    expect(readRecordedSourceMix(undefined)).toBeNull();
    expect(readRecordedSourceMix({})).toBeNull();
    expect(readRecordedSourceMix([])).toBeNull();
    expect(readRecordedSourceMix("mapreduce")).toBeNull();
    // a mapreduce digest's stats block has no sourceMix key at all
    expect(readRecordedSourceMix({ docsRaw: { byAdapter: {}, byPlatform: {} } })).toBeNull();
    expect(readRecordedSourceMix({ docsAnalyzed: { byAdapter: { rss: 1 } } })).toBeNull();
    expect(
      readRecordedSourceMix({ docsAnalyzed: { byAdapter: { rss: -1 }, byPlatform: { x: 1 } } }),
    ).toBeNull();
    expect(
      readRecordedSourceMix({ docsAnalyzed: { byAdapter: { rss: "n" }, byPlatform: { x: 1 } } }),
    ).toBeNull();
    // an all-zero batch has no share to report
    expect(
      readRecordedSourceMix({ docsAnalyzed: { byAdapter: { rss: 0 }, byPlatform: { x: 0 } } }),
    ).toBeNull();
  });

  it("computes shares against the recorded batch total, not against the cap", () => {
    const fact = sourceMixFact({
      byAdapter: { rss: 60, telegram: 40 },
      byPlatform: { independent_media: 60, telegram: 40 },
    });
    expect(fact).toEqual({
      batchDocuments: 100,
      capPercent: 40,
      largestPlatform: { label: "independent_media", count: 60, percent: 60 },
      largestAdapter: { label: "rss", count: 60, percent: 60 },
    });
  });

  it("explains a recorded share above the ceiling instead of contradicting itself", () => {
    nextDocId = 1;
    // a monoculture day: selectSourceMix fills past the cap rather than sending a short batch
    const s = summarizeDigestSources(
      [{ hedging: "confirmed", docs: [doc()] }],
      readRecordedSourceMix({
        docsAnalyzed: { byAdapter: { rss: 90, x: 10 }, byPlatform: { independent_media: 90, x: 10 } },
      }),
    );
    expect(s.text).toContain("the largest platform share was 90% (independent_media)");
    expect(s.text).toContain(
      "A share above that ceiling means the day's corpus did not hold enough alternatives to " +
        "fill the batch within it, so the remaining slots were filled past the cap.",
    );
  });

  it("omits the over-cap explanation when every share sits within the ceiling", () => {
    nextDocId = 1;
    const s = summarizeDigestSources(
      [{ hedging: "confirmed", docs: [doc()] }],
      readRecordedSourceMix(RECORDED_MIX),
    );
    expect(s.text).not.toContain("A share above that ceiling");
  });

  it("is deterministic when two platforms tie for the largest share", () => {
    const fact = sourceMixFact({
      byAdapter: { zulu: 50, alpha: 50 },
      byPlatform: { zulu: 50, alpha: 50 },
    });
    expect(fact?.largestAdapter?.label).toBe("alpha");
    expect(fact?.largestPlatform?.label).toBe("alpha");
  });
});

describe("source summary — ruling 1 sentinel", () => {
  // The digest query selects rd.title and cl.text alongside the provenance columns, so a
  // caller can hand this template document titles and claim prose. Neither may reach the
  // output: the summary is counts and registry identities only (ruling 1 — no ISW prose and
  // no source full text in any user-facing output).
  const SENTINEL = "ZZQSENTINELPROSEZZQ";

  it("emits no document title, no document body and no claim prose", () => {
    nextDocId = 1;
    const claims = [
      {
        hedging: "confirmed",
        text: `Russian forces ${SENTINEL} advanced`,
        docs: [
          {
            ...doc({ title: `${SENTINEL} headline` }),
            content: `${SENTINEL} body`,
            takeaway: `${SENTINEL} ISW takeaway`,
          },
        ],
      },
    ] as unknown as SummaryClaim[];
    const s = summarizeDigestSources(claims, readRecordedSourceMix(RECORDED_MIX));
    expect(s.text).not.toContain(SENTINEL);
    for (const sentence of s.sentences) expect(sentence).not.toContain(SENTINEL);
    expect(JSON.stringify(s)).not.toContain(SENTINEL);
    // the registry identity IS what renders — that is the intended, non-prose field
    expect(s.text).toContain("Example News");
  });

  it("renders no reliability score even though every document carries one", () => {
    nextDocId = 1;
    const s = summarizeDigestSources(
      [{ hedging: "confirmed", docs: [doc({ reliability: 0.93 })] }],
      null,
    );
    expect(s.text).not.toContain("0.93");
    expect(JSON.stringify(s)).not.toContain("0.93");
  });
});
