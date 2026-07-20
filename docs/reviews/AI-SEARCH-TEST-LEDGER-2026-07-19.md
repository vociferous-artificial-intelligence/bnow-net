# AI Search/Ask test ledger — started 2026-07-19

Every verification command run during the unattended workstream, with exact counts and
environment. Append per phase; reruns after fixes get their own rows.

## Phase 0 (branch `codex/ai-search-ask-p0-measure`, WSL2 dev box)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| 1 | `npm run typecheck` | FAIL (3 errors) | ~30s | expected: eval-run.test.ts factories missing new `fidelityPass`/`fidelity` fields — fixed in-place |
| 2 | `npm run typecheck` | PASS | ~30s | after factory fixes |
| 3 | `npm test` | FAIL — 1610/1612 (2 failed) | 5.6s | expected contract updates: askMock now called with `{timings}`; working-panel copy changed — assertions updated |
| 4 | `npm test` | FAIL — 1676/1678 (2 failed) | 5.0s | (a) new actions test missed resolver mock rows; (b) **fixture-quality test caught a real fixture defect**: namesake-collision mustNotMatch fired on a *negated* mention in a faithful answer — fixture patterns sharpened to affirmative `was arrested` constructions |
| 5 | `npm test` | **PASS — 1678/1678, 140 files** | 5.1s | +66 tests over the 1,612 baseline |
| 6 | `npm run lint` | PASS | ~40s | |
| 7 | `npm run build` | PASS | ~90s | built functions-config manifest confirms `/ask` and `/api/ask` both carry `maxDuration: 60` |
| 8 | `npm run test:integration` | **PASS — 32/32, 7 files** | 13.6s | disposable Neon branch `br-wild-scene-atbj7jfu`, deleted. NOTE: the harness forks prod (pre-0021) and does NOT migrate, so this run proves no-regression, not the migration |
| 9 | fork → `scripts/migrate.ts` → contract probe → delete | **PASS** | ~60s | disposable branch `br-jolly-unit-atpw8f0z`: 0021 applied (6 statements); 5 columns with exact types; real logUsage INSERT shape ok; recordEntryTimings jsonb-merge preserved pipeline keys; duplicate run_id rejected by `ask_usage_run_id_idx` while NULL rows coexist; `_migrations` shows 0021 recorded and `9999_claim_source_trigger.sql` last; branch deleted |

Environment: local WSL2, node 24.14.0, next 16.2.10, vitest; no paid provider calls, no
production writes, no deploys anywhere in this phase. The eval matrix run is deliberately
NOT executed (operator approval required — see the decision register).

## Phase 1 (branch `codex/ai-search-ask-p1-runs`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P1-1 | `npm run typecheck` + `npm test` (after wiring) | FAIL — 9 (then 1) failed | ~90s | expected fallout: new askWithLimits opts arg (actions/route tests), pool-count assertions (shadow writes add pools — changed to created==ended pairing), the F14 fix's own old pin (units 1 → 1050), one copy assertion |
| P1-2 | `npm test` | **PASS — 1,724/1,724, 142 files** | 5.1s | +26 over Phase 0 (runs.ts mode logic, reservations fail-closed paths, enforce-mode replay/allowance/guard-threading, shadow byte-equivalence) |
| P1-3 | `npm run lint` | PASS | ~40s | |
| P1-4 | `npm run test:integration` | **PASS — 45/45, 8 files** | 23.5s | disposable branch `br-raspy-cloud-atxhsqbu`, deleted. New `ask-runs.itest.ts` (13 tests) proves the contract §7 matrix on REAL Postgres: daily-cap race, all-time-cap race, and last-allowance-slot race each lose exactly one; envelope isolation; own-settled-reservation not double-counted; idempotent settlement (actuals written once) and terminalization; release-unstarted vs started; expiry (release/ceiling-settle, allowance retained); cap-unset fail-closed with zero rows; $0 end-to-end enforce replay (1 run, 1 usage row, stored result, zero provider calls). The fork is migrated to head (0021+0022) by the new `runMigrations` export before testing |
| P1-5 | `npm run build` | PASS | ~90s | |

Post-gate reruns (fixes from Gate 0 findings):

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| 10 | `npx tsx scripts/.gate0-matrix.ts` (temp harness, removed after) | **PASS — 34/34 cases** | ~5s | every Gate-0-reviewer dodge FAILS and every reviewer faithful/negating phrasing PASSES through the real scorer against the reworked fixtures, before anything was committed |
| 11 | `npm run typecheck` + `npm test` + `npm run lint` (fix commit `598dcb2`) | **PASS — 1,698/1,698, 140 files** | ~80s total | +20 tests over row 5 (negation/state-short-circuit/malformed scorer tests + the 34-case permanent fixture matrix replacing the old pairs) |
