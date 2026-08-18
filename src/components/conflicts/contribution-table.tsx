// Contribution attribution (analyst question 3; contract §7): distinct
// matched-takeaway counts per theater/track/source bucket, computed over the
// CORPUS-RECALL matched units, with the non-additivity disclosed beside the
// table. The label is the frozen "matched takeaways with evidence from …".

import type { ConflictContributionTotalsV1 } from "@/lib/conflicts/eval-profile";
import { CONTRIBUTION_POPULATION_NOTE, NON_ADDITIVE_NOTE } from "@/lib/conflicts/product-copy";
import { trackLabel } from "./model";

function BucketList({
  heading,
  bucket,
  format,
}: {
  heading: string;
  bucket: Readonly<Record<string, number | undefined>>;
  format?: (key: string) => string;
}) {
  const entries = Object.entries(bucket)
    .filter((e): e is [string, number] => e[1] !== undefined)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <h4 className="text-sm font-semibold">{heading}</h4>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">none</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm">
          {entries.map(([key, count]) => (
            <li key={key} className="flex justify-between gap-2">
              <span className="break-all">{format ? format(key) : key}</span>
              <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContributionTable({
  totals,
}: {
  totals: ConflictContributionTotalsV1 | undefined;
}) {
  if (totals === undefined) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Contribution totals are unavailable for this result.
      </p>
    );
  }
  return (
    <div>
      <h3 className="text-sm font-semibold">Matched takeaways with evidence from …</h3>
      <p
        data-testid="contribution-population-note"
        className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
      >
        {CONTRIBUTION_POPULATION_NOTE}
      </p>
      <p className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400">{NON_ADDITIVE_NOTE}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <BucketList
          heading="by theater"
          bucket={totals.byTheater}
          format={(key) => key.toUpperCase()}
        />
        <BucketList heading="by track" bucket={totals.byTrack} format={trackLabel} />
        <BucketList heading="by source" bucket={totals.bySource} />
      </div>
    </div>
  );
}
