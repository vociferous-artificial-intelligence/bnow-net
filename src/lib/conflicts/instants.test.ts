import { describe, expect, it } from "vitest";
import {
  TIME_ANCHOR_TREATMENTS,
  classifyTimeAnchor,
  exclusiveEndOfDayMs,
  isIsoDay,
  isIsoInstant,
  parseIsoDayMs,
  parseIsoInstantMs,
} from "./instants";

// Fixed values throughout — no wall-clock reads anywhere in this file.

describe("parseIsoDayMs / isIsoDay", () => {
  it("parses a valid UTC day to its 00:00:00.000Z ms", () => {
    expect(parseIsoDayMs("2026-08-08")).toBe(Date.parse("2026-08-08T00:00:00Z"));
    expect(isIsoDay("2026-08-08")).toBe(true);
  });

  it("rejects impossible calendar dates despite engine rollover leniency", () => {
    // Node's Date.parse rolls 2026-02-30 over to March 2 — the round-trip
    // guard must catch it.
    expect(parseIsoDayMs("2026-02-30")).toBeNull();
    expect(parseIsoDayMs("2026-13-01")).toBeNull();
    expect(parseIsoDayMs("2026-04-31")).toBeNull();
    expect(isIsoDay("2026-02-30")).toBe(false);
  });

  it("accepts Feb 29 in a leap year, rejects it otherwise", () => {
    expect(parseIsoDayMs("2028-02-29")).not.toBeNull();
    expect(parseIsoDayMs("2026-02-29")).toBeNull();
  });

  it("rejects malformed shapes", () => {
    for (const bad of ["", "2026-8-8", "20260808", "2026-08-08T00:00:00Z", "not-a-day", "2026-08-08 "]) {
      expect(parseIsoDayMs(bad)).toBeNull();
    }
  });

  it("isIsoDay rejects non-strings without throwing", () => {
    expect(isIsoDay(null)).toBe(false);
    expect(isIsoDay(undefined)).toBe(false);
    expect(isIsoDay(20260808)).toBe(false);
    expect(isIsoDay({})).toBe(false);
  });
});

describe("exclusiveEndOfDayMs", () => {
  it("is 00:00:00.000Z of the NEXT day", () => {
    expect(exclusiveEndOfDayMs("2026-08-08")).toBe(Date.parse("2026-08-09T00:00:00Z"));
  });

  it("crosses month and year boundaries", () => {
    expect(exclusiveEndOfDayMs("2026-08-31")).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(exclusiveEndOfDayMs("2026-12-31")).toBe(Date.parse("2027-01-01T00:00:00Z"));
  });

  it("is null for a malformed day", () => {
    expect(exclusiveEndOfDayMs("2026-02-30")).toBeNull();
  });
});

describe("parseIsoInstantMs / isIsoInstant", () => {
  it("parses Z instants, with and without seconds/milliseconds", () => {
    expect(parseIsoInstantMs("2026-08-08T16:00:00Z")).toBe(Date.parse("2026-08-08T16:00:00Z"));
    expect(parseIsoInstantMs("2026-08-08T16:00Z")).toBe(Date.parse("2026-08-08T16:00:00Z"));
    expect(parseIsoInstantMs("2026-08-08T16:00:00.500Z")).toBe(
      Date.parse("2026-08-08T16:00:00Z") + 500,
    );
  });

  it("treats an explicit offset and its Z form as the SAME instant (the DST/offset fixture rule)", () => {
    expect(parseIsoInstantMs("2026-03-08T01:30:00-04:00")).toBe(
      parseIsoInstantMs("2026-03-08T05:30:00Z"),
    );
    expect(parseIsoInstantMs("2026-08-08T19:30:00+03:30")).toBe(
      parseIsoInstantMs("2026-08-08T16:00:00Z"),
    );
  });

  it("REJECTS timezone-less strings (implicit local time is forbidden)", () => {
    expect(parseIsoInstantMs("2026-08-08T16:00:00")).toBeNull();
    expect(parseIsoInstantMs("2026-08-08T16:00")).toBeNull();
    expect(isIsoInstant("2026-08-08T16:00:00")).toBe(false);
  });

  it("rejects impossible calendar dates inside instants", () => {
    expect(parseIsoInstantMs("2026-02-30T10:00:00Z")).toBeNull();
  });

  it("rejects out-of-range time and offset components", () => {
    expect(parseIsoInstantMs("2026-08-08T24:00:00Z")).toBeNull();
    expect(parseIsoInstantMs("2026-08-08T16:60:00Z")).toBeNull();
    expect(parseIsoInstantMs("2026-08-08T16:00:61Z")).toBeNull();
    expect(parseIsoInstantMs("2026-08-08T16:00:00+15:00")).toBeNull();
    expect(parseIsoInstantMs("2026-08-08T16:00:00+02:60")).toBeNull();
  });

  it("rejects malformed shapes", () => {
    for (const bad of [
      "",
      "yesterday evening",
      "2026-08-08",
      "2026-08-08T16:00:00 Z",
      "2026-08-08T16:00:00+0200",
      "August 8 2026 16:00 UTC",
    ]) {
      expect(parseIsoInstantMs(bad)).toBeNull();
    }
  });

  it("isIsoInstant rejects non-strings without throwing", () => {
    expect(isIsoInstant(null)).toBe(false);
    expect(isIsoInstant(1786204800000)).toBe(false);
    expect(isIsoInstant(new Date(0))).toBe(false);
  });
});

describe("classifyTimeAnchor (the timeAnchors fixture vocabulary)", () => {
  it("exposes exactly the three treatments", () => {
    expect(TIME_ANCHOR_TREATMENTS).toEqual(["present", "missing", "malformed_treated_as_missing"]);
  });

  it("null and undefined are missing", () => {
    expect(classifyTimeAnchor(null)).toEqual({ treatment: "missing", instantMs: null, raw: null });
    expect(classifyTimeAnchor(undefined)).toEqual({
      treatment: "missing",
      instantMs: null,
      raw: null,
    });
  });

  it("a valid explicit-timezone instant is present with its ms", () => {
    expect(classifyTimeAnchor("2026-08-08T16:00:00Z")).toEqual({
      treatment: "present",
      instantMs: Date.parse("2026-08-08T16:00:00Z"),
      raw: "2026-08-08T16:00:00Z",
    });
  });

  it("a malformed value is treated as missing but keeps the raw string as the diagnostic — never guessed", () => {
    const c = classifyTimeAnchor("around noon local time");
    expect(c.treatment).toBe("malformed_treated_as_missing");
    expect(c.instantMs).toBeNull();
    expect(c.raw).toBe("around noon local time");
  });

  it("a timezone-less timestamp is malformed, not guessed into a zone", () => {
    expect(classifyTimeAnchor("2026-08-08T16:00:00").treatment).toBe(
      "malformed_treated_as_missing",
    );
  });

  it("a bare day is malformed for an anchor (anchors are instants)", () => {
    expect(classifyTimeAnchor("2026-08-08").treatment).toBe("malformed_treated_as_missing");
  });
});
