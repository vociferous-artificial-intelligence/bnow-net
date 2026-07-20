# AI Search Phase 1 — persisted runs, idempotency, atomic reservations (implementation report)

**Date:** 2026-07-19 · **Branch:** `codex/ai-search-ask-p1-runs` (from integration HEAD
`a761551`, which carries Phase 0)
**Commits:** `0512797` (frozen contract note), `a942b3f` (implementation)
**Contract:** `docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md` — written and
committed BEFORE coding, per the master prompt §8. It resolves the architecture
review's §13.4 open question: per-provider advisory-lock reservation transactions over
a `provider_usage_reservations` table, not a locked counter row.
**Independent gate:** `AI-SEARCH-GATE-1-2026-07-19.md` (adversarial money review;
separate report).

## What was built

### Schema (migration 0022, additive, passive until enforced)

- `ask_runs` — one row per paid run, created before work; `UNIQUE(user_email,
  idempotency_key)`; stores the terminal `result` payload so replay never re-runs.
- `ask_allowance_reservations` — one authorized analysis slot per (user, UTC day);
  `UNIQUE(user_email, day, slot)` makes the last-slot race lose exactly one insert by
  constraint; `UNIQUE(run_id)` makes replays reuse their slot.
- `provider_usage_reservations` — per-stage spend reservations with the
  reserved→started→settled/released lifecycle, every transition a single conditional
  UPDATE (idempotent by construction).

### Money core (`src/lib/usage/reservations.ts`)

`reserveProviderSpend` runs one short interactive transaction per attempt: a
per-provider `pg_advisory_xact_lock`, a settled-actuals read (`provider_usage`, both
daily and total/monthly windows), an active-ceilings read (reserved|started rows), and
ceiling-aware FIT checks (`settled + active + ceiling <= cap` for BOTH windows, plus
request-count caps) before inserting the reservation. Cap-unset refuses BEFORE any
lock or insert; any transaction failure refuses fail-closed. `settleReservation`
closes the row AND upserts actuals into `provider_usage` in ONE transaction — the
ceiling stops counting exactly when the actuals start; double settlement is
structurally impossible (conditional update, one winner). Expiry releases unstarted
rows and settles started ones AT CEILING (conservative; corrections are new records,
never mutations). `AtomicReservationGuard` puts all of this behind the existing
SpendGuard call-site surface (`init/tryReserve/record`).

### Pipeline seam

Stages keep their reserve-before-call / record-after-call discipline; call sites now
`await guard.tryReserve()` (awaiting the legacy synchronous result is a no-op), and
`ask()` threads optional per-stage guards (`embed`/`rerank`/`answer`) built by
`buildAskRunGuards(runId)` with per-stage ceilings derived from each stage's
output-token limit + a bounded input estimate (never a whole-run multiplier). F14 is
fixed en route: rerank's `guard.record` now passes real token units.

### Orchestration (`askWithLimits`)

- **Shadow (default):** byte-equivalent behavior to Phase 0; `ask_runs` rows written
  best-effort (fail-soft), legacy gates authoritative. This is the soak.
- **Enforce (`ASK_RUNS_ENFORCE=1`):** lazy expiry sweep → idempotent `createRun`
  (replayed terminal key → stored result, zero provider calls, zero new allowance;
  replayed in-flight key → honest duplicate copy) → legacy global-budget read-check
  (contract §3) → atomic allowance slot → pipeline with atomic guards → `logUsage` →
  exactly-once `finalizeRun`. Persistence failures fail CLOSED.

### Entry points

A per-submit-gesture idempotency key rides a hidden form field (minted on mount,
re-minted when a gesture settles); the one-click home intent reuses its single-use
intent UUID; `POST /api/ask` accepts an optional `idempotencyKey` (absent → server
generates a never-replaying key: documented). Keys are validated to a bounded charset
and namespaced per authenticated user server-side — a forged key can only ever hit
the forger's own runs.

## Proof (test ledger P1-1…P1-5)

- Unit: **1,724/1,724** (142 files; +26) — mode logic, fail-closed refusals, guard
  threading, replay semantics, shadow byte-equivalence, F14 pin.
- Integration (disposable Neon fork, migrated to head by the new `runMigrations`
  export): **45/45**, including every contract §7 obligation on real Postgres — the
  three concurrency races (daily cap, all-time cap, last allowance slot) each lose
  exactly one; envelope isolation; own-settled-reservation counted once; idempotent
  settlement and terminalization under concurrent invocation; release-vs-settle
  semantics; conservative expiry with allowance retained; cap-unset fail-closed with
  zero rows; and a **$0 end-to-end enforce-mode replay** (stub pipeline, one run, one
  usage row, stored result returned, zero provider calls).
- Build + lint clean. **Zero paid calls, zero production writes anywhere.**

## Exit criteria (master prompt §8 / Gate 1)

| Criterion | Status |
|---|---|
| Two concurrent requests at the last user slot: exactly one authorizes | **pass** (real Postgres) |
| Two concurrent reservations at the daily cap: exactly one wins | **pass** (real Postgres) |
| Same at the all-time cap | **pass** (real Postgres) |
| Duplicate POST / intent replay / refresh / retry: one run, one charge | **pass** (e2e itest + unit replay tests; UI key lifecycle unit-covered) |
| Expiry releases unstarted, conservatively settles started | **pass** |
| Settlement/terminalization idempotent under races | **pass** |
| Cap-unset still fails closed | **pass** |
| Existing provider pipelines unaffected | **pass** (flag off = 1,724 green incl. every pre-existing money test; legacy guard files' behavior unchanged) |
| Independent adversarial money review | see `AI-SEARCH-GATE-1-2026-07-19.md` |

## Rollout / rollback

`ASK_RUNS_ENFORCE` unset (default) = shadow. Enablement order at deploy time (same
discipline as 0021): migrate production BEFORE deploying, soak with rows-only, then
flip the flag. Rollback = unset the flag; tables are passive. Nothing here was
deployed anywhere; production remains untouched.

## Debt / notes

- Registered deviations/defaults: decision register #12–#18 (reserve-as-started,
  result-payload retention, ceiling-aware strictness near caps, legacy global budget,
  enforce-only expiry sweep, un-keyed API callers, duplicate-in-flight semantics).
- `ask_runs.status` never takes a distinct "running" value in Phase 1 (created →
  authorized → finished/expired); Phase 2's event model owns finer-grained status.
- The duplicate-in-flight answer becomes a real reconnect in Phase 2.
