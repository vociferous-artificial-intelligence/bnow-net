// Signed-in replacement for the marketing feature cards: an honest per-theater
// data-state panel. Pure sync server component — no fetch, no next/headers — so it
// renders directly in jsdom tests and never blocks on its own I/O (the page does
// the one DB round-trip).
//
// Cadence-aware since the 2026-07-12 analyst-trust sprint (docs/TIME-MODEL.md):
// the card names the digest BUCKET it describes (latest digest_date), labels its
// stage (intraday vs final) from the bucket's last write time, and keys the claims
// count to that same bucket — so "no digest" can never sit next to a nonzero
// claims count (the R2 hard rule, pinned by tests).
//
// Deliberately absent: any "last ranking run" tile. Under the mapreduce digest
// engine there is no discrete scoring run to timestamp — showing one would either
// surface the stale manual registry-materialize date or invite a fabricated one.

import Link from "next/link";
import type { Locale } from "@/i18n/dictionaries";
import { formatNumber } from "@/i18n/format";
import { toInstant } from "@/lib/time/day-boundary";
import { formatEtDateTime, formatEtTime } from "@/lib/time/format-et";
import { digestStatus, type DigestStatus } from "@/lib/time/digest-status";

export interface TheaterStatusEntry {
  iso2: string;
  /** Pre-localized theater name (t(home.theater.*)), not translated here. */
  name: string;
  /** Freshest ingested document (raw_documents.fetched_at max), or null if none yet. */
  lastFetch: string | Date | null;
  docs24h: number;
  /** Latest digest_date bucket (YYYY-MM-DD, a UTC day), or null when no digest exists. */
  latestDate: string | null;
  /** Last write to THAT bucket (its max created_at — last-writer-wins), or null. */
  lastGeneratedAt: string | Date | null;
  /** count(claims) where claim_date = latestDate — always the displayed bucket's count. */
  claimsForLatest: number;
  digestHref: string;
  /** `/scoreboard/{iso2}/{digestDate}` of the theater's latest validation run, or null. */
  scoreboardHref: string | null;
}

export interface TheaterStatusPanelProps {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  entries: TheaterStatusEntry[];
  /** The page's single render instant — injected so tests pin every cadence state. */
  nowIso: string;
  /** Next intraday digest cron fire (ISO), from vercel.json; null if underivable. */
  nextIntradayIso: string | null;
  /** Next finalize digest cron fire (ISO), from vercel.json; null if underivable. */
  nextFinalizeIso: string | null;
  /** True when the X adapter's freshest fetch is null or stale (page decides the threshold). */
  xPaused: boolean;
}

// "{date} · {stage} {h:mm AM/PM ET}" — the digest row names the bucket, its stage,
// and when that stage was written. A missing/invalid write time degrades to
// "{date} · {stage}" rather than fabricating a clock reading.
function digestLabel(
  status: Extract<DigestStatus, { kind: "today" | "previous" }>,
  locale: Locale,
  t: TheaterStatusPanelProps["t"],
): string {
  const stage = t(status.stage === "final" ? "home.status.stage_final" : "home.status.stage_intraday");
  const time = formatEtTime(status.generatedAt, locale);
  return time ? `${status.date} · ${stage} ${time}` : `${status.date} · ${stage}`;
}

// What fires next, phrased for the current stage. Before the day's finalize:
// "~3:30 PM ET · final ~10:00 PM ET" (or just the finalize when it is the sooner
// fire). After today's bucket is finalized, the only meaningful upcoming write is
// the next day's first intraday run.
function nextUpdateLabel(
  status: DigestStatus,
  nextIntradayIso: string | null,
  nextFinalizeIso: string | null,
  locale: Locale,
  t: TheaterStatusPanelProps["t"],
): string {
  const intradayAt = toInstant(nextIntradayIso);
  const finalizeAt = toInstant(nextFinalizeIso);
  const intraday = formatEtTime(intradayAt, locale);
  const final = formatEtTime(finalizeAt, locale);
  if (status.kind === "today" && status.stage === "final") {
    return intraday ? `~${intraday}` : "—";
  }
  const finalPart = final ? `${t("home.status.stage_final")} ~${final}` : null;
  if (intraday && finalPart && intradayAt && finalizeAt && intradayAt < finalizeAt) {
    return `~${intraday} · ${finalPart}`;
  }
  return finalPart ?? (intraday ? `~${intraday}` : "—");
}

export function TheaterStatusPanel({
  locale,
  t,
  entries,
  nowIso,
  nextIntradayIso,
  nextFinalizeIso,
  xPaused,
}: TheaterStatusPanelProps) {
  const now = toInstant(nowIso) ?? new Date();
  return (
    <section aria-label={t("home.status.panel_label")} className="py-10">
      <div className="grid gap-6 sm:grid-cols-3">
        {entries.map((entry) => {
          const current = formatEtDateTime(entry.lastFetch, locale);
          const status = digestStatus({
            latestDate: entry.latestDate,
            lastGeneratedAt: entry.lastGeneratedAt,
            now,
          });
          return (
            <div
              key={entry.iso2}
              className="relative rounded-xl border border-gray-200 p-5 text-sm dark:border-gray-800"
            >
              <h3 className="mb-3 font-semibold">{entry.name}</h3>
              <dl className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.data_current")}
                  </dt>
                  <dd className="text-right">{current ?? t("home.status.no_data")}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.docs_24h")}
                  </dt>
                  <dd className="text-right">{formatNumber(locale, entry.docs24h)}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.latest_digest")}
                  </dt>
                  <dd className="text-right">
                    <Link
                      href={entry.digestHref}
                      className="relative z-10 underline hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {status.kind === "none" ? t("home.status.no_digest") : digestLabel(status, locale, t)}
                    </Link>
                    {status.kind === "previous" && (
                      <span className="block text-xs text-gray-400 dark:text-gray-500">
                        {t("home.status.none_today")}
                      </span>
                    )}
                  </dd>
                </div>
                {status.kind !== "none" && (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t("home.status.claims_for", { date: status.date })}
                    </dt>
                    <dd className="text-right">{formatNumber(locale, entry.claimsForLatest)}</dd>
                  </div>
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {t("home.status.next_update")}
                  </dt>
                  <dd className="text-right">
                    {nextUpdateLabel(status, nextIntradayIso, nextFinalizeIso, locale, t)}
                  </dd>
                </div>
              </dl>
              {entry.scoreboardHref && (
                <Link
                  href={entry.scoreboardHref}
                  className="relative z-10 mt-3 inline-block text-xs underline hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {t("home.status.scoreboard_link")}
                </Link>
              )}
              {/* Whole-card stretched link (R3, analyst-home-v2 sprint): placed last
                  so it never shifts the tab/query order of the two links above it,
                  and z-0 (implicit, below the z-10 links) keeps them independently
                  clickable on top of it. Points at the same digestHref the "Latest
                  digest" row already links to (including its honest /countries/<iso2>
                  per-country-page fallback when no digest exists yet), so the whole-card target is
                  never a lie the row link doesn't already tell. */}
              <Link
                href={entry.digestHref}
                aria-label={`${entry.name} — ${t("home.status.latest_digest")}`}
                className="absolute inset-0 rounded-xl"
              />
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
