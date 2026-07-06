import { NextRequest, NextResponse } from "next/server";
import { pullMaterials } from "@/lib/materials/run";

export const maxDuration = 800;
export const dynamic = "force-dynamic";

// Critical-materials dependency pull (US imports by critical HS). Monthly.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await pullMaterials();
  return NextResponse.json({ ok: true, keyed: !!process.env.COMTRADE_API_KEY, stats });
}
