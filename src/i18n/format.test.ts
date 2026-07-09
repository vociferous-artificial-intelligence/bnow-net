import { describe, expect, it } from "vitest";
import {
  formatNumber,
  formatPercent,
  formatDate,
  formatTime,
  formatDateTime,
} from "./format";

describe("formatNumber", () => {
  it("groups per locale (Intl, not hand-rolled)", () => {
    expect(formatNumber("en", 1234567)).toBe("1,234,567");
    expect(formatNumber("de", 1234567)).toBe("1.234.567");
  });
  it("produces a non-empty string for every required locale", () => {
    for (const loc of ["uk", "de", "ar", "ja", "pl", "fr"] as const) {
      expect(formatNumber(loc, 1234567)).not.toHaveLength(0);
    }
  });
  it("degrades to an em dash on non-finite input", () => {
    expect(formatNumber("en", NaN)).toBe("—");
    expect(formatNumber("en", Infinity)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("treats the input as a ratio", () => {
    expect(formatPercent("en", 0.175)).toBe("17.5%");
    expect(formatPercent("en", 1)).toBe("100%");
  });
  it("degrades to an em dash on non-finite input", () => {
    expect(formatPercent("en", NaN)).toBe("—");
  });
});

describe("formatDate / formatTime / formatDateTime", () => {
  it("renders a date-only value deterministically in UTC (no off-by-one)", () => {
    // Midnight UTC must render as the 8th regardless of the host time zone.
    const out = formatDate("en", "2026-07-08T00:00:00Z");
    expect(out).toContain("2026");
    expect(out).toContain("8");
  });
  it("accepts Date, string and epoch inputs", () => {
    expect(formatDate("de", new Date("2026-07-08T00:00:00Z"))).toContain("2026");
    expect(formatDate("ja", "2026-07-08T00:00:00Z")).toContain("2026");
    expect(formatDate("en", Date.parse("2026-07-08T00:00:00Z"))).toContain("2026");
  });
  it("time + datetime return non-empty strings", () => {
    expect(formatTime("fr", "2026-07-08T09:30:00Z")).not.toHaveLength(0);
    expect(formatDateTime("pl", "2026-07-08T09:30:00Z")).toContain("2026");
  });
  it("degrades to an em dash on an invalid date", () => {
    expect(formatDate("en", "not-a-date")).toBe("—");
    expect(formatTime("en", "not-a-date")).toBe("—");
    expect(formatDateTime("en", "not-a-date")).toBe("—");
  });
});
