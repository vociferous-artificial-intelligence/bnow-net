# IA Refinement & Architecture Review — 2026-07-12

Sprint: information-architecture refinement + signals gating + crawl policy.
Branch `20260712-ia-refinement` (tag `pre-ia-refinement-20260712`). Model: Opus, high effort.

Prior IA state: `docs/reviews/NAV-RESTRUCTURE-REVIEW.md` (grouped-dropdown header). This
sprint fixes four residual problems a live review found: many-to-one nav redundancy,
anchor-not-destination country links, understated coverage count, and a public/indexable
`/signals` page leaking analytical specifics.

---

## TASK 0 — Inventory, baseline & decision inputs (verified against the repo)

### 0.1 Nav model (source of truth: `src/lib/nav/site-nav.ts`, rendered by `src/components/site-header-view.tsx`)

The observed production map is confirmed in code. Entries (order):

| Top-level | kind | children → route |
|---|---|---|
| **Product** ▾ | group | feeds → `/countries` · ask → `/ask` · signals → `/signals` |
| **Coverage** ▾ | group | ru → `/countries#ru` · ua → `/countries#ua` · ir → `/countries#ir` · all → `/countries` |
| **Validation** | link | `/scoreboard` |
| **Solutions** ▾ | group | sanctions → `/trade` · commodity → `/critical-materials` · opacity → `/datadark` · political_risk → `/signals` |
| **Pricing** | link | `/pricing` (CTA when signed-out) |

`(registry / middle-east were already dropped from nav on 2026-07-12 R5 — admin-only.)`

**Redundancy confirmed (Problem 1):** `/countries` is the destination of **5** nav paths
(Product›feeds + Coverage's four — the three theater items are `#ru/#ua/#ir` anchors that
scroll the one page, resolved by `id={iso2}` on each card in `countries/page.tsx`).
`/signals` is the destination of **2** (Product›signals + Solutions›political_risk).

`canonicalSection()` already resolves each of `/countries` and `/signals` to a single
"current" section (coverage, product) so triggers don't both light — but the underlying
five-to-one link redundancy is real and is what reads as broken.

### 0.2 Theater ground truth (DB `countries`, queried 2026-07-12)

**8 active**, **2 scaffolded**, **1 deferred (hidden)**:

| status | theaters (digest count) |
|---|---|
| active | ru (34), ir (28), ua (23), ae (9), om (8), qa (8), il (6), sa (6) |
| scaffolded | bh (0), kw (0) → "coverage launching" |
| deferred | cn → hidden (`/countries` filters `status != 'deferred'`) |

Authoritative live list = `countries.status = 'active'` (8 rows). `slug` column exists
(russia, ukraine, iran, israel, oman, qatar, saudi-arabia, uae, …). The nav's
`LIVE_THEATERS` const promotes only the flagship 3 (ru/ua/ir) — deliberate under standing
ruling 15 (promoting 2–9-digest theaters overstates depth). `home.live` hardcodes "Russia ·
Ukraine · Iran" → the 3-vs-8 undersell (Problem 3).

### 0.3 `/signals` data path & sensitivity (`src/app/signals/page.tsx`, `src/lib/analyst/{run,signals}.ts`)

- **Server component, `force-dynamic`.** `computeSignals()` runs **server-side** and is
  imported **only** by this page — there is **no `/api/signals` endpoint and no client fetch**
  (grep-confirmed). The evidence drill-down query runs **only when `signedIn`**, so claim text
  + source URLs are **already gated server-side** (anon sees a count + sign-in prompt). Good.
- **The residual leak:** each signal's `detail` string is rendered **unconditionally**
  (`<p>{s.detail}</p>`). Field-by-field:

  | signal.kind | `headline` (safe teaser) | `detail` (SENSITIVE — currently public) |
  |---|---|---|
  | purge | "N officials under prosecution/dismissal in 14d" | "…Targets incl.: **{up to 6 named individuals}**." |
  | data_dark | "N statistical series classified or gone" | "Suppressed: {series labels}…" |
  | trade_divergence | "N dual-use flows rerouting to Russia flagged" | "{reporter}/{HS good}: {reason}…" |

  Every `headline` is a **count + type + theater + severity** — safe. Every `detail` carries
  the **specifics** (named individuals, target/flow lists). Clean boundary: **headline public,
  detail gated.**

### 0.4 SEO / crawl baseline

- **No `robots.txt`** (404s — confirmed: no `src/app/robots.*`, no `public/robots.txt`).
- **No `sitemap.xml`** (no `src/app/sitemap.*`).
- **No `noindex` anywhere.** Only metadata is the static root `<title>/<description>`
  (`src/app/layout.tsx`); **no page uses `generateMetadata`** — per-country SEO is greenfield.
- **Gating map** (layouts): gated `requireUser` (307→/signin) = `/digests`, `/entities`,
  `/ask`, `/search`; admin-only `requireAdminOr404` (404) = `/registry`, `/middle-east`;
  `requireAdmin` = `/admin`. Public = `/`, `/countries`, `/scoreboard`, `/pricing`,
  `/signals`, `/trade`, `/critical-materials`, `/datadark`, `/health`, `/signin`.

### 0.5 Render modes

Every touched page exports `dynamic = "force-dynamic"` (home, countries, signals, scoreboard,
pricing, trade, critical-materials, datadark, digests/[country]). New `/countries/[iso2]` and
`sitemap.ts` query the DB → dynamic by construction; `robots.ts` is static. **No static/ISR
route exists to flip** (matches the NAV-RESTRUCTURE rendering note). Verified against
`next build` in TASK 5.

### 0.6 i18n contract (`src/i18n/dictionaries.ts`, `i18n.test.ts`, `site-nav.test.ts`)

- 10 locales declared; **7 ship a catalog** (en full, uk near-full, de/ar/ja/pl/fr partial);
  **es/he/ko have no catalog** → per-key English fallback (OPEN-TASKS #21).
- Tests enforce: every en key resolves for every locale (fallback ⇒ new en keys are safe);
  each translated catalog covers every REQUIRED_NAMESPACE (≥1 key); own translations preserve
  en's `{token}` set; **the leftover-token test only knows a fixed `vars` allow-list**
  (`sources,citations,docs,runs,n,channels,platforms,total,pct,amount,time,days,date`) — a new
  interpolation token must reuse one of these or be added to the list.
- **Header/nav labels** are translated in all 7 own catalogs (enforced by `site-nav.test.ts`
  "translates every header key in every locale that ships a catalog"). **Page-body keys**
  (signals.*, countries.*) live in en+uk and fall back elsewhere — the established pattern.
  ⇒ New **nav** labels: machine-translate into all 7 + flag native review. New **page** copy:
  en + provisional uk, rest fall back.

### Decisions taken in TASK 0 (carried into implementation)

1. **Per-country route = `/countries/[iso2]`** (index stays `/countries`), keyed by iso2 to
   match the sibling `[country]` = iso2 convention of `/digests/[country]` and
   `/scoreboard/[country]` and avoid a slug→iso2 lookup on every cross-link. One dynamic route
   serves all non-deferred theaters (no hand-authored pages, no invented content).
2. **Retire the Product group; promote Signals + Ask to top-level; drop the
   Solutions›political_risk duplicate.** Rationale in TASK 1.
3. **Signals gating = `headline` public / `detail` gated**, withheld via an explicit
   `toPublicSignal()` data-layer projection the anon render path consumes (not CSS/DOM hiding).
4. **Fragment anchors (`/countries#ru`) cannot be server-redirected** (the `#` never reaches
   the server). They stay functional because `/countries` keeps its `id={iso2}` card anchors;
   bookmarked/emailed links land on the index and scroll. The index cards additionally link
   onward to the new per-country pages. No 404, no broken link.
5. **Coverage count driven from `countries.status='active'`** (live), phrased to name the
   flagship-3 depth while stating the true live count — honest on both axes (ruling 3).

---

## TASK 1 — Nav restructure

`src/lib/nav/site-nav.ts` + `site-nav.test.ts` + `site-header-view.test.tsx`.

**Before → after (item → route):**

| Before | After |
|---|---|
| **Product** ▾ (feeds→/countries, ask→/ask, signals→/signals) | **retired** — its children duplicated destinations reachable elsewhere |
| **Coverage** ▾ (ru/ua/ir→`/countries#…`, all→/countries) | **Coverage** ▾ (ru→`/countries/ru`, ua→`/countries/ua`, ir→`/countries/ir`, all→/countries) |
| **Validation** → /scoreboard | **Signals** → /signals *(promoted from Product)* |
| **Solutions** ▾ (…, political_risk→/signals) | **Ask** → /ask *(promoted from Product)* |
| **Pricing** → /pricing | **Solutions** ▾ (sanctions→/trade, commodity→/critical-materials, opacity→/datadark) — political_risk duplicate **dropped** |
| | **Validation** → /scoreboard · **Pricing** → /pricing |

Final bar: `Coverage ▾ | Signals | Ask | Solutions ▾ | Validation | Pricing | Sign in/Account | Language`.

**Product-retirement decision:** the three Product children were each reachable elsewhere —
"Daily intelligence feeds" *is* Coverage, "Analyst signals" *is* the (new) top-level Signals,
"Ask the data" *is* the (new) top-level Ask. Retiring the container and surfacing the two
genuinely distinct destinations (Signals, Ask) directly removes the "Product/Coverage are the
same menu twice" duplication.

**Signals-dedup decision:** the prior sprint intentionally double-listed /signals (Product +
Solutions). With Signals promoted to its own top-level item, the Solutions›political_risk
entry became a second nav path to the same page — exactly the many-to-one pattern this sprint
removes — so it was **dropped**. Solutions stays a coherent three-item vertical-modules menu
(trade evasion, commodity risk, data suppression), each a distinct destination. **Result: no
route is the target of >1 nav path** (except /signin, /account); pinned by the "gives every
route exactly one nav path" test.

Dead-link safety: the unit test walks `src/app` and matches concrete hrefs against dynamic
route patterns (`/countries/ru` ⇄ `/countries/[iso2]`). Now-unused i18n keys
(`nav.group.product`, `nav.item.{feeds,registry,me_registry,political_risk,ask,signals}`) were
left in place — harmless, and removing across 7 catalogs is churn/risk; trivial cleanup debt.

## TASK 2 — Per-country pages + honest coverage

- **Route `/countries/[iso2]`** (`src/app/countries/[iso2]/page.tsx`) — one dynamic route
  serves every non-deferred theater. Public, indexable coverage landing: live/launching badge,
  documents ingested, daily-digest count, latest-run coverage % vs ISW, links to the latest
  digest / archive / scoreboard. All public-safe aggregates (same class as the /countries
  card) — no claim text, no source URLs. `notFound()` for malformed iso2 (no DB hit) or a
  deferred/absent country. Localized `generateMetadata` (title + description per theater;
  country name composed outside `t()` so no `{country}` token enters the catalogs).
- **Coverage dropdown → real links** via `theaterHref()` = `/countries/${iso2}`;
  `latestDigestHref` fallback now lands on the per-country page instead of a `#anchor`.
- **Old anchors** `/countries#ru`: fragments never reach the server, so they can't be
  server-redirected — and don't need to be. The /countries index keeps its `id={iso2}` card
  anchors, so bookmarked/emailed links still land on the index and scroll; the cards now also
  link onward to the per-country pages. Zero dead links.
- **3-vs-8 fix:** signed-out home `home.live` is now `"Live now: {n} theaters — daily depth in
  Russia, Ukraine and Iran"` with `{n}` from `count(*) countries WHERE status='active'` (8).
  Honest on both axes — states the true live count (fixes the undersell) while naming the
  flagship trio as the deep coverage (avoids overstating depth on the shallow five; ruling 3 +
  ruling 15). Driven from the authoritative list, so it can't drift.

## TASK 3 — Signals gating + crawl policy

- **Gating (`toPublicSignal()` in `src/lib/analyst/signals.ts`):** projects a `Signal` to its
  safe teaser — `{key, kind, theater, severity, headline (count), evidenceCount}` — and drops
  `detail` (named individuals / suppressed-series labels / reporter-flow lists),
  `evidenceClaimIds`, `evidenceRefs`. `src/app/signals/page.tsx` references `s.detail` and the
  per-claim evidence **only inside the `signedIn` branch**; the anon branch renders solely from
  the projection, so the specifics never enter the server-rendered HTML for an unauthenticated
  client (server component, `force-dynamic`, no `/api/signals`, `computeSignals` imported only
  here — verified in TASK 0). This is data-layer withholding, not a CSS/DOM hide. The evidence
  DB query already ran signed-in only.
- **Auth-boundary test** (`src/app/signals/page.test.tsx`) renders the real page component
  signed-out and asserts the target names + the `detail` phrasing are ABSENT from the HTML and
  the gated query never fired; signed-in, they're present. Plus `toPublicSignal` unit tests
  (projection drops the sensitive fields; serialized JSON carries no target name; headline is
  count-only).
- **Crawl policy:** `src/app/robots.ts` allows the public marketing + teaser pages, disallows
  the gated/admin/API routes; `src/app/sitemap.ts` lists the public surface + one entry per
  active theater (DB-driven, degrades to the static set); `siteBaseUrl()` = `https://bnow.net`
  (env-overridable). /signals is intentionally NOT disallowed — crawlers only ever see the safe
  teaser, which is the value demonstration that earns search traffic. There is no per-signal
  route to `noindex`; the specifics are withheld from the teaser page's anon HTML entirely,
  which is stronger than `noindex`.
- **Legal note (for Gregory, not code):** even with names now behind auth, the app still
  frames living individuals as under "possible factional purge/prosecution" as *analytical
  judgments* on the signed-in page. Warrants a counsel review of (a) disclaimer placement/
  prominence and (b) whether specific names should appear at all vs. role/count descriptors.
  Filed as OPEN-TASKS (see below).

## TASK 4 — Architecture review (independent, read-only subagent)

An independent reviewer verified the sprint against all seven checks on the committed diff
(`git diff main...HEAD`), running the suite, build, typecheck and lint itself. **Verdict: all
7 PASS**, one low-severity cosmetic CONCERN, no defects.

1. **Gating real, not cosmetic (highest) — PASS.** `s.detail` and the per-claim evidence are
   referenced only inside the `signedIn` branch (`signals/page.tsx`); the anon branch renders
   solely from the `toPublicSignal` projection. No `/api/signals`, `computeSignals` imported
   only by the server page, `ClaimSources` is server-only and signed-in-only → the specifics
   cannot reach the flight payload / `__NEXT_DATA__`. Evidence query skipped for anon. The
   auth-boundary tests use complementary present/absent assertions (can't false-pass). No input
   leaks a name/figure into the public `headline`.
2. **No dead links / orphans — PASS.** Every nav href resolves (dynamic-segment aware); old
   `#ru` anchors still scroll; per-country route `notFound()`s for deferred/unknown/malformed.
3. **No many-to-one collisions — PASS.** Every href (except /signin,/account) has exactly one
   nav path; before→after map matches `buildSiteNav`.
4. **Render modes preserved — PASS.** `/countries/[iso2]` ƒ, `/sitemap.xml` ƒ, `/robots.txt` ○;
   every pre-existing route stays ƒ; nothing flipped.
5. **i18n + RTL — PASS.** New nav labels in all 7 own catalogs; `home.live` `{n}` in all 7;
   `countries.detail.*` en(+uk) with fallback; only allow-listed tokens; Arabic real.
6. **Accessibility — PASS.** aria-expanded/haspopup, arrow/Home/End/wrap, Escape+focus-restore,
   single-menu-open, exactly-one aria-current, top-level Signals gets aria-current on /signals,
   mobile focus trap — all covered green.
7. **SEO — PASS.** robots disallows exactly the gated/admin/API set and not the teasers; sitemap
   lists only public URLs + active theaters, degrades on DB error; per-country metadata
   localized; robots/sitemap not behind the gate.

**CONCERN (low, addressed):** on a total DB failure the signed-out hero's honest count would
read "Live now: 0 theaters". **Fix applied** (`page.tsx`): the line renders only when
`activeTheaters > 0`, so a degraded render omits the count rather than asserting a false zero
(truth-in-UI). Also applied while here: `siteBaseUrl()` now prefers
`VERCEL_PROJECT_PRODUCTION_URL` (the real production host) over the hardcoded default, so
robots/sitemap advertise the serving origin and switch to bnow.net automatically when it
becomes the production domain. Both covered by tests (`page.test.tsx`, `seo.test.ts`).

## TASK 5 — Verify & ship

- **Gate:** `npm test` **1075/1075 green (87 files)**, `npm run typecheck` clean,
  `npm run lint` clean, `next build` clean (route table unchanged except the additive
  `/countries/[iso2]`, `/robots.txt`, `/sitemap.xml`).
- **New/changed tests:** per-country page (7: active/scaffolded/notFound/metadata), signals
  auth-boundary (2) + `toPublicSignal` (4), robots/sitemap/siteBaseUrl (7), nav restructure
  (rewritten), home coverage-count, header component (rewritten for the new bar).
- **Deploy:** see the decision-log entry in AGENTS.md for the deploy id + rollback target and
  the post-deploy smoke (signed-out `/`, `/countries/ru`, `/robots.txt`, `/sitemap.xml`, and a
  `curl` of `/signals` confirming no names in the anonymous HTML).

### Deferrals → OPEN-TASKS
- **#58** legal-exposure review of named individuals on the signed-in /signals view (operator).
- **#59** native review of the new/changed i18n strings (nav labels, `home.live`,
  `countries.detail.*`).
- **#60** remove the now-dead nav i18n keys (trivial cleanup).
