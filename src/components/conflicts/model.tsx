// Shared presentation helpers for the Phase-6 conflict surfaces. Pure and
// server-safe; no data access, no state. Every ratio renders numerator AND
// denominator beside any percentage (prompt §14), and unavailable states are
// rendered by the caller as words, never through these numeric helpers.

import type { ConflictMatcherStampV1 } from "@/lib/conflicts/eval-profile";
import { MATCHER_RUNG_COPY } from "@/lib/conflicts/product-copy";
import type { HeadlineCount } from "@/lib/conflicts/vocabulary";

export function pctOf(count: HeadlineCount): number {
  // scored results can never carry a zero denominator (persistence gate);
  // guard anyway so a rendering path can never divide by zero
  return count.denominator === 0 ? 0 : Math.round((count.matched / count.denominator) * 100);
}

/** "1 of 3 declared Key Takeaways (33%)" — n/d always beside the %. */
export function Ratio({ count, unitNoun }: { count: HeadlineCount; unitNoun?: string }) {
  const noun = unitNoun ?? "declared Key Takeaways";
  return (
    <span className="tabular-nums">
      {count.matched} of {count.denominator} {noun} ({pctOf(count)}%)
    </span>
  );
}

export function trackLabel(track: string): string {
  return track === "elite_politics" ? "elite politics" : track;
}

export function hedgeLabel(hedge: string): string {
  return hedge; // the five hedge values are already analyst vocabulary
}

/** Matcher-rung badge copy + degraded flag for one population label. */
export function rungCopyOf(label: string): { label: string; degraded: boolean } {
  const copy = MATCHER_RUNG_COPY[label as keyof typeof MATCHER_RUNG_COPY];
  // fail closed on an unknown label: surface it verbatim, marked degraded, so
  // a new rung can never silently render as a healthy majority result
  return copy ?? { label: `UNRECOGNIZED matcher label: ${label}`, degraded: true };
}

/** True when the two population resolutions differ (mixed-rung disclosure is
 *  then mandatory — Gate-4 legal MINOR-3). */
export function isMixedRung(matcher: ConflictMatcherStampV1): boolean {
  return matcher.corpusRecall.label !== matcher.publishedRetention.label;
}

const BADGE_BASE =
  "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium";

/** Visual badge for a matcher rung; degraded rungs get the amber treatment. */
export function RungBadge({ label }: { label: string }) {
  const copy = rungCopyOf(label);
  return (
    <span
      data-degraded={copy.degraded ? "true" : "false"}
      className={
        copy.degraded
          ? `${BADGE_BASE} border-amber-600 text-amber-700 dark:border-amber-500 dark:text-amber-400`
          : `${BADGE_BASE} border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300`
      }
    >
      {copy.label}
    </span>
  );
}

/** ISO instant rendered as a <time> element (UTC, as stored — fixture data). */
export function Instant({ iso }: { iso: string | null }) {
  if (iso === null) return <span>unknown</span>;
  return (
    <time dateTime={iso} title={iso} className="tabular-nums">
      {iso.replace("T", " ").replace(":00Z", "Z")}
    </time>
  );
}
