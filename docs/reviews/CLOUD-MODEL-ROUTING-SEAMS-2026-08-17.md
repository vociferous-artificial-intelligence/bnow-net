# Cloud-model routing seams — 2026-08-17

Routing and metering INFRASTRUCTURE only: this branch makes later cloud-model
trials safe and measurable. It selects no new model, proves no quality change,
sets no environment variable, makes no paid call, and deploys nothing. With
every new variable absent, behavior is equivalent to `main` (test-pinned).

- Base SHA: `26989f75b8e27442a2fcc44265e7f2907b6c53d4` (= `origin/main`)
- Implementation commit: `8953008` (`llm: workload-scoped model routing with
  fail-closed dispatch and model-aware metering`)
- Final SHA: the commit adding this report + review remediations — the branch
  tip of `codex/cloud-model-routing-seams-20260816`
- Branch: `codex/cloud-model-routing-seams-20260816`, independent of (never
  stacked on) the Candidate B cron branch; both start from the same base.

## 1. Call-site inventory (before → after)

Paid OpenAI dispatch sites in the ANALYSIS pipelines (Ask inventoried below
but deliberately untouched):

| Workload | Site | Model source BEFORE | AFTER | Params BEFORE | Metering BEFORE → AFTER |
|---|---|---|---|---|---|
| map | `src/lib/analysis/map-worker.ts` extractBatch | `MAP_MODEL` const from map-prompts.ts = `OPENAI_MODEL ?? gpt-4o-mini`, frozen at module import | `workloadDispatchConfig("map")`, resolved per run, gated | `temperature: 0.2`, `max_completion_tokens` | model-blind `estimateUsd` → `estimateCostUsd(model,…)` |
| reduce | `src/lib/analysis/synthesize.ts` synthesisVote | the SAME `MAP_MODEL` const (hidden coupling) | `workloadDispatchConfig("reduce")`, own workload | `temperature: 0.2`, `max_completion_tokens` | model-blind → model-aware |
| digest (legacy) | `src/lib/analysis/openai-provider.ts` analyze | module-level `MODEL = OPENAI_MODEL ?? gpt-4o-mini` | `workloadDispatchConfig("digest")` at analyze(); `name` from the non-throwing resolver | `temperature: 0.2`, `max_completion_tokens` | model-blind → model-aware |
| validation | `src/lib/validation/llm-match.ts` | `OPENAI_MODEL ?? gpt-4o-mini` at call | `workloadDispatchConfig("validation")`; blocked config degrades to keyword matcher | `temperature: 0`, no output ceiling (unchanged) | inline `USD_PER_*` constants → model-aware |
| entity_audit | `src/app/api/cron/entity-audit/route.ts` | `OPENAI_MODEL ?? gpt-4o-mini` at call | `workloadDispatchConfig("entity_audit")`; blocked config → 503 before reserve | `temperature: 0`, `response_format: json_object`, no ceiling (unchanged) | model-blind → model-aware |

SpendGuards (all UNCHANGED): map `mapGuardFromEnv` (`openai_map`), reduce
`reduceGuardFromEnv` (`openai_reduce`), digest `digestGuardFromEnv`
(`openai_digest`), validation `llm_match` guard, entity-audit
`entityAuditGuardFromEnv` (`openai_entity_audit`). Reserve-before-dispatch,
429-retry-takes-fresh-reservation, and truncated-response recording are all
preserved verbatim at every site (ruling 4/8).

Ask (inventoried, NOT routed here): `ASK_ANSWER_MODEL` (default gpt-5) and
`ASK_RERANK_MODEL` (default gpt-5-mini) in `src/lib/ask/config.ts`;
reasoning controls fixed per stage (`answer.ts` reasoningEffort "low",
`rerank.ts` "minimal"); per-model params in `src/lib/ask/llm-params.ts`;
scorecard gating in `src/lib/ask/registry.ts`; cache identity includes model +
effort (`cache.ts`). Zero Ask files changed — its scorecard/cache/router/
session/billing contracts are why Ask keeps its own seam.

Non-OpenAI: `anthropic-provider.ts` (`ANTHROPIC_MODEL`, key absent in every
env, UNMETERED — pre-existing, untouched, see §8), embeddings
(`ASK_EMBED_MODEL`, own guard, untouched), OpenSanctions (no LLM).

## 2. The resolver (`src/lib/llm/model-config.ts`)

One typed, server-side authority, resolved at CALL time (no import-time env
snapshot anywhere — the old `MAP_MODEL` const is gone):

| Workload | Model precedence | Effort env |
|---|---|---|
| map | `MAP_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini` | `MAP_REASONING_EFFORT` |
| reduce | `REDUCE_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini` | `REDUCE_REASONING_EFFORT` |
| digest | `DIGEST_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini` | `DIGEST_REASONING_EFFORT` |
| validation | `VALIDATION_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini` | `VALIDATION_REASONING_EFFORT` |
| entity_audit | `ENTITY_AUDIT_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini` | `ENTITY_AUDIT_REASONING_EFFORT` |

Rules (all test-pinned in `model-config.test.ts`, 22 tests): values trimmed;
blank/whitespace = absent; effort allowlist `minimal|low|medium|high`
(case-insensitive), absent effort adds NOTHING to any payload; invalid effort,
effort-on-non-reasoning-model, and UNPRICED model (no `PRICES_PER_MTOK`
entry) all FAIL CLOSED via typed `ModelConfigError` from
`workloadDispatchConfig()` BEFORE any reservation or billed call.
`resolveWorkloadModel()` never throws (safe for read-side consumers:
extractor versioning, provider tags, the inspector). Failure surface per
site matches its documented semantics: map/reduce/digest throw (route records
`cron_runs.ok=false` / ladder rethrows), llm-match warns + degrades to the
keyword matcher, entity-audit returns 503 before reserving — mirroring
ruling 9's site-specific `LLM_DISABLE` split, which is itself unchanged.

Dry-run inspector: `npx tsx scripts/model-routing-inspect.ts` prints the
resolved matrix (model, source env, effort, priced, ok/BLOCKED + reason) plus
the Ask models, with zero provider/DB contact — smoke-run during this work in
default, override, and blocked configurations.

## 3. Defaults unchanged — the equivalence argument

With no new env set (production today: `OPENAI_MODEL` unset everywhere):

- every workload resolves `gpt-4o-mini`, source `default`;
- `analysisChatParams()` returns exactly the historical non-reasoning shapes
  in the historical key order — `{temperature, max_completion_tokens}` for
  map/reduce/digest, `{temperature}` for llm-match/entity-audit — pinned by
  tests including `Object.keys()` order;
- the mapreduce provider tag is byte-identical (`openai:gpt-4o-mini+mapreduce`),
  the legacy digest provider name is byte-identical (`openai:gpt-4o-mini`),
  entity-audit's response `model` field is unchanged;
- `mapExtractorVersion()` output is byte-identical: a test re-derives the
  HISTORICAL basis formula inline and asserts equality, so no deployed
  doc_claims row goes stale;
- metering arithmetic for gpt-4o-mini is the same list price through
  `estimateCostUsd` (parity-pinned to the historical constants; the first
  adversarial review measured the only difference at floating-point
  association order — ~1e-19 USD per record, immaterial);
- one deliberate hardening of a pathological config: `OPENAI_MODEL` set to an
  empty/whitespace string used to dispatch model `""` (the old `??` fallback
  does not catch empty strings); the resolver treats blank as absent →
  `gpt-4o-mini`. Strictly safer; flagged by review 1 as the sole
  behavior-affecting edge, and only for a broken configuration.

## 4. Map ↔ reduce separation and version identity

- `synthesize.ts` no longer imports the map model; reduce dispatches its own
  workload. `MAPREDUCE_PROVIDER_TAG` (module const) became
  `mapreduceProviderTag()` — identical string while the stages match; a
  diverging `REDUCE_MODEL` is recorded explicitly
  (`openai:<map>+mapreduce+reduce=<reduce>`), so digests.provider always
  names the actual dispatched models.
- `mapExtractorVersion()` keys on the MAP resolution only. Test-pinned:
  `MAP_MODEL` changes it; `OPENAI_MODEL` changes it (pre-existing fallback
  semantics); a VALIDATED `MAP_REASONING_EFFORT` on a reasoning model changes
  it (effort is part of extraction identity); `REDUCE_MODEL`/
  `REDUCE_REASONING_EFFORT` never change it; a non-dispatchable EFFORT
  (invalid value, or effort on a non-reasoning model) never shifts the
  version — in those configs the resolved MODEL is unchanged, so extraction
  identity is unchanged and the read-side filter must not move. The MODEL
  case is deliberately different (second adversarial review, finding 3): an
  unpriced `MAP_MODEL` DOES shift the version even though dispatch is
  blocked, because the configured model IS the extraction identity.
  Consequence of that misconfiguration, disclosed: map runs fail loudly
  (`cron_runs.ok=false`, typed error), the read-side filter points at an
  empty version, mapreduce falls back to the legacy digest engine, and
  `map_health` reports the theater stale until the config is fixed or
  reverted — fail-closed and observable, where `main` would have kept
  dispatching the unpriced model with silently wrong metering. Reverting the
  env restores the old version and its intact rows (append-only store).
  Consumers (`map-versions.ts` → `reduce-io.ts`, `map-health.ts`, scripts)
  are untouched and keep filtering to current versions.
- Version-vs-dispatch coherence inside one run: the worker resolves the
  version map and the dispatch config in the same invocation from the same
  process env; serverless env is immutable per invocation.

## 5. Metering and the unknown-model policy

`src/lib/llm/pricing.ts` stays the SINGLE price authority (values untouched;
the Ask registry parity test keeps pinning it). Every routed site now meters
the ACTUAL dispatched model with input/output separation. Policy for unknown
models, in order:

1. **Fail closed before dispatch** — `workloadDispatchConfig()` refuses any
   model without an exact price entry. Activating a new model REQUIRES adding
   its verified price first.
2. **Conservative ceiling as defense-in-depth only** — `estimateCostUsd`'s
   unknown fallback ($5 in / $15 out per 1M) still exists behind the gate,
   and a test pins that it can never undercut any table entry.

Why the gate and not the ceiling (verified during this run, 2026-08-17, from
https://developers.openai.com/api/docs/pricing + the gpt-5-mini model page):
OpenAI now lists a **GPT-5.6 family** — gpt-5.6-sol $5/$30, gpt-5.6-terra
$2/$12, gpt-5.6-luna $0.20/$1.20, gpt-5.6-cyber **$12.50/$75** per 1M. The
"conservative" ceiling would UNDERESTIMATE gpt-5.6-cyber ~5× on output and
gpt-5.6-sol 2× — exactly why unpriced models must not dispatch at all.
**No GPT-5.6 price was added; GPT-5.6 activation is BLOCKED** pending
operator-verified pricing (and everything else in §9).

**Observed pricing discrepancy (documented, deliberately NOT changed here):**
both official pages checked list **gpt-5-mini at $0.25 in / $2.00 out**,
while the deployed table (`pricing.ts`, mirrored by the Ask registry) carries
$0.125/$1 — a 2× gap. Either OpenAI repriced gpt-5-mini after the table was
verified (2026-07) or the sources disagree with the account's actual billing.
Consequence if the new price is real: production Ask RERANK metering (and any
future gpt-5-mini analysis routing) underestimates spend ~2×. Changing the
deployed metering table alters production billing estimates and the
registry-parity pair, so it needs its own operator-reviewed change — flagged
as a follow-up, not smuggled into this branch.

## 6. Request compatibility

No endpoint migration: everything stays on Chat Completions. For ROUTED
models only, `analysisChatParams()`: non-reasoning models keep today's exact
payloads; reasoning models (gpt-5 family, o-series) NEVER receive
`temperature`, keep `max_completion_tokens` where the site sets one, and gain
`reasoning_effort` only when the workload's validated env is set. Strict
structured outputs are untouched at every site (json_schema strict:true at
map/reduce/digest/llm-match — including ruling 7's minItems=maxItems batch
pinning in `mapResponseSchema` — and entity-audit's json_object). Invalid
effort configuration fails before dispatch. No live provider request was made
to test compatibility (the profile forbids it); reasoning-model payloads are
asserted structurally, not against the live API — listed as a residual risk
in §8.

## 7. Gates — exact commands and actual results

Worktree `/Users/go/code/bnow-net-worktrees/cloud-model-routing-20260816`,
Node v24.14.0 / npm 11.9.0:

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **2,154 passed / 2,154 (167 files)** — was 2,123/166 on main; +31 tests, all new/extended here |
| `npm run build` (dummy never-contacted `DATABASE_URL="postgresql://build:build@localhost:5432/build"`) | PASS (exit 0). Pre-existing env condition, proven at base during this run: fresh worktrees lack `.env.local`, and `next build`'s page-data collection for `/sitemap.xml` imports `@/db`, which throws when `DATABASE_URL` is unset — reproduced byte-for-byte on the unmodified base tree; the dummy value satisfies module load and is never contacted (build completed with zero connection errors) |
| `npm run test:integration` (disposable Neon fork `br-green-fog-at9m6flc`, created + deleted; paid keys blanked, `LLM_DISABLE=1`; credentials passed inline — no `.env.local` created in this worktree) | **106 passed / 1 failed / 107 (17 files)** — the failure (`ask-events.itest.ts:100`, snapshot candidates empty) is PRE-EXISTING: reproduced identically on unmodified `main` at `26989f7`; unrelated to this branch (no Ask code touched) |
| `npx tsx scripts/model-routing-inspect.ts` (default + override + blocked configs) | prints the matrix; BLOCKED rows show the exact fail-closed reasons; zero provider/DB contact |

Payload/metadata equivalence vs main is enforced by tests rather than a
one-off diff: params key order + values, provider tags, provider name, and
the byte-identical historical extractor-version basis are all pinned.

## 8. Remaining risks and pre-existing gaps (documented, not fixed here)

1. **Reasoning-model payloads are structurally asserted, not live-tested** (no
   paid calls allowed). First activation must include a single guarded probe
   call as part of the evaluation phase.
2. **Pre-existing:** analysis-path SDK clients keep the OpenAI SDK default
   `maxRetries: 2` (map-worker, synthesize, openai-provider, llm-match,
   entity-audit) — one reservation can cover up to three physical attempts on
   429/5xx. The Ask gateway disables retries; the analysis paths never did.
   Unchanged by this branch (behavior-preserving mandate); worth its own fix.
3. **Pre-existing:** llm-match's single-shot fallback (sprint cap unset or
   `MATCHER_MODE=single`) dispatches without any SpendGuard and records
   nothing to provider_usage. Production runs the guarded majority path.
4. **Pre-existing:** the Anthropic digest provider is unmetered and
   un-guarded (no key in any env, so it cannot dispatch today), and its
   default `ANTHROPIC_MODEL` is still read at module import.
5. **Pre-existing:** the legacy Ask pipeline's `openaiLegacyChatCompletion`
   path is unguarded by charter (byte-faithful rollback).
6. `OpenAiProvider.name` resolves at construction while `analyze()` resolves
   at dispatch; a mid-process env change could in principle diverge them.
   `getProvider()` constructs per call and serverless env is immutable per
   invocation, so this is theoretical (review 1: "cosmetic", and a strict
   improvement over main's module-import freeze); noted for completeness.
7. **gpt-5-mini price discrepancy** (§5) — operator follow-up.
8. The effort allowlist admits `minimal` generically, but o-series models
   reject `minimal` at the API. Unreachable today — no o-series model is
   priced, so every o-series config is dispatch-blocked at the pricing gate
   first — and the activation checklist's compatibility probe (§9 step 2)
   would surface it before any real traffic. Tighten if an o-series model is
   ever priced.

## 9. Future paid evaluation plan + activation checklist (BLOCKED until authorized)

**Illustrative candidate matrix — NON-ACTIVE, blocked from activation pending
verified pricing and paid representative evaluations. No default changes; no
env var is set anywhere by this branch.**

| Workload | Baseline | Candidate(s) — illustrative only |
|---|---|---|
| Map/extraction | gpt-4o-mini | low-cost candidate (e.g. gpt-5.6-luna-class) vs baseline |
| Reduce/synthesis | gpt-4o-mini | balanced model at moderate reasoning (e.g. gpt-5.6-terra-class, `REDUCE_REASONING_EFFORT=medium`) vs frontier at high reasoning |
| Validation | gpt-4o-mini | balanced model at moderate reasoning vs baseline |
| Ask rerank | gpt-5-mini | lower-cost candidate (scorecard-gated in Ask's own seam) |
| Ask visible answer | gpt-5 | frontier at high reasoning (scorecard-gated) |
| Analyst Brief / red-team mode | — | frontier at higher reasoning, evaluated separately from quick answers |

Evaluation dimensions (per candidate, against held-out BNOW days with the
existing A/B harness `scripts/ab-mapreduce.ts` + `ab-report.ts` and the Ask
eval suite): extraction recall + per-batch under-fill rate (ruling 7's
measured failure mode), schema validity, citation fidelity, claim→source
traceability (ruling 2), named-person fidelity (rulings 19/20 fixtures),
hedging/certainty preservation, unsupported-claim rate, event organization,
corroboration judgment, map-version stability across reruns, validation
agreement + variance (k-vote spread), Ask evidence selection, answer
usefulness, latency, input/output tokens, actual cost vs estimate, and
run-to-run variance (the K=5 gate exists because variance killed K=3 —
ruling 18; any model change must re-run that gate before touching
REDUCE_VOTES).

Activation checklist (ALL required, in order, per model per workload):
1. Operator-verified price added to `pricing.ts` (+ registry parity for Ask
   models); resolve the gpt-5-mini discrepancy first.
2. Request-compatibility probe (one guarded, capped call) proving the payload
   shape (temperature-free, effort accepted, structured output honored).
3. Representative paid evaluation over the dimensions above, inside explicit
   caps (`MAP_USD_CAP_DAILY` / `REDUCE_USD_CAP_DAILY` / etc. — ruling 4
   unchanged); A/B gate re-run where the workload has one.
4. For map: accept that changing `MAP_MODEL`/`MAP_REASONING_EFFORT` bumps
   `mapExtractorVersion()` and re-maps the corpus (cost that; the #33 remap
   path applies).
5. Spend-cap review + operator authorization + decision-log entry; only then
   set the env var(s) in Vercel.

Rollback of any activation: unset the workload env var(s) and redeploy —
resolution returns to `OPENAI_MODEL`/default; map consumers automatically
filter back to the default-model extractor version (old rows persist,
append-only). Rollback of this BRANCH pre-merge: close the PR; nothing was
deployed or configured.

## 10. Adversarial reviews and remediation

**Review 1** (isolated read-only agent, fresh context, against commit
`8953008`, full diff + both revisions read): **VERDICT: PASS — no BLOCKER or
MAJOR.** All seventeen examined dimensions confirmed with file/line evidence:
config gate before every reservation at all five sites (fresh reservation on
each 429 retry preserved); unknown models cannot dispatch anywhere (the
conservative ceiling is reachable only on the zero-spend map dry-run path);
no retry/SDK-option change; truncated responses still metered before being
discarded at all three truncation sites; map/reduce independence real (base
synthesize dispatched on the shared map const) with the historical version
basis re-derived from `main`'s formula and confirmed byte-identical when envs
are absent; version filtering coherent in-process; schemas (incl. ruling 7's
minItems=maxItems) untouched; payload key-for-key equivalence at every spread
site; effort validation fail-closed per workload; Ask byte-untouched with the
inspector proven side-effect-free; prompts/K=5/guards byte-unchanged, and a
`ModelConfigError` in the mapreduce engine propagates loudly (cron_runs
ok=false) rather than silently falling back to legacy; LLM_DISABLE precedence
intact; no secret, no activation, no paid call. NOTEs and their disposition:
(a) `.env.example`'s reference to this report was dangling in `8953008`
because the report was still untracked — RESOLVED by this commit, which adds
the report; (b) construction-time `OpenAiProvider.name` snapshot — cosmetic,
documented in §8.6; (c) legacy-vs-model-aware estimator FP drift ~1e-19 USD —
documented in §3; (d) blank-`OPENAI_MODEL` edge now safer — documented in §3;
(e) `minimal` on o-series unreachable — documented in §8.8; (f) llm-match
single-shot unguarded path pre-existing byte-for-byte on main — §8.3;
(g) NUL-byte integrity of map-worker.ts verified in both revisions;
(h) `mapModel()` currently a test-facing accessor. No code remediation was
required; all dispositions are documentation, recorded here.

**Review 2** (second isolated read-only agent, fresh context, on the final
tree including this report): **VERDICT: PASS — no BLOCKER or MAJOR.** All six
review-1 NOTE dispositions verified CONFIRMED against the tree and base
(including byte-for-byte pre-existence of the llm-match single-shot gap via
`git show` on main's file, and the checklist pointer resolving once this
report is committed). Its independent pass re-verified the fail-closed gate
before reservation at all five sites, the byte-equivalent default payload
spread positions, REDUCE_* inertness vs MAP-side version bumps with the
historical basis re-derived from main's formula, pricing.ts values untouched,
Ask byte-untouched, `.env.example` comment-only, no secret/paid-call/
activation, and the +31 test count against the actual new `it()` cases and
file counts. One new MINOR (finding 3): this report's §4 originally presented
the "blocked configs don't move the read-side filter" rationale as a general
principle, but an unpriced `MAP_MODEL` (dispatch-blocked) deliberately DOES
shift the version — remediated by rewriting §4 to state the effort/model
asymmetry and disclose the misconfiguration's loud, reversible starvation
behavior. Remaining NOTEs: gate-execution numbers and the external pricing
observations are unverifiable read-only (presented as executed records, all
countable evidence consistent — the reviewer independently corroborated the
gpt-5-mini discrepancy against published launch pricing); §3's equivalence is
explicitly conditioned on `OPENAI_MODEL` being unset in production; the build
row's formerly cross-branch reference was made self-contained in §7. All
remediations are documentation-only; no code changed after review 1.

## 11. Status

- **No paid provider requests were made** at any point in this workstream
  (the only network calls were read-only documentation fetches for pricing
  verification).
- **No model was activated**; no default changed; the resolver's defaults are
  byte-equivalent to main.
- **No environment variable was changed** in any Vercel env or local file
  (`.env.example` is commented documentation only; no `.env`/`.env.local`
  was created or modified in this worktree).
- **No production deployment occurred**; no migration; no production write.
- **Model-output quality is NOT proven by this infrastructure PR** — only the
  paid evaluation plan above can do that.

Final status: **implementation-pass / enablement-and-paid-evaluation-blocked**
