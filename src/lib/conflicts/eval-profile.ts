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
import { ConflictDomainError } from "./errors";
import { isIsoDay, type TimeAnchorTreatment } from "./instants";
import type { ConflictLaneId, LaneTaxonomyVersion } from "./lanes";
import type {
  ConflictMatcherLabel,
  MatchCoverage,
  MatcherKind,
  UnitVoteAudit,
} from "./match-contract";
import type { HedgingValue } from "./evidence-records";
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

/** The public headline label (contract §3): Key-Takeaway-denominator
 *  coverage against the expert benchmark — never "full-report", never a
 *  subset label, no accuracy/truth language anywhere in the vocabulary. */
export const CONFLICT_HEADLINE_LABEL = "Key Takeaway benchmark coverage" as const;

// --- Phase 4 stamp/record sub-shapes (P3 report §5.1 binding carried
// --- conditions; P2 discovery-metadata adjudication; prompt §12 item D) ---

/** RAW window inputs + treatments + the derived day span. RAW anchors are
 *  time anchors, never report content; stamping them makes every stored
 *  score auditable against a cutoff-parser regression (§6.4 M2). */
export interface ConflictWindowStampV1 {
  reportDate: string;
  cutoffAtRaw: string | null;
  publishedAtRaw: string | null;
  cutoffTreatment: TimeAnchorTreatment;
  publishedTreatment: TimeAnchorTreatment;
  windowEndSource: WindowEndSource;
  /** first and last UTC days whose day-granular claims were eligible */
  startDate: string;
  endDate: string;
  days: number;
}

export interface ConflictPopulationSelectionStampV1 {
  eligibleCount: number;
  selectedCount: number;
  cappedOutCount: number;
  budgetOutCount: number;
  totalTextBytes: number;
}

/** EFFECTIVE selection limits + per-population bounds — a selection-starved
 *  day (cap/byte displacement) is visible in every stored result. */
export interface ConflictSelectionStampV1 {
  limits: { maxCandidates: number; textByteBudget: number; mixCapFraction: number };
  corpusRecall: ConflictPopulationSelectionStampV1;
  publishedRetention: ConflictPopulationSelectionStampV1;
}

/** Every version identifier that shaped the population (laneTaxonomyVersion
 *  and evidencePolicyVersion are top-level fields already). */
export interface ConflictVersionStampV1 {
  actorRosterVersion: string;
  laneClassifierVersion: string;
  /** corpus recall: the current extractor-version set the population was
   *  filtered to (sorted unique; [] in fixture-backed runs, which carry only
   *  the currentExtractorVersion discipline) */
  extractorVersions: readonly string[];
  scopeVersion: string;
}

/** The full §12 matcher identity: kind + label(rung) + votes k +
 *  model-or-null, plus each population call's resolution. */
export interface ConflictMatcherStampV1 {
  kind: MatcherKind;
  /** identical to matcherRung (pinned); the more degraded of the two
   *  population resolutions when they differ */
  label: ConflictMatcherLabel;
  votesK: number | null;
  model: string | null;
  corpusRecall: { label: ConflictMatcherLabel; voteRounds: number | null };
  publishedRetention: { label: ConflictMatcherLabel; voteRounds: number | null };
}

export interface ConflictAgreementClaimV1 {
  claimId: number;
  coverage: MatchCoverage;
  confidence: number | null;
  theater: string;
  track: Track;
  /** the claim's OWN hedge — never reference wording, never strengthened */
  hedge: HedgingValue;
  earliestIngestAt: string | null;
  atCutoff: boolean | null;
  atPublication: boolean | null;
  independentSourceCount: number;
  legacy: boolean;
}

/** Agreement record: unit identity by id/lane ONLY (never unit text). */
export interface ConflictAgreementRecordV1 {
  unitId: string;
  lane: ConflictLaneId;
  claims: readonly ConflictAgreementClaimV1[];
}

/** Reference-only record: a declared unit no population claim matched. */
export interface ConflictReferenceOnlyRecordV1 {
  unitId: string;
  lane: ConflictLaneId;
  verdict: Extract<UnitVerdict, "miss" | "partial">;
  missDiagnostic: MissDiagnostic | null;
  compound: boolean;
  negative: boolean;
}

/** In-scope BNOW-only item (renderable): PUBLISHED-RETENTION population only
 *  (Gate-0 pin, register #7 / §6.4 LOW-4). */
export interface ConflictBnowOnlyItemV1 {
  claimId: number;
  lane: ConflictLaneId;
  theater: string;
  track: Track;
  hedge: HedgingValue;
  legacy: boolean;
}

export interface ConflictTimingDiagnosticsV1 {
  /** median (report publishedAt − claim earliest BNOW ingest) hours over
   *  agreements; null when the report's publication instant or every ingest
   *  instant is truthfully unknown — never coerced to 0 */
  medianLeadHoursByIngest: number | null;
  /** the SEPARATE source-declared-publish lead (§6.4: shown separately,
   *  never substituted for ingest time) */
  medianLeadHoursBySourceDeclared: number | null;
  agreements: number;
}

export interface ConflictLaneCoverageRowV1 {
  lane: ConflictLaneId;
  /** declared units in this lane — lane rows PARTITION the same declared
   *  units; row sums equal the headline denominator, never change it */
  units: number;
  corpusRecall: { matched: number; partial: number; miss: number };
  publishedRetention: { matched: number; partial: number; miss: number };
  diagnostic: LaneDiagnostic | null;
}

/** Distinct-matched-unit counts per bucket. NON-ADDITIVE by design
 *  (contract §7): one matched unit may sit in several buckets, so bucket
 *  totals may exceed the headline numerator and never sum to it. */
export interface ConflictContributionTotalsV1 {
  nonAdditive: true;
  byTheater: Readonly<Record<string, number>>;
  byTrack: Readonly<Partial<Record<Track, number>>>;
  bySource: Readonly<Record<string, number>>;
}

export interface ConflictContributionEntryV1 {
  theaters: readonly string[];
  tracks: readonly Track[];
  /** contributing source domains (non-mirror docs only — a mirror never
   *  contributes); optional so the Phase-1 fixture-shaped entries remain
   *  assignable */
  sources?: readonly string[];
}

/** A scored report-level evaluation. Phase 4 (the pure scorer) produces these
 *  and may EXTEND this shape additively (new optional fields) — a field
 *  removal or meaning change requires version 2, never an in-place edit.
 *
 *  PHASE 4 EXTENSION (documented; V1 is unreleased and this phase is its
 *  first producer): the binding P3 §5.1 stamps and §12 record/diagnostic
 *  surfaces are added as OPTIONAL fields (additive), with presence enforced
 *  AT RUNTIME by assertPersistableConflictResultV1 — a stored score without
 *  them cannot be audited and MUST NOT be persisted, and a runtime gate
 *  enforces that better than a compile-time field ever could. One deliberate
 *  widening rides along: `matcherRung` accepts the ConflictMatcherLabel
 *  union (the three inherited ladder rungs PLUS "fixture-oracle"), so a
 *  deterministic-oracle-scored fixture/golden result labels itself honestly
 *  instead of masquerading as a majority result; live-compatible adapters
 *  remain typed to ladder rungs only. */
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
  /** which matcher label scored this result (§6.3 inherited ladder, or the
   *  test/offline fixture oracle — see the extension note above) */
  matcherRung: ConflictMatcherLabel;
  /** keyword rung only: declared units with no keyword signal, kept in the
   *  FULL denominator as automatic misses (register #8 M1) */
  keywordUnmatchable?: number;
  /** multi-label, non-additive contribution over CORPUS-RECALL matched units
   *  (contract §7): bucket totals may exceed the headline numerator */
  contribution: Readonly<Record<string, ConflictContributionEntryV1>>;

  // --- Phase 4 additive fields (runtime-required for persistence) ---
  /** the public denominator label (contract §3) */
  headlineLabel?: typeof CONFLICT_HEADLINE_LABEL;
  window?: ConflictWindowStampV1;
  selection?: ConflictSelectionStampV1;
  versions?: ConflictVersionStampV1;
  matcher?: ConflictMatcherStampV1;
  /** per-vote audit per population call (llm rungs; null members elsewhere) */
  voteAudit?: {
    corpusRecall: readonly UnitVoteAudit[] | null;
    publishedRetention: readonly UnitVoteAudit[] | null;
  };
  lanes?: readonly ConflictLaneCoverageRowV1[];
  agreements?: {
    corpusRecall: readonly ConflictAgreementRecordV1[];
    publishedRetention: readonly ConflictAgreementRecordV1[];
  };
  referenceOnly?: {
    corpusRecall: readonly ConflictReferenceOnlyRecordV1[];
    publishedRetention: readonly ConflictReferenceOnlyRecordV1[];
  };
  /** in-scope BNOW-only: corpus recall feeds INTERNAL COUNTS ONLY; the
   *  renderable item list comes from the published-retention population
   *  exclusively (register #7 / §6.4 pin) */
  bnowOnly?: {
    corpusRecall: { count: number };
    publishedRetention: { count: number; items: readonly ConflictBnowOnlyItemV1[] };
  };
  /** one claim matching multiple units, VISIBLE (claimId → unitIds),
   *  constrained by the atomic/compound policy (§6.3 L1; register #9) */
  multiUnitClaims?: {
    corpusRecall: Readonly<Record<string, readonly string[]>>;
    publishedRetention: Readonly<Record<string, readonly string[]>>;
  };
  /** distinct non-mirror source documents supporting each unit with ≥1
   *  agreement claim (mirrors add zero — §6.3) */
  independentSources?: {
    corpusRecall: Readonly<Record<string, number>>;
    publishedRetention: Readonly<Record<string, number>>;
  };
  /** thin-sourced diagnostic with its EXPLICIT denominator (§6.4): claims
   *  offered to the matcher with <2 independent docs AND hedge
   *  claimed/unverified */
  thinSourced?: {
    corpusRecall: { count: number; denominator: number };
    publishedRetention: { count: number; denominator: number };
  };
  timing?: {
    corpusRecall: ConflictTimingDiagnosticsV1;
    publishedRetention: ConflictTimingDiagnosticsV1;
  };
  /** distinct-matched-unit counts per theater/track/source bucket over the
   *  corpus-recall contribution (NON-ADDITIVE, disclosed) */
  contributionTotals?: ConflictContributionTotalsV1;
  /** the published-retention view's OWN contribution table — derived
   *  separately, never mixed into the corpus-recall one (contract §7) */
  contributionPublishedRetention?: Readonly<Record<string, ConflictContributionEntryV1>>;
  /** repeated-run/variance grouping key: identical inputs + matcher config
   *  share a key across repeated runs (§6.4) */
  runGroupKey?: string;
  /** snapshot identity: the typed-null ref until the Phase 5
   *  ConflictSnapshotRef capture contract exists (register #5) */
  snapshot?: { ref: null };
}

/** The binding persistence gate (P3 report §5.1): a scored result missing
 *  any input stamp cannot be audited or reproduced and MUST NOT be
 *  persisted. Throws typed on a violation; unavailable/gap variants pass
 *  (they carry no score). Every future persistence path (Phase 5) calls this
 *  before any write. */
export function assertPersistableConflictResultV1(result: ConflictResultV1): void {
  if (result.state !== "scored") return;
  const missing: string[] = [];
  if (result.headlineLabel !== CONFLICT_HEADLINE_LABEL) missing.push("headlineLabel");
  if (result.window === undefined) missing.push("window");
  if (result.selection === undefined) missing.push("selection");
  if (result.versions === undefined) missing.push("versions");
  if (result.matcher === undefined) missing.push("matcher");
  if (result.voteAudit === undefined) missing.push("voteAudit");
  if (result.lanes === undefined) missing.push("lanes");
  if (result.agreements === undefined) missing.push("agreements");
  if (result.referenceOnly === undefined) missing.push("referenceOnly");
  if (result.bnowOnly === undefined) missing.push("bnowOnly");
  if (result.runGroupKey === undefined) missing.push("runGroupKey");
  if (result.snapshot === undefined) missing.push("snapshot");
  if (missing.length > 0) {
    throw new ConflictDomainError(
      "unpersistable_result",
      `scored conflict result is missing binding stamps and MUST NOT be persisted: ${missing.join(", ")}`,
    );
  }
  if (result.matcher !== undefined && result.matcher.label !== result.matcherRung) {
    throw new ConflictDomainError(
      "unpersistable_result",
      `matcher.label (${result.matcher.label}) disagrees with matcherRung (${result.matcherRung})`,
    );
  }
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
