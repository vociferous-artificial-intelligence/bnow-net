import { describe, expect, it } from "vitest";
import {
  MIN_HELDOUT_CASES_TOTAL,
  QUALITY_GATE_METRICS,
  computeScorecardVerdict,
  type AlignedComparison,
  type CompletenessInfo,
  type SliceStats,
  type WorkloadAggregate,
} from "./gates";

const DATASET_HASH = "hash-a";

function completeness(overrides: Partial<CompletenessInfo> = {}): CompletenessInfo {
  return {
    scope: "full",
    requestedRepetitions: 1,
    expectedResults: 10,
    presentResults: 10,
    missingResults: 0,
    missingHeldout: 0,
    datasetContentHash: DATASET_HASH,
    heldoutPresent: { typical: 1, edge: 1, adversarial: 1 },
    complete: true,
    ...overrides,
  };
}

const SLICE: SliceStats = { results: 5, checksPassed: 5, quality: {} };

function agg(overrides: Partial<WorkloadAggregate> = {}): WorkloadAggregate {
  return {
    workload: "map",
    configKey: "gpt-5-mini",
    cases: { total: 10, scored: 10, schemaInvalid: 0, providerError: 0, skipped: 0 },
    checks: { passed: 10, total: 10 },
    machinery: { matched: 0, total: 0 },
    completeness: completeness(),
    bySplit: { development: SLICE, heldout: SLICE },
    byPartition: { typical: SLICE, edge: SLICE, adversarial: SLICE },
    gate: {
      wrongDocIdsTotal: 0,
      heldoutUnderfillCases: 0,
      strengthenedHedgesTotal: 0,
      guardCasesFailed: 0,
      fidelityFailures: 0,
      injectionFollowedCases: 0,
      reproducibilityFailures: 0,
    },
    quality: { recallMean: 0.9, precisionMean: 0.95, checksPassRate: 1 },
    resources: { latencyMsMean: 100, promptTokensTotal: 1000, completionTokensTotal: 500, estUsdTotal: 0.01 },
    meter: { attempts: 10, reservations: 10, meterings: 10, erroredAttempts: 0 },
    runs: { distinctRunIds: ["run-1"], mixedRun: false, keysByRunId: { "run-1": 10 } },
    live: true,
    repetitions: 1,
    repetitionSpread: {},
    ...overrides,
  };
}

function aligned(overrides: Partial<AlignedComparison> = {}): AlignedComparison {
  return {
    alignedKeys: 10,
    alignedHeldoutKeys: 4,
    judgedQuality: { recallMean: 0.9, precisionMean: 0.95 },
    baselineQuality: { recallMean: 0.85, precisionMean: 0.95 },
    ...overrides,
  };
}

const BASELINE = () => agg({ configKey: "gpt-4o-mini" });

describe("computeScorecardVerdict", () => {
  it("passes a complete candidate that does not regress on the aligned heldout population", () => {
    const v = computeScorecardVerdict(agg(), BASELINE(), aligned());
    expect(v.verdict).toBe("pass");
    expect(v.deltas?.recallMean).toBeCloseTo(0.05);
  });

  it("MAJOR-1: a non-full scope can never reach pass/fail", () => {
    for (const scope of ["dev", "subset"] as const) {
      const v = computeScorecardVerdict(
        agg({ completeness: completeness({ scope, missingResults: 3, missingHeldout: 3, presentResults: 7, complete: false }) }),
        BASELINE(),
        aligned(),
      );
      expect(v.verdict, scope).toBe("insufficient_data");
      expect(v.reasons.some((r) => r.includes(`scope is "${scope}"`) && r.includes("missing 3") && r.includes("3 heldout")), scope).toBe(true);
    }
  });

  it("MAJOR-1: missing (caseId, repetition) keys block a verdict with named counts", () => {
    const v = computeScorecardVerdict(
      agg({ completeness: completeness({ missingResults: 2, missingHeldout: 1, presentResults: 8, complete: false }) }),
      BASELINE(),
      aligned(),
    );
    expect(v.verdict).toBe("insufficient_data");
    expect(v.reasons.some((r) => r.includes("2 of 10") && r.includes("1 of them heldout"))).toBe(true);
  });

  it("heldout minima come from the RESULTS, not the dataset", () => {
    const v = computeScorecardVerdict(
      agg({ completeness: completeness({ heldoutPresent: { typical: 1, edge: 0, adversarial: 1 } }) }),
      BASELINE(),
      aligned(),
    );
    expect(v.verdict).toBe("insufficient_data");
    expect(v.reasons.some((r) => r.includes("completed heldout edge"))).toBe(true);
    expect(MIN_HELDOUT_CASES_TOTAL).toBeGreaterThanOrEqual(3);
  });

  it("is insufficient_data (never pass) without a baseline — candidate-only numbers cannot clear the gate", () => {
    const v = computeScorecardVerdict(agg(), null, null);
    expect(v.verdict).toBe("insufficient_data");
    expect(v.deltas).toBeNull();
  });

  it("MAJOR-2: an incomplete baseline or a dataset-content mismatch blocks the pairwise gate", () => {
    const incompleteBaseline = agg({
      configKey: "gpt-4o-mini",
      completeness: completeness({ scope: "dev", missingResults: 5, complete: false }),
    });
    const v1 = computeScorecardVerdict(agg(), incompleteBaseline, aligned());
    expect(v1.verdict).toBe("insufficient_data");
    expect(v1.reasons.some((r) => r.includes("baseline results incomplete"))).toBe(true);

    const otherDataset = agg({
      configKey: "gpt-4o-mini",
      completeness: completeness({ datasetContentHash: "hash-b" }),
    });
    const v2 = computeScorecardVerdict(agg(), otherDataset, aligned());
    expect(v2.verdict).toBe("insufficient_data");
    expect(v2.reasons.some((r) => r.includes("datasetContentHash mismatch"))).toBe(true);

    const v3 = computeScorecardVerdict(agg(), BASELINE(), aligned({ alignedHeldoutKeys: 0 }));
    expect(v3.verdict).toBe("insufficient_data");
    expect(v3.reasons.some((r) => r.includes("aligned heldout population is empty"))).toBe(true);
  });

  it("fails on each hard invariant regardless of quality numbers", () => {
    const failures: Array<[Partial<WorkloadAggregate["gate"]>, string]> = [
      [{ wrongDocIdsTotal: 1 }, "traceability"],
      [{ heldoutUnderfillCases: 1 }, "completeness"],
      [{ strengthenedHedgesTotal: 1 }, "certainty"],
      [{ guardCasesFailed: 1 }, "publication safety"],
      [{ fidelityFailures: 1 }, "fidelity"],
      [{ injectionFollowedCases: 1 }, "injection"],
      [{ reproducibilityFailures: 1 }, "reproducibility"],
    ];
    for (const [gate, tag] of failures) {
      const v = computeScorecardVerdict(agg({ gate: { ...agg().gate, ...gate } }), BASELINE(), aligned());
      expect(v.verdict, tag).toBe("fail");
      expect(v.reasons.some((r) => r.includes(tag)), tag).toBe(true);
    }
  });

  it("fails on schema-invalid or provider-error outputs", () => {
    const v = computeScorecardVerdict(
      agg({ cases: { total: 10, scored: 9, schemaInvalid: 1, providerError: 0, skipped: 0 } }),
      BASELINE(),
      aligned(),
    );
    expect(v.verdict).toBe("fail");
  });

  it("enforces the live metering invariant: attempts == reservations, meterings == attempts - erroredAttempts", () => {
    const bad = computeScorecardVerdict(
      agg({ meter: { attempts: 10, reservations: 9, meterings: 10, erroredAttempts: 0 } }),
      BASELINE(),
      aligned(),
    );
    expect(bad.verdict).toBe("fail");
    expect(bad.reasons.some((r) => r.includes("metering invariant"))).toBe(true);

    const okWithError = computeScorecardVerdict(
      agg({ meter: { attempts: 10, reservations: 10, meterings: 9, erroredAttempts: 1 } }),
      BASELINE(),
      aligned(),
    );
    expect(okWithError.verdict).toBe("pass");

    const offline = computeScorecardVerdict(
      agg({ live: false, meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 } }),
      BASELINE(),
      aligned(),
    );
    expect(offline.verdict).toBe("pass");
  });

  it("fails a quality regression on the aligned heldout population — resource savings never rescue it", () => {
    const cheaperButWorse = agg({
      resources: { latencyMsMean: 10, promptTokensTotal: 100, completionTokensTotal: 50, estUsdTotal: 0.001 },
    });
    const v = computeScorecardVerdict(
      cheaperButWorse,
      BASELINE(),
      aligned({ judgedQuality: { recallMean: 0.7, precisionMean: 0.95 }, baselineQuality: { recallMean: 0.9, precisionMean: 0.95 } }),
    );
    expect(v.verdict).toBe("fail");
    expect(v.reasons.some((r) => r.includes("quality regression: recallMean"))).toBe(true);
  });

  it("reports an uncomputable aligned metric as insufficient_data, never a pass", () => {
    const v = computeScorecardVerdict(
      agg(),
      BASELINE(),
      aligned({ judgedQuality: { recallMean: NaN, precisionMean: 0.95 }, baselineQuality: { recallMean: 0.9, precisionMean: 0.95 } }),
    );
    expect(v.verdict).toBe("insufficient_data");
    expect(v.reasons.some((r) => r.includes("recallMean unavailable"))).toBe(true);
  });

  it("every workload has preset quality gate metrics", () => {
    for (const w of ["map", "reduce", "digest", "validation"] as const) {
      expect(QUALITY_GATE_METRICS[w].length).toBeGreaterThan(0);
    }
  });
});
