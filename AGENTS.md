# AGENTS.md — persistent brain of BNOW.NET

Read this first in every fresh session. Keep it under ~300 lines; details live in `docs/`.

**Maintenance rule — ONLY the decision log is append-only.** Every standing section
(Current state, Architecture, directory map, Standing rulings, credentials, conventions,
protocol) MUST be corrected in place the moment it becomes wrong; append a log entry
recording that the correction happened. Never leave wrong standing text with the fix
buried in a log entry. When the log outgrows this file, move its oldest entries
**verbatim** to `docs/DECISIONS.md` (the append-only archive) — moving preserves
history; editing or summarizing it is forbidden.

## Project charter

BNOW.NET is a subscription OSINT data-intelligence product: per-country conflict-monitoring
feeds (open news + Telegram + X), **transparent source-reliability ratings** derived from
ISW's own citation/hedging behavior, an automated daily digest, and a public validation
scoreboard that scores our digests against ISW's daily Russian Offensive Campaign
Assessments. Paying users: analysts, risk teams, journalists, desks ($400–$4K/mo tiers).
Theaters: **Russia + Ukraine + Iran live**; Israel/Gulf ingesting but shallow; bh/kw
scaffolded; China deferred. Authoritative spec: `docs/PRODUCT-BRIEF.md` (installed 2026-07-06).

## Architecture

Stack: Next.js 16 App Router (TS strict) on Vercel · Neon Postgres + pgvector · Drizzle ORM ·
Tailwind v4 · Auth.js (magic link, `session.strategy='database'`) · Vitest (node; jsdom +
@testing-library per-file for component tests). LLM behind `AnalysisProvider`: `openai` live
(gpt-4o-mini), `anthropic` implemented in the seam (no key in any env yet — auto-selected if
an Anthropic key exists and no OpenAI key does), `stub` deterministic fallback.
**No shadcn/ui and no Radix.** UI deps are clsx + tailwind-merge + lucide-react; interactive
primitives (e.g. `src/components/nav-dropdown.tsx`) are hand-rolled to WAI-ARIA patterns.

```
 ISW archive ──crawl──> raw HTML cache (disk, internal-only)
                             │ parse endnotes + hedging
                             ▼
                      source_citations ──materialize──> sources (registry)
                                                            │ seeds channels + weights
 RSS (29 feeds)      ─┐                                     ▼
 GDELT 15-min slices ─┤
 t.me/s/ web preview ─┼─ SourceAdapter.fetchLatest() ─> raw_documents ─┐
 t.me MTProto (gramJS)┤      (cron /api/cron/ingest)    (hash-deduped) │
 X via twitterapi.io ─┘  (ACLED: fixture stub, NOT wired)              ▼
                                        normalize → near-dupe → claims/events
                                        (claim ⇄ raw_documents join = traceability,
                                         enforced: claim INSERT requires source link)
                                                            │
        shadow map stage (hourly): raw_documents →          ▼
        doc_claims / doc_dedup / doc_map_state   digests (4×/day, theater×track)
        — sprint-3 reduce input; digest            └─> validation_runs (vs ISW same-day:
        pipeline untouched by it                        coverage, divergence, timeliness,
                                                        unsupported-claim rate)
 Product surface: landing / countries / digests+archive+scoreboard / registry / entities /
                  signals / trade / datadark / critical-materials / ask / search / access (beta
                  request; /pricing 308-redirects here) / auth / privacy + terms (public legal
                  docs) / welcome/legal (first-login acceptance)
```

Directory map (correct in place as it changes):

```
src/app/            routes (public pages, /admin/*, /api/cron/*, /api/*)
src/components/     shared React components (SiteHeader, hand-rolled ARIA dropdowns)
src/db/             drizzle schema + client; generated SQL lives in drizzle/
src/i18n/           LOCALE_REGISTRY + catalogs (en uk de ar ja pl fr; ar is RTL)
src/integration/    *.itest.ts — Neon-branch integration tests, excluded from unit suite
src/lib/adapters/   SourceAdapter impls: rss, gdelt, telegram-web, telegram-mtproto, x-api
                    (live), procurement; stubs.ts = fixture stubs (ACLED/x) — never wired
                    into prod ingest
src/lib/analysis/   AnalysisProvider (openai/anthropic/stub), digest, tracks, source-mix,
                    map stage (map-worker, map-prompts, map-dedup, minhash)
src/lib/isw/        crawler, endnote parser, hedging classifier, registry materializer
src/lib/validation/ ISW scoreboard: keyword gazetteer + majority-vote LLM matcher
src/lib/usage/      SpendGuard, llm-guard (caps + kill-switch), cron-run bookkeeping
src/lib/…           ask, entities, enrich, datadark, trade (incl. partners.ts M49 names),
                    materials, profiles, email, access (beta-request validation),
                    auth-delivery (magic-link + SIGNIN_MODE invite gate),
                    nav, ingest, time (ET/UTC day + format + digest-status helpers),
                    legal (policies=version constants + acceptance record + safe-next redirect
                    guard), gate/session/auth
scripts/            local runners (idempotent + resumable): backfills, seed, digest,
                    validate, map-backfill, sqlq, pin-dns.cjs, test-integration.sh
fixtures/           saved HTML/JSON for tests
docs/               PRODUCT-BRIEF, PROGRESS, OPEN-TASKS, BLOCKERS, SETUP-NEXT-WEEK,
                    DECISIONS (log archive), STATUS-REPORT, TIME-MODEL, strategy docs,
                    reviews/, designs/
drizzle/            migrations 0000–00NN + 9999_claim_source_trigger.sql (applies last)
data/               gitignored: cache/ (fetched pages), outbox/ (rendered emails)
```

## Current state — snapshot (verified through 2026-07-15; correct in place when it changes)

Live at **https://bnow.net** (Vercel project `bnow-net`, team `vociferous`;
deployment URLs are SSO-walled — always use the project domain). History/narrative:
`docs/PROGRESS.md` + `docs/reviews/`; debt: `docs/OPEN-TASKS.md`.

- **Registry:** 6,985 ISW-derived sources / 251K citations / 1,565 reports (97.65% parse);
  per-theater aggregates in `source_theater_stats` (ru/ir).
- **Ingestion (live):** 29 RSS feeds (ru ua il ir sa ae qa om + bh/kw scaffolded),
  registry-selected + curated Telegram via t.me/s/, Telegram MTProto (**wired
  2026-07-11; `TELEGRAM_SESSION` present in production (added 2026-07-11): operator
  login done, `ingest:mtproto` cron :35 hourly runs green — **first live fetch VERIFIED
  2026-07-11** (~3.8K docs across runs, 0 errors, cross-transport dedupe firing); egress
  PROVEN on Vercel tcp+wss; reads registry **top-120 ROCA-only**
  (`isw_reports.theater='ru'`) vs the scraper's top-50 pan-theater — RU/UA-priority
  roster deployed 2026-07-11, env-tunable, rollback via
  `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER=all`**), X via api.twitterapi.io (364
  registry accounts — **lease-aware insert-gated poller DEPLOYED 2026-07-14**
  (`dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ`, main `a38a882`; every `ingest:x` run writes
  numeric `cron_runs.counts.x_api`), and the **July 9–13 historical gap is RECOVERED
  cursor-complete** (checkpoint `x_gap_backfill:2026-07-09_2026-07-14` complete=true:
  19/19 batches, 1,335 pages, 26,090 returned, 16,007 inserted, $3.9164; gap days
  31/18/27 → 4,559/4,134/5,587 docs; balance delta reconciled to the ledger to
  $0.00003). Post-recovery rescore mapped + regenerated + revalidated the window
  (2026-07-14 decision-log entry). **Operational caveat: the steady poller cannot
  self-recover from a watermark park longer than ~4–8h** — its fixed 5-page/batch
  ceiling truncates on dense batches and each hourly retry re-bills the backlog
  without advancing (observed live 09:20Z 07-14: pageTruncations=6); remedy = bounded
  x-gap-backfill drain + operator watermark advance to the drained boundary
  (OPEN-TASKS #66); #38 retains only the green-but-empty ALERT half), GDELT
  (wired, upstream-flaky), zakupki
  procurement (wired, blocked — needs proxy).
- **OpenSanctions enrichment:** live gap-fill remains active. Calendar-month quota accounting +
  the advancing fixed-cutoff sanctions rescore are **DEPLOYED 2026-07-15** from merge `f9aaa9e`
  in production deploy `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`. Live zero-paid verification:
  `/health` 200 on that deployment; authenticated future and timezone-less sanctions cutoffs both
  returned the new 400 before `withCronRun` / provider work; the read-only July ledger remained
  660 requests / $72.6000 afterward. The paid rescore remains CLOSED until
  cleanup #61 is approved+applied, population/month quota are recounted, and spend is separately
  authorized; no cleanup or paid OpenSanctions call occurred in this rollout.
- **Map stage:** all eligible ru/ua/ir docs since 06-29 mapped once per
  (track, extractor_version) → `doc_claims` (~33K current-version atomic claims at
  the 2026-07-14 snapshot), persistent dedup verdicts
  (`doc_dedup`), dispositions (`doc_map_state`); hourly cron keeps it current;
  $0.076/1K docs. Feeds the mapreduce digest engine (below). Shadow evidence:
  `docs/reviews/MAP-SHADOW-RESULTS.md`.
- **Digests — two engines behind `DIGEST_ENGINE`; prod is FLIPPED to `mapreduce`
  (2026-07-09; code default is still legacy when the env is unset, which is the
  rollback):** legacy = the 100-doc batch extraction (source-mix quota, ladder);
  mapreduce = deterministic reduce over doc_claims (star clustering, threshold 0.35,
  corroboration promotion, entity canonicalization) + K=5-voted synthesis over the
  top ~200 ranked claim groups — model cites group ids only, docIds/hedging derive
  server-side. A/B gate PASSED (coverage 25.0 vs 21.1, unsupported 0.30 vs 0.41,
  variance 6.9 vs 8.0; `docs/reviews/MR3-REDUCE-RESULTS.md`). Gulf theaters have no
  doc_claims, so they fall back to legacy automatically. Both engines persist
  through ONE shared path (`digest-persist.ts`) whose overwrite guard refuses empty
  AND thin (<50% prior claims) regenerations (#32 closed; FORCE_REGEN=1 override),
  and which now runs the deterministic **publication-safety guard**
  (`publication-guard.ts`, 2026-07-13 — ruling 19) before that verdict.
- **Validation vs ISW:** majority-vote LLM matching (k=5, 26/27 reproducible across
  reruns), keyword gazetteer as no-key fallback; ISW report auto-discovery by slug.
  Coverage avg ~17.5% (nonzero-day ~31%), median info-lead +14.7h (2026-07-05 backtest).
- **Surface:** landing (**nav restructured 2026-07-12 IA refinement: Coverage ▾ | Signals |
  Ask | Solutions ▾ | Validation | Pricing — Product group retired, Signals+Ask promoted
  top-level, Solutions>signals duplicate dropped; every route has exactly one nav path; robots.txt
  + sitemap.xml added, `src/app/robots.ts`/`sitemap.ts`, `siteBaseUrl()` = bnow.net /
  VERCEL_PROJECT_PRODUCTION_URL**) / countries (freshness line + **public per-theater pages
  `/countries/[iso2]` with localized metadata, IA refinement 2026-07-12; Coverage links land
  there, old `#<iso2>` anchors kept; signed-out home "Live now" count driven from
  `countries.status='active'`**) / **access (private analyst beta, 2026-07-13)**:
  public `/access` beta-request page (email + optional LinkedIn URL stored-never-fetched +
  use-case; honeypot, 1h dedupe, operator email via after()+FEEDBACK_EMAIL, review list at
  `/admin/access`); `/pricing` 308-redirects there — price cards, dollar amounts and
  `src/lib/pricing/` are deleted; nav shows "Request access" signed-out ONLY (signed-in nav
  carries no commercial entry); hero has a restrained beta badge; sign-in is invite-gateable
  via `SIGNIN_MODE` (open=default/live; invite = users row OR ADMIN_EMAILS OR approved
  subscribe_intents — flip is an operator decision) /
  magic-link auth (**Postmark bnow.net sender LIVE 2026-07-15**: Production `EMAIL_FROM` =
  `BNOW.NET <no-reply@bnow.net>`; the active server token accepts the address; Gmail live proof
  shows bnow.net DKIM, SPF, and DMARC pass, custom `pm-bounces.bnow.net` Return-Path, and the
  direct, unrewritten Auth.js callback signs in successfully) / digests
  (ClaimSources diversity-selected source collapse, **adopted 2026-07-12**) +
  registry (**ADMIN-ONLY since 2026-07-12** analyst-trust R5:
  `requireAdminOr404()` in both layouts — every non-admin, signed-in or out, gets a
  404, replacing the old requireUser 307; registry links removed from nav, rail and
  all pages; `view-policy.ts` still shapes what an admin sees; "suggest a source"
  mailto moved to digest footers) + entities behind FEATURE_AUTH_GATE / signals
  (**teaser-public / specifics-gated, IA refinement 2026-07-12**: `toPublicSignal()`
  withholds the signal `detail` — named individuals, dollar figures, target/flow lists —
  AND the ClaimSources evidence from anonymous server-rendered HTML at the data layer;
  signed-out sees only the headline count + a sign-in nudge, signed-in gets detail +
  `<details>` evidence; PROVEN in prod by anon `curl` — 0 leaked names. robots.txt disallows
  the gated routes; /signals stays crawlable as the safe teaser) / trade / datadark /
  critical-materials / ask
  (**v2 pipeline LIVE 2026-07-12**: hybrid vector+lexical retrieval, gpt-5-mini
  listwise rerank, gpt-5 answerer with refusal handling; ~$0.011/query; capped
  100/user/day + $10/day global (`ASK_USER_DAILY_LIMIT`/`ASK_GLOBAL_DAILY_BUDGET_USD`)
  + guard caps `ASK_USD_CAP_DAILY=2`/`EMBED_USD_CAP_DAILY=1`, all four in Production
  AND Preview; rollback = `ASK_PIPELINE=legacy` plain env + redeploy. **Polished
  2026-07-12 (ask-polish sprint):** paid pipeline runs ONLY from the form's server
  action — GET /ask?q= prefills, never executes (closes OPEN-TASKS #48
  double-billing); prominent working panel (spinner, disabled controls, aria-busy/status,
  honest client-elapsed retrieve→rank→answer stages, submitted-question echo); provider/model
  diagnostics are no longer shown to analysts; end-user persona
  SYSTEM_V2 (legacy SYSTEM byte-preserved); "data current through" context +
  $0 no-coverage short-circuit when window.from > max(claim_date) (rollback
  `ASK_NO_COVERAGE_SHORTCIRCUIT=0`); citation deep links to `#c{claimId}` digest
  anchors; related claims floored at vectorScore ≥ 0.5 (`ASK_RELATED_MIN_SCORE`,
  null excluded, cap 5, empty block omitted); signed-in home gets a zero-JS Ask
  box; eval gate honesty 5/5 + known-citations 5/5 —
  `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`). **Role model
  (2026-07-12):** `users.role` (`user`<`analyst`<`admin`, migration 0016) +
  `src/lib/gate.ts` helpers back the registry/signals gating above; `ADMIN_EMAILS`
  bootstraps admin pre-grant, live in Vercel **Production only** (absent
  Preview/Development — fails closed to reduced views there). **Signed-in home
  (rebuilt 2026-07-12 analyst-trust R3):** compact one-line headline (no hero/CTAs),
  quick-links rail, cadence-aware theater panels (whole-card click → latest digest;
  the card names its digest bucket + intraday/final stage and keys the claims count
  to that bucket — the "not yet generated beside 14 claims" contradiction was a
  driver bigint-as-string fold bug, fixed + regression-pinned), Ask box + recent
  asks, validation tiles last; signed-out home unchanged. Magic-link sign-in lands
  on `/`. Time model: docs/TIME-MODEL.md + src/lib/time/* (ET display, UTC buckets,
  explicit-tz helpers only). **Scoreboard
  (2026-07-12):** targets-vs-actuals sublines + thin-sourced tile + nonzero-day
  mean + a true median info-lead (closes OPEN-TASKS #11); **explainer block +
  per-metric how-to-read lines** and an **evidence-at-publish proxy subline**:
  `validation_runs.details.atPublish` = share of the run's takeaways matched with
  evidence ingested before ISW's publish instant (src/lib/validation/at-publish.ts,
  jsonb only — no migration; 7-day deterministic backfill applied 2026-07-12; full
  cutoff-anchored design parked in docs/designs/ISW-CUTOFF-SCORING.md). It is not a
  historical digest snapshot or a mathematical bound on what the digest said then
  (corrected 2026-07-14 scoring audit).
  Root error boundaries (`src/app/error.tsx` / `global-error.tsx`, 2026-07-12)
  never render raw error messages. **Analyst home & Iran prominence (2026-07-12,
  deploy `bnow-jihmibgm6`):** signed-in home gained a quick-links rail (latest+prev
  digest dates ×ru/ua/ir + scoreboard/signals/search (registry link removed 2026-07-12 R5)), date-led digest
  links + claims-today + per-theater scoreboard deep links on the theater cards,
  and a recent-asks list (`/ask?q=` prefills, never executes); signed-out home
  gained one additive Iran/Gulf card (quality-gated: ir validation 07-11 = 100%
  coverage; links `/countries#ir` per ruling 15); digest archive index
  `/digests/[country]` + prev/next date nav + scoreboard→digest cross-link;
  feedback mailtos on digest + registry-detail pages (env `FEEDBACK_EMAIL`, plain,
  all three Vercel envs — affordance hidden when unset); **/search** = free
  deterministic claim search (signed-in): ASK v2's lexical arm extracted to
  `src/lib/ask/lexical.ts` (shared with retrieveV2, byte-green), $0 by
  construction — no SpendGuard, no usage rows, proven live (5 queries, zero
  counter movement); GET-with-q EXECUTES there by design ($0), the deliberate
  contrast to /ask. i18n: en+uk full, de ar ja pl fr catalogs are offered in the selector;
  es/he/ko remain valid fallback locales but are hidden until reviewed catalogs exist
  (landing wired; needs native review before promotion; ~108 uk strings — 10
  `ask.*` (MERGE 1) + ~64 design-branch strings (MERGE 2: pricing, home.status,
  home.validation, signals, registry) + 3 ask-polish strings + 31 analyst-home
  strings + 18 analyst-trust strings — await native review, tracked in
  `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`).
- **Legal acceptance (versioned clickwrap, shipped 2026-07-12):** public `/privacy` +
  `/terms` (Terms of Use v1.0 effective 2026-07-12 + **Privacy Notice v1.2 effective
  2026-07-15** — corrects the now-live PostHog posture, discloses the dedicated US project,
  GeoIP-derived approximate location, and seven-year event retention; v1.1 was effective
  2026-07-14 and introduced optional analytics consent). The 1.2 bump forces ALL users to
  re-accept on next
  visit, where the acceptance form now also carries an optional, initially unchecked
  "Allow optional product analytics" checkbox — unchecked/missing records `denied`, a
  stale grant cannot survive re-acceptance;
  `src/components/legal-document.tsx` shared layout, DB-free, indexable, in sitemap);
  a **global `SiteFooter`** in the root layout (Privacy · Terms · Status · Contact) replaced
  the home-only footer (hidden on `/admin`); a first-login acceptance screen
  **`/welcome/legal`** (magic-link now lands there via `redirectTo=/welcome/legal?next=/`;
  two required unchecked checkboxes, links open in a new tab, server action re-validates,
  DB-generated `accepted_at`, idempotent insert, safe-next open-redirect guard). Central
  version constants live in **`src/lib/legal/policies.ts`** (`CURRENT_TERMS_VERSION` /
  `CURRENT_PRIVACY_VERSION`, operator = Vociferous.ai / New York, contact go@vociferous.nyc);
  a version bump there forces re-acceptance. **Append-only record** `policy_acceptances`
  (migration 0017, FK→users cascade, unique (user_id, terms_version, privacy_version); NO IP,
  UA, birth date, or token stored). **Enforcement:** `requireAcceptedUser()` (gate.ts) = auth
  + current acceptance, used by the ask/search/entities/digests **layouts** AND the ask
  **action + API route** independently; the signed-in **home** redirects before any subscriber
  query; **/signals** gates its detail on acceptance (teaser stays public); **/account** shows
  the accepted versions + timestamp (no id/method leaked) and redirects if unaccepted;
  both `requireAdminOr404` (registry/middle-east) and `requireAdmin` (the /admin console) redirect
  a confirmed admin who hasn't accepted (non-admins still 404 / redirect-to-/ respectively, so the
  admin gates are unweakened). Anonymous dev/demo parity (FEATURE_AUTH_GATE off) preserved;
  no acceptance record is ever manufactured for an anonymous visitor. **DEPLOYED 2026-07-13**
  (`dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh`, READY, aliased bnow.net); migration 0017 applied to prod
  and verified (correct columns, `accepted_at DEFAULT now()`, unique version-triple, FK cascade,
  0 rows); anon prod smoke green (legal pages 200 with v1.0 copy, gated routes 307, /signals 0
  leaks, robots/sitemap correct). Note: `docs/reviews/LEGAL-ACCEPTANCE-NOTE-2026-07-12.md`.
- **Product analytics (PostHog — LIVE, opt-in-only, activated 2026-07-14 evening):**
  consent-gated client layer (`src/lib/analytics/*`, `src/components/analytics/*`, posthog-js
  1.399.5 dynamically imported) merged `e5123a9`; dedicated **US-Cloud project 512327
  "BNOW.NET"** (operator-created; region = operator decision; key ≠ Scenefiend's);
  `NEXT_PUBLIC_POSTHOG_KEY`+`_HOST` in Vercel **Production only** — key removal + redeploy is
  the verified rollback (the keyless build `dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6` was deployed and
  proven zero-traffic first). Activation deploy `dpl_EmHs6NneKtPA5RC9i4T3ybYSjLEx` and current
  prod deploy `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu` include the `$identify` signup_at ISO fix
  (`9e371dc` — `created_at::text`'s space format made the
  sanitizer drop $identify; to_char now). Init requires ALL of: signed-in + current legal
  acceptance + `users.analytics_preference='granted'` (migration 0020: 3-value CHECK, default
  `'unset'`, Account-page reversible control) + valid key/host + Vercel production + exact
  https://bnow.net + approved subscriber route; allowlist-reconstruction `before_send`
  sanitizer, 10 custom events + manual `$pageview`/`$identify` only, UUID identity never email.
  **Live-verified 2026-07-14:** all 12 event types ingested with the internal UUID only; stored
  payload keys = exactly the allowlist; `$ip` None (anonymize_ips on; autocapture/replay/
  console/performance off project-side); **GeoIP enrichment kept ON by explicit operator
  decision** (city/postal from connection IP at ingestion, disclosed in Privacy 1.2).
  Anonymous/unaccepted/denied/deployment-domain/legal-route all proven
  zero-request; cross-tab deny + sign-out reset proven; Ask stayed one-bill-per-submit.
  Dashboard **"BNOW Private Beta"** (id 1848415, 9 insights) + Action `first_value_event`
  (id 289102); no alerts yet. **Verification trap:** posthog-js bot-filters headless/webdriver
  browsers BEFORE `before_send` — live checks need a masked UA or they prove nothing.
  `/access` persists validated first-party attribution (lowercased capped-charset
  `utm_source/medium/campaign`, forced `landing_path=/access`, hostname-only `referrer_host` —
  migration 0020, nullable) shown in `/admin/access`; never sent to PostHog. Test account
  `go+phtest@vociferous.nyc` (previously accepted 1.1, preference granted, signed out; now
  requires 1.2 re-acknowledgement) is the standing verification identity. Evidence:
  `docs/reviews/POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md`.
- **Tests:** 1495 unit tests / 131 files green on main (`npm test`, ~6s) + Neon-branch integration
  suite (`npm run test:integration`, 27 real-Postgres tests / 7 files). The saved `NEON_API_KEY`
  works again as of 2026-07-15 (disposable-branch create/run/delete verified this session — the
  earlier 401 is cleared). CI mirror: `.github/workflows/ci.yml`; the enforced gate is
  `.githooks/pre-push` (typecheck+lint+test).
- **Crons (vercel.json):** ingest fast */15 · telegram :10 · x :20 · mtproto :35 ·
  map :40 (hourly) · digest 02:00 (D+1 finalize) + 04:00/10:00/19:30 (intraday, rolling window,
  delta-framed) · validate 07:00 (scores yesterday = the finalized digest) ·
  enrich 08:00 · datadark 09:00 · trade monthly (2nd) · materials monthly (3rd).
- **Stubbed / off:** ACLED (fixture stub, unwired); Stripe flagged off; Resend adapter
  superseded by Postmark. (MTProto left this list 2026-07-11 — real adapter wired,
  session-gated; see Ingestion above.)
- **Deploy:** current production `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu` (merge `f9aaa9e`, READY,
  aliased bnow.net). Command: `npx vercel@latest deploy --prod --yes` via the machine CLI session
  (`VERCEL_TOKEN` is expired; regen is an operator task, SETUP-NEXT-WEEK #2).
- **This WSL2 box:** the NAT resolver times out on some domains — a DNS quirk, NOT a
  TCP block. `NODE_OPTIONS="--require ./scripts/pin-dns.cjs"` pins vercel/openai/
  understandingwar DNS to public resolvers, making local single-call LLM debugging
  work; bulk LLM work still runs via deployed Vercel routes (prod env + metering).
  github.com resolves slowly/flakily: pushes work, but short-timeout git commands can
  fail — retry or wait ~30s+. api.gdeltproject.org DNS still fails locally (not
  pinned). TASS/RIA/Lenta RSS unreachable → covered via their Telegram channels.
- **Git:** the deployed code release merged at `f9aaa9e`; origin/main == local main after the
  2026-07-15 release-state documentation sync, and there is no push blocker.

## Standing rulings (distilled from the decision log; binding until a log entry supersedes)

Invariants — absolute, each owned here:

1. **Legal:** no ISW prose or source full-text in any user-facing output — only URLs,
   classifications, counts, scores. ISW takeaway text may enter an LLM prompt
   transiently; only verdicts persist.
2. **Traceability:** every claim keeps ≥1 raw_document link (FK + app-layer transaction
   + DB trigger `drizzle/9999_claim_source_trigger.sql`; `migrations.test.ts` guards it).
3. **Truth-in-UI:** stub/fixture data never persists or renders as fact — excluded at
   query level and HIDDEN entirely, never demo-labelled.
4. **Spend:** every paid-provider call passes `SpendGuard.tryReserve()` first and FAILS
   CLOSED when its total-cap env is unset. Caps: `LLM_SPRINT_USD_CAP` (all-time
   backstop), `LLM_DIGEST_USD_CAP` (daily), `MAP_USD_CAP_DAILY`, `ASK_USD_CAP_DAILY` +
   `EMBED_USD_CAP_DAILY` (daily, ask v2 + embeddings), `X_SPRINT_USD_CAP` +
   `X_DAILY_USD_CAP`, `OPENSANCTIONS_CALL_CAP`. Set a new cap env in ALL Vercel envs
   BEFORE deploying the guard that reads it, or you stop that pipeline.
5. **Migrations:** never edit or delete an applied migration; evolve forward with a new
   one. `9999_claim_source_trigger.sql` re-asserts without DROP, always applies last —
   never renumber it or let drizzle-kit regeneration drop it.

Operational rulings:

6. LLM proposals are never auto-applied — entity audit is propose-only with human review.
7. Batched per-item LLM extraction MUST pin `minItems`/`maxItems` = batch size in the
   strict response schema: gpt-4o-mini silently under-fills otherwise (43–57% omission
   measured; prompt wording does not fix it, constrained decoding does).
8. LLM metering lives inside the provider's `analyze()`, never at call sites; truncated
   responses are recorded before being discarded (OpenAI bills them in full).
9. `LLM_DISABLE=1` semantics differ by call site ON PURPOSE: digest / anthropic /
   entity-audit throw typed `LlmDisabledError`; llm-match degrades to keyword matcher;
   /ask degrades to its deterministic cited-claims path (a throw there would cost a
   validation run or 500 a user page).
10. `cron_runs` rows are written at START; `finished_at IS NULL` is the timeout signal.
11. Language routing: fa→ir and uk→ua, plus per-channel theater pins. Arabic is NEVER
    routed by language — it spans six theaters; per-channel pins carry it. Theater is
    a coverage lens, not nationality: the three Lebanese channels are pinned to ir
    (2026-07-09 adjudication of #29); multi-theater source tagging is the eventual
    fix (OPEN-TASKS #37).
12. Dedup verdicts are same-theater and ±1 day only — cross-theater collapse drops
    claims; identical content on distant days is a recurring template, not a mirror.
13. Map extraction is versioned: `extractor_version` = model + prompt hash; consumers
    filter to `mapExtractorVersion()` current versions or they double-count.
    `raw_documents.processed` means exactly "map reached a final disposition"; version
    bumps need their own remap path (OPEN-TASKS #33).
14. Digest corpora are strictly per-theater (`rd.country_iso2`), reliability-ordered,
    with the ~40% source-mix cap on gather window and LLM batch.
15. Nav promotes only ru/ua/ir in the Coverage dropdown (promoting the shallow 6–9-digest
    theaters overstates depth); coverage links go to the real per-country pages
    `/countries/<iso2>` (public, indexable; the old `#<iso2>` anchors on the /countries
    index are kept so bookmarks still scroll — corrected 2026-07-12 IA refinement, when the
    per-country pages replaced the anchors and Signals+Ask were promoted out of a retired
    Product group); locale links carry no `?to=` (Referer round-trips path+query, `?to=`
    drops query).
16. Unhedged ISW declaratives stay `hedging='unknown'` (mid-trust 0.5) — forcing the 4
    classes would corrupt the reliability signal.
17. Don't trust a lone digest regeneration: extraction yield varies wildly between
    identical runs (10→1 claims observed). The shared persist guard now refuses
    empty and thin (<50% of prior claims) overwrites on BOTH engines
    (`digest-persist.ts`; FORCE_REGEN=1 override; refusals land in cron_runs).
18. The mapreduce engine ships only its A/B-validated configuration: K=5 synthesis
    votes + majority-gid fill (K=3 FAILED the variance gate — marginal events flip
    out of 2-of-3 majorities). Do not lower REDUCE_VOTES or remove the fill without
    re-running the gate (scripts/ab-mapreduce.ts + ab-report.ts). Every doc_claims
    consumer goes through src/lib/analysis/map-versions.ts (superseded extractor
    versions double-count otherwise).
19. **Publication safety (2026-07-13; strengthened same-day by the remediation):**
    every digest persist passes `guardPublishedEvents`
    (`src/lib/analysis/publication-guard.ts`) BEFORE the overwrite verdict —
    single-doc disputed reputational person-allegations drop AND their event
    title/summary is rebuilt from the retained claims (a dropped allegation's prose
    never survives, even beside a safe confirmed subclaim); disputed named-person
    allegations carry attribution that GOVERNS the allegation (an attribution word
    trailing the assertion — "X died, with reports suggesting…" — does not qualify
    it); allegation-bearing events get deterministic copy for title AND summary
    (model prose never survives there); corroboration promotion never confirms a
    person-allegation on its own; the scoreboard labels non-confirmed unmatched
    claims "BNOW-only reported item" with the hedge shown. Do not bypass the guard
    or weaken these rules without a decision-log entry.

## Decision log (append-only, dated)

Entries 2026-07-04 → 2026-07-09 (MR sprints 1–2, tooling, restructure) are archived
VERBATIM in `docs/DECISIONS.md`; this log keeps the current cycle (MR sprint 3 + the
cutover). Distilled still-binding decisions live in Standing rulings above.

- **2026-07-09 (MR sprint 3, TASK 0)** OPEN-TASKS #29 adjudicated by the operator: the three
  Lebanese Arabic channels (mtvlebanonews, sameralhajali, mmirleb) route to **ir**. Rationale:
  theater is a coverage lens, not nationality — Hezbollah/Lebanon proxy-network content sits
  inside the IRAN_MILITARY_PROMPT's explicit scope and the ISW Iran Update validation baseline.
  Executed: three `TELEGRAM_CHANNEL_THEATER` pins, map holdout (`MAP_HOLDOUT_SOURCE_KEYS`)
  removed, `retag-theater --apply` moved 651 docs ru→ir, deployed, one catch-up map run drained
  the backlog (620 selected → 100% disposition, 41 claims, $0.0041, 0 integrity violations).
  This also removes the legacy-vs-mapreduce A/B asymmetry before the sprint-3 gate runs.
  Standing ruling 11 corrected in place; follow-up = multi-theater source tagging at Tier-2/3
  expansion (new OPEN-TASKS #37).
- **2026-07-09 (MR sprint 3)** Reduce + synthesis shipped; **A/B gate evaluated honestly across
  two rounds and passed; cutover deployed with the flag default LEGACY.** Round 1 (K=3 votes)
  FAILED the variance criterion (within-cell coverage SD 10.5 vs legacy 8.0, paired p=0.35):
  marginal events flip out of 2-of-3 vote majorities between generations, dropping exactly the
  frontline claims ISW scores (ru 07-07: 100→33→0). Fixes: K=5 (majority 3-of-5) + majority-gid
  fill (majority-supported groups dropped by the median roll get deterministic claims from group
  text). Round 2 passed all three criteria: coverage 25.0 vs 21.1 (ir +15.1 p=0.067, ru parity,
  ua −3.6 p=0.45 noise-scale — WATCH post-flip), SD 6.9 vs 8.0, unsupported 0.30 vs 0.41; #28
  reproducibility 0.75 vs 0.55; distinct docs cited 24.9 vs 9.5. New rulings 17 (corrected) + 18.
  Cadence: 02:00 D+1 finalize + 04:00/10:00/19:30 intraday (rolling 24h, delta-framed) replaces
  the 4×6h yesterday+today loop — the 8–10.2× re-extraction redundancy (audit §11) is retired on
  both engines (legacy now regenerates ≤4×/digest-day). REDUCE_USD_CAP_DAILY=2 set in all three
  Vercel envs BEFORE the deploy. A/B evidence: MR3-AB-RESULTS.jsonl + MR3-AB-K5.jsonl + report
  in MR3-REDUCE-RESULTS.md; sprint LLM spend ≈ $1.76 of $12. The A/B driver's one incident —
  the reduce guard's 500-req/day cap fail-closing round 2 mid-sweep — cost zero samples
  (resumable-by-key design); cap raised via env for the run, prod default unchanged.
  Closes OPEN-TASKS #18, #28, #32, #34, #35. Flip = operator sets DIGEST_ENGINE=mapreduce
  in Vercel prod env + redeploy; rollback = unset + redeploy.
- **2026-07-09 (cutover EXECUTED)** `DIGEST_ENGINE=mapreduce` added to the Vercel
  **production** env and redeployed (`dpl_4HdAJA7ZjAKiUGMLamf1ndDnWgpM`, READY, project
  domain serving 200). ru/ua/ir digests now generate through the reduce+synthesis engine;
  gulf theaters keep falling back to legacy (no doc_claims). Standing sections corrected in
  place. Verified by evidence, not assumption — one narrow live run
  (`?mode=intraday&country=ir&track=nuclear`, 172 docs) returned
  `provider: "openai:gpt-4o-mini+mapreduce"`, wrote a fresh `provider_usage.openai_reduce`
  row (5 requests = the K=5 synthesis votes of ruling 18, $0.0054), left `openai_digest`
  un-incremented, and closed its `cron_runs` row `ok=true` in 40s.
  **Two operational notes for the next flip.** (1) Vercel CLI 55 stores a CLI-added var as
  type **Sensitive**, which is write-only: `vercel env ls` shows only its name and
  `vercel env run -e production -- printenv DIGEST_ENGINE` prints nothing. You cannot read
  the value back to confirm it — the only proof the runtime sees the right string is an
  actual digest run. Add the value with `printf 'mapreduce' | vercel env add …` (no trailing
  newline): `digestEngine()` compares `=== "mapreduce"`, so a stray `\n` from `echo` would
  silently serve legacy forever while every dashboard reads "set". (2) `.env.local` was
  deliberately NOT mirrored: it lacks `REDUCE_USD_CAP_DAILY`, so a local mapreduce run would
  fail closed at the reduce guard (ruling 4). Mirror both envs together or neither.
- **2026-07-09 (env mirror; corrects the entry above)** `.env.local` now mirrors both prod vars,
  `DIGEST_ENGINE=mapreduce` + `REDUCE_USD_CAP_DAILY=2` (verified through the loader:
  `digestEngine()` → mapreduce, `reduceDailyUsdCap()` → 2). Value sourced from the entry above,
  not read back — both are stored Sensitive — and corroborated by `REDUCE_DAILY_USD_CAP_DEFAULT
  = 2`. **Note (2) above named the wrong guard; corrected here, since the log is append-only.**
  Per-day caps resolve `envCap(…) ?? (isProduction() ? null : 2)` (digest/map/reduce alike), so
  they fail closed ONLY in production; the environment-independent fail-closed is the TOTAL cap
  (`spend-guard.ts` refuses when `totalCapUsd` and `totalRequestCap` are both unset) — which is
  precisely what ruling 4 says. Ruling right, entry's mechanism wrong. So `LLM_SPRINT_USD_CAP`
  stays absent from `.env.local`: local digest/map/reduce runs refuse to spend at `tryReserve()`,
  which is what stops a stray local script billing the account. Set it only to pay for a run.
- **2026-07-11 (state recon, read-only, $0)** Full DB+git+disk reconciliation →
  `docs/reviews/STATE-2026-07-10.md`. Verified healthy in place: MR sprint 3 shipped and live
  (ru/ua/ir on `openai:gpt-4o-mini+mapreduce`, `votes=5/failedVotes=0`), all July-6 hardening debt
  shipped, 471/41 tests green, 92 post-07-07 commits all accounted (HEAD==origin/main `2884f50`),
  every cron 0-failed/0-killed, map coverage 99.87%, persist guard observed firing (2 ir thin-regen
  refusals), all-time paid spend $40.63 with no daily cap trending. **Two live drifts corrected in
  place above:** (1) **X ingestion FROZEN** since 07-09 20:21Z — `X_SPRINT_USD_CAP` reached, `ingest:x`
  green but fetched=0 (~32h dark, X≈27–29% of citations); (2) **OpenSanctions enrichment FROZEN** at
  the 300-call lifetime cap (confirmed live via `cron_runs` id 253). Both are correct fail-closed
  behavior, but the "live" labels were stale. Also: the `now() AT TIME ZONE 'UTC'` form in `sqlq`
  reads +4h (driver localizes the naive timestamp) — use raw `timestamptz`. New OPEN-TASKS #38–#46;
  stale-open #1/#2/#3 closed (CI, /ask caps, entity-canon — all had shipped); #30/#36 answered with
  measured data. Recommended next session: (b) MTProto ingest sprint (attacks the coverage gap +
  the frozen X dependency; primed by `bc30e2c`, gated on a one-time operator login).
- **2026-07-11 (MTProto ingest sprint, TASKs 0–2 + staging for 3–5)** Prompt:
  `docs/prompts/2026-07-10-mtproto.md`. **TASK 0 gates:** egress PASSED — MTProto works from
  Vercel functions on BOTH transports (`/api/cron/probe/mtproto`: TCP connect 1844ms cold/1567ms
  warm, WSS 1570ms; GetNearestDc ~90ms; empty-session handshake, so live connects with a saved
  session skip the DH cost). Bundler trap for the next gramJS consumer: import everything from
  the `telegram` ROOT module — a `telegram/sessions` subpath import creates a second module copy
  and the client constructor rejects the foreign StringSession by instanceof; `telegram` is in
  `serverExternalPackages`. Login artifact ABSENT → operator-gated (interactive phone-code/QR);
  API creds valid (probe's initConnection accepted them). **Adapter shipped** (TASK 1, 20 tests):
  `telegram_channel_state` table (migration 0013) caches peer id+access_hash (ResolveUsername is
  the flood-limited call; failures back off 1h→48h, capped resolves/run), per-channel
  last_message_id high-water with gramJS REVERSE iteration (ascending from the mark — a burst
  larger than the per-run cap resumes next run instead of silently losing the middle; first
  contact reads one newest page only), flood policy sleep+retry ≤30s / abort-run above (both
  counted in cron_runs counts), marks commit only AFTER insert (runIngest → adapter.commitMarks).
  **Cross-transport dedupe is an explicit lower(external_id) pre-filter** (+ expression index in
  0013): content_hash CANNOT catch it — the adapter name is hashed in, and preview-rendered text
  differs from raw MTProto text; doc_dedup at map stage is the near-dupe backstop. **The
  telegram_mtproto fixture stub is DELETED** and the real adapter owns the name (x kept the
  stub/live x/x_api split only because both names coexist in data; here prod had 0 legacy rows —
  audit-cron, stub-isolation test, hardening itest updated). **Cron**: own group
  `ingest?which=mtproto` :35 hourly, never inside "all" (flood budget = the spend-guard analog);
  verified on prod fail-closed (ok=true, fetched=0, no session). **Expansion staged** (TASK 4):
  mtproto reads registry top-75 vs the scraper's top-50; ranks 51–75 are the 25-channel batch;
  six Iran-Update-cited channels pinned → ir (rahbar_enghelab_ir, sepah_pasdaran, elamalmoqawama,
  bentzionm, presstv, manniefabian — coverage-lens rationale of the 07-09 #29 adjudication).
  **Backfill staged** (TASK 3): `scripts/mtproto-backfill.ts`, estimate-first and --apply-gated;
  dedupe-aware estimate counts only NEW docs toward map cost: ~44K docs ≈ $3.37 of the $6 sprint
  LLM budget (the naive both-transport count read $6.57 and would have wrongly refused).
  **Blocked on the operator login** (then: local getMe check via `scripts/telegram-getme.ts`,
  TELEGRAM_SESSION into Vercel prod via printf (Sensitive var — verify by exercising, not
  reading), redeploy, backfill --apply, first live cron day): TASKs 3–5 including the
  preview-scraper fate decision, which waits for a proven full MTProto day by design.
- **2026-07-11 (MTProto RU/UA-priority roster — branch `codex/ru-ua-mtproto-priority`, code+env
  done, DEPLOY PENDING)** Reprioritizes MTProto's registry roster to Russia/Ukraine. Before: MTProto
  read the registry's **pan-theater** top-75, which blended ROCA and Iran-Update citations —
  verified live that 16 of those 75 slots were Iran-Update-dominant channels (mmirleb alone has
  5,730 Iran citations). After: `registryTelegramChannels()` takes an options object
  `{ topN?, reportTheater? }`; MTProto passes `reportTheater='ru'` (ROCA-only, filters
  `isw_reports.theater='ru'`) + `topN=120`. Web Telegram passes neither → its pan-theater top-50 is
  **byte-for-byte unchanged** (proven: real `telegramChannelRoster()` against prod returns the same
  70-channel pan-theater roster; MTProto now returns 136 channels ru:102/ua:31/ir:3, the 3 ir being
  the intentional curated OSINT aggregators, zero Iran-Update *registry* channels). Tuning values are
  now env-overridable with safe fallback: `REGISTRY_TELEGRAM_TOP_N` (50), `REGISTRY_TELEGRAM_TOP_N_MTPROTO`
  (120), new `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER` (ru), plus the pre-existing `TG_MTPROTO_*`
  knobs — all set in Vercel as **type=plain (non-Sensitive, readable back)**, in prod+preview+dev,
  BEFORE deploy (the registry 3 are inert until this branch ships; `TG_MTPROTO_CHANNELS_PER_RUN=40` +
  `TG_MTPROTO_RESOLVES_PER_RUN=12` affect the current deployed cron immediately). **27 Ukrainian
  official/military channels pinned → ua** in `TELEGRAM_CHANNEL_THEATER` (the pin fixes their ru/en
  posts, which the uk→ua language rule alone misses — same coverage-lens mechanism as the ir pins).
  Every pin registry-verified: ROCA-cited, ~0 Iran citations, inside the ROCA top-120, docs
  predominantly Ukrainian-language, confirmed institutional identity. The five originally-held
  candidates (sjtf_odes rank 9, joint_forces_task_force rank 13, usf_army=Unmanned Systems Forces,
  andriyshtime, odesamva) were resolved by the DB probe and included — the candidate list is fully
  pinned. `scripts/mtproto-backfill.ts` gains `--registry-top-n / --report-theater / --theaters /
  --budget-usd` (RU/UA eval command documented in-file). Tests: +13 (config env-wiring, theater
  filter shape, ROCA-only vs pan-theater wiring, 27-pin routing, curated dedupe) → 504 green;
  typecheck+lint clean. Merged to main and **deployed 2026-07-11**; the standing "Current state"
  Ingestion line was corrected in place to "top-120 ROCA-only" as part of this deploy.
  Rollback is env-only, no redeploy: set the plain var
  `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER=all` → pan-theater ranking again (unset/empty stays ru by
  design, so `all`/`any` is the deliberate opt-out; `envReportTheater`). The 27 ua pins are additive
  and harmless to leave. No migrations, no invariant changes.
- **2026-07-11 (deploy EXECUTED + first live MTProto fetch VERIFIED — supersedes the "DEPLOY PENDING"
  header of the entry above)** Merged `codex/ru-ua-mtproto-priority` → main (`646b5a4`) and deployed
  to prod (`dpl_w231oedey89E3S8A3b7vAB7HFNzk`, READY, aliased `bnow-net.vercel.app`; prod had been on
  the pre-`609c34b` build `6a486a1`, so this also shipped the intervening docs commit). Verified by
  evidence: two manual `ingest?which=mtproto` runs on the new build returned
  `channelsPicked=40 / resolves=12` (vs `25 / 8` on the runs minutes earlier on the old build) —
  proving the plain env vars `TG_MTPROTO_CHANNELS_PER_RUN=40` + `TG_MTPROTO_RESOLVES_PER_RUN=12` are
  read live — with `fetched=1999` then `1285`, `errors=0`, `skippedExisting=915/1379`
  (cross-transport dedupe firing). **This is also the FIRST PROVEN LIVE MTProto FETCH** (session +
  egress both work end-to-end; ~3.8K docs, all-time mtproto footprint ru:1580/ua:945/ir:647 where the
  647 ir are ONLY the 3 curated OSINT aggregators, zero registry Iran-Update channels — the ROCA-only
  filter working as designed). The 27 ua pins route correctly: 4 already ingesting
  (robert_magyar 249 / sjtf_odes 164 / joint_forces_task_force 130 / synegubov 27 docs, all tagged
  ua), the other 23 rolling in over the next few `:35` crons (resolve budget 12/run, `resolveBudgetSkips=28`).
  Backfill script re-verified in estimate mode with the RU/UA flags (133 ru/ua channels, ~$3.07 map
  cost < $6 budget); a live `--apply` backfill still runs only from a box with the session + Telegram
  egress (not this WSL2 dev box) or via the accumulating `:35` crons. Workstream
  `.workstream/codex-ru-ua-mtproto-priority` closed out.
- **2026-07-12 (MERGE 1: ASK Tier-2+ → main, migrations 0014+0015 on prod, v2 LIVE)** Attended
  gated session; full account in `docs/reviews/MERGE1-ASK-DEPLOY-NOTE-2026-07-12.md`. Branch
  `20260711-ask-tier2plus` merged `--no-ff` (`58ac262`, fork point `c49b79f`, 12 commits, zero
  conflicts), pushed with the eslint fix `f74896c` (`.workstream/**` ignore — the design
  worktree's `.next` was breaking main-checkout lint), deployed `bnow-j5lob1iu2` READY, project
  domain serving. Migrations 0014 (claim_embeddings + HNSW + GIN FTS) + 0015 (18 ask_usage
  columns) applied to prod and verified additive-only; trigger 9999 untouched; embedding
  backfill 776/776 claims @ $0.0003. Cap envs set non-Sensitive in Production AND Preview
  BEFORE the deploy and read back: `ASK_USD_CAP_DAILY=2`, `EMBED_USD_CAP_DAILY=1`,
  `ASK_GLOBAL_DAILY_BUDGET_USD=10`, `ASK_USER_DAILY_LIMIT=100`. Answer model stays gpt-5
  (operator R2); `ASK_PIPELINE` deliberately unset — v2 is code default, `legacy` is the
  instant rollback. Smoke GREEN: 9 paid v2 answers, per-stage costs sum exactly to cost_usd
  on every row, models recorded, temporal window echo parsed+rendered (07-05→07-12), negative
  control declined honestly (operator-confirmed), unauth /api/ask 307s to /signin. **Process
  incident, ratified:** the Phase-3 "dry-run" applied 0014+0015 to PROD instead of the Neon
  branch — `scripts/migrate.ts` resolves `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, and the
  branch override set only `DATABASE_URL` while `.env.local`'s UNPOOLED var (loaded by the
  script's own dotenv) silently won. Outcome was byte-identical to the gated plan (verified:
  additive DDL only, zero data impact, snapshot branch pre-dated the write); operator ratified
  as G2-done. **Standing trap: any branch-targeted migrate/scripts run MUST override BOTH
  `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.** New finding → OPEN-TASKS #48: /ask form has no
  pending-disable, so slow answers get double-submitted and double-billed (observed 2-3× on
  smoke questions; caps contain it). MERGE 2 handoff: Neon snapshot `premerge-20260712`
  (`br-solitary-frost-at6wlzi1`) is KEPT until MERGE 2 completes; prod migration head = 0015
  (snapshot id `af3e3af0-7331-4af8-9c45-40be65726334`) — the design branch's regenerated 0016
  must chain prevId to exactly that id, journal idx 16; do NOT run `drizzle-kit generate` for
  anything before MERGE 2 completes. Adversarial drizzle review (independent, read-only):
  no blockers; noted migrate.ts applies statements non-transactionally without IF NOT EXISTS —
  keep `DROP TABLE IF EXISTS claim_embeddings; DROP INDEX IF EXISTS claims_text_fts_idx;`
  handy if a future 0014-class apply dies mid-file. Session OpenAI spend $0.121 of the $1.50
  session cap (backfill $0.0003 + smoke $0.121). Branch backups: tag `pre-merge-ask-20260712`
  + `~/bnow-branches-20260712.bundle` (both local, both branches).
- **2026-07-12 (MERGE 2: design/site-structure → main, migration 0016 on prod, role
  grants, DEPLOYED)** Unattended session; full account in
  `docs/reviews/MERGE2-DESIGN-DEPLOY-NOTE-2026-07-12.md`. Branch
  `20260711-design-commercial-site` merged `--no-ff` (`dc51cbd`, fork point `c49b79f`);
  exactly two conflicts, both in the pre-authorized register set (journal + 0014
  snapshot → main's ASK side; design's `0014_square_silver_centurion.sql` deleted).
  Role migration **regenerated as `0016_charming_veda`** (`3e42d65`): journal idx 16,
  snapshot prevId `af3e3af0-…` (0015's id), SQL byte-identical to design's original —
  one additive ALTER; double-generate clean; Opus adversarial review PASS (zero
  blockers, security posture confirmed: fail-closed roles, server-side sort ignore,
  /middle-east SQL splice, signals currentUserEmail boundary, ASK surface untouched).
  Dry-run on the Neon snapshot branch applied exactly 0016 — **BOTH `DATABASE_URL` and
  `DATABASE_URL_UNPOOLED` overridden and verified through the real `scripts/env` loader
  before running (the MERGE 1 trap did not recur)** — then prod migrate: head = 0016,
  `users.role` live, 3 rows default 'user', count unchanged. **R4 grants executed:**
  gregoryoconnor@gmail.com + jason@americanpoliticalservices.com → analyst;
  go@vociferous.nyc → admin (defensive); go@vociferous.ai → admin (row CREATED, id
  `63ec7e25-…` — did not exist; awaiting operator confirmation of the .ai/.nyc pair).
  ADMIN_EMAILS: Production only (Sensitive/unreadable), absent Preview/Dev — proceeded
  per register step 3 (fail-closed). Gate 902 tests/67 files green; deployed
  `bnow-nqegy57dk`, 22/22 signed-out checks green after one adaptation: the check list
  expected 200 from `/registry`+`/middle-east`, but those routes have been layout-gated
  (`requireUser()`, commit `7e1f2c5`) since before the design branch — 307→/signin is
  pre-existing behavior, so no A3 rollback; instead the 307 flight-data bodies were
  audited (anon → reduced view, zero score values) and the server-side
  `?sort=reliability` ignore proven live. D5 weekly materializer cron stays PARKED.
  Neon snapshot branch `premerge-20260712` DELETED (green path); tags + bundle kept.
  $0.00 OpenAI. MERGE 1's "no drizzle-kit generate before MERGE 2" freeze is lifted.
- **2026-07-12 (ASK polish sprint, unattended — FULL SHIP, deployed)** Five live-smoke
  findings fixed on branch `20260712-ask-polish` (tag `pre-ask-polish-20260712`), merged
  `0fe0bc6`, deployed **`bnow-qdesocr6p`** (rollback target recorded pre-deploy:
  `bnow-nqegy57dk`); full account `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`.
  **W0 diagnosis refined the ticket:** the day-of smoke questions' windows were genuinely
  empty (first 07-12 claims landed 04:01Z, questions 01:42Z) BUT the "claim IDs" leakage
  came from entities-only evidence — the no-evidence short-circuit required claims AND
  entities empty, so gpt-5 was paid to answer from `CLAIMS: (none)` + entity rows.
  **Architecture ruling (R3 hard rule, absorbed into W2):** GET /ask?q= previously
  EXECUTED the paid pipeline (root cause of #48 double-billing + refresh/back-nav/
  shared-link re-billing); execution moved into a useActionState server action (auth
  re-checked inside), GET now only prefills — pinned by a money test AND a live prod-DB
  probe (GET wrote no ask_usage row). Tradeoff accepted: answers are not URL-addressable.
  **W1 gated per R1 on a disposable Neon branch** (both DATABASE_URL vars overridden +
  asserted; first attempt correctly failed closed on unset LLM_SPRINT_USD_CAP): honesty
  5/5, known-answer citations 5/5, first run, no metric edits (R2 clean). Legacy SYSTEM
  byte-preserved under a frozen-fixture test; new knobs `ASK_NO_COVERAGE_SHORTCIRCUIT`
  (default on) + `ASK_RELATED_MIN_SCORE` (default 0.5, calibrated: max observed junk
  vectorScore 0.4547 → smallest excluding floor rounded up; null vectorScore excluded, so
  v2-lexical-only mode renders no related block). W4 replay ran on its own disposable
  branch because guard metering WRITES provider_usage — "SELECT-only prod" honored by
  construction. Both branches deleted. OPEN-TASKS #48 closed (idempotency window stays
  parked); 3 uk strings appended to the native-review inventory. Tests 902→956 (74
  files). OpenAI spend $0.106 of $2. Operator checklist in the note §⑥.
- **2026-07-12 (analyst home & Iran prominence sprint, unattended — FULL SHIP, deployed)**
  Plan `docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md` (installed this session; the executing
  prompt's full decision register never reached the repo — reversible defaults taken and
  ledgered in the readback, `docs/reviews/ANALYST-HOME-READBACK-2026-07-12.md`). All seven
  workstreams shipped; branch `20260712-analyst-home-iran` (tag
  `pre-analyst-home-20260712`) merged `4482669`, deployed **`bnow-jihmibgm6`** (rollback
  target recorded pre-deploy: `bnow-qdesocr6p`); morning note
  `docs/reviews/ANALYST-HOME-NOTE-2026-07-12.md`. **Iran quality gate PASSED on evidence**
  (daily 3-track ir digests, claim parity with ru/ua, validation 07-11 ir 100% vs ru 57.1 —
  the 07-10 "IR parity 57.5" concern is stale), so public Iran prominence shipped; no
  Iran-quality emergency follow-up warranted. Ship list: signed-in quick-links rail +
  quick-strip upgrades + recent-asks; additive signed-out Iran/Gulf card; digest archive
  `/digests/[country]` + prev/next nav (closes the "yesterday's digest unreachable" gap) +
  scoreboard→digest cross-link; feedback mailtos (new plain env `FEEDBACK_EMAIL` =
  go@vociferous.nyc in prod+preview+dev, verified by round-trip; affordances hidden when
  unset); **/search free claim search** — ASK v2's lexical arm extracted MECHANICALLY to
  `src/lib/ask/lexical.ts` (all 252 pre-existing ask tests green with zero edits; module
  carries a never-guard/never-provider/never-write invariant comment), $0 proven live
  against prod (5 queries: ask_usage 28→28, provider_usage 343→343) and pinned by
  throw-if-touched tests. **Deliberate contrast ruling: GET /search?q= EXECUTES ($0
  deterministic SQL) while GET /ask?q= only prefills (paid) — documented in the page
  source; do not "unify" them.** Tests 956→996 (79 files); typecheck/lint/`next build`
  green; prod smoke green signed-out (Iran card live, marketing sections byte-intact,
  /digests/ru + /search 307-gated). Deep links verified sound: claim_date==digest_date for
  all 846 claims (latent coupling → OPEN-TASKS #54; /search nav entry deferred → #55).
  31 uk strings appended to the native-review inventory. LLM spend $0.00.

- **2026-07-12 (analyst-trust sprint, unattended — FULL SHIP, deployed)** Prompt
  `docs/prompts/2026-07-12-analyst-trust.md`; branch `20260712-analyst-trust` (tag
  `pre-analyst-trust-20260712`) merged `2feb128`, deployed **`bnow-kw2t3dndf`**
  (rollback target recorded pre-deploy: `bnow-jihmibgm6`); morning note
  `docs/reviews/ANALYST-TRUST-NOTE-2026-07-12.md`. **W0 root cause of the operator's
  "not yet generated beside 14 claims" screenshot: the home digest query's
  `row_number() AS rn` comes back from the Neon driver as a STRING and the fold's
  `=== 1` never matched** — latestDate folded null on every theater since the
  analyst-home ship; unit tests passed because mocks used JS-number rn (now
  driver-realistic + regression-pinned). Shipped: W1 time model (src/lib/time/*,
  docs/TIME-MODEL.md, cadence-aware status naming bucket+stage, claims count keyed
  to the displayed bucket = R2 contradiction structurally impossible, ET-day params
  replace SQL current_date); W2 signed-in home reorder per R3 (compact headline, no
  hero/CTAs, whole-card stretched links, tiles last) + R7 (magic-link lands on `/`,
  was /account); W3 scoreboard explainer + per-metric how-to-read (definitions
  verified against scoring code); W4 **at-publish dual coverage** — evidence-in-hand
  (min fetched_at, NOT the source's publish claim) vs ISW's stored datePublished,
  same denominator as coverage_pct, persisted scoring-time to details.atPublish
  (jsonb, zero migration), deterministic 7-day backfill branch-rehearsed then prod
  (15/18 decorated, 3 honest skips where digests regenerated post-scoring; NO
  headline number changed; ir 07-11 = final 100% vs at-publish 0% — real), full
  cutoff/snapshot design PARKED in docs/designs/ISW-CUTOFF-SCORING.md per R6(d);
  W5 registry ADMIN-ONLY (requireAdminOr404 → 404 for analyst/user/anon, links
  removed everywhere, source mailto → digest footer; ADMIN_EMAILS now readable-plain
  in all three Vercel envs + .env.local = go@vociferous.nyc). **Vercel CLI trap
  resolved: this team's policy stores Production/Preview env adds as Sensitive
  (write-only) by default — `vercel env add NAME <env> --no-sensitive --value` is
  the readable form** (explains every Sensitive-var episode since 07-09). Tests
  996→1053 (84 files); spend $0.00 of $5. New OPEN-TASKS #56 (R8 platform-source
  segmentation) + #57 (/pricing promises registry access the product no longer
  grants — operator decision). 18 uk strings appended to the native-review
  inventory. `data/embed-backfill-checkpoint.json` untracked + data/*.json ignored
  (was swept into the merge by git add -A, then removed).

- **2026-07-12 (IA-refinement sprint, unattended — FULL SHIP, deployed)** Prompt: information-
  architecture refinement (four residual problems a live review found). Branch
  `20260712-ia-refinement` (tag `pre-ia-refinement-20260712`) merged `--no-ff` to main and
  deployed **`bnow-iqaszhc0d`** (`dpl_85zESfEja8Zt992u3o4c1DqHaa5C`, READY, **aliased
  https://bnow.net** — the custom domain is now the production alias; rollback target recorded
  pre-deploy: `bnow-kw2t3dndf`). Review gate: `docs/reviews/IA-REFINEMENT-REVIEW.md`.
  **Shipped: (1) Nav** — retired the Product dropdown (its three children duplicated
  destinations reachable elsewhere), promoted **Signals** + **Ask** to top-level links, dropped
  the Solutions>political_risk duplicate of /signals → **every route now has exactly one nav
  path** (`/countries` was the target of five, `/signals` of two). `src/lib/nav/site-nav.ts`
  SECTION_IDS = coverage/signals/ask/solutions/validation/pricing. **(2) Per-country pages** —
  new public, indexable `/countries/[iso2]` (one dynamic route, all non-deferred theaters,
  localized `generateMetadata`, public-safe aggregates only); Coverage dropdown + the
  `latestDigestHref` fallback point there via `theaterHref()`=`/countries/<iso2>` (was `#`
  anchors); the /countries index cards link onward and keep their `id={iso2}` anchors so old
  `/countries#ru` bookmarks still scroll (fragments can't be server-redirected — documented).
  **3-vs-8 undersell fixed:** signed-out `home.live` is now `"Live now: {n} theaters — daily
  depth in Russia, Ukraine and Iran"` with `{n}` from `count(*) countries WHERE
  status='active'` (=8), rendered only when >0 (truth-in-UI on DB failure). **(3) /signals
  gating** — `toPublicSignal()` (`src/lib/analyst/signals.ts`) projects a signal to its safe
  teaser (severity/theater/kind/headline-count/evidence-count) and drops `detail` (named
  individuals, dollar figures, target/flow lists), `evidenceClaimIds`, `evidenceRefs`; the
  page renders `detail`+evidence ONLY inside the `signedIn` branch, so the specifics never
  enter the anonymous server-rendered HTML (data-layer withholding, not CSS/DOM — no
  `/api/signals`, `computeSignals` server-only, `ClaimSources` server+signed-in-only).
  **(4) Crawl policy** — `src/app/robots.ts` (disallow gated/admin/API, allow teasers) +
  `sitemap.ts` (public surface + active theaters, DB-driven, degrades) + `siteBaseUrl()`
  (`src/lib/site-url.ts`, NEXT_PUBLIC_SITE_URL → VERCEL_PROJECT_PRODUCTION_URL → bnow.net).
  **Independent read-only architecture review PASSED all 7 checks** (gating real-not-cosmetic
  the highest, verified no leak path; no dead links/collisions; render modes preserved; i18n/
  a11y/SEO complete) with one low CONCERN (the "0 theaters" DB-failure copy) fixed in the same
  sprint. **Post-deploy prod smoke GREEN incl. the security-critical one: anon `curl
  https://bnow.net/signals` shows the teaser but ZERO occurrences of `Targets incl.`/`factional
  purge`/`Suppressed:` — names genuinely withheld in production**; home nav = the new bar with
  no Product; `/countries/ru` 200; robots.txt/sitemap.xml correct (8 active theaters, no gated
  leaks); public routes 200, gated 307, admin 404 — all unchanged. No migrations, no new env
  vars, no paid-provider calls (ruling 4 N/A), no invariant changes (ruling 15 corrected in
  place: theater pages now exist). Tests 1053→1075 (87 files); typecheck/lint/`next build`
  clean; LLM spend $0.00. New OPEN-TASKS #58 (legal review of named individuals on the signed-in
  /signals view), #59 (native review of the new i18n strings), #60 (dead nav i18n keys cleanup).
  Standing ruling 15 + the Surface/directory sections corrected in place.

- **2026-07-12 (legal acceptance sprint — versioned Privacy/Terms + first-login clickwrap +
  server-side enforcement, FULL SHIP, NOT deployed)** Added public `/privacy` + `/terms`
  (Privacy Notice v1.0 + Terms of Use v1.0, effective 2026-07-12, copy supplied verbatim; shared
  `src/components/legal-document.tsx`, DB-free, indexable + in sitemap), a global `SiteFooter`
  (Privacy · Terms · Status · Contact) in the root layout that replaced the home-only footer
  (removed to avoid a duplicate on `/`; hidden on `/admin`), a pre-auth 18+ disclosure on
  `/signin`, and a first-login acceptance screen `/welcome/legal`. **Central version config**
  `src/lib/legal/policies.ts` (bump `CURRENT_TERMS_VERSION`/`CURRENT_PRIVACY_VERSION` + the copy →
  users lacking the new pair re-accept); operator identity kept there (Vociferous.ai / New York /
  go@vociferous.nyc) so the future Delaware entity is a one-line change — no invented LLC.
  **Append-only record** `policy_acceptances` (migration **0017_flashy_photon**, forward of 0016,
  9999 still last; FK→users cascade, unique (user_id, terms_version, privacy_version); columns:
  user_id, terms/privacy version, DB-`DEFAULT now()` accepted_at, adult_attested,
  privacy_acknowledged, acceptance_method=`first_login_clickwrap`, nullable locale — and
  deliberately NO IP / user-agent / birth-date / token). The insert is idempotent (ON CONFLICT DO
  NOTHING) and reads back the DB timestamp; the server action re-validates BOTH checkboxes and the
  session (a forged/incomplete POST is rejected); `safeInternalPath` collapses any external/open-
  redirect `next` to `/`; acceptance is DB-derived, never a session flag, so it can't be marked
  before the insert lands. **Enforcement:** new `requireAcceptedUser()` (auth + current acceptance,
  fail-closed) wired into the ask/search/entities/digests **layouts** and — independently — the ask
  **server action** + **`/api/ask`** route; the signed-in **home** redirects before any subscriber
  query or recent-Ask render; **/signals** gates its `detail`/evidence on acceptance (anonymous +
  signed-in-unaccepted both see only the safe teaser); **/account** shows accepted versions +
  server timestamp (no id/method leaked) and redirects if unaccepted; `requireAdminOr404` redirects
  a confirmed admin who hasn't accepted while non-admins keep the 404 (registry gate unweakened).
  Magic-link `redirectTo` moved `/` → `/welcome/legal?next=/`; requesting a link is NOT the
  persisted acceptance (only the authenticated clickwrap is). **Truth-in-UI / factual constraints
  honored:** Privacy Notice states plainly that Ask questions are STORED (email + usage metadata,
  sent to OpenAI), never anonymous/ephemeral; no certifications, deletion-schedule, security or
  compliance guarantees; Stripe described conditionally; no analytics/cookie-consent added; no
  question storage changed and no retention job added. **Dev/demo parity:** with FEATURE_AUTH_GATE
  off, anonymous visitors are unaffected and no acceptance is manufactured for them, but a REAL
  authenticated user is still held to acceptance (identity-scoped, not gate-scoped). **Verified:**
  typecheck + lint clean; `next build` clean (all new routes compile); **1143 unit tests / 97 files**
  green (was 1053/84 — +57 legal + updated ask/home/signals/signin/gate/seo mocks); **integration
  suite green on a disposable Neon branch incl. 5 NEW real-Postgres tests** that apply 0017 and
  prove DB-generated timestamp, idempotency, append-only version bump, the unique constraint, and
  FK cascade. No new env vars, no paid-provider calls (ruling 4 N/A), invariants 1–5 untouched
  (migration additive; trigger 9999 unchanged; `migrations.test.ts` + new
  `policy-acceptances.migration.test.ts` both green). **NOT deployed** (per prompt); operator applies
  0017 via the gated migrate flow (override BOTH `DATABASE_URL` + `DATABASE_URL_UNPOOLED` for any
  branch-targeted run — the MERGE 1 trap) before/with the deploy. Note:
  `docs/reviews/LEGAL-ACCEPTANCE-NOTE-2026-07-12.md`.

- **2026-07-13 (legal acceptance — adversarial review + migration applied + deploy EXECUTED;
  supersedes the "NOT deployed" header of the entry above)** Branch `20260712-legal-acceptance`
  merged `--no-ff` to main (`7da22db`) and pushed (pre-push gate green). Order followed
  migrate-before-deploy (additive/expand migration: the new code reads `policy_acceptances` every
  gated request, so deploy-first would fail-closed-lock-out every subscriber). **Independent
  read-only adversarial review** (a second agent, full route/gate topology) returned **no
  blocker/major**; its minor findings were applied on a second commit (`e62c14e`): `requireAdmin`
  (the /admin console) now also holds a confirmed admin to acceptance (consistency with
  requireAdminOr404); `/ask` page uses `requireAcceptedUser` (was requireUser) so no gated render
  drops to auth-only; `recordAcceptance` refuses a non-attesting row (`invalid_attestation`,
  defense-in-depth). **Migration**: verified the target = prod (`ep-jolly-glitter…`, head 0016),
  then `npm run db:migrate` applied ONLY 0017; post-verified the table (9 cols, `accepted_at`
  DEFAULT now(), unique `policy_acceptances_user_versions_uq`, FK delrule=c, 0 rows,
  `_migrations` has 0017). **Deploy** `dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh` READY, aliased bnow.net
  (rollback = `bnow-iqaszhc0d`). **Anon prod smoke green**: /privacy + /terms 200 (v1.0, effective
  July 12 2026, "questions stored", no false-anonymity), global footer live, /signin 18+ notice,
  robots disallows /welcome/ + allows /privacy//terms, sitemap lists both, gated
  ask/account/search/digests/entities + /welcome/legal all 307→/signin, /pricing//scoreboard 200,
  /signals 200 with 0 leak markers, /admin 404. Tests 1147/97, typecheck/lint/`next build` clean.
  No new env vars; invariants 1–5 untouched. (WSL2 note: bnow.net isn't DNS-pinned so local curl
  intermittently 000'd; the DNS-pinned `bnow-net.vercel.app` project domain is the reliable
  local check.)

- **2026-07-13 (provider caps raised + production restart)** Operator confirmed the
  OpenSanctions account dashboard has exactly 300 `/match/default` requests in its 90-day view
  (200 on 07-07, 91 on 07-08, 9 on 07-09) against a 2,000-request/month allowance. Cap vars were
  made explicit in **all three Vercel environments** before deploy: OpenSanctions
  `OPENSANCTIONS_CALL_CAP=2000`, daily calls 200, run calls 120, daily estimated-USD ledger 40;
  X `X_SPRINT_USD_CAP=75`, `X_DAILY_USD_CAP=2.50`. Deploy
  `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV` READY + aliased bnow.net; project-domain `/health` 200.
  Runtime proof: manual `ingest:x` fetched+inserted 1,889 docs, 0 errors in 193s, moving the
  x_api ledger $5.0000→$5.2834; manual **non-refresh** OpenSanctions gap-fill checked 120/120,
  matched 92, sanctioned 22, failed 0, no budget stop, moving live coverage 300→420 and ledger
  300→420. The unsafe `refresh=1` path was deliberately NOT called. Current code still sums the
  OpenSanctions cap across all history and refresh batches repeat the same priority prefix; prompt
  `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` specifies calendar-month accounting +
  a fixed-cutoff resumable rescore. Until that patch ships, the raised 2,000 behaves as an all-time
  cap; ordinary unchecked gap-fill is live, full rescore is held. No application code changed.

- **2026-07-13 (X restart follow-up; standing state corrected)** The first normal scheduled
  `ingest:x` after the 1,889-document restart proof ran at 14:20Z: fetched 222, inserted 42,
  errors 0, and advanced `provider_state.x_api.lastPollAt` to 14:20:09Z. This proves current
  steady-state polling resumed, but does **not** prove the July 9–13 history is complete: the
  restart used the existing five-page batch ceiling, whose loop can end with another cursor and
  still save the new watermark. The historical gap remains an explicit audited-recovery task;
  prompt `docs/prompts/2026-07-13-x-gap-catchup-rescore.md`. Current-state text and #38 were
  corrected in place to distinguish live-now health from historical completeness.


- **2026-07-13 (private-beta readiness sprint — FULL SHIP, deployed)** Prompt:
  `docs/prompts/2026-07-13-private-beta-readiness.md`; branch
  `20260713-private-beta-readiness` (tag `pre-private-beta-20260713`, isolated
  worktree), merged `--no-ff` `86ef6ef`, pushed (pre-push green), **migrations 0018
  (subscribe_intents beta-request columns) + 0019 (trade_flows.partner_name) applied to
  prod BEFORE deploy and post-verified**; `SIGNIN_MODE=open` added readable-plain to all
  three Vercel envs and READ BACK before deploy. Deploy
  **`dpl_6ML79nJiEpNzASBszH6TNvLYaGvf`** READY (rollback target:
  `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV`). Full account:
  `docs/reviews/PRIVATE-BETA-READINESS-NOTE-2026-07-13.md`. Ship list: public offer
  repositioned as a **private analyst beta** (/access request form + honeypot + dedupe +
  operator email + /admin/access review list; /pricing 308→/access; price cards, dollar
  amounts, founding-subscriber copy and src/lib/pricing DELETED; signed-in nav carries no
  commercial entry; invite-gateable sign-in at the deliverMagicLink seam — **prod stays
  `open`; flip is an operator decision**); **publication-safety guard** (new standing
  ruling 19) + scoreboard "BNOW-only reported item" framing; signals purge detector
  reworked (person-only, procedural-text qualifier, canonical counting, no names/"purge"
  in detail — expect the junk-built ir signal to disappear); ask relevance boundary
  (required bounded relevant_count in the rerank schema, insufficient stop before the
  answer model, post-answer denial correction, evaluator now requires zero citations for
  negative honesty); entity ё-fold + Vorobyov alias family (prod dry run 763→578,
  **cleanup plan awaiting operator approval** — ENTITY-CLEANUP-PLAN-2026-07-13.md, apply
  before the OpenSanctions rescore); 390px overflow ROOT-CAUSED in a real browser
  (Chromium floors flex-item <main> at min-content; root-layout block wrapper fixes all
  pages; 17 routes measured scrollWidth==390) + dropdown exclusivity proven under
  trusted input (synthetic-click gap documented, no global state); critical-materials
  partner names (193-code M49 map + partnerDesc persistence + includeDesc=true —
  live-verify on the next monthly pulls), datadark latest-period correctness (matchAll +
  latest date + age-based staleness + anomaly guard; prod cbr-key-rate 17.09.2013/ok row
  self-corrects on the next 09:00Z cron) + UN Comtrade provenance links (S&P/CEPR/KSE
  name-drops removed). Tests 1147/97 → **1279/105**; integration (Neon branch, 3/14) +
  `next build` green. **Anon prod smoke 36/36** (one initial FAIL was framework CSS hex
  matching the #NNN grep — real supplier labels verified named, e.g. Israel 10.4% was
  #376): /access 200 + neutral no-purchase wording, /pricing 308, gated 307, /admin 404,
  home badge + zero founding/pricing copy, signals zero leak markers, trade/materials
  provenance live, sitemap swapped. OPEN-TASKS: #57 closed, #58 advanced, +#61–#65.
  LLM spend $0.00 (no paid eval run — not operator-authorized). Operator items: beta
  wording confirmation, SIGNIN_MODE flip + grandfather set, /access response window,
  entity plan apply, Graham digest-row repair (#62), Postmark sender domain, THEN the X
  historical catch-up (B/E readiness satisfied: B deployed, E code deployed with the
  merge plan pending) and the OpenSanctions rescore LAST.

- **2026-07-13 (post-sprint remediation — seven code-review findings fixed, NOT deployed)**
  Review of the private-beta sprint surfaced seven defects; all seven reproduced by focused
  tests first, then fixed. **(1) Digest mail privacy:** `scripts/email-digest.ts` UNION-selected
  every `subscribe_intents` address — a /access beta REQUEST (or any legacy pricing intent)
  would have received a production digest on the next manual run, and zero recipients fell back
  to mailing `demo@bnow.net`. Recipient policy extracted to
  `src/lib/email/digest-recipients.ts`: users⋈subscriptions with status active/pending ONLY,
  never subscribe_intents (no documented opt-in ever existed — the UNION was one early-demo
  commit), zero eligible → send nothing (`--to=` = explicit operator test override).
  **(2+3) Ruling 19 strengthened (corrected in place):** an R1-dropped allegation now forces the
  event's title/summary rebuild (previously a safe subclaim kept the original prose, allegation
  included); event copy on allegation-bearing events is REBUILT for title AND summary, never
  prefix-patched; new `hasGoverningAttribution` — attribution must PRECEDE the allegation
  content, so the production-shaped Graham title ("died unexpectedly, with reports suggesting…")
  no longer passes as "attributed" (the old fixture's simplified title had not pinned that
  shape; note corrected). **(4) Ask honesty:** the post-answer denial correction replaced only
  metadata — the model's citing tail ([cN] markers + irrelevant claim summaries) stayed VISIBLE
  while the evaluator scored it honest off citedClaimIds=0. Now the answer text itself is
  replaced with the deterministic `insufficientEvidenceCopy` (shared with the relevance
  boundary), and `isNegativeAnswerHonest` rejects surviving citation syntax in the text.
  **(5) Datadark granularity:** `parsePeriodLabel` returns a RANGE aged from its END — a bare
  "2026" no longer maps to Jan 1 (which would have falsely staled cbr-statistics ~2026-04-01
  under 2× its 45-day cadence); impossible dates (31.02) rejected instead of rolling over.
  **(6) Entity durability:** the cleanup plan's "future persists fold at source" claim was
  WRONG — reduce-time folding can't help when evidence carries a single raw variant, and
  `persistDigest` matched entities by exact (kind, name). Persist now resolves by canonical
  identity (kind + `canonicalKey`, per-transaction cache, raw spellings appended to aliases);
  OPEN-TASKS #61 gains a hard sequencing rule: deploy this before applying the cleanup plan.
  **(7) /trade provenance:** `latestTradeFetch` had no flow filter, so the materials job's US
  import rows (flow M, partner 643) could stamp the export page's "last fetched" date; replaced
  by `tradeFetchWindow` sharing ONE cohort SQL fragment with `getDivergence`, rendered as a
  range ("fetched between A and B") when reporters refreshed at different times. Tests
  1279/105 → **1321/107**; typecheck/lint/`next build` green; no deploy, no prod writes, no
  paid calls, no migrations. Docs corrected: ruling 19 (in place), ENTITY-CLEANUP-PLAN §4,
  PRIVATE-BETA-READINESS-NOTE §B/§D annotations, OPEN-TASKS #61. Full account:
  `docs/reviews/REMEDIATION-NOTE-2026-07-13.md`.

- **2026-07-13 (X gap recovery + bounded rescore — IMPLEMENTED and tested, NOT run, NOT
  deployed)** Prompt `docs/prompts/2026-07-13-x-gap-catchup-rescore.md` (sequencing gate met:
  Workstream B deployed, E on main). Zero paid calls / prod mutations / deploys / env changes —
  production contact was read-only SQL only. **(1) Steady-state watermark is now INSERT-GATED
  and truncation-safe:** `XApiAdapter.fetchLatest()` never writes `x_api.lastPollAt`; a globally
  complete pass prepares a pending mark that `runIngest` persists via `commitMarks()` only after
  `insertDocs()` succeeds; junk-200 bodies are parser failures (`isSearchPayload`), and hitting
  the preserved 5-page ceiling with a live cursor is a counted `pageTruncation` that fails the
  pass — the silent-loss mode behind the unproven July 9–13 window is structurally closed. Every
  `ingest:x` run now writes numeric `cron_runs.counts.x_api` (`requests/units/budgetStops/
  pageTruncations/requestFailures/lockSkips/incomplete/docs`) — the raw signal for the still-open
  #38 alert. **(2) Paid X work is single-writer** via `src/lib/usage/x-lease.ts`: an atomic
  `provider_state` lease row `x_api_lease` (never the `x_api` watermark row) with owner/TTL/
  renewal/owner-checked-release/expiry-takeover; a poll finding it held makes zero paid calls
  (`lockSkips=1`). SQL covered by a new Neon-branch itest. **(3) Recovery driver**
  `scripts/x-gap-backfill.ts` (engine `src/lib/adapters/x-gap-backfill.ts`, 14 tests): exact
  since/until window, NO page ceiling, insert-before-checkpoint, resumable deterministic
  checkpoint `provider_state.x_gap_backfill:<key>` keyed to range+roster-hash+batch-size
  (mismatch refuses; complete rerun is a free no-op), SpendGuard + command budget cumulative
  across resumes, plan mode default. **(4) Rescore operator** `scripts/x-gap-rescore.ts` (gates
  `src/lib/analysis/gap-rescore.ts`): read-only default; `--apply` refused without a COMPLETE
  covering checkpoint + `--ack-workstreams-be`; drives DEPLOYED routes serially — map drain
  (`scripts/map-backfill.ts` gained bounded `--to`, importable `driveMapBackfill`), digest regen
  for exactly ru(mil+elite)/ua(mil)/ir(mil+elite+nuclear) with FORCE_REGEN never set (refusals
  reported per rulings 17/19), military-only validation with missing-ISW = pending; snapshots +
  result.md under `data/outbox/` (now actually in .gitignore — the directory map had claimed it).
  Dry runs against prod proved the scripts AND the gap: X docs 07-10/11/12 ≈ 31/18/27 vs ~5.4K
  (07-09) / ~3.7K (07-13). Tests 1321/107 → **1364/111**; typecheck/lint/build green. Standing
  #38/state text deliberately NOT closed/corrected — that waits for the authorized production
  run (cursor exhaustion + map + regen + validation + two healthy polls). Operator handoff:
  `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md` — **deploy main first**: the :20 poller
  must be the lease-aware insert-gated build before recovery, and the rescore's `--ack` attests
  the remediation (ruling-19 guard + canonical entity persist) is live.

- **2026-07-14 (X gap recovery EXECUTED — push, deploy, recovery, rescore, steady-state;
  closes the "NOT run" headers of the two entries above)** Operator authorized $50 X / $10 map
  / $10 reduce. Full account: runbook §Execution results + PROGRESS 2026-07-14. **Push+deploy:**
  the four X commits pushed (origin/main `a38a882`), gates green (1364/111 unit, 16/16 itest,
  typecheck/lint/build), deployed `dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ` (rollback
  `dpl_6ML79nJiEpNzASBszH6TNvLYaGvf`), anon smoke green. **Build proof:** scheduled 01:20Z poll
  (cron 977) emitted the new `counts.x_api` shape, all failure counters 0, watermark advanced,
  lease acquired+released. **Recovery:** funded balance read via `/oapi/my/info` was $35.32 —
  BELOW the $50 approval, so the command budget was set to $25 (authorization is a ceiling);
  actual spend **$3.9164** for 19/19 batches / 1,335 pages / 26,090 returned / **16,007
  inserted** (10,083 dupes, 0 unattributed); checkpoint complete; live watermark untouched;
  provider balance delta = ledger delta to $0.00003. Gap days 07-10/11/12: 31/18/27 → **4,559 /
  4,134 / 5,587** docs. **Rescore** (map $0.4963 actual of $10; reduce $0.2382 of $10; DNS pin
  required for the vercel.app route calls on this box): 28/30 digests regenerated through the
  deployed guard, 2 thin-regen refusals preserved priors (07-12 ru/elite + 07-12 ir/military,
  ruling 17); validation 15/15 scored, 0 pending — coverage mixed (12 re-scored cells mean
  42.3→33.9, extraction-noise scale) while unsupported/thin-sourced improved broadly (ir 07-11
  0.30→0.07, ru 07-12 0.36→0). **Ruling-19 verified live:** defect rows (event 4008, claims
  4413/4414) gone; regenerated Graham event carries deterministic "Sources claim:" title+summary;
  zero corruption-causation residue; the one surviving pre-guard Graham event (3919, in the
  refused cell) carries no allegation. **Workstream E verified live:** 43 rescore-created
  entities, 0 canonicalKey collisions with existing rows. **Steady-state + structural finding:**
  recovery spend tripped the $2.50 daily cap → polls budget-stopped SAFELY (cron 995: requests=0,
  budgetStops=1, watermark held — the non-lossy pause working). Operator then authorized a
  temporary `X_DAILY_USD_CAP=8` (deploy `dpl_7hLdoTZ6b3jmziNnP3G3pJKhaJxK`); the resumed 09:20Z
  poll exposed a REAL limit: after an ~8h park the fixed 5-page/batch ceiling truncated 6 dense
  batches (`pageTruncations=6`, incomplete, watermark held) and each hourly retry re-bills the
  backlog without converging. Remedy executed: bounded drain `[07-14T00:00Z..09:20Z]`
  (cursor-complete key `stall-drain-0714T00-0714T0920-b`, $0.4438 total across a 502-stopped
  first attempt + a fresh key after a minutes-scale roster-drift refusal — drift is real, resume
  promptly) + **operator watermark advance 1783992003→1784020800** (compare-and-set, lease free,
  justified by the completed drain; the poller's 30-min overlap guarantees continuity). Then two
  consecutive healthy scheduled polls: **cron 1141 (10:20Z, 47 req/399 docs) and 1149 (11:20Z,
  52 req/441 docs), all failure counters 0, watermark committing post-insert.** Cap restored to
  `2.50` readable-plain + redeployed (`dpl_33XREqVT41j9Fo3cbzzHSZjqYGk2`, health 200). Because
  the restored cap re-parks the watermark ~13h (today's ledger $4.73), one preventive drain
  `[07-14T11:00Z..07-15T00:00Z]` + advance to 1784073600 runs at the UTC reset so the 07-15
  polls don't re-stall; its evidence lands as a same-day addendum. New OPEN-TASKS #66 (ceiling
  vs park interaction — needs a reviewed code path, e.g. env-tunable ceiling or bounded
  self-catch-up). X spend this operation $4.66 all-in (of $50); OpenSanctions NOT run (still
  LAST, after entity cleanup #61).

- **2026-07-14 (scoring/quality-gauge audit; documentation only)** Corrected the standing
  scoreboard description and time/cutoff design after a read-only July 13 audit. That ROCA
  declared an **11:45 AM ET** cutoff and published at **7:30 PM ET**; neither 11:30 AM nor
  6:00 PM is safe as a fixed assumption. Current headline validation scores the latest
  finalized last-writer-wins digest against only the report's Key Takeaways, not an immutable
  cutoff/publication snapshot. `details.atPublish` is an evidence-ingest proxy, not proof of
  what an overwritten digest said. July 13 used the same five-item denominator for RU+UA;
  stored result RU 20% / UA 0%, while the combined current-version mapped corpus contained
  the core evidence for all five before cutoff — the dominant loss was final selection.
  Pre-launch rescoring is recorded as alpha process evaluation; recommended launch policy
  (immutable as-published series + separate retrospectives + visible system/outage epochs)
  remains product/design work, not shipped code. Full evidence and handoff boundary:
  `docs/reviews/SCORING-QUALITY-AUDIT-2026-07-14.md`. No code/DB/env/deploy changes.

- **2026-07-14 (validation scope + corpus-value audit; documentation only)** Corrected the
  stale map-stage total in Current state from ~19K to ~33K current-version atomic claims.
  The Russia country-page headline was traced to raw row count, not sources or summaries:
  46,343 live items at ~13:23Z, 32,607 canonical docs model-read, 17,459 docs with retained
  atomic claims, and 310 current final RU claims. Recommended one score per reference-report
  scope (combined RU+UA evidence for ROCA; scope-filtered regional evidence for Iran Update),
  while retaining country attribution. Product conclusion: ISW is a quality gauge; the core
  value is a traceable analyst evidence workbench. Evidence and proposed rulings:
  `docs/reviews/VALIDATION-SCOPE-AND-CORPUS-VALUE-2026-07-14.md`. No code/DB/env/provider/
  deploy changes.

- **2026-07-14 (OpenSanctions readiness recheck; documentation only)** X's implementation and
  historical recovery/rescore gates are complete, so the monthly-accounting/fixed-cutoff coding
  prompt may now be implemented with zero paid production calls. The paid rescore remains blocked
  on operator cleanup #61. Read-only live evidence at 13:20Z: 876 eligible entities, 540 live
  checked, 336 missing/stub-only, 343 matched, 122 sanctioned; refreshed cleanup dry run 876 ->
  683 (80 drops, 113 merges); July ledger 540/2,000 calls including the scheduled 120-call 08:00Z
  gap-fill today. Projected full post-cleanup rescore: 683 calls -> 1,223/2,000 before later cron
  activity; recount remains mandatory. Prompt, #41, #61, and the cleanup note corrected in place.
  No provider calls, DB mutations, env changes, code changes, or deploys.

- **2026-07-14 (OpenSanctions sequencing correction; documentation only)** Corrects the readiness
  entry immediately above: `9821bab` is an interim X closeout, not the operator's terminal gate.
  The active X run still owns a preventive drain + watermark advance at 00:05Z July 15, verification
  of the 00:20/01:20 polls, and its addendum/documentation commit+push. Per the operator's sequential
  ruling, do not start OpenSanctions implementation until those finish and main is clean/pushed.
  The paid rescore remains additionally blocked on cleanup #61 and separate spend authorization.
  Current counts and quota projection in the prior entry remain valid as a 13:20Z snapshot.

- **2026-07-14 (PostHog analytics phase 1 — review, merge, migration 0020, KEYLESS deploy;
  activation operator-blocked)** Branch `codex/posthog-product-analytics` (`ed61d3b`, worktree
  `bnow.net-posthog`, base = the evidence-trail merge `2403083` == then-origin/main) taken through
  the activation sequence of `docs/prompts/2026-07-14-posthog-product-analytics.md`.
  **Reconciliation:** remote branch unchanged; only branch anywhere holding migration slot 0020;
  prod `_migrations` head 0019; 9999 byte-identical, still last. **Independent adversarial
  re-review (read-only, full diff): PROCEED, no P0/P1** — its P2 confirmed deploy-before-migrate
  would strand every user at `/welcome/legal` (acceptance CTE reads `users.analytics_preference`),
  so the order was migrate-then-deploy; P3 notes (cross-device revocation latency, pending-import
  pageview drop, posthog-js option-name verification at activation, stale-tab preference replay,
  one stale comment) recorded in the note for the activation pass. **Gates re-run in the worktree:**
  typecheck, zero-warning lint, 1,455/129 unit, production build, 22/6 disposable-Neon integration
  (branch auto-deleted). **No secrets:** committed `phc_` strings are named test canaries, none
  equal Scenefiend's key; no `phx_` token exists in any authorized env file. **Merged** `--no-ff`
  → main `e5123a9`, pushed (pre-push green; primary checkout needed `npm install` for posthog-js
  1.399.5 first). **Migration 0020 applied to prod** (8 statements) and post-verified: 5 nullable
  `subscribe_intents` attribution columns; `users.analytics_preference` NOT NULL DEFAULT 'unset' +
  timestamptz + exact 3-value CHECK; 4/4 existing users 'unset'; 0 intent rows; head = 0020.
  **Deployed keyless** `dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6` (rollback: `dpl_33XREqVT…`) after
  reading back ZERO `POSTHOG` vars in any Vercel env; this deploy also shipped the evidence-trail
  feature (2403083 — verified: no schema/env/activation needs; first deploy containing it).
  **Prod browser proof (Chromium):** anon 5-page sweep AND a real magic-link signed-in session =
  0 PostHog requests, 0 console errors; the operator account landed on the forced Privacy 1.1
  re-acceptance screen with three UNCHECKED boxes incl. optional analytics; `/`, `/account`,
  `/ask` all bounce to `/welcome/legal` pre-acceptance; NOTHING was accepted (clickwrap is a
  human act) — post-test DB: 4/4 users 'unset', only the historical 1.0 acceptance row. Access
  attribution proven live (utm lowercased, landing_path forced, junk params ignored, no row
  written). Gated 307 / admin 404 / crons green on the new build. The magic link was recovered
  via the Postmark outbound-messages API (server token) because the Gmail MCP plaintext decode
  corrupts 2 chars at `token=` — reusable trap. **The currently deployed build IS the rollback
  state** (key absent, product fully functional). Not claimed done: dedicated project, region,
  key activation, positive Live Events, dashboard — operator sequence in OPEN-TASKS #67; the
  Account-page preference/sign-out controls are live-verifiable only after a human accepts 1.1
  (unit/component-tested meanwhile). X workstream untouched: no X env/code changed; its 00:05Z
  preventive drain + addendum still owns main's next expected commit alongside this one.

- **2026-07-14 (PostHog activation EXECUTED — dedicated project, key, Live Events, dashboard;
  closes the "operator-blocked" tail of the phase-1 entry above; #67 done)** The operator
  provided `.env.local` credentials mid-session (public key + `https://us.i.posthog.com` host —
  the **US region decision** — + a project-scoped personal API key + project id) and broadened
  the key's scopes twice on request (first `project/action/insight/dashboard:write`; a later
  `hog_function:write` ask was answered by decision instead). Verified the project is dedicated:
  **512327 "BNOW.NET"**, created by the operator 18:03Z, its `api_token` == the env key, key ≠
  Scenefiend's. **Privacy posture set via API and read back:** autocapture opt-out, console-log
  off, performance off, **anonymize_ips on** (live events store `$ip=None`); replay/dead-clicks
  already off; **GeoIP transformation kept ON by explicit operator decision** (city/postal-level
  `$geoip_*` derived at ingestion; privacy-notice wording follow-up noted). Membership/billing/
  retention are not readable with a project-scoped key → operator UI items. **Env+deploy:**
  key/host added to Vercel Production ONLY (readable-plain, byte-verified via env pull),
  keyed deploy `dpl_J5CoSceJSYMFirgbCVam4VUekXBW`. **Live verification found one real bug and
  one harness trap.** Bug: `identity.ts` `created_at::text` → `"2026-07-14 19:18:12+00"` fails
  the sanitizer's ISO `T` check, so **$identify was silently dropped** (unit test had mocked an
  ISO string — driver-realism class, same as the 07-12 rn-as-string bug); fixed via `to_char`,
  regression-pinned (1456 tests), commit `9e371dc`, originally deployed as
  `dpl_8xh5zXYfnsCwoFwQTM3resTZ2BSP` and still present in current production. Trap:
  **posthog-js bot-filters headless/webdriver browsers BEFORE
  `before_send`** — headless verification silently proves nothing; SDK-level bisection confirmed
  every config captures under a masked UA and none under the headless UA. **Positive proof
  (test account `go+phtest@vociferous.nyc`, opted in via the real 1.1 clickwrap checkbox, on
  https://bnow.net):** all 12 allowlisted event types captured on the wire AND confirmed
  ingested via HogQL, single distinct_id = internal UUID; total property-key set across every
  payload = exactly the allowlist (+token/distinct_id/environment/site_domain); `$identify`
  minimized (role + ISO signup_at + cohort; SDK referrer/UTM $set_once junk rebuilt away);
  pageviews template-only; **no email/@/query text (drone/missile/kursk absent)/LinkedIn/UTM/
  token/content IDs in any payload**; zero non-capture PostHog endpoints (flags/decide/array
  never contacted). Ask billed exactly once per submit (3 rows / 3 journey runs, ~$0.012 ea).
  **Negative proof:** anonymous keyed build 0 requests; a FULL granted journey on
  `bnow-net.vercel.app` = 0 captures (canonical-host gate live — doubling as the
  deployment-domain re-test); `/privacy` silent mid-session; cross-tab deny stopped both tabs;
  re-grant resumed; nothing captured after sign-out. **Dashboard:** `BNOW Private Beta` id
  1848415 with the nine specified insights (tiles verified, funnel computes) + Action
  `first_value_event` id 289102; alerts deliberately not created. Rollback stays
  config-only and is already proven (the keyless deploy earlier today). Residual operator
  items: billing limit + membership + retention record in the UI; consider re-narrowing the
  API key to read-only; GeoIP privacy-wording pass; accept 1.1 on their own accounts.

- **2026-07-15 (Postmark bnow.net sender cutover EXECUTED; DMARC DNS follow-up blocked on
  Cloudflare credentials)** The bnow.net domain was already present and authenticated in the
  Postmark account: the active production server token accepted a live send from
  `BNOW.NET <no-reply@bnow.net>`. Gmail raw-MIME proof showed `dkim=pass` for `d=bnow.net`
  selector `20260712183024pm`, `spf=pass` for `pm_bounces@pm-bounces.bnow.net`, and
  `Return-Path: <pm_bounces@pm-bounces.bnow.net>`; public DNS independently confirmed the DKIM
  TXT record and DNS-only Return-Path CNAME → `pm.mtasv.net`. Production `EMAIL_FROM` was
  updated to `BNOW.NET <no-reply@bnow.net>` and deploy `dpl_5KhaPA9AHwNq6htLJ2pAf8NFESNe`
  reached READY and aliased bnow.net. A fresh production magic link delivered with the same
  authentication results; its URL was a direct bnow.net Auth.js callback (no Postmark tracking
  rewrite), and consuming it created the expected signed-in session at
  `/welcome/legal?next=/`. Remaining gap: `_dmarc.bnow.net` returns NXDOMAIN, so Gmail cannot
  report DMARC pass. The local Cloudflare global key and bearer token are both expired; an
  operator must add `TXT _dmarc = v=DMARC1; p=none; adkim=r; aspf=r` (or provide a fresh
  DNS-edit token), then repeat one live magic-link header check.

- **2026-07-15 (Postmark DMARC completion EXECUTED; sender-domain migration fully closed)**
  The operator installed a new bnow.net-scoped Cloudflare account token (active through
  2026-08-14). Pre-mutation DNS was captured to `/tmp`; the existing Postmark DKIM TXT and
  DNS-only `pm-bounces` CNAME were left untouched. Added the sole missing record:
  `TXT _dmarc.bnow.net = v=DMARC1; p=none; adkim=r; aspf=r`; Cloudflare API success and Google
  public-DNS visibility were immediate. A fresh production magic link to `go@vociferous.nyc`
  provided received-message proof in Gmail: From = `BNOW.NET <no-reply@bnow.net>`, bnow.net
  DKIM pass, aligned custom-Return-Path SPF pass, **DMARC pass** (`p=NONE`), Return-Path =
  `pm_bounces@pm-bounces.bnow.net`. The delivered URL remained a direct bnow.net Auth.js
  callback with no Postmark tracking host; consuming it created the expected signed-in session
  at `/welcome/legal?next=/`. No application or Vercel env/deployment change was needed for the
  DNS-only completion.

- **2026-07-15 (pending-setup documentation cleanup; documentation only)** Rebuilt
  `docs/HUMAN-SETUP-TODO.md` as a pending-only queue, removing completed/no-action setup for
  X, Telegram MTProto, bnow.net/Postmark, Gemini, GDELT, and Firecrawl while retaining active
  account, licensing, procurement, legal, payment, analyst-process, and design-partner work.
  Removed resolved Product Brief, OpenAI-credit, Postmark/Resend, X-adapter, Telegram-session,
  and OpenSanctions-key entries from `docs/BLOCKERS.md`; retained the OpenSanctions commercial-
  rights gate and every genuinely active capability blocker. No code, env, provider, DNS, or
  deploy changes.
- **2026-07-14 (analyst-beta launch remediation — five workstreams IMPLEMENTED on a branch,
  NOT deployed, NOT merged)** Isolated worktree `bnow.net-analyst-beta-remediation`, branch
  `codex/analyst-beta-launch-remediation`, base `b71b39a` (main == origin/main at start). Zero
  paid provider calls; no migrations; no OpenSanctions/entity work. Three code commits
  (`9c7020a` email, `f7f9af9` privacy 1.2, `a873b7f` ask/scoreboard/i18n) + this docs commit.
  Operator decisions taken this session: **GeoIP retain+disclose · retention 7 years · prepare
  Privacy 1.2 (re-acknowledge)**. **WS1** Privacy 1.2 (`CURRENT_PRIVACY_VERSION` 1.1→1.2 +
  effective date 2026-07-15 placeholder) — both false "activation pending" statements removed;
  states analytics active only for opted-in/accepted/signed-in adults, dedicated US project,
  GeoIP-derived coarse city/postal from the connection IP at ingestion (raw IP not stored),
  7-year event retention; exclusions preserved. No migration (constant, not schema); every
  acceptance path already reads the constants so re-acknowledgement propagates; the two legal
  itests are version-agnostic (validated 9/9 on disposable Neon branch `br-restless-dew-at6uk521`,
  created+deleted). **WS2** `DEFAULT_FROM` → `BNOW.NET <no-reply@bnow.net>`; partner-domain
  fallback/comment/test removed — prod uses `POSTMARK_FROM_EMAIL` or fails visibly at Postmark,
  never a silent partner-domain BNOW login; token model untouched. **WS3** Ask working panel
  (role=status, aria-live=polite, honest client-elapsed stage copy, no fake %, question echoed,
  one-submit) replaces the tiny hint; provider/model string removed from the subscriber footer
  (kept in ask_usage/telemetry/server type). **WS4** scoreboard "At ISW publish" →
  "Evidence available at ISW publish (proxy)"; dropped "apples-to-apples" + "gap is what later
  ingestion added"; discloses it does not prove the claim was in the historical digest + RU/UA vs
  the same ROCA denominator; at-publish.ts comment corrected; no scores/matching/methodology
  changed. **WS5** es/he/ko (0% own catalog) hidden from the language picker via `selectorLocales()`
  (still valid/parseable → no 404s; removes the Korean tofu risk); de/fr/pl/ar/ja unchanged.
  Gate: typecheck+lint clean, **1460/129 unit**, build clean, **390px real-browser PASS**
  (privacy/terms/scoreboard + injected Ask panel with a long unbroken question, all
  scrollWidth==390). **NOT deployed/merged** (deploy gated behind the X closeout; standing
  "Current state" sections deliberately left describing live prod — still 1.1, scenefiend sender,
  old scoreboard copy, all languages — until the operator deploys). Full account + operator
  handoff: `docs/reviews/ANALYST-BETA-REMEDIATION-NOTE-2026-07-14.md`. Operator: confirm the 1.2
  effective date + deploy; verify bnow.net in Postmark (DKIM/Return-Path/dedicated token) +
  set `POSTMARK_FROM_EMAIL` + delivery check; flip `SIGNIN_MODE=invite` after the grandfather
  set; authenticated 390px smoke; PostHog billing-limit/membership record still open (#67).

- **2026-07-15 (analyst-beta remediation post-X rebase; documentation/environment only)**
  Confirmed `main == origin/main == f94d70c` and all three worktrees clean, then rebased
  `codex/analyst-beta-launch-remediation` onto the final X closeout. The sole conflict was
  `docs/PROGRESS.md` at two independent append points; both histories were retained in
  chronological order. Rebased commits: `3361b01` email, `29d89d2` Privacy 1.2,
  `dc23acc` Ask/scoreboard/i18n, `484f546` docs. No application content was edited during
  conflict resolution; no provider calls, environment changes, push, merge, or deployment.
  The pre-rebase green gate must be rerun and the combined diff reviewed. Privacy 1.2's
  `2026-07-15` remains a placeholder until the actual deploy date is known. Deployment stays
  blocked until `bnow.net` Postmark DKIM/custom Return-Path/sender verification is complete.

- **2026-07-15 (analyst-beta remediation MERGED + DEPLOYED; release loose ends reconciled)**
  Postmark/DKIM/SPF/DMARC and the final X closeout satisfied the two release gates. The pending
  setup cleanup was committed and pushed at `11896eb`; the remediation branch was rebased with
  both append-only histories preserved, then merged to `main` at `2bf89ed` and pushed. Fresh
  verification: typecheck + lint clean, 1460/129 unit tests green, optimized local and Vercel
  builds green, and the React review found no hooks/a11y/state/TypeScript defect. The prior scoped
  Neon integration gate remains green (9/9); a fresh full-suite attempt stopped before branch
  creation because the saved `NEON_API_KEY` returns 401, now an explicit operator credential
  task. Production deploy `dpl_EmHs6NneKtPA5RC9i4T3ybYSjLEx` is READY and aliased bnow.net;
  `/health` returned 200/DB OK on build `2bf89ed`, Privacy 1.2 + the corrected scoreboard copy are
  live, the selector exposes only en/uk/de/fr/pl/ar/ja, and the first runtime-error scan was empty.
  No migration or paid provider call occurred. OPEN-TASKS #68 closed; its remaining authenticated
  phone sweep stays separately tracked by #65, and the `SIGNIN_MODE=invite` flip remains an
  operator launch decision. OpenSanctions implementation is now unblocked by X but remains
  unimplemented; entity cleanup #61 and the paid rescore retain their explicit approval gates.

- **2026-07-15 (OpenSanctions monthly quota + resumable rescore — IMPLEMENTED on a branch,
  tested incl. real Postgres, NOT deployed, NOT merged, NO paid calls)** Prompt
  `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md`; branch
  `codex/opensanctions-monthly-rescore` off clean main `651259e` (tag
  `pre-opensanctions-monthly-20260715`). Two defects fixed in code only, zero production writes /
  paid calls / deploys / env changes. **(1) Calendar-month total accounting:** `SpendGuardConfig`
  gains `totalPeriod: "all_time" | "calendar_month"` (default all_time — X and every LLM guard
  stay byte-equivalent); calendar_month loads `totalUsd/totalRequests` only from
  `provider_usage.day >= monthStart` (first UTC day of the month, `monthStartIso`, tz-independent),
  never mutating history, per-day/per-run caps unchanged. `UsageStore.load` gained a
  `totalStartIso` window arg; `pgUsageStore` filters the total sums with a `FILTER (WHERE $3::date
  IS NULL OR day >= $3::date)`; `init(now)` injects the clock for deterministic tests.
  `ReserveResult` gained a machine `code` + `stopCategory()` so a stop is categorized (run/daily/
  monthly/total) without string-matching. Only `opensanctionsGuardFromEnv()` opts into
  calendar_month; `OPENSANCTIONS_CALL_CAP` is now the calendar-month request quota (env name kept
  for deployed-config compat). **(2) Fixed-cutoff resumable rescore:** `refresh=1` now REQUIRES a
  valid ISO `before` cutoff (`parseEnrichParams` → HTTP 400 before any paid loop; a per-invocation
  "now" recreated the repeat-selection bug). Rescore selects live rows whose `checkedAt` is
  strictly older than the fixed cutoff PLUS missing/stub/malformed rows; a CASE orders the
  jsonb→timestamptz cast BEHIND an ISO-prefix regex so a malformed legacy `checkedAt` is treated
  as needs-refresh and never aborts the batch. Each success stamps `checkedAt=now` (after the
  cutoff), so the SAME cutoff advances batch-by-batch. `limit` clamped to the run cap; priority
  ordering preserved; `only=sanctions` skips ownership. **Observability:** `cron_runs.counts.
  sanctions` gains `mode/cutoff/remaining/completed/stopReason` (non-sensitive; no key, header, or
  payload). **Operator tooling:** `scripts/opensanctions-rescore.ts` (dry-run default; serial;
  stops on daily/monthly/config budget, continues past a run-cap stop, never prints CRON_SECRET,
  no daily-cap busy-loop) + `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`. **Tests:** +24 unit
  (1460→1484 / 129→131) covering all 13 required cases pure where possible — guard month
  semantics, UTC boundary, monthly cap at 2000/1999, daily/run precedence, fail-closed, OS-monthly
  vs X-all-time wiring, param 400, builder shape, stub-sanitize — plus a new Neon integration test
  `enrich-rescore.itest.ts` proving the live SQL: normal selects only missing/stub, rescore selects
  stale/missing/malformed and EXCLUDES post-cutoff rows and ADVANCES on re-stamp, malformed cast
  never crashes (integration suite 22/6 → 26/7, run green on a disposable branch this session).
  typecheck/lint/`next build` clean. No migration (the daily `provider_usage` rows already carry
  the month window; trigger 9999 untouched). **Standing gates unchanged:** the paid production
  rescore stays CLOSED behind operator approval of cleanup #61 (applied after the canonical-persist
  fix is live), this branch merged+deployed, and a fresh recount + separate spend authorization.
  OPEN-TASKS #41 advanced, NOT closed (prod verification pending). Full account:
  `docs/reviews/OPENSANCTIONS-MONTHLY-RESCORE-NOTE.md`.

- **2026-07-15 (OpenSanctions rescore — cutoff-safety hardening; second commit on the same
  branch, still NOT deployed / NOT merged / no paid calls)** Review of the first commit found
  the `before` cutoff validation too loose. Fixes on `codex/opensanctions-monthly-rescore`:
  (1) **reject a future cutoff** — `normalizeIsoInstant(raw, nowIso?)` refuses a `before` later
  than the captured `nowIso`; a future cutoff kept freshly-checked rows (checkedAt=now < future
  cutoff) inside the `checkedAt < before` predicate and re-billed them. Accepting only
  `before <= nowIso` guarantees `before <= checkedAt`, so a successful row always leaves the
  predicate. (2) **require an explicit timezone** — the cutoff must carry `Z` or a `±HH:MM`/
  `±HHMM` offset (T separator); a timezone-less string is rejected because `Date.parse` would
  read it in the server's local zone and silently shift it. (3) **one captured instant** — the
  route captures `nowIso` ONCE and uses it for BOTH `parseEnrichParams` validation and the
  `enrichEntities` checkedAt stamp. (4) **boundary enforcement** — `enrichEntities` re-validates
  the cutoff against its `nowIso` and throws before opening any pool/loop, so a direct caller
  cannot bypass route validation. (5) **contract** — a sanctions refresh requires the cutoff; an
  ownership-only refresh (`only=ownership&refresh=1`) has none and needs no `before` (deliberately
  revised + tested; the Companies House ownership examples stay valid). (6) **script** —
  `scripts/opensanctions-rescore.ts` rejects a future/timezone-less `--before` before any call,
  requires a positive-integer `--max-batches`, and enforces `--sleep-ms >= 2000`. Tests +11
  (unit 1484→1495): future→400/throw, timezone-less→400/throw, valid Z + explicit-offset
  accepted, ownership-only refresh accepted without `before`, accepted cutoff `<= nowIso`, and a
  real-Postgres boundary case proving `checkedAt == cutoff` leaves the strict-`<` predicate
  (integration 26/7→27/7, run green on a disposable branch with `TMPDIR=/tmp`).
  typecheck/lint/`next build` clean. Operator docs corrected: SETUP-NEXT-WEEK.md (§7 status +
  smoke #6 + Companies House note), BLOCKERS.md (ownership example note), and the runbook's
  cutoff example (now a captured `now`, not a future date).

- **2026-07-15 (OpenSanctions monthly accounting + fixed-cutoff rescore MERGED + DEPLOYED;
  paid rescore still CLOSED)** Independent review of `e9c6695` found the cutoff blocker fixed and
  no further defect. Fresh gate: typecheck + lint + optimized build, 1495/131 unit tests, and
  27/7 real-Postgres integration tests on a disposable Neon branch (created/deleted) all green;
  the pre-push gate repeated typecheck/lint/unit green. Branch merged to main at `f9aaa9e`, pushed,
  and deployed as `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu` (READY, aliases include bnow.net). Zero-paid
  live proof on that deployment: `/health` 200 with the deployment id; authenticated future and
  timezone-less sanctions cutoffs both returned the new 400 before `withCronRun` / provider work;
  the July ledger remained 660 requests / $72.6000.
  No migration, environment change, entity cleanup, or paid OpenSanctions call. Standing status,
  OPEN-TASKS #41, setup notes, implementation note, and runbook corrected in place. #41 remains
  open: cleanup #61 approval+apply, fresh population/month-quota recount, separate spend approval,
  and the serial rescore-to-zero evidence are still required.

- **2026-07-15 (PostHog billing limit recorded)** The operator confirmed that the PostHog
  billing limit is configured. Corrected the standing integration status and OPEN-TASKS #67 in
  place; the remaining PostHog UI follow-up is project-membership review. No code, environment,
  analytics configuration, or deployment changed in this documentation sync.

## Conventions

- Commits: `area: imperative summary` (e.g. `isw: parse endnotes from new page layout`).
  Small and often; main must always build.
- Tests: Vitest; every parser/adapter gets fixture-based tests (`fixtures/`). `npm test`
  green before every deploy. Component tests opt into jsdom per-file
  (`@vitest-environment jsdom` docblock).
- Migrations: `npm run db:generate` → `npm run db:migrate` (additivity: ruling 5).
- Naming: snake_case DB, camelCase TS, kebab-case files.
- Scrapers: ≥2s per-host spacing, honor robots.txt, disk-cache every fetch (never fetch
  the same URL twice), custom UA `BNOWBot/0.1 (+https://bnow.net/bot)`.

## Credentials & integrations

| Service | Env var | Status | Where to get |
|---|---|---|---|
| Neon Postgres | `DATABASE_URL`, `NEON_API_KEY` | **database live; saved branch-admin API key WORKS (re-verified 2026-07-15: disposable integration branches create/run/delete cleanly)** | console.neon.tech |
| Vercel deploy | CLI session (`VERCEL_TOKEN` expired) | **live (CLI)** | vercel.com/account/tokens |
| OpenAI (analysis + ask v2 + embeddings) | `OPENAI_API_KEY` + caps (ruling 4) | **live, spend-guarded** (openai_ask / openai_embed meter separately) | platform.openai.com |
| LLM kill-switch | `LLM_DISABLE=1` | refuses every LLM call site (ruling 9) | (env only) |
| Anthropic | `ANTHROPIC_API_KEY` | provider implemented; key absent | console.anthropic.com |
| Postmark (auth email) | `POSTMARK_SERVER_TOKEN` + `POSTMARK_MESSAGE_STREAM` + `EMAIL_FROM` | **live on bnow.net** (`BNOW.NET <no-reply@bnow.net>`; DKIM/SPF/DMARC/custom Return-Path + callback live-verified 2026-07-15) | postmarkapp.com |
| Cron auth | `CRON_SECRET` | **live** | (already set) |
| Auth.js | `AUTH_SECRET` | **live** (hashes magic-link tokens: rotating it invalidates every unclicked link) | (already set) |
| X via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live, gap-recovered** (`$75` sprint / `$2.50` daily; Jul 9–13 recovered cursor-complete 2026-07-14; watermark-park >4–8h needs a drain+advance, #66; empty-run monitor remains #38) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + caps | **live gap-fill; monthly accounting + fixed-cutoff rescore deployed** (`f9aaa9e`, `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`; 937 eligible / 660 live checked; July ledger still 660 calls / $72.6000 after zero-paid rollout verification; cleanup #61 + paid rescore remain approval-gated) | opensanctions.org |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` + `TELEGRAM_SESSION` (all in prod env) | **live** (session added 2026-07-11; first fetch + repeated hourly runs verified; registry top-120 ROCA roster) | my.telegram.org |
| PostHog (product analytics) | `NEXT_PUBLIC_POSTHOG_KEY` + `_HOST` (Production only) + `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID` (.env.local, ops) | **LIVE opt-in-only** (US project 512327 "BNOW.NET"; rollback = remove key + redeploy; billing limit configured 2026-07-15; project-membership review remains) | us.posthog.com |
| ACLED | `ACLED_API_KEY`, `ACLED_EMAIL` | stubbed | acleddata.com |
| Stripe | `STRIPE_SECRET_KEY`, … | flagged off | dashboard.stripe.com |
| Resend | `RESEND_API_KEY` | superseded by Postmark | resend.com |

## Next steps / open questions

1. **Operator:** `docs/SETUP-NEXT-WEEK.md` top-to-bottom — VERCEL_TOKEN regen and Stripe.
   bnow.net attach, Postmark sender cutover + DMARC, and MTProto are done.
   (OpenAI credits: done 2026-07-05; keep the billing alert.)
2. **DIGEST_ENGINE=mapreduce is LIVE in prod (flipped 2026-07-09).** Watch the
   scoreboard for a week — especially ua (−3.6 pts in the A/B, noise-scale) — plus
   `provider_usage.openai_reduce` (expect ≈ $0.10–0.30/day against
   `REDUCE_USD_CAP_DAILY=2`) and `cron_runs` jobs `digest:finalize`/`digest:intraday`.
   Rollback = remove the Vercel prod env var (or set `legacy`) + redeploy. Then: gulf
   theaters onto the map worker, the #33 remap path, per-country mix policy.
3. Debt & risks: `docs/OPEN-TASKS.md` (prioritized); key-blocked items: `docs/BLOCKERS.md`;
   Russia depth build order: `docs/RUSSIA-DATA-ROADMAP.md` §5.

## Operating protocol

1. Plan next ≤2h block as numbered list appended to `docs/PROGRESS.md` (timestamped).
2. Build + test (fixture-based for every parser/adapter).
3. Self-review the diff adversarially: edge cases, rate-limit safety, secret leakage,
   schema invariants (claim-to-source above all).
4. Commit; deploy if main is green.
5. Update AGENTS.md — correct standing sections in place, append to the decision log —
   and `docs/PROGRESS.md`.
6. Replan freely when reality disagrees with the plan. Untouchables: the four scope
   pillars (ingest, registry, digest, ISW validation) and Standing rulings 1–5
   (legal, traceability, truth-in-UI, fail-closed SpendGuard caps, migration
   additivity). Every deviation → decision log.
7. End of each stage/sprint: write `docs/reviews/<NAME>.md` (built, test results,
   exit-criteria pass/fail with numbers, decisions, debt, risks, replan).
