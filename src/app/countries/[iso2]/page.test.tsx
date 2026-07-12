// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Async server component doing rawSql queries + notFound() — mocked wholesale so the
// test needs no DATABASE_URL, same pattern as src/app/page.test.tsx.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
}));

const mod = await import("./page");
const CountryPage = mod.default;
const generateMetadata = mod.generateMetadata;

const RU_ROW = {
  iso2: "ru",
  name: "Russia",
  status: "active",
  latest_digest: "2026-07-12T04:00:00.000Z",
  docs: 12345,
  last_fetch: "2026-07-12T14:30:00.000Z",
  digest_days: 34,
};
const VALIDATION_ROW = { coverage_pct: "57.1", timeliness_hours: "-14.7", digest_date: "2026-07-11" };

const params = (iso2: string) => Promise.resolve({ iso2 });

afterEach(cleanup);
afterEach(() => queryMock.mockReset());

describe("per-country page — active theater", () => {
  it("renders public coverage metadata and real destinations, no gated content", async () => {
    queryMock
      .mockResolvedValueOnce([RU_ROW]) // loadCountry
      .mockResolvedValueOnce([VALIDATION_ROW]); // validation

    const { container } = render(await CountryPage({ params: params("ru") }));

    expect(screen.getByRole("heading", { level: 1, name: "Russia" })).toBeTruthy();
    // live badge + counts
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.getByText("12,345")).toBeTruthy(); // docs, locale-formatted
    expect(screen.getByText("34")).toBeTruthy(); // digest days
    expect(screen.getByText(/57\.1% event coverage vs ISW/)).toBeTruthy();
    // real destinations (latest digest, archive, scoreboard, breadcrumb back to index)
    expect(container.querySelector('a[href="/digests/ru/2026-07-12"]')).toBeTruthy();
    expect(container.querySelector('a[href="/digests/ru"]')).toBeTruthy();
    expect(container.querySelector('a[href="/scoreboard"]')).toBeTruthy();
    expect(container.querySelector('a[href="/countries"]')).toBeTruthy();
    // no claim text / evidence leaks onto this public page
    expect(container.textContent).not.toMatch(/hedging|claim_sources/i);
  });

  it("falls back to 'not yet validated' when no validation run exists", async () => {
    queryMock.mockResolvedValueOnce([RU_ROW]).mockResolvedValueOnce([]); // no validation
    render(await CountryPage({ params: params("ru") }));
    expect(screen.getByText("not yet validated")).toBeTruthy();
  });
});

describe("per-country page — scaffolded theater", () => {
  it("shows the launching state and no digest links", async () => {
    const bh = { iso2: "bh", name: "Bahrain", status: "scaffolded", latest_digest: null, docs: 0, last_fetch: null, digest_days: 0 };
    queryMock.mockResolvedValueOnce([bh]); // loadCountry only — no validation query for non-active

    const { container } = render(await CountryPage({ params: params("bh") }));

    expect(screen.getByText("coverage launching")).toBeTruthy();
    expect(screen.getByText(/feed roster and registry seeding/)).toBeTruthy();
    expect(container.querySelector('a[href^="/digests/"]')).toBeNull();
    // exactly one DB query ran (no validation query on a non-active theater)
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("per-country page — unknown / deferred theater", () => {
  it("calls notFound when the country row is absent", async () => {
    queryMock.mockResolvedValueOnce([]); // loadCountry → nothing (deferred filtered out / unknown)
    await expect(CountryPage({ params: params("cn") })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound on a malformed iso2 without hitting the DB", async () => {
    await expect(CountryPage({ params: params("russia") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("per-country page — metadata", () => {
  it("builds a localized, per-country title and description", async () => {
    queryMock.mockResolvedValueOnce([RU_ROW]);
    const meta = await generateMetadata({ params: params("ru") });
    expect(meta.title).toContain("Russia");
    expect(meta.title).toContain("conflict monitoring");
    expect(typeof meta.description).toBe("string");
    expect(meta.description).toContain("Russia");
  });

  it("degrades to the brand title when the country is unknown", async () => {
    queryMock.mockResolvedValueOnce([]);
    const meta = await generateMetadata({ params: params("zz") });
    expect(meta.title).toBe("BNOW.NET");
  });
});
