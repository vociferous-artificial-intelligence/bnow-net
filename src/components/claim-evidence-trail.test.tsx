// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ClaimEvidenceTrail } from "./claim-evidence-trail";
import type { ClaimEvidenceLabels, ClaimSourceDoc } from "./claim-evidence-model";

afterEach(cleanup);

const evidenceLabels: ClaimEvidenceLabels = {
  summary: "{docs} documents · {channels} channels · {platforms} platforms",
  earliestPublished: "Earliest published:", firstSeen: "First seen by BNOW:", unknown: "Unknown",
  viewTrail: "View evidence trail ({n})", sortLabel: "Sort evidence", sortOldest: "Oldest published",
  sortNewest: "Newest published", sortFirstSeen: "First seen by BNOW", sortReliability: "Reliability",
  sortSource: "Source/channel", publishedColumn: "Published", firstSeenColumn: "First seen",
  sourceColumn: "Source", platformColumn: "Platform", reliabilityColumn: "Reliability",
  titleColumn: "Title/link", openSourceDocument: "Open source document",
  platforms: { rss_news: "RSS/news", gdelt: "GDELT", telegram: "Telegram", x: "X", procurement: "Procurement" },
};

function sourceDoc(id: number, overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: id, url: `https://source${id}.example/item`, title: `Title ${id}`, adapter: "rss",
    sourceId: id, sourceName: `Human source ${id}`, sourceKey: `source${id}.example`,
    sourceDomain: `source${id}.example`, platform: "independent_media", reliability: 0.5,
    publishedAt: `2026-07-${String(id).padStart(2, "0")}T12:00:00Z`,
    firstSeenAt: `2026-07-${String(id).padStart(2, "0")}T13:00:00Z`, ...overrides,
  };
}

function rowSources(): string[] {
  const body = document.querySelector("tbody")!;
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[2].textContent ?? "");
}

describe("ClaimEvidenceTrail", () => {
  it("defaults oldest-published with unknown last and locally applies all sort modes", async () => {
    const user = userEvent.setup();
    render(
      <ClaimEvidenceTrail
        locale="en"
        showScores
        labels={evidenceLabels}
        docs={[
          sourceDoc(1, { sourceName: "Zulu", publishedAt: null, firstSeenAt: "2026-07-01T09:00:00Z", reliability: null }),
          sourceDoc(2, { sourceName: "alpha", publishedAt: "2026-07-02T12:00:00Z", firstSeenAt: "2026-07-02T13:00:00Z", reliability: 0.9 }),
          sourceDoc(3, { sourceName: "Bravo", publishedAt: "2026-07-01T12:00:00Z", firstSeenAt: "2026-07-03T13:00:00Z", reliability: 0.4 }),
        ]}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Sort evidence" });
    expect(rowSources()).toEqual(["Bravo", "alpha", "Zulu"]);
    await user.selectOptions(select, "newest_published");
    expect(rowSources()).toEqual(["alpha", "Bravo", "Zulu"]);
    await user.selectOptions(select, "first_seen");
    expect(rowSources()).toEqual(["Zulu", "alpha", "Bravo"]);
    await user.selectOptions(select, "reliability");
    expect(rowSources()).toEqual(["alpha", "Bravo", "Zulu"]);
    await user.selectOptions(select, "source");
    expect(rowSources()).toEqual(["alpha", "Bravo", "Zulu"]);
  });

  it("shows exact UTC metadata and keeps publication unknown beside first-seen", () => {
    render(
      <ClaimEvidenceTrail
        locale="en"
        showScores
        labels={evidenceLabels}
        docs={[sourceDoc(1, { publishedAt: null, firstSeenAt: "2026-07-01T18:00:00Z" })]}
      />,
    );
    expect(screen.getByText("Unknown")).toBeTruthy();
    const time = screen.getByText("Jul 1, 2:00 PM ET");
    expect(time.getAttribute("datetime")).toBe("2026-07-01T18:00:00.000Z");
    expect(time.getAttribute("title")).toBe("2026-07-01T18:00:00.000Z");
  });

  it("omits the reliability column and never makes an unsafe URL clickable", () => {
    render(
      <ClaimEvidenceTrail
        locale="en"
        showScores={false}
        labels={evidenceLabels}
        docs={[sourceDoc(1, { url: "data:text/html,bad", title: null, reliability: 0.99 })]}
      />,
    );
    expect(screen.queryByRole("columnheader", { name: "Reliability" })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Open source document")).toBeTruthy();
    expect(document.body.textContent).not.toContain("0.99");
  });

  it("retains external-link security attributes", () => {
    render(
      <ClaimEvidenceTrail locale="en" showScores labels={evidenceLabels} docs={[sourceDoc(1)]} />,
    );
    const link = screen.getByRole("link", { name: "Title 1" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("nofollow noopener");
  });
});
