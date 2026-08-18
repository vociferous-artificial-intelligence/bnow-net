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

describe("incomparable gulf lane (iran-gulf-unavailable-010b)", () => {
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
    // the seven-section order still holds on unavailable records
    const ids = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
    for (const id of ids) expect(screen.getByTestId(id)).toBeTruthy();
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
