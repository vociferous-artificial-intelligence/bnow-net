import { describe, expect, it, vi } from "vitest";

// No real DB in unit tests: any path that reaches the Pool fails fast and the
// module's catch must convert it into a fail-closed refusal.
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    connect(): never {
      throw new Error("no db in unit tests");
    }
    query(): never {
      throw new Error("no db in unit tests");
    }
    end = async () => {};
  },
}));

const { AtomicReservationGuard, reserveProviderSpend } = await import("./reservations");

// DB-free coverage: the fail-closed refusal paths run BEFORE any Pool is
// created, and the guard's defensive record()-without-reserve path. The atomic
// transaction arithmetic (locks, fit checks, races, settlement) is proven on
// real Postgres in src/integration/ask-runs.itest.ts — mocks cannot prove it.

const CAPS = { totalCapUsd: 100, dailyUsdCap: 1, dailyRequestCap: 100, runRequestCap: 10 };

describe("reserveProviderSpend — fail-closed before any DB work", () => {
  it("total cap unset refuses with cap_unset", async () => {
    const r = await reserveProviderSpend({
      runId: "r", stage: "answer", attempt: 1, provider: "p", ceilingUsd: 0.1,
      caps: { ...CAPS, totalCapUsd: null },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("cap_unset");
  });

  it("daily USD cap unset refuses with daily_usd_unset", async () => {
    const r = await reserveProviderSpend({
      runId: "r", stage: "answer", attempt: 1, provider: "p", ceilingUsd: 0.1,
      caps: { ...CAPS, dailyUsdCap: null },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("daily_usd_unset");
  });

  it("a total REQUEST cap alone satisfies the total-cap requirement (quota providers)", async () => {
    // Passes the env checks, then fails closed at the (unreachable) DB with
    // not_initialized — proving the cap precedence without a database.
    const r = await reserveProviderSpend({
      runId: "r", stage: "answer", attempt: 1, provider: "p", ceilingUsd: 0.1,
      caps: { ...CAPS, totalCapUsd: null, totalRequestCap: 50 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_initialized"); // DB refusal, not cap_unset
  });
});

describe("AtomicReservationGuard", () => {
  it("record() without an open reservation warns and settles nothing (never throws)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = new AtomicReservationGuard({
      runId: "r", stage: "answer", provider: "p", caps: CAPS, ceilingUsd: 0.1,
    });
    await expect(guard.record(1, 100, 0.01)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no open reservation"));
    warn.mockRestore();
  });

  it("init() is a no-op (every tryReserve reads under the lock)", async () => {
    const guard = new AtomicReservationGuard({
      runId: "r", stage: "answer", provider: "p", caps: CAPS, ceilingUsd: 0.1,
    });
    await expect(guard.init()).resolves.toBeUndefined();
  });

  it("a refused tryReserve leaves no open reservation for record() to settle", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = new AtomicReservationGuard({
      runId: "r", stage: "answer", provider: "p",
      caps: { ...CAPS, totalCapUsd: null }, // cap_unset refusal, DB-free
      ceilingUsd: 0.1,
    });
    const r = await guard.tryReserve();
    expect(r.ok).toBe(false);
    await guard.record(1, 100, 0.01); // must not settle anything
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no open reservation"));
    warn.mockRestore();
  });
});
