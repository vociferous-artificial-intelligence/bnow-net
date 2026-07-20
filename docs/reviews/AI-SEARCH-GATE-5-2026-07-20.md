# AI Search Gate 5 — adapter/metering review (provider gateway)

**Date:** 2026-07-20 · **Subject:** the Phase 5 extraction (`2e01e9c`) on
`codex/ai-search-ask-p5-provider-gateway` vs integration HEAD `0f79b4d`.
**Method:** Gate 5 is not one of the mandatory-independent gates (those are
1/3/4/7), but the extraction touches money code, so it got one independent
reviewer agent (workflow `wf_23443f89-783`; 106,994 tokens; executed probes —
notably a BYTE-PARITY probe that prototype-patched the repo's real OpenAI SDK
(CJS + ESM builds) to capture `create()` params and deep-compared all seven
moved dispatch constructions against their `0f79b4d` originals) plus the
lead's inline pass and the mechanical evidence (1,896 pre-existing pins green
unchanged).

## Verdict

**PASS after fixes** (fix commit follows this report). 0 blocker / 0 high;
1 medium + 4 low, all confirmed; the medium and three lows fixed, one low
accepted with rationale.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| G5-1 | med | The import-graph regex matched only plain static `from "openai"` — subpath (`openai/streaming`), subpath-default, and dynamic `import()`/`require()` forms evaded (executed demo). Tree clean today; guard-coverage gap only | **fixed**: the pattern matches specifier prefixes + dynamic forms |
| G5-2 | low | Rerank's budget-refusal log wording doubled (`…— llm: budget stop — cap`) because the new path logs `e.message` | **fixed**: `LlmBudgetError` gains a public `reason` field (additive); the log keeps exact pre-gateway wording |
| G5-3 | low | registry.ts comments still pointed at limits.ts's moved price table | **fixed**: comments name `llm/pricing.ts` as the metering source of truth |
| G5-4 | low | The contract suite's dispatch-order and anomalous-output assertions observe the OPENAI mock — a future provider row alone would not re-run them against its own transport | **fixed** (documented): the suite carries a FUTURE-PROVIDER checklist requiring a per-provider dispatch spy; register #61 |
| G5-5 | low | Theoretical failure-envelope delta: a throw from `deterministicAnswer`/`assembleV2` inside the (relocated) budget branch would now land in askWithLimits' catch instead of answer.ts's — both pure functions over validated data, no triggering input exists, no user-facing 500 either way | **accepted** (registered residual; upstream catch preserves ruling 9) |

## Checked clean (executed highlights)

Byte-parity for all five moved blocks incl. the legacy passthrough's exact
`{model, messages, temperature}` payload and the stream factory's
`stream_options`/signal threading; metering order and units/cost arithmetic
identical (F14 semantics kept; embed per-batch cadence exact); the answer.ts
budget path's payload byte-identical with answerMs correctly skipped (the
pre-existing pin verified present at BOTH commits); rerank's three-way
fallback matrix (refusal-no-usage / parse-fallback-with-usage / error-no-
usage) preserved; classifyCompletion equivalence across every edge for the
normalized choice synthesis; LlmBudgetError single-class instanceof integrity
across the boundary; no circular-import load hazards (llm-params is a leaf);
stub adapter has zero production imports; pricing re-export satisfies every
consumer with the registry parity pin intact; streaming lifecycle untouched
(its 18 Gate 3 tests byte-unchanged); suite 1,915/1,915.

## Acceptance (master prompt §12 subset applicable to this increment)

Orchestration imports no vendor SDK (enforced, hardened) · identical fixtures
→ identical metering pre/post extraction (probe + pins) · kill-switch/stub
semantics intact per stage (ruling 9 stage-owned, verified) · secondary
provider ABSENT and enablement-blocked (key + fail-closed caps in all envs +
scorecard required first) · fallback-before-first-content documented in the
contracts, unreachable until a second provider exists.
