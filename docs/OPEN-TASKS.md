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

16. **Source-mix quota in digest corpus selection.** X docs (top registry reliability)
    monopolized the RU analysis batch after the X unlock (8–11 of every 9–12 claims cite
    x_api) and displaced the telegram/RSS docs behind RU's best coverage days
    (57.1→14.3, 50→16.7). Cap any single adapter at ~40% of the batch (or blend
    reliability with source-type diversity), regenerate, re-measure. UA improved
    (16.3→23.6) because its mix stayed balanced — the ceiling is higher with a quota.
17. **OpenSanctions match hygiene.** Require ≥1 linked claim before spending a /match
    call (orphan entities waste quota and invite name-collisions); render match score +
    caption beside sanction/PEP badges. From the 1/5 spot-check flag ("Andrei Fedorov").
18. **Truncation-retry watch.** Dense uk-language X corpora push gpt-4o-mini to
    finish_reason=length; digest gen now retries at 50→25 docs. If the warning becomes
    frequent, cap event count in the prompt or split extraction into two passes.

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
