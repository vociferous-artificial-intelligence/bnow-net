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
    loadBenchmarkDetail: vi.fn(actual.loadBenchmarkDetail),
  };
});

import BenchmarkDetailPage from "./page";

const pageFor = (slug: string, key: string) =>
  BenchmarkDetailPage({ params: Promise.resolve({ slug, key }) });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  featureMock.mockImplementation(() => {
    throw new Error("FEATURE_OFF_TEST");
  });
});

async function providerSpy(): Promise<Mock> {
  const pv = await import("@/lib/conflicts/product-view");
  return pv.loadBenchmarkDetail as unknown as Mock;
}

describe("feature-off guard (first statement)", () => {
  it("blocks before any data access", async () => {
    await expect(pageFor("russia-ukraine", "roca-ua-only-001b")).rejects.toThrow(
      "FEATURE_OFF_TEST",
    );
    expect(await providerSpy()).not.toHaveBeenCalled();
  });

  it("guard precedes the provider when on; unknown key 404s", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-ua-only-001b"));
    const spy = await providerSpy();
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(spy.mock.invocationCallOrder[0]);

    await expect(pageFor("russia-ukraine", "no-such-key")).rejects.toThrow("TEST_NOT_FOUND");
  });
});

describe("degraded matcher rungs (ladder variant B — keyword)", () => {
  it("renders the keyword rung as DEGRADED with the full-denominator note and per-population labels", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "cc-matcher-failclosed-013b~B-zero-valid-rounds"));

    const headline = screen.getByTestId("benchmark-headline");
    expect(headline.textContent).toContain("DEGRADED — keyword fallback");
    expect(headline.textContent).toContain("full declared-takeaway denominator");
    expect(headline.textContent).toContain("1 takeaway");
    expect(headline.textContent).toContain("no keyword signal");
    // per-population labels disclose the rung in the pipeline module too
    const q5 = screen.getByTestId("q5");
    const degradedBadges = within(q5)
      .getAllByText(/DEGRADED — keyword fallback/)
      .filter((el) => el.getAttribute("data-degraded") === "true");
    expect(degradedBadges.length).toBe(2);
  });

  it("labels the single-round variant A as DEGRADED single round, never a majority", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "cc-matcher-failclosed-013b~A-one-valid-round"));
    expect(document.body.textContent).toContain("DEGRADED — single usable LLM round");
    expect(document.body.textContent).not.toContain("LLM majority vote");
  });
});

describe("compound partial (roca-compound-partial-009b)", () => {
  it("shows the union partial diagnostic beside the headline AND per-population counts", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-compound-partial-009b"));

    const diag = screen.getByTestId("partial-diagnostic");
    expect(diag.textContent).toContain("1 partial takeaway");
    expect(diag.textContent).toContain("union across both populations");
    const q5 = screen.getByTestId("q5");
    expect(within(q5).getAllByText(/partial:/).length).toBe(2); // one per population
    // headline counts the partial as a miss: 0 of 1
    expect(screen.getByTestId("benchmark-headline").textContent).toMatch(
      /0 of 1 declared Key Takeaways \(0%\)/,
    );
  });
});

describe("retention gap (roca-retention-gap-008b)", () => {
  it("renders the ruling-3 synthetic-corpus banner (truth-in-UI disclosure)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-retention-gap-008b"));
    expect(screen.getByTestId("synthetic-banner").textContent).toContain("SYNTHETIC TEST FIXTURE");
  });

  it("q3 renders BOTH contribution notes — the population difference is the honest cause, not multi-labeling", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-retention-gap-008b"));

    // published-output headline is 0 while the corpus-recall buckets hold 1
    // — the POPULATION note names that cause; the non-additive note alone
    // would misattribute it (pre-gate MINOR-2)
    expect(screen.getByTestId("benchmark-headline").textContent).toMatch(
      /0 of 1 declared Key Takeaways \(0%\)/,
    );
    const q3 = screen.getByTestId("q3");
    expect(within(q3).getByTestId("contribution-population-note").textContent).toContain(
      "corpus-recall matched takeaways",
    );
    expect(q3.textContent).toContain("NON-ADDITIVE"); // both notes present
    // and the actor clause of the contractual heading is answered here too
    expect(within(q3).getByTestId("actor-contribution-note").textContent).toContain(
      "versioned actor rosters",
    );
  });
});

describe("incomparable gulf lane (iran-gulf-unavailable-010b)", () => {
  it("q3 empty buckets carry the SYMMETRIC population note beside a matched published headline", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));
    // the 100% published headline sits above all-empty buckets (the match
    // came via a BH legacy digest — outside the corpus-recall population);
    // the note must explain the EMPTY direction, not only the exceed one
    expect(screen.getByTestId("benchmark-headline").textContent).toMatch(
      /1 of 1 declared Key Takeaways \(100%\)/,
    );
    const q3 = screen.getByTestId("q3");
    expect(within(q3).getAllByText("none").length).toBe(3); // all three buckets empty
    const note = within(q3).getByTestId("contribution-population-note");
    expect(note.textContent).toContain("can also be EMPTY while the published output matched");
    expect(note.textContent).toContain("legacy-only theater");
    expect(note.textContent).toContain("gated evidence view shows the actual contributors");
  });

  it("q5's corpus card refuses a bare 0% when EVERY unit is incomparable (register #8 H1 at report granularity)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));
    const q5 = screen.getByTestId("q5");
    // Gate-7 product MINOR-1: this card previously rendered a naked bold
    // "0 of 1 declared Key Takeaways (0%)" beside a 100% published card,
    // while the lane table on the same page refused exactly that reading
    expect(within(q5).getByTestId("corpus-recall-incomparable").textContent).toBe(
      "unavailable (incomparable evidence)",
    );
    expect(within(q5).getByTestId("corpus-incomparable-note").textContent).toContain(
      "must not be read as one",
    );
    expect(q5.textContent).not.toContain("0 of 1 declared Key Takeaways (0%)");
    // the published card still shows its REAL ratio — the qualifier is a
    // corpus-recall statement only
    expect(q5.textContent).toContain("1 of 1 declared Key Takeaways (100%)");
  });

  it("distinguishes an EMPTY eligible set from a genuine zero (opposite diagnoses)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "cc-state-zero-empty-015"));
    // zero candidates ever entered the comparison — a pipeline statement
    expect(screen.getAllByTestId("zero-eligible-qualifier")[0].textContent).toContain(
      "0 eligible claims in the corpus",
    );
    cleanup();
    // a scored zero WITH eligible candidates is an analytic miss: no qualifier
    render(await pageFor("russia-ukraine", "roca-quiet-day-010b"));
    expect(screen.queryByTestId("zero-eligible-qualifier")).toBeNull();
    expect(screen.getByTestId("q5").textContent).toContain("0 of 1 declared Key Takeaways (0%)");
  });

  it("does not send the analyst through a sign-in wall to an EMPTY evidence view", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "cc-state-zero-empty-015"));
    expect(screen.getByTestId("empty-evidence-note").textContent).toContain(
      "no evidence view to open",
    );
    expect(screen.queryByRole("link", { name: /Read the published claims/ })).toBeNull();
    cleanup();
    // a record WITH published claims still links
    render(await pageFor("russia-ukraine", "roca-ua-only-001b"));
    expect(screen.getByRole("link", { name: /Read the published claims/ })).toBeTruthy();
  });

  it("q7 contributor links carry the legacy-engine qualifier, like the overview", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));
    expect(screen.getByTestId("q7").textContent).toContain("legacy engine");
  });

  it("the Iran surface renders the per-series coexistence note (single IR row, not RU/UA rows)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));
    const note = screen.getByTestId("scoreboard-coexistence-note");
    expect(note.textContent).toContain("maps to a single IR row");
    expect(note.textContent).not.toContain("separate RU and UA rows");
  });

  it("method stamps carry a print-visible duplicate (a native details prints collapsed)", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));
    const printBlock = screen.getByTestId("conflict-methodology-print");
    expect(printBlock.className).toContain("hidden");
    expect(printBlock.className).toContain("print:block");
    expect(printBlock.textContent).toContain("methodology epoch");
    expect(printBlock.textContent).toContain("end anchored on");
    expect(printBlock.textContent).toContain("Versions: lanes");
    // …and the interactive details is print-hidden so stamps print once
    expect(screen.getByTestId("conflict-methodology").className).toContain("print:hidden");
  });

  it("renders the lane as unavailable (incomparable evidence), never a bare zero", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));

    const lane = screen.getByTestId("lane-incomparable-maritime");
    expect(lane.textContent).toBe("unavailable (incomparable evidence)");
    // the published-retention side still shows its real counts
    expect(screen.getByTestId("q2").textContent).toContain("1 matched");
    // timing note documents pair-weighting beside the medians
    expect(screen.getByTestId("timing-pair-weighted-note").textContent).toContain("pair-weighted");
  });
});

describe("publication gap (cc-publication-gap-002)", () => {
  it("renders the whole record as unavailable with NO 0% anywhere", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "cc-publication-gap-002"));

    const headline = screen.getByTestId("benchmark-headline");
    expect(headline.textContent).toContain("Unavailable — no report published for");
    expect(headline.textContent).toContain("2026-08-11");
    expect(headline.textContent).toContain("never a 0%");
    // no numeric score anywhere on a gap page (the ratio component always
    // renders "(NN%)"; the explanatory "never a 0%" sentences are words about
    // the rule, not scores)
    expect(document.body.textContent).not.toMatch(/\(\d+%\)/);
    expect(document.body.textContent).not.toMatch(/\d+ of \d+/);
    // the seven-section ORDER still holds on unavailable records (Gate-6
    // product NOTE-8: the same document-position walk as the overview test,
    // not presence alone)
    const ids = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
    const nodes = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(
        nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${ids[i - 1]} must precede ${ids[i]}`,
      ).toBeTruthy();
    }
  });
});

describe("teaser boundary", () => {
  it("renders counts/labels but never claim text or takeaway text", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-ua-only-001b"));
    expect(document.body.textContent).not.toContain("reportedly repelled");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
    // accessible tables carry captions
    expect(document.querySelectorAll("table caption").length).toBeGreaterThan(0);
  });
});
