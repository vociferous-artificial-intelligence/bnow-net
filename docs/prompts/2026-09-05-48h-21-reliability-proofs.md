# Step 21 — WS-4.2 reliability proofs on a Neon fork (#102 shed/refusal, #103 watchdog) (Wave 4)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws4-ops-20260905` (idle after 16 — check per COMMON §4.11; its `.env.local` is the trimmed copy), step branch `48h/ws4-ops-20260905-reliability-proofs` cut from `origin/main` |
| Window | H22 → H30 |
| Depends on | **O3 signed** (INDEX §2.1 — if blank, print `AWAITING AUTHORIZATION: O3` and stop before building); #64 on `main` (the `runtime_logs` table exists but no drain is registered — the proof records that the table is EMPTY and says why, per LOG-DRAIN Handoff "For step 21") |
| Rewrite from | O3's answer; `docs/reviews/LOG-DRAIN-2026-09-06.md` Handoff ("For step 21": a runtime-log column in `scripts/audit-cron.ts` must tolerate an empty `runtime_logs` without changing verdicts); OPEN-TASKS #102, #103 |
| Spend | $0 — refusal fires BEFORE dispatch, so the flood proof runs with `LLM_DISABLE=1` or a blank `OPENAI_API_KEY` on the fork; the watchdog proof injects deps. |
| Closing report | `docs/reviews/RELIABILITY-PROOFS-2026-09-06.md` |

**DECISIONS BINDING — added 2026-09-08.** O3 is SIGNED: `AGENTS.md` decision-log entry
"2026-09-07 (O3 — fork proofs accepted for this window; the preview-deployment drill is…)"
((f5); INDEX §2.2 row O3). Fork-based itest proofs are accepted as the #102/#103 "live proof";
the preview-deployment drill is logged as a follow-up, not required here. **Do not print
`AWAITING AUTHORIZATION: O3`; cite that entry and build.** Also on `main` since this prompt was
written: migrations 0029/0030 exist as files but are UNAPPLIED to production (OPEN-TASKS #111) —
irrelevant on a fork you migrate yourself, but never `env -u DATABASE_URL_UNPOOLED` to point
`migrate.ts` at a fork: set BOTH `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the fork DSN on the
same command line (OPEN-TASKS #112 — `env -u` lets dotenv repopulate the name from `.env.local`
and the migration then targets production). Register gap G5 (`runtime-logs.itest.ts` on a fork
with 0029 applied, plus the NUL / int4 / row-cap probes) is assigned to this step by CP4 plan
§5.4 if it fits; otherwise say so in the report and it falls to step 23.

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
