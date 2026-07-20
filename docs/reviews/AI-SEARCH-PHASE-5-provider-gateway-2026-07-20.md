# AI Search Phase 5 — provider-neutral gateway (implementation report)

**Date:** 2026-07-20 · **Branch:** `codex/ai-search-ask-p5-provider-gateway`
(from integration HEAD `0f79b4d`, Phases 0–4) · **Commits:** `2e01e9c`
(extraction) + the Gate 5 fix commit · **Gate:** `AI-SEARCH-GATE-5-2026-07-20.md`.

## What shipped

**`src/lib/llm/`** — the gateway layer (contracts.ts's docblock is the frozen
design note):

- **contracts.ts**: `GenerationProvider` (guarded `generate()` +
  dispatch-only `stream()`), `EmbeddingProvider` (`embedBatches`), normalized
  usage/result shapes, and two REGISTERED structural decisions: (1) streaming
  reserve/settle/§6.3 lifecycle stays in `answer-stream.ts` (register #40
  designated its factory as this seam; re-homing Gate 3's hardened money paths
  buys no contract value); (2) the OpenAI rerank COMPOSES `generate()` with a
  structured-output responseFormat — prompts/parsing/fallback are product
  logic and stay in the stage.
- **openai.ts**: the ONLY Ask-path module importing the vendor SDK. The
  guarded dispatch was MOVED VERBATIM from the call sites: answer.ts's
  non-streaming block, rerank.ts's structured-output block, `embedTexts`'
  batch loop, answer-stream's default factory, plus a raw byte-identical
  passthrough for the legacy pipeline (its charter forbids improvement).
  `generate()`/`embedBatches()` run init → tryReserve (LlmBudgetError BEFORE
  dispatch) → dispatch → record (BEFORE any body read) INSIDE the adapter —
  a new provider structurally cannot bypass reservation/metering.
- **pricing.ts** (register #53 consolidation): the chat price table moved
  here; `limits.ts` re-exports `estimateCostUsd`; the registry parity test
  keeps pinning the numbers.
- **retry.ts**: `withRetry` moved verbatim; embeddings/client re-exports.
- **stub.ts**: contract-suite stub adapter (never wired to runtime — offline
  behavior stays stage-owned per ruling 9).
- **contracts.test.ts** (17 cases) + **import-graph.test.ts**: same fixtures
  against openai (SDK mocked) + stub; reserve-order, anomalous-output
  metering (no-choices/refusal/truncation/missing-usage), batching/order/
  mid-batch refusal; only `lib/llm/openai.ts` may import the SDK across
  lib/ask, lib/embeddings, app/ask, app/api/ask, components (subpath +
  dynamic-import forms matched after the Gate 5 fix).

**NOT shipped (enablement-blocked/out of scope):** a secondary provider (no
`ANTHROPIC_API_KEY`, no cap envs, no scorecard — adding one requires all
three in every environment BEFORE deploy plus the paid scorecard);
health-aware fallback chains (meaningful only with ≥2 providers; §8.5's
before-first-content rule is documented in the contracts); migration: none.
The digest AnalysisProvider, validation matcher, and entity-audit cron keep
their own seams (registered out-of-scope — they migrate when they next
change).

## Equivalence evidence

All **1,896 pre-existing tests pass unchanged** (they mock the `openai`
package — interception is position-independent, so green means the dispatch
behavior is the same code); the independent Gate 5 probe additionally
byte-compared all seven dispatch payload constructions against their
`0f79b4d` originals (PASS). Suite now **1,915/1,915 (154 files)**; itest
56/56 (fork `br-flat-sea-atuy9hp5`, deleted); typecheck/lint/build green.
Zero paid calls; zero production writes.
