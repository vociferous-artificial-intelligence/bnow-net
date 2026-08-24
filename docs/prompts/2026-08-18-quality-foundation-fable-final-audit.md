# Independent final audit — BNOW.NET Quality Foundation

Paste this entire prompt into a **new Claude Code session**. Do not use the original authoring
session or the conflict-evaluations session.

## Model gate — before any repository action

This audit is commissioned specifically for **Claude Fable 5 at xhigh effort**, with the **1M
context option** if available.

1. Print the actual active model, effort, and context setting reported by the harness.
2. Require `claude-fable-5` and `xhigh`. If the UI names its maximum coding effort
   “Ultracode,” record both the displayed label and the harness effort field.
3. Do not accept a configured fallback or the session's prior model as proof of the model actually
   producing this audit.
4. Every required reviewer must record its actual model and effort in its report.
5. If this session or a required reviewer runs as Opus, Sonnet, or another model, stop that review
   and report `model-gate-blocked`; do not count it as an independent Fable review.

## Mission

Independently audit the completed, local-only BNOW.NET Quality Foundation program against its
governing prompt and exact terminal tree. Determine separately whether:

- Worktrees A, B, and C satisfy their contracts and are safe to consider for reviewable PRs;
- the optional Worktree D design is complete enough for a later authorized implementation;
- the exact integration tip is reproducible and has valid exact-SHA review evidence;
- the QF tree is a sound base for the already-authored conflict/region evaluation delta.

Do not ratify the existing reports by default. Existing author and reviewer summaries are evidence,
not a verdict.

## Exact scope

Repository: `/Users/go/code/bnow-net`

Governing prompt (currently an untracked operator-checkout file):

`/Users/go/code/bnow-net/docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md`

Relevant refs observed before this audit:

- starting `origin/main`: `9c5e9cb162b0e81202eef1fe2fcb4eea7d27164a`;
- reviewed routing dependency: `0e469f728cefb1eb2d3473f4d8770d600e70a3d3`;
- QF integration base merge: `05fdd2c`;
- QF integration branch: `codex/quality-foundation-integration-20260817`;
- observed QF tip: `7150b494d1399dddada6e7f917b1c0e76114d458`;
- SHA reviewed by the two original final reviewers: `e5757ea`;
- QF tip consumed by the conflict integration branch: `7150b49`;
- observed conflict descendant: `a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`.

Resolve every ref again. Do not assume these observations remain current. Fetching refs read-only is
allowed; do not pull, push, merge, or rewrite anything.

The Prompt-A evidence export is at:

`/Users/go/code/bnow-net-audit-evidence-20260818`

It includes a completed QF prompt-versus-delivery gap audit but not necessarily every original QF
reviewer transcript. Verify its `MANIFEST.sha256` and use it as leads/provenance evidence, not as
proof that its conclusions are correct.

## Isolation and immutable target

Do not edit the ordinary checkout, any existing QF feature/integration worktree, the routing
worktree, or the conflict worktree. Verify their status read-only and preserve unrelated work.

First resolve and print:

```text
QF_SOURCE_BRANCH=codex/quality-foundation-integration-20260817
QF_AUDIT_TARGET_SHA=<git rev-parse of that branch>
```

Require the target to be `7150b49` or a strict descendant whose additional commits are fully
inventoried before audit. If the branch was rewritten or no longer contains `7150b49`, stop and
report the graph; do not guess through it.

Create a new local worktree and branch from that immutable SHA:

```text
worktree: /Users/go/code/bnow-net-worktrees/quality-foundation-final-audit-20260818
branch:   codex/quality-foundation-final-audit-20260818
base:     QF_AUDIT_TARGET_SHA
```

If either name exists, inspect it and use a non-destructive suffixed name. Never reset, clean,
delete, amend, rebase, or reuse an uncertain worktree.

If the QF source branch advances after the target is frozen, do not silently chase it. Report the
new SHA and ask the operator which immutable target to audit.

## Authorization

Authorized:

- read-only inspection and local audit artifacts;
- tests, builds, offline CLIs, failure injection, and browser checks where relevant;
- isolated local audit/remediation commits on the new audit branch;
- disposable Neon branches through the existing integration workflow, with creation/deletion
  recorded and secrets read inline only;
- fresh isolated adversarial reviewer worktrees.

Not authorized:

- merging to `main`, pushing, opening a PR, deploying, or changing any Vercel environment;
- production/preview DB writes or manual production cron/backfill calls;
- paid OpenAI, Anthropic, X, OpenSanctions, or other provider calls;
- copying `.env.local`, credentials, or production data into a worktree;
- running a paid model evaluation, executing remap against a deployed route, activating a model,
  or changing the approved-model registry;
- implementing Worktree D, a fence-column migration, or another deferred program merely to make
  this audit pass;
- modifying the conflict branch or silently propagating QF remediation into it.

Use `LLM_DISABLE=1`, blank paid-provider keys, safe fake or unroutable endpoints, SDK mocks, and a
hard network-kill strategy for refusal tests. A disposable test database must never be production.

## Read before conclusions or edits

Read completely:

1. `AGENTS.md` and current Git/worktree state.
2. The 760-line governing QF prompt at the absolute path above.
3. `docs/CURRENT-STATE.md`, `docs/OPEN-TASKS.md`, `docs/PRODUCT-BRIEF.md`, and
   `docs/TIME-MODEL.md` from the audited tree.
4. The routing-seam report and the full `9c5e9cb..0e469f7` routing dependency diff relevant to QF.
5. QF reports:
   - `docs/reviews/EVIDENCE-QUALITY-OBSERVABILITY-2026-08-17.md`;
   - `docs/reviews/MAP-RELIABILITY-REMAP-2026-08-17.md`;
   - `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md`;
   - `docs/reviews/QUALITY-FOUNDATION-INTEGRATION-2026-08-17.md`;
   - `docs/designs/HUMAN-ADJUDICATION.md`.
6. Dataset documentation, schemas, fixtures, offline artifacts, and reports under
   `docs/evals/analysis/`.
7. The entire program diff `05fdd2c..QF_AUDIT_TARGET_SHA`, plus the integration-base merge and
   relevant routing dependency—not only the final report.
8. Every feature-to-merge delta and the exact-tip delta `e5757ea..QF_AUDIT_TARGET_SHA`.
9. The Prompt-A evidence export README, QF gap-audit file, Git evidence, and any QF provenance
   artifacts it actually contains.

Create on the audit branch:

- `docs/reviews/QUALITY-FOUNDATION-FABLE-FINAL-AUDIT-2026-08-18.md`;
- `docs/reviews/QUALITY-FOUNDATION-FABLE-AUDIT-LEDGER-2026-08-18.md`;
- one separate report per fresh final reviewer;
- a finding register mapping every old and new finding to fixed, invalid, deferred-authorized,
  deferred-unpermitted, or unresolved.

## Phase 1 — reconstruct program and review reality

Before editing code:

1. Verify the merge graph and exact parents of `05fdd2c`; independently confirm the routing tip
   was integrated and inspect the claimed documentation-only conflict resolution.
2. Verify every A/B/C branch tip and merge commit is an ancestor of the QF target. Verify D is
   design-only with no route, migration, table, or runtime implementation leakage.
3. Compare every requirement in the governing prompt with delivered code, tests, fixtures,
   reports, and Git history. Classify: implemented/verified, permitted deferral, optional skip,
   required-but-skipped, implemented-after-review, and unsupported documentation claim.
4. Reconstruct original reviewer provenance where recoverable: prompt, actual model, effort,
   target SHA, output, findings, remediation, and re-review. Do not infer Fable from the parent
   session or the prompt's requested execution profile.
5. Determine whether original reviewer reports exist as durable artifacts or only as coordinator
   summaries embedded in implementation reports. Record missing evidence explicitly.
6. Verify all claimed counts, file statistics, worktree disposition, no-push/no-main-merge state,
   and zero paid/provider/production activity from available evidence.
7. Inspect `e5757ea..QF_AUDIT_TARGET_SHA` line by line. The prior final verdicts do not bind the
   actual tip merely because the delta is described as documentation-only.

## Phase 2 — mandatory attacks on known gaps

Treat these as hypotheses to reproduce and adjudicate, not predetermined verdicts:

1. **Untracked governing prompt.** Confirm whether the QF prompt is absent from every Git ref even
   though `AGENTS.md` cites it as a repository path. Decide the auditability/merge consequence and
   preserve an immutable copy or hash in the audit report. Do not stage the operator's file without
   an explicit, scoped remediation decision.
2. **Exact-SHA review mismatch.** Both original final reviews reportedly target `e5757ea`, while
   the branch tip is `7150b49`. Verify the delta—including `.env.example`, `AGENTS.md`, and report
   changes—and decide whether any environment contract, standing instruction, or factual claim is
   behaviorally or operationally material.
3. **False NUL scan claim.** Reproduce the report's “zero NUL bytes in changed .ts files” claim.
   Distinguish a pre-existing literal byte from one introduced by QF, and correct the evidence
   without converting a harmless separator into a fabricated runtime defect.
4. **Lease fencing semantics.** Attempt split-brain, expiry/takeover, ABA, clock-skew, renewal
   loss, stalled-statement, pool swap, and stale-writer attacks. Determine whether the monotonic
   fence is only diagnostic and whether token re-check before a write can honestly support the
   prompt's “monotonically safe fencing/version semantics.” Separate merge risk, deployment risk,
   and a future fence-column migration; do not implement that migration without authorization.
5. **Remap safety.** Attack current-version eligibility, final no-claim completion, mirrors,
   `processed` immutability, track filtering, checkpoint identity, restart/resume, route handshake,
   finite budgets, per-attempt lease renewal/reservation/metering, activation locks, and rollback.
6. **Saved-report identity.** Verify whether `--report` gates only `datasetContentHash` while merely
   printing prompt/schema/extractor/env-knob identity. Determine whether stale or relabelled result
   artifacts can receive a binding-looking verdict.
7. **Repetition sufficiency.** Verify whether a stochastic candidate can pass with
   `requestedRepetitions=1`, whether full `--fresh` rerolls obscure variance, and whether a preset
   minimum is required before any paid result can be binding.
8. **Eval leakage and representativeness.** Audit heldout/dev separation, gate timing, aligned
   pairwise populations, missing-data exclusions, grader circularity, prompt input isolation,
   multilingual/theater coverage, `mustNotMatch` depth, map/reduce/digest/validation scoring, and
   whether the corpus proves machinery rather than candidate quality.
9. **DB/provider isolation.** Attempt to make validate/estimate/offline/report modes load `@/db`,
   bind a production/default `DATABASE_URL` before `EVAL_DATABASE_URL` substitution, construct an
   SDK client, retry, reserve, meter, write a ledger, or contact a provider. Test the known
   “lazy import ordering is one refactor away” concern structurally.
10. **Retry exemption.** Inspect the filename exemption for `scripts/ask-eval-harvest.ts` and its
    `new OpenAI()` client without `maxRetries: 0`. Decide whether this is truly out of the QF diff,
    an inherited exception needing explicit tracking, or a hole in the claimed repository-wide
    source scan. Do not broaden remediation into unrelated Ask behavior without authorization.
11. **Evidence recency.** Re-derive timestamp selection, future/skew handling, age and lag
    denominators, percentiles, fixed-day/rolling/regeneration anchors, post-publication-guard
    placement, distinct-document/claim populations, stub exclusion, and both-engine equivalence.
12. **Conversion funnel.** Attack version/mirror double counting, fan-out inequalities, pending vs
    lexicon-not-applicable classification, legacy separation, adapter/platform/language dimensions,
    reconciliation warnings, read-only behavior, and the absent per-adapter fed-group stage.
13. **Routing and production containment.** Confirm QF did not weaken K=5, publication safety,
    claim-source traceability, authorization, map activation lock, spend accounting, or production
    model approval. A repository eval candidate must never become production-dispatchable.
14. **Conflict-base consequence.** Identify every QF remediation that would change the inherited
    base of `a2ddca8`. Do not claim the existing conflict branch remains the final merge candidate
    after source/test/env-contract changes to QF.

## Phase 3 — full exact-target verification

Run first against the unchanged immutable target. Record exact commands, exit codes, counts,
environment isolation, and SHA:

1. clean worktree, `git diff --check`, conflict-marker scan, and byte-accurate NUL scan with its
   scope stated honestly;
2. all targeted A evidence-recency/funnel tests;
3. all targeted B lease/remap tests and concurrency/failure-injection stress;
4. all targeted C contracts/runner/scorer/gate/isolation/dataset tests;
5. typecheck and lint;
6. full unit suite (the historical claim is 2,402/2,402; report current reality);
7. production build with a dummy unroutable DB, `LLM_DISABLE=1`, and paid keys blank;
8. full disposable-Postgres integration suite if credentials are available (historical claim
   119/119), proving branch deletion afterward;
9. analysis-eval validate/estimate/offline/report and every execute-live refusal under fake keys,
   missing/invalid caps, invalid model/effort, wrong DB acknowledgement, and hard network kill;
10. quality-funnel read-only/refusal smokes and model-routing inspection;
11. golden/offline baseline byte identity without regeneration flags unless a separately justified
    remediation requires new versioned artifacts;
12. source/legal/secret/generated-result scans, SDK `maxRetries`, reserve-before-call,
    meter-before-parse, lazy DB import, migration, provider-call, DB-write, and worktree status.

If a gate cannot run, mark it `NOT RUN` with the exact reason. Never inherit PASS from another SHA.

## Phase 4 — two fresh Fable 5 exact-SHA adversarial reviews

After the unchanged target's gates complete, commission two fresh reviewers in isolated
worktrees. Both must run as **Claude Fable 5/xhigh**, record actual model/effort, and review the
same exact committed SHA. Give them the project instructions, original QF prompt, base/target SHAs,
full diff, and evidence package. They may read earlier reports only after writing an initial attack
plan.

1. **Safety/operations reviewer:** routing dependency, spend/meter/retry behavior, lease races and
   fencing, remap resumability/rollback, DB/provider isolation, migrations, traceability,
   publication safety, authorization, environment contracts, and default/deployment equivalence.
2. **Quality/evaluation-science reviewer:** recency and funnel denominators, timestamp anomalies,
   eval corpus coverage, leakage, identity/resume, repetitions/variance, missing-data honesty,
   matcher/scorer validity, aggregation, and whether any metric can be gamed at source-quality or
   corroboration's expense.

Each report must contain exact SHA, inspected paths, commands/reproductions, findings by severity,
clean categories, actual model/effort, and exactly one verdict: PASS, PASS-WITH-MINORS, or FAIL.
A review on another SHA is invalid.

## Remediation and re-review

- Record both initial independent verdicts before changing code.
- Fix every BLOCKER/HIGH (or the original prompt's BLOCKER/MAJOR equivalent) that is safely within
  this audit's authority.
- For any accepted MEDIUM/MINOR that changes source, tests, environment contracts, standing
  instructions, or user/operator-facing behavior, rerun the complete affected gates and obtain a
  focused Fable review on the exact new SHA.
- Documentation corrections must not rewrite the append-only decision history. Correct standing
  text in place where required and append only a truthful new log entry.
- Do not implement D, a fence-column migration, paid evals, production wiring, or conflict-branch
  integration without separate authorization. Record them as owned prerequisites.
- Never rewrite or silently rebaseline committed offline artifacts merely to pass.

If any QF remediation changes source, tests, `.env.example` semantics, or shared contracts, state:

`conflict base invalidated: a2ddca8 does not contain the audited QF remediation`

Do not modify the conflict branch. Provide the exact old/new QF SHAs and a proposed later
integration order for the operator.

## Final report

Separate these conclusions:

- correctness and merge reviewability of Worktree A;
- correctness and deployment prerequisites of Worktree B;
- correctness and readiness of Worktree C as offline machinery;
- readiness for a first paid/binding model evaluation;
- completeness of Worktree D's design only;
- whether the QF target remains an acceptable immutable base for the conflict audit;
- production/deployment readiness (not authorized by this audit).

Name the exact final audited SHA and every commit created by remediation. State whether the
conflict branch still contains that exact QF tree. State explicitly that no merge to `main`, push,
PR, deploy, activation, paid call, production write, remap execution, or conflict-branch mutation
occurred.

End with exactly one status:

- `independent-qf-audit-pass / QF-merge-may-be-considered; conflict-base-unchanged`
- `independent-qf-audit-pass / QF-merge-may-be-considered; conflict-base-reintegration-required`
- `independent-qf-audit-fail / remediation-required`
- `model-gate-blocked`
- `verification-gate-blocked`
