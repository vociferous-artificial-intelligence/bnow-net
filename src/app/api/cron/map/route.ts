import { NextRequest, NextResponse } from "next/server";
import { runScheduledMapHealth } from "@/lib/analysis/map-health";
import { runMapCycle } from "@/lib/analysis/map-worker";
import { cronJobName, withCronRun } from "@/lib/usage/cron-run";

// Map stage: hourly per-doc claim extraction into doc_claims.
// Own cron group at :40 (vercel.json) — never shares a schedule slot with the
// digest crons, and zero writes to any digest table.
//
// Steady state needs no params. The backfill driver (scripts/map-backfill.ts)
// passes ?date=yyyy-mm-dd (one UTC day) repeatedly until the day drains, and
// ?dry=1 first for the printed cost estimate the budget gate requires.
// ?theater=ru narrows; ?cap=N overrides docs-per-run.
//
// Remap driver (scripts/map-remap.ts, OPEN-TASKS #33): ?remap=1 switches
// eligibility to the current-extractor-version anti-join (ignores `processed`;
// mirrors and never-dispositioned docs excluded — see map-worker.ts), plus
// ?after=<id> (cursor) and ?track=<track>. Remap runs record cron_runs job
// "map:remap" and, like backfill runs, skip the steady-state health check —
// the driver classifies stops itself.
//
// Health (2026-08-15): a run stopped by anything except the benign per-run
// request ceiling records cron_runs.ok=false and returns ok:false with a
// machine-readable budgetStopCategory — 418 hourly budget-stopped runs had
// recorded ok=true while doc_claims starved for 17 days. Steady runs also
// evaluate per-theater freshness + episode-deduped operator alerts
// (map-health.ts). Dry runs stay zero-write, zero-paid, absent from cron_runs.
//
// maxDuration: a full run is ~25-40 micro-batch calls at ~5-10s each plus one
// possible 65s 429 sleep — 800s holds it with the same margin the digest route
// uses; measured wall-clock lands in cron_runs either way.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/** Budget-stop categories that mean "this run could not do its job": everything
 *  except the per-run request ceiling ("run_cap"), which the next run resumes
 *  from and is normal pagination for the backfill driver. */
const UNHEALTHY_STOP_CATEGORIES = new Set([
  "daily_cap",
  "total_cap",
  "monthly_cap",
  "cap_unset",
  "not_initialized",
]);

/** Thrown inside withCronRun so the run row records ok=false + the stop reason;
 *  caught below to still return a structured, secret-free response. */
class MapBudgetStopError extends Error {
  constructor(
    message: string,
    readonly category: string,
  ) {
    super(message);
    this.name = "MapBudgetStopError";
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const date = q.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }
  const theater = q.get("theater");
  const cap = q.get("cap");
  // ?cap= is a document ceiling, and a malformed one must never silently remove
  // or invert it. cap=0 in particular yields LIMIT 0 -> selected=0, which the
  // remap driver's sweep logic reads as "this day is drained" (independent
  // spend review 2026-08-21, MINOR-2). Validated exactly like ?after=.
  if (cap !== null && (!/^\d+$/.test(cap) || Number(cap) === 0)) {
    return NextResponse.json({ error: "bad cap" }, { status: 400 });
  }
  const dryRun = q.get("dry") === "1";
  const remap = q.get("remap") === "1";
  const after = q.get("after");
  if (after && !/^\d+$/.test(after)) {
    return NextResponse.json({ error: "bad after" }, { status: 400 });
  }
  const track = q.get("track");
  if (track && !["military", "elite_politics", "nuclear"].includes(track)) {
    return NextResponse.json({ error: "bad track" }, { status: 400 });
  }
  if ((after || track) && !remap) {
    return NextResponse.json({ error: "after/track require remap=1" }, { status: 400 });
  }
  const opts = {
    date,
    theaters: theater ? [theater.toLowerCase()] : undefined,
    docCap: cap ? Number(cap) : undefined,
    dryRun,
    remap,
    afterId: after ? Number(after) : undefined,
    track: track as "military" | "elite_politics" | "nuclear" | undefined,
  };

  // dry runs write nothing anywhere — keep them out of cron_runs too
  if (dryRun) {
    const counts = await runMapCycle(opts, {});
    return NextResponse.json({ ok: true, dryRun: true, counts });
  }
  let observed: Record<string, unknown> = {};
  try {
    const qualifier = remap ? "remap" : date ? "backfill" : null;
    return await withCronRun(cronJobName("map", qualifier), async (counts) => {
      observed = counts;
      await runMapCycle(opts, counts);
      // scheduled steady runs evaluate freshness + alerts; driver-paced
      // backfill/remap runs skip it (the driver classifies stops itself, and
      // a recovery must not spam per-invocation episodes)
      if (!date && !remap) await runScheduledMapHealth(counts);
      const category =
        typeof counts.budgetStopCategory === "string" ? counts.budgetStopCategory : null;
      if (category && UNHEALTHY_STOP_CATEGORIES.has(category)) {
        throw new MapBudgetStopError(String(counts.budgetStop ?? category), category);
      }
      return NextResponse.json({ ok: true, counts });
    });
  } catch (e) {
    if (e instanceof MapBudgetStopError) {
      // cron_runs already holds ok=false + the error; the body carries the
      // classification and accumulated numeric counts (no secrets, no content)
      return NextResponse.json({
        ok: false,
        unhealthy: "budget_stop",
        budgetStopCategory: e.category,
        counts: observed,
      });
    }
    throw e;
  }
}
