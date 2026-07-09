# AGENTS.md — persistent brain of BNOW.NET

Read this first in every fresh session. Keep it under ~300 lines; details live in `docs/`.

## Project charter

BNOW.NET is a subscription OSINT data-intelligence product: per-country conflict-monitoring
feeds (open news + Telegram + X), **transparent source-reliability ratings** derived from
ISW's own citation/hedging behavior, an automated daily digest, and a public validation
scoreboard that scores our digests against ISW's daily Russian Offensive Campaign
Assessments. Paying users: analysts, risk teams, journalists, desks ($400–$4K/mo tiers).
Launch theater: **Russia + Ukraine live**; Israel/Iran/Gulf scaffolded config-only; China
deferred. Authoritative spec: `docs/PRODUCT-BRIEF.md` (original, installed 2026-07-06).

## Architecture

Stack: Next.js 16 App Router (TS strict) on Vercel · Neon Postgres + pgvector · Drizzle ORM ·
Tailwind v4 · Auth.js (magic link, `session.strategy='database'`) · Vitest (node; jsdom +
@testing-library per-file for component tests). LLM behind `AnalysisProvider` (`openai` live,
`stub` deterministic fallback; no Anthropic key yet).
**No shadcn/ui and no Radix** — despite what earlier revisions of this line said. The UI deps are
clsx + tailwind-merge + lucide-react; interactive primitives (e.g. `src/components/nav-dropdown.tsx`)
are hand-rolled to the WAI-ARIA patterns. There is no `src/components/ui/`, no `components.json`.

```
 ISW archive ──crawl──> raw HTML cache (disk, internal-only)
                             │ parse endnotes + hedging
                             ▼
                      source_citations ──materialize──> sources (registry)
                                                            │ seeds channels + weights
 RSS/TASS/Meduza/... ─┐                                     ▼
 GDELT 15-min slices ─┼─ SourceAdapter.fetchLatest() ─> raw_documents ─┐
 t.me/s/ web preview ─┤      (cron /api/cron/ingest)    (hash-deduped) │
 X, ACLED, MTProto ───┘ (stubbed)                                      ▼
                                        normalize → near-dupe → claims/events
                                        (claim ⇄ raw_documents join = traceability,
                                         enforced: claim INSERT requires source link)
                                                            │
                                                            ▼
                        digests (daily, per country) ──> validation_runs (vs ISW same-day:
                                                          coverage, divergence, timeliness,
                                                          unsupported-claim rate)
 Product surface: landing / country feeds / registry explorer / scoreboard / auth / pricing
```

Directory map (update as it changes):

```
src/app/            routes (public pages, /admin/*, /api/cron/*, /api/*)
src/db/             drizzle schema, client, migrations in drizzle/
src/lib/adapters/   SourceAdapter impls (rss, gdelt, telegram-web, telegram-mtproto.stub, x.stub, acled.stub)
src/lib/analysis/   AnalysisProvider (openai, stub), digest generator, claim extraction
src/lib/isw/        crawler, endnote parser, hedging classifier, registry materializer, validator
scripts/            local runners: backfills, seed, digest, validate (idempotent + resumable)
fixtures/           saved HTML/JSON for tests
docs/               brief, progress, blockers, reviews/, feasibility, setup-next-week
data/               gitignored: cache/ (fetched pages), outbox/ (rendered emails)
```

## Current state (update every commit batch)

- **2026-07-04 evening — Stages 0–5 PASS** (reviews in docs/reviews/). Stage 6 wrap-up.
- Works (all live at https://bnow-net.vercel.app):
  - Registry: 6,985 ISW-derived sources / 251K citations / 1,565 reports (97.65% parse).
  - Ingestion: 8 RSS + 25 telegram channels (registry-selected), ~6.5K docs, crons
    */15 + hourly registered and firing. GDELT wired but upstream-flaky (blocker #10).
  - Digests: daily cron 21:30 UTC; all 30 backtest digests are LLM-generated
    (gpt-4o-mini) — OpenAI recharged 2026-07-05, stub override removed.
  - Validation: 30 runs, ALL scored with LLM semantic matching (keyword gazetteer
    is the no-key fallback). Avg coverage 17.5%, nonzero-day avg 31%, best day 100%,
    median info-lead +14.7h. ISW report auto-discovery by slug pattern proven live
    (picked up the July 4 report the moment it published). Daily cron 07:00 UTC.
  - Surface: landing / countries / pricing+intents / magic-link auth / email-outbox.
- Next-phase (2026-07-06): critical-materials choke-point tracker (/critical-materials,
  US import concentration via Comtrade — China 68% rare earths etc.), in-app AI
  interrogation (/ask, cited answers), ISW Middle East registry (/middle-east, Iran
  Update theater='ir' — 1423 sources incl Hamas/PIJ/Hezbollah non-state actors),
  i18n scaffolding (en+uk, 9 locales declared, /api/locale switcher).
- Analytics (2026-07-06): mirror-trade evasion watch (/trade, UN Comtrade), buyer
  profiles (frontline/sanctioning/commodity/compliance switcher on digests), Iran
  depth (nuclear+elite tracks, fa/ar, Iran-Update-validated scoreboard), analyst
  signals (/signals: purge/data-dark/trade flags), ownership graph (entity_links).
- Russia depth (2026-07-05/06): elite-politics track + entity graph (OpenSanctions-
  badged), regional/ethnic-republic + semi-official sources, data-dark tracker
  (/datadark), procurement watcher (wired, zakupki blocked). Postmark email LIVE;
  auth gate ON (digests/registry/entities). Gulf wave: ru ua ir sa ae qa om active.
- Hardening pass (2026-07-06/07): original brief authoritative; stub data unreachable
  on all user surfaces (3-layer defense + integration test); digest cron split
  core/gulf; CI + pre-push gate + Neon-branch integration tests; /ask capped
  (20/user/day, $1/day global, usage logged); entities 293→~97 clean; per-theater
  validation filtering; Iran military theater prompt (coverage off 0%);
  /ask reliability-ordered; source_theater_stats (ME zombies 0); Anthropic provider
  in the seam. Reviews: docs/reviews/{AUDIT,TASK-1,TASK-2,TASK-3}-*.md.
  Operator handoff: SETUP-NEXT-WEEK.md (rewritten); summary: STATUS-REPORT.md.
- Coverage & compliance sprint (2026-07-07 evening): X LIVE via api.twitterapi.io
  (x_api adapter, 383 ISW-cited accounts, hourly cron, 7-day backfill ~10.5k tweets,
  ~$1.7 of $5 cap); majority-vote validation matcher (26/27 reproducible); OpenSanctions
  LIVE (200 checked, 54 sanctioned, ≤300-call budget); sa+il feeds revived (arabnews
  RSS was frozen upstream — root cause of "sa dark"); bh/kw honestly scaffolded.
  Results: docs/reviews/COVERAGE-SPRINT-RESULTS.md.
- i18n (2026-07-08, worktree `bnow.net-i18n`, branch `codex/i18n-de-ar-ja-pl-fr`):
  authoritative `LOCALE_REGISTRY` (code/label/native/dir/order/fallback); de/ar/ja/pl/fr
  catalogs added (ar RTL) atop en/uk; `resolveLocale` priority = selector>cookie>
  Accept-Language>en; `/api/locale` open-redirect-guarded; landing page + LanguageSelector
  wired, other surfaces catalog-ready but not yet JSX-wired; evidence/ISW/source names never
  translated. Needs native-speaker sign-off before launch. See docs/PROGRESS.md 2026-07-08.
- Nav & logged-in home (2026-07-09): one session-aware `SiteHeader` in the root layout on every
  public page (`/admin` opts out); flat module names regrouped by buyer journey —
  `Product | Coverage | Validation | Solutions | Pricing | auth | language`. **Zero route
  changes**; a test walks `src/app/**/page.tsx` to prove no dead links. Dropdowns hand-rolled to
  the WAI-ARIA menu-button pattern (no Radix/shadcn in this repo). 10 inline language links →
  one globe dropdown. Signed-in `/` drops the subscriber CTA for digest/scoreboard/coverage
  actions. First React component tests in the repo (jsdom + @testing-library, opted in per file).
  312 tests (was 245). Adversarial review of the diff found 3 real defects (menu re-opening
  on back-nav; English-only nav landmark; a vacuous focus test) — all fixed.
  Review: docs/reviews/NAV-RESTRUCTURE-REVIEW.md.
- Stubbed: MTProto, ACLED (fixtures — NOT wired into prod ingest); the "x" fixture stub
  remains for tests but the live adapter is x_api; Stripe flagged off; zakupki needs
  proxy (BLOCKERS 2026-07-06); Resend superseded by Postmark (still on scenefiend
  domain — migration in SETUP-NEXT-WEEK).
- Deploys: `npx vercel@latest deploy --prod --yes` (CLI 46 too old; machine session
  auth — env VERCEL_TOKEN expired). Deployment URLs SSO-walled; use project domain.
- Local-host quirks: api.openai.com and api.gdeltproject.org TCP-unreachable from this
  WSL2 box — LLM work must run via Vercel routes.

## Decision log (append-only, dated)

- **2026-07-04** Original product brief absent from machine → reconstructed from execution
  prompt; marked as such. (Blocker #1.)
- **2026-07-04** VERCEL_TOKEN in scenefiend env is expired (403). Use machine's logged-in
  Vercel CLI session for weekend deploys; token regen goes in SETUP-NEXT-WEEK.
- **2026-07-04** No Anthropic key; OPENAI_API_KEY present → `AnalysisProvider` ships with
  `openai` implementation live (≤$25 cap) + deterministic `stub`. Interface unchanged if/when
  Anthropic key arrives.
- **2026-07-04** Postmark creds exist (scenefiend's) but NOT borrowed — bnow email goes
  through a Resend-shaped adapter stubbed to file output. Avoids cross-product sender-domain
  mess.
- **2026-07-04** ISW site redesigned vs prompt's assumption: reports live at
  `/research/russia-ukraine/russian-offensive-campaign-assessment-<month>-<day>-<year>/`.
  Crawler targets new structure; criticalthreats.org stays the fallback.
- **2026-07-04** Per repo-root CLAUDE.md: no vendor branding in commits/files; no
  deletes/renames outside this repo; small, test-covered diffs.
- **2026-07-04** TASS/RIA/Lenta RSS TCP-unreachable from host → their content enters
  via their official telegram channels (tass_agency, rian_ru).
- **2026-07-04** OpenAI quota died after one successful prod digest → stub provider
  (deterministic extractive) as designed; ANALYSIS_PROVIDER=stub in prod env.
- **2026-07-04** ISW "Key Takeaways" stored as keyword signatures only (toponyms +
  action classes + char count) — no prose in DB, satisfying §8.6 while enabling matching.
- **2026-07-04** Unhedged ISW declaratives stay hedging='unknown' (mid-trust 0.5) —
  forcing them into the 4 classes would corrupt the reliability signal.
- **2026-07-04** Matching is trilingual keyword-based (gazetteer + oblast→town
  expansion), NOT LLM — deterministic, testable; LLM upgrade slots into same seam.
- **2026-07-04** Vercel account supports frequent crons (*/15 registered fine) — no
  local scheduler needed; everything steady-state runs serverless.
- **2026-07-04** RU/UA digest corpora are strictly per-theater (rd.country_iso2 = X);
  uk-language telegram posts auto-tag ua (registry lacks per-source country, debt).
- **2026-07-05** OpenAI recharged → stub override removed; 30 digests regenerated via
  Vercel route (local OpenAI egress still blocked). LLM semantic matching added for
  validation: ISW takeaway texts enter the prompt transiently, only verdicts persist
  (§8.6 holds); keyword matcher remains as fallback; details.matcher records which ran.
- **2026-07-05** Validate flow auto-discovers new ISW reports from the predictable
  slug (…-assessment-<month>-<day>-<year>) — corpus updates no longer need local runs.
- **2026-07-05** Elite-politics track added (Gregory's request): digests.track dimension,
  entities/claim_entities graph, lexicon prefilter + Kremlinology prompt. Unvalidated by
  design (ISW out of scope); factional interpretations always hedging='assessed'.
  Kommersant RSS + t.me/vchkogpu unreachable (blocked / preview off) — degrade cleanly.
- **2026-07-06** Original product brief installed as `docs/PRODUCT-BRIEF.md`, replacing the
  2026-07-04 reconstruction (delete explicitly instructed by Gregory's hardening prompt;
  scoped exception to the no-delete default). Diff findings — nothing built CONTRADICTS the
  original, but the reconstruction under-specified it in four material ways:
  (1) §8.7 Phase 2/3 targets were missing: event coverage ≥80% of ISW events same-day
  (actual: 17.5% avg / 31% nonzero-day), unsupported-claim rate <2%, timeliness ±6h,
  10 design partners + 1 gov pilot. Now tracked in OPEN-TASKS #11.
  (2) §6.5 pricing is crisis-cycle + REGIONAL-BUNDLE SKUs (sell "Gulf" not per-country;
  à-la-carte country ≈40% of bundle; global $10–15K/mo; standby $300–500; NO surge
  pricing). Implemented per-country tiers ($400/$2–4K) sit inside the ranges, but the
  bundle packaging layer is absent. OPEN-TASKS #12.
  (3) §8.6 risk list includes sanctions-exposure counsel review for handling RU
  state-media content — operator action, added to SETUP-NEXT-WEEK. OPEN-TASKS #13.
  (4) §5 scoring dimensions include source-reliability CALIBRATION (does our weighting
  match ISW hedging?) — not currently a scored validation dimension. Ties into the
  reliability-weighting audit (OPEN-TASKS #6).
  China placement: original Tier 1 lists China as second flagship, but its §8.4 build
  plan recommends Gulf as region #2 — our China deferral follows the build plan; no
  contradiction. Phase 0 exits (≥2,000 sources, >90% parse) exceeded: 6,985 / 97.65%.
- **2026-07-06** Truth-in-UI hardening: stub/fixture data may never persist or render as
  fact. Stub enrichment persists only sanitized `{matched:false, stub:true}`; stub
  ownership edges never written; stub adapters unwired from production ingest; digest
  corpus excludes `[STUB FIXTURE]%` at query level; entity/ask surfaces null out stub
  fields. Prod purged (2 fabricated-source claims, 4 stub docs, 148 stub enrich records,
  5 stub edges). Policy: HIDE stub data entirely rather than demo-label it.
- **2026-07-06** Digest cron split into ?group=core (ru+ua, :30) and ?group=gulf (rest,
  :50): serial matrix measured ~6 min (RU military digest alone 3m40s under TPM
  throttle); killed runs silently dropped last-sorting theaters. Audit:
  docs/reviews/AUDIT-2026-07-06.md.
- **2026-07-06** CI: .github/workflows/ci.yml (typecheck+lint+test) activates on first
  push; GitHub unreachable from this box, so the enforced local gate is
  .githooks/pre-push via `git config core.hooksPath .githooks` (run once per clone).
- **2026-07-06** /ask capped: ask_usage table logs every question (billing-ready);
  ASK_USER_DAILY_LIMIT (20/day) + ASK_GLOBAL_DAILY_BUDGET_USD ($1/day) enforced in
  askWithLimits() wrapping both the page and the API route.
- **2026-07-06** Entity graph canonicalized 293 → 85: deterministic rules pass
  (geography/collectives/objects dropped; alias clusters merged with claim/link
  repointing) + LLM propose-only audit route (/api/cron/entity-audit) with human
  review before apply (docs/reviews/ENTITY-AUDIT-2026-07-06.jsonl). ENTITY_RULES
  block added to all extraction prompts. Policy: LLM proposals are never auto-applied.
- **2026-07-07** Integration tests run on disposable Neon branches (fork prod, test,
  delete — scripts/test-integration.sh); *.itest.ts excluded from the unit suite.
- **2026-07-07** RU/UA validation filters ISW takeaways per theater
  (classifyTakeawayTheater). Measured effect small (~0.5 takeaways/report filtered);
  the dominant coverage noise is gpt-4o-mini matcher nondeterminism even at temp 0
  (±30pts/day on unchanged digests) → OPEN-TASKS #15 (majority-vote matching).
- **2026-07-07** Iran military runs a theater prompt + lexicon
  (TrackConfig.lexiconByCountry/systemPromptByCountry); "quiet days are normal" is
  explicit in the prompt. Iran coverage off 0%: 33.3/25% on 2 of 4 scored days.
- **2026-07-07** Reliability weighting: digest event ranking confirmed wired
  (confidence = mean source reliability); /ask retrieval now orders by confidence
  within a day (was recency-only — state-media claims could lead the evidence set).
- **2026-07-07** registry-materialize is theater-aware: source_theater_stats (ru/ir)
  + global all-theater aggregates on sources; ME zombie rows 1,574 → 0.
- **2026-07-07 (sprint)** Paid-provider budget architecture: provider_usage +
  provider_state tables (migration 0008) + SpendGuard (src/lib/usage/spend-guard.ts).
  Every paid call passes tryReserve() first; FAIL-CLOSED when the provider's total-cap
  env is unset (X_SPRINT_USD_CAP / LLM_SPRINT_USD_CAP / OPENSANCTIONS_CALL_CAP). Caps:
  total USD or total calls, daily USD, daily+per-run requests — all env-tunable.
- **2026-07-07 (sprint)** Live X adapter is `x_api` (api.twitterapi.io), NOT the "x"
  fixture stub name — audit tooling treats adapter='x' rows as stub contamination.
  Steady-state polling uses advanced_search batched `from:` OR-queries since a
  persisted watermark (pay only new tweets + $0.00015/request minimums); last_tweets
  (newest ~20, all billed) reserved for backfill. Own cron group (?which=x, hourly
  :20), excluded from "all" so casual local ingest can't spend. 383 ISW-cited accounts
  (last 90d), dominant-theater tagged; uk-language tweets re-tag ua (telegram-web
  convention).
- **2026-07-07 (sprint)** Majority-vote validation matching (OPEN-TASKS #15): k=5
  gpt-4o-mini rounds, takeaway↔claim match requires strict majority on the SAME claim;
  per-vote audit trail in details.votes; matcher records llm-majority|llm|keyword.
  Measured: 26/27 country-day results identical across 3 full reruns (was ±30pts
  single-shot); worst case one marginal takeaway (16.7pts on a 6-takeaway day).
  MATCHER_MODE=single is the fallback flag.
- **2026-07-07 (sprint)** OpenSanctions live: 200 entities enriched day-one under
  OPENSANCTIONS_CALL_CAP=300 (121 matched, 54 sanctioned; daily-cap guard stopped run 2
  at exactly 200 — by design). Priority: pressure-signal entities > persons > companies.
  Stub-checked rows count as unchecked (live key upgrades them). Spot-check 4/5 correct;
  1 name-collision flagged → matches are name-based, badges are beta-only until
  commercial licensing (HUMAN-SETUP-TODO hard gate).
- **2026-07-07 (sprint)** sa was never bot-walled: arabnews.com RSS froze upstream
  2026-04-25 (still 200/valid XML). sa → Saudi Gazette + Asharq Al-Awsat EN; il revived
  (JPost + Ynet, flipped active); bh/kw stay scaffolded (no working feed found).
- **2026-07-07 (sprint)** Citation-weighted parity after X adapter: ru 62.5%→74.2%,
  ir 35.9%→57.5% (scripts/source-parity.ts; the moving baseline vs the logged 51% is
  telegram roster growth since 07-05).
- **2026-07-09 (nav)** Server-side session read in the shared header, because `next build`
  already reported ALL 33 routes as `ƒ` dynamic — there was no static/ISR output to sacrifice,
  so the client-island alternative would have bought a hydration swap for nothing. Route table
  diffed byte-identical before/after. `currentUserEmail()` (src/lib/session.ts) wraps `auth()` in
  React `cache()` (the layout, the page and any gate layout would each fire a separate
  `strategy:"database"` session query) **and** a try/catch: there is no `error.tsx` anywhere, so a
  layout-level throw would 500 the whole site. Chrome degrades to signed-out; `requireUser()` is
  untouched and stays fail-closed.
- **2026-07-09 (nav)** Solutions labels corrected against page content, over the brief's sketch:
  `/datadark` is the **Data-dark tracker** (Russia has classified 400+ statistical series; the
  suppression is the signal) — it is NOT sanctions compliance, and labelling it so would have been
  a false product claim. `/trade` is the mirror-trade & evasion watch and takes the sanctions
  label. `critical-materials` is import-concentration/choke-points, not price risk. Final:
  Sanctions & trade evasion→/trade, Commodity & supply-chain risk→/critical-materials, Economic
  data suppression→/datadark, Political risk & signals→/signals.
- **2026-07-09 (nav)** Coverage links to `/countries#<iso2>`, not to theater pages: **there are no
  per-theater pages** — the per-theater surface is the digest, which sits behind
  FEATURE_AUTH_GATE. Pointing a top-of-funnel nav item at a sign-in wall defeats the restructure.
  Digest deep links live on the signed-in homepage, where the gate is already satisfied. Also
  keeps zero DB queries in the header.
- **2026-07-09 (nav)** Nav promotes only ru/ua/ir although `countries.status='active'` holds eight
  rows: il/sa/ae/om/qa carry 2–5 digests vs 27/20/19. Consistent with the standing `home.live`
  copy; promoting a 2-digest theater would overstate coverage depth (truth-in-UI policy).
- **2026-07-09 (nav)** Locale links stay plain `<a href="/api/locale?set=xx">` with **no `?to=`**.
  The route prefers an explicit `?to=` over the Referer, so threading `?to={usePathname()}` would
  silently drop `?profile=` on digest pages. Verified live: Referer round-trips path AND query.
- **2026-07-09 (nav)** es/he/ko keep the English per-key fallback rather than receiving nav-only
  catalogs — half-translated chrome is worse than uniform fallback. OPEN-TASKS #21. The existing
  i18n suite does NOT guard translation completeness (English fallback satisfies it); the new
  header test does, for header keys.

## Conventions

- Commits: `area: imperative summary` (e.g. `isw: parse endnotes from new page layout`).
  Small and often; main must always build. No vendor branding in commit messages.
- Tests: Vitest; every parser/adapter gets fixture-based tests (`fixtures/`). `npm test`
  green before every deploy.
- Migrations: drizzle-kit generate; never edit an applied migration; additive evolution.
- Naming: snake_case DB, camelCase TS, kebab-case files.
- Scrapers: ≥2s per-host spacing, honor robots.txt, disk-cache every fetch (never fetch the
  same URL twice), custom UA `BNOWBot/0.1 (+https://bnow.net/bot)`.
- Legal invariant: **no ISW prose or source full-text in any user-facing output** — only
  URLs, classifications, counts, scores.
- Schema invariant: **claims cannot exist without ≥1 raw_document link** (FK + app-layer
  transaction; enforced in tests).

## Credentials & integrations

| Service | Env var | Status | Where to get |
|---|---|---|---|
| Neon Postgres | `DATABASE_URL`, `NEON_API_KEY` | **live** | console.neon.tech |
| Vercel deploy | CLI session (`VERCEL_TOKEN` expired) | **live (CLI)** | vercel.com/account/tokens |
| OpenAI (analysis) | `OPENAI_API_KEY` | **live, ≤$25** | platform.openai.com |
| Anthropic | `ANTHROPIC_API_KEY` | absent | console.anthropic.com |
| Cron auth | `CRON_SECRET` | **live** | (already set) |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` | stubbed | my.telegram.org |
| X/Twitter via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live** (x_api, spend-guarded) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + `OPENSANCTIONS_CALL_CAP` | **live** (≤300 calls, licensing gate) | opensanctions.org |
| ACLED | `ACLED_API_KEY`, `ACLED_EMAIL` | stubbed | acleddata.com |
| Stripe | `STRIPE_SECRET_KEY`, … | flagged off | dashboard.stripe.com |
| Resend | `RESEND_API_KEY` | stubbed→file | resend.com |

## Next steps / open questions

1. **Monday (Gregory):** work docs/SETUP-NEXT-WEEK.md top-to-bottom — LLM credits/key
   first (biggest quality unlock), then DNS, then MTProto/Resend/Stripe.
2. Russia depth build order: docs/RUSSIA-DATA-ROADMAP.md §5 — next up:
  OpenSanctions→entity-graph link, zakupki.gov.ru procurement watcher, data-dark
  tracker, kremlin.ru attendance matrix, decree-gap counter.
3. Stage 7 candidates (any future session): anthropic provider impl; year-inference
  for 37 unparsed ISW pages; per-source country column; scoreboard trend charts;
  GDELT raw-file fallback.
4. ~~Open: original brief still needs to replace docs/PRODUCT-BRIEF.md~~ Done 2026-07-06.

## Operating protocol

1. Plan next ≤2h block as numbered list appended to `docs/PROGRESS.md` (timestamped).
2. Build + test (fixture-based for every parser/adapter).
3. Self-review the diff adversarially: edge cases, rate-limit safety, secret leakage, schema
   invariants (claim-to-source above all).
4. Commit; deploy if main is green.
5. Update AGENTS.md (current state, decision log) + PROGRESS.md.
6. Replan freely when reality disagrees with the plan. Untouchables: the four scope pillars
   (ingest, registry, digest, ISW validation), traceability invariant, legal guardrails,
   budget caps ($25 LLM), and a deployed app by Sunday night. Every deviation → decision log.
7. End of each stage: write `docs/reviews/STAGE-N-REVIEW.md` (built, test results,
   exit-criteria pass/fail with numbers, decisions, debt, risks, replan).
