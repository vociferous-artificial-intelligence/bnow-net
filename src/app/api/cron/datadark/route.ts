import { NextRequest, NextResponse } from "next/server";
import { pollSeries, seedSeries } from "@/lib/datadark/run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Data-dark tracker: seed watched series, then poll each for freshness.
// ?seed=1 (re)seeds from config before polling.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let seeded: number | undefined;
  if (req.nextUrl.searchParams.get("seed") === "1") seeded = await seedSeries();
  const stats = await pollSeries(new Date().toISOString());
  return NextResponse.json({ ok: true, seeded, stats });
}
