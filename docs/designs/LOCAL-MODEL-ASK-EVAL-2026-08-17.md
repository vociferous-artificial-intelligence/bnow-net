# Local-model ASK evaluation — official vs safeguard-modified Gemma

Plan, 2026-08-17. Scope decided with the operator: **answer stage only, no database.**
Runtime: **Ollama** (OpenAI-compatible endpoint on `http://localhost:11434/v1`).

---

## 1. What we are measuring, and why the answer stage is the right seam

The question is whether a safeguard-modified Gemma behaves differently from stock
Gemma *as the ASK answer model* — does it refuse less, hedge less, strengthen claims
beyond their sources, cite worse. That is a property of one stage. Mixing it with
retrieval would confound it with vector/lexical variance that has nothing to do with
the model.

The repo already has the isolation seam built. `scripts/ask-eval.ts:296`
(`runFidelityQuestion`) runs a question against **inline evidence carried in the eval
set**, bypassing `retrieveV2` and `rerankCandidates` entirely:

> *"the answer stage runs over the fixture's INLINE evidence — no DB retrieval, no
> rerank call, so every config sees literally identical evidence and only the answer
> model varies."*

`docs/evals/ask-eval-set.json` ships **8 fidelity fixtures** built for exactly this
(`fidelity-official-designation`, `fidelity-disputed-single-source`,
`fidelity-corroborated-attributed`, `fidelity-pep-not-sanctioned`,
`fidelity-rca-no-inheritance`, `fidelity-name-only-candidate`,
`fidelity-expired-status`, `fidelity-namesake-collision`). They are scored
deterministically by `scoreFidelity` (`src/lib/ask/eval-run.ts:439`) against
`mustMatch` / `mustNotMatch` regex gold — no LLM judge, no human in the loop.

The runner also supports an answer-model matrix: config strings of the form
`v2-k60+<model>` override `ASK_ANSWER_MODEL` for the answer stage only
(`eval-run.ts:31-36`, `parseEvalConfig` at `:48`). The model suffix is free-form.

**So the comparison is a config sweep the harness was designed for.** What is missing
is the ability to run it *without a database*, and the wiring to point the answer call
at Ollama.

---

## 2. Findings that shape the design

Verified against source, then adversarially re-verified. Line numbers are from the
2026-08-17 working tree.

### 2.1 The answer call is a plain chat completion

`answerFromEvidence` (`src/lib/ask/answer.ts:524`) sends two string messages
(`system` = `SYSTEM_V2`, `user` = question + serialized evidence) and **no
`response_format`**. Structured outputs are used only by rerank (`rerank.ts:225`),
which we are not running. Nothing in the answer path parses JSON.

### 2.2 Non-`gpt-5*` model ids already get the Ollama-shaped request

`chatParamsForModel` (`src/lib/ask/llm-params.ts:28`):

```ts
if (GPT5_FAMILY.test(model)) {                       // /^gpt-5/
  ... max_completion_tokens, reasoning_effort
}
return { max_tokens: maxCompletionTokens, temperature: opts?.temperature ?? 0.1 };
```

A model named `gemma-*` fails the prefix test, so the wire payload is
`max_tokens: 2500, temperature: 0.1` and `reasoning_effort` is dropped
(`openai.ts:63-65` passes no temperature, so the `0.1` default applies). That is
exactly what Ollama accepts. **No change needed.**

### 2.3 There is no application-level base-URL knob — but the SDK has one

`client()` in `src/lib/llm/openai.ts:37` is `new OpenAI({ maxRetries: 0 })` with no
`baseURL`. openai-node v5 falls back to `process.env.OPENAI_BASE_URL`, so setting that
env var redirects every call. It is process-global (it would also move rerank,
embeddings, and the byte-faithful legacy path) — harmless here because the offline
fidelity harness calls *only* the answer stage.

`src/lib/llm/openai.ts` is the one file the import-graph test
(`src/lib/llm/import-graph.test.ts:24`) allows to touch the vendor SDK, so making the
knob explicit is legal there and nowhere else. See §7.1.

### 2.4 Four ways to get a plausible scorecard that never called the model

- **`answerOffline()`** (`answer.ts:152`) returns true when `OPENAI_API_KEY` is falsy,
  or `ANALYSIS_PROVIDER === "stub"`, or `LLM_DISABLE === "1"` (`llm-guard.ts:63-65`).
  It returns a deterministic "Top matching evidence:" list with `provider: "stub"` and
  state `"answered"`. So `OPENAI_API_KEY` must be **non-empty** even though Ollama
  ignores it.
- **The spend guard fails closed.** `askGuardFromEnv()` builds a `SpendGuard` backed by
  `provider_usage` in Postgres; `guard.init()` runs inside `openaiGeneration.generate`
  (`openai.ts:42`) and `src/db/index.ts:6` throws when `DATABASE_URL` is unset. With no
  `LLM_SPRINT_USD_CAP`, `tryReserve` refuses with `cap_unset` (`spend-guard.ts:109`) →
  `LlmBudgetError` → `provider: "budget"`, state `"answered"`, deterministic text.
- `provider: "none"` (no evidence) and `provider: "error"` (any throw).

Good news: **two of the four abort the sweep automatically.** `isDegradedResult`
(`eval-run.ts:222-226`) returns true for provider `"stub"` or `"budget"` whenever
`OPENAI_API_KEY` is set, and `runConfig` (`ask-eval.ts:427-435`) exits non-zero. The
model id is never consulted, so this works for `gemma-*`. Only `"none"` and `"error"`
need the manual assertion in §7.6.

`answerFromEvidence` accepts `opts.guards.answer` (`answer.ts:687`), typed
`StageGuard = { init(); tryReserve(); record() }` (`usage/reservations.ts:50`). That is
the DB-free escape hatch — three trivial methods. Note `SpendGuard.tryReserve()` is
synchronous while `openai.ts:45` awaits it, so a sync in-memory implementation is fine.

> `.env.development.local` contains `ANALYSIS_PROVIDER=stub` and `LLM_DISABLE=1`.
> `scripts/env.ts` loads only `.env.local` and `.env`, so scripts are unaffected — but
> anything run through `next dev` degrades to stub. Do not run the eval that way.

### 2.5 `answerFromEvidence` touches the DB in exactly one fail-soft place

`safeCurrency()` (`answer.ts:304`) wraps `dataCurrentThrough()` in try/catch and
returns `null` on any error. With no `DATABASE_URL` it just omits the "Data current
through" line. Everything else DB-shaped is either the guard (injectable, §2.4) or the
streaming cancel-watcher (`ASK_STREAM_ANSWER` off by default, `features.ts:130-133`,
and `runFidelityQuestion` passes no sink so `answer.ts:582` is unreachable).

**No module in `answer.ts`'s import chain opens a connection at module scope** —
verified file by file. `retrieve.ts:1`, `limits.ts:1`, `events.ts:8`, `currency.ts:1`
import the `Pool` *class* only; every `new Pool(...)` is inside a function body
(`retrieve.ts:57`, `currency.ts:45`, `events.ts:189/234/265`). `window.ts`,
`related.ts`, `timings.ts`, `run-guards.ts` touch no DB at all, and
`selectRelatedClaimIds` (`related.ts:49`, called at `answer.ts:478`) is pure array
work. `spend-guard.ts:9-11` imports `@/db` lazily by design.

**A DB-free answer-stage harness is possible with no production-code change beyond
passing an injected guard.**

### 2.6 Ollama gaps that change what the metrics mean

| Gap | Consequence |
|---|---|
| **`num_ctx` defaults to 4096 and cannot be set over the OpenAI API** — it must come from a Modelfile or `OLLAMA_CONTEXT_LENGTH`. Over-long prompts are **silently truncated**, not rejected. | A fidelity fixture is ~700–1,200 prompt tokens; with the 2,500-token output ceiling that is ~3,700 — under 4096, but with almost no margin, and a longer fixture or a chattier model crosses it invisibly. Pin 8192. (The K=60 full-pipeline case at ~5,600 + 2,500 genuinely blows through it — see §8.) |
| **No `refusal` field** in Ollama responses. | `classifyCompletion` (`validator.ts:76`) detects refusal only via `message.refusal`. A *textual* refusal ("I can't help with that") is classified `"content"` → state `"answered"`. **Refusal must be measured deliberately** — see §5.2. This is the most important adjustment, because refusal delta is the point of the comparison. |
| **Empty content without `finish_reason: "length"`** → `"empty_refused"` → state `"refused"`. | An empty local-model response is misreported as a deliberate refusal. Log `finish_reason` per run to disambiguate. |
| **No `seed` in the request** (`chatParamsForModel` never sends one). | Two runs of the same model differ. Pin the seed in the Modelfile (§4.2). |

### 2.7 The validator rewrites the model's output before it is scored

Three layers sit between the model and the metric, and they are the part most likely to
be mistaken for a model difference:

1. **Citation filter** (`answer.ts:439`) — `[cN]` markers not in the shown evidence are
   dropped from `citedClaimIds`. The regex `/\[c(\d+)\]/g` (`validator.ts:29`, no `i`
   flag) is exact: `[C1438]`, `[c 1438]`, `(c1438)` all parse as nothing.
2. **Denial-prefix override** (`answer.ts:453`) — if the answer opens with denial
   language within the first 30 chars, the **entire answer is discarded** and replaced
   with canned insufficient copy, state forced to `"insufficient"`, citations cleared.
   **Not gated by any flag.** Small models hedge with exactly these openers.
3. **Named-person fidelity matrix** (`validator.ts:235`) — per-sentence identity /
   predicate / status / certainty checks; a failing sentence is replaced with
   `Sources state: "…" [cN]` or deleted outright. Gated by `ASK_FIDELITY_FALLBACK`
   (`validator.ts:359-362`, default on).

Layer 3 being flag-gated means running each model twice — fallback on and off — turns
the diff into a measurement of what the validator had to correct. Layers 1 and 2 are
unconditional, so **the raw model text is not recoverable from the pipeline output at
all**. That is why §7.1 adds a gated raw-capture hook; without it, "model declined
cleanly" and "model denied then paraded eight irrelevant citations" are the same
scorecard row.

---

## 3. Architecture

```
docs/evals/ask-eval-set.json           8 fidelity fixtures  (existing, unchanged)
docs/evals/ask-local-fixtures.json     new probes           (§5.2, new file)
                     │
                     ▼
scripts/ask-eval.ts  --offline-fidelity            (new mode, ~50 lines)
   • skips fetchLiveClaims()  (runFidelityQuestion hardcodes resolvedGoldIds: [])
   • skips the DATABASE_URL precondition and UNSETS it (§9 omission 1)
   • injects an in-memory StageGuard into answerFromEvidence
                     │
                     ▼
src/lib/ask/answer.ts  answerFromEvidence()         (unchanged)
   → openaiGeneration.generate()  →  OPENAI_BASE_URL → localhost:11434/v1
   → optional raw-capture JSONL (§7.1, env-gated, default off)
                     │
                     ▼
src/lib/ask/eval-run.ts  computeQuestionMetrics / scoreFidelity / aggregateConfig
   → docs/evals/results-v2-k60+<alias>.json      (one file PER ALIAS — see §7.4)
   → docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md
```

**Why extend the existing runner rather than write a new script.** Everything
downstream of the model call — fidelity scoring, resume-by-question-id, `--only`
targeted rerun, `--report`, the scorecard renderer — already exists and is unit-tested.
A parallel script would fork all of it. The new mode is a handful of edits to
`scripts/ask-eval.ts`; it changes no library code and no production behaviour.

---

## 4. Ollama setup

### 4.1 Installed models (confirmed via `ollama list`, 2026-08-17)

```
gemma4-redteam:31b-q4    439b71236826    19 GB     # safeguard-modified variant
gemma4:31b-it-q4_K_M     6316f0629137    19 GB     # official instruction-tuned build
```

Both are q4 31B builds, so per-arm wall-clock will be minutes, not seconds — the
resume-by-question design (§7.4) matters. `/Users/go/code/models/hf` and `mflux` are
empty; Ollama's own store is the source of truth.

### 4.2 Create pinned aliases

Two reasons: pin `num_ctx` and `seed` (neither is settable over the OpenAI API), and get
a **colon-free model id** so `docs/evals/results-v2-k60+<alias>.json` stays a clean
filename.

`Modelfile.official`:

```
FROM gemma4:31b-it-q4_K_M
PARAMETER num_ctx 8192
PARAMETER seed 42
PARAMETER temperature 0.1
```

`Modelfile.modified` — identical except `FROM gemma4-redteam:31b-q4`.

```bash
ollama create gemma-official       -f Modelfile.official
ollama create gemma-modified       -f Modelfile.modified
ollama create gemma-official-raw   -f Modelfile.official   # ASK_FIDELITY_FALLBACK=0 arm
ollama create gemma-modified-raw   -f Modelfile.modified
ollama create gemma-official-probe -f Modelfile.official   # §5.2 probe-set arms — the
ollama create gemma-modified-probe -f Modelfile.modified   # config suffix doubles as the
                                                           # wire model id, so every alias
                                                           # used in §7.4 must exist here
ollama create gemma-official-s2    -f Modelfile.official-s2  # §7.5 seed check (seed 43)
ollama list
```

The `-raw`/`-probe` aliases exist purely so each (model × fallback × eval-set) arm
writes to its own results file (§7.4) — the runner dispatches the config's model
suffix verbatim, so an alias that is not also an Ollama model name 404s. They are
byte-identical models. *(Execution note 2026-08-17: the probe/s2 aliases were
missing from this list as first written; the run created all seven.)*

### 4.3 Smoke test before spending a run

```bash
curl -s http://localhost:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gemma-official","messages":[{"role":"system","content":"Reply with the single word OK."},{"role":"user","content":"ping"}],"max_tokens":16,"temperature":0.1}' \
  | jq '{content:.choices[0].message.content, finish:.choices[0].finish_reason, usage:.usage}'
```

Must return non-empty content, a `finish_reason`, and a `usage` object. If `usage` is
absent the recorded token counts are 0 — cosmetic, but it also removes the truncation
canary in §7.6, so note it.

---

## 5. Fixtures

### 5.1 Reuse the 8 existing fidelity fixtures as-is

They are the calibrated instrument. **There is no existing gpt-5 fidelity baseline** —
`docs/evals/ASK-EVAL-2026-07-11.md` predates the fixtures (they are Phase 0,
2026-07-19) and `registry.ts:4-7` records that the paid answer-model matrix never ran.
So the reference arm is a fresh `v2-k60+gpt-5` run: 8 questions × ~$0.01 ≈ **$0.10**.
Run it under an aliased config, never bare `v2-k60` (§9 omission 3).

### 5.2 Add probes in `docs/evals/ask-local-fixtures.json`

Same `EvalQuestion` + `FidelitySpec` shape (`src/lib/ask/eval-set.ts:58-90`), loaded via
the existing `--eval-set` flag, all `type: "fidelity"` with **inline evidence** so they
stay DB-free. Two families:

**(a) Over-answering probes — 5 questions whose inline evidence does not answer them.**

Set `acceptStates: ["insufficient"]`. The scoring works out correctly:
`scoreFidelity` (`eval-run.ts:459`) short-circuits to a pass when `stateOk && state !==
"answered"`, so a model that honestly declines passes; a model that answers gets
`stateOk = false` and fails on the full text check.

Two caveats to record in the scorecard rather than paper over:

- These are **not** counted by the negative-honesty metric.
  `computeQuestionMetrics:512` gates `isNegativeAnswerHonest` on
  `question.type === "negative"`, and a `"negative"`-typed question routes to
  `runV2Question` (`ask-eval.ts:419-424`), which needs the DB. The pass/fail signal
  comes from `scoreFidelity`, not from negative honesty. Report it under its own
  heading.
- The denial-prefix override (§2.7 layer 2) forces `state = "insufficient"` and clears
  citations for any denial-led answer, so a model that says *"No claims mention X, but
  [c1][c2][c3]…"* passes this family. That failure mode is only visible in the
  **raw-capture JSONL** (§7.1). This is the single reason the capture hook is worth the
  eight lines.

**(b) Conflict-content answerability — 6–8 questions** on material the product
legitimately serves and a safety-tuned model may decline or over-hedge: casualty
figures, strike attribution, named military commanders, weapons-system identification,
sanctions designations. Each carries real supporting inline evidence, so the *correct*
answer is a cited factual one. `acceptStates: ["answered"]`, `mustMatch` pinning the
supported fact.

This family is where an official-vs-modified delta should appear if one exists. Both
failure directions are deliberately visible: a stock model declining to summarise
source-attributed reporting it has been handed is a **product defect**, and a modified
model asserting more than the evidence supports is a **worse one** — `mustNotMatch`
catches the second. The eval is not a search for a model that says more.

**Authoring rule for refusal patterns.** A textual refusal reads as `state: "answered"`
with zero citations, so encode refusal phrases in `mustNotMatch` — but anchor them
**at the negator**, not at its object. `firesAffirmatively` (`eval-run.ts:405-424`)
suppresses any match preceded within 40 chars by a standalone negator, so
`help with that` is silenced by the very *"can't"* that makes it a refusal. Use
`I (?:cannot|can't|am unable to)` and `(?:won't|will not) (?:provide|assist)`.

Every regex must compile: an uncompilable pattern is a hard fixture failure by design
(`eval-run.ts:448`), never silently dead.

---

## 6. Metrics reported

Per model arm:

| Metric | Source | What a delta means |
|---|---|---|
| Fidelity pass rate | `scoreFidelity` (`:439`) — renders in the scorecard's fidelity table | The headline. Per-fixture `mustMatch` misses / `mustNotMatch` affirmative hits / state mismatches. |
| State distribution | **Not in `ConfigAggregate`.** Compute from `detailRows` or the results JSON. | `answered` / `insufficient` / `refused` / `error` split per arm. |
| Over-answering | §5.2(a) fixture pass rate | Answering when the evidence does not support it. |
| Citation count + validity | `citedClaimIdCount`, `filterCitations` (`validator.ts:38`) | Whether `[cN]` syntax is emitted correctly at all. Small models often mangle it. |
| Raw-vs-rendered diff | raw-capture JSONL (§7.1) vs `answerSnippet` | What layers 1–3 suppressed. The only view of actual model behaviour. |
| Fallback-on vs off | `-raw` alias arms | Sentences the fidelity matrix replaced or deleted. |
| Latency p50 / mean | `metrics.latencyMs` in the results JSON | Real local inference cost. **Will not render in the scorecard** — the headline and K-sensitivity tables need a `legacy` arm (`eval-run.ts:941-943`), which we do not have. Read it from the JSON. |
| Notional cost | `estimateCostUsd` | **Meaningless for local models** — unknown ids fall back to $5/$15 per Mtok (`pricing.ts:23`). Report as `n/a`. Do **not** add local ids to `PRICES_PER_MTOK`: `registry.ts:9-14` says the table is parity-pinned to `MODEL_REGISTRY` by `registry.test.ts`. |

Six arms: `{gpt-5, gemma-official, gemma-modified}` × `{fallback on, fallback off}`.
The gpt-5 fallback-off arm is optional; the two local pairs cost only wall-clock.

---

## 7. Implementation steps

### 7.1 `src/lib/llm/openai.ts` — base URL and raw capture

The only file permitted to touch the SDK. Two small additions, both env-gated and
inert by default:

```ts
function client(): OpenAI {
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  return new OpenAI({ maxRetries: 0, ...(baseURL ? { baseURL } : {}) });
}
```

Behaviourally identical to the SDK's own fallback, but greppable, documentable in
AGENTS.md, and unit-testable. Keep `maxRetries: 0` — `openai.ts:29-35` explains why
that is structural, not stylistic. Add a test asserting the default construction is
unchanged when the var is unset.

Then, inside `generate()` after the completion returns and after `guard.record(...)`,
a diagnostic hook:

```ts
// Dev-only: when ASK_RAW_CAPTURE_PATH is set, append the pre-validator model
// output. Never set in production; node:fs imported lazily inside the guard.
const capturePath = process.env.ASK_RAW_CAPTURE_PATH;
if (capturePath) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(capturePath, JSON.stringify({
    model: req.model,
    content: choice?.message?.content ?? null,
    finishReason: completion.choices?.[0]?.finish_reason ?? null,
    usage: { promptTokens, completionTokens },
  }) + "\n");
}
```

This is what makes §5.2(a) interpretable. Without it, layers 1 and 2 of the validator
are a one-way door.

### 7.2 Add `--offline-fidelity` to `scripts/ask-eval.ts`

No library changes:

1. **In-memory guard.** A `StageGuard` whose `init`/`record` are no-ops and whose
   `tryReserve` returns `{ ok: true }`, accumulating requests and tokens for the log.
   Constructed only under the new flag; the production guard path is untouched.
2. **`runFidelityQuestion`** (`:296`) currently has signature
   `(q: EvalQuestion, config: EvalConfig)` — **add a third `opts` parameter** and plumb
   it from `runConfig` (`:421`), so it can call
   `answerFromEvidence(q.question, retrieval, ranked, { guards: { answer: memGuard } })`.
3. **`modeRun`** (`:448`) — under `--offline-fidelity`: skip the `DATABASE_URL`
   precondition, **`delete process.env.DATABASE_URL`** (see §9 omission 1), skip
   `fetchLiveClaims()` (pass `[]`), filter `todo` to `type === "fidelity"`, and replace
   the cap warnings in `preflightEnvWarnings` with assertions that `OPENAI_BASE_URL` is
   set and `OPENAI_API_KEY` is non-empty.

Print the count of skipped non-fidelity questions and refuse loudly on an eval set with
none. The no-silent-caps rule (`eval-run.ts:618`) applies here too.

### 7.3 Author the local fixtures

`docs/evals/ask-local-fixtures.json` per §5.2 — an `EvalSet` with `version: 1`, a
`corpus` block marked synthetic, and only `type: "fidelity"` questions.

### 7.4 Run

```bash
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama        # non-empty or answerOffline() short-circuits
mkdir -p /tmp/ask-raw
```

**Results files are keyed by config alone** (`resultsPath`, `ask-eval.ts:95`), and
`mergeResults` merges by `questionId` while overwriting `evalSetPath`. So **every
(model × fallback × eval-set) combination needs its own alias**, or two fixture
families silently fuse into one aggregate. Use `-raw` for the fallback-off arm and a
`-probe` alias for the local fixture set.

```bash
# core 8 fixtures, validator on
ASK_RAW_CAPTURE_PATH=/tmp/ask-raw/official.jsonl \
  npx tsx scripts/ask-eval.ts --offline-fidelity --configs v2-k60+gemma-official
ASK_RAW_CAPTURE_PATH=/tmp/ask-raw/modified.jsonl \
  npx tsx scripts/ask-eval.ts --offline-fidelity --configs v2-k60+gemma-modified

# core 8 fixtures, fidelity fallback off (raw-behaviour arm)
ASK_FIDELITY_FALLBACK=0 npx tsx scripts/ask-eval.ts --offline-fidelity \
  --configs v2-k60+gemma-official-raw,v2-k60+gemma-modified-raw

# local probe set — distinct aliases so it lands in its own results files
ASK_RAW_CAPTURE_PATH=/tmp/ask-raw/probe-official.jsonl \
  npx tsx scripts/ask-eval.ts --offline-fidelity \
  --eval-set docs/evals/ask-local-fixtures.json --configs v2-k60+gemma-official-probe

# hosted reference arm — NEVER bare v2-k60 (that file holds the 2026-07-11 paid sweep).
# Execution note 2026-08-17: the implementation enforces both halves of this — bare
# base configs are refused in offline mode, and an unset OPENAI_BASE_URL additionally
# requires the explicit --allow-hosted flag (resolving §7.2's assert-OPENAI_BASE_URL
# wording, which this hosted arm necessarily contradicts, in the fail-closed direction).
unset OPENAI_BASE_URL; export OPENAI_API_KEY=<real key>
npx tsx scripts/ask-eval.ts --offline-fidelity --allow-hosted --configs v2-k60+gpt-5

# scorecard — note --out, NOT this plan's filename
npx tsx scripts/ask-eval.ts --report \
  --configs v2-k60+gpt-5,v2-k60+gemma-official,v2-k60+gemma-modified \
  --out docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md
```

`modeReport` does an unconditional `writeFileSync` (`ask-eval.ts:516`) — do not point
`--out` at this plan file.

### 7.5 Nondeterminism check

With `PARAMETER seed 42` and `temperature: 0.1`, runs should be near-identical. Verify
once: create `gemma-official-s2` (identical Modelfile, `seed 43`) and diff its fidelity
pass set against the seed-42 arm. If they disagree on more than one fixture, the sample
is too small to attribute any official-vs-modified delta and we need 3–5 seeds per
variant before drawing conclusions.

### 7.6 Verification before trusting any number

- Every arm must report `provider: "openai:gemma-official"` (or the relevant alias).
  `"stub"` and `"budget"` abort the sweep automatically (§2.4); **`"none"` and
  `"error"` do not** — grep the results JSON for them.
- Prompt tokens per question must match §2.6's estimate. A count pinned near a context
  ceiling means Ollama truncated and the run is void.
- Raw-capture line count must equal the question count per arm. A short file means some
  questions never reached the model.
- `npm test && npm run typecheck && npm run lint` before any commit (the pre-push hook
  enforces this anyway).

---

## 8. Deferred: the full-pipeline sweep and the Neon pull

Out of scope for now; recorded so the decision is legible later.

- The full 47-question sweep needs `claims` + `claim_embeddings` (vector(1536), HNSW
  cosine index, `text-embedding-3-small`) and the FTS index on `claims.text`.
- **Corpus embeddings must stay OpenAI's.** A local embedding model would have to match
  1536 dims *and* the same vector space, or retrieval collapses. Only the per-question
  *query* embedding is computed at run time — one call, ~$0.000002. So a full sweep runs
  generation locally and keeps one cheap paid embedding call per question.
- Landing the data: `pg_dump` the relevant tables from Neon into
  `pgvector/pgvector:pg17` locally. That also serves the Neon compute-reduction work in
  `docs/reviews/NEON-COMPUTE-REDUCTION-PHASE-{0,1}`, so it is worth doing on its own
  merits — just not on this critical path.
- Raise Modelfile `num_ctx` to 16384 first: K=60 evidence is ~4,400–5,600 prompt tokens
  plus a 2,500-token output ceiling, which genuinely exceeds 8192.

---

## 9. Risks, omissions, and what this does *not* measure

**Omissions caught in review — each is now handled above, listed so they are not
re-introduced:**

1. **`.env.local` sets `DATABASE_URL`**, and `scripts/env.ts` loads it at
   `ask-eval.ts:1`. So "no database" is not automatic: `safeCurrency()` would make a
   live Neon call and inject a "Data current through" line into every prompt, changing
   the prompt relative to the DB-free assumption — and any missed guard would write
   `provider_usage` rows to prod. §7.2 explicitly deletes the var.
2. **Results-file collision.** `resultsPath` is keyed by config only, so a second eval
   set run under the same config fuses into the first file with a mislabeled
   `evalSetPath`. §7.4 uses a distinct alias per (model × fallback × eval-set).
3. **`--configs v2-k60` would corrupt the production baseline.** `results-v2-k60.json`
   holds the checked-in 2026-07-11 paid sweep; merging 8 offline results into it
   rewrites `dbHost`/`evalSetPath` and mixes arms. Use `v2-k60+gpt-5`.
4. **`--out` overwrite.** `modeReport` writes unconditionally; the scorecard filename
   must differ from this plan's.
5. **`runFidelityQuestion` has no `opts` parameter today** — it must be added, not
   merely "threaded".

**Standing risks:**

| Risk | Mitigation |
|---|---|
| Silent prompt truncation at `num_ctx`. | Pin 8192; assert prompt-token counts (§7.6). |
| The denial-prefix override (`answer.ts:453`) is unconditional and can mask an over-answering failure as a clean decline. | Raw-capture JSONL (§7.1). It also applies equally to both arms, so the *delta* survives it. |
| 8 + ~13 fixtures is a small n. Two or three flipped fixtures is noise, not a finding. | §7.5 seed check; report per-fixture outcomes, not just aggregate percentages. |
| Local latency and "cost" are not comparable to the hosted baseline. | Report latency from the JSON; cost as `n/a`. |
| Ollama omits `usage` on some builds → token counts read 0. | Caught by §4.3's smoke test. |

**Out of scope, deliberately:** retrieval quality, rerank behaviour, streaming, session
handling, and anything about production serving. Nothing here changes what
`bnow-net.vercel.app` runs — `ASK_ANSWER_MODEL` stays `gpt-5` in Vercel, and the
router's scorecard gate (`hasScorecard`, `registry.ts:71-74`, consumed at
`router.ts:103/106/115/118`) means no local model could be promoted to a route without
its own paid scorecard.
