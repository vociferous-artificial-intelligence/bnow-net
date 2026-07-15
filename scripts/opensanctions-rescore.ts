import "./env";

// Serial driver for the OpenSanctions fixed-cutoff rescore (OPEN-TASKS #41;
// prompt docs/prompts/2026-07-13-opensanctions-monthly-rescore.md §2).
//
// Repeatedly calls the DEPLOYED, authenticated enrich endpoint with ONE fixed
// `before` cutoff:
//
//   GET /api/cron/enrich?only=sanctions&refresh=1&before=<ISO>&limit=<n>
//
// Every successful check stamps checkedAt=now (after the cutoff), so the SAME
// cutoff advances to the next batch each call — no re-selection of the same
// prefix. The endpoint enforces all caps (per-run, per-UTC-day, and the
// calendar-month 2,000-request quota); this driver only PACES and REPORTS. It:
//   - prints each batch's counts (checked/matched/sanctioned/failed/remaining),
//   - stops on a daily/monthly/config budget stop (does NOT busy-loop a daily cap),
//   - continues after a per-run cap stop or a clean full batch (fresh invocation
//     resets the per-run counter),
//   - stops when the rescore is complete (remaining === 0),
//   - never embeds or prints CRON_SECRET.
//
// DEFAULT IS DRY-RUN: prints the plan and the request path (no secret), makes NO
// network call. Pass --run to actually drive the paid endpoint — an operator
// action, gated on approval (runbook: docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md).
//
//   # dry run (safe, no calls):
//   npx tsx scripts/opensanctions-rescore.ts --before 2026-08-01T00:00:00Z
//
//   # real run (operator only; this box needs the DNS pin for vercel.app):
//   CRON_SECRET=... NODE_OPTIONS="--require ./scripts/pin-dns.cjs" \
//     npx tsx scripts/opensanctions-rescore.ts --before 2026-08-01T00:00:00Z --run
//
// Options: --base <url> (default https://bnow-net.vercel.app), --limit <n>
//          (default 120, <= run cap), --max-batches <n> (default 40 backstop),
//          --sleep-ms <n> (default 3000, >=2s host spacing).

import { normalizeIsoInstant } from "../src/lib/enrich/run";

interface EnrichBatch {
  scanned: number;
  checked: number;
  matched: number;
  sanctioned: number;
  failed: number;
  live: boolean;
  mode: string;
  cutoff: string | null;
  remaining: number | null;
  completed: boolean;
  stopReason: string | null;
  budgetStopped: string | null;
}

function argVal(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Budget stops that mean "resume later / fix config", not "keep going this run".
const HALTING_STOPS = new Set(["daily_cap", "monthly_cap", "cap_unset", "not_initialized"]);

async function main() {
  const args = process.argv.slice(2);
  const run = args.includes("--run");
  const before = normalizeIsoInstant(argVal(args, "--before") ?? null);
  const base = argVal(args, "--base") ?? process.env.MAP_BACKFILL_BASE ?? "https://bnow-net.vercel.app";
  const limit = Number(argVal(args, "--limit") ?? "120");
  const maxBatches = Number(argVal(args, "--max-batches") ?? "40");
  const sleepMs = Number(argVal(args, "--sleep-ms") ?? "3000");

  if (!before || !Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    console.error(
      "usage: npx tsx scripts/opensanctions-rescore.ts --before <ISO instant> [--run]\n" +
        "       [--base <url>] [--limit <n<=120>] [--max-batches <n>] [--sleep-ms <n>]\n" +
        "  --before must be a full ISO date+time (e.g. 2026-08-01T00:00:00Z).\n" +
        "  Omit --run for a dry-run plan (no network call).",
    );
    process.exit(2);
  }

  const path = `/api/cron/enrich?only=sanctions&refresh=1&before=${encodeURIComponent(before)}&limit=${limit}`;
  console.log(`OpenSanctions rescore driver`);
  console.log(`  cutoff (before): ${before}`);
  console.log(`  endpoint:        ${base}${path}`);
  console.log(`  limit/batch:     ${limit}  (endpoint clamps to the per-run cap)`);
  console.log(`  max batches:     ${maxBatches}, sleep ${sleepMs}ms between`);

  if (!run) {
    console.log(
      "\nDRY RUN — no network call made. The endpoint enforces the per-run,\n" +
        "per-day, and calendar-month (2,000) caps; this driver only paces and reports.\n" +
        "Rerun with --run (and CRON_SECRET in the env) after operator approval.",
    );
    process.exit(0);
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET not set in the env — cannot call the authenticated endpoint.");
    process.exit(1);
  }

  let cumChecked = 0;
  let cumMatched = 0;
  let cumSanctioned = 0;
  let cumFailed = 0;
  for (let batch = 1; batch <= maxBatches; batch++) {
    let body: { ok?: boolean; error?: string; sanctions?: EnrichBatch };
    try {
      const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${secret}` } });
      body = (await res.json()) as typeof body;
      if (!res.ok || body.ok !== true || !body.sanctions) {
        console.error(`batch ${batch}: HTTP ${res.status} ${String(body.error ?? "no sanctions block").slice(0, 300)}`);
        process.exit(1);
      }
    } catch (e) {
      console.error(`batch ${batch}: request failed — ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }

    const s = body.sanctions;
    cumChecked += s.checked;
    cumMatched += s.matched;
    cumSanctioned += s.sanctioned;
    cumFailed += s.failed;
    console.log(
      `batch ${batch}: checked ${s.checked} (matched ${s.matched}, sanctioned ${s.sanctioned}, ` +
        `failed ${s.failed}), remaining ${s.remaining ?? "?"}, stop=${s.stopReason ?? "none"} ` +
        `| cumulative checked ${cumChecked}`,
    );

    if (!s.live) {
      console.error("endpoint reports live=false (no OpenSanctions key) — nothing to rescore. Stopping.");
      break;
    }
    if (s.completed) {
      console.log(`\nDONE — zero candidates remaining for cutoff ${before}.`);
      break;
    }
    if (s.stopReason && HALTING_STOPS.has(s.stopReason)) {
      console.log(
        `\nSTOP — ${s.stopReason}. ${
          s.stopReason === "monthly_cap"
            ? "Calendar-month quota reached; resume after the UTC month reset."
            : s.stopReason === "daily_cap"
              ? "Daily cap reached; resume on the next UTC day (do not busy-loop)."
              : "Fix the cap configuration, then resume."
        } Candidates remaining: ${s.remaining ?? "?"}.`,
      );
      break;
    }
    // Safety: no progress and no budget stop (e.g. every row failed) — avoid an
    // infinite loop; let the operator inspect rather than hammer the provider.
    if (s.checked === 0 && (s.remaining ?? 0) > 0) {
      console.error(
        `\nSTOP — batch checked 0 with ${s.remaining} candidates remaining and no budget stop ` +
          `(failed ${s.failed}). Inspect before continuing.`,
      );
      break;
    }
    // run_cap stop or a clean full batch: pace, then continue.
    if (batch === maxBatches) {
      console.log(`\nreached --max-batches ${maxBatches}; ${s.remaining ?? "?"} candidates remain. Rerun to continue.`);
      break;
    }
    await sleep(sleepMs);
  }

  console.log(
    `\ntotals this driver run: checked ${cumChecked}, matched ${cumMatched}, ` +
      `sanctioned ${cumSanctioned}, failed ${cumFailed}.`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
