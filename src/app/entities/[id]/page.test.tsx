// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const EntityDetailPage = (await import("./page")).default;

afterEach(() => {
  cleanup();
  queryMock.mockReset();
});

const ENTITY = { id: 7, name: "Example Person", kind: "person", meta: {} };
const CLAIM = {
  id: 42,
  text: "Example traceable claim",
  hedging: "confirmed",
  claim_type: "fact",
  d: "2026-07-12",
  role: "subject",
  iso2: "ru",
  country_name: "Russia",
  track: "military",
  digest_date: "2026-07-13",
};
const EVIDENCE = {
  claim_id: 42,
  doc_id: 9,
  doc_url: "https://example.com/report",
  doc_title: "Example report",
  adapter: "rss",
  published_at: null,
  fetched_at: "2026-07-13T14:15:00Z",
  source_id: 3,
  source_name: "Example News",
  source_key: "example.com",
  source_domain: "example.com",
  reliability: "0.8",
  source_platform: "independent_media",
};

describe("entity timeline evidence", () => {
  it("bulk-loads evidence once and deep-links with the owning digest date", async () => {
    queryMock
      .mockResolvedValueOnce([ENTITY])
      .mockResolvedValueOnce([CLAIM])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([EVIDENCE]);

    const element = await EntityDetailPage({ params: Promise.resolve({ id: "7" }) });
    render(element);

    expect(screen.getByText("Example traceable claim")).toBeTruthy();
    expect(screen.getAllByText("Example News")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Copy for report" })).toBeTruthy();
    expect(screen.getByText("Earliest published").parentElement?.textContent).toContain("Unknown");
    const digest = screen.getByRole("link", { name: "digest →" });
    expect(digest.getAttribute("href")).toBe("/digests/ru/2026-07-13#c42");
    expect(screen.getByRole("link", { name: /Search all claims/ }).getAttribute("href")).toBe(
      "/search?q=Example%20Person",
    );

    const evidenceCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("WHERE cs.claim_id = ANY"),
    );
    expect(evidenceCall?.[1]).toEqual([[42]]);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("does not issue an evidence query when the capped timeline is empty", async () => {
    queryMock
      .mockResolvedValueOnce([ENTITY])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const element = await EntityDetailPage({ params: Promise.resolve({ id: "7" }) });
    render(element);

    expect(screen.getByText("No claims recorded.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy for report" })).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("WHERE cs.claim_id = ANY"))).toBe(false);
  });
});
