// Conflict validation-workload profile (conflict-evaluations Phase 5;
// decision register #3; workstream prompt §13).
//
// THE PLACEMENT: register #3's extension decision — a conflict dataset
// profile UNDER THE EXISTING `validation` workload — implemented as an
// evals-internal adapter. This file lives INSIDE src/lib/evals and imports
// FROM src/lib/conflicts: the import-isolation rule forbids the reverse
// direction only (no non-test src/ file outside the eval library may
// reference an evals module), so evals-internal composition is the sanctioned
// seam. No exhaustive workload switch, runner core, result-store format, or
// gate is touched; the CLI reaches this module through a mode-scoped dynamic
// import so its pinned static surface (contracts + runner) is unchanged.
//
// WHAT THE PROFILE IS: dataset builders that derive, from the FROZEN fixture
// corpus and the COMMITTED golden results, two fully valid inherited
// validation datasets (conflict-roca-v1 / conflict-iran-v1 — the ids pinned
// in src/lib/conflicts/eval-profile.ts). Every case IS a ValidationEvalCase:
// takeaways = the selected edition's declared unit texts (synthetic,
// authored, ≤500 chars), claims = the scenario evidence as
// ClaimForValidation rows, labels = the committed oracle pair table's
// full-coverage truth. The conflict extension rides ADDITIVELY inside the
// case reference (conflictMeta + the expected ConflictResultV1) exactly as
// eval-profile.ts defines — no inherited field is redefined.
//
// SCORING: the deterministic fixture-oracle path runs the REAL Phase-4
// pipeline (scoreFixtureScenario — loader → both P3 assemblies → oracle or
// vote-variant adapter → pure scorer) per case, validates the produced
// result with assertPersistableConflictResultV1, byte-compares it against
// the committed golden through the same canonical goldenBytes mechanism the
// drift gate uses, and emits an INHERITED EvalCaseResult whose checks object
// carries the additive versioned conflict payload (`conflictResultV1`) on
// top of the minimal {pass, failures} contract — the same pattern every
// other workload's checks object uses. Deterministic checks (golden
// byte-compare + persistence gate) are the only scoring authority; human
// labels stay in the dataset reference; humanLabels/graderJudgments stay
// null (RESERVED, exactly as the inherited plane requires).
//
// STORED-ERROR DISCIPLINE: results files are durable, so `failures` strings
// carry STRUCTURAL key paths only — never unit text, claim text, or any
// caller-supplied value.
//
// ZERO PROVIDER CONTACT, structurally: this module imports no SDK, reads no
// environment, constructs no client, and the fixture-oracle/vote-variant
// matchers dispatch nothing. There is NO live path for the conflict profile
// in this workstream — the CLI refuses --execute-live --profile conflict.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFLICT_EVAL_DATASET_IDS,
  CONFLICT_EVAL_WORKLOAD,
  validateConflictCaseMetaV1,
  validateConflictResultIdentityV1,
  type ConflictEvalDatasetId,
  type ConflictReferenceExtension,
  type ConflictResultV1,
  type ConflictValidationEvalCaseOf,
} from "../conflicts/eval-profile";
import {
  loadConflictFixtureScenarios,
  selectedScenarioReport,
  type ConflictFixtureScenario,
} from "../conflicts/fixture-corpus";
import { declaredUnitsOf, oraclePairsFor } from "../conflicts/fixture-matcher";
import {
  GOLDEN_RESULTS_FILE,
  goldenBytes,
  matcherFixtureVariantsOf,
  scoreFixtureScenario,
  voteVariantMatcher,
  type MatcherFixtureVariant,
} from "../conflicts/goldens";
import { classifyTimeAnchor, parseIsoInstantMs } from "../conflicts/instants";
import { assertPersistableConflictResultV1 } from "../conflicts/eval-profile";
import { stableStringify } from "../conflicts/serialization";
import { CONFLICT_IDS, type ConflictId } from "../conflicts/vocabulary";
import type {
  AnalysisEvalDataset,
  EvalCaseResult,
  EvalPartition,
  EvalResultsFile,
  EvalSplit,
  ValidationEvalCase,
} from "./contracts";
import { OFFLINE_CONFIG_KEY, sha256 } from "./runner";

export { CONFLICT_IDS };
export type { ConflictId };

/** The composed case/dataset types (eval-profile.ts composition aliases over
 *  the REAL inherited contracts — assignable by construction, no casts). */
export type ConflictEvalCase = ConflictValidationEvalCaseOf<ValidationEvalCase>;

/** Deterministic dataset stamp: the derivation date of the v1 profile, NOT a
 *  wall clock — two builds must be byte-identical. */
export const CONFLICT_DATASET_CREATED_AT = "2026-08-17T00:00:00Z";

// ---------------------------------------------------------------------------
// The case plan (fixed, documented; partition/split are judgment calls
// recorded here once — changing an assignment is a reviewable dataset change)
// ---------------------------------------------------------------------------

export interface ConflictCasePlanEntry {
  caseId: string;
  scenarioId: string;
  /** matcher-ladder vote variant id, or null for the oracle path */
  variantId: string | null;
  partition: EvalPartition;
  split: EvalSplit;
}

const plan = (
  caseId: string,
  scenarioId: string,
  variantId: string | null,
  partition: EvalPartition,
  split: EvalSplit,
): ConflictCasePlanEntry => ({ caseId, scenarioId, variantId, partition, split });

/** Golden-covered scenarios per conflict (the committed golden file is the
 *  expected-result authority; scenarios without a golden are not cases).
 *  Heldout coverage per conflict = 1 typical / 1 edge / 1 adversarial, so a
 *  future LIVE baseline-vs-candidate run on these datasets can clear the
 *  inherited heldout minima. */
export const CONFLICT_CASE_PLANS: Readonly<Record<ConflictId, readonly ConflictCasePlanEntry[]>> = {
  russia_ukraine: [
    plan("roca-ua-only-001b", "roca-ua-only-001b", null, "typical", "development"),
    plan("roca-retention-gap-008b", "roca-retention-gap-008b", null, "typical", "heldout"),
    plan("roca-compound-partial-009b", "roca-compound-partial-009b", null, "edge", "development"),
    plan("roca-quiet-day-010b", "roca-quiet-day-010b", null, "edge", "heldout"),
    plan("cc-window-rung2-017", "cc-window-rung2-017", null, "edge", "development"),
    plan("cc-regen-after-instant-007", "cc-regen-after-instant-007", null, "adversarial", "development"),
    plan(
      "cc-matcher-failclosed-013b-a-one-valid-round",
      "cc-matcher-failclosed-013b",
      "A-one-valid-round",
      "adversarial",
      "development",
    ),
    plan(
      "cc-matcher-failclosed-013b-b-zero-valid-rounds",
      "cc-matcher-failclosed-013b",
      "B-zero-valid-rounds",
      "adversarial",
      "heldout",
    ),
  ],
  iran_regional: [
    plan("iran-direct-kinetic-001", "iran-direct-kinetic-001", null, "typical", "development"),
    plan("iran-two-events-011", "iran-two-events-011", null, "typical", "heldout"),
    plan("iran-gulf-unavailable-010b", "iran-gulf-unavailable-010b", null, "edge", "development"),
    plan("cc-publication-gap-002", "cc-publication-gap-002", null, "edge", "heldout"),
    plan("cc-state-zero-empty-015", "cc-state-zero-empty-015", null, "edge", "development"),
    plan("cc-vague-claim-019", "cc-vague-claim-019", null, "adversarial", "heldout"),
  ],
};

// ---------------------------------------------------------------------------
// Canonical source bytes → datasetContentHash (the house mechanism hashes the
// dataset FILE bytes; a BUILT dataset hashes its canonical byte sources —
// the fixture scenario files that feed it plus the committed golden file, so
// an input OR reference edit changes the hash, refuses a resume, and
// degrades stale reports, exactly like the generic datasets)
// ---------------------------------------------------------------------------

export function conflictDatasetSourceFiles(conflictId: ConflictId): readonly string[] {
  const scenarioFile =
    conflictId === "russia_ukraine"
      ? "fixtures/conflicts/roca-scenarios-v1.json"
      : "fixtures/conflicts/iran-scenarios-v1.json";
  return [scenarioFile, "fixtures/conflicts/crosscutting-scenarios-v1.json", GOLDEN_RESULTS_FILE];
}

export function conflictDatasetContentHash(
  conflictId: ConflictId,
  dataset?: AnalysisEvalDataset,
): string {
  const parts = conflictDatasetSourceFiles(conflictId).map(
    (f) => `${f}:${sha256(readFileSync(join(process.cwd(), f)))}`,
  );
  // derivation coverage (Gate-5 control-plane MINOR-2): hashing only the
  // source FILES left the derivation logic (CONFLICT_CASE_PLANS /
  // caseInputOf / caseLabelsOf / the pinned createdAt) outside the dataset
  // identity — an edit there changed the BUILT dataset while the hash stayed
  // equal, so resume did not refuse. The built dataset is deterministic
  // (createdAt pinned), so its canonical serialization is folded in.
  // buildConflictEvalRun passes its already-built dataset; a bare call
  // builds one (one level, no recursion — the build never calls back in
  // without a dataset).
  const built = dataset ?? buildConflictEvalRun(conflictId).dataset;
  parts.push(`dataset:${sha256(stableStringify(built))}`);
  return sha256(parts.join("\n"));
}

// ---------------------------------------------------------------------------
// Dataset building
// ---------------------------------------------------------------------------

interface ScorableEntry {
  plan: ConflictCasePlanEntry;
  scenario: ConflictFixtureScenario;
  variant: MatcherFixtureVariant | null;
  expected: ConflictResultV1;
  goldenKey: string;
}

export interface ConflictEvalRun {
  conflictId: ConflictId;
  dataset: AnalysisEvalDataset;
  /** sha256 over the canonical fixture+golden source bytes (see above) */
  contentHash: string;
  entries: ReadonlyMap<string, ScorableEntry>;
}

function loadCommittedGoldens(): Record<string, ConflictResultV1> {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), GOLDEN_RESULTS_FILE), "utf8"),
  ) as Record<string, ConflictResultV1>;
  return raw;
}

function minInstant(values: Array<string | null>): string | null {
  let best: { ms: number; raw: string } | null = null;
  for (const v of values) {
    if (v === null) continue;
    const ms = parseIsoInstantMs(v);
    if (ms === null) continue; // malformed is treated as missing, never guessed
    if (best === null || ms < best.ms) best = { ms, raw: v };
  }
  return best?.raw ?? null;
}

function caseInputOf(scenario: ConflictFixtureScenario): ValidationEvalCase["input"] {
  const selected = selectedScenarioReport(scenario);
  const units = selected === null ? [] : declaredUnitsOf(scenario.conflictId, selected);
  const published = selected === null ? null : classifyTimeAnchor(selected.publishedAt);
  return {
    takeaways: units.map((u) => ({ index: u.ordinal, text: u.text })),
    claims: scenario.evidence.map((c) => ({
      claimId: c.claimId,
      text: c.text,
      hedging: c.hedging,
      docCount: c.docs.length,
      earliestDocAt: minInstant(c.docs.map((d) => d.publishedAt ?? d.fetchedAt)),
      earliestFetchedAt: minInstant(c.docs.map((d) => d.fetchedAt)),
    })),
    iswPublishedAt: published !== null && published.treatment === "present" ? published.raw : null,
  };
}

/** Human ground truth from the COMMITTED oracle pair table: per declared
 *  unit, the lowest-claimId FULL-coverage pair (deterministic tie-break), or
 *  null. Partial-only coverage labels null — a compound unit not fully
 *  covered has no single genuinely-matching claim. Population filtering is
 *  deliberately NOT applied here: labels are matcher-level truth; the
 *  conflict scoring authority (the P4 pipeline) applies population
 *  discipline itself. */
function caseLabelsOf(
  scenario: ConflictFixtureScenario,
): Array<{ takeawayIndex: number; claimId: number | null }> {
  const selected = selectedScenarioReport(scenario);
  if (selected === null) return [];
  const units = declaredUnitsOf(scenario.conflictId, selected);
  const pairs = oraclePairsFor(scenario, selected);
  return units.map((u) => {
    const full = pairs
      .filter((p) => p.unitId === u.unitId && p.coverage === "full")
      .map((p) => p.claimId)
      .sort((a, b) => a - b);
    return { takeawayIndex: u.ordinal, claimId: full.length > 0 ? full[0] : null };
  });
}

/** Build one conflict dataset + its scorable entries. Fail-closed: a missing
 *  scenario, golden key, or variant — or a golden whose identity does not
 *  validate or whose conflict disagrees — throws instead of building a
 *  silently-wrong dataset. */
export function buildConflictEvalRun(conflictId: ConflictId): ConflictEvalRun {
  const scenarios = new Map(loadConflictFixtureScenarios().map((s) => [s.id, s]));
  const goldens = loadCommittedGoldens();
  const entries = new Map<string, ScorableEntry>();
  const cases: ConflictEvalCase[] = [];

  for (const planEntry of CONFLICT_CASE_PLANS[conflictId]) {
    const scenario = scenarios.get(planEntry.scenarioId);
    if (scenario === undefined) {
      throw new Error(`conflict profile: scenario ${planEntry.scenarioId} not in the corpus`);
    }
    if (scenario.conflictId !== conflictId) {
      throw new Error(
        `conflict profile: scenario ${planEntry.scenarioId} belongs to ${scenario.conflictId}, not ${conflictId}`,
      );
    }
    const goldenKey =
      planEntry.variantId === null
        ? planEntry.scenarioId
        : `${planEntry.scenarioId}#${planEntry.variantId}`;
    const expected = goldens[goldenKey];
    if (expected === undefined) {
      throw new Error(`conflict profile: no committed golden for ${goldenKey}`);
    }
    const identityIssues = validateConflictResultIdentityV1(expected);
    if (identityIssues.length > 0) {
      throw new Error(
        `conflict profile: committed golden ${goldenKey} fails identity validation (${identityIssues.length} issue(s))`,
      );
    }
    if (expected.conflictId !== conflictId) {
      throw new Error(`conflict profile: golden ${goldenKey} is for ${expected.conflictId}, not ${conflictId}`);
    }
    const variant =
      planEntry.variantId === null
        ? null
        : matcherFixtureVariantsOf(scenario).find((v) => v.variantId === planEntry.variantId) ?? null;
    if (planEntry.variantId !== null && variant === null) {
      throw new Error(`conflict profile: scenario ${planEntry.scenarioId} has no variant ${planEntry.variantId}`);
    }

    const reference: ValidationEvalCase["reference"] & ConflictReferenceExtension = {
      labels: caseLabelsOf(scenario),
      conflictMeta: {
        version: 1,
        conflictId,
        datasetId: CONFLICT_EVAL_DATASET_IDS[conflictId],
      },
      conflictResultV1: expected,
    };
    const metaIssues = validateConflictCaseMetaV1(reference.conflictMeta);
    if (metaIssues.length > 0) {
      throw new Error(`conflict profile: case meta invalid for ${planEntry.caseId}`);
    }

    cases.push({
      id: planEntry.caseId,
      workload: CONFLICT_EVAL_WORKLOAD,
      partition: planEntry.partition,
      split: planEntry.split,
      provenance: "derived-2026-08-17 from the frozen fixture corpus + committed golden results (deterministic)",
      notes: `scenario ${planEntry.scenarioId}${planEntry.variantId === null ? "" : ` variant ${planEntry.variantId}`}; scored by the real P4 pipeline, byte-compared to golden ${goldenKey}`,
      input: caseInputOf(scenario),
      reference,
      offline: { expectation: "pass" },
    });
    entries.set(planEntry.caseId, { plan: planEntry, scenario, variant, expected, goldenKey });
  }

  const dataset: AnalysisEvalDataset = {
    datasetVersion: CONFLICT_EVAL_DATASET_IDS[conflictId],
    workload: CONFLICT_EVAL_WORKLOAD,
    createdAt: CONFLICT_DATASET_CREATED_AT,
    cases,
  };
  return {
    conflictId,
    dataset,
    contentHash: conflictDatasetContentHash(conflictId, dataset),
    entries,
  };
}

export function conflictIdForDataset(datasetVersion: ConflictEvalDatasetId): ConflictId {
  const found = (Object.keys(CONFLICT_EVAL_DATASET_IDS) as ConflictId[]).find(
    (id) => CONFLICT_EVAL_DATASET_IDS[id] === datasetVersion,
  );
  if (found === undefined) throw new Error(`unknown conflict dataset ${datasetVersion}`);
  return found;
}

// ---------------------------------------------------------------------------
// Offline scoring (deterministic; the REAL P4 pipeline per case)
// ---------------------------------------------------------------------------

/** The conflict checks object: the minimal inherited {pass, failures}
 *  contract plus the ADDITIVE VERSIONED conflict payload — never a rival
 *  top-level schema. `failures` carries structural key paths only. */
export interface ConflictValidationCaseChecks {
  pass: boolean;
  failures: string[];
  conflictChecksVersion: 1;
  goldenKey: string;
  goldenByteMatch: boolean;
  state: ConflictResultV1["state"];
  conflictResultV1: ConflictResultV1;
}

const MAX_DIVERGENT_PATHS = 12;

/** Structural divergence paths between two JSON-ish values. VALUES ARE NEVER
 *  EMITTED — key paths only (stored-error discipline: these strings land in
 *  durable results files). */
export function divergentPaths(got: unknown, want: unknown): string[] {
  const out: string[] = [];
  walkDivergence(got, want, "$", out);
  if (out.length > MAX_DIVERGENT_PATHS) {
    const extra = out.length - MAX_DIVERGENT_PATHS;
    return [...out.slice(0, MAX_DIVERGENT_PATHS), `(+${extra} more divergent path(s))`];
  }
  return out;
}

function walkDivergence(a: unknown, b: unknown, path: string, out: string[]): void {
  if (a === b) return;
  const aObj = typeof a === "object" && a !== null;
  const bObj = typeof b === "object" && b !== null;
  if (!aObj || !bObj) {
    out.push(path);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(path);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    if (a.length !== b.length) out.push(`${path}.length`);
    for (let i = 0; i < len; i++) {
      walkDivergence(a[i], b[i], `${path}[${i}]`, out);
    }
    return;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of [...keys].sort()) {
    walkDivergence(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      `${path}.${key}`,
      out,
    );
  }
}

/** Score one conflict case through the real P4 pipeline and emit an INHERITED
 *  EvalCaseResult (offline conventions: attempt 0, null latency/tokens/cost —
 *  zero-cost recorded honestly, nothing fabricated). */
export async function scoreConflictOfflineCase(
  run: ConflictEvalRun,
  caseId: string,
  repetition: number,
  runId: string,
): Promise<EvalCaseResult> {
  const entry = run.entries.get(caseId);
  if (entry === undefined) throw new Error(`conflict profile: unknown case ${caseId}`);
  const result =
    entry.variant === null
      ? await scoreFixtureScenario(entry.scenario)
      : await scoreFixtureScenario(entry.scenario, { matcher: voteVariantMatcher(entry.variant) });
  // the binding persistence gate: an unauditable scored result must never
  // ride into a durable results file (unavailable/gap variants pass trivially)
  assertPersistableConflictResultV1(result);

  const gotBytes = goldenBytes(result);
  const wantBytes = goldenBytes(entry.expected);
  const goldenByteMatch = gotBytes === wantBytes;
  const failures = goldenByteMatch
    ? []
    : [
        `recomputed conflict result diverges from committed golden ${entry.goldenKey} at: ${divergentPaths(
          JSON.parse(gotBytes),
          JSON.parse(wantBytes),
        ).join(", ")}`,
      ];
  const checks: ConflictValidationCaseChecks = {
    pass: goldenByteMatch,
    failures,
    conflictChecksVersion: 1,
    goldenKey: entry.goldenKey,
    goldenByteMatch,
    state: result.state,
    conflictResultV1: result,
  };
  return {
    caseId,
    datasetVersion: run.dataset.datasetVersion,
    runId,
    configKey: OFFLINE_CONFIG_KEY,
    repetition,
    attempt: 0,
    status: "scored",
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    estUsd: null,
    checks,
    humanLabels: null,
    graderJudgments: null,
    rawOutputDigest: sha256(gotBytes),
    fixtureId: entry.variant === null ? entry.plan.scenarioId : entry.goldenKey,
  };
}

// ---------------------------------------------------------------------------
// Conflict report section (formatting the generic scorecard cannot express)
// ---------------------------------------------------------------------------

function headlineCell(result: ConflictResultV1): string {
  if (result.state !== "scored") {
    return `unavailable (${result.unavailableReason}) — no score exists; distinct from 0`;
  }
  const cr = result.headline.corpusRecall;
  const pr = result.headline.publishedRetention;
  return `corpus ${cr.matched}/${cr.denominator} · retained ${pr.matched}/${pr.denominator}`;
}

/** Markdown section summarizing the conflict payloads in a results file:
 *  per-case state, Key-Takeaway headline ratios (numerator/denominator, both
 *  populations), matcher rung, and run group. Identity strings only — the
 *  payloads structurally carry no unit/claim text. */
export function renderConflictSectionMarkdown(
  run: ConflictEvalRun,
  rf: EvalResultsFile,
  showHeldoutDetail = false,
): string {
  const lines: string[] = [];
  const splitOf = new Map(run.dataset.cases.map((c) => [c.id, c.split]));
  lines.push(`### Conflict profile detail — ${run.conflictId} (${run.dataset.datasetVersion})`);
  lines.push("");
  lines.push(
    "Headline label: \"Key Takeaway benchmark coverage\" — agreement with the named expert benchmark, " +
      "never accuracy; ISW/CTP reads many of the same open sources as BNOW, so agreement is not " +
      "independent confirmation. `unavailable` is a provenance statement, never a 0%.",
  );
  lines.push("");
  if (!showHeldoutDetail) {
    // the inherited scorecard convention (renderAnalysisScorecardMarkdown):
    // heldout rows show status only by default so a committed report cannot
    // become a heldout iteration channel
    lines.push(
      "_Heldout rows mask coverage/rung/run-group detail by default so this section cannot become a heldout iteration channel (`--show-heldout-detail` reveals it for operator calibration)._",
    );
    lines.push("");
  }
  lines.push("| case | rep | state | Key Takeaway coverage (matched/denominator) | matcher rung | run group |");
  lines.push("|---|---|---|---|---|---|");
  const rows = Object.values(rf.results).sort((a, b) =>
    a.caseId === b.caseId ? a.repetition - b.repetition : a.caseId < b.caseId ? -1 : 1,
  );
  for (const r of rows) {
    const checks = r.checks as Partial<ConflictValidationCaseChecks>;
    const payload = checks.conflictResultV1;
    if (payload === undefined) continue;
    const masked = splitOf.get(r.caseId) === "heldout" && !showHeldoutDetail;
    if (masked) {
      lines.push(
        `| ${r.caseId} | ${r.repetition} | ${payload.state} | heldout (masked) | heldout (masked) | heldout (masked) |`,
      );
      continue;
    }
    const rung = payload.state === "scored" ? payload.matcherRung : "—";
    const group = payload.state === "scored" ? `\`${payload.runGroupKey ?? "—"}\`` : "—";
    lines.push(
      `| ${r.caseId} | ${r.repetition} | ${payload.state} | ${headlineCell(payload)} | ${rung} | ${group} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
