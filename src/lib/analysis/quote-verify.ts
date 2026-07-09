// Quote verification (OPEN-TASKS #34): doc_claims.quote_orig is best-effort --
// ~71% strictly verbatim under plain whitespace normalization; most misses are
// unicode-level (curly quotes, dash variants, invisible chars, NBSP). This module
// is the single normalization both the map worker (stamps quote_verified at
// insert) and the reduce loader (lazy backfill of pre-stamp rows) must share, so
// the stamp and any recount always agree. Only claims that pass here may render
// quote_orig as hard traceability evidence; the rest fall back to the doc link.

/** Fold the unicode noise that separates a faithful copy from a byte-exact one:
 *  NFKC, invisible/bidi chars out, quote/dash/ellipsis variants unified, NBSP and
 *  runs of whitespace collapsed, case-folded. Deliberately NOT a fuzzy match --
 *  a paraphrase or a "fixed typo" still fails. */
export function normalizeForContainment(s: string): string {
  return s
    .normalize("NFKC")
    // zero-width/bidi marks, embeddings, word-joiner, BOM, soft hyphen
    .replace(/[​-‏‪-‮⁠﻿­]/g, "")
    // apostrophe variants
    .replace(/[‘’ʼ`´]/g, "'")
    // double-quote variants
    .replace(/[“”«»„]/g, '"')
    // dash variants (hyphen..horizontal bar, minus sign)
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True iff the quote appears verbatim (normalized) in the doc's title+content.
 *  Quotes too short to be meaningful evidence never verify. */
export function verifyQuote(docText: string, quote: string | null): boolean {
  if (!quote) return false;
  const q = normalizeForContainment(quote);
  if (q.length < 12) return false;
  return normalizeForContainment(docText).includes(q);
}
