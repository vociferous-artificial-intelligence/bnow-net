// URL de-obfuscation, cleaning, and source-level canonicalization for ISW citations.

export type Platform =
  | "telegram"
  | "x"
  | "state_media"
  | "independent_media"
  | "gov"
  | "other";

/** ISW obfuscates some domains: "president dot gov.ua" -> "president.gov.ua". */
export function deobfuscate(raw: string): string {
  return raw.replace(/\s+dot\s+/gi, ".");
}

/** Clean a citation URL: de-obfuscate, trim junk punctuation, drop tracking params. */
export function cleanUrl(raw: string): string | null {
  let s = deobfuscate(raw.trim());
  s = s.replace(/[),.;\]]+$/, ""); // trailing punctuation from prose
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref_|si$)/i.test(p)) u.searchParams.delete(p);
    }
    u.hash = "";
    u.host = u.host.toLowerCase();
    return u.toString();
  } catch {
    return null;
  }
}

const STATE_MEDIA = new Set([
  "tass.ru", "tass.com", "ria.ru", "rt.com", "lenta.ru", "iz.ru", "rg.ru",
  "gazeta.ru", "vesti.ru", "smotrim.ru", "1tv.ru", "vz.ru", "kp.ru", "mk.ru",
  "interfax.ru", "rbc.ru", "kommersant.ru", "vedomosti.ru", "aif.ru",
  "sputniknews.com", "ukrinform.ua", "ukrinform.net", "armyinform.com.ua",
]);

const INDEPENDENT_MEDIA = new Set([
  "meduza.io", "novayagazeta.eu", "themoscowtimes.com", "istories.media",
  "kyivindependent.com", "pravda.com.ua", "unian.ua", "unian.net", "nv.ua",
  "hromadske.ua", "suspilne.media", "censor.net", "liga.net", "rbc.ua",
  "theinsider.ru", "theins.ru", "mediazona.ca", "zona.media", "bbc.com",
  "reuters.com", "apnews.com", "nytimes.com", "washingtonpost.com",
  "wsj.com", "ft.com", "theguardian.com", "cnn.com", "bloomberg.com",
  "radiosvoboda.org", "rferl.org", "currenttime.tv", "dw.com",
]);

function baseDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h;
}

function isGov(host: string): boolean {
  return (
    /\.gov(\.[a-z]{2})?$/.test(host) ||
    /(^|\.)gov\.[a-z]{2,3}$/.test(host) ||
    /kremlin\.ru$/.test(host) ||
    /mil\.ru$/.test(host) ||
    /mil\.gov\.ua$/.test(host) ||
    /mid\.ru$/.test(host) ||
    /president\.gov\.ua$/.test(host) ||
    /nato\.int$/.test(host) ||
    /europa\.eu$/.test(host) ||
    /state\.gov$/.test(host) ||
    /defense\.gov$/.test(host)
  );
}

export interface CanonicalSource {
  /** stable registry key, e.g. "t.me/rybar", "x.com/wartranslated", "tass.ru" */
  key: string;
  platform: Platform;
  /** display name, e.g. telegram channel handle */
  name: string;
  domain: string;
}

/**
 * Map a citation URL to its source-level identity (channel / account / outlet).
 * Individual posts collapse into their channel; domains collapse to base domain.
 */
export function canonicalSource(url: string): CanonicalSource | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = baseDomain(u.host);
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "t.me" || host === "telegram.me") {
    // t.me/s/channel/123, t.me/channel/123, t.me/channel
    let ch = parts[0] === "s" ? parts[1] : parts[0];
    if (!ch) return null;
    ch = ch.toLowerCase().replace(/^@/, "");
    if (["share", "joinchat", "proxy", "iv", "c"].includes(ch)) return null;
    return { key: `t.me/${ch}`, platform: "telegram", name: ch, domain: "t.me" };
  }

  if (["x.com", "twitter.com", "mobile.twitter.com", "nitter.net"].includes(host)) {
    const user = (parts[0] ?? "").toLowerCase().replace(/^@/, "");
    if (!user || ["i", "search", "hashtag", "home", "intent", "share"].includes(user))
      return null;
    return { key: `x.com/${user}`, platform: "x", name: user, domain: "x.com" };
  }

  if (!host || host === "understandingwar.org" || host === "criticalthreats.org") {
    // self-citations are not external sources
    return null;
  }

  let platform: Platform = "other";
  if (isGov(host)) platform = "gov";
  else if (STATE_MEDIA.has(host)) platform = "state_media";
  else if (INDEPENDENT_MEDIA.has(host)) platform = "independent_media";

  return { key: host, platform, name: host, domain: host };
}
