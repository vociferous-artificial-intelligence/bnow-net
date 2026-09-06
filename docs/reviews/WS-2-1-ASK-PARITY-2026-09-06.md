# WS-2.1 — Ask metering granularity + gate parity (48-hour program, step 11)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-11-ws2-1-ask-parity.md`, read with
  `docs/prompts/2026-09-05-48h-COMMON.md` and the specification it executes,
  `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` §4 (which IS on `main` —
  merge `ba968ce`, PR #54). Per COMMON §2.5 the plan's "Step 11 rewrite text"
  (§Handoff) is part of this prompt and was followed in preference to the prompt's
  own expected-shape sketch where they differ.
- Lane / worktree: `ws2-routing`,
  `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905` (verified: toplevel is the
  worktree, never `/Users/go/code/bnow-net`; branch is never `main`).
- Branches, both cut from `origin/main` and **independent of each other** (disjoint files,
  mergeable in either order):
  - `48h/ws2-routing-20260905-ask-attribution-report` — PR **#57**, base SHA `2203150`
    ("Merge PR #56: Iran/Levant versioned gazetteer").
  - `48h/ws2-routing-20260905-embed-pricing` — PR **#59**, base SHA `29db301`
    ("docs: 48h program log …"), which is `2203150` plus one docs-only commit.
- Dependencies satisfied: step 04 (PLAN-WS-2) merged as PR #54; step 09 (Anthropic seam
  hardening) merged as PR #52 — so the COMMON §4.8 "blank `ANTHROPIC_API_KEY` in every local
  run" rule no longer applies, and no local run in this session needed a key of any kind.
- Spend: **$0**. No provider call of any kind, no database access (production or fork), no
  environment variable read back or changed, no deploy, no migration, no cron invoked.

## Built

### PR #57 — `ask: per-model attribution report over ask_usage (read-only)` (PLAN §4.1, R1 (a))

Three commits plus the PROGRESS.md plan block:

1. `ask: per-model attribution report over ask_usage (read-only)`
   - **`src/lib/ask/attribution.ts`** (new, pure — no I/O, no DB, no env):
     `attributeAskUsage(rows)` aggregates `ask_usage` rows into
     `{day, stage, model, runs, promptTokens, completionTokens, costUsd}` per
     (UTC day, stage, model), sorted day → pipeline stage → model with null last;
     `attributionCoverage(rows)` reports `rows / totalCostUsd / attributedCostUsd /
     unattributedCostUsd`; `utcDay()` for callers holding an instant.
   - **`scripts/ask-model-attribution.ts`** (new): one SELECT over `ask_usage`,
     `--since YYYY-MM-DD` (default 30 days), `--json`. It selects no question text and never
     reaches a provider. The UTC day is computed **in Postgres**
     (`created_at AT TIME ZONE 'UTC'`) rather than from a driver-returned timestamp — the
     serverless driver's naive-timestamp hazard (AGENTS.md 2026-08-24: compare epochs, never
     driver clock strings) is avoided by construction rather than reasoned about. This is a
     deliberate, documented deviation from the plan's sketch, which had the pure function
     derive the day from `created_at`; the output rows are the same.
   - Two attribution gaps are **surfaced, not smoothed**: `ask_usage` has no `embed_model`
     column, so embed always attributes to `model = null`; legacy pre-v2 rows carry only
     `cost_usd` with every per-stage column NULL, so their spend is reported as unattributed
     rather than silently dropped. `attributionCoverage` exists for exactly this.
   - The module header records that `retention.ts:81` redacts `ask_usage.question` ONLY
     (`:13` — "every cost/token/timing column stays"), so **the attribution window is
     unbounded**: rows past `ASK_CONTENT_RETENTION_DAYS` still attribute their spend in full.
2. `ingest: reconcile X_DAILY_USD_CAP default comment with the $4 production cap` (HYG-44,
   comment-only): both guard constructors are now documented — the live daily brake is the
   operator's 2026-09-03 `X_DAILY_USD_CAP=4`, and the `1.5` literal applies only when the
   variable is unset. The default is deliberately **not** raised: that would change behaviour
   for any environment leaving the variable unset. OPEN-TASKS #44's stale `x-api.ts:166` cite
   is corrected to the real call sites.
3. `scripts: route ask-eval-harvest through the guarded analysis client; drop the isolation
   exemption` (HYG-82 + #100): `scripts/ask-eval-harvest.ts --generate` now builds its client
   through `analysisOpenAiClient()` (`maxRetries: 0`) instead of the SDK directly, and the
   hard-coded `ask-eval-harvest.ts` `continue` in `src/lib/evals/isolation.test.ts` is
   deleted, so the scripts SDK scan covers every script with no name-keyed hole.

### PR #59 — `embeddings: model-aware pricing; unpriced embed model refused before reservation` (PLAN §4.2)

- **`src/lib/llm/pricing.ts`** gains the embedding half of the price authority:
  `EMBED_PRICES_PER_MTOK` (one entry — `text-embedding-3-small` at the verified $0.02/1M),
  `EMBED_UNKNOWN_PRICE_PER_MTOK = 0.13` (ceiling math only, never an authorization),
  `embedPriced()`, `embedPricePerMtok()`, `estimateEmbedCostUsd()`.
- **`src/lib/embeddings/client.ts`**: typed `EmbedModelUnpricedError`; `embedTexts` refuses an
  unpriced `ASK_EMBED_MODEL` **after** the stub check (so an offline environment still returns
  stub vectors at $0) and **before** `openaiEmbedBatches`, which is where the SDK client is
  constructed (`llm/openai.ts:142`) and where the reservation is taken (`:160`).
  `embedCostUsd(tokens, model = embedModel())` is model-aware and refuses an unpriced model
  instead of metering it at another model's rate. `EMBED_USD_PER_1M_TOKENS` is deleted (one
  price authority); `EMBED_USD_PER_TOKEN` survives as a compatibility export derived from the
  table and pinned against it.
- **`src/lib/ask/run-guards.ts`**: `embedCeilingUsd()` is model-aware; unchanged for the
  default model and never lower for an unpriced one.
- **`scripts/backfill-embeddings.ts`**: estimate via `estimateEmbedCostUsd`, a fallback rate
  labelled as such, and an exit-2 refusal for an unpriced model beside the existing stub
  refusal — before `--apply` can dispatch.
- **`.env.example`**: `ASK_EMBED_MODEL` documented with the refusal and with the fact that a
  swap also needs a backfill (`claim_embeddings` rows are keyed by model).

### Not built, and why

- **PR-2.1-3 (Auto scorecard gate)** — **HELD on decision R3**, which is blank in the INDEX
  §2 decision sheet ("Recommendations are not defaults: blank = defer"). The prompt's own
  instruction for that case is to ship the report and the embed-pricing PR and hold the rest.
  Everything needed to start it cold is in "Decisions needed" below, with the citations
  re-verified.
- **PR-2.1-4 (attribution column)** — **HELD on R1**, and the plan's §4.4 finding stands
  independently: `provider_usage` is UNIQUE on `(provider, day)` and `record()` upserts one
  row per provider-day, so a `model` column there could only stamp the LAST model of the day.
  Per-model provider ROWS would each get their own full `ASK_USD_CAP_DAILY` envelope and would
  need new cap envs in all Vercel environments first (ruling 4) — listed, not built.
- **OPEN-TASKS #84** — nothing to code; PR #51's release checklist owns it and the record
  lands at the next deploy.

## Tests

Base `origin/main` (`2203150` / `29db301`, identical for code): **3,723 unit tests / 255
files** — measured in this worktree, not quoted.

| | unit tests | files | typecheck | lint |
|---|---|---|---|---|
| base | 3,723 | 255 | clean | 0 errors, 3 pre-existing warnings |
| PR #57 | **3,735** | 256 | clean | 0 errors, same 3 warnings |
| PR #59 | **3,738** | 256 | clean | 0 errors, same 3 warnings |
| both merged (measured on a scratch merge, then deleted) | **3,750** | 257 | clean | — |

- No integration test was run: neither PR adds a migration or touches DB-shaped product code
  (PR #57's only DB contact is a script that was not executed). `.env.local` was never copied
  into this worktree, so no fork or production credential was in reach.
- **PR #57 pins**: fixture aggregation across two UTC days x two answer models with exact
  per-bucket sums; null models bucket as null; a stage with no signal contributes nothing; a
  stage that ran at zero cost still counts; sort order; coverage arithmetic. Plus a
  source-scan of the script (comments stripped first) for write verbs, a SELECT against
  `ask_usage`, no SDK reach, and no `question` column.
- **PR #59 pins**: every priced entry <= the unknown fallback; `estimateEmbedCostUsd` exactly
  equal (`toBe`, not `toBeCloseTo`) to `n * (0.02 / 1e6)` for n in {1, 77, 12345};
  prototype keys are not prices; the refusal names model/env/table; SDK-constructor spy and
  reservation spy both never called on the refusal path; the offline stub path outranks the
  price check; `retrieve-v2` degrades to `v2-lexical-only`; `embedCeilingUsd()` unchanged for
  the default model and never lower for an unpriced one.
- **Mutations raised and killed** (three, all run and reverted):
  1. An `UPDATE ask_usage SET …` string placed in the attribution script's **code** (not a
     comment) fails the read-only scan — the scan discriminates, and its comment-stripping is
     not a loophole.
  2. Moving the embed price refusal to **after** `openaiEmbedBatches` and restoring the
     hard-coded per-token constant fails exactly the two refusal-position pins (SDK
     constructor and reservation) and nothing else.
  3. Unplanned but real: the isolation scan caught a `new OpenAI(` literal that existed only
     inside HYG-82's own comment prose. That is the scan proving it now covers
     `ask-eval-harvest.ts`; the comment was reworded rather than the scan weakened.

Spend line: **$0** — zero paid provider calls, zero production writes, zero env changes, no
migration, no deploy.

## Rulings touched and how each is satisfied

- **Ruling 4 (fail-closed spend).** PR #59's refusal precedes both `SpendGuard.tryReserve()`
  and SDK construction, spy-pinned in both directions and mutation-proven. No new cap env, no
  new `provider_usage` row, no change to any cap value or to `askCaps()`/`embedCaps()`. The
  `EMBED_UNKNOWN_PRICE_PER_MTOK` fallback is ceiling arithmetic only — it can never meter a
  real call, because a model without a price row is refused before dispatch. HYG-44 is
  comment-only, so no cap semantics move; the `envNum` (fail-open) vs `envCap` (fail-closed)
  asymmetry it documents is left as decision R10 rather than silently "fixed". PR #57 adds no
  paid path at all.
- **Ruling 8 (metering inside the provider seam).** Unchanged. `openaiEmbedBatches` still
  reserves before and records after each physical dispatch; only the per-token rate it is
  handed changed, and only to the price of the model actually being sent. The attribution
  report reads what metering already recorded and adds no call site.
- **Ruling 9 (/ask degrades, never throws).** An unpriced embed model reaches Ask's vector arm
  as a throw, which `retrieve-v2.ts:160-166` already catches: `scored: false` →
  `retrievalMode: "v2-lexical-only"`, with the guard's `init()` having run but **no
  reservation**. The user still gets lexical evidence. The backfill script, which is not a
  user surface, fails loudly with exit 2 instead.
- **Ruling 3 / truth-in-UI.** The embed stub path is untouched and still outranks the new
  refusal, so an offline environment behaves exactly as before; stub vectors remain
  in-memory-only.
- **AGENTS.md write-lock (COMMON §4.7).** `AGENTS.md` is not edited by either PR. Proposed
  standing-text changes are below for step 25. `docs/OPEN-TASKS.md` edits are confined to the
  status lines of #44, #82 and #100 — the three tasks this step touches.
- **Nothing under `docs/evals/analysis/` changed** (`git diff --stat` over that path is empty
  on both branches). No dataset, scorer, registry approval, map lock predicate, `MAP_BASELINE`
  or extractor-version basis was touched.

## Citations re-verified (corrected where moved)

All verified at base `2203150`; line numbers below are post-change where the change moved them.

| Cited in the prompt | Verified |
|---|---|
| `src/lib/ask/router.ts:65-126` (scorecard gate only in the recording-only router) | Correct. `BASELINE_ANSWER_MODEL` :66, `autoPolicy()` :73-84 with `reason` :83, and the docblock at :68-72 explicitly flags the gap ("when models route THROUGH the policy, autoPolicy must verify the scorecard"). |
| `limits.ts:445-451`, `config.ts:101-103` (`ASK_ROUTER` default off) | Correct: `if (askRouter())` at `limits.ts:448`; `askRouter()` = `ASK_ROUTER === "1"` at `config.ts:101-103`. |
| `answer.ts:573` (money path) | Exact — `const model = askAnswerModel();` is line 573. The offline/deterministic branch above it is :568-571. |
| `rerank.ts:204` | Exact — `const model = askRerankModel();` is line 204; the offline fallback is :199-202. |
| `answer-stream.ts:125` (streaming twin) | Correct: `const guard = opts.guards?.answer ?? askGuardFromEnv();` :125, `init()` :126, `tryReserve()` :127 — so a gate for R3 must sit before :125 or in its caller. |
| `schema.ts:609-663` (`ask_usage` per-stage model + cost columns) | Correct: table opens :609, `rerank_model` :627, `answer_model` :628, `embed_tokens`/`embed_cost_usd` :630-631, closes :663. **There is no `embed_model` column** — the report's null-model embed bucket is that fact, not a defect. |
| `run-guards.ts:86-99` (shared `openai_ask` row) | Correct: rerank :86-92 and answer :93-99 both construct against `ASK_PROVIDER`; embed :79-85 against `EMBED_PROVIDER`. |
| `run-guards.ts:48-50` (embed ceiling) | Correct at base; now :49-55 after the model-aware rewrite. |
| `retention.ts:13,81` | Correct, and load-bearing: `:13` states "every cost/token/timing column stays"; `:81-82` is `UPDATE ask_usage SET question = '[deleted]'` with no other column touched. |
| `embeddings/client.ts:15-45,131-144` | Correct at base (`EMBED_USD_PER_1M_TOKENS` :24, `EMBED_USD_PER_TOKEN` :25, `embedCostUsd` :43-45, dispatch :131-144). |
| `llm/openai.ts:180-185` | Correct: `batchTokens` :180, `batchCost` :181, and the record-after-request call :184. The SDK client for this path is built at :142 and the per-attempt reservation at :159-161. |
| `scripts/backfill-embeddings.ts:74,83` | Correct at base (`estUsd` :74, the `/1M` print :83). |
| `src/lib/llm/pricing.ts` | Correct: `PRICES_PER_MTOK` :17-23, `estimateCostUsd` :25-32; the embed table is appended after :32. |
| `src/lib/adapters/x-api.ts:201,223` | Correct at base — the two `envNum("X_DAILY_USD_CAP", 1.5)` reads. Now :214 and :236. **OPEN-TASKS #44's own cite (`x-api.ts:166`) was stale** and is corrected in this PR. |
| `scripts/ask-eval-harvest.ts:190` | Correct at base (`const client = new OpenAI();`). |
| `src/lib/evals/isolation.test.ts:137-141` | Correct at base — the comment :137-139 and the `if (f === "ask-eval-harvest.ts") continue;` at :141. Deleted by HYG-82. |
| `docs/OPEN-TASKS.md` #44, #82, #84, #100 | All four read; #44/#82/#100 status lines updated, #84 untouched (nothing to code). |

## Decisions needed

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **R3** (CP1, unanswered — blocks PR-2.1-3) | `hasScorecard()` on the Auto money path (`answer.ts:573`, `rerank.ts:204`, and the streaming twin before `answer-stream.ts:125`) | (a) yes: an unscorecarded answer model returns the deterministic cited-claims answer with `provider = "unscorecarded"` and zero reservations, an unscorecarded rerank model falls back to `compositeFallback`; (b) no: leave the env lever ungated and rely on the recording-only router | **(a)**, behind the byte-identical no-override pin the plan specifies. Today production sets no override, so the gate is inert on the live path; it closes the "one env variable serves an unmeasured model to paying users" hole. ~1.5 h, no env, no migration, $0. |
| **R1** (CP1, unanswered — decides PR-2.1-4) | Ask per-model attribution shape | (a) the read-only report (**delivered here**); (b) a `model` column — NOT on `provider_usage` (UNIQUE `(provider, day)`; it would stamp only the last model of the day) but on `provider_usage_reservations` or a sibling table = migration 0031; (c) per-model rows — **STOP**: each row gets its own full `ASK_USD_CAP_DAILY` envelope and needs new cap envs in all Vercel environments first (ruling 4) | **(a) is now in hand**; revisit (b) only if per-model *reservation* attribution is wanted, and note it is enforce-mode-only (`ASK_RUNS_ENFORCE` is off). The gap the report cannot close by itself is embed, which has no model column anywhere. |
| **R8** (open) | Embedding prices beyond `text-embedding-3-small` | add operator-verified rows (`text-embedding-3-large`, `ada-002`) / leave unpriced and refused | Leave unpriced until a swap is actually wanted. A swap needs a re-embedding backfill anyway (`claim_embeddings` is keyed by model), so the price row is the cheap half. |
| **R9** (open) | Spend guard for `ask-eval-harvest --generate` | `askGuardFromEnv()` (`openai_ask` — pollutes the product ledger) / a new `openai_ask_eval` row on a LOCAL-ONLY `ASK_EVAL_USD_CAP_DAILY` that fails closed until set / operator-only tooling, no guard | The retry half is closed here. For the guard, the `openai_ask_eval` row is the honest option; the script never runs on Vercel, so ruling 4's all-environments ordering is moot **but must be stated in that PR's body**. Not urgent: the $1 estimate gate and the cumulative-spend stop remain. |
| **R10** (open) | `X_DAILY_USD_CAP` read with fail-open `envNum` vs every LLM guard's fail-closed `envCap` | align (behaviour change: an environment with the variable unset stops X ingest) / leave | Align in a later PR with the ruling-4 env note. Comment-only here — deliberately. |

## Debt and risks

- **The `retrieve-v2` degradation pin is shallow by construction.** That suite mocks
  `../embeddings/client` wholesale, so its unpriced-model test proves the *orchestration*
  (throw → lexical-only, evidence still returned), not the reservation count. The
  no-reservation half is pinned against the real client in `client.test.ts` with a spy. Two
  tests, one claim; neither is sufficient alone, and the report says so rather than implying
  end-to-end coverage.
- **`EMBED_USD_PER_TOKEN` is now consumed only by tests.** It is kept as the plan directs, as
  a compatibility export pinned to the table so the historical constant and the price
  authority cannot silently diverge. If a later session finds no external consumer, deleting
  it is a one-line cleanup — do not let it re-acquire a call site.
- **HYG-82 changes retry behaviour on a paid path.** `maxRetries: 0` means a transient 429/5xx
  now fails its generation batch (logged and skipped by the existing loop) instead of being
  retried invisibly. That is the point of #82 — fewer unmetered billed attempts — but a
  supervisor running `--generate` on a flaky network will see more skipped batches than
  before. That path still has no `SpendGuard` (R9).
- **The attribution report has never been run against real data.** It is unit-tested over
  fixtures and source-scanned; no database was contacted in this session. First execution
  should be a `--since` read against a disposable fork or a read-only production SELECT under
  the operator's usual posture, and its first output should be sanity-checked against
  `provider_usage` daily totals for `openai_ask` + `openai_embed` (they will not match exactly
  — `ask_usage.cost_usd` is estimate-based per row while `provider_usage` accumulates recorded
  spend, and the unattributed remainder is expected to be non-zero for pre-v2 rows).
- **Two open PRs on disjoint files.** #57 and #59 can merge in either order; neither rebases
  the other. Both touch `docs/OPEN-TASKS.md`? No — only #57 does (#44/#82/#100), so there is
  no cross-PR conflict.
- Not a risk introduced here, recorded because it was seen: `retrieve-v2.ts:46` makes Ask
  lexical-only whenever `OPENAI_API_KEY` is absent, so an Anthropic-only environment would
  silently degrade Ask retrieval. Relevant to any future Ask-on-Anthropic work, not to WS-2.1.

## Handoff

- **Merged / open:** nothing is merged by this session. **PR #57** (attribution report +
  HYG-44 + HYG-82) and **PR #59** (embed pricing) are open, green, and independent. Neither
  needs a decision to merge.
- **Held:** **PR-2.1-3** on **R3** and **PR-2.1-4** on **R1** — both unanswered in the INDEX §2
  decision sheet at the time of writing. If the operator answers R3 = yes, PLAN-WS-2 §4.3 is
  executable exactly as written; the only correction it needs is that the streaming twin's
  gate must sit **before** `answer-stream.ts:125` (the guard is built and reserved at
  :125-127), not at the model resolution inside it. If R1 chooses a column, §4.4's finding
  stands: not on `provider_usage`.
- **Step 17 (audit) — attack these first, in this order:**
  1. **PR #59's refuse-before-reserve pins.** Move `if (!embedPriced(model)) throw …` to after
     `openaiEmbedBatches` in `client.ts` and confirm BOTH the SDK-constructor spy and the
     reservation spy assertions fail (they do — proven here). Then check the reverse: that the
     stub check still precedes the price check, so an offline environment cannot be made to
     throw where it used to return $0 vectors.
  2. **That no pin was deleted rather than extended.** One existing assertion was
     *rewritten* on purpose: `client.test.ts`'s "uses ASK_EMBED_MODEL when set" used to
     dispatch `text-embedding-3-large` and assert `provider: "openai:text-embedding-3-large"`.
     It is now a refusal test plus a same-name test on the priced default. Diff the
     assertions, not just the source, and confirm the coverage moved rather than vanished.
  3. **The ceiling can only rise.** Verify `EMBED_UNKNOWN_PRICE_PER_MTOK >= max(EMBED_PRICES_PER_MTOK)`
     is pinned, and that `estimateEmbedCostUsd` groups as `tokens * (price / 1e6)` — the
     grouping is what makes the default ceiling bit-identical to the old constant's value.
  4. **PR #57's read-only scan.** Insert a write verb into the script's code (not a comment)
     and confirm the scan fails; then confirm the comment-stripping cannot be used the other
     way (a write verb hidden in a block comment is genuinely inert, which is why the test
     strips comments before matching).
  5. **The isolation scan's new uniformity.** Add a bare SDK construction to any script and
     confirm it now fails — there is no longer a name-keyed exemption to hide behind.
- **Prompt rewrites the operator may want:** none for step 11 (this step is complete for the
  decision-free scope). If R3 is answered later, paste PLAN-WS-2 §4.3 as the PR list with the
  `answer-stream.ts:125` correction above.

## Proposed AGENTS.md changes (for step 25 — this step edits nothing in AGENTS.md)

1. **Architecture / directory map**, the `src/lib/llm/` entry (≈:96-99): it currently calls
   `pricing.ts` "the single analysis metering price table". After PR #59 it is also the
   embedding price authority. Proposed: "`pricing.ts` (the single metering price table:
   chat models for analysis + Ask, and `EMBED_PRICES_PER_MTOK` for the embedding path — an
   unpriced embedding model is refused before any reservation)".
2. **Standing ruling 4**, after the sentence "`pricing.ts` is the SINGLE price authority for
   analysis metering (the Ask registry parity-pins it)": add "— and, since 2026-09-06, for the
   embedding path too: `src/lib/embeddings/client.ts` refuses an `ASK_EMBED_MODEL` with no
   `EMBED_PRICES_PER_MTOK` row BEFORE `tryReserve()` and before the SDK client is built; Ask
   then degrades to lexical-only retrieval with zero reservations (ruling 9)."
3. **Quality/ops bullet**: unit-test count moves from 3,590/246 (2026-09-04) — note that other
   48-hour lanes are moving it concurrently, so step 25 should re-measure on the merged tree
   rather than copy a number from any single lane's report. This lane measured base
   3,723/255 → 3,750/257 with both its PRs merged.

### Proposed decision-log entry (draft for step 25)

> **2026-09-06 (WS-2.1 — Ask metering granularity: per-model attribution report, model-aware
> embedding pricing, two hygiene commits; branch/PR only)** Step 11 of the 48-hour program
> executed PLAN-WS-2 §4's decision-free scope in worktree `ws2-routing`. **PR #57** adds a pure
> `attributeAskUsage`/`attributionCoverage` module and a SELECT-only
> `scripts/ask-model-attribution.ts` that reports Ask spend per (UTC day, stage, model),
> computing the day in Postgres so no driver timestamp rendering is trusted, and stating that
> `retention.ts` redacts only `ask_usage.question` so the attribution window is unbounded. It
> surfaces two gaps rather than hiding them: `ask_usage` has no `embed_model` column, and
> legacy pre-v2 rows attribute nothing but `cost_usd`. It also lands HYG-44 (comment-only
> reconciliation of the `X_DAILY_USD_CAP` 1.5 default with the operator's live $4 cap; the
> default is deliberately not raised) and HYG-82/#100 (`scripts/ask-eval-harvest.ts` now builds
> its client through `analysisOpenAiClient()` with `maxRetries: 0`, and the hard-coded
> isolation exemption is deleted, so the scripts SDK scan has no name-keyed hole; the
> `--generate` pass still has no SpendGuard — decision R9). **PR #59** makes embedding pricing
> model-aware: `EMBED_PRICES_PER_MTOK` + a conservative ceiling-only fallback in `pricing.ts`,
> and a typed refusal of an unpriced `ASK_EMBED_MODEL` placed after the stub check and before
> both SDK construction and `tryReserve` (spy-pinned in both directions, mutation-proven);
> Ask degrades to lexical-only with zero reservations, the backfill script exits 2. The
> default model's ceiling and metering arithmetic are bit-identical to the constant they
> replace. **PR-2.1-3 (Auto scorecard gate) is HELD on R3 and PR-2.1-4 (attribution column) on
> R1**, both unanswered; §4.4's finding stands regardless — `provider_usage` is UNIQUE on
> `(provider, day)`, so a `model` column there would stamp only the last model of the day, and
> per-model rows would split `ASK_USD_CAP_DAILY`. OPEN-TASKS #44/#82/#100 status lines updated;
> #84 needs no code. Gates: typecheck/lint clean; unit 3,723/255 (base) → 3,735 (PR #57),
> 3,738 (PR #59), 3,750/257 both merged. Zero paid calls, zero database access, zero env
> changes, no migration, no deploy. Report:
> `docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md`.
