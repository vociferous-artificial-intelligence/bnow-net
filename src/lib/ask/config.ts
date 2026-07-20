import { envNum } from "../usage/spend-guard";

// Env-backed knobs for the ASK v2 pipeline. Numeric knobs reuse spend-guard's
// envNum (unset / NaN -> default) and are floored to a positive integer, so a
// bogus env value (0, -1, 1.5) can never produce a nonsensical LIMIT / cap.
// ASK_PIPELINE defaults to v2 (flipped 2026-07-11, D4 eval gate PASSED); every
// other knob is safe to leave at its default.

/** Positive-integer env knob: envNum's default, truncated, floored to >= 1. */
function posInt(name: string, dflt: number): number {
  const n = Math.trunc(envNum(name, dflt));
  return n >= 1 ? n : dflt;
}

/** Non-empty trimmed string env knob (unset / whitespace-only -> default). */
function envStr(name: string, dflt: string): string {
  const v = process.env[name];
  return v !== undefined && v.trim() !== "" ? v.trim() : dflt;
}

/** "legacy" ONLY when ASK_PIPELINE is exactly "legacy"; anything else (incl.
 *  unset) is v2. FLIPPED 2026-07-11 after the D4 eval gate PASSED
 *  (docs/evals/ASK-EVAL-2026-07-11.md: evidence recall 97.0% vs legacy 39.4%,
 *  +57.6pts; negative honesty 5/5; citation accuracy 93.9%/96.9% vs 27.3%/69.2%).
 *  ASK_PIPELINE=legacy is the instant, exact-match rollback to the pre-Tier-2+
 *  keyword pipeline. */
export function askPipeline(): "v2" | "legacy" {
  return process.env.ASK_PIPELINE === "legacy" ? "legacy" : "v2";
}

/** Max deduped candidates the pre-rank keeps (vector union lexical, capped). */
export function askCandidates(): number {
  return posInt("ASK_CANDIDATES", 300);
}

/** Evidence rows handed to the answer stage after rerank (workstream C/D). */
export function askEvidenceK(): number {
  return posInt("ASK_EVIDENCE_K", 60);
}

/** Vector-arm page size (top-N claims by cosine similarity). */
export function askVectorTop(): number {
  return posInt("ASK_VECTOR_TOP", 150);
}

/** Lexical-arm page size (top-N claims by ts_rank). */
export function askLexicalTop(): number {
  return posInt("ASK_LEXICAL_TOP", 150);
}

/** Answer-stage model id (workstream D). */
export function askAnswerModel(): string {
  return envStr("ASK_ANSWER_MODEL", "gpt-5");
}

/** Rerank-stage model id (workstream C). */
export function askRerankModel(): string {
  return envStr("ASK_RERANK_MODEL", "gpt-5-mini");
}

/** No-coverage short-circuit (W1): when a question's parsed time window falls
 *  entirely AFTER the newest claim in the corpus, ask() returns a $0 deterministic
 *  "no claims yet" answer instead of paying for embed + rerank + answer. Default ON.
 *  Rollback: ASK_NO_COVERAGE_SHORTCIRCUIT=0 (also "false"/"off", trimmed +
 *  case-insensitive) restores the always-run-the-pipeline behaviour. */
export function askNoCoverageShortcircuit(): boolean {
  const v = process.env.ASK_NO_COVERAGE_SHORTCIRCUIT?.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}

/** Relevance boundary (Workstream D, 2026-07-13): when the paid rerank reports
 *  relevant_count=0, /ask stops before the answer model and returns an honest
 *  insufficient payload with zero citations. Default ON. Rollback:
 *  ASK_RELEVANCE_BOUNDARY=0 (also "false"/"off") restores always-answering. */
export function askRelevanceBoundaryEnabled(): boolean {
  const v = process.env.ASK_RELEVANCE_BOUNDARY?.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}

/** Minimum evidence rows passed to the answer stage when relevant_count > 0 —
 *  a floor against reranker underestimation on genuinely answerable questions
 *  (the trim never widens beyond the ranked pool). */
export function askRelevantEvidenceFloor(): number {
  return posInt("ASK_RELEVANT_EVIDENCE_FLOOR", 8);
}

/** Phase 3 Increment B: buffered validated answer streaming on the progressive
 *  transport. DEFAULT OFF (whole-answer release stays the shipped behavior);
 *  "1" enables the streaming variant — internal cohort only after Gate 3, and
 *  only ever effective when a run has a real event sink (ASK_PROGRESSIVE
 *  client). Independent of ASK_PROGRESSIVE by design (§10). */
export function askStreamAnswer(): boolean {
  return process.env.ASK_STREAM_ANSWER === "1";
}

/** Phase 4: consult the versioned router and RECORD its policy per run.
 *  DEFAULT OFF. With the flag on, Auto's policy is equivalence-pinned to
 *  today's constants — behavior stays identical; enabling Fast/Deep or any
 *  policy that CHANGES models/K requires the paid scorecard (blocked) and a
 *  registry entry. */
export function askRouter(): boolean {
  return process.env.ASK_ROUTER === "1";
}

/** Phase 4: per-user EXACT answer cache (normalized question + window +
 *  policy/prompt/retrieval/corpus versions). DEFAULT OFF. Hits are $0 and
 *  hydrate cited evidence from the frozen EvidenceSnapshot (F11). */
export function askExactCache(): boolean {
  return process.env.ASK_EXACT_CACHE === "1";
}
