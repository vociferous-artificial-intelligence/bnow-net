// Canonical absolute origin for SEO metadata routes (robots.txt, sitemap.xml, and any
// future canonical/OG URLs). `bnow.net` is the brand host — the bot User-Agent
// (src/lib/fetch-cache.ts) and the digest sender identity already use it — and is the
// domain the operator is attaching (SETUP-NEXT-WEEK). Overridable per environment via
// NEXT_PUBLIC_SITE_URL (e.g. a preview origin) without a code change.
export function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://bnow.net";
}
