# Step 21 — WS-4.2 reliability proofs on a Neon fork (#102 shed/refusal, #103 watchdog) — SKETCH (Wave 3, lane O)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Lane / worktree | O — `48h-ops-20260905`, step branch `…/reliability-proofs` |
| Window | H22 → H30 |
| Depends on | — (independent of other lanes; decision O3 on what counts as the proof) |
| Rewrite from | decision O3 at CP2; the step-16 report only if the drain lands first (then the proof records drain rows too) |
| Spend | $0 — refusal fires BEFORE dispatch, so the flood proof runs with `LLM_DISABLE=1` or a blank `OPENAI_API_KEY` on the fork; the watchdog proof injects deps. |
| Closing report | `docs/reviews/RELIABILITY-PROOFS-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Facts

#102: bounded dedup in `map-worker.ts` — `MAP_STEADY_SPAN_DAYS=3` (:113), `MAP_FRESH_WINDOW_DAYS=2`
(:119), `MAP_REF_ROW_CAP=75_000` (:130; **never widen it** — AGENTS.md 2026-08-31/09-01 entry
≈950-955), adaptive shed loop :674-700 (counts `refShedDays/refShedCandidates`), hard-cap
refusal :702-708 (throws before materialization → `cron_runs ok=false`). Unit pins
`map-worker-flood-bounds.test.ts:380-465`; the real-Postgres `map-flood-bounds.itest.ts`
covers drain/mirror/backfill only — NOT shed/refusal. #103: `src/lib/analysis/map-watch.ts`
— `evaluateMapWatch` :123, `loadMapWatchSignals` :191, `pgClaimWatchSlot` :314,
`runMapWatchCheck` (deps-injected) :336, `runScheduledMapWatch` :419 returns inert under
`VITEST` (:428); hook `cron-run.ts:143-150` on every non-map job. Branch lifecycle:
`scripts/test-integration.sh` → `scripts/neon-branch.ts` (`NEON_API_KEY` + `NEON_PROJECT_ID`);
itest convention: `INTEGRATION_DATABASE_URL`, blank `OPENAI_API_KEY`, 60 s hook timeout.
`src/integration/map-watch-signals.itest.ts` ALREADY EXISTS on `main` (`loadMapWatchSignals`
+ `pgClaimWatchSlot` on a fork) — EXTEND it with the `runMapWatchCheck` end-to-end case;
never rewrite the file.

## Prompt shape (fill in at CP2 per O3)

PR — `map: real-Postgres proofs of #102 shed/refusal and #103 pre-completion death detection`:
(1) extend `map-flood-bounds.itest.ts` with a seeded flood on the fork that drives the shed
loop (newest old day shed first, counters recorded) and the hard-cap refusal (throws before
any materialization, `cron_runs.ok=false`, zero writes) — seeding 75K+ rows may exceed the
hook timeout: use a test-only seam for the cap ONLY if the seam is unreachable from
production config (document it; a hidden env override is not acceptable — ruling-4 style);
(2) `map-watch-signals.itest.ts`: seed a map `cron_runs` row started and never finished,
call `runMapWatchCheck` with injected deps (clock, email spy) and prove detection + cooldown
+ slot claim on real Postgres; (3) `docs/reviews/RELIABILITY-PROOFS-2026-09-06.md` records
the runs (fork name, timings, counters) and, per O3, either closes the "synthetic only"
caveat in OPEN-TASKS #102/#103 or downgrades it to "fork-proven; preview-deployment drill
pending". No production run, no deploy.
