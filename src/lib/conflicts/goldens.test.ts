// Golden drift gate (Phase 4; prompt §12 item F): the committed golden file
// is regenerated through the FULL fixture→assemblies→oracle→scorer pipeline
// and byte-compared against fixtures/conflicts/goldens/golden-results-v1.json.
// Drift is a FAILING test, never a silent re-baseline. To intentionally
// re-baseline after a reviewed scorer change:
//   REGEN_GOLDENS=1 npx vitest run src/lib/conflicts/goldens.test.ts
// then review the golden diff and commit it alongside the change.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConflictFixtureScenarios } from "./fixture-corpus";
import {
  computeGoldenResults,
  GOLDEN_LADDER_SCENARIO_ID,
  GOLDEN_RESULTS_FILE,
  GOLDEN_SCENARIO_IDS,
  goldenBytes,
} from "./goldens";

const scenarios = loadConflictFixtureScenarios();

describe("golden results (byte-stable drift gate)", () => {
  it("the committed golden file matches a full regeneration byte-for-byte", async () => {
    const bytes = goldenBytes(await computeGoldenResults(scenarios));
    const path = join(process.cwd(), GOLDEN_RESULTS_FILE);
    if (process.env.REGEN_GOLDENS === "1") {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
    expect(existsSync(path), `committed golden file exists at ${GOLDEN_RESULTS_FILE}`).toBe(true);
    const committed = readFileSync(path, "utf8");
    expect(
      committed === bytes,
      "golden bytes match regeneration (drift means: review the change, then re-baseline via REGEN_GOLDENS=1)",
    ).toBe(true);
  });

  it("regeneration is deterministic: two computations produce identical bytes", async () => {
    const a = goldenBytes(await computeGoldenResults(scenarios));
    const b = goldenBytes(await computeGoldenResults(scenarios));
    expect(a === b).toBe(true);
  });

  it("the golden set covers both conflicts, the gap day, and every ladder variant", async () => {
    const results = await computeGoldenResults(scenarios);
    const keys = Object.keys(results);
    for (const id of GOLDEN_SCENARIO_IDS) {
      expect(keys, `golden key ${id}`).toContain(id);
    }
    const ladderKeys = keys.filter((k) => k.startsWith(`${GOLDEN_LADDER_SCENARIO_ID}#`));
    expect(ladderKeys.length).toBeGreaterThanOrEqual(2);
    const byId = new Map(scenarios.map((s) => [s.id, s]));
    const conflicts = new Set(
      GOLDEN_SCENARIO_IDS.map((id) => byId.get(id)?.conflictId).filter(Boolean),
    );
    expect(conflicts.has("russia_ukraine")).toBe(true);
    expect(conflicts.has("iran_regional")).toBe(true);
    expect(results["cc-publication-gap-002"]?.state).toBe("unavailable");
  });
});
