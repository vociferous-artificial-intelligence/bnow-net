// The benchmark module (analyst question 4): ONE report-level score for the
// selected reference report, under the frozen public label. Rules bound here:
// - the metric is expert-benchmark COVERAGE (never accuracy/truth);
// - numerator/denominator sit beside the percentage;
// - the ISW/CTP non-independence caveat renders INSIDE this module, beside/
//   above the score — prominently enough to affect interpretation;
// - partial takeaways count as misses and the diagnostic renders beside the
//   headline (union count, labeled as a union — Gate-4 obligation (a));
// - keyword-rung results carry a visible DEGRADED badge and the
//   full-denominator note (register #8 M1);
// - unavailable/gap results render as provenance statements, never as 0%.

import type { ConflictResultV1 } from "@/lib/conflicts/eval-profile";
import {
  KEYWORD_DENOMINATOR_NOTE,
  NON_INDEPENDENCE_CAVEAT,
  NO_PROVEN_SNAPSHOT_NOTE,
  PARTIAL_EXPLAINER,
  PARTIAL_UNION_NOTE,
  PUBLICATION_GAP_NOTE,
  UNAVAILABLE_NOT_ZERO_NOTE,
} from "@/lib/conflicts/product-copy";
import { Ratio, RungBadge, isMixedRung, rungCopyOf } from "./model";

function Caveat() {
  return (
    <p
      data-testid="non-independence-caveat"
      className="mt-3 max-w-2xl border-s-2 border-amber-500 ps-3 text-sm text-gray-700 dark:text-gray-300"
    >
      {NON_INDEPENDENCE_CAVEAT}
    </p>
  );
}

export function BenchmarkHeadline({ result }: { result: ConflictResultV1 }) {
  if (result.state === "unavailable" && result.unavailableReason === "publication_gap") {
    return (
      <div
        data-testid="benchmark-headline"
        className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
      >
        <p className="text-lg font-semibold">
          Unavailable — no report published for <span className="tabular-nums">{result.gapDate}</span>
        </p>
        <p className="mt-2 max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {PUBLICATION_GAP_NOTE}
        </p>
        <p className="mt-1 max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {UNAVAILABLE_NOT_ZERO_NOTE}
        </p>
      </div>
    );
  }
  if (result.state === "unavailable") {
    return (
      <div
        data-testid="benchmark-headline"
        className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
      >
        <p className="text-lg font-semibold">
          Unavailable — {result.evaluationKind.replace(/_/g, " ")} evaluation (
          {result.unavailableReason.replace(/_/g, " ")})
        </p>
        <p className="mt-2 max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {NO_PROVEN_SNAPSHOT_NOTE}
        </p>
        <p className="mt-1 max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {UNAVAILABLE_NOT_ZERO_NOTE}
        </p>
      </div>
    );
  }

  const matcher = result.matcher;
  const headlineRung = rungCopyOf(result.matcherRung);
  return (
    <div
      data-testid="benchmark-headline"
      className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
    >
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
        {result.headlineLabel ?? "Key Takeaway benchmark coverage"} — published output
      </h3>
      <p className="mt-1 text-2xl font-bold">
        <Ratio count={result.headline.publishedRetention} />
      </p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        One report-level score per reference report. Small denominators are shown as-is — read the
        n, not just the percentage.
      </p>
      <Caveat />
      {result.headline.partialDiagnostic !== undefined && result.headline.partialDiagnostic > 0 && (
        <div data-testid="partial-diagnostic" className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          <p>
            <span className="font-semibold tabular-nums">
              {result.headline.partialDiagnostic} partial takeaway
              {result.headline.partialDiagnostic === 1 ? "" : "s"}
            </span>{" "}
            (union across both populations) — counted as misses above.
          </p>
          <p className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
            {PARTIAL_EXPLAINER} {PARTIAL_UNION_NOTE}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600 dark:text-gray-400">Matcher rung:</span>
        <RungBadge label={result.matcherRung} />
        {matcher !== undefined && isMixedRung(matcher) && (
          <span data-testid="mixed-rung-note" className="text-xs text-amber-700 dark:text-amber-400">
            mixed rungs — per-population labels below; the more degraded rung governs this label
          </span>
        )}
      </div>
      {headlineRung.degraded && result.matcherRung === "keyword" && (
        <p className="mt-2 max-w-2xl text-xs text-amber-700 dark:text-amber-400">
          {KEYWORD_DENOMINATOR_NOTE}
          {result.keywordUnmatchable !== undefined && (
            <>
              {" "}
              <span className="tabular-nums">
                {result.keywordUnmatchable} takeaway
                {result.keywordUnmatchable === 1 ? "" : "s"}
              </span>{" "}
              carried no keyword signal here.
            </>
          )}
        </p>
      )}
    </div>
  );
}
