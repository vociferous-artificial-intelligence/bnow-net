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
| 0 — measurement, UX honesty, eval foundation | `codex/ai-search-ask-p0-measure` | implemented; gate in progress | Gate 0 (adversarial multi-lens) | `AI-SEARCH-PHASE-0-measure-2026-07-19.md`, `AI-SEARCH-GATE-0-2026-07-19.md` |
| 1 — runs, idempotency, atomic reservations | — | not started (blocked on Gate 0) | Gate 1 (independent money review) | — |
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

`9999_claim_source_trigger.sql` still sorts and applies last (verified on the fork).
The concurrent Paddle/billing workstream had no schema work in-tree at claim time
(`src/lib/billing/` absent; working tree clean at branch point).

## Feature flags / enablement gates introduced

| Gate | Default | Enabling requires |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_ASK_STARTED` | unset (event never emits) | operator approval of the new PostHog event + decision-log entry |
| Paid answer-model matrix eval run (~$1–3) | not run | operator approval (recorded as enablement-blocked in Gate 0) |

Phase 0's measurement columns are passive (no flag needed; rollback = stop writing them).

## Phase 0 commits (on `codex/ai-search-ask-p0-measure`)

| Commit | Summary |
|---|---|
| `6e94ede` | ask: run ids + monotonic stage timings on ask_usage; pin /ask maxDuration |
| `c8ee6ff` | ask: honest single-line working copy; typed but disabled ask_started event |
| `7fb6e23` | evals: answer-model matrix configs + named-person source-fidelity fixtures |

## Cumulative ledgers

- Tests: `AI-SEARCH-TEST-LEDGER-2026-07-19.md`
- Decisions/assumptions/deferred items: `AI-SEARCH-DECISION-REGISTER-2026-07-19.md`
