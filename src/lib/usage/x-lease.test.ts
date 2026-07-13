import { describe, expect, it } from "vitest";
import { acquireXLease, memoryXLeaseDriver } from "./x-lease";

// Semantics of the X provider lease (acquire / contend / renew / owner-checked
// release / expired takeover) over the memory driver, which mirrors the pg
// driver's atomic WHERE (free | expired | same owner). The SQL itself is
// exercised by src/integration/x-lease.itest.ts on a real Postgres.

describe("x provider lease", () => {
  it("acquires a free lease", async () => {
    const driver = memoryXLeaseDriver(() => 1_000);
    const lease = await acquireXLease("poll-a", 60_000, driver);
    expect(lease).not.toBeNull();
    expect((await driver.read())?.owner).toBe("poll-a");
  });

  it("refuses a competing owner while the lease is unexpired", async () => {
    let now = 1_000;
    const driver = memoryXLeaseDriver(() => now);
    expect(await acquireXLease("recovery-1", 60_000, driver)).not.toBeNull();
    now = 30_000; // half the TTL later
    expect(await acquireXLease("poll-b", 60_000, driver)).toBeNull();
    expect((await driver.read())?.owner).toBe("recovery-1");
  });

  it("renewal extends the holder's expiry", async () => {
    let now = 0;
    const driver = memoryXLeaseDriver(() => now);
    const lease = (await acquireXLease("recovery-1", 60_000, driver))!;
    now = 50_000;
    expect(await lease.renew()).toBe(true);
    now = 100_000; // past the ORIGINAL expiry, inside the renewed one
    expect(await acquireXLease("poll-b", 60_000, driver)).toBeNull();
  });

  it("release is owner-checked: a non-owner cannot clear it", async () => {
    const now = 0;
    const driver = memoryXLeaseDriver(() => now);
    const held = (await acquireXLease("recovery-1", 60_000, driver))!;
    expect(await driver.clear("someone-else")).toBe(false);
    expect((await driver.read())?.owner).toBe("recovery-1");
    await held.release();
    expect(await driver.read()).toBeNull();
    // freed: anyone can take it now
    expect(await acquireXLease("poll-b", 60_000, driver)).not.toBeNull();
  });

  it("an expired lease is taken over (crash recovery)", async () => {
    let now = 0;
    const driver = memoryXLeaseDriver(() => now);
    expect(await acquireXLease("crashed-run", 60_000, driver)).not.toBeNull();
    now = 60_000; // TTL lapsed, holder never released
    const taker = await acquireXLease("poll-b", 60_000, driver);
    expect(taker).not.toBeNull();
    expect((await driver.read())?.owner).toBe("poll-b");
    // the crashed holder's stale handle can no longer renew or release
    expect(await driver.clear("crashed-run")).toBe(false);
    expect((await driver.read())?.owner).toBe("poll-b");
  });

  it("re-acquire by the same owner behaves as a renew, not a conflict", async () => {
    const driver = memoryXLeaseDriver(() => 0);
    expect(await acquireXLease("recovery-1", 60_000, driver)).not.toBeNull();
    expect(await acquireXLease("recovery-1", 60_000, driver)).not.toBeNull();
  });
});
