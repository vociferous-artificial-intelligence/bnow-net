import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres coverage for the X provider lease's atomic SQL (the unit suite
// covers the semantics over the memory driver; this proves the actual
// INSERT ... ON CONFLICT ... WHERE (free | expired | same owner) RETURNING
// behaves identically, including DB-time expiry comparison).

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL; // pgXLeaseDriver reads @/db — point it at the branch

const { pgXLeaseDriver, X_LEASE_PROVIDER } = await import("@/lib/usage/x-lease");

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [X_LEASE_PROVIDER]);
});

afterAll(async () => {
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [X_LEASE_PROVIDER]);
  await pool.end();
});

describe("pgXLeaseDriver", () => {
  it("acquire → contend → renew → owner-checked release → expired takeover", async () => {
    // fresh acquire
    expect(await pgXLeaseDriver.tryWrite("itest-recovery", 60_000)).toBe(true);
    expect((await pgXLeaseDriver.read())?.owner).toBe("itest-recovery");

    // competing owner refused while unexpired
    expect(await pgXLeaseDriver.tryWrite("itest-poll", 60_000)).toBe(false);
    expect((await pgXLeaseDriver.read())?.owner).toBe("itest-recovery");

    // same-owner renew succeeds and extends expiry
    const before = (await pgXLeaseDriver.read())!.expiresAt;
    expect(await pgXLeaseDriver.tryWrite("itest-recovery", 120_000)).toBe(true);
    const after = (await pgXLeaseDriver.read())!.expiresAt;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());

    // non-owner release is a no-op
    expect(await pgXLeaseDriver.clear("itest-poll")).toBe(false);
    expect((await pgXLeaseDriver.read())?.owner).toBe("itest-recovery");

    // owner release frees it
    expect(await pgXLeaseDriver.clear("itest-recovery")).toBe(true);
    expect(await pgXLeaseDriver.read()).toBeNull();

    // simulate a crashed holder whose TTL already lapsed (DB-time comparison)
    await pool.query(
      `INSERT INTO provider_state (provider, state)
       VALUES ($1, jsonb_build_object('owner', 'itest-crashed', 'expiresAt', (now() - interval '1 second')::text))
       ON CONFLICT (provider) DO UPDATE SET state = EXCLUDED.state`,
      [X_LEASE_PROVIDER],
    );
    expect(await pgXLeaseDriver.tryWrite("itest-taker", 60_000)).toBe(true);
    expect((await pgXLeaseDriver.read())?.owner).toBe("itest-taker");
    expect(await pgXLeaseDriver.clear("itest-taker")).toBe(true);
  });

  it("never touches the live x_api watermark row", async () => {
    const { rows: pre } = await pool.query(`SELECT state FROM provider_state WHERE provider = 'x_api'`);
    await pgXLeaseDriver.tryWrite("itest-isolation", 60_000);
    await pgXLeaseDriver.clear("itest-isolation");
    const { rows: post } = await pool.query(`SELECT state FROM provider_state WHERE provider = 'x_api'`);
    expect(post).toEqual(pre);
  });
});
