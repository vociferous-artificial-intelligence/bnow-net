import { NextRequest, NextResponse } from "next/server";
import { CONFLICT_DEFINITIONS } from "@/lib/conflicts/definitions";
import { SqlReferenceReportRepository } from "@/lib/conflicts/reference-repo-sql";
import { isConflictId } from "@/lib/conflicts/vocabulary";
import { discoverEditions } from "@/lib/isw/edition-discovery";
import type { QueryFn } from "@/lib/isw/load";
import { markDegraded, withCronRun } from "@/lib/usage/cron-run";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Conflict-keyed reference discovery — REPORT-ONLY, and deliberately NOT in
// vercel.json.
//
// SCHEDULING IS AN OPERATOR STEP (WS-3.6), not a code change: adding the cron
// line is what turns this route from dormant into a writer, and it happens only
// behind the shadow-soak enablement checklist. Until then the route exists,
// answers only to CRON_SECRET, and is invoked by nobody.
//
// A MANUAL PRODUCTION GET WRITES MIGRATION-0028 ROWS (memo N2) — benchmark
// editions and day statuses. That is forbidden until the N2 decision says
// otherwise, except for one operator-signed bounded smoke (one date, one
// conflict). It never writes isw_reports, source_citations, digests or
// validation_runs, and the production `validate` cron, `validation_runs` and
// /scoreboard are untouched by it.
//
// The unit of validation is the CONFLICT (decision C2): this route iterates
// CONFLICT_DEFINITIONS (definitions.ts:132) rather than the per-country lens
// `validate` uses, and the two coexist. Step 19 attaches the observation
// pipeline BEHIND THIS SAME JOB — there is no second route.

/** Probing D-1 and D-2 by default (memo C4): an evening edition published after
 *  the D-1 run re-selects on the next run and produces a new observation for
 *  the new daily-final winner. Bounded because each extra day costs a full
 *  probe sweep of every shape at politeFetch's per-host spacing. */
export const DEFAULT_LOOKBACK = 2;
export const MAX_LOOKBACK = 3;

function utcDaysBack(newestDay: string, count: number): string[] {
  const base = Date.parse(`${newestDay}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(base - i * 86_400_000).toISOString().slice(0, 10),
  );
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Every parameter is validated BEFORE the run row is opened: a malformed
  // invocation must not leave a cron_runs row behind, and must never fall back
  // to a silent default (an unknown ?conflict= silently iterating both would
  // write rows the caller did not ask for).
  const date =
    req.nextUrl.searchParams.get("date") ??
    new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: `bad date ${date}` }, { status: 400 });
  }

  const rawLookback = req.nextUrl.searchParams.get("lookback");
  const lookback = rawLookback === null ? DEFAULT_LOOKBACK : Number(rawLookback);
  if (!Number.isInteger(lookback) || lookback < 1 || lookback > MAX_LOOKBACK) {
    return NextResponse.json(
      { error: `lookback must be an integer 1..${MAX_LOOKBACK}` },
      { status: 400 },
    );
  }

  const conflictFilter = req.nextUrl.searchParams.get("conflict");
  if (conflictFilter !== null && !isConflictId(conflictFilter)) {
    return NextResponse.json({ error: `unknown conflict ${conflictFilter}` }, { status: 400 });
  }
  const definitions = CONFLICT_DEFINITIONS.filter(
    (d) => conflictFilter === null || d.id === conflictFilter,
  );
  const days = utcDaysBack(date, lookback);

  return withCronRun("conflict-validate", async (counts) => {
    const { rawSql } = await import("@/db");
    const query: QueryFn = (sql, params) =>
      rawSql.query(sql, params) as Promise<Array<Record<string, unknown>>>;
    const repo = new SqlReferenceReportRepository(query);

    const cells: Array<Record<string, unknown>> = [];
    const errorMessages: string[] = [];
    let editionsFound = 0;
    let editionsInserted = 0;
    let editionsRepaired = 0;
    let anchored = 0;
    let probes = 0;
    let probeFailures = 0;
    let probeIndeterminate = 0;
    let throttledDays = 0;
    let unparseableBodyDays = 0;
    let published = 0;
    let probeFailedDays = 0;
    let publicationGapDays = 0;
    let thrown = 0;

    for (const def of definitions) {
      for (const day of days) {
        try {
          const out = await discoverEditions({ repo, query }, def.referenceSeries, day);
          editionsFound += out.editions.length;
          editionsInserted += out.editions.filter((e) => e.action === "inserted").length;
          editionsRepaired += out.editions.filter((e) => e.action === "repaired").length;
          anchored += out.anchored;
          probes += out.probes.length;
          probeFailures += out.probeFailures;
          probeIndeterminate += out.probeIndeterminate;
          if (out.dayStatusReason === "throttled") throttledDays += 1;
          if (out.dayStatusReason === "unparseable_body") unparseableBodyDays += 1;
          if (out.dayStatus === "published") published += 1;
          if (out.dayStatus === "probe_failed") probeFailedDays += 1;
          if (out.dayStatus === "publication_gap") publicationGapDays += 1;
          cells.push({
            conflict: def.id,
            series: def.referenceSeries,
            date: day,
            editions: out.editions.length,
            dayStatus: out.dayStatus,
            anchored: out.anchored,
            probeFailures: out.probeFailures,
            ...(out.dayStatusReason === null ? {} : { dayStatusReason: out.dayStatusReason }),
          });
        } catch (e) {
          thrown += 1;
          const message = e instanceof Error ? e.message : String(e);
          if (errorMessages.length < 5) errorMessages.push(message.slice(0, 200));
          cells.push({ conflict: def.id, series: def.referenceSeries, date: day, error: true });
        }
      }
    }

    counts.date = date;
    counts.lookback = lookback;
    counts.days = days;
    counts.conflicts = definitions.map((d) => d.id);
    counts.editionsFound = editionsFound;
    counts.editionsInserted = editionsInserted;
    counts.editionsRepaired = editionsRepaired;
    counts.anchored = anchored;
    counts.probes = probes;
    counts.probeFailures = probeFailures;
    // #114 / D-a: a probe_failed day whose reason is `throttled` says nothing
    // about whether ISW published — the WS-3.6 soak predeclares against this
    // split, not against probeFailedDays alone.
    counts.probeIndeterminate = probeIndeterminate;
    counts.dayStatusReasons = { throttled: throttledDays, unparseable_body: unparseableBodyDays };
    counts.dayStatuses = {
      published,
      probe_failed: probeFailedDays,
      publication_gap: publicationGapDays,
    };
    counts.cells = cells;
    counts.errors = thrown;
    if (errorMessages.length > 0) counts.errorMessages = errorMessages;
    // #87 discipline: only a THROWN cell degrades the run. A probe_failed day
    // is a benign, self-healing observation — ISW publishes late in the ET
    // evening and a transient 5xx is routine — and must not flip a healthy run.
    if (thrown > 0) markDegraded(counts, "nested_errors", { errors: thrown });

    return NextResponse.json({ ok: true, date, lookback, cells });
  });
}
