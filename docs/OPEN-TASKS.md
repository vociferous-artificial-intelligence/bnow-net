# Open Tasks — debt & risks identified during the build (2026-07-06)

Prioritized. "Tier 1" = address now (cheap, real risk/quality). Key-blocked items live
in BLOCKERS.md and are deliberately deferred until credentials exist.

## Tier 1 — address now

1. **CI pipeline** (GitHub Actions: `typecheck` + `test` on push/PR). The codebase crossed
   the threshold (~15 features, 104 tests) where manual test-running is a real regression
   risk — a broken deploy is one `git push` away. Highest-leverage safety net. Needs a
   fresh VERCEL_TOKEN only if we also want CI-triggered deploys (optional).
2. **/ask rate limit** — the interrogation feature calls OpenAI per query gated only by
   auth. An authenticated user can run up LLM cost. Add a per-user/day cap. Small, real.
3. **Entity canonicalization** (was task #9). Junk entities pollute the graph:
   "Five individuals", "unnamed schoolboy", "ex-Central Bank employee", generic "Russian
   courts". This graph feeds OpenSanctions matching, ownership, signals, /entities, and
   /ask retrieval — so the junk degrades 5 surfaces. Fix: tighten the extraction prompt to
   skip non-specific/collective actors + a dedup/merge cleanup pass (alias merge via LLM).

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
18. **Truncation-retry watch.** Dense uk-language X corpora push gpt-4o-mini to
    finish_reason=length; digest gen now retries at 50→25 docs. If the warning becomes
    frequent, cap event count in the prompt or split extraction into two passes.

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

28. **Extraction-run variance is the dominant coverage noise.** Measured on the
    2026-07-09 A/B: regenerating the SAME ua day with the SAME corpus swings coverage
    by median ±9.6 pts (max ±23, e.g. [0,40,0] on Jul 7) because each digest is one
    gpt-4o-mini extraction picking ~10 claims. Any single-regeneration coverage
    comparison is weather, not climate (the matcher is already majority-stable — the
    variance is upstream in extraction). Options: K-run extraction with claim-level
    merge/vote (mirrors the matcher fix, ~3x LLM cost), or report scoreboard coverage
    as a rolling mean; pairs naturally with two-pass extraction (#18).
29. ~~**635 Lebanese Arabic docs are filed under the `ru` theater.**~~ ✅ 2026-07-09
    (MR sprint 3 TASK 0): operator adjudicated → **ir** (theater = coverage lens, not
    nationality; proxy-network content follows the ir lens). Three
    `TELEGRAM_CHANNEL_THEATER` pins added, map holdout removed, `retag-theater --apply`
    moved 651 docs, catch-up map run drained the backlog (41 claims, $0.0041, zero
    integrity violations). Follow-up: #37.
30. **`digests.structured.stats.llm` makes true LLM cost measurable per digest.** After ~24h of
    metering, replace the audit's MODELLED $0.158/day digest figure with the measured one, and
    recompute the metered/unmetered split (§7c put recorded spend at ~1–2% of true spend).
    `stats.sentDocIds` likewise makes the ~10.2× MODELLED re-extraction redundancy (§11)
    directly measurable — the number the map-reduce refactor is built to remove.
31. **`rank.ts` has no `eventTypeWeights` for the new per-track event types.** Elite/nuclear
    events now carry `prosecution|enrichment|...` instead of being forced into the military
    vocabulary; `profile.eventTypeWeights[ev.type] ?? 1` gives them a neutral weight, so nothing
    breaks, but buyer profiles cannot yet prefer (say) `asset_seizure` over `appointment`.

32. **The empty-extraction guard's threshold is 0 events, so a thin regeneration overwrites a
    rich one silently.** Demonstrated live while verifying MR sprint 1: regenerating ua/2026-07-08
    twice from a byte-identical 100-doc batch (`promptTokens` = 10,516 both times, proving the
    input never changed) produced **1 event / 1 claim** then **5 events / 8 claims** — 113 vs 613
    completion tokens. The first roll replaced a 10-claim digest that had scored 57.1% coverage.
    `digest.ts:170-185` only declines to overwrite when the new extraction has **zero** events, so
    a 10→1 claim collapse sails through, and with ~8 regenerations per digest-day under
    last-writer-wins the published digest is the *last* roll, not the best one. This is the
    #28 variance with teeth. Options: keep the richer extraction (compare claim counts before
    overwriting), or K-run extraction with claim-level merge (#28/#18). **Materially raises the
    stakes of the map-reduce refactor's regeneration cadence.**
### New (from MR sprint 2 — map stage, 2026-07-09)

33. **Extractor-version bumps need a remap path.** The hourly map worker selects on the
    indexed `processed=false`, so bumping the prompt/frame/model re-maps **nothing** already
    processed — sprint 2 handled its own two prompt revisions by hand-resetting `processed`
    on the affected docs. The proper tool is a budget-gated `scripts/map-remap.ts` that
    ignores `processed` and anti-joins `doc_map_state` on the *current* versions. Until it
    exists, any prompt iteration silently applies only to new docs.
34. **`doc_claims.quote_orig` is best-effort: ~15% fail verbatim containment.** The map
    counts (`quoteMisses`) claims whose quote does not appear character-for-character in the
    doc (whitespace-normalized). Down from 42% before the "COPIED CHARACTER-FOR-CHARACTER"
    rule, but if sprint 3 wants to render quotes as hard traceability evidence, add a
    repair/validation pass (or render only the verified ones).
35. **Old-version doc_claims rows are permanent history.** Two superseded extractor
    versions (~570 doc-states, ~270 claims) from sprint 2's prompt iterations remain in the
    store by design (append-only). Every consumer — sprint 3 reduce, reports — must filter
    to the current version set (`mapExtractorVersion()` per track/theater) or double-count.
36. **Map cron `maxDuration` is provisional (800s).** Measured steady-state runs land in
    `cron_runs` (~2min per 400-doc run at concurrency 3; concurrency 6 deployed later).
    After a week of hourly runs, size it to measured p99 and consider whether the hourly
    cadence + 500-doc cap keeps up with peak days (~11.5K docs) without backlog.

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

11. **Track §8.7 Phase 2 targets explicitly.** Original brief targets: event coverage ≥80%
    of ISW-reported events same-day (current: 17.5% avg / 31% nonzero-day), unsupported-claim
    rate <2%, timeliness within ±6h of ISW publication (current median info-lead +14.7h ✓).
    Surface targets-vs-actuals on /scoreboard or in the validation report; coverage gap is
    the headline quality metric to drive.
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

## Deferred by design (key-blocked — see BLOCKERS.md)

X API, Telegram MTProto, OpenSanctions key, Companies House key, Comtrade key, zakupki
proxy, maritime/AIS, ACLED, satellite. All wired behind stubs; flip on when keys land.
The user explicitly asked to progress "before API keys are set up," so these wait.

## Just completed (was open)

- ✅ Full ISW Iran Update corpus loaded (1,066 reports / 3,647 ME sources / 98k citations).
