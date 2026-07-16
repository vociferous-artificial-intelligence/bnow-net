// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The digest page is an async server component doing rawSql queries directly (no
// drizzle schema) — mocked wholesale so this test never needs DATABASE_URL, same
// pattern as src/app/ask/page.test.tsx. getLocale reaches into next/headers
// (cookies/headers), which has no request context in a bare render — mocked too.

const queryMock = vi.fn();
const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const pageModule = await import("./page");
const DigestPage = pageModule.default;
const { shapeNeighborDates } = pageModule;

afterEach(cleanup);
afterEach(() => {
  queryMock.mockReset();
  captureMock.mockReset();
});

const DIGEST_ROW = {
  id: 1,
  track: "military",
  status: "final",
  provider: "openai:gpt-4o-mini+mapreduce",
  country_name: "Russia",
  created_at: "2026-07-12T02:05:00Z",
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
  source_name: "Example News",
  source_key: "https://example.com",
  source_domain: "example.com",
  reliability: 0.75,
  source_platform: "independent_media",
  published_at: "2026-07-11T12:00:00Z",
  fetched_at: "2026-07-11T13:30:00Z",
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

describe("digest evidence and print handoff", () => {
  it("keeps selecting fetched_at internally while rendering only the publication time", async () => {
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

    const evidenceSql = String(queryMock.mock.calls[1]?.[0]);
    expect(evidenceSql).toContain("rd.published_at::text AS published_at");
    // fetched_at stays selected: it is the ranking recency fallback and the evidence
    // sort tie-break. It is retained, not rendered (2026-07-16).
    expect(evidenceSql).toContain("rd.fetched_at::text AS fetched_at");
    expect(evidenceSql).not.toContain("COALESCE(rd.published_at, rd.fetched_at)::text AS doc_at");
    expect(container.textContent).toContain("Jul 11, 8:00 AM ET"); // published_at
    expect(container.textContent).not.toContain("Jul 11, 9:30 AM ET"); // fetched_at
    expect(container.textContent).not.toMatch(/First seen/i);
  });

  it("server-renders every attached document in the complete evidence appendix", async () => {
    const docs = Array.from({ length: 10 }, (_, index) => ({
      ...CLAIM_ROW,
      doc_id: index + 1,
      doc_url: `https://example.com/doc-${index + 1}`,
      doc_title: `Evidence document ${index + 1}`,
    }));
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce(docs)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    const appendix = container.querySelector('[data-print="appendix"]');
    expect(appendix).toBeTruthy();
    expect(appendix?.querySelectorAll('[data-print="source"]')).toHaveLength(10);
    expect(appendix?.textContent).toContain("Evidence document 10");
    expect(appendix?.textContent).not.toContain("#10");
    expect(appendix?.querySelector('a[target="_blank"][rel="nofollow noopener"]')).toBeTruthy();
  });

  it("prints truthful metadata for each track and uses durable brand URLs", async () => {
    const elite = {
      ...DIGEST_ROW,
      id: 2,
      track: "elite_politics",
      status: "generated",
      created_at: "2026-07-11T19:30:00Z",
    };
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW, elite])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    const metadata = container.querySelector('[data-print="metadata"]');
    expect(metadata?.textContent).toContain("Military situation");
    expect(metadata?.textContent).toContain("Elite politics & prosecutions");
    expect(metadata?.textContent).toContain("Status: final");
    expect(metadata?.textContent).toContain("Status: generated");
    expect(metadata?.textContent).toContain("Stage: final");
    expect(metadata?.textContent).toContain("Stage: intraday");
    expect(metadata?.textContent).toContain("https://bnow.net/digests/ru/2026-07-11");

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const copyLink = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Copy link",
    );
    expect(copyLink).toBeTruthy();
    fireEvent.click(copyLink!);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://bnow.net/digests/ru/2026-07-11#c123");
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  it("marks screen-only navigation, profiles and feedback for print exclusion", async () => {
    const originalFeedback = process.env.FEEDBACK_EMAIL;
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

    expect(container.querySelector('nav[data-print="hide"]')).toBeTruthy();
    expect(container.querySelector('[data-print="hide"] span')?.textContent).not.toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')?.closest('[data-print="hide"]')).toBeTruthy();
    expect(container.querySelector('[data-print="event"]')).toBeTruthy();
    expect(container.querySelector('[data-print="claim"]')).toBeTruthy();
    expect(container.querySelector('[data-print="claim-url"]')?.textContent).toBe(
      "https://bnow.net/digests/ru/2026-07-11#c123",
    );
    expect(container.querySelector('[data-copy-surface="digest"][data-print="hide"]')).toBeTruthy();
    expect(container.querySelector('[data-print="evidence-summary"]')).toBeTruthy();
    expect(container.querySelector('[data-print="evidence-summary"] [data-print="hide"]')).toBeTruthy();
    if (originalFeedback === undefined) delete process.env.FEEDBACK_EMAIL;
    else process.env.FEEDBACK_EMAIL = originalFeedback;
  });
});

describe("analyst-visible pipeline metadata", () => {
  it("renders no provider/model token and no raw confidence decimal, and stops selecting provider", async () => {
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

    // DIGEST_ROW still carries a provider — the page must ignore it rather than depend
    // on the column being absent, and must not ask the database for it either.
    expect(container.textContent).not.toContain("openai:gpt-4o-mini+mapreduce");
    expect(container.textContent).not.toContain("gpt-4o-mini");
    expect(String(queryMock.mock.calls[0]?.[0])).not.toContain("d.provider");
    // CLAIM_ROW confidence is 0.8; neither the label nor the decimal may render.
    expect(container.textContent).not.toContain("conf");
    expect(container.textContent).not.toContain("0.80");
  });
});

describe("summarizeDigestFreshness", () => {
  const { summarizeDigestFreshness } = pageModule;

  it("reports one stage for the page when every track agrees, with the newest write time", () => {
    expect(
      summarizeDigestFreshness(
        [{ created_at: "2026-07-12T02:05:00Z" }, { created_at: "2026-07-12T02:30:00Z" }],
        "2026-07-11",
      ),
    ).toEqual({ uniformStage: "final", lastUpdatedAt: "2026-07-12T02:30:00Z" });
  });

  it("refuses a page-level stage when one track is final and another is still intraday", () => {
    // The whole page must never read Final because its first track finalized.
    expect(
      summarizeDigestFreshness(
        [{ created_at: "2026-07-12T02:05:00Z" }, { created_at: "2026-07-11T19:30:00Z" }],
        "2026-07-11",
      ),
    ).toEqual({ uniformStage: null, lastUpdatedAt: "2026-07-12T02:05:00Z" });
  });

  it("survives an unparseable timestamp without inventing a time", () => {
    expect(summarizeDigestFreshness([{ created_at: "not-a-date" }], "2026-07-11")).toEqual({
      uniformStage: "intraday",
      lastUpdatedAt: null,
    });
  });

  it("claims nothing for an empty page", () => {
    expect(summarizeDigestFreshness([], "2026-07-11")).toEqual({
      uniformStage: null,
      lastUpdatedAt: null,
    });
  });
});

describe("digest freshness rendering", () => {
  it("states stage, clock time and zone once at page level when tracks agree", async () => {
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

    const line = container.querySelector('[data-testid="digest-freshness"]');
    expect(line?.textContent).toBe("final · Updated Jul 11, 10:05 PM ET");
    expect(container.querySelector('[data-testid="track-freshness"]')).toBeNull();
    expect(line?.closest('[data-print="hide"]')).toBeTruthy();
  });

  it("falls back to per-track metadata when the tracks are at different stages", async () => {
    const elite = {
      ...DIGEST_ROW,
      id: 2,
      track: "elite_politics",
      created_at: "2026-07-11T19:30:00Z",
    };
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW, elite])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    expect(container.querySelector('[data-testid="digest-freshness"]')).toBeNull();
    const perTrack = [...container.querySelectorAll('[data-testid="track-freshness"]')].map(
      (node) => node.textContent,
    );
    expect(perTrack).toEqual([
      "final · Updated Jul 11, 10:05 PM ET",
      "intraday · Updated Jul 11, 3:30 PM ET",
    ]);
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
    fireEvent.click(digestLink!);
    expect(captureMock).toHaveBeenCalledWith("feedback_initiated", {
      surface: "digest_error",
      theater: "ru",
    });
    expect(JSON.stringify(captureMock.mock.calls)).not.toContain("ops@example.com");
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
