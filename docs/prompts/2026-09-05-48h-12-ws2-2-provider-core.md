# Step 12 — WS-2.2 core: provider dimension, registry key, offline-identity decoupling (Wave 2, lane R2)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session with a 15-minute plan-mode preamble |
| Lane / worktree | R2 — `/Users/go/code/bnow-net-worktrees/48h-routing2-20260905`, step branches `…/provider-dimension`, `…/eval-identity-decouple` |
| Window | H8 → H16 |
| Depends on | 04 (PLAN-WS-2), 09 merged (build on top of the hardened seam) |
| Decisions | D2 (if unanswered: build exactly the option-independent PRs below; allowlist stays `{openai}`), R2 (INDEX recommends: decouple only, no `analysis-reg-v2` bump in this window) |
| Spend | $0. No env change, no paid call — every refusal is unit-pinned. |
| Closing report | `docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then
`docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` §WS-2.2 (the specification).
**Rewrite note:** at Checkpoint 1 the operator pastes the plan's first two WS-2.2 PRs here
with R2's answer. This prompt fixes the invariants an audit will check.

## PR 1 — `llm: provider dimension on analysis dispatch (allowlist openai; unapproved provider refused before reservation)`

- `WORKLOAD_ENV` (`model-config.ts:52-58`) gains `<WORKLOAD>_PROVIDER`; `WorkloadModelConfig`,
  `AnalysisDispatchConfig`, `AnalysisDispatchIdentity` (:224-240) gain `provider` (default
  `'openai'`). The refusal for an unknown/unapproved provider lands inside the existing
  `dispatchBlocked` chain (:130-185) — before the map-lock check or immediately after it,
  but always before any site's `tryReserve` and before any client construction.
- `analysis-registry.ts`: `AnalysisApproval` gains `provider` (default `'openai'`), the finder
  matches on it (:119-139); the five baseline entries gain an explicit `provider: 'openai'`
  field — what is approved does not change (no entry added, removed, or widened);
  version literal stays `analysis-reg-v1` in this PR and in PR 2 (R2).
- Identity stamped with provider everywhere an `openai:` tag is written or `registryVersion`
  is stamped: `openai-provider.ts:147` (`digests.provider`), `synthesize.ts:437-449`
  (`mapreduceProviderTag`), `embeddings/client.ts:144` (unchanged in behaviour — embeddings
  are not an analysis workload; note it), `map-worker.ts:868`, `synthesize.ts:701`,
  `digest.ts:218`, `llm-match.ts:271,306,316` → `validation/run.ts:246`,
  `entity-audit/route.ts:127`; `scripts/model-routing-inspect.ts` prints it. Persisted tag
  format for provider `openai` stays byte-identical (pin it — downstream parses the
  `openai:` prefix).
- Map: a `MAP_PROVIDER` other than `openai` is refused by the generic provider-allowlist
  branch of `dispatchBlocked`, which sits BEFORE the map-lock check; `model-config.ts:156-159`
  and `MAP_BASELINE` are not edited (ruling 13). A map provider change would also change the
  extractor-version basis (`map-prompts.ts:254-266`) — do not touch the basis either.
- Tests (pins, one per workload where the shape exists): `<W>_PROVIDER=anthropic` (or any
  unknown) → `ModelConfigError` and the guard spy's `tryReserve` never called
  (`map-worker-spend.test.ts`, `llm-match-guard.test.ts`, `openai-provider` shapes);
  `dispatchIdentity` round-trip includes provider (`model-config.test.ts:363-376` pattern);
  `import-graph.test.ts` and `openai-client.test.ts` extended so a second SDK or a second base
  URL would be caught; `analysis-registry.test.ts` pins updated with provider.

## PR 2 — `evals: decouple offline identity from the live registry constant` (no bump unless R2 says otherwise)

- Today `runner.ts:331-342` stamps `ANALYSIS_ROUTING_REGISTRY_VERSION` into every offline
  results header and `resumeIdentityMismatch` (:489-520) compares it; `hardening-cli.test.ts:192-206`
  runs the COMMITTED offline files under `docs/evals/analysis/results/` and asserts no refusal
  and byte-identical output. A naive bump rewrites dataset-dir files. Decouple: offline
  identity records the registry version the file was produced under and the comparison treats
  offline files as identity-stable across registry bumps (live files still compare strictly).
  Do NOT bump the literal in this window (R2): the bump lands with the first non-OpenAI
  approval, and the PR body lists every test that hardcodes `analysis-reg-v1`
  (`model-config.test.ts:296,373`, `analysis-registry.test.ts:50`, `map-worker-spend.test.ts`,
  others from `git grep analysis-reg-v1`) so that later PR is mechanical.
- New pin: a live header with a different registry version than the current constant →
  mismatch string names `registryVersion`; an offline header with a different version resumes
  cleanly; **`git diff --stat docs/evals/analysis/` is
  empty** — state it in the PR body. Exposure note in the report (the eval dataset directory
  was adjacent; nothing read beyond results headers).

## Rulings

4 (fail-closed on configuration before reservation — extended to provider), 8 (metering site
unchanged), 9 (per-site degradation unchanged), 13 (map lock untouched; basis untouched).

## Acceptance

Both PRs: typecheck/lint/unit green with counts; `npm run test:integration -- src/integration/map-lease.itest.ts`
(or the plan's named itest) on a fork if any persisted-shape changed; `git grep -n "provider: 'openai'"`
shows the registry entries; no Vercel env named; no paid call.

## Report

Per COMMON §5. In **Handoff**: the exact refusal class/message for an unapproved provider,
the identity shape, and what steps 20/20b and 22 must reuse; what step 17 should attack first.
