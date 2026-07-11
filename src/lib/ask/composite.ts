import type { RetrievalMode } from "./types";

// Composite pre-rank score = semantic x recencyDecay x reliabilityFactor.
// Pure and deterministic: it orders the candidate pool handed to the rerank
// stage AND is the rerank-failure fallback order (types.ts CandidateClaim). No
// DB, no clock beyond the injected `now` — trivially unit-testable.

/** Semantic stand-in for a candidate the vector arm did NOT score — a lexical-
 *  only hit while the vector arm was live. Deliberately mid-band: below a strong
 *  cosine similarity (real matches sit ~0.7-0.9) so a bare keyword hit ranks
 *  beneath a genuine semantic match, but well above 0 so a fresh, reliable
 *  keyword hit can still out-rank a stale vector match. */
export const LEXICAL_ONLY_SEMANTIC = 0.55;

/** Recency half-life in days: a claim's recency weight halves every 30 days of
 *  age. Matches the corpus cadence (daily digests, a few weeks of live data). */
export const RECENCY_HALF_LIFE_DAYS = 30;

/** Recency weight for an undated claim — it can't be aged, so damp it to about a
 *  two-half-life-old dated claim (0.5^2 = 0.25) rather than trusting it as fresh
 *  or discarding it entirely. */
export const NULL_DATE_DECAY = 0.25;

/** Scoring inputs pulled from a CandidateClaim (types.ts). */
export interface CandidateScoreInput {
  vectorScore: number | null;
  lexicalHit: boolean;
  claimDate: string | null;
  confidence: number | null;
}

/** Whole-UTC-day age of a yyyy-mm-dd claim date vs `now`, floored at 0 (a future
 *  date can't make a claim "more than fresh"). Pure UTC — no local-tz leakage. */
function ageDays(claimDate: string, now: Date): number {
  const [y, m, d] = claimDate.split("-").map(Number);
  const claimUtc = Date.UTC(y, m - 1, d);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayUtc - claimUtc) / 86_400_000);
  return days > 0 ? days : 0;
}

/**
 * compositeScore = semantic x recencyDecay x reliabilityFactor.
 *  - semantic: vectorScore when present, else LEXICAL_ONLY_SEMANTIC; in
 *    "v2-lexical-only" mode there is no vector arm at all, so semantic is 1 for
 *    every candidate (recency x reliability drive the order).
 *  - recencyDecay: 0.5^(ageDays / RECENCY_HALF_LIFE_DAYS); NULL_DATE_DECAY when undated.
 *  - reliabilityFactor: 0.5 + 0.5 x confidence (confidence null -> 0.5 neutral),
 *    so it spans [0.5, 1.0] and never zeroes a candidate out.
 */
export function scoreCandidate(c: CandidateScoreInput, now: Date, mode: RetrievalMode): number {
  const semantic = mode === "v2-lexical-only" ? 1 : (c.vectorScore ?? LEXICAL_ONLY_SEMANTIC);
  const recencyDecay =
    c.claimDate === null ? NULL_DATE_DECAY : 0.5 ** (ageDays(c.claimDate, now) / RECENCY_HALF_LIFE_DAYS);
  const reliabilityFactor = 0.5 + 0.5 * (c.confidence ?? 0.5);
  return semantic * recencyDecay * reliabilityFactor;
}
