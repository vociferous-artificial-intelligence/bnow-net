import type { Locale } from "@/i18n/dictionaries";
import { formatEtDateTime } from "@/lib/time/format-et";
import {
  claimSourceLabel,
  DEFAULT_VISIBLE_CLAIM_DOCS,
  evidencePlatform,
  safeHttpUrl,
  selectClaimDocs,
  summarizeClaimEvidence,
  type ClaimSourceDoc,
} from "./claim-evidence-model";
import { ClaimEvidenceTrail, type ClaimEvidenceLabels } from "./claim-evidence-trail";
import { TrackedSourceLink } from "./analytics/tracked-source-link";
import type { EvidenceAnalyticsContext } from "./analytics/product-event-model";

export type { ClaimSourceDoc } from "./claim-evidence-model";
export { selectClaimDocs } from "./claim-evidence-model";
export type { ClaimEvidenceLabels } from "./claim-evidence-trail";

const CHIP_CLASS =
  "inline-flex max-w-[260px] items-baseline gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300";

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}

function exactIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function summaryTime(value: string | null, locale: Locale, unknown: string) {
  const iso = exactIso(value);
  const displayed = iso ? formatEtDateTime(iso, locale) : null;
  return iso && displayed ? (
    <time dateTime={iso} title={iso}>
      {displayed}
    </time>
  ) : (
    <span>{unknown}</span>
  );
}

function Chip({
  doc,
  showScores,
  analytics,
}: {
  doc: ClaimSourceDoc;
  showScores: boolean;
  analytics?: EvidenceAnalyticsContext;
}) {
  const label = claimSourceLabel(doc);
  const safeUrl = safeHttpUrl(doc.url);
  const content = (
    <>
      <span className="truncate">{label}</span>
      {showScores && doc.reliability !== null && Number.isFinite(doc.reliability) && (
        <span className="shrink-0">· {doc.reliability.toFixed(2)}</span>
      )}
    </>
  );

  if (!safeUrl) {
    return (
      <span className={CHIP_CLASS} title={doc.title ?? undefined}>
        {content}
      </span>
    );
  }

  return (
    <TrackedSourceLink
      analytics={analytics}
      platform={evidencePlatform(doc)}
      href={safeUrl}
      rel="nofollow noopener"
      target="_blank"
      className={`${CHIP_CLASS} hover:bg-gray-100 dark:hover:bg-gray-800`}
      title={doc.title ?? undefined}
    >
      {content}
    </TrackedSourceLink>
  );
}

export interface ClaimSourcesProps {
  docs: ClaimSourceDoc[];
  defaultVisible?: number;
  showScores: boolean;
  locale: Locale;
  labels: ClaimEvidenceLabels;
  analytics?: EvidenceAnalyticsContext;
}

/**
 * Serializable evidence presentation. It deliberately accepts translated strings,
 * never a translator function, so it is safe beneath Ask's client component graph.
 */
export function ClaimSources({
  docs,
  defaultVisible = DEFAULT_VISIBLE_CLAIM_DOCS,
  showScores,
  locale,
  labels,
  analytics,
}: ClaimSourcesProps) {
  if (docs.length === 0) return null;
  const { visible } = selectClaimDocs(docs, defaultVisible);
  const summary = summarizeClaimEvidence(docs);

  return (
    <div className="mt-2 min-w-0 pl-1" data-print="evidence-summary">
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {interpolate(labels.summary, {
          docs: summary.documents,
          channels: summary.channels,
          platforms: summary.platforms,
        })}
      </p>
      <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
        {labels.earliestPublished} {summaryTime(summary.earliestPublishedAt, locale, labels.unknown)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2" data-print="selected-evidence">
        {visible.map((doc) => (
          <Chip key={doc.docId} doc={doc} showScores={showScores} analytics={analytics} />
        ))}
      </div>
      <ClaimEvidenceTrail
        docs={docs}
        locale={locale}
        showScores={showScores}
        labels={labels}
        analytics={analytics}
      />
    </div>
  );
}
