// Durable lease serializing MAP-STAGE work (hourly cron, backfill driver, remap
// operator) — the OPEN-TASKS #77 fix. The previous session advisory lock
// (pg_try_advisory_lock on a pooled connection) stranded on the Neon pooler:
// pgbouncer could route the unlock to a DIFFERENT server connection than the
// lock's, leaving the lock held by an idle backend and every later cycle
// recording `skipped`. This lease replaces it with short single-statement
// writes against the existing provider_state table — no session state, no
// long-lived transaction spanning provider calls, nothing a pooler can strand.
//
// State lives under the reserved provider key 'map_lease' (its own row; the
// x_api lease and every poll watermark are untouched). Semantics:
//
// - ACQUIRE is one atomic INSERT ... ON CONFLICT DO UPDATE ... WHERE
//   (free | expired) RETURNING: two competing acquirers cannot both see
//   success, and takeover happens ONLY after proven expiry (compare-and-set
//   against DB now() — no wall-clock skew between holders).
// - The holder is identified by an unguessable random TOKEN (crypto UUID),
//   the sole authorization for renew/release — tokens are never reused, so a
//   release-and-reacquire by anyone else invalidates every stale handle (the
//   actual ABA protection).
// - Every acquisition (fresh, sequential, or expiry takeover) increments a
//   monotonic FENCE counter that survives release — a later holder always
//   carries a strictly larger fence than any earlier one. The fence is
//   DIAGNOSTIC ONLY: it orders log lines across crashes, and NO data write
//   carries or checks it. Writes are gated by a token ownership re-check
//   before the write, which is a check-then-act and not a statement fence
//   (see the residual at the bottom of this header).
// - RENEW is token-checked and resets the FULL TTL. Two AUTHORIZED owners are
//   impossible: renew succeeds only while this token is still the row's token,
//   and a takeover atomically replaces the token, after which the old holder's
//   renew returns false (the "lost" signal). An expired-but-not-yet-taken-over
//   holder may still renew — until the takeover CAS lands there is exactly one
//   token, so no two holders ever both hold a VALID token at the same instant.
//   That is an authorization property, not a write-exclusion property: a
//   holder whose token was valid when it checked can still be mid-write when
//   the takeover lands (see the residual at the bottom of this header).
// - RELEASE is token-checked, preserves the fence, and never throws (safe in
//   finally). A stale holder's release is a no-op returning false.
// - A database failure during acquire fails SAFELY: no lease -> the caller
//   makes zero paid calls and zero map writes for that cycle.
//
// Expiry is bounded against the map route's lifetime: the TTL (default 120s)
// is far below the route's maxDuration (800s), and the worker renews at every
// physical provider attempt and immediately before every write, so an
// abandoned holder (crash, timeout) is recoverable within one TTL — well
// inside the hourly cron gap. A HEALTHY holder can still expire while a
// single physical call outlives the TTL (the SDK's own request timeout is
// longer): the takeover is then legitimate, the stale holder's next
// renew/ownership check fails and it discards its unpersisted work (already
// metered), and the usual consequence is bounded duplicate BILLING of
// in-flight batches.
//
// WHAT THIS LEASE IS NOT — the accepted residual, stated exactly:
//
// This lease is strictly safer than the pg_try_advisory_lock it replaces (no
// pooled-session stranding, proven-expiry takeover only, per-acquisition
// tokens, DB-clock expiry), but it is NOT a fenced writer. The fence counter
// is DIAGNOSTIC ONLY: no map write carries it and no map table checks it.
// Writes are protected by a token OWNERSHIP RE-CHECK (a full-TTL renew)
// performed immediately BEFORE the write — a check-then-act, not an atomic
// statement fence. The unprotected window is therefore the whole
// renew-to-COMMIT span, not a single statement: for a 25-doc persistBatch
// that span is a multi-statement transaction of roughly a hundred networked
// round-trips. If that entire span stalls for longer than the full TTL at
// exactly the wrong instant, a takeover can land first and BOTH generations
// may commit. The unique keys (doc_claims(doc,track,version,ordinal) and the
// doc_map_state PK, both ON CONFLICT DO NOTHING) keep that duplicate-proof
// but not interleave-proof: the result is a first-writer-wins MIXED-GENERATION
// claim set for that one (doc, track, version). Traceability and publication
// safety are unaffected (every interleaved claim was genuinely extracted from
// its own document, and these are shadow-map tables only).
//
// Eliminating the residual outright requires a fence column on the map tables
// so each write can refuse a lower fence in the same statement — a schema
// change deliberately deferred out of this change set (OPEN-TASKS #85).

import { randomUUID } from "node:crypto";
import { envNum } from "../usage/spend-guard";

// @/db requires DATABASE_URL at module load; import lazily so pure consumers
// (unit tests with the memory driver) never need a DB.
async function sql() {
  return (await import("@/db")).rawSql;
}

export const MAP_LEASE_PROVIDER = "map_lease";

/** Holder must renew within this window or lose the lease to a takeover.
 *  Env-tunable, clamped so it can neither thrash (sub-batch expiry) nor
 *  outlive the route's 800s maxDuration. */
export function mapLeaseTtlMs(): number {
  return Math.min(600, Math.max(30, envNum("MAP_LEASE_TTL_SEC", 120))) * 1000;
}

export interface MapLeaseState extends Record<string, unknown> {
  /** diagnostics only — never an authorization */
  owner: string;
  /** unguessable holder credential; null-token row = free */
  token: string;
  /** monotonic across acquisitions; survives release */
  fence: number;
  /** timestamptz text, DB-generated — compared against DB now(), never Date.now() */
  expiresAt: string;
}

export interface MapLeaseAcquired {
  fence: number;
  expiresAt: string;
}

export interface MapLeaseDriver {
  /** Atomically take the lease iff it is free or provably expired. A same-owner
   *  re-acquire is deliberately NOT special-cased: every acquisition is a new
   *  fence. null = an unexpired holder exists. */
  tryAcquire(owner: string, token: string, ttlMs: number): Promise<MapLeaseAcquired | null>;
  /** Token-checked full-TTL extension. false = this token no longer holds it. */
  renew(token: string, ttlMs: number): Promise<boolean>;
  /** Token-checked release preserving the fence. false = not the holder. */
  release(token: string): Promise<boolean>;
  read(): Promise<MapLeaseState | null>;
}

export const pgMapLeaseDriver: MapLeaseDriver = {
  async tryAcquire(owner, token, ttlMs) {
    const rows = (await (await sql()).query(
      `INSERT INTO provider_state (provider, state, updated_at)
       VALUES ($1, jsonb_build_object('owner', $2::text, 'token', $3::text, 'fence', 1,
                                      'expiresAt', (now() + ($4::int * interval '1 millisecond'))::text),
               now())
       ON CONFLICT (provider) DO UPDATE
         SET state = jsonb_build_object(
               'owner', $2::text, 'token', $3::text,
               'fence', COALESCE((provider_state.state->>'fence')::bigint, 0) + 1,
               'expiresAt', (now() + ($4::int * interval '1 millisecond'))::text),
             updated_at = now()
         WHERE provider_state.state->>'token' IS NULL
            OR (provider_state.state->>'expiresAt')::timestamptz <= now()
       RETURNING (state->>'fence')::bigint AS fence, state->>'expiresAt' AS expires_at`,
      [MAP_LEASE_PROVIDER, owner, token, ttlMs],
    )) as Array<{ fence: number | string; expires_at: string }>;
    if (rows.length === 0) return null;
    return { fence: Number(rows[0].fence), expiresAt: rows[0].expires_at };
  },
  async renew(token, ttlMs) {
    const rows = (await (await sql()).query(
      `UPDATE provider_state
       SET state = jsonb_set(state, '{expiresAt}',
                             to_jsonb((now() + ($3::int * interval '1 millisecond'))::text)),
           updated_at = now()
       WHERE provider = $1 AND state->>'token' = $2
       RETURNING provider`,
      [MAP_LEASE_PROVIDER, token, ttlMs],
    )) as unknown[];
    return rows.length > 0;
  },
  async release(token) {
    const rows = (await (await sql()).query(
      `UPDATE provider_state
       SET state = jsonb_build_object('fence', COALESCE((state->>'fence')::bigint, 0)),
           updated_at = now()
       WHERE provider = $1 AND state->>'token' = $2
       RETURNING provider`,
      [MAP_LEASE_PROVIDER, token],
    )) as unknown[];
    return rows.length > 0;
  },
  async read() {
    const rows = (await (await sql()).query(
      `SELECT state FROM provider_state WHERE provider = $1`,
      [MAP_LEASE_PROVIDER],
    )) as Array<{ state: MapLeaseState | null }>;
    const s = rows[0]?.state;
    return s && typeof s.token === "string" ? s : null;
  },
};

/** In-memory driver with the pg driver's exact semantics (free | expired ->
 *  acquire bumps fence; token-checked renew/release; fence survives release),
 *  for deterministic unit tests; expiry compares against the injected clock.
 *  The SQL itself is covered by src/integration/map-lease.itest.ts. */
export function memoryMapLeaseDriver(now: () => number = Date.now): MapLeaseDriver {
  let lease: MapLeaseState | null = null;
  let fence = 0;
  return {
    async tryAcquire(owner, token, ttlMs) {
      const free = lease === null || new Date(lease.expiresAt).getTime() <= now();
      if (!free) return null;
      fence += 1;
      lease = { owner, token, fence, expiresAt: new Date(now() + ttlMs).toISOString() };
      return { fence, expiresAt: lease.expiresAt };
    },
    async renew(token, ttlMs) {
      if (lease?.token !== token) return false;
      lease = { ...lease, expiresAt: new Date(now() + ttlMs).toISOString() };
      return true;
    },
    async release(token) {
      if (lease?.token !== token) return false;
      lease = null;
      return true;
    },
    async read() {
      return lease;
    },
  };
}

/** How an acquisition attempt resolved — recorded (as numbers) in
 *  cron_runs.counts.lease for operator visibility. */
export type MapLeaseAcquireOutcome = "acquired" | "expired_takeover" | "busy" | "error";

export interface MapLeaseHandle {
  owner: string;
  token: string;
  fence: number;
  /** classification of THIS acquisition (observational; correctness lives in
   *  the atomic acquire CAS, not here) */
  outcome: "acquired" | "expired_takeover";
  /** Full-TTL extension. false = lost to a takeover: make no further map
   *  writes and no further paid dispatches. */
  renew(): Promise<boolean>;
  /** Token-checked, never throws — safe (and expected) in a finally block.
   *  false = the release was refused (stale token) or failed. */
  release(): Promise<boolean>;
}

export interface MapLeaseAcquireResult {
  handle: MapLeaseHandle | null;
  outcome: MapLeaseAcquireOutcome;
  /** human-readable refusal/error detail when handle is null */
  reason: string | null;
}

/** Acquire the map lease, classifying the outcome. A driver failure fails
 *  SAFELY (outcome "error", handle null): the caller must treat it exactly
 *  like "busy" — zero paid calls, zero map writes this cycle. */
export async function acquireMapLease(
  owner: string,
  ttlMs: number = mapLeaseTtlMs(),
  driver: MapLeaseDriver = pgMapLeaseDriver,
): Promise<MapLeaseAcquireResult> {
  const token = randomUUID();
  try {
    // read-before-CAS is classification only: the CAS alone decides ownership
    const prior = await driver.read();
    const acquired = await driver.tryAcquire(owner, token, ttlMs);
    if (!acquired) {
      return {
        handle: null,
        outcome: "busy",
        reason: `another map cycle holds the lease (owner ${prior?.owner ?? "unknown"}, expires ${prior?.expiresAt ?? "unknown"})`,
      };
    }
    const outcome: MapLeaseHandle["outcome"] = prior !== null ? "expired_takeover" : "acquired";
    return {
      handle: {
        owner,
        token,
        fence: acquired.fence,
        outcome,
        renew: () => driver.renew(token, ttlMs),
        release: async () => {
          try {
            return await driver.release(token);
          } catch (e) {
            console.warn(
              `map-lease: release failed (lease expires on its own): ${e instanceof Error ? e.message : e}`,
            );
            return false;
          }
        },
      },
      outcome,
      reason: null,
    };
  } catch (e) {
    return {
      handle: null,
      outcome: "error",
      reason: `lease acquire failed (no map work this cycle): ${e instanceof Error ? e.message : e}`,
    };
  }
}
