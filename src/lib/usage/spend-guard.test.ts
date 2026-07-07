import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { SpendGuard, envCap, envNum, utcDayIso } = await import("./spend-guard");
import type { UsageSnapshot, UsageStore } from "./spend-guard";

function memStore(initial: UsageSnapshot = { totalUsd: 0, dayUsd: 0, dayRequests: 0 }): {
  store: UsageStore;
  state: UsageSnapshot;
} {
  const state = { ...initial };
  return {
    state,
    store: {
      async load() {
        return { ...state };
      },
      async record(_p, _d, requests, _units, usd) {
        state.dayRequests += requests;
        state.dayUsd += usd;
        state.totalUsd += usd;
      },
    },
  };
}

const CFG = {
  provider: "test",
  totalCapUsd: 5,
  dailyUsdCap: 1,
  dailyRequestCap: 100,
  runRequestCap: 10,
};

describe("SpendGuard", () => {
  it("fails closed when the total cap is unset (null)", async () => {
    const { store } = memStore();
    const g = new SpendGuard({ ...CFG, totalCapUsd: null }, store);
    await g.init();
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("failing closed");
  });

  it("fails closed when init() was never called", () => {
    const { store } = memStore();
    const g = new SpendGuard(CFG, store);
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("not initialized");
  });

  it("allows requests under all caps and records usage", async () => {
    const { store, state } = memStore();
    const g = new SpendGuard(CFG, store);
    await g.init();
    expect(g.tryReserve().ok).toBe(true);
    await g.record(1, 20, 0.003);
    expect(state.dayRequests).toBe(1);
    expect(state.totalUsd).toBeCloseTo(0.003);
    expect(g.runStats.usd).toBeCloseTo(0.003);
  });

  it("blocks at the per-run request cap", async () => {
    const { store } = memStore();
    const g = new SpendGuard({ ...CFG, runRequestCap: 2 }, store);
    await g.init();
    await g.record(1, 0, 0);
    await g.record(1, 0, 0);
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("run requests");
  });

  it("blocks at the daily request cap including persisted history", async () => {
    const { store } = memStore({ totalUsd: 0, dayUsd: 0, dayRequests: 100 });
    const g = new SpendGuard(CFG, store);
    await g.init();
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("today's requests");
  });

  it("blocks at the daily USD cap", async () => {
    const { store } = memStore({ totalUsd: 0.99, dayUsd: 0.99, dayRequests: 5 });
    const g = new SpendGuard(CFG, store);
    await g.init();
    expect(g.tryReserve().ok).toBe(true);
    await g.record(1, 100, 0.015); // crosses $1 today
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("daily cap");
  });

  it("blocks at the total (sprint) cap across days", async () => {
    const { store } = memStore({ totalUsd: 5.01, dayUsd: 0, dayRequests: 0 });
    const g = new SpendGuard(CFG, store);
    await g.init();
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total spend");
  });
});

describe("env helpers", () => {
  it("envCap returns null when unset/invalid/zero (fail-closed input)", () => {
    delete process.env.TEST_CAP_X;
    expect(envCap("TEST_CAP_X")).toBeNull();
    process.env.TEST_CAP_X = "abc";
    expect(envCap("TEST_CAP_X")).toBeNull();
    process.env.TEST_CAP_X = "0";
    expect(envCap("TEST_CAP_X")).toBeNull();
    process.env.TEST_CAP_X = "5";
    expect(envCap("TEST_CAP_X")).toBe(5);
    delete process.env.TEST_CAP_X;
  });

  it("envNum falls back on unset/invalid", () => {
    delete process.env.TEST_NUM_X;
    expect(envNum("TEST_NUM_X", 7)).toBe(7);
    process.env.TEST_NUM_X = "12";
    expect(envNum("TEST_NUM_X", 7)).toBe(12);
    process.env.TEST_NUM_X = "nope";
    expect(envNum("TEST_NUM_X", 7)).toBe(7);
    delete process.env.TEST_NUM_X;
  });

  it("utcDayIso formats a UTC day", () => {
    expect(utcDayIso(new Date("2026-07-07T23:59:59Z"))).toBe("2026-07-07");
  });
});
