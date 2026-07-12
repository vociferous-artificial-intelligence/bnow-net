import { describe, expect, it } from "vitest";
import { formatEtDateTime, formatEtTime } from "./format-et";

// Intl output may use a narrow no-break space (U+202F) before AM/PM depending on
// the ICU build — normalize whitespace before asserting.
function norm(s: string | null): string | null {
  return s === null ? null : s.replace(/[  ]/g, " ");
}

describe("formatEtDateTime", () => {
  it("renders month/day + wall-clock time in ET with the ET suffix", () => {
    expect(norm(formatEtDateTime("2026-07-12T14:45:00Z", "en"))).toBe("Jul 12, 10:45 AM ET");
  });

  it("crosses the day boundary correctly (02:02 UTC = 10:02 PM ET the previous day)", () => {
    expect(norm(formatEtDateTime("2026-07-13T02:02:00Z", "en"))).toBe("Jul 12, 10:02 PM ET");
  });

  it("is DST-safe (January renders EST, UTC-5)", () => {
    expect(norm(formatEtDateTime("2026-01-15T00:30:00Z", "en"))).toBe("Jan 14, 7:30 PM ET");
  });

  it("accepts Date instances (the Neon driver returns timestamptz as Date)", () => {
    expect(norm(formatEtDateTime(new Date("2026-07-12T14:45:00Z"), "en"))).toBe(
      "Jul 12, 10:45 AM ET",
    );
  });

  it("returns null on missing/invalid input, never 'Invalid Date'", () => {
    expect(formatEtDateTime(null, "en")).toBeNull();
    expect(formatEtDateTime("garbage", "en")).toBeNull();
  });
});

describe("formatEtTime", () => {
  it("renders time-only with the ET suffix", () => {
    expect(norm(formatEtTime("2026-07-12T10:05:09Z", "en"))).toBe("6:05 AM ET");
    expect(norm(formatEtTime("2026-07-13T02:02:00Z", "en"))).toBe("10:02 PM ET");
  });

  it("returns null on missing/invalid input", () => {
    expect(formatEtTime(null, "en")).toBeNull();
    expect(formatEtTime("garbage", "en")).toBeNull();
  });
});
