// Matcher contract + inherited-ladder tests (contract §6.3 as amended;
// register #8 H2/M1). Every rung is pinned here, and the
// cc-matcher-failclosed-013b corpus variants are replayed through the REAL
// live-compatible adapter (fixture votes injected — zero dispatch).

import { describe, expect, it } from "vitest";
import { majorityFromVotes, sanitizeMatches, type LlmMatch } from "../validation/llm-match";
import { ConflictDomainError } from "./errors";
import { loadConflictFixtureScenarios, selectedScenarioReport } from "./fixture-corpus";
import { declaredUnitsOf } from "./fixture-matcher";
import { matcherFixtureVariantsOf, voteVariantMatcher } from "./goldens";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { LlmCompatibleMatcher } from "./llm-compatible-matcher";
import {
  assertMatchableUnits,
  ladderDegradation,
  pairsFromLlmMatches,
  parseMatcherVote,
  resolveLadder,
  type MatchableUnit,
  type MatcherClaim,
} from "./match-contract";

const UNITS: MatchableUnit[] = [
  {
    unitId: "u0",
    ordinal: 0,
    text: "Synthetic forces struck an invented depot near a fictional town.",
    lane: "strikes_air_defense",
    compound: false,
    negative: false,
  },
  {
    unitId: "u1",
    ordinal: 1,
    text: "Synthetic negotiators continued invented framework consultations.",
    lane: "strategic_political",
    compound: false,
    negative: false,
  },
];
const CLAIM_IDS = new Set([101, 102]);

function vote(matches: Array<{ unitId?: string; takeawayIndex?: number; claimId: number | null; confidence: number }>): string {
  return JSON.stringify({ matches });
}

describe("parseMatcherVote (discard, never repair)", () => {
  it("accepts the production takeawayIndex form and the unitId audit form", () => {
    const byIndex = parseMatcherVote(
      vote([{ takeawayIndex: 0, claimId: 101, confidence: 0.9 }]),
      UNITS,
      CLAIM_IDS,
    );
    const byUnitId = parseMatcherVote(
      vote([{ unitId: "u0", claimId: 101, confidence: 0.9 }]),
      UNITS,
      CLAIM_IDS,
    );
    expect(byIndex).toEqual([{ takeawayIndex: 0, claimId: 101, confidence: 0.9 }]);
    expect(byUnitId).toEqual(byIndex);
  });

  it("discards every malformed vote form whole (empty, truncated, null, wrong-schema, prose)", () => {
    for (const raw of [
      "",
      '{"matches":[{"unitId":"u0","claimId":101,"conf',
      "null",
      '{"decision":"ALL_MATCH","schema":"v99"}',
      "ERROR: upstream timeout",
      "[]",
      '{"matches":[{"unitId":"u0"}]}', // entry missing claimId/confidence
      '{"matches":[{"unitId":"u0","claimId":"101","confidence":0.9}]}', // string claimId
      '{"matches":[{"unitId":"u0","claimId":101,"confidence":"high"}]}',
    ]) {
      expect(parseMatcherVote(raw, UNITS, CLAIM_IDS), JSON.stringify(raw)).toBeNull();
    }
  });

  it("applies the EXACT production sanitization: unknown claimIds and sub-0.6 confidence fail closed to null", () => {
    const parsed = parseMatcherVote(
      vote([
        { unitId: "u0", claimId: 999, confidence: 0.95 }, // unknown claim
        { unitId: "u1", claimId: 102, confidence: 0.55 }, // below threshold
      ]),
      UNITS,
      CLAIM_IDS,
    );
    expect(parsed).toEqual([
      { takeawayIndex: 0, claimId: null, confidence: 0.95 },
      { takeawayIndex: 1, claimId: null, confidence: 0.55 },
    ]);
    // parity: identical to calling the production sanitizer directly
    const production = sanitizeMatches(
      [
        { takeawayIndex: 0, claimId: 999, confidence: 0.95 },
        { takeawayIndex: 1, claimId: 102, confidence: 0.55 },
      ],
      2,
      CLAIM_IDS,
    );
    expect(parsed).toEqual(production);
  });

  it("drops unknown-unit entries (out-of-range parity) without discarding the vote", () => {
    const parsed = parseMatcherVote(
      vote([
        { unitId: "u9", claimId: 101, confidence: 0.9 },
        { unitId: "u0", claimId: 101, confidence: 0.9 },
      ]),
      UNITS,
      CLAIM_IDS,
    );
    expect(parsed).toEqual([{ takeawayIndex: 0, claimId: 101, confidence: 0.9 }]);
  });
});

describe("resolveLadder (inherited unchanged)", () => {
  const round = (claimId: number | null): LlmMatch[] => [
    { takeawayIndex: 0, claimId, confidence: claimId === null ? 0 : 0.9 },
  ];

  it(">=3 usable rounds resolve by PRODUCTION majority (strictly more than half)", () => {
    const rounds = [round(101), round(101), round(102), round(101), round(null)];
    const resolution = resolveLadder(rounds, UNITS);
    expect(resolution.rung).toBe("llm-majority");
    if (resolution.rung !== "llm-majority") return;
    expect(resolution.voteRounds).toBe(5);
    expect(resolution.matches.find((m) => m.takeawayIndex === 0)?.claimId).toBe(101);
    // parity with the production aggregator on the same rounds
    const production = majorityFromVotes(rounds, UNITS.length);
    expect(resolution.matches).toEqual(production.matches);
    // 2-2-1 split: no strict majority → null
    const split = resolveLadder([round(101), round(101), round(102), round(102), round(null)], UNITS);
    if (split.rung === "llm-majority") {
      expect(split.matches.find((m) => m.takeawayIndex === 0)?.claimId).toBeNull();
    }
  });

  it("exactly 3 usable rounds is already the majority rung", () => {
    expect(resolveLadder([round(101), round(101), round(101)], UNITS).rung).toBe("llm-majority");
  });

  it("1-2 usable rounds score from the FIRST usable round, labeled llm — never keyword, never majority", () => {
    const two = resolveLadder([round(101), round(102)], UNITS);
    expect(two.rung).toBe("llm");
    if (two.rung !== "llm") return;
    expect(two.voteRounds).toBe(2);
    expect(two.matches.find((m) => m.takeawayIndex === 0)?.claimId).toBe(101); // first round wins
    const one = resolveLadder([round(102)], UNITS);
    expect(one.rung).toBe("llm");
    if (one.rung === "llm") expect(one.voteRounds).toBe(1);
  });

  it("zero usable rounds fall to the keyword rung", () => {
    expect(resolveLadder([], UNITS).rung).toBe("keyword");
  });

  it("the degradation order is llm-majority < llm < keyword", () => {
    expect(ladderDegradation("llm-majority")).toBeLessThan(ladderDegradation("llm"));
    expect(ladderDegradation("llm")).toBeLessThan(ladderDegradation("keyword"));
  });
});

describe("pairsFromLlmMatches", () => {
  it("compound units are ALWAYS partial coverage under ladder rungs", () => {
    const compound: MatchableUnit[] = [{ ...UNITS[0], compound: true }];
    const pairs = pairsFromLlmMatches(
      [{ takeawayIndex: 0, claimId: 101, confidence: 0.9 }],
      compound,
    );
    expect(pairs).toEqual([
      { unitId: "u0", claimId: 101, coverage: "partial", confidence: 0.9 },
    ]);
  });

  it("refuses matches referencing unknown ordinals", () => {
    expect(() =>
      pairsFromLlmMatches([{ takeawayIndex: 7, claimId: 101, confidence: 0.9 }], UNITS),
    ).toThrowError(ConflictDomainError);
  });
});

describe("assertMatchableUnits", () => {
  it("refuses out-of-position ordinals and duplicate unit ids", () => {
    expect(() => assertMatchableUnits([{ ...UNITS[0], ordinal: 1 }])).toThrowError(
      ConflictDomainError,
    );
    expect(() =>
      assertMatchableUnits([UNITS[0], { ...UNITS[1], unitId: "u0" }]),
    ).toThrowError(ConflictDomainError);
  });
});

describe("cc-matcher-failclosed-013b corpus pins through the REAL adapter", () => {
  const scenario = loadConflictFixtureScenarios().find(
    (s) => s.id === "cc-matcher-failclosed-013b",
  )!;
  const units = declaredUnitsOf(scenario.conflictId, selectedScenarioReport(scenario)!);
  const claims: MatcherClaim[] = scenario.evidence.map((c) => ({
    claimId: c.claimId,
    text: c.text,
    hedging: c.hedging,
  }));
  const variants = matcherFixtureVariantsOf(scenario);

  it("variant A (1 usable of 5) scores from the single round, labeled llm — honestly non-majority, NOT keyword", async () => {
    const variant = variants.find((v) => v.variantId === "A-one-valid-round")!;
    const outcome = await voteVariantMatcher(variant).match(units, claims);
    expect(outcome.label).toBe(variant.expected.matcherLabel);
    expect(outcome.label).toBe("llm");
    expect(outcome.voteRounds).toBe(variant.expected.voteRounds);
    expect(outcome.votesK).toBe(5);
    expect(outcome.keywordUnmatchable).toBeNull();
    expect(outcome.matches).toEqual([
      { unitId: "u0", claimId: 9316, coverage: "full", confidence: 0.84 },
    ]);
    // per-vote audit present for the usable round
    expect(outcome.votes).toEqual([
      { unitId: "u0", votes: [9316], final: 9316 },
      { unitId: "u1", votes: [null], final: null },
    ]);
  });

  it("variant B (0 usable of 5) falls to the keyword rung with the FULL denominator + keywordUnmatchable", async () => {
    const variant = variants.find((v) => v.variantId === "B-zero-valid-rounds")!;
    const outcome = await voteVariantMatcher(variant).match(units, claims);
    expect(outcome.label).toBe("keyword");
    expect(outcome.keywordUnmatchable).toBe(variant.expected.keywordUnmatchable);
    expect(outcome.keywordUnmatchable).toBe(1); // signal-less u1 stays a denominator miss
    expect(outcome.votes).toBeNull();
    expect(outcome.model).toBeNull();
    // the keyword rung still matches the signal-bearing unit
    expect(outcome.matches.map((m) => ({ unitId: m.unitId, claimId: m.claimId }))).toEqual([
      { unitId: "u0", claimId: 9316 },
    ]);
  });

  it("the pinned validVotes counts recount through the real parser", () => {
    const claimIds = new Set(claims.map((c) => c.claimId));
    for (const variant of variants) {
      const usable = variant.votes
        .map((raw) => parseMatcherVote(raw, units, claimIds))
        .filter((v) => v !== null);
      expect(usable.length, variant.variantId).toBe(variant.expected.validVotes);
    }
  });
});

describe("live-compatible adapter shape", () => {
  it("a throwing vote function is a discarded round, and all-throwing rounds land on keyword", async () => {
    const matcher = new LlmCompatibleMatcher({
      votesK: 5,
      model: null,
      keywordFallback: new ConflictKeywordMatcher(),
      voteFn: async () => {
        throw new Error("synthetic transport failure");
      },
    });
    const outcome = await matcher.match(UNITS, [
      { claimId: 101, text: "Synthetic strike on the invented depot near the fictional town.", hedging: "claimed" },
    ]);
    expect(outcome.label).toBe("keyword");
  });

  it("k=5 all-usable rounds resolve as llm-majority with the model identity carried", async () => {
    const matcher = new LlmCompatibleMatcher({
      votesK: 5,
      model: "synthetic-model-id",
      keywordFallback: new ConflictKeywordMatcher(),
      voteFn: async () => vote([{ unitId: "u0", claimId: 101, confidence: 0.9 }]),
    });
    const outcome = await matcher.match(UNITS, [
      { claimId: 101, text: "irrelevant", hedging: "claimed" },
    ]);
    expect(outcome.label).toBe("llm-majority");
    expect(outcome.voteRounds).toBe(5);
    expect(outcome.model).toBe("synthetic-model-id");
    expect(outcome.matches[0]).toEqual({
      unitId: "u0",
      claimId: 101,
      coverage: "full",
      confidence: 0.9,
    });
  });

  it("refuses a non-positive votesK", () => {
    expect(
      () =>
        new LlmCompatibleMatcher({
          votesK: 0,
          model: null,
          keywordFallback: new ConflictKeywordMatcher(),
          voteFn: async () => "",
        }),
    ).toThrowError(ConflictDomainError);
  });
});
