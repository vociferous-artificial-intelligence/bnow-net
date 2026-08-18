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

// The feature-off guard is spied so this always-run suite fails if the call is
// deleted or reordered behind data access (prompt §14 guard-order rule; the
// HTTP-level proof lives in src/integration/conflict-feature-off.itest.ts).
const featureMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("FEATURE_OFF_TEST");
  }),
);
vi.mock("@/lib/conflicts/feature", () => ({ requireConflictsUi: featureMock }));

// The real fixture-backed provider, wrapped in spies so call ORDER against the
// guard is assertable. No DB anywhere on this path.
vi.mock("@/lib/conflicts/product-view", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conflicts/product-view")>();
  return {
    ...actual,
    loadConflictProductView: vi.fn(actual.loadConflictProductView),
  };
});

import ConflictsIndexPage from "./page";

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
  it("blocks the page before ANY conflict data access", async () => {
    await expect(ConflictsIndexPage()).rejects.toThrow("FEATURE_OFF_TEST");
    expect(featureMock).toHaveBeenCalled();
    expect(await providerSpy()).not.toHaveBeenCalled();
  });

  it("runs before the provider when the flag is on", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());
    const spy = await providerSpy();
    expect(spy).toHaveBeenCalled();
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(spy.mock.invocationCallOrder[0]);
  });
});

describe("index rendering (flag on)", () => {
  it("lists both conflicts with teaser-tier content only", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Conflicts" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Russia–Ukraine War" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Iran and Regional Conflict" })).toBeTruthy();
    // synthetic-corpus banner (truth-in-UI, ruling 3)
    expect(screen.getByTestId("synthetic-banner").textContent).toContain("SYNTHETIC TEST FIXTURE");
    // terminology explainer present at first use
    expect(screen.getByTestId("terminology-explainer")).toBeTruthy();
    // teaser tier: NO claim text, NO reference-takeaway text
    expect(document.body.textContent).not.toContain("reportedly repelled");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
  });

  it("shows n/d beside every coverage percentage", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());
    // RU featured (2026-08-13): 1 of 1 (100%); the ratio always carries n/d
    expect(document.body.textContent).toMatch(/1 of 1 declared Key Takeaways \(100%\)/);
  });
});
