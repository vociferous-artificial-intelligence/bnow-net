// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The registry detail page is an async server component issuing rawSql queries directly,
// so the database is mocked wholesale (the digest page test's pattern) and the page never
// needs DATABASE_URL. getT reaches into next/headers, which has no request context here.

const queryMock = vi.fn();
vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));
vi.mock("@/i18n/server", () => ({
  getT: async () => (key: string) => key,
}));

// AGENTS.md ruling 21: the page calls its own gate BEFORE any data access — the /registry
// layout gate is defence in depth only, since a layout gate does not cancel the page task.
// Spied so this suite fails if the call is deleted or reordered. currentRole authorizes
// nothing; it only shapes the moat presentation.
const gateMock = vi.hoisted(() => vi.fn(async () => undefined));
const roleMock = vi.hoisted(() => vi.fn(async () => "admin" as string));
vi.mock("@/lib/gate", () => ({
  requireAdminOr404: gateMock,
  currentRole: roleMock,
}));

const { default: SourceDetailPage } = await import("./page");

afterEach(cleanup);
afterEach(() => {
  queryMock.mockReset();
  gateMock.mockClear();
  roleMock.mockClear();
  roleMock.mockImplementation(async () => "admin");
});

const SOURCE_ROW = {
  id: 42,
  canonical_url: "https://www.pravda.com.ua/news",
  domain: "pravda.com.ua",
  platform: "independent_media",
  name: "Ukrainska Pravda",
  citation_count: 400,
  first_cited_report_date: "2022-03-04",
  last_cited_report_date: "2026-08-14",
  hedging_confirmed: 100,
  hedging_assessed: 80,
  hedging_unknown: 120,
  hedging_claimed: 60,
  hedging_unverified: 40,
  reliability_score: 0.6425,
  decayed: false,
  status: "active",
};

const THEATER_ROW = {
  theater: "ru",
  citation_count: 300,
  first: "2022-03-04",
  last: "2026-08-14",
  reliability_score: 0.64,
  decayed: false,
  hedging_confirmed: 90,
  hedging_assessed: 60,
  hedging_unknown: 90,
  hedging_claimed: 45,
  hedging_unverified: 15,
};

function mockQueries(source: Record<string, unknown> = SOURCE_ROW, theaters: unknown[] = [THEATER_ROW]) {
  queryMock
    .mockResolvedValueOnce([source]) // SELECT * FROM sources
    .mockResolvedValueOnce([{ y: 2026, n: 12 }]) // citations by year
    .mockResolvedValueOnce([]) // recent ISW citations
    .mockResolvedValueOnce([]) // recent ingested documents
    .mockResolvedValueOnce(theaters); // per-theater stats
}

async function renderPage(id = "42") {
  const element = await SourceDetailPage({ params: Promise.resolve({ id }) });
  return render(element);
}

describe("registry detail — WS-7.3 source descriptor", () => {
  it("renders the global descriptor with its generated-not-judged label and version", async () => {
    mockQueries();
    const { getByTestId } = await renderPage();
    const descriptor = getByTestId("source-descriptor").textContent ?? "";
    expect(descriptor).toContain("https://www.pravda.com.ua/news is an independent media outlet.");
    expect(descriptor).toContain("Cited in ISW reporting 400 times between 2022-03-04 and 2026-08-14.");
    expect(descriptor).toContain("30% unknown (an unhedged ISW declarative)");
    expect(descriptor).toContain("held at mid-trust by design");
    expect(descriptor).toContain(
      "Generated from citation data, descriptor template v1 — not an analyst judgment. (descriptor-v1)",
    );
  });

  it("names the reference corpus in the per-theater descriptor", async () => {
    mockQueries();
    const { getByTestId } = await renderPage();
    expect(getByTestId("theater-descriptors").textContent).toContain(
      "Cited in the ISW Russian Offensive Campaign Assessment 300 times",
    );
  });

  it("keeps the reliability number out of every descriptor, in BOTH views", async () => {
    mockQueries();
    const admin = await renderPage();
    const adminDescriptor = admin.getByTestId("source-descriptor").textContent ?? "";
    // the admin header still shows the score — the descriptor still must not
    expect(admin.container.textContent).toContain("0.64");
    expect(adminDescriptor).not.toContain("0.64");
    cleanup();
    queryMock.mockReset();

    roleMock.mockImplementation(async () => "user");
    mockQueries();
    const reduced = await renderPage();
    // the moat gate still withholds the score everywhere for a reduced role, and the
    // descriptor renders in full: its counts and dates are citation volume, not a score
    expect(reduced.container.textContent).not.toContain("0.64");
    expect(reduced.getByTestId("source-descriptor").textContent).toContain(
      "Cited in ISW reporting 400 times",
    );
  });

  it("states no hedging weight constant in the descriptor for either role", async () => {
    for (const role of ["admin", "user"]) {
      roleMock.mockImplementation(async () => role);
      mockQueries();
      const { getByTestId } = await renderPage();
      const descriptor = getByTestId("source-descriptor").textContent ?? "";
      for (const weight of ["1.0", ".75", ".5", ".4", ".15"]) {
        expect(descriptor, `${role}: weight ${weight} leaked into the descriptor`).not.toContain(
          weight,
        );
      }
      cleanup();
      queryMock.mockReset();
    }
  });

  it("renders the #56 platform-root caveat and no profile for a pooled root", async () => {
    mockQueries(
      { ...SOURCE_ROW, canonical_url: "https://facebook.com/", domain: "facebook.com", platform: "other" },
      [],
    );
    const { getByTestId } = await renderPage();
    const descriptor = getByTestId("source-descriptor").textContent ?? "";
    expect(descriptor).toContain("Platform root — not a single publisher.");
    expect(descriptor).not.toContain("% unknown");
    expect(descriptor).not.toContain("Cited in ISW reporting");
  });

  it("renders 'no ISW citation history' for an uncited source", async () => {
    mockQueries(
      {
        ...SOURCE_ROW,
        citation_count: 0,
        first_cited_report_date: null,
        last_cited_report_date: null,
        hedging_confirmed: 0,
        hedging_assessed: 0,
        hedging_unknown: 0,
        hedging_claimed: 0,
        hedging_unverified: 0,
      },
      [],
    );
    const { getByTestId } = await renderPage();
    const descriptor = getByTestId("source-descriptor").textContent ?? "";
    expect(descriptor).toContain("No ISW citation history in this reference corpus.");
    expect(descriptor).not.toContain("0%");
  });
});

describe("page-level authorization gate", () => {
  it("calls requireAdminOr404 before issuing any query", async () => {
    mockQueries();
    await renderPage();
    expect(gateMock).toHaveBeenCalledTimes(1);
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      queryMock.mock.invocationCallOrder[0],
    );
  });

  it("gates before the 404 path too — a malformed id never reaches a query", async () => {
    await expect(renderPage("not-an-id")).rejects.toThrow();
    expect(gateMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
