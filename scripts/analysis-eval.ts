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
//                  [--validation-votes 5|1] [--single-round-diagnostic]
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
//       Validation parity (2026-09-04): a live validation case dispatches the
//       production matcher's FIVE vote rounds and resolves them through the
//       production resolveVoteRounds (strict majority; 1-2 usable rounds
//       degrade to the first round exactly as production does). Results
//       files carry the vote count in envKnobs.validationVotes AND in the
//       configKey (`<model>+votes5`), so a 5-vote file can never resume
//       into — or overwrite — a pre-2026-09-04 single-round file (bare key,
//       reported as LEGACY SINGLE-ROUND). `--validation-votes 1` is the
//       single-round DIAGNOSTIC mode: it requires the explicit
//       --single-round-diagnostic flag, writes `+votes1` files, and is
//       labelled NOT production-equivalent in every artifact. No other vote
//       count exists. Estimates count K calls per validation case.
//       Abort accounting (2026-09-04): a budget stop or a capture-write
//       failure mid-case records the interrupted case's physical attempts,
//       meterings, tokens and USD in the file's `abandonedAttempts` (folded
//       into `meter`) with NO result key — the case is pending again on
//       resume, completed keys are never rerun, nothing is fabricated.
//
//   Opt-in capture (--execute-live only; every other mode ignores the env):
//       EVAL_CAPTURE_DIR=<dir>           per-attempt accounting JSONL, one
//                                        file per split (<runId>.dev.jsonl /
//                                        <runId>.heldout.jsonl); dir must be
//                                        outside the repo or gitignored, 0700
//       EVAL_CAPTURE_RAW=1               + raw response content, DEVELOPMENT
//                                        split only
//       EVAL_CAPTURE_RAW_HELDOUT=1       + heldout raw content; ALSO requires
//         --allow-heldout-raw-capture    the explicit flag; stamped in header
//       A capture write failure aborts the run (evidence of calls already
//       made is retained: they are metered and recorded as abandoned).
//
//   --capture-reconcile --workload X --model M [--effort E] [--capacity P] [--out p.md]
//       Reconcile EVAL_CAPTURE_DIR lines against the results file: attempts,
//       responses, errors, unresolved (crash-window), metered, budget stops,
//       abandoned vs completed vs orphan cases. Metadata only. No DB, no
//       provider. The ledger comparison is stated, not performed.
//
//   --capture-inspect <file.jsonl> [--show-raw]
//       Development-capture inspection (calibration input). REFUSES heldout
//       files by name and by declared split. No DB, no provider.
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

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
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
  MIN_LIVE_REPETITIONS,
  UNIMPLEMENTED_MATRIX_CELLS,
  VALIDATION_VOTES_DIAGNOSTIC,
  VALIDATION_VOTES_PRODUCTION,
  evalValidationVotes,
  offlineEnvKnobs,
  validationVotesKeySuffix,
  applyCapacityProfile,
  capacityProfileNames,
  withCapacityProfileKey,
  CaptureConfigError,
  CaptureHeldoutRefusal,
  mergeEvalResults,
  offlineIdentity,
  openCaptureForCalibration,
  openCaptureSink,
  parseCaptureFile,
  pendingWork,
  reconcileCapture,
  renderAnalysisScorecardMarkdown,
  renderCaptureReconciliation,
  resolveCaptureConfig,
  resumeIdentityMismatch,
  runScopeFor,
  scoreOfflineCase,
  sha256,
  type CaptureFs,
  type CaptureResolution,
  type CaptureSink,
  type ResultsFileHeader,
  type ScorecardDetailBlock,
  type WorkloadScorecard,
} from "../src/lib/evals/runner";
import { ANALYSIS_DEFAULT_MODEL } from "../src/lib/llm/model-config";

const REPO_ROOT = path.resolve(__dirname, "..");
const EVALS_DIR = path.join(REPO_ROOT, "docs", "evals", "analysis");
const RESULTS_DIR = path.join(EVALS_DIR, "results");
/** the scorer module a live workload scores through — its source hash is the
 *  scorer identity stamped into every capture run line */
const SCORER_MODULES: Record<AnalysisEvalWorkload, string> = {
  map: "src/lib/evals/score-map.ts",
  reduce: "src/lib/evals/score-reduce.ts",
  digest: "src/lib/evals/score-reduce.ts",
  validation: "src/lib/evals/score-validation.ts",
};
const DEFAULT_REPORT_PATH = path.join(EVALS_DIR, "ANALYSIS-EVAL-SCORECARD.md");

/** One dataset per workload; bump here when a datasetVersion bumps. The
 *  results basename changed with the v2 datasets so the committed v1 offline
 *  results stay byte-identical at their historical paths (re-pointing the
 *  bare workload name at v2 would identity-refuse against them); reduce
 *  stays on v1 and keeps its historical basename. */
const DATASETS: Record<AnalysisEvalWorkload, { file: string; resultsBase: string }> = {
  map: { file: "map-v2.json", resultsBase: "map-v2" },
  reduce: { file: "reduce-v1.json", resultsBase: "reduce" },
  digest: { file: "digest-v2.json", resultsBase: "digest-v2" },
  validation: { file: "validation-v2.json", resultsBase: "validation-v2" },
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
  const p = path.join(EVALS_DIR, DATASETS[workload].file);
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
  return path.join(RESULTS_DIR, `${prefix}${DATASETS[workload].resultsBase}-${configKey}.json`);
}

// The capacity profile active for this invocation (--capacity; default
// baseline). Applied to process.env BEFORE any dataset/identity work in
// main(), so every knob reader — prompts, identity, estimates, live dispatch
// — sees the profile through the existing knob functions.
let activeCapacityProfile = BASELINE_PROFILE;
let freshAckValue: string | null = null;

/** C-A7-2: --fresh silently discarded recorded results and erased run
 *  provenance. Now a --fresh that would discard a non-empty results file
 *  requires an explicit `--fresh-ack <configKey>` acknowledgement, and the
 *  discarded runs' digests are carried into the NEW file's header
 *  (`discardedRuns`) so a re-roll-until-pass artifact can never look
 *  first-try. Returns the provenance entry to stamp, or null when there was
 *  nothing to discard. */
function acknowledgeFreshDiscard(
  existing: EvalResultsFile | null,
  fresh: boolean,
  ackToken: string,
): { configKey: string; runIds: string[]; resultsDigest: string; discardedResults: number } | null {
  if (!fresh || existing === null || Object.keys(existing.results).length === 0) return null;
  // the token names the exact FILE being discarded (workload-or-dataset
  // qualified), so one acknowledgement can never authorize a multi-file sweep
  if (freshAckValue !== ackToken) {
    console.error(
      `--fresh would DISCARD ${Object.keys(existing.results).length} recorded result(s) for ${ackToken} — acknowledge explicitly with: --fresh-ack ${ackToken}`,
    );
    process.exit(2);
  }
  return {
    configKey: ackToken,
    runIds: [...new Set(Object.values(existing.results).map((r) => r.runId))].sort(),
    resultsDigest: sha256(JSON.stringify(existing.results)),
    discardedResults: Object.keys(existing.results).length,
  };
}
function profiledKey(base: string): string {
  return withCapacityProfileKey(base, activeCapacityProfile);
}

/** The configKey a LIVE results file is written/read under: model+effort,
 *  the capacity-profile suffix, and — validation only — the vote-count
 *  suffix (`+votes5` / `+votes1`), which keeps every post-2026-09-04
 *  validation file on a path no pre-parity single-round file ever used. */
function liveResultsConfigKey(workload: AnalysisEvalWorkload, model: string, effort: string | null): string {
  const base = profiledKey(liveConfigKey(model, effort));
  return workload === "validation" ? `${base}${validationVotesKeySuffix(evalValidationVotes())}` : base;
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
  // temp + rename: a kill mid-write can no longer leave a torn results file
  // that the next resume cannot parse (review F6); rename is atomic on the
  // same filesystem, so the file is always either the old or the new version
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(rf, null, 2) + "\n");
  renameSync(tmp, p);
}

function saveResults(rf: EvalResultsFile): void {
  saveResultsAtPath(resultsPath(rf.workload, rf.configKey), rf);
}

// ---- --validate-dataset --------------------------------------------------------

/** every committed dataset for a workload: the ACTIVE file the runner loads
 *  plus the frozen historical v1 file where the active one superseded it —
 *  both must stay valid forever */
function committedDatasetFiles(w: AnalysisEvalWorkload): string[] {
  const v1 = `${w}-v1.json`;
  return DATASETS[w].file === v1 ? [v1] : [DATASETS[w].file, v1];
}

function modeValidate(workloads: AnalysisEvalWorkload[]): void {
  let bad = 0;
  for (const w of workloads) {
    for (const file of committedDatasetFiles(w)) {
      const p = path.join(EVALS_DIR, file);
      if (!existsSync(p)) {
        console.error(`[${w}] MISSING dataset file ${p}`);
        bad++;
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(p, "utf8"));
      } catch (e) {
        console.error(`[${w}] UNPARSEABLE ${file}: ${e instanceof Error ? e.message : e}`);
        bad++;
        continue;
      }
      const errs = validateAnalysisEvalDataset(raw, w);
      if (errs.length > 0) {
        console.error(`[${w}] INVALID ${file} (${errs.length} violation(s)):\n  ${errs.join("\n  ")}`);
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
  }
  if (bad > 0) process.exit(2);
  console.log("all selected datasets valid. No DB, no provider, nothing written.");
}

// ---- --estimate ----------------------------------------------------------------

/** The vote mode an estimate assumes for validation — labelled exactly like
 *  the live banner so a single-round figure is never mistaken for the
 *  production-equivalent cost (review MINOR-2). */
function validationVoteModeEstimateLabel(): string {
  const votes = evalValidationVotes();
  return votes === VALIDATION_VOTES_PRODUCTION
    ? `validation votes: ${votes} — production-equivalent majority; ${votes} calls per case`
    : `validation votes: ${votes} — SINGLE-ROUND DIAGNOSTIC estimate, NOT production-equivalent (production = ${VALIDATION_VOTES_PRODUCTION}-vote majority, ${VALIDATION_VOTES_PRODUCTION}x these validation calls)`;
}

function modeEstimate(workloads: AnalysisEvalWorkload[], model: string, repetitions: number): void {
  let grand = 0;
  for (const w of workloads) {
    const { ds } = loadDataset(w);
    const plan = buildAnalysisEstimatePlan(ds, model, repetitions);
    console.log(`\n[${w}] ${ds.datasetVersion} — model ${model}, ${repetitions} repetition(s):`);
    if (w === "validation") console.log(`  ${validationVoteModeEstimateLabel()}`);
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
      envKnobs: offlineEnvKnobs(),
    };
    const existing = loadResults(w, profiledKey(OFFLINE_CONFIG_KEY));
    const discarded = acknowledgeFreshDiscard(existing, opts.fresh, `${w}/${profiledKey(OFFLINE_CONFIG_KEY)}`);
    if (discarded) header.discardedRuns = [...(existing?.discardedRuns ?? []), discarded];
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
      if (result.status === "inapplicable") {
        // structural classification, not a machinery data point — the fixture
        // was authored for a capacity the applied knobs cannot satisfy
        console.log(
          `  ${item.evalCase.id} [${item.evalCase.partition}/${item.evalCase.split}] status=inapplicable ` +
            `(${result.applicability?.reason ?? "capacity requirement unmet"}) machinery=N/A`,
        );
        continue;
      }
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
    const base = DATASETS[workload].resultsBase;
    for (const f of readdirSync(RESULTS_DIR)) {
      const m = f.match(new RegExp(`^live-${base}-(.+)\\.json$`));
      if (m) configs.add(m[1]);
      const off = f.match(new RegExp(`^${base}-(${OFFLINE_CONFIG_KEY}\\+.+)\\.json$`));
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
      // the validation vote suffix (+votes<K>) is NOT a capacity profile:
      // strip it first, derive the profile suffix, then re-append it so a
      // profiled validation candidate pairs with the profiled baseline at
      // the SAME vote count (review MINOR-1)
      const votesMatch = configKey.match(/\+votes\d+$/);
      const votesSuffix = votesMatch ? votesMatch[0] : "";
      const keySansVotes = votesSuffix ? configKey.slice(0, -votesSuffix.length) : configKey;
      const plusAt = keySansVotes.lastIndexOf("+");
      const profileSuffix = plusAt === -1 ? "" : keySansVotes.slice(plusAt);
      const baselineKey = `${ANALYSIS_DEFAULT_MODEL}${profileSuffix}${votesSuffix}`;
      const baseline = live && configKey !== baselineKey ? loadResults(w, baselineKey) : null;
      const baselineExpectation = baseline
        ? { configKey: baselineKey, model: ANALYSIS_DEFAULT_MODEL }
        : null;
      // re-review minor 1: compare against the dataset file AS IT EXISTS NOW —
      // an id-preserving reference edit after a run degrades the verdict
      scorecards.push(buildWorkloadScorecard(ds, rf, baseline, live, contentHash, baselineExpectation));
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
      envKnobs: offlineEnvKnobs(),
    };
    const p = conflictResultsPath(run.dataset.datasetVersion, OFFLINE_CONFIG_KEY);
    const existing = loadResultsAtPath(p);
    const discardedConflict = acknowledgeFreshDiscard(existing, opts.fresh, `${run.dataset.datasetVersion}/${header.configKey}`);
    if (discardedConflict) header.discardedRuns = [...(existing?.discardedRuns ?? []), discardedConflict];
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
      singleRoundDiagnostic: hasFlag("single-round-diagnostic"),
    });
  } catch (e) {
    console.error(`REFUSED (before any client construction): ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const { cfg, dbHost, evalDatabaseUrl } = preflight;
  // capture misconfiguration refuses HERE — before the ledger URL is applied
  // and before any client/DB construction
  const captureResolution = resolveCapture("live");
  // the spend ledger (provider_usage, provider openai_eval) writes to the
  // ACKNOWLEDGED eval branch — DATABASE_URL is overwritten, never read
  process.env.DATABASE_URL = evalDatabaseUrl;
  console.log(`live eval: workload=${cfg.workload} model=${cfg.model} effort=${cfg.reasoningEffort ?? "absent"} db=${dbHost}`);
  console.log(
    cfg.approval === "baseline"
      ? `approval=baseline — registry-backed production baseline identity (see identity.registryVersion in the results header).`
      : `approval=evaluation_candidate — outputs can only ever PROPOSE a registry entry, never activate one.`,
  );

  const { ds, contentHash } = loadDataset(opts.workload);
  const configKey = liveResultsConfigKey(opts.workload, cfg.model, cfg.reasoningEffort);
  if (opts.workload === "validation") {
    const votes = evalValidationVotes();
    console.log(
      votes === VALIDATION_VOTES_PRODUCTION
        ? `validation votes: ${votes} — production-equivalent majority (resolveVoteRounds); ${votes} paid dispatches per case`
        : `validation votes: ${votes} — SINGLE-ROUND DIAGNOSTIC, NOT production-equivalent (production = ${VALIDATION_VOTES_PRODUCTION}-vote majority); results keyed ${configKey}`,
    );
  }
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
  if (!opts.devOnly && opts.repetitions < MIN_LIVE_REPETITIONS) {
    console.error(
      `--repetitions ${opts.repetitions} < MIN_LIVE_REPETITIONS ${MIN_LIVE_REPETITIONS}: the file could never verdict — spend refused (use --dev for an exploratory partial run)`,
    );
    process.exit(2);
  }
  const existing = loadResults(opts.workload, configKey);
  const discardedLive = acknowledgeFreshDiscard(existing, opts.fresh, `${opts.workload}/${configKey}`);
  if (discardedLive) header.discardedRuns = [...(existing?.discardedRuns ?? []), discardedLive];
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

  // the capture sink opens BEFORE buildLiveDeps: every capture refusal
  // (directory mode, runId reuse) fires before the guard's DB init and the
  // client construction (review F3)
  const runId = `live-${Date.now()}`;
  let captureSink: CaptureSink | null = null;
  if (captureResolution.enabled) {
    // secrets the sink must never let into a line, whatever an error says
    const secrets = [process.env.OPENAI_API_KEY, evalDatabaseUrl, process.env.DATABASE_URL_UNPOOLED].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const scorerPath = path.join(REPO_ROOT, SCORER_MODULES[opts.workload]);
    let gitHead: string | null = null;
    try {
      gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    } catch {
      gitHead = null;
    }
    try {
      captureSink = openCaptureSink(
        captureResolution.cfg,
        {
          runId,
          workload: opts.workload,
          configKey,
          datasetVersion: ds.datasetVersion,
          datasetContentHash: contentHash,
          identity: header.identity,
          envKnobs: header.envKnobs,
          scorer: {
            module: SCORER_MODULES[opts.workload],
            sourceSha256: existsSync(scorerPath) ? sha256(readFileSync(scorerPath)) : null,
          },
          gitHead,
        },
        CAPTURE_FS,
        { secrets },
      );
    } catch (e) {
      console.error(`REFUSED (capture): ${e instanceof Error ? e.message : e}`);
      process.exit(2);
    }
    console.log(
      `capture: ${captureResolution.cfg.dir} (raw development=${captureResolution.cfg.rawDevelopment ? "ON" : "off"}, raw heldout=${captureResolution.cfg.rawHeldout ? "ON — explicitly acknowledged" : "off"}); a capture write failure ABORTS the run`,
    );
  }
  const deps = await live.buildLiveDeps();
  deps.capture = captureSink;
  const outcome = await live.runLiveSweep({
    deps,
    cfg,
    dataset: ds,
    header,
    existing: opts.fresh ? null : existing,
    work,
    runId,
    knobs: currentEnvKnobs(),
    persist: saveResults,
    log: (l) => console.log(l),
    logError: (l) => console.error(l),
  });
  if (outcome.status === "aborted") {
    console.error(`results file: ${resultsPath(opts.workload, configKey)}` + (outcome.captureRun ? ` · capture run ${outcome.captureRun.runId} state=${outcome.captureRun.state}` : ""));
    process.exit(1);
  }
  if (outcome.captureRun) {
    console.log(
      `capture run ${outcome.captureRun.runId} state=${outcome.captureRun.state}` +
        (outcome.captureRun.sha256 ? ` dev=${outcome.captureRun.sha256.development?.slice(0, 12) ?? "—"} heldout=${outcome.captureRun.sha256.heldout?.slice(0, 12) ?? "—"}` : ""),
    );
  }
  console.log(`\nlive sweep complete -> ${resultsPath(opts.workload, configKey)}. Run --report for the scorecard.`);
}

// ---- capture reconciliation / inspection (no DB, no provider) -----------------

const CAPTURE_FS: CaptureFs = {
  existsSync,
  mkdirSync: (p, o) => mkdirSync(p, o),
  statSync: (p) => statSync(p),
  appendFileSync: (p, d, o) => appendFileSync(p, d, o),
  readFileSync: (p) => readFileSync(p),
};

function isGitIgnored(absPath: string): boolean {
  try {
    // trailing slash: directory-only ignore patterns (docs/evals/analysis/capture/)
    // must match BEFORE the directory exists — the sink creates it later
    // (review F1); path.resolve strips any slash the operator typed
    execFileSync("git", ["check-ignore", "-q", `${absPath}/`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Resolve the capture env for a mode. Refusals exit 2 BEFORE any client or
 *  DB work; non-live modes get a notice and NO filesystem access. */
function resolveCapture(mode: "live" | "other"): CaptureResolution {
  try {
    return resolveCaptureConfig(process.env, {
      mode,
      repoRoot: REPO_ROOT,
      resolvePath: (p) => path.resolve(p),
      isGitIgnored,
      heldoutRawAck: hasFlag("allow-heldout-raw-capture"),
    });
  } catch (e) {
    if (e instanceof CaptureConfigError) {
      console.error(`REFUSED (capture): ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}

function captureDirOrExit(): string {
  const dir = process.env.EVAL_CAPTURE_DIR;
  if (!dir) {
    console.error("EVAL_CAPTURE_DIR is not set — nothing to reconcile/inspect");
    process.exit(2);
  }
  return path.resolve(dir);
}

function modeCaptureReconcile(workload: AnalysisEvalWorkload, model: string, effort: string | null, outPath: string | undefined): void {
  const dir = captureDirOrExit();
  const configKey = liveResultsConfigKey(workload, model, effort);
  const rfPath = resultsPath(workload, configKey);
  const rf = loadResultsAtPath(rfPath);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort() : [];
  const parsed = files
    .map((f) => parseCaptureFile(f, readFileSync(path.join(dir, f), "utf8")))
    // only runs for THIS workload/configKey; other cells' files are reported, never mixed in
    .filter((p) => p.run !== null && p.run.workload === workload && p.run.configKey === configKey);
  const skipped = files.length - parsed.length;
  const rec = reconcileCapture(parsed, rf);
  if (skipped > 0) rec.notes.unshift(`${skipped} capture file(s) in ${dir} belong to other workload/configKey cells (or lack a run line) and were not reconciled here`);
  const md = renderCaptureReconciliation(rec, `${workload}/${configKey} (results ${rf ? path.basename(rfPath) : "absent"}, capture ${dir})`);
  if (outPath) {
    writeFileSync(outPath, md);
    console.log(`reconciliation -> ${outPath}`);
  } else {
    console.log(md);
  }
  console.log("reconciliation only — no DB connection, no client construction, no LLM calls; the ledger comparison is stated for the operator to perform.");
}

function modeCaptureInspect(file: string, showRaw: boolean): void {
  let parsed;
  try {
    parsed = openCaptureForCalibration(file, readFileSync(file, "utf8"));
  } catch (e) {
    if (e instanceof CaptureHeldoutRefusal) {
      console.error(`REFUSED: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
  const run = parsed.run!;
  console.log(`capture ${path.basename(file)}: run ${run.runId} ${run.workload}/${run.configKey} dataset ${run.datasetVersion} split=${run.split} raw=${run.raw} model=${run.identity.model} scorer=${run.scorer.module}@${run.scorer.sourceSha256?.slice(0, 12) ?? "?"} git=${run.gitHead?.slice(0, 12) ?? "?"}`);
  for (const l of parsed.lines) {
    if (l.kind === "attempt_start") console.log(`  #${l.attemptSeq} start ${l.caseId}#r${l.repetition}${l.voteIndex !== null ? ` vote ${l.voteIndex}/${l.voteCount}` : ""} attempt ${l.attemptIndex} model ${l.requestedModel}`);
    else if (l.kind === "attempt_end") {
      console.log(
        `  #${l.attemptSeq} end   ${l.outcome} finish=${l.finishReason ?? "—"} refused=${l.refused ? "yes" : "no"} truncated=${l.truncated} metered=${l.metered} usage=${l.usage ? `${l.usage.promptTokens}+${l.usage.completionTokens}` : "—"} $${(l.estUsd ?? 0).toFixed(4)} model=${l.returnedModel ?? "—"} id=${l.responseId ?? "—"} sha=${l.rawSha256?.slice(0, 12) ?? "—"}` +
          (l.error ? ` error=${l.error.name}${l.error.status !== null ? `/${l.error.status}` : ""}: ${l.error.message}` : ""),
      );
      if (showRaw && l.raw !== null) console.log(`    raw: ${l.raw}`);
      else if (showRaw && l.outcome === "response") console.log("    raw: (not captured — EVAL_CAPTURE_RAW was off for this run)");
    } else if (l.kind === "budget_stop") console.log(`  budget_stop ${l.caseId}#r${l.repetition}${l.voteIndex !== null ? ` vote ${l.voteIndex}/${l.voteCount}` : ""} code=${l.code ?? "—"}: ${l.reason}`);
    else if (l.kind === "run_end") console.log(`  run_end ${l.outcome}${l.reason ? ` (${l.reason})` : ""} lines=${l.lines}`);
  }
  if (parsed.malformed > 0) console.log(`  (${parsed.malformed} malformed line(s) skipped)`);
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
  lines.push(`> ${validationVoteModeEstimateLabel()}`);
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
    `> The corpus-v2 datasets (2026-09-03) carry graded long synthetic docs and`,
  );
  lines.push(
    `> >200-group fed-cutoff cases, so the cells now genuinely diverge: capacity`,
  );
  lines.push(
    `> cases a profile's knobs cannot satisfy are classified structurally`,
  );
  lines.push(
    `> INAPPLICABLE and cost ZERO calls in that cell (never dispatched), so each`,
  );
  lines.push(
    `> cell's estimate covers exactly the cases it would actually run. Estimates`,
  );
  lines.push(`> remain deliberate over-estimates, never a billing promise.`);
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
  freshAckValue = flagValue("fresh-ack") ?? null;
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
  // 2026-09-04 parity: the validation vote count is ALWAYS set here from the
  // flag (default = production 5), overriding any shell export, so every knob
  // reader (identity, estimate, live dispatch, configKey) sees one value.
  const votesFlag = flagValue("validation-votes");
  if (hasFlag("validation-votes") && votesFlag === undefined) {
    console.error("--validation-votes needs a value (5 or 1)");
    process.exit(2);
  }
  if (votesFlag !== undefined && votesFlag !== String(VALIDATION_VOTES_PRODUCTION) && votesFlag !== String(VALIDATION_VOTES_DIAGNOSTIC)) {
    console.error(
      `--validation-votes: only ${VALIDATION_VOTES_PRODUCTION} (production-equivalent majority, default) or ${VALIDATION_VOTES_DIAGNOSTIC} (single-round diagnostic; also needs --single-round-diagnostic) exist — got "${votesFlag}"`,
    );
    process.exit(2);
  }
  process.env.EVAL_VALIDATION_VOTES = votesFlag ?? String(VALIDATION_VOTES_PRODUCTION);
  if (hasFlag("single-round-diagnostic") && !hasFlag("execute-live")) {
    console.error("--single-round-diagnostic is a live-mode acknowledgement (it changes what --execute-live dispatches); it has no meaning here");
    process.exit(2);
  }

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

  if (hasFlag("capture-inspect")) {
    const file = flagValue("capture-inspect");
    if (!file) {
      console.error("--capture-inspect takes a capture file path");
      process.exit(2);
    }
    return modeCaptureInspect(path.resolve(file), hasFlag("show-raw"));
  }
  if (hasFlag("capture-reconcile")) {
    const workloads = parseWorkloads(true);
    if (workloads.length !== 1) {
      console.error("--capture-reconcile takes exactly ONE --workload");
      process.exit(2);
    }
    const model = flagValue("model");
    if (!model) {
      console.error("--capture-reconcile requires --model (the results file is keyed by configKey)");
      process.exit(2);
    }
    return modeCaptureReconcile(workloads[0], model, flagValue("effort") ?? null, flagValue("out"));
  }
  if (!hasFlag("execute-live")) {
    // capture is a live-only facility: every other mode ignores the env with
    // a notice and touches no capture file
    const r = resolveCapture("other");
    if (!r.enabled && r.notice) console.log(`note: ${r.notice}`);
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
