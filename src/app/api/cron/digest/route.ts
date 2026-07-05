import { NextRequest, NextResponse } from "next/server";
import { generateDigest } from "@/lib/analysis/digest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Daily digest generation. ?date=yyyy-mm-dd (default: today UTC), ?country=ru|ua (default both).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const country = req.nextUrl.searchParams.get("country");
  const trackParam = req.nextUrl.searchParams.get("track");
  const countries = country ? [country] : ["ru", "ua"];
  const tracks = (trackParam ? [trackParam] : ["military", "elite_politics"]) as Array<
    "military" | "elite_politics"
  >;

  const results = [];
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
  return NextResponse.json({ ok: true, results });
}
