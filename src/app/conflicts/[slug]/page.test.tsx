// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const dbMock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", () => ({ rawSql: dbMock }));

import ConflictOverviewPage from "./page";
import {
  IRAN_LEGACY_GOLDEN,
  KEYWORD_GOLDEN,
  editionRow,
  fakeConflictQuery,
  observationRow,
  resultForEdition,
} from "@/lib/conflicts/db-view.testkit";

const today = new Date();
const dayAgo = (n: number) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n))
    .toISOString()
    .slice(0, 10);

const D0 = dayAgo(0);
const D1 = dayAgo(1);

const pageFor = (slug: string) => ConflictOverviewPage({ params: Promise.resolve({ slug }) });

/** Two ROCA days plus an Iran day carrying a legacy-only match; the Iran day is
 *  MULTI-EDITION with only the morning edition observed, which is the C4 case
 *  the surface must show as pending rather than as the day's result. */
function seed(overrides: Parameters<typeof fakeConflictQuery>[0] = {}) {
  const ruNew = resultForEdition(KEYWORD_GOLDEN, "roca", D0, "daily");
  const ruOld = resultForEdition(KEYWORD_GOLDEN, "roca", D1, "daily");
  const irMorning = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", D0, "morning");
  const fake = fakeConflictQuery({
    observations: [
      observationRow(ruNew, { id: 3 }),
      observationRow(ruOld, { id: 2 }),
      observationRow(irMorning, { id: 1 }),
    ],
    editions: [
      editionRow("roca", D0, "daily"),
      editionRow("roca", D1, "daily"),
      editionRow("iran_update", D0, "morning"),
      editionRow("iran_update", D0, "evening"),
    ],
    ...overrides,
  });
  dbMock.query.mockImplementation(fake.query);
  return fake;
}

beforeEach(() => seed());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  featureMock.mockImplementation(() => {
    throw new Error("FEATURE_OFF_TEST");
  });
});

describe("feature-off guard (first statement)", () => {
  it("blocks before params resolution and any data access", async () => {
    await expect(pageFor("russia-ukraine")).rejects.toThrow("FEATURE_OFF_TEST");
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it("guard precedes the first query when the flag is on", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbMock.query.mock.invocationCallOrder[0],
    );
  });

  it("unknown slug 404s AFTER the guard, without loading conflict data", async () => {
    featureMock.mockImplementation(() => {});
    await expect(pageFor("not-a-conflict")).rejects.toThrow("TEST_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(dbMock.query).not.toHaveBeenCalled();
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
    expect(headline.textContent).toMatch(/\d+ of \d+ declared Key Takeaways \(\d+%\)/);
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

  it("carries the memo-C13 banner and NOT the retired synthetic-corpus one", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const banner = screen.getByTestId("compound-undetermined-banner");
    expect(banner.textContent).toContain("Compound handling undetermined");
    expect(banner.textContent).toContain("unit-flags-v0");
    expect(screen.queryByTestId("synthetic-banner")).toBeNull();
  });

  it("names the real reference EDITION, never a fixture demonstration", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    expect(screen.getByTestId("q4").textContent).toContain(`roca:${D0}:daily`);
    expect(document.body.textContent).not.toContain("Fixture demonstration");
    expect(screen.queryByTestId("featured-demonstration")).toBeNull();
  });

  it("carries the memo-C8 legacy-only companion count beside the headline", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const companion = screen.getByTestId("legacy-only-companion");
    expect(companion.textContent).toContain("matched with legacy-only evidence");
    expect(companion.textContent).toContain("shown beside the headline rather than removed");
  });

  it("renders no coverage TARGET or bar for conflict rows (memo C11)", async () => {
    featureMock.mockImplementation(() => {});
    const { container } = render(await pageFor("russia-ukraine"));
    expect(document.body.textContent).not.toMatch(/target/i);
    // the scoreboard's target-coloured bars have no counterpart here
    expect(container.querySelector(".bg-green-600")).toBeNull();
    expect(container.querySelector(".bg-red-500")).toBeNull();
  });

  it("lists the scored days newest-first and links each to its benchmark detail", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const list = screen.getByTestId("observation-day-list");
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([D0, D1]);
    expect(links[0].getAttribute("href")).toBe(
      `/conflicts/russia-ukraine/benchmark/roca-${D0}-daily`,
    );
    // unique accessible names (WCAG 2.4.4): the report day is the name
    expect(new Set(links.map((l) => l.textContent)).size).toBe(links.length);
  });

  it("q3 answers the contractual ACTOR clause and names the contribution population", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    const q3 = screen.getByTestId("q3");
    const actorNote = within(q3).getByTestId("actor-contribution-note");
    expect(actorNote.textContent).toContain("versioned actor rosters");
    expect(actorNote.textContent).toContain("not yet computed");
    const popNote = within(q3).getByTestId("contribution-population-note");
    expect(popNote.textContent).toContain("corpus-recall matched takeaways");
    expect(popNote.textContent).toContain("independent of multi-labeling");
  });

  it("teaser tier: no claim text, no takeaway text, no source trail on the overview", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine"));
    expect(document.body.textContent).not.toContain("reportedly repelled");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
    const q2 = screen.getByTestId("q2");
    expect(
      within(q2).getByRole("link", { name: /Read the published claims/ }).getAttribute("href"),
    ).toMatch(/^\/conflicts\/russia-ukraine\/benchmark\/.+\/evidence$/);
  });
});

describe("memo C4 on the Iran overview: a multi-edition day whose final is unobserved", () => {
  it("shows the day as pending and refuses to promote the morning edition's score", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional"));

    const pending = screen.getByTestId("pending-days");
    expect(pending.textContent).toContain(D0);
    expect(pending.textContent).toContain("designated final edition has not been evaluated yet");
    expect(pending.textContent).toContain("a morning edition's score is not the day's score");
    // the morning observation exists, and no headline was built from it
    expect(screen.queryByTestId("observation-day-list")).toBeNull();
    expect(document.body.textContent).toContain("No conflict evaluation has been recorded");
  });

  it("renders the per-series coexistence note (single IR row, not the RU/UA example)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional"));
    const note = screen.getByTestId("scoreboard-coexistence-note");
    expect(note.textContent).toContain("single IR row");
    expect(note.textContent).not.toContain("separate RU and UA rows");
  });
});
