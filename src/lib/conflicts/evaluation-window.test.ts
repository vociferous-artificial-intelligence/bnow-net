import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  computeEvaluationWindow,
  isClaimDateInWindow,
  isInstantInWindow,
  windowDaySpan,
} from "./evaluation-window";

const crosscutting = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures/conflicts/crosscutting-scenarios-v1.json"), "utf8"),
) as {
  scenarios: Array<{
    id: string;
    report: {
      reportDate: string;
      cutoffAt?: string | null;
      publishedAt?: string | null;
    } | null;
    evidence?: Array<{ claimId: number; claimDate: string }>;
    expected: Record<string, unknown>;
  }>;
};

describe("computeEvaluationWindow — the frozen §5 ladder", () => {
  it("rung 1: parseable cutoff bounds the window (windowEndSource cutoff)", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: "2026-07-24T18:00:00Z",
      publishedAt: "2026-07-24T23:08:59Z",
    });
    expect(w.windowEndSource).toBe("cutoff");
    expect(w.endBoundary).toBe("inclusive");
    expect(w.startDate).toBe("2026-07-22"); // reportDate − 2 days
    expect(w.startMs).toBe(Date.parse("2026-07-22T00:00:00Z"));
    expect(w.endMs).toBe(Date.parse("2026-07-24T18:00:00Z"));
    expect(w.endDate).toBe("2026-07-24");
    expect(w.empty).toBe(false);
    expect(w.orderingDiagnostic).toBeNull();
  });

  it("rung 2: missing cutoff falls to publishedAt (windowEndSource published)", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: null,
      publishedAt: "2026-07-24T23:08:59Z",
    });
    expect(w.windowEndSource).toBe("published");
    expect(w.cutoffTreatment).toBe("missing");
    expect(w.endMs).toBe(Date.parse("2026-07-24T23:08:59Z"));
  });

  it("rung 3: both anchors missing → EXCLUSIVE end of the report date's UTC day", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: null,
      publishedAt: undefined,
    });
    expect(w.windowEndSource).toBe("report_day");
    expect(w.endBoundary).toBe("exclusive");
    expect(w.endMs).toBe(Date.parse("2026-07-25T00:00:00Z"));
    expect(w.endDate).toBe("2026-07-24"); // last INCLUDED day is the report date
    // the exclusive boundary instant itself is OUT; a ms earlier is IN
    expect(isInstantInWindow(w, w.endMs)).toBe(false);
    expect(isInstantInWindow(w, w.endMs - 1)).toBe(true);
  });

  it("a MALFORMED cutoff is treated as missing (classified, never guessed) and falls a rung", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-08-12",
      cutoffAt: "August 12, 2026, 3:45 pm ET", // raw declared string, not ISO
      publishedAt: null,
    });
    expect(w.cutoffTreatment).toBe("malformed_treated_as_missing");
    expect(w.publishedTreatment).toBe("missing");
    expect(w.windowEndSource).toBe("report_day");
  });

  it("matches fixture cc-window-rung2-017: malformed cutoff + past-midnight publication", () => {
    const scenario = crosscutting.scenarios.find((s) => s.id === "cc-window-rung2-017");
    expect(scenario).toBeDefined();
    const report = scenario!.report!;
    const w = computeEvaluationWindow({
      reportDate: report.reportDate, // 2026-08-13
      cutoffAt: report.cutoffAt, // malformed declared string
      publishedAt: report.publishedAt, // 2026-08-14T01:15:00Z
    });
    expect(w.windowEndSource).toBe(scenario!.expected.windowEndSource); // "published"
    expect(w.cutoffTreatment).toBe(
      (scenario!.expected.timeAnchors as Record<string, string>).cutoffAt,
    ); // "malformed_treated_as_missing"
    // the past-midnight publication EXTENDS the day span: claim 9324
    // (claimDate 2026-08-14) is eligible ONLY via rung 2
    const claim = scenario!.evidence!.find((e) => e.claimId === 9324)!;
    expect(isClaimDateInWindow(w, claim.claimDate)).toBe(true);
    expect(w.endDate).toBe("2026-08-14");
    const rung3 = computeEvaluationWindow({
      reportDate: report.reportDate,
      cutoffAt: null,
      publishedAt: null,
    });
    expect(isClaimDateInWindow(rung3, claim.claimDate)).toBe(false); // would be off_window
  });

  it("day-granularity: sub-day END differences do not change the day span", () => {
    const byCutoff = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: "2026-07-24T18:00:00Z",
      publishedAt: "2026-07-24T23:08:59Z",
    });
    const byPublished = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: null,
      publishedAt: "2026-07-24T23:08:59Z",
    });
    expect(byCutoff.windowEndSource).not.toBe(byPublished.windowEndSource); // rung changed…
    expect(byCutoff.endDate).toBe(byPublished.endDate); // …but the END DATE did not
    expect(windowDaySpan(byCutoff)).toEqual(windowDaySpan(byPublished));
    expect(windowDaySpan(byCutoff)).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"]);
    // the sub-day difference still drives instant diagnostics
    const between = Date.parse("2026-07-24T20:00:00Z");
    expect(isInstantInWindow(byCutoff, between)).toBe(false);
    expect(isInstantInWindow(byPublished, between)).toBe(true);
  });

  it("END is INCLUSIVE where instant comparisons apply (at or before)", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: "2026-07-24T18:00:00Z",
      publishedAt: null,
    });
    expect(isInstantInWindow(w, w.endMs)).toBe(true); // exactly at the cutoff
    expect(isInstantInWindow(w, w.endMs + 1)).toBe(false);
    expect(isInstantInWindow(w, w.startMs)).toBe(true); // inclusive start
    expect(isInstantInWindow(w, w.startMs - 1)).toBe(false);
  });

  it("an END instant exactly at UTC midnight includes that day (inclusive at-or-before)", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-08-13",
      cutoffAt: null,
      publishedAt: "2026-08-14T00:00:00Z",
    });
    expect(w.endDate).toBe("2026-08-14");
    expect(isClaimDateInWindow(w, "2026-08-14")).toBe(true);
  });

  it("a pathological early cutoff yields a VISIBLY empty window, never a reorder", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: "2026-07-10T12:00:00Z",
      publishedAt: null,
    });
    expect(w.empty).toBe(true);
    expect(windowDaySpan(w)).toEqual([]);
    expect(isClaimDateInWindow(w, "2026-07-22")).toBe(false);
    expect(isInstantInWindow(w, Date.parse("2026-07-10T12:00:00Z"))).toBe(false);
  });

  it("cutoff-after-publication is a visible, non-rejecting diagnostic; rung 1 still applies", () => {
    const w = computeEvaluationWindow({
      reportDate: "2026-07-24",
      cutoffAt: "2026-07-25T03:00:00Z",
      publishedAt: "2026-07-24T23:08:59Z",
    });
    expect(w.orderingDiagnostic).toBe("cutoff_after_publication");
    expect(w.windowEndSource).toBe("cutoff"); // the ladder is unchanged
    expect(w.endDate).toBe("2026-07-25");
  });

  it("malformed claim dates are simply out of the window", () => {
    const w = computeEvaluationWindow({ reportDate: "2026-07-24", cutoffAt: null, publishedAt: null });
    expect(isClaimDateInWindow(w, "2026-02-30")).toBe(false);
    expect(isClaimDateInWindow(w, "yesterday")).toBe(false);
  });

  it("throws typed on a malformed reportDate", () => {
    expect(() =>
      computeEvaluationWindow({ reportDate: "2026-13-01", cutoffAt: null, publishedAt: null }),
    ).toThrowError(ConflictDomainError);
  });
});
