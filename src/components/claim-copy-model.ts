import type { Locale } from "@/i18n/dictionaries";
import { formatEtDateTime } from "@/lib/time/format-et";
import {
  canonicalEvidenceDocs,
  claimSourceLabel,
  evidencePlatform,
  safeHttpUrl,
  summarizeClaimEvidence,
  type ClaimSourceDoc,
  type EvidencePlatform,
} from "./claim-evidence-model";

type CopyTranslator = (key: string) => string;

export type ClaimCopySurface = "digest" | "ask_cited" | "ask_related" | "search" | "signal" | "entity";
export type ClaimCopyMode = "report" | "link" | "evidence" | "text";

export interface ClaimCopyPayload {
  claimId: number;
  text: string;
  hedging: string;
  asOf: string | null;
  countryName: string;
  countryIso2: string;
  claimUrl: string | null;
  docs: ClaimSourceDoc[];
  showScores: boolean;
}

export interface ClaimCopyLabels {
  copyForReport: string;
  moreCopyOptions: string;
  copyLink: string;
  copyWithEvidence: string;
  copyTextOnly: string;
  copying: string;
  reportCopied: string;
  linkCopied: string;
  evidenceCopied: string;
  textCopied: string;
  copyFailed: string;
  statusLabel: string;
  asOfLabel: string;
  evidenceLabel: string;
  sourceLabel: string;
  sourceValue: string;
  linkedSummary: string;
  evidenceListLabel: string;
  publishedLabel: string;
  firstSeenLabel: string;
  platformLabel: string;
  reliabilityLabel: string;
  unknown: string;
  statuses: Record<"confirmed" | "assessed" | "claimed" | "unverified" | "unknown", string>;
  platforms: Record<Exclude<EvidencePlatform, "other">, string>;
}

export interface ClaimCopyContent {
  plain: string;
  html: string;
}

export function claimCopyLabels(t: CopyTranslator): ClaimCopyLabels {
  return {
    copyForReport: t("copy.for_report"),
    moreCopyOptions: t("copy.more_actions"),
    copyLink: t("copy.link"),
    copyWithEvidence: t("copy.with_evidence"),
    copyTextOnly: t("copy.text_only"),
    copying: t("copy.pending"),
    reportCopied: t("copy.report_copied"),
    linkCopied: t("copy.link_copied"),
    evidenceCopied: t("copy.evidence_copied"),
    textCopied: t("copy.text_copied"),
    copyFailed: t("copy.failed"),
    statusLabel: t("copy.status"),
    asOfLabel: t("copy.as_of"),
    evidenceLabel: t("copy.evidence"),
    sourceLabel: t("copy.source"),
    sourceValue: t("copy.source_value"),
    linkedSummary: t("copy.linked_summary"),
    evidenceListLabel: t("copy.evidence_list"),
    publishedLabel: t("copy.published"),
    firstSeenLabel: t("copy.first_seen"),
    platformLabel: t("copy.platform"),
    reliabilityLabel: t("copy.reliability"),
    unknown: t("copy.unknown"),
    statuses: {
      confirmed: t("copy.status_confirmed"),
      assessed: t("copy.status_assessed"),
      claimed: t("copy.status_claimed"),
      unverified: t("copy.status_unverified"),
      unknown: t("copy.status_unknown"),
    },
    platforms: {
      rss_news: t("sources.platform.rss_news"),
      gdelt: t("sources.platform.gdelt"),
      telegram: t("sources.platform.telegram"),
      x: t("sources.platform.x"),
      procurement: t("sources.platform.procurement"),
    },
  };
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}

/** Escape every user/source-controlled value before rich clipboard serialization. */
export function escapeClaimCopyHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function status(payload: ClaimCopyPayload, labels: ClaimCopyLabels): string {
  const key = payload.hedging.toLocaleLowerCase();
  return labels.statuses[key as keyof ClaimCopyLabels["statuses"]] ?? labels.statuses.unknown;
}

function platform(doc: ClaimSourceDoc, labels: ClaimCopyLabels): string {
  const kind = evidencePlatform(doc);
  if (kind !== "other") return labels.platforms[kind];
  return doc.adapter.trim().replace(/[_-]+/g, " ") || labels.unknown;
}

function displayTime(value: string | null, locale: Locale, unknown: string): string {
  return formatEtDateTime(value, locale) ?? unknown;
}

function sourceValue(payload: ClaimCopyPayload, labels: ClaimCopyLabels): string {
  return interpolate(labels.sourceValue, {
    country: payload.countryName,
    claimId: payload.claimId,
  });
}

function linkedSummary(payload: ClaimCopyPayload, labels: ClaimCopyLabels): string {
  const summary = summarizeClaimEvidence(payload.docs);
  return interpolate(labels.linkedSummary, {
    docs: summary.documents,
    channels: summary.channels,
    platforms: summary.platforms,
  });
}

export function canCopyClaimCitation(payload: ClaimCopyPayload): boolean {
  return Boolean(payload.asOf?.trim() && canonicalClaimUrl(payload));
}

function canonicalClaimUrl(payload: ClaimCopyPayload): string | null {
  const safe = safeHttpUrl(payload.claimUrl);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const parts = url.pathname.split("/");
    const hasCanonicalPath =
      parts.length === 4 &&
      parts[1] === "digests" &&
      parts[2] === payload.countryIso2.toLocaleLowerCase() &&
      /^\d{4}-\d{2}-\d{2}$/.test(parts[3]);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "bnow.net" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      !hasCanonicalPath ||
      url.hash !== `#c${payload.claimId}`
    ) {
      return null;
    }
    return safe;
  } catch {
    return null;
  }
}

function reportLines(payload: ClaimCopyPayload, labels: ClaimCopyLabels): string[] | null {
  const url = canonicalClaimUrl(payload);
  if (!payload.asOf?.trim() || !url) return null;
  return [
    payload.text,
    `${labels.statusLabel}: ${status(payload, labels)} · ${labels.asOfLabel}: ${payload.asOf}`,
    `${labels.evidenceLabel}: ${linkedSummary(payload, labels)}`,
    `${labels.sourceLabel}: ${sourceValue(payload, labels)}`,
    url,
  ];
}

function reportHtml(payload: ClaimCopyPayload, labels: ClaimCopyLabels): string | null {
  const url = canonicalClaimUrl(payload);
  if (!payload.asOf?.trim() || !url) return null;
  return [
    `<p>${escapeClaimCopyHtml(payload.text)}</p>`,
    `<p><strong>${escapeClaimCopyHtml(labels.statusLabel)}:</strong> ${escapeClaimCopyHtml(status(payload, labels))} · <strong>${escapeClaimCopyHtml(labels.asOfLabel)}:</strong> ${escapeClaimCopyHtml(payload.asOf)}<br>`,
    `<strong>${escapeClaimCopyHtml(labels.evidenceLabel)}:</strong> ${escapeClaimCopyHtml(linkedSummary(payload, labels))}<br>`,
    `<strong>${escapeClaimCopyHtml(labels.sourceLabel)}:</strong> ${escapeClaimCopyHtml(sourceValue(payload, labels))}<br>`,
    `<a href="${escapeClaimCopyHtml(url)}">${escapeClaimCopyHtml(url)}</a></p>`,
  ].join("");
}

function evidencePlainLine(doc: ClaimSourceDoc, index: number, payload: ClaimCopyPayload, labels: ClaimCopyLabels, locale: Locale): string {
  const parts = [
    `${index + 1}. ${claimSourceLabel(doc)}`,
    `${labels.platformLabel}: ${platform(doc, labels)}`,
    `${labels.publishedLabel}: ${displayTime(doc.publishedAt, locale, labels.unknown)}`,
    `${labels.firstSeenLabel}: ${displayTime(doc.firstSeenAt, locale, labels.unknown)}`,
  ];
  if (payload.showScores && doc.reliability !== null && Number.isFinite(doc.reliability)) {
    parts.push(`${labels.reliabilityLabel}: ${doc.reliability.toFixed(2)}`);
  }
  const url = safeHttpUrl(doc.url);
  if (url) parts.push(url);
  return parts.join(" · ");
}

function evidenceHtmlLine(doc: ClaimSourceDoc, payload: ClaimCopyPayload, labels: ClaimCopyLabels, locale: Locale): string {
  const parts = [
    escapeClaimCopyHtml(claimSourceLabel(doc)),
    `<strong>${escapeClaimCopyHtml(labels.platformLabel)}:</strong> ${escapeClaimCopyHtml(platform(doc, labels))}`,
    `<strong>${escapeClaimCopyHtml(labels.publishedLabel)}:</strong> ${escapeClaimCopyHtml(displayTime(doc.publishedAt, locale, labels.unknown))}`,
    `<strong>${escapeClaimCopyHtml(labels.firstSeenLabel)}:</strong> ${escapeClaimCopyHtml(displayTime(doc.firstSeenAt, locale, labels.unknown))}`,
  ];
  if (payload.showScores && doc.reliability !== null && Number.isFinite(doc.reliability)) {
    parts.push(`<strong>${escapeClaimCopyHtml(labels.reliabilityLabel)}:</strong> ${doc.reliability.toFixed(2)}`);
  }
  const url = safeHttpUrl(doc.url);
  if (url) parts.push(`<a href="${escapeClaimCopyHtml(url)}">${escapeClaimCopyHtml(url)}</a>`);
  return `<li>${parts.join(" · ")}</li>`;
}

export function buildClaimCopyContent(
  payload: ClaimCopyPayload,
  mode: ClaimCopyMode,
  labels: ClaimCopyLabels,
  locale: Locale,
): ClaimCopyContent | null {
  if (mode === "text") {
    return { plain: payload.text, html: `<p>${escapeClaimCopyHtml(payload.text)}</p>` };
  }

  const url = canonicalClaimUrl(payload);
  if (mode === "link") {
    if (!payload.asOf?.trim() || !url) return null;
    return { plain: url, html: `<a href="${escapeClaimCopyHtml(url)}">${escapeClaimCopyHtml(url)}</a>` };
  }

  const lines = reportLines(payload, labels);
  const html = reportHtml(payload, labels);
  if (!lines || !html) return null;
  if (mode === "report") return { plain: lines.join("\n"), html };

  const docs = canonicalEvidenceDocs(payload.docs);
  const plainEvidence = docs.map((doc, index) => evidencePlainLine(doc, index, payload, labels, locale));
  const htmlEvidence = docs.map((doc) => evidenceHtmlLine(doc, payload, labels, locale));
  return {
    plain: [...lines, "", labels.evidenceListLabel, ...plainEvidence].join("\n"),
    html: `${html}<p><strong>${escapeClaimCopyHtml(labels.evidenceListLabel)}</strong></p><ol>${htmlEvidence.join("")}</ol>`,
  };
}
