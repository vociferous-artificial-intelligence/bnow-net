// Self-healing X/twitterapi.io steady-state recovery (OPEN-TASKS #38 + #66).
//
// The steady poller is insert-gated and watermark-safe, but after a long pause
// (observed after an ~8h daily-cap park) its fixed 5-page-per-batch ceiling makes
// each hourly retry re-bill the same fixed prefix without converging. This module
// replaces that no-op retry with a budget-bounded, resumable, cursor-complete
// automatic catch-up over ONE fixed window [oldWatermark, caughtUpTo), reusing the
// proven runGapBackfill engine:
//
//   * The window's upper bound `caughtUpTo` is captured ONCE (at episode start) and
//     read back from the checkpoint on every resume — never recomputed per run.
//   * The roster is SNAPSHOTTED into the checkpoint at episode start and fed back on
//     resume, so normal registry drift (minutes-scale) cannot strand it (the manual
//     gap-backfill keeps its stricter rosterHash refusal).
//   * Every paid call passes the shared x_api SpendGuard (existing X caps); the
//     per-run request slice is bounded by xAutoCatchupGuardFromEnv()'s run cap.
//   * The X lease serializes the whole paid/checkpoint sequence against the steady
//     poll and any manual recovery.
//   * The live watermark advances to the fixed boundary ONLY on global completion,
//     via compare-and-set against the episode's starting watermark — never backward.
//
// Provider is api.twitterapi.io (adapter/provider `x_api`, header `X-API-Key`) — the
// third-party service, NOT the official X developer API.

import type { SpendGuard } from "../usage/spend-guard";
import type { XLeaseDriver } from "../usage/x-lease";
import {
  type GapArgs,
  type GapCheckpoint,
  type GapDeps,
  gapCheckpointProvider,
  runGapBackfill,
} from "./x-gap-backfill";
import { X_PROVIDER, type XAccount } from "./x-api";

/** Watermark age (s) at which the steady poll switches to automatic catch-up.
 *  Default = 4h, the lower bound of the observed 4–8h daily-cap-park failure
 *  boundary: recovery kicks in well before the ~8h worst case, while staying far
 *  above the hourly cadence so an ordinarily-late poll never triggers it.
 *  Env-tunable via X_PARK_THRESHOLD_SEC. NOTE on convergence: a catch-up drains a
 *  FIXED window [oldWatermark, caughtUpTo); the tail that accumulated DURING the
 *  recovery is closed by the next run — a larger tail (> threshold) re-triggers
 *  catch-up (cascades, converging since recovery has no page ceiling), a smaller
 *  one is drained by the steady poll. A residual tail between the steady poll's
 *  single-run capacity and this threshold would truncate — which the health
 *  monitor ALERTS on (page_truncation), so it is visible, not silent; the operator
 *  then lowers X_PARK_THRESHOLD_SEC or runs the manual gap-backfill. */
export const X_PARK_THRESHOLD_SEC_DEFAULT = 4 * 3600;
export const X_AUTO_CATCHUP_KEY_PREFIX = "auto";

/** Episode checkpoint key = the parked watermark instant, so the SAME episode's
 *  hourly retries share one checkpoint (the watermark only advances on completion,
 *  so it is stable across the episode). */
export function autoCatchupCheckpointKey(parkedWatermarkUnix: number): string {
  return `${X_AUTO_CATCHUP_KEY_PREFIX}:${parkedWatermarkUnix}`;
}

// -- live-watermark compare-and-set -------------------------------------------
//
// The catch-up advances x_api.lastPollAt to the fixed caught-up boundary ONLY when
// every cursor is exhausted. CAS against the episode's starting watermark: a
// scheduled poll that legitimately advanced the watermark FORWARD in the meantime
// makes the CAS a no-op (never move a newer watermark backward).

export interface XWatermarkDriver {
  read(): Promise<{ lastPollAt?: number } | null>;
  /** Set lastPollAt = toUnix iff the current value === expectFromUnix AND
   *  toUnix > current. Returns true iff it advanced. Never moves backward. */
  advance(expectFromUnix: number, toUnix: number): Promise<boolean>;
}

async function sql() {
  return (await import("@/db")).rawSql;
}

export const pgXWatermarkDriver: XWatermarkDriver = {
  async read() {
    const rows = (await (await sql()).query(`SELECT state FROM provider_state WHERE provider = $1`, [
      X_PROVIDER,
    ])) as Array<{ state: { lastPollAt?: number } | null }>;
    return rows[0]?.state ?? null;
  },
  async advance(expectFromUnix, toUnix) {
    const rows = (await (await sql()).query(
      `UPDATE provider_state
         SET state = jsonb_set(coalesce(state, '{}'::jsonb), '{lastPollAt}', to_jsonb($3::bigint)),
             updated_at = now()
       WHERE provider = $1
         AND (state->>'lastPollAt') IS NOT NULL
         AND (state->>'lastPollAt')::bigint = $2
         AND $3 > (state->>'lastPollAt')::bigint
       RETURNING provider`,
      [X_PROVIDER, expectFromUnix, toUnix],
    )) as unknown[];
    return rows.length > 0;
  },
};

/** In-memory CAS driver backed by the same provider_state map the memory
 *  load/save seams use, so a test sees a consistent watermark. */
export function memoryXWatermarkDriver(map: Map<string, Record<string, unknown>>): XWatermarkDriver {
  return {
    async read() {
      return (map.get(X_PROVIDER) as { lastPollAt?: number } | undefined) ?? null;
    },
    async advance(expectFromUnix, toUnix) {
      const cur = map.get(X_PROVIDER) as { lastPollAt?: number } | undefined;
      if (!cur || typeof cur.lastPollAt !== "number") return false;
      if (cur.lastPollAt !== expectFromUnix || toUnix <= cur.lastPollAt) return false;
      map.set(X_PROVIDER, { ...cur, lastPollAt: toUnix });
      return true;
    },
  };
}

// -- orchestrator --------------------------------------------------------------

export interface AutoCatchupOpts {
  parkThresholdSec: number;
  batchSize: number;
  spacingMs: number;
  /** injected clock (ms) — fixes both the park age and the captured caughtUpTo */
  nowMs: number;
}

export interface AutoCatchupDeps {
  /** x_api guard with the auto-catch-up per-run request cap (xAutoCatchupGuardFromEnv) */
  guard: SpendGuard;
  request: GapDeps["request"];
  insertDocs: GapDeps["insertDocs"];
  loadState: GapDeps["loadState"];
  saveState: GapDeps["saveState"];
  leaseDriver: XLeaseDriver;
  watermark: XWatermarkDriver;
  sleep: GapDeps["sleep"];
  log: GapDeps["log"];
}

export type AutoCatchupState =
  | "not_parked" // watermark fresh (or absent) — the steady poll should run
  | "started" // fresh episode began this run and made progress (stopped by limit/guard)
  | "resumed" // resumed an episode and made progress (stopped)
  | "complete" // episode finished this run (watermark advanced, or already newer)
  | "already_complete" // found a complete checkpoint after a crash; finalized the advance
  | "refused" // lease held by another job / checkpoint stranded — zero paid calls
  | "no_roster"; // parked but the registry roster is empty

/** Safe, numeric-friendly snapshot of catch-up progress (no cursor VALUE, no
 *  tweet content, no secrets) for cron counts + alert bodies. */
export interface AutoCatchupCounts {
  requests: number;
  pages: number;
  returned: number;
  inserted: number;
  duplicates: number;
  unattributed: number;
  spendUsd: number;
  batchIndex: number;
  batches: number;
  /** 1 = a mid-batch cursor is pending (batch not exhausted), 0 = at a batch boundary */
  cursorPending: 0 | 1;
}

export interface AutoCatchupResult {
  state: AutoCatchupState;
  /** true when catch-up took over the invocation (the steady poll must NOT also run) */
  ran: boolean;
  /** true only for a `refused` caused by the lease being held (neutral, another job working) */
  leaseHeld?: boolean;
  reason?: string;
  ageSec?: number;
  fromUnix?: number;
  toUnix?: number;
  watermarkAdvanced?: boolean;
  counts?: AutoCatchupCounts;
  /** progress signature for stuck-checkpoint detection ("batchIndex/batches:cursorPending:inserted") */
  progressSig?: string;
}

function countsFrom(cp: GapCheckpoint): AutoCatchupCounts {
  return {
    requests: cp.counts.requests,
    pages: cp.counts.pages,
    returned: cp.counts.returned,
    inserted: cp.counts.inserted,
    duplicates: cp.counts.duplicates,
    unattributed: cp.counts.unattributed,
    spendUsd: cp.spendUsd,
    batchIndex: cp.batchIndex,
    batches: cp.batches,
    cursorPending: cp.cursor ? 1 : 0,
  };
}

function progressSigFrom(c: AutoCatchupCounts): string {
  return `${c.batchIndex}/${c.batches}:${c.cursorPending}:${c.inserted}`;
}

/**
 * Run one automatic catch-up slice IF the live x_api watermark is parked.
 * `accounts` is the current roster (used only to SNAPSHOT a fresh episode; resumes
 * use the checkpoint's immutable snapshot). Returns `{ ran: false }` when not
 * parked — the caller then runs its normal steady poll.
 */
export async function runXAutoCatchup(
  accounts: XAccount[],
  deps: AutoCatchupDeps,
  opts: AutoCatchupOpts,
): Promise<AutoCatchupResult> {
  const nowUnix = Math.floor(opts.nowMs / 1000);
  const wm = await deps.loadState<{ lastPollAt?: number }>(X_PROVIDER);
  if (!wm || typeof wm.lastPollAt !== "number") {
    return { state: "not_parked", ran: false, reason: "no watermark yet" };
  }
  const ageSec = nowUnix - wm.lastPollAt;
  if (ageSec <= opts.parkThresholdSec) {
    return { state: "not_parked", ran: false, ageSec };
  }

  const key = autoCatchupCheckpointKey(wm.lastPollAt);
  const provider = gapCheckpointProvider(key);
  const existing = await deps.loadState<GapCheckpoint>(provider);

  let roster: XAccount[];
  let fromUnix: number;
  let toUnix: number;

  if (existing) {
    fromUnix = existing.fromUnix;
    toUnix = existing.toUnix;
    const snap = existing.roster;
    if (!snap || snap.length === 0) {
      // No immutable roster snapshot to resume with (a checkpoint this build never
      // creates). Leave the watermark; surface as stranded so the operator is paged.
      return {
        state: "refused",
        ran: true,
        reason: "checkpoint has no roster snapshot — cannot resume unattended",
        ageSec,
        fromUnix,
        toUnix,
      };
    }
    roster = snap;
    if (existing.complete) {
      // Crash between complete and the CAS-advance: finalize the advance, no paid
      // calls. CAS never moves a newer watermark backward.
      const advanced = await deps.watermark.advance(fromUnix, toUnix);
      deps.log(
        `x auto-catch-up ${key}: completed checkpoint found — finalized watermark advance=${advanced} (zero paid calls)`,
      );
      const counts = countsFrom(existing);
      return {
        state: "already_complete",
        ran: true,
        ageSec,
        fromUnix,
        toUnix,
        watermarkAdvanced: advanced,
        counts,
        progressSig: progressSigFrom(counts),
      };
    }
  } else {
    roster = accounts;
    if (roster.length === 0) return { state: "no_roster", ran: false, ageSec };
    fromUnix = wm.lastPollAt;
    toUnix = nowUnix; // caughtUpTo — captured ONCE for the whole episode
  }

  const args: GapArgs = {
    fromUnix,
    toUnix,
    // No new USD allowance: the shared SpendGuard's existing X caps are the sole
    // spend bound. An infinite command budget never binds (and never logs).
    budgetUsd: Number.POSITIVE_INFINITY,
    batchSize: opts.batchSize,
    spacingMs: opts.spacingMs,
    checkpointKey: key,
  };
  const gapDeps: GapDeps = {
    guard: deps.guard,
    request: deps.request,
    insertDocs: deps.insertDocs,
    loadState: deps.loadState,
    saveState: deps.saveState,
    leaseDriver: deps.leaseDriver,
    sleep: deps.sleep,
    log: deps.log,
  };
  const outcome = await runGapBackfill(args, roster, gapDeps, { storeRoster: true });

  if (outcome.status === "refused") {
    const leaseHeld = /lease/i.test(outcome.reason);
    return { state: "refused", ran: true, leaseHeld, reason: outcome.reason, ageSec, fromUnix, toUnix };
  }
  if (outcome.status === "stopped") {
    const counts = countsFrom(outcome.checkpoint);
    return {
      state: existing ? "resumed" : "started",
      ran: true,
      reason: outcome.reason,
      ageSec,
      fromUnix,
      toUnix,
      counts,
      progressSig: progressSigFrom(counts),
    };
  }
  // complete: advance the live watermark to the fixed boundary (CAS, never backward)
  const advanced = await deps.watermark.advance(fromUnix, toUnix);
  const counts = countsFrom(outcome.checkpoint);
  return {
    state: "complete",
    ran: true,
    ageSec,
    fromUnix,
    toUnix,
    watermarkAdvanced: advanced,
    counts,
    progressSig: progressSigFrom(counts),
  };
}
