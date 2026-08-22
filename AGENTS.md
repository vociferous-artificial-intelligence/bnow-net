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
Which model each ANALYSIS workload dispatches — map, reduce, digest, validation,
entity_audit — is resolved at CALL time by `src/lib/llm/model-config.ts`, the one routing
authority (call sites never read `OPENAI_MODEL`/`*_MODEL` themselves); Ask keeps its own
scorecard-gated models and is deliberately not routed there. Every analysis workload
resolves to gpt-4o-mini with no reasoning effort today.
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
src/components/     shared React components (SiteHeader, hand-rolled ARIA dropdowns,
                    home-ask-box = the signed-in home's one-click /ask handoff)
src/db/             drizzle schema + client; generated SQL lives in drizzle/
src/i18n/           LOCALE_REGISTRY + catalogs (en uk de ar ja pl fr; ar is RTL)
src/integration/    *.itest.ts — Neon-branch integration tests, excluded from unit suite
src/lib/adapters/   SourceAdapter impls: rss, gdelt, telegram-web, telegram-mtproto, x-api
                    (live), procurement; stubs.ts = fixture stubs (ACLED/x) — never wired
                    into prod ingest
src/lib/analysis/   AnalysisProvider (openai/anthropic/stub), digest, tracks, source-mix,
                    map stage (map-worker, map-prompts, map-dedup, minhash)
src/lib/llm/        analysis-model routing + money authorities: model-config.ts (the ONE
                    per-workload model/effort resolver + fail-closed dispatch gate),
                    analysis-registry.ts (analysis-reg-v1 quality approvals — baseline
                    only), pricing.ts (the single analysis metering price table)
src/lib/isw/        crawler, endnote parser, hedging classifier, registry materializer
src/lib/validation/ ISW scoreboard: keyword gazetteer + majority-vote LLM matcher
src/lib/usage/      SpendGuard, llm-guard (caps + kill-switch), cron-run bookkeeping
src/lib/…           ask (incl. intent.ts: one-shot home→/ask handoff contract), entities,
                    enrich, datadark, trade (incl. partners.ts M49 names),
                    materials, profiles, email, access (beta-request validation),
                    auth-delivery (magic-link + SIGNIN_MODE invite gate),
                    nav, ingest, time (ET/UTC day + format + digest-status helpers),
                    legal (policies=version constants + acceptance record + safe-next redirect
                    guard), gate/session/auth
scripts/            local runners (idempotent + resumable): backfills, seed, digest,
                    validate, map-backfill, sqlq, pin-dns.cjs, test-integration.sh
fixtures/           saved HTML/JSON for tests
docs/               CURRENT-STATE (detailed living snapshot), PRODUCT-BRIEF, PROGRESS,
                    OPEN-TASKS, BLOCKERS, SETUP-NEXT-WEEK, DECISIONS (log archive),
                    STATUS-REPORT, TIME-MODEL, strategy docs,
                    reviews/, designs/
drizzle/            migrations 0000–00NN + 9999_claim_source_trigger.sql (applies last)
data/               gitignored: cache/ (fetched pages), outbox/ (rendered emails)
```

## Current state — compact snapshot (verified 2026-08-14; correct in place)

Detailed operational/product state lives in `docs/CURRENT-STATE.md` and is corrected in
place whenever reality changes. Historical narrative: `docs/PROGRESS.md` + `docs/reviews/`;
debt: `docs/OPEN-TASKS.md`; decision history: `docs/DECISIONS.md`.

- **Live/repository:** https://bnow.net · Vercel `bnow-net` / team `vociferous`; production
  `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` is the **2026-08-20 workload-scoped model-routing
  release** (PR #5), built from `main` merge commit `7336b9c`, READY and aliased to
  `bnow.net` + `bnow-net.vercel.app`, `/health` stamping `7336b9c` with `DB OK`; created
  2026-08-20T21:00:27Z. Infrastructure only: no candidate model is approved or activated,
  and NO routing variable exists in any Vercel environment (86 env rows / 48 distinct
  names, reverified 2026-08-21). Its formal 24h soak
  2026-08-20T22:00:00Z→2026-08-21T22:00:00Z is **CLOSED — PASS** (199/199 scheduled runs
  ok, zero failed/unfinished/errored `cron_runs`, 24/24 map runs, one baseline dispatch
  identity each for map/digest/validation, zero routing-gate failures, zero 5xx). Code
  rollback target = the prior Candidate B release `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` /
  `9c5e9cb`. Prior lineage: the 2026-08-17 Candidate B cron-clustering release
  (`dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`, `main` merge `9c5e9cb`, PR #4; the only
  production-file change is `vercel.json` — the telegram/x/mtproto hourly starts moved
  `:10/:20/:35` → `:01/:02/:03`; its 48h observation window
  2026-08-17T07:00Z→2026-08-19T07:00Z is **CLOSED — PASS**: measured **13.6%** Neon
  active-compute reduction over the full window, i.e. ~13–14% in practice, BELOW the
  pre-deploy ~17–19% estimate, with 398/398 scheduled runs green; Candidate B stays
  deployed, no 72h extension, no rollback). Lineage: the 2026-08-15
  Iran-validation-recovery branch (`70b2aa9`, incl. the ruling-21 authorization repair)
  was merged to `main` as PR #2 (`26989f7`) and redeployed 2026-08-16 as
  `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC` — the current code rollback target. `/health`
  stamps `9c5e9cb` on the live deployment (root-clone CLI deploy; the OPEN-TASKS #78
  blank-stamp caveat applies only to worktree CLI deploys). No migration; no env change;
  all Ask flags preserved (`ASK_RUNS_SHADOW=1` soak, retention 30/7/7). Ask shadow-soak
  window still dates from 2026-07-22T01:10:37Z. Production DB backup branches:
  `backup-pre-ask-release-2026-07-21` (`br-small-poetry-atf9x253`) and
  `backup-pre-iran-recovery-2026-08-15` (`br-polished-block-atu0r968`) — keep both until
  their windows clear.
- **Coverage/data:** Russia, Ukraine, Iran live; Israel/Gulf shallow; bh/kw scaffolded; China
  deferred. Registry: ~10,015 materialized sources (ir theater 3,654) / ~351K citations /
  1,608 reports — the Iran citation registry is CURRENT through 2026-08-14 (the 2026-08-15
  recovery loaded 42 reports incl. 6 rediscovered days; validation now auto-refreshes
  citations from every report it fetches, so it cannot go stale silently again). Live
  ingest: **34 RSS** (2026-08-15 adds en.mehrnews.com, radiofarda.com, sabanew.net,
  sanaacenter.org, alaraby.co.uk/politics to the ir lens; presstv.ir fetches via its
  presstv.co.uk mirror — the .ir feed had been dead on a broken TLS redirect), GDELT
  (flaky), Telegram web + MTProto, twitterapi.io X, procurement (proxy-blocked).
  Stub/fixture sources never persist or render as fact.
- **X/Telegram operations:** X July 9–13 gap recovered cursor-complete; automatic bounded
  long-park catch-up + health alerts deployed. A natural 2026-08-10 provider-request-failure
  episode (zero budget stops) production-proved checkpoint resume and completion: scheduled
  catch-up inserted 10,393 documents on 2026-08-13, recorded recovery state, and returned to
  healthy hourly polls (#66 closed; #38 now tracks only independent alert-email delivery proof).
  MTProto is live/top-120 ROCA-only; non-fatal GramJS peer-type `CastError` noise remains #69.
- **Analysis:** `DIGEST_ENGINE=mapreduce` is set in Production and the versioned map stage
  feeds it; K=5 voting, majority-gid fill, publication-safety guard, and thin-regeneration
  guard are binding. **Corrected 2026-08-21 — mapreduce is currently producing NOTHING:**
  a theater falls back to legacy whenever the digest window finds no CURRENT-version
  `doc_claims`, and since **2026-08-17 every digest (11/day) has been legacy**, with
  `provider_state.map_health` reading `stale_ir,stale_ru,stale_ua`. The map worker itself
  is healthy (~4–6K claims/day) but is draining the ru/ua BACKLOG — old documents — so
  current-day windows are empty. Two compounding pre-existing defects are tracked as
  OPEN-TASKS #86 (≈50% of map micro-batches rejected by the provider with
  `400 Invalid body`, root-caused to surrogate-splitting truncation in
  `map-prompts.ts:164`) and #88 (the fallback itself). Validation uses k=5 LLM matching
  with keyword fallback and exposes coverage/divergence/timeliness/thin-source metrics.
  **2026-07-29→08-15 map outage (Iran recovered; ru/ua backlog still draining):**
  `openai_map` crossed the shared $10 all-time
  backstop at 2026-07-29 08:40Z and 418 hourly runs then recorded `ok=true` with zero claims
  while ru/ua/ir doc_claims starved and ru/ua/ir digests silently fell back to the legacy
  engine (Iran claims/day 8.8→~3; 2026-07-31 got no ir digest at all). The 2026-08-15
  release makes any non-run_cap budget stop record `cron_runs.ok=false` with a
  machine-readable category, adds per-theater/current-version freshness + episode-deduped
  operator alerts (`map-health.ts`, state in provider_state `map_health`), and the map cap
  is now `MAP_SPRINT_USD_CAP=40` (map-only; `LLM_SPRINT_USD_CAP=10` unchanged for every
  other path). Recovery details: the 2026-08-15 decision-log entry.
- **Analysis model routing (repository code — NOT deployed):** PR #5's workload-scoped
  routing seam is in the repository: `src/lib/llm/model-config.ts` resolves (model, effort)
  per workload at call time (`<WORKLOAD>_MODEL` → `OPENAI_MODEL` → gpt-4o-mini) and FAILS
  CLOSED — before any SpendGuard reservation or provider-client construction — on an
  invalid effort, an unpriced model, or a (workload, model, effort) with no
  `analysis-reg-v1` approval; `src/lib/llm/analysis-registry.ts` holds baseline-only
  approvals (gpt-4o-mini, effort absent, status `baseline`) with ZERO
  `evaluated_candidate` entries; map carries a HARD activation lock with no env override.
  All ten routing envs (`MAP/REDUCE/DIGEST/VALIDATION/ENTITY_AUDIT_MODEL` +
  `*_REASONING_EFFORT`) and `OPENAI_MODEL` are ABSENT in Production, Preview and
  Development (verified read-only 2026-08-20), so every workload resolves to the historical
  baseline and `mapExtractorVersion()` stays byte-identical to the deployed corpus's — all
  six live production (theater, track) pairs re-verified against `doc_claims` on
  2026-08-20. **Merging this is not deploying it:** production keeps running `9c5e9cb` /
  `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` until a separately authorized deployment, so
  repository code is AHEAD of production.
- **Product/access:** invite-only private beta; public access request flow; pricing redirects to
  `/access`. Registry/admin surfaces remain admin-only. Signals are anonymous teaser-only and
  accepted-user detailed, with source-attributed named people + non-endorsement notice. Ask v2,
  free Search, digests/archive/scoreboard, entities, trade/datadark/materials are live behind
  their documented gates. The 2026-07-16 analyst quick wins are live: source-first evidence,
  consolidated print disclosure, digest freshness, analyst-safe labels/metadata, and the measured
  light/dark readability remediation described in the implementation review. The signed-out
  landing contrast follow-up (#73) is also live and production-proven across six viewport/theme passes.
  The signed-in home Ask box is a one-click handoff (LIVE 2026-07-17, `dpl_5jAidKc8rnSKmSG1gK5rP4KehwJv`):
  a single-use per-tab intent key, consumed once by AskForm on mount; #48 holds — every GET /ask is free,
  re-proven in production (direct `?q=` and a forged `?intent=` both prefill-only, zero paid calls).
  The **AI Search/Ask release candidate is LIVE (2026-07-21, `836b46e`)** with every new flag
  off except the `ASK_RUNS_SHADOW=1` soak (retention 30/7/7 set; user-visible Ask unchanged;
  enforce/progressive/stream/cache/sessions/router/billing/analytics all off; cohort
  activation awaits the 48–72h soak verdict — `scripts/ask-shadow-soak-check.ts`).
- **Legal/analytics/email:** Terms 1.1 (2026-07-16) + Privacy 1.3 (2026-07-21 — fixed Ask
  retention disclosure: content ≤30d, events ≤7d, cache ≤7d); current clickwrap required.
  Postmark `BNOW.NET <no-reply@bnow.net>` is live; magic-link guidance is single-use/24h and
  copy-before-opening. PostHog is production-only, explicit opt-in, allowlist-sanitized, UUID
  identity, no Ask/Search/source text; GeoIP is retained per disclosed operator ruling.
- **Quality/ops:** 2,187 unit tests / 171 files + 107 real-Postgres integration tests /
  17 files, all green (measured 2026-08-20 on the PR #5 reconciliation tree; the previous
  `2,049 / 161` + `72 / 14` figures were stale). Production DB migrated through 0027
  (2026-07-21, verified + idempotent).
  Enforced pre-push gate = typecheck+lint+test. Crons: fast */15; telegram :01; X :02;
  MTProto :03 (clustered since the 2026-08-17 Candidate B release; :10/:20/:35 before);
  map :40; digest 4×/day; validate/enrich/datadark daily; trade/materials monthly.
  OpenSanctions fixed-cutoff rescore is deployed, and claim-linked spend eligibility (#17 spend
  subset) is deployed — every /match candidate and the `remaining` count now require ≥1
  `claim_entities` row, so the 186 zero-link missing/stub rows can no longer be billed. Paid
  rescore remains closed pending #61 cleanup/recount and separate spend authorization.
  **OpenSanctions match-safety is LIVE (441ee09, 2026-07-22):** fail-closed read model
  (`os-read.ts`) + admin-only neutral candidate-review presentation; non-admin/public surfaces
  render ZERO OpenSanctions markup (verified live: the pre-release non-admin profile-link leak
  is gone); Ask receives no OpenSanctions-derived categorical assertion. OpenSanctions data is
  candidate-identity screening metadata only; restoring any public sanctions/PEP assertion needs
  a human-review workflow + stronger identifiers + product review + a new decision-log entry.

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
   backstop; compared against EACH provider row's own total), `MAP_SPRINT_USD_CAP`
   (map-only all-time ceiling, 2026-08-15 — overrides the shared backstop for
   `openai_map` alone; falls back to `LLM_SPRINT_USD_CAP` when unset),
   `LLM_DIGEST_USD_CAP` (daily), `MAP_USD_CAP_DAILY` (daily; a bounded recovery may
   elevate it via `MAP_USD_CAP_DAILY_OVERRIDE_USD` + `_UNTIL`, which auto-expires at an
   explicit-timezone instant and can never enable an unset base), `ASK_USD_CAP_DAILY` +
   `EMBED_USD_CAP_DAILY` (daily, ask v2 + embeddings), `X_SPRINT_USD_CAP` +
   `X_DAILY_USD_CAP`, `OPENSANCTIONS_CALL_CAP`. Set a new cap env in ALL Vercel envs
   BEFORE deploying the guard that reads it, or you stop that pipeline.
   **Analysis dispatch additionally fails closed on CONFIGURATION** (2026-08-17 routing
   seam): `workloadDispatchConfig()` refuses — before `tryReserve()` and before any
   provider client is built — an invalid `*_REASONING_EFFORT`, an effort set for a
   non-reasoning model, a model with no entry in `src/lib/llm/pricing.ts`, or a
   (workload, model, effort) with no `analysis-reg-v1` approval. `pricing.ts` is the
   SINGLE price authority for analysis metering (the Ask registry parity-pins it), and
   pricing is necessary but NOT sufficient: an entry there means a model can be metered,
   an entry in `analysis-registry.ts` means it is approved to serve production.
5. **Migrations:** never edit or delete an applied migration; evolve forward with a new
   one. `9999_claim_source_trigger.sql` re-asserts without DROP, always applies last —
   never renumber it or let drizzle-kit regeneration drop it.

Ruling 21 below is invariant-grade too (authorization placement); it sits at the end
because the decision log cites rulings 6–20 by number and must not be renumbered.

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
    bumps need their own remap path (OPEN-TASKS #33). **Version basis + hard activation
    lock (2026-08-17 routing seam):** the basis reads the MAP workload's resolution, so
    `MAP_MODEL` — and a validated, reasoning-capable `MAP_REASONING_EFFORT`, appended only
    when set — bump the version, while `REDUCE_*` NEVER does (reduce reads doc_claims, it
    does not write them) and the all-absent basis is byte-identical to the historical one.
    Because a bump does not remap history (the worker selects `processed = false` only),
    map is HARD-LOCKED to the baseline (gpt-4o-mini, effort absent): any other map
    model/effort is refused with `MAP ACTIVATION BLOCKED`. There is NO env override, and
    pricing or registry approval alone does not unlock it — #33's version-aware remap path
    plus explicit operator activation authorization are required first.
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
20. **Named people in Search/Ask (2026-07-19; distinct from digest ruling 19):** names and
    source-supported facts MAY render; no blanket suppression or universal two-source minimum.
    One authoritative record may support its exact action/status. Disputed news keeps governing
    attribution/hedging; synthesis never strengthens identity, predicate, certainty, status, or
    timing. OpenSanctions name matches are candidate identities; sanction/PEP/RCA/POI topics stay
    distinct and name-only matches need stronger identifiers or analyst review for definitive
    identity. Ask enforces source fidelity; it does not port ruling 19's single-doc drop rule.
21. **Authorization lives in the PAGE, never only in a layout (2026-08-03; invariant-grade).**
    A `layout.tsx` is NOT an authorization boundary in the App Router: layout and page render
    as SIBLING tasks, so a layout's `redirect()`/`notFound()` errors only the layout's own
    task — the page's queries still run and its output is still serialized. An anonymous
    caller recovers that output two ways (both reproduced here against a production build):
    an `RSC: 1` header returns HTTP 200 `text/x-component` holding the whole rendered page,
    and a bare GET returns the rendered HTML as the BODY of the 307 (a browser discards it,
    curl keeps it). Every gated page therefore calls its gate — `requireAdmin` /
    `requireAcceptedUser` / `requireAdminOr404` from `@/lib/gate` — as the FIRST statement of
    the page component, before any `db.execute` / `rawSql.query` / `Pool` query /
    `lexicalClaimSearch`; the layout gate STAYS as defense in depth. `currentRole()`
    authorizes nothing: it only shapes presentation (registry view policy, admin-only
    OpenSanctions markup) and never substitutes for a gate. Guarded by
    `src/integration/authz-page-gate.itest.ts`, which boots a real production build and
    asserts over HTTP that no privileged token appears in any response BODY — status codes
    are deliberately not trusted, since the leaking response was a 307. Unit tests that
    invoke page components directly CANNOT see this class of bug over HTTP; a new gated route
    needs a row in that test's ROUTES table. Because that itest needs a Neon secret and is
    excluded from `npm test`, the four unit-tested gated pages ALSO assert the gate ran before
    their first query (`page-level authorization gate` case per file), so the pre-push gate
    catches a deleted or reordered call.

## Decision log (append-only, dated)

Entries through the 2026-07-17 one-click Ask deployment are archived
**verbatim** in `docs/DECISIONS.md`; distilled still-binding decisions live in Standing
rulings above. New entries append at the BOTTOM (the archive runs oldest → newest).

- **2026-07-19 (named-person source-fidelity ruling for AI Search/Ask planning)** Operator
  set source/identity fidelity—not naming—as the risk boundary. One official record may support
  its exact action/status; disputed news keeps governing attribution/hedging; OpenSanctions match,
  category, and identity semantics stay distinct. Ruling 20 records this; digest ruling 19 remains.

- **2026-07-19 (unattended phased AI Search/Ask workstream authorized)** The implementation
  handoff continues through safe phases on retained phase branches/worktrees plus an integration
  branch, with detailed implementation and independent-gate reports. Passing work merges only to
  integration, never `main`. Missing external approval becomes `implementation-pass /
  enablement-blocked` with defaults unchanged. No paid calls, production writes, deploys, pushes,
  external/account/provider/cap/analytics changes, or Paddle work; those need later approval.

- **2026-07-21 (AI Search/Ask release hardening on the integration branch)** Operator-directed
  11-area hardening executed on `codex/ai-search-ask-release-hardening-20260721` and merged to
  the integration branch only (report: `docs/reviews/AI-SEARCH-RELEASE-HARDENING-2026-07-21.md`;
  register #72–#82). Standing consequences: SDK auto-retries are disabled in the Ask gateway
  (one reservation per physical dispatch, absolute); `src/lib/ask/features.ts` is the single
  server-side flag authority (progressive⇒enforce⇒retention lattice, fail-closed, cohort
  allowlist); shadow run persistence became explicit opt-in (`ASK_RUNS_SHADOW`, default OFF —
  a deploy alone stores nothing new) and every persistence-backed feature requires operator
  retention envs, enforced by lazy redaction/deletion sweeps; enforce-mode terminals carry an
  explicit durability verdict; sessions are transactional; exact-cache TTL binds at lookup with
  snapshot-verified hits; additive migration 0027 adds ask_runs billing_policy/billing_eligible
  (default false — nothing is invoice-eligible without a future explicit
  `ASK_BILLING_CUTOVER_AT` operator entry); migrations now apply atomically per file. Gates on
  the final tree: unit 2,027/2,027 · itest 72/72 · lint 0/0 · build PASS · 9/9 production-build
  browser scenarios; zero paid calls; production and `main` untouched.

- **2026-07-21 (Privacy 1.3 — Ask retention disclosure precedes persistence)** Operator set
  binding retention values (`ASK_CONTENT_RETENTION_DAYS=30`, `ASK_EVENTS_RETENTION_DAYS=7`,
  `ASK_CACHE_TTL_DAYS=7`) for the production release of the Ask release candidate. Privacy 1.2's
  "no fixed automatic deletion period" statement is incompatible with enabling any
  persistence-backed Ask surface, so the Privacy Notice §9 now discloses the fixed windows
  (question/answer/evidence ≤30 days; stream/progress events ≤7 days; exact-answer cache ≤7
  days; billing/accounting metadata retained separately without extending content retention) and
  `CURRENT_PRIVACY_VERSION` bumps 1.2→1.3 (effective 2026-07-21, the actual release date),
  forcing re-acknowledgement for every existing user through the standard clickwrap. Terms stay
  at 1.1 (no Terms change). The disclosure is truthful against the shipped sweep
  (`src/lib/ask/retention.ts`): it redacts/deletes ALL Ask content surfaces — including legacy
  `ask_usage.question` — keyed on the raw retention envs, surviving full flag rollback.

- **2026-07-21 (AI Search/Ask production release + shadow soak start)** Release commit
  `836b46e` (integration merge `356cba5` atop hardening tip; app code byte-identical to the
  gated tree) deployed to production after full gates (unit 2,028/2,028 · itest 72/72 · lint
  0/0 · build PASS · 6/6 production-build browser smoke on a disposable fork). Production DB:
  backup branch `backup-pre-ask-release-2026-07-21` (`br-small-poetry-atf9x253`) taken first;
  migrations 0021–0027 applied (each marker exactly once, 29 total; re-run idempotent;
  `billing_eligible` DEFAULT false NOT NULL; `claim_must_have_source` trigger intact; data
  intact). Baseline deploy `dpl_GNuFfB2qqX61cRtuMdjpJTT2sLfR` (flags off, retention 30/7/7
  set) verified on bnow.net: /health stamps `836b46e`, Privacy 1.3 live and reacceptance
  enforced (live magic-link pass; analytics stayed denied), signed-out and signed-in free-GET
  contracts hold, /search $0, one paid Ask ($0.0089) produced ZERO ask_runs rows. Then
  `ASK_RUNS_SHADOW=1` + redeploy same commit (`dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT`): one paid
  probe Ask ($0.016) produced EXACTLY one shadow row (finished/answered, result persisted,
  units=1, `ask-units-v1:shadow`, billing_eligible=false, zero reservations/events/cache);
  free GETs and Search persist nothing. `ASK_BILLING_CUTOVER_AT` remains ABSENT. Cohort
  activation is NOT authorized by this entry — it requires a clean 48–72h soak
  (`scripts/ask-shadow-soak-check.ts`) plus an explicit operator decision. Report:
  `docs/reviews/AI-SEARCH-RELEASE-2026-07-21.md`.

- **2026-07-21 (OpenSanctions match-safety repair — fail-closed, branch only)** The matcher's
  `results.find(match) ?? results[0]` fallback persisted REJECTED name-only candidates as
  sanctions assertions (production holds `matched:false, sanctioned:true` rows), and downstream
  consumers ignored `matched`. Repaired on branch `opensanctions-match-safety` (no deploy/push/
  production writes/paid calls): (1) only `match === true` results populate assertive fields;
  rejected candidates fail closed to clean-unmatched with non-assertive nested diagnostics;
  (2) `src/lib/enrich/os-read.ts` is now the ONE read authority — a usable match requires
  not-stub + not-`NK-stub` + `matched === true`; neither `sanctioned:true` nor a topic alone
  ever suffices; stale rows are contained unmutated; (3) OpenSanctions presentation is
  ADMIN-ONLY (gate.ts `currentRole()`, fail-closed) as neutral candidate review — accepted/
  rejected labelled, score labelled identity-match confidence (never risk), topics uncollapsed
  (PEP ≠ sanction), name+type-only + not-human-reviewed qualification, checkedAt shown; no
  public badge/topic/score markup of any kind; (4) Ask receives NO OpenSanctions-derived
  categorical assertion — `sanctioned` projection removed from both retrievals and
  `RetrievedEntity`, `SANCTIONED` marker removed from both evidence blocks, unsupported sample
  question replaced; source-backed sanctions CLAIM text still flows (ruling 20 validator rules
  untouched). Binding until superseded: OpenSanctions data is candidate-identity screening
  metadata; sanctions/PEP assertions stay internal/admin-only pending a human-review workflow +
  product review; restoring any public assertion requires a new decision-log entry. Stale-row
  cleanup/re-match stays with #61 + separate spend approval. Gates: typecheck/lint clean, unit
  2,049/2,049 (161 files), build PASS. Review:
  `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`.

- **2026-07-22 (OpenSanctions match-safety — production release + smoke)** The branch-only
  repair above (`441ee09` = `c74aaba` fix + `441ee09` docs, atop the Ask release base
  `addd2be`) was merged to `main` fast-forward-only (linear, no merge commit; src tree
  byte-identical to the reviewed branch) and pushed (`addd2be..441ee09`). Release gates on
  merged main: `git diff --check` clean · typecheck clean · lint clean · unit 2,049/2,049
  (161 files) · build PASS (the 72/72 itest was proven on the reviewed branch's disposable
  Neon fork; not re-run — no tree drift). Deployed to production via CLI
  (`npx vercel deploy --prod`) as `dpl_E5ysiLJSg1ynNmqJkgmpDjrzZD32`, READY, aliased to
  bnow.net; `/health` stamps `441ee09`, DB OK. NO migration (release touches no `drizzle/`),
  NO env change (all Ask flags preserved: `ASK_RUNS_SHADOW=1`, retention 30/7/7,
  `ASK_BILLING_CUTOVER_AT` absent, every enforce/progressive/stream/cache/sessions/router flag
  absent). Ask shadow-soak window RESTARTED at 2026-07-22T01:10:37Z (Ask retrieval/evidence
  code changed). Smoke (through bnow.net, zero paid calls): signed-out `/entities` + `/ask?q=`
  → 307 `/signin`; **non-admin (accepted test account) sees ZERO OpenSanctions markup** on
  accepted/rejected entities + list — the pre-release non-admin `opensanctions.org/entities/`
  profile-link leak on entity 4 (present on `836b46e`) is GONE on `441ee09`; Ask sample now
  "What sanctions actions were reported recently?" and signed-in `GET /ask?q=` is prefill-only
  (200, zero POSTs); signed-in `/search` deterministic, no OpenSanctions markup, no `/api/ask`;
  runtime logs show only info GETs, no 5xx. Zero paid provider calls (only pre-deploy scheduled
  `openai_map` cron at 00:41Z), zero `ask_runs` from the GET-only smoke, zero DB writes
  (session counts unchanged; all queries read-only), no cron manually invoked. Rollback target =
  the prior Ask release `dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT` / `836b46e` (not needed). **Not live-
  verified:** the admin neutral-panel positive render — the sole admin identity has not accepted
  Privacy 1.3, so its session redirects to `/welcome/legal`; per authorization I did NOT
  manufacture an acceptance. That render is covered by `entities/[id]/page.test.tsx` (rejected
  labelled "rejected…never sanctioned"; accepted shows identity-match-confidence-not-risk,
  uncollapsed topics, datasets, profile link, "Checked … (UTC)", "name and entity type only",
  "not been human-reviewed") — smoke recorded PARTIAL on that one sub-check, not a regression.
  Data-reality note (does NOT edit the append-only branch-only entry above): the current
  production `entities.meta.opensanctions` set holds ZERO `matched:false, sanctioned:true` rows
  and zero rejected rows with promoted topics — 425 clean-rejected, 388 accepted-unsanctioned,
  200 accepted-sanctioned; the fail-closed read model is defensively correct regardless.
  Binding (reaffirmed, now LIVE): OpenSanctions is admin-only candidate-identity screening
  metadata; restoring any public sanctions/PEP assertion requires a human-review workflow +
  stronger identifiers + product review + a NEW decision-log entry; stale-row cleanup/re-match
  and paid rescore stay separately gated (#61 + spend approval). Cohort activation / Ask billing
  cutover remain out of scope and unauthorized by this entry. Report:
  `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`.

- **2026-08-03 (authorization-bypass repair — gates moved into the pages; branch only)**
  Authorization had been enforced ONLY in `layout.tsx` files, which is not an authorization
  boundary: layout and page render as sibling tasks, so a layout's redirect/404 never
  cancelled the page's task and the page's fully rendered output was still serialized to
  anonymous callers — recoverable via an `RSC: 1` GET (HTTP 200 flight payload) or from the
  body streamed inside the 307. TEN pages were affected: `/admin/access`, `/admin/ingest`,
  `/digests/[country]`, `/digests/[country]/[date]`, `/search`, `/entities`,
  `/entities/[id]`, `/registry`, `/registry/[id]`, `/middle-east`. Repair: the matching gate
  from `@/lib/gate` is now the FIRST statement of each page component, before any data
  access (`requireAdmin` on the two admin pages; `requireAcceptedUser` on digests/search/
  entities; `requireAdminOr404` on registry/registry-detail/middle-east); every layout gate
  was KEPT as defense in depth (zero layout files changed), and the entities pages'
  data-layer gating (non-admin SQL omits `e.meta->'opensanctions'`; detail short-circuits to
  `{state:"none"}`) plus `/signals` were left untouched. Ruling 21 records the standing rule.
  Evidence — a new real-HTTP regression test (`src/integration/authz-page-gate.itest.ts`,
  30 tests: bare GET + `RSC: 1` GET + an accepted-admin positive control per route, asserting
  on the response BODY, never the status code) run against a production build on a disposable
  Neon fork: BEFORE the fix 20 failed / 10 passed — every anonymous assertion failed on both
  request modes while all ten positive controls passed, so the failures were the vulnerability
  and not the harness; AFTER the fix 30/30 pass. Because that itest is excluded from `npm
  test` and skipped in CI when the Neon secret is absent, the four existing unit test files
  that had to mock `@/lib/gate` mock it as a SPY, not a no-op, and each adds a
  `page-level authorization gate` case asserting the gate was called and that its
  `invocationCallOrder` precedes the first query's — so the always-run suite (and the
  pre-push hook) now fails if a future refactor deletes or reorders a gate call "because the
  layout already gates it". Proven by mutation: deleting `await requireAcceptedUser()` from
  those four pages fails exactly the 6 new cases and no others. Their pre-existing
  OpenSanctions/money-path assertions still route through `currentRole()` and are unweakened.
  Gates: typecheck clean · lint clean · unit 2,055/2,055 (161 files) · integration 102/102
  (15 files, up from 72/14). Zero paid provider calls, zero production
  writes, no migration, no env change, no deploy, no push — branch/working-tree only.
  **Flagged, deliberately NOT fixed (legal/product track):** `requireAcceptedUser()` sends a
  signed-in-but-unaccepted user to `/welcome/legal`, so the same layout-only enforcement was
  also bypassing the CURRENT clickwrap on `/search`, `/entities` and `/digests`; the forced
  re-acceptance of 2026-07-21 (Privacy 1.3) means real users sit in that state now. This
  repair closes the content leak for those users as a side effect, but the acceptance flow
  itself was not touched and is not adjudicated here (OPEN-TASKS #75).

- **2026-08-03 (authorization-bypass repair — merged to main; deploy deliberately separate)**
  Operator authorized shipping the repair above. It was committed on branch
  `fix/layout-gate-authz-bypass` and merged to `main` (linear, fast-forward — no merge
  commit), then pushed. Gates re-verified on the exact merged tree by this session:
  typecheck clean · lint clean · unit 2,055/2,055 (161 files) · integration 102/102 (15
  files) against a disposable Neon fork, with every paid provider key blanked and
  `LLM_DISABLE=1` — zero paid provider calls, zero production writes, no migration, no env
  change. One supporting change rides along: `scripts/test-integration.sh` now forwards extra
  args to vitest so a single itest file can be run. **This session did NOT deploy** — the
  production deploy is a separate operator action, so between this entry and that deploy the
  Current-state snapshot above is authoritative: production still runs `441ee09` and remains
  vulnerable. Nothing else changed: no flag, cap, cron, or Ask/OpenSanctions behaviour is
  touched by this repair.
  **OPEN-TASKS #75 adjudicated won't-fix by the operator** in the same authorization: the
  clickwrap-bypass window opened by the 2026-07-21 forced re-acceptance needs no
  record-keeping or user-facing follow-up, because every existing account is one of the
  owner's own disposable email aliases — there is no third-party user-acceptance exposure.
  The acceptance flow itself is unchanged and was not touched. If real third-party users are
  admitted before that flow is revisited, the question re-opens as a fresh item.

- **2026-08-14 (operator admin promotion + X incident diagnosis)** Operator explicitly made
  `go@vociferous.ai` an administrator. Production `ADMIN_EMAILS` changed from
  `go@vociferous.nyc` to `go@vociferous.nyc,go@vociferous.ai`; the existing production release
  was redeployed as `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC` from the same `441ee09` artifact, with
  no code, migration, database, or other env change. The `.ai` identity accepted Terms 1.1 and
  Privacy 1.3 and live-opened `/admin/ingest`, proving the admin gate. The dashboard and database
  audit also resolved the suspected X-credit failure: the 2026-08-10 episode recorded provider
  request failures with `budgetStops=0`; cumulative X spend was $43.8075 of the $75 total cap,
  and the incident-day spend was $0.7386 of the $2.50 daily cap. Automatic scheduled catch-up
  resumed and inserted 560 + 9,069 + 764 = 10,393 documents on 2026-08-13, then returned to
  healthy hourly polls. This closes #66's natural recovery proof; #38 remains only for an
  independent confirmation that the external alert email was delivered.

- **2026-08-15/16 (Iran validation recovery — cap raise, observability release, citation
  auto-refresh, source roster, bounded backfill; operator-authorized unattended envelope)**
  Root cause reconfirmed: `openai_map` crossed the shared $10 all-time backstop at
  2026-07-29 08:40:34Z and 418 hourly map runs then recorded ok=true with zero claims while
  ru/ua/ir doc_claims starved, `openai_reduce` went idle from 07-30, ru/ua/ir digests fell
  back to the legacy engine (ir claims/day 8.8→~3; 2026-07-31 produced NO ir digest), and
  Iran coverage collapsed (60.4% avg Jul 15–23 → 23.2% Aug 2–10). Executed under the
  prompt's pre-approved envelope ($40 map all-time / $20 temporary daily to
  2026-08-17T13:00Z / ≤$20 new spend from the 2026-08-15T19:27:07Z baseline $15.6248
  all-OpenAI): (1) `MAP_SPRINT_USD_CAP=40` in all three Vercel envs — map-only ceiling;
  `LLM_SPRINT_USD_CAP=10` untouched (a shared raise would grant +$30 unrelated headroom per
  provider); daily elevation via auto-expiring `MAP_USD_CAP_DAILY_OVERRIDE_USD=20` +
  `_UNTIL=2026-08-17T13:00:00Z` (Production only; base `MAP_USD_CAP_DAILY=4` never edited;
  guard reverts BY CODE at the instant, boundary test-pinned; the override pair remains
  installed through the window — post-expiry removal is hygiene, not correctness). All
  three new envs plain/readable and read back exactly. (2) Release
  `dpl_9xyqCLfZn6n8WTifQ6BpgpV9wJja` deployed 19:27:49Z from branch
  `claude/iran-validation-recovery-20260815` (deployed tree = `70b2aa9`; later branch
  commits are docs-only) — also the FIRST deploy of the ruling-21 authz repair, verified
  live (anonymous bare/RSC bodies clean). Gates: typecheck/lint clean · unit 2,122/2,122
  (167 files) · integration 106/106 (17 files, disposable forks) · build PASS · mutation
  proof (disabling the health classification fails exactly its 4 tests) · zero paid test
  calls. Worktree CLI deploys ship no git metadata → /health stamp EMPTY on this
  deployment (#78; verified via data-dpl-id + behavior). (3) Observability now binding:
  non-run_cap budget stops record cron_runs.ok=false + machine-readable
  `budgetStopCategory`; steady runs evaluate per-theater/current-version freshness with
  episode-deduped alerts + one recovery notice (`map-health.ts`, state `map_health`);
  driver classifies run/daily/total/transport stops and takes `--theater`. First
  post-release run (19:40:37Z) mapped 536 claims and SENT the stale-theaters alert
  (Postmark-accepted; mailbox receipt unverified, as #38). (4) Citations: backup branch
  `backup-pre-iran-recovery-2026-08-15` (`br-polished-block-atu0r968`) first; then 42 Iran
  reports 2026-07-04→08-14 parsed (36 pending drained + 6 undiscovered days recovered at
  plain slugs — transient probe failures, not gaps), 3,688 parsed / 3,294 stored
  citations, ~46 new sources, transactional materialize (ir 3,654 rows); registry
  freshness 2026-07-03 → 2026-08-14. Go-forward: `validateDigest` parses endnotes from its
  own fetched HTML (`src/lib/isw/load.ts` is the single upsert authority; parse failure
  never downgrades a parsed report; ISW prose stays transient; discovery probes all four
  observed Iran slug shapes). RU's identical historical staleness = #79. (5) Sources
  (6 authorized slots): activated en.mehrnews.com (en), radiofarda.com (fa), sabanew.net
  (ar), sanaacenter.org (en), alaraby.co.uk/rss/politics (ar) + repaired presstv.ir to its
  item-identical presstv.co.uk mirror (broken .ir TLS; registry identity unchanged); all
  robots-clean with explicit ir lens pins (ruling 11); first fast cron inserted 205
  correctly-attributed docs. Rejected: shafaq.com (robots disallows feeds; 1,398 ir
  citations — #76 outreach), majalla/alhadath (no feed), almasdaronline (bot-walled),
  964media (gated). (6) Iran map backfill 2026-07-30→08-15 driven `--theater ir` through
  the deployed route: window 47,090 → 20 unprocessed (99.96%; stragglers to the hourly
  cron), 100% per-day disposition coverage under current versions, no cross-theater spill,
  no version drift. (7) 17 Iran military digests 07-30→08-15 regenerated onto mapreduce
  through the normal guarded persist path (claims/day ~3.0→~9.3; the missing 07-31
  created; FORCE_REGEN never set) and 16 dates revalidated honestly (matcher untouched):
  comparable-day mean coverage 20.8→43.5 (+22.7; 5 improved, 4 unchanged, 1 WORSENED —
  08-03 20→0 retained as-is), 6 newly-scorable days mean 28.8, all-16 mean 38.0 — below
  the pre-incident 60.4; 0% days remain (08-07/11/14). 08-15 has no ISW report (probed;
  not fabricated). (8) Spend: **$1.87 of the $20 envelope** (map +$1.6341 → total
  $11.6424 of the $40 ceiling; reduce +$0.1943; match +$0.0156); no second raise; no
  other paid provider touched. DISCOVERED PRODUCTION DEFECT: the map worker's session
  advisory lock strands on idle pgbouncer server connections (observed against the
  deployed route; safe-clear signature + interim janitor documented in the review; durable
  fix #77). At closeout ru/ua backlog (52K+19K docs) drains autonomously (~3 days at cron
  pace, inside the normal $4/day once the override expires) and `map_health` correctly
  reports `stale_ru,stale_ua` — Iran is recovered; the multi-theater corpus is NOT yet
  fully current. Binding until superseded: MAP_SPRINT_USD_CAP is the map worker's all-time
  ceiling (ruling 4 updated); a non-run_cap map budget stop is UNHEALTHY by contract; the
  override pair is the sanctioned bounded-recovery mechanism; branch is PR-only — `main`
  not pushed. Report: `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`.

- **2026-08-17 (Candidate B cron clustering — merged and deployed to production; 48–72h
  observation window open)** Operator-authorized supervised release of PR #4
  (`codex/neon-cron-cluster-phase1-20260816`, head `ab8150d`; gate + integration green on
  that SHA; both Phase-1 adversarial reviews PASS). Preflight re-verified base `26989f7` =
  local = origin main and live production `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC` (built from
  `26989f7`; `/health` `data-dpl-id` match). Merged to `main` at 2026-08-17T06:44:54Z as
  merge commit `9c5e9cb` (normal merge, reviewed commits preserved, source branch retained);
  merged diff re-verified = exactly three `vercel.json` schedule strings
  (telegram/x/mtproto `:10/:20/:35` → `1/2/3 * * * *`) + three documentation files. The
  Vercel project has NO connected Git repository (project inspect: no Git section; no Vercel
  check on the merge commit), so the single intentional production deployment was made via
  CLI from the clean merged root clone: `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`, READY 06:47:53Z
  (build 44s), aliased bnow.net, Vercel git metadata = `9c5e9cb` on `main`, `/health` stamps
  the commit (root-clone deploy — #78's worktree blank-stamp did not recur). Deployed cron
  table verified entry-by-entry: only the three minutes moved; the other 11 entries
  byte-identical. Safety: no migration, no env/cap/flag change, no production DB write by
  the release process (read-only checks only), no manual cron invocation, no paid provider
  call, PR #5 untouched. First natural Candidate B cycle PASSED (all `ok=true`,
  `finished_at` set, correct job identities, no 5xx/auth errors, no duplicate storm; known
  noise only — procurement proxy-block, one quiet telegram preview, GramJS #69 CastError):
  fast 07:00:04/163.1s; validate 07:00:29/15.3s (its normal `errors:1, validated:2`
  pattern, identical to 08-16); telegram 07:01:20→07:03:46/146.4s/114 inserted; x
  07:02:07→07:02:50/43.4s/115 inserted (lockSkips 0, budgetStops 0, requestFailures 0,
  lease released, watermark advanced to 07:02Z); mtproto 07:03:39→07:05:08/89.4s/295
  inserted (40 channel states advanced). The designed telegram⇄x⇄mtproto overlap occurred
  with zero contention. One-time transition gaps: telegram 51m / x 42m / mtproto 28m —
  inside the reviewed ≤~58m bound; no data loss possible (insert-gated watermarks). Map
  stayed at :40 and ran normally on the new artifact (07:40:42→07:43:43, 181.1s, ok, 377
  claims); the pre-deploy 06:40 map run also completed cleanly across the deploy moment.
  **Observation window OPEN from 2026-08-17T07:00:00Z** (closes 2026-08-19T07:00Z–
  2026-08-20T07:00Z; plan = Phase-1 §7): Neon cumulative anchor `active_time_seconds` =
  1,144,967 (~318.05h, Aug billing period) read at 06:45Z and still identical at 07:48Z —
  the consumption API LAGS, so the closing comparison must use settled values. The ~17–19%
  active-compute reduction remains an ESTIMATE until the window closes; PR #5 /
  model-routing stays undeployed during the window. Rollback target (verified healthy, not
  needed) = `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC`. Pre-existing conditions noted at baseline,
  NOT caused by this release: ru/ua/ir map backlog drain (`map_health` episode
  `stale_ir,stale_ru,stale_ua`), one stale unfinished `ingest:telegram` cron_runs row from
  08-15 14:10Z, and the `ask-events.itest.ts` failure recorded in Phase-1 §5. Standing
  corrections shipped with this closeout: AGENTS.md Live/repository + Crons lines,
  CURRENT-STATE Crons/Deploy/MTProto-minute lines, and the three stale ":20 poll" code
  comments → ":02" (`src/lib/usage/x-lease.ts`, `src/lib/adapters/x-gap-backfill.ts`,
  `scripts/x-gap-backfill.ts`). One supporting change rides along: eslint's global
  ignores add `.claude/**` beside `.workstream/**` (same declared category — isolated
  worktrees checked out inside the repo), so `npm run lint` and the enforced pre-push
  gate stay truthful from the root clone. Report addendum: Phase-1 review §10.

- **2026-08-19 (Candidate B cron clustering — 48h observation window CLOSED, verdict PASS;
  documentation only, no deploy)** The window opened by the entry above ran its full
  planned length, `2026-08-17T07:00:00Z → 2026-08-19T07:00:00Z` (deployment
  `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` became READY at 06:47:53Z; the formal window opened at
  the next whole hour, so every measured hour ran the clustered schedule). **Verdict: PASS.**
  Compute: hourly production-branch figures came from Neon's READ-ONLY branch-consumption
  endpoint (no compute wake); production is pinned at exactly 1 CU, so
  `compute_unit_seconds` is TREATED as active-compute seconds — that equivalence is our
  inference from the fixed 1-CU configuration, not something Neon asserts. Immediate
  pre-deploy 24h = 69,860 CU-s (19.41 active-compute h, 48.51 active min per wall-clock
  hour); post-deploy day 1 = 62,266 (17.30 h, −10.9%); day 2 = 58,480 (16.24 h, −16.3%);
  **full 48h = 120,746 (33.54 h, 41.93 active min/h) = −13.6%** against the DOUBLED
  pre-deploy 24h baseline (139,720 CU-s) — no true 48-hours-before window was measured, so
  the 48h figure is a doubled-24h comparison by construction. That is ≈5.27 active-compute
  hours saved over 48h, ≈2.64 h/day. **The pre-deploy ~17–19% estimate is superseded by the
  measured ~13–14% result** (13.6% for this window); Phase-1 §§1–9 arithmetic is left
  verbatim as the historical estimate. Counter-check against a merely quiet corpus: core
  ingest ROSE — 7,812 documents pre-deploy 24h vs 9,623 (+23.2%) and 9,325 (+19.4%) on the
  two post-deploy days, 18,948 over 48h = **+21.3%** vs the doubled baseline — so the
  saving is scheduling, not idleness. Operations: **398/398 expected scheduled runs
  succeeded** (fast 192 · telegram 48 · x 48 · mtproto 48 · map 48 · digest finalize 2 ·
  digest intraday 6 · validate 2 · enrich 2 · datadark 2), zero failed, zero killed, zero
  contention-skipped, zero NEW unfinished rows; all 48 natural map cycles completed; digests
  stayed current; no stub data surfaced. The five `finished_at IS NULL` rows still in
  `cron_runs` ALL predate the deployment (telegram 2026-07-28, three x 2026-08-13, telegram
  2026-08-15) — pre-existing stale rows, not Candidate B regressions. Zero production 5xx at
  Vercel; the only error-level runtime records were the known non-fatal GramJS peer-type
  `CastError` noise (#69); no new error signature; no pgbouncer / connection-exhaustion /
  statement-timeout / advisory-lock / `ECONNREFUSED` signature; DB snapshot showed zero
  deadlocks and zero conflicts. X checkpoint clear (no lock skips, budget stops, or request
  failures); MTProto current (140/163 channels fetched since deploy, zero resolve errors).
  `map_health` still reports `stale_ir,stale_ru,stale_ua` — **pre-existing backlog debt
  carried in at the deployment baseline, NOT resolved by this release and NOT a Candidate B
  regression.** `/health`: DB OK, build `9c5e9cb`, deployment
  `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`. Binding decisions: Candidate B REMAINS DEPLOYED (no
  rollback); the gate CLOSES at 48h — extension to 72h is NOT required; it is safe to
  proceed to the routing-baseline release stage (PR #5), which gets its own reconciliation
  against the resulting `main`, its own full retest, and its own separately deployed 24h
  routing-equivalence soak with every candidate-model variable unset. **This closeout is
  documentation only: merging it is NOT a deployment, and production continues to run
  `9c5e9cb` / `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` unchanged.** Report: Phase-1 review §11.

- **2026-08-20 (cloud-model routing seams reconciled onto post-PR #6 main — repository
  only; PR #5 stays DRAFT, nothing deployed)** PR #5's five audited commits
  (`8953008 359750c 030d526 f34aee8 0e469f7`, base `26989f7`) were replayed onto
  `origin/main` `181a218` as `6636c5a 7e14e26 82c41b7 d882fcf 851d3e7` — order, messages,
  authorship preserved; nothing squashed, reworded or reordered. `docs/PROGRESS.md` was the
  ONLY overlapping path and its single add/add region was resolved by placing both sides'
  blocks verbatim in timestamp order (01:50 main · 02:05 PR5 · 03:00 PR5 · 07:55 main ·
  08-19 main), zero deletions or rewrites on either side. Fidelity is mechanical, not
  asserted: `git range-diff` returns five 1:1 rows whose only changed lines (18) sit inside
  `## docs/PROGRESS.md ##`; the non-PROGRESS delta against the new base is byte-identical
  to the original delta against the old one (158,229 bytes, sha256 `5c533e7b…30d58`);
  31 of the 32 blobs are object-identical to `0e469f7`; no PR #4/#6 change is reverted.
  **What the merged repository now owns.** `src/lib/llm/model-config.ts` is the ONE
  authority for "which model does this analysis workload dispatch, at what reasoning
  effort" — map, reduce, digest, validation, entity_audit — resolved at CALL time
  (`<WORKLOAD>_MODEL` → `OPENAI_MODEL` → gpt-4o-mini; blank/whitespace = absent), so call
  sites no longer read model envs themselves and the reduce stage is decoupled from map's
  former module-load `MAP_MODEL` const. `src/lib/llm/analysis-registry.ts`
  (`analysis-reg-v1`) is a SEPARATE quality gate seeded with baseline-only approvals —
  gpt-4o-mini, effort absent, status `baseline`, one per workload — and ZERO
  `evaluated_candidate` entries. `src/lib/llm/pricing.ts` is the single analysis metering
  price authority. Dispatch requires BOTH pricing and approval: `workloadDispatchConfig()`
  throws `ModelConfigError` BEFORE any `SpendGuard.tryReserve()` and before any provider
  client is constructed when the effort is invalid, an effort is set for a non-reasoning
  model, the model is unpriced, or the exact (workload, model, effort) is unapproved
  (standing ruling 4 updated). Map additionally carries a HARD activation lock with NO env
  override: any non-baseline map model/effort is refused `MAP ACTIVATION BLOCKED`, because
  `mapExtractorVersion()`'s basis reads the map workload's resolution and a bump does not
  remap history (the worker selects `processed = false` only) — `REDUCE_*` never touches
  that version, and the all-absent basis is byte-identical to the historical one (ruling 13
  updated; OPEN-TASKS #33 remains the prerequisite). Ask is deliberately NOT routed here
  and keeps its scorecard-gated `ASK_ANSWER_MODEL`/`ASK_RERANK_MODEL`.
  **Money.** gpt-5-mini pricing is CORRECTED from $0.125/$1 to the official $0.25 in /
  $2.00 out per 1M tokens: the app had been under-metering it 2×. On deployment the Ask
  rerank reservation and recorded estimate DOUBLE — `rerankCeilingUsd()` $0.005125 →
  $0.01025, per-Ask worst case $0.067625 → $0.07275 — with no change in what OpenAI
  actually bills. Read-only production evidence taken 2026-08-20: `ASK_USD_CAP_DAILY` = $2
  (repository-recorded read-back; not decrypted), `openai_ask` has spent $0.0000 since
  2026-07-21 and its largest day ever is $0.2748 (2026-07-12), so even doubling every
  recorded dollar leaves ≥72% of the daily cap free; all-time `openai_ask` is $0.4468
  against the $10 `LLM_SPRINT_USD_CAP` per-provider backstop. Headroom is sufficient; it is
  re-checked at deploy time, not waived (OPEN-TASKS #84).
  **Nothing is activated and nothing is deployed.** All ten routing envs
  (`MAP/REDUCE/DIGEST/VALIDATION/ENTITY_AUDIT_MODEL` + `*_REASONING_EFFORT`) and
  `OPENAI_MODEL` are ABSENT in Production, Preview and Development (verified read-only
  2026-08-20 by name listing; no value added, changed, removed or decrypted), so every
  workload resolves to the gpt-4o-mini baseline. The dry-run inspector reports all five
  workloads `source=default effort=— priced=yes approved=baseline dispatch=ok`, and the six
  documented negative scenarios each fail closed with their exact reason.
  `mapExtractorVersion()` is byte-identical between `181a218` and this tree across all 30
  (track, theater) combinations, and matches all six live production (theater, track) pairs
  in `doc_claims`. Gates on the reconciled tree: `git diff --check` clean · typecheck clean
  · lint clean · unit **2,187/2,187 over 171 files** · production build PASS (dummy
  `DATABASE_URL`, never contacted) · integration **107/107 over 17 files** on disposable
  Neon forks, deleted afterwards, with `LLM_DISABLE=1` and every provider key blanked.
  ZERO paid provider calls, zero production database writes, no migration, no lockfile
  change, no env change, no deploy. **Merging PR #5 is NOT deploying it:** production
  continues to run `9c5e9cb` / `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` (verified `/health` DB OK,
  2026-08-20), so repository code is deliberately AHEAD of production until a separately
  authorized release with its own routing-equivalence soak. Binding until superseded:
  activating ANY candidate model requires its own paid representative evaluation, an
  `evaluated_candidate` registry entry, and explicit operator authorization — and for map,
  the #33 remap path first. Report:
  `docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md`.

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
| Sign-in policy | `SIGNIN_MODE` | **Production invite-only since 2026-07-15** (existing user OR admin allowlist OR approved access request) | Vercel environment |
| Cron auth | `CRON_SECRET` | **live** | (already set) |
| Auth.js | `AUTH_SECRET` | **live** (hashes magic-link tokens: rotating it invalidates every unclicked link) | (already set) |
| X via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live, gap-recovered; self-heal production-proven 2026-08-13** (`$75` sprint / `$2.50` daily; #66 closed, #38 retains external alert-email delivery proof only) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + caps | **live gap-fill; monthly accounting + fixed-cutoff rescore + claim-linked spend eligibility deployed** (rescore `f9aaa9e`; #17 spend subset `be0ebf1` / `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj` 2026-07-16, zero paid calls; fresh 2026-07-16: 1,012 eligible / 475 claim-linked / 232 missing-or-stub of which only 46 are billable; July ledger 780 calls / $85.8000; #17 match-score/caption, kind-safe cleanup #61 + paid #41 remain gated) | opensanctions.org |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` + `TELEGRAM_SESSION` (all in prod env) | **live** (session added 2026-07-11; first fetch + repeated hourly runs verified; registry top-120 ROCA roster) | my.telegram.org |
| PostHog (product analytics) | `NEXT_PUBLIC_POSTHOG_KEY` + `_HOST` (Production only) + `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID` (.env.local, ops) | **LIVE opt-in-only** (US project 512327 "BNOW.NET"; rollback = remove key + redeploy; billing limit configured 2026-07-15; project-membership review remains) | us.posthog.com |
| ACLED | `ACLED_API_KEY`, `ACLED_EMAIL` | stubbed | acleddata.com |
| Stripe | `STRIPE_SECRET_KEY`, … | flagged off | dashboard.stripe.com |
| Resend | `RESEND_API_KEY` | superseded by Postmark | resend.com |

## Next steps / open questions

1. **Operator:** `docs/SETUP-NEXT-WEEK.md` top-to-bottom — VERCEL_TOKEN regen and Stripe.
   bnow.net attach, Postmark sender cutover + DMARC, and MTProto are done.
   (OpenAI credits: done 2026-07-05; keep the billing alert.)
2. **`DIGEST_ENGINE=mapreduce` is SET in prod (flipped 2026-07-09) but no digest has
   actually used it since 2026-08-17** — every one falls back to legacy for want of
   current-version `doc_claims` (see the Analysis bullet; OPEN-TASKS #86/#88). The
   corpus-freshness work, not the engine flag, is the blocker: close #86 (the ~50%
   provider-rejected map batches) first, then re-check `provider_usage.openai_reduce`
   (expected ≈ $0.10–0.30/day against `REDUCE_USD_CAP_DAILY=2`) and the scoreboard.
   Rollback of the engine itself = remove the Vercel prod env var (or set `legacy`) +
   redeploy. Then: gulf theaters onto the map worker, the #33 remap path (the operator
   now EXISTS and is deployed — see the map-lease release — but has never been run),
   per-country mix policy.
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

- **2026-08-21 (PR #5 routing-seams 24-hour soak — CLOSED, PASS; independently reverified)**
  The formal soak window 2026-08-20T22:00:00Z→2026-08-21T22:00:00Z closed and was
  reverified from the production record rather than from the prior session's notes.
  Evidence: production is `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` (created 2026-08-20T21:00:27Z,
  READY, aliased `bnow.net` + `bnow-net.vercel.app`), `/health` HTTP 200 stamping `7336b9c`
  with DB OK; `origin/main` is `7336b9c4fe74211dd5d2c49c36449b9159953db4`, PR #5's merge
  commit. In-window `cron_runs`: **199 total, 199 ok, 0 ok=false, 0 with
  `finished_at IS NULL`, 0 errored** (96 ingest:fast, 24 each mtproto/telegram/x/map, 3
  digest:intraday, 1 each digest:finalize/validate/enrich/datadark). All **24/24 map runs**
  ok and carrying exactly ONE distinct dispatch identity —
  `gpt-4o-mini / reasoningEffort null / analysis-reg-v1 / baseline / workload map`. Digest
  and validation identities are baseline too, read from their durable homes (21 digests'
  `structured.stats.llmDispatch`; 3 `validation_runs.details.dispatch`, matcher
  `llm-majority`) — note that `cron_runs.counts.dispatch` is written by the map and
  entity-audit routes only, so digest/validation identity must be read from those tables,
  not from `cron_runs`. Zero routing-gate failures, zero 5xx in sampled runtime logs. NO
  routing variable exists in any Vercel environment: 86 env rows / 48 distinct names, none
  of `{MAP,REDUCE,DIGEST,VALIDATION,ENTITY_AUDIT}_{MODEL,REASONING_EFFORT}`, `OPENAI_MODEL`,
  or `ANALYSIS_ROUTING_*`. **PR5_SOAK_VERDICT=PASS.** This session changed no environment
  row. Standing text corrected in place: the Live/repository bullet named the superseded
  Candidate B deployment, and `docs/CURRENT-STATE.md` still described routing as
  "repository code, NOT deployed".
  **Three PRE-EXISTING production defects were found while closing the soak — none caused
  by PR #5, none fixed here, all newly tracked.** (a) ~50% of map micro-batches are rejected
  by the provider with `400 Invalid body: failed to parse JSON value`; the rate is 0%
  through 2026-07-15, 7.1% on 07-16, and a 45–54% plateau since, FLAT across every deploy
  boundary. Root cause identified: `mapDocLine` truncates with
  `body.slice(0, mapContentChars())` (`src/lib/analysis/map-prompts.ts:164`), a UTF-16 slice
  that can split a surrogate pair, and the surviving lone surrogate makes the whole request
  body unparseable — one bad doc kills its entire 20-doc batch (OPEN-TASKS #86, Tier 1).
  (b) `digest:finalize` records the same 400 in an in-run `errors` counter while
  `cron_runs.ok` stays true (#87). (c) Consequently **no digest has used the mapreduce
  engine since 2026-08-17** — all 11/day fall back to legacy for want of current-version
  `doc_claims`, with `map_health` reading `stale_ir,stale_ru,stale_ua` (#88); AGENTS.md and
  CURRENT-STATE.md both claimed mapreduce was the live engine and are corrected in place.
  A fourth, latent: the dedup gate's reference-side exact-md5 index is keyed on `undefined`
  because reference rows are cast `as DedupDoc[]` while the SQL aliases `content_md5` (#89,
  byte-identical on `main`, not introduced by any recent change).
