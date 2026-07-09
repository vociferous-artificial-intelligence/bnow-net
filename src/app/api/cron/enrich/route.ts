import { NextRequest, NextResponse } from "next/server";
import { enrichEntities } from "@/lib/enrich/run";
import { enrichOwnership } from "@/lib/enrich/ownership-run";
import { withCronRun } from "@/lib/usage/cron-run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Entity-graph enrichment: OpenSanctions status + ownership links. ?refresh=1
// re-checks all rows; ?only=sanctions|ownership narrows.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10);
  const only = req.nextUrl.searchParams.get("only");

  return withCronRun("enrich", async (counts) => {
    const out: Record<string, unknown> = { ok: true };
    if (only !== "ownership") {
      out.sanctions = await enrichEntities({ refresh, limit, nowIso: new Date().toISOString() });
      counts.sanctions = out.sanctions;
    }
    if (only !== "sanctions") {
      out.ownership = await enrichOwnership({ refresh, limit });
      counts.ownership = out.ownership;
    }
    return NextResponse.json(out);
  });
}
