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

  it("puts results before methodology, with the explainer inside the collapsed disclosure", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    const explainer = screen.getByText(/We score our own output\./);
    const table = container.querySelector("table")!;
    const methodology = container.querySelector<HTMLDetailsElement>(
      '[data-testid="scoreboard-methodology"]',
    )!;

    // Inverted 2026-07-16: the table now precedes the methodology, not the reverse.
    expect(table.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(methodology.contains(explainer)).toBe(true);
    // Collapsed by default and native — the results stay readable with JS disabled.
    expect(methodology.open).toBe(false);
    expect(methodology.tagName).toBe("DETAILS");
  });

  it("shows the opening and the baseline caveat before the figures, outside the disclosure", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    const caveat = container.querySelector('[data-testid="scoreboard-caveat"]')!;
    const table = container.querySelector("table")!;

    expect(screen.getByText(/We compare each finalized BNOW country digest/)).toBeTruthy();
    expect(caveat.textContent).toContain(
      "Coverage and divergence are therefore directional comparisons, not like-for-like measures of report completeness.",
    );
    // A reader who never expands methodology must still see the caveat, above the numbers.
    expect(caveat.closest("details")).toBeNull();
    expect(caveat.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps RU/UA sharing the ROCA baseline and denominator stated in the methodology", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const element = await ScoreboardPage();
    const { container } = render(element);
    expect(container.textContent).toContain(
      "RU and UA are currently scored as separate country digests against the same ROCA report and denominator.",
    );
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
    expect(container.textContent).toContain("evidence available at ISW publish: 29%");
    // and its how-to-read line names it as an evidence-availability proxy (WS4)
    expect(container.textContent).toContain("Evidence available at ISW publish (proxy)");
    // the corrected framing drops the overclaiming language
    expect(container.textContent).not.toContain("apples-to-apples");
    expect(container.textContent).not.toContain("later ingestion added");
  });

  it("renders no subline for runs scored before the dual metric existed", async () => {
    queryMock.mockResolvedValueOnce([ROW]); // at_publish: null
    const element = await ScoreboardPage();
    const { container } = render(element);
    expect(container.textContent).not.toContain("evidence available at ISW publish:");
  });
});

describe("memo C10: country rows are labelled as evidence lenses, numbers untouched", () => {
  it("names the column an evidence lens and explains why the rows are not additive", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    const { container } = render(await ScoreboardPage());
    expect(screen.getByRole("columnheader", { name: "evidence lens (country)" })).toBeTruthy();
    const caveat = screen.getByTestId("scoreboard-caveat");
    expect(caveat.textContent).toContain("the same ROCA report through different lenses");
    expect(caveat.textContent).toContain("the rows are not additive");
    // the relabel is COPY ONLY — the row's figures are byte-identical
    expect(container.textContent).toContain("57%");
    expect(screen.getByText("ru")).toBeTruthy();
  });

  it("re-pins the query: relabelling changed no column, filter, order or limit", async () => {
    queryMock.mockResolvedValueOnce([ROW]);
    render(await ScoreboardPage());
    const [sql] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM validation_runs vr");
    expect(sql).toContain("vr.coverage_pct");
    expect(sql).toContain("ORDER BY d.digest_date DESC, c.iso2");
    expect(sql).toContain("LIMIT 60");
    expect(sql).not.toMatch(/conflict/i);
  });
});

describe("the reciprocal conflict-view link (contract §11(d))", () => {
  afterEach(() => {
    delete process.env.CONFLICTS_UI;
  });

  it("is ABSENT while the conflict flag is absent — a public page never links to a 404", async () => {
    delete process.env.CONFLICTS_UI;
    queryMock.mockResolvedValueOnce([ROW]);
    render(await ScoreboardPage());
    expect(screen.queryByTestId("conflict-view-link")).toBeNull();
  });

  it("appears only when CONFLICTS_UI=1, and points at /conflicts", async () => {
    process.env.CONFLICTS_UI = "1";
    queryMock.mockResolvedValueOnce([ROW]);
    render(await ScoreboardPage());
    const link = screen.getByTestId("conflict-view-link");
    expect(link.textContent).toContain("scored once per conflict instead of once per country");
    expect(screen.getByRole("link", { name: "Conflict-level view" }).getAttribute("href")).toBe(
      "/conflicts",
    );
  });

  it("stays absent for any other flag spelling (fail closed)", async () => {
    for (const value of ["", "0", "true", "yes"]) {
      process.env.CONFLICTS_UI = value;
      queryMock.mockReset();
      queryMock.mockResolvedValueOnce([ROW]);
      cleanup();
      render(await ScoreboardPage());
      expect(screen.queryByTestId("conflict-view-link"), value).toBeNull();
    }
  });
});
