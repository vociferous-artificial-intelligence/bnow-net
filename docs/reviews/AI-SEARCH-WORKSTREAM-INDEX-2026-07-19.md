# AI Search/Ask workstream index — started 2026-07-19

Living index of the unattended phased implementation authorized by the 2026-07-19
decision-log entries (AGENTS.md) and executed per
`docs/prompts/2026-07-19-ai-search-ask-phased-implementation.md`. Corrected in place as
phases complete.

## Branch topology

```text
main (6c21b17 at branch time)
  └─ codex/ai-search-ask-integration-20260719   (integration; passing phases merge here --no-ff)
       └─ codex/ai-search-ask-p0-measure         (Phase 0)
```

Nothing merges to `main`, pushes, or deploys without operator instruction. Phase branches
are retained after merge for inspection.

## Phase status

| Phase | Branch | Status | Gate | Reports |
|---|---|---|---|---|
| 0 — measurement, UX honesty, eval foundation | `codex/ai-search-ask-p0-measure` | **PASSED Gate 0 after fixes** (`598dcb2`); merged to integration | Gate 0 (adversarial multi-lens; 2 high + 6 med confirmed, all fixed; 0 refuted) | `AI-SEARCH-PHASE-0-measure-2026-07-19.md`, `AI-SEARCH-GATE-0-2026-07-19.md` |
| 1 — runs, idempotency, atomic reservations | `codex/ai-search-ask-p1-runs` | **PASSED Gate 1 after fixes** (`1309d46`; 1 high + 6 med confirmed, 1 refuted); merged to integration | Gate 1 (independent adversarial money review; contract frozen first: `docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md`) | `AI-SEARCH-PHASE-1-runs-2026-07-19.md`, `AI-SEARCH-GATE-1-2026-07-19.md` |
| 2 — progressive retrieval | — | not started | Gate 2 | — |
| 3 — validator + validated streaming | — | not started | Gate 3 (red-team) | — |
| 4 — routing + exact cache | — | not started | Gate 4 | — |
| 5 — provider gateway | — | not started | Gate 5 | — |
| 6 — investigation sessions | — | not started | Gate 6 | — |
| 7 — entitlements (Ask side) | — | not started | Gate 7 (joint boundary) | — |

## Migrations claimed

| Number | Name | Phase | Contents | Status |
|---|---|---|---|---|
| 0021 | `0021_blushing_shiver_man.sql` | 0 | ask_usage += run_id (uuid, unique idx), started_at, stage_timings_ms jsonb, first_content_at, route_policy — purely additive | generated via drizzle-kit; **applied + contract-verified on a disposable Neon fork only; NOT applied to production** (production writes are out of authorization) |

| 0022 | `0022_reflective_callisto.sql` | 1 | ask_runs + ask_allowance_reservations + provider_usage_reservations — purely additive, passive until `ASK_RUNS_ENFORCE=1` | generated via drizzle-kit; applied + exercised on disposable Neon forks only; NOT applied to production |

> **HARD enablement order (Gate 0 finding F5; applies to 0022 equally):** apply migration 0021 to production
> (`npm run db:migrate`) BEFORE deploying any build containing the Phase 0 commits.
> logUsage's INSERT names the new columns and its failures are deliberately fail-soft, so
> a deploy-first window would silently freeze every ask_usage insert — and with it the
> per-user daily count and global-budget SUM — until migrate runs (SpendGuard provider
> caps still bound actual spend). No deploy is authorized inside this workstream.

`9999_claim_source_trigger.sql` still sorts and applies last (verified on the fork).
The concurrent Paddle/billing workstream had no schema work in-tree at claim time
(`src/lib/billing/` absent; working tree clean at branch point).

## Feature flags / enablement gates introduced

| Gate | Default | Enabling requires |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_ASK_STARTED` | unset (event never emits) | operator approval of the new PostHog event + decision-log entry |
| Paid answer-model matrix eval run (~$1–3) | not run | operator approval (recorded as enablement-blocked in Gate 0) |
| `ASK_RUNS_ENFORCE` | unset (shadow: rows only, legacy gates authoritative) | operator enablement AFTER prod migration (0021+0022) + deploy + shadow soak |

Phase 0's measurement columns are passive (no flag needed; rollback = stop writing them).

## Phase 0 commits (on `codex/ai-search-ask-p0-measure`)

| Commit | Summary |
|---|---|
| `6e94ede` | ask: run ids + monotonic stage timings on ask_usage; pin /ask maxDuration |
| `c8ee6ff` | ask: honest single-line working copy; typed but disabled ask_started event |
| `7fb6e23` | evals: answer-model matrix configs + named-person source-fidelity fixtures |
| `5f6aad1` | docs: Phase 0 implementation report + workstream ledgers |
| `598dcb2` | ask/evals: Gate 0 fixes — negation-aware fidelity scoring, fixture hardening, timing lows |

## Phase 1 commits (on `codex/ai-search-ask-p1-runs`)

| Commit | Summary |
|---|---|
| `0512797` | docs: freeze the Phase 1 allowance/reservation transaction contract |
| `a942b3f` | ask: persisted runs, idempotent replay, atomic allowance + provider reservations |
| `2aea195` | docs: Phase 1 implementation report + ledger/register/index updates |
| `1309d46` | ask: Gate 1 fixes — single-snapshot cap check, reservation-day settlement, honest replay semantics, secrets isolation |

## Cumulative ledgers

- Tests: `AI-SEARCH-TEST-LEDGER-2026-07-19.md`
- Decisions/assumptions/deferred items: `AI-SEARCH-DECISION-REGISTER-2026-07-19.md`
