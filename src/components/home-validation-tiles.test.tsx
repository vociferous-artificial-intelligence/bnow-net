// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  HomeValidationTiles,
  type TheaterValidationEntry,
} from "./home-validation-tiles";

afterEach(cleanup);

// Test-local translator: the home.validation.* keys aren't merged into
// src/i18n/dictionaries.ts yet (that's the supervisor's job — see house style in
// claim-sources.test.tsx), so we assert on which KEY renders, not on real dictionary
// prose. Identity fallback matches makeT's own key-as-last-resort behavior.
const t = (key: string) => key;

const FIXTURE_ENTRIES: TheaterValidationEntry[] = [
  { iso2: "ru", name: "Russia", coveragePct: 60, timelinessHours: 21.1, runAt: "2026-07-11T07:01:20.000Z" },
  { iso2: "ua", name: "Ukraine", coveragePct: 0, timelinessHours: null, runAt: "2026-07-11T07:01:22.000Z" },
  { iso2: "ir", name: "Iran", coveragePct: 50, timelinessHours: 35.4, runAt: "2026-07-11T07:01:27.000Z" },
];

function renderTiles(overrides: Partial<Parameters<typeof HomeValidationTiles>[0]> = {}) {
  return render(
    <HomeValidationTiles
      locale="en"
      t={t}
      entries={FIXTURE_ENTRIES}
      corroboratedShare={{ corroborated: 25, total: 49 }}
      {...overrides}
    />,
  );
}

describe("per-theater coverage", () => {
  it("renders each theater's coverage percent, including a true zero", () => {
    renderTiles();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    // ua's real coverage is 0 (zero-match day), not a missing-data state — must render
    // "0%", never the null fallback.
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.queryByText("home.validation.not_validated")).toBeNull();
  });

  it("shows the honest not-yet-validated fallback for a null coverage value, never a fake number", () => {
    const entries: TheaterValidationEntry[] = [
      { iso2: "ru", name: "Russia", coveragePct: null, timelinessHours: null, runAt: null },
    ];
    renderTiles({ entries });
    expect(screen.getByText("home.validation.not_validated")).toBeTruthy();
  });

  it("labels each tile with its theater name", () => {
    renderTiles();
    expect(screen.getByText(/Russia/)).toBeTruthy();
    expect(screen.getByText(/Ukraine/)).toBeTruthy();
    expect(screen.getByText(/Iran/)).toBeTruthy();
  });
});

describe("median info lead", () => {
  it("computes the median across theaters with a non-null timeliness value", () => {
    renderTiles();
    // median(21.1, 35.4) = 28.25 -> "+28.3h" (ua excluded: null timeliness on its zero-day)
    expect(screen.getByText("+28.3h")).toBeTruthy();
  });

  it("signs a negative median without a leading '+'", () => {
    const entries: TheaterValidationEntry[] = [
      { iso2: "ru", name: "Russia", coveragePct: 10, timelinessHours: -4, runAt: null },
    ];
    renderTiles({ entries });
    expect(screen.getByText("-4.0h")).toBeTruthy();
  });

  it("falls back honestly when no theater has a validated lead yet", () => {
    const entries: TheaterValidationEntry[] = FIXTURE_ENTRIES.map((e) => ({
      ...e,
      timelinessHours: null,
    }));
    renderTiles({ entries });
    expect(screen.getAllByText("home.validation.not_computed").length).toBeGreaterThan(0);
  });
});

describe("last validated", () => {
  it("renders the latest run_at across theaters, formatted with an ET label", () => {
    renderTiles();
    // max(runAt) among the fixture entries is Iran's 07:01:27Z.
    expect(screen.getByText(/ET$/)).toBeTruthy();
  });

  it("renders the honest fallback instead of 'Invalid Date' when no theater has run_at", () => {
    const entries: TheaterValidationEntry[] = FIXTURE_ENTRIES.map((e) => ({ ...e, runAt: null }));
    const { container } = renderTiles({ entries });
    expect(container.textContent).not.toContain("Invalid Date");
    expect(screen.getAllByText("home.validation.not_computed").length).toBeGreaterThan(0);
  });
});

describe("corroborated share", () => {
  it("renders the percent and the raw fraction", () => {
    renderTiles();
    expect(screen.getByText("51%")).toBeTruthy();
    expect(screen.getByText(/25\/49/)).toBeTruthy();
  });

  it("renders a real 0% (not the null fallback) when nothing was corroborated", () => {
    // Non-zero coverage on every theater so the corroborated-share tile's "0%" is the
    // only "0%" text node in the tree — isolates the assertion from ua's own real zero.
    const entries: TheaterValidationEntry[] = FIXTURE_ENTRIES.map((e) => ({
      ...e,
      coveragePct: e.coveragePct === 0 ? 5 : e.coveragePct,
    }));
    renderTiles({ entries, corroboratedShare: { corroborated: 0, total: 10 } });
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("renders the honest not-yet-computed fallback when null (no digest today yet)", () => {
    renderTiles({ corroboratedShare: null });
    expect(screen.getAllByText("home.validation.not_computed").length).toBeGreaterThan(0);
  });
});

describe("scoreboard link", () => {
  it("links to /scoreboard, reusing the existing scoreboard CTA copy key", () => {
    renderTiles();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/scoreboard");
    expect(link.textContent).toBe("home.cta.scoreboard");
  });
});

describe("truth-in-UI wording", () => {
  it("never renders the word 'unsupported' anywhere in the DOM", () => {
    const { container } = renderTiles();
    expect(container.textContent?.toLowerCase()).not.toContain("unsupported");
  });
});
