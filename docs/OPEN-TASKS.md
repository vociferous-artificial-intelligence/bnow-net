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
19. **IR non-X military corpus depth.** On ir Jul 1–5 only 2–9 non-x_api docs/day pass
    the military lexicon (vs 35–72 x_api), so batches stay x-heavy after the quota and
    thin days (Jul 4–5) still cite only X — every non-X track doc was already in the
    batch; selection can't fix scarcity. Fix is more ir RSS/Telegram feeds (or lexicon
    variants for wire-service phrasing), not quota tuning.
17. **OpenSanctions match hygiene.** Require ≥1 linked claim before spending a /match
    call (orphan entities waste quota and invite name-collisions); render match score +
    caption beside sanction/PEP badges. From the 1/5 spot-check flag ("Andrei Fedorov").
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
    exists, any prompt iteration silently applies only to new docs.
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
14. **Source-reliability calibration as a scored dimension (§5).** Original's validation
    design scores whether our reliability weighting matches ISW's hedging behavior; we score
    coverage/divergence/timeliness/unsupported only. Design a calibration metric (e.g.
    correlation between our source weights and ISW hedging distribution on shared sources).

## New (from the 2026-07-10/11 state recon — docs/reviews/STATE-2026-07-10.md)

38. **[Tier 1 → alert half only] X historical catch-up ✅ EXECUTED 2026-07-14; green-but-empty
    monitor still open.** The July 9–13 recovery ran to cursor exhaustion on the deployed
    lease-aware build (deploy `dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ`, main `a38a882`): checkpoint
    `x_gap_backfill:2026-07-09_2026-07-14` complete=true — 19/19 batches, 1,335 pages, 26,090
    returned, **16,007 inserted**, $3.9164, provider balance delta reconciled to the ledger to
    $0.00003, live watermark untouched. Gap days 07-10/11/12: 31/18/27 → 4,559/4,134/5,587 docs.
    Downstream rescore mapped ($0.4963), regenerated 28/30 digests (2 thin-regen refusals kept
    priors), revalidated 15/15 with 0 pending. Two consecutive healthy scheduled polls proven
    (cron 1141 + 1149, all failure counters 0). Full account: AGENTS decision log 2026-07-14 +
    `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md` §Execution results. **Still open — the
    ALERT:** every `ingest:x` run now writes `cron_runs.counts.x_api` (`incomplete`,
    `pageTruncations`, `budgetStops`, `lockSkips`, …) but nothing yet ALERTS on fetched=0 repeats
    or truncation/incomplete — build the alert so the next freeze cannot masquerade as health.
    See also #66 (the park-vs-ceiling stall this run discovered) and the operator-approved coding
    handoff `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` Workstream C.
    **ALERT IMPLEMENTED 2026-07-15 (branch `codex/beta-invite-signals-x-reliability`, NOT yet
    deployed):** `src/lib/adapters/x-health.ts` — a pure episode-deduped evaluator + a runner that
    emails `FEEDBACK_EMAIL` (safe fields only: no key/tweet/cursor value) on `pageTruncations`/
    `budgetStops`/`requestFailures`/unexpected `incomplete`, on prolonged/parked staleness, on
    repeated `fetched=0` polls (conservative consecutive threshold), and on a stuck catch-up, with
    one alert per episode (cooldown) + one recovery notice; the numeric result is recorded in
    `cron_runs.counts.x_api` even when the recipient is unset or Postmark fails. 32 fixture tests,
    zero network. **Do NOT close until a real scheduled run proves the alert + recovery in prod.**
39. **[Tier 1] No git→Vercel deploy integration.** `git push` does not deploy — after the 07-09
    auth fix, prod served the stale build ~20 min (`AUTH-EMAIL-2026-07-09.md`). Wire the Vercel Git
    integration, or codify "push then `npx vercel@latest deploy --prod`" in a release checklist so a
    pushed fix is not assumed live.
40. **[Tier 1 — operator decision made; copy not yet shipped] Magic-link login is not usable
    after the link's first open.** The single-use token is consumed
    by the first open (phone prefetch/scanner), so reopening on a second device →
    `/api/auth/error?error=Verification` (`AUTH-EMAIL-2026-07-09.md`). The 07-09 Postmark tracking
    fix (`9b5b368`) addressed a real but *secondary* defect, not this. **Operator ruling
    2026-07-15:** retain the single-use token and explain it in the email and sent screen: open it
    in the desired browser; if the email app uses another default browser, copy the unvisited URL
    and paste it into the preferred browser before opening it elsewhere. Implementation/tests:
    `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` Workstream A.
    **IMPLEMENTED 2026-07-15 (branch `codex/beta-invite-signals-x-reliability`, NOT yet deployed):**
    the magic-link email (`src/lib/email/magic-link.ts`) and the `/signin?sent=1` screen now state
    the link is single-use + 24h and give the copy-before-opening preferred-browser instruction; the
    callback URL, 24h expiry, legal-acceptance redirect, and `trackLinks:"None"`/`trackOpens:false`
    are unchanged (token stays single-use, never exposed to analytics/logs). Tests pin the email +
    sent-page copy and that invite-ineligible/eligible requests give the same response. **Close only
    after the copy is live in prod.**
41. **[Tier 2] OpenSanctions monthly accounting + resumable rescore — CODE MERGED + DEPLOYED
    2026-07-15 (`f9aaa9e`, `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`); paid rescore still gated on
    #61 + operator auth.** Both defects are fixed in production (calendar-month `totalPeriod` in
    SpendGuard so `OPENSANCTIONS_CALL_CAP` resets at the UTC month boundary; fixed-cutoff `refresh=1`
    rescore requiring a valid ISO `before`, advancing batch-by-batch instead of re-selecting the same
    prefix; future/timezone-less cutoffs fail before provider work). Tests: 1495/131 unit + 27/7
    real-Postgres integration, typecheck/lint/build clean. Live zero-paid proof: `/health` 200 on
    the deployment, authenticated invalid-cutoff requests returned the new 400, and the July ledger
    remained 660 requests / $72.6000; no migration, cleanup, or paid call. See the 2026-07-15 decision-log entry
    and `docs/reviews/OPENSANCTIONS-MONTHLY-RESCORE-NOTE.md` + `OPENSANCTIONS-RESCORE-RUNBOOK.md`.
    **Not done (do NOT close this item until all complete):** apply the operator-approved cleanup
    #61 AFTER the canonical-persist fix is live; recount the population +
    current-month quota; obtain separate spend authorization; run the serial rescore to zero
    candidates and record before/after totals. Relates to #17 (match hygiene before spending).
42. **[Tier 2] X single-platform citation dependency (~27–29%).** ~1 in 3.4 cited docs is from X
    (twitterapi.io). Concentration risk + validation contamination (§8.6 risks 1–2) persist even
    though the adapter resumed on 2026-07-13. Diversify corpus (MTProto, more RSS/Telegram)
    — the same lever that closes the coverage gap (#11/#19).
43. **[maintenance] AGENTS.md is over its own ~300-line budget (323).** Sprint-3/cutover log entries
    accreted past the "under ~300 lines" rule. Do an archive pass — move the oldest current-cycle
    decision-log entries **verbatim** to `docs/DECISIONS.md` (append-only; moving preserves history).
44. **[maintenance] `X_DAILY_USD_CAP` prod value is above the 1.5 code default.** 07-07 billed $1.877
    in one day without the daily guard stopping it, so prod is raised above the default. Reconcile the
    code default/comment (`x-api.ts:166`) with the actual prod cap so the ledger is not misleading.
45. **[Tier 2] "unsupported-claim rate" KPI is a thin-sourced proxy mislabeled as literal.**
    `score.ts:101-103` measures `docCount<2 AND hedging∈{claimed,unverified}` — but the schema
    guarantees ≥1 source (ruling 2), so *nothing is truly unsupported*. The 45–56% figure overstates
    hallucination risk against §8.7's plain-English "<2%". Rename the metric (e.g. "thin-sourced rate")
    and/or add a true-corroboration (≥2 independent sources) metric. Relates to #14 (calibration dimension).
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
52. **`ADMIN_EMAILS` is set in Vercel Production only.** Preview and Development are absent
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

54. **Digest deep links assume `claim_date == digest_date`.** Both /ask citations and the
    new /search results build `/digests/{iso2}/{claim_date}#c{id}` from the claim's own
    date. True for all 846 digest claims today (verified 2026-07-12, zero divergence), but
    if intraday delta framing ever persists a claim dated D-1 into a D digest, the link
    lands on the wrong day's page (renders, but misses the anchor). Fix = select
    `dg.digest_date` in the two link queries (ask actions.ts resolver + lexical search row).
55. **/search is not in the nav.** Reachable only from the signed-in home quick-links rail
    (analyst-home readback, decision 3 — nav carries frozen-URL + all-locale-label
    invariants). Add a `nav.item.search` Product-group entry once the surface proves itself.

56. **Platform-level registry sources must be segmented (R8, 2026-07-12).** `facebook.com`,
    `t.me` root, `x.com` root appear in the ISW-derived registry as single "sources" —
    a platform is not a source. Segment to page/channel/account level in the ingestion
    registry (the citation parser already sees the full URLs). Also a registry-credibility
    blocker for ever un-hiding the registry (it went admin-only 2026-07-12, ruling R5) —
    a top source of "facebook.com" reads as a data error to any analyst.
57. ~~**/pricing promises registry access the product no longer grants.**~~ ✅ CLOSED
    (private-beta sprint, 2026-07-13): the public pricing page is retired — /pricing
    308-redirects to /access (beta request), all price cards and the registry-promise
    copy are deleted, and no signed-in surface advertises registry access. The
    underlying entitlement question (should role=analyst ever regain /registry) remains
    an operator decision but no public copy over-promises anymore.

### New (from the IA-refinement sprint — 2026-07-12, docs/reviews/IA-REFINEMENT-REVIEW.md)

58. **[Tier 1 — operator ruling made; implementation pending] Source-attributed named people on
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
    **IMPLEMENTED 2026-07-15 (branch `codex/beta-invite-signals-x-reliability`, NOT yet deployed):**
    `detectPurge` now carries `Signal.subjects` (one stable representative name per distinct
    qualifying canonical person, deterministically ordered, all of them); `toPublicSignal` still
    drops it and the `headline` still carries no names, so anonymous/unaccepted HTML shows zero
    names (proven by the page test's data-layer assertions + no evidence query). The accepted
    `/signals` view renders the names + a prominent attribution/non-endorsement notice; Terms §9
    gained the durable named-person rule and `CURRENT_TERMS_VERSION` bumped 1.0→1.1 (effective
    2026-07-16, the actual rollout date) forcing re-acceptance, Privacy unchanged at 1.2. All person/pressure/canonical
    safeguards + ruling 19 intact. **Close only after the names/disclaimer/Terms bump are live.**
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

61. **[operator] Entity cleanup plan awaiting approval.** Refreshed deterministic dry run against
    prod after X recovery: **876 -> 683 entities** (80 drops, 113 merges; original pre-X dry run
    was 763 -> 578). Plan + apply/integrity procedure:
    docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md. Apply BEFORE the OpenSanctions
    fixed-cutoff rescore (it changes the scored population). **Sequencing added by the
    2026-07-13 remediation: DEPLOY the canonical-identity persist fix
    (digest-persist.ts `resolveEntityId`) before applying — the pre-remediation
    exact-name get-or-create would recreate merged spellings on the next digest
    persist, immediately regressing the plan.** The persist fix is now deployed. The
    876→683 projection is stale because current eligible population is 937; rerun the
    read-only dry run immediately before approval/apply.
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
65. **[low] Signed-in home 390px operator eyeball.** Browser verification covered 17
    routes but the signed-in home needs a real session (dev parity renders the
    signed-out branch). The 2026-07-15 production delta rechecked all anonymous routes at
    390px in WSL Chrome, but the available Chrome profile was signed out; one real-session
    phone-viewport eyeball still closes it.

### New (from the X gap recovery execution — 2026-07-14)

66. **[Tier 1] Steady X poller cannot self-recover from a watermark park longer than
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
    **IMPLEMENTED 2026-07-15 (branch `codex/beta-invite-signals-x-reliability`, NOT yet deployed):**
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
    real scheduled park → checkpoint-resume → completion sequence is proven in prod.**

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
    expired `NEON_API_KEY` (tracked in BLOCKERS/HUMAN-SETUP). Remaining actions are not part
    of this closed release task: authenticated phone sweep stays #65 and PostHog
    project-membership review stays under #67 (the billing limit is configured). **Later update
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
70. **[low maintenance] GitHub Actions v4 action-runtime deprecation.** CI for the
    readiness-delta commit passed both jobs, but GitHub annotated `actions/checkout@v4`
    and `actions/setup-node@v4`: their Node 20 action runtime is deprecated and GitHub is
    currently forcing it onto Node 24. Upgrade to the current Node-24-based action majors
    in a workflow-only change, then verify the gate and integration jobs. This is not a
    current application-runtime or CI failure.
