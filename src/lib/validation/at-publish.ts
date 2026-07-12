// "Evidence in hand at ISW publish" — the dual-coverage metric (analyst-trust
// sprint 2026-07-12, ruling R6; audit in docs/reviews/ANALYST-TRUST-NOTE-2026-07-12.md §④).
//
// The stored coverage_pct scores our FINALIZED digest (written 02:00 UTC D+1)
// against ISW's report dated D — but ISW publishes late evening ET on D, before
// our finalize. This metric answers the apples-to-apples question: of the same
// takeaway set, how many did we match with a claim whose supporting evidence was
// already INGESTED (raw_documents.fetched_at, not the source's own publish claim)
// before ISW's publish instant? It is a lower bound on what an at-publish digest
// could have contained — evidence-based, not a digest snapshot (snapshots don't
// exist; the true snapshot design is parked in docs/designs/ISW-CUTOFF-SCORING.md).
//
// Deterministic and $0: computed from stored matches + durable document
// timestamps, never by re-running the paid matcher. Shared by scoring
// (src/lib/validation/score.ts, forward path) and the one-off backfill script
// (scripts/backfill-at-publish.ts) so both apply exactly the same rule.

export interface AtPublishAgreement {
  /** Earliest fetched_at across the matched claim's supporting documents. */
  earliestFetchedAt?: string | Date | null;
}

export interface AtPublishResult {
  /** matchedBefore/denominator ×100, rounded like coverage_pct; null if denominator 0. */
  coveragePct: number | null;
  /** Agreements whose evidence was fully in-corpus before ISW published. */
  matchedBefore: number;
  /** All agreements in the run (= the final coverage numerator). */
  matchedTotal: number;
  iswPublishedAt: string;
}

/**
 * Returns null when ISW's publish instant is unknown/invalid — the metric is
 * undefined rather than fabricated. An agreement with an unknown evidence
 * timestamp does NOT count as "in hand" (conservative).
 */
export function computeAtPublish(
  iswPublishedAt: Date | string | null,
  agreements: AtPublishAgreement[],
  denominator: number,
): AtPublishResult | null {
  if (iswPublishedAt == null) return null;
  const publishedMs =
    iswPublishedAt instanceof Date ? iswPublishedAt.getTime() : new Date(iswPublishedAt).getTime();
  if (Number.isNaN(publishedMs)) return null;

  let matchedBefore = 0;
  for (const a of agreements) {
    if (a.earliestFetchedAt == null) continue;
    const fetchedMs =
      a.earliestFetchedAt instanceof Date
        ? a.earliestFetchedAt.getTime()
        : new Date(a.earliestFetchedAt).getTime();
    if (!Number.isNaN(fetchedMs) && fetchedMs <= publishedMs) matchedBefore++;
  }

  return {
    coveragePct: denominator > 0 ? +((matchedBefore / denominator) * 100).toFixed(1) : null,
    matchedBefore,
    matchedTotal: agreements.length,
    iswPublishedAt: new Date(publishedMs).toISOString(),
  };
}
