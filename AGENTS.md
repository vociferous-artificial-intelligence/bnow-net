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
src/lib/text/       well-formed UTF-16 truncation primitives (the #86 repair — the
                    shared destination for #97-family sites; map+reduce+digest adopted)
src/lib/validation/ ISW scoreboard: keyword gazetteer + majority-vote LLM matcher
src/lib/usage/      SpendGuard, llm-guard (caps + kill-switch), cron-run bookkeeping
src/lib/conflicts/  conflict/region validation domain library (71 files, pure — no DB/
                    provider/env; CONFLICT_REGISTRY, lanes, scorer, match-contract);
                    imported by nothing in production (design docs in docs/designs/)
src/lib/evals/      analysis-eval control plane: eval-guard (fail-closed caps), capture,
                    corpus admission, live-runner/CLI support (docs/evals/analysis/)
src/lib/embeddings/ embeddings client (validation/search vector retrieval)
src/lib/scoreboard/ validation scoreboard read models feeding /scoreboard
src/lib/registry/   source-registry read/view-policy helpers behind /registry
src/lib/analyst/    analyst-facing presentation helpers (signals, digests trust surface)
src/lib/analytics/  PostHog client + consent-gated event allowlist
src/lib/cron/       shared cron-route plumbing (withCronRun bookkeeping, ruling 10)
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
  now including the 2026-09-01 docs-only commits atop `a4ed5cb`). **`main` has since
  moved to `883e5e3`** (2026-09-04: PR #45 `9854626` — eval opt-in capture +
  interrupted-attempt accounting — then PR #46 merge `883e5e3` — validation live
  evaluation five-vote parity; both touch only `src/lib/evals/`, the eval CLI, and
  `src/lib/validation/llm-match.ts`'s pure extraction, none of it reachable from any
  scheduled route), so **`main` is code-ahead of production by these two eval-plane-only
  PRs** — no redeploy has happened or is scheduled for them. PRs #47 (lands two preserved
  2026-08-17 branches, docs-only) and #48 (operator notes + cleanup record) are open on
  top of `883e5e3`, pending the D1 roster decision (§ Decision log below). The prior release
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
  timed_out taxonomy). **#97 umbrella remains OPEN, re-scoped:** the reduce and digest
  provider-bound sites are FIXED AND DEPLOYED; remaining sites = the Ask family
  (user-controlled, highest exposure — next code PR), `embeddings/client.ts`,
  `validation/llm-match.ts`, and the inert anthropic site (#83).
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
  routing seam is deployed: `src/lib/llm/model-config.ts` resolves (model, effort)
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
  2026-08-20. **Deployed, but nothing is activated:** the seam only makes the gate
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
- **Quality/ops:** **3,590 unit tests / 246 files** green (measured 2026-09-04 on the
  eval-capture branch atop `774906f`, typecheck + lint clean; 3,508/241 on the
  2026-08-31 PR #37 head) + **160 real-Postgres integration tests / 25 files**
  (disposable Neon forks; last full run 2026-09-03 on corpus-v2). Historical gates: 3,329/231 + 151/21 on
  the 2026-08-24 release train `e359c61`. Production DB migrated through 0027
  (2026-07-21, verified + idempotent); no strand in the 2026-08-24 release train adds a migration.
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

Entries dated before **2026-08-31** are archived **verbatim** in `docs/DECISIONS.md`;
distilled still-binding decisions live in Standing rulings above. Append new entries at the
END OF THIS SECTION in date order — NOT at the end of the file. (The former end-of-file
convention, which left Conventions / Credentials / Next steps / Operating protocol wedged
mid-log, was retired by the eighth archive pass on 2026-09-07; OPEN-TASKS #92.)

- **2026-08-31/09-01 (map flood OOM incident — detection, bounded recovery, three
  serialized fix releases; #97 embeddings/validation shipped)** During PR #37's
  pre-merge health recheck the session found the hourly map worker OOM-killed
  (runtime-log-confirmed) on every run since 07:40Z: a 07:03Z MTProto long-park
  catch-up had inserted 447 documents dated back to 2026-06-14, the oldest-first
  steady selection spanned 58 days, and the dedup reference BETWEEN materialized
  419,360 rows. Twelve consecutive #98-swept runs; doc_claims frozen 06:40:57Z; NO
  operator email (map_health evaluates only inside completing runs → #103). The
  merge was HELD and the operator authorized a bounded response. Executed: (1)
  read-only diagnosis with live pg_stat_activity + runtime-log capture; (2) manual
  recovery through the EXISTING date-scoped backfill route (normal dispositions —
  no blanket processed updates, no deletion, no remap of never-dispositioned docs):
  whole-range dry estimate $0.4180 gated a $1 allowance, **actual $0.2968**;
  backlog 6,081→0, 2,199 claims recovered, newest-eligible == newest-mapped ==
  08-31; service restored (19:40Z natural cycle healthy) and backlog cleared are
  separately evidenced verdicts; (3) PR #38 `52ea272` — #102 bounded dedup
  (day-span probe + fresh-first split, ±1-day IN-list reference fetch,
  MAP_REF_ROW_CAP=75K sized to the instance from measured ~7.6KB/reference,
  adaptive old-day shedding with loud no-work refusals, revived reference
  exact-md5 arm as a documented contract-valid behavior repair) — three
  independent reviews + two delta reviews, 3,000-trial verdict oracle, deployed
  `dpl_FJ33AS2DKMcme3qwjBiSTyNABxYh` 19:47Z; (4) PR #39 `c0aa788` — #103 watchdog
  independent of map-run completion (atomic slot claim, bounded email send,
  hook after the host row INSERT, inert under test runners), deployed
  `dpl_GxEcce4WiTkF1reDZknaPYDeubjn`; its first natural traversal exposed a
  first-evaluation notification bug (ONE spurious "recovered" email 21:45:15Z —
  a release defect, not an outage event), repaired same-hour in PR #40 `4ab388f`
  and verified non-recurring; (5) PR #37 `a4ed5cb` — the #97
  embeddings/validation `wellFormedSlice` repair, rebased twice with the five
  reviewed files verified byte-identical each time and gates re-run per head,
  deployed `dpl_Bya68YX6a3GaDQe1LnYyMo1YhHkh` ~22:00Z with #40. Observation
  CLOSED PASS 2026-09-01T13:32Z: 132 crons clean; 15 map cycles, 1,507 claims,
  0 batchErrors; both natural checkpoints PROVEN (finalize embed 11 requests/76
  units == 76/76 new claims embedded, provider row updated at the run's finish
  instant; validate `llm-majority` ×5 votes ×3 theaters == 15 llm_match
  requests — keyword fallback dispatches zero, so genuine matcher traversal).
  Binding until superseded: the #102 flood bounds and refusal semantics are load-
  bearing (do not widen MAP_REF_ROW_CAP without re-deriving the memory
  arithmetic); the watchdog contract (never break the host job; honest
  ruling-10 bookkeeping; budget episodes stay owned by in-run map-health);
  the rollback ladder above (never below `52ea272`). #97 stays OPEN: dormant
  `anthropic-provider.ts:70` (repair + #83 wiring + scorecard are activation
  prerequisites — key absence is not a repair) and the ASK_SESSIONS residuals.
  Spend ledger: $0.2968 manual map recovery (of $1 authorized); zero other
  manual paid calls; no cap/env/flag/cron/migration change. Records:
  `docs/reviews/MAP-FLOOD-OOM-INCIDENT-2026-08-31.md`,
  `docs/reviews/EMBED-VALIDATE-RELEASE-2026-08-31.md`.

- **2026-09-03 (operator configuration-only release — X cap raise + #94 override removal;
  recorded after the fact, no operation repeated)** The operator executed packet §1
  option (a) and §2: `X_SPRINT_USD_CAP=150` and `X_DAILY_USD_CAP=4` set in Production,
  Preview, and Development, and the expired `MAP_USD_CAP_DAILY_OVERRIDE_USD`/`_UNTIL`
  pair removed from Production (base `MAP_USD_CAP_DAILY=4` untouched and governing, as
  it had been since the override's 2026-08-17T13:00Z in-code expiry — no runtime
  behavior change from the removal). The daily raise $2.50→$4 goes BEYOND packet
  option (a), which assumed the daily cap stayed $2.50; recorded here as the
  operator's explicit choice (the daily cap remains the real brake, now ~3.6× the
  observed ~$1.1/day burn). Production redeployed as
  `dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` (created 2026-09-03T11:12:43Z, READY, aliased
  bnow.net) from `main` tip `8a19ade` — a code-identical lineage carry-forward (only
  the 2026-09-01 docs-only commits sit atop the previously deployed `a4ed5cb`), so
  `main` == production still holds. Verified this session (read-only): `/health`
  stamps `8a19ade` with matching `data-dpl-id`; `X_DAILY_USD_CAP=4` read back
  plaintext in Production and Development and `X_SPRINT_USD_CAP=150` plaintext in
  Development (the Production/Preview sprint values are sensitive-type secrets the
  CLI cannot read back — presence verified in all three environments, values taken
  from the operator's statement); the override pair absent from every environment; zero
  `EVAL_*` variables anywhere; no candidate model activated. #101 and #94 close.
  No code, migration, DB, flag, cron, or other env change rode this release.

- **2026-09-03 (eval corpus-v2 admitted — maintainer pass over the 26-case packet;
  branch `claude/eval-corpus-v2-20260903`, offline, default-off)** Executed the
  operator packet §7 maintainer review of the preserved 2026-08-27 drafts (manifest
  re-verified 8/8 before and after; originals byte-untouched; all edits in a separate
  reviewed copy + new repo files). Inventory corrected: 26 cases = 21 development +
  5 heldout (the draft README's "31/26" line was wrong on both numbers). All 14 open
  questions adjudicated with an evidence table
  (`docs/reviews/CORPUS-V2-ADMISSION-2026-09-03.md`); the drafts' fed-cutoff
  annotations were STALE in reverse — SCI-N6 (2026-08-28) had already landed the
  production cutoff, so dig-c2-cap-002 passes against the shipped scorer and
  dig-c2-cap-003 became profile-dependent. Shipped: `contractVersion: 2` dataset
  validation (6,000-U16 capacity-doc ceiling, v1 frozen at 1,600), strictly-typed
  capacity metadata, the structural-applicability classification (`inapplicable`
  result status — classified before scoring or dispatch, completeness-neutral, never
  a quality/machinery/gate data point, zero estimated calls), five REPORT-ONLY
  capacity diagnostics (position/straddle/unique-tail/tail-event/late-document
  recall; QUALITY_GATE_METRICS byte-stability-pinned), the checkNumerals gist
  validator pin, QF-C hardening item 6's heldout mustNotMatch pins + the numeral
  fixtures (both inert against committed fixtures), and the v2 union datasets
  map-v2 34 / digest-v2 17 / validation-v2 17 (reduce stays v1; every v1 case
  byte-frozen inside its union, test-pinned; v1 files + results untouched at their
  historical paths; new results basenames prevent identity collision). Admission
  deltas are concentrated in one deterministic transform
  (`src/lib/evals/corpus-v2-admit.ts`) over the byte-identical preserved generator;
  regeneration is proven byte-exact end-to-end (`check-regen.sh`). Pre-admission
  content changes, all recorded: Q10 locality substitution (the -ivka/-ove rows
  collided with real Ukrainian settlements — replaced with synthetic
  -ivask/-ovask), Q12 red_sea→varn_strait synthetic sentinel, provenance rewritten
  to `authored-2026-08-27; admitted-2026-09-03…`. Heldout freeze ledger: per-part
  sha256 frozen before implementation; every heldout offline fixture byte-unchanged;
  deltas mechanical/declared only. Six committed offline results cells (map
  baseline/+depth-4000/+depth-full, digest baseline/+reduce-fed-400, validation
  baseline) — zero machinery mismatches; the capacity matrix estimate now genuinely
  diverges. Gates: typecheck/lint clean · unit 3,545/3,545 (244 files; from
  3,508/241) · integration 160/160 (25 files, disposable Neon fork) · build PASS ·
  offline determinism, --dev heldout-exclusion, drift-refusal, and mutation-kill
  proofs recorded in the admission report §8. ZERO paid calls, zero production DB
  access, zero env changes, zero deploys, zero migrations; no EVAL_* exists; no
  model evaluated or activated. Paid baseline/candidate evaluation remains BLOCKED
  on the §5 operator decisions — next-session packet:
  `docs/reviews/PAID-EVAL-OPERATOR-PACKET-2026-09-03.md`.

- **2026-09-03 (eval baseline-identity repair + operator packet corrections; paid
  campaign authorized — repair PR only, campaign not yet run)** Operator authorized a
  three-part program: this control-plane repair PR, then a LOCAL-ONLY paid evaluation
  campaign (mandatory gpt-4o-mini baseline + gpt-5-nano candidate, both effort-absent,
  ×3 repetitions, cells baseline{map,digest,validation} + map-depth-4000{map} +
  reduce-fed-400{digest}, `EVAL_USD_CAP_DAILY=2`, campaign-local `LLM_SPRINT_USD_CAP=6`
  as a $6 ceiling on the fresh openai_eval ledger of one disposable Neon branch —
  repo-standard reservation-threshold semantics, so terminal spend can exceed it by
  at most one response's cost), then a docs-only closeout PR. NOT authorized: gpt-5-mini/gpt-5/gpt-4o or any
  effort variant, Vercel env changes, deploys, production writes, registry edits/model
  activation, #33 remapping, prompt tuning, post-hoc gate changes, targeted heldout
  reruns. Repair (this PR): `evalDispatchConfig` stamped `approval:
  "evaluation_candidate"` on EVERY model — including the registered production baseline
  gpt-4o-mini/effort-absent, contradicting the packet's CandidateDispatchIdentity
  contract. Now the exact (workload, model, effort) combination the analysis approval
  registry holds as status "baseline" is resolved THROUGH `analysisApproval` and
  stamped `approval: "baseline"`; every other priced combination keeps the isolated
  bypass and the `evaluation_candidate` stamp; the CLI banner prints the actual
  approval. Candidate isolation, the map activation lock, pricing/effort refusals, and
  the production no-bypass posture (isolation.test.ts) are unchanged; a passing
  baseline no longer renders a bogus PROPOSED-registry-entry block (that block is
  correctly evaluation_candidate-only). Deterministic tests pin: registry-backed
  baseline identity for map/digest/validation, gpt-5-nano/gpt-5-mini stay
  evaluation_candidate, unpriced/invalid-effort refusals, preflight approval stamps.
  Review-driven hardening in the same PR: the SAF-m3 production-host equality guard
  now normalizes Neon's "-pooler." pooled/unpooled host aliasing (test-pinned both
  directions) so the production UNPOOLED URL can no longer slip past an equality
  check against the pooled DATABASE_URL.
  Packet corrections (same PR, `PAID-EVAL-OPERATOR-PACKET-2026-09-03.md`): corpus-v2
  "merged-pending"→MERGED (`d96180b`); reduce documented as deterministic/offline
  (never a paid live cell — live workloads are map/digest/validation); initial
  campaign restated as baseline+gpt-5-nano only with fresh 2026-09-03 estimates
  (gpt-4o-mini $2.2503 + gpt-5-nano $1.4330 = $3.6833 expected, over-estimates) and
  the $6 hard ceiling (the prior "$15 worst-case" was unsupportable under the $10
  shared backstop and is superseded); local-only environment posture per packet §9
  (no EVAL_* in Vercel; corpus-v2 + this CLI-only repair NOT deployed). Phase-0
  reconstruction verified before the repair: PR #42 MERGED head `6b1bda6` ≡ merge
  `d96180b` tree; datasets validate; regen proof PASS; all five heldout
  admitted-basis hashes match the admission record; preserved drafts manifest 8/8 OK;
  production /health 200; provider accepts gpt-4o-mini + gpt-5-nano and published
  pricing matches `PRICES_PER_MTOK` exactly. Paid calls remain PROHIBITED until this
  PR is merged and the merged tree is verified identical to the reviewed tree.

- **2026-09-04 (eval capture + interrupted-attempt accounting — PR 1 of the
  methodology follow-up; offline, branch/PR only)** Operator authorized two narrowly scoped
  eval-infrastructure PRs from the adjudication packet
  (`bnow-net-eval-campaign-20260903-artifacts/METHODOLOGY-ADJUDICATION-2026-09-04.md`,
  treated as reviewed evidence, not blanket authorization) and NOTHING else: no paid call,
  campaign resumption, production write, deploy, Vercel/registry change, scorer or gate
  relaxation, label change, corpus replacement, heldout inspection/rerun, Neon-branch change,
  or edit to the frozen campaign worktree/artifacts. The 2026-09-03 campaign stays stopped
  with map FAIL / digest FAIL / validation insufficient_data, ledger ≈ $0.1518, and its two
  abandoned votes accounted separately (they are NOT backfilled into any file).
  Shipped on `claude/eval-capture-accounting-20260904` from `origin/main` `774906f`:
  (1) `src/lib/evals/capture.ts` — opt-in (`EVAL_CAPTURE_DIR`), live-only, fs-injected
  per-attempt JSONL capture: run identity (config/dataset/envKnobs/scorer source hash/git
  HEAD), case/repetition/vote/attempt identity, requested vs returned model, response id,
  finish/refusal/truncation, usage, est USD, raw sha256; raw content separately opt-in
  (`EVAL_CAPTURE_RAW=1`, development only) and heldout raw a third, explicitly acknowledged
  opt-in (`EVAL_CAPTURE_RAW_HELDOUT=1` + `--allow-heldout-raw-capture`, header-stamped);
  separate dev/heldout files; calibration reader refuses heldout by name, declared split
  and line; dir must be gitignored or outside the repo, 0700/0600, credential shapes and
  exact secrets redacted. (2) `dispatchOnce` threads a case context; `attempt_start` before
  dispatch, `attempt_end` AFTER `guard.record` (ruling 8, order test-pinned), `budget_stop`
  on refusal; a capture write failure aborts (before dispatch on start, after metering on
  end, evidence retained). (3) `runLiveSweep` (moved out of the CLI): a budget stop or
  capture failure mid-case records an `abandonedAttempts` entry (reason/code/responses
  received/meter delta/tokens/USD) folded into the file meter with NO result key — resume
  re-lists the case and never reruns completed keys; `provider_error` rows carry
  `partialUsage`; `captureRuns[]` is stamped incomplete before the first dispatch and
  complete (with file hashes) only on a normal finish. (4) `--capture-reconcile` and
  `--capture-inspect` CLI modes (no DB/provider). **No atomicity is claimed** between
  provider billing, ledger metering and capture: an `attempt_start` without `attempt_end`
  is reported `unresolved`, and capture line count is documented as NOT equal to
  `provider_usage.requests`. Historical results files keep their exact shape (round-trip
  byte-identical test on a committed file; campaign-shaped header test) and are never
  backfilled. Production isolation unchanged (isolation.test.ts). Gates on the branch:
  typecheck/lint clean · unit 3,590/3,590 (246 files; base `774906f` measured 3,552/244;
  +38 tests: capture.test.ts, live-sweep.test.ts, 3 CLI subprocess pins). Independent
  adversarial review round 1 (MERGEABLE-WITH-FIXES) found 3 required + 5 recommended
  items — the documented default capture dir was refused before it existed (directory
  ignore pattern; now probed with a trailing slash), reconciliation dispositions were not
  runId-scoped (now completed/abandoned/superseded/orphan per run), and sink-open refusals
  fired after the guard's DB init (sink now opens first) — all eight remediated and
  pinned (+3 tests → 3,593/246). Round 2 confirmed all eight FIXED (reviewer re-ran the
  full suite 3,593/3,593) → MERGEABLE; its three hygiene notes (inspect view shows the
  `refused` flag; `results/*.tmp-*` gitignored; count corrected) folded in before merge.
  **MERGED** as PR #45 → `main` `9854626` (tip `f5def2c`; CI gate + integration PASS;
  `git diff f5def2c origin/main` empty — merged tree ≡ reviewed tree). No deploy. Report:
  `docs/reviews/EVAL-CAPTURE-ACCOUNTING-2026-09-04.md`. Methodology boundaries honoured
  as instructed: no global `required=true` gate, no "increased"/"active" relabel
  (OPEN-TASKS #105 records it as needing semantic adjudication), no blanket
  `expectation=fail` exclusion, injection failures retained as an unresolved safety
  finding (#106), not a scorer defect and not a production incident.

- **2026-09-04 (validation evaluation parity — PR 2 of the methodology follow-up; offline,
  branch/PR only)** Second authorized PR (same envelope and prohibitions as PR 1; campaign,
  production, registry, scorers, gates, labels, corpus, heldout untouched; zero paid calls).
  Defect: the live validation eval dispatched ONE match round while production uses the
  five-vote majority (`MATCH_VOTES` default 5, `majorityFromVotes`). Shipped on
  `claude/eval-validation-parity-20260904` atop PR 1: (1) `src/lib/validation/llm-match.ts`
  exports `MATCH_VOTES_DEFAULT` and the extracted pure `resolveVoteRounds` (≥3 usable →
  majority, 1–2 → first round, 0 → null); production's `llmMatchTakeaways` now calls it —
  behaviour byte-identical (its guard tests unchanged). (2) The live validation case
  dispatches K=5 rounds by default (sequential, one reservation each; production is
  concurrent, same resolution), parses/sanitizes each as production does (a null-content
  refusal is an empty USABLE round, mirroring `llmMatchOnce`'s `'{"matches":[]}'` fallback;
  truncated votes are dropped outright — the one stated difference), applies
  `resolveVoteRounds`, scores the result against `reference.labels`, and records
  `votes {requested, usable, mode, matcher, perTakeaway}` per row. (3) Identity: new knob
  `envKnobs.validationVotes` (set ONLY by the CLI from `--validation-votes`, default 5,
  overriding any shell export) plus a `+votes5`/`+votes1` configKey suffix on every live
  validation file, so no post-parity file shares a path with the pre-parity single-round
  file `live-validation-v2-gpt-4o-mini.json` (never opened, resumed, reinterpreted or
  overwritten; the scorecard labels it LEGACY SINGLE-ROUND — NOT production-equivalent);
  `resumeIdentityMismatch` compares the knob for LIVE validation files only (a legacy live
  file compares as 1 → a 5-vote resume is REFUSED; map/digest and every OFFLINE file never
  compare it, and offline headers never stamp it — the committed offline results resume
  byte-identically).
  (4) `--validation-votes 1` = the explicitly supported single-round DIAGNOSTIC, refused
  in preflight without `--single-round-diagnostic`, labelled non-production-equivalent in
  banner/header/scorecard; every other value refused; a stray `MATCH_VOTES`/`MATCHER_MODE`
  override refuses a live validation run. (5) Estimates count K calls/tokens per case
  (validation-v2: 85 vs 17 per repetition); budget-stop accounting inherits PR 1's
  abandoned-attempt record (voteCount 5). (6) Semantic labels stay separate from the
  deterministic `voteRounds`/`expectMajority` fixture pins; test-pinned that neither reads
  the other and that val-typ-005's committed labels are unchanged (#105 owns any relabel).
  Independent adversarial review round 1 (MERGEABLE-WITH-FIXES): two majors — refusal
  (null-content) rounds were dropped where production counts them as empty usable rounds
  (2 refusals + {X,X,null} flipped X↔null), and the vote knob identity-refused the
  committed OFFLINE validation/conflict results — plus two minors (report baseline-key
  pairing under the vote suffix; unlabelled diagnostic estimate) and three notes, all
  remediated and pinned. Round 2 confirmed all seven FIXED (reviewer re-ran the full suite
  3,612/3,612 on the rebased tip `6bdc0db`; the frozen campaign validation file still refuses
  a 5-vote resume; the committed offline files resume with zero changed files) → MERGEABLE,
  no new findings. Gates: typecheck/lint clean · unit 3,612/3,612 (247 files; +19 tests).
  Report: `docs/reviews/EVAL-VALIDATION-PARITY-2026-09-04.md`; successor plan:
  `docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md`.

- **2026-09-04 (PR #46 merge record — validation live-evaluation five-vote parity)** PR #46
  (branch `claude/eval-validation-parity-20260904`, reviewed tip `6bdc0db`) merged to `main`
  as merge commit **`883e5e3`**, atop PR #45's merge `9854626`. The existing 2026-09-04
  decision-log entry for this PR ("validation evaluation parity — PR 2 of the methodology
  follow-up") records the branch, the review rounds, and the gate numbers (typecheck/lint
  clean · unit 3,612/3,612, 247 files) but not the merge hash — that entry is NOT edited here
  (it stays append-only); this entry supplies the missing hash for anyone reconciling `main`
  against the decision log. `git diff 883e5e3 origin/main` is empty as of 2026-09-05, i.e.
  `origin/main` is `883e5e3`. No deploy accompanied this merge; production remains
  `dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` / `8a19ade`.

- **2026-09-05 (eval successor-plan step 1 authorization + step-1A execution — as reported
  by the operator)** No prior entry in this log records authorizing the eval successor plan's
  "step 1" bounded run before it ran; the successor plan only PROPOSES it
  (`docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md:59-67`): a development-split,
  capture-enabled, production-equivalent baseline run (gpt-4o-mini; `--dev --repetitions 3`;
  `EVAL_CAPTURE_DIR` set, `EVAL_CAPTURE_RAW=1`, heldout raw NOT enabled) on the existing
  disposable Neon branch, within `EVAL_USD_CAP_DAILY=2` and a campaign-local
  `LLM_SPRINT_USD_CAP` the operator names, plus the human labelling/adjudication work.
  Explicitly NOT authorized by that proposal: any heldout run, any scorer/gate/label change,
  any candidate model, any deploy. The 48-hour program's decision sheet answers it at **D6**
  ("Yes Authorize $0.50 to $2.00"; `docs/prompts/2026-09-05-48h-00-INDEX.md` §2), read as the
  operator naming the campaign-local ceiling the plan left blank; the value chosen is $2.00
  (see the D6 addendum entry below). The CTO roadmap handoff §1 states, as fact, that "Step 1A
  (development-split, capture-enabled gpt-4o-mini baseline ×3 + blinded human-labeling packet)
  executed 2026-09-05; artifacts live outside the repo in
  `/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/` (SHA manifests verified)."
  This entry does NOT independently verify that execution — the reconciling session did not
  open the artifacts folder (COMMON §3 forbids it) and ran nothing. It records the handoff's
  claim as **reported by the operator's planning process**. If any detail differs from what
  actually ran, a correcting entry is appended rather than this one edited.

- **2026-09-05 (D1 — PR #48 outreach roster)** `docs/OUTREACH-ROSTER-2026-08-23.md` is
  **removed from git**. The GO-NO-GO register is kept.

- **2026-09-05 (D2 — provider ambition for WS-2)** Option **B is authorized now**: OpenAI plus
  Anthropic, with `ANTHROPIC_API_KEY` added to `.env.local`, proceeding under the **same budget
  envelope** as the OpenAI-only option A. Option C (local OpenAI-compatible models) is a
  provisional yes but **deferred out of this development round** — not needed for at least two
  weeks, on the condition it stays easy to add later. The routing seams therefore ship
  B-complete and C-ready.

- **2026-09-05 (D5 — AGENTS.md compaction approved, with a 150k-character ceiling)** The
  AGENTS.md split is approved: inline window 7 days, strict date order restored when
  reunifying, and — added by the operator as a binding additional constraint — **AGENTS.md
  stays below 150,000 characters**, to avoid the "over the 150.0k-char limit" warning. Note
  for step 15: AGENTS.md was 157,962 characters when this was first drafted (2026-09-05) and
  is over 190,000 characters once these entries land — already past the ceiling, which step
  15's compaction must clear.

- **2026-09-05 (D6 — WS-1.1 capture-run spend authorization)** A campaign-local
  `LLM_SPRINT_USD_CAP` in the range **$0.50 to $2.00** is authorized for the ≈18-map-call,
  ≈$0.01 capture run, on condition that the summary report explains the cap's effect. See the
  D6 addendum entry below for that explanation and the value set.

- **2026-09-05 (D8 — credential confirmations)** `NEON_API_KEY`, `ANTHROPIC_API_KEY` and
  `OPENAI_API_KEY` are confirmed working. **`VERCEL_TOKEN` is valid and correctly scoped to
  the bnow-net project** — this supersedes `docs/BLOCKERS.md`'s stale "expired" framing and
  narrows AGENTS.md's credentials-table reading of "expired but CLI-live". A later pass folds
  the operator's exact wording (valid, restricted to the bnow-net project) into that table.

- **2026-09-05 (D9 — injection-case authorship; already executed by the operator)** The six
  development-split injection cases were authored by the operator directly, outside any agent
  session, using the OpenAI model **Astra** run through OpenAI Codex. This satisfies the
  requirement behind the original decision — the author must not have read the live heldout
  `failures` strings — because no program session authored them. Step 07 therefore records the
  cases as operator-authored and does not re-author them. The earlier ambiguity in the phrase
  "Astra via openai key" is resolved: Astra is an OpenAI model, run in OpenAI Codex.

- **2026-09-05 (E1 — injection-case dataset vehicle)** The injection cases land in a **new
  dataset file `map-inj-dev-v1.json`**, not by pre-creating `map-v3.json`.

- **2026-09-05 (E3 — exposure-ledger home)** The eval exposure ledger lives at
  **`docs/reviews/EVAL-EXPOSURE-LEDGER.md`**, append-only, in dated sections.

- **2026-09-05 (D11 — AGENTS.md standing-text correction authority)** The reconcile session
  (step 01) **may correct AGENTS.md standing text** before step 15's compaction lands, and did
  so under this authorization. One correction the operator named — replacing the VERCEL_TOKEN
  wording in the credentials table with "working, restricted to the bnow-net project" — was
  **not applied in that session** (out of its assigned scope) and is carried forward for step
  15 or a later pass.

- **2026-09-05 (D12 — model names in program documents)** Model names and model
  recommendations are **allowed** in `docs/prompts/*`, `docs/reviews/*`, and this decision log,
  following existing precedent. CLAUDE.md's commit-hygiene rule — no vendor branding in
  commits, PRs, code, or code comments — is unaffected and remains binding. This decision only
  confirms the existing docs-only precedent.

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

- **2026-09-06 (D3 — the conflict-keyed evaluation dataset is validation-v4, not v3)** The
  conflict-keyed validation dataset is created as **v4, after** WS-1.3 freezes the per-country
  v3, so the eval successor plan's step-2 identities stay stable and WS-3 stays off the label
  timeline. Consequence recorded by the step-05 memo (C14): nothing in the 48-hour window
  touches `docs/evals/analysis/` on WS-3's account; `conflict-roca-v1` / `conflict-iran-v1`
  stay OFFLINE under the `validation` workload (`eval-profile.ts:71-78`;
  `conflict-validation-profile.ts:42-46` "NO live path"). Coordination with WS-1.3 is naming
  only (contract version, results basenames) — no shared file.

- **2026-09-06 (D4 — conflict-validation unit decisions C1–C14 signed as recommended; N1
  supersedes the soak design's provider row)** The operator signs every recommendation in
  `docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md` ("yes sign all 14"), binding
  for steps 13, 14, 19 and 24 and superseding the CTO handoff wherever the two differ. What is
  now settled:
  **C1** reference editions use design Option 3 — new `benchmark_report_editions` +
  `benchmark_series_days` keyed by the domain `editionKey`, nullable `isw_report_id` FK,
  **`isw_reports` untouched** (no `series`/`edition` columns, no relaxed unique key, no
  `ru→roca` backfill in DDL); `source_citations`, `sources`, `source_theater_stats` and
  `validation_runs` are unchanged.
  **C2** the `CONFLICT_REGISTRY` becomes production truth through a NEW, UNSCHEDULED
  `src/app/api/cron/conflict-validate` route; the existing per-country `validate` job,
  `validation_runs` and `/scoreboard` numbers stay byte-identical through the window.
  **C3** the denominator is every declared Key Takeaway of the selected edition under the
  frozen `CONFLICT_HEADLINE_LABEL`; `classifyTakeawayTheater` becomes an ATTRIBUTION stored in
  `unit_attribution`, never a filter — which is what removes the RU/UA double count.
  **C4** `designated-final-v1`: discovery records EVERY edition, the cron scores ONE
  observation per (conflict, daily-final winner, day), and the day's headline is derived at
  read time, never by mutating an older row.
  **C5** an edition links `isw_report_id` only when an existing `isw_reports` row's URL
  normalizes to the same `editionKey`; otherwise `citation_anchor = none` and the
  non-independence diagnostic honestly reports `unavailable`. Changing production's probe order
  is deferred to WS-3.7 on step 14's measured evidence.
  **C6** observations are **append-only** — `id serial`, `cron_run_id` FK, partial unique
  `(conflict_id, reference_edition_id, cron_run_id)`, no unique key on (conflict, edition), no
  overwrite path — because the shadow soak grades verdict variance across repeated runs of the
  same days and an overwrite would destroy that instrument (ruling 17 points the same way).
  `withCronRun` gains an optional `runId` callback argument (additive).
  **C7** the Iran/Levant gazetteer stays its own versioned module consumed via
  `gazetteerFor(series)`; `lane-classifier.ts`'s `IRAN_GEO` stays a separate versioned regex
  set, coupled only by a TEST asserting every classifier toponym exists in the gazetteer;
  observations stamp `gazetteer_version`.
  **C8** `legacy_only` gulf theaters keep the SHIPPED contract — excluded from corpus recall,
  labeled MEMBERS of published retention — and the view adds a derived "matched with
  legacy-only evidence" companion count. The handoff's "excluded from the numerator" is NOT
  adopted: it would be a methodology change (new epoch, golden regeneration).
  **C9** ROCA stays `contributorTracks = ["military"]` for the soak; `+elite_politics`
  (`ru-ua-ev-v2`) is a post-soak candidate decided on the soak's §5.1 miss sample.
  **C10** `/scoreboard` STAYS PUBLIC; the country rows are relabeled as evidence lenses by copy
  only (all seven locales), numbers untouched, and the conflict view reuses the existing
  flag-gated `/conflicts/**` routes with a DB-backed provider. The ROUTES-row obligation is met
  by extending `conflict-feature-off.itest.ts`, not by an `authz-page-gate` row.
  **C11** conflict rows carry NO coverage target in this window — numerator/denominator, n,
  label and rung only; the target is set after the soak, by its own entry.
  **C12** the shadow matcher gets its OWN ledger row `llm_conflict_match` with
  `CONFLICT_MATCH_USD_CAP_DAILY` (fail-closed when unset), `CONFLICT_MATCH_DAILY_REQUEST_CAP`
  300, `CONFLICT_MATCH_RUN_REQUEST_CAP` 200 and the `LLM_SPRINT_USD_CAP` backstop — never the
  production `llm_match` row (a shadow budget stop must not starve production validation) and
  never `openai_eval` (a cron route importing `src/lib/evals/*` breaks the eval-library
  isolation contract).
  **C13** a versioned `deriveUnitFlags` seam ships at `unit-flags-v0` with `negative` as a
  deflationary heuristic and `compound` UNDETERMINED (`false`); every observation stamps
  `unit_flags_version` and the view labels such rows "compound handling undetermined — not
  soak-eligible". **Binding condition of this signature:** because `compound: false` is the
  over-credit direction, no number produced under `unit-flags-v0` may leave the internal view —
  not to a customer, not onto `/scoreboard`, not into a report figure. A human-calibrated
  `compound-v1` remains a WS-3.6 prerequisite.
  **C14** is D3 above (v4).
  **N1** — the shadow-soak design's §7 provider row (`openai_eval` + `EVAL_USD_CAP_DAILY`) is
  SUPERSEDED by `llm_conflict_match` + `CONFLICT_MATCH_USD_CAP_DAILY` with **every predeclared
  threshold unchanged** (daily $2, 300/day, 200/run, ≤$25 envelope, `LLM_SPRINT_USD_CAP`
  backstop), so the soak stays predeclared rather than retuned.
  **Ruling-4 ordering, binding at WS-3.6, not now:** deploying the guard with its cap unset
  stops nothing (the path is inert and the ladder falls back to the keyword rung), but
  `CONFLICT_MATCH_USD_CAP_DAILY` must exist in ALL THREE Vercel environments BEFORE the cron
  line is added to `vercel.json`.
  This entry authorizes no deploy, no environment change, no production write, no flag-on and
  no soak; every PR it unblocks lands inert behind step 26's go/no-go.

- **2026-09-06 (N2 — production invocation of `/api/cron/conflict-validate` is forbidden until
  WS-3.6)** Once the route deploys, a `GET` with `CRON_SECRET` WRITES
  `benchmark_report_editions` / `benchmark_series_days` (and, after PR 3.3b, observations) in
  production. Such an invocation is forbidden until the WS-3.6 scheduling entry, with ONE
  exception: a bounded operator smoke over a single date and a single conflict, signed in this
  log before it runs and reported with its counts afterwards. The post-deploy smoke in the
  plan's §6 deliberately calls the route WITHOUT the secret and expects 401.

- **2026-09-06 (N3 — edition backfill authorized after PR 3.2a deploys)** The idempotent, $0,
  LLM-free operator script registering every existing ROCA/Iran `isw_reports` URL as an edition
  row (with `isw_report_id` linked) is authorized to run AFTER PR 3.2a is merged and deployed,
  preceded by a Neon backup branch (Iran-recovery precedent) and followed by a decision-log
  entry with counts. It writes ONLY to the two new tables; `isw_reports` and `source_citations`
  are not touched. It also supplies the ≥1-month real sample the compound-rate measurement
  (register #12.2) needs.

- **2026-09-06 (E4 — val-typ-005 semantic adjudication, #105)** For development case
  `val-typ-005-majority`, takeaway 1's semantic label is **`claimId: null`**: "Air defense units
  were active over Belgorod region" does not establish the INCREASE that defines the takeaway's
  development, and shared activity plus shared location identify a topic, not an event
  (`src/lib/validation/llm-match.ts:75-82` requires the same underlying development and contains
  no "same event, weaker strength" rule). This judgment is independent of the authored 2-2-1
  vote arithmetic. Both `expectMajority` entries stay unchanged (`[{takeawayIndex: 0, final:
  1071}, {takeawayIndex: 1, final: null}]`) — the pin tests fixture arithmetic while live output
  is scored against `reference.labels`, and `validation-parity.test.ts:311-340` deliberately
  makes the two disagree while both pass. WS-1.3 records this reason in the validation-v3
  admission; any changed reference needs a new case ID or `datasetVersion`; existing v1/v2
  datasets and historical results stay frozen. This ruling grants no heldout inspection, rerun,
  scorer change, spend or deployment. Source:
  `docs/reviews/EVAL-VAL-TYP-005-ADJUDICATION-2026-09-05.md`.

- **2026-09-06 (E5 — one authorized write under `docs/evals/analysis/`, scoped to step 19)**
  When step 19 lands the scorer-level per-unit `insufficient_data` diagnostic, the golden
  `cc-matcher-failclosed-013b#B-zero-valid-rounds` changes, its bytes feed
  `conflictDatasetContentHash`, and `hardening-cli.test.ts:193` fails until
  `docs/evals/analysis/results/conflict-roca-v1-offline-fixtures.json`,
  `…/conflict-iran-v1-offline-fixtures.json` and `CONFLICT-EVAL-SCORECARD` are regenerated with
  `--offline --profile conflict --fresh --fresh-ack`. That regeneration is **authorized for step
  19 only**: it is deterministic, costs $0 and contacts no provider, but it is a write under
  `docs/evals/analysis/`, which this program otherwise freezes. Conditions: the PR body shows
  the exact command and the changed golden; an `EVAL-EXPOSURE-LEDGER.md` entry records it; no
  other file under `docs/evals/analysis/` is touched; step 06's PR stays rung-level only so it
  needs no regeneration.

- **2026-09-06 (R1 — Ask per-model attribution shape)** Ask per-model attribution ships as a
  **read-only report over `ask_usage`** (PR-2.1-1): no migration, no environment change, no cap
  split. The `provider_usage.model` column is explicitly NOT taken — `provider_usage` is UNIQUE
  (provider, day), so a model column there would stamp only the last model of each day and
  attribute nothing; per-model provider rows are rejected outright because they would split
  `ASK_USD_CAP_DAILY` and change ruling-4 env ordering. **Consequence: planned migration 0031 is
  not created**, and the window's migration order reduces to 0028/0029 (step 13) then 0030 (step
  16). Revisit after step 4 of the eval program.

- **2026-09-06 (R2 — offline eval identity decoupled from the live registry constant; no version
  bump this window)** `ANALYSIS_ROUTING_REGISTRY_VERSION` is stamped into every offline eval
  results header and compared on resume, and `hardening-cli.test.ts:192-206` pins the committed
  files, so bumping the constant to `analysis-reg-v2` would rewrite files under
  `docs/evals/analysis/` for no benefit. Step 12 decouples the offline identity from the live
  constant (PR-2.2-2) and the bump is deferred until the first non-OpenAI approval actually
  lands, when it carries its own inventory pass.

- **2026-09-06 (R3 — `hasScorecard()` gates the Ask Auto money path)** The Auto money path
  checks `hasScorecard()` and DEGRADES (provider `"unscorecarded"`) rather than throwing, behind
  a test that pins baseline behaviour byte-identical when no environment override exists — so an
  environment with no override behaves exactly as it does today.

- **2026-09-06 (O1 — Vercel log drain into our own Neon-backed receiver; 14-day retention)**
  OPEN-TASKS #93 is closed by option (a): a receiver route `/api/logs/drain` on our own
  deployment inserting into our own `runtime_logs` table, retention **14 days** swept inside the
  drain route, and the operator registers the drain through the Vercel dashboard AFTER the
  receiver deploys with `LOG_DRAIN_SECRET` already set in Production (ruling-4-style ordering,
  even though the secret is not a spend cap). **Clarification of record:** the operator's H0 note
  that "Neon does not support drains on the Launch plan" concerns a Neon-side log-export feature
  this design never uses — the receiver needs nothing from Neon beyond ordinary table writes, and
  the only platform capability required is the Vercel drain, which the operator confirmed the
  plan supports. The contrary sentence in the H0 draft
  (`docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md`, section (c), O1) was therefore never
  signed; this entry is the whole of O1.

- **2026-09-06 (O2 — #79 RU ROCA citation drain authorized, with a backup branch)** The operator
  is authorized to run `scripts/isw-refresh.ts --theater ru` (and `--retry-failed` if the dry run
  shows fetch failures) followed by `scripts/registry-materialize.ts` against PRODUCTION, per
  `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`, preceded by a Neon backup branch
  kept until the closing entry is written and then deleted. Cost is **$0** — neither script
  imports any LLM module; egress is to understandingwar.org only, disk-cached, ≥2 s/host. Scope:
  the ~36 `parse_status='pending'` `ru` reports 2026-07-04 → 2026-08-14, the same historical
  staleness the 2026-08-15 Iran recovery fixed for `ir`.
  **Recorded consequence, so it is not discovered later as a surprise:** `registry-materialize`
  is a full DELETE + rebuild of `source_theater_stats` in one transaction and also updates the
  global reliability columns on `sources`, and the digest gather orders documents by
  `s.reliability_score` (`src/lib/analysis/digest.ts:89,100`). Draining RU citations therefore
  changes WHICH documents enter subsequent ru digests — the intended repair, but a live behaviour
  change, not a passive backfill. Run it away from the 02:00Z finalize; the closing entry records
  the counts and the first post-drain ru digest and scoreboard row.

- **2026-09-06 (D10 — migration order for the window)** The INDEX §4 assignment is accepted, less
  the migration R1 removed: **0028** `benchmark_report_editions` + `benchmark_series_days` and
  **0029** `conflict_validation_observations` (both step 13, merged in that order), then **0030**
  `runtime_logs` (step 16). No 0031 (R1 = read-only report). `9999_claim_source_trigger.sql`
  stays last; each migration PR rebases onto `main` and regenerates before merge; no applied
  migration is renumbered (ruling 5).

- **2026-09-06 (T1 — ICS 206-01 descriptors and ICD 203 estimative language become the product
  vocabulary)** ICS 206-01 source descriptors and ICD 203 estimative language are the user-facing
  vocabulary; NATO AJP-2.1 / Admiralty two-axis codes are derived EXPORT fields only, never the
  primary presentation (`docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` §5 item
  9).

- **2026-09-06 (T2 — access date in citation mode)** The citation mode shows `fetched_at` labeled
  **"Accessed (BNOW ingest)"**, and only in citation mode. This deliberately reverses the
  2026-07-16 decision to hide the ingest timestamp, for the narrow case of a citation a reader
  must be able to reconstruct.

- **2026-09-06 (T3 — WS-7 mapping approach agreed, tables NOT yet signed)** The operator agrees
  to the approach of two versioned mapping tables (ICD 203 band × confidence; 1–6 credibility)
  with a per-cell rationale and the constraint that no cell may exceed "likely" / "moderate" from
  a single uncorroborated document. **The tables themselves are NOT yet signed** — step 29 drafts
  them as data and the operator signs before step 34's first PR. No WS-7 PR may ship a mapping
  cell until that signature exists.

- **2026-09-06 (R6 — caps for the Anthropic metering row: reuse the existing envelope)** The new
  provider row `anthropic_digest` reuses **`LLM_SPRINT_USD_CAP`** (all-time backstop) and
  **`LLM_DIGEST_USD_CAP`** (daily). **No new environment variable is created.** This is the
  entity-audit precedent, it is what D2's "Same Budget" means in practice, and it avoids the
  ruling-4 ordering obligation (a cap env present in all three Vercel environments before the
  guard deploys) for a path that is dormant in this window anyway. The rejected alternative,
  `ANTHROPIC_DIGEST_USD_CAP`, is strictly more operational work for identical protection.
  Unblocks PR-2.2-B1 (step 20b).

- **2026-09-06/07 (R7 — Anthropic pricing is per-model rows, each operator-verified; Haiku 4.5
  entered, Sonnet 5 held)** `PRICES_PER_MTOK` in `src/lib/llm/pricing.ts` is a TABLE — one row
  per model, keyed by the exact API identifier — so pricing a model is NOT a choice of one model
  for the whole provider. Every model the router may select gets its own row, and per-workload
  model selection is unaffected by this decision. What is binding is the gate: a model with no
  row is REFUSED by `workloadDispatchConfig` before any reservation, and **that refusal is the
  intended fail-closed state, not a defect** — a later session must not "fix" it by guessing a
  price. Each row is added by a code PR carrying the operator-verified list price in its body
  (the embedding-table precedent), and Anthropic rows must set `ModelPrice.provider` explicitly,
  so a same-named model on two vendors can never share one price by accident.
  **Verified 2026-09-07 against the vendor's published pricing page and entered:**
  `claude-haiku-4-5-20251001` at **$1.00 in / $5.00 out** per 1M tokens — the operator's list and
  the vendor page agree exactly, and it is the appropriate first model for the digest workload.
  **NOT entered, held pending resolution:** Claude Sonnet 5, where the operator's list gives
  **$3.00 / $15.00** (introductory $2/$10 stated as expired 2026-08-31) while the vendor's
  pricing page still showed **$2.00 / $10.00** when checked on 2026-09-07. One of the two is
  stale. This is precisely the 2026-08-20 gpt-5-mini situation, in which a wrong number
  under-metered spend 2×, so Sonnet is entered only after the figure is confirmed against actual
  console billing — ground truth in a way a documentation page is not. Opus 5 ($5/$25) and Fable
  5.1 ($10/$50) agree across both sources and may be added when a workload needs them; the
  parked-branch note under R5 (local model ids stay out of `PRICES_PER_MTOK`) is unaffected.
  Unblocks PR-2.2-B2 (step 20b) for Haiku only.

- **2026-09-06 (D6 addendum — effect of the campaign-local `LLM_SPRINT_USD_CAP`; value set at
  $2.00)** The authorized value is the **all-time total cap for ONE provider row**, compared
  against that row's cumulative lifetime total before each dispatch
  (`src/lib/usage/spend-guard.ts:122`) — not a per-run budget and not a daily cap. For the WS-1.1
  capture run the row is `openai_eval` on the kept disposable Neon branch, whose ledger **already
  holds ≈$0.15** from the 2026-09-03 campaign; that prior spend counts against whatever value is
  chosen, so $2.00 leaves ≈$1.85 of headroom against a run that costs ≈$0.01 (≈18 map calls).
  Because the check is a threshold test taken BEFORE dispatch, terminal spend can exceed the
  ceiling by at most one response's cost. It never acts alone: `EVAL_USD_CAP_DAILY` must also be
  set (=2 per the successor plan) or the guard refuses everywhere — `eval-guard.ts` deliberately
  has no out-of-production default. And it is **campaign-local**: a shell variable for a local CLI
  run bound to a disposable branch, never written to any Vercel environment, so production's
  shared $10 backstop and every production ledger row are untouched.
  **Value set: $2.00**, the top of the authorized range, chosen so a retry or a second capture
  pass cannot force a mid-run cap edit. Because it is a shell variable, the figure is adjustable
  at any time by re-exporting it and does not require a further decision entry unless the ceiling
  itself is raised above $2.00. The executing session records the exact value, the branch id, and
  the before/after `openai_eval` ledger reading in `docs/reviews/EVAL-EXPOSURE-LEDGER.md`.

- **2026-09-06 (R5 — the "#108" locator names a parked branch)** The identifier "#108", which
  appears in the CTO roadmap handoff but is not an OPEN-TASKS item, refers to the parked branch
  **`claude/local-model-ask-eval-20260817`**. Verified at signing: the branch exists both locally
  and on `origin` (tip `8a0ca89`, "ask-eval: offline fidelity harness + local-model scorecard
  (official vs modified Gemma)") and is NOT merged into `main`. Its disposition is unchanged by
  this entry — it stays OUT per `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md` §5.5
  (its Ask-specific CLI collides conceptually with the repository-owned eval control plane;
  reconcile separately), and its binding notes stand: local model ids stay out of
  `PRICES_PER_MTOK`, `ASK_ANSWER_MODEL` remains `gpt-5` in every Vercel environment, and no local
  model promotes without its own paid scorecard. Related debt stays tracked as OPEN-TASKS #100
  (the untracked `ask-eval-harvest.ts` isolation exemption).

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
   theaters onto the map worker, the #33 remap path (the operator
   now EXISTS in the tree — see the map-lease release — but has never been RUN; its
   production deployment is recorded in the closeout decision-log entry, not here),
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
