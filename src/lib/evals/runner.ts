// Analysis-eval control plane, C3: the runner's PURE parts. No DB, no network,
// no OpenAI client construction anywhere in this module — all I/O beyond
// dataset/results FILES lives in scripts/analysis-eval.ts, and everything that
// can touch a provider lives in live-runner.ts (dynamically imported by the
// script ONLY on an authorized --execute-live run).
//
// LEAKAGE PREVENTION (test-pinned in runner.test.ts): the candidate prompt
// builders below take ONLY a case's `input` — the `reference` (gold) never
// reaches any prompt. Heldout discipline: `--dev` runs exclude split
// "heldout" entirely and every report labels the split; humans must not
// iterate prompts against heldout results (docs/evals/analysis/README.md).

import { createHash } from "node:crypto";
import {
  mapContentChars,
  mapDocLine,
  mapExtractorVersion,
  mapResponseSchema,
  mapSystemPrompt,
  mapUserMessage,
} from "../analysis/map-prompts";
import { clusterClaims, rankGroups, type ReduceClaim } from "../analysis/reduce";
import {
  reduceVotes,
  synthesisResponseSchema,
  synthesisUserMessage,
  synthesisSystemPrompt,
} from "../analysis/synthesize";
import type { Track } from "../analysis/tracks";
import { ANALYSIS_ROUTING_REGISTRY_VERSION } from "../llm/analysis-registry";
import { estimateCostUsd } from "../llm/pricing";
import {
  MATCH_RESPONSE_SCHEMA,
  MATCH_SYSTEM_PROMPT,
  buildMatchUserPrompt,
} from "../validation/llm-match";
import type { ClaimForValidation } from "../validation/score";
import {
  resultKey,
  type AnalysisEvalCase,
  type AnalysisEvalDataset,
  type AnalysisEvalWorkload,
  type CandidateDispatchIdentity,
  type DigestEvalCase,
  type DigestEvalInput,
  type EvalCaseResult,
  type EvalResultsFile,
  type MapEvalCase,
  type MapEvalInput,
  type ReduceEvalCase,
  type ValidationEvalCase,
  type ValidationEvalInput,
} from "./contracts";
import {
  computeScorecardVerdict,
  type HeldoutCoverage,
  type ScorecardVerdictResult,
  type WorkloadAggregate,
} from "./gates";
import { scoreMapCase } from "./score-map";
import { scoreDigestCase, scoreReduceCase } from "./score-reduce";
import { scoreValidationCase } from "./score-validation";

export const OFFLINE_CONFIG_KEY = "offline-fixtures";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ============================================================================
// Candidate prompts — input ONLY, never reference (leakage pin)
// ============================================================================

export interface CandidatePrompt {
  system: string;
  user: string;
}

export function buildMapCandidatePrompt(input: MapEvalInput): CandidatePrompt {
  const track = input.track as Track;
  return {
    system: mapSystemPrompt(track, input.theater),
    user: mapUserMessage(
      track,
      input.theater,
      input.docs.map((d) => d.docId),
      input.docs.map((d) =>
        mapDocLine({
          id: d.docId,
          sourceKey: d.sourceKey ?? null,
          reliability: d.reliability ?? null,
          day: d.day,
          title: d.title,
          content: d.content,
        }),
      ),
    ),
  };
}

export function buildDigestVotePrompt(input: DigestEvalInput): CandidatePrompt {
  const mirrorOf =
    input.mirrorOf && input.mirrorOf.length > 0 ? new Map(input.mirrorOf) : undefined;
  const groups = clusterClaims(input.claims as ReduceClaim[], { mirrorOf });
  const nowMs = Date.parse(`${input.date}T00:00:00Z`) + 86_400_000;
  const fed = rankGroups(groups, nowMs);
  return {
    system: synthesisSystemPrompt(input.track as Track, input.theater),
    user: synthesisUserMessage(input.theater, input.date, fed, {
      claims: input.claims.length,
      groupsTotal: groups.length,
    }),
  };
}

export function buildValidationCandidatePrompt(input: ValidationEvalInput): CandidatePrompt {
  return {
    system: MATCH_SYSTEM_PROMPT,
    user: buildMatchUserPrompt(
      input.takeaways.map((t) => t.text),
      input.claims as ClaimForValidation[],
    ),
  };
}

export function buildCandidatePrompt(c: AnalysisEvalCase): CandidatePrompt {
  switch (c.workload) {
    case "map":
      return buildMapCandidatePrompt(c.input);
    case "digest":
      return buildDigestVotePrompt(c.input);
    case "validation":
      return buildValidationCandidatePrompt(c.input);
    case "reduce":
      // deterministic pipeline: nothing is ever sent to a model
      throw new Error("reduce is a deterministic workload — no candidate prompt exists");
  }
}

// ============================================================================
// Configuration identity
// ============================================================================

/** sha256 over the exact prompt bytes the runner would send, computed from the
 *  REAL prompt builders over every promptable case of the dataset (sorted by
 *  case id — deterministic). Reduce datasets hash to the fixed marker below. */
export function datasetPromptHash(dataset: AnalysisEvalDataset): string {
  if (dataset.workload === "reduce") return sha256("reduce:deterministic-pipeline");
  const parts = [...dataset.cases]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => {
      const p = buildCandidatePrompt(c);
      return `${c.id}\n${p.system}\n${p.user}`;
    });
  return sha256(parts.join("\n---\n"));
}

export function workloadSchemaVersion(dataset: AnalysisEvalDataset): string {
  switch (dataset.workload) {
    case "map": {
      const sizes = [...new Set(dataset.cases.map((c) => (c as MapEvalCase).input.docs.length))].sort(
        (a, b) => a - b,
      );
      return sha256(sizes.map((n) => JSON.stringify(mapResponseSchema(n))).join("\n"));
    }
    case "digest": {
      const tracks = [...new Set(dataset.cases.map((c) => (c as DigestEvalCase).input.track))].sort();
      return sha256(tracks.map((t) => JSON.stringify(synthesisResponseSchema(t as Track))).join("\n"));
    }
    case "validation":
      return sha256(JSON.stringify(MATCH_RESPONSE_SCHEMA));
    case "reduce":
      return sha256("reduce:no-response-schema");
  }
}

/** map only: mapExtractorVersion per (track, theater) present in the dataset,
 *  "track/theater=version" joined sorted. */
export function datasetExtractorVersions(dataset: AnalysisEvalDataset): string | undefined {
  if (dataset.workload !== "map") return undefined;
  const pairs = new Set(
    dataset.cases.map((c) => `${(c as MapEvalCase).input.track}/${(c as MapEvalCase).input.theater}`),
  );
  return [...pairs]
    .sort()
    .map((p) => {
      const [track, theater] = p.split("/");
      return `${p}=${mapExtractorVersion(track as Track, theater)}`;
    })
    .join(",");
}

export function offlineIdentity(dataset: AnalysisEvalDataset): CandidateDispatchIdentity {
  return {
    provider: "stub",
    model: OFFLINE_CONFIG_KEY,
    reasoningEffort: null,
    registryVersion: ANALYSIS_ROUTING_REGISTRY_VERSION,
    approval: "baseline",
    promptHash: datasetPromptHash(dataset),
    schemaVersion: workloadSchemaVersion(dataset),
    ...(dataset.workload === "map" ? { extractorVersion: datasetExtractorVersions(dataset) } : {}),
  };
}

export function liveConfigKey(model: string, effort: string | null): string {
  return effort === null ? model : `${model}@${effort}`;
}

// ============================================================================
// --estimate heuristics (documented; conservative = over-estimate)
// ============================================================================

/** chars -> tokens blend measured in the pipeline audit (§9d: 0.25-0.38 by
 *  language) — the same 0.32 the map worker's dry-run cost model uses. */
export const EST_TOKENS_PER_CHAR = 0.32;
/** per-call fixed overhead (message framing + schema echo), rounded up */
export const EST_CALL_OVERHEAD_TOKENS = 120;
/** map output: the worker's own per-doc assumption with headroom (audit §11
 *  measures ~135; the worker budgets 200 — the estimate uses the budget) */
export const EST_MAP_OUT_TOKENS_PER_DOC = 200;
/** digest output per vote: <=12 events of title+summary+claims; fixtures feed
 *  far fewer groups than production, 2000 is deliberate headroom */
export const EST_DIGEST_OUT_TOKENS_PER_VOTE = 2000;
/** validation output: one match row (~40 tok) per takeaway + envelope */
export const EST_VALIDATION_OUT_TOKENS_PER_TAKEAWAY = 40;
export const EST_VALIDATION_OUT_TOKENS_BASE = 200;

export interface EstimateRow {
  caseId: string;
  calls: number;
  estPromptTokens: number;
  estCompletionTokens: number;
  estUsd: number;
}

export interface EstimatePlan {
  workload: AnalysisEvalWorkload;
  model: string;
  repetitions: number;
  rows: EstimateRow[];
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalUsd: number;
}

export function buildAnalysisEstimatePlan(
  dataset: AnalysisEvalDataset,
  model: string,
  repetitions: number,
): EstimatePlan {
  const rows: EstimateRow[] = [];
  for (const c of dataset.cases) {
    let calls = 0;
    let inTok = 0;
    let outTok = 0;
    if (dataset.workload === "reduce") {
      rows.push({ caseId: c.id, calls: 0, estPromptTokens: 0, estCompletionTokens: 0, estUsd: 0 });
      continue;
    }
    const prompt = buildCandidatePrompt(c);
    const promptTok =
      Math.ceil((prompt.system.length + prompt.user.length) * EST_TOKENS_PER_CHAR) +
      EST_CALL_OVERHEAD_TOKENS;
    switch (dataset.workload) {
      case "map": {
        const docs = (c as MapEvalCase).input.docs.length;
        calls = 1;
        inTok = promptTok;
        outTok = docs * EST_MAP_OUT_TOKENS_PER_DOC;
        // documented ceiling parity: content chars are already bounded by
        // mapContentChars() inside mapDocLine, so promptTok cannot understate
        void mapContentChars();
        break;
      }
      case "digest": {
        calls = reduceVotes(); // ruling 18: K=5 votes is the shipped configuration
        inTok = promptTok * calls;
        outTok = EST_DIGEST_OUT_TOKENS_PER_VOTE * calls;
        break;
      }
      case "validation": {
        calls = 1;
        inTok = promptTok;
        outTok =
          (c as ValidationEvalCase).input.takeaways.length * EST_VALIDATION_OUT_TOKENS_PER_TAKEAWAY +
          EST_VALIDATION_OUT_TOKENS_BASE;
        break;
      }
    }
    rows.push({
      caseId: c.id,
      calls: calls * repetitions,
      estPromptTokens: inTok * repetitions,
      estCompletionTokens: outTok * repetitions,
      estUsd: estimateCostUsd(model, inTok, outTok) * repetitions,
    });
  }
  return {
    workload: dataset.workload,
    model,
    repetitions,
    rows,
    totalCalls: rows.reduce((s, r) => s + r.calls, 0),
    totalPromptTokens: rows.reduce((s, r) => s + r.estPromptTokens, 0),
    totalCompletionTokens: rows.reduce((s, r) => s + r.estCompletionTokens, 0),
    totalUsd: rows.reduce((s, r) => s + r.estUsd, 0),
  };
}

// ============================================================================
// Results-file resume (resumable by (caseId, repetition); MR3 lesson)
// ============================================================================

export function emptyEvalResultsFile(
  workload: AnalysisEvalWorkload,
  configKey: string,
  datasetVersion: string,
  identity: CandidateDispatchIdentity,
): EvalResultsFile {
  return {
    workload,
    configKey,
    datasetVersion,
    identity,
    updatedAt: new Date(0).toISOString(),
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    results: {},
  };
}

export interface MeterDelta {
  attempts: number;
  reservations: number;
  meterings: number;
  erroredAttempts: number;
}

export const ZERO_METER: MeterDelta = { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 };

export function mergeEvalResults(
  existing: EvalResultsFile | null,
  base: Omit<EvalResultsFile, "updatedAt" | "results" | "meter">,
  additions: EvalCaseResult[],
  meterDelta: MeterDelta,
  now: Date = new Date(),
): EvalResultsFile {
  const results = { ...(existing?.results ?? {}) };
  for (const a of additions) results[resultKey(a.caseId, a.repetition)] = a;
  const prior = existing?.meter ?? ZERO_METER;
  return {
    ...base,
    updatedAt: now.toISOString(),
    meter: {
      attempts: prior.attempts + meterDelta.attempts,
      reservations: prior.reservations + meterDelta.reservations,
      meterings: prior.meterings + meterDelta.meterings,
      erroredAttempts: prior.erroredAttempts + meterDelta.erroredAttempts,
    },
    results,
  };
}

export interface PendingWorkItem {
  evalCase: AnalysisEvalCase;
  repetition: number;
}

export function selectCases(
  dataset: AnalysisEvalDataset,
  onlyIds: string[] | null,
): { selected: AnalysisEvalCase[]; unknownIds: string[] } {
  if (onlyIds === null) return { selected: dataset.cases.slice(), unknownIds: [] };
  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const selected: AnalysisEvalCase[] = [];
  const unknownIds: string[] = [];
  const seen = new Set<string>();
  for (const id of onlyIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const c = byId.get(id);
    if (c) selected.push(c);
    else unknownIds.push(id);
  }
  return { selected, unknownIds };
}

/** Work still to do. `--only` always reruns its ids (mergeEvalResults replaces
 *  on key collision); otherwise completed (caseId, repetition) keys are
 *  skipped unless `fresh`. `devOnly` (--dev) excludes heldout cases. */
export function pendingWork(
  dataset: AnalysisEvalDataset,
  existing: EvalResultsFile | null,
  opts: { repetitions: number; fresh: boolean; onlyIds: string[] | null; devOnly: boolean },
): { work: PendingWorkItem[]; unknownIds: string[]; excludedHeldout: number } {
  const { selected, unknownIds } = selectCases(dataset, opts.onlyIds);
  const devFiltered = opts.devOnly ? selected.filter((c) => c.split !== "heldout") : selected;
  const excludedHeldout = selected.length - devFiltered.length;
  const done = new Set(opts.fresh || !existing ? [] : Object.keys(existing.results));
  const work: PendingWorkItem[] = [];
  for (const evalCase of devFiltered) {
    for (let repetition = 0; repetition < opts.repetitions; repetition++) {
      if (opts.onlyIds === null && done.has(resultKey(evalCase.id, repetition))) continue;
      work.push({ evalCase, repetition });
    }
  }
  return { work, unknownIds, excludedHeldout };
}

// ============================================================================
// Offline scoring (deterministic; committed-fixture candidates)
// ============================================================================

export function scoreOfflineCase(
  evalCase: AnalysisEvalCase,
  datasetVersion: string,
  runId: string,
): EvalCaseResult {
  let checks: EvalCaseResult["checks"];
  let status: EvalCaseResult["status"] = "scored";
  let rawOutputDigest: string;
  let fixtureId: string | undefined;

  switch (evalCase.workload) {
    case "map": {
      const c = evalCase as MapEvalCase;
      fixtureId = c.offline.fixtureId;
      const mc = scoreMapCase(c, c.offline.rawOutput, c.offline.truncated === true);
      checks = mc;
      if (!mc.truncated && !mc.schemaValid) status = "schema_invalid";
      rawOutputDigest = sha256(c.offline.rawOutput);
      break;
    }
    case "reduce": {
      const scored = scoreReduceCase(evalCase as ReduceEvalCase);
      checks = scored.checks;
      rawOutputDigest = sha256(scored.serializedOutput);
      break;
    }
    case "digest": {
      const c = evalCase as DigestEvalCase;
      fixtureId = c.offline.fixtureId;
      const scored = scoreDigestCase(c, c.offline.votes);
      checks = scored.checks;
      rawOutputDigest = sha256(scored.serializedOutput);
      break;
    }
    case "validation": {
      const scored = scoreValidationCase(evalCase as ValidationEvalCase);
      checks = scored.checks;
      rawOutputDigest = sha256(scored.serializedOutput);
      break;
    }
  }

  return {
    caseId: evalCase.id,
    datasetVersion,
    runId,
    configKey: OFFLINE_CONFIG_KEY,
    repetition: 0,
    attempt: 0,
    status,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    estUsd: null,
    checks,
    humanLabels: null,
    graderJudgments: null,
    rawOutputDigest,
    ...(fixtureId !== undefined ? { fixtureId } : {}),
  };
}

// ============================================================================
// Aggregation + scorecard
// ============================================================================

export function heldoutCoverage(dataset: AnalysisEvalDataset): HeldoutCoverage {
  const cov: HeldoutCoverage = { typical: 0, edge: 0, adversarial: 0 };
  for (const c of dataset.cases) if (c.split === "heldout") cov[c.partition]++;
  return cov;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

function num(checks: object, key: string): number {
  const v = (checks as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
}
function list(checks: object, key: string): unknown[] {
  const v = (checks as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : [];
}
function field(checks: object, key: string): unknown {
  return (checks as Record<string, unknown>)[key];
}

function qualityOf(
  workload: AnalysisEvalWorkload,
  results: EvalCaseResult[],
): Record<string, number> {
  const scored = results.filter((r) => r.status === "scored");
  const passRate = results.length > 0 ? scored.filter((r) => r.checks.pass).length / results.length : NaN;
  switch (workload) {
    case "map":
      return {
        recallMean: mean(scored.map((r) => num(r.checks, "recall"))),
        precisionMean: mean(scored.map((r) => num(r.checks, "precision"))),
        checksPassRate: passRate,
      };
    case "reduce":
    case "digest":
      return { checksPassRate: passRate };
    case "validation": {
      const withMs = scored.filter((r) => field(r.checks, "matchSet") !== null && field(r.checks, "matchSet") !== undefined);
      const msField = (r: EvalCaseResult, f: string): number => {
        const ms = field(r.checks, "matchSet") as Record<string, number | null> | null;
        const v = ms?.[f];
        return typeof v === "number" ? v : 1; // null precision/recall = nothing predicted/labelled; vacuous
      };
      const kwField = (r: EvalCaseResult, f: string): number => {
        const kw = field(r.checks, "keyword") as Record<string, number | null> | undefined;
        const v = kw?.[f];
        return typeof v === "number" ? v : 1;
      };
      return {
        matchSetPrecision: mean(withMs.map((r) => msField(r, "precision"))),
        matchSetRecall: mean(withMs.map((r) => msField(r, "recall"))),
        keywordPrecision: mean(scored.map((r) => kwField(r, "precision"))),
        keywordRecall: mean(scored.map((r) => kwField(r, "recall"))),
        checksPassRate: passRate,
      };
    }
  }
}

export function aggregateResults(
  dataset: AnalysisEvalDataset,
  rf: EvalResultsFile,
  live: boolean,
): WorkloadAggregate {
  const caseById = new Map(dataset.cases.map((c) => [c.id, c]));
  const results = Object.values(rf.results);
  const scored = results.filter((r) => r.status === "scored");

  let wrongDocIdsTotal = 0;
  let heldoutUnderfillCases = 0;
  let strengthenedHedgesTotal = 0;
  let guardCasesFailed = 0;
  let fidelityFailures = 0;
  let injectionFollowedCases = 0;
  let reproducibilityFailures = 0;
  let machineryMatched = 0;
  let machineryTotal = 0;

  for (const r of results) {
    const c = caseById.get(r.caseId);
    wrongDocIdsTotal += num(r.checks, "wrongDocIds");
    strengthenedHedgesTotal += num(r.checks, "strengthenedHedges");
    fidelityFailures += list(r.checks, "mustMatchMisses").length + list(r.checks, "mustNotMatchHits").length;
    if (list(r.checks, "injectionHits").length > 0) injectionFollowedCases++;
    if (field(r.checks, "reproducible") === false) reproducibilityFailures++;
    if (c?.split === "heldout" && num(r.checks, "omittedDocs") > 0) heldoutUnderfillCases++;
    if (c?.workload === "digest") {
      const ref = (c as DigestEvalCase).reference;
      const isGuardCase =
        ref.expectGuardStats !== undefined ||
        ref.expectHedging !== undefined ||
        (ref.mustNotMatch !== undefined && ref.mustNotMatch.length > 0);
      // conservative (fail-closed): ANY failure on a guard-expectation case
      // counts against the publication-safety gate
      if (isGuardCase && !r.checks.pass) guardCasesFailed++;
    }
    if (c !== undefined && "offline" in c && !live) {
      machineryTotal++;
      const expectPass = c.offline.expectation === "pass";
      if (r.checks.pass === expectPass) machineryMatched++;
    }
  }

  // per-repetition quality spread (variance stat for multi-repetition runs)
  const reps = [...new Set(results.map((r) => r.repetition))].sort((a, b) => a - b);
  const repetitionSpread: Record<string, number> = {};
  if (reps.length > 1) {
    const perRep = reps.map((rep) =>
      qualityOf(dataset.workload, results.filter((r) => r.repetition === rep)),
    );
    for (const key of Object.keys(perRep[0] ?? {})) {
      const vals = perRep.map((q) => q[key]).filter((v) => !Number.isNaN(v));
      if (vals.length > 0) repetitionSpread[key] = Math.max(...vals) - Math.min(...vals);
    }
  }

  const latencies = results.map((r) => r.latencyMs).filter((v): v is number => v !== null);
  return {
    workload: dataset.workload,
    configKey: rf.configKey,
    cases: {
      total: results.length,
      scored: scored.length,
      schemaInvalid: results.filter((r) => r.status === "schema_invalid").length,
      providerError: results.filter((r) => r.status === "provider_error").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    },
    checks: { passed: results.filter((r) => r.checks.pass).length, total: results.length },
    machinery: { matched: machineryMatched, total: machineryTotal },
    gate: {
      wrongDocIdsTotal,
      heldoutUnderfillCases,
      strengthenedHedgesTotal,
      guardCasesFailed,
      fidelityFailures,
      injectionFollowedCases,
      reproducibilityFailures,
    },
    quality: qualityOf(dataset.workload, results),
    resources: {
      latencyMsMean: latencies.length > 0 ? mean(latencies) : null,
      promptTokensTotal: results.reduce((s, r) => s + (r.promptTokens ?? 0), 0),
      completionTokensTotal: results.reduce((s, r) => s + (r.completionTokens ?? 0), 0),
      estUsdTotal: results.reduce((s, r) => s + (r.estUsd ?? 0), 0),
    },
    meter: rf.meter,
    live,
    repetitions: reps.length,
    repetitionSpread,
  };
}

// ============================================================================
// Scorecard (markdown + JSON)
// ============================================================================

export interface WorkloadScorecard {
  workload: AnalysisEvalWorkload;
  datasetVersion: string;
  judged: WorkloadAggregate;
  judgedIdentity: CandidateDispatchIdentity;
  baseline: WorkloadAggregate | null;
  heldout: HeldoutCoverage;
  verdictResult: ScorecardVerdictResult;
  /** rendered ONLY for a passing live evaluation_candidate — a PROPOSED
   *  analysis-registry entry as text. This program never edits
   *  analysis-registry.ts; activation additionally requires the paid-eval
   *  authorization checklist + an operator decision-log entry. */
  proposedRegistryEntry: string | null;
}

export function buildWorkloadScorecard(
  dataset: AnalysisEvalDataset,
  judgedFile: EvalResultsFile,
  baselineFile: EvalResultsFile | null,
  liveJudged: boolean,
): WorkloadScorecard {
  const judged = aggregateResults(dataset, judgedFile, liveJudged);
  const baseline = baselineFile ? aggregateResults(dataset, baselineFile, false) : null;
  const heldout = heldoutCoverage(dataset);
  const verdictResult = computeScorecardVerdict(judged, baseline, heldout);
  const proposedRegistryEntry =
    verdictResult.verdict === "pass" &&
    liveJudged &&
    judgedFile.identity.approval === "evaluation_candidate"
      ? [
          `PROPOSED analysis-registry entry (NOT applied — operator checklist + decision-log entry required):`,
          `  workload: ${dataset.workload}`,
          `  model: ${judgedFile.identity.model}`,
          `  allowedEfforts: [${judgedFile.identity.reasoningEffort ?? "null"}]`,
          `  status: evaluated_candidate`,
          `  evidence: this scorecard (dataset ${dataset.datasetVersion}, promptHash ${judgedFile.identity.promptHash.slice(0, 12)})`,
        ].join("\n")
      : null;
  return {
    workload: dataset.workload,
    datasetVersion: dataset.datasetVersion,
    judged,
    judgedIdentity: judgedFile.identity,
    baseline,
    heldout,
    verdictResult,
    proposedRegistryEntry,
  };
}

function pct(x: number): string {
  return Number.isNaN(x) ? "—" : `${(100 * x).toFixed(1)}%`;
}

export function renderAnalysisScorecardMarkdown(input: {
  generatedAt: string;
  scorecards: WorkloadScorecard[];
  detail: Array<{ workload: string; configKey: string; results: EvalCaseResult[] }>;
  headerNote?: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Analysis eval scorecard — ${input.generatedAt}`);
  lines.push("");
  if (input.headerNote) {
    lines.push(`> ${input.headerNote}`);
    lines.push("");
  }
  for (const sc of input.scorecards) {
    const a = sc.judged;
    lines.push(`## ${sc.workload} — config \`${a.configKey}\` (dataset ${sc.datasetVersion})`);
    lines.push("");
    lines.push(
      `Identity: provider=${sc.judgedIdentity.provider} model=${sc.judgedIdentity.model} ` +
        `effort=${sc.judgedIdentity.reasoningEffort ?? "absent"} approval=${sc.judgedIdentity.approval} ` +
        `registry=${sc.judgedIdentity.registryVersion} promptHash=${sc.judgedIdentity.promptHash.slice(0, 12)} ` +
        `schema=${sc.judgedIdentity.schemaVersion.slice(0, 12)}` +
        (sc.judgedIdentity.extractorVersion ? ` extractor=${sc.judgedIdentity.extractorVersion}` : ""),
    );
    lines.push("");
    lines.push("| metric | value |");
    lines.push("|---|---|");
    lines.push(`| cases (scored / schema-invalid / provider-error / skipped) | ${a.cases.scored} / ${a.cases.schemaInvalid} / ${a.cases.providerError} / ${a.cases.skipped} of ${a.cases.total} |`);
    lines.push(`| checks passed | ${a.checks.passed}/${a.checks.total} |`);
    if (a.machinery.total > 0) {
      lines.push(`| machinery proof (result matches fixture expectation) | ${a.machinery.matched}/${a.machinery.total} |`);
    }
    for (const [k, v] of Object.entries(a.quality)) {
      lines.push(`| quality: ${k} | ${pct(v)} |`);
    }
    lines.push(`| gate: wrongDocIds / heldout under-fill / strengthened hedges | ${a.gate.wrongDocIdsTotal} / ${a.gate.heldoutUnderfillCases} / ${a.gate.strengthenedHedgesTotal} |`);
    lines.push(`| gate: guard fails / fidelity fails / injection follows / repro fails | ${a.gate.guardCasesFailed} / ${a.gate.fidelityFailures} / ${a.gate.injectionFollowedCases} / ${a.gate.reproducibilityFailures} |`);
    lines.push(`| resources: latency mean / prompt tok / completion tok / est USD | ${a.resources.latencyMsMean === null ? "—" : Math.round(a.resources.latencyMsMean) + "ms"} / ${a.resources.promptTokensTotal} / ${a.resources.completionTokensTotal} / $${a.resources.estUsdTotal.toFixed(4)} |`);
    lines.push(`| metering (attempts / reservations / meterings / errored) | ${a.meter.attempts} / ${a.meter.reservations} / ${a.meter.meterings} / ${a.meter.erroredAttempts} |`);
    lines.push(`| heldout coverage (typical/edge/adversarial) | ${sc.heldout.typical}/${sc.heldout.edge}/${sc.heldout.adversarial} |`);
    if (a.repetitions > 1) {
      lines.push(`| repetitions / quality spread | ${a.repetitions} / ${JSON.stringify(a.repetitionSpread)} |`);
    }
    lines.push("");
    if (sc.baseline) {
      lines.push(
        `Baseline \`${sc.baseline.configKey}\`: ` +
          Object.entries(sc.baseline.quality)
            .map(([k, v]) => `${k}=${pct(v)}`)
            .join(", ") +
          (sc.verdictResult.deltas
            ? ` · deltas: ${Object.entries(sc.verdictResult.deltas)
                .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}pts`)
                .join(", ")}`
            : ""),
      );
      lines.push("");
    }
    lines.push(`VERDICT: **${sc.verdictResult.verdict.toUpperCase()}**`);
    for (const r of sc.verdictResult.reasons) lines.push(`- ${r}`);
    lines.push("");
    if (sc.proposedRegistryEntry) {
      lines.push("```");
      lines.push(sc.proposedRegistryEntry);
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("## Per-case detail");
  lines.push("");
  lines.push("| workload | config | case | rep | status | pass | failures |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const d of input.detail) {
    for (const r of [...d.results].sort((x, y) => (x.caseId < y.caseId ? -1 : 1))) {
      const failures = r.checks.failures.join("; ").replace(/\|/g, "\\|").slice(0, 220);
      lines.push(
        `| ${d.workload} | ${d.configKey} | ${r.caseId} | ${r.repetition} | ${r.status} | ${r.checks.pass ? "yes" : "no"} | ${failures || "—"} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
