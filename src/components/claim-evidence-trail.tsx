"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/dictionaries";
import { formatEtDateTime } from "@/lib/time/format-et";
import { captureProductEvent } from "@/lib/analytics/client";
import {
  analyticsHedging,
  analyticsTheater,
  sourceCountBucket,
  type EvidenceAnalyticsContext,
} from "./analytics/product-event-model";
import { TrackedSourceLink } from "./analytics/tracked-source-link";
import {
  claimSourceLabel,
  evidencePlatform,
  safeHttpUrl,
  sortEvidenceDocs,
  type ClaimEvidenceLabels,
  type ClaimSourceDoc,
  type EvidenceSortMode,
} from "./claim-evidence-model";

export type { ClaimEvidenceLabels } from "./claim-evidence-model";

export interface ClaimEvidenceTrailProps {
  docs: ClaimSourceDoc[];
  locale: Locale;
  showScores: boolean;
  labels: ClaimEvidenceLabels;
  analytics?: EvidenceAnalyticsContext;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}

function exactIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function EvidenceTime({ value, locale, unknown }: { value: string | null; locale: Locale; unknown: string }) {
  const iso = exactIso(value);
  const displayed = iso ? formatEtDateTime(iso, locale) : null;
  if (!iso || !displayed) return <span>{unknown}</span>;
  return (
    <time dateTime={iso} title={iso}>
      {displayed}
    </time>
  );
}

function platformLabel(doc: ClaimSourceDoc, labels: ClaimEvidenceLabels): string {
  const platform = evidencePlatform(doc);
  if (platform !== "other") return labels.platforms[platform];
  const adapter = doc.adapter.trim();
  return adapter ? adapter.replace(/[_-]+/g, " ") : labels.unknown;
}

export function ClaimEvidenceTrail({ docs, locale, showScores, labels, analytics }: ClaimEvidenceTrailProps) {
  const [sortMode, setSortMode] = useState<EvidenceSortMode>("oldest_published");
  const sorted = sortEvidenceDocs(docs, sortMode);

  return (
    <details
      className="mt-2 min-w-0"
      data-print="hide"
      onToggle={(event) => {
        if (!event.currentTarget.open || !analytics) return;
        captureProductEvent("evidence_opened", {
          surface: analytics.surface,
          theater: analyticsTheater(analytics.theater),
          source_count_bucket: sourceCountBucket(analytics.sourceCount),
          hedging_class: analyticsHedging(analytics.hedgingClass),
        });
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
        {interpolate(labels.viewTrail, { n: docs.length })}
      </summary>
      <div className="mt-3 min-w-0 rounded border border-gray-200 p-3 dark:border-gray-800">
        <label className="flex max-w-sm flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          {labels.sortLabel}
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as EvidenceSortMode)}
          >
            <option value="oldest_published">{labels.sortOldest}</option>
            <option value="newest_published">{labels.sortNewest}</option>
            <option value="first_seen">{labels.sortFirstSeen}</option>
            <option value="reliability">{labels.sortReliability}</option>
            <option value="source">{labels.sortSource}</option>
          </select>
        </label>

        <div className="mt-3 max-w-full overflow-x-auto">
          <table className="min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-2 py-2 font-medium">{labels.publishedColumn}</th>
                <th className="px-2 py-2 font-medium">{labels.firstSeenColumn}</th>
                <th className="px-2 py-2 font-medium">{labels.sourceColumn}</th>
                <th className="px-2 py-2 font-medium">{labels.platformColumn}</th>
                {showScores && <th className="px-2 py-2 font-medium">{labels.reliabilityColumn}</th>}
                <th className="px-2 py-2 font-medium">{labels.titleColumn}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((doc) => {
                const safeUrl = safeHttpUrl(doc.url);
                const title = doc.title?.trim() || labels.openSourceDocument;
                return (
                  <tr key={doc.docId} className="border-b border-gray-100 align-top dark:border-gray-900">
                    <td className="whitespace-nowrap px-2 py-2">
                      <EvidenceTime value={doc.publishedAt} locale={locale} unknown={labels.unknown} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <EvidenceTime value={doc.firstSeenAt} locale={locale} unknown={labels.unknown} />
                    </td>
                    <td className="max-w-[220px] break-words px-2 py-2">{claimSourceLabel(doc)}</td>
                    <td className="whitespace-nowrap px-2 py-2">{platformLabel(doc, labels)}</td>
                    {showScores && (
                      <td className="whitespace-nowrap px-2 py-2">
                        {doc.reliability !== null && Number.isFinite(doc.reliability)
                          ? doc.reliability.toFixed(2)
                          : labels.unknown}
                      </td>
                    )}
                    <td className="max-w-[320px] break-words px-2 py-2">
                      {safeUrl ? (
                        <TrackedSourceLink
                          analytics={analytics}
                          platform={evidencePlatform(doc)}
                          className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                          href={safeUrl}
                          rel="nofollow noopener"
                          target="_blank"
                        >
                          {title}
                        </TrackedSourceLink>
                      ) : (
                        title
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
