// Buyer-facing navigation model. Pure data + pure functions, no React, no i18n
// side-effects — the header component renders this, the tests assert it.
//
// Two rules hold this file together:
//  1. URLs are frozen. Every href below must already resolve to a page under
//     src/app; nav restructuring renames labels, never routes.
//  2. No hardcoded English. Every user-visible string is a `labelKey` resolved
//     through `makeT`, so a missing translation is a test failure, not a stray
//     English word in an Arabic page.
//
// IA refinement (2026-07-12, docs/reviews/IA-REFINEMENT-REVIEW.md): the "Product"
// group was retired because its three children duplicated destinations reachable
// elsewhere (feeds = Coverage, signals = the new top-level Signals, ask = the new
// top-level Ask). Coverage's theater items now point at real per-country pages
// (/countries/[iso2]) instead of #anchors on one page, so no single route is the
// destination of five nav paths. Signals has exactly one nav path now: the
// Solutions>political_risk duplicate was dropped (a top-level Signals item makes a
// second path to /signals pure redundancy).
//
// Private-beta repositioning (2026-07-13): the public Pricing entry became
// "Request access" → /access (the beta request page; /pricing redirects there).
// Signed-in navigation carries NO commercial entry at all — desktop, mobile
// sheet, or CTA strip.

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export const SECTION_IDS = ["coverage", "signals", "ask", "solutions", "validation", "access"] as const;
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
 * rows, but il/sa/ae/om/qa carry 6–9 digests each against ru/ua/ir's 34/23/28 — so
 * only the flagship three are advertised in the Coverage dropdown (standing ruling 15:
 * promoting shallow theaters overstates depth). The other five stay reachable from the
 * /countries index and each has its own /countries/[iso2] page; they are not promoted.
 */
export const LIVE_THEATERS = [
  { iso2: "ru", labelKey: "home.theater.ru" },
  { iso2: "ua", labelKey: "home.theater.ua" },
  { iso2: "ir", labelKey: "home.theater.ir" },
] as const;

export type TheaterIso2 = (typeof LIVE_THEATERS)[number]["iso2"];

/**
 * Ungated per-theater destination: the public per-country coverage page. This is a real
 * indexable landing page (src/app/countries/[iso2]/page.tsx), not a #anchor on the index —
 * that is the fix for the "country links scroll instead of navigating" problem. Old
 * `/countries#ru` bookmarks still resolve: the index keeps its `id={iso2}` card anchors.
 */
export function theaterHref(iso2: string): string {
  return `/countries/${iso2}`;
}

/**
 * Deep link to a theater's freshest digest, falling back to the (ungated) per-country
 * coverage page when no digest exists yet. `/digests/*` is behind FEATURE_AUTH_GATE, so
 * only offer this to signed-in users.
 */
export function latestDigestHref(iso2: string, latestDate: string | null | undefined): string {
  return latestDate ? `/digests/${iso2}/${latestDate}` : theaterHref(iso2);
}

/**
 * Which nav section owns a given path, so exactly one trigger lights up. Every route maps
 * to at most one section — no page is claimed by two triggers.
 */
const SECTION_ROUTES: ReadonlyArray<readonly [string, SectionId]> = [
  ["/countries", "coverage"],
  ["/digests", "coverage"],
  ["/scoreboard", "validation"],
  // /registry and /middle-east deliberately absent: R5 (2026-07-12) made the source
  // registry admin-only and dropped its nav entries, so neither route has a trigger.
  ["/signals", "signals"],
  ["/ask", "ask"],
  ["/trade", "solutions"],
  ["/critical-materials", "solutions"],
  ["/datadark", "solutions"],
  // /access is the beta request page (private-beta repositioning 2026-07-13);
  // /pricing now only redirects there, so it owns no trigger.
  ["/access", "access"],
  // /entities is gated and not in nav (Product retired) — it owns no trigger (returns null).
];

export function canonicalSection(pathname: string): SectionId | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  for (const [prefix, section] of SECTION_ROUTES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return section;
  }
  return null;
}

/** `aria-current="page"` test. Kept `#`-defensive even though theater links are now real pages. */
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
      id: "coverage",
      labelKey: "nav.group.coverage",
      label: t("nav.group.coverage"),
      items: [
        // Real per-country pages, not #anchors (IA refinement 2026-07-12).
        ...LIVE_THEATERS.map((th) => link(`theater_${th.iso2}`, th.labelKey, theaterHref(th.iso2))),
        link("all_theaters", "nav.item.all_theaters", "/countries"),
      ],
    },
    {
      // Promoted from the retired Product group to its own top-level item — the analyst
      // signals engine is a distinct destination, not a menu entry that lives elsewhere.
      kind: "link",
      id: "signals",
      labelKey: "nav.group.signals",
      label: t("nav.group.signals"),
      href: "/signals",
      cta: false,
    },
    {
      // Likewise promoted from Product. /ask is gated (requireUser); signed-out clicks
      // land on /signin, same as the old Product>ask entry did.
      kind: "link",
      id: "ask",
      labelKey: "nav.group.ask",
      label: t("nav.group.ask"),
      href: "/ask",
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
        // suppressing its own statistics and is not a compliance tool. The
        // political_risk>/signals duplicate was dropped (IA refinement 2026-07-12):
        // Signals is now its own top-level item, so a second path here is pure redundancy.
        link("sanctions", "nav.item.sanctions", "/trade"),
        link("commodity", "nav.item.commodity", "/critical-materials"),
        link("opacity", "nav.item.opacity", "/datadark"),
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
  ];

  // Private analyst beta (2026-07-13): the only commercial entry is the access
  // request, and it exists for signed-out visitors ONLY — signed-in navigation
  // carries no pricing/access entry at all (the product is their workbench, not
  // a sales funnel).
  if (!opts.signedIn) {
    entries.push({
      kind: "link",
      id: "access",
      labelKey: "nav.group.access",
      label: t("nav.group.access"),
      href: "/access",
      cta: true,
    });
  }

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
