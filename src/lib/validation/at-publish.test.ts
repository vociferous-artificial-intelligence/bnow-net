import { describe, expect, it } from "vitest";
import { computeAtPublish } from "./at-publish";

const PUB = new Date("2026-07-11T20:10:07Z"); // a real Iran Update publish instant

describe("computeAtPublish", () => {
  it("is null when the publish instant is unknown or unparseable", () => {
    expect(computeAtPublish(null, [], 5)).toBeNull();
    expect(computeAtPublish("garbage", [], 5)).toBeNull();
  });

  it("counts only agreements whose evidence was ingested at or before publish", () => {
    const r = computeAtPublish(
      PUB,
      [
        { earliestFetchedAt: "2026-07-11T18:00:00Z" }, // before — counts
        { earliestFetchedAt: "2026-07-11T20:10:07Z" }, // exactly at — counts (<=)
        { earliestFetchedAt: "2026-07-11T23:59:00Z" }, // after — excluded
        { earliestFetchedAt: null }, // unknown — conservatively excluded
        {}, // absent — conservatively excluded
      ],
      10,
    );
    expect(r).toEqual({
      coveragePct: 20,
      matchedBefore: 2,
      matchedTotal: 5,
      iswPublishedAt: "2026-07-11T20:10:07.000Z",
    });
  });

  it("accepts Date instances and ISO strings interchangeably", () => {
    const viaDate = computeAtPublish(PUB, [{ earliestFetchedAt: new Date("2026-07-11T10:00:00Z") }], 4);
    const viaString = computeAtPublish(PUB.toISOString(), [{ earliestFetchedAt: "2026-07-11T10:00:00Z" }], 4);
    expect(viaDate).toEqual(viaString);
    expect(viaDate?.coveragePct).toBe(25);
  });

  it("rounds like coverage_pct (one decimal)", () => {
    const r = computeAtPublish(PUB, [{ earliestFetchedAt: "2026-07-11T00:00:00Z" }], 3);
    expect(r?.coveragePct).toBe(33.3);
  });

  it("keeps counts but yields a null percentage on a zero denominator", () => {
    const r = computeAtPublish(PUB, [{ earliestFetchedAt: "2026-07-11T00:00:00Z" }], 0);
    expect(r).toMatchObject({ coveragePct: null, matchedBefore: 1, matchedTotal: 1 });
  });

  it("ignores unparseable evidence timestamps rather than counting them", () => {
    const r = computeAtPublish(PUB, [{ earliestFetchedAt: "not-a-date" }], 2);
    expect(r?.matchedBefore).toBe(0);
  });
});
