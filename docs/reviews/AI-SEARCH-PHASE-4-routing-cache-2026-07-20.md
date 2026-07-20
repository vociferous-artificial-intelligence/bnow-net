# AI Search Phase 4 — measured routing + exact caching (implementation report)

**Date:** 2026-07-20 · **Branch:** `codex/ai-search-ask-p4-routing-cache` (from
integration HEAD `17268e4`, carrying Phases 0–3)
**Commits:** `a335cd4` (implementation) + the Gate 4 fix/docs commits that follow it
**Independent gate:** `AI-SEARCH-GATE-4-2026-07-20.md` (mandatory; runs after this
report is drafted — this report precedes its verdict).

## What shipped (all default-OFF; behavior-identical when off)

### Registry (`src/lib/ask/registry.ts`, `reg-v1`)

Versioned model capability/price registry. Prices MIRROR `limits.ts`'s
`PRICES_PER_MTOK` exactly — a parity test fails the suite on any divergence
(registered deviation: the metering call sites keep their own table until
Phase 5 moves price knowledge into the provider adapters). The §8.4 quality
gate is data: only the production baseline carries a scorecard entry
(`gpt-5` = the checked-in 2026-07-11 v2-k60 eval; `gpt-5-mini` = its rerank
role). No `answer-matrix` suite exists anywhere — the paid matrix is
operator-blocked — so no alternative answer model can pass `hasScorecard`.

### Router (`src/lib/ask/router.ts`, `route-v1`)

Pure `route(features)`. **Auto reproduces today's pipeline constants exactly**
(answer model, rerank model, K, candidate cap, max output tokens, reasoning
effort) — equivalence-pinned against the very config functions the pipeline
reads, including env overrides. **Fast and Deep are policy shapes that REFUSE
with `scorecard_missing`** — never a silent downgrade, never servable without
the paid scorecard. `ASK_ROUTER=1` consults the router and records
`routePolicyString()` on `ask_usage.route_policy` (the column Phase 0
reserved) — telemetry only; the pipeline keeps reading its own constants, so
flag-on is behavior-identical (registered wiring decision: models route
THROUGH the policy object only when the first non-Auto route earns a
scorecard). No mode-selector UI ships (the master prompt ties it to router-on).

### Exact cache (`src/lib/ask/cache.ts` + migration 0024, `ask_answer_cache`)

Per-user EXACT answer cache behind `ASK_EXACT_CACHE` (default OFF):

- **Key** = sha256 over: normalized question (case/whitespace/trailing-punct
  only — no semantic folding), the RESOLVED parsed window (relative phrases
  bind to absolute dates), `route-v1`, `ASK_EVIDENCE_K`, `ASK_CANDIDATES`,
  the SYSTEM_V2 prompt hash, `retr-v2`, and the **corpus version**
  (`max(claims.id):count` — digest regeneration replaces claim rows, so the
  marker moves on every regeneration and on any ingest insert; conservative
  over-invalidation, never staleness).
- **Hit**: $0 — no pipeline, no provider reservations; the stored payload
  returns under THIS gesture's runId with `cacheStatus: "exact"`; a $0
  ask_usage row is written; the run row finalizes `answered`; the frozen
  EvidenceSnapshot is re-persisted onto the hit's run row. The UI shows
  "Cached answer … data as of <original currency>" (en+uk). A hit still
  counts against the user's daily allowance count — strictly conservative
  (registered; the Phase 7 units model revisits).
- **Hydration (F11)**: `hydrateResultClaims` resolves a cache-hit's cited +
  related evidence FROM the snapshot (claim content verbatim; source documents
  live-resolved by their STABLE `raw_documents` ids; no digest anchor — the
  live claim id may have churned), with live-hydration fallback when a
  snapshot is missing.
- **Store policy**: only billed ANSWERED results (`provider` openai-class)
  WITH a frozen snapshot (progressive runs persist one; the action path has no
  snapshot and is not cached — registered bound). Stub/budget/error/cancelled
  answers never enter the cache (truth-in-UI). Strict per-user isolation
  (`UNIQUE(user_email, cache_key)`); cross-user/org pooling is an unmade
  operator decision and is NOT implemented.
- **Fail-soft everywhere**: a cache outage is a miss, never a failed question.

### Explicitly NOT built (per the master prompt's gates)

Semantic cache (suggestion-only class) — deferred entirely. Adaptive K /
rerank-skip policies — blocked on per-intent evals. Fast/Deep enablement —
blocked on the paid scorecard. Async Deep — deferred by design. Mode selector
UI — ships only with a live router.

## Migration

`drizzle/0024_marvelous_dark_beast.sql` — `ask_answer_cache` + two indexes,
purely additive; `9999_claim_source_trigger.sql` still sorts last. Applied to
disposable Neon forks only (itest harness); NOT applied to production.

## Proof (ledger P4-1..P4-3)

Unit **1,890/1,890 (152 files; +30 over Phase 3's close)**: registry price
parity + scorecard gate; router Auto-equivalence (defaults + env overrides),
determinism, Fast/Deep refusal; cache key sensitivity matrix (question/window/
corpus/K/candidates each miss), normalization bounds, lookup/store fail-soft +
per-gesture field stripping; askWithLimits wiring (flag-off zero cache calls;
hit short-circuit with $0 usage row + snapshot re-persist + no pipeline; store
policy incl. snapshotless and degraded-provider exclusions; cache failure =
miss; route recording both flag states). Integration **56/56 (10 files; +4)**
on a disposable fork: real-Postgres store/lookup roundtrip + hit accounting +
per-user isolation; corpus-bump invalidation (F11); END-TO-END $0 hit through
enforce-mode askWithLimits (zero reservations, snapshot on the hit run's row);
normalization sharing. Typecheck + lint + build green. Zero paid calls, zero
production writes.
