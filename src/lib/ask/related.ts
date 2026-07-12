import { envNum } from "../usage/spend-guard";
import type { CandidateClaim } from "./types";

// ASK "Related claims" relevance floor (W4). The rerank stage returns EXACTLY
// ASK_EVIDENCE_K ids by construction (rerank.ts pins minItems=maxItems=k), so when a
// question only has a handful of genuinely relevant claims, ranks 9-60 are forced
// padding — composite-score filler, or an LLM listwise rank of candidates it was
// never given a "none of these" option to decline. Left unfiltered, the "Related
// claims" block (built from ranked.claims minus cited) surfaced that padding as if it
// were relevant (live smoke: Hamas/Cuba-class claims under Ukraine questions).
//
// Fix: a hard floor on vectorScore (the question<->claim cosine — the only
// mode-independent relevance signal on CandidateClaim; compositeScore also folds in
// recency/reliability, which say nothing about topical relevance). Calibrated against
// a disposable-branch replay of retrieveV2 over six probe questions (windowed +
// unwindowed): the highest vectorScore observed on a confirmed junk-class candidate
// (off-theater/off-topic, e.g. an Iran/Gulf missile-interception claim surfaced under
// a Kyiv-strike question, vectorScore 0.4547) sets the bar; the smallest floor that
// excludes it, rounded up to a clean 0.05 step, is 0.5.
//
// Candidates with vectorScore === null (lexical-only hits, or the ENTIRE pool in
// "v2-lexical-only" mode — no vector arm ran at all) are excluded outright, not
// scored against the floor: there is no mode-independent relevance number for them,
// and the operator ruling is explicit ("an empty related block is better than junk").
// Consequence, documented here because it is easy to miss: in v2-lexical-only mode
// the related block is ALWAYS empty.

/** Cap on the number of related claims ever returned, independent of the floor. */
export const RELATED_MAX = 5;

/** Default vectorScore floor (see the calibration note above). */
export const ASK_RELATED_MIN_SCORE_DEFAULT = 0.5;

/** Env-backed floor, ASK_RELATED_MIN_SCORE. Unlike config.ts's posInt (integers >= 1),
 *  this knob is a float that must stay inside [0, 1] (it is compared directly against
 *  a cosine similarity) — envNum's unset/NaN -> default handling is reused, then any
 *  in-range-but-nonsensical value (negative, or > 1) is rejected back to the default
 *  rather than clamped, so a bogus env can never turn the floor into a no-op (<=0) or
 *  an impossible-to-clear bar (>1). */
export function askRelatedMinScore(): number {
  const n = envNum("ASK_RELATED_MIN_SCORE", ASK_RELATED_MIN_SCORE_DEFAULT);
  return n >= 0 && n <= 1 ? n : ASK_RELATED_MIN_SCORE_DEFAULT;
}

/** Select the "Related claims" ids from the ranked evidence: uncited candidates
 *  with a scored vectorScore at or above the floor, in ranked (rerank/composite)
 *  order, capped at RELATED_MAX. Returns [] when nothing clears the bar — the UI
 *  omits the section entirely rather than render an empty heading. */
export function selectRelatedClaimIds(
  rankedClaims: CandidateClaim[],
  citedIds: Set<number>,
): number[] {
  const floor = askRelatedMinScore();
  const ids: number[] = [];
  for (const c of rankedClaims) {
    if (ids.length >= RELATED_MAX) break;
    if (citedIds.has(c.claimId)) continue;
    if (c.vectorScore == null || c.vectorScore < floor) continue;
    ids.push(c.claimId);
  }
  return ids;
}
