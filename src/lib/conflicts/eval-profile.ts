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
import type { ConflictEvidencePolicyVersion } from "./definitions";
import { deepFreeze } from "./freeze";
import type { ConflictLaneId, LaneTaxonomyVersion } from "./lanes";
import type { ReferenceReportIdentity } from "./reference-report";
import {
  METHODOLOGY_EPOCH,
  type ConflictId,
  type EvaluationKind,
  type HeadlineCount,
  type LaneDiagnostic,
  type MatcherRung,
  type MissDiagnostic,
  type UnitVerdict,
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

/** Identity fields every conflict result carries (contract §6.4/§8). */
interface ConflictResultIdentityV1 {
  version: 1;
  conflictId: ConflictId;
  /** methodology epoch stamping this result (initially conflict-epoch-1) */
  methodologyEpoch: string;
  laneTaxonomyVersion: LaneTaxonomyVersion;
  evidencePolicyVersion: ConflictEvidencePolicyVersion;
  report: ReferenceReportIdentity;
  evaluationKind: EvaluationKind;
}

/** A scored report-level evaluation. Phase 4 (the pure scorer) produces these
 *  and may EXTEND this shape additively (new optional fields) — a field
 *  removal or meaning change requires version 2, never an in-place edit. */
export interface ConflictScoredResultV1 extends ConflictResultIdentityV1 {
  state: "scored";
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

/** An honestly-unavailable evaluation (no report, or a snapshot kind without
 *  a proving capture artifact — register #5). Carries NO headline: unavailable
 *  is never rendered as 0/0. */
export interface ConflictUnavailableResultV1 extends ConflictResultIdentityV1 {
  state: "unavailable";
  /** machine-readable provenance reason (e.g. "publication_gap",
   *  "no_proven_snapshot") */
  unavailableReason: string;
}

export type ConflictResultV1 = ConflictScoredResultV1 | ConflictUnavailableResultV1;

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

export const CONFLICT_EVAL_PROFILES: Readonly<Record<ConflictId, ConflictEvalProfile>> =
  deepFreeze({
    russia_ukraine: {
      profileId: "conflict-validation-profile-v1",
      workload: CONFLICT_EVAL_WORKLOAD,
      conflictId: "russia_ukraine",
      datasetVersion: CONFLICT_EVAL_DATASET_IDS.russia_ukraine,
      laneTaxonomyVersion: "roca-lanes-v1",
      evidencePolicyVersion: "ru-ua-ev-v1",
      methodologyEpoch: METHODOLOGY_EPOCH,
    },
    iran_regional: {
      profileId: "conflict-validation-profile-v1",
      workload: CONFLICT_EVAL_WORKLOAD,
      conflictId: "iran_regional",
      datasetVersion: CONFLICT_EVAL_DATASET_IDS.iran_regional,
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
      methodologyEpoch: METHODOLOGY_EPOCH,
    },
  });
