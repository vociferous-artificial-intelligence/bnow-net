import "./env";

// Exact, cursor-complete X historical recovery driver (OPEN-TASKS #38; prompt
// docs/prompts/2026-07-13-x-gap-catchup-rescore.md §3; engine + tests in
// src/lib/adapters/x-gap-backfill.ts).
//
// DEFAULT IS A NON-SPENDING PLAN MODE: no API request, no database write.
// --apply runs the paid recovery — every request passes the shared SpendGuard
// (env caps) AND the --budget-usd command allowance, cumulative across resumes
// via a provider_state checkpoint that is never the live x_api watermark row.
// Resume = rerun the SAME command; a completed checkpoint reruns as a no-op.
// The X provider lease serializes this against the :20 scheduled poll.
//
// NOTE (2026-07-15): the scheduled poll now AUTOMATICALLY runs a bounded
// self-catch-up when the watermark is parked (src/lib/adapters/x-auto-catchup.ts,
// #38/#66) — snapshotting the roster and advancing the watermark by compare-and-set
// on completion. This operator script remains the escalation/override path (an
// explicit --budget-usd, a chosen window, roster-hash refusal as the safety check)
// for a stuck tail or a park the auto-catch-up can't close within its request cap.
//
//   npx tsx scripts/x-gap-backfill.ts \
//     --from 2026-07-09T00:00:00Z --to 2026-07-14T00:00:00Z --budget-usd 10
//   ... --apply     DO NOT RUN WITHOUT OPERATOR APPROVAL (see the runbook:
//                   docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md)
//
// Options: --batch-size (accounts per OR-query, default/max 20),
//          --spacing-ms (default 300, floor 250 — Starter plan is 5 QPS),
//          --checkpoint-key (default derived from the range).

import type { GapCheckpoint } from "../src/lib/adapters/x-gap-backfill";

function argVal(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fromIso = argVal(args, "--from");
  const toIso = argVal(args, "--to");
  const budgetUsd = Number(argVal(args, "--budget-usd"));

  if (!fromIso || !toIso || !Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    console.error(
      "usage: npx tsx scripts/x-gap-backfill.ts --from <ISO> --to <ISO> --budget-usd <n>\n" +
        "       [--apply] [--batch-size <n<=20>] [--spacing-ms <n>=250>] [--checkpoint-key <k>]",
    );
    process.exit(2);
  }
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    console.error("--from must be a valid ISO timestamp strictly before --to");
    process.exit(2);
  }
  const batchSize = Math.min(Math.max(1, Number(argVal(args, "--batch-size") ?? 20) || 20), 20);
  const spacingMs = Math.max(Number(argVal(args, "--spacing-ms") ?? 300) || 300, 250);
  const checkpointKey =
    argVal(args, "--checkpoint-key") ?? `${fromIso.slice(0, 10)}_${toIso.slice(0, 10)}`;
  const fromUnix = Math.floor(fromMs / 1000);
  const toUnix = Math.floor(toMs / 1000);

  const { registryXAccounts, xApiRequest, xGuardFromEnv, X_PROVIDER } = await import(
    "../src/lib/adapters/x-api"
  );
  const { gapCheckpointProvider, rosterHash, runGapBackfill } = await import(
    "../src/lib/adapters/x-gap-backfill"
  );
  const { envNum, loadProviderState, saveProviderState } = await import(
    "../src/lib/usage/spend-guard"
  );
  const { pgXLeaseDriver } = await import("../src/lib/usage/x-lease");
  const { insertDocs } = await import("../src/lib/ingest/run");

  // same roster selection as the production poller (buildIngestAdapters)
  const topN = envNum("X_ACCOUNTS_TOP_N", 0);
  const accounts = await registryXAccounts(topN > 0 ? topN : undefined);
  const hash = rosterHash(accounts);
  const provider = gapCheckpointProvider(checkpointKey);
  const existing = await loadProviderState<GapCheckpoint>(provider);
  const watermark = await loadProviderState<{ lastPollAt?: number }>(X_PROVIDER);
  const batches = Math.ceil(accounts.length / batchSize);

  console.log(`X gap recovery — window [${fromIso} .. ${toIso}) (exact since/until, UTC)`);
  console.log(
    `roster: ${accounts.length} registry accounts (hash ${hash})  batches: ${batches} x <=${batchSize} accounts`,
  );
  console.log(
    `budget: $${budgetUsd} command-scoped (cumulative across resumes) + SpendGuard env caps  spacing: ${spacingMs}ms`,
  );
  console.log(
    `live ${X_PROVIDER} watermark: lastPollAt=${watermark?.lastPollAt ?? "unset"} (recovery never moves it)`,
  );
  console.log(
    `checkpoint ${provider}: ${
      existing
        ? existing.complete
          ? `COMPLETE (idempotent rerun, zero paid calls)`
          : `resumes at batch ${existing.batchIndex + 1}/${existing.batches}${existing.cursor ? " mid-cursor" : ""}, $${existing.spendUsd.toFixed(4)} spent so far`
        : "fresh (no prior state)"
    }`,
  );

  if (!apply) {
    console.log(
      "\nPLAN ONLY — no API request, no database write. Rerun with --apply after operator approval\n" +
        "(runbook: docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md; re-read the provider balance\n" +
        "and provider_usage.x_api immediately before applying).",
    );
    return;
  }

  const apiKey = process.env.X_API_KEY;
  if (!apiKey) {
    console.error("X_API_KEY unset — refusing (fail-closed)");
    process.exit(1);
  }

  const outcome = await runGapBackfill(
    { fromUnix, toUnix, budgetUsd, batchSize, spacingMs, checkpointKey },
    accounts,
    {
      guard: xGuardFromEnv(),
      request: (path, params) => xApiRequest(path, params, apiKey),
      insertDocs,
      loadState: loadProviderState,
      saveState: saveProviderState,
      leaseDriver: pgXLeaseDriver,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (line) => console.log(line),
    },
  );

  if (outcome.status === "refused") {
    console.error(`\nREFUSED: ${outcome.reason}`);
    process.exit(1);
  }

  const cp = outcome.checkpoint;
  const wmAfter = await loadProviderState<{ lastPollAt?: number }>(X_PROVIDER);
  console.log(
    `\n== totals ==\n` +
      `accounts=${cp.accounts} batches=${cp.completedBatches}/${cp.batches} pages=${cp.counts.pages}\n` +
      `returned=${cp.counts.returned} attributed=${cp.counts.attributed} unattributed=${cp.counts.unattributed}\n` +
      `inserted=${cp.counts.inserted} duplicates=${cp.counts.duplicates}\n` +
      `requests=${cp.counts.requests} credits~=${cp.counts.returned} usd=$${cp.spendUsd.toFixed(4)}\n` +
      `checkpoint=${provider} status=${outcome.status}${outcome.status === "stopped" ? ` (${outcome.reason})` : ""}\n` +
      `live watermark lastPollAt: before=${watermark?.lastPollAt ?? "unset"} after=${wmAfter?.lastPollAt ?? "unset"}`,
  );
  console.log(
    `X-GAP-BACKFILL-RESULT ${JSON.stringify({
      status: outcome.status,
      checkpointKey,
      from: fromIso,
      to: toIso,
      ...cp.counts,
      spendUsd: cp.spendUsd,
      complete: cp.complete,
      watermarkBefore: watermark?.lastPollAt ?? null,
      watermarkAfter: wmAfter?.lastPollAt ?? null,
    })}`,
  );

  if (outcome.status === "stopped") {
    console.error(
      `\nSTOPPED: ${outcome.reason}\nresume with:\n` +
        `  npx tsx scripts/x-gap-backfill.ts --from ${fromIso} --to ${toIso} --budget-usd ${budgetUsd} ` +
        `--batch-size ${batchSize} --spacing-ms ${spacingMs} --checkpoint-key ${checkpointKey} --apply`,
    );
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
