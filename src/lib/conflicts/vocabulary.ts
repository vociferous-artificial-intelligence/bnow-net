// Frozen conflict-domain vocabulary (Phase 1 of the conflict-evaluations
// workstream; binding source: docs/designs/CONFLICT-REGION-EVALUATION.md,
// frozen at Gate 0).
//
// Pure types + const arrays + type guards that later phases (P2 windows, P3
// evidence union, P4 scoring, P5 eval adapter, P6 UI) consume. This module
// deliberately implements NO matching, scoring, window computation, or
// evidence assembly — it is the shared vocabulary those phases must agree on,
// pinned here once so a drifted string literal fails a type check instead of
// silently forking the ontology.

import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";

// ---------------------------------------------------------------------------
// Conflict and reference-series identities (contract §0)
// ---------------------------------------------------------------------------

/** The user-facing analytical objects. Stable ids, never re-keyed; country/
 *  theater codes are a DIFFERENT concept (coverage lenses under the conflict
 *  layer) and never appear in this union. */
export const CONFLICT_IDS = deepFreeze(["russia_ukraine", "iran_regional"] as const);
export type ConflictId = (typeof CONFLICT_IDS)[number];

export function isConflictId(value: unknown): value is ConflictId {
  return typeof value === "string" && (CONFLICT_IDS as readonly string[]).includes(value);
}

/** External reference series (one versioned editorial scope each). */
export const REFERENCE_SERIES_IDS = deepFreeze(["roca", "iran_update"] as const);
export type ReferenceSeriesId = (typeof REFERENCE_SERIES_IDS)[number];

export function isReferenceSeriesId(value: unknown): value is ReferenceSeriesId {
  return typeof value === "string" && (REFERENCE_SERIES_IDS as readonly string[]).includes(value);
}

/** Initial methodology epoch (contract §8). A methodology change creates a NEW
 *  epoch and a side-by-side retrospective series; it never silently rewrites
 *  old meaning. Every result is stamped with its epoch. */
export const METHODOLOGY_EPOCH = "conflict-epoch-1" as const;

// ---------------------------------------------------------------------------
// Evidence-eligibility exclusion reasons (contract §5, register #6)
// ---------------------------------------------------------------------------

/** The EIGHT bounded exclusion reasons, listed in their FROZEN precedence
 *  order — first match wins; integrity before scope before comparability.
 *  The array order IS the precedence and is pinned by tests; changing it
 *  requires a new methodology epoch. */
export const EXCLUSION_REASONS = deepFreeze([
  "stub_fixture",
  "missing_source",
  "superseded_version",
  "mirror_only",
  "off_window",
  "off_scope",
  "legacy_incomparable",
  "unclassified",
] as const);

export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export function isExclusionReason(value: unknown): value is ExclusionReason {
  return typeof value === "string" && (EXCLUSION_REASONS as readonly string[]).includes(value);
}

/** 0 = highest precedence (stub_fixture). Throws on an unknown reason —
 *  precedence over an unbounded vocabulary would be meaningless. */
export function exclusionReasonPrecedence(reason: string): number {
  const idx = (EXCLUSION_REASONS as readonly string[]).indexOf(reason);
  if (idx === -1) {
    throw new ConflictDomainError(
      "invalid_exclusion_reasons",
      `unknown exclusion reason: ${JSON.stringify(reason)}`,
    );
  }
  return idx;
}

/** The single reason an excluded candidate RECORDS when several exclusion
 *  predicates apply: the earliest in the frozen precedence order (e.g. a stub
 *  row that is also off-scope records `stub_fixture` — integrity precedes
 *  scope; pinned by the Phase 0 fixture corpus). Fails closed: an empty list
 *  or an unknown member throws — it never silently picks a survivor. */
export function dominantExclusionReason(reasons: readonly string[]): ExclusionReason {
  if (reasons.length === 0) {
    throw new ConflictDomainError(
      "invalid_exclusion_reasons",
      "dominantExclusionReason requires at least one reason",
    );
  }
  let best: ExclusionReason | null = null;
  let bestIdx = Number.POSITIVE_INFINITY;
  for (const reason of reasons) {
    const idx = exclusionReasonPrecedence(reason); // throws on unknown
    if (idx < bestIdx) {
      bestIdx = idx;
      best = EXCLUSION_REASONS[idx];
    }
  }
  // best is non-null: the list was non-empty and every member resolved
  return best as ExclusionReason;
}

// ---------------------------------------------------------------------------
// Evaluation-window END provenance (contract §5 ladder, §6.4; register #8 M2)
// ---------------------------------------------------------------------------

/** Which rung of the frozen §5 END ladder bounded an evaluation window:
 *  `cutoff` (cutoffAt parseable) → `published` (publishedAt known) →
 *  `report_day` (exclusive end of the report date's UTC day). Recorded on
 *  every evaluation so a cutoff-parser regression that silently widens
 *  windows is visible in every result. Phase 2 computes the window; this is
 *  the vocabulary it records. */
export const WINDOW_END_SOURCES = deepFreeze(["cutoff", "published", "report_day"] as const);
export type WindowEndSource = (typeof WINDOW_END_SOURCES)[number];

export function isWindowEndSource(value: unknown): value is WindowEndSource {
  return typeof value === "string" && (WINDOW_END_SOURCES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Evaluation kinds (contract §6.2; register #5)
// ---------------------------------------------------------------------------

export const EVALUATION_KINDS = deepFreeze([
  "operational_cutoff",
  "at_publication",
  "finalized",
  "retrospective",
] as const);

export type EvaluationKind = (typeof EVALUATION_KINDS)[number];

export function isEvaluationKind(value: unknown): value is EvaluationKind {
  return typeof value === "string" && (EVALUATION_KINDS as readonly string[]).includes(value);
}

/** `unavailable` is a FIRST-CLASS state, always distinct from zero: a kind
 *  that is unavailable produced no observation at all, while a scored
 *  evaluation with zero matches is a real 0/N observation. */
export const EVALUATION_KIND_AVAILABILITIES = deepFreeze(["allowed", "unavailable"] as const);
export type EvaluationKindAvailability = (typeof EVALUATION_KIND_AVAILABILITIES)[number];

/** Register #5 (binding until a reviewed capture path exists): the three
 *  snapshot kinds return `unavailable` — an enum row does not prove a
 *  snapshot exists, and the current DB holds only latest-writer state. Only
 *  explicitly labeled retrospectives (and fixtures) are producible in this
 *  workstream. */
export const INITIAL_EVALUATION_KIND_AVAILABILITY: Readonly<
  Record<EvaluationKind, EvaluationKindAvailability>
> = deepFreeze({
  operational_cutoff: "unavailable",
  at_publication: "unavailable",
  finalized: "unavailable",
  retrospective: "allowed",
});

/** Bounded machine-readable reasons an evaluation is `unavailable` — a CLOSED
 *  union, never free text (Gate-1 NOTE-5). `publication_gap` = the reference
 *  series truly published no report for the date (contract §9: gaps are
 *  represented, never fabricated — so this reason NEVER carries an edition
 *  identity); `no_proven_snapshot` = a snapshot evaluation kind without an
 *  immutable capture artifact proving its populations (§6.2, register #5).
 *  New reasons require a contract/fixture basis, not ad hoc strings. */
export const UNAVAILABLE_REASONS = deepFreeze(["publication_gap", "no_proven_snapshot"] as const);
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export function isUnavailableReason(value: unknown): value is UnavailableReason {
  return typeof value === "string" && (UNAVAILABLE_REASONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Per-unit verdicts and diagnostics (contract §3, §5; register #8 H1)
// ---------------------------------------------------------------------------

/** Match verdicts per declared reference unit. `partial` (compound bullet,
 *  incomplete evidence) is DIAGNOSTIC: it counts as a MISS in the headline
 *  numerator, never as a fraction and never as a match. There is NO unit-level
 *  `unavailable` verdict — an incomparable-coverage unit stays in the
 *  denominator as an honest miss carrying a missDiagnostic (register #8 H1). */
export const UNIT_VERDICTS = deepFreeze(["matched", "miss", "partial"] as const);
export type UnitVerdict = (typeof UNIT_VERDICTS)[number];

export function isUnitVerdict(value: unknown): value is UnitVerdict {
  return typeof value === "string" && (UNIT_VERDICTS as readonly string[]).includes(value);
}

/** Diagnostic sub-label on a miss whose plausible evidence class is
 *  incomparable (e.g. a Gulf-base unit whose only evidence lives in
 *  legacy-engine theaters). The miss is real — a product coverage gap —
 *  never a manufactured zero and never an escape from the denominator. */
export const MISS_DIAGNOSTICS = deepFreeze(["incomparable_coverage"] as const);
export type MissDiagnostic = (typeof MISS_DIAGNOSTICS)[number];

export function isMissDiagnostic(value: unknown): value is MissDiagnostic {
  return typeof value === "string" && (MISS_DIAGNOSTICS as readonly string[]).includes(value);
}

/** Lane diagnostic-table state: a lane whose WHOLE eligible class is
 *  incomparable renders "unavailable (incomparable evidence)" instead of a
 *  bare 0% that would imply comparable-but-missed (contract §3/§5 as amended
 *  at Gate 0). Lane diagnostics never change the headline denominator. */
export const LANE_DIAGNOSTICS = deepFreeze(["unavailable_incomparable"] as const);
export type LaneDiagnostic = (typeof LANE_DIAGNOSTICS)[number];

export function isLaneDiagnostic(value: unknown): value is LaneDiagnostic {
  return typeof value === "string" && (LANE_DIAGNOSTICS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Matcher degradation ladder labels (contract §6.3; register #8 H2)
// ---------------------------------------------------------------------------

/** The INHERITED production degradation ladder, unchanged: ≥3 usable rounds →
 *  majority (`llm-majority`); 1–2 usable rounds → the single/first usable
 *  round, honestly labeled `llm`; zero usable rounds → the keyword fallback
 *  (`keyword`). Labels always disclose which rung scored the day and can
 *  never masquerade as a majority result. On the keyword rung the conflict
 *  evaluator keeps the FULL declared-unit denominator and reports a
 *  `keywordUnmatchable` diagnostic count (register #8 M1 — a disclosed
 *  divergence from production scoreDigest, confined to the conflict
 *  evaluator). */
export const MATCHER_RUNGS = deepFreeze(["llm-majority", "llm", "keyword"] as const);
export type MatcherRung = (typeof MATCHER_RUNGS)[number];

export function isMatcherRung(value: unknown): value is MatcherRung {
  return typeof value === "string" && (MATCHER_RUNGS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Headline arithmetic shape (contract §3, §6.4; register #8 M4)
// ---------------------------------------------------------------------------

/** One headline count: `matched` counts `matched` verdicts ONLY (partial =
 *  miss); `denominator` = ALL declared reference units of the selected
 *  edition. Rendered always as numerator/denominator beside any percentage;
 *  an `unavailable` evaluation has NO HeadlineCount at all — unavailable is
 *  never expressed as 0/0. */
export interface HeadlineCount {
  matched: number;
  denominator: number;
}
