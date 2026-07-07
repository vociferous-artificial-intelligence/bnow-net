import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { generateDigest } from "@/lib/analysis/digest";

export const maxDuration = 800;
export const dynamic = "force-dynamic";

// Digest generation, runs every 6h (vercel.json). Each run regenerates TODAY and
// YESTERDAY (idempotent upserts): today's digest fills in as the day progresses,
// yesterday's becomes the complete-day report — and is final before the 07:00 UTC
// validation run. ?date=yyyy-mm-dd overrides (single date); ?country / ?track narrow.
//
// ?group=core|gulf splits the matrix across two cron entries: the full serial run
// (2 dates x ~7 countries x 3 tracks) measured ~6 min wall-clock on 2026-07-07 —
// TPM-throttled LLM calls put a single RU military digest at ~3m40s — and a run
// that dies silently drops whichever theaters sort last (ua lost a today-digest).
// core = ru+ua (heavy, flagship, validated); gulf = every other active theater.
const GROUPS: Record<string, (iso2: string) => boolean> = {
  core: (c) => c === "ru" || c === "ua",
  gulf: (c) => c !== "ru" && c !== "ua",
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dateParam = req.nextUrl.searchParams.get("date");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 10);
  const dates = dateParam ? [dateParam] : [yesterday, today];

  const country = req.nextUrl.searchParams.get("country");
  const group = req.nextUrl.searchParams.get("group");
  let countries: string[];
  if (country) {
    countries = [country];
  } else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT iso2 FROM countries WHERE status = 'active' ORDER BY iso2`,
      );
      countries = rows.map((r) => r.iso2);
    } finally {
      await pool.end();
    }
    if (group && GROUPS[group]) countries = countries.filter(GROUPS[group]);
  }

  const trackParam = req.nextUrl.searchParams.get("track");
  const tracks = (trackParam ? [trackParam] : ["military", "elite_politics", "nuclear"]) as Array<
    "military" | "elite_politics" | "nuclear"
  >;

  const results = [];
  for (const date of dates) {
    for (const c of countries) {
      for (const t of tracks) {
        try {
          const r = await generateDigest(c, date, t);
          if (r) results.push(r); // null = track not configured for this country
        } catch (e) {
          results.push({
            countryIso2: c,
            date,
            track: t,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }
  return NextResponse.json({ ok: true, results });
}
