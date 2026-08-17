// Conflict eval-extension profile (Phase 1; contract §10, decision register
// #3): the NARROW adapter surface describing how conflict datasets ride the
// EXISTING generic eval control plane.
//
// Decision #3, restated: a conflict-specific dataset profile and scoring
// adapter UNDER THE EXISTING `validation` workload — no new workload, no
// second runner, no rival result schema. The conflict evaluation IS a
// validation-shaped task (reference units vs claims) over a
// differently-assembled candidate set; its richer result payload rides as an
// ADDITIVE versioned payload (`conflictResultV1`) inside the case reference,
// and the profile is distinguished by dataset naming plus case-level
// metadata, keeping every exhaustive workload switch untouched. If Phase 5
// implementation proves the validation contract would be misrepresented, the
// recorded fallback (one additive `conflict_validation` workload) requires a
// NEW decision-register entry BEFORE any control-plane edit.
//
// ISOLATION: the inherited eval-library isolation contract (the eval control
// plane's own isolation.test.ts) forbids EVERY non-test file under src/
// outside the eval library from referencing an eval-library module specifier
// — type-only imports included — because the eval dispatch path bypasses the
// production analysis-registry approval. This module therefore names the
// inherited contracts STRUCTURALLY (generic `...Of<>` composition aliases
// over minimal structural bounds) and imports nothing from the eval library.
// The colocated eval-profile.test.ts — which the isolation scan exempts and
// tsc still typechecks — pins the real compatibility: the workload literal is
// assigned to the inherited workload union, a composed conflict case/dataset
// is assigned to the inherited case/dataset types WITHOUT casts, and the
// inherited dataset validator accepts a conflict-shaped dataset at run time.
// If the control plane renames `validation`, adds required fields, or starts
// rejecting additive reference keys, that test stops compiling or failing —
// instead of this module silently forking the contract.

import type { Track } from "../analysis/tracks";
import { CONFLICT_REGISTRY, type ConflictEvidencePolicyVersion } from "./definitions";
import { deepFreeze } from "./freeze";
import { isIsoDay } from "./instants";
import type { ConflictLaneId, LaneTaxonomyVersion } from "./lanes";
import { validateReferenceReportIdentity, type ReferenceReportIdentity } from "./reference-report";
import {
  METHODOLOGY_EPOCH,
  isConflictId,
  isEvaluationKind,
  isUnavailableReason,
  type ConflictId,
  type EvaluationKind,
  type HeadlineCount,
  type LaneDiagnostic,
  type MatcherRung,
  type MissDiagnostic,
  type ReferenceSeriesId,
  type UnitVerdict,
  type UnavailableReason,
  type WindowEndSource,
} from "./vocabulary";

/** Register #3 pin: conflict evaluations ride the EXISTING validation
 *  workload. eval-profile.test.ts assigns this literal to the inherited
 *  workload union, so a control-plane rename breaks the build. */
export const CONFLICT_EVAL_WORKLOAD = "validation" as const;

/** Dataset naming (§10): the profile is distinguished by these dataset
 *  versions — never by a new workload. */
export const CONFLICT_EVAL_DATASET_IDS = deepFreeze({
  russia_ukraine: "conflict-roca-v1",
  iran_regional: "conflict-iran-v1",
} as const satisfies Record<ConflictId, string>);

export type ConflictEvalDatasetId =
  (typeof CONFLICT_EVAL_DATASET_IDS)[keyof typeof CONFLICT_EVAL_DATASET_IDS];

// ---------------------------------------------------------------------------
// The additive versioned result payload (`conflictResultV1`)
// ---------------------------------------------------------------------------

/** Identity fields every conflict result variant carries (contract §6.4/§8).
 *  Deliberately WITHOUT a report identity: whether a result may carry one is
 *  variant-specific — a publication gap has no report/edition to name
 *  (contract §9: gaps are represented, never fabricated). */
interface ConflictResultCommonV1 {
  version: 1;
  conflictId: ConflictId;
  /** methodology epoch stamping this result (initially conflict-epoch-1) */
  methodologyEpoch: string;
  laneTaxonomyVersion: LaneTaxonomyVersion;
  evidencePolicyVersion: ConflictEvidencePolicyVersion;
  evaluationKind: EvaluationKind;
}

/** A scored report-level evaluation. Phase 4 (the pure scorer) produces these
 *  and may EXTEND this shape additively (new optional fields) — a field
 *  removal or meaning change requires version 2, never an in-place edit. */
export interface ConflictScoredResultV1 extends ConflictResultCommonV1 {
  state: "scored";
  report: ReferenceReportIdentity;
  /** which rung of the frozen §5 END ladder bounded the window (§6.4 M2) */
  windowEndSource: WindowEndSource;
  /** headline arithmetic over ALL declared units (partial = miss) */
  headline: {
    corpusRecall: HeadlineCount;
    publishedRetention: HeadlineCount;
    /** count of `partial` verdicts, surfaced BESIDE the headline, never
     *  inside it */
    partialDiagnostic?: number;
  };
  /** per-unit verdicts, keyed by unit id, one map per pipeline question
   *  (contract §6.1 — never conflated) */
  corpusRecall: Readonly<Record<string, UnitVerdict>>;
  publishedRetention: Readonly<Record<string, UnitVerdict>>;
  /** diagnostic sub-labels on misses with an incomparable evidence class */
  missDiagnostic?: Readonly<Record<string, MissDiagnostic>>;
  /** lane diagnostic-table states (never headline arithmetic) */
  laneDiagnostics?: Readonly<Partial<Record<ConflictLaneId, LaneDiagnostic>>>;
  /** which matcher rung scored this result (§6.3 inherited ladder) */
  matcherRung: MatcherRung;
  /** keyword rung only: declared units with no keyword signal, kept in the
   *  FULL denominator as automatic misses (register #8 M1) */
  keywordUnmatchable?: number;
  /** multi-label, non-additive contribution over CORPUS-RECALL matched units
   *  (contract §7): bucket totals may exceed the headline numerator */
  contribution: Readonly<
    Record<string, { theaters: readonly string[]; tracks: readonly Track[] }>
  >;
}

/** An honestly-unavailable evaluation of an EXISTING report (a snapshot kind
 *  without a proving capture artifact — register #5). Carries the full report
 *  identity but NO headline: unavailable is never rendered as 0/0. */
export interface ConflictUnavailableResultV1 extends ConflictResultCommonV1 {
  state: "unavailable";
  report: ReferenceReportIdentity;
  /** bounded (Gate-1 NOTE-5); a gap is the OTHER variant, so it is excluded
   *  here — a report-carrying result can never claim to be a gap */
  unavailableReason: Exclude<UnavailableReason, "publication_gap">;
}

/** A TRUE publication gap (fixture cc-publication-gap-002): the reference
 *  series published nothing for the date, so there is NO report/edition
 *  identity to carry — fabricating one (even a synthetic editionKey) would
 *  violate contract §9. The variant names only the series and the gap day. */
export interface ConflictPublicationGapResultV1 extends ConflictResultCommonV1 {
  state: "unavailable";
  unavailableReason: "publication_gap";
  series: ReferenceSeriesId;
  /** yyyy-mm-dd UTC day the series produced no report for */
  gapDate: string;
}

export type ConflictResultV1 =
  | ConflictScoredResultV1
  | ConflictUnavailableResultV1
  | ConflictPublicationGapResultV1;

// ---------------------------------------------------------------------------
// How a conflict case/dataset rides the validation workload
// ---------------------------------------------------------------------------

/** Case-level conflict metadata (§10 "dataset naming and case-level
 *  metadata"). Lives beside the payload inside the reference extension so the
 *  inherited case envelope (id/partition/split/provenance) stays untouched. */
export interface ConflictCaseMetaV1 {
  version: 1;
  conflictId: ConflictId;
  datasetId: ConflictEvalDatasetId;
}

/** What a conflict case ADDS to an inherited validation case's reference —
 *  additive keys only; no inherited field is redefined or reinterpreted. */
export interface ConflictReferenceExtension {
  conflictMeta: ConflictCaseMetaV1;
  conflictResultV1: ConflictResultV1;
}

/** Compose the conflict extension onto the INHERITED validation case type at
 *  the point of use (where importing the eval contracts is permitted):
 *  `type ConflictCase = ConflictValidationEvalCaseOf<ValidationEvalCase>`.
 *  The result is assignable to the inherited case type by construction —
 *  the reference is intersected, never replaced. */
export type ConflictValidationEvalCaseOf<
  Case extends { workload: typeof CONFLICT_EVAL_WORKLOAD; reference: object },
> = Omit<Case, "reference"> & { reference: Case["reference"] & ConflictReferenceExtension };

/** Compose a conflict dataset from the INHERITED dataset type and a composed
 *  conflict case type: workload pinned to `validation`, datasetVersion drawn
 *  from the conflict dataset ids, everything else inherited unchanged. */
export type ConflictEvalDatasetOf<
  Dataset extends { workload: string; datasetVersion: string; cases: readonly unknown[] },
  Case,
> = Omit<Dataset, "workload" | "datasetVersion" | "cases"> & {
  workload: typeof CONFLICT_EVAL_WORKLOAD;
  datasetVersion: ConflictEvalDatasetId;
  cases: Case[];
};

// ---------------------------------------------------------------------------
// The profile records
// ---------------------------------------------------------------------------

export interface ConflictEvalProfile {
  profileId: "conflict-validation-profile-v1";
  /** always the existing validation workload (register #3) */
  workload: typeof CONFLICT_EVAL_WORKLOAD;
  conflictId: ConflictId;
  datasetVersion: ConflictEvalDatasetId;
  laneTaxonomyVersion: LaneTaxonomyVersion;
  evidencePolicyVersion: ConflictEvidencePolicyVersion;
  methodologyEpoch: typeof METHODOLOGY_EPOCH;
}

/** Profiles are DERIVED from the frozen registry — no duplicated version
 *  literals, so profile and registry can never diverge (Gate-1 MINOR-4; the
 *  consistency is also test-pinned). */
function profileFor(id: ConflictId): ConflictEvalProfile {
  const def = CONFLICT_REGISTRY[id];
  return {
    profileId: "conflict-validation-profile-v1",
    workload: CONFLICT_EVAL_WORKLOAD,
    conflictId: id,
    datasetVersion: CONFLICT_EVAL_DATASET_IDS[id],
    laneTaxonomyVersion: def.laneTaxonomyVersion,
    evidencePolicyVersion: def.evidencePolicyVersion,
    methodologyEpoch: METHODOLOGY_EPOCH,
  };
}

export const CONFLICT_EVAL_PROFILES: Readonly<Record<ConflictId, ConflictEvalProfile>> =
  deepFreeze({
    russia_ukraine: profileFor("russia_ukraine"),
    iran_regional: profileFor("iran_regional"),
  });

// ---------------------------------------------------------------------------
// Fail-closed runtime validators (Gate-1 MINOR-4)
// ---------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Validate the IDENTITY/variant skeleton of a ConflictResultV1 (all three
 *  variants), rejecting cross-conflict inconsistency: the conflictId must
 *  agree with its registry-bound lane taxonomy, evidence policy, and
 *  reference series (e.g. russia_ukraine + iran-lanes-v1 is impossible).
 *  Metric-body validation (headline arithmetic, verdict maps) is Phase 4's
 *  scorer contract, deliberately not duplicated here. [] = valid. */
export function validateConflictResultIdentityV1(raw: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["conflict result: not an object"];
  const r = raw;
  if (r.version !== 1) errs.push(`version: must be 1, got ${JSON.stringify(r.version)}`);
  if (!isConflictId(r.conflictId)) {
    errs.push(`conflictId: unknown conflict ${JSON.stringify(r.conflictId)}`);
    return errs; // every cross-check below is keyed by the conflict
  }
  const def = CONFLICT_REGISTRY[r.conflictId];
  if (typeof r.methodologyEpoch !== "string" || r.methodologyEpoch.length === 0) {
    errs.push("methodologyEpoch: must be a non-empty string");
  }
  if (r.laneTaxonomyVersion !== def.laneTaxonomyVersion) {
    errs.push(
      `laneTaxonomyVersion: ${JSON.stringify(r.laneTaxonomyVersion)} is not ${r.conflictId}'s taxonomy (${def.laneTaxonomyVersion})`,
    );
  }
  if (r.evidencePolicyVersion !== def.evidencePolicyVersion) {
    errs.push(
      `evidencePolicyVersion: ${JSON.stringify(r.evidencePolicyVersion)} is not ${r.conflictId}'s policy (${def.evidencePolicyVersion})`,
    );
  }
  if (!isEvaluationKind(r.evaluationKind)) {
    errs.push(`evaluationKind: invalid ${JSON.stringify(r.evaluationKind)}`);
  }

  const isGap = r.state === "unavailable" && r.unavailableReason === "publication_gap";
  if (r.state === "scored" || (r.state === "unavailable" && !isGap)) {
    // report-carrying variants
    const repErrs = validateReferenceReportIdentity(r.report);
    errs.push(...repErrs.map((e) => `report: ${e}`));
    if (repErrs.length === 0 && (r.report as ReferenceReportIdentity).series !== def.referenceSeries) {
      errs.push(
        `report.series: ${JSON.stringify((r.report as ReferenceReportIdentity).series)} is not ${r.conflictId}'s reference series (${def.referenceSeries})`,
      );
    }
    if ("gapDate" in r) errs.push("gapDate: only the publication_gap variant carries gapDate");
    if (r.state === "scored") {
      if ("unavailableReason" in r) {
        errs.push("unavailableReason: a scored result carries no unavailable reason");
      }
    } else if (!isUnavailableReason(r.unavailableReason)) {
      errs.push(
        `unavailableReason: ${JSON.stringify(r.unavailableReason)} is not in the bounded reason union`,
      );
    }
  } else if (isGap) {
    if ("report" in r) {
      errs.push(
        "report: a publication gap carries NO report/edition identity (contract §9 — gaps are never fabricated)",
      );
    }
    if (r.series !== def.referenceSeries) {
      errs.push(
        `series: ${JSON.stringify(r.series)} is not ${r.conflictId}'s reference series (${def.referenceSeries})`,
      );
    }
    if (typeof r.gapDate !== "string" || !isIsoDay(r.gapDate)) {
      errs.push(`gapDate: must be a valid yyyy-mm-dd UTC day, got ${JSON.stringify(r.gapDate)}`);
    }
  } else {
    errs.push(`state: must be "scored" or "unavailable", got ${JSON.stringify(r.state)}`);
  }
  return errs;
}

/** Validate a ConflictCaseMetaV1, rejecting a datasetId that is not the
 *  declared conflict's dataset. [] = valid. */
export function validateConflictCaseMetaV1(raw: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["conflict case meta: not an object"];
  if (raw.version !== 1) errs.push(`version: must be 1, got ${JSON.stringify(raw.version)}`);
  if (!isConflictId(raw.conflictId)) {
    errs.push(`conflictId: unknown conflict ${JSON.stringify(raw.conflictId)}`);
    return errs;
  }
  const expected = CONFLICT_EVAL_DATASET_IDS[raw.conflictId];
  if (raw.datasetId !== expected) {
    errs.push(
      `datasetId: ${JSON.stringify(raw.datasetId)} is not ${raw.conflictId}'s dataset (${expected})`,
    );
  }
  return errs;
}
