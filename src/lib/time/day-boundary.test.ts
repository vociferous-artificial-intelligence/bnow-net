import { describe, expect, it } from "vitest";
import { etToday, toInstant, utcDay } from "./day-boundary";

describe("dayString / etToday / utcDay", () => {
  // The day-boundary matrix from the 2026-07-12 analyst-trust prompt: ET wall-clock
  // hours where ET and UTC days agree, and the 8 PM–midnight ET band where UTC has
  // already rolled to the next day (EDT = UTC-4 in July).
  it("agrees with UTC during ET daytime (10:45 AM ET)", () => {
    const t = new Date("2026-07-12T14:45:00Z");
    expect(etToday(t)).toBe("2026-07-12");
    expect(utcDay(t)).toBe("2026-07-12");
  });

  it("agrees with UTC at 00:30 ET and 3:45 PM ET", () => {
    expect(etToday(new Date("2026-07-12T04:30:00Z"))).toBe("2026-07-12"); // 00:30 ET
    expect(utcDay(new Date("2026-07-12T04:30:00Z"))).toBe("2026-07-12");
    expect(etToday(new Date("2026-07-12T19:45:00Z"))).toBe("2026-07-12"); // 3:45 PM ET
  });

  it("diverges from UTC in the 8 PM–midnight ET rollover band", () => {
    const nine = new Date("2026-07-13T01:00:00Z"); // 9:00 PM ET Jul 12
    expect(etToday(nine)).toBe("2026-07-12");
    expect(utcDay(nine)).toBe("2026-07-13");
    const half = new Date("2026-07-13T03:30:00Z"); // 11:30 PM ET Jul 12
    expect(etToday(half)).toBe("2026-07-12");
    expect(utcDay(half)).toBe("2026-07-13");
  });

  it("is DST-safe: EST (UTC-5) in January shifts the boundary hour", () => {
    // 00:30 UTC Jan 15 = 7:30 PM ET Jan 14 under EST.
    const t = new Date("2026-01-15T00:30:00Z");
    expect(etToday(t)).toBe("2026-01-14");
    expect(utcDay(t)).toBe("2026-01-15");
    // In EST the UTC day rolls at 7 PM ET, not 8 PM.
    expect(etToday(new Date("2026-01-15T00:00:00Z"))).toBe("2026-01-14");
  });
});

describe("toInstant", () => {
  it("passes through Date instances and parses ISO strings", () => {
    const d = new Date("2026-07-12T10:05:09.008Z");
    expect(toInstant(d)).toBe(d);
    expect(toInstant("2026-07-12T10:05:09.008Z")?.getTime()).toBe(d.getTime());
  });

  it("returns null for null, undefined, and unparseable input", () => {
    expect(toInstant(null)).toBeNull();
    expect(toInstant(undefined)).toBeNull();
    expect(toInstant("not a date")).toBeNull();
    expect(toInstant(new Date("not a date"))).toBeNull();
  });
});
