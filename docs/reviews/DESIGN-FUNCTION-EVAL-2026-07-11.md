# Design & Functionality Evaluation — 2026-07-11

**Scope:** product/design evaluation only — what the signed-in homepage and the
source/claim/signal surfaces should show, and stop showing. No implementation here.
**Method:** read-only against source (`main` @ `2884f50`), the live Neon DB
(`scripts/sqlq.ts`, SELECT-only), and the live deployment at
https://bnow-net.vercel.app — verified both signed-out and signed-in (magic-link
test session for go@vociferous.nyc, consumed via curl cookie jar).
**Branch:** `eval/design-function-2026-07-11`; this file is the only new artifact.
**Session paid spend: $0.00 LLM / $0.00 paid API.** Two Postmark magic-link emails
were sent (auth test); no OpenAI/X/OpenSanctions call was made.

> **Working-tree caveat:** the tree already carried uncommitted changes from the
> 07-10 recon session (`AGENTS.md`, `docs/OPEN-TASKS.md` modified; two untracked
> docs). They are untouched by this session and excluded from this branch's commit.
> "Zero tracked files modified" therefore holds for *this session's* changes, not
> for the inherited tree state.

---

## Executive summary

1. **Task 1 (homepage):** the CTA swap already shipped — the real win is replacing
   the three *marketing feature cards* with a per-theater data-state panel.
   "Last ranking run" is **not a coherent concept** under mapreduce; the honest
   primitives are ingest freshness, digest generated-at, and next scheduled
   synthesis (plus a registry "scores as of" date, which is currently 07-03 —
   stale against the 07-09 crawl).
2. **Task 2 (sources table):** the full ranked registry (9,964 scored sources,
   50/page, ~200 pages) is copyable today by anyone with a free email address —
   Stripe is off, so "signed-in" ≠ "paying". Recommend gating the *ranked index*
   behind the admin/role concept (which must be built — none exists) while keeping
   per-claim citations and per-source detail pages for regular users. Needs a
   Gregory decision on moat-vs-transparency posture.
3. **Task 3:** shortlist = scoreboard tiles on home (data already computed),
   a "corroborated share" (≥2 sources) trust signal instead of the mislabeled
   unsupported-claim rate, and per-claim source-diversity badges. Defer
   "since your last visit" (no per-user storage exists).
4. **Task 4 (many sources per claim):** real problem — live ru digest renders up to
   16 uncapped chips per claim with visible duplicates. Show up to 6, selected by
   platform-then-channel diversity (NOT domain — 95 cited sources share `x.com`,
   53 share `t.me`), collapse the rest behind a native `<details>` disclosure.
   shadcn `Collapsible` is inapplicable — this repo bans shadcn/Radix.
5. **Task 5 (signals):** the count renders as "N supporting claim(s) · traceable to
   sources", is double-counted (32 edges vs 30 distinct claims — bug), and the
   underlying claims are never fetched. Recommend: dedupe the count; for signed-in
   users server-render the evidence inside the same `<details>` component; signed-out
   users (the page is public) get the count + a sign-in prompt.

**Highest-value next task:** the shared `ClaimSources` disclosure component +
digest-page adoption (punch list #1) — it unblocks Tasks 4 and 5 and fixes the
worst live rendering problem.

---

## 0. Baseline (verified 2026-07-11 ~04:35–05:00Z)

### 0.1 Logged-in homepage — the CTA swap already shipped

`src/app/page.tsx` is a server component, `export const dynamic = "force-dynamic"`
(`:9`), session read server-side via `currentUserEmail()` (`src/lib/session.ts:15-23`,
a cached, never-throwing `auth()` wrapper). Signed-in users get utility actions
(`:49-75`): **Read today's digest** (deep link to the latest RU digest via
`latestDigestHref`, hardcoded flagship — code comment `:51-52`: "there is no
per-user default-theater storage to read"), **See the scoreboard**, **Explore live
coverage**, plus a "Live now: Russia · Ukraine · Iran" line. Signed-out users get
Subscribe/scoreboard CTAs (`:76-88`). **Verified live on the deployment in a
signed-in session: the utility CTAs render; no Subscribe CTA.**

What remains for signed-in users is the *marketing* below the hero: three feature
cards (`:91-122`) — "Reliability, derived not asserted" (9,964 sources / 348,586
citations), "Claims you can audit" (55,346 raw documents), "Scored against experts,
daily" (49 validation runs) — sales copy with "explore →" links. This is the space
Task 1 should reclaim.

*(Live stat drift vs AGENTS.md snapshot: homepage renders 9,964 cited sources /
348,586 citations vs the documented 6,985 / 251K — the registry grew with continued
crawling. Not a defect; the AGENTS.md snapshot numbers are stale.)*

### 0.2 Freshness signals that actually exist

| Signal | Where | Per-theater? | Currency (verified live) |
|---|---|---|---|
| Last doc ingested | `raw_documents.fetched_at` + `country_iso2` | yes | ru 04:45Z / ua 04:12Z / ir 04:45Z; docs-24h: ru 1,572 / ua 664 / ir 1,073 |
| Docs by adapter | `raw_documents.adapter` (`rss\|gdelt\|telegram_web\|x_api\|manual`) | yes | X adapter dark since 07-09 20:21Z (cap-frozen, OPEN-TASKS #38) |
| Map frontier | `doc_map_state.mapped_at` (theater via join to `raw_documents`) | yes | all three theaters mapped through 04:40Z (hourly `:40` cron) |
| Digest generated-at | `digests.created_at` — **reset to `now()` on every regeneration** (upsert `DO UPDATE … created_at=now()`, `src/lib/analysis/digest-persist.ts:110`); no `updated_at` column | yes (`country_id`+`track`) | all six flagship (theater, track) pairs regenerated 04:02–04:06Z by the 04:00 intraday slot |
| Digest coverage window | `digests.structured->'stats'->'reduce'->'window'` `{from,to,mode}` (`synthesize.ts:611-632`) | yes | present on every mapreduce digest |
| Validation last run | `validation_runs.run_at` (theater via digest join) | yes | ru/ua/ir all 07-10 07:00Z; next 07:00Z daily |
| Cron health | `cron_runs` (job, started_at, finished_at, ok, counts) | **no — global per job** (`ingest:fast`, `map`, `digest:intraday` each fold all theaters into one row; the 3 intraday slots share one job name, `digest/route.ts:32`) | all jobs green |
| Registry score horizon | `sources.last_cited_report_date` max | per-theater via `source_theater_stats` | **2026-07-03** — vs `isw_reports` crawled through **07-09**. Scores refresh only when the operator runs `scripts/registry-materialize.ts` (manual, not a cron) |
| provider_usage | `(provider, day)` rows, `updated_at` last-writer | **no** theater dimension | can only answer "did any reduce call bill today" |
| Deployed cadence | `vercel.json` | n/a | ingest */15 + hourly :10/:20 · map :40 · digest 02:00 finalize + 04:00/10:00/19:30 intraday · validate 07:00 (all UTC) |

Caveat for implementers: `raw_documents.fetched_at` has **no index** (schema indexes
are hash/adapter/country/published/processed only) — fine at 55K rows, worth a
`(country_iso2, fetched_at)` index if the panel query ever shows in slow logs.

### 0.3 Source registry surfaces, and what "gated" actually means

- **`/registry`** (`src/app/registry/page.tsx`): full ranked table — canonical_url
  (linked to `/registry/{id}`), platform, citation count, **reliability score to
  2dp**, hedging-mix bar with percentages, citation span, decayed status. Ordered
  by reliability or citations, 50/page with unlimited offset paging (~200 pages).
  Gated by `requireUser()` (`registry/layout.tsx:4`).
- **`/registry/[id]`**: adds the **weighting legend** ("confirmed 1.0 · assessed .75
  · unknown .5 · claimed .4 · unverified .15"), per-theater reliability stats,
  citations-by-year, recent ISW citations with hedging cues, recent ingested docs.
  Sequential integer ids → enumerable by id-walking.
- **`/middle-east`** (`middle-east/page.tsx`): the same exposure for ir, computed
  live from `source_citations` with the hedging→weight CASE inline in the SQL.
- **Auth reality:** `FEATURE_AUTH_GATE` gates `/registry`, `/middle-east`,
  `/entities`, `/digests`, `/ask` (verified live: 307 → `/signin` signed-out).
  But sign-up is an unauthenticated magic-link form — **any email address gets
  full registry access in under a minute; Stripe is flagged off, so no payment
  wall exists anywhere.**
- **Roles: none.** `users` has no role column (verified via information_schema);
  no `middleware.ts` exists; the only privilege concept is `requireAdmin()`
  (`src/lib/gate.ts:17-27`) reading an `ADMIN_EMAILS` env allowlist, protecting
  exactly one route (`/admin/ingest`). With the gate on and the allowlist unset,
  `requireAdmin` redirects everyone — the allowlist must be populated in prod
  before anything else is hung off it.
- **No per-user preference storage of any kind** (no default theater, no
  last-visit, no watchlists).

### 0.4 Claim → sources rendering

- **Digest page** (`src/app/digests/[country]/[date]/page.tsx`) is the only
  claim-evidence surface. One uncapped query joins
  `claims → events → claim_sources → raw_documents LEFT JOIN sources` (`:73-89`);
  every doc renders as a chip: `{source_key ?? adapter}#{doc_id} · {reliability}`
  linking out to the doc URL (`:240-253`). **All sources render, uncapped.**
  Live ru military digest for 2026-07-11: 22 claims, 84 chips, per-claim counts
  16/10/6/6/6/4… — with visible near-duplicates (`rbc.ru` three times on one claim,
  same story re-fetched).
- **DB distribution since the mapreduce cutover** (claims created > 07-09):
  1 source 179 claims (54%) · 2 → 67 · 3–5 → 50 · 6–10 → 20 · 11–20 → 10 ·
  21+ → 3 (max 24). So collapsing affects the ~10% tail, which is exactly the
  high-corroboration tail users most need to be able to scan.
- **Diversity fields that exist:** platform enum + source_id + reliability +
  published_at. **Domain is useless as a diversity key**: among cited sources,
  95 share domain `x.com` and 53 share `t.me`; high-chip claims show 8–17 distinct
  source_ids but only 2–5 distinct domains.
- **/ask** renders cited claim ids + text with a "digest →" link — no source URLs.
  **/entities/[id]** timeline likewise links to digests, no sources. **Scoreboard**
  detail shows divergence claim text, no sources.
- **No disclosure primitive exists anywhere** — no `<details>`, no accordion, no
  collapsible. `package.json` confirms **no shadcn/ui, no Radix** (the prompt's
  shadcn `Collapsible` suggestion is inapplicable in this repo). The only
  interactive primitives are the hand-rolled ARIA `NavDropdown`
  (`src/components/nav-dropdown.tsx`, menu-button pattern) and the mobile nav
  dialog (`site-header-view.tsx`).

### 0.5 The signals page

`src/app/signals/page.tsx` — server component, `force-dynamic`, **public** (no
gating layout; `gate.ts:5-6` deliberately lists it nowhere). The element:

```
{s.evidenceClaimIds.length} supporting claim(s) · traceable to sources   (:53-57)
```

- Actual live copy: `32 supporting claim(s) · traceable to sources` — the prompt's
  "32 supporting claims linked to sources" was a paraphrase. The string is
  **hardcoded English**, not in the i18n catalogs.
- The number counts `claim_entities` **edges**, not claims: `detectPurge`
  (`src/lib/analyst/signals.ts:28-52`) maps every (claim, watched-entity, role)
  row to an id without dedup. Verified live: ru purge window = **32 edges over 30
  distinct claims**. Only purge signals populate `evidenceClaimIds`; data-dark and
  trade-divergence signals use `evidenceRefs` instead.
- The ids never reach the DOM; claim text and sources are **never fetched** —
  `computeSignals` (`src/lib/analyst/run.ts:23-32`) selects only id/entity/role/date.
  Expansion needs either a new fetch or server-rendered evidence.

### 0.6 Where the prompt's assumptions were wrong (disk is right)

1. The signed-in CTA swap **already shipped** — Task 1 is about the marketing cards
   below the hero, not the CTAs.
2. Copy is "N supporting claim(s) · traceable to sources", not "…linked to sources".
3. No shadcn/Radix exists or is allowed; the disclosure pattern must be native
   `<details>` or a hand-rolled ARIA component.
4. The registry is already auth-gated — but the gate is a free email address, so
   the moat question is real, just differently shaped.
5. The signals page is public, not gated — the Task 5 expansion has a gating
   dimension the prompt didn't anticipate.

### 0.7 Bugs & truthfulness gaps found (recorded here per ground rules, not in OPEN-TASKS)

- **B1 — signals count double-counts:** 32 rendered vs 30 distinct claims (ru purge,
  live). Fix: `Set` the claim ids in `detectPurge`.
- **B2 — registry scores carry no as-of date and are stale:** reliability aggregates
  materialized through the 2026-07-03 ISW report while `isw_reports` holds
  crawls through 07-09; nothing in the UI says so. Any surface showing scores
  should say "scores as of {max(last_cited_report_date)}".
- **B3 — hardcoded English on /signals** (the evidence line and headlines bypass
  the i18n catalogs; violates the repo's no-hardcoded-English nav convention).
- **B4 — `digest:intraday` cron rows don't record the slot** (`digest/route.ts:32`
  qualifier is `group ?? mode`) — three daily runs are indistinguishable in
  `cron_runs` except by hour.

---

## 1. Task 1 ruling — signed-in homepage: data-state panel

**Recommendation: keep the utility CTA row; replace the three marketing feature
cards (for signed-in users only) with a three-column per-theater data-state panel.**
Signed-out users keep the current cards — they are the pitch, and the pitch is
their job.

### The "ranking runs" validity question — ruled NOT VALID

Under mapreduce there is no discrete "ranking/scoring run" to timestamp:

- **Claim ranking** happens deterministically inside every digest generation
  (`reduce.ts` `scoreGroup`/`rankGroups`) — it has no identity apart from the
  digest; its honest timestamp IS `digests.created_at`.
- **Source scoring** (reliability) is the manual `scripts/registry-materialize.ts`
  batch over ISW citations — currently as-of 2026-07-03 (§0.2, B2). A "last
  ranking run" tile would surface an 8-day-old date and invite alarm, or worse,
  someone would wire it to a fresher-but-wrong timestamp.
- `provider_usage` cannot attribute a synthesis to a theater (§0.2).

**The truthful freshness primitives instead** — per theater, 4 signals:

| # | Label (en) | Source | Query shape |
|---|---|---|---|
| 1 | "Data current as of {t}" | `max(raw_documents.fetched_at)` per `country_iso2` | one grouped query, all theaters |
| 2 | "{n} documents last 24h" | same table, `fetched_at > now()-'24h'` | same query |
| 3 | "Digest generated {t}" + link | `max(digests.created_at)` per (theater), link `latestDigestHref` | join `countries` |
| 4 | "Next update ~{t} ET" | derived from the digest cadence (02:00 / 04:00 / 10:00 / 19:30 UTC) | pure code, no DB |

A fifth optional line, panel-global (not per-theater): "Validated against ISW {date}
· next 07:00 UTC" from `max(validation_runs.run_at)`.

**Truth-in-UI constraint (ruling 3 adjacent):** if the panel shows "data current as
of", a cap-frozen adapter must not hide behind a healthy aggregate — RSS keeps the
theater timestamp fresh while X has been dark for 32h+. Either add a muted
per-adapter footnote ("X paused" when `max(fetched_at) where adapter='x_api'` lags
> 3h), or explicitly scope the label to "newest document" and accept the coarser
truth. Recommend the footnote — it is exactly the honest surface OPEN-TASKS #38
says is missing.

### Design sketch

- **Component:** `src/components/theater-status-panel.tsx` — server component, no
  client JS. Rendered from `src/app/page.tsx` in the `signedIn` branch in place of
  the feature-card `<section>` (signed-out keeps the cards).
- **Layout:** `grid sm:grid-cols-3`, one card per LIVE_THEATER (reuse
  `LIVE_THEATERS` + `theaterHref`/`latestDigestHref` from `src/lib/nav/site-nav.ts`);
  card = theater name (i18n `home.theater.*` keys already exist), then the 4 rows
  above as label/value pairs; digest row links to the digest.
- **Data:** one SQL round-trip (mirror the page's existing single-query style):

```sql
SELECT rd.country_iso2 AS iso2,
       max(rd.fetched_at)                                            AS last_fetch,
       count(*) FILTER (WHERE rd.fetched_at > now() - interval '24 hours') AS docs_24h,
       max(rd.fetched_at) FILTER (WHERE rd.adapter = 'x_api')        AS last_x
FROM raw_documents rd
WHERE rd.country_iso2 IN ('ru','ua','ir')
GROUP BY 1;
-- plus, same round-trip via Promise.all:
SELECT c.iso2, max(d.created_at) AS last_digest, max(d.digest_date)::text AS latest_date
FROM digests d JOIN countries c ON c.id = d.country_id
WHERE c.iso2 IN ('ru','ua','ir') GROUP BY 1;
```

- **"Next update":** the digest cadence is a deploy-time constant. Import
  `vercel.json` directly (`resolveJsonModule`) and derive the next fire time from
  the four digest schedules with a ~15-line fixed-field cron parser (the schedules
  are all simple `m h * * *` forms; unit-test it) — importing the real file means
  the panel cannot drift from the deployed cadence.
- **Timezone:** format with `Intl.DateTimeFormat(locale, { timeZone:
  "America/New_York", … })` and label "ET" — never hardcode a UTC offset (DST).
  Users are ET today; per-user tz is a future preference (none stored, §0.3).
- **Rendering cost:** `/` is already `force-dynamic` and already queries the DB —
  marginal cost is one round-trip on a page behind session lookup anyway.
  **Acceptable.** If load ever matters, wrap the panel queries in
  `unstable_cache(..., { revalidate: 60 })`; do not make the page static — the
  session branch forbids it.
- **i18n:** all new strings through the catalogs (en+uk minimum), matching the
  nav convention.

**Stop showing (signed-in):** the three marketing feature cards, including the
"49 validation runs" vanity count — the panel's validation line replaces it with
something operational.

---

## 2. Task 2 ruling — the ranked sources table

### Value vs load for a regular user

A regular (non-analyst) user's decision on this product is *"do I trust this
claim / this digest?"* — served by per-claim citations, per-source reliability in
context (the digest chips already show it), and the per-source detail page when
they want to interrogate one source. A **ranked, paginated table of 9,964 scored
sources** answers a different question — *"which sources matter and how much?"* —
which is an analyst's sourcing decision and, more pointedly, **the exact input a
competitor needs**. For a regular user it is mostly cognitive load and mostly
functions as proof-of-methodology, which one screen of it demonstrates as well as
200 pages do.

### What exactly is exposed today (the copy inventory)

Via ~200 paged requests on a free-email account: canonical channel identifiers
(the ingest seed list — which Telegram channels and X accounts matter per theater),
our reliability score for each, the full hedging-mix distributions, citation spans,
decay status, and (on detail pages) per-theater splits **plus the exact scoring
weights** ("confirmed 1.0 · assessed .75 · unknown .5 · claimed .4 · unverified
.15"). That is sufficient to reconstruct: the curated source graph, the weighting
function, and a per-source prior — i.e., the registry pillar wholesale, and the
ingest targeting list for free. What it does NOT give: the pipeline (map/reduce,
dedup, validation harness), the claims corpus, or the ongoing crawl.

**Assessment: the concern is real.** The registry is the charter's "transparent
source-reliability ratings" differentiator, and today its complete ranked form is
one afternoon of scripting away from anyone with an email address.

### Recommendation — (b)-leaning hybrid, pending a Gregory decision

- **Keep for all signed-in users:** per-claim citation chips (a score in context
  doesn't leak the ranking), and `/registry/[id]` detail pages *reached from
  citations* — auditing a specific source is the transparency promise.
- **Role-gate the enumeration surfaces:** the `/registry` and `/middle-east`
  ranked indexes (the ordered, scored, paginated tables). Regular users hitting
  `/registry` get a reduced view: search box + the aggregate story (counts,
  methodology, hedging-weights explanation) + results showing **identity, platform,
  citation span, hedging mix — but not the score/rank ordering** (order by
  citation_count, hide the reliability column). That is middle path (c) as the
  regular-user view, with (b) for the full ranked table.
- **Honest limitation to state:** detail pages have sequential integer ids;
  id-walking still leaks per-source scores one at a time. If Gregory rules
  moat-first, the reduced view must also apply to detail-page score fields for
  non-analyst roles. Rate-limiting is defense-in-depth, not a fix.
- **Weights legend:** move the exact weight constants off the public-ish detail
  page into methodology copy without the numbers, or keep them — Gregory call;
  the numbers are also implicitly recoverable from `/middle-east`'s SQL behavior.

### Mechanism (Task 0 found no roles — smallest honest path)

1. **Now (zero migration):** reuse `requireAdmin()` for the two index routes —
   `ADMIN_EMAILS` already exists in `gate.ts`. Requires setting `ADMIN_EMAILS` in
   all Vercel envs **before** deploying the check (same fail-closed discipline as
   ruling 4; note `requireAdmin` redirects everyone when the gate is on and the
   allowlist is empty).
2. **Future task (specified, not built here):** additive migration adding
   `users.role text NOT NULL DEFAULT 'user'` (`analyst` | `admin` above it), a
   `requireRole(minRole)` helper in `gate.ts` reading the role via the session
   email (one indexed lookup; or expose it through an Auth.js `session` callback),
   and `ADMIN_EMAILS` retired into a seed. Keep the role OUT of the JWT — sessions
   are database-strategy already.

---

## 3. Task 3 — what else to show, what to retire

Evaluated candidates, with a shortlist ruling each:

| Candidate | Ruling | Data source | Status |
|---|---|---|---|
| Scoreboard tiles on signed-in home (per-theater coverage, info-lead, last-validated) | **SHORTLIST** | `validation_runs` latest per theater (already computed daily) | zero new pipeline; one query |
| Unsupported-claim rate as live trust signal | **NO — do not surface under that name.** The DB column is the thin-sourced proxy (docCount<2 AND hedged), not literal unsupportedness; recon #45 already flags the mislabel | `validation_runs.unsupported_claim_rate` | blocked on renaming/fixing the metric |
| **Corroborated share** ("N% of today's claims have ≥2 independent sources") | **SHORTLIST — the honest replacement** for the above; positive framing, directly computable | `claim_sources` group-by over the day's digest claims | one query, no new work |
| "What changed since your last visit" | **DEFER** — no last-visit storage exists (§0.3); intraday digests are already delta-framed (`stats.delta`), which covers most of the value | would need a per-user table | needs-new-work + design |
| Info-lead vs mainstream per claim | **DEFER** — digest-level info-lead (+15h median) is already on the scoreboard; per-claim "earliest report" is cheap (min doc_at is already in the digest payload) but is analyst polish, not core | `raw_documents.published_at` per claim | cheap, low priority |
| Source diversity per claim (platforms + independent channels count) | **SHORTLIST** — this is the quality signal that does NOT hand over the list; it becomes the collapsed-state summary of the Task 4 component | fields already in the digest query | rides on Task 4 |

**Retire / demote:** the signed-in marketing cards (Task 1); the bare "N documents
ingested" count on `/countries` cards could carry a freshness timestamp instead of
a lifetime count (cheap, optional).

Scoreboard-tile honesty note: coverage prints 15–25%. The scoreboard is already
public and the charter says publish-not-hide, so tiles are consistent product
behavior — but pair the number with the info-lead stat (+15–20h, favorable) and
the nonzero-day framing used on `/scoreboard`. Whether home is where these numbers
live pre-improvement is a Gregory framing call (§7).

---

## 4. Task 4 ruling — claim sources: show up to 6 diverse, collapse the rest

**Recommendation: adopt.** Live evidence (§0.4): uncapped chip rows up to 16 with
near-duplicate outlets repeated; 10% of claims exceed 5 sources and those are
precisely the well-corroborated claims worth reading.

### Diversity selection rule (fields that exist, nothing invented)

Naive top-6-by-reliability shows six copies of the same wire story. Instead,
greedy selection over the claim's docs (all already in the page query):

1. **Dedupe by `source_id`** — never show two docs from the same channel unless
   slots remain at the end (same-channel repeats are near-mirrors; live example:
   `rbc.ru` ×3).
2. **Platform round-robin first:** take the highest-reliability doc from each
   platform class present (`other/rss` press, `telegram`, `x`, `gdelt`) — this is
   the honest "cross-perspective" we can defend today. There is **no political-
   alignment field**; platform + channel diversity is the defensible proxy, and the
   doc should say so rather than pretend otherwise.
3. **Fill remaining slots** by reliability across still-unused source_ids.
4. **Tie-break by earliest `published_at`** — surface the origin report, not the
   repeat (doubles as the info-lead story).
5. Collapse threshold: if total ≤ 8 just show all (avoid a "+1 more" stub);
   otherwise show 6 + "{n−6} more sources".

Domain must NOT be the identity key (§0.4: `x.com`/`t.me` collapse). `source_id`
is the channel-level identity; fall back to `adapter` for registry-less docs.

### Interaction & component spec

- **`src/components/claim-sources.tsx`** — the single reusable component; digest
  page, signals evidence (Task 5), and any future theater page all render it.
  Props: `docs: Array<{docId, url, sourceKey, adapter, platform, reliability,
  publishedAt}>`, optional `defaultVisible = 6`.
- **Disclosure = native `<details>/<summary>`** — zero client JS, keyboard and
  screen-reader semantics for free, consistent with the all-server-component
  architecture; style the `summary` as the existing chip idiom. (shadcn
  `Collapsible` is unavailable by repo policy — §0.4. A hand-rolled ARIA
  disclosure button à la `nav-dropdown.tsx` is the fallback if design wants
  animation; not needed for v1.)
- Collapsed state shows the 6 selected chips + a diversity summary as the summary
  element: "+9 more · 4 channels · 3 platforms" (the Task 3 diversity badge).
- **No fetch needed on digests** — every doc is already server-rendered in the
  payload today; collapsing is pure DOM disclosure. "Expand all" (page-level)
  needs client JS; defer it — per-claim expansion suffices.
- **Gating interaction:** expanding one claim reveals at most ~24 docs — bounded,
  not an enumeration vector; no role check needed on digests (already
  `requireUser`). Per-chip reliability stays (in-context score, per Task 2). If
  Task 2 lands moat-first, the component takes a `showScores` boolean so signals
  (public page) can render chips without scores.

---

## 5. Task 5 ruling — make the signals evidence reachable

**Recommendation: adopt, with the count fixed and the expansion gated.**

- **Fix the count first (B1):** dedupe in `detectPurge`
  (`evidenceClaimIds: [...new Set(recent.map(c => c.claimId))]`) — the live "32"
  is 30 distinct claims. The count is the page's headline evidence; it must be
  exact.
- **Mechanism — server-rendered, no new endpoint:** the page is `force-dynamic`
  and the ids are already on the server object. For **signed-in** users, fetch the
  evidence rows in the page render (same join as the digest page:
  `claims → claim_sources → raw_documents LEFT JOIN sources` over
  `cl.id = ANY($ids)`, plus claim text/hedging/date; one query, ids ≤ ~30) and
  render each claim + its `ClaimSources` component inside a `<details>` whose
  `<summary>` is the existing count line. For **signed-out** users (page is
  public, §0.5) render the count as text plus a "sign in to inspect the evidence"
  link — claim text and doc URLs stay behind the same `requireUser` boundary that
  protects digests; putting them hidden-but-present in public HTML would be a
  gate bypass.
- **Accessibility:** `<details>/<summary>` provides disclosure semantics,
  `aria-expanded`, and keyboard handling natively; ensure the summary line reads
  as a control ("30 supporting claims — expand to inspect") rather than passive
  text, and keep focus on the summary after toggle (default behavior).
- **Data caveat to encode:** only purge signals carry `evidenceClaimIds`;
  data-dark and trade-divergence signals use `evidenceRefs` (series/period refs) —
  the expansion renders only where claim ids exist; refs-based signals can later
  link to their series pages instead. Don't force one shape.
- **Same pattern elsewhere:** the count-without-drill pattern recurs on
  `/countries` ("N documents ingested"), `/ask`'s meta line, and scoreboard
  divergence rows (claim text without sources). The scoreboard detail page is the
  natural second adopter of `ClaimSources`; the others are counts of raw docs,
  not claims — leave them.
- i18n the new strings and the existing hardcoded ones while in the file (B3).

---

## 6. Prioritized punch list (hand-off; nothing built this session)

**Tier A — quick wins (existing data, no schema change, no decision needed):**

1. **`ClaimSources` component + digest-page adoption** (Task 4): diversity
   selection, `<details>` collapse, diversity badge. Files:
   `src/components/claim-sources.tsx` (new), `src/app/digests/[country]/[date]/page.tsx`
   (swap the chip loop `:240-253`). Tests: selection rule (fixture docs → chosen 6),
   jsdom render. No dependency.
2. **Signals count fix + evidence expansion** (Task 5): dedupe ids
   (`signals.ts:48`), signed-in server-rendered evidence via `ClaimSources`,
   signed-out sign-in prompt, i18n the page strings (B1+B3). Depends on #1.
3. **Signed-in home data-state panel** (Task 1): `theater-status-panel.tsx`,
   replace marketing cards in the signed-in branch, cadence-derived "next update"
   in ET, X-paused footnote. Independent; tests for the cron-next-fire helper and
   the panel query shape.
4. **Registry "scores as of {date}" line** (B2): one `max(last_cited_report_date)`
   scalar on `/registry` + `/middle-east` headers. Trivial; also the honest
   stopgap until the materializer runs on a cadence.

**Tier B — needs new work (small, but new concepts):**

5. **Scoreboard tiles + corroborated-share on home** (Task 3): two queries, tile
   row under the status panel. Depends on #3 landing first (same surface).
6. **Role concept** (Task 2 mechanism): additive `users.role` migration,
   `requireRole()` in `gate.ts`, seed from `ADMIN_EMAILS`. Independent of UI; do
   after the Gregory decision so the gate matches the ruling.
7. **Registry index gating + reduced regular view** (Task 2): apply #6 to
   `/registry` + `/middle-east`; reduced view hides score/rank ordering for
   role='user'. Depends on #6 + decision D1.
8. **`digest:intraday` slot in cron qualifier** (B4): one-line
   `cronJobName(route, group ?? slot ?? mode)`-style change; improves the panel's
   provenance. Anytime.

**Tier C — needs a decision from Gregory first:** see §7 (D1 gates #6/#7; D2
gates #5's framing; D3 confirms Task 5's gating split).

**Suggested build order: 1 → 2 → 3 → 4, then decisions, then 5–8.**

---

## 7. Open questions for Gregory

- **D1 (the moat call, Task 2):** Is the ranked registry a *sales asset* (keep
  wholesale visibility for all signed-in users, accept that a free email copies
  it) or the *moat* (role-gate the ranked index — and decide whether detail-page
  scores and the exact hedging weights follow)? Recommended default in §2 is
  moat-leaning hybrid; it is reversible, the leak is not.
- **D2 (scoreboard on home, Task 3):** comfortable putting 15–25% coverage tiles
  on the signed-in homepage now (with info-lead framing), or hold tiles until
  coverage improves and link to `/scoreboard` instead?
- **D3 (signals gating, Task 5):** confirm the split — signal headlines stay
  public, claim-level evidence requires sign-in. (Alternative: gate the whole
  page; it is currently the only analyst surface that is public.)
- **D4 (timezone):** panel times formatted for America/New_York — is single-tz
  display acceptable until per-user preferences exist?
- **D5 (registry cadence, adjacent):** should `registry-materialize` become a
  weekly cron so "scores as of" stops drifting? (Currently manual; 8 days stale.)

---

## Appendix — verification notes

- Signed-in checks used a live magic-link session for go@vociferous.nyc
  (requested via `/api/auth/signin/email`, link read from the operator's mailbox,
  consumed once via curl; session cookie verified against `/`, `/registry`,
  `/digests/ru/2026-07-11`). Two verification emails were sent in the process;
  one token was consumed. No production data was modified beyond the
  Auth.js-standard session/verification rows that any sign-in creates.
- Signed-out checks: `/registry`, `/digests/*`, `/middle-east`, `/entities` all
  307 → `/signin`; `/signals`, `/scoreboard`, `/countries`, `/health`, `/` all 200.
- All SQL run through `scripts/sqlq.ts`, SELECT-only, raw `timestamptz` (no
  `AT TIME ZONE` — recon clock-note honored).
- Live-vs-source divergences found: **none** — every rendered surface matched its
  source; the deployed build is current with `main` @ `2884f50`.
- Session paid spend: **$0.00** (no LLM, no paid API; Postmark magic-link emails
  only).
