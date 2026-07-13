import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dict, makeT, ownDict } from "@/i18n/dictionaries";
import {
  buildSiteNav,
  canonicalSection,
  isCurrentPage,
  latestDigestHref,
  localeSwitchHref,
  navHrefs,
  navLabelKeys,
  theaterHref,
  type NavEntry,
} from "./site-nav";

const t = makeT("en");
const signedOut = buildSiteNav(t, { signedIn: false });
const signedIn = buildSiteNav(t, { signedIn: true, email: "Gregory@Example.com" });

/** Locales shipping their own catalog (others fall back to English per-key by design). */
const TRANSLATED = ["uk", "de", "ar", "ja", "pl", "fr"] as const;

/** Header chrome + signed-in home strings that live outside the NavEntry tree. */
const EXTRA_KEYS = [
  "nav.language",
  "nav.account",
  "nav.signout",
  "nav.menu",
  "nav.close",
  "nav.main",
  "auth.signin",
  "home.cta.digest",
  "home.cta.coverage",
  "home.live_label",
];

function group(nav: typeof signedOut, id: string) {
  const entry = nav.entries.find((e) => e.id === id);
  if (!entry || entry.kind !== "group") throw new Error(`no group ${id}`);
  return entry;
}
function link(nav: typeof signedOut, id: string) {
  const entry = nav.entries.find((e) => e.id === id);
  if (!entry || entry.kind !== "link") throw new Error(`no link ${id}`);
  return entry;
}
const hrefsOf = (entry: NavEntry) => (entry.kind === "group" ? entry.items.map((i) => i.href) : [entry.href]);

/** Every route that has a page.tsx under src/app (dynamic segments kept as `[seg]`). */
function staticRoutes(): Set<string> {
  const appDir = fileURLToPath(new URL("../../app", import.meta.url));
  const routes = new Set<string>();
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), [...segments, entry.name]);
      else if (entry.name === "page.tsx") routes.add(`/${segments.join("/")}`.replace(/\/$/, "") || "/");
    }
  };
  walk(appDir, []);
  return routes;
}

/**
 * True if a concrete href resolves to a page under src/app — matching a dynamic segment
 * (`/countries/[iso2]`) against a concrete one (`/countries/ru`). The Coverage dropdown
 * now points at real per-country pages served by a `[iso2]` route.
 */
function routeExists(href: string, routes: Set<string>): boolean {
  const target = href.split("#")[0].replace(/\/+$/, "") || "/";
  for (const route of routes) {
    const rSegs = route.split("/");
    const tSegs = target.split("/");
    if (rSegs.length !== tSegs.length) continue;
    const ok = rSegs.every((r, i) => r === tSegs[i] || /^\[.+\]$/.test(r));
    if (ok) return true;
  }
  return false;
}

describe("nav shape", () => {
  it("reads left-to-right as Coverage | Signals | Ask | Solutions | Validation | Request access when signed out", () => {
    // IA refinement 2026-07-12: Product retired; Signals + Ask promoted to top-level.
    // Private-beta repositioning 2026-07-13: Pricing became Request access -> /access.
    expect(signedOut.entries.map((e) => e.id)).toEqual([
      "coverage",
      "signals",
      "ask",
      "solutions",
      "validation",
      "access",
    ]);
  });

  it("carries NO commercial entry at all when signed in", () => {
    // The signed-in product is the analyst's workbench, not a sales funnel: no
    // pricing, no request-access — desktop and mobile render from this same tree.
    expect(signedIn.entries.map((e) => e.id)).toEqual([
      "coverage",
      "signals",
      "ask",
      "solutions",
      "validation",
    ]);
    expect(navHrefs(signedIn)).not.toContain("/access");
    expect(navHrefs(signedIn)).not.toContain("/pricing");
  });

  it("makes Coverage and Solutions dropdowns; Signals, Ask, Validation and Request access direct links", () => {
    expect(signedOut.entries.map((e) => e.kind)).toEqual([
      "group",
      "link",
      "link",
      "group",
      "link",
      "link",
    ]);
  });
});

describe("label → route mapping (URLs are frozen)", () => {
  it("Signals and Ask are their own top-level destinations (no Product container)", () => {
    expect(signedOut.entries.find((e) => (e.id as string) === "product")).toBeUndefined();
    expect(link(signedOut, "signals").href).toBe("/signals");
    expect(link(signedOut, "ask").href).toBe("/ask");
  });

  // R5 (2026-07-12, operator ruling): the source registry is admin-only now.
  // Both registries' nav entries are dropped everywhere — admins reach
  // /registry and /middle-east directly by URL, not via nav.
  it("advertises neither registry anywhere in nav", () => {
    expect(navHrefs(signedOut)).not.toContain("/registry");
    expect(navHrefs(signedOut)).not.toContain("/middle-east");
  });

  it("Coverage lists the live theaters as real per-country pages, then the index", () => {
    // Was #anchors on one page (read as broken); now distinct destinations.
    expect(hrefsOf(group(signedOut, "coverage"))).toEqual([
      "/countries/ru",
      "/countries/ua",
      "/countries/ir",
      "/countries",
    ]);
  });

  it("Validation is the scoreboard, kept top-level as the trust differentiator", () => {
    expect(link(signedOut, "validation").href).toBe("/scoreboard");
  });

  it("Solutions is the three distinct vertical modules — signals is NOT duplicated here", () => {
    // Deliberate correction of the original brief, which paired "Sanctions compliance"
    // with /datadark. /datadark tracks Russia classifying its own statistics; /trade is
    // the mirror-trade & evasion watch. See NAV-RESTRUCTURE-REVIEW.md. The old
    // political_risk>/signals item was dropped (IA refinement): Signals is top-level now.
    const items = group(signedOut, "solutions").items;
    expect(Object.fromEntries(items.map((i) => [i.id, i.href]))).toEqual({
      sanctions: "/trade",
      commodity: "/critical-materials",
      opacity: "/datadark",
    });
    expect(items.map((i) => i.href)).not.toContain("/signals");
  });

  it("gives every route exactly one nav path — no many-to-one redundancy", () => {
    // The whole point of the sprint: /countries was the target of five nav paths and
    // /signals of two. Now each distinct destination appears exactly once.
    const hrefs = navHrefs(signedOut).filter((h) => h !== "/signin" && h !== "/account");
    const seen = new Map<string, number>();
    for (const h of hrefs) seen.set(h, (seen.get(h) ?? 0) + 1);
    for (const [href, count] of seen) {
      expect(count, `route ${href} is the destination of ${count} nav paths`).toBe(1);
    }
  });

  it("has no dead links — every href resolves to a page under src/app", () => {
    const routes = staticRoutes();
    for (const href of navHrefs(signedOut)) {
      expect(routeExists(href, routes), `dead nav link: ${href}`).toBe(true);
    }
  });
});

describe("request access is the only commercial entry, signed-out only", () => {
  it("treats Request access as a CTA for signed-out visitors", () => {
    expect(link(signedOut, "access").cta).toBe(true);
    expect(link(signedOut, "access").href).toBe("/access");
    expect(link(signedOut, "access").labelKey).toBe("nav.group.access");
  });
  it("never renders any price copy path — /pricing only redirects and owns no entry", () => {
    expect(navHrefs(signedOut)).not.toContain("/pricing");
    expect(navHrefs(signedIn)).not.toContain("/pricing");
  });
});

describe("auth slot", () => {
  it("offers sign-in and no identity when signed out", () => {
    expect(signedOut.auth).toMatchObject({ signedIn: false, email: null, initial: null, signInHref: "/signin" });
  });
  it("exposes the email and an uppercase initial when signed in", () => {
    expect(signedIn.auth).toMatchObject({
      signedIn: true,
      email: "Gregory@Example.com",
      initial: "G",
      accountHref: "/account",
    });
  });
  it("never leaks an email into signed-out chrome", () => {
    expect(buildSiteNav(t, { signedIn: false, email: "leak@example.com" }).auth.email).toBeNull();
  });
});

describe("i18n", () => {
  it("renders no hardcoded English — every label comes from t()", () => {
    const marker = buildSiteNav((key) => `«${key}»`, { signedIn: false });
    for (const entry of marker.entries) {
      expect(entry.label).toBe(`«${entry.labelKey}»`);
      if (entry.kind === "group")
        for (const item of entry.items) expect(item.label).toBe(`«${item.labelKey}»`);
    }
  });

  it("defines every header key in the English catalog", () => {
    const en = dict("en");
    for (const key of [...navLabelKeys(signedOut), ...EXTRA_KEYS]) {
      expect(en[key], `missing en key: ${key}`).toBeTruthy();
    }
  });

  it("translates every header key in every locale that ships a catalog", () => {
    for (const loc of TRANSLATED) {
      const own = ownDict(loc)!;
      for (const key of [...navLabelKeys(signedOut), ...EXTRA_KEYS]) {
        expect(own[key], `${loc} missing ${key}`).toBeTruthy();
      }
    }
  });

  it("resolves every header key to a non-empty string in the untranslated locales too", () => {
    for (const loc of ["es", "he", "ko"] as const) {
      const translate = makeT(loc);
      for (const key of [...navLabelKeys(signedOut), ...EXTRA_KEYS]) {
        expect(translate(key)).toBeTruthy();
        expect(translate(key)).not.toBe(key); // English fallback, never a raw key
      }
    }
  });
});

describe("current-section resolution", () => {
  it.each([
    ["/countries", "coverage"],
    ["/countries/ru", "coverage"],
    ["/digests/ru/2026-07-09", "coverage"],
    ["/scoreboard", "validation"],
    ["/scoreboard/ru/2026-07-09", "validation"],
    ["/ask", "ask"],
    ["/signals", "signals"],
    ["/trade", "solutions"],
    ["/critical-materials", "solutions"],
    ["/datadark", "solutions"],
    ["/access", "access"],
  ])("%s belongs to %s", (path, section) => {
    expect(canonicalSection(path)).toBe(section);
  });

  it("claims no section for the home, auth, health, redirecting and (unlisted) entities pages", () => {
    // /entities is gated and no longer under any nav group (Product retired);
    // /pricing only 308-redirects to /access, so it owns no trigger.
    for (const p of ["/", "/signin", "/account", "/health", "/entities/5", "/pricing"]) {
      expect(canonicalSection(p)).toBeNull();
    }
  });

  // R5 (2026-07-12): /registry and /middle-east dropped from SECTION_ROUTES along
  // with their nav entries — neither route has a trigger left to light up.
  it("claims no section for the now-unlisted registry routes", () => {
    for (const p of ["/registry", "/registry/123", "/registry/", "/middle-east"]) {
      expect(canonicalSection(p)).toBeNull();
    }
  });

  it("assigns each route to exactly one section — Signals and Ask now own their own", () => {
    expect(canonicalSection("/countries")).toBe("coverage");
    expect(canonicalSection("/signals")).toBe("signals");
    expect(canonicalSection("/ask")).toBe("ask");
  });

  it("ignores query strings and trailing slashes", () => {
    expect(canonicalSection("/digests/ru/2026-07-09?profile=frontline")).toBe("coverage");
    expect(canonicalSection("/trade/")).toBe("solutions");
  });
});

describe("isCurrentPage", () => {
  it("matches the exact path", () => {
    expect(isCurrentPage("/scoreboard", "/scoreboard")).toBe(true);
    expect(isCurrentPage("/scoreboard/ru/2026-07-09", "/scoreboard")).toBe(false);
  });
  it("marks the per-country page current when on it, not the index", () => {
    expect(isCurrentPage("/countries/ru", "/countries/ru")).toBe(true);
    expect(isCurrentPage("/countries", "/countries/ru")).toBe(false);
    expect(isCurrentPage("/countries/ru", "/countries")).toBe(false);
  });
  it("stays defensive against a stray anchor href", () => {
    expect(isCurrentPage("/countries", "/countries#ru")).toBe(false);
  });
  it("ignores query strings", () => {
    expect(isCurrentPage("/access?src=hero", "/access")).toBe(true);
  });
});

describe("destinations", () => {
  it("points theater links at real per-country pages", () => {
    expect(theaterHref("ru")).toBe("/countries/ru");
  });
  it("deep-links the freshest digest, falling back to the per-country page when none exists", () => {
    expect(latestDigestHref("ru", "2026-07-09")).toBe("/digests/ru/2026-07-09");
    expect(latestDigestHref("ru", null)).toBe("/countries/ru");
  });
  it("switches locale without an explicit return path, so /api/locale keeps the query via Referer", () => {
    expect(localeSwitchHref("de")).toBe("/api/locale?set=de");
    expect(localeSwitchHref("../evil")).toBe("/api/locale?set=..%2Fevil");
  });
});
