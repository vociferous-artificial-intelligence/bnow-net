// Signed-in-only tile row under the theater status panel: today's validation-vs-ISW
// numbers (docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md §3, Task 3 shortlist).
// Pure sync presentational server component — no fetch — so it renders directly in
// jsdom tests; the page does the one DB round-trip and pre-shapes every value.
//
// Honesty framing (Decision D2): coverage prints at its real 15-25% today, always
// paired with the favorable info-lead figure and a link to /scoreboard — never hidden
// until it improves. The DB's unsupported_claim_rate column is NEVER surfaced here or
// anywhere in this file: it is a thin-sourced proxy (docCount<2 AND hedged), not
// literal unsupportedness (src/lib/validation/score.ts), and the positive
// "corroborated share" (>=2 independent sources) is the honest replacement metric.

import Link from "next/link";
import type { Locale } from "@/i18n/dictionaries";
import { formatNumber, formatPercent } from "@/i18n/format";

export interface TheaterValidationEntry {
  iso2: string;
  /** Pre-localized theater name (t(home.theater.*)), matching TheaterStatusEntry. */
  name: string;
  /** 0-100 (validation_runs.coverage_pct), or null if no run exists for this theater yet. */
  coveragePct: number | null;
  /** validation_runs.timeliness_hours: ISW publish minus our earliest doc; positive = we were first. */
  timelinessHours: number | null;
  /** ISO timestamp of this theater's latest validation run, or null. */
  runAt: string | null;
}

export interface CorroboratedShare {
  corroborated: number;
  total: number;
}

export interface HomeValidationTilesProps {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** One entry per live theater, in display order. */
  entries: TheaterValidationEntry[];
  /**
   * Share of today's digest claims with >=2 claim_sources rows, across live theaters.
   * Null when not yet computable (e.g. before the day's first digest exists) — the page
   * decides that, not this component (keeps the null-vs-zero distinction honest: a real
   * 0% corroboration day must still render "0%", not the same fallback as "no data").
   */
  corroboratedShare: CorroboratedShare | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Same short absolute-timestamp convention as theater-status-panel.tsx's formatEt:
// America/New_York, always labeled "ET" (never a hardcoded UTC offset), null-safe so
// a missing/invalid timestamp renders an honest fallback instead of "Invalid Date".
// Duplicated locally rather than imported — it's five lines and keeps this component
// free of any dependency on a file another workstream owns this wave.
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

function formatLead(hours: number | null): string | null {
  if (hours === null || !Number.isFinite(hours)) return null;
  return `${hours > 0 ? "+" : ""}${hours.toFixed(1)}h`;
}

const TILE = "rounded-lg border border-gray-200 p-3 dark:border-gray-800";
const VALUE = "text-lg font-bold tabular-nums";
const LABEL = "text-xs text-gray-500 dark:text-gray-400";

export function HomeValidationTiles({
  locale,
  t,
  entries,
  corroboratedShare,
}: HomeValidationTilesProps) {
  const medianLead = median(
    entries.map((e) => e.timelinessHours).filter((h): h is number => h !== null),
  );
  const lastValidatedAt = entries.reduce<string | null>((latest, e) => {
    if (!e.runAt) return latest;
    if (!latest) return e.runAt;
    return new Date(e.runAt).getTime() > new Date(latest).getTime() ? e.runAt : latest;
  }, null);

  return (
    <section aria-label={t("home.validation.panel_label")} className="pb-10">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {entries.map((entry) => (
          <div key={entry.iso2} className={TILE}>
            <div className={VALUE}>
              {entry.coveragePct !== null
                ? `${entry.coveragePct.toFixed(0)}%`
                : t("home.validation.not_validated")}
            </div>
            <div className={LABEL}>
              {entry.name} · {t("home.validation.coverage_suffix")}
            </div>
          </div>
        ))}
        <div className={TILE}>
          <div className={VALUE}>{formatLead(medianLead) ?? t("home.validation.not_computed")}</div>
          <div className={LABEL}>{t("home.validation.median_lead_label")}</div>
        </div>
        <div className={TILE}>
          <div className={VALUE}>
            {formatEt(lastValidatedAt, locale) ?? t("home.validation.not_computed")}
          </div>
          <div className={LABEL}>{t("home.validation.last_validated_label")}</div>
        </div>
        <div className={TILE}>
          <div className={VALUE}>
            {corroboratedShare
              ? formatPercent(locale, corroboratedShare.corroborated / corroboratedShare.total)
              : t("home.validation.not_computed")}
          </div>
          <div className={LABEL}>
            {t("home.validation.corroborated_label")}
            {corroboratedShare &&
              ` · ${formatNumber(locale, corroboratedShare.corroborated)}/${formatNumber(locale, corroboratedShare.total)}`}
          </div>
        </div>
      </div>
      <Link
        href="/scoreboard"
        className="mt-3 inline-block text-xs underline hover:text-gray-600 dark:hover:text-gray-300"
      >
        {t("home.cta.scoreboard")}
      </Link>
    </section>
  );
}
