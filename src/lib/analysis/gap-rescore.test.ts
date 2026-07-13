import { describe, expect, it } from "vitest";
import { utcDayRange } from "../time/day-boundary";
import type { GapCheckpoint } from "../adapters/x-gap-backfill";
import {
  applyRefusal,
  classifyValidation,
  rescoreMatrix,
  RESCORE_VALIDATION_COUNTRIES,
} from "./gap-rescore";

// Gates for the bounded X-gap rescore operator: the exact regeneration matrix,
// the day-window enumeration, and the refuse-apply conditions (checkpoint
// completeness/coverage + the Workstream B/E acknowledgement).

function completeCheckpoint(over: Partial<GapCheckpoint> = {}): GapCheckpoint {
  return {
    version: 1,
    fromUnix: Date.parse("2026-07-09T00:00:00Z") / 1000,
    toUnix: Date.parse("2026-07-14T00:00:00Z") / 1000,
    rosterHash: "abc",
    batchSize: 20,
    accounts: 383,
    batches: 20,
    batchIndex: 20,
    cursor: "",
    completedBatches: 20,
    counts: { requests: 0, pages: 0, returned: 0, attributed: 0, unattributed: 0, inserted: 0, duplicates: 0 },
    spendUsd: 0,
    complete: true,
    ...over,
  };
}

const GATE = {
  apply: true,
  ackWorkstreamsBE: true,
  checkpoint: completeCheckpoint(),
  fromDate: "2026-07-09",
  toDate: "2026-07-13",
};

describe("rescoreMatrix", () => {
  it("is exactly the configured TRACKS matrix for ru/ua/ir", () => {
    expect(rescoreMatrix()).toEqual([
      { country: "ru", track: "military" },
      { country: "ru", track: "elite_politics" },
      { country: "ua", track: "military" },
      { country: "ir", track: "military" },
      { country: "ir", track: "elite_politics" },
      { country: "ir", track: "nuclear" },
    ]);
  });

  it("validates military digests for exactly ru/ua/ir", () => {
    expect([...RESCORE_VALIDATION_COUNTRIES]).toEqual(["ru", "ua", "ir"]);
  });
});

describe("utcDayRange", () => {
  it("enumerates inclusive UTC days", () => {
    expect(utcDayRange("2026-07-09", "2026-07-13")).toEqual([
      "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13",
    ]);
    expect(utcDayRange("2026-07-09", "2026-07-09")).toEqual(["2026-07-09"]);
  });
  it("is empty on inverted or malformed input", () => {
    expect(utcDayRange("2026-07-13", "2026-07-09")).toEqual([]);
    expect(utcDayRange("garbage", "2026-07-09")).toEqual([]);
  });
});

describe("applyRefusal", () => {
  it("dry runs never refuse", () => {
    expect(applyRefusal({ ...GATE, apply: false, checkpoint: null, ackWorkstreamsBE: false })).toBeNull();
  });

  it("refuses without the Workstream B/E acknowledgement", () => {
    expect(applyRefusal({ ...GATE, ackWorkstreamsBE: false })).toContain("--ack-workstreams-be");
  });

  it("refuses without a checkpoint, and with an incomplete one", () => {
    expect(applyRefusal({ ...GATE, checkpoint: null })).toContain("no X recovery checkpoint");
    expect(applyRefusal({ ...GATE, checkpoint: completeCheckpoint({ complete: false }) })).toContain(
      "not globally complete",
    );
  });

  it("refuses when the checkpoint does not cover the rescore window", () => {
    const short = completeCheckpoint({ toUnix: Date.parse("2026-07-12T00:00:00Z") / 1000 });
    expect(applyRefusal({ ...GATE, checkpoint: short })).toContain("recover the full window");
    // exact coverage is enough: rescoring through 07-13 needs recovery to 07-14T00Z
    expect(applyRefusal(GATE)).toBeNull();
  });
});

describe("classifyValidation", () => {
  it("distinguishes ok / pending ISW reference / real failure", () => {
    expect(classifyValidation({ coveragePct: 50 })).toBe("ok");
    expect(classifyValidation({ error: "no reference report for ru 2026-07-13 (probe 404)" })).toBe("pending");
    expect(classifyValidation({ error: "no digest for ru 2026-07-13" })).toBe("failed");
  });
});
