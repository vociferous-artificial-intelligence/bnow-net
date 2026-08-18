// The live-compatible LLM matcher adapter SHAPE (contract §6.3; register #8
// H2; workstream prompt §12).
//
// Reuses the EXACT production exports — MATCH_SYSTEM_PROMPT,
// MATCH_RESPONSE_SCHEMA, buildMatchUserPrompt, sanitizeMatches (via
// parseMatcherVote), majorityFromVotes (via resolveLadder) — from
// src/lib/validation/llm-match.ts, the sanctioned export surface the eval
// control plane already consumes. The production module and its live default
// path are UNTOUCHED; k=5 majority semantics (votes, confidence >= 0.6
// inside sanitizeMatches, majority strictly > k/2) are inherited unchanged,
// INCLUDING the degradation ladder: >=3 usable rounds → llm-majority; 1–2 →
// the single/first usable round labeled llm; 0 → the injected keyword
// fallback, labeled keyword.
//
// PAID CALLS ARE IMPOSSIBLE IN THIS WORKSTREAM, structurally:
//   - the constructor REQUIRES an injected vote function — this module
//     imports no provider SDK, constructs no client, and dispatches nothing;
//   - no environment variable is read anywhere in this module;
//   - the module is import-safe with a fully blanked environment (pinned by
//     the import-hygiene test).
// Live wiring (a vote function that reserves spend and dispatches the
// production schema) is a LATER phase's separately-reviewed step; nothing
// here changes if that never happens.

import { buildMatchUserPrompt, MATCH_SYSTEM_PROMPT } from "../validation/llm-match";
import type { ClaimForValidation } from "../validation/score";
import { ConflictDomainError } from "./errors";
import type { ConflictKeywordMatcher } from "./keyword-matcher";
import {
  assertMatchableUnits,
  pairsFromLlmMatches,
  parseMatcherVote,
  resolveLadder,
  type ConflictMatcher,
  type ConflictMatchOutcome,
  type MatchableUnit,
  type MatcherClaim,
} from "./match-contract";

/** One vote round's dispatch seam. Receives the EXACT production prompt pair
 *  and returns the raw response body (a JSON string in the live schema, or
 *  garbage — malformed votes are discarded by the parser, never repaired).
 *  A live implementation must reserve spend per physical dispatch (ruling
 *  4/8) — that obligation lives with the future wiring, not here, because
 *  nothing here can dispatch. */
export type MatchVoteFn = (
  round: number,
  prompt: { system: string; user: string },
) => Promise<string>;

export interface LlmCompatibleMatcherConfig {
  /** requested vote rounds; production default is k=5 (MATCH_VOTES) */
  votesK: number;
  voteFn: MatchVoteFn;
  /** the model identity of the injected vote source, or null when the votes
   *  are not produced by a real model (fixtures/offline) */
  model: string | null;
  /** rung-3 fallback — the honestly-labeled keyword matcher (typed as the
   *  concrete class so the fallback can never be another LLM path) */
  keywordFallback: ConflictKeywordMatcher;
}

export class LlmCompatibleMatcher implements ConflictMatcher {
  readonly kind = "llm-compatible" as const;

  constructor(private readonly config: LlmCompatibleMatcherConfig) {
    if (!Number.isInteger(config.votesK) || config.votesK < 1) {
      throw new ConflictDomainError(
        "invalid_match_outcome",
        `votesK must be a positive integer, got ${String(config.votesK)}`,
      );
    }
  }

  async match(
    units: readonly MatchableUnit[],
    claims: readonly MatcherClaim[],
  ): Promise<ConflictMatchOutcome> {
    assertMatchableUnits(units);
    // the EXACT production prompt pair: units numbered by position (the
    // ordinal), claims listed by claimId — reference text is transient input
    // here exactly as in production validate (ruling 1: nothing persists)
    const prompt = {
      system: MATCH_SYSTEM_PROMPT,
      user: buildMatchUserPrompt(
        units.map((u) => u.text),
        claims.map(
          (c): ClaimForValidation => ({
            claimId: c.claimId,
            text: c.text,
            hedging: c.hedging,
            docCount: 0,
            earliestDocAt: null,
            earliestFetchedAt: null,
          }),
        ),
      ),
    };
    const validClaimIds = new Set(claims.map((c) => c.claimId));
    const usable: ReturnType<typeof parseMatcherVote>[] = [];
    for (let round = 0; round < this.config.votesK; round++) {
      let raw: string;
      try {
        raw = await this.config.voteFn(round, prompt);
      } catch {
        continue; // a failed round is a discarded round (production parity)
      }
      const parsed = parseMatcherVote(raw, units, validClaimIds);
      if (parsed !== null) usable.push(parsed);
    }

    const resolution = resolveLadder(
      usable.filter((r): r is NonNullable<typeof r> => r !== null),
      units,
    );
    if (resolution.rung === "keyword") {
      // ZERO usable rounds: the inherited ladder's rung 3 — the keyword
      // fallback scores, honestly labeled by the fallback itself.
      // REQUESTED-k THREADING (Gate-4 science NOTE-3, binding Phase 5): the
      // requested vote budget k is CONFIGURATION identity, so it is carried
      // through the fallback into the outcome — a fully-degraded k=5 run must
      // group with other k=5 runs in runGroupKey-based variance analysis, not
      // with a hypothetical k=0 configuration. voteRounds stays null: the
      // keyword rung scored zero usable rounds, and the per-population labels
      // still disclose the degradation.
      const fallback = await this.config.keywordFallback.match(units, claims);
      return { ...fallback, votesK: this.config.votesK };
    }
    return {
      label: resolution.rung,
      matches: pairsFromLlmMatches(resolution.matches, units),
      voteRounds: resolution.voteRounds,
      votesK: this.config.votesK,
      votes: resolution.votes,
      keywordUnmatchable: null,
      model: this.config.model,
    };
  }
}
