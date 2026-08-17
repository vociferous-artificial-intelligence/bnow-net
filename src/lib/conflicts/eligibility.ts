// The Phase 3 eligibility engine (contract §5 — the 8 frozen predicates).
//
// Pure functions evaluating one candidate claim against one conflict and one
// FROZEN evaluation window, producing either an INCLUDED record (lane assigned
// through the fail-closed taxonomy helpers; inclusion diagnostics in the
// fixture corpus's reason vocabulary) or an EXCLUDED record carrying the ONE
// dominant bounded reason under the frozen precedence order
// (vocabulary.ts dominantExclusionReason: stub_fixture → missing_source →
// superseded_version → mirror_only → off_window → off_scope →
// legacy_incomparable → unclassified; integrity before scope before
// comparability). ALL applicable reasons are collected first; precedence picks
// the survivor — the engine never stops at the first failure it happens to
// test.
//
// ANTI-GAMING (contract §5, structural): the inputs are the conflict
// definition, the evaluation window (derived ONLY from the report's time
// anchors), the report date, and the candidate — no reference-report content
// can reach this function because no input field can carry it (see
// evidence-records.ts).
//
// The predicate-to-reason mapping, recorded:
//   P1 series membership ......... the engine is invoked FOR one conflict; a
//                                  theater outside the conflict's contributor
//                                  roster is off_scope
//   P2 window .................... day-granular claimDate outside the frozen
//                                  window (or missing/malformed — conservative
//                                  bounded treatment, documented) → off_window
//   P3-P5 lane/actor/geography ... lane-classifier verdict: off_scope /
//                                  unclassified
//   P6 track + current version ... non-designated track → off_scope;
//                                  superseded mapreduce version →
//                                  superseded_version
//   P7 traceability + non-stub ... stub → stub_fixture; zero raw-document
//                                  links → missing_source; only mirror
//                                  documents → mirror_only
//   P8 engine comparability ...... legacy engine → legacy_incomparable in the
//                                  CORPUS-RECALL population (legacy claims are
//                                  published-retention members instead,
//                                  labeled — evidence-assembler.ts)

import type { ConflictDefinition } from "./definitions";
import { classifyTimeAnchor, parseIsoInstantMs } from "./instants";
import { isClaimDateInWindow, type EvaluationWindow } from "./evaluation-window";
import { laneById, type EligibilityRecord } from "./lanes";
import { classifyCandidate, type LaneClassification } from "./lane-classifier";
import { dominantExclusionReason, type ExclusionReason } from "./vocabulary";
import type { CandidateClaim, ClaimAvailability } from "./evidence-records";

export interface EligibilityContext {
  def: ConflictDefinition;
  window: EvaluationWindow;
  /** yyyy-mm-dd of the report (window-reason labeling only — never content) */
  reportDate: string;
  /** RAW report anchors for the availability diagnostics */
  cutoffAt: string | null;
  publishedAt: string | null;
}

export interface EligibilityEvaluation {
  claimId: number;
  record: EligibilityRecord;
  /** every reason that applied (the dominant one is record.reason when
   *  excluded) — visible, so precedence outcomes are auditable */
  applicableExclusions: readonly ExclusionReason[];
  classification: LaneClassification;
  windowReason: string | null;
  availability: ClaimAvailability;
  earliestIngestAt: string | null;
  independentSourceCount: number;
}

/** Which retention-designated tracks a LEGACY contributor theater has: the
 *  il/gulf digests are military-track products (the specialty nuclear/elite
 *  tracks run only where configured — none of the legacy theaters). Part of
 *  the retention population definition under the evidence policy version. */
export const LEGACY_CONTRIBUTOR_TRACKS: readonly string[] = ["military"];

function earliestIngest(candidate: CandidateClaim): { raw: string | null; ms: number | null } {
  let best: { raw: string; ms: number } | null = null;
  for (const doc of candidate.docs) {
    if (doc.fetchedAt === null) continue;
    const ms = parseIsoInstantMs(doc.fetchedAt);
    if (ms === null) continue;
    if (best === null || ms < best.ms) best = { raw: doc.fetchedAt, ms };
  }
  return best === null ? { raw: null, ms: null } : best;
}

function availabilityOf(
  ctx: Pick<EligibilityContext, "cutoffAt" | "publishedAt">,
  ingestMs: number | null,
): ClaimAvailability {
  const cutoff = classifyTimeAnchor(ctx.cutoffAt);
  const published = classifyTimeAnchor(ctx.publishedAt);
  return {
    // inclusive "at or before" (frozen §5 boundary rule); null = truthfully
    // unknown, never coerced to false
    atCutoff:
      cutoff.treatment === "present" && ingestMs !== null
        ? ingestMs <= (cutoff.instantMs as number)
        : null,
    atPublication:
      published.treatment === "present" && ingestMs !== null
        ? ingestMs <= (published.instantMs as number)
        : null,
  };
}

function windowReasonOf(ctx: EligibilityContext, claimDate: string): string {
  if (claimDate === ctx.window.startDate) return "window:in-edge";
  // a post-report-day claim is inside the window only because a parseable
  // END anchor extended endDate past the report date — label WHICH rung
  // (symmetric: cutoff and published both get their label)
  if (claimDate > ctx.reportDate && ctx.window.windowEndSource === "cutoff") {
    return "window:in-cutoff-end";
  }
  if (claimDate > ctx.reportDate && ctx.window.windowEndSource === "published") {
    return "window:in-published-end";
  }
  return "window:in";
}

/** Count of the candidate's own non-mirror documents (mirrors add zero
 *  independence — contract §6.3). */
export function independentSourceCount(candidate: CandidateClaim): number {
  return candidate.docs.filter((d) => d.mirrorOfDocId === null).length;
}

/**
 * Evaluate the 8 frozen predicates for the CORPUS-RECALL population.
 * Pure; wall-clock free; total (never throws on candidate CONTENT — only a
 * classifier lane outside the conflict's frozen taxonomy throws, which is a
 * configuration bug, not a data condition).
 */
export function evaluateCorpusRecallEligibility(
  ctx: EligibilityContext,
  candidate: CandidateClaim,
): EligibilityEvaluation {
  const exclusions: ExclusionReason[] = [];
  const classification = classifyCandidate(ctx.def.id, {
    text: candidate.text,
    track: candidate.track,
  });

  // P7 integrity
  if (candidate.stub) exclusions.push("stub_fixture");
  if (candidate.docs.length === 0) exclusions.push("missing_source");
  // P6 current version (mapreduce rows only; legacy comparability is P8)
  if (candidate.engine === "mapreduce" && !candidate.currentExtractorVersion) {
    exclusions.push("superseded_version");
  }
  // P7 mirror-only: has documents but every one is a mirror
  if (candidate.docs.length > 0 && candidate.docs.every((d) => d.mirrorOfDocId !== null)) {
    exclusions.push("mirror_only");
  }
  // P2 window (day-granular; a missing/malformed claimDate is conservatively
  // out-of-window — the bounded vocabulary's honest member for "cannot be
  // placed inside the window", recorded here as a deliberate treatment)
  const inWindow = isClaimDateInWindow(ctx.window, candidate.claimDate);
  if (!inWindow) exclusions.push("off_window");
  // P1 + P6 scope-by-roster: theater and track must be designated contributors
  const theaterEntry = ctx.def.contributorTheaters.find((t) => t.theater === candidate.theater);
  const trackDesignated = (ctx.def.contributorTracks as readonly string[]).includes(
    candidate.track,
  );
  if (theaterEntry === undefined || !trackDesignated) exclusions.push("off_scope");
  // P3-P5 classifier scope
  if (classification.kind === "off_scope") exclusions.push("off_scope");
  if (classification.kind === "unclassified") exclusions.push("unclassified");
  // P8 comparability
  if (candidate.engine === "legacy") exclusions.push("legacy_incomparable");

  const ingest = earliestIngest(candidate);
  const availability = availabilityOf(ctx, ingest.ms);
  const indep = independentSourceCount(candidate);

  // one predicate family can fail twice (roster off_scope AND classifier
  // off_scope): diagnostics carry each reason at most once (first-occurrence
  // order preserved; dominance unaffected)
  const applicable = [...new Set(exclusions)];
  if (applicable.length > 0) {
    return {
      claimId: candidate.claimId,
      record: { included: false, reason: dominantExclusionReason(applicable) },
      applicableExclusions: applicable,
      classification,
      windowReason: inWindow ? windowReasonOf(ctx, candidate.claimDate) : null,
      availability,
      earliestIngestAt: ingest.raw,
      independentSourceCount: indep,
    };
  }

  // included: classification is necessarily "classified" here
  const classified = classification as Extract<LaneClassification, { kind: "classified" }>;
  // Gate-1 carried condition: the lane enters the record ONLY through the
  // fail-closed helper against the conflict's frozen taxonomy version
  const lane = laneById(ctx.def.laneTaxonomyVersion, classified.lane).id;
  const windowReason = windowReasonOf(ctx, candidate.claimDate);
  return {
    claimId: candidate.claimId,
    record: {
      included: true,
      lane,
      reasons: [...classified.reasons, windowReason],
    },
    applicableExclusions: [],
    classification,
    windowReason,
    availability,
    earliestIngestAt: ingest.raw,
    independentSourceCount: indep,
  };
}

/**
 * Evaluate membership in the PUBLISHED-RETENTION population (register #4):
 * claims that GENUINELY appeared in designated user-facing digests. Callers
 * feed only published claims (the source contract); this function re-checks
 * `published` fail-closed. Differences from corpus recall, recorded:
 *   - legacy-engine claims are MEMBERS (labeled by the assembler) — the
 *     legacy_incomparable predicate does not apply here;
 *   - extractor versioning does not apply: the retention question is about
 *     what the published output contained, not which map version produced it
 *     (superseded_version is never a retention exclusion);
 *   - legacy contributor theaters designate only their military-track digests
 *     (LEGACY_CONTRIBUTOR_TRACKS).
 */
export function evaluatePublishedRetentionEligibility(
  ctx: EligibilityContext,
  candidate: CandidateClaim,
): EligibilityEvaluation {
  const exclusions: ExclusionReason[] = [];
  const classification = classifyCandidate(ctx.def.id, {
    text: candidate.text,
    track: candidate.track,
  });

  if (candidate.stub) exclusions.push("stub_fixture");
  if (candidate.docs.length === 0) exclusions.push("missing_source");
  if (candidate.docs.length > 0 && candidate.docs.every((d) => d.mirrorOfDocId !== null)) {
    exclusions.push("mirror_only");
  }
  const inWindow = isClaimDateInWindow(ctx.window, candidate.claimDate);
  if (!inWindow) exclusions.push("off_window");

  const theaterEntry = ctx.def.contributorTheaters.find((t) => t.theater === candidate.theater);
  const designatedTracks =
    theaterEntry?.comparability === "legacy_only"
      ? LEGACY_CONTRIBUTOR_TRACKS
      : (ctx.def.contributorTracks as readonly string[]);
  // fail-closed: an unpublished claim can never be a retention member —
  // evidence existence never implies published retention (contract §6.1)
  if (!candidate.published || theaterEntry === undefined || !designatedTracks.includes(candidate.track)) {
    exclusions.push("off_scope");
  }
  if (classification.kind === "off_scope") exclusions.push("off_scope");
  if (classification.kind === "unclassified") exclusions.push("unclassified");

  const ingest = earliestIngest(candidate);
  const availability = availabilityOf(ctx, ingest.ms);
  const indep = independentSourceCount(candidate);

  // same at-most-once diagnostics rule as corpus recall
  const applicable = [...new Set(exclusions)];
  if (applicable.length > 0) {
    return {
      claimId: candidate.claimId,
      record: { included: false, reason: dominantExclusionReason(applicable) },
      applicableExclusions: applicable,
      classification,
      windowReason: inWindow ? windowReasonOf(ctx, candidate.claimDate) : null,
      availability,
      earliestIngestAt: ingest.raw,
      independentSourceCount: indep,
    };
  }

  const classified = classification as Extract<LaneClassification, { kind: "classified" }>;
  const lane = laneById(ctx.def.laneTaxonomyVersion, classified.lane).id;
  const windowReason = windowReasonOf(ctx, candidate.claimDate);
  return {
    claimId: candidate.claimId,
    record: { included: true, lane, reasons: [...classified.reasons, windowReason] },
    applicableExclusions: [],
    classification,
    windowReason,
    availability,
    earliestIngestAt: ingest.raw,
    independentSourceCount: indep,
  };
}
