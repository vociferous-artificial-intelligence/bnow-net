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
                  signals / trade / datadark / critical-materials / ask / search / pricing / auth
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
src/lib/…           ask, entities, enrich, datadark, trade, materials, profiles, email,
                    nav, ingest, time (ET/UTC day + format + digest-status helpers),
                    gate/session/auth
scripts/            local runners (idempotent + resumable): backfills, seed, digest,
                    validate, map-backfill, sqlq, pin-dns.cjs, test-integration.sh
fixtures/           saved HTML/JSON for tests
docs/               PRODUCT-BRIEF, PROGRESS, OPEN-TASKS, BLOCKERS, SETUP-NEXT-WEEK,
                    DECISIONS (log archive), STATUS-REPORT, TIME-MODEL, strategy docs,
                    reviews/, designs/
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
  registry-selected + curated Telegram via t.me/s/, Telegram MTProto (**wired
  2026-07-11; `TELEGRAM_SESSION` present in production (added 2026-07-11): operator
  login done, `ingest:mtproto` cron :35 hourly runs green — **first live fetch VERIFIED
  2026-07-11** (~3.8K docs across runs, 0 errors, cross-transport dedupe firing); egress
  PROVEN on Vercel tcp+wss; reads registry **top-120 ROCA-only**
  (`isw_reports.theater='ru'`) vs the scraper's top-50 pan-theater — RU/UA-priority
  roster deployed 2026-07-11, env-tunable, rollback via
  `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER=all`**), X via api.twitterapi.io (383
  ISW-cited accounts — **wired but FROZEN since 2026-07-09 20:21Z: `X_SPRINT_USD_CAP`
  reached ($5.00 all-time), `ingest:x` runs green but fetched=0; resumes only when the
  operator raises the cap — OPEN-TASKS #38**), GDELT (wired, upstream-flaky), zakupki
  procurement (wired, blocked — needs proxy).
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
- **Surface:** landing / countries (freshness line, **2026-07-12**) / pricing
  (**rebuilt 2026-07-12**: DB-priced Standby + Full analyst tiers from
  `src/lib/pricing/tiers.ts`, Regional bundles + Enterprise/API on request) /
  magic-link auth (Postmark LIVE, still on scenefiend sender domain) / digests
  (ClaimSources diversity-selected source collapse, **adopted 2026-07-12**) +
  registry (**ADMIN-ONLY since 2026-07-12** analyst-trust R5:
  `requireAdminOr404()` in both layouts — every non-admin, signed-in or out, gets a
  404, replacing the old requireUser 307; registry links removed from nav, rail and
  all pages; `view-policy.ts` still shapes what an admin sees; "suggest a source"
  mailto moved to digest footers) + entities behind FEATURE_AUTH_GATE / signals
  (**evidence-gated 2026-07-12**: signed-in ClaimSources evidence in `<details>`,
  signed-out count+sign-in-only) / trade / datadark / critical-materials / ask
  (**v2 pipeline LIVE 2026-07-12**: hybrid vector+lexical retrieval, gpt-5-mini
  listwise rerank, gpt-5 answerer with refusal handling; ~$0.011/query; capped
  100/user/day + $10/day global (`ASK_USER_DAILY_LIMIT`/`ASK_GLOBAL_DAILY_BUDGET_USD`)
  + guard caps `ASK_USD_CAP_DAILY=2`/`EMBED_USD_CAP_DAILY=1`, all four in Production
  AND Preview; rollback = `ASK_PIPELINE=legacy` plain env + redeploy. **Polished
  2026-07-12 (ask-polish sprint):** paid pipeline runs ONLY from the form's server
  action — GET /ask?q= prefills, never executes (closes OPEN-TASKS #48
  double-billing); pending state (spinner/disable/aria-busy); end-user persona
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
  per-metric how-to-read lines** and an **at-publish dual-coverage subline**:
  `validation_runs.details.atPublish` = share of the run's takeaways matched with
  evidence ingested before ISW's publish instant (src/lib/validation/at-publish.ts,
  jsonb only — no migration; 7-day deterministic backfill applied 2026-07-12; full
  cutoff-anchored design parked in docs/designs/ISW-CUTOFF-SCORING.md).
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
  contrast to /ask. i18n: en+uk full, de ar ja pl fr catalogs
  (landing wired; needs native review before promotion; ~108 uk strings — 10
  `ask.*` (MERGE 1) + ~64 design-branch strings (MERGE 2: pricing, home.status,
  home.validation, signals, registry) + 3 ask-polish strings + 31 analyst-home
  strings + 18 analyst-trust strings — await native review, tracked in
  `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`).
- **Tests:** 1053 unit tests / 84 files green (`npm test`, ~3s) + Neon-branch
  integration suite (`npm run test:integration`). CI mirror: `.github/workflows/ci.yml`;
  the enforced gate is `.githooks/pre-push` (typecheck+lint+test).
- **Crons (vercel.json):** ingest fast */15 · telegram :10 · x :20 · mtproto :35 ·
  map :40 (hourly) · digest 02:00 (D+1 finalize) + 04:00/10:00/19:30 (intraday, rolling window,
  delta-framed) · validate 07:00 (scores yesterday = the finalized digest) ·
  enrich 08:00 · datadark 09:00 · trade monthly (2nd) · materials monthly (3rd).
- **Stubbed / off:** ACLED (fixture stub, unwired); Stripe flagged off; Resend adapter
  superseded by Postmark. (MTProto left this list 2026-07-11 — real adapter wired,
  session-gated; see Ingestion above.)
- **Deploy:** `npx vercel@latest deploy --prod --yes` — machine CLI session
  (`VERCEL_TOKEN` is expired; regen is an operator task, SETUP-NEXT-WEEK #2).
- **This WSL2 box:** the NAT resolver times out on some domains — a DNS quirk, NOT a
  TCP block. `NODE_OPTIONS="--require ./scripts/pin-dns.cjs"` pins vercel/openai/
  understandingwar DNS to public resolvers, making local single-call LLM debugging
  work; bulk LLM work still runs via deployed Vercel routes (prod env + metering).
  github.com resolves slowly/flakily: pushes work, but short-timeout git commands can
  fail — retry or wait ~30s+. api.gdeltproject.org DNS still fails locally (not
  pinned). TASS/RIA/Lenta RSS unreachable → covered via their Telegram channels.
- **Git:** origin/main == local main as of 2026-07-12; there is no push blocker.

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
| OpenAI (analysis + ask v2 + embeddings) | `OPENAI_API_KEY` + caps (ruling 4) | **live, spend-guarded** (openai_ask / openai_embed meter separately) | platform.openai.com |
| LLM kill-switch | `LLM_DISABLE=1` | refuses every LLM call site (ruling 9) | (env only) |
| Anthropic | `ANTHROPIC_API_KEY` | provider implemented; key absent | console.anthropic.com |
| Postmark (auth email) | `POSTMARK_SERVER_TOKEN` | **live** (scenefiend sender domain — migrate) | postmarkapp.com |
| Cron auth | `CRON_SECRET` | **live** | (already set) |
| Auth.js | `AUTH_SECRET` | **live** (hashes magic-link tokens: rotating it invalidates every unclicked link) | (already set) |
| X via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live but FROZEN** (x_api; sprint cap $5.00 reached 2026-07-09 → fetched=0, #38) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + `OPENSANCTIONS_CALL_CAP` | **live but FROZEN** (300-call lifetime cap reached 2026-07-09; licensing gate before badges ship) | opensanctions.org |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` + `TELEGRAM_SESSION` (all in prod env) | **wired; `TELEGRAM_SESSION` present in production** (added 2026-07-11 as a Sensitive var, minted via `scripts/telegram-login.ts`; first live fetch pending `:35` cron verification) | my.telegram.org |
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
