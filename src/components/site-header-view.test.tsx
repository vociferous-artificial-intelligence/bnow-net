// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localesByPriority, makeT } from "@/i18n/dictionaries";
import { buildSiteNav } from "@/lib/nav/site-nav";
import { SiteHeaderView, type HeaderLabels } from "./site-header-view";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const t = makeT("en");
const labels: HeaderLabels = {
  language: "Language",
  account: "Account",
  signOut: "Sign out",
  signIn: "Sign in",
  menu: "Menu",
  close: "Close",
  mainNav: "Main",
};

function renderHeader({ signedIn = false, pathname = "/", locale = "en" } = {}) {
  route.pathname = pathname;
  const nav = buildSiteNav(t, { signedIn, email: signedIn ? "gregory@example.com" : null });
  const signOutAction = vi.fn();
  // A fresh element each time: re-rendering the *same* element object makes React bail
  // out, so the component would never observe the new pathname.
  const ui = () => (
    <SiteHeaderView
      nav={nav}
      locale={locale}
      locales={localesByPriority()}
      labels={labels}
      signOutAction={signOutAction}
    />
  );
  const utils = render(ui());
  // A soft navigation: the header is mounted in the root layout, so it re-renders with a
  // new pathname rather than remounting. Its state survives — which is the whole risk.
  const navigate = (to: string) =>
    act(() => {
      route.pathname = to;
      utils.rerender(ui());
    });
  return { ...utils, navigate };
}

const mainNav = () => screen.getByRole("navigation", { name: "Main" });

afterEach(cleanup);

describe("auth slot", () => {
  it("offers Sign in and no account menu when signed out", () => {
    renderHeader({ signedIn: false });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/signin");
    expect(screen.queryByRole("button", { name: "gregory@example.com" })).toBeNull();
  });

  it("swaps Sign in for an account menu with the email, Account and Sign out", async () => {
    const user = userEvent.setup();
    renderHeader({ signedIn: true });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();

    const trigger = screen.getByRole("button", { name: "gregory@example.com" });
    expect(trigger.textContent).toContain("G"); // avatar initial
    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "gregory@example.com" });
    expect(within(menu).getByRole("menuitem", { name: "Account" }).getAttribute("href")).toBe("/account");
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    expect(menu.textContent).toContain("gregory@example.com");
  });
});

describe("commercial entry (private analyst beta)", () => {
  it("renders Request access as a button-styled CTA -> /access when signed out", () => {
    renderHeader({ signedIn: false });
    const access = within(mainNav()).getByRole("link", { name: "Request access" });
    expect(access.className).toContain("bg-blue-600");
    expect(access.getAttribute("href")).toBe("/access");
  });

  it("renders the signed-out mobile CTA strip from the entry href, not a hardcoded route", () => {
    const { container } = renderHeader({ signedIn: false });
    // The md:hidden strip under the bar: same label, same /access destination.
    const strips = Array.from(container.querySelectorAll('a[href="/access"]')).filter(
      (a) => a.textContent === "Request access",
    );
    expect(strips.length).toBeGreaterThanOrEqual(2); // desktop CTA + mobile strip
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });

  // Measured against the shipped oklch palette and the real backgrounds (#ffffff /
  // #0a0a0a page, gray-950 drawer/menu panel): blue-600 is 5.25:1 on white but only
  // 3.77:1 on the near-black theme, so a bare blue-600 fails dark mode. The 700/300
  // pair is 6.83:1 light and 10.92:1 dark. Pinned in both directions here because a
  // half-fix (light shade only) reintroduces the dark-mode failure silently.
  it("styles the signed-out mobile CTA with a pair that passes in both themes", () => {
    const { container } = renderHeader({ signedIn: false });
    const strip = Array.from(container.querySelectorAll('a[href="/access"]')).find((a) =>
      a.className.includes("md:hidden") || a.closest(".md\\:hidden"),
    )!;
    expect(strip.className).toContain("text-blue-700");
    expect(strip.className).toContain("dark:text-blue-300");
    expect(strip.className).not.toContain("text-blue-600");
  });

  it("shows NO commercial entry at all once signed in — no pricing, no request access", () => {
    const { container } = renderHeader({ signedIn: true });
    expect(within(mainNav()).queryByRole("link", { name: "Request access" })).toBeNull();
    expect(within(mainNav()).queryByRole("link", { name: "Pricing" })).toBeNull();
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
    expect(container.querySelector('a[href="/access"]')).toBeNull();
  });
});

describe("top-level links (IA refinement 2026-07-12: Product retired)", () => {
  it("surfaces Signals and Ask as their own top-level links, not a Product dropdown", () => {
    renderHeader();
    // No Product trigger exists anymore.
    expect(within(mainNav()).queryByRole("button", { name: "Product" })).toBeNull();
    // Signals and Ask are plain links straight to their destinations.
    expect(within(mainNav()).getByRole("link", { name: "Signals" }).getAttribute("href")).toBe("/signals");
    expect(within(mainNav()).getByRole("link", { name: "Ask" }).getAttribute("href")).toBe("/ask");
  });
});

describe("dropdown contents", () => {
  it("lists the live theaters as real per-country pages, then the index, under Coverage", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(within(mainNav()).getByRole("button", { name: "Coverage" }));

    const items = within(screen.getByRole("menu", { name: "Coverage" })).getAllByRole("menuitem");
    expect(items.map((i) => i.getAttribute("href"))).toEqual([
      "/countries/ru",
      "/countries/ua",
      "/countries/ir",
      "/countries",
    ]);
    // Renamed 2026-07-16 off the internal "theater" vocabulary; ru/ua/ir stay the
    // only promoted countries and /countries stays the final item.
    expect(items.at(-1)?.textContent).toBe("More countries");
    expect(items.map((i) => i.textContent)).not.toContain("All theaters");
  });

  it("routes Solutions personas at the truthful pages, with signals no longer duplicated", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(within(mainNav()).getByRole("button", { name: "Solutions" }));

    const items = within(screen.getByRole("menu", { name: "Solutions" })).getAllByRole("menuitem");
    expect(
      Object.fromEntries(items.map((i) => [i.textContent, i.getAttribute("href")])),
    ).toEqual({
      "Sanctions & trade evasion": "/trade",
      "Commodity & supply-chain risk": "/critical-materials",
      // Renamed 2026-07-16: states the scope instead of making the reader infer
      // that /datadark is Russia-specific. The href is unchanged.
      "Russia data opacity": "/datadark",
    });
    // The old Political-risk>/signals duplicate is gone.
    expect(items.map((i) => i.getAttribute("href"))).not.toContain("/signals");
  });
});

describe("dropdown accessibility", () => {
  // Coverage is the representative dropdown (Product was retired 2026-07-12).
  it("keeps aria-expanded in sync", async () => {
    const user = userEvent.setup();
    renderHeader();
    const trigger = within(mainNav()).getByRole("button", { name: "Coverage" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("opens onto the first item with ArrowDown", async () => {
    const user = userEvent.setup();
    renderHeader();
    within(mainNav()).getByRole("button", { name: "Coverage" }).focus();
    await user.keyboard("{ArrowDown}");

    const items = within(screen.getByRole("menu", { name: "Coverage" })).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
  });

  it("cycles items with the arrow keys", async () => {
    const user = userEvent.setup();
    renderHeader();
    within(mainNav()).getByRole("button", { name: "Coverage" }).focus();
    await user.keyboard("{ArrowDown}");
    const items = within(screen.getByRole("menu", { name: "Coverage" })).getAllByRole("menuitem");

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items[items.length - 1]);
    await user.keyboard("{ArrowDown}"); // wraps
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{ArrowUp}"); // wraps back
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderHeader();
    const trigger = within(mainNav()).getByRole("button", { name: "Coverage" });

    // Open with the keyboard, so focus really leaves the trigger and lands on an item.
    // Opening by click would leave focus on the trigger and make the assertion below
    // pass even if focus were never restored.
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    const items = within(screen.getByRole("menu", { name: "Coverage" })).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Coverage" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays closed when the user navigates back to the path it was opened on", async () => {
    const user = userEvent.setup();
    const { navigate } = renderHeader({ pathname: "/access" });
    const trigger = within(mainNav()).getByRole("button", { name: "Coverage" });

    await user.click(trigger); // opened while on /pricing
    expect(screen.getByRole("menu", { name: "Coverage" })).toBeTruthy();

    navigate("/countries/ru"); // followed a menu link
    expect(screen.queryByRole("menu", { name: "Coverage" })).toBeNull();

    navigate("/access"); // browser Back — no pointer or key event at all
    expect(screen.queryByRole("menu", { name: "Coverage" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when focus leaves it, so two menus can never be open at once", async () => {
    const user = userEvent.setup();
    renderHeader();
    const nav = within(mainNav());
    const coverage = nav.getByRole("button", { name: "Coverage" });

    coverage.focus();
    await user.keyboard("{ArrowDown}"); // opens Coverage, focus lands on its first item
    expect(screen.getByRole("menu", { name: "Coverage" })).toBeTruthy();

    // Move focus away to the other dropdown without touching the panel's own Tab handler.
    await act(async () => nav.getByRole("button", { name: "Solutions" }).focus());
    expect(screen.queryByRole("menu", { name: "Coverage" })).toBeNull();
    expect(coverage.getAttribute("aria-expanded")).toBe("false");
  });

  // F2 (2026-07-13): the production finding "two dropdowns open at once" came from a
  // synthetic HTMLElement.click() probe. Real user input cannot reproduce it — a
  // trusted pointer sequence fires pointerdown first (the outside-pointerdown
  // listener closes the other menu before the click toggles this one), and the
  // keyboard path moves focus (the focusout handler closes it). Both are pinned
  // here with trusted-event simulation.
  it("REAL pointer input on a second trigger closes the first menu — never two open", async () => {
    const user = userEvent.setup(); // fires pointerdown -> mousedown -> click, like a real pointer
    renderHeader();
    const nav = within(mainNav());

    await user.click(nav.getByRole("button", { name: "Coverage" }));
    expect(screen.getByRole("menu", { name: "Coverage" })).toBeTruthy();

    await user.click(nav.getByRole("button", { name: "Solutions" }));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Solutions" })).toBeTruthy();
    expect(screen.queryByRole("menu", { name: "Coverage" })).toBeNull();
  });

  it("real pointer input keeps account/language menus exclusive with nav dropdowns too", async () => {
    const user = userEvent.setup();
    renderHeader({ signedIn: true });
    const nav = within(mainNav());

    await user.click(nav.getByRole("button", { name: "Coverage" }));
    await user.click(screen.getByRole("button", { name: "Language" }));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Language" })).toBeTruthy();
  });

  it("documents the synthetic-.click() gap: a click with NO pointerdown and NO focus move bypasses both close paths", () => {
    // fireEvent.click models HTMLElement.click(): no pointerdown, no focus change.
    // This is the ONLY input shape that yields two open menus, and it is not a
    // shape real pointers, keyboards, or (in practice) screen readers emit —
    // NVDA/VoiceOver activations move focus, which the focusout handler catches.
    // Per the sprint ruling we document the repro instead of adding cross-instance
    // global state for an input no user can produce.
    renderHeader();
    const nav = within(mainNav());

    fireEvent.click(nav.getByRole("button", { name: "Coverage" }));
    fireEvent.click(nav.getByRole("button", { name: "Solutions" }));
    expect(screen.getAllByRole("menu")).toHaveLength(2); // the synthetic-only artifact
  });
});

describe("language selector", () => {
  it("collapses every locale into one dropdown that preserves the path via Referer", async () => {
    const user = userEvent.setup();
    renderHeader({ locale: "en" });
    const trigger = screen.getByRole("button", { name: "Language" });
    expect(trigger.textContent).toContain("en");

    await user.click(trigger);
    const items = within(screen.getByRole("menu", { name: "Language" })).getAllByRole("menuitem");
    expect(items.length).toBe(localesByPriority().length);
    expect(items.map((i) => i.getAttribute("href"))).toEqual(
      localesByPriority().map((l) => `/api/locale?set=${l.code}`),
    );
  });

  it("marks the active locale and tags each item with its own lang and dir", async () => {
    const user = userEvent.setup();
    renderHeader({ locale: "ar" });
    await user.click(screen.getByRole("button", { name: "Language" }));
    const items = within(screen.getByRole("menu", { name: "Language" })).getAllByRole("menuitem");

    const arabic = items.find((i) => i.getAttribute("lang") === "ar")!;
    expect(arabic.getAttribute("dir")).toBe("rtl");
    expect(arabic.getAttribute("aria-current")).toBe("true");
    expect(items.filter((i) => i.getAttribute("aria-current") === "true")).toHaveLength(1);
    expect(items.find((i) => i.getAttribute("lang") === "en")!.getAttribute("dir")).toBe("ltr");
  });

  it("marks the desktop active locale with a pair that passes in both themes", async () => {
    const user = userEvent.setup();
    renderHeader({ locale: "uk" });
    await user.click(screen.getByRole("button", { name: "Language" }));
    const items = within(screen.getByRole("menu", { name: "Language" })).getAllByRole("menuitem");
    const active = items.find((i) => i.getAttribute("aria-current") === "true")!;

    // The menu panel paints bg-white / dark:bg-gray-950; blue-600 is 3.84:1 on that
    // dark panel. This is the one item the styling exists to distinguish.
    expect(active.className).toContain("text-blue-700");
    expect(active.className).toContain("dark:text-blue-300");
    expect(active.className).not.toContain("text-blue-600");
  });

  it("labels each item with its uppercase ISO 639-1 code beside the native name", async () => {
    const user = userEvent.setup();
    renderHeader({ locale: "en" });
    await user.click(screen.getByRole("button", { name: "Language" }));
    const items = within(screen.getByRole("menu", { name: "Language" })).getAllByRole("menuitem");

    expect(items.map((i) => i.textContent)).toEqual(
      localesByPriority().map((l) => `${l.code.toUpperCase()} — ${l.nativeLabel}`),
    );
    // `UK` is ISO 639-1 Ukrainian, not the United Kingdom — the native name must stay
    // beside the code so the two can't be confused.
    const ukrainian = items.find((i) => i.getAttribute("lang") === "uk")!;
    expect(ukrainian.textContent).toBe("UK — Українська");
  });
});

describe("current section", () => {
  it("marks the Validation link as the current page on /scoreboard", () => {
    renderHeader({ pathname: "/scoreboard" });
    expect(
      within(mainNav()).getByRole("link", { name: "Validation" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("marks the owning group trigger, and only that one", async () => {
    renderHeader({ pathname: "/datadark" });
    const nav = within(mainNav());
    expect(nav.getByRole("button", { name: "Solutions" }).getAttribute("data-current")).toBe("true");
    expect(nav.getByRole("button", { name: "Coverage" }).getAttribute("data-current")).toBeNull();
  });

  it("marks Coverage current on a per-country page, and only Coverage", () => {
    renderHeader({ pathname: "/countries/ru" });
    const nav = within(mainNav());
    expect(nav.getByRole("button", { name: "Coverage" }).getAttribute("data-current")).toBe("true");
    expect(nav.getByRole("button", { name: "Solutions" }).getAttribute("data-current")).toBeNull();
  });

  it("marks the top-level Signals link current on /signals", () => {
    renderHeader({ pathname: "/signals" });
    expect(
      within(mainNav()).getByRole("link", { name: "Signals" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});

describe("mobile sheet", () => {
  it("opens a labelled dialog with every group expanded as a section", async () => {
    const user = userEvent.setup();
    renderHeader({ signedIn: false });
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    // Only the two remaining groups render as sections; Signals/Ask are top-level links.
    for (const heading of ["Coverage", "Solutions"]) {
      expect(within(sheet).getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(within(sheet).getByRole("link", { name: "Ask" }).getAttribute("href")).toBe("/ask");
    expect(within(sheet).getByRole("link", { name: "Signals" }).getAttribute("href")).toBe("/signals");
    expect(within(sheet).getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("marks the drawer's active locale with a pair that passes in both themes", async () => {
    const user = userEvent.setup();
    renderHeader({ locale: "uk" });
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    const active = within(sheet)
      .getAllByRole("link")
      .find((a) => a.getAttribute("lang") === "uk" && a.getAttribute("aria-current") === "true")!;
    // The drawer paints bg-white / dark:bg-gray-950 — blue-600 is 3.84:1 against it.
    expect(active.className).toContain("text-blue-700");
    expect(active.className).toContain("dark:text-blue-300");
    expect(active.className).not.toContain("text-blue-600");
    // The inactive siblings keep the corrected gray pair rather than inheriting blue.
    const inactive = within(sheet)
      .getAllByRole("link")
      .find((a) => a.getAttribute("lang") === "en")!;
    expect(inactive.className).toContain("text-gray-600");
    expect(inactive.className).toContain("dark:text-gray-400");
  });

  // Regression: the header sets `backdrop-filter` (backdrop-blur), which makes it a
  // containing block for fixed-position descendants and traps their z-index in its
  // stacking context. Nested inside it, the sheet's `fixed inset-0` resolved to the
  // header's box and rendered clipped to the header strip on mobile. jsdom computes no
  // layout, so only the nesting itself can be asserted here.
  it("renders the sheet outside the backdrop-filtered header", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    const header = document.querySelector("header")!;
    expect(header.className).toContain("backdrop-blur");
    expect(header.contains(sheet)).toBe(false);

    // ...and the overlay it is positioned against is not trapped either.
    const overlay = sheet.parentElement!;
    expect(overlay.className).toContain("fixed");
    expect(overlay.hasAttribute("data-site-mobile-nav")).toBe(true);
    expect(header.contains(overlay)).toBe(false);
  });

  it("closes on Escape and returns focus to the hamburger", async () => {
    const user = userEvent.setup();
    renderHeader();
    const hamburger = screen.getByRole("button", { name: "Menu" });
    await user.click(hamburger);
    expect(hamburger.getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(hamburger);
  });

  it("honours aria-modal: focus is trapped and background scroll is locked", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(document.body.style.overflow).toBe("hidden");

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    const focusable = Array.from(sheet.querySelectorAll<HTMLElement>("a[href], button"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    await user.tab({ shift: true }); // wraps backwards to the end
    expect(document.activeElement).toBe(last);
    await user.tab(); // wraps forwards to the start
    expect(document.activeElement).toBe(first);
  });

  it("stays closed when the user navigates back to the path it was opened on", async () => {
    const user = userEvent.setup();
    const { navigate } = renderHeader({ pathname: "/access" });
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();

    navigate("/ask");
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();

    navigate("/access"); // browser Back must not resurrect the overlay
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });

  it("restores background scroll when it closes", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("shows the account controls to a signed-in user", async () => {
    const user = userEvent.setup();
    renderHeader({ signedIn: true });
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    expect(sheet.textContent).toContain("gregory@example.com");
    expect(within(sheet).getByRole("link", { name: "Account" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(within(sheet).queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

describe("no hardcoded English in the header chrome", () => {
  it("names the nav landmark from the labels, so it localizes with everything else", () => {
    route.pathname = "/";
    const nav = buildSiteNav(t, { signedIn: false });
    render(
      <SiteHeaderView
        nav={nav}
        locale="ar"
        locales={localesByPriority()}
        labels={{ ...labels, mainNav: "الرئيسية", menu: "القائمة" }}
        signOutAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("navigation", { name: "الرئيسية" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.getByRole("button", { name: "القائمة" })).toBeTruthy();
  });
});

describe("chromeless routes", () => {
  it("renders nothing on /admin, which has its own layout", () => {
    const { container } = renderHeader({ pathname: "/admin/ingest" });
    expect(container.innerHTML).toBe("");
  });
});
