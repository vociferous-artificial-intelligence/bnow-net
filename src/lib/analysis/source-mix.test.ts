import { describe, expect, it } from "vitest";
import { MIX_CAP_FRACTION, selectSourceMix, sourceMixStats } from "./source-mix";

interface Doc {
  id: number;
  adapter: string;
  platform: string | null;
  reliability: number;
}

// build a reliability-DESC-ordered corpus the way the digest query returns it
function corpus(specs: Array<{ adapter: string; platform: string | null; n: number; rel: number }>): Doc[] {
  let id = 0;
  const docs: Doc[] = [];
  for (const s of specs)
    for (let k = 0; k < s.n; k++)
      docs.push({ id: id++, adapter: s.adapter, platform: s.platform, reliability: s.rel - k * 1e-4 });
  return docs.sort((a, b) => b.reliability - a.reliability);
}

describe("selectSourceMix", () => {
  // the OPEN-TASKS #16 scenario: x_api outscores everything on reliability and,
  // without the quota, fills the batch 100/100
  const monocultureRisk = corpus([
    { adapter: "x_api", platform: "x", n: 150, rel: 0.9 },
    { adapter: "rss", platform: "state_media", n: 30, rel: 0.6 },
    { adapter: "telegram_web", platform: "telegram", n: 20, rel: 0.5 },
    { adapter: "gdelt", platform: "other", n: 10, rel: 0.4 },
  ]);

  it("caps the top-reliability adapter and lets RSS/Telegram/GDELT into the batch", () => {
    const batch = selectSourceMix(monocultureRisk, 100);
    expect(batch).toHaveLength(100);
    const { byAdapter } = sourceMixStats(batch);
    expect(byAdapter.x_api).toBe(Math.ceil(100 * MIX_CAP_FRACTION)); // 40, not 100
    expect(byAdapter.rss).toBe(30);
    expect(byAdapter.telegram_web).toBe(20);
    expect(byAdapter.gdelt).toBe(10);
  });

  it("keeps any prefix mixed so truncation retries (50/25 docs) hold the quota", () => {
    const batch = selectSourceMix(monocultureRisk, 100);
    for (const size of [50, 25]) {
      const { byAdapter } = sourceMixStats(batch.slice(0, size));
      expect(byAdapter.x_api).toBeLessThanOrEqual(Math.ceil(size * MIX_CAP_FRACTION) + 1);
      expect(Object.keys(byAdapter).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("preserves reliability order within each adapter bucket", () => {
    const batch = selectSourceMix(monocultureRisk, 100);
    const seen = new Map<string, number>();
    for (const d of batch) {
      const prev = seen.get(d.adapter);
      if (prev !== undefined) expect(d.reliability).toBeLessThanOrEqual(prev);
      seen.set(d.adapter, d.reliability);
    }
  });

  it("caps at the platform level too (two adapters sharing one platform)", () => {
    const docs = corpus([
      { adapter: "x_api", platform: "x", n: 60, rel: 0.9 },
      { adapter: "x_backfill", platform: "x", n: 60, rel: 0.8 },
      { adapter: "rss", platform: "state_media", n: 60, rel: 0.6 },
      { adapter: "gdelt", platform: "other", n: 60, rel: 0.4 },
    ]);
    const { byPlatform } = sourceMixStats(selectSourceMix(docs, 100));
    expect(byPlatform.x).toBe(40); // x_api + x_backfill together, not 80
  });

  it("splits over-cap fill across adapters instead of re-concentrating (ir 2026-07-07 shape)", () => {
    // real shape of the ir 2026-07-07 canonical corpus: caps alone yield 91
    // docs, so 9 slots overflow — the fill must not hand them all to x_api
    const docs = corpus([
      { adapter: "x_api", platform: "x", n: 64, rel: 0.9 },
      { adapter: "rss", platform: "other", n: 86, rel: 0.6 },
      { adapter: "telegram_web", platform: "telegram", n: 11, rel: 0.5 },
    ]);
    const { byAdapter } = sourceMixStats(selectSourceMix(docs, 100));
    expect(byAdapter).toEqual({ x_api: 45, rss: 44, telegram_web: 11 });
  });

  it("fills the batch past the cap when the corpus lacks alternatives", () => {
    const thin = corpus([
      { adapter: "x_api", platform: "x", n: 80, rel: 0.9 },
      { adapter: "rss", platform: "state_media", n: 10, rel: 0.6 },
    ]);
    const batch = selectSourceMix(thin, 100);
    expect(batch).toHaveLength(90); // everything available is used
    const { byAdapter } = sourceMixStats(batch);
    expect(byAdapter.x_api).toBe(80); // over the 40-cap because nothing else exists
    expect(byAdapter.rss).toBe(10);
  });

  it("returns small corpora in full", () => {
    const small = corpus([{ adapter: "x_api", platform: "x", n: 7, rel: 0.9 }]);
    expect(selectSourceMix(small, 100)).toHaveLength(7);
  });

  it("buckets null platform as unknown without crashing", () => {
    const docs = corpus([
      { adapter: "x_api", platform: null, n: 50, rel: 0.9 },
      { adapter: "rss", platform: null, n: 50, rel: 0.6 },
    ]);
    const batch = selectSourceMix(docs, 100);
    const { byAdapter, byPlatform } = sourceMixStats(batch);
    // both adapters land under the adapter cap, but the shared "unknown"
    // platform caps at 40 before the fill tops the batch back up
    expect(byAdapter.x_api + byAdapter.rss).toBe(100);
    expect(byPlatform.unknown).toBe(100);
  });
});

describe("selectSourceMix capFraction override", () => {
  it("capFraction >= 1 disables the quota: pure reliability-order prefix", () => {
    const batch = selectSourceMix(monocultureRiskDocs(), 100, 1);
    expect(sourceMixStats(batch).byAdapter).toEqual({ x_api: 100 }); // old behavior
    for (let i = 1; i < batch.length; i++)
      expect(batch[i].reliability).toBeLessThanOrEqual(batch[i - 1].reliability);
  });
});

function monocultureRiskDocs(): Doc[] {
  return corpus([
    { adapter: "x_api", platform: "x", n: 150, rel: 0.9 },
    { adapter: "rss", platform: "state_media", n: 30, rel: 0.6 },
    { adapter: "telegram_web", platform: "telegram", n: 20, rel: 0.5 },
    { adapter: "gdelt", platform: "other", n: 10, rel: 0.4 },
  ]);
}

describe("sourceMixStats", () => {
  it("counts by adapter and platform", () => {
    const stats = sourceMixStats([
      { adapter: "rss", platform: "state_media" },
      { adapter: "rss", platform: "independent_media" },
      { adapter: "x_api", platform: null },
    ]);
    expect(stats.byAdapter).toEqual({ rss: 2, x_api: 1 });
    expect(stats.byPlatform).toEqual({ state_media: 1, independent_media: 1, unknown: 1 });
  });
});
