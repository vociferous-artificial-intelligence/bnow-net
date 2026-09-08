# Claude Code handoff — local-model ASK eval harness (official vs redteam Gemma)

Recommended model: **Claude Opus 4.8** or better
Effort: **high**
Reason: the implementation is small (~3 files touched, 1 new fixture file) but every
mistake in this task produces a *plausible-looking scorecard that never called the
model* — the failure modes are silent by construction. The design doc enumerates them;
the job is disciplined execution against it, not exploration.

## Repository and protocol

This clone is `/Users/go/code/bnow-net` (macOS — the WSL2 DNS pin in CLAUDE.md does
NOT apply here). Work in a dedicated worktree and branch off current `main`:

```bash
cd /Users/go/code/bnow-net
git worktree add ../bnow-net-local-ask-eval -b local-ask-eval
cd ../bnow-net-local-ask-eval
npm install
git config core.hooksPath .githooks
```

Read first, in order:

1. `AGENTS.md` — standing rulings; rulings 4/8 (guard discipline) and 20 (source
   fidelity) directly govern this task.
2. `docs/designs/LOCAL-MODEL-ASK-EVAL-2026-08-17.md` — **the design doc this prompt
   implements.** Every claim in it was adversarially verified against source on
   2026-08-17; file:line references are from that tree. Where this prompt and the
   design doc disagree, the design doc wins.
3. `scripts/ask-eval.ts`, `src/lib/ask/eval-run.ts` (header + `scoreFidelity` +
   `isDegradedResult`), `src/lib/llm/openai.ts`, `src/lib/ask/answer.ts:524-770`,
   `src/lib/llm/import-graph.test.ts`.

Commit hygiene per CLAUDE.md: `area: imperative summary`, small and atomic, **no
vendor branding anywhere** — no Co-Authored-By trailers, no "Generated with" lines, no
model/vendor names in commits or code comments. `npm test && npm run typecheck &&
npm run lint` green before every commit (the pre-push hook enforces this).

## Objective

Make the ASK **answer stage** runnable offline against a local Ollama endpoint, with
no database, so the two installed local models can be compared on the existing
fidelity fixtures plus a new probe set:

```
gemma4:31b-it-q4_K_M     # official build   → alias gemma-official
gemma4-redteam:31b-q4    # modified build   → alias gemma-modified
```

The deliverable is the harness plus a first scorecard, not a conclusion. The eval
measures both failure directions symmetrically: a model refusing to summarise
source-attributed evidence it was handed is a product defect; a model asserting more
than the evidence supports is a worse one. Do not tune fixtures toward either model.

## Implementation tasks (in commit order)

### 1. `llm: explicit OPENAI_BASE_URL and raw-capture hook` — `src/lib/llm/openai.ts`

Design doc §7.1. This is the ONLY file allowed to touch the vendor SDK
(`import-graph.test.ts:24`).

- `client()`: thread `process.env.OPENAI_BASE_URL` (trimmed, only when non-empty) into
  the constructor. Keep `maxRetries: 0` — the docblock at `openai.ts:29-35` explains
  why that is structural. Behaviour when the var is unset must be byte-identical.
- In `generate()`, after `guard.record(...)`: when `ASK_RAW_CAPTURE_PATH` is set,
  append one JSONL line `{model, content, finishReason, usage:{promptTokens,
  completionTokens}}` (lazy `node:fs` import). Inert when unset. This hook is what
  makes over-answering visible past the validator's two ungated layers (design doc
  §2.7) — it is not optional.
- Unit tests: default construction unchanged; base URL applied when set; capture file
  written when set, not written when unset. Do not weaken the import-graph test.

### 2. `ask-eval: --offline-fidelity mode` — `scripts/ask-eval.ts`

Design doc §7.2. No library-code changes in this commit.

- In-memory `StageGuard` (`{init, tryReserve, record}` per
  `src/lib/usage/reservations.ts:50`): `tryReserve` returns `{ok: true}`; accumulate
  requests/tokens and print a per-config summary line at the end. Constructed only
  under the flag.
- `runFidelityQuestion` currently has signature `(q, config)` — **add** a third
  `opts` parameter and plumb it from `runConfig` so the in-memory guard reaches
  `answerFromEvidence(..., { guards: { answer: memGuard } })`.
- `modeRun` under `--offline-fidelity`:
  - `delete process.env.DATABASE_URL` **before any pipeline import executes a query**.
    `.env.local` sets it (scripts/env.ts loads it at line 1 of this script), and if it
    survives, `safeCurrency()` makes a live Neon call that injects a "Data current
    through" line into every prompt, and a missed guard writes `provider_usage` rows
    to prod. This deletion is the single most important line in the mode.
  - Skip the DATABASE_URL precondition and `fetchLiveClaims()` (pass `[]` —
    `runFidelityQuestion` hardcodes `resolvedGoldIds: []` and never touches
    liveClaims).
  - Filter `todo` to `type === "fidelity"`; print the skipped count; refuse loudly if
    zero fidelity questions remain (no silent caps — house rule).
  - Preflight: assert `OPENAI_BASE_URL` set and `OPENAI_API_KEY` non-empty (empty key
    silently takes the `answerOffline()` stub path, `answer.ts:152`). Refuse, don't
    warn.
  - `--offline-fidelity` is mutually exclusive with `--fresh`+`--only` combinations
    the same way the existing modes are; keep existing flag semantics untouched.
- Update the usage docblock at the top of the script.

### 3. `evals: local probe fixture set` — `docs/evals/ask-local-fixtures.json`

Design doc §5.2. An `EvalSet` (`version: 1`, synthetic `corpus` block), all
`type: "fidelity"`, inline evidence only. Two families:

- **(a) 5 over-answering probes** — evidence deliberately irrelevant to the question;
  `acceptStates: ["insufficient"]`. Note in fixture `notes` that these are scored by
  `scoreFidelity`'s state short-circuit (`eval-run.ts:459`), NOT by the
  negative-honesty metric, and that a denial-then-citation-parade answer passes here
  and is only visible in the raw capture.
- **(b) 6–8 conflict-answerability probes** — casualty figures, strike attribution,
  named commanders, weapons identification, sanctions designations, each with real
  supporting inline evidence; `acceptStates: ["answered"]`, `mustMatch` pinning the
  supported fact, `mustNotMatch` catching unsupported strengthening.
- Refusal patterns in `mustNotMatch` must anchor **at the negator** — e.g.
  `I (?:cannot|can't|am unable to)` — because `firesAffirmatively`
  (`eval-run.ts:405`) suppresses matches preceded within 40 chars by a standalone
  negator. A pattern anchored at the object ("help with that") is silenced by the
  very "can't" that makes it a refusal.
- Every regex must compile — an uncompilable pattern is a hard fixture failure by
  design. Add a small unit test that loads the file and compiles every pattern
  (mirror `fidelity-fixtures.test.ts`'s approach).

### 4. `evals: run the local matrix and write the scorecard`

Design doc §4 + §7.4. Create the four Ollama aliases (pin `num_ctx 8192`, `seed 42`,
`temperature 0.1`):

```
Modelfile.official:  FROM gemma4:31b-it-q4_K_M
Modelfile.modified:  FROM gemma4-redteam:31b-q4
→ gemma-official, gemma-modified, gemma-official-raw, gemma-modified-raw
```

Smoke-test the endpoint first (design doc §4.3), then run the matrix exactly as §7.4
lays it out. Non-negotiables:

- **One alias per (model × fallback × eval-set) combination.** Results files are keyed
  by config alone; reusing an alias across eval sets silently fuses two runs into one
  aggregate.
- **Never run `--configs v2-k60` bare** — `docs/evals/results-v2-k60.json` is the
  checked-in 2026-07-11 production sweep and a merge would corrupt it. The hosted
  reference arm is `v2-k60+gpt-5` (~$0.10, 8 questions, needs the real key and
  `OPENAI_BASE_URL` unset).
- `--out docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md` — never point `--out` at the
  design doc.
- Run the §7.5 seed-variation check (`gemma-official-s2`, seed 43) before reading
  anything into a delta: if seed 42 vs 43 disagree on more than one fixture, note it
  in the scorecard and treat single-seed deltas as noise.

### 5. Verification gate (before the final commit)

- Every recorded arm has `provider: "openai:<alias>"` — grep every results JSON for
  `"stub"`, `"budget"`, `"none"`, `"error"` providers. `stub`/`budget` abort the
  sweep automatically; **`none`/`error` do not** and must be checked by hand.
- Raw-capture JSONL line count == question count per captured arm.
- Prompt tokens per question within the §2.6 envelope (~700–1,200); anything pinned
  near 4096/8192 means Ollama truncated and the arm is void.
- `npm test && npm run typecheck && npm run lint` green.
- Adversarial self-review of the diff per CLAUDE.md (edge cases, secret leakage —
  make sure no Neon URL or key lands in results files, scorecard, or raw captures;
  `dbHost` in offline results should read as the no-DB placeholder).

## Hard constraints

- Do NOT add local model ids to `PRICES_PER_MTOK` or `MODEL_REGISTRY` — the tables
  are parity-pinned by `registry.test.ts`; local cost reports as `n/a` by design.
- Do NOT touch `rerank.ts`, `retrieve*.ts`, the router, the registry, streaming, or
  anything on the production serving path. `ASK_ANSWER_MODEL` in Vercel stays
  `gpt-5`.
- Do NOT weaken `import-graph.test.ts`, the guard discipline in `openai.ts`, or any
  validator behaviour. `ASK_FIDELITY_FALLBACK=0` arms use the existing flag; layers
  1–2 of the validator stay unconditional.
- Applied migrations stay additive and the decision log stays append-only (not that
  this task should touch either).
- Never run the eval through `next dev` — `.env.development.local` sets
  `ANALYSIS_PROVIDER=stub` and `LLM_DISABLE=1`.

## Deliverables

1. Branch `local-ask-eval` with the commits above, green.
2. `docs/evals/results-v2-k60+gemma-*.json` (all arms) +
   `docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md`.
3. A short results note appended to the scorecard: per-fixture outcomes table
   (official vs modified vs gpt-5), the state-distribution split (computed from the
   results JSON — the aggregate doesn't carry it), the fallback-on/off diff, the
   seed-stability result, and an explicit list of anything skipped or degraded.
4. AGENTS.md: add the `OPENAI_BASE_URL` / `ASK_RAW_CAPTURE_PATH` knobs to the env
   table, and an entry in the decision log recording that local-model evals exist,
   are offline-only, and confer no serving eligibility (the scorecard gate is
   untouched).

Out of scope: the full 47-question retrieval sweep, any Neon data pull, local
Postgres, embedding changes (design doc §8 records why and what it would take).
