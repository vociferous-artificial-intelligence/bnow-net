# Step 22 — WS-2.3 #33 remap: runbook + `--estimate` dry run against a local `next start` on a Neon branch (Wave 2)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Worktree | `48h-ws2-remap-20260905`, step branch `…/map-remap-runbook` (step 12 runs concurrently in `48h-ws2-provider`) |
| Window | H12 → H20 (runbook + `--estimate`); the measured run only when D7 is answered |
| Depends on | 02 merged (reworded driver header); decision R4 (measurement path); D7 (spend) — until D7 is answered, `--estimate` only. Independent of step 12. |
| Rewrite from | PLAN-WS-2 §WS-2.3 (paste its WS-2.3 section here at CP1); R4's answer |
| Spend | $0 unless D7 authorizes the measured run (then the authorized ceiling, on the branch's own `openai_map` ledger, campaign-local caps). |
| Closing report | `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` (the runbook IS the report) |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then PLAN-WS-2 §WS-2.3, `scripts/map-remap.ts`
(all; note :22-27 — the driver dispatches through `workloadDispatchConfig('map')`, so the
production lock is NOT relaxed; :641 default target production), `scripts/map-backfill.ts`,
`src/lib/analysis/map-lease.ts`, `src/lib/analysis/map-versions.ts`, `map-prompts.ts:242-266`,
`src/integration/authz-page-gate.itest.ts` (the `next build && next start` bound to a fork
pattern), OPEN-TASKS #33 (:167-187), AGENTS.md 2026-08-22 entry (≈1079-1139) and the
2026-09-03 paid-campaign entry (what was NOT authorized: remapping).

## Do (with R4; D7 only for the measured run)

1. **Runbook** `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`: preconditions (fork via
   `scripts/neon-branch.ts create` — auto-named, note the id; `next build && next start` with
   `DATABASE_URL`=fork, `CRON_SECRET`, `POSTMARK_SERVER_TOKEN` blank, `OPENAI_API_KEY` blank
   for the `--estimate` phase (COMMON §4.8), map caps set campaign-locally,
   `MAP_BACKFILL_BASE=http://localhost:3000`); a `--base-ack` fail-closed guard in
   `scripts/map-remap.ts` (a non-loopback base requires an explicit ack; loopback needs none;
   unit test) as a small companion PR, with its proposed decision-log entry in the report's
   "Proposed AGENTS.md changes" block (step 25 applies it);
   per R4 how pending work exists on the fork (prompt-hash bump on the branch only — the
   production lock predicate `model-config.ts:156-159` is never edited); `--estimate` first
   (docs per day, calls, USD by `pricing.ts`); `--resume` semantics and checkpoint location
   (`data/remap-state/` gitignored); per-1k-document cost formula; abort/rollback (delete the
   fork); what the decision-log entry records; ruling 13 (consumers filter to
   `mapExtractorVersion()`) and ruling 7 (a new map model is re-measured for under-fill) as
   explicit runbook gates for any FUTURE candidate run.
2. **Dry run ($0):** execute the runbook up to and including `--estimate` on a real fork and
   paste the output. Only if a SIGNED D7 decision-log entry names a ceiling (COMMON §3 — the
   one paid exception this program grants an agent): execute over the smallest window that
   yields a per-1k figure (e.g. one day), on the fork only, with `LLM_SPRINT_USD_CAP` and
   `MAP_USD_CAP_DAILY` set to that ceiling, the operator present, record the ledger row, then
   delete the fork. Otherwise print `AWAITING AUTHORIZATION: D7` and stop after the estimate.
3. **Lock-replacement design note** (no code): what "registry-approved + remap-complete"
   gating would need (a durable remap-complete marker per extractor version; the predicate
   reading it; activation authorization entry) — for the operator's DECISION after step 4 of
   the eval program.

Acceptance: the runbook is executable cold; the estimate output is in the report; no
production target was ever used (`MAP_BACKFILL_BASE` shown in every command); no change to
`model-config.ts`.
