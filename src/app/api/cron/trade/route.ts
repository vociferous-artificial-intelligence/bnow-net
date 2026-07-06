import { NextRequest, NextResponse } from "next/server";
import { pullTrade } from "@/lib/trade/run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Mirror-trade pull from UN Comtrade. Monthly cadence (data lags ~2-3 months).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await pullTrade();
  return NextResponse.json({ ok: true, keyed: !!process.env.COMTRADE_API_KEY, stats });
}
