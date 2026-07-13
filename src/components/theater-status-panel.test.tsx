// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeT } from "@/i18n/dictionaries";
import { TheaterStatusPanel, type TheaterStatusEntry } from "./theater-status-panel";

const t = makeT("en");

// Fixture instant: 10:45 AM ET on 2026-07-12 (the operator's screenshot hour).
// The cadence in UTC: intraday 04:00/10:00/19:30, finalize 02:00 D+1 (10 PM ET).
const NOW_ISO = "2026-07-12T14:45:00.000Z";
const NEXT_INTRADAY_ISO = "2026-07-12T19:30:00.000Z"; // 3:30 PM ET
const NEXT_FINALIZE_ISO = "2026-07-13T02:00:00.000Z"; // 10:00 PM ET

const FIXTURE_ENTRIES: TheaterStatusEntry[] = [
  {
    // Today's bucket, mid-morning: last write was the 10:05 UTC eu-midday intraday run.
    iso2: "ru",
    name: "Russia",
    lastFetch: "2026-07-12T14:40:00.000Z",
    docs24h: 1572,
    latestDate: "2026-07-12",
    lastGeneratedAt: "2026-07-12T10:05:09.000Z",
    claimsForLatest: 14,
    digestHref: "/digests/ru/2026-07-12",
    scoreboardHref: "/scoreboard/ru/2026-07-11",
  },
  {
    // Stale: no digest yet for the ET day; latest bucket is yesterday's, finalized
    // at 02:02 UTC (10:02 PM ET yesterday). Its claims count is NONZERO — the R2
    // hard-rule case: the count must be labeled with the bucket's own date.
    iso2: "ua",
    name: "Ukraine",
    lastFetch: "2026-07-12T08:12:00.000Z",
    docs24h: 664,
    latestDate: "2026-07-11",
    lastGeneratedAt: "2026-07-12T02:02:00.000Z",
    claimsForLatest: 42,
    digestHref: "/digests/ua/2026-07-11",
    scoreboardHref: null,
  },
  {
    // Nothing at all yet.
    iso2: "ir",
    name: "Iran",
    lastFetch: null,
    docs24h: 0,
    latestDate: null,
    lastGeneratedAt: null,
    claimsForLatest: 0,
    digestHref: "/countries/ir",
    scoreboardHref: null,
  },
];

afterEach(cleanup);

function renderPanel(overrides: Partial<Parameters<typeof TheaterStatusPanel>[0]> = {}) {
  return render(
    <TheaterStatusPanel
      locale="en"
      t={t}
      entries={FIXTURE_ENTRIES}
      nowIso={NOW_ISO}
      nextIntradayIso={NEXT_INTRADAY_ISO}
      nextFinalizeIso={NEXT_FINALIZE_ISO}
      xPaused={false}
      {...overrides}
    />,
  );
}

function card(name: string): HTMLElement {
  return screen.getByRole("heading", { name, level: 3 }).closest("div")!;
}

// Intl may emit a narrow no-break space before AM/PM — normalize before matching.
function text(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/[  ]/g, " ");
}

describe("theater cards", () => {
  it("renders one card per theater entry", () => {
    renderPanel();
    for (const name of ["Russia", "Ukraine", "Iran"]) {
      expect(screen.getByRole("heading", { name, level: 3 })).toBeTruthy();
    }
  });

  it("renders the label rows with ET-formatted timestamps, never raw UTC strings", () => {
    renderPanel();
    const ru = card("Russia");
    expect(within(ru).getByText("Data current as of")).toBeTruthy();
    expect(within(ru).getByText("Documents, last 24h")).toBeTruthy();
    expect(within(ru).getByText("Latest digest")).toBeTruthy();
    expect(within(ru).getByText("Next update")).toBeTruthy();
    expect(within(ru).getByText("1,572")).toBeTruthy();
    expect(text(ru)).toContain("Jul 12, 10:40 AM ET"); // lastFetch in ET
    expect(ru.textContent).not.toContain("2026-07-12T14:40:00.000Z");
  });

  it("today+intraday: names the bucket, stage and write time, and phrases both next fires", () => {
    renderPanel();
    const ru = card("Russia");
    const link = within(ru).getAllByRole("link")[0];
    expect(link.getAttribute("href")).toBe("/digests/ru/2026-07-12");
    expect(text(link as HTMLElement)).toBe("2026-07-12 · intraday 6:05 AM ET");
    // Claims row labeled with the SAME bucket the status names.
    expect(within(ru).getByText("Digest claims, 2026-07-12")).toBeTruthy();
    expect(within(ru).getByText("14")).toBeTruthy();
    expect(text(ru)).toContain("~3:30 PM ET · final ~10:00 PM ET");
    expect(text(ru)).not.toContain("no digest yet today");
  });

  it("today+final: after the 10 PM ET finalize the next fire is the next day's first intraday", () => {
    renderPanel({
      entries: [
        {
          ...FIXTURE_ENTRIES[0],
          lastGeneratedAt: "2026-07-13T02:02:00.000Z", // 10:02 PM ET Jul 12
        },
      ],
      nowIso: "2026-07-13T03:00:00.000Z", // 11:00 PM ET Jul 12
      nextIntradayIso: "2026-07-13T04:00:00.000Z", // 12:00 AM ET Jul 13
      nextFinalizeIso: "2026-07-14T02:00:00.000Z",
    });
    const ru = card("Russia");
    expect(text(ru)).toContain("2026-07-12 · final 10:02 PM ET");
    expect(text(ru)).toContain("~12:00 AM ET");
    // Post-final, no "final ~..." future promise for a bucket already final.
    expect(text(ru)).not.toContain("final ~");
  });

  it("R2 hard rule: a stale card labels its nonzero claims with the bucket's own date, never an ambient 'today'", () => {
    renderPanel();
    const ua = card("Ukraine");
    // The status is honest about the gap...
    expect(within(ua).getByText("no digest yet today")).toBeTruthy();
    // ...the digest row names yesterday's bucket as final...
    expect(text(ua)).toContain("2026-07-11 · final 10:02 PM ET");
    // ...and the 42 claims are labeled with THAT bucket, not "today".
    expect(within(ua).getByText("Digest claims, 2026-07-11")).toBeTruthy();
    expect(within(ua).getByText("42")).toBeTruthy();
    expect(ua.textContent).not.toContain("today:"); // no unlabeled today-count
    expect(ua.textContent).not.toContain("not yet generated");
  });

  it("no-digest-ever theater: honest fallbacks, no claims row at all, no Invalid Date", () => {
    renderPanel();
    const ir = card("Iran");
    expect(within(ir).getByText("no data yet")).toBeTruthy();
    expect(within(ir).getByText("none yet")).toBeTruthy();
    // No claims row: there is no bucket to key a count to.
    expect(text(ir)).not.toContain("Digest claims");
    expect(ir.textContent).not.toContain("Invalid Date");
    // Two links now: the inner "none yet" row link, and the whole-card overlay
    // link (below) — both point at the same honest fallback href. Index [0] is
    // the inner row link (the overlay renders last in DOM; see "whole-card
    // stretched link" below for its own coverage).
    const link = within(ir).getAllByRole("link")[0];
    expect(link.getAttribute("href")).toBe("/countries/ir");
  });

  it("renders an honest dash when neither next-fire instant is derivable", () => {
    renderPanel({ nextIntradayIso: null, nextFinalizeIso: null });
    const ru = card("Russia");
    const nextDt = within(ru).getByText("Next update");
    expect(nextDt.nextElementSibling?.textContent).toBe("—");
  });
});

describe("scoreboard link", () => {
  it("renders when the theater has a validation run (scoreboardHref set)", () => {
    renderPanel();
    const link = within(card("Russia")).getByRole("link", { name: "scoreboard →" });
    expect(link.getAttribute("href")).toBe("/scoreboard/ru/2026-07-11");
  });

  it("is omitted when the theater has no validation run yet (scoreboardHref null)", () => {
    renderPanel();
    expect(within(card("Ukraine")).queryByText("scoreboard →")).toBeNull();
  });
});

describe("whole-card stretched link (W2)", () => {
  it("gives every card an overlay link to its digestHref with an aria-label naming the theater", () => {
    renderPanel();
    for (const entry of FIXTURE_ENTRIES) {
      const overlay = screen.getByRole("link", {
        name: new RegExp(`^${entry.name} — `),
      });
      expect(overlay.getAttribute("href")).toBe(entry.digestHref);
      expect(overlay.className).toContain("absolute");
      expect(overlay.className).toContain("inset-0");
    }
  });

  it("keeps the inner digest-status link and the scoreboard link above the overlay (z-10)", () => {
    renderPanel();
    const ru = card("Russia");
    // The inner "Latest digest" row link — not the overlay (which has no
    // visible text, only an aria-label) — must carry the stacking class.
    const digestLink = within(ru)
      .getAllByRole("link")
      .find((l) => l.textContent?.includes("2026-07-12 · intraday"));
    expect(digestLink?.className).toContain("z-10");
    const scoreboardLink = within(ru).getByRole("link", { name: "scoreboard →" });
    expect(scoreboardLink.className).toContain("z-10");
  });

  it("does not nest an <a> inside another <a> (overlay is a sibling, not a wrapper)", () => {
    renderPanel();
    const ru = card("Russia");
    for (const a of within(ru).getAllByRole("link")) {
      expect(a.querySelector("a")).toBeNull();
    }
  });
});

describe("X-paused footnote (R9: semantics unchanged)", () => {
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
  it("carries no sales language or pricing CTA — only operational links and data", () => {
    renderPanel();
    const section = screen.getByRole("region");
    expect(section.textContent).not.toMatch(/subscribe|founding subscriber/i);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/pricing");
    }
  });
});
