// Versioned gazetteer types (48h step 06).
//
// A gazetteer is the DATA half of signature extraction: canonical toponyms and
// action classes with their surface variants, the reference-side expansion map,
// and a theater tag per canonical. The matching algorithm lives in ./match.ts
// and is shared; a gazetteer never carries code.
//
// LAYERING (load-bearing): src/lib/validation/** must NOT import
// src/lib/conflicts/**. The dependency already runs the other way
// (conflicts/keyword-matcher.ts:42, conflicts/backtest-matrix.ts:94,
// evals/score-validation.ts:18), so theater tags and lookup keys here are
// PLAIN STRINGS — importing ConflictId or the theater vocabulary would close a
// cycle. gazetteer/layering.test.ts pins this.

export type GazetteerVersion = "ru-ua-v1" | "iran-levant-v1";

/** How a variant string is tested against lowercased text.
 *
 *  - "substring": `text.includes(variant)` — the historical RU/UA behaviour,
 *    kept verbatim. It is also the only correct mode for Cyrillic: JS `\b` is
 *    ASCII-`\w`-based, so `\bпокровск\b` would match inside any Cyrillic run.
 *  - "word": each variant is anchored `\b…\b`; a TRAILING `*` drops the right
 *    anchor (stem match, e.g. `enrich*` matches "enrichment"). Word-mode
 *    gazetteers must therefore be lowercase ASCII — pinned per gazetteer. */
export type MatchMode = "substring" | "word";

/** RU/UA theater tag: 'ua' = inside Ukraine, 'ru' = inside Russia, 'both' =
 *  covered from both sides or non-territorial (keywords.ts's historical set). */
export type RuUaTheater = "ru" | "ua" | "both";

/** Iran/Levant theater tag: the `iran_regional` contributor theaters
 *  (conflicts/definitions.ts:117-126 — `ir` mapped, the rest legacy_only) plus
 *  'both' for geography no single contributor theater owns (Iraq, Syria,
 *  Lebanon, Yemen, the straits) — the same treatment `crimea` and
 *  `north_korea` get in ru-ua-v1. */
export type IranTheater = "ir" | "il" | "sa" | "ae" | "qa" | "om" | "bh" | "kw" | "both";

export interface Signature {
  toponyms: Set<string>;
  actions: Set<string>;
}

export interface Gazetteer {
  readonly version: GazetteerVersion;
  readonly matchMode: MatchMode;
  /** canonical id -> surface variants (lowercase). DECLARATION ORDER IS
   *  LOAD-BEARING: it fixes Set insertion order, which is persisted as
   *  `isw_reports.takeaways[].toponyms` (isw-extract.ts:56-64). */
  readonly toponyms: Readonly<Record<string, readonly string[]>>;
  readonly actions: Readonly<Record<string, readonly string[]>>;
  /** reference-side expansion: canonical -> member canonicals (RU/UA: oblast ->
   *  member towns). ISW summarizes at the wider level while ground sources name
   *  the member. */
  readonly expansions: Readonly<Record<string, readonly string[]>>;
  /** canonical -> theater tag, as a plain string (see LAYERING above). */
  readonly theaterOf: Readonly<Record<string, string>>;
}
