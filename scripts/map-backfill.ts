import "./env";

// Map-stage backfill driver (MR sprint 2, TASK 4). Drives the DEPLOYED
// /api/cron/map route — this box cannot reach api.openai.com (AGENTS.md), so
// all LLM work runs on Vercel; this script only sequences days and reads
// counters back.
//
// Budget gate: phase 1 dry-runs every day (no LLM, no writes) and prints the
// modelled cost. Phase 2 (--apply) runs only if the estimate is under budget,
// oldest day first, logging modelled vs actual per day. A budget stop from the
// server-side SpendGuard aborts immediately — the cap is enforced there, in
// code, before every call; this gate is the operator-side sanity check.
//
//   npx tsx scripts/map-backfill.ts                estimate only
//   npx tsx scripts/map-backfill.ts --apply        estimate, then backfill
//   npx tsx scripts/map-backfill.ts --apply --budget 6 --from 2026-07-04
//   npx tsx scripts/map-backfill.ts --apply --from 2026-07-09 --to 2026-07-13
//
// --to bounds the day list (inclusive; default today) so a windowed drain — the
// X-gap rescore uses this — never touches days outside its range. The driver is
// exported for composition (scripts/x-gap-rescore.ts); the CLI below runs only
// when this file is the entrypoint.

import { utcDayRange } from "../src/lib/time/day-boundary";

type Counts = Record<string, number | string | undefined>;

const n = (c: Counts, k: string) => Number(c[k] ?? 0);

export async function callMap(base: string, secret: string, params: string): Promise<Counts> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 790_000);
  try {
    const res = await fetch(`${base}/api/cron/map?${params}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: ctrl.signal,
    });
    const body = (await res.json()) as { ok?: boolean; counts?: Counts; error?: string };
    if (!res.ok || !body.ok) throw new Error(`map route ${res.status}: ${body.error ?? "?"}`);
    return body.counts ?? {};
  } finally {
    clearTimeout(t);
  }
}

export interface MapDriveOpts {
  base: string;
  secret: string;
  from: string; // yyyy-mm-dd, inclusive
  to?: string; // yyyy-mm-dd, inclusive; default today (UTC)
  budgetUsd: number;
  apply: boolean;
  /** live-run doc cap per route call: ~20-23 micro-batches, well inside maxDuration */
  runCap?: number;
  log?: (line: string) => void;
}

export interface MapDriveResult {
  days: string[];
  estTotal: number;
  actualTotal: number;
  /** set when the drain stopped early (server budget stop); estimate-over-budget
   *  aborts before any paid call */
  aborted?: string;
}

export async function driveMapBackfill(opts: MapDriveOpts): Promise<MapDriveResult> {
  const log = opts.log ?? console.log;
  const runCap = opts.runCap ?? 400;
  const days = utcDayRange(opts.from, opts.to ?? new Date().toISOString().slice(0, 10));
  if (days.length === 0) throw new Error(`empty day range ${opts.from}..${opts.to}`);
  log(`map backfill — ${days[0]} … ${days[days.length - 1]} via ${opts.base}`);
  log(`\n== phase 1: estimate (dry runs — no LLM calls, no writes) ==`);

  let estTotal = 0;
  const estByDay = new Map<string, Counts>();
  for (const day of days) {
    // cap far above any real day so the estimate covers the WHOLE day
    const c = await callMap(opts.base, opts.secret, `date=${day}&dry=1&cap=20000`);
    estByDay.set(day, c);
    estTotal += n(c, "estUsd");
    log(
      `${day}  selected=${n(c, "selected")}  mirrors=${n(c, "mirrors")} (exact=${n(c, "mirrorsExact")}/minhash=${n(c, "mirrorsMinhash")})  ` +
        `pairs=${n(c, "docTrackPairs")}  batches=${n(c, "batches")}  est=$${n(c, "estUsd").toFixed(4)}`,
    );
  }
  log(`\nESTIMATE TOTAL: $${estTotal.toFixed(4)}  (budget $${opts.budgetUsd})\n`);

  if (!opts.apply) {
    log("estimate only — rerun with --apply to backfill");
    return { days, estTotal, actualTotal: 0 };
  }
  if (estTotal > opts.budgetUsd) {
    return {
      days,
      estTotal,
      actualTotal: 0,
      aborted: `estimate $${estTotal.toFixed(4)} exceeds budget $${opts.budgetUsd}`,
    };
  }

  log(`== phase 2: backfill, oldest first ==`);
  let actualTotal = 0;
  for (const day of days) {
    let dayUsd = 0;
    let stalls = 0;
    for (let round = 1; ; round++) {
      const c = await callMap(opts.base, opts.secret, `date=${day}&cap=${runCap}`);
      dayUsd += n(c, "estUsd");
      actualTotal += n(c, "estUsd");
      log(
        `${day} r${round}  selected=${n(c, "selected")}  canonical=${n(c, "canonical")}  claims=${n(c, "claims")}  ` +
          `empty=${n(c, "emptyDocs")}  omitted=${n(c, "omittedDocs")}  $${n(c, "estUsd").toFixed(4)}` +
          (c.budgetStop ? `  BUDGET STOP: ${c.budgetStop}` : "") +
          (c.skipped ? `  SKIPPED: ${c.skipped}` : ""),
      );
      if (c.budgetStop) {
        // a per-RUN request-cap stop is benign — the next call gets a fresh
        // run; daily/total cap stops mean the money is gone, so abort
        if (!String(c.budgetStop).includes("run requests")) {
          return { days, estTotal, actualTotal, aborted: `server-side budget stop: ${c.budgetStop}` };
        }
      }
      if (c.skipped) {
        // another cycle (the hourly cron) holds the lock; wait it out
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      if (n(c, "selected") === 0) break; // day fully mapped
      // no forward progress twice in a row (e.g. every remaining doc omitted): move on
      stalls = n(c, "processedMarked") === 0 ? stalls + 1 : 0;
      if (stalls >= 2) {
        log(`${day}: no progress after ${round} rounds — leaving remainder to the hourly cron`);
        break;
      }
    }
    const est = n(estByDay.get(day)!, "estUsd");
    log(`${day} DONE  actual=$${dayUsd.toFixed(4)}  modelled=$${est.toFixed(4)}\n`);
  }
  log(`BACKFILL COMPLETE — actual total $${actualTotal.toFixed(4)} (modelled $${estTotal.toFixed(4)})`);
  return { days, estTotal, actualTotal };
}

async function main() {
  const args = process.argv.slice(2);
  const argVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set");

  const result = await driveMapBackfill({
    base: process.env.MAP_BACKFILL_BASE ?? "https://bnow-net.vercel.app",
    secret,
    from: argVal("--from") ?? "2026-07-04",
    to: argVal("--to"),
    budgetUsd: Number(argVal("--budget") ?? 6),
    runCap: Number(argVal("--cap") ?? 400),
    apply: args.includes("--apply"),
  });
  if (result.aborted) {
    console.error(`ABORT: ${result.aborted}`);
    process.exit(1);
  }
}

// CLI only when executed directly (x-gap-rescore.ts imports the driver above)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/map-backfill.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
