import { describe, expect, it } from "vitest";
import {
  canonicalEvidenceDocs,
  claimChannelKey,
  claimSourceLabel,
  evidencePlatform,
  safeHttpUrl,
  selectClaimDocs,
  sortEvidenceDocs,
  summarizeClaimEvidence,
  type ClaimSourceDoc,
  type EvidenceSortMode,
} from "./claim-evidence-model";

function doc(id: number, overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: id,
    url: `https://news${id}.example/item`,
    title: `Title ${id}`,
    adapter: "rss",
    sourceId: id,
    sourceName: `Source ${id}`,
    sourceKey: `news${id}.example`,
    sourceDomain: `news${id}.example`,
    platform: "independent_media",
    reliability: 0.5,
    publishedAt: `2026-07-${String(id).padStart(2, "0")}T12:00:00Z`,
    firstSeenAt: `2026-07-${String(id).padStart(2, "0")}T13:00:00Z`,
    ...overrides,
  };
}

describe("claim evidence identity and summaries", () => {
  it("uses human label fallback order and HTTP(S)-only links", () => {
    expect(claimSourceLabel(doc(1, { sourceName: "Named", sourceKey: "canonical" }))).toBe("Named");
    expect(claimSourceLabel(doc(1, { sourceName: null, sourceKey: "x.com/channel" }))).toBe("x.com/channel");
    expect(claimSourceLabel(doc(1, { sourceName: null, sourceKey: null, url: "https://host.test/x" }))).toBe("host.test");
    expect(claimSourceLabel(doc(1, { sourceName: null, sourceKey: null, url: "javascript:alert(1)", adapter: "rss" }))).toBe("rss");
    expect(safeHttpUrl("https://safe.test/x")).toBe("https://safe.test/x");
    expect(safeHttpUrl("http://safe.test/x")).toBe("http://safe.test/x");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,bad")).toBeNull();
  });

  it("keeps registry-less channels distinct by source key/domain/hostname", () => {
    const a = doc(1, { sourceId: null, sourceKey: null, sourceDomain: null, url: "https://a.example/x" });
    const b = doc(2, { sourceId: null, sourceKey: null, sourceDomain: null, url: "https://b.example/x" });
    expect(claimChannelKey(a)).not.toBe(claimChannelKey(b));
    expect(summarizeClaimEvidence([a, b]).channels).toBe(2);
  });

  it("counts one registry-less identity once across multiple ingest adapters", () => {
    const web = doc(1, {
      sourceId: null,
      sourceKey: "t.me/example",
      adapter: "telegram_web",
    });
    const mtproto = doc(2, {
      sourceId: null,
      sourceKey: "t.me/example",
      adapter: "telegram_mtproto",
    });
    expect(claimChannelKey(web)).toBe(claimChannelKey(mtproto));
    expect(summarizeClaimEvidence([web, mtproto]).channels).toBe(1);
  });

  it("derives display transport from adapter, not registry source class", () => {
    expect(evidencePlatform(doc(1, { adapter: "rss", platform: "state_media" }))).toBe("rss_news");
    expect(evidencePlatform(doc(1, { adapter: "telegram_mtproto", platform: "gov" }))).toBe("telegram");
    expect(evidencePlatform(doc(1, { adapter: "x_api", platform: "independent_media" }))).toBe("x");
  });

  it("counts every edge and summarizes publication without any first-seen field", () => {
    const summary = summarizeClaimEvidence([
      doc(1, { sourceId: 1, publishedAt: null, firstSeenAt: "2026-07-01T09:00:00Z" }),
      doc(2, { sourceId: 1, publishedAt: "2026-07-01T08:00:00Z", firstSeenAt: "2026-07-01T10:00:00Z" }),
      doc(3, { sourceId: 3, adapter: "x_api", publishedAt: "bad", firstSeenAt: "bad" }),
    ]);
    // toEqual is exact: an earliestFirstSeenAt key reappearing here fails the test.
    // Doc 1 has no publication date and its 09:00 fetch time must not stand in for one.
    expect(summary).toEqual({
      documents: 3,
      channels: 2,
      platforms: 2,
      earliestPublishedAt: "2026-07-01T08:00:00Z",
    });
  });
});

describe("evidence sorting", () => {
  const docs = [
    doc(1, { sourceName: "Zulu", publishedAt: null, firstSeenAt: "2026-07-01T12:00:00Z", reliability: null }),
    doc(2, { sourceName: "alpha", publishedAt: "2026-07-02T12:00:00Z", firstSeenAt: "2026-07-02T13:00:00Z", reliability: 0.9 }),
    doc(3, { sourceName: "Bravo", publishedAt: "2026-07-01T12:00:00Z", firstSeenAt: "2026-07-03T13:00:00Z", reliability: 0.4 }),
  ];

  // No first_seen mode since 2026-07-16 — First-seen is not analyst-visible, so it is
  // not sortable either. firstSeenAt still orders ties (see the tie-break test below).
  const expected: Record<EvidenceSortMode, number[]> = {
    oldest_published: [3, 2, 1],
    newest_published: [2, 3, 1],
    reliability: [2, 3, 1],
    source: [2, 3, 1],
  };

  for (const mode of Object.keys(expected) as EvidenceSortMode[]) {
    it(`sorts ${mode} deterministically without mutating input`, () => {
      const before = docs.map((item) => item.docId);
      expect(sortEvidenceDocs(docs, mode).map((item) => item.docId)).toEqual(expected[mode]);
      expect(docs.map((item) => item.docId)).toEqual(before);
    });
  }

  it("uses oldest-published order as the immutable copy order", () => {
    expect(canonicalEvidenceDocs(docs).map((item) => item.docId)).toEqual([3, 2, 1]);
  });
});

describe("visible diversity selection", () => {
  it("shows all eight but only six diverse chips for nine documents", () => {
    const eight = Array.from({ length: 8 }, (_, index) => doc(index + 1));
    expect(selectClaimDocs(eight).visible).toHaveLength(8);
    expect(selectClaimDocs(eight).collapsed).toBe(false);

    const nine = [...eight, doc(9)];
    expect(selectClaimDocs(nine).visible).toHaveLength(6);
    expect(selectClaimDocs(nine).hidden).toHaveLength(3);
  });

  it("deduplicates visible same-channel repeats only above the threshold", () => {
    const docs = [
      doc(1, { sourceId: 10, reliability: 0.2 }),
      doc(2, { sourceId: 10, reliability: 0.9 }),
      ...Array.from({ length: 7 }, (_, index) => doc(index + 3, { sourceId: index + 20 })),
    ];
    const selection = selectClaimDocs(docs);
    expect(selection.visible.map((item) => item.docId)).toContain(2);
    expect(selection.visible.map((item) => item.docId)).not.toContain(1);
    expect(selection.hidden.map((item) => item.docId)).toContain(1);
  });
});
