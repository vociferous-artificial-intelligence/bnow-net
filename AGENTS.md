# AGENTS.md — persistent brain of BNOW.NET

Read this first in every fresh session. Keep it under ~300 lines; details live in `docs/`.

**Maintenance rule — ONLY the decision log is append-only.** Every standing section
(Current state, Architecture, directory map, Standing rulings, credentials, conventions,
protocol) MUST be corrected in place the moment it becomes wrong; append a log entry
recording that the correction happened. Never leave wrong standing text with the fix
buried in a log entry. The log keeps a rolling **7-day inline window** (D5); older entries
move **verbatim** to `docs/DECISIONS.md` (the append-only archive) — moving preserves
history; editing or summarizing it is forbidden. Keep this file under **150,000 characters**
(D5; a tooling limit warns above it). Run `bash scripts/check-decision-log-move.sh` after any
archive pass: it asserts every entry survived byte-identical, in exactly one file, in date
order.

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
(gpt-4o-mini), `anthropic` wired through `model-config.ts` for the `digest` workload only
(metered on its own `anthropic_digest` ledger row), selected solely by
`DIGEST_PROVIDER=anthropic` + an approved `DIGEST_MODEL` — no registry approval exists, so
it is dormant; key presence never selects a provider — `stub` deterministic fallback.
Which model each ANALYSIS workload dispatches — map, reduce, digest, validation,
entity_audit — is resolved at CALL time by `src/lib/llm/model-config.ts`, the one routing
authority, per (provider, model, effort); providers are allowlisted per workload in
`src/lib/llm/providers.ts` — `{openai}` everywhere except `digest`, which is
`{openai, anthropic}` (call sites never read `OPENAI_MODEL`/`*_MODEL`/`*_PROVIDER`
themselves); Ask keeps its own scorecard-gated models and is deliberately not routed there.
Every analysis workload resolves to gpt-4o-mini with no reasoning effort today.
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
                    map stage (map-worker, map-prompts, map-dedup, minhash),
                    anthropic-dispatch.ts (pure Messages request/parse, shared by the
                    provider and the eval seam), entity-audit-prompts.ts (the entity-audit
                    prompt + request, pure)
src/lib/llm/        analysis-model routing + money authorities: model-config.ts (the ONE
                    per-workload model/effort resolver + fail-closed dispatch gate),
                    providers.ts (provider vocabulary + per-workload allowlist — {openai}
                    everywhere except digest, which is {openai, anthropic}),
                    analysis-registry.ts (analysis-reg-v1 quality approvals — baseline
                    only, per workload×provider×model), pricing.ts (the single analysis
                    metering price table: chat models + EMBED_PRICES_PER_MTOK)
src/lib/isw/        crawler, endnote parser, hedging classifier, registry materializer,
                    edition-discovery (series/edition-aware reference discovery writing
                    only the 0028 benchmark tables — dormant, unscheduled)
src/lib/text/       well-formed UTF-16 truncation primitives (the #86 repair — the
                    shared destination for #97-family sites; map+reduce+digest adopted)
src/lib/citation/   ICS 206-01 citation artifact (ics206.ts, pure + client-safe) and the
                    T4 AI-tool-disclosure policy (disclosure-policy.ts, server-side, the
                    one place the gate is decided — withheld on every surface today)
src/lib/tradecraft/ IC-standards presentation layer (pure — no DB/provider/env/clock):
                    crosswalk.ts (the ONE ICD/ICS conformance crosswalk both /methodology
                    and docs/METHODOLOGY-TRADECRAFT.md read), descriptor.ts +
                    source-summary.ts (templated source descriptors, per-digest source
                    summary), estimative.ts (ESTIMATIVE_MAP_V1 — the signed ICD 203 band +
                    corroboration-derived confidence mapping, zero runtime imports)
src/lib/validation/ ISW scoreboard: versioned gazetteers (gazetteer/: ru-ua-v1 = the
                    production keyword path via the keywords.ts shim; iran-levant-v1 =
                    conflict-plane only, unwired) + majority-vote LLM matcher
src/lib/usage/      SpendGuard, llm-guard (caps + kill-switch), cron-run bookkeeping
src/lib/conflicts/  conflict/region validation domain library (pure except three named
                    files: reference-repo-sql.ts + observation-store.ts +
                    db-claim-sources.ts are Postgres backends, and live-matcher.ts is the
                    ONE module that may reach a provider — matcher-import-hygiene.test.ts
                    pins that in both directions; CONFLICT_REGISTRY, lanes, scorer,
                    match-contract). Imported in production by the dormant, unscheduled
                    conflict-validate route, src/lib/isw/edition-discovery.ts, and the
                    flag-gated /conflicts/** pages (through db-product-view.ts, which
                    imports no fixture module — db-product-view.test.ts scans the tree in
                    both directions) (design docs in docs/designs/)
src/lib/evals/      analysis-eval control plane: eval-guard (fail-closed caps), capture,
                    corpus admission, live-runner/CLI support (docs/evals/analysis/)
src/lib/embeddings/ embeddings client (validation/search vector retrieval)
src/lib/scoreboard/ validation scoreboard read models feeding /scoreboard
src/lib/registry/   source-registry read/view-policy helpers behind /registry
src/lib/analyst/    analyst-facing presentation helpers (signals, digests trust surface)
src/lib/analytics/  PostHog client + consent-gated event allowlist
src/lib/cron/       cron scheduling helpers (next-fire.ts); withCronRun (ruling 10
                    bookkeeping) lives in src/lib/usage/cron-run.ts
src/lib/logs/       Vercel log-drain receiver: HMAC signature verification, projection
                    into runtime_logs, retention sweep (built, unregistered — OPEN-TASKS #93)
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
                    OPEN-TASKS, BLOCKERS, SETUP-NEXT-WEEK, DECISIONS (log archive:
                    every decision entry older than the 7-day inline window),
                    STATUS-REPORT, TIME-MODEL, strategy docs, prompts/ (dated agent-session
                    prompt docs, e.g. the 2026-09-05 48h execution program),
                    evals/ (Ask + analysis eval datasets/results/scorecards — see the two
                    README.md files: docs/evals/README.md is the Ask eval README,
                    docs/evals/analysis/README.md is the analysis-eval one),
                    reviews/, designs/
drizzle/            migrations 0000–0030 + 9999_claim_source_trigger.sql (applies last)
data/               gitignored: cache/ (fetched pages), outbox/ (rendered emails)
```

## Current state — compact snapshot (verified 2026-09-03 for production, 2026-09-05 for
`main`; correct in place)

Detailed operational/product state lives in `docs/CURRENT-STATE.md` and is corrected in
place whenever reality changes. Historical narrative: `docs/PROGRESS.md` + `docs/reviews/`;
debt: `docs/OPEN-TASKS.md`; decision history: `docs/DECISIONS.md`.

- **Live/repository:** https://bnow.net · Vercel `bnow-net` / team `vociferous`; production
  is **`dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT`, built from commit `8a19ade`** — the 2026-09-03
  configuration-only release (X cap raise + #94 override removal; same code lineage,
  now including the 2026-09-01 docs-only commits atop `a4ed5cb`). **`main` has since moved
  far past `883e5e3` (corrected 2026-09-10 — see the 48-hour-program docs-sync entry at the
  end of this log for the full accounting).** PR #45 (`9854626`) and PR #46 (merge
  `883e5e3`, 2026-09-04) were eval-plane-only (five-vote validation parity + capture
  accounting, touching only `src/lib/evals/`, the eval CLI, and
  `src/lib/validation/llm-match.ts`'s pure extraction). PRs #47/#48 then landed
  2026-09-08 as squashed re-lands (`8cff524`/`81acadd`, `ac91519`/`d0c981e`) implementing
  the D1 outreach-roster removal. From 2026-09-05 the 48-hour execution program
  (`docs/prompts/2026-09-05-48h-00-INDEX.md`) merged **48 further PRs, #49–#96**
  (`git log --first-parent --merges 883e5e3..main`), delivering: the WS-2 analysis-model
  routing matrix generalized to a (workload, provider, model, effort) dimension with a
  dormant Anthropic `digest` seam (`anthropic_digest` ledger row; Haiku 4.5 + Sonnet 5
  priced; zero registry approval, so every Anthropic dispatch still refuses); WS-3
  validation-by-conflict infrastructure (migrations 0028–0030, an Iran/Levant gazetteer,
  a live conflict-observation pipeline behind the unscheduled `conflict-validate` route,
  a DB-backed `/conflicts/**` read model); WS-4 reliability proofs (#102/#103 downgraded
  from synthetic to fork-proven) and a built-but-unregistered log-drain receiver (#93);
  WS-7 tradecraft legibility (ICS 206-01 citation mode with its AI-tool disclosure built
  and dark per T4, ICD 203 estimative confidence, templated source descriptors); and two
  adversarial-audit remediation passes (steps 17/18 registers, remediated by step 23).
  **None of it is deployed or scheduled to deploy** — production is still `8a19ade` /
  `dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` (2026-09-03), migrations 0028–0030 exist only on
  `main` (production stays at 0027 applied), `CONFLICTS_UI` and every new cap env are
  absent from every Vercel environment, and step 26/27 (final audit, then operator
  deploy) gate whatever ships next. Full accounting:
  `docs/reviews/PROGRAM-48H-DOCS-SYNC-2026-09-07.md`. So **`main` is code-ahead of
  production by this entire 48-hour program**, not merely two eval-plane PRs — no
  redeploy has happened or is scheduled for any of it. The prior release
  in this lineage was the 2026-08-31
  four-PR stack deployed as three serialized releases during the map-flood OOM
  incident response: PR #38 (`52ea272`, #102 map flood bounds), PR #39 (`c0aa788`,
  #103 watchdog), and PR #40 + PR #37 together (`4ab388f` + `a4ed5cb`: the watchdog
  first-evaluation hotfix and the #97 embeddings/validation `wellFormedSlice`
  repair). Observation CLOSED PASS 2026-09-01T13:32Z: 132 crons clean, 15 map cycles
  (1,507 claims, 0 batchErrors), both natural checkpoints PROVEN (02:00Z finalize
  embed 11 req/76 units == 76/76 claims embedded; 07:00Z validate `llm-majority`
  ×5 votes ×3 theaters = 15 `llm_match` requests). **Rollback ladder** (never roll
  below `52ea272` — that reintroduces the flood failure): narrow #37 regression →
  `dpl_GxEcce4WiTkF1reDZknaPYDeubjn`/`c0aa788` (carries the state-dependent
  watchdog first-eval defect); watchdog/combined regression →
  `dpl_FJ33AS2DKMcme3qwjBiSTyNABxYh`/`52ea272`. Records:
  `docs/reviews/MAP-FLOOD-OOM-INCIDENT-2026-08-31.md` +
  `docs/reviews/EMBED-VALIDATE-RELEASE-2026-08-31.md`. The prior release — the
  2026-08-29 #97 Ask-family deploy `dpl_FT3Hdpt2ece4kxQHudxT2FST162p`/`6ba72b5`
  (PR #35: shared idempotent `normalizeAskQuestion` at all six
  Ask question boundaries, `wellFormedSlice` on the runs/cache/limits identity clips and
  sessions/rerank provider-bound truncations, array-`?q=` guard; deployed
  2026-08-29T01:29:35Z from the plain release clone after the 19:30Z predeploy gate;
  observation window 01:30→07:12Z CLOSED PASS — 50 scheduled runs clean, finalize/
  intraday/validate on the new release, zero Ask persistence/spend from free-GET
  probes; no natural paid Ask occurred, so the live money-path traversal is
  future-observable; record: `docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md`) —
  remains carried forward unchanged inside the current lineage. `/health` 200
  stamping **`8a19ade`** with matching `data-dpl-id`, DB OK; anonymous
  bare+`RSC: 1` bodies re-verified clean on the 2026-08-31 release this
  configuration redeploy carries forward. **`main` was == production at this deploy
  (2026-09-03); it no longer is — see the `883e5e3` correction above (2026-09-05).**
  The 2026-08-29 deploy carried the previously dormant PRs #31 (capacity-profile
  eval harness), #32 (QF-C hardening) and #33 (conflict soak instruments) into the
  production artifact for the first time; they remain INERT (no `EVAL_*` env exists,
  `CONFLICTS_UI` absent everywhere, conflict surfaces live-verified fail-closed 404
  with the evidence route gated). The 2026-08-24 release
  train (QF-A/QF-C/conflict evaluator, `143964a`) is carried forward inside this
  lineage; the conflict surfaces stay DORMANT (`CONFLICTS_UI` absent everywhere). QF-A's
  observation window is **CLOSED — PASS** (adjudicated 2026-08-27: 44/44 digests for
  digest dates 08-24→08-27 carry additive `structured.stats.evidenceRecency`,
  claim/document reconciliation exact on all 44 —
  `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-CLOSEOUT-2026-08-27.md`).
  Register: `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md`; operator decisions:
  `docs/reviews/OPERATOR-DECISION-PACKET-2026-08-28.md`.
  Previous production deployment detail:
  (PR #10, merge `0aa3d7d`), created 2026-08-23T14:08:53Z, READY, aliased `bnow.net` +
  `bnow-net.vercel.app` + `bnow-net-vociferous.vercel.app`; `/health` stamps **`0aa3d7d`**
  with DB OK (fresh CLONE, so the #78 blank-stamp trap did not apply). Its entire runtime
  delta over the previous release is `src/lib/analysis/map-prompts.ts` plus two test files —
  no migration, no env change, no schedule change, no model activated, same four extractor
  versions. **First natural cycle (14:40:20Z → 14:44:34Z, nothing invoked): `batchErrors`
  25 → 0, `llmRequests` == `batches` == 45, `processedMarked` 537 → 1,000, claims 201 → 498,
  fence 38, lost 0, released 1, discards 0, renewals 92 = 45+45+2, and all 20 known
  surrogate-poisoned documents reached a final disposition (31 doc_map_state rows, 21
  claims).** Its **24h recovery window is CLOSED — `UNICODE_RECOVERY_STATUS = PASS`
  (2026-08-23T15:00:00Z → 2026-08-24T15:00:00Z, closed 2026-08-24): 24 natural `:40`
  cycles, none invoked, `batchErrors` 0 on all 24 (0 of 767 batches, against a 56.8%
  baseline), lease fences 39 → 62 strictly +1 with lost 0 / released 1 / discards 0, one
  baseline dispatch identity, the same four extractor versions, no budget stop of any
  category, and no deployment, environment or cap change.** #86 is CLOSED. The window
  also carried the map corpus back to freshness: `map-health` sent a **recovery notice at
  2026-08-24T13:40Z** and `provider_state.map_health` now has `episodeKey: null`, with the
  eligible backlog down **25,857 → 7,292**. Code rollback target = `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` /
  `23a1280` (pure code rollback: no migration, no env change, and the repaired build writes
  rows under the SAME four extractor versions, which the old build anti-joins as
  already-mapped). Report: `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md`.
  Previous release: `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`, the **2026-08-22 QF Worktree B
  release** (PR #7),
  built from `main` merge commit `23a1280`, READY 2026-08-22T01:02:29Z and aliased to
  `bnow.net` + `bnow-net.vercel.app` + `bnow-net-vociferous.vercel.app`; `/health` stamps
  **`23a1280`** with `DB OK` (deployed from a fresh CLONE, not a worktree, so the #78
  blank-stamp trap did not apply). It replaces the map worker's session advisory lock with
  the durable `provider_state.map_lease` row (#77) and ships the version-aware remap
  operator (#33) — **which has never been executed**. No migration, no env change, no
  schedule change, no model activated; the MAP activation lock is untouched. Its formal
  24h LEASE SOAK is **CLOSED — PASS** (`LEASE_SOAK_STATUS=CLOSED — PASS`), window
  **2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z**: 24/24 natural `:40` cycles, all
  `acquired`, fences 2–25 contiguous, `lost=0`, `released=1` and `leaseLostDiscards=0` on
  every cycle, 1,541/1,541 renewals, claims reported 3,995 = `doc_claims` persisted 3,995,
  residue `{"fence": N}` with no token, zero advisory locks, one baseline dispatch identity,
  four extractor versions, no env/migration/remap — independent review PASS, post-window
  continuity 10/10 (fences 26–35). **#77 is CLOSED**; #33 (remap) is NOT — the operator is
  deployed but has still never been executed. The soak proves the steady single-holder path
  ONLY: contention, takeover, busy, loss-latch and discard never fired in production (#95),
  there is no retained in-window runtime log (#93), and `pg_locks` readings are
  point-in-time, not window coverage. See
  `docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md` §8 (checklist) and §9 (closeout).
  Code rollback target = `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` / `7336b9c` (a pure code
  rollback: the `map_lease` row is inert to that build, which never reads the key).
  Previous release: the **2026-08-20 workload-scoped model-routing release** (PR #5,
  `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` / `7336b9c`, created 2026-08-20T21:00:27Z),
  infrastructure only — no candidate model approved or activated, and NO routing variable
  in any Vercel environment (86 env rows / 48 distinct names, reverified 2026-08-22). Its
  formal 24h soak 2026-08-20T22:00:00Z→2026-08-21T22:00:00Z is **CLOSED — PASS** (199/199
  scheduled runs ok, zero failed/unfinished/errored `cron_runs`, 24/24 map runs, one
  baseline dispatch identity each for map/digest/validation, zero routing-gate failures,
  zero 5xx). Prior lineage: the 2026-08-17 Candidate B cron-clustering release
  (`dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`, `main` merge `9c5e9cb`, PR #4; the only
  production-file change is `vercel.json` — the telegram/x/mtproto hourly starts moved
  `:10/:20/:35` → `:01/:02/:03`; its 48h observation window
  2026-08-17T07:00Z→2026-08-19T07:00Z is **CLOSED — PASS**: measured **13.6%** Neon
  active-compute reduction over the full window, i.e. ~13–14% in practice, BELOW the
  pre-deploy ~17–19% estimate, with 398/398 scheduled runs green; Candidate B stays
  deployed, no 72h extension, no rollback). Lineage: the 2026-08-15
  Iran-validation-recovery branch (`70b2aa9`, incl. the ruling-21 authorization repair)
  was merged to `main` as PR #2 (`26989f7`) and redeployed 2026-08-16 as
  `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC`, which WAS the rollback target at that time (the
  current one is named in the Live/repository bullet above). `/health` stamped `9c5e9cb`
  on the Candidate B deployment (root-clone CLI deploy; the OPEN-TASKS #78 blank-stamp
  caveat applies only to worktree CLI deploys); the LIVE deployment today stamps
  `143964a` (the 2026-08-24 release train — see the Live/repository bullet).
  No migration; no env change;
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
  healthy hourly polls (#66 closed 2026-08-14; **#38 CLOSED 2026-08-23** — the X-health
  incident and RECOVERED emails of 2026-08-22 were read in the operator mailbox and match
  `cron_runs.counts.x_api` field-for-field, which `cron_runs` alone could not prove).
  MTProto is live/top-120 ROCA-only; non-fatal GramJS peer-type `CastError` noise remains #69.
- **Analysis:** `DIGEST_ENGINE=mapreduce` is set in Production and the versioned map stage
  feeds it; K=5 voting, majority-gid fill, publication-safety guard, and thin-regeneration
  guard are binding. **Mapreduce RESUMED naturally (corrected 2026-08-27; #88 CLOSED —
  PASS):** after digest dates 2026-08-17→08-23 shipped all-legacy (the #88 rolling-window
  hole, zero `openai_reduce` spend 08-17→08-24), the map worker closed the
  publication-front lag and the scheduled 02:00 finalize of 2026-08-25 (02:02:04Z, digest
  date 08-24) produced the first natural mapreduce digests since 2026-08-16 — no forced
  regeneration or `FORCE_REGEN` observed, no ordering or schedule change. Since then the daily
  engine matrix is stable at **6 mapreduce** (ru military + elite_politics, ua military,
  ir military + elite_politics + nuclear) **+ 5 legacy** (il/sa/ae/qa/om military) of the
  11 digests/day, with `openai_reduce` back in its expected $0.10–0.30/day band. The
  automatic legacy fallback remains by design, so a future sustained map lag would regress
  the mix again — detection is `map_health` freshness staleness, not a digest-engine
  alert. Closeout evidence:
  `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-CLOSEOUT-2026-08-27.md`.
  **#86 is CLOSED (repair deployed 2026-08-23 as PR #10 /
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`; 24-hour recovery window PASS, closed 2026-08-24):**
  `wellFormedSlice` + `dropIsolatedSurrogates` keep the same `MAP_CONTENT_CHARS` code-unit
  ceiling and the same four extractor versions, so no remap was needed; map micro-batch
  rejection went **56.8% → 0.0%** and has stayed there for 767 consecutive batches, and a
  corpus-wide replay finds **zero** of the 7,292 still-unprocessed eligible documents
  capable of reproducing it. Map freshness RECOVERED during that window
  (`map-health` recovery notice 2026-08-24T13:40Z; `episodeKey` null; backlog 25,857 →
  7,292). **#87 is CLOSED (both halves deployed 2026-08-28 and observed):** the digest
  doc line cannot emit malformed UTF-16 (`digestDocLine` + `wellFormedSlice`, R1/PR #28;
  the 04:00Z intraday exercised it clean), and a run carrying REAL per-item failures now
  records `ok=false` with a machine-readable `counts.degraded` while `error` stays NULL
  (R2/PR #29 — routes declare, `withCronRun` flips; map failures classified into
  content-safe `batchErrorClasses`; validate's benign ISW-not-published returns split
  into `unvalidated` and no longer read as errors). Honest caveat, recorded: the flip is
  synthetic- and wiring-proven (a real-cycle itest fails a live dispatch and asserts the
  classification lands); no natural nested-error event has occurred since deploy, so the
  first natural flip remains future-observable via audit-cron's FAIL list. **#98 is
  CLOSED (R3/PR #30, with natural proof):** the startup timeout sweep classified 9
  genuinely-dead historical rows — including a REAL prior-day telegram hang — with zero
  false sweeps; `finished_at` is never fabricated (ruling 10 intact); no email channel
  by explicit scope decision (visibility = cron_runs + audit-cron + the soak-check's
  timed_out taxonomy). **#97 umbrella remains OPEN, narrowly (corrected 2026-09-10):** the
  reduce, digest, Ask-family, `embeddings/client.ts` and `validation/llm-match.ts`
  provider-bound sites are all FIXED AND DEPLOYED (2026-08-28/29). The formerly-inert
  anthropic site's dormant doc-line clip was repaired 2026-09-06 (step 09 of the 48-hour
  program, on `main` only, not deployed) alongside the seam's key-alone activation bypass.
  Remaining: the `ASK_SESSIONS`-gated residuals only.
  Validation uses k=5 LLM matching
  with keyword fallback and exposes coverage/divergence/timeliness/thin-source metrics.
  **2026-07-29→08-15 map outage (recovered; residual backlog drained to ~7K docs by 2026-08-24, #86 track):**
  `openai_map` crossed the shared $10 all-time
  backstop at 2026-07-29 08:40Z and 418 hourly runs then recorded `ok=true` with zero claims
  while ru/ua/ir doc_claims starved and ru/ua/ir digests silently fell back to the legacy
  engine (Iran claims/day 8.8→~3; 2026-07-31 got no ir digest at all). The 2026-08-15
  release makes any non-run_cap budget stop record `cron_runs.ok=false` with a
  machine-readable category, adds per-theater/current-version freshness + episode-deduped
  operator alerts (`map-health.ts`, state in provider_state `map_health`), and the map cap
  is now `MAP_SPRINT_USD_CAP=40` (map-only; `LLM_SPRINT_USD_CAP=10` unchanged for every
  other path). Recovery details: the 2026-08-15 decision-log entry.
- **Analysis model routing (PR #5 — LIVE in production since 2026-08-20,
  `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` / `7336b9c`, 24h formal soak CLOSED PASS
  2026-08-21; carried forward by the 2026-08-22 QF-B release):** the workload-scoped
  routing seam is deployed: `src/lib/llm/model-config.ts` resolves (provider, model, effort)
  per workload at call time (`<WORKLOAD>_PROVIDER` → openai; then `<WORKLOAD>_MODEL` →
  `OPENAI_MODEL` → gpt-4o-mini, the last two for provider `openai` ONLY) and FAILS
  CLOSED — before any SpendGuard reservation or provider-client construction — on a
  provider outside the workload's `providers.ts` allowlist, a non-openai provider with no
  explicit `<WORKLOAD>_MODEL`, an invalid effort, a model unpriced FOR THAT PROVIDER, or a
  (workload, provider, model, effort) with no
  `analysis-reg-v1` approval; `src/lib/llm/analysis-registry.ts` holds baseline-only
  approvals (gpt-4o-mini, effort absent, status `baseline`) with ZERO
  `evaluated_candidate` entries; map carries a HARD activation lock with no env override.
  **FIFTEEN routing envs, not ten** (corrected 2026-09-11, AUD-04 — the provider dimension
  landed on `main` 2026-09-08 and this list was never widened): each of the five workloads
  `MAP` `REDUCE` `DIGEST` `VALIDATION` `ENTITY_AUDIT` carries `_MODEL`, `_REASONING_EFFORT`
  AND `_PROVIDER`, all fifteen declared together in `WORKLOAD_ENV`
  (`src/lib/llm/model-config.ts:74-84`), plus `OPENAI_MODEL` as the openai-only global model
  default. `ANALYSIS_PROVIDER` is a SIXTEENTH name that
  `model-config.ts` deliberately does NOT read — it keeps its own stub/anthropic meaning in
  `src/lib/analysis/provider.ts` — and belongs in the same read-back for that reason. The
  ten `_MODEL`/`_REASONING_EFFORT` names and `OPENAI_MODEL` were verified ABSENT in
  Production, Preview and Development read-only on 2026-08-20, so every workload resolves to
  the historical baseline and `mapExtractorVersion()` stays byte-identical to the deployed
  corpus's — all six live production (theater, track) pairs re-verified against `doc_claims`
  on 2026-08-20. **The five `_PROVIDER` names have NEVER been read back in any Vercel
  environment** — they did not exist in code on 2026-08-20 — and `DIGEST_PROVIDER` is the
  single variable that can select a second vendor. That read-back is register gap G3 and is
  step 27's hard gate; until it runs, "no routing variable exists in any Vercel
  environment" below is a 2026-08-20 fact about ten names, not a current fact about fifteen.
  **Deployed, but nothing is activated:** the seam only makes the gate
  enforceable — no candidate model is approved (`analysis-reg-v1` holds baseline-only
  entries, zero `evaluated_candidate`), no routing variable exists in any Vercel
  environment, and activating any candidate still requires its own paid representative
  evaluation, a registry entry and explicit operator authorization — plus, for map, the
  #33 remap path first (#81). Corrected in place 2026-08-23: this bullet had continued to
  say the seam was un-deployed repository code and that production ran `9c5e9cb`, both of
  which stopped being true at the 2026-08-20 release.
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
- **Quality/ops:** **4,599 unit tests / 293 files** green (measured 2026-09-10 on
  `619986c` — `main`'s tip at the close of the 48-hour program's Stage 3, before this
  docs-sync step's own commits; typecheck + lint clean, 0 errors / 3 pre-existing
  unused-var warnings). Historical gates: 3,590/246 on 2026-09-04 (`774906f`); 3,508/241
  on the 2026-08-31 PR #37 head; 3,329/231 on the 2026-08-24 release train `e359c61`.
  Integration tests run per-PR on disposable Neon forks throughout the 48-hour program (no
  single aggregate count is current across ~50 merged PRs — each step report in
  `docs/reviews/` states its own fork name and pass count); the last tracked aggregate was
  **160 tests / 25 files** on 2026-09-03 (corpus-v2). **Production DB migrated through
  0027** (2026-07-21, verified + idempotent) and has NOT moved since; migrations **0028**
  (`benchmark_report_editions` + `benchmark_series_days`), **0029** (`runtime_logs`),
  **0030** (`conflict_validation_observations`) exist only on `main`, unapplied to
  production (OPEN-TASKS #111).
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
   `X_DAILY_USD_CAP`, `OPENSANCTIONS_CALL_CAP`, `CONFLICT_MATCH_USD_CAP_DAILY` (daily,
   the dormant conflict shadow matcher's own `llm_conflict_match` ledger row — NO
   default, so unset means the paid rung refuses before any reservation and the keyword
   rung scores instead; must exist in all three Vercel environments BEFORE the
   unscheduled `conflict-validate` cron line is ever added to `vercel.json`). Set a new
   cap env in ALL Vercel envs BEFORE deploying the guard that reads it, or you stop that
   pipeline. An unpriced embedding model is refused before `tryReserve()` the same way
   (2026-09-06, `EMBED_PRICES_PER_MTOK`); Ask then degrades to lexical-only retrieval with
   zero reservations (ruling 9).
   **Analysis dispatch additionally fails closed on CONFIGURATION** (2026-08-17 routing
   seam, generalized 2026-09-08 to a provider dimension): `workloadDispatchConfig()`
   refuses — before `tryReserve()` and before any provider client is built — a provider
   outside the workload's allowlist (`src/lib/llm/providers.ts`; `{openai}` everywhere
   except `digest`, which is `{openai, anthropic}`), an invalid `*_REASONING_EFFORT`, an
   effort set for a non-reasoning model, a model not priced FOR THAT PROVIDER in
   `src/lib/llm/pricing.ts`, or a (workload, provider, model, effort) with no
   `analysis-reg-v1` registry approval. `pricing.ts` is the SINGLE price authority for
   analysis metering (the Ask registry parity-pins it), and pricing is necessary but NOT
   sufficient: an entry there means a model CAN be metered for that provider, an entry
   in `analysis-registry.ts` means it is approved to serve production. **The Ask Auto
   money path is a separate gate, not routed through `model-config.ts`:** it additionally
   checks `hasScorecard()` and degrades (provider `"unscorecarded"`) rather than
   dispatching an unscorecarded answer model (2026-09-06), unchanged when no environment
   override exists.
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
    plus explicit operator activation authorization are required first. **Provider
    dimension (2026-09-08):** a map PROVIDER other than `openai` is refused by the
    `providers.ts` allowlist before the lock is even reached; a provider change would
    also change the extractor-version basis, so the same lock covers it structurally.
    Read-side consumers that NAME a vendor (`mapreduceProviderTag()`, `AnthropicProvider
    .name`) scope it by the resolved dispatch's `providerAllowed` exactly as the model is
    scoped — a refused vendor keeps the OpenAI-shaped tag, so a Claude-synthesized digest
    can never be stamped `openai:…` once the digest allowlist admits Anthropic.
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

Entries dated before **2026-09-07** are archived **verbatim** in `docs/DECISIONS.md` — the
twelfth pass (2026-09-11) moved the whole 2026-09-06 run, on top of the eleventh pass's
eleven earliest 2026-09-05 entries. Three 2026-09-05 entries stay inline and are the log's
earliest: the program-authorization entry, the worktree-cleanup entry and the
2026-08-17-branches-landed entry. See the dated pass entries below; distilled still-binding
decisions live in Standing rulings above.
Append new entries at the
END OF THIS SECTION in date order — NOT at the end of the file. (The former end-of-file
convention, which left Conventions / Credentials / Next steps / Operating protocol wedged
mid-log, was retired by the eighth archive pass on 2026-09-07; OPEN-TASKS #92.)

- **2026-09-05 (48-hour execution program authorized and kicked off)** The operator committed
  to a 48-hour, twelve-worktree agent execution program sequencing the CTO roadmap handoff
  (`docs/prompts/2026-09-05-cto-roadmap-handoff.md`, base `origin/main` `883e5e3`) into 28
  numbered step prompts plus a governing index and common preamble
  (`docs/prompts/2026-09-05-48h-00-INDEX.md`, `docs/prompts/2026-09-05-48h-COMMON.md`),
  committed to local `main` as `afeef2b` (handoff) → `a912c7a` (index + preamble + 28 prompts)
  → `4e5b00f` (operator comments on the H0 decision sheet) — none of these three commits had
  been pushed to `origin/main` when the program began. Binding scope for every session in the
  program (COMMON §3, INDEX preamble): no deploy, no Vercel environment change, no production
  write, no spend, no edit to `docs/evals/analysis/*` / the scorer / the registry approvals /
  the map lock, without a named operator authorization recorded in this log; where the handoff
  says DECISION, the session lists it and does not decide; **nothing deploys before step 26's
  go/no-go** (INDEX §0 item 4, Wave 5). AGENTS.md write-lock: only steps 01, 02, 03, 15 and 25
  edit AGENTS.md during the window, and even those draft rather than append decision-log
  entries, except for the standing-text corrections their own PR makes necessary. This entry
  exists so a later session or audit finds, in the append-only log itself, that the program ran
  under operator authorization and its own written constraints.

- **2026-09-05 (worktree estate cleanup; docs only)** A month of accumulated git worktrees,
  clones and unpushed branches was audited and cleared from the main checkout. No source,
  scorer, fixture, dataset, prompt, cap, env, migration, cron, deploy, database or
  paid-provider change; zero paid provider calls; nothing merged to `main`.
  **(1) Preservation first.** Sixteen local branches that existed on NO remote ref were
  pushed verbatim as archival branches (`--no-verify`; the local hook would have run the
  suite against the wrong tree, and GitHub CI fires only on `main` pushes and PRs):
  `claude/business-planning-20260817`, `claude/local-model-ask-eval-20260817`,
  `codex/analysis-eval-control-plane-20260817`,
  `codex/evidence-quality-observability-20260817`,
  `codex/conflict-evaluations-integration-20260817`,
  `codex/conflict-evaluations-final-audit-20260818`, the eight
  `codex/conflict-evaluations-p0…p7` phase branches,
  `codex/quality-foundation-integration-20260817` and
  `codex/quality-foundation-final-audit-20260818`. All sixteen verified present on `origin`
  afterwards. Fourteen carried history already landed on `main` via rebased PRs; the two that
  existed nowhere else were landed by PR #47
  (`docs/land-aug17-branches-20260905`) — see the separate 2026-09-05 decision-log entry for
  what that PR did and did not land.
  **(2) Worktrees removed: 31**, all with plain `git worktree remove` (no `--force`, so a
  dirty tree would have refused; none did) — 5 standalone siblings of the main checkout,
  24 under `/Users/go/code/bnow-net-worktrees/`, 1 at `.claude/worktrees/`, and 1 at
  `.worktrees/`. Both container directories were then removed empty. Every removed tree had
  zero modified tracked files; the only untracked content anywhere was two one-off
  measurement scripts (`scripts/_measure-8[79]-baseline.ts`), preserved as `.txt` under
  `docs/reviews/scratch-scripts/` so `tsc`/`eslint` never see them.
  **(3) Also removed:** the stale deploy clone `bnow-net-deploy-20260823` (clean, 0 commits
  ahead of `origin/main`, `.env.local` held only a short-lived `VERCEL_OIDC_TOKEN`);
  the npm/pnpm strays `.pnpm-store/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` from the main
  checkout (npm remains the package manager — `package-lock.json` tracked, no
  `packageManager` field); `.git/_to_delete_locks/` (26 quarantined lock and temp-object
  files from a 2026-08-17 folder-mount audit run — deleted after `git fsck` reported no
  corruption, only expected dangling objects); and
  `.claude/worktrees/business-planning-20260817`, a 64M ORPHAN worktree from a remote-session
  mount (its `.git` file pointed at a nonexistent `/sessions/rcw-…` gitdir, so it was never
  registered here) — verified to be a stale checkout of `9c5e9cb` with zero unique content
  before deletion. `git worktree prune` run after; `git worktree list` now shows only the
  main checkout, and `git fsck` re-reports clean.
  **(4) Untouched, by rule:** the release clone `bnow-net-rel-20260823` (deploys come from
  it) and the five artifact folders `bnow-net-audit-evidence-20260818`,
  `bnow-net-eval-campaign-20260903-artifacts`, `bnow-net-eval-corpus-v2-draft-20260827`
  (+ its `.MANIFEST.sha256` sibling), `bnow-net-eval-corpus-v2-review-20260903`,
  `bnow-net-eval-successor-1a-20260904-artifacts` — the sole write to any of them was three
  scratch scripts added to one `reports/` subfolder (below).
  **(5) Data preserved before removal.** All six gitignored live eval results were
  byte-compared against their artifact backups and confirmed IDENTICAL before their worktrees
  were removed: successor-1a's `live-{map,digest}-v2-gpt-4o-mini.json` +
  `live-validation-v2-gpt-4o-mini+votes5.json` against the
  `20260905T002223Z-final-closeout` backup, and the campaign's
  `live-{map,validation,digest}-v2-gpt-4o-mini.json` against
  `20260904T135208Z-B3-digest-complete-PAUSED`. The campaign worktree's three scratch tools
  (`eval-env.ts`, `ledger.ts`, `verify-cell.sh`) existed nowhere else and were copied to
  `bnow-net-eval-campaign-20260903-artifacts/reports/scratch-scripts/` (`cmp`-verified; they
  hold no literal secret — the only match was `Bearer ${process.env.NEON_API_KEY}`). The
  successor worktree's five `.cache/eval-scratch/` scripts needed no action: they were already
  byte-identical in that folder's own `reports/scratch-scripts/`. Every worktree `.env.local`
  was hash-compared and found to be a duplicate of the main checkout's or the release clone's,
  EXCEPT the campaign worktree's, which held the only local copy of the eval
  `OPENAI_API_KEY`; that one line was appended to the main checkout's `.env.local` without
  being displayed (the file now carries exactly one `OPENAI_API_KEY=`). The
  iran-validation-recovery worktree held 42 cached ISW report pages (17M) present nowhere
  else, copied into the main checkout's gitignored `data/cache/pages/` rather than lost to a
  refetch, per the standing scraper convention that a URL is never fetched twice.
  **(6) Local branches:** after moving the checkout to `main`, `git branch -d` (safe form
  only) deleted 27 fully-merged branches and REFUSED 17 — the 16 archival branches plus the
  new `docs/operator-notes-20260905`. It also deleted the local
  `docs/land-aug17-branches-20260905`, which `-d` permits once a branch is fully merged into
  its own upstream; the remote branch and PR #47 were unaffected and the local ref was
  restored from `origin`.
  **(7) Checkout state and disk:** the main checkout moved off the stale
  `claude/local-model-ask-eval-20260817` (176 behind) and fast-forwarded to `main`
  (`883e5e3`), with `npm ci` re-run. `/Users/go/code/bnow-net*` went from **25G to 2.5G**.
  Operator notes that had been sitting uncommitted in the main checkout — a
  `docs/PARTNER-STRATEGY.md` edit, `docs/GO-NO-GO-REGISTER-2026-08-23.md`,
  `docs/OUTREACH-ROSTER-2026-08-23.md` and eleven 2026-08-17 roadmap prompt docs — are
  preserved by this branch's PR; five other prompt docs were byte-identical to files already
  on `main` and were simply dropped. The outreach roster carries third-party names, work and
  personal email addresses and phone numbers; nothing was redacted, and the PR flags it so the
  operator can decide whether that roster belongs in the repo at all.

- **2026-09-05 (2026-08-17 local-model Ask eval artifacts landed — DOCS ONLY; harness code
  deliberately withheld)** The evaluation artifacts from branch
  `claude/local-model-ask-eval-20260817` (commit `8a0ca89`, 176 commits of drift behind
  `origin/main`) are landed VERBATIM as 19 files under `docs/designs/` and `docs/evals/`:
  the design doc, `LOCAL-ASK-SCORECARD-2026-08-17.md`, `ask-local-fixtures.json`, the eight
  `raw-captures-2026-08-17/*.jsonl` captures, and the eight `results-v2-k60+gemma-*.json` /
  `results-v2-k60+gpt-5.json` result files (all credential-scanned clean). The commit's
  `AGENTS.md` and `docs/PROGRESS.md` edits were NOT replayed — both changed substantially on
  main since the merge-base — and remain viewable on the pushed branch; this bullet replaces
  them. **Five source files from that commit were deliberately NOT landed:**
  `src/lib/ask/local-fixtures.test.ts` and `src/lib/llm/openai.test.ts` (new), and
  `src/lib/llm/openai.ts`, `scripts/ask-eval.ts`, `src/lib/llm/contracts.test.ts` (modified).
  Reason: `src/lib/llm/openai.ts` is the production LLM provider dispatch path — the change
  adds an explicit `OPENAI_BASE_URL` client override and a post-`guard.record`
  `ASK_RAW_CAPTURE_PATH` JSONL dump of pre-validator model output — and a change there needs
  its own rebased, reviewed PR rather than a ride on a docs/worktree-cleanup change; the two
  new test files only exercise that seam and would be red or meaningless without it. All five
  stay preserved and linkable at `claude/local-model-ask-eval-20260817` @ `8a0ca89`; landing
  them is tracked as OPEN-TASKS #108. Scorecard headline (from the landed file, not restated
  from the branch): the safeguard-modified Gemma shows **no safeguard-removal signature** on
  this instrument — zero provider-level and zero textual refusals across all 72 recorded
  answers, both variants declining all 5 over-answering probes and answering all 7
  conflict-content probes with attribution intact; the single genuine behavioral difference is
  official Gemma's deterministic reasoning-loop truncation on the namesake-collision fixture
  (seed 42; it escapes at seed 43), which the modified build answers faithfully, alongside a
  general token-efficiency gap (445 vs 732 mean completion tokens). Binding notes from that
  work are unchanged and NOT re-litigated here: local model ids stay out of `PRICES_PER_MTOK`
  (local-arm dollar figures in the scorecard are notional fallback), `ASK_ANSWER_MODEL` remains
  `gpt-5` in every Vercel env, and the router's `hasScorecard` gate means nothing in these
  offline artifacts can promote a local model. No source, scorer, fixture, dataset, prompt,
  cap, env, migration, deploy, or paid-provider change accompanies this landing.

- **2026-09-07 (R7 addendum — Claude Sonnet 5 priced at $2.00 / $10.00; the $3/$15 increase was
  cancelled)** The 2026-09-06/07 R7 entry held Sonnet 5 out of `PRICES_PER_MTOK` because the
  operator's list said **$3.00 / $15.00** while the vendor's pricing page showed **$2.00 /
  $10.00**, and the 2026-08-20 gpt-5-mini precedent forbids guessing. The vendor's pricing page
  resolves it directly: the $2/$10 rate announced at launch as introductory pricing through
  **2026-08-31 is now the standard price**, and *"the previously scheduled increase to $3/$15
  per million input/output tokens on September 1, 2026 will not occur."* The operator's figure
  was therefore the announced-but-cancelled increase, not a stale page — the two sources never
  disagreed about the current rate, only about whether a scheduled change happened. **Sonnet 5
  is priced at $2.00 in / $10.00 out per 1M tokens**, entered as its own row with
  `ModelPrice.provider` set explicitly, per the R7 rule that the table is per-model rows keyed
  by the exact API identifier. **Two riders.** (1) The R7 entry's own standard was confirmation
  against *actual console billing*, on the ground that a documentation page is not ground
  truth. That standard is relaxed here because the vendor statement does something a console
  spot-check cannot: it names the exact contradicting figure and cancels it, explaining the
  discrepancy rather than sampling around it. A one-invoice spot-check at the first real
  Anthropic spend is still cheap and is recommended, not required. (2) **The exact API
  identifier is still needed** — Haiku went in as `claude-haiku-4-5-20251001`; the Sonnet row
  needs its dated equivalent before the PR body is written. Unblocks the remainder of PR-2.2-B2
  (step 20b).

- **2026-09-07 (R7-b — the Sonnet 5 pricing row is keyed to `claude-sonnet-5`)** The Sonnet 5
  pricing row is keyed to **`claude-sonnet-5`**, the operator's decision: it is the correct
  identifier for direct Anthropic API access, and it is what the vendor's own model table
  lists. Rate **$2.00 in / $10.00 out**, re-verified against the pricing page on 2026-09-07.
  `ModelPrice.provider` is set explicitly, per R7. **Residual risk, recorded not blocking:**
  `claude-sonnet-5` is an ALIAS, where Haiku's `claude-haiku-4-5-20251001` is a dated snapshot.
  An alias repoints to a new snapshot without the id changing, so if Anthropic ever ships a
  Sonnet 5 snapshot at a different rate, this row keeps metering at the old price and silently
  under-meters — the 2026-08-20 gpt-5-mini failure mode, arriving by a different door.
  Mitigation, cheap and sufficient: **re-verify the Sonnet rate whenever the Anthropic digest
  path is next touched, and at the first real invoice.** A dated snapshot id may be substituted
  later without a new decision — it is the same decision, more precisely expressed.

- **2026-09-07 (A1 — the unguarded `ASK_PIPELINE=legacy` rollback path is filed, not
  hot-fixed)** Step 17's register found (WS2-F06) that the documented `ASK_PIPELINE=legacy`
  rollback dispatches a paid completion with **no SpendGuard at all**. It is pre-existing since
  `cea8cac` (2026-07-11), is not caused by any PR in this window, and is not #67's to fix. It
  is filed as an OPEN-TASKS entry and fixed in **step 23**. Scoping a pre-existing money-path
  hole into an unrelated PR's review would break that PR's envelope and hide the fix from its
  own review. **Action, not yet done at the time of signing:** no OPEN-TASKS entry for WS2-F06
  exists (`grep` for `WS2-F06` returns nothing in `docs/OPEN-TASKS.md`). Filing it is the first
  half of this decision; step 23 is the second. Until it is filed, this entry is the only
  record.

- **2026-09-07 (A2 — option (b): the drain runbook is corrected before the drain is registered,
  not before the code deploys)** Step 17's WS2-F04 found that the enablement runbook's order
  (secret → deploy → register → verify) has nothing applying migrations on deploy, so followed
  literally the drain is registered against a database with no `runtime_logs` table and every
  signed delivery 500s and is retried. Deploying #64's code is harmless; **registering** the
  drain against an unmigrated database is not. The runbook correction is therefore a gate on
  registration, not on deploy. **Interaction with O1, which is already signed:** O1 puts the
  operator personally at the Vercel dashboard for the registration step. The corrected order
  must be in front of the operator *before* that step, or A2's protection is advisory only.

- **2026-09-07 (A3 — bounded verification accepted for step 17, with its limits on the
  record)** PR #74's register (71 findings, 0 refuted, 3 major / 29 minor / 39 note, no
  blocker, 151 mutations run and reverted) is accepted as step 17's deliverable. Accepted
  **with its own stated limits**, which are part of what is being signed: nothing ran against a
  database; no Vercel or Neon environment was read; tree-wide `lint` and `build` were never
  run; three merges in range (#63, #58, #66) were out of scope; merge fidelity was never
  checked; minors and notes carry one verification each, not three; and **fifteen coverage gaps
  G2–G16 stand open, two rated blocker-if-real.** **This acceptance is of a deliverable, not a
  deploy clearance.** The per-PR verdict column (`#52 #57 #59 #60 #61 #65` merge-stands; `#62
  #64 #67` fix-before-deploy) must not be read as one, and CP4 §5.4 still has to place every
  one of G2–G16. The register's own "For step 27" bullet — still asserting "the only PR whose
  verdict is not merge-stands is #64" — is overruled by its own verdict table and its
  2026-09-07 #67 correction, and is corrected when #74 merges.

- **2026-09-07 (O3 — fork proofs accepted for this window; the preview-deployment drill is
  follow-up)** The #102/#103 "live proof" obligation is satisfied by the fork-based
  integration-test proofs for this window. A preview-deployment drill is logged as follow-up
  work and is not performed here. **Step 21 may launch** — it no longer prints `AWAITING
  AUTHORIZATION: O3` and no longer holds.

- **2026-09-07 (T4 — ICS 206-01 tool disclosure: capability built, display withheld on every
  surface, pending a market signal)** The operator's answer is option (a) — disclose in
  citation mode only — **restricted further to paying customers**, with an explicit fallback:
  *"if this is too complex right now hold and do not display… we can add the capability now if
  easily done, but hold on the public display or display for login users at this point in
  time."* The stated ground is commercial, not technical: there is no strong market signal that
  full tool disclosure is demanded yet. **The fallback is the operative branch, because the
  paying-customer gate does not exist.** Verified at signing: `src/lib/ask/access-context.ts`
  is an explicit BETA STUB whose own header states the real entitlements module
  (`src/lib/billing/entitlements.ts`, `resolveAccessContext()`) **"DOES NOT EXIST yet"**;
  `tier` is hard-coded `"beta"`, and live entitlement integration is ENABLEMENT-BLOCKED on the
  billing workstream's frozen contract plus the Gate 7 joint boundary review. The `plans` and
  `subscriptions` tables exist in the schema but Stripe is flagged off. The only gate that
  works today is the role-based one in `src/lib/registry/view-policy.ts` (admin/analyst vs
  signed-in user vs anon), and the operator ruled that out in the same sentence — the hold
  covers signed-in users too. **Therefore: WS-7.2 builds the disclosure capability and ships it
  dark.** No surface — public page, signed-in view, or citation mode — renders the AI-tool
  disclosure in this window. When the billing entitlement lands, enabling it for the paid tier
  is a configuration change rather than a rebuild, which is the whole reason for building it
  now. **Two consequences that must be recorded so no later session "fixes" them.** (1) The
  2026-07-16 decision to hide the digest provider (`digests/[country]/[date]/page.tsx:187-189`)
  **STANDS UNREVERSED**; PLAN-WS-7 §3 C9 is not exercised. (2) PLAN-WS-7 §7 states that
  withholding the disclosure makes BNOW's citation mode **non-conformant with ICS 206-01**, and
  that option (c) should be taken only as a deliberate choice. **It is now that deliberate
  choice**, taken on market-signal grounds and revisitable the moment a customer asks. WS-7.2
  must carry a test pinning the disclosure OFF on every surface — the same shape as T5's moat
  test — so a capability that exists in code cannot leak on by default. **Open, to confirm
  before step 32 builds:** T2 is already signed and puts `fetched_at` labeled "Accessed (BNOW
  ingest)" *in citation mode*. T2's access date and T4's tool disclosure are different fields.
  The reading taken here is that **citation mode still ships with T2's access date, and only
  the tool disclosure goes dark.** If the operator meant citation mode itself to be held, T2
  needs a superseding entry.

- **2026-09-07 (T5 — hedging weight constants stay withheld from the public methodology page)**
  Option (a): `/methodology` describes the hedging weight ordering **qualitatively** and does
  NOT print the constants (`confirmed 1.0 · assessed .75 · unknown .5 · claimed .4 · unverified
  .15`). This matches the existing posture — the constants are withheld from every non-admin
  product surface by `showWeightConstants` (`registry/[id]/page.tsx:135-142`), and
  `view-policy.ts` names them a moat field decided in exactly one place — and it matches
  `registry.detail.weighting_qualitative` / `dictionaries.ts:312-313`. The repo document
  `docs/METHODOLOGY-TRADECRAFT.md` may state them; they are already in
  `SOURCE-RELIABILITY-CALIBRATION.md:22-28`. **This ratifies what already shipped rather than
  changing it.** Step 30 built to recommendation (a) and merged (PR #69, `a485c80`), so the
  signature confirms the live page. The step-30 source-scan moat test is what enforces it;
  verify that test pins (a) and not merely "some wording", since it was written to enforce
  whichever answer landed.

- **2026-09-07 (C5-m — read-only multi-edition probe authorized; the operator runs it)** The C5
  measurement — how often the citation anchor differs from the daily-final edition on
  multi-edition days — is authorized as a READ-ONLY probe of production: `npx tsx
  scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 --dry` and the
  ROCA equivalent, behind the write-refusing repository decorator. Envelope: ~4 probes/day,
  roughly 4.5 minutes of politeFetch spacing per series, **zero writes and zero spend**. The
  **OPERATOR** runs it (step 10 item 7) and pastes both outputs into step 24's prompt. **Scope
  limit:** this authorizes the measurement only. It is WS-3.7's *evidence* for whether
  production's probe order should change; the change itself remains a separate decision and is
  not authorized here.

- **2026-09-07 (T3 — PLAN-WS-7 §6.1–6.3 signed as drafted, with T3-a and T3-b)** The operator
  has read the tables and signs them as drafted: **§6.1** the five corroboration tiers (`none`
  / C0 / C1 / C2 / C3) computed from `summarizeClaimEvidence` as a total function; **§6.2**
  `ESTIMATIVE_MAP_V1`, the 5 × 4 hedging × corroboration grid plus the `none` row, with its
  per-cell rationale; **§6.3** the 1–6 AJP-2.1 information-credibility table, derived from
  §6.2's output and **export-only**. **The two sub-items are signed explicitly, because both
  deviate from the addendum.** **T3-a** — the tables read **no `claims.confidence` and no
  source reliability**. This changes the addendum's stated signature and is accepted:
  `confidence` is the uncalibrated mean of `sources.reliability_score` (plan §3 C2), which is
  the exact quantity #14 gates and which `page.tsx:476-480` already refuses to render. **T3-b**
  — `almost certain` (95–99), the three sub-even bands (`almost no chance`, `very unlikely`,
  `unlikely`) and **AJP-2.1 levels 4 and 5 are never machine-assigned**. The pipeline has no
  refutation or contradiction mechanism, so it must never assert that a claim is less likely
  than even odds, and `almost certain` is reserved for a future analyst-verified tier. **What
  the signature binds** — the six invariants pinned by the exhaustive test: (1) C0 never
  exceeds `likely` and never exceeds `moderate`; (2) `high` confidence occurs in exactly one
  cell, `confirmed` × C3; (3) no cell is below `roughly even chance` and none is `almost
  certain`; (4) within every hedging row the band is monotone non-decreasing across C0 → C1 →
  C2 → C3; (5) at any tier no hedging class exceeds `confirmed`'s band — hedging sets the
  ceiling, corroboration lifts within it; (6) an out-of-enum hedging value resolves as
  `unknown`, matching the existing `status()` fallback. The operator constraint "nothing above
  likely/moderate from a single uncorroborated document" is invariant 1 and holds in every
  cell. **Versioning.** The table ships as `ESTIMATIVE_MAP_V1`. Any change to any cell is a
  **new version**, never an edit to V1 — a shipped estimative label must stay reconstructible.
  **Step 34 is unblocked** and no longer prints `AWAITING AUTHORIZATION: T3`.

- **2026-09-07 (D7 — measured WS-2.3 remap run authorized on a disposable fork)** The operator
  authorizes the measured run with a **$10 ceiling**, asking whether that is sufficient. **It
  is far more than sufficient**, and two corrections to how the number is applied are part of
  this entry. **1. What the run actually costs.** One ir/military day is roughly 700 doc-track
  pairs. At the runbook's measured unit cost — **$0.1059 per 1,000 pairs modelled** (§10.4,
  stable at 0.102–0.121 across all six live pairs and reproduced on an independent week) and
  **$0.067 per 1,000 actually billed** on the fork's copied ledger, i.e. the estimator is
  conservative by ≈1.6× — that is **≈$0.075 modelled and ≈$0.05 actual**. `--limit 1000`
  independently bounds the run to ~1,000 pairs ≈ **$0.11 modelled**, so any ceiling above about
  $1 never binds at all. **2. `$10` is `C`, the `--budget` value — it is NOT what goes in the
  environment caps.** The fork carries **production's copied `openai_map` history**, and both
  map caps are compared against *cumulative* totals, so setting a cap to `C` alone would refuse
  the very first reservation. Per runbook §8 step 2 the caps are computed on the day from the
  fork's own ledger: `MAP_SPRINT_USD_CAP = T + C` and `MAP_USD_CAP_DAILY = D + C`, where `T =
  SELECT sum(est_usd) FROM provider_usage WHERE provider = 'openai_map'` and `D` is that
  provider's `CURRENT_DATE` row. **T stood at $23.0763 over 44 day-rows when the fork was read
  on 2026-09-06** — so a literal `MAP_SPRINT_USD_CAP=10` is *below* the copied total and kills
  the run at zero calls. T must be re-read on the day; the 2026-09-06 figure is illustrative,
  not a constant. Deleting the fork's `openai_map` rows would give cleaner arithmetic but the
  fork would stop being an honest copy — not recommended. **3. `LLM_SPRINT_USD_CAP` is not the
  lever.** Map reads `MAP_SPRINT_USD_CAP` first and falls back to the shared backstop only when
  it is unset (`src/lib/usage/llm-guard.ts:167-170`). **4. Operative value.** `C = $1.00` for
  the run, per the runbook's own D7 recommendation — 20× the actual cost, and a tight runaway
  bound. **The operator's $10 is recorded as the authorized outer bound**, so a second pass, or
  a second (theater, track) day, needs no further approval. *If the operator prefers $10 as the
  working `--budget`, strike this paragraph and say so before step 22 runs.* **5. Threshold
  semantics, stated as the runbook requires.** `tryReserve` refuses when `already-spent +
  this-run >= cap` (`src/lib/usage/spend-guard.ts:121-140`, `>=`) — it is a threshold test, not
  a predictive one, so **terminal spend can exceed `C` by up to one batch's cost**. **6. Bounds
  and cleanup.** Never `--execute` without **both** `--budget` and `--limit`; both aborts are
  resumable and neither can re-bill, because `doc_map_state` — not the checkpoint file — is the
  no-rebill authority. Record the driver's final `REMAP …` line, the fork's `openai_map` row
  before and after, the `doc_map_state` rows created at the new version, and the claims count.
  Then **delete the fork** (§9): the ledger row dies with it and production's is untouched.
  **What the money actually buys.** Not the price — the modelled figure already answers "what
  does a remap cost". It is the first proof on real data that the sweep drain, the map lease,
  the completion proof and the no-rebill property behave as designed. Phase 2 has never been
  entered; that is what #33 has never had.

- **2026-09-07 (R4 — `MAP_CONTENT_CHARS=1499` on the fork-bound local server)** Path **(a)** is
  approved: set `MAP_CONTENT_CHARS=1499` on the fork-bound local server to bump the
  extractor-version basis and generate remap-pending work **with zero code change**, rather
  than (b) a prompt-hash code bump on an unmerged branch or (c) relaxing the lock. **The hazard
  is binding, not advisory.** `MAP_CONTENT_CHARS` is part of the extractor-version basis
  (`src/lib/analysis/map-prompts.ts:260`) — which is precisely why `1499` produces pending work
  for free, and precisely why it is dangerous. **If that variable ever reaches a Vercel
  environment, the hourly worker's version hash changes and it silently re-maps the entire
  corpus at production spend.** The runbook must verify the variable is **ABSENT from all three
  Vercel environments both before and after** the measurement, and the closing report must show
  both checks. **Second guard, already built.** `MAP_BACKFILL_BASE` is the driver's only target
  input and its **default is PRODUCTION**; the companion PR's fail-closed `--base-ack` guard
  refuses a non-loopback target at the CLI boundary — before the driver is constructed and
  before any route call — unless the operator names the exact host. Loopback needs no
  acknowledgement. This is what keeps a fork-bound measurement from addressing production by
  omission.

- **2026-09-07 (T4-b — build shape for the withheld AI-tool disclosure)** **Citation mode
  itself ships.** T2's access date ("Accessed (BNOW ingest)") renders in the per-document
  citation fields as signed. Only the **AI-tool disclosure** — the engine and provider identity
  in the per-claim disclosure block — is withheld. The two live in different parts of WS-7.2's
  output and move independently. **The gate is a POLICY FUNCTION, not a boolean constant.** It
  resolves from the viewer, in one module, on the `src/lib/registry/view-policy.ts` pattern —
  the file that already states the reduced view is decided in exactly one place. A constant
  would have to be torn out and replaced when billing entitlements land; a policy function
  makes "paying customers only" — what the operator actually asked for — a change to one
  function body in one security-reviewable place. A test pins the disclosure OFF for every role
  currently resolvable, so a built-but-dark capability cannot leak on by default.
  **Labelling.** While the disclosure is withheld the output carries a `tool disclosure
  withheld` marker rather than silently omitting it, and the copy action is not labelled a
  conformant "ICS 206-01 citation" without that marker. This is the standard's own escape hatch
  (PLAN-WS-7 §7 option (c)); it costs nothing and keeps the artifact honest. **The multi-model
  question, answered.** The operator asked whether the disclosure field is merely "the last
  model used", given that different models run at different pipeline stages. It is not — but
  the concern is correct in a narrower and more important way. *What is already provable, both
  digest-scoped:* (1) `digests.provider`, written by `mapreduceProviderTag()`
  (`synthesize.ts:443-449`), which resolves **both** workloads at call time and emits
  `openai:<map>+mapreduce`, or `openai:<map>+mapreduce+reduce=<reduce>` when the reduce model
  diverges — its own docstring says this exists "so a digest row never misattributes its
  synthesis model to the extraction model", and five tests pin it; (2) the full dispatch
  identity `{workload, model, reasoningEffort, registryVersion, approval}` at
  `digests.structured.stats.reduce.dispatch` (`synthesize.ts:701`) or `…stats.llmDispatch`
  (`digest.ts:218`). *What is NOT provable (plan §3 C1):* `extractor_version` lives only on
  `doc_claims` (`schema.ts:932`) and `doc_map_state` (`schema.ts:1003`); the `claims` table has
  **no** model/extractor/provider column and `claim_sources` is a bare join table. So the tag
  names the map model **configured when the digest ran**, not the model that actually
  **extracted each cited claim**. Those diverge whenever a remap has occurred — which is
  precisely what WS-2.3 / step 22 does. The disclosure is therefore **digest-scoped, not
  claim-scoped**, and must never assert a per-claim prompt hash. **Consequent build rules for
  WS-7.2:** 1. The disclosure block is **structured per stage**, not one string: an
  `extraction` entry and a `synthesis` entry. 2. `synthesis` is populated from the dispatch
  identity as the plan specifies. 3. `extraction` renders **"not recorded for this digest"**
  explicitly — never silently omitted, and never back-filled with the digest-run map model,
  which would be a false provenance claim. 4. It becomes real when PLAN-WS-7 §9.7 debt item 1
  lands: collect the contributing `doc_claims.extractor_version` values at reduce time into
  `digests.structured.stats` — **additive jsonb, no migration**, the `evidenceRecency`
  precedent. **NEW DEFECT found while answering this, and it is an ordering item for step
  20b.** `mapreduceProviderTag()` hard-codes the literal `openai:` prefix — it returns ``
  `openai:${map}+mapreduce` `` unconditionally, taking only the model *names* from
  `resolveWorkloadModel`. It is provider-blind. Under D2 = B, once the Anthropic digest path is
  enabled (R6's `anthropic_digest` row, R7's `claude-sonnet-5` / Haiku rows), a digest
  synthesized by Claude over claims extracted by `gpt-4o-mini` would be stamped **`openai:…`**
  — a false provider attribution, written durably to `digests.provider`, in the exact field an
  AI-tool disclosure would later read. **The tag must take its provider from the resolved
  dispatch before the Anthropic path is enabled, not after.** Today it is latent, because that
  path is dormant. **Note the timing dividend:** because T4 holds the disclosure dark, none of
  this is customer-visible yet, so the per-stage shape and the provider-tag fix can be got
  right before anyone reads one.

- **2026-09-07 (C15 — `publication_gap` two-run confirmation accepted as shipped, with the
  observation that reopens it written down)** Option **(a+)**. **The rule and why it exists.**
  `publication_gap` asserts that the reference publisher genuinely did not publish on a given
  day — a strong claim. It is written only when EVERY probe shape returned a clean 404 **and**
  a `probe_failed` row from an earlier run already exists; the monotone `probe_failed →
  publication_gap` transition (`editions.ts:504-527`) is the confirmation mechanism, so a gap
  is never asserted from a single run. That is the 2026-08-15 lesson: from one run, a transient
  outage and a real gap are indistinguishable. **The defect.** `benchmark_series_days` carries
  **no timestamp column**, so the design's "from a run ≥24 h earlier" is not verifiable — the
  row proves a `probe_failed` exists, not when it was written. It shipped as a proxy: "an
  earlier run stored `probe_failed` AND the day is ≥48 h old", substituting the *report date's*
  age for *run separation*. Those are not the same quantity. **The residual, accepted.** The
  report date's age constrains nothing about how far apart the two runs were. Two runs minutes
  apart during a single transient outage, over a window already ≥48 h old — i.e. any backfill —
  can still confirm a `publication_gap`. Blast radius is one row in an internal benchmark
  table: not a customer surface, but a corrupted validation input, because a fabricated gap day
  is scored differently from a genuine one. **The named trigger — this is what (a+) adds over
  (a).** The residual is not left to be noticed. It is reopened, and `first_observed_at
  timestamptz` scheduled as a nullable-additive migration, the first time this specific
  observation is made: **any `publication_gap` row whose confirming `probe_failed` row was
  written by the same backfill run.** WS-3.6's soak is where that would surface. Until then no
  column is added and no migration enters the D10 sequence.

- **2026-09-07 (R14 — the only acceptable escape hatch for the paid answer-model matrix is a
  route-unreachable code parameter; `ASK_SCORECARD_GATE=0` is forbidden)** Option **(b)**: the
  shape is decided now, no code is written now. **The problem.** PR #67's scorecard gate makes
  `answerFromEvidence` abort with `ABORT: degraded result … provider=unscorecarded`.
  `scripts/ask-eval.ts` drives its answer stage through that same function, so the paid
  answer-model matrix — the run that would PRODUCE a scorecard for a candidate model — aborts
  on question 1. The gate closes the only door to the thing that opens it. The failure is
  **safe and loud**: it can never yield a bad scorecard. But the matrix cannot be run at all as
  things stand. **The decision.** When the paid matrix is eventually scheduled, its escape
  hatch is an **eval-only, route-unreachable in-code opt-in** — e.g. `opts.evalUngated` on
  `answerFromEvidence`, set solely by `scripts/ask-eval.ts` — whose route-unreachability is
  proven by a source scan on the `isolation.test.ts` precedent. **`ASK_SCORECARD_GATE=0`, or
  any environment switch of that shape, is FORBIDDEN.** It would reopen the exact hole PR #67
  closed, in the same shape: one variable, one environment, no audit. A parameter no route can
  reach is mechanically auditable; an env var is not. **Timing.** The hatch is built in the PR
  that actually schedules the paid matrix, **not before**. Until then the gate is correctly
  closed and the matrix is operator-blocked on spend anyway. The value of deciding now is that
  whoever meets the abort under time pressure finds the answer already written, instead of
  reaching for the env switch. **ID hygiene, decided at the same time.**
  `MAP-REMAP-RUNBOOK-2026-09-06.md` §15 independently minted its own **R14** (where the map
  activation gate lives once the lock is replaced) and its own **R15** (version bump before or
  after a remap), both colliding with program IDs already in use — R14 here, and R15 in INDEX
  §2.3. The runbook's two are **renumbered R16 and R17**, with a dated correction note appended
  to that file. The decisions are unchanged; only the labels move.

- **2026-09-07 (OPEN-TASKS #79 — RU ROCA citation registry drain — EXECUTED)** Ran the
  O2-authorized backfill for the 36 historical `ru` ISW reports left `parse_status='pending'`
  since before the 2026-08-15 citation-refresh hook existed. Window 17:18–17:21 EDT.
  Preflight (`isw_reports`, theater `ru`): **pending 36** (newest 2026-08-14), parsed 1,562
  (newest 2026-09-06), failed 26 (newest 2024-03-30) — the pending count matches the figure
  recorded 2026-08-15 exactly; no drift. Backup branch **`br-wispy-silence-atgxus3y`**
  (`scripts/neon-branch.ts create`, copy-on-write fork of production) taken before any write,
  deleted at **2026-09-07T21:28:43Z** (17:28:43 EDT) after this entry was written; the
  deletion instant is the operator's Neon record, and the branch was independently verified
  absent from the project's branch list on 2026-09-08.
  Dry run (`--theater ru --dry`, zero writes): **36/36 `parseOk=true`, zero `fetch-failed`
  lines**; 2,564 endnotes and 6,896 citations staged across 2026-07-04 → 2026-08-14
  (117–307 citations/report).
  Drain (`npx tsx scripts/isw-refresh.ts --theater ru`): all 36 parsed, **5,421 citations
  inserted** (6,896 staged − 1,475 absorbed by the unique keys as already-known
  source/citation pairs), **98 new sources**, 2,440 per-report stats rows.
  `ru` **pending 36 → 0**; parsed **1,562 → 1,598** (+36, exactly the drained set); failed
  unchanged at 26. Newest cited `ru` report date after the drain: **2026-09-06**. The hole
  closed was the interior gap 2026-07-04 → 2026-08-14, not the head of the corpus — the
  going-forward hook had been parsing new `ru` reports since 2026-08-15, so `parsed`'s max was
  already 2026-09-06 before this run. (The runbook's "newest fully-parsed `ru` report is
  2026-07-03" describes the state as of 2026-08-15, not the pre-drain state today.)
  `registry-materialize.ts`: `source_theater_stats` for `ru` **7,068 rows / avg reliability
  0.571 → 7,174 rows / 0.572** (+106 rows; 4,808 decayed). Global pass materialized 10,224
  sources; 10,855 theater-stats rows total (`ir` 3,681 / 0.490, untouched by this run);
  **cited-but-zero-count sources remaining: 0**.
  **Finding — the 26 `failed` `ru` reports are a separate, older problem, unchanged by this
  run.** They date 2022-04-27 → 2024-03-30, long predating #79's window. A
  `--retry-failed` pass was run (not required — the dry run showed no fetch failures) and
  every one of the 26 came back `failed endnotes=0 citations=0 inserted=0`; the count is 26
  before and after. Nothing was downgraded — a parse failure never downgrades an
  already-parsed report. These are almost certainly legacy page shapes or dead slugs and
  deserve their own OPEN-TASKS item; they are **not** in scope for #79 and #79 is complete
  without them.
  **Operational finding (OPEN-TASKS #80, correction).** `registry-materialize.ts` first died
  with `password authentication failed for user 'neondb_owner'`. The runbook says a stale
  `DATABASE_URL_UNPOOLED` falls through to the pooled DSN via `||`; it does not. `||` falls
  through only on an EMPTY value, and #80's failure mode is a SET-but-stale credential, which
  is truthy and is used. `DATABASE_URL_UNPOOLED= npx tsx scripts/registry-materialize.ts`
  succeeded immediately. Nothing was written by the failed attempt — it dies at DSN
  construction (`scripts/registry-materialize.ts:25`), before the transaction.
  Cost: **$0** — neither `isw-refresh.ts` nor `registry-materialize.ts` imports any LLM or
  OpenAI module (verified by reading the import lines before running); network egress to
  understandingwar.org only, via disk-cached `politeFetch` at ~2.1 s/host. No migration, no env
  change, no code change — data only. This is registry data, not validation: `validation_runs`
  is untouched and the public scoreboard's historical scores are unaffected.
  Rollback: the backup branch above, retained until this entry was written.

- **2026-09-08 (step 10 item 3 — WS-1.1 ×3 capture run EXECUTED under D6)** Operator ran the
  development-split injection capture on the kept evaluation branch
  (`br-weathered-forest-atmfaetu` / `itest-1788469162388`, host
  `ep-misty-bonus-atfbt0iq-pooler…`), `gpt-4o-mini` effort-absent `approval=baseline`, dataset
  `map-inj-dev-v1` (`c531e300…9ee29ef1aa`), `--dev --repetitions 3`, cell **`map-depth-full`**
  (chosen and recorded before the run), tree `ab31166`. **18 requests / $0.0039 actual**
  against the run card's 18 / $0.0112 estimate; `openai_eval` on the branch $0.2918 / 767 →
  $0.2957 / 785, reconciling exactly. Caps `LLM_SPRINT_USD_CAP=2.00` + `EVAL_USD_CAP_DAILY=2`,
  campaign-local, never in Vercel; no cap approached. Capture `live-1788883325599` complete,
  38 development lines, sha256 `e0afb379…0fd4a8a3`, heldout raw off, zero heldout IDs seen.
  Counts only (scope `dev` cannot verdict): 18/18 scored, 10 pass / 8 fail, `injectionHits` on
  2 of 18 attempts (002#r2, 004#r2); rows 003 and 006 fail on recall, not payload; row 005
  payload not fed by construction. Correction to the D6 addendum: the branch held $0.2918
  before this run (2026-09-03 campaign $0.1518 + step 1A 2026-09-05), not ≈$0.15. Full entry:
  `docs/reviews/EVAL-EXPOSURE-LEDGER.md`, 2026-09-08 16:02Z. Branch retained (A6). Follow-up
  owed: rotate the `neondb_owner` password (connection string exposed in a chat transcript
  during branch identification) and refresh `.env.local` + Vercel DSNs, which also closes #80.

- **2026-09-08 (#48 re-landed squashed per D1; #47 landed — Stage 2 item 5 closed)** Both docs
  PRs, branched from `883e5e3` on 2026-09-04, conflicted with the post-step-15 `AGENTS.md`
  (`git merge-tree`: 2 and 3 hunks; not under the union driver) and were re-landed as one
  squash commit each on current `main` — #48 as `ac91519` (merge `d0c981e`), #47 as `8cff524`
  (merge `81acadd`). Every conflict was resolved to `main` and only the branches' genuinely new
  content was re-placed by hand: their two 2026-09-05 decision entries now sit at the end of
  the 2026-09-05 run (before the 2026-09-06 D3 entry) under the post-`3f09757` date-order
  convention; #48's one-worktree-per-PR bullet joined `## Conventions`; #47's OPEN-TASKS item
  was renumbered **108 → 115** because `main` already held a different #108 — the harness item
  that the CTO handoff cited as "#108" and that #108's own numbering note said did not exist
  now exists as #115; #47's `HUMAN-SETUP-TODO.md` rewrite was dropped per its own "main wins on
  shared docs" rule; a fourth conflict in `docs/PARTNER-STRATEGY.md`, created by #48 landing
  first, was resolved by keeping both additive blockquotes. `docs/OUTREACH-ROSTER-2026-08-23.md`
  never entered `main`'s history (`git ls-tree` on the pushed tip: absent) and now lives in
  operator notes outside git. Both source branches deleted on `origin`; `gh pr list` is empty.
  Pre-push gate green on both pushes (4,082 / 270). $0, docs only, no launch, no deploy.

- **2026-09-08 (OPEN-TASKS #33 — the remap driver EXECUTED for the first time; D7 discharged
  on a disposable fork; the measured cost figure)** Under the signed D7 (`C = $1.00`
  operative, $10 outer bound) and R4 option (a), the version-aware remap driver — deployed
  2026-08-21, rehearsed in estimate mode 2026-09-06, never executed — was run in `--execute`
  mode for the first time against a local `next start` bound to disposable Neon fork
  **`br-royal-resonance-atvgety1`** (created and deleted this session), `MAP_CONTENT_CHARS=1499`
  on the fork-bound server only, `MAP_BACKFILL_BASE=http://localhost:3000` on every command.
  Caps were computed off the fork's COPIED ledger as (f10) requires — `MAP_SPRINT_USD_CAP =
  T + C = 24.9400` against `T = $23.940010`, `MAP_USD_CAP_DAILY = D + C = 1.4559` against
  `D = $0.455843` — never a literal ceiling. **One ir/military day (2026-08-25), bounded twice
  over (`--budget 1.00 --limit 1000`): 701 doc-track pairs attempted, 382 claims, actual
  $0.046263 against $0.0765 modelled.** Twelve drain sweeps then twelve confirming sweeps
  returning `pairs=0` — the sweep-completion proof exercised on real data; `omitted=0` on
  every batch (ruling 7 clean at batch size 20). Reconciliation is exact on all four
  independent reads: ledger delta $0.046263 == driver $0.0463; `doc_claims` @
  `gpt-4o-mini:1bfad9e5e447` == 382; `doc_map_state` @ that version == 701; `cron_runs`
  `map:remap` == 24, all ok. `doc_map_state` at the BASELINE version stayed at 53,006 rows,
  so ruling 13's rollback is demonstrated rather than asserted. **Measured unit cost
  $0.0660 per 1,000 doc-track pairs — the estimator is conservative by 1.65×**, landing
  within 1.5% of the $0.067/1k the 2026-09-06 ledger cross-check predicted; the $36
  full-corpus figure is confirmed as an upper band and the measured rate projects the same
  339,669 pairs at ≈$22.4. **No-rebill proven the hard way:** the checkpoint file was deleted
  and the identical command re-run — 0 pairs, $0.0000, ledger and rows unchanged, so
  `doc_map_state` is the authority and a lost checkpoint costs a re-scan, never a re-bill.
  One honest divergence: `provider_usage.requests` 374 → 412 = 38 dispatches against 36
  modelled batches (truncation splits meter their own request), a 5.6% count overrun the
  cost model still over-covers. `MAP_CONTENT_CHARS` verified ABSENT from all three Vercel
  environments before AND after, each listing carrying a positive control. Production was
  never contacted and still holds zero `map:remap` rows; no env change, no deploy, no
  migration, no code change; the map activation lock is untouched. Fork deleted, server
  killed, `data/remap-state/` removed, tree clean. **#33's status changes from "TOOL
  DEPLOYED, NEVER EXECUTED" to "EXECUTED ON A FORK, one (theater, track, day)"** — the other
  five live pairs and the full epoch range remain modelled only, and #95 still stands (no
  contention, takeover, lease-loss or discard path fired). Record: §19 of
  `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`.

- **2026-09-08 (C5-m measured — fork-write passes taken under (f5)/O3, on operator
  confirmation)** Stage 2 item 3 was re-run over **2026-02-28 → 2026-03-22**, the window
  §0.6 selected from production's own split-edition slugs after August 2026 proved to hold
  no multi-edition day. A disposable Neon fork of production (`br-cold-fog-atmcvp28`) was
  created, migrated to `main` (0028/0029/0030), probed three times and **deleted at
  14:50:43Z**, verified absent against the Neon API. (f8) authorizes a *read-only* probe;
  passes 1 and 2 wrote, but only to that fork, addressed by explicit DSN — the (f5)/O3
  shape — and on an in-session operator confirmation taken before the first non-dry command.
  Production was never addressed: 29 migrations before and after, all four new tables still
  absent, `isw_reports` unchanged. **The C5-m answer for this window: `multiEditionDays = 8`,
  `anchorNotFinalDays = 1` — the citation anchor sits on the non-final edition on
  2026-03-05 (anchor `morning`, daily-final `evening`), 1 of 8 observed multi-edition days.**
  Both are LOWER bounds: 14 of 23 days were probed while understandingwar.org was answering
  403 for not-found URLs, and 2026-03-10 — where `isw_reports` also kept the morning edition
  — could not be resolved because its evening shape returned 403 rather than a clean 404.
  `publicationGapDays = 0` in every pass and **(f14)/C15's same-session reopening trigger was
  never exercised**: gap confirmation requires every probe of the day to be a clean 404, and
  no day was. **New finding, measured not inferred:** three identical `roca` passes over the
  same 23 days returned `publishedDays` 6 → 6 → 13, and `isw_reports` shows all 23 days
  published, so **all 17 of pass 1's `roca` `probe_failed` days were false negatives**. The
  403 state suppresses real pages, not only nonexistent shapes — which corrects the
  2026-09-07 record's "a genuine second edition would most likely have been served". The
  404 → 403 threshold reproduced exactly: 20 clean 404s, then none. Spend **$0**; no deploy,
  no environment change, no migration applied to production, no candidate model touched.
  Record: `docs/reviews/C5M-PROBES-2026-09-07.md` (the 2026-09-08 re-run section).

- **2026-09-08 (ninth and tenth archive passes — the log cut to 2026-09-05; a one-off
  deviation from D5's 7-day window, under D5's ceiling)** Operator-run on `main`, two passes,
  each proven by `scripts/check-decision-log-move.sh HEAD` before commit. **Ninth pass
  (`eb4bf9f`)**, the policy move: the single entry dated before 2026-09-01 (the 2026-08-31/09-01
  map-flood OOM incident, 3,591 chars) moved verbatim to `docs/DECISIONS.md`; 205 entries
  before and after, 60 → 59 inline, `AGENTS.md` 147,701 → 144,085. That left 5.9k of headroom
  under the 150,000 ceiling with Stage 3 about to append a closing entry per step at 2–4k each —
  the window and the ceiling conflicted, and the ceiling is the harder rule (the window exists
  to serve it). **Tenth pass (`c6e3dae`)**, the operator's one-off deeper cut: the six entries
  dated 2026-09-03 and 2026-09-04 (17,314 chars) moved verbatim, 59 → 53 inline, 146 → 152
  archived, `AGENTS.md` → **126,660** (23k headroom). Both passes PASS: every body
  byte-identical, none duplicated or invented, ascending order in both files. D5's 7-day
  window is **not** amended — the next pass reverts to it; the archive header records the split
  point as 2026-09-05 with a pointer here. Rationale for the record: today alone added four
  execution entries (~17k) — Stage 2 items 4 and 5, Stage 2a, C5-m — and a first-breach halt
  inside a Stage 3 session would have cost more than moving four extra days early. $0, docs
  only, no code, no standing text changed except the archive header line.

- **2026-09-08 (step 20/20b — eval-plane provider parity; Anthropic digest wiring; five PRs,
  all dormant)** The eval control plane gains a `--provider` dimension (provider-qualified
  dispatch identity, provider-scoped pricing); the entity-audit prompt moves into a pure
  module with a byte-identical request; the Anthropic `digest` seam is wired through
  `model-config.ts`, metered on its own `anthropic_digest` row under the existing
  `LLM_SPRINT_USD_CAP`/`LLM_DIGEST_USD_CAP` envelope (R6, no new env), selected only by
  `DIGEST_PROVIDER`. Price rows land for `claude-haiku-4-5-20251001` ($1/$5) and
  `claude-sonnet-5` ($2/$10) per R7/R7-b. `mapreduceProviderTag()` is made provider-aware
  in the SAME PR, before the digest allowlist admits a second vendor (discharges the T4-b
  ordering gate). **Nothing is activated:** no Anthropic registry approval exists, so every
  Anthropic resolution is `dispatchBlocked`. $0, no Vercel change, no migration,
  `docs/evals/analysis/` byte-untouched. Record: `docs/reviews/WS-2-4-EVAL-PARITY-2026-09-06.md`.

- **2026-09-08 (step 21 — #102/#103 FORK-PROVEN under O3; register gap G5 measured)**
  Real-Postgres integration proofs on disposable fork `br-long-hat-at1048v9` (deleted), $0.
  **#102:** the real `MAP_REF_ROW_CAP=75,000` terminals — adaptive shedding, the hard-cap
  refusal, shed-exhaustion refusal — all exercised with no test-only seam; both refusals
  mark nothing and dispatch nothing. **#103:** `runMapWatchCheck` end-to-end on real
  Postgres — detection → slot throttle → cooldown dedup → one RECOVERED notice, with the
  2026-09-01 first-evaluation hotfix re-verified. **Neither path has fired naturally in
  production**, so both OPEN-TASKS headers are DOWNGRADED to fork-proven, not closed (O3:
  the preview-deployment drill stays follow-up). Register gap G5 (drain NUL/int4/bind-cap
  failure modes) confirmed by measurement, with a refinement: the int4-overflow case is a
  wire-protocol parameter-count wrap, never a silent mis-bind. `scripts/audit-cron.ts`
  gains a runtime-log coverage section, additive. No deploy, env, migration or
  candidate-model change. Record: `docs/reviews/RELIABILITY-PROOFS-2026-09-06.md`.

- **2026-09-08 (WS-7.2 — ICS 206-01 citation mode shipped; the AI-tool disclosure is BUILT
  and DARK)** A fifth `ClaimCopyMode` (`citation`) ships on the digest surface under
  T2/T4/T4-b. Citation mode renders, carrying T2's "Accessed (BNOW ingest)" date; the
  AI-tool disclosure does not, on any surface — a policy function keyed on tier
  (`src/lib/citation/disclosure-policy.ts`, the `view-policy.ts` pattern) with an empty
  entitled set today, resolved server-side before the client payload is built, so a
  withheld model name never crosses the boundary. The withheld artifact carries a literal
  `tool disclosure withheld` marker (PLAN-WS-7 §7 option (c)). The disclosure is per-stage:
  synthesis from the digest dispatch identity, extraction always "not recorded for this
  digest", never back-filled (now OPEN-TASKS #117). Ruling 19's labels moved to a leaf
  module after `madge` showed a client-boundary risk; `client-boundary.test.ts` now scans
  for it. The 2026-07-16 provider-hiding decision stands unreversed. $0, no migration, no
  deploy. Record: `docs/reviews/WS-7-2-CITATION-MODE-2026-09-07.md`.

- **2026-09-08 (WS-7.3 — source descriptors and the per-digest source summary ship as
  presentation)** ICD 206 mechanisms 2 and 3 (`descriptor-v1`, `summary-v1`) are generated
  deterministically from registry/citation data, labelled "not an analyst judgment",
  persisted nowhere; neither reads `claims.confidence` or `sources.reliability_score`, so
  #14/#56 are untouched. Customer-visible on the digest page's new "Sources for this
  digest" section, not just the admin-only `/registry/[id]`. The source-mix cap fact is
  read only from a digest's own persisted `structured.stats.sourceMix`, else reported "not
  recorded for this digest" — never re-derived. **Correction to PLAN-WS-7 §4 on evidence:**
  the platform-root fallback would have suppressed nearly the whole registry
  (`canonicalSource()` keys every non-social source by bare host); the shipped rule fails
  closed only on a KNOWN multi-tenant host, an account-less telegram/x identity, or an
  unparseable identity — an unlisted multi-tenant root is recorded on #56, closable only by
  its segmentation. $0, no migration, no deploy. Record:
  `docs/reviews/WS-7-3-DESCRIPTORS-2026-09-07.md`.

- **2026-09-08 (WS-7.4 — `ESTIMATIVE_MAP_V1` ships as a PRESENTATION layer)** Under signed
  T3/T3-a/T3-b, `src/lib/tradecraft/estimative.ts` maps (hedging, evidence-independence
  counts) → {ICD 203 likelihood band, published percentage range, corroboration-derived
  confidence}, with the AJP-2.1 1–6 code derived FROM the band. Pure, zero runtime imports
  — cannot reach `claims.confidence` or any reliability score (T3-a holds structurally, not
  by review; OPEN-TASKS #14 stays untouched and blocked by #56). Sub-even bands and AJP-2.1
  levels 4/5 are never machine-assigned (T3-b); `high` confidence occurs in exactly one
  cell. Rendered beside the hedging label on digest/search/signals/ask claim rows and in
  the citation artifact (T4's dark-stamp policy untouched). Any cell change is a NEW
  VERSION, never an edit to V1. Corrects three now-false standing texts in the same commit:
  `/methodology` §7, the digest page's #14 comment, and the crosswalk's ICD 203 uncertainty
  row (`GAP`→`PARTIAL`). $0, no migration, no deploy. Record:
  `docs/reviews/WS-7-4-ESTIMATIVE-2026-09-07.md`.

- **2026-09-09 (D-a … D-f — WS-3 audit register decisions signed)**
  The six decisions the step-18 register (`docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md`
  §Decisions needed, PR #78 `c32213a`) asked for, answered as recommended except D-d.
  **D-a = (b)**: a 403 (and 429 / ≥500 / null / undersized 200) is an *indeterminate* probe
  class distinct from a clean 404 — `probeIndeterminate` is counted separately, gap confirmation
  gets an explicit "not confirmable under throttling" branch, and `probe_failed` stops
  conflating "no such page" with "throttled" (R.15 item 1 of `C5M-PROBES-2026-09-07.md`,
  OPEN-TASKS #114). The class carries a `dayStatusReason` **discriminator, not a single value**:
  `throttled` for the transport cases and `unparseable_body` for D-b's zero-unit 200, so the new
  class does not re-conflate one level down. No migration: the reason travels in the return shape
  only. Backoff (R.15 option (c)) is deferred to its own decision because it changes fetch volume
  against a third-party host. **D-b = (a)**: a >10 KB `200` body with zero units is not an
  edition — it counts as indeterminate with reason `unparseable_body` and the day stays
  `probe_failed`, so a host error page can never outrank a real edition (WS3-F03). The accepted
  cost is that a real-but-unparseable report is no longer stored for a later re-parse; the reason
  code is what records that a body was seen at all. PLAN-WS-3 §3.2a's sentence is corrected by
  step 23 and step 25 records it. **D-c = (a)**: `derived.units` for Iran editions are computed
  under `gazetteerFor(series)` now, in step 23, and the gazetteer is stamped into
  `EDITION_UNITS_VERSION` (WS3-F05). This is free **contingent on production still standing at 29
  migrations (0028–0030 unapplied) when lane C starts** — on that condition zero production rows
  exist and there is nothing to backfill; if it has changed at launch, lane C says so in its
  report and the switch becomes a versioned migration instead of a one-line change.
  **D-d = step 23 lane C, not step 19** (the register recommended step 19): on 2026-09-09 step
  23's WS-3 lane was moved to the `audit-ws3` worktree so it runs alongside step 19 and merges
  first when it delivers first (step 19 builds its claim-sources PR before it opens the module's
  consumer, and takes the fixed module if lane C is on `origin/main` by then —
  `docs/reviews/REORDER-23C-19-ANALYSIS-2026-09-09.md`); lane C owns
  `edition-discovery.ts` for this window and the June-2025 parser shape (WS3-F08) lands there, so
  the N3 `--backfill-from-isw-reports` mode is built next to it. **The eleven June-2025 rows are
  IN scope, not excluded.** #116's hazard is a *network discovery* backfill over 2025-06-12 →
  06-24 — that still must not be run, and step 19's prompt keeps the instruction — but the N3
  mode is zero-network (it reads `isw_reports`, normalizes, upserts), and D-f (b)'s parser shape
  lands in the same lane and makes exactly those eleven suffix-form URLs normalizable, so they
  register rather than refuse. Per-row typed refusals are still counted and never abort, as the
  safety net for any row the table does not yet cover. The backfill has no HTML, so it is
  **exempt by construction from D-b's unit criterion** and writes `parseStatus: "pending"`, never
  `failed` — recorded here so step 26 does not read the asymmetry with discovery as a finding.
  Step 19 consumes the module and does not edit it. **D-e = yes**: step 23 may append the R3
  variants to `iran-levant-v1` (no result has persisted under the version) and may add the
  apostrophe/hyphen fold in `match.ts` — **in the word path ONLY, placed after the
  `matchMode === "substring"` early return**, not at the `:97` lowercase line the register cites,
  which sits above that branch and would change `ru-ua-v1` (substring mode) with it. The fold
  applies to the **variants as well as the text**, so an ASCII-apostrophe variant meets a U+2019
  source spelling. Substring mode stays byte-identical, so the RU/UA proof stands.
  **D-f = (b)**: only the parser shape for the suffix slug form is added; no fifth production
  probe enters `src/lib/validation/run.ts` this window, so the frozen production discovery path
  stays byte-identical and no fetch volume is added against a host that already throttles.
  $0, docs only; no code changed by this entry. Signed by the operator; step 23's prompt cites
  this entry by title.

- **2026-09-09 (WS-3.3 — DB-backed evidence populations + the live observation pipeline;
  branch/PR only)** `db-claim-sources.ts` (PR #86) implements corpus recall over
  `doc_claims` (current-version predicate ANDed per theater, per rulings 13/14) and
  published retention over designated digests (legacy-engine claims MEMBERS, memo C8),
  both bounding a distinct-claim subquery before joining documents unbounded; stub
  adapters excluded at the query (ruling 3). `live-observation.ts` (PR #93) attaches the
  pipeline behind the still-unscheduled `conflict-validate` job: editions → daily-final
  winner (C4) → declared units → lane/flags (`unit-flags-v0`, C13) → attribution (C3,
  never a filter) → `scoreConflictReport` → one appended observation. The shadow matcher's
  spend path is real but unreachable: `createLiveMatcher` refuses on an absent
  `CONFLICT_MATCH_USD_CAP_DAILY` before any client is built, meters on its own
  `llm_conflict_match` row (never production's `llm_match`). Built on lane C's PRE-fix
  code, so Iran unit attribution is the honest `unattributed`, not a conflating `both`.
  PR #87 threads the keyword rung's `insufficient_data` class into `ConflictResultV1`
  under decision E5 (recorded in `docs/reviews/EVAL-EXPOSURE-LEDGER.md`). Unit
  4,332→4,441/288 files; fork itests 15/15 on three disposable branches, all deleted. No
  migration, no env/cap change, no deploy, **$0**. Record:
  `docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md`.

- **2026-09-09 (step 23 lane R — the WS-2 audit register remediated; the
  `ASK_PIPELINE=legacy` spend hole CLOSED)** Under A1(a), `legacyAnswer` now reserves
  through `askGuardFromEnv()` before dispatch and meters after (ruling 8); a refusal
  returns the deterministic cited-claims answer with provider `budget`. Ruling 4 now
  holds on every Ask path for the first time since `cea8cac` (2026-07-11) — OPEN-TASKS
  #110 CLOSED. Sixteen further WS-2 findings fixed (two PRs, #88 then #89); the rest
  bundled into OPEN-TASKS #119 with a reason each. Under A2(b) the log-drain enablement
  order now gates **registration** on `npm run db:migrate` plus two confirming queries
  (`RELEASE-CHECKLIST.md` steps 5/11 updated); `scripts/migrate.ts` now refuses at the
  boundary when `DATABASE_URL`/`DATABASE_URL_UNPOOLED` name different databases (#112(c))
  — the `env -u` idiom does not protect it, and only a stale password prevented an
  accidental production migration on 2026-09-07. Step 21's G5 characterization tests
  inverted into passing proofs on a real fork. Unit gate 4,332/282 → 4,364/284; **$0**, no
  env/migration/deploy change, `vercel.json` byte-identical. Record:
  `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md` (lane R).

- **2026-09-10 (WS-3.5 — the conflict surfaces read real observations; WS-3.6 enablement
  checklist; branch/PR only)** `db-product-view.ts` (PR #95) reads
  `conflict_validation_observations` at read time via memo C4 (`selectDailyFinal` picks
  the day's winner edition; an unevaluated final renders PENDING, never promoted from a
  sibling edition — exactly the substitution C5-m measured production's probe order
  making on 1 of 8 multi-edition days). Ruling 3 now enforced by module graph, not review:
  the DB view and every conflict page import no fixture module, scanned in both
  directions; two fixture-only components deleted. Every observation stamps
  `unit-flags-v0` (C13), so surfaces carry a "compound handling undetermined — not
  soak-eligible" banner in place of the old synthetic banner. `/scoreboard` country rows
  relabeled "evidence lenses" in all seven locales (memo C10), numbers/columns/order
  unchanged and re-pinned. Ruling-21 ROUTES obligation discharged by
  `conflict-feature-off.itest.ts` under a flag-ON server that now seeds real data (25/25
  on a disposable fork). PR #96 adds the WS-3.6 enablement checklist. **One decision
  raised, not taken:** whether a `unit-flags-v0` number may reach a PUBLIC surface at
  `CONFLICTS_UI` flag-on (recommended: land `compound-v1` first). Unit 4,557/290 →
  4,599/293; **$0**, no env change, no migration, no deploy, no flag turned on. Record:
  `docs/reviews/WS-3-5-SCOREBOARD-AND-SOAK-PREP-2026-09-07.md`.

- **2026-09-10 (eleventh archive pass — the earliest eleven 2026-09-05 entries moved,
  under D5's ceiling)** Step 25's own additions (nine decision-log entries recording the
  Stage-3 work its assigned reports document) pushed `AGENTS.md` to 152,697 characters,
  over the 150,000 ceiling. Proven by `scripts/check-decision-log-move.sh HEAD` before
  commit: the eleven earliest 2026-09-05 entries (eval successor-plan step 1 authorization,
  D1, D2, D5, D6, D8, D9, E1, E3, D11, D12 — 5,255 characters) moved verbatim to the end of
  `docs/DECISIONS.md`, byte-identical, none duplicated or invented, ascending order
  preserved in both files. `AGENTS.md` → 147,972 characters before this entry and the
  closing entry below were added. Per the tenth pass's precedent, this is a partial-day cut
  (the remaining 2026-09-05 entries — the program-authorization entry, the worktree-cleanup
  entry, and the 2026-08-17-branches-landed entry — stay inline, all now the earliest
  entries in the log), not a full-day one: the ceiling is the harder rule and a partial cut
  is the smaller intervention that clears it. $0, docs only, no code, no standing text
  changed beyond the archive-pointer sentence above and `docs/DECISIONS.md`'s split header.

- **UNSIGNED — 2026-09-10 (step 25 — 48-hour execution program, Stage 3 docs sync;
  drafted for step 27 to sign)** Applies the WS-2 register's 22-item and WS-3 register's
  5-item stale-standing-text lists (minus their do-not-apply sub-clauses: PLAN-WS-2's
  Architecture/ruling-13 bullets stay superseded per WS2-F08) and the "Proposed AGENTS.md
  changes" blocks of eight closing reports (WS-2-4-EVAL-PARITY, RELIABILITY-PROOFS,
  WS-3-3-EVIDENCE-POPULATION, WS-3-5-SCOREBOARD-AND-SOAK-PREP, WS-7-2-CITATION-MODE,
  WS-7-3-DESCRIPTORS, WS-7-4-ESTIMATIVE, AUDIT-REMEDIATIONS both lanes) to AGENTS.md's
  Architecture, directory map, rulings 4 and 13, Credentials table, Next steps, Quality/ops
  and Live/repository standing text, plus the eight preceding decision-log entries above
  (2026-09-08/09/10) recording work those reports document. Updates
  `docs/OPEN-TASKS.md` status lines and `docs/CURRENT-STATE.md`'s stale sections, and adds
  a dated addendum to `docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md`. **State of `main` at
  this step's start:** `619986c`, Stage 3 fully merged (steps 04–24 plus both governance
  PRs) except this step; 4,599 unit tests / 293 files, typecheck/lint clean, re-measured
  fresh (not copied from any lane report). **Not applied, recorded as debt rather than
  silently dropped:** items 17–21 of the WS-2 register (corrections to OTHER historical
  report files' own self-citations, not to any live standing doc) and the WS-3 register's
  item 22 (env-posture re-verification, which needs Vercel access this session does not
  have); the decision-log drafts step 06/13b/14 left in their own closing reports appear
  never to have been appended to this log at all — WS3-F04 and WS3-F02 caveats are owed on
  the step-13b and step-14 drafts respectively whenever that happens. **One live
  discrepancy surfaced, not resolved here:** the step-18 WS-3 audit register ran on Fable
  5.1, the model INDEX §3 reserves for step 26's independent go/no-go audit, per that
  register's own disclosure 1 — step 26 should read its findings as same-model, not
  independent-model, confirmation. **An eleventh archive pass was required** to keep this
  file under the 150,000-character ceiling (D5) after these additions — see that dated
  entry immediately above, whose move was verified byte-identical, unduplicated and
  order-preserving by `scripts/check-decision-log-move.sh` (its "N new" line reflects this
  session's own new entries, not a lost or edited one — see the closing report for the
  full readout). $0, docs only; no code, schema, env, cap, or deploy change. Full accounting, every git grep
  run, and the drafted INDEX §10 program-log line: `docs/reviews/PROGRAM-48H-DOCS-SYNC-2026-09-07.md`.

- **2026-09-11 (twelfth archive pass — a one-off cut to 2026-09-07 under D5's ceiling; the
  window is not amended)** Operator-ruled, on the tenth pass's precedent (2026-09-08). Before
  this pass `AGENTS.md` stood at **149,979 characters** — 21 under the 150,000 ceiling — after
  the AUD-04 standing-text correction, and step 27 must both sign the step-25 closing entry that
  is still marked unsigned and append a deploy entry of 2–4k. D5's 7-day inline window had
  nothing eligible until 2026-09-13, so the window and the ceiling conflicted again, and again
  the ceiling is the harder rule (the window exists to serve it). Moved **verbatim** to
  `docs/DECISIONS.md`: the whole **2026-09-06** run, nineteen entries (D3, D4, N2, N3, E4, E5,
  R1, R2, R3, O1, O2, D10, T1, T2, T3, R6, R7, the D6 addendum, R5 — R7 is the entry headed
  `2026-09-06/07`, which sorts as 2026-09-06 and moves with its run). **Proven PASS** by `bash
  scripts/check-decision-log-move.sh HEAD` run on the pure move, before this entry was appended:
  216 entries before and after, every body byte-identical and accounted for, none duplicated,
  none invented, ascending date order in both files. The move itself conserved bytes exactly —
  399,392 across the two files before and after, measured before the two pointer paragraphs were
  corrected. `AGENTS.md` **149,979 → 129,154** characters (the move plus those two pointers),
  ~21k of headroom before this entry. Re-run WITH this entry present, the same check reports
  `0 lost or edited, 1 new` — that one is this entry, which is the eleventh pass's documented
  readout, not a lost or edited body. The log's earliest inline entries are still the three
  2026-09-05 ones the eleventh pass left; the inline window now begins at **2026-09-07**.
  **D5's 7-day window is NOT amended** — the next pass reverts to it; the archive header and the
  pointer paragraph above record the split point as 2026-09-07 with a pointer here. $0, docs
  only, no code, and no standing text changed except those two pointer paragraphs.

- **2026-09-11 (T3-c — named-person allegations are routed to the estimative band's `withheld`
  path; AUD-01, option 1)** The 2026-09-11 final audit
  (`docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` §4.1) found that `ESTIMATIVE_MAP_V1`
  labels a disputed reputational allegation about a named person **`likely (55–80%)` ·
  corroboration-derived confidence `moderate`** at exactly the two-document count that makes it
  publishable at all (`ALLEGATION_MIN_DOCS = 2`, `src/lib/analysis/publication-guard.ts:57`).
  The cause is structural, not a defect against a signed decision: none of T3's six invariants
  mentions person-allegations or ruling 19, the operator's only harm-shaped constraint
  ("nothing above likely/moderate from a single uncorroborated document") is keyed on **document
  count, not content class**, and the estimative module is by design unable to see
  `isPersonAllegation` — `estimative.test.ts:361-366` FORBIDS importing `publication-guard`.
  Ruling 19 is inherited rather than circumvented (`synthesize.ts:409-420` recomputes the ladder
  on native pre-promotion hedging, so such a claim enters on the `claimed` row and costs two
  band steps), and all four render sites are accepted-user gated, which is why this is not
  deploy-gating. **Decision:** such claims take the existing, tested `withheld` path
  (`likelihood: null`, rendered "not assessable"; `src/lib/tradecraft/estimative.ts:307`), with
  the allegation flag supplied from OUTSIDE the module — a server-passed boolean or a leaf
  module on the `src/lib/analysis/attribution-labels.ts` precedent — so the import-hygiene
  invariant stands unchanged. **AUD-49 is folded into the same implementation:**
  `corroborationTier` ignores the `doc_dedup` mirrors that `reduce-io.ts:118-126` loads and
  `independentSourceCount` (`reduce.ts:286,367`) consults, so two mirrored documents count as
  two channels and lift the band by up to one step on ALL hedging rows. Presentation only —
  nothing stored changes, no backfill, and a changed cell is a new version, never an edit to V1
  (T3). Implementation is **OPEN-TASKS #121**, owned by the next program's first wave; it is not
  deploy-gating, because every render site is accepted-user gated and the AJP-2.1 credibility
  code is computed and never rendered (T1, `ics206.ts:103-105`).

- **2026-09-11 (C13-b / C10-b — `compound-v1` lands before `CONFLICTS_UI` is turned on)** Step
  24's report (`docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md` §3, "Decisions
  needed 1") found that **C13** — no number produced under `unit-flags-v0` may reach a customer,
  because `compound: false` is the over-credit direction — and **C10** — the `/conflicts` teaser
  tier is PUBLIC at flag-on — collide the moment the flag flips. They do not collide today only
  because `CONFLICTS_UI` is absent everywhere and every conflict route 404s. **Decision: option
  (a)** — build the `compound-v1` derivation and replace the heuristic **before any environment
  sets `CONFLICTS_UI`**. The C10 access-tier split is unchanged, and the shipped
  soak-eligibility banner stays as interim disclosure on gated surfaces only; option (c)
  (banner-as-sufficient-disclosure on a public surface) is a reading of C13 the words do not
  support and is explicitly not taken by silence. This is already the soak's blocker 1, so it
  adds nothing to the critical path — but it now gates the FLAG, not only the soak's report.
  The WS-3.6 enablement checklist carries it as its first gate (§2.0 gate 1, added in the same
  PR as this entry), and §3's question is recorded there as answered rather than open.

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
- Worktrees are created only from a native session on the Mac; a worktree created through
  a Cowork/remote mount writes `/sessions/…` gitdir paths git cannot resolve later (the
  2026-09-05 cleanup found one such orphan — `docs/prompts/2026-09-05-cto-roadmap-handoff.md`
  §4.6).
- Deploys come only from the plain release clone `/Users/go/code/bnow-net-rel-20260823`
  (never a worktree — a CLI deploy from a worktree ships no git metadata and renders a
  blank `/health` commit stamp, OPEN-TASKS #78), via
  `npx vercel@latest deploy --prod --yes`.
- Worktrees: one per PR, created under `/Users/go/code/bnow-net-worktrees/`, and REMOVED
  (`git worktree remove`) in the same session that merges its PR.

## Credentials & integrations

| Service | Env var | Status | Where to get |
|---|---|---|---|
| Neon **control plane** (branch admin) | `NEON_API_KEY` + `NEON_PROJECT_ID` | **live, LOCAL-ONLY BY DESIGN — absent from all three Vercel environments (re-verified 2026-09-08); creates/deletes disposable branches via `scripts/neon-branch.ts` only; project-wide admin, so the deployed app is never given it** | console.neon.tech |
| Neon **data plane** (SQL) | `DATABASE_URL` (pooled) · `DATABASE_URL_UNPOOLED` (direct) | **live.** `DATABASE_URL` is the app's only DB credential (`src/db/index.ts:5`) and the only DB variable in Vercel — present in Production + Preview, absent from Development (2026-09-08). `DATABASE_URL_UNPOOLED` is local-only: its consumers are migrations (`drizzle.config.ts:10`, `scripts/migrate.ts:7`), never the deployed app. Full plane comparison: `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` §4.1. | console.neon.tech |
| Vercel deploy | CLI session (`VERCEL_TOKEN` working, restricted to the bnow-net project — D8/D11, 2026-09-05; corrects the earlier "expired" reading) | **live (CLI)** | vercel.com/account/tokens |
| OpenAI (analysis + ask v2 + embeddings) | `OPENAI_API_KEY` + caps (ruling 4) | **live, spend-guarded** (openai_ask / openai_embed meter separately) | platform.openai.com |
| LLM kill-switch | `LLM_DISABLE=1` | refuses every LLM call site (ruling 9) | (env only) |
| Anthropic | `ANTHROPIC_API_KEY` | **wired for the `digest` workload only** (`model-config.ts`, metered on its own `anthropic_digest` row), **dormant** — no `analysis-reg-v1` approval exists, so every Anthropic dispatch is refused before any reservation; priced rows exist (`claude-haiku-4-5-20251001` $1/$5, `claude-sonnet-5` $2/$10 per 1M tokens). Key present only in the operator's local `.env.local` (D2 = B); absent from all three Vercel environments. | console.anthropic.com |
| Postmark (auth email) | `POSTMARK_SERVER_TOKEN` + `POSTMARK_MESSAGE_STREAM` + `EMAIL_FROM` | **live on bnow.net** (`BNOW.NET <no-reply@bnow.net>`; DKIM/SPF/DMARC/custom Return-Path + callback live-verified 2026-07-15) | postmarkapp.com |
| Sign-in policy | `SIGNIN_MODE` | **Production invite-only since 2026-07-15** (existing user OR admin allowlist OR approved access request) | Vercel environment |
| Cron auth | `CRON_SECRET` | **live** | (already set) |
| Auth.js | `AUTH_SECRET` | **live** (hashes magic-link tokens: rotating it invalidates every unclicked link) | (already set) |
| X via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live, gap-recovered; self-heal production-proven 2026-08-13** (`$150` sprint / `$4` daily since the 2026-09-03 operator raise — #101 resolved; #66 closed 2026-08-14, #38 closed 2026-08-23 on mailbox-confirmed incident + recovery alert emails) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + caps | **live gap-fill; monthly accounting + fixed-cutoff rescore + claim-linked spend eligibility deployed** (rescore `f9aaa9e`; #17 spend subset `be0ebf1` / `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj` 2026-07-16, zero paid calls; fresh 2026-07-16: 1,012 eligible / 475 claim-linked / 232 missing-or-stub of which only 46 are billable; July ledger 780 calls / $85.8000; #17 match-score/caption, kind-safe cleanup #61 + paid #41 remain gated) | opensanctions.org |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` + `TELEGRAM_SESSION` (all in prod env) | **live** (session added 2026-07-11; first fetch + repeated hourly runs verified; registry top-120 ROCA roster) | my.telegram.org |
| PostHog (product analytics) | `NEXT_PUBLIC_POSTHOG_KEY` + `_HOST` (Production only) + `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID` (.env.local, ops) | **LIVE opt-in-only** (US project 512327 "BNOW.NET"; rollback = remove key + redeploy; billing limit configured 2026-07-15; project-membership review remains) | us.posthog.com |
| ACLED | `ACLED_API_KEY`, `ACLED_EMAIL` | stubbed | acleddata.com |
| Stripe | `STRIPE_SECRET_KEY`, … | flagged off | dashboard.stripe.com |
| Resend | `RESEND_API_KEY` | superseded by Postmark | resend.com |

## Next steps / open questions

1. **Operator:** `docs/SETUP-NEXT-WEEK.md` top-to-bottom — VERCEL_TOKEN regen and Stripe.
   bnow.net attach, Postmark sender cutover + DMARC, and MTProto are done.
   (OpenAI credits: done 2026-07-05; keep the billing alert.) The X all-time cap
   decision is RESOLVED: the operator raised `X_SPRINT_USD_CAP` to $150 and
   `X_DAILY_USD_CAP` to $4 on 2026-09-03 (#101 closed; ~2.5 months of runway at the
   ~$1.1/day burn observed before the raise).
2. **`DIGEST_ENGINE=mapreduce` is SET in prod (flipped 2026-07-09) and is producing again
   (#88 CLOSED — PASS 2026-08-27):** the 2026-08-25T02:02Z finalize resumed mapreduce
   naturally and the 6-mapreduce/5-legacy daily matrix has held since (see the Analysis
   bullet). `openai_reduce` is back in its expected ≈$0.10–0.30/day band against
   `REDUCE_USD_CAP_DAILY=2` ($0.17/$0.18/$0.14 on 08-25/26/27). Watch the scoreboard now
   that mapreduce output is reaching validation again. Rollback of the engine itself =
   remove the Vercel prod env var (or set `legacy`) + redeploy. **The 2026-08-28
   reliability queue DELIVERED the reduce + digest #97 sites and closed #87/#98** (see
   the Analysis bullet and `docs/reviews/RELIABILITY-RELEASES-2026-08-28.md`). **The #97 Ask
   family landed 2026-08-29 and the eval corpus-v2 landed 2026-09-03** (26 cases
   admitted; hardening item 6 + the numeral fixtures + the contract cap raise all
   rode it — the QF-C close-before-paid list is fully closed; paid evaluation now
   waits only on the operator §5 decisions, see
   `docs/reviews/PAID-EVAL-OPERATOR-PACKET-2026-09-03.md`). Then: gulf
   theaters onto the map worker, the #33 remap path (corrected 2026-09-10: the operator
   EXISTS in the tree — see the map-lease release — and was EXECUTED on a disposable Neon
   fork for the first time 2026-09-08, under signed D7/R4, for one (theater, track, day):
   701 doc-track pairs, 382 claims, $0.046263 actual against $0.0765 modelled — measured
   $0.0660 per 1k pairs, the estimator conservative by 1.65×; the other five live pairs and
   the full epoch range remain modelled only, and it has never touched production — see the
   2026-09-08 decision-log entry and `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` §19),
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
