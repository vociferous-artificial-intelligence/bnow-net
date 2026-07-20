// AI Search Phase 1: ask_runs lifecycle — create (idempotent), authorize
// (atomic allowance slot), terminalize (exactly once), lazy expiry.
// Contract: docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md.
//
// Two operating modes, selected by the CALLER (limits.ts) via askRunsEnforce():
//  - shadow (flag off, default): every write here is best-effort — a failure
//    logs and returns a null-ish result, the legacy gates stay authoritative,
//    and behavior remains byte-equivalent to Phase 0.
//  - enforce (ASK_RUNS_ENFORCE=1): createRun/authorize failures FAIL CLOSED at
//    the caller (a run that cannot be recorded must not spend).

import { Pool } from "@neondatabase/serverless";
import { utcDayIso } from "../usage/spend-guard";
import { expireStaleReservations } from "../usage/reservations";
import type { AnswerState, AskAnswerV2 } from "./types";

/** Enforce flag: unset/anything-but-"1" = shadow mode. */
export function askRunsEnforce(): boolean {
  return process.env.ASK_RUNS_ENFORCE === "1";
}

/** Non-terminal runs older than this are expired by the lazy sweep. Must be
 *  comfortably above the 60s route maxDuration so an in-flight run can never
 *  be expired underneath itself. */
export const RUN_EXPIRY_TTL_MS = 15 * 60_000;

export interface AskRunRow {
  id: string;
  userEmail: string;
  /** the run's stored question (400-char truncated) — replay compares it
   *  against the incoming question so a reused key can never silently bind a
   *  DIFFERENT question to an old answer (Gate 1 finding) */
  question: string;
  status: string;
  state: AnswerState | null;
  result: AskAnswerV2 | null;
  finishedAt: string | null;
  expired: boolean;
}

export interface CreateRunResult {
  run: AskRunRow;
  /** true when (user, idempotencyKey) already existed — the caller must NOT
   *  start a new pipeline for a replayed run */
  replayed: boolean;
}

/** Insert the run row (status 'created') or return the existing one for this
 *  (user, idempotencyKey). The run id IS the Phase 0 run_id, so ask_usage rows
 *  and ask_runs rows correlate 1:1. */
export async function createRun(opts: {
  runId: string;
  userEmail: string;
  question: string;
  idempotencyKey: string;
}): Promise<CreateRunResult> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const inserted = (await pool.query(
      `INSERT INTO ask_runs (id, user_email, question, idempotency_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_email, idempotency_key) DO NOTHING
       RETURNING id, user_email, question, status, state, result, finished_at::text AS finished_at, expired`,
      [opts.runId, opts.userEmail, opts.question.slice(0, 400), opts.idempotencyKey],
    )).rows as Array<{
      id: string;
      user_email: string;
      question: string;
      status: string;
      state: AnswerState | null;
      result: AskAnswerV2 | null;
      finished_at: string | null;
      expired: boolean;
    }>;
    if (inserted.length > 0) {
      const r = inserted[0];
      return {
        run: {
          id: r.id,
          userEmail: r.user_email,
          question: r.question,
          status: r.status,
          state: r.state,
          result: r.result,
          finishedAt: r.finished_at,
          expired: r.expired,
        },
        replayed: false,
      };
    }
    // Conflict: the key already names a run for this user — fetch it.
    const existing = (await pool.query(
      `SELECT id, user_email, question, status, state, result, finished_at::text AS finished_at, expired
       FROM ask_runs WHERE user_email = $1 AND idempotency_key = $2`,
      [opts.userEmail, opts.idempotencyKey],
    )).rows as Array<{
      id: string;
      user_email: string;
      question: string;
      status: string;
      state: AnswerState | null;
      result: AskAnswerV2 | null;
      finished_at: string | null;
      expired: boolean;
    }>;
    if (existing.length === 0) {
      // Insert lost AND select found nothing: only possible if the existing row
      // vanished between the two statements — treat as unrecordable.
      throw new Error("ask run conflict resolution found no row");
    }
    const r = existing[0];
    return {
      run: {
        id: r.id,
        userEmail: r.user_email,
        question: r.question,
        status: r.status,
        state: r.state,
        result: r.result,
        finishedAt: r.finished_at,
        expired: r.expired,
      },
      replayed: true,
    };
  } finally {
    await pool.end();
  }
}

export type AllowanceOutcome = { ok: true } | { ok: false; reason: "user_limit" | "unavailable" };

/** Atomically authorize one analysis slot for (user, UTC day). Lock-free:
 *  UNIQUE(user_email, day, slot) makes the last-slot race lose exactly one
 *  insert; UNIQUE(run_id) makes a replay reuse its slot (counts as ok). Bounded
 *  retry on mid-range slot collisions. Marks the run 'authorized' on success. */
export async function reserveAllowance(opts: {
  runId: string;
  userEmail: string;
  limit: number;
  now?: Date;
}): Promise<AllowanceOutcome> {
  const day = utcDayIso(opts.now ?? new Date());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (let tries = 0; tries < 3; tries++) {
      try {
        const r = await pool.query(
          `INSERT INTO ask_allowance_reservations (user_email, day, slot, run_id)
           SELECT $1, $2::date, coalesce(max(slot), 0) + 1, $3
           FROM ask_allowance_reservations WHERE user_email = $1 AND day = $2::date
           HAVING coalesce(max(slot), 0) < $4
           ON CONFLICT (run_id) DO NOTHING
           RETURNING slot`,
          [opts.userEmail, day, opts.runId, opts.limit],
        );
        if ((r.rowCount ?? 0) > 0) {
          await pool.query(
            `UPDATE ask_runs SET status = 'authorized', authorized_at = now()
             WHERE id = $1 AND status = 'created'`,
            [opts.runId],
          );
          return { ok: true };
        }
        // Zero rows: either the HAVING refused (at limit) or the run_id
        // conflict fired (replay already holds a slot). Distinguish:
        const held = await pool.query(
          `SELECT 1 FROM ask_allowance_reservations WHERE run_id = $1`,
          [opts.runId],
        );
        if ((held.rowCount ?? 0) > 0) return { ok: true }; // replay reuses its slot
        return { ok: false, reason: "user_limit" };
      } catch (e) {
        // UNIQUE(user_email, day, slot) collision: a concurrent insert took the
        // computed slot — retry with a fresh max(slot) read.
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("ask_allowance_user_day_slot_idx")) throw e;
      }
    }
    // Three consecutive slot collisions: contention, not the limit — but we
    // cannot prove a free slot remains, so refuse conservatively.
    return { ok: false, reason: "unavailable" };
  } catch (e) {
    console.warn(`reserveAllowance: unavailable — failing closed: ${e instanceof Error ? e.message : e}`);
    return { ok: false, reason: "unavailable" };
  } finally {
    await pool.end();
  }
}

/** Terminalize exactly once: a single conditional UPDATE (finished_at IS NULL)
 *  sets status/state/result/settlement. Returns false when another path
 *  terminalized first (the loser is a no-op, never a second write). */
export async function finalizeRun(opts: {
  runId: string;
  state: AnswerState;
  result: AskAnswerV2;
  settledCostUsd: number;
  errorClass?: string;
  /** Phase 7: customer-facing analysis units (units.ts policy); undefined
   *  writes NULL — pre-Phase-7 semantics preserved. */
  units?: number;
}): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `UPDATE ask_runs
       SET status = 'finished', state = $2, result = $3::jsonb,
           settled_cost_usd = $4, error_class = $5, units = $6, finished_at = now()
       WHERE id = $1 AND finished_at IS NULL`,
      [opts.runId, opts.state, JSON.stringify(opts.result), opts.settledCostUsd, opts.errorClass ?? null, opts.units ?? null],
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}

/** Lazy expiry sweep, invoked opportunistically at run creation (no new cron):
 *  non-terminal runs past the TTL are marked expired (allowance slot RETAINED —
 *  no free crash retries), then stale reservations release/ceiling-settle per
 *  the contract. Fail-soft: sweep failures never block the new run. */
export async function expireStaleRuns(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - RUN_EXPIRY_TTL_MS);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE ask_runs SET status = 'expired', expired = true, finished_at = now()
       WHERE finished_at IS NULL AND created_at < $1`,
      [cutoff.toISOString()],
    );
  } catch (e) {
    console.warn(`expireStaleRuns: sweep failed (non-blocking): ${e instanceof Error ? e.message : e}`);
  } finally {
    await pool.end();
  }
  try {
    await expireStaleReservations(RUN_EXPIRY_TTL_MS, now);
  } catch (e) {
    console.warn(`expireStaleRuns: reservation sweep failed (non-blocking): ${e instanceof Error ? e.message : e}`);
  }
}
