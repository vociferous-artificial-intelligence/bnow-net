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
  const countries = country ? [country] : ["ru", "ua"];

  const results = [];
  for (const c of countries) {
    try {
      results.push(await generateDigest(c, date));
    } catch (e) {
      results.push({ countryIso2: c, date, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
