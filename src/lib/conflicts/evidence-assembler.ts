// The two Phase 3 evidence assemblies (contract §6.1 — TWO pipeline questions,
// NEVER conflated; register #4; workstream prompt §11).
//
// assembleCorpusRecallEvidence and assemblePublishedRetentionEvidence are
// SEPARATE FUNCTIONS returning SEPARATE TYPES with incompatible `population`
// discriminants — conflating them is a compile error, not a review hope:
//
//   1. CORPUS RECALL (pipeline question 1): did the current-version mapped
//      claim corpus contain the development? Candidates come from a
//      CorpusRecallClaimSource whose REAL implementation must filter
//      doc_claims through src/lib/analysis/map-versions.ts (the ONLY
//      sanctioned current-version accessor). The engine re-excludes
//      defensively: legacy-engine claims CANNOT enter (bounded reason
//      legacy_incomparable; the record type's `engine: "mapreduce"` literal
//      makes the leak a type error), superseded versions cannot enter
//      (superseded_version). Lanes whose only plausible evidence lives in
//      legacy_only theaters report `laneDiagnostics` unavailable_incomparable
//      HONESTLY (contract §5 comparability honesty; register #8 H1 keeps the
//      affected units in the headline denominator as misses — the lane table
//      diagnostic here never touches any denominator).
//
//   2. PUBLISHED RETENTION (pipeline question 2): did an actual user-facing
//      output retain a matching claim? The population is the versioned union
//      of claims that GENUINELY appeared in the designated digests
//      (register #4: ru+ua military for russia_ukraine; ir military/nuclear/
//      elite_politics plus labeled legacy il/gulf military contributors for
//      iran_regional). Legacy claims are INCLUDED here and LABELED
//      (`legacy: true`), never map-equivalent. Evidence existence never
//      implies membership — the source feeds published claims only and the
//      engine re-checks fail-closed.
//
// Both assemblies refuse fail-closed BEFORE touching any candidate:
//   - a publication gap (no report) → status "unavailable",
//     reason "publication_gap" — nothing is fabricated, no eligibility record
//     exists (fixture cc-publication-gap-002);
//   - a snapshot-anchored evaluation kind (operational_cutoff /
//     at_publication / finalized) without a proving snapshot artifact →
//     status "unavailable", reason "no_proven_snapshot" (contract §6.2,
//     register #5; ConflictSnapshotRef is Phase 5 — the request's `snapshot`
//     is typed `null` so nothing can pretend to be one yet). Only labeled
//     retrospectives assemble in this workstream.
//
// ANTI-GAMING: the request carries the report's IDENTITY AND TIME ANCHORS
// only. No reference-report content exists anywhere in the input types, so
// eligibility cannot consult it (contract §5 freeze, enforced structurally in
// evidence-records.ts).
//
// SAME ACTOR/PLACE, WRONG EVENT: assemblies carry NO per-unit verdicts of any
// kind. Phase 3 decides membership; matching claims to reference units is the
// Phase 4 matcher's job (see lane-classifier.ts header for the documented
// boundary).

import type { ConflictDefinition } from "./definitions";
import { conflictDefinition } from "./definitions";
import { ConflictDomainError } from "./errors";
import {
  computeEvaluationWindow,
  type EvaluationWindow,
} from "./evaluation-window";
import { SCOPE_VERSIONS } from "./editions";
import {
  evaluateCorpusRecallEligibility,
  evaluatePublishedRetentionEligibility,
  type EligibilityContext,
  type EligibilityEvaluation,
  type ScopeDetail,
} from "./eligibility";
import { validateReferenceReportIdentity } from "./reference-report";
import type { EligibilityRecord } from "./lanes";
import type { ConflictLaneId } from "./lanes";
import {
  assertSelectionLimits,
  compareEvidenceOrder,
  selectEvidence,
  DEFAULT_SELECTION_LIMITS,
  EVIDENCE_MAX_CANDIDATES,
  EVIDENCE_MAX_RECORD_TEXT_BYTES,
  type EvidenceSelection,
  type EvidenceSelectionLimits,
} from "./evidence-selection";
import {
  CANDIDATE_ENGINES,
  isCandidateEngine,
  type CandidateClaim,
  type CandidateDoc,
  type CorpusRecallRecord,
  type PublishedRetentionRecord,
} from "./evidence-records";
import {
  isIsoDay,
  classifyTimeAnchor,
} from "./instants";
import type {
  ConflictId,
  EvaluationKind,
  LaneDiagnostic,
  UnavailableReason,
  WindowEndSource,
} from "./vocabulary";
import { isEvaluationKind } from "./vocabulary";

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

/** The report as the assembler needs it: identity + RAW time anchors. RAW
 *  because the frozen window ladder itself classifies malformed anchors
 *  (malformed_treated_as_missing → next rung) — normalizing before the ladder
 *  would hide the treatment the contract requires recording. NO field carries
 *  report content. */
export interface AssemblerReport {
  series: string;
  editionKey: string;
  /** yyyy-mm-dd */
  reportDate: string;
  cutoffAt: string | null;
  publishedAt: string | null;
}

/** The exact own-key set of AssemblerReport. TypeScript's structural typing
 *  cannot stop a WIDER object (e.g. a fixture report shape carrying `units`
 *  reference text) from being assignable to the request, so prepare()
 *  refuses any report object carrying a key outside this allowlist at
 *  runtime — defense in depth for the §5 anti-gaming freeze. */
export const ASSEMBLER_REPORT_KEYS = [
  "series",
  "editionKey",
  "reportDate",
  "cutoffAt",
  "publishedAt",
] as const;

export interface EvidenceRequest {
  conflictId: ConflictId;
  kind: EvaluationKind;
  /** null = a true publication gap for the day (never fabricated over) */
  report: AssemblerReport | null;
  /** ConflictSnapshotRef is Phase 5's contract; in Phase 3 nothing can prove
   *  a snapshot population, so the field is typed to admit only null */
  snapshot: null;
  limits?: EvidenceSelectionLimits;
}

/** Assembler-level candidate-intake ceiling. A source returning more than
 *  this is refused VISIBLY (typed error) — silent truncation would bias the
 *  population without a trace. The real backend must filter and LIMIT at the
 *  query (see the CorpusRecallClaimSource contract below). */
export const EVIDENCE_MAX_INTAKE = 10 * EVIDENCE_MAX_CANDIDATES;

export interface CorpusRecallClaimSource {
  /** Candidates for the corpus-recall population.
   *
   *  REAL-BACKEND QUERY CONTRACT (binding for the integration phase; the
   *  engine still re-excludes every predicate defensively — superseded/
   *  legacy/stub/unlinked candidates get bounded reasons):
   *
   *    SELECT dc.<claim fields>, rd.<doc fields per claim>
   *      FROM doc_claims dc
   *      JOIN raw_documents rd ON rd.id = dc.raw_document_id
   *     WHERE rd.country_iso2 = ANY(<mapped contributorTheaters of def>)
   *       AND dc.track       = ANY(<def.contributorTracks>)
   *       AND dc.claim_date BETWEEN <window.startDate> AND <window.endDate>
   *       AND dc.extractor_version = ANY(<mapExtractorVersion() current set —
   *           src/lib/analysis/map-versions.ts, the ONLY sanctioned accessor>)
   *       AND rd.adapter <> ALL(STUB_ADAPTER_NAMES)  -- evidence-records.ts,
   *           mirroring src/lib/adapters/stubs.ts (ruling 3). The mapper sets
   *           CandidateClaim.stub = STUB_ADAPTER_NAMES.includes(rd.adapter)
   *           — it must SET the boolean, never omit it: intake refuses a
   *           candidate whose `stub` is absent, because `undefined` is falsy
   *           and would admit a stub row as non-stub.
   *     ORDER BY <registry source reliability> DESC NULLS LAST, dc.id ASC
   *
   *  ROW GRAIN vs LIMIT — BINDING (Gate-7 safety M-3). This query is
   *  one row per (claim, document), so a LIMIT on the JOINED stream cuts at a
   *  ROW boundary, not a claim boundary: 1,001 joined rows may group into
   *  ~400 claims, so the assembler's `candidates.length` ceiling never trips
   *  while the LAST claim arrives with a SILENTLY TRUNCATED doc list —
   *  lowering independentSourceCount, flipping the thin-source diagnostic,
   *  and potentially manufacturing a spurious `mirror_only` exclusion.
   *  Therefore:
   *    1. bound a DISTINCT-CLAIM subquery — select the eligible claim ids
   *       (ordered as above) with `LIMIT EVIDENCE_MAX_INTAKE + 1` — then
   *    2. join documents for EXACTLY those ids with no further limit.
   *  A claim MUST arrive with its COMPLETE document list or not at all. The
   *  +1 overflow sentinel belongs on the CLAIM-ID subquery: a LIMIT exactly
   *  at the ceiling would silently narrow a genuinely over-limit day to its
   *  top claims with no refusal ever firing, whereas the +1 trips the intake
   *  refusal so such days fail VISIBLY. Note that the intake ceiling is a
   *  POST-MATERIALIZATION assertion, not a pushdown: the source must apply
   *  its own LIMIT — the assembler can only refuse what it was handed.
   *
   *  Supporting indexes already present in src/db/schema.ts:
   *  `doc_claims_track_date_idx` (track, claim_date) drives the track+window
   *  range scan; `raw_documents_country_idx` (country_iso2) drives the
   *  theater filter on the join side. */
  corpusRecallCandidates(
    def: ConflictDefinition,
    window: EvaluationWindow,
  ): Promise<readonly CandidateClaim[]>;
}

export interface PublishedRetentionClaimSource {
  /** Candidates that GENUINELY appeared in the designated user-facing digests
   *  (published claims only — register #4).
   *
   *  REAL-BACKEND QUERY CONTRACT (binding; written to the same standard as
   *  CorpusRecallClaimSource above — Gate-7 safety M-3 found this interface
   *  carried no contract and no bound at all):
   *
   *  POPULATION (register #4): claims that appeared in the DESIGNATED
   *  existing digests — never a new conflict synthesis. For
   *  `russia_ukraine` that is the ru+ua `military` digests; for
   *  `iran_regional` the ir `military`/`nuclear`/`elite_politics` digests
   *  PLUS the legacy il/gulf contributors' `military` digests
   *  (LEGACY_CONTRIBUTOR_TRACKS). Membership is proven by the claim's
   *  presence in a published digest's claim set, not inferred from
   *  eligibility.
   *
   *    SELECT dc.<claim fields>, rd.<doc fields per claim>
   *      FROM <published digest claims for the designated theater/track set>
   *      JOIN raw_documents rd ON rd.id = dc.raw_document_id
   *     WHERE <digest theater/track ∈ the designated set for def>
   *       AND dc.claim_date BETWEEN <window.startDate> AND <window.endDate>
   *       AND rd.adapter <> ALL(STUB_ADAPTER_NAMES)   -- ruling 3
   *     ORDER BY <registry source reliability> DESC NULLS LAST, dc.id ASC
   *
   *  DIFFERENCES from corpus recall, deliberate: extractor version is NOT
   *  filtered (the retention question is what the published output
   *  contained, not which map version produced it — a published claim from a
   *  superseded version is still a member), and legacy-engine claims ARE
   *  members, labeled (`engine: "legacy"` → the assembler's `legacy: true`).
   *  The mapper must still SET `engine`, `published`, `stub`, and
   *  `currentExtractorVersion` explicitly — intake refuses any of the four
   *  missing.
   *
   *  The SAME row-grain rule binds here: bound a DISTINCT-CLAIM subquery at
   *  `EVIDENCE_MAX_INTAKE + 1` and join documents for exactly those ids; a
   *  claim arrives with its complete doc list or not at all, and the intake
   *  ceiling is a post-materialization assertion, not a pushdown. */
  publishedRetentionCandidates(
    def: ConflictDefinition,
    window: EvaluationWindow,
  ): Promise<readonly CandidateClaim[]>;
}

// ---------------------------------------------------------------------------
// Assembly result shapes (separate, discriminated)
// ---------------------------------------------------------------------------

export interface EvidenceExclusion {
  claimId: number;
  record: Extract<EligibilityRecord, { included: false }>;
  /** all reasons that applied — the record's reason is the frozen-precedence
   *  dominant one */
  applicableExclusions: readonly string[];
  /** bounded off_scope SUB-diagnostic (which of the four distinct causes
   *  applied) — additive, like windowReason; the frozen §5 reason enum is
   *  unchanged. Null when off_scope did not apply. */
  scopeDetail: ScopeDetail | null;
}

interface AssemblyBase {
  conflictId: ConflictId;
  evaluationKind: "retrospective";
  editionKey: string;
  reportDate: string;
  window: EvaluationWindow;
  windowEndSource: WindowEndSource;
  excluded: readonly EvidenceExclusion[];
  eligibleCount: number;
}

export interface CorpusRecallAssembly extends AssemblyBase {
  population: "corpus_recall";
  records: readonly CorpusRecallRecord[];
  selection: EvidenceSelection<CorpusRecallRecord>;
  /** lanes whose ONLY in-scope evidence was legacy-incomparable and which
   *  have no comparable included record: rendered
   *  "unavailable (incomparable evidence)", never a bare 0 (contract §5) */
  laneDiagnostics: Readonly<Partial<Record<ConflictLaneId, LaneDiagnostic>>>;
  /** the conflict's legacy_only roster theaters — the honest disclosure of
   *  where comparable mapping does not exist today */
  incomparableTheaters: readonly string[];
}

export interface PublishedRetentionAssembly extends AssemblyBase {
  population: "published_retention";
  records: readonly PublishedRetentionRecord[];
  selection: EvidenceSelection<PublishedRetentionRecord>;
  /** count of members carried by legacy digests (labeled, never
   *  map-equivalent) */
  legacyMemberCount: number;
}

export type CorpusRecallResult =
  | { status: "assembled"; assembly: CorpusRecallAssembly }
  | { status: "unavailable"; population: "corpus_recall"; conflictId: ConflictId; kind: EvaluationKind; reason: UnavailableReason };

export type PublishedRetentionResult =
  | { status: "assembled"; assembly: PublishedRetentionAssembly }
  | { status: "unavailable"; population: "published_retention"; conflictId: ConflictId; kind: EvaluationKind; reason: UnavailableReason };

// ---------------------------------------------------------------------------
// Shared request validation (fail-closed refusals; NO candidate access)
// ---------------------------------------------------------------------------

interface PreparedRequest {
  def: ConflictDefinition;
  ctx: EligibilityContext;
  report: AssemblerReport;
  limits: EvidenceSelectionLimits;
}

function prepare(
  request: EvidenceRequest,
):
  | { ok: true; prepared: PreparedRequest }
  | { ok: false; reason: UnavailableReason } {
  const def = conflictDefinition(request.conflictId); // throws typed on unknown id
  if (!isEvaluationKind(request.kind)) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `unknown evaluation kind: ${JSON.stringify(request.kind)}`,
    );
  }
  if (request.snapshot !== null) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      "snapshot artifacts are a Phase 5 contract; Phase 3 accepts only null",
    );
  }
  // a publication gap is never fabricated over — refuse before any candidate
  if (request.report === null) return { ok: false, reason: "publication_gap" };
  // runtime key allowlist: no reference-report content may even RIDE ALONG on
  // the report object (structural typing admits wider shapes — see
  // ASSEMBLER_REPORT_KEYS)
  const extraKeys = Object.keys(request.report).filter(
    (k) => !(ASSEMBLER_REPORT_KEYS as readonly string[]).includes(k),
  );
  if (extraKeys.length > 0) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `report carries keys outside the AssemblerReport allowlist: ${JSON.stringify(extraKeys)}`,
    );
  }
  if (!isIsoDay(request.report.reportDate)) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `report.reportDate must be a valid yyyy-mm-dd day, got ${JSON.stringify(request.report.reportDate)}`,
    );
  }
  // the report must BE this conflict's reference series — a cross-wired
  // report (e.g. iran_regional with a ROCA report) would silently evaluate
  // evidence against the wrong series' window and identity
  if (request.report.series !== def.referenceSeries) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `report series ${JSON.stringify(request.report.series)} is not the ${def.id} reference series ${JSON.stringify(def.referenceSeries)}`,
    );
  }
  // the editionKey is COPIED into serialized assembly output, so it is a
  // smuggling channel unless shape-validated: reuse the Phase 1/2 identity
  // validator (series:reportDate:label grammar + cross-field agreement). The
  // RAW time anchors are deliberately NOT validated here — the window ladder
  // classifies malformed anchors, so the validator sees nulls.
  const identityIssues = validateReferenceReportIdentity({
    series: request.report.series,
    editionKey: request.report.editionKey,
    reportDate: request.report.reportDate,
    cutoffAt: null,
    publishedAt: null,
    scopeVersion: SCOPE_VERSIONS[def.referenceSeries],
  });
  if (identityIssues.length > 0) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `report identity invalid: ${identityIssues.join("; ")}`,
    );
  }
  // snapshot-anchored kinds have no proving artifact in this workstream
  // (register #5): refuse honestly; only labeled retrospectives assemble
  if (request.kind !== "retrospective") return { ok: false, reason: "no_proven_snapshot" };

  // limits are validated HERE, before any source fetch (the selection-time
  // check stays as defense in depth) — a bad limits object must never cost a
  // candidate query
  const limits = request.limits ?? DEFAULT_SELECTION_LIMITS;
  assertSelectionLimits(limits);

  const window = computeEvaluationWindow({
    reportDate: request.report.reportDate,
    cutoffAt: request.report.cutoffAt,
    publishedAt: request.report.publishedAt,
  });
  return {
    ok: true,
    prepared: {
      def,
      ctx: {
        def,
        window,
        reportDate: request.report.reportDate,
        cutoffAt: request.report.cutoffAt,
        publishedAt: request.report.publishedAt,
      },
      report: request.report,
      limits,
    },
  };
}

/** Candidate-intake validation, run BEFORE any evaluation. The batch size is
 *  capped at EVIDENCE_MAX_INTAKE (visible refusal, never silent truncation).
 *  Duplicate claimIds are a SOURCE DEFECT — doc_claims ids are unique in the
 *  real backend, and the fixture corpus's uniqueness is asserted by a TEST
 *  (fixture-corpus.test.ts), not enforced by the loader, so THIS runtime
 *  guard is the actual invariant. A duplicate would break ordering totality
 *  (compareEvidenceOrder returns 0 → input-order dependence), misfile pass-2
 *  cap classification (capEvents matches by claimId), and last-writer-win the
 *  eligibilityByClaim projection. claimId must be a finite positive integer
 *  and sourceReliability finite-or-null (NaN poisons the total order: the
 *  comparator returns NaN, which sort() treats as 0 → input-order
 *  dependence). Text over EVIDENCE_MAX_RECORD_TEXT_BYTES is refused — one
 *  multi-KB "claim" would swallow the shared selection byte budget. */
function validateCandidateIntake(candidates: readonly CandidateClaim[]): void {
  if (candidates.length > EVIDENCE_MAX_INTAKE) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `source returned ${candidates.length} candidates — over the EVIDENCE_MAX_INTAKE ceiling of ${EVIDENCE_MAX_INTAKE}; filter and LIMIT at the query (see CorpusRecallClaimSource), never rely on assembler truncation`,
    );
  }
  const seen = new Set<number>();
  for (const c of candidates) {
    if (!Number.isInteger(c.claimId) || c.claimId <= 0) {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `claimId must be a finite positive integer, got ${String(c.claimId)}`,
      );
    }
    if (seen.has(c.claimId)) {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `duplicate claimId ${c.claimId} in one candidate batch`,
      );
    }
    seen.add(c.claimId);
    if (c.sourceReliability !== null && !Number.isFinite(c.sourceReliability)) {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `sourceReliability must be finite or null on claim ${c.claimId}, got ${String(c.sourceReliability)}`,
      );
    }
    if (Buffer.byteLength(c.text, "utf8") > EVIDENCE_MAX_RECORD_TEXT_BYTES) {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `claim ${c.claimId} text exceeds EVIDENCE_MAX_RECORD_TEXT_BYTES (${EVIDENCE_MAX_RECORD_TEXT_BYTES} UTF-8 bytes)`,
      );
    }
    // The four DISPOSITION-CRITICAL fields (Gate-7 safety M-1). The engine
    // reads them as `if (candidate.stub)` / `if (!candidate.published)` /
    // `engine === "legacy"` / `!currentExtractorVersion`, so an untyped DB
    // row mapper that OMITTED one would hand over `undefined` — falsy — and
    // a STUB row would enter the population as non-stub (ruling 3), an
    // unpublished claim as published (register #4), or a superseded/legacy
    // row as current mapreduce (rulings 13/18). Presence + type are required
    // here; values are never echoed into the error.
    if (typeof c.stub !== "boolean") {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `claim ${c.claimId}: stub must be present and boolean (ruling 3 — an omitted flag would admit a stub row as non-stub)`,
      );
    }
    if (typeof c.published !== "boolean") {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `claim ${c.claimId}: published must be present and boolean (register #4 — an omitted flag would admit an unpublished claim into published retention)`,
      );
    }
    if (typeof c.currentExtractorVersion !== "boolean") {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `claim ${c.claimId}: currentExtractorVersion must be present and boolean (rulings 13/18 — an omitted flag would admit a superseded extraction as current)`,
      );
    }
    if (!isCandidateEngine(c.engine)) {
      throw new ConflictDomainError(
        "invalid_candidate_claim",
        `claim ${c.claimId}: engine must be one of ${CANDIDATE_ENGINES.join("|")} (comparability is decided from it — rulings 13/18)`,
      );
    }
    // docIds are the traceability keys (ruling 2), the independence Set keys,
    // and the canonical doc sort key — NaN/fractional/negative ids defeated
    // all three while satisfying `typeof === "number"`
    for (const doc of c.docs) {
      if (!Number.isInteger(doc.docId) || doc.docId <= 0) {
        throw new ConflictDomainError(
          "invalid_candidate_claim",
          `claim ${c.claimId}: every doc.docId must be a positive integer (traceability, independence dedupe, and canonical ordering all key on it)`,
        );
      }
    }
  }
}

/** Canonical per-record doc list: every doc REBUILT field-by-field against
 *  the CandidateDoc shape (an extra key on a source doc object can never ride
 *  into serialized assembly output) and ordered by docId ascending — the
 *  record's doc list is byte-deterministic regardless of source doc order. */
function canonicalDocs(docs: readonly CandidateDoc[]): CandidateDoc[] {
  return docs
    .map((d) => ({
      docId: d.docId,
      adapter: d.adapter,
      platform: d.platform,
      sourceDomain: d.sourceDomain,
      publishedAt: d.publishedAt,
      fetchedAt: d.fetchedAt,
      mirrorOfDocId: d.mirrorOfDocId,
      sourceLanguage: d.sourceLanguage,
    }))
    .sort((a, b) => a.docId - b.docId);
}

/** Exclusions in claimId order (ascending) — the deterministic-list rule for
 *  every assembly output. Exclusions carry no reliability, so the stable key
 *  alone orders them. */
function excludedOf(evaluations: readonly EligibilityEvaluation[]): EvidenceExclusion[] {
  const out: EvidenceExclusion[] = [];
  for (const ev of evaluations) {
    if (!ev.record.included) {
      out.push({
        claimId: ev.claimId,
        record: ev.record,
        applicableExclusions: ev.applicableExclusions,
        scopeDetail: ev.scopeDetail,
      });
    }
  }
  return out.sort((a, b) => a.claimId - b.claimId);
}

// ---------------------------------------------------------------------------
// Corpus-recall assembly (pipeline question 1)
// ---------------------------------------------------------------------------

export async function assembleCorpusRecallEvidence(
  request: EvidenceRequest,
  source: CorpusRecallClaimSource,
): Promise<CorpusRecallResult> {
  const gate = prepare(request);
  if (!gate.ok) {
    return {
      status: "unavailable",
      population: "corpus_recall",
      conflictId: request.conflictId,
      kind: request.kind,
      reason: gate.reason,
    };
  }
  const { def, ctx, limits } = gate.prepared;
  const candidates = await source.corpusRecallCandidates(def, ctx.window);
  validateCandidateIntake(candidates);

  const records: CorpusRecallRecord[] = [];
  const evaluations: EligibilityEvaluation[] = [];
  // legacy-incomparable in-scope candidates, by classified lane — the honest
  // input for the lane diagnostics
  const legacyLanes = new Set<ConflictLaneId>();

  for (const candidate of candidates) {
    const ev = evaluateCorpusRecallEligibility(ctx, candidate);
    evaluations.push(ev);
    if (ev.record.included) {
      const docs = canonicalDocs(candidate.docs);
      records.push({
        population: "corpus_recall",
        claimId: candidate.claimId,
        conflictId: def.id,
        lane: ev.record.lane,
        theater: candidate.theater,
        track: candidate.track,
        hedge: candidate.hedging,
        claimDate: candidate.claimDate,
        text: candidate.text,
        sourceDocumentIds: docs.map((d) => d.docId),
        docs,
        independentSourceCount: ev.independentSourceCount,
        earliestIngestAt: ev.earliestIngestAt,
        inclusionReasons: ev.record.reasons,
        actorHits:
          ev.classification.kind === "unclassified" ? [] : ev.classification.actorHits,
        availability: ev.availability,
        sourceReliability: candidate.sourceReliability,
        engine: "mapreduce",
        currentExtractorVersion: true,
        extractorVersion: candidate.extractorVersion,
      });
    } else if (
      ev.record.reason === "legacy_incomparable" &&
      ev.classification.kind === "classified"
    ) {
      legacyLanes.add(ev.classification.lane);
    }
  }

  // every assembly list is deterministic regardless of source iteration
  // order: records in the pinned selection total order (reliability desc
  // nulls-last, claimId asc); excludedOf orders exclusions by claimId
  records.sort(compareEvidenceOrder);

  const includedLanes = new Set(records.map((r) => r.lane));
  const laneDiagnostics: Partial<Record<ConflictLaneId, LaneDiagnostic>> = {};
  // lane-sorted key insertion: the serialized object is byte-identical
  // regardless of candidate iteration order
  for (const lane of [...legacyLanes].sort()) {
    if (!includedLanes.has(lane)) laneDiagnostics[lane] = "unavailable_incomparable";
  }

  return {
    status: "assembled",
    assembly: {
      population: "corpus_recall",
      conflictId: def.id,
      evaluationKind: "retrospective",
      editionKey: gate.prepared.report.editionKey,
      reportDate: gate.prepared.report.reportDate,
      window: ctx.window,
      windowEndSource: ctx.window.windowEndSource,
      records,
      excluded: excludedOf(evaluations),
      eligibleCount: records.length,
      selection: selectEvidence(records, limits),
      laneDiagnostics,
      incomparableTheaters: def.contributorTheaters
        .filter((t) => t.comparability === "legacy_only")
        .map((t) => t.theater),
    },
  };
}

// ---------------------------------------------------------------------------
// Published-retention assembly (pipeline question 2) — SEPARATE
// ---------------------------------------------------------------------------

export async function assemblePublishedRetentionEvidence(
  request: EvidenceRequest,
  source: PublishedRetentionClaimSource,
): Promise<PublishedRetentionResult> {
  const gate = prepare(request);
  if (!gate.ok) {
    return {
      status: "unavailable",
      population: "published_retention",
      conflictId: request.conflictId,
      kind: request.kind,
      reason: gate.reason,
    };
  }
  const { def, ctx, limits } = gate.prepared;
  const candidates = await source.publishedRetentionCandidates(def, ctx.window);
  validateCandidateIntake(candidates);

  const records: PublishedRetentionRecord[] = [];
  const evaluations: EligibilityEvaluation[] = [];
  for (const candidate of candidates) {
    const ev = evaluatePublishedRetentionEligibility(ctx, candidate);
    evaluations.push(ev);
    if (!ev.record.included) continue;
    const docs = canonicalDocs(candidate.docs);
    records.push({
      population: "published_retention",
      claimId: candidate.claimId,
      conflictId: def.id,
      lane: ev.record.lane,
      theater: candidate.theater,
      track: candidate.track,
      hedge: candidate.hedging,
      claimDate: candidate.claimDate,
      text: candidate.text,
      sourceDocumentIds: docs.map((d) => d.docId),
      docs,
      independentSourceCount: ev.independentSourceCount,
      earliestIngestAt: ev.earliestIngestAt,
      inclusionReasons: ev.record.reasons,
      actorHits: ev.classification.kind === "unclassified" ? [] : ev.classification.actorHits,
      availability: ev.availability,
      sourceReliability: candidate.sourceReliability,
      provenance: candidate.engine,
      legacy: candidate.engine === "legacy",
      extractorVersion: candidate.extractorVersion,
    });
  }

  // deterministic output lists — same rule as the corpus assembly
  records.sort(compareEvidenceOrder);

  return {
    status: "assembled",
    assembly: {
      population: "published_retention",
      conflictId: def.id,
      evaluationKind: "retrospective",
      editionKey: gate.prepared.report.editionKey,
      reportDate: gate.prepared.report.reportDate,
      window: ctx.window,
      windowEndSource: ctx.window.windowEndSource,
      records,
      excluded: excludedOf(evaluations),
      eligibleCount: records.length,
      selection: selectEvidence(records, limits),
      legacyMemberCount: records.filter((r) => r.legacy).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture-shaped eligibility projection (acceptance-test wiring)
// ---------------------------------------------------------------------------

/** Project an assembly into the fixture corpus's `expected.eligibility` map
 *  shape: claimId (string) → EligibilityRecord. Corpus-recall assemblies only
 *  — the fixture SCOPE NOTE pins that map to the corpus-recall population. */
export function eligibilityByClaim(
  assembly: CorpusRecallAssembly,
): Record<string, EligibilityRecord> {
  const out: Record<string, EligibilityRecord> = {};
  for (const rec of assembly.records) {
    out[String(rec.claimId)] = { included: true, lane: rec.lane, reasons: rec.inclusionReasons };
  }
  for (const ex of assembly.excluded) {
    out[String(ex.claimId)] = ex.record;
  }
  return out;
}

/** The report's anchor treatments as the window recorded them (fixture
 *  `expected.timeAnchors` shape). */
export function timeAnchorTreatments(assembly: AssemblyBase): {
  cutoffAt: string;
  publishedAt: string;
} {
  return {
    cutoffAt: assembly.window.cutoffTreatment,
    publishedAt: assembly.window.publishedTreatment,
  };
}

// re-export for callers that need to classify anchors alongside assemblies
export { classifyTimeAnchor };
