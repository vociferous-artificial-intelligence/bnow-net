import { NextRequest, NextResponse } from "next/server";
import { runMapCycle } from "@/lib/analysis/map-worker";
import { cronJobName, withCronRun } from "@/lib/usage/cron-run";

// Map stage (SHADOW): hourly per-doc claim extraction into doc_claims.
// Own cron group at :40 (vercel.json) — never shares a schedule slot with the
// digest crons, and zero writes to any digest table.
//
// Steady state needs no params. The backfill driver (scripts/map-backfill.ts)
// passes ?date=yyyy-mm-dd (one UTC day) repeatedly until the day drains, and
// ?dry=1 first for the printed cost estimate the budget gate requires.
// ?theater=ru narrows; ?cap=N overrides docs-per-run.
//
// maxDuration: a full run is ~25-40 micro-batch calls at ~5-10s each plus one
// possible 65s 429 sleep — 800s holds it with the same margin the digest route
// uses; measured wall-clock lands in cron_runs either way.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const date = q.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }
  const theater = q.get("theater");
  const cap = q.get("cap");
  const dryRun = q.get("dry") === "1";
  const opts = {
    date,
    theaters: theater ? [theater.toLowerCase()] : undefined,
    docCap: cap ? Number(cap) : undefined,
    dryRun,
  };

  // dry runs write nothing anywhere — keep them out of cron_runs too
  if (dryRun) {
    const counts = await runMapCycle(opts, {});
    return NextResponse.json({ ok: true, dryRun: true, counts });
  }
  return withCronRun(cronJobName("map", date ? "backfill" : null), async (counts) => {
    await runMapCycle(opts, counts);
    return NextResponse.json({ ok: true, counts });
  });
}
