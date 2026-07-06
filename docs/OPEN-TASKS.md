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

## Deferred by design (key-blocked — see BLOCKERS.md)

X API, Telegram MTProto, OpenSanctions key, Companies House key, Comtrade key, zakupki
proxy, maritime/AIS, ACLED, satellite. All wired behind stubs; flip on when keys land.
The user explicitly asked to progress "before API keys are set up," so these wait.

## Just completed (was open)

- ✅ Full ISW Iran Update corpus loaded (1,066 reports / 3,647 ME sources / 98k citations).
