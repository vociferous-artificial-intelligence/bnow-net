// Buyer-facing navigation model. Pure data + pure functions, no React, no i18n
// side-effects — the header component renders this, the tests assert it.
//
// Two rules hold this file together:
//  1. URLs are frozen. Every href below must already resolve to a page under
//     src/app; nav restructuring renames labels, never routes.
//  2. No hardcoded English. Every user-visible string is a `labelKey` resolved
//     through `makeT`, so a missing translation is a test failure, not a stray
//     English word in an Arabic page.

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export const SECTION_IDS = ["product", "coverage", "validation", "solutions", "pricing"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface NavLink {
  id: string;
  labelKey: string;
  label: string;
  href: string;
}

export type NavEntry =
  | { kind: "group"; id: SectionId; labelKey: string; label: string; items: NavLink[] }
  | { kind: "link"; id: SectionId; labelKey: string; label: string; href: string; cta: boolean };

export interface AuthSlot {
  signedIn: boolean;
  email: string | null;
  /** Avatar letter for the signed-in trigger; null when signed out. */
  initial: string | null;
  signInHref: string;
  accountHref: string;
}

export interface SiteNav {
  entries: NavEntry[];
  auth: AuthSlot;
}

/**
 * Theaters promoted to the nav. `countries.status = 'active'` currently holds eight
 * rows, but il/sa/ae/om/qa carry 2–5 digests each against ru/ua/ir's 27/20/19 — so
 * only the flagship three are advertised here, matching the long-standing `home.live`
 * copy ("Live now: Russia · Ukraine · Iran"). The rest stay reachable from /countries.
 */
export const LIVE_THEATERS = [
  { iso2: "ru", labelKey: "home.theater.ru" },
  { iso2: "ua", labelKey: "home.theater.ua" },
  { iso2: "ir", labelKey: "home.theater.ir" },
] as const;

export type TheaterIso2 = (typeof LIVE_THEATERS)[number]["iso2"];

/** Ungated per-theater destination: the coverage index, anchored at that theater's card. */
export function theaterHref(iso2: string): string {
  return `/countries#${iso2}`;
}

/**
 * Deep link to a theater's freshest digest, falling back to the (ungated) coverage
 * anchor when no digest exists yet. `/digests/*` is behind FEATURE_AUTH_GATE, so only
 * offer this to signed-in users.
 */
export function latestDigestHref(iso2: string, latestDate: string | null | undefined): string {
  return latestDate ? `/digests/${iso2}/${latestDate}` : theaterHref(iso2);
}

/**
 * Which nav section owns a given path. `/countries` and `/signals` are each reachable
 * from two groups by design (dual discovery paths); this picks the single group whose
 * trigger lights up, so no two triggers ever claim the same page.
 */
const SECTION_ROUTES: ReadonlyArray<readonly [string, SectionId]> = [
  ["/countries", "coverage"],
  ["/digests", "coverage"],
  ["/scoreboard", "validation"],
  ["/registry", "product"],
  ["/middle-east", "product"],
  ["/ask", "product"],
  ["/signals", "product"],
  ["/entities", "product"],
  ["/trade", "solutions"],
  ["/critical-materials", "solutions"],
  ["/datadark", "solutions"],
  ["/pricing", "pricing"],
];

export function canonicalSection(pathname: string): SectionId | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  for (const [prefix, section] of SECTION_ROUTES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return section;
  }
  return null;
}

/** `aria-current="page"` test: an anchored link (/countries#ru) is not "the page". */
export function isCurrentPage(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const target = href.replace(/\/+$/, "") || "/";
  return path === target;
}

/**
 * Locale switch target. Kept as a bare `?set=` so the switch remains a plain full-page
 * <a> whose Referer /api/locale resolves back to the current URL — query string and
 * all. Threading an explicit `?to=` from `usePathname()` would silently drop
 * `?profile=` on digest pages.
 */
export function localeSwitchHref(code: string): string {
  return `/api/locale?set=${encodeURIComponent(code)}`;
}

export function buildSiteNav(
  t: Translate,
  opts: { signedIn: boolean; email?: string | null },
): SiteNav {
  const link = (id: string, labelKey: string, href: string): NavLink => ({
    id,
    labelKey,
    label: t(labelKey),
    href,
  });

  const entries: NavEntry[] = [
    {
      kind: "group",
      id: "product",
      labelKey: "nav.group.product",
      label: t("nav.group.product"),
      items: [
        link("feeds", "nav.item.feeds", "/countries"),
        link("ask", "nav.item.ask", "/ask"),
        link("registry", "nav.item.registry", "/registry"),
        link("me_registry", "nav.item.me_registry", "/middle-east"),
        link("signals", "nav.item.signals", "/signals"),
      ],
    },
    {
      kind: "group",
      id: "coverage",
      labelKey: "nav.group.coverage",
      label: t("nav.group.coverage"),
      items: [
        ...LIVE_THEATERS.map((th) => link(`theater_${th.iso2}`, th.labelKey, theaterHref(th.iso2))),
        link("all_theaters", "nav.item.all_theaters", "/countries"),
      ],
    },
    {
      kind: "link",
      id: "validation",
      labelKey: "nav.group.validation",
      label: t("nav.group.validation"),
      href: "/scoreboard",
      cta: false,
    },
    {
      kind: "group",
      id: "solutions",
      labelKey: "nav.group.solutions",
      label: t("nav.group.solutions"),
      items: [
        // Mapping corrected against page content, see docs/reviews/NAV-RESTRUCTURE-REVIEW.md:
        // /trade is the sanctions-circumvention surface; /datadark tracks Russia
        // suppressing its own statistics and is not a compliance tool.
        link("sanctions", "nav.item.sanctions", "/trade"),
        link("commodity", "nav.item.commodity", "/critical-materials"),
        link("opacity", "nav.item.opacity", "/datadark"),
        link("political_risk", "nav.item.political_risk", "/signals"),
      ],
    },
    {
      kind: "link",
      id: "pricing",
      labelKey: "nav.group.pricing",
      label: t("nav.group.pricing"),
      href: "/pricing",
      // The commercial anchor only reads as a CTA to someone who hasn't bought yet.
      cta: !opts.signedIn,
    },
  ];

  const email = opts.email ?? null;
  return {
    entries,
    auth: {
      signedIn: opts.signedIn,
      email: opts.signedIn ? email : null,
      initial: opts.signedIn && email ? email.trim().charAt(0).toUpperCase() : null,
      signInHref: "/signin",
      accountHref: "/account",
    },
  };
}

/** Every static destination the header can reach — the dead-link test's input. */
export function navHrefs(nav: SiteNav): string[] {
  const out: string[] = [nav.auth.signInHref, nav.auth.accountHref];
  for (const entry of nav.entries) {
    if (entry.kind === "link") out.push(entry.href);
    else out.push(...entry.items.map((i) => i.href));
  }
  return out;
}

/** Every i18n key the header renders — the translation-coverage test's input. */
export function navLabelKeys(nav: SiteNav): string[] {
  const out: string[] = [];
  for (const entry of nav.entries) {
    out.push(entry.labelKey);
    if (entry.kind === "group") out.push(...entry.items.map((i) => i.labelKey));
  }
  return out;
}
