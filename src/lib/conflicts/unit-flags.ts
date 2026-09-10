// Per-unit compound/negative derivation for live reference units (memo C13,
// signed as part of D4).
//
// The matcher contract takes `compound` and `negative` per declared unit
// (match-contract.ts:115-118). The FIXTURE corpus carries them as authored
// labels; a live ISW edition carries no labels at all, so the live pipeline has
// to derive them — and C13 is explicit about how honest that derivation is
// allowed to pretend to be:
//
//   * `negative` ships as a DEFLATIONARY heuristic. It fires only on explicit
//     absence/denial phrasing, and a false negative (missing one) costs
//     nothing: the unit is then scored ordinarily. A false POSITIVE would make
//     the keyword rung refuse to match a unit it could have matched
//     (keyword-matcher.ts:113 skips negative units), which is a miss — the
//     deflationary direction.
//
//   * `compound` ships UNDETERMINED, hard-wired `false`. There is no calibrated
//     splitter, and guessing would be the OVER-CREDIT direction: `compound:
//     true` downgrades a full match to `partial` (a miss in the headline), so
//     `false` is the direction that credits more. C13 accepts that on ONE
//     binding condition, restated here because this file is where it is
//     created: **no number produced under `unit-flags-v0` may leave the
//     internal view** — not to a customer, not onto /scoreboard, not into a
//     report figure. Every observation stamps `unit_flags_version` so the view
//     can label such rows "compound handling undetermined — not soak-eligible".
//
// A human-calibrated `compound-v1` is a WS-3.6 prerequisite, and it will be a
// NEW version string, never an edit to v0: a shipped derivation must stay
// reconstructible.

/** The derivation version stamped onto every observation. Bump — never edit —
 *  when either heuristic changes; two versions' flags must never be compared. */
export const UNIT_FLAGS_VERSION = "unit-flags-v0" as const;

export interface UnitFlags {
  compound: boolean;
  negative: boolean;
}

/** Explicit absence/denial phrasing only. Each pattern names a construction
 *  ISW actually uses for a "nothing happened" takeaway; anything requiring
 *  interpretation is deliberately absent, because a false positive suppresses
 *  a matchable unit. */
const NEGATIVE_PATTERNS: readonly RegExp[] = [
  /\bno\s+(?:confirmed|significant|notable|reported|verified)\b/i,
  /\bdid\s+not\s+(?:advance|conduct|occur|report|make)\b/i,
  /\bthere\s+were\s+no\b/i,
  /\bno\s+(?:changes?|advances?|attacks?|strikes?|activity)\s+(?:were|was|reported|occurred|assessed)\b/i,
  /\bdenied\b/i,
  /\bno\s+(?:new|further)\s+\w+\s+(?:were|was)\s+(?:reported|confirmed|assessed|observed)\b/i,
];

/**
 * Derive the two flags for one declared reference unit.
 *
 * Total and pure: any string returns a value, and the same string always
 * returns the same value, so a re-run of the same day under the same version
 * cannot flip a flag (which the shadow soak's variance instrument depends on —
 * a verdict flip must mean the MATCHER moved, not the derivation).
 */
export function deriveUnitFlags(text: string): UnitFlags {
  return {
    // C13: UNDETERMINED, not "no compound units exist". The stamp is what
    // carries the caveat; see the header for the binding condition.
    compound: false,
    negative: NEGATIVE_PATTERNS.some((p) => p.test(text)),
  };
}
