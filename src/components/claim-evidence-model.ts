export interface ClaimSourceDoc {
  docId: number;
  url: string | null;
  title: string | null;
  adapter: string;
  sourceId: number | null;
  sourceName: string | null;
  sourceKey: string | null;
  sourceDomain: string | null;
  platform: string | null;
  reliability: number | null;
  publishedAt: string | null;
  /**
   * raw_documents.fetched_at — when BNOW ingested the document. Retained and carried
   * on every doc: it is the deterministic sort tie-break below, the ranking recency
   * fallback, and the validation-timeliness/health input. It is NOT presented to
   * analysts (2026-07-16): "First seen by BNOW" told them when our crawler ran, not
   * when the world learned the fact, and it read as a provenance claim it never was.
   */
  firstSeenAt: string;
}

export type EvidenceSortMode =
  | "oldest_published"
  | "newest_published"
  | "reliability"
  | "source";

export type EvidencePlatform = "rss_news" | "gdelt" | "telegram" | "x" | "procurement" | "other";

export interface ClaimEvidenceLabels {
  summary: string;
  earliestPublished: string;
  unknown: string;
  viewTrail: string;
  sortLabel: string;
  sortOldest: string;
  sortNewest: string;
  sortReliability: string;
  sortSource: string;
  publishedColumn: string;
  sourceColumn: string;
  reliabilityColumn: string;
  titleColumn: string;
  /**
   * Link text for a document with no title, per transport. "Open source document" was
   * the same phrase for a wire story, a tweet and a tender notice, so it told the
   * analyst nothing about what they were about to open (2026-07-16).
   */
  openLabels: Record<EvidencePlatform, string>;
  platforms: Record<Exclude<EvidencePlatform, "other">, string>;
}

export interface ClaimEvidenceSummary {
  documents: number;
  channels: number;
  platforms: number;
  earliestPublishedAt: string | null;
}

export interface ClaimDocSelection {
  visible: ClaimSourceDoc[];
  hidden: ClaimSourceDoc[];
  collapsed: boolean;
  hiddenCount: number;
  hiddenChannels: number;
  hiddenPlatforms: number;
}

const COLLAPSE_THRESHOLD = 8;
export const DEFAULT_VISIBLE_CLAIM_DOCS = 6;

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Only these URLs are safe to expose as browser or rich-clipboard anchors. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const candidate = nonEmpty(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

function hostname(value: string | null | undefined): string | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  try {
    return new URL(safe).hostname.toLocaleLowerCase();
  } catch {
    return null;
  }
}

function normalizedIdentity(value: string | null | undefined): string | null {
  const candidate = nonEmpty(value);
  if (!candidate) return null;
  return candidate.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLocaleLowerCase();
}

/**
 * A source registry id is authoritative. For registry-less documents, prefer the
 * per-channel source key, then source domain/document hostname. Falling all the
 * way back to the adapter is intentionally last: otherwise every RSS/GDELT row is
 * incorrectly counted as one channel.
 */
export function claimChannelKey(doc: ClaimSourceDoc): string {
  if (doc.sourceId !== null) return `id:${doc.sourceId}`;
  const identity =
    normalizedIdentity(doc.sourceKey) ??
    normalizedIdentity(doc.sourceDomain) ??
    hostname(doc.url);
  return identity ? `unregistered:${identity}` : `adapter:${doc.adapter.toLocaleLowerCase()}`;
}

/** Exact human-label fallback contract; source data is never translated. */
export function claimSourceLabel(doc: ClaimSourceDoc): string {
  return (
    nonEmpty(doc.sourceName) ??
    nonEmpty(doc.sourceKey) ??
    hostname(doc.url) ??
    doc.adapter
  );
}

/** Visible transport platform, deliberately separate from registry source class. */
export function evidencePlatform(doc: ClaimSourceDoc): EvidencePlatform {
  const adapter = doc.adapter.trim().toLocaleLowerCase().replace(/-/g, "_");
  if (adapter === "rss") return "rss_news";
  if (adapter === "gdelt") return "gdelt";
  if (adapter === "telegram" || adapter === "telegram_web" || adapter === "telegram_mtproto") {
    return "telegram";
  }
  if (adapter === "x" || adapter === "x_api" || adapter === "twitter") return "x";
  if (adapter === "procurement" || adapter === "zakupki") return "procurement";

  const explicit = doc.platform?.trim().toLocaleLowerCase();
  if (explicit === "telegram") return "telegram";
  if (explicit === "x" || explicit === "twitter") return "x";
  return "other";
}

/**
 * The document's own title when it has one; otherwise a transport-aware invitation.
 * Never a document id — those are internal identifiers and mean nothing to a reader.
 */
export function evidenceTitle(doc: ClaimSourceDoc, labels: ClaimEvidenceLabels): string {
  return doc.title?.trim() || labels.openLabels[evidencePlatform(doc)];
}

/** Visible platform name for the badge/label, falling back to the raw adapter. */
export function evidencePlatformLabel(doc: ClaimSourceDoc, labels: ClaimEvidenceLabels): string {
  const platform = evidencePlatform(doc);
  if (platform !== "other") return labels.platforms[platform];
  const adapter = doc.adapter.trim();
  return adapter ? adapter.replace(/[_-]+/g, " ") : labels.unknown;
}

/** The established chip-selection class must not drift to the new display transport. */
function diversityPlatformClass(doc: ClaimSourceDoc): string {
  return doc.platform ?? doc.adapter;
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumber(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function compareLabel(a: ClaimSourceDoc, b: ClaimSourceDoc): number {
  return claimSourceLabel(a).localeCompare(claimSourceLabel(b), undefined, { sensitivity: "base" });
}

/** Deterministic ordering only — firstSeenAt is never surfaced to the analyst. */
function stableTieBreak(a: ClaimSourceDoc, b: ClaimSourceDoc): number {
  return (
    compareNullableNumber(timestamp(a.firstSeenAt), timestamp(b.firstSeenAt), 1) ||
    compareLabel(a, b) ||
    a.docId - b.docId
  );
}

export function compareEvidenceDocs(mode: EvidenceSortMode): (a: ClaimSourceDoc, b: ClaimSourceDoc) => number {
  return (a, b) => {
    let primary = 0;
    if (mode === "oldest_published") {
      primary = compareNullableNumber(timestamp(a.publishedAt), timestamp(b.publishedAt), 1);
    } else if (mode === "newest_published") {
      primary = compareNullableNumber(timestamp(a.publishedAt), timestamp(b.publishedAt), -1);
    } else if (mode === "reliability") {
      const ar = Number.isFinite(a.reliability) ? a.reliability : null;
      const br = Number.isFinite(b.reliability) ? b.reliability : null;
      primary = compareNullableNumber(ar, br, -1);
    } else {
      primary = compareLabel(a, b);
    }
    return primary || stableTieBreak(a, b);
  };
}

export function sortEvidenceDocs(docs: readonly ClaimSourceDoc[], mode: EvidenceSortMode): ClaimSourceDoc[] {
  return [...docs].sort(compareEvidenceDocs(mode));
}

/** Canonical evidence-copy order is not coupled to mutable UI sort state. */
export function canonicalEvidenceDocs(docs: readonly ClaimSourceDoc[]): ClaimSourceDoc[] {
  return sortEvidenceDocs(docs, "oldest_published");
}

export function summarizeClaimEvidence(docs: readonly ClaimSourceDoc[]): ClaimEvidenceSummary {
  let earliestPublishedAt: string | null = null;
  let earliestPublished = Number.POSITIVE_INFINITY;

  for (const doc of docs) {
    const published = timestamp(doc.publishedAt);
    if (published !== null && published < earliestPublished) {
      earliestPublished = published;
      earliestPublishedAt = doc.publishedAt;
    }
  }

  return {
    documents: docs.length,
    channels: new Set(docs.map(claimChannelKey)).size,
    platforms: new Set(
      docs.map((doc) => {
        const visible = evidencePlatform(doc);
        return visible === "other" ? `other:${doc.adapter.trim().toLocaleLowerCase()}` : visible;
      }),
    ).size,
    earliestPublishedAt,
  };
}

// Existing selection ordering: reliability descending, then published ascending.
function compareVisibleDocs(a: ClaimSourceDoc, b: ClaimSourceDoc): number {
  const ar = Number.isFinite(a.reliability) ? a.reliability : null;
  const br = Number.isFinite(b.reliability) ? b.reliability : null;
  return (
    compareNullableNumber(ar, br, -1) ||
    compareNullableNumber(timestamp(a.publishedAt), timestamp(b.publishedAt), 1) ||
    a.docId - b.docId
  );
}

function bestPerChannel(docs: readonly ClaimSourceDoc[]): ClaimSourceDoc[] {
  const best = new Map<string, ClaimSourceDoc>();
  for (const doc of docs) {
    const key = claimChannelKey(doc);
    const current = best.get(key);
    if (!current || compareVisibleDocs(doc, current) < 0) best.set(key, doc);
  }
  return [...best.values()].sort(compareVisibleDocs);
}

/** Preserve the existing <=8/all, >8/six-diverse visible-chip behavior. */
export function selectClaimDocs(
  docs: readonly ClaimSourceDoc[],
  defaultVisible: number = DEFAULT_VISIBLE_CLAIM_DOCS,
): ClaimDocSelection {
  if (docs.length <= COLLAPSE_THRESHOLD) {
    return {
      visible: [...docs].sort(compareVisibleDocs),
      hidden: [],
      collapsed: false,
      hiddenCount: 0,
      hiddenChannels: 0,
      hiddenPlatforms: 0,
    };
  }

  const candidates = bestPerChannel(docs);
  const selected: ClaimSourceDoc[] = [];
  const usedChannels = new Set<string>();
  const platformOrder = [...new Set(candidates.map(diversityPlatformClass))].sort((a, b) => {
    const bestA = candidates.find((doc) => diversityPlatformClass(doc) === a)!;
    const bestB = candidates.find((doc) => diversityPlatformClass(doc) === b)!;
    return compareVisibleDocs(bestA, bestB);
  });

  for (const platform of platformOrder) {
    if (selected.length >= defaultVisible) break;
    const best = candidates.find(
      (doc) => diversityPlatformClass(doc) === platform && !usedChannels.has(claimChannelKey(doc)),
    );
    if (best) {
      selected.push(best);
      usedChannels.add(claimChannelKey(best));
    }
  }

  for (const doc of candidates) {
    if (selected.length >= defaultVisible) break;
    if (usedChannels.has(claimChannelKey(doc))) continue;
    selected.push(doc);
    usedChannels.add(claimChannelKey(doc));
  }

  const selectedIds = new Set(selected.map((doc) => doc.docId));
  const hidden = docs.filter((doc) => !selectedIds.has(doc.docId));
  return {
    visible: selected,
    hidden,
    collapsed: true,
    hiddenCount: hidden.length,
    hiddenChannels: new Set(hidden.map(claimChannelKey)).size,
    hiddenPlatforms: new Set(hidden.map(diversityPlatformClass)).size,
  };
}
