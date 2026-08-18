// The deterministic fixture matcher/oracle (Phase 4; contract §6.3 "NO paid
// runs in this workstream — a deterministic fixture matcher/oracle drives all
// tests and offline reports").
//
// The oracle performs NO text inference. It carries an explicit, committed
// PAIR TABLE keyed by scenario id: for each frozen corpus scenario, exactly
// which (unitId, claimId) pairs are materially-equivalent matches under the
// §6.3 binding rules, with explicit coverage for compound units. The table
// records the fixture author's pair-level intent (the scenarios' notes state
// which claim describes which unit's event); everything DOWNSTREAM of the
// pairs — population filtering, per-unit verdicts, partial-as-miss headline
// arithmetic, lane tables, contribution, diagnostics — is COMPUTED by the
// scorer, so the acceptance loop (expected.corpusRecall /
// publishedRetention / headline / contribution) tests real derivation, not a
// copy-through.
//
// POPULATION FILTERING IS STRUCTURAL: match() only ever returns pairs whose
// claimId is in the SUPPLIED claim list. Pairs are deliberately listed even
// for claims the eligibility engine excludes (stub, mirror-only, superseded)
// — a stub or superseded claim "describes the event" at the matcher level,
// and the fact that it still contributes NOTHING proves the population
// discipline at the scorer (ruling 3 / rulings 13/18), instead of hiding it
// in the table.
//
// ANTI-VAGUE-CLAIM PIN (register #9; cc-vague-claim-019): a vague claim
// topically overlapping several distinct units is materially equivalent to
// NONE of them and therefore appears in NO pair. The scenario's
// matcherFixture block pins this from the corpus side.
//
// The oracle's outcome label is the literal "fixture-oracle" — never a
// ladder rung, so an oracle-scored result can never masquerade as a majority
// (or any live) result.

import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import type { ConflictFixtureScenario, FixtureReportShape } from "./fixture-corpus";
import { laneById } from "./lanes";
import {
  assertMatchableUnits,
  type ConflictMatcher,
  type ConflictMatchOutcome,
  type MatchableUnit,
  type MatchCoverage,
  type MatcherClaim,
  type UnitClaimMatch,
} from "./match-contract";
import type { ConflictId } from "./vocabulary";
import { CONFLICT_REGISTRY } from "./definitions";

export interface OraclePair {
  unitId: string;
  claimId: number;
  coverage: MatchCoverage;
}

function pair(unitId: string, claimId: number, coverage: MatchCoverage = "full"): OraclePair {
  return { unitId, claimId, coverage };
}

/** The committed pair table over the frozen corpus (one entry per scenario;
 *  [] = the scenario's evidence matches nothing — e.g. off-scope-only
 *  evidence, recurring templates, quiet-day opposition, vague claims). */
export const ORACLE_MATCH_TABLE: Readonly<Record<string, readonly OraclePair[]>> = deepFreeze({
  // ROCA
  "roca-ua-only-001b": [pair("u0", 9001)],
  "roca-ru-source-002": [pair("u0", 9002)],
  "roca-crimea-003": [pair("u0", 9003)],
  "roca-dprk-004": [pair("u0", 9004)],
  "roca-coalition-005": [pair("u0", 9005)],
  "roca-eu-domestic-006": [], // dairy subsidies are not artillery procurement
  "roca-recurring-template-007": [], // same town+action class, DIFFERENT days (ruling-12 spirit)
  "roca-retention-gap-008b": [pair("u0", 9009)],
  // compound bullet: the claim covers the glide-bomb proposition only
  "roca-compound-partial-009b": [pair("u0", 9010, "partial")],
  "roca-quiet-day-010b": [], // negative unit vs positive advance claim: opposition, not support
  // Iran
  "iran-direct-kinetic-001": [pair("u0", 9101)],
  "iran-hezbollah-002": [pair("u0", 9102)],
  "iran-iraq-militia-003": [pair("u0", 9103)],
  "iran-houthi-maritime-004": [pair("u0", 9104)],
  "iran-hormuz-gulf-005": [pair("u0", 9105)],
  "iran-iaea-nuclear-006": [pair("u0", 9106)],
  "iran-e3-diplomacy-007": [pair("u0", 9107)],
  "iran-elite-succession-008": [pair("u0", 9108)],
  "iran-domestic-exclusion-009": [], // commercial earnings / municipal politics match nothing
  // the legacy bh claim DESCRIBES the Gulf-base development; population
  // filtering keeps it out of corpus recall (it is retention-only there)
  "iran-gulf-unavailable-010b": [pair("u0", 9111)],
  // same actor, two DISTINCT events: the interception claim matches u0 only
  "iran-two-events-011": [pair("u0", 9112)],
  "iran-translation-hedge-012": [pair("u0", 9113)],
  // Cross-cutting
  "cc-editions-001": [pair("u0", 9301)],
  "cc-publication-gap-002": [], // no report — nothing to match
  "cc-timestamps-003": [pair("u0", 9303)],
  "cc-dst-offset-004": [pair("u0", 9304)],
  "cc-fetch-after-cutoff-005": [pair("u0", 9305)],
  "cc-ingest-after-publication-006": [pair("u0", 9306)],
  "cc-regen-after-instant-007": [pair("u0", 9307)],
  // BOTH extractor generations describe the seizure; population filtering
  // drops the superseded row (rulings 13/18) — listed to prove it
  "cc-superseded-version-008": [pair("u0", 9308), pair("u0", 9309)],
  // the mirror claim describes the same detonation; mirror_only exclusion
  // keeps it out of every population — listed to prove it
  "cc-mirror-adapters-009": [pair("u0", 9310), pair("u0", 9311)],
  "cc-independence-010": [pair("u0", 9312)],
  // the on-topic STUB describes the exercise; ruling 3 keeps it out of every
  // population — listed to prove it. 9323 (countermeasure drills) is a
  // DIFFERENT activity; 9322 is off-topic.
  "cc-stub-leakage-011b": [pair("u0", 9313)],
  // 9314's embedded instructions demand a match; they are inert data
  "cc-injection-012": [pair("u0", 9315)],
  "cc-matcher-failclosed-013b": [pair("u0", 9316)], // u1 is deliberately signal-less and unmatched
  "cc-state-unavailable-014": [pair("u0", 9317)],
  "cc-state-zero-empty-015": [], // every candidate excluded; nothing to pair
  "cc-state-zero-nonempty-016": [], // eligible claims describe OTHER events (nonempty-set zero)
  "cc-window-rung2-017": [pair("u0", 9324)],
  "cc-other-in-scope-018": [pair("u0", 9330)],
  // register #9: the vague claim 9401 pairs with NOTHING; 9402 matches u0
  "cc-vague-claim-019": [pair("u0", 9402)],
});

/** Validate one scenario's oracle entry against the loaded corpus scenario:
 *  the entry must exist, every pair's unit must be a declared unit of the
 *  scenario's SELECTED report, every claimId one of the scenario's evidence
 *  rows, and (unitId, claimId) pairs unique. Fail-closed: a drifted table
 *  throws, never silently mismatches. */
export function oraclePairsFor(scenario: ConflictFixtureScenario, report: FixtureReportShape | null): readonly OraclePair[] {
  const entry = ORACLE_MATCH_TABLE[scenario.id];
  if (entry === undefined) {
    throw new ConflictDomainError(
      "invalid_oracle_table",
      `no oracle entry for scenario ${scenario.id} — every corpus scenario needs one (possibly [])`,
    );
  }
  const unitIds = new Set((report?.units ?? []).map((u) => u.unitId));
  const claimIds = new Set(scenario.evidence.map((c) => c.claimId));
  const seen = new Set<string>();
  for (const p of entry) {
    if (!unitIds.has(p.unitId)) {
      throw new ConflictDomainError(
        "invalid_oracle_table",
        `${scenario.id}: oracle pair references unknown unit ${p.unitId}`,
      );
    }
    if (!claimIds.has(p.claimId)) {
      throw new ConflictDomainError(
        "invalid_oracle_table",
        `${scenario.id}: oracle pair references unknown claim ${p.claimId}`,
      );
    }
    const key = `${p.unitId}:${p.claimId}`;
    if (seen.has(key)) {
      throw new ConflictDomainError(
        "invalid_oracle_table",
        `${scenario.id}: duplicate oracle pair ${key}`,
      );
    }
    seen.add(key);
  }
  return entry;
}

export class FixtureOracleMatcher implements ConflictMatcher {
  readonly kind = "fixture-oracle" as const;
  private readonly pairs: readonly OraclePair[];

  constructor(scenario: ConflictFixtureScenario, report: FixtureReportShape | null) {
    this.pairs = oraclePairsFor(scenario, report);
  }

  async match(
    units: readonly MatchableUnit[],
    claims: readonly MatcherClaim[],
  ): Promise<ConflictMatchOutcome & { label: "fixture-oracle" }> {
    assertMatchableUnits(units);
    const unitIds = new Set(units.map((u) => u.unitId));
    const claimIds = new Set(claims.map((c) => c.claimId));
    const matches: UnitClaimMatch[] = this.pairs
      .filter((p) => unitIds.has(p.unitId) && claimIds.has(p.claimId))
      .map((p) => ({ unitId: p.unitId, claimId: p.claimId, coverage: p.coverage, confidence: null }))
      .sort((a, b) =>
        a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : a.claimId - b.claimId,
      );
    return {
      label: "fixture-oracle",
      matches,
      voteRounds: null,
      votesK: null,
      votes: null,
      keywordUnmatchable: null,
      model: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Fixture → matcher/scorer input projections
// ---------------------------------------------------------------------------

/** The scorer/matcher-facing declared unit list of a fixture report: lanes
 *  validated fail-closed against the conflict's frozen taxonomy, ordinals =
 *  positions. */
export function declaredUnitsOf(
  conflictId: ConflictId,
  report: FixtureReportShape,
): MatchableUnit[] {
  const taxonomyVersion = CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion;
  return report.units.map((u, i) => ({
    unitId: u.unitId,
    ordinal: i,
    text: u.text,
    lane: laneById(taxonomyVersion, u.lane).id,
    compound: u.compound,
    negative: u.negative,
  }));
}
