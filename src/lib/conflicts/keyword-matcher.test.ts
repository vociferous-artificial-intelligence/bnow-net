// Keyword fallback matcher tests (contract §6.3 as amended; register #8 M1).

import { describe, expect, it } from "vitest";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import type { MatchableUnit, MatcherClaim } from "./match-contract";

const matcher = new ConflictKeywordMatcher();

function unit(partial: Partial<MatchableUnit> & { unitId: string; ordinal: number; text: string }): MatchableUnit {
  return {
    lane: "strikes_air_defense",
    compound: false,
    negative: false,
    ...partial,
  };
}

const STRIKE_UNIT = unit({
  unitId: "u0",
  ordinal: 0,
  text: "Synthetic drone strike series hit Odesa port infrastructure overnight.",
});
const STRIKE_CLAIM: MatcherClaim = {
  claimId: 500,
  text: "Odesa port infrastructure reportedly damaged in an overnight drone strike.",
  hedging: "claimed",
};

describe("ConflictKeywordMatcher", () => {
  it("is structurally incapable of any label but keyword, with null votes/model", async () => {
    const outcome = await matcher.match([STRIKE_UNIT], [STRIKE_CLAIM]);
    // the return TYPE pins label: "keyword"; assert runtime too
    expect(outcome.label).toBe("keyword");
    expect(outcome.votes).toBeNull();
    expect(outcome.voteRounds).toBeNull();
    expect(outcome.votesK).toBeNull();
    expect(outcome.model).toBeNull();
  });

  it("matches on shared toponym+action at the production threshold", async () => {
    const outcome = await matcher.match([STRIKE_UNIT], [STRIKE_CLAIM]);
    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0]).toMatchObject({ unitId: "u0", claimId: 500, coverage: "full" });
    expect(outcome.keywordUnmatchable).toBe(0);
  });

  it("counts signal-less units in keywordUnmatchable and keeps them as automatic misses (M1)", async () => {
    const signalless = unit({
      unitId: "u1",
      ordinal: 1,
      lane: "strategic_political",
      text: "Senior interlocutors continued consultations on the broader framework understanding.",
    });
    const outcome = await matcher.match([STRIKE_UNIT, signalless], [STRIKE_CLAIM]);
    expect(outcome.keywordUnmatchable).toBe(1);
    expect(outcome.matches.map((m) => m.unitId)).toEqual(["u0"]);
  });

  it("NEVER matches a negative/quiet-day unit — a positive advance claim on the same axis is opposition (roca-quiet-day-010b rule)", async () => {
    const quiet = unit({
      unitId: "u0",
      ordinal: 0,
      lane: "frontline_maneuver",
      negative: true,
      // signal-BEARING negative unit: toponym zaporizhzhia + action "advance"
      text: "Fighting near Orikhiv in Zaporizhzhia stayed static with no confirmed advances.",
    });
    const advance: MatcherClaim = {
      claimId: 501,
      text: "Troops reportedly advanced up to one kilometer in the Zaporizhzhia direction.",
      hedging: "claimed",
    };
    const outcome = await matcher.match([quiet], [advance]);
    // a bare production-gazetteer reuse WOULD match here (shared toponym +
    // shared advance action, score 0.875 >= 0.6): the conflict adapter fails
    // closed instead
    expect(outcome.matches).toHaveLength(0);
    // signal-bearing negative units are ordinary misses, NOT keywordUnmatchable
    // (its frozen register #8 M1 definition is signal-less units only)
    expect(outcome.keywordUnmatchable).toBe(0);
  });

  it("a signal-LESS negative unit counts in keywordUnmatchable like any signal-less unit", async () => {
    const quiet = unit({
      unitId: "u0",
      ordinal: 0,
      lane: "frontline_maneuver",
      negative: true,
      // the real roca-quiet-day-010b unit spelling carries no gazetteer
      // toponym and no action keyword: signal-less first, negative second
      text: "Fighting along the Zaporizhia axis stayed static with no verified change of control.",
    });
    const outcome = await matcher.match([quiet], [STRIKE_CLAIM]);
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.keywordUnmatchable).toBe(1);
  });

  it("compound units earn at most partial coverage (headline miss + diagnostic), never full", async () => {
    const compound = unit({ unitId: "u0", ordinal: 0, compound: true, text: STRIKE_UNIT.text });
    const outcome = await matcher.match([compound], [STRIKE_CLAIM]);
    expect(outcome.matches).toEqual([
      { unitId: "u0", claimId: 500, coverage: "partial", confidence: expect.any(Number) },
    ]);
  });

  it("empty claim set: every signal-bearing unit is a plain miss, nothing throws", async () => {
    const outcome = await matcher.match([STRIKE_UNIT], []);
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.keywordUnmatchable).toBe(0);
  });
});
