import { describe, expect, it } from "vitest";
import { digestStage, digestStatus } from "./digest-status";

// The MR3 cadence in UTC: intraday 04:00/10:00/19:30 on day D, finalize 02:00 D+1.
// All "now" values below are chosen to walk a bucket through its real lifecycle.

describe("digestStage", () => {
  it("is intraday while the bucket's last write is within its own UTC day", () => {
    expect(digestStage("2026-07-12", new Date("2026-07-12T04:04:58Z"))).toBe("intraday");
    expect(digestStage("2026-07-12", new Date("2026-07-12T19:31:00Z"))).toBe("intraday");
  });

  it("is final once the bucket was written on a later UTC day (the 02:00 D+1 finalize)", () => {
    expect(digestStage("2026-07-12", new Date("2026-07-13T02:02:00Z"))).toBe("final");
  });

  it("treats a missing write timestamp as intraday (honest lower bound)", () => {
    expect(digestStage("2026-07-12", null)).toBe("intraday");
  });
});

describe("digestStatus", () => {
  it("none when the theater has no digests at all", () => {
    expect(
      digestStatus({ latestDate: null, lastGeneratedAt: null, now: new Date() }),
    ).toEqual({ kind: "none" });
  });

  it("today+intraday mid-morning ET (the operator's 10:45 AM screenshot hour)", () => {
    const s = digestStatus({
      latestDate: "2026-07-12",
      lastGeneratedAt: "2026-07-12T10:05:09Z", // 6:05 AM ET eu-midday write
      now: new Date("2026-07-12T14:45:00Z"), // 10:45 AM ET
    });
    expect(s).toMatchObject({ kind: "today", date: "2026-07-12", stage: "intraday" });
  });

  it("today+intraday at 9 PM ET after the UTC day rolled (bucket still the ET day)", () => {
    const s = digestStatus({
      latestDate: "2026-07-12",
      lastGeneratedAt: "2026-07-12T19:31:00Z", // 3:31 PM ET us-afternoon write
      now: new Date("2026-07-13T01:00:00Z"), // 9:00 PM ET Jul 12
    });
    expect(s).toMatchObject({ kind: "today", date: "2026-07-12", stage: "intraday" });
  });

  it("today+final at 11 PM ET after the 10 PM ET finalize", () => {
    const s = digestStatus({
      latestDate: "2026-07-12",
      lastGeneratedAt: "2026-07-13T02:02:00Z", // 10:02 PM ET Jul 12
      now: new Date("2026-07-13T03:00:00Z"), // 11:00 PM ET Jul 12
    });
    expect(s).toMatchObject({ kind: "today", date: "2026-07-12", stage: "final" });
  });

  it("previous just after midnight ET before the day's first intraday write", () => {
    const s = digestStatus({
      latestDate: "2026-07-12",
      lastGeneratedAt: "2026-07-13T02:02:00Z",
      now: new Date("2026-07-13T04:02:00Z"), // 12:02 AM ET Jul 13, 04:00 cron not landed yet
    });
    expect(s).toMatchObject({ kind: "previous", date: "2026-07-12", stage: "final" });
  });

  it("previous mid-morning when crons have failed all day (the honest stale state)", () => {
    const s = digestStatus({
      latestDate: "2026-07-11",
      lastGeneratedAt: "2026-07-12T02:02:00Z",
      now: new Date("2026-07-12T14:45:00Z"), // 10:45 AM ET Jul 12
    });
    expect(s).toMatchObject({ kind: "previous", date: "2026-07-11", stage: "final" });
  });

  it("a bucket dated past the ET day (clock-skew defense) still reads as today", () => {
    const s = digestStatus({
      latestDate: "2026-07-13",
      lastGeneratedAt: "2026-07-13T04:04:00Z",
      now: new Date("2026-07-13T03:59:00Z"), // 11:59 PM ET Jul 12
    });
    expect(s).toMatchObject({ kind: "today", date: "2026-07-13" });
  });

  it("accepts driver-shaped input (Date instance) for lastGeneratedAt", () => {
    const s = digestStatus({
      latestDate: "2026-07-12",
      lastGeneratedAt: new Date("2026-07-13T02:02:00Z"),
      now: new Date("2026-07-13T03:00:00Z"),
    });
    expect(s).toMatchObject({ kind: "today", stage: "final" });
  });
});
