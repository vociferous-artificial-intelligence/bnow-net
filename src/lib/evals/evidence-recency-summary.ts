// Evidence-recency probe for the reduce/digest eval (analysis-eval control
// plane, C2). Pure and fixture-only.
//
// INTEGRATION NOTE: the digest pipeline's canonical recency stats are produced
// by a SEPARATE worktree (persisted as digests `structured.stats.evidenceRecency`,
// shape EvidenceRecencyStatsV1, canonical module src/lib/analysis/evidence-recency.ts).
// That module does not exist on this branch (both branch from the same base), so
// the structural type below is a LOCAL minimal mirror of the agreed shape and
// this file computes a SUBSET of its fields (same names, same units) from
// fixture doc timestamp populations. The integration pass swaps the import to
// the canonical module and reconciles any field drift — which is why the
// helper is named evidenceRecencySummary and kept in its own file.

/** LOCAL structural mirror of the agreed cross-worktree shape. Field list is
 *  the contract; only the fields EvidenceRecencySummary computes are asserted
 *  by this eval. */
export interface EvidenceRecencyStatsV1Shape {
  version: 1;
  asOf: string;
  documentCount: number;
  claimCount: number;
  timestampedDocumentCount: number;
  timestampCoveragePct: number;
  medianEvidenceAgeHours: number | null;
  p90EvidenceAgeHours: number | null;
  evidenceWithin24hPct: number;
  staleClaimsOver48hPct: number;
  unknownAgeClaimPct: number;
  publishedTimestampUsed: number;
  fetchedTimestampFallbackUsed: number;
  missingTimestampCount: number;
  futurePublishedTimestampCount: number;
  medianIngestionLagHours: number | null;
  p90IngestionLagHours: number | null;
  invalidIngestionLagCount: number;
  generatedAt: string;
  generationLagHours: number;
}

export interface EvidenceRecencyDocInput {
  docId: number;
  /** ISO timestamp WITH explicit timezone, or null. A timezone-less value is
   *  treated as MISSING (deterministic — JS parses zone-less strings in local
   *  time, and llm-guard's override-UNTIL rule set the house precedent of
   *  refusing to guess a zone). */
  publishedAt: string | null;
  fetchedAt: string | null;
}

/** The subset of EvidenceRecencyStatsV1 this eval computes from fixtures. */
export interface EvidenceRecencySummary {
  asOf: string;
  documentCount: number;
  timestampedDocumentCount: number;
  timestampCoveragePct: number;
  medianEvidenceAgeHours: number | null;
  p90EvidenceAgeHours: number | null;
  evidenceWithin24hPct: number;
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

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Median (average of the two middles for even n). */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Nearest-rank p90: sorted ascending, index ceil(0.9 * n) - 1. */
function p90(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil(0.9 * s.length) - 1];
}

/**
 * Recency summary over a fixture doc population.
 *
 * Per-doc evidence timestamp: publishedAt when valid and not in the future of
 * asOf (future published timestamps are counted and EXCLUDED from age stats);
 * else fetchedAt (fallback counted); else missing. Ingestion lag = fetchedAt −
 * publishedAt in hours when both parse; a NEGATIVE lag (fetched before
 * published — clock skew or a republished old article) is counted invalid and
 * excluded from the lag stats.
 */
export function evidenceRecencySummary(
  docs: EvidenceRecencyDocInput[],
  asOf: string,
): EvidenceRecencySummary {
  const asOfMs = parseInstant(asOf);
  if (asOfMs === null) throw new Error(`evidenceRecencySummary: asOf needs an explicit timezone: ${asOf}`);

  let timestamped = 0;
  let publishedUsed = 0;
  let fetchedFallback = 0;
  let missing = 0;
  let futurePublished = 0;
  let invalidLag = 0;
  const ages: number[] = [];
  const lags: number[] = [];

  for (const d of docs) {
    const pub = parseInstant(d.publishedAt);
    const fet = parseInstant(d.fetchedAt);
    if (pub !== null || fet !== null) timestamped++;

    if (pub !== null && fet !== null) {
      const lagH = (fet - pub) / 3_600_000;
      if (lagH < 0) invalidLag++;
      else lags.push(lagH);
    }

    if (pub !== null && pub > asOfMs) {
      futurePublished++;
      // a future publish claim is not usable evidence age; fall through to
      // fetchedAt if available, else missing
      if (fet !== null) {
        fetchedFallback++;
        ages.push(Math.max(0, (asOfMs - fet) / 3_600_000));
      } else {
        missing++;
      }
      continue;
    }
    if (pub !== null) {
      publishedUsed++;
      ages.push((asOfMs - pub) / 3_600_000);
    } else if (fet !== null) {
      fetchedFallback++;
      ages.push(Math.max(0, (asOfMs - fet) / 3_600_000));
    } else {
      missing++;
    }
  }

  const medAge = median(ages);
  const p90Age = p90(ages);
  const medLag = median(lags);
  const p90Lag = p90(lags);
  const within24 = ages.filter((a) => a <= 24).length;

  return {
    asOf,
    documentCount: docs.length,
    timestampedDocumentCount: timestamped,
    timestampCoveragePct: docs.length > 0 ? round2((100 * timestamped) / docs.length) : 0,
    medianEvidenceAgeHours: medAge === null ? null : round2(medAge),
    p90EvidenceAgeHours: p90Age === null ? null : round2(p90Age),
    evidenceWithin24hPct: ages.length > 0 ? round2((100 * within24) / ages.length) : 0,
    publishedTimestampUsed: publishedUsed,
    fetchedTimestampFallbackUsed: fetchedFallback,
    missingTimestampCount: missing,
    futurePublishedTimestampCount: futurePublished,
    medianIngestionLagHours: medLag === null ? null : round2(medLag),
    p90IngestionLagHours: p90Lag === null ? null : round2(p90Lag),
    invalidIngestionLagCount: invalidLag,
  };
}
