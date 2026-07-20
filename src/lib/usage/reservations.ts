// AI Search Phase 1: atomic provider-spend reservations + the run-scoped guard
// that puts them behind the existing SpendGuard call-site surface.
// Contract: docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md — read it
// before changing ANY transition here; deviations need a decision-register entry.
//
// Shape of the fix (architecture review F7): SpendGuard.tryReserve() is a
// read-then-act snapshot check, so N concurrent calls below a cap all pass. The
// atomic path serializes reservation attempts per provider under an advisory
// lock, counts ACTIVE (reserved|started) ceilings alongside provider_usage's
// settled actuals, and requires the new call's ceiling to FIT under both the
// daily and total caps. Near a cap boundary this refuses slightly earlier than
// the legacy guard (ceiling-aware fit vs current-below-cap) — that strictness
// IS the race fix and is the documented enforce-mode behavior.
//
// provider_usage remains the settled-actuals aggregate every legacy cap read
// consumes; provider_usage_reservations holds only in-flight ceilings. Their
// union is checked atomically; settlement closes the reservation AND upserts
// the actuals in ONE transaction, so a crash can only over-count (conservative)
// until expiry reconciles.

import { Pool, type PoolClient } from "@neondatabase/serverless";
import {
  monthStartIso,
  utcDayIso,
  type ReserveCode,
  type ReserveResult,
  type TotalPeriod,
} from "./spend-guard";

export type ReservationStage = "embed" | "rerank" | "answer";

export interface ReservationCaps {
  /** Total (sprint/quota) USD cap. null with no totalRequestCap -> fail closed. */
  totalCapUsd: number | null;
  totalRequestCap?: number | null;
  totalPeriod?: TotalPeriod;
  /** Per-UTC-day USD cap. null -> fail closed. */
  dailyUsdCap: number | null;
  dailyRequestCap: number;
  /** Max reservation attempts for one run against this provider. */
  runRequestCap: number;
}

export type ReserveOutcome = { ok: true; reservationId: string } | { ok: false; reason: string; code: ReserveCode };

/** The guard surface the ask stages consume. SpendGuard satisfies it (its
 *  synchronous tryReserve is awaited harmlessly); AtomicReservationGuard is the
 *  enforce-mode implementation. Stages must keep the reserve-before-call /
 *  record-after-call discipline regardless of which one they hold (ruling 4/8). */
export interface StageGuard {
  init(): Promise<void>;
  tryReserve(): ReserveResult | Promise<ReserveResult>;
  record(requests: number, units: number, usd: number): Promise<void>;
}

function refusal(code: ReserveCode, reason: string): ReserveOutcome {
  return { ok: false, code, reason };
}

/** Reserve `ceilingUsd` for one paid call, atomically, under the per-provider
 *  advisory lock. Inserts the reservation as `startedImmediately ? "started" :
 *  "reserved"` — the ask guard reserves-as-started because the HTTP dispatch
 *  follows synchronously (a crash before dispatch then settles conservatively
 *  at ceiling, the safe direction; see the decision register). */
export async function reserveProviderSpend(opts: {
  runId: string;
  stage: ReservationStage;
  attempt: number;
  provider: string;
  ceilingUsd: number;
  caps: ReservationCaps;
  startedImmediately?: boolean;
  now?: Date;
}): Promise<ReserveOutcome> {
  const { runId, stage, attempt, provider, ceilingUsd, caps } = opts;
  const now = opts.now ?? new Date();

  // Fail-closed env-cap semantics BEFORE any lock or insert (identical
  // precedence to SpendGuard.tryReserve).
  const hasUsdCap = caps.totalCapUsd !== null && Number.isFinite(caps.totalCapUsd);
  const hasReqCap = caps.totalRequestCap != null && Number.isFinite(caps.totalRequestCap);
  if (!hasUsdCap && !hasReqCap) {
    return refusal("cap_unset", `${provider}: total cap env unset — failing closed`);
  }
  if (caps.dailyUsdCap === null || !Number.isFinite(caps.dailyUsdCap)) {
    return refusal("daily_usd_unset", `${provider}: daily USD cap env unset — failing closed`);
  }

  const dayIso = utcDayIso(now);
  const totalStartIso = caps.totalPeriod === "calendar_month" ? monthStartIso(now) : null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // ONE advisory lock per transaction; provider-scoped, so openai_embed and
    // openai_ask never contend (envelope isolation is structural).
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ask_resv'), hashtext($1))", [provider]);

    const settledRows = (await client.query(
      `SELECT coalesce(sum(est_usd) FILTER (WHERE $3::date IS NULL OR day >= $3::date), 0)::float AS total_usd,
              coalesce(sum(requests) FILTER (WHERE $3::date IS NULL OR day >= $3::date), 0)::int AS total_requests,
              coalesce(sum(est_usd) FILTER (WHERE day = $2::date), 0)::float AS day_usd,
              coalesce(sum(requests) FILTER (WHERE day = $2::date), 0)::int AS day_requests
       FROM provider_usage WHERE provider = $1`,
      [provider, dayIso, totalStartIso],
    )).rows as Array<{ total_usd: number; total_requests: number; day_usd: number; day_requests: number }>;
    const settled = settledRows[0];

    const activeRows = (await client.query(
      `SELECT coalesce(sum(ceiling_usd) FILTER (WHERE $3::date IS NULL OR day >= $3::date), 0)::float AS total_usd,
              count(*) FILTER (WHERE $3::date IS NULL OR day >= $3::date)::int AS total_count,
              coalesce(sum(ceiling_usd) FILTER (WHERE day = $2::date), 0)::float AS day_usd,
              count(*) FILTER (WHERE day = $2::date)::int AS day_count
       FROM provider_usage_reservations
       WHERE provider = $1 AND status IN ('reserved','started')`,
      [provider, dayIso, totalStartIso],
    )).rows as Array<{ total_usd: number; total_count: number; day_usd: number; day_count: number }>;
    const active = activeRows[0];

    const runRows = (await client.query(
      `SELECT count(*)::int AS n FROM provider_usage_reservations WHERE run_id = $1 AND provider = $2`,
      [runId, provider],
    )).rows as Array<{ n: number }>;
    const runCount = runRows[0].n;

    let refuse: ReserveOutcome | null = null;
    if (hasUsdCap && settled.total_usd + active.total_usd + ceilingUsd > (caps.totalCapUsd as number)) {
      refuse = refusal(
        "total_usd",
        `${provider}: total settled $${settled.total_usd.toFixed(4)} + active $${active.total_usd.toFixed(4)} + ceiling $${ceilingUsd.toFixed(4)} > cap $${caps.totalCapUsd}`,
      );
    } else if (hasReqCap && settled.total_requests + active.total_count + 1 > (caps.totalRequestCap as number)) {
      refuse = refusal(
        "total_requests",
        `${provider}: total requests ${settled.total_requests} + active ${active.total_count} + 1 > cap ${caps.totalRequestCap}`,
      );
    } else if (settled.day_usd + active.day_usd + ceilingUsd > caps.dailyUsdCap) {
      refuse = refusal(
        "daily_usd",
        `${provider}: today's settled $${settled.day_usd.toFixed(4)} + active $${active.day_usd.toFixed(4)} + ceiling $${ceilingUsd.toFixed(4)} > daily cap $${caps.dailyUsdCap}`,
      );
    } else if (settled.day_requests + active.day_count + 1 > caps.dailyRequestCap) {
      refuse = refusal(
        "daily_requests",
        `${provider}: today's requests ${settled.day_requests} + active ${active.day_count} + 1 > daily cap ${caps.dailyRequestCap}`,
      );
    } else if (runCount + 1 > caps.runRequestCap) {
      refuse = refusal("run_requests", `${provider}: run requests ${runCount} + 1 > run cap ${caps.runRequestCap}`);
    }
    if (refuse) {
      await client.query("ROLLBACK");
      return refuse;
    }

    const inserted = (await client.query(
      `INSERT INTO provider_usage_reservations (run_id, stage, attempt, provider, day, ceiling_usd, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [runId, stage, attempt, provider, dayIso, ceilingUsd, opts.startedImmediately ? "started" : "reserved"],
    )).rows as Array<{ id: string }>;
    await client.query("COMMIT");
    return { ok: true, reservationId: inserted[0].id };
  } catch (e) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    // Fail CLOSED: an unreadable/unwritable budget is a refusal, never an
    // unguarded call (same stance as the allowance gate).
    return refusal(
      "not_initialized",
      `${provider}: reservation transaction failed — failing closed (${e instanceof Error ? e.message : e})`,
    );
  } finally {
    client?.release();
    await pool.end();
  }
}

/** reserved -> started, immediately before dispatching the call. Idempotent
 *  (zero rows on a lost race). */
export async function markReservationStarted(reservationId: string): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `UPDATE provider_usage_reservations SET status = 'started'
       WHERE id = $1 AND status = 'reserved'`,
      [reservationId],
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}

/** Close a started/reserved reservation to its ACTUALS and upsert them into
 *  provider_usage — one transaction, so the ceiling stops counting exactly when
 *  the actuals start counting. Idempotent: a second settle updates zero rows
 *  and writes nothing. */
export async function settleReservation(
  reservationId: string,
  actual: { requests: number; units: number; usd: number },
): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const closed = (await client.query(
      `UPDATE provider_usage_reservations
       SET status = 'settled', actual_usd = $2, settled_at = now()
       WHERE id = $1 AND status IN ('reserved','started')
       RETURNING provider`,
      [reservationId, actual.usd],
    )).rows as Array<{ provider: string }>;
    if (closed.length === 0) {
      await client.query("ROLLBACK");
      return false; // already settled/released — never double-write actuals
    }
    await client.query(
      `INSERT INTO provider_usage (provider, day, requests, units, est_usd)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, day) DO UPDATE SET
         requests = provider_usage.requests + EXCLUDED.requests,
         units = provider_usage.units + EXCLUDED.units,
         est_usd = provider_usage.est_usd + EXCLUDED.est_usd,
         updated_at = now()`,
      [closed[0].provider, utcDayIso(), actual.requests, actual.units, actual.usd],
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client?.release();
    await pool.end();
  }
}

/** Release a reservation whose call NEVER began. Refuses (returns false) if the
 *  call was marked started — a started call may have been billed and must
 *  settle (actuals or conservative ceiling), never vanish. */
export async function releaseUnstartedReservation(reservationId: string): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `UPDATE provider_usage_reservations SET status = 'released', settled_at = now()
       WHERE id = $1 AND status = 'reserved'`,
      [reservationId],
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}

/** Lazy expiry: reservations older than `ttlMs` are terminalized — 'reserved'
 *  rows release (no spend); 'started' rows settle conservatively AT CEILING
 *  (the call may have been billed and its usage frame is lost; ruling 8's
 *  spirit — later corrections are new adjustment records, never mutations).
 *  Each row settles through the same one-transaction close+upsert as a normal
 *  settlement, so a concurrent real settlement wins or loses atomically. */
export async function expireStaleReservations(
  ttlMs: number,
  now: Date = new Date(),
): Promise<{ released: number; ceilingSettled: number }> {
  const cutoff = new Date(now.getTime() - ttlMs);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const released = await pool.query(
      `UPDATE provider_usage_reservations SET status = 'released', settled_at = now()
       WHERE status = 'reserved' AND created_at < $1`,
      [cutoff.toISOString()],
    );
    const stale = (await pool.query(
      `SELECT id, ceiling_usd FROM provider_usage_reservations
       WHERE status = 'started' AND created_at < $1`,
      [cutoff.toISOString()],
    )).rows as Array<{ id: string; ceiling_usd: number }>;
    let ceilingSettled = 0;
    for (const row of stale) {
      // requests=1 (the dispatched call), units=0 (unknown), usd=ceiling (conservative).
      const ok = await settleReservation(row.id, { requests: 1, units: 0, usd: row.ceiling_usd });
      if (ok) ceilingSettled++;
    }
    return { released: released.rowCount ?? 0, ceilingSettled };
  } finally {
    await pool.end();
  }
}

// ---- the run-scoped stage guard -------------------------------------------------

/** Enforce-mode guard: same call-site surface as SpendGuard, backed by atomic
 *  reservations. One instance per (run, stage, provider); each tryReserve() is
 *  a new attempt (embed batches loop reserve->call->record). record() settles
 *  the attempt it opened; a throw between them leaves a 'started' row for the
 *  conservative expiry path. */
export class AtomicReservationGuard implements StageGuard {
  private attempt = 0;
  private openReservationId: string | null = null;

  constructor(
    private readonly opts: {
      runId: string;
      stage: ReservationStage;
      provider: string;
      caps: ReservationCaps;
      /** per-call spend ceiling, derived from the stage's output-token limit +
       *  a bounded input estimate against the price table (contract §2) */
      ceilingUsd: number;
    },
  ) {}

  async init(): Promise<void> {
    // No snapshot to load: every tryReserve reads under the lock.
  }

  async tryReserve(): Promise<ReserveResult> {
    this.attempt += 1;
    const r = await reserveProviderSpend({
      runId: this.opts.runId,
      stage: this.opts.stage,
      attempt: this.attempt,
      provider: this.opts.provider,
      ceilingUsd: this.opts.ceilingUsd,
      caps: this.opts.caps,
      startedImmediately: true,
    });
    if (!r.ok) return { ok: false, reason: r.reason, code: r.code };
    this.openReservationId = r.reservationId;
    return { ok: true };
  }

  async record(requests: number, units: number, usd: number): Promise<void> {
    const id = this.openReservationId;
    this.openReservationId = null;
    if (id === null) {
      // Defensive: record() without a matching reserve would mean a call-site
      // discipline break — surface loudly, never swallow spend.
      console.warn(
        `AtomicReservationGuard(${this.opts.provider}/${this.opts.stage}): record() with no open reservation — settling nothing`,
      );
      return;
    }
    await settleReservation(id, { requests, units, usd });
  }
}
