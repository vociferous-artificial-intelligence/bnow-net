import { describe, expect, it } from "vitest";
import {
  meanCoveragePct,
  meanLeadHours,
  medianLeadHours,
  meanThinSourcedPct,
  nonzeroDayCoverage,
  targetGap,
  type ScoreboardRunLike,
} from "./summary";

const row = (over: Partial<ScoreboardRunLike>): ScoreboardRunLike => ({
  coverage_pct: null,
  unsupported_claim_rate: null,
  timeliness_hours: null,
  ...over,
});

describe("meanCoveragePct", () => {
  it("averages non-null coverage values", () => {
    const rows = [row({ coverage_pct: 20 }), row({ coverage_pct: 40 }), row({ coverage_pct: null })];
    expect(meanCoveragePct(rows)).toBe(30);
  });
  it("returns null when no run has a coverage value", () => {
    expect(meanCoveragePct([row({}), row({})])).toBeNull();
  });
  it("returns null on an empty row set", () => {
    expect(meanCoveragePct([])).toBeNull();
  });
});

describe("meanThinSourcedPct", () => {
  it("converts the 0-1 fraction to a 0-100 percent and averages", () => {
    const rows = [row({ unsupported_claim_rate: 0.4 }), row({ unsupported_claim_rate: 0.6 })];
    expect(meanThinSourcedPct(rows)).toBe(50);
  });
  it("returns null when every value is null", () => {
    expect(meanThinSourcedPct([row({}), row({})])).toBeNull();
  });
});

describe("meanLeadHours", () => {
  it("averages signed lead hours", () => {
    const rows = [row({ timeliness_hours: 10 }), row({ timeliness_hours: -2 })];
    expect(meanLeadHours(rows)).toBe(4);
  });
});

describe("nonzeroDayCoverage", () => {
  it("excludes zero and null coverage days from the mean but not from nothing else", () => {
    const rows = [
      row({ coverage_pct: 0 }),
      row({ coverage_pct: null }),
      row({ coverage_pct: 40 }),
      row({ coverage_pct: 60 }),
    ];
    expect(nonzeroDayCoverage(rows)).toEqual({ meanPct: 50, days: 2 });
  });
  it("reports zero days and a null mean when nothing is nonzero", () => {
    expect(nonzeroDayCoverage([row({ coverage_pct: 0 }), row({ coverage_pct: null })])).toEqual({
      meanPct: null,
      days: 0,
    });
  });
});

describe("medianLeadHours", () => {
  it("returns the middle value for an odd count, ignoring nulls", () => {
    const rows = [
      row({ timeliness_hours: 2 }),
      row({ timeliness_hours: null }),
      row({ timeliness_hours: 100 }), // outlier that would drag a mean
      row({ timeliness_hours: 6 }),
    ];
    expect(medianLeadHours(rows)).toBe(6);
  });
  it("averages the two middle values for an even count", () => {
    const rows = [4, 8, 2, 100].map((h) => row({ timeliness_hours: h }));
    expect(medianLeadHours(rows)).toBe(6);
  });
  it("is null when no run has a lead value", () => {
    expect(medianLeadHours([row({ timeliness_hours: null })])).toBeNull();
  });
});

describe("targetGap", () => {
  it("is positive when actual exceeds target", () => {
    expect(targetGap(85, 80)).toBe(5);
  });
  it("is negative when actual falls short of target", () => {
    expect(targetGap(18, 80)).toBeCloseTo(-62);
  });
  it("is null-safe", () => {
    expect(targetGap(null, 80)).toBeNull();
  });
});
