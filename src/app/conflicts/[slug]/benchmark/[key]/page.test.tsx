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

import BenchmarkDetailPage from "./page";
import {
  IRAN_LEGACY_GOLDEN,
  KEYWORD_GOLDEN,
  editionRow,
  fakeConflictQuery,
  observationRow,
  resultForEdition,
} from "@/lib/conflicts/db-view.testkit";

const today = new Date();
const DAY = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1),
)
  .toISOString()
  .slice(0, 10);

const RU_KEY = `roca-${DAY}-daily`;
const IR_KEY = `iran-update-${DAY}-evening`;

const pageFor = (slug: string, key: string) =>
  BenchmarkDetailPage({ params: Promise.resolve({ slug, key }) });

/** One ROCA day (single edition) and one Iran day with TWO editions where the
 *  EVENING edition — the daily final — is the observed one. */
function seed() {
  const ru = resultForEdition(KEYWORD_GOLDEN, "roca", DAY, "daily");
  const ir = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", DAY, "evening");
  const fake = fakeConflictQuery({
    observations: [observationRow(ru, { id: 2 }), observationRow(ir, { id: 1 })],
    editions: [
      editionRow("roca", DAY, "daily"),
      editionRow("iran_update", DAY, "morning"),
      editionRow("iran_update", DAY, "evening"),
    ],
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
  it("blocks before any data access", async () => {
    await expect(pageFor("russia-ukraine", RU_KEY)).rejects.toThrow("FEATURE_OFF_TEST");
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it("guard precedes the first query when on", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbMock.query.mock.invocationCallOrder[0],
    );
  });

  it("404s every key that is not a daily-final observation in the window", async () => {
    featureMock.mockImplementation(() => {});
    for (const key of [
      "no-such-key", // undecodable
      `iran-update-${DAY}-morning`, // a real edition, but not the day's final
      "roca-2020-01-01-daily", // outside the view window
    ]) {
      notFoundMock.mockClear();
      await expect(pageFor(key.startsWith("iran") ? "iran-regional" : "russia-ukraine", key))
        .rejects.toThrow("TEST_NOT_FOUND");
      expect(notFoundMock, key).toHaveBeenCalled();
    }
  });
});

describe("the keyword rung, disclosed as degraded", () => {
  it("renders DEGRADED with the full-denominator note and per-population labels", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));

    const headline = screen.getByTestId("benchmark-headline");
    expect(headline.textContent).toContain("DEGRADED — keyword fallback");
    expect(headline.textContent).toContain("full declared-takeaway denominator");
    // per-population labels disclose the rung in the pipeline module too
    const q5 = screen.getByTestId("q5");
    const degradedBadges = within(q5)
      .getAllByText(/DEGRADED — keyword fallback/)
      .filter((el) => el.getAttribute("data-degraded") === "true");
    expect(degradedBadges.length).toBe(2);
  });
});

describe("edition provenance (memo C4)", () => {
  it("names the reference EDITION and the report day, never a fixture demonstration", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));
    expect(screen.getByTestId("q1").textContent).toContain(`roca:${DAY}:daily`);
    expect(document.body.textContent).not.toContain("Fixture demonstration");
    expect(screen.queryByTestId("synthetic-banner")).toBeNull();
  });

  it("a single-edition day claims no multi-edition selection", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));
    expect(screen.queryByTestId("daily-final-note")).toBeNull();
    expect(screen.queryByTestId("editions-considered")).toBeNull();
  });

  it("a multi-edition day says so and lists every edition, marking the scored one", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", IR_KEY));
    expect(screen.getByTestId("daily-final-note").textContent).toContain(
      "published more than one edition on this day",
    );
    const list = screen.getByTestId("editions-considered");
    expect(list.textContent).toContain(`iran_update:${DAY}:morning`);
    expect(list.textContent).toContain(`iran_update:${DAY}:evening — scored (daily final)`);
    expect(list.textContent).not.toContain(`iran_update:${DAY}:morning — scored`);
  });
});

describe("memo C13 and C11 labels", () => {
  it("carries the compound-undetermined banner with its flags version", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));
    const banner = screen.getByTestId("compound-undetermined-banner");
    expect(banner.textContent).toContain("Compound handling undetermined — not soak-eligible");
    expect(banner.textContent).toContain("unit-flags-v0");
  });

  it("renders no coverage target or target-coloured bar (C11: no interim target)", async () => {
    featureMock.mockImplementation(() => {});
    const { container } = render(await pageFor("russia-ukraine", RU_KEY));
    expect(document.body.textContent).not.toMatch(/target/i);
    expect(container.querySelector(".bg-green-600")).toBeNull();
  });

  it("carries the memo-C8 legacy-only companion count", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", IR_KEY));
    const companion = screen.getByTestId("legacy-only-companion");
    expect(companion.textContent).toMatch(/^1 matched with legacy-only evidence\./);
    expect(companion.textContent).toContain("published output but no mapped corpus");
  });
});

describe("carried-forward surface obligations", () => {
  it("q3 renders BOTH contribution notes — the population difference and multi-labeling", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));
    const q3 = screen.getByTestId("q3");
    expect(within(q3).getByTestId("contribution-population-note").textContent).toContain(
      "corpus-recall matched takeaways",
    );
    expect(within(q3).getByTestId("actor-contribution-note").textContent).toContain(
      "versioned actor rosters",
    );
  });

  it("method stamps carry a print-visible duplicate (a native details prints collapsed)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", IR_KEY));
    const printBlock = screen.getByTestId("conflict-methodology-print");
    expect(printBlock.className).toContain("hidden");
    expect(printBlock.className).toContain("print:block");
    expect(printBlock.textContent).toContain("methodology epoch");
    expect(printBlock.textContent).toContain("end anchored on");
    expect(printBlock.textContent).toContain("Versions: lanes");
    expect(screen.getByTestId("conflict-methodology").className).toContain("print:hidden");
  });

  it("renders the incomparable lane as words, never a bare zero", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", IR_KEY));
    expect(screen.getByTestId("lane-incomparable-maritime").textContent).toBe(
      "unavailable (incomparable evidence)",
    );
    expect(screen.getByTestId("timing-pair-weighted-note").textContent).toContain("pair-weighted");
  });

  it("q7 contributor links carry the legacy-engine qualifier", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", IR_KEY));
    expect(screen.getByTestId("q7").textContent).toContain("legacy engine");
  });

  it("the Iran surface renders the per-series coexistence note (single IR row)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", IR_KEY));
    const note = screen.getByTestId("scoreboard-coexistence-note");
    expect(note.textContent).toContain("single IR row");
    expect(note.textContent).not.toContain("separate RU and UA rows");
  });
});

describe("teaser boundary", () => {
  it("renders counts/labels but never claim text or takeaway text", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", RU_KEY));
    expect(document.body.textContent).not.toContain("reportedly repelled");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
    // accessible tables carry captions
    expect(document.querySelectorAll("table caption").length).toBeGreaterThan(0);
    // the gated view is offered, and only as a link
    expect(
      screen.getByRole("link", { name: /Read the published claims/ }).getAttribute("href"),
    ).toBe(`/conflicts/russia-ukraine/benchmark/${RU_KEY}/evidence`);
  });
});
