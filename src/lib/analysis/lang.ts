// Cheap deterministic language tagging for theater content (ru / uk / en).
// Good enough for routing and display; proper translation is provider work.

export function detectLang(text: string): "ru" | "uk" | "en" | null {
  if (!text) return null;
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (cyrillic < 5 && latin < 5) return null;
  if (cyrillic <= latin) return "en";
  // Ukrainian-specific: і ї є ґ ; Russian-specific: ы ъ э ё
  const uk = (text.match(/[іїєґІЇЄҐ]/g) ?? []).length;
  const ru = (text.match(/[ыъэёЫЪЭЁ]/g) ?? []).length;
  return uk > ru ? "uk" : "ru";
}
