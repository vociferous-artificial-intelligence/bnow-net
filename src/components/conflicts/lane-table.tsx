// Lane coverage table (analyst questions 2 and 6): the same declared
// takeaways partitioned by lane — lanes are never independent reports and
// never change the headline denominator (contract §4). A lane whose whole
// eligible class is incomparable renders "unavailable (incomparable
// evidence)" IN PLACE of its corpus-recall counts (register #8 H1): a bare 0
// there would imply comparable-but-missed.

import type { ConflictLaneCoverageRowV1 } from "@/lib/conflicts/eval-profile";
import { laneById } from "@/lib/conflicts/lanes";
import type { LaneTaxonomyVersion } from "@/lib/conflicts/lanes";
import {
  LANE_INCOMPARABLE_LABEL,
  LANE_INCOMPARABLE_NOTE,
} from "@/lib/conflicts/product-copy";

function Counts({ c }: { c: { matched: number; partial: number; miss: number } }) {
  return (
    <span className="tabular-nums">
      {c.matched} matched · {c.partial} partial · {c.miss} miss
    </span>
  );
}

export function LaneTable({
  lanes,
  taxonomyVersion,
}: {
  lanes: readonly ConflictLaneCoverageRowV1[];
  taxonomyVersion: LaneTaxonomyVersion;
}) {
  if (lanes.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        No lanes carry declared takeaways in this report.
      </p>
    );
  }
  const hasIncomparable = lanes.some((row) => row.diagnostic === "unavailable_incomparable");
  return (
    <div>
      {/* relative: keeps the abs-positioned sr-only caption inside this clip
          (see benchmark-run-list.tsx for the measured 390px overflow) */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:ps-0 [&_th:first-child]:ps-0">
          <caption className="sr-only">
            Lane coverage — the declared takeaways of this report partitioned by lane
          </caption>
          <thead>
            <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
              <th scope="col" className="py-2">
                lane
              </th>
              <th scope="col" className="text-right">
                takeaways
              </th>
              <th scope="col">corpus recall</th>
              <th scope="col">published retention</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((row) => (
              <tr key={row.lane} className="border-b border-gray-100 dark:border-gray-800">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {laneById(taxonomyVersion, row.lane).label}
                </th>
                <td className="text-right tabular-nums">{row.units}</td>
                <td>
                  {row.diagnostic === "unavailable_incomparable" ? (
                    <span
                      data-testid={`lane-incomparable-${row.lane}`}
                      className="font-medium text-amber-700 dark:text-amber-400"
                    >
                      {LANE_INCOMPARABLE_LABEL}
                    </span>
                  ) : (
                    <Counts c={row.corpusRecall} />
                  )}
                </td>
                <td>
                  <Counts c={row.publishedRetention} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
        Lanes partition the same declared takeaways — they are never independent reports and never
        change the headline denominator.
      </p>
      {hasIncomparable && (
        <p className="mt-1 max-w-2xl text-xs text-amber-700 dark:text-amber-400">
          {LANE_INCOMPARABLE_NOTE}
        </p>
      )}
    </div>
  );
}
