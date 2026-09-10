// Contributor attribution for declared reference units (memo C3).
//
// C3 is the decision that removes the RU/UA double count, and it does it by
// CHANGING WHAT THEATER MEANS at this boundary: `classifyTakeawayTheater`
// becomes an ATTRIBUTION recorded beside the result — "which contributor lens
// would be expected to cover this unit" — and is NEVER a filter. The
// denominator is every declared Key Takeaway of the selected edition; nothing
// here removes a unit from it, and nothing here narrows the evidence a unit may
// be matched against.
//
// Why not `classifyTakeawayTheater` directly: it is hard-bound to ru-ua-v1 and
// returns only `ru | ua | both` (gazetteer/ru-ua-v1.ts:109-121), so an Iran
// edition would come back `both` for every unit with no way to tell that from a
// genuine multi-theater bullet. `classifyTheaterWith(gazetteerFor(series), …)`
// is the versioned form of the same function and covers both vocabularies; for
// ROCA it is behaviourally the RU/UA one.
//
// UNATTRIBUTED IS ITS OWN VALUE, and that is the load-bearing detail today.
// `classifyTheaterWith` returns `"both"` for a unit whose toponyms it does not
// recognise — the same value a genuinely cross-theater unit gets. That
// conflation matters right now: until the WS3-F05 fix lands, the stored
// `derived.units[].toponyms` for an IRAN edition are computed under the RU/UA
// gazetteer (isw-extract.ts's extractSignature binds ru-ua-v1), so essentially
// every Iran unit arrives with an EMPTY toponym list. Emitting `both` there
// would silently record "spans every contributor" for what is really "we did
// not look with the right vocabulary". `unattributed` says the true thing, and
// it says it in the row rather than only in a report.

import { classifyTheaterWith, gazetteerFor } from "../validation/gazetteer";
import type { EditionUnitSignature } from "./editions";

/** Attribution for a unit whose signature carries no recognised toponym at all
 *  — distinct from `both`, which means "recognised toponyms spanning more than
 *  one contributor". */
export const UNATTRIBUTED = "unattributed" as const;

/**
 * Attribution for ONE unit's stored toponym signature.
 *
 * `series` is the reference series id (`roca` / `iran_update`), which is what
 * `gazetteerFor` accepts; it is deliberately not a theater iso2 code.
 */
export function attributionFor(series: string, toponyms: readonly string[]): string {
  if (toponyms.length === 0) return UNATTRIBUTED;
  return classifyTheaterWith(gazetteerFor(series), toponyms);
}

/**
 * Build the observation's `unit_attribution` map.
 *
 * Units are joined to their stored signatures by `sha256` FIRST and `ordinal`
 * second — never by the signature tokens themselves, which are exactly the
 * thing that changes when a gazetteer version changes. A unit with no matching
 * signature (the edition row predates the derivation, or the page moved between
 * discovery and scoring) is recorded `unattributed` rather than omitted: an
 * absent key would read as "no unit", a present `unattributed` reads as "unit
 * seen, attribution unavailable".
 */
export function unitAttributionMap(
  series: string,
  units: readonly { unitId: string; ordinal: number; sha256: string }[],
  signatures: readonly EditionUnitSignature[],
): Record<string, string> {
  const byHash = new Map<string, EditionUnitSignature>();
  const byOrdinal = new Map<number, EditionUnitSignature>();
  for (const sig of signatures) {
    if (!byHash.has(sig.sha256)) byHash.set(sig.sha256, sig);
    if (!byOrdinal.has(sig.ordinal)) byOrdinal.set(sig.ordinal, sig);
  }
  const out: Record<string, string> = {};
  for (const unit of units) {
    const sig = byHash.get(unit.sha256) ?? byOrdinal.get(unit.ordinal) ?? null;
    out[unit.unitId] = sig === null ? UNATTRIBUTED : attributionFor(series, sig.toponyms);
  }
  return out;
}
