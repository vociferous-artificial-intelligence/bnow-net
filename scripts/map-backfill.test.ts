import { describe, expect, it } from "vitest";
import {
  MAP_DRIVER_THEATERS,
  MapTransportError,
  driveMapBackfill,
  msToNextUtcDay,
  normalizeTheaterFlag,
  parseCountFlag,
  parseUsdFlag,
  type MapCallResult,
  type MapDriveOpts,
} from "./map-backfill";

// The driver must distinguish (2026-08-15 Workstream B):
//   run_cap    -> keep calling (benign per-invocation ceiling);
//   daily_cap  -> pause until the next UTC day (--wait-daily) or abort resumable;
//   total_cap / cap_unset -> abort for operator intervention;
//   transport  -> bounded retries, then abort.
// All simulated through the injectable `call`/`sleep` seams — zero network.

const ok = (counts: Record<string, number | string | undefined> = {}): MapCallResult => ({
  ok: true,
  category: null,
  counts: { selected: 0, estUsd: 0, ...counts },
});

const stopped = (category: string, counts: Record<string, number | string | undefined> = {}): MapCallResult => ({
  ok: category !== "run_cap",
  category,
  counts: { selected: 100, estUsd: 0.01, budgetStop: `stop:${category}`, budgetStopCategory: category, ...counts },
});

function drive(
  script: Array<MapCallResult | Error>,
  over: Partial<MapDriveOpts> = {},
): Promise<{ result: Awaited<ReturnType<typeof driveMapBackfill>>; calls: string[]; slept: number[] }> {
  const calls: string[] = [];
  const slept: number[] = [];
  let i = 0;
  const call = async (_base: string, _secret: string, params: string): Promise<MapCallResult> => {
    calls.push(params);
    const step = script[Math.min(i++, script.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  return driveMapBackfill({
    base: "https://example.test",
    secret: "s",
    from: "2026-07-30",
    to: "2026-07-30",
    budgetUsd: 5,
    apply: true,
    log: () => {},
    call,
    sleep: async (ms) => {
      slept.push(ms);
    },
    ...over,
  }).then((result) => ({ result, calls, slept }));
}

describe("estimate phase", () => {
  it("passes the theater constraint on every call and aborts over budget before any paid call", async () => {
    const { result, calls } = await drive([ok({ estUsd: 9.99, selected: 5000 })], {
      theater: "ir",
      budgetUsd: 5,
    });
    expect(result.aborted).toContain("exceeds budget");
    expect(calls).toHaveLength(1); // the dry run only — no live call
    expect(calls[0]).toContain("dry=1");
    expect(calls[0]).toContain("&theater=ir");
  });

  it("estimate-only mode never makes a live call", async () => {
    const { result, calls } = await drive([ok({ estUsd: 0.5 })], { apply: false });
    expect(result.aborted).toBeUndefined();
    expect(calls.every((p) => p.includes("dry=1"))).toBe(true);
  });
});

describe("live stop classification", () => {
  it("run_cap is benign: the driver keeps calling until the day drains", async () => {
    const { result, calls } = await drive([
      ok({ estUsd: 0.1 }), // dry
      stopped("run_cap", { selected: 400, estUsd: 0.2, processedMarked: 400 }),
      ok({ selected: 0 }), // day drained
    ]);
    expect(result.aborted).toBeUndefined();
    expect(calls.filter((p) => !p.includes("dry=1"))).toHaveLength(2);
  });

  it("daily_cap without --wait-daily aborts with resumable advice", async () => {
    const { result } = await drive([ok({ estUsd: 0.1 }), stopped("daily_cap")]);
    expect(result.aborted).toContain("daily_cap");
    expect(result.aborted).toContain("resume");
  });

  it("daily_cap with --wait-daily sleeps to the next UTC day and continues", async () => {
    const { result, slept } = await drive(
      [ok({ estUsd: 0.1 }), stopped("daily_cap"), ok({ selected: 0 })],
      { waitDaily: true },
    );
    expect(result.aborted).toBeUndefined();
    expect(slept.length).toBeGreaterThan(0);
    expect(slept[0]).toBeGreaterThan(60_000); // a real wait, not a poll
  });

  it("total_cap aborts for operator intervention", async () => {
    const { result } = await drive([ok({ estUsd: 0.1 }), stopped("total_cap")]);
    expect(result.aborted).toContain("total_cap");
    expect(result.aborted).toContain("operator");
  });

  it("cap_unset aborts for operator intervention", async () => {
    const { result } = await drive([ok({ estUsd: 0.1 }), stopped("cap_unset")]);
    expect(result.aborted).toContain("cap_unset");
  });

  it("an unknown legacy stop (no category, unfamiliar string) aborts, never continues", async () => {
    const legacy: MapCallResult = {
      ok: true,
      category: "unknown",
      counts: { selected: 100, estUsd: 0.01, budgetStop: "llm: budget stop — something new" },
    };
    const { result } = await drive([ok({ estUsd: 0.1 }), legacy]);
    expect(result.aborted).toContain("unknown");
  });

  it("exceeding the operator budget mid-drain aborts even without a server stop", async () => {
    const { result } = await drive([
      ok({ estUsd: 0.2 }),
      ok({ selected: 400, estUsd: 4.0, processedMarked: 400 }),
      ok({ selected: 400, estUsd: 4.0, processedMarked: 400 }),
      ok({ selected: 0 }),
    ]);
    expect(result.aborted).toContain("exceeded budget");
  });
});

describe("transport failures", () => {
  it("retries a transient failure and succeeds", async () => {
    const { result, slept } = await drive([
      ok({ estUsd: 0.1 }),
      new MapTransportError("fetch failed"),
      ok({ selected: 0 }),
    ]);
    expect(result.aborted).toBeUndefined();
    expect(slept).toContain(30_000);
  });

  it("aborts after bounded retries when the failure persists", async () => {
    const err = new MapTransportError("500 upstream");
    const { result, calls } = await drive([ok({ estUsd: 0.1 }), err, err, err, err]);
    expect(result.aborted).toContain("transport failure");
    // 1 dry + 3 live attempts (TRANSPORT_RETRIES)
    expect(calls.filter((p) => !p.includes("dry=1"))).toHaveLength(3);
  });
});

describe("msToNextUtcDay", () => {
  it("targets 90s past the next UTC midnight", () => {
    const now = new Date("2026-08-15T23:00:00Z");
    expect(msToNextUtcDay(now)).toBe(3600_000 + 90_000);
  });
});

describe("fail-closed CLI flags (2026-08-21 reviews)", () => {
  it("--cap must be a positive whole number, refused before any call", async () => {
    for (const bad of [NaN, Infinity, 0, -1, 2.5]) {
      await expect(drive([], { runCap: bad })).rejects.toThrow(/--cap must be a positive whole number/);
    }
    // parser-level, at the flag boundary
    for (const bad of ["", " ", "abc", "0", "-1", "2.5", "1,000"]) {
      expect(() => parseCountFlag("--cap", bad)).toThrow(/positive whole number/);
    }
    expect(parseCountFlag("--cap", "400")).toBe(400);
    // the CLI accept-set must not exceed the route's ^\d+$ / LIMIT range
    // (spend re-review 2026-08-21, NOTE-B)
    expect(() => parseCountFlag("--cap", "1e21")).toThrow(/positive whole number/);
    expect(() => parseCountFlag("--cap", "9007199254740993")).toThrow(/positive whole number/);
    expect(parseCountFlag("--cap", "1e3")).toBe(1000);
  });

  it("--budget keeps its finite-positive contract under --apply", async () => {
    for (const bad of [NaN, 0, -1]) {
      await expect(drive([], { budgetUsd: bad })).rejects.toThrow(/finite positive/);
    }
    for (const bad of ["", "abc", "NaN", "Infinity", "0", "-2"]) {
      expect(() => parseUsdFlag("--budget", bad)).toThrow(/finite positive USD/);
    }
    expect(parseUsdFlag("--budget", "0.25")).toBe(0.25);
  });

  it("--theater is allowlisted here too: a typo cannot sweep every day over zero work", async () => {
    // this driver has NO checkpoint store, so the false completion is transient
    // rather than durable — but it is still a false completion (lease review
    // MINOR-A applies the touched-sibling standard the route fix invoked)
    for (const bad of ["ru,ua", "zz", "russia", ""]) {
      await expect(drive([], { theater: bad })).rejects.toThrow(/--theater must be one of/);
    }
  });

  it("--theater accepts an operator's case habit and normalizes it", async () => {
    const { calls } = await drive(
      [{ ok: true, category: null, counts: { pending: 0, estUsd: 0 } }],
      { theater: "IR", apply: false },
    );
    expect(calls[0]).toContain("theater=ir");
    expect(calls[0]).not.toContain("theater=IR");
    expect(normalizeTheaterFlag(" Ru ")).toBe("ru");
  });

  it("the allowlist is shared with the remap driver and derived from TRACKS", () => {
    expect(MAP_DRIVER_THEATERS).toEqual([...new Set(MAP_DRIVER_THEATERS)].sort());
    expect(MAP_DRIVER_THEATERS).toContain("ru");
    expect(MAP_DRIVER_THEATERS).not.toContain("zz");
  });
});
