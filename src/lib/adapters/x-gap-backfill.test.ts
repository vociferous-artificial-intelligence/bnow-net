import { describe, expect, it } from "vitest";

// Recovery engine (OPEN-TASKS #38): exact-window cursor exhaustion, insert-
// before-checkpoint, budget stops, deterministic resume, and live-watermark
// isolation. Every seam is injected; nothing here touches a DB or the network.

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

import { SpendGuard, type UsageStore } from "../usage/spend-guard";
import { acquireXLease, memoryXLeaseDriver, type XLeaseDriver } from "../usage/x-lease";
import type { RawDoc } from "./types";
import type { XAccount } from "./x-api";
import type { GapArgs, GapCheckpoint, GapDeps } from "./x-gap-backfill";

// x-gap-backfill.ts transitively imports src/db (DATABASE_URL at module load);
// the engine under test never touches it — every seam is injected.
const { checkpointMismatch, freshCheckpoint, gapCheckpointProvider, rosterHash, runGapBackfill } =
  await import("./x-gap-backfill");

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

function memoryState(initial: Record<string, Record<string, unknown>> = {}) {
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

const ARGS: GapArgs = {
  fromUnix: 100,
  toUnix: 200,
  budgetUsd: 10,
  batchSize: 20,
  spacingMs: 0,
  checkpointKey: "test",
};
const CP_KEY = gapCheckpointProvider("test");

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
  const deps: GapDeps = {
    guard,
    request: fn,
    insertDocs,
    loadState: state.load,
    saveState: state.save,
    leaseDriver,
    sleep: async () => {},
    log: (l) => logs.push(l),
  };
  return { deps, calls, state, logs };
}

describe("runGapBackfill", () => {
  it("follows every cursor to exhaustion with exact since/until bounds", async () => {
    const { deps, calls, state } = makeDeps([
      { tweets: [tw("1"), tw("2")], has_next_page: true, next_cursor: "c1" },
      { tweets: [tw("3")], has_next_page: true, next_cursor: "c2" },
      { tweets: [], has_next_page: false },
    ]);
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("complete");
    expect(calls).toHaveLength(3); // NO page ceiling in recovery mode
    expect(calls[0].query).toBe("(from:centcom) since_time:100 until_time:200");
    expect(calls[0].queryType).toBe("Latest");
    expect(calls[0].cursor).toBe("");
    expect(calls[1].cursor).toBe("c1");
    expect(calls[2].cursor).toBe("c2");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.complete).toBe(true);
    expect(cp.counts).toMatchObject({ pages: 3, requests: 3, returned: 3, attributed: 3, inserted: 3 });
  });

  it("processes multiple batches (≤ batchSize accounts per query)", async () => {
    const { deps, calls, state } = makeDeps([
      { tweets: [tw("1")], has_next_page: false },
      { tweets: [tw("2", "sentdefender")], has_next_page: false },
    ]);
    const out = await runGapBackfill({ ...ARGS, batchSize: 1 }, [A, B], deps);
    expect(out.status).toBe("complete");
    expect(calls[0].query).toContain("from:centcom");
    expect(calls[1].query).toContain("from:sentdefender");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.completedBatches).toBe(2);
    expect(cp.batches).toBe(2);
  });

  it("a request failure stops with the checkpoint at the last safe position, then resumes from the cursor", async () => {
    const state = memoryState();
    const run1 = makeDeps(
      [{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }, new Error("ETIMEDOUT")],
      { state },
    );
    const out1 = await runGapBackfill(ARGS, [A], run1.deps);
    expect(out1.status).toBe("stopped");
    const cp1 = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp1.cursor).toBe("c1"); // page 1 inserted and checkpointed; failure preserved it
    expect(cp1.complete).toBe(false);

    const run2 = makeDeps([{ tweets: [tw("2")], has_next_page: false }], { state });
    const out2 = await runGapBackfill(ARGS, [A], run2.deps);
    expect(out2.status).toBe("complete");
    expect(run2.calls[0].cursor).toBe("c1"); // resumed exactly where it stopped
    const cp2 = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp2.counts.inserted).toBe(2); // cumulative across resumes
  });

  it("inserts before checkpointing: an insert failure never advances past the page", async () => {
    const state = memoryState();
    const { deps } = makeDeps(
      [{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }],
      {
        state,
        insertDocs: async () => {
          throw new Error("db down");
        },
      },
    );
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("stopped");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.cursor).toBe(""); // NOT advanced to c1
    expect(cp.counts.pages).toBe(0);
    expect(cp.counts.inserted).toBe(0);
    // the spend for the fetched page is still recorded (the provider billed it)
    expect(cp.counts.requests).toBe(1);
    expect(cp.spendUsd).toBeGreaterThan(0);
  });

  it("stops on the command-scoped budget and resumes under a larger one", async () => {
    const state = memoryState();
    const script = [
      { tweets: [tw("1")], has_next_page: true, next_cursor: "c1" },
      { tweets: [tw("2")], has_next_page: false },
    ];
    const run1 = makeDeps(script, { state });
    const out1 = await runGapBackfill({ ...ARGS, budgetUsd: 0.0001 }, [A], run1.deps);
    expect(out1.status).toBe("stopped");
    expect(out1.status === "stopped" && out1.reason).toContain("recovery budget exhausted");
    expect(run1.calls).toHaveLength(1);

    const run2 = makeDeps(script.slice(1), { state });
    const out2 = await runGapBackfill({ ...ARGS, budgetUsd: 10 }, [A], run2.deps);
    expect(out2.status).toBe("complete");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.spendUsd).toBeCloseTo(0.0003, 6); // cumulative across both runs
  });

  it("stops on a spend-guard refusal before any paid call", async () => {
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], {
      guard: testGuard(0), // run request cap 0
    });
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("stopped");
    expect(out.status === "stopped" && out.reason).toContain("spend guard");
    expect(calls).toHaveLength(0);
  });

  it("a malformed 200 payload stops the run (never reads as an exhausted batch)", async () => {
    const state = memoryState();
    const { deps } = makeDeps([{ status: "error", message: "throttled" }], { state });
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("stopped");
    expect(out.status === "stopped" && out.reason).toContain("malformed payload");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.complete).toBe(false);
    expect(cp.spendUsd).toBeGreaterThan(0); // request minimum recorded
  });

  it("counts Postgres duplicates and unattributed authors without inserting them", async () => {
    const { deps, state } = makeDeps(
      [{ tweets: [tw("1"), tw("2"), tw("3", "not_in_roster")], has_next_page: false }],
      { insertDocs: async (docs) => docs.length - 1 }, // one content-hash dupe
    );
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("complete");
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.counts).toMatchObject({
      returned: 3,
      attributed: 2,
      unattributed: 1,
      inserted: 1,
      duplicates: 1,
    });
  });

  it("refuses to resume when the roster changed", async () => {
    const state = memoryState({ [CP_KEY]: freshCheckpoint(ARGS, [A]) });
    const { deps, calls } = makeDeps([{ tweets: [], has_next_page: false }], { state });
    const out = await runGapBackfill(ARGS, [A, B], deps);
    expect(out.status).toBe("refused");
    expect(out.status === "refused" && out.reason).toContain("roster changed");
    expect(calls).toHaveLength(0);
  });

  it("refuses to resume when the range or batch size changed", async () => {
    const cp = freshCheckpoint(ARGS, [A]);
    expect(checkpointMismatch(cp, { ...ARGS, toUnix: 999 }, rosterHash([A]))).toContain("range mismatch");
    expect(checkpointMismatch(cp, { ...ARGS, batchSize: 10 }, rosterHash([A]))).toContain("batch size changed");
    expect(checkpointMismatch(cp, ARGS, rosterHash([A]))).toBeNull();
  });

  it("a completed checkpoint reruns as an idempotent no-op with zero paid calls", async () => {
    const done = { ...freshCheckpoint(ARGS, [A]), complete: true };
    const state = memoryState({ [CP_KEY]: done });
    const { deps, calls } = makeDeps([{ tweets: [tw("9")], has_next_page: false }], { state });
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("complete");
    expect(calls).toHaveLength(0);
    expect(state.savedProviders).toHaveLength(0); // no writes either
  });

  it("refuses to run while another job holds the X lease", async () => {
    const leaseDriver = memoryXLeaseDriver();
    await acquireXLease("scheduled-poll", 60_000, leaseDriver);
    const { deps, calls, state } = makeDeps([{ tweets: [], has_next_page: false }], { leaseDriver });
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("refused");
    expect(out.status === "refused" && out.reason).toContain("lease");
    expect(calls).toHaveLength(0);
    expect(state.savedProviders).toHaveLength(0);
  });

  it("stops before the next paid call when the lease is lost mid-run", async () => {
    // acquire succeeds once; every renewal is refused (simulated takeover)
    let writes = 0;
    const leaseDriver: XLeaseDriver = {
      tryWrite: async () => writes++ === 0,
      clear: async () => true,
      read: async () => null,
    };
    const state = memoryState();
    const { deps, calls } = makeDeps(
      [{ tweets: [tw("1")], has_next_page: true, next_cursor: "c1" }],
      { state, leaseDriver },
    );
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("stopped");
    expect(out.status === "stopped" && out.reason).toContain("lease lost");
    expect(calls).toHaveLength(0); // refused BEFORE the first paid call
    const cp = state.map.get(CP_KEY) as GapCheckpoint;
    expect(cp.complete).toBe(false);
  });

  it("releases the lease when it finishes, and on failure", async () => {
    const leaseDriver = memoryXLeaseDriver();
    const ok = makeDeps([{ tweets: [], has_next_page: false }], { leaseDriver });
    await runGapBackfill(ARGS, [A], ok.deps);
    expect(await leaseDriver.read()).toBeNull();

    const failing = makeDeps([new Error("boom")], { leaseDriver });
    await runGapBackfill(ARGS, [A], failing.deps);
    expect(await leaseDriver.read()).toBeNull();
  });

  it("never touches the live x_api watermark row", async () => {
    const state = memoryState({ x_api: { lastPollAt: 1_752_400_000 } });
    const { deps } = makeDeps(
      [
        { tweets: [tw("1")], has_next_page: true, next_cursor: "c1" },
        { tweets: [], has_next_page: false },
      ],
      { state },
    );
    const out = await runGapBackfill(ARGS, [A], deps);
    expect(out.status).toBe("complete");
    expect(out.status === "complete" && out.watermarkMovedBack).toBe(false);
    expect(state.map.get("x_api")).toEqual({ lastPollAt: 1_752_400_000 });
    expect(state.savedProviders).not.toContain("x_api"); // only the checkpoint key was written
    expect(state.savedProviders.every((p) => p === CP_KEY)).toBe(true);
  });
});
