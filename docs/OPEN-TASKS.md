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

4. **Integration tests** on the DB-touching paths. All 104 tests are pure-function unit
   tests; the traceability trigger, digest orchestration, and validation harness have zero
   automated coverage (the trigger was smoke-tested once by hand). Add: a test that the
   claim→source invariant rejects orphans, and one digest generated end-to-end against a
   test DB.
5. **Iran military digest quality** — produces few/0 events on quiet days; the default
   prompt is Russia-shaped. Iran scoreboard coverage is ~0% partly for this reason. Make
   the military prompt theater-neutral; consider validating the *union* of Iran tracks
   against the (broad) Iran Update rather than the thin military track alone.
6. **Reliability-weighting spot-check** — a Press TV (Iran state media) claim ("Khamenei
   funeral") surfaced prominently. The hedging/reliability system marks it low-conf, but
   verify low-reliability state media is actually de-emphasized in *event ranking*, not
   just labeled. One-off audit.
7. **ME source materialization** — 1,574 sources have citation_count=0 (ME-only sources
   never per-theater-materialized). The /middle-east page computes live so it works, but
   the global `sources` table has zombie rows and registry detail pages show no ME
   reliability. Add a per-theater materialization (or a `source_theater_stats` table).

## Tier 3 — before enterprise/API sales

8. **Per-subscriber canary marking** (BUSINESS-PLAN §4) — required to safely sell $100k
   embedding/redistribution deals. Not needed until that motion starts.
9. **Per-digest assessment block** (deferred from analyst-layer build 4) — the "what
   changed & what it means" prose layer; the /signals engine is the distinctive core, this
   is polish.
10. **Content-translation toggle** — LLM per-view translation of digests (i18n scaffolding
    is done; content stays English-first until a buyer needs it).

## From the unattended-run audit (2026-07-06, docs/reviews/AUDIT-2026-07-06.md)

10. **sa (Saudi Arabia) feeds dark.** Theater is active but produced 0 digests in 7 days —
    only 10 raw docs in 3 days, newest 2026-07-05. Feed-health pass needed (probed feeds
    may have started bot-walling as il/bh/kw did); find alternates or demote to scaffolded.

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
