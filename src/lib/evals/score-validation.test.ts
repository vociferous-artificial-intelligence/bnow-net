import { describe, expect, it } from "vitest";
import type { ValidationEvalCase } from "./contracts";
import { scoreValidationCase, takeawaysFromTexts } from "./score-validation";

function vCase(
  input: Partial<ValidationEvalCase["input"]>,
  reference: Partial<ValidationEvalCase["reference"]>,
): ValidationEvalCase {
  return {
    id: "val-t",
    workload: "validation",
    partition: "typical",
    split: "development",
    provenance: "test",
    input: {
      takeaways: [{ index: 0, text: "Assault units advanced near Pokrovsk." }],
      claims: [
        {
          claimId: 1,
          text: "Assault units reportedly advanced near Pokrovsk, the evening report said.",
          hedging: "claimed",
          docCount: 2,
          earliestDocAt: null,
          earliestFetchedAt: null,
        },
      ],
      iswPublishedAt: null,
      ...input,
    },
    reference: { labels: [{ takeawayIndex: 0, claimId: 1 }], ...reference },
    offline: { expectation: "pass" },
  };
}

describe("takeawaysFromTexts", () => {
  it("derives signatures through the REAL extractSignature (trilingual gazetteer)", () => {
    const [t] = takeawaysFromTexts([{ index: 0, text: "Подразделения продолжили штурмовые действия у Покровска." }]);
    expect(t.toponyms).toContain("pokrovsk");
    expect(t.actions).toContain("advance");
  });
});

describe("scoreValidationCase", () => {
  it("scores a clean agreement on both paths against the labels", () => {
    const { checks } = scoreValidationCase(vCase({ llmMatches: [{ takeawayIndex: 0, claimId: 1, confidence: 0.9 }] }, {}));
    expect(checks.pass).toBe(true);
    expect(checks.keyword.correctPositives).toBe(1);
    expect(checks.matchSet?.correctPositives).toBe(1);
    expect(checks.reproducible).toBe(true);
  });

  it("records a keyword false positive as a METRIC, never a case failure", () => {
    // same toponym, different action: the keyword matcher scores 0.625 >= 0.6
    const c = vCase(
      {
        takeaways: [{ index: 0, text: "Air defenses intercepted drones over Kursk region." }],
        claims: [
          { claimId: 1, text: "Assault units advanced near Kursk, a channel claimed.", hedging: "claimed", docCount: 1, earliestDocAt: null, earliestFetchedAt: null },
        ],
        llmMatches: [{ takeawayIndex: 0, claimId: null, confidence: 0 }],
      },
      { labels: [{ takeawayIndex: 0, claimId: null }] },
    );
    const { checks } = scoreValidationCase(c);
    expect(checks.keyword.falsePositives).toBe(1);
    expect(checks.keyword.precision).toBe(0);
    expect(checks.pass).toBe(true); // measured, not excused — and not a fixture bug
  });

  it("FAILS the case when the match-set path disagrees with the labels", () => {
    const { checks } = scoreValidationCase(vCase({ llmMatches: [{ takeawayIndex: 0, claimId: null, confidence: 0 }] }, {}));
    expect(checks.pass).toBe(false);
    expect(checks.matchSet?.misses).toBe(1);
  });

  it("fails closed on a match citing an unknown claimId (isw_only, like production sanitization)", () => {
    const c = vCase(
      { llmMatches: [{ takeawayIndex: 0, claimId: 999999, confidence: 0.95 }] },
      { labels: [{ takeawayIndex: 0, claimId: null }] },
    );
    const { checks } = scoreValidationCase(c);
    expect(checks.matchSet?.predictedPositives).toBe(0);
    expect(checks.pass).toBe(true);
  });

  it("pins at-publish arithmetic: unknown evidence timestamps never count as in-hand", () => {
    const c = vCase(
      {
        takeaways: [
          { index: 0, text: "Strikes hit fuel depots in Rostov region." },
          { index: 1, text: "Advances continued near Lyman." },
        ],
        claims: [
          { claimId: 1, text: "A strike hit a fuel depot in Rostov region, channels claimed.", hedging: "claimed", docCount: 2, earliestDocAt: null, earliestFetchedAt: "2026-08-05T12:00:00Z" },
          { claimId: 2, text: "Units advanced near Lyman, the report said.", hedging: "claimed", docCount: 2, earliestDocAt: null, earliestFetchedAt: null },
        ],
        iswPublishedAt: "2026-08-05T23:00:00Z",
        llmMatches: [
          { takeawayIndex: 0, claimId: 1, confidence: 0.9 },
          { takeawayIndex: 1, claimId: 2, confidence: 0.9 },
        ],
      },
      {
        labels: [
          { takeawayIndex: 0, claimId: 1 },
          { takeawayIndex: 1, claimId: 2 },
        ],
        expectAtPublish: { coveragePct: 50, matchedBefore: 1, matchedTotal: 2 },
      },
    );
    const { checks } = scoreValidationCase(c);
    expect(checks.pass).toBe(true);
    expect(checks.atPublishCoveragePct).toBe(50);
  });

  it("verdicts majority-vote fixtures through the REAL majorityFromVotes", () => {
    const c = vCase(
      {
        voteRounds: [
          [{ takeawayIndex: 0, claimId: 1, confidence: 0.9 }],
          [{ takeawayIndex: 0, claimId: 1, confidence: 0.8 }],
          [{ takeawayIndex: 0, claimId: 1, confidence: 0.9 }],
          [{ takeawayIndex: 0, claimId: null, confidence: 0 }],
          [{ takeawayIndex: 0, claimId: 2, confidence: 0.7 }],
        ],
      },
      { expectMajority: [{ takeawayIndex: 0, final: 1 }] },
    );
    const { checks } = scoreValidationCase(c);
    expect(checks.majorityFailures).toBe(0);
    expect(checks.pass).toBe(true);
  });

  it("theater probes go through the REAL classifyTakeawayTheater", () => {
    const c = vCase(
      {
        theaterProbes: [
          { toponyms: ["belgorod"], expect: "ru" },
          { toponyms: ["pokrovsk"], expect: "ua" },
          { toponyms: ["belgorod", "pokrovsk"], expect: "both" },
          // corpus-v2 Q12: the SYNTHETIC off-gazetteer sentinel used by
          // val-c2-edge-001 — a fictional token that can never legitimately
          // join the real-toponym gazetteer, so its fall-through-to-"both"
          // meaning is stable by construction (unlike the draft's red_sea)
          { toponyms: ["varn_strait"], expect: "both" },
        ],
      },
      {},
    );
    const { checks } = scoreValidationCase(c);
    expect(checks.theaterProbeFailures).toBe(0);
    const bad = vCase({ theaterProbes: [{ toponyms: ["belgorod"], expect: "ua" }] }, {});
    expect(scoreValidationCase(bad).checks.theaterProbeFailures).toBe(1);
  });

  it("a live candidate's matches override the committed fixture matches", () => {
    const c = vCase({ llmMatches: [{ takeawayIndex: 0, claimId: 1, confidence: 0.9 }] }, {});
    const { checks } = scoreValidationCase(c, [{ takeawayIndex: 0, claimId: null, confidence: 0 }]);
    expect(checks.pass).toBe(false); // the candidate missed what the label requires
    expect(checks.matchSet?.misses).toBe(1);
  });
});
