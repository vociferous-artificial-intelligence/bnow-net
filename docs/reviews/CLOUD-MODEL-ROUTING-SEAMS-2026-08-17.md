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

Final status of the original scope above: **implementation-pass /
enablement-and-paid-evaluation-blocked** — superseded by §12's release-
hardening verdict below.

---

## 12. Release hardening — 2026-08-17 (appended; §§1–11 above are the historical record)

**Why the branch was held from merge.** A release review of the original
scope identified controls that had to land before merge: pricing was acting
as the ONLY dispatch gate (an entry in `PRICES_PER_MTOK` implied production
eligibility — pricing is not quality approval); the deployed gpt-5-mini price
was wrong; the analysis SDK clients kept default auto-retries; the llm-match
single-shot path could still spend unguarded (ruling 4); `.env.example`
wrongly implied a MAP_MODEL change "triggers a full re-map" (map-worker
selects `processed = false` docs only — a version bump remaps NOTHING
historical and silently starves consumers); outputs did not durably record
which model configuration produced them; and the integration gate was red.
The branch was treated as NOT MERGEABLE until all of this passed.

### 12.1 Workload quality registry (scorecard gate)

`src/lib/llm/analysis-registry.ts` (version **analysis-reg-v1**), separate
from Ask's registry by design. Production analysis dispatch now requires BOTH
exact pricing AND an exact (workload, model, effort) approval;
`workloadDispatchConfig()` fails closed BEFORE any SpendGuard reservation and
BEFORE any provider-client construction (spy-asserted in
`openai-provider.test.ts` and `llm-match-guard.test.ts`: zero constructor
calls, zero DB queries on a blocked config). Seeded approvals: ONLY the
grandfathered production baseline — gpt-4o-mini with ABSENT effort, per
workload, status `baseline`, each citing real checked-in evidence
(map: MAP-SHADOW-RESULTS.md; reduce: MR3-REDUCE-RESULTS.md — the K=5 A/B gate
ran on gpt-4o-mini; digest/validation/entity-audit: grandfathered, with the
strongest existing reference named). No entry claims a fresh candidate
evaluation that never ran; there is NO `evaluated_candidate` entry and NO
production bypass for unevaluated candidates. Approval is per-workload and
per-effort (injected-registry tests pin that an approval for one workload/
effort never authorizes another).

### 12.2 gpt-5-mini pricing correction

Official price verified 2026-08-17: **$0.25 in / $2.00 out** (cached input
$0.025) per 1M. Corrected in `src/lib/llm/pricing.ts` and its mirror
`src/lib/ask/registry.ts` (the parity test re-verified green), the
harvest-tool table `src/lib/ask/eval-set.ts` (`GENERATION_PRICE_PER_MTOK`),
and every dependent test constant; a dated correction is APPENDED to
`docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md` whose historical text
stays verbatim. Repo-wide search for the stale $0.125/$1 figures: no live
copy remains (this report's §5 recounts the discrepancy as history).
**Operational consequence, stated plainly: Ask's measured/reserved RERANK
cost estimates rise ~2× on deploy — provider billing never changed; the
application had been understating it.** The estimator has no cached-input
dimension, so cached traffic is conservatively estimated at the full input
price.

### 12.3 SDK retry audit

Every analysis OpenAI client is now constructed through
`src/lib/analysis/openai-client.ts` → `new OpenAI({ maxRetries: 0 })`
(matching the Ask gateway's discipline). Constructor sweep of the whole repo
found exactly seven sites: the five analysis dispatch modules (now all via
the factory), the Ask gateway (already `maxRetries: 0`), and
`scripts/ask-eval-harvest.ts` (Ask-scoped eval tooling, out of this branch's
scope — flagged as a follow-up, unchanged). `openai-client.test.ts` pins the
factory option AND source-scans the five modules for any bare `new OpenAI(`
or value-import of the SDK. Explicit-retry audit: the three 65s 429 loops
(digest/map/reduce) each take a FRESH reservation before the second physical
attempt (`openai-provider.test.ts` proves 2 physical calls / 1 billed
metering row for a 429-then-success); llm-match has no explicit retry (1
reservation ↔ 1 call, asserted). Truncated/discarded responses are metered
before interpretation at ALL FIVE completion sites — digest/map/reduce and
entity-audit always did; llm-match's billed-then-parsed ordering was caught by hardening
review 1 (finding 2) and FIXED: `llmMatchOnce` now records to the guard
immediately after the response and before `JSON.parse`, so an unparseable/
truncated validation response can no longer be billed without a
provider_usage row (new test pins it). Ask's hardened retry behavior is
untouched.

### 12.4 Validation single-shot SpendGuard repair

Every llm-match dispatch path now reserves before the billed call and records
to `provider_usage` after it — including single-shot (`MATCHER_MODE=single` /
`MATCH_VOTES=1`), which previously dispatched with NO guard and NO metering
(ruling 4 violation, §8.3's pre-existing gap — now CLOSED). With
`LLM_SPRINT_USD_CAP` unset or exhausted the guard fails closed and validation
degrades to the keyword matcher with ZERO provider calls (previously
cap-unset silently fell back to the UNGUARDED single shot). Mocked-SDK tests
(`llm-match-guard.test.ts`, 9 tests) assert: cap unset (both paths), cap
exhausted, reservation success + exact model-aware metering, provider
failure, majority 5:5:5 reservation:call:metering cardinality, LLM_DISABLE,
scorecard-blocked (zero client constructions), and the no-key short-circuit.
Supporting fix: `spend-guard.ts` memoizes its lazy `@/db` import — concurrent
vote-pool `record()` calls raced the un-memoized dynamic import (reproduced
minimally under mocks); behavior-identical in production. The unmetered
ANTHROPIC provider seam remains a separately blocked follow-up: no key exists
in any environment, `getProvider()` cannot select it in production as
configured, and this PR does not activate it.

### 12.5 Map activation hard lock

`model-config.ts` now hard-locks map dispatch to the baseline
(`MAP_BASELINE` = gpt-4o-mini, no effort): ANY non-baseline `MAP_MODEL` /
`MAP_REASONING_EFFORT` — even priced, even hypothetically registry-approved —
fails closed with the typed message `MAP ACTIVATION BLOCKED: … a
version-aware remap implementation (OPEN-TASKS #33) and explicit operator
activation authorization are required first; pricing or scorecard approval
alone does not unlock this`. There is deliberately NO env override. Reduce
changes never trip the lock (test-pinned). `.env.example` corrected: a map
version bump does NOT remap historical documents. The future dedicated remap
PR (version-aware candidate selection, corpus-remap cost estimate,
resume/checkpoint, consumer-filter validation, operator authorization)
deliberately relaxes the lock. Tests prove a priced non-baseline map model
cannot activate any map processing (`workloadDispatchConfig("map")` throws
before guard/client/dispatch; the route records `ok=false`).

### 12.6 Dispatch-identity persistence

`dispatchIdentity()` (model-config.ts) builds a durable record — workload,
exact model, reasoning effort as EXPLICIT null when absent, registry version
`analysis-reg-v1`, approval status — from the SAME `AnalysisDispatchConfig`
object the billed call used (never a later env read). Persisted, without any
migration, to existing JSON surfaces: legacy digest →
`digests.structured.stats.llmDispatch` (via `DigestAnalysis.dispatch`);
mapreduce → `structured.stats.reduce.dispatch` (map-side identity is carried
per-row by `doc_claims.extractor_version`); map runs →
`cron_runs.counts.dispatch`; entity-audit → `cron_runs.counts.dispatch` (+
the response's `model`); validation → `validation_runs.details.dispatch` (via
`MatchOutcome.dispatch`, absent when the keyword matcher scored). The default
baseline output carries identity too. No secret and no prompt content is
persisted. Round-trip tests: `dispatchIdentity` shape, llm-match outcome
identity, digest-provider identity, plus per-attempt accounting unchanged.
provider_usage has no metadata column — truthfully not used for identity.
Rollback/comparison implication: rows persisted before this change lack the
identity keys; consumers must treat absence as "pre-hardening baseline
(gpt-4o-mini, no effort)" — correct by construction, since nothing else
could dispatch.

### 12.7 Integration failure — diagnosis and green gate

Diagnosed on a disposable Neon fork (created + deleted, $0):
`parseTimeWindow("What happened in Kherson this week?")` on 2026-08-17 (a
Monday) collapsed "this week" to the SINGLE day 2026-08-17; the fork held
ZERO claims mentioning Kherson dated that day (newest: 2026-08-13) but THREE
entities named "Kherson" — so retrieval returned claims=0/entities>0, the
no-evidence short-circuit was skipped, the $0 stub answered with
`state:"answered"`, and the frozen snapshot had `candidates: []`, failing
`ask-events.itest.ts:100`. A deterministic date+corpus-dependent FIXTURE
defect (the only Ask itest that relied on the unseeded production corpus),
which also explains the 2026-08-16 reproductions on unmodified main. Fix
(narrow, no assertion weakened, no skip, no fabricated snapshot content): the
itest now seeds one ua claim mentioning Kherson dated today with a real
raw_documents source link (deferred trigger satisfied in one transaction),
cleaned up in afterAll — the snapshot is still produced by the real pipeline
from real rows. Result: `ask-events.itest.ts` 3/3 and the FULL suite
**107/107 GREEN**.

### 12.8 Production-bound inspector

`vercel env ls` (names only, read-only): NO `*_MODEL` and NO
`*_REASONING_EFFORT` variable exists in ANY Vercel environment — not even
`OPENAI_MODEL`. The inspector run against that (empty) routing environment
resolves every workload to gpt-4o-mini / null effort / `approved=baseline` /
`ok`, and Ask's models are reported read-only and unchanged. The blocked
matrix (recorded in full during the run): non-baseline map → `MAP ACTIVATION
BLOCKED …`; priced/unapproved (gpt-5-nano reduce, gpt-4o entity-audit) →
`pricing alone is not quality approval`; unknown model → `refusing to
dispatch unpriced`; invalid effort → `failing closed`. No Vercel variable was
changed; no provider request was made.

### 12.9 Gates (release hardening, exact)

| Gate | Result |
|---|---|
| `git diff --check` (vs 26989f7 base) | clean |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **2,187 passed / 2,187 (171 files)** after review-1 remediation (2,186 at `030d526`; +1 unparseable-metering test) |
| `npm run build` (dummy never-contacted `DATABASE_URL`) | PASS (exit 0) |
| `npm run test:integration` (disposable fork, paid keys blanked, `LLM_DISABLE=1`) | **107 passed / 107 (17 files) — GREEN**, run twice: at the `030d526` tree and again on the exact final tree `f34aee8` |
| inspector scenarios (defaults / baseline / priced-unapproved / unknown / invalid effort / non-baseline map) | all as designed (§12.8) |

Note: `main` has moved ahead of this branch's base (the operator merged and
deployed the cron PR #4 → `9c5e9cb`); the only expected merge conflict
remains the `docs/PROGRESS.md` EOF appends.

### 12.10 Adversarial reviews (release hardening)

The §10 PASSes are historical and do not approve this code; two fresh
isolated read-only reviews ran against the hardening work.

**Hardening review 1** (against commit `030d526`, all 28 changed files read):
**VERDICT: PASS — no BLOCKER or MAJOR.** Findings and dispositions:
- (MINOR, FIXED) `llmMatchTakeaways`' docstring still described the
  pre-hardening cap-unset behavior ("without its cap we stay on the old
  path") — rewritten to state the fail-closed reality.
- (MINOR, FIXED — the review's best catch) `llmMatchOnce` computed the cost
  but `JSON.parse` could throw BEFORE any `guard.record`, so a
  billed-but-unparseable response went unmetered (ruling 8; structurally
  pre-existing, and §12.3 had over-claimed the site). Fixed by recording
  inside `llmMatchOnce` immediately after the response, before parsing;
  callers no longer record; a new test proves an unparseable response leaves
  exactly one provider_usage row; metering cardinality (1 per call)
  unchanged and re-asserted.
- (NOTE, comment added) the map cron's `counts.dispatch` records the
  AUTHORIZED config up front — a budget-stopped run still stamps it
  (alongside `budgetStop*`); wording clarified in code and §12.6.
- (NOTE, comment added) the ask-events seed has a seconds-wide residual race
  across UTC Sunday→Monday midnight — documented in the fixture comment,
  accepted.
- (NOTEs, recorded as-is) the retry source-scan is an enumerated module list
  (a future sixth dispatch module must be added — same registration pattern
  as the authz itest ROUTES table); the map lock freezes writes while the
  read-side version stays computable (loud legacy fallback + staleness
  alerts on operator error, no env exists today); persistence-spread lines
  themselves are review-verified rather than unit-asserted (consumers read
  named keys; additive-safe).
All clean categories confirmed with file/line traces: price parity + no live
stale copy + run-guards auto-pickup; registry honesty and scoping; gate
before reservation AND client construction at all five sites (spy-proven);
429 fresh-reservation loops; map-lock ordering and no-override; unchanged
prompts/schemas/K=5/guards/cron-at-start; zero paid calls/activations/
secrets/migrations.

**Hardening review 2** (fresh reviewer, full `359750c..f34aee8` delta on the
corrected final tree): **VERDICT: PASS — no BLOCKER or MAJOR.** All four
review-1 findings verified RESOLVED against the tree (record-before-parse
confirmed as the file's ONLY record site with 5:5:5 / 1:1:1 / 1-reserve-0-
record cardinalities test-pinned). Its independent end-to-end pass re-proved
every core invariant with file/line traces: pricing-AND-approval gating with
the verified check ordering; refusal before reservation and client
construction at all five sites (reduce's gate even precedes DB pool
creation); the map lock (incl. `OPENAI_MODEL` fallback tripping it while the
baseline still dispatches, and the `.env.example` no-remap claim checked
against the worker's `processed = false` selection SQL); the repo-wide
maxRetries:0 sweep; identity persisted from the dispatch-time object at all
five surfaces with `provider_usage` truthfully lacking a metadata column;
default resolution unchanged; no live stale price; §12's factual sweep
(evidence refs, itest narrative vs code, blockers, `origin/main` at
`9c5e9cb`) accurate. Findings, all documentation-level and applied: (MINOR)
the §12.9 unit-count cell was one commit stale — refreshed to 2,187 with the
reviewer's independent +33-`it()`/+4-file count corroborating; (NOTE) §12.3
said "ALL FOUR" completion sites where five hold the invariant (entity-audit
also meters before parse) — corrected; (NOTE) the validation registry
evidence note now says "run-to-run matcher nondeterminism" to match what
OPEN-TASKS #15 actually documents; (NOTE, recorded) the memoized `@/db`
import caches a rejected promise under permanent misconfiguration —
behavior-equivalent to the pre-memoization failure mode.

Final status: **release-hardening-pass / merge-awaits-operator-review** —
both fresh reviews PASS, every §12.9 gate green on the final tree, no paid
call, no model activation, no environment change, no deployment. Merge and
any deploy remain operator decisions; the §12.11 follow-ups and the §9
activation checklist stand.

### 12.11 Remaining blockers / follow-ups

1. Paid representative evaluation + `evaluated_candidate` registry entries —
   still operator-gated (§9 checklist unchanged, now with the registry as the
   enforcement point).
2. The map remap PR (OPEN-TASKS #33) — prerequisite to ever relaxing the map
   lock.
3. `scripts/ask-eval-harvest.ts` still constructs an unguarded default-retry
   client (Ask eval tooling; out of scope here).
4. The Anthropic provider seam remains unmetered and inactive (no key
   anywhere); wiring it through guards/registry is its own blocked follow-up.
5. On deploy, Ask rerank cost estimates rise ~2× (§12.2) — operator should
   expect the shift in `ask_usage`/allowance numbers and confirm
   `ASK_USD_CAP_DAILY` headroom.

Final status: recorded at the end of §12.10 after both reviews.
