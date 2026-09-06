// The Phase 4 matcher contract (contract §6.3 — the BINDING matching rules;
// register #8 H2/M1; workstream prompt §12).
//
// A ConflictMatcher decides whether a BNOW claim reports SUBSTANTIALLY the
// same event/development as a declared reference unit — never shared topic,
// place, actor, or date alone. Action, direction, actor, place, date/window,
// status, hedge, and important quantities must be compatible; negative/
// quiet-day units match only explicit absence/stalling claims; no claim
// outside the declared conflict scope is ever matched to avoid a miss (the
// scorer additionally REFUSES any match naming a claim that is not a member
// of the population being scored); one claim matching multiple units is
// VISIBLE (surfaced by the scorer) and constrained by the atomic/compound
// policy — materially equivalent to EACH unit independently, topic overlap
// never suffices (Gate-0 science L1; register #9 corpus pin
// cc-vague-claim-019).
//
// THE INHERITED DEGRADATION LADDER (register #8 H2 — production
// llm-match.ts semantics, unchanged): ≥3 usable vote rounds → majority
// (`llm-majority`, production majorityFromVotes); 1–2 usable rounds → the
// single/first usable round, honestly labeled `llm`; ZERO usable rounds →
// the keyword fallback, labeled `keyword`. Labels always disclose which rung
// scored and can never masquerade as a majority result. Malformed votes are
// DISCARDED, never repaired: a usable vote must parse to an object holding a
// `matches` array of schema-shaped entries (production dispatch enforces
// MATCH_RESPONSE_SCHEMA via strict constrained decoding, so anything else is
// a failed round there too); entries are then sanitized through the EXACT
// production `sanitizeMatches` (unknown claimIds and sub-0.6 confidence fail
// closed to null, out-of-range unit references are dropped).
//
// COMPOUND UNITS (register #2; contract §3): no non-oracle matcher can
// attest that a single claim covers EVERY proposition of a compound bullet,
// so ladder-rung matchers (llm-majority / llm / keyword) record every match
// against a compound unit with coverage "partial" — the scorer counts it as
// a MISS in the headline and surfaces the partial diagnostic. Only the
// deterministic fixture oracle (whose pair table carries explicit coverage)
// may attest "full" coverage of a compound unit.
//
// PAID-CALL IMPOSSIBILITY: this module imports NO provider SDK and reads NO
// environment. The live-compatible adapter (llm-compatible-matcher.ts) takes
// an INJECTED vote function; the production prompt/schema/sanitizer/majority
// exports are reused from src/lib/validation/llm-match.ts (the sanctioned
// export surface — the same one src/lib/evals consumes) without touching its
// live default path.

import {
  majorityFromVotes,
  sanitizeMatches,
  type LlmMatch,
} from "../validation/llm-match";
import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import type { HedgingValue } from "./evidence-records";
import type { ConflictLaneId } from "./lanes";
import type { MatcherRung } from "./vocabulary";

// ---------------------------------------------------------------------------
// Matcher identities and labels
// ---------------------------------------------------------------------------

/** Adapter implementations (the "kind" half of the §12 matcher identity). */
export const MATCHER_KINDS = deepFreeze(["fixture-oracle", "llm-compatible", "keyword"] as const);
export type MatcherKind = (typeof MATCHER_KINDS)[number];

export function isMatcherKind(value: unknown): value is MatcherKind {
  return typeof value === "string" && (MATCHER_KINDS as readonly string[]).includes(value);
}

/** The label a match outcome carries. The three LADDER rungs are inherited
 *  unchanged (vocabulary.ts MATCHER_RUNGS); `fixture-oracle` is the
 *  deterministic test/offline oracle's own label — NOT a ladder rung, never
 *  producible by a live-compatible adapter (typed: the ladder resolution
 *  below returns MatcherRung only), and existing precisely so an
 *  oracle-scored result can never masquerade as a majority result. */
export const CONFLICT_MATCHER_LABELS = deepFreeze([
  "llm-majority",
  "llm",
  "keyword",
  "fixture-oracle",
] as const);
export type ConflictMatcherLabel = (typeof CONFLICT_MATCHER_LABELS)[number];

export function isConflictMatcherLabel(value: unknown): value is ConflictMatcherLabel {
  return (
    typeof value === "string" && (CONFLICT_MATCHER_LABELS as readonly string[]).includes(value)
  );
}

/** Degradation order (0 = least degraded). Used only to pick the MORE
 *  degraded label when the two population match calls resolve different
 *  rungs; `fixture-oracle` deliberately has no rank — mixing it with ladder
 *  rungs in one result is a programmer error the scorer refuses. */
export function ladderDegradation(label: MatcherRung): number {
  switch (label) {
    case "llm-majority":
      return 0;
    case "llm":
      return 1;
    case "keyword":
      return 2;
  }
}

// ---------------------------------------------------------------------------
// Matcher input/output shapes
// ---------------------------------------------------------------------------

/** A declared reference unit as the matcher sees it. `text` is TRANSIENT
 *  matcher input (exactly like production validate) — the scorer's output
 *  provably never carries it. */
export interface MatchableUnit {
  unitId: string;
  /** position in the declared unit list — the takeawayIndex the production
   *  prompt/schema uses */
  ordinal: number;
  text: string;
  lane: ConflictLaneId;
  compound: boolean;
  negative: boolean;
}

/** A population-member claim as the matcher sees it. */
export interface MatcherClaim {
  claimId: number;
  text: string;
  hedging: HedgingValue;
}

export const MATCH_COVERAGES = deepFreeze(["full", "partial"] as const);
export type MatchCoverage = (typeof MATCH_COVERAGES)[number];

/** One unit↔claim match. `coverage: "partial"` = the claim covers SOME but
 *  not all of a compound unit's propositions (headline: miss + diagnostic). */
export interface UnitClaimMatch {
  unitId: string;
  claimId: number;
  coverage: MatchCoverage;
  /** matcher confidence when the rung produces one; null otherwise */
  confidence: number | null;
}

/** Per-unit per-round vote audit (production TakeawayVotes, keyed by unitId). */
export interface UnitVoteAudit {
  unitId: string;
  /** claimId voted per usable round (null = no-match vote) */
  votes: readonly (number | null)[];
  final: number | null;
}

export interface ConflictMatchOutcome {
  label: ConflictMatcherLabel;
  matches: readonly UnitClaimMatch[];
  /** usable vote rounds that scored (llm rungs); null elsewhere */
  voteRounds: number | null;
  /** requested vote count k (llm-compatible adapter); null elsewhere */
  votesK: number | null;
  /** per-vote audit (llm rungs); null elsewhere */
  votes: readonly UnitVoteAudit[] | null;
  /** keyword rung only: declared units with NO keyword signal, kept in the
   *  FULL denominator as automatic misses (register #8 M1) */
  keywordUnmatchable: number | null;
  /** keyword rung only: the unit ids behind that count — the
   *  `insufficient_data` class. A unit here has ZERO gazetteer signal AND zero
   *  action signal, so the rung cannot score it AT ALL; that is a different
   *  statement from "scored and did not match", which is what an ordinary miss
   *  means. DENOMINATOR-UNCHANGED (the landing report's "denominator-unchanged
   *  third class", CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101): these
   *  units stay in the full declared-unit denominator as automatic misses
   *  exactly as before — the class is a DIAGNOSTIC, never arithmetic.
   *  `keywordUnmatchable` is exactly this array's length, so register #8 M1's
   *  frozen definition is unchanged; the array only names which units.
   *  Signal-BEARING negative/quiet-day units are ordinary misses and appear in
   *  neither. Null on every other rung. */
  insufficientData: readonly string[] | null;
  /** keyword rung only: the gazetteer version that scored — a keyword result
   *  is only interpretable against the vocabulary that produced it. Null
   *  elsewhere. */
  gazetteerVersion: string | null;
  /** model identity when a real model produced the votes; null offline */
  model: string | null;
}

/** The pure matcher seam the scorer consumes. Implementations: the
 *  deterministic fixture oracle (fixture-matcher.ts), the live-compatible
 *  LLM adapter (llm-compatible-matcher.ts), and the keyword fallback
 *  (keyword-matcher.ts). */
export interface ConflictMatcher {
  readonly kind: MatcherKind;
  match(
    units: readonly MatchableUnit[],
    claims: readonly MatcherClaim[],
  ): Promise<ConflictMatchOutcome>;
}

// ---------------------------------------------------------------------------
// Vote parsing (fail-closed; discard, never repair)
// ---------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Parse ONE raw vote string into production-shaped matches, or null when
 *  the vote is unusable. Usable = parses as JSON to an object with a
 *  `matches` array whose every entry is schema-shaped: a unit reference
 *  (integer `takeawayIndex` — the production MATCH_RESPONSE_SCHEMA form — or
 *  string `unitId` resolvable against the supplied unit list, the offline
 *  audit form the fixture corpus pins), `claimId` integer-or-null, and a
 *  finite `confidence` number. ANY deviation discards the WHOLE vote
 *  (production parity: strict constrained decoding makes a schema-violating
 *  live response impossible, so such a response there is a failed round).
 *  Usable votes are then sanitized through the EXACT production
 *  sanitizeMatches — unknown claimIds / sub-0.6 confidence fail closed to
 *  null, out-of-range unit references are dropped. */
export function parseMatcherVote(
  raw: string,
  units: readonly MatchableUnit[],
  validClaimIds: ReadonlySet<number>,
): LlmMatch[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.matches)) return null;
  const ordinalByUnitId = new Map(units.map((u) => [u.unitId, u.ordinal]));
  const shaped: LlmMatch[] = [];
  for (const entry of parsed.matches) {
    if (!isRecord(entry)) return null;
    let takeawayIndex: number;
    if (typeof entry.takeawayIndex === "number" && Number.isInteger(entry.takeawayIndex)) {
      takeawayIndex = entry.takeawayIndex;
    } else if (typeof entry.unitId === "string") {
      const ordinal = ordinalByUnitId.get(entry.unitId);
      // an unknown unitId is an out-of-range unit reference: drop the ENTRY
      // (sanitizeMatches parity for out-of-range indices), keep the vote
      if (ordinal === undefined) continue;
      takeawayIndex = ordinal;
    } else {
      return null;
    }
    const claimId = entry.claimId;
    if (claimId !== null && !(typeof claimId === "number" && Number.isInteger(claimId))) {
      return null;
    }
    if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence)) return null;
    shaped.push({ takeawayIndex, claimId: claimId as number | null, confidence: entry.confidence });
  }
  return sanitizeMatches(shaped, units.length, new Set(validClaimIds));
}

// ---------------------------------------------------------------------------
// The inherited ladder resolution over usable rounds
// ---------------------------------------------------------------------------

export type LadderResolution =
  | {
      rung: "llm-majority";
      matches: readonly LlmMatch[];
      votes: readonly UnitVoteAudit[];
      voteRounds: number;
    }
  | {
      rung: "llm";
      matches: readonly LlmMatch[];
      votes: readonly UnitVoteAudit[];
      voteRounds: number;
    }
  | { rung: "keyword" };

/** Resolve the inherited ladder over the USABLE rounds (production
 *  llm-match.ts lines "rounds.length >= 3 → majority; >= 1 → first usable
 *  round labeled llm; else null → keyword upstream" — semantics unchanged).
 *  Returns ladder rungs ONLY: the fixture-oracle label is structurally
 *  unreachable from vote rounds. */
export function resolveLadder(
  usableRounds: readonly LlmMatch[][],
  units: readonly MatchableUnit[],
): LadderResolution {
  if (usableRounds.length >= 3) {
    const { matches, votes } = majorityFromVotes([...usableRounds.map((r) => [...r])], units.length);
    return {
      rung: "llm-majority",
      matches,
      votes: votes.map((v) => ({ unitId: unitIdOf(units, v.i), votes: v.v, final: v.final })),
      voteRounds: usableRounds.length,
    };
  }
  if (usableRounds.length >= 1) {
    const round = usableRounds[0];
    const votes: UnitVoteAudit[] = units.map((u) => {
      const m = round.find((x) => x.takeawayIndex === u.ordinal);
      const claimId = m?.claimId ?? null;
      return { unitId: u.unitId, votes: [claimId], final: claimId };
    });
    return { rung: "llm", matches: round, votes, voteRounds: usableRounds.length };
  }
  return { rung: "keyword" };
}

function unitIdOf(units: readonly MatchableUnit[], ordinal: number): string {
  const unit = units.find((u) => u.ordinal === ordinal);
  if (unit === undefined) {
    throw new ConflictDomainError(
      "invalid_match_outcome",
      `vote audit references unknown unit ordinal ${ordinal}`,
    );
  }
  return unit.unitId;
}

/** Production-shaped matches → conflict UnitClaimMatch pairs. Null-claim
 *  entries drop (no match); compound units are ALWAYS coverage "partial"
 *  under ladder rungs (see header — non-oracle matchers cannot attest full
 *  proposition coverage). */
export function pairsFromLlmMatches(
  matches: readonly LlmMatch[],
  units: readonly MatchableUnit[],
): UnitClaimMatch[] {
  const byOrdinal = new Map(units.map((u) => [u.ordinal, u]));
  const pairs: UnitClaimMatch[] = [];
  // production llm-match parity (Gate-4 science MINOR-3): a schema-valid vote
  // may repeat the same (unit, claim) entry; production tolerates it
  // first-entry-wins, so the adapter dedupes keep-first here instead of
  // handing the scorer a duplicate pair to hard-fail on
  const seen = new Set<string>();
  for (const m of matches) {
    if (m.claimId === null) continue;
    const unit = byOrdinal.get(m.takeawayIndex);
    if (unit === undefined) {
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `match references unknown unit ordinal ${m.takeawayIndex}`,
      );
    }
    const key = `${unit.unitId}|${m.claimId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      unitId: unit.unitId,
      claimId: m.claimId,
      coverage: unit.compound ? "partial" : "full",
      confidence: m.confidence,
    });
  }
  return pairs.sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : a.claimId - b.claimId));
}

// ---------------------------------------------------------------------------
// Shared input validation for matcher implementations
// ---------------------------------------------------------------------------

/** Fail-closed unit-list validation shared by every adapter: ordinals must be
 *  exactly 0..n-1 in order (the production prompt numbers by position), unit
 *  ids unique and non-empty. */
export function assertMatchableUnits(units: readonly MatchableUnit[]): void {
  const seen = new Set<string>();
  units.forEach((u, i) => {
    if (u.unitId.length === 0) {
      throw new ConflictDomainError("invalid_match_outcome", "unit with empty unitId");
    }
    if (u.ordinal !== i) {
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `unit ${u.unitId} ordinal ${u.ordinal} != position ${i} — ordinals must be the prompt positions`,
      );
    }
    if (seen.has(u.unitId)) {
      throw new ConflictDomainError("invalid_match_outcome", `duplicate unitId ${u.unitId}`);
    }
    seen.add(u.unitId);
  });
}
