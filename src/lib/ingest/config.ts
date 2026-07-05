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
  // Gulf / Israel / Iran wave — public news first, social later (playbook step 4).
  // All verified reachable 2026-07-05.
  { url: "https://www.timesofisrael.com/feed/", sourceKey: "timesofisrael.com", lang: "en", countryIso2: "il", name: "Times of Israel" },
  { url: "https://www.iranintl.com/en/rss", sourceKey: "iranintl.com", lang: "en", countryIso2: "ir", name: "Iran International (EN)" },
  { url: "https://iranwire.com/en/feed/", sourceKey: "iranwire.com", lang: "en", countryIso2: "ir", name: "IranWire (EN)" },
  { url: "https://www.arabnews.com/rss.xml", sourceKey: "arabnews.com", lang: "en", countryIso2: "sa", name: "Arab News" },
  { url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml", sourceKey: "thenationalnews.com", lang: "en", countryIso2: "ae", name: "The National" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", sourceKey: "aljazeera.com", lang: "en", countryIso2: "qa", name: "Al Jazeera (EN)" },
  { url: "https://dohanews.co/feed/", sourceKey: "dohanews.co", lang: "en", countryIso2: "qa", name: "Doha News" },
  { url: "https://timesofoman.com/feed", sourceKey: "timesofoman.com", lang: "en", countryIso2: "om", name: "Times of Oman" },
  { url: "https://www.newsofbahrain.com/rss.xml", sourceKey: "newsofbahrain.com", lang: "en", countryIso2: "bh", name: "News of Bahrain" },
  { url: "https://www.arabtimesonline.com/feed/", sourceKey: "arabtimesonline.com", lang: "en", countryIso2: "kw", name: "Arab Times (KW)" },
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
];

/** How many registry-derived telegram channels to add on top of the curated set. */
export const REGISTRY_TELEGRAM_TOP_N = 50;
