import { describe, expect, it } from "vitest";
import {
  MIN_HELDOUT_CASES_TOTAL,
  QUALITY_GATE_METRICS,
  computeScorecardVerdict,
  type HeldoutCoverage,
  type WorkloadAggregate,
} from "./gates";

const HELD_OK: HeldoutCoverage = { typical: 1, edge: 1, adversarial: 1 };

function agg(overrides: Partial<WorkloadAggregate> = {}): WorkloadAggregate {
  return {
    workload: "map",
    configKey: "gpt-5-mini",
    cases: { total: 10, scored: 10, schemaInvalid: 0, providerError: 0, skipped: 0 },
    checks: { passed: 10, total: 10 },
    machinery: { matched: 0, total: 0 },
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
    live: true,
    repetitions: 1,
    repetitionSpread: {},
    ...overrides,
  };
}

describe("computeScorecardVerdict", () => {
  it("passes a clean candidate that does not regress vs baseline", () => {
    const baseline = agg({ configKey: "gpt-4o-mini", quality: { recallMean: 0.85, precisionMean: 0.95, checksPassRate: 1 } });
    const v = computeScorecardVerdict(agg(), baseline, HELD_OK);
    expect(v.verdict).toBe("pass");
    expect(v.deltas?.recallMean).toBeCloseTo(0.05);
  });

  it("is insufficient_data when any partition has zero heldout cases or totals fall short", () => {
    const v = computeScorecardVerdict(agg(), agg(), { typical: 1, edge: 0, adversarial: 1 });
    expect(v.verdict).toBe("insufficient_data");
    expect(v.reasons.some((r) => r.includes("heldout edge"))).toBe(true);
    expect(MIN_HELDOUT_CASES_TOTAL).toBeGreaterThanOrEqual(3);
  });

  it("is insufficient_data (never pass) without a baseline — candidate-only numbers cannot clear the gate", () => {
    const v = computeScorecardVerdict(agg(), null, HELD_OK);
    expect(v.verdict).toBe("insufficient_data");
    expect(v.deltas).toBeNull();
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
      const v = computeScorecardVerdict(agg({ gate: { ...agg().gate, ...gate } }), agg(), HELD_OK);
      expect(v.verdict, tag).toBe("fail");
      expect(v.reasons.some((r) => r.includes(tag)), tag).toBe(true);
    }
  });

  it("fails on schema-invalid or provider-error outputs", () => {
    const v = computeScorecardVerdict(
      agg({ cases: { total: 10, scored: 9, schemaInvalid: 1, providerError: 0, skipped: 0 } }),
      agg(),
      HELD_OK,
    );
    expect(v.verdict).toBe("fail");
  });

  it("enforces the live metering invariant: attempts == reservations, meterings == attempts - erroredAttempts", () => {
    const bad = computeScorecardVerdict(
      agg({ meter: { attempts: 10, reservations: 9, meterings: 10, erroredAttempts: 0 } }),
      agg(),
      HELD_OK,
    );
    expect(bad.verdict).toBe("fail");
    expect(bad.reasons.some((r) => r.includes("metering invariant"))).toBe(true);

    const okWithError = computeScorecardVerdict(
      agg({ meter: { attempts: 10, reservations: 10, meterings: 9, erroredAttempts: 1 } }),
      agg(),
      HELD_OK,
    );
    expect(okWithError.verdict).toBe("pass");

    const offline = computeScorecardVerdict(
      agg({ live: false, meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 } }),
      agg({ live: false }),
      HELD_OK,
    );
    expect(offline.verdict).toBe("pass");
  });

  it("fails a quality regression below the preset delta — resource savings never rescue it", () => {
    const cheaperButWorse = agg({
      quality: { recallMean: 0.7, precisionMean: 0.95, checksPassRate: 1 },
      resources: { latencyMsMean: 10, promptTokensTotal: 100, completionTokensTotal: 50, estUsdTotal: 0.001 },
    });
    const baseline = agg({ quality: { recallMean: 0.9, precisionMean: 0.95, checksPassRate: 1 } });
    const v = computeScorecardVerdict(cheaperButWorse, baseline, HELD_OK);
    expect(v.verdict).toBe("fail");
    expect(v.reasons.some((r) => r.includes("quality regression: recallMean"))).toBe(true);
  });

  it("every workload has preset quality gate metrics", () => {
    for (const w of ["map", "reduce", "digest", "validation"] as const) {
      expect(QUALITY_GATE_METRICS[w].length).toBeGreaterThan(0);
    }
  });
});
