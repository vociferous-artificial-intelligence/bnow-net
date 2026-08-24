# Pending-merge adjudication register — release-train execution (2026-08-24)

Executed against the operator plan `docs/prompts/2026-08-25-pending-merges-fable-adjudication.md`
(with its adopted execution addendum A1–A10) in a single fresh session on 2026-08-24 UTC
(~19:30Z → close). Model gate: PASS (the commissioned model at its maximum coding effort;
harness effort field xhigh, displayed label Ultracode). Every §2 ground-truth figure was
re-derived from the live record before use; four plan corrections were found (§8 below),
none material. Deploys were deliberately NOT performed — the operator action list is §9.

## 1. Outcome summary

Eleven PRs landed (#12–#22), two PRs closed (#3 superseded after salvage via #13), five
branches closed as superseded with lossless-deletion proofs, two programs (QF Worktrees
A and C; the seven-PR conflict evaluator) landed by audited-strand extraction with
byte-level fidelity proofs, and `main` moved `33f405b` → `e359c61` with every gate green
at every step. Nothing was deployed; no env, cap, cron, migration, model, or flag changed;
zero paid provider calls were made by this session; the production DB was read-only.

| Stage | Result | Evidence |
|---|---|---|
| 5.0 PR #12 | MERGED `998098b` after adversarial review found and fixed a systematic +4h self-clock error and stale in-place text (`35cbdbd`) | `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md` §14 erratum |
| 5.1 disposals | 5/5 executed; PR #13 salvage MERGED `30088bf`; PR #3 CLOSED | §3–§4 below |
| 5.2 QF-A | PR #14 MERGED `d4557c4`; 6/6 commits byte-identical + 6 landing repairs; A1 review zero defects | `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-RELEASE-2026-08-24.md` |
| 5.3 QF-C | PR #15 MERGED `a9716cb`; 17/17 byte-identical + 2 declared carries; H4 = no behavior change; A1 review one doc-only finding, fixed | `docs/reviews/QF-C-ANALYSIS-EVAL-RELEASE-2026-08-24.md` |
| 5.4 conflict evaluator | PRs #16–#22 MERGED through `e359c61`; **125/125 files blob-identical to the audited trees**; combined gates green; combined adversarial review ZERO confirmed defects | `docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md` |
| 5.5 exclusions | `claude/local-model-ask-eval-20260817` and `claude/business-planning-20260817` stay parked | §5 below |
| §6 paid evals | Gate status: 2 of 5 conditions met; still BLOCKED | §9.3 below |

Final tree gates (`e359c61`): typecheck/lint clean · unit **3,329/3,329 (231 files)** ·
integration **151/151 (21 files)**, disposable Neon fork · pre-push hook green on all
eleven pushes.

## 2. Landed items

- **PR #12** (`claude/map-unicode-recovery-closeout-20260824`) — #86 recovery closeout.
  Every DB-derived claim re-verified read-only against production before merge (24 cycles,
  767 batches / 0 errors, `llmRequests = batches + 2×truncationSplits` per-cycle, fences
  39→62 strict +1, four extractor versions, zero `map:remap` rows ever, spend, the #98
  NULL-row set, backlog). An 18-agent adversarial review confirmed 10 findings (all fixed
  pre-merge in `35cbdbd`), refuted 3. The one systemic defect: the closeout session's
  clock ran +4h (the Neon serverless driver serializes timezone-naive timestamps as local
  ET with a bogus `Z`), so it dated itself 2026-08-25 in 15 places and recorded read times
  that had not yet occurred; corrected with provable pins (fence residue window, commit
  author stamp 21:09:09Z, PR open 21:10:42Z, external HTTP Date checks, DB≡local epoch).
- **PR #13** — the PR-#3/preserve-branch salvage (bootstrap prompt + prompts README).
- **PR #14 QF-A** — 6-commit strand from `05fdd2c` rebased onto `main`; empty conflict
  ledger; `range-diff` 6/6 `=`; all outstanding audit findings against A repaired at
  landing (FUNNEL-A12-1/2/3, A-REC-1, SCI-N4) plus the A1 review's roster-provenance
  note; FUNNEL-A12-4/5 recorded as OPEN-TASKS #99. A1 adversarial review: zero confirmed
  defects.
- **PR #15 QF-C** — 17-commit strand rebased onto post-A `main`; `range-diff` 17/17 `=`;
  declared carries `ba35082` (byte-identical patch) and the `7150b49` `.env.example`
  block (corrected at landing — it overstated fail-closed semantics). H4 resolved: the
  `map-worker.ts`/`llm-match.ts` touches are pure refactors, byte-verified; no soak
  needed. Ruling 4 verified directly; no `EVAL_*` env exists in any Vercel environment,
  so live/paid evals remain impossible.
- **PRs #16–#22, conflict evaluator** — the audited seven-PR decomposition, each PR's
  files hash-verified per-blob at build time against `a2ddca8` (or `da44272` for the
  three audit-updated docs), end-state proof 125/125 blob-identical on merged `main`;
  recorded gate verdicts carried in each PR; ruling 21 verified on every page; the
  audit's decision-log entry carried verbatim. Landed **default-off** (`CONFLICTS_UI`
  absent everywhere).

## 3. Closed as superseded (content-proven, lossless)

| Item | Proof | Action taken |
|---|---|---|
| `codex/map-reliability-remap-20260817` (QF-B strand, `c40060e`) | `range-diff 05fdd2c..c40060e 23a1280^1..23a1280^2`: all 7 commits `=` into the landed PR #7 range, which adds 4 remediation commits on top; `c40060e` is an ancestor of `7150b49` | branch + worktree deleted; tag `audit/qf-b-strand-c40060e` |
| `codex/cloud-model-routing-seams-rebased-20260820` (`6dc10bb`) | 0 ahead of `main` — `6dc10bb` IS PR #5's merged head | branch + worktree deleted |
| `pr5-audited-head-0e469f7` + local `codex/cloud-model-routing-seams-20260816` (both `0e469f7`) | `0e469f7` is the second parent of the QF base `05fdd2c` (permanently reachable); PR #5 merged the reconciled `6dc10bb`, not this audited head | branches deleted; tag `audit/pr5-head-0e469f7`; merged remote branch deleted |
| `codex/preserve-pre-reconcile-docs-20260816` (`01f98ac`) | unique content = bootstrap prompt + README only — its Iran-recovery prompt and PROGRESS entry verified already on `main` verbatim | salvaged via PR #13; branch deleted; tag `archive/preserve-pre-reconcile-01f98ac` |
| **PR #3** (`codex/reconcile-live-state-20260816`) | its 2026-08-16 doc rewrites are 36+ commits stale vs the corrected standing record (PRs #7–#12); unique artifacts salvaged via PR #13 | PR closed with explanation; remote + local branch deleted; tag `archive/pr3-reconcile-head` |

Also cleaned post-landing: the landed strand sources `codex/evidence-quality-observability-20260817`
and `codex/analysis-eval-control-plane-20260817` are ancestors of `7150b49` (kept parked
there) — local branches retained for now; see §9.4 hygiene.

## 4. Parked deliberately (NOT defects)

- **`codex/quality-foundation-integration-20260817` (`7150b49`) + `codex/quality-foundation-final-audit-20260818` (`858bb9a`)** —
  KEEP PARKED as audit evidence. A and C landed by extraction; B landed earlier as PR #7;
  Worktree D remains design-only (its reviewed design `docs/designs/HUMAN-ADJUDICATION.md`
  lives on the integration branch — carry recommendation in §9.4). The 2026-08-21
  immutability posture for `7150b49` is superseded for A/C by the operator plan (H6
  supersession recorded in the AGENTS.md decision log at the QF-A landing).
- **`codex/conflict-evaluations-integration-20260817` (`a2ddca8`) + `-final-audit-20260818` (`da44272`) + the eight `p0`–`p7` gate branches** —
  KEEP PARKED: their DAG carries the `--no-ff` gate-merge commits whose subjects are the
  recorded review verdicts (summarized on `main` in the P7 report §1.4, but the commits
  themselves are provenance). Content is fully landed (125/125 blob-identical).
- **`claude/local-model-ask-eval-20260817`** — stays OUT per plan §5.5: the audits found
  a conceptual collision between its Ask-specific CLI and the repository-owned eval
  control plane; reconcile separately. Its binding notes stand: local model ids stay out
  of `PRICES_PER_MTOK`; `ASK_ANSWER_MODEL` remains `gpt-5` in every Vercel env; no local
  model promotes without its own paid scorecard. Related debt now tracked: OPEN-TASKS
  #100 (the untracked `ask-eval-harvest.ts` isolation exemption).
- **`claude/business-planning-20260817`** (1 docs commit, worktree `.worktrees/business-planning-20260817`) —
  ordinary business docs; disposition with the §7 operator decision.
- **`claude/iran-validation-recovery-20260815`** — merged (PR #2); branch + worktree are
  hygiene leftovers (§9.4).

## 5. Explicitly out of scope, untouched

No deploy, no model activation, no remap (zero `map:remap` rows, ever — re-verified), no
cron invocation, no digest regeneration, no `FORCE_REGEN`, no paid evaluation, no env/cap/
schedule change, no production DB write, no migration, no `CONFLICTS_UI`, no conflict
shadow soak. Open tasks #87, #88, #89, #90, #91, #97, #98 not touched (no ride-alongs);
QF Worktree D not implemented.

## 6. §7 adjudication — uncommitted work in the primary checkout (RECOMMENDATION, not executed)

Verified against post-landing `main`:

- Now tracked and byte-identical to the untracked local copies (no action needed):
  `docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md` (via PR #7),
  `docs/prompts/2026-08-17-conflict-region-combined-evaluations.md` (via PR #16).
- **Recommend committing** (audit precedent G1: untracked governing prompts are a
  provenance deficiency) on a small docs PR:
  `docs/prompts/2026-08-18-quality-foundation-fable-final-audit.md`,
  `docs/prompts/2026-08-18-conflict-evaluations-fable-final-audit.md`,
  `docs/prompts/2026-08-25-pending-merges-fable-adjudication.md` (with its A1–A10
  addendum — the governing prompt of THIS execution).
- **Operator decision** (business content; commit, hold, or move to a private store):
  `docs/GO-NO-GO-REGISTER-2026-08-23.md`, `docs/OUTREACH-ROSTER-2026-08-23.md`, the
  modified `docs/PARTNER-STRATEGY.md`, the 10 `2026-08-17-roadmap-*` prompts,
  `docs/prompts/2026-08-17-local-model-ask-eval.md`, and the
  `claude/business-planning-20260817` branch.
- **Do NOT commit** (package-manager drift; operator decision required): `pnpm-lock.yaml`
  + `pnpm-workspace.yaml`. The repo is npm-tracked (`package-lock.json` committed; all
  gates and hooks run npm). Options: delete the pnpm files, or migrate the repo to pnpm
  deliberately (touching CI, hooks, docs). Until decided they sit untracked and inert.
- Ignore: `.claude/`, `.pnpm-store/`, `.worktrees/`.

## 7. Completeness sweep (addendum A7)

Every open PR: #12–#22 merged this session, #3 closed; **no PR remains open**. Every
local branch and worktree dispositioned above or in §9.4. Every remote branch: the 18
pre-existing feature/closeout branches are ALL verified fully contained in `main`
(ancestry-checked one by one) — lossless hygiene deletions at the operator's leisure
(§9.4); the 9 branches created this session correspond to merged PRs #14–#22 (the #12/#13
branches likewise merged). Tags created: `audit/qf-b-strand-c40060e`,
`audit/pr5-head-0e469f7`, `archive/preserve-pre-reconcile-01f98ac`,
`archive/pr3-reconcile-head` (local only).

## 8. Plan corrections (§11 discipline — reality over prompt)

1. **H5 provenance:** `ba35082` lives on the QF *integration* branch (the commit after
   the Worktree C merge `fa81c1b`), not on the conflict branches alone — they inherit it
   by ancestry. Same required action (cherry-pick), corrected provenance.
2. **§5.4 ROUTES expectation:** the conflict branch adds NO row to
   `authz-page-gate.itest.ts` — a documented, audited design (flag-off server cannot host
   the positive control); the equivalent body assertions run flag-on in
   `conflict-feature-off.itest.ts`, with a recorded binding migration obligation.
3. **§2 audited-source nuance:** `a2ddca8` sits 11 remediation commits past the
   `p7-integration` gate branch; the seven PRs therefore land the FINAL audited states
   (hash-proven), not the raw phase tips.
4. **§5.3 scope:** the QF tip also touches `.env.example` (eval-cap documentation), which
   the plan's QF-C file list omitted — carried onto QF-C, then corrected (its fail-closed
   claim overstated the code).

## 9. Operator action list

### 9.1 Deploys awaiting authorization (prepare only — none executed)

One combined deploy of `main` `e359c61` from the plain clone
`/Users/go/code/bnow-net-rel-20260823` (never a worktree — #78) takes QF-A + QF-C + the
dormant conflict evaluator live together; alternatively QF-A first, alone.
**Rollback target in all cases: `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`.**
Required env posture already holds: `CONFLICTS_UI` ABSENT everywhere,
`FEATURE_AUTH_GATE=true` in Production, no `EVAL_*` vars anywhere; **no env change is
needed or authorized for this deploy.**
Post-deploy: (a) QF-A observation — ≥1 complete day/digest cycle; expected signature is
additive `structured.stats.evidenceRecency` keys, zero change to published events; (b)
conflict smoke ONLY — anonymous bare + `RSC: 1` GETs on all four `/conflicts` routes
return no conflict token in any body; `/health` stamps the commit (plain clone).

### 9.2 Env / cap decisions (none urgent)

- #94 hygiene: the expired `MAP_USD_CAP_DAILY_OVERRIDE_USD`/`_UNTIL` pair is still
  installed (auto-expired by code 2026-08-17).
- `EVAL_*` caps: set only when §6 paid evals are authorized (9.3).
- Package manager (§7): decide npm vs pnpm; do not commit the pnpm lockfiles by accident.

### 9.3 §6 paid-evaluation gate status

(1) PR #5 24h soak — **PASS** (pre-existing). (2) QF-C merged — **DONE** (PR #15).
(3) eval-hardening list implemented — **NOT DONE** (11 items; now buildable against both
report paths since PR #20 landed `conflictModeReport`). (4) hardening covers
`modeReport` + `conflictModeReport` — **NOT DONE** (same work, A14-F1 discipline).
(5) operator authorization of caps + candidate identity — **NOT GIVEN**.
**Paid evals remain BLOCKED. The MAP activation hard lock stays binding regardless.**

### 9.4 Hygiene (recommendation only)

Delete at leisure: the 18 fully-contained legacy remote branches (list in §7 evidence);
local `claude/iran-validation-recovery-20260815` + its `.claude/worktrees` worktree; the
landed strand source branches (ancestors of the parked `7150b49`); the nine
merged-this-session remote PR branches. Carry `docs/designs/HUMAN-ADJUDICATION.md`
(Worktree D reviewed design) from the parked QF integration branch in a future docs PR.
Keep: both integration branches, both final-audit branches, the p0–p7 gate branches (DAG
provenance), until the operator archives the programs.

### 9.5 Standing blockers for the conflict program (recorded, not attempted)

Shadow soak: compound-unit calibration; assessment diagnostics; the Iran keyword rung
(pre-soak code change); source-independence relabel (F-NEW-1); sample-power sizing
(R-M-6). Enablement: the final-audit checklist incl. F-NEW-6 (`FEATURE_AUTH_GATE=true`
everywhere `CONFLICTS_UI` is set) and a decision-log entry.

---

## 10. Post-register authorization update (2026-08-24, same day)

The operator authorized §9.1 (deploy) and the governing-prompts recommendation from §6.
Executed: PR #24 (the three governing prompts, merged `143964a`); production deploy
`dpl_FPYase3HqbCF3d2uW3AnwPHibyt4` of `main` `143964a` from the plain release clone —
READY, aliased, `/health` stamps `143964a`, DB OK, smoke PASS (details in the AGENTS.md
2026-08-24 deploy entry). Rollback target `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`. QF-A
observation window opened. Still open for the operator: §9.2 (env hygiene), §9.3 (paid
evals — unchanged, BLOCKED), §9.4 (hygiene), the §6 business-docs and package-manager
decisions, and the conflict enablement/soak gates.
