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

Post-gate reruns (fixes from Gate 0 findings) are appended below when they occur.
