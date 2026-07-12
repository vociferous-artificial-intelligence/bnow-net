// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    return Promise.resolve({ rows: [] });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

    // Only claim one carries a date -> only it gets a digest deep link.
    const link = screen.getByRole("link", { name: "view digest →" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/digests/ua/2026-07-10#c1");

    expect(askWithLimitsMock).not.toHaveBeenCalled();
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(embedGuardFromEnvMock).not.toHaveBeenCalled();
    expect(endMock).toHaveBeenCalledTimes(1); // pool closed even on the happy path
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
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });
});
