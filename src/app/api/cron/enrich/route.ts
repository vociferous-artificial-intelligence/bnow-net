import { NextRequest, NextResponse } from "next/server";
import { enrichEntities, parseEnrichParams } from "@/lib/enrich/run";
import { enrichOwnership } from "@/lib/enrich/ownership-run";
import { withCronRun } from "@/lib/usage/cron-run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Entity-graph enrichment: OpenSanctions status + ownership links.
//   normal  (no query)                — checks never-checked / stub-only rows.
//   rescore (?refresh=1&before=<ISO>) — re-checks rows whose live checkedAt is
//                                       older than the fixed `before` cutoff.
// A sanctions refresh (refresh=1 without only=ownership) REQUIRES a `before` cutoff
// that is timezone-qualified AND not later than now (400 otherwise, before any paid
// loop): a per-invocation "now" would re-select the same prefix forever, and a
// future cutoff would keep re-billing freshly checked rows. An ownership-only
// refresh (?only=ownership&refresh=1) has no cutoff and needs no `before`.
// ?only=sanctions|ownership narrows; ?limit bounds the batch (<= MAX_ENRICH_LIMIT).
// Run the rescore SERIALLY — the SpendGuard snapshot is per invocation, so
// overlapping runs could each reserve up to the remaining monthly quota.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Capture the current instant ONCE and use it for BOTH cutoff validation and the
  // checkedAt stamp, so an accepted cutoff is provably <= every row's stamp (no
  // future cutoff, no per-invocation "now").
  const nowIso = new Date().toISOString();
  const parsed = parseEnrichParams(req.nextUrl.searchParams, nowIso);
  if (!parsed.ok) {
    // Reject before opening a cron run or any paid enrichment loop.
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { refresh, before, limit, only } = parsed.params;

  return withCronRun("enrich", async (counts) => {
    const out: Record<string, unknown> = { ok: true };
    if (only !== "ownership") {
      out.sanctions = await enrichEntities({ refresh, before, limit, nowIso });
      counts.sanctions = out.sanctions;
    }
    if (only !== "sanctions") {
      out.ownership = await enrichOwnership({ refresh, limit });
      counts.ownership = out.ownership;
    }
    return NextResponse.json(out);
  });
}
