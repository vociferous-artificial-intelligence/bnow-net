import "./env";

// ASK Tier-2+ sprint, Workstream F2: eval runner + scorecard.
//
// Runs docs/evals/ask-eval-set.json (built by scripts/ask-eval-harvest.ts,
// Workstream F1) through one or more ASK pipeline configs, scores each answer
// against the eval set's gold claims (re-resolved by TEXT at run time — ids are
// hints only, see docs/evals/README.md), and writes a scorecard the D4 gate reads.
//
// All pure scoring/aggregation/gate logic lives in src/lib/ask/eval-run.ts
// (unit-tested, no I/O). This file is ONLY: CLI args, file I/O, and calling the
// live pipeline stages (retrieve / retrieveV2 / rerankCandidates / ask /
// answerFromEvidence) — real DB reads and real paid LLM calls when NOT run with
// --estimate or --report.
//
// Required env (only for a live sweep — --estimate and --report need neither DB
// nor an LLM key):
//   DATABASE_URL           MUST point at the disposable Neon EVAL BRANCH, never
//                          prod (this script never hardcodes or reads back which
//                          branch — that's the supervisor's call every run).
//   OPENAI_API_KEY         needed for the v2 vector/rerank/answer stages and the
//                          legacy answer call to run live; without it every
//                          stage degrades (fine for --estimate, WRONG for a
//                          scored sweep — see the degraded-result abort below).
//   LLM_SPRINT_USD_CAP     all-time backstop every OpenAI call site fail-closes
//                          on when unset (standing ruling 4).
//   ASK_USD_CAP_DAILY      daily cap for the ASK embed/rerank/answer guard
//                          (src/lib/usage/llm-guard.ts askGuardFromEnv).
//   EMBED_USD_CAP_DAILY    daily cap for the embedding guard (retrieveV2's vector arm).
// A missing cap does not crash the run — the guarded stage just degrades
// (stub/lexical-only/composite-fallback). This runner DETECTS that degradation
// per question (src/lib/ask/eval-run.ts isDegradedResult) and ABORTS the sweep
// loudly rather than silently scoring a degraded pipeline as if it were live.
//
// Usage:
//   npx tsx scripts/ask-eval.ts --estimate [--configs legacy,v2-k60]
//     -> prints per-config question counts + rough cost, exits. $0, no DB, no LLM.
//
//   DATABASE_URL=<eval-branch-url> LLM_SPRINT_USD_CAP=6 ASK_USD_CAP_DAILY=6 \
//   EMBED_USD_CAP_DAILY=1 npx tsx scripts/ask-eval.ts [--configs ...] [--fresh]
//     -> runs the sweep (paid). Resumable-by-(config,questionId): a rerun skips
//        completed questions per config unless --fresh. Ctrl-C-safe — each
//        question's result is persisted to docs/evals/results-<config>.json the
//        moment it completes.
//
//   npx tsx scripts/ask-eval.ts --report [--configs ...] [--out path.md]
//     -> reads docs/evals/results-<config>.json for the selected configs and
//        writes docs/evals/ASK-EVAL-2026-07-11.md (default --out). $0, no DB
//        needed (branch host metadata is carried inside each results file), no LLM.
//
//   ... npx tsx scripts/ask-eval.ts --only negative-01,negative-02,negative-03,negative-04,negative-05
//     -> targeted rerun: runs EXACTLY the listed question ids (replacing their
//        stored entries even when already recorded), leaving everything else
//        untouched. The cheap way to apply a metric recalibration — the round-1
//        negative-honesty fix needs only the 5 negatives re-scored per config
//        (~$0.29 across all four configs), not a full --fresh sweep (~$1.68).
//
// Flags: --configs a,b,c (default: all four) · --eval-set <path> (default
// docs/evals/ask-eval-set.json) · --fresh (ignore existing results, rerun
// everything) · --only id1,id2 (targeted rerun of exactly these ids; mutually
// exclusive with --fresh) · --out <path> (--report only).
//
//   ... npx tsx scripts/ask-eval.ts --offline-fidelity --configs v2-k60+<model>
//     -> DB-FREE fidelity-only sweep (docs/designs/LOCAL-MODEL-ASK-EVAL-2026-08-17.md
//        §7.2): DATABASE_URL is DELETED from the process before anything runs
//        (scripts/env.ts loaded .env.local's prod URL at import — "no database"
//        is not automatic), fetchLiveClaims() is skipped, non-fidelity questions
//        are filtered out loudly, and answerFromEvidence gets an in-memory
//        StageGuard (no SpendGuard, no provider_usage — sanctioned ONLY for
//        this mode's local-endpoint arms plus the one operator-authorized
//        hosted reference arm; the guard logs measured usage per config).
//        Point OPENAI_BASE_URL at an OpenAI-compatible local endpoint (e.g.
//        Ollama http://localhost:11434/v1) with any non-empty OPENAI_API_KEY;
//        an unset OPENAI_BASE_URL requires the explicit --allow-hosted flag
//        (the PAID hosted reference arm is a deliberate choice, never a
//        forgotten export). v2 MATRIX configs only (v2-kNN+<model> — a bare
//        base config would run the production default model unguarded and
//        corrupt its checked-in baseline results file), one config alias per
//        (model × fallback × eval set) — a results file whose evalSetPath
//        differs is refused, never fused. A provider "error"/"none" result
//        ABORTS before being recorded (never record garbage); "stub"/"budget"
//        abort as always.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EVAL_CONFIGS,
  aggregateFromResultsFile,
  buildEstimatePlan,
  buildKSensitivityTable,
  computeGate,
  computeQuestionMetrics,
  configAnswerModel,
  configEvidenceK,
  emptyResultsFile,
  isEvalConfig,
  isV2Config,
  mergeResults,
  pendingQuestions,
  renderScorecardMarkdown,
  resolveQuestionGold,
  selectOnlyQuestions,
  toDetailRows,
  type EvalConfig,
  type LiveClaim,
  type QuestionRunResult,
  type ResultsFile,
  type StoredQuestionResult,
} from "../src/lib/ask/eval-run";
import type { EvalQuestion, EvalSet } from "../src/lib/ask/eval-set";

const EVALS_DIR = path.join(__dirname, "..", "docs", "evals");
const DEFAULT_EVAL_SET_PATH = path.join(EVALS_DIR, "ask-eval-set.json");
const DEFAULT_REPORT_PATH = path.join(EVALS_DIR, "ASK-EVAL-2026-07-11.md");

function resultsPath(config: EvalConfig): string {
  return path.join(EVALS_DIR, `results-${config}.json`);
}

// ---- CLI args -----------------------------------------------------------------

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseConfigs(): EvalConfig[] {
  const raw = flagValue("configs");
  if (!raw) return [...EVAL_CONFIGS];
  const picked = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = picked.filter((p) => !isEvalConfig(p));
  if (bad.length > 0) {
    console.error(
      `--configs: unknown config(s): ${bad.join(", ")} (valid: ${EVAL_CONFIGS.join(", ")}, ` +
        `or a v2 answer-model matrix config like v2-k60+gpt-5-mini — retrieval/rerank held fixed, ` +
        `ASK_ANSWER_MODEL overridden per run)`,
    );
    process.exit(2);
  }
  return picked as EvalConfig[];
}

function hostOf(url: string | undefined): string {
  if (!url) return "(no DATABASE_URL)";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

// ---- file I/O -----------------------------------------------------------------

function loadEvalSet(p: string): EvalSet {
  if (!existsSync(p)) {
    console.error(
      `missing eval set: ${p} — the supervisor runs scripts/ask-eval-harvest.ts (--sample then --generate) ` +
        "and curates docs/evals/ask-eval-set.seed.json into it first",
    );
    process.exit(2);
  }
  return JSON.parse(readFileSync(p, "utf8")) as EvalSet;
}

function loadResultsFile(config: EvalConfig): ResultsFile | null {
  const p = resultsPath(config);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as ResultsFile;
}

function saveResultsFile(rf: ResultsFile): void {
  mkdirSync(EVALS_DIR, { recursive: true });
  writeFileSync(resultsPath(rf.config), JSON.stringify(rf, null, 2) + "\n");
}

// ---- --estimate -----------------------------------------------------------------

async function modeEstimate(configs: EvalConfig[], evalSetPath: string): Promise<void> {
  const evalSet = loadEvalSet(evalSetPath);
  const plan = buildEstimatePlan(configs, evalSet.questions.length);
  console.log(
    `eval set: ${evalSetPath} (${evalSet.questions.length} questions, corpus ${evalSet.corpus.claimCount} claims, ` +
      `${evalSet.corpus.minDate ?? "?"} .. ${evalSet.corpus.maxDate ?? "?"})`,
  );
  console.log("\nconfig       questions   $/question    est total");
  for (const row of plan) {
    console.log(
      `${row.config.padEnd(12)} ${String(row.questionCount).padEnd(11)} $${row.perQuestionUsd.toFixed(4).padEnd(12)} $${row.estTotalUsd.toFixed(4)}`,
    );
  }
  const grandTotal = plan.reduce((s, r) => s + r.estTotalUsd, 0);
  console.log(`\nestimated grand total across selected configs: $${grandTotal.toFixed(4)}`);
  console.log(
    "\nheuristic only (docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md §4: legacy ~$0.001/q, " +
      "v2 ~$0.014/q with answer model gpt-5) — actual cost is measured per run from usage/usageByStage.",
  );
  console.log("estimate only — no DB connection, no LLM calls, no files written.");
}

// ---- live pipeline calls, per config --------------------------------------------

async function fetchLiveClaims(): Promise<LiveClaim[]> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(`SELECT id, text FROM claims`)) as Array<{ id: number; text: string }>;
  return rows;
}

/** resolveQuestionGold, plus an immediate loud print of anything unresolved (no
 *  silent caps) — surfaced at run time, not just in the --report aggregate. */
function resolveAndWarnGold(q: EvalQuestion, liveClaims: LiveClaim[]) {
  const resolution = resolveQuestionGold(q, liveClaims);
  if (resolution.unresolved.length > 0) {
    console.warn(
      `  [${q.id}] ${resolution.unresolved.length} unresolved gold claim(s) (excluded from denominators): ` +
        resolution.unresolved.map((u) => `"${u.text.slice(0, 60)}${u.text.length > 60 ? "…" : ""}"`).join("; "),
    );
  }
  return resolution;
}

/** legacy: two retrieve() calls per question (one explicit for the candidate
 *  set, one inside ask() itself) — ask() doesn't expose the retrieval it ran, so
 *  this mirrors the spec's literal legacy flow rather than reaching into ask()'s
 *  internals to save a query. */
async function runLegacyQuestion(q: EvalQuestion, liveClaims: LiveClaim[]): Promise<QuestionRunResult> {
  const { retrieve } = await import("../src/lib/ask/retrieve");
  const { ask } = await import("../src/lib/ask/answer");
  const { ids: resolvedGoldIds, unresolvedCount: unresolvedGoldCount } = resolveAndWarnGold(q, liveClaims);

  const savedPipeline = process.env.ASK_PIPELINE;
  process.env.ASK_PIPELINE = "legacy"; // force legacy for this call, restore after (spec)
  const t0 = Date.now();
  try {
    const retrieval = await retrieve(q.question, { limit: 40 });
    const candidateIds = retrieval.claims.map((c) => c.claimId);
    const answer = await ask(q.question);
    return {
      question: q,
      resolvedGoldIds,
      unresolvedGoldCount,
      candidateIds,
      evidenceIds: candidateIds, // legacy: the 40 candidates ARE the evidence set
      answer,
      latencyMs: Date.now() - t0,
      costUsd: answer.usage?.costUsd ?? 0,
      openaiKeySet: !!process.env.OPENAI_API_KEY,
    };
  } finally {
    if (savedPipeline === undefined) delete process.env.ASK_PIPELINE;
    else process.env.ASK_PIPELINE = savedPipeline;
  }
}

async function runV2Question(
  q: EvalQuestion,
  config: EvalConfig,
  liveClaims: LiveClaim[],
): Promise<QuestionRunResult> {
  const { retrieveV2 } = await import("../src/lib/ask/retrieve-v2");
  const { rerankCandidates } = await import("../src/lib/ask/rerank");
  const { answerFromEvidence } = await import("../src/lib/ask/answer");
  const k = configEvidenceK(config)!;
  const answerModel = configAnswerModel(config);
  const { ids: resolvedGoldIds, unresolvedCount: unresolvedGoldCount } = resolveAndWarnGold(q, liveClaims);

  // config.ts reads ASK_EVIDENCE_K per call — set it IN-PROCESS so every stage
  // this question's pipeline touches agrees on K, in addition to passing k
  // explicitly to rerankCandidates below. A matrix config additionally overrides
  // ASK_ANSWER_MODEL for the answer stage ONLY — retrieval and rerank read their
  // own model knobs, which stay untouched (the Phase 0 matrix contract).
  const savedK = process.env.ASK_EVIDENCE_K;
  const savedAnswerModel = process.env.ASK_ANSWER_MODEL;
  process.env.ASK_EVIDENCE_K = String(k);
  if (answerModel !== null) process.env.ASK_ANSWER_MODEL = answerModel;
  const t0 = Date.now();
  try {
    const retrieval = await retrieveV2(q.question);
    const candidateIds = retrieval.claims.map((c) => c.claimId);
    const ranked = await rerankCandidates(q.question, retrieval.claims, k);
    const evidenceIds = ranked.claims.map((c) => c.claimId);
    const answer = await answerFromEvidence(q.question, retrieval, ranked);
    const costUsd =
      (answer.usageByStage?.embed?.costUsd ?? 0) +
      (answer.usageByStage?.rerank?.costUsd ?? 0) +
      (answer.usageByStage?.answer?.costUsd ?? 0);
    return {
      question: q,
      resolvedGoldIds,
      unresolvedGoldCount,
      candidateIds,
      evidenceIds,
      answer,
      latencyMs: Date.now() - t0,
      costUsd,
      openaiKeySet: !!process.env.OPENAI_API_KEY,
    };
  } finally {
    if (savedK === undefined) delete process.env.ASK_EVIDENCE_K;
    else process.env.ASK_EVIDENCE_K = savedK;
    if (savedAnswerModel === undefined) delete process.env.ASK_ANSWER_MODEL;
    else process.env.ASK_ANSWER_MODEL = savedAnswerModel;
  }
}

/** In-memory StageGuard for --offline-fidelity: init/record are bookkeeping
 *  only and tryReserve always admits. This bypasses SpendGuard/provider_usage
 *  BY DESIGN for this mode (the DB is gone) — local endpoints bill nothing,
 *  and the single hosted reference arm is operator-authorized in the plan doc.
 *  Totals accumulate so each config run can log measured usage loudly. */
function memoryStageGuard() {
  const totals = { requests: 0, tokens: 0, usd: 0 };
  const guard = {
    async init() {},
    tryReserve: () => ({ ok: true as const }),
    async record(requests: number, units: number, usd: number) {
      totals.requests += requests;
      totals.tokens += units;
      totals.usd += usd;
    },
  };
  return { totals, guard };
}
type MemoryStageGuard = ReturnType<typeof memoryStageGuard>;

/** Fidelity question (AI Search Phase 0): the answer stage runs over the
 *  fixture's INLINE evidence — no DB retrieval, no rerank call, so every config
 *  sees literally identical evidence and only the answer model varies. The
 *  synthetic claim ids exist only inside this run; nothing resolves against the
 *  live corpus.
 *
 *  opts.answerGuard (--offline-fidelity): threads the in-memory guard into
 *  answerFromEvidence. Absent (the pre-existing DB'd path) behavior is
 *  unchanged — the stage builds its own askGuardFromEnv. */
async function runFidelityQuestion(
  q: EvalQuestion,
  config: EvalConfig,
  opts?: { answerGuard?: MemoryStageGuard["guard"] },
): Promise<QuestionRunResult> {
  const { answerFromEvidence } = await import("../src/lib/ask/answer");
  const spec = q.fidelity;
  if (!spec) {
    console.error(`[${config}] fidelity question "${q.id}" carries no fidelity spec — refusing`);
    process.exit(2);
  }
  const claims = spec.evidence.map((e, i) => ({
    claimId: e.claimId,
    text: e.text,
    hedging: e.hedging,
    claimDate: e.claimDate,
    countryIso2: e.countryIso2,
    track: e.track,
    entities: e.entities,
    confidence: e.confidence,
    vectorScore: null,
    lexicalHit: true,
    compositeScore: spec.evidence.length - i,
  }));
  const retrieval = {
    claims,
    entities: [],
    terms: [],
    window: null,
    totalMatching: claims.length,
    mode: "v2" as const,
  };
  const ranked = { claims, rerankUsed: false };

  const answerModel = configAnswerModel(config);
  const savedAnswerModel = process.env.ASK_ANSWER_MODEL;
  if (answerModel !== null) process.env.ASK_ANSWER_MODEL = answerModel;
  // monotonic clock for the NEW measurement site (the two pre-existing runners
  // keep their historical Date.now() latencies for comparability).
  const t0 = performance.now();
  try {
    const g = opts?.answerGuard;
    const answer = await answerFromEvidence(
      q.question,
      retrieval,
      ranked,
      // only the answer stage runs here, but the guards option carries all
      // three stages — the same in-memory guard satisfies each structurally
      g ? { guards: { embed: g, rerank: g, answer: g } } : undefined,
    );
    return {
      question: q,
      resolvedGoldIds: [],
      unresolvedGoldCount: 0,
      candidateIds: claims.map((c) => c.claimId),
      evidenceIds: claims.map((c) => c.claimId),
      answer,
      latencyMs: Math.round(performance.now() - t0),
      costUsd: answer.usageByStage?.answer?.costUsd ?? 0,
      openaiKeySet: !!process.env.OPENAI_API_KEY,
    };
  } finally {
    if (savedAnswerModel === undefined) delete process.env.ASK_ANSWER_MODEL;
    else process.env.ASK_ANSWER_MODEL = savedAnswerModel;
  }
}

// ---- live sweep -------------------------------------------------------------------

function preflightEnvWarnings(): void {
  if (!process.env.OPENAI_API_KEY) {
    // isDegradedResult treats "no key at all" as EXPECTED (nothing to abort on),
    // so a keyless sweep runs to completion recording stub/deterministic answers
    // as if they were real — loud enough here that nobody mistakes that scorecard
    // for a measurement of the live pipeline.
    console.warn(
      "WARNING: OPENAI_API_KEY is NOT set. Every stage degrades to its offline/stub path and this run will " +
        "NOT abort (isDegradedResult only aborts a degraded result when a key IS set) — it will complete and " +
        "record a full scorecard of meaningless stub answers. Set OPENAI_API_KEY before a real sweep.",
    );
  }
  const capsWanted = ["LLM_SPRINT_USD_CAP", "ASK_USD_CAP_DAILY", "EMBED_USD_CAP_DAILY"];
  const missingCaps = capsWanted.filter((k) => !process.env[k]);
  if (missingCaps.length > 0) {
    console.warn(
      `WARNING: env not set: ${missingCaps.join(", ")} — the guarded stages fail closed (degrade) once ` +
        "a key IS set, and THAT case aborts this run loudly on the first degraded result rather than record it " +
        "(see isDegradedResult) — so a missing cap costs you a restart, not a bad scorecard.",
    );
  }
}

async function runConfig(
  config: EvalConfig,
  evalSet: EvalSet,
  liveClaims: LiveClaim[],
  fresh: boolean,
  onlyIds: string[] | null,
  dbHost: string,
  evalSetPath: string,
  offlineFidelity: boolean,
): Promise<void> {
  const existing = loadResultsFile(config);
  // §9 omission 2: one results file per (model × fallback × eval set). A
  // different eval set under an already-used config alias would silently fuse
  // two instruments into one aggregate (mergeResults overwrites evalSetPath);
  // refuse instead of trusting the operator's alias discipline.
  if (offlineFidelity && existing && path.resolve(existing.evalSetPath) !== path.resolve(evalSetPath)) {
    console.error(
      `[${config}] --offline-fidelity: ${resultsPath(config)} already holds results for eval set ` +
        `"${existing.evalSetPath}" — running "${evalSetPath}" under the same config would fuse two instruments ` +
        "into one aggregate. Use a distinct config alias per (model × fallback × eval set), or delete the file first.",
    );
    process.exit(2);
  }
  let todo: EvalQuestion[];
  if (onlyIds !== null) {
    // targeted rerun: exactly these ids, replacing their stored entries
    const { selected, unknownIds } = selectOnlyQuestions(evalSet, onlyIds);
    if (unknownIds.length > 0) {
      console.error(`--only: unknown question id(s) not in the eval set: ${unknownIds.join(", ")} — refusing`);
      process.exit(2);
    }
    todo = selected;
  } else {
    todo = pendingQuestions(evalSet, existing, fresh);
  }
  // Fidelity fixtures exercise the v2 answer stage; the legacy rollback path has
  // no answerFromEvidence, so they are skipped there — loudly, never silently.
  if (!isV2Config(config)) {
    const dropped = todo.filter((q) => q.type === "fidelity").length;
    if (dropped > 0) {
      console.log(`[${config}] skipping ${dropped} fidelity fixture(s) — v2-only (legacy has no answer stage to test)`);
      todo = todo.filter((q) => q.type !== "fidelity");
    }
  }
  // --offline-fidelity: only fidelity questions can run without a DB. Skipped
  // counts print loudly (no silent caps), and an eval set carrying NO fidelity
  // questions at all is a hard refusal — an empty sweep must never look done.
  if (offlineFidelity) {
    if (!evalSet.questions.some((q) => q.type === "fidelity")) {
      console.error(`[${config}] --offline-fidelity: eval set ${evalSetPath} has no fidelity questions — refusing`);
      process.exit(2);
    }
    const dropped = todo.filter((q) => q.type !== "fidelity").length;
    if (dropped > 0) {
      console.log(`[${config}] --offline-fidelity: skipping ${dropped} non-fidelity question(s) (DB-backed types cannot run offline)`);
      todo = todo.filter((q) => q.type === "fidelity");
    }
  }
  const alreadyDone = Object.keys(existing?.results ?? {}).length;
  if (todo.length === 0) {
    console.log(`[${config}] nothing to do — ${alreadyDone} question(s) already recorded (use --fresh to rerun)`);
    return;
  }
  console.log(
    `[${config}] running ${todo.length} question(s) (${alreadyDone} already recorded${onlyIds !== null ? "; --only targeted rerun" : ""})`,
  );

  let rf = existing ?? emptyResultsFile(config, evalSetPath, dbHost);
  const mem = offlineFidelity ? memoryStageGuard() : null;

  for (const q of todo) {
    const run =
      q.type === "fidelity"
        ? await runFidelityQuestion(q, config, mem ? { answerGuard: mem.guard } : undefined)
        : isV2Config(config)
          ? await runV2Question(q, config, liveClaims)
          : await runLegacyQuestion(q, liveClaims);

    const metrics = computeQuestionMetrics(run);
    if (metrics.degraded) {
      console.error(
        `\n[${config}] ABORT: degraded result on question "${q.id}" ` +
          `(retrievalMode=${run.answer.retrievalMode}, provider=${run.answer.provider}) with OPENAI_API_KEY set. ` +
          `${Object.keys(rf.results).length} question(s) already recorded are preserved in ${resultsPath(config)}. ` +
          "Check LLM_DISABLE / ANALYSIS_PROVIDER / the eval branch's spend-guard caps, then rerun (resumes from here).",
      );
      process.exit(1);
    }
    // Offline mode: provider "error" is a transport/exception outcome (the
    // answer stage's Query-failed catch), not model behavior — recording it
    // would score a dead endpoint as a model verdict, and the resume-by-key
    // design would then SKIP it on rerun. Abort BEFORE merging, so a rerun
    // resumes at exactly this question. (A truncated/refused outcome keeps its
    // provider "openai:<model>" and records normally — that IS model behavior.)
    if (offlineFidelity && metrics.provider === "error") {
      console.error(
        `\n[${config}] ABORT: provider "error" on question "${q.id}" — the endpoint call failed ` +
          `(${metrics.answerSnippet.slice(0, 160)}). Nothing recorded for it; fix the endpoint and rerun (resumes here).`,
      );
      process.exit(1);
    }
    if (offlineFidelity && metrics.provider === "none") {
      // Unreachable for well-formed fidelity fixtures (inline evidence is never
      // empty) — and recording it would be worse than useless: an empty-evidence
      // fixture yields state "insufficient" with ZERO model involvement, which a
      // family-(a) acceptStates ["insufficient"] spec would score as a PASS the
      // model never earned, silently skipped on every resume. Abort before merge.
      console.error(
        `\n[${config}] ABORT: provider "none" on question "${q.id}" — the fixture's inline evidence is empty ` +
          "(the answer stage never ran). Fix the fixture and rerun (nothing recorded for it).",
      );
      process.exit(1);
    }

    const stored: StoredQuestionResult = { questionId: q.id, metrics };
    rf = mergeResults(rf, config, evalSetPath, dbHost, [stored]);
    saveResultsFile(rf); // persist after EVERY question — resumable-by-key (MR3 lesson)
    console.log(
      `  ${q.id} [${q.type}] state=${metrics.state} candHit=${metrics.candidateHit} evHit=${metrics.evidenceHit} ` +
        `cited=${metrics.cited} $${metrics.costUsd.toFixed(4)} ${metrics.latencyMs}ms`,
    );
  }
  if (mem) {
    console.log(
      `[${config}] offline guard totals: ${mem.totals.requests} request(s), ${mem.totals.tokens} token(s), ` +
        `$${mem.totals.usd.toFixed(4)} (price-table estimate — meaningless for local models)`,
    );
  }
  console.log(`[${config}] done.`);
}

/** --offline-fidelity preflight (LOCAL-MODEL-ASK-EVAL §7.2). Hard assertions
 *  replace the cap warnings: every silent-degrade path either aborts later
 *  (stub/budget via isDegradedResult) or is refused here before any run. */
function offlinePreflight(configs: EvalConfig[], allowHosted: boolean): void {
  const nonV2 = configs.filter((c) => !isV2Config(c));
  if (nonV2.length > 0) {
    console.error(`--offline-fidelity: v2 configs only (legacy has no answer stage to test): ${nonV2.join(", ")}`);
    process.exit(2);
  }
  // §9 omission 3: a bare base config (no +model suffix) would leave
  // ASK_ANSWER_MODEL at the production default (a PAID hosted model, on the
  // always-admit in-memory guard) AND merge offline rows into that config's
  // checked-in baseline results file. Matrix configs only.
  const bare = configs.filter((c) => configAnswerModel(c) === null);
  if (bare.length > 0) {
    console.error(
      `--offline-fidelity: matrix configs only (v2-kNN+<model>) — bare config(s) ${bare.join(", ")} would run ` +
        "the production default answer model unguarded and corrupt results-<config>.json baselines",
    );
    process.exit(2);
  }
  // §9 omission 1: scripts/env.ts already loaded .env.local — which carries the
  // PRODUCTION DATABASE_URL — at import time. Delete both URL vars so no code
  // path can touch the prod DB: safeCurrency() degrades to null (the prompt's
  // "Data current through" line is omitted, the documented DB-free shape), and
  // any missed guard would throw instead of writing provider_usage rows.
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "--offline-fidelity: OPENAI_API_KEY must be NON-EMPTY (a local endpoint ignores the value, but " +
        "answerOffline() silently degrades every question to the stub path without one — set OPENAI_API_KEY=ollama)",
    );
    process.exit(2);
  }
  if (process.env.LLM_DISABLE === "1" || process.env.ANALYSIS_PROVIDER === "stub") {
    console.error(
      "--offline-fidelity: LLM_DISABLE=1 / ANALYSIS_PROVIDER=stub would degrade the answer stage to stub — unset and rerun",
    );
    process.exit(2);
  }
  const base = process.env.OPENAI_BASE_URL?.trim();
  // No silent hosted spend: with no local endpoint every call is a PAID
  // hosted dispatch on the always-admit guard — that must be an explicit
  // choice (the plan's one authorized hosted reference arm), never a
  // forgotten export.
  if (!base && !allowHosted) {
    console.error(
      "--offline-fidelity: OPENAI_BASE_URL is not set, so every answer call would dispatch to the HOSTED OpenAI " +
        "API on the always-admit in-memory guard (no SpendGuard). Export OPENAI_BASE_URL for a local endpoint, or " +
        "pass --allow-hosted to run a paid hosted reference arm deliberately.",
    );
    process.exit(2);
  }
  console.log(
    `--offline-fidelity: answer endpoint = ${base || "https://api.openai.com/v1 (SDK default — hosted, PAID, --allow-hosted)"}; ` +
      "DATABASE_URL deleted for this process; in-memory stage guard (no SpendGuard/provider_usage); " +
      `ASK_FIDELITY_FALLBACK=${process.env.ASK_FIDELITY_FALLBACK ?? "(default on)"}`,
  );
}

async function modeRun(
  configs: EvalConfig[],
  evalSetPath: string,
  fresh: boolean,
  onlyIds: string[] | null,
  offlineFidelity: boolean,
): Promise<void> {
  if (!offlineFidelity && !process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — point it at the disposable Neon EVAL BRANCH (never prod) and rerun");
    process.exit(2);
  }
  if (fresh && onlyIds !== null) {
    console.error("--fresh and --only are mutually exclusive (--only is already a forced rerun of its ids)");
    process.exit(2);
  }
  let dbHost: string;
  if (offlineFidelity) {
    offlinePreflight(configs, hasFlag("allow-hosted"));
    dbHost = "(offline-fidelity — no DB)";
  } else {
    preflightEnvWarnings();
    dbHost = hostOf(process.env.DATABASE_URL);
    console.log(`DB host: ${dbHost}`);
  }

  // loadEvalSet BEFORE any DB contact — a bad --eval-set path exits without
  // ever opening a connection (the pre-existing DB'd ordering, preserved).
  const evalSet = loadEvalSet(evalSetPath);
  let liveClaims: LiveClaim[] = []; // offline: fidelity gold is inline; nothing resolves against a corpus
  if (!offlineFidelity) {
    liveClaims = await fetchLiveClaims();
    console.log(`loaded ${liveClaims.length} live claim(s) from ${dbHost} for gold text-resolution`);
  }

  for (const config of configs) {
    await runConfig(config, evalSet, liveClaims, fresh, onlyIds, dbHost, evalSetPath, offlineFidelity);
  }
  console.log('\nsweep complete. Run with --report to build the scorecard.');
}

// ---- --report -----------------------------------------------------------------

async function modeReport(configs: EvalConfig[], evalSetPath: string, outPath: string): Promise<void> {
  const evalSet = loadEvalSet(evalSetPath);
  const files = configs.map(loadResultsFile).filter((f): f is ResultsFile => f !== null);
  if (files.length === 0) {
    console.error(
      `no results-<config>.json found under ${EVALS_DIR} for the selected configs (${configs.join(", ")}) — run the sweep first`,
    );
    process.exit(2);
  }

  const aggregates = files.map(aggregateFromResultsFile);
  const detailRows = files.flatMap((f) =>
    toDetailRows(
      f.config,
      Object.values(f.results).map((r) => r.metrics),
    ),
  );
  const kSensitivity = buildKSensitivityTable(aggregates);
  const legacyAgg = aggregates.find((a) => a.config === "legacy") ?? null;
  const v2k60Agg = aggregates.find((a) => a.config === "v2-k60") ?? null;
  const gate = legacyAgg && v2k60Agg ? computeGate(legacyAgg, v2k60Agg) : null;

  const md = renderScorecardMarkdown({
    meta: {
      generatedAt: new Date().toISOString(),
      evalSetPath,
      evalSetCreatedAt: evalSet.createdAt,
      corpus: evalSet.corpus,
      dbHost: files[0]?.dbHost ?? "(unknown)",
      configsRun: files.map((f) => f.config),
    },
    aggregates,
    kSensitivity,
    gate,
    detailRows,
  });

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  console.log(`wrote scorecard -> ${outPath}`);
  console.log(gate ? `\nGATE overall: ${gate.overallPass ? "PASS" : "FAIL"}` : "\nGATE not computed (need both legacy and v2-k60 results).");

  // No silent caps — surface anything skipped/unresolved/degraded even in report mode.
  for (const a of aggregates) {
    if (a.unresolvedGoldCount > 0) {
      console.warn(`[${a.config}] ${a.unresolvedGoldCount} unresolved gold claim(s) — excluded from recall/citation denominators`);
    }
    if (a.questionsWithoutGold > 0) {
      console.warn(`[${a.config}] ${a.questionsWithoutGold} question(s) with no gold curated yet — excluded from denominators`);
    }
    if (a.degradedRunCount > 0) {
      console.error(
        `[${a.config}] ${a.degradedRunCount} DEGRADED result(s) recorded — this should be 0 (a live sweep aborts ` +
          "on the first one); investigate before trusting this scorecard",
      );
    }
  }
}

// ---- entry --------------------------------------------------------------------

async function main(): Promise<void> {
  const configs = parseConfigs();
  const evalSetPath = flagValue("eval-set") ?? DEFAULT_EVAL_SET_PATH;
  const outPath = flagValue("out") ?? DEFAULT_REPORT_PATH;
  const fresh = hasFlag("fresh");
  const onlyRaw = flagValue("only");
  const onlyIds = onlyRaw !== undefined ? onlyRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;

  if (hasFlag("estimate")) return modeEstimate(configs, evalSetPath);
  if (hasFlag("report")) return modeReport(configs, evalSetPath, outPath);
  return modeRun(configs, evalSetPath, fresh, onlyIds, hasFlag("offline-fidelity"));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
