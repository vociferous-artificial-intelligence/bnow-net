# Conflict-evaluations program — independent final audit (2026-08-18)

Commissioned as a fresh-session, exact-final-SHA audit (Prompt B) of the completed local-only
conflict/region evaluation workstream, independent of every authoring session. Companion
artifacts, all on branch `codex/conflict-evaluations-final-audit-20260818`:

- `CONFLICT-EVALUATION-FABLE-AUDIT-LEDGER-2026-08-18.md` — exact commands and results
- `CONFLICT-EVALUATION-FABLE-AUDIT-FINDING-REGISTER-2026-08-18.md` — every old and new finding
  with one disposition
- `CONFLICT-EVALUATION-FABLE-AUDIT-SCIENCE-REVIEW-2026-08-18.md` — fresh reviewer 1
- `CONFLICT-EVALUATION-FABLE-AUDIT-SAFETY-REVIEW-2026-08-18.md` — fresh reviewer 2
- `CONFLICT-EVALUATION-FABLE-AUDIT-PRODUCT-REVIEW-2026-08-18.md` — fresh reviewer 3

## 0. Model gate

Primary audit session: `claude-fable-5` at effort `xhigh` (harness-stated model id; effort set
and confirmed by `/effort`), large-context session. All three fresh reviewers ran on
`claude-fable-5` (each printed its harness-stated id in its report) at the session-inherited
xhigh effort and recorded that honestly. **Model gate: PASSED** — no part of this audit ran on
Opus, Sonnet, or any fallback. Orchestration discipline held: one primary session, no dynamic
workflow, no attack-agent fleet, exactly three reviewers, none of whom spawned sub-agents or
replayed full suites.

## 1. Exact target and scope

- `AUDIT_TARGET_SHA = a2ddca88f7740a148ebeb5372f9ce47dd72ffac4` (`a2ddca8`) — resolved at
  launch from `codex/conflict-evaluations-integration-20260817`, identical to the Prompt-A
  export's observed tip; the branch never advanced during the audit (re-verified at closeout).
- Base: the independently audited QF SHA `7150b494…` (`7150b49`), whose own Fable audit
  (branch `858bb9a`, docs-only delta re-verified here) binds it with two PASS-WITH-MINORS
  verdicts. Per Phase A2 this audit performed a **bounded dependency acceptance** of that
  base — ancestry, docs-only audit delta, and every QF→conflict seam the delta touches — and
  does **not** independently certify the full `origin/main..7150b49` QF implementation.
- Range audited: 106 commits, 125 files, +40,970/−4 — every published statistic reproduced
  exactly (ledger §1). `origin/main` = `9c5e9cb`, unmoved, an ancestor.

## 2. What this audit established

**Reconstruction (Phase A).** All ancestry, worktree, and statistic claims verify against
git. The model timeline is confirmed from primary transcripts: Gate 6 (`1f70852`) is the last
fully Fable-reviewed point of the original program; Phase 7, both its verifiers, all three
original final reviews, the late gate re-runs, and `a2ddca8` are **Opus-5 work following an
operator model switch** (no fallback event exists). The evidence package's manifest verifies
26/26; two author-side transcripts survive only as hash-recorded exports (provenance caveat,
no contradiction). The gap-audit's "skipped despite required" findings all reproduce: zero
committed per-phase gate reports, no `CONFLICT-EVALUATION-INTEGRATION-…md`, no P1 report, and
a register/contract description of an atomization experiment that was never built.

**QF boundary (Phase A2).** The conflict delta adds five files to `src/lib/evals/` (all new),
edits only `scripts/analysis-eval.ts` (+281/−4) among inherited files, reuses the production
matcher exports unforked, has zero DB/provider imports on any conflict surface, and reuses the
inherited identity-drift refusal while *strengthening* dataset identity (derivation-covered
content hash). `conflictModeReport` mirrors — and does not worsen — the QF report-path
limitations; the QF pre-paid-eval hardening list remains a prerequisite specified against
BOTH report paths.

**Post-review delta (Phase B).** Both unreviewed ranges (`b8341e9..6b35622`,
`6b35622..a2ddca8`) were read line-by-line: the intake hardening, banner pins, honesty copy,
RTL isolation, and q7 gating do exactly what they claim, with pins; no forbidden content
entered either range; the freeze list is untouched across the whole program.

**Scientific attacks (Phase C) — outcomes.** (1) Source independence is a document-grain
construct labeled source-grain in the schema and some copy — confirmed, now a pre-soak
relabel/replace requirement. (2) Stub truth has two unlinked authorities with no structural
drift test — confirmed, an owned pre-mapper prerequisite. (3) The four-way backtest's
aggregates all reproduce exactly, but four of its self-descriptions were wrong and are now
corrected of record (F2's counterfactual promised-but-unrendered — recomputed at 82.4%/75.0%;
F5's claim about what the scoreboard presents — it renders unweighted per-run means, never a
pooled 15/36; an undisclosed designated-final-edition handoff to the legacy side; a
40-vs-41 snapshot-reason overgeneralization). (4) The primary-metric gaps (compound
attestation with no real-input derivation; the Iran-blind keyword rung — gazetteer
re-enumerated: 34/34 RU-UA toponyms) are real, reproduced, and honestly recorded as BLOCKING
pre-soak prerequisites in register #11/#12; nothing in the committed tree overstates the
fixture results (the "genuine product gain" phrasing existed only in chat). (5) The
ROCA 36-vs-22 double-count is real at row level; the honest headline (15/22 parity, gain is
presentational) is stated first in the committed report.

**Gate replay (Phase D).** The complete battery ran green at the unchanged `a2ddca8` —
nothing NOT-RUN: clean tree; targeted tests 811/811 (43 files); typecheck/lint clean; unit
**3,213/3,213 (228 files)**; production build exit 0 with zero warning lines (flag absent,
unroutable DB, keys blanked); flag-ON serve against an unroutable DB (zero runtime DB
dependency); disposable-Postgres **151/151 (21 files)** with the fork deleted; all four
conflict CLI modes clean under a hard network kill-switch with exact P7 hashes and the
$0.0031 hypothetical estimate; all eight refusal probes exit 2 under fake keys and a live
cap; HTTP/RSC/prefetch body probes clean flag-off, and all 14 gated evidence routes 307/308
anonymously with zero claim-text leakage under production posture (`FEATURE_AUTH_GATE=true`);
a 48-state overflow matrix, 16-state measured contrast (zero failures in `<main>`), keyboard
walks with full focus indication, RTL structural checks, print stamps, and a q2/q7 sweep of
all 14 records (0 inconsistent); a 679-fragment prose-recovery scan with zero hits; golden
byte-identity under `--fresh` with no update flag ever set. Full detail: ledger §5, including
the honest note that this audit's own first browser probe was mis-configured and re-run.

**Fresh reviews (Phase E).** Three isolated Fable reviewers in fresh worktrees at the exact
SHA, attack-plans-first: methodology/science **PASS-WITH-MINORS**, safety/operations
**PASS-WITH-MINORS**, product/integration **PASS-WITH-MINORS** — 0 BLOCKER / 0 HIGH across
all three. Their MEDIUMs converge with this audit's findings; reviewer-only additions are
registered with dispositions (finding register §5).

**Remediation (docs-only, after all three verdicts were recorded).** Dated corrections
appended to the P7 report (§12), decision register (#13), and workstream index; the audit
ledger, finding register, three reviews, and this report committed. **No source, test,
fixture, golden, `.env`, or contract byte changed — the conflict integration branch still
contains the exact audited tree**, so no re-review trigger fires and the reviewers' verdicts
carry to closeout unmodified. Code-level fixes are owned prerequisites staged pre-mapper /
pre-soak / pre-enablement (register §6).

## 3. Separated conclusions (four different bars)

1. **Merge safety of dormant/default-off code: PASS.** The delta is additive, freeze-list
   clean, migration-free, provider-clean, default-off at the body level under production
   posture, and fully gate-verified at the exact tip with three fresh exact-SHA verdicts.
   The operator may consider the merge, preferably via the P7 §5.1 seven-PR decomposition
   (endorsed by the product review with three refinements, including committing the preserved
   reviewer evidence with PR 7 and binding the new enablement item 4d).
2. **Scientific readiness for a real shadow soak: BLOCKED.** Register #12's prerequisites
   (compound derivation, measured compound rate, attestation adjudication, assessment-class
   diagnostic, keyword-rung `insufficient_data`) plus this audit's additions (independence
   relabel/replace; soak-sample power sizing) must close first. The primary metric is not yet
   well-defined on real inputs, and the committed record says so.
3. **Product readiness for feature enablement: BLOCKED.** Ruling-3 precondition (real
   results + banner retirement + decision-log entry), reference-URL/unit ordinals (4b),
   metadata/robots posture (4), per-source bucket posture (4c), **flag coupling 4d
   (`FEATURE_AUTH_GATE=true` wherever `CONFLICTS_UI=1`)**, scoreboard reciprocal link, i18n.
4. **Production/deployment readiness: NOT ASSESSED AND NOT AUTHORIZED.** Nothing here
   authorizes a merge to `main`, push, PR, deploy, env change, paid call, or soak.

## 4. Final state declarations

- Exact final audited SHA (the immutable target, unchanged throughout):
  **`a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`**.
- Audit-branch commits: `74880b2` (ledger), `f9605fe` (ledger numstat correction), `999da89`
  (three reviews), `f70eab0` (dated corrections + finding register), plus the commit adding
  this report and the AGENTS.md decision-log entry — all documentation.
- During this audit there was **no merge to `main`, no push, no PR, no deploy, no feature
  enablement, no environment or cap change, no paid provider call, no production write, no
  shadow soak, no golden rebaselining, and no mutation of any non-audit worktree**. Network
  use: one read-only `git fetch` and disposable-Neon branch management through the existing
  harness (one fork, created and deleted).
- The three ephemeral reviewer worktrees created by this audit were removed at closeout.

## 5. Status

`independent-audit-pass / conflict-delta-may-be-considered-on-audited-QF-base; soak-and-enablement-blocked`
