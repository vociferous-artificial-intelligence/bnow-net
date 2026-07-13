// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Scoreboard page is an async server component doing one rawSql query directly (no
// drizzle schema) — mocked wholesale so this test never needs DATABASE_URL, same
// pattern as src/app/page.test.tsx. getLocale is mocked to "en", but makeT/dictionaries
// are the REAL module (page.tsx imports makeT directly, not injected as a prop), so
// assertions below check real catalog prose — this is the explainer's regression guard
// (W3, scoreboard-explainer sprint).

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const queryMock = vi.fn();
vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));

vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const ScoreboardPage = (await import("./page")).default;

afterEach(cleanup);
afterEach(() => {
  queryMock.mockReset();
});

const ROW = {
  id: 1,
  digest_date: "2026-07-11T00:00:00.000Z",
  iso2: "ru",
  coverage_pct: 57.1,
  unsupported_claim_rate: 0.12,
  timeliness_hours: 14.7,
  divergences: [
    { kind: "agreement" },
    { kind: "agreement" },
    { kind: "isw_only" },
    { kind: "ours_only" },
  ],
  at_publish: null,
  provider: "openai:gpt-4o-mini+mapreduce",
};

describe("explainer block", () => {
  it("renders the explainer paragraph", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    render(element);
    expect(screen.getByText(/We score our own output\./)).toBeTruthy();
  });

  it("renders a how-to-read line for each metric, matching the catalog copy", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    expect(container.textContent).toContain(
      "Coverage % — the share of ISW's same-day takeaways our digest also matched.",
    );
    expect(container.textContent).toContain(
      "Information lead — median hours between our earliest supporting source document and ISW's publish time, across matched events; positive means we had it first.",
    );
    expect(container.textContent).toContain(
      "Thin-sourced % — the share of our claims resting on a single source while still hedged as claimed or unverified, never stated as settled fact. Lower is better.",
    );
    expect(container.textContent).toContain(
      "Agreement / ISW-only / ours-only — events both sides reported, events ISW reported that we missed, and events we reported that ISW didn't carry. An ours-only item counts as a potential lead only when confirmed; unconfirmed items are labeled with their hedge.",
    );
  });

  it("keeps the numeric targets visible (coverage / thin-sourced / lead)", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    expect(container.textContent).toContain("target ≥ 80%");
    expect(container.textContent).toContain("target < 2%");
    expect(container.textContent).toContain("target within ±6h");
  });

  it("renders the explainer above the summary tiles and table", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    const explainer = screen.getByText(/We score our own output\./);
    const table = container.querySelector("table");
    expect(table).toBeTruthy();
    expect(
      explainer.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("table rows still render", () => {
  it("renders the run row's theater code", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    render(element);
    expect(screen.getByText("ru")).toBeTruthy();
  });
});

describe("at-publish dual coverage (W4)", () => {
  it("renders the at-publish subline in the coverage cell when details carry it", async () => {
    queryMock.mockResolvedValueOnce([
      { ...ROW, at_publish: { coveragePct: 28.6, matchedBefore: 2, matchedTotal: 4 } },
    ]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    expect(container.textContent).toContain("at ISW publish: 29%");
    // and its how-to-read line explains the pair
    expect(container.textContent).toContain("At ISW publish — of those same takeaways");
  });

  it("renders no subline for runs scored before the dual metric existed", async () => {
    queryMock.mockResolvedValueOnce([ROW]); // at_publish: null
    const element = await ScoreboardPage();
    const { container } = render(element);
    expect(container.textContent).not.toContain("at ISW publish:");
  });
});
