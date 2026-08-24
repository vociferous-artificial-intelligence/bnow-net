// Pipeline comparison (analyst question 5; contract §6.1): corpus recall vs
// published retention, never conflated. Renders BOTH ratios with explicit
// numerator/denominator, PER-POPULATION partial counts (Gate-4 binding
// obligation (a) — the headline union number is never presented as a
// per-population figure), the per-population matcher labels (mixed rungs are
// always disclosed per population — Gate-4 legal MINOR-3), and a
// retention-gap callout when evidence existed in the corpus but no published
// digest retained a matching claim.

import type { ConflictScoredResultV1 } from "@/lib/conflicts/eval-profile";
import {
  LANE_INCOMPARABLE_LABEL,
  LANE_INCOMPARABLE_NOTE,
  PIPELINE_QUESTIONS_NOTE,
  PUBLISHED_POPULATION_NOTE,
} from "@/lib/conflicts/product-copy";
import { partialCountsOf } from "@/lib/conflicts/product-view";
import { Ratio, RungBadge } from "./model";

/** Zero-eligible qualifier (Gate-7 product MINOR-2): "compared and missed"
 *  and "the corpus held NOTHING to compare" are opposite diagnoses for an
 *  analyst — pipeline gap vs analytic miss — and were previously
 *  distinguishable only inside the COLLAPSED method stamps. */
function EligibleQualifier({ eligibleCount }: { eligibleCount: number | undefined }) {
  if (eligibleCount !== 0) return null;
  return (
    <span
      data-testid="zero-eligible-qualifier"
      className="ms-2 text-xs font-normal text-amber-700 dark:text-amber-400"
    >
      (0 eligible claims in the corpus)
    </span>
  );
}

export function PresenceModule({ result }: { result: ConflictScoredResultV1 }) {
  const partials = partialCountsOf(result);
  // register #8 H1 at REPORT granularity (Gate-7 product MINOR-1): the lane
  // table already refuses a bare 0 for a wholly-incomparable lane, but on a
  // single-lane report the report-level corpus recall IS that lane, and this
  // card rendered a naked bold "0 of 1 (0%)" beside it. `missDiagnostic` is a
  // CORPUS-RECALL statement (the scorer passes lane diagnostics only for that
  // population), so the qualifier is corpus-only by construction — the
  // published card keeps showing its real ratio.
  const missDiagnostic = result.missDiagnostic ?? {};
  const corpusWhollyIncomparable =
    Object.keys(result.corpusRecall).length > 0 &&
    Object.entries(result.corpusRecall).every(
      ([unitId, verdict]) =>
        verdict === "miss" && missDiagnostic[unitId] === "incomparable_coverage",
    );
  const retentionGap =
    result.headline.corpusRecall.matched > result.headline.publishedRetention.matched;
  const matcher = result.matcher;
  return (
    <div>
      <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">{PIPELINE_QUESTIONS_NOTE}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold">Corpus recall</h3>
          {corpusWhollyIncomparable ? (
            <p
              data-testid="corpus-recall-incomparable"
              className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-400"
            >
              {LANE_INCOMPARABLE_LABEL}
            </p>
          ) : (
            <p className="mt-1 text-lg font-bold">
              <Ratio count={result.headline.corpusRecall} />
              <EligibleQualifier eligibleCount={result.selection?.corpusRecall.eligibleCount} />
            </p>
          )}
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            partial: <span className="tabular-nums">{partials.corpusRecall}</span> (counted as
            misses)
          </p>
          {matcher !== undefined && (
            <p className="mt-2 text-xs">
              <RungBadge label={matcher.corpusRecall.label} />
              {matcher.corpusRecall.voteRounds !== null && (
                <span className="ms-1 tabular-nums text-gray-600 dark:text-gray-400">
                  ({matcher.corpusRecall.voteRounds} usable round
                  {matcher.corpusRecall.voteRounds === 1 ? "" : "s"})
                </span>
              )}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold">Published retention</h3>
          <p className="mt-1 text-lg font-bold">
            <Ratio count={result.headline.publishedRetention} />
            <EligibleQualifier eligibleCount={result.selection?.publishedRetention.eligibleCount} />
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            partial: <span className="tabular-nums">{partials.publishedRetention}</span> (counted as
            misses)
          </p>
          {matcher !== undefined && (
            <p className="mt-2 text-xs">
              <RungBadge label={matcher.publishedRetention.label} />
              {matcher.publishedRetention.voteRounds !== null && (
                <span className="ms-1 tabular-nums text-gray-600 dark:text-gray-400">
                  ({matcher.publishedRetention.voteRounds} usable round
                  {matcher.publishedRetention.voteRounds === 1 ? "" : "s"})
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      {partials.union > 0 && (
        <p className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
          The headline shows the union of distinct partial takeaways across both populations (
          <span className="tabular-nums">{partials.union}</span>); the per-population counts above
          are the population-specific figures.
        </p>
      )}
      {retentionGap && (
        <p
          data-testid="retention-gap-callout"
          className="mt-3 max-w-2xl border-s-2 border-amber-500 ps-3 text-sm text-gray-700 dark:text-gray-300"
        >
          Retention gap: matching evidence existed in the mapped corpus, but the published output
          did not retain a matching claim for every covered takeaway (
          <span className="tabular-nums">
            {result.headline.corpusRecall.matched} corpus vs{" "}
            {result.headline.publishedRetention.matched} published of{" "}
            {result.headline.publishedRetention.denominator}
          </span>
          ).
        </p>
      )}
      {corpusWhollyIncomparable && (
        <p
          data-testid="corpus-incomparable-note"
          className="mt-3 max-w-2xl border-s-2 border-amber-500 ps-3 text-sm text-gray-700 dark:text-gray-300"
        >
          {LANE_INCOMPARABLE_NOTE}
        </p>
      )}
      <p className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
        {PUBLISHED_POPULATION_NOTE}
      </p>
    </div>
  );
}
