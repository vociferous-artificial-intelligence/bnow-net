import { describe, expect, it } from "vitest";
import {
  ANALYSIS_APPROVALS,
  ANALYSIS_ROUTING_REGISTRY_VERSION,
  analysisApproval,
  type AnalysisApproval,
} from "./analysis-registry";
import { ANALYSIS_WORKLOADS } from "./model-config";
import { PRICES_PER_MTOK } from "./pricing";

describe("analysis approval registry — seeded baseline", () => {
  it("approves EXACTLY gpt-4o-mini with absent effort, for every workload", () => {
    for (const w of ANALYSIS_WORKLOADS) {
      expect(analysisApproval(w, "gpt-4o-mini", null)).toMatchObject({
        approved: true,
        status: "baseline",
      });
    }
    expect(ANALYSIS_APPROVALS).toHaveLength(ANALYSIS_WORKLOADS.length);
    for (const a of ANALYSIS_APPROVALS) {
      expect(a.model).toBe("gpt-4o-mini");
      expect(a.allowedEfforts).toEqual([null]);
      expect(a.status).toBe("baseline");
      // no fabricated candidate scorecards: every seeded entry is baseline
      // with a real checked-in evidence ref
      expect(a.evidence.ref.length).toBeGreaterThan(0);
      expect(a.evidence.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every seeded approval's model is also priced (dispatch needs BOTH)", () => {
    for (const a of ANALYSIS_APPROVALS) {
      expect(Object.prototype.hasOwnProperty.call(PRICES_PER_MTOK, a.model)).toBe(true);
    }
  });

  it("an effort not in the approval's list is refused — baseline allows absent only", () => {
    const v = analysisApproval("map", "gpt-4o-mini", "low");
    expect(v.approved).toBe(false);
    if (!v.approved) expect(v.reason).toMatch(/not approved for \(map, gpt-4o-mini\)/);
  });

  it("a model unapproved for a workload is refused with the pricing-is-not-approval message", () => {
    const v = analysisApproval("reduce", "gpt-5", null);
    expect(v.approved).toBe(false);
    if (!v.approved) expect(v.reason).toMatch(/pricing alone is not quality approval/);
  });

  it("registry version identity is stamped and stable", () => {
    expect(ANALYSIS_ROUTING_REGISTRY_VERSION).toBe("analysis-reg-v1");
  });
});

describe("analysis approval semantics (injected registry — workload/effort scoping)", () => {
  const SYNTHETIC: readonly AnalysisApproval[] = [
    {
      workload: "reduce",
      model: "gpt-5-mini",
      allowedEfforts: [null, "medium"],
      status: "evaluated_candidate",
      evidence: { ref: "synthetic-test-entry", date: "2026-01-01", note: "test only" },
    },
  ];

  it("approval for one workload does NOT carry to another workload", () => {
    expect(analysisApproval("reduce", "gpt-5-mini", null, SYNTHETIC).approved).toBe(true);
    expect(analysisApproval("map", "gpt-5-mini", null, SYNTHETIC).approved).toBe(false);
    expect(analysisApproval("digest", "gpt-5-mini", null, SYNTHETIC).approved).toBe(false);
  });

  it("an approved effort does NOT authorize a different effort on the same pair", () => {
    expect(analysisApproval("reduce", "gpt-5-mini", "medium", SYNTHETIC).approved).toBe(true);
    expect(analysisApproval("reduce", "gpt-5-mini", "high", SYNTHETIC).approved).toBe(false);
    expect(analysisApproval("reduce", "gpt-5-mini", "low", SYNTHETIC).approved).toBe(false);
  });

  it("an approved model does NOT authorize a different model", () => {
    expect(analysisApproval("reduce", "gpt-5", null, SYNTHETIC).approved).toBe(false);
  });
});
