import { NextRequest, NextResponse } from "next/server";
import { enrichEntities } from "@/lib/enrich/run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// OpenSanctions enrichment of the entity graph. ?refresh=1 re-checks all rows.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10);
  const stats = await enrichEntities({ refresh, limit, nowIso: new Date().toISOString() });
  return NextResponse.json({ ok: true, live: !!process.env.OPENSANCTIONS_API_KEY, stats });
}
