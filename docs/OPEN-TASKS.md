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

38. **[Tier 1] X ingestion is frozen, and a green cron is masking it.** `X_SPRINT_USD_CAP` is
    exhausted at exactly $5.0001; `ingest:x` has fired 39× since 2026-07-09 20:21Z, all `ok=true`
    but `counts.fetched=0` — ~32h of zero new X docs while docs/AGENTS still list X as "live"
    (DRIFT; corrected in AGENTS.md). X is ~27–29% of digest citations (#42), so this is material.
    Two-part fix: (a) operator raises `X_SPRINT_USD_CAP` (+ verify `X_DAILY_USD_CAP`) to resume;
    (b) add a monitor so a budget-frozen ingest cron does not read as healthy (e.g. alert when a
    fast/hourly ingest run posts fetched=0 N times running).
39. **[Tier 1] No git→Vercel deploy integration.** `git push` does not deploy — after the 07-09
    auth fix, prod served the stale build ~20 min (`AUTH-EMAIL-2026-07-09.md`). Wire the Vercel Git
    integration, or codify "push then `npx vercel@latest deploy --prod`" in a release checklist so a
    pushed fix is not assumed live.
40. **[Tier 1] Magic-link login is not usable across two devices.** The single-use token is consumed
    by the first open (phone prefetch/scanner), so reopening on a second device →
    `/api/auth/error?error=Verification` (`AUTH-EMAIL-2026-07-09.md`). The 07-09 Postmark tracking
    fix (`9b5b368`) addressed a real but *secondary* defect, not this. Decide: change the token model
    (multi-use within TTL, or device-agnostic) or document the constraint on the sign-in page.
41. **[Tier 2] OpenSanctions enrichment is frozen at its 300-call lifetime cap.** `OPENSANCTIONS_CALL_CAP=300`
    reached 2026-07-09 (confirmed live: `cron_runs` id 253 `budgetStopped="…300 >= cap 300"`); zero new
    sanctions checks since. Fail-closed is working as designed; raising the cap is gated on the
    licensing review (credentials table / BLOCKERS). Relates to #17 (match hygiene before spending).
42. **[Tier 2] X single-platform citation dependency (~27–29%).** ~1 in 3.4 cited docs is from X
    (twitterapi.io). Concentration risk + validation contamination (§8.6 risks 1–2), sharpened by the
    fact that X is currently the *frozen* adapter (#38). Diversify corpus (MTProto, more RSS/Telegram)
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

47. **[Tier 1] MTProto ingest is one operator login away from live.** 2026-07-11: adapter,
    cron (`ingest:mtproto` :35), peer-cache/high-water table, dedupe gate, backfill script
    and the registry top-75 expansion are ALL deployed and fail-closed on the missing
    `TELEGRAM_SESSION`. Operator: SETUP-NEXT-WEEK §5 (login → getme → env → redeploy →
    backfill --apply, ≈$3.37 map spend). Then: first-live-day watch (flood counts in
    cron_runs), preview-scraper fate decision (sprint TASK 2), MTPROTO-RESULTS.md with
    the 3-day revalidation (TASK 5). Attacks #42 (X concentration) and the #11/#19
    coverage gap while X stays frozen (#38).

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
53. **MERGE 2's signed-in surfaces need an operator eyeball pass.** Home theater-status panel
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

## Deferred by design (key-blocked — see BLOCKERS.md)

X API (frozen at cap), OpenSanctions key, Companies House key, Comtrade key, zakupki
proxy, maritime/AIS, ACLED, satellite. All wired behind stubs; flip on when keys land.
The user explicitly asked to progress "before API keys are set up," so these wait.
(Telegram MTProto graduated to #47 — deployed, login-gated.)

## Just completed (was open)

- ✅ Full ISW Iran Update corpus loaded (1,066 reports / 3,647 ME sources / 98k citations).
