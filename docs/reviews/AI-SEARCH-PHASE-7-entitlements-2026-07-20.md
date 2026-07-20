# AI Search Phase 7 — Ask-owned entitlement units (implementation report)

**Date:** 2026-07-20 · **Branch:** `codex/ai-search-ask-p7-entitlements` (from
integration HEAD `189c84d`, Phases 0–6) · **Commits:** `9578584` + `528731e`
**Gate:** `AI-SEARCH-GATE-7-2026-07-20.md` — subset PASS after fixes; the
JOINT boundary leg is BLOCKED on the absent billing contract.

## Scope (the §14 rule applied)

`src/lib/billing/` and `resolveAccessContext` DO NOT EXIST (rechecked at
phase start). Only the safe Ask-owned subset shipped; no Paddle state was
invented or touched; live entitlement integration is enablement-blocked.

## What shipped

- **Migration 0026** (additive): `ask_runs.units` (nullable).
- **units.ts** — the explicit §9.5 unit policy, one pure function: billed
  answered/insufficient/refused = 1; exact-cache hit = 0; idempotent replay
  = 0; limit/error refusal = 0; DEGRADED providers (stub kill-switch,
  budget-refused) = 0 (Gate 7 high fix); deep = 3 through the same function.
  `finalizeRun` defaults units to the policy — unskippable; only the expiry
  sweep leaves NULL ("never finalized with a payload"). The **aggregate
  feed** billing consumes (units/runs/settled cost per user+period) exposes
  no content or stage internals (SQL-shape-pinned); registered as an
  ENFORCE-MODE feed to reconcile against ask_usage/provider_usage (#71).
- **access-context.ts** — the STUB AccessContext contract (billing owns the
  real module); §9.4 boundary rules restated; consulted by NOTHING
  (test-pinned) — the existing gates stay the sole authority.
- **Import-graph tests** — no billing/Paddle import in the Ask pipeline,
  the guard layer (lib/usage), or db, in any import form; units/access
  import nothing from the usage layer (payment can never override
  SpendGuard). Free `/search` untouched.

## Proof (ledger P7-1..P7-3)

Unit **1,963/1,963 (157 files; +18)** — the 11-row unit-policy table (incl.
degraded/cancelled/deep), aggregate shape + scoping, stub contract +
not-consulted pins, both import-graph tests. Integration **61/61** —
real-Postgres pins: cache hit finalizes 0 units; the offline reuse turn
finalizes 0 (degraded stub — a paid turn bills 1, unit-tested).
Typecheck/lint/build green. Zero paid calls; zero production writes.
