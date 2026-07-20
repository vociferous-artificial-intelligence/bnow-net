# AI Search Gate 7 — Ask-owned entitlement subset (JOINT boundary leg BLOCKED)

**Date:** 2026-07-20 · **Subject:** the Phase 7 safe subset (`9578584`) on
`codex/ai-search-ask-p7-entitlements` vs integration HEAD `189c84d`.

## Honest gate status

Gate 7 is a mandatory-independent JOINT boundary review with the billing
workstream. **The billing side does not exist** (`src/lib/billing/` and
`resolveAccessContext` absent — rechecked at phase start), so the joint leg —
downgrade/removed-member/forged-plan/mid-run-change/entitlement-outage tests,
beta-grant parity, reconciliation — is **BLOCKED on the billing contract**,
recorded here per the master prompt (never pretended passed). What ran: an
independent review of the SAFE ASK-OWNED SUBSET (workflow `wf_ffeff683-d82`;
80,623 tokens; executed probes), which is everything §14 permits to ship.

## Subset verdict

**PASS after fixes** (fix commit `528731e`). 1 high + 4 medium + 3 low, all
probe-confirmed; the high, two mediums, and two lows fixed; the remaining
items are REGISTERED DECISIONS the joint gate must revisit (below). Post-fix:
unit **1,963/1,963**, integration **61/61** (disposable fork
`br-divine-smoke-atpncuk3`, deleted), typecheck/lint/build green.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| G7-1 | high | Degraded answers (provider `stub` during the kill-switch; `budget` when BNOW's own cap refused the call) billed 1 full unit — charging for the thing the product says is not an analysis | **fixed**: degraded providers bill 0; table-tested; the offline itest pin corrected honestly |
| G7-2 | med | Cancelled runs settle 0 units after consuming vendor spend and possibly delivering validated sections — a metered-billing gaming vector | **registered decision** (#70): 0 units in beta; MUST be re-decided (e.g. 1 unit once generation released content) with CANCELLED_MESSAGE copy aligned BEFORE live billing — on the joint-gate checklist |
| G7-3 | med | Refusal/error finalizes wrote units NULL (ambiguous with pre-Phase-7 rows); the commit overclaimed "every finalize" | **fixed**: finalizeRun defaults units to the policy — unskippable; NULL now means only "never finalized with a payload" (expiry sweep) |
| G7-4 | med | Import-graph tests missed lib/usage + db/schema (the actual cap-override vector) and bare/require/dynamic/barrel import forms | **fixed**: both surfaces scanned; all forms matched |
| G7-5 | med | `aggregateUnits.settledCostUsd` is not a faithful vendor-cost feed (pipeline-throw settles $0 while stage spend landed in provider_usage; expired runs attribute to sweep time; shadow mode loses rows) | **registered bound** (#71): the aggregate is an ENFORCE-MODE feed to be reconciled against ask_usage/provider_usage; documented for the joint gate |
| G7-6 | low | Refusal bills 1 unit while truncation bills 0 — both full-cost zero-value | **registered decision** (#70) for the joint gate |
| G7-7 | low | `UNITS_DEEP` was a dead constant the policy function could not produce | **fixed**: `analysisUnits(result, mode)` honors deep through the one policy function |
| G7-8 | low | The stub's "fail-closed mirror" doc claim was incoherent | **fixed**: fail-closed refusal-on-throw is documented as the FUTURE caller's obligation on the enablement-blocked checklist |

## Checked clean (executed highlights)

Migration 0026 strictly additive; 9999 last. Free `/search` untouched (no
gating change of any kind in the diff). No double-counting (replay/mismatch/
expired/deleted paths return before finalize; finalize exactly-once; a cache
hit's 0-unit run is separate from the original's 1-unit run). The aggregate
SQL is parameterized, selects only user_email/units/count/cost — no content
column reachable; NULL-safe SUM; half-open period boundaries. The
AccessContext stub is consulted by NOTHING and importing it is side-effect-
free. SpendGuard supremacy in shipped code: units/access import only the
driver + types; the phase adds no seam a future billing module could reach a
cap through.

## Enablement-blocked checklist for the JOINT gate (when billing lands)

1. Freeze `resolveAccessContext()`/`AccessContext` against this contract
   (access-context.ts) — billing owns the module.
2. Wire resolution ONCE at run creation (action + both API routes), composed
   auth → acceptance → access → reservation, ALL fail-closed (a resolve
   throw ⇒ limit-state refusal).
3. Joint tests: downgrade/removed member/forged plan fields/mid-run change/
   SSE ownership-not-billing-per-event/entitlement outage/SpendGuard outage/
   enforcement-flag rollback; import-graph re-run.
4. Re-decide registered unit policies (#70): cancelled, refusal-vs-truncation;
   align user-facing copy.
5. Reconciliation: aggregateUnits vs ask_usage/provider_usage (#71); decide
   the expired/throw attribution rules.
6. Beta-grant parity proof before enforcement; enforcement flag stays OFF in
   production until then. Payment never overrides SpendGuard.
