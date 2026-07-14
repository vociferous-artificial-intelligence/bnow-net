// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

// Money test: /search's ONLY DB-touching dependency should be the $0 deterministic
// lexical.ts arm. Every module that sits on the paid ASK path is mocked to THROW
// the instant it's called — then the page is executed for real (a real ?q=,
// against a mocked @neondatabase/serverless driver so lexicalClaimSearch runs its
// actual SQL-building logic against canned rows) and we assert it never throws.
// That proves the negative by execution, not just by absence of an import.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// page.tsx reads getLocale() directly (not getT()) and calls makeT() itself —
// mocked so this test never touches next/headers' request-scope requirement.
vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const askWithLimitsMock = vi.fn<(...args: unknown[]) => never>(() => {
  throw new Error("askWithLimits must never be called from /search");
});
vi.mock("@/lib/ask/limits", () => ({
  askWithLimits: (...args: unknown[]) => askWithLimitsMock(...args),
}));

const embedTextsMock = vi.fn<(...args: unknown[]) => never>(() => {
  throw new Error("embedTexts must never be called from /search");
});
vi.mock("@/lib/embeddings/client", () => ({
  embedTexts: (...args: unknown[]) => embedTextsMock(...args),
  embedModel: () => "text-embedding-3-small",
}));

const embedGuardFromEnvMock = vi.fn<(...args: unknown[]) => never>(() => {
  throw new Error("embedGuardFromEnv must never be called from /search");
});
vi.mock("@/lib/embeddings/guard", () => ({
  embedGuardFromEnv: (...args: unknown[]) => embedGuardFromEnvMock(...args),
}));

class ThrowingSpendGuard {
  constructor() {
    throw new Error("SpendGuard must never be constructed from /search");
  }
}
vi.mock("@/lib/usage/spend-guard", () => ({
  SpendGuard: ThrowingSpendGuard,
  envNum: (_name: string, dflt: number) => dflt,
  envCap: () => null,
}));

// The page constructs its own Pool directly (retrieveV2's exact construct/finally-
// close pattern) — mock the driver so the REAL lexicalClaimSearch runs its actual
// SQL-building logic against canned rows instead of a live DB.
const { queryMock, endMock } = vi.hoisted(() => ({ queryMock: vi.fn(), endMock: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = queryMock;
    end = endMock;
  },
}));

const SearchPage = (await import("./page")).default;

beforeEach(() => {
  endMock.mockResolvedValue(undefined);
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("count(*)")) return Promise.resolve({ rows: [{ n: 2 }] });
    if (sql.includes("ORDER BY rank")) {
      return Promise.resolve({
        rows: [
          {
            id: 1,
            text: "claim one",
            hedging: "assessed",
            d: "2026-07-10",
            iso2: "ua",
            track: "military",
            confidence: 0.6,
            rank: 0.5,
          },
          {
            id: 2,
            text: "claim two",
            hedging: "unknown",
            d: null,
            iso2: "ru",
            track: null,
            confidence: null,
            rank: 0.2,
          },
        ],
      });
    }
    if (sql.includes("JOIN claim_sources")) {
      return Promise.resolve({
        rows: [
          {
            claim_id: 1,
            digest_date: "2026-07-09",
            country_name: "Ukraine",
            country_iso2: "ua",
            doc_id: 101,
            doc_url: "https://example.com/report",
            doc_title: "Source report",
            adapter: "rss",
            source_id: 11,
            source_name: "Example News",
            source_key: "example.com",
            source_domain: "example.com",
            source_platform: "news",
            reliability: "0.84",
            published_at: "2026-07-08T20:00:00Z",
            fetched_at: "2026-07-08T20:05:00Z",
          },
          {
            claim_id: 1,
            digest_date: "2026-07-09",
            country_name: "Ukraine",
            country_iso2: "ua",
            doc_id: 102,
            doc_url: null,
            doc_title: "Unlinked report",
            adapter: "gdelt",
            source_id: null,
            source_name: null,
            source_key: null,
            source_domain: null,
            source_platform: null,
            reliability: null,
            published_at: null,
            fetched_at: "2026-07-08T20:06:00Z",
          },
          {
            claim_id: 2,
            digest_date: null,
            country_name: "Russia",
            country_iso2: "ru",
            doc_id: 201,
            doc_url: "https://example.net/report",
            doc_title: "Other report",
            adapter: "rss",
            source_id: 12,
            source_name: "Other News",
            source_key: "example.net",
            source_domain: "example.net",
            source_platform: "news",
            reliability: 0.7,
            published_at: "2026-07-08T21:00:00Z",
            fetched_at: "2026-07-08T21:05:00Z",
          },
        ],
      });
    }
    return Promise.resolve({ rows: [] });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  captureMock.mockReset();
});

describe("/search never touches the paid ASK pipeline surface", () => {
  it("a real ?q= renders results without calling askWithLimits/embeddings/SpendGuard", async () => {
    const element = await SearchPage({
      searchParams: Promise.resolve({ q: "kharkiv drone strikes" }),
    });
    render(element);

    expect(await screen.findByText("claim one")).toBeTruthy();
    expect(screen.getByText("claim two")).toBeTruthy();
    expect(screen.getByText("showing 2 of 2 matching claims")).toBeTruthy();

    // The owning digest date comes from the bulk evidence query, not lexical
    // claim_date (2026-07-10 in the ranked row above).
    const link = screen.getByRole("link", { name: "view digest →" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/digests/ua/2026-07-09#c1");
    expect(screen.getByText("2 documents · 2 channels · 2 platforms")).toBeTruthy();
    expect(screen.getAllByText("Example News").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy for report" })).toBeTruthy();

    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getAllByText("More copy options")[0]!);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(clipboardWrite).toHaveBeenCalledWith("https://bnow.net/digests/ua/2026-07-09#c1");

    expect(askWithLimitsMock).not.toHaveBeenCalled();
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(embedGuardFromEnvMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(3); // count, capped result page, one evidence batch
    expect(endMock).toHaveBeenCalledTimes(1); // pool closed even on the happy path
    expect(captureMock).toHaveBeenCalledWith("search_completed", {
      has_results: true,
      result_count_bucket: "1-5",
      window_present: false,
    });
    expect(JSON.stringify(captureMock.mock.calls)).not.toContain("kharkiv");
  });

  it("no ?q= renders only the intro + form — no DB query, no pipeline call", async () => {
    const element = await SearchPage({ searchParams: Promise.resolve({}) });
    render(element);

    expect(screen.getByPlaceholderText("e.g. Kharkiv drone strikes")).toBeTruthy();
    expect(screen.getByText(/Free-text search/)).toBeTruthy();
    expect(queryMock).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
    expect(askWithLimitsMock).not.toHaveBeenCalled();
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("zero matches renders the empty state, not the count line", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("count(*)")) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rows: [] });
    });
    const element = await SearchPage({ searchParams: Promise.resolve({ q: "no such thing" }) });
    render(element);

    expect(screen.getByText("No claims match.")).toBeTruthy();
    expect(screen.queryByText(/showing/)).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(2); // no evidence query for zero result rows
    expect(askWithLimitsMock).not.toHaveBeenCalled();
    expect(captureMock).toHaveBeenCalledWith("search_completed", {
      has_results: false,
      result_count_bucket: "0",
      window_present: false,
    });
  });
});
