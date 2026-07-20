# AI Search Gate 4 — independent eval/cache review (routing + exact caching)

**Date:** 2026-07-20 · **Subject:** the Phase 4 diff (`a335cd4`) on
`codex/ai-search-ask-p4-routing-cache` vs integration HEAD `17268e4`.
**Method:** mandatory independent review — two reviewer agents that did not
author the code (workflow `wf_bf20f0f9-5bc`; 294,379 subagent tokens; executed
probes with dummy DBs/socketless pool stubs, zero network, $0): (1) exact-cache
correctness/money/privacy/staleness, (2) router/registry equivalence + flag
posture. File/line evidence + executed reproduction required; the lead
re-verified each finding before fixing.

## Verdict

**PASS after fixes** (fix commit `3f4242c`). 0 blocker / 0 high; 3 medium and
~6 low findings, all confirmed by executed probes; every medium and every
practical low fixed and regression-pinned. Post-fix: unit **1,896/1,896**,
integration **56/56** (disposable fork `br-falling-flower-atkywyg1`, deleted),
typecheck/lint/build green.

## Findings and dispositions

| # | Sev | Finding (probe-confirmed) | Disposition |
|---|---|---|---|
| G4-1 | med | The cache key was insensitive to the answer/rerank model, `ASK_PIPELINE` (the documented instant rollback), max-output-tokens, vector/lexical tops, the evidence floor, and the relevance/no-coverage/fidelity toggles — an operator rollback could keep re-serving entries produced under the configuration just rolled back, until the next corpus move (probe: 9 of 11 knobs left the key byte-identical) | **fixed**: the key folds the RESOLVED auto policy + every listed toggle; a 10-knob sensitivity pin asserts each moves the key |
| G4-2 | med | Cache-hit ask_usage rows replayed the ORIGINAL run's per-stage token/cost columns and provider under `cost_usd=0`, with no hit marker — internally incoherent billing-adjacent telemetry that double-counts stage spend in any future aggregation (probe: captured INSERT params) | **fixed**: hit rows log `provider: "cache:exact"` with all stage columns NULL; the USER-facing payload keeps its true provider; pinned |
| G4-3 | med | `route()` ignored `features.nameBearing` — the §8.3 fidelity-gate leg existed only as a comment, so a future `answer-matrix` scorecard alone would silently unlock name-bearing Fast/Deep traffic (probe: identical refusal objects; grep: dead input) | **fixed**: Fast/Deep additionally require a `fidelity-fixtures` suite (which no entry carries) when `nameBearing`; pinned |
| G4-4 | low | Router recorded 2500 for degenerate `ASK_ANSWER_MAX_OUTPUT_TOKENS` (0/negative) while the pipeline actually used the degenerate value (envNum vs >0-floor parity gap); the policy also omits rerank-stage constants and the trim floor | **fixed** (parity): envNum semantics mirrored, pinned at 0/−100/NaN; the policy is now documented as answer-stage-scoped (rerank knobs deliberately excluded) |
| G4-5 | low | Auto performed no scorecard check, so `ASK_ROUTER=1` + `ASK_ANSWER_MODEL=gpt-4o` records a scorecard-less model as `route-v1:auto` (latent while recording-only) | **fixed** (marker): an env-overridden model records reason `auto_env_override`; the live-routing phase must add the hard check (noted in code) |
| G4-6 | low | `ask_answer_cache` had no TTL/sweep — every corpus move permanently orphans all rows, growth unbounded | **fixed**: lazy 7-day sweep piggybacked on store (created_at index); pinned |
| G4-7 | low | Snapshot hydration rendered `countryName` as uppercased ISO2 ("UA" vs the live path's "Ukraine") | **fixed**: names resolve via the countries table by stable iso2; pinned |
| G4-8 | low | With `FEATURE_AUTH_GATE` off every anonymous visitor shared one "anonymous" cache namespace (dev/demo-only pooling) | **fixed**: anonymous identities never touch the cache; pinned |
| G4-9 | low | `window.matchedPhrase` casing split otherwise-identical entries (hit-rate loss only) | **fixed**: the key uses resolved from/to dates only; pinned |

## Checked clean (both reviewers, executed highlights)

Flag-off byte-identity (both flags unset = strict no-op; ask() args
deep-identical, zero cache consultation, route_policy null into the
0021-existing column; no module-load side effects). ASK_ROUTER=1 behavior
identity (recording-only; single consumer is the logUsage param). Registry
price parity byte-for-byte incl. the unknown-model backstop; scorecard gate
unspoofable by env (static in-repo data; deep-spoof probe refused); registry
honesty verified against the checked-in 2026-07-11 eval numbers. Cache hits
$0 (no ask(), zero reservations — real-Postgres pin; allowance consumed
BEFORE lookup so no gate bypass; idempotency replay precedes the cache).
Poisoning excluded for every degraded provider/state incl.
insufficient-with-openai-provider (denial correction) and snapshotless paths.
Corpus-version invalidation unevadable (no in-place claims UPDATE exists;
serial ids never reused). F11 hydration can only drop, never mis-attribute;
the live-claims query never runs on the snapshot branch. Cross-user isolation
structural for authenticated users. Progressive cache hits produce a coherent
event sequence with exactly one terminal. Relative time phrases cannot hit
across days (resolved dates are key inputs). Migration 0024 additive; 9999
last. Cached badge renders the ORIGINAL currency in both render paths.

## Acceptance criteria (master prompt §11)

| Criterion | Verdict |
|---|---|
| No Auto route without a recorded passing scorecard | pass (recording-only router; Fast/Deep refuse; env-override marked; hard check required before live routing — noted) |
| Source-fidelity pass rate not worse than baseline | pass structurally (no model/K/prompt change anywhere; Auto ≡ constants, equivalence-pinned) |
| Exact cache misses on every relevant version/corpus change | pass after G4-1 (10-knob sensitivity matrix + corpus/prompt/window pins + real-Postgres bump test) |
| Old cached citations render from their frozen snapshot | pass (F11 pins: snapshot content + stable doc ids; live-claims query never issued) |
| Cross-user/org pooling off | pass (structural per-user isolation + anonymous guard) |
| p50/p95 latency/quality/cost per route | N/A-honest: no route change shipped (Auto identical; Fast/Deep disabled); cache-hit latency is the lookup path (~2 queries); the paid matrix that would produce per-route scorecards remains operator-blocked |
| Fast/Deep disabled without the paid scorecard | pass (refusals + fidelity leg; enablement-blocked recorded) |
