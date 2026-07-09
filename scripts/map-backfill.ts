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

const BASE = process.env.MAP_BACKFILL_BASE ?? "https://bnow-net.vercel.app";
const SECRET = process.env.CRON_SECRET;
if (!SECRET) throw new Error("CRON_SECRET not set");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const argVal = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const BUDGET_USD = Number(argVal("--budget") ?? 6);
const FROM = argVal("--from") ?? "2026-07-04";
/** live-run doc cap per route call: ~20-23 micro-batches, well inside maxDuration */
const RUN_CAP = Number(argVal("--cap") ?? 400);

function utcDays(fromIso: string): string[] {
  const out: string[] = [];
  const end = new Date().toISOString().slice(0, 10);
  for (
    let d = new Date(`${fromIso}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

type Counts = Record<string, number | string | undefined>;

async function callMap(params: string): Promise<Counts> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 790_000);
  try {
    const res = await fetch(`${BASE}/api/cron/map?${params}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: ctrl.signal,
    });
    const body = (await res.json()) as { ok?: boolean; counts?: Counts; error?: string };
    if (!res.ok || !body.ok) throw new Error(`map route ${res.status}: ${body.error ?? "?"}`);
    return body.counts ?? {};
  } finally {
    clearTimeout(t);
  }
}

const n = (c: Counts, k: string) => Number(c[k] ?? 0);

async function main() {
  const days = utcDays(FROM);
  console.log(`map backfill — ${days[0]} … ${days[days.length - 1]} via ${BASE}`);
  console.log(`\n== phase 1: estimate (dry runs — no LLM calls, no writes) ==`);

  let estTotal = 0;
  const estByDay = new Map<string, Counts>();
  for (const day of days) {
    // cap far above any real day so the estimate covers the WHOLE day
    const c = await callMap(`date=${day}&dry=1&cap=20000`);
    estByDay.set(day, c);
    estTotal += n(c, "estUsd");
    console.log(
      `${day}  selected=${n(c, "selected")}  mirrors=${n(c, "mirrors")} (exact=${n(c, "mirrorsExact")}/minhash=${n(c, "mirrorsMinhash")})  ` +
        `pairs=${n(c, "docTrackPairs")}  batches=${n(c, "batches")}  est=$${n(c, "estUsd").toFixed(4)}`,
    );
  }
  console.log(`\nESTIMATE TOTAL: $${estTotal.toFixed(4)}  (budget $${BUDGET_USD})\n`);

  if (!APPLY) {
    console.log("estimate only — rerun with --apply to backfill");
    return;
  }
  if (estTotal > BUDGET_USD) {
    console.error(`ABORT: estimate $${estTotal.toFixed(4)} exceeds budget $${BUDGET_USD}`);
    process.exit(1);
  }

  console.log(`== phase 2: backfill, oldest first ==`);
  let actualTotal = 0;
  for (const day of days) {
    let dayUsd = 0;
    let stalls = 0;
    for (let round = 1; ; round++) {
      const c = await callMap(`date=${day}&cap=${RUN_CAP}`);
      dayUsd += n(c, "estUsd");
      actualTotal += n(c, "estUsd");
      console.log(
        `${day} r${round}  selected=${n(c, "selected")}  canonical=${n(c, "canonical")}  claims=${n(c, "claims")}  ` +
          `empty=${n(c, "emptyDocs")}  omitted=${n(c, "omittedDocs")}  $${n(c, "estUsd").toFixed(4)}` +
          (c.budgetStop ? `  BUDGET STOP: ${c.budgetStop}` : "") +
          (c.skipped ? `  SKIPPED: ${c.skipped}` : ""),
      );
      if (c.budgetStop) {
        // a per-RUN request-cap stop is benign — the next call gets a fresh
        // run; daily/total cap stops mean the money is gone, so abort
        if (!String(c.budgetStop).includes("run requests")) {
          console.error("server-side budget stop — aborting backfill");
          process.exit(1);
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
        console.warn(`${day}: no progress after ${round} rounds — leaving remainder to the hourly cron`);
        break;
      }
    }
    const est = n(estByDay.get(day)!, "estUsd");
    console.log(`${day} DONE  actual=$${dayUsd.toFixed(4)}  modelled=$${est.toFixed(4)}\n`);
  }
  console.log(`BACKFILL COMPLETE — actual total $${actualTotal.toFixed(4)} (modelled $${estTotal.toFixed(4)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
