// Analysis-eval control plane: numeric-fidelity instrument (SCI-3b).
//
// Pure. Extracted from score-map.ts at the corpus-v2 landing so the dataset
// validator can enforce the gist numeral-style discipline the instrument
// requires, without contracts.ts importing a scorer.

/** SCI-3b: numeric fidelity between a matched gold gist and its candidate
 *  claim. Digits and English number-words normalize to values; every value
 *  the reference carries must appear in the candidate ("four drones" answered
 *  by "five drones" is a fidelity failure, not a gist match). Deterministic,
 *  deliberately conservative: only exact-value presence, no ranges/units. */
export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

export function numericValues(text: string): number[] {
  const out: number[] = [];
  // thousands separators stripped FIRST ("1,000" is one thousand, never 1.0);
  // decimals are dot-only. Compound number-words ("two hundred",
  // "twenty-one") are deliberately unsupported: checkNumerals gists must use
  // bare digits or simple single number-words (validator-pinned via
  // gistNumeralStyleErrors below since the v2 corpus adopted the flag).
  const normalized = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1"); // "1,000km" included
  for (const m of normalized.matchAll(/\d+(?:\.\d+)?/g)) {
    out.push(Number(m[0]));
  }
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) {
    if (m[0] in NUMBER_WORDS) out.push(NUMBER_WORDS[m[0]]);
  }
  return out;
}

export function numeralsPreserved(refText: string, candText: string): boolean {
  const cand = numericValues(candText);
  return numericValues(refText).every((v) => cand.includes(v));
}

/** Gist numeral-style discipline for cases that set reference.checkNumerals:
 *  numericValues cannot read compound number-words, so a gist containing
 *  "two hundred" or "twenty-one" would silently assert the WRONG values
 *  ([2, 100] / [20, 1]). The validator rejects such gists up front. Two
 *  violation shapes: adjacent number-words separated by whitespace only
 *  ("two hundred"; "four, five" is two simple numbers and stays legal), and a
 *  hyphenated token whose two halves are both number-words ("twenty-one"). */
export function gistNumeralStyleErrors(text: string): string[] {
  const errs: string[] = [];
  const lower = text.toLowerCase();
  // lookahead keeps consecutive pairs overlapping ("a two hundred" must still
  // see the ("two", "hundred") pair after consuming ("a", "two"))
  for (const m of lower.matchAll(/([a-z]+)([^a-z]+)(?=([a-z]+))/g)) {
    const [, a, sep, b] = m;
    if (!(a in NUMBER_WORDS) || !(b in NUMBER_WORDS)) continue;
    if (/^\s+$/.test(sep)) {
      errs.push(`compound number-words "${a} ${b}" — numericValues reads them as separate values; use bare digits`);
    } else if (sep === "-") {
      errs.push(`hyphenated number-words "${a}-${b}" — numericValues reads them as separate values; use bare digits`);
    }
  }
  return errs;
}
