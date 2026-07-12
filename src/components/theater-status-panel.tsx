// Signed-in replacement for the marketing feature cards: an honest per-theater
// data-state panel (docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md §1). Pure sync
// server component — no fetch, no next/headers — so it renders directly in jsdom
// tests and never blocks on its own I/O (the page does the one DB round-trip).
//
// Deliberately absent: any "last ranking run" tile. Under the mapreduce digest engine
// there is no discrete scoring run to timestamp (eval §1) — showing one would either
// surface the stale manual registry-materialize date or invite a fabricated one.

import Link from "next/link";
import type { Locale } from "@/i18n/dictionaries";
import { formatNumber } from "@/i18n/format";

export interface TheaterStatusEntry {
  iso2: string;
  /** Pre-localized theater name (t(home.theater.*)), not translated here. */
  name: string;
  /** ISO timestamp of the freshest ingested document, or null if none yet. */
  lastFetch: string | null;
  docs24h: number;
  /** ISO timestamp the latest digest was (re)generated, or null if none exists. */
  lastDigestAt: string | null;
  digestHref: string;
  latestDate: string | null;
  /** count(claims) for this theater where claim_date = today (honest 0, not "no data"). */
  claimsToday: number;
  /** `/scoreboard/{iso2}/{digestDate}` of the theater's latest validation run, or null when none exists yet. */
  scoreboardHref: string | null;
}

export interface TheaterStatusPanelProps {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  entries: TheaterStatusEntry[];
  /** Pre-formatted, e.g. "~Jul 12, 02:00 ET" — derived from vercel.json's digest crons. */
  nextUpdateLabel: string;
  /** True when the X adapter's freshest fetch is null or stale (page decides the threshold). */
  xPaused: boolean;
}

// Short absolute timestamp in America/New_York, always labeled "ET" (ruling D4 of the
// eval doc): never a hardcoded UTC offset, so DST transitions stay correct without a
// redeploy. Returns null on missing/invalid input so callers can render an honest
// "no data yet" instead of "Invalid Date".
function formatEt(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${formatted} ET`;
}

// Time-only companion to formatEt above, used solely to compose the digest row's
// "{latestDate} · {HH:MM ET}" label — formatEt's own month/day would duplicate the
// leading latestDate. Same null/invalid-safe contract.
function formatEtTime(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${formatted} ET`;
}

export function TheaterStatusPanel({
  locale,
  t,
  entries,
  nextUpdateLabel,
  xPaused,
}: TheaterStatusPanelProps) {
  return (
    <section aria-label={t("home.status.panel_label")} className="py-10">
      <div className="grid gap-6 sm:grid-cols-3">
        {entries.map((entry) => {
          const current = formatEt(entry.lastFetch, locale);
          // Digest date leads the label ("2026-07-12 · 09:12 ET") — latestDate and
          // lastDigestAt come from the same GROUP BY row in page.tsx, so they're
          // either both present or both null; either half missing falls back to
          // the honest no_digest string rather than a half-composed label.
          const digestTime = formatEtTime(entry.lastDigestAt, locale);
          const digestLabel = entry.latestDate && digestTime ? `${entry.latestDate} · ${digestTime}` : null;
          return (
            <div
              key={entry.iso2}
              className="rounded-xl border border-gray-200 p-5 text-sm dark:border-gray-800"
            >
              <h3 className="mb-3 font-semibold">{entry.name}</h3>
              <dl className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.data_current")}
                  </dt>
                  <dd className="text-right">{current ?? t("home.status.no_data")}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.docs_24h")}
                  </dt>
                  <dd className="text-right">{formatNumber(locale, entry.docs24h)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.digest_generated")}
                  </dt>
                  <dd className="text-right">
                    <Link href={entry.digestHref} className="underline hover:text-gray-600 dark:hover:text-gray-300">
                      {digestLabel ?? t("home.status.no_digest")}
                    </Link>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.claims_today")}
                  </dt>
                  <dd className="text-right">{formatNumber(locale, entry.claimsToday)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.next_update")}
                  </dt>
                  <dd className="text-right">{nextUpdateLabel}</dd>
                </div>
              </dl>
              {entry.scoreboardHref && (
                <Link
                  href={entry.scoreboardHref}
                  className="mt-3 inline-block text-xs underline hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {t("home.status.scoreboard_link")}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {xPaused && (
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          {t("home.status.x_paused")}
        </p>
      )}
    </section>
  );
}
