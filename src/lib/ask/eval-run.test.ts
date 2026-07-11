import { describe, expect, it } from "vitest";
import type { AskAnswerV2 } from "./types";
import type { ClaimRef, EvalQuestion, EvalSet } from "./eval-set";
import {
  ANSWER_SNIPPET_CHARS,
  GATE_NEGATIVE_HONESTY_FRACTION_THRESHOLD,
  GATE_RECALL_DELTA_THRESHOLD_PTS,
  NEGATIVE_DENIAL_LEAD_CHARS,
  aggregateConfig,
  buildEstimatePlan,
  buildKSensitivityTable,
  computeGate,
  computeQuestionMetrics,
  configEvidenceK,
  emptyResultsFile,
  estimatedCostPerQuestionUsd,
  isDegradedResult,
  isEvalConfig,
  isNegativeAnswerHonest,
  isV2Config,
  mergeResults,
  pendingQuestions,
  renderScorecardMarkdown,
  resolveGoldRefs,
  resolveQuestionGold,
  selectOnlyQuestions,
  toDetailRows,
  type ConfigAggregate,
  type QuestionMetrics,
  type QuestionRunResult,
  type StoredQuestionResult,
} from "./eval-run";

// ---- fixtures -----------------------------------------------------------------

function claimRef(o: Partial<ClaimRef> & { claimIdAtHarvest: number; text: string }): ClaimRef {
  return { countryIso2: "ua", claimDate: "2026-07-01", ...o };
}

function question(o: Partial<EvalQuestion> & { id: string; type: EvalQuestion["type"] }): EvalQuestion {
  return { question: `Q for ${o.id}`, gold: [], acceptableAlternates: [], ...o };
}

function answer(o: Partial<AskAnswerV2> = {}): AskAnswerV2 {
  return {
    answer: "answer text",
    citedClaimIds: [],
    evidenceCount: 0,
    terms: [],
    provider: "openai:gpt-5",
    state: "answered",
    relatedClaimIds: [],
    window: null,
    totalMatching: 0,
    sampled: false,
    retrievalMode: "v2",
    ...o,
  };
}

function runResult(o: Partial<QuestionRunResult> & { question: EvalQuestion }): QuestionRunResult {
  return {
    resolvedGoldIds: [],
    unresolvedGoldCount: 0,
    candidateIds: [],
    evidenceIds: [],
    answer: answer(),
    latencyMs: 100,
    costUsd: 0.01,
    openaiKeySet: true,
    ...o,
  };
}

// ---- config helpers ------------------------------------------------------------

describe("config helpers", () => {
  it("isEvalConfig / isV2Config / configEvidenceK", () => {
    expect(isEvalConfig("legacy")).toBe(true);
    expect(isEvalConfig("v2-k60")).toBe(true);
    expect(isEvalConfig("bogus")).toBe(false);
    expect(isV2Config("legacy")).toBe(false);
    expect(isV2Config("v2-k40")).toBe(true);
    expect(configEvidenceK("legacy")).toBeNull();
    expect(configEvidenceK("v2-k40")).toBe(40);
    expect(configEvidenceK("v2-k60")).toBe(60);
    expect(configEvidenceK("v2-k100")).toBe(100);
  });
});

describe("estimate plan", () => {
  it("legacy vs v2 per-question cost heuristics", () => {
    expect(estimatedCostPerQuestionUsd("legacy")).toBe(0.001);
    expect(estimatedCostPerQuestionUsd("v2-k40")).toBe(0.014);
    expect(estimatedCostPerQuestionUsd("v2-k60")).toBe(0.014);
    expect(estimatedCostPerQuestionUsd("v2-k100")).toBe(0.014);
  });

  it("builds a plan row per config scaled by question count", () => {
    const plan = buildEstimatePlan(["legacy", "v2-k60"], 39);
    expect(plan).toEqual([
      { config: "legacy", questionCount: 39, perQuestionUsd: 0.001, estTotalUsd: 0.039 },
      { config: "v2-k60", questionCount: 39, perQuestionUsd: 0.014, estTotalUsd: 39 * 0.014 },
    ]);
  });
});

// ---- gold resolution -----------------------------------------------------------

describe("resolveGoldRefs — text is the truth", () => {
  it("resolves an exact text match even when the harvest-time id is stale", () => {
    const golds = [claimRef({ claimIdAtHarvest: 999, text: "Forces withdrew from the salient." })];
    const live = [{ id: 42, text: "Forces withdrew from the salient." }];
    const { resolved, unresolved } = resolveGoldRefs(golds, live);
    expect(unresolved).toEqual([]);
    expect(resolved).toEqual([{ claimIdAtHarvest: 999, id: 42, method: "exact" }]);
  });

  it("falls back to a normalized ~60-char prefix match when the exact text drifted", () => {
    const longPrefix = "A".repeat(70);
    const golds = [claimRef({ claimIdAtHarvest: 1, text: `${longPrefix} original tail.` })];
    const live = [{ id: 7, text: `${longPrefix} edited tail after a retranslation.` }];
    const { resolved, unresolved } = resolveGoldRefs(golds, live);
    expect(unresolved).toEqual([]);
    expect(resolved).toEqual([{ claimIdAtHarvest: 1, id: 7, method: "prefix" }]);
  });

  it("reports unresolved when neither exact nor prefix matches anything live", () => {
    const golds = [claimRef({ claimIdAtHarvest: 5, text: "This claim no longer exists anywhere." })];
    const live = [{ id: 1, text: "Something completely different and unrelated text here." }];
    const { resolved, unresolved } = resolveGoldRefs(golds, live);
    expect(resolved).toEqual([]);
    expect(unresolved).toEqual(golds);
  });

  it("resolves a mix of exact, prefix, and unresolved in one call", () => {
    const golds = [
      claimRef({ claimIdAtHarvest: 1, text: "Exact match claim text." }),
      claimRef({ claimIdAtHarvest: 2, text: "B".repeat(65) + " original" }),
      claimRef({ claimIdAtHarvest: 3, text: "Nothing like this exists in the live set at all." }),
    ];
    const live = [
      { id: 10, text: "Exact match claim text." },
      { id: 11, text: "B".repeat(65) + " edited" },
      { id: 12, text: "Totally unrelated live claim." },
    ];
    const { resolved, unresolved } = resolveGoldRefs(golds, live);
    expect(resolved).toEqual([
      { claimIdAtHarvest: 1, id: 10, method: "exact" },
      { claimIdAtHarvest: 2, id: 11, method: "prefix" },
    ]);
    expect(unresolved).toEqual([golds[2]]);
  });

  it("resolveQuestionGold wraps resolution for one question's gold array", () => {
    const q = question({
      id: "known-1",
      type: "known-answer",
      gold: [claimRef({ claimIdAtHarvest: 1, text: "hit" }), claimRef({ claimIdAtHarvest: 2, text: "miss" })],
    });
    const r = resolveQuestionGold(q, [{ id: 100, text: "hit" }]);
    expect(r.ids).toEqual([100]);
    expect(r.unresolvedCount).toBe(1);
    expect(r.unresolved).toHaveLength(1);
  });

  it("negative controls with empty gold resolve to nothing, no false unresolved", () => {
    const r = resolveQuestionGold(question({ id: "negative-01", type: "negative", gold: [] }), []);
    expect(r.ids).toEqual([]);
    expect(r.unresolvedCount).toBe(0);
  });
});

// ---- degraded-run detection ------------------------------------------------------

describe("isDegradedResult", () => {
  it("no OPENAI_API_KEY at all -> never degraded (expected behavior, nothing to abort on)", () => {
    expect(
      isDegradedResult({ retrievalMode: "v2-lexical-only", provider: "stub", openaiKeySet: false }),
    ).toBe(false);
  });

  it("key set + v2-lexical-only retrieval mode -> degraded", () => {
    expect(isDegradedResult({ retrievalMode: "v2-lexical-only", provider: "openai:gpt-5", openaiKeySet: true })).toBe(
      true,
    );
  });

  it("key set + stub/budget provider -> degraded", () => {
    expect(isDegradedResult({ retrievalMode: "v2", provider: "stub", openaiKeySet: true })).toBe(true);
    expect(isDegradedResult({ retrievalMode: "v2", provider: "budget", openaiKeySet: true })).toBe(true);
  });

  it("key set + real provider + real retrieval mode -> not degraded", () => {
    expect(isDegradedResult({ retrievalMode: "v2", provider: "openai:gpt-5", openaiKeySet: true })).toBe(false);
    expect(isDegradedResult({ retrievalMode: "legacy", provider: "openai:gpt-4o-mini", openaiKeySet: true })).toBe(
      false,
    );
  });
});

// ---- negative-control honesty (recalibrated, supervisor round 1) -------------------

// Verbatim from the supervisor's live diagnostic rerun (v2-k60 shape): an HONEST
// gpt-5 denial that CITES the claims it checked while denying. state "answered",
// citations non-empty — the original rule scored this dishonest (both pipelines 0/5).
const REAL_HONEST_DENIAL_WITH_CITATION =
  "Insufficient evidence. In the provided BNOW claims, there are no entries about new U.S. sanctions on Venezuela's oil sector this month. The only Venezuela-related item concerns volunteers searching after an earthquake, not sanctions [c1567]...";

// Verbatim dishonest counter-fixture: asserts the false premise as fact, with a citation.
const REAL_DISHONEST_ASSERTION = "Yes, North Korean troops rotated into Mali in June [c123]";

describe("isNegativeAnswerHonest — denial-language recalibration", () => {
  it("state 'insufficient' is honest regardless of text or citations", () => {
    expect(isNegativeAnswerHonest("insufficient", "anything at all")).toBe(true);
    expect(isNegativeAnswerHonest("insufficient", "")).toBe(true);
  });

  it("real gpt-5 denial WITH citations (Venezuela fixture) scores HONEST", () => {
    expect(isNegativeAnswerHonest("answered", REAL_HONEST_DENIAL_WITH_CITATION)).toBe(true);
  });

  it("asserting the false premise as fact (DPRK-Mali fixture) scores DISHONEST", () => {
    expect(isNegativeAnswerHonest("answered", REAL_DISHONEST_ASSERTION)).toBe(false);
  });

  it.each([
    ["insufficient echo", "The evidence is insufficient to answer this question."],
    ["no entries about", "There are no entries about Venezuela sanctions in the claims [c12]."],
    ["no evidence of", "There is no evidence of a Yemen ceasefire signing in the corpus."],
    ["no matching", "No matching evidence in the current dataset."],
    ["no mention of", "There is no mention of the vessel MV Solara Pride."],
    ["no reports regarding", "There are no reports regarding Chinese naval exercises here."],
    ["no claims about", "The dataset holds no claims about a Wagner rebranding [c4]."],
    ["cannot confirm", "I cannot confirm any such rebranding from the provided claims [c9]."],
    ["can't confirm (straight)", "We can't confirm this vessel was seized."],
    ["can’t confirm (typographic)", "We can’t confirm this vessel was seized."],
    ["can not confirm", "The claims can not confirm any Taiwan Strait activity."],
    ["not found in the provided", "That event is not found in the provided evidence."],
    ["not mentioned in the current", "This entity is not mentioned in the current dataset."],
    ["not present in the supplied", "Such a deployment is not present in the supplied claims."],
    ["does not mention", "The corpus does not mention any such exercise [c7]."],
    ["does not contain", "The evidence does not contain a Yemen ceasefire signing."],
    ["does not include", "The dataset does not include any Venezuela oil-sector sanction."],
  ])("denial family: %s -> honest, citations irrelevant", (_label, text) => {
    expect(isNegativeAnswerHonest("answered", text)).toBe(true);
  });

  it.each([
    ["affirmative with citation", "Wagner rebranded as Konstel Group this month [c55], per two claims."],
    ["affirmative, no denial words", "Chinese naval vessels held live-fire drills near Taiwan last week [c3]."],
  ])("dishonest: %s", (_label, text) => {
    expect(isNegativeAnswerHonest("answered", text)).toBe(false);
  });

  it("denial language buried beyond the leading window does NOT count", () => {
    const affirmativeLead = "The strikes were confirmed by three separate channels and the pattern matches earlier attacks on the same district. ".repeat(3);
    expect(affirmativeLead.length).toBeGreaterThan(NEGATIVE_DENIAL_LEAD_CHARS);
    const buried = affirmativeLead + " However, evidence on the second question is insufficient.";
    expect(isNegativeAnswerHonest("answered", buried)).toBe(false);
    // sanity: the same denial INSIDE the lead window does count
    expect(isNegativeAnswerHonest("answered", "The evidence is insufficient. " + affirmativeLead)).toBe(true);
  });
});

// ---- per-question metrics ---------------------------------------------------------

describe("computeQuestionMetrics", () => {
  it("known-answer: candidate/evidence/cited hits all true when the gold id is present everywhere", () => {
    const q = question({ id: "known-1", type: "known-answer", gold: [claimRef({ claimIdAtHarvest: 1, text: "x" })] });
    const m = computeQuestionMetrics(
      runResult({
        question: q,
        resolvedGoldIds: [42],
        candidateIds: [1, 2, 42],
        evidenceIds: [42, 2],
        answer: answer({ citedClaimIds: [42] }),
      }),
    );
    expect(m.answerable).toBe(true);
    expect(m.candidateHit).toBe(true);
    expect(m.evidenceHit).toBe(true);
    expect(m.cited).toBe(true);
    expect(m.degraded).toBe(false);
  });

  it("known-answer: candidate hit but evidence miss (dropped at rerank) and no citation", () => {
    const q = question({ id: "known-2", type: "known-answer" });
    const m = computeQuestionMetrics(
      runResult({
        question: q,
        resolvedGoldIds: [42],
        candidateIds: [42, 2, 3],
        evidenceIds: [2, 3],
        answer: answer({ citedClaimIds: [] }),
      }),
    );
    expect(m.candidateHit).toBe(true);
    expect(m.evidenceHit).toBe(false);
    expect(m.cited).toBe(false);
  });

  it("question with no resolved gold is excluded (null hits) even if gold entries existed", () => {
    const q = question({ id: "known-3", type: "known-answer", gold: [claimRef({ claimIdAtHarvest: 1, text: "x" })] });
    const m = computeQuestionMetrics(
      runResult({ question: q, resolvedGoldIds: [], unresolvedGoldCount: 1, candidateIds: [5], evidenceIds: [5] }),
    );
    expect(m.answerable).toBe(false);
    expect(m.candidateHit).toBeNull();
    expect(m.evidenceHit).toBeNull();
    expect(m.cited).toBeNull();
    expect(m.unresolvedGoldCount).toBe(1);
  });

  it("negative control: hits are null, negativeHonest reflects the honesty rule", () => {
    const q = question({ id: "negative-01", type: "negative" });
    const honest = computeQuestionMetrics(
      runResult({ question: q, answer: answer({ state: "insufficient", citedClaimIds: [] }) }),
    );
    expect(honest.candidateHit).toBeNull();
    expect(honest.negativeHonest).toBe(true);

    const alsoHonest = computeQuestionMetrics(
      runResult({
        question: q,
        answer: answer({ state: "answered", citedClaimIds: [], answer: "No matching evidence found." }),
      }),
    );
    expect(alsoHonest.negativeHonest).toBe(true);

    const dishonest = computeQuestionMetrics(
      runResult({
        question: q,
        answer: answer({ state: "answered", citedClaimIds: [7], answer: "Yes, it happened [c7]." }),
      }),
    );
    expect(dishonest.negativeHonest).toBe(false);
  });

  it("negative control: an honest denial that CITES the claims it checked is HONEST (recalibration)", () => {
    const q = question({ id: "negative-02", type: "negative" });
    const m = computeQuestionMetrics(
      runResult({
        question: q,
        answer: answer({
          state: "answered",
          citedClaimIds: [1567],
          answer: REAL_HONEST_DENIAL_WITH_CITATION,
        }),
      }),
    );
    expect(m.negativeHonest).toBe(true);
    expect(m.citedClaimIdCount).toBe(1);
  });

  it("records the audit trail: answer snippet (capped), citation count, completion tokens, provider", () => {
    const q = question({ id: "known-9", type: "known-answer" });
    const longAnswer = "X".repeat(ANSWER_SNIPPET_CHARS + 100);
    const m = computeQuestionMetrics(
      runResult({
        question: q,
        answer: answer({
          answer: longAnswer,
          citedClaimIds: [1, 2, 3],
          provider: "openai:gpt-5",
          usage: { promptTokens: 5000, completionTokens: 321, costUsd: 0.012 },
        }),
      }),
    );
    expect(m.answerSnippet).toBe("X".repeat(ANSWER_SNIPPET_CHARS));
    expect(m.answerSnippet.length).toBe(ANSWER_SNIPPET_CHARS);
    expect(m.citedClaimIdCount).toBe(3);
    expect(m.completionTokens).toBe(321);
    expect(m.provider).toBe("openai:gpt-5");
    expect(m.state).toBe("answered"); // state stored verbatim, as before

    // no paid answer call -> completionTokens null, snippet still recorded
    const offline = computeQuestionMetrics(
      runResult({ question: q, answer: answer({ answer: "Top matching evidence:", provider: "stub" }), openaiKeySet: false }),
    );
    expect(offline.completionTokens).toBeNull();
    expect(offline.answerSnippet).toBe("Top matching evidence:");
    expect(offline.provider).toBe("stub");
  });

  it("temporal: windowCorrect null when no windowExpected, computed when present", () => {
    const noExpectation = question({ id: "temporal-x", type: "temporal" });
    expect(computeQuestionMetrics(runResult({ question: noExpectation })).windowCorrect).toBeNull();

    const withExpectation = question({
      id: "temporal-01",
      type: "temporal",
      windowExpected: { from: "2026-07-04", to: "2026-07-11" },
    });
    const correct = computeQuestionMetrics(
      runResult({
        question: withExpectation,
        answer: answer({ window: { from: "2026-07-04", to: "2026-07-11", matchedPhrase: "past week" } }),
      }),
    );
    expect(correct.windowCorrect).toBe(true);

    const wrong = computeQuestionMetrics(
      runResult({
        question: withExpectation,
        answer: answer({ window: { from: "2026-07-01", to: "2026-07-11", matchedPhrase: "past week" } }),
      }),
    );
    expect(wrong.windowCorrect).toBe(false);
  });

  it("temporal: an empty windowExpected {} is satisfied by a null/boundless answer window", () => {
    const q = question({ id: "temporal-07", type: "temporal", windowExpected: {} });
    const nullWindow = computeQuestionMetrics(runResult({ question: q, answer: answer({ window: null }) }));
    expect(nullWindow.windowCorrect).toBe(true);

    const boundedWindow = computeQuestionMetrics(
      runResult({
        question: q,
        answer: answer({ window: { from: "2026-07-01", matchedPhrase: "last Monday" } }),
      }),
    );
    expect(boundedWindow.windowCorrect).toBe(false);
  });

  it("flags degraded results (key set, lexical-only/stub) via the shared rule", () => {
    const q = question({ id: "known-4", type: "known-answer" });
    const degraded = computeQuestionMetrics(
      runResult({ question: q, answer: answer({ retrievalMode: "v2-lexical-only" }), openaiKeySet: true }),
    );
    expect(degraded.degraded).toBe(true);
  });
});

// ---- resumable merge ------------------------------------------------------------

describe("resumable results-file merge", () => {
  const q1 = question({ id: "known-1", type: "known-answer" });
  const q2 = question({ id: "known-2", type: "known-answer" });
  const evalSet: EvalSet = {
    version: 1,
    createdAt: "2026-07-11T00:00:00.000Z",
    corpus: { claimCount: 2, minDate: "2026-07-01", maxDate: "2026-07-11" },
    questions: [q1, q2],
  };

  function stored(id: string): StoredQuestionResult {
    return {
      questionId: id,
      metrics: computeQuestionMetrics(runResult({ question: question({ id, type: "known-answer" }) })),
    };
  }

  it("pendingQuestions returns everything when no results file exists", () => {
    expect(pendingQuestions(evalSet, null, false)).toEqual([q1, q2]);
  });

  it("pendingQuestions skips already-completed keys", () => {
    const rf = mergeResults(
      emptyResultsFile("legacy", "docs/evals/ask-eval-set.json", "host"),
      "legacy",
      "p",
      "host",
      [stored("known-1")],
    );
    expect(pendingQuestions(evalSet, rf, false)).toEqual([q2]);
  });

  it("--fresh reruns everything even with a populated results file", () => {
    const rf = mergeResults(null, "legacy", "p", "host", [stored("known-1"), stored("known-2")]);
    expect(pendingQuestions(evalSet, rf, true)).toEqual([q1, q2]);
  });

  it("mergeResults: additions win on questionId collision, everything else preserved", () => {
    const first = mergeResults(null, "legacy", "p", "host", [stored("known-1")]);
    const firstEntry = first.results["known-1"];
    const second = mergeResults(first, "legacy", "p", "host", [stored("known-2")]);
    expect(Object.keys(second.results).sort()).toEqual(["known-1", "known-2"]);
    expect(second.results["known-1"]).toBe(firstEntry); // untouched entry preserved by reference

    // now replace known-1 with a fresh completion
    const replacement = stored("known-1");
    const third = mergeResults(second, "legacy", "p", "host", [replacement]);
    expect(third.results["known-1"]).toBe(replacement);
    expect(Object.keys(third.results).sort()).toEqual(["known-1", "known-2"]);
  });

  it("mergeResults records the CURRENT call's dbHost, even across a resume", () => {
    const first = mergeResults(null, "legacy", "p", "host-a", [stored("known-1")]);
    expect(first.dbHost).toBe("host-a");
    const second = mergeResults(first, "legacy", "p", "host-b", [stored("known-2")]);
    expect(second.dbHost).toBe("host-b");
  });

  it("selectOnlyQuestions (--only): picks exactly the listed ids in order, deduped", () => {
    const { selected, unknownIds } = selectOnlyQuestions(evalSet, ["known-2", "known-1", "known-2"]);
    expect(selected).toEqual([q2, q1]); // listed order, duplicate dropped
    expect(unknownIds).toEqual([]);
  });

  it("selectOnlyQuestions reports unknown ids instead of silently skipping them", () => {
    const { selected, unknownIds } = selectOnlyQuestions(evalSet, ["known-1", "negative-99"]);
    expect(selected).toEqual([q1]);
    expect(unknownIds).toEqual(["negative-99"]);
  });

  it("selectOnlyQuestions selects already-recorded ids too (merge replaces on collision)", () => {
    // a completed entry does NOT shield an id from --only — that is the whole point
    const rf = mergeResults(null, "legacy", "p", "host", [stored("known-1")]);
    const { selected } = selectOnlyQuestions(evalSet, ["known-1"]);
    expect(selected).toEqual([q1]);
    const replaced = mergeResults(rf, "legacy", "p", "host", [stored("known-1")]);
    expect(Object.keys(replaced.results)).toEqual(["known-1"]);
  });
});

// ---- aggregation ------------------------------------------------------------------

describe("aggregateConfig", () => {
  function m(o: Partial<QuestionMetrics> & { questionId: string }): QuestionMetrics {
    return {
      type: "known-answer",
      answerable: true,
      candidateHit: true,
      evidenceHit: true,
      cited: true,
      state: "answered",
      windowExpected: undefined,
      windowCorrect: null,
      negativeHonest: null,
      unresolvedGoldCount: 0,
      costUsd: 0.01,
      latencyMs: 100,
      degraded: false,
      answerSnippet: "answer text",
      citedClaimIdCount: 0,
      completionTokens: null,
      provider: "openai:gpt-5",
      ...o,
    };
  }

  it("computes recall/citation ratios with correct denominators", () => {
    const metrics: QuestionMetrics[] = [
      m({ questionId: "k1", candidateHit: true, evidenceHit: true, cited: true }),
      m({ questionId: "k2", candidateHit: true, evidenceHit: false, cited: false }),
      m({ questionId: "k3", candidateHit: false, evidenceHit: false, cited: false }),
      m({ questionId: "unresolved", answerable: false, candidateHit: null, evidenceHit: null, cited: null, unresolvedGoldCount: 1 }),
      m({ questionId: "n1", type: "negative", answerable: false, candidateHit: null, evidenceHit: null, cited: null, negativeHonest: true }),
      m({ questionId: "n2", type: "negative", answerable: false, candidateHit: null, evidenceHit: null, cited: null, negativeHonest: false }),
    ];
    const agg = aggregateConfig("v2-k60", metrics);
    expect(agg.totalQuestions).toBe(6);
    expect(agg.answerableQuestions).toBe(3);
    expect(agg.candidateRecall).toEqual({ hit: 2, denom: 3, pct: (200 / 3) });
    expect(agg.evidenceRecall).toEqual({ hit: 1, denom: 3, pct: (100 / 3) });
    expect(agg.citation.citedCount).toBe(1);
    expect(agg.citation.allAnswerableDenom).toBe(3);
    expect(agg.citation.evidenceFoundDenom).toBe(1);
    expect(agg.citation.pctOfAllAnswerable).toBeCloseTo(100 / 3, 6);
    expect(agg.citation.pctOfEvidenceFound).toBe(100);
    expect(agg.negativeHonesty).toEqual({ honest: 1, total: 2, fraction: 0.5 });
    expect(agg.unresolvedGoldCount).toBe(1);
    expect(agg.questionsWithoutGold).toBe(0);
    expect(agg.k).toBe(60);
  });

  it("questionsWithoutGold counts curated-empty (non-negative, zero gold, zero unresolved) separately from unresolved", () => {
    const metrics: QuestionMetrics[] = [
      m({ questionId: "t1", type: "temporal", answerable: false, candidateHit: null, evidenceHit: null, cited: null, unresolvedGoldCount: 0 }),
      m({ questionId: "t2", type: "temporal", answerable: false, candidateHit: null, evidenceHit: null, cited: null, unresolvedGoldCount: 2 }),
    ];
    const agg = aggregateConfig("legacy", metrics);
    expect(agg.questionsWithoutGold).toBe(1);
    expect(agg.unresolvedGoldCount).toBe(2);
    expect(agg.k).toBeNull();
  });

  it("mean/p50 cost and latency, and degraded-run counting", () => {
    const metrics: QuestionMetrics[] = [
      m({ questionId: "a", costUsd: 0.01, latencyMs: 100 }),
      m({ questionId: "b", costUsd: 0.02, latencyMs: 300 }),
      m({ questionId: "c", costUsd: 0.03, latencyMs: 200, degraded: true }),
    ];
    const agg = aggregateConfig("v2-k40", metrics);
    expect(agg.cost.meanUsd).toBeCloseTo(0.02, 10);
    expect(agg.cost.p50Usd).toBe(0.02);
    expect(agg.latency.meanMs).toBeCloseTo(200, 10);
    expect(agg.latency.p50Ms).toBe(200);
    expect(agg.degradedRunCount).toBe(1);
  });

  it("empty metrics array -> NaN percentages, not divide-by-zero garbage", () => {
    const agg = aggregateConfig("legacy", []);
    expect(agg.candidateRecall.pct).toBeNaN();
    expect(agg.citation.pctOfAllAnswerable).toBeNaN();
    expect(agg.negativeHonesty.fraction).toBeNaN();
    expect(agg.cost.meanUsd).toBeNaN();
  });
});

// ---- K-sensitivity table ---------------------------------------------------------

describe("buildKSensitivityTable", () => {
  function agg(config: ConfigAggregate["config"], k: number | null, recallPct: number): ConfigAggregate {
    return {
      config,
      k,
      totalQuestions: 10,
      answerableQuestions: 10,
      negativeQuestions: 0,
      candidateRecall: { hit: 8, denom: 10, pct: 80 },
      evidenceRecall: { hit: recallPct / 10, denom: 10, pct: recallPct },
      citation: { citedCount: 5, allAnswerableDenom: 10, evidenceFoundDenom: 8, pctOfAllAnswerable: 50, pctOfEvidenceFound: 62.5 },
      negativeHonesty: { honest: 0, total: 0, fraction: NaN },
      windowEcho: { hit: 0, denom: 0, pct: NaN },
      cost: { meanUsd: 0.01, p50Usd: 0.01 },
      latency: { meanMs: 500, p50Ms: 500 },
      unresolvedGoldCount: 0,
      degradedRunCount: 0,
      questionsWithoutGold: 0,
    };
  }

  it("excludes legacy (k=null) and sorts v2 configs ascending by K", () => {
    const rows = buildKSensitivityTable([
      agg("v2-k100", 100, 90),
      agg("legacy", null, 40),
      agg("v2-k40", 40, 60),
      agg("v2-k60", 60, 75),
    ]);
    expect(rows.map((r) => r.config)).toEqual(["v2-k40", "v2-k60", "v2-k100"]);
    expect(rows.map((r) => r.k)).toEqual([40, 60, 100]);
    expect(rows.map((r) => r.evidenceRecallPct)).toEqual([60, 75, 90]);
  });
});

// ---- gate computation edge cases ----------------------------------------------------

describe("computeGate — D4 criteria", () => {
  function agg(o: Partial<ConfigAggregate> & { config: ConfigAggregate["config"] }): ConfigAggregate {
    return {
      k: null,
      totalQuestions: 5,
      answerableQuestions: 5,
      negativeQuestions: 5,
      candidateRecall: { hit: 0, denom: 5, pct: 0 },
      evidenceRecall: { hit: 0, denom: 5, pct: 0 },
      citation: { citedCount: 0, allAnswerableDenom: 5, evidenceFoundDenom: 0, pctOfAllAnswerable: 0, pctOfEvidenceFound: NaN },
      negativeHonesty: { honest: 4, total: 5, fraction: 0.8 },
      windowEcho: { hit: 0, denom: 0, pct: NaN },
      cost: { meanUsd: 0.01, p50Usd: 0.01 },
      latency: { meanMs: 100, p50Ms: 100 },
      unresolvedGoldCount: 0,
      degradedRunCount: 0,
      questionsWithoutGold: 0,
      ...o,
    };
  }

  it("exactly +15.0pts recall delta PASSES (>= convention, not strictly >)", () => {
    const legacy = agg({ config: "legacy", evidenceRecall: { hit: 21, denom: 100, pct: 21.0 } });
    const v2k60 = agg({ config: "v2-k60", evidenceRecall: { hit: 36, denom: 100, pct: 36.0 } });
    const gate = computeGate(legacy, v2k60);
    expect(gate.recallDeltaPts).toBeCloseTo(GATE_RECALL_DELTA_THRESHOLD_PTS, 10);
    expect(gate.recallPass).toBe(true);
  });

  it("14.99pts FAILS — just under the threshold", () => {
    const legacy = agg({ config: "legacy", evidenceRecall: { hit: 21, denom: 100, pct: 21.0 } });
    const v2k60 = agg({ config: "v2-k60", evidenceRecall: { hit: 3599, denom: 10000, pct: 35.99 } });
    expect(computeGate(legacy, v2k60).recallPass).toBe(false);
  });

  it("negative honesty exactly 4/5 (0.8) PASSES; 3/5 FAILS", () => {
    const legacy = agg({ config: "legacy" });
    const passing = agg({
      config: "v2-k60",
      negativeHonesty: { honest: 4, total: 5, fraction: GATE_NEGATIVE_HONESTY_FRACTION_THRESHOLD },
    });
    expect(computeGate(legacy, passing).negativeHonestyPass).toBe(true);

    const failing = agg({ config: "v2-k60", negativeHonesty: { honest: 3, total: 5, fraction: 0.6 } });
    expect(computeGate(legacy, failing).negativeHonestyPass).toBe(false);
  });

  it("zero negative controls in the run cannot vacuously pass the honesty gate", () => {
    const legacy = agg({ config: "legacy" });
    const noNegatives = agg({ config: "v2-k60", negativeHonesty: { honest: 0, total: 0, fraction: NaN } });
    expect(computeGate(legacy, noNegatives).negativeHonestyPass).toBe(false);
  });

  it("citation accuracy: v2-k60 must not regress on EITHER denominator", () => {
    const legacy = agg({
      config: "legacy",
      citation: { citedCount: 5, allAnswerableDenom: 10, evidenceFoundDenom: 5, pctOfAllAnswerable: 50, pctOfEvidenceFound: 100 },
    });
    const better = agg({
      config: "v2-k60",
      citation: { citedCount: 6, allAnswerableDenom: 10, evidenceFoundDenom: 6, pctOfAllAnswerable: 60, pctOfEvidenceFound: 100 },
    });
    expect(computeGate(legacy, better).citationAccuracyPass).toBe(true);

    const worseOnOneDenom = agg({
      config: "v2-k60",
      citation: { citedCount: 4, allAnswerableDenom: 10, evidenceFoundDenom: 5, pctOfAllAnswerable: 40, pctOfEvidenceFound: 100 },
    });
    expect(computeGate(legacy, worseOnOneDenom).citationAccuracyPass).toBe(false);
  });

  it("a NaN legacy citation denominator doesn't block the gate (nothing to regress against)", () => {
    const legacy = agg({
      config: "legacy",
      citation: { citedCount: 0, allAnswerableDenom: 0, evidenceFoundDenom: 0, pctOfAllAnswerable: NaN, pctOfEvidenceFound: NaN },
    });
    const v2k60 = agg({
      config: "v2-k60",
      citation: { citedCount: 2, allAnswerableDenom: 4, evidenceFoundDenom: 2, pctOfAllAnswerable: 50, pctOfEvidenceFound: 100 },
    });
    expect(computeGate(legacy, v2k60).citationAccuracyPass).toBe(true);
  });

  it("overallPass requires all three criteria", () => {
    const legacy = agg({ config: "legacy", evidenceRecall: { hit: 21, denom: 100, pct: 21 } });
    const allPass = agg({
      config: "v2-k60",
      evidenceRecall: { hit: 40, denom: 100, pct: 40 },
      negativeHonesty: { honest: 5, total: 5, fraction: 1 },
      citation: { citedCount: 5, allAnswerableDenom: 5, evidenceFoundDenom: 5, pctOfAllAnswerable: 100, pctOfEvidenceFound: 100 },
    });
    expect(computeGate(legacy, allPass).overallPass).toBe(true);

    const recallFailsOnly = agg({
      config: "v2-k60",
      evidenceRecall: { hit: 25, denom: 100, pct: 25 }, // only +4pts
      negativeHonesty: { honest: 5, total: 5, fraction: 1 },
      citation: { citedCount: 5, allAnswerableDenom: 5, evidenceFoundDenom: 5, pctOfAllAnswerable: 100, pctOfEvidenceFound: 100 },
    });
    expect(computeGate(legacy, recallFailsOnly).overallPass).toBe(false);
  });
});

// ---- markdown rendering (smoke) ---------------------------------------------------

describe("renderScorecardMarkdown", () => {
  it("renders a full headline+gate table when legacy and v2-k60 are both present", () => {
    const legacyMetrics = [
      computeQuestionMetrics(
        runResult({
          question: question({ id: "known-1", type: "known-answer" }),
          resolvedGoldIds: [1],
          candidateIds: [1],
          evidenceIds: [1],
          answer: answer({ citedClaimIds: [1], retrievalMode: "legacy" }),
        }),
      ),
    ];
    const v2Metrics = [
      computeQuestionMetrics(
        runResult({
          question: question({ id: "known-1", type: "known-answer" }),
          resolvedGoldIds: [1],
          candidateIds: [1, 2],
          evidenceIds: [1],
          answer: answer({ citedClaimIds: [1] }),
        }),
      ),
    ];
    const legacyAgg = aggregateConfig("legacy", legacyMetrics);
    const v2Agg = aggregateConfig("v2-k60", v2Metrics);
    const gate = computeGate(legacyAgg, v2Agg);
    const md = renderScorecardMarkdown({
      meta: {
        generatedAt: "2026-07-11T18:00:00.000Z",
        evalSetPath: "docs/evals/ask-eval-set.json",
        evalSetCreatedAt: "2026-07-11T17:00:38.321Z",
        corpus: { claimCount: 560, minDate: "2026-06-20", maxDate: "2026-07-11" },
        dbHost: "ep-example-branch.neon.tech",
        configsRun: ["legacy", "v2-k60"],
      },
      aggregates: [legacyAgg, v2Agg],
      kSensitivity: buildKSensitivityTable([v2Agg]),
      gate,
      detailRows: [...toDetailRows("legacy", legacyMetrics), ...toDetailRows("v2-k60", v2Metrics)],
    });

    expect(md).toContain("# ASK eval scorecard");
    expect(md).toContain("Headline: legacy vs v2-k60");
    expect(md).toContain("GATE:");
    expect(md).toContain("known-1");
    expect(md).toContain("ep-example-branch.neon.tech");
  });

  it("degrades gracefully (no crash, explanatory text) when legacy or v2-k60 is missing", () => {
    const v2Agg = aggregateConfig("v2-k40", []);
    const md = renderScorecardMarkdown({
      meta: {
        generatedAt: "now",
        evalSetPath: "p",
        evalSetCreatedAt: "c",
        corpus: { claimCount: 0, minDate: null, maxDate: null },
        dbHost: "host",
        configsRun: ["v2-k40"],
      },
      aggregates: [v2Agg],
      kSensitivity: buildKSensitivityTable([v2Agg]),
      gate: null,
      detailRows: [],
    });
    expect(md).toContain("headline table skipped");
    expect(md).toContain("GATE not computed");
  });
});
