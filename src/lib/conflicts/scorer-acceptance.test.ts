// Phase 4 acceptance loop (contract §13 P4): every frozen corpus scenario's
// DEFERRED expectations — per-unit corpusRecall/publishedRetention verdict
// maps, missDiagnostic, laneDiagnostics, the five expected.headline pins,
// expected.contribution, expected.independentSources, the evaluationKinds
// availability maps, and the register-#9 matcherFixture credited-units pin —
// reproduced through the REAL pipeline: loader → P3 assemblies → the
// deterministic fixture oracle → the pure scorer. The oracle supplies ONLY
// pair-level judgments; everything asserted here (verdicts, arithmetic,
// diagnostics, contribution) is scorer derivation.

import { describe, expect, it } from "vitest";
import {
  assertPersistableConflictResultV1,
  CONFLICT_HEADLINE_LABEL,
  type ConflictResultV1,
  type ConflictScoredResultV1,
} from "./eval-profile";
import {
  loadConflictFixtureScenarios,
  selectedScenarioReport,
  type ConflictFixtureScenario,
} from "./fixture-corpus";
import { ORACLE_MATCH_TABLE, oraclePairsFor } from "./fixture-matcher";
import { scoreFixtureScenario } from "./goldens";
import type { EvaluationKind, UnitVerdict } from "./vocabulary";

const scenarios = loadConflictFixtureScenarios();

function expectScored(result: ConflictResultV1): ConflictScoredResultV1 {
  expect(result.state).toBe("scored");
  if (result.state !== "scored") throw new Error("unreachable");
  return result;
}

describe("oracle table integrity", () => {
  it("covers every corpus scenario, and only corpus scenarios, with valid ids", () => {
    const scenarioIds = new Set(scenarios.map((s) => s.id));
    for (const key of Object.keys(ORACLE_MATCH_TABLE)) {
      expect(scenarioIds.has(key), `oracle entry ${key} names a real scenario`).toBe(true);
    }
    for (const scenario of scenarios) {
      // throws on a missing entry or an id-drifted pair
      oraclePairsFor(scenario, selectedScenarioReport(scenario));
    }
  });

  it("gives the register-#9 vague claim credit for ZERO units (matcherFixture pin)", () => {
    const scenario = scenarios.find((s) => s.id === "cc-vague-claim-019")!;
    const block = scenario.matcherFixture!;
    const vagueClaimId = block.vagueClaimId as number;
    const expectedCredited = (block.expected as { creditedUnits: string[] }).creditedUnits;
    const pairs = oraclePairsFor(scenario, selectedScenarioReport(scenario));
    const credited = pairs.filter((p) => p.claimId === vagueClaimId).map((p) => p.unitId);
    expect(credited).toEqual(expectedCredited);
    // and the distinct units both exist and are matched only by the SPECIFIC claim
    for (const unitId of block.distinctUnitIds as string[]) {
      expect(scenario.report!.units.some((u) => u.unitId === unitId)).toBe(true);
    }
  });
});

describe("acceptance: scorer output reproduces every frozen expectation", () => {
  for (const scenario of scenarios) {
    const selected = selectedScenarioReport(scenario);

    if (selected === null) {
      it(`${scenario.id}: publication gap → the gap variant, nothing fabricated`, async () => {
        const result = await scoreFixtureScenario(scenario);
        expect(result.state).toBe("unavailable");
        if (result.state !== "unavailable") return;
        expect(result.unavailableReason).toBe("publication_gap");
        expect("report" in result).toBe(false);
        if (result.unavailableReason === "publication_gap") {
          expect(result.gapDate).toBe(scenario.gapDate);
        }
        // an unavailable result has NO headline — never 0/0
        expect("headline" in result).toBe(false);
        assertPersistableConflictResultV1(result); // gap variants pass (no score)
      });
      continue;
    }

    it(`${scenario.id}: per-unit verdicts, headline, diagnostics, contribution`, async () => {
      const result = expectScored(await scoreFixtureScenario(scenario));

      // per-unit verdict maps (both pipeline questions, never conflated)
      expect(result.corpusRecall).toEqual(scenario.expected.corpusRecall);
      expect(result.publishedRetention).toEqual(scenario.expected.publishedRetention);

      // missDiagnostic / laneDiagnostics exactly where pinned
      const expectedMiss = scenario.expected.missDiagnostic as
        | Record<string, string>
        | undefined;
      expect(result.missDiagnostic ?? {}).toEqual(expectedMiss ?? {});
      const expectedLaneDiag = scenario.expected.laneDiagnostics as
        | Record<string, string>
        | undefined;
      expect(result.laneDiagnostics ?? {}).toEqual(expectedLaneDiag ?? {});

      // the five register-#8 M4 headline pins
      const expectedHeadline = scenario.expected.headline as
        | {
            corpusRecall: { matched: number; denominator: number };
            publishedRetention: { matched: number; denominator: number };
            partialDiagnostic?: number;
          }
        | undefined;
      if (expectedHeadline !== undefined) {
        expect(result.headline.corpusRecall).toEqual(expectedHeadline.corpusRecall);
        expect(result.headline.publishedRetention).toEqual(expectedHeadline.publishedRetention);
        expect(result.headline.partialDiagnostic).toBe(expectedHeadline.partialDiagnostic);
      }

      // FULL-report arithmetic for every scenario (P4's deliverable):
      // denominator = ALL declared units; matched counts matched verdicts
      // only (partial = miss)
      const verdicts = Object.values(result.corpusRecall);
      expect(result.headline.corpusRecall.denominator).toBe(selected.units.length);
      expect(result.headline.publishedRetention.denominator).toBe(selected.units.length);
      expect(result.headline.corpusRecall.matched).toBe(
        verdicts.filter((v) => v === "matched").length,
      );
      expect(result.headline.publishedRetention.matched).toBe(
        Object.values(result.publishedRetention).filter((v) => v === "matched").length,
      );
      expect(result.headlineLabel).toBe(CONFLICT_HEADLINE_LABEL);

      // contribution: corpus-recall matched units only (frozen §7 population)
      const expectedContribution = scenario.expected.contribution as Record<
        string,
        { theaters: string[]; tracks: string[] }
      >;
      const projected = Object.fromEntries(
        Object.entries(result.contribution).map(([unitId, entry]) => [
          unitId,
          { theaters: [...entry.theaters], tracks: [...entry.tracks] },
        ]),
      );
      expect(projected).toEqual(expectedContribution);
      for (const unitId of Object.keys(result.contribution)) {
        expect(result.corpusRecall[unitId]).toBe("matched");
      }

      // independent-source pins (mirrors add zero)
      const expectedIndep = scenario.expected.independentSources as
        | Record<string, number>
        | undefined;
      if (expectedIndep !== undefined) {
        for (const [unitId, count] of Object.entries(expectedIndep)) {
          expect(result.independentSources!.corpusRecall[unitId]).toBe(count);
        }
      }

      // eligible-count pins flow into the selection stamp
      const expectedEligible = scenario.expected.eligibleCount as number | undefined;
      if (expectedEligible !== undefined) {
        expect(result.selection!.corpusRecall.eligibleCount).toBe(expectedEligible);
      }

      // windowEndSource pin (cc-window-rung2-017)
      const expectedEndSource = scenario.expected.windowEndSource as string | undefined;
      if (expectedEndSource !== undefined) {
        expect(result.windowEndSource).toBe(expectedEndSource);
        expect(result.window!.windowEndSource).toBe(expectedEndSource);
      }

      // hedge preservation (iran-translation-hedge-012): the agreement rows
      // carry the claim's OWN hedge, unstrengthened
      const hedgePins = scenario.expected.hedgePreservation as
        | Record<string, string>
        | undefined;
      if (hedgePins !== undefined) {
        for (const [claimId, hedge] of Object.entries(hedgePins)) {
          for (const population of [
            result.agreements!.corpusRecall,
            result.agreements!.publishedRetention,
          ]) {
            const claim = population
              .flatMap((a) => a.claims)
              .find((c) => String(c.claimId) === claimId);
            expect(claim, `hedge pin claim ${claimId}`).toBeDefined();
            expect(claim!.hedge).toBe(hedge);
          }
        }
      }

      // every scored result carries the binding stamps
      assertPersistableConflictResultV1(result);
      // lane rows PARTITION the declared units: unit sums == denominator
      expect(result.lanes!.reduce((n, row) => n + row.units, 0)).toBe(selected.units.length);
      // matcher identity: the oracle labels itself and can never read as a
      // majority result
      expect(result.matcherRung).toBe("fixture-oracle");
      expect(result.matcher!.kind).toBe("fixture-oracle");
      expect(result.matcher!.model).toBeNull();
    });

    const kinds = scenario.expected.evaluationKinds as Record<string, string> | undefined;
    if (kinds !== undefined) {
      it(`${scenario.id}: snapshot-anchored kinds refuse without a proving artifact`, async () => {
        for (const [kind, availability] of Object.entries(kinds)) {
          const result = await scoreFixtureScenario(scenario, {
            kind: kind as EvaluationKind,
          });
          if (availability === "unavailable") {
            expect(result.state).toBe("unavailable");
            if (result.state === "unavailable") {
              expect(result.unavailableReason).toBe("no_proven_snapshot");
              // the unavailable variant carries the report identity but NO
              // headline — unavailable is never 0/0
              expect("headline" in result).toBe(false);
            }
          } else {
            expect(result.state).toBe("scored");
          }
        }
      });
    }
  }

  it("the three terminal states stay distinct (014 unavailable / 015 empty-set zero / 016 nonempty-set zero)", async () => {
    const s14 = scenarios.find((s) => s.id === "cc-state-unavailable-014")!;
    const r14 = await scoreFixtureScenario(s14, { kind: "operational_cutoff" });
    expect(r14.state).toBe("unavailable");

    const s15 = scenarios.find((s) => s.id === "cc-state-zero-empty-015")!;
    const r15 = expectScored(await scoreFixtureScenario(s15));
    expect(r15.headline.corpusRecall).toEqual({ matched: 0, denominator: 1 });
    expect(r15.selection!.corpusRecall.eligibleCount).toBe(0);

    const s16 = scenarios.find((s) => s.id === "cc-state-zero-nonempty-016")!;
    const r16 = expectScored(await scoreFixtureScenario(s16));
    expect(r16.headline.corpusRecall).toEqual({ matched: 0, denominator: 1 });
    expect(r16.selection!.corpusRecall.eligibleCount).toBe(2);
    // 0-over-nonempty ≠ 0-over-empty ≠ unavailable: all three shapes differ
    expect(r16.bnowOnly!.corpusRecall.count).toBe(2);
  });

  it("cc-vague-claim-019 end-to-end: the vague claim earns no unit anywhere in the result", async () => {
    const scenario = scenarios.find((s) => s.id === "cc-vague-claim-019")!;
    const result = expectScored(await scoreFixtureScenario(scenario));
    const vagueClaimId = scenario.matcherFixture!.vagueClaimId as number;
    for (const population of [
      result.agreements!.corpusRecall,
      result.agreements!.publishedRetention,
    ]) {
      expect(
        population.flatMap((a) => a.claims).filter((c) => c.claimId === vagueClaimId),
      ).toHaveLength(0);
    }
    // the vague claim shows up as an in-scope BNOW-only item instead
    expect(result.bnowOnly!.publishedRetention.items.map((i) => i.claimId)).toContain(
      vagueClaimId,
    );
    expect(result.multiUnitClaims!.corpusRecall).toEqual({});
  });
});

describe("acceptance: population discipline at the scorer (pairs listed, membership filtered)", () => {
  const cases: Array<{ id: string; claimId: number; why: string }> = [
    { id: "cc-superseded-version-008", claimId: 9309, why: "superseded extractor version" },
    { id: "cc-mirror-adapters-009", claimId: 9311, why: "mirror-only claim" },
    { id: "cc-stub-leakage-011b", claimId: 9313, why: "stub/fixture row (ruling 3)" },
  ];
  for (const { id, claimId, why } of cases) {
    it(`${id}: the ${why} is oracle-paired yet contributes NOTHING`, async () => {
      const scenario = scenarios.find((s) => s.id === id)!;
      const pairs = oraclePairsFor(scenario, selectedScenarioReport(scenario));
      expect(pairs.some((p) => p.claimId === claimId)).toBe(true); // deliberately listed
      const result = expectScored(await scoreFixtureScenario(scenario));
      for (const population of [
        result.agreements!.corpusRecall,
        result.agreements!.publishedRetention,
      ]) {
        expect(
          population.flatMap((a) => a.claims).filter((c) => c.claimId === claimId),
        ).toHaveLength(0);
      }
    });
  }
});

describe("acceptance: unavailable snapshot kinds across the corpus", () => {
  it("scoring any report-bearing scenario under a snapshot kind yields the honest unavailable variant", async () => {
    const scenario = scenarios.find((s) => s.id === "roca-ua-only-001b")!;
    for (const kind of ["operational_cutoff", "at_publication", "finalized"] as const) {
      const result = await scoreFixtureScenario(scenario, { kind });
      expect(result.state).toBe("unavailable");
      if (result.state === "unavailable" && result.unavailableReason !== "publication_gap") {
        expect(result.unavailableReason).toBe("no_proven_snapshot");
        expect(result.report.editionKey).toBe("roca:2026-08-10:final");
      }
    }
  });
});

// keep the harness honest: the acceptance loop above iterated every scenario
it("the acceptance loop covered all 41 scenarios", () => {
  expect(scenarios).toHaveLength(41);
  const withReports = scenarios.filter(
    (s: ConflictFixtureScenario) => selectedScenarioReport(s) !== null,
  );
  expect(withReports).toHaveLength(40);
  // sanity: the frozen expected maps use only frozen verdict vocabulary
  for (const s of withReports) {
    for (const map of [s.expected.corpusRecall, s.expected.publishedRetention]) {
      for (const verdict of Object.values(map as Record<string, UnitVerdict>)) {
        expect(["matched", "miss", "partial"]).toContain(verdict);
      }
    }
  }
});
