import { describe, expect, it } from "vitest";
import {
  createAskRunMeta,
  monotonicMs,
  recordStage,
  timeStage,
  timeStageSync,
  type StageTimings,
} from "./timings";

describe("createAskRunMeta", () => {
  it("mints a well-formed UUID run id, a wall startedAt, and an empty collector", () => {
    const run = createAskRunMeta();
    expect(run.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.timings).toEqual({});
  });

  it("every invocation gets a distinct run id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createAskRunMeta().runId));
    expect(ids.size).toBe(50);
  });
});

describe("recordStage", () => {
  it("rounds to whole ms and floors at 0", () => {
    const t: StageTimings = {};
    recordStage(t, "embedMs", 12.6);
    recordStage(t, "vectorMs", -3);
    expect(t).toEqual({ embedMs: 13, vectorMs: 0 });
  });

  it("no-ops without a collector (stages call it unconditionally)", () => {
    expect(() => recordStage(undefined, "embedMs", 5)).not.toThrow();
  });
});

describe("timeStage", () => {
  it("records the awaited boundary's duration and passes the result through", async () => {
    const t: StageTimings = {};
    const out = await timeStage(t, "lexicalMs", async () => "rows");
    expect(out).toBe("rows");
    expect(t.lexicalMs).toBeGreaterThanOrEqual(0);
  });

  it("records the duration on REJECTION too, and rethrows unchanged", async () => {
    const t: StageTimings = {};
    const boom = new Error("db down");
    await expect(
      timeStage(t, "lexicalMs", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(t.lexicalMs).toBeGreaterThanOrEqual(0);
  });

  it("without a collector it is a pure passthrough", async () => {
    await expect(timeStage(undefined, "lexicalMs", async () => 7)).resolves.toBe(7);
  });
});

describe("timeStageSync", () => {
  it("records the sync section and passes the value through", () => {
    const t: StageTimings = {};
    expect(timeStageSync(t, "validateMs", () => 42)).toBe(42);
    expect(t.validateMs).toBeGreaterThanOrEqual(0);
  });

  it("records on throw and rethrows", () => {
    const t: StageTimings = {};
    expect(() =>
      timeStageSync(t, "mergeMs", () => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(t.mergeMs).toBeGreaterThanOrEqual(0);
  });
});

describe("monotonicMs", () => {
  it("is monotonic non-decreasing", () => {
    const a = monotonicMs();
    const b = monotonicMs();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
