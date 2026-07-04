# AGENTS.md — persistent brain of BNOW.NET

Read this first in every fresh session. Keep it under ~300 lines; details live in `docs/`.

## Project charter

BNOW.NET is a subscription OSINT data-intelligence product: per-country conflict-monitoring
feeds (open news + Telegram + X), **transparent source-reliability ratings** derived from
ISW's own citation/hedging behavior, an automated daily digest, and a public validation
scoreboard that scores our digests against ISW's daily Russian Offensive Campaign
Assessments. Paying users: analysts, risk teams, journalists, desks ($400–$4K/mo tiers).
Launch theater: **Russia + Ukraine live**; Israel/Iran/Gulf scaffolded config-only; China
deferred. Authoritative spec: `docs/PRODUCT-BRIEF.md` (reconstructed — see BLOCKERS #1).

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

- **2026-07-04 12:55**: Foundation docs written. Nothing built yet. No deploy yet.
- Works: —
- Stubbed: —
- Last deploy: —

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

1. Stage 0: Neon `bnow` DB, scaffold, schema, health page, deploy.
2. Then Stages 1–6 per execution prompt (tasks #1–#7 in session task list).
3. Open: original brief needs to replace the reconstruction (Gregory, Monday).

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
