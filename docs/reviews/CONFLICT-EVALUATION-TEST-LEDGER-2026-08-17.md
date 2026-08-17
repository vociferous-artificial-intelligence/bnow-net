# Conflict-evaluations workstream — test ledger

Exact commands, counts, failures, timings per phase. Baseline (base commit
`7150b49`, this worktree, Node v24.14.0/npm 11.9.0):

| Stage | Command | Result |
|---|---|---|
| Base sanity (`7150b49`, fresh worktree) | `npm test` | **2,402 passed / 2,402 (185 files)** — matches the QF final tally exactly |
| Base sanity | `npx tsc --noEmit` | clean |

Entries appended per phase below.

## Phase 0

(gates run after the fixture matrix lands; Phase 0 is docs+fixtures only — the
required gates are `git diff --check`, fixture-schema validation, and the full
unit suite proving zero behavior change.)
