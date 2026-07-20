# AI Search Gate 0 — independent adversarial review report

**Date:** 2026-07-19 · **Subject:** branch `codex/ai-search-ask-p0-measure` (commits
`6e94ede`, `c8ee6ff`, `7fb6e23`, `5f6aad1`) vs main `6c21b17`
**Method:** five independent lens reviewers (architecture/state, money/metering,
measurement validity, source-fidelity fixture quality, privacy/security/ops) who did not
author the implementation, each over the full diff with repo access; every non-low
finding then adversarially verified by a separate refuter agent instructed to kill it.
13 agents, ~895K tokens, 198 tool calls. **Zero findings were refuted** — every
challenged claim survived with file/line evidence, several with empirically executed
regex reproductions.

## Verdict

**PASS after fixes** (commit `598dcb2` on the phase branch), with the paid answer-model
matrix run recorded as `implementation-pass / enablement-blocked` (operator approval
required). All confirmed high and medium findings are fixed and regression-pinned;
remaining lows are fixed or explicitly registered. Post-fix: typecheck clean, lint
clean, **1,698/1,698 unit tests** (ledger rows 10–11).

## Confirmed findings and dispositions

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | **high** | Negation-blind `mustNotMatch` failed the natural faithful phrasing in 5 of 8 fixtures — answers that explicitly NEGATE the forbidden strengthening ("not a confirmed match", "not under sanctions", "not a criminal conviction or arrest", "not been officially confirmed", "not currently listed") scored FAIL, biasing the scorecard against exactly the careful behavior it exists to reward | **fixed**: `scoreFidelity` is now negation-aware (`firesAffirmatively`: a match preceded in-sentence, within a 40-char scope, with no adversative break, by a standalone negator does not fire). All five reviewer strings are permanent PASS cases in `fidelity-fixtures.test.ts` |
| F2 | **high** | `fidelity-namesake-collision` passed the natural conflating answer ("Yes — Serhiy Bondar was arrested…") because every pattern required restating the questioner's role words, and failed the reviewer's natural distinguishing answer | **fixed**: patterns rebuilt — leading `yes`, and `was arrested/detained` in sentences not tied to the commander/battalion identity, fire without any role words; the distinguishing answer passes (both pinned) |
| F3 | med (downgraded from high) | The namesake fixture's sanctioned `insufficient` outcome was unreachable — the pipeline's deterministic denial copy is name-free, so `mustMatch:["Bondar"]` always failed it | **fixed**: accepted non-`answered` states now short-circuit text checks in `scoreFidelity` (the insufficient copy is deterministic name-free prose); the dead path is now a pinned PASS case |
| F4 | med | `scoreFidelity` failed OPEN on malformed `mustNotMatch` patterns (silently dead guard) while its docstring claimed they were surfaced | **fixed**: a pattern that fails to compile in EITHER list is a hard failure, surfaced in `malformedPatterns`; pinned both directions |
| F5 | med ×2 (two lenses independently) | Deploy-before-migrate window: logUsage's INSERT names the 0021 columns and both call sites swallow failures, so a production deploy before `db:migrate` silently freezes every ask_usage insert — and with it the per-user daily count and global-budget SUM (SpendGuard provider caps still bound actual spend) | **documented as a hard enablement prerequisite** (workstream index, decision register, phase report rollout): apply 0021 to production BEFORE any deploy containing these commits. No deploy is authorized in this workstream, so the window cannot occur unattended |
| F6 | med | `fidelity-corroborated-attributed`: bald unattributed assertion passed via any verb except the one covered verbatim string ("has been removed/relieved/fired/sacked", "was dismissed") | **fixed**: attribution-aware assertion family (lookbehind/lookahead exempting sentences whose assertion is governed by report/claim/said/according-to); reviewer dodges pinned as FAIL, attributed faithful phrasing pinned as PASS |
| F7 | med | Four more proven dodges: rca "is under OFAC sanctions"; disputed "initially unconfirmed, his death is now confirmed"; expired "remains subject to/under sanctions"; name-only "appears on the OFAC SDN list" | **fixed**: each family widened (`under … sanctions` anchored to Elena; `death is now confirmed` + bare `is/was confirmed`; `remains …` status family; list-membership assertions); all four dodges pinned as FAIL |

## Lows (13 reported; dispositions)

Fixed in `598dcb2`: inverted `runId` contract comment in types.ts (flagged independently
by three lenses); `recordEntryTimings` pool.end() outside the catch (never-throws now
airtight); entity/merge accumulators lost on mid-retrieval throw (now flushed in a
`finally`); catch-path `answerMs` overwrite of the metered value (no-overwrite guard;
error-row semantics documented); new fidelity-runner `Date.now()` latency (now
monotonic); duplicated rounding rule at entry points (shared `clampMs`); day-first date
formats failing two fixtures (alternations widened, pinned); missing FICTIONAL markers
on fixture notes (added + test-enforced).

Documented, not changed: `totalMs`/`apiTotalMs` deliberately measure post-auth-gate
scope (timings.ts doc updated to say so); the two pre-existing `Date.now()` eval-runner
latency sites keep their historical clock for comparability; the defensive
`LlmBudgetError` catch branch's answerMs semantics documented in code.

## Fixture-quality proof after fixes

The permanent `fidelity-fixtures.test.ts` matrix now contains **34 empirical cases**
built from the reviewers' own adversarial corpus: every proven dodge FAILS, every
proven faithful/negating phrasing PASSES, the honest-insufficient path PASSES via the
state short-circuit, over-suppression of a supported official fact FAILS, and every
pattern is compile-checked (no silently dead guards). Residual softness is inherent to
regex gold and documented (FidelitySpec docblock + decision register): contrived
double-negation and novel paraphrase families can still slip; the structural
per-sentence enforcement is Phase 3's AnswerValidator, and stored 400-char
answerSnippets let recalibrated patterns rescore past runs offline without paid reruns.

## Gate criteria re-check (post-fix)

| Criterion | Verdict |
|---|---|
| >99% of new terminal rows carry run_id + coherent timings | pass (measurement lens: 100% by construction — logUsage is the only INSERT site and always binds the run) |
| Hydration/total vs API wrapper not conflated | pass (both lenses; test-pinned key sets) |
| No paid-call order or output changes | pass (money lens: guard files byte-identical; wrappers cannot skip/reorder/duplicate metering; free-GET + intent one-shot intact) |
| No unreported-stage copy | pass |
| Fixtures reward accurate naming/exact facts, fail strengthening | pass **after F1/F2/F3/F6/F7 fixes**, evidenced by the 34-case matrix |
| Unit suite/typecheck/lint | pass (1,698/1,698) |
| Paid matrix scorecard | enablement-blocked (operator approval) — explicitly NOT production-ready as an eval deliverable until run |
