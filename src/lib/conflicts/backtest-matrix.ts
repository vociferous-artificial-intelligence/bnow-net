// Phase 7 four-way fixture backtest matrix (prompt §15 "Run the legally safe
// fixture/backtest matrix comparing: current separate RU/UA method; combined
// ROCA method; current Iran military-only method; combined Iran
// regional/multi-track method").
//
// WHAT THIS IS NOT: this is NOT a production measurement. Every number below
// is computed over the 41-scenario SYNTHETIC frozen corpus in
// fixtures/conflicts/, whose scenarios were authored to exercise the
// structural cases in the acceptance list. A fixture gain is evidence that
// the combined method CAN represent a case the legacy method structurally
// cannot; it is NOT evidence of any coverage change on real ISW reports.
// The P7 report carries that sentence verbatim.
//
// ZERO PROVIDER CONTACT: methods 2 and 4 run the shipped conflict pipeline
// with the deterministic FixtureOracleMatcher; methods 1 and 3 use the same
// oracle pair table restricted to the legacy population. No client is
// constructed, no env var is read, no network call is possible.
//
// -------------------------------------------------------------------------
// The legacy emulation and its fidelity limits (every choice is enumerated in
// LEGACY_EMULATION_NOTES below and reproduced in the P7 report §3.2)
// -------------------------------------------------------------------------
//
// Emulated from src/lib/validation/{run,score,keywords}.ts, READ-ONLY (the
// production files are untouched; classifyTakeawayTheater/extractSignature are
// imported from production, not reimplemented):
//
//  L1 one row per country (ru, ua) against the SAME ROCA report (run.ts
//     referenceFor: ru and ua both map to theater "ru");
//  L2 per-country denominator = takeaways whose classifyTakeawayTheater over
//     the production extractSignature toponyms is `both` or the country's own
//     iso2 — so `both`/toponym-less units sit in BOTH denominators (run.ts
//     takeaway filtering; keywords.ts classifyTakeawayTheater);
//  L3 per-country numerator population = that ONE country's ONE `military`
//     digest's published claims (run.ts selects `d.track = 'military'` for a
//     single iso2, and reads that digest's claims only);
//  L4 Iran: NO takeaway filtering at all (run.ts filters only for ru/ua), so
//     the ir denominator is every declared unit, scored against ir `military`
//     published claims only — nuclear/elite_politics/il/gulf evidence is
//     structurally invisible;
//  L5 a matched unit is any unit the oracle pairs to ≥1 claim inside that
//     country's population — the legacy matcher has no partial concept, so an
//     oracle `partial` pair counts as a legacy MATCH (see F3).
//
// FIDELITY LIMITS (all disclosed, none silently favourable to the new method):
//
//  F1 the legacy matcher is NOT re-run. Production matches with k=5 LLM votes
//     (paid) or the keyword gazetteer; both are forbidden here (no paid calls;
//     the gazetteer over synthetic sentences would measure the gazetteer, not
//     the method). Substituting the ORACLE gives the legacy method a PERFECT
//     matcher — the most generous possible reading — so every legacy miss
//     reported here is a STRUCTURAL miss (wrong population/denominator), never
//     a matcher failure. This is the central emulation choice.
//  F2 `scoreDigest`'s keyword-only `matchable` denominator reduction (units
//     with no toponym AND no action signal drop OUT of the denominator) is NOT
//     applied: it exists only on the keyword rung, and applying it would
//     inflate legacy coverage further on top of F1. Reported separately as
//     `legacyMatchableDropped` per country so the direction is visible.
//  F3 oracle `partial` coverage counts as a legacy match (L5) but as a MISS in
//     the combined headline (contract §6.4 partial-as-miss). This is
//     deliberately anti-favourable to the combined method.
//  F4 "no country digest" is not representable in a fixture: production emits
//     no row when a country has no `military` digest that day, while here a
//     country with zero eligible claims still gets a row scoring 0. Production
//     ru/ua military digests are produced daily, so the row-exists reading is
//     the faithful one; `legacyEmptyPopulation` flags each such row.
//  F5 production writes one validation_runs row per (digest, report) and the
//     scoreboard renders per-country rows; there is no legacy "combined"
//     aggregate. The `unionMatched`/`unionDenominator` columns are computed
//     HERE as the fairest apples-to-apples legacy aggregate (distinct units
//     matched by EITHER row over distinct declared units); `sumDenominator`
//     shows the double-counted denominator the current scoreboard actually
//     presents.
//  F6 unavailable/gap semantics: the legacy pipeline has no snapshot concept
//     and no `unavailable` result. A publication gap simply produces no run
//     (modelled as `no_run`); everything else it scores. The combined method's
//     `unavailable`/gap states are therefore compared as STATES, not numbers.
//  F7 the corpus is synthetic and small (most scenarios declare ONE unit), so
//     per-scenario percentages are 0/100 by construction. Only the aggregate
//     unit counts carry any signal, and even those are corpus-design artefacts.
//  F8 single-unit scenarios make production's "all N takeaways off-theater →
//     no run" branch dominant: a real ROCA carries 5+ bullets, where the same
//     filter DEFLATES one country's denominator instead of deleting its row.
//     Rows in that state print `no row (all units off-theater)` and are
//     counted in `legacyNoCountryRow`; they are excluded from that country's
//     numerator and denominator, exactly as production excludes them.
//  F9 every scenario is scored at evaluation kind `retrospective` — the only
//     kind this workstream may mint (register #5). The snapshot-anchored
//     `unavailable` state is therefore NOT exercised by this matrix; it is
//     proven separately (scorer/eval-profile tests and the P5 gate). Probed
//     here for the record: the same scenarios scored at `at_publication`
//     return state `unavailable` / reason `no_proven_snapshot`.

import { extractSignature, classifyTakeawayTheater } from "../validation/keywords";
import type { ConflictResultV1 } from "./eval-profile";
import {
  loadConflictFixtureScenarios,
  selectedScenarioReport,
  type ConflictFixtureScenario,
  type FixtureReportShape,
} from "./fixture-corpus";
import { oraclePairsFor } from "./fixture-matcher";
import { scoreFixtureScenario } from "./goldens";
import type { CandidateClaim } from "./evidence-records";

export const LEGACY_EMULATION_NOTES = [
  "L1 one row per country (ru, ua) against the SAME ROCA report",
  "L2 per-country denominator via production classifyTakeawayTheater; `both` units sit in BOTH denominators",
  "L3 numerator population = that country's single `military` digest published claims",
  "L4 Iran: no takeaway filtering; ir `military` published claims only",
  "L5 an oracle `partial` pair counts as a legacy match (legacy has no partial concept)",
  "F1 the legacy matcher is replaced by the ORACLE (perfect matcher) — legacy misses here are structural, never matcher failures",
  "F2 the keyword-only `matchable` denominator reduction is NOT applied (reported separately)",
  "F3 partial counts as legacy match but combined miss — anti-favourable to the combined method",
  "F4 a country with zero eligible claims still gets a row scoring 0 (flagged legacyEmptyPopulation)",
  "F5 unionMatched/unionDenominator are computed here; the live scoreboard shows the double-counted sumDenominator",
  "F6 unavailable/gap are compared as STATES; the legacy pipeline can only emit a row or no row",
  "F7 synthetic single-unit scenarios make per-scenario percentages degenerate; only aggregates carry signal",
  "F8 single-unit scenarios make the `all takeaways off-theater -> no run` branch dominant; a real 5+-bullet ROCA would deflate a denominator instead of deleting a row",
  "F9 everything is scored at kind `retrospective`; the snapshot-anchored `unavailable` state is proven elsewhere (probe: the same scenarios at `at_publication` return unavailable/no_proven_snapshot)",
] as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface LegacyCountryRow {
  /** the production row identity: one country scored against the shared report */
  country: string;
  /** declared units retained for this country by classifyTakeawayTheater */
  denominator: number;
  /** units the oracle pairs to ≥1 claim inside this country's population */
  matched: number;
  /** units retained here that the keyword rung would ALSO have dropped (F2) */
  matchableDropped: number;
  /** claims in this country's single-theater single-track published population */
  population: number;
  /** F4: production would have emitted no row at all if the digest were absent */
  emptyPopulation: boolean;
  /** the retained unit ids, so the report can name the invisible development */
  retainedUnitIds: readonly string[];
  matchedUnitIds: readonly string[];
}

export interface LegacyScenarioResult {
  /** "no_run" = the legacy pipeline emits nothing (publication gap) */
  state: "rows" | "no_run";
  rows: readonly LegacyCountryRow[];
  /** distinct declared units (the honest single denominator) */
  unionDenominator: number;
  /** distinct declared units matched by ANY country row */
  unionMatched: number;
  /** the denominator the scoreboard actually presents = Σ per-country rows */
  sumDenominator: number;
  sumMatched: number;
  /** F8: country rows production would not emit at all (every unit off-theater) */
  noCountryRow: number;
}

export interface CombinedScenarioResult {
  state: "scored" | "unavailable" | "publication_gap";
  matcherRung: string;
  publishedRetention: { matched: number; denominator: number } | null;
  corpusRecall: { matched: number; denominator: number } | null;
  partialDiagnostic: number | null;
  /** lanes whose diagnostic is a non-null honesty state (e.g. incomparable) */
  laneDiagnostics: Readonly<Record<string, string>>;
  /** per-unit miss sub-cause (e.g. incomparable_coverage) */
  missDiagnostics: Readonly<Record<string, string>>;
  /** units whose corpus-recall and published-retention verdicts DIFFER — the
   *  two §6.1 pipeline questions a single legacy row can never separate */
  populationDisagreementUnits: readonly string[];
  /** distinct theaters / tracks credited in the published-retention view */
  contributionTheaters: readonly string[];
  contributionTracks: readonly string[];
}

export interface BacktestRow {
  scenarioId: string;
  title: string;
  conflictId: "russia_ukraine" | "iran_regional";
  acceptanceRef: string;
  legacy: LegacyScenarioResult;
  combined: CombinedScenarioResult;
  /** true when the combined method retains a development the legacy rows all miss */
  combinedOnlyUnits: readonly string[];
  /** true when a legacy row matches a unit the combined headline counts a miss */
  legacyOnlyUnits: readonly string[];
}

export interface BacktestAggregate {
  scenarios: number;
  /** union over scenarios of declared units in scored (non-gap) reports */
  declaredUnits: number;
  legacyUnionMatched: number;
  legacySumDenominator: number;
  legacySumMatched: number;
  combinedPublishedMatched: number;
  combinedPublishedDenominator: number;
  combinedCorpusMatched: number;
  combinedCorpusDenominator: number;
  /** units only the combined method retains */
  combinedOnlyUnits: number;
  /** units only a legacy row matches (partial-as-match, F3) */
  legacyOnlyUnits: number;
  /** scenarios where the legacy method would emit no row at all */
  legacyNoRun: number;
  /** country rows production would not emit (every declared unit off-theater; F8) */
  legacyNoCountryRow: number;
  /** scenarios the combined method reports unavailable rather than 0 */
  combinedUnavailable: number;
  /** units the combined method reports incomparable rather than a bare miss */
  combinedIncomparableUnits: number;
  /** units where corpus recall and published retention DISAGREE (the two
   *  pipeline questions the legacy row cannot separate) */
  populationDisagreementUnits: number;
}

export interface BacktestMatrix {
  rows: readonly BacktestRow[];
  byConflict: Readonly<Record<"russia_ukraine" | "iran_regional", BacktestAggregate>>;
}

// ---------------------------------------------------------------------------
// Legacy emulation
// ---------------------------------------------------------------------------

/** The countries whose single-theater `military` digest the legacy validator
 *  scores against each conflict's reference report (run.ts referenceFor). */
const LEGACY_COUNTRIES: Readonly<Record<"russia_ukraine" | "iran_regional", readonly string[]>> = {
  russia_ukraine: ["ru", "ua"],
  iran_regional: ["ir"],
};

/** Production per-theater takeaway filtering, reproduced through the
 *  production exports (L2/L4). Iran is never filtered. */
export function legacyRetainsUnit(
  conflictId: "russia_ukraine" | "iran_regional",
  country: string,
  unitText: string,
): boolean {
  if (conflictId === "iran_regional") return true; // L4: run.ts filters ru/ua only
  const sig = extractSignature(unitText);
  const theater = classifyTakeawayTheater([...sig.toponyms]);
  return theater === "both" || theater === country;
}

/** F2 diagnostic: would the keyword rung have dropped this unit from its own
 *  denominator (no toponym AND no action signal)? */
function keywordUnmatchable(unitText: string): boolean {
  const sig = extractSignature(unitText);
  return sig.toponyms.size === 0 && sig.actions.size === 0;
}

/** L3/L4 population: one country, `military` track, genuinely published, never
 *  a stub (ruling 3 — a stub never persists into a digest). */
function legacyPopulation(
  evidence: readonly CandidateClaim[],
  country: string,
): readonly CandidateClaim[] {
  return evidence.filter(
    (c) => c.theater === country && c.track === "military" && c.published && !c.stub,
  );
}

export function emulateLegacyScenario(
  scenario: ConflictFixtureScenario,
  report: FixtureReportShape | null,
): LegacyScenarioResult {
  if (report === null) {
    return {
      state: "no_run",
      rows: [],
      unionDenominator: 0,
      unionMatched: 0,
      sumDenominator: 0,
      sumMatched: 0,
      noCountryRow: 0,
    };
  }
  const conflictId = scenario.conflictId as "russia_ukraine" | "iran_regional";
  const pairs = oraclePairsFor(scenario, report);
  const rows: LegacyCountryRow[] = [];
  const unionMatchedIds = new Set<string>();

  for (const country of LEGACY_COUNTRIES[conflictId]) {
    const population = legacyPopulation(scenario.evidence, country);
    const populationIds = new Set(population.map((c) => c.claimId));
    const retained = report.units.filter((u) => legacyRetainsUnit(conflictId, country, u.text));
    const matchedIds = retained
      .filter((u) => pairs.some((p) => p.unitId === u.unitId && populationIds.has(p.claimId)))
      .map((u) => u.unitId);
    for (const id of matchedIds) unionMatchedIds.add(id);
    rows.push({
      country,
      denominator: retained.length,
      matched: matchedIds.length,
      matchableDropped: retained.filter((u) => keywordUnmatchable(u.text)).length,
      population: population.length,
      emptyPopulation: population.length === 0,
      retainedUnitIds: retained.map((u) => u.unitId),
      matchedUnitIds: matchedIds,
    });
  }

  return {
    state: "rows",
    rows,
    unionDenominator: report.units.length,
    unionMatched: unionMatchedIds.size,
    sumDenominator: rows.reduce((a, r) => a + r.denominator, 0),
    sumMatched: rows.reduce((a, r) => a + r.matched, 0),
    noCountryRow: rows.filter((r) => r.denominator === 0).length,
  };
}

// ---------------------------------------------------------------------------
// Combined method (the shipped pipeline, oracle-driven)
// ---------------------------------------------------------------------------

function summarizeCombined(result: ConflictResultV1): CombinedScenarioResult {
  if (result.state !== "scored") {
    return {
      state: result.unavailableReason === "publication_gap" ? "publication_gap" : "unavailable",
      matcherRung: "n/a",
      publishedRetention: null,
      corpusRecall: null,
      partialDiagnostic: null,
      laneDiagnostics: {},
      missDiagnostics: {},
      populationDisagreementUnits: [],
      contributionTheaters: [],
      contributionTracks: [],
    };
  }
  const theaters = new Set<string>();
  const tracks = new Set<string>();
  for (const entry of Object.values(result.contributionPublishedRetention ?? {})) {
    for (const t of entry.theaters) theaters.add(t);
    for (const t of entry.tracks) tracks.add(t);
  }
  const laneDiagnostics: Record<string, string> = {};
  for (const [lane, diag] of Object.entries(result.laneDiagnostics ?? {})) {
    if (diag != null) laneDiagnostics[lane] = diag;
  }
  const missDiagnostics: Record<string, string> = {};
  for (const [unitId, diag] of Object.entries(result.missDiagnostic ?? {})) {
    if (diag != null) missDiagnostics[unitId] = diag;
  }
  const populationDisagreementUnits = Object.keys(result.corpusRecall)
    .filter((unitId) => result.corpusRecall[unitId] !== result.publishedRetention[unitId])
    .sort();
  return {
    state: "scored",
    matcherRung: result.matcherRung,
    publishedRetention: {
      matched: result.headline.publishedRetention.matched,
      denominator: result.headline.publishedRetention.denominator,
    },
    corpusRecall: {
      matched: result.headline.corpusRecall.matched,
      denominator: result.headline.corpusRecall.denominator,
    },
    partialDiagnostic: result.headline.partialDiagnostic ?? 0,
    laneDiagnostics,
    missDiagnostics,
    populationDisagreementUnits,
    contributionTheaters: [...theaters].sort(),
    contributionTracks: [...tracks].sort(),
  };
}

/** Units the COMBINED published-retention view retains that NO legacy row
 *  matched — the structural win the corpus was designed to show. */
function combinedOnly(result: ConflictResultV1, legacy: LegacyScenarioResult): string[] {
  if (result.state !== "scored") return [];
  const legacyMatched = new Set(legacy.rows.flatMap((r) => r.matchedUnitIds));
  return Object.entries(result.publishedRetention)
    .filter(([unitId, verdict]) => verdict === "matched" && !legacyMatched.has(unitId))
    .map(([unitId]) => unitId)
    .sort();
}

/** Units a legacy row matched that the combined headline counts as a miss —
 *  reported honestly, in both directions (F3 makes this reachable). */
function legacyOnly(result: ConflictResultV1, legacy: LegacyScenarioResult): string[] {
  if (result.state !== "scored") return legacy.rows.flatMap((r) => r.matchedUnitIds).sort();
  const legacyMatched = new Set(legacy.rows.flatMap((r) => r.matchedUnitIds));
  return [...legacyMatched].filter((u) => result.publishedRetention[u] !== "matched").sort();
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

function emptyAggregate(): BacktestAggregate {
  return {
    scenarios: 0,
    declaredUnits: 0,
    legacyUnionMatched: 0,
    legacySumDenominator: 0,
    legacySumMatched: 0,
    combinedPublishedMatched: 0,
    combinedPublishedDenominator: 0,
    combinedCorpusMatched: 0,
    combinedCorpusDenominator: 0,
    combinedOnlyUnits: 0,
    legacyOnlyUnits: 0,
    legacyNoRun: 0,
    legacyNoCountryRow: 0,
    combinedUnavailable: 0,
    combinedIncomparableUnits: 0,
    populationDisagreementUnits: 0,
  };
}

/** Compute the whole four-way matrix over the frozen corpus. Deterministic:
 *  same committed fixtures + same committed oracle table => same numbers. */
export async function computeBacktestMatrix(
  scenarios: readonly ConflictFixtureScenario[] = loadConflictFixtureScenarios(),
): Promise<BacktestMatrix> {
  const rows: BacktestRow[] = [];
  const byConflict = {
    russia_ukraine: emptyAggregate(),
    iran_regional: emptyAggregate(),
  };

  for (const scenario of scenarios) {
    const conflictId = scenario.conflictId as "russia_ukraine" | "iran_regional";
    const report = selectedScenarioReport(scenario);
    const legacy = emulateLegacyScenario(scenario, report);
    const result = await scoreFixtureScenario(scenario);
    const combined = summarizeCombined(result);
    const row: BacktestRow = {
      scenarioId: scenario.id,
      title: scenario.title,
      conflictId,
      acceptanceRef: scenario.acceptanceRef,
      legacy,
      combined,
      combinedOnlyUnits: combinedOnly(result, legacy),
      legacyOnlyUnits: legacyOnly(result, legacy),
    };
    rows.push(row);

    const agg = byConflict[conflictId];
    agg.scenarios += 1;
    agg.declaredUnits += legacy.unionDenominator;
    agg.legacyUnionMatched += legacy.unionMatched;
    agg.legacySumDenominator += legacy.sumDenominator;
    agg.legacySumMatched += legacy.sumMatched;
    agg.combinedPublishedMatched += combined.publishedRetention?.matched ?? 0;
    agg.combinedPublishedDenominator += combined.publishedRetention?.denominator ?? 0;
    agg.combinedCorpusMatched += combined.corpusRecall?.matched ?? 0;
    agg.combinedCorpusDenominator += combined.corpusRecall?.denominator ?? 0;
    agg.combinedOnlyUnits += row.combinedOnlyUnits.length;
    agg.legacyOnlyUnits += row.legacyOnlyUnits.length;
    if (legacy.state === "no_run") agg.legacyNoRun += 1;
    agg.legacyNoCountryRow += legacy.noCountryRow;
    if (combined.state !== "scored") agg.combinedUnavailable += 1;
    agg.combinedIncomparableUnits += Object.values(combined.missDiagnostics).filter(
      (d) => d === "incomparable_coverage",
    ).length;
    agg.populationDisagreementUnits += combined.populationDisagreementUnits.length;
  }

  return { rows, byConflict };
}

// ---------------------------------------------------------------------------
// Rendering (the exact block reproduced in the P7 report §3)
// ---------------------------------------------------------------------------

function pct(matched: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${((matched / denominator) * 100).toFixed(1)}%`;
}

function legacyCell(legacy: LegacyScenarioResult, country: string): string {
  if (legacy.state === "no_run") return "no run";
  const row = legacy.rows.find((r) => r.country === country);
  if (row === undefined) return "—";
  if (row.denominator === 0) return "no row (all units off-theater)";
  return `${row.matched}/${row.denominator}${row.emptyPopulation ? " (empty pop.)" : ""}`;
}

function combinedCell(combined: CombinedScenarioResult): string {
  if (combined.state === "publication_gap") return "gap (no report)";
  if (combined.state === "unavailable") return "unavailable";
  const h = combined.publishedRetention!;
  return `${h.matched}/${h.denominator}`;
}

function combinedCorpusCell(combined: CombinedScenarioResult): string {
  if (combined.corpusRecall === null) return "—";
  return `${combined.corpusRecall.matched}/${combined.corpusRecall.denominator}`;
}

function diagnosticsCell(combined: CombinedScenarioResult): string {
  const parts: string[] = [];
  for (const [lane, diag] of Object.entries(combined.laneDiagnostics)) parts.push(`lane ${lane}: ${diag}`);
  for (const [unitId, diag] of Object.entries(combined.missDiagnostics)) parts.push(`${unitId}: ${diag}`);
  if ((combined.partialDiagnostic ?? 0) > 0) parts.push(`partial: ${combined.partialDiagnostic}`);
  return parts.length === 0 ? "—" : parts.join("; ");
}

/** Markdown for both conflicts; the P7 report embeds this verbatim and a test
 *  asserts the committed report still contains it byte-for-byte. */
export function formatBacktestMatrixMarkdown(matrix: BacktestMatrix): string {
  const out: string[] = [];

  out.push("#### Russia–Ukraine / ROCA — legacy separate RU+UA rows vs one combined evaluation");
  out.push("");
  out.push("| scenario | acceptance case | legacy ru row | legacy ua row | legacy union | combined corpus recall | combined published retention | combined-only | diagnostics |");
  out.push("|---|---|---|---|---|---|---|---|---|");
  for (const row of matrix.rows.filter((r) => r.conflictId === "russia_ukraine")) {
    out.push(
      `| \`${row.scenarioId}\` | ${row.acceptanceRef} | ${legacyCell(row.legacy, "ru")} | ${legacyCell(row.legacy, "ua")} | ${row.legacy.state === "no_run" ? "no run" : `${row.legacy.unionMatched}/${row.legacy.unionDenominator}`} | ${combinedCorpusCell(row.combined)} | ${combinedCell(row.combined)} | ${row.combinedOnlyUnits.length === 0 ? "—" : row.combinedOnlyUnits.join(", ")} | ${diagnosticsCell(row.combined)} |`,
    );
  }
  const ru = matrix.byConflict.russia_ukraine;
  out.push("");
  out.push(
    `**ROCA aggregate** (${ru.scenarios} scenarios, ${ru.declaredUnits} declared units): legacy presents ${ru.legacySumMatched}/${ru.legacySumDenominator} across two rows (${pct(ru.legacySumMatched, ru.legacySumDenominator)}, denominator double-counts \`both\` units); legacy union = ${ru.legacyUnionMatched}/${ru.declaredUnits} (${pct(ru.legacyUnionMatched, ru.declaredUnits)}); combined published retention = ${ru.combinedPublishedMatched}/${ru.combinedPublishedDenominator} (${pct(ru.combinedPublishedMatched, ru.combinedPublishedDenominator)}); combined corpus recall = ${ru.combinedCorpusMatched}/${ru.combinedCorpusDenominator} (${pct(ru.combinedCorpusMatched, ru.combinedCorpusDenominator)}); combined-only units = ${ru.combinedOnlyUnits}; legacy-only units = ${ru.legacyOnlyUnits}; legacy no-run scenarios = ${ru.legacyNoRun}; legacy deleted country rows = ${ru.legacyNoCountryRow}; combined unavailable/gap = ${ru.combinedUnavailable}; combined incomparable units = ${ru.combinedIncomparableUnits}; corpus-vs-published disagreements = ${ru.populationDisagreementUnits}.`,
  );
  out.push("");
  out.push("#### Iran and Regional Conflict / Iran Update — legacy ir military-only vs one combined evaluation");
  out.push("");
  out.push("| scenario | acceptance case | legacy ir military row | combined corpus recall | combined published retention | combined theaters | combined tracks | combined-only | diagnostics |");
  out.push("|---|---|---|---|---|---|---|---|---|");
  for (const row of matrix.rows.filter((r) => r.conflictId === "iran_regional")) {
    out.push(
      `| \`${row.scenarioId}\` | ${row.acceptanceRef} | ${legacyCell(row.legacy, "ir")} | ${combinedCorpusCell(row.combined)} | ${combinedCell(row.combined)} | ${row.combined.contributionTheaters.join(", ") || "—"} | ${row.combined.contributionTracks.join(", ") || "—"} | ${row.combinedOnlyUnits.length === 0 ? "—" : row.combinedOnlyUnits.join(", ")} | ${diagnosticsCell(row.combined)} |`,
    );
  }
  const ir = matrix.byConflict.iran_regional;
  out.push("");
  out.push(
    `**Iran Update aggregate** (${ir.scenarios} scenarios, ${ir.declaredUnits} declared units): legacy ir military-only = ${ir.legacySumMatched}/${ir.legacySumDenominator} (${pct(ir.legacySumMatched, ir.legacySumDenominator)}); combined published retention = ${ir.combinedPublishedMatched}/${ir.combinedPublishedDenominator} (${pct(ir.combinedPublishedMatched, ir.combinedPublishedDenominator)}); combined corpus recall = ${ir.combinedCorpusMatched}/${ir.combinedCorpusDenominator} (${pct(ir.combinedCorpusMatched, ir.combinedCorpusDenominator)}); combined-only units = ${ir.combinedOnlyUnits}; legacy-only units = ${ir.legacyOnlyUnits}; legacy no-run scenarios = ${ir.legacyNoRun}; legacy deleted country rows = ${ir.legacyNoCountryRow}; combined unavailable/gap = ${ir.combinedUnavailable}; combined incomparable units = ${ir.combinedIncomparableUnits}; corpus-vs-published disagreements = ${ir.populationDisagreementUnits}.`,
  );
  return out.join("\n");
}
