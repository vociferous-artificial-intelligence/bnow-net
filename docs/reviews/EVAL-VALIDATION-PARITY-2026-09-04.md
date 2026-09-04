# Validation evaluation parity — implementation report (2026-09-04, PR 2 of 2)

Scope: the second of two narrowly scoped, offline, reviewed PRs authorized after the
2026-09-04 methodology adjudication packet (§2.D: "live-runner dispatches ONE round at
temperature 0 … production uses MATCH_VOTES default 5 with majority"). Same envelope and
prohibitions as PR 1 (`docs/reviews/EVAL-CAPTURE-ACCOUNTING-2026-09-04.md`): zero paid
calls; no production, Vercel, registry, deploy, DB-branch, scorer, gate, label, corpus or
heldout change; the frozen campaign worktree and every original artifact untouched. Branch
`claude/eval-validation-parity-20260904`, built atop PR 1's reviewed tip.

## 1. The defect

`runLiveCase` (validation) dispatched one match round and scored its match set against
`reference.labels`. Production (`src/lib/validation/llm-match.ts llmMatchTakeaways`)
dispatches `MATCH_VOTES` (default 5) rounds, keeps the usable ones, and resolves them:
≥3 usable → strict majority (`majorityFromVotes`, threshold ⌊k/2⌋+1); 1–2 usable → the
first round (matcher "llm"); 0 → no LLM result. A single-round live eval therefore measured
a configuration production never runs, and its results file carried no marker saying so.
The 2026-09-03 validation baseline (`live-validation-v2-gpt-4o-mini.json`, 51 rows,
meter 51/51/51/0, verdict insufficient_data) is such a file.

## 2. What was built

| piece | file | behaviour |
|---|---|---|
| Shared production logic | `src/lib/validation/llm-match.ts` | `MATCH_VOTES_DEFAULT = 5` exported; the resolution rule extracted as pure `resolveVoteRounds(rounds, n)`; `llmMatchTakeaways` now calls it (return shape and semantics unchanged; `llm-match-guard.test.ts` unchanged and green). |
| Live dispatch | `src/lib/evals/live-runner.ts` `runLiveCase` (validation) | Dispatches K = `evalValidationVotes()` rounds (default 5) sequentially through `dispatchOnce` with vote context `(v, K)`, one reservation per physical attempt (production fires the K votes concurrently; the resolution is the same function). Each round is parsed and passed through the production `sanitizeMatches`; an unusable round (truncated / null / unparseable) is dropped exactly as production drops a failed vote. `resolveVoteRounds` decides; the match set is scored against `reference.labels` by the UNCHANGED `scoreValidationCase`. The row records `votes {requested, usable, mode, matcher, perTakeaway}` (claimIds per round, never text). 0 usable → `schema_invalid` with `(0 of K vote round(s) usable)`. K=1 keeps the historical single-response `rawOutputDigest`. |
| Identity | `src/lib/evals/contracts.ts`, `runner.ts` | `EvalEnvKnobs.validationVotes` (optional for historical files); `comparableKnobs(knobs, workload)` applies legacy defaults (reduceGroupsFed 200; validationVotes 1 for VALIDATION files only) and drops the knob for every other workload; used by `resumeIdentityMismatch`, the scorecard knob comparison and the knob line. Every live validation configKey carries `+votes<K>` (`validationVotesKeySuffix`). |
| Vote-count source | `scripts/analysis-eval.ts`, `runner.ts evalValidationVotes` | The CLI ALWAYS sets `EVAL_VALIDATION_VOTES` from `--validation-votes` (default 5) before any knob work, overriding a shell export; only `5` and `1` parse, anything else throws/refuses. |
| Diagnostic mode | `live-runner.ts assertLivePreflight` | `--validation-votes 1` refuses unless `--single-round-diagnostic` is given (and the flag refuses when votes resolve to 5 — an ack that authorizes nothing); a production `MATCH_VOTES` ≠ 5 or `MATCHER_MODE=single` in the shell refuses a live validation run. The mode is printed in the live banner, stamped in `votes.mode`, and rendered by the scorecard (`Vote mode:` line: production-equivalent / SINGLE-ROUND DIAGNOSTIC / LEGACY SINGLE-ROUND / offline). |
| Estimates | `runner.ts buildAnalysisEstimatePlan` | validation calls = K per case per repetition; prompt and completion tokens ×K. validation-v2: 85 calls per repetition (was 17). |
| Budget-stop accounting | inherited from PR 1 | a stop mid-case records the completed votes as `abandonedAttempts` with `voteCount: 5`, no result key; `liveVoteCount` returns K for validation. |

## 3. Guarantees (each test-pinned — `src/lib/evals/validation-parity.test.ts` unless noted)

1. **Default = production five-vote configuration.** `VALIDATION_VOTES_PRODUCTION ===
   MATCH_VOTES_DEFAULT === 5`; `evalValidationVotes({})` is 5; `currentEnvKnobs().validationVotes`
   is 5; a live case makes exactly 5 dispatches (meter 5/5/5/0); the finals equal what
   `resolveVoteRounds` / `majorityFromVotes` produce on the same rounds (val-typ-005's
   arithmetic: 3-of-5 confirms, 2-2-1 rejects).
2. **Majority mechanics.** 4 usable of 5 → majority; 2 usable → first round, matcher "llm",
   `usable: 2` recorded, all 5 still dispatched and metered; 0 usable → `schema_invalid`.
3. **Identity mismatch.** A legacy validation file (no `validationVotes`) vs a 5-vote header →
   REFUSED (`envKnobs … "validationVotes":1 -> … 5`); vs a 1-vote header → compatible; a
   legacy MAP file vs current knobs → compatible (knob ignored off-workload). The path
   suffix means a 5-vote run never even opens the legacy file (CLI pin: no `+votes1` file
   is created by a refused diagnostic invocation).
4. **Request accounting.** Estimate: 15 calls for 1 case × 3 reps at K=5, 3 at K=1; tokens
   and USD ×5. CLI pin: `--estimate --workload validation` reports 85 calls (17 at
   `--validation-votes 1`); `--validation-votes 3` exits 2.
5. **Interruption.** `runRequestCap=3` on a 5-vote case → abort at vote index 3:
   `abandonedAttempts[0] = {responsesReceived 3, voteCount 5, meter 3/3/3/0, tokens}`, no
   result key, `budget_stop` capture line `voteIndex 3 / voteCount 5`; a resumed sweep under
   a new runId makes 5 fresh dispatches, completes the key, keeps the abandoned record
   (meter 8/8/8/0).
6. **Diagnostic mode is distinguished.** Preflight refuses `EVAL_VALIDATION_VOTES=1` without
   the flag and the flag without the value; refuses `MATCH_VOTES=3` / `MATCHER_MODE=single`;
   map is unaffected. With the flag: one dispatch, `mode: "single-round-diagnostic"`,
   `liveVoteCount` 1, historical digest preserved. `validationVoteModeLine` renders the four
   modes. CLI pins: refusal before any client/DB work; `--single-round-diagnostic` outside
   live mode refused.
7. **Labels vs mechanism stay separate.** A case with a fixture `voteRounds`/`expectMajority`
   pin scores its live match set against `labels` while the pin evaluates only the FIXTURE
   rounds (`majorityFailures` 0 regardless of live votes); a live majority that contradicts
   the labels FAILS the row. The committed val-typ-005 labels and `expectMajority` are
   asserted unchanged. No case was relabelled (OPEN-TASKS #105 owns that decision).
8. **Existing single-round results are not overwritten or reinterpreted.** The legacy file's
   bare key is a path no new runner writes; `--report` renders it with `Vote mode: LEGACY
   SINGLE-ROUND … NOT production-equivalent`; its rows carry no `votes` field and none is
   inferred.

## 4. Updated request estimates (validation-v2, over-estimates by construction)

| configuration | calls / repetition | calls × 3 reps |
|---|---|---|
| pre-parity single round (the 2026-09-03 baseline as run) | 17 | 51 |
| production-equivalent (default, K=5) | 85 | 255 |
| single-round diagnostic (`--validation-votes 1 --single-round-diagnostic`) | 17 | 51 |

Tokens and USD scale by the same factor (`--estimate` prints the exact figures for the
current dataset). A future production-equivalent baseline cell therefore needs ~5× the
2026-09-03 validation cell's requests (the 2026-09-03 cell spent 0.0031 USD by artifact
estimate; ~0.016 USD expected). No paid run is authorized by this PR.

## 5. Tests

`src/lib/evals/validation-parity.test.ts` (12: knob, identity, vote-mode line, estimate,
preflight guards, 5-round parity, label contradiction, drop-out degradation, diagnostic,
labels-vs-mechanism + no-relabel pin, mid-vote interruption + resume, no-client) and 3
subprocess pins in `hardening-cli.test.ts`. Three existing tests updated for K=5 (the
unparseable-response case now shows 5 dispatches; the sweep meters count 5 per validation
case). Gates on the branch tip: typecheck clean · lint 0 errors · **3,608 / 3,608 (247
files)** (PR 1 tip: 3,593 / 246; +15).

## 6. Boundaries honoured

No scorer/gate change (`score-validation.ts`, `gates.ts` untouched); no global
`required=true`; no relabel; no blanket `expectation=fail` exclusion; injection findings
untouched (#106). Production `llm-match.ts` changed only by constant export + pure function
extraction (behaviour-preserving; its tests unchanged).

## 7. Independent review and merge record

_(filled in after the review round and at merge)_
