# Roadmap 05 — measured model baselines, candidate evaluation, and (gated) remap

First real use of the analysis evaluation control plane: baseline the CURRENT production
models per workload, then evaluate operator-named candidates, produce registry proposals
only through passing scorecards, and — only for an approved map-model winner — execute
the version-aware remap that finally makes `MAP_MODEL` activation safe. Also runs one
bounded prompt-iteration experiment where roadmap 04's funnel showed yield loss.

## Read first

`AGENTS.md` · `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md` ·
`docs/evals/analysis/` datasets + README · `scripts/analysis-eval.ts` and the runner/
gates/contracts modules · `docs/reviews/MAP-RELIABILITY-REMAP-2026-08-17.md` ·
`scripts/map-remap.ts` · the routing seams review · roadmap 04's funnel verdicts ·
roadmap 01's verified pricing note.

## Launch preconditions

Roadmap 02 landed (control plane + remap operator deployed). Operator supplies at
launch: the candidate model list per workload (with exact snapshots/slugs), the eval
spend envelope, and confirmation that every candidate's pricing is verified current
(roadmap 01 method) before any run.

## Authorization boundaries

Authorized with operator confirmation, separately per stage: paid baseline eval runs and
paid candidate eval runs under the named envelope, through the control plane's live mode
with all its guards (non-production DB guard, caps present, no SDK auto-retries, fresh
reservation per physical attempt, billed usage metered before parsing); ONE remap
execution under the remap operator's own caps if and only if a map candidate passes and
the operator approves activation. Not authorized: adding any model to an approved
registry (proposals only — applying stays an operator action); changing `MAP_MODEL` or
any routing env (operator does that after remap completes); evaluating on production
data outside the control plane's sanctioned paths; gates adjusted after seeing results.

## Stage 1 — offline first (zero provider)

Validate every dataset; run fixture/deterministic scorecards; produce the offline
baseline report. Any dataset gap against the workload categories the control plane
promises → fix datasets BEFORE paid runs.

## Stage 2 — paid baselines of current production models

Run map, reduce/digest, and validation scorecards against the models production actually
uses today, with the control plane's repetition counts for variance. These numbers are
the denominators for every later claim of improvement; archive them as the control plane
specifies. Resume on interruption; never rebill completed cases.

## Stage 3 — candidate evaluation

Per operator-named candidate and workload: identical datasets, identical repetitions,
baseline-to-candidate deltas only (no candidate-only vanity scores). A candidate that
regresses any hard gate — traceability, schema/batch completeness, publication-safety
behavior, named-person fidelity, hedge preservation, K=5 reproducibility, metering
invariants — fails regardless of quality wins. Output: a registry PROPOSAL document per
passing candidate with full dispatch identity, scorecard, cost/latency deltas.

## Stage 4 — map remap execution (only on operator approval)

For an approved map-model change: `--estimate` and `--dry-run` first, printed cost and
eligible-document count reviewed by the operator; then `--execute` under run/daily/total
caps with checkpointed resume; verify current-version corpus completeness afterward
(per-day disposition coverage, no starvation of the reduce corpus); THEN the operator
flips `MAP_MODEL` and the activation lock per the routing branch's rules. Old-version
rows remain intact for rollback. Reduce/digest/validation model changes need no remap —
env flip after their scorecards pass, one at a time, watching the scoreboard.

## Stage 5 — one prompt-iteration experiment

Where roadmap 04 localized yield loss (e.g. the ir lexicon variant's map prompt), run
ONE bounded prompt-version experiment through the same eval gate; if it passes, apply it
with a version bump + targeted remap of the affected window. This is deliberately
narrow — the point is to prove the iterate-measure-remap loop works end to end.

## Gates and completion

Fresh reviewers: (1) evaluation-science — leakage, sampling, circular grading,
gates-after-results; (2) spend/safety — unreserved attempts, unmetered responses,
wrong-version writes, rebilling on resume. Fix BLOCKER/MAJOR; re-review.

`docs/reviews/MODEL-BASELINES-AND-CANDIDATES-<date>.md`: baselines, deltas, proposals,
remap evidence if executed, exact spend vs envelope, and the standing rule this
establishes: no future model/prompt change without a paired scorecard result.
Statuses: `implementation-pass / proposals-await-operator`, `envelope-exhausted /
partial`, or `review-gate-blocked`.
