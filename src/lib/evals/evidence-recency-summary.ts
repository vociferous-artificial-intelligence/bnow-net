// Evidence-recency probe for the reduce/digest eval (analysis-eval control
// plane, C2). Pure and fixture-only.
//
// INTEGRATION (2026-08-17): this file is now a thin adapter over the CANONICAL
// digest-pipeline calculator (src/lib/analysis/evidence-recency.ts, Worktree A
// — the module that persists digests structured.stats.evidenceRecency). The
// original local mirror was authored against the agreed shape while the two
// worktrees shared a base; the integration swap surfaced exactly the drift the
// hand-computed fixture pins were designed to catch — the canonical percentile
// is LINEAR INTERPOLATION between closest ranks (the mirror used nearest-rank
// p90), and the canonical future/negative-lag rules apply a 5-minute clock-skew
// tolerance. The fixture pins were re-derived under the canonical arithmetic in
// the same change (new case ids per the dataset immutability contract).
//
// What this adapter KEEPS from the eval side: the explicit-timezone input
// guard. Fixture timestamps are hand-authored STRINGS; a timezone-less string
// parses in machine-local time under JS Date semantics, which would make eval
// verdicts machine-dependent. Production never hits this (the persist path
// feeds DB-driver values), so the guard lives here, not in the canonical
// module: zone-less values are nulled BEFORE the canonical calculator runs.

import {
  computeEvidenceRecency,
  type EvidenceRecencyStatsV1,
} from "../analysis/evidence-recency";

export type { EvidenceRecencyStatsV1 };

export interface EvidenceRecencyDocInput {
  docId: number;
  /** ISO timestamp WITH explicit timezone, or null. A timezone-less value is
   *  treated as MISSING (deterministic — JS parses zone-less strings in local
   *  time, and llm-guard's override-UNTIL rule set the house precedent of
   *  refusing to guess a zone). */
  publishedAt: string | null;
  fetchedAt: string | null;
}

/** The subset of EvidenceRecencyStatsV1 this eval computes from fixtures.
 *  Field names, units, and semantics are the canonical module's; nullable
 *  coverage/within-24h follow the canonical no-denominator-means-null rule. */
export interface EvidenceRecencySummary {
  asOf: string;
  documentCount: number;
  timestampedDocumentCount: number;
  timestampCoveragePct: number | null;
  medianEvidenceAgeHours: number | null;
  p90EvidenceAgeHours: number | null;
  evidenceWithin24hPct: number | null;
  publishedTimestampUsed: number;
  fetchedTimestampFallbackUsed: number;
  missingTimestampCount: number;
  futurePublishedTimestampCount: number;
  medianIngestionLagHours: number | null;
  p90IngestionLagHours: number | null;
  invalidIngestionLagCount: number;
}

/** Explicit-timezone instant parse: null for absent/zone-less/unparseable. */
export function parseInstant(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = iso.trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(t)) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

const msToIso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/**
 * Recency summary over a fixture doc population, computed by the CANONICAL
 * calculator: published-first with the canonical 5-minute skew tolerance
 * (within-skew future clamps to age 0; beyond-skew is the anomaly counter with
 * fetched fallback), ages clamped non-negative, ingestion lag clamped in
 * [-skew, 0) and invalid below it, linear-interpolation percentiles. The
 * explicit-timezone guard above runs FIRST, so zone-less fixture strings are
 * absent, never machine-local instants.
 */
export function evidenceRecencySummary(
  docs: EvidenceRecencyDocInput[],
  asOf: string,
): EvidenceRecencySummary {
  const asOfMs = parseInstant(asOf);
  if (asOfMs === null) throw new Error(`evidenceRecencySummary: asOf needs an explicit timezone: ${asOf}`);
  const asOfIso = new Date(asOfMs).toISOString();

  const stats: EvidenceRecencyStatsV1 = computeEvidenceRecency({
    asOf: asOfIso,
    // the summary has no persist instant; generation lag is not part of this
    // eval's assertions, so the honest neutral value is asOf itself (lag 0)
    generatedAt: asOfIso,
    // one synthetic claim per doc keeps the doc-level population exact; the
    // claim-level fields exist in the canonical result but are not summarized
    claims: docs.map((d) => ({ docIds: [d.docId] })),
    docs: docs.map((d) => ({
      id: d.docId,
      publishedAt: msToIso(parseInstant(d.publishedAt)),
      fetchedAt: msToIso(parseInstant(d.fetchedAt)),
    })),
  });

  return {
    asOf,
    documentCount: stats.documentCount,
    timestampedDocumentCount: stats.timestampedDocumentCount,
    timestampCoveragePct: stats.timestampCoveragePct,
    medianEvidenceAgeHours: stats.medianEvidenceAgeHours,
    p90EvidenceAgeHours: stats.p90EvidenceAgeHours,
    evidenceWithin24hPct: stats.evidenceWithin24hPct,
    publishedTimestampUsed: stats.publishedTimestampUsed,
    fetchedTimestampFallbackUsed: stats.fetchedTimestampFallbackUsed,
    missingTimestampCount: stats.missingTimestampCount,
    futurePublishedTimestampCount: stats.futurePublishedTimestampCount,
    medianIngestionLagHours: stats.medianIngestionLagHours,
    p90IngestionLagHours: stats.p90IngestionLagHours,
    invalidIngestionLagCount: stats.invalidIngestionLagCount,
  };
}
