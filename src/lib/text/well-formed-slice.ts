// Well-formed UTF-16 truncation primitives. Extracted verbatim from
// src/lib/analysis/map-prompts.ts (the OPEN-TASKS #86 repair) so every
// provider-bound truncation site (#97 family) shares ONE audited
// implementation; map-prompts re-exports both names, keeping its API and
// behavior byte-identical.

/** Any UTF-16 code unit in the surrogate range D800–DFFF. In a WELL-FORMED JS
 *  string these occur only as a HIGH half (D800–DBFF) immediately followed by a
 *  LOW half (DC00–DFFF), the pair encoding one astral scalar (emoji, most
 *  historic scripts). A half on its own is not a Unicode scalar value and has no
 *  UTF-8 encoding at all. */
const ANY_SURROGATE_UNIT = /[\uD800-\uDFFF]/;

/** Remove every ISOLATED surrogate code unit; keep valid pairs byte-for-byte.
 *
 *  Why this exists (OPEN-TASKS #86, generalized by #97): an unpaired surrogate
 *  survives `JSON.stringify` as the literal six-character escape `\udXXX` —
 *  syntactically legal JSON, but a string the receiving strict parser cannot
 *  decode — so the provider rejects the ENTIRE request with
 *  `400 Invalid body: failed to parse JSON value`, and one poisoned input can
 *  kill its whole request (a 20-document map micro-batch, a full reduce
 *  synthesis message).
 *
 *  Contract, exactly:
 *  - a string containing no surrogate code unit at all is returned UNCHANGED —
 *    the identity, and the overwhelmingly common case (all Cyrillic, Ukrainian,
 *    Persian and Arabic text is BMP);
 *  - a string whose surrogates are all correctly paired is likewise unchanged;
 *  - an isolated high or low surrogate is REMOVED, never replaced: the result
 *    stays a subsequence of the input's scalar values, so the model is never
 *    shown a character (U+FFFD, say) the source did not contain;
 *  - the result is never longer than the input, and is always well-formed.
 *
 *  Deliberately NOT done here: normalization of any kind (no NFC/NFKC), and no
 *  grapheme-cluster repair — a dangling ZWJ or variation selector left by
 *  truncation is valid Unicode and is preserved as-is. Scalar validity is the
 *  invariant; grapheme integrity is not. */
export function dropIsolatedSurrogates(s: string): string {
  if (!ANY_SURROGATE_UNIT.test(s)) return s;
  let out = "";
  let keepFrom = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xd800 || c > 0xdfff) continue;
    if (c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++; // valid pair — keep both halves, skip past the low one
        continue;
      }
    }
    out += s.slice(keepFrom, i); // everything up to, but not including, the orphan
    keepFrom = i + 1;
  }
  return keepFrom === 0 ? s : out + s.slice(keepFrom);
}

/** Truncate to at most `limit` UTF-16 CODE UNITS and return a WELL-FORMED
 *  string. `limit` keeps its historical code-unit meaning — it is NOT
 *  reinterpreted as code points — so every caller's content budget (and, for
 *  the map stage, `mapExtractorVersion`'s `content=` basis component) is
 *  unchanged.
 *
 *  Order matters: slice FIRST, repair SECOND. Repairing first could let a pair
 *  shift across the ceiling and be split again. This way a pair that fits
 *  entirely inside the ceiling is preserved intact, and a pair straddling the
 *  boundary loses only its orphaned high half, yielding `limit - 1` code units. */
export function wellFormedSlice(s: string, limit: number): string {
  if (!(limit > 0)) return ""; // defensive: NaN/0/negative must never reverse-slice
  return dropIsolatedSurrogates(s.length > limit ? s.slice(0, limit) : s);
}
