import { NextRequest, NextResponse } from "next/server";
import { runIngest, type IngestWhich } from "@/lib/ingest/run";
import { cronJobName, withCronRun } from "@/lib/usage/cron-run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const which = (req.nextUrl.searchParams.get("which") ?? "all") as IngestWhich;
  return withCronRun(cronJobName("ingest", which), async (counts) => {
    const started = Date.now();
    const stats = await runIngest(which);
    counts.adapters = stats.length;
    counts.fetched = stats.reduce((s, a) => s + a.fetched, 0);
    counts.inserted = stats.reduce((s, a) => s + a.inserted, 0);
    counts.errors = stats.reduce((s, a) => s + a.errors, 0);
    counts.ms = Date.now() - started;
    return NextResponse.json({
      ok: true,
      which,
      ms: Date.now() - started,
      stats,
    });
  });
}
