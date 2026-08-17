// Analysis-eval control plane, C2: ISW-VALIDATION matcher evaluator. Pure and
// fixture-tested — no DB, no network, no LLM.
//
// Every takeaway text in the datasets is a SYNTHETIC, takeaway-STYLE text
// authored for this repo — never real ISW prose (standing ruling 1). The
// evaluator derives keyword signatures from those texts through the REAL
// extractSignature (exactly like isw-extract.ts does for real reports) and
// scores BOTH production paths against the case's human labels:
// - the keyword path (scoreDigest) — the pipeline's own deterministic
//   fallback. Its label disagreements are RECORDED as precision/recall
//   metrics, never a per-case failure: the keyword matcher's known
//   imprecision is what the eval measures, not a fixture bug.
// - the match-set path (scoreDigestWithMatches over fixture LlmMatch[] —
//   offline stand-in for a live candidate's match output). Its label
//   disagreements DO fail the case: they are candidate-quality signal.

import { majorityFromVotes, type LlmMatch } from "../validation/llm-match";
import { classifyTakeawayTheater, extractSignature } from "../validation/keywords";
import {
  scoreDigest,
  scoreDigestWithMatches,
  type ClaimForValidation,
  type ValidationScore,
} from "../validation/score";
import type { IswTakeaway } from "../validation/isw-extract";
import type { ValidationEvalCase } from "./contracts";

export interface PathAgainstLabels {
  /** takeaways this path matched to some claim */
  predictedPositives: number;
  /** predicted matches whose claimId equals the label's claimId */
  correctPositives: number;
  /** predicted matches on takeaways labelled null OR to the wrong claim */
  falsePositives: number;
  /** labelled-positive takeaways this path failed to match correctly */
  misses: number;
  /** correctPositives / predictedPositives; null when nothing predicted */
  precision: number | null;
  /** correctPositives / labelled positives; null when nothing labelled */
  recall: number | null;
}

export interface ValidationCaseChecks {
  pass: boolean;
  failures: string[];
  labelledPositives: number;
  keyword: PathAgainstLabels;
  /** null when the case supplies no fixture match set */
  matchSet: PathAgainstLabels | null;
  keywordCoveragePct: number | null;
  keywordMatchedPairs: number;
  thinSourcedRate: number;
  timelinessHours: number | null;
  atPublishCoveragePct: number | null;
  theaterProbeFailures: number;
  majorityFailures: number;
  reproducible: boolean;
}

export interface ScoredValidationCase {
  checks: ValidationCaseChecks;
  serializedOutput: string;
}

/** Derive IswTakeaway signature rows from authored takeaway-style texts —
 *  the same extractSignature the real report parser applies. */
export function takeawaysFromTexts(texts: Array<{ index: number; text: string }>): IswTakeaway[] {
  return texts.map((t) => {
    const sig = extractSignature(t.text);
    return { index: t.index, toponyms: [...sig.toponyms], actions: [...sig.actions], chars: t.text.length };
  });
}

function agreementsOf(score: ValidationScore): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of score.divergences) {
    if (d.kind === "agreement" && d.iswIndex !== undefined && d.claimId !== undefined) {
      out.set(d.iswIndex, d.claimId);
    }
  }
  return out;
}

function scoreAgainstLabels(
  predicted: Map<number, number>,
  labels: Array<{ takeawayIndex: number; claimId: number | null }>,
): PathAgainstLabels {
  let predictedPositives = 0;
  let correctPositives = 0;
  let falsePositives = 0;
  let misses = 0;
  let labelledPositives = 0;
  for (const l of labels) {
    const p = predicted.get(l.takeawayIndex) ?? null;
    if (p !== null) predictedPositives++;
    if (l.claimId !== null) {
      labelledPositives++;
      if (p === l.claimId) correctPositives++;
      else misses++;
      if (p !== null && p !== l.claimId) falsePositives++;
    } else if (p !== null) {
      falsePositives++;
    }
  }
  return {
    predictedPositives,
    correctPositives,
    falsePositives,
    misses,
    precision: predictedPositives > 0 ? correctPositives / predictedPositives : null,
    recall: labelledPositives > 0 ? correctPositives / labelledPositives : null,
  };
}

/** `matchesOverride` lets a LIVE candidate's match output replace the case's
 *  committed fixture matches; offline scoring passes nothing. */
export function scoreValidationCase(
  evalCase: ValidationEvalCase,
  matchesOverride?: LlmMatch[],
): ScoredValidationCase {
  const { input, reference } = evalCase;
  const failures: string[] = [];
  const takeaways = takeawaysFromTexts(input.takeaways);
  const claims = input.claims as ClaimForValidation[];
  const publishedAt = input.iswPublishedAt ? new Date(input.iswPublishedAt) : null;
  const labelledPositives = reference.labels.filter((l) => l.claimId !== null).length;

  // keyword path — the pipeline's deterministic fallback, measured not judged
  const kw = scoreDigest(takeaways, claims, publishedAt);
  const kwAgain = scoreDigest(takeaways, claims, publishedAt);
  const keyword = scoreAgainstLabels(agreementsOf(kw), reference.labels);
  const reproducible = JSON.stringify(kw) === JSON.stringify(kwAgain);
  if (!reproducible) failures.push("keyword scoring is NOT reproducible on this input");

  // match-set path — fixture LlmMatch[] (or a live candidate's matches)
  const fixtureMatches = matchesOverride ?? (input.llmMatches as LlmMatch[] | undefined);
  let matchSet: PathAgainstLabels | null = null;
  let ms: ValidationScore | null = null;
  if (fixtureMatches !== undefined) {
    ms = scoreDigestWithMatches(takeaways, claims, publishedAt, fixtureMatches);
    matchSet = scoreAgainstLabels(agreementsOf(ms), reference.labels);
    if (matchSet.falsePositives > 0 || matchSet.misses > 0) {
      failures.push(
        `match-set path disagrees with labels: ${matchSet.falsePositives} false positive(s), ${matchSet.misses} miss(es)`,
      );
    }
  }

  // hand-computed arithmetic pins (keyword path)
  const kwExp = reference.expectKeyword ?? {};
  const pin = (field: string, want: unknown, got: unknown) => {
    if (want !== undefined && got !== want) {
      failures.push(`keyword ${field} expected ${String(want)}, got ${String(got)}`);
    }
  };
  pin("coveragePct", kwExp.coveragePct, kw.coveragePct);
  pin("matchedPairs", kwExp.matchedPairs, kw.details.matchedPairs);
  pin("thinSourcedRate", kwExp.thinSourcedRate, kw.thinSourcedRate);
  pin("timelinessHours", kwExp.timelinessHours, kw.timelinessHours);

  // at-publish pin: against the match-set path when a fixture match set
  // exists (its agreements are exactly authored), else the keyword path
  const atPublishSource = ms ?? kw;
  if (reference.expectAtPublish !== undefined) {
    const got = atPublishSource.atPublish;
    const want = reference.expectAtPublish;
    if (want === null) {
      if (got !== null) failures.push(`atPublish expected null, got ${JSON.stringify(got)}`);
    } else if (got === null) {
      failures.push("atPublish expected a result, got null");
    } else if (
      got.coveragePct !== want.coveragePct ||
      got.matchedBefore !== want.matchedBefore ||
      got.matchedTotal !== want.matchedTotal
    ) {
      failures.push(
        `atPublish expected ${JSON.stringify(want)}, got ${JSON.stringify({
          coveragePct: got.coveragePct,
          matchedBefore: got.matchedBefore,
          matchedTotal: got.matchedTotal,
        })}`,
      );
    }
  }

  // theater filtering probes
  let theaterProbeFailures = 0;
  for (const probe of input.theaterProbes ?? []) {
    const got = classifyTakeawayTheater(probe.toponyms);
    if (got !== probe.expect) {
      theaterProbeFailures++;
      failures.push(`theater of [${probe.toponyms.join(",")}] expected ${probe.expect}, got ${got}`);
    }
  }

  // majority-vote fixtures (the real majorityFromVotes, ruling-18-adjacent
  // matcher nondeterminism compensation — thresholds come from the function)
  let majorityFailures = 0;
  if (input.voteRounds !== undefined) {
    const { matches } = majorityFromVotes(input.voteRounds as LlmMatch[][], input.takeaways.length);
    for (const exp of reference.expectMajority ?? []) {
      const got = matches.find((m) => m.takeawayIndex === exp.takeawayIndex)?.claimId ?? null;
      if (got !== exp.final) {
        majorityFailures++;
        failures.push(`majority for takeaway ${exp.takeawayIndex} expected ${String(exp.final)}, got ${String(got)}`);
      }
    }
  }

  return {
    checks: {
      pass: failures.length === 0,
      failures,
      labelledPositives,
      keyword,
      matchSet,
      keywordCoveragePct: kw.coveragePct,
      keywordMatchedPairs: kw.details.matchedPairs,
      thinSourcedRate: kw.thinSourcedRate,
      timelinessHours: kw.timelinessHours,
      atPublishCoveragePct: atPublishSource.atPublish?.coveragePct ?? null,
      theaterProbeFailures,
      majorityFailures,
      reproducible,
    },
    serializedOutput: JSON.stringify({ keyword: kw, matchSet: ms }),
  };
}
