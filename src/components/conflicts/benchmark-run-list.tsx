// The per-report benchmark run list: one row per fixture benchmark record,
// newest first. Scored rows show the report-level published-output ratio
// (n/d beside %); unavailable/gap rows render WORDS, never 0% and never a
// blank cell. Each row links to the benchmark detail beneath the conflict
// route.

import Link from "next/link";
import type { ConflictBenchmarkEntry } from "@/lib/conflicts/product-view";
import { Ratio, RungBadge } from "./model";

function rowDay(entry: ConflictBenchmarkEntry): string {
  const r = entry.result;
  return r.state === "unavailable" && r.unavailableReason === "publication_gap"
    ? r.gapDate
    : r.report.reportDate;
}

export function BenchmarkRunList({
  slug,
  entries,
}: {
  slug: string;
  entries: readonly ConflictBenchmarkEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
        No fixture benchmark records for this conflict.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:ps-0 [&_th:first-child]:ps-0">
        <caption className="sr-only">
          Fixture benchmark records for this conflict, newest first
        </caption>
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th scope="col" className="py-2">
              report day
            </th>
            <th scope="col">demonstration</th>
            <th scope="col">published output coverage</th>
            <th scope="col">matcher</th>
            <th scope="col">
              <span className="sr-only">detail</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const r = entry.result;
            return (
              <tr key={entry.benchmarkKey} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5 tabular-nums">{rowDay(entry)}</td>
                <td className="max-w-[16rem] break-words">
                  {entry.scenarioTitle}
                  {entry.variantId !== null && (
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {" "}
                      · variant {entry.variantId}
                    </span>
                  )}
                </td>
                <td>
                  {r.state === "scored" ? (
                    <Ratio count={r.headline.publishedRetention} unitNoun="takeaways" />
                  ) : (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      unavailable
                      {r.unavailableReason === "publication_gap"
                        ? " — no report published"
                        : " — no proven snapshot"}
                    </span>
                  )}
                </td>
                <td>{r.state === "scored" ? <RungBadge label={r.matcherRung} /> : "—"}</td>
                <td>
                  <Link
                    href={`/conflicts/${slug}/benchmark/${entry.benchmarkKey}`}
                    className="underline"
                  >
                    detail
                    <span className="sr-only">
                      {" "}
                      for {entry.scenarioTitle} ({rowDay(entry)})
                    </span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
