import { afterEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { acquireMapLease, mapLeaseTtlMs, memoryMapLeaseDriver } = await import("./map-lease");

// Semantics of the map lease over the memory driver (the pg driver's SQL is
// proven by src/integration/map-lease.itest.ts against real Postgres — same
// contract: free|expired acquire CAS, token-checked renew/release, monotonic
// fence surviving release).

const SAVED = { MAP_LEASE_TTL_SEC: process.env.MAP_LEASE_TTL_SEC };
afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("memoryMapLeaseDriver semantics", () => {
  it("two simultaneous acquisitions: exactly one owner", async () => {
    const driver = memoryMapLeaseDriver(() => 1_000);
    const [a, b] = await Promise.all([
      driver.tryAcquire("cron", "tok-a", 120_000),
      driver.tryAcquire("remap", "tok-b", 120_000),
    ]);
    // the memory driver resolves sequentially like the DB's row lock would:
    // exactly one of the two wins
    expect([a, b].filter((r) => r !== null)).toHaveLength(1);
    const state = await driver.read();
    expect(["tok-a", "tok-b"]).toContain(state!.token);
  });

  it("renew extends the TTL for the holder and is refused for a non-holder", async () => {
    let now = 0;
    const driver = memoryMapLeaseDriver(() => now);
    await driver.tryAcquire("cron", "tok", 100);
    now = 90;
    expect(await driver.renew("tok", 100)).toBe(true); // full reset from now
    now = 180; // 90 past the renew — still inside the reset TTL
    expect(await driver.tryAcquire("other", "tok2", 100)).toBeNull();
    expect(await driver.renew("intruder", 100)).toBe(false);
  });

  it("owner-only release; a stale owner's release is a refused no-op", async () => {
    const driver = memoryMapLeaseDriver(() => 0);
    await driver.tryAcquire("cron", "tok", 1000);
    expect(await driver.release("wrong-token")).toBe(false);
    expect((await driver.read())?.token).toBe("tok");
    expect(await driver.release("tok")).toBe(true);
    expect(await driver.read()).toBeNull();
  });

  it("takeover only after proven expiry; the old holder then loses renew AND release", async () => {
    let now = 0;
    const driver = memoryMapLeaseDriver(() => now);
    await driver.tryAcquire("cron", "old", 100);
    now = 99;
    expect(await driver.tryAcquire("remap", "new", 100)).toBeNull(); // not yet expired
    now = 100; // expiresAt <= now — provably expired
    const taken = await driver.tryAcquire("remap", "new", 100);
    expect(taken).not.toBeNull();
    expect(await driver.renew("old", 100)).toBe(false); // stale holder lost it
    expect(await driver.release("old")).toBe(false);
    expect((await driver.read())?.token).toBe("new");
  });

  it("an expired-but-unclaimed holder may still renew — never two current owners", async () => {
    let now = 0;
    const driver = memoryMapLeaseDriver(() => now);
    await driver.tryAcquire("cron", "tok", 100);
    now = 150; // expired, nobody took over
    expect(await driver.renew("tok", 100)).toBe(true); // sole token — safe
    expect(await driver.tryAcquire("remap", "tok2", 100)).toBeNull(); // renewed = held again
  });

  it("fence is monotonic across acquire/release/takeover cycles", async () => {
    let now = 0;
    const driver = memoryMapLeaseDriver(() => now);
    const a = await driver.tryAcquire("cron", "t1", 100);
    expect(a!.fence).toBe(1);
    await driver.release("t1");
    const b = await driver.tryAcquire("cron", "t2", 100);
    expect(b!.fence).toBe(2);
    now = 500; // expire t2
    const c = await driver.tryAcquire("remap", "t3", 100);
    expect(c!.fence).toBe(3);
  });
});

describe("acquireMapLease", () => {
  it("classifies a fresh acquire, exposes fence, and busy carries the holder", async () => {
    const driver = memoryMapLeaseDriver(() => 0);
    const first = await acquireMapLease("map", 1000, driver);
    expect(first.outcome).toBe("acquired");
    expect(first.handle?.fence).toBe(1);
    const second = await acquireMapLease("map:remap", 1000, driver);
    expect(second.outcome).toBe("busy");
    expect(second.handle).toBeNull();
    expect(second.reason).toContain("map"); // names the current holder
  });

  it("classifies an expiry takeover", async () => {
    let now = 0;
    const driver = memoryMapLeaseDriver(() => now);
    await acquireMapLease("map", 100, driver);
    now = 200;
    const taken = await acquireMapLease("map:remap", 100, driver);
    expect(taken.outcome).toBe("expired_takeover");
    expect(taken.handle?.fence).toBe(2);
  });

  it("a driver failure during acquire fails SAFELY: no handle, outcome error", async () => {
    const boom: Parameters<typeof acquireMapLease>[2] = {
      async tryAcquire() {
        throw new Error("db down");
      },
      async renew() {
        return false;
      },
      async release() {
        return false;
      },
      async read() {
        throw new Error("db down");
      },
    };
    const r = await acquireMapLease("map", 1000, boom);
    expect(r.handle).toBeNull();
    expect(r.outcome).toBe("error");
    expect(r.reason).toContain("db down");
  });

  it("release never throws even when the driver does", async () => {
    const driver = memoryMapLeaseDriver(() => 0);
    const r = await acquireMapLease("map", 1000, driver);
    driver.release = async () => {
      throw new Error("db down mid-release");
    };
    await expect(r.handle!.release()).resolves.toBeUndefined();
  });

  it("renew on the handle reflects a takeover as lost", async () => {
    let now = 0;
    const driver = memoryMapLeaseDriver(() => now);
    const holder = await acquireMapLease("map", 100, driver);
    now = 200;
    await acquireMapLease("map:remap", 100, driver); // takeover
    expect(await holder.handle!.renew()).toBe(false);
  });
});

describe("mapLeaseTtlMs", () => {
  it("defaults to 120s and clamps to the [30s, 600s] band", () => {
    delete process.env.MAP_LEASE_TTL_SEC;
    expect(mapLeaseTtlMs()).toBe(120_000);
    process.env.MAP_LEASE_TTL_SEC = "5";
    expect(mapLeaseTtlMs()).toBe(30_000);
    process.env.MAP_LEASE_TTL_SEC = "10000";
    expect(mapLeaseTtlMs()).toBe(600_000); // never outlives the 800s route
  });
});
