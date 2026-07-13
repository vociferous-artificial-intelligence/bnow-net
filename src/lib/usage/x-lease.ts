// Narrow lease serializing PAID X/twitterapi.io work. Two concurrent X jobs (the
// :20 scheduled poll and the historical recovery driver) would each init() a
// SpendGuard from the same persisted snapshot and could jointly overshoot a cap —
// the lease makes X spending single-writer. It is X-specific by design: no other
// provider's concurrency semantics change.
//
// State lives in the existing provider_state table under the reserved key
// 'x_api_lease' — deliberately NOT the 'x_api' row, which is the poll watermark
// and must never be touched by lease traffic. Acquisition is one atomic
// INSERT ... ON CONFLICT DO UPDATE ... WHERE (free | expired | same owner)
// RETURNING, so two competing owners cannot both see success. Expiry is compared
// against DB now() (no wall-clock skew); a crashed holder is taken over once its
// TTL lapses. Release is owner-checked and never throws (safe in finally).

// @/db requires DATABASE_URL at module load; import lazily so pure consumers
// (unit tests with the memory driver) never need a DB.
async function sql() {
  return (await import("@/db")).rawSql;
}

export const X_LEASE_PROVIDER = "x_api_lease";
/** Holder must renew within this window or lose the lease to a takeover. */
export const X_LEASE_TTL_MS = 120_000;

export interface XLeaseState extends Record<string, unknown> {
  owner: string;
  /** timestamptz text, DB-generated — compared against DB now(), never Date.now() */
  expiresAt: string;
}

export interface XLeaseDriver {
  /** Atomically take/refresh the lease iff it is free, expired, or already owned
   *  by `owner`. True = `owner` holds it for another ttlMs. */
  tryWrite(owner: string, ttlMs: number): Promise<boolean>;
  /** Owner-checked release; a non-owner's clear is a no-op returning false. */
  clear(owner: string): Promise<boolean>;
  read(): Promise<XLeaseState | null>;
}

export const pgXLeaseDriver: XLeaseDriver = {
  async tryWrite(owner, ttlMs) {
    const rows = (await (await sql()).query(
      `INSERT INTO provider_state (provider, state, updated_at)
       VALUES ($1, jsonb_build_object('owner', $2::text,
                                      'expiresAt', (now() + ($3::int * interval '1 millisecond'))::text),
               now())
       ON CONFLICT (provider) DO UPDATE
         SET state = EXCLUDED.state, updated_at = now()
         WHERE provider_state.state->>'owner' IS NULL
            OR provider_state.state->>'owner' = $2
            OR (provider_state.state->>'expiresAt')::timestamptz <= now()
       RETURNING provider`,
      [X_LEASE_PROVIDER, owner, ttlMs],
    )) as unknown[];
    return rows.length > 0;
  },
  async clear(owner) {
    const rows = (await (await sql()).query(
      `UPDATE provider_state SET state = '{}'::jsonb, updated_at = now()
       WHERE provider = $1 AND state->>'owner' = $2
       RETURNING provider`,
      [X_LEASE_PROVIDER, owner],
    )) as unknown[];
    return rows.length > 0;
  },
  async read() {
    const rows = (await (await sql()).query(
      `SELECT state FROM provider_state WHERE provider = $1`,
      [X_LEASE_PROVIDER],
    )) as Array<{ state: XLeaseState | null }>;
    const s = rows[0]?.state;
    return s && typeof s.owner === "string" ? s : null;
  },
};

/** In-memory driver with the pg driver's exact semantics (free | expired | same
 *  owner), for unit tests; expiry compares against the injected clock. The SQL
 *  itself is covered by src/integration/x-lease.itest.ts. */
export function memoryXLeaseDriver(now: () => number = Date.now): XLeaseDriver {
  let lease: XLeaseState | null = null;
  return {
    async tryWrite(owner, ttlMs) {
      const free =
        lease === null || lease.owner === owner || new Date(lease.expiresAt).getTime() <= now();
      if (!free) return false;
      lease = { owner, expiresAt: new Date(now() + ttlMs).toISOString() };
      return true;
    },
    async clear(owner) {
      if (lease?.owner !== owner) return false;
      lease = null;
      return true;
    },
    async read() {
      return lease;
    },
  };
}

export interface XLeaseHandle {
  owner: string;
  /** Extend the TTL mid-run (long recovery renews per page). False = lost it. */
  renew(): Promise<boolean>;
  /** Owner-checked, never throws — safe (and expected) in a finally block. */
  release(): Promise<void>;
}

/** null = another job holds an unexpired lease: make ZERO paid X calls. */
export async function acquireXLease(
  owner: string,
  ttlMs: number = X_LEASE_TTL_MS,
  driver: XLeaseDriver = pgXLeaseDriver,
): Promise<XLeaseHandle | null> {
  if (!(await driver.tryWrite(owner, ttlMs))) return null;
  return {
    owner,
    renew: () => driver.tryWrite(owner, ttlMs),
    release: async () => {
      try {
        await driver.clear(owner);
      } catch (e) {
        console.warn(`x-lease: release failed (lease expires on its own): ${e instanceof Error ? e.message : e}`);
      }
    },
  };
}
