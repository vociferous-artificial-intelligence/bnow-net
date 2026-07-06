// Lightweight i18n: UI-string dictionaries + a t() helper. No heavy dependency —
// App Router + a keyed dictionary is enough for chrome. Content (digests/claims) stays
// English-first (the analyst lingua franca); on-demand LLM translation is a later toggle.
// See docs/NEXT-PHASE-PLAN.md §2.

export const LOCALES = ["en", "uk", "ar", "he", "fr", "de", "es", "ja", "ko"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English", uk: "Українська", ar: "العربية", he: "עברית", fr: "Français",
  de: "Deutsch", es: "Español", ja: "日本語", ko: "한국어",
};

// RTL locales need dir="rtl"
export const RTL_LOCALES = new Set<Locale>(["ar", "he"]);

type Dict = Record<string, string>;

const en: Dict = {
  "nav.theaters": "theaters",
  "nav.ru_registry": "RU registry",
  "nav.me_registry": "ME registry",
  "nav.scoreboard": "scoreboard",
  "nav.ask": "ask",
  "nav.datadark": "data-dark",
  "nav.trade": "trade-evasion",
  "nav.signals": "signals",
  "nav.materials": "critical materials",
  "nav.pricing": "pricing",
  "nav.signin": "sign in",
  "home.tagline": "Transparent source reliability ratings for conflict-zone OSINT",
  "home.sub": "Per-country intelligence feeds from open news, Telegram and social sources — scored for reliability, fused into a daily digest, and validated every day against expert human analysis. Every claim links to its evidence.",
  "home.cta.subscribe": "Become a founding subscriber",
  "home.cta.scoreboard": "See the scoreboard",
  "home.live": "Live now: Russia · Ukraine · Iran",
  "common.status": "status",
};

// Ukrainian — explicit priority (UA is a live theater).
const uk: Dict = {
  "nav.theaters": "театри",
  "nav.ru_registry": "реєстр РФ",
  "nav.me_registry": "реєстр БС",
  "nav.scoreboard": "таблиця оцінок",
  "nav.ask": "запит",
  "nav.datadark": "закриті дані",
  "nav.trade": "торгівля в обхід",
  "nav.signals": "сигнали",
  "nav.materials": "критичні матеріали",
  "nav.pricing": "тарифи",
  "nav.signin": "увійти",
  "home.tagline": "Прозорі рейтинги надійності джерел для OSINT зон конфлікту",
  "home.sub": "Розвідувальні стрічки по країнах з відкритих новин, Telegram та соцмереж — оцінені за надійністю, зведені у щоденний дайджест і щодня звірені з експертним аналізом. Кожне твердження має посилання на доказ.",
  "home.cta.subscribe": "Стати першим передплатником",
  "home.cta.scoreboard": "Переглянути таблицю",
  "home.live": "У прямому ефірі: Росія · Україна · Іран",
  "common.status": "стан",
};

// Stubs for the rest (fall back to English per-key until translated).
const DICTS: Partial<Record<Locale, Dict>> = { en, uk };

export function dict(locale: Locale): Dict {
  return { ...en, ...(DICTS[locale] ?? {}) };
}

export function makeT(locale: Locale) {
  const d = dict(locale);
  return (key: string): string => d[key] ?? en[key] ?? key;
}

export function isLocale(x: string | undefined): x is Locale {
  return !!x && (LOCALES as readonly string[]).includes(x);
}
