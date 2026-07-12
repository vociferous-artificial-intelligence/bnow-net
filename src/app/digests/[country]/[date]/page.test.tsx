// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The digest page is an async server component doing rawSql queries directly (no
// drizzle schema) — mocked wholesale so this test never needs DATABASE_URL, same
// pattern as src/app/ask/page.test.tsx. getLocale reaches into next/headers
// (cookies/headers), which has no request context in a bare render — mocked too.

const queryMock = vi.fn();
vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));

vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const DigestPage = (await import("./page")).default;

afterEach(cleanup);
afterEach(() => queryMock.mockReset());

const DIGEST_ROW = {
  id: 1,
  track: "military",
  status: "final",
  provider: "openai:gpt-4o-mini+mapreduce",
  country_name: "Russia",
};

const CLAIM_ROW = {
  digest_id: 1,
  claim_id: 123,
  event_id: 1,
  event_title: "Test event",
  event_type: "strike",
  event_summary: "Test summary",
  text: "Test claim text",
  hedging: "assessed",
  confidence: 0.8,
  doc_id: 1,
  doc_url: "https://example.com/doc",
  doc_title: "Doc title",
  adapter: "rss",
  source_id: 1,
  source_key: "example.com",
  reliability: 0.75,
  source_platform: "independent_media",
  doc_at: "2026-07-11T12:00:00Z",
};

describe("digest claim anchors (W3)", () => {
  it("renders each claim <li> with a stable id and a scroll-margin class clearing the sticky header", async () => {
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW]) // digestRows
      .mockResolvedValueOnce([CLAIM_ROW]) // claim/doc rows
      .mockResolvedValueOnce([]); // entity rows

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    const li = container.querySelector("#c123");
    expect(li).toBeTruthy();
    expect(li?.tagName).toBe("LI");
    expect(li?.className).toMatch(/\bscroll-mt-\d+\b/);
    expect(li?.textContent).toContain("Test claim text");
  });
});
