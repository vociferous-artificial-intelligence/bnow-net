import type { MetadataRoute } from "next";
import { rawSql } from "@/db";
import { siteBaseUrl } from "@/lib/site-url";

// force-dynamic: the per-country entries are driven from the live active-theater list, so
// the sitemap must reflect the DB at request time (not freeze at build). Degrades to the
// static public set if the DB is briefly unreachable.
export const dynamic = "force-dynamic";

// The public, indexable surface only. Gated/admin/API routes are excluded here AND
// disallowed in robots.ts. Per-signal specifics have no URL (they're inline, and withheld
// from anonymous HTML), so nothing sensitive can be listed. IA-REFINEMENT-REVIEW.md TASK 3.
const STATIC_PATHS = [
  "/",
  "/countries",
  "/scoreboard",
  "/access",
  "/pricing",
  "/signals",
  "/trade",
  "/critical-materials",
  "/datadark",
  "/privacy",
  "/terms",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();

  let theaterPaths: string[] = [];
  try {
    const rows = (await rawSql.query(
      `SELECT iso2 FROM countries WHERE status = 'active' ORDER BY iso2`,
      [],
    )) as Array<{ iso2: string }>;
    theaterPaths = rows.map((r) => `/countries/${r.iso2}`);
  } catch {
    // degrade to the static set — a sitemap missing per-country pages beats a 500
  }

  return [...STATIC_PATHS, ...theaterPaths].map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: "daily" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
