// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The home page is an async server component doing rawSql queries directly (no
// drizzle schema) and reading the session via @/lib/session — mocked wholesale so
// this test never needs DATABASE_URL or a request context, same pattern as
// src/app/ask/page.test.tsx and src/app/digests/[country]/[date]/page.test.tsx.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));

vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const emailMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/session", () => ({
  currentUserEmail: () => emailMock(),
}));

const queryMock = vi.fn();

const STATS_ROW = { sources: 10, citations: 20, docs: 30, runs: 5, ru_latest: "2026-07-10" };

const Home = (await import("./page")).default;

afterEach(cleanup);
afterEach(() => {
  queryMock.mockReset();
  emailMock.mockReset();
});

describe("signed-in home: Ask entry point (W5)", () => {
  it("renders a zero-JS GET form pointing at /ask under the validation tiles", async () => {
    emailMock.mockResolvedValue("user@example.com");
    queryMock
      .mockResolvedValueOnce([STATS_ROW]) // top stats query
      .mockResolvedValueOnce([]) // freshnessRows
      .mockResolvedValueOnce([]) // digestRows
      .mockResolvedValueOnce([]) // validationRows
      .mockResolvedValueOnce([]); // corroboratedRows

    const element = await Home();
    const { container } = render(element);

    const form = container.querySelector('form[action="/ask"][method="get"]');
    expect(form).toBeTruthy();
    const input = form?.querySelector('input[name="q"]');
    expect(input).toBeTruthy();
    expect(form?.textContent).toContain("Ask");
  });
});

describe("signed-out home: untouched marketing sections", () => {
  it("renders no /ask form anywhere, and still renders the marketing feature cards", async () => {
    emailMock.mockResolvedValue(null);
    queryMock.mockResolvedValueOnce([STATS_ROW]); // only the top stats query runs

    const element = await Home();
    const { container } = render(element);

    expect(container.querySelector('form[action="/ask"]')).toBeNull();
    // Marketing feature cards (signed-out only) still render, resolved through the
    // real en dictionary — proves the signed-out branch was left untouched.
    expect(screen.getByText("Reliability, derived not asserted")).toBeTruthy();
  });
});
