// Keyword fallback matcher tests (contract §6.3 as amended; register #8 M1).

import { describe, expect, it } from "vitest";
import { gazetteerFor } from "../validation/gazetteer";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { LlmCompatibleMatcher } from "./llm-compatible-matcher";
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

  it("Gate-4 probe: a shared toponym with ZERO shared action classes never matches (action-class gate)", async () => {
    // reviewer-proven false agreement before the gate: shared toponym alone
    // scores 0.625 ≥ 0.6, pairing a strike unit with an unrelated ground
    // assault at the same city — the conflict rung now also requires ≥1
    // shared canonical action class (production keywords.ts untouched)
    const strikeUnit = unit({
      unitId: "u0",
      ordinal: 0,
      text: "Russian missile strike on Kharkiv",
    });
    const assaultClaim: MatcherClaim = {
      claimId: 502,
      text: "Ukrainian forces repelled a mechanized ground assault near Kharkiv",
      hedging: "claimed",
    };
    const outcome = await matcher.match([strikeUnit], [assaultClaim]);
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.keywordUnmatchable).toBe(0); // the unit HAS signal — this is a miss, not signal-less
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
    // the insufficient_data class NAMES the unit the rung could not score
    expect(outcome.insufficientData).toEqual(["u1"]);
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

  it("insufficient_data names exactly the signal-less units, and keywordUnmatchable is exactly its length", async () => {
    const a = unit({ unitId: "x0", ordinal: 0, text: "Consultations continued on the broader framework." });
    const b = unit({ unitId: "x1", ordinal: 1, text: "Officials reiterated long-standing positions." });
    const outcome = await matcher.match([a, STRIKE_UNIT, b].map((u, i) => ({ ...u, ordinal: i })), [
      STRIKE_CLAIM,
    ]);
    expect(outcome.insufficientData).toEqual(["x0", "x1"]);
    expect(outcome.keywordUnmatchable).toBe(2);
    expect(outcome.keywordUnmatchable).toBe(outcome.insufficientData!.length);
    // DENOMINATOR-UNCHANGED: the class is a diagnostic, the units stay
    // automatic misses, and the scored unit is unaffected
    expect(outcome.matches.map((m) => m.unitId)).toEqual([STRIKE_UNIT.unitId]);
  });

  it("a signal-BEARING negative unit is an ordinary miss — in neither the count nor the class", async () => {
    const quiet = unit({
      unitId: "u0",
      ordinal: 0,
      lane: "frontline_maneuver",
      negative: true,
      text: "Fighting near Orikhiv in Zaporizhzhia stayed static with no confirmed advances.",
    });
    const outcome = await matcher.match([quiet], [STRIKE_CLAIM]);
    expect(outcome.keywordUnmatchable).toBe(0);
    expect(outcome.insufficientData).toEqual([]);
  });

  it("reports the gazetteer version that scored — the default is ru-ua-v1, so nothing existing moves", async () => {
    expect((await matcher.match([STRIKE_UNIT], [STRIKE_CLAIM])).gazetteerVersion).toBe("ru-ua-v1");
    expect(new ConflictKeywordMatcher().gazetteer).toBe(gazetteerFor("ru-ua-v1"));
    const iran = new ConflictKeywordMatcher(gazetteerFor("iran_regional"));
    expect((await iran.match([STRIKE_UNIT], [STRIKE_CLAIM])).gazetteerVersion).toBe("iran-levant-v1");
  });
});

describe("the ladder's keyword rung carries the diagnostics; the llm rungs report null", () => {
  const UNITS: MatchableUnit[] = [
    STRIKE_UNIT,
    unit({ unitId: "u1", ordinal: 1, text: "Consultations continued on the broader framework." }),
  ];

  it("ZERO usable rounds: the fallback outcome passes insufficientData and gazetteerVersion through", async () => {
    const outcome = await new LlmCompatibleMatcher({
      votesK: 5,
      model: null,
      keywordFallback: new ConflictKeywordMatcher(),
      voteFn: async () => "not json at all",
    }).match(UNITS, [STRIKE_CLAIM]);
    expect(outcome.label).toBe("keyword");
    expect(outcome.votesK).toBe(5); // requested-k threading, unchanged
    expect(outcome.keywordUnmatchable).toBe(1);
    expect(outcome.insufficientData).toEqual(["u1"]);
    expect(outcome.gazetteerVersion).toBe("ru-ua-v1");
  });

  it("a resolved llm rung reports null for both — they are keyword-rung properties", async () => {
    const outcome = await new LlmCompatibleMatcher({
      votesK: 5,
      model: null,
      keywordFallback: new ConflictKeywordMatcher(),
      voteFn: async () =>
        JSON.stringify({ matches: [{ unitId: "u0", claimId: 500, confidence: 0.9 }] }),
    }).match(UNITS, [STRIKE_CLAIM]);
    expect(outcome.label).toBe("llm-majority");
    expect(outcome.keywordUnmatchable).toBeNull();
    expect(outcome.insufficientData).toBeNull();
    expect(outcome.gazetteerVersion).toBeNull();
  });
});
