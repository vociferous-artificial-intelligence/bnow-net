import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres coverage for the map lease's atomic SQL (unit suite covers the
// semantics over the memory driver; this proves the actual
// INSERT ... ON CONFLICT ... WHERE (free | expired) RETURNING CAS, the
// token-checked renew/release, DB-time expiry comparison, and the fence's
// monotonicity across acquire/release/takeover — including a genuinely
// concurrent two-acquirer race).

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL; // pgMapLeaseDriver reads @/db — point it at the branch

const { MAP_LEASE_PROVIDER, pgMapLeaseDriver } = await import("@/lib/analysis/map-lease");

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [MAP_LEASE_PROVIDER]);
});

afterAll(async () => {
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [MAP_LEASE_PROVIDER]);
  await pool.end();
});

describe("pgMapLeaseDriver", () => {
  it("acquire → contend → renew → token-checked release → fence survives", async () => {
    const a = await pgMapLeaseDriver.tryAcquire("map", "tok-a", 60_000);
    expect(a).not.toBeNull();
    expect(a!.fence).toBe(1);

    // competing acquirer refused while unexpired
    expect(await pgMapLeaseDriver.tryAcquire("map:remap", "tok-b", 60_000)).toBeNull();
    expect((await pgMapLeaseDriver.read())?.token).toBe("tok-a");

    // token-checked renew RESETS the full TTL (not merely >=): renewing with a
    // 300s TTL moves expiry ~240s past the original 60s grant — a no-op
    // jsonb_set would fail this
    const before = (await pgMapLeaseDriver.read())!.expiresAt;
    expect(await pgMapLeaseDriver.renew("tok-a", 300_000)).toBe(true);
    const after = (await pgMapLeaseDriver.read())!.expiresAt;
    expect(new Date(after).getTime() - new Date(before).getTime()).toBeGreaterThan(120_000);
    expect(await pgMapLeaseDriver.renew("tok-b", 300_000)).toBe(false);

    // non-holder release is a refused no-op; holder release frees but keeps fence
    expect(await pgMapLeaseDriver.release("tok-b")).toBe(false);
    expect((await pgMapLeaseDriver.read())?.token).toBe("tok-a");
    expect(await pgMapLeaseDriver.release("tok-a")).toBe(true);
    expect(await pgMapLeaseDriver.read()).toBeNull();

    // next acquisition continues the fence sequence
    const b = await pgMapLeaseDriver.tryAcquire("map", "tok-c", 60_000);
    expect(b!.fence).toBe(2);
    await pgMapLeaseDriver.release("tok-c");
  });

  it("takeover only after proven expiry (DB-time CAS); the stale holder loses renew and release", async () => {
    // a crashed holder whose TTL already lapsed, seeded directly with fence 7
    await pool.query(
      `INSERT INTO provider_state (provider, state)
       VALUES ($1, jsonb_build_object('owner', 'crashed', 'token', 'tok-dead', 'fence', 7,
                                      'expiresAt', (now() - interval '1 second')::text))
       ON CONFLICT (provider) DO UPDATE SET state = EXCLUDED.state`,
      [MAP_LEASE_PROVIDER],
    );
    // an UNEXPIRED holder cannot be taken over
    await pool.query(
      `UPDATE provider_state SET state = jsonb_set(state, '{expiresAt}', to_jsonb((now() + interval '60 seconds')::text))
       WHERE provider = $1`,
      [MAP_LEASE_PROVIDER],
    );
    expect(await pgMapLeaseDriver.tryAcquire("map", "tok-early", 60_000)).toBeNull();

    // expire it again — now the CAS admits exactly the taker
    await pool.query(
      `UPDATE provider_state SET state = jsonb_set(state, '{expiresAt}', to_jsonb((now() - interval '1 second')::text))
       WHERE provider = $1`,
      [MAP_LEASE_PROVIDER],
    );
    const taken = await pgMapLeaseDriver.tryAcquire("map", "tok-taker", 60_000);
    expect(taken).not.toBeNull();
    expect(taken!.fence).toBe(8); // monotonic past the crashed holder's fence

    expect(await pgMapLeaseDriver.renew("tok-dead", 60_000)).toBe(false);
    expect(await pgMapLeaseDriver.release("tok-dead")).toBe(false);
    expect((await pgMapLeaseDriver.read())?.token).toBe("tok-taker");
    await pgMapLeaseDriver.release("tok-taker");
  });

  it("two genuinely concurrent acquisitions: exactly one owner", async () => {
    const results = await Promise.all([
      pgMapLeaseDriver.tryAcquire("racer-1", "tok-r1", 60_000),
      pgMapLeaseDriver.tryAcquire("racer-2", "tok-r2", 60_000),
    ]);
    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    const state = await pgMapLeaseDriver.read();
    expect(["tok-r1", "tok-r2"]).toContain(state!.token);
    await pgMapLeaseDriver.release(state!.token);
  });
});
