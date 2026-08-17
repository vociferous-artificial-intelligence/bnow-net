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
  `dpl_9xyqCLfZn6n8WTifQ6BpgpV9wJja` is the **2026-08-15 Iran-validation-recovery release**,
  deployed from branch `claude/iran-validation-recovery-20260815` (tree = commit `70b2aa9`,
  which contains `origin/main` `e66438b` — so the ruling-21 authorization repair is now
  LIVE, verified: anonymous bare + `RSC: 1` GETs on gated routes return no privileged
  body) plus the map-observability / citation-refresh / source-roster work; the branch is
  PR-only, `main` not pushed. No migration; all Ask flags preserved (`ASK_RUNS_SHADOW=1`
  soak, retention 30/7/7; the Ask soak window is unaffected — no Ask code changed). Code
  rollback target = `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC` / `441ee09`. **Caveat:** this deploy
  was made via CLI from a git WORKTREE, whose `.git` FILE defeats the CLI's git-metadata
  detection — `/health` renders an EMPTY commit stamp on this deployment (verify via
  `data-dpl-id` + behavior instead; OPEN-TASKS #78). Ask shadow-soak window still dates
  from 2026-07-22T01:10:37Z. Production DB backup branches:
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
- **Analysis:** versioned map stage feeds the production `mapreduce` digest engine; K=5 voting,
  majority-gid fill, publication-safety guard, and thin-regeneration guard are binding. Gulf
  theaters fall back to legacy where map claims are absent. Validation uses k=5 LLM matching
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
- **Quality/ops:** 2,123 unit tests / 166 files on main + 107 real-Postgres integration tests /
  17 files, all green (counts as of the 2026-08-17 PR #2/#4 merges; the corrected figures come
  from those merges' recorded gates). Production DB migrated through 0027 (2026-07-21, verified + idempotent).
  Enforced pre-push gate = typecheck+lint+test. Crons: fast */15; telegram :10; X :20;
  MTProto :35;
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

- **2026-08-17 (local-model ASK answer-stage eval — official vs safeguard-modified Gemma;
  offline harness shipped; branch only)** Executed `docs/designs/LOCAL-MODEL-ASK-EVAL-2026-08-17.md`
  on branch `claude/local-model-ask-eval-20260817` (not pushed; no deploy, no migration, no env
  change, production untouched). Shipped: (1) explicit `OPENAI_BASE_URL` knob in the gateway
  adapter (default construction byte-identical when unset; contracts test now env-scrubs) plus an
  env-gated `ASK_RAW_CAPTURE_PATH` pre-validator JSONL capture (records content/refusal/reasoning/
  finish/usage; sits AFTER `guard.record` — ordering now test-pinned via an fs mock); (2)
  `scripts/ask-eval.ts --offline-fidelity` — DB-free fidelity-only sweeps: DELETES
  `DATABASE_URL(_UNPOOLED)` at preflight (`.env.local` carries prod), injects an in-memory
  StageGuard (a sanctioned, offline-mode-ONLY SpendGuard bypass per the plan doc; every other
  mode's guard discipline untouched), refuses bare base configs (baseline-corruption + unguarded
  default-model spend), refuses hosted dispatch without an explicit `--allow-hosted`, refuses
  eval-set fusion under a reused config alias, and aborts unrecorded on provider `error`/`none`;
  (3) `docs/evals/ask-local-fixtures.json` — 12 FICTIONAL probe fixtures (5 over-answering with
  `acceptStates:["insufficient"]`, 7 conflict-content answerability) + a 59-case fixture-quality
  suite. Two adversarial review rounds (multi-agent; round 1 partially session-limited, its two
  dead dimensions re-run in round 2 on the remediated tree) drove the refusal hardening above
  AND a probe-instrument hardening pass (round 2 confirmed 7 latent findings, none affecting a
  recorded verdict: in-pattern negation lookbehinds for long-apposition/contrast-phrase
  negations, flat-fact strengthening guards, word-boundary figure anchors, Gemma-style refusal
  shapes, family-a refusal-vs-fabrication labeling, path-resolved fusion comparison — each
  pinned as a regression case; both probe arms re-run --fresh under the hardened instrument
  with verdicts unchanged). Gates: typecheck/lint clean · unit 2,188/2,188 (168 files). Run (Ollama gemma4 31B q4, pinned num_ctx 8192/seed 42/
  temp 0.1; 7 local arms + seed-43 check + hosted gpt-5 reference): total paid spend **$0.0444**
  (the gpt-5 arm; measured by the offline guard). Verdict (scorecard + raw-capture adjudication in
  `docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md`, captures committed under
  `docs/evals/raw-captures-2026-08-17/`): NO safeguard-removal signature in the modified build on
  this instrument — zero refusals in 72 answers on both variants, all 5 over-answering probes
  honestly declined by both, no over-assertion; the one real behavioral delta is official Gemma's
  deterministic reasoning-loop truncation on the namesake-collision fixture (modified answers it
  faithfully) and a general token-efficiency gap (445 vs 732 mean completion tokens). Two harness
  miscalibrations adjudicated from raw captures, deliberately NOT patched mid-experiment
  (follow-ups): the checked-in namesake fixture's `mustNotMatch` fires on faithful negations with
  long appositions (negator scope 40 chars), and the denial-prefix override converts
  deny-then-resolve answers into over-suppression (cost gpt-5 two mechanical fails; adjudicated
  8/8). Binding notes: local model ids stay OUT of `PRICES_PER_MTOK` (scorecard dollar figures
  for local arms are notional fallback); `ASK_ANSWER_MODEL` remains `gpt-5` in every Vercel env;
  no local model may be promoted without its own paid scorecard (router `hasScorecard` gate).

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
