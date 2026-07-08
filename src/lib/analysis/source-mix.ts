// Source-mix selection for the digest analysis batch (OPEN-TASKS #16).
// After the X unlock, x_api docs carried the highest registry reliability and a
// pure reliability sort filled the whole batch with them (RU: 100/100),
// displacing the telegram/RSS docs behind RU's best coverage days. Diversity
// quota: no single adapter or platform may take more than ~40% of the batch —
// unless the corpus lacks enough alternatives, in which case remaining slots
// fill past the cap (coverage beats diversity on thin days).

export interface MixSourceFields {
  adapter: string;
  platform: string | null;
}

/** max share of the batch any single adapter or platform may claim */
export const MIX_CAP_FRACTION = 0.4;

/**
 * Pick up to maxDocs from docs (which MUST already be ordered by descending
 * reliability), capping every adapter and platform at MIX_CAP_FRACTION of
 * maxDocs. Within each adapter/platform bucket the reliability order is
 * preserved. The returned batch is interleaved by within-adapter rank (each
 * adapter's best doc first, then each adapter's second-best, ...) so that any
 * prefix of it — the truncation retry re-sends the first 50/25 docs — keeps
 * roughly the same source mix as the whole batch.
 */
export function selectSourceMix<T extends MixSourceFields>(docs: T[], maxDocs: number): T[] {
  const cap = Math.max(1, Math.ceil(maxDocs * MIX_CAP_FRACTION));
  const adapterCount = new Map<string, number>();
  const platformCount = new Map<string, number>();
  const pickedIdx: number[] = [];
  const deferredIdx: number[] = [];

  for (let i = 0; i < docs.length && pickedIdx.length < maxDocs; i++) {
    const adapter = docs[i].adapter;
    const platform = docs[i].platform ?? "unknown";
    const a = adapterCount.get(adapter) ?? 0;
    const p = platformCount.get(platform) ?? 0;
    if (a < cap && p < cap) {
      adapterCount.set(adapter, a + 1);
      platformCount.set(platform, p + 1);
      pickedIdx.push(i);
    } else {
      deferredIdx.push(i);
    }
  }
  // small or monoculture corpora: fill remaining slots past the cap rather
  // than send a short batch — round-robin across the over-cap adapters so the
  // overflow itself doesn't re-concentrate in the top-reliability one
  for (const i of interleaveByAdapter(deferredIdx, docs)) {
    if (pickedIdx.length >= maxDocs) break;
    pickedIdx.push(i);
  }

  return interleaveByAdapter(pickedIdx, docs).map((i) => docs[i]);
}

/**
 * Order indices by (rank within adapter, global reliability order): each
 * adapter's best doc first, then each adapter's second-best, ... Within an
 * adapter the original (reliability) order is preserved.
 */
function interleaveByAdapter<T extends MixSourceFields>(indices: number[], docs: T[]): number[] {
  const sorted = [...indices].sort((x, y) => x - y); // restore pure reliability order first
  const rankWithinAdapter = new Map<string, number>();
  const decorated = sorted.map((i) => {
    const rank = rankWithinAdapter.get(docs[i].adapter) ?? 0;
    rankWithinAdapter.set(docs[i].adapter, rank + 1);
    return { i, rank };
  });
  decorated.sort((x, y) => x.rank - y.rank || x.i - y.i);
  return decorated.map(({ i }) => i);
}

/** counts by adapter and platform — persisted in digest.structured.stats */
export function sourceMixStats(docs: MixSourceFields[]): {
  byAdapter: Record<string, number>;
  byPlatform: Record<string, number>;
} {
  const byAdapter: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const d of docs) {
    byAdapter[d.adapter] = (byAdapter[d.adapter] ?? 0) + 1;
    const p = d.platform ?? "unknown";
    byPlatform[p] = (byPlatform[p] ?? 0) + 1;
  }
  return { byAdapter, byPlatform };
}
