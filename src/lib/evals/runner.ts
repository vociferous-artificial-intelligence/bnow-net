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

// Capacity-profile API re-exported so the eval CLI's audited static-import
// surface stays exactly contracts+runner (isolation.test.ts pin). The module
// is pure (imports nothing), so the CLI's eager closure character is unchanged.
export { MIN_LIVE_REPETITIONS } from "./gates";
export {
  BASELINE_PROFILE,
  CAPACITY_PROFILES,
  UNIMPLEMENTED_MATRIX_CELLS,
  applyCapacityProfile,
  capacityProfileNames,
  withCapacityProfileKey,
} from "./capacity-profiles";
import {
  mapContentChars,
  mapDocLine,
  mapExtractorVersion,
  mapResponseSchema,
  mapSystemPrompt,
  mapUserMessage,
} from "../analysis/map-prompts";
import { mapOutTokensPerDoc } from "../analysis/map-worker";
import { clusterClaims, rankGroups, type ReduceClaim } from "../analysis/reduce";
import {
  reduceGroupsFed,
  reduceVotes,
  synthesisResponseSchema,
  synthesisUserMessage,
  synthesisSystemPrompt,
} from "../analysis/synthesize";
import type { Track } from "../analysis/tracks";
import { ANALYSIS_ROUTING_REGISTRY_VERSION } from "../llm/analysis-registry";
import { estimateCostUsd } from "../llm/pricing";
import { reduceMaxOutputTokens } from "../usage/llm-guard";
import {
  MATCH_RESPONSE_SCHEMA,
  MATCH_SYSTEM_PROMPT,
  MATCH_VOTES_DEFAULT,
  buildMatchUserPrompt,
} from "../validation/llm-match";
import type { ClaimForValidation } from "../validation/score";
import {
  POSITION_BUCKETS,
  resultKey,
  type AbandonedAttemptRecord,
  type AnalysisEvalCase,
  type AnalysisEvalDataset,
  type AnalysisEvalWorkload,
  type CandidateDispatchIdentity,
  type CaptureRunRecord,
  type DigestEvalCase,
  type DigestEvalInput,
  type EvalCaseResult,
  type EvalEnvKnobs,
  type EvalResultsFile,
  type EvalRunScope,
  type MapEvalCase,
  type MapEvalInput,
  type PositionBucket,
  type ReduceEvalCase,
  type ValidationEvalCase,
  type ValidationEvalInput,
} from "./contracts";
import { classifyCaseApplicability } from "./applicability";
// re-exported so the CLI's static eval-import surface stays contracts+runner
// (isolation.test.ts pins that surface)
export { classifyCaseApplicability, type CaseApplicability } from "./applicability";
// Capture API re-exported for the CLI (same static-surface reason). capture.ts
// is I/O-free (every fs primitive is injected), so this keeps runner pure.
export {
  CaptureConfigError,
  CaptureHeldoutRefusal,
  CaptureWriteError,
  captureFileName,
  openCaptureForCalibration,
  openCaptureSink,
  parseCaptureFile,
  reconcileCapture,
  renderCaptureReconciliation,
  resolveCaptureConfig,
  sanitizeMessage,
  type CaptureConfig,
  type CaptureFs,
  type CaptureReconciliation,
  type CaptureResolution,
  type CaptureSink,
  type ParsedCaptureFile,
} from "./capture";
import {
  computeScorecardVerdict,
  type AlignedComparison,
  type CompletenessInfo,
  type HeldoutCoverage,
  type ScorecardVerdictResult,
  type SliceStats,
  type WorkloadAggregate,
} from "./gates";
import { scoreMapCase } from "./score-map";
import { scoreDigestCase, scoreReduceCase } from "./score-reduce";
import { scoreValidationCase } from "./score-validation";

export const OFFLINE_CONFIG_KEY = "offline-fixtures";

export function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The production validation matcher's vote count — the ONLY
 *  production-equivalent value for a live validation eval. */
export const VALIDATION_VOTES_PRODUCTION = MATCH_VOTES_DEFAULT;
/** The explicitly labelled single-round diagnostic (NOT production-equivalent). */
export const VALIDATION_VOTES_DIAGNOSTIC = 1;

/** Vote rounds a live validation case dispatches. Read from
 *  EVAL_VALIDATION_VOTES, which the eval CLI ALWAYS sets explicitly from its
 *  --validation-votes flag (default 5) before any knob work, so a stray shell
 *  export can never silently change the default. Only 5 (production) and 1
 *  (diagnostic) exist; anything else throws. */
export function evalValidationVotes(env: NodeJS.ProcessEnv = process.env): number {
  const v = env.EVAL_VALIDATION_VOTES;
  if (v === undefined || v === "") return VALIDATION_VOTES_PRODUCTION;
  if (v === String(VALIDATION_VOTES_PRODUCTION)) return VALIDATION_VOTES_PRODUCTION;
  if (v === String(VALIDATION_VOTES_DIAGNOSTIC)) return VALIDATION_VOTES_DIAGNOSTIC;
  throw new Error(
    `EVAL_VALIDATION_VOTES must be ${VALIDATION_VOTES_PRODUCTION} (production-equivalent majority) or ${VALIDATION_VOTES_DIAGNOSTIC} (single-round diagnostic); got ${JSON.stringify(v)}`,
  );
}

/** The configKey suffix every LIVE validation results file carries, so a
 *  5-vote file and a single-round diagnostic file can never share a path —
 *  and neither can ever open (let alone overwrite) a pre-2026-09-04
 *  single-round file, whose bare key stays its historical identity. */
export function validationVotesKeySuffix(votes: number): string {
  return `+votes${votes}`;
}

/** Env-tunable pipeline knobs, captured into every results-file header (m10):
 *  results are only interpretable against the knob values they ran under, and
 *  a resume under different knobs is refused (MAJOR-3). */
export function currentEnvKnobs(): EvalEnvKnobs {
  return {
    reduceVotes: reduceVotes(),
    reduceMaxOutputTokens: reduceMaxOutputTokens(),
    mapOutTokensPerDoc: mapOutTokensPerDoc(),
    mapContentChars: mapContentChars(),
    reduceGroupsFed: reduceGroupsFed(),
    validationVotes: evalValidationVotes(),
  };
}

/** The knob set that IDENTIFIES a file of a given workload, with historical
 *  defaults applied: pre-2026-08-27 files lack reduceGroupsFed (=200);
 *  pre-2026-09-04 LIVE validation files lack validationVotes and were
 *  single-round (=1). validationVotes is meaningful ONLY for LIVE validation
 *  files (offline fixture scoring dispatches nothing — its committed results
 *  must resume without churn), so it is dropped for every other workload and
 *  for every offline file (review MAJOR-2). */
export function comparableKnobs(knobs: EvalEnvKnobs, workload: AnalysisEvalWorkload, live: boolean): EvalEnvKnobs {
  const votesApply = live && workload === "validation";
  const legacyDefaults: Partial<EvalEnvKnobs> = {
    reduceGroupsFed: 200,
    ...(votesApply ? { validationVotes: VALIDATION_VOTES_DIAGNOSTIC } : {}),
  };
  const withDefaults: EvalEnvKnobs = { ...legacyDefaults, ...knobs } as EvalEnvKnobs;
  if (!votesApply) delete withDefaults.validationVotes;
  return withDefaults;
}

/** A results-file header is LIVE when its identity provider is a real
 *  provider; offline fixture files record provider "stub". */
export function headerIsLive(h: { identity: CandidateDispatchIdentity }): boolean {
  return h.identity.provider !== "stub";
}

/** Knobs for an OFFLINE results header: the vote knob never applies (nothing
 *  is dispatched), so it is not stamped — the committed offline files keep
 *  their historical shape byte-for-byte on a no-op resume. */
export function offlineEnvKnobs(): EvalEnvKnobs {
  const k = currentEnvKnobs();
  delete k.validationVotes;
  return k;
}

/** Coverage breadth of a run: --only → subset, --dev → dev, else full. */
export function runScopeFor(onlyIds: string[] | null, devOnly: boolean): EvalRunScope {
  if (onlyIds !== null) return "subset";
  return devOnly ? "dev" : "full";
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
  // SCI-N6 closed: apply production's fed cutoff (synthesize.ts feeds
  // ranked.slice(0, reduceGroupsFed())) so capacity cases past the cutoff
  // measure the REAL pipeline. Identity-neutral for every v1 dataset (all
  // fixture group counts sit under the cutoff, pinned by test), so committed
  // results' promptHash is unchanged.
  const fed = rankGroups(groups, nowMs).slice(0, reduceGroupsFed());
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
export const EST_MAP_OUT_TOKENS_PER_DOC = 200; // baseline floor; live value below
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
  const knobs = currentEnvKnobs();
  for (const c of dataset.cases) {
    let calls = 0;
    let inTok = 0;
    let outTok = 0;
    if (dataset.workload === "reduce") {
      rows.push({ caseId: c.id, calls: 0, estPromptTokens: 0, estCompletionTokens: 0, estUsd: 0 });
      continue;
    }
    // corpus-v2: a case the applied knobs classify inapplicable is never
    // dispatched — the matrix estimate must not over-count undispatchable cells
    if (!classifyCaseApplicability(c, knobs).applicable) {
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
        outTok = docs * Math.max(EST_MAP_OUT_TOKENS_PER_DOC, mapOutTokensPerDoc());
        break;
      }
      case "digest": {
        calls = reduceVotes(); // ruling 18: K=5 votes is the shipped configuration
        inTok = promptTok * calls;
        outTok = Math.max(EST_DIGEST_OUT_TOKENS_PER_VOTE, reduceMaxOutputTokens()) * calls;
        break;
      }
      case "validation": {
        // 2026-09-04 parity: a live validation case dispatches K vote rounds
        // (5 = production majority; 1 only in the labelled diagnostic mode)
        calls = knobs.validationVotes ?? VALIDATION_VOTES_PRODUCTION;
        inTok = promptTok * calls;
        outTok =
          ((c as ValidationEvalCase).input.takeaways.length * EST_VALIDATION_OUT_TOKENS_PER_TAKEAWAY +
            EST_VALIDATION_OUT_TOKENS_BASE) *
          calls;
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

/** The header fields a results file is keyed on. Immutable across resumes
 *  (MAJOR-3): any drift means the file would silently mix results from two
 *  different configurations/datasets. */
export interface ResultsFileHeader {
  workload: AnalysisEvalWorkload;
  configKey: string;
  datasetVersion: string;
  datasetContentHash: string;
  identity: CandidateDispatchIdentity;
  requestedRepetitions: number;
  scope: EvalRunScope;
  envKnobs: EvalEnvKnobs;
  /** C-A7-2 discard provenance — see EvalResultsFile.discardedRuns. */
  discardedRuns?: EvalResultsFile["discardedRuns"];
}

export function emptyEvalResultsFile(header: ResultsFileHeader): EvalResultsFile {
  return {
    ...header,
    updatedAt: new Date(0).toISOString(),
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    results: {},
  };
}

/** MAJOR-3: fields whose drift makes a resume a DIFFERENT run. Returns a
 *  human-readable mismatch description, or null when compatible. `scope` is
 *  deliberately NOT compared here — see mergedScope. */
export function resumeIdentityMismatch(
  existing: ResultsFileHeader,
  current: ResultsFileHeader,
): string | null {
  const diffs: string[] = [];
  const cmp = (name: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${name}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  };
  cmp("workload", existing.workload, current.workload);
  cmp("configKey", existing.configKey, current.configKey);
  cmp("datasetVersion", existing.datasetVersion, current.datasetVersion);
  cmp("datasetContentHash", existing.datasetContentHash, current.datasetContentHash);
  cmp("requestedRepetitions", existing.requestedRepetitions, current.requestedRepetitions);
  cmp("model", existing.identity.model, current.identity.model);
  cmp("reasoningEffort", existing.identity.reasoningEffort, current.identity.reasoningEffort);
  cmp("provider", existing.identity.provider, current.identity.provider);
  cmp("approval", existing.identity.approval, current.identity.approval);
  cmp("registryVersion", existing.identity.registryVersion, current.identity.registryVersion);
  cmp("promptHash", existing.identity.promptHash, current.identity.promptHash);
  cmp("schemaVersion", existing.identity.schemaVersion, current.identity.schemaVersion);
  cmp("extractorVersion", existing.identity.extractorVersion ?? null, current.identity.extractorVersion ?? null);
  // historical defaults on BOTH sides (comparableKnobs): pre-2026-08-27 files
  // lack reduceGroupsFed (=200); pre-2026-09-04 validation files lack
  // validationVotes and were single-round (=1) — so a 5-vote run can NEVER
  // resume into a single-round file, and the knob is ignored off-workload
  cmp(
    "envKnobs",
    comparableKnobs(existing.envKnobs, existing.workload, headerIsLive(existing)),
    comparableKnobs(current.envKnobs, current.workload, headerIsLive(current)),
  );
  return diffs.length === 0 ? null : diffs.join("; ");
}

/** Scope of the merged file: --only preserves the existing coverage claim; a
 *  full run completes the file to full; a dev resume never upgrades. */
export function mergedScope(existing: EvalRunScope | null, runScope: EvalRunScope): EvalRunScope {
  if (existing === null) return runScope;
  if (runScope === "subset") return existing;
  if (runScope === "full") return "full";
  return existing === "full" ? "full" : "dev";
}

export interface MeterDelta {
  attempts: number;
  reservations: number;
  meterings: number;
  erroredAttempts: number;
}

export const ZERO_METER: MeterDelta = { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 };

/** 2026-09-04 accounting extras a merge may carry: interrupted-attempt
 *  records (appended) and the capture-run record (upserted by runId). */
export interface MergeExtras {
  abandoned?: AbandonedAttemptRecord[];
  captureRun?: CaptureRunRecord;
}

/** Merge results into an existing file. THROWS on any identity drift
 *  (MAJOR-3) — the existing header is preserved verbatim (never restamped
 *  with the current run's values); only scope may evolve per mergedScope.
 *  Historical compatibility: the optional `abandonedAttempts` / `captureRuns`
 *  arrays are carried through untouched when present and NEVER materialized
 *  on a file that lacks them unless this merge actually adds an entry — an
 *  old file re-saved by a new runner keeps its exact shape. */
export function mergeEvalResults(
  existing: EvalResultsFile | null,
  header: ResultsFileHeader,
  additions: EvalCaseResult[],
  meterDelta: MeterDelta,
  now: Date = new Date(),
  extras: MergeExtras = {},
): EvalResultsFile {
  if (existing !== null) {
    const mismatch = resumeIdentityMismatch(existing, header);
    if (mismatch !== null) {
      throw new Error(
        `analysis-eval: results-file identity changed — use --fresh or a new configKey (${mismatch})`,
      );
    }
  }
  const results = { ...(existing?.results ?? {}) };
  for (const a of additions) results[resultKey(a.caseId, a.repetition)] = a;
  const prior = existing?.meter ?? ZERO_METER;
  const base: ResultsFileHeader = existing ?? header;
  const merged: EvalResultsFile = {
    ...base,
    scope: mergedScope(existing?.scope ?? null, header.scope),
    updatedAt: now.toISOString(),
    meter: {
      attempts: prior.attempts + meterDelta.attempts,
      reservations: prior.reservations + meterDelta.reservations,
      meterings: prior.meterings + meterDelta.meterings,
      erroredAttempts: prior.erroredAttempts + meterDelta.erroredAttempts,
    },
    results,
  };
  if (extras.abandoned && extras.abandoned.length > 0) {
    merged.abandonedAttempts = [...(existing?.abandonedAttempts ?? []), ...extras.abandoned];
  }
  if (extras.captureRun) {
    const others = (existing?.captureRuns ?? []).filter((c) => c.runId !== extras.captureRun!.runId);
    merged.captureRuns = [...others, extras.captureRun];
  }
  return merged;
}

export interface PendingWorkItem {
  evalCase: AnalysisEvalCase;
  repetition: number;
}

/** Re-review minor 2a: a stochastic LIVE candidate's failing heldout case
 *  must not be quietly re-rolled to a pass via `--only <heldout-id>` — the
 *  live runner refuses a --only selection touching heldout cases unless the
 *  operator passes the explicit --allow-heldout-rerun flag (and even then the
 *  rerun is visible in the scorecard's run-provenance line, minor 2b). */
export function assertLiveOnlySelection(
  dataset: AnalysisEvalDataset,
  onlyIds: string[] | null,
  allowHeldoutRerun: boolean,
): void {
  if (onlyIds === null || allowHeldoutRerun) return;
  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const heldout = onlyIds.filter((id) => byId.get(id)?.split === "heldout");
  if (heldout.length > 0) {
    throw new Error(
      `analysis-eval: --only touches HELDOUT case(s) ${heldout.join(", ")} — a targeted heldout rerun can re-roll a stochastic failure until it passes. Pass --allow-heldout-rerun to proceed (the rerun stays visible in the scorecard's run-provenance line).`,
    );
  }
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
  configKey: string = OFFLINE_CONFIG_KEY,
): EvalCaseResult {
  // corpus-v2: applicability is classified BEFORE any scoring. An offline
  // fixture was authored assuming the case's declared capacity; scoring it
  // under insufficient knobs would report a pass the real configuration
  // cannot produce — fail closed: classify, don't score.
  const applicability = classifyCaseApplicability(evalCase, currentEnvKnobs());
  if (!applicability.applicable && applicability.requirement !== null) {
    const req = applicability.requirement;
    return inapplicableResult(evalCase, datasetVersion, runId, configKey, 0, {
      required: { [req.kind]: req.required },
      actual: { [req.knob]: req.actual },
      reason: applicability.reason ?? "structurally inapplicable",
    });
  }

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
    configKey,
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

/** The durable row for a structurally inapplicable (caseId, repetition) key —
 *  used by the offline scorer above and the CLI's live loop. `checks.pass` is
 *  false on its face (never a flattering default), but every consumer
 *  discriminates on `status`, never on `pass`. */
export function inapplicableResult(
  evalCase: AnalysisEvalCase,
  datasetVersion: string,
  runId: string,
  configKey: string,
  repetition: number,
  applicability: NonNullable<EvalCaseResult["applicability"]>,
): EvalCaseResult {
  return {
    caseId: evalCase.id,
    datasetVersion,
    runId,
    configKey,
    repetition,
    attempt: 0,
    status: "inapplicable",
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    estUsd: null,
    checks: { pass: false, failures: [`structurally inapplicable: ${applicability.reason}`] },
    humanLabels: null,
    graderJudgments: null,
    rawOutputDigest: sha256(`inapplicable:${applicability.reason}`),
    ...("offline" in evalCase && "fixtureId" in evalCase.offline
      ? { fixtureId: (evalCase.offline as { fixtureId: string }).fixtureId }
      : {}),
    applicability,
  };
}

// ============================================================================
// Completeness (MAJOR-1) + aggregation
// ============================================================================

/** Statuses that count as a PRESENT result: a failing result is still a
 *  result, and an inapplicable row is FINISHED work (the applied knobs can
 *  never satisfy it — leaving it "missing" would rot every such file at
 *  insufficient_data forever); a skipped row is missing work. */
const PRESENT_STATUSES = new Set(["scored", "schema_invalid", "provider_error", "inapplicable"]);

export function heldoutCoverage(dataset: AnalysisEvalDataset): HeldoutCoverage {
  const cov: HeldoutCoverage = { typical: 0, edge: 0, adversarial: 0 };
  for (const c of dataset.cases) if (c.split === "heldout") cov[c.partition]++;
  return cov;
}

/** RESULTS-side completeness of a file against its dataset: every
 *  (caseId, repetition < requestedRepetitions) key must be present. */
export function computeCompleteness(
  dataset: AnalysisEvalDataset,
  rf: EvalResultsFile,
): CompletenessInfo {
  const reps = rf.requestedRepetitions;
  const present = new Set(
    Object.values(rf.results)
      .filter((r) => PRESENT_STATUSES.has(r.status))
      .map((r) => resultKey(r.caseId, r.repetition)),
  );
  // corpus-v2: inapplicable rows are present/finished work, but a heldout
  // case whose every row is inapplicable contributed no verdict EVIDENCE —
  // it must not inflate the heldout coverage minima the gates read.
  const evidential = new Set(
    Object.values(rf.results)
      .filter((r) => PRESENT_STATUSES.has(r.status) && r.status !== "inapplicable")
      .map((r) => resultKey(r.caseId, r.repetition)),
  );
  let missing = 0;
  let missingHeldout = 0;
  const heldoutPresent: HeldoutCoverage = { typical: 0, edge: 0, adversarial: 0 };
  for (const c of dataset.cases) {
    let caseComplete = true;
    let caseEvidential = false;
    for (let rep = 0; rep < reps; rep++) {
      if (!present.has(resultKey(c.id, rep))) {
        missing++;
        caseComplete = false;
        if (c.split === "heldout") missingHeldout++;
      }
      if (evidential.has(resultKey(c.id, rep))) caseEvidential = true;
    }
    if (c.split === "heldout" && caseComplete && caseEvidential) heldoutPresent[c.partition]++;
  }
  const expected = dataset.cases.length * reps;
  return {
    scope: rf.scope,
    requestedRepetitions: reps,
    expectedResults: expected,
    presentResults: expected - missing,
    missingResults: missing,
    missingHeldout,
    datasetContentHash: rf.datasetContentHash,
    heldoutPresent,
    complete: rf.scope === "full" && missing === 0,
  };
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

/** Workload quality means over a result subset.
 *
 *  Vacuous-population rule (m7): a per-case precision/recall of null means
 *  the case's population was EMPTY (nothing predicted / nothing labelled) —
 *  such cases are EXCLUDED from the means and counted separately in
 *  `*VacuousCount` keys (reported, never silently folded into a flattering
 *  1.0). A metric whose every case is vacuous is NaN, which the pairwise
 *  gate reports as unavailable (insufficient_data), not a pass. */
export function qualityOf(
  workload: AnalysisEvalWorkload,
  results: EvalCaseResult[],
): Record<string, number> {
  const scored = results.filter((r) => r.status === "scored");
  // corpus-v2: inapplicable rows are structural classifications, not quality
  // data points — they leave every denominator (a run under a small knob must
  // not read as a quality regression against facts it could not see)
  const considered = results.filter((r) => r.status !== "inapplicable");
  const passRate = considered.length > 0 ? scored.filter((r) => r.checks.pass).length / considered.length : NaN;
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
      const pathVals = (pathKey: "matchSet" | "keyword", f: "precision" | "recall") => {
        const vals: number[] = [];
        let vacuous = 0;
        for (const r of scored) {
          const path = field(r.checks, pathKey) as Record<string, number | null> | null | undefined;
          if (path === null || path === undefined) continue; // no match-set supplied at all
          const v = path[f];
          if (typeof v === "number") vals.push(v);
          else vacuous++;
        }
        return { vals, vacuous };
      };
      const msP = pathVals("matchSet", "precision");
      const msR = pathVals("matchSet", "recall");
      const kwP = pathVals("keyword", "precision");
      const kwR = pathVals("keyword", "recall");
      return {
        matchSetPrecision: mean(msP.vals),
        matchSetRecall: mean(msR.vals),
        matchSetPrecisionVacuousCount: msP.vacuous,
        matchSetRecallVacuousCount: msR.vacuous,
        keywordPrecision: mean(kwP.vals),
        keywordRecall: mean(kwR.vals),
        keywordPrecisionVacuousCount: kwP.vacuous,
        keywordRecallVacuousCount: kwR.vacuous,
        checksPassRate: passRate,
      };
    }
  }
}

function sliceStats(workload: AnalysisEvalWorkload, results: EvalCaseResult[]): SliceStats {
  // inapplicable rows leave the slice fractions too (review finding: the
  // "X/Y passed" render must agree with checksPassRate's denominator — a
  // structural exclusion must never read as a failure)
  const considered = results.filter((r) => r.status !== "inapplicable");
  return {
    results: considered.length,
    checksPassed: considered.filter((r) => r.checks.pass).length,
    quality: qualityOf(workload, results),
  };
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
    // corpus-v2: an inapplicable row is neither a gate signal, a guard
    // failure, nor a machinery data point — its checks carry only the
    // structural classification
    if (r.status === "inapplicable") continue;
    const c = caseById.get(r.caseId);
    wrongDocIdsTotal += num(r.checks, "wrongDocIds");
    strengthenedHedgesTotal += num(r.checks, "strengthenedHedges");
    fidelityFailures += list(r.checks, "mustMatchMisses").length + list(r.checks, "mustNotMatchHits").length;
    fidelityFailures += Number((r.checks as unknown as Record<string, unknown>).numeralMisses ?? 0); // SCI-3b
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

  // corpus-v2 capacity diagnostics: summed over SCORED rows only (an
  // inapplicable row contributed no measurement); null when no row carried
  // any capacity figure
  const capDiag = {
    positionRecall: Object.fromEntries(
      POSITION_BUCKETS.map((b) => [b, { matched: 0, expected: 0 }]),
    ) as Record<PositionBucket, { matched: number; expected: number }>,
    straddleRecall: { matched: 0, expected: 0 },
    uniqueTailLoss: { lost: 0, uniqueTail: 0 },
    tailEventRecall: { survived: 0, fed: 0, unfed: 0 },
    lateDocumentRecall: { cited: 0, total: 0, unfed: 0 },
    resultsWithMeta: 0,
    inapplicableResults: results.filter((r) => r.status === "inapplicable").length,
  };
  for (const r of scored) {
    const ch = r.checks as unknown as Record<string, unknown>;
    let contributed = false;
    const pr = ch.positionRecall as Record<PositionBucket, { matched: number; expected: number }> | undefined;
    if (pr !== undefined) {
      contributed = true;
      for (const b of POSITION_BUCKETS) {
        capDiag.positionRecall[b].matched += pr[b]?.matched ?? 0;
        capDiag.positionRecall[b].expected += pr[b]?.expected ?? 0;
      }
    }
    const sr = ch.straddleRecall as { matched: number; expected: number } | undefined;
    if (sr !== undefined) {
      contributed = true;
      capDiag.straddleRecall.matched += sr.matched;
      capDiag.straddleRecall.expected += sr.expected;
    }
    const ut = ch.uniqueTailLoss as { lost: number; uniqueTail: number } | undefined;
    if (ut !== undefined) {
      contributed = true;
      capDiag.uniqueTailLoss.lost += ut.lost;
      capDiag.uniqueTailLoss.uniqueTail += ut.uniqueTail;
    }
    const te = ch.tailEventRecall as { survived: number; fed: number; unfed: number } | undefined;
    if (te !== undefined) {
      contributed = true;
      capDiag.tailEventRecall.survived += te.survived;
      capDiag.tailEventRecall.fed += te.fed;
      capDiag.tailEventRecall.unfed += te.unfed;
    }
    const ld = ch.lateDocumentRecall as { cited: number; total: number; unfed: number } | undefined;
    if (ld !== undefined) {
      contributed = true;
      capDiag.lateDocumentRecall.cited += ld.cited;
      capDiag.lateDocumentRecall.total += ld.total;
      capDiag.lateDocumentRecall.unfed += ld.unfed;
    }
    if (contributed) capDiag.resultsWithMeta++;
  }
  const capacityDiagnostics = capDiag.resultsWithMeta > 0 ? capDiag : null;

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

  // m4: per-split and per-partition slices
  const splitOf = (r: EvalCaseResult) => caseById.get(r.caseId)?.split ?? "development";
  const partitionOf = (r: EvalCaseResult) => caseById.get(r.caseId)?.partition ?? "typical";
  const bySplit = {
    development: sliceStats(dataset.workload, results.filter((r) => splitOf(r) === "development")),
    heldout: sliceStats(dataset.workload, results.filter((r) => splitOf(r) === "heldout")),
  };
  const byPartition = {
    typical: sliceStats(dataset.workload, results.filter((r) => partitionOf(r) === "typical")),
    edge: sliceStats(dataset.workload, results.filter((r) => partitionOf(r) === "edge")),
    adversarial: sliceStats(dataset.workload, results.filter((r) => partitionOf(r) === "adversarial")),
  };

  // run provenance (re-review minor 2b): make any heterogeneous-run file —
  // e.g. a --only re-roll replacing keys from an earlier sweep — visible
  const keysByRunId: Record<string, number> = {};
  for (const r of results) keysByRunId[r.runId] = (keysByRunId[r.runId] ?? 0) + 1;
  const distinctRunIds = Object.keys(keysByRunId).sort();

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
      inapplicable: results.filter((r) => r.status === "inapplicable").length,
    },
    checks: {
      passed: results.filter((r) => r.checks.pass).length,
      // inapplicable rows are not check attempts (their pass:false is a
      // structural classification, not a verdict)
      total: results.filter((r) => r.status !== "inapplicable").length,
    },
    machinery: { matched: machineryMatched, total: machineryTotal },
    completeness: computeCompleteness(dataset, rf),
    bySplit,
    byPartition,
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
    capacityDiagnostics,
    resources: {
      latencyMsMean: latencies.length > 0 ? mean(latencies) : null,
      promptTokensTotal: results.reduce((s, r) => s + (r.promptTokens ?? 0), 0),
      completionTokensTotal: results.reduce((s, r) => s + (r.completionTokens ?? 0), 0),
      estUsdTotal: results.reduce((s, r) => s + (r.estUsd ?? 0), 0),
    },
    meter: rf.meter,
    runs: { distinctRunIds, mixedRun: distinctRunIds.length > 1, keysByRunId },
    live,
    repetitions: reps.length,
    repetitionSpread,
  };
}

/** MAJOR-2: the aligned (caseId, repetition) intersection of two results
 *  files, with the gated quality recomputed on its HELDOUT subset. */
export function alignedComparison(
  dataset: AnalysisEvalDataset,
  judged: EvalResultsFile,
  baseline: EvalResultsFile,
): AlignedComparison {
  const caseById = new Map(dataset.cases.map((c) => [c.id, c]));
  const presentKeys = (rf: EvalResultsFile) =>
    new Set(
      Object.values(rf.results)
        .filter((r) => PRESENT_STATUSES.has(r.status))
        .map((r) => resultKey(r.caseId, r.repetition)),
    );
  const jKeys = presentKeys(judged);
  const bKeys = presentKeys(baseline);
  const aligned = [...jKeys].filter((k) => bKeys.has(k));
  // A8-F1: quality means are computed ONLY over pairs scored on BOTH sides;
  // a degraded row on either side removes the pair VISIBLY (counted below)
  // instead of silently shrinking one side's denominator.
  const scoredKeys = (rf: EvalResultsFile) =>
    new Set(
      Object.values(rf.results)
        .filter((r) => r.status === "scored")
        .map((r) => resultKey(r.caseId, r.repetition)),
    );
  const jScored = scoredKeys(judged);
  const bScored = scoredKeys(baseline);
  const scoredAligned = aligned.filter((k) => jScored.has(k) && bScored.has(k));
  // corpus-v2: name the structural exclusions — an inapplicable pair (either
  // side) is not a DEGRADED pair; mislabeling it would read as data loss
  const inapplicableKeys = (rf: EvalResultsFile) =>
    new Set(
      Object.values(rf.results)
        .filter((r) => r.status === "inapplicable")
        .map((r) => resultKey(r.caseId, r.repetition)),
    );
  const jInap = inapplicableKeys(judged);
  const bInap = inapplicableKeys(baseline);
  const excludedInapplicablePairs = aligned.filter((k) => jInap.has(k) || bInap.has(k)).length;
  const alignedSet = new Set(scoredAligned);
  const heldoutSubset = (rf: EvalResultsFile) =>
    Object.values(rf.results).filter(
      (r) =>
        alignedSet.has(resultKey(r.caseId, r.repetition)) &&
        caseById.get(r.caseId)?.split === "heldout",
    );
  const judgedHeldout = heldoutSubset(judged);
  return {
    alignedKeys: aligned.length,
    scoredAlignedKeys: scoredAligned.length,
    excludedDegradedPairs: aligned.length - scoredAligned.length - excludedInapplicablePairs,
    excludedInapplicablePairs,
    alignedHeldoutKeys: judgedHeldout.length,
    judgedQuality: qualityOf(dataset.workload, judgedHeldout),
    baselineQuality: qualityOf(dataset.workload, heldoutSubset(baseline)),
  };
}

/** C-A6-1: the dataset-derived identity components recomputable at REPORT
 *  time from the current tree. A results file whose recorded identity
 *  disagrees must never render a binding-looking verdict. */
export function reportIdentityMismatch(
  ds: AnalysisEvalDataset,
  rf: EvalResultsFile,
): string | null {
  // The recompute must run under the KNOB ENVIRONMENT the file recorded —
  // mapContentChars sits in mapExtractorVersion's basis and reduceGroupsFed
  // in the digest promptHash, so recomputing a capacity-profiled cell under
  // the report invocation's own profile would false-degrade deterministically
  // (review finding: the matrix's whole population). Model envs are NOT
  // restored here (they are not part of envKnobs); that residual sensitivity
  // is documented in the hardening record.
  const KNOB_ENVS: Array<[string, number | undefined]> = [
    ["REDUCE_VOTES", rf.envKnobs.reduceVotes],
    ["REDUCE_MAX_OUTPUT_TOKENS", rf.envKnobs.reduceMaxOutputTokens],
    ["MAP_OUT_TOKENS_PER_DOC", rf.envKnobs.mapOutTokensPerDoc],
    ["MAP_CONTENT_CHARS", rf.envKnobs.mapContentChars],
    ["REDUCE_GROUPS_FED", rf.envKnobs.reduceGroupsFed ?? 200],
  ];
  const saved = KNOB_ENVS.map(([k]) => [k, process.env[k]] as const);
  for (const [k, v] of KNOB_ENVS) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  let nowPrompt: string;
  let nowSchema: string;
  let nowExtractor: string | null;
  try {
    nowPrompt = datasetPromptHash(ds);
    nowSchema = workloadSchemaVersion(ds);
    nowExtractor = datasetExtractorVersions(ds) ?? null;
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const diffs: string[] = [];
  if (rf.identity.promptHash !== nowPrompt) {
    diffs.push(`promptHash recorded ${rf.identity.promptHash.slice(0, 12)} vs current ${nowPrompt.slice(0, 12)}`);
  }
  if (rf.identity.schemaVersion !== nowSchema) {
    diffs.push(`schemaVersion recorded ${rf.identity.schemaVersion.slice(0, 12)} vs current ${nowSchema.slice(0, 12)}`);
  }
  const recExt = rf.identity.extractorVersion ?? null;
  if (recExt !== nowExtractor) {
    diffs.push(`extractorVersion recorded ${recExt ?? "absent"} vs current ${nowExtractor ?? "absent"}`);
  }
  return diffs.length === 0 ? null : diffs.join("; ");
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
  aligned: AlignedComparison | null;
  verdictResult: ScorecardVerdictResult;
  /** rendered ONLY for a passing live evaluation_candidate — a PROPOSED
   *  analysis-registry entry as text. This program never edits
   *  analysis-registry.ts; activation additionally requires the paid-eval
   *  authorization checklist + an operator decision-log entry. A pass now
   *  requires results completeness (MAJOR-1), so a partial/--dev/--only file
   *  can never render this. */
  proposedRegistryEntry: string | null;
  /** Hardening item 8 (C-A6-3) + the capacity matrix: the knob values the
   *  results were produced under, straight from the results-file headers —
   *  knob drift between judged and baseline must be VISIBLE at report time. */
  judgedEnvKnobs: EvalEnvKnobs;
  baselineEnvKnobs: EvalEnvKnobs | null;
  baselineIdentity: CandidateDispatchIdentity | null;
  /** C-A7-2: prior generations discarded with --fresh (from the header) —
   *  rendered so a re-rolled artifact can never look first-try. */
  discardedGenerations: number;
}

export function buildWorkloadScorecard(
  dataset: AnalysisEvalDataset,
  judgedFile: EvalResultsFile,
  baselineFile: EvalResultsFile | null,
  liveJudged: boolean,
  /** sha256 of the dataset file AS IT EXISTS NOW (re-review minor 1): when
   *  supplied and different from the results file's recorded hash, the
   *  verdict degrades to insufficient_data — an id-preserving reference edit
   *  AFTER a run must never let stale results read as a verdict against the
   *  current gold. */
  currentDatasetContentHash?: string,
  /** C-A6-2: what the report EXPECTS the baseline file to be — its configKey
   *  (filename-derived) and the default model its identity must carry. */
  baselineExpectation?: { configKey: string; model: string } | null,
): WorkloadScorecard {
  const judged = aggregateResults(dataset, judgedFile, liveJudged);
  const baseline = baselineFile ? aggregateResults(dataset, baselineFile, true) : null;
  const aligned = baselineFile ? alignedComparison(dataset, judgedFile, baselineFile) : null;
  let verdictResult = computeScorecardVerdict(judged, baseline, aligned);
  const degrade = (reason: string) => {
    verdictResult = {
      verdict: "insufficient_data",
      reasons: [reason, ...verdictResult.reasons],
      deltas: null,
    };
  };
  // C-A6-1: dataset-derived identity must recompute to what the file recorded
  const idDrift = reportIdentityMismatch(dataset, judgedFile);
  if (idDrift !== null) {
    degrade(`recorded identity does not recompute from the current tree (${idDrift}) — rerun before verdicting`);
  }
  if (baselineFile !== null && liveJudged) {
    // C-A6-2: the LIVE baseline is trusted by filename today — cross-check its
    // own header/identity, and refuse a self-comparison. Offline judged files
    // never take a baseline through discovery, and offline runIds are
    // deterministic (`offline-<datasetVersion>`), so the overlap check is
    // live-scoped by design.
    if (baselineExpectation) {
      if (baselineFile.configKey !== baselineExpectation.configKey) {
        degrade(`baseline header configKey "${baselineFile.configKey}" does not match its filename-derived key "${baselineExpectation.configKey}"`);
      }
      if (baselineFile.identity.model !== baselineExpectation.model) {
        degrade(`baseline identity.model "${baselineFile.identity.model}" is not the default baseline model "${baselineExpectation.model}"`);
      }
    }
    const baseIdDrift = reportIdentityMismatch(dataset, baselineFile);
    if (baseIdDrift !== null) {
      degrade(`baseline identity does not recompute from the current tree (${baseIdDrift})`);
    }
    const runIds = (rf: EvalResultsFile) => new Set(Object.values(rf.results).map((r) => r.runId));
    const jRuns = runIds(judgedFile);
    const overlap = [...runIds(baselineFile)].filter((r) => jRuns.has(r));
    if (overlap.length > 0) {
      degrade(`judged and baseline share runId(s) ${overlap.slice(0, 3).join(", ")} — a self-comparison can only produce zero deltas`);
    }
  }
  if (
    baselineFile !== null &&
    JSON.stringify(comparableKnobs(judgedFile.envKnobs, dataset.workload, headerIsLive(judgedFile))) !==
      JSON.stringify(comparableKnobs(baselineFile.envKnobs, dataset.workload, headerIsLive(baselineFile)))
  ) {
    // capacity-knob drift between judged and baseline: the pairwise deltas
    // compare different pipeline configurations — never a formal verdict
    verdictResult = {
      verdict: "insufficient_data",
      reasons: [
        "env-knob drift between judged and baseline results — quality deltas compare different capacity configurations; rerun the baseline under the same --capacity profile",
        ...verdictResult.reasons,
      ],
      deltas: null,
    };
  }
  if (
    currentDatasetContentHash !== undefined &&
    judgedFile.datasetContentHash !== currentDatasetContentHash
  ) {
    verdictResult = {
      verdict: "insufficient_data",
      reasons: [
        `dataset changed since this run: results were produced against dataset content ${judgedFile.datasetContentHash.slice(0, 12)}, the dataset file is now ${currentDatasetContentHash.slice(0, 12)} — rerun with --fresh before verdicting`,
        ...verdictResult.reasons,
      ],
      deltas: null,
    };
  }
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
          `  evidence: this scorecard (dataset ${dataset.datasetVersion}, promptHash ${judgedFile.identity.promptHash.slice(0, 12)}, configKey ${judgedFile.configKey}, knobs ${JSON.stringify(judgedFile.envKnobs)})`,
        ].join("\n")
      : null;
  return {
    workload: dataset.workload,
    datasetVersion: dataset.datasetVersion,
    judged,
    judgedIdentity: judgedFile.identity,
    baseline,
    aligned,
    verdictResult,
    proposedRegistryEntry,
    judgedEnvKnobs: judgedFile.envKnobs,
    baselineEnvKnobs: baselineFile ? baselineFile.envKnobs : null,
    baselineIdentity: baselineFile ? baselineFile.identity : null,
    discardedGenerations: (judgedFile.discardedRuns ?? []).length,
  };
}

function knobsLine(k: EvalEnvKnobs, workload: AnalysisEvalWorkload, live: boolean): string {
  const c = comparableKnobs(k, workload, live);
  return (
    `reduceVotes=${c.reduceVotes} reduceMaxOutputTokens=${c.reduceMaxOutputTokens} ` +
    `mapOutTokensPerDoc=${c.mapOutTokensPerDoc} mapContentChars=${c.mapContentChars} ` +
    `reduceGroupsFed=${c.reduceGroupsFed}` + // pre-2026-08-27 files lack the field
    (live && workload === "validation" ? ` validationVotes=${c.validationVotes}` : "")
  );
}

/** The validation vote mode a results file was produced under, for the
 *  scorecard: a legacy file (no validationVotes recorded) was single-round. */
export function validationVoteModeLine(k: EvalEnvKnobs, live: boolean): string {
  if (!live) return "Vote mode: offline fixtures (no dispatch; expectMajority pins the fixture voteRounds)";
  if (k.validationVotes === undefined) {
    return `Vote mode: **LEGACY SINGLE-ROUND** (file predates 2026-09-04; no validationVotes recorded) — NOT production-equivalent (production = ${VALIDATION_VOTES_PRODUCTION}-vote majority)`;
  }
  if (k.validationVotes === VALIDATION_VOTES_PRODUCTION) {
    return `Vote mode: production-equivalent (${VALIDATION_VOTES_PRODUCTION} vote rounds, majority via the production resolveVoteRounds)`;
  }
  return `Vote mode: **SINGLE-ROUND DIAGNOSTIC** (${k.validationVotes} vote round) — NOT production-equivalent (production = ${VALIDATION_VOTES_PRODUCTION}-vote majority)`;
}

function pct(x: number): string {
  return Number.isNaN(x) ? "—" : `${(100 * x).toFixed(1)}%`;
}

function sliceLine(name: string, s: SliceStats): string {
  const q = Object.entries(s.quality)
    .filter(([k]) => !k.endsWith("VacuousCount"))
    .map(([k, v]) => `${k}=${pct(v)}`)
    .join(", ");
  return `| ${name} | ${s.checksPassed}/${s.results} passed | ${q || "—"} |`;
}

export interface ScorecardDetailBlock {
  workload: string;
  configKey: string;
  results: EvalCaseResult[];
  /** caseId -> split, so heldout rows can be redacted by default (m9) */
  splitOf: Record<string, string>;
}

export function renderAnalysisScorecardMarkdown(input: {
  generatedAt: string;
  scorecards: WorkloadScorecard[];
  detail: ScorecardDetailBlock[];
  headerNote?: string;
  /** m9: per-case failure detail for HELDOUT rows is hidden by default so the
   *  default report output cannot become a heldout iteration channel;
   *  --show-heldout-detail reveals it for operator calibration. */
  showHeldoutDetail?: boolean;
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
    const c = a.completeness;
    lines.push(`## ${sc.workload} — config \`${a.configKey}\` (dataset ${sc.datasetVersion})`);
    lines.push("");
    lines.push(
      `Identity: provider=${sc.judgedIdentity.provider} model=${sc.judgedIdentity.model} ` +
        `effort=${sc.judgedIdentity.reasoningEffort ?? "absent"} approval=${sc.judgedIdentity.approval} ` +
        `registry=${sc.judgedIdentity.registryVersion} promptHash=${sc.judgedIdentity.promptHash.slice(0, 12)} ` +
        `schema=${sc.judgedIdentity.schemaVersion.slice(0, 12)}` +
        (sc.judgedIdentity.extractorVersion ? ` extractor=${sc.judgedIdentity.extractorVersion}` : ""),
    );
    const judgedLive = sc.judgedIdentity.provider !== "stub";
    lines.push(`Env knobs: ${knobsLine(sc.judgedEnvKnobs, sc.workload, judgedLive)}`);
    if (sc.workload === "validation") lines.push(validationVoteModeLine(sc.judgedEnvKnobs, judgedLive));
    if (sc.discardedGenerations > 0) {
      lines.push(
        `Discarded generations (--fresh provenance): ${sc.discardedGenerations} — this file's results are not first-try`,
      );
    }
    if (sc.baseline && sc.baselineIdentity) {
      lines.push(
        `Baseline identity: model=${sc.baselineIdentity.model} effort=${sc.baselineIdentity.reasoningEffort ?? "absent"} ` +
          `promptHash=${sc.baselineIdentity.promptHash.slice(0, 12)}`,
      );
    }
    if (sc.baselineEnvKnobs) {
      const baseLive = sc.baselineIdentity ? sc.baselineIdentity.provider !== "stub" : judgedLive;
      const drift = knobsLine(sc.baselineEnvKnobs, sc.workload, baseLive) !== knobsLine(sc.judgedEnvKnobs, sc.workload, judgedLive);
      lines.push(
        drift
          ? `Baseline knobs: ${knobsLine(sc.baselineEnvKnobs, sc.workload, baseLive)} — **KNOB DRIFT vs judged: quality deltas compare different capacity configurations**`
          : `Baseline knobs: identical`,
      );
    }
    lines.push("");
    lines.push("| metric | value |");
    lines.push("|---|---|");
    lines.push(
      `| completeness | scope=${c.scope} · ${c.presentResults}/${c.expectedResults} results present (${c.missingResults} missing, ${c.missingHeldout} heldout missing) · reps=${c.requestedRepetitions} · datasetHash=${c.datasetContentHash.slice(0, 12)} · ${c.complete ? "COMPLETE" : "INCOMPLETE"} |`,
    );
    lines.push(`| cases (scored / schema-invalid / provider-error / skipped) | ${a.cases.scored} / ${a.cases.schemaInvalid} / ${a.cases.providerError} / ${a.cases.skipped} of ${a.cases.total} |`);
    if (a.cases.inapplicable > 0) {
      // load-bearing, not cosmetic: without this line a capacity file reads
      // "N/N checks passed" while some cases were structurally excluded
      lines.push(
        `| **structurally inapplicable (not scored, not gated)** | ${a.cases.inapplicable} of ${a.cases.total} — capacity requirement unmet under this profile's knobs |`,
      );
    }
    lines.push(`| checks passed | ${a.checks.passed}/${a.checks.total} |`);
    if (a.machinery.total > 0) {
      lines.push(`| machinery proof (result matches fixture expectation) | ${a.machinery.matched}/${a.machinery.total} |`);
    }
    for (const [k, v] of Object.entries(a.quality)) {
      lines.push(
        k.endsWith("VacuousCount")
          ? `| quality: ${k} (excluded from mean) | ${v} |`
          : `| quality: ${k} (all results, diagnostic) | ${pct(v)} |`,
      );
    }
    if (a.capacityDiagnostics !== null) {
      const cd = a.capacityDiagnostics;
      const ratio = (n: number, d: number) => (d > 0 ? `${n}/${d} (${pct(n / d)})` : "unavailable (no case supplies this metadata)");
      lines.push(`| capacity diagnostics | **REPORT-ONLY, not gated** — ${cd.resultsWithMeta} scored result(s) with capacity metadata, ${cd.inapplicableResults} structurally inapplicable |`);
      for (const b of POSITION_BUCKETS) {
        lines.push(`| capacity: positionRecall.${b} | ${ratio(cd.positionRecall[b].matched, cd.positionRecall[b].expected)} |`);
      }
      lines.push(`| capacity: straddleRecall (facts crossing offset 1500) | ${ratio(cd.straddleRecall.matched, cd.straddleRecall.expected)} |`);
      lines.push(`| capacity: uniqueTailLoss (lost / unique tail facts) | ${cd.uniqueTailLoss.uniqueTail > 0 ? `${cd.uniqueTailLoss.lost}/${cd.uniqueTailLoss.uniqueTail}` : "unavailable (no case supplies this metadata)"} |`);
      lines.push(`| capacity: tailEventRecall (survived / fed; unfed excluded) | ${ratio(cd.tailEventRecall.survived, cd.tailEventRecall.fed)}${cd.tailEventRecall.unfed > 0 ? ` · ${cd.tailEventRecall.unfed} unfed (capacity limitation, not model failure)` : ""} |`);
      lines.push(`| capacity: lateDocumentRecall (cited / fed late groups) | ${ratio(cd.lateDocumentRecall.cited, cd.lateDocumentRecall.total)}${cd.lateDocumentRecall.unfed > 0 ? ` · ${cd.lateDocumentRecall.unfed} unfed` : ""} |`);
    }
    lines.push(`| gate: wrongDocIds / heldout under-fill / strengthened hedges | ${a.gate.wrongDocIdsTotal} / ${a.gate.heldoutUnderfillCases} / ${a.gate.strengthenedHedgesTotal} |`);
    lines.push(`| gate: guard fails / fidelity fails / injection follows / repro fails | ${a.gate.guardCasesFailed} / ${a.gate.fidelityFailures} / ${a.gate.injectionFollowedCases} / ${a.gate.reproducibilityFailures} |`);
    lines.push(`| resources: latency mean / prompt tok / completion tok / est USD | ${a.resources.latencyMsMean === null ? "—" : Math.round(a.resources.latencyMsMean) + "ms"} / ${a.resources.promptTokensTotal} / ${a.resources.completionTokensTotal} / $${a.resources.estUsdTotal.toFixed(4)} |`);
    lines.push(`| metering (attempts / reservations / meterings / errored) | ${a.meter.attempts} / ${a.meter.reservations} / ${a.meter.meterings} / ${a.meter.erroredAttempts} |`);
    lines.push(
      `| run provenance | ${a.runs.distinctRunIds.length} run id(s)${a.runs.mixedRun ? " — MIXED-RUN FILE (keys were replaced by later runs)" : ""}: ${Object.entries(a.runs.keysByRunId)
        .map(([id, n]) => `${id}=${n}`)
        .join(", ")} |`,
    );
    lines.push(`| completed heldout coverage (typical/edge/adversarial) | ${c.heldoutPresent.typical}/${c.heldoutPresent.edge}/${c.heldoutPresent.adversarial} |`);
    if (a.repetitions > 1) {
      lines.push(`| repetitions / quality spread | ${a.repetitions} / ${JSON.stringify(a.repetitionSpread)} |`);
    }
    lines.push("");
    lines.push("| slice | checks | quality |");
    lines.push("|---|---|---|");
    lines.push(sliceLine("split: development (diagnostic)", a.bySplit.development));
    lines.push(sliceLine("split: heldout (gated)", a.bySplit.heldout));
    lines.push(sliceLine("partition: typical", a.byPartition.typical));
    lines.push(sliceLine("partition: edge", a.byPartition.edge));
    lines.push(sliceLine("partition: adversarial", a.byPartition.adversarial));
    lines.push("");
    if (sc.baseline) {
      const bc = sc.baseline.completeness;
      lines.push(
        `Baseline \`${sc.baseline.configKey}\`: completeness scope=${bc.scope} ${bc.presentResults}/${bc.expectedResults} (${bc.complete ? "COMPLETE" : "INCOMPLETE"}) datasetHash=${bc.datasetContentHash.slice(0, 12)}.`,
      );
      if (sc.aligned) {
        lines.push(
          `Aligned population: ${sc.aligned.alignedKeys} present pair(s), ${sc.aligned.scoredAlignedKeys} scored-on-both-sides ` +
          `(${sc.aligned.excludedDegradedPairs} excluded degraded, ${sc.aligned.excludedInapplicablePairs} excluded structurally inapplicable), ${sc.aligned.alignedHeldoutKeys} heldout (the gated set). ` +
            `Aligned-heldout quality — judged: ${Object.entries(sc.aligned.judgedQuality)
              .filter(([k]) => !k.endsWith("VacuousCount"))
              .map(([k, v]) => `${k}=${pct(v)}`)
              .join(", ")}; baseline: ${Object.entries(sc.aligned.baselineQuality)
              .filter(([k]) => !k.endsWith("VacuousCount"))
              .map(([k, v]) => `${k}=${pct(v)}`)
              .join(", ")}` +
            (sc.verdictResult.deltas
              ? ` · deltas: ${Object.entries(sc.verdictResult.deltas)
                  .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}pts`)
                  .join(", ")}`
              : ""),
        );
      }
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
  if (!input.showHeldoutDetail) {
    lines.push("_Heldout rows show status only — per-case failure detail is hidden by default so this report cannot become a heldout iteration channel (`--show-heldout-detail` reveals it for operator calibration)._");
    lines.push("");
  }
  lines.push("| workload | config | case | rep | split | status | pass | failures |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const d of input.detail) {
    for (const r of [...d.results].sort((x, y) => (x.caseId < y.caseId ? -1 : 1))) {
      const split = d.splitOf[r.caseId] ?? "development";
      const hidden = split === "heldout" && !input.showHeldoutDetail;
      const failures = hidden
        ? "(hidden)"
        : r.checks.failures.join("; ").replace(/\|/g, "\\|").slice(0, 220) || "—";
      lines.push(
        `| ${d.workload} | ${d.configKey} | ${r.caseId} | ${r.repetition} | ${split} | ${r.status} | ${r.checks.pass ? "yes" : "no"} | ${failures} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
