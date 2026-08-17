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
//       LIVE candidate evaluation (PAID). Refuses loudly BEFORE any client
//       construction unless ALL of: the explicit flag, EVAL_DATABASE_URL set
//       (DATABASE_URL is never read — the spend ledger writes to the eval
//       branch you explicitly acknowledge via --db-ack <host>), a real
//       OPENAI_API_KEY, and both caps (LLM_SPRINT_USD_CAP + EVAL_USD_CAP_DAILY;
//       the fail-closed openai_eval SpendGuard refuses without them). Results
//       write under results/live-* (gitignored — live results are never
//       committed). A budget stop aborts the whole run with an INVALID
//       verdict; completed cases stay durable and a rerun resumes.
//
// --fresh and --only are mutually exclusive (as in scripts/ask-eval.ts).
// --dev excludes the heldout split (see docs/evals/analysis/README.md for the
// heldout discipline: never iterate prompts against heldout results).

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
  buildAnalysisEstimatePlan,
  buildWorkloadScorecard,
  currentEnvKnobs,
  emptyEvalResultsFile,
  heldoutCoverage,
  liveConfigKey,
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
  const prefix = configKey === OFFLINE_CONFIG_KEY ? "" : "live-";
  return path.join(RESULTS_DIR, `${prefix}${workload}-${configKey}.json`);
}

function loadResults(workload: AnalysisEvalWorkload, configKey: string): EvalResultsFile | null {
  const p = resultsPath(workload, configKey);
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

function saveResults(rf: EvalResultsFile): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(resultsPath(rf.workload, rf.configKey), JSON.stringify(rf, null, 2) + "\n");
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
      configKey: OFFLINE_CONFIG_KEY,
      datasetVersion: ds.datasetVersion,
      datasetContentHash: contentHash,
      identity: offlineIdentity(ds),
      requestedRepetitions: 1,
      scope: runScopeFor(opts.onlyIds, opts.devOnly),
      envKnobs: currentEnvKnobs(),
    };
    const existing = loadResults(w, OFFLINE_CONFIG_KEY);
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
      const result = scoreOfflineCase(item.evalCase, ds.datasetVersion, runId);
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
    console.log(`[${w}] done -> ${resultsPath(w, OFFLINE_CONFIG_KEY)}`);
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
    }
  }
  return [...configs].sort();
}

function modeReport(workloads: AnalysisEvalWorkload[], outPath: string, showHeldoutDetail: boolean): void {
  const scorecards: WorkloadScorecard[] = [];
  const detail: ScorecardDetailBlock[] = [];
  for (const w of workloads) {
    const { ds } = loadDataset(w);
    const splitOf = Object.fromEntries(ds.cases.map((c) => [c.id, c.split]));
    const configs = discoverConfigs(w);
    if (configs.length === 0) {
      console.warn(`[${w}] no results found under ${RESULTS_DIR} — run --offline (or a live sweep) first`);
      continue;
    }
    // baseline for pairwise candidate gates: the production default model's
    // LIVE results on the same dataset, when present
    const baselineLive = loadResults(w, ANALYSIS_DEFAULT_MODEL);
    for (const configKey of configs) {
      const rf = loadResults(w, configKey);
      if (!rf) continue;
      const live = configKey !== OFFLINE_CONFIG_KEY;
      const baseline = live && configKey !== ANALYSIS_DEFAULT_MODEL ? baselineLive : null;
      scorecards.push(buildWorkloadScorecard(ds, rf, baseline, live));
      detail.push({ workload: w, configKey, results: Object.values(rf.results), splitOf });

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
  const configKey = liveConfigKey(cfg.model, cfg.reasoningEffort);
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

async function main(): Promise<void> {
  const fresh = hasFlag("fresh");
  const onlyIds = parseOnly();
  if (fresh && onlyIds !== null) {
    console.error("--fresh and --only are mutually exclusive (--only is already a forced rerun of its ids)");
    process.exit(2);
  }
  const devOnly = hasFlag("dev");

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
