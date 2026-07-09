# Review gate — navigation restructure & logged-in homepage

**Date:** 2026-07-09 · **Commits:** `0d9439b`, `828e3b6`, `1b68f0c`, `30997f0`, `51b863c` (`main`)
**Scope:** UI/IA only. No new backend features, no new pages, **zero route changes**.

---

## Task 0 — Inventory & baseline (what was actually there)

Read-only pass over `src/app`, `src/i18n`, `src/lib`, plus a `next build` and a live DB query.
Several premises in the task brief turned out to be wrong; each is called out below.

### Rendering mode — the decisive finding

`next build` reports **all 33 routes as `ƒ` (server-rendered on demand)**. Nothing is static,
nothing is ISR. `export const dynamic = "force-dynamic"` appears in every `page.tsx`, and
`getLocale()` reads `cookies()` + `headers()` anyway.

> **Consequence:** the Task 3 dilemma ("server session read will force pages dynamic") does not
> exist here. There is no cache to invalidate. **Approach (a), server-side `auth()`, chosen.**
> No client-side session island, no hydration swap, no CLS.

The route table is **byte-identical before and after** this change (diffed; see Verification).

### Where the nav lived

| | Before |
|---|---|
| Root layout (`src/app/layout.tsx`) | `<html><body>{children}</body></html>` — **no chrome at all** |
| `/` (`src/app/page.tsx:30-46`) | The **only** full nav: 11 inline links + 10 inline language links |
| 11 other pages | A one-line breadcrumb: `BNOW.NET · <section>` |
| `/registry`, `/scoreboard` | **No breadcrumb at all** — just an `<h1>` |
| `/health` | No nav, no back-link |
| `/entities/[id]`, `/registry/[id]`, `/scoreboard/[c]/[d]` | Breadcrumb to their **parent list**, not home |

So "fell into a page, lost the product map" was literally true for `/registry` and `/scoreboard`.

### Component & test conventions

- **No shadcn/ui.** No `@radix-ui/*`, no `class-variance-authority`, no `components.json`,
  no `src/components/ui/`. Only `clsx`, `tailwind-merge`, `lucide-react`. The brief's
  "match existing component usage" resolves to **hand-rolled**. Dropdowns were built to the
  WAI-ARIA menu-button pattern from scratch.
- `src/components/` contained exactly **one** file: `language-selector.tsx` (a server component
  rendering 10 plain `<a>` links).
- **No React component tests existed.** `vitest.config.ts` was `environment: "node"` and
  `include: ["src/**/*.test.ts"]` — `.tsx` was not even collected. jsdom and
  `@testing-library/*` were absent.
- Tailwind **v4** (CSS-first, `@import "tailwindcss"`), dark mode via `prefers-color-scheme`.

### Auth

- Auth.js v5 (`next-auth@5.0.0-beta.31`), magic link, **`session: { strategy: "database" }`** —
  every `auth()` call is a Postgres round-trip.
- `auth()` was called only in `/signin`, `/account`, and `src/lib/gate.ts`. **No `SessionProvider`,
  no `useSession` anywhere** — a client-side auth slot was not possible without adding a provider.
- Content gating is `FEATURE_AUTH_GATE=true` + a `layout.tsx` calling `requireUser()`, on
  **`/ask`, `/digests`, `/entities`, `/middle-east`, `/registry`**.
  *(The doc comment in `gate.ts:4-7` lists only three of these — it omits `ask` and `middle-east`.
  Logged as a stale comment; not touched, out of scope.)*
- `/account` already had the account UI: email as `<h1>`, subscription list, `Sign out` server
  action. The header's account menu reuses that shape rather than inventing new account features.
- There is **no `error.tsx` / `global-error.tsx` anywhere in the app tree.**

### i18n

- `LOCALE_REGISTRY` declares **10 locales**, but only **7 ship a catalog** (`en, uk, de, fr, pl,
  ar, ja`). **`es`, `he`, `ko` have no catalog** and fall back to English *per key* — that is
  already true of every existing string, not something this change introduced.
- `he` is declared `dir: "rtl"`, so it already renders English text in an RTL document.
- Flat dotted keys; `makeT` does `d[key] ?? en[key] ?? key`; `{token}` interpolation.
- **The existing i18n tests do not guard translation completeness.** `every English key resolves
  to a non-empty string for every locale` is satisfied by the English fallback, and the namespace
  test only checks ≥1 key per namespace. Adding English-only keys would have passed the suite
  silently. This change adds a test that closes that hole for the header's keys specifically.

### Theaters — from the database, not the docs

```
iso2  name           status       digests  latest
ru    Russia         active            27  2026-07-09
ua    Ukraine        active            20  2026-07-09
ir    Iran           active            19  2026-07-09
qa    Qatar          active             5  2026-07-09
ae    UAE            active             5  2026-07-08
om    Oman           active             4  2026-07-08
il    Israel         active             3  2026-07-09
sa    Saudi Arabia   active             2  2026-07-08
bh/kw               scaffolded          0  —
cn    China          deferred           0  —
```

Eight countries are `active`, not three. Only `ru`/`ua`/`ir` have real depth, and the long-standing
`home.live` copy already says "Live now: Russia · Ukraine · Iran". **The nav promotes those three;
the other five stay reachable from `/countries`.** Promoting a 2-digest theater to the top nav of a
product that sells validated coverage would be the kind of overstatement this codebase's
"truth-in-UI" policy exists to prevent.

---

## Final nav map (label → route)

| Nav | Label (en) | Route | Gated? |
|---|---|---|---|
| **Product** ▾ | Daily intelligence feeds | `/countries` | no |
| | Ask the data | `/ask` | yes |
| | Source reliability registry | `/registry` | yes |
| | Middle East registry | `/middle-east` | yes |
| | Analyst signals | `/signals` | no |
| **Coverage** ▾ | Russia | `/countries#ru` | no |
| | Ukraine | `/countries#ua` | no |
| | Iran | `/countries#ir` | no |
| | All theaters | `/countries` | no |
| **Validation** | Validation | `/scoreboard` | no |
| **Solutions** ▾ | Sanctions & trade evasion | `/trade` | no |
| | Commodity & supply-chain risk | `/critical-materials` | no |
| | Economic data suppression | `/datadark` | no |
| | Political risk & signals | `/signals` | no |
| **Pricing** | Pricing | `/pricing` | no |
| auth slot | Sign in / Account · Sign out | `/signin` / `/account` | — |
| language | 10 locales | `/api/locale?set=<code>` | — |

`/signals` intentionally appears twice (Product and Solutions) — same destination, two discovery
paths, per the brief. `canonicalSection()` assigns it to **Product** so only one trigger ever
highlights. Likewise `/countries` appears in both Product and Coverage; **Coverage** owns it.

**Zero routes changed. Zero dead links** — a test walks `src/app/**/page.tsx` and asserts every
nav href resolves to a real page.

### Solutions mapping — two corrections to the brief

The brief supplied these mappings "without reading the pages" and asked that they be confirmed.
Two were wrong:

1. **`Sanctions compliance` → `/datadark`** ✗
   `/datadark` is the **Data-dark tracker**: *"Russia has classified 400+ statistical indicators
   since early 2025. When a series stops publishing … the suppression is itself a signal."*
   It tracks a state hiding **its own statistics**. It has nothing to do with sanctions screening
   or compliance. Labelling it "Sanctions compliance" would have been a false product claim.
   → **`Economic data suppression` → `/datadark`**

2. The page that *is* about sanctions is **`/trade`**: *"Mirror-trade & evasion watch … When a
   hub's exports of dual-use goods jump far above their pre-war baseline … it signals rerouting."*
   The brief had it as a separate item, `Trade evasion monitoring`. Merged: it is the single
   sanctions/evasion surface.
   → **`Sanctions & trade evasion` → `/trade`**

3. `Commodity risk` → `/critical-materials` is **directionally right but imprecise**. The page is
   *"Critical-materials choke points … where US imports of a critical good concentrate in one or
   few geopolitically-exposed suppliers"* — HHI concentration, not price risk.
   → **`Commodity & supply-chain risk`**

4. `Political risk & signals` → `/signals` is **confirmed**. The page computes *"deterministic
   cross-cutting flags over the entity graph, procurement, data-transparency and trade layers"*.

### Coverage — theater pages don't exist

The brief asked Coverage to link "the live RU/UA theater page(s)". **There are none.** There is no
`/theaters/ru`; the per-theater surface *is* the digest at `/digests/<iso2>/<date>`, which is
behind `FEATURE_AUTH_GATE`. Pointing a top-level nav item for first-time enterprise buyers at a
sign-in wall defeats the purpose of the restructure.

Coverage therefore links `/countries#<iso2>` — the ungated index, anchored at that theater's card,
which itself links onward to the latest digest. `id={iso2}` + `scroll-mt-24` added to the cards.
The digest deep link is offered on the **signed-in homepage**, where the gate is already satisfied.

This also keeps zero DB queries in the header.

---

## Rendering approach (Task 3)

**(a) Server-side session read.** Justified by the Task 0 build output: every route was already
dynamic, so there was no static/ISR output to sacrifice, and (b) would have added a hydration swap
for no benefit. `SiteHeader` is an async server component; only the interactive shell below it is
`"use client"`.

Two hardening decisions came out of this:

- **`src/lib/session.ts` — `currentUserEmail()`** wraps `auth()` in `cache()` **and a try/catch**.
  `cache()` because the root layout and the page (and any gate layout) would otherwise each issue a
  separate `database`-strategy session query per request. The try/catch because a layout-level throw
  with **no `error.tsx` anywhere** turns a Neon blip into a site-wide 500. On failure the chrome
  degrades to signed-out; `requireUser()` is untouched and keeps its own fail-closed gate.
- **Openness is keyed on pathname**, not a boolean. `open = (openPath === pathname)` means
  navigating closes the menu for free. The obvious `useEffect(() => setOpen(false), [pathname])`
  is a cascading-render bug and is rejected by this repo's `react-hooks/set-state-in-effect` lint.

---

## i18n

New keys (all additive — **no existing key's value changed**, several are pinned by tests):

```
nav.group.{product,coverage,validation,solutions,pricing}
nav.item.{feeds,ask,registry,me_registry,signals,all_theaters,
          sanctions,commodity,opacity,political_risk}
nav.{account,signout,menu,close}
home.cta.{digest,coverage}
home.live_label
home.theater.{ru,ua,ir}
```

- Translated into **all 7 locales that ship a catalog** (en, uk, de, fr, pl, ar, ja).
  Theater names were lifted from each catalog's existing `home.live` sentence so they stay
  internally consistent (uk `Росія`, ja `ロシア`, ar `روسيا`, …).
- **`es`, `he`, `ko` resolve through the English fallback**, exactly as they already do for every
  other string in the app. Shipping nav-only catalogs for them would have produced half-Spanish
  chrome on an otherwise English page — strictly worse than uniform fallback. **Flagged in
  OPEN-TASKS #21** as needing full catalogs before those markets launch.
- **Machine-translated. Not native-reviewed.** → OPEN-TASKS #20.
- Protected literals (`OSINT`, `ISW`, `Telegram`) untouched; no new key contains them.
- A new test asserts every header key exists in `en` **and** in all 6 non-English own-catalogs,
  and that the marker translator produces every label — i.e. **no hardcoded English in the header**.

### RTL

Verified live with `Cookie: locale=ar` and `locale=he`:
- `<html lang="ar" dir="rtl">`, all five group labels render in Arabic, **no English leaks**.
- `he` renders `dir="rtl"` with English fallback strings and **no raw i18n keys**.
- Dropdown panels use logical `start-0` / `end-0`; the mobile sheet uses `inset-y-0 end-0`; the
  footer link already used `ms-2`. All flip correctly under `dir=rtl`.

---

## Verification

| Gate | Result |
|---|---|
| `npm test` | **27 files / 312 tests** green (was 25 / 245 → **+67 tests**) |
| `npm run typecheck` | clean |
| `npm run lint` | clean (3 real `set-state-in-effect` errors found and fixed) |
| `npm run build` | clean; **route table byte-identical to baseline** (diffed) |

Live pass against `next dev` + the production Neon branch:

- Header renders on `/`, `/countries`, `/scoreboard`, `/pricing`, `/datadark`, `/trade`,
  `/critical-materials`, `/signals`, `/signin`, `/health`, `/entities/1` — all HTTP 200.
- `/admin/ingest` → **0 main-nav blocks** (chromeless, as designed).
- Old flat labels (`theaters`, `RU registry`, `data-dark`, `trade-evasion`) **absent from `/`**.
- 10 inline language links → **1 dropdown** (4 menu triggers + 1 hamburger, all `aria-expanded`).
- `/countries` carries `id="ru"`, `id="ua"`, `id="ir"`.
- **Every nav destination returns 200.**
- **Signed-in** (real `sessions` row + `authjs.session-token` cookie):
  `Become a founding subscriber` gone · `Read today's digest` → **`/digests/ru/2026-07-09`**
  (the actual freshest RU digest; HTTP 200) · theater quick links `/countries#{ru,ua,ir}` ·
  avatar initial rendered · header Pricing demoted (no `bg-blue-600`) · no `Sign in` link.
- **Locale switch preserves path *and* query**: `Referer: /digests/ru/2026-07-09?profile=frontline`
  → `302 → /digests/ru/2026-07-09?profile=frontline`. Cross-origin Referer → `302 → /`.

That last check is why the language links stayed plain `<a href="/api/locale?set=xx">` with **no
`?to=`**. `/api/locale` prefers an explicit `?to=` over the Referer, so threading
`?to={usePathname()}` would have **silently dropped `?profile=`** on digest pages. The Referer path
was already correct and already tested.

### Test coverage added

`src/lib/nav/site-nav.test.ts` (41 tests, node): nav order & kinds; every label→route mapping;
ME registry nested under Product not top-level; Coverage lists only live theaters; the corrected
Solutions map; `/signals` dual-path with distinct labels; **dead-link guard that walks the
filesystem**; pricing CTA on/off by session; auth slot incl. *"never leaks an email into signed-out
chrome"*; no-hardcoded-English marker test; English-key presence; **translation coverage in all 6
own-catalogs**; English fallback for es/he/ko never yields a raw key; `canonicalSection` for 14
routes incl. detail prefixes, query strings, trailing slashes; `isCurrentPage`; `latestDigestHref`
fallback; `localeSwitchHref` encoding.

`src/components/site-header-view.test.tsx` (26 tests, jsdom): signed-in vs signed-out auth slot;
account menu contents; pricing CTA treatment both ways; the contents of all three dropdowns;
`aria-expanded` sync; ArrowDown-opens-onto-first-item; arrow/Home/End cycling **with wrap**;
Escape closes **and returns focus to the trigger**; language dropdown lists all 10 locales with
`/api/locale?set=` hrefs and per-item `lang`/`dir`; exactly one `aria-current`; `aria-current="page"`
on the active link; **only the owning group trigger** gets `data-current`; mobile sheet groups,
Escape + focus restoration, focus trap + body-scroll lock, signed-in controls; **neither dropdown nor
sheet re-opens on back-navigation**; the nav landmark is named from the localized labels; `/admin`
renders nothing.

Test infra: `jsdom` + `@testing-library/react|dom|user-event` added as devDependencies;
`vitest.config.ts` now collects `*.test.tsx`. jsdom is opted into **per file** via a
`// @vitest-environment jsdom` docblock, so the 25 existing node suites keep running in node.

---

## Post-review fixes

The diff was then reviewed adversarially across six dimensions (a11y, React/Next boundary,
i18n/RTL, security, test quality, UX regression), with every raised finding sent to three
independent refuters and killed on a majority. **10 raised, 3 survived.** All three were real and
are fixed in `30997f0` and `51b863c`; each has a test that was verified to fail without the fix.

1. **(high) The menu re-opened by itself on back-navigation.** My own trick caused this. Openness
   was derived as `open = (openPath === pathname)` so that navigating would close the menu without
   a `setState`-in-effect. But the header lives in the root layout and **survives soft navigation**,
   and nothing ever cleared `openPath`. Open Product on `/pricing` → click a menu item → land on
   `/ask` (menu hides) → press **Back** → `openPath === "/pricing"` again → the dropdown springs
   open with no user action. Same for the full-screen mobile overlay.
   Fixed with a plain boolean plus a **render-phase reset** (React's documented alternative to
   `useEffect(() => setState(...), [dep])`), which this repo's `react-hooks/set-state-in-effect`
   rule also accepts.

2. **(medium) `aria-label="Main"` was hardcoded English** on both `<nav>` landmarks — so an Arabic
   screen-reader user heard the primary navigation announced in English while every other header
   string was localized. This violated the invariant written at the top of `site-nav.ts`.
   Added `nav.main` to all 7 catalogs and threaded it through `HeaderLabels`. Verified live:
   `en → "Main"`, `de → "Haupt"`, `ar → "الرئيسية"`, `ja → "メイン"`, and zero `aria-label="Main"`
   remaining on the Arabic page.

3. **(medium) The "Escape returns focus to the trigger" test was vacuous.** It opened the menu with
   `user.click`, which leaves focus *on the trigger*, so `expect(activeElement).toBe(trigger)` held
   whether or not focus was ever restored — demonstrated by deleting the restore and watching the
   test stay green. It now opens with `ArrowDown` so focus genuinely lands on a menu item first.

Two defects had already been found and fixed by self-review before the workflow returned
(`30997f0`): dropdowns only closed on pointer-down-outside, so **tabbing off a trigger could leave
two menus open at once**; and the mobile sheet declared `role="dialog" aria-modal="true"` while the
background stayed **focusable and scrollable** — a claim to assistive tech the DOM did not honour.
Now closes on focus-out, traps Tab, and locks body scroll. (The review independently raised the
`aria-modal` issue and it was killed as already-fixed against current code.)

Fixing (1) also exposed a **bug in the new test helper**: re-rendering the *same element object*
makes React bail out, so the component never observed the new pathname and the repro passed for
the wrong reason. The helper now builds a fresh element per navigation — worth recording, because
a "passing" navigation test that never re-renders is worse than no test.

Seven findings were killed on verification, including: the `<p>` email row inside `role="menu"`
(the email is already the accessible name of both the trigger and the menu, so no information is
lost — a spec nit, addressed anyway with `role="none"`); the header's client JS shipping to
`/admin` where it renders `null` (a bundle-size point, not correctness); and brittleness of the
`bg-blue-600` assertion in the pricing-CTA tests (accepted — the class *is* the CTA treatment, and
the model-level `cta` boolean is tested separately).

## Decisions

1. **Server-side session read**, because every route was already dynamic. (Task 0 build output.)
2. **`/datadark` is not a sanctions page** — mapping corrected, see above. Truthfulness over
   matching the brief.
3. **`/trade` absorbs the sanctions label**; there is one evasion surface, not two items.
4. **Coverage links to `/countries#<iso2>`, not to digests**, because per-theater pages do not
   exist and digests are gated. Deep digest links live on the signed-in homepage instead.
5. **Only ru/ua/ir in the nav**, though eight countries are `active` — the other five have 2–5
   digests each.
6. **Header mounted in the root layout**, not a `(public)` route group: route groups require
   *moving* files, and repo policy is additive-only. `/admin` opts out by pathname.
7. **`?to=` deliberately not used** on locale links; the Referer preserves the query string.
8. **Dropdowns hand-rolled** — no Radix/shadcn exists to match.
9. **`cache()` + try/catch around `auth()`** in chrome; the gate keeps its own behaviour.
10. **Existing breadcrumbs kept** below the global header (brief), and existing `nav.*` keys kept
    even though the flat nav is gone (their values are pinned by tests; removal would be a
    non-additive change for no gain).
11. **es/he/ko left on English fallback** rather than given nav-only catalogs.

## Deferred (→ OPEN-TASKS)

- **#20** Native-speaker review of the new header strings in de/fr/pl/ja/ar/uk.
- **#21** `es`, `he`, `ko` have no catalogs at all — full translation before those markets launch.
- **#22** Combined registry landing page (RU + ME under one index). Today `/registry` is RU-only
  and `/middle-east` is ME-only; the nav nests ME under Product as a secondary item.
- **#23** Per-user default theater. "Read today's digest" hardcodes `ru`; there is no preference
  storage and this change did not invent one.
- **#24** Persona pages for the four Solutions entries (real buyer briefs) if we later want
  Solutions to land somewhere other than the module pages.
- **#25** `src/lib/gate.ts:4-7` doc comment is stale — omits `/ask` and `/middle-east`.
- **#26** No `error.tsx` / `global-error.tsx` anywhere. The header now defends itself, but a
  DB failure inside a *page* still yields an unstyled Next error.
- **#27** A skip-to-content link. Now that a nav precedes `<main>` on all 22 pages, keyboard users
  traverse it every time. Needs `id="main"` on each page — deliberately not bundled here.
