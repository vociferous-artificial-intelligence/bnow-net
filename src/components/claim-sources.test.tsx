// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClaimSources, selectClaimDocs, type ClaimSourceDoc } from "./claim-sources";

afterEach(cleanup);

// Test-local translator: the dictionary key isn't merged into src/i18n/dictionaries.ts
// yet (that's the supervisor's job), so we assert on the interpolated structure rather
// than on real dictionary prose.
const t = (key: string, vars?: Record<string, string | number>) => {
  if (key === "sources.more_summary" && vars) {
    return `+${vars.n} more · ${vars.channels} channels · ${vars.platforms} platforms`;
  }
  return key;
};

let nextId = 1;
function doc(overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  const docId = overrides.docId ?? nextId++;
  return {
    docId,
    url: `https://example.com/${docId}`,
    sourceId: null,
    sourceKey: `src${docId}`,
    adapter: "rss",
    platform: "rss",
    reliability: 0.5,
    publishedAt: "2026-07-01",
    title: `Title ${docId}`,
    ...overrides,
  };
}

describe("selectClaimDocs", () => {
  it("round-robins the highest-reliability doc per platform first, then fills by reliability", () => {
    // 3 platform classes (x, rss, telegram), 3 docs each — 9 total forces the
    // selection path (> 8 collapse threshold).
    const docs = [
      doc({ docId: 1, sourceId: 1, platform: "rss", reliability: 0.9 }), // rss best
      doc({ docId: 2, sourceId: 2, platform: "rss", reliability: 0.7 }),
      doc({ docId: 7, sourceId: 7, platform: "rss", reliability: 0.8 }),
      doc({ docId: 3, sourceId: 3, platform: "telegram", reliability: 0.85 }), // telegram best
      doc({ docId: 4, sourceId: 4, platform: "telegram", reliability: 0.6 }),
      doc({ docId: 8, sourceId: 8, platform: "telegram", reliability: 0.75 }),
      doc({ docId: 5, sourceId: 5, platform: "x", reliability: 0.95 }), // x best (highest overall)
      doc({ docId: 6, sourceId: 6, platform: "x", reliability: 0.5 }),
      doc({ docId: 9, sourceId: 9, platform: "x", reliability: 0.65 }),
    ];

    const result = selectClaimDocs(docs, 6);

    expect(result.collapsed).toBe(true);
    // Round robin (platform classes visited best-reliability-first: x, rss, telegram)
    // picks docs 5, 1, 3; the 3 remaining slots fill by reliability desc among the
    // still-unused channels: 7 (0.8), 8 (0.75), 2 (0.7).
    expect(result.visible.map((d) => d.docId)).toEqual([5, 1, 3, 7, 8, 2]);
    expect(result.hidden.map((d) => d.docId).sort()).toEqual([4, 6, 9]);
    expect(result.hiddenCount).toBe(3);
    expect(result.hiddenChannels).toBe(3);
    expect(result.hiddenPlatforms).toBe(2); // telegram (4) + x (6, 9)
  });

  it("tie-breaks equal reliability by earliest publishedAt during the fill pass", () => {
    // Single platform class so round-robin contributes only the top doc; the fill
    // pass must pick doc 6 (earlier publishedAt) over doc 7 (later) at the cutoff.
    const docs = [
      doc({ docId: 1, sourceId: 1, reliability: 0.99, publishedAt: "2026-07-05" }),
      doc({ docId: 2, sourceId: 2, reliability: 0.9, publishedAt: "2026-07-05" }),
      doc({ docId: 3, sourceId: 3, reliability: 0.8, publishedAt: "2026-07-05" }),
      doc({ docId: 4, sourceId: 4, reliability: 0.7, publishedAt: "2026-07-05" }),
      doc({ docId: 5, sourceId: 5, reliability: 0.6, publishedAt: "2026-07-05" }),
      doc({ docId: 6, sourceId: 6, reliability: 0.5, publishedAt: "2026-07-03" }), // earlier
      doc({ docId: 7, sourceId: 7, reliability: 0.5, publishedAt: "2026-07-06" }), // later, same score
      doc({ docId: 8, sourceId: 8, reliability: 0.4, publishedAt: "2026-07-05" }),
      doc({ docId: 9, sourceId: 9, reliability: 0.3, publishedAt: "2026-07-05" }),
    ];

    const result = selectClaimDocs(docs, 6);

    expect(result.visible.map((d) => d.docId)).toContain(6);
    expect(result.visible.map((d) => d.docId)).not.toContain(7);
    expect(result.hidden.map((d) => d.docId)).toContain(7);
  });

  it("sorts null reliability last and null publishedAt after non-null on ties", () => {
    const docs = [
      doc({ docId: 1, sourceId: 1, reliability: null, publishedAt: null }),
      doc({ docId: 2, sourceId: 2, reliability: 0.5, publishedAt: null }),
      doc({ docId: 3, sourceId: 3, reliability: 0.5, publishedAt: "2026-07-01" }),
    ];
    const result = selectClaimDocs(docs, 6);
    // Not collapsed (3 <= 8): doc3 (0.5, dated) before doc2 (0.5, no date) before
    // doc1 (no score).
    expect(result.visible.map((d) => d.docId)).toEqual([3, 2, 1]);
  });

  it("shows same-channel repeats when at or under the collapse threshold", () => {
    // <= 8 docs: every doc is an evidence link the user must be able to reach, and
    // there is no <details> to tuck a repeat into — so nothing is deduped away.
    const docs = [
      doc({ docId: 101, sourceId: 1, reliability: 0.5 }),
      doc({ docId: 102, sourceId: 1, reliability: 0.9 }), // same channel, higher score
      doc({ docId: 103, sourceId: 2, reliability: 0.3 }),
    ];
    const result = selectClaimDocs(docs, 6);
    expect(result.visible.map((d) => d.docId)).toEqual([102, 101, 103]);
  });

  it("dedupes same channel identity to the higher-reliability doc when collapsed", () => {
    const docs = [
      doc({ docId: 101, sourceId: 1, reliability: 0.5 }),
      doc({ docId: 102, sourceId: 1, reliability: 0.9 }), // same channel, higher score
      ...Array.from({ length: 7 }, (_, i) =>
        doc({ docId: 200 + i, sourceId: 10 + i, reliability: 0.3 }),
      ),
    ];
    const result = selectClaimDocs(docs, 6);
    expect(result.collapsed).toBe(true);
    // Channel 1's higher-scoring doc is selected; its repeat (101) lands in the
    // hidden remainder rather than a second visible chip.
    expect(result.visible.map((d) => d.docId)).toContain(102);
    expect(result.visible.map((d) => d.docId)).not.toContain(101);
    expect(result.hidden.map((d) => d.docId)).toContain(101);
  });

  it("falls back to adapter as the channel identity when sourceId is null (collapsed)", () => {
    const docs = [
      doc({ docId: 1, sourceId: null, adapter: "gdelt", reliability: 0.4 }),
      doc({ docId: 2, sourceId: null, adapter: "gdelt", reliability: 0.8 }), // same adapter channel
      ...Array.from({ length: 7 }, (_, i) =>
        doc({ docId: 10 + i, sourceId: 20 + i, adapter: "rss", reliability: 0.3 }),
      ),
    ];
    const result = selectClaimDocs(docs, 6);
    expect(result.collapsed).toBe(true);
    // gdelt's best doc represents that channel; its lower-scoring sibling is hidden.
    expect(result.visible.map((d) => d.docId)).toContain(2);
    expect(result.visible.map((d) => d.docId)).not.toContain(1);
    expect(result.hidden.map((d) => d.docId)).toContain(1);
  });

  it("collapses at > 8 raw docs, not at <= 8", () => {
    const eight = Array.from({ length: 8 }, (_, i) => doc({ docId: i + 1, sourceId: i + 1 }));
    expect(selectClaimDocs(eight, 6).collapsed).toBe(false);
    expect(selectClaimDocs(eight, 6).visible).toHaveLength(8);

    const nine = Array.from({ length: 9 }, (_, i) => doc({ docId: i + 1, sourceId: i + 1 }));
    const result = selectClaimDocs(nine, 6);
    expect(result.collapsed).toBe(true);
    expect(result.visible).toHaveLength(6);
    expect(result.hidden).toHaveLength(3);
  });
});

describe("ClaimSources rendering", () => {
  it("renders all docs with no <details> at the 8-doc threshold", () => {
    const docs = Array.from({ length: 8 }, (_, i) => doc({ docId: i + 1, sourceId: i + 1 }));
    const { container } = render(<ClaimSources docs={docs} showScores t={t} />);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("renders 6 chips + a <details> with the remaining 3 above the threshold", () => {
    const docs = Array.from({ length: 9 }, (_, i) =>
      doc({ docId: i + 1, sourceId: i + 1, reliability: 1 - i / 10 }),
    );
    const { container } = render(<ClaimSources docs={docs} showScores t={t} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(9); // 6 visible + 3 inside <details>

    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    // All 9 docs share the same platform/channel-per-doc shape here, so all 3 hidden
    // docs are distinct channels on 1 platform class.
    expect(summary!.textContent).toBe("+3 more · 3 channels · 1 platforms");
  });

  it("omits reliability text from chips when showScores is false", () => {
    const docs = [doc({ docId: 1, sourceId: 1, sourceKey: "example.com", reliability: 0.87 })];
    render(<ClaimSources docs={docs} showScores={false} t={t} />);
    const link = screen.getByRole("link");
    expect(link.textContent).toBe("example.com#1");
    expect(link.textContent).not.toContain("0.87");
  });

  it("shows reliability text on chips when showScores is true", () => {
    const docs = [doc({ docId: 1, sourceId: 1, sourceKey: "example.com", reliability: 0.87 })];
    render(<ClaimSources docs={docs} showScores t={t} />);
    expect(screen.getByRole("link").textContent).toBe("example.com#1 · 0.87");
  });

  it("gives every chip nofollow/noopener + blank-target link attributes", () => {
    const docs = [doc({ docId: 1, sourceId: 1, url: "https://example.com/a" })];
    render(<ClaimSources docs={docs} showScores t={t} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("rel")).toBe("nofollow noopener");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("href")).toBe("https://example.com/a");
  });

  it("falls back to # for a chip with no doc URL", () => {
    const docs = [doc({ docId: 1, sourceId: 1, url: null })];
    render(<ClaimSources docs={docs} showScores t={t} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("#");
  });

  it("exposes the collapsed remainder via accessible <details>/<summary>", () => {
    const docs = Array.from({ length: 9 }, (_, i) => doc({ docId: i + 1, sourceId: i + 1 }));
    const { container } = render(<ClaimSources docs={docs} showScores t={t} />);
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");
    expect(details).not.toBeNull();
    expect(summary).not.toBeNull();
    expect(details!.contains(summary!)).toBe(true);
    expect(summary!.textContent).toContain("more");
    expect(summary!.textContent).toContain("channels");
    expect(summary!.textContent).toContain("platforms");
  });
});

describe("chip width containment (390px audit, 2026-07-13)", () => {
  it("bounds and truncates the sourceKey (an unbroken canonical URL) inside the chip", () => {
    const doc = {
      docId: 42,
      url: "https://example.com/x",
      sourceId: 1,
      sourceKey: "https://www.understandingwar.org/backgrounder/russian-offensive-campaign-assessment-very-long-canonical-url",
      adapter: "rss",
      platform: "web",
      reliability: 0.7,
      publishedAt: null,
      title: null,
    };
    render(<ClaimSources docs={[doc]} showScores={false} t={(k) => k} />);
    const chip = screen.getByRole("link");
    // The chip itself is width-bounded; the key truncates; the #docId stays visible.
    expect(chip.className).toContain("max-w-");
    const keySpan = chip.querySelector("span.truncate");
    expect(keySpan?.textContent).toContain("understandingwar.org");
    expect(chip.textContent).toContain("#42");
  });
});
