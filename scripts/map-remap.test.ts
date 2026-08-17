import { describe, expect, it } from "vitest";
import type { MapCallResult } from "./map-backfill";
import {
  MAX_SWEEPS,
  driveMapRemap,
  memoryCheckpointStore,
  type RemapDriveOpts,
} from "./map-remap";

// The remap driver's contract (OPEN-TASKS #33), simulated through the
// injectable call/sleep/store seams — zero network, zero DB:
//   - read-only default (--execute absent): dry estimate calls only;
//   - estimate over budget aborts BEFORE any live call;
//   - a day completes ONLY via a full zero-pair sweep (cap exhaustion or
//     batch errors can never mark unfinished work complete);
//   - the cursor advances only on clean calls; budget-stopped calls resume
//     at the same cursor so the anti-join re-selects unfinished docs;
//   - typed stop categories: run_cap benign, daily_cap wait/abort,
//     total_cap/cap_unset abort, lease-busy waits without advancing;
//   - checkpoint resume skips completed days and continues mid-sweep.

const dry = (counts: Record<string, number | string | undefined> = {}): MapCallResult => ({
  ok: true,
  category: null,
  counts: {
    selected: 0,
    docTrackPairs: 0,
    batches: 0,
    estUsd: 0,
    estModel: "gpt-4o-mini",
    estEffort: "",
    maxSelectedId: 0, // remap-capable routes always echo the cursor
    ...counts,
  },
});

const live = (counts: Record<string, number | string | undefined> = {}): MapCallResult => ({
  ok: true,
  category: null,
  counts: { selected: 0, docTrackPairs: 0, claims: 0, estUsd: 0, batchErrors: 0, ...counts },
});

const stopped = (
  category: string,
  counts: Record<string, number | string | undefined> = {},
): MapCallResult => ({
  ok: category === "run_cap",
  category,
  counts: {
    selected: 10,
    docTrackPairs: 10,
    claims: 0,
    estUsd: 0.01,
    budgetStop: `stop:${category}`,
    budgetStopCategory: category,
    maxSelectedId: 999,
    ...counts,
  },
});

function drive(script: Array<MapCallResult | Error>, over: Partial<RemapDriveOpts> = {}) {
  const calls: string[] = [];
  const slept: number[] = [];
  const store = over.store ?? memoryCheckpointStore();
  let i = 0;
  const call = async (_b: string, _s: string, params: string): Promise<MapCallResult> => {
    calls.push(params);
    const step = script[Math.min(i++, script.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  return driveMapRemap({
    base: "https://example.test",
    secret: "s",
    theater: "ir",
    from: "2026-07-30",
    to: "2026-07-30",
    budgetUsd: 5,
    execute: true,
    log: () => {},
    call,
    sleep: async (ms) => {
      slept.push(ms);
    },
    store,
    ...over,
  }).then((result) => ({ result, calls, slept, store }));
}

describe("read-only default and estimate gate", () => {
  it("without --execute only dry remap calls are made", async () => {
    const { result, calls } = await drive([dry({ selected: 40, docTrackPairs: 55, estUsd: 0.02 })], {
      execute: false,
    });
    expect(result.aborted).toBeUndefined();
    expect(result.eligibleDocs).toBe(40);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("dry=1");
    expect(calls[0]).toContain("remap=1");
    expect(calls[0]).toContain("theater=ir");
  });

  it("estimate over budget aborts before any live call", async () => {
    const { result, calls } = await drive([dry({ estUsd: 9.5, selected: 5000 })], { budgetUsd: 5 });
    expect(result.aborted).toContain("exceeds budget");
    expect(calls.every((p) => p.includes("dry=1"))).toBe(true);
  });

  it("the track selector rides every call", async () => {
    const { calls } = await drive([dry()], { execute: false, track: "military" });
    expect(calls[0]).toContain("&track=military");
  });
});

describe("sweep-based completion proof", () => {
  it("a day completes only via a full zero-pair sweep (work sweep, then verify sweep)", async () => {
    const { result, calls } = await drive([
      dry({ selected: 30, docTrackPairs: 30, estUsd: 0.01 }),
      // sweep 1: one call maps everything it selected, then the sweep ends
      live({ selected: 30, docTrackPairs: 30, claims: 12, maxSelectedId: 130, estUsd: 0.01 }),
      live({ selected: 0 }),
      // sweep 2 (verification): nothing needs work anywhere -> complete
      live({ selected: 30, docTrackPairs: 0, maxSelectedId: 130 }),
      live({ selected: 0 }),
    ]);
    expect(result.aborted).toBeUndefined();
    expect(result.incompleteDays).toEqual([]);
    expect(result.claims).toBe(12);
    // live calls: after=0, after=130, after=0 (verify), after=130
    const lives = calls.filter((p) => !p.includes("dry=1"));
    expect(lives.map((p) => /after=(\d+)/.exec(p)![1])).toEqual(["0", "130", "0", "130"]);
  });

  it("cap exhaustion (total_cap) aborts without marking the day complete and without advancing the cursor", async () => {
    const store = memoryCheckpointStore();
    const { result } = await drive(
      [dry({ selected: 20, docTrackPairs: 20, estUsd: 0.01 }), stopped("total_cap")],
      { store },
    );
    expect(result.aborted).toContain("total_cap");
    const cp = [...store.state.values()][0];
    expect(cp.days["2026-07-30"].complete).toBe(false);
    expect(cp.days["2026-07-30"].afterId).toBe(0); // budget-stopped call never advances the scan
  });

  it("run_cap is benign but still does not advance the cursor past unfinished docs", async () => {
    const { result, calls } = await drive([
      dry({ selected: 20, docTrackPairs: 20, estUsd: 0.01 }),
      stopped("run_cap", { maxSelectedId: 500, claims: 5 }),
      live({ selected: 20, docTrackPairs: 8, claims: 8, maxSelectedId: 500, estUsd: 0.01 }),
      live({ selected: 0 }),
      live({ selected: 20, docTrackPairs: 0, maxSelectedId: 500 }),
      live({ selected: 0 }),
    ]);
    expect(result.aborted).toBeUndefined();
    const lives = calls.filter((p) => !p.includes("dry=1"));
    // the run_cap call resumed at after=0, not after=500
    expect(/after=(\d+)/.exec(lives[1])![1]).toBe("0");
    expect(result.claims).toBe(13);
  });

  it("persistent batch errors stall out loudly instead of spinning", async () => {
    const erroring = live({
      selected: 10,
      docTrackPairs: 10,
      batchErrors: 2,
      maxSelectedId: 60,
      estUsd: 0.001,
    });
    const { result } = await drive([
      dry({ selected: 10, docTrackPairs: 10, estUsd: 0.001 }),
      erroring,
      erroring,
      erroring,
      erroring,
    ]);
    expect(result.incompleteDays).toEqual(["2026-07-30"]);
  });

  it("MAX_SWEEPS bounds a day that keeps finding pairs", async () => {
    // every sweep maps something new forever (pathological); the driver stops
    // after MAX_SWEEPS and leaves the day incomplete
    const script: MapCallResult[] = [dry({ selected: 5, docTrackPairs: 5, estUsd: 0.001 })];
    for (let s = 0; s < MAX_SWEEPS + 2; s++) {
      script.push(live({ selected: 5, docTrackPairs: 5, claims: 1, maxSelectedId: 50, estUsd: 0.001 }));
      script.push(live({ selected: 0 }));
    }
    const { result } = await drive(script);
    expect(result.incompleteDays).toEqual(["2026-07-30"]);
  });
});

describe("remediation guards (review 1)", () => {
  it("a non-finite --budget fails CLOSED under --execute instead of disabling both gates", async () => {
    await expect(drive([dry()], { budgetUsd: NaN })).rejects.toThrow(/finite positive/);
    await expect(drive([dry()], { budgetUsd: 0 })).rejects.toThrow(/finite positive/);
    // estimate-only mode is unaffected (no spend possible)
    const { result } = await drive([dry()], { budgetUsd: NaN, execute: false });
    expect(result.aborted).toBeUndefined();
  });

  it("aborts in phase 1 when the route does not speak remap mode (old deployed route)", async () => {
    const backfillShaped: MapCallResult = {
      ok: true,
      category: null,
      counts: { selected: 500, estUsd: 0.2 }, // no maxSelectedId/remapVersions
    };
    await expect(drive([backfillShaped])).rejects.toThrow(/does not support remap mode/);
  });

  it("a version bump invalidates the checkpoint's complete flags", async () => {
    const store = memoryCheckpointStore();
    // invocation 1 under version v1: the day completes
    const v1 = { "military:ir": "gpt-4o-mini/v1" };
    await drive(
      [
        dry({ selected: 2, docTrackPairs: 2, estUsd: 0.001, remapVersions: v1 as never }),
        live({ selected: 2, docTrackPairs: 2, claims: 2, maxSelectedId: 9, estUsd: 0.001 }),
        live({ selected: 0 }),
        live({ selected: 2, docTrackPairs: 0, maxSelectedId: 9 }),
        live({ selected: 0 }),
      ],
      { store },
    );
    // invocation 2 under version v2: the day must be RE-DRAINED, not skipped
    const v2 = { "military:ir": "gpt-4o-mini/v2" };
    const second = await drive(
      [
        dry({ selected: 2, docTrackPairs: 2, estUsd: 0.001, remapVersions: v2 as never }),
        live({ selected: 2, docTrackPairs: 2, claims: 2, maxSelectedId: 9, estUsd: 0.001 }),
        live({ selected: 0 }),
        live({ selected: 2, docTrackPairs: 0, maxSelectedId: 9 }),
        live({ selected: 0 }),
      ],
      { store },
    );
    expect(second.result.claims).toBe(2); // live calls actually ran again
    expect(second.calls.filter((p) => !p.includes("dry=1"))).toHaveLength(4);
  });

  it("MAX_SWEEPS bounds one invocation; the next invocation gets a fresh allowance", async () => {
    const store = memoryCheckpointStore();
    const churn: Array<MapCallResult> = [dry({ selected: 5, docTrackPairs: 5, estUsd: 0.001 })];
    for (let s = 0; s < MAX_SWEEPS + 1; s++) {
      churn.push(live({ selected: 5, docTrackPairs: 5, claims: 1, maxSelectedId: 50, estUsd: 0.001 }));
      churn.push(live({ selected: 0 }));
    }
    const first = await drive(churn, { store });
    expect(first.result.incompleteDays).toEqual(["2026-07-30"]);
    // second invocation: the day is retried (sweeps reset) and now completes
    const second = await drive(
      [
        dry({ selected: 5, docTrackPairs: 0, estUsd: 0 }),
        live({ selected: 5, docTrackPairs: 0, maxSelectedId: 50 }),
        live({ selected: 0 }),
      ],
      { store },
    );
    expect(second.result.incompleteDays).toEqual([]);
    expect(second.calls.filter((p) => !p.includes("dry=1")).length).toBeGreaterThan(0);
  });

  it("a checkpoint already over budget aborts BEFORE any live call", async () => {
    const store = memoryCheckpointStore();
    const first = await drive([
      dry({ estUsd: 0.5, selected: 100, docTrackPairs: 100 }),
      live({ selected: 100, docTrackPairs: 100, claims: 3, maxSelectedId: 300, estUsd: 6 }),
    ], { store });
    expect(first.result.aborted).toContain("exceeded budget");
    const second = await drive([dry({ estUsd: 0.1, selected: 10, docTrackPairs: 10 })], { store });
    expect(second.result.aborted).toContain("already exceeds budget");
    expect(second.calls.filter((p) => !p.includes("dry=1"))).toHaveLength(0);
  });

  it("benign run_cap stops never count as stalls — the day still drains", async () => {
    const { result } = await drive([
      dry({ selected: 30, docTrackPairs: 30, estUsd: 0.01 }),
      stopped("run_cap", { maxSelectedId: 100, claims: 3 }),
      stopped("run_cap", { maxSelectedId: 100, claims: 3 }),
      stopped("run_cap", { maxSelectedId: 100, claims: 3 }),
      stopped("run_cap", { maxSelectedId: 100, claims: 3 }),
      live({ selected: 30, docTrackPairs: 0, maxSelectedId: 100 }),
      live({ selected: 0 }),
      live({ selected: 30, docTrackPairs: 0, maxSelectedId: 100 }),
      live({ selected: 0 }),
    ]);
    expect(result.aborted).toBeUndefined();
    expect(result.incompleteDays).toEqual([]);
    expect(result.claims).toBe(12);
  });
});

describe("stops, waits, and resume", () => {
  it("daily_cap without --wait-daily aborts resumable; with it, sleeps to the next UTC day", async () => {
    const noWait = await drive([dry({ estUsd: 0.01, selected: 5, docTrackPairs: 5 }), stopped("daily_cap")]);
    expect(noWait.result.aborted).toContain("daily_cap");

    const withWait = await drive(
      [
        dry({ estUsd: 0.01, selected: 5, docTrackPairs: 5 }),
        stopped("daily_cap"),
        live({ selected: 5, docTrackPairs: 5, claims: 5, maxSelectedId: 40, estUsd: 0.001 }),
        live({ selected: 0 }),
        live({ selected: 5, docTrackPairs: 0, maxSelectedId: 40 }),
        live({ selected: 0 }),
      ],
      { waitDaily: true },
    );
    expect(withWait.result.aborted).toBeUndefined();
    expect(withWait.slept.some((ms) => ms > 3_600_000)).toBe(true); // waited out the UTC day
  });

  it("a lease-busy skip waits 60s and retries the SAME cursor", async () => {
    const { result, slept, calls } = await drive([
      dry({ estUsd: 0.001, selected: 2, docTrackPairs: 2 }),
      live({ selected: 0, skipped: "another map cycle holds the lease" }),
      live({ selected: 2, docTrackPairs: 2, claims: 2, maxSelectedId: 20, estUsd: 0.001 }),
      live({ selected: 0 }),
      live({ selected: 2, docTrackPairs: 0, maxSelectedId: 20 }),
      live({ selected: 0 }),
    ]);
    expect(result.aborted).toBeUndefined();
    expect(slept).toContain(60_000);
    const lives = calls.filter((p) => !p.includes("dry=1"));
    expect(/after=(\d+)/.exec(lives[1])![1]).toBe("0"); // not advanced by the skip
  });

  it("actual spend beyond the budget aborts resumable", async () => {
    const { result } = await drive([
      dry({ estUsd: 0.5, selected: 100, docTrackPairs: 100 }),
      live({ selected: 100, docTrackPairs: 100, claims: 3, maxSelectedId: 300, estUsd: 6 }),
    ]);
    expect(result.aborted).toContain("exceeded budget");
    expect(result.aborted).toContain("resumable");
  });

  it("--limit bounds attempted pairs and aborts resumable", async () => {
    const { result } = await drive(
      [
        dry({ estUsd: 0.01, selected: 50, docTrackPairs: 50 }),
        live({ selected: 50, docTrackPairs: 50, claims: 10, maxSelectedId: 100, estUsd: 0.01 }),
      ],
      { limit: 40 },
    );
    expect(result.aborted).toContain("--limit");
  });

  it("resume skips completed days and continues an unfinished one mid-sweep", async () => {
    const store = memoryCheckpointStore();
    // first invocation: day 1 completes, day 2 aborts on total_cap
    const first = await drive(
      [
        dry({ estUsd: 0.01, selected: 5, docTrackPairs: 5 }),
        dry({ estUsd: 0.01, selected: 5, docTrackPairs: 5 }),
        live({ selected: 5, docTrackPairs: 5, claims: 5, maxSelectedId: 15, estUsd: 0.001 }),
        live({ selected: 0 }),
        live({ selected: 5, docTrackPairs: 0, maxSelectedId: 15 }),
        live({ selected: 0 }),
        stopped("total_cap"),
      ],
      { store, from: "2026-07-30", to: "2026-07-31" },
    );
    expect(first.result.aborted).toContain("total_cap");

    // second invocation resumes: day 1 gets NO live calls, day 2 drains
    const second = await drive(
      [
        dry({ estUsd: 0.001, selected: 0, docTrackPairs: 0 }),
        dry({ estUsd: 0.001, selected: 5, docTrackPairs: 5 }),
        live({ selected: 5, docTrackPairs: 5, claims: 5, maxSelectedId: 25, estUsd: 0.001 }),
        live({ selected: 0 }),
        live({ selected: 5, docTrackPairs: 0, maxSelectedId: 25 }),
        live({ selected: 0 }),
      ],
      { store, from: "2026-07-30", to: "2026-07-31" },
    );
    expect(second.result.aborted).toBeUndefined();
    const lives = second.calls.filter((p) => !p.includes("dry=1"));
    expect(lives.every((p) => p.includes("date=2026-07-31"))).toBe(true);
  });

  it("transport failures retry bounded, then abort with the checkpoint saved", async () => {
    const store = memoryCheckpointStore();
    const { MapTransportError } = await import("./map-backfill");
    const { result, slept } = await drive(
      [
        dry({ estUsd: 0.001, selected: 1, docTrackPairs: 1 }),
        new MapTransportError("fetch failed"),
        new MapTransportError("fetch failed"),
        new MapTransportError("fetch failed"),
      ],
      { store },
    );
    expect(result.aborted).toContain("transport");
    expect(slept.filter((ms) => ms === 30_000)).toHaveLength(2);
  });
});
