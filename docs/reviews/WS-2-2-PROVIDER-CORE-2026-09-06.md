# WS-2.2 core — provider dimension, registry key, offline-identity decoupling

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-12-provider-abstraction-core.md` (step 12, Wave 2), read
  after `docs/prompts/2026-09-05-48h-COMMON.md`. Specification executed:
  `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` §5.1 and §5.2, with the step-12 Handoff
  rewrite text (§ "Step 12 rewrite text") treated as binding per COMMON §2 item 5.
- Lane/worktree: `ws2-provider`, `/Users/go/code/bnow-net-worktrees/48h-ws2-provider-20260905`
  (verified: `git rev-parse --show-toplevel` matches, branch is not `main`).
- Step branches: `48h/ws2-provider-20260905-provider-dimension` (PR 1),
  `48h/ws2-provider-20260905-eval-identity-decouple` (PR 2, stacked on PR 1).
- Base SHA: `origin/main` **`2203150`** at session start; `origin/main` advanced to **`29db301`**
  mid-session (another lane pushed the operator's CP1 program-log entry — docs only, no `src/`).
  Both branches were rebased onto `29db301` and re-gated there. Final base: **`29db301`**.
- Decisions consumed, not made: **D2 = B** (already answered in the plan's preamble) and **R2 =
  decouple only, no `analysis-reg-v2` bump this window** (the plan's INDEX recommendation, which
  the step prompt records as the answer). The allowlist stays `{openai}` everywhere.

## Built

### PR #60 — `llm: provider dimension on analysis dispatch (allowlist openai; unapproved provider refused before reservation)`

https://github.com/vociferous-artificial-intelligence/bnow-net/pull/60 — branch
`48h/ws2-provider-20260905-provider-dimension`, head `244b2df`.

- **NEW `src/lib/llm/providers.ts`** — the leaf vocabulary module. It imports nothing from the
  seam, so `pricing.ts`, `analysis-registry.ts`, `model-config.ts` and `evals/live-runner.ts` can
  all depend on it without a cycle. Exports `ANALYSIS_PROVIDER_IDS`
  (`openai|anthropic|openai_compatible`), `AnalysisProviderId`, `ANALYSIS_DEFAULT_PROVIDER`,
  `WORKLOAD_PROVIDER_ALLOWLIST` (five entries, every one `{openai}`), `analysisReasoningCapable`
  (the `/^(gpt-5|o\d)/` probe moved verbatim from `model-config.ts:65`, and `false` for every
  non-OpenAI provider), and `isAnalysisProviderId`. `AnalysisWorkload` moves here and is
  re-exported from `model-config.ts`, so every historical import path keeps working.
  The module's governing distinction, stated in its header: **vocabulary is not permission.**
- **`src/lib/llm/pricing.ts`** — `ModelPrice` / `PriceTable` with an optional `provider` field
  (absent = openai) and `pricedFor(provider, model, table?)`. No price row changed;
  `estimateCostUsd` untouched.
- **`src/lib/llm/model-config.ts`** — `WORKLOAD_ENV` gains `<W>_PROVIDER` per workload;
  `WorkloadModelConfig` gains `provider`, `providerSource`, `providerEnvVar`, `providerRaw`;
  `AnalysisDispatchConfig` and `AnalysisDispatchIdentity` gain `provider` (immediately after
  `workload`), copied by `dispatchIdentity`. Refusal chain, provider checks first, then the
  existing order unchanged: `stub` → unknown id → not allowed for workload →
  non-openai-needs-explicit-model → invalid effort → effort-on-non-reasoning → **map lock
  (byte-identical, untouched)** → unpriced → unapproved. Every message emitted for provider
  `openai` is byte-identical to `main`. `ANALYSIS_PROVIDER` is never read here.
- **`src/lib/llm/analysis-registry.ts`** — `AnalysisApproval` gains a REQUIRED `provider`; the
  five baseline entries get `provider: "openai"`; the finder matches on it; the no-entry reason
  becomes ``(${provider}, ${model}) has no analysis-reg-v1 approval for workload "${workload}" — …``
  (keeping the word "approval" that `model-config.test.ts` matches). **Nothing added, removed or
  widened.** The version literal stays `analysis-reg-v1`.
- `src/lib/evals/live-runner.ts` — one call-site argument (`analysisApproval(workload, "openai",
  model, reasoningEffort)`), with a comment naming PR-2.4-1 as the owner of `--provider`.
- `scripts/model-routing-inspect.ts` — a `provider=` column (value, plus the env-var name when the
  source is the workload env) and a footer printing the shipped allowlist and the nameable ids.
- `.env.example` — the commented `<W>_PROVIDER` block; `src/lib/usage/llm-guard.ts` — the
  naming-hazard comment; `docs/OPEN-TASKS.md` — #83 status line only.

### PR #61 — `evals: decouple offline results identity from the live registry constant`

https://github.com/vociferous-artificial-intelligence/bnow-net/pull/61 — branch
`48h/ws2-provider-20260905-eval-identity-decouple`, head `7946a30`. **Stacked on PR #60: merge #60
first.**

- `src/lib/evals/runner.ts` — `resumeIdentityMismatch` compares `registryVersion` only when
  `headerIsLive(existing) || headerIsLive(current)`.
- `src/lib/evals/contracts.ts` — doc comment on `registryVersion` only.
- `offlineIdentity` still stamps the current constant on NEW files; no CLI change, no
  results write-path change. **`git diff --stat docs/evals/analysis/` is empty.**

## Tests

| Gate | Before | After |
|---|---|---|
| Unit (`npm test`) | 3,723 / 255 files | **3,769 / 258 files** |
| Typecheck | clean | clean |
| Lint | 0 errors, 3 warnings | 0 errors, **3 warnings** |

PR #60 alone: 3,766 / 258. PR #61 adds 3.

The three lint warnings are pre-existing and live in files neither PR touches
(`src/app/api/cron/validate/route.test.ts:7`, `src/lib/evals/hardening.test.ts:11`,
`src/lib/usage/cron-run.test.ts:5`).

**No fork integration test was run, and none is required:** no persisted shape changed on disk
beyond one additive JSON key inside an existing `jsonb` blob, no migration, no SQL, no schema
change. The prompt's acceptance makes the itest conditional on "if any persisted-shape changed";
the shape contract below is what actually changed, and it is pinned by unit tests. Recorded as a
deliberate omission rather than an oversight.

**Spend: $0.** Zero paid provider calls, zero production database access, zero env changes, no
deploy, no migration, no cron invoked, no Vercel variable named or read.

### New and extended tests (PR #60)

- `src/lib/llm/model-config.test.ts` (+16 cases): the full refusal matrix per workload
  (not-allowed, `openai_compatible`, `stub`, unknown id, trimming/blank-is-absent); the ordering
  pin that `MAP_PROVIDER=anthropic` says "not allowed for workload map" and **never** `MAP
  ACTIVATION BLOCKED`, while the lock still fires on its own terms; `pricedFor` semantics
  including an injected anthropic fixture row; identity/config round-trips; and a
  **post-widening ladder** describe (below).
- Refuse-before-reserve at **all five dispatch sites**:
  - map — `src/lib/analysis/map-worker-lease-writes.test.ts` (+2): `h.reservations === 0`,
    `h.openaiConstructed === 0`, `writes() === []`, plus the dry-run report pin.
  - reduce — **NEW** `src/lib/analysis/reduce-dispatch-refusal.test.ts` (5): no `Pool`
    construction, no `guard.init`, no `tryReserve`, no client, no `persistDigest`, no
    `loadReduceClaims`; a `code === "MODEL_CONFIG"` pin proving `digest.ts`'s truncation ladder
    rethrows instead of burning rungs; and a not-vacuous control that the same call proceeds past
    the gate with the provider absent.
  - digest — `src/lib/analysis/openai-provider.test.ts` (+1).
  - validation — `src/lib/validation/llm-match-guard.test.ts` (+2): degrades to the keyword
    matcher (ruling 9), zero calls and zero `provider_usage` writes, **and the refusal REASON is
    asserted** (see "one weak pin found and strengthened" below).
  - entity_audit — **NEW** `src/app/api/cron/entity-audit/route.test.ts` (3): 503 before
    `guard.init`, before `tryReserve`, before the client, and before `withCronRun` opens a
    `cron_runs` row.
- Byte pins: `synthesize.test.ts` — `mapreduceProviderTag()` with `MAP_PROVIDER`/`REDUCE_PROVIDER`
  explicitly `openai` is byte-identical; `map-prompts.test.ts` — the four extractor-version
  literals under an explicit-provider environment, plus a new invariance case across every
  provider value.
- Seam pins: `import-graph.test.ts` (+2) bans an `@anthropic-ai/*` dependency in `package.json`
  and an `@anthropic-ai/*` specifier anywhere in the analysis/eval/validation/Ask trees;
  `openai-client.test.ts` (+1) bans a second base-URL seam (`OPENAI_BASE_URL` or a `baseURL:`
  argument) anywhere under `src/`.
- **NEW** `scripts/model-routing-inspect.test.ts` (5): subprocess smoke of the inspector — the
  default all-openai matrix, the disallowed-provider BLOCKED line with its env-var name, the
  unknown-id line, the map allowlist-not-lock line, and the footer.

### Mutation proofs

Every mutant was reverted immediately; the tree was re-verified clean after each.

| Mutant | Killed by |
|---|---|
| allowlist check removed (`providerAllowed = providerKnown`) | **13 failures** across all six site/config test files |
| `pricedFor` absent `provider` read as "any provider" | 3 |
| refused provider blanks the model again (ruling-13 regression) | 3, incl. the extractor-version pin |
| `provider` dropped from `dispatchIdentity` | 4 |
| digest allowlist widened to include `anthropic` | 6 |
| (PR #61) offline/live skip removed | 1 |
| (PR #61) skip widened to "never compare" | 2 |
| (PR #61) skip keyed on `existing` only | 1 |

### PR #61 end-to-end proof, with its counterfactual

With `ANALYSIS_ROUTING_REGISTRY_VERSION` temporarily set to `analysis-reg-v99`:
`--offline --workload validation` and `--offline --profile conflict` both exit 0 with zero
`REFUSED|identity changed` output, and the three committed offline results files are
**byte-identical** afterwards (md5 before/after). The proof is not vacuous: the same bump with the
comparison restored exits **2** with `REFUSED: results-file identity changed — use --fresh or a
new configKey.` The constant was restored immediately and `git status` confirmed clean.

## Rulings touched and how each is satisfied

- **Ruling 4 (fail closed on configuration, before reservation).** Extended to the provider
  dimension. An unknown provider id, a known id outside the workload's allowlist, `stub` as a
  routing value, a non-OpenAI provider with no explicit model, or a model unpriced FOR that
  provider is refused inside `resolveWorkloadModel`, i.e. inside `workloadDispatchConfig`, which
  every site calls before its own `tryReserve` and before any provider client is constructed. All
  five sites are pinned with spies, not inferred. No new cap, row or env is introduced, and no
  cap semantics change.
- **Ruling 8 (metering lives inside the provider's dispatch).** Untouched — no production
  dispatch file changed. `git diff` against the base for `openai-provider.ts`, `synthesize.ts`,
  `map-worker.ts`, `llm-match.ts`, `embeddings/client.ts` and the entity-audit route is empty
  except for the route's new test file. The `provider` key reaches every persisted identity
  because those sites already call `dispatchIdentity()`.
- **Ruling 9 (per-site degradation differs on purpose).** Unchanged per site and re-pinned:
  validation catches `ModelConfigError` and falls back to the keyword matcher; reduce and digest
  throw typed; entity-audit returns 503; Ask is not routed here at all.
- **Ruling 13 (map hard lock; versioned extraction).** The lock predicate, its message and
  `MAP_BASELINE` are unchanged — `git diff -U0 … src/lib/llm/model-config.ts | grep -c
  MAP_BASELINE` is **0**, and `src/lib/analysis/map-prompts.ts` is not in the diff at all. The
  allowlist branch sits BEFORE the lock, so `MAP_PROVIDER≠openai` never reaches it. And the
  version basis does not move for any provider value — see the defect below, which is the
  substantive ruling-13 work in this PR.
- **Ruling 7** — n/a (no new map model, no batched-extraction schema change).
- **Ruling 5 (migration additivity)** — n/a, no migration.

### The one real defect found in my own code, and its fix

The first cut of `resolveWorkloadModel` blanked the resolved model for **any** non-OpenAI
provider, exactly as the plan's §5.1 pseudocode reads. That is wrong in this codebase.
`resolveWorkloadModel` never throws and is used by READ-side consumers, above all
`mapExtractorVersion()`, whose basis is `cfg.model`. So `MAP_PROVIDER=anthropic` — a configuration
that can dispatch nothing — would still have shifted all four map extractor versions, and every
`doc_claims` consumer (reduce, remap, the quality funnel) would have silently seen zero
current-version rows while the worker itself merely refused. That is a data-starvation mode of the
same family the map lock exists to prevent, reachable by one environment variable.

Caught by the extractor-version invariance test I had written for the opposite reason (to prove
the provider is not in the basis), which failed with `":06f28eba85ce"` in place of
`"gpt-4o-mini:d73cc83ed8df"`. Fixed inside `model-config.ts` alone — the blanking is now scoped to
an **allowed** provider, so a refused configuration keeps the historical OpenAI-shaped resolution
and is `dispatchBlocked` regardless. Neither `map-prompts.ts` nor the lock was touched. Pinned in
`map-prompts.test.ts` and `model-config.test.ts` and mutation-proven.

### One weak pin found and strengthened

Under the "allowlist check removed" mutation, five of the six site test files failed but
`llm-match-guard.test.ts` survived: with the allowlist gone, `VALIDATION_PROVIDER=anthropic` was
still refused one rung later (needs-an-explicit-model), so "returns null and spends nothing" stayed
true. The test asserted the outcome, not the reason. It now also asserts the warning names
`not allowed for workload "validation" (allowed: openai)`, and the mutant is killed at that site
too. Recorded because the first mutation run is what surfaced it.

### Persisted-shape contract (pinned)

Identity OBJECTS gain exactly one additive key, `provider`, in four places:
`cron_runs.counts.dispatch` (map + entity_audit), `digests.structured.stats.llmDispatch`,
`digests.structured.stats.reduce.dispatch`, `validation_runs.details.dispatch`. Every `openai:`
STRING tag is byte-identical: `openai-provider.ts:147` (`digests.provider`), `synthesize.ts`
`mapreduceProviderTag()`, and `embeddings/client.ts:144`, which is untouched **because embeddings
are not an analysis workload** (the one place the plan asked to be said out loud). The single
non-test parser of those strings, `ask/limits.ts:733` (`provider.startsWith("openai")`), is
unaffected. `quality-funnel.ts:474-475` reads the identity object opaquely with a string sentinel
and is unaffected by an added key.

## Citations re-verified (every file:line the prompt relied on)

Verified at the session's base `2203150`; PR #52 (anthropic seam hardening, `d74d588`) had landed
between the plan's base `dff58f2` and mine, but it touches only
`src/lib/analysis/{provider,anthropic-provider}.ts`, so no §5.1/§5.2 citation moved.

| Prompt citation | Status at base |
|---|---|
| `model-config.ts:52-58` `WORKLOAD_ENV` | exact (now `:64-73`) |
| `model-config.ts:130-185` `dispatchBlocked` chain | exact (now `:147-260`) |
| `model-config.ts:156-159` map-lock predicate, `:163` message | exact; **untouched** (now `:219-222`, `:226`) |
| `model-config.ts:224-240` identity + `dispatchIdentity` | exact (identity `:224-230`, fn `:232-240`; now `:288-306`) |
| `model-config.ts:65` `REASONING_MODEL` | exact; moved verbatim to `providers.ts` |
| `analysis-registry.ts:119-139` finder | exact (now `:129-152`) |
| `analysis-registry.ts:54-110` five baseline entries | exact (now `:59-120`) |
| `analysis-registry.ts:35` version literal | exact (now `:38`, value unchanged) |
| `openai-provider.ts:147` `digests.provider` | exact — `` readonly name = `openai:${resolveWorkloadModel("digest").model}` `` |
| `synthesize.ts:437-449` `mapreduceProviderTag` | exact |
| `embeddings/client.ts:144` | exact — `` provider: `openai:${model}` ``; **unchanged** |
| `map-worker.ts:868` | exact — `counts.dispatch = dispatchIdentity(dispatch)` |
| `synthesize.ts:701` | exact — `dispatch: dispatchIdentity(dispatch)` |
| `digest.ts:218` | exact — `llmDispatch` spread |
| `llm-match.ts:271,306,316` → `validation/run.ts:246` | exact |
| `entity-audit/route.ts:127` | exact |
| `map-prompts.ts:254-266` version basis | exact; **file untouched** |
| `model-config.test.ts:363-376` identity round-trip | exact (now `:379-392`) |
| `runner.ts:331-342` `offlineIdentity` | exact |
| `runner.ts:489-520` `resumeIdentityMismatch`, `:506` the version `cmp` | exact |
| `hardening-cli.test.ts:192-206` committed-offline resume | exact; green **unchanged** |

**Two corrections to the prompt's own text**, both recorded rather than silently absorbed:

1. The prompt places the map refuse-before-reserve pin in `map-worker-spend.test.ts`. That file
   holds `extractBatch` cardinality tests over a stub client and has no route/worker shape. The
   `MAP ACTIVATION BLOCKED` shape with `h.reservations` / `h.openaiConstructed` / `writes()` lives
   in **`src/lib/analysis/map-worker-lease-writes.test.ts:537-583`**, which is where the new pins
   went. `map-worker-spend.test.ts:16-23` was still updated — its `AnalysisDispatchConfig` literal
   needs the new required field, exactly as the plan predicted.
2. The prompt says a map provider change "would also change the extractor-version basis
   (`map-prompts.ts:254-266`) — do not touch the basis either." The basis is indeed untouched, but
   the framing assumes the provider would be ADDED to it. The live hazard was the opposite and
   subtler: a REFUSED provider blanking `cfg.model`. See the defect section above.

## Decisions needed

- **R2 (registry-version bump)** — consumed as answered (decouple only, no bump). If the operator
  wants it re-opened, PR #61's body carries the exact 14-hit inventory the bump PR must edit.
  No action needed to proceed.
- **No new operator decision is raised by this step.** The allowlist stays `{openai}`, so nothing
  here can spend, activate or route anything. The decisions that gate what comes next
  (**D2 = B** → step 20b's Anthropic wiring; **R6/R7** → the `anthropic_digest` metering row and
  its price row; **R13** → the eval-plane provider seam) are already listed in PLAN-WS-2 §15 and
  belong to steps 20/20b, not here.

## Debt and risks

1. **The `<W>_PROVIDER` env names collide with the `provider_usage` ROW-KEY constants** in
   `src/lib/usage/llm-guard.ts:11,16,22,194` (`DIGEST_PROVIDER`, `MAP_PROVIDER`,
   `REDUCE_PROVIDER`, `ENTITY_AUDIT_PROVIDER` are TypeScript constants holding ledger row keys —
   nothing there reads `process.env`). A comment now says so at the top of that block, but the
   collision is real and an auditor or a future refactor could conflate them. Flagged for step 17.
2. **The post-widening branches are proven only through an injected allowlist.** The
   needs-an-explicit-model, non-openai-effort and not-priced-for-provider rungs cannot be reached
   through the shipped `{openai}` allowlist. They are exercised against a widened allowlist
   injected into `resolveWorkloadModel` — tests only, on the same footing as `analysisApproval`'s
   injected `registry`, and `workloadDispatchConfig` deliberately does NOT take the parameter (pinned
   by `workloadDispatchConfig.length === 1`) so no dispatch site can widen its own allowlist. This
   is a genuine test-only widening of a security-relevant function's signature; the alternative
   was shipping four untested refusal branches. Worth a second opinion at step 17.
3. **`live-runner.ts`'s `evalDispatchConfig` still duplicates the ladder** and now passes a literal
   `"openai"`. It has its own `REASONING_MODEL` mirror at `:114` that was NOT re-pointed at
   `analysisReasoningCapable` — PR-2.4-1 owns that consolidation, and doing it here would have
   changed eval identity in a step whose whole point is that it does not.
4. **PR #61 is stacked on PR #60.** #61's branch contains #60's commit, so the GitHub diff shows
   both. Merge #60 first; if #60 is revised, #61 needs a rebase.
5. **`origin/main` moved mid-session** (`2203150` → `29db301`). Both branches are rebased onto
   `29db301` and re-gated there, but the lane is shared with four other Wave-2 sessions, so
   another rebase before merge is likely.
6. **AGENTS.md was not edited** (step-12 write-lock). Proposed changes below.
7. Not done, and out of scope by the prompt: no `analysis-reg-v2` bump, no `openai_compatible`
   routing, no Anthropic wiring, no price row for any non-OpenAI model, no eval `--provider` flag.

## Proposed AGENTS.md changes (for step 25)

1. **Directory map**, the `src/lib/llm/` line (currently naming `model-config.ts`,
   `analysis-registry.ts`, `pricing.ts`) — add the new module:
   before: `src/lib/llm/       analysis-model routing + money authorities: model-config.ts (the ONE`
   after: insert `providers.ts` in that list as "the provider vocabulary + per-workload dispatch
   allowlist (all `{openai}`)", and amend `model-config.ts`'s gloss from "per-workload model/effort
   resolver" to "per-workload provider/model/effort resolver".
2. **Standing ruling 4**, the sentence
   "a (workload, model, effort) with no `analysis-reg-v1` approval" → "a (workload, provider,
   model, effort) with no registry approval", and add to the same ruling: "a provider outside
   `WORKLOAD_PROVIDER_ALLOWLIST` (`src/lib/llm/providers.ts`; every entry is `{openai}`) or a model
   unpriced FOR that provider is refused in the same place, before any reservation." (The
   `analysis-reg-v1` → "registry" rewording is already proposed by PLAN-WS-2 §5.6 so a future bump
   needs no AGENTS.md edit; this folds into it.)
3. **Standing ruling 13**, append: "The provider dimension does NOT enter the extractor-version
   basis, and a REFUSED provider does not move it either — `resolveWorkloadModel` keeps the
   historical OpenAI-shaped model resolution for any configuration it blocks, precisely so that an
   unusable env cannot strand `doc_claims` consumers on zero current-version rows."
4. **Architecture paragraph**, the sentence beginning "LLM behind `AnalysisProvider`: … `anthropic`
   implemented in the seam (no key in any env yet — auto-selected if an Anthropic key exists and no
   OpenAI key does)". That parenthesis is **already false** as of PR #52 (step 09 removed the
   key-alone branch) — flagging it here because my PR's `providers.ts` header cites the current
   behaviour. Proposed: "`anthropic` implemented in the seam but REFUSED at selection (#83); it is a
   nameable provider id in `src/lib/llm/providers.ts` whose workload allowlists are all `{openai}`,
   so it cannot dispatch." Step 09's report may already propose a version of this — take whichever
   is more precise, do not apply both.

No decision-log entry is proposed for this step alone: it lands no behaviour change and activates
nothing. If step 25 prefers one entry per WS-2 stage, the material is PR #60's and #61's bodies.

## Handoff

### The exact refusal classes and messages (steps 17, 20, 20b, 22 will all assert against these)

All are `ModelConfigError` (`code: "MODEL_CONFIG"`, `name: "ModelConfigError"`), thrown by
`workloadDispatchConfig(workload)` and prefixed `model-config: <workload> — `. In refusal ORDER:

```
<W>_PROVIDER=stub is not a dispatch provider (ANALYSIS_PROVIDER=stub is the offline switch) — failing closed
<W>_PROVIDER="<raw>" is not a known provider (known: openai|anthropic|openai_compatible) — failing closed
provider "<p>" is not allowed for workload "<w>" (allowed: openai) — failing closed
<W>_PROVIDER=<p> requires an explicit <W>_MODEL (OPENAI_MODEL and the default model apply to provider openai only) — failing closed
invalid <W>_REASONING_EFFORT="<raw>" (allowed: minimal|low|medium|high) — failing closed          [unchanged]
<W>_REASONING_EFFORT=<e> set for non-reasoning model "<m>" — failing closed                       [unchanged, openai only]
<W>_REASONING_EFFORT=<e> set for provider "<p>", which accepts no reasoning effort in this release — failing closed
MAP ACTIVATION BLOCKED: …                                                                         [unchanged, byte-identical]
model "<m>" has no entry in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced   [unchanged, openai only]
model "<m>" is not priced for provider "<p>" in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced
(<p>, <m>) has no analysis-reg-v1 approval for workload "<w>" — pricing alone is not quality approval; run the activation checklist (evaluation + registry entry) first
```

The registry's effort-refusal string is unchanged. **`resolveWorkloadModel` never throws**; it
returns the same text in `dispatchBlocked`.

### The identity shape

```ts
{ workload, provider, model, reasoningEffort, registryVersion, approval }
```

`provider` is `AnalysisProviderId`, always `"openai"` in every environment today, placed
immediately after `workload`. This is the object persisted at all four sites listed under
"Persisted-shape contract" above.

### What steps 20 / 20b must reuse

- **20b (Anthropic, PLAN-WS-2 §5.4).** The whole activation surface is now three edits plus the
  wiring: (a) `WORKLOAD_PROVIDER_ALLOWLIST.digest` gains `"anthropic"` in
  `src/lib/llm/providers.ts`; (b) a price row in `pricing.ts` carrying `provider: "anthropic"`
  (B2, gated on R7); (c) an `AnalysisApproval` with `provider: "anthropic"` — which needs its own
  scorecard and, per §5.6, the `analysis-reg-v2` bump. Until all three exist the seam refuses at
  the allowlist. `getProvider()` should select on `resolveWorkloadModel("digest").provider` and
  never fall back; step 09's `ANALYSIS_PROVIDER=anthropic` refusal
  (`ANTHROPIC_NOT_REGISTERED` in `src/lib/analysis/provider.ts`) stays and gets an updated message.
  Note for B1: `analysisReasoningCapable` returns `false` for anthropic, so an
  `ANTHROPIC` model carrying a `DIGEST_REASONING_EFFORT` is refused with the provider wording —
  that is deliberate, not an oversight, and B1 must decide whether to teach the probe or keep the
  refusal.
- **20 / PR-2.4-1 (eval `--provider`).** `evalDispatchConfig` now calls
  `analysisApproval(workload, "openai", model, effort)` at `live-runner.ts:161`; that literal is
  the flag's insertion point. Two constraints inherited from PR #61: offline files must keep
  `provider: "stub"` (`headerIsLive` is `provider !== "stub"`, and PR #61's skip is keyed on it),
  and the `+provider=<id>` configKey suffix must sit BEFORE the profile/votes suffixes as §7.1
  specifies. `live-runner.ts:114`'s `REASONING_MODEL` mirror is still un-consolidated and is
  PR-2.4-1's to point at `analysisReasoningCapable`.
- **22 (remap).** Unaffected: the map lock, `MAP_BASELINE`, the extractor-version basis and
  `scripts/map-remap.ts` are all untouched, and the four version literals are unchanged, so a
  `MAP_CONTENT_CHARS=1499` basis bump on a fork-bound server behaves exactly as R4(a) describes.
  One new fact worth knowing: `counts.estDispatchBlocked` can now carry a provider refusal, and
  the dry run reports it (`map-worker-lease-writes.test.ts`), so a stray `MAP_PROVIDER` in a local
  env would surface in the estimate rather than at execution.

### What step 17 should attack first

In this order — the first two are where I would look for a mistake of mine:

1. **The ruling-13 model-blanking scope.** `provider === "openai" || !providerAllowed` in
   `resolveWorkloadModel` is load-bearing for `mapExtractorVersion()`. Try to construct a
   configuration that is `dispatchBlocked` yet still moves an extractor version, or one that is
   allowed-but-blocked (e.g. under a widened allowlist) and check what the basis does then — the
   widening PR inherits that behaviour and I did not pin it for an ALLOWED-but-blocked provider.
2. **The test-only allowlist injection** on `resolveWorkloadModel` (debt item 2). Is
   `workloadDispatchConfig.length === 1` a sufficient guarantee that no dispatch path can widen?
   Check every caller of `resolveWorkloadModel` (`map-prompts.ts`, `synthesize.ts`,
   `openai-provider.ts`, `scripts/model-routing-inspect.ts`) for a second argument.
3. Mutate the allowlist check out and confirm **13** failures across six files (my count) — and
   that none of the six asserts only an outcome where a later rung would also refuse. That is the
   exact weakness I found and fixed at the validation site; look for another instance.
4. `pricedFor` with an absent `provider` field must mean openai, never "any". Also check the
   injected-`table` parameter cannot reach a production caller.
5. `analysisApproval` arity at every caller (`git grep -n analysisApproval -- src scripts`) — a
   missed call site would silently pass a MODEL as the provider argument and type-check only if
   the model happened to be a valid id; confirm the compiler catches it (it does today because
   `AnalysisProviderId` is a union of three literals).
6. The persisted identity JSON key order and shape versus `quality-funnel.ts:474-475`'s opaque
   read with its `"pre-hardening baseline"` string sentinel.
7. That **no test pin was deleted rather than extended** — every change to an existing test file
   in PR #60 is an addition or an additive field, and `git diff` should show zero removed
   `expect(` lines outside the three `toEqual` identity literals.
8. (PR #61) Can an offline file be misclassified as live, or a live file skip its version check?
   The skip is keyed on `headerIsLive(existing) || headerIsLive(current)`; check the `||` is not
   over-permissive in some path I did not consider.

### Prompt rewrites recommended

- `docs/prompts/2026-09-05-48h-12-provider-abstraction-core.md` is now spent, but if it is ever
  re-run, apply the two corrections under "Citations re-verified": the map pin lives in
  `map-worker-lease-writes.test.ts`, and the extractor-version hazard is a refused provider
  blanking the model, not the provider entering the basis.
- `docs/prompts/2026-09-05-48h-20-eval-provider-parity.md` (step 20) should gain: "`live-runner.ts`
  already passes the literal `"openai"` to `analysisApproval` at `:161` — replace that literal, do
  not add a second call — and offline identities must keep `provider: "stub"`, because PR #61's
  registry-version skip is keyed on it."
