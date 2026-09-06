# PLAN-WS-2 — the per-stage model routing matrix (48-hour program, step 04)

Model gate: **Fable 5.1 / xhigh / plan mode** (planning only; no code, no tests, no registry edits,
$0, no database access). Prompt: `docs/prompts/2026-09-05-48h-04-plan-ws2-routing.md`. Worktree
`/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905`, step branch
`48h/ws2-routing-20260905-step04-plan-ws2`, base `origin/main` **`dff58f2`** (2026-09-06). The
prompt's reading list was verified against `883e5e3`; `883e5e3..dff58f2` touches 31 files, all under
`docs/prompts/`, and zero `src/`/`scripts/` files, so every code citation below is exact at both
commits. Where a DOC or TEST range moved, the corrected line is given and the move is noted.

This document is the specification steps 11, 12, 20 (+20b) and 22 execute from. Each PR is written
so a fresh Opus session can start cold: title, branch, files, signatures, refusal strings, tests,
acceptance, rulings, env/cap change, spend, hours. Operator decisions are LISTED (§15, Decisions
needed), never decided. Decisions already answered and folded in: **D2 = B** (Anthropic is in scope;
option C is provisionally yes but deferred beyond this round — the seam is designed so C is cheap
later; no C PR is planned), **R5** = branch `claude/local-model-ask-eval-20260817`.

PR identifiers used throughout: `PR-2.1-1..4`, `HYG-44`, `HYG-82`, `PR-2.2-1`, `PR-2.2-2`,
`PR-2.2-B1..B3`, `PR-2.3-1`, `PR-2.4-1..2`.

---

## 1. Goal and non-goals

**Goal.** After WS-2 the operator can set, per analysis stage, a `(provider, model, effort)` by
configuration alone, with fail-closed approval BEFORE any reservation or client construction,
per-provider metering rows, the provider stamped on every persisted dispatch identity, and evaluation
coverage that can produce the registry entry a non-OpenAI candidate needs. Concretely, this window
lands: the provider dimension on the routing seam (allowlist `{openai}` everywhere), an eval plane
whose offline results survive a future registry-version bump, Ask metering/gate parity (per-model
attribution, model-aware embedding pricing, the scorecard gate on the Auto money path), the Anthropic
digest provider wired THROUGH the seam (metered, identity-stamped, dormant until a registry approval
exists), a `--provider` flag and provider-qualified identity in the eval runner, the entity-audit
prompt extracted for future coverage, the #33 remap runbook with a $0 dry-run estimate against a local
`next start` bound to a disposable Neon branch, and the `--base-ack` guard on the remap driver.

**Non-goals (this window).** No candidate model is approved or activated; no `evaluated_candidate`
registry row; no `analysis-reg-v2` bump (planned only, §5.6); no Vercel environment change; no paid
call except a measured remap run under a SIGNED D7 entry; no option C PR (`<W>_BASE_URL`,
`openai_compatible`, the `$0` price class — §5.5 is a design note); no Ask-on-Anthropic (a second
`GenerationProvider`, INDEX §9); no migration (PR-2.1-4 is HELD on R1 and, as §4.4 shows, the column
shape as originally described does not attribute); the map activation lock predicate
(`src/lib/llm/model-config.ts:156-159`), `MAP_BASELINE` and the extractor-version basis
(`src/lib/analysis/map-prompts.ts:254-266`) are not edited by any PR; nothing under
`docs/evals/analysis/` changes.

---

## 2. Current state (re-verified at `dff58f2`)

### 2.1 Routing seam, registry, pricing, client factory

- `src/lib/llm/model-config.ts` — private `WORKLOAD_ENV` :52-58 (two env names per workload:
  `<W>_MODEL`, `<W>_REASONING_EFFORT`; no provider); `resolveWorkloadModel` :130-185 with the fixed
  refusal order invalid effort :152 → effort on a non-reasoning model :154 → **map lock :156-163**
  (predicate :156-159, message :163) → unpriced :164 → unapproved :166; `registryVersion` stamps
  :182, :213, :237; `AnalysisDispatchIdentity` :224-230 = `{workload, model, reasoningEffort,
  registryVersion, approval}` — **no provider field**; `dispatchIdentity` :232-240;
  `REASONING_MODEL = /^(gpt-5|o\d)/` :65 is a MODEL-NAME regex used as a capability probe;
  `modelSource` literal `"openai_model"` :92; `MAP_BASELINE` :78; `ModelConfigError` :116-125;
  `workloadDispatchConfig` :203-215; `analysisChatParams` :252-270 (structurally typed via `Pick`).
- `src/lib/llm/analysis-registry.ts` — `AnalysisApproval` :39-50 keyed `(workload, model)` with
  `allowedEfforts` membership; finder `analysisApproval` :119-139 (verdict type :112-115); five
  baseline rows :54-110 (all gpt-4o-mini / `[null]` / `baseline`); literal
  `ANALYSIS_ROUTING_REGISTRY_VERSION = "analysis-reg-v1"` :35. Pins: `analysis-registry.test.ts:19-28`
  (cardinality `toHaveLength(ANALYSIS_WORKLOADS.length)`, model/effort/status per row) and :50 (literal).
- `src/lib/llm/pricing.ts` — exports exactly `PRICES_PER_MTOK` :17-23 (five OpenAI rows, BARE model
  key) and `estimateCostUsd` :25-31 ($5/$15 unknown fallback :30). No comment mentions local/unpriced
  models; the "unpriced fails closed" doctrine lives in `model-config.ts:24-31` and is enforced at
  `model-config.ts:138` and `live-runner.ts:137`. The Ask registry parity test
  (`src/lib/ask/registry.test.ts:5-12`) iterates `MODEL_REGISTRY` only, so new rows in
  `PRICES_PER_MTOK` do NOT break it (read directly — one explorer's warning to the contrary was wrong).
- `src/lib/analysis/openai-client.ts:19-20` — `analysisOpenAiClient(): OpenAI`, no parameters,
  `new OpenAI({ maxRetries: 0 })`. `openai-client.test.ts` source scan is **:30-61** (cited :35-60):
  module list :35-42 (map-worker, synthesize, openai-provider, llm-match, live-runner, entity-audit
  route), three literal scans :44-55, factory source pin :57-60. Exact ctor-args pin
  `llm-match-guard.test.ts:120` (`{ maxRetries: 0 }`). `OPENAI_BASE_URL` is read by NO production
  code; its only in-tree use is `src/integration/map-batch-error-classification.itest.ts:11,39,83`
  (the unroutable-sink pattern, `http://127.0.0.1:9`).

### 2.2 Identity stamps and the `openai:` string tags

- Every production stamp goes through `dispatchIdentity()`: `map-worker.ts:868`
  (`cron_runs.counts.dispatch`), `synthesize.ts:701` (`digests.structured.stats.reduce.dispatch`),
  `openai-provider.ts:258` → `digest.ts:218` (`structured.stats.llmDispatch`),
  `llm-match.ts:271,306,316` (decl :46-48) → `validation/run.ts:246` (`validation_runs.details.dispatch`),
  `entity-audit/route.ts:127` (`cron_runs.counts.dispatch`). `quality-funnel.ts:474-475` reads the
  object opaquely with a string sentinel (`"pre-hardening baseline"` :449).
- `openai:` STRING writers: `openai-provider.ts:147` (a construction-time field, `digests.provider`),
  `synthesize.ts:437-449` `mapreduceProviderTag()` (`openai:<map>+mapreduce[+reduce=<r>]`),
  `embeddings/client.ts:144`, `ask/answer.ts:223,638,641,645,722,729,735`; `schema.ts:615` documents
  `ask_usage.provider` as `openai:<model>|stub|none|error`. The ONE non-test parser is
  `ask/limits.ts:733` `payload.provider.startsWith("openai")` (colonless; gates the durable Ask cache).
  `ask/eval-run.ts:209` `DEGRADED_PROVIDERS = new Set(["stub","budget"])` is exact-match.
- Exact-shape pins that break when `provider` is added to the identity: `model-config.test.ts:368-374`,
  `llm-match-guard.test.ts:112-118`, `openai-provider.test.ts:91-97` (`toEqual`); config literals
  `map-worker-spend.test.ts:16-23`, `map-request-wellformed.test.ts:74-81` (compile error on a new
  required field); env save/restore lists `model-config.test.ts:18-28`, `llm-match-guard.test.ts:63-74`.
  `OpenAiProvider.name` is pinned as the STRING `"openai:gpt-4o-mini"` at `openai-provider.test.ts:90,141`.
- Refusal ordering at the five sites (config → client → reserve): reduce `synthesize.ts:604/:649/:466,497`;
  map `map-worker.ts:863/:874/:1033`; digest `openai-provider.ts:164/:165/:207`; validation
  `llm-match.ts:263/:270/:288,309` (the only site that CATCHES `ModelConfigError` and degrades,
  :261-271); entity_audit `route.ts:66/:109/:78` (reserves BEFORE the client; 503 on config error :68-70).

### 2.3 Eval plane

- `src/lib/evals/live-runner.ts` — `LiveEvalWorkload` :92 = map|digest|validation;
  `evalDispatchConfig(workload, model, effort)` :126-165 duplicates the ladder (regex mirror :114,
  price :137, effort :146, approval :154) and bypasses the map lock by design; preflight :191-301
  (key :250, caps :253-258, `LLM_DISABLE` :198, stub :201, db-ack :207-223, prod-host :230-249);
  `liveIdentity` :303-317 with the LITERAL `provider: "openai"` :308; call order preflight :259 →
  identity :303 → client + guard `buildLiveDeps` :899-910 → `tryReserve` :404 → fetch :412-424/:473 →
  `record` :501 (before parse). `EVAL_PROVIDER = "openai_eval"` (`eval-guard.ts:16`).
- `src/lib/evals/runner.ts` — `offlineIdentity` :331-342 (`provider: "stub"`, `model:
  "offline-fixtures"`, stamps the constant :336); `resumeIdentityMismatch` :489-520 compares 13
  scalars + knobs (`provider` :504, `registryVersion` :506); `headerIsLive = provider !== "stub"`
  :184-186; `comparableKnobs` :171-180; resume NEVER rewrites a header (`mergeResults` :555-593
  spreads `existing`; the CLI persists only after a completed case, `scripts/analysis-eval.ts:493,734`).
- `src/lib/evals/contracts.ts:436` `CandidateDispatchIdentity.provider: "openai" | "stub"`;
  `EvalEnvKnobs` :597-613; `EvalResultsFile` :614-674. `contracts.test.ts` :7-13 is the import tail;
  the dataset allowlists are :11-26 (no `entity_audit` key).
- `scripts/analysis-eval.ts` — no `--provider` flag (full table verified: workload, repetitions,
  only, conflict, execute-live, single-round-diagnostic, allow-heldout-raw-capture, fresh, fresh-ack,
  dev, profile, capacity, validation-votes, capacity-matrix, model, validate-dataset, estimate,
  report, out, show-heldout-detail, capture-inspect, show-raw, capture-reconcile, effort, db-ack,
  allow-heldout-rerun); configKey = `<model>[@effort][+<profile>][+votesN]` assembled :315-329
  (`liveConfigKey` `runner.ts:344-346`, profile suffix `capacity-profiles.ts:117-119`, votes suffix
  `runner.ts:146-148`); the `live-` prefix is decided ONLY by `configKey.startsWith("offline-fixtures")`
  :273-278; report discovery :528-530, pairing strips `/\+votes\d+$/` then `lastIndexOf("+")` :560-568;
  live banner :859-864 prints no provider.
- `hardening-cli.test.ts:192-206` runs `--offline --workload validation` and `--offline --profile
  conflict` against three COMMITTED results files and asserts byte-identity + no `REFUSED|identity
  changed`. `isolation.test.ts`: production no-bypass list :19-25; `:52,61,68,106,118,146` rules
  (**:68 forbids any script other than the eval CLI from importing `src/lib/evals/*`**); the
  `ask-eval-harvest.ts` exemption is **:137-143** (cited :137-141; the `continue` is :141).
- `analysis-reg-v1` inventory: ONE definition (`analysis-registry.ts:35`) + ten test literals
  (`analysis-registry.test.ts:50`; `model-config.test.ts:296,372`; `map-request-wellformed.test.ts:80`;
  `map-worker-spend.test.ts:22`; `openai-provider.test.ts:95`; `llm-match-guard.test.ts:116`;
  `capture.test.ts:67`; `live-runner.test.ts:152`; `live-sweep.test.ts:491`) + one comment
  (`live-runner.test.ts:106`); live docs `docs/CURRENT-STATE.md:314`, `docs/OPEN-TASKS.md:176,826`
  (`:771` and every `docs/reviews/*` hit are historical records); 18 files / 37 hits under
  `docs/evals/analysis/` (COUNTS only — 12 committed offline results files carry it once each; zero
  committed `live-*` files, they are gitignored).

### 2.4 Spend guard and metering rows

- `src/lib/usage/llm-guard.ts` — row constants `DIGEST_PROVIDER = "openai_digest"` :11,
  `ENTITY_AUDIT_PROVIDER = "openai_entity_audit"` :16, `MAP_PROVIDER = "openai_map"` :22,
  `REDUCE_PROVIDER = "openai_reduce"` :194, `ASK_PROVIDER = "openai_ask"` :239; factories
  `openAiGuard` :105-117, `digestGuardFromEnv` :120-126, `entityAuditGuardFromEnv` :130-136 (**draws
  on the SAME `LLM_DIGEST_USD_CAP` daily envelope as the digest row — the two-rows/one-envelope
  precedent**), `mapGuardFromEnv` :177-188, `reduceGuardFromEnv` :215-226, `askGuardFromEnv` :256-267;
  `LlmDisabledError` :36-43, `assertLlmEnabled` :67-69. Others: `EMBED_PROVIDER = "openai_embed"`
  (`embeddings/guard.ts:12`, factory :33), `EVAL_PROVIDER = "openai_eval"` (`eval-guard.ts:16`, :18-30,
  strict fail-closed everywhere), validation writes the inline literal `"llm_match"` (`llm-match.ts:227`).
- `src/lib/usage/spend-guard.ts` — `tryReserve` :108-158: `cap_unset` :113, `daily_usd_unset` :116
  (fires whenever `dailyUsdCap` is null, even in request-cap-only mode), `not_initialized`, then
  threshold checks (`>=`), `dailyUsdCap` 0 refuses at :136; `record(requests, units, usd)` :161-166
  and `UsageStore.record(provider, day, requests, units, usd)` :54-60 — **no model tag**;
  `pgUsageStore.load` :212-236 sums `WHERE provider = $1` (exact equality — every row gets its OWN
  daily and total envelope); upsert :237-248; `envCap` :259-265 treats ≤0 as unset.
- `src/db/schema.ts` `provider_usage` :850-862 (`id, provider, day, requests, units, est_usd,
  updated_at`, UNIQUE `(provider, day)`; migration `drizzle/0008_famous_maria_hill.sql:7-17`);
  `provider_usage_reservations` :761-781 (per `run_id, stage, attempt`; no model column either).

### 2.5 Anthropic seam (step 09 hardens it in parallel; this plan builds on top)

- `src/lib/analysis/provider.ts:76-96` `getProvider()` selects `AnthropicProvider` on
  `ANALYSIS_PROVIDER=anthropic` + key (:82-85) or on key presence when `OPENAI_API_KEY` is absent
  (:90-93); `AnalysisProvider` interface :66-74; `DigestAnalysis.dispatch?` :37-45 ("the Anthropic
  seam is a separately-blocked follow-up, so both omit it"); `AnalyzeOptions.onUsage` :63. One caller:
  `src/lib/analysis/digest.ts:149`; it passes `{systemPrompt, track, onUsage}` :160-164, retries the
  ladder only when the thrown message `includes("truncated")` :171, and reads `events` :183-192,
  `dispatch` :218, `provider` :231.
- `src/lib/analysis/anthropic-provider.ts` — module-load `MODEL` :17; `name = anthropic:${MODEL}`
  :54; inline `opts` type :60 (cannot receive `onUsage`); **`assertLlmEnabled("anthropic digest
  extract")` :62 ALREADY EXISTS** (step 09's prompt says no `LLM_DISABLE` check exists — step 09
  should PIN it, not add it); raw `.slice(0, 400)` :63-72 (:70); raw fetch + `ANTHROPIC_API_KEY!` :78-113
  (:82); unmetered 429 retry :102-105; no `tryReserve`/`record`/`workloadDispatchConfig`/`dispatch`.
  No `@anthropic-ai/sdk` in `package.json`; `matcher-import-hygiene.test.ts:36` and
  `backtest-matrix.test.ts:79` BAN that import. `docs/SETUP-NEXT-WEEK.md:29-31` still tells the
  operator to put the key in prod (contradicts OPEN-TASKS #83; step 09's prompt owns the fix).
- Ask's vector arm is disabled whenever `OPENAI_API_KEY` is absent (`retrieve-v2.ts:46`): an
  Anthropic-only environment runs Ask lexical-only. Ask stays OpenAI-only in this plan.

### 2.6 Ask and embeddings

- `src/lib/ask/router.ts:65-126` — `autoPolicy()` :73-84 never calls `hasScorecard`; an env override
  is only LABELLED `auto_env_override` :84; fast/deep consult it at :103,106,115,118 and cannot serve
  today. `hasScorecard` = `src/lib/ask/registry.ts:73-76`; `MODEL_REGISTRY` :31-66 (gpt-5 suite
  `v2-k60`; gpt-5-mini `v2-k60-rerank`; nano/4o-mini/4o none; no embedding model). `ASK_ROUTER`
  default off (`config.ts:101-103`), recording-only at `limits.ts:445-451`.
- Money path resolves the model BEFORE reserving: `answer.ts:573` (`askAnswerModel()`) → guard :687 →
  reserve inside `openaiGeneration.generate` (`src/lib/llm/openai.ts:45-46`); streaming twin
  `answer-stream.ts:125`; `rerank.ts:204` → guard :210; embed: guard `init()` `retrieve-v2.ts:133-134`,
  `embedModel()` read at `embeddings/client.ts:131`, SDK constructed `llm/openai.ts:142`, reserve :160.
  `retrieve-v2.ts:160-167` catches ANY vector-arm throw → `retrievalMode "v2-lexical-only"` :221.
- `ask_usage` (`schema.ts:609-663`) has `rerank_model`, `answer_model` and per-stage token/cost
  columns but **no `embed_model`**; INSERT `limits.ts:282-298`; `retention.ts:13,81` redacts only
  `question` — attribution over `ask_usage` is unbounded in time. `run-guards.ts:86-99` rerank +
  answer share `openai_ask`; :48-50 `embedCeilingUsd()` is a flat constant; :39-46 answer/rerank
  ceilings are model-aware via `estimateCostUsd`.
- `src/lib/embeddings/client.ts:15-45` — `EMBED_USD_PER_1M_TOKENS = 0.02` (:24, verified 2026-07-11
  for `text-embedding-3-small` only), `embedModel()` :37-40 accepts ANY non-blank string,
  `embedCostUsd(tokens)` model-blind :43-45; consumers :131-144 (`costPerToken: EMBED_USD_PER_TOKEN`
  :140), `llm/openai.ts:180-185`, `ask/run-guards.ts:49`, `scripts/backfill-embeddings.ts:74,83`;
  `client.test.ts:100-112` pins the 3-large model swap (provider string) but nothing about cost.

### 2.7 Hygiene items

- #44: `src/lib/adapters/x-api.ts:201,223` `envNum("X_DAILY_USD_CAP", 1.5)` — `envNum`, NOT `envCap`,
  so the X daily cap can never fail closed; production has `X_DAILY_USD_CAP=4` since 2026-09-03
  (#101). #44's own cite `x-api.ts:166` is stale (:165-166 is now a theater-routing comment).
- #82 / #100: `scripts/ask-eval-harvest.ts:189-190` (`await import("openai")`, bare `new OpenAI()`)
  IS on `main`; `isolation.test.ts:137-143` exempts it by filename. #100's "lives on the parked
  branch" premise is wrong (PR #49 already corrects the header); #82 and #100 are one defect.
- #84: nothing to code — PR #51's `docs/RELEASE-CHECKLIST.md` step 6 owns the record at the next deploy.

### 2.8 Remap, map route, fork pattern

- `scripts/map-remap.ts` — header :1-30 (PR #50, open, rewords :3-6); **the estimate is the DEFAULT
  mode** (no `--execute` → print and exit); flags (`main()` :616-658): `--theater` (required),
  `--track`, `--from` (default 2026-07-04), `--to`, `--budget` (required with `--execute`), `--cap`,
  `--limit`, `--state`, `--wait-daily`, `--execute`. **There is no `--estimate`, `--resume`,
  `--dry-run` or `--base` flag** (the `:168` comment mentioning `--base` is stale); target
  `MAP_BACKFILL_BASE ?? "https://bnow-net.vercel.app"` :641 (env only); checkpoint
  `data/remap-state/<key>.json` :639 (key :298) bound to `remapTargetId(base)` :158-171; the
  cited `:46-51` is the SHARED-DAILY-ENVELOPE caveat, not a dispatch site — the driver never calls
  `workloadDispatchConfig`; dispatch happens server-side (:22-27 says so). Request params :297,326,457
  (`remap=1&theater=&track=`, `date=&dry=1&cap=20000`, `after=&cap=`); capability handshake :327-337
  (refuses without `maxSelectedId`).
- `src/app/api/cron/map/route.ts` — `Bearer CRON_SECRET` :58-62; params :63-88 (`date`, `theater`,
  `cap`, `dry=1`, `remap=1`, `after`, `track`; `after/track` require `remap=1` :85-87); dry runs
  return BEFORE `withCronRun` :97-100 (nothing written, not even `cron_runs`); non-dry remap = job
  `map:remap` :104.
- `src/lib/analysis/map-worker.ts` — remap eligibility :582-601 (dispositioned docs only:
  `processed = true OR EXISTS doc_map_state`, `NOT EXISTS doc_dedup`) + in-app current-version
  anti-join :761-799 → **zero pending under the baseline**; dry block :822-856 computes
  `estPromptTokens/estCompletionTokens/estUsd/estModel/estEffort/estDispatchBlocked/remapVersions`
  with the NON-throwing `resolveWorkloadModel` :840 and returns BEFORE `assertLlmEnabled` :857 and
  `workloadDispatchConfig` :863 — **a dry estimate needs only `DATABASE_URL` + `CRON_SECRET`;
  `OPENAI_API_KEY=""` and `LLM_DISABLE=1` are the required posture and do not block it.**
- `src/lib/analysis/map-prompts.ts` — `mapContentChars()` :23-26 reads `MAP_CONTENT_CHARS` (floor
  200, default 1500); `mapExtractorVersion` :254-266 basis = model + system prompt + `frame=` +
  `content=${mapContentChars()}` (+ `effort=` when set) → `${model}:${hash12}`; the four literals are
  pinned at `map-prompts.test.ts:212-227` AFTER deleting `MAP_CONTENT_CHARS` from the env (:219-220).
- `src/lib/analysis/map-versions.ts` exports `VersionPair` :13, `currentVersionPairs` :20,
  `currentVersion` :32, `versionFilterSql` :41.
- Fork pattern: `src/integration/authz-page-gate.itest.ts` `serverEnv()` :149-163 (blanks the six
  `PAID_KEYS` :48-56 incl. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `POSTMARK_SERVER_TOKEN`; sets
  `LLM_DISABLE=1`, `DATABASE_URL`=fork, `NODE_ENV=production`), `next build` then `next start -p 3132`
  with a 90 s `/health` loop :338-370, `assertPortFree` :165-181; `scripts/neon-branch.ts`
  `create|delete` (:1-6, output `{branchId, connectionString}` :47); `scripts/test-integration.sh`.
- R5 branch `origin/claude/local-model-ask-eval-20260817` = one commit `8a0ca89` (26 files,
  +4314/−15): an `OPENAI_BASE_URL` knob on the ASK client `src/lib/llm/openai.ts` (NOT the analysis
  factory), an `ASK_RAW_CAPTURE_PATH` capture, `scripts/ask-eval.ts --offline-fidelity` with an
  in-memory always-admit guard, tests `openai.test.ts` + `local-fixtures.test.ts`. PR #47 (open)
  lands its DOCS only (`docs/designs/LOCAL-MODEL-ASK-EVAL-2026-08-17.md`, scorecard, fixtures, raw
  captures). Its `OPENAI_BASE_URL` override is superseded by the per-stage `<W>_BASE_URL` design (§5.5).

### 2.9 Governance in flight (affects rebases, not design)

PRs #49 (step 01), #50 (step 02), #51 (step 03) are open and merge first at CP1. #49 corrects
`docs/OPEN-TASKS.md` headers (#89, #92, #100, #102, #103 — line numbers below will shift after merge;
cite by item number) and its `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md:70-76` D2 entry
records the operator's "B" answer verbatim. #50 rewords the remap/backfill driver headers. #51 adds
`docs/RELEASE-CHECKLIST.md` (step 6 = the #84 headroom record). Step 09 has NOT pushed a branch yet.
`.env.local` does not exist in this worktree (only in the main checkout): steps 11/20/22 copy it
deliberately, and until step 09 merges every local run that blanks `OPENAI_API_KEY` must also blank
`ANTHROPIC_API_KEY` (COMMON §4.8).

---

## 3. Sequencing and dependency graph

```
 step 09 (ws2-provider)  anthropic seam hardening ─────────┐
                                                           ▼
 step 12 (ws2-provider)  PR-2.2-1 provider dimension → PR-2.2-2 eval identity decouple
                                                           │
 step 11 (ws2-routing)   PR-2.1-1 → PR-2.1-2 → PR-2.1-3 (+HYG-44, HYG-82)   [needs 09 merged; independent of 12]
 step 22 (ws2-remap)     PR-2.3-1 + runbook + $0 estimate  [needs PR #50 merged; independent of 12; measured run only on SIGNED D7]
                                                           │
 step 17 audit ──────────────────────────────── releases 12 ▼
 step 20 (ws2-routing)   PR-2.4-1 → PR-2.4-2, then 20b: PR-2.2-B1 → PR-2.2-B2 → PR-2.2-B3
```

- Every PR in the window: **zero Vercel env change, zero paid calls, no migration**. The only spend
  candidate in WS-2 is the measured remap run (D7), on a fork's own ledger.
- If D2 had been A: skip 20b entirely — PR-2.2-1/2 leave the seam ready (the whole activation surface
  for a later B is an allowlist edit + a price row + a registry entry).
- The `analysis-reg-v2` bump (§5.6) is outside the window: it lands with the first non-OpenAI
  approval PR.

---

## 4. WS-2.1 — Ask metering granularity + gate parity (step 11, worktree `ws2-routing`)

### 4.1 PR-2.1-1 `ask: per-model attribution report over ask_usage (read-only)` — R1 shape (a)

- Branch `48h/ws2-routing-20260905-ask-attribution-report`.
- Files: NEW `src/lib/ask/attribution.ts` (pure), NEW `src/lib/ask/attribution.test.ts`, NEW
  `scripts/ask-model-attribution.ts`.
- Shape:
  ```ts
  // src/lib/ask/attribution.ts — pure, no I/O
  export interface AskUsageAttributionRow {
    day: string; stage: "rerank" | "answer" | "embed"; model: string | null;
    runs: number; promptTokens: number; completionTokens: number; costUsd: number;
  }
  export function attributeAskUsage(rows: AskUsageRowSlice[]): AskUsageAttributionRow[];
  // scripts/ask-model-attribution.ts  --since YYYY-MM-DD (default: 30 days)
  //   SELECT created_at, rerank_model, answer_model, rerank_prompt_tokens, rerank_completion_tokens,
  //          rerank_cost_usd, answer_prompt_tokens, answer_completion_tokens, answer_cost_usd,
  //          embed_tokens, embed_cost_usd FROM ask_usage WHERE created_at >= $1
  ```
  Embed rows carry `model: null` and print as `embed (model column absent — ask_usage has no
  embed_model; see §4.4 / R1)`. The header states that `retention.ts:81` redacts only `question`, so
  the attribution window is unbounded.
- Tests: fixture rows across two UTC days × two answer models aggregate to exact per-(day, stage,
  model) sums; null models bucket as `null`; a source-scan pin that the script contains no
  `INSERT|UPDATE|DELETE|CREATE|ALTER` token outside comments and never imports `openai` (the
  `isolation.test.ts:137-143` scripts scan already enforces the SDK ban for every `scripts/*.ts`).
- Acceptance: `npx tsx scripts/ask-model-attribution.ts --since 2026-08-01` against a disposable fork
  prints per-day × stage × model totals; unit + source-scan green; zero writes; no env; no migration; $0.
- Rulings: 8 and 9 untouched (read-only). ~1.0 h. Step 17: mutate an `UPDATE` into code (not a
  comment) — the scan must fail.

### 4.2 PR-2.1-2 `embeddings: model-aware pricing; unpriced embed model refused before reservation`

- Branch `48h/ws2-routing-20260905-embed-pricing`.
- Files: `src/lib/llm/pricing.ts`, `src/lib/embeddings/client.ts`, `src/lib/ask/run-guards.ts`,
  `scripts/backfill-embeddings.ts`, `.env.example` (comment on `ASK_EMBED_MODEL`), tests NEW
  `src/lib/llm/pricing.test.ts`, `src/lib/embeddings/client.test.ts`, `src/lib/ask/retrieve-v2.test.ts`,
  `src/lib/ask/run-guards.test.ts` (if present, else add).
- Signatures:
  ```ts
  // pricing.ts (+) — a SEPARATE table: embeddings have no output price
  export const EMBED_PRICES_PER_MTOK: Record<string, number> = { "text-embedding-3-small": 0.02 }; // verified 2026-07-11
  export const EMBED_UNKNOWN_PRICE_PER_MTOK = 0.13;  // ≥ every entry (pinned) — metering backstop only, never authorization
  export function embedPriced(model: string): boolean;
  export function estimateEmbedCostUsd(model: string, tokens: number): number;
  // embeddings/client.ts
  export class EmbedModelUnpricedError extends Error { readonly code = "EMBED_MODEL_UNPRICED" }
  export function embedCostUsd(tokens: number, model = embedModel()): number;   // 3-small byte-identical
  export const EMBED_USD_PER_TOKEN = EMBED_PRICES_PER_MTOK["text-embedding-3-small"] / 1e6; // compatibility export
  ```
- Refusal — in `embedTexts` (`client.ts:131`) AFTER the stub check (`embedStubReason`, so an offline
  environment still returns stub vectors at $0 exactly as today) and BEFORE `openaiEmbedBatches`
  (which constructs the SDK at `llm/openai.ts:142` and reserves at :160):
  `embeddings: ASK_EMBED_MODEL="<model>" has no entry in EMBED_PRICES_PER_MTOK (src/lib/llm/pricing.ts) — refusing to dispatch unpriced`
  `costPerToken` passed to `openaiEmbedBatches` becomes `EMBED_PRICES_PER_MTOK[model] / 1e6`;
  `run-guards.ts:49` → `EMBED_INPUT_EST_TOKENS * (embedPriced(m) ? price : EMBED_UNKNOWN) / 1e6`;
  `backfill-embeddings.ts:74,83` read `estimateEmbedCostUsd(model, estTokens)` and exit non-zero on
  the typed error (the script already refuses stub reasons at :92).
- Ruling-9 degradation (verified): `retrieve-v2.ts:160-167` catches any vector-arm throw and returns
  `scored: false` → `mode = "v2-lexical-only"` :221; the embed guard's `init()` :134 ran (one DB read)
  but NO `tryReserve` — Ask degrades to lexical-only with zero reservations and a console warning.
- Tests: `pricing.test.ts` — every `EMBED_PRICES_PER_MTOK` value ≤ `EMBED_UNKNOWN_PRICE_PER_MTOK`;
  `estimateEmbedCostUsd("text-embedding-3-small", n) === n * 0.02 / 1e6` to 1e-12 for n ∈ {1, 77,
  12_345} (byte-parity vs the old constant). `client.test.ts` — `ASK_EMBED_MODEL=text-embedding-3-large`
  → `embedTexts` rejects `EmbedModelUnpricedError`, the `openai` ctor spy never called, `tryReserve`
  spy never called (**the existing :100-112 pin asserting `provider: "openai:text-embedding-3-large"`
  is REWRITTEN to this refusal** — 3-large has no operator-verified price; adding one is decision R8);
  default path byte-identical (`provider: "openai:text-embedding-3-small"`, cost unchanged).
  `retrieve-v2.test.ts` — unpriced model → `retrievalMode: "v2-lexical-only"`, embed `tryReserve`
  count 0. `run-guards` — `embedCeilingUsd()` unchanged for the default model; ≥ old value for an
  unknown model.
- Acceptance: `git grep -n EMBED_USD_PER_TOKEN` shows only the compatibility export and its consumers;
  counts; no env change (the env var already exists; a new price row later is a code PR with the
  operator-verified price in its body); no migration; $0.
- Rulings: 4 (refusal precedes reservation AND SDK construction — spy-pinned), 8 (metering stays
  inside `openaiEmbedBatches`), 9 (Ask degrades to lexical-only; the backfill script fails loudly).
  ~1.5 h. Step 17: move the price check after `openaiEmbedBatches` — both spy pins must fail.

### 4.3 PR-2.1-3 (R3) `ask: scorecard gate on the Auto money path (degrade, never throw)`

- Branch `48h/ws2-routing-20260905-ask-auto-scorecard-gate`.
- Files: `src/lib/ask/answer.ts`, `src/lib/ask/answer-stream.ts` (the streaming twin at :125),
  `src/lib/ask/rerank.ts`, `src/lib/ask/router.ts`, `src/db/schema.ts` (:615 comment only),
  `src/lib/ask/eval-run.ts:209` (`DEGRADED_PROVIDERS` gains the new tag), tests.
- Gate placement — after model resolution, before any guard: `answer.ts:573` →
  `if (!hasScorecard(model, "v2-k60")) { const det = deterministicAnswer(...); return assembleV2(…,
  "unscorecarded", "answered", undefined, undefined, currency); }`; `rerank.ts:204` →
  `if (!hasScorecard(model, "v2-k60-rerank")) return compositeFallback(candidates, k);`. Suites per
  `registry.ts:31-66`.
- Resulting `ask_usage` values with `ASK_ANSWER_MODEL=gpt-5-nano`: `provider = "unscorecarded"` (a
  NEW literal — not `"stub"`, which would be indistinguishable from offline; precedent: the budget path
  writes `"budget"` at `answer.ts:651,753`), `state = "answered"`, `answer_model = NULL`,
  `answer_cost_usd = 0`; the cache gate at `limits.ts:733` (`startsWith("openai")`) correctly never
  caches it. Unscorecarded rerank: `rerank_used = false`, `rerank_model = NULL` (`limits.ts:309`
  writes `r.rerankModel ?? null`; `compositeFallback` :161-168 returns `rerankUsed: false`).
- Router: keep `ASK_ROUTER` telemetry-only; `autoPolicy()` (:73-84) gains reason
  `"auto_scorecard_missing"` when `!hasScorecard(answerModel, "v2-k60")`, so `route_policy` records
  the gate when the flag is on. No behaviour flows from the router.
- Tests: `ask.test.ts` — no env override: reservation count, `provider` string and `state` identical
  to today's pins (`ask.test.ts:915` `startsWith("openai:")` stays green); `ASK_ANSWER_MODEL=gpt-5-nano`
  → deterministic answer, `tryReserve` never called on the answer guard, `provider === "unscorecarded"`;
  `rerank.test.ts` — `ASK_RERANK_MODEL=gpt-5-nano` → `compositeFallback` shape, zero `generate`
  calls; `router.test.ts` — reason `auto_scorecard_missing`; `eval-run.test.ts` — `"unscorecarded"`
  classed degraded; `answer-stream` twin gated (pin).
- Acceptance: production behaviour byte-identical with no env override (pin); counts; no env; no
  migration; $0. Rulings: 4 (no reservation on the gated path), 9 (/ask degrades; nothing throws), 20
  untouched. ~1.5 h. Step 17: delete the answer gate → the nano pin must fail; confirm
  `answer-stream.ts` carries the same gate.

### 4.4 PR-2.1-4 (R1 column shape) — HELD; and why the column, as described, does not attribute

Only if R1 chooses a column. **Finding:** `provider_usage` is UNIQUE on `(provider, day)` and
`record()` upserts one row per provider-day (`spend-guard.ts:237-248`), so a nullable `model` column
there can only stamp the LAST model of the day — it is misleading, not attribution. Honest per-model
attribution needs either (i) the read-only report (§4.1), (ii) a `model` column on
`provider_usage_reservations` (`schema.ts:761-781`, already per `run_id/stage/attempt`; enforce-mode
only), or (iii) a sibling table `provider_usage_models (provider, day, model)` with its own UNIQUE —
either (ii)/(iii) is migration 0031, forward-only, cap semantics unchanged (the daily cap still
aggregates the `provider_usage` row), `migrations.test.ts` additive pin, `ask-runs.itest.ts` +
`migrations.itest.ts` on a fork, `9999` still last. **Per-model ROWS (`openai_ask:<model>`) = STOP:**
`load()` compares per row by exact equality, so each row would get its own full `ASK_USD_CAP_DAILY`
envelope (silently multiplying the budget) unless prefix aggregation is added to `load()`, and new
cap envs would have to exist in ALL Vercel envs first (ruling 4) — list it, do not build it.
Recommendation for R1: (a) the report; revisit after eval step 4.

### 4.5 Hygiene commits (one commit each, on the PR-2.1-1 branch)

- **HYG-44** `ingest: reconcile X_DAILY_USD_CAP default comment with the $4 production cap` —
  comment-only at `x-api.ts:201,223`; OPEN-TASKS #44's stale `:166` cite corrected to `:201,:223`.
  Raising the code default changes behaviour for any env with the var unset — NOT done. The
  `envNum` (fail-open) vs `envCap` (fail-closed, every LLM guard) asymmetry is decision **R10**.
- **#84** — nothing to code. PR #51's `docs/RELEASE-CHECKLIST.md` step 6 owns it; the record lands at
  the next deploy (step 27) and closes #84.
- **HYG-82** `scripts: route ask-eval-harvest through the guarded analysis client; drop the isolation
  exemption` (#82 + #100) — replace `:189-190` with
  `const { analysisOpenAiClient } = await import("../src/lib/analysis/openai-client"); const client = analysisOpenAiClient();`
  and delete `isolation.test.ts:141`. Verified the scans then PASS (:119-131 bans `new OpenAI(`,
  value-imports and dynamic loads of `openai` only; `analysisOpenAiClient` is banned only inside
  `lib/evals/*` :146-156). **The `--generate` loop (:160-280, one `create` at :213) still has no
  `SpendGuard`;** wiring reserve → create → record is ~25 lines, but the row is decision **R9**:
  `isolation.test.ts:68` forbids any script other than the eval CLI from importing `src/lib/evals/*`,
  so `evalGuardFromEnv()` / `openai_eval` is NOT available here; options are `askGuardFromEnv()`
  (`openai_ask` — pollutes the product ledger), a new `openai_ask_eval` row on a LOCAL-ONLY
  `ASK_EVAL_USD_CAP_DAILY` (fails closed until the operator sets it in `.env.local`; the script never
  runs on Vercel, so ruling 4's all-envs ordering is moot but must be stated), or "operator-only
  tooling, no guard". Recommendation: factory swap + exemption removal in this window (closes #82's
  retry concern and #100's untracked exemption); the guard as a follow-up under the second option.

---

## 5. WS-2.2 — Provider abstraction (step 12 core in `ws2-provider`; 20b option B in `ws2-routing`)

### 5.1 PR-2.2-1 `llm: provider dimension on analysis dispatch (allowlist openai; unapproved provider refused before reservation)` — option-independent

- Branch `48h/ws2-provider-20260905-provider-dimension`. Env change: none. Migration: none. $0.
  ~4–5 h.
- Files: NEW `src/lib/llm/providers.ts`; `src/lib/llm/model-config.ts`;
  `src/lib/llm/analysis-registry.ts`; `src/lib/llm/pricing.ts`; `src/lib/evals/live-runner.ts` (one
  call-site argument); `scripts/model-routing-inspect.ts`; `.env.example`; `src/lib/usage/llm-guard.ts`
  (comment only); `src/lib/llm/import-graph.test.ts`; `src/lib/analysis/openai-client.test.ts`; the
  tests listed below; `docs/OPEN-TASKS.md` (#83 status line only).
- `src/lib/llm/providers.ts` (new; imported by pricing, model-config, registry and live-runner
  without a cycle; `AnalysisWorkload` moves here and is re-exported from `model-config.ts` so every
  existing import keeps working):
  ```ts
  export const ANALYSIS_PROVIDER_IDS = ["openai", "anthropic", "openai_compatible"] as const;
  export type AnalysisProviderId = (typeof ANALYSIS_PROVIDER_IDS)[number];
  export const ANALYSIS_DEFAULT_PROVIDER: AnalysisProviderId = "openai";
  /** Per-workload dispatch allowlist. Widening an entry is a reviewed PR + decision-log entry. */
  export const WORKLOAD_PROVIDER_ALLOWLIST: Record<AnalysisWorkload, ReadonlySet<AnalysisProviderId>> = {
    map: new Set(["openai"]), reduce: new Set(["openai"]), digest: new Set(["openai"]),
    validation: new Set(["openai"]), entity_audit: new Set(["openai"]),
  };
  const OPENAI_REASONING_MODEL = /^(gpt-5|o\d)/;   // moved verbatim from model-config.ts:65
  export function analysisReasoningCapable(provider: AnalysisProviderId, model: string): boolean {
    return provider === "openai" ? OPENAI_REASONING_MODEL.test(model) : false;
  }
  ```
- `pricing.ts`: value type `{ in: number; out: number; provider?: AnalysisProviderId }` (absent =
  openai); rows untouched; `estimateCostUsd` untouched; add
  ```ts
  export function pricedFor(provider: AnalysisProviderId, model: string, table = PRICES_PER_MTOK): boolean {
    return Object.prototype.hasOwnProperty.call(table, model) && (table[model].provider ?? "openai") === provider;
  }
  ```
- `model-config.ts`: `WORKLOAD_ENV` gains `provider: "<W>_PROVIDER"` per workload (`MAP_PROVIDER`,
  `REDUCE_PROVIDER`, `DIGEST_PROVIDER`, `VALIDATION_PROVIDER`, `ENTITY_AUDIT_PROVIDER`).
  `WorkloadModelConfig` gains `provider: AnalysisProviderId; providerSource: "workload" | "default";
  providerEnvVar: string`. `AnalysisDispatchConfig` and `AnalysisDispatchIdentity` gain `provider`
  (placed right after `workload`); `dispatchIdentity` copies it. There is NO global provider fallback:
  `ANALYSIS_PROVIDER` keeps its legacy stub/anthropic meaning and is never read here. The new chain —
  provider checks FIRST, then the existing order unchanged (existing strings byte-identical for
  provider openai):
  ```ts
  const providerRaw = envStr(env.provider);
  const provider = (providerRaw ?? ANALYSIS_DEFAULT_PROVIDER) as AnalysisProviderId;   // validated below
  const known = (ANALYSIS_PROVIDER_IDS as readonly string[]).includes(provider);
  const allowed = known && WORKLOAD_PROVIDER_ALLOWLIST[workload].has(provider);
  const model = provider === "openai" ? (workloadModel ?? globalModel ?? ANALYSIS_DEFAULT_MODEL) : (workloadModel ?? "");
  const priced = model !== "" && pricedFor(provider, model);
  const reasoningCapable = analysisReasoningCapable(provider, model);
  …
  if (providerRaw === "stub")         dispatchBlocked = `${env.provider}=stub is not a dispatch provider (ANALYSIS_PROVIDER=stub is the offline switch) — failing closed`;
  else if (!known)                    dispatchBlocked = `${env.provider}="${providerRaw}" is not a known provider (known: ${ANALYSIS_PROVIDER_IDS.join("|")}) — failing closed`;
  else if (!allowed)                  dispatchBlocked = `provider "${provider}" is not allowed for workload "${workload}" (allowed: ${[...WORKLOAD_PROVIDER_ALLOWLIST[workload]].join("|")}) — failing closed`;
  else if (provider !== "openai" && workloadModel === null)
                                      dispatchBlocked = `${env.provider}=${provider} requires an explicit ${env.model} (OPENAI_MODEL and the default model apply to provider openai only) — failing closed`;
  else if (effortRaw !== null && !effortValid) … (unchanged string)
  else if (reasoningEffort !== null && !reasoningCapable)
                                      dispatchBlocked = provider === "openai"
                                        ? `${env.effort}=${reasoningEffort} set for non-reasoning model "${model}" — failing closed`     // byte-identical to today
                                        : `${env.effort}=${reasoningEffort} set for provider "${provider}", which accepts no reasoning effort in this release — failing closed`;
  else if (workload === "map" && (…MAP_BASELINE predicate — lines 156-159 UNTOUCHED…)) … (unchanged)
  else if (!priced)                   dispatchBlocked = provider === "openai"
                                        ? `model "${model}" has no entry in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced`   // byte-identical
                                        : `model "${model}" is not priced for provider "${provider}" in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced`;
  else if (!approval.approved)        dispatchBlocked = approval.reason;
  ```
  `analysisApproval(workload, provider, model, reasoningEffort)` is the new call at :148. Stamps at
  :182/:213/:237 unchanged. `live-runner.ts:160` passes the literal `"openai"` until PR-2.4-1.
  `scripts/model-routing-inspect.ts` adds a `provider=` column (value + source).
- `analysis-registry.ts`: `AnalysisApproval` gains REQUIRED `provider: AnalysisProviderId` (after
  `workload`); the five entries :55-109 get `provider: "openai"`; finder
  `analysisApproval(workload, provider, model, effort, registry = ANALYSIS_APPROVALS)` also matches
  `a.provider === provider`; the no-entry reason becomes
  `(${provider}, ${model}) has no ${ANALYSIS_ROUTING_REGISTRY_VERSION} approval for workload "${workload}" — pricing alone is not quality approval; run the activation checklist (evaluation + registry entry) first`
  (keeps the word "approval" that `model-config.test.ts:309` matches). Version literal stays
  `analysis-reg-v1` (R2). **Nothing is added, removed or widened.**
- `.env.example`: insert after :47 (`ENTITY_AUDIT_REASONING_EFFORT`), before the Ask paragraph:
  ```
  # Per-workload PROVIDER (2026-09 provider dimension). Default openai; the value
  # is validated against a per-workload allowlist BEFORE any other check, and a
  # provider other than openai requires an explicit <WORKLOAD>_MODEL (OPENAI_MODEL
  # and the gpt-4o-mini default apply to provider openai only). Map accepts openai
  # only. ANALYSIS_PROVIDER is NOT a routing switch (stub = offline; anthropic =
  # refused — see OPEN-TASKS #83). Every value is ABSENT everywhere today.
  # MAP_PROVIDER=openai
  # REDUCE_PROVIDER=openai
  # DIGEST_PROVIDER=openai                # anthropic allowed once a registry approval exists
  # VALIDATION_PROVIDER=openai
  # ENTITY_AUDIT_PROVIDER=openai
  ```
- Naming hazard (comment, not a runtime issue): the env NAMES `MAP_PROVIDER` / `REDUCE_PROVIDER` /
  `DIGEST_PROVIDER` / `ENTITY_AUDIT_PROVIDER` coincide with the TypeScript CONSTANT names in
  `llm-guard.ts:11,16,22,194` that hold `provider_usage` ROW keys. PR-2.2-1 adds a one-line comment at
  `llm-guard.ts:10` ("row keys; unrelated to the `<W>_PROVIDER` routing envs"); the handoff names it
  for the auditor.
- **Persisted-shape contract (pinned):** identity OBJECTS (`cron_runs.counts.dispatch`,
  `structured.stats.llmDispatch`, `structured.stats.reduce.dispatch`, `validation_runs.details.dispatch`)
  gain ONE additive key `provider`; every `openai:` STRING tag stays byte-identical
  (`openai-provider.ts:147`, `synthesize.ts:447-448`; `embeddings/client.ts:144` is untouched —
  embeddings are not an analysis workload, say so in the PR body); the `mapExtractorVersion` basis
  is untouched, so the four literals at `map-prompts.test.ts:221-226` stay.
- Existing pins that MUST change (all additive `provider: "openai"`): `model-config.test.ts:368-374`,
  `llm-match-guard.test.ts:112-118`, `openai-provider.test.ts:91-97` (`toEqual`);
  `map-worker-spend.test.ts:16-23` and `map-request-wellformed.test.ts:74-81` (config literals);
  `analysis-registry.test.ts:19-28` (add `expect(a.provider).toBe("openai")`; the cardinality pin
  stays TRUE — five entries); every injected-registry test calling `analysisApproval(...)` (new
  arity); `model-config.test.ts:18-28` `ENV_VARS` (+5 `<W>_PROVIDER` names so `clearAll()` clears
  them); `llm-match-guard.test.ts:63-74` `ENV_KEYS` (+`VALIDATION_PROVIDER`). NOT touched:
  `llm-match-guard.test.ts:120` ctor args and the `openai-client.test.ts` factory source pin — the
  factory is unchanged in this PR.
- New tests:
  - `model-config.test.ts`: for every workload, `<W>_PROVIDER=anthropic` → `dispatchBlocked` matches
    `/not allowed for workload/` and `workloadDispatchConfig` throws `ModelConfigError`; for `map`
    the message does NOT contain `MAP ACTIVATION BLOCKED` (the allowlist precedes the lock) ·
    `<W>_PROVIDER=stub` → `/not a dispatch provider/` · `<W>_PROVIDER=foo` → `/not a known provider/`
    · `<W>_PROVIDER=" openai "` trims and resolves identically to absent except
    `providerSource: "workload"` · `REDUCE_PROVIDER=anthropic` with `REDUCE_MODEL` absent →
    `/requires an explicit REDUCE_MODEL/` (checked before pricing) · effort under a non-openai
    provider → `/accepts no reasoning effort/` and NOT "non-reasoning model" ·
    `pricedFor("anthropic","gpt-4o-mini")` false, `pricedFor("openai","gpt-4o-mini")` true, a
    fixture row `{provider:"anthropic"}` true only for anthropic · identity round-trip `toEqual`
    includes `provider: "openai"`.
  - Refuse-before-reserve, per site: `map-worker-spend.test.ts` — reuse the existing
    `MAP ACTIVATION BLOCKED` route/worker shape with `MAP_PROVIDER=anthropic`: `tryReserve` never
    called, ctor never called; `llm-match-guard.test.ts` — `VALIDATION_PROVIDER=anthropic` →
    `llmMatchTakeaways` returns `null` (ruling 9 degrade), `createSpy`/`ctorSpy` not called,
    `dbState.records` empty; `openai-provider.test.ts` — `DIGEST_PROVIDER=anthropic` → `analyze()`
    rejects `ModelConfigError`, `ctorSpy` not called, zero `provider_usage` queries; the synthesize
    blocked-config shape — `REDUCE_PROVIDER=anthropic` → typed throw before `guard.init()`;
    entity-audit route — `ENTITY_AUDIT_PROVIDER=anthropic` → 503 before guard init.
  - String-tag byte pins: `mapreduceProviderTag() === "openai:gpt-4o-mini+mapreduce"` with
    `MAP_PROVIDER=openai` / `REDUCE_PROVIDER=openai` explicit; `OpenAiProvider.name ===
    "openai:gpt-4o-mini"` (existing :90); `map-prompts.test.ts:212-227` extended with
    `MAP_PROVIDER=openai` explicit → the same four literals.
  - `import-graph.test.ts`: the specifier regex :46 also matches `@anthropic-ai/`; a new case asserts
    `package.json` declares no `@anthropic-ai/*` dependency (option B stays fetch-based).
    `openai-client.test.ts`: a new case asserts no module under `src/` outside
    `lib/analysis/openai-client.ts` and `lib/llm/openai.ts` reads `OPENAI_BASE_URL` or passes a
    `baseURL` (so a second base-URL seam is caught).
  - Inspector subprocess smoke: `DIGEST_PROVIDER=anthropic npx tsx scripts/model-routing-inspect.ts`
    prints `BLOCKED: provider "anthropic" is not allowed`.
- Acceptance: typecheck/lint/unit green with counts · `git grep -n 'provider: "openai"'
  src/lib/llm/analysis-registry.ts` shows five hits · `git diff -U0 src/lib/llm/model-config.ts | grep
  -c MAP_BASELINE` = 0 and lines 156-163 unchanged · `git diff --stat docs/evals/analysis/` empty ·
  no Vercel env named · $0.
- Rulings: **4** — a provider outside the allowlist, or a model unpriced FOR that provider, is refused
  inside `resolveWorkloadModel`, before every site's `tryReserve` and client construction (§2.2 call
  order); no new row or cap. **8** — metering sites untouched. **9** — unchanged per site (validation
  still catches `ModelConfigError` and degrades; digest/reduce/entity-audit throw typed; /ask is not
  routed here). **13** — lock predicate and basis untouched; `MAP_PROVIDER≠openai` never reaches the
  lock branch. **7** — n/a (no new map model).
- Step 17 attack surface: (i) mutate the allowlist check out — the five site pins must fail; (ii)
  `pricedFor` with an absent `provider` field must mean openai, never "any"; (iii) `analysisApproval`
  arity at every caller (grep); (iv) JSON key order/shape of persisted identity objects vs the
  `quality-funnel.ts:474-475` string sentinel.

### 5.2 PR-2.2-2 `evals: decouple offline results identity from the live registry constant (no version bump)`

- Branch `48h/ws2-provider-20260905-eval-identity-decouple`. Env: none. Migration: none. $0. ~1.5 h.
- Files: `src/lib/evals/runner.ts`, `src/lib/evals/runner.test.ts`, `src/lib/evals/contracts.ts`
  (doc comment on `registryVersion` only); `hardening-cli.test.ts` must stay green unchanged.
- Change — in `resumeIdentityMismatch` (`runner.ts:489-520`) replace :506 with:
  ```ts
  // Offline fixture files (provider "stub") dispatch nothing: the registry version they
  // record is the constant at CREATION and is informational — a registry bump must not
  // refuse their resume or force a rewrite of committed results. Live files stay strict.
  if (headerIsLive(existing)) cmp("registryVersion", existing.identity.registryVersion, current.identity.registryVersion);
  ```
  `offlineIdentity` (:331-342) keeps stamping the current constant on NEW files. No CLI change and no
  results write-path change: resume never rewrites a header (§2.3), so decoupling is purely a
  comparison change and no committed file is touched by this PR or by a later bump.
- Tests (`runner.test.ts`): offline header (`provider: "stub"`, `registryVersion: "analysis-reg-v0"`)
  vs current → `null`; live header with a different version → mismatch string contains
  `registryVersion:`; a live header identical except the version still refuses (guards against
  accidentally widening the skip); `hardening-cli.test.ts:192-206` green unchanged.
- PR body states verbatim "`git diff --stat docs/evals/analysis/` is empty" and lists the §5.6
  inventory. Exposure note: results HEADERS only; no dataset or results body opened.
- Rulings: 4/8/9/13 untouched (no dispatch path changes). Step 17: can an offline file be
  misclassified as live? `headerIsLive` is `provider !== "stub"` — PR-2.4-1 must keep `"stub"` for
  offline (stated in its spec).

### 5.3 Option A (OpenAI-only) — what remains after 5.1/5.2

Nothing further: candidate OpenAI models are admitted by the evaluation program (WS-1.5 step 4 →
`evaluated_candidate` row → `<W>_MODEL` env). The map lock stays until §6's remap is executed and a
map candidate passes (#33, #81).

### 5.4 Option B (D2 = B) — Anthropic, on top of step 09 and step 12 (step 20b, worktree `ws2-routing`)

Step 09 lands first: `ANALYSIS_PROVIDER=anthropic` → typed `ModelConfigError`-class refusal before
the key is read; key-alone auto-selection removed; well-formed doc-line clip (`digestDocLine` shape,
`src/lib/text/well-formed-slice.ts` exports `dropIsolatedSurrogates` :39, `wellFormedSlice` :69);
call-time model; missing key typed. Every B PR REPLACES that refusal by routing through model-config;
none bypasses it. Every B PR is $0 in this window (mocked `fetch`); the first real Anthropic call is
an evaluation-program action with its own authorization, never a test.

#### PR-2.2-B1 `analysis: anthropic digest provider metered, identity-stamped and routed through model-config (dormant until approved)`

- Branch `48h/ws2-routing-20260905-anthropic-wiring`. Env: NONE new (the row reuses existing envs —
  decision R6). Migration: none. $0. ~4 h.
- Files: NEW `src/lib/analysis/anthropic-dispatch.ts` (pure: `buildMessagesRequest({model, system,
  user, maxTokens, temperature, apiKey}) → {url, init}` and `parseMessagesResponse(json) → {text,
  stopReason, inputTokens, outputTokens, model}`; no fetch, no env — PR-2.2-B3 reuses it);
  `src/lib/analysis/anthropic-provider.ts`; `src/lib/analysis/provider.ts`; `src/lib/usage/llm-guard.ts`;
  `src/lib/llm/providers.ts` (allowlist `digest: {openai, anthropic}`); tests NEW
  `anthropic-provider.test.ts`, `anthropic-dispatch.test.ts`, `provider.test.ts`; `docs/OPEN-TASKS.md`
  #83 line; `.env.example` (`DIGEST_PROVIDER` comment).
- `llm-guard.ts`: `export const ANTHROPIC_DIGEST_PROVIDER = "anthropic_digest"; export function
  anthropicDigestGuardFromEnv(): SpendGuard` with `openAiGuard`-equivalent semantics (total
  `LLM_SPRINT_USD_CAP`, daily `llmDailyUsdCap()` = `LLM_DIGEST_USD_CAP`, request caps
  `LLM_DIGEST_DAILY_REQUEST_CAP`/`LLM_DIGEST_RUN_REQUEST_CAP`). **Cap semantics, stated plainly:**
  `pgUsageStore.load` filters `WHERE provider = $1`, so `anthropic_digest` gets its OWN full
  `LLM_DIGEST_USD_CAP` day envelope and its own `LLM_SPRINT_USD_CAP` backstop — exactly the
  `openai_entity_audit` precedent (`llm-guard.ts:13-16`); the two digest rows are additive, not
  shared. Ruling 4 ordering: both envs already exist in all Vercel envs (they gate `openai_digest`
  today); the PR body still records a read-only `vercel env ls` presence check at deploy time.
- `anthropic-provider.ts` `analyze(countryIso2, date, docs, opts?: AnalyzeOptions)` order (pinned):
  `assertLlmEnabled("anthropic digest extract")` → `workloadDispatchConfig("digest")` (throw
  `ModelConfigError` if `dispatch.provider !== "anthropic"`) → key presence (typed error, no `!`
  assertion) → `anthropicDigestGuardFromEnv().init()` → `reserve()` → `fetch(buildMessagesRequest(…))`
  → on 429: sleep 65 s, `reserve()` again, ONE retry → `parseMessagesResponse` usage →
  `estUsd = estimateCostUsd(dispatch.model, in, out)` → `guard.record(1, in + out, estUsd)` →
  `opts?.onUsage?.({promptTokens, completionTokens, estUsd, truncated})` → if `stopReason ===
  "max_tokens"` throw `Error("anthropic-provider: response truncated (stop_reason=max_tokens)")`
  (the message contains "truncated" so `digest.ts:171`'s ladder applies) → `parseEventsJson(text)` →
  `return { events, provider: this.name, dispatch: dispatchIdentity(dispatch) }`. `name` =
  `` `anthropic:${resolveWorkloadModel("digest").model}` `` in the constructor (the
  `openai-provider.ts:147` precedent). Raw `fetch`, no SDK.
- `provider.ts` `getProvider()`: `stub` → stub; `ANALYSIS_PROVIDER=anthropic` → KEEP step 09's
  refusal with the message updated to `provider anthropic is selected by DIGEST_PROVIDER=anthropic +
  an approved DIGEST_MODEL, never by ANALYSIS_PROVIDER — see OPEN-TASKS #83`; then
  `if (resolveWorkloadModel("digest").provider === "anthropic") return new AnthropicProvider()` — the
  selection reads the RESOLVED provider even when `dispatchBlocked` is set (never silently fall back
  to OpenAI; `analyze()` then throws typed — ruling 9 digest semantics); then `OPENAI_API_KEY` →
  OpenAI; else stub. **Dormancy argument:** with the digest allowlist widened but ZERO anthropic
  registry entries and ZERO anthropic price rows, `DIGEST_PROVIDER=anthropic` resolves to
  `dispatchBlocked` (unpriced, then unapproved) → every legacy-digest run fails typed and loud;
  nothing dispatches. Widening the allowlist is NOT an approval (COMMON §3's registry rule holds).
- Tests (`anthropic-provider.test.ts` — `vi.stubGlobal("fetch", fetchSpy)`, `vi.mock("@/db")`
  querySpy as in `openai-provider.test.ts:9-30`, and a mocked model-config returning an injected
  `ANTHROPIC_DISPATCH = {workload:"digest", provider:"anthropic", model:"claude-test",
  reasoningCapable:false, reasoningEffort:null, approvalStatus:"evaluated_candidate",
  registryVersion:"analysis-reg-v1"}` for the happy-path cases): refused config → `ModelConfigError`
  before fetch and before guard init (zero queries) · **`LLM_DISABLE=1` → `LlmDisabledError`, zero
  fetch, zero queries (explicit acceptance line — ruling 9)** · missing key → typed error, zero fetch ·
  `LLM_SPRINT_USD_CAP` unset → `LlmBudgetError` (`cap_unset`), zero fetch · order pin via a shared
  call log: `tryReserve` < `fetch` < `record` (INSERT with provider `anthropic_digest`) < parse
  (malformed body: record happened, events `[]`) · `stop_reason: "max_tokens"` → record called,
  `onUsage({truncated: true})`, rejects `/truncated/` · 429 then 200 → 2 reservations, 2 fetches, 1
  record · `res.provider === "anthropic:claude-test"` and `res.dispatch` `toEqual` `{workload:"digest",
  provider:"anthropic", model:"claude-test", reasoningEffort:null, registryVersion:"analysis-reg-v1",
  approval:"evaluated_candidate"}` · request-body pin: `model`, `max_tokens`, `system`, one user
  message, `anthropic-version` header, key header from env · `anthropic-dispatch.test.ts` pure
  request/parse pins · `provider.test.ts`: `DIGEST_PROVIDER=anthropic` → `AnthropicProvider` instance
  (no dispatch); `ANALYSIS_PROVIDER=anthropic` → step-09 refusal kept; key alone with `OPENAI_API_KEY`
  unset → stub · source pins: `git grep -n "process.env.ANTHROPIC_API_KEY!"` empty; no `@anthropic`
  import anywhere.
- Acceptance: counts green · no env, no paid call · `docs/evals/analysis/` untouched · `provider.ts`
  contains no `ANTHROPIC_API_KEY`-presence branch that selects the provider · OPEN-TASKS #83 status:
  "wired + metered; dormant pending price (B2), eval seam + scorecard (B3), registry entry".
- Rulings: 4 (reserve before fetch; `cap_unset`/`daily_usd_unset` refuse; the row reuses existing
  envs), 8 (metering inside `analyze()`; truncated responses recorded before discard), 9 (digest
  throws typed; `LlmDisabledError` honoured), 13 (map untouched; allowlist widened for digest only).
  Step 17: the 429 retry path metering; `getProvider()` never falling back to OpenAI under a blocked
  anthropic config; the row name typed as a constant everywhere.

#### PR-2.2-B2 `llm: price row for <anthropic model> (operator-verified)`

- Branch `48h/ws2-routing-20260905-anthropic-price`. ~0.5 h. One row
  `"<model-id>": { in: X, out: Y, provider: "anthropic" }`; tests pin `pricedFor("anthropic", id)`
  true / `pricedFor("openai", id)` false and extend the existing ceiling pin (unknown fallback ≥
  every row). **Needs decision R7:** model id + list price, verified on the day and quoted in the PR
  body. The Ask parity test is unaffected (§2.1).

#### PR-2.2-B3 `evals: anthropic dispatch seam for live evaluation (digest only)` — AFTER PR-2.4-1

- Branch `48h/ws2-routing-20260905-eval-anthropic-seam`. ~3 h. `live-runner.ts` `dispatchOnce`
  branches on `cfg.provider`: `openai` → SDK path unchanged; `anthropic` → `anthropic-dispatch.ts`
  request/parse through an injected `deps.fetch`, the same reserve < fetch < record < parse order and
  the same capture lines; metering row `anthropic_eval` via `evalGuardFromEnv(provider)` reusing
  `EVAL_USD_CAP_DAILY` + `LLM_SPRINT_USD_CAP` (local-only, never in Vercel); `identity.provider =
  "anthropic"`, configKey `+provider=anthropic` (PR-2.4-1 shape); `EVAL_DISPATCHABLE_PROVIDERS`
  widened to `["openai", "anthropic"]` for `digest` only. **Decision R13:** the eval contract
  dispatches `json_schema` + `strict: true` (`live-runner.ts:419-422`); Anthropic Messages has no
  equivalent, so a digest cell runs prompt-embedded JSON — record a `schemaMode` in the identity and
  treat the cell as its own comparability class. This PR is the prerequisite for any
  `evaluated_candidate` entry with `provider: "anthropic"`; the paid run itself is a step-4
  evaluation-program authorization.

#### Activation path (post-window, own authorization)

Paid representative evaluation through PR-2.2-B3 → PASS → reviewed registry PR adding the
`evaluated_candidate` row `{workload: "digest", provider: "anthropic", model, allowedEfforts: [null]}`
(this PR also executes §5.6's bump) → decision-log entry → `DIGEST_PROVIDER=anthropic` +
`DIGEST_MODEL=<id>` set in Vercel → plain-clone deploy → 24 h routing soak (§12). Rollback = unset
the two envs + redeploy (digest resolves back to openai/gpt-4o-mini; the `anthropic_digest` row is
inert).

### 5.5 Option C — seam-readiness note (deferred; no PR this window)

- `analysisOpenAiClient(cfg?: { baseURL?: string; apiKey?: string }): OpenAI` — the default call is
  unchanged (`new OpenAI({ maxRetries: 0 })`, keeping the `openai-client.test.ts:57-60` source pin
  and the `llm-match-guard.test.ts:120` exact-args pin for provider openai); `openai_compatible`
  passes `{ maxRetries: 0, baseURL, apiKey }` and the ctor-spy pin then asserts per provider.
- Env: `<W>_BASE_URL` (+ optional `<W>_API_KEY`, default `"local"`), validated in
  `resolveWorkloadModel` right after the allowlist check: parse, `http(s)` only, host ∈ loopback
  allowlist (`127.0.0.1`, `localhost`, `::1`) unless a future `ANALYSIS_BASE_URL_ALLOW_HOSTS` names it;
  refused before reserve. `OPENAI_BASE_URL` is never read (the parked branch's knob on
  `src/lib/llm/openai.ts` is superseded); C's tests reuse the unroutable-sink pattern
  (`map-batch-error-classification.itest.ts:83`).
- Pricing: an explicit row `{ in: 0, out: 0, provider: "openai_compatible" }` — this REVERSES the
  2026-08-25 stance (`PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-95`, "local ids stay out of
  `PRICES_PER_MTOK`") and needs a decision-log entry IN HAND before the PR opens (decision R11).
- Guard shape: `SpendGuard` refuses a null daily cap (`spend-guard.ts:113-117`) and a 0 cap trips
  `daily_usd` at :136, so a `$0` class needs a REQUEST-CAP-ONLY configuration (`dailyUsdCap` allowed
  null only when `totalRequestCap` AND `dailyRequestCap` are set) — a `SpendGuard` config change with
  its own contract tests, rows `local_<workload>`, and envs `LOCAL_<W>_DAILY_REQUEST_CAP` /
  `LOCAL_<W>_TOTAL_REQUEST_CAP` set in ALL Vercel envs before the guard deploys (ruling 4).
- Identity: `provider: "openai_compatible"` + `baseUrlHost` in the identity object;
  `mapExtractorVersion` stays locked out (the map allowlist never widens for C).

### 5.6 The `analysis-reg-v2` bump — PLANNED, not executed (R2)

Rule: the PR that adds the first `provider !== "openai"` registry entry (B's `evaluated_candidate`,
after PR-2.2-B3's scorecard + operator authorization) bumps `ANALYSIS_ROUTING_REGISTRY_VERSION` and,
in the SAME PR, updates exactly these literals — 1 definition + 10 test literals + 1 comment
(`git grep -n analysis-reg-v1 src/ scripts/`): `src/lib/llm/analysis-registry.ts:35` (definition) ·
`analysis-registry.test.ts:50` · `model-config.test.ts:296`, `:372` ·
`src/lib/analysis/map-request-wellformed.test.ts:80` · `map-worker-spend.test.ts:22` ·
`openai-provider.test.ts:95` · `src/lib/validation/llm-match-guard.test.ts:116` ·
`src/lib/evals/capture.test.ts:67` · `live-runner.test.ts:152` (+ comment `:106`) ·
`live-sweep.test.ts:491`. Live docs (3 lines): `docs/CURRENT-STATE.md:314`, `docs/OPEN-TASKS.md:176`
(#33 text), `:826` (#84 cross-reference text). `docs/OPEN-TASKS.md:771` and every `docs/reviews/*`
hit are historical records — leave verbatim. **`docs/evals/analysis/` (18 files, 37 hits) is NOT
touched:** PR-2.2-2 makes offline resume version-stable, and results files are only rewritten after a
completed case. Gitignored pre-bump `live-*` files refuse resume by design (they ran under v1).
AGENTS.md rulings 4 and 13 say "`analysis-reg-v1` approval" — step 25 rewrites that to "registry
approval" (Proposed AGENTS.md changes) so the bump needs no AGENTS.md edit.

---

## 6. WS-2.3 — #33 remap: runbook + $0 dry-run estimate (step 22, worktree `ws2-remap`)

### 6.1 The measurement-path DECISION (R4) — list, recommend, do not decide

Under the baseline every dispositioned document is already current-version, so remap has ZERO pending
work (§2.8). Pending work needs a version change:

- **(a) Env-driven basis bump on the fork-bound server only — RECOMMENDED.** `MAP_CONTENT_CHARS=1499`
  in the local `next start` env changes `content=…` in the basis → four NEW extractor versions, zero
  code change, no branch divergence, the baseline model stays (`estDispatchBlocked` null), the lock
  predicate is never touched, and the four literal pins are unaffected (they delete the env). Reversible
  by unsetting. Caveat: the whole epoch-eligible corpus (≈400–500K docs) becomes pending; the estimate
  is bounded by `--from/--to` + the per-day `cap=20000` dry probe; a measured run by `--limit`/`--cap`/
  one day.
- **(b) Prompt-hash code bump on an unmerged branch** — same effect, but the measured run's identity
  then lives in an unmerged commit and the version-pin test fails on that branch by design.
- **(c) Scoped lock relaxation for a non-production target — FORBIDDEN this window** (COMMON §3:
  `model-config.ts:156-159` is never edited).

### 6.2 PR-2.3-1 `scripts: map-remap --base-ack fail-closed guard for non-loopback targets`

- Branch `48h/ws2-remap-20260905-map-remap-base-ack`. ~0.5 h. $0. No env.
- Files: `scripts/map-remap.ts` (+ `--base-ack <host>`; fix the stale `:168` comment; print
  `MAP_BACKFILL_BASE=<base>` in the banner at :314), NEW `scripts/map-remap.test.ts` (pure
  `assertBaseAck(base, ack)`).
- Rule: a loopback base (`127.0.0.1` | `localhost` | `::1`) needs no ack; any other host requires
  `--base-ack <exact host>`; a mismatch refuses BEFORE any route call. Refusal:
  `map-remap: base "<host>" is not loopback — pass --base-ack <host> to target a deployed route (production is the default target; a checkpoint is bound to the target)`.
- Proposed decision-log line for step 25: "remap drivers refuse non-loopback targets without an
  explicit `--base-ack`".

### 6.3 Runbook outline (step 22 writes `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` — executable cold)

1. **Preconditions.** PR #50 merged (driver header); PR-2.3-1 merged or on the branch;
   `NEON_API_KEY` + `NEON_PROJECT_ID` in `.env.local`; `npm run build` passes; port 3000 free.
2. **Fork.** `npx tsx scripts/neon-branch.ts create` → record `{branchId, connectionString}`. The
   fork is a production copy: already migrated through 0027 (no `db:migrate`); it also COPIES
   `provider_usage` (the `openai_map` all-time total, ≈$19.5, and today's row).
3. **Server env** (COMMON §4.8; `authz-page-gate.itest.ts:149-163`): `DATABASE_URL=<fork>`,
   `OPENAI_API_KEY=""`, `ANTHROPIC_API_KEY=""`, `POSTMARK_SERVER_TOKEN=""`, `X_API_KEY=""`,
   `OPENSANCTIONS_API_KEY=""`, `RESEND_API_KEY=""`, `LLM_DISABLE=1`, `CRON_SECRET=<local random>`,
   `MAP_CONTENT_CHARS=1499` (R4 a), `NODE_ENV=production`; `next build && next start -p 3000`;
   readiness `curl -fsS http://localhost:3000/health`. Never start with the production `.env.local`
   as-is.
4. **Estimate per theater × track** (driver env: `CRON_SECRET=<same>`,
   `MAP_BACKFILL_BASE=http://localhost:3000`, NO `--execute` — the estimate is the default mode):
   `npx tsx scripts/map-remap.ts --theater ru --track military --from 2026-08-01 --to 2026-08-31`,
   then ua/ir × applicable tracks. Paste the printout: per-day `eligible/pairs/batches/est`,
   `TARGET model=gpt-4o-mini`, the four NEW `version` lines (`remapVersions`), `ELIGIBLE … ESTIMATE
   TOTAL`; `estDispatchBlocked` must be absent/null.
5. **Per-1k formula.** Estimate: `estUsd / selected × 1000` per theater-track; production-scale
   projection = `Σ eligible docs (full-range dry) × per-1k / 1000`. Measured (D7 only):
   `(fork provider_usage.openai_map delta) / docs dispositioned × 1000`, cross-checked against the
   driver's `actualTotal`/`claims`.
6. **Measured run — ONLY with a SIGNED D7 entry naming a ceiling C.** Restart the server with
   `OPENAI_API_KEY` set, `LLM_DISABLE` unset, `MAP_CONTENT_CHARS=1499`, and campaign-local caps
   computed from the fork's COPIED ledger: read `T = SUM(est_usd) FROM provider_usage WHERE
   provider = 'openai_map'` and `D = est_usd` for today; set `MAP_SPRINT_USD_CAP = T + C`,
   `MAP_USD_CAP_DAILY = D + C`, leave `LLM_SPRINT_USD_CAP` (map reads `MAP_SPRINT_USD_CAP` first,
   `llm-guard.ts:177-188`). Reservation semantics are threshold-based (`spend-guard.ts:127-136`, `>=`),
   so terminal spend may exceed C by one batch's cost — the entry says so. (Deleting the fork's
   `openai_map` rows first gives cleaner arithmetic but the fork stops being an honest copy — not
   recommended.) Run one day: `--execute --budget C --limit 1000 --theater ir --track military`;
   record the ledger row; delete the fork. Otherwise print `AWAITING AUTHORIZATION: D7` and stop
   after the estimate.
7. **Abort / rollback.** Kill the server; `npx tsx scripts/neon-branch.ts delete <branchId>`. Nothing
   on production changes: the route target was loopback and the checkpoint key is target-bound.
8. **Decision-log entry contents.** Fork id, base commit, env posture (blanked keys,
   `MAP_CONTENT_CHARS=1499`), the four versions, per-theater estimates and per-1k figures, D7 ceiling
   and actual spend (or `AWAITING AUTHORIZATION: D7`), fork deleted at `<time>`.
9. **Gates for any FUTURE candidate run.** Ruling 13 (consumers filter to current versions; a remap
   writes the new version only, old rows persist — the rollback); ruling 7 (a new map model is
   re-measured for `minItems/maxItems` under-fill); the lock stays.

### 6.4 Lock-replacement design note (plan only; no code this window)

"Registry-approved + remap-complete" gating would replace the predicate at `model-config.ts:156-159`
with `workload === "map" && !(approval.approved && remapComplete(extractorVersion(track, theater)))`.
It needs: (1) a durable marker — `provider_state` row `map_remap_complete` with jsonb
`{ "<track>:<theater>": { extractorVersion, completedAt, days: [from, to], docs, pairs, usd, target } }`
written by the driver when every day in the authorized range is `complete` under the same versions
and target (the checkpoint already knows both); (2) a reading path — `resolveWorkloadModel` is
synchronous and env-only, so either the marker is read once at process start into module state, or
the lock moves into `runMapCycle` before the first reservation while model-config keeps a config-only
refusal for unapproved candidates; (3) an activation entry: candidate identity, the
`evaluated_candidate` registry row, the remap completion record, caps posture, rollback (unset env;
old rows persist). This is the operator's DECISION after eval step 4; nothing here changes the lock.

### 6.5 Corrections step 22's prompt needs

`--estimate` → "the default mode (no `--execute`)"; `--resume` → "implicit via the checkpoint under
`data/remap-state/`"; the `--base-ack` companion PR stays; add the env posture above (dry runs need
no key and tolerate `LLM_DISABLE=1`); add the copied-ledger cap arithmetic; note that the only
dependency on step 02 is PR #50's header rewording.

---

## 7. WS-2.4 — Eval-plane provider parity (step 20, worktree `ws2-routing`)

### 7.1 PR-2.4-1 `evals: --provider flag, provider-qualified identity, fail-closed allowlist`

- Branch `48h/ws2-routing-20260905-eval-provider-flag`. ~2 h. $0. No env.
- Files: `scripts/analysis-eval.ts`, `src/lib/evals/live-runner.ts`, `src/lib/evals/runner.ts`,
  `src/lib/evals/contracts.ts`, `src/lib/evals/capture.ts` (attempt lines gain `provider`), tests
  `live-runner.test.ts`, `runner.test.ts`, `hardening-cli.test.ts`, `live-sweep.test.ts`,
  `capture.test.ts`.
- Signatures:
  ```ts
  // contracts.ts:436
  provider: "openai" | "anthropic" | "openai_compatible" | "stub";
  // live-runner.ts
  export const EVAL_DISPATCHABLE_PROVIDERS: readonly AnalysisProviderId[] = ["openai"]; // widened by PR-2.2-B3
  export function evalDispatchConfig(workload: string, provider: string, model: string, effort: string | null): EvalCandidateDispatchConfig; // + provider field
  // :114 REASONING_MODEL mirror → analysisReasoningCapable(provider, model) from src/lib/llm/providers
  // liveIdentity: provider: cfg.provider
  // runner.ts:344
  export function liveConfigKey(model: string, effort: string | null, provider: AnalysisProviderId = "openai"): string;
  //   → `${model}${effort ? `@${effort}` : ""}${provider === "openai" ? "" : `+provider=${provider}`}`
  ```
- Refusal (preflight, before `evalDispatchConfig`, before any client or DB):
  `eval: provider "<id>" is not eval-dispatchable in this build (allowed: openai) — refusing before any client construction`.
  Unknown ids fail the same way; the banner (`analysis-eval.ts:859`) prints `provider=<id>`.
- configKey position, verified against discovery/pairing (`analysis-eval.ts:528-568`): discovery
  captures the whole key; pairing strips `/\+votes\d+$/` then takes `lastIndexOf("+")` as the profile
  suffix. The provider segment therefore sits BEFORE the profile and votes suffixes —
  `<model>[@effort][+provider=<id>][+<profile>][+votesN]` — and the pairing code gains one line
  stripping `+provider=<id>` before deriving `profileSuffix`, so a non-OpenAI candidate pairs with the
  OpenAI baseline `gpt-4o-mini<profile><votes>` under the same profile. `resultsPath` (:273-278) is
  unaffected (prefix decided by `startsWith("offline-fixtures")`); committed offline files never carry
  the segment; `headerIsLive` stays `provider !== "stub"` (offline files keep `"stub"` — PR-2.2-2's
  invariant); `resumeIdentityMismatch` already compares `provider` (:504). `--capture-reconcile`
  (:1291-1302) takes `--provider` and re-derives the same key.
- Tests: preflight refuses `--provider anthropic` before `buildLiveDeps` (spies: `analysisOpenAiClient`
  and `evalGuardFromEnv` never called); `evalDispatchConfig("digest","openai","gpt-4o-mini",null)
  .provider === "openai"`; `liveConfigKey("gpt-4o-mini", null, "anthropic") ===
  "gpt-4o-mini+provider=anthropic"` and the openai form unchanged; report pairing:
  `gpt-5-nano+provider=anthropic+map-depth-4000+votes5` pairs with `gpt-4o-mini+map-depth-4000+votes5`;
  `hardening-cli.test.ts:192-206` committed offline files resume byte-identical (existing, unchanged);
  `live-sweep.test.ts:491` and `live-runner.test.ts:152` unchanged; every `evalDispatchConfig(` test
  call site updated for the new arity.
- Acceptance: `git diff --stat docs/evals/analysis/` empty; counts; no env; $0; exposure note
  "results headers only, no case content read". Rulings: 4 (provider refused before client/DB), 13
  untouched. Step 17: `--provider anthropic --execute-live` with a fake key must refuse before
  `evalGuardFromEnv`.

### 7.2 PR-2.4-2 `analysis: extract entity-audit prompt/request into a pure module (byte-identical request)`

- Branch `48h/ws2-routing-20260905-entity-audit-prompt-extract`. ~1 h. $0.
- Files: NEW `src/lib/analysis/entity-audit-prompts.ts`, NEW `entity-audit-prompts.test.ts`,
  `src/app/api/cron/entity-audit/route.ts` (the route stays in `openai-client.test.ts`'s
  `ANALYSIS_DISPATCH_MODULES` and in `isolation.test.ts`'s production list).
  ```ts
  export const ENTITY_AUDIT_SYSTEM = `…`;                               // moved verbatim from route.ts:34-46
  export function entityAuditListing(rows: EntityAuditRow[]): string;   // route.ts:102-107 logic
  export function entityAuditRequest(dispatch: AnalysisDispatchConfig, listing: string) {
    return { model: dispatch.model,
             messages: [{ role: "system", content: ENTITY_AUDIT_SYSTEM }, { role: "user", content: `Entities:\n${listing}` }],
             ...analysisChatParams(dispatch, { temperature: 0 }),
             response_format: { type: "json_object" } } as const;
  }
  ```
  Route: `client.chat.completions.create(entityAuditRequest(dispatch, listing))`.
- Tests: a golden test that `entityAuditRequest(DISPATCH, listing)` deep-equals the literal the route
  built before (copied into the test as the frozen expectation) and that the SYSTEM string's sha256
  equals the pre-extraction hash; a source-scan pin that `route.ts` contains no inline `messages:` /
  `response_format:` and imports `entity-audit-prompts`; the module imports nothing from
  `src/lib/evals` (`isolation.test.ts:19-25` fails otherwise). There is no `route.test.ts` today; a
  route-level `create` spy needs a DB mock — add it only if `vi.mock("@/db/client")` is already a
  pattern in cron route tests, else the golden + source-scan pair is the proof.
- **Decision R12** for the later coverage PR: the route uses `response_format: { type: "json_object" }`
  (:119) while every eval workload dispatches strict `json_schema` (`live-runner.ts:419-422`); adding
  `entity_audit` to `LiveEvalWorkload` (:92, rejected at :131-136) needs either a schema (a request
  change → re-observe production) or a non-strict eval path.

### 7.3 Embeddings coverage — design note only (no code)

Retrieval recall over `docs/evals/ask-eval-set.json` is the Ask eval runner's job
(`scripts/ask-eval.ts` :1-25, `src/lib/ask/eval-run.ts`); `analysis-eval` has no embeddings workload
and must not grow one. A future "embed model candidate" is evaluated by an Ask `--offline`/live
config sweep with `ASK_EMBED_MODEL` set (behind PR-2.1-2's price refusal), scored on retrieval
recall — separate from this plan.

---

## 8. Rulings touched and compliance (per PR)

| PR | Ruling 4 (fail-closed; caps before guards) | 5 | 7 | 8 | 9 | 13 |
|---|---|---|---|---|---|---|
| PR-2.1-1 | read-only; no reservation | — | — | untouched | untouched | — |
| PR-2.1-2 | unpriced embed model refused before SDK construction and before any `tryReserve` (spy-pinned); no new cap | — | — | metering stays in `openaiEmbedBatches` | Ask degrades to lexical-only; backfill fails loudly | — |
| PR-2.1-3 | gated path takes zero reservations | — | — | untouched | /ask degrades, never throws | — |
| HYG-44/82 | comment only; factory swap (maxRetries 0) | — | — | — | — | — |
| PR-2.2-1 | allowlist + provider-scoped pricing refuse inside `resolveWorkloadModel`, before every site's reserve/client; no row/cap | — | n/a | untouched | per-site unchanged | lock + basis untouched; `MAP_PROVIDER≠openai` refused before the lock |
| PR-2.2-2 | no dispatch change | — | — | — | — | — |
| PR-2.2-B1 | reserve < fetch; `cap_unset`/`daily_usd_unset` refuse; new row `anthropic_digest` on EXISTING envs, per-row envelope stated | — | n/a (digest) | metering + truncation record inside `analyze()` | digest throws typed; `LlmDisabledError` honoured | map allowlist stays `{openai}` |
| PR-2.2-B2 | pricing necessary-not-sufficient; registry still refuses | — | — | — | — | — |
| PR-2.2-B3 | eval guard reserve < fetch; local-only caps | — | — | record before parse | — | map never evaluated on anthropic |
| PR-2.3-1 | refuses before any route call | — | runbook gate for any new map model | — | — | lock untouched; R4 (a) changes no code |
| PR-2.4-1 | provider refused in preflight before client/DB | — | — | order unchanged | — | untouched |
| PR-2.4-2 | request byte-identical | — | — | untouched | untouched | — |

Ruling 21 is not touched (no page changes). Rulings 1/2/3 are not touched (no ISW text, no claim
writes, no stub rendering).

## 9. Migrations

None in this window. PR-2.1-4 is HELD on R1 and, if ever built, is forward-only migration 0031 on
`provider_usage_reservations` (or a sibling table), never on an applied migration;
`9999_claim_source_trigger.sql` stays last; `migrations.test.ts` additive pin; fork itests reported.

## 10. Env/cap changes and ruling-4 ordering

- In-window PRs: **no new environment variable and no cap change anywhere.** New ROUTING envs
  (`<W>_PROVIDER`) are absent everywhere and default to openai; they gate nothing until set.
- PR-2.2-B1's `anthropic_digest` row draws on `LLM_SPRINT_USD_CAP` + `LLM_DIGEST_USD_CAP`, which
  already exist in Production, Preview and Development (they gate `openai_digest`); the deploy record
  still carries a read-only `vercel env ls` presence check. If R6 chooses a dedicated cap env instead
  (`ANTHROPIC_DIGEST_USD_CAP`), it must be set in ALL Vercel envs BEFORE the guard that reads it
  deploys, or every Anthropic digest run stops — ruling 4 ordering.
- Activation of any candidate (outside the window): `<W>_PROVIDER` / `<W>_MODEL` are set in Vercel
  only after the registry row exists and the decision-log entry is signed (§5.4 activation path).
- Option C (deferred): `<W>_BASE_URL`, `<W>_API_KEY`, `LOCAL_<W>_*_REQUEST_CAP` in all envs before
  the guard deploys (§5.5).

## 11. Deploy path

Plain release clone only (`bnow-net-rel-20260823`), per `docs/RELEASE-CHECKLIST.md` (PR #51), after
step 26's per-PR go/no-go; every in-window WS-2 PR needs no env change and is behaviour-identical
for provider openai, so all of them qualify for step 27's "no new cap env" rule. Rollback target =
the deployment before the release (the checklist's rollback-ladder step); no WS-2 PR adds a floor.

## 12. Soak / proof plan

The PR #5 routing-equivalence template, re-applied once the provider dimension is live: 24/24
natural map cycles (`:40`) each recording ONE dispatch identity in `cron_runs.counts.dispatch` now
carrying `provider: "openai"`; digests' `structured.stats.llmDispatch` / `reduce.dispatch` and
`validation_runs.details.dispatch` carry it too; zero routing-gate failures; the `openai:` string tags
in `digests.provider` byte-identical to the pre-release form; `openai_reduce`/`openai_map`/
`openai_digest` in band; the #84 headroom line recorded (PR-2.1-2/2.1-3 touch Ask money paths —
one read-only `provider_usage` SELECT). PR-2.2-B1 needs no soak of its own (dormant: nothing can
dispatch until a registry row exists) beyond the digest cron running unchanged on openai. Remap: the
proof is the runbook's pasted estimate; a measured run under D7 records its ledger row.

## 13. Exposure note

No PR in this plan reads or writes evaluation DATASET content. PR-2.2-2 and PR-2.4-1 touch results
HEADERS through the existing tests only (`hardening-cli.test.ts` runs the committed offline files —
it already does today). This planning session opened nothing under `docs/evals/analysis/` (`ls` and
`git grep -c` counts only), nothing under the forbidden artifact folders, no `live-*.json`, no heldout
content.

## 14. Session estimates (agent hours, Opus / high)

| Step | PRs | Hours |
|---|---|---|
| 12 (ws2-provider) | PR-2.2-1, PR-2.2-2 | ≈ 6 |
| 11 (ws2-routing) | PR-2.1-1, 2.1-2, 2.1-3, HYG-44, HYG-82 (2.1-4 HELD) | ≈ 4.5 |
| 22 (ws2-remap) | PR-2.3-1 + runbook + estimate (+ measured run if D7) | ≈ 3 (+1) |
| 20 (ws2-routing) | PR-2.4-1, PR-2.4-2 | ≈ 3 |
| 20b (ws2-routing) | PR-2.2-B1, B2, B3 | ≈ 7.5 |

## 15. Operator decisions needed before the first PR

Nothing in step 12's two PRs or step 22's runbook/estimate waits on a decision. Step 11 needs R1 and
R3 to ship its whole scope (else PR-2.1-1/2.1-2 + hygiene only); step 22's measured run needs D7;
20b needs R6 and R7. Full list with options in "Decisions needed" below.

---

# Closing report (COMMON §5)

## Scope

Prompt `docs/prompts/2026-09-05-48h-04-plan-ws2-routing.md`; worktree
`/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905`; branch
`48h/ws2-routing-20260905-step04-plan-ws2`; base `origin/main` `dff58f2` (== the worktree HEAD at
start). Planning only: no code, tests, registry edits, env changes, DB access or paid calls.

## Built

- This document, `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` — PR [#54](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/54).
- `docs/PROGRESS.md` plan block (2026-09-06 ~20:51Z) + execution bullets.
- No source, test, migration, AGENTS.md or OPEN-TASKS change.

## Tests

None run (docs-only change; no code touched). Unit count unchanged at the base: 3,612 / 247 files
(measured on `main` by steps 01–03 on 2026-09-06). Typecheck/lint: not applicable to this PR; the
pre-push hook runs them on push. Fork itests: none. **Spend: $0.**

## Rulings touched and how each is satisfied

This PR touches no ruling. The plan's per-PR compliance is §8; the invariant-grade items the plan
protects are: ruling 4 (every new refusal lands before any reservation or client construction; no
new cap env in the window; B1's row reuses existing envs with per-row semantics stated), ruling 13
(the lock predicate, `MAP_BASELINE` and the extractor-version basis are never edited; R4's
recommended path changes no code), ruling 9 (per-site degradation preserved and extended to the
Anthropic path with a typed `LlmDisabledError`), ruling 8 (metering inside `analyze()`; truncation
recorded before discard), ruling 5 (no migration; 0031 forward-only if ever).

## Citations re-verified (every file:line relied on; corrected where moved)

Exact at `dff58f2` (and at `883e5e3`, since the diff is `docs/prompts/` only): `model-config.ts`
:52-58, :65, :78, :92, :130-185, :156-159 (+ message :163), :164-165, :182, :213, :224-240;
`analysis-registry.ts` :35, :54-110, :119-139 (finder; verdict type :112-115);
`analysis-registry.test.ts` :19-28, :50; `pricing.ts` :17-31 (:30 fallback); `openai-client.ts`
:16-20; `openai-provider.ts` :36-43, :147, :164-165, :207, :258; `synthesize.ts` :437-449, :604,
:649, :701; `embeddings/client.ts` :15-45, :131-144; `schema.ts` :609-663, :615, :761-781, :850-862;
`map-worker.ts` :582-601, :761-799, :822-863, :868, :874, :1033; `digest.ts` :149, :160-164, :171,
:218, :231; `llm-match.ts` :46-48, :227, :248, :261-271, :288, :306, :309, :316; `validation/run.ts`
:246; `entity-audit/route.ts` :34-46, :64-72, :76-81, :102-120, :127; `runner.ts` :146-148, :171-180,
:184-186, :331-342, :336, :344-346, :489-520, :504, :506, :555-593; `live-runner.ts` :92, :102-112,
:114, :126-165, :191-301, :250-258, :303-317, :308, :404, :412-424, :473, :501, :899-910;
`contracts.ts` :436, :597-613, :614-674; `hardening-cli.test.ts` :192-206; `isolation.test.ts` :19-25,
:68, :118-131, :146-156; `capture.ts` :222-241, :257-286; `analysis-eval.ts` :273-278, :315-329,
:493, :528-568, :734, :859-864, :1233-1249, :1284-1302; `llm-guard.ts` :11-22, :36-43, :105-136,
:177-188, :194-226, :256-267; `spend-guard.ts` :54-60, :65-73, :108-158, :113-117, :136, :161-166,
:212-236, :237-248, :259-265; `provider.ts` :37-45, :63, :66-74, :76-96; `anthropic-provider.ts` :17,
:54, :60, :62, :63-72, :78-113; `router.ts` :65-126; `ask/registry.ts` :31-66, :73-76;
`ask/registry.test.ts` :5-12; `limits.ts` :282-298, :309, :445-451, :733; `config.ts` :51-59,
:101-103; `answer.ts` :152-153, :573, :638-651, :687-707, :722-753; `answer-stream.ts` :125;
`rerank.ts` :161-168, :198-210; `run-guards.ts` :39-50, :86-99; `retrieve-v2.ts` :46, :133-140,
:160-167, :221; `retention.ts` :13, :81; `eval-run.ts` :209; `llm/openai.ts` :37, :141-192, :142,
:160, :180-185; `backfill-embeddings.ts` :42, :74, :83, :92; `x-api.ts` :196-207, :216-223;
`ask-eval-harvest.ts` :184-190; `map-remap.ts` :1-30, :158-171, :297, :314, :326-337, :457, :616-658,
:639-641; `map-backfill.ts` :1-24, :327; `map/route.ts` :58-62, :63-88, :97-100, :104;
`map-prompts.ts` :16-18, :23-26, :242-266; `map-prompts.test.ts` :212-227; `map-versions.ts` :13,
:20, :32, :41; `authz-page-gate.itest.ts` :48-56, :58-59, :149-163, :165-181, :338-370;
`neon-branch.ts` :1-6, :47; `well-formed-slice.ts` :39, :69; `import-graph.test.ts` :14-24, :46,
:54-61; `map-batch-error-classification.itest.ts` :11, :39, :83; `map-worker-spend.test.ts` :16-23,
:55-66, :110-144; `llm-match-guard.test.ts` :63-74, :111-120, :137-143; `model-config.test.ts`
:18-28, :39, :296, :301-312, :325-361, :363-376; `openai-provider.test.ts` :9-30, :90-97, :115,
:141; `docs/OPEN-TASKS.md` #33 :167-187, #44 :369-371, #82 :839-845, #83 :846-851, #84 :852-862,
#85 :875-889, #97 :1195-1230, #100 :1465-1474; `CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` §9
:263-281, §5 :136-170, §12.1 :371-390, §12.5 :449-466; `PENDING-MERGE-ADJUDICATION-2026-08-25.md`
:90-95 (cited :90-96); `docs/SETUP-NEXT-WEEK.md` :29-31 (cited :25-35).

Moved / corrected: `openai-client.test.ts` source-scan block is **:30-61** (cited :35-60);
`isolation.test.ts` exemption is **:137-143** (cited :137-141); `map-remap.ts:46-51` is the
shared-daily-envelope caveat, NOT a `workloadDispatchConfig` site (the driver never calls it — the
route does); `contracts.test.ts:7-13` is the import tail (the dataset allowlists are :11-26);
`analysis-registry.ts` finder spans **:112-139** with the function at :119; `map-prompts.ts` basis
doc comment starts at :242 with the function body at :254-266 (both cited forms are right).

Prompt facts corrected by verification: the remap driver has NO `--estimate`/`--resume`/`--base`
flags (estimate = default mode; checkpoint = implicit; `MAP_BACKFILL_BASE` env only); a dry remap
estimate needs no provider key and is not blocked by `LLM_DISABLE=1`; `anthropic-provider.ts:62`
already calls `assertLlmEnabled` (step 09 pins, does not add); OPEN-TASKS #97's
`openai-provider.ts:153` site is already repaired (`digestDocLine` :36-43); OPEN-TASKS #44's
`x-api.ts:166` cite is stale (:201, :223); #100's "lives on the parked branch" premise is wrong (PR #49
corrects it); the Ask registry parity test does not constrain `PRICES_PER_MTOK` rows; `MAP_CONTENT_CHARS`
is an env-only way to create remap work under the baseline.

## Decisions needed (INDEX IDs + new; options, recommendation)

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| R1 (CP1) | Ask per-model attribution shape | (a) read-only report over `ask_usage` (PR-2.1-1); (b) a `model` column — NOT on `provider_usage` (UNIQUE (provider, day) → stamps only the last model); if a column, on `provider_usage_reservations` or a sibling table = migration 0031; (c) per-model rows — STOP (splits `ASK_USD_CAP_DAILY`; ruling 4 env ordering) | (a) now; revisit after eval step 4 |
| R2 (CP1) | Registry-version bump strategy | decouple offline identity only (PR-2.2-2) vs bump now | decouple only; the bump lands with the first non-OpenAI approval (§5.6 inventory is mechanical) |
| R3 (CP1) | `hasScorecard()` on the Auto money path | yes (PR-2.1-3, degrade with provider `"unscorecarded"`) / no | yes, behind the byte-identical no-override pin |
| R4 (CP2) | WS-2.3 measurement path | (a) `MAP_CONTENT_CHARS=1499` on the fork-bound server; (b) prompt-hash code bump on an unmerged branch; (c) lock relaxation — forbidden | (a) |
| D7 (CP2) | Measured remap spend | defer / authorize ceiling C on the fork's ledger with the copied-ledger cap arithmetic (§6.3 step 6), one day, `--limit 1000` | defer to CP2; `--estimate`-equivalent default mode only until then |
| R6 (new; before 20b) | B metering row's caps | reuse `LLM_SPRINT_USD_CAP` + `LLM_DIGEST_USD_CAP` on row `anthropic_digest` (per-row envelope; entity-audit precedent; no env change) vs dedicated `ANTHROPIC_DIGEST_USD_CAP` (ruling 4: all Vercel envs first) | reuse |
| R7 (new; before PR-2.2-B2) | Anthropic model id + operator-verified list price for the pricing row | operator supplies both, verified on the day | — (operator fact) |
| R8 (new) | Embedding prices beyond `text-embedding-3-small` | add operator-verified rows (`text-embedding-3-large`, `ada-002`) or leave unpriced (refused by PR-2.1-2) | leave unpriced until a swap is wanted |
| R9 (new) | Spend guard for `ask-eval-harvest --generate` | `askGuardFromEnv()` (`openai_ask`, pollutes the product ledger) / new `openai_ask_eval` row on local-only `ASK_EVAL_USD_CAP_DAILY` / operator-only tooling, no guard | factory swap + exemption removal now (HYG-82); guard as a follow-up under the second option |
| R10 (new) | `X_DAILY_USD_CAP` read with fail-open `envNum` vs every LLM guard's fail-closed `envCap` | align (behaviour change: an env with the var unset stops X ingest) / leave | align in a later PR with the ruling-4 env note; comment-only now |
| R11 (new; deferred with C) | The `$0` price class for `openai_compatible` — reverses the 2026-08-25 "local ids stay out of `PRICES_PER_MTOK`" stance | reverse with an explicit row + request-cap-only guard / keep | record only; decide when C is scheduled |
| R12 (new; before an entity-audit coverage PR) | Entity-audit response format | keep `json_object` + a non-strict eval path / move production to strict `json_schema` (request change → re-observe) | keep `json_object`; non-strict eval path |
| R13 (new; before PR-2.2-B3) | Anthropic digest cells have no strict-schema equivalent | record `schemaMode` in the identity and treat as a separate comparability class / refuse to evaluate | record `schemaMode` |

## Debt and risks

- Two PRs in this window change tests that pin exact shapes (§5.1's list); a session that "fixes" a
  failing `toEqual` by deleting the assertion instead of adding `provider: "openai"` weakens the
  identity pins — step 17 should diff the assertions, not just the source.
- The env NAMES `MAP_PROVIDER`/`REDUCE_PROVIDER`/`DIGEST_PROVIDER`/`ENTITY_AUDIT_PROVIDER` coincide
  with the row-key CONSTANT names in `llm-guard.ts` (comment added; auditors should not confuse them).
- `ANALYSIS_PROVIDER` keeps three meanings (`stub` offline switch honoured at eight sites; `anthropic`
  refused by step 09; unset) and is never a routing input — a future session must not "unify" it
  into `<W>_PROVIDER`.
- `provider_usage` rows stay OpenAI-branded (`openai_*`) and `llm_match` is an inline literal; a
  provider-visible spend view will eventually want `<provider>_<workload>` rows — B1 starts that
  convention with `anthropic_digest`.
- The Anthropic path has no strict structured-output equivalent (R13); prompt-embedded JSON is a
  quality risk the paid scorecard must measure before any approval.
- Option C's request-cap-only guard shape is a `SpendGuard` contract change; `dailyUsdCap: 0` and
  `null` currently refuse for different reasons (`daily_usd` vs `daily_usd_unset`) — document both
  when C is scheduled.
- The remap dry-run projection multiplies a bounded-window per-1k figure by the full eligible corpus;
  language mix and doc length vary by theater, so the projection is a band, not a point.
- `retrieve-v2.ts:46` makes Ask lexical-only whenever `OPENAI_API_KEY` is absent — an Anthropic-only
  environment silently degrades Ask (not a WS-2 change; noted for any future Ask-on-Anthropic work).
- OPEN-TASKS line numbers cited here shift once PR #49 merges (it edits #89/#92/#100/#102/#103
  headers); cite by item number in later PRs.

## Handoff

### Step 09 (running concurrently in `ws2-provider`) — note for the operator to pass on
`anthropic-provider.ts:62` ALREADY calls `assertLlmEnabled` (typed `LlmDisabledError`); the prompt's
"contains no `LLM_DISABLE` check at all" is stale — PIN it, don't add it. Keep the refusal class
`ModelConfigError` and a message that names OPEN-TASKS #83; PR-2.2-B1 replaces the refusal by routing
`getProvider()` through `resolveWorkloadModel("digest").provider` and keeps the
`ANALYSIS_PROVIDER=anthropic` refusal with an updated message.

### Step 12 rewrite text (paste as the PR list; R2 answer = decouple only)
"PR 1 = PLAN-WS-2 §5.1 exactly: new `src/lib/llm/providers.ts` (vocabulary
`openai|anthropic|openai_compatible`, per-workload allowlist all `{openai}`, `analysisReasoningCapable`,
`AnalysisWorkload` moved + re-exported), `<W>_PROVIDER` in `WORKLOAD_ENV`, provider checks FIRST in
`resolveWorkloadModel` (stub → unknown → not-allowed → non-openai-needs-model), `pricedFor(provider,
model)` with the optional `provider` field on price rows, `provider` on config/identity/approval,
`analysisApproval(workload, provider, model, effort)`, `live-runner.ts:160` passes `"openai"`, the
inspector prints provider, the `.env.example` block, the `llm-guard.ts:10` comment. Update the seven
exact-shape pins and two env lists named in §5.1; add the refusal, refuse-before-reserve (five sites),
string-tag, import-graph/base-URL and inspector tests. Do NOT touch `model-config.ts:156-163`,
`MAP_BASELINE`, `map-prompts.ts:254-266`, `openai-client.ts`, or any `openai:` string. PR 2 = §5.2:
`runner.ts:506` compared only when `headerIsLive(existing)`; three runner tests; the body states
`git diff --stat docs/evals/analysis/` is empty and lists the §5.6 inventory. Report in Handoff: the
exact refusal strings (§5.1), the identity shape `{workload, provider, model, reasoningEffort,
registryVersion, approval}`, and that offline files must keep `provider: "stub"`."

### Step 11 rewrite text (R1 = (a) and R3 = yes assumed; else drop 2.1-3 and hold)
"Execute PLAN-WS-2 §4 in order: PR-2.1-1 (attribution report; one branch, with HYG-44 and HYG-82
as separate commits on it — HYG-82 = factory swap + delete `isolation.test.ts:141`; no guard unless
R9 is answered), PR-2.1-2 (embed pricing — rewrite the `client.test.ts:100-112` 3-large pin to the
refusal; pin `retrieve-v2` lexical-only degradation with zero reservations), PR-2.1-3 (Auto scorecard
gate — provider literal `unscorecarded`, `answer-stream.ts:125` twin, `DEGRADED_PROVIDERS`, router
reason). PR-2.1-4 is HELD: do not build a `model` column on `provider_usage` (§4.4). #84: nothing to
code. Acceptance per §4; report which PRs merged, which are held on R1/R3, and tell step 17 to attack
the refuse-before-reserve pins in PR-2.1-2 first."

### Step 22 rewrite text (R4 = (a) assumed; D7 unanswered → estimate only)
"Follow PLAN-WS-2 §6.3 verbatim. Corrections to this prompt: the driver's estimate is the DEFAULT
mode (no `--estimate` flag; never pass `--execute` in the estimate phase); resume is the implicit
checkpoint under `data/remap-state/`; `MAP_BACKFILL_BASE=http://localhost:3000` is env-only (no
`--base` flag); dry runs need only `DATABASE_URL` + `CRON_SECRET` (blank every paid key and set
`LLM_DISABLE=1` — verified: the worker's dry block returns before `assertLlmEnabled`); create
pending work with `MAP_CONTENT_CHARS=1499` on the fork-bound server (R4 a) — never edit
`model-config.ts` or the prompt files; open PR-2.3-1 (`--base-ack`) as the companion PR with its
proposed decision-log line; write the lock-replacement note from §6.4; if D7 is unsigned print
`AWAITING AUTHORIZATION: D7` after the estimate and stop. The only dependency on step 02 is PR #50's
driver-header rewording."

### Step 20 / 20b rewrite text (after 12 merged and 17's verdict; D2 = B)
"PR 1 = PLAN-WS-2 §7.1 (`--provider`, `EVAL_DISPATCHABLE_PROVIDERS = ["openai"]`, provider through
`evalDispatchConfig` → `liveIdentity`, union widened, `+provider=<id>` positioned BEFORE the
profile/votes suffixes with the one-line pairing strip, capture attempt lines gain provider,
`--capture-reconcile --provider`, banner; committed offline files byte-identical). PR 2 = §7.2
(entity-audit prompt extraction; golden request test; R12 recorded). Embeddings coverage: §7.3 note
only. 20b (D2 = B): B1 on merged 09 + 12 per §5.4 — pure `anthropic-dispatch.ts`, `anthropic_digest`
row via `anthropicDigestGuardFromEnv()` on existing envs (R6 = reuse assumed), `analyze()` order
reserve < fetch < record < parse with truncation recorded then thrown ("truncated" in the message),
`dispatch: dispatchIdentity(dispatch)`, `getProvider()` selects on `resolveWorkloadModel("digest")
.provider` and never falls back, step 09's `ANALYSIS_PROVIDER=anthropic` refusal kept with the
updated message, digest allowlist `{openai, anthropic}`, the explicit `LLM_DISABLE` acceptance line.
B2 only with R7 in hand. B3 after PR 1, flagging R13. If D2 were A: skip 20b — PR-2.2-1/2 already
leave the seam ready (allowlist edit + price row + registry entry are the whole activation surface)."

### Step 17 (audit of 09/11/12) — what to attack first
(1) any `<W>_PROVIDER` value reaching `tryReserve` without the allowlist (mutate it out; the five site
pins must fail); (2) `pricedFor` with an absent `provider` field must mean openai, never "any";
(3) `analysisApproval` arity at every caller; (4) the persisted identity JSON shape vs the
`quality-funnel.ts:474-475` string sentinel; (5) PR-2.1-2's refusal position relative to SDK
construction and reservation; (6) PR-2.1-3's `answer-stream.ts` twin; (7) that no test pin was
deleted rather than extended.

### Step 25 (docs sync)
Apply the "Proposed AGENTS.md changes" below; fold R6–R13 into INDEX §2 (or renumber if the operator
prefers); update `docs/prompts/2026-09-05-48h-22-remap-dry-run-runbook.md` per §6.5 and the step
11/12/20 prompts per the texts above.

## Proposed AGENTS.md changes (for step 25 — this PR edits nothing in AGENTS.md)

- **Architecture, "LLM behind `AnalysisProvider`" sentence (≈:26-29):** after step 09 + PR-2.2-B1,
  replace "`anthropic` implemented in the seam (no key in any env yet — auto-selected if an Anthropic
  key exists and no OpenAI key does)" with "`anthropic` wired through `model-config.ts` for the
  `digest` workload only, metered on `anthropic_digest`, selected solely by `DIGEST_PROVIDER=anthropic`
  + an approved `DIGEST_MODEL` (no registry approval exists — dormant); key presence never selects a
  provider" (step 09's report supplies the interim wording if B1 has not merged).
- **Architecture, routing sentence:** "resolved at CALL time by `src/lib/llm/model-config.ts`" →
  add "per (provider, model, effort); providers are allowlisted per workload in
  `src/lib/llm/providers.ts` (all `openai` today)".
- **Standing ruling 4, configuration paragraph:** "a model with no entry in `src/lib/llm/pricing.ts`,
  or a (workload, model, effort) with no `analysis-reg-v1` approval" → "a provider outside the
  workload's allowlist, a model not priced for that provider in `src/lib/llm/pricing.ts`, or a
  (workload, provider, model, effort) with no registry approval" (drop the version literal so §5.6's
  bump needs no AGENTS edit).
- **Standing ruling 13:** append "A map PROVIDER other than `openai` is refused by the allowlist
  before the lock; a provider change would also change the extractor-version basis and is therefore
  covered by the same lock."
- **Directory map, `src/lib/llm/`:** add `providers.ts (provider vocabulary + per-workload allowlist)`.
- **Decision-log entry (draft, for the operator to sign at the checkpoint):** "2026-09-06 (PLAN-WS-2
  routing matrix accepted as the WS-2 specification) — steps 11/12/20/22 execute
  `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md`; D2 = B; R2 = decouple only (no
  `analysis-reg-v2` bump until the first non-OpenAI approval); R4 = env-driven basis bump on a fork
  (`MAP_CONTENT_CHARS`), the lock predicate untouched; every in-window WS-2 PR is $0 with no Vercel env
  change; PR-2.1-4 held on R1; option C deferred with its `$0`-class decision (R11) recorded; the
  remap driver gains a `--base-ack` guard." Plus the R1/R3/D7/R6/R7 answers once given.
