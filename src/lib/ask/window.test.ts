import { describe, expect, it } from "vitest";
import { parseTimeWindow } from "./window";

// Saturday 2026-07-11, noon UTC. 2026 is NOT a leap year.
const NOON = new Date(Date.UTC(2026, 6, 11, 12, 0, 0));

describe("parseTimeWindow — relative windows", () => {
  it("today / yesterday", () => {
    expect(parseTimeWindow("what happened today?", NOON)).toEqual({
      from: "2026-07-11",
      to: "2026-07-11",
      matchedPhrase: "today",
    });
    expect(parseTimeWindow("strikes yesterday", NOON)).toEqual({
      from: "2026-07-10",
      to: "2026-07-10",
      matchedPhrase: "yesterday",
    });
  });

  it("this week is Monday-start UTC (Sat 07-11 -> Mon 07-06)", () => {
    expect(parseTimeWindow("this week", NOON)).toEqual({
      from: "2026-07-06",
      to: "2026-07-11",
      matchedPhrase: "this week",
    });
  });

  it("this month -> first of month .. today", () => {
    expect(parseTimeWindow("prosecutions this month", NOON)).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-11",
    });
  });

  it("past/last N days", () => {
    expect(parseTimeWindow("past 7 days", NOON)).toMatchObject({ from: "2026-07-04", to: "2026-07-11" });
    expect(parseTimeWindow("in the last 3 days", NOON)).toMatchObject({ from: "2026-07-08" });
    expect(parseTimeWindow("past 1 day", NOON)).toMatchObject({ from: "2026-07-10" });
  });

  it("past week/month with no N means N=1", () => {
    expect(parseTimeWindow("past week", NOON)).toMatchObject({ from: "2026-07-04", to: "2026-07-11" });
    expect(parseTimeWindow("last month", NOON)).toMatchObject({ from: "2026-06-11", to: "2026-07-11" });
  });

  it("past N weeks / N months", () => {
    expect(parseTimeWindow("past 2 weeks", NOON)).toMatchObject({ from: "2026-06-27" });
    expect(parseTimeWindow("last 3 months", NOON)).toMatchObject({ from: "2026-04-11" });
  });

  it("past N months clamps the day at short months (Jul 31 - 1mo = Jun 30)", () => {
    const jul31 = new Date(Date.UTC(2026, 6, 31, 9));
    expect(parseTimeWindow("past 1 month", jul31)).toMatchObject({ from: "2026-06-30" });
  });
});

describe("parseTimeWindow — since / in absolute forms", () => {
  it("since <yyyy-mm-dd>", () => {
    expect(parseTimeWindow("since 2026-03-15", NOON)).toEqual({
      from: "2026-03-15",
      to: "2026-07-11",
      matchedPhrase: "since 2026-03-15",
    });
  });

  it("rejects an impossible yyyy-mm-dd (2026-13-40) -> null", () => {
    expect(parseTimeWindow("since 2026-13-40", NOON)).toBeNull();
  });

  it("since <Month> with no year = most recent occurrence not after now", () => {
    expect(parseTimeWindow("since March", NOON)).toMatchObject({ from: "2026-03-01", to: "2026-07-11" });
    // July has already started on 07-11, so "since July" is this year.
    expect(parseTimeWindow("since July", NOON)).toMatchObject({ from: "2026-07-01" });
    // August has NOT started yet -> last year's August.
    expect(parseTimeWindow("since August", NOON)).toMatchObject({ from: "2025-08-01" });
  });

  it("since <Month> <year>", () => {
    expect(parseTimeWindow("since March 2025", NOON)).toMatchObject({ from: "2025-03-01" });
  });

  it("YEAR BOUNDARY: 'since December' asked in January -> previous December", () => {
    const jan = new Date(Date.UTC(2026, 0, 15, 8));
    expect(parseTimeWindow("since December", jan)).toMatchObject({ from: "2025-12-01", to: "2026-01-15" });
  });

  it("since <Month> <D>[, year]", () => {
    expect(parseTimeWindow("since March 3", NOON)).toMatchObject({ from: "2026-03-03" });
    expect(parseTimeWindow("since March 3, 2024", NOON)).toMatchObject({ from: "2024-03-03" });
    expect(parseTimeWindow("since March 3 2024", NOON)).toMatchObject({ from: "2024-03-03" });
  });

  it("LEAP DAY: since February 29, 2024 (explicit) and no-year (steps back to a leap year)", () => {
    expect(parseTimeWindow("since February 29, 2024", NOON)).toMatchObject({ from: "2024-02-29" });
    // 2026/2025 have no Feb 29 -> most recent valid is 2024-02-29.
    expect(parseTimeWindow("since February 29", NOON)).toMatchObject({ from: "2024-02-29" });
  });

  it("in <Month> <yyyy> is a BOUNDED month, with correct month-length / leap end", () => {
    expect(parseTimeWindow("in February 2024", NOON)).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
      matchedPhrase: "in February 2024",
    });
    expect(parseTimeWindow("attacks in February 2023", NOON)).toMatchObject({ from: "2023-02-01", to: "2023-02-28" });
    expect(parseTimeWindow("in April 2025", NOON)).toMatchObject({ to: "2025-04-30" });
    expect(parseTimeWindow("in November 2025", NOON)).toMatchObject({ to: "2025-11-30" });
    expect(parseTimeWindow("in January 2025", NOON)).toMatchObject({ to: "2025-01-31" });
    expect(parseTimeWindow("in February 2020", NOON)).toMatchObject({ to: "2020-02-29" });
  });
});

describe("parseTimeWindow — matchedPhrase, case, and non-matches", () => {
  it("matchedPhrase is the exact consumed substring, original case preserved", () => {
    const w = parseTimeWindow("Which officials in the PAST 7 DAYS were charged?", NOON);
    expect(w?.matchedPhrase).toBe("PAST 7 DAYS");
    // matchedPhrase is always a substring, so it can be stripped for term extraction
    expect("Which officials in the PAST 7 DAYS were charged?").toContain(w!.matchedPhrase);
  });

  it("case-insensitive keyword matching", () => {
    expect(parseTimeWindow("SINCE March", NOON)).toMatchObject({ from: "2026-03-01" });
    expect(parseTimeWindow("Yesterday", NOON)).toMatchObject({ from: "2026-07-10", to: "2026-07-10" });
  });

  it("returns null when nothing matches", () => {
    expect(parseTimeWindow("which russian officials were prosecuted?", NOON)).toBeNull();
    expect(parseTimeWindow("", NOON)).toBeNull();
  });

  it("'between X and Y' is out of scope -> null", () => {
    expect(parseTimeWindow("between March and April", NOON)).toBeNull();
    expect(parseTimeWindow("events between 2024-01-01 and 2024-02-01", NOON)).toBeNull();
  });
});

describe("parseTimeWindow — pure UTC (no local-timezone leakage)", () => {
  it("resolves 'today' by the UTC calendar day at either end of the day", () => {
    // Late in the UTC day: a local-tz parser could roll to 07-12; UTC must stay 07-11.
    expect(parseTimeWindow("today", new Date("2026-07-11T23:30:00Z"))).toMatchObject({
      from: "2026-07-11",
      to: "2026-07-11",
    });
    // Early in the UTC day: a behind-UTC local parser could roll to 07-10.
    expect(parseTimeWindow("today", new Date("2026-07-11T00:30:00Z"))).toMatchObject({
      from: "2026-07-11",
      to: "2026-07-11",
    });
  });
});
