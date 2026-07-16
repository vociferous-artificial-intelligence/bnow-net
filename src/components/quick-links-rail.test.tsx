// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuickLinksRail, type QuickLinksTheaterEntry } from "./quick-links-rail";

const t = (key: string) => key;

afterEach(cleanup);

const THEATERS: QuickLinksTheaterEntry[] = [
  { iso2: "ru", name: "Russia", latestDate: "2026-07-12", prevDate: "2026-07-11" },
  { iso2: "ua", name: "Ukraine", latestDate: "2026-07-12", prevDate: "2026-07-10" },
  { iso2: "ir", name: "Iran", latestDate: null, prevDate: null },
];

describe("quick links rail", () => {
  it("renders the label and each present theater's name", () => {
    const { container } = render(<QuickLinksRail t={t} theaters={THEATERS} />);
    expect(container.textContent).toContain("home.quicklinks.label");
    expect(container.textContent).toContain("Russia");
    expect(container.textContent).toContain("Ukraine");
  });

  it("renders latest and previous digest links per theater, in order, with correct hrefs", () => {
    render(<QuickLinksRail t={t} theaters={THEATERS} />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    // R5 (2026-07-12): no /registry link — the source registry is admin-only now.
    expect(hrefs).toEqual([
      "/digests/ru/2026-07-12",
      "/digests/ru/2026-07-11",
      "/digests/ua/2026-07-12",
      "/digests/ua/2026-07-10",
      "/scoreboard",
      "/signals",
      "/search",
    ]);
  });

  it("names the country and both dates without the word digest (2026-07-16)", () => {
    const { container } = render(<QuickLinksRail t={t} theaters={THEATERS} />);
    // The rail sits under a "Quick links" label on a page full of digests; the word
    // was redundant. Country + both linked dates still carry the meaning.
    expect(container.textContent).not.toContain("home.quicklinks.digest");
    expect(container.textContent).toContain("Russia: 2026-07-12 · 2026-07-11");
    expect(container.textContent).toContain("Ukraine: 2026-07-12 · 2026-07-10");
  });

  it("omits a theater entirely when it has no digests at all", () => {
    const { container } = render(<QuickLinksRail t={t} theaters={THEATERS} />);
    expect(container.textContent).not.toContain("Iran");
  });

  it("omits the previous-date link when only a latest date exists, without dropping the theater", () => {
    const oneDate: QuickLinksTheaterEntry[] = [
      { iso2: "ru", name: "Russia", latestDate: "2026-07-12", prevDate: null },
    ];
    render(<QuickLinksRail t={t} theaters={oneDate} />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(["/digests/ru/2026-07-12", "/scoreboard", "/signals", "/search"]);
  });

  it("always renders the scoreboard, signals, and search links even with zero theaters, and never a registry link (R5)", () => {
    render(<QuickLinksRail t={t} theaters={[]} />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(["/scoreboard", "/signals", "/search"]);
    expect(hrefs).not.toContain("/registry");
  });
});
