import { describe, expect, it } from "vitest";

// fetchLatest watermark discipline (OPEN-TASKS #38): the watermark is insert-
// gated (prepared by a COMPLETE pass, persisted only by commitMarks) and every
// failure mode — budget stop, HTTP error, network throw, junk payload, page
// ceiling with a pending cursor — must leave it unmovable. All seams injected;
// nothing here touches a DB or the network.

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.X_API_KEY ??= "test-key-never-logged";

const { XApiAdapter, isSearchPayload } = await import("./x-api");
import type { XAccount, XApiDeps } from "./x-api";
import { SpendGuard, type UsageStore } from "../usage/spend-guard";
import { acquireXLease, memoryXLeaseDriver } from "../usage/x-lease";

const CENTCOM: XAccount = {
  userName: "centcom",
  sourceKey: "x.com/centcom",
  countryIso2: "ru",
  citations: 105,
};

const memoryUsage: UsageStore = {
  load: async () => ({ totalUsd: 0, totalRequests: 0, dayUsd: 0, dayRequests: 0 }),
  record: async () => {},
};

function testGuard(runRequestCap = 100): SpendGuard {
  return new SpendGuard(
    {
      provider: "x_api",
      totalCapUsd: 100,
      dailyUsdCap: 10,
      dailyRequestCap: 1000,
      runRequestCap,
    },
    memoryUsage,
  );
}

function memoryState() {
  const map = new Map<string, Record<string, unknown>>();
  let saves = 0;
  return {
    map,
    savesCount: () => saves,
    load: (async (provider: string) => map.get(provider) ?? null) as XApiDeps["loadState"],
    save: (async (provider: string, state: Record<string, unknown>) => {
      saves++;
      map.set(provider, state);
    }) as XApiDeps["saveState"],
  };
}

/** thrown by the fake fetch to signal a non-2xx response */
class HttpFail {
  constructor(readonly status: number) {}
}

function pagedFetch(pages: unknown[]) {
  const calls: string[] = [];
  const fn = (async (url: Parameters<typeof fetch>[0]) => {
    calls.push(String(url));
    const page = pages[Math.min(calls.length - 1, pages.length - 1)];
    if (page instanceof Error) throw page;
    if (page instanceof HttpFail) {
      return { ok: false, status: page.status, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => page } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const tw = (id: string) => ({
  id,
  text: `tweet ${id}`,
  author: { userName: "centcom" },
  createdAt: "Tue Jul 07 17:50:06 +0000 2026",
});

function makeAdapter(
  pages: unknown[],
  { accounts = [CENTCOM], guard = testGuard(), maxPagesPerBatch = 5, batchSize = 20 } = {},
) {
  const state = memoryState();
  const { fn, calls } = pagedFetch(pages);
  const adapter = new XApiAdapter(
    accounts,
    guard,
    { spacingMs: 0, maxPagesPerBatch, batchSize },
    { loadState: state.load, saveState: state.save, fetchImpl: fn, leaseDriver: memoryXLeaseDriver() },
  );
  return { adapter, state, calls };
}

describe("isSearchPayload", () => {
  it("accepts both response shapes, including valid-empty", () => {
    expect(isSearchPayload({ tweets: [] })).toBe(true);
    expect(isSearchPayload({ tweets: [tw("1")], has_next_page: false })).toBe(true);
    expect(isSearchPayload({ data: { tweets: [] } })).toBe(true);
  });
  it("rejects junk/error bodies", () => {
    expect(isSearchPayload(null)).toBe(false);
    expect(isSearchPayload("nope")).toBe(false);
    expect(isSearchPayload({ status: "error", message: "rate limited" })).toBe(false);
    expect(isSearchPayload({ data: {} })).toBe(false);
  });
});

describe("XApiAdapter.fetchLatest watermark discipline", () => {
  it("a genuinely exhausted pass commits only via commitMarks (insert-gated)", async () => {
    const { adapter, state } = makeAdapter([{ tweets: [tw("1")], has_next_page: false }]);
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(1);
    expect(adapter.runStats.incomplete).toBe(0);
    expect(adapter.runStats.requests).toBe(1);
    expect(adapter.runStats.units).toBe(1);
    // nothing persisted during the fetch itself
    expect(state.map.get("x_api")).toBeUndefined();
    await adapter.commitMarks();
    const wm = state.map.get("x_api") as { lastPollAt: number };
    expect(typeof wm.lastPollAt).toBe("number");
    expect(wm.lastPollAt).toBeGreaterThan(0);
    // idempotent: a second commit writes nothing new
    const saves = state.savesCount();
    await adapter.commitMarks();
    expect(state.savesCount()).toBe(saves);
  });

  it("an insert failure keeps the watermark (the runner never reaches commitMarks)", async () => {
    const { adapter, state } = makeAdapter([{ tweets: [tw("1")], has_next_page: false }]);
    const docs = await adapter.fetchLatest();
    // runIngest inserts BEFORE commitMarks; simulate the insert throwing
    await expect(
      (async () => {
        void docs;
        throw new Error("insert failed");
      })(),
    ).rejects.toThrow("insert failed");
    expect(state.map.get("x_api")).toBeUndefined();
  });

  it("a budget stop cannot advance the watermark", async () => {
    const { adapter, state, calls } = makeAdapter([{ tweets: [tw("1")], has_next_page: false }], {
      guard: testGuard(0), // run cap 0: first tryReserve refuses
    });
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(0);
    expect(calls).toHaveLength(0); // refused BEFORE the paid call
    expect(adapter.runStats.budgetStops).toBe(1);
    expect(adapter.runStats.incomplete).toBe(1);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeUndefined();
  });

  it("an HTTP failure cannot advance the watermark (partial docs still returned)", async () => {
    const two = [CENTCOM, { ...CENTCOM, userName: "sentdefender", sourceKey: "x.com/sentdefender" }];
    const { adapter, state } = makeAdapter(
      [{ tweets: [tw("1")], has_next_page: false }, new HttpFail(500)],
      { accounts: two, batchSize: 1 }, // 2 batches: first succeeds, second 500s
    );
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(1); // partial results kept for idempotent insertion
    expect(adapter.runStats.requestFailures).toBe(1);
    expect(adapter.runStats.incomplete).toBe(1);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeUndefined();
  });

  it("a network throw cannot advance the watermark", async () => {
    const { adapter, state } = makeAdapter([new Error("ECONNRESET")]);
    await adapter.fetchLatest();
    expect(adapter.runStats.requestFailures).toBe(1);
    expect(adapter.runStats.incomplete).toBe(1);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeUndefined();
  });

  it("a junk 200 payload is a parser failure, not an exhausted batch", async () => {
    const { adapter, state } = makeAdapter([{ status: "error", message: "try later" }]);
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(0);
    expect(adapter.runStats.requestFailures).toBe(1);
    expect(adapter.runStats.requests).toBe(1); // the request minimum was recorded
    expect(adapter.runStats.incomplete).toBe(1);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeUndefined();
  });

  it("reaching the page ceiling with another cursor pending is a visible truncation", async () => {
    const { adapter, state, calls } = makeAdapter(
      [
        { tweets: [tw("1")], has_next_page: true, next_cursor: "c1" },
        { tweets: [tw("2")], has_next_page: true, next_cursor: "c2" },
      ],
      { maxPagesPerBatch: 2 },
    );
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(2); // both fetched pages inserted
    expect(calls).toHaveLength(2); // ceiling preserved: no third request
    expect(calls[1]).toContain("cursor=c1"); // cursor actually followed
    expect(adapter.runStats.pageTruncations).toBe(1);
    expect(adapter.runStats.incomplete).toBe(1);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeUndefined();
  });

  it("a multi-page batch that exhausts under the ceiling stays complete", async () => {
    const { adapter, state } = makeAdapter(
      [
        { tweets: [tw("1")], has_next_page: true, next_cursor: "c1" },
        { tweets: [tw("2")], has_next_page: false },
      ],
      { maxPagesPerBatch: 5 },
    );
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(2);
    expect(adapter.runStats.incomplete).toBe(0);
    expect(adapter.runStats.pageTruncations).toBe(0);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeDefined();
  });

  it("an empty-but-valid poll is complete (watermark advances after commit)", async () => {
    const { adapter, state } = makeAdapter([{ tweets: [], has_next_page: false }]);
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(0);
    expect(adapter.runStats.incomplete).toBe(0);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeDefined();
  });

  it("a held lease means zero paid calls, lockSkips=1, watermark untouched", async () => {
    const driver = memoryXLeaseDriver();
    await acquireXLease("recovery-holds-it", 60_000, driver);
    const state = memoryState();
    const { fn, calls } = pagedFetch([{ tweets: [tw("1")], has_next_page: false }]);
    const adapter = new XApiAdapter([CENTCOM], testGuard(), { spacingMs: 0 }, {
      loadState: state.load,
      saveState: state.save,
      fetchImpl: fn,
      leaseDriver: driver,
    });
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(adapter.runStats.lockSkips).toBe(1);
    expect(adapter.runStats.incomplete).toBe(1);
    await adapter.commitMarks();
    expect(state.map.get("x_api")).toBeUndefined();
    // and the recovery's lease survived the skipped poll
    expect((await driver.read())?.owner).toBe("recovery-holds-it");
  });

  it("releases its lease when the pass ends (complete or not)", async () => {
    const driver = memoryXLeaseDriver();
    const state = memoryState();
    const { fn } = pagedFetch([{ tweets: [], has_next_page: false }]);
    const adapter = new XApiAdapter([CENTCOM], testGuard(), { spacingMs: 0 }, {
      loadState: state.load,
      saveState: state.save,
      fetchImpl: fn,
      leaseDriver: driver,
    });
    await adapter.fetchLatest();
    expect(await driver.read()).toBeNull();
  });
});

describe("XApiAdapter.fetchLatest self-heal integration (#38 + #66)", () => {
  it("when catch-up takes over, fetchLatest returns [] (it inserted internally) and records catch-up + alert stats", async () => {
    const state = memoryState();
    const { fn, calls } = pagedFetch([{ tweets: [tw("1")], has_next_page: false }]);
    const healthCalls: Array<{ counters: unknown; context: { catchup: { state: string } | null } }> = [];
    const adapter = new XApiAdapter([CENTCOM], testGuard(), { spacingMs: 0 }, {
      loadState: state.load,
      saveState: state.save,
      fetchImpl: fn,
      leaseDriver: memoryXLeaseDriver(),
      autoCatchup: async () => ({
        state: "complete",
        ran: true,
        ageSec: 30000,
        watermarkAdvanced: true,
        counts: {
          requests: 12,
          pages: 12,
          returned: 40,
          inserted: 30,
          duplicates: 10,
          unattributed: 0,
          spendUsd: 0.006,
          batchIndex: 3,
          batches: 3,
          cursorPending: 0,
        },
        progressSig: "3/3:0:30",
      }),
      healthCheck: async (counters, context) => {
        healthCalls.push({ counters, context });
        return { evaluated: true, alert: "recovery", reasons: [], delivery: "sent", episodeKey: null };
      },
    });
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(0); // catch-up already inserted; steady poll never ran
    expect(calls).toHaveLength(0);
    expect(adapter.runStats.mode).toBe(2);
    expect(adapter.runStats.docs).toBe(30);
    expect(adapter.runStats.catchupState).toBe(3); // complete
    expect(adapter.runStats.watermarkAdvanced).toBe(1);
    expect(adapter.runStats.alertKind).toBe(2); // recovery
    expect(adapter.runStats.alertDelivery).toBe(1); // sent
    // the health monitor saw the catch-up context, not a steady poll
    expect(healthCalls[0].context.catchup?.state).toBe("complete");
  });

  it("when not parked, the steady poll runs and health is evaluated exactly once", async () => {
    const state = memoryState();
    const { fn, calls } = pagedFetch([{ tweets: [tw("1")], has_next_page: false }]);
    let healthN = 0;
    let steadyCatchup: unknown = "unset";
    const adapter = new XApiAdapter([CENTCOM], testGuard(), { spacingMs: 0 }, {
      loadState: state.load,
      saveState: state.save,
      fetchImpl: fn,
      leaseDriver: memoryXLeaseDriver(),
      autoCatchup: async () => ({ state: "not_parked", ran: false }),
      healthCheck: async (_counters, context) => {
        healthN++;
        steadyCatchup = context.catchup;
        return { evaluated: true, alert: null, reasons: [], delivery: "none", episodeKey: null };
      },
    });
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(1); // steady poll ran normally
    expect(calls).toHaveLength(1);
    expect(adapter.runStats.mode).toBe(1);
    expect(healthN).toBe(1);
    expect(steadyCatchup).toBeNull(); // steady context carries no catch-up
  });
});
