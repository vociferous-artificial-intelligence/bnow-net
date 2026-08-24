# Follow-on prompts — preserve the long session, then independently audit the conflict-evaluation final SHA

This document contains two prompts. **Prompt A was completed on 2026-08-18. Do not rerun it.**
Its evidence package is at `/Users/go/code/bnow-net-audit-evidence-20260818` and Prompt B below
has been revised against that report, including its late-arriving Gate-9 recheck.

Original operating sequence:

1. Paste **Prompt A** into the still-active Claude Code session that authored the work. Its current
   **Opus 5 / xhigh** model is acceptable for this evidence-preservation task only. If that session
   has already ended, do not recreate it merely for Prompt A; preserve the attached report and let
   Prompt B independently reconstruct the missing provenance.
2. Start a **new Claude Code session**, manually select **Claude Fable 5**, set reasoning effort to
   **xhigh** (and the 1M context option if available), verify the displayed model before dispatch,
   and paste **Prompt B**.

The separate Quality Foundation audit is now complete. It independently passed unchanged runtime
target `7150b49`; its audit branch `codex/quality-foundation-final-audit-20260818` ends at
`858bb9a` with six documentation-only commits. It found no BLOCKER/HIGH and confirmed that conflict
tip `a2ddca8` still contains the exact audited QF runtime tree. Prompt B may therefore audit
`a2ddca8` without first creating a new combined code target. It must read the QF audit artifacts
and preserve the documented future two-report-path constraint, but must not repeat the full QF
program audit.

Do not use the original authoring session as the independent final auditor. Its restarts, context
compactions, remediation authorship, and prior conclusions make it valuable as an evidence source
but not a fresh review context.

---

## Prompt A — current-session evidence preservation (no implementation)

You are closing out the long BNOW.NET quality-foundation/conflict-evaluations Claude Code session.
Do not author, remediate, merge, or clean anything. Finish the already-running exhaustive
prompt-versus-delivered-artifact audit, then preserve a compact, verifiable evidence package for a
fresh external audit.

Repository: `/Users/go/code/bnow-net`

Relevant integration branches:

- quality foundation: `codex/quality-foundation-integration-20260817` at `7150b49`;
- conflict evaluations originally declared terminal at `6b35622`; after the gap audit the Opus
  session added at least docs-only commit `81a6949` recording a build and 151/151 integration
  rerun. Resolve and report the actual current branch tip rather than assuming either SHA;
- final reviewers actually reviewed `b8341e9`, not `6b35622`.

### Restrictions

- Read-only Git inspection and local evidence export only.
- Do not edit or commit in any repository worktree.
- Do not amend, rebase, merge, reset, clean, delete branches, or remove current worktrees.
- Do not push, open a PR, deploy, change envs, contact providers, or access production data.
- Do not copy secrets, `.env.local`, credentials, chain-of-thought, or unrelated task content.
- If an evidence directory cannot be created outside the repository, print the complete manifest
  in the final response instead; do not dirty a worktree.

### Evidence directory

Create, if permitted:

`/Users/go/code/bnow-net-audit-evidence-20260818`

Write only sanitized Markdown/JSON and SHA-256 manifests there. Do not copy raw files blindly.
For each relevant task-output file, record its original absolute path and SHA-256, then extract
only:

- the reviewer/agent prompt;
- model, fallback model, and effort metadata;
- target/base SHA;
- start/end timestamps and completion state;
- final review/verifier response;
- commands and result summaries that substantiate a gate;
- interruption/restart/fallback facts.

Redact any secret value if discovered and flag that redaction. File paths and fake test values are
not secrets.

### Required manifest

1. Finish and include the complete result of the active workflow:
   “Audit both session prompts against delivered artifacts to enumerate every skipped, deferred,
   or unimplemented requirement.” Distinguish:
   - implemented and verified;
   - intentionally deferred by the prompt;
   - skipped but optional;
   - skipped despite being required;
   - implemented after review without re-review;
   - documentation claim not supported by an artifact.
2. Record live Git evidence for every persistent worktree and all QF/conflict phase branches:
   path, branch, HEAD, clean/dirty, ancestor of which integration tip, on/not on `origin/main`, and
   prunable/stale registrations. Verify ancestry with Git; do not rely on branch names.
3. List every ephemeral reviewer worktree created, its target SHA, whether it was removed, and any
   orphan cleanup following a limit/restart. If exact enumeration is unavailable, say so rather
   than writing “about N.”
4. Record the model/effort provenance for, at minimum:
   - Phase 7 author `aae53dc1ad8875394`;
   - Phase 7 gate verifier `a2f7113831bfcc834`;
   - Phase 7 backtest-honesty verifier `acd6d26e00b588709`;
   - Gate 6 product reviewer `a8afbb1871e99cae2`;
   - Gate 6 legal reviewer `ab980982a74e2888d`;
   - final science reviewer `a0fff2d7ac3871488`;
   - final safety reviewer `a8024726ff29d7fcb`;
   - final product reviewer `aecb891a44e6450fe`;
   - closeout/remediation agent `a9074aa9cf130c58d`.
5. Verify or correct this observed provenance from the raw task outputs:
   - Phase 7 author + both Phase 7 verifiers: `claude-fable-5`, effort `xhigh`;
   - both Gate 6 reviewers: `claude-fable-5`, effort `xhigh`;
   - all three final reviewers: `claude-opus-5`, effort `xhigh`.
   State whether any of those agents actually fell back, rather than merely carrying a configured
   `fallbackModel` field.
6. Preserve the exact prompts and final outputs of the three final reviewers and the two Phase 7
   verifiers. Do not substitute coordinator summaries.
7. Produce a commit-by-commit inventory of `b8341e9..6b35622`, including files, lines changed,
   finding addressed, authoring agent/model if recoverable, and gates run after each change.
   Separately inventory `6b35622..<actual current tip>` as the late Opus closeout range. Do not
   blend it into the original final-review remediation.
8. State explicitly which Phase 7 full gates were and were not rerun after the post-review code
   changes. In particular, distinguish unit/typecheck/lint/golden checks from production build,
   disposable-Postgres integration, HTTP/RSC authorization, browser matrix, CLI/network-kill,
   and source/legal scans.
9. Record the model-switch event shown in the coordinator transcript, its timestamp if available,
   and which tasks occurred before and after it.
10. End with the evidence-directory path, file list and hashes, unresolved provenance gaps, and
    this exact terminal line:

`Evidence export complete; no repository mutation performed.`

Do not continue the implementation after this export. The next step belongs to a fresh Fable 5
audit session.

---

## Prompt B — new-session Fable 5 exact-final-SHA audit (revised after Prompt A)

You are the independent audit lead for BNOW.NET's completed local conflict/region evaluation
workstream. You did not author it. Your job is to determine whether the exact terminal tree is
reviewed, reproducible, methodologically defensible as dormant code, and safe to consider for a
later merge. Do not ratify the existing reports by default.

### Model gate — before any repository action

This audit is commissioned specifically for **Claude Fable 5 at xhigh effort**.

1. Print the actual active model, effort, and context setting shown by the harness.
2. Require `claude-fable-5` and `xhigh`; use the 1M context option if available.
3. Do not accept a configured fallback as proof of the model actually used.
4. Every reviewer agent must record its actual model and effort in its report.
5. If this session or any required reviewer runs as Opus, Sonnet, or another fallback, stop that
   review and report `model-gate-blocked`; do not count it as an independent Fable review.

### Cost and agent-discipline gate

The preceding QF audit cost **$160.80** because it used twelve attack agents plus two reviewers in
a long, >150k-context session. Do not repeat that orchestration pattern.

1. Use one primary Fable session for reconstruction, inspection, and the single authoritative gate
   run. Do not launch a dynamic workflow and do not create general-purpose attack agents.
2. Spawn only the three final reviewers required in Phase E—no other subagents. Reviewers may not
   delegate or spawn their own agents.
3. Run full unit/build/integration/browser gates once in the primary session. Reviewers inspect the
   recorded evidence and run only narrow reproductions needed for a finding; they must not each
   replay the full suite.
4. Load files with targeted searches/ranges. Do not dump complete test logs, raw transcripts, or
   the entire evidence package into model context. Keep each review report concise and
   evidence-dense (target at most 200 lines).
5. Check `/usage` after Phase A, after Phase D, and before spawning Phase E. Use an operator-set
   session ceiling; if none is supplied, treat **$50** as the hard ceiling and pause for operator
   approval at **$35** rather than overrunning it. A prompt cannot technically guarantee billing,
   so report the observed usage at each checkpoint.
6. If Fable quota/credits are unavailable, stop with `model-gate-blocked`; do not continue on Opus
   or purchase/add credits implicitly.

### Exact scope

Repository: `/Users/go/code/bnow-net`

- QF integration/base: `7150b494d1399dddada6e7f917b1c0e76114d458` (`7150b49`).
- Conflict terminal branch: `codex/conflict-evaluations-integration-20260817`.
- Originally claimed terminal SHA: `6b35622feac40de5583eab03fe9608ee902d77ff`.
- Prompt-A export observed actual branch tip:
  `a2ddca88f7740a148ebeb5372f9ce47dd72ffac4` (`a2ddca8`). It has two late commits:
  - `81a69495b1f56ed398713ff4be9d6942c15216a0` is docs-only and records build PASS plus
    corrected integration **151/151** at `6b35622`;
  - `a2ddca8` is **not docs-only**. It changes the benchmark-detail page (+4/−1), its tests
    (+15/−1), and the ledger, fixing a browser-found contradiction: q7 offered a gated evidence
    link for an empty-union record while q2 said no evidence view existed.
  Resolve the branch tip again at launch and audit every descendant rather than assuming this
  observed SHA is still final.
- SHA reviewed by the prior three final reviewers: `b8341e9`.
- Phase 7 gated tip: `ad10fbd`; Phase 7 merged integration tip: `35c5c34`.
- `origin/main` observed before this audit: `9c5e9cb`; fetch read-only and record current reality.

### Inherited Quality Foundation boundary

The conflict branch is not standalone: `7150b49` is its direct reviewed-program base, and the
conflict work extends the QF analysis-eval control plane through `scripts/analysis-eval.ts` and
`src/lib/evals/conflict-validation-profile.ts`.

The independent QF Fable audit established:

- exact runtime target `7150b49`: PASS-WITH-MINORS from both fresh Fable 5/xhigh reviewers;
- complete gates: unit 2,402/2,402, build PASS, disposable-Postgres 119/119, zero-contact CLI
  attacks, and byte-identical offline artifacts;
- audit branch `858bb9a`: six documentation-only commits, including the previously untracked
  governing prompt, audit evidence/reviews, and corrections to false/overstated report claims;
- no QF source, test, `.env.example` semantic, or shared-contract change;
- `7150b49` remains an ancestor of `a2ddca8`.

Do not re-audit QF Worktrees A/B/C/D. Perform only a bounded dependency-acceptance check: verify
the SHA/ancestry and documentation-only audit delta, then inspect the QF-to-conflict eval-runner,
report, matcher, and provider/DB-isolation seams that the conflict delta changes.

Carry forward one binding structural constraint: future QF eval-hardening must cover both the QF
`modeReport` path and conflict `conflictModeReport` path. The QF audit demonstrated that identity
fixes can merge cleanly while silently missing the duplicated conflict flow. Prompt B must test
that duplication as part of the conflict audit, but must not implement the separately deferred
paid-eval hardening program merely to pass dormant conflict code.

Measured assistant-message provenance from Prompt A supersedes earlier assumptions:

- Gate 6 product and legal reviewers were Fable 5/xhigh; `1f70852` is the last fully
  Fable-reviewed SHA.
- Phase 7 author emitted three opening Fable messages, then 207 Opus messages. Treat the Phase 7
  report and eleven-gate battery as **Opus 5/xhigh work**.
- Both Phase 7 verifiers and all three final reviewers were **Opus 5/xhigh**.
- The late gate reruns, browser matrix, `a2ddca8` fix, targeted recheck, and Prompt-A export were
  **Opus 5/xhigh**.
- No fallback occurred. The model changed because the operator switched it at
  `2026-08-18T10:38:16.556Z`; domain references to the keyword-fallback matcher are unrelated.

The prior final reviewers reviewed `b8341e9`. Four subsequent substantive code/test commits plus
documentation produced `6b35622`, changing 28 files by +1,185/−83 lines. The late Opus range then
added `81a6949` and source-changing `a2ddca8`. None of Phase 7 or either post-review range has a
Fable reviewer verdict. Existing verdicts and late gate records are evidence, not a verdict on
the current branch tip.

### Isolation

Do not edit the ordinary checkout, the QF worktree, or the completed conflict worktree. Verify
their status read-only. First confirm the old authoring session has no running workflow or agent;
Prompt A's late Gate-9 recheck reported complete and its worktree removed, so any live work there
is unexpected and must be resolved before freezing the audit target. Resolve
`AUDIT_TARGET_SHA=$(git rev-parse codex/conflict-evaluations-integration-20260817)` and verify it
is a descendant of `a2ddca8` (or stop and explain why the branch was rewritten). Record every
commit in `6b35622..AUDIT_TARGET_SHA`. Create a new
local worktree and audit branch directly from that immutable resolved target:

```text
worktree: /Users/go/code/bnow-net-worktrees/conflict-evaluations-final-audit-20260818
branch:   codex/conflict-evaluations-final-audit-20260818
base:     AUDIT_TARGET_SHA (resolved and printed before worktree creation)
```

If the source branch advances after `AUDIT_TARGET_SHA` is recorded, do not silently chase it.
Report the new commit, stop the old session if still active, and ask the operator which immutable
target to audit.

Before creating the audit worktree, verify QF audit branch tip `858bb9a`, confirm
`7150b49..858bb9a` is documentation-only, and confirm `7150b49` remains an ancestor of
`AUDIT_TARGET_SHA`. If later QF commits introduce source/test/env-contract changes outside the
conflict target, report `qf-base-advanced` and stop for an operator integration decision. Do not
rebase, cherry-pick, or merge QF audit commits implicitly.

If either name already exists, inspect it and choose a new suffixed path/branch; never overwrite,
reset, or clean it. Preserve all unrelated user work.

### Authorization

Authorized:

- read-only inspection, local audit artifacts, local tests/builds/browser checks;
- isolated local commits on the audit branch;
- disposable Neon branches through the existing integration-test workflow if credentials are
  available, with creation/deletion recorded and secrets read inline only;
- local remediation of audit-confirmed defects, followed by full gates and exact-tip re-review.

Not authorized:

- merge to `main`, push, PR, deploy, feature enablement, env/cap changes;
- production or preview DB writes, production cron/backfill calls;
- paid OpenAI/Anthropic/X/OpenSanctions or other provider calls;
- copying `.env.local` or credentials into the worktree;
- a live conflict evaluation or shadow soak;
- implementing the separately blocked snapshot, compound-calibration, human-adjudication, or
  production-DB programs merely to make this audit pass.

Use `LLM_DISABLE=1`, blank paid-provider keys, safe fake/unroutable values, SDK mocks, and network
kill switches for all refusal tests. Never set `UPDATE_CONFLICT_GOLDENS=1`.

### Read first

Read in full:

1. `AGENTS.md` and the current Git graph/worktree state.
2. `docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md`.
3. `docs/prompts/2026-08-17-conflict-region-combined-evaluations.md`.
4. All `CONFLICT-EVALUATION-*` reports, ledger, register and index.
5. `docs/designs/CONFLICT-REGION-EVALUATION.md`,
   `CONFLICT-REFERENCE-REPORTS-SCHEMA.md`, `CONFLICT-SNAPSHOT-CAPTURE.md`, and
   `CONFLICT-SHADOW-SOAK.md`.
6. The complete conflict diff `7150b49..AUDIT_TARGET_SHA`, not only the final report.
7. The post-review diff `b8341e9..6b35622` line by line, plus the late-Opus range
   `6b35622..AUDIT_TARGET_SHA` line by line.
8. The current-session evidence export at
   `/Users/go/code/bnow-net-audit-evidence-20260818`, if present. Treat it as provenance evidence,
   not as proof that a claim is correct. Verify `MANIFEST.sha256`, read README §§0–12, and inspect
   the preserved verbatim reviewer prompt/output pairs relevant to each disputed claim.
9. The completed QF audit artifacts from
   `/Users/go/code/bnow-net-worktrees/quality-foundation-final-audit-20260818/docs/reviews/`:
   `QUALITY-FOUNDATION-FABLE-FINAL-AUDIT-2026-08-18.md`, its ledger, finding register, and the two
   fresh reviewer reports. Read relevant sections with targeted ranges; do not ingest every file
   wholesale when the finding register or exact cited lines suffice.

Create:

- `docs/reviews/CONFLICT-EVALUATION-FABLE-FINAL-AUDIT-2026-08-18.md`;
- `docs/reviews/CONFLICT-EVALUATION-FABLE-AUDIT-LEDGER-2026-08-18.md`;
- one separate report for each fresh reviewer;
- a findings register mapping every old and new finding to fixed/deferred/invalid/unresolved.

### Phase A — reconstruct reality before reviewing conclusions

1. Verify all branch/worktree/ancestry claims with Git. Confirm every QF and conflict phase tip is
   an ancestor of its claimed integration branch. Confirm ephemeral reviewer worktrees are gone
   and identify stale/prunable registrations separately.
2. Compare the two original prompts to delivered artifacts. Reconcile with the current session's
   exhaustive gap audit, but independently reproduce every “required and skipped” claim.
3. Verify exact commit/file/line statistics and all report SHA statements. A report that says
   “final” while describing an earlier SHA must be labelled accordingly.
4. Independently verify Prompt A's model timeline: Gate 6 is the last fully Fable-reviewed gate;
   Phase 7 and everything after the switch are predominantly or entirely Opus work. State which
   model actually performed each part and distinguish an operator switch from a fallback.
5. Do not edit code in Phase A.

### Phase A2 — bounded QF dependency acceptance (do not repeat the QF audit)

1. Verify `7150b49` is the exact ancestor consumed by the conflict branch. Verify the QF audit
   branch's `7150b49..858bb9a` delta is documentation-only and that its two fresh verdicts bind
   exact runtime SHA `7150b49`.
2. Map every conflict import, modification, or CLI path that depends on QF Worktree C or shared
   validation code. At minimum inspect the inherited runner/contracts/gates/isolation machinery,
   the conflict profile adapter, CLI dispatch, `sanitizeMatches`, and `majorityFromVotes` seam.
3. Do not reproduce the full QF residual program. Verify only the conflict-specific consequence:
   the duplicated `conflictModeReport` flow and additional dynamic import must not weaken saved-
   report honesty, lazy DB-import ordering, provider isolation, or candidate-vs-production
   separation. Record the QF hardening items as prerequisites before a first binding paid eval,
   not blockers to this dormant fixture-backed conflict review unless conflict code worsens them.
4. Run interface/contract tests across the QF→conflict boundary. Confirm the conflict additions do
   not weaken QF's estimate/report/offline no-provider guarantees or make a candidate model
   production-dispatchable.
5. Do not re-review QF Worktree A recency/funnel, Worktree B lease/remap, Worktree C generally, or
   Worktree D. Assign their substantive verdict to the completed QF audit unless a conflict path
   directly consumes them or the combined full gates reveal a regression.
6. State the scope honestly: a Prompt-B pass covers the conflict delta and its accepted seams; it
   does not independently certify the entire `origin/main..7150b49` QF implementation.

### Phase B — audit the post-review delta first

Review every line of `b8341e9..6b35622` and `6b35622..AUDIT_TARGET_SHA`. The prior final reviews
cover neither range. Distinguish source changes from docs-only gate-record commits, and verify the
underlying logs/commands rather than accepting a docs-only commit as self-proving.

At minimum verify:

- intake validation rejects malformed/missing `stub`, `published`, `engine`,
  `currentExtractorVersion`, `docId`, and mirror IDs without leaking values;
- the documented claim-grain query bound cannot truncate a claim's document set and does not
  promise behavior no real repository implements;
- all four fixture banners and feature-off/authz paths remain body-safe for bare GET, `RSC: 1`,
  prefetch/HEAD, anonymous, signed-in-unaccepted, and accepted tiers;
- all new unavailable/zero/incomparable copy is numerically and semantically correct;
- RTL, accessible names, print, mobile overflow, metadata and route guards did not regress;
- no reference/source prose, credentials, generated paid result, provider dispatch, DB wiring,
  migration, nav, sitemap, robots, scoreboard, or production validation change entered the delta.

Do not accept “goldens unchanged” as proof that safety/UX changes are correct.

### Phase C — mandatory scientific and implementation attacks

Treat these as hypotheses to test, not predetermined verdicts:

1. **Source independence may be misdefined.** `independentSourceCount` currently appears to count
   distinct non-mirror `docId`s. A document is not a source: two articles from one outlet, two
   channels under one publisher, or two dependent but non-mirror reports can inflate the count.
   `CandidateDoc` has no stable source-registry identity. Determine whether every UI/report/score
   labels this as source independence or thin-source corroboration. Either prove the construct,
   rename it honestly to document support, or design a source/dependency-aware replacement. Do not
   preserve a false label merely because the code now deduplicates duplicate doc IDs.
2. **Stub truth has two authorities.** `STUB_ADAPTER_NAMES` is copied into the conflict package and
   says “keep in sync” with `src/lib/adapters/stubs.ts`. Test drift, live-X (`x_api`) separation,
   `STUB_CONTENT_PREFIX`, and future adapter changes. Prefer one lightweight source of truth or a
   structural cross-module drift test; a comment is not enforcement.
3. **No Fable audit has replayed the terminal gates.** Late Opus evidence reports, at `a2ddca8`,
   unit **3,213/3,213**, typecheck, lint, goldens, production build, disposable-Postgres
   **151/151**, HTTP/RSC authorization coverage, source/legal scans, and a targeted Gate-9 browser
   recheck. The full Gate-9 matrix ran at `6b35622`; the targeted `a2ddca8` recheck covered the
   changed q7 link plus order/overflow/qualifier checks, but explicitly did not repeat contrast,
   RTL, print, or keyboard. CLI/network-kill refusals have not been rerun after `ad10fbd`.
   Independently verify all evidence and replay the complete applicable battery at the exact
   Fable-audited target; do not inherit an Opus PASS merely because the commands were recorded.
4. **Backtest emulation has unresolved verifier findings.** Independently test and disposition:
   - deterministic designated-final edition selection is handed to the legacy side although
     production selects an unordered same-date row;
   - F2's keyword `matchable` denominator counterfactual is computed but not rendered; prior probe
     estimated ROCA 82.4% and Iran 75.0%;
   - F4 empty-population/no-row handling is load-bearing; prior counterfactual estimated ROCA 78.9%
     and Iran 80.0%;
   - F5 says a pooled denominator is what the scoreboard presents, while the production surface
     appears to show per-run rows and an unweighted mean, not the pooled 15/36 construct;
   - the publication-gap snapshot reason is not `no_proven_snapshot` in all 41 cases;
   - combined and legacy eligibility windows differ materially (F10).
   Recompute rather than copying those numbers.
5. **Primary metric on real inputs remains undefined.** Verify the compound-unit attestation gap,
   absent real `compound` derivation, analytic-assessment units, Iran-blind keyword rung, and the
   measured weak shared-action-class heuristic. These may be acceptable blockers to soak/enablement
   but must not be described as a scientifically validated live metric.
6. **Fixture circularity.** Confirm the Iran 57.1%→76.2% statement is consistently described as a
   structural fixture result, never a genuine real-world product gain. The terminal chat called it
   a “genuine product gain”; judge whether that overstates the committed evidence.
7. **One report/one denominator.** Re-derive the ROCA 36-vs-22 denominator claim and determine what
   the real scoreboard actually renders. Separate presentational honesty from coverage gain.
8. **Review completeness.** Decide whether 40,000+ lines of dormant, fixture-backed code should be
   merged as one line, split into smaller reviewable PRs, or remain unmerged until the blocked
   methodology is resolved. “Feature off” reduces runtime risk but does not erase maintenance and
   review risk.

### Phase D — replay the full integration gates on one exact SHA

Run against the unchanged audit base first. If remediation later changes code, rerun the complete
applicable battery against the remediated tip:

1. clean worktree, `git diff --check`, conflict-marker scan;
2. targeted tests for every phase and every post-review file;
3. typecheck and lint;
4. full unit suite with exact count;
5. production build with `CONFLICTS_UI` absent, `LLM_DISABLE=1`, no routable DB/provider;
6. local flag-ON build/serve with an unroutable DB and synthetic fixtures only;
7. full disposable-Postgres suite, if credentials are available, with all paid keys blank and the
   disposable branch deletion proven;
8. conflict CLI validate/estimate/offline/report plus every live/equals/unknown-token refusal under
   fake keys and a hard network kill switch;
9. bare GET + `RSC: 1` + prefetch/HEAD body probes for every route and access tier;
10. browser matrix: 320/390/desktop, light/dark measured contrast, RTL, keyboard Tab walk, print,
    unavailable, empty, incomparable, feature off;
11. legal/source scan across persistable results, errors, logs and rendered HTML;
12. golden byte identity, with no update flag;
13. exact ancestry, migration, provider-call, DB-write and working-tree status.

If a gate cannot run, mark it `NOT RUN` with the exact reason. Do not inherit PASS from another SHA.

### Phase E — three fresh Fable 5 reviewers

After Phase D is green on an exact committed SHA, launch three isolated reviewers in fresh
worktrees. They receive project instructions, the two prompts, base SHA, target SHA and diff; they
must reach their own conclusions. They may read prior reports only after recording an initial
attack plan.

1. **Methodology/evaluation science:** denominator, real-input construct validity, compound and
   assessment units, matcher ladder/calibration, source independence, backtest emulation,
   aggregation, shared-source dependence, and analyst usefulness.
2. **Safety/operations/authz:** post-review delta, traceability, stub truth, query grain/bounds,
   snapshots, legal text, feature-off equivalence, ruling-21 HTTP bodies, concurrency, CLI/spend
   isolation, migrations and default-off behavior.
3. **Product/integration/compliance:** prompt-to-delivery completeness, worktree/merge truth,
   exact-SHA gate evidence, conflict-vs-country clarity, inaccessible/zero/unavailable states,
   drill-back, mobile/RTL/a11y/print, and whether the proposed merge/PR decomposition is reviewable.

Each report must include actual model/effort, exact SHA, inspected paths, commands, reproductions,
findings by severity, clean categories, and one verdict. A review on a different SHA is invalid.

### Remediation rule — stronger than the original closeout

- First record the three independent verdicts before changing code.
- Fix every BLOCKER/HIGH that is safely within this audit's scope.
- For any accepted MEDIUM that causes a code, test, contract, or user-facing-copy change, rerun
  every affected full gate and obtain a focused re-review from the relevant Fable reviewer against
  the exact new SHA. Do not repeat the prior pattern of changing substantial code after review and
  carrying the old verdict forward.
- Do not “fix” compound calibration, human labels, snapshot capture, durable DB wiring or live
  dispatch without the separate authorization/data those programs require. Mark them as blocking
  prerequisites with an owner and next workstream.
- Never rebaseline goldens simply to pass.

### Final report and allowed conclusions

The final audit report must distinguish:

- **merge safety of dormant/default-off code**;
- **scientific readiness for a real shadow soak**;
- **product readiness for feature enablement**;
- **production/deployment readiness**.

These are not one verdict. A branch may be locally merge-safe while soak and enablement remain
blocked.

End with exactly one overall status:

- `independent-audit-pass / merge-may-be-considered; soak-and-enablement-blocked`
- `independent-audit-pass / merge-may-be-considered`
- `independent-audit-pass / conflict-delta-may-be-considered-on-audited-QF-base; soak-and-enablement-blocked`
- `independent-audit-fail / remediation-required`
- `model-gate-blocked`
- `verification-gate-blocked`

Name the exact final audited SHA. State explicitly that no merge to `main`, push, PR, deploy,
feature enablement, paid call, production write, or shadow soak occurred.
