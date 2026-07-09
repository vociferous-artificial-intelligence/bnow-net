import type { Lang } from "../analysis/lang";

// Theater routing for an ingested document.
//
// A channel/account carries a default theater, but the registry that seeds them
// (ISW citations) has no country column — registryTelegramChannels() therefore
// files every registry-derived channel under 'ru'. Two corrections apply, in
// order: the per-source override (TELEGRAM_CHANNEL_THEATER), then the content
// language.

/** Languages that identify a theater on their own, whatever the source default.
 *
 *  `uk` -> `ua` is the long-standing telegram/x convention. `fa` -> `ir` is its
 *  Iran counterpart: Persian is spoken as a news language essentially only in the
 *  Iran theater, and 3,401 Persian docs sat in the ru corpus for want of this rule
 *  (PIPELINE-AUDIT-2026-07 §9d).
 *
 *  `ar` is deliberately absent. Arabic spans ir/sa/ae/qa/om/il, and the Arabic
 *  docs currently mis-filed under ru are Lebanese, not Iranian — routing them by
 *  language would be a guess. Sources like those need a per-channel entry. */
const LANG_THEATER: Partial<Record<Lang, string>> = {
  uk: "ua",
  fa: "ir",
};

/** The theater a doc belongs to, given its detected language and its source's
 *  default theater. Language wins when it is unambiguous. */
export function routeTheater(lang: string | null | undefined, defaultIso2: string): string {
  if (!lang) return defaultIso2;
  return LANG_THEATER[lang as Lang] ?? defaultIso2;
}
