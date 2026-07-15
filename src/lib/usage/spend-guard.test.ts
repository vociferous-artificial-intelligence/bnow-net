import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { SpendGuard, envCap, envNum, utcDayIso, monthStartIso, stopCategory } =
  await import("./spend-guard");
import type { SpendGuardConfig, UsageSnapshot, UsageStore } from "./spend-guard";

function memStore(
  initial: UsageSnapshot = { totalUsd: 0, totalRequests: 0, dayUsd: 0, dayRequests: 0 },
): {
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
        state.totalRequests += requests;
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

  it("fails closed when the daily USD cap is unset (null)", async () => {
    const { store } = memStore();
    const g = new SpendGuard({ ...CFG, dailyUsdCap: null }, store);
    await g.init();
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("daily USD cap env unset");
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
    const { store } = memStore({ totalUsd: 0, totalRequests: 100, dayUsd: 0, dayRequests: 100 });
    const g = new SpendGuard(CFG, store);
    await g.init();
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("today's requests");
  });

  it("blocks at the daily USD cap", async () => {
    const { store } = memStore({ totalUsd: 0.99, totalRequests: 5, dayUsd: 0.99, dayRequests: 5 });
    const g = new SpendGuard(CFG, store);
    await g.init();
    expect(g.tryReserve().ok).toBe(true);
    await g.record(1, 100, 0.015); // crosses $1 today
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("daily cap");
  });

  it("blocks at the total (sprint) cap across days", async () => {
    const { store } = memStore({ totalUsd: 5.01, totalRequests: 400, dayUsd: 0, dayRequests: 0 });
    const g = new SpendGuard(CFG, store);
    await g.init();
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total spend");
  });

  it("request-cap-only mode (quota provider): allows under, blocks at cap", async () => {
    const { store } = memStore({ totalUsd: 0, totalRequests: 299, dayUsd: 0, dayRequests: 10 });
    const g = new SpendGuard(
      { ...CFG, totalCapUsd: null, totalRequestCap: 300, dailyRequestCap: 500 },
      store,
    );
    await g.init();
    expect(g.tryReserve().ok).toBe(true);
    await g.record(1, 1, 0.11);
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total requests");
  });

  it("request-cap set means USD cap absence does NOT fail closed", async () => {
    const { store } = memStore();
    const g = new SpendGuard({ ...CFG, totalCapUsd: null, totalRequestCap: 300 }, store);
    await g.init();
    expect(g.tryReserve().ok).toBe(true);
  });
});

// A store keyed by UTC day, mirroring pgUsageStore's SQL: the TOTAL window is
// `day >= totalStartIso` (all history when null), the DAY total is `day === dayIso`.
// `calls` captures what window the guard asked for.
function dayKeyedStore(rows: Array<{ day: string; requests: number; usd: number }>): {
  store: UsageStore;
  calls: Array<{ dayIso: string; totalStartIso: string | null }>;
} {
  const calls: Array<{ dayIso: string; totalStartIso: string | null }> = [];
  return {
    calls,
    store: {
      async load(_p, dayIso, totalStartIso) {
        calls.push({ dayIso, totalStartIso });
        let totalUsd = 0, totalRequests = 0, dayUsd = 0, dayRequests = 0;
        for (const r of rows) {
          if (totalStartIso === null || r.day >= totalStartIso) {
            totalUsd += r.usd;
            totalRequests += r.requests;
          }
          if (r.day === dayIso) {
            dayUsd += r.usd;
            dayRequests += r.requests;
          }
        }
        return { totalUsd, totalRequests, dayUsd, dayRequests };
      },
      async record() {},
    },
  };
}

// Request-cap quota provider (OpenSanctions-shaped): request cap only, high daily
// caps so the total/monthly window is what's under test.
const QUOTA: SpendGuardConfig = {
  provider: "opensanctions",
  totalCapUsd: null,
  totalRequestCap: 2000,
  dailyUsdCap: 40,
  dailyRequestCap: 100_000,
  runRequestCap: 100_000,
};

describe("SpendGuard total accounting period", () => {
  it("monthStartIso is the first UTC day, timezone-independent", () => {
    // (4) UTC month boundary regardless of the machine's local timezone.
    expect(monthStartIso(new Date("2026-07-01T00:00:00Z"))).toBe("2026-07-01");
    expect(monthStartIso(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07-01");
    expect(monthStartIso(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-01");
    // 2026-08-01T02:00Z is July 31 in US Pacific; a local-time impl would return
    // "2026-07-01". UTC getters return the August window.
    expect(monthStartIso(new Date("2026-08-01T02:00:00Z"))).toBe("2026-08-01");
  });

  it("(1) all_time is the default and still counts prior months", async () => {
    const { store, calls } = dayKeyedStore([
      { day: "2026-06-15", requests: 1500, usd: 0 }, // prior month
      { day: "2026-07-10", requests: 600, usd: 0 }, // this month
    ]);
    const g = new SpendGuard(QUOTA, store); // no totalPeriod -> all_time
    await g.init(new Date("2026-07-15T12:00:00Z"));
    expect(calls[0].totalStartIso).toBeNull(); // all history
    const r = g.tryReserve();
    expect(r.ok).toBe(false); // 1500 + 600 = 2100 >= 2000 because June is counted
    if (!r.ok) expect(r.code).toBe("total_requests");
  });

  it("(2) calendar_month excludes prior-month usage", async () => {
    const { store, calls } = dayKeyedStore([
      { day: "2026-06-15", requests: 1500, usd: 0 }, // excluded
      { day: "2026-07-10", requests: 600, usd: 0 }, // counted
    ]);
    const g = new SpendGuard({ ...QUOTA, totalPeriod: "calendar_month" }, store);
    await g.init(new Date("2026-07-15T12:00:00Z"));
    expect(calls[0].totalStartIso).toBe("2026-07-01");
    expect(g.tryReserve().ok).toBe(true); // only 600 counted, < 2000
  });

  it("(3) calendar_month includes the first and last UTC day of the month", async () => {
    const { store } = dayKeyedStore([
      { day: "2026-06-30", requests: 5000, usd: 0 }, // prior month — excluded
      { day: "2026-07-01", requests: 900, usd: 0 }, // first day — included
      { day: "2026-07-31", requests: 900, usd: 0 }, // last day — included
    ]);
    // Direct window math: first + last day counted, June 30 excluded.
    const snap = await store.load("opensanctions", "2026-07-31", monthStartIso(new Date("2026-07-31T23:59:59Z")));
    expect(snap.totalRequests).toBe(1800);

    // And through the guard on the last UTC instant of the month.
    const g = new SpendGuard({ ...QUOTA, totalRequestCap: 1800, totalPeriod: "calendar_month" }, store);
    await g.init(new Date("2026-07-31T23:59:59Z"));
    const r = g.tryReserve();
    expect(r.ok).toBe(false); // 1800 (both July days) >= 1800; June's 5000 not counted
    if (!r.ok) expect(r.code).toBe("total_requests");
  });

  it("(5) monthly request cap blocks at 2000 and allows at 1999", async () => {
    const at1999 = dayKeyedStore([{ day: "2026-07-10", requests: 1999, usd: 0 }]);
    const g1 = new SpendGuard({ ...QUOTA, totalPeriod: "calendar_month" }, at1999.store);
    await g1.init(new Date("2026-07-15T00:00:00Z"));
    expect(g1.tryReserve().ok).toBe(true);

    const at2000 = dayKeyedStore([{ day: "2026-07-10", requests: 2000, usd: 0 }]);
    const g2 = new SpendGuard({ ...QUOTA, totalPeriod: "calendar_month" }, at2000.store);
    await g2.init(new Date("2026-07-15T00:00:00Z"));
    const r = g2.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("total_requests");
    expect(stopCategory(r, "calendar_month")).toBe("monthly_cap");
  });

  it("(6) daily and run caps still win when lower than the monthly cap", async () => {
    // day cap 200 reached today, month total only 200 (< 2000): daily stop wins
    const today = dayKeyedStore([{ day: "2026-07-15", requests: 200, usd: 0 }]);
    const gDay = new SpendGuard(
      { ...QUOTA, totalPeriod: "calendar_month", dailyRequestCap: 200 },
      today.store,
    );
    await gDay.init(new Date("2026-07-15T12:00:00Z"));
    const rDay = gDay.tryReserve();
    expect(rDay.ok).toBe(false);
    if (!rDay.ok) expect(rDay.code).toBe("daily_requests");
    expect(stopCategory(rDay, "calendar_month")).toBe("daily_cap");

    // run cap 2 reached within the run, month + day both empty: run stop wins
    const fresh = dayKeyedStore([]);
    const gRun = new SpendGuard(
      { ...QUOTA, totalPeriod: "calendar_month", runRequestCap: 2 },
      fresh.store,
    );
    await gRun.init(new Date("2026-07-15T12:00:00Z"));
    await gRun.record(1, 1, 0.11);
    await gRun.record(1, 1, 0.11);
    const rRun = gRun.tryReserve();
    expect(rRun.ok).toBe(false);
    if (!rRun.ok) expect(rRun.code).toBe("run_requests");
    expect(stopCategory(rRun, "calendar_month")).toBe("run_cap");
  });

  it("(7) missing required cap fails closed even in calendar_month mode", async () => {
    const { store } = dayKeyedStore([]);
    const g = new SpendGuard(
      { ...QUOTA, totalCapUsd: null, totalRequestCap: null, totalPeriod: "calendar_month" },
      store,
    );
    await g.init(new Date("2026-07-15T12:00:00Z"));
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("cap_unset");
    expect(stopCategory(r, "calendar_month")).toBe("cap_unset");
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
