# Quality-foundation program — independent final audit (2026-08-18)

Commissioned by the operator as a fresh-session, exact-SHA audit of the completed
local-only QF program, independent of the authoring and conflict-evaluations
sessions. Companion artifacts, all on branch
`codex/quality-foundation-final-audit-20260818`:

- `QUALITY-FOUNDATION-FABLE-AUDIT-LEDGER-2026-08-18.md` — exact commands/results
- `QUALITY-FOUNDATION-FABLE-AUDIT-FINDING-REGISTER-2026-08-18.md` — every old and
  new finding with a disposition
- `QUALITY-FOUNDATION-FABLE-AUDIT-SAFETY-REVIEW-2026-08-18.md` — fresh reviewer 1
- `QUALITY-FOUNDATION-FABLE-AUDIT-SCIENCE-REVIEW-2026-08-18.md` — fresh reviewer 2

## 0. Model gate

Auditing session: `claude-fable-5` at effort `xhigh` (UI label "ultracode";
`/effort` reported "xhigh + dynamic workflow orchestration"), large-context
session. Both fresh reviewers: `claude-fable-5` (model id verified from their own
contexts) at xhigh per spawn configuration, honestly reported as
spawn-configured. Twelve attack/reconstruction agents likewise ran on
`claude-fable-5`. **Model gate: PASSED** — no review in this audit ran on Opus,
Sonnet, or any other model.

## 1. Exact target and audit identity

- `QF_SOURCE_BRANCH=codex/quality-foundation-integration-20260817`
- `QF_AUDIT_TARGET_SHA=7150b494d1399dddada6e7f917b1c0e76114d458` — the branch
  resolved to exactly the observed `7150b49`; no additional commits; the branch
  did not advance at any point during the audit (re-verified at closeout).
- Audit worktree/branch created from that immutable SHA; every gate in the audit
  ran against the UNCHANGED target before any audit commit existed.
- Evidence package `bnow-net-audit-evidence-20260818`: 26/26 manifest files
  verified; used as leads, with every load-bearing claim independently
  reproduced. Governing prompt (760 lines) hash-preserved:
  SHA-256 `7a556210e1ebbdcea964982c922c957b4cb64555e2fb10cf08a70261f33e6fcc`.

## 2. What this audit did

Phase 1 reconstructed the program and its review chain from git and recovered
primary transcripts; Phase 2 executed all fourteen mandatory attacks via twelve
isolated agents plus inline reproduction; Phase 3 ran the complete gate battery
on the unchanged target (ledger §6 — every gate green, none NOT-RUN); Phase 4
commissioned two fresh exact-SHA adversarial reviews with attack-plans-first
discipline. Remediation was deliberately **docs-only** (§6).

Headline reconstruction result: **the QF review chain is genuine.** All eight
original QF reviewer transcripts (plus both worktree-author transcripts) were
recovered from session storage; every assistant message records
`claude-fable-5`/`xhigh`; the recovered verbatim verdicts match the integration
report's §12 table row-by-row with zero divergence, including both initial B
FAILs, the D FAIL, and both final PASS-WITH-MINORS on `e5757ea` (the final
science reviewer's transcript contains a real 2,402-test run at the tip). The
transcripts are now archived with hashes in the evidence package
(`qf-reviewers-recovered-20260818/`).

## 3. Verification summary (unchanged target `7150b49`)

Every claim-bearing gate reproduced exactly: `git diff --check` clean · typecheck
clean · lint clean · **unit 2,402/2,402 (185 files)** · production build PASS
(dummy unroutable DB, `LLM_DISABLE=1`, all paid keys blanked) · **integration
119/119 (19 files)** on disposable Neon branch `br-aged-river-atcvvwhl`
(created + deleted; paid keys blanked) · base count independently reproduced at
`05fdd2c` (**2,187/171**, pinning +215/+14) · all four $0 eval CLI modes clean ·
ten live-refusal probes refuse pre-client (exit 2) · the full-preflight
network-kill run aborts at the acknowledged eval DB before any provider contact
with zero writes · funnel refusal + routing inspector as designed · committed
offline artifacts regenerate **byte-identically** (only `updatedAt`/`generatedAt`
move) · no secrets/env files/live results in the diff · merge topology and
worktree disposition exactly as reported · nothing pushed.

## 4. Mandatory-attack outcomes (register has full detail)

1. **Untracked governing prompt — CONFIRMED**, remediated (tracked verbatim,
   hash-recorded, commit `2919970`).
2. **Exact-SHA review mismatch — CONFIRMED and BOUNDED**: `e5757ea..7150b49`
   non-docs delta is byte-empty; AGENTS.md entry moved verbatim; `.env.example`
   delta comments-only documenting envs the reviewed code already read. Not
   behaviorally material; cured going forward by this audit's two fresh reviews
   binding the exact tip.
3. **False NUL claim — CONFIRMED**: literal 0x00 in changed
   `digest-persist.ts:286`; byte pre-existing at `origin/main`; a working
   separator, not a runtime defect; the claim corrected by dated appendix
   (`bd29d89`). Real significance: grep-based scans silently skip that file.
4. **Lease fencing** — the CAS/token core withstood every constructed attack
   (split-brain, ABA, clock-skew, renew-vs-takeover, pooled connections, stale
   release). The fence is diagnostic-only; writes are token-RE-CHECKED, not
   statement-fenced, so the disclosed chimera window is real and is the whole
   renew-to-COMMIT span (sharper than the report's "single-statement" wording).
   The prompt's "monotonically safe fencing" is PARTIALLY met — an honest,
   reviewer-accepted shortfall whose complete fix (fence column) is a
   deliberately-deferred schema change. Verdict: strictly safer than the
   advisory lock it replaces; not a merge blocker; two write-path lost-lease
   unit pins and comment-wording fixes are owned prerequisites.
5. **Remap safety** — eligibility/anti-join/no-claim-completion/mirrors/
   processed-immutability/checkpoint-versioning/resume/handshake/budgets/
   metering/activation-lock all verified, most by real-Postgres tests this audit
   re-ran. New durability items: the never-writes-`processed` invariant is
   pinned only by a Neon-gated itest (pre-push-invisible; ruling-21 precedent
   argues for an always-run pin); `--limit` NaN silently unbounds (spend still
   budget-bounded); checkpoint identity omits the target environment.
6. **Saved-report identity — CONFIRMED and DEMONSTRATED**: `--report` gates only
   `datasetContentHash`; a fabricated promptHash rendered a binding-looking PASS
   with a proposed registry entry; NEW: the baseline is trusted by FILENAME (a
   byte-copied candidate self-compares to deltas 0 and passes).
7. **Repetitions — CONFIRMED**: reps=1 can pass; no MIN_REPETITIONS; `--fresh`
   erases provenance (re-roll-until-pass artifacts look first-try).
8. **Leakage/representativeness** — machinery real: input-only prompt builders
   sentinel-proven, heldout discipline enforced and hidden by default, gates
   preset (git-history-verified), no model graders, scorers reuse the real
   production functions import-by-import, corpus arithmetic exact, honesty of
   hand-authored fictional cases spot-verified. Gaps: zero mustNotMatch pins on
   the gated heldout map split; no numeral-preservation instrument; heldout
   language coverage ru/fa only.
9. **DB/provider isolation — HELD under attack**: 47-module eager closure has
   zero `@/db` edges; exactly three lazy edges; overwrite-before-first-execution
   verified structurally AND behaviorally (network-kill run). The invariant is
   inspection-only — the regression pin remains the sharpest latent risk and
   must be authored union-aware (see 14).
10. **Retry exemption** — `ask-eval-harvest.ts` is outside the QF diff,
    inherited from the routing branch's disclosed follow-ups; the
    filename-keyed exemption is honest but untracked debt (needs an OPEN-TASKS
    entry; no Ask change made).
11. **Evidence recency** — every semantic re-derived and every pinned fixture
    hand-recomputed EXACTLY by the science reviewer; denominators honest;
    anomalies counted, never laundered; both engines share one honest asOf;
    regeneration stable. Boundary-equality pins missing (trivial).
12. **Funnel** — mutation tests genuinely discriminating; superseded/mirror
    exclusion real; legacy never coerced; warnings never repair. Gaps: the A2
    "distinct documents in fed groups" stage is persisted but not surfaced by
    the report (A-report claim corrected); off-roster theaters' pending
    mislabel; platform/language dimension thinness.
13. **Routing/production containment — CLEAN**: K=5 untouched (eval refuses
    K≠5); publication guard order unchanged; recency computed post-guard,
    post-verdict; traceability trigger/schema byte-untouched; no new routes;
    map activation hard lock intact — remap and eval CANNOT dispatch a
    non-approved model in any production path; `evaluation_candidate` is
    confined to the dynamically-imported live runner and scan-pinned; no
    production module can import the eval library.
14. **Conflict-base consequence** — `7150b49` is an ancestor of `a2ddca8`
    (verified at start and closeout). The audit changed no source/test/env
    byte, so the conflict branch still contains the exact audited QF tree.
    Structural hazard mapped for the future: the conflict branch DUPLICATES the
    eval report flow (`conflictModeReport`, no identity gate) and refactors
    `loadResults`, and identity-gate remediations were empirically shown to
    merge clean while silently missing the duplicated path — every deferred C
    fix must therefore be specified against BOTH paths and verified on the
    merged tree.

## 5. Fresh exact-SHA review verdicts

| Review | Model/effort | SHA | Verdict |
|---|---|---|---|
| Safety/operations | claude-fable-5 / xhigh (spawn-config) | `7150b494d1399dddada6e7f917b1c0e76114d458` | **PASS-WITH-MINORS** (0 BLOCKER / 0 HIGH / 2 MEDIUM / 4 MINOR / 6 NOTE; 12 clean categories) |
| Quality/eval-science | claude-fable-5 / xhigh (spawn-config) | `7150b494d1399dddada6e7f917b1c0e76114d458` | **PASS-WITH-MINORS** (0 BLOCKER / 0 HIGH / 0 MEDIUM / 5 MINOR / 8 NOTE; 25 clean categories) |

Both initial verdicts were recorded before any audit code change existed (the
audit made none); both reviewers' MEDIUMs were the two evidence defects this
audit had independently confirmed (false NUL claim; untracked prompt), both
remediated docs-only.

## 6. Remediation performed (all docs-only; no re-review trigger)

| Commit | Content |
|---|---|
| `2919970` | governing prompt tracked verbatim (SHA-256 recorded) |
| `5d68959` | audit evidence ledger |
| `bd29d89` | dated corrections appended to the three program reports (NUL row; funnel `docsAnalyzed` claim; "unit-covered latch" cell + stale counts) — historical text verbatim, per house precedent |
| `abeb5a8` | safety review report + finding register |
| `866828b` | science review report |
| (this commit) | final audit report + register completion + decision-log entry |

Out-of-repo: the ten recovered QF reviewer/author transcripts archived to
`bnow-net-audit-evidence-20260818/qf-reviewers-recovered-20260818/` with their
own manifest (original package manifest untouched, still 26/26).

**No source file, no test, no `.env.example` semantic, no shared contract was
changed.** Accordingly the audit-prompt trigger phrase does not apply, and no
focused re-review of remediation was required (the accepted findings' fixes are
recorded as owned prerequisites, not implemented).

## 7. Separated conclusions

- **Worktree A (evidence recency + funnel): CORRECT and merge-reviewable.**
  The recency contract survived full independent re-derivation with exact
  hand-recomputation; the funnel's exclusion machinery is genuinely
  mutation-tested. Two named gaps ride as follow-ups: surface the persisted
  fed-group document count in the funnel report (the one A2 minimum stage not
  surfaced), and roster-aware pending labeling. Neither blocks merge.
- **Worktree B (lease + remap): CORRECT; safe to consider for a reviewable PR;
  deployment prerequisites named.** The lease core is atomicity-proven on real
  Postgres and strictly retires the #77 failure mode; remap is dry-run-first,
  resumable, version-aware, non-destructive, fail-closed on spend/config, and
  cannot activate any model. Prerequisites: land always-run unit pins for the
  remap-`processed` invariant and the two unpinned lost-lease write gates
  (with or before the deploying PR); sweep the `--limit`/`--cap` numeric
  parsing; fix the two absolute "never a second writer" comments; the
  remap-capable route must be deployed before any execution (handshake
  enforces); the fence-column migration remains a deliberately-deferred
  hardening PR.
- **Worktree C (eval control plane): READY as offline machinery.** All four $0
  modes are provably DB/provider-free (structural + behavioral proof), datasets
  are honest and validated, artifacts regenerate byte-identically, isolation
  scans plus the registry bypass confinement hold under attack.
- **Readiness for a first PAID/BINDING model evaluation: NOT READY until the
  pre-registered gate-integrity items close.** Consolidated close-before list
  (register §3/§4): report-time identity recompute (promptHash/schema/
  extractor/envKnobs — envKnobs currently absent from artifacts entirely);
  baseline identity gating (filename-trust + self-comparison + degraded-status
  denominator alignment); preset MIN_REPETITIONS + `--fresh` discard
  acknowledgement/provenance; heldout fidelity pins (mustNotMatch on the gated
  map split, a numeral-preservation instrument, digest-live pins); the
  lazy-`@/db` regression pin (union-aware per the conflict branch's duplicated
  report path); `--db-ack` production-host refusal; recursive scripts/ scan.
  Every item is small; all are pre-registered while zero candidate results
  exist.
- **Worktree D design: COMPLETE ENOUGH for a later authorized implementation.**
  Design-only status verified (no route, migration, table, or symbol leakage);
  all four review MAJORs' fixes present in the final text; 13 clean categories.
  Two pre-implementation notes: state the claim-key `<track>` derivation (via
  `digests.track`; NULL-`digest_id` edge) and the single-`created_at` reading
  of the prompt's "timestamps".
- **QF target as conflict-audit base: ACCEPTABLE and UNCHANGED.**
  `7150b49` remains an ancestor of `a2ddca8`; this audit's commits are
  docs-only additions on a separate audit branch.
- **Production/deployment readiness: NOT AUTHORIZED by this audit** and not
  assessed as a deployment decision. The audit confirms deployment-default
  equivalence claims (what changes on deploy is exactly what the reports say)
  but merge, PR, deploy, cap changes, remap execution, and any paid evaluation
  remain separate operator actions.

## 8. Final state declarations

- Exact final audited SHA (the immutable target): **`7150b494d1399dddada6e7f917b1c0e76114d458`**.
- Audit-branch commits created: `2919970`, `5d68959`, `bd29d89`, `abeb5a8`,
  `866828b`, plus the commit adding this report and completing the register —
  all documentation.
- The conflict branch (`a2ddca8`) **still contains the exact audited QF tree**.
- During this audit there was **no merge to `main`, no push, no PR, no deploy,
  no model activation, no paid provider call, no production write, no remap
  execution, and no conflict-branch mutation**. The only network use was
  disposable-Neon branch management through the existing harness (one branch,
  created and deleted, recorded) and no other external calls.

## 9. Status

`independent-qf-audit-pass / QF-merge-may-be-considered; conflict-base-unchanged`
