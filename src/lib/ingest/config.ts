import type { RssFeedConfig } from "../adapters/rss";

// Live feed roster (verified reachable 2026-07-04 from build host).
// TASS/RIA/Lenta direct RSS unreachable from this network — their voice enters
// via their Telegram channels below. See docs/BLOCKERS.md / decision log.

export const RSS_FEEDS: RssFeedConfig[] = [
  { url: "https://meduza.io/rss/en/all", sourceKey: "meduza.io", lang: "en", countryIso2: "ru", name: "Meduza (EN)" },
  { url: "https://www.themoscowtimes.com/rss/news", sourceKey: "themoscowtimes.com", lang: "en", countryIso2: "ru", name: "Moscow Times" },
  { url: "https://novayagazeta.eu/feed/rss", sourceKey: "novayagazeta.eu", lang: "ru", countryIso2: "ru", name: "Novaya Gazeta Europe" },
  { url: "https://theins.ru/feed", sourceKey: "theins.ru", lang: "ru", countryIso2: "ru", name: "The Insider" },
  { url: "https://www.pravda.com.ua/rss/view_news/", sourceKey: "pravda.com.ua", lang: "uk", countryIso2: "ua", name: "Ukrainska Pravda" },
  { url: "https://mil.in.ua/en/feed/", sourceKey: "mil.in.ua", lang: "en", countryIso2: "ua", name: "Militarnyi (EN)" },
  { url: "https://euromaidanpress.com/feed/", sourceKey: "euromaidanpress.com", lang: "en", countryIso2: "ua", name: "Euromaidan Press" },
  { url: "https://armyinform.com.ua/feed/", sourceKey: "armyinform.com.ua", lang: "uk", countryIso2: "ua", name: "ArmyInform (UA MoD)" },
  // elite-politics track: courts / prosecutions / business-elite coverage
  { url: "https://zona.media/rss", sourceKey: "zona.media", lang: "ru", countryIso2: "ru", name: "Mediazona" },
  // kommersant/rbc are TCP-blocked from the build host but may resolve from
  // Vercel egress — adapter warns and skips cleanly if not
  { url: "https://www.kommersant.ru/RSS/news.xml", sourceKey: "kommersant.ru", lang: "ru", countryIso2: "ru", name: "Kommersant" },
  { url: "https://rssexport.rbc.ru/rbcnews/news/30/full.rss", sourceKey: "rbc.ru", lang: "ru", countryIso2: "ru", name: "RBC" },
  // Russia analytical depth: Verstka (mobilization/casualty investigations).
  // RFE/RL regional services (Idel.Realii, Azatliq, Kavkaz.Realii, Sibir.Realii)
  // have empty/degraded RSS APIs — their content enters via telegram mirrors below.
  { url: "https://verstka.media/feed", sourceKey: "verstka.media", lang: "ru", countryIso2: "ru", name: "Verstka" },
  // Gulf / Israel / Iran wave — public news first, social later (playbook step 4).
  // All verified reachable 2026-07-05.
  // timesofisrael bot-walls Vercel egress (403, reconfirmed 2026-07-07); il
  // revived via jpost + ynet instead (feed-health pass, OPEN-TASKS #10)
  { url: "https://www.timesofisrael.com/feed/", sourceKey: "timesofisrael.com", lang: "en", countryIso2: "il", name: "Times of Israel" },
  { url: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx", sourceKey: "jpost.com", lang: "en", countryIso2: "il", name: "Jerusalem Post" },
  { url: "https://www.ynetnews.com/Integration/StoryRss3082.xml", sourceKey: "ynetnews.com", lang: "en", countryIso2: "il", name: "Ynetnews" },
  { url: "https://www.iranintl.com/en/rss", sourceKey: "iranintl.com", lang: "en", countryIso2: "ir", name: "Iran International (EN)" },
  { url: "https://iranwire.com/en/feed/", sourceKey: "iranwire.com", lang: "en", countryIso2: "ir", name: "IranWire (EN)" },
  // arabnews RSS froze upstream 2026-04-25 (reachable but stale — the cause of
  // "sa dark since Jul 5"); kept in case the publisher fixes it, sa lives on:
  { url: "https://www.arabnews.com/rss.xml", sourceKey: "arabnews.com", lang: "en", countryIso2: "sa", name: "Arab News" },
  { url: "https://saudigazette.com.sa/rssFeed/74", sourceKey: "saudigazette.com.sa", lang: "en", countryIso2: "sa", name: "Saudi Gazette" },
  { url: "https://english.aawsat.com/feed", sourceKey: "english.aawsat.com", lang: "en", countryIso2: "sa", name: "Asharq Al-Awsat (EN)" },
  { url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml", sourceKey: "thenationalnews.com", lang: "en", countryIso2: "ae", name: "The National" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", sourceKey: "aljazeera.com", lang: "en", countryIso2: "qa", name: "Al Jazeera (EN)" },
  { url: "https://dohanews.co/feed/", sourceKey: "dohanews.co", lang: "en", countryIso2: "qa", name: "Doha News" },
  { url: "https://timesofoman.com/feed", sourceKey: "timesofoman.com", lang: "en", countryIso2: "om", name: "Times of Oman" },
  // bh/kw: no working feed found 2026-07-07 (newsofbahrain + arabtimesonline
  // now return HTML not RSS; gdnonline/kuwaittimes 404; KUNA unreachable;
  // BNA 405) — theaters stay scaffolded; adapter warns + skips these cleanly
  { url: "https://www.newsofbahrain.com/rss.xml", sourceKey: "newsofbahrain.com", lang: "en", countryIso2: "bh", name: "News of Bahrain" },
  { url: "https://www.arabtimesonline.com/feed/", sourceKey: "arabtimesonline.com", lang: "en", countryIso2: "kw", name: "Arab Times (KW)" },
  // Iran/Gulf depth (2026-07-06, verified reachable): regional + Iranian state.
  { url: "https://www.middleeasteye.net/rss", sourceKey: "middleeasteye.net", lang: "en", countryIso2: "ir", name: "Middle East Eye" },
  { url: "https://www.al-monitor.com/rss", sourceKey: "al-monitor.com", lang: "en", countryIso2: "ir", name: "Al-Monitor" },
  { url: "https://www.presstv.ir/rss.xml", sourceKey: "presstv.ir", lang: "en", countryIso2: "ir", name: "Press TV (Iran state)" },
];

// Curated must-watch Telegram channels (state + mil-blogger + OSINT mix).
// The orchestrator augments this with top registry channels (active, most-cited).
export const TELEGRAM_CURATED: Array<{ channel: string; countryIso2: string }> = [
  { channel: "rybar", countryIso2: "ru" },
  { channel: "two_majors", countryIso2: "ru" },
  { channel: "wargonzo", countryIso2: "ru" },
  { channel: "mod_russia", countryIso2: "ru" },
  { channel: "tass_agency", countryIso2: "ru" },
  { channel: "rian_ru", countryIso2: "ru" },
  { channel: "DeepStateUA", countryIso2: "ua" },
  { channel: "GeneralStaffZSU", countryIso2: "ua" },
  { channel: "kpszsu", countryIso2: "ua" },
  { channel: "dsszzi_official", countryIso2: "ua" },
  // elite-politics track: police blotter / siloviki-leak / court channels
  { channel: "bazabazon", countryIso2: "ru" },
  { channel: "vchkogpu", countryIso2: "ru" },
  { channel: "sotaproject", countryIso2: "ru" },
  { channel: "ostorozhno_novosti", countryIso2: "ru" },
  // regional / semi-official / ethnic-republic layer (2026-07-05):
  // ASTRA — strikes/sabotage/industrial incidents inside RU; Gladkov — Belgorod
  // governor (semi-official, heavily ISW-cited); Kadyrov — Chechen faction voice;
  // 1ADAT — Chechen opposition; Asians of Russia — minority mobilization/casualties.
  { channel: "astrapress", countryIso2: "ru" },
  { channel: "vvgladkov", countryIso2: "ru" },
  { channel: "RKadyrov_95", countryIso2: "ru" },
  { channel: "IADAT", countryIso2: "ru" },
  { channel: "AsiansOfRussia", countryIso2: "ru" },
  // RFE/RL regional services via telegram mirrors (RSS APIs dead — see above):
  { channel: "idelrealii", countryIso2: "ru" },
  { channel: "kavkazrealii", countryIso2: "ru" },
  { channel: "sibrealii", countryIso2: "ru" },
  { channel: "azatliqradiosi", countryIso2: "ru" }, // Tatar-language
  { channel: "radiosvoboda", countryIso2: "ru" },
  // Iran/Gulf conflict-OSINT aggregators (2026-07-06, verified reachable):
  { channel: "OSINTdefender", countryIso2: "ir" },
  { channel: "warmonitors", countryIso2: "ir" },
  { channel: "AuroraIntel", countryIso2: "ir" },
];

/** Reads an env var as a positive integer; unset/non-numeric/non-positive values
 *  fall back to `fallback` so a bad Vercel env can never zero out or invert a
 *  registry cut. Exported for direct unit testing (spend-guard.ts's envNum/envCap
 *  precedent). */
export function envPositiveInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export type ReportTheater = "ru" | "ir";

/** Reads an env var as an isw_reports.theater filter for the registry ranking:
 *  'ru' = ROCA only, 'ir' = Iran Update only, 'all'/'any' = pan-theater (null, no
 *  filter — the explicit opt-out that restores the old blended ranking without a
 *  code change). Unset/empty/typo falls back to `fallback` (never silently
 *  pan-theater). */
export function envReportTheater(name: string, fallback: ReportTheater): ReportTheater | null {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "ru" || v === "ir") return v;
  if (v === "all" || v === "any") return null;
  return fallback;
}

/** How many registry-derived telegram channels to add on top of the curated set. */
export const REGISTRY_TELEGRAM_TOP_N = envPositiveInt("REGISTRY_TELEGRAM_TOP_N", 50);

/** MTProto reads deeper into the registry than the web scraper AND, by default, off
 *  a ROCA-only ranking (see REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER below): the
 *  2026-07-11 RU/UA evaluation sprint raised this from 75 (pan-theater) to 120
 *  (ROCA-only) so Iran-Update-only citations stop consuming MTProto's expansion
 *  slots and more RU/UA channels get included. Grow further only after a clean day
 *  at the new depth (sprint rule: more only after a clean day at the prior one). */
export const REGISTRY_TELEGRAM_TOP_N_MTPROTO = envPositiveInt("REGISTRY_TELEGRAM_TOP_N_MTPROTO", 120);

/** ISW report theater MTProto's registry ranking restricts citations to by
 *  default: 'ru' = ROCA (Russia/Ukraine), 'ir' = Iran Update, 'all'/'any' =
 *  pan-theater (null). ROCA-only is the RU/UA-priority default (2026-07-11); set
 *  the env to 'all' for a code-free rollback to the old blended ranking. Web
 *  Telegram is unaffected — it never passes a reportTheater, so its ranking stays
 *  pan-theater as before. */
export const REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER = envReportTheater(
  "REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER",
  "ru",
);

/** Theater overrides for REGISTRY-derived telegram channels, keyed by lowercase
 *  channel name. The registry (ISW citations) carries no country column, so
 *  registryTelegramChannels() files every channel it finds under the default ru
 *  theater. These five are Iranian state / semi-official outlets that ISW cites in
 *  its Iran Updates; they published 3,401 Persian documents into the ru corpus
 *  before this map existed (PIPELINE-AUDIT-2026-07 §9d).
 *
 *  The fa->ir language rule in theater.ts catches their Persian output on its own;
 *  this map is what also routes their English and Arabic posts correctly.
 *
 *  The three Lebanese Arabic channels route to ir per the operator's 2026-07-09
 *  adjudication of OPEN-TASKS #29: theater is a coverage lens, not nationality —
 *  Hezbollah/Lebanon proxy-network content sits inside the IRAN_MILITARY_PROMPT's
 *  scope and the ISW Iran Update validation baseline. Revisit as multi-theater
 *  source tagging at Tier-2/3 expansion (OPEN-TASKS #37). */
export const TELEGRAM_CHANNEL_THEATER: Record<string, string> = {
  nournews_ir: "ir",
  mehrnews: "ir",
  iribnews: "ir",
  farsna: "ir",
  defapress_ir: "ir",
  mtvlebanonews: "ir",
  sameralhajali: "ir",
  mmirleb: "ir",
  // MTProto expansion batch (registry ranks 51–75, 2026-07-11): the six channels
  // ISW cites in its Iran Updates, not ROCA — same coverage-lens rationale as the
  // Lebanese trio above (theater = which reference corpus scores them).
  rahbar_enghelab_ir: "ir",
  sepah_pasdaran: "ir",
  elamalmoqawama: "ir",
  bentzionm: "ir",
  presstv: "ir",
  manniefabian: "ir",
  // Ukraine official/military pins (RU/UA priority evaluation, 2026-07-11). These
  // are Ukrainian-theater sources whose ru/en posts the uk->ua language rule in
  // theater.ts (which only re-tags Ukrainian-LANGUAGE text) would otherwise leave
  // in the default ru bucket. All 27 verified against the production registry —
  // each is ROCA-cited (isw_reports.theater='ru') with ~0 Iran-Update citations,
  // sits inside the ROCA-only top-120 MTProto reads, and its ingested documents
  // are predominantly Ukrainian-language — plus a confirmed institutional/public
  // identity (see the comment on each). None are Russian-theater, so none of these
  // pins can misroute genuinely-Russian content.
  v_zelenskiy_official: "ua", // President Zelensky, official channel
  vitaliy_klitschko: "ua", // Kyiv city mayor
  ihor_terekhov: "ua", // Kharkiv city mayor
  synegubov: "ua", // Kharkiv Oblast Military Administration head
  ivan_fedorov_zp: "ua", // Zaporizhzhia Oblast Military Administration head
  sbukr: "ua", // SBU (Security Service of Ukraine)
  ukr_sof: "ua", // Ukrainian Special Operations Forces, press service
  usf_army: "ua", // Ukrainian Unmanned Systems Forces (Сили безпілотних систем)
  dsns_telegram: "ua", // DSNS — State Emergency Service of Ukraine
  ua_national_police: "ua", // National Police of Ukraine
  prokuratura_kharkiv: "ua", // Kharkiv Oblast Prosecutor's Office
  dnipropetrovskaoda: "ua", // Dnipropetrovsk Oblast Military Administration
  odeskaoda: "ua", // Odesa Oblast Military Administration
  odesamva: "ua", // Odesa City Military Administration (Одеська МВА)
  chernigivskaoda: "ua", // Chernihiv Oblast Military Administration
  khersonskaoda: "ua", // Kherson Oblast Military Administration
  kyivoda: "ua", // Kyiv Oblast Military Administration
  mykolaivskaoda: "ua", // Mykolaiv Oblast Military Administration
  zoda_gov_ua: "ua", // Zaporizhzhia Oblast state administration
  dniproofficial: "ua", // Dnipro city official channel
  sjtf_odes: "ua", // South Joint Task Force — "Захисники Півдня України" (Odesa)
  joint_forces_task_force: "ua", // Ukrainian Joint Forces grouping (Угруповання об'єднаних сил)
  wararchive_ua: "ua", // Ukraine-focused OSINT war-footage archive
  serhii_flash: "ua", // Ukrainian military OSINT commentator
  andriyshtime: "ua", // Ukrainian OSINT/journalist channel (posts some ru — pin is load-bearing there)
  robert_magyar: "ua", // Robert "Magyar" Brovdi, 414th UAV regiment commander
  atesh_ua: "ua", // Ukraine-aligned partisan/resistance network (occupied territories)
};

/** Default theater for a registry-derived telegram channel. */
export function channelTheater(channel: string): string {
  return TELEGRAM_CHANNEL_THEATER[channel.toLowerCase()] ?? "ru";
}
