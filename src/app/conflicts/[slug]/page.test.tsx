// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("TEST_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

const featureMock = vi.hoisted(() =>
  vi.fn<() => void>(() => {
    throw new Error("FEATURE_OFF_TEST");
  }),
);
vi.mock("@/lib/conflicts/feature", () => ({ requireConflictsUi: featureMock }));

vi.mock("@/lib/conflicts/product-view", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conflicts/product-view")>();
  return {
    ...actual,
    loadConflictProductView: vi.fn(actual.loadConflictProductView),
  };
});

import ConflictOverviewPage from "./page";

const pageFor = (slug: string) => ConflictOverviewPage({ params: Promise.resolve({ slug }) });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  featureMock.mockImplementation(() => {
    throw new Error("FEATURE_OFF_TEST");
  });
});

async function providerSpy(): Promise<Mock> {
  const pv = await import("@/lib/conflicts/product-view");
  return pv.loadConflictProductView as unknown as Mock;
}

describe("feature-off guard (first statement)", () => {
  it("blocks before params resolution and any data access", async () => {
    await expect(pageFor("russia-ukraine")).rejects.toThrow("FEATURE_OFF_TEST");
    expect(await providerSpy()).not.toHaveBeenCalled();
  });

  it("guard precedes the provider when the flag is on", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const spy = await providerSpy();
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(spy.mock.invocationCallOrder[0]);
  });

  it("unknown slug 404s AFTER the guard, without loading conflict data", async () => {
    featureMock.mockImplementation(() => {});
    await expect(pageFor("not-a-conflict")).rejects.toThrow("TEST_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(await providerSpy()).not.toHaveBeenCalled();
  });
});

describe("the seven analyst questions, in contract order", () => {
  it("renders q1..q7 sections in document order, each a labelled landmark", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const ids = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
    const nodes = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(
        nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${ids[i - 1]} must precede ${ids[i]}`,
      ).toBeTruthy();
    }
    for (const node of nodes) {
      const labelId = node.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)).toBeTruthy();
    }
  });

  it("q4 carries the non-independence caveat INSIDE the benchmark module and n/d beside the score", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const q4 = screen.getByTestId("q4");
    const headline = within(q4).getByTestId("benchmark-headline");
    expect(within(headline).getByTestId("non-independence-caveat").textContent).toContain(
      "not independent confirmation",
    );
    expect(headline.textContent).toMatch(/1 of 1 declared Key Takeaways \(100%\)/);
    expect(headline.textContent).toContain("Key Takeaway benchmark coverage");
    // never accuracy language
    expect(document.body.textContent!.toLowerCase()).not.toContain("accuracy");
  });

  it("places the required explainers: terminology in q1, source-country in q3, coexistence in q4", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    expect(within(screen.getByTestId("q1")).getByTestId("terminology-explainer")).toBeTruthy();
    expect(within(screen.getByTestId("q3")).getByTestId("source-country-note")).toBeTruthy();
    const note = within(screen.getByTestId("q4")).getByTestId("scoreboard-coexistence-note");
    expect(note.textContent).toContain("different aggregations of one report");
    expect(within(note).getByRole("link").getAttribute("href")).toBe("/scoreboard");
  });

  it("renders the ruling-3 synthetic-corpus banner (truth-in-UI disclosure)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    expect(screen.getByTestId("synthetic-banner").textContent).toContain("SYNTHETIC TEST FIXTURE");
  });

  it("labels the featured record as a fixture DEMONSTRATION, like the detail page", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    // Gate-7 product MINOR-7: the RU–UA overview features a malformed-cutoff
    // sentinel (n=1, 100%) and previously printed only the report key
    expect(screen.getByTestId("featured-demonstration").textContent).toContain(
      "Fixture demonstration:",
    );
  });

  it("run-list detail links have UNIQUE accessible names (WCAG 2.4.4)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    // the two ladder-variant rows previously produced byte-identical link
    // names pointing at different records (Gate-7 product MINOR-5)
    const names = screen
      .getAllByRole("link")
      .map((el) => (el.textContent ?? "").trim())
      .filter((name) => name.startsWith("detail for"));
    expect(names.length).toBeGreaterThan(1);
    // the WCAG property itself: no two run-list links share a name
    expect(new Set(names).size).toBe(names.length);
    // and the two ladder-variant rows are the pair that previously collided
    const variantNames = names.filter((n) => n.includes("Malformed matcher votes"));
    expect(variantNames).toHaveLength(2);
    expect(variantNames[0]).not.toBe(variantNames[1]);
    expect(variantNames.every((n) => n.includes("variant"))).toBe(true);
  });

  it("the ROCA overview renders the per-series coexistence note (RU/UA rows example)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const note = screen.getByTestId("scoreboard-coexistence-note");
    expect(note.textContent).toContain("separate RU and UA rows");
    expect(note.textContent).not.toContain("single IR row");
  });

  it("q3 answers the contractual ACTOR clause and names the contribution population", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const q3 = screen.getByTestId("q3");
    // pre-gate MINOR-1: the heading is contractual ("…actors…"); the copy
    // answers the actor clause honestly (rosters govern lanes upstream; the
    // by-actor table is a recorded future dimension)
    const actorNote = within(q3).getByTestId("actor-contribution-note");
    expect(actorNote.textContent).toContain("versioned actor rosters");
    expect(actorNote.textContent).toContain("not yet computed");
    // pre-gate MINOR-2: the population is disclosed beside the table
    const popNote = within(q3).getByTestId("contribution-population-note");
    expect(popNote.textContent).toContain("corpus-recall matched takeaways");
    expect(popNote.textContent).toContain("independent of multi-labeling");
  });

  it("teaser tier: no claim text, no takeaway text, no source trail on the overview", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    expect(document.body.textContent).not.toContain("reportedly repelled");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
    // the gated link is present instead
    const q2 = screen.getByTestId("q2");
    expect(
      within(q2).getByRole("link", { name: /Read the published claims/ }).getAttribute("href"),
    ).toMatch(/^\/conflicts\/russia-ukraine\/benchmark\/.+\/evidence$/);
  });
});

describe("unavailable rendering (iran overview)", () => {
  it("renders the publication gap as words, never 0%", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional"));
    expect(document.body.textContent).toContain("unavailable — no report published");
  });

  it("renders the incomparable gulf lane label in the run list detail path", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional"));
    // the featured iran day (2026-08-09) does not carry the gulf lane, but the
    // run list must link to the gulf record for drill-in
    const links = screen.getAllByRole("link", { name: /detail/ });
    expect(
      links.some((l) => l.getAttribute("href")!.includes("iran-gulf-unavailable-010b")),
    ).toBe(true);
  });
});
