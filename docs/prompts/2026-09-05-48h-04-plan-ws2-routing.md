# Step 04 — PLAN-WS-2: the per-stage model routing matrix (Wave 1, lane R)

| | |
|---|---|
| Model / effort / mode | **Fable / xhigh / plan mode** — planning only; the deliverable is documents |
| Lane / worktree | R — `/Users/go/code/bnow-net-worktrees/48h-routing-20260905` |
| Window | H0 → H4 |
| Depends on | — |
| Decisions | D2 (provider ambition) may be unanswered: plan all three options with the shared first PR; R1, R2, R3, R4, R5 — list, recommend, do not decide |
| Spend | $0. No DB. |
| Closing report | `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` (the plan IS the report) |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first. You are planning, not executing: no code,
no tests, no registry edits. Use plan mode for the whole session; write the plan document at
the end.

## Goal

One plan document following handoff §0 item 2 exactly (goal/non-goals; current state with
re-verified file:line; PR-by-PR breakdown with tests and acceptance; rulings touched and
compliance; migrations; env/cap ordering under ruling 4; deploy path; soak/proof plan;
exposure note; session estimates; operator decisions before the first PR) covering WS-2.1,
WS-2.2 (options A, B, C — with the option-independent first PR called out), WS-2.3 and
WS-2.4. Steps 11, 12, 20, 22 execute from it; write each PR so an Opus session can start cold.

## Read (re-verify every line; these were verified against 883e5e3 on 2026-09-05)

- `src/lib/llm/model-config.ts` — `WORKLOAD_ENV` :52-58 (two env names per workload);
  `resolveWorkloadModel` :130-185 with the fixed refusal order (invalid effort → effort on
  non-reasoning → map lock :156-159 → unpriced :164-165 → unapproved) and `registryVersion`
  stamps at :182, :213, :237; `AnalysisDispatchIdentity` :224-240 has NO provider field.
- `src/lib/llm/analysis-registry.ts` — key `(workload, model)` + effort membership :119-139;
  five baseline entries :54-110; version literal :35; test pins in `analysis-registry.test.ts:19-28,50`.
- `src/lib/llm/pricing.ts` :17-31 (5 OpenAI entries; $5/$15 unknown fallback :30).
- `src/lib/analysis/openai-client.ts:16-20` and `openai-client.test.ts:35-60` (source-scan pin of
  the literal `new OpenAI({ maxRetries: 0 })`; the five production dispatch modules + live-runner
  must construct through the factory) — this is the per-stage base-URL seam.
- Provider strings hardcoded `openai:` in persisted outputs: `openai-provider.ts:147`,
  `synthesize.ts:437-449`, `embeddings/client.ts:144`, `schema.ts:615`.
- Every `registryVersion` stamp consumer: `map-worker.ts:868`, `synthesize.ts:701`,
  `openai-provider.ts:258` → `digest.ts:218`, `llm-match.ts:271,306,316` → `validation/run.ts:246`,
  `entity-audit/route.ts:127`; eval plane `runner.ts:336`, `live-runner.ts:311`, compared on
  resume at `runner.ts:506`; **hazard:** `hardening-cli.test.ts:192-206` runs the committed
  offline results under `docs/evals/analysis/results/` and asserts no identity refusal, so a
  bump to `analysis-reg-v2` naively rewrites dataset-dir files (INDEX §1.9).
- Metering rows and guard factories: `src/lib/usage/llm-guard.ts:11-22,105-136,177-188,194-226`;
  `spend-guard.ts:108-158` (refusals `cap_unset`, `daily_usd_unset`; **`dailyUsdCap` 0 refuses
  the first reservation** :136), `spend-guard.ts:259-265` (`envCap` treats 0 as unset);
  `provider_usage` UNIQUE `(provider, day)` `schema.ts:850-862`.
- Anthropic seam: `src/lib/analysis/provider.ts:76-96` (`getProvider()` selects
  `AnthropicProvider` on `ANALYSIS_PROVIDER=anthropic`+key, or on key presence when
  `OPENAI_API_KEY` is absent — no `workloadDispatchConfig`, no `tryReserve`);
  `anthropic-provider.ts:17` (module-import model), `:63-72` (raw `.slice(0,400)`), `:78-113`
  (raw fetch, non-null key assertion, no identity). Step 09 hardens this in parallel — plan
  around it, don't duplicate it.
- Ask: `src/lib/ask/router.ts:65-126` (scorecard gate only in the recording-only router;
  `ASK_ROUTER` default off `limits.ts:445-451`, `config.ts:101-103`); money path `answer.ts:573`,
  `rerank.ts:204`; `ask_usage` already has per-stage model + cost columns `schema.ts:609-663`;
  `run-guards.ts:86-99` shares `openai_ask`; the Ask retention sweep `src/lib/ask/retention.ts:81`
  nulls only `question` (`:13`: cost/token/timing columns stay) — attribution over `ask_usage`
  is unbounded in time.
- Embeddings price constant: `embeddings/client.ts:15-45` (`EMBED_USD_PER_1M_TOKENS`),
  consumers `client.ts:131-144`, `llm/openai.ts:180-185`, `run-guards.ts:48-50`,
  `scripts/backfill-embeddings.ts:74,83`; `ASK_EMBED_MODEL` env-overridable with no price lookup.
- Eval plane: `live-runner.ts:92` (map|digest|validation), `:126-165` (`evalDispatchConfig`),
  `:250-258` preflight, `:303-317` identity literal `'openai'`; `contracts.ts:436` union;
  `isolation.test.ts`; `src/lib/llm/import-graph.test.ts:14-24,46` (the Ask-path SDK rule:
  only the `openai` specifier is matched — not an eval-plane test), `contracts.test.ts:7-13`.
- Existing refuse-before-reserve test shapes to reuse: `llm-match-guard.test.ts:137`,
  `map-worker-spend.test.ts:57-65,111-142`, `model-config.test.ts:301-312,325-361,363-376`.
- `docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` §9 (:263-281) activation checklist;
  `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-96` ("local ids stay out of
  `PRICES_PER_MTOK`"); AGENTS.md rulings 4, 7, 8, 9, 13; the 2026-08-20 (≈849, 908-911),
  2026-08-22 (≈1079, 1136-1139), 2026-08-31/09-01 (≈914, 956-958), 2026-09-03 (≈1779-1790)
  decision-log entries (candidate activation prerequisites; what the paid campaign did NOT
  authorize).
- `scripts/map-remap.ts:3-6,22-27,46-51,641` (the driver dispatches through
  `workloadDispatchConfig('map')` so the lock is NOT relaxed; default target is production);
  `docs/OPEN-TASKS.md` #33 (:167-187), #83, #84, #44 (:369-371 — it is the `X_DAILY_USD_CAP`
  code default at `src/lib/adapters/x-api.ts:201,223`, not an Ask item).

## Plan content the operator expects (beyond the §0 template)

1. **WS-2.1** — three attribution shapes (read-only `ask_usage` report / `provider_usage.model`
   column as migration 0031 / per-model rows that split `ASK_USD_CAP_DAILY`); model-aware
   embedding pricing that keeps the 3-small path byte-identical and refuses an unpriced
   `ASK_EMBED_MODEL` before any reservation; `hasScorecard()` on the Auto money path behind a
   pin that today's production behaviour is unchanged; #84 as a checklist line (step 03) plus
   the record at the next deploy; #44 as the x-api default/comment reconcile.
2. **WS-2.2 first PR (all options):** `provider` on `WorkloadModelConfig` / dispatch config /
   identity with default `openai` and allowlist `{openai}`; `<WORKLOAD>_PROVIDER` in
   `WORKLOAD_ENV`; the refusal lands in the `dispatchBlocked` chain before every site's
   `tryReserve`; registry key gains `provider`; identity stamped with provider everywhere the
   `openai:` tag is written; import-graph/SDK-scan tests extended. **Second PR:** decouple
   offline eval identity from the live registry constant; the `analysis-reg-v2` bump is
   PLANNED (list every literal it will touch) but NOT executed in this window (INDEX R2) —
   with the explicit statement that nothing under `docs/evals/analysis/` changes.
   Then per option: B (pricing entry, provider allowlist, digest through model-config, metered
   identity-stamped `analyze()` on a row that reuses `LLM_SPRINT_USD_CAP`+`LLM_DIGEST_USD_CAP`
   unless a dedicated cap env is chosen — ruling 4 ordering either way; Anthropic has no
   `reasoning_effort` — decide how `allowedEfforts` reads per provider); C (`<WORKLOAD>_BASE_URL`
   through `analysisOpenAiClient(cfg)`, base-URL allowlist policy, per-stage key, the
   request-cap-only guard shape for a $0 class, the explicit `PRICES_PER_MTOK` $0 entry that
   reverses the 2026-08-25 stance — DECISION).
3. **WS-2.3** — the measurement-path DECISION (R4): prompt-hash bump on the branch so remap
   has pending work under the baseline, vs a scoped lock relaxation for a non-production target;
   the Mac can reach api.openai.com, so `MAP_BACKFILL_BASE=http://localhost:3000` against a
   `next start` bound to a disposable Neon branch is the dry-run target (the
   `authz-page-gate.itest.ts` pattern); `--estimate` first; cost per 1k docs; runbook outline
   for step 22; what "registry-approved + remap-complete" gating would replace in
   `model-config.ts:156-159` — plan only, the predicate is untouched in this window.
4. **WS-2.4** — `--provider` flag (fail-closed placeholder when only `openai` is allowed),
   provider-qualified identity/configKey with committed offline files resuming unchanged;
   entity-audit prompt extraction into a pure module (byte-identical request) as the
   precondition for coverage; embeddings coverage lives in the Ask eval runner, not
   `analysis-eval` — say so.
5. **Sequencing with step 09** (Anthropic hardening lands first) and with step 12 (executes
   the first two WS-2.2 PRs). Name which PRs need zero env change and zero paid calls (most).
6. **Rulings table:** 4 (every new row/cap), 7 (any new map model re-measured), 8, 9 (per-site
   degradation preserved for a non-OpenAI provider), 13 (map lock; a map provider change also
   changes the extractor-version basis `map-prompts.ts:254-266`).

## Deliverable

`docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md`, plus the closing-report sections from
COMMON §5 at its end (Scope / Citations re-verified / Decisions needed / Handoff). In
**Handoff**, write the concrete rewrite instructions for steps 11, 12, 20 and 22 — which PR
numbers from the plan each executes, in what order, and what to skip if D2 = A.
