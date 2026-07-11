import { describe, expect, it } from "vitest";
import {
  advanceCheckpoint,
  emptyCheckpoint,
  parseCheckpoint,
  serializeCheckpoint,
} from "./backfill";

describe("embed backfill checkpoint", () => {
  it("emptyCheckpoint is fully zeroed", () => {
    expect(emptyCheckpoint()).toEqual({ lastClaimId: 0, processed: 0, tokens: 0, costUsd: 0 });
  });

  it("parseCheckpoint tolerates null / garbage / non-object", () => {
    expect(parseCheckpoint(null)).toEqual(emptyCheckpoint());
    expect(parseCheckpoint(undefined)).toEqual(emptyCheckpoint());
    expect(parseCheckpoint("")).toEqual(emptyCheckpoint());
    expect(parseCheckpoint("not json {")).toEqual(emptyCheckpoint());
    expect(parseCheckpoint("123")).toEqual(emptyCheckpoint()); // valid JSON, not an object
  });

  it("parseCheckpoint fills missing fields and sanitises lastClaimId", () => {
    expect(parseCheckpoint(JSON.stringify({ lastClaimId: 50 }))).toEqual({
      lastClaimId: 50,
      processed: 0,
      tokens: 0,
      costUsd: 0,
    });
    expect(parseCheckpoint(JSON.stringify({ lastClaimId: -5 })).lastClaimId).toBe(0); // clamped >= 0
    expect(parseCheckpoint(JSON.stringify({ lastClaimId: 3.9 })).lastClaimId).toBe(3); // floored
    expect(parseCheckpoint(JSON.stringify({ lastClaimId: "nope" })).lastClaimId).toBe(0);
  });

  it("round-trips through serialize/parse", () => {
    const cp = { lastClaimId: 42, processed: 100, tokens: 3000, costUsd: 0.00006 };
    expect(parseCheckpoint(serializeCheckpoint(cp))).toEqual(cp);
  });

  it("advanceCheckpoint sums totals and moves the floor forward only (monotonic)", () => {
    const cp1 = advanceCheckpoint(emptyCheckpoint(), {
      lastId: 20,
      count: 10,
      tokens: 100,
      costUsd: 0.001,
    });
    expect(cp1).toEqual({ lastClaimId: 20, processed: 10, tokens: 100, costUsd: 0.001 });

    // a batch whose max id is lower must never rewind the resume floor
    const cp2 = advanceCheckpoint(cp1, { lastId: 15, count: 5, tokens: 50, costUsd: 0.0005 });
    expect(cp2.lastClaimId).toBe(20);
    expect(cp2.processed).toBe(15);
    expect(cp2.tokens).toBe(150);
    expect(cp2.costUsd).toBeCloseTo(0.0015, 12);
  });
});
