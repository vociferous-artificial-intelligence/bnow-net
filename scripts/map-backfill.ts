import "./env";

// Map-stage backfill driver (MR sprint 2, TASK 4; stop-classification +
// --theater added 2026-08-15). Drives the DEPLOYED /api/cron/map route — this
// box cannot reach api.openai.com (AGENTS.md), so all LLM work runs on Vercel;
// this script only sequences days and reads counters back.
//
// Budget gate: phase 1 dry-runs every day (no LLM, no writes) and prints the
// modelled cost. Phase 2 (--apply) runs only if the estimate is under budget,
// oldest day first, logging modelled vs actual per day. Server-side SpendGuard
// stops are classified by category (route body / counts.budgetStopCategory):
//   run_cap    benign per-invocation ceiling — the next call resumes;
//   daily_cap  pause until the next UTC day (--wait-daily) or abort resumable;
//   total_cap / cap_unset  operator intervention — abort immediately;
//   transport  transient fetch/HTTP failure — bounded retries, then abort.
//
//   npx tsx scripts/map-backfill.ts                estimate only
//   npx tsx scripts/map-backfill.ts --apply        estimate, then backfill
//   npx tsx scripts/map-backfill.ts --apply --budget 6 --from 2026-07-04
//   npx tsx scripts/map-backfill.ts --apply --from 2026-07-30 --to 2026-08-14 \
//     --theater ir --wait-daily
//
// --to bounds the day list (inclusive; default today); --theater restricts the
// route's selection to one theater so an Iran-only recovery can never estimate
// or pay for other theaters. The driver is exported for composition
// (scripts/x-gap-rescore.ts); the CLI below runs only when this file is the
// entrypoint.

import { utcDayRange } from "../src/lib/time/day-boundary";

type Counts = Record<string, number | string | undefined>;

const n = (c: Counts, k: string) => Number(c[k] ?? 0);

export interface MapCallResult {
  counts: Counts;
  /** the route's job-level verdict (ok:false = unhealthy budget stop) */
  ok: boolean;
  /** machine-readable stop classification; null when no stop happened */
  category: string | null;
}

export class MapTransportError extends Error {}

/** Classify a stop from the response body. Prefers the machine-readable
 *  category; falls back to the legacy string heuristic for an old deployed
 *  route (unknown stops are treated as abort-worthy, never benign). */
function categoryOf(body: { budgetStopCategory?: unknown }, counts: Counts): string | null {
  const fromBody = body.budgetStopCategory ?? counts.budgetStopCategory;
  if (typeof fromBody === "string") return fromBody;
  if (counts.budgetStop === undefined) return null;
  return String(counts.budgetStop).includes("run requests") ? "run_cap" : "unknown";
}

export async function callMap(base: string, secret: string, params: string): Promise<MapCallResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 790_000);
  try {
    let res: Response;
    try {
      res = await fetch(`${base}/api/cron/map?${params}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new MapTransportError(`map route fetch failed: ${e instanceof Error ? e.message : e}`);
    }
    let body: { ok?: boolean; counts?: Counts; error?: string; budgetStopCategory?: string };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new MapTransportError(`map route ${res.status}: unparseable body`);
    }
    if (!res.ok) throw new MapTransportError(`map route ${res.status}: ${body.error ?? "?"}`);
    const counts = body.counts ?? {};
    return { counts, ok: body.ok !== false, category: categoryOf(body, counts) };
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
  /** restrict every route call to one theater (e.g. "ir") */
  theater?: string;
  /** on a daily-cap stop: wait for the next UTC day (true) or abort (default) */
  waitDaily?: boolean;
  /** live-run doc cap per route call: ~20-23 micro-batches, well inside maxDuration */
  runCap?: number;
  log?: (line: string) => void;
  /** injectable for tests; defaults to callMap */
  call?: typeof callMap;
  /** injectable sleep for tests */
  sleep?: (ms: number) => Promise<void>;
}

export interface MapDriveResult {
  days: string[];
  estTotal: number;
  actualTotal: number;
  /** set when the drain stopped early; estimate-over-budget aborts before any
   *  paid call */
  aborted?: string;
}

const TRANSPORT_RETRIES = 3;

// -- fail-closed CLI numeric parsing ---------------------------------------
// A malformed numeric flag must never SILENTLY REMOVE a safety bound. NaN
// compares false against every threshold, so `--limit abc` disables a pair
// ceiling and `--budget abc` once disabled both spend gates (spend review 1,
// MAJOR-2; audit REMAP-3 found the surviving sibling). These parsers refuse
// non-numeric, empty, non-finite, zero, and negative input — and, for counts,
// fractional input, because a count of 2.5 docs is a typo, not an intent.
// Shared with scripts/map-remap.ts (which imports from here — never the other
// way round, so there is no import cycle).

/** Positive whole-number CLI flag (document/pair counts). undefined passes
 *  through so a caller's own default still applies. */
export function parseCountFlag(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const v = trimmed === "" ? NaN : Number(trimmed);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
    throw new Error(
      `${name} must be a positive whole number (got ${JSON.stringify(raw)}) — refusing to run with an unbounded or nonsensical limit`,
    );
  }
  return v;
}

/** Finite, strictly positive USD CLI flag (fractions are legitimate dollars). */
export function parseUsdFlag(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const v = trimmed === "" ? NaN : Number(trimmed);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(
      `${name} must be a finite positive USD amount (got ${JSON.stringify(raw)}) — refusing to run with a disabled spend gate`,
    );
  }
  return v;
}

/** ms until 90s past the next UTC midnight (margin for the day-row rollover) */
export function msToNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime() + 90_000;
}

export async function driveMapBackfill(opts: MapDriveOpts): Promise<MapDriveResult> {
  const log = opts.log ?? console.log;
  const call = opts.call ?? callMap;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const runCap = opts.runCap ?? 400;
  // a garbage --budget (NaN) would compare false against every spend total and
  // silently disable both budget gates — fail closed instead
  if (opts.apply && (!Number.isFinite(opts.budgetUsd) || opts.budgetUsd <= 0)) {
    throw new Error(`--apply requires a finite positive --budget (got ${opts.budgetUsd})`);
  }
  // a NaN/zero/fractional runCap rides into the route as ?cap= and resolves to
  // a nonsensical LIMIT — cap=0 in particular selects nothing, which a caller
  // can misread as "drained". Fail closed here, before any call.
  if (!Number.isInteger(runCap) || runCap <= 0) {
    throw new Error(`--cap must be a positive whole number of docs (got ${opts.runCap})`);
  }
  const theaterParam = opts.theater ? `&theater=${opts.theater}` : "";
  const days = utcDayRange(opts.from, opts.to ?? new Date().toISOString().slice(0, 10));
  if (days.length === 0) throw new Error(`empty day range ${opts.from}..${opts.to}`);
  log(
    `map backfill — ${days[0]} … ${days[days.length - 1]}${opts.theater ? ` (theater ${opts.theater})` : ""} via ${opts.base}`,
  );
  log(`\n== phase 1: estimate (dry runs — no LLM calls, no writes) ==`);

  const callWithRetry = async (params: string): Promise<MapCallResult> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call(opts.base, opts.secret, params);
      } catch (e) {
        if (!(e instanceof MapTransportError) || attempt >= TRANSPORT_RETRIES) throw e;
        log(`  transport failure (attempt ${attempt}/${TRANSPORT_RETRIES}): ${e.message} — retrying in 30s`);
        await sleep(30_000);
      }
    }
  };

  let estTotal = 0;
  const estByDay = new Map<string, Counts>();
  for (const day of days) {
    // cap far above any real day so the estimate covers the WHOLE day
    const { counts: c } = await callWithRetry(`date=${day}&dry=1&cap=20000${theaterParam}`);
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
      let r: MapCallResult;
      try {
        r = await callWithRetry(`date=${day}&cap=${runCap}${theaterParam}`);
      } catch (e) {
        return {
          days,
          estTotal,
          actualTotal,
          aborted: `transient transport failure persisted at ${day} r${round}: ${e instanceof Error ? e.message : e}`,
        };
      }
      const c = r.counts;
      dayUsd += n(c, "estUsd");
      actualTotal += n(c, "estUsd");
      log(
        `${day} r${round}  selected=${n(c, "selected")}  canonical=${n(c, "canonical")}  claims=${n(c, "claims")}  ` +
          `empty=${n(c, "emptyDocs")}  omitted=${n(c, "omittedDocs")}  $${n(c, "estUsd").toFixed(4)}` +
          (c.budgetStop ? `  BUDGET STOP [${r.category ?? "?"}]: ${c.budgetStop}` : "") +
          (c.skipped ? `  SKIPPED: ${c.skipped}` : ""),
      );
      if (actualTotal > opts.budgetUsd) {
        return {
          days,
          estTotal,
          actualTotal,
          aborted: `actual spend $${actualTotal.toFixed(4)} exceeded budget $${opts.budgetUsd}`,
        };
      }
      if (r.category && r.category !== "run_cap") {
        if (r.category === "daily_cap" && opts.waitDaily) {
          const ms = msToNextUtcDay(new Date());
          log(`${day}: daily cap reached — waiting ${(ms / 60000).toFixed(0)}m for the next UTC day`);
          await sleep(ms);
          continue;
        }
        const advice =
          r.category === "daily_cap"
            ? "daily cap reached — resume after the next UTC day boundary (or rerun with --wait-daily)"
            : "operator intervention required (all-time/monthly cap or unset cap env)";
        return { days, estTotal, actualTotal, aborted: `server-side ${r.category} stop at ${day}: ${advice}` };
      }
      if (c.skipped) {
        // another cycle (the hourly cron) holds the lock; wait it out
        await sleep(60_000);
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
    budgetUsd: parseUsdFlag("--budget", argVal("--budget")) ?? 6,
    runCap: parseCountFlag("--cap", argVal("--cap")) ?? 400,
    theater: argVal("--theater"),
    waitDaily: args.includes("--wait-daily"),
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
