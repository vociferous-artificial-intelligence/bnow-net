# AI Search Phase 0 — measurement, UX honesty, eval foundation (implementation report)

**Date:** 2026-07-19 · **Branch:** `codex/ai-search-ask-p0-measure` (from
`codex/ai-search-ask-integration-20260719` @ main `6c21b17`)
**Commits:** `6e94ede` (measurement plumbing), `c8ee6ff` (UX honesty + disabled
ask_started), `7fb6e23` (eval matrix + fidelity fixtures)
**Authorization:** 2026-07-19 unattended phased workstream (AGENTS decision log);
executable contract `docs/prompts/2026-07-19-ai-search-ask-phased-implementation.md` §7.
**Independent gate:** `AI-SEARCH-GATE-0-2026-07-19.md` (separate adversarial pass).

## What was built

### 1. Run identity + stage timings (migration 0021, passive)

`ask_usage` gains `run_id` (uuid, unique partial-by-NULL index), `started_at`,
`stage_timings_ms` (jsonb), `first_content_at` (null until Phase 3), `route_policy`
(null until Phase 4). Generated with drizzle-kit (`0021_blushing_shiver_man.sql`,
snapshot + journal updated); purely additive; `9999_claim_source_trigger.sql` still
sorts last. **Applied and contract-verified on a disposable Neon fork only — production
is untouched** (ledger row 9: column types, real INSERT/UPDATE shapes, jsonb merge,
unique-index behavior, migration bookkeeping all proven, branch deleted).

`src/lib/ask/timings.ts` (new): `AskRunMeta` (UUID + wall `startedAt` + shared
`StageTimings` collector) and monotonic helpers `timeStage`/`timeStageSync`/
`recordStage` — `performance.now()` only, durations recorded on both resolution and
rejection, no-op without a collector. No metering, no DB, no global state.

Threading (all signatures backward-compatible options):

- `askWithLimits` mints the run, threads the collector through
  `ask(question, {timings})`, records `pipelineMs`, and writes
  `run_id/started_at/stage_timings_ms` on **every** row — including the thrown-pipeline
  error row, which keeps the timings of stages that completed before the throw. The
  returned payload carries `runId` **iff a row was written** (limit and
  gate-unavailable refusals write no row and carry none).
- `ask()` records `currencyMs`, `rerankMs`; `retrieveV2` records `embedMs`,
  `vectorMs`, `lexicalMs`, `entityMs` (both entity queries summed), `mergeMs` (both
  sync sections summed); `answerFromEvidence` records `answerMs` (the paid boundary,
  incl. its guard I/O) and `validateMs` (post-response parse + assembly).
- The server action measures its own `hydrateMs` + `totalMs` and patches **only its
  run's row** via `recordEntryTimings(runId, patch)` (jsonb `||` merge, fail-soft,
  awaited). `POST /api/ask` patches `apiTotalMs` only; hydration keys stay absent on
  API rows. The three entry scopes cannot conflate (distinct keys, distinct writers).
- Metering is untouched: no `guard.tryReserve`/`guard.record`/`estimateCostUsd` call
  moved, reordered, or wrapped in a way that alters error propagation. Pinned by a
  test asserting `guard.record` args are identical with and without the collector.

### 2. UX honesty

The `/ask` working panel's rotating searching→ranking→answering labels (paced by
client elapsed time, i.e. inferred stages) are replaced by one static line —
`ask.working.preparing` = "Searching the claim database and preparing a cited
answer…" — plus the real elapsed counter. The three stage keys are deleted from en+uk
(other catalogs never carried them). Real stage copy returns in Phase 2 from persisted
server events only.

### 3. `ask_started` — typed, disabled

Typed end-to-end (`{entry: "form" | "intent"}`, closed enum, content-free) through
`ProductEventProperties`, the sanitizer KEYS/ENUMS allowlist, and an emission site in
`AskForm` that distinguishes the home one-click intent submit from a hand submit. The
emission is gated on `askStartedEventEnabled()` —
`NEXT_PUBLIC_ANALYTICS_ASK_STARTED === "1"`, set in **no** environment. Enablement is
an operator approval (decision-log entry), not a code change. Even if emitted, the
sanitizer admits only the two-value enum; everything else nulls out (tested).

### 4. maxDuration pin

`src/app/ask/page.tsx` exports `maxDuration = 60`. Verified against next@16.2.10
source (`reduceAppConfig` folds page-segment maxDuration into the route's function
config) **and** the built artifact (`functions-config-manifest.json` shows
`"/ask": {"maxDuration": 60}`); server actions POST to the page's own route, so the pin
bounds `askAction`. Matches the JSON route's existing pin; covers measured p50 10–13s /
tail ~30s.

### 5. Eval foundation

- **Answer-model matrix:** configs accept a v2-only `+<answerModel>` suffix
  (`v2-k60+gpt-5-mini`) parsed by `parseEvalConfig`; the runner overrides
  `ASK_ANSWER_MODEL` per question run (save/restore) while retrieval and rerank read
  their own untouched knobs. Results files/scorecard handle matrix configs; the D4
  gate still keys on exact `legacy`/`v2-k60`.
- **Eight named-person source-fidelity fixtures** (all FICTIONAL persons/orgs) added
  additively to `docs/evals/ask-eval-set.json` as type `fidelity` with inline evidence
  (synthetic claim ids ≥900000) and deterministic `mustMatch`/`mustNotMatch`/
  `acceptStates` gold: official one-source designation; disputed single-source report
  with governing attribution; corroborated-but-attributed; PEP ≠ sanctioned; RCA
  non-inheritance; name-only candidate match; expired/delisted status; namesake
  collision. `scoreFidelity` is pure and fixture-tested; over-suppression of a
  supported official fact **fails** (acceptStates). The fidelity runner path feeds the
  inline evidence straight to `answerFromEvidence`, holding retrieval/rerank fixed —
  exactly the matrix contract. Scorecard gains a fidelity section + per-question
  column; fidelity fixtures are excluded from gold-denominator warnings and skipped
  (loudly) on the legacy config.
- **The ~$1–3 paid matrix run is NOT executed** — `implementation-pass /
  enablement-blocked` pending operator approval. No paid call of any kind ran in this
  phase (grep the ledger: unit/lint/build/integration only).

During test development the fixture-quality suite caught a real fixture defect: the
namesake-collision `mustNotMatch` patterns fired on a *negated* mention ("no supported
reporting shows the port official arrested") in a faithful answer. Patterns were
sharpened to affirmative `was arrested` constructions — evidence the quality tests do
what Gate 0 requires of them.

## Exit criteria (per the master prompt §7)

| Criterion | Status | Evidence |
|---|---|---|
| >99% of new logged terminal rows carry run_id + coherent timings | **pass (by construction + tests)** | every `logUsage` call site passes the run meta; terminal-path tests cover answered/insufficient/refused/error/budget/offline/thrown; limit/gate refusals write no row by unchanged design. Production percentages become measurable only after deploy (blocked) |
| Action hydration/total and API wrapper timing not conflated | **pass** | distinct keys + distinct writers; actions/route tests pin exact key sets |
| No paid-call order or output changes | **pass** | metering-invariance test (identical `guard.record` args); all 1,678 unit tests green incl. every pre-existing money test |
| No user-facing copy claims an unreported server stage | **pass** | rotating stage labels removed; single honest line; test pins deleted keys |
| Fixtures reward accurate naming/exact official facts and fail strengthening | **pass** | 8× faithful-pass + 8× strengthened-fail pairs + over-suppression-fails test |
| Full unit suite, typecheck, lint pass | **pass** | 1,678/1,678, 140 files; tsc clean; eslint clean (ledger rows 2, 5, 6) |
| Paid model matrix scorecard | **enablement-blocked** | operator approval required; runner capability tested offline |

## Rollout / rollback

Passive columns — no flag. Rollback = revert the phase commits (columns may stay: they
are unread by product code). The copy change is cosmetic. `ask_started` is inert
without the build-time env. Nothing here was deployed anywhere.

## Debt / notes

- `validateMs` covers only the answered-path parse+assembly (see decision register).
- The eval runner's per-question `latencyMs` still uses `Date.now()` (pre-existing);
  Phase 0's new production timings are monotonic. Migrating the eval runner's clock is
  cheap follow-up, not a Phase 0 regression.
- F14 (rerank `guard.record` units=1) deliberately NOT fixed here: §10.1 attaches it
  to "while touching metering", and Phase 0's charter is metering-invariance. It moves
  to Phase 1 (which owns reservation/settlement changes).
