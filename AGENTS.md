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
src/lib/text/       well-formed UTF-16 truncation primitives (the #86 repair, shared by
                    every provider-bound truncation site — #97 family)
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

## Current state — compact snapshot (verified 2026-08-27; correct in place)

Detailed operational/product state lives in `docs/CURRENT-STATE.md` and is corrected in
place whenever reality changes. Historical narrative: `docs/PROGRESS.md` + `docs/reviews/`;
debt: `docs/OPEN-TASKS.md`; decision history: `docs/DECISIONS.md`.

- **Live/repository:** https://bnow.net · Vercel `bnow-net` / team `vociferous`; production
  is **`dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6` / `main` merge `b62da02` — the 2026-08-28
  reliability queue** (PRs #27/#28/#29/#30 released SERIALLY overnight from the plain
  release clone, each with its own gate, deploy verification and natural observation,
  all PASS: #97 reduce site → #87 mechanical digest fix → #87 degraded-run
  classification → #98 timeout sweep; record + rollback chain:
  `docs/reviews/RELIABILITY-RELEASES-2026-08-28.md`). `/health` 200 stamping
  **`b62da02`**, DB OK; anonymous bare+`RSC: 1` bodies re-verified clean after every
  deploy. **Rollback target = `dpl_5ocJPF4GLPHDFB4Cv3MB4tgkScou`** (`ad6e078`, the
  release before the sweep). `main` (`bf0061b`) is DORMANT-EVAL code ahead of
  production — PRs #31 (capacity-profile eval harness), #32 (QF-C hardening) and #33
  (conflict soak instruments) landed after the runtime queue and ship no reachable
  runtime behavior (no `EVAL_*` env exists; nothing imports the instruments); they ride
  the next natural deploy, and no redeploy is needed for them. The 2026-08-24 release
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
- **Quality/ops:** **3,421 unit tests / 239 files** green (measured 2026-08-28 on the
  final merged `main` `bf0061b`, typecheck + lint clean) + **155 real-Postgres
  integration tests / 23 files** (as of the PR #30 branch gate; every reliability branch
  ran the full suite on a disposable Neon fork). Historical gates: 3,329/231 + 151/21 on
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
| X via twitterapi.io | `X_API_KEY` + `X_SPRINT_USD_CAP` | **live, gap-recovered; self-heal production-proven 2026-08-13** (`$75` sprint / `$2.50` daily; #66 closed 2026-08-14, #38 closed 2026-08-23 on mailbox-confirmed incident + recovery alert emails) | api.twitterapi.io |
| OpenSanctions | `OPENSANCTIONS_API_KEY` + caps | **live gap-fill; monthly accounting + fixed-cutoff rescore + claim-linked spend eligibility deployed** (rescore `f9aaa9e`; #17 spend subset `be0ebf1` / `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj` 2026-07-16, zero paid calls; fresh 2026-07-16: 1,012 eligible / 475 claim-linked / 232 missing-or-stub of which only 46 are billable; July ledger 780 calls / $85.8000; #17 match-score/caption, kind-safe cleanup #61 + paid #41 remain gated) | opensanctions.org |
| Telegram MTProto | `TELEGRAM_API_ID/HASH` + `TELEGRAM_SESSION` (all in prod env) | **live** (session added 2026-07-11; first fetch + repeated hourly runs verified; registry top-120 ROCA roster) | my.telegram.org |
| PostHog (product analytics) | `NEXT_PUBLIC_POSTHOG_KEY` + `_HOST` (Production only) + `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID` (.env.local, ops) | **LIVE opt-in-only** (US project 512327 "BNOW.NET"; rollback = remove key + redeploy; billing limit configured 2026-07-15; project-membership review remains) | us.posthog.com |
| ACLED | `ACLED_API_KEY`, `ACLED_EMAIL` | stubbed | acleddata.com |
| Stripe | `STRIPE_SECRET_KEY`, … | flagged off | dashboard.stripe.com |
| Resend | `RESEND_API_KEY` | superseded by Postmark | resend.com |

## Next steps / open questions

1. **Operator:** `docs/SETUP-NEXT-WEEK.md` top-to-bottom — VERCEL_TOKEN regen and Stripe.
   bnow.net attach, Postmark sender cutover + DMARC, and MTProto are done.
   (OpenAI credits: done 2026-07-05; keep the billing alert.) **NEW: the X all-time cap
   needs a decision before fail-closed exhaustion** — `x_api` measured $57.6724 of the $75
   `X_SPRINT_USD_CAP` on 2026-08-27, ~$1.04/day recent burn ⇒ roughly 17 days of runway as
   a point-in-time projection (OPEN-TASKS #101).
2. **`DIGEST_ENGINE=mapreduce` is SET in prod (flipped 2026-07-09) and is producing again
   (#88 CLOSED — PASS 2026-08-27):** the 2026-08-25T02:02Z finalize resumed mapreduce
   naturally and the 6-mapreduce/5-legacy daily matrix has held since (see the Analysis
   bullet). `openai_reduce` is back in its expected ≈$0.10–0.30/day band against
   `REDUCE_USD_CAP_DAILY=2` ($0.17/$0.18/$0.14 on 08-25/26/27). Watch the scoreboard now
   that mapreduce output is reaching validation again. Rollback of the engine itself =
   remove the Vercel prod env var (or set `legacy`) + redeploy. **The 2026-08-28
   reliability queue DELIVERED the reduce + digest #97 sites and closed #87/#98** (see
   the Analysis bullet and `docs/reviews/RELIABILITY-RELEASES-2026-08-28.md`). **Next
   code PRs: the #97 Ask family** (user-controlled truncation sites through
   `wellFormedSlice`) **and the eval corpus-v2 landing** (drafts machinery-verified;
   carries hardening item 6 + the numeral fixtures + the contract cap raise). Then: gulf
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

- **2026-08-22 (QF Worktree B — durable map lease + version-aware remap: merged, deployed,
  24h lease soak OPENED)** The audited QF Worktree B (`c40060e`) was isolated onto its own
  branch, rebased `--onto origin/main 05fdd2c` with an **EMPTY conflict ledger** — `git
  range-diff` shows all seven B commits `=`, the path inventory is identical (14 paths),
  and both the non-doc patch (124,060 bytes) and the full patch are **byte-identical** to
  the audited original. B never touched AGENTS.md, so no append-only document needed
  merging. Repairs on top closed the audit findings the release required: REMAP-1 and L4-1
  are now pinned by always-run unit tests over an in-memory Pool (remap never writes
  `processed`, including a partially-dispositioned `processed=false` doc whose other track
  remains hourly-worker work; both previously-unpinned lease-gated write gates), REMAP-3
  swept every numeric CLI input fail-closed in both drivers AND at the route, REMAP-5 +
  SAF-m4 bound the remap checkpoint to a credential-free route target with a missing
  binding treated as a mismatch, and L4-2's "never a second writer" absolute was WITHDRAWN
  from code and report alike in favour of the exact residual (diagnostic-only fence,
  check-then-act ownership re-check, renew-to-COMMIT window, mixed-generation
  first-writer-wins bound, fence column deferred as #85). The governing QF prompt is now
  tracked verbatim from the audit's preserved blob `2919970` (SHA-256 `7a5562…6fcc`,
  closing G1). A genuine pre-existing clock-dependent test flake — failing within ~62
  minutes of UTC midnight, reproduced at 23:54Z on the audited tip — was also fixed.
  **Three adversarial review rounds ran against exact SHAs** (`028a123`, `11e0754`,
  `85f364d`). The governing prompt specifies Fable 5 reviewers; both Fable 5 reviewers
  terminated with a model-side safeguard error, so under the operator's explicit override
  both ran as Opus 5 (`claude-opus-5[1m]`, self-reported; effort configured-by-spawner, not
  self-verifiable). Verdicts: round 1 PASS-WITH-MINORS ×2, round 2 PASS-WITH-MINORS ×2,
  round 3 PASS-WITH-MINORS (lease, "merge-ready tree") + PASS (spend). No BLOCKER, HIGH or
  MAJOR in any round. The reviewers constructed 21 mutations; the survivors were the
  valuable part and all are now closed — most importantly **the `persistBatch` ownership
  gate, the only one of four lease-gated write paths whose writes come from a BILLED call,
  had no always-run cover and its deletion passed the entire pre-push gate** (found
  independently by both reviewers; the 2026-08-18 audit had recorded it as covered, so the
  release prompt named only two unpinned paths). Also closed: the three lease SQL
  predicates were itest-only; two of the release's own new pins were non-discriminating;
  `?cap=0` at the route manufactured a false "day drained"; `--theater` was unvalidated so
  a typo printed a confident REMAP COMPLETE over zero work; the lease-busy wait was
  unbounded and indistinguishable from a DB failure; and a dry run promised a dispatch the
  activation lock would refuse. Gates on the merged head `85f364d`: typecheck clean · lint
  0/0 · unit **2,309/2,309 (176 files)** · production build PASS · disposable-Neon
  integration **118/118 (19 files)** · pre-push green · every guard mutation-proven · 12
  malformed remap invocations all refused before any route call against an unroutable base.
  CI's `integration` job CLEAN-SKIPS (this repo has no Actions secrets, `NEON_API_KEY` is
  empty) — that green check is NOT evidence and the local disposable-Neon run is. Merged as
  PR #7 `23a1280` (merge commit, history NOT squashed; tree byte-identical to the reviewed
  head) and deployed EXACTLY ONCE from a fresh clone as
  `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`, `/health` stamping the full merge SHA `23a1280` with
  DB OK. Ruling 21 re-proven live on the new build: for all ten gated routes the anonymous
  bare-GET body adds zero words beyond the public signin/landing content, and the `RSC: 1`
  payload carries `NEXT_REDIRECT;replace;/signin;307` or `NEXT_HTTP_ERROR_FALLBACK;404` —
  a gate directive, not a serialized page. **First natural lease cycle (01:40:16Z →
  01:43:01Z, no cron manually invoked): ok=true, outcome `acquired`, fence 1, 57 renewals,
  lost 0, released 1, leaseLostDiscards 0, baseline dispatch, the same four extractor
  versions as before the deploy, 138 claims / $0.0168 in the normal band; afterwards
  `provider_state.map_lease` = `{"fence": 1}` (fence kept, token absent) and `pg_locks`
  holds ZERO advisory locks — the #77 mechanism is gone from production.** Binding until
  superseded: the **24-hour formal LEASE SOAK is OPEN, 2026-08-22T02:00:00Z →
  2026-08-23T02:00:00Z**, and during it no remap execution, runtime deployment,
  environment/cap change, model activation, manual cron invocation or paid evaluation is
  permitted; the closeout checklist is §8 of the release report. **#77 and #33 are NOT
  closed** — the lease is implemented and awaiting its soak, and the remap operator is
  deployed but has NEVER been executed, so remap is not production-proven and no yield,
  cost or completion figure for it exists. Unlocking the MAP activation lock still
  additionally requires an executed, costed corpus remap under explicit spend authorization
  plus a paid representative scorecard (#81). Report:
  `docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md`.

- **2026-08-23 (QF-B map-lease 24-hour production soak — CLOSED, PASS; #77 and #38 closed;
  documentation-only release)** The formal lease soak opened by the 2026-08-22 entry closed
  on its stated window **2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z** and every figure was
  re-derived independently from the production record for this closeout rather than taken
  from the prior session's dossier. **`QF_B_SOAK_VERDICT=PASS`, `LEASE_SOAK_STATUS=CLOSED —
  PASS`.** Production is unchanged and still serves `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`
  (`/health` HTTP 200, `data-dpl-id` matches, build stamp `23a1280`, DB OK; `vercel ls`
  newest production deployment is that one, 1 d old); `origin/main` `7976ecb` differs from
  the deployed merge `23a1280` in exactly five DOCUMENTATION files and no runtime path.
  In-window evidence: **24** map `cron_runs` rows over 24 distinct UTC hours, 0 off-schedule
  minutes, 24 `ok=true`, 0 `ok=false`, 0 `finished_at IS NULL`, 0 non-null `error`; ONE
  distinct `counts.lease.outcome` = `acquired`; fences **2–25**, 24 distinct, every delta
  +1, pre-soak first fence 1, and the entire lease era is a gapless 1..35 (35 rows, 35
  distinct fences, 0 non-acquired, 0 skipped, 0 budget stops) — which is itself the proof
  that no unlogged script, backfill, remap or takeover ever held the lease; `lost=0` and
  `released=1` on all 24; `leaseLostDiscards=0`; **1,541** renewal attempts, **1,541**
  successes; reported claims **3,995** exactly equal to `doc_claims` rows created in-window;
  batches 1,041 with 591 batch errors (**56.8%** — the pre-existing #86 rate, see below);
  `llmCalls` 452 == `llmRequests` 452 (ruling 8: one metering per physical dispatch);
  `processedMarked` 13,038; residue `provider_state.map_lease` = `{"fence": 25}` at
  window close and `{"fence": 35}` when re-read for this closeout (2026-08-23T~12:2xZ), a
  single key with no token either time; **0** advisory locks; one baseline dispatch identity (`gpt-4o-mini` /
  effort `null` / `analysis-reg-v1` / `baseline` / workload `map`); only the four current
  extractor versions (`d73cc83ed8df`, `75e0ff6403db`, `15a6078371bd`, `19c06260f149`); 86
  Vercel env rows / 48 distinct names with zero routing variables and no
  `MAP_LEASE_TTL_SEC`; no migration; and **zero `map:remap` rows in `cron_runs`, ever**.
  Spend, read 2026-08-23T~12:2xZ (an as-of reading on a live series, not a window total):
  `openai_map` $0.5043 on 08-22 against `MAP_USD_CAP_DAILY=4`, $17.0377 all-time against
  `MAP_SPRINT_USD_CAP=40`.
  Independent review PASS (0 BLOCKER / 0 HIGH / 0 MEDIUM / 2 MINOR / 5 NOTE, both MINORs
  being evidence-quality criticisms of the dossier, both corrected). Post-window continuity
  10/10 cycles, fences 26–35, clean. `ROLLBACK_RECOMMENDED=NO`.
  **The PASS is bounded and the bounds are part of the ruling.** (1) Production exercised
  the steady single-holder path ONLY — contention, `expired_takeover`, `busy`, the loss
  latch and the discard path never fired, so contention handling stays test-proven, not
  production-proven (filed as #95). (2) There is NO retained runtime-log coverage of the
  formal window (Vercel CLI caps at 100 records; no log drain — filed as #93); the durable
  `cron_runs` record plus four stores the counts payload does not write (`doc_claims`,
  `doc_map_state`, `provider_state`, `provider_usage`) plus out-of-band operator email are
  the evidence. (3) `pg_locks` readings are point-in-time and carry no window coverage — the
  Neon compute restarts (again at 2026-08-23T12:25Z); what is load-bearing is that the map
  path no longer calls `pg_try_advisory_lock` at all. (4) **`counts.lease.lost` — not
  `leaseLostDiscards` — is the authoritative lease-loss counter** (the discard counter can
  undercount on the truncation-split recursion path; filed as #96). (5) Claims-reported ==
  claims-persisted proves no rollback and no `ON CONFLICT` suppression; it does NOT prove
  that nothing could ever have been discarded before either counter incremented.
  (6) Nested `counts.*` sub-objects must be swept on EVERY job, not just `ingest:x`: two
  in-window `digest:*` runs (`digest:finalize` 08-22T02:00:40Z, `digest:intraday`
  08-22T10:03:16Z) and TWO after the window (`validate` 08-23T07:00:49Z — a NON-digest job —
  and `digest:intraday` 08-23T10:03:16Z) carried `counts.errors=1` while `ok=true` and
  `error` was null. Pre-existing **#87**, on paths QF-B never touched, and wider than #87's
  original `digest:finalize` scoping. Do not claim "zero errors across every job" for this
  window.
  **#77 (the stranded map advisory lock) is CLOSED** on the evidence above. **#38 is also
  CLOSED, but NOT on the basis the soak dossier recommended:** its remaining criterion was
  independent confirmation that an X-health incident/recovery email actually reached the
  configured recipient, and the four in-window map-health emails come from a different
  evaluator (`map-health.ts`), so they do not satisfy it. What does: the operator mailbox
  (`go@vociferous.nyc`) holds `[BNOW] X ingestion unhealthy: incomplete, request_failures`
  delivered 2026-08-22T18:05:46.635Z and `[BNOW] X ingestion recovered: resumed` delivered
  2026-08-22T19:04:17.601Z, matching the `ingest:x` runs 18:02:36Z→18:05:47Z
  (`alertKind=1, alertReasons=2, alertDelivery=1, requestFailures=2, incomplete=1`) and
  19:02:36Z→19:04:18Z (`alertKind=2, alertDelivery=1, requests=55`) field-for-field, with
  TWO further independent incident/recovery pairs on 2026-08-21. Mail held by Postmark and Gmail cannot be produced
  by a doctored database row.
  **Still open:** #85 and #90 (the two accepted lease residuals), #86 (the surrogate-splitting
  map truncation, ~57% of micro-batches rejected — the next repair), #87 (digest swallows
  nested errors), #88 (the last mapreduce digest was 2026-08-16T19:32:38Z; every digest created on or
  after 2026-08-17 is legacy), plus the newly filed #92–#96.
  **Independent review of this closeout (fresh Opus 5, read-only):** PASS-WITH-MINORS —
  0 BLOCKER / 0 HIGH / 1 MEDIUM / 6 MINOR / 5 NOTE, all applied before merge. It
  independently re-derived every asserted figure from production and found no numerical
  error and no overclaim. The MEDIUM was PRE-EXISTING standing text this closeout had left
  alone: the "Analysis model routing (repository code — NOT deployed)" bullet still claimed
  production ran `9c5e9cb`, false since the 2026-08-20 PR #5 release — corrected in place
  above. MINORs corrected the post-window nested-error sweep (two rows, one of them the
  NON-digest `validate` job), the number of corroborating X alert pairs, five stale "~50%"
  #86 figures, two stranded Candidate-B-era sentences, a stale #38 line in
  `docs/SETUP-NEXT-WEEK.md`, and two 2026-08-14 snapshot-header dates. It also produced the
  structural, time-independent form of the #77 claim: a repository-wide grep finds ZERO
  `pg_try_advisory_lock` / `pg_advisory_lock` / `pg_advisory_unlock` CALL SITES in `src/`
  or `scripts/` — only two comment lines in `map-lease.ts`.
  **This release is DOCUMENTATION ONLY:** no source file, migration, environment variable,
  cap, model, schedule or cron was touched; no deployment, promotion or rollback was made;
  no cron was invoked; no remap was executed or dry-run; no paid provider call was made; and
  every database statement in the closeout was a `SELECT`. The AGENTS.md decision-log archive
  move to `docs/DECISIONS.md` was deliberately NOT performed here and is filed as #92.
  Report: `docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md` §9.

- **2026-08-23 (OPEN-TASKS #86 — map Unicode batch repair: isolated, same-version;
  deployment recorded separately)** `mapDocLine` truncated the composed document body with a
  UTF-16 CODE-UNIT slice, so a ceiling landing between an astral character's two halves left
  an UNPAIRED surrogate in the provider-bound user message. Since ES2019 `JSON.stringify`
  emits that half as the literal escape `\udXXX` rather than a raw byte (measured:
  `JSON.stringify("abc\uD83C")` → `"abc\ud83c"`, UTF-8 `226162635c756438336322`, pure
  ASCII), the body reaches the provider carrying a lone-surrogate escape, the strict
  server-side parser refuses it, and the ENTIRE 20-document micro-batch dies with
  `400 Invalid body: failed to parse JSON value`. Confirmed three ways — that serialization
  measurement; a synthetic reproduction on the unpatched tree rejecting a 20-doc batch at
  `$.messages[1].content`; and a read-only replay of the worker's own selection predicate
  over the 10,000 oldest eligible documents finding **20** boundary splits, every one at
  index 1499, every one an emoji high half, each still `processed=false` with zero
  `doc_map_state`/`doc_claims`/`doc_dedup` rows. Those 20 yield **31 doc-track pairs** (11
  are both military and elite_politics), which is exactly the 25 failing batches the cycle
  has recorded, unchanged, for 21 consecutive hours alongside frozen `selected=1000`,
  `alreadyMapped=139` and `processedMarked=537`. **The 2026-07-16 onset was PROVIDER-side,
  not runtime-side** — well-formed `JSON.stringify` predates the corpus, and five orphaning
  documents were successfully extracted 2026-07-09→07-13. Repair, in
  `src/lib/analysis/map-prompts.ts` only: `wellFormedSlice` slices to the SAME
  `MAP_CONTENT_CHARS` code-unit ceiling FIRST and repairs SECOND (repairing first could let
  a pair shift across the ceiling and be split again), and `dropIsolatedSurrogates` DROPS
  isolated halves rather than replacing them, so the output stays a subsequence of the
  input's scalars and the model is never shown a character the source lacked — which matters
  because map hard rule 4 asks it to quote character-for-character. The whole composed line
  is repaired, not just the body. **Binding invariant:** everything `mapDocLine` returns is
  well-formed UTF-16, never longer than the code-unit ceiling, and a code-unit subsequence
  of its input; grapheme integrity is explicitly NOT promised (a truncated ZWJ sequence or
  stranded variation selector is valid Unicode and cannot produce a 400).
  **SAME EXTRACTOR VERSION, and this is the ruling:** the version basis is model + system
  prompt + frame rev + content budget, the truncation algorithm was never in it, and none of
  the four moves. Byte-identity is MEASURED, not argued — over 10,000 real production
  documents, 9,980 lines are byte-identical and the 20 that change were all already carrying
  an isolated surrogate, each exactly one code unit shorter. The four live versions
  (`gpt-4o-mini:d73cc83ed8df` military ru/ua, `:75e0ff6403db` military ir,
  `:15a6078371bd` elite_politics, `:19c06260f149` nuclear ir) are now PINNED as literal
  strings by test, so an accidental future bump fails the gate instead of silently stranding
  138,485 rows. No remap is required and none is authorized. One originally-stated condition
  was WITHDRAWN under review: because the provider accepted lone-surrogate escapes before
  ~2026-07-16, documents 2263/622042/715046/1163005/1425485 DO hold current-version
  dispositions from an orphan-carrying request; the repair is safe because
  `processed = true` keeps them out of the HOURLY selection AND each already holds a
  current-version `doc_map_state` row for `military`, their only applicable track, so
  remap's step-3 anti-join empties `pending` and never builds a batch. Note that
  `processed = true` is remap's INCLUSION disjunct, not an exclusion — a first correction
  said otherwise and the second review round caught it. Neither the original claim ("no
  such document was ever extracted") nor that first correction was true.
  **Two independent adversarial reviews against the exact candidate SHA, both
  PASS-WITH-MINORS, every finding applied before merge** (reviewer 1: Unicode /
  serialization / versioning — 1 MEDIUM, 5 MINOR; reviewer 2: map pipeline / spend /
  operations — 0 MEDIUM+, 6 MINOR, and an explicit READY TO DEPLOY). Both landed the same
  surviving mutant, `c <= 0xdbff` → `c < 0xdbff`, which strips the lead half of every
  Plane-16 scalar; it is now killed by range-extreme cases. FOUR mutants survive, every one provably
  EQUIVALENT and every one disclosed rather than papered over — chiefly that removing the
  inner `wellFormedSlice` cannot be distinguished by any test, since every doc-line slot is
  separated by literal ASCII and the outer repair distributes over the concatenation; the
  others are the `ANY_SURROGATE_UNIT` fast path, the `keepFrom === 0` shortcut, and
  `s.length > limit` → `>=`. Gates on the reviewed tree, which fast-forwards so the merged tree
  is byte-identical to it: `git diff --check`
  clean · typecheck clean · lint 0/0 · unit **2,340/2,340 (177 files)**, from 2,309/176 ·
  production build PASS · disposable-Neon integration **118/118 (19 files)** · targeted map
  itests **13/13 (3 files)** · enforced pre-push gate green · reverting only `mapDocLine`
  fails exactly 8 tests and nothing else. Zero paid provider calls, zero production writes,
  no migration, no environment/cap/model/routing/schedule change, no remap (not even a dry
  run), no manual cron invocation.
  **Binding until superseded:** #86 stays OPEN through a post-deployment 24-hour recovery
  window whose primary criterion is **`batchErrors = 0` on every steady cycle** — all 31
  poisoned doc-track pairs are repaired, so a non-zero value is a DIFFERENT defect and must
  be classified from the runtime log, because `cron_runs` cannot tell one 400 from another.
  Expect `lease.renewals` to re-baseline from ~64 to ~`2 × batches + 2`; that is a
  consequence of the repair, not drift. Expect map spend to roughly double to ~$1.2–1.3/day
  for ~1.5–2 days while the ~27,000-document backlog drains — comfortable against
  `MAP_USD_CAP_DAILY=4`, but escalate above **$25 of the $40 all-time `MAP_SPRINT_USD_CAP`**
  or on any `budgetStopCategory` other than `run_cap`. **#87 and #88 are NOT fixed by this
  release and are not claimed to be.** New debt #97 records that the identical UTF-16 slice
  survives at `openai-provider.ts:153` (the mechanical root of #87), `synthesize.ts:138-139`
  (reduce — dormant only because of #88, and liable to wake BECAUSE of this repair),
  `llm-match.ts:83,85`, `anthropic-provider.ts:70`, and — the highest-exposure instance,
  missed by the first draft and caught by both reviewers — the live paid Ask path at
  `src/app/ask/actions.ts:28`, where a USER-SUPPLIED question is truncated at 400 code units
  straight into the answer request. The deployment identity, the first natural cycle and the
  recovery-window timestamps are recorded in the follow-up closeout entry, not here. Report:
  `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md`.

- **2026-08-23 (OPEN-TASKS #86 — merged, deployed once, first natural cycle clean, 24h
  recovery window OPENED)** The repair described in the preceding entry was merged as PR #10,
  merge commit `0aa3d7d096d864120e0fb61c76d3de40d04521c8` (14:07:59Z). `main` was an ancestor
  of the reviewed head, so the merged `src` tree is byte-identical to the reviewed one
  (`1763ae55…` at `f27c674`, at `665a814` and at the merge alike). **Three review rounds**
  ran against exact SHAs — `8a4d283` (PASS-WITH-MINORS / PASS-WITH-MINORS), `d47d73f`
  (**FAIL** / PASS-WITH-MINORS), `f27c674` (PASS-WITH-MINORS, merge bar cleared / **PASS**,
  zero open findings) — and every finding was applied before merge. The round-2 FAIL is the
  one worth remembering: the round-1 correction to the same-version argument was itself
  wrong in the same class as the original error, and only a second round caught it.
  Deployed **exactly once**, from a fresh CLONE with a real `.git` directory, as
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` (14:08:53Z, READY, production, aliased to bnow.net);
  `/health` HTTP 200 stamping `0aa3d7d` with DB OK — no blank stamp, so the #78 worktree
  trap did not apply. No migration (`23a1280..0aa3d7d` touches zero files under `drizzle/`
  or `src/db/`), no environment change (86 rows / 48 names, name set byte-identical, zero
  routing variables), no cap, model, routing or schedule change, no manual cron invocation,
  no remap (still zero `map:remap` rows ever), no paid evaluation. Ruling 21 re-proven live
  on the new build across all ten gated routes; zero 5xx and zero error-level runtime
  records.
  **The first natural `:40` cycle (14:40:20Z → 14:44:34Z, nothing invoked) confirmed the
  repair against an exact, pre-registered prediction rather than a directional hope:**
  `batchErrors` **25 → 0** (the criterion was `= 0`, not "improved", because all 31 poisoned
  doc-track pairs are repaired), `llmRequests` == `llmCalls` == `batches` == **45**,
  `processedMarked` **537 → 1,000** after 21 consecutive frozen cycles, claims **201 → 498**,
  `estUsd` $0.0223 → $0.0660, lease `acquired` at fence 38 with lost 0 / released 1 /
  discards 0, renewals **92 = 45 + 45 + 2** exactly as the re-baselined identity predicts,
  the same four extractor versions and no fifth, residue `{"fence": 38}` with no token, zero
  advisory locks, and **zero `400 Invalid body` lines in the `/api/cron/map` runtime log**
  where every prior cycle carried about twenty-six. All twenty named surrogate-poisoned
  documents — re-selected every hour for weeks — are now `processed = true` with **31
  `doc_map_state` rows**, exactly the count predicted from the eleven dual-track documents,
  and 21 claims. Recorded honestly against the prediction: `alreadyMapped` stayed frozen at
  139, which the operations reviewer expected to move; it is not an acceptance criterion and
  nothing else is ambiguous, but it is unexplained and is carried into the window.
  **Binding until superseded: the 24-hour RECOVERY WINDOW is OPEN, 2026-08-23T15:00:00Z →
  2026-08-24T15:00:00Z** (2026-08-24 11:00 EDT), 24 expected natural cycles. During it no
  further deployment, environment or cap change, model activation, manual cron invocation,
  remap or paid evaluation is permitted. **#86 is `DEPLOYED_RECOVERY_OPEN`, not closed.**
  #87 and #88 remain open and are not touched; #88 in particular is NOT claimed — whether
  mapreduce resumes depends on whether recovered throughput reaches the current-day window,
  which is a backlog-versus-recency question this repair does not answer, and the backlog
  stood at 25,857 eligible documents after the first cycle. Watch `openai_map` spend: it is
  $17.1484 all-time of the $40 `MAP_SPRINT_USD_CAP` and the recovered rate is roughly
  $1.2–1.3/day while the backlog drains; escalate above $25 of $40 or on any
  `budgetStopCategory` other than `run_cap`. Report:
  `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md` §10–§12.

- **2026-08-24 (OPEN-TASKS #86 — 24-hour recovery window CLOSED, PASS; #86 closed, #88
  re-scoped, #98 filed)** The recovery window opened by the 2026-08-23 map Unicode batch
  repair ran **2026-08-23T15:00:00Z → 2026-08-24T15:00:00Z** and is closed from the
  production record, read-only. **`UNICODE_RECOVERY_STATUS = PASS`; #86 is CLOSED.** This
  session deployed nothing, invoked no cron, ran no remap (still **zero** `map:remap` rows
  ever), regenerated no digest, set no `FORCE_REGEN`, made no paid provider call, and
  changed no environment variable or cap — `vercel env ls` still reads **86 rows / 48
  distinct names**, and production is still `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` (created
  2026-08-23T14:08:53Z, before the window opened; `/health` 200, stamp `0aa3d7d`, DB OK).
  The only writes were to `docs/`.
  **Result:** 24 natural `:40` cycles, none invoked, all `ok=true` with `finished_at` set
  and `error` NULL; **`batchErrors` 0 on every one — 0 of 767 batches**, against the
  591-of-1,041 (**56.8%**) baseline, satisfying the criterion as written (`= 0`, not
  "improved"); lease `acquired` 24/24 with fences **39 → 62 strictly +1**, lost 0 /
  released 1 / discards 0, residue `{"fence": 68}` with no token, zero advisory locks; one
  distinct baseline dispatch identity; the same four extractor versions and no fifth; no
  `budgetStop*` key of any category; `processedMarked` 23,999 of 24,000 selected against a
  frozen 537/cycle baseline; 7,164 claims; the 20 poisoned ids never re-selected.
  **Two criteria required honest handling rather than a pass-by-restatement.** (i)
  `llmRequests === batches` held on 22 of 24 cycles. The two exceptions are entirely the
  untouched truncation-split path: on `finish_reason === "length"` `extractBatch`
  increments `truncationSplits` and recurses TWICE, each recursion metering its own request
  while the top-level `batches` counter does not move. The correct identity is
  **`llmRequests === batches + 2 × truncationSplits`**, exact on both cycles (35+4=39,
  27+2=29) and window-wide (767+6=773); `batchErrors` stayed 0 on the split cycles, so this
  is a response-length behaviour, not a request-validity one, and not a #86 residual. A
  future window should use the corrected form. (ii) The §11 signal carried forward as
  unexplained — `alreadyMapped` frozen at 139 — is **RESOLVED**: it moved to **0 on the very
  next cycle** (15:40Z) and stayed 0 for all 23 after it. The 139 were already-mapped
  documents pinned in the selection window by the 463 stragglers; the first repaired cycle
  drained them (hence `processedMarked` moving in that same cycle) while still counting the
  old window, and the next selection advanced past that region. One cycle late, not wrong.
  **Corpus-wide confirmation, closing the report's own "the 20 are a lower bound" risk:**
  replaying the OLD truncation over the entire eligible pool — not a bounded sample — finds
  **0 of 7,292** still-unprocessed documents that would orphan a surrogate, though 2,536 of
  them carry complete astral pairs; over the 414,659 processed epoch-eligible ru/ua/ir
  documents it finds 25, all accounted for: the 20 repaired on 2026-08-23 (31
  `doc_map_state` rows, 21 claims, first mapped 14:42:49Z–14:44:18Z), four of the five
  pre-existing documents accepted before the provider tightened around 2026-07-16, and one
  (2311267) dispositioned as a dedup mirror with a `doc_dedup` row and no `doc_map_state` —
  which is what ruling 13's definition of `processed` allows. The fifth pre-existing id,
  2263, is dated 2026-07-01 and so falls outside `MAP_EPOCH`; queried directly it holds its
  one row as recorded. **The live selection pool can no longer reproduce #86.**
  **Spend:** $0.9127 across the window; daily `openai_map` $0.7002 (08-23) and $0.7885
  (08-24) against `MAP_USD_CAP_DAILY=4`; all-time **$18.2790 of the $40
  `MAP_SPRINT_USD_CAP`**, below the $25 escalation threshold; 669 daily requests through the closeout read
  against the 1,500 default `MAP_DAILY_REQUEST_CAP`. Below the ~$1.2–1.3/day projection,
  because the repair also STOPPED work: the stragglers are no longer re-dispatched every
  hour, so cycles settled at ~31 batches rather than the transition's ~44. `openai_reduce`
  recorded no usage at all (latest day still 2026-08-16), so #97's reduce-path site has not
  become live and the trigger for promoting it has not fired.
  **What the recovery bought:** map freshness returned. `map-health` sent three
  episode-deduped `unhealthy` notices (18:40Z, 00:40Z, 07:40Z — three stale theaters each)
  and then a **`recovery` notice at 2026-08-24T13:40Z**; `provider_state.map_health` now
  reads `episodeKey: null`; the eligible backlog fell **25,857 → 7,292** (ir 3,939 · ru
  2,393 · ua 960); and the worker is now mapping documents dated 08-22/23/24.
  **Carried out of the window, none blocking the PASS.** **#88 survives #86 and is
  RE-SCOPED — it is no longer blocked on it.** Every digest since 2026-08-17 is still
  legacy, including the 10 from `digest:intraday` at 2026-08-24T19:30Z. The mechanism was
  MEASURED, not assumed, and a first draft of this entry got it wrong by assuming a
  day window: `digest:intraday` selects a **ROLLING 24-hour** window
  (`src/app/api/cron/digest/route.ts:50`), and `inRollingWindow` admits a claim only when
  its document's `published_at` lies inside the last 24 h. At the 19:30:13Z run the newest
  document holding ANY claims was published **2026-08-23T18:55:40Z — about 35 minutes
  short** of that run's window floor of 2026-08-23T19:30:13Z, so the window was empty for
  every theater and track and all ten fell back. The map is closing on the publication
  front but still trails it: at 2026-08-24T21:05Z the newest claimed document is published
  2026-08-24T04:41:29Z while the pending queue spans 2026-08-24T04:43:20Z → 21:04:40Z. What
  remains is purely the backlog-versus-recency ordering decision, and the margin is now
  small enough that closing the remaining lag would let mapreduce resume unaided.
  Observed, not forced: nothing regenerated. **#87 is confirmed still live and is now the
  largest instance of the family** — `digest:intraday` 2026-08-23T19:30:13Z recorded
  `errors: 2` with `ok=true` and `counts.errorMessages` carrying the identical
  `400 Invalid body: failed to parse JSON value` string twice, and `validate`
  2026-08-24T07:00:57Z recorded `errors: 1` with `ok=true` and no message; daily nested
  digest errors run 0–3/day across 08-15 → 08-24, the same band before and after the
  repair, so it is untouched pre-existing debt rather than a regression. **New: #98** —
  `ingest:telegram` left two `finished_at IS NULL` rows INSIDE the window (2026-08-23
  18:01:31Z and 19:01:31Z, `ok` NULL, empty `counts`), ruling 10's timeout signature with
  nothing alerting on it; the class is pre-existing but growing (07-28 ×1, 08-15 ×1, 08-23
  ×2, plus `ingest:x` ×3 on 08-13) and these two post-date the exclusion note the QF-B
  closeout left, so they are genuinely new. They were found only because this closeout swept
  nested `counts.*` on EVERY job rather than just `map`, which is the discipline #87 asks
  for. The expired `MAP_USD_CAP_DAILY_OVERRIDE_USD`/`_UNTIL` pair remains installed and
  remains hygiene-only (#94), untouched here.
  **Binding until superseded:** #86 is closed and needs no remap — the repair kept the same
  four extractor versions deliberately, and re-opening it would require new evidence of a
  surrogate-class rejection, not a generic `400`. A residual non-zero map `batchErrors` must
  still be classified by signature from the runtime log before being attributed to anything
  (#87's counter cannot discriminate). No rollback is contemplated; the §13 target
  `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` / `23a1280` stays valid but reinstates the defect.
  Report: `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md` §14.

- **2026-08-24 (QF-A landed — evidence recency + quality funnel; release-train stage 3b;
  H6 supersession recorded)** Per the operator's pending-merge adjudication plan, Worktree A
  of the quality-foundation program landed as its own PR: the 6-commit strand
  (`codex/evidence-quality-observability-20260817`, own delta from QF base `05fdd2c`) was
  rebased onto `main` `30088bf` in a fresh worktree — conflict ledger EMPTY, `range-diff`
  6/6 commits byte-identical to the independently audited tree (audit verdict for A:
  "CORRECT and merge-reviewable", `858bb9a`) — plus five landing commits closing every
  outstanding A register finding (FUNNEL-A12-1 docsInFedGroups surfaced; FUNNEL-A12-2
  roster-aware pending labels via `mapTheaters()`; FUNNEL-A12-3 lexicon-skip wording;
  A-REC-1 skew-boundary pins; SCI-N4 documentCount reconciliation) and one closing the A1
  landing-review note (map-roster env provenance in the funnel report). FUNNEL-A12-4
  (platform/language citation dimensions) deliberately not taken — OPEN-TASKS #99.
  Independent adversarial landing review (5 lenses, findings adversarially verified):
  ZERO confirmed defects; 7 notes, all dispositioned in the release record. Invariants:
  H1 assertion PASS (`dropIsolatedSurrogates` present; map-prompts + map-request-wellformed
  49/49); rulings 17/18/19 verified untouched (recency computed on the exact post-guard
  shape after the overwrite verdict, fail-open, stub-excluded); zero new paid call sites; no
  migration. Gates on the exact landed tree: typecheck/lint clean · unit 2,412/2,412 (180
  files) · integration 119/119 (19 files, disposable Neon fork) · pre-push green. Deploy is
  NOT part of this landing (standing 2026-08-03 separation): production still runs
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`; the prepared deploy request names rollback target
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` and a ≥1-full-day/digest-cycle observation window.
  **H6 supersession:** the 2026-08-21 entry's staging posture — `7150b49` immutable, A/C/D
  and the conflict program unmerged — is SUPERSEDED by the operator's release-train plan for
  Worktrees A and C: each lands as its own main-based PR by strand extraction (this entry is
  A; C follows separately). Worktree D remains design-only; the conflict program remains
  governed by its own audited seven-PR decomposition. Release record:
  `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-RELEASE-2026-08-24.md`.

- **2026-08-24 (QF-C landed — analysis-eval control plane; release-train stage 3c)** Worktree C
  landed as its own PR after QF-A: the 17-commit strand
  (`codex/analysis-eval-control-plane-20260817`, own delta from `05fdd2c`) rebased onto
  post-QF-A `main` `d4557c4` — conflict ledger EMPTY, `range-diff` 17/17 byte-identical to
  the audited tree (audit verdict for C: "READY as offline machinery", `858bb9a`) — plus
  two declared carries from the QF integration line (H5): a byte-identical patch of
  `ba35082` (recency probe onto QF-A's canonical calculator; fixtures re-pinned to
  linear-interpolation percentiles) and the QF tip's `.env.example` eval-cap block,
  corrected at landing after the A1 review caught its fail-closed overstatement (only
  `EVAL_USD_CAP_DAILY` + the shared `LLM_SPRINT_USD_CAP` backstop fail closed; the request
  caps are bounded in-code defaults 300/200). **H4 resolved: no runtime behavior change** —
  the `map-worker.ts` touch is the pure `mapOutTokensPerDoc()` accessor extraction and the
  `llm-match.ts` touch the pure export + `sanitizeMatches()` extraction, both byte-verified
  against `main`'s lease/#86-era code with suites green; the plan's no-standalone-soak line
  therefore stands. Ruling 4 verified directly: `eval-guard.ts` refuses everywhere while
  `EVAL_USD_CAP_DAILY` is unset, and **no `EVAL_*` env exists in any Vercel environment**,
  so live/paid evaluation remains impossible after any deploy until the operator sets caps
  (adjudication plan §6; the audit's 11-item pre-paid-eval hardening list is stage-5 work
  bound by A14-F1 to cover both the QF and conflict report paths after the conflict
  eval-profile PR). Independent adversarial landing review (5 lenses, adversarial
  verification): ONE confirmed doc-only finding (the `.env.example` overstatement), fixed
  at landing; one refuted; all other verifications affirmatively clean. Gates on the exact
  landed tree: typecheck/lint clean · unit 2,518/2,518 (188 files) · integration 119/119
  (19 files, disposable Neon fork) · H1 + lease/spend pins 69/69 · pre-push green. No
  migration. Deploy: not performed; QF-C can ride the next authorized deploy (rollback
  target `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`). Release record:
  `docs/reviews/QF-C-ANALYSIS-EVAL-RELEASE-2026-08-24.md`.

- **2026-08-18 (independent conflict-evaluations final audit — Fable 5, exact-tip; branch
  `codex/conflict-evaluations-final-audit-20260818` only)** A fresh Fable-5/xhigh session
  audited the completed conflict/region evaluation workstream at the exact branch tip
  `a2ddca8` (`a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`) on the independently audited QF base
  `7150b49`. Reconstruction verified every ancestry/statistic claim and the true model
  timeline (Gate 6 `1f70852` = last fully Fable-reviewed point; Phase 7 onward = Opus 5 after
  an operator switch, no fallback). The COMPLETE gate battery was replayed green at the
  unchanged tip — unit 3,213/3,213 (228 files) · integration 151/151 (21 files, disposable
  fork deleted) · typecheck/lint/build clean · CLI modes under a hard network kill-switch with
  8/8 refusals exit-2 under fake keys · 14/14 gated evidence routes 307 anonymously with zero
  claim-text leakage under production posture · 48-state overflow + measured-contrast browser
  matrix · 679-fragment prose scan zero hits · golden byte-identity — nothing NOT-RUN. Three
  fresh Fable reviewers (science, safety, product) each returned **PASS-WITH-MINORS at
  `a2ddca8`** with 0 BLOCKER/HIGH. Corrections of record appended (P7 report §12, conflict
  decision-register #13, workstream index): the backtest's F2 counterfactual was
  promised-but-unrendered (recomputed: legacy union 82.4% ROCA / 75.0% Iran under the
  matchable reduction), F5 misstated what `/scoreboard` presents (per-run unweighted means,
  never a pooled 15/36), an undisclosed designated-final-edition handoff to the legacy
  emulation, a 40-vs-41 snapshot-reason overgeneralization, the atomization "disabled
  experiment" that was never built, and the source-independence metric being document-grain
  (`distinct non-mirror docIds`; `sourceDomain` unused) while schema names and some copy say
  "independent sources". New binding enablement item: `CONFLICTS_UI=1` requires
  `FEATURE_AUTH_GATE=true` in the same environment (inherited gate demo-parity otherwise
  serves the gated evidence page anonymously). Audit remediation was DOCS-ONLY after all three
  verdicts were recorded — no source/test/fixture/golden byte changed, so the conflict
  integration branch still contains the exact audited tree. Verdict:
  **`independent-audit-pass / conflict-delta-may-be-considered-on-audited-QF-base;
  soak-and-enablement-blocked`** — dormant merge may be considered (QF first, then the P7
  §5.1 seven-PR order); the shadow soak stays blocked on register #11/#12 + the independence
  relabel; enablement stays blocked on ruling-3 + P7 §5.2 items 4/4b/4c/4d/5/6. No merge to
  `main`, push, PR, deploy, env change, paid call, production write, or soak occurred. Full
  record: `docs/reviews/CONFLICT-EVALUATION-FABLE-FINAL-AUDIT-2026-08-18.md` + ledger +
  finding register + three review reports.

- **2026-08-24 (conflict evaluator landed — seven reviewed PRs, default-off; release-train
  stage 4)** The audited conflict/region evaluation program (runtime `a2ddca8`, audit
  `da44272`, base `7150b49`) landed as the audited seven-PR decomposition (P7 report
  §5.1): PRs #16–#22, merges `dd310c7`/`bc2e6b2`/`4cf0a75`/`b687b63`/`77369ad`/`3e37b52`/
  `e359c61`, each PR's files checked out from the audited FINAL trees with per-blob hash
  verification, PR 5 landed after QF-C against the byte-identical
  `scripts/analysis-eval.ts` (+281/−4 additive). **End-state fidelity: all 125 files of
  the conflict delta on merged `main` are blob-identical to `a2ddca8` (or `da44272` for
  the three audit-updated docs).** Recorded deviations: `eval-profile`(+test) PR 1→4 and
  `snapshot-ref`(+test) PR 5→4 (final-state dependency order, import-graph-proven); the
  gated evidence route deliberately has NO `authz-page-gate` ROUTES row — its body-leak
  assertions run flag-on in `conflict-feature-off.itest.ts` (binding migration obligation
  if that harness retires). Ruling 21 verified on every page (gate first, before any data
  access; the evidence page awaits `requireAcceptedUser()` first). The audit's own
  decision-log entry was carried verbatim above (chronological carry, original date).
  Full combined gates on `e359c61`: typecheck/lint clean · unit 3,329/3,329 (231 files) ·
  integration 151/151 (21 files, incl. both conflict itests' flag-on/flag-off body-leak
  assertions on a real production build). Landed DORMANT: `CONFLICTS_UI` absent in every
  Vercel environment (verified); enablement requires the final-audit checklist (incl.
  F-NEW-6 `FEATURE_AUTH_GATE` coupling) + a decision-log entry; the shadow soak stays
  blocked on the five recorded blockers; paid conflict evals share the QF §6 gate; the
  MAP activation hard lock is untouched. Deploy NOT performed. Landing record:
  `docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md`.

- **2026-08-24 (pending-merge adjudication closeout — the release train is landed;
  deploys await the operator)** The operator's 2026-08-25 adjudication plan executed end
  to end in one session under its A1–A10 execution addendum: PR #12 merged after
  adversarial repair (its +4h self-clock error corrected — the Neon serverless driver
  serializes timezone-naive timestamps as local ET with a bogus `Z`; never ask the DB the
  time through that path, compare epochs); the five §5.1 disposals executed with
  lossless-deletion proofs (PR #13 salvage merged; PR #3 closed superseded); QF-A and
  QF-C landed by audited-strand extraction (PRs #14/#15); the conflict evaluator landed
  default-off (PRs #16–#22); `claude/local-model-ask-eval-20260817` and
  `claude/business-planning-20260817` stay parked per plan §5.5. Zero paid calls, zero
  production writes, zero env/cap/cron/migration changes, zero deploys by this session.
  §6 paid-evaluation gate: conditions 1–2 met, 3–5 open — **paid evals remain BLOCKED**.
  Four plan corrections recorded in the register (`ba35082` provenance; the no-ROUTES-row
  design; `a2ddca8` = p7 tip + 11 remediation commits; the `.env.example` carry).
  Full register + operator action list (deploy authorization requests with rollback
  targets, §7 uncommitted-docs recommendation, package-manager question, hygiene list):
  `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md`.

- **2026-08-24 (release-train deploy + governing prompts — operator-authorized)** The
  operator authorized the register §9.1 deploy and the §6 governing-prompts
  recommendation. Executed: (1) PR #24 tracks the three governing prompts (both
  2026-08-18 final-audit prompts + the 2026-08-25 adjudication plan with its A1–A10
  addendum; secret scan clean; audit-G1 precedent). (2) Production deploy of `main`
  `143964a` from the plain release clone (`vercel deploy --prod --scope vociferous`;
  the clone was link-initialized first — the CLI appended only a `VERCEL_OIDC_TOKEN`
  line to its `.env.local`, nothing overwritten): **`dpl_FPYase3HqbCF3d2uW3AnwPHibyt4`**,
  target production, READY, aliased to bnow.net; `/health` 200, commit stamp `143964a`,
  DB OK. **No env change of any kind** — `CONFLICTS_UI` stays absent everywhere,
  `FEATURE_AUTH_GATE=true` in Production, no `EVAL_*` vars, all caps untouched.
  Smoke (read-only GETs, PASS): all five conflict paths bare+`RSC: 1` carry zero
  conflict tokens in any body (bare 404s; the gated evidence route 307s because
  `requireAcceptedUser()` is the page's first statement); `/search`, `/entities`,
  `/digests/ru` anonymous bare+RSC bodies carry no privileged tokens; `/` 200.
  **Rollback target: `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`** (the pre-train #86-repair
  release). QF-A's observation window OPENED ~2026-08-24T23:45Z: watch ≥1 complete
  day/digest cycle (02:00 finalize + 04:00/10:00/19:30 intraday) for additive
  `structured.stats.evidenceRecency` keys on newly persisted digests with zero change
  to published events/claims; the funnel report stays a read-only operator tool. The
  conflict surfaces remain dormant; enablement, shadow soak, and paid evals stay
  separately gated (register §9.3/§9.5).

- **2026-08-27 (QF-A observation CLOSED — PASS; #88 CLOSED — PASS; standing-state
  reconciliation; docs only)** A read-only production check-in (SELECT-only `sqlq.ts`,
  the read-only funnel report, anonymous GETs, `vercel inspect`; DB instants derived from
  epochs — the driver's +4h bogus-Z rendering was reproduced live and avoided) adjudicated
  the window the 2026-08-24 deploy opened. **QF-A: PASS.** Digest dates 08-24→08-27:
  44/44 digests present (11/day, all `generated`), **44/44 carry additive
  `structured.stats.evidenceRecency`**, and reconciliation is exact on all 44
  (`claimCount` = relational claims; `documentCount` = distinct non-stub cited docs);
  ru/military + ir/military + ir/nuclear funnel reports ran warning-free (ru/mil 08-27:
  1,270 reduce claims → 841 groups → 200 fed → 5/5 votes → 5 events → 11 claims / 60 cited
  docs, 100% timestamp coverage, p90 evidence age 20.1h, 0 stale >48h). QF-A is additive
  by implementation and tests; production showed no structural or relational drift
  attributable to it (no claim of byte-identical prose). **#88: acceptance met** — the
  scheduled 2026-08-25T02:02Z finalize produced the first natural mapreduce digests since
  2026-08-16 (zero reduce spend 08-17→08-24 pins the resumption; no manual invocation or
  `FORCE_REGEN` observed — the thin-regen guard actively refused two overwrites in-window),
  and the 6-mapreduce/5-legacy matrix has held for four consecutive digest dates with
  `openai_reduce` back in its ≈$0.10–0.30/day band. Operational window otherwise clean:
  zero `ok=false`/`error`/`budgetStopCategory` on any job, and zero nested
  `errors`/`batchErrors` on every map and digest run, since 08-24T00:00Z; `map_health`
  `episodeKey` null; one hung `ingest:telegram`
  row 08-27T18:01:42Z (timeout signature → #98 evidence); `openai_map` $19.5311 of $40;
  **`x_api` $57.6724 of $75 → new #101** (operator cap decision; point-in-time ~17-day
  projection). #87/#97/#98/#84 stay OPEN with corrected wording (#97's reduce sites are
  live again — next code PR). Deployment creation instant corrected to
  **2026-08-24T23:56:34Z** (`vercel inspect`; the "~23:45Z" above was an approximation).
  Standing sections corrected in place: AGENTS.md (Live/repository, Candidate-B lineage
  stamp, Analysis, Next steps), `docs/CURRENT-STATE.md` (full refresh),
  `docs/OPEN-TASKS.md` (#84/#87/#88/#97/#98 + new #101), register §11 appended. **This
  closeout performed no deployment, no environment/cap/model/cron/flag change, no
  migration, no paid provider call, and no production write**; production remains
  `dpl_FPYase3HqbCF3d2uW3AnwPHibyt4` / `143964a`, `main` docs-only ahead. Report:
  `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-CLOSEOUT-2026-08-27.md`.

- **2026-08-27/28 (reliability release queue + dormant eval/conflict landings —
  operator-authorized roadmap)** One overnight session executed the authorized roadmap:
  **seven PRs merged (#27–#33), four SERIAL observed production releases, three dormant
  landings, zero manual paid calls, zero env/cap/flag/cron/migration changes.** Runtime
  queue (each: standard gate → fresh-context review → fixes → re-review → checks →
  merge → plain-clone deploy → /health+DB+authz verification → natural observation →
  rollback checkpoint): **R0** PR #27 `ed9bc35` → `dpl_62NHUKhDGVL6S6Xp7YbvYMuZ23mx`
  (#97 reduce site; baseline: old-vs-new differs on ZERO of 157,765 current claims —
  defensive; observed PASS incl. the 02:00Z finalize's exactly-30 reduce requests
  = 6 cells × K=5 through the new code, $0.0450). **R1** PR #28 `afbf06e` →
  `dpl_H7uqWF3DhToY7ufouNBSeSkYLaWH` (#87 mechanical digest fix; baseline: 61
  malformed doc lines/14d under old code; 04:00Z intraday observed clean). **R2**
  PR #29 `ad6e078` → `dpl_5ocJPF4GLPHDFB4Cv3MB4tgkScou` (#87 degraded-run
  classification; 7 post-deploy runs, 0 spurious flips; one transient Vercel CLI
  "Not authorized" cleared on retry, no auth change). **R3** PR #30 `b62da02` →
  **`dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6` (current production)** (#98 sweep; NATURAL
  proof: 9 dead historical rows swept incl. the real 08-27T18:01:42Z telegram hang,
  zero false sweeps). **#87 CLOSED** (flip synthetic+wiring-proven; first natural flip
  future-observable), **#98 CLOSED** (natural proof obtained), **#97 re-scoped OPEN**
  (Ask family next). Dormant landings after the queue: PR #31 `2c1eac5`
  (capacity-profile harness + matrix dry-run + SCI-N6 both sides + env-knob surfacing),
  PR #32 `5643b72` (10/11 QF-C close-before-paid items; item 6 rides corpus-v2),
  PR #33 `bf0061b` (conflict soak §5/§5.1 instruments; partial-verdict policy
  deliberately deferred to register #12.3) — `main` `bf0061b` is dormant-eval ahead of
  production by design; paid evals remain BLOCKED (no `EVAL_*` env; §6 gate);
  conflict soak remains blocked on its eight §8 gates. Final gates on merged `main`:
  typecheck/lint clean · unit 3,421/3,421 (239 files). Docs landed with this entry:
  `RELIABILITY-RELEASES-2026-08-28.md` (release+observation record),
  `OPERATOR-DECISION-PACKET-2026-08-28.md` (X cap #101 ~15-day runway is the nearest
  deadline; #94 override removal; hygiene; npm/pnpm; §6 paid-eval; conflict gates;
  corpus-v2 review), `docs/designs/MODEL-PROMOTION-READINESS-2026-08-27.md` (prepared,
  not executed), and `docs/designs/HUMAN-ADJUDICATION.md` carried from the parked QF
  branch (register §9.4 discharged). The dirty primary checkout was untouched
  throughout; every deploy came from the plain release clone.
