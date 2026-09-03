// Analysis-eval control plane, C1: contracts + runtime validators.
//
// Pure, DB/network/LLM-free. Defines the checked-in dataset shapes for the four
// analysis workloads (map extraction, reduce clustering, digest synthesis, ISW
// validation matching), the per-case result record, and hand-rolled structural
// validators the runner's --validate-dataset mode applies to every dataset file
// (the repo has no ajv on purpose — validators are explicit functions, like the
// rest of the house parsing code).
//
// IMMUTABILITY CONTRACT: a case's `input` and `reference` are frozen once
// committed. Changing either requires a NEW case id (or a new datasetVersion) —
// otherwise historical results files silently describe a different case than
// the current dataset. The validator cannot enforce history; the README and
// review discipline do.
//
// LEGAL/CONTENT RULES (docs/evals/analysis/README.md):
// - No ISW prose anywhere (standing ruling 1). Validation cases use PARAPHRASED
//   takeaway-STYLE texts authored for this repo, never real ISW sentences.
// - Every named person/organization in any fixture is FICTIONAL by policy (the
//   FidelityEvidenceClaim precedent, src/lib/ask/eval-set.ts).
// - No copyrighted source full text: doc snippets are short synthetic texts
//   authored for this repo (multilingual ones included), < ~400 chars each.

import type { Hedging, ReduceClaim } from "../analysis/reduce";
import type { ClaimForValidation } from "../validation/score";
import type { EvidenceRecencyDocInput } from "./evidence-recency-summary";
import { gistNumeralStyleErrors } from "./numerals";

// ============================================================================
// Case envelope
// ============================================================================

export const ANALYSIS_EVAL_WORKLOADS = ["map", "reduce", "digest", "validation"] as const;
export type AnalysisEvalWorkload = (typeof ANALYSIS_EVAL_WORKLOADS)[number];

export const EVAL_PARTITIONS = ["typical", "edge", "adversarial"] as const;
export type EvalPartition = (typeof EVAL_PARTITIONS)[number];

/** development = prompt/config iteration allowed against these results.
 *  heldout = verdict-only: humans must NOT iterate prompts against heldout
 *  results (docs/evals/analysis/README.md § heldout discipline); `--dev` runs
 *  exclude them entirely and every report labels the split. */
export const EVAL_SPLITS = ["development", "heldout"] as const;
export type EvalSplit = (typeof EVAL_SPLITS)[number];

export interface AnalysisEvalCaseBase {
  /** stable slug (lowercase letters/digits/hyphens). NEVER reused for changed
   *  input/reference — see the immutability contract above. */
  id: string;
  workload: AnalysisEvalWorkload;
  partition: EvalPartition;
  split: EvalSplit;
  /** how the case was authored (e.g. "authored-2026-08-17"). Model-generated
   *  cases are PROVISIONAL by policy and must say so here; the v1 datasets are
   *  entirely hand-authored. */
  provenance: string;
  notes?: string;
}

// ---- capacity metadata (contractVersion 2) -----------------------------------
//
// The corpus-v2 capacity cases annotate WHERE facts sit inside long synthetic
// documents (UTF-16 code-unit offsets — the unit of String.length, the
// validator doc cap, and mapDocLine's MAP_CONTENT_CHARS slice) and WHAT
// capacity configuration the case's expectations were authored against. All
// shapes below are strictly validated: unknown keys are dataset errors, never
// silently tolerated annotations. Diagnostics read them; the scorers'
// pass/fail logic never does.

export const POSITION_BUCKETS = ["early", "mid", "tail", "deep-tail"] as const;
export type PositionBucket = (typeof POSITION_BUCKETS)[number];

/** Single bucket authority (validator AND metrics): by fact START offset —
 *  early < 400 · mid 400..1500 · tail 1501..4000 · deep-tail > 4000. Bucket
 *  edges reference the production MAP_CONTENT_CHARS default (1500) and the
 *  map-depth-4000 profile. */
export function positionBucketForOffset(startU16: number): PositionBucket {
  if (startU16 < 400) return "early";
  if (startU16 <= 1500) return "mid";
  if (startU16 <= 4000) return "tail";
  return "deep-tail";
}

export interface MapDocFact {
  /** stable key linking expected claims to this fact (unique per doc) */
  key: string;
  /** inclusive UTF-16 start offset of the fact sentence in doc content */
  startU16: number;
  /** exclusive UTF-16 end offset (≤ content.length) */
  endU16: number;
  /** must equal positionBucketForOffset(startU16) — validator-pinned */
  positionBucket: PositionBucket;
  /** must equal (startU16 < 1500 && endU16 > 1500) whenever present — the
   *  boundary-straddle flag gets its own diagnostic, never hidden in a bucket */
  straddlesDefaultKnob1500?: boolean;
}

export interface MapDocCapacity {
  /** measured fact positions (generator-computed, never hand-typed) */
  facts?: MapDocFact[];
  /** informative per-doc annotation: the MAP_CONTENT_CHARS this doc's deepest
   *  fact needs. The APPLICABILITY authority is the case-level
   *  capacityMeta.minMapContentChars (= max over docs, validator-pinned). */
  requiredMapContentChars?: number;
  /** doc exceeds the v1 1,600-unit cap and needs the contractVersion-2 6,000
   *  ceiling (generator sets it whenever content.length > 1600) */
  requiresContractCap?: number;
  /** adversarial cases: UTF-16 offset of the injection payload */
  injectionPayloadOffsetU16?: number;
  /** near-dupe pair partner (docId; both sides must declare each other) */
  nearDupePairId?: number;
  /** quiet-control doc: the reference must expect ZERO claims from it */
  quietControl?: boolean;
}

export interface MapClaimCapacity {
  /** must equal positionBucketForOffset(charOffsetU16) — validator-pinned */
  positionBucket: PositionBucket;
  /** UTF-16 start offset of the supporting fact in the cited doc */
  charOffsetU16: number;
  /** links this expected claim to its doc fact (exact key match) — enables
   *  unique-tail-loss with a deterministic denominator */
  factKey?: string;
}

export interface MapCaseCapacityMeta {
  /** MIN semantics: the case is structurally applicable only when the applied
   *  mapContentChars() >= this (facts past the applied depth are unreadable —
   *  a smaller knob is classified inapplicable, never scored as failure). */
  minMapContentChars?: number;
  /** every named person in this case (all FICTIONAL by policy) */
  fictionalPersons?: string[];
  /** every named organization in this case (all FICTIONAL by policy) */
  fictionalOrgs?: string[];
}

export interface DigestCaseCapacityMeta {
  /** EXACT semantics: fed-cutoff survivor/dead expectations are authored
   *  against ONE cutoff — both fewer AND more fed groups change survivorship,
   *  so the case is applicable only when reduceGroupsFed() === this. */
  exactReduceGroupsFed?: number;
  /** decisive events by rank in the deterministic rankGroups order; rank N
   *  means the group of the N-th ranked claim. Feeds tailEventRecall. */
  decisiveEvents?: Array<{ rank: number; titlePattern: string }>;
  /** claim ids from the latest-published docs (late-document-recall basis) */
  lateClaimIds?: number[];
  fictionalPersons?: string[];
  fictionalOrgs?: string[];
}

// ---- map ---------------------------------------------------------------------

export interface MapEvalDoc {
  docId: number;
  title: string | null;
  /** synthetic snippet authored for this repo (never copied source text) */
  content: string;
  lang: string;
  /** yyyy-mm-dd UTC day (mapDocLine's `day`) */
  day: string;
  sourceKey?: string | null;
  reliability?: number | null;
  /** contractVersion 2 only */
  capacity?: MapDocCapacity;
}

export interface MapEvalInput {
  theater: string;
  track: "military" | "elite_politics" | "nuclear";
  docs: MapEvalDoc[];
}

export interface MapExpectedClaim {
  /** matched against produced text_en by token-jaccard >= MAP_GIST_MATCH_THRESHOLD
   *  (score-map.ts; greedy best-match, each gold matched at most once) */
  textGist: string;
  hedging: Hedging;
  claimType?: "factual" | "assessment";
  /** the matched produced claim must carry a quote that verifies (verifyQuote)
   *  against THIS doc's title+content */
  mustQuoteFromDoc?: boolean;
  /** contractVersion 2 only */
  capacity?: MapClaimCapacity;
}

export interface MapEvalReference {
  /** SCI-3b: when true, every matched mustMatch pair also requires the
   *  reference text's numerals (digits AND number-words) to survive into the
   *  matched candidate claim — "four drones" answered by "five drones" is a
   *  fidelity failure, not a gist match. Opt-in per case (v2 capacity corpus
   *  sets it); absent = v1 behavior. */
  checkNumerals?: boolean;
  /** one entry per input doc, same order; empty claims = expected none */
  expected: Array<{ docId: number; claims: MapExpectedClaim[] }>;
  /** every pattern must match the produced claim-text corpus (case-insensitive) */
  mustMatch?: string[];
  /** no pattern may fire AFFIRMATIVELY in any produced claim text — same
   *  negation-scope semantics as the Ask fidelity checks (firesAffirmatively) */
  mustNotMatch?: string[];
  /** adversarial payload markers: no produced claim may match any of these
   *  (plain case-insensitive test — a payload echoed under negation is still
   *  an injection follow) */
  injectionPatterns?: string[];
}

/** Committed candidate output for offline scoring: the raw JSON string "a
 *  model returned", authored by hand (compliant or deliberately violating). */
export interface MapOfflineFixture {
  fixtureId: string;
  rawOutput: string;
  /** simulate finish_reason === "length" (billed-then-discarded truncation) */
  truncated?: boolean;
  /** the author's declaration: should this fixture PASS the case's checks?
   *  "fail" fixtures exist to prove the machinery catches the failure mode —
   *  the offline baseline's machinery-proof metric is checks.pass === (this
   *  field === "pass") for every case. */
  expectation: "pass" | "fail";
}

// ---- reduce ------------------------------------------------------------------

export interface ReduceEvalInput {
  theater: string;
  track: string;
  /** ReduceClaim rows exactly as the loader would feed clusterClaims — one
   *  (theater, track) at current extractor versions by loader contract
   *  (reduce-io.ts); the dataset never mixes theaters in one case. */
  claims: ReduceClaim[];
  /** docId -> canonical docId pairs (doc_dedup) */
  mirrorOf?: Array<[number, number]>;
  /** evidence-recency probe population (independent of `claims`) */
  recencyDocs?: EvidenceRecencyDocInput[];
  /** "now" instant for the recency probe (ISO, explicit timezone) */
  recencyAsOf?: string;
}

export interface ReduceGroupExpectation {
  /** the group CONTAINING this doc_claims id is the one under test */
  memberId: number;
  hedging?: Hedging;
  promoted?: boolean;
  independentSources?: number;
  /** exact representative wording expected (highest-reliability member rule) */
  text?: string;
}

export interface ReduceEvalReference {
  /** doc_claims id pairs that must land in the SAME group */
  expectTogether?: Array<[number, number]>;
  /** doc_claims id pairs that must land in DIFFERENT groups */
  expectApart?: Array<[number, number]>;
  expectGroups?: ReduceGroupExpectation[];
  expectGroupCount?: number;
  /** doc_claims ids that must be dropped before clustering (meta-claims) */
  expectMetaDropped?: number[];
  /** expected evidence-recency summary fields (exact match per provided key;
   *  numbers hand-computed at authoring time) */
  expectRecency?: Record<string, number | boolean | string | null>;
}

// ---- digest ------------------------------------------------------------------

export interface DigestEvalInput {
  theater: string;
  track: string;
  date: string; // yyyy-mm-dd
  /** claims to cluster into the fed groups (group key = lowest member id) */
  claims: ReduceClaim[];
  mirrorOf?: Array<[number, number]>;
}

export interface DigestHedgingExpectation {
  /** first finalized claim whose text matches this pattern (case-insensitive) */
  textMatch: string;
  hedging: Hedging;
}

export interface DigestEvalReference {
  // ---- fixture-conditional expectations (authored against the committed
  // fixture votes; a LIVE candidate's votes differ, so live runs score only
  // the candidate-invariant subset below — see score-reduce.ts) ----
  /** each pattern must match some surviving (post-guard) event title/summary */
  expectSurvivingTitles?: string[];
  /** no surviving event title/summary may match (e.g. the 2-of-5 minority event) */
  expectDeadTitles?: string[];
  expectEventCount?: number;
  expectDroppedGidRefs?: number;
  /** majority-gid fill: some finalized claim must cite exactly [gid] */
  expectClaimCitingGid?: number[];
  expectGuardStats?: Partial<{
    attributedClaims: number;
    droppedClaims: number;
    droppedEvents: number;
    retitledEvents: number;
    replacedSummaries: number;
  }>;
  expectHedging?: DigestHedgingExpectation[];
  /** pipeline must REFUSE (usable votes < majority) — mirrors synthesize.ts */
  expectPipelineRefusal?: boolean;
  // ---- candidate-invariant expectations (apply to ANY vote set) ----
  /** must match the published prose corpus (titles+summaries+claim texts) */
  mustMatch?: string[];
  /** may not fire affirmatively in the published prose corpus */
  mustNotMatch?: string[];
}

export interface DigestOfflineFixture {
  fixtureId: string;
  /** K raw synthesis-vote JSON strings (the candidate outputs under test) */
  votes: string[];
  expectation: "pass" | "fail";
}

// ---- validation --------------------------------------------------------------

export interface ValidationTakeaway {
  index: number;
  /** SYNTHETIC takeaway-style text authored for this repo — NEVER real ISW
   *  prose (standing ruling 1) */
  text: string;
}

export interface ValidationEvalInput {
  takeaways: ValidationTakeaway[];
  claims: ClaimForValidation[];
  iswPublishedAt: string | null;
  /** fixture LlmMatch[] for the scoreDigestWithMatches path (offline stand-in
   *  for a live candidate's match output) */
  llmMatches?: Array<{ takeawayIndex: number; claimId: number | null; confidence: number }>;
  /** fixture vote rounds for majorityFromVotes cases */
  voteRounds?: Array<Array<{ takeawayIndex: number; claimId: number | null; confidence: number }>>;
  /** classifyTakeawayTheater probes */
  theaterProbes?: Array<{ toponyms: string[]; expect: "ru" | "ua" | "both" }>;
}

export interface ValidationEvalReference {
  /** human ground truth: which claim (if any) genuinely matches each takeaway.
   *  BOTH paths (keyword scoreDigest, match-set scoreDigestWithMatches) are
   *  scored against these labels — a keyword false positive is recorded, not
   *  excused. */
  labels: Array<{ takeawayIndex: number; claimId: number | null }>;
  /** hand-computed pins on the keyword path's arithmetic (exact match) */
  expectKeyword?: Partial<{
    coveragePct: number | null;
    matchedPairs: number;
    thinSourcedRate: number;
    timelinessHours: number | null;
  }>;
  /** hand-computed at-publish pin (null = expected null result) */
  expectAtPublish?: {
    coveragePct: number | null;
    matchedBefore: number;
    matchedTotal: number;
  } | null;
  /** expected majority-vote finals for voteRounds cases */
  expectMajority?: Array<{ takeawayIndex: number; final: number | null }>;
}

// ---- the discriminated case union ---------------------------------------------

export interface MapEvalCase extends AnalysisEvalCaseBase {
  workload: "map";
  input: MapEvalInput;
  reference: MapEvalReference;
  offline: MapOfflineFixture;
  /** contractVersion 2 only */
  capacityMeta?: MapCaseCapacityMeta;
}

export interface ReduceEvalCase extends AnalysisEvalCaseBase {
  workload: "reduce";
  input: ReduceEvalInput;
  reference: ReduceEvalReference;
  /** reduce is a deterministic pipeline — there is no model output to fixture;
   *  `expectation` declares whether the case's reference checks should pass. */
  offline: { expectation: "pass" | "fail" };
}

export interface DigestEvalCase extends AnalysisEvalCaseBase {
  workload: "digest";
  input: DigestEvalInput;
  reference: DigestEvalReference;
  offline: DigestOfflineFixture;
  /** contractVersion 2 only */
  capacityMeta?: DigestCaseCapacityMeta;
}

export interface ValidationEvalCase extends AnalysisEvalCaseBase {
  workload: "validation";
  input: ValidationEvalInput;
  reference: ValidationEvalReference;
  offline: { expectation: "pass" | "fail" };
}

export type AnalysisEvalCase =
  | MapEvalCase
  | ReduceEvalCase
  | DigestEvalCase
  | ValidationEvalCase;

export interface AnalysisEvalDataset {
  /** e.g. "map-v1" — bump on any input/reference change to an existing id */
  datasetVersion: string;
  /** absent = the frozen v1 contract (1,600-unit map doc cap, no capacity
   *  metadata). 2 = corpus-v2 contract (6,000-unit DATASET safety ceiling —
   *  a bound on committed fixtures, NOT a production MAP_CONTENT_CHARS
   *  recommendation — plus the typed capacity metadata above). Any other
   *  value fails validation closed. */
  contractVersion?: 2;
  workload: AnalysisEvalWorkload;
  createdAt: string;
  cases: AnalysisEvalCase[];
}

interface ContractLimits {
  maxMapDocChars: number;
  allowCapacityMeta: boolean;
}

function contractLimits(ds: AnalysisEvalDataset): ContractLimits {
  return ds.contractVersion === 2
    ? { maxMapDocChars: 6000, allowCapacityMeta: true }
    : { maxMapDocChars: 1600, allowCapacityMeta: false };
}

// ============================================================================
// Candidate identity + per-case result
// ============================================================================

/** The full configuration identity a run executed under — enough to
 *  reconstruct which model/prompt/schema produced the outputs WITHOUT
 *  consulting the current environment. Offline fixture runs use provider
 *  "stub" + model "offline-fixtures" (nothing dispatched) but still record the
 *  CURRENT prompt/schema hashes so drift is visible across reports. */
export interface CandidateDispatchIdentity {
  provider: "openai" | "stub";
  model: string;
  reasoningEffort: string | null;
  registryVersion: string;
  /** "baseline" = the production-approved configuration; "evaluation_candidate"
   *  = dispatched through evalDispatchConfig's registry-bypass (live eval only).
   *  A passing candidate scorecard can only ever PROPOSE a registry entry in
   *  report output — it never edits analysis-registry.ts. */
  approval: "baseline" | "evaluation_candidate";
  /** sha256 of the exact system+user prompt template bytes the runner would
   *  send, computed at run time from the REAL prompt builders (map-prompts /
   *  synthesize / llm-match) over the dataset's canonical probe inputs */
  promptHash: string;
  /** sha256 of the serialized JSON response schema for this workload */
  schemaVersion: string;
  /** map only: mapExtractorVersion per (track, theater) present in the
   *  dataset, joined "track/theater=version" and sorted */
  extractorVersion?: string;
}

export type EvalCaseStatus = "scored" | "schema_invalid" | "provider_error" | "skipped";

/** Minimal structural contract every workload's checks object satisfies
 *  (MapCaseChecks / ReduceCaseChecks / DigestCaseChecks /
 *  ValidationCaseChecks carry their workload-specific fields on top). */
export interface EvalCaseChecks {
  pass: boolean;
  failures: string[];
}

export interface EvalCaseResult {
  caseId: string;
  datasetVersion: string;
  runId: string;
  configKey: string;
  repetition: number;
  /** physical provider attempts consumed by this result (offline: 0) */
  attempt: number;
  status: EvalCaseStatus;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  estUsd: number | null;
  /** deterministic workload-specific verdicts (score-*.ts). The ONLY scoring
   *  authority in this program. */
  checks: EvalCaseChecks;
  /** RESERVED — future human review labels live here, never merged into
   *  `checks`. No human labeling happened in this program. */
  humanLabels: null;
  /** RESERVED — an optional model-grader's judgments would live here, and are
   *  NEVER an authority (a model must not grade its own output as the sole
   *  authority). No grader is implemented in this program. */
  graderJudgments: null;
  /** sha256 of the raw candidate output (live: the response body text; offline:
   *  the committed fixture text / the deterministic pipeline output, which
   *  doubles as the reproducibility witness). Never the output text itself for
   *  live runs. */
  rawOutputDigest: string;
  /** offline runs only: which committed fixture produced the scored output */
  fixtureId?: string;
}

// ============================================================================
// Results file (one per workload+configKey; resumable by (caseId, repetition))
// ============================================================================

/** Coverage breadth a results file was produced under. Only "full" files can
 *  ever reach a pass/fail verdict (gates.ts completeness gate); "dev"
 *  (--dev, heldout excluded) and "subset" (--only) files verdict
 *  insufficient_data by construction. */
export type EvalRunScope = "full" | "dev" | "subset";

/** Env-tunable pipeline knobs captured at run time (review remediation m10):
 *  a live result is only interpretable against the knob values it ran under,
 *  and a resume under different knobs is a different configuration (refused —
 *  MAJOR-3 identity assertion). */
export interface EvalEnvKnobs {
  reduceVotes: number;
  reduceMaxOutputTokens: number;
  mapOutTokensPerDoc: number;
  mapContentChars: number;
  /** The reduce fed cutoff — the capacity matrix's defining knob (results
   *  files written before 2026-08-27 lack it; comparisons default it to 200). */
  reduceGroupsFed: number;
}

export interface EvalResultsFile {
  workload: AnalysisEvalWorkload;
  configKey: string;
  datasetVersion: string;
  /** sha256 over the dataset FILE BYTES — covers inputs AND references, so a
   *  reference edit after a run is detectable (MAJOR-1/m8) and refuses a
   *  resume (MAJOR-3) */
  datasetContentHash: string;
  identity: CandidateDispatchIdentity;
  /** repetitions the run was invoked with — completeness expects every
   *  (caseId, repetition < requestedRepetitions) key present */
  requestedRepetitions: number;
  scope: EvalRunScope;
  envKnobs: EvalEnvKnobs;
  /** C-A7-2: provenance of --fresh discards — every discarded generation of
   *  this configKey's results, so re-roll-until-pass can never look
   *  first-try. Appended, never rewritten. */
  discardedRuns?: Array<{
    /** the qualified ack token (<workload-or-dataset>/<configKey>) naming the exact discarded file */
    configKey: string;
    runIds: string[];
    resultsDigest: string;
    discardedResults: number;
  }>;
  updatedAt: string;
  /** live runs: cross-checked metering invariants — a preset gate requires
   *  attempts === reservations (one FRESH reservation per physical dispatch)
   *  and meterings === attempts - erroredAttempts (every RECEIVED response is
   *  metered before parsing, truncated included — ruling 8; an attempt that
   *  errored before any response exists is unbilled and cannot be metered).
   *  Offline runs record zeros. */
  meter: { attempts: number; reservations: number; meterings: number; erroredAttempts: number };
  /** keyed `${caseId}#r${repetition}` */
  results: Record<string, EvalCaseResult>;
}

export function resultKey(caseId: string, repetition: number): string {
  return `${caseId}#r${repetition}`;
}

// ============================================================================
// Validators (hand-rolled; return precise error strings, [] = valid)
// ============================================================================

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEDGINGS = new Set(["confirmed", "claimed", "unverified", "assessed", "unknown"]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function compileOk(pattern: unknown): boolean {
  if (typeof pattern !== "string" || pattern.length === 0) return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function checkPatternList(errs: string[], where: string, list: unknown): void {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errs.push(`${where}: must be an array of regex strings`);
    return;
  }
  for (const p of list) {
    if (!compileOk(p)) errs.push(`${where}: pattern does not compile: ${JSON.stringify(p)}`);
  }
}

/** Capacity metadata is strictly keyed: an unknown key is a dataset error,
 *  never a silently tolerated annotation (the pre-admission drafts carried
 *  free-form fields; the admitted contract types every one of them). */
function checkAllowedKeys(errs: string[], where: string, obj: unknown, allowed: readonly string[]): boolean {
  if (!isRecord(obj)) {
    errs.push(`${where}: must be an object`);
    return false;
  }
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errs.push(`${where}: unknown key "${k}" (allowed: ${allowed.join(", ")})`);
  }
  return true;
}

function checkFictionalList(errs: string[], where: string, list: unknown): void {
  if (list === undefined) return;
  if (!Array.isArray(list) || list.some((n) => typeof n !== "string" || n.length === 0)) {
    errs.push(`${where}: must be an array of non-empty strings`);
  }
}

/** contractVersion-2 map capacity validation: offsets in range, buckets
 *  consistent with offsets, straddle flags consistent both directions,
 *  near-dupe symmetry, quiet-control ⇔ zero expected claims, and the
 *  case-level minMapContentChars as the single applicability authority. */
function validateMapCapacity(errs: string[], c: MapEvalCase): void {
  const w = `case ${c.id}`;
  const docById = new Map(c.input.docs.map((d) => [d.docId, d]));
  const expectedByDoc = new Map(c.reference.expected.map((e) => [e.docId, e.claims]));
  let maxRequired: number | undefined;

  for (const d of c.input.docs) {
    if (d.capacity === undefined) continue;
    const dw = `${w}: doc ${d.docId} capacity`;
    if (!checkAllowedKeys(errs, dw, d.capacity, [
      "facts", "requiredMapContentChars", "requiresContractCap",
      "injectionPayloadOffsetU16", "nearDupePairId", "quietControl",
    ])) continue;
    const cap = d.capacity;
    const len = typeof d.content === "string" ? d.content.length : 0;
    const factKeys = new Set<string>();
    for (const f of cap.facts ?? []) {
      const fw = `${dw} fact ${String(f?.key)}`;
      if (!checkAllowedKeys(errs, fw, f, ["key", "startU16", "endU16", "positionBucket", "straddlesDefaultKnob1500"])) continue;
      if (typeof f.key !== "string" || f.key.length === 0) errs.push(`${fw}: missing key`);
      else if (factKeys.has(f.key)) errs.push(`${fw}: duplicate fact key`);
      else factKeys.add(f.key);
      if (!Number.isInteger(f.startU16) || !Number.isInteger(f.endU16) || f.startU16 < 0 || f.endU16 <= f.startU16 || f.endU16 > len) {
        errs.push(`${fw}: offsets must satisfy 0 <= startU16 < endU16 <= content.length (${len})`);
        continue;
      }
      if (f.positionBucket !== positionBucketForOffset(f.startU16)) {
        errs.push(`${fw}: positionBucket ${f.positionBucket} != positionBucketForOffset(${f.startU16}) = ${positionBucketForOffset(f.startU16)}`);
      }
      const straddles = f.startU16 < 1500 && f.endU16 > 1500;
      if (f.straddlesDefaultKnob1500 !== undefined && f.straddlesDefaultKnob1500 !== straddles) {
        errs.push(`${fw}: straddlesDefaultKnob1500 ${f.straddlesDefaultKnob1500} inconsistent with offsets [${f.startU16}, ${f.endU16})`);
      }
      if (f.straddlesDefaultKnob1500 === undefined && straddles) {
        errs.push(`${fw}: fact straddles offset 1500 but does not declare straddlesDefaultKnob1500`);
      }
    }
    if (cap.requiredMapContentChars !== undefined) {
      if (!Number.isInteger(cap.requiredMapContentChars) || cap.requiredMapContentChars < 200 || cap.requiredMapContentChars > 6000) {
        errs.push(`${dw}: requiredMapContentChars must be an integer in 200..6000`);
      } else {
        maxRequired = Math.max(maxRequired ?? 0, cap.requiredMapContentChars);
      }
    }
    if (cap.requiresContractCap !== undefined) {
      if (cap.requiresContractCap !== 6000) errs.push(`${dw}: requiresContractCap must be 6000 (the v2 ceiling)`);
      if (len <= 1600) errs.push(`${dw}: requiresContractCap declared but content fits the v1 1600 cap`);
    } else if (len > 1600) {
      errs.push(`${dw}: content exceeds 1600 chars but does not declare requiresContractCap`);
    }
    if (cap.injectionPayloadOffsetU16 !== undefined) {
      if (!Number.isInteger(cap.injectionPayloadOffsetU16) || cap.injectionPayloadOffsetU16 < 0 || cap.injectionPayloadOffsetU16 >= len) {
        errs.push(`${dw}: injectionPayloadOffsetU16 out of range`);
      }
      if ((c.reference.injectionPatterns ?? []).length === 0) {
        errs.push(`${dw}: injectionPayloadOffsetU16 requires reference.injectionPatterns`);
      }
    }
    if (cap.nearDupePairId !== undefined) {
      const partner = docById.get(cap.nearDupePairId);
      if (cap.nearDupePairId === d.docId || partner === undefined) {
        errs.push(`${dw}: nearDupePairId must cite another doc in this case`);
      } else if (partner.capacity?.nearDupePairId !== d.docId) {
        errs.push(`${dw}: near-dupe pair is asymmetric (doc ${cap.nearDupePairId} does not declare ${d.docId} back)`);
      }
    }
    if (cap.quietControl === true && (expectedByDoc.get(d.docId) ?? []).length > 0) {
      errs.push(`${dw}: quietControl doc must expect zero claims`);
    }
  }

  for (const e of c.reference.expected) {
    const doc = docById.get(e.docId);
    for (const cl of e.claims ?? []) {
      if (cl.capacity === undefined) continue;
      const cw = `${w}: expected claim on doc ${e.docId} capacity`;
      if (!checkAllowedKeys(errs, cw, cl.capacity, ["positionBucket", "charOffsetU16", "factKey"])) continue;
      const cc = cl.capacity;
      const len = typeof doc?.content === "string" ? doc.content.length : 0;
      if (!Number.isInteger(cc.charOffsetU16) || cc.charOffsetU16 < 0 || cc.charOffsetU16 >= len) {
        errs.push(`${cw}: charOffsetU16 out of range for doc ${e.docId} (${len})`);
      } else if (cc.positionBucket !== positionBucketForOffset(cc.charOffsetU16)) {
        errs.push(`${cw}: positionBucket ${cc.positionBucket} != positionBucketForOffset(${cc.charOffsetU16})`);
      }
      if (cc.factKey !== undefined) {
        const keys = new Set((doc?.capacity?.facts ?? []).map((f) => f.key));
        if (!keys.has(cc.factKey)) errs.push(`${cw}: factKey "${cc.factKey}" not declared in doc ${e.docId} capacity.facts`);
      }
    }
  }

  if (c.capacityMeta !== undefined) {
    const mw = `${w}: capacityMeta`;
    if (checkAllowedKeys(errs, mw, c.capacityMeta, ["minMapContentChars", "fictionalPersons", "fictionalOrgs"])) {
      const m = c.capacityMeta;
      if (m.minMapContentChars !== undefined && (!Number.isInteger(m.minMapContentChars) || m.minMapContentChars < 200 || m.minMapContentChars > 6000)) {
        errs.push(`${mw}: minMapContentChars must be an integer in 200..6000`);
      }
      checkFictionalList(errs, `${mw}.fictionalPersons`, m.fictionalPersons);
      checkFictionalList(errs, `${mw}.fictionalOrgs`, m.fictionalOrgs);
    }
  }
  // the applicability authority is case-level and must equal the per-doc max —
  // a doc requirement without the case declaration (or a mismatch) is an error
  if (maxRequired !== undefined && c.capacityMeta?.minMapContentChars !== maxRequired) {
    errs.push(`${w}: capacityMeta.minMapContentChars must equal the max doc requiredMapContentChars (${maxRequired})`);
  }
  if (c.capacityMeta?.minMapContentChars !== undefined && maxRequired === undefined) {
    errs.push(`${w}: capacityMeta.minMapContentChars declared but no doc declares requiredMapContentChars`);
  }
}

function validateDigestCapacityMeta(errs: string[], c: DigestEvalCase): void {
  const w = `case ${c.id}: capacityMeta`;
  if (!checkAllowedKeys(errs, w, c.capacityMeta, [
    "exactReduceGroupsFed", "decisiveEvents", "lateClaimIds", "fictionalPersons", "fictionalOrgs",
  ])) return;
  const m = c.capacityMeta as DigestCaseCapacityMeta;
  const claims = Array.isArray(c.input.claims) ? c.input.claims : [];
  if (m.exactReduceGroupsFed !== undefined) {
    // the production clamp in synthesize.ts reduceGroupsFed() is 50..400 — an
    // out-of-clamp requirement could never be applied, so it fails validation
    if (!Number.isInteger(m.exactReduceGroupsFed) || m.exactReduceGroupsFed < 50 || m.exactReduceGroupsFed > 400) {
      errs.push(`${w}: exactReduceGroupsFed must be an integer in 50..400 (the production clamp)`);
    }
  }
  for (const ev of m.decisiveEvents ?? []) {
    const ew = `${w} decisiveEvents`;
    if (!checkAllowedKeys(errs, ew, ev, ["rank", "titlePattern"])) continue;
    if (!Number.isInteger(ev.rank) || ev.rank < 1 || ev.rank > claims.length) {
      errs.push(`${ew}: rank ${String(ev.rank)} out of range 1..${claims.length}`);
    }
    if (!compileOk(ev.titlePattern)) errs.push(`${ew}: titlePattern does not compile: ${String(ev.titlePattern)}`);
  }
  if (m.lateClaimIds !== undefined) {
    const ids = new Set(claims.map((cl) => cl.id));
    for (const id of m.lateClaimIds) {
      if (!ids.has(id)) errs.push(`${w}: lateClaimIds cites unknown claim id ${String(id)}`);
    }
  }
  checkFictionalList(errs, `${w}.fictionalPersons`, m.fictionalPersons);
  checkFictionalList(errs, `${w}.fictionalOrgs`, m.fictionalOrgs);
}

function validateMapCase(errs: string[], c: MapEvalCase, limits: ContractLimits): void {
  const w = `case ${c.id}`;
  const input = c.input as unknown;
  const mapInput = input as MapEvalInput | undefined;
  if (!isRecord(input) || !Array.isArray(mapInput?.docs) || mapInput.docs.length === 0) {
    errs.push(`${w}: input.docs must be a non-empty array`);
    return;
  }
  if (!["military", "elite_politics", "nuclear"].includes(c.input.track)) {
    errs.push(`${w}: input.track invalid: ${c.input.track}`);
  }
  const docIds = new Set<number>();
  for (const d of c.input.docs) {
    if (typeof d.docId !== "number") errs.push(`${w}: doc missing numeric docId`);
    else if (docIds.has(d.docId)) errs.push(`${w}: duplicate docId ${d.docId}`);
    else docIds.add(d.docId);
    if (typeof d.content !== "string" || d.content.length === 0) errs.push(`${w}: doc ${d.docId} has no content`);
    if (typeof d.content === "string" && d.content.length > limits.maxMapDocChars) {
      errs.push(
        `${w}: doc ${d.docId} content exceeds ${limits.maxMapDocChars} chars` +
          (limits.allowCapacityMeta
            ? " (the contractVersion-2 dataset safety ceiling)"
            : " (synthetic snippets stay short; graded capacity docs need contractVersion 2)"),
      );
    }
    if (!limits.allowCapacityMeta && d.capacity !== undefined) {
      errs.push(`${w}: doc ${d.docId} capacity metadata requires contractVersion 2`);
    }
    if (typeof d.day !== "string" || !DAY_RE.test(d.day)) errs.push(`${w}: doc ${d.docId} day must be yyyy-mm-dd`);
    if (typeof d.lang !== "string") errs.push(`${w}: doc ${d.docId} missing lang`);
  }
  const ref = c.reference;
  if (!isRecord(ref) || !Array.isArray(ref.expected)) {
    errs.push(`${w}: reference.expected must be an array`);
    return;
  }
  const expectedIds = new Set<number>();
  for (const e of ref.expected) {
    if (!docIds.has(e.docId)) errs.push(`${w}: reference.expected cites docId ${e.docId} not in input`);
    if (expectedIds.has(e.docId)) errs.push(`${w}: reference.expected repeats docId ${e.docId}`);
    expectedIds.add(e.docId);
    if (!Array.isArray(e.claims)) {
      errs.push(`${w}: reference.expected[${e.docId}].claims must be an array`);
      continue;
    }
    for (const cl of e.claims) {
      if (typeof cl.textGist !== "string" || cl.textGist.length === 0) {
        errs.push(`${w}: expected claim on doc ${e.docId} missing textGist`);
      }
      if (!HEDGINGS.has(cl.hedging)) errs.push(`${w}: expected claim on doc ${e.docId} invalid hedging ${cl.hedging}`);
      if (!limits.allowCapacityMeta && cl.capacity !== undefined) {
        errs.push(`${w}: expected claim on doc ${e.docId} capacity metadata requires contractVersion 2`);
      }
      // SCI-3b gist discipline: numericValues cannot read compound
      // number-words, so a checkNumerals case with one in a gist would assert
      // the wrong values — rejected up front (any contract version; no v1
      // case sets the flag, so v1 behavior is unchanged)
      if (ref.checkNumerals === true && typeof cl.textGist === "string") {
        for (const e2 of gistNumeralStyleErrors(cl.textGist)) {
          errs.push(`${w}: expected claim on doc ${e.docId} textGist: ${e2}`);
        }
      }
    }
  }
  for (const dId of docIds) {
    if (!expectedIds.has(dId)) {
      errs.push(`${w}: reference.expected must cover every input doc (missing docId ${dId})`);
    }
  }
  checkPatternList(errs, `${w}: reference.mustMatch`, ref.mustMatch);
  checkPatternList(errs, `${w}: reference.mustNotMatch`, ref.mustNotMatch);
  checkPatternList(errs, `${w}: reference.injectionPatterns`, ref.injectionPatterns);
  const off = c.offline as unknown;
  const fix = off as MapOfflineFixture | undefined;
  if (!isRecord(off) || typeof fix?.fixtureId !== "string" || typeof fix?.rawOutput !== "string") {
    errs.push(`${w}: offline fixture must carry fixtureId + rawOutput`);
  } else if (!["pass", "fail"].includes(fix.expectation)) {
    errs.push(`${w}: offline.expectation must be "pass" or "fail"`);
  }
  if (limits.allowCapacityMeta) {
    validateMapCapacity(errs, c);
  } else if (c.capacityMeta !== undefined) {
    errs.push(`${w}: capacityMeta requires contractVersion 2`);
  }
}

function validateReduceClaims(errs: string[], w: string, claims: unknown): claims is ReduceClaim[] {
  if (!Array.isArray(claims) || claims.length === 0) {
    errs.push(`${w}: input.claims must be a non-empty array`);
    return false;
  }
  const ids = new Set<number>();
  for (const cl of claims as ReduceClaim[]) {
    if (typeof cl.id !== "number") errs.push(`${w}: claim missing numeric id`);
    else if (ids.has(cl.id)) errs.push(`${w}: duplicate claim id ${cl.id}`);
    else ids.add(cl.id);
    if (typeof cl.docId !== "number") errs.push(`${w}: claim ${cl.id} missing docId`);
    if (typeof cl.textEn !== "string" || cl.textEn.length === 0) errs.push(`${w}: claim ${cl.id} missing textEn`);
    if (!HEDGINGS.has(cl.hedging)) errs.push(`${w}: claim ${cl.id} invalid hedging ${cl.hedging}`);
    if (cl.claimType !== "factual" && cl.claimType !== "assessment") {
      errs.push(`${w}: claim ${cl.id} invalid claimType ${cl.claimType}`);
    }
    if (typeof cl.claimDate !== "string" || !DAY_RE.test(cl.claimDate)) {
      errs.push(`${w}: claim ${cl.id} claimDate must be yyyy-mm-dd`);
    }
    if (!Array.isArray(cl.entities)) errs.push(`${w}: claim ${cl.id} entities must be an array`);
  }
  return true;
}

function validateReduceCase(errs: string[], c: ReduceEvalCase): void {
  const w = `case ${c.id}`;
  if (!isRecord(c.input)) {
    errs.push(`${w}: input must be an object`);
    return;
  }
  const claimsOk = validateReduceClaims(errs, w, c.input.claims);
  const claimIds = new Set(claimsOk ? c.input.claims.map((cl) => cl.id) : []);
  const ref = c.reference;
  for (const list of [ref.expectTogether, ref.expectApart]) {
    for (const pair of list ?? []) {
      if (!Array.isArray(pair) || pair.length !== 2) errs.push(`${w}: expect pair must be [idA, idB]`);
      else for (const id of pair) if (!claimIds.has(id)) errs.push(`${w}: expect pair cites unknown claim id ${id}`);
    }
  }
  for (const g of ref.expectGroups ?? []) {
    if (!claimIds.has(g.memberId)) errs.push(`${w}: expectGroups cites unknown claim id ${g.memberId}`);
    if (g.hedging !== undefined && !HEDGINGS.has(g.hedging)) errs.push(`${w}: expectGroups invalid hedging ${g.hedging}`);
  }
  for (const id of ref.expectMetaDropped ?? []) {
    if (!claimIds.has(id)) errs.push(`${w}: expectMetaDropped cites unknown claim id ${id}`);
  }
  if ((c.input.recencyDocs !== undefined) !== (c.input.recencyAsOf !== undefined)) {
    errs.push(`${w}: recencyDocs and recencyAsOf must be provided together`);
  }
  if (ref.expectRecency !== undefined && c.input.recencyDocs === undefined) {
    errs.push(`${w}: expectRecency requires input.recencyDocs`);
  }
  if (!isRecord(c.offline) || !["pass", "fail"].includes(c.offline.expectation)) {
    errs.push(`${w}: offline.expectation must be "pass" or "fail"`);
  }
}

function validateDigestCase(errs: string[], c: DigestEvalCase, limits: ContractLimits): void {
  const w = `case ${c.id}`;
  if (!isRecord(c.input)) {
    errs.push(`${w}: input must be an object`);
    return;
  }
  if (typeof c.input.date !== "string" || !DAY_RE.test(c.input.date)) {
    errs.push(`${w}: input.date must be yyyy-mm-dd`);
  }
  validateReduceClaims(errs, w, c.input.claims);
  const off = c.offline;
  if (!isRecord(off) || typeof off.fixtureId !== "string" || !Array.isArray(off.votes) || off.votes.length === 0) {
    errs.push(`${w}: offline fixture must carry fixtureId + non-empty votes[]`);
  } else {
    for (let i = 0; i < off.votes.length; i++) {
      if (typeof off.votes[i] !== "string") errs.push(`${w}: offline.votes[${i}] must be a raw JSON string`);
    }
    if (!["pass", "fail"].includes(off.expectation)) errs.push(`${w}: offline.expectation must be "pass" or "fail"`);
  }
  const ref = c.reference;
  checkPatternList(errs, `${w}: reference.expectSurvivingTitles`, ref.expectSurvivingTitles);
  checkPatternList(errs, `${w}: reference.expectDeadTitles`, ref.expectDeadTitles);
  checkPatternList(errs, `${w}: reference.mustMatch`, ref.mustMatch);
  checkPatternList(errs, `${w}: reference.mustNotMatch`, ref.mustNotMatch);
  for (const h of ref.expectHedging ?? []) {
    if (!compileOk(h.textMatch)) errs.push(`${w}: expectHedging textMatch does not compile: ${h.textMatch}`);
    if (!HEDGINGS.has(h.hedging)) errs.push(`${w}: expectHedging invalid hedging ${h.hedging}`);
  }
  if (c.capacityMeta !== undefined) {
    if (!limits.allowCapacityMeta) errs.push(`${w}: capacityMeta requires contractVersion 2`);
    else validateDigestCapacityMeta(errs, c);
  }
}

function validateValidationCase(errs: string[], c: ValidationEvalCase): void {
  const w = `case ${c.id}`;
  if (!isRecord(c.input)) {
    errs.push(`${w}: input must be an object`);
    return;
  }
  if (!Array.isArray(c.input.takeaways)) {
    errs.push(`${w}: input.takeaways must be an array`);
    return;
  }
  const tIdx = new Set<number>();
  for (const t of c.input.takeaways) {
    if (typeof t.index !== "number" || tIdx.has(t.index)) errs.push(`${w}: takeaway index missing/duplicated`);
    tIdx.add(t.index);
    if (typeof t.text !== "string" || t.text.length === 0) errs.push(`${w}: takeaway ${t.index} missing text`);
    if (typeof t.text === "string" && t.text.length > 500) {
      errs.push(`${w}: takeaway ${t.index} exceeds 500 chars (authored takeaway-style texts stay short)`);
    }
  }
  if (!Array.isArray(c.input.claims)) {
    errs.push(`${w}: input.claims must be an array`);
    return;
  }
  const claimIds = new Set<number>();
  for (const cl of c.input.claims) {
    if (typeof cl.claimId !== "number" || claimIds.has(cl.claimId)) errs.push(`${w}: claim id missing/duplicated`);
    claimIds.add(cl.claimId);
    if (typeof cl.text !== "string" || cl.text.length === 0) errs.push(`${w}: claim ${cl.claimId} missing text`);
    if (typeof cl.docCount !== "number") errs.push(`${w}: claim ${cl.claimId} missing docCount`);
  }
  const ref = c.reference;
  if (!Array.isArray(ref.labels)) {
    errs.push(`${w}: reference.labels must be an array (the human ground truth)`);
    return;
  }
  const labelled = new Set<number>();
  for (const l of ref.labels) {
    if (!tIdx.has(l.takeawayIndex)) errs.push(`${w}: label cites unknown takeaway ${l.takeawayIndex}`);
    if (labelled.has(l.takeawayIndex)) errs.push(`${w}: duplicate label for takeaway ${l.takeawayIndex}`);
    labelled.add(l.takeawayIndex);
    if (l.claimId !== null && !claimIds.has(l.claimId)) errs.push(`${w}: label cites unknown claim ${l.claimId}`);
  }
  for (const t of c.input.takeaways) {
    if (!labelled.has(t.index)) errs.push(`${w}: takeaway ${t.index} has no label`);
  }
  for (const m of c.input.llmMatches ?? []) {
    if (!tIdx.has(m.takeawayIndex)) errs.push(`${w}: llmMatches cites unknown takeaway ${m.takeawayIndex}`);
  }
  for (const probes of c.input.theaterProbes ?? []) {
    if (!["ru", "ua", "both"].includes(probes.expect)) errs.push(`${w}: theaterProbes invalid expect ${probes.expect}`);
  }
  if (ref.expectMajority !== undefined && c.input.voteRounds === undefined) {
    errs.push(`${w}: expectMajority requires input.voteRounds`);
  }
  if (!isRecord(c.offline) || !["pass", "fail"].includes(c.offline.expectation)) {
    errs.push(`${w}: offline.expectation must be "pass" or "fail"`);
  }
}

/** Validate one dataset document. Returns precise error messages; [] = valid. */
export function validateAnalysisEvalDataset(
  raw: unknown,
  expectedWorkload?: AnalysisEvalWorkload,
): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["dataset: not an object"];
  const ds = raw as unknown as AnalysisEvalDataset;
  if (typeof ds.datasetVersion !== "string" || ds.datasetVersion.length === 0) {
    errs.push("dataset: missing datasetVersion");
  }
  if (!(ANALYSIS_EVAL_WORKLOADS as readonly string[]).includes(ds.workload)) {
    errs.push(`dataset: invalid workload ${String(ds.workload)}`);
    return errs;
  }
  if (expectedWorkload && ds.workload !== expectedWorkload) {
    errs.push(`dataset: workload ${ds.workload} does not match expected ${expectedWorkload}`);
  }
  if (typeof ds.createdAt !== "string" || Number.isNaN(Date.parse(ds.createdAt))) {
    errs.push("dataset: createdAt must be a valid ISO timestamp");
  }
  // fail closed on unknown contract versions: a future-version file must be
  // rejected loudly, never validated under the wrong limits
  if (ds.contractVersion !== undefined && ds.contractVersion !== 2) {
    errs.push(`dataset: unknown contractVersion ${String(ds.contractVersion)} (absent = v1, 2 = corpus-v2)`);
    return errs;
  }
  const limits = contractLimits(ds);
  if (!Array.isArray(ds.cases) || ds.cases.length === 0) {
    errs.push("dataset: cases must be a non-empty array");
    return errs;
  }
  const ids = new Set<string>();
  for (const c of ds.cases) {
    if (typeof c.id !== "string" || !ID_RE.test(c.id)) {
      errs.push(`case ${String(c.id)}: id must match ${ID_RE}`);
      continue;
    }
    if (ids.has(c.id)) {
      errs.push(`case ${c.id}: duplicate id`);
      continue;
    }
    ids.add(c.id);
    if (c.workload !== ds.workload) errs.push(`case ${c.id}: workload ${c.workload} != dataset workload ${ds.workload}`);
    if (!(EVAL_PARTITIONS as readonly string[]).includes(c.partition)) errs.push(`case ${c.id}: invalid partition ${c.partition}`);
    if (!(EVAL_SPLITS as readonly string[]).includes(c.split)) errs.push(`case ${c.id}: invalid split ${c.split}`);
    if (typeof c.provenance !== "string" || c.provenance.length === 0) errs.push(`case ${c.id}: missing provenance`);
    switch (ds.workload) {
      case "map":
        validateMapCase(errs, c as MapEvalCase, limits);
        break;
      case "reduce":
        validateReduceCase(errs, c as ReduceEvalCase);
        if ((c as unknown as Record<string, unknown>).capacityMeta !== undefined) {
          errs.push(`case ${c.id}: capacityMeta is not defined for the reduce workload`);
        }
        break;
      case "digest":
        validateDigestCase(errs, c as DigestEvalCase, limits);
        break;
      case "validation":
        validateValidationCase(errs, c as ValidationEvalCase);
        if ((c as unknown as Record<string, unknown>).capacityMeta !== undefined) {
          errs.push(`case ${c.id}: capacityMeta is not defined for the validation workload`);
        }
        break;
    }
  }
  return errs;
}
