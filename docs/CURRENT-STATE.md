# CURRENT-STATE.md — detailed living snapshot

This is the detailed current-state companion to `AGENTS.md`. Unlike the decision log,
this file is **not append-only**: correct it in place whenever live product, operational,
deployment, test, credential, or repository state changes. Historical narrative belongs in
`PROGRESS.md`, review notes, and `DECISIONS.md`.

## Current state — snapshot (verified through 2026-08-23; correct in place when it changes)

Live at **https://bnow.net** (Vercel project `bnow-net`, team `vociferous`;
deployment URLs are SSO-walled — always use the project domain). History/narrative:
`docs/PROGRESS.md` + `docs/reviews/`; debt: `docs/OPEN-TASKS.md`.

- **OpenSanctions match-safety release (2026-07-22):** release commit `441ee09` LIVE
  (current env-only redeploy `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC`, original deploy
  `dpl_E5ysiLJSg1ynNmqJkgmpDjrzZD32`, aliased to bnow.net, `/health` stamps `441ee09`,
  DB OK). Fail-closed OpenSanctions read model (`src/lib/enrich/os-read.ts`) + admin-only
  neutral candidate-review presentation on `/entities`; non-admin/public surfaces render ZERO
  OpenSanctions markup (verified live — the pre-release non-admin `opensanctions.org/entities/`
  profile-link leak is closed); Ask receives no OpenSanctions-derived categorical assertion,
  sample question replaced. NO migration, NO env change (all Ask flags preserved); Ask
  shadow-soak window RESTARTED 2026-07-22T01:10:37Z (Ask retrieval/evidence code changed). Zero
  paid calls / DB writes / migrations during release + smoke. Rollback target = prior Ask
  release `dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT` / `836b46e`. On 2026-08-14 the operator added
  `go@vociferous.ai` to Production `ADMIN_EMAILS` and redeployed this same artifact: that identity
  accepted Terms 1.1 + Privacy 1.3 and live-opened `/admin/ingest`; the OpenSanctions neutral
  panel itself still has not been manually inspected as admin (unit-test covered). Unit suite
  2,049/161 files; integration 72/14 files. Evidence:
  `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`.

- **AI Search/Ask release (2026-07-21):** release commit `836b46e` LIVE
  (`dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT`); production DB migrated 0021–0027 (backup branch
  `backup-pre-ask-release-2026-07-21` retained); Privacy 1.3 live with forced
  reacknowledgement; retention envs 30/7/7 set; **`ASK_RUNS_SHADOW=1` soak running** —
  every other new flag (enforce/progressive/stream/cache/sessions/router/billing
  cutover/Ask analytics) off/absent; user-visible Ask unchanged (server-action path);
  soak monitoring via `scripts/ask-shadow-soak-check.ts`; full evidence in
  `docs/reviews/AI-SEARCH-RELEASE-2026-07-21.md`. Unit suite 2,028/159 files;
  integration 72/14 files.

- **Registry:** ~10,015 materialized sources / ~351K citations / 1,608 reports; per-theater
  aggregates in `source_theater_stats` (ru 6,985 / ir 3,654 rows). **Iran citations are
  CURRENT through 2026-08-14** (2026-08-15 recovery: 42 Iran reports loaded — all 36
  pending drained + 6 undiscovered days recovered at their plain slugs — ~3,000 citations,
  ~46 new sources; full transactional materialize; validation now parses endnotes from
  every report it fetches via `src/lib/isw/load.ts`, so a discovered report can no longer
  sit `pending` with zero citations; Iran Update discovery probes all four observed slug
  shapes). RU ROCA endnote loading remains the manual-script path.
- **Ingestion (live):** **34 RSS feeds** (ru ua il ir sa ae qa om + bh/kw scaffolded;
  2026-08-15 ir additions: en.mehrnews.com en, radiofarda.com fa, sabanew.net ar,
  sanaacenter.org en, alaraby.co.uk/rss/politics ar — all probed 200+XML+fresh,
  robots-clean, explicit ir coverage-lens pins; presstv.ir now fetches via its
  item-identical presstv.co.uk mirror after the .ir TLS chain broke — the sourceKey and
  registry identity stay presstv.ir; rejected: shafaq.com robots-disallows its feeds
  [1,398 ir citations — operator outreach recommended], majalla/alhadath no feed,
  almasdaronline bot-walled, 964media feed access-denied),
  registry-selected + curated Telegram via t.me/s/, Telegram MTProto (**wired
  2026-07-11; `TELEGRAM_SESSION` present in production (added 2026-07-11): operator
  login done, `ingest:mtproto` cron hourly runs green (at :03 since the 2026-08-17
  Candidate B release; :35 before) — **first live fetch VERIFIED
  2026-07-11** (~3.8K docs across runs, 0 errors, cross-transport dedupe firing); egress
  PROVEN on Vercel tcp+wss; reads registry **top-120 ROCA-only**
  (`isw_reports.theater='ru'`) vs the scraper's top-50 pan-theater — RU/UA-priority
  roster deployed 2026-07-11, env-tunable, rollback via
  `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER=all`; **known observability noise:** GramJS emits
  non-fatal peer-type `CastError` lines during otherwise healthy runs — fresh 2026-07-16 read-only
  audit: 24/24 green, 1,251 inserts, 960 channel selections, zero recorded errors, all 145 state
  rows clean; `telegram` 2.26.22 is current and a local 64-bit serialization probe did not reproduce,
  tracked as OPEN-TASKS #69**), X via api.twitterapi.io (364
  registry accounts — **lease-aware insert-gated poller DEPLOYED 2026-07-14**
  (`dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ`, main `a38a882`; every `ingest:x` run writes
  numeric `cron_runs.counts.x_api`), and the **July 9–13 historical gap is RECOVERED
  cursor-complete** (checkpoint `x_gap_backfill:2026-07-09_2026-07-14` complete=true:
  19/19 batches, 1,335 pages, 26,090 returned, 16,007 inserted, $3.9164; gap days
  31/18/27 → 4,559/4,134/5,587 docs; balance delta reconciled to the ledger to
  $0.00003). Post-recovery rescore mapped + regenerated + revalidated the window
  (2026-07-14 decision-log entry). **Bounded automatic long-park recovery + episode-deduped
  health alerts DEPLOYED 2026-07-16** in `dpl_DhMh12dn4fdXCesEhXnpxw546Qkw`: the first real
  scheduled run on that build (cron 1555) persisted `mode=1`, `alertEvaluated=1`, a clean
  `x_api_health` state, 382 docs / 46 requests, and zero failures/truncations/stops. That proves
  the new monitor executes in production. **Natural production proof completed 2026-08-10–14:**
  scheduled X runs encountered provider request failures (`budgetStops=0`, no billable usage on
  Aug 11–12), entered bounded catch-up, then inserted 560 + 9,069 + 764 = **10,393** documents on
  Aug 13 and returned to healthy hourly polls. The two large completions recorded recovery state;
  #66 is closed. **#38 is CLOSED as of 2026-08-23:** the operator mailbox
  (`go@vociferous.nyc`) holds the X-health INCIDENT email `[BNOW] X ingestion unhealthy:
  incomplete, request_failures` delivered 2026-08-22T18:05:46.635Z and the RECOVERY email
  `[BNOW] X ingestion recovered: resumed` delivered 2026-08-22T19:04:17.601Z, each matching
  its `ingest:x` run's `counts.x_api` field-for-field — the external delivery proof
  `cron_runs` could never supply. This was not provider-credit or app-cap exhaustion: cumulative X spend was $43.8075
  of $75; Aug 10 was $0.7386 of $2.50/day; Aug 13 was $1.6575. On Aug 14 the live admin dashboard
  showed 175,842 X documents total, 3,603 in the last 24h, and last fetch 19:21:24 UTC), GDELT
  (wired, upstream-flaky), zakupki
  procurement (wired, blocked — needs proxy).
- **OpenSanctions enrichment:** live gap-fill remains active. Calendar-month quota accounting +
  the advancing fixed-cutoff sanctions rescore are **DEPLOYED 2026-07-15** from merge `f9aaa9e`
  in production deploy `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`. Live zero-paid verification:
  `/health` 200 on that deployment; authenticated future and timezone-less sanctions cutoffs both
  returned the new 400 before `withCronRun` / provider work. **Fresh 2026-07-16 read-only audit:**
  1,012 all-row eligible / 475 claim-linked; 780 checked / 232 missing-or-stub overall, but only 46
  claim-linked missing-or-stub; July ledger 780 requests / $85.8000 (120 / $13.2000 on July 16).
  **Claim-linked spend eligibility (#17 spend subset) is DEPLOYED 2026-07-16** from `be0ebf1` in
  production deploy `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj`: a /match candidate and the `remaining` count
  both require ≥1 `claim_entities` row (one shared `CLAIM_LINKED_SQL` via `selectionPredicate()`),
  so normal candidates drop 232 → 46 and the 186 zero-link missing/stub rows are unbillable. Live
  zero-paid verification: `/health` 200 on the live domain with a matching `data-dpl-id`;
  authenticated malformed cutoff still 400s before `withCronRun` / provider work; ledger identical
  before and after. The cleanup dry run still proposes 79 unsafe cross-kind merges, so the paid
  rescore remains CLOSED until the kind-safe #61 fix is deployed, cleanup is approved/applied, the
  population/month quota are recounted, and spend is separately authorized. Neither the 07-16 audit
  nor the #17 deploy made a cleanup mutation or a paid OpenSanctions call.
  **Match-safety repair LIVE 2026-07-22 (`441ee09`, `dpl_E5ysiLJSg1ynNmqJkgmpDjrzZD32`):** the
  matcher now accepts only `match === true` results (a rejected candidate
  can no longer persist as a sanctions assertion; rejected diagnostics are non-assertive);
  `src/lib/enrich/os-read.ts` is the single fail-closed read authority (usable match = not stub +
  not `NK-stub` + `matched === true`), containing any stale/contradictory rows without mutating
  them (a read-only audit at release found the current production set carries ZERO
  `matched:false, sanctioned:true` rows and zero rejected rows with promoted topics — 425
  clean-rejected / 388 accepted-unsanctioned / 200 accepted-sanctioned; the read model is
  defensively correct regardless); OpenSanctions presentation on `/entities` is now
  ADMIN-ONLY qualified candidate review (no public badge/PEP/topic/score/caption/freshness markup;
  score labelled identity-match confidence, not risk); Ask receives NO OpenSanctions-derived
  categorical assertion (`sanctioned` projection and the `SANCTIONED` evidence marker removed from
  legacy + v2; sanctions facts reach Ask only as source-backed claim text). Review:
  `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`.
- **Map stage:** eligible ru/ua/ir docs mapped once per (track, extractor_version) →
  `doc_claims`, persistent dedup verdicts (`doc_dedup`), dispositions (`doc_map_state`);
  hourly cron keeps it current; $0.076/1K docs. Feeds the mapreduce digest engine (below).
  Shadow evidence: `docs/reviews/MAP-SHADOW-RESULTS.md`. **Outage + recovery:** the
  worker hit the shared $10 all-time backstop at 2026-07-29 08:40Z and 418 hourly runs
  recorded ok=true with zero claims (ru/ua/ir all starved; digests fell back to legacy)
  until the 2026-08-15 recovery release. Since that release: `MAP_SPRINT_USD_CAP=40`
  (map-only ceiling; shared `LLM_SPRINT_USD_CAP=10` unchanged), any non-run_cap budget
  stop records `cron_runs.ok=false` + a machine-readable `budgetStopCategory`, steady
  runs evaluate per-theater/current-version freshness with episode-deduped operator
  alerts + one recovery notice (`src/lib/analysis/map-health.ts`; state in
  provider_state `map_health`; cooldown `MAP_ALERT_COOLDOWN_SEC` 6h; staleness
  `MAP_STALE_DAYS` 2), and `scripts/map-backfill.ts` supports `--theater` + typed stop
  classification (run/daily/total/transport). The temporary recovery daily elevation
  (`MAP_USD_CAP_DAILY_OVERRIDE_USD=20` until `2026-08-17T13:00:00Z`) auto-expires in
  code; base `MAP_USD_CAP_DAILY=4` was never changed. **Concurrency — corrected
  2026-08-22: the session advisory lock is GONE from production.** The pgbouncer
  stranding trap (#77 — the pooled DSN could route `pg_advisory_unlock` to a different
  backend, leaving every later cycle `skipped`) was replaced by the durable
  `provider_state` row lease (`src/lib/analysis/map-lease.ts`, key `map_lease`) in the
  2026-08-22 PR #7 release: a single-statement CAS acquire under proven expiry against
  the DB clock, per-acquisition tokens as the sole authorization, token-checked
  renew/release, and a monotonic diagnostic fence — no session state for a pooler to
  strand, verified live (`pg_locks` holds ZERO advisory locks). The lease serializes the
  hourly cron, the backfill driver and the remap operator on ONE key. **Accepted
  residual (#85):** the fence is diagnostic-only and writes are protected by a
  check-then-act token re-check, not a statement fence, so the unprotected window is the
  whole renew-to-COMMIT span; a full-TTL stall of that span can admit a mixed-generation
  first-writer-wins claim set for one (doc, track, version). Removing it needs a fence
  column — a migration, deliberately deferred. **#77 is CLOSED (2026-08-23): the 24h
  formal lease soak 2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z closed PASS**, so
  `provider_state.map_lease` is now the LIVE map-concurrency mechanism in production and
  the session advisory lock is gone from the map path entirely — 24/24 natural `:40`
  cycles all `acquired`, fences 2–25 contiguous (lease era gapless 1..35), `lost=0`,
  `released=1`, `leaseLostDiscards=0` on every cycle, 1,541/1,541 successful renewals,
  3,995 claims reported == 3,995 `doc_claims` rows persisted in-window, residue
  `{"fence": N}` with no token, ZERO advisory locks, one baseline dispatch identity, four
  extractor versions, no env/migration/remap, independent review PASS, post-window
  continuity 10/10 (fences 26–35). **Bounds of that PASS, which stand as live caveats:**
  it covers the steady single-holder path only — contention, `expired_takeover`, `busy`,
  the loss latch and the discard path have never executed in production (#95); there is no
  retained runtime-log coverage of the window (#93), so the durable `cron_runs` record plus
  `doc_claims`/`doc_map_state`/`provider_state`/`provider_usage` plus out-of-band alert
  email are the evidence; `pg_locks` reads are point-in-time only (the Neon compute
  restarts) and the load-bearing fact is the absence of any `pg_try_advisory_lock` call;
  and `counts.lease.lost` — not `leaseLostDiscards`, which can undercount on the
  truncation-split path (#96) — is the authoritative loss signal. TTL is
  `MAP_LEASE_TTL_SEC`, default 120s clamped to [30,600], and is NOT set in any Vercel
  environment.
- **Map remap operator (OPEN-TASKS #33) — DEPLOYED, NEVER EXECUTED.**
  `scripts/map-remap.ts` plus remap mode in `runMapCycle` shipped in the same release:
  dry-run-first, resumable, lease-safe, route-capability-gated, fail-closed on every
  numeric flag, checkpoint bound to extractor versions AND route target, structurally
  incapable of writing `raw_documents.processed` or of deleting/rewriting historical
  `doc_claims`. It has NEVER been run against production or any deployed route, so remap
  is NOT production-proven and no yield, cost or completion figure for it exists. The MAP
  activation hard lock is untouched: only the baseline `gpt-4o-mini`/no-effort
  configuration can dispatch, which makes this a prompt-revision tool until an operator
  authorizes an activation — which additionally needs an executed, costed corpus remap
  and a paid representative scorecard (#81). NOTE: while #86 stands (**~57%** of map
  micro-batches rejected `400 Invalid body` — 591 of 1,041 in the 2026-08-22 soak window;
  the older "~45–54%" band is superseded), the driver's stall bound trips after 3
  calls, so it cannot drain a day at all today.
- **Model routing (PR #5 — LIVE in production since 2026-08-20, `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` / `7336b9c`; 24h formal soak CLOSED PASS 2026-08-21):** `src/lib/llm/model-config.ts`
  is the ONE authority for which model each analysis workload dispatches and at what
  reasoning effort — map, reduce, digest, validation, entity_audit — resolved at CALL time,
  precedence `<WORKLOAD>_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini` (values trimmed;
  blank/whitespace = absent). Effort allowlist `minimal|low|medium|high`, reasoning models
  only. Dispatch requires BOTH an exact price in `src/lib/llm/pricing.ts` (the single
  analysis metering price authority) AND an exact `analysis-reg-v1` approval in
  `src/lib/llm/analysis-registry.ts`; `workloadDispatchConfig()` throws before any
  SpendGuard reservation and before any provider client is built, so an invalid effort, an
  effort on a non-reasoning model, an unpriced model or an unapproved (workload, model,
  effort) all FAIL CLOSED. The registry holds baseline-only approvals — gpt-4o-mini, effort
  absent, status `baseline`, one per workload — and ZERO `evaluated_candidate` entries:
  **no candidate model is evaluated or activated.** Map is additionally HARD-LOCKED to the
  baseline with no env override (`MAP ACTIVATION BLOCKED`), because `MAP_MODEL` or a
  validated `MAP_REASONING_EFFORT` bumps `mapExtractorVersion()` without remapping history
  — OPEN-TASKS #33 is the prerequisite; `REDUCE_*` never affects that version. Ask is
  deliberately not routed here (`ASK_ANSWER_MODEL`/`ASK_RERANK_MODEL` stay scorecard-gated).
  Every dispatch persists a durable identity (model, effort, registry version, approval) in
  `digests.structured.stats.llmDispatch`, `stats.reduce.dispatch`,
  `validation_runs.details.dispatch` and `cron_runs.counts.dispatch` — ids and statuses
  only, no prompt content, no secret. Dry-run inspector: `npx tsx
  scripts/model-routing-inspect.ts` (no provider request, no DB connection). Verified
  read-only 2026-08-20: all ten routing envs and `OPENAI_MODEL` are ABSENT in Production,
  Preview and Development; the inspector reports all five workloads
  `gpt-4o-mini / source=default / effort=— / priced=yes / approved=baseline / dispatch=ok`;
  `mapExtractorVersion()` is byte-identical to `origin/main` across all 30 (track, theater)
  combinations and matches all six live production pairs in `doc_claims`
  (ru+ua military `d73cc83ed8df`, ru+ir elite_politics `15a6078371bd`, ir military
  `75e0ff6403db`, ir nuclear `19c06260f149`).
- **Digests — two engines behind `DIGEST_ENGINE`; prod is FLIPPED to `mapreduce`
  (2026-07-09; code default is still legacy when the env is unset, which is the
  rollback):** legacy = the 100-doc batch extraction (source-mix quota, ladder);
  mapreduce = deterministic reduce over doc_claims (star clustering, threshold 0.35,
  corroboration promotion, entity canonicalization) + K=5-voted synthesis over the
  top ~200 ranked claim groups — model cites group ids only, docIds/hedging derive
  server-side. A/B gate PASSED (coverage 25.0 vs 21.1, unsupported 0.30 vs 0.41,
  variance 6.9 vs 8.0; `docs/reviews/MR3-REDUCE-RESULTS.md`). A theater falls back to
  legacy automatically whenever its digest window finds no CURRENT-version doc_claims.
  **Corrected 2026-08-21: that fallback is now UNIVERSAL — since 2026-08-17 every digest
  (11/day, all theaters) has been produced by the LEGACY engine**, and
  `provider_state.map_health` reads `stale_ir,stale_ru,stale_ua`. Before that only ir got
  mapreduce (1–3/day). The map worker is healthy but is draining the ru/ua backlog, so
  current-day windows hold no current-version claims. The last mapreduce digest was
  **2026-08-16T19:32:38Z**; every digest created on or after 2026-08-17 is legacy.
  Compounding cause: OPEN-TASKS #86 (**~57%** of map micro-batches rejected
  `400 Invalid body` since 2026-07-16 — 591 of 1,041 in the 2026-08-22 soak window —
  root-caused to surrogate-splitting truncation in `map-prompts.ts`). **#86's repair is
  merged to `main` as of 2026-08-23** — `wellFormedSlice` + `dropIsolatedSurrogates`, same
  code-unit ceiling, same four extractor versions, no remap — and stays OPEN through its
  post-deployment 24-hour recovery window; whether mapreduce actually resumes is a separate
  backlog-versus-recency question this repair does not answer. Tracked as #88. Both engines persist
  through ONE shared path (`digest-persist.ts`) whose overwrite guard refuses empty
  AND thin (<50% prior claims) regenerations (#32 closed; FORCE_REGEN=1 override),
  and which now runs the deterministic **publication-safety guard**
  (`publication-guard.ts`, 2026-07-13 — ruling 19) before that verdict.
- **Validation vs ISW:** majority-vote LLM matching (k=5, 26/27 reproducible across
  reruns), keyword gazetteer as no-key fallback; ISW report auto-discovery by slug.
  Coverage avg ~17.5% (nonzero-day ~31%), median info-lead +14.7h (2026-07-05 backtest).
- **Surface:** landing (**nav restructured 2026-07-12 IA refinement: Coverage ▾ | Signals |
  Ask | Solutions ▾ | Validation | Pricing — Product group retired, Signals+Ask promoted
  top-level, Solutions>signals duplicate dropped; every route has exactly one nav path; robots.txt
  + sitemap.xml added, `src/app/robots.ts`/`sitemap.ts`, `siteBaseUrl()` = bnow.net /
  VERCEL_PROJECT_PRODUCTION_URL**) / countries (freshness line + **public per-theater pages
  `/countries/[iso2]` with localized metadata, IA refinement 2026-07-12; Coverage links land
  there, old `#<iso2>` anchors kept; signed-out home "Live now" count driven from
  `countries.status='active'`**) / **access (private analyst beta, 2026-07-13)**:
  public `/access` beta-request page (email + optional LinkedIn URL stored-never-fetched +
  use-case; honeypot, 1h dedupe, operator email via after()+FEEDBACK_EMAIL, review list at
  `/admin/access`); `/pricing` 308-redirects there — price cards, dollar amounts and
  `src/lib/pricing/` are deleted; nav shows "Request access" signed-out ONLY (signed-in nav
  carries no commercial entry); hero has a restrained beta badge; sign-in is **invite-only in
  Production as of 2026-07-15** via `SIGNIN_MODE=invite` (eligibility = existing users row OR
  ADMIN_EMAILS OR approved subscribe_intents; the pre-flip read-only audit found 5 existing users,
  0 approved requests and 1 pending request, so existing users remain eligible and the pending
  requester remains blocked until approval) /
  magic-link auth (**Postmark bnow.net sender LIVE 2026-07-15**: Production `EMAIL_FROM` =
  `BNOW.NET <no-reply@bnow.net>`; the active server token accepts the address; Gmail live proof
  shows bnow.net DKIM, SPF, and DMARC pass, custom `pm-bounces.bnow.net` Return-Path, and the
  direct, unrewritten Auth.js callback signs in successfully; **2026-07-16 operator proof closes
  #40** — the delivered email body states single-use / 24h + copy-before-opening guidance, and the
  same link reached forced current-policy acceptance) / digests
  (ClaimSources diversity-selected source collapse, **adopted 2026-07-12**) +
  registry (**ADMIN-ONLY since 2026-07-12** analyst-trust R5:
  `requireAdminOr404()` in both layouts — every non-admin, signed-in or out, gets a
  404, replacing the old requireUser 307; registry links removed from nav, rail and
  all pages; `view-policy.ts` still shapes what an admin sees; "suggest a source"
  mailto moved to digest footers) + entities behind FEATURE_AUTH_GATE / signals
  (**teaser-public / specifics-gated, IA refinement 2026-07-12**: `toPublicSignal()`
  withholds the signal `detail` — named individuals, dollar figures, target/flow lists —
  AND the ClaimSources evidence from anonymous server-rendered HTML at the data layer;
  signed-out sees only the headline count + a sign-in nudge; accepted users get detail, every
  qualifying canonical person named with the attribution/non-endorsement notice, and `<details>`
  evidence. **Operator/live proof 2026-07-16 closes #58:** stale acceptance forced Terms 1.1 /
  Privacy 1.2 re-acknowledgement; accepted `/signals` rendered the notice, a nonempty 23-name list,
  and 47 evidence expanders; same-deploy anonymous HTML again contained neither names label nor
  notice. robots.txt disallows
  the gated routes; /signals stays crawlable as the safe teaser) / trade / datadark /
  critical-materials / ask
  (**v2 pipeline LIVE 2026-07-12**: hybrid vector+lexical retrieval, gpt-5-mini
  listwise rerank, gpt-5 answerer with refusal handling; ~$0.011/query; capped
  100/user/day + $10/day global (`ASK_USER_DAILY_LIMIT`/`ASK_GLOBAL_DAILY_BUDGET_USD`)
  + guard caps `ASK_USD_CAP_DAILY=2`/`EMBED_USD_CAP_DAILY=1`, all four in Production
  AND Preview (`ASK_USD_CAP_DAILY` is Production+Preview only — absent in Development;
  **metering correction pending deployment:** PR #5 fixes gpt-5-mini's price from
  $0.125/$1 to the official $0.25/$2 per 1M tokens, so on deploy the rerank reservation and
  recorded estimate DOUBLE — `rerankCeilingUsd()` $0.005125 → $0.01025, per-Ask worst case
  $0.067625 → $0.07275 — with no change in what OpenAI actually bills; the app had been
  under-metering. Read-only 2026-08-20: `openai_ask` has spent $0 since 2026-07-21, its
  largest day ever is $0.2748, all-time $0.4468, so the $2/day cap and the $10 per-provider
  `LLM_SPRINT_USD_CAP` backstop both keep ample headroom — re-confirm at deploy,
  OPEN-TASKS #84); rollback = `ASK_PIPELINE=legacy` plain env + redeploy. **Polished
  2026-07-12 (ask-polish sprint):** paid pipeline runs ONLY from the form's server
  action — GET /ask?q= prefills, never executes (closes OPEN-TASKS #48
  double-billing); **one-click home handoff (2026-07-16):** the signed-in home Ask box
  no longer costs a second click — it stores the submitted question under a single-use,
  per-tab `sessionStorage` key and passes its random UUID as `/ask?q=…&intent=…`, which
  AskForm consumes ONCE on mount and then presses its own submit button
  (`src/lib/ask/intent.ts`, `src/components/home-ask-box.tsx`). #48 is untouched and still
  binding: rendering ANY GET /ask — intent present, replayed, shared, prefetched, or
  forged — stays free; the entry is consumed BEFORE the submit is dispatched, must match
  `?q=` exactly, and never leaves its tab. The box is still a real
  `<form action="/ask" method="get">`, so a no-JS/degraded-storage submit falls back to
  plain prefill. **LIVE 2026-07-17** (`dpl_5jAidKc8rnSKmSG1gK5rP4KehwJv` from main `f0d34d3`;
  rollback `dpl_7useRyXz71PVkyFgYqZTXKJXf8mv` / `df79411`). Browser-verified on a disposable
  Neon branch: one click ⇒ exactly one `ask_usage` row; refresh, back-nav and reopening the URL
  in a new tab ⇒ zero additional rows. Re-proven in production after the deploy: the signed-in
  home renders the box with its GET fallback intact, a direct `?q=` and a forged `?intent=` are
  both prefill-only, zero paid Ask calls, no console/5xx errors (the one-click path itself was
  not re-run in production — the branch proof covers it and a live run would bill for nothing);
  prominent working panel (spinner, disabled controls, aria-busy/status,
  honest client-elapsed retrieve→rank→answer stages, submitted-question echo); provider/model
  diagnostics are no longer shown to analysts; end-user persona
  SYSTEM_V2 (legacy SYSTEM byte-preserved); "data current through" context +
  $0 no-coverage short-circuit when window.from > max(claim_date) (rollback
  `ASK_NO_COVERAGE_SHORTCIRCUIT=0`); citation deep links to `#c{claimId}` digest
  anchors; related claims floored at vectorScore ≥ 0.5 (`ASK_RELATED_MIN_SCORE`,
  null excluded, cap 5, empty block omitted); signed-in home gets a zero-JS Ask
  box; eval gate honesty 5/5 + known-citations 5/5 —
  `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`). **Role model
  (2026-07-12):** `users.role` (`user`<`analyst`<`admin`, migration 0016) +
  `src/lib/gate.ts` helpers back the registry/signals gating above; `ADMIN_EMAILS`
  bootstraps admin pre-grant, live in Vercel **Production only** as
  `go@vociferous.nyc,go@vociferous.ai` (the `.ai` gate was live-verified on `/admin/ingest`
  2026-08-14; absent
  Preview/Development — fails closed to reduced views there). **Signed-in home
  (rebuilt 2026-07-12 analyst-trust R3):** compact one-line headline (no hero/CTAs),
  quick-links rail, cadence-aware theater panels (whole-card click → latest digest;
  the card names its digest bucket + intraday/final stage and keys the claims count
  to that bucket — the "not yet generated beside 14 claims" contradiction was a
  driver bigint-as-string fold bug, fixed + regression-pinned), Ask box + recent
  asks, validation tiles last; signed-out home unchanged. Magic-link sign-in lands
  on `/`. **Authenticated 390px proof completed 2026-07-16 (#65 closed):** exact 390×844 viewport,
  no horizontal overflow across header/drawer, quick links, theater cards, Ask/recent question,
  validation tiles, or footer; test session signed out. Time model: docs/TIME-MODEL.md + src/lib/time/* (ET display, UTC buckets,
  explicit-tz helpers only). **Scoreboard
  (2026-07-12):** targets-vs-actuals sublines + thin-sourced tile + nonzero-day
  mean + a true median info-lead (closes OPEN-TASKS #11); **explainer block +
  per-metric how-to-read lines** and an **evidence-at-publish proxy subline**:
  `validation_runs.details.atPublish` = share of the run's takeaways matched with
  evidence ingested before ISW's publish instant (src/lib/validation/at-publish.ts,
  jsonb only — no migration; 7-day deterministic backfill applied 2026-07-12; full
  cutoff-anchored design parked in docs/designs/ISW-CUTOFF-SCORING.md). It is not a
  historical digest snapshot or a mathematical bound on what the digest said then
  (corrected 2026-07-14 scoring audit).
  Root error boundaries (`src/app/error.tsx` / `global-error.tsx`, 2026-07-12)
  never render raw error messages. **Analyst home & Iran prominence (2026-07-12,
  deploy `bnow-jihmibgm6`):** signed-in home gained a quick-links rail (latest+prev
  digest dates ×ru/ua/ir + scoreboard/signals/search (registry link removed 2026-07-12 R5)), date-led digest
  links + claims-today + per-theater scoreboard deep links on the theater cards,
  and a recent-asks list (`/ask?q=` prefills, never executes — the 2026-07-16 one-click
  handoff deliberately did NOT touch these links: only the Ask box submits an intent);
  signed-out home
  gained one additive Iran/Gulf card (quality-gated: ir validation 07-11 = 100%
  coverage; links `/countries#ir` per ruling 15); digest archive index
  `/digests/[country]` + prev/next date nav + scoreboard→digest cross-link;
  feedback mailtos on digest + registry-detail pages (env `FEEDBACK_EMAIL`, plain,
  all three Vercel envs — affordance hidden when unset); **/search** = free
  deterministic claim search (signed-in): ASK v2's lexical arm extracted to
  `src/lib/ask/lexical.ts` (shared with retrieveV2, byte-green), $0 by
  construction — no SpendGuard, no usage rows, proven live (5 queries, zero
  counter movement); GET-with-q EXECUTES there by design ($0), the deliberate
  contrast to /ask. i18n: en+uk full, de ar ja pl fr catalogs are offered in the selector;
  es/he/ko remain valid fallback locales but are hidden until reviewed catalogs exist
  (landing wired; needs native review before promotion; ~108 uk strings — 10
  `ask.*` (MERGE 1) + ~64 design-branch strings (MERGE 2: pricing, home.status,
  home.validation, signals, registry) + 3 ask-polish strings + 31 analyst-home
  strings + 18 analyst-trust strings — await native review, tracked in
  `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`).
- **Legal acceptance (versioned clickwrap, shipped 2026-07-12):** public `/privacy` +
  `/terms` (**Terms of Use v1.1 effective 2026-07-16** — §9 adds the named-person
  source-attribution / non-endorsement rule for the accepted-invitee Signals view, deployed
  2026-07-16; v1.0 was effective 2026-07-12. **Privacy Notice v1.3 effective 2026-07-21** —
  §9 replaces v1.2's "no fixed automatic deletion period" statement with the operator-set
  Ask retention windows (question/answer/evidence content ≤30 days; stream/progress events
  ≤7 days; exact-answer cache ≤7 days; billing/accounting metadata retained separately
  without extending content retention), disclosed BEFORE any Ask persistence-backed feature
  enablement; v1.2 effective 2026-07-15 corrected the live PostHog posture — dedicated US
  project, GeoIP-derived approximate location, seven-year event retention; Privacy v1.1 was
  effective 2026-07-14 and introduced optional analytics consent). Each version bump forces
  ALL users to re-accept on next visit — the Privacy 1.3 bump does so now — and the
  acceptance form also carries an optional, initially unchecked
  "Allow optional product analytics" checkbox — unchecked/missing records `denied`, a
  stale grant cannot survive re-acceptance;
  `src/components/legal-document.tsx` shared layout, DB-free, indexable, in sitemap);
  a **global `SiteFooter`** in the root layout (Privacy · Terms · Status · Contact) replaced
  the home-only footer (hidden on `/admin`); a first-login acceptance screen
  **`/welcome/legal`** (magic-link now lands there via `redirectTo=/welcome/legal?next=/`;
  two required unchecked checkboxes, links open in a new tab, server action re-validates,
  DB-generated `accepted_at`, idempotent insert, safe-next open-redirect guard). Central
  version constants live in **`src/lib/legal/policies.ts`** (`CURRENT_TERMS_VERSION` /
  `CURRENT_PRIVACY_VERSION`, operator = Vociferous.ai / New York, contact go@vociferous.nyc);
  a version bump there forces re-acceptance. **Append-only record** `policy_acceptances`
  (migration 0017, FK→users cascade, unique (user_id, terms_version, privacy_version); NO IP,
  UA, birth date, or token stored). **Enforcement:** `requireAcceptedUser()` (gate.ts) = auth
  + current acceptance, used by the ask/search/entities/digests **layouts** AND the ask
  **action + API route** independently; the signed-in **home** redirects before any subscriber
  query; **/signals** gates its detail on acceptance (teaser stays public); **/account** shows
  the accepted versions + timestamp (no id/method leaked) and redirects if unaccepted;
  both `requireAdminOr404` (registry/middle-east) and `requireAdmin` (the /admin console) redirect
  a confirmed admin who hasn't accepted (non-admins still 404 / redirect-to-/ respectively, so the
  admin gates are unweakened). Anonymous dev/demo parity (FEATURE_AUTH_GATE off) preserved;
  no acceptance record is ever manufactured for an anonymous visitor. **DEPLOYED 2026-07-13**
  (`dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh`, READY, aliased bnow.net); migration 0017 applied to prod
  and verified (correct columns, `accepted_at DEFAULT now()`, unique version-triple, FK cascade,
  0 rows); anon prod smoke green (legal pages 200 with v1.0 copy, gated routes 307, /signals 0
  leaks, robots/sitemap correct). Note: `docs/reviews/LEGAL-ACCEPTANCE-NOTE-2026-07-12.md`.
- **Product analytics (PostHog — LIVE, opt-in-only, activated 2026-07-14 evening):**
  consent-gated client layer (`src/lib/analytics/*`, `src/components/analytics/*`, posthog-js
  1.399.5 dynamically imported) merged `e5123a9`; dedicated **US-Cloud project 512327
  "BNOW.NET"** (operator-created; region = operator decision; key ≠ Scenefiend's);
  `NEXT_PUBLIC_POSTHOG_KEY`+`_HOST` in Vercel **Production only** — key removal + redeploy is
  the verified rollback (the keyless build `dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6` was deployed and
  proven zero-traffic first). Activation deploy `dpl_EmHs6NneKtPA5RC9i4T3ybYSjLEx` and current
  prod deploy `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu` include the `$identify` signup_at ISO fix
  (`9e371dc` — `created_at::text`'s space format made the
  sanitizer drop $identify; to_char now). Init requires ALL of: signed-in + current legal
  acceptance + `users.analytics_preference='granted'` (migration 0020: 3-value CHECK, default
  `'unset'`, Account-page reversible control) + valid key/host + Vercel production + exact
  https://bnow.net + approved subscriber route; allowlist-reconstruction `before_send`
  sanitizer, 10 custom events + manual `$pageview`/`$identify` only, UUID identity never email.
  **Live-verified 2026-07-14:** all 12 event types ingested with the internal UUID only; stored
  payload keys = exactly the allowlist; `$ip` None (anonymize_ips on; autocapture/replay/
  console/performance off project-side); **GeoIP enrichment kept ON by explicit operator
  decision** (city/postal from connection IP at ingestion, disclosed in Privacy 1.2).
  Anonymous/unaccepted/denied/deployment-domain/legal-route all proven
  zero-request; cross-tab deny + sign-out reset proven; Ask stayed one-bill-per-submit.
  Dashboard **"BNOW Private Beta"** (id 1848415, 9 insights) + Action `first_value_event`
  (id 289102); no alerts yet. **Verification trap:** posthog-js bot-filters headless/webdriver
  browsers BEFORE `before_send` — live checks need a masked UA or they prove nothing.
  `/access` persists validated first-party attribution (lowercased capped-charset
  `utm_source/medium/campaign`, forced `landing_path=/access`, hostname-only `referrer_host` —
  migration 0020, nullable) shown in `/admin/access`; never sent to PostHog. Test account
  `go+phtest@vociferous.nyc` accepted current Terms 1.1 + Privacy 1.2 during the 2026-07-16
  Signals proof; optional analytics was left off and persisted `denied`. It remains the standing
  verification identity and was signed back out after the proof. Evidence:
  `docs/reviews/POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md`.
- **Tests:** **2,309 unit tests / 176 files** green (`npm test`, ~4s) + **118/118**
  Neon-branch integration tests / **19 files** (incl. `map-lease.itest.ts`,
  `map-remap.itest.ts`, `map-budget-stop.itest.ts` and `isw-citation-refresh.itest.ts`,
  all against disposable production forks with zero paid calls) — measured 2026-08-22 on
  the PR #7 merged head with `LLM_DISABLE=1` and every provider key blanked; the fork is
  deleted after each run. PR #7 adds +122 tests and +5 files over PR #5's 2,187/171.
  The saved `NEON_API_KEY` works (disposable branches created and deleted cleanly). CI
  mirror: `.github/workflows/ci.yml`; the enforced pre-push gate is `.githooks/pre-push`
  (typecheck+lint+test), which does not include the integration suite.
- **Crons (vercel.json):** ingest fast */15 · telegram :01 · x :02 · mtproto :03
  (hourly starts clustered by the 2026-08-17 Candidate B release — :10/:20/:35 before —
  so ingestion wake-ups share the :00 fast-ingest window; 48h observation window CLOSED
  PASS 2026-08-19T07:00Z with a MEASURED 13.6% Neon active-compute reduction, i.e. ~13–14%,
  below the pre-deploy ~17–19% estimate — evidence: Phase-1 review §11) ·
  map :40 (hourly) · digest 02:00 (D+1 finalize) + 04:00/10:00/19:30 (intraday, rolling window,
  delta-framed) · validate 07:00 (scores yesterday = the finalized digest) ·
  enrich 08:00 · datadark 09:00 · trade monthly (2nd) · materials monthly (3rd).
- **Stubbed / off:** ACLED (fixture stub, unwired); Stripe flagged off; Resend adapter
  superseded by Postmark. (MTProto left this list 2026-07-11 — real adapter wired,
  session-gated; see Ingestion above.)
- **Deploy:** current production `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` (2026-08-17 Candidate B
  cron-clustering release from `main` merge `9c5e9cb` / PR #4, READY, aliased bnow.net;
  `/health` stamps `9c5e9cb` — root-clone CLI deploy, so git metadata shipped). Its 48h
  observation window CLOSED PASS on 2026-08-19T07:00Z and Candidate B stays deployed; the
  documentation closeout that records this is NOT itself a deployment, so production keeps
  running `9c5e9cb`. **The repository is now AHEAD of production:** PR #5's model-routing
  seams (see the Model-routing bullet above) are repository code only — merging them is not
  deploying them, and production stays on `9c5e9cb` / `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`
  (`/health` DB OK, re-verified 2026-08-20) until a separately authorized release with its
  own 24h routing-equivalence soak. Lineage: the
  Iran-recovery branch merged to `main` as PR #2 (`26989f7`) and was redeployed 2026-08-16 as
  `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC`, now the rollback target. Command:
  `npx vercel@latest deploy --prod --yes` via the machine CLI session
  (`VERCEL_TOKEN` is expired; regen is an operator task, SETUP-NEXT-WEEK #2). Note: a CLI
  deploy from a git WORKTREE ships no git metadata (`.git` is a file there) and renders an
  EMPTY `/health` commit stamp — verify those via `data-dpl-id` (OPEN-TASKS #78).
- **This WSL2 box:** the NAT resolver times out on some domains — a DNS quirk, NOT a
  TCP block. `NODE_OPTIONS="--require ./scripts/pin-dns.cjs"` pins vercel/openai/
  understandingwar DNS to public resolvers, making local single-call LLM debugging
  work; bulk LLM work still runs via deployed Vercel routes (prod env + metering).
  github.com resolves slowly/flakily: pushes work, but short-timeout git commands can
  fail — retry or wait ~30s+. api.gdeltproject.org DNS still fails locally (not
  pinned). TASS/RIA/Lenta RSS unreachable → covered via their Telegram channels.
- **Git:** the last application-code release is #73 signed-out landing contrast, merged and deployed
  2026-07-16. At the last reconciliation origin/main == local main; the only post-deploy delta is
  the documentation closeout recording that live proof. `codex/73-signed-out-landing-contrast` is
  merged, and the deploy is live and aliased bnow.net.
