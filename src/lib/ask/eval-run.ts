// Pure, DB/network/LLM-free helpers for the ASK Tier-2+ eval runner
// (scripts/ask-eval.ts, Workstream F2). Everything in this file is deterministic
// and fixture-testable — all I/O (DB reads, retrieveV2/rerankCandidates/ask calls,
// results-file read/write) lives in the script, never here.
//
// References: docs/evals/README.md (eval-set format, "text is the truth" gold
// resolution rule); src/lib/ask/types.ts (frozen AskAnswerV2/RetrievalMode
// contract — legacy runs fill v2 fields with neutral values, so both pipelines'
// answers are scored identically here); src/lib/ask/eval-set.ts (EvalQuestion/
// ClaimRef shapes + normalizedPrefix, landed by Workstream F1);
// docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md §4 (cost heuristics).

import type { AnswerState, AskAnswerV2, RetrievalMode } from "./types";
import {
  normalizedPrefix,
  type ClaimRef,
  type CorpusStats,
  type EvalQuestion,
  type EvalQuestionType,
  type EvalSet,
} from "./eval-set";

// ============================================================================
// Configs
// ============================================================================

export const EVAL_CONFIGS = ["legacy", "v2-k40", "v2-k60", "v2-k100"] as const;
export type EvalConfig = (typeof EVAL_CONFIGS)[number];

export function isEvalConfig(s: string): s is EvalConfig {
  return (EVAL_CONFIGS as readonly string[]).includes(s);
}

export function isV2Config(config: EvalConfig): boolean {
  return config !== "legacy";
}

/** ASK_EVIDENCE_K for a v2 config; null for legacy (fixed top-40 candidates that
 *  double as the evidence set — no separate rerank stage). */
export function configEvidenceK(config: EvalConfig): number | null {
  switch (config) {
    case "v2-k40":
      return 40;
    case "v2-k60":
      return 60;
    case "v2-k100":
      return 100;
    default:
      return null;
  }
}

// ============================================================================
// --estimate cost heuristics
// ============================================================================

/** Per-question cost heuristics for `--estimate`. Rough planning numbers only —
 *  the scorecard's real cost figures come from measured usage/usageByStage.
 *  Sourced from docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md §4: legacy ~
 *  the "Current" row (gpt-4o-mini, keyword retrieval, ~$0.0009/query, rounded up);
 *  v2 ~ the "Tier 2+" row (hybrid retrieval + rerank + gpt-5 answering over top
 *  60, ~$0.014/query) — applied flat across v2-k40/60/100 since the doc gives one
 *  hybrid+gpt-5 figure, not a per-K breakdown (the answer serializes ~K claims of
 *  evidence regardless of which K produced them, so the flat figure is the right
 *  order of magnitude at every K in the sweep). */
export const LEGACY_COST_PER_QUESTION_USD = 0.001;
export const V2_COST_PER_QUESTION_USD = 0.014;

export function estimatedCostPerQuestionUsd(config: EvalConfig): number {
  return isV2Config(config) ? V2_COST_PER_QUESTION_USD : LEGACY_COST_PER_QUESTION_USD;
}

export interface EstimatePlanRow {
  config: EvalConfig;
  questionCount: number;
  perQuestionUsd: number;
  estTotalUsd: number;
}

export function buildEstimatePlan(
  configs: readonly EvalConfig[],
  questionCount: number,
): EstimatePlanRow[] {
  return configs.map((config) => {
    const perQuestionUsd = estimatedCostPerQuestionUsd(config);
    return { config, questionCount, perQuestionUsd, estTotalUsd: perQuestionUsd * questionCount };
  });
}

// ============================================================================
// Gold resolution — TEXT IS THE TRUTH (docs/evals/README.md)
// ============================================================================

export interface LiveClaim {
  id: number;
  text: string;
}

export interface ResolvedGoldEntry {
  claimIdAtHarvest: number;
  id: number;
  method: "exact" | "prefix";
}

export interface GoldResolution {
  resolved: ResolvedGoldEntry[];
  unresolved: ClaimRef[];
}

/** Fallback match window (spec: "normalized-prefix match ~60 chars"). Reuses
 *  eval-set.ts's normalizedPrefix (same lowercase/punctuation-strip the harvest's
 *  own near-dupe detector uses) at a wider prefix than the harvest's 40-char
 *  dedupe window, so a claim edited/retranslated since harvest still resolves
 *  without over-matching genuinely distinct claims. */
export const GOLD_PREFIX_MATCH_CHARS = 60;

/** Re-resolve gold ClaimRefs to LIVE claim ids: exact text match first, then a
 *  normalized-prefix match. Ids are hints only — a stale claimIdAtHarvest is
 *  never trusted directly (digest regeneration deletes/re-inserts claims).
 *  First-match-wins on either index; a live duplicate resolves to whichever row
 *  was seen first, which is harmless since duplicate claim text answers the
 *  question equally well. Anything matching neither index is reported back as
 *  unresolved for the caller to print and exclude from denominators. */
export function resolveGoldRefs(golds: ClaimRef[], liveClaims: LiveClaim[]): GoldResolution {
  const byExactText = new Map<string, LiveClaim>();
  const byPrefix = new Map<string, LiveClaim>();
  for (const c of liveClaims) {
    if (!byExactText.has(c.text)) byExactText.set(c.text, c);
    const p = normalizedPrefix(c.text, GOLD_PREFIX_MATCH_CHARS);
    if (!byPrefix.has(p)) byPrefix.set(p, c);
  }

  const resolved: ResolvedGoldEntry[] = [];
  const unresolved: ClaimRef[] = [];
  for (const g of golds) {
    const exact = byExactText.get(g.text);
    if (exact) {
      resolved.push({ claimIdAtHarvest: g.claimIdAtHarvest, id: exact.id, method: "exact" });
      continue;
    }
    const prefix = byPrefix.get(normalizedPrefix(g.text, GOLD_PREFIX_MATCH_CHARS));
    if (prefix) {
      resolved.push({ claimIdAtHarvest: g.claimIdAtHarvest, id: prefix.id, method: "prefix" });
      continue;
    }
    unresolved.push(g);
  }
  return { resolved, unresolved };
}

export interface QuestionGoldResolution {
  ids: number[];
  unresolvedCount: number;
  unresolved: ClaimRef[];
}

/** Convenience wrapper: resolve one question's `gold` array to live ids. Does
 *  NOT resolve `acceptableAlternates` — those exist for supervisor curation, not
 *  automated hit-scoring (spec's metrics are defined strictly against `gold`). */
export function resolveQuestionGold(
  question: EvalQuestion,
  liveClaims: LiveClaim[],
): QuestionGoldResolution {
  const { resolved, unresolved } = resolveGoldRefs(question.gold, liveClaims);
  return { ids: resolved.map((r) => r.id), unresolvedCount: unresolved.length, unresolved };
}

// ============================================================================
// Degraded-run detection
// ============================================================================

/** Providers that mean "no real LLM call happened" — recording metrics from
 *  these would silently grade a degraded pipeline as if it were live. */
const DEGRADED_PROVIDERS = new Set(["stub", "budget"]);

export interface DegradedCheckInput {
  retrievalMode: RetrievalMode;
  provider: string;
  /** whether OPENAI_API_KEY was set for this run — degraded behavior with NO key
   *  at all is expected (nothing to abort on); degraded behavior WITH a key set
   *  means a guard/kill-switch/misconfiguration is silently swallowing the run. */
  openaiKeySet: boolean;
}

/** True when a result must be treated as degraded — the runner aborts the whole
 *  sweep loudly rather than recording it (spec: never record garbage). */
export function isDegradedResult(input: DegradedCheckInput): boolean {
  if (!input.openaiKeySet) return false;
  if (input.retrievalMode === "v2-lexical-only") return true;
  return DEGRADED_PROVIDERS.has(input.provider);
}

// ============================================================================
// Per-question metrics
// ============================================================================

export interface QuestionRunResult {
  question: EvalQuestion;
  /** live ids from resolveQuestionGold */
  resolvedGoldIds: number[];
  unresolvedGoldCount: number;
  /** claimIds from the candidate pool (legacy: retrieve() top-40; v2: retrieveV2().claims) */
  candidateIds: number[];
  /** claimIds from the evidence set handed to the answer stage (legacy: same as
   *  candidates; v2: rerankCandidates().claims) */
  evidenceIds: number[];
  answer: AskAnswerV2;
  latencyMs: number;
  /** total per-question cost — legacy: answer.usage?.costUsd ?? 0; v2: sum of
   *  usageByStage (embed + rerank + answer) */
  costUsd: number;
  openaiKeySet: boolean;
}

export interface QuestionMetrics {
  questionId: string;
  type: EvalQuestionType;
  /** non-negative AND at least one gold resolved to a live id */
  answerable: boolean;
  candidateHit: boolean | null;
  evidenceHit: boolean | null;
  cited: boolean | null;
  state: AnswerState;
  windowExpected: { from?: string; to?: string } | undefined;
  /** null when the question has no windowExpected (not a temporal probe, or a
   *  temporal question whose window is deliberately left unspecified) */
  windowCorrect: boolean | null;
  /** null when type !== "negative" */
  negativeHonest: boolean | null;
  unresolvedGoldCount: number;
  costUsd: number;
  latencyMs: number;
  degraded: boolean;
  // -- audit trail (supervisor round 1): enough raw answer context persisted per
  // question that a future metric recalibration (like the negative-honesty one)
  // is auditable/replayable offline, without a paid rerun. Deliberately wider
  // than the honesty lead window (ANSWER_SNIPPET_CHARS > NEGATIVE_DENIAL_LEAD_CHARS).
  /** first ANSWER_SNIPPET_CHARS chars of the answer text, verbatim */
  answerSnippet: string;
  /** answer.citedClaimIds.length (the ids themselves stay in the pipeline) */
  citedClaimIdCount: number;
  /** answer-stage completion tokens (usage.completionTokens); null when the
   *  stage made no paid call — with the snippet, the truncation tell (a cut-off
   *  snippet at max output tokens) survives into the record */
  completionTokens: number | null;
  /** provider verbatim — alongside `state` (already stored verbatim), this is
   *  all the finish/refusal context the frozen AskAnswerV2 contract carries
   *  (there is no finish_reason field; a refusal is state "refused") */
  provider: string;
}

/** Chars of the answer text preserved verbatim in each stored result record. */
export const ANSWER_SNIPPET_CHARS = 400;

// ---- negative-control honesty ---------------------------------------------------

/** Leading window (chars) of the answer scanned for denial language. The verdict
 *  ("there are no entries about X") leads an honest denial; per-claim caveats and
 *  walk-throughs follow it. Scanning only the lead keeps a trailing aside like
 *  "...though evidence on Y is insufficient" inside an otherwise affirmative
 *  answer from scoring as a denial. */
export const NEGATIVE_DENIAL_LEAD_CHARS = 250;

/** Denial-language families (case-insensitive) scanned over the answer lead.
 *  Named + exported so honesty verdicts stay reproducible offline from the
 *  stored answerSnippet (which is longer than the lead window on purpose). */
export const DENIAL_LANGUAGE_PATTERN = new RegExp(
  [
    // "insufficient evidence", "the evidence is insufficient", state-message echoes
    "insufficient",
    // "no entries about", "no evidence of", "no matching evidence", "no reports regarding"
    // (the of/about/regarding preposition is optional by construction — the noun match suffices)
    "\\bno\\s+(?:mention|entries|evidence|matching|reports?|claims?)\\b",
    // "cannot confirm", "can't confirm" (straight or typographic apostrophe), "can not confirm"
    "\\bcan(?:not|['’]t|\\s+not)\\s+confirm\\b",
    // "not found in the provided evidence", "not mentioned in the current dataset"
    "\\bnot\\s+(?:found|present|mentioned)\\s+in\\s+the\\s+(?:provided|supplied|current)\\b",
    // "the corpus does not mention/contain/include ..."
    "\\bdoes\\s+not\\s+(?:mention|contain|include)\\b",
  ].join("|"),
  "i",
);

/** Negative-control honesty verdict — RECALIBRATED (supervisor round 1,
 *  2026-07-11). The original rule required EMPTY citations alongside denial
 *  text, but a live diagnostic showed gpt-5 denying honestly WHILE citing the
 *  claims it checked ("The only Venezuela-related item concerns volunteers...
 *  not sanctions [c1567]") — citing the evidence you examined while denying is
 *  exactly the behavior we want, and the old rule scored both pipelines 0/5 on
 *  that artifact. New rule: honest = state "insufficient" OR the answer's
 *  leading NEGATIVE_DENIAL_LEAD_CHARS chars match DENIAL_LANGUAGE_PATTERN.
 *  Citations are irrelevant to the verdict in both directions. */
export function isNegativeAnswerHonest(state: AnswerState, answerText: string): boolean {
  if (state === "insufficient") return true;
  return DENIAL_LANGUAGE_PATTERN.test(answerText.slice(0, NEGATIVE_DENIAL_LEAD_CHARS));
}

/** windowExpected `{}` (both bounds undefined, used by ambiguous seed templates
 *  like "since last Monday") is satisfied by an answer window that ALSO has both
 *  bounds undefined (including a null window) — a documented, deliberate reading
 *  of the seed's "including 'expected null' if that is the correct/acceptable
 *  outcome" note. */
function windowMatches(
  actual: AskAnswerV2["window"],
  expected: { from?: string; to?: string },
): boolean {
  return (actual?.from ?? undefined) === expected.from && (actual?.to ?? undefined) === expected.to;
}

export function computeQuestionMetrics(r: QuestionRunResult): QuestionMetrics {
  const { question, resolvedGoldIds, candidateIds, evidenceIds, answer } = r;
  const isNegative = question.type === "negative";
  const answerable = !isNegative && resolvedGoldIds.length > 0;
  const goldSet = new Set(resolvedGoldIds);

  const candidateHit = answerable ? candidateIds.some((id) => goldSet.has(id)) : null;
  const evidenceHit = answerable ? evidenceIds.some((id) => goldSet.has(id)) : null;
  const cited = answerable ? answer.citedClaimIds.some((id) => goldSet.has(id)) : null;
  const windowCorrect =
    question.windowExpected !== undefined ? windowMatches(answer.window, question.windowExpected) : null;
  const negativeHonest = isNegative ? isNegativeAnswerHonest(answer.state, answer.answer) : null;
  const degraded = isDegradedResult({
    retrievalMode: answer.retrievalMode,
    provider: answer.provider,
    openaiKeySet: r.openaiKeySet,
  });

  return {
    questionId: question.id,
    type: question.type,
    answerable,
    candidateHit,
    evidenceHit,
    cited,
    state: answer.state,
    windowExpected: question.windowExpected,
    windowCorrect,
    negativeHonest,
    unresolvedGoldCount: r.unresolvedGoldCount,
    costUsd: r.costUsd,
    latencyMs: r.latencyMs,
    degraded,
    answerSnippet: answer.answer.slice(0, ANSWER_SNIPPET_CHARS),
    citedClaimIdCount: answer.citedClaimIds.length,
    completionTokens: answer.usage?.completionTokens ?? null,
    provider: answer.provider,
  };
}

// ============================================================================
// Results-file resume (MR3 lesson: resumable-by-key)
// ============================================================================

export interface StoredQuestionResult {
  questionId: string;
  metrics: QuestionMetrics;
}

export interface ResultsFile {
  config: EvalConfig;
  evalSetPath: string;
  /** DB host the run executed against (host only, never the connection string
   *  with credentials) — captured at run time so `--report` can print branch
   *  metadata without needing a live DATABASE_URL of its own. */
  dbHost: string;
  updatedAt: string;
  /** keyed by questionId — the config is fixed per file, so the key doesn't need
   *  to repeat it (one results-<config>.json per config, per the spec). */
  results: Record<string, StoredQuestionResult>;
}

export function emptyResultsFile(config: EvalConfig, evalSetPath: string, dbHost: string): ResultsFile {
  return { config, evalSetPath, dbHost, updatedAt: new Date(0).toISOString(), results: {} };
}

/** Merge freshly-completed question results into an existing (or absent) results
 *  file. Additions win on questionId collision (a --fresh rerun of one question
 *  replaces its stale entry); everything else already recorded is preserved.
 *  `dbHost` reflects THIS call's run (the current host wins even across a resume
 *  — a results file always reports the host its most recent run actually hit). */
export function mergeResults(
  existing: ResultsFile | null,
  config: EvalConfig,
  evalSetPath: string,
  dbHost: string,
  additions: StoredQuestionResult[],
  now: Date = new Date(),
): ResultsFile {
  const results: Record<string, StoredQuestionResult> = { ...(existing?.results ?? {}) };
  for (const a of additions) results[a.questionId] = a;
  return { config, evalSetPath, dbHost, updatedAt: now.toISOString(), results };
}

/** Which questions still need a run. `fresh=true` (the --fresh flag) reruns
 *  everything and ignores any existing results file. */
export function pendingQuestions(
  evalSet: EvalSet,
  existing: ResultsFile | null,
  fresh: boolean,
): EvalQuestion[] {
  if (fresh || !existing) return evalSet.questions.slice();
  const done = new Set(Object.keys(existing.results));
  return evalSet.questions.filter((q) => !done.has(q.id));
}

/** Targeted-rerun selection (the --only flag): run EXACTLY the listed question
 *  ids, always rerunning them even when already recorded (mergeResults replaces
 *  their entries on collision), leaving every other stored result untouched.
 *  Built for metric recalibrations — e.g. after the negative-honesty round-1 fix,
 *  only the 5 negative controls need a paid rerun, not the whole sweep. Unknown
 *  ids are returned for the caller to print and refuse on (no silent caps). */
export function selectOnlyQuestions(
  evalSet: EvalSet,
  onlyIds: string[],
): { selected: EvalQuestion[]; unknownIds: string[] } {
  const byId = new Map(evalSet.questions.map((q) => [q.id, q]));
  const selected: EvalQuestion[] = [];
  const unknownIds: string[] = [];
  const seen = new Set<string>();
  for (const id of onlyIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const q = byId.get(id);
    if (q) selected.push(q);
    else unknownIds.push(id);
  }
  return { selected, unknownIds };
}

// ============================================================================
// Aggregation
// ============================================================================

export interface RatioStat {
  hit: number;
  denom: number;
  /** NaN when denom is 0 — callers must render "—", never silently show 0%. */
  pct: number;
}

function ratio(hit: number, denom: number): RatioStat {
  return { hit, denom, pct: denom > 0 ? (100 * hit) / denom : NaN };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

function p50(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface ConfigAggregate {
  config: EvalConfig;
  k: number | null;
  totalQuestions: number;
  answerableQuestions: number;
  negativeQuestions: number;
  /** candidate-pool recall (@300 for v2, @40 for legacy — for legacy this IS the
   *  evidence recall too, since legacy has no separate rerank stage). */
  candidateRecall: RatioStat;
  /** evidence-set recall (@K for v2, @40 for legacy). */
  evidenceRecall: RatioStat;
  citation: {
    citedCount: number;
    allAnswerableDenom: number;
    evidenceFoundDenom: number;
    /** NaN when the denominator is 0. */
    pctOfAllAnswerable: number;
    pctOfEvidenceFound: number;
  };
  negativeHonesty: { honest: number; total: number; fraction: number };
  windowEcho: RatioStat;
  cost: { meanUsd: number; p50Usd: number };
  latency: { meanMs: number; p50Ms: number };
  /** sum across all questions of gold entries present but unresolved by text —
   *  reported, never silently dropped. */
  unresolvedGoldCount: number;
  /** should be 0 in any persisted results file — the runner aborts a live sweep
   *  the moment it detects one rather than recording it (spec: no silent caps). */
  degradedRunCount: number;
  /** non-negative questions with a curated `gold: []` (not yet fillable) —
   *  distinct from "unresolved": these were never attempted, not attempted-and-missed. */
  questionsWithoutGold: number;
}

export function aggregateConfig(config: EvalConfig, metrics: QuestionMetrics[]): ConfigAggregate {
  const answerable = metrics.filter((m) => m.answerable);
  const negatives = metrics.filter((m) => m.type === "negative");
  const candidateHits = answerable.filter((m) => m.candidateHit === true).length;
  const evidenceHits = answerable.filter((m) => m.evidenceHit === true).length;
  const citedCount = answerable.filter((m) => m.cited === true).length;
  const evidenceFoundCount = evidenceHits;
  const honestCount = negatives.filter((m) => m.negativeHonest === true).length;
  const windowApplicable = metrics.filter((m) => m.windowCorrect !== null);
  const windowCorrectCount = windowApplicable.filter((m) => m.windowCorrect === true).length;
  const costs = metrics.map((m) => m.costUsd);
  const latencies = metrics.map((m) => m.latencyMs);
  const unresolvedGoldCount = metrics.reduce((s, m) => s + m.unresolvedGoldCount, 0);
  const questionsWithoutGold = metrics.filter(
    (m) => m.type !== "negative" && !m.answerable && m.unresolvedGoldCount === 0,
  ).length;
  const degradedRunCount = metrics.filter((m) => m.degraded).length;

  return {
    config,
    k: configEvidenceK(config),
    totalQuestions: metrics.length,
    answerableQuestions: answerable.length,
    negativeQuestions: negatives.length,
    candidateRecall: ratio(candidateHits, answerable.length),
    evidenceRecall: ratio(evidenceHits, answerable.length),
    citation: {
      citedCount,
      allAnswerableDenom: answerable.length,
      evidenceFoundDenom: evidenceFoundCount,
      pctOfAllAnswerable: answerable.length > 0 ? (100 * citedCount) / answerable.length : NaN,
      pctOfEvidenceFound: evidenceFoundCount > 0 ? (100 * citedCount) / evidenceFoundCount : NaN,
    },
    negativeHonesty: {
      honest: honestCount,
      total: negatives.length,
      fraction: negatives.length > 0 ? honestCount / negatives.length : NaN,
    },
    windowEcho: ratio(windowCorrectCount, windowApplicable.length),
    cost: { meanUsd: mean(costs), p50Usd: p50(costs) },
    latency: { meanMs: mean(latencies), p50Ms: p50(latencies) },
    unresolvedGoldCount,
    degradedRunCount,
    questionsWithoutGold,
  };
}

export function aggregateFromResultsFile(rf: ResultsFile): ConfigAggregate {
  return aggregateConfig(
    rf.config,
    Object.values(rf.results).map((r) => r.metrics),
  );
}

// ============================================================================
// K-sensitivity table
// ============================================================================

export interface KSensitivityRow {
  config: EvalConfig;
  k: number;
  evidenceRecallPct: number;
  citationAccuracyEvidenceFoundPct: number;
  meanCostUsd: number;
  meanLatencyMs: number;
}

export function buildKSensitivityTable(aggregates: ConfigAggregate[]): KSensitivityRow[] {
  return aggregates
    .filter((a): a is ConfigAggregate & { k: number } => a.k !== null)
    .slice()
    .sort((a, b) => a.k - b.k)
    .map((a) => ({
      config: a.config,
      k: a.k,
      evidenceRecallPct: a.evidenceRecall.pct,
      citationAccuracyEvidenceFoundPct: a.citation.pctOfEvidenceFound,
      meanCostUsd: a.cost.meanUsd,
      meanLatencyMs: a.latency.meanMs,
    }));
}

// ============================================================================
// D4 gate
// ============================================================================

/** D4 gate threshold: v2-k60 evidence recall must beat legacy's recall@40 by at
 *  least this many PERCENTAGE POINTS. Convention (spec: "exactly +15.0 = pass"):
 *  the comparison is ">=", so a measured delta of exactly 15.0 PASSES. */
export const GATE_RECALL_DELTA_THRESHOLD_PTS = 15.0;

/** D4 gate threshold for negative-control honesty, expressed as a fraction so it
 *  generalizes past the curated eval set's specific negative count (spec's
 *  literal ">= 4/5" = 0.8 at N=5; kept as a fraction so the same test applies
 *  cleanly if the curated negative-control count ever changes). */
export const GATE_NEGATIVE_HONESTY_FRACTION_THRESHOLD = 0.8;

export interface GateResult {
  recallDeltaPts: number;
  recallPass: boolean;
  negativeHonestyCount: number;
  negativeHonestyTotal: number;
  negativeHonestyFraction: number;
  negativeHonestyPass: boolean;
  citationAllAnswerablePctLegacy: number;
  citationAllAnswerablePctV2k60: number;
  citationEvidenceFoundPctLegacy: number;
  citationEvidenceFoundPctV2k60: number;
  citationAccuracyPass: boolean;
  overallPass: boolean;
}

/** The D4 gate: hybrid (v2-k60) evidence recall vs legacy keyword recall@40,
 *  +15pts absolute; negative-control honesty >= 4/5 (measured on v2-k60, the
 *  config being gated in); citation accuracy not worse. "Not worse" is checked
 *  on BOTH reported denominators (cited/all-answerable and cited/evidence-found)
 *  since the spec names both without picking one as canonical — conservative:
 *  v2-k60 must not regress on either. A NaN legacy denominator (nothing
 *  answerable/evidence-found at all) can't be regressed against, so that leg is
 *  vacuously true rather than blocking the gate on a data gap. */
export function computeGate(legacy: ConfigAggregate, v2k60: ConfigAggregate): GateResult {
  const recallDeltaPts = v2k60.evidenceRecall.pct - legacy.evidenceRecall.pct;
  const recallPass = recallDeltaPts >= GATE_RECALL_DELTA_THRESHOLD_PTS;

  const negativeHonestyCount = v2k60.negativeHonesty.honest;
  const negativeHonestyTotal = v2k60.negativeHonesty.total;
  const negativeHonestyFraction = v2k60.negativeHonesty.fraction;
  const negativeHonestyPass =
    negativeHonestyTotal > 0 && negativeHonestyFraction >= GATE_NEGATIVE_HONESTY_FRACTION_THRESHOLD;

  const citationAllAnswerablePctLegacy = legacy.citation.pctOfAllAnswerable;
  const citationAllAnswerablePctV2k60 = v2k60.citation.pctOfAllAnswerable;
  const citationEvidenceFoundPctLegacy = legacy.citation.pctOfEvidenceFound;
  const citationEvidenceFoundPctV2k60 = v2k60.citation.pctOfEvidenceFound;
  const citationAccuracyPass =
    (Number.isNaN(citationAllAnswerablePctLegacy) ||
      citationAllAnswerablePctV2k60 >= citationAllAnswerablePctLegacy) &&
    (Number.isNaN(citationEvidenceFoundPctLegacy) ||
      citationEvidenceFoundPctV2k60 >= citationEvidenceFoundPctLegacy);

  return {
    recallDeltaPts,
    recallPass,
    negativeHonestyCount,
    negativeHonestyTotal,
    negativeHonestyFraction,
    negativeHonestyPass,
    citationAllAnswerablePctLegacy,
    citationAllAnswerablePctV2k60,
    citationEvidenceFoundPctLegacy,
    citationEvidenceFoundPctV2k60,
    citationAccuracyPass,
    overallPass: recallPass && negativeHonestyPass && citationAccuracyPass,
  };
}

// ============================================================================
// Scorecard markdown (docs/evals/ASK-EVAL-2026-07-11.md)
// ============================================================================

export interface QuestionDetailRow {
  config: EvalConfig;
  questionId: string;
  type: EvalQuestionType;
  candidateHit: boolean | null;
  evidenceHit: boolean | null;
  cited: boolean | null;
  state: AnswerState;
  costUsd: number;
}

export function toDetailRows(config: EvalConfig, metrics: QuestionMetrics[]): QuestionDetailRow[] {
  return metrics
    .slice()
    .sort((a, b) => (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0))
    .map((m) => ({
      config,
      questionId: m.questionId,
      type: m.type,
      candidateHit: m.candidateHit,
      evidenceHit: m.evidenceHit,
      cited: m.cited,
      state: m.state,
      costUsd: m.costUsd,
    }));
}

export interface RunMetadata {
  generatedAt: string;
  evalSetPath: string;
  evalSetCreatedAt: string;
  corpus: CorpusStats;
  /** DB host only — NEVER the connection string (credentials). */
  dbHost: string;
  configsRun: EvalConfig[];
}

function pctStr(x: number): string {
  return Number.isNaN(x) ? "—" : `${x.toFixed(1)}%`;
}
function usdStr(x: number): string {
  return Number.isNaN(x) ? "—" : `$${x.toFixed(4)}`;
}
function msStr(x: number): string {
  return Number.isNaN(x) ? "—" : `${Math.round(x)}ms`;
}
function boolStr(b: boolean | null): string {
  return b === null ? "n/a" : b ? "yes" : "no";
}
function passStr(b: boolean): string {
  return b ? "PASS" : "FAIL";
}

export function renderScorecardMarkdown(input: {
  meta: RunMetadata;
  aggregates: ConfigAggregate[];
  kSensitivity: KSensitivityRow[];
  gate: GateResult | null;
  detailRows: QuestionDetailRow[];
}): string {
  const { meta, aggregates, kSensitivity, gate, detailRows } = input;
  const lines: string[] = [];

  lines.push(`# ASK eval scorecard — ${meta.generatedAt}`);
  lines.push("");
  lines.push(
    `Eval set: \`${meta.evalSetPath}\` (created ${meta.evalSetCreatedAt}). ` +
      `Corpus: ${meta.corpus.claimCount} claims, ${meta.corpus.minDate ?? "?"} .. ${meta.corpus.maxDate ?? "?"}. ` +
      `DB host: \`${meta.dbHost}\`. Configs run: ${meta.configsRun.join(", ") || "(none)"}.`,
  );
  lines.push("");

  lines.push("## Headline: legacy vs v2-k60");
  lines.push("");
  const legacy = aggregates.find((a) => a.config === "legacy") ?? null;
  const v2k60 = aggregates.find((a) => a.config === "v2-k60") ?? null;
  if (legacy && v2k60) {
    lines.push("| metric | legacy | v2-k60 |");
    lines.push("|---|---|---|");
    lines.push(`| questions | ${legacy.totalQuestions} | ${v2k60.totalQuestions} |`);
    lines.push(`| answerable questions | ${legacy.answerableQuestions} | ${v2k60.answerableQuestions} |`);
    lines.push(
      `| candidate recall (hit/denom) | ${pctStr(legacy.candidateRecall.pct)} (${legacy.candidateRecall.hit}/${legacy.candidateRecall.denom}) ` +
        `| ${pctStr(v2k60.candidateRecall.pct)} (${v2k60.candidateRecall.hit}/${v2k60.candidateRecall.denom}) |`,
    );
    lines.push(
      `| evidence recall @${legacy.k ?? 40} vs @${v2k60.k ?? 60} | ${pctStr(legacy.evidenceRecall.pct)} (${legacy.evidenceRecall.hit}/${legacy.evidenceRecall.denom}) ` +
        `| ${pctStr(v2k60.evidenceRecall.pct)} (${v2k60.evidenceRecall.hit}/${v2k60.evidenceRecall.denom}) |`,
    );
    lines.push(
      `| citation accuracy (cited/all-answerable) | ${pctStr(legacy.citation.pctOfAllAnswerable)} (${legacy.citation.citedCount}/${legacy.citation.allAnswerableDenom}) ` +
        `| ${pctStr(v2k60.citation.pctOfAllAnswerable)} (${v2k60.citation.citedCount}/${v2k60.citation.allAnswerableDenom}) |`,
    );
    lines.push(
      `| citation accuracy (cited/evidence-found) | ${pctStr(legacy.citation.pctOfEvidenceFound)} (${legacy.citation.citedCount}/${legacy.citation.evidenceFoundDenom}) ` +
        `| ${pctStr(v2k60.citation.pctOfEvidenceFound)} (${v2k60.citation.citedCount}/${v2k60.citation.evidenceFoundDenom}) |`,
    );
    lines.push(
      `| negative honesty | ${legacy.negativeHonesty.honest}/${legacy.negativeHonesty.total} | ${v2k60.negativeHonesty.honest}/${v2k60.negativeHonesty.total} |`,
    );
    lines.push(
      `| window echo correctness | ${pctStr(legacy.windowEcho.pct)} (${legacy.windowEcho.hit}/${legacy.windowEcho.denom}) ` +
        `| ${pctStr(v2k60.windowEcho.pct)} (${v2k60.windowEcho.hit}/${v2k60.windowEcho.denom}) |`,
    );
    lines.push(
      `| cost/question mean (p50) | ${usdStr(legacy.cost.meanUsd)} (${usdStr(legacy.cost.p50Usd)}) | ${usdStr(v2k60.cost.meanUsd)} (${usdStr(v2k60.cost.p50Usd)}) |`,
    );
    lines.push(
      `| latency/question mean (p50) | ${msStr(legacy.latency.meanMs)} (${msStr(legacy.latency.p50Ms)}) | ${msStr(v2k60.latency.meanMs)} (${msStr(v2k60.latency.p50Ms)}) |`,
    );
    lines.push(`| unresolved gold | ${legacy.unresolvedGoldCount} | ${v2k60.unresolvedGoldCount} |`);
    lines.push(`| questions with no gold yet | ${legacy.questionsWithoutGold} | ${v2k60.questionsWithoutGold} |`);
    lines.push(`| degraded-run count | ${legacy.degradedRunCount} | ${v2k60.degradedRunCount} |`);
    lines.push("");
  } else {
    lines.push(
      `_headline table skipped — need both "legacy" and "v2-k60" results (have: ${aggregates.map((a) => a.config).join(", ") || "none"})._`,
    );
    lines.push("");
  }

  lines.push("## K sweep (v2-k40 / v2-k60 / v2-k100)");
  lines.push("");
  if (kSensitivity.length > 0) {
    lines.push(
      "| config | K | evidence recall | citation accuracy (evidence-found) | mean cost/question | mean latency/question |",
    );
    lines.push("|---|---|---|---|---|---|");
    for (const row of kSensitivity) {
      lines.push(
        `| ${row.config} | ${row.k} | ${pctStr(row.evidenceRecallPct)} | ${pctStr(row.citationAccuracyEvidenceFoundPct)} ` +
          `| ${usdStr(row.meanCostUsd)} | ${msStr(row.meanLatencyMs)} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("_no v2 configs run._");
    lines.push("");
  }

  lines.push("## GATE (D4)");
  lines.push("");
  if (gate) {
    lines.push(
      `GATE: recall-delta ${gate.recallDeltaPts.toFixed(1)}pts (>= ${GATE_RECALL_DELTA_THRESHOLD_PTS} required) = ${passStr(gate.recallPass)}; ` +
        `negative honesty ${gate.negativeHonestyCount}/${gate.negativeHonestyTotal} (>= ${(GATE_NEGATIVE_HONESTY_FRACTION_THRESHOLD * 100).toFixed(0)}% required) = ${passStr(gate.negativeHonestyPass)}; ` +
        `citation accuracy not worse (all-answerable ${gate.citationAllAnswerablePctV2k60.toFixed(1)}% vs ${gate.citationAllAnswerablePctLegacy.toFixed(1)}%; ` +
        `evidence-found ${gate.citationEvidenceFoundPctV2k60.toFixed(1)}% vs ${gate.citationEvidenceFoundPctLegacy.toFixed(1)}%) = ${passStr(gate.citationAccuracyPass)}. ` +
        `OVERALL = ${gate.overallPass ? "PASS" : "FAIL"}.`,
    );
    lines.push("");
  } else {
    lines.push('_GATE not computed — need both "legacy" and "v2-k60" results._');
    lines.push("");
  }

  lines.push("## Per-question detail");
  lines.push("");
  lines.push("| config | question id | type | candidate hit | evidence hit | cited | state | cost |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const row of detailRows) {
    lines.push(
      `| ${row.config} | ${row.questionId} | ${row.type} | ${boolStr(row.candidateHit)} | ${boolStr(row.evidenceHit)} ` +
        `| ${boolStr(row.cited)} | ${row.state} | ${usdStr(row.costUsd)} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}
