import { describe, expect, it } from "vitest";

// Self-healing X catch-up (OPEN-TASKS #38 + #66): park detection, fixed-window +
// immutable roster snapshot, cursor-complete drain reusing the gap engine, resume,
// registry-drift resilience, compare-and-set watermark advance, and crash finalize.
// Every seam is injected; nothing here touches a DB or the network.

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

import { SpendGuard, type UsageStore } from "../usage/spend-guard";
import { acquireXLease, memoryXLeaseDriver, type XLeaseDriver } from "../usage/x-lease";
import type { RawDoc } from "./types";
import type { XAccount } from "./x-api";
import type { GapArgs, GapCheckpoint } from "./x-gap-backfill";
import type { AutoCatchupDeps, AutoCatchupOpts } from "./x-auto-catchup";

// x-auto-catchup transitively imports @/db (via x-gap-backfill -> x-api) at module
// load; import the values dynamically AFTER DATABASE_URL is stubbed above. The
// orchestrator under test never touches the DB — every seam is injected.
const { runXAutoCatchup, memoryXWatermarkDriver, autoCatchupCheckpointKey } = await import(
  "./x-auto-catchup"
);
const { freshCheckpoint, gapCheckpointProvider } = await import("./x-gap-backfill");

const A: XAccount = { userName: "centcom", sourceKey: "x.com/centcom", countryIso2: "ru", citations: 10 };
const B: XAccount = { userName: "sentdefender", sourceKey: "x.com/sentdefender", countryIso2: "ru", citations: 5 };

const memoryUsage: UsageStore = {
  load: async () => ({ totalUsd: 0, totalRequests: 0, dayUsd: 0, dayRequests: 0 }),
  record: async () => {},
};

function testGuard(runRequestCap = 1000): SpendGuard {
  return new SpendGuard(
    { provider: "x_api", totalCapUsd: 100, dailyUsdCap: 50, dailyRequestCap: 10_000, runRequestCap },
    memoryUsage,
  );
}

const tw = (id: string, user = "centcom") => ({
  id,
  text: `tweet ${id}`,
  author: { userName: user },
  createdAt: "Thu Jul 09 12:00:00 +0000 2026",
});

function scriptedRequest(script: unknown[]) {
  const calls: Array<Record<string, string>> = [];
  const fn = async (_path: string, params: Record<string, string>) => {
    calls.push({ ...params });
    const item = script[Math.min(calls.length - 1, script.length - 1)];
    if (item instanceof Error) throw item;
    return item;
  };
  return { fn, calls };
}

function memoryState(initial: Record<string, Record<string, unknown>> = { x_api: { lastPollAt: 1000 } }) {
  const map = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const savedProviders: string[] = [];
  return {
    map,
    savedProviders,
    load: async <T extends Record<string, unknown>>(p: string): Promise<T | null> =>
      (map.get(p) as T | undefined) ?? null,
    save: async (p: string, s: Record<string, unknown>) => {
      savedProviders.push(p);
      map.set(p, JSON.parse(JSON.stringify(s)));
    },
  };
}

// Parked window: watermark 1000, now 1200s => age 200 > threshold 100.
const OPTS: AutoCatchupOpts = { parkThresholdSec: 100, batchSize: 20, spacingMs: 0, nowMs: 1_200_000 };
const CP_KEY = gapCheckpointProvider(autoCatchupCheckpointKey(1000));

function makeDeps(
  script: unknown[],
  {
    state = memoryState(),
    guard = testGuard(),
    leaseDriver = memoryXLeaseDriver() as XLeaseDriver,
    insertDocs = async (docs: RawDoc[]) => docs.length,
  } = {},
) {
  const { fn, calls } = scriptedRequest(script);
  const logs: string[] = [];
  const deps: AutoCatchupDeps = {
    guard,
    request: fn,
    insertDocs,
    loadState: state.load,
    saveState: state.save,
    leaseDriver,
    watermark: memoryXWatermarkDriver(state.map),
    sleep: async () => {},
    log: (l) => logs.push(l),
  };
  return { deps, calls, state, logs };
}

describe("runXAutoCatchup — park detection", () => {
  it("a fresh watermark is not parked — steady poll runs (ran=false, zero paid calls)", async () => {
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], {
      state: memoryState({ x_api: { lastPollAt: 1190 } }), // age 10 < threshold 100
    });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.ran).toBe(false);
    expect(out.state).toBe("not_parked");
    expect(calls).toHaveLength(0);
  });

  it("no watermark yet is not parked (first-ever run)", async () => {
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], {
      state: memoryState({}),
    });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("not_parked");
    expect(out.ran).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("parked with an empty roster does not run and never advances", async () => {
    const { deps, calls, state } = makeDeps([{ tweets: [], has_next_page: false }]);
    const out = await runXAutoCatchup([], deps, OPTS);
    expect(out.state).toBe("no_roster");
    expect(out.ran).toBe(false);
    expect(calls).toHaveLength(0);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 });
  });
});

describe("runXAutoCatchup — fixed window + roster snapshot", () => {
  it("a parked watermark starts a fresh episode with a fixed window and an immutable roster snapshot", async () => {
    const { deps, calls, state } = makeDeps([{ tweets: [tw("1")], has_next_page: false }]);
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.ran).toBe(true);
    expect(out.state).toBe("complete");
    expect(out.fromUnix).toBe(1000);
    expect(out.toUnix).toBe(1200);
    // exact since/until bounds, cursor from batch start
    expect(calls[0].query).toBe("(from:centcom) since_time:1000 until_time:1200");
    expect(calls[0].cursor).toBe("");
    // the checkpoint carries the immutable roster snapshot + the fixed window
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.fromUnix).toBe(1000);
    expect(cp.toUnix).toBe(1200);
    expect(cp.roster).toEqual([A]);
    expect(cp.complete).toBe(true);
    // watermark advanced to the fixed boundary only after completion
    expect(out.watermarkAdvanced).toBe(true);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1200 });
  });

  it("drains multiple pages and batches to exhaustion, advancing the watermark only after completion", async () => {
    const { deps, calls, state } = makeDeps([
      { tweets: [tw("1")], has_next_page: true, next_cursor: "c1" },
      { tweets: [tw("2")], has_next_page: false }, // batch 1 (centcom) exhausted
      { tweets: [tw("3", "sentdefender")], has_next_page: false }, // batch 2 (sentdefender)
    ]);
    const out = await runXAutoCatchup([A, B], deps, { ...OPTS, batchSize: 1 });
    expect(out.state).toBe("complete");
    expect(calls).toHaveLength(3); // NO page ceiling in recovery mode
    expect(calls[1].cursor).toBe("c1");
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1200 }); // advanced after global completion
  });
});

describe("runXAutoCatchup — stop / resume / drift", () => {
  it("a per-run request-cap stop preserves the cursor and does NOT advance the watermark", async () => {
    const state = memoryState();
    const { deps } = makeDeps([{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }], {
      state,
      guard: testGuard(1), // one request then the run cap refuses
    });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("started"); // fresh episode, stopped by the guard
    expect(out.ran).toBe(true);
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.cursor).toBe("c1");
    expect(cp.complete).toBe(false);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 }); // NOT advanced
  });

  it("the next invocation resumes exactly at the saved cursor and advances on completion", async () => {
    const state = memoryState();
    const run1 = makeDeps([{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }], {
      state,
      guard: testGuard(1),
    });
    await runXAutoCatchup([A], run1.deps, OPTS);

    const run2 = makeDeps([{ tweets: [tw("2")], has_next_page: false }], { state, guard: testGuard(10) });
    const out2 = await runXAutoCatchup([A], run2.deps, OPTS);
    expect(out2.state).toBe("complete");
    expect(run2.calls[0].cursor).toBe("c1"); // resumed exactly where it stopped
    expect(run2.calls[0].query).toBe("(from:centcom) since_time:1000 until_time:1200"); // same fixed window
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1200 });
  });

  it("registry roster drift does not strand an active checkpoint — resume uses the snapshot", async () => {
    const state = memoryState();
    const run1 = makeDeps([{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }], {
      state,
      guard: testGuard(1),
    });
    await runXAutoCatchup([A], run1.deps, OPTS); // snapshots [A]

    // the live registry roster has DRIFTED to [A, B]; the resume must ignore it
    const run2 = makeDeps([{ tweets: [tw("2")], has_next_page: false }], { state, guard: testGuard(10) });
    const out2 = await runXAutoCatchup([A, B], run2.deps, OPTS);
    expect(out2.state).toBe("complete"); // NOT refused despite the drift
    expect(run2.calls[0].query).toBe("(from:centcom) since_time:1000 until_time:1200"); // snapshot roster only
    expect(run2.calls[0].cursor).toBe("c1");
  });

  it("a request failure stops and never advances the watermark", async () => {
    const state = memoryState();
    const { deps } = makeDeps([new Error("ETIMEDOUT")], { state });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("started");
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 });
  });

  it("an insert failure never advances past the page or the watermark", async () => {
    const state = memoryState();
    const { deps } = makeDeps([{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }], {
      state,
      insertDocs: async () => {
        throw new Error("db down");
      },
    });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("started");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.cursor).toBe(""); // never advanced to c1
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 });
  });
});

describe("runXAutoCatchup — lease, guard, and finalize", () => {
  it("refuses when another job holds the X lease — zero paid calls, watermark untouched, leaseHeld", async () => {
    const leaseDriver = memoryXLeaseDriver();
    await acquireXLease("scheduled-poll", 60_000, leaseDriver);
    const state = memoryState();
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], { state, leaseDriver });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("refused");
    expect(out.leaseHeld).toBe(true);
    expect(out.ran).toBe(true);
    expect(calls).toHaveLength(0);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 });
  });

  it("a spend-guard refusal makes zero paid calls and does not advance the watermark", async () => {
    const state = memoryState();
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], { state, guard: testGuard(0) });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("started");
    expect(calls).toHaveLength(0);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 });
  });

  it("a completed checkpoint found after a crash finalizes the CAS advance with zero paid calls", async () => {
    const args: GapArgs = {
      fromUnix: 1000,
      toUnix: 1200,
      budgetUsd: 1,
      batchSize: 20,
      spacingMs: 0,
      checkpointKey: autoCatchupCheckpointKey(1000),
    };
    const done = { ...freshCheckpoint(args, [A], { storeRoster: true }), complete: true };
    const state = memoryState({ x_api: { lastPollAt: 1000 }, [CP_KEY]: done });
    const { deps, calls } = makeDeps([{ tweets: [tw("x")], has_next_page: false }], { state });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("already_complete");
    expect(calls).toHaveLength(0); // zero paid calls
    expect(out.watermarkAdvanced).toBe(true);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1200 });
  });

  it("a checkpoint with no roster snapshot is refused (stranded) — no paid calls, watermark untouched", async () => {
    const args: GapArgs = {
      fromUnix: 1000,
      toUnix: 1200,
      budgetUsd: 1,
      batchSize: 20,
      spacingMs: 0,
      checkpointKey: autoCatchupCheckpointKey(1000),
    };
    const noSnapshot = freshCheckpoint(args, [A]); // storeRoster omitted -> no roster
    const state = memoryState({ x_api: { lastPollAt: 1000 }, [CP_KEY]: noSnapshot });
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], { state });
    const out = await runXAutoCatchup([A], deps, OPTS);
    expect(out.state).toBe("refused");
    expect(out.leaseHeld).toBeFalsy();
    expect(calls).toHaveLength(0);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1000 });
  });
});

describe("memoryXWatermarkDriver (CAS semantics mirror the pg driver)", () => {
  it("advances only from the expected value and never backward", async () => {
    const map = new Map<string, Record<string, unknown>>([["x_api", { lastPollAt: 1000 }]]);
    const wm = memoryXWatermarkDriver(map);
    // a scheduled poll advanced it in the meantime -> CAS from 1000 is a no-op
    map.set("x_api", { lastPollAt: 1050 });
    expect(await wm.advance(1000, 1200)).toBe(false);
    expect((map.get("x_api") as { lastPollAt: number }).lastPollAt).toBe(1050);
    // never backward
    expect(await wm.advance(1050, 900)).toBe(false);
    expect((map.get("x_api") as { lastPollAt: number }).lastPollAt).toBe(1050);
    // ok when the expected value matches and it moves forward
    expect(await wm.advance(1050, 1300)).toBe(true);
    expect((map.get("x_api") as { lastPollAt: number }).lastPollAt).toBe(1300);
  });
});
