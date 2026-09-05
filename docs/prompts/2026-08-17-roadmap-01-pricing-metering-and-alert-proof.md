# Roadmap 01 — pricing-metering correction + operator alert-delivery proof

Small, immediately launchable, independent of the two 2026-08-17 programs. Two outcomes:
the LLM pricing table matches current list prices so SpendGuard's inputs are honest, and
one real alert email is proven delivered end-to-end so the July 29 → August 15 class of
silent degradation cannot recur unobserved (closes the #38 residue).

## Read first

`AGENTS.md` · `docs/CURRENT-STATE.md` · `docs/OPEN-TASKS.md` (#38, #66 closure narrative)
· `src/lib/llm/pricing.ts` and its parity test in `src/lib/ask/registry.ts` ·
`src/lib/usage/llm-guard.ts` · `src/lib/analysis/map-health.ts` ·
`src/lib/adapters/x-health.ts` · `src/lib/email/` seams · the 2026-08-15 Iran recovery
report's alert-delivery caveat.

## Launch preconditions

None beyond a clean read of the current Git state. Work from a fresh worktree off
`origin/main`. If the routing worktree (`cloud-model-routing-20260816`) still exists
frozen, do NOT edit it — record in the completion note that its own pricing copy must be
reconciled during roadmap 02's integration, and state the exact rows.

## Authorization boundaries

Authorized: local code, tests, docs, commits; ONE production deploy of the pricing fix
after operator confirmation; ONE bounded operator-applied temporary env change for the
alert drill, reverted the same session. Not authorized: paid provider calls of any kind;
migrations; changes to caps, models, routing, or any other env; touching either program
worktree; fabricating provider failures against live providers.

## Part A — pricing table correction

1. At execution time, fetch the CURRENT official list prices for every model row in
   `PRICES_PER_MTOK` (gpt-4o family, gpt-5, gpt-5-mini, gpt-5-nano) from the provider's
   published documentation, and reconcile against actual account billing if visible.
   As of authoring, gpt-5-mini is listed $0.25 in / $2.00 out per MTok while the table
   carries $0.125 / $1.00 — a 2× understatement metering live Ask rerank spend. Verify
   this is still true rather than assuming it.
2. Correct every wrong row. Keep the unknown-model fallback conservative (over-estimate).
3. Update the registry parity test so the pinned numbers match, and add a comment stating
   the verification date and source URL so the next drift is auditable.
4. Sweep for any OTHER hardcoded per-token price constants (`estimateUsd` call sites,
   dry-run cost models in `map-worker.ts`/`reduce`) and reconcile or annotate them.
5. Assess and record the historical impact: approximate under-metering of `openai_ask`
   to date (all-time Ask spend is small; this is an honesty note, not a crisis).

## Part B — alert-delivery proof

Goal: one delivered UNHEALTHY alert email and one delivered RECOVERY notice, held in the
operator's mailbox, with Postmark message IDs recorded. Constraints:

- Prefer a controlled drill: operator temporarily lowers a staleness/health threshold env
  (e.g. `MAP_STALE_DAYS` or the X staleness threshold) so the next scheduled evaluation
  legitimately classifies an unhealthy state, alerts, then recovers when the env reverts.
  Design the exact drill after reading the evaluators; it must not suppress or fake
  provider data, must not make paid calls, and must not leave any episode state corrupted.
- If a natural alert episode is already in flight (e.g. `stale_ru,stale_ua` during backlog
  drain), verifying THAT delivery suffices — do not drill on top of it.
- Verify actual mailbox receipt (operator confirms, or reads the retained Postmark
  message body), not merely `alertDelivery=1` in cron counts.
- Confirm episode dedup behaved (exactly one alert per episode, one recovery notice).

## Gates and handoff

`git diff --check` · targeted tests · `npm run typecheck` · `npm run lint` · `npm test`.
One fresh reviewer on the full diff (small): attack wrong prices, broken parity test,
fallback weakening, and any drill code path that could fire in normal operation. Fix
BLOCKER/MAJOR findings; re-review.

Write `docs/reviews/METERING-AND-ALERT-PROOF-<date>.md`: verified prices with source and
date, historical under-metering estimate, drill design, message IDs, mailbox confirmation,
episode-dedup evidence, and the routing-worktree reconciliation note for roadmap 02.
Update OPEN-TASKS #38 to closed only if mailbox receipt is confirmed.

Return `implementation-pass / deploy-awaits-operator-confirmation` when the code is ready
and the drill plan is written; execute deploy + drill only on explicit operator go.
