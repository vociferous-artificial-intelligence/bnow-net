import { describe, expect, it } from "vitest";
import {
  analyticsHedging,
  analyticsSignalType,
  analyticsTheater,
  digestAgeBucket,
  evidenceCountBucket,
  resultCountBucket,
  sourceCountBucket,
  trackCountBucket,
} from "./product-event-model";

describe("product-event coarse property model", () => {
  it("normalizes closed categorical values and never forwards arbitrary text", () => {
    expect(analyticsTheater(" UA ")).toBe("ua");
    expect(analyticsTheater("person name")).toBe("other");
    expect(analyticsHedging("ASSESSED")).toBe("assessed");
    expect(analyticsHedging("free form")).toBe("unknown");
    expect(analyticsSignalType("trade_divergence")).toBe("trade_divergence");
    expect(analyticsSignalType("named target")).toBeNull();
  });

  it("uses only the approved count buckets", () => {
    expect([0, 1, 5, 6, 20, 21].map(resultCountBucket)).toEqual([
      "0",
      "1-5",
      "1-5",
      "6-20",
      "6-20",
      "21+",
    ]);
    expect([0, 1, 2, 5, 6].map(evidenceCountBucket)).toEqual(["0", "1", "2-5", "2-5", "6+"]);
    expect([1, 2, 3, 4].map(sourceCountBucket)).toEqual(["1", "2-3", "2-3", "4+"]);
    expect([1, 2, 3, 4].map(trackCountBucket)).toEqual(["1", "2-3", "2-3", "4+"]);
  });

  it("buckets digest age without emitting the date", () => {
    const now = new Date("2026-07-14T23:00:00Z");
    expect(digestAgeBucket("2026-07-14", now)).toBe("today");
    expect(digestAgeBucket("2026-07-07", now)).toBe("1-7d");
    expect(digestAgeBucket("2026-07-06", now)).toBe("older");
  });
});
