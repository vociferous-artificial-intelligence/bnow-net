// The per-day benchmark list on the real-observation surfaces. It replaces the
// fixture build's BenchmarkRunList, and differs from it in one way that matters:
// every row is a DAILY-FINAL observation (memo C4, resolved at read time by
// db-product-view.ts), and days whose final edition has not been evaluated are
// listed SEPARATELY as pending rather than filled in from another edition.
//
// Teaser tier: counts, labels, ratios and edition keys only — no claim text and
// no reference-takeaway text ever reaches this component's props.

import Link from "next/link";
import type { DbConflictDay, DbPendingDay } from "@/lib/conflicts/db-product-view";
import {
  DAILY_FINAL_SELECTION_NOTE,
  MATCHER_RUNG_COPY,
  PENDING_DAY_NOTES,
  noObservationsNote,
} from "@/lib/conflicts/product-copy";
import { Ratio } from "./model";

export function ObservationDayList({
  slug,
  days,
  pending,
  windowDays,
}: {
  slug: string;
  days: readonly DbConflictDay[];
  pending: readonly DbPendingDay[];
  windowDays: number;
}) {
  if (days.length === 0 && pending.length === 0) {
    return (
      <p data-testid="observations-empty" className="py-6 text-sm text-gray-600 dark:text-gray-400">
        {noObservationsNote(windowDays)}
      </p>
    );
  }
  return (
    <div>
      {days.length === 0 ? (
        <p data-testid="observations-empty" className="text-sm text-gray-600 dark:text-gray-400">
          {noObservationsNote(windowDays)}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="observation-day-list">
          {days.map((day) => {
            const rung = MATCHER_RUNG_COPY[day.observation.matcherRung];
            return (
              <li
                key={day.editionKey}
                className="rounded border border-gray-200 p-3 text-sm dark:border-gray-800"
              >
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Link
                    href={`/conflicts/${slug}/benchmark/${day.benchmarkKey}`}
                    className="font-medium underline tabular-nums"
                  >
                    {day.reportDate}
                  </Link>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                    {day.editionKey}
                  </span>
                  {day.multiEdition && (
                    <span
                      data-testid="multi-edition-marker"
                      className="text-xs text-amber-700 dark:text-amber-400"
                    >
                      daily final of {day.orderedEditionKeys.length} editions
                    </span>
                  )}
                </div>
                <p className="mt-1">
                  published retention{" "}
                  <Ratio count={day.result.headline.publishedRetention} /> · corpus recall{" "}
                  <Ratio count={day.result.headline.corpusRecall} />
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {rung.degraded ? rung.label : `matcher: ${rung.label}`}
                  {day.legacyOnlyMatched > 0 && (
                    <>
                      {" · "}
                      <span data-testid="legacy-only-matched" className="tabular-nums">
                        {day.legacyOnlyMatched} matched with legacy-only evidence
                      </span>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {days.some((d) => d.multiEdition) && (
        <p
          data-testid="daily-final-note"
          className="mt-3 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
        >
          {DAILY_FINAL_SELECTION_NOTE}
        </p>
      )}
      {pending.length > 0 && (
        <div className="mt-4" data-testid="pending-days">
          <h4 className="text-sm font-semibold">Days with no result yet</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {pending.map((day) => (
              <li key={day.reportDate} className="text-gray-600 dark:text-gray-400">
                <span className="tabular-nums font-medium">{day.reportDate}</span> —{" "}
                {PENDING_DAY_NOTES[day.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
