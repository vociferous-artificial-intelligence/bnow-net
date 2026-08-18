// Phase 7: the four-way fixture backtest matrix regenerates deterministically
// from the committed corpus, and the numbers the P7 report publishes are the
// numbers this module computes.
//
// The pins below are deliberately EXACT. A corpus edit, an oracle-table edit,
// an eligibility/scorer change, or a production keywords.ts gazetteer change
// moves them — and this test then fails, forcing the report to be regenerated
// instead of silently going stale.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeBacktestMatrix,
  emulateLegacyScenario,
  formatBacktestMatrixMarkdown,
  legacyRetainsUnit,
  LEGACY_EMULATION_NOTES,
  type BacktestMatrix,
} from "./backtest-matrix";
import { loadConflictFixtureScenarios, selectedScenarioReport } from "./fixture-corpus";

const P7_REPORT = "docs/reviews/CONFLICT-EVALUATION-P7-REPORT-2026-08-17.md";

let cached: BacktestMatrix | null = null;
async function matrix(): Promise<BacktestMatrix> {
  cached ??= await computeBacktestMatrix();
  return cached;
}

describe("legacy emulation fidelity (production exports, read-only)", () => {
  it("routes ROCA units through the production classifyTakeawayTheater gazetteer", () => {
    // ua toponym -> ua row only (the ru row never sees it)
    expect(legacyRetainsUnit("russia_ukraine", "ua", "Russian forces advanced near Pokrovsk.")).toBe(true);
    expect(legacyRetainsUnit("russia_ukraine", "ru", "Russian forces advanced near Pokrovsk.")).toBe(false);
    // ru toponym -> ru row only
    expect(legacyRetainsUnit("russia_ukraine", "ru", "A drone struck a refinery in Ryazan.")).toBe(true);
    expect(legacyRetainsUnit("russia_ukraine", "ua", "A drone struck a refinery in Ryazan.")).toBe(false);
    // `both` geography (occupied Crimea) stays in BOTH denominators
    expect(legacyRetainsUnit("russia_ukraine", "ru", "An ammunition depot in Crimea detonated.")).toBe(true);
    expect(legacyRetainsUnit("russia_ukraine", "ua", "An ammunition depot in Crimea detonated.")).toBe(true);
    // no recognized toponym -> defaults to `both`, so it is counted TWICE
    expect(legacyRetainsUnit("russia_ukraine", "ru", "A coalition agreed a procurement package.")).toBe(true);
    expect(legacyRetainsUnit("russia_ukraine", "ua", "A coalition agreed a procurement package.")).toBe(true);
  });

  it("applies NO takeaway filtering to the Iran Update (run.ts filters ru/ua only)", () => {
    expect(legacyRetainsUnit("iran_regional", "ir", "Houthi forces attacked a tanker in the Red Sea.")).toBe(true);
    expect(legacyRetainsUnit("iran_regional", "ir", "Nothing recognizable at all.")).toBe(true);
  });

  it("emits no country row when every declared unit is off-theater (production returns an error)", () => {
    const scenarios = loadConflictFixtureScenarios();
    const uaOnly = scenarios.find((s) => s.id === "roca-ua-only-001b")!;
    const legacy = emulateLegacyScenario(uaOnly, selectedScenarioReport(uaOnly));
    const ru = legacy.rows.find((r) => r.country === "ru")!;
    expect(ru.denominator).toBe(0);
    expect(legacy.noCountryRow).toBe(1);
  });

  it("documents every emulation choice and fidelity limit", () => {
    expect(LEGACY_EMULATION_NOTES).toHaveLength(14);
    const joined = LEGACY_EMULATION_NOTES.join("\n");
    for (const tag of ["L1", "L2", "L3", "L4", "L5", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"]) {
      expect(joined).toContain(tag);
    }
  });
});

describe("backtest purity (no provider contact is structurally possible)", () => {
  it("reads no env, imports no provider SDK, touches no spend machinery, opens no socket", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "conflicts", "backtest-matrix.ts"),
      "utf8",
    );
    for (const pattern of [
      /process\.env/,
      /from\s+["']openai["']/,
      /from\s+["']@anthropic/,
      /from\s+["']\.\.\/usage\//,
      /\brequire\s*\(/,
      /\bfetch\s*\(/,
    ]) {
      expect(pattern.test(source), `matches forbidden ${String(pattern)}`).toBe(false);
    }
    // it emulates production by IMPORTING the production exports, never by
    // forking the gazetteer or the scorer
    expect(source).toContain('from "../validation/keywords"');
    expect(source).not.toContain("../validation/score");
    expect(source).not.toContain("../validation/run");
  });

  it("computes the whole matrix under a fully blanked environment", async () => {
    const BLANKED = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "DATABASE_URL",
      "LLM_SPRINT_USD_CAP",
      "MATCHER_MODE",
      "MATCH_VOTES",
      "CONFLICTS_UI",
    ] as const;
    const saved = new Map<string, string | undefined>();
    for (const key of BLANKED) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    try {
      const m = await computeBacktestMatrix();
      expect(m.rows).toHaveLength(41);
      // the shipped side is oracle-scored throughout: no ladder rung, so no
      // live matcher could have run
      for (const row of m.rows) {
        expect(["fixture-oracle", "n/a"]).toContain(row.combined.matcherRung);
      }
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("four-way backtest matrix (deterministic over the frozen corpus)", () => {
  it("covers every scenario exactly once, partitioned by conflict", async () => {
    const m = await matrix();
    expect(m.rows).toHaveLength(41);
    expect(new Set(m.rows.map((r) => r.scenarioId)).size).toBe(41);
    expect(m.byConflict.russia_ukraine.scenarios).toBe(21);
    expect(m.byConflict.iran_regional.scenarios).toBe(20);
  });

  it("pins the ROCA aggregate (methods 1 and 2)", async () => {
    const ru = (await matrix()).byConflict.russia_ukraine;
    expect(ru).toEqual({
      scenarios: 21,
      declaredUnits: 22,
      legacyUnionMatched: 15,
      legacySumDenominator: 36,
      legacySumMatched: 15,
      combinedPublishedMatched: 15,
      combinedPublishedDenominator: 22,
      combinedCorpusMatched: 16,
      combinedCorpusDenominator: 22,
      combinedOnlyUnits: 1,
      legacyOnlyUnits: 1,
      legacyNoRun: 0,
      legacyNoCountryRow: 7,
      combinedUnavailable: 0,
      combinedIncomparableUnits: 0,
      populationDisagreementUnits: 1,
    });
    // the presentational defect, stated as arithmetic: two rows present a
    // 36-unit denominator for 22 real declared units
    expect(ru.legacySumDenominator).toBeGreaterThan(ru.declaredUnits);
    // and the headline aggregates are IDENTICAL — the ROCA gain is
    // compositional and presentational, NOT a coverage increase
    expect(ru.legacyUnionMatched).toBe(ru.combinedPublishedMatched);
  });

  it("pins the Iran Update aggregate (methods 3 and 4)", async () => {
    const ir = (await matrix()).byConflict.iran_regional;
    expect(ir).toEqual({
      scenarios: 20,
      declaredUnits: 21,
      legacyUnionMatched: 12,
      legacySumDenominator: 21,
      legacySumMatched: 12,
      combinedPublishedMatched: 16,
      combinedPublishedDenominator: 21,
      combinedCorpusMatched: 15,
      combinedCorpusDenominator: 21,
      combinedOnlyUnits: 4,
      legacyOnlyUnits: 0,
      legacyNoRun: 1,
      legacyNoCountryRow: 0,
      combinedUnavailable: 1,
      combinedIncomparableUnits: 1,
      populationDisagreementUnits: 1,
    });
  });

  it("names the ROCA development the separate rows structurally cannot see", async () => {
    const row = (await matrix()).rows.find((r) => r.scenarioId === "roca-ru-source-002")!;
    // the unit's toponym is inside Ukraine, so the ru row never sees it; the
    // ua digest holds no claim, so the ua row scores it a miss
    expect(row.legacy.rows.find((r) => r.country === "ru")!.denominator).toBe(0);
    expect(row.legacy.rows.find((r) => r.country === "ua")!.matched).toBe(0);
    expect(row.legacy.unionMatched).toBe(0);
    expect(row.combined.publishedRetention).toEqual({ matched: 1, denominator: 1 });
    expect(row.combinedOnlyUnits).toEqual(["u0"]);
    // and the combined view attributes it to the theater that actually held it
    expect(row.combined.contributionTheaters).toEqual(["ru"]);
  });

  it("reports the direction the combined method is STRICTER, not only where it wins", async () => {
    const row = (await matrix()).rows.find((r) => r.scenarioId === "roca-compound-partial-009b")!;
    // legacy (no partial concept) counts the compound unit covered...
    expect(row.legacy.unionMatched).toBe(1);
    // ...while the combined headline counts partial as a miss and says so
    expect(row.combined.publishedRetention).toEqual({ matched: 0, denominator: 1 });
    expect(row.combined.partialDiagnostic).toBe(1);
    expect(row.legacyOnlyUnits).toEqual(["u0"]);
  });

  it("shows the cross-track and cross-theater evidence the ir military row cannot reach", async () => {
    const m = await matrix();
    const byId = new Map(m.rows.map((r) => [r.scenarioId, r]));
    const expectations: Array<[string, string[], string[]]> = [
      ["iran-iaea-nuclear-006", ["ir"], ["nuclear"]],
      ["iran-e3-diplomacy-007", ["ir"], ["nuclear"]],
      ["iran-elite-succession-008", ["ir"], ["elite_politics"]],
      ["iran-gulf-unavailable-010b", ["bh"], ["military"]],
    ];
    for (const [id, theaters, tracks] of expectations) {
      const row = byId.get(id)!;
      expect(row.legacy.unionMatched, id).toBe(0);
      expect(row.combined.publishedRetention, id).toEqual({ matched: 1, denominator: 1 });
      expect(row.combinedOnlyUnits, id).toEqual(["u0"]);
      expect(row.combined.contributionTheaters, id).toEqual(theaters);
      expect(row.combined.contributionTracks, id).toEqual(tracks);
    }
  });

  it("keeps the gulf lane honestly incomparable instead of manufacturing agreement", async () => {
    const row = (await matrix()).rows.find((r) => r.scenarioId === "iran-gulf-unavailable-010b")!;
    // the mapped-corpus question has NO comparable Gulf evidence: a miss with
    // an explicit sub-cause plus an unavailable lane state — never a bare 0
    expect(row.combined.corpusRecall).toEqual({ matched: 0, denominator: 1 });
    expect(row.combined.missDiagnostics).toEqual({ u0: "incomparable_coverage" });
    expect(row.combined.laneDiagnostics).toEqual({ maritime: "unavailable_incomparable" });
    // and the two populations disagree — a distinction the single legacy row
    // has no vocabulary for
    expect(row.combined.populationDisagreementUnits).toEqual(["u0"]);
  });

  it("separates corpus recall from published retention on the retention-gap scenario", async () => {
    const row = (await matrix()).rows.find((r) => r.scenarioId === "roca-retention-gap-008b")!;
    expect(row.combined.corpusRecall).toEqual({ matched: 1, denominator: 1 });
    expect(row.combined.publishedRetention).toEqual({ matched: 0, denominator: 1 });
    expect(row.combined.populationDisagreementUnits).toEqual(["u0"]);
  });

  it("reports a publication gap as a gap in both methods, never as zero", async () => {
    const row = (await matrix()).rows.find((r) => r.scenarioId === "cc-publication-gap-002")!;
    expect(row.legacy.state).toBe("no_run");
    expect(row.combined.state).toBe("publication_gap");
    expect(row.combined.publishedRetention).toBeNull();
  });

  it("never lets a combined headline exceed its declared-unit denominator", async () => {
    for (const row of (await matrix()).rows) {
      if (row.combined.publishedRetention === null) continue;
      expect(row.combined.publishedRetention.matched).toBeLessThanOrEqual(
        row.combined.publishedRetention.denominator,
      );
      expect(row.combined.corpusRecall!.matched).toBeLessThanOrEqual(
        row.combined.corpusRecall!.denominator,
      );
      expect(row.combined.publishedRetention.denominator).toBe(row.legacy.unionDenominator);
    }
  });

  it("regenerates byte-identically across repeated runs", async () => {
    const a = formatBacktestMatrixMarkdown(await computeBacktestMatrix());
    const b = formatBacktestMatrixMarkdown(await computeBacktestMatrix());
    expect(a).toBe(b);
  });
});

describe("the committed P7 report publishes exactly these numbers", () => {
  it("contains the generated matrix block verbatim", async () => {
    const report = readFileSync(join(process.cwd(), P7_REPORT), "utf8");
    const generated = formatBacktestMatrixMarkdown(await matrix());
    expect(report).toContain(generated);
  });

  it("carries the binding do-not-extrapolate sentence", () => {
    const report = readFileSync(join(process.cwd(), P7_REPORT), "utf8");
    expect(report).toContain(
      "These are fixture results. They are NOT production gains and must not be reported as coverage improvements on real ISW reports.",
    );
  });
});
