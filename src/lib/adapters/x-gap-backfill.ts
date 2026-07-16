// Cursor-complete historical X recovery engine (OPEN-TASKS #38; prompt
// docs/prompts/2026-07-13-x-gap-catchup-rescore.md §3). The steady-state poller
// caps pages per batch — cheap, and watermark-safe since the insert-gated
// refactor — but that ceiling is exactly why July 9–13 completeness is unproven.
// This engine makes the opposite trade: an EXACT window (since_time/until_time),
// every cursor followed to has_next_page=false, resumable from a deterministic
// provider_state checkpoint that is NEVER the live x_api watermark row.
//
// Money rules: every request passes the shared SpendGuard (env caps) AND a
// command-scoped recovery budget cumulative across resumes (the operator's
// explicit allowance). Pages are inserted through insertDocs() BEFORE the
// checkpoint advances past them, so a crash re-fetches (re-bills) at most one
// page instead of silently losing one. The X lease serializes recovery against
// the live :20 poll — the poll skips (lockSkips=1) while recovery holds it, and
// the recovery refuses to start while a poll holds it.

import { createHash } from "node:crypto";
import type { SpendGuard } from "../usage/spend-guard";
import { acquireXLease, type XLeaseDriver } from "../usage/x-lease";
import type { RawDoc } from "./types";
import {
  X_MIN_USD_PER_REQUEST,
  X_PROVIDER,
  X_USD_PER_TWEET,
  buildSearchQuery,
  chunk,
  isSearchPayload,
  tweetsFromResponse,
  tweetToRawDoc,
  type XAccount,
} from "./x-api";

export const X_GAP_CHECKPOINT_PREFIX = "x_gap_backfill";
export const X_GAP_LEASE_TTL_MS = 120_000;

export function gapCheckpointProvider(key: string): string {
  return `${X_GAP_CHECKPOINT_PREFIX}:${key}`;
}

/** Roster identity for the checkpoint: ORDER matters — it defines which
 *  accounts share a batch, so a reordered roster is a different job. */
export function rosterHash(accounts: XAccount[]): string {
  return createHash("sha256")
    .update(accounts.map((a) => a.userName.toLowerCase()).join("\n"))
    .digest("hex")
    .slice(0, 16);
}

export interface GapCounts {
  requests: number;
  pages: number;
  returned: number; // tweets the API returned (all billed)
  attributed: number; // returned tweets matching a roster account
  unattributed: number; // returned tweets with no roster author (billed, dropped)
  inserted: number;
  duplicates: number; // attributed but deduped by content_hash in Postgres
}

export interface GapCheckpoint extends Record<string, unknown> {
  version: 1;
  fromUnix: number;
  toUnix: number;
  rosterHash: string;
  /** Immutable roster SNAPSHOT (bounded public account list — userName/sourceKey/
   *  theater/citations, no secrets). Stored only when `runGapBackfill(...,
   *  { storeRoster: true })` is set (the unattended auto-catch-up path): the live
   *  registry roster drifts within minutes, so rosterHash refusal is unsuitable
   *  there — the resumer feeds this snapshot back so a normal registry change
   *  cannot strand the checkpoint. The operator gap-backfill script omits it
   *  (hash refusal is its intended safety check). */
  roster?: XAccount[];
  batchSize: number;
  accounts: number;
  batches: number;
  /** next batch to run (0-based) */
  batchIndex: number;
  /** next cursor within that batch ("" = batch start) */
  cursor: string;
  completedBatches: number;
  counts: GapCounts;
  /** cumulative recovery spend across ALL resumes — compared to --budget-usd */
  spendUsd: number;
  complete: boolean;
}

export interface GapArgs {
  fromUnix: number;
  toUnix: number;
  budgetUsd: number;
  batchSize: number;
  spacingMs: number;
  checkpointKey: string;
}

export interface GapDeps {
  guard: SpendGuard;
  /** twitterapi.io GET (xApiRequest in prod): null = non-2xx, throws on network */
  request(path: string, params: Record<string, string>): Promise<unknown | null>;
  insertDocs(docs: RawDoc[]): Promise<number>;
  loadState<T extends Record<string, unknown>>(provider: string): Promise<T | null>;
  saveState(provider: string, state: Record<string, unknown>): Promise<void>;
  leaseDriver: XLeaseDriver;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

export type GapOutcome =
  /** every batch exhausted its cursors; checkpoint saved complete=true */
  | { status: "complete"; checkpoint: GapCheckpoint; watermarkMovedBack: boolean }
  /** budget stop / failure — checkpoint preserved at the last safe position */
  | { status: "stopped"; reason: string; checkpoint: GapCheckpoint }
  /** nothing ran and nothing was written (mismatch, lease contention) */
  | { status: "refused"; reason: string };

export function freshCheckpoint(
  args: GapArgs,
  accounts: XAccount[],
  opts: { storeRoster?: boolean } = {},
): GapCheckpoint {
  return {
    version: 1,
    fromUnix: args.fromUnix,
    toUnix: args.toUnix,
    rosterHash: rosterHash(accounts),
    // Immutable snapshot only when asked (auto-catch-up): the manual script omits
    // it so its rosterHash refusal keeps working as the operator's safety check.
    ...(opts.storeRoster ? { roster: accounts } : {}),
    batchSize: args.batchSize,
    accounts: accounts.length,
    batches: Math.ceil(accounts.length / args.batchSize),
    batchIndex: 0,
    cursor: "",
    completedBatches: 0,
    counts: {
      requests: 0,
      pages: 0,
      returned: 0,
      attributed: 0,
      unattributed: 0,
      inserted: 0,
      duplicates: 0,
    },
    spendUsd: 0,
    complete: false,
  };
}

/** Why an existing checkpoint cannot be resumed by these args; null = resumable. */
export function checkpointMismatch(
  cp: GapCheckpoint,
  args: GapArgs,
  hash: string,
): string | null {
  if (cp.version !== 1) return `checkpoint version ${cp.version} is not resumable by this build`;
  if (cp.fromUnix !== args.fromUnix || cp.toUnix !== args.toUnix) {
    return `range mismatch: checkpoint covers [${cp.fromUnix}, ${cp.toUnix}) but --from/--to give [${args.fromUnix}, ${args.toUnix}) — rerun with the original range or pick a new --checkpoint-key`;
  }
  if (cp.rosterHash !== hash) {
    return `roster changed since the checkpoint (${cp.rosterHash} != ${hash}) — batch composition differs, resume would skip/duplicate accounts; start a new --checkpoint-key`;
  }
  if (cp.batchSize !== args.batchSize) {
    return `batch size changed since the checkpoint (${cp.batchSize} != ${args.batchSize}) — start a new --checkpoint-key`;
  }
  return null;
}

export async function runGapBackfill(
  args: GapArgs,
  accounts: XAccount[],
  deps: GapDeps,
  opts: { storeRoster?: boolean } = {},
): Promise<GapOutcome> {
  const provider = gapCheckpointProvider(args.checkpointKey);
  const hash = rosterHash(accounts);

  const existing = await deps.loadState<GapCheckpoint>(provider);
  if (existing) {
    const mismatch = checkpointMismatch(existing, args, hash);
    if (mismatch) return { status: "refused", reason: mismatch };
    if (existing.complete) {
      deps.log(`${provider}: already complete — idempotent no-op, zero paid calls`);
      return { status: "complete", checkpoint: existing, watermarkMovedBack: false };
    }
    deps.log(
      `${provider}: resuming at batch ${existing.batchIndex}/${existing.batches}` +
        `${existing.cursor ? " (mid-batch cursor)" : ""}, $${existing.spendUsd.toFixed(4)} already spent`,
    );
  }
  const cp: GapCheckpoint = existing
    ? { ...existing, counts: { ...existing.counts } }
    : freshCheckpoint(args, accounts, opts);

  // The live watermark must survive recovery untouched (scheduled polls outside
  // the lease may legally advance it FORWARD; backward is never legitimate).
  const before = await deps.loadState<{ lastPollAt?: number }>(X_PROVIDER);

  const lease = await acquireXLease(
    `x-gap-${args.checkpointKey}`,
    X_GAP_LEASE_TTL_MS,
    deps.leaseDriver,
  );
  if (!lease) {
    return {
      status: "refused",
      reason: "x provider lease held by another job — wait for the scheduled poll to finish and rerun",
    };
  }

  try {
    await deps.guard.init();
    const batches = chunk(accounts, args.batchSize);
    const byUser = new Map(accounts.map((a) => [a.userName.toLowerCase(), a]));

    const stop = async (reason: string): Promise<GapOutcome> => {
      await deps.saveState(provider, cp);
      deps.log(`STOP: ${reason}`);
      return { status: "stopped", reason, checkpoint: cp };
    };

    while (cp.batchIndex < batches.length) {
      const batch = batches[cp.batchIndex];
      const query = buildSearchQuery(batch, args.fromUnix, args.toUnix);
      // recovery mode has NO page ceiling: follow every cursor to exhaustion
      for (;;) {
        if (cp.spendUsd >= args.budgetUsd) {
          return stop(
            `recovery budget exhausted ($${cp.spendUsd.toFixed(4)} >= $${args.budgetUsd}) — rerun with a larger --budget-usd to continue`,
          );
        }
        const r = deps.guard.tryReserve();
        if (!r.ok) return stop(`spend guard refusal: ${r.reason}`);
        if (!(await lease.renew())) {
          // lost to a takeover (only possible after a >TTL stall): another job
          // may be spending — stop before the next paid call; checkpoint is safe
          return stop("x provider lease lost mid-run (expired or taken over) — rerun to resume");
        }

        let json: unknown | null = null;
        let requestErr: string | null = null;
        try {
          json = await deps.request("/twitter/tweet/advanced_search", {
            query,
            queryType: "Latest",
            cursor: cp.cursor,
          });
        } catch (e) {
          requestErr = e instanceof Error ? e.message : String(e);
        }
        if (json === null) {
          return stop(
            `request failed at batch ${cp.batchIndex + 1}/${batches.length}` +
              `${cp.cursor ? " (mid-batch cursor preserved)" : ""}${requestErr ? `: ${requestErr}` : ""}`,
          );
        }
        if (!isSearchPayload(json)) {
          // 200 with a junk body: the provider bills the request minimum
          await deps.guard.record(1, 0, X_MIN_USD_PER_REQUEST);
          cp.counts.requests += 1;
          cp.spendUsd += X_MIN_USD_PER_REQUEST;
          return stop(`malformed payload at batch ${cp.batchIndex + 1}/${batches.length}`);
        }

        const tweets = tweetsFromResponse(json);
        const usd = Math.max(tweets.length * X_USD_PER_TWEET, X_MIN_USD_PER_REQUEST);
        await deps.guard.record(1, tweets.length, usd); // actuals, immediately
        cp.counts.requests += 1;
        cp.counts.returned += tweets.length;
        cp.spendUsd += usd;

        const docs: RawDoc[] = [];
        for (const t of tweets) {
          const account = byUser.get((t.author?.userName ?? "").toLowerCase());
          if (!account) {
            cp.counts.unattributed += 1;
            continue;
          }
          docs.push(tweetToRawDoc(t, account));
        }
        cp.counts.attributed += docs.length;

        // Insert BEFORE the checkpoint moves past this page: a crash between the
        // two re-fetches (re-bills) one page; content-hash dedupe absorbs it.
        let inserted = 0;
        try {
          inserted = await deps.insertDocs(docs);
        } catch (e) {
          return stop(`insert failed (checkpoint kept BEFORE this page): ${e instanceof Error ? e.message : String(e)}`);
        }
        cp.counts.inserted += inserted;
        cp.counts.duplicates += docs.length - inserted;
        cp.counts.pages += 1;

        const batchNo = cp.batchIndex + 1;
        const o = json as { has_next_page?: boolean; next_cursor?: string };
        const more = !!o.has_next_page && !!o.next_cursor;
        if (more) {
          cp.cursor = o.next_cursor!;
        } else {
          cp.batchIndex += 1;
          cp.completedBatches += 1;
          cp.cursor = "";
        }
        await deps.saveState(provider, cp);
        deps.log(
          `batch ${batchNo}/${batches.length} page ${cp.counts.pages}: returned=${tweets.length} inserted=${inserted} ` +
            `spend=$${cp.spendUsd.toFixed(4)}${more ? " (more pages)" : " (batch exhausted)"}`,
        );
        if (!more) break;
        await deps.sleep(args.spacingMs);
      }
      await deps.sleep(args.spacingMs);
    }

    cp.complete = true;
    await deps.saveState(provider, cp);

    const after = await deps.loadState<{ lastPollAt?: number }>(X_PROVIDER);
    const watermarkMovedBack = (after?.lastPollAt ?? 0) < (before?.lastPollAt ?? 0);
    if (watermarkMovedBack) {
      deps.log(
        `WARNING: live ${X_PROVIDER} watermark moved BACKWARD during recovery — investigate before trusting steady-state coverage`,
      );
    }
    return { status: "complete", checkpoint: cp, watermarkMovedBack };
  } finally {
    await lease.release();
  }
}
