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

Stack: Next.js 15 App Router (TS strict) on Vercel · Neon Postgres + pgvector · Drizzle ORM ·
Tailwind + shadcn/ui · Auth.js (magic link) · Vitest. LLM behind `AnalysisProvider`
(`openai` live, `stub` deterministic fallback; no Anthropic key yet).

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
- Stubbed: MTProto, X, ACLED (fixtures); Stripe flagged off; OpenSanctions + zakupki
  need key/proxy (BLOCKERS 2026-07-06); Resend superseded by Postmark.
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
| X API | `X_BEARER_TOKEN` | stubbed | developer.x.com |
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
