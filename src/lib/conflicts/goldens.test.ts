// Committed golden expected-results for the frozen fixture corpus (contract
// §13 P4: "golden results for both conflicts, including lane and
// contribution totals"; prompt §12).
//
// The golden file fixtures/conflicts/goldens/golden-results-v1.json is
// COMMITTED and BYTE-STABLE: this test regenerates every golden result
// through the real pipeline (loader → P3 assemblies → fixture oracle / the
// vote-variant live-compatible adapter → the pure scorer), canonicalizes via
// the fail-closed Phase-1 stableStringify, and byte-compares against the
// committed file. ANY scorer/assembler/oracle drift is a failing
// byte-compare — never a silent re-baseline. Deliberate re-baselining is the
// explicit operator step
//   UPDATE_CONFLICT_GOLDENS=1 npx vitest run src/lib/conflicts/goldens.test.ts
// followed by a reviewed diff of the golden file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConflictResultV1 } from "./eval-profile";
import { loadConflictFixtureScenarios } from "./fixture-corpus";
import {
  computeGoldenResults,
  goldenBytes,
  GOLDEN_LADDER_SCENARIO_ID,
  GOLDEN_RESULTS_FILE,
  GOLDEN_SCENARIO_IDS,
} from "./goldens";

const scenarios = loadConflictFixtureScenarios();
const goldenPath = join(process.cwd(), GOLDEN_RESULTS_FILE);

async function regenerate(): Promise<{ results: Record<string, ConflictResultV1>; bytes: string }> {
  const results = await computeGoldenResults(scenarios);
  return { results, bytes: goldenBytes(results) };
}

describe("committed golden results (byte-stable)", () => {
  it("regenerating the goldens reproduces the committed file BYTE-FOR-BYTE", async () => {
    const { bytes } = await regenerate();
    if (process.env.UPDATE_CONFLICT_GOLDENS === "1") {
      mkdirSync(dirname(goldenPath), { recursive: true });
      writeFileSync(goldenPath, bytes, "utf8");
    }
    expect(
      existsSync(goldenPath),
      `missing ${GOLDEN_RESULTS_FILE} — generate it with UPDATE_CONFLICT_GOLDENS=1 npx vitest run src/lib/conflicts/goldens.test.ts and review the diff`,
    ).toBe(true);
    const committed = readFileSync(goldenPath, "utf8");
    expect(bytes).toBe(committed);
  });

  it("golden generation is deterministic: two independent runs produce identical bytes", async () => {
    const [a, b] = [await regenerate(), await regenerate()];
    expect(a.bytes).toBe(b.bytes);
  });

  it("the golden set covers the mandated matrix (both conflicts, gap, gulf lane, compound-partial, retention gap, quiet day, ladder, the five headline pins)", async () => {
    const { results } = await regenerate();
    const keys = Object.keys(results).sort();
    expect(keys).toEqual(
      [
        ...GOLDEN_SCENARIO_IDS,
        `${GOLDEN_LADDER_SCENARIO_ID}#A-one-valid-round`,
        `${GOLDEN_LADDER_SCENARIO_ID}#B-zero-valid-rounds`,
      ].sort(),
    );

    // both conflicts, from the results themselves
    const conflicts = new Set(Object.values(results).map((r) => r.conflictId));
    expect(conflicts).toEqual(new Set(["russia_ukraine", "iran_regional"]));

    // the five register-#8 headline-pinned scenarios are all golden-covered
    for (const id of [
      "roca-ua-only-001b",
      "roca-retention-gap-008b",
      "roca-compound-partial-009b",
      "iran-gulf-unavailable-010b",
    ]) {
      expect(keys).toContain(id);
    }
    expect(keys).toContain(`${GOLDEN_LADDER_SCENARIO_ID}#A-one-valid-round`); // the fifth, per variant

    // the publication-gap day is a gap result, never a fabricated zero
    const gap = results["cc-publication-gap-002"];
    expect(gap.state).toBe("unavailable");
    if (gap.state === "unavailable") expect(gap.unavailableReason).toBe("publication_gap");

    // every scored golden carries BOTH populations plus lane and
    // contribution totals (the §13 P4 deliverable)
    for (const [key, result] of Object.entries(results)) {
      if (result.state !== "scored") continue;
      expect(result.headline.corpusRecall, key).toBeDefined();
      expect(result.headline.publishedRetention, key).toBeDefined();
      expect(result.lanes, key).toBeDefined();
      expect(result.contributionTotals, key).toBeDefined();
      expect(result.contributionTotals!.nonAdditive).toBe(true);
    }

    // the gulf-incomparable lane rides in with its diagnostic and honest miss
    const gulf = results["iran-gulf-unavailable-010b"];
    expect(gulf.state).toBe("scored");
    if (gulf.state === "scored") {
      expect(gulf.laneDiagnostics).toEqual({ maritime: "unavailable_incomparable" });
      expect(gulf.missDiagnostic).toEqual({ u0: "incomparable_coverage" });
      expect(gulf.headline.corpusRecall).toEqual({ matched: 0, denominator: 1 });
    }

    // ladder variants: rung labels are honest and can never read as majority
    const variantA = results[`${GOLDEN_LADDER_SCENARIO_ID}#A-one-valid-round`];
    const variantB = results[`${GOLDEN_LADDER_SCENARIO_ID}#B-zero-valid-rounds`];
    expect(variantA.state).toBe("scored");
    expect(variantB.state).toBe("scored");
    if (variantA.state === "scored") expect(variantA.matcherRung).toBe("llm");
    if (variantB.state === "scored") {
      expect(variantB.matcherRung).toBe("keyword");
      expect(variantB.keywordUnmatchable).toBe(1);
      // FULL declared-unit denominator under the keyword rung (register #8 M1)
      expect(variantB.headline.corpusRecall.denominator).toBe(2);
    }
  });

  it("the committed golden bytes recover no reference prose, no claim text, and no sentinel", async () => {
    const committed = readFileSync(goldenPath, "utf8");
    const goldenScenarioIds = new Set<string>([...GOLDEN_SCENARIO_IDS, GOLDEN_LADDER_SCENARIO_ID]);
    // input-presence precondition (corpus README audit rule): the sentinel
    // scenario is a member of the golden set, so its unit text — including
    // the sentinel token — provably entered the scored inputs
    const sentinelScenario = scenarios.find((s) => s.id === "cc-regen-after-instant-007")!;
    expect(goldenScenarioIds.has(sentinelScenario.id)).toBe(true);
    const sentinel = sentinelScenario.report!.units[0].text.match(/\b[A-Z]{6,}\b/)?.[0];
    expect(sentinel).toBeDefined();
    expect(committed.includes(sentinel!)).toBe(false);

    for (const scenario of scenarios) {
      if (!goldenScenarioIds.has(scenario.id)) continue;
      for (const unit of scenario.report?.units ?? []) {
        expect(committed.includes(unit.text), `${scenario.id}: unit text in goldens`).toBe(false);
        const words = unit.text.split(/\s+/);
        for (let i = 0; i + 6 <= words.length; i += 3) {
          const fragment = words.slice(i, i + 6).join(" ");
          expect(committed.includes(fragment), `${scenario.id}: unit fragment in goldens`).toBe(
            false,
          );
        }
      }
      for (const claim of scenario.evidence) {
        expect(committed.includes(claim.text), `${scenario.id}: claim text in goldens`).toBe(false);
      }
    }
  });
});
