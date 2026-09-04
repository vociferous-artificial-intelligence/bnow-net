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
| Live dispatch | `src/lib/evals/live-runner.ts` `runLiveCase` (validation) | Dispatches K = `evalValidationVotes()` rounds (default 5) sequentially through `dispatchOnce` with vote context `(v, K)`, one reservation per physical attempt (production fires the K votes concurrently; the resolution is the same function). Each round is parsed and passed through the production `sanitizeMatches`. A NULL-content response (the shape a strict-schema refusal takes) is an EMPTY, USABLE round exactly as in production's `llmMatchOnce` (`content ?? '{"matches":[]}'`) — it counts in the majority denominator with all-null votes; an unparseable round is dropped as production drops a failed vote. `resolveVoteRounds` decides; the match set is scored against `reference.labels` by the UNCHANGED `scoreValidationCase`. The row records `votes {requested, usable, mode, matcher, perTakeaway}` (claimIds per round, never text). 0 usable → `schema_invalid` with `(0 of K vote round(s) usable)`. K=1 keeps the historical single-response `rawOutputDigest`. |
| Identity | `src/lib/evals/contracts.ts`, `runner.ts` | `EvalEnvKnobs.validationVotes` (optional for historical files); `comparableKnobs(knobs, workload, live)` applies legacy defaults (reduceGroupsFed 200; validationVotes 1 for LIVE validation files only) and drops the knob for every other workload and for every offline file (`offlineEnvKnobs()` never stamps it); used by `resumeIdentityMismatch`, the scorecard knob comparison and the knob line. Every live validation configKey carries `+votes<K>` (`validationVotesKeySuffix`). |
| Vote-count source | `scripts/analysis-eval.ts`, `runner.ts evalValidationVotes` | The CLI ALWAYS sets `EVAL_VALIDATION_VOTES` from `--validation-votes` (default 5) before any knob work, overriding a shell export; only `5` and `1` parse, anything else throws/refuses. |
| Diagnostic mode | `live-runner.ts assertLivePreflight` | `--validation-votes 1` refuses unless `--single-round-diagnostic` is given (and the flag refuses when votes resolve to 5 — an ack that authorizes nothing); a production `MATCH_VOTES` ≠ 5 or `MATCHER_MODE=single` in the shell refuses a live validation run. The mode is printed in the live banner, stamped in `votes.mode`, and rendered by the scorecard (`Vote mode:` line: production-equivalent / SINGLE-ROUND DIAGNOSTIC / LEGACY SINGLE-ROUND / offline). |
| Estimates | `runner.ts buildAnalysisEstimatePlan` | validation calls = K per case per repetition; prompt and completion tokens ×K. validation-v2: 85 calls per repetition (was 17). |
| Budget-stop accounting | inherited from PR 1 | a stop mid-case records the completed votes as `abandonedAttempts` with `voteCount: 5`, no result key; `liveVoteCount` returns K for validation. |

### Stated differences from production (named, not hidden)

- **Truncated votes.** Production never inspects `finish_reason`; a truncated vote is dropped
  there only because its JSON fails to parse. The eval drops every `finish_reason: length`
  vote outright. Under strict JSON output a truncated-but-parseable body is practically
  unreachable, so the two agree in practice; the eval's rule is the stricter one and a
  truncation is itself a finding.
- **Dispatch shape.** Production fires the K votes concurrently; the eval dispatches them
  sequentially with one reservation per physical attempt (ruling 4/8). The resolution
  function is the same and vote order is preserved, so the finals are identical.
- **Mid-case failures.** Production skips a vote that hits a budget stop or a provider error
  and resolves whatever rounds remain; the eval ABORTS the case on a budget stop (recorded
  as `abandonedAttempts`, no key) and records a provider error as a `provider_error` row
  with `partialUsage` (the gates fail on it). Deliberate accounting choices — a degraded
  run must never be silently scored as if it were complete.

## 3. Guarantees (each test-pinned — `src/lib/evals/validation-parity.test.ts` unless noted)

1. **Default = production five-vote configuration.** `VALIDATION_VOTES_PRODUCTION ===
   MATCH_VOTES_DEFAULT === 5`; `evalValidationVotes({})` is 5; `currentEnvKnobs().validationVotes`
   is 5; a live case makes exactly 5 dispatches (meter 5/5/5/0); the finals equal what
   `resolveVoteRounds` / `majorityFromVotes` produce on the same rounds (val-typ-005's
   arithmetic: 3-of-5 confirms, 2-2-1 rejects).
2. **Majority mechanics.** 4 usable of 5 → majority; 2 usable → first round, matcher "llm",
   `usable: 2` recorded, all 5 still dispatched and metered; 0 usable → `schema_invalid`.
   Refusal parity: two null-content refusals plus {X, X, null} resolve to null at k=5 (the
   production outcome), never to X at k=3.
3. **Identity mismatch.** A legacy LIVE validation file (no `validationVotes`) vs a 5-vote
   header → REFUSED (`envKnobs … "validationVotes":1 -> … 5`); vs a 1-vote header →
   compatible; a legacy MAP file vs current knobs → compatible (knob ignored off-workload);
   OFFLINE files never compare the knob and offline headers never stamp it — the committed
   `validation-v2-offline-fixtures.json` and both conflict-profile files resume with no
   refusal and no rewrite (unit + CLI pins). The path
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
   modes; `--estimate` and the capacity matrix print the assumed vote mode. CLI pins:
   refusal before any client/DB work; `--single-round-diagnostic` outside live mode or on a
   non-validation workload refused; a trailing `--validation-votes` without a value refused.
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

Round 1 (adversarial; read-only with executed probes; reviewer re-ran typecheck and the
full suite 3,608/3,608) on `a92d942`: **MERGEABLE-WITH-FIXES**. Verified without finding:
production `llmMatchTakeaways` key-for-key unchanged; same per-round parse/sanitize and the
same resolution function; identity suffix on every live read/write path; legacy file never
opened and rendered LEGACY; estimates/accounting ×K; vote source CLI-only; no scorer/gate/
label change; ruling 4/8 per dispatch; nothing relaxes a gate or touches a recorded verdict.
Findings and remediation (all applied; +4 tests → 3,612/247):

| # | severity | finding | remediation |
|---|---|---|---|
| MAJOR-1 | confirmed by execution | a null-content (refusal) response was DROPPED while production's `llmMatchOnce` treats it as an empty usable round — 2 refusals + {X,X,null} gave X at k=3 instead of production's null at k=5 | the eval mirrors `content ?? '{"matches":[]}'` exactly; refusal-shape parity test; docs corrected; truncated-vote / dispatch-shape / mid-case-failure differences stated above |
| MAJOR-2 | confirmed by execution | `validationVotes` was stamped into OFFLINE headers and compared for the validation workload regardless of live/offline, so `--offline --workload validation` and `--offline --profile conflict` identity-refused against the committed results | `comparableKnobs(knobs, workload, live)` applies the knob to LIVE validation files only; `offlineEnvKnobs()` never stamps it; unit + CLI pins prove the committed files resume byte-identically |
| MINOR-1 | confirmed | the report's baseline key took `+votes5` as the capacity-profile suffix, pairing a profiled candidate with the unprofiled baseline | the vote suffix is stripped before the profile suffix is derived and re-appended |
| MINOR-2 | confirmed | `--estimate --validation-votes 1` carried no diagnostic label | estimate and capacity-matrix output print the vote mode; pinned |
| NOTE-1 | | `--single-round-diagnostic` silently accepted on non-validation live runs | preflight refuses it off-workload; pinned |
| NOTE-2 | | trailing `--validation-votes` without a value defaulted silently | refused; pinned |
| NOTE-3 | | stray PR-1 merge-record doc edits in the working tree | committed as a separate docs-only commit in this PR |

Round 2 and the merge record follow below.
