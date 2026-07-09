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
 GDELT 15-min slices ─┼─ SourceAdapter.fetchLatest() ─> raw_documents ─┐
 t.me/s/ web preview ─┤      (cron /api/cron/ingest)    (hash-deduped) │
 X via twitterapi.io ─┘  (MTProto/ACLED: fixture stubs, NOT wired)     ▼
                                        normalize → near-dupe → claims/events
                                        (claim ⇄ raw_documents join = traceability,
                                         enforced: claim INSERT requires source link)
                                                            │
        shadow map stage (hourly): raw_documents →          ▼
        doc_claims / doc_dedup / doc_map_state   digests (4×/day, theater×track)
        — sprint-3 reduce input; digest            └─> validation_runs (vs ISW same-day:
        pipeline untouched by it                        coverage, divergence, timeliness,
                                                        unsupported-claim rate)
 Product surface: landing / countries / digests+scoreboard / registry / entities / signals /
                  trade / datadark / critical-materials / ask / pricing / auth
```

Directory map (correct in place as it changes):

```
src/app/            routes (public pages, /admin/*, /api/cron/*, /api/*)
src/components/     shared React components (SiteHeader, hand-rolled ARIA dropdowns)
src/db/             drizzle schema + client; generated SQL lives in drizzle/
src/i18n/           LOCALE_REGISTRY + catalogs (en uk de ar ja pl fr; ar is RTL)
src/integration/    *.itest.ts — Neon-branch integration tests, excluded from unit suite
src/lib/adapters/   SourceAdapter impls: rss, gdelt, telegram-web, x-api (live), procurement;
                    stubs.ts = fixture stubs (MTProto/ACLED/x) — never wired into prod ingest
src/lib/analysis/   AnalysisProvider (openai/anthropic/stub), digest, tracks, source-mix,
                    map stage (map-worker, map-prompts, map-dedup, minhash)
src/lib/isw/        crawler, endnote parser, hedging classifier, registry materializer
src/lib/validation/ ISW scoreboard: keyword gazetteer + majority-vote LLM matcher
src/lib/usage/      SpendGuard, llm-guard (caps + kill-switch), cron-run bookkeeping
src/lib/…           ask, entities, enrich, datadark, trade, materials, profiles, email,
                    nav, ingest, gate/session/auth
scripts/            local runners (idempotent + resumable): backfills, seed, digest,
                    validate, map-backfill, sqlq, pin-dns.cjs, test-integration.sh
fixtures/           saved HTML/JSON for tests
docs/               PRODUCT-BRIEF, PROGRESS, OPEN-TASKS, BLOCKERS, SETUP-NEXT-WEEK,
                    DECISIONS (log archive), STATUS-REPORT, strategy docs, reviews/
drizzle/            migrations 0000–00NN + 9999_claim_source_trigger.sql (applies last)
data/               gitignored: cache/ (fetched pages), outbox/ (rendered emails)
```

## Current state — snapshot (verified 2026-07-09; correct in place when it changes)

Live at **https://bnow-net.vercel.app** (Vercel project `bnow-net`, team `vociferous`;
deployment URLs are SSO-walled — always use the project domain). History/narrative:
`docs/PROGRESS.md` + `docs/reviews/`; debt: `docs/OPEN-TASKS.md`.

- **Registry:** 6,985 ISW-derived sources / 251K citations / 1,565 reports (97.65% parse);
  per-theater aggregates in `source_theater_stats` (ru/ir).
- **Ingestion (live):** 29 RSS feeds (ru ua il ir sa ae qa om + bh/kw scaffolded),
  registry-selected + curated Telegram via t.me/s/, X via api.twitterapi.io (383
  ISW-cited accounts), GDELT (wired, upstream-flaky), zakupki procurement (wired,
  blocked — needs proxy).
- **Map stage:** all eligible ru/ua/ir docs since 06-29 mapped once per
  (track, extractor_version) → `doc_claims` (~19K claims), persistent dedup verdicts
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
  AND thin (<50% prior claims) regenerations (#32 closed; FORCE_REGEN=1 override).
- **Validation vs ISW:** majority-vote LLM matching (k=5, 26/27 reproducible across
  reruns), keyword gazetteer as no-key fallback; ISW report auto-discovery by slug.
  Coverage avg ~17.5% (nonzero-day ~31%), median info-lead +14.7h (2026-07-05 backtest).
- **Surface:** landing / countries / pricing / magic-link auth (Postmark LIVE, still on
  scenefiend sender domain) / digests+registry+entities behind FEATURE_AUTH_GATE /
  signals / trade / datadark / critical-materials / ask (capped 20/user/day, $1/day
  global) / i18n: en+uk full, de ar ja pl fr catalogs (landing wired; needs native
  review before promotion).
- **Tests:** 450 unit tests / 39 files green (`npm test`, ~3s) + Neon-branch
  integration suite (`npm run test:integration`). CI mirror: `.github/workflows/ci.yml`;
  the enforced gate is `.githooks/pre-push` (typecheck+lint+test).
- **Crons (vercel.json):** ingest fast */15 · telegram :10 · x :20 · map :40 (hourly) ·
  digest 02:00 (D+1 finalize) + 04:00/10:00/19:30 (intraday, rolling window,
  delta-framed) · validate 07:00 (scores yesterday = the finalized digest) ·
  enrich 08:00 · datadark 09:00 · trade monthly (2nd) · materials monthly (3rd).
- **Stubbed / off:** MTProto + ACLED (fixture stubs, unwired); Stripe flagged off;
  Resend adapter superseded by Postmark.
- **Deploy:** `npx vercel@latest deploy --prod --yes` — machine CLI session
  (`VERCEL_TOKEN` is expired; regen is an operator task, SETUP-NEXT-WEEK #2).
- **This WSL2 box:** the NAT resolver times out on some domains — a DNS quirk, NOT a
  TCP block. `NODE_OPTIONS="--require ./scripts/pin-dns.cjs"` pins vercel/openai/
  understandingwar DNS to public resolvers, making local single-call LLM debugging
  work; bulk LLM work still runs via deployed Vercel routes (prod env + metering).
  github.com resolves slowly/flakily: pushes work, but short-timeout git commands can
  fail — retry or wait ~30s+. api.gdeltproject.org DNS still fails locally (not
  pinned). TASS/RIA/Lenta RSS unreachable → covered via their Telegram channels.
- **Git:** origin/main == local main as of 2026-07-09; there is no push blocker.

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
   backstop), `LLM_DIGEST_USD_CAP` (daily), `MAP_USD_CAP_DAILY`, `X_SPRINT_USD_CAP` +
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
15. Nav promotes only ru/ua/ir (promoting 2-digest theaters overstates depth); coverage
    links go to `/countries#<iso2>` (theater pages don't exist; digests are gated);
    locale links carry no `?to=` (Referer round-trips path+query, `?to=` drops query).
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

## Decision log (append-only, dated)

Entries 2026-07-04 → 2026-07-09 (MR sprint 1) are archived VERBATIM in
`docs/DECISIONS.md`. Distilled still-binding decisions live in Standing rulings above.

- **2026-07-09 (MR sprint 2)** Map stage ships in SHADOW: `doc_claims`/`doc_dedup`/`doc_map_state`
  + hourly `/api/cron/map` (:40, own group). The digest pipeline is byte-untouched — the only
  shared-file changes are additive (`llm-guard.ts` map guard, `vercel.json` cron, `schema.ts`).
  `doc_map_state` exists beyond the task list's tables because "mapped, zero relevant claims" must
  be distinguishable from "never mapped" — claim rows alone cannot say it, and it is what makes the
  worker idempotent (anti-join) and resumable after a crash.
- **2026-07-09 (MR sprint 2)** `raw_documents.processed` repurposed to exactly ONE meaning: the map
  worker reached a final disposition (mapped every applicable track / recorded as mirror / no
  applicable track). It exists so the hourly scan is an indexed `processed=false` probe instead of
  an anti-join over the whole corpus. Consequence, recorded as OPEN-TASKS #33: version bumps need
  their own remap path — the flag deliberately does not reset itself.
- **2026-07-09 (MR sprint 2)** Dedup gate verdicts are SAME-THEATER and ±1 DAY for exact **and**
  minhash matches. Same-theater because the map key is theater-scoped (mirroring a ru doc to an ir
  canonical silently drops the ru claims); ±1 day because identical content on distant days is
  usually a recurring template (telegram air-raid alerts, audit §9a) describing a *different* day's
  events — collapsing those would misdate claims. The ±1-day rule was specified for minhash only;
  extending it to exact matches is this sprint's call, flagged here for review.
- **2026-07-09 (MR sprint 2)** **gpt-4o-mini silently answers a fraction of a multi-doc batch**:
  with the response schema unbounded it returned 1 of 15 requested per-doc entries and stopped
  clean (`finish_reason=stop`); prompt wording ("return exactly N entries", explicit id checklist)
  did not fix it (43% omission in backfill round 1, 57% in round 2). The fix is grammar-level:
  `minItems`/`maxItems` = batch size on the results array — **strict mode accepts array bounds and
  the API's constrained decoding then forces the count** (15/15, correct ids, in order). Any future
  batched per-item extraction should start from this.
- **2026-07-09 (MR sprint 2)** Map prompts are versioned: `extractor_version` = model + sha256 of
  (resolved system prompt, user-frame revision, content budget), 12 hex chars. Two superseded
  versions from the sprint's own prompt iterations remain in the store as history (append-only) —
  consumers filter to `mapExtractorVersion()` current versions or double-count (OPEN-TASKS #35).
- **2026-07-09 (MR sprint 2)** **A standing note in this file is now WRONG:** "api.openai.com
  TCP-unreachable from this WSL2 box" (Local-host quirks, 2026-07-04). It was never TCP — the WSL2
  NAT *resolver* times out on those domains, and `scripts/pin-dns.cjs` (routes vercel/openai DNS
  through 1.1.1.1) makes local OpenAI calls work fine. That is precisely how the omission bug above
  was root-caused: reproducing one map batch locally and reading the raw response. LLM bulk work
  still runs via Vercel routes (prod env, metering, crons), but local single-call debugging is
  available and cheap.
- **2026-07-09 (MR sprint 2)** Map spend rails: `MAP_USD_CAP_DAILY=4` set in all three Vercel envs
  BEFORE the deploy (fail-closed like the digest cap, but its OWN env — never shared with
  `LLM_DIGEST_USD_CAP`, so a backfill can neither starve nor be starved by production digests);
  `LLM_SPRINT_USD_CAP` stays the all-time backstop; ledger row `provider_usage.openai_map`;
  `LLM_DISABLE=1` refuses the worker (typed throw). `MAP_CONCURRENCY=6` (prod env) after measuring
  ~45K tok/min at the default 3 — latency-bound, not TPM-bound.
 - **2026-07-09 (tooling)**  Added repo-root CLAUDE.md granting the scoped delete/rename/move 
  exception that ~/CLAUDE.md requires (imports AGENTS.md via @). Supersedes the 2026-07-04 
  "no deletes/renames" understanding, which mis-attributed a global-~/CLAUDE.md rule to a 
  nonexistent repo-root file. Applied-migration additivity and 
  decision-log append-only are explicitly preserved.
- **2026-07-09 (restructure)** AGENTS.md reorganized from journal to brain, 476 → 301
  lines. New maintenance rule at top: only this log is append-only; standing sections are
  corrected in place. Entries 2026-07-04 → 07-09 (MR sprint 1) moved verbatim to
  `docs/DECISIONS.md`; durable decisions distilled into § Standing rulings. Stale
  standing facts corrected in place: digest cron is 4×/day at 0/6/12/18 UTC (was "daily
  21:30"); "openai/gdelt TCP-unreachable" rewritten as the WSL2 DNS quirk (gdelt DNS
  still fails — not pinned); GitHub reachable but DNS slow (ls-remote: 3/3 fail at 10s,
  ok at 45s); directory map matched to the real tree; RSS count 8 → 29; anthropic
  provider exists in the seam (key absent); Postmark added to credentials (live but
  missing from the table); untouchables now name the SpendGuard cap envs, not the
  launch-weekend "$25 cap / deployed by Sunday". `CLAUDE.MD` → `CLAUDE.md` (auto-load
  is case-sensitive) and rewritten: verified commands/setup, commit hygiene, pointers
  instead of restated guardrails. 391/391 tests green at time of writing.
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
| Neon Postgres | `DATABASE_URL`, `NEON_API_KEY` | **live** | console.neon.tech |
| Vercel deploy | CLI session (`VERCEL_TOKEN` expired) | **live (CLI)** | vercel.com/account/tokens |
| OpenAI (analysis) | `OPENAI_API_KEY` + caps (ruling 4) | **live, spend-guarded** | platform.openai.com |
| LLM kill-switch | `LLM_DISABLE=1` | refuses every LLM call site (ruling 9) | (env only) |
| Anthropic | `ANTHROPIC_API_KEY` | provider implemented; key absent | console.anthropic.com |
| Postmark (auth email) | `POSTMARK_SERVER_TOKEN` | **live** (scenefiend sender domain — migrate) | postmarkapp.com |
| Cron auth | `CRON_SECRET` | **live** | (already set) |
| X via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live** (x_api, spend-guarded) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + `OPENSANCTIONS_CALL_CAP` | **live** (licensing gate before badges ship) | opensanctions.org |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` | stubbed | my.telegram.org |
| ACLED | `ACLED_API_KEY`, `ACLED_EMAIL` | stubbed | acleddata.com |
| Stripe | `STRIPE_SECRET_KEY`, … | flagged off | dashboard.stripe.com |
| Resend | `RESEND_API_KEY` | superseded by Postmark | resend.com |

## Next steps / open questions

1. **Operator:** `docs/SETUP-NEXT-WEEK.md` top-to-bottom — VERCEL_TOKEN regen, bnow.net
   DNS + domain attach, Postmark sender-domain move off scenefiend, MTProto, Stripe.
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
