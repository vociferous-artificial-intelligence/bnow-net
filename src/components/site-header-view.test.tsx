// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
};

function renderHeader({ signedIn = false, pathname = "/", locale = "en" } = {}) {
  route.pathname = pathname;
  const nav = buildSiteNav(t, { signedIn, email: signedIn ? "gregory@example.com" : null });
  return render(
    <SiteHeaderView
      nav={nav}
      locale={locale}
      locales={localesByPriority()}
      labels={labels}
      signOutAction={vi.fn()}
    />,
  );
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

describe("pricing treatment", () => {
  it("renders pricing as a button-styled CTA when signed out", () => {
    renderHeader({ signedIn: false });
    const pricing = within(mainNav()).getByRole("link", { name: "Pricing" });
    expect(pricing.className).toContain("bg-blue-600");
  });

  it("demotes pricing to a plain link once signed in", () => {
    renderHeader({ signedIn: true });
    const pricing = within(mainNav()).getByRole("link", { name: "Pricing" });
    expect(pricing.className).not.toContain("bg-blue-600");
    expect(pricing.getAttribute("href")).toBe("/pricing");
  });
});

describe("dropdown contents", () => {
  it("reveals the Product group's destinations", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(within(mainNav()).getByRole("button", { name: "Product" }));

    const items = within(screen.getByRole("menu", { name: "Product" })).getAllByRole("menuitem");
    expect(items.map((i) => i.getAttribute("href"))).toEqual([
      "/countries",
      "/ask",
      "/registry",
      "/middle-east",
      "/signals",
    ]);
    expect(items.map((i) => i.textContent)).toEqual([
      "Daily intelligence feeds",
      "Ask the data",
      "Source reliability registry",
      "Middle East registry",
      "Analyst signals",
    ]);
  });

  it("lists only live theaters plus the index under Coverage", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(within(mainNav()).getByRole("button", { name: "Coverage" }));

    const items = within(screen.getByRole("menu", { name: "Coverage" })).getAllByRole("menuitem");
    expect(items.map((i) => i.getAttribute("href"))).toEqual([
      "/countries#ru",
      "/countries#ua",
      "/countries#ir",
      "/countries",
    ]);
  });

  it("routes Solutions personas at the truthful pages", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(within(mainNav()).getByRole("button", { name: "Solutions" }));

    const items = within(screen.getByRole("menu", { name: "Solutions" })).getAllByRole("menuitem");
    expect(
      Object.fromEntries(items.map((i) => [i.textContent, i.getAttribute("href")])),
    ).toEqual({
      "Sanctions & trade evasion": "/trade",
      "Commodity & supply-chain risk": "/critical-materials",
      "Economic data suppression": "/datadark",
      "Political risk & signals": "/signals",
    });
  });
});

describe("dropdown accessibility", () => {
  it("keeps aria-expanded in sync", async () => {
    const user = userEvent.setup();
    renderHeader();
    const trigger = within(mainNav()).getByRole("button", { name: "Product" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("opens onto the first item with ArrowDown", async () => {
    const user = userEvent.setup();
    renderHeader();
    within(mainNav()).getByRole("button", { name: "Product" }).focus();
    await user.keyboard("{ArrowDown}");

    const items = within(screen.getByRole("menu", { name: "Product" })).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
  });

  it("cycles items with the arrow keys", async () => {
    const user = userEvent.setup();
    renderHeader();
    within(mainNav()).getByRole("button", { name: "Product" }).focus();
    await user.keyboard("{ArrowDown}");
    const items = within(screen.getByRole("menu", { name: "Product" })).getAllByRole("menuitem");

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
    const trigger = within(mainNav()).getByRole("button", { name: "Product" });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "Product" })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Product" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
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
    expect(nav.getByRole("button", { name: "Product" }).getAttribute("data-current")).toBeNull();
    expect(nav.getByRole("button", { name: "Coverage" }).getAttribute("data-current")).toBeNull();
  });

  it("lets Coverage own /countries even though Product also links there", () => {
    renderHeader({ pathname: "/countries" });
    const nav = within(mainNav());
    expect(nav.getByRole("button", { name: "Coverage" }).getAttribute("data-current")).toBe("true");
    expect(nav.getByRole("button", { name: "Product" }).getAttribute("data-current")).toBeNull();
  });
});

describe("mobile sheet", () => {
  it("opens a labelled dialog with every group expanded as a section", async () => {
    const user = userEvent.setup();
    renderHeader({ signedIn: false });
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    for (const heading of ["Product", "Coverage", "Solutions"]) {
      expect(within(sheet).getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(within(sheet).getByRole("link", { name: "Ask the data" }).getAttribute("href")).toBe("/ask");
    expect(within(sheet).getByRole("link", { name: "Sign in" })).toBeTruthy();
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

describe("chromeless routes", () => {
  it("renders nothing on /admin, which has its own layout", () => {
    const { container } = renderHeader({ pathname: "/admin/ingest" });
    expect(container.innerHTML).toBe("");
  });
});
