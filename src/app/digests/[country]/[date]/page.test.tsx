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

const pageModule = await import("./page");
const DigestPage = pageModule.default;
const { shapeNeighborDates } = pageModule;

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
      .mockResolvedValueOnce([]) // entity rows
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]); // neighbor dates

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

describe("shapeNeighborDates", () => {
  it("normalizes present prev/next dates to YYYY-MM-DD", () => {
    expect(
      shapeNeighborDates({ prev_date: "2026-07-10T00:00:00.000Z", next_date: "2026-07-12" }),
    ).toEqual({ prev: "2026-07-10", next: "2026-07-12" });
  });

  it("maps null neighbors to null", () => {
    expect(shapeNeighborDates({ prev_date: null, next_date: null })).toEqual({
      prev: null,
      next: null,
    });
  });

  it("treats a missing row as no neighbors", () => {
    expect(shapeNeighborDates(undefined)).toEqual({ prev: null, next: null });
  });
});

describe("digest date navigation", () => {
  it("renders prev/next links to neighbor digests plus an always-present archive link", async () => {
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: "2026-07-10", next_date: "2026-07-12" }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    const nav = container.querySelector("nav");
    expect(nav?.querySelector('a[href="/digests/ru/2026-07-10"]')).toBeTruthy();
    expect(nav?.querySelector('a[href="/digests/ru/2026-07-12"]')).toBeTruthy();
    expect(nav?.querySelector('a[href="/digests/ru"]')).toBeTruthy();
  });

  it("omits prev/next anchors when no neighbor digest exists in that direction", async () => {
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    const nav = container.querySelector("nav");
    expect(nav?.querySelectorAll("a").length).toBe(1);
    expect(nav?.querySelector('a[href="/digests/ru"]')).toBeTruthy();
  });
});

// R5 (2026-07-12): the "suggest or flag a source" mailto moved here from the
// (now admin-only) registry detail page, alongside the pre-existing
// "flag an error in this digest" mailto. Both follow the same feedbackMailto
// env-driven pattern (src/lib/feedback.ts): present when FEEDBACK_EMAIL is
// set, hidden entirely when it isn't.
describe("digest page feedback mailtos", () => {
  const ORIGINAL = process.env.FEEDBACK_EMAIL;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FEEDBACK_EMAIL;
    else process.env.FEEDBACK_EMAIL = ORIGINAL;
  });

  it("renders both the flag-digest and suggest-a-source mailtos when FEEDBACK_EMAIL is set", async () => {
    process.env.FEEDBACK_EMAIL = "ops@example.com";
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    const digestLink = container.querySelector('a[href^="mailto:ops@example.com?subject=%5BBNOW%20digest%5D"]');
    const sourceLink = container.querySelector('a[href^="mailto:ops@example.com?subject=%5BBNOW%20source%5D"]');
    expect(digestLink).toBeTruthy();
    expect(sourceLink).toBeTruthy();
    expect(sourceLink?.getAttribute("href")).toBe(
      "mailto:ops@example.com?subject=%5BBNOW%20source%5D%20suggestion",
    );
    expect(digestLink?.textContent).toBe("Flag an error in this digest");
    expect(sourceLink?.textContent).toBe("Suggest or flag a source");
  });

  it("hides both mailtos when FEEDBACK_EMAIL is unset", async () => {
    delete process.env.FEEDBACK_EMAIL;
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });
});
