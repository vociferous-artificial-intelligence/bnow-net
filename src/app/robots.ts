import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/site-url";

// Deliberate crawl policy (IA-REFINEMENT-REVIEW.md TASK 3). The site had no robots.txt
// (it 404'd), so nothing steered crawlers. Public marketing + teaser pages stay
// crawlable; the gated and non-content routes are disallowed so search engines don't
// crawl auth redirects or index anything behind the FEATURE_AUTH_GATE / admin gate.
//
// The gated signal *specifics* are withheld from the /signals HTML for anonymous clients
// at the data layer (toPublicSignal), so /signals itself is intentionally NOT disallowed —
// crawlers only ever see the safe teaser. Only the truly gated routes are blocked below.
export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/account",
        "/signin",
        "/welcome/", // authenticated legal-acceptance flow (noindex too)
        "/digests/", // FEATURE_AUTH_GATE (requireUser)
        "/ask", // gated
        "/search", // gated
        "/entities/", // gated
        "/registry", // admin-only (requireAdminOr404)
        "/middle-east", // admin-only
        "/health", // status page, not content
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
