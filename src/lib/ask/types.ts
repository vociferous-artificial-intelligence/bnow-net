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
  /** models the paid stages actually used (ask_usage.rerank_model/answer_model);
   *  absent when the stage didn't run a paid call */
  rerankModel?: string;
  answerModel?: string;
  /** OPTIONAL (additive, W1): corpus currency — max(claim_date) as yyyy-mm-dd, set
   *  by the v2 path when a currency read succeeded (short-circuit + every
   *  assembleV2/noEvidenceV2 result). Drives the freshness-honest UI callout; absent
   *  on the legacy path and whenever the read returned null. */
  dataCurrentThrough?: string;
}
