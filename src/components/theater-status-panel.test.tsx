// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeT } from "@/i18n/dictionaries";
import { TheaterStatusPanel, type TheaterStatusEntry } from "./theater-status-panel";

const t = makeT("en");

const FIXTURE_ENTRIES: TheaterStatusEntry[] = [
  {
    iso2: "ru",
    name: "Russia",
    lastFetch: "2026-07-11T09:45:00.000Z",
    docs24h: 1572,
    lastDigestAt: "2026-07-11T04:02:00.000Z",
    digestHref: "/digests/ru/2026-07-11",
    latestDate: "2026-07-11",
  },
  {
    iso2: "ua",
    name: "Ukraine",
    lastFetch: "2026-07-11T08:12:00.000Z",
    docs24h: 664,
    lastDigestAt: "2026-07-11T04:03:00.000Z",
    digestHref: "/digests/ua/2026-07-11",
    latestDate: "2026-07-11",
  },
  {
    iso2: "ir",
    name: "Iran",
    lastFetch: null,
    docs24h: 0,
    lastDigestAt: null,
    digestHref: "/countries#ir",
    latestDate: null,
  },
];

afterEach(cleanup);

function renderPanel(overrides: Partial<Parameters<typeof TheaterStatusPanel>[0]> = {}) {
  return render(
    <TheaterStatusPanel
      locale="en"
      t={t}
      entries={FIXTURE_ENTRIES}
      nextUpdateLabel="~Jul 12, 02:00 ET"
      xPaused={false}
      {...overrides}
    />,
  );
}

describe("theater cards", () => {
  it("renders one card per theater entry", () => {
    renderPanel();
    for (const name of ["Russia", "Ukraine", "Iran"]) {
      expect(screen.getByRole("heading", { name, level: 3 })).toBeTruthy();
    }
  });

  it("renders the four label/value rows and a formatted ET timestamp per card", () => {
    renderPanel();
    const heading = screen.getByRole("heading", { name: "Russia", level: 3 });
    const card = heading.closest("div")!;
    expect(within(card).getByText("Data current as of")).toBeTruthy();
    expect(within(card).getByText("Documents, last 24h")).toBeTruthy();
    expect(within(card).getByText("Digest generated")).toBeTruthy();
    expect(within(card).getByText("Next update")).toBeTruthy();
    expect(within(card).getByText("1,572")).toBeTruthy();
    // Formatted with Intl in America/New_York and labeled ET — never a bare UTC string.
    expect(card.textContent).toContain("ET");
    expect(card.textContent).not.toContain("2026-07-11T09:45:00.000Z");
  });

  it("links the digest row to digestHref", () => {
    renderPanel();
    const heading = screen.getByRole("heading", { name: "Ukraine", level: 3 });
    const card = heading.closest("div")!;
    const link = within(card).getByRole("link");
    expect(link.getAttribute("href")).toBe("/digests/ua/2026-07-11");
  });

  it("shows honest no-data fallbacks for a theater with nothing yet, instead of a bad date", () => {
    renderPanel();
    const heading = screen.getByRole("heading", { name: "Iran", level: 3 });
    const card = heading.closest("div")!;
    expect(within(card).getByText("no data yet")).toBeTruthy();
    expect(within(card).getByText("not yet generated")).toBeTruthy();
    expect(card.textContent).not.toContain("Invalid Date");
    const link = within(card).getByRole("link");
    expect(link.getAttribute("href")).toBe("/countries#ir");
  });

  it("renders the panel-global next-update label on every card", () => {
    renderPanel();
    expect(screen.getAllByText("~Jul 12, 02:00 ET")).toHaveLength(3);
  });
});

describe("X-paused footnote", () => {
  it("is absent when xPaused is false", () => {
    renderPanel({ xPaused: false });
    expect(screen.queryByText(/X ingestion paused/)).toBeNull();
  });

  it("appears exactly once, panel-global, when xPaused is true", () => {
    renderPanel({ xPaused: true });
    expect(screen.getAllByText(/X ingestion paused/)).toHaveLength(1);
  });
});

describe("no marketing copy", () => {
  it("carries no CTA links, arrows, or sales language — only operational data", () => {
    renderPanel();
    const section = screen.getByRole("region");
    expect(section.textContent).not.toMatch(/→/);
    expect(section.textContent).not.toMatch(/subscribe|founding subscriber/i);
    // Every link on the panel is a digest deep link, never a pricing/subscribe CTA.
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/pricing");
    }
  });
});
