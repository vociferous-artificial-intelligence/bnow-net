// Evidence-recency contract (quality foundation, 2026-08-17): a pure calculator
// over the exact POST-publication-guard event/claim shape a digest persists —
// how old the cited evidence was at the digest's effective analysis cutoff
// (asOf), how much of it carries a usable timestamp at all, and how far behind
// publication our own ingestion ran. Computed once per persist inside
// persistDigest (the ONE shared publication boundary), so both engines get it
// automatically; each engine passes an honest asOf and this module never reads
// a wall clock itself — generatedAt is injected by the persist path.
//
// INTERNAL and UNCALIBRATED: these are operator observability numbers, not a
// product score. Nothing here feeds a headline metric or a composite.
//
// Time rules (each unit-tested in evidence-recency.test.ts):
//   - published_at is the evidence time when valid and <= asOf + skew (a
//     within-skew future value clamps its age to 0). Beyond the skew it is an
//     anomaly (futurePublishedTimestampCount) and the doc falls back to
//     fetched_at under the same cutoff rule; no usable timestamp = missing.
//   - ages are max(0, asOf - evidenceTime); unusable docs stay OUT of every
//     age denominator and surface via the coverage/unknown fields instead.
//   - a claim's staleness uses the NEWEST usable evidence time among its docs;
//     stale iff asOf - newest > 48h STRICTLY (exactly 48.0h is not stale);
//     within-24h iff age <= 24h exactly; no usable time = UNKNOWN, never stale.
//   - ingestion lag = fetched_at - published_at whenever both parse, asOf-
//     independent; lag in [-skew, 0) clamps to 0 and counts; lag < -skew is
//     invalid and excluded from the lag stats.

import { toInstant } from "../time/day-boundary";

/** Clock-skew tolerance for "future" timestamps: source clocks and ours drift
 *  by seconds-to-minutes; a published_at within this window past asOf is
 *  ordinary skew (age clamps to 0), beyond it is an anomaly. Used for every
 *  cutoff and lag comparison — no ad hoc arithmetic. */
export const EVIDENCE_CLOCK_SKEW_MS = 5 * 60_000;

const HOUR_MS = 3_600_000;

/** Persisted as digests.structured.stats.evidenceRecency (additive; no
 *  migration). Docs are DISTINCT non-stub raw documents cited by the
 *  post-guard persisted claims; claims are the post-guard persisted claims. */
export interface EvidenceRecencyStatsV1 {
  version: 1;
  asOf: string; // ISO instant — the effective analysis cutoff of this digest invocation
  generatedAt: string; // ISO instant — wall clock at persist time (regeneration diagnostic, NOT an age input)
  generationLagHours: number; // (generatedAt - asOf)/3600e3, >= 0 (clamp negatives to 0), 2 decimals — flags late manual regenerations
  documentCount: number; // DISTINCT non-stub raw documents linked to post-guard persisted claims (counted once per digest/track)
  claimCount: number; // post-guard persisted claims
  timestampedDocumentCount: number; // distinct docs with a usable evidence timestamp at asOf
  timestampCoveragePct: number | null; // timestampedDocumentCount/documentCount*100; null when documentCount=0
  medianEvidenceAgeHours: number | null; // over distinct timestamped docs
  p90EvidenceAgeHours: number | null;
  evidenceWithin24hPct: number | null; // denominator = timestamped distinct docs; null when none
  staleClaimsOver48hPct: number | null; // denominator = claims with >=1 usable evidence timestamp; null when none
  unknownAgeClaimPct: number; // claims with NO usable evidence timestamp / claimCount * 100; 0 when claimCount=0
  publishedTimestampUsed: number; // distinct docs whose evidence time came from published_at
  fetchedTimestampFallbackUsed: number; // distinct docs that fell back to fetched_at
  missingTimestampCount: number; // distinct docs with NO timestamp usable at asOf (absent, invalid, or beyond the skew-tolerated cutoff)
  futurePublishedTimestampCount: number; // distinct docs whose published_at exceeded asOf + skew tolerance
  medianIngestionLagHours: number | null; // over docs with valid nonneg (within skew) fetched_at - published_at
  p90IngestionLagHours: number | null;
  invalidIngestionLagCount: number; // docs where both timestamps exist but lag < -skew
}

/** One cited raw document's timestamps, driver-shaped (the Neon driver returns
 *  timestamptz as Date instances; tests and text casts pass strings). */
export interface EvidenceRecencyDoc {
  id: number;
  publishedAt: Date | string | null;
  fetchedAt: Date | string | null;
}

export interface EvidenceRecencyInput {
  /** ISO instant; must parse — the caller (an engine) computes it, never a
   *  default wall clock */
  asOf: string;
  /** ISO instant; wall clock read by persistDigest at persist time */
  generatedAt: string;
  /** the POST-guard persisted claims (docIds only are read) */
  claims: Array<{ docIds: number[] }>;
  /** the distinct cited docs, already stub-excluded at the query level */
  docs: EvidenceRecencyDoc[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Percentile by linear interpolation between closest ranks (the one method
 *  every median/p90 here uses): rank = p/100 * (n-1) over the ascending sort,
 *  fractional ranks interpolate linearly. null on an empty population. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

interface DocVerdict {
  /** evidence instant (ms) when usable at asOf, else null */
  evidenceMs: number | null;
  usedPublished: boolean;
  usedFetched: boolean;
  /** published_at parsed but exceeded asOf + skew */
  futurePublished: boolean;
}

/** Per-doc evidence-time selection under the asOf + skew cutoff. */
function docVerdict(doc: EvidenceRecencyDoc, asOfMs: number): DocVerdict {
  const cutoff = asOfMs + EVIDENCE_CLOCK_SKEW_MS;
  const published = toInstant(doc.publishedAt)?.getTime() ?? null;
  const fetched = toInstant(doc.fetchedAt)?.getTime() ?? null;
  if (published !== null && published <= cutoff) {
    return { evidenceMs: published, usedPublished: true, usedFetched: false, futurePublished: false };
  }
  const futurePublished = published !== null; // parsed, but beyond the cutoff
  if (fetched !== null && fetched <= cutoff) {
    return { evidenceMs: fetched, usedPublished: false, usedFetched: true, futurePublished };
  }
  return { evidenceMs: null, usedPublished: false, usedFetched: false, futurePublished };
}

/** Compute the v1 evidence-recency stats. Pure and deterministic: same inputs,
 *  same output — a historical regeneration with identical claims/docs/asOf
 *  yields identical age stats; only generatedAt/generationLagHours move. */
export function computeEvidenceRecency(input: EvidenceRecencyInput): EvidenceRecencyStatsV1 {
  const asOf = toInstant(input.asOf);
  const generatedAt = toInstant(input.generatedAt);
  if (!asOf || !generatedAt) {
    throw new Error("evidence-recency: asOf and generatedAt must be valid ISO instants");
  }
  const asOfMs = asOf.getTime();

  // per-doc verdicts, one per DISTINCT doc id (defensive dedup)
  const verdicts = new Map<number, DocVerdict>();
  let publishedTimestampUsed = 0;
  let fetchedTimestampFallbackUsed = 0;
  let missingTimestampCount = 0;
  let futurePublishedTimestampCount = 0;
  const ageHours: number[] = []; // usable docs only
  let within24 = 0;
  const lagHours: number[] = []; // asOf-independent ingestion lags
  let invalidIngestionLagCount = 0;

  for (const doc of input.docs) {
    if (verdicts.has(doc.id)) continue;
    const v = docVerdict(doc, asOfMs);
    verdicts.set(doc.id, v);
    if (v.usedPublished) publishedTimestampUsed++;
    if (v.usedFetched) fetchedTimestampFallbackUsed++;
    if (v.evidenceMs === null) missingTimestampCount++;
    if (v.futurePublished) futurePublishedTimestampCount++;
    if (v.evidenceMs !== null) {
      const ageMs = Math.max(0, asOfMs - v.evidenceMs);
      ageHours.push(ageMs / HOUR_MS);
      if (ageMs <= 24 * HOUR_MS) within24++;
    }
    // ingestion lag needs both timestamps to parse; validity only, no asOf
    const published = toInstant(doc.publishedAt)?.getTime() ?? null;
    const fetched = toInstant(doc.fetchedAt)?.getTime() ?? null;
    if (published !== null && fetched !== null) {
      const lagMs = fetched - published;
      if (lagMs < -EVIDENCE_CLOCK_SKEW_MS) invalidIngestionLagCount++;
      else lagHours.push(Math.max(0, lagMs) / HOUR_MS);
    }
  }

  const documentCount = verdicts.size;
  const timestampedDocumentCount = documentCount - missingTimestampCount;

  // per-claim staleness on the NEWEST usable evidence time among its docs
  const claimCount = input.claims.length;
  let unknownAgeClaims = 0;
  let claimsWithEvidence = 0;
  let staleClaims = 0;
  for (const claim of input.claims) {
    let newestMs: number | null = null;
    for (const docId of new Set(claim.docIds)) {
      const v = verdicts.get(docId);
      if (v?.evidenceMs != null) {
        newestMs = newestMs === null ? v.evidenceMs : Math.max(newestMs, v.evidenceMs);
      }
    }
    if (newestMs === null) {
      unknownAgeClaims++; // no usable evidence timestamp — UNKNOWN, never stale
      continue;
    }
    claimsWithEvidence++;
    if (asOfMs - newestMs > 48 * HOUR_MS) staleClaims++;
  }

  return {
    version: 1,
    asOf: asOf.toISOString(),
    generatedAt: generatedAt.toISOString(),
    generationLagHours: round2(Math.max(0, generatedAt.getTime() - asOfMs) / HOUR_MS),
    documentCount,
    claimCount,
    timestampedDocumentCount,
    timestampCoveragePct:
      documentCount === 0 ? null : round2((timestampedDocumentCount / documentCount) * 100),
    medianEvidenceAgeHours: ageHours.length ? round2(percentile(ageHours, 50)!) : null,
    p90EvidenceAgeHours: ageHours.length ? round2(percentile(ageHours, 90)!) : null,
    evidenceWithin24hPct: ageHours.length ? round2((within24 / ageHours.length) * 100) : null,
    staleClaimsOver48hPct:
      claimsWithEvidence === 0 ? null : round2((staleClaims / claimsWithEvidence) * 100),
    unknownAgeClaimPct: claimCount === 0 ? 0 : round2((unknownAgeClaims / claimCount) * 100),
    publishedTimestampUsed,
    fetchedTimestampFallbackUsed,
    missingTimestampCount,
    futurePublishedTimestampCount,
    medianIngestionLagHours: lagHours.length ? round2(percentile(lagHours, 50)!) : null,
    p90IngestionLagHours: lagHours.length ? round2(percentile(lagHours, 90)!) : null,
    invalidIngestionLagCount,
  };
}
