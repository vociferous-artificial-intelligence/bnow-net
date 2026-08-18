// The pure combined scorer (Phase 4; contract §6.4, §3, §7; workstream
// prompt §12).
//
// Consumes ONE reference report's declared units plus BOTH Phase-3
// assemblies (corpus recall / published retention — structurally
// unconflatable) and one ConflictMatcher, and produces ONE report-level
// ConflictResultV1 carrying both pipeline questions' sections side by side
// (§6.1: separated, never conflated; §5.1 of the prompt: one report = one
// benchmark observation).
//
// ARITHMETIC (frozen):
//   - headline = matched / ALL declared Key Takeaways of the selected
//     edition; `partial` (compound bullet, incomplete evidence) counts as a
//     MISS and is surfaced beside the headline as partialDiagnostic
//     (register #2);
//   - lanes PARTITION the same declared units and never change the headline
//     denominator (row unit-sums are pinned equal to it by tests);
//   - NO unit-level `unavailable`: an incomparable-coverage unit stays in
//     the denominator as an honest miss carrying missDiagnostic
//     incomparable_coverage; the lane table carries the P3
//     unavailable_incomparable diagnostic (register #8 H1);
//   - the keyword rung keeps the FULL declared-unit denominator and reports
//     keywordUnmatchable (register #8 M1);
//   - NO composite score, and no accuracy/truth language in any label.
//
// FAIL-CLOSED MATCH ACCEPTANCE: a matcher outcome naming a claim that is
// not a member of the population being scored is REFUSED (typed error) —
// "no match to a claim outside the declared conflict scope merely to avoid
// a miss" is enforced mechanically, not hoped for. Full coverage on a
// compound unit is accepted from the deterministic fixture oracle ONLY
// (whose pair table attests it); every ladder-rung matcher is partial-only
// there (match-contract.ts).
//
// LEGAL (contract §5.8; corpus README audit rule): results carry unit
// identity as unit ids + structural metadata (lane, verdict, diagnostics)
// and claim identity as claim ids + structural metadata — NEVER unit text,
// and no claim text either (data minimization; the serialized-output audit
// test greps every result produced from the corpus). Hedge fields are the
// claims' OWN hedges, never reference wording, never strengthened.
//
// Pure: no DB, no provider, no env, no wall clock.

import {
  ACTOR_ROSTER_VERSIONS,
} from "./actor-rosters";
import { contributionByUnit, contributionTotals, type ContributingClaim } from "./contribution";
import { conflictDefinition } from "./definitions";
import { SCOPE_VERSIONS } from "./editions";
import { ConflictDomainError } from "./errors";
import {
  assertPersistableConflictResultV1,
  CONFLICT_HEADLINE_LABEL,
  validateConflictResultIdentityV1,
  type ConflictAgreementRecordV1,
  type ConflictBnowOnlyItemV1,
  type ConflictLaneCoverageRowV1,
  type ConflictMatcherStampV1,
  type ConflictPublicationGapResultV1,
  type ConflictReferenceOnlyRecordV1,
  type ConflictResultV1,
  type ConflictScoredResultV1,
  type ConflictTimingDiagnosticsV1,
  type ConflictUnavailableResultV1,
} from "./eval-profile";
import type {
  CorpusRecallAssembly,
  CorpusRecallResult,
  PublishedRetentionAssembly,
  PublishedRetentionResult,
} from "./evidence-assembler";
import type { CorpusRecallRecord, PublishedRetentionRecord } from "./evidence-records";
import { windowDaySpan } from "./evaluation-window";
import { classifyTimeAnchor, parseIsoInstantMs } from "./instants";
import { LANE_CLASSIFIER_VERSIONS } from "./lane-classifier";
import { laneById, laneIds, type ConflictLaneId } from "./lanes";
import {
  ladderDegradation,
  type ConflictMatcher,
  type ConflictMatcherLabel,
  type ConflictMatchOutcome,
  type MatchableUnit,
  type UnitClaimMatch,
} from "./match-contract";
import { assertMatchableUnits } from "./match-contract";
import { parseReferenceReportIdentity } from "./reference-report";
import {
  snapshotKindsForEvaluation,
  validateConflictSnapshotRefV1,
  type ConflictSnapshotRefV1,
} from "./snapshot-ref";
import {
  METHODOLOGY_EPOCH,
  type ConflictId,
  type EvaluationKind,
  type MissDiagnostic,
  type ReferenceSeriesId,
  type UnitVerdict,
} from "./vocabulary";

// ---------------------------------------------------------------------------
// Request shape
// ---------------------------------------------------------------------------

export interface ConflictScoreReport {
  series: string;
  editionKey: string;
  reportDate: string;
  /** RAW anchors (the window ladder already classified them in P3; the
   *  result stamps them raw per the P3 §5.1 carried condition) */
  cutoffAt: string | null;
  publishedAt: string | null;
  /** declared units WITH text — transient matcher input only */
  units: readonly MatchableUnit[];
}

export interface ConflictScoreRequest {
  conflictId: ConflictId;
  evaluationKind: EvaluationKind;
  /** null = a true publication gap (gap must then be provided) */
  report: ConflictScoreReport | null;
  gap: { series: ReferenceSeriesId; gapDate: string } | null;
  /** Phase 5 (snapshot-ref.ts): the VERIFIED snapshot ref that backed the
   *  scoring inputs, or null/absent (plain retrospective / fixture path —
   *  the default, which stamps `snapshot: { ref: null }` and leaves golden
   *  bytes untouched). Callers resolve artifact existence/hash through
   *  resolveConflictSnapshot BEFORE scoring; the scorer re-validates the
   *  ref's structure and identity fail-closed. */
  snapshot?: ConflictSnapshotRefV1 | null;
}

// ---------------------------------------------------------------------------
// Internal population view (normalizes the two record types)
// ---------------------------------------------------------------------------

type AnyRecord = CorpusRecallRecord | PublishedRetentionRecord;

function isLegacy(record: AnyRecord): boolean {
  return record.population === "published_retention" && record.legacy;
}

interface PopulationScore {
  verdicts: Record<string, UnitVerdict>;
  agreements: ConflictAgreementRecordV1[];
  referenceOnly: ConflictReferenceOnlyRecordV1[];
  bnowOnlyRecords: AnyRecord[];
  multiUnitClaims: Record<string, readonly string[]>;
  independentSources: Record<string, number>;
  thinSourced: { count: number; denominator: number };
  timing: ConflictTimingDiagnosticsV1;
  /** unitId → FULL-pair contributing claims (contribution input) */
  fullMatchClaims: Map<string, ContributingClaim[]>;
  matched: number;
  partialUnits: Set<string>;
}

function validateOutcome(
  outcome: ConflictMatchOutcome,
  matcherKind: string,
  units: readonly MatchableUnit[],
  members: ReadonlyMap<number, AnyRecord>,
): void {
  const unitById = new Map(units.map((u) => [u.unitId, u]));
  const seen = new Set<string>();
  for (const m of outcome.matches) {
    const unit = unitById.get(m.unitId);
    if (unit === undefined) {
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `match references undeclared unit ${JSON.stringify(m.unitId)}`,
      );
    }
    if (!members.has(m.claimId)) {
      // §6.3: no out-of-scope rescue matches — a claim outside the scored
      // population can never satisfy a unit
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `match names claim ${m.claimId}, which is not a member of the scored population — refusing an out-of-population rescue match`,
      );
    }
    const key = `${m.unitId}:${m.claimId}`;
    if (seen.has(key)) {
      throw new ConflictDomainError("invalid_match_outcome", `duplicate match pair ${key}`);
    }
    seen.add(key);
    if (m.coverage === "partial" && !unit.compound) {
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `partial coverage on non-compound unit ${m.unitId} — partial is the compound-bullet diagnostic only`,
      );
    }
    if (m.coverage === "full" && unit.compound && matcherKind !== "fixture-oracle") {
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `matcher kind ${matcherKind} claimed FULL coverage of compound unit ${m.unitId} — only the fixture oracle's pair table may attest full compound coverage`,
      );
    }
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.floor(sorted.length / 2)].toFixed(1);
}

function timingOf(
  pairClaims: readonly { record: AnyRecord }[],
  reportPublishedMs: number | null,
): ConflictTimingDiagnosticsV1 {
  const byIngest: number[] = [];
  const bySource: number[] = [];
  if (reportPublishedMs !== null) {
    for (const { record } of pairClaims) {
      if (record.earliestIngestAt !== null) {
        const ms = parseIsoInstantMs(record.earliestIngestAt);
        if (ms !== null) byIngest.push((reportPublishedMs - ms) / 3.6e6);
      }
      // source-declared publish time, SEPARATE metric (never a substitute)
      let earliest: number | null = null;
      for (const doc of record.docs) {
        if (doc.publishedAt === null) continue;
        const ms = parseIsoInstantMs(doc.publishedAt);
        if (ms !== null && (earliest === null || ms < earliest)) earliest = ms;
      }
      if (earliest !== null) bySource.push((reportPublishedMs - earliest) / 3.6e6);
    }
  }
  return {
    medianLeadHoursByIngest: median(byIngest),
    medianLeadHoursBySourceDeclared: median(bySource),
    agreements: pairClaims.length,
  };
}

function scorePopulation(
  units: readonly MatchableUnit[],
  outcome: ConflictMatchOutcome,
  matcherKind: string,
  selected: readonly AnyRecord[],
  laneDiagnostics: CorpusRecallAssembly["laneDiagnostics"] | null,
  reportPublishedMs: number | null,
): PopulationScore {
  const members = new Map<number, AnyRecord>(selected.map((r) => [r.claimId, r]));
  validateOutcome(outcome, matcherKind, units, members);

  const pairsByUnit = new Map<string, UnitClaimMatch[]>();
  for (const m of outcome.matches) {
    const list = pairsByUnit.get(m.unitId) ?? [];
    list.push(m);
    pairsByUnit.set(m.unitId, list);
  }

  const verdicts: Record<string, UnitVerdict> = {};
  const agreements: ConflictAgreementRecordV1[] = [];
  const referenceOnly: ConflictReferenceOnlyRecordV1[] = [];
  const independentSources: Record<string, number> = {};
  const fullMatchClaims = new Map<string, ContributingClaim[]>();
  const partialUnits = new Set<string>();
  const allPairClaims: { record: AnyRecord }[] = [];
  let matched = 0;

  for (const unit of units) {
    const pairs = [...(pairsByUnit.get(unit.unitId) ?? [])].sort((a, b) => a.claimId - b.claimId);
    const full = pairs.filter((p) => p.coverage === "full");
    const verdict: UnitVerdict = full.length > 0 ? "matched" : pairs.length > 0 ? "partial" : "miss";
    verdicts[unit.unitId] = verdict;
    if (verdict === "matched") matched += 1;
    if (verdict === "partial") partialUnits.add(unit.unitId);

    if (pairs.length > 0) {
      agreements.push({
        unitId: unit.unitId,
        lane: unit.lane,
        claims: pairs.map((p) => {
          const record = members.get(p.claimId) as AnyRecord;
          allPairClaims.push({ record });
          return {
            claimId: p.claimId,
            coverage: p.coverage,
            confidence: p.confidence,
            theater: record.theater,
            track: record.track,
            hedge: record.hedge,
            earliestIngestAt: record.earliestIngestAt,
            atCutoff: record.availability.atCutoff,
            atPublication: record.availability.atPublication,
            independentSourceCount: record.independentSourceCount,
            legacy: isLegacy(record),
          };
        }),
      });
      // distinct non-mirror docs across the unit's agreement claims
      const docIds = new Set<number>();
      for (const p of pairs) {
        const record = members.get(p.claimId) as AnyRecord;
        for (const doc of record.docs) if (doc.mirrorOfDocId === null) docIds.add(doc.docId);
      }
      independentSources[unit.unitId] = docIds.size;
    }
    if (verdict !== "matched") {
      const missDiagnostic: MissDiagnostic | null =
        verdict === "miss" && laneDiagnostics?.[unit.lane] === "unavailable_incomparable"
          ? "incomparable_coverage"
          : null;
      referenceOnly.push({
        unitId: unit.unitId,
        lane: unit.lane,
        verdict,
        missDiagnostic,
        compound: unit.compound,
        negative: unit.negative,
      });
    }
    if (full.length > 0) {
      fullMatchClaims.set(
        unit.unitId,
        full.map((p) => {
          const record = members.get(p.claimId) as AnyRecord;
          return {
            claimId: record.claimId,
            theater: record.theater,
            track: record.track,
            docs: record.docs,
          };
        }),
      );
    }
  }

  // one claim matching multiple units: VISIBLE (constrained by the
  // atomic/compound policy at the matcher; register #9)
  const unitsByClaim = new Map<number, string[]>();
  for (const m of outcome.matches) {
    const list = unitsByClaim.get(m.claimId) ?? [];
    list.push(m.unitId);
    unitsByClaim.set(m.claimId, list);
  }
  const multiUnitClaims: Record<string, readonly string[]> = {};
  for (const claimId of [...unitsByClaim.keys()].sort((a, b) => a - b)) {
    const unitIds = unitsByClaim.get(claimId) as string[];
    if (unitIds.length >= 2) multiUnitClaims[String(claimId)] = [...unitIds].sort();
  }

  const matchedClaimIds = new Set(outcome.matches.map((m) => m.claimId));
  const bnowOnlyRecords = selected.filter((r) => !matchedClaimIds.has(r.claimId));

  return {
    verdicts,
    agreements,
    referenceOnly,
    bnowOnlyRecords,
    multiUnitClaims,
    independentSources,
    thinSourced: {
      count: selected.filter(
        (r) => r.independentSourceCount < 2 && (r.hedge === "claimed" || r.hedge === "unverified"),
      ).length,
      denominator: selected.length,
    },
    timing: timingOf(allPairClaims, reportPublishedMs),
    fullMatchClaims,
    matched,
    partialUnits,
  };
}

// ---------------------------------------------------------------------------
// The scorer
// ---------------------------------------------------------------------------

export async function scoreConflictReport(
  request: ConflictScoreRequest,
  corpus: CorpusRecallResult,
  retention: PublishedRetentionResult,
  matcher: ConflictMatcher,
): Promise<ConflictResultV1> {
  const def = conflictDefinition(request.conflictId);
  const common = {
    version: 1 as const,
    conflictId: def.id,
    methodologyEpoch: METHODOLOGY_EPOCH,
    laneTaxonomyVersion: def.laneTaxonomyVersion,
    evidencePolicyVersion: def.evidencePolicyVersion,
    evaluationKind: request.evaluationKind,
  };

  // Phase-5 snapshot identity, validated on EVERY path (Gate-5 ops MINOR-1:
  // an invalid ref is an invalid REQUEST — a gap/unavailable request carrying
  // garbage previously returned a normal result with the ref silently
  // dropped). Structure + identity validation is fail-closed HERE; artifact
  // existence/hash resolution happens upstream via resolveConflictSnapshot —
  // the scorer is pure and does no IO. Error messages never echo ref values
  // (stored-error discipline). Unavailable/gap variants still carry NO
  // snapshot stamp (their shapes have no snapshot field by design): a valid
  // ref on those paths is simply not stamped.
  const snapshotRef = request.snapshot ?? null;
  if (snapshotRef !== null) {
    if (validateConflictSnapshotRefV1(snapshotRef).length > 0) {
      throw new ConflictDomainError(
        "invalid_score_request",
        "request.snapshot is not a valid ConflictSnapshotRefV1",
      );
    }
    if (snapshotRef.conflictId !== request.conflictId) {
      throw new ConflictDomainError(
        "invalid_score_request",
        "request.snapshot names a different conflict than the request",
      );
    }
    if (!snapshotKindsForEvaluation(request.evaluationKind).includes(snapshotRef.captureKind)) {
      throw new ConflictDomainError(
        "invalid_score_request",
        "request.snapshot capture kind cannot back this evaluation kind",
      );
    }
  }

  // -- unavailable paths (both assemblies must agree; never half-scored) --
  if (corpus.status === "unavailable" || retention.status === "unavailable") {
    if (corpus.status !== "unavailable" || retention.status !== "unavailable") {
      throw new ConflictDomainError(
        "invalid_score_request",
        "one population assembled while the other is unavailable — the two pipeline questions must share one availability verdict",
      );
    }
    if (corpus.reason !== retention.reason) {
      throw new ConflictDomainError(
        "invalid_score_request",
        `population unavailability reasons disagree: ${corpus.reason} vs ${retention.reason}`,
      );
    }
    if (corpus.reason === "publication_gap") {
      if (request.report !== null || request.gap === null) {
        throw new ConflictDomainError(
          "invalid_score_request",
          "a publication gap requires report: null and an explicit gap {series, gapDate}",
        );
      }
      const gap: ConflictPublicationGapResultV1 = {
        ...common,
        state: "unavailable",
        unavailableReason: "publication_gap",
        series: request.gap.series,
        gapDate: request.gap.gapDate,
      };
      throwOnIdentityIssues(gap);
      return gap;
    }
    if (request.report === null) {
      throw new ConflictDomainError(
        "invalid_score_request",
        `unavailable reason ${corpus.reason} requires the report identity`,
      );
    }
    const unavailable: ConflictUnavailableResultV1 = {
      ...common,
      state: "unavailable",
      report: reportIdentityOf(def.referenceSeries, request.report),
      unavailableReason: corpus.reason,
    };
    throwOnIdentityIssues(unavailable);
    return unavailable;
  }

  // -- scored path --
  if (request.report === null) {
    throw new ConflictDomainError(
      "invalid_score_request",
      "assembled populations but no report in the request",
    );
  }
  if (request.gap !== null) {
    throw new ConflictDomainError(
      "invalid_score_request",
      "a request with a report must not carry a gap",
    );
  }
  // REGISTER #5, mechanically (Gate-5 control-plane MAJOR-1; the twin of the
  // persistence-gate refusal): no reviewed capture path exists in this
  // workstream, so a snapshot-anchored evaluation kind can NEVER produce a
  // SCORED result — snapshot resolution refuses upstream
  // (population_unproven), and this guard makes that terminal rung
  // non-skippable by a caller that mints assemblies without resolution. The
  // future reviewed capture path lifts this refusal via its own
  // decision-register entry.
  if (request.evaluationKind !== "retrospective") {
    throw new ConflictDomainError(
      "invalid_score_request",
      `evaluation kind ${request.evaluationKind} cannot produce a scored result: no reviewed capture path exists (register #5) — snapshot kinds terminate unavailable/no_proven_snapshot`,
    );
  }
  const report = request.report;
  const units = report.units;
  // a report with ZERO declared units is a PARSE FAILURE, not a benchmark
  // observation: scoring it would mint the §6.4-forbidden 0/0 headline (and
  // the offline report would print "0/0 declared Key Takeaways")
  if (units.length === 0) {
    throw new ConflictDomainError(
      "invalid_score_request",
      "a report with zero declared units is a parse failure, not a benchmark observation — refuse upstream, never score 0/0",
    );
  }
  assertMatchableUnits(units);
  for (const unit of units) laneById(def.laneTaxonomyVersion, unit.lane); // fail-closed lanes

  const ca = corpus.assembly;
  const ra = retention.assembly;
  assertAssemblyAgreement(request.conflictId, report, ca, ra);

  const identity = reportIdentityOf(def.referenceSeries, report);
  const publishedMs =
    identity.publishedAt !== null ? parseIsoInstantMs(identity.publishedAt) : null;

  const corpusClaims = ca.selection.selected.map((r) => ({
    claimId: r.claimId,
    text: r.text,
    hedging: r.hedge,
  }));
  const retentionClaims = ra.selection.selected.map((r) => ({
    claimId: r.claimId,
    text: r.text,
    hedging: r.hedge,
  }));
  const corpusOutcome = await matcher.match(units, corpusClaims);
  const retentionOutcome = await matcher.match(units, retentionClaims);

  const corpusScore = scorePopulation(
    units,
    corpusOutcome,
    matcher.kind,
    ca.selection.selected,
    ca.laneDiagnostics,
    publishedMs,
  );
  const retentionScore = scorePopulation(
    units,
    retentionOutcome,
    matcher.kind,
    ra.selection.selected,
    null, // the lane-incomparability diagnostic is a corpus-recall statement
    publishedMs,
  );

  const label = combinedLabel(corpusOutcome.label, retentionOutcome.label);
  const matcherStamp = matcherStampOf(matcher.kind, label, corpusOutcome, retentionOutcome);
  const keywordUnmatchable = keywordUnmatchableOf(corpusOutcome, retentionOutcome);

  const denominator = units.length;
  const partialDistinct = new Set([
    ...corpusScore.partialUnits,
    ...retentionScore.partialUnits,
  ]).size;

  const missDiagnostic: Record<string, MissDiagnostic> = {};
  for (const row of corpusScore.referenceOnly) {
    if (row.missDiagnostic !== null) missDiagnostic[row.unitId] = row.missDiagnostic;
  }

  const contribution = contributionByUnit(corpusScore.fullMatchClaims);
  const retentionContribution = contributionByUnit(retentionScore.fullMatchClaims);

  const result: ConflictScoredResultV1 = {
    ...common,
    state: "scored",
    report: identity,
    windowEndSource: ca.windowEndSource,
    headline: {
      corpusRecall: { matched: corpusScore.matched, denominator },
      publishedRetention: { matched: retentionScore.matched, denominator },
      ...(partialDistinct > 0 ? { partialDiagnostic: partialDistinct } : {}),
    },
    corpusRecall: corpusScore.verdicts,
    publishedRetention: retentionScore.verdicts,
    ...(Object.keys(missDiagnostic).length > 0 ? { missDiagnostic } : {}),
    ...(Object.keys(ca.laneDiagnostics).length > 0 ? { laneDiagnostics: ca.laneDiagnostics } : {}),
    matcherRung: label,
    ...(keywordUnmatchable !== null ? { keywordUnmatchable } : {}),
    contribution,
    headlineLabel: CONFLICT_HEADLINE_LABEL,
    window: {
      reportDate: report.reportDate,
      cutoffAtRaw: report.cutoffAt,
      publishedAtRaw: report.publishedAt,
      cutoffTreatment: ca.window.cutoffTreatment,
      publishedTreatment: ca.window.publishedTreatment,
      windowEndSource: ca.windowEndSource,
      startDate: ca.window.startDate,
      endDate: ca.window.endDate,
      days: windowDaySpan(ca.window).length,
    },
    selection: {
      limits: ca.selection.bounds.limits,
      corpusRecall: selectionStampOf(ca),
      publishedRetention: selectionStampOf(ra),
    },
    versions: {
      actorRosterVersion: ACTOR_ROSTER_VERSIONS[def.id],
      laneClassifierVersion: LANE_CLASSIFIER_VERSIONS[def.id],
      extractorVersions: [
        ...new Set(
          ca.records
            .map((r) => r.extractorVersion)
            .filter((v): v is string => v !== null),
        ),
      ].sort(),
      scopeVersion: identity.scopeVersion,
    },
    matcher: matcherStamp,
    voteAudit: {
      corpusRecall: corpusOutcome.votes,
      publishedRetention: retentionOutcome.votes,
    },
    lanes: laneRowsOf(def.laneTaxonomyVersion, units, corpusScore, retentionScore, ca),
    agreements: {
      corpusRecall: corpusScore.agreements,
      publishedRetention: retentionScore.agreements,
    },
    referenceOnly: {
      corpusRecall: corpusScore.referenceOnly,
      publishedRetention: retentionScore.referenceOnly,
    },
    bnowOnly: {
      // corpus recall feeds internal counts ONLY (register #7 pin)
      corpusRecall: { count: corpusScore.bnowOnlyRecords.length },
      publishedRetention: {
        count: retentionScore.bnowOnlyRecords.length,
        items: retentionScore.bnowOnlyRecords.map(
          (r): ConflictBnowOnlyItemV1 => ({
            claimId: r.claimId,
            lane: r.lane,
            theater: r.theater,
            track: r.track,
            hedge: r.hedge,
            legacy: isLegacy(r),
          }),
        ),
      },
    },
    multiUnitClaims: {
      corpusRecall: corpusScore.multiUnitClaims,
      publishedRetention: retentionScore.multiUnitClaims,
    },
    independentSources: {
      corpusRecall: corpusScore.independentSources,
      publishedRetention: retentionScore.independentSources,
    },
    thinSourced: {
      corpusRecall: corpusScore.thinSourced,
      publishedRetention: retentionScore.thinSourced,
    },
    timing: {
      corpusRecall: corpusScore.timing,
      publishedRetention: retentionScore.timing,
    },
    contributionTotals: contributionTotals(contribution),
    contributionPublishedRetention: retentionContribution,
    runGroupKey: [
      def.id,
      report.editionKey,
      request.evaluationKind,
      METHODOLOGY_EPOCH,
      matcher.kind,
      `k=${matcherStamp.votesK ?? 0}`,
    ].join("|"),
    snapshot: { ref: snapshotRef },
  };

  throwOnIdentityIssues(result);
  assertPersistableConflictResultV1(result);
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function throwOnIdentityIssues(result: ConflictResultV1): void {
  const issues = validateConflictResultIdentityV1(result);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_score_request", "invalid scored result", issues);
  }
}

function reportIdentityOf(
  series: ReferenceSeriesId,
  report: ConflictScoreReport,
): ReturnType<typeof parseReferenceReportIdentity> {
  const cutoff = classifyTimeAnchor(report.cutoffAt);
  const published = classifyTimeAnchor(report.publishedAt);
  return parseReferenceReportIdentity({
    series: report.series,
    editionKey: report.editionKey,
    reportDate: report.reportDate,
    // identity anchors are normalized (malformed → null, recorded raw in the
    // window stamp — never guessed; contract §9)
    cutoffAt: cutoff.treatment === "present" ? report.cutoffAt : null,
    publishedAt: published.treatment === "present" ? report.publishedAt : null,
    scopeVersion: SCOPE_VERSIONS[series],
  });
}

function assertAssemblyAgreement(
  conflictId: ConflictId,
  report: ConflictScoreReport,
  ca: CorpusRecallAssembly,
  ra: PublishedRetentionAssembly,
): void {
  for (const [name, assembly] of [
    ["corpus-recall", ca],
    ["published-retention", ra],
  ] as const) {
    if (assembly.conflictId !== conflictId) {
      throw new ConflictDomainError(
        "invalid_score_request",
        `${name} assembly is for ${assembly.conflictId}, not ${conflictId}`,
      );
    }
    if (assembly.editionKey !== report.editionKey || assembly.reportDate !== report.reportDate) {
      throw new ConflictDomainError(
        "invalid_score_request",
        `${name} assembly identity (${assembly.editionKey} / ${assembly.reportDate}) disagrees with the request report (${report.editionKey} / ${report.reportDate})`,
      );
    }
  }
  if (
    ca.window.startMs !== ra.window.startMs ||
    ca.window.endMs !== ra.window.endMs ||
    ca.windowEndSource !== ra.windowEndSource
  ) {
    throw new ConflictDomainError(
      "invalid_score_request",
      "the two assemblies computed different evaluation windows for one report",
    );
  }
  const cl = ca.selection.bounds.limits;
  const rl = ra.selection.bounds.limits;
  if (
    cl.maxCandidates !== rl.maxCandidates ||
    cl.textByteBudget !== rl.textByteBudget ||
    cl.mixCapFraction !== rl.mixCapFraction
  ) {
    throw new ConflictDomainError(
      "invalid_score_request",
      "the two assemblies ran under different selection limits",
    );
  }
}

function selectionStampOf(assembly: CorpusRecallAssembly | PublishedRetentionAssembly) {
  return {
    eligibleCount: assembly.eligibleCount,
    selectedCount: assembly.selection.bounds.selectedCount,
    cappedOutCount: assembly.selection.cappedOut.length,
    budgetOutCount: assembly.selection.budgetOut.length,
    totalTextBytes: assembly.selection.bounds.totalTextBytes,
  };
}

/** One result label from the two population resolutions: both oracle →
 *  oracle; both ladder → the MORE degraded rung; mixed → refused (a single
 *  result must not blend a test oracle with a live rung). */
function combinedLabel(
  a: ConflictMatcherLabel,
  b: ConflictMatcherLabel,
): ConflictMatcherLabel {
  const aOracle = a === "fixture-oracle";
  const bOracle = b === "fixture-oracle";
  if (aOracle !== bOracle) {
    throw new ConflictDomainError(
      "invalid_match_outcome",
      `population match labels mix the fixture oracle with a ladder rung (${a} vs ${b})`,
    );
  }
  if (aOracle && bOracle) return "fixture-oracle";
  return ladderDegradation(a as Exclude<ConflictMatcherLabel, "fixture-oracle">) >=
    ladderDegradation(b as Exclude<ConflictMatcherLabel, "fixture-oracle">)
    ? a
    : b;
}

function matcherStampOf(
  kind: ConflictMatcher["kind"],
  label: ConflictMatcherLabel,
  corpusOutcome: ConflictMatchOutcome,
  retentionOutcome: ConflictMatchOutcome,
): ConflictMatcherStampV1 {
  const votesK = corpusOutcome.votesK ?? retentionOutcome.votesK;
  if (
    corpusOutcome.votesK !== null &&
    retentionOutcome.votesK !== null &&
    corpusOutcome.votesK !== retentionOutcome.votesK
  ) {
    throw new ConflictDomainError(
      "invalid_match_outcome",
      "the two population match calls report different votesK",
    );
  }
  const model = corpusOutcome.model ?? retentionOutcome.model;
  if (
    corpusOutcome.model !== null &&
    retentionOutcome.model !== null &&
    corpusOutcome.model !== retentionOutcome.model
  ) {
    throw new ConflictDomainError(
      "invalid_match_outcome",
      "the two population match calls report different models",
    );
  }
  return {
    kind,
    label,
    votesK,
    model,
    corpusRecall: { label: corpusOutcome.label, voteRounds: corpusOutcome.voteRounds },
    publishedRetention: {
      label: retentionOutcome.label,
      voteRounds: retentionOutcome.voteRounds,
    },
  };
}

/** keywordUnmatchable is a unit-only property, so any keyword-rung outcome
 *  reports the same count; disagreement is an adapter defect. Null when no
 *  population resolved to the keyword rung. */
function keywordUnmatchableOf(
  corpusOutcome: ConflictMatchOutcome,
  retentionOutcome: ConflictMatchOutcome,
): number | null {
  const a = corpusOutcome.keywordUnmatchable;
  const b = retentionOutcome.keywordUnmatchable;
  if (a !== null && b !== null && a !== b) {
    throw new ConflictDomainError(
      "invalid_match_outcome",
      `keywordUnmatchable disagrees between populations (${a} vs ${b}) — it counts declared units, not claims`,
    );
  }
  return a ?? b;
}

/** Lane rows PARTITION the declared units (taxonomy order; rows only for
 *  lanes holding ≥1 declared unit or carrying a diagnostic). Unit-count sums
 *  equal the headline denominator — pinned by tests. */
function laneRowsOf(
  taxonomyVersion: string,
  units: readonly MatchableUnit[],
  corpusScore: PopulationScore,
  retentionScore: PopulationScore,
  ca: CorpusRecallAssembly,
): ConflictLaneCoverageRowV1[] {
  const laneOrder = conflictLaneOrder(taxonomyVersion);
  const rows: ConflictLaneCoverageRowV1[] = [];
  for (const lane of laneOrder) {
    const laneUnits = units.filter((u) => u.lane === lane);
    const diagnostic = ca.laneDiagnostics[lane] ?? null;
    if (laneUnits.length === 0 && diagnostic === null) continue;
    rows.push({
      lane,
      units: laneUnits.length,
      corpusRecall: laneCounts(laneUnits, corpusScore.verdicts),
      publishedRetention: laneCounts(laneUnits, retentionScore.verdicts),
      diagnostic,
    });
  }
  return rows;
}

function laneCounts(
  laneUnits: readonly MatchableUnit[],
  verdicts: Readonly<Record<string, UnitVerdict>>,
): { matched: number; partial: number; miss: number } {
  const counts = { matched: 0, partial: 0, miss: 0 };
  for (const unit of laneUnits) counts[verdicts[unit.unitId]] += 1;
  return counts;
}

function conflictLaneOrder(taxonomyVersion: string): readonly ConflictLaneId[] {
  return laneIds(taxonomyVersion); // fail-closed on the version
}
