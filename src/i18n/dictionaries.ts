// Lightweight i18n: an authoritative locale registry + UI-string dictionaries + a t()
// helper. No heavy dependency — App Router + a keyed dictionary is enough for chrome.
// Content (digests/claims/evidence) stays English-first (the analyst lingua franca) and
// is NEVER machine-translated here; on-demand LLM translation is a later, presentation-only
// toggle. See docs/NEXT-PHASE-PLAN.md §2 and docs/PROGRESS.md (2026-07-08 i18n note).
//
// INVARIANT: source names, source URLs, raw evidence, raw document titles, claim IDs,
// confidence/source metadata and the "ISW"/"OSINT" labels are proper nouns / identifiers —
// they are never translated. Only UI chrome (nav, section labels, framing) lives here.

// ---------------------------------------------------------------------------
// Locale registry — single source of truth (code, labels, direction, market
// priority/order, fallback). Everything else (LOCALES, names, RTL set) derives
// from this so there is exactly one place to edit.
// ---------------------------------------------------------------------------

const REGISTRY = {
  en: { label: "English",    nativeLabel: "English",     dir: "ltr", order: 1,  fallback: "en" },
  uk: { label: "Ukrainian",  nativeLabel: "Українська",  dir: "ltr", order: 2,  fallback: "en" },
  de: { label: "German",     nativeLabel: "Deutsch",     dir: "ltr", order: 3,  fallback: "en" },
  fr: { label: "French",     nativeLabel: "Français",    dir: "ltr", order: 4,  fallback: "en" },
  pl: { label: "Polish",     nativeLabel: "Polski",      dir: "ltr", order: 5,  fallback: "en" },
  ar: { label: "Arabic",     nativeLabel: "العربية",     dir: "rtl", order: 6,  fallback: "en" },
  ja: { label: "Japanese",   nativeLabel: "日本語",       dir: "ltr", order: 7,  fallback: "en" },
  es: { label: "Spanish",    nativeLabel: "Español",     dir: "ltr", order: 8,  fallback: "en" },
  he: { label: "Hebrew",     nativeLabel: "עברית",       dir: "rtl", order: 9,  fallback: "en" },
  ko: { label: "Korean",     nativeLabel: "한국어",       dir: "ltr", order: 10, fallback: "en" },
} as const;

export type Locale = keyof typeof REGISTRY;
export type Dir = "ltr" | "rtl";

export interface LocaleMeta {
  code: Locale;
  /** English label, e.g. "German". */
  label: string;
  /** Native label, e.g. "Deutsch". */
  nativeLabel: string;
  dir: Dir;
  /** Market priority (1 = highest); drives selector ordering. */
  order: number;
  /** Locale to fall back to per-key when a translation is missing. */
  fallback: Locale;
}

export const LOCALE_REGISTRY: Record<Locale, LocaleMeta> = Object.fromEntries(
  Object.entries(REGISTRY).map(([code, m]) => [code, { code: code as Locale, ...m }]),
) as Record<Locale, LocaleMeta>;

export const LOCALES = Object.keys(REGISTRY) as Locale[];
export const DEFAULT_LOCALE: Locale = "en";

// Native names, kept for backward compatibility with existing imports.
export const LOCALE_NAMES: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((l) => [l, REGISTRY[l].nativeLabel]),
) as Record<Locale, string>;

// RTL locales need dir="rtl".
export const RTL_LOCALES = new Set<Locale>(LOCALES.filter((l) => REGISTRY[l].dir === "rtl"));

// Top-level UI namespaces every locale catalog is expected to cover (the prefix
// before the first dot in a message key). Used by tests and by the fallback design.
export const REQUIRED_NAMESPACES = [
  "nav",
  "home",
  "countries",
  "pricing",
  "registry",
  "scoreboard",
  "digest",
  "ask",
  "auth",
  "common",
] as const;

/** Locales in market-priority order (for the language selector). */
export function localesByPriority(): LocaleMeta[] {
  return LOCALES.map((l) => LOCALE_REGISTRY[l]).sort((a, b) => a.order - b.order);
}

/** Fallback chain from a locale down to the ultimate default (cycle-safe). */
export function fallbackChain(locale: Locale): Locale[] {
  const chain: Locale[] = [];
  const seen = new Set<Locale>();
  let cur: Locale | undefined = locale;
  while (cur && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    const fb: Locale = LOCALE_REGISTRY[cur].fallback;
    cur = fb === cur ? undefined : fb;
  }
  if (!seen.has(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return chain;
}

// ---------------------------------------------------------------------------
// Message catalogs (flat, dotted keys; the prefix is the namespace).
// English is the authoritative base; other locales override per-key and fall
// back to English for anything missing. Placeholders use {name} tokens.
// ---------------------------------------------------------------------------

type Dict = Record<string, string>;

const en: Dict = {
  // navigation — the original flat module names. Retained: the values are pinned by
  // tests and the keys stay available to any surface that still wants a short label.
  "nav.home": "home",
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
  "nav.language": "Language",

  // global header — buyer-journey grouping (category → coverage → trust → price)
  "nav.group.product": "Product",
  "nav.group.coverage": "Coverage",
  "nav.group.validation": "Validation",
  "nav.group.solutions": "Solutions",
  "nav.group.pricing": "Pricing",
  "nav.item.feeds": "Daily intelligence feeds",
  "nav.item.ask": "Ask the data",
  "nav.item.registry": "Source reliability registry",
  "nav.item.me_registry": "Middle East registry",
  "nav.item.signals": "Analyst signals",
  "nav.item.all_theaters": "All theaters",
  "nav.item.sanctions": "Sanctions & trade evasion",
  "nav.item.commodity": "Commodity & supply-chain risk",
  "nav.item.opacity": "Economic data suppression",
  "nav.item.political_risk": "Political risk & signals",
  "nav.account": "Account",
  "nav.signout": "Sign out",
  "nav.menu": "Menu",
  "nav.close": "Close",

  // landing page
  "home.tagline": "Transparent source reliability ratings for conflict-zone OSINT",
  "home.sub": "Per-country intelligence feeds from open news, Telegram and social sources — scored for reliability, fused into a daily digest, and validated every day against expert human analysis. Every claim links to its evidence.",
  "home.cta.subscribe": "Become a founding subscriber",
  "home.cta.scoreboard": "See the scoreboard",
  "home.cta.digest": "Read today's digest",
  "home.cta.coverage": "Explore live coverage",
  "home.live": "Live now: Russia · Ukraine · Iran",
  // `home.live` split into its parts so the signed-in home can render the theaters as
  // quick links. The sentence key stays for the signed-out hero (and is pinned by tests).
  "home.live_label": "Live now",
  "home.theater.ru": "Russia",
  "home.theater.ua": "Ukraine",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Reliability, derived not asserted",
  "home.features.reliability.body": "{sources} sources rated from {citations} citations in 4+ years of expert reporting — how often each source is confirmed, merely claimed, or never verified.",
  "home.features.reliability.link": "explore the registry →",
  "home.features.claims.title": "Claims you can audit",
  "home.features.claims.body": "{docs} raw documents ingested. Every digest claim is linked to its source documents at the database level — no black-box analysis.",
  "home.features.claims.link": "read today's digest →",
  "home.features.scored.title": "Scored against experts, daily",
  "home.features.scored.body": "{runs} validation runs against ISW's daily assessments. Coverage, misses, and leads — published, not hidden.",
  "home.features.scored.link": "see how we score →",
  "home.footer": "OSINT data intelligence · analysis derived from open sources; source ratings are statistical artifacts of citation behavior, not endorsements.",

  // country feeds
  "countries.title": "Coverage",
  "countries.subtitle": "Per-country conflict-monitoring feeds, scored and fused daily.",
  "countries.first_digest_pending": "first digest pending",
  "countries.view_digest": "view digest →",
  "countries.empty": "No coverage yet.",

  // pricing / intents
  "pricing.title": "Founding subscriber pricing",
  "pricing.subtitle": "Full access for analysts and desks.",
  "pricing.cta.subscribe": "Subscribe",
  "pricing.cta.request": "Request access",
  "pricing.email_placeholder": "work email",
  "pricing.note": "Founding-subscriber annual: full access, locked-in rate.",

  // registry explorer
  "registry.title": "Source Registry",
  "registry.search_placeholder": "search…",
  "registry.col.source": "source",
  "registry.col.platform": "platform",
  "registry.col.status": "status",
  "registry.col.cited": "cited",
  "registry.col.hedging_mix": "hedging mix",
  "registry.status.decayed": "decayed",

  // scoreboard
  "scoreboard.title": "Validation Scoreboard",
  "scoreboard.empty": "No validation runs yet.",
  "scoreboard.col.theater": "theater",
  "scoreboard.col.coverage": "coverage",
  "scoreboard.col.lead": "lead (h)",
  "scoreboard.avg_coverage": "avg event coverage vs ISW",
  "scoreboard.median_lead": "median information lead vs ISW publish",
  "scoreboard.thin_sourced": "thin-sourced",

  // digest page framing
  "digest.no_events": "No events extracted.",
  "digest.view_for": "view for:",
  "digest.sources": "sources",
  "digest.confidence": "confidence",
  "digest.track.military": "Military situation",
  "digest.track.elite": "Elite politics & prosecutions",

  // ask page framing
  "ask.title": "Interrogate the intelligence",
  "ask.subtitle": "Cited evidence",
  "ask.placeholder": "e.g. which oligarchs are under prosecution?",
  "ask.submit": "Ask",
  "ask.examples": "Try one of these",

  // auth labels
  "auth.signin": "Sign in",
  "auth.email_placeholder": "you@example.com",
  "auth.send_link": "Send magic link",
  "auth.sent": "Check your email for a sign-in link.",

  // common loading / empty / error states
  "common.status": "status",
  "common.loading": "Loading…",
  "common.empty": "Nothing here yet.",
  "common.error": "Something went wrong.",
  "common.retry": "Try again",
  "common.back": "Back",
  "common.updated": "Updated",
  "common.learn_more": "Learn more",
};

// Ukrainian — live theater; the five original keys are preserved verbatim.
const uk: Dict = {
  "nav.home": "головна",
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
  "nav.language": "Мова",
  "nav.group.product": "Продукт",
  "nav.group.coverage": "Охоплення",
  "nav.group.validation": "Валідація",
  "nav.group.solutions": "Рішення",
  "nav.group.pricing": "Тарифи",
  "nav.item.feeds": "Щоденні розвідувальні стрічки",
  "nav.item.ask": "Запитати дані",
  "nav.item.registry": "Реєстр надійності джерел",
  "nav.item.me_registry": "Реєстр Близького Сходу",
  "nav.item.signals": "Аналітичні сигнали",
  "nav.item.all_theaters": "Усі театри",
  "nav.item.sanctions": "Санкції та обхід торгівлі",
  "nav.item.commodity": "Ризики сировини та ланцюгів постачання",
  "nav.item.opacity": "Приховування економічних даних",
  "nav.item.political_risk": "Політичні ризики та сигнали",
  "nav.account": "Обліковий запис",
  "nav.signout": "Вийти",
  "nav.menu": "Меню",
  "nav.close": "Закрити",
  "home.tagline": "Прозорі рейтинги надійності джерел для OSINT зон конфлікту",
  "home.sub": "Розвідувальні стрічки по країнах з відкритих новин, Telegram та соцмереж — оцінені за надійністю, зведені у щоденний дайджест і щодня звірені з експертним аналізом. Кожне твердження має посилання на доказ.",
  "home.cta.subscribe": "Стати першим передплатником",
  "home.cta.scoreboard": "Переглянути таблицю",
  "home.cta.digest": "Читати сьогоднішній дайджест",
  "home.cta.coverage": "Переглянути активне охоплення",
  "home.live": "У прямому ефірі: Росія · Україна · Іран",
  "home.live_label": "У прямому ефірі",
  "home.theater.ru": "Росія",
  "home.theater.ua": "Україна",
  "home.theater.ir": "Іран",
  "home.features.reliability.title": "Надійність, виведена, а не заявлена",
  "home.features.reliability.body": "{sources} джерел оцінено з {citations} цитувань за понад 4 роки експертної звітності — як часто кожне джерело підтверджене, лише заявлене чи ніколи не перевірене.",
  "home.features.reliability.link": "переглянути реєстр →",
  "home.features.claims.title": "Твердження, які можна перевірити",
  "home.features.claims.body": "{docs} первинних документів завантажено. Кожне твердження дайджесту пов'язане з його джерельними документами на рівні бази даних — жодного аналізу «чорної скриньки».",
  "home.features.claims.link": "читати сьогоднішній дайджест →",
  "home.features.scored.title": "Щодня оцінюється проти експертів",
  "home.features.scored.body": "{runs} прогонів валідації проти щоденних оцінок ISW. Охоплення, пропуски та випередження — опубліковані, не приховані.",
  "home.features.scored.link": "подивитися, як ми оцінюємо →",
  "home.footer": "Розвідка даних OSINT · аналіз виведено з відкритих джерел; оцінки джерел — статистичні артефакти поведінки цитування, а не рекомендації.",
  "countries.title": "Охоплення",
  "countries.subtitle": "Стрічки моніторингу конфлікту по країнах, щодня оцінені та зведені.",
  "countries.first_digest_pending": "перший дайджест готується",
  "countries.view_digest": "переглянути дайджест →",
  "countries.empty": "Поки що немає охоплення.",
  "pricing.title": "Ціни для передплатників-засновників",
  "pricing.subtitle": "Повний доступ для аналітиків і відділів.",
  "pricing.cta.subscribe": "Передплатити",
  "pricing.cta.request": "Запросити доступ",
  "pricing.email_placeholder": "робоча пошта",
  "pricing.note": "Передплатник-засновник, річна: повний доступ, зафіксований тариф.",
  "registry.title": "Реєстр джерел",
  "registry.search_placeholder": "пошук…",
  "registry.col.source": "джерело",
  "registry.col.platform": "платформа",
  "registry.col.status": "стан",
  "registry.col.cited": "цитовано",
  "registry.col.hedging_mix": "профіль обережності",
  "registry.status.decayed": "застаріле",
  "scoreboard.title": "Таблиця валідації",
  "scoreboard.empty": "Ще немає прогонів валідації.",
  "scoreboard.col.theater": "театр",
  "scoreboard.col.coverage": "охоплення",
  "scoreboard.col.lead": "випередження (год)",
  "scoreboard.avg_coverage": "середнє охоплення подій проти ISW",
  "scoreboard.median_lead": "медіана інформаційного випередження проти публікації ISW",
  "scoreboard.thin_sourced": "слабко підкріплене",
  "digest.no_events": "Подій не виявлено.",
  "digest.view_for": "перегляд для:",
  "digest.sources": "джерела",
  "digest.confidence": "впевненість",
  "digest.track.military": "Військова ситуація",
  "digest.track.elite": "Політика еліт і переслідування",
  "ask.title": "Запитати розвідку",
  "ask.subtitle": "Цитовані докази",
  "ask.placeholder": "напр., яких олігархів переслідують?",
  "ask.submit": "Запитати",
  "ask.examples": "Спробуйте одне з цих",
  "auth.signin": "Увійти",
  "auth.email_placeholder": "ви@приклад.ua",
  "auth.send_link": "Надіслати магічне посилання",
  "auth.sent": "Перевірте пошту — там посилання для входу.",
  "common.status": "стан",
  "common.loading": "Завантаження…",
  "common.empty": "Тут поки що порожньо.",
  "common.error": "Щось пішло не так.",
  "common.retry": "Спробувати знову",
  "common.back": "Назад",
  "common.updated": "Оновлено",
  "common.learn_more": "Дізнатися більше",
};

// German
const de: Dict = {
  "nav.home": "Start",
  "nav.theaters": "Kriegsschauplätze",
  "nav.ru_registry": "RU-Register",
  "nav.me_registry": "Nahost-Register",
  "nav.scoreboard": "Bewertungstabelle",
  "nav.ask": "Fragen",
  "nav.datadark": "Datenlücken",
  "nav.trade": "Handelsumgehung",
  "nav.signals": "Signale",
  "nav.materials": "kritische Rohstoffe",
  "nav.pricing": "Preise",
  "nav.signin": "Anmelden",
  "nav.language": "Sprache",
  "nav.group.product": "Produkt",
  "nav.group.coverage": "Abdeckung",
  "nav.group.validation": "Validierung",
  "nav.group.solutions": "Lösungen",
  "nav.group.pricing": "Preise",
  "nav.item.feeds": "Tägliche Intelligence-Feeds",
  "nav.item.ask": "Die Daten befragen",
  "nav.item.registry": "Register der Quellenzuverlässigkeit",
  "nav.item.me_registry": "Nahost-Register",
  "nav.item.signals": "Analystensignale",
  "nav.item.all_theaters": "Alle Schauplätze",
  "nav.item.sanctions": "Sanktionen & Handelsumgehung",
  "nav.item.commodity": "Rohstoff- & Lieferkettenrisiko",
  "nav.item.opacity": "Unterdrückung von Wirtschaftsdaten",
  "nav.item.political_risk": "Politisches Risiko & Signale",
  "nav.account": "Konto",
  "nav.signout": "Abmelden",
  "nav.menu": "Menü",
  "nav.close": "Schließen",
  "home.tagline": "Transparente Bewertungen der Quellenzuverlässigkeit für OSINT in Konfliktzonen",
  "home.sub": "Länderspezifische Intelligence-Feeds aus offenen Nachrichten, Telegram und sozialen Quellen — nach Zuverlässigkeit bewertet, zu einem täglichen Digest verdichtet und jeden Tag gegen fachkundige menschliche Analyse validiert. Jede Aussage verweist auf ihren Beleg.",
  "home.cta.subscribe": "Gründungsabonnent werden",
  "home.cta.scoreboard": "Zur Bewertungstabelle",
  "home.cta.digest": "Heutigen Digest lesen",
  "home.cta.coverage": "Live-Abdeckung erkunden",
  "home.live": "Jetzt live: Russland · Ukraine · Iran",
  "home.live_label": "Jetzt live",
  "home.theater.ru": "Russland",
  "home.theater.ua": "Ukraine",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Zuverlässigkeit, abgeleitet statt behauptet",
  "home.features.reliability.body": "{sources} Quellen bewertet aus {citations} Zitaten aus über 4 Jahren fachkundiger Berichterstattung — wie oft jede Quelle bestätigt, nur behauptet oder nie verifiziert wurde.",
  "home.features.reliability.link": "Register erkunden →",
  "home.features.claims.title": "Aussagen, die Sie prüfen können",
  "home.features.claims.body": "{docs} Rohdokumente erfasst. Jede Digest-Aussage ist auf Datenbankebene mit ihren Quelldokumenten verknüpft — keine Blackbox-Analyse.",
  "home.features.claims.link": "heutigen Digest lesen →",
  "home.features.scored.title": "Täglich gegen Experten bewertet",
  "home.features.scored.body": "{runs} Validierungsläufe gegen die täglichen ISW-Einschätzungen. Abdeckung, Lücken und Vorsprünge — veröffentlicht, nicht verborgen.",
  "home.features.scored.link": "sehen, wie wir bewerten →",
  "home.footer": "OSINT-Datenintelligenz · Analyse abgeleitet aus offenen Quellen; Quellenbewertungen sind statistische Artefakte des Zitierverhaltens, keine Empfehlungen.",
  "countries.title": "Abdeckung",
  "countries.subtitle": "Länderspezifische Konfliktbeobachtungs-Feeds, täglich bewertet und verdichtet.",
  "countries.first_digest_pending": "erster Digest ausstehend",
  "countries.view_digest": "Digest ansehen →",
  "countries.empty": "Noch keine Abdeckung.",
  "pricing.title": "Preise für Gründungsabonnenten",
  "pricing.subtitle": "Voller Zugang für Analysten und Desks.",
  "pricing.cta.subscribe": "Abonnieren",
  "pricing.cta.request": "Zugang anfragen",
  "pricing.email_placeholder": "geschäftliche E-Mail",
  "pricing.note": "Gründungsabonnent, jährlich: voller Zugang, fester Tarif.",
  "registry.title": "Quellenregister",
  "registry.search_placeholder": "suchen…",
  "registry.col.source": "Quelle",
  "registry.col.platform": "Plattform",
  "registry.col.status": "Status",
  "registry.col.cited": "zitiert",
  "registry.col.hedging_mix": "Hedging-Mix",
  "registry.status.decayed": "verfallen",
  "scoreboard.title": "Validierungstabelle",
  "scoreboard.empty": "Noch keine Validierungsläufe.",
  "scoreboard.col.theater": "Schauplatz",
  "scoreboard.col.coverage": "Abdeckung",
  "scoreboard.col.lead": "Vorsprung (Std.)",
  "scoreboard.avg_coverage": "durchschn. Ereignisabdeckung ggü. ISW",
  "scoreboard.median_lead": "medianer Informationsvorsprung ggü. ISW-Veröffentlichung",
  "scoreboard.thin_sourced": "dünn belegt",
  "digest.no_events": "Keine Ereignisse extrahiert.",
  "digest.view_for": "Ansicht für:",
  "digest.sources": "Quellen",
  "digest.confidence": "Konfidenz",
  "digest.track.military": "Militärische Lage",
  "digest.track.elite": "Elitenpolitik & Strafverfolgung",
  "ask.title": "Die Erkenntnisse befragen",
  "ask.subtitle": "Zitierte Belege",
  "ask.placeholder": "z. B. welche Oligarchen werden strafrechtlich verfolgt?",
  "ask.submit": "Fragen",
  "ask.examples": "Probieren Sie eine davon",
  "auth.signin": "Anmelden",
  "auth.email_placeholder": "sie@beispiel.de",
  "auth.send_link": "Magischen Link senden",
  "auth.sent": "Prüfen Sie Ihre E-Mail auf einen Anmeldelink.",
  "common.status": "Status",
  "common.loading": "Wird geladen…",
  "common.empty": "Noch nichts vorhanden.",
  "common.error": "Etwas ist schiefgelaufen.",
  "common.retry": "Erneut versuchen",
  "common.back": "Zurück",
  "common.updated": "Aktualisiert",
  "common.learn_more": "Mehr erfahren",
};

// Arabic (RTL)
const ar: Dict = {
  "nav.home": "الرئيسية",
  "nav.theaters": "مسارح العمليات",
  "nav.ru_registry": "سجل روسيا",
  "nav.me_registry": "سجل الشرق الأوسط",
  "nav.scoreboard": "لوحة التحقق",
  "nav.ask": "اسأل",
  "nav.datadark": "فجوات البيانات",
  "nav.trade": "التحايل التجاري",
  "nav.signals": "إشارات",
  "nav.materials": "المواد الحرجة",
  "nav.pricing": "الأسعار",
  "nav.signin": "تسجيل الدخول",
  "nav.language": "اللغة",
  "nav.group.product": "المنتج",
  "nav.group.coverage": "التغطية",
  "nav.group.validation": "التحقق",
  "nav.group.solutions": "الحلول",
  "nav.group.pricing": "الأسعار",
  "nav.item.feeds": "تدفقات استخباراتية يومية",
  "nav.item.ask": "اسأل البيانات",
  "nav.item.registry": "سجل موثوقية المصادر",
  "nav.item.me_registry": "سجل الشرق الأوسط",
  "nav.item.signals": "إشارات المحللين",
  "nav.item.all_theaters": "جميع مسارح العمليات",
  "nav.item.sanctions": "العقوبات والتحايل التجاري",
  "nav.item.commodity": "مخاطر السلع وسلاسل التوريد",
  "nav.item.opacity": "حجب البيانات الاقتصادية",
  "nav.item.political_risk": "المخاطر السياسية والإشارات",
  "nav.account": "الحساب",
  "nav.signout": "تسجيل الخروج",
  "nav.menu": "القائمة",
  "nav.close": "إغلاق",
  "home.tagline": "تقييمات شفافة لموثوقية المصادر لأغراض OSINT في مناطق النزاع",
  "home.sub": "تدفقات استخباراتية لكل بلد من الأخبار المفتوحة وTelegram والمصادر الاجتماعية — مُقيَّمة حسب الموثوقية، ومدمجة في موجز يومي، ومُتحقَّق منها كل يوم مقابل تحليل بشري خبير. كل ادعاء يرتبط بدليله.",
  "home.cta.subscribe": "كن مشتركًا مؤسسًا",
  "home.cta.scoreboard": "شاهد لوحة التحقق",
  "home.cta.digest": "اقرأ موجز اليوم",
  "home.cta.coverage": "استكشف التغطية المباشرة",
  "home.live": "مباشر الآن: روسيا · أوكرانيا · إيران",
  "home.live_label": "مباشر الآن",
  "home.theater.ru": "روسيا",
  "home.theater.ua": "أوكرانيا",
  "home.theater.ir": "إيران",
  "home.features.reliability.title": "موثوقية مُستنتَجة لا مُدَّعاة",
  "home.features.reliability.body": "{sources} مصدرًا مُقيَّمًا من {citations} اقتباسًا عبر أكثر من 4 سنوات من التقارير الخبيرة — كم مرة يُؤكَّد كل مصدر أو يُدَّعى فقط أو لا يُتحقَّق منه أبدًا.",
  "home.features.reliability.link": "استكشف السجل ←",
  "home.features.claims.title": "ادعاءات يمكنك تدقيقها",
  "home.features.claims.body": "{docs} وثيقة خام مُستوعَبة. كل ادعاء في الموجز مرتبط بوثائق مصدره على مستوى قاعدة البيانات — لا تحليل صندوق أسود.",
  "home.features.claims.link": "اقرأ موجز اليوم ←",
  "home.features.scored.title": "مُقيَّم مقابل الخبراء يوميًا",
  "home.features.scored.body": "{runs} عملية تحقق مقابل تقييمات ISW اليومية. التغطية والإغفالات والأسبقية — منشورة لا مخفية.",
  "home.features.scored.link": "شاهد كيف نُقيّم ←",
  "home.footer": "استخبارات بيانات OSINT · تحليل مُستنتَج من مصادر مفتوحة؛ تقييمات المصادر نتاج إحصائي لسلوك الاقتباس، وليست توصيات.",
  "countries.title": "التغطية",
  "countries.subtitle": "تدفقات مراقبة النزاع لكل بلد، مُقيَّمة ومدمجة يوميًا.",
  "countries.first_digest_pending": "الموجز الأول قيد الإعداد",
  "countries.view_digest": "عرض الموجز ←",
  "countries.empty": "لا توجد تغطية بعد.",
  "pricing.title": "أسعار المشترك المؤسس",
  "pricing.subtitle": "وصول كامل للمحللين والفرق.",
  "pricing.cta.subscribe": "اشترك",
  "pricing.cta.request": "اطلب الوصول",
  "pricing.email_placeholder": "البريد المهني",
  "pricing.note": "مشترك مؤسس سنويًا: وصول كامل بسعر ثابت.",
  "registry.title": "سجل المصادر",
  "registry.search_placeholder": "بحث…",
  "registry.col.source": "المصدر",
  "registry.col.platform": "المنصة",
  "registry.col.status": "الحالة",
  "registry.col.cited": "مُقتبَس",
  "registry.col.hedging_mix": "مزيج التحوّط",
  "registry.status.decayed": "متلاشٍ",
  "scoreboard.title": "لوحة التحقق",
  "scoreboard.empty": "لا توجد عمليات تحقق بعد.",
  "scoreboard.col.theater": "المسرح",
  "scoreboard.col.coverage": "التغطية",
  "scoreboard.col.lead": "الأسبقية (ساعات)",
  "scoreboard.avg_coverage": "متوسط تغطية الأحداث مقابل ISW",
  "scoreboard.median_lead": "وسيط الأسبقية المعلوماتية مقابل نشر ISW",
  "scoreboard.thin_sourced": "ضعيف المصادر",
  "digest.no_events": "لم تُستخرج أحداث.",
  "digest.view_for": "عرض لـ:",
  "digest.sources": "المصادر",
  "digest.confidence": "الثقة",
  "digest.track.military": "الوضع العسكري",
  "digest.track.elite": "سياسة النخبة والملاحقات",
  "ask.title": "استجوب المعلومات الاستخباراتية",
  "ask.subtitle": "أدلة موثَّقة",
  "ask.placeholder": "مثال: أي الأوليغارشيين يخضعون للملاحقة؟",
  "ask.submit": "اسأل",
  "ask.examples": "جرّب أحد هذه",
  "auth.signin": "تسجيل الدخول",
  "auth.email_placeholder": "you@example.com",
  "auth.send_link": "أرسل رابط الدخول السحري",
  "auth.sent": "تحقق من بريدك للحصول على رابط تسجيل الدخول.",
  "common.status": "الحالة",
  "common.loading": "جارٍ التحميل…",
  "common.empty": "لا شيء هنا بعد.",
  "common.error": "حدث خطأ ما.",
  "common.retry": "أعد المحاولة",
  "common.back": "رجوع",
  "common.updated": "مُحدَّث",
  "common.learn_more": "اعرف المزيد",
};

// Japanese
const ja: Dict = {
  "nav.home": "ホーム",
  "nav.theaters": "戦域",
  "nav.ru_registry": "ロシア登録簿",
  "nav.me_registry": "中東登録簿",
  "nav.scoreboard": "検証スコアボード",
  "nav.ask": "質問",
  "nav.datadark": "データ空白",
  "nav.trade": "貿易迂回",
  "nav.signals": "シグナル",
  "nav.materials": "重要鉱物",
  "nav.pricing": "料金",
  "nav.signin": "サインイン",
  "nav.language": "言語",
  "nav.group.product": "製品",
  "nav.group.coverage": "カバレッジ",
  "nav.group.validation": "検証",
  "nav.group.solutions": "ソリューション",
  "nav.group.pricing": "料金",
  "nav.item.feeds": "日次インテリジェンスフィード",
  "nav.item.ask": "データに質問する",
  "nav.item.registry": "情報源信頼性登録簿",
  "nav.item.me_registry": "中東登録簿",
  "nav.item.signals": "アナリストシグナル",
  "nav.item.all_theaters": "すべての戦域",
  "nav.item.sanctions": "制裁と貿易迂回",
  "nav.item.commodity": "コモディティ・サプライチェーンリスク",
  "nav.item.opacity": "経済データの秘匿",
  "nav.item.political_risk": "政治リスクとシグナル",
  "nav.account": "アカウント",
  "nav.signout": "サインアウト",
  "nav.menu": "メニュー",
  "nav.close": "閉じる",
  "home.tagline": "紛争地域OSINTのための透明な情報源信頼性評価",
  "home.sub": "公開ニュース、Telegram、ソーシャル情報源からの国別インテリジェンスフィード。信頼性で評価し、日次ダイジェストに統合し、専門家による分析と毎日照合します。すべての主張は証拠にリンクしています。",
  "home.cta.subscribe": "創設サブスクライバーになる",
  "home.cta.scoreboard": "スコアボードを見る",
  "home.cta.digest": "今日のダイジェストを読む",
  "home.cta.coverage": "稼働中のカバレッジを見る",
  "home.live": "稼働中：ロシア · ウクライナ · イラン",
  "home.live_label": "稼働中",
  "home.theater.ru": "ロシア",
  "home.theater.ua": "ウクライナ",
  "home.theater.ir": "イラン",
  "home.features.reliability.title": "主張ではなく導出された信頼性",
  "home.features.reliability.body": "4年以上の専門的報道による{citations}件の引用から{sources}件の情報源を評価 — 各情報源がどれだけ確認され、単に主張され、あるいは一度も検証されなかったか。",
  "home.features.reliability.link": "登録簿を見る →",
  "home.features.claims.title": "検証できる主張",
  "home.features.claims.body": "{docs}件の生文書を取り込み。ダイジェストの各主張はデータベースレベルで情報源文書にリンクされています — ブラックボックス分析はありません。",
  "home.features.claims.link": "今日のダイジェストを読む →",
  "home.features.scored.title": "毎日、専門家と照合して採点",
  "home.features.scored.body": "ISWの日次評価に対する{runs}回の検証実行。カバレッジ、見落とし、先行 — 隠さず公開します。",
  "home.features.scored.link": "採点方法を見る →",
  "home.footer": "OSINTデータインテリジェンス · 公開情報源から導出した分析。情報源評価は引用行動の統計的産物であり、推奨ではありません。",
  "countries.title": "カバレッジ",
  "countries.subtitle": "国別の紛争監視フィード。毎日採点・統合します。",
  "countries.first_digest_pending": "最初のダイジェストを準備中",
  "countries.view_digest": "ダイジェストを見る →",
  "countries.empty": "まだカバレッジがありません。",
  "pricing.title": "創設サブスクライバー料金",
  "pricing.subtitle": "アナリストとデスク向けのフルアクセス。",
  "pricing.cta.subscribe": "購読する",
  "pricing.cta.request": "アクセスを申請",
  "pricing.email_placeholder": "業務用メール",
  "pricing.note": "創設サブスクライバー年額：フルアクセス、固定料金。",
  "registry.title": "情報源登録簿",
  "registry.search_placeholder": "検索…",
  "registry.col.source": "情報源",
  "registry.col.platform": "プラットフォーム",
  "registry.col.status": "状態",
  "registry.col.cited": "被引用",
  "registry.col.hedging_mix": "ヘッジング構成",
  "registry.status.decayed": "減衰",
  "scoreboard.title": "検証スコアボード",
  "scoreboard.empty": "検証実行はまだありません。",
  "scoreboard.col.theater": "戦域",
  "scoreboard.col.coverage": "カバレッジ",
  "scoreboard.col.lead": "先行（時間）",
  "scoreboard.avg_coverage": "ISW比の平均イベントカバレッジ",
  "scoreboard.median_lead": "ISW公開比の情報先行の中央値",
  "scoreboard.thin_sourced": "情報源が乏しい",
  "digest.no_events": "抽出されたイベントはありません。",
  "digest.view_for": "表示対象：",
  "digest.sources": "情報源",
  "digest.confidence": "確信度",
  "digest.track.military": "軍事情勢",
  "digest.track.elite": "エリート政治と訴追",
  "ask.title": "インテリジェンスに問い合わせる",
  "ask.subtitle": "引用付き証拠",
  "ask.placeholder": "例：どのオリガルヒが訴追されていますか？",
  "ask.submit": "質問する",
  "ask.examples": "こちらを試してください",
  "auth.signin": "サインイン",
  "auth.email_placeholder": "you@example.com",
  "auth.send_link": "マジックリンクを送信",
  "auth.sent": "サインインリンクをメールでご確認ください。",
  "common.status": "状態",
  "common.loading": "読み込み中…",
  "common.empty": "まだ何もありません。",
  "common.error": "問題が発生しました。",
  "common.retry": "再試行",
  "common.back": "戻る",
  "common.updated": "更新済み",
  "common.learn_more": "詳細",
};

// Polish
const pl: Dict = {
  "nav.home": "start",
  "nav.theaters": "teatry działań",
  "nav.ru_registry": "rejestr RU",
  "nav.me_registry": "rejestr BW",
  "nav.scoreboard": "tabela walidacji",
  "nav.ask": "zapytaj",
  "nav.datadark": "luki w danych",
  "nav.trade": "obchodzenie sankcji handlowych",
  "nav.signals": "sygnały",
  "nav.materials": "surowce krytyczne",
  "nav.pricing": "cennik",
  "nav.signin": "zaloguj się",
  "nav.language": "Język",
  "nav.group.product": "Produkt",
  "nav.group.coverage": "Pokrycie",
  "nav.group.validation": "Walidacja",
  "nav.group.solutions": "Rozwiązania",
  "nav.group.pricing": "Cennik",
  "nav.item.feeds": "Codzienne kanały wywiadowcze",
  "nav.item.ask": "Zapytaj dane",
  "nav.item.registry": "Rejestr wiarygodności źródeł",
  "nav.item.me_registry": "Rejestr Bliskiego Wschodu",
  "nav.item.signals": "Sygnały analityczne",
  "nav.item.all_theaters": "Wszystkie teatry działań",
  "nav.item.sanctions": "Sankcje i obchodzenie handlu",
  "nav.item.commodity": "Ryzyko surowcowe i łańcucha dostaw",
  "nav.item.opacity": "Ukrywanie danych gospodarczych",
  "nav.item.political_risk": "Ryzyko polityczne i sygnały",
  "nav.account": "Konto",
  "nav.signout": "Wyloguj się",
  "nav.menu": "Menu",
  "nav.close": "Zamknij",
  "home.tagline": "Przejrzyste oceny wiarygodności źródeł dla OSINT w strefach konfliktu",
  "home.sub": "Wywiadowcze kanały dla poszczególnych krajów z otwartych wiadomości, serwisu Telegram i źródeł społecznościowych — oceniane pod kątem wiarygodności, łączone w codzienny skrót i codziennie weryfikowane wobec eksperckiej analizy. Każde twierdzenie odsyła do swojego dowodu.",
  "home.cta.subscribe": "Zostań subskrybentem założycielem",
  "home.cta.scoreboard": "Zobacz tabelę walidacji",
  "home.cta.digest": "Przeczytaj dzisiejszy skrót",
  "home.cta.coverage": "Poznaj pokrycie na żywo",
  "home.live": "Na żywo: Rosja · Ukraina · Iran",
  "home.live_label": "Na żywo",
  "home.theater.ru": "Rosja",
  "home.theater.ua": "Ukraina",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Wiarygodność wyprowadzona, nie deklarowana",
  "home.features.reliability.body": "{sources} źródeł ocenionych na podstawie {citations} cytowań z ponad 4 lat eksperckiego dziennikarstwa — jak często każde źródło jest potwierdzone, jedynie deklarowane lub nigdy nie zweryfikowane.",
  "home.features.reliability.link": "przeglądaj rejestr →",
  "home.features.claims.title": "Twierdzenia, które możesz zweryfikować",
  "home.features.claims.body": "{docs} surowych dokumentów pozyskanych. Każde twierdzenie w skrócie jest powiązane ze swoimi dokumentami źródłowymi na poziomie bazy danych — żadnej analizy typu czarna skrzynka.",
  "home.features.claims.link": "przeczytaj dzisiejszy skrót →",
  "home.features.scored.title": "Codziennie oceniane wobec ekspertów",
  "home.features.scored.body": "{runs} przebiegów walidacji wobec codziennych ocen ISW. Pokrycie, braki i przewagi — publikowane, nie ukrywane.",
  "home.features.scored.link": "zobacz, jak oceniamy →",
  "home.footer": "Wywiad danych OSINT · analiza wyprowadzona z otwartych źródeł; oceny źródeł to statystyczne artefakty zachowań cytowania, nie rekomendacje.",
  "countries.title": "Pokrycie",
  "countries.subtitle": "Kanały monitorowania konfliktów dla poszczególnych krajów, oceniane i łączone codziennie.",
  "countries.first_digest_pending": "pierwszy skrót w toku",
  "countries.view_digest": "zobacz skrót →",
  "countries.empty": "Brak pokrycia.",
  "pricing.title": "Cennik dla subskrybentów założycieli",
  "pricing.subtitle": "Pełny dostęp dla analityków i zespołów.",
  "pricing.cta.subscribe": "Subskrybuj",
  "pricing.cta.request": "Poproś o dostęp",
  "pricing.email_placeholder": "e-mail służbowy",
  "pricing.note": "Subskrybent założyciel, rocznie: pełny dostęp, stała stawka.",
  "registry.title": "Rejestr źródeł",
  "registry.search_placeholder": "szukaj…",
  "registry.col.source": "źródło",
  "registry.col.platform": "platforma",
  "registry.col.status": "status",
  "registry.col.cited": "cytowane",
  "registry.col.hedging_mix": "profil ostrożności",
  "registry.status.decayed": "wygasłe",
  "scoreboard.title": "Tabela walidacji",
  "scoreboard.empty": "Brak przebiegów walidacji.",
  "scoreboard.col.theater": "teatr",
  "scoreboard.col.coverage": "pokrycie",
  "scoreboard.col.lead": "przewaga (godz.)",
  "scoreboard.avg_coverage": "śr. pokrycie zdarzeń vs ISW",
  "scoreboard.median_lead": "mediana przewagi informacyjnej vs publikacja ISW",
  "scoreboard.thin_sourced": "słabo udokumentowane",
  "digest.no_events": "Nie wyodrębniono zdarzeń.",
  "digest.view_for": "widok dla:",
  "digest.sources": "źródła",
  "digest.confidence": "pewność",
  "digest.track.military": "Sytuacja militarna",
  "digest.track.elite": "Polityka elit i postępowania karne",
  "ask.title": "Przepytaj dane wywiadowcze",
  "ask.subtitle": "Cytowane dowody",
  "ask.placeholder": "np. którzy oligarchowie są ścigani?",
  "ask.submit": "Zapytaj",
  "ask.examples": "Wypróbuj jedno z tych",
  "auth.signin": "Zaloguj się",
  "auth.email_placeholder": "ty@przyklad.pl",
  "auth.send_link": "Wyślij magiczny link",
  "auth.sent": "Sprawdź e-mail w poszukiwaniu linku do logowania.",
  "common.status": "status",
  "common.loading": "Ładowanie…",
  "common.empty": "Jeszcze nic tu nie ma.",
  "common.error": "Coś poszło nie tak.",
  "common.retry": "Spróbuj ponownie",
  "common.back": "Wstecz",
  "common.updated": "Zaktualizowano",
  "common.learn_more": "Dowiedz się więcej",
};

// French
const fr: Dict = {
  "nav.home": "accueil",
  "nav.theaters": "théâtres",
  "nav.ru_registry": "registre RU",
  "nav.me_registry": "registre MO",
  "nav.scoreboard": "tableau de validation",
  "nav.ask": "interroger",
  "nav.datadark": "zones d'ombre",
  "nav.trade": "contournement commercial",
  "nav.signals": "signaux",
  "nav.materials": "matériaux critiques",
  "nav.pricing": "tarifs",
  "nav.signin": "se connecter",
  "nav.language": "Langue",
  "nav.group.product": "Produit",
  "nav.group.coverage": "Couverture",
  "nav.group.validation": "Validation",
  "nav.group.solutions": "Solutions",
  "nav.group.pricing": "Tarifs",
  "nav.item.feeds": "Flux de renseignement quotidiens",
  "nav.item.ask": "Interroger les données",
  "nav.item.registry": "Registre de fiabilité des sources",
  "nav.item.me_registry": "Registre Moyen-Orient",
  "nav.item.signals": "Signaux d'analyste",
  "nav.item.all_theaters": "Tous les théâtres",
  "nav.item.sanctions": "Sanctions et contournement commercial",
  "nav.item.commodity": "Risque matières premières et chaîne d'approvisionnement",
  "nav.item.opacity": "Suppression des données économiques",
  "nav.item.political_risk": "Risque politique et signaux",
  "nav.account": "Compte",
  "nav.signout": "Se déconnecter",
  "nav.menu": "Menu",
  "nav.close": "Fermer",
  "home.tagline": "Évaluations transparentes de la fiabilité des sources pour l'OSINT en zone de conflit",
  "home.sub": "Des flux de renseignement par pays issus de l'actualité ouverte, de Telegram et des sources sociales — notés pour leur fiabilité, fusionnés en un digest quotidien et validés chaque jour face à l'analyse humaine experte. Chaque affirmation renvoie à sa preuve.",
  "home.cta.subscribe": "Devenir abonné fondateur",
  "home.cta.scoreboard": "Voir le tableau de validation",
  "home.cta.digest": "Lire le digest du jour",
  "home.cta.coverage": "Explorer la couverture en direct",
  "home.live": "En direct : Russie · Ukraine · Iran",
  "home.live_label": "En direct",
  "home.theater.ru": "Russie",
  "home.theater.ua": "Ukraine",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Une fiabilité déduite, non affirmée",
  "home.features.reliability.body": "{sources} sources notées à partir de {citations} citations sur plus de 4 ans de reportage expert — à quelle fréquence chaque source est confirmée, simplement affirmée ou jamais vérifiée.",
  "home.features.reliability.link": "explorer le registre →",
  "home.features.claims.title": "Des affirmations vérifiables",
  "home.features.claims.body": "{docs} documents bruts ingérés. Chaque affirmation du digest est liée à ses documents sources au niveau de la base de données — aucune analyse boîte noire.",
  "home.features.claims.link": "lire le digest du jour →",
  "home.features.scored.title": "Noté face aux experts, chaque jour",
  "home.features.scored.body": "{runs} cycles de validation face aux évaluations quotidiennes de l'ISW. Couverture, manques et avances — publiés, non dissimulés.",
  "home.features.scored.link": "voir comment nous notons →",
  "home.footer": "Renseignement de données OSINT · analyse issue de sources ouvertes ; les notes de sources sont des artefacts statistiques du comportement de citation, non des recommandations.",
  "countries.title": "Couverture",
  "countries.subtitle": "Flux de suivi des conflits par pays, notés et fusionnés chaque jour.",
  "countries.first_digest_pending": "premier digest en attente",
  "countries.view_digest": "voir le digest →",
  "countries.empty": "Pas encore de couverture.",
  "pricing.title": "Tarifs abonné fondateur",
  "pricing.subtitle": "Accès complet pour analystes et desks.",
  "pricing.cta.subscribe": "S'abonner",
  "pricing.cta.request": "Demander l'accès",
  "pricing.email_placeholder": "e-mail professionnel",
  "pricing.note": "Abonné fondateur annuel : accès complet, tarif bloqué.",
  "registry.title": "Registre des sources",
  "registry.search_placeholder": "rechercher…",
  "registry.col.source": "source",
  "registry.col.platform": "plateforme",
  "registry.col.status": "statut",
  "registry.col.cited": "cité",
  "registry.col.hedging_mix": "profil de prudence",
  "registry.status.decayed": "obsolète",
  "scoreboard.title": "Tableau de validation",
  "scoreboard.empty": "Aucun cycle de validation pour l'instant.",
  "scoreboard.col.theater": "théâtre",
  "scoreboard.col.coverage": "couverture",
  "scoreboard.col.lead": "avance (h)",
  "scoreboard.avg_coverage": "couverture moyenne des événements vs ISW",
  "scoreboard.median_lead": "avance d'information médiane vs publication ISW",
  "scoreboard.thin_sourced": "peu sourcé",
  "digest.no_events": "Aucun événement extrait.",
  "digest.view_for": "vue pour :",
  "digest.sources": "sources",
  "digest.confidence": "confiance",
  "digest.track.military": "Situation militaire",
  "digest.track.elite": "Politique des élites & poursuites",
  "ask.title": "Interroger le renseignement",
  "ask.subtitle": "Preuves citées",
  "ask.placeholder": "ex. quels oligarques sont poursuivis ?",
  "ask.submit": "Interroger",
  "ask.examples": "Essayez l'une de ces questions",
  "auth.signin": "Se connecter",
  "auth.email_placeholder": "vous@exemple.fr",
  "auth.send_link": "Envoyer le lien magique",
  "auth.sent": "Consultez votre e-mail pour un lien de connexion.",
  "common.status": "statut",
  "common.loading": "Chargement…",
  "common.empty": "Rien pour l'instant.",
  "common.error": "Une erreur s'est produite.",
  "common.retry": "Réessayer",
  "common.back": "Retour",
  "common.updated": "Mis à jour",
  "common.learn_more": "En savoir plus",
};

// Locales with a full catalog. Others (es, he, ko) fall back to English per-key
// until translated.
const DICTS: Partial<Record<Locale, Dict>> = { en, uk, de, ar, ja, pl, fr };

/** Merged dictionary for a locale: fallback chain applied, English as the base. */
export function dict(locale: Locale): Dict {
  const chain = fallbackChain(locale).reverse(); // most-generic first, requested last
  const merged: Dict = {};
  for (const l of chain) Object.assign(merged, DICTS[l] ?? {});
  return merged;
}

/** A locale's OWN catalog with no fallback merge (undefined if untranslated). */
export function ownDict(locale: Locale): Dict | undefined {
  return DICTS[locale];
}

/**
 * Build a translator for a locale. `t(key)` returns the translated string (English
 * fallback, then the key itself). `t(key, vars)` interpolates {name} placeholders.
 */
export function makeT(locale: Locale) {
  const d = dict(locale);
  return (key: string, vars?: Record<string, string | number>): string => {
    const template = d[key] ?? en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{${name}}`,
    );
  };
}

export function isLocale(x: string | null | undefined): x is Locale {
  return !!x && (LOCALES as string[]).includes(x);
}

/** Validate a `?set=` selector value; returns the Locale or null (route guard). */
export function parseLocaleParam(raw: string | null | undefined): Locale | null {
  return isLocale(raw) ? raw : null;
}

/**
 * Resolve the active locale by priority: explicit (route/selector) → cookie →
 * Accept-Language → default. Pure and side-effect-free so it is unit-testable.
 */
export function resolveLocale(input: {
  explicit?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.explicit)) return input.explicit;
  if (isLocale(input.cookie)) return input.cookie;
  // Rank Accept-Language by q-weight (RFC 7231), not header order; ties keep order
  // (Array.prototype.sort is stable). Then pick the highest-ranked supported locale.
  const ranked = (input.acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        code: tag.split("-")[0].toLowerCase(),
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter((x) => x.code)
    .sort((a, b) => b.weight - a.weight);
  for (const { code } of ranked) {
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}
