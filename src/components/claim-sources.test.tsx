// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClaimSources, type ClaimEvidenceLabels, type ClaimSourceDoc } from "./claim-sources";

afterEach(cleanup);

export const evidenceLabels: ClaimEvidenceLabels = {
  summary: "{docs} documents · {channels} channels · {platforms} platforms",
  earliestPublished: "Earliest published:",
  firstSeen: "First seen by BNOW:",
  unknown: "Unknown",
  viewTrail: "View evidence trail ({n})",
  sortLabel: "Sort evidence",
  sortOldest: "Oldest published",
  sortNewest: "Newest published",
  sortFirstSeen: "First seen by BNOW",
  sortReliability: "Reliability",
  sortSource: "Source/channel",
  publishedColumn: "Published",
  firstSeenColumn: "First seen",
  sourceColumn: "Source",
  platformColumn: "Platform",
  reliabilityColumn: "Reliability",
  titleColumn: "Title/link",
  openSourceDocument: "Open source document",
  platforms: { rss_news: "RSS/news", gdelt: "GDELT", telegram: "Telegram", x: "X", procurement: "Procurement" },
};

export function sourceDoc(id: number, overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: id,
    url: `https://source${id}.example/item`,
    title: `Title ${id}`,
    adapter: "rss",
    sourceId: id,
    sourceName: `Human source ${id}`,
    sourceKey: `source${id}.example`,
    sourceDomain: `source${id}.example`,
    platform: "independent_media",
    reliability: 0.5,
    publishedAt: `2026-07-${String(id).padStart(2, "0")}T12:00:00Z`,
    firstSeenAt: `2026-07-${String(id).padStart(2, "0")}T13:00:00Z`,
    ...overrides,
  };
}

describe("ClaimSources", () => {
  it("renders full-set summary, human chips, and a complete one-document trail", () => {
    render(
      <ClaimSources docs={[sourceDoc(1)]} showScores locale="en" labels={evidenceLabels} />,
    );
    expect(screen.getByText("1 documents · 1 channels · 1 platforms")).toBeTruthy();
    expect(screen.getAllByText("Human source 1")).toHaveLength(2); // selected chip + complete trail
    expect(screen.queryByText("#1")).toBeNull();
    expect(screen.getByText("View evidence trail (1)")).toBeTruthy();
  });

  it("shows six selected chips but all nine documents inside the complete trail", () => {
    const docs = Array.from({ length: 9 }, (_, index) => sourceDoc(index + 1));
    const { container } = render(
      <ClaimSources docs={docs} showScores locale="en" labels={evidenceLabels} />,
    );
    expect(container.querySelectorAll('[data-print="selected-evidence"] > a')).toHaveLength(6);
    expect(within(container.querySelector("tbody")!).getAllByRole("row")).toHaveLength(9);
    expect(screen.getByText("9 documents · 9 channels · 1 platforms")).toBeTruthy();
  });

  it("does not render raw document ids and omits reliability under reduced policy", () => {
    render(
      <ClaimSources
        docs={[sourceDoc(734, { reliability: 0.91 })]}
        showScores={false}
        locale="en"
        labels={evidenceLabels}
      />,
    );
    expect(document.body.textContent).not.toContain("#734");
    expect(document.body.textContent).not.toContain("0.91");
    expect(screen.queryByRole("columnheader", { name: "Reliability" })).toBeNull();
  });

  it("uses only safe HTTP(S) external anchors and leaves missing/unsafe URLs inert", () => {
    const docs = [
      sourceDoc(1, { url: "https://safe.example/item" }),
      sourceDoc(2, { url: null }),
      sourceDoc(3, { url: "javascript:alert(1)" }),
    ];
    render(<ClaimSources docs={docs} showScores locale="en" labels={evidenceLabels} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2); // selected safe chip + safe trail title
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("https://safe.example/item");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("nofollow noopener");
    }
    expect(document.querySelector('a[href="#"]')).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("renders provider publication as Unknown without borrowing first-seen time", () => {
    render(
      <ClaimSources
        docs={[sourceDoc(1, { publishedAt: null, firstSeenAt: "2026-07-01T18:00:00Z" })]}
        showScores
        locale="en"
        labels={evidenceLabels}
      />,
    );
    expect(screen.getAllByText("Unknown")).toHaveLength(2); // summary + table publication
    expect(screen.getAllByText(/Jul 1, 2:00 PM ET/)).toHaveLength(2); // summary + first-seen cell
  });

  it("contains long names and tables without page-level overflow primitives", () => {
    const { container } = render(
      <ClaimSources
        docs={[sourceDoc(1, { sourceName: "Very long source name ".repeat(20) })]}
        showScores
        locale="en"
        labels={evidenceLabels}
      />,
    );
    expect(container.querySelector(".max-w-full.overflow-x-auto")).toBeTruthy();
    expect(container.querySelector(".max-w-\\[260px\\] .truncate")).toBeTruthy();
  });
});
