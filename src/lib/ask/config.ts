import { envNum } from "../usage/spend-guard";

// Env-backed knobs for the ASK v2 pipeline. Numeric knobs reuse spend-guard's
// envNum (unset / NaN -> default) and are floored to a positive integer, so a
// bogus env value (0, -1, 1.5) can never produce a nonsensical LIMIT / cap. The
// supervisor flips ASK_PIPELINE to "v2" only after the eval gate passes; every
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

/** "v2" ONLY when ASK_PIPELINE is exactly "v2"; anything else (incl. unset) is
 *  legacy — the supervisor flips this after the eval gate passes. */
export function askPipeline(): "v2" | "legacy" {
  return process.env.ASK_PIPELINE === "v2" ? "v2" : "legacy";
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
