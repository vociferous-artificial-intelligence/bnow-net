import { NextRequest, NextResponse } from "next/server";
import { validateDigest } from "@/lib/validation/run";
import { withCronRun } from "@/lib/usage/cron-run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Validates digests against same-day ISW reports.
// Default date: yesterday UTC (ISW publishes ~late evening ET).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const date =
    req.nextUrl.searchParams.get("date") ??
    new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const country = req.nextUrl.searchParams.get("country");

  return withCronRun("validate", async (counts) => {
    const results = [];
    // ru/ua validate vs ROCA; ir validates vs ISW Iran Update (referenceFor gates the rest)
    for (const c of country ? [country] : ["ru", "ua", "ir"]) {
      try {
        results.push({ country: c, ...(await validateDigest(c, date)) });
      } catch (e) {
        results.push({ country: c, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const errors = results.filter((r) => "error" in r);
    counts.date = date;
    counts.validated = results.length - errors.length;
    counts.errors = errors.length;
    return NextResponse.json({ ok: true, date, results });
  });
}
