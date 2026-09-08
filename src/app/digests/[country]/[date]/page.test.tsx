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

// AGENTS.md ruling 21: the page must call its own gate BEFORE any data access — a
// layout gate does not cancel the page's render, so gating only there leaks the
// serialized page. Spied so this always-run suite fails if the call is ever
// deleted or reordered; the HTTP-level proof lives in
// src/integration/authz-page-gate.itest.ts, which npm test does not run.
const gateMock = vi.hoisted(() => vi.fn(async () => ({ email: "user@example.com" })));
// currentRole authorizes nothing here (it never substitutes for a gate) — the page
// resolves it only to build the T4 citation-disclosure viewer. Mocked as "admin",
// the most privileged value, so the "no provider/model token renders" assertions
// below are the hardest case rather than the easiest.
const roleMock = vi.hoisted(() => vi.fn(async () => "admin" as const));
vi.mock("@/lib/gate", () => ({
  requireAcceptedUser: gateMock,
  currentRole: roleMock,
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
  reduce_dispatch: {
    workload: "reduce",
    provider: "openai",
    model: "gpt-4o-mini",
    reasoningEffort: null,
    registryVersion: "analysis-reg-v1",
    approval: "baseline",
  },
  llm_dispatch: null,
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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]) // neighbor dates
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
  it("renders no provider/model token and no raw confidence decimal", async () => {
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    // The page now SELECTS d.provider and the two dispatch sub-objects, for the
    // citation tool stamp only (WS-7.2). The 2026-07-16 decision to hide which
    // model wrote a digest stands unreversed (T4 rule 6), so the assertion that
    // matters moved from "does not ask the database" to "nothing reaches the
    // page" — including the serialized client payload, not just the text.
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("d.provider");
    for (const token of ["openai:gpt-4o-mini+mapreduce", "gpt-4o-mini", "openai", "analysis-reg-v1", "mapreduce"]) {
      expect(container.textContent, token).not.toContain(token);
      // ClaimCopyActions is a client component: its whole payload is serialized
      // into the page, so a withheld stamp left on it would be readable in
      // view-source. innerHTML is the closer proxy for that than textContent.
      expect(container.innerHTML, token).not.toContain(token);
    }
    // CLAIM_ROW confidence is 0.8; neither the label nor the decimal may render.
    // Narrowed from a bare "conf" substring when WS-7.3 added the source summary, whose
    // ruling-12 sentence legitimately contains "confirmation" and whose descriptors
    // contain "confirmed" — the ISW hedging vocabulary, not the confidence score. The
    // assertion now names what the 2026-07-16 decision actually withheld: the "conf"
    // LABEL beside a claim, and the numeric confidence itself in either rendering.
    expect(container.textContent).not.toMatch(/\bconf\b/);
    expect(container.textContent).not.toContain("confidence");
    expect(container.textContent).not.toContain("0.80");
    expect(container.textContent).not.toContain("0.8");
  });

  it("offers the citation action for a stamped digest and withholds the tool disclosure", async () => {
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

    const button = container.querySelector('[data-copy-mode="citation"]');
    expect(button).toBeTruthy();
    // withheld => the non-conformant label, for an admin viewer (roleMock above)
    expect(button!.textContent).toBe("Copy source citation");
    expect(container.textContent).not.toContain("Copy ICS 206-01 citation");
  });

  it("withholds the citation action entirely for a stub-provider digest (ruling 3)", async () => {
    queryMock
      .mockResolvedValueOnce([{ ...DIGEST_ROW, provider: "stub", reduce_dispatch: null }])
      .mockResolvedValueOnce([CLAIM_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }]);

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);
    expect(container.querySelector('[data-copy-mode="citation"]')).toBeNull();
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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: "2026-07-10", next_date: "2026-07-12" }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

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
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });
});

// AGENTS.md ruling 21 — the page is its own authorization boundary. The /digests
// layout also gates, but a layout redirect does not cancel the page's render, so
// the gate must run HERE and must run before the first query. Deleting
// `await requireAcceptedUser()` from page.tsx fails this test.
describe("page-level authorization gate", () => {
  it("calls requireAcceptedUser before issuing any query", async () => {
    queryMock
      .mockResolvedValueOnce([DIGEST_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
      .mockResolvedValueOnce([]); // WS-7.3 source profiles

    await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({}),
    });

    expect(gateMock).toHaveBeenCalled();
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      queryMock.mock.invocationCallOrder[0],
    );
    // currentRole() shapes presentation only and never substitutes for a gate, so
    // it must stay behind it — a refactor that hoisted the role lookup would be
    // doing a DB read for an unauthenticated caller.
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      roleMock.mock.invocationCallOrder[0],
    );
  });

  it("gates before the 404 path too — a malformed date never reaches a query", async () => {
    await expect(
      DigestPage({
        params: Promise.resolve({ country: "ru", date: "not-a-date" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();

    expect(gateMock).toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------
// WS-7.3 — per-digest source summary statement (ICD 206 mech. 3) and the descriptors
// for the load-bearing sources (ICD 206 mech. 2). This is the CUSTOMER-VISIBLE render
// target: /registry and /registry/[id] are admin-only, so a descriptor rendered only
// there would reach no customer at all (PLAN-WS-7 §3 C3).
// ---------------------------------------------------------------------------------

const SOURCE_PROFILE_ROW = {
  id: 1,
  canonical_url: "https://example.com",
  domain: "example.com",
  platform: "independent_media",
  status: "active",
  decayed: false,
  citation_count: 400,
  first_cited: "2022-03-04",
  last_cited: "2026-08-14",
  hedging_confirmed: 100,
  hedging_assessed: 80,
  hedging_unknown: 120,
  hedging_claimed: 60,
  hedging_unverified: 40,
  t_citation_count: 300,
  t_first_cited: "2022-03-04",
  t_last_cited: "2026-08-14",
  t_hedging_confirmed: 90,
  t_hedging_assessed: 60,
  t_hedging_unknown: 90,
  t_hedging_claimed: 45,
  t_hedging_unverified: 15,
};

/** `structured.stats.sourceMix` exactly as digest.ts:202-206 persists it. */
const RECORDED_SOURCE_MIX = {
  docsRaw: { byAdapter: { rss: 900 }, byPlatform: { independent_media: 900 } },
  trackRows: { byAdapter: { rss: 700 }, byPlatform: { independent_media: 700 } },
  docsAnalyzed: {
    byAdapter: { rss: 40, telegram: 35, x: 25 },
    byPlatform: { independent_media: 40, telegram: 35, x: 25 },
  },
};

function mockDigestQueries({
  digests = [DIGEST_ROW],
  claims = [CLAIM_ROW],
  profiles = [SOURCE_PROFILE_ROW] as unknown[],
}: { digests?: unknown[]; claims?: unknown[]; profiles?: unknown[] } = {}) {
  queryMock
    .mockResolvedValueOnce(digests)
    .mockResolvedValueOnce(claims)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ prev_date: null, next_date: null }])
    .mockResolvedValueOnce(profiles);
}

async function renderDigest(country = "ru") {
  const element = await DigestPage({
    params: Promise.resolve({ country, date: "2026-07-11" }),
    searchParams: Promise.resolve({}),
  });
  return render(element);
}

describe("digest source summary statement (WS-7.3)", () => {
  it("renders the statement, its counts and the generated-not-judged label", async () => {
    mockDigestQueries();
    const { getByTestId } = await renderDigest();
    const summary = getByTestId("digest-source-summary").textContent ?? "";
    expect(summary).toContain("Sources for this digest");
    expect(summary).toContain(
      "This digest publishes 1 claim resting on 1 distinct document from 1 channel across 1 platform.",
    );
    expect(summary).toContain("The source supporting the most claims is Example News (1 claim).");
    expect(summary).toContain(
      "Generated from citation data, summary template v1 — not an analyst judgment. (summary-v1)",
    );
  });

  it("says the cap is not recorded when the digest persisted no source mix, and infers nothing", async () => {
    // DIGEST_ROW carries no source_mix — the shape of every mapreduce digest, which is
    // 6 of the 11 digests a day. The 40% figure must NOT appear: it would be a fabricated
    // provenance claim derived from the published rows rather than from the analysis batch.
    mockDigestQueries();
    const { getByTestId } = await renderDigest();
    const summary = getByTestId("digest-source-summary").textContent ?? "";
    expect(summary).toContain(
      "Source-mix figures were not recorded for this digest, so the platform and adapter cap cannot be reported for it.",
    );
    expect(summary).not.toContain("40%");
    expect(summary).not.toContain("analysis batch");
  });

  it("reports the cap fact from the digest's own persisted record when it has one", async () => {
    mockDigestQueries({ digests: [{ ...DIGEST_ROW, source_mix: RECORDED_SOURCE_MIX }] });
    const { getByTestId } = await renderDigest();
    const summary = getByTestId("digest-source-summary").textContent ?? "";
    // 100 documents is the RECORDED analysis batch, not the single rendered document
    expect(summary).toContain(
      "The analysis batch behind this digest was capped at 40% per platform and per adapter; of the 100 documents it contained,",
    );
    expect(summary).toContain("the largest platform share was 40% (independent_media)");
    expect(summary).toContain(
      "Whether that cap held a document back or dropped one from the batch is not recorded.",
    );
  });

  it("does not change with the reader's ranking profile", async () => {
    // The summary is a provenance statement about the digest, not about what this reader
    // sees first — so it is built from the digest's events, never from the ranked order.
    const claims = [
      CLAIM_ROW,
      { ...CLAIM_ROW, claim_id: 124, event_id: 2, event_title: "Second", doc_id: 2 },
    ];
    mockDigestQueries({ claims });
    const balanced = await renderDigest();
    const balancedText = balanced.getByTestId("digest-source-summary").textContent;
    cleanup();
    queryMock.mockReset();

    mockDigestQueries({ claims });
    const element = await DigestPage({
      params: Promise.resolve({ country: "ru", date: "2026-07-11" }),
      searchParams: Promise.resolve({ profile: "sanctions" }),
    });
    const { getByTestId } = render(element);
    expect(getByTestId("digest-source-summary").textContent).toBe(balancedText);
  });

  it("selects the persisted mix from the digest row rather than recomputing it", async () => {
    mockDigestQueries();
    await renderDigest();
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("sourceMix");
  });
});

describe("digest load-bearing source descriptors (WS-7.3)", () => {
  it("renders a descriptor per load-bearing source, scoped to this country's reference corpus", async () => {
    mockDigestQueries();
    const { getByTestId } = await renderDigest("ru");
    const descriptors = getByTestId("load-bearing-descriptors").textContent ?? "";
    expect(descriptors).toContain("Example News");
    expect(descriptors).toContain(
      "Cited in the ISW Russian Offensive Campaign Assessment 300 times between 2022-03-04 and 2026-08-14.",
    );
    expect(descriptors).toContain("held at mid-trust by design");
    // the per-corpus row is used, so the global 400 must not be the figure shown
    expect(descriptors).not.toContain("400 times");
  });

  it("asks for the corpus this country validates against — ua reads the ROCA corpus", async () => {
    mockDigestQueries();
    await renderDigest("ua");
    expect(queryMock.mock.calls[4]?.[1]).toEqual([[1], "ru"]);
  });

  it("falls back to the global profile for a theater with no reference corpus", async () => {
    // The Gulf lenses have no daily ISW reference (referenceFor returns null), so the
    // theater parameter is null, the join matches nothing, and the descriptor reports the
    // global aggregate under a global label rather than an empty per-corpus profile.
    mockDigestQueries({
      profiles: [
        {
          ...SOURCE_PROFILE_ROW,
          t_citation_count: null,
          t_first_cited: null,
          t_last_cited: null,
          t_hedging_confirmed: null,
          t_hedging_assessed: null,
          t_hedging_unknown: null,
          t_hedging_claimed: null,
          t_hedging_unverified: null,
        },
      ],
    });
    const { getByTestId } = await renderDigest("sa");
    expect(queryMock.mock.calls[4]?.[1]).toEqual([[1], null]);
    expect(getByTestId("load-bearing-descriptors").textContent).toContain(
      "Cited in ISW reporting 400 times",
    );
  });

  it("omits the descriptor list when no cited source has a registry row, keeping the summary", async () => {
    mockDigestQueries({
      claims: [{ ...CLAIM_ROW, source_id: null, source_name: null, source_key: null }],
      profiles: [],
    });
    const { getByTestId, queryByTestId } = await renderDigest();
    expect(queryByTestId("load-bearing-descriptors")).toBeNull();
    expect(getByTestId("digest-source-summary").textContent).toContain("This digest publishes 1 claim");
  });

  it("renders no reliability score anywhere in the summary section", async () => {
    mockDigestQueries();
    const { getByTestId } = await renderDigest();
    // CLAIM_ROW reliability is 0.75 and renders on the evidence chip; the summary block
    // is score-free by construction (describeSource takes no reliability parameter).
    expect(getByTestId("digest-source-summary").textContent).not.toContain("0.75");
  });

  it("carries no document title, no document body and no claim prose (ruling 1)", async () => {
    const SENTINEL = "ZZQSENTINELPROSEZZQ";
    mockDigestQueries({
      claims: [
        {
          ...CLAIM_ROW,
          text: `Russian forces ${SENTINEL} advanced`,
          doc_title: `${SENTINEL} headline`,
          event_summary: `${SENTINEL} event summary`,
        },
      ],
    });
    const { getByTestId, container } = await renderDigest();
    // the sentinel IS on the page (the claim and its evidence trail render it) — what this
    // pins is that none of it reaches the generated provenance block
    expect(container.textContent).toContain(SENTINEL);
    expect(getByTestId("digest-source-summary").textContent).not.toContain(SENTINEL);
  });
});
