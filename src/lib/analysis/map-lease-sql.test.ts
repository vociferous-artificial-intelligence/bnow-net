import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// ALWAYS-RUN pins on the lease's PRODUCTION SQL predicates.
//
// The whole mutual-exclusion story rests on three predicates, and the
// independent review (2026-08-21, MINOR-2) demonstrated that deleting ANY of
// them left `npm test` fully green — they were covered only by the Neon-gated
// `src/integration/map-lease.itest.ts`, which the enforced pre-push gate does
// not run and which CI skips when the Neon secret is absent. Same ruling-21
// shape as the write-gate pins in map-worker-lease-writes.test.ts.
//
// These tests execute the REAL `pgMapLeaseDriver` against a fake `rawSql` and
// assert on the SQL text it actually issues. They are deliberately structural:
// the semantics are proven on real Postgres by the itest, while these keep a
// refactor from silently deleting the predicate that makes those semantics
// true.
// ---------------------------------------------------------------------------

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const h = vi.hoisted(() => ({
  calls: [] as Array<{ sql: string; params: unknown[] }>,
  rows: [] as unknown[],
}));

vi.mock("@/db", () => ({
  rawSql: {
    query: async (sql: string, params: unknown[] = []) => {
      h.calls.push({ sql, params });
      return h.rows;
    },
  },
}));

const { pgMapLeaseDriver, MAP_LEASE_PROVIDER } = await import("./map-lease");

const sqlOf = (i = 0) => h.calls[i].sql;
/** collapse whitespace so assertions do not depend on formatting */
const flat = (s: string) => s.replace(/\s+/g, " ");

beforeEach(() => {
  h.calls.length = 0;
  h.rows = [];
});

describe("acquire is an atomic CAS under proven expiry", () => {
  it("is ONE statement: upsert on the primary key with a conflict-side WHERE and RETURNING", async () => {
    h.rows = [{ fence: 7, expires_at: "2026-08-21T00:02:00Z" }];
    await pgMapLeaseDriver.tryAcquire("map", "tok-1", 120_000);

    expect(h.calls).toHaveLength(1); // no read-then-write window
    const s = flat(sqlOf());
    expect(s).toMatch(/INSERT INTO provider_state/);
    expect(s).toMatch(/ON CONFLICT \(provider\) DO UPDATE/);
    expect(s).toMatch(/RETURNING/);
  });

  it("takes over ONLY when the row is free or PROVABLY expired", async () => {
    h.rows = [{ fence: 1, expires_at: "x" }];
    await pgMapLeaseDriver.tryAcquire("map", "tok-1", 120_000);
    const s = flat(sqlOf());

    // the conflict-side guard: without it the upsert is a blind last-writer-wins
    // steal and every concurrent acquirer "wins" (split brain by construction)
    expect(s).toMatch(/WHERE provider_state\.state->>'token' IS NULL/);
    expect(s).toMatch(/OR \(provider_state\.state->>'expiresAt'\)::timestamptz <= now\(\)/);
  });

  it("expiry is generated and compared against the DB clock, never an app clock", async () => {
    h.rows = [{ fence: 1, expires_at: "x" }];
    await pgMapLeaseDriver.tryAcquire("map", "tok-1", 120_000);
    const s = flat(sqlOf());

    // written as now() + interval, compared against now(): no holder's wall
    // clock participates in any authorization decision
    expect(s).toMatch(/now\(\) \+ \(\$4::int \* interval '1 millisecond'\)/);
    expect(s).toMatch(/<= now\(\)/);
    // the only bound params are provider/owner/token/ttl — no timestamp crosses
    // the boundary from Node
    expect(h.calls[0].params).toEqual([MAP_LEASE_PROVIDER, "map", "tok-1", 120_000]);
  });

  it("every acquisition increments a fence that survives the previous holder", async () => {
    h.rows = [{ fence: 1, expires_at: "x" }];
    await pgMapLeaseDriver.tryAcquire("map", "tok-1", 120_000);
    expect(flat(sqlOf())).toMatch(
      /'fence', COALESCE\(\(provider_state\.state->>'fence'\)::bigint, 0\) \+ 1/,
    );
  });
});

describe("renew and release are token-checked", () => {
  it("renew can only succeed while THIS token still owns the row", async () => {
    await pgMapLeaseDriver.renew("tok-1", 120_000);
    const s = flat(sqlOf());
    // without the token predicate a stale holder resurrects a lease that was
    // already taken over, and stillOwner() returns true forever afterwards
    expect(s).toMatch(/WHERE provider = \$1 AND state->>'token' = \$2/);
    expect(s).toMatch(/RETURNING/);
    expect(h.calls[0].params).toEqual([MAP_LEASE_PROVIDER, "tok-1", 120_000]);
  });

  it("release is token-bound and PRESERVES the fence", async () => {
    await pgMapLeaseDriver.release("tok-1");
    const s = flat(sqlOf());
    // without the token predicate a stale holder frees the CURRENT holder's
    // lease and a third cycle can acquire on top of a live writer
    expect(s).toMatch(/WHERE provider = \$1 AND state->>'token' = \$2/);
    expect(s).toMatch(/'fence', COALESCE\(\(state->>'fence'\)::bigint, 0\)/);
    // and it must clear the token — a release that kept it would never free
    expect(s).not.toMatch(/'token'\s*,\s*\$/);
    expect(h.calls[0].params).toEqual([MAP_LEASE_PROVIDER, "tok-1"]);
  });

  it("both report ownership from the rows actually affected", async () => {
    h.rows = [];
    expect(await pgMapLeaseDriver.renew("stale", 1000)).toBe(false);
    expect(await pgMapLeaseDriver.release("stale")).toBe(false);
    h.rows = [{ provider: MAP_LEASE_PROVIDER }];
    expect(await pgMapLeaseDriver.renew("mine", 1000)).toBe(true);
    expect(await pgMapLeaseDriver.release("mine")).toBe(true);
  });
});

describe("read is classification only", () => {
  it("selects the row without mutating it, and treats a tokenless row as free", async () => {
    h.rows = [{ state: { fence: 3 } }]; // released shape: no token
    expect(await pgMapLeaseDriver.read()).toBeNull();
    expect(flat(sqlOf())).toBe(`SELECT state FROM provider_state WHERE provider = $1`);

    h.calls.length = 0;
    h.rows = [{ state: { owner: "map", token: "t", fence: 4, expiresAt: "2026-08-21T00:00:00Z" } }];
    expect(await pgMapLeaseDriver.read()).toMatchObject({ token: "t", fence: 4 });
  });
});

describe("no session state anywhere in the lease", () => {
  it("never uses an advisory lock, a transaction, or a SET", async () => {
    h.rows = [{ fence: 1, expires_at: "x" }];
    await pgMapLeaseDriver.tryAcquire("map", "tok-1", 120_000);
    await pgMapLeaseDriver.renew("tok-1", 120_000);
    await pgMapLeaseDriver.release("tok-1");
    await pgMapLeaseDriver.read();

    expect(h.calls).toHaveLength(4); // one self-contained statement each
    for (const { sql } of h.calls) {
      // the OPEN-TASKS #77 defect class: anything a pgbouncer connection can
      // strand must stay out of the lease
      expect(sql).not.toMatch(/pg_advisory/i);
      expect(sql.trim()).not.toMatch(/^(BEGIN|COMMIT|ROLLBACK|START TRANSACTION)\b/i);
      // `SET` appears only as the UPDATE clause, never as a session setting
      expect(sql).not.toMatch(/SET\s+(SESSION|LOCAL|TRANSACTION|search_path|statement_timeout)/i);
    }
  });
});
