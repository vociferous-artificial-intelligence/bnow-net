// Conflict-domain typed error (Phase 1, docs/designs/CONFLICT-REGION-EVALUATION.md).
//
// Every fail-closed refusal in src/lib/conflicts/* throws this one class with a
// bounded machine-readable code, so callers can distinguish "you asked for a
// lane taxonomy version that does not exist" from "this JSON is not a phase
// record" without string-matching messages. The public API of this directory
// never returns silent undefined-as-absence: lookups either return a typed
// value/result object or throw ConflictDomainError.

export const CONFLICT_DOMAIN_ERROR_CODES = [
  "unknown_conflict",
  "unknown_lane_taxonomy_version",
  "unknown_lane",
  "invalid_exclusion_reasons",
  "invalid_instant",
  "invalid_conflict_definition",
  "invalid_reference_report",
  "invalid_phase_record",
  "invalid_phase_set",
  "unserializable_value",
  // Phase 2 (reference reports, editions, windows) — additive codes only
  "invalid_edition_url",
  "invalid_edition_record",
  "invalid_edition_selection",
  "edition_merge_conflict",
  "invalid_day_status",
  // Phase 3 (evidence union) — additive codes only
  "invalid_evidence_request",
  "invalid_candidate_claim",
  "invalid_fixture_scenario",
] as const;

export type ConflictDomainErrorCode = (typeof CONFLICT_DOMAIN_ERROR_CODES)[number];

export class ConflictDomainError extends Error {
  readonly name = "ConflictDomainError";
  constructor(
    readonly code: ConflictDomainErrorCode,
    message: string,
    /** precise per-field validation messages where a validator produced them
     *  (house style: string[] like validateAnalysisEvalDataset), else [] */
    readonly issues: readonly string[] = [],
  ) {
    super(issues.length > 0 ? `${message}: ${issues.join("; ")}` : message);
  }
}
