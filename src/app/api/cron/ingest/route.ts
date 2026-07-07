import { NextRequest, NextResponse } from "next/server";
import { runIngest, type IngestWhich } from "@/lib/ingest/run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const which = (req.nextUrl.searchParams.get("which") ?? "all") as IngestWhich;
  const started = Date.now();
  const stats = await runIngest(which);
  return NextResponse.json({
    ok: true,
    which,
    ms: Date.now() - started,
    stats,
  });
}
