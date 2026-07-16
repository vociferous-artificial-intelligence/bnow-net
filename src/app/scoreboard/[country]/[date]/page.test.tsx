// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oursOnlyPresentation } from "@/lib/validation/ours-only";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...a: unknown[]) => queryMock(...a) } }));

const { default: DetailPage } = await import("./page");

afterEach(() => {
  cleanup();
  queryMock.mockReset();
});

const RUN_ROW = {
  coverage_pct: 40,
  unsupported_claim_rate: 0.2,
  timeliness_hours: 10,
  isw_url: "https://understandingwar.org/x",
  divergences: [
    // Run scored 2026-07-13+: hedging frozen at scoring time.
    { kind: "ours_only", claimId: 1, claimText: "Senator died amid corruption claims", hedging: "claimed" },
    // Confirmed unmatched claim: the genuine potential lead.
    { kind: "ours_only", claimId: 2, claimText: "Refinery struck, geolocated", hedging: "confirmed" },
    // Legacy run entry (no hedging): resolved from the live claims table below.
    { kind: "ours_only", claimId: 3, claimText: "Old-run unverified item" },
    { kind: "agreement", claimId: 4, claimText: "Matched item", score: 3 },
  ],
  details: {},
};

function pageArgs() {
  return { params: Promise.resolve({ country: "ru", date: "2026-07-12" }) };
}

describe("oursOnlyPresentation", () => {
  it("endorses only confirmed/assessed claims as potential leads", () => {
    expect(oursOnlyPresentation("confirmed")).toEqual({
      label: "ours only (potential lead)",
      hedge: "confirmed",
    });
    expect(oursOnlyPresentation("assessed").label).toBe("ours only (potential lead)");
  });
  it("labels non-confirmed and unknown-hedge claims as reported items with the hedge shown", () => {
    expect(oursOnlyPresentation("claimed")).toEqual({
      label: "BNOW-only reported item",
      hedge: "claimed",
    });
    expect(oursOnlyPresentation("unknown").label).toBe("BNOW-only reported item");
    expect(oursOnlyPresentation(undefined)).toEqual({
      label: "BNOW-only reported item",
      hedge: "unverified",
    });
  });
});

describe("scoreboard divergence detail — safe ours_only framing", () => {
  it("shows the hedge and never frames a non-confirmed claim as an endorsed lead", async () => {
    queryMock
      .mockResolvedValueOnce([RUN_ROW]) // run row
      .mockResolvedValueOnce([{ id: 3, hedging: "unverified" }]); // live-claim fallback for the legacy entry

    render(await DetailPage(pageArgs()));

    // The claimed allegation renders as a reported item with its hedge, text intact.
    const reported = screen.getAllByText("BNOW-only reported item");
    expect(reported.length).toBe(2); // claimed + legacy-unverified entries
    expect(screen.getByText("Senator died amid corruption claims")).toBeTruthy();
    expect(screen.getAllByText("claimed").length).toBeGreaterThan(0);

    // The confirmed claim keeps the potential-lead framing.
    expect(screen.getAllByText("ours only (potential lead)").length).toBe(1);

    // Legacy entry resolved its hedge from the claims table.
    expect(screen.getAllByText("unverified").length).toBeGreaterThan(0);

    // The fallback lookup asked only for the entry missing a frozen hedge.
    const lookup = queryMock.mock.calls[1];
    expect(lookup[0]).toMatch(/FROM claims WHERE id = ANY/);
    expect(lookup[1]).toEqual([[3]]);
  });

  it("renders the takeaway keyword sentence as ordinary readable text", async () => {
    queryMock.mockResolvedValueOnce([
      {
        ...RUN_ROW,
        divergences: [
          {
            kind: "agreement",
            claimId: 4,
            claimText: "Matched item",
            score: 3,
            iswIndex: 0,
            iswToponyms: ["Pokrovsk"],
            iswActions: ["advanced"],
          },
        ],
      },
    ]);
    const { container } = render(await DetailPage(pageArgs()));

    const keywords = screen.getByText(/ISW takeaway #1 · keywords:/);
    expect(keywords.textContent).toContain("Pokrovsk, advanced");
    // This sentence is the reader's evidence for the verdict, not a chip: 14px, and a
    // pair that clears 4.5:1 on both #ffffff (gray-600 = 7.56:1) and #0a0a0a
    // (gray-400 = 7.61:1). A bare gray-500 measured 4.09:1 in dark mode.
    expect(keywords.className).toContain("text-sm");
    expect(keywords.className).toContain("text-gray-600");
    expect(keywords.className).toContain("dark:text-gray-400");

    // Breadcrumb and metric summary carry the same corrected pair.
    const breadcrumb = container.querySelector('a[href="/scoreboard"]')!.parentElement!;
    expect(breadcrumb.className).toContain("text-gray-600");
    expect(breadcrumb.className).toContain("dark:text-gray-400");
    const summary = screen.getByText(/coverage 40%/);
    expect(summary.className).toContain("text-gray-600");
    expect(summary.className).toContain("dark:text-gray-400");

    // The match-score/hedge row stays 12px (genuinely tertiary) but must not be
    // gray-400 on white, which measures 2.60:1.
    const match = screen.getByText(/match 3/);
    expect(match.className).toContain("text-xs");
    expect(match.className).toContain("text-gray-600");
    expect(match.className).toContain("dark:text-gray-400");

    // No meaningful foreground left on the failing shades.
    expect(container.querySelector(".text-gray-400:not(.dark\\:text-gray-400)")).toBeNull();
    for (const el of container.querySelectorAll('[class*="text-gray-500"]')) {
      expect(el.className).toContain("dark:text-gray-400");
    }
  });

  it("degrades to the safe label when the live-claim lookup fails", async () => {
    queryMock
      .mockResolvedValueOnce([
        { ...RUN_ROW, divergences: [{ kind: "ours_only", claimId: 9, claimText: "orphan" }] },
      ])
      .mockRejectedValueOnce(new Error("db down"));

    render(await DetailPage(pageArgs()));
    expect(screen.getByText("BNOW-only reported item")).toBeTruthy();
    expect(screen.queryByText("ours only (potential lead)")).toBeNull();
  });
});
