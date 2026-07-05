// Cheap deterministic language tagging for theater content.
// ru/uk/en plus the RU minority languages we ingest (Tatar, Bashkir, Chuvash,
// Chechen) — rough char-set heuristics; the LLM reads all of them regardless.

export type Lang = "ru" | "uk" | "en" | "tt" | "ba" | "cv" | "ce";

export function detectLang(text: string): Lang | null {
  if (!text) return null;
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (cyrillic < 5 && latin < 5) return null;
  if (cyrillic <= latin) return "en";
  // minority-language markers (checked before ru/uk split):
  if (/[ӑӗӳ]|ҫак|тата/i.test(text) && /[ҫ]/.test(text)) return "cv"; // Chuvash: ӑ ӗ ӳ ҫ
  if (/[ҡғҙ]/.test(text)) return "ba"; // Bashkir: ҡ ғ ҙ (+ shared ә ө ү һ ң)
  if (/[җ]/.test(text) && /[әөү]/.test(text)) return "tt"; // Tatar: җ + ә ө ү
  if (/[ӏ]|къ|хь|аь/i.test(text) && /[ӏ]/.test(text)) return "ce"; // Chechen: palochka
  // Ukrainian-specific: і ї є ґ ; Russian-specific: ы ъ э ё
  const uk = (text.match(/[іїєґІЇЄҐ]/g) ?? []).length;
  const ru = (text.match(/[ыъэёЫЪЭЁ]/g) ?? []).length;
  return uk > ru ? "uk" : "ru";
}
