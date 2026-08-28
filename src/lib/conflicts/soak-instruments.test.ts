import { describe, expect, it } from "vitest";
import {
  FALSE_AGREEMENT_MAX,
  UPSTREAM_FALSE_EXCLUSION_MAX,
  KAPPA_FLOOR,
  MISS_DROP_STAGES,
  ciHalfWidth,
  cohensKappa,
  gradeMatcher,
  missSearchSample,
  requiredN,
  seededShuffle,
  stratifiedLabelSample,
  type HumanLabel,
  type SampleableUnitOutcome,
} from "./soak-instruments";

function outcomes(nMatch: number, nMiss: number, nOther: number): SampleableUnitOutcome[] {
  const out: SampleableUnitOutcome[] = [];
  for (let i = 0; i < nMatch; i++) {
    out.push({ unitId: `m-${String(i).padStart(3, "0")}`, verdict: "match", topCandidateClaimId: 1000 + i });
  }
  for (let i = 0; i < nMiss; i++) {
    out.push({ unitId: `x-${String(i).padStart(3, "0")}`, verdict: "miss", topCandidateClaimId: null });
  }
  for (let i = 0; i < nOther; i++) {
    out.push({ unitId: `u-${String(i).padStart(3, "0")}`, verdict: "unmatchable", topCandidateClaimId: null });
  }
  return out;
}

describe("seeded sampling (soak §5 — reproducible, uncurateable)", () => {
  it("identical seed → identical sample; different seed → different order", () => {
    const pool = outcomes(60, 60, 30);
    const a = stratifiedLabelSample(pool, "soak-2026-09-seed-1");
    const b = stratifiedLabelSample(pool, "soak-2026-09-seed-1");
    const c = stratifiedLabelSample(pool, "soak-2026-09-seed-2");
    expect(a).toEqual(b);
    expect(a.pairs.map((p) => p.unitId)).not.toEqual(c.pairs.map((p) => p.unitId));
  });

  it("input ORDER cannot influence the sample (sorted before shuffling)", () => {
    const pool = outcomes(60, 60, 30);
    const reversed = [...pool].reverse();
    expect(stratifiedLabelSample(pool, "s")).toEqual(stratifiedLabelSample(reversed, "s"));
  });

  it("stratifies 40/40/40 with no unit reused across strata", () => {
    const s = stratifiedLabelSample(outcomes(60, 60, 60), "s");
    expect(s.pairs).toHaveLength(120);
    expect(s.shortfalls).toEqual([]);
    const byStratum = new Map<string, number>();
    for (const p of s.pairs) byStratum.set(p.stratum, (byStratum.get(p.stratum) ?? 0) + 1);
    expect(byStratum.get("matcher-match")).toBe(40);
    expect(byStratum.get("matcher-miss")).toBe(40);
    expect(byStratum.get("random-declared")).toBe(40);
    expect(new Set(s.pairs.map((p) => p.unitId)).size).toBe(120);
  });

  it("records shortfalls instead of padding when a stratum is small", () => {
    const s = stratifiedLabelSample(outcomes(10, 60, 60), "s");
    expect(s.shortfalls).toEqual([{ stratum: "matcher-match", wanted: 40, got: 10 }]);
  });

  it("miss sample (§5.1) draws only misses, deterministically, with shortfall recorded", () => {
    const pool = outcomes(50, 20, 50);
    const s = missSearchSample(pool, "s");
    expect(s.unitIds.every((id) => id.startsWith("x-"))).toBe(true);
    expect(s.unitIds).toHaveLength(20);
    expect(s.shortfall).toBe(10);
    expect(missSearchSample(pool, "s")).toEqual(s);
    expect(MISS_DROP_STAGES).toContain("genuinely_absent");
  });

  it("seededShuffle is a permutation", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect([...seededShuffle(xs, "k")].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe("Cohen's κ + matcher grading (soak §5)", () => {
  it("computes the textbook value on a hand-checked example", () => {
    // 20 pairs: agree-yes 9, agree-no 7, A-yes/B-no 1, A-no/B-yes 3
    const a = [...Array(9).fill(true), ...Array(7).fill(false), true, false, false, false];
    const b = [...Array(9).fill(true), ...Array(7).fill(false), false, true, true, true];
    // po = 16/20 = 0.8; pA=10/20, pB=12/20 -> pe = 0.5*0.6 + 0.5*0.4 = 0.5
    expect(cohensKappa(a, b)).toBeCloseTo((0.8 - 0.5) / 0.5, 10);
  });

  it("degenerate marginals (both labellers constant) yield null — no reliability evidence", () => {
    expect(cohensKappa([true, true], [true, true])).toBeNull();
    expect(cohensKappa([false, false, false], [false, false, false])).toBeNull();
  });

  it("below the κ floor the ONLY verdict is label_quality_failed — nothing graded", () => {
    const pool = outcomes(40, 40, 40);
    const sample = stratifiedLabelSample(pool, "s");
    const primary: HumanLabel[] = sample.pairs.map((p, i) => ({
      unitId: p.unitId,
      claimId: p.claimId,
      isMatch: i % 2 === 0,
    }));
    // secondary disagrees on most of a 30-pair overlap -> κ far below 0.70
    const overlap = primary.slice(0, 30).map((l, i) => ({ ...l, isMatch: i % 4 === 0 ? l.isMatch : !l.isMatch }));
    const grade = gradeMatcher(sample, pool, primary, overlap);
    expect(grade.verdict).toBe("label_quality_failed");
    expect(grade.kappa).not.toBeNull();
    expect(grade.kappa!).toBeLessThan(KAPPA_FLOOR);
    expect(grade.precision).toBeNull();
  });

  it("grades precision/recall/false-agreement against the frozen thresholds", () => {
    const pool: SampleableUnitOutcome[] = [
      // 8 matcher matches: 7 humans confirm, 1 refuted
      ...Array.from({ length: 7 }, (_, i) => ({ unitId: `tp-${i}`, verdict: "match" as const, topCandidateClaimId: i })),
      { unitId: "fp-0", verdict: "match", topCandidateClaimId: 99 },
      // 4 matcher misses: 1 was actually a match (fn), 3 true negatives
      { unitId: "fn-0", verdict: "miss", topCandidateClaimId: null },
      ...Array.from({ length: 3 }, (_, i) => ({ unitId: `tn-${i}`, verdict: "miss" as const, topCandidateClaimId: null })),
      // negative/quiet-day units: 2, one of them a false agreement
      { unitId: "neg-0", verdict: "match", topCandidateClaimId: 5, negativeOrQuietDay: true },
      { unitId: "neg-1", verdict: "miss", topCandidateClaimId: null, negativeOrQuietDay: true },
    ];
    const sample = stratifiedLabelSample(pool, "s", 40);
    const primary: HumanLabel[] = pool.map((o) => ({
      unitId: o.unitId,
      claimId: o.topCandidateClaimId,
      isMatch: o.unitId.startsWith("tp-") || o.unitId === "fn-0",
    }));
    // overlap with MIXED marginals (identical labels -> κ = 1, non-degenerate)
    const secondary = primary.filter((l) =>
      ["tp-0", "tp-1", "tn-0", "tn-1", "fn-0"].includes(l.unitId),
    );
    const grade = gradeMatcher(sample, pool, primary, secondary);
    expect(grade.verdict).toBe("graded");
    expect(grade.confusion).toEqual({ tp: 7, fp: 2, fn: 1, tn: 4 });
    expect(grade.precision).toBeCloseTo(7 / 9, 10);
    expect(grade.recall).toBeCloseTo(7 / 8, 10);
    expect(grade.falseAgreementRate).toBeCloseTo(1 / 2, 10);
    expect(grade.thresholds.precisionOk).toBe(false); // 0.78 < 0.90
    expect(grade.thresholds.recallOk).toBe(true); // 0.875 >= 0.75
    expect(grade.thresholds.falseAgreementOk).toBe(false); // 0.5 > 0.02
    expect(grade.kappa).toBe(1);
    expect(grade.kappaPairs).toBe(5);
    expect(grade.labelledPairs).toBe(14); // 7 tp + fp-0 + fn-0 + 3 tn + 2 neg
    expect(grade.labelClaimMismatches).toBe(0);
    expect(FALSE_AGREEMENT_MAX).toBe(0.02);
    expect(UPSTREAM_FALSE_EXCLUSION_MAX).toBe(0.1);
  });

  it("no overlap at all is its own verdict — never a silent pass", () => {
    const pool = outcomes(10, 10, 5);
    const sample = stratifiedLabelSample(pool, "s", 10);
    const primary: HumanLabel[] = sample.pairs.map((p) => ({ unitId: p.unitId, claimId: p.claimId, isMatch: true }));
    expect(gradeMatcher(sample, pool, primary, null).verdict).toBe("ungraded_no_overlap");
    expect(gradeMatcher(sample, pool, primary, []).verdict).toBe("ungraded_no_overlap");
  });

  it("a label judged against a DIFFERENT claim than sampled is excluded and counted", () => {
    const pool: SampleableUnitOutcome[] = [
      { unitId: "a", verdict: "match", topCandidateClaimId: 1 },
      { unitId: "b", verdict: "match", topCandidateClaimId: 2 },
      { unitId: "c", verdict: "miss", topCandidateClaimId: null },
    ];
    const sample = stratifiedLabelSample(pool, "s", 5);
    const primary: HumanLabel[] = [
      { unitId: "a", claimId: 999, isMatch: true }, // wrong claim -> excluded
      { unitId: "b", claimId: 2, isMatch: true },
      { unitId: "c", claimId: null, isMatch: false },
    ];
    const overlap = [
      { unitId: "b", claimId: 2, isMatch: true },
      { unitId: "c", claimId: null, isMatch: false },
    ];
    const grade = gradeMatcher(sample, pool, primary, overlap);
    expect(grade.verdict).toBe("graded");
    expect(grade.labelClaimMismatches).toBe(1);
    expect(grade.confusion.tp).toBe(1);
    expect(grade.labelledPairs).toBe(2);
  });

  it("partial verdicts grade as a separate denominator-neutral diagnostic (register #12.3 pending)", () => {
    const pool: SampleableUnitOutcome[] = [
      { unitId: "p-0", verdict: "partial", topCandidateClaimId: 7 },
      { unitId: "m-0", verdict: "match", topCandidateClaimId: 8 },
      { unitId: "x-0", verdict: "miss", topCandidateClaimId: null },
    ];
    const sample = stratifiedLabelSample(pool, "s", 5);
    // partial excluded from both deliberate strata; eligible via random
    const strata = new Map(sample.pairs.map((p) => [p.unitId, p.stratum]));
    expect(strata.get("p-0")).toBe("random-declared");
    const primary: HumanLabel[] = [
      { unitId: "p-0", claimId: 7, isMatch: false },
      { unitId: "m-0", claimId: 8, isMatch: true },
      { unitId: "x-0", claimId: null, isMatch: false },
    ];
    const overlap = primary.slice(1); // mixed marginals, identical -> κ=1
    const grade = gradeMatcher(sample, pool, primary, overlap);
    expect(grade.verdict).toBe("graded");
    expect(grade.partialDiagnostic).toEqual({ pairs: 1, humanConfirmed: 0, negativePairs: 0, negativeHumanConfirmed: 0 });
    expect(grade.confusion).toEqual({ tp: 1, fp: 0, fn: 0, tn: 1 }); // partial NOT folded
  });

  it("a verdict that drifted between sampling and grading is excluded and counted", () => {
    const atSample: SampleableUnitOutcome[] = [
      { unitId: "a", verdict: "match", topCandidateClaimId: 1 },
      { unitId: "b", verdict: "match", topCandidateClaimId: 2 },
      { unitId: "c", verdict: "miss", topCandidateClaimId: null },
    ];
    const sample = stratifiedLabelSample(atSample, "s", 5);
    // by grading time, a compound re-derivation flipped "a" match -> partial
    const atGrade: SampleableUnitOutcome[] = [
      { unitId: "a", verdict: "partial", topCandidateClaimId: 1 },
      atSample[1],
      atSample[2],
    ];
    const primary: HumanLabel[] = [
      { unitId: "a", claimId: 1, isMatch: true },
      { unitId: "b", claimId: 2, isMatch: true },
      { unitId: "c", claimId: null, isMatch: false },
    ];
    const overlap = primary.slice(1); // mixed marginals, identical -> kappa 1
    const grade = gradeMatcher(sample, atGrade, primary, overlap);
    expect(grade.verdictDriftMismatches).toBe(1);
    expect(grade.confusion).toEqual({ tp: 1, fp: 0, fn: 0, tn: 1 }); // "a" never regraded
    expect(grade.partialDiagnostic.pairs).toBe(0);
  });

  it("duplicate unitIds throw everywhere (two-population unions must be resolved by the caller)", () => {
    const dup: SampleableUnitOutcome[] = [
      { unitId: "d", verdict: "match", topCandidateClaimId: 1 },
      { unitId: "d", verdict: "miss", topCandidateClaimId: null },
    ];
    expect(() => stratifiedLabelSample(dup, "s")).toThrow(/duplicate unitId/);
    expect(() => missSearchSample(dup, "s")).toThrow(/duplicate unitId/);
    const sample = stratifiedLabelSample([dup[0]], "s", 1);
    expect(() => gradeMatcher(sample, dup, [], null)).toThrow(/duplicate unitId/);
  });
});

describe("R-M-6 power sizing", () => {
  it("reproduces the audit's own numbers: n=40 at p=0.9 is underpowered", () => {
    expect(ciHalfWidth(0.9, 40)).toBeCloseTo(0.093, 3); // ±9.3pp
    expect(1 / 40).toBe(0.025); // one miscall ≈ 2.5pp
    // resolving 0.90 within ±3pp needs ~385 pairs; ±5pp ~139
    expect(requiredN(0.9, 0.03)).toBe(385);
    expect(requiredN(0.9, 0.05)).toBe(139);
  });
});
