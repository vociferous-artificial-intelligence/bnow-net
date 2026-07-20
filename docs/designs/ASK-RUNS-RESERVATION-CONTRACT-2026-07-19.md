# Ask runs — allowance & provider-reservation contract (Phase 1 freeze)

**Date:** 2026-07-19 · **Phase:** AI Search Phase 1 (`codex/ai-search-ask-p1-runs`)
**Status:** frozen before coding, per the master prompt §8 and the architecture
review §9.3/§11 Phase 1. Resolves the review's §13.4 open question (advisory lock vs
locked counter row). Deviations from this note require a decision-register entry.

## 1. Lock strategy decision

**Chosen: per-provider `pg_advisory_xact_lock` serializing reservation attempts.
No new counter table.** One short interactive transaction per provider reservation
(WebSocket Pool client — the neon HTTP driver cannot hold an interactive txn):

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ask_resv'), hashtext($provider));
-- settled actuals, both windows (same shape as pgUsageStore.load):
SELECT ... FROM provider_usage WHERE provider = $provider ...;
-- active in-flight ceilings, both windows:
SELECT coalesce(sum(ceiling_usd),0) FROM provider_usage_reservations
 WHERE provider = $provider AND status IN ('reserved','started') [AND day = $day / day >= $monthStart];
-- refuse unless settled + active + $ceiling <= cap for BOTH the daily and total caps;
INSERT INTO provider_usage_reservations (...) VALUES (... 'reserved' ...);
COMMIT;
```

Why not a locked counter row: the all-time (and calendar-month) cap windows span many
historical `provider_usage` rows — a counter would need backfill, becomes a second
source of truth, and drifts on a crash between counter-update and reservation-insert.
Under the advisory lock, `provider_usage` stays authoritative for settled actuals and
`provider_usage_reservations` for in-flight ceilings; their union is checked
atomically. Fail-closed env-cap semantics are unchanged and checked BEFORE the
transaction (unset cap → refusal, no lock taken).

**Deadlock discipline:** exactly one advisory lock per transaction, keyed
`(hashtext('ask_resv'), hashtext(provider))`; the allowance transaction never nests
with a provider transaction (allowance commits fully before any provider reservation
begins); `openai_embed` and `openai_ask` use different keys and never contend —
envelope isolation is structural.

## 2. Reservation lifecycle (idempotent by single-conditional-update)

```
reserved --markStarted (immediately before dispatching the HTTP call)--> started
reserved --release (call never began: refusal downstream, throw before dispatch)--> released   (no spend)
started  --settle(actualUsd, usage)  [ONE txn: conditional status update + provider_usage upsert]--> settled
started  --expiry (TTL, usage frame lost)--> settled at ceiling_usd  (conservative; later
          corrections are NEW adjustment records, never mutations of settled numbers)
reserved --expiry (TTL, never started)--> released
```

Every transition is `UPDATE provider_usage_reservations SET ... WHERE id = $1 AND
status IN (<expected>)`; a lost race updates zero rows and is a no-op — double
settlement is structurally impossible. Settlement writes the reservation close AND the
`provider_usage` actuals upsert in one transaction; a crash between reserve and settle
can only over-count (active ceiling lingers until expiry) — the conservative
direction. The settled aggregate (`provider_usage`) remains what `SpendGuard`-style
cap reads consume; embed reserves against `openai_embed`, rerank and answer each
reserve independently against `openai_ask` (per-stage ceilings derived from the
stage's max-output-token limit × the price table + a bounded input estimate — never
one whole-run multiplier).

**No double-counting rule:** ONLY stage-level reservations count against provider
budgets. `ask_runs.reserved_ceiling_usd` is informational (sum of its stages'
ceilings) and is read by no cap check.

## 3. Allowance slot (user/day) — lock-free unique-slot insert

`ask_allowance_reservations (user_email, day, slot, run_id)` with
`UNIQUE(user_email, day, slot)` and `UNIQUE(run_id)`:

```sql
INSERT INTO ask_allowance_reservations (user_email, day, slot, run_id)
SELECT $user, $day, coalesce(max(slot), 0) + 1, $run
FROM ask_allowance_reservations WHERE user_email = $user AND day = $day
HAVING coalesce(max(slot), 0) < $limit
ON CONFLICT (run_id) DO NOTHING
```

Two concurrent inserts at the last slot compute the same slot number; the unique
constraint rejects exactly one (bounded retry ≤3 on slot collision; a run_id conflict
means an idempotent replay and reuses the existing slot). Refusals before
authorization consume nothing; authorized runs KEEP their slot on failure, cancel,
and expiry — no free crash retries (today's semantics preserved). The GLOBAL daily
budget (`ASK_GLOBAL_DAILY_BUDGET_USD` over `SUM(ask_usage.cost_usd)`) stays the
existing read-check in Phase 1, backstopped by the hard provider caps — documented,
unchanged.

## 4. ask_runs + idempotent replay

`ask_runs`: `id` (uuid pk = the Phase 0 run_id), `user_email`, `question`,
`idempotency_key` (+ `UNIQUE(user_email, idempotency_key)`), `status`
(created|authorized|running|finished|expired), `state` (terminal AnswerState),
`result` (jsonb terminal payload — required for replay-without-rerun; see retention
note in the decision register), timestamps (`created_at`, `authorized_at`,
`finished_at`), `expired` bool, `reserved_ceiling_usd`, `settled_cost_usd`,
`error_class`.

Create: `INSERT ... ON CONFLICT (user_email, idempotency_key) DO NOTHING RETURNING
id`; on conflict-miss, select the existing run → `{run, replayed: true}`. A replayed
TERMINAL run returns its stored `result` with zero provider calls and zero new
allowance; a replayed IN-FLIGHT run returns the honest in-progress refusal copy
(Phase 2 turns this into reconnect). The idempotency key comes from the client: a
hidden per-submit-gesture UUID form field; the one-click home intent reuses its
intent UUID; the JSON route accepts an optional `idempotencyKey` (generating one
server-side when absent keeps that path replay-unsafe-but-unchanged — documented).

Terminalization: single conditional update `WHERE id = $1 AND finished_at IS NULL`
setting status/state/result/settled totals/finished_at — exactly-once under races.

## 5. Expiry / reconciliation (lazy, no new cron)

`expireStaleRuns(ttl)` runs opportunistically at run-creation time: non-terminal runs
older than the TTL (default 15 min ≫ the 60s maxDuration) are marked
`expired`; their `reserved` reservations → `released`; their `started` reservations →
settled at ceiling (conservative). Allowance slots are retained. All transitions are
the idempotent conditional updates above, so a concurrent late terminalization wins
or loses atomically, never doubly.

## 6. Flag and rollback

`ASK_RUNS_ENFORCE` unset/`0` (default): rows shadow-write (create/terminalize
best-effort, fail-soft), the LEGACY gates (evaluateAllowance read-then-act +
synchronous SpendGuard) remain the sole authority — behavior byte-equivalent to
Phase 0. `=1`: idempotent replay, atomic allowance, and atomic provider reservations
become authoritative; the legacy allowance read remains as telemetry only. Rollback =
unset the flag; tables are passive.

Call-site seam: stages keep `guard.tryReserve()` / `guard.record()` shapes; call
sites `await` tryReserve (awaiting the legacy synchronous result is a no-op), and the
enforce path injects an atomic guard implementing the same surface over
`provider_usage_reservations`. Metering stays inside the stage boundary (ruling 8).
F14 (rerank `guard.record` unit count = real tokens) is folded into this phase.

## 7. Proof obligations (Gate 1, real Postgres on a disposable Neon fork)

1. Two concurrent allowance reservations at the last user slot → exactly one wins.
2. Two concurrent provider reservations straddling the DAILY cap → exactly one wins.
3. Same at the ALL-TIME cap.
4. `openai_embed` and `openai_ask` reservations never collide (envelope isolation).
5. A run's own active reservation is not double-counted by its later stage checks.
6. Duplicate POST / intent replay / refresh / retry → one run, one charge, stored
   result returned, zero provider calls.
7. Expiry releases unstarted reservations, ceiling-settles started ones, keeps the
   allowance slot.
8. Settlement and terminalization are idempotent under concurrent invocation.
9. Cap-unset still refuses before any lock/insert (fail-closed).
10. Flag off ⇒ behavior identical to Phase 0 (existing money tests green unchanged).
