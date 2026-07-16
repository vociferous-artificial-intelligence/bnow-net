import type { ClaimEvidenceLabels } from "./claim-sources";

export type EvidenceTranslator = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** Resolve chrome on the server before evidence props cross a client boundary. */
export function makeClaimEvidenceLabels(t: EvidenceTranslator): ClaimEvidenceLabels {
  return {
    summary: t("sources.summary"),
    earliestPublished: t("sources.earliest_published"),
    unknown: t("sources.unknown"),
    viewTrail: t("sources.view_trail"),
    sortLabel: t("sources.sort.label"),
    sortOldest: t("sources.sort.oldest"),
    sortNewest: t("sources.sort.newest"),
    sortReliability: t("sources.sort.reliability"),
    sortSource: t("sources.sort.source"),
    publishedColumn: t("sources.col.published"),
    sourceColumn: t("sources.col.source"),
    platformColumn: t("sources.col.platform"),
    reliabilityColumn: t("sources.col.reliability"),
    titleColumn: t("sources.col.title"),
    openSourceDocument: t("sources.open_document"),
    platforms: {
      rss_news: t("sources.platform.rss_news"),
      gdelt: t("sources.platform.gdelt"),
      telegram: t("sources.platform.telegram"),
      x: t("sources.platform.x"),
      procurement: t("sources.platform.procurement"),
    },
  };
}
