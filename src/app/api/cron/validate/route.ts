import { NextRequest, NextResponse } from "next/server";
import { validateDigest } from "@/lib/validation/run";
import { markDegraded, withCronRun } from "@/lib/usage/cron-run";

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
    let thrown = 0;
    // ru/ua validate vs ROCA; ir validates vs ISW Iran Update (referenceFor gates the rest)
    for (const c of country ? [country] : ["ru", "ua", "ir"]) {
      try {
        results.push({ country: c, ...(await validateDigest(c, date)) });
      } catch (e) {
        thrown++;
        results.push({ country: c, error: e instanceof Error ? e.message : String(e) });
      }
    }
    // #87 truthful accounting: `errors` previously lumped THROWN failures
    // together with validateDigest's normal `{error: string}` returns — which
    // are routinely benign and self-healing (ISW has not published yet, no
    // digest for the day, off-theater takeaways). Split them: `errors` = real
    // thrown failures (degrades the run); `unvalidated` = benign returns,
    // with their operational reason strings sampled (no ISW prose — these are
    // status messages like "no reference report for ir <date> (probe 404)").
    const errored = results.filter((r) => "error" in r);
    counts.date = date;
    counts.validated = results.length - errored.length;
    counts.errors = thrown;
    counts.unvalidated = errored.length - thrown;
    if (errored.length) {
      counts.unvalidatedReasons = errored
        .slice(0, 5)
        .map((r) => ("error" in r ? String(r.error).slice(0, 200) : ""));
    }
    if (thrown > 0) markDegraded(counts, "nested_errors", { errors: thrown });
    return NextResponse.json({ ok: true, date, results });
  });
}
