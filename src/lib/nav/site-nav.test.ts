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

/** Every static route that has a page.tsx under src/app. */
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

describe("nav shape", () => {
  it("reads left-to-right as Product | Coverage | Validation | Solutions | Pricing", () => {
    expect(signedOut.entries.map((e) => e.id)).toEqual([
      "product",
      "coverage",
      "validation",
      "solutions",
      "pricing",
    ]);
  });

  it("makes Product, Coverage and Solutions dropdowns; Validation and Pricing direct links", () => {
    expect(signedOut.entries.map((e) => e.kind)).toEqual(["group", "group", "link", "group", "link"]);
  });
});

describe("label → route mapping (URLs are frozen)", () => {
  it("Product points at the feeds index, ask, both registries and signals", () => {
    expect(hrefsOf(group(signedOut, "product"))).toEqual([
      "/countries",
      "/ask",
      "/registry",
      "/middle-east",
      "/signals",
    ]);
  });

  it("surfaces the ME registry inside Product rather than as a second top-level registry", () => {
    const ids = group(signedOut, "product").items.map((i) => i.id);
    expect(ids).toContain("registry");
    expect(ids).toContain("me_registry");
    expect(signedOut.entries.some((e) => e.kind === "link" && e.href === "/middle-east")).toBe(false);
  });

  it("Coverage lists only the live theaters, then the index", () => {
    expect(hrefsOf(group(signedOut, "coverage"))).toEqual([
      "/countries#ru",
      "/countries#ua",
      "/countries#ir",
      "/countries",
    ]);
  });

  it("Validation is the scoreboard, kept top-level as the trust differentiator", () => {
    expect(link(signedOut, "validation").href).toBe("/scoreboard");
  });

  it("Solutions maps sanctions to /trade and data suppression to /datadark", () => {
    // Deliberate correction of the original brief, which paired "Sanctions compliance"
    // with /datadark. /datadark tracks Russia classifying its own statistics; /trade is
    // the mirror-trade & evasion watch. See NAV-RESTRUCTURE-REVIEW.md.
    const items = group(signedOut, "solutions").items;
    expect(Object.fromEntries(items.map((i) => [i.id, i.href]))).toEqual({
      sanctions: "/trade",
      commodity: "/critical-materials",
      opacity: "/datadark",
      political_risk: "/signals",
    });
  });

  it("gives /signals two discovery paths with one destination", () => {
    const product = group(signedOut, "product").items.find((i) => i.id === "signals");
    const solutions = group(signedOut, "solutions").items.find((i) => i.id === "political_risk");
    expect(product?.href).toBe("/signals");
    expect(solutions?.href).toBe("/signals");
    expect(product?.labelKey).not.toBe(solutions?.labelKey);
  });

  it("has no dead links — every href resolves to a page under src/app", () => {
    const routes = staticRoutes();
    for (const href of navHrefs(signedOut)) {
      expect(routes, `dead nav link: ${href}`).toContain(href.split("#")[0]);
    }
  });
});

describe("pricing is the commercial anchor only until you buy", () => {
  it("treats pricing as a CTA for signed-out visitors", () => {
    expect(link(signedOut, "pricing").cta).toBe(true);
  });
  it("drops the CTA treatment once signed in, keeping the link", () => {
    expect(link(signedIn, "pricing").cta).toBe(false);
    expect(link(signedIn, "pricing").href).toBe("/pricing");
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
    ["/digests/ru/2026-07-09", "coverage"],
    ["/scoreboard", "validation"],
    ["/scoreboard/ru/2026-07-09", "validation"],
    ["/registry", "product"],
    ["/registry/123", "product"],
    ["/middle-east", "product"],
    ["/ask", "product"],
    ["/signals", "product"],
    ["/entities/5", "product"],
    ["/trade", "solutions"],
    ["/critical-materials", "solutions"],
    ["/datadark", "solutions"],
    ["/pricing", "pricing"],
  ])("%s belongs to %s", (path, section) => {
    expect(canonicalSection(path)).toBe(section);
  });

  it("claims no section for the home, auth and health pages", () => {
    for (const p of ["/", "/signin", "/account", "/health"]) expect(canonicalSection(p)).toBeNull();
  });

  it("assigns each route to exactly one section, so two triggers never both light up", () => {
    // /countries and /signals each appear under two groups; only one may own them.
    expect(canonicalSection("/countries")).toBe("coverage");
    expect(canonicalSection("/signals")).toBe("product");
  });

  it("ignores query strings and trailing slashes", () => {
    expect(canonicalSection("/digests/ru/2026-07-09?profile=frontline")).toBe("coverage");
    expect(canonicalSection("/registry/")).toBe("product");
  });
});

describe("isCurrentPage", () => {
  it("matches the exact path", () => {
    expect(isCurrentPage("/scoreboard", "/scoreboard")).toBe(true);
    expect(isCurrentPage("/scoreboard/ru/2026-07-09", "/scoreboard")).toBe(false);
  });
  it("never marks an anchored theater link as the current page", () => {
    expect(isCurrentPage("/countries", "/countries#ru")).toBe(false);
    expect(isCurrentPage("/countries", "/countries")).toBe(true);
  });
  it("ignores query strings", () => {
    expect(isCurrentPage("/pricing?plan=team", "/pricing")).toBe(true);
  });
});

describe("destinations", () => {
  it("anchors theater links at the ungated coverage index", () => {
    expect(theaterHref("ru")).toBe("/countries#ru");
  });
  it("deep-links the freshest digest, falling back to coverage when none exists", () => {
    expect(latestDigestHref("ru", "2026-07-09")).toBe("/digests/ru/2026-07-09");
    expect(latestDigestHref("ru", null)).toBe("/countries#ru");
  });
  it("switches locale without an explicit return path, so /api/locale keeps the query via Referer", () => {
    expect(localeSwitchHref("de")).toBe("/api/locale?set=de");
    expect(localeSwitchHref("../evil")).toBe("/api/locale?set=..%2Fevil");
  });
});
