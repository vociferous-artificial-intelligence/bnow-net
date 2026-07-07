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

/** How many registry-derived telegram channels to add on top of the curated set. */
export const REGISTRY_TELEGRAM_TOP_N = 50;
