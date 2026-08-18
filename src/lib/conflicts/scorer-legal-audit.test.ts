// Reference-prose audit over EVERY persistable Phase-4 artifact (contract
// §5.8; corpus README audit rule; Gate-4 legal charter "recovery of
// reference prose from every persistable result").
//
// Per the README rule the audit first proves the sentinel token was PRESENT
// in the run's inputs (else the audit is vacuous and must fail as not-run),
// then asserts it — and every unit text, and every claim text (Phase-4 data
// minimization: results carry ids + structural metadata only) — absent from
// every serialized result and every offline report produced from the corpus.
// The sentinel is extracted from the fixture at runtime and never spelled in
// committed code.

import { describe, expect, it } from "vitest";
import type { ConflictResultV1 } from "./eval-profile";
import {
  loadConflictFixtureScenarios,
  selectedScenarioReport,
} from "./fixture-corpus";
import {
  matcherFixtureVariantsOf,
  scoreFixtureScenario,
  voteVariantMatcher,
  GOLDEN_LADDER_SCENARIO_ID,
} from "./goldens";
import { formatConflictResultReport } from "./offline-report";
import { stableStringify } from "./serialization";

const scenarios = loadConflictFixtureScenarios();

async function allResults(): Promise<Array<{ id: string; result: ConflictResultV1 }>> {
  const out: Array<{ id: string; result: ConflictResultV1 }> = [];
  for (const scenario of scenarios) {
    out.push({ id: scenario.id, result: await scoreFixtureScenario(scenario) });
  }
  // the ladder scenario again, through BOTH vote variants (llm + keyword rungs)
  const ladder = scenarios.find((s) => s.id === GOLDEN_LADDER_SCENARIO_ID)!;
  for (const variant of matcherFixtureVariantsOf(ladder)) {
    out.push({
      id: `${ladder.id}#${variant.variantId}`,
      result: await scoreFixtureScenario(ladder, { matcher: voteVariantMatcher(variant) }),
    });
  }
  return out;
}

describe("serialized results recover no reference prose and no claim text", () => {
  it("sentinel present in inputs, absent from every serialized result and offline report", async () => {
    // input-presence precondition (README: presence before absence)
    const sentinelScenario = scenarios.find((s) => s.id === "cc-regen-after-instant-007")!;
    const sentinel = sentinelScenario.report!.units[0].text.match(/\b[A-Z]{6,}\b/)?.[0];
    expect(sentinel).toBeDefined();

    const results = await allResults();
    // the sentinel scenario itself must be among the scored inputs
    expect(results.some((r) => r.id === "cc-regen-after-instant-007")).toBe(true);

    for (const { id, result } of results) {
      const serialized = stableStringify(result);
      expect(serialized.includes(sentinel!), `${id}: sentinel leaked`).toBe(false);
      const report = formatConflictResultReport(result);
      expect(report.includes(sentinel!), `${id}: sentinel leaked into the offline report`).toBe(
        false,
      );

      const scenario = scenarios.find((s) => id.startsWith(s.id))!;
      const selected = selectedScenarioReport(scenario);
      for (const unit of selected?.units ?? []) {
        expect(serialized.includes(unit.text), `${id}: unit text leaked`).toBe(false);
        expect(report.includes(unit.text), `${id}: unit text leaked into the report`).toBe(false);
        // no long fragment either: any 6-word window of the unit text
        const words = unit.text.split(/\s+/);
        for (let i = 0; i + 6 <= words.length; i += 3) {
          const fragment = words.slice(i, i + 6).join(" ");
          expect(serialized.includes(fragment), `${id}: unit fragment leaked`).toBe(false);
        }
      }
      // Phase-4 data minimization: claim TEXT never rides into results either
      for (const claim of scenario.evidence) {
        expect(serialized.includes(claim.text), `${id}: claim text leaked`).toBe(false);
      }
    }
  });

  it("NO composite score exists on any result surface (§6.4)", async () => {
    // key-name audit over every serialized result: coverage counts with
    // explicit numerator/denominator are the ONLY arithmetic; no field may
    // even be NAMED like a blended quality number
    const forbiddenKey = /(composite|overall|grade|rating|score)/i;
    const collectKeys = (value: unknown, keys: Set<string>): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectKeys(item, keys);
      } else if (typeof value === "object" && value !== null) {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          collectKeys(nested, keys);
        }
      }
    };
    for (const { id, result } of await allResults()) {
      const keys = new Set<string>();
      collectKeys(result, keys);
      for (const key of keys) {
        expect(forbiddenKey.test(key), `${id}: field "${key}" reads as a composite score`).toBe(
          false,
        );
      }
      const report = formatConflictResultReport(result);
      expect(report).not.toMatch(/composite|overall score|quality score/i);
    }
  });

  it("hedge fields in results are the claims' OWN hedges (never reference wording)", async () => {
    const scenario = scenarios.find((s) => s.id === "iran-translation-hedge-012")!;
    const result = await scoreFixtureScenario(scenario);
    expect(result.state).toBe("scored");
    if (result.state !== "scored") return;
    const claims = result.agreements!.corpusRecall.flatMap((a) => a.claims);
    expect(claims).not.toHaveLength(0);
    for (const claim of claims) {
      const source = scenario.evidence.find((c) => c.claimId === claim.claimId)!;
      expect(claim.hedge).toBe(source.hedging);
    }
  });
});
