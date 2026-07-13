// Canonical absolute origin for SEO metadata routes (robots.txt, sitemap.xml, and any
// future canonical/OG URLs). `bnow.net` is the brand host — the bot User-Agent
// (src/lib/fetch-cache.ts) and the digest sender identity already use it — and is the
// domain the operator is attaching (SETUP-NEXT-WEEK). Overridable per environment via
// NEXT_PUBLIC_SITE_URL (e.g. a preview origin) without a code change.
export function siteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // Vercel injects the production domain (the custom domain once attached, else the
  // .vercel.app host) — track it so robots/sitemap advertise the real serving origin,
  // and switch to bnow.net automatically when it becomes the production domain.
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "https://bnow.net";
}
