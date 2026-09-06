# Step 11b — WS-2.1 PR-2.1-3: `hasScorecard()` gate on the Auto money path (Wave 3, follow-up to step 11)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session (15-minute plan-mode preamble, then execute) |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905`, step branch `48h/ws2-routing-20260905-auto-scorecard-gate` cut from `origin/main` after CP2 |
| Window | after CP2 (#57 and #59 on `main`) |
| Depends on | R3 answered "Agree" (INDEX §2.2, commit `c50721a`); PLAN-WS-2 §4.3; step 11's report Handoff |
| Decisions | none open. R3: gate behind a test that pins baseline behaviour unchanged when no env override exists. R1 chose the read-only report, so PR-2.1-4 and migration 0031 are retired — nothing to build there. |
| Spend | $0. No DB. `.env.local` is NOT copied into this worktree (step 11 never had it). |
| Closing report | `docs/reviews/WS-2-1-AUTO-GATE-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then
`docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` §4.3 and
`docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md` ("Not built, and why", Handoff). Prove the
worktree (`git rev-parse --show-toplevel`) before anything else.

## Do

One PR — `ask: hasScorecard() gate on the Auto money path (baseline pinned unchanged)` —
executing PLAN-WS-2 §4.3 exactly as written, with step 11's single correction: the
streaming twin's gate sits **before** `answer-stream.ts:125` (the guard is built and reserved
at :125-127), not at the model resolution inside it. Re-verify every file:line at your base
before editing (`answer.ts:573`, `rerank.ts:204`, `router.ts:65-126`, `run-guards.ts:86-99`,
`limits.ts:445-451`, `config.ts:101-103`).

- Baseline pin first: with no env override, the money path and the stream path produce the
  same dispatch, the same reservation and the same `ask_usage` row shape as today — write the
  pin against the unmodified code, watch it pass, then add the gate and watch it still pass.
- The gate refuses before `tryReserve` and before any SDK construction, in the
  `llm-match-guard.test.ts:137` / `map-worker-spend.test.ts:57-65` shape.
- No registry edits, no new env, no cap change (ruling 4 untouched); `ASK_ROUTER` default
  stays off; nothing under `docs/evals/`.

## Acceptance

`npm run typecheck && npm run lint && npm test` green with the new tests counted; the
baseline pin passes on the unmodified path (say so with the commit it was run against);
`git diff src/lib/llm/analysis-registry.ts` empty.

## Report

COMMON §5. In Scope: this closes step 11's held PR-2.1-3; PR-2.1-4 is retired by R1. In
Handoff: an "attack these first" list for step 17 (the audit), starting with the baseline
pin — what a reviewer must change to make it fail.
