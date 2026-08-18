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
  PIPELINE_QUESTIONS_NOTE,
  PUBLISHED_POPULATION_NOTE,
} from "@/lib/conflicts/product-copy";
import { partialCountsOf } from "@/lib/conflicts/product-view";
import { Ratio, RungBadge } from "./model";

export function PresenceModule({ result }: { result: ConflictScoredResultV1 }) {
  const partials = partialCountsOf(result);
  const retentionGap =
    result.headline.corpusRecall.matched > result.headline.publishedRetention.matched;
  const matcher = result.matcher;
  return (
    <div>
      <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">{PIPELINE_QUESTIONS_NOTE}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="text-sm font-semibold">Corpus recall</h4>
          <p className="mt-1 text-lg font-bold">
            <Ratio count={result.headline.corpusRecall} />
          </p>
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
          <h4 className="text-sm font-semibold">Published retention</h4>
          <p className="mt-1 text-lg font-bold">
            <Ratio count={result.headline.publishedRetention} />
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
      <p className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
        {PUBLISHED_POPULATION_NOTE}
      </p>
    </div>
  );
}
