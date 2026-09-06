// The keyword fallback matcher (ladder rung 3; contract §6.3 as amended,
// register #8 M1/H2).
//
// Reuses the production gazetteer machinery (src/lib/validation/gazetteer:
// extractSignatureWith / expandToponymsWith / matchScore / MATCH_THRESHOLD) —
// the same deterministic signature matching production validation degrades to,
// and the same algorithm, byte for byte, that scored before the gazetteer was
// versioned — with the conflict evaluator's DISCLOSED divergences:
//
//   1. FULL DECLARED-UNIT DENOMINATOR (register #8 M1): unlike production
//      scoreDigest, which reduces its coverage denominator to the
//      `matchable` subset, the conflict evaluator keeps EVERY declared unit
//      in the denominator. A unit with no keyword signal (no gazetteer
//      toponym AND no action keyword) is an AUTOMATIC MISS counted in the
//      `keywordUnmatchable` diagnostic. Deflationary and honest; the
//      production scoreboard is untouched.
//
//   2. NEGATIVE/QUIET-DAY UNITS never match (contract §6.3: they match only
//      explicit absence/stalling claims, and a signature matcher cannot
//      express absence-compatibility — shared toponym/action would wrongly
//      pair a quiet-day unit with a positive advance claim, the exact
//      roca-quiet-day-010b failure). Fail-closed: such units are ordinary
//      misses. They are NOT counted in keywordUnmatchable, whose frozen
//      definition (register #8 M1) is signal-less units only.
//
//   3. COMPOUND UNITS match with coverage "partial" only (match-contract.ts
//      header): a signature can never attest full proposition coverage, so
//      keyword credit on a compound bullet is a partial diagnostic — a
//      headline miss — never a full match.
//
// THE GAZETTEER IS A PARAMETER (48h step 06). `ru-ua-v1` stays the DEFAULT, so
// every existing construction — the golden ladder variants, the
// llm-compatible adapter's fallback — scores exactly as before. An
// `iran_regional` evaluation passes `gazetteerFor("iran_regional")`; before
// that existed, every Iran declared unit came back signal-less, which is the
// pre-soak blocker recorded in CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101.
// The version that scored is reported in the outcome: a keyword result is only
// interpretable against the vocabulary that produced it.
//
// `insufficient_data` (the same step): the outcome now NAMES the signal-less
// units, not just how many there were, so "the rung scored this unit and found
// no match" is distinguishable from "the rung could not score this unit at
// all". The denominator does not move — `keywordUnmatchable` remains exactly
// `insufficientData.length` and those units remain automatic misses.
//
// STRUCTURALLY INCAPABLE OF MASQUERADING: the outcome label is the literal
// "keyword" (typed), votes/voteRounds/model are null literals — this module
// cannot represent, let alone report, a majority result.
//
// Pure and import-safe: no provider SDK, no env reads, no wall clock.

import {
  RU_UA_V1,
  expandToponymsWith,
  extractSignatureWith,
  matchScore,
  MATCH_THRESHOLD,
  type Gazetteer,
  type Signature,
} from "../validation/gazetteer";
import {
  assertMatchableUnits,
  type ConflictMatcher,
  type ConflictMatchOutcome,
  type MatchableUnit,
  type MatcherClaim,
  type UnitClaimMatch,
} from "./match-contract";

/** A unit's keyword signature, reference-side expanded (wide area → members),
 *  exactly like production scoreDigest's takeaway side. */
function unitSignature(gaz: Gazetteer, text: string): Signature {
  const sig = extractSignatureWith(gaz, text);
  return { toponyms: expandToponymsWith(gaz, sig.toponyms), actions: sig.actions };
}

function hasSignal(sig: Signature): boolean {
  return sig.toponyms.size > 0 || sig.actions.size > 0;
}

export class ConflictKeywordMatcher implements ConflictMatcher {
  readonly kind = "keyword" as const;
  readonly gazetteer: Gazetteer;

  /** Defaults to ru-ua-v1 — the historical behaviour, so no existing caller
   *  or committed golden moves. */
  constructor(gazetteer: Gazetteer = RU_UA_V1) {
    this.gazetteer = gazetteer;
  }

  async match(
    units: readonly MatchableUnit[],
    claims: readonly MatcherClaim[],
  ): Promise<ConflictMatchOutcome & { label: "keyword" }> {
    assertMatchableUnits(units);
    const gaz = this.gazetteer;
    const claimSigs = claims.map((c) => ({ claim: c, sig: extractSignatureWith(gaz, c.text) }));
    const matches: UnitClaimMatch[] = [];
    const insufficientData: string[] = [];

    for (const unit of units) {
      const sig = unitSignature(gaz, unit.text);
      if (!hasSignal(sig)) {
        // register #8 M1: signal-less unit — automatic miss, counted, KEPT
        // in the full declared-unit denominator (the scorer's arithmetic).
        // The id is recorded too: this is the `insufficient_data` class, a
        // diagnostic ON TOP of the unchanged count and the unchanged
        // denominator, never a substitute for either.
        insufficientData.push(unit.unitId);
        continue;
      }
      if (unit.negative) continue; // divergence 2: fail-closed, ordinary miss
      let best: { claimId: number; score: number } | null = null;
      for (const { claim, sig: cs } of claimSigs) {
        const s = matchScore(sig, cs);
        // divergence 4 (Gate-4 science MINOR-2, CONFLICT RUNG ONLY —
        // production keywords.ts untouched): a shared toponym alone scores
        // 0.625 ≥ threshold, so "missile strike on X" would pair with
        // "ground assault repelled near X" as toponym-only false agreement.
        // Require ≥1 shared canonical ACTION class (the signatures already
        // carry them) in addition to the threshold.
        const sharedAction = [...sig.actions].some((a) => cs.actions.has(a));
        if (s >= MATCH_THRESHOLD && sharedAction && (best === null || s > best.score)) {
          best = { claimId: claim.claimId, score: s };
        }
      }
      if (best !== null) {
        matches.push({
          unitId: unit.unitId,
          claimId: best.claimId,
          coverage: unit.compound ? "partial" : "full",
          confidence: +best.score.toFixed(2),
        });
      }
    }

    return {
      label: "keyword",
      matches,
      voteRounds: null,
      votesK: null,
      votes: null,
      // register #8 M1's frozen definition, unchanged: signal-less units only
      keywordUnmatchable: insufficientData.length,
      insufficientData,
      gazetteerVersion: gaz.version,
      model: null,
    };
  }
}
