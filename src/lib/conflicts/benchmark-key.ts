// Bijective edition-key ⇄ benchmark URL-key encoding (PLAN-WS-3 §3.5a).
//
// The fixture-backed surfaces addressed a benchmark record by its GOLDEN key
// (`product-view.ts:69`, `#` → `~`). The DB-backed view addresses a real
// reference EDITION, whose key is `<series>:<reportDate>:<label>`
// (`editions.ts:168`) — and `product-view.ts:73`'s `BENCHMARK_KEY_SHAPE` admits
// neither `:` nor `_`, so the edition key needs its own URL form. That form is
// designed to satisfy the SAME shape constant, so the route's key grammar does
// not widen: `roca:2026-03-05:daily` → `roca-2026-03-05-daily`,
// `iran_update:2026-03-05:evening` → `iran-update-2026-03-05-evening`.
//
// WHY IT IS BIJECTIVE AND NOT MERELY REVERSIBLE-LOOKING. Both halves read the
// SAME two closed tables — `REFERENCE_SERIES_IDS` and, per series,
// `NORMALIZED_EDITION_LABELS` — so encode and decode cannot drift when a
// normalization label is added. The middle segment is a fixed-width
// `yyyy-mm-dd`, which is what makes the split unambiguous even though `-` is
// also the series separator. Every other input is REFUSED (null / typed
// throw): an unknown series, a label the normalization table cannot produce,
// a malformed day, or the reserved fixture-only `final` label. A key this
// module cannot have MINTED is a key it will not decode.
//
// Pure: no IO, no DB, no env.

import {
  FIXTURE_FINAL_LABEL,
  NORMALIZED_EDITION_LABELS,
} from "./editions";
import { ConflictDomainError } from "./errors";
import { isIsoDay } from "./instants";
import { REFERENCE_SERIES_IDS, isReferenceSeriesId, type ReferenceSeriesId } from "./vocabulary";

/** `_` is not admissible in a benchmark URL key, so the series id is spelled
 *  with `-`. Built from the vocabulary rather than written out, so a new series
 *  cannot be added to one side only. */
export const SERIES_URL_SLUGS: Readonly<Record<ReferenceSeriesId, string>> = Object.freeze(
  Object.fromEntries(REFERENCE_SERIES_IDS.map((s) => [s, s.replace(/_/g, "-")])),
) as Readonly<Record<ReferenceSeriesId, string>>;

/** Reverse table. Built once and asserted INJECTIVE at module load: two series
 *  ids that collapsed to one slug (`a_b` and `a-b`) would make decoding
 *  ambiguous, which is exactly the failure this module exists to prevent. */
const SERIES_BY_SLUG: ReadonlyMap<string, ReferenceSeriesId> = (() => {
  const map = new Map<string, ReferenceSeriesId>();
  for (const series of REFERENCE_SERIES_IDS) {
    const slug = SERIES_URL_SLUGS[series];
    if (map.has(slug)) {
      throw new ConflictDomainError(
        "invalid_score_request",
        `series URL slugs are not injective: ${slug} is shared by ${map.get(slug)} and ${series}`,
      );
    }
    map.set(slug, series);
  }
  return map;
})();

/** `<series-slug>-<yyyy-mm-dd>-<label>`. The day is fixed-width, so the three
 *  segments are recoverable even though `-` separates and also occurs inside a
 *  series slug. The label alphabet is deliberately `[a-z]+` — every member of
 *  NORMALIZED_EDITION_LABELS is, and admitting `-` there would reintroduce the
 *  ambiguity the fixed-width day removes. */
const EDITION_BENCHMARK_KEY_RE = /^([a-z][a-z-]*[a-z])-(\d{4}-\d{2}-\d{2})-([a-z]+)$/;

/** Labels a real provider URL can normalize to, per series. `final` is the
 *  reserved FIXTURE label (`editions.ts:55`) and is refused in both directions:
 *  normalization can never produce it, so a route key naming it could only come
 *  from a hand-typed URL. */
function isNormalizedLabel(series: ReferenceSeriesId, label: string): boolean {
  return label !== FIXTURE_FINAL_LABEL && NORMALIZED_EDITION_LABELS[series].includes(label);
}

/** Encode a stored `benchmark_report_editions.edition_key` as a URL key.
 *  Throws typed rather than returning a mangled key: the caller is rendering a
 *  link, and a link to a key that will not decode is worse than a visible
 *  failure. */
export function benchmarkKeyForEdition(editionKey: string): string {
  const parts = editionKey.split(":");
  if (parts.length !== 3) {
    throw new ConflictDomainError(
      "invalid_edition_record",
      `editionKey ${JSON.stringify(editionKey)} is not <series>:<reportDate>:<label>`,
    );
  }
  const [series, reportDate, label] = parts;
  if (!isReferenceSeriesId(series)) {
    throw new ConflictDomainError(
      "invalid_edition_record",
      `editionKey ${JSON.stringify(editionKey)}: unknown reference series`,
    );
  }
  if (!isIsoDay(reportDate)) {
    throw new ConflictDomainError(
      "invalid_edition_record",
      `editionKey ${JSON.stringify(editionKey)}: report date is not a yyyy-mm-dd day`,
    );
  }
  if (!isNormalizedLabel(series, label)) {
    throw new ConflictDomainError(
      "invalid_edition_record",
      `editionKey ${JSON.stringify(editionKey)}: label ${JSON.stringify(label)} is not a ${series} normalization label`,
    );
  }
  return `${SERIES_URL_SLUGS[series]}-${reportDate}-${label}`;
}

/** Decode a URL key back to its edition key, or null when the key is not one
 *  this module could have minted. `null` (not a throw) because the caller is a
 *  route handler turning an arbitrary path segment into a `notFound()`. */
export function editionKeyOfBenchmarkKey(benchmarkKey: string): string | null {
  const m = EDITION_BENCHMARK_KEY_RE.exec(benchmarkKey);
  if (m === null) return null;
  const series = SERIES_BY_SLUG.get(m[1]);
  if (series === undefined) return null;
  const [, , reportDate, label] = m;
  if (!isIsoDay(reportDate)) return null; // e.g. 2026-02-31
  if (!isNormalizedLabel(series, label)) return null;
  return `${series}:${reportDate}:${label}`;
}

/** The report day a benchmark URL key names, or null. Lets a route narrow its
 *  observation read to one day without decoding the key twice. */
export function reportDateOfBenchmarkKey(benchmarkKey: string): string | null {
  const editionKey = editionKeyOfBenchmarkKey(benchmarkKey);
  return editionKey === null ? null : editionKey.split(":")[1];
}
