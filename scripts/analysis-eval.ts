import "./env";

// Analysis-eval control plane runner (quality-foundation program, 2026-08-17).
//
// Evaluates the analysis workloads — map extraction, reduce clustering, digest
// synthesis, ISW-validation matching — against the checked-in datasets under
// docs/evals/analysis/. All scoring/aggregation/gate logic is pure and lives
// in src/lib/evals/ (unit-tested, no I/O); this file is ONLY CLI args, file
// I/O, and mode wiring.
//
// Modes (mutually exclusive; default --offline):
//
//   --validate-dataset [--workload X]
//       Validate every dataset file against the contract validators. Pure: no
//       DB, no provider, no client construction. Exit 2 on any violation.
//
//   --estimate [--workload X] [--model M] [--effort E] [--repetitions N]
//       Conservative cost/run-count plan for a HYPOTHETICAL live run, from the
//       documented token heuristics in src/lib/evals/runner.ts (chars×0.32
//       blend + per-workload output budgets — deliberate over-estimates). No
//       provider, no DB, no client construction, nothing written.
//
//   --offline [--workload X] [--fresh] [--only id,...] [--dev]   (default)
//       Deterministic scoring of the committed fixture outputs through the
//       REAL pipeline functions. No provider, no DB. Durable per-case result
//       writes to docs/evals/analysis/results/<workload>-offline-fixtures.json,
//       resumable by (caseId, repetition).
//
//   --report [--workload X] [--out path.md] [--show-heldout-detail]
//       Read saved result artifacts -> scorecard markdown + JSON (same
//       basename). No provider, no DB. Verdicts per src/lib/evals/gates.ts
//       preset thresholds, including the RESULTS-side completeness gate: only
//       a scope-"full" file with every (caseId, repetition) key present can
//       reach pass/fail — a --dev or --only file reads insufficient_data.
//       Heldout rows show status only unless --show-heldout-detail (the
//       default output must not become a heldout iteration channel). Every
//       skipped/invalid/incomplete entry is surfaced loudly — no silent caps.
//
//   --execute-live --workload X --model M [--effort E] --db-ack <host>
//                  [--repetitions N] [--only id,...] [--fresh] [--dev]
//                  [--allow-heldout-rerun]
//       LIVE candidate evaluation (PAID). Refuses loudly BEFORE any client
//       construction unless ALL of: the explicit flag, EVAL_DATABASE_URL set
//       (DATABASE_URL is never read — the spend ledger writes to the eval
//       branch you explicitly acknowledge via --db-ack <host>), a real
//       OPENAI_API_KEY, and both caps (LLM_SPRINT_USD_CAP + EVAL_USD_CAP_DAILY;
//       the fail-closed openai_eval SpendGuard refuses without them). Results
//       write under results/live-* (gitignored — live results are never
//       committed). A budget stop aborts the whole run with an INVALID
//       verdict; completed cases stay durable and a rerun resumes. A --only
//       selection touching HELDOUT cases refuses without the explicit
//       --allow-heldout-rerun flag (a stochastic failure must not be
//       re-rolled to a pass), and any key replaced by a later run stays
//       visible in the scorecard's run-provenance line.
//
// --fresh and --only are mutually exclusive (as in scripts/ask-eval.ts).
// --dev excludes the heldout split (see docs/evals/analysis/README.md for the
// heldout discipline: never iterate prompts against heldout results).
//
// CONFLICT PROFILE (conflict-evaluations Phase 5; decision register #3):
//
//   --profile conflict [--conflict russia_ukraine,iran_regional] + any of
//   --validate-dataset / --estimate / --offline (default) / --report
//   --capacity <profile>   capacity-quality matrix dimension (baseline default;
//                          knob env overrides + configKey suffix, see
//                          src/lib/evals/capacity-profiles.ts)
//   --capacity-matrix      per-cell dry-run estimates -> CAPACITY-MATRIX-ESTIMATE.md
//       The conflict dataset profile UNDER THE EXISTING validation workload:
//       datasets conflict-roca-v1 / conflict-iran-v1 are BUILT
//       deterministically from the frozen fixture corpus + committed golden
//       results (src/lib/evals/conflict-validation-profile.ts, reached via a
//       mode-scoped dynamic import so this file's static import surface stays
//       contracts+runner). Offline scoring runs the REAL conflict P4 pipeline
//       per case and byte-compares against the committed goldens; results
//       write to results/<datasetVersion>-offline-fixtures.json with the
//       inherited resume/result-key semantics. All four modes are
//       zero-provider-contact; --execute-live REFUSES with --profile conflict
//       (the conflict profile has no live dispatch path in this workstream).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ANALYSIS_EVAL_WORKLOADS,
  validateAnalysisEvalDataset,
  type AnalysisEvalDataset,
  type AnalysisEvalWorkload,
  type EvalResultsFile,
} from "../src/lib/evals/contracts";
import {
  OFFLINE_CONFIG_KEY,
  ZERO_METER,
  aggregateResults,
  assertLiveOnlySelection,
  buildAnalysisEstimatePlan,
  buildWorkloadScorecard,
  currentEnvKnobs,
  emptyEvalResultsFile,
  heldoutCoverage,
  liveConfigKey,
  BASELINE_PROFILE,
  CAPACITY_PROFILES,
  UNIMPLEMENTED_MATRIX_CELLS,
  applyCapacityProfile,
  capacityProfileNames,
  withCapacityProfileKey,
  mergeEvalResults,
  offlineIdentity,
  pendingWork,
  renderAnalysisScorecardMarkdown,
  resumeIdentityMismatch,
  runScopeFor,
  scoreOfflineCase,
  sha256,
  type ResultsFileHeader,
  type ScorecardDetailBlock,
  type WorkloadScorecard,
} from "../src/lib/evals/runner";
import { ANALYSIS_DEFAULT_MODEL } from "../src/lib/llm/model-config";
import { LlmBudgetError } from "../src/lib/usage/llm-guard";

const EVALS_DIR = path.join(__dirname, "..", "docs", "evals", "analysis");
const RESULTS_DIR = path.join(EVALS_DIR, "results");
const DEFAULT_REPORT_PATH = path.join(EVALS_DIR, "ANALYSIS-EVAL-SCORECARD.md");

/** One dataset file per workload; bump here when a datasetVersion bumps. */
const DATASET_FILES: Record<AnalysisEvalWorkload, string> = {
  map: "map-v1.json",
  reduce: "reduce-v1.json",
  digest: "digest-v1.json",
  validation: "validation-v1.json",
};

// ---- CLI args -----------------------------------------------------------------

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseWorkloads(required: boolean): AnalysisEvalWorkload[] {
  const raw = flagValue("workload");
  if (!raw) {
    if (required) {
      console.error(`--workload is required for this mode (one of: ${ANALYSIS_EVAL_WORKLOADS.join(", ")})`);
      process.exit(2);
    }
    return [...ANALYSIS_EVAL_WORKLOADS];
  }
  const picked = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = picked.filter((w) => !(ANALYSIS_EVAL_WORKLOADS as readonly string[]).includes(w));
  if (bad.length > 0) {
    console.error(`--workload: unknown workload(s): ${bad.join(", ")} (valid: ${ANALYSIS_EVAL_WORKLOADS.join(", ")})`);
    process.exit(2);
  }
  return picked as AnalysisEvalWorkload[];
}

function parseRepetitions(): number {
  const raw = flagValue("repetitions");
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    console.error("--repetitions must be an integer in 1..10");
    process.exit(2);
  }
  return n;
}

function parseOnly(): string[] | null {
  const raw = flagValue("only");
  return raw !== undefined ? raw.split(",").map((s) => s.trim()).filter(Boolean) : null;
}

// ---- file I/O -----------------------------------------------------------------

interface LoadedDataset {
  ds: AnalysisEvalDataset;
  /** sha256 over the dataset FILE BYTES — covers inputs AND references
   *  (MAJOR-1/m8); a post-run edit is detectable and refuses a resume */
  contentHash: string;
}

function loadDataset(workload: AnalysisEvalWorkload): LoadedDataset {
  const p = path.join(EVALS_DIR, DATASET_FILES[workload]);
  if (!existsSync(p)) {
    console.error(`missing dataset: ${p}`);
    process.exit(2);
  }
  const bytes = readFileSync(p);
  const ds = JSON.parse(bytes.toString("utf8")) as AnalysisEvalDataset;
  const errs = validateAnalysisEvalDataset(ds, workload);
  if (errs.length > 0) {
    console.error(`dataset ${p} is INVALID:\n  ${errs.join("\n  ")}`);
    process.exit(2);
  }
  return { ds, contentHash: sha256(bytes) };
}

function resultsPath(workload: AnalysisEvalWorkload, configKey: string): string {
  // offline keys (incl. capacity-profiled "offline-fixtures+<profile>") carry
  // no prefix; everything else is a live run artifact
  const prefix = configKey.startsWith(OFFLINE_CONFIG_KEY) ? "" : "live-";
  return path.join(RESULTS_DIR, `${prefix}${workload}-${configKey}.json`);
}

// The capacity profile active for this invocation (--capacity; default
// baseline). Applied to process.env BEFORE any dataset/identity work in
// main(), so every knob reader — prompts, identity, estimates, live dispatch
// — sees the profile through the existing knob functions.
let activeCapacityProfile = BASELINE_PROFILE;
function profiledKey(base: string): string {
  return withCapacityProfileKey(base, activeCapacityProfile);
}

function loadResultsAtPath(p: string): EvalResultsFile | null {
  if (!existsSync(p)) return null;
  const rf = JSON.parse(readFileSync(p, "utf8")) as EvalResultsFile;
  if (rf.datasetContentHash === undefined || rf.requestedRepetitions === undefined || rf.scope === undefined) {
    console.error(
      `${p} predates the completeness/identity header (MAJOR-1/-3 remediation) — delete it and rerun with --fresh`,
    );
    process.exit(2);
  }
  return rf;
}

function loadResults(workload: AnalysisEvalWorkload, configKey: string): EvalResultsFile | null {
  return loadResultsAtPath(resultsPath(workload, configKey));
}

function saveResultsAtPath(p: string, rf: EvalResultsFile): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(p, JSON.stringify(rf, null, 2) + "\n");
}

function saveResults(rf: EvalResultsFile): void {
  saveResultsAtPath(resultsPath(rf.workload, rf.configKey), rf);
}

// ---- --validate-dataset --------------------------------------------------------

function modeValidate(workloads: AnalysisEvalWorkload[]): void {
  let bad = 0;
  for (const w of workloads) {
    const p = path.join(EVALS_DIR, DATASET_FILES[w]);
    if (!existsSync(p)) {
      console.error(`[${w}] MISSING dataset file ${p}`);
      bad++;
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      console.error(`[${w}] UNPARSEABLE: ${e instanceof Error ? e.message : e}`);
      bad++;
      continue;
    }
    const errs = validateAnalysisEvalDataset(raw, w);
    if (errs.length > 0) {
      console.error(`[${w}] INVALID (${errs.length} violation(s)):\n  ${errs.join("\n  ")}`);
      bad++;
    } else {
      const ds = raw as AnalysisEvalDataset;
      const heldout = heldoutCoverage(ds);
      console.log(
        `[${w}] OK — ${ds.datasetVersion}: ${ds.cases.length} cases ` +
          `(heldout typical/edge/adversarial: ${heldout.typical}/${heldout.edge}/${heldout.adversarial})`,
      );
    }
  }
  if (bad > 0) process.exit(2);
  console.log("all selected datasets valid. No DB, no provider, nothing written.");
}

// ---- --estimate ----------------------------------------------------------------

function modeEstimate(workloads: AnalysisEvalWorkload[], model: string, repetitions: number): void {
  let grand = 0;
  for (const w of workloads) {
    const { ds } = loadDataset(w);
    const plan = buildAnalysisEstimatePlan(ds, model, repetitions);
    console.log(`\n[${w}] ${ds.datasetVersion} — model ${model}, ${repetitions} repetition(s):`);
    console.log(
      `  calls ${plan.totalCalls} · est prompt tok ${plan.totalPromptTokens} · est completion tok ${plan.totalCompletionTokens} · est $${plan.totalUsd.toFixed(4)}`,
    );
    grand += plan.totalUsd;
  }
  console.log(`\nestimated grand total: $${grand.toFixed(4)}`);
  console.log(
    "heuristics: chars×0.32 token blend + per-workload output budgets (src/lib/evals/runner.ts EST_* constants) — deliberate over-estimates.",
  );
  console.log("estimate only — no DB connection, no client construction, no LLM calls, nothing written.");
}

// ---- --offline -----------------------------------------------------------------

/** MAJOR-3: refuse a resume whose configuration/dataset identity drifted from
 *  the existing file's — silently mixing two configurations in one results
 *  file would corrupt every downstream verdict. */
function refuseOnIdentityDrift(existing: EvalResultsFile | null, header: ResultsFileHeader, fresh: boolean): void {
  if (existing === null || fresh) return;
  const mismatch = resumeIdentityMismatch(existing, header);
  if (mismatch !== null) {
    console.error(
      `[${header.workload}/${header.configKey}] REFUSED: results-file identity changed — use --fresh or a new configKey.\n  ${mismatch}`,
    );
    process.exit(2);
  }
}

function modeOffline(
  workloads: AnalysisEvalWorkload[],
  opts: { fresh: boolean; onlyIds: string[] | null; devOnly: boolean },
): void {
  for (const w of workloads) {
    const { ds, contentHash } = loadDataset(w);
    const header: ResultsFileHeader = {
      workload: w,
      configKey: profiledKey(OFFLINE_CONFIG_KEY),
      datasetVersion: ds.datasetVersion,
      datasetContentHash: contentHash,
      identity: offlineIdentity(ds),
      requestedRepetitions: 1,
      scope: runScopeFor(opts.onlyIds, opts.devOnly),
      envKnobs: currentEnvKnobs(),
    };
    const existing = loadResults(w, profiledKey(OFFLINE_CONFIG_KEY));
    refuseOnIdentityDrift(existing, header, opts.fresh);
    const { work, unknownIds, excludedHeldout } = pendingWork(ds, existing, {
      repetitions: 1,
      fresh: opts.fresh,
      onlyIds: opts.onlyIds,
      devOnly: opts.devOnly,
    });
    if (unknownIds.length > 0) {
      console.error(`[${w}] --only: unknown case id(s): ${unknownIds.join(", ")} — refusing`);
      process.exit(2);
    }
    if (excludedHeldout > 0) console.log(`[${w}] --dev: ${excludedHeldout} heldout case(s) excluded`);
    const already = Object.keys(existing?.results ?? {}).length;
    if (work.length === 0) {
      console.log(`[${w}] nothing to do — ${already} result(s) already recorded (use --fresh to rerun)`);
      continue;
    }
    console.log(`[${w}] scoring ${work.length} case(s) offline (${already} already recorded)`);
    let rf = (opts.fresh ? null : existing) ?? emptyEvalResultsFile(header);
    const runId = `offline-${ds.datasetVersion}`;
    for (const item of work) {
      const result = scoreOfflineCase(item.evalCase, ds.datasetVersion, runId, profiledKey(OFFLINE_CONFIG_KEY));
      rf = mergeEvalResults(rf, header, [result], ZERO_METER, new Date());
      saveResults(rf); // durable after EVERY case (resumable-by-key)
      const expectation = "offline" in item.evalCase ? item.evalCase.offline.expectation : "pass";
      const machineryOk = result.checks.pass === (expectation === "pass");
      console.log(
        `  ${item.evalCase.id} [${item.evalCase.partition}/${item.evalCase.split}] status=${result.status} ` +
          `pass=${result.checks.pass} expectation=${expectation} machinery=${machineryOk ? "OK" : "MISMATCH"}`,
      );
      if (!machineryOk) {
        console.error(
          `  [${w}] MACHINERY MISMATCH on ${item.evalCase.id}: checks.pass=${result.checks.pass} but fixture expectation=${expectation} — failures: ${result.checks.failures.join("; ") || "(none)"}`,
        );
      }
    }
    console.log(`[${w}] done -> ${resultsPath(w, profiledKey(OFFLINE_CONFIG_KEY))}`);
  }
  console.log("\noffline scoring complete. Run with --report to build the scorecard. Zero provider contact.");
}

// ---- --report ------------------------------------------------------------------

function discoverConfigs(workload: AnalysisEvalWorkload): string[] {
  const configs = new Set<string>();
  if (existsSync(resultsPath(workload, OFFLINE_CONFIG_KEY))) configs.add(OFFLINE_CONFIG_KEY);
  if (existsSync(RESULTS_DIR)) {
    for (const f of readdirSync(RESULTS_DIR)) {
      const m = f.match(new RegExp(`^live-${workload}-(.+)\\.json$`));
      if (m) configs.add(m[1]);
      const off = f.match(new RegExp(`^${workload}-(${OFFLINE_CONFIG_KEY}\\+.+)\\.json$`));
      if (off) configs.add(off[1]);
    }
  }
  return [...configs].sort();
}

function modeReport(workloads: AnalysisEvalWorkload[], outPath: string, showHeldoutDetail: boolean): void {
  const scorecards: WorkloadScorecard[] = [];
  const detail: ScorecardDetailBlock[] = [];
  for (const w of workloads) {
    const { ds, contentHash } = loadDataset(w);
    const splitOf = Object.fromEntries(ds.cases.map((c) => [c.id, c.split]));
    const configs = discoverConfigs(w);
    if (configs.length === 0) {
      console.warn(`[${w}] no results found under ${RESULTS_DIR} — run --offline (or a live sweep) first`);
      continue;
    }
    for (const configKey of configs) {
      const rf = loadResults(w, configKey);
      if (!rf) continue;
      const live = !configKey.startsWith(OFFLINE_CONFIG_KEY);
      // baseline for pairwise candidate gates: the production default model's
      // LIVE results on the same dataset UNDER THE SAME capacity profile —
      // a profiled candidate must never be compared against an unprofiled
      // baseline (the knob-drift degrade would otherwise fire on every cell)
      const plusAt = configKey.lastIndexOf("+");
      const profileSuffix = plusAt === -1 ? "" : configKey.slice(plusAt);
      const baselineKey = `${ANALYSIS_DEFAULT_MODEL}${profileSuffix}`;
      const baseline = live && configKey !== baselineKey ? loadResults(w, baselineKey) : null;
      // re-review minor 1: compare against the dataset file AS IT EXISTS NOW —
      // an id-preserving reference edit after a run degrades the verdict
      scorecards.push(buildWorkloadScorecard(ds, rf, baseline, live, contentHash));
      detail.push({ workload: w, configKey, results: Object.values(rf.results), splitOf });
      if (rf.datasetContentHash !== contentHash) {
        console.error(
          `[${w}/${configKey}] DATASET CHANGED since this run (recorded ${rf.datasetContentHash.slice(0, 12)}, current ${contentHash.slice(0, 12)}) — verdict degraded to insufficient_data`,
        );
      }

      // no silent caps: surface every anomaly on stderr too
      const agg = aggregateResults(ds, rf, live);
      if (agg.cases.schemaInvalid > 0) console.error(`[${w}/${configKey}] ${agg.cases.schemaInvalid} schema-invalid result(s)`);
      if (agg.cases.providerError > 0) console.error(`[${w}/${configKey}] ${agg.cases.providerError} provider-error result(s)`);
      if (agg.cases.skipped > 0) console.error(`[${w}/${configKey}] ${agg.cases.skipped} skipped result(s)`);
      if (agg.machinery.total > 0 && agg.machinery.matched < agg.machinery.total) {
        console.error(
          `[${w}/${configKey}] MACHINERY MISMATCH: only ${agg.machinery.matched}/${agg.machinery.total} results match their fixture expectation`,
        );
      }
      const c = agg.completeness;
      if (!c.complete) {
        console.warn(
          `[${w}/${configKey}] INCOMPLETE (scope=${c.scope}): ${c.missingResults} of ${c.expectedResults} ` +
            `(caseId, repetition) key(s) missing (${c.missingHeldout} heldout) — verdict can only be insufficient_data`,
        );
      }
    }
  }
  if (scorecards.length === 0) {
    console.error("nothing to report");
    process.exit(2);
  }
  const generatedAt = new Date().toISOString();
  const headerNote =
    "Verdicts use the PRESET gates in src/lib/evals/gates.ts (completeness + aligned-heldout pairwise rules " +
    "pre-registered before any candidate result existed). The offline-fixtures config scores COMMITTED " +
    "fixture outputs (compliant AND deliberately violating ones) through the real pipeline functions — it is a " +
    "machinery proof, NOT a model evaluation; no paid calls are involved in producing it.";
  const md = renderAnalysisScorecardMarkdown({ generatedAt, scorecards, detail, headerNote, showHeldoutDetail });
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  writeFileSync(outPath.replace(/\.md$/, ".json"), JSON.stringify({ generatedAt, headerNote, scorecards }, null, 2) + "\n");
  console.log(`wrote scorecard -> ${outPath} (+ .json)`);
  for (const sc of scorecards) {
    console.log(`[${sc.workload}/${sc.judged.configKey}] VERDICT: ${sc.verdictResult.verdict}`);
  }
  console.log("report built from saved artifacts only — no DB, no provider, no client construction.");
}

// ---- --profile conflict (conflict-evaluations Phase 5; register #3) ------------
// The conflict profile rides the EXISTING validation workload; its module is
// dynamically imported per mode (like live-runner) so this file's static
// import surface stays contracts+runner. Every conflict mode below is
// zero-provider-contact: no live-runner import, no client construction.

type ConflictProfileModule = typeof import("../src/lib/evals/conflict-validation-profile");
type ConflictProfileId = ConflictProfileModule["CONFLICT_IDS"][number];

const CONFLICT_REPORT_PATH = path.join(EVALS_DIR, "CONFLICT-EVAL-SCORECARD.md");

function conflictResultsPath(datasetVersion: string, configKey: string): string {
  return path.join(RESULTS_DIR, `${datasetVersion}-${configKey}.json`);
}

function parseConflictIds(mod: ConflictProfileModule): ConflictProfileId[] {
  const raw = flagValue("conflict");
  if (!raw) return [...mod.CONFLICT_IDS];
  const picked = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = picked.filter((c) => !(mod.CONFLICT_IDS as readonly string[]).includes(c));
  if (bad.length > 0) {
    console.error(`--conflict: unknown conflict(s): ${bad.join(", ")} (valid: ${mod.CONFLICT_IDS.join(", ")})`);
    process.exit(2);
  }
  return picked as ConflictProfileId[];
}

function conflictModeValidate(mod: ConflictProfileModule, conflicts: ConflictProfileId[]): void {
  let bad = 0;
  for (const id of conflicts) {
    const run = mod.buildConflictEvalRun(id);
    const errs = validateAnalysisEvalDataset(run.dataset, "validation");
    if (errs.length > 0) {
      console.error(`[conflict/${id}] INVALID (${errs.length} violation(s)):\n  ${errs.join("\n  ")}`);
      bad++;
      continue;
    }
    const heldout = heldoutCoverage(run.dataset);
    console.log(
      `[conflict/${id}] OK — ${run.dataset.datasetVersion}: ${run.dataset.cases.length} cases ` +
        `(heldout typical/edge/adversarial: ${heldout.typical}/${heldout.edge}/${heldout.adversarial}) ` +
        `sourceHash=${run.contentHash.slice(0, 12)}`,
    );
  }
  if (bad > 0) process.exit(2);
  console.log("conflict datasets valid under the INHERITED validation-workload validator. No DB, no provider, nothing written.");
}

function conflictModeEstimate(
  mod: ConflictProfileModule,
  conflicts: ConflictProfileId[],
  model: string,
  repetitions: number,
): void {
  let grand = 0;
  for (const id of conflicts) {
    const run = mod.buildConflictEvalRun(id);
    const plan = buildAnalysisEstimatePlan(run.dataset, model, repetitions);
    console.log(`\n[conflict/${id}] ${run.dataset.datasetVersion} — model ${model}, ${repetitions} repetition(s):`);
    console.log(
      `  calls ${plan.totalCalls} · est prompt tok ${plan.totalPromptTokens} · est completion tok ${plan.totalCompletionTokens} · est $${plan.totalUsd.toFixed(4)}`,
    );
    grand += plan.totalUsd;
  }
  console.log(`\nestimated grand total: $${grand.toFixed(4)}`);
  console.log(
    "estimate describes a HYPOTHETICAL live validation-matcher run; no live conflict path exists in this workstream — no DB, no client construction, no LLM calls, nothing written.",
  );
}

async function conflictModeOffline(
  mod: ConflictProfileModule,
  conflicts: ConflictProfileId[],
  opts: { fresh: boolean; onlyIds: string[] | null; devOnly: boolean },
): Promise<void> {
  for (const id of conflicts) {
    const run = mod.buildConflictEvalRun(id);
    const header: ResultsFileHeader = {
      workload: "validation",
      configKey: OFFLINE_CONFIG_KEY,
      datasetVersion: run.dataset.datasetVersion,
      datasetContentHash: run.contentHash,
      identity: offlineIdentity(run.dataset),
      requestedRepetitions: 1,
      scope: runScopeFor(opts.onlyIds, opts.devOnly),
      envKnobs: currentEnvKnobs(),
    };
    const p = conflictResultsPath(run.dataset.datasetVersion, OFFLINE_CONFIG_KEY);
    const existing = loadResultsAtPath(p);
    refuseOnIdentityDrift(existing, header, opts.fresh);
    const { work, unknownIds, excludedHeldout } = pendingWork(run.dataset, existing, {
      repetitions: 1,
      fresh: opts.fresh,
      onlyIds: opts.onlyIds,
      devOnly: opts.devOnly,
    });
    if (unknownIds.length > 0) {
      console.error(`[conflict/${id}] --only: unknown case id(s): ${unknownIds.join(", ")} — refusing`);
      process.exit(2);
    }
    if (excludedHeldout > 0) console.log(`[conflict/${id}] --dev: ${excludedHeldout} heldout case(s) excluded`);
    const already = Object.keys(existing?.results ?? {}).length;
    if (work.length === 0) {
      console.log(`[conflict/${id}] nothing to do — ${already} result(s) already recorded (use --fresh to rerun)`);
      continue;
    }
    console.log(`[conflict/${id}] scoring ${work.length} case(s) through the real conflict pipeline (${already} already recorded)`);
    let rf = (opts.fresh ? null : existing) ?? emptyEvalResultsFile(header);
    const runId = `offline-${run.dataset.datasetVersion}`;
    for (const item of work) {
      const result = await mod.scoreConflictOfflineCase(run, item.evalCase.id, item.repetition, runId);
      rf = mergeEvalResults(rf, header, [result], ZERO_METER, new Date());
      saveResultsAtPath(p, rf); // durable after EVERY case (resumable-by-key)
      const expectation = "offline" in item.evalCase ? item.evalCase.offline.expectation : "pass";
      const machineryOk = result.checks.pass === (expectation === "pass");
      console.log(
        `  ${item.evalCase.id} [${item.evalCase.partition}/${item.evalCase.split}] status=${result.status} ` +
          `pass=${result.checks.pass} expectation=${expectation} machinery=${machineryOk ? "OK" : "MISMATCH"}`,
      );
      if (!machineryOk) {
        console.error(
          `  [conflict/${id}] MACHINERY MISMATCH on ${item.evalCase.id}: checks.pass=${result.checks.pass} but expectation=${expectation} — failures: ${result.checks.failures.join("; ") || "(none)"}`,
        );
      }
    }
    console.log(`[conflict/${id}] done -> ${p}`);
  }
  console.log("\nconflict offline scoring complete. Run with --profile conflict --report for the scorecard. Zero provider contact.");
}

function conflictModeReport(
  mod: ConflictProfileModule,
  conflicts: ConflictProfileId[],
  outPath: string,
  showHeldoutDetail: boolean,
): void {
  const scorecards: WorkloadScorecard[] = [];
  const detail: ScorecardDetailBlock[] = [];
  const sections: string[] = [];
  for (const id of conflicts) {
    const run = mod.buildConflictEvalRun(id);
    const p = conflictResultsPath(run.dataset.datasetVersion, OFFLINE_CONFIG_KEY);
    const rf = loadResultsAtPath(p);
    if (!rf) {
      console.warn(`[conflict/${id}] no results at ${p} — run --profile conflict --offline first`);
      continue;
    }
    const splitOf = Object.fromEntries(run.dataset.cases.map((c) => [c.id, c.split]));
    // baseline null: no live conflict baseline exists in this workstream, so
    // the preset gates can only ever read insufficient_data here — honest.
    scorecards.push(buildWorkloadScorecard(run.dataset, rf, null, false, run.contentHash));
    detail.push({
      workload: `validation (${run.dataset.datasetVersion})`,
      configKey: OFFLINE_CONFIG_KEY,
      results: Object.values(rf.results),
      splitOf,
    });
    sections.push(mod.renderConflictSectionMarkdown(run, rf, showHeldoutDetail));
    if (rf.datasetContentHash !== run.contentHash) {
      console.error(
        `[conflict/${id}] SOURCES CHANGED since this run (recorded ${rf.datasetContentHash.slice(0, 12)}, current ${run.contentHash.slice(0, 12)}) — verdict degraded to insufficient_data`,
      );
    }
    const agg = aggregateResults(run.dataset, rf, false);
    if (agg.machinery.total > 0 && agg.machinery.matched < agg.machinery.total) {
      console.error(
        `[conflict/${id}] MACHINERY MISMATCH: only ${agg.machinery.matched}/${agg.machinery.total} results match their expectation`,
      );
    }
    const c = agg.completeness;
    if (!c.complete) {
      console.warn(
        `[conflict/${id}] INCOMPLETE (scope=${c.scope}): ${c.missingResults} of ${c.expectedResults} key(s) missing (${c.missingHeldout} heldout)`,
      );
    }
  }
  if (scorecards.length === 0) {
    console.error("nothing to report");
    process.exit(2);
  }
  const generatedAt = new Date().toISOString();
  const headerNote =
    "CONFLICT PROFILE (validation workload, register #3): offline-fixtures results score the FROZEN " +
    "conflict fixture corpus through the real conflict pipeline and byte-compare against the committed " +
    "goldens — a machinery/drift proof, NOT a model evaluation; no paid calls are involved. Verdicts use " +
    "the inherited preset gates; with no live baseline they read insufficient_data by construction.";
  const md =
    renderAnalysisScorecardMarkdown({ generatedAt, scorecards, detail, headerNote, showHeldoutDetail }) +
    "\n" +
    sections.join("\n");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  writeFileSync(outPath.replace(/\.md$/, ".json"), JSON.stringify({ generatedAt, headerNote, scorecards }, null, 2) + "\n");
  console.log(`wrote conflict scorecard -> ${outPath} (+ .json)`);
  for (const sc of scorecards) {
    console.log(`[conflict/${sc.datasetVersion}/${sc.judged.configKey}] VERDICT: ${sc.verdictResult.verdict}`);
  }
  console.log("report built from saved artifacts only — no DB, no provider, no client construction.");
}

// ---- --execute-live (PAID; never run in this program — proven via mocks) -------

async function modeLive(opts: {
  workload: AnalysisEvalWorkload;
  model: string | null;
  effort: string | null;
  dbAck: string | null;
  repetitions: number;
  fresh: boolean;
  onlyIds: string[] | null;
  devOnly: boolean;
  allowHeldoutRerun: boolean;
}): Promise<void> {
  // live-runner (and through it the OpenAI SDK + guard machinery) is imported
  // ONLY here — estimate/offline/report/validate never load it.
  const live = await import("../src/lib/evals/live-runner");
  let preflight;
  try {
    preflight = live.assertLivePreflight({
      executeLive: hasFlag("execute-live"),
      workload: opts.workload,
      model: opts.model,
      effort: opts.effort,
      dbAck: opts.dbAck,
    });
  } catch (e) {
    console.error(`REFUSED (before any client construction): ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const { cfg, dbHost, evalDatabaseUrl } = preflight;
  // the spend ledger (provider_usage, provider openai_eval) writes to the
  // ACKNOWLEDGED eval branch — DATABASE_URL is overwritten, never read
  process.env.DATABASE_URL = evalDatabaseUrl;
  console.log(`live eval: workload=${cfg.workload} model=${cfg.model} effort=${cfg.reasoningEffort ?? "absent"} db=${dbHost}`);
  console.log(`approval=evaluation_candidate — outputs can only ever PROPOSE a registry entry, never activate one.`);

  const { ds, contentHash } = loadDataset(opts.workload);
  const configKey = profiledKey(liveConfigKey(cfg.model, cfg.reasoningEffort));
  const header: ResultsFileHeader = {
    workload: opts.workload,
    configKey,
    datasetVersion: ds.datasetVersion,
    datasetContentHash: contentHash,
    identity: live.liveIdentity(ds, cfg),
    requestedRepetitions: opts.repetitions,
    scope: runScopeFor(opts.onlyIds, opts.devOnly),
    envKnobs: currentEnvKnobs(),
  };
  const existing = loadResults(opts.workload, configKey);
  refuseOnIdentityDrift(existing, header, opts.fresh);
  try {
    // re-review minor 2a: a targeted heldout rerun can re-roll a stochastic
    // failure until it passes — refuse unless explicitly authorized
    assertLiveOnlySelection(ds, opts.onlyIds, opts.allowHeldoutRerun);
  } catch (e) {
    console.error(`REFUSED: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const { work, unknownIds, excludedHeldout } = pendingWork(ds, existing, {
    repetitions: opts.repetitions,
    fresh: opts.fresh,
    onlyIds: opts.onlyIds,
    devOnly: opts.devOnly,
  });
  if (unknownIds.length > 0) {
    console.error(`--only: unknown case id(s): ${unknownIds.join(", ")} — refusing`);
    process.exit(2);
  }
  if (excludedHeldout > 0) console.log(`--dev: ${excludedHeldout} heldout case(s) excluded`);
  if (work.length === 0) {
    console.log("nothing to do — all (case, repetition) keys already recorded (use --fresh to rerun)");
    return;
  }

  const deps = await live.buildLiveDeps();
  let rf = (opts.fresh ? null : existing) ?? emptyEvalResultsFile(header);
  const runId = `live-${Date.now()}`;
  for (const item of work) {
    const meterBefore = { ...deps.meter };
    let result;
    try {
      result = await live.runLiveCase(deps, cfg, item.evalCase, ds.datasetVersion, runId, item.repetition);
    } catch (e) {
      if (e instanceof LlmBudgetError) {
        console.error(
          `\nABORT — INVALID RUN: budget-degraded (${e.message}). ` +
            `${Object.keys(rf.results).length} completed result(s) stay durable in ${resultsPath(opts.workload, configKey)}; ` +
            "fix the caps and rerun (resumes from here). This partial run must NOT be read as a scorecard.",
        );
        process.exit(1);
      }
      // provider error: record it durably (the gates fail on providerError>0)
      result = {
        caseId: item.evalCase.id,
        datasetVersion: ds.datasetVersion,
        runId,
        configKey,
        repetition: item.repetition,
        attempt: deps.meter.attempts - meterBefore.attempts,
        status: "provider_error" as const,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        estUsd: null,
        checks: { pass: false, failures: [`provider error: ${e instanceof Error ? e.message : String(e)}`] },
        humanLabels: null,
        graderJudgments: null,
        rawOutputDigest: "",
      };
      console.error(`  ${item.evalCase.id} PROVIDER ERROR: ${e instanceof Error ? e.message : e}`);
    }
    const meterDelta = {
      attempts: deps.meter.attempts - meterBefore.attempts,
      reservations: deps.meter.reservations - meterBefore.reservations,
      meterings: deps.meter.meterings - meterBefore.meterings,
      erroredAttempts: deps.meter.erroredAttempts - meterBefore.erroredAttempts,
    };
    rf = mergeEvalResults(rf, header, [result], meterDelta, new Date());
    saveResults(rf); // durable after EVERY completed case
    console.log(
      `  ${item.evalCase.id}#r${item.repetition} status=${result.status} pass=${result.checks.pass} ` +
        `$${(result.estUsd ?? 0).toFixed(4)} ${result.latencyMs ?? "—"}ms`,
    );
  }
  console.log(`\nlive sweep complete -> ${resultsPath(opts.workload, configKey)}. Run --report for the scorecard.`);
}

// ---- entry --------------------------------------------------------------------

// ---- --capacity-matrix ---------------------------------------------------------
// Per-cell cost/feasibility estimates for the capacity-quality matrix. Pure:
// no DB connection, no client construction, no dispatch, nothing billed.
function modeCapacityMatrix(model: string, repetitions: number): void {
  const workloads = ["map", "reduce", "digest", "validation"] as AnalysisEvalWorkload[];
  const lines: string[] = [];
  lines.push(`# Capacity-quality matrix — dry-run estimates (${new Date().toISOString()})`);
  lines.push("");
  lines.push(
    `Model \`${model}\`, ${repetitions} repetition(s) per case. Estimates use the same deliberate`,
  );
  lines.push(
    `over-estimating heuristics as \`--estimate\`. NOTHING here dispatches: paid cells run only`,
  );
  lines.push(`under the QF-C §6 operator gate with EVAL_* caps set.`);
  lines.push("");
  lines.push(`| profile | knobs | workload | cases | est calls | est tokens (in/out) | est $ |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  let grand = 0;
  for (const name of capacityProfileNames()) {
    const restore = applyCapacityProfile(name);
    try {
      const knobs = currentEnvKnobs();
      const knobsText = `depth=${knobs.mapContentChars} fed=<=${process.env.REDUCE_GROUPS_FED ?? "200"} outTok=${knobs.mapOutTokensPerDoc}`;
      for (const w of workloads) {
        const { ds } = loadDataset(w);
        const plan = buildAnalysisEstimatePlan(ds, model, repetitions);
        grand += plan.totalUsd;
        lines.push(
          `| ${name} | ${knobsText} | ${w} | ${ds.cases.length} | ${plan.totalCalls} | ${plan.totalPromptTokens}/${plan.totalCompletionTokens} | $${plan.totalUsd.toFixed(4)} |`,
        );
      }
    } finally {
      restore();
    }
  }
  lines.push("");
  lines.push(
    `> HONESTY NOTE: with the v1 datasets these estimates barely differentiate across`,
  );
  lines.push(
    `> profiles — v1 fixture docs are short (validator cap 1,600 chars), so depth knobs`,
  );
  lines.push(
    `> change nothing yet. The capacity corpus (v2 datasets with graded long synthetic`,
  );
  lines.push(
    `> docs and >200-group reduce cases) is what makes the cells diverge; until it`,
  );
  lines.push(`> lands, this table is a harness proof, not a cost forecast.`);
  lines.push("");
  lines.push(`Estimated grand total (all cells, all workloads): $${grand.toFixed(4)}`);
  lines.push("");
  lines.push(`## Cells not expressible as env profiles (visible by design)`);
  for (const c of UNIMPLEMENTED_MATRIX_CELLS) lines.push(`- **${c.cell}** — requires ${c.requires}`);
  lines.push("");
  lines.push(
    `## Cap frame: EVAL_USD_CAP_DAILY (unset today — live dispatch refuses everywhere), ` +
      `EVAL_DAILY_REQUEST_CAP default 300, EVAL_RUN_REQUEST_CAP default 200. A cell whose est ` +
      `calls exceed 200 needs multiple runs; plan cells/day against the daily caps.`,
  );
  const out = path.join(EVALS_DIR, "CAPACITY-MATRIX-ESTIMATE.md");
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(`\nwritten: ${out}`);
}

async function main(): Promise<void> {
  // REFUSE equals-form flags outright (Gate-5 ops MAJOR-1): flagValue matches
  // only the space-separated form, so "--profile=conflict" was SILENTLY
  // DISCARDED — defeating the profile allowlist and the conflict live-mode
  // refusal and falling through to the GENERIC live path with a client
  // construction. Refusing (rather than teaching the parser "=") protects
  // EVERY flag with zero parser-semantics change, and fires before ANY mode
  // work.
  // The pattern covers ANY dash-prefixed equals token (uppercase, short form,
  // mixed) — the Gate-5 re-review showed a lowercase-long-form-only guard
  // still let --PROFILE=conflict / -p=conflict fall through as silently
  // ignored unknown tokens.
  const equalsForm = process.argv.slice(2).find((a) => /^-[^=\s]+=/.test(a));
  if (equalsForm !== undefined) {
    const eq = equalsForm.indexOf("=");
    const name = equalsForm.slice(0, eq);
    const value = equalsForm.slice(eq + 1);
    console.error(
      `${equalsForm} is not accepted: flags take space-separated values — use "${name} ${value}"`,
    );
    process.exit(2);
  }

  const fresh = hasFlag("fresh");
  const onlyIds = parseOnly();
  if (fresh && onlyIds !== null) {
    console.error("--fresh and --only are mutually exclusive (--only is already a forced rerun of its ids)");
    process.exit(2);
  }
  const devOnly = hasFlag("dev");

  const profile = flagValue("profile");
  if (profile !== undefined && profile !== "conflict") {
    console.error(`--profile: unknown profile "${profile}" (valid: conflict)`);
    process.exit(2);
  }

  // --capacity <name>: the capacity-quality matrix dimension. Applied to
  // process.env BEFORE any dataset/identity/estimate work so every knob
  // reader sees it; the name also enters every configKey (baseline keeps the
  // historical keys byte-exact). Refused for the conflict profile — its
  // pipeline reads none of these knobs, so a suffixed configKey would imply
  // a variation that does not exist.
  const capacity = flagValue("capacity");
  if (capacity !== undefined) {
    if (!(capacity in CAPACITY_PROFILES)) {
      console.error(`--capacity: unknown profile "${capacity}" (valid: ${capacityProfileNames().join(", ")})`);
      process.exit(2);
    }
    if (profile === "conflict") {
      console.error("--capacity is not applicable to --profile conflict (the conflict pipeline reads none of the capacity knobs)");
      process.exit(2);
    }
    activeCapacityProfile = capacity;
    console.log(`capacity profile: ${capacity} — ${CAPACITY_PROFILES[capacity].description}`);
  }
  // ALWAYS apply the active profile (baseline scrubs the four knob envs), so a
  // stray shell export or .env.local line can never write a knob-drifted file
  // under a baseline configKey (review finding 4).
  applyCapacityProfile(activeCapacityProfile);

  if (hasFlag("capacity-matrix")) {
    if (profile === "conflict") {
      console.error("--capacity-matrix is not applicable to --profile conflict");
      process.exit(2);
    }
    return modeCapacityMatrix(flagValue("model") ?? ANALYSIS_DEFAULT_MODEL, parseRepetitions());
  }
  if (profile === "conflict") {
    if (hasFlag("execute-live")) {
      console.error(
        "--execute-live is not available with --profile conflict: the conflict profile has NO live dispatch path in this workstream (offline fixture-oracle scoring only).",
      );
      process.exit(2);
    }
    if (flagValue("workload") !== undefined) {
      console.error(
        "--profile conflict pins the validation workload and selects datasets by conflict — use --conflict russia_ukraine,iran_regional instead of --workload",
      );
      process.exit(2);
    }
    // mode-scoped dynamic import (live-runner pattern): the CLI's static
    // import surface stays contracts+runner (isolation.test.ts pin)
    const mod = await import("../src/lib/evals/conflict-validation-profile");
    const conflicts = parseConflictIds(mod);
    if (hasFlag("validate-dataset")) return conflictModeValidate(mod, conflicts);
    if (hasFlag("estimate")) {
      return conflictModeEstimate(mod, conflicts, flagValue("model") ?? ANALYSIS_DEFAULT_MODEL, parseRepetitions());
    }
    if (hasFlag("report")) {
      return conflictModeReport(mod, conflicts, flagValue("out") ?? CONFLICT_REPORT_PATH, hasFlag("show-heldout-detail"));
    }
    return conflictModeOffline(mod, conflicts, { fresh, onlyIds, devOnly });
  }

  if (hasFlag("validate-dataset")) return modeValidate(parseWorkloads(false));
  if (hasFlag("estimate")) {
    return modeEstimate(parseWorkloads(false), flagValue("model") ?? ANALYSIS_DEFAULT_MODEL, parseRepetitions());
  }
  if (hasFlag("report")) {
    return modeReport(parseWorkloads(false), flagValue("out") ?? DEFAULT_REPORT_PATH, hasFlag("show-heldout-detail"));
  }
  if (hasFlag("execute-live")) {
    const workloads = parseWorkloads(true);
    if (workloads.length !== 1) {
      console.error("--execute-live takes exactly ONE --workload");
      process.exit(2);
    }
    return modeLive({
      workload: workloads[0],
      model: flagValue("model") ?? null,
      effort: flagValue("effort") ?? null,
      dbAck: flagValue("db-ack") ?? null,
      repetitions: parseRepetitions(),
      fresh,
      onlyIds,
      devOnly,
      allowHeldoutRerun: hasFlag("allow-heldout-rerun"),
    });
  }
  return modeOffline(parseWorkloads(false), { fresh, onlyIds, devOnly });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
