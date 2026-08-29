# Open Tasks — debt & risks identified during the build (2026-07-06)

Prioritized. "Tier 1" = address now (cheap, real risk/quality). Key-blocked items live
in BLOCKERS.md and are deliberately deferred until credentials exist.

> **Reconciled against DB + git + disk 2026-07-11** (`docs/reviews/STATE-2026-07-10.md`).
> Item numbers are stable — the decision log and standing rulings cite them by number, so
> closed items are struck in place and new items continue at #38+. This pass closed the
> stale-open #1/#2/#3, updated #11/#30/#36 with measured data, and added #38–#46.

## Tier 1 — address now

1. ~~**CI pipeline** (GitHub Actions: `typecheck` + `test` on push/PR).~~ ✅ SHIPPED
   (verified 2026-07-11): `.github/workflows/ci.yml` gate job = `tsc --noEmit` + `npm run
   lint` + `npm test` on push+PR, plus an `integration` job behind `NEON_API_KEY`; enforced
   locally by `.githooks/pre-push` (`core.hooksPath=.githooks`). Was stale-open in Tier 1.
2. ~~**/ask rate limit**~~ ✅ SHIPPED (verified 2026-07-11): `src/lib/ask/limits.ts` =
   20/user/UTC-day (`ASK_USER_DAILY_LIMIT`) + $1/day global (`ASK_GLOBAL_DAILY_BUDGET_USD`);
   `askWithLimits` logs every call to `ask_usage`; `route.ts:16` returns 429 over-cap.
3. ~~**Entity canonicalization** (was task #9).~~ ✅ SHIPPED as capability (verified
   2026-07-11): all three layers present — rules `canonicalize.ts` (`junkReason`/`planCleanup`),
   propose-only LLM audit `entity-audit/route.ts:131` (ruling 6, never auto-writes), extraction
   lexicon `tracks.ts:81 ENTITY_RULES`. **Caveat:** the LLM merge/cleanup pass is propose-only
   and has not been *run* against prod (no `openai_entity_audit` usage rows) — applying it is an
   operator step (`scripts/entities-cleanup.ts --file <jsonl>`).

## Tier 2 — soon

4. ~~**Integration tests**~~ ✅ 2026-07-07: 6 tests on disposable Neon branches
   (`npm run test:integration`), CI-wired. TASK-3-REVIEW.md.
5. ~~**Iran military digest quality**~~ ✅ 2026-07-07: theater prompt + lexicon; coverage
   0% → 33.3/25% on 2 of 4 scored days. Remaining quality iteration continues with
   corpus depth (X/MTProto keys).
6. ~~**Reliability-weighting spot-check**~~ ✅ 2026-07-07: digest ranking was already
   wired (now regression-tested); /ask retrieval was not — now orders by confidence
   after recency (integration-tested).
7. ~~**ME source materialization**~~ ✅ 2026-07-07: `source_theater_stats` per-theater
   aggregates; global columns aggregate all theaters; 1,574 zombies → 0.

### New (from the hardening pass)

15. ~~**LLM-matcher nondeterminism.**~~ ✅ 2026-07-07: majority-vote matching shipped
    (k=5, strict majority per takeaway↔claim, per-vote audit trail in
    details.votes, matcher records `llm-majority`). Reproducibility measured:
    26/27 country-day results identical over 3 full reruns. Numbers in
    docs/reviews/COVERAGE-SPRINT-RESULTS.md.

### New (from the coverage sprint, 2026-07-07)

16. ~~**Source-mix quota in digest corpus selection.**~~ ✅ 2026-07-08: shipped
    (src/lib/analysis/source-mix.ts) — ~40% cap per adapter AND platform on both the
    gather window (top-600 was 100% x_api on heavy X days) and the LLM batch, reliability
    order kept within buckets, batch interleaved so truncation-retry prefixes stay mixed,
    over-cap fill only when the corpus lacks alternatives. Regenerated ru/ua Jun30–Jul7 +
    ir Jul1–7 military: ru citation x-share 78%→49% (100%-x days 4→0), ru coverage
    15.1→21.6; ua 41%→30% x-share, coverage 23.6→16.8 (regen noise vs quota cost —
    watch); ir Jul 7 100%→38% x-share. Before/after in docs/PROGRESS.md. Follow-up: #19.
    2026-07-09 K=3 quota-on/off A/B (Neon branch, 48 samples, majority matcher): ua
    quota cost is −3.0 pts (18.0 vs 21.0), permutation p=0.33 — NOT distinguishable
    from extraction noise (median within-day SD 9.6 pts). Quota stays. See #28.
19. **IR non-X military corpus depth / conversion.** The Jul 1–5 “2–9 non-X docs/day”
    snapshot is superseded. Fresh completed-day Jul 9–15 evidence: 5,537 distinct IR military
    map documents = 4,437 X (**80.1%**) + 1,100 non-X (600 Telegram web, 485 RSS, 15 MTProto).
    Published evidence is still **73.1% X** (612/837 claim→document links); RSS 15.9%, Telegram
    web 10.8%, MTProto 0.2%. Corpus depth improved, but the dependency remains. Next research must
    trace adapter conversion map input → ranked group → cited evidence before deciding whether the
    lever is feeds, lexicon yield, or reduce ranking. Evidence:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`.
17. **[Tier 1 prerequisite to #41] OpenSanctions match hygiene.** **Spend subset ✅ DEPLOYED
    2026-07-16** (`be0ebf1` / `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj`, zero paid calls): ≥1 linked claim
    is now required before a /match call is selected, counted, or billed. One shared
    `CLAIM_LINKED_SQL` fragment is composed by `selectionPredicate()` into all four paths (normal /
    rescore × candidate / `remaining`), so selection and the completion count share one population.
    Post-deploy read-only proof: 1,012 eligible / 475 claim-linked / 537 zero-link; normal
    candidates 232 → 46, blocking the 186 zero-link missing/stub rows the cron would have spent on.
    **Match-safety subset ✅ LIVE 2026-07-22** (`441ee09`, `dpl_E5ysiLJSg1ynNmqJkgmpDjrzZD32`;
    merged fast-forward-only + deployed, zero paid calls, zero production writes/migrations/env
    changes; non-admin live-verified to render ZERO OpenSanctions markup, pre-release non-admin
    profile-link leak closed — see `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`):
    the `results.find(match) ?? results[0]` defect that persisted REJECTED candidates as
    sanctions assertions is fixed (accepted-only selection; rejected candidates fail closed with
    non-assertive nested diagnostics); every read path now requires not-stub + not-NK-stub +
    `matched === true` via the single `src/lib/enrich/os-read.ts` authority; OpenSanctions
    presentation is admin-only with qualified candidate-review copy (score labelled identity-match
    confidence, accepted/rejected labelled, topics uncollapsed, checkedAt shown — the
    score/caption surfacing exists now, but ADMIN-only, not analyst-facing); Ask no longer
    receives any OpenSanctions-derived categorical assertion (`sanctioned` projection +
    `SANCTIONED` prompt marker removed from legacy and v2).
    **Still open (do NOT close this item):** (a) a read-only audit at release found the current
    production set carries ZERO `matched:false, sanctioned:true` rows and zero rejected rows with
    promoted topics (425 clean-rejected / 388 accepted-unsanctioned / 200 accepted-sanctioned);
    the fail-closed reads contain any that appear without mutating/rescoring — cleanup/re-match
    still belongs with #61 and needs separate spend approval;
    (b) matching still queries name + entity type only — stronger identifiers (DOB, nationality,
    registration numbers) are unimplemented; (c) NO human-review workflow exists, so
    sanctions/PEP assertions stay internal/admin-only until one is approved by product review;
    (d) the analyst-facing match-review presentation remains an open product decision.
    Handoff for the remaining entity-cleanup half: `docs/prompts/2026-07-16-entity-cleanup-kind-safe.md`
    (section A; section B now documents the deployed regression boundary only).
18. ~~**Truncation-retry watch.**~~ ✅ 2026-07-09 (MR sprint 3): generalized as the
    map-reduce split — per-doc extraction (map) + synthesis over claim groups can
    never hit the batch-output ceiling (synthesis sets max_completion_tokens and its
    input is ~200 compact groups, not 100 raw docs). Legacy ladder retained for the
    legacy engine.

### New (from the nav restructure, 2026-07-09 — docs/reviews/NAV-RESTRUCTURE-REVIEW.md)

20. **Native-speaker review of the new header strings.** ~20 new `nav.*` / `home.*` keys were
    machine-translated into de/fr/pl/ja/ar/uk. Register matters most on the group labels
    (`Product`/`Coverage`/`Validation`/`Solutions`) and on `nav.item.opacity`
    ("Economic data suppression"), which is a coined phrase, not a term of art. Same gate as the
    2026-07-08 i18n batch: no launch into a market before a native pass.
21. **es / he / ko have no catalogs.** `LOCALE_REGISTRY` declares 10 locales; only 7 ship a
    dictionary. The other three fall back to English *per key* — true for every string in the app,
    not just the nav. `he` is `dir="rtl"`, so it currently renders English text in an RTL document.
    Either translate them fully or drop them from the selector; a nav-only catalog would produce
    half-translated chrome, which is worse than uniform fallback.
22. **Combined registry landing page.** `/registry` is RU-only, `/middle-east` is ME-only, and
    there is no shared index. The header nests "Middle East registry" under Product as a secondary
    item to avoid two top-level registries. A real combined entry point is the proper fix.
23. **Per-user default theater.** The signed-in homepage's "Read today's digest" hardcodes `ru`.
    There is no preference storage; building one was out of scope.
24. **Solutions persona pages.** The four Solutions entries point at module pages
    (`/trade`, `/critical-materials`, `/datadark`, `/signals`). If we want Solutions to be a real
    buyer-facing surface, each needs a brief that frames the module for that persona.
25. **`src/lib/gate.ts:4-7` doc comment is stale.** It lists the gated routes as
    "digests, registry, entities", but `ask/layout.tsx` and `middle-east/layout.tsx` also call
    `requireUser()`. Anyone classifying nav items public-vs-gated from that comment misclassifies
    two of them.
26. **No `error.tsx` / `global-error.tsx` anywhere in the app tree.** The header defends itself
    (`currentUserEmail` catches, chrome degrades to signed-out), but a DB failure inside a *page*
    still renders Next's unstyled default error. Cheap to fix, real for a product whose pages all
    query Postgres on every request.
27. **Skip-to-content link.** A nav now precedes `<main>` on all 22 public pages, so keyboard and
    screen-reader users traverse it on every navigation. Needs `id="main"` on each page's `<main>`
    — deliberately not bundled into the nav diff.

28. ~~**Extraction-run variance is the dominant coverage noise.**~~ ✅ 2026-07-09
    (MR sprint 3): K=5-voted synthesis with majority-merge shipped in the mapreduce
    engine — claim-level reproducibility 0.75 vs legacy 0.55, within-cell coverage
    SD 6.9 vs 8.0 on the 10-day A/B (docs/reviews/MR3-REDUCE-RESULTS.md). Standing
    ruling 18 pins the validated configuration.
29. ~~**635 Lebanese Arabic docs are filed under the `ru` theater.**~~ ✅ 2026-07-09
    (MR sprint 3 TASK 0): operator adjudicated → **ir** (theater = coverage lens, not
    nationality; proxy-network content follows the ir lens). Three
    `TELEGRAM_CHANNEL_THEATER` pins added, map holdout removed, `retag-theater --apply`
    moved 651 docs, catch-up map run drained the backlog (41 claims, $0.0041, zero
    integrity violations). Follow-up: #37.
30. **`digests.structured.stats.llm` makes true LLM cost measurable per digest.** Metering now
    has data (verified 2026-07-11, `provider_usage`): the MODELLED $0.158/day digest figure is
    replaced by **measured** reduce $0.173/day + map $0.159/day steady + digest(gulf legacy)
    $0.017/day (07-10, first full mapreduce day). Remaining: recompute the audit's §7c
    metered/unmetered split and the §11 re-extraction-redundancy multiple from the recorded
    `stats` now that both engines meter through the shared path.
31. **`rank.ts` has no `eventTypeWeights` for the new per-track event types.** Elite/nuclear
    events now carry `prosecution|enrichment|...` instead of being forced into the military
    vocabulary; `profile.eventTypeWeights[ev.type] ?? 1` gives them a neutral weight, so nothing
    breaks, but buyer profiles cannot yet prefer (say) `asset_seizure` over `appointment`.

32. ~~**The empty-extraction guard's threshold is 0 events, so a thin regeneration overwrites a
    rich one silently.**~~ ✅ 2026-07-09 (MR sprint 3): the shared persist path
    (`digest-persist.ts`, both engines) refuses regenerations carrying <50% of the
    existing digest's claims (DIGEST_MIN_CLAIM_RATIO, FORCE_REGEN=1 override);
    refusals surface in cron_runs counts. Integration-tested.
### New (from MR sprint 2 — map stage, 2026-07-09)

33. **Extractor-version bumps need a remap path.** The hourly map worker selects on the
    indexed `processed=false`, so bumping the prompt/frame/model re-maps **nothing** already
    processed — sprint 2 handled its own two prompt revisions by hand-resetting `processed`
    on the affected docs. The proper tool is a budget-gated `scripts/map-remap.ts` that
    ignores `processed` and anti-joins `doc_map_state` on the *current* versions. Until it
    exists, any prompt iteration silently applies only to new docs. **Now a hard
    prerequisite (2026-08-17 routing seam):** map is locked to the gpt-4o-mini/no-effort
    baseline with no env override — `MAP_MODEL` or a validated `MAP_REASONING_EFFORT` is
    refused `MAP ACTIVATION BLOCKED` — until this remap path exists and activation is
    explicitly authorized. Pricing or `analysis-reg-v1` approval alone does not unlock it.
    **STATUS 2026-08-22 — TOOL DEPLOYED, NEVER EXECUTED (not closed).**
    `scripts/map-remap.ts` plus remap mode in `runMapCycle` shipped 2026-08-21
    (`docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md`): dry-run-first, resumable,
    lease-safe, route-capability-gated, fail-closed on every numeric flag, checkpoint bound
    to extractor versions AND route target, and structurally incapable of writing
    `raw_documents.processed` or of deleting/rewriting historical `doc_claims`. It has NOT
    been run against production or any deployed route — remap is therefore NOT
    production-proven, and no yield, cost, or completion figure for it exists. Unlocking the
    MAP activation lock still requires, in addition: a costed remap of the historical
    corpus actually executed under explicit operator spend authorization, and a paid
    representative scorecard for the candidate model (#81).
34. ~~**`doc_claims.quote_orig` is best-effort: ~15% fail verbatim containment.**~~
    ✅ 2026-07-09 (MR sprint 3): `quote_verified` stamped at insert by the map worker
    (shared normalization in `quote-verify.ts` — unicode/bidi-isolate/whitespace
    folds), lazily backfilled for pre-stamp rows by the reduce loader; only verified
    quotes surface as evidence (`ClaimGroup.quote`), others fall back to the doc link.
35. ~~**Old-version doc_claims rows are permanent history.**~~ ✅ 2026-07-09
    (MR sprint 3): `src/lib/analysis/map-versions.ts` is the single accessor every
    doc_claims consumer goes through (reduce loader, tuner, coverage-check script);
    tested against `mapExtractorVersion()` per configured (track, theater). Standing
    ruling 18 makes it binding.
36. ~~**Map cron `maxDuration` is provisional (800s).**~~ ✅ ANSWERED (verified 2026-07-11): steady
    `map` runs land at **max 102s / avg 33s vs the 800s ceiling (13%)** (`cron_runs`, 38 runs), and
    the hourly cadence keeps pace — ru/ua/ir map coverage **99.87%**, backlog 57 docs all <1h old.
    Sizing is comfortable; downgraded to a WATCH (revisit only if a peak day or an extractor-version
    remap (#33) changes the steady-state).

### New (from MR sprint 3, 2026-07-09)

37. **Multi-theater source tagging.** The #29 adjudication filed the Lebanese channels
    under ir, but a channel like mtvlebanonews genuinely serves multiple lenses (il
    escalation, ir proxy network). `raw_documents.country_iso2` is single-valued, so
    every such source is an either/or editorial call today. At Tier-2/3 theater
    expansion, replace the single tag with source→theaters (N:M) tagging so one doc can
    feed several theater corpora without retag migrations. Until then: per-channel pins
    + the decision-log rationale are the mechanism.

## Tier 3 — before enterprise/API sales

8. **Per-subscriber canary marking** (BUSINESS-PLAN §4) — required to safely sell $100k
   embedding/redistribution deals. Not needed until that motion starts.
9. **Per-digest assessment block** (deferred from analyst-layer build 4) — the "what
   changed & what it means" prose layer; the /signals engine is the distinctive core, this
   is polish.
10. **Content-translation toggle** — LLM per-view translation of digests (i18n scaffolding
    is done; content stays English-first until a buyer needs it).

## From the unattended-run audit (2026-07-06, docs/reviews/AUDIT-2026-07-06.md)

10. ~~**sa (Saudi Arabia) feeds dark.**~~ ✅ 2026-07-07: root cause was arabnews.com's
    RSS frozen upstream since 2026-04-25 (reachable, stale — NOT bot-walling). sa
    revived with Saudi Gazette + Asharq Al-Awsat EN (350 fresh docs on day one);
    il revived with JPost + Ynet and flipped to active; bh/kw have no working feed
    and stay scaffolded (probe results in ingest/config.ts comments).

## From the original-brief diff (2026-07-06 — reconstruction under-specified the original)

11. ~~**Track §8.7 Phase 2 targets explicitly.**~~ ✅ 2026-07-12 (MERGE 2, design branch
    workstream G): targets-vs-actuals sublines + thin-sourced tile + nonzero-day mean now
    surface live on `/scoreboard` (`src/lib/scoreboard/summary.ts`, +14 tests). Original
    brief targets: event coverage ≥80% of ISW-reported events same-day, unsupported-claim
    rate <2%, timeliness within ±6h. **Measured 2026-07-11 (49 validation_runs):** coverage
    ru 18.4 / ua 15.6 / ir 20.7% mean (nonzero-day ~32%) — **59–64 pts short**; "unsupported"
    45–56% but that column is the *thin-sourced proxy* (docCount<2 AND hedged), not literal
    hallucination (see #45); median info-lead +15h — favorable but outside the symmetric ±6h
    band (early side), and null on the 22/49 zero-match days. The coverage gap remains the
    headline quality metric to drive (corpus depth #19/#42 is the lever, not tuning).
12. **Regional-bundle packaging (§6.5).** Original sells regional bundles as the SKU
    ("Gulf", not per-country): bundle $2–5K/mo, à-la-carte country ≈40% of bundle, global
    $10–15K/mo, standby $300–500/mo, no surge pricing. Current pricing page is per-country
    tiers (within ranges, not contradictory) — add the bundle layer before GTM launch;
    reconcile with GTM-STRATEGY packaging section.
13. **Sanctions-exposure counsel review (§8.6 risk 4).** Handling Russian state-media
    content may carry sanctions exposure — get counsel review. Operator action (goes in
    SETUP-NEXT-WEEK checklist).
14. **Source-reliability calibration as a scored dimension (§5) — DESIGN COMPLETE,
    implementation gated by #56.** A same-sample correlation is tautological because v1 is already
    the weighted hedging mean. The 2026-07-16 design uses strictly prior citations to predict
    90-day future ISW hedging per theater, with equal-source ECE/MAE, rank correlation,
    slope/intercept, clustered intervals, baselines and coverage gates. Do not implement/publish
    until the 26,195-citation Facebook root is segmented. Design + future coding handoff:
    `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`,
    `docs/prompts/2026-07-16-source-reliability-calibration.md`.

## New (from the 2026-07-10/11 state recon — docs/reviews/STATE-2026-07-10.md)

38. **[Tier 1 — external delivery proof only] X historical catch-up executed; alert evaluator
    and recovery production-proven.** The July 9–13 recovery ran to cursor exhaustion on the deployed
    lease-aware build (deploy `dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ`, main `a38a882`): checkpoint
    `x_gap_backfill:2026-07-09_2026-07-14` complete=true — 19/19 batches, 1,335 pages, 26,090
    returned, **16,007 inserted**, $3.9164, provider balance delta reconciled to the ledger to
    $0.00003, live watermark untouched. Gap days 07-10/11/12: 31/18/27 → 4,559/4,134/5,587 docs.
    Downstream rescore mapped ($0.4963), regenerated 28/30 digests (2 thin-regen refusals kept
    priors), revalidated 15/15 with 0 pending. Two consecutive healthy scheduled polls proven
    (cron 1141 + 1149, all failure counters 0). Full account: AGENTS decision log 2026-07-14 +
    `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md` §Execution results. **Pre-implementation
    alert gap:** every `ingest:x` run already wrote `cron_runs.counts.x_api` (`incomplete`,
    `pageTruncations`, `budgetStops`, `lockSkips`, …) but nothing yet ALERTS on fetched=0 repeats
    or truncation/incomplete — build the alert so the next freeze cannot masquerade as health.
    See also #66 (the park-vs-ceiling stall this run discovered) and the operator-approved coding
    handoff `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` Workstream C.
    **ALERT IMPLEMENTED 2026-07-15; DEPLOYED 2026-07-16 (`dpl_DhMh12dn4fdXCesEhXnpxw546Qkw`, main
    `35b97bd`):** `src/lib/adapters/x-health.ts` — a pure episode-deduped evaluator + a runner that
    emails `FEEDBACK_EMAIL` (safe fields only: no key/tweet/cursor value) on `pageTruncations`/
    `budgetStops`/`requestFailures`/unexpected `incomplete`, on prolonged/parked staleness, on
    repeated `fetched=0` polls (conservative consecutive threshold), and on a stuck catch-up, with
    one alert per episode (cooldown) + one recovery notice; the numeric result is recorded in
    `cron_runs.counts.x_api` even when the recipient is unset or Postmark fails. 32 fixture tests,
    zero network. **First scheduled production observation 2026-07-16:** cron run 1555 on the new
    deployment finished green (`mode=1`, `alertEvaluated=1`, `alertKind=0`, 382 docs, 46 requests,
    zero truncations/failures/stops); `x_api_health` persisted a clean state. This proves the
    monitor executes on real scheduled traffic, but not its unhealthy email + recovery path.
    **Natural incident evidence 2026-08-10–14:** provider request failures (not budget stops)
    parked the poller; scheduled catch-up resumed, inserted 10,393 documents, completed, recorded
    recovery state, and was followed by healthy hourly polls. This closes the evaluator/recovery
    behavior and #66. ✅ **CLOSED 2026-08-23 — external delivery independently confirmed.** The
    one remaining criterion was mailbox receipt of an X-health INCIDENT email and a RECOVERY
    email at the configured recipient, which `cron_runs` cannot prove. Both were read directly
    in the operator mailbox (`go@vociferous.nyc`) on 2026-08-23 and match `cron_runs`
    field-for-field: `[BNOW] X ingestion unhealthy: incomplete, request_failures`, delivered
    **2026-08-22T18:05:46.635Z**, body carrying reasons `incomplete, request_failures`,
    `requestFailures=2`, `incomplete=1`, `budgetStops=0`, `pageTruncations=0`, `lockSkips=0`,
    against the `ingest:x` run 18:02:36Z→18:05:47Z whose `counts.x_api` holds exactly those
    counters plus `alertKind=1, alertReasons=2, alertDelivery=1`; and
    `[BNOW] X ingestion recovered: resumed`, delivered **2026-08-22T19:04:17.601Z** with
    `requests=55`, against the run 19:02:36Z→19:04:18Z holding
    `alertKind=2, alertDelivery=1, requests=55`. TWO further independent incident/recovery
    pairs sit in the same mailbox on 2026-08-21 (07:03:47.156Z unhealthy / 08:03:34.077Z
    recovered; 17:03:28.097Z / 21:05:19.126Z).
    Mail held by Postmark and Gmail cannot be produced by a doctored database row, so this is
    genuinely external evidence. **What did NOT close this item:** the four in-window
    map-health emails cited by the QF-B soak closeout come from a DIFFERENT evaluator
    (`src/lib/analysis/map-health.ts`, job `map`), not from `src/lib/adapters/x-health.ts`.
    They prove the shared Postmark operator-alert transport, but #38's stated criterion is the
    X incident/recovery email specifically — so the closure rests on the X emails above, not on
    that recommendation.
39. **[Tier 1] No git→Vercel deploy integration.** `git push` does not deploy — after the 07-09
    auth fix, prod served the stale build ~20 min (`AUTH-EMAIL-2026-07-09.md`). Wire the Vercel Git
    integration, or codify "push then `npx vercel@latest deploy --prod`" in a release checklist so a
    pushed fix is not assumed live.
40. ~~**[Tier 1 — operator decision made] Magic-link login is not usable
    after the link's first open.** The single-use token is consumed
    by the first open (phone prefetch/scanner), so reopening on a second device →
    `/api/auth/error?error=Verification` (`AUTH-EMAIL-2026-07-09.md`). The 07-09 Postmark tracking
    fix (`9b5b368`) addressed a real but *secondary* defect, not this. **Operator ruling
    2026-07-15:** retain the single-use token and explain it in the email and sent screen: open it
    in the desired browser; if the email app uses another default browser, copy the unvisited URL
    and paste it into the preferred browser before opening it elsewhere. Implementation/tests:
    `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` Workstream A.
    **IMPLEMENTED 2026-07-15; DEPLOYED 2026-07-16 (`dpl_DhMh12dn4fdXCesEhXnpxw546Qkw`, main `35b97bd`):**
    the magic-link email (`src/lib/email/magic-link.ts`) and the `/signin?sent=1` screen now state
    the link is single-use + 24h and give the copy-before-opening preferred-browser instruction; the
    callback URL, 24h expiry, legal-acceptance redirect, and `trackLinks:"None"`/`trackOpens:false`
    are unchanged (token stays single-use, never exposed to analytics/logs). Tests pin the email +
    sent-page copy and that invite-ineligible/eligible requests give the same response.~~
    ✅ **CLOSED 2026-07-16 by operator/live proof:** a production request to the standing test
    account delivered message `07b145bf-bb55-4d52-b873-67d03f086426`; both Postmark's retained
    TextBody and the received Gmail message show the single-use, 24-hour, and copy-before-opening
    preferred-browser instructions. `TrackLinks=None`; the raw delivered MIME is text/plain only
    (no HTML/tracking pixel). The same unmodified link authenticated the test account and forced the
    expected current-policy acceptance flow.
41. **[Tier 1 — paid rescore BLOCKED] OpenSanctions monthly accounting + resumable rescore — CODE MERGED + DEPLOYED
    2026-07-15 (`f9aaa9e`, `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`); paid rescore still gated on
    #61 + operator auth.** Both defects are fixed in production (calendar-month `totalPeriod` in
    SpendGuard so `OPENSANCTIONS_CALL_CAP` resets at the UTC month boundary; fixed-cutoff `refresh=1`
    rescore requiring a valid ISO `before`, advancing batch-by-batch instead of re-selecting the same
    prefix; future/timezone-less cutoffs fail before provider work). Tests: 1495/131 unit + 27/7
    real-Postgres integration, typecheck/lint/build clean. Live zero-paid proof: `/health` 200 on
    the deployment, authenticated invalid-cutoff requests returned the new 400, and the July ledger
    remained 660 requests / $72.6000; no migration, cleanup, or paid call. See the 2026-07-15 decision-log entry
    and `docs/reviews/OPENSANCTIONS-MONTHLY-RESCORE-NOTE.md` + `OPENSANCTIONS-RESCORE-RUNBOOK.md`.
    **Fresh 2026-07-16 read-only recount:** 1,012 all-row eligible / 475 claim-linked; 232
    missing/stub overall / 46 claim-linked; July usage 780 requests / $85.8000 (120 today).
    **#17 spend prerequisite is now satisfied** (`be0ebf1` deployed; normal billable candidates
    232→46 with zero paid rollout calls). Remaining hard prerequisite is the kind-safe #61 fix: the
    current cleanup proposes 79 cross-kind merges and is not approval-safe. **Not done (do NOT close
    this item until all complete):** deploy the #61 handoff, rerun/approve/apply cleanup, recount the
    claim-linked population + current-month quota; obtain separate spend authorization; run the
    serial rescore to zero candidates and record before/after totals. #17's separate analyst-facing
    score/caption work does not block the rescore's spend boundary.
42. **[Tier 2] X single-platform citation dependency.** Completed-day Jul 9–15 claim→document
    link shares are IR **73.1%**, RU 36.9%, UA 31.5%. Across all three theaters X has 948 links
    over 131 identities; account concentration is moderate (top 1 6.3%, top 5 22.6%, top 10
    37.1%, HHI 0.0217), so platform dependency — especially IR — is the dominant risk, not one
    account. Diversify/diagnose with #19; evidence:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`.
43. ~~**[maintenance] AGENTS.md is over its own ~300-line budget.**~~ ✅ **CLOSED 2026-07-16:**
    third archive pass moved the complete prior live decision-log cycle verbatim to
    `docs/DECISIONS.md` (byte-compared against the source entries), moved the detailed living
    snapshot to `docs/CURRENT-STATE.md`, and returned AGENTS.md from 1,514 to 281 lines at the
    archive point (296 after this pass's current live decisions). Standing sections remain compact and
    correct-in-place; the archive remains append-only.
44. **[maintenance] `X_DAILY_USD_CAP` prod value is above the 1.5 code default.** 07-07 billed $1.877
    in one day without the daily guard stopping it, so prod is raised above the default. Reconcile the
    code default/comment (`x-api.ts:166`) with the actual prod cap so the ledger is not misleading.
45. ~~**[Tier 2] "unsupported-claim rate" KPI is a thin-sourced proxy mislabeled as literal.**~~
    ✅ **CLOSED 2026-07-16 at the product boundary:** `scoreDigest*` calls it
    `thinSourcedRate`, comments define `docCount<2 AND hedging∈{claimed,unverified}`, and every
    scoreboard label/translation says “thin-sourced” (tests pin it). The DB column
    `unsupported_claim_rate` remains a legacy internal name; a semantics-free migration is not
    justified. True independent-source corroboration/calibration stays separate (#14). Evidence:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`.
46. **[WATCH] Two non-actionable-yet watches.** (a) `ingest:fast` runtime averages 141s / peaks 162s
    against a 300s `maxDuration` (54%) — if RSS/GDELT latency grows it approaches the ceiling; consider
    splitting the adapter set or raising headroom. (b) **ua coverage** — A/B −3.6 pts (noise-scale) and
    07-10 ua military digest was thin (998 chars, 2 surviving events); the standing ruling-18 "watch ua"
    item, monitor as the post-cutover sample grows.

47. ~~**[Tier 1] MTProto ingest is one operator login away from live.**~~ ✅ CLOSED
    2026-07-11: login/session, production env, deployment, live backfill, first fetch,
    RU/UA-priority top-120 roster, and repeated scheduled runs were all completed. The
    2026-07-15 readiness delta re-verified 24/24 healthy hourly runs, zero channel errors,
    and 1,259 inserted MTProto documents in 24 hours. Non-fatal GramJS error-stream noise
    discovered during that audit is tracked separately as #69.

48. ~~**[Tier 2] /ask form double-submits — duplicate paid runs.**~~ ✅ SHIPPED
    (ask-polish sprint, 2026-07-12, `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`):
    pending-disable (useFormStatus: input+button disabled, spinner, aria-busy, ~10s
    hint) PLUS the root cause removed — the paid pipeline moved out of the GET
    render into a useActionState server action, so `/ask?q=` now only prefills and
    refresh/back-nav/shared links/prefetch can no longer bill (money test pins it).
    The belt-and-braces idempotency window (same user+question within N seconds
    returns the in-flight result) stays PARKED — daily caps backstop it.

### New (from MERGE 2, the design/commercial-site branch — 2026-07-12)

49. **[low value] B4 cron-slot qualifier one-liner.** `vercel.json`'s three intraday digest
    crons already pass `&slot=`, but `digest/route.ts:32`'s qualifier is still `group ?? mode`
    (never `slot`). One-liner (`group ?? slot ?? mode`) + a test whenever it's worth doing;
    parked in the design implementation note §4 as low-value now that the slot is at least
    visible in the cron URL.
50. **uk pluralization gap: flat `{n}` interpolation can't express Ukrainian noun forms.**
    `sources.more_summary` ships a genitive-plural constant ("каналів") as the least-wrong
    approximation because the catalog has no count-dependent plural mechanism (design
    implementation note §4). Fine for now (see `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`);
    a real pluralization rule set becomes necessary if more count-driven uk strings ship.
51. **D5: `scripts/registry-materialize.ts` should run on a schedule.** Recommended, not
    built, in the design implementation note §5. The new registry "Scores as of" line is
    stale (2026-07-03 as of the note; still parked per the MERGE 2 deploy note) until this
    runs again — weekly cron or a scheduled operator run.
52. **`ADMIN_EMAILS` is set in Vercel Production only.** Its 2026-08-14 value is
    `go@vociferous.nyc,go@vociferous.ai`; the `.ai` identity accepted the current policies and
    live-opened `/admin/ingest`, proving the admin gate. Preview and Development are absent
    (verified during MERGE 2) and `.env.local` has no readable copy, so non-prod environments
    fail closed to the reduced registry/signals views for every account, including admin's.
    Correct fail-closed behavior, not a lock-out, but worth mirroring to Preview/Development
    if those environments need full-view testing.
53. **MERGE 2's signed-in surfaces need an operator eyeball pass.** (Partially superseded
    2026-07-12: the analyst-trust sprint fixed the signed-in home's digest-status bug and
    reordered the page; the checklist in ANALYST-TRUST-NOTE-2026-07-12.md §⑥ is the
    current eyeball list. /registry is now admin-only, not merely reduced.)
    Original item: Home theater-status panel
    + validation tiles, `/signals` evidence `<details>` expansion, and `/registry` as a
    non-admin vs. an `ADMIN_EMAILS` account are unit-tested and JSX-reviewed but were only
    machine-checked signed-out; nobody has exercised them with a real magic-link session yet
    (design implementation note §5, item 6).

54. ~~**Digest deep links assume `claim_date == digest_date`.**~~ ✅ **CLOSED 2026-07-16:**
    both Ask and Search already select the owning `dg.digest_date` and build links from it; tests
    pin the resolver. Production has 1,263 claims, zero owning-date mismatches; one legacy claim
    has no digest and correctly gets no digest link. Evidence:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`.
55. **/search is not in the nav.** Reachable only from the signed-in home quick-links rail
    (analyst-home readback, decision 3 — nav carries frozen-URL + all-locale-label
    invariants). Add a `nav.item.search` Product-group entry once the surface proves itself.

56. **Platform-level registry sources must be segmented (R8, 2026-07-12) — Facebook only.**
    Fresh audit corrects the task: t.me is already 3,333 channel identities / zero roots; X is
    2,703 accounts / zero roots. One `facebook.com` root still pools **26,195 citations / 7,081
    raw URLs**. All have paths, but at least 1,977 use reserved routes (`watch`, `share`, `reel`,
    `permalink.php`, etc.) and need fail-closed shape-specific recovery; never treat a share id as
    a page. This blocks #14. Research + coding handoff:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`,
    `docs/prompts/2026-07-16-facebook-source-segmentation.md`.
57. ~~**/pricing promises registry access the product no longer grants.**~~ ✅ CLOSED
    (private-beta sprint, 2026-07-13): the public pricing page is retired — /pricing
    308-redirects to /access (beta request), all price cards and the registry-promise
    copy are deleted, and no signed-in surface advertises registry access. The
    underlying entitlement question (should role=analyst ever regain /registry) remains
    an operator decision but no public copy over-promises anymore.

### New (from the IA-refinement sprint — 2026-07-12, docs/reviews/IA-REFINEMENT-REVIEW.md)

58. ~~**[Tier 1 — operator ruling made] Source-attributed named people on
    private `/signals`.** The IA-refinement gate already withholds `Signal.detail`, exact claims,
    and sources from anonymous/unaccepted HTML via `toPublicSignal`; accepted users already see
    named claim quotes with hedge + sources. The 2026-07-13 remediation conservatively removed the
    qualifying name list and any "purge" conclusion from the accepted-user detail while awaiting a
    decision. **Operator ruling 2026-07-15:** accepted private-beta reviewers should see every
    qualifying named person and the full evidence; anonymous visitors remain teaser-only. Add a
    prominent Signals notice and explicit Terms language that names appear because cited open
    sources identify them and inclusion is not BNOW endorsement, accusation, opinion, or an
    independent assertion of truth. Preserve person/pressure/canonical-dedupe safeguards and do not
    restore unsupported coordinated-purge framing. Because the Terms change is material, bump its
    version and force re-acceptance. Implementation/tests:
    `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` Workstream B.
    **IMPLEMENTED 2026-07-15; DEPLOYED 2026-07-16 (`dpl_DhMh12dn4fdXCesEhXnpxw546Qkw`, main `35b97bd`):**
    `detectPurge` now carries `Signal.subjects` (one stable representative name per distinct
    qualifying canonical person, deterministically ordered, all of them); `toPublicSignal` still
    drops it and the `headline` still carries no names, so anonymous/unaccepted HTML shows zero
    names (proven by the page test's data-layer assertions + no evidence query). The accepted
    `/signals` view renders the names + a prominent attribution/non-endorsement notice; Terms §9
    gained the durable named-person rule and `CURRENT_TERMS_VERSION` bumped 1.0→1.1 (effective
    2026-07-16, the actual rollout date) forcing re-acceptance, Privacy unchanged at 1.2. All person/pressure/canonical
    safeguards + ruling 19 intact.~~ ✅ **CLOSED 2026-07-16 by operator/live proof:** the standing
    stale-acceptance account was redirected to `/welcome/legal`, which rendered required unchecked
    Terms 1.1 + Privacy 1.2 controls and optional analytics initially off. After the operator
    authorized acceptance (analytics kept off), the append-only 1.1/1.2 acceptance persisted and
    authenticated `/signals` rendered exactly one attribution/non-endorsement notice, a nonempty
    23-name qualifying subject list, and 47 evidence expanders. A fresh anonymous request on the
    same deployment contained neither the label nor disclaimer and retained the sign-in nudge.
59. **[i18n] Native review of the IA-refinement strings.** New/changed machine-translated keys
    need a native pass before market launch: nav labels `nav.group.signals`/`nav.group.ask`
    (all 7 catalogs); the reworded, count-driven `home.live` with the `{n}` token (all 7);
    `countries.detail.*` (en + provisional uk only — de/ar/ja/pl/fr fall back to English). Same
    gate as #20/#21; es/he/ko still ship no catalog (#21). Append to
    docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md.
60. **[low] Dead nav i18n keys after the Product-group retirement.** `nav.group.product` and
    `nav.item.{feeds,registry,me_registry,political_risk,ask,signals}` are defined-but-unused
    across all 7 catalogs. Harmless (English fallback intact, all tests green); remove in a
    cleanup pass when convenient — 7-catalog edit; watch the namespace-coverage test so you
    don't drop the last key of a required namespace.

## Deferred by design (key/access-blocked — see BLOCKERS.md)

Companies House, higher-volume Comtrade, zakupki proxy/mirror, maritime/AIS, ACLED, and
satellite access remain deferred. X and OpenSanctions are live and are not key-blocked;
their remaining engineering/operator work is tracked explicitly below. Telegram MTProto
is also live.

## Just completed (was open)

- ✅ Full ISW Iran Update corpus loaded (1,066 reports / 3,647 ME sources / 98k citations).

### New (from the private-beta readiness sprint — 2026-07-13,
docs/reviews/PRIVATE-BETA-READINESS-NOTE-2026-07-13.md)

61. **[Tier 1 — BLOCKED; do not approve/apply] Entity cleanup needs a kind-safe plan.** Fresh
    2026-07-16 deterministic dry run: **1,012 -> 794** (87 drops, 131 merges), but 79 merges cross
    entity kinds while deployed persistence identity is `(kind, canonicalKey)`, so those rows can
    be recreated. Kind-safe-only diagnostic: 52 merges, projection 873. Plan + apply procedure:
    docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md. Apply BEFORE the OpenSanctions
    fixed-cutoff rescore (it changes the scored population). **Sequencing added by the
    2026-07-13 remediation: DEPLOY the canonical-identity persist fix
    (digest-persist.ts `resolveEntityId`) before applying — the pre-remediation
    exact-name get-or-create would recreate merged spellings on the next digest
    persist, immediately regressing the plan.** The persist fix is now deployed. The
    Earlier 876→683 and 937-row figures are stale. Coding handoff:
    `docs/prompts/2026-07-16-entity-cleanup-kind-safe.md`. Deploy it and rerun read-only before any
    approval/apply. #17 claim-link eligibility is already deployed; #41 still waits on this
    kind-safe cleanup, recount, and separate spend authorization.
62. **[CLOSED 2026-07-14 by the X recovery regeneration] Graham digest rows repaired.**
    Production evidence after regeneration: event 4008 and claims 4413/4414 are gone;
    replacement event 4202 uses deterministic `Sources claim:` copy, with zero
    Graham+corruption residue. See `docs/PROGRESS.md` (2026-07-14 X recovery execution).
63. **[watch] Comtrade includeDesc verification.** Both fetchers now request
    includeDesc=true and persist partner_name, but Comtrade is unreachable from the dev
    box and the Vercel build host — the next monthly trade (2nd) / materials (3rd) cron
    is the live verification. If desc fields still don't arrive, the deterministic M49
    map keeps every observed code named; the column simply stays NULL.
64. **[i18n] Native review: private-beta strings.** ~31 machine-translated keys
    (nav.group.access, home.beta.*, home.cta.request_beta, access.* ×6 catalogs, the
    reworded scoreboard divergence explainer). Inventory appended to
    UK-NATIVE-REVIEW-2026-07-12.md; same launch gate as #20/#21/#59.
65. ~~**[low] Signed-in home 390px operator eyeball.**~~ ✅ **CLOSED 2026-07-16 by live
    proof:** operator-authorized production magic link authenticated the standing test account;
    exact 390×844 CSS viewport held `clientWidth == scrollWidth == 390`. Header/drawer, quick
    links, all theater cards, Ask/recent question, validation tiles and footer passed visual
    inspection. Gmail DKIM/SPF/DMARC passed; session signed out; temp profile removed. Evidence:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`.

### New (from the X gap recovery execution — 2026-07-14)

66. ~~**[Tier 1] Steady X poller cannot self-recover from a watermark park longer than
    ~4–8h.** Observed live 2026-07-14 09:20Z: after an ~8h daily-cap pause, the fixed
    5-page/batch ceiling truncated 6 dense batches (`pageTruncations=6`, incomplete),
    the watermark held (correct, non-lossy), and every hourly retry re-billed the same
    backlog (~$0.20/h) without converging — backlog accrual for the densest batches
    (~19 tweets/h) outruns what a 100-tweet/batch pass can drain when parked >~5h.
    Manual remedy (twice-proven this run): bounded `x-gap-backfill` drain over the
    parked window + operator watermark advance to the drained boundary (compare-and-set,
    lease free; the poller's 30-min overlap guarantees continuity). Proper fix needs a
    reviewed code path: env-tunable page ceiling, or a bounded self-catch-up mode that
    drains cursor-complete under an explicit budget when it detects a long park. Also
    noted: registry roster hash drifts at MINUTES scale, so a stopped drain must resume
    immediately or restart under a fresh checkpoint key (observed: a 502-stopped run
    refused resume 3 minutes later). **Operator ruling 2026-07-15:** implement the bounded,
    resumable self-catch-up and alert path now; the reviewed design must snapshot the roster,
    insert-before-checkpoint, compare-and-set the final watermark, reuse the X lease/SpendGuard,
    and make zero paid calls in tests. Handoff:
    `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` Workstream C.
    **IMPLEMENTED 2026-07-15; DEPLOYED 2026-07-16 (`dpl_DhMh12dn4fdXCesEhXnpxw546Qkw`, main `35b97bd`):**
    `src/lib/adapters/x-auto-catchup.ts` — when `x_api.lastPollAt` is older than
    `X_PARK_THRESHOLD_SEC` (default 4h) the scheduled `ingest:x` run drains ONE fixed window
    `[oldWatermark, caughtUpTo)` (captured once) via the existing `runGapBackfill` engine (no page
    ceiling, insert-before-checkpoint), snapshotting the roster INTO the checkpoint so minutes-scale
    registry drift can't strand it, bounded per-run by `X_AUTO_CATCHUP_REQUEST_LIMIT` (≤
    `X_RUN_REQUEST_CAP`) under the shared `x_api` SpendGuard + the X lease, advancing the live
    watermark to the fixed boundary only on completion via a compare-and-set that never moves it
    backward; a crash-completed checkpoint finalizes the advance with zero paid calls. 15 fixture
    tests, zero network/paid calls. Residual: a tail smaller than the threshold but larger than one
    steady-poll pass can drain would truncate — the #38 monitor ALERTS on it (not silent); the
    operator lowers `X_PARK_THRESHOLD_SEC` or runs the manual gap-backfill. **Do NOT close until a
    real scheduled park → checkpoint-resume → completion sequence is proven in prod.** The first
    post-deploy scheduled run (1555, 2026-07-16 12:20Z) was correctly steady and healthy
    (`mode=1`, no auto checkpoint, watermark advanced, `x_api_health` clean); useful wiring proof,
    but deliberately insufficient to close this item because no natural park occurred.**~~
    ✅ **CLOSED 2026-08-14 by natural production proof:** an Aug 10 provider-request-failure
    episode parked the poller with zero budget stops. Scheduled catch-up resumed across runs and
    inserted 560 + 9,069 + 764 = 10,393 documents on Aug 13, completed the checkpoint/watermark
    recovery, recorded recovery state, and returned to healthy hourly steady polls through the
    Aug 14 audit. Provider usage proves this was not a cap stop: $43.8075 cumulative of $75;
    $0.7386 on Aug 10 and $1.6575 on Aug 13, both below the $2.50 daily cap.

### New (from the PostHog analytics phase-1 deploy — 2026-07-14)

67. **[CLOSED 2026-07-14 same day — activation EXECUTED]** The operator created dedicated
    US-Cloud project 512327 "BNOW.NET" and supplied credentials mid-session; privacy toggles
    set via API (IP discard on; GeoIP kept ON by operator decision); key/host in Production
    only; deploys `dpl_J5CoSce…` (keyed) + `dpl_8xh5zXY…` ($identify signup_at fix `9e371dc`);
    all 12 events Live-Events-verified with UUID identity + full negative re-tests; dashboard
    1848415 (9 insights) + Action 289102 created. The operator confirmed the billing limit is
    configured on 2026-07-15. Residual (all operator, minutes-scale): project-membership review;
    optional API-key scope re-narrowing; accept Privacy 1.2 on operator accounts. The GeoIP/region/retention
    privacy-wording pass is now deployed in Privacy 1.2. Evidence:
    POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md §Activation executed. Original task
    text follows for the record.
    **[operator] PostHog activation: dedicated project, key, Live Events, dashboard.**
    Phase 1 is live and fail-closed: analytics code merged (`e5123a9`), migration 0020
    applied, Privacy 1.1 + optional consent deployed keyless
    (`dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6`); zero PostHog requests proven in production for
    anonymous AND signed-in-unaccepted sessions. No PostHog personal/admin token exists
    in any authorized env file, so the dedicated BNOW project cannot be provisioned from
    this box, and the US-vs-EU Cloud region is an explicit operator decision (do not
    infer it from Scenefiend's US config). Operator sequence, in order: (1) create the
    dedicated BNOW project (deliberate region choice) or hand over an org-scoped `phx_`
    personal API key + recorded region decision; (2) set project privacy posture
    (IP capture off, replay/autocapture/surveys/heatmaps/errors off, membership,
    billing limit) and record region+retention; (3) add `NEXT_PUBLIC_POSTHOG_KEY` +
    `NEXT_PUBLIC_POSTHOG_HOST` to Vercel **Production only** (readable-plain,
    `--no-sensitive`), redeploy (build-time values); (4) opted-in test-account Live
    Events inspection (all 12 allowlisted event types, raw payload audit, then the
    denial/sign-out/cross-tab/account-switch/Preview/localhost zero-request re-tests);
    (5) `BNOW Private Beta` dashboard (nine insights) + `first_value_event` Action —
    no alerts until traffic supports thresholds. Full evidence + checklist:
    `docs/reviews/POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md` § Production
    execution results. Reminder: all existing users (incl. Jason/Irina) re-accept
    Privacy 1.1 on next visit — expected, not a bug; analytics stays opt-in either way.
    **Update (analyst-beta remediation 2026-07-15):** Privacy 1.2 is deployed and forces
    re-acknowledgement; it discloses US region, GeoIP-derived coarse location, seven-year
    retention, and active-only opt-in. The billing limit was operator-confirmed configured on
    2026-07-15; only the PostHog **project-membership review** remains open in the UI.

### New (from the analyst-beta launch remediation — 2026-07-14; deployed 2026-07-15)

68. **[CLOSED 2026-07-15] Analyst-beta remediation merged, pushed, deployed, and publicly
    verified.** `main == origin/main == 2bf89ed`; Vercel deploy
    `dpl_EmHs6NneKtPA5RC9i4T3ybYSjLEx` is READY and aliased bnow.net. Fresh gate:
    typecheck/lint, 1460 unit tests, build, and React review green. Production `/health`
    returned 200/DB OK on the expected build; Privacy 1.2, corrected scoreboard copy, and
    selector subset are live; the initial runtime-error scan was empty. The prior scoped
    Neon integration run was 9/9; a new full run was blocked before branch creation by an
    expired `NEON_API_KEY` (tracked in BLOCKERS/HUMAN-SETUP). The authenticated phone sweep was
    later completed and closed under #65; PostHog project-membership review stays under #67 (the
    billing limit is configured). **Later update
    2026-07-15:** `SIGNIN_MODE=invite` is now live in Production via deployment
    `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8`; five existing users remain eligible.

### New (from the 2026-07-15 private-beta readiness delta)

69. **[Tier 2 — observability] GramJS emits peer-type `CastError` noise during successful
    MTProto runs.** Vercel records about two error-stream messages per selected channel
    (`channelId` and `accessHash`; roughly 80/hour at 40 channels/run). Live impact is
    currently telemetry-only: the latest 24 scheduled runs were `ok=true`, recorded zero
    channel errors, and inserted 1,259 documents; all 144 cached channel rows have
    `last_error IS NULL`. Investigate the bundled GramJS peer construction/auto-resolution
    path, preserve exact 64-bit identifiers and access hashes, add production-shaped
    regression coverage, and prove the Vercel error stream is clean. Do not merely suppress
    `console.error`; real GramJS errors must remain visible. Evidence:
    `docs/reviews/PRIVATE-BETA-READINESS-DELTA-2026-07-15.md`.
    **Fresh 2026-07-16 audit:** 24/24 green, 1,251 inserts, 960 channel selections, zero recorded
    errors; all 145 channel-state rows clean. `telegram` 2.26.22 is current; local construction +
    serialization with signed 64-bit fixtures does not reproduce the warning, so blanket
    suppression or an unproven conversion rewrite is rejected. Research + handoff:
    `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`,
    `docs/prompts/2026-07-16-gramjs-casterror.md`.
70. ~~**[low maintenance] GitHub Actions v4 action-runtime deprecation.** CI for the
    readiness-delta commit passed both jobs, but GitHub annotated `actions/checkout@v4`
    and `actions/setup-node@v4`: their Node 20 action runtime is deprecated and GitHub is
    currently forcing it onto Node 24. Upgrade to the current Node-24-based action majors
    in a workflow-only change, then verify the gate and integration jobs. This is not a
    current application-runtime or CI failure.~~ **DECLINED/CLOSED by operator ruling
    2026-07-16 — do not change the workflows.** Scenefiend's history shows why: automatic Actions
    was deliberately minimized to protect constrained Actions budget; hosted E2E was retired when
    it exercised the wrong backend and required storing Neon/Postmark/OpenAI credentials as repo
    secrets; operator-local validation plus Vercel remained authoritative. BNOW keeps its current
    workflows untouched unless a future operator ruling explicitly reopens this.

### New (from the analyst-experience quick wins — 2026-07-16, docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md)

71. **[Tier 3 — presentation] Evidence trail is still a min-width table inside a horizontal
    scroller on narrow viewports.** Pass 2 made it source-first and dropped the Platform
    column into a badge, cutting the table's min-width from 760px to 560px, but below that
    it still scrolls inside its own tested `overflow-x-auto` wrapper. The page itself never
    overflows (verified at 390px and at 320px WCAG reflow), so this is comfort, not a
    defect. A card layout below `sm` — source + platform badge, published, title link,
    reliability stacked per document — would remove the inner scroll. The prompt explicitly
    permitted retaining the wrapper and recording this instead of a rushed conversion.
72. **[i18n] Buyer-profile labels/descriptions are hardcoded English.** `PROFILES` in
    `src/lib/profiles/config.ts` carries `label`/`description` as literals, so the digest
    page's "Prioritize for:" row renders Standard / Military & security / Sanctions /
    Commodities / Compliance untranslated on every locale, and the descriptions (shown as
    `title` tooltips) likewise. The rest of the digest chrome is catalog-backed via `makeT`.
    Fix = move them to `digest.profile.<key>.label` / `.description` keys across the visible
    catalogs. `key` is the `?profile=` query value and must NOT change. Documented in the
    file itself; deliberately not folded into the presentation batch.
73. ~~**[a11y] Signed-out landing page carries unpaired gray text.**~~ ✅ **CLOSED
    2026-07-16 after live production proof.** Application commit `40151b6`; deployed from main
    `df79411` as `dpl_7useRyXz71PVkyFgYqZTXKJXf8mv`. All eight corrected foregrounds measured
    7.56:1 light / 7.61:1 dark on the project domain across 1280×900, 390×844 and 320×844 in
    both themes. Deployment stamp, nine hrefs, signed-out/no-Ask gating and mobile-menu hydration
    passed; zero console/page errors or page overflow. The already-passing private-beta badge was
    unchanged. Details: `docs/reviews/SIGNED-OUT-LANDING-CONTRAST-2026-07-16.md`.
74. **[env/tooling] Dev-mode React never hydrates on this WSL2 box.** `npm run dev` serves
    and server-renders fine, but the `_next/webpack-hmr` WebSocket handshake fails with
    `net::ERR_INVALID_HTTP_RESPONSE` and no React control responds to input — the header
    language menu, the mobile hamburger, everything. Native `<details>` still works, which
    masks it. `next build` + `next start` hydrates correctly. **Verify React UI against a
    production build until this is fixed**; a dev-server click test proves nothing here.
    Not an application defect (reproduced on untouched components).
75. **[CLOSED 2026-08-03 — won't-fix by operator decision; no third-party exposure]** The
    clickwrap was bypassable on `/search`, `/entities` and `/digests` for the same
    layout-only-gate reason. `requireAcceptedUser()` redirects a signed-in-but-unaccepted
    user to `/welcome/legal`, but while that gate ran only in the layout, the redirect never
    cancelled the page's own render — so an unaccepted user still received the page content
    (HTML in the 307 body, or a 200 flight payload with `RSC: 1`). The 2026-08-03 page-gate
    repair (AGENTS.md ruling 21 + its decision-log entry) CLOSED the leak: those users now
    get the redirect with no content.
    **Resolution — won't-fix.** The remaining item was the legal/product question of the
    acceptance window: the forced re-acceptance of 2026-07-21 (Privacy 1.3) left existing
    accounts unaccepted, so some consumed subscriber surfaces without having accepted the
    current Terms/Privacy pair. The operator adjudicated this as needing no remediation:
    every existing account is one of the owner's own email aliases and is disposable, so
    there is no third-party user-acceptance exposure to record or disclose. No
    record-keeping, no user-facing follow-up, and no change to the acceptance flow. This
    closes the legal/product track only — the code repair stands on its own, and ruling 21
    continues to bind every new gated page. Should real third-party users be admitted
    before the acceptance flow is revisited, re-open this as a fresh item.

### New (from the Iran validation recovery — 2026-08-15,
docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md)

76. **[Tier 2 — source acquisition] shafaq.com is the most-cited unreachable Iran source.**
    1,398 ir citations (149 since 2026-07-15 alone, cited through 2026-08-14), fresh feeds
    exist (`/{lang}?rss=1`), but robots.txt explicitly disallows the feed roots for
    `User-agent: *` — the roster review rejected it on the robots gate rather than
    ingesting against operator intent. Worth direct outreach for feed permission; do not
    ingest via the section-feed loophole.
77. ~~**[Tier 1 — reliability] The map worker's session advisory lock strands on the Neon
    pooler.**~~ ✅ **CLOSED 2026-08-23** — evidence in the STATUS paragraph at the end of
    this item. Observed twice on 2026-08-15 (a local dry run, then production's own route
    during the recovery drive): with the pooled DSN, `pg_advisory_unlock` can route to a
    DIFFERENT pgbouncer server connection than the lock's, leaving the lock held by an
    idle backend and every later cycle recording `skipped`. The hourly cron has survived
    only because pgbouncer usually re-hands the same hot server connection (advisory locks
    are session-reentrant). A stranded holder is precisely identifiable — advisory lock
    0x6d617031 held + backend idle >45s + NO open `map`/`map:backfill` cron_runs row —
    and safe to `pg_terminate_backend`. Durable fix: transaction-scoped
    `pg_try_advisory_xact_lock` on a connection that stays pinned for the cycle (or a
    provider_state lease like x-lease). Interim recovery tooling used a janitor with the
    exact predicate above.
    **STATUS 2026-08-23 — CLOSED; the formal 24-hour production lease soak PASSED.** The
    durable fix is the `provider_state` `map_lease` row
    (`src/lib/analysis/map-lease.ts`): single-statement CAS acquire under proven expiry
    against the DB clock, per-acquisition tokens, token-checked renew/release, monotonic
    diagnostic fence — no session state for a pooler to strand. Merged as PR #7
    (`23a1280`) and deployed 2026-08-22 as `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`
    (`docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md`; closeout §9). Live-verified
    on the first natural cycle: outcome `acquired`, fence 1, 57 renewals, lost 0,
    released 1, lease left at `{"fence": 1}` with no token, and ZERO advisory locks
    remaining in `pg_locks`.
    **Formal window 2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z — all 11 checklist
    conditions satisfied**, re-derived independently from `cron_runs` on 2026-08-23:
    **24/24** expected natural `:40` cycles over 24 distinct UTC hours; **0** missing,
    **0** duplicate, **0** off-schedule, **0** `ok=false`, **0** `finished_at IS NULL`,
    **0** rows with a non-null `error`; ONE distinct `counts.lease.outcome` = `acquired`;
    fences **2 → 25**, 24 distinct, every delta exactly +1 (pre-soak first fence **1**;
    the whole lease era is a gapless 1..35 with zero repeats and zero non-acquired
    outcomes); `lost = 0` and `released = 1` on all 24; `leaseLostDiscards = 0`;
    **1,541** renewal attempts and **1,541** successes (the identity
    `renewals = batches + llmCalls + 2` holds on every row, so no renew failed and no 429
    retry occurred); reported claims **3,995** exactly equal to `doc_claims` rows created
    in-window (**3,995**); residue `provider_state.map_lease = {"fence": N}` with the
    token absent; **zero** advisory locks; one baseline dispatch identity throughout
    (`gpt-4o-mini` / effort `null` / `analysis-reg-v1` / `baseline` / workload `map`);
    only the four current extractor versions written; 86 Vercel env rows / 48 distinct
    names with no routing variable and no `MAP_LEASE_TTL_SEC`; no migration; and **no
    `map:remap` row in `cron_runs`, ever**. Independent review PASS (0 BLOCKER, 0 HIGH,
    0 MEDIUM). Post-window continuity 10/10 cycles, fences 26–35, clean.
    **Scope limits recorded WITH the PASS, not hidden by it.** (a) Production exercised
    only the steady single-holder path: contention, `expired_takeover`, `busy`, the
    loss latch and the discard path never fired, so contention handling remains
    test-proven (`map-lease.itest.ts` + unit) and is NOT production-proven (#95).
    (b) There is no retained runtime-log coverage of the formal window at all — the
    Vercel CLI caps at 100 records and no log drain exists (#93) — so the durable
    `cron_runs` record plus four stores the counts payload does not write
    (`doc_claims`, `doc_map_state`, `provider_state`, `provider_usage`) plus out-of-band
    alert email carry the evidence. (c) `pg_locks` readings are PARTLY point-in-time: the only
    IN-WINDOW reading is the interim pass at 2026-08-22T21:33Z (advisory = 0 twice ~10 min
    apart, `map_lease = {"fence": 20}`), while every later reading — this closeout's
    included — post-dates a Neon compute restart (`pg_postmaster_start_time()` has moved at
    least three times since the window closed, most recently 2026-08-23T12:25:24Z) and so
    carries no window coverage. The load-bearing evidence is structural and not
    time-sensitive: a repository-wide grep for `pg_try_advisory_lock` / `pg_advisory_lock`
    / `pg_advisory_unlock` over `src/` and `scripts/` returns only two COMMENT lines in
    `map-lease.ts` and ZERO call sites, so no advisory lock remains anywhere in the map
    path to strand.
    (d) `counts.lease.lost` — NOT `leaseLostDiscards` — is the authoritative lease-loss
    signal (#96). (e) Reported-claims == persisted-claims proves no transaction rollback
    and no `ON CONFLICT` suppression; it does not prove that no work could ever have been
    discarded before either counter incremented.
    **Still open, deliberately:** #85 (fence column / mixed-generation interleave — needs
    a migration) and #90 (a malformed `map_lease` row would wedge the stage while
    reporting `ok=true`) are the accepted residuals the lease does NOT close; #86, #87
    and #88 are untouched by this closeout and remain open.
78. **[Tier 2 — release hygiene] A CLI deploy from a git WORKTREE ships no commit stamp.**
    A worktree's `.git` is a FILE (gitdir pointer), which defeats the Vercel CLI's git
    metadata detection: `/health` on `dpl_9xyqCLfZn6n8WTifQ6BpgpV9wJja` renders an empty
    build stamp, so release verification had to fall back to `data-dpl-id` + behavioral
    probes. Options: deploy from a plain clone, set `VERCEL_GIT_COMMIT_SHA` explicitly at
    deploy time, or render a fallback stamp baked at build. Also add a pre-deploy
    clean-tree check to the release checklist (this release briefly had one uncommitted
    reviewed fix in the uploaded tree; committed immediately after as `70b2aa9`, tree
    byte-identical to the deploy).
79. **[Tier 2] RU ROCA citation registry has the same historical staleness Iran had.**
    36 ru reports (2026-07-04→08-14) are `pending` with zero citations; newest parsed ru
    report is 2026-07-03. The 2026-08-15 validation hook refreshes citations for every
    report validation fetches GOING FORWARD (theater-agnostic), but the historical rows
    need one authorized run: `npx tsx scripts/isw-refresh.ts --theater ru` + a full
    `registry-materialize` (minutes, $0). Deliberately not run during the Iran recovery —
    outside that task's production-write authorization.
80. **[maintenance] `.env.local`'s `DATABASE_URL_UNPOOLED` credentials are stale** (auth
    fails). Operator: re-pull from the Neon console. Until then scripts fall through to
    the pooled DSN (`registry-materialize` now treats an empty override as absent).

### New (from the cloud-model routing seams reconciliation — 2026-08-20, PR #5,
docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md §12.11)

81. **[Tier 2 — activation gate] No candidate model has a paid representative
    evaluation.** `analysis-reg-v1` (`src/lib/llm/analysis-registry.ts`) holds
    baseline-only approvals (gpt-4o-mini, effort absent, status `baseline`) and ZERO
    `evaluated_candidate` entries, and there is no production bypass. Promoting any
    candidate for any of the five analysis workloads needs its own representative
    evaluation against that workload's gate (mapreduce A/B, validation majority-vote
    design, digest production baseline), a registry entry citing that evidence, and
    explicit operator spend authorization. Separately blocked/unauthorized — the routing
    seam only makes the gate enforceable; it does not schedule the evaluation.
82. **[Tier 2 — spend hygiene] `scripts/ask-eval-harvest.ts` still constructs an
    unguarded, default-retry OpenAI client.** The routing hardening put every ANALYSIS
    dispatch behind `analysisOpenAiClient()` (`maxRetries: 0`, one reservation per physical
    dispatch, source-scan test-pinned), but this Ask eval-tooling script is outside that
    scan and can still retry a billed call without a matching reservation. Out of scope for
    PR #5; fix by routing it through the guarded client seam or documenting it as
    operator-only tooling that must not run unattended.
83. **[Tier 3 — blocked] The Anthropic provider seam remains unmetered and inactive.**
    `ANTHROPIC_API_KEY` is absent everywhere and the seam is auto-selected only when an
    Anthropic key exists and no OpenAI key does, so nothing dispatches through it today —
    but it is not wired through `model-config.ts`, the analysis registry, or the pricing
    table, so activating it would bypass all three gates. Wiring it is its own follow-up
    and a prerequisite to ever setting an Anthropic key.
84. **[Tier 1 — deploy gate] Re-confirm `ASK_USD_CAP_DAILY` headroom under the corrected
    gpt-5-mini price before deploying PR #5.** The correction ($0.125/$1 → $0.25/$2 per 1M
    tokens) doubles the Ask rerank reservation and recorded estimate at deploy —
    `rerankCeilingUsd()` $0.005125 → $0.01025, per-Ask worst case $0.067625 → $0.07275 —
    with no change in what OpenAI actually bills. Measured read-only 2026-08-20: cap $2/day
    (Production + Preview; absent in Development), `openai_ask` $0 since 2026-07-21,
    largest day ever $0.2748, all-time $0.4468 vs the $10 per-provider `LLM_SPRINT_USD_CAP`
    backstop — ample headroom today, so this does NOT block the merge. It blocks the deploy
    only in the sense that the check must be re-run against the day's real usage at release
    time, and the `ask_usage`/allowance numbers will visibly shift afterwards.
    Cross-reference: **#33** is the other routing follow-up — it is now a hard prerequisite
    to unlocking the map activation lock, tracked under its own existing ID, not duplicated
    here. **STATUS 2026-08-27: still OPEN — the intended release-time re-check was not
    contemporaneously recorded at either the 2026-08-20 (PR #5) or the 2026-08-24
    (release-train) deploy.** In fact there was no exposure: `openai_ask` has spent $0
    since 2026-07-21 (re-measured 2026-08-27; largest day ever $0.2748, all-time $0.4468),
    so the missed record cost nothing — but that does not retire the acceptance, which
    stands for the next deploy: record the headroom check against the day's real usage at
    release time. Not moot; the cap posture is unchanged.

### New (from the QF Worktree B map-lease/remap release — 2026-08-21, PR #7,
docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md)

85. **[Tier 2 — concurrency] Fence column on the map tables (the residual the lease
    deliberately does NOT close).** `src/lib/analysis/map-lease.ts` is strictly safer than
    the `pg_try_advisory_lock` it replaces, but it is not a fenced writer: the fence
    counter is diagnostic-only, and map writes are protected by a token OWNERSHIP RE-CHECK
    (a full-TTL renew) performed immediately before the write — a check-then-act, not an
    atomic statement fence. The unprotected window is the whole renew-to-COMMIT span
    (~100 networked round-trips for a 25-doc `persistBatch`). If that entire span stalls
    past the full TTL at exactly the wrong instant, a takeover can land first and both
    generations commit; the unique keys keep that duplicate-proof but not interleave-proof,
    so the bounded worst case is a first-writer-wins MIXED-GENERATION claim set for one
    (doc, track, version). Traceability and publication safety are unaffected (shadow-map
    tables only; every interleaved claim was genuinely extracted from its own document).
    Complete fix: add a fence column to `doc_claims`/`doc_map_state` and have each write
    refuse a lower fence in the same statement — a MIGRATION, deliberately out of the
    2026-08-21 release's scope. Audit refs: G4, L4-2, safety-review n1.
86. **[CLOSED 2026-08-24 — repair deployed 2026-08-23, 24-hour recovery window PASS; batch
    rejection 56.8% → 0.0%]** ~57% of map micro-batches WERE rejected by the provider with
    `400 Invalid body: failed to parse JSON value`. Measured from `cron_runs`: 0% through
    2026-07-15, first appearing 2026-07-16 (7.1%), then a continuously RISING plateau, flat
    across every deploy boundary (08-19 46.6% · 08-20 45.4% · 08-21 52.7% · **08-22 57.0%**;
    591 of 1,041 batches inside the 2026-08-22 lease-soak window = **56.8%**) — so it is
    not a routing or lease regression, it is standing corpus damage. The earlier "~50% /
    ~45–54%" framing is superseded by these measurements. **Root cause
    identified 2026-08-21:** `mapDocLine` truncates with `body.slice(0, mapContentChars())`
    (`src/lib/analysis/map-prompts.ts:164`), a UTF-16 slice that can cut a surrogate PAIR in
    half; the resulting lone surrogate survives `JSON.stringify` as an unpaired escape and
    the API rejects the entire request body — so ONE emoji-truncating doc kills its whole
    20-doc batch. The growth curve matches the growth of emoji-bearing Telegram/X content.
    Fix: truncate on code points (or strip/repair lone surrogates) before building the
    prompt, and add a fixture test with an emoji at the truncation boundary. Deliberately
    NOT fixed in the 2026-08-21 map-lease release — `map-prompts.ts` is outside that PR's
    delta and changing extraction behaviour would confound the lease soak. This is the
    largest single lever on map yield currently known.
    **STATUS 2026-08-23 — DEPLOYED; RECOVERY WINDOW OPEN; NOT CLOSED.** Root cause confirmed
    three ways: (a) `JSON.stringify` emits an unpaired surrogate as the literal escape
    `\udXXX`, whose UTF-8 bytes are pure ASCII, so a strict server-side parser rejects the
    whole body — measured on the runtime in use; (b) reproduced on the unpatched base tree
    with synthetic data, where a 20-document micro-batch carrying ONE boundary-split emoji
    is rejected at `$.messages[1].content`; (c) replaying the worker's exact selection
    predicate over the **1,000 oldest eligible `processed=false` documents** finds **20**
    whose 1,500-code-unit slice ends on a lone high surrogate (all at index 1499, all
    `0xD83C`/`0xD83D` emoji halves, across ir/ru/ua and `telegram_mtproto` /
    `telegram_web` / `x_api`, dated 2026-07-16→2026-08-18), and all 20 are still
    `processed=false` with ZERO `doc_map_state`, `doc_claims` and `doc_dedup` rows —
    re-selected every cycle forever, with no competing persisted claims. Those 20 yield
    **31 doc-track pairs** (11 are applicable to both `military` and `elite_politics`),
    which collide into the 25 failing batches observed every cycle. **Correction forced by
    review:** the provider only began REJECTING lone-surrogate escapes around 2026-07-16 —
    before that it accepted them, and five documents (2263, 622042, 715046, 1163005,
    1425485) that orphan under the old truncation hold `doc_map_state` rows under the
    CURRENT version, mapped 2026-07-09→07-13. Nothing re-extracts them: `processed=true`
    keeps them out of the HOURLY worker's `processed=false` selection, and each already
    holds a current-version `doc_map_state` row for `military` — `applicableTracks` returns
    `["military"]` and nothing else for all five — so remap's step-3 anti-join empties
    `pending` and never builds a batch. (`processed=true` is remap's INCLUSION disjunct,
    not an exclusion; a first correction wrongly said otherwise and round 2 caught it.) The
    original claim that such requests "never produced an extraction under any contract" was
    false and is withdrawn. (425 of the same
    1,000 carry COMPLETE astral pairs, which are unaffected.) Repair: `wellFormedSlice` +
    `dropIsolatedSurrogates` in `src/lib/analysis/map-prompts.ts` — slice to the SAME
    `MAP_CONTENT_CHARS` **code-unit** ceiling first, then drop any isolated surrogate; the
    identity on every well-formed input, so previously successful requests stay
    byte-identical. **Same extractor versions** (the version basis is model + system prompt
    + frame rev + content budget, none of which moves; the four live versions are now
    pinned literally by test) — no remap is required or authorized. This item stays OPEN
    until the post-deployment 24-hour recovery window closes on these criteria: every
    expected hourly cycle present; **`batchErrors = 0` on every steady cycle — not merely
    "improved"** (all 31 poisoned doc-track pairs are repaired, so a non-zero value is a
    DIFFERENT defect and must be classified from the runtime log before the window can
    close); `llmRequests === batches` per cycle; the 20 formerly poisoned ids reaching a
    final disposition and never re-selected; normal lease invariants, with `renewals`
    re-baselined to ~`2 × batches + 2` (up from ~64 — a consequence of the repair, not
    drift); stable metering and spend inside both caps (escalate above $25 of the $40
    all-time map ceiling, or on any `budgetStopCategory` other than `run_cap`); no
    model/routing/extractor-version drift; the frozen constants `processedMarked = 537` and
    `alreadyMapped = 139` moving; and truthful error accounting. **DEPLOYED 2026-08-23 as
    `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`** (PR #10, merge `0aa3d7d`; `/health` stamps
    `0aa3d7d`, DB OK; one deployment, from a fresh clone, no migration, no env change).
    **First natural cycle 14:40:20Z → 14:44:34Z did exactly what was predicted:**
    `batchErrors` **25 → 0**, `llmRequests` == `batches` == **45**, `processedMarked`
    **537 → 1,000**, claims **201 → 498**, `estUsd` $0.0223 → $0.0660, lease `acquired`
    fence 38 with lost 0 / released 1 / discards 0 and renewals **92 = 45 + 45 + 2**, the
    same four extractor versions and no fifth, `map_lease` = `{"fence": 38}` with no token,
    zero advisory locks, zero `map:remap` rows, and **zero `400 Invalid body` lines in the
    `/api/cron/map` runtime log** where every prior cycle carried ~26. All 20 named
    poisoned documents are now `processed=true` with **31 `doc_map_state` rows** — exactly
    the 31 doc-track pairs predicted — and 21 claims. One prediction did NOT land and is
    carried forward: `alreadyMapped` stayed frozen at 139.
    **CLOSED 2026-08-24 — `UNICODE_RECOVERY_STATUS = PASS`.** The 24-hour recovery window
    2026-08-23T15:00:00Z → 2026-08-24T15:00:00Z ran 24 natural `:40` cycles, none invoked,
    and met every criterion: `batchErrors` **0 on all 24 — 0 of 767 batches** against the
    591-of-1,041 (56.8%) baseline; `ok=true` and `finished_at` set on all 24 with no
    `budgetStop*` key of any category; lease `acquired` 24/24 with fences **39 → 62,
    strictly +1**, lost 0 / released 1 / discards 0, residue `{"fence": 68}` with no token,
    and zero advisory locks; one distinct baseline dispatch identity; the same four
    extractor versions and no fifth; `processedMarked` 23,999 of 24,000 selected (baseline
    537/cycle, frozen); 7,164 claims; the 20 poisoned ids never re-selected; zero
    `map:remap` rows ever; no deployment, environment (86 rows / 48 names, unchanged) or
    cap change. **Two criteria needed honest handling.** (i) `llmRequests === batches` held
    on 22 of 24 cycles; the two exceptions are exactly the untouched truncation-split path,
    where `finish_reason === "length"` increments `truncationSplits` and recurses twice
    while `batches` does not move — the correct identity is
    `llmRequests === batches + 2 × truncationSplits`, which holds exactly on both cycles
    (35+4=39, 27+2=29) and window-wide (767+6=773); `batchErrors` stayed 0 on the split
    cycles too, so it is a response-length behaviour, not a request-validity one. (ii) The
    carried-forward `alreadyMapped` = 139 **RESOLVED**: it moved to **0 on the very next
    cycle** (15:40Z) and on all 23 after it — the 139 were already-mapped documents pinned
    in the selection window by the 463 stragglers; once those drained the next selection
    advanced past that region. **Corpus-wide confirmation, closing the report's "20 is a
    lower bound" risk:** replaying the OLD truncation over the whole eligible pool finds
    **0 of 7,292** still-unprocessed documents that would orphan a surrogate (2,536 of them
    carry complete astral pairs), and over the 414,659 processed epoch-eligible ru/ua/ir
    documents finds 25 — the 20 repaired on 2026-08-23, four of §6's five pre-existing
    accepted-before-2026-07-16 documents, and one (2311267) dispositioned as a dedup mirror
    with a `doc_dedup` row and no `doc_map_state`. (§6's fifth, 2263, is dated 2026-07-01,
    before `MAP_EPOCH`, hence outside the epoch-scoped scan; verified directly as
    `processed=true` with its one row.) **Spend:** $0.9127 in the window; daily $0.7002 /
    $0.7885 against `MAP_USD_CAP_DAILY=4`; all-time **$18.2790 of the $40
    `MAP_SPRINT_USD_CAP`** — under the $25 escalation threshold; 669 daily requests through the closeout read
    against the 1,500 default. Cheaper than the ~$1.2–1.3/day projection because the repair
    also stopped the stragglers being re-dispatched hourly. **Freshness recovered:**
    `map-health` sent three episode-deduped unhealthy notices (18:40Z, 00:40Z, 07:40Z, three
    stale theaters each) then a **recovery notice at 2026-08-24T13:40Z**; `map_health` now
    has `episodeKey: null`, the backlog fell **25,857 → 7,292**, and the worker is mapping
    documents dated 08-22/23/24. Report:
    `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md` §10–§14. Sibling sites still NOT
    fixed: **#97** (including the live paid Ask path). Carried out of the window: **#88**
    (unblocked from #86, re-scoped — see there), **#87** (now the largest remaining instance
    of the family), and new **#98**.
87. **[CLOSED 2026-08-28 — both halves deployed and observed (PRs #28+#29); flip
    synthetic+wiring-proven, first natural flip future-observable]**
    `digest:*` — and `validate` — SWALLOWED per-item failures into
    an in-run counter while `cron_runs.ok` stayed true. Days 2026-08-01, 08-03 (×2), 08-04,
    08-15 and 08-21 each recorded `counts.errors >= 1` with the same
    `400 Invalid body: failed to parse JSON value` signature as #86, yet the run is green
    and no alert fires. Either classify a non-zero digest `errors` count as unhealthy (the
    map worker's 2026-08-15 precedent) or surface it through `map-health`-style alerting.
    Same root-cause family as #86 — mechanically, the legacy digest provider truncates its
    doc line with the same UTF-16 slice at `src/lib/analysis/openai-provider.ts:153`
    (`.slice(0, 400)`), which is why the signature is identical. **Not limited to
    `digest:*`:** `validate` 2026-08-23T07:00:49Z recorded
    `{"date":"2026-08-22","errors":1,"validated":2}` with `ok=true` and `error IS NULL`
    (found by the 2026-08-23 closeout review), so the swallow-nested-errors pattern spans at
    least three jobs. Whatever fix is taken must sweep nested `counts.*` on EVERY job, not
    just `digest:finalize`. **And `map` is the same pattern in its most EXTREME form**
    (found by the 2026-08-23 #86 review): `stats.batchErrors` is a bare counter, `ok` stays
    true, no category is recorded, and the discriminating message goes only to
    `console.warn` — so 21 consecutive cycles recorded `batchErrors=25, ok=true,
    error IS NULL` and nothing alerted. The cheapest improvement that would make a recovery
    window self-evidencing is to record the first N distinct batch-error messages into
    `counts.batchErrorSamples`; until then, classifying a residual map 400 needs the Vercel
    runtime log. **STATUS 2026-08-24 (from the #86 recovery-window closeout): `map` is now
    CLEAN and the legacy digest path is the LARGEST REMAINING instance of this family.**
    `digest:intraday` 2026-08-23T19:30:13Z recorded `errors: 2` with `ok=true` and
    `counts.errorMessages` holding the identical
    `400 Invalid body: failed to parse JSON value` string twice; `validate`
    2026-08-24T07:00:57Z recorded `errors: 1` with `ok=true` and no message captured.
    Daily nested digest errors run 0–3/day across 2026-08-15 → 08-24 — the same band before
    and after the #86 repair, confirming this is untouched pre-existing debt and not a
    regression. The map job's 24 recovery-window cycles carried `batchErrors = 0`, so the
    extreme instance is gone; the mechanical fix for the digest instance is #97's
    `openai-provider.ts:153` site. **STATUS 2026-08-27 (QF-A/#88 closeout read): zero
    nested `errors`/`batchErrors` on every map and digest run since 2026-08-24T00:00:00Z**
    — encouraging, but it repairs nothing: the swallow-into-counter mechanism is
    unchanged, and the legacy path is still exercised daily by the 5 gulf legacy digests
    (il/sa/ae/qa/om; ru/ua/ir moved back to mapreduce with the #88 closure).
    **CLOSED 2026-08-28.** Both halves shipped in the reliability queue: (a) PR #28
    (`afbf06e`) extracted + repaired `digestDocLine` with `wellFormedSlice` — the
    request construction cannot emit malformed UTF-16 (baseline: 61 malformed doc
    lines/14d under the old code; the 04:00Z intraday exercised the new line on all 5
    gulf cells clean); (b) PR #29 (`ad6e078`) made nested failures flip the run to
    `ok=false` + `counts.degraded` (error NULL — the degraded signature), with map
    `batchErrorClasses` (content-safe fixed vocabulary), digest/ingest markings, and
    validate's benign/thrown split (`unvalidated` — the ISW-not-published false alarm
    is gone). Honest boundary: the flip is proven by synthetic tests AND a real-cycle
    transport-failure itest; a NATURAL degraded event has not yet occurred since deploy
    — when it does, audit-cron's FAIL list renders the category. entity-audit's
    502-return swallow (unscheduled route) remains documented debt outside this task.
    Record: `docs/reviews/RELIABILITY-RELEASES-2026-08-28.md`.
88. **[CLOSED 2026-08-27 — PASS: natural mapreduce resumption observed, acceptance met]**
    No digest HAD used the mapreduce engine since 2026-08-17. All
    11 digests/day fell back to legacy because their ROLLING windows found no
    current-version `doc_claims`: the healthy post-#86 worker still trailed the
    publication front by hours while it finishes the drain, so nothing lands inside the
    last-24-hours window at digest time. (Through 2026-08-24 the cause was the throttled
    worker pinned to the ru/ua backlog with `map_health` reading
    `stale_ir,stale_ru,stale_ua`; freshness has since recovered — see the RE-SCOPE
    below.) Consequence: the A/B-validated mapreduce
    quality gains (and ruling 18's whole configuration) are not reaching production output,
    while `DIGEST_ENGINE=mapreduce` and the standing documentation both said otherwise
    (corrected in place 2026-08-21). **RE-SCOPED 2026-08-24 — no longer blocked on #86,
    which is CLOSED.** The #86 recovery restored map throughput and freshness (backlog
    25,857 → 7,292; `map_health` recovery notice 2026-08-24T13:40Z, `episodeKey` now null;
    the worker is mapping documents dated 08-22/23/24), and mapreduce still did NOT resume:
    the `digest:intraday` run at 2026-08-24T19:30Z produced 10 legacy digests. **Mechanism,
    measured 2026-08-24:** `digest:intraday` uses a ROLLING 24-hour window, not the digest
    day (`src/app/api/cron/digest/route.ts:50`; `inRollingWindow` admits a claim only if its
    document's `published_at` is inside the last 24 h), and `engine.ts` falls back whenever
    `generateMapReduceDigest` returns null for an empty window. At the 19:30:13Z run the
    newest document holding ANY claims was published **2026-08-23T18:55:40Z — about 35
    minutes short** of that run's window floor (2026-08-23T19:30:13Z), so the window was
    empty for every theater and track and all ten fell back. The map is closing on the
    publication front but still trails it: at 2026-08-24T21:05Z the newest claimed document
    is published 2026-08-24T04:41:29Z while the pending queue spans 2026-08-24T04:43:20Z →
    21:04:40Z. What remains is purely the backlog-versus-recency ordering decision:
    prioritise recent documents ahead of strict oldest-first order, or move the digest
    schedule after the map cycle covering its window — and the margin is now small enough
    that simply closing the remaining lag would let mapreduce resume unaided. That is the
    whole of #88; nothing else gates it. Acceptance is unchanged — a naturally eligible digest using
    mapreduce, observed not forced, with no `FORCE_REGEN`.
    **CLOSED 2026-08-27 — the acceptance criterion was met exactly as the re-scope
    predicted: the lag closed and mapreduce resumed unaided.** `openai_reduce` has zero
    `provider_usage` rows for 2026-08-17→08-24, then rows on 08-25/26/27 ($0.1698 /
    $0.1784 / $0.1377 — inside the expected $0.10–0.30/day band); the six 08-24-dated
    mapreduce digests were created 2026-08-25T02:02:04Z→02:06:59Z by the scheduled 02:00
    finalize (zero reduce spend on 08-24 itself rules out an earlier reduce that day), and
    every digest date since (08-25/26/27) repeats the 6-mapreduce matrix (ru mil +
    elite_politics, ua mil, ir mil + elite_politics + nuclear) — **24 naturally produced
    mapreduce digests over four consecutive digest dates**. Not forced: only scheduled
    cron runs at nominal cadence appear in `cron_runs` for the window, and no `FORCE_REGEN`
    use was observed — the thin-regen guard actively REFUSED two overwrites in-window
    (om 08-26T19:30Z, om 08-27T02:01Z), which `FORCE_REGEN=1` would have overridden. No
    ordering or schedule change was made; the backlog-versus-recency decision dissolved
    rather than being decided. Residual, by design and deliberately NOT re-opened as a
    task: the automatic legacy fallback remains, so a future sustained map lag would
    silently regress the engine mix at digest level — detection coverage is `map_health`
    freshness staleness (`MAP_STALE_DAYS=2`), not a digest-engine alert. Consequence for
    #97: the reduce-path truncation sites are LIVE again (see there). Evidence:
    `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-CLOSEOUT-2026-08-27.md` §5.
89. **[Tier 3 — correctness, latent] The map dedup gate's reference-side exact-md5 index is
    dead.** `map-worker.ts` casts the reference rows `as DedupDoc[]` while the SQL aliases
    the column `content_md5`, so `ref.contentMd5` is `undefined` and every reference doc is
    indexed under the key `undefined`. Exact-match mirror detection against the persisted
    canonical window therefore never fires; only the minhash path and candidate-vs-candidate
    exact matching work (which is why `mirrorsExact` is non-zero and the bug is invisible).
    PRE-EXISTING and byte-identical on `origin/main` — the 2026-08-21 map-lease release
    neither introduced nor changed it. Fix is one line, but it will change mirror rates, so
    it wants its own before/after measurement rather than a ride-along.
90. **[Tier 3 — latent, fail-silent] A `map_lease` row carrying a token but a broken
    `expiresAt` wedges the map stage permanently while reporting `ok=true`.** The acquire
    CAS takes over only when `state->>'token' IS NULL OR (state->>'expiresAt')::timestamptz
    <= now()`. If `expiresAt` is absent or JSON-null the cast yields SQL NULL, the predicate
    evaluates to NULL rather than TRUE, and `DO UPDATE` never fires — the lease is
    unclaimable forever. If `expiresAt` is a non-parseable string the cast RAISES,
    `acquireMapLease` catches it and returns `outcome: "error"`. Both terminal states
    surface as `counts.skipped` with `cron_runs.ok = true` — indistinguishable from the
    2026-07-29 outage shape (418 green runs while `doc_claims` starved). **Not currently
    reachable:** no code path in this repository writes either shape (`tryAcquire` writes
    all four keys, `renew` uses `jsonb_set`, `release` writes `{fence}` with the token
    absent, which is the intended FREE state); it needs an external writer or a partial
    restore. Detection exists indirectly — `runScheduledMapHealth` still runs on skipped
    cycles and would raise `stale_*`. Fix, when taken: add `OR (state->>'expiresAt') IS
    NULL` to the conflict `WHERE` and use a non-raising cast for the garbage case, with an
    integration test that seeds each malformed shape. Deliberately NOT changed in the
    2026-08-21 release: altering the core CAS predicate immediately before a 24-hour lease
    soak would trade a proven-unreachable failure mode for unproven SQL. Found by the
    independent lease review (MINOR-1).
91. **[Tier 3 — consistency] `?theater=` is still unvalidated at the map cron route.**
    `src/app/api/cron/map/route.ts` lowercases `?theater=` and passes it straight to
    `rd.country_iso2 = ANY($1)`. An unknown value selects nothing, and "selects nothing" is
    how both drivers conclude a day is drained — so a hand-written authenticated request
    with a typo'd theater reads as a drained corpus. Both DRIVERS now refuse an unknown
    theater (`normalizeTheaterFlag`, allowlist derived from `TRACKS`), and `?date=`,
    `?after=`, `?track=` and — as of 2026-08-21 — `?cap=` are all strictly validated at the
    route, so this is the last unvalidated route param. Fix: allowlist it the same way, or
    accept it as deliberate (an operator may legitimately want to map a theater outside
    `MAP_THEATERS`). $0 exposure — under-selection only, never over-spend. Found by the
    independent lease review (NOTE-2) and sharpened by the spend re-review (MINOR-E), which
    caught the first draft of this entry describing the `?cap=` hole that the same commit
    had already closed.

### New (from the QF-B lease-soak closeout — 2026-08-23,
docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md §9)

92. **[Tier 3 — documentation maintenance] AGENTS.md is ~1,040 lines against its ~300-line
    guideline, and the newest decision-log entries sit BELOW `## Operating protocol`.** The
    maintenance rule's sanctioned remedy is to move the log's OLDEST entries **verbatim** to
    `docs/DECISIONS.md` (moving preserves history; editing or summarising it is forbidden).
    That is a bulk edit and must not ride along with a release closeout, so it is filed here
    instead of performed. Separately: the 2026-08-21, 2026-08-22 and 2026-08-23 entries were
    appended at the END OF FILE rather than at the end of the `## Decision log` section,
    which leaves Conventions / Credentials / Next steps / Operating protocol wedged
    mid-log. New entries deliberately keep following the file-end convention so the log
    stays chronological until both are repaired in one deliberate pass.
93. **[Tier 2 — observability] No Vercel log drain, so no runtime-log coverage of any soak
    window.** `vercel logs` caps at 100 records and retention is short: the QF-B formal
    window 2026-08-22T02:00Z→2026-08-23T02:00Z had ZERO runtime-log coverage by the time it
    was closed, and the verdict had to rest entirely on `cron_runs` plus four independent
    durable stores plus out-of-band alert email. Configure a drain (or extend retention)
    before the next formal observation window so a self-reported counts payload is not the
    only in-window narrative.
94. **[Tier 3 — hygiene] The expired `MAP_USD_CAP_DAILY_OVERRIDE_USD` / `_UNTIL` pair is
    still installed in Production.** It expired 2026-08-17T13:00:00Z and the guard reverts
    BY CODE at that instant (boundary test-pinned), so this is housekeeping, not
    correctness. Removing it is an environment change and therefore needs its own
    authorization; until then the base `MAP_USD_CAP_DAILY=4` governs.
95. **[Tier 3 — assurance] The map lease's contention paths are test-proven, not
    production-proven.** Across all 35 lease-era cycles the outcome was `acquired` every
    time with `lost=0`, `leaseLostDiscards=0` and zero `skipped`, so `expired_takeover`,
    `busy`, the loss latch and the discard path have never executed in production. The 2026-08-22
    soak PASS therefore covers the steady single-holder path only. A deliberate exercise —
    e.g. an authorized bounded backfill overlapping an hourly cycle, ideally on a
    non-production branch — would close the gap. Coverage today: `map-lease.itest.ts` plus
    the always-run unit pins on the four lease-gated write paths.
96. **[Tier 3 — observability, latent] `leaseLostDiscards` can undercount a lease loss.** A
    `MapLeaseLostError` thrown at a truncation-split recursion level inside `extractBatch`
    unwinds through `runWorker`'s catch without incrementing `stats.leaseLostDiscards`, so
    the counter is a lower bound on discarded work, not an exact one. It is NOT the
    authoritative lease-loss signal: `counts.lease.lost` is, because `stillOwner()` sets it
    on any failed renew including a DB exception, and the renewal identity
    (`renewals = batches + llmCalls + 2`) independently proves every renew attempt
    succeeded. Fix, when taken: increment the discard counter on the split path too, or
    replace it with a per-batch outcome tally. No production impact observed — `lost` has
    been 0 on every lease-era cycle.

### New (from the #86 map Unicode batch repair — 2026-08-23,
docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md)

97. **[Tier 2 — correctness/spend] The same UTF-16 slice pattern that caused #86 is still
    present at other provider-bound truncation sites.** #86's repair covers the MAP path
    only (`mapDocLine`). The modules swept for the same `String.prototype.slice` over
    UTF-16 code units, with no surrogate repair, were the analysis, validation and Ask
    request builders. (An earlier draft claimed the sweep covered "every module" and then
    listed only four sites; both independent reviewers showed that claim was false and that
    it had missed the live paid Ask path — the HIGHEST-exposure instance, because there the
    sliced string is user-controlled. Corrected 2026-08-23; read the list below as the
    sites actually found, not as exhaustive.) Sites found:
    - `src/lib/analysis/openai-provider.ts:153` — the LEGACY digest doc line,
      `.slice(0, 400)`. **This is the mechanical root of #87**: the swallowed
      `400 Invalid body: failed to parse JSON value` on `digest:finalize` /
      `digest:intraday` is the identical defect on the identical construction. LIVE —
      exercised daily by the 5 gulf legacy digests (il/sa/ae/qa/om; every digest used the
      legacy engine 2026-08-17→08-23, until the #88 closure restored the mapreduce mix).
    - `src/lib/analysis/synthesize.ts:138-139` — the REDUCE group line, `.slice(0, 250)`,
      and the event hint, `.slice(0, 120)`. **LIVE AGAIN since 2026-08-25 (corrected
      2026-08-27):** these were dormant only while mapreduce produced nothing (#88), and
      the "fix BEFORE #88 recovers" intent was overtaken by the natural resumption — the
      reduce path now dispatches paid requests daily. Zero nested errors were observed
      08-25→08-27, which proves nothing about the defect; it is unrepaired. This is the
      top-priority site set and the reason #97 is the next code PR.
    - `src/lib/validation/llm-match.ts:83,85` — takeaway `.slice(0, 400)` and claim
      `.slice(0, 300)` on the validation matcher. A `400` here degrades to the keyword
      matcher by ruling 9, so it would fail quietly rather than loudly.
    - `src/lib/analysis/anthropic-provider.ts:70` — same shape; inert, since no Anthropic
      key exists in any environment (#83).
    - **`src/app/ask/actions.ts:28` — the highest-exposure instance.**
      `String(formData.get("question")).trim().slice(0, 400)` truncates USER-SUPPLIED text
      at 400 UTF-16 code units and flows verbatim into the paid answer request
      (`src/lib/ask/answer.ts:210,596,699`). A user pasting a question longer than 400 code
      units with an emoji straddling the boundary reproduces #86 on `/ask` — a live money
      path an end user can trigger directly. (The code is
      `String(formData.get("question") ?? "").trim().slice(0, 400)`.)
    - `src/app/api/ask/route.ts:19` — `(body.question ?? "").trim().slice(0, 400)`, the
      same 400-code-unit boundary on the JSON API route, gated only by
      `requireAcceptedUser()` with NO feature flag, feeding the same `askWithLimits` paid
      pipeline. Found in round 2 of the #86 review; an earlier draft wrongly called
      `actions.ts` the only user-triggerable site.
    - `src/app/api/ask/runs/route.ts:45` (progressive-flag-gated) and
      `src/app/ask/ask-form.tsx:432` (client-side) carry the same 400 boundary.
    - `src/lib/embeddings/client.ts:58` — `truncateInput` clips each text to
      `EMBED_MAX_INPUT_CHARS` before a paid `openai_embed` call. Lowest exposure of the
      set (claims are already <=500 chars), but the same pattern.
    - `src/lib/ask/rerank.ts:41` — `serializeCandidate` clips the claim snippet to
      `RERANK_SNIPPET_CHARS` and feeds `rerankUserMessage` -> the paid rerank dispatch
      (`rerank.ts:221`).
    - `src/lib/ask/sessions.ts:105,111` — `compactHistory` clips the prior question to 200
      code units and the prior answer to its char budget, both appended to the Ask user
      message through `answer.ts historyContextBlock`.
    Response/DB-bound slices (`map-worker.ts:182,184,185,202` — `text_en` 250, `quote_orig`
    300, entity name 200, `event_hint` 160) are a DIFFERENT and much milder failure mode:
    the pg wire protocol encodes a lone surrogate as U+FFFD rather than erroring, so the
    worst case is one corrupted character that fails `verifyQuote`. Measured 2026-08-23:
    **zero** U+FFFD in `quote_orig` or `text_en` across all 138,485 `doc_claims` rows, so
    this has never actually fired. Fix, when taken: route each provider-bound site through
    the shared `wellFormedSlice` helper #86 added, and give each its own before/after
    measurement — the digest one IS #87's fix and must not be bundled with the reduce one.
    Deliberately NOT fixed in the #86 release, which was required to stay isolated.
    **STATUS 2026-08-28 — re-scoped; the two LIVE-PAID analysis sites are FIXED AND
    DEPLOYED:** the reduce site (PR #27, `ed9bc35` — shared `wellFormedSlice` moved to
    `src/lib/text/well-formed-slice.ts`, observed through 30 clean live reduce requests)
    and the legacy digest site (PR #28, `afbf06e` — `digestDocLine`, = #87's mechanical
    fix, observed at the 04:00Z intraday).
    **STATUS 2026-08-28 (second update) — the ASK FAMILY is REPAIRED (branch
    `claude/97-ask-wellformed-20260828`; merged 2026-08-29 as PR #35), the
    highest-exposure user-controlled site set.** One shared pure normalization
    (`normalizeAskQuestion` in `src/lib/ask/intent.ts` = trim, `wellFormedSlice` at
    the historical 400-code-unit cap, then a final trim) is now called by ALL SIX
    question boundaries: `ask/actions.ts` (server action), `api/ask/route.ts` (JSON),
    `api/ask/runs/route.ts` (progressive), `ask-form.tsx` (client progressive
    submit), `page.tsx` (?q= prefill), and the home box (which already used the
    shared function). Two deliberate alignment changes, both review-driven: the
    prefill now trims (it previously slice-only'd; required for the one-click intent
    exact-match) and the final trim makes the function IDEMPOTENT (truncation can
    expose trailing whitespace and a dropped orphan can shield it — without the
    fixed point, the page's re-normalization of the home box's stored question
    broke the exact-match for those shapes and silently swallowed the handoff);
    the page also gained a `typeof q === "string"` guard (a duplicated `?q=a&q=b`
    arrives as `string[]`, which the new `.trim()` would have thrown on — old code
    was accidentally array-tolerant). The question's persistence/identity clips (`runs.ts` createRun,
    `cache.ts` cacheStore, `limits.ts` ask_usage insert + idempotency replay
    comparison) route through `wellFormedSlice` at the same cap (limit-only, no trim —
    byte-identical for every already-normalized caller), and the remaining
    provider-bound Ask truncations are repaired at their existing budgets:
    `sessions.ts compactHistory` (question 200 / answer budget) and `rerank.ts
    serializeCandidate` (`RERANK_SNIPPET_CHARS`). Baseline reproduction: a 400-unit
    question with an astral pair straddling the boundary left old code emitting a lone
    `0xD83D` (strict-JSON-rejecting; `encodeURIComponent` throws in the home handoff);
    ordinary-input old-vs-new byte identity 9/9 scripts, boundary sweep 41 offsets
    (old malforms at exactly the straddle offset, new never). Aggregate-only
    production measurement: 42 ask_usage / 1 ask_runs rows, max question length 96,
    zero U+FFFD — the defect never fired in production persistence. 30 new tests
    (27 well-formedness/consistency + 3 gate-before-money order pins); seven
    reverse mutations each killed (full normalize revert 15 tests / 8 files;
    final-trim-only 1; array-guard-only 1; rerank-snippet 1; session-history 2;
    run-persist 1; usage-log 1). Five fresh-context reviews (Unicode/boundary,
    money-path/idempotency/cache, authorization/free-GET, test/mutation
    sufficiency, scope/docs) found NO money-path or authorization defect; both
    confirmed findings (array-`?q=` throw, non-idempotent normalize) are fixed
    above and mutation-pinned. Deliberately NOT included, documented safe:
    `sessions.ts` title clips (DB/display-bound — the milder U+FFFD class this
    item already adjudicates out of the provider-bound family), array slices
    (entities/claims/ids), ASCII/protocol slices (hex key, dates, SSE framing),
    and the offline eval harness (`eval-run.ts`/`eval-set.ts`, fixture-fed, rides
    the eval follow-up; its provider-bound harvest text is untruncated DB text).
    A client-side sanitize-to-short refusal is untestable because it is
    UNREACHABLE: DOM FormData extraction USVString-converts an orphan to U+FFFD
    before any handler runs — raw JSON on the API routes is the only genuine
    orphan carrier, and both are pinned. **Review-logged residuals (flag-off
    sessions scaffolding; close before ASK_SESSIONS ships):** (a)
    `sessions.ts` `runReuseFollowupTurn` passes `opts.question` to askWithLimits
    with no boundary normalization — a future session route must call
    `normalizeAskQuestion` at entry or it reopens the provider-poisoning path;
    (b) §7.7 content deletion joins `ask_answer_cache.question` to
    `ask_runs.question` by exact text — an old-era U+FFFD-mutated run row paired
    with a new-era well-formed cache row for the same raw question would leave
    the cache row to its ≤7-day TTL instead of the immediate delete; (c) a
    pre-fix ask_runs row whose stored question carries a wire-mutated U+FFFD —
    or truncation-era edge whitespace the idempotent normalizer now trims —
    false-MISMATCHES an idempotent replay of the same raw question under the new
    comparison — fails safe (honest refusal, $0), tiny population, self-clears.
    Full disclosure of the normalization divergence set vs the old code: besides
    over-limit cuts landing on whitespace, an IN-limit edge orphan shielding
    whitespace now trims (e.g. an "ab " + lone-surrogate input old-dispatched
    "ab " and now refuses at $0) — the refusal set only ever grows, never
    un-refuses.
    Pre-existing, out of family: `/search` shares the array-`?q=` hazard shape
    (`search/page.tsx:113`, free deterministic path, no provider).
    **STATUS 2026-08-29 — the ASK FAMILY above is MERGED AND DEPLOYED (PR #35 →
    `main` merge `6ba72b5` → production `dpl_FT3Hdpt2ece4kxQHudxT2FST162p`,
    2026-08-29T01:29:35Z).** The 19:30Z predeploy gate passed, the smoke's five
    free-GET shapes (incl. astral-boundary and array `?q=`) produced zero Ask
    persistence/spend, and the 01:30→07:12Z observation window CLOSED PASS (50
    scheduled runs clean; finalize/intraday/validate on the new release). NO
    natural paid Ask occurred in the window, so the first live money-path
    traversal of `normalizeAskQuestion` remains FUTURE-OBSERVABLE (construction
    test-pinned; free/GET side live-probed). Record:
    `docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md`. REMAINING
    under this umbrella: `embeddings/client.ts` (`truncateInput`),
    `validation/llm-match.ts:86,88` (the takeaway/claim clips; degrades to
    keyword on failure, ruling 9 — quiet), `anthropic-provider.ts:70` (inert,
    no key — #83; candidate for a
    documented-safe disposition), and the review-logged flag-off sessions
    residuals (a)–(c) above. Umbrella stays OPEN until each is repaired or
    documented safe with evidence.

### New (from the #86 recovery-window closeout — 2026-08-24,
docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md §14)

98. **[CLOSED 2026-08-28 — sweep deployed (PR #30) with NATURAL real-data proof]**
    `ingest:telegram` WAS leaving `finished_at IS NULL`
    rows, and nothing alerted on them. Two rows started inside the #86 recovery window —
    2026-08-23T18:01:31Z and 19:01:31Z — each with `ok` NULL, `error` NULL and an EMPTY
    `counts` object: ruling 10's timeout signature exactly (rows are written at START, so
    `finished_at IS NULL` means the run never returned). The class is pre-existing but the
    count is growing: `ingest:telegram` ×1 on 2026-07-28, ×1 on 2026-08-15, **×2 on
    2026-08-23**; `ingest:x` ×3 on 2026-08-13. The QF-B lease-soak closeout explicitly told
    the next session to exclude the 2026-07-28 … 08-15 rows as pre-dating that release, so
    these two are genuinely new and were found only because the #86 closeout swept EVERY
    job rather than just `map` (the #87 discipline). Unrelated to #86 and to the map stage —
    the map job's 24 window cycles all finished cleanly. Two things are worth separating:
    (a) why the Telegram ingest run hangs at all — MTProto/web fetch without an effective
    timeout is the obvious suspect, and #69's GramJS `CastError` noise lives on the same
    path; and (b) that a hung run is invisible, since `ok` never becomes false and no
    `map-health`-style check covers `ingest:*`. A cheap first step is a startup sweep that
    marks any `cron_runs` row older than its job's plausible ceiling as failed with a
    timeout category, which would also give #87's nested-error sweep a natural home.
    **CLOSED 2026-08-28 (PR #30, `b62da02`):** exactly that sweep, at every job start —
    ceiling = route `maxDuration` + 120s (false-kill impossible in production; DB-clock
    comparisons; ruling 10's NULL-finish signal preserved, never fabricated), idempotent
    by construction, ceilings pinned to route sources by an enumerating lockstep test,
    real-Postgres itest for every state. **Natural proof on first post-deploy job
    starts: 9 genuinely-dead historical rows swept — including the REAL
    2026-08-27T18:01:42Z telegram hang — with correct per-family ceilings and ZERO
    false sweeps of recent/alive rows.** Scope decision, recorded: no new email/alert
    channel — visibility is cron_runs + audit-cron (degraded categories rendered) + the
    soak-check's `timed_out` taxonomy (its `errored` gate deliberately excludes swept
    rows). The underlying MTProto/web hang cause (a) remains #69-adjacent behavior to
    watch, but hung rows are no longer invisible. Prior evidence retained below.
    **RECURRENCE 2026-08-27 (QF-A/#88 closeout read):** the `ingest:telegram` run started
    2026-08-27T18:01:42Z showed the identical signature — `finished_at` NULL, `ok` NULL,
    `error` NULL, empty `counts` at ~20 minutes of age against a ~124–155s 24h duration
    baseline. Background rate over the prior 7 days: 4 such rows across
    `ingest:telegram`/`ingest:x` out of ~336 hourly runs (~1.2%). Later runs self-heal
    through the adapter's `last_message_id` watermark (the same hour's fast/x/mtproto runs
    were green and the next telegram hour completed normally in prior instances), so this
    is added as evidence of frequency, not of data loss. Remains OPEN.

### New (from the 2026-08-24 QF-A landing,
docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-RELEASE-2026-08-24.md)

99. **[Tier 3 — observability depth] Quality-funnel follow-ups deliberately not taken at
    the QF-A landing.** (a) FUNNEL-A12-4: citation share/conversion rates exist only for
    the adapter dimension; platform has no rates and language is absent citation-side —
    corpus-roadmap scale, not a landing repair (the adapter dimension already answers the
    audit's IR X-dependency question). (b) FUNNEL-A12-5 (audit register, recorded-no-action):
    `aggregateCorpus` warns when a dedup MIRROR holds `doc_map_state` rows but silently
    skips mirror `doc_claims` rows — both are equally anomalous; symmetric warning wanted
    if the funnel's warn-on-broken-reconciliation contract is to be complete. Neither
    affects any published digest; both are read-only report depth. The A follow-ups that
    WERE taken (FUNNEL-A12-1/2/3, A-REC-1, SCI-N4, roster provenance) are closed by the
    landing commits recorded in the release record.

### New (from the 2026-08-24 QF-C landing,
docs/reviews/QF-C-ANALYSIS-EVAL-RELEASE-2026-08-24.md)

100. **[Tier 3 — eval-plane provenance] The `scripts/ask-eval-harvest.ts` isolation
    exemption is untracked (QF audit G6/A10-1).** `src/lib/evals/isolation.test.ts`
    exempts that filename from the bare-`new OpenAI()` scan by hard-coded name, citing no
    authorizing document; the file itself lives on the parked
    `claude/local-model-ask-eval-20260817` branch (not on `main`), so today the exemption
    is a dormant allowlist entry. The audit classed it an owned prerequisite: when the Ask
    eval CLI's reconciliation with the repository-owned control plane is adjudicated
    (adjudication plan §5.5 — explicitly outside the 2026-08-24 release train), either the
    exemption gains an authorizing record or it is removed. Do not modify Ask behavior in
    QF scope.

### New (from the 2026-08-27 QF-A/#88 closeout,
docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-CLOSEOUT-2026-08-27.md)

101. **[Tier 1 — operator/spend] The X all-time cap needs an operator decision before
    fail-closed exhaustion.** Refreshed 2026-08-27 (late): `x_api` cumulative spend is
    **$57.84 of the $75 `X_SPRINT_USD_CAP`** (77.1%), 7-day burn **~$1.15/day** against
    the $2.50 `X_DAILY_USD_CAP` — headroom ~$17 lasts roughly **15 days (est.
    exhaustion ~2026-09-11) — a point-in-time projection, not a guarantee** (X volume
    varies with events). Options + recommendation:
    `docs/reviews/OPERATOR-DECISION-PACKET-2026-08-28.md` §1. When the
    cap is reached, `SpendGuard.tryReserve()` fails closed and X ingestion STOPS — by
    design (ruling 4), but silently from a coverage standpoint apart from the X-health
    alerting. Options are the operator's: raise `X_SPRINT_USD_CAP` (an env change in all
    Vercel envs, needing its own authorization), accept the stop, or rebalance the X
    roster/poll rate first. No cap was changed by the closeout that filed this task.
    Cross-reference: the ruling-4 ordering (set the env BEFORE deploying anything that
    reads it) does not apply here — the guard already reads this env; a plain env edit +
    redeploy suffices when authorized.
