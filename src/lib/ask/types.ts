import type { RetrievedClaim, RetrievedEntity } from "./retrieve";

// Frozen stage-interface contract for the ASK v2 pipeline (Tier-2+ sprint,
// 2026-07-11). Every pipeline stage — retrieval, rerank, answer, metering, UI —
// builds against these shapes. Field changes here are a supervisor decision,
// not a workstream decision: they ripple across every stage.

/** Deterministic time window parsed from the question — no LLM. Dates are UTC
 *  calendar days, yyyy-mm-dd, both bounds inclusive when present. */
export interface TimeWindow {
  from?: string;
  to?: string;
  /** exact question substring the parser consumed (UI echo; term extraction
   *  must not re-consume it as search terms) */
  matchedPhrase: string;
}

/** Per-paid-call usage, one per pipeline stage. Embedding calls report their
 *  token count as promptTokens with completionTokens 0. */
export interface StageUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

/** One candidate claim flowing pre-rank → rerank → answer.
 *  Superset of the legacy RetrievedClaim so legacy consumers keep working. */
export interface CandidateClaim extends RetrievedClaim {
  /** stored claims.confidence (mean source reliability), null when absent */
  confidence: number | null;
  /** cosine similarity vs the question; null when the vector arm didn't score it */
  vectorScore: number | null;
  /** true when the lexical arm matched this claim */
  lexicalHit: boolean;
  /** semantic × recency-decay × reliability — deterministic pre-rank order and
   *  the rerank-failure fallback order */
  compositeScore: number;
}

/** 'v2-lexical-only' = v2 ran without a vector arm (no key / stub provider /
 *  LLM_DISABLE / no embeddings for the current model) — still deterministic. */
export type RetrievalMode = "legacy" | "v2" | "v2-lexical-only";

export interface RetrievalV2Result {
  /** deduped vector∪lexical union, window-filtered, capped at ASK_CANDIDATES,
   *  ordered compositeScore DESC */
  claims: CandidateClaim[];
  entities: RetrievedEntity[];
  terms: string[];
  window: TimeWindow | null;
  /** window-filtered match count BEFORE the candidate cap — drives the D9
   *  sampled-evidence disclosure */
  totalMatching: number;
  mode: RetrievalMode;
  /** set when the vector arm embedded the question */
  embedUsage?: StageUsage;
}

/** Rerank stage output: candidates in final evidence order. */
export interface RankedEvidence {
  /** top ASK_EVIDENCE_K claims, most relevant first */
  claims: CandidateClaim[];
  /** false = composite-score fallback ordered these (rerank failed, was
   *  disabled, or the candidate pool was already ≤ K) */
  rerankUsed: boolean;
  rerankUsage?: StageUsage;
  /** How many leading `claims` the reranker judged actually relevant to the
   *  question (0..k, validated). Present ONLY when a rerank call succeeded with
   *  the relevance-boundary schema; absent on every fallback path — consumers
   *  must fail OPEN (treat the whole list as potentially relevant) when absent
   *  (Workstream D, 2026-07-13). */
  relevantCount?: number;
}

export type AnswerState = "answered" | "insufficient" | "refused" | "error" | "limit";

/** The one response payload both pipelines return — a strict superset of the
 *  legacy AskAnswer shape, so the page and API route render either pipeline
 *  from the same fields. Legacy runs fill the v2 fields with neutral values
 *  (relatedClaimIds [], window null, sampled false, totalMatching =
 *  evidenceCount, retrievalMode 'legacy'). */
export interface AskAnswerV2 {
  answer: string;
  citedClaimIds: number[];
  evidenceCount: number;
  terms: string[];
  provider: string;
  state: AnswerState;
  /** retrieved-but-uncited claim ids, ranked order, floored at askRelatedMinScore()
   *  (vectorScore == null is always excluded — see related.ts), capped RELATED_MAX
   *  (W4; was an unfiltered top-10, which surfaced off-topic rerank padding) */
  relatedClaimIds: number[];
  window: TimeWindow | null;
  totalMatching: number;
  /** true when totalMatching exceeded the candidate cap — the UI must say the
   *  evidence is a sample, never imply completeness (D9) */
  sampled: boolean;
  retrievalMode: RetrievalMode;
  /** answer-stage usage — same semantics as the legacy usage field, feeds ask_usage */
  usage?: StageUsage;
  /** per-stage breakdown for ask_usage's additive columns */
  usageByStage?: { embed?: StageUsage; rerank?: StageUsage; answer?: StageUsage };
  rerankUsed?: boolean;
  /** pre-rerank candidate pool size (ask_usage.candidates_count) */
  candidatesCount?: number;
  /** OPTIONAL (additive, Workstream D 2026-07-13): the reranker's validated
   *  count of genuinely relevant evidence rows; 0 = the relevance boundary
   *  stopped the answer stage. Not persisted (no ask_usage column). */
  relevantCount?: number;
  /** models the paid stages actually used (ask_usage.rerank_model/answer_model);
   *  absent when the stage didn't run a paid call */
  rerankModel?: string;
  answerModel?: string;
  /** OPTIONAL (additive, W1): corpus currency — max(claim_date) as yyyy-mm-dd, set
   *  by the v2 path when a currency read succeeded (short-circuit + every
   *  assembleV2/noEvidenceV2 result). Drives the freshness-honest UI callout; absent
   *  on the legacy path and whenever the read returned null. */
  dataCurrentThrough?: string;
  /** OPTIONAL (additive, AI Search Phase 0 2026-07-19; extended Phase 1): the
   *  run's opaque UUID — matches ask_usage.run_id / ask_runs.id so the entry
   *  point (server action / JSON route) can patch its own hydration/wrapper
   *  timing onto exactly this run's row.
   *
   *  PRESENT IFF a persistent record exists for this result: in shadow mode
   *  (ASK_RUNS_ENFORCE off) that means an ask_usage row was written — limit and
   *  gate-unavailable refusals carry NO runId; in enforce mode every path that
   *  created an ask_runs row carries it (including limit/error refusals and
   *  idempotent replays, where it names the ORIGINAL run). Absent on results
   *  that never passed through askWithLimits (the eval runner composes stages
   *  directly). Consumers MUST treat it as optional — never key persistence or
   *  retry logic on its presence (Gate 0 finding: an earlier version of this
   *  comment claimed the opposite of the implementation). Carries no user data
   *  — safe in the client payload. */
  runId?: string;
  /** OPTIONAL (additive, Phase 1): true when this payload was served from a
   *  replayed idempotency key (stored result or a replay refusal). The runId
   *  then names the ORIGINAL run — entry points MUST NOT patch their timing
   *  keys onto it (Gate 1 finding: the replay gesture's timings would overwrite
   *  the original's). */
  replayed?: boolean;
  /** OPTIONAL (additive, AI Search Phase 4): "exact" when this payload was
   *  served from the per-user exact answer cache — $0, zero provider calls,
   *  dataCurrentThrough shows the ORIGINAL answer's currency (the honest
   *  "as of"), and hydration resolves cited evidence from the frozen
   *  EvidenceSnapshot (F11: live claim ids may have churned). */
  cacheStatus?: "exact";
  /** OPTIONAL (additive, release hardening 2026-07-21): false when this run
   *  SHOULD have frozen an EvidenceSnapshot (progressive/session-reuse path)
   *  but its bounded-retry persist ultimately failed; true when it persisted;
   *  absent on paths that freeze no snapshot. Feeds the `durable` verdict and
   *  the exact-cache store policy (an answer whose snapshot is lost must not
   *  be cached or claimed replay-complete). */
  snapshotPersisted?: boolean;
  /** OPTIONAL (additive, release hardening 2026-07-21): the DURABILITY verdict
   *  for a terminal payload under enforce mode. true = the run row finalized
   *  (bounded retry) AND any required snapshot persisted — replay/result are
   *  recoverable. false = persistence ultimately failed: the answer on the
   *  wire is real and billed, but replay durability is NOT claimed (the runs
   *  route then delivers the terminal wire-only instead of persisting a
   *  run.completed event that would contradict the run row). Absent in
   *  shadow/off modes, where no durability was ever promised. */
  durable?: boolean;
}
