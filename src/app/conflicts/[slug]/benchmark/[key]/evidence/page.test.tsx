// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

// AGENTS.md ruling 21: the page must call its own authorization gate BEFORE
// anything else — spied so this always-run suite fails if the call is deleted
// or reordered. The HTTP-level proof (bare GET + RSC: 1 against a production
// build) lives in src/integration/conflict-feature-off.itest.ts.
const gateMock = vi.hoisted(() => vi.fn(async () => ({ email: "user@example.com" })));
vi.mock("@/lib/gate", () => ({ requireAcceptedUser: gateMock }));

// Access-tier pin (contract §11): the feature-off guard runs IMMEDIATELY after
// the authorization gate, before data access.
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
    loadEvidenceView: vi.fn(actual.loadEvidenceView),
  };
});

import BenchmarkEvidencePage from "./page";

const pageFor = (slug: string, key: string) =>
  BenchmarkEvidencePage({ params: Promise.resolve({ slug, key }) });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  featureMock.mockImplementation(() => {
    throw new Error("FEATURE_OFF_TEST");
  });
});

async function providerSpy(): Promise<Mock> {
  const pv = await import("@/lib/conflicts/product-view");
  return pv.loadEvidenceView as unknown as Mock;
}

describe("page-level authorization gate", () => {
  it("calls requireAcceptedUser before the feature guard, both before any data access", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-ua-only-001b"));

    const spy = await providerSpy();
    expect(gateMock).toHaveBeenCalled();
    expect(featureMock).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      featureMock.mock.invocationCallOrder[0],
    );
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(spy.mock.invocationCallOrder[0]);
  });

  it("gates even the feature-off render: gate first, then the guard 404s, no data touched", async () => {
    await expect(pageFor("russia-ukraine", "roca-ua-only-001b")).rejects.toThrow(
      "FEATURE_OFF_TEST",
    );
    expect(gateMock).toHaveBeenCalled();
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      featureMock.mock.invocationCallOrder[0],
    );
    expect(await providerSpy()).not.toHaveBeenCalled();
  });
});

describe("the gated what-changed view", () => {
  it("renders published claim text with hedge, origin digest, timestamps, and source trail", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-ua-only-001b"));

    expect(document.body.textContent).toContain(
      "reportedly repelled Russian mechanized assaults",
    );
    expect(document.body.textContent).toContain("from the UA · military digest");
    expect(document.body.textContent).toContain("hedge: claimed");
    expect(document.body.textContent).toContain("frontline-wire.example");
    expect(document.body.textContent).toContain("earliest BNOW ingest");
    // matched takeaway identified by id + lane, NEVER by takeaway text
    expect(document.body.textContent).toContain("u0");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
    // read-only union framing (no new synthesis)
    expect(document.body.textContent).toContain("not a new conflict digest");
  });

  it("labels legacy-engine contributions on the gulf record", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "iran-gulf-unavailable-010b"));
    expect(document.body.textContent).toContain("legacy engine");
    expect(document.body.textContent).toContain("from the BH · military digest");
  });

  it("renders an empty union as explicitly empty (retention gap), never invented", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", "roca-retention-gap-008b"));
    expect(screen.getByTestId("evidence-empty").textContent).toContain(
      "No published digest claim",
    );
  });

  it("renders a publication gap as unavailable, not an empty list", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("iran-regional", "cc-publication-gap-002"));
    expect(document.body.textContent).toContain("unavailable");
    expect(screen.queryByTestId("evidence-empty")).toBeNull();
  });

  it("404s an unknown key after the gates", async () => {
    featureMock.mockImplementation(() => {});
    await expect(pageFor("russia-ukraine", "no-such-key")).rejects.toThrow("TEST_NOT_FOUND");
    expect(gateMock).toHaveBeenCalled();
  });
});
