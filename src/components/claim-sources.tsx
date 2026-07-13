// Shared claim-evidence chip strip. Pure and synchronous (no fetch, no next/headers) so
// it works as a plain server component and renders directly in jsdom tests. Ownership:
// digest page today; signals evidence and any future theater page reuse it (see
// docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md §4).

export interface ClaimSourceDoc {
  docId: number;
  url: string | null;
  sourceId: number | null;
  sourceKey: string | null;
  adapter: string;
  platform: string | null;
  reliability: number | null;
  publishedAt: string | null;
  title: string | null;
}

export interface ClaimDocSelection {
  /** Chips rendered outside any disclosure. */
  visible: ClaimSourceDoc[];
  /** Chips tucked inside the <details>, empty when not collapsed. */
  hidden: ClaimSourceDoc[];
  collapsed: boolean;
  /** Raw doc count inside `hidden` — corroboration volume, duplicates included. */
  hiddenCount: number;
  /** Distinct channel identities inside `hidden`. */
  hiddenChannels: number;
  /** Distinct platform classes inside `hidden`. */
  hiddenPlatforms: number;
}

const DEFAULT_VISIBLE = 6;
const COLLAPSE_THRESHOLD = 8;

// Channel identity: source_id when the doc is registry-linked; the adapter name for
// registry-less docs. Domain is NEVER the key — 95 cited sources share x.com, 53 share
// t.me (docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md §0.4).
function channelKey(doc: ClaimSourceDoc): string {
  return doc.sourceId !== null ? `id:${doc.sourceId}` : `adapter:${doc.adapter}`;
}

// Platform class for round-robin diversity: registry platform, falling back to the
// ingest adapter for registry-less docs (there is no political-alignment field; this is
// the honest, defensible cross-perspective proxy — eval §4).
function platformClass(doc: ClaimSourceDoc): string {
  return doc.platform ?? doc.adapter;
}

// Higher reliability first (null last); ties broken by earliest publishedAt (null
// last) — surfaces the origin report over a later repeat.
function compareDocs(a: ClaimSourceDoc, b: ClaimSourceDoc): number {
  if (a.reliability !== b.reliability) {
    if (a.reliability === null) return 1;
    if (b.reliability === null) return -1;
    return b.reliability - a.reliability;
  }
  if (a.publishedAt !== b.publishedAt) {
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : 0;
  }
  return 0;
}

/** Best (compareDocs-first) doc per channel identity, reliability-desc order. */
function bestPerChannel(docs: ClaimSourceDoc[]): ClaimSourceDoc[] {
  const best = new Map<string, ClaimSourceDoc>();
  for (const d of docs) {
    const key = channelKey(d);
    const cur = best.get(key);
    if (!cur || compareDocs(d, cur) < 0) best.set(key, d);
  }
  return [...best.values()].sort(compareDocs);
}

/**
 * Selection rule (docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md §4, implemented
 * exactly): dedupe by channel identity, platform round-robin first, then fill by
 * reliability, tie-break earliest publishedAt. The collapse threshold reads the RAW
 * `docs.length` (corroboration volume). At or below the threshold EVERY doc renders
 * (no dedup, no <details>): dropping a same-channel repeat there would hide an
 * evidence link with no disclosure to reach it — dedup is only safe above the
 * threshold, where the remainder stays reachable inside the <details>.
 */
export function selectClaimDocs(
  docs: ClaimSourceDoc[],
  defaultVisible: number = DEFAULT_VISIBLE,
): ClaimDocSelection {
  if (docs.length <= COLLAPSE_THRESHOLD) {
    return {
      visible: [...docs].sort(compareDocs),
      hidden: [],
      collapsed: false,
      hiddenCount: 0,
      hiddenChannels: 0,
      hiddenPlatforms: 0,
    };
  }

  const candidates = bestPerChannel(docs);
  const usedChannels = new Set<string>();
  const selected: ClaimSourceDoc[] = [];

  // Platform round-robin: visit platform classes best-reliability-first (their best
  // candidate), take each class's best still-unused-channel doc.
  const platformOrder = [...new Set(candidates.map(platformClass))].sort((a, b) => {
    const bestA = candidates.find((d) => platformClass(d) === a)!;
    const bestB = candidates.find((d) => platformClass(d) === b)!;
    return compareDocs(bestA, bestB);
  });
  for (const p of platformOrder) {
    if (selected.length >= defaultVisible) break;
    const best = candidates.find((d) => platformClass(d) === p && !usedChannels.has(channelKey(d)));
    if (best) {
      selected.push(best);
      usedChannels.add(channelKey(best));
    }
  }

  // Fill remaining slots by reliability desc across still-unused channel identities.
  if (selected.length < defaultVisible) {
    for (const d of candidates) {
      if (selected.length >= defaultVisible) break;
      if (usedChannels.has(channelKey(d))) continue;
      selected.push(d);
      usedChannels.add(channelKey(d));
    }
  }

  const selectedIds = new Set(selected.map((d) => d.docId));
  const hidden = docs.filter((d) => !selectedIds.has(d.docId));

  return {
    visible: selected,
    hidden,
    collapsed: true,
    hiddenCount: hidden.length,
    hiddenChannels: new Set(hidden.map(channelKey)).size,
    hiddenPlatforms: new Set(hidden.map(platformClass)).size,
  };
}

// max-w + truncate: sourceKey is a canonical URL — an unbroken mono string that
// otherwise forces page-level horizontal scroll at mobile widths (390px audit,
// 2026-07-13). The full value stays reachable via the title tooltip + href.
const CHIP_CLASS =
  "inline-flex max-w-[260px] items-baseline rounded border border-gray-300 px-1.5 py-0.5 font-mono text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

function Chip({ doc, showScores }: { doc: ClaimSourceDoc; showScores: boolean }) {
  return (
    <a
      href={doc.url ?? "#"}
      rel="nofollow noopener"
      target="_blank"
      className={CHIP_CLASS}
      title={doc.title ?? undefined}
    >
      <span className="truncate">{doc.sourceKey ?? doc.adapter}</span>
      <span className="shrink-0">
        #{doc.docId}
        {showScores && doc.reliability !== null && ` · ${doc.reliability.toFixed(2)}`}
      </span>
    </a>
  );
}

export interface ClaimSourcesProps {
  docs: ClaimSourceDoc[];
  /** Chips shown before collapsing; the selection algorithm also uses this as its target. */
  defaultVisible?: number;
  /** Public contexts render chips without reliability numbers. */
  showScores: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function ClaimSources({ docs, defaultVisible = DEFAULT_VISIBLE, showScores, t }: ClaimSourcesProps) {
  const { visible, hidden, collapsed, hiddenCount, hiddenChannels, hiddenPlatforms } = selectClaimDocs(
    docs,
    defaultVisible,
  );

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 pl-1">
      {visible.map((d) => (
        <Chip key={d.docId} doc={d} showScores={showScores} />
      ))}
      {collapsed && (
        <details>
          <summary className={`${CHIP_CLASS} cursor-pointer list-none`}>
            {t("sources.more_summary", {
              n: hiddenCount,
              channels: hiddenChannels,
              platforms: hiddenPlatforms,
            })}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.map((d) => (
              <Chip key={d.docId} doc={d} showScores={showScores} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
