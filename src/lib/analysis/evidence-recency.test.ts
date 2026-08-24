import { describe, expect, it } from "vitest";
import {
  EVIDENCE_CLOCK_SKEW_MS,
  computeEvidenceRecency,
  percentile,
  type EvidenceRecencyDoc,
} from "./evidence-recency";

// Fixed clocks throughout — no wall-clock reads anywhere in this file.
const AS_OF = "2026-08-17T12:00:00.000Z";
const AS_OF_MS = Date.parse(AS_OF);
const GENERATED_AT = "2026-08-17T12:30:00.000Z";
const HOUR_MS = 3_600_000;

const iso = (ms: number) => new Date(ms).toISOString();
const doc = (
  id: number,
  publishedAt: string | Date | null,
  fetchedAt: string | Date | null,
): EvidenceRecencyDoc => ({ id, publishedAt, fetchedAt });

function compute(
  docs: EvidenceRecencyDoc[],
  claims: Array<{ docIds: number[] }>,
  over: Partial<{ asOf: string; generatedAt: string }> = {},
) {
  return computeEvidenceRecency({
    asOf: over.asOf ?? AS_OF,
    generatedAt: over.generatedAt ?? GENERATED_AT,
    claims,
    docs,
  });
}

describe("percentile (linear interpolation between closest ranks)", () => {
  it("returns null on an empty population", () => {
    expect(percentile([], 50)).toBeNull();
  });

  it("single value: every percentile is that value", () => {
    expect(percentile([5], 0)).toBe(5);
    expect(percentile([5], 50)).toBe(5);
    expect(percentile([5], 100)).toBe(5);
  });

  it("odd population: p50 is the middle element", () => {
    expect(percentile([3, 1, 2], 50)).toBe(2);
  });

  it("even population: p50 interpolates between the middle pair", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it("p90 interpolates between closest ranks", () => {
    // sorted 1..10: rank = 0.9 * 9 = 8.1 -> 9 + 0.1 * (10 - 9) = 9.1
    expect(percentile([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 90)).toBeCloseTo(9.1, 10);
  });

  it("duplicate-heavy population stays well-defined", () => {
    expect(percentile([2, 2, 2, 10], 50)).toBe(2);
    expect(percentile([2, 2, 2, 10], 100)).toBe(10);
  });

  it("boundary percentiles are min and max", () => {
    expect(percentile([4, 1, 7], 0)).toBe(1);
    expect(percentile([4, 1, 7], 100)).toBe(7);
  });
});

describe("evidence-time selection and fallback accounting", () => {
  it("valid published_at within the cutoff is the evidence time", () => {
    const s = compute([doc(1, iso(AS_OF_MS - 3 * HOUR_MS), iso(AS_OF_MS - HOUR_MS))], [{ docIds: [1] }]);
    expect(s.publishedTimestampUsed).toBe(1);
    expect(s.fetchedTimestampFallbackUsed).toBe(0);
    expect(s.medianEvidenceAgeHours).toBe(3);
  });

  it("missing/invalid published_at falls back to fetched_at", () => {
    const s = compute(
      [doc(1, null, iso(AS_OF_MS - 2 * HOUR_MS)), doc(2, "not-a-date", iso(AS_OF_MS - 4 * HOUR_MS))],
      [{ docIds: [1, 2] }],
    );
    expect(s.publishedTimestampUsed).toBe(0);
    expect(s.fetchedTimestampFallbackUsed).toBe(2);
    expect(s.futurePublishedTimestampCount).toBe(0); // invalid is not "future"
    expect(s.medianEvidenceAgeHours).toBe(3);
  });

  it("no usable timestamp at all is missing, and its claim is UNKNOWN, never stale", () => {
    const s = compute([doc(1, null, null)], [{ docIds: [1] }]);
    expect(s.missingTimestampCount).toBe(1);
    expect(s.timestampedDocumentCount).toBe(0);
    expect(s.timestampCoveragePct).toBe(0);
    expect(s.medianEvidenceAgeHours).toBeNull();
    expect(s.evidenceWithin24hPct).toBeNull();
    expect(s.staleClaimsOver48hPct).toBeNull(); // zero claims carry evidence
    expect(s.unknownAgeClaimPct).toBe(100);
  });

  it("a within-skew future published_at clamps its age to 0 and is not an anomaly", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS + EVIDENCE_CLOCK_SKEW_MS - 1000), null)],
      [{ docIds: [1] }],
    );
    expect(s.publishedTimestampUsed).toBe(1);
    expect(s.futurePublishedTimestampCount).toBe(0);
    expect(s.medianEvidenceAgeHours).toBe(0);
    expect(s.evidenceWithin24hPct).toBe(100);
  });

  it("published_at EXACTLY at asOf + skew is accepted (boundary pin: <= cutoff)", () => {
    const s = compute([doc(1, iso(AS_OF_MS + EVIDENCE_CLOCK_SKEW_MS), null)], [{ docIds: [1] }]);
    expect(s.publishedTimestampUsed).toBe(1);
    expect(s.futurePublishedTimestampCount).toBe(0);
    expect(s.medianEvidenceAgeHours).toBe(0); // future value clamps to age 0
  });

  it("a beyond-skew future published_at is counted and falls back to fetched_at", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS + EVIDENCE_CLOCK_SKEW_MS + 60_000), iso(AS_OF_MS - HOUR_MS))],
      [{ docIds: [1] }],
    );
    expect(s.futurePublishedTimestampCount).toBe(1);
    expect(s.publishedTimestampUsed).toBe(0);
    expect(s.fetchedTimestampFallbackUsed).toBe(1);
    expect(s.medianEvidenceAgeHours).toBe(1);
  });

  it("a beyond-skew future published_at with no usable fetched_at is missing", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS + HOUR_MS), iso(AS_OF_MS + HOUR_MS))],
      [{ docIds: [1] }],
    );
    expect(s.futurePublishedTimestampCount).toBe(1);
    expect(s.missingTimestampCount).toBe(1);
    expect(s.unknownAgeClaimPct).toBe(100);
  });

  it("timezone-offset timestamps parse as instants, never as strings", () => {
    // 12:00 +03:00 = 09:00Z -> 3h old at the 12:00Z cutoff
    const s = compute([doc(1, "2026-08-17T12:00:00+03:00", null)], [{ docIds: [1] }]);
    expect(s.publishedTimestampUsed).toBe(1);
    expect(s.medianEvidenceAgeHours).toBe(3);
  });

  it("accepts Date instances (driver-realistic) alongside strings", () => {
    const s = compute([doc(1, new Date(AS_OF_MS - 6 * HOUR_MS), null)], [{ docIds: [1] }]);
    expect(s.medianEvidenceAgeHours).toBe(6);
  });
});

describe("24h and 48h boundaries (exact)", () => {
  it("age of exactly 24h counts as within 24h; 24h + 1ms does not", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS - 24 * HOUR_MS), null), doc(2, iso(AS_OF_MS - 24 * HOUR_MS - 1), null)],
      [{ docIds: [1, 2] }],
    );
    expect(s.evidenceWithin24hPct).toBe(50);
  });

  it("a claim whose newest evidence is exactly 48h old is NOT stale", () => {
    const s = compute([doc(1, iso(AS_OF_MS - 48 * HOUR_MS), null)], [{ docIds: [1] }]);
    expect(s.staleClaimsOver48hPct).toBe(0);
  });

  it("48h + 1ms IS stale", () => {
    const s = compute([doc(1, iso(AS_OF_MS - 48 * HOUR_MS - 1), null)], [{ docIds: [1] }]);
    expect(s.staleClaimsOver48hPct).toBe(100);
  });
});

describe("claim/doc population semantics", () => {
  it("multiple claims sharing one doc: the doc counts once, both claims count", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS - 60 * HOUR_MS), null)],
      [{ docIds: [1] }, { docIds: [1] }],
    );
    expect(s.documentCount).toBe(1);
    expect(s.claimCount).toBe(2);
    expect(s.staleClaimsOver48hPct).toBe(100); // both claims stale on the shared doc
  });

  it("a claim with fresh + stale sources is judged on the NEWEST (not stale)", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS - 100 * HOUR_MS), null), doc(2, iso(AS_OF_MS - HOUR_MS), null)],
      [{ docIds: [1, 2] }],
    );
    expect(s.staleClaimsOver48hPct).toBe(0);
    expect(s.medianEvidenceAgeHours).toBe(50.5); // doc ages [100, 1] -> interpolated median
  });

  it("duplicate doc rows and duplicate docIds within a claim dedupe", () => {
    const d = doc(1, iso(AS_OF_MS - HOUR_MS), null);
    const s = compute([d, d], [{ docIds: [1, 1] }]);
    expect(s.documentCount).toBe(1);
    expect(s.timestampedDocumentCount).toBe(1);
  });

  it("mixed unknown and known claims split the percentages honestly", () => {
    const s = compute(
      [doc(1, iso(AS_OF_MS - HOUR_MS), null), doc(2, null, null)],
      [{ docIds: [1] }, { docIds: [2] }],
    );
    expect(s.unknownAgeClaimPct).toBe(50);
    expect(s.staleClaimsOver48hPct).toBe(0); // denominator = the 1 claim with evidence
    expect(s.timestampCoveragePct).toBe(50);
  });

  it("empty population: nulls where denominators vanish, 0 for unknownAgeClaimPct", () => {
    const s = compute([], []);
    expect(s.documentCount).toBe(0);
    expect(s.claimCount).toBe(0);
    expect(s.timestampCoveragePct).toBeNull();
    expect(s.medianEvidenceAgeHours).toBeNull();
    expect(s.p90EvidenceAgeHours).toBeNull();
    expect(s.evidenceWithin24hPct).toBeNull();
    expect(s.staleClaimsOver48hPct).toBeNull();
    expect(s.unknownAgeClaimPct).toBe(0);
    expect(s.medianIngestionLagHours).toBeNull();
  });
});

describe("ingestion lag (asOf-independent)", () => {
  it("computes nonneg lags, clamps within-skew negatives to 0, excludes invalid", () => {
    const t0 = AS_OF_MS - 10 * HOUR_MS;
    const s = compute(
      [
        doc(1, iso(t0), iso(t0 + 2 * HOUR_MS)), // lag 2h
        doc(2, iso(t0), iso(t0 - 2 * 60_000)), // -2min, within skew -> clamps to 0, counts
        doc(3, iso(t0), iso(t0 - HOUR_MS)), // -1h < -skew -> invalid, excluded
      ],
      [{ docIds: [1, 2, 3] }],
    );
    expect(s.invalidIngestionLagCount).toBe(1);
    expect(s.medianIngestionLagHours).toBe(1); // over [2, 0]
    expect(s.p90IngestionLagHours).toBeCloseTo(1.8, 10);
  });

  it("a lag of EXACTLY -skew clamps to 0 and counts (boundary pin: invalid is < -skew strictly)", () => {
    const t0 = AS_OF_MS - 10 * HOUR_MS;
    const s = compute([doc(1, iso(t0), iso(t0 - EVIDENCE_CLOCK_SKEW_MS))], [{ docIds: [1] }]);
    expect(s.invalidIngestionLagCount).toBe(0);
    expect(s.medianIngestionLagHours).toBe(0);
  });

  it("does not depend on asOf: the same docs under a different asOf keep the same lag stats", () => {
    const t0 = AS_OF_MS - 10 * HOUR_MS;
    const docs = [doc(1, iso(t0), iso(t0 + 3 * HOUR_MS))];
    const a = compute(docs, [{ docIds: [1] }]);
    const b = compute(docs, [{ docIds: [1] }], { asOf: iso(AS_OF_MS + 100 * HOUR_MS) });
    expect(a.medianIngestionLagHours).toBe(3);
    expect(b.medianIngestionLagHours).toBe(3);
  });
});

describe("asOf / generatedAt semantics", () => {
  it("generationLagHours is (generatedAt - asOf) at 2 decimals, clamped at 0", () => {
    const late = compute([], [], { generatedAt: iso(AS_OF_MS + 90 * 60_000) });
    expect(late.generationLagHours).toBe(1.5);
    const early = compute([], [], { generatedAt: iso(AS_OF_MS - HOUR_MS) });
    expect(early.generationLagHours).toBe(0);
  });

  it("rolling vs fixed-window asOf: the same evidence ages differently, deterministically", () => {
    const docs = [doc(1, iso(AS_OF_MS - 30 * HOUR_MS), null)];
    const dayEnd = compute(docs, [{ docIds: [1] }]); // fixed cutoff: 30h old
    const rolling = compute(docs, [{ docIds: [1] }], { asOf: iso(AS_OF_MS - 20 * HOUR_MS) });
    expect(dayEnd.medianEvidenceAgeHours).toBe(30);
    expect(rolling.medianEvidenceAgeHours).toBe(10);
    expect(dayEnd.evidenceWithin24hPct).toBe(0);
    expect(rolling.evidenceWithin24hPct).toBe(100);
  });

  it("historical regeneration stability: only generatedAt/generationLagHours move", () => {
    const docs = [
      doc(1, iso(AS_OF_MS - 30 * HOUR_MS), iso(AS_OF_MS - 29 * HOUR_MS)),
      doc(2, null, iso(AS_OF_MS - 2 * HOUR_MS)),
    ];
    const claims = [{ docIds: [1] }, { docIds: [2] }];
    const now = compute(docs, claims);
    const later = compute(docs, claims, { generatedAt: iso(AS_OF_MS + 200 * HOUR_MS) });
    const strip = (s: typeof now) =>
      Object.fromEntries(
        Object.entries(s).filter(([k]) => k !== "generatedAt" && k !== "generationLagHours"),
      );
    expect(strip(later)).toEqual(strip(now));
    expect(later.generatedAt).not.toBe(now.generatedAt);
    expect(later.generationLagHours).toBe(200);
  });

  it("throws on an unparseable asOf (engines always pass a computed instant)", () => {
    expect(() => compute([], [], { asOf: "yesterday-ish" })).toThrow(/valid ISO instants/);
  });
});
