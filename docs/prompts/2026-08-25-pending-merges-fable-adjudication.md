# Pending-merge adjudication and release-train execution — BNOW.NET, 2026-08-25

Paste this entire prompt into a **new Claude Code session**. Do not reuse the #86 closeout
session, the Quality-Foundation authoring session, or the conflict-evaluations session.

## Model gate — before any repository action

This work is commissioned for **Claude Fable 5 at xhigh effort**, with the **1M context
option** if available.

1. Print the actual active model, effort, and context setting reported by the harness.
2. Require `claude-fable-5` and `xhigh`. If the UI names its maximum coding effort
   "Ultracode," record both the displayed label and the harness effort field.
3. Do not accept a configured fallback or the session's prior model as proof.
4. If this session runs as Opus, Sonnet, or another model, stop and report
   `model-gate-blocked`.

## Mission

An operator release-train plan governs this backlog. **Stages 1, 2 and 3a of that plan are
already complete**; the remainder is not. Your job is to execute the rest of the train in
order, and to adjudicate the loose items the train does not cover.

The governing rule, from the operator: **treat this as separate release trains. Do not
merge the QF or conflict integration branches wholesale.** Each strand is extracted from
its own base, rebased onto current `main`, re-gated, and shipped as its own PR.

This is not a mandate to merge everything. For each item decide: **land now**, **land after
rebase + re-audit**, **close as superseded**, or **leave parked with a recorded reason**. A
well-argued "close as superseded" is a success.

## 1. Authorization envelope

**Permitted without further approval:**

- Read-only inspection of the repository, GitHub, the production database, Vercel
  metadata, and `bnow.net` HTTP surfaces.
- Creating branches and worktrees; rebasing parked strands onto current `main`.
- Local gates: `npm run typecheck`, `npm run lint`, `npm test`.
- `npm run test:integration` (disposable Neon branch, fork → test → delete).
- Committing, pushing branches, opening PRs, and **merging into `main`** where §5
  authorizes it or your adjudication justifies it in writing.
- Docs: `AGENTS.md`, `docs/CURRENT-STATE.md`, `docs/OPEN-TASKS.md`, `docs/PROGRESS.md`,
  `docs/reviews/*`.

**Requires an explicit operator go-ahead, per stage — prepare it, then ask:**

- **Any production deployment.** The train contemplates a deploy at several stages, but in
  this repo the deploy is consistently a **separate operator action** (see the 2026-08-03
  decision-log entry). Land the merge, prepare the deploy, and request authorization with
  the rollback target named. Do not deploy on your own initiative.

**Forbidden outright without a new operator authorization:**

- Any environment variable, spend cap, or cron schedule change in any Vercel environment.
- **Any model activation.** The **MAP activation hard lock** is binding and stays binding
  even after paid evaluation: only baseline `gpt-4o-mini` / no-effort may dispatch.
- Any execution of `scripts/map-remap.ts`, including `--dry-run` and bounded probes. There
  are **zero `map:remap` rows in `cron_runs`, ever** — keep it that way.
- Any manual cron invocation, digest regeneration, `FORCE_REGEN`, or paid evaluation call.
- Any production database write. Reads only.
- Any new migration, or any edit to an applied one (ruling 5).
- Enabling `CONFLICTS_UI`, or starting a conflict shadow soak.
- Committing `pnpm-lock.yaml` / `pnpm-workspace.yaml` — see §7.

## 2. Ground truth at handoff — verify it, do not trust it

Measured 2026-08-24/25. **Re-derive every figure from the live record before relying on
it**, exactly as the QF-B closeout re-verified its predecessor rather than reading the
prior session's notes. Where reality disagrees with this prompt, reality wins and you say
so in your report.

**Checkouts.** Primary `/Users/go/code/bnow-net` (has uncommitted work — §7). Release/deploy
clone `/Users/go/code/bnow-net-rel-20260823` (a plain clone: use this or another plain clone
for any deploy, because a **worktree ships no commit stamp** — OPEN-TASKS #78). Worktrees
under `/Users/go/code/bnow-net-worktrees/`, plus `.worktrees/` and `.claude/worktrees/`
inside the primary checkout. `git worktree list` is authoritative.

**Refs.** `origin/main` = `33f405b` (Merge PR #11). This moves once PR #12 lands.

**Audited sources — the operator's named lines, all four confirmed present locally:**

| Line | Runtime source | Audit documentation |
|---|---|---|
| Quality Foundation | `7150b49` (`codex/quality-foundation-integration-20260817`) | `858bb9a` (`codex/quality-foundation-final-audit-20260818`) |
| Conflict evaluations | `a2ddca8` (`codex/conflict-evaluations-integration-20260817`) | `da44272` (`codex/conflict-evaluations-final-audit-20260818`) |

**Extraction bases — the most important mechanical fact in this prompt:**

- QF strands fork from the QF base **`05fdd2c`**, and are **not stacked on each other**.
- The conflict program forks from the QF tip **`7150b49`**.

Diffing a strand against `9c5e9cb` (current-ish `main`'s ancestor) is **misleading** — it
sweeps in its siblings' commits. Extract each strand's own delta with
`git rebase --onto origin/main <its base>`, which is exactly what QF-B did.

**Production (not yours to change):** `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`, created
2026-08-23T14:08:53Z, build stamp `0aa3d7d` (PR #10), `/health` 200 with DB OK. Rollback
target `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` / `23a1280` (QF-B release).
`vercel env ls --scope vociferous` → **86 rows / 48 distinct names**; if that has moved,
something changed outside this workflow — stop and report before merging anything.

**Settled state you inherit.** OPEN-TASKS **#86 is CLOSED**. The scalar-safe truncation
repair (`wellFormedSlice` + `dropIsolatedSurrogates` in `src/lib/analysis/map-prompts.ts`)
shipped 2026-08-23; its 24-hour recovery window closed **PASS** — 24 natural cycles,
`batchErrors` **0 of 767 batches** against a 56.8% baseline, lease fences 39→62 strictly +1,
one baseline dispatch identity, the same four extractor versions, no budget stop. A
corpus-wide replay found **0 of 7,292** still-unprocessed eligible documents able to
reproduce it. Map freshness recovered (`map-health` recovery notice 2026-08-24T13:40Z,
`episodeKey` null); backlog 25,857 → 7,292. `openai_map` all-time **$18.28 of the $40
`MAP_SPRINT_USD_CAP`** — escalate above $25 or on any `budgetStopCategory` other than
`run_cap`.

Still open and **not** yours to fix as ride-alongs: **#87** (nested `400 Invalid body`
swallowed with `ok=true`; the legacy digest path is now the largest instance), **#88**
(re-scoped — `digest:intraday` uses a **rolling 24-hour** window keyed on `published_at`,
and at the 2026-08-24T19:30:13Z run the newest document holding any claims was published
2026-08-23T18:55:40Z, ~35 minutes short of the window floor, so all ten fell back to
legacy; only the backlog-versus-recency ordering decision remains), **#97** (the same
UTF-16 slice pattern at sibling sites including the **live paid Ask path**), **#98** (new —
`ingest:telegram` leaving `finished_at IS NULL` rows).

## 3. The governing plan, reconciled against what actually happened

The operator's five-stage plan, with current status re-derived from the merge record:

| Stage | Plan | Status |
|---|---|---|
| 1. Close PR #4 observation | Finalize + merge PR #6, no deploy | **DONE** — PR #6 merged 2026-08-17T07:53Z; window closed **PASS** 2026-08-19 (`codex/candidate-b-production-closeout-20260817`) |
| 2. Routing baseline | Reconcile, retest, merge PR #5, deploy alone, 24h baseline-equivalence soak | **DONE** — PR #5 merged 2026-08-17T06:26Z; reconciliation on `codex/cloud-model-routing-seams-rebased-20260820`; formal 24h soak 2026-08-20T22:00Z → 08-21T22:00Z, `PR5_SOAK_VERDICT=PASS` (recorded in the QF-B release doc §2) |
| 3a. QF-B | Fresh PR from then-current `main`, deploy alone, ≥24h natural map cycles | **DONE** — PR #7 merged (`23a1280`), deployed `dpl_HjaHYtf…`, 24h lease soak **PASS** closed in PR #9; **#77 and #38 closed** |
| 3b. QF-A | Own PR, deploy separately, observe ≥1 full day/digest cycle | **PENDING — your work** |
| 3c. QF-C | Own PR + `ba35082` recency reconciliation; tooling, no standalone soak | **PENDING — your work** |
| 4. Conflict evaluator | Seven reviewed PRs, default-off; one deploy with `CONFLICTS_UI` absent; smoke only | **PENDING — your work** |
| 5. Evaluation hardening | Joint QF/conflict eval hardening; tooling only; paid evals separately authorized | **PENDING — gated, see §6** |

**Unplanned work that landed since the plan was written**, and which you must reason
against rather than around: **PR #10** (the #86 scalar-safe truncation repair, deployed),
**PR #11** (its deployment record), and **PR #12** (its recovery-window closeout, open).

## 4. Hazards

**H1 — a wholesale merge of either integration branch would revert the live #86 fix.**
`codex/quality-foundation-integration-20260817` and
`codex/conflict-evaluations-integration-20260817` each carry their own older
`src/lib/analysis/map-prompts.ts`; verified, **neither contains `dropIsolatedSurrogates`**.
Merging either wholesale would delete a repair that is live in production and has just
passed a 24-hour recovery window, and would collide with the PR #7 lease.
**Properly extracted strands are safe:** from base `05fdd2c`, **neither QF-A nor QF-C
touches `map-prompts.ts`**, and from base `7150b49` the conflict program touches none of
`map-prompts.ts` / `map-worker.ts` / `map-lease.ts` / `openai-provider.ts`. This hazard is
therefore an argument for the extraction method, not against landing the work. After every
rebase, assert explicitly that `dropIsolatedSurrogates` and `wellFormedSlice` survive and
that `map-prompts.test.ts` and `map-request-wellformed.test.ts` still pass.

**H2 — `codex/map-reliability-remap-20260817` is QF-B and is already landed. Do not
re-merge it.** Tip `c40060e` was extracted, rebased, repaired across two independent review
rounds (`11e0754`, `85f364d`) and merged as PR #7 (`23a1280`). `main`'s `map-lease.ts`,
`map-worker.ts` and `scripts/map-remap.ts` differ from the branch because they are
**newer** and carry those remediations; re-merging would regress them. Disposition: **close
as superseded**, confirmed by content comparison, never by ahead-count.

**H3 — PR #3 will clobber current standing documentation.** Its single 2026-08-16 commit
rewrites `AGENTS.md`, `docs/CURRENT-STATE.md`, `docs/OPEN-TASKS.md` and `docs/PROGRESS.md`;
all four have since been corrected in place by PRs #7–#12, including the whole #86 track.
It is **36 commits behind**. It does carry one unique artifact:
`docs/prompts/2026-08-10-local-development-bootstrap.md`, absent from `main`, plus a
`docs/prompts/README.md` change. Per the operator: **preserve the unique prompt/README
additions in a small later docs PR, then close PR #3 as superseded.** Do not merge it.

**H4 — QF-C has a production-runtime touch the plan's summary does not imply.** The plan
describes QF-C as "repository tooling with no production runtime surface," and that is true
of its intent, but its own delta from `05fdd2c` includes `src/lib/analysis/map-worker.ts`
and `src/lib/validation/llm-match.ts` alongside `src/lib/evals/*` and
`scripts/analysis-eval.ts`. `map-worker.ts` is precisely the file PR #7 rewrote for the
lease. Expect a real conflict there, resolve it in favour of the merged lease semantics,
and re-verify the lease pins. If after rebase QF-C still carries a runtime behaviour
change, say so and reconsider whether it can skip a soak.

**H5 — `ba35082` lives on the conflict branches, not on QF-C.** It is
`evals: swap recency probe to the canonical calculator; re-pin fixtures to
linear-interpolation percentiles`. The plan requires QF-C to land **with** it, so it must
be cherry-picked across from the conflict line onto the QF-C PR. Record that as a
deliberate cross-line carry.

**H6 — the QF integration tip is documented as immutable.** The 2026-08-21 decision-log
entry records `7150b49` as the immutable QF integration target and states A, C, D and the
conflict program stay unmerged. That was deliberate staging. The operator's plan now
supersedes it for A and C; record that supersession as a new dated decision rather than
letting the two documents silently disagree. Also per the operator: **do not merge
`858bb9a` wholesale — carry its documentation commits onto the new main-based PR series.**

## 5. The work, in order

### 5.0 — PR #12 first

Docs-only, 1 commit, 5 files (+530/−48). Gates recorded on the exact tree: typecheck clean,
lint 0/0, unit **2,340/2,340** (177 files), pre-push green. It closes #86 and re-scopes #88,
so every later adjudication should reason against the corrected register.

Review it adversarially, do not rubber-stamp. Check specifically: the §14b restatement of
the `llmRequests === batches` criterion to
`llmRequests === batches + 2 × truncationSplits` (22 of 24 cycles held the flat form; the
two exceptions are the untouched `finish_reason === "length"` split path); the §14c
`alreadyMapped` 139 → 0 resolution; and the §14d corpus-wide scan. The report deliberately
records a mid-work correction — a first read of #88 assumed a day window when
`digest:intraday` uses a rolling one — so confirm the corrected version is what survived
into **all five** documents. Then merge.

### 5.1 — Cheap disposals

Shrink the hazard surface before the big strands:

- `codex/map-reliability-remap-20260817` — close as superseded after the H2 content check.
- `codex/cloud-model-routing-seams-rebased-20260820` — **0 ahead** of `main`; fully
  contained. Delete.
- `pr5-audited-head-0e469f7` — an audit snapshot pointer (`0e469f7`), not a feature branch.
- `codex/preserve-pre-reconcile-docs-20260816` — 1 docs commit, 47 behind.
- **PR #3** — salvage the bootstrap prompt + README change onto a small docs PR, then close
  as superseded (H3).

### 5.2 — QF-A: evidence recency and funnel

Branch `codex/evidence-quality-observability-20260817`. Own delta from `05fdd2c`: **6
commits**, `src/lib/analysis/evidence-recency.ts`, `quality-funnel.ts`, `digest.ts`,
`digest-persist.ts`, `synthesize.ts`, `scripts/quality-funnel-report.ts`, plus tests and
`src/integration/reduce.itest.ts`. No `drizzle/` change.

Method: `git rebase --onto origin/main 05fdd2c` in a fresh worktree; conflict ledger;
`git range-diff` proving commit-for-commit fidelity; re-run every gate on the **rebased**
tree; reopen and repair any audit findings still outstanding against QF-A from `858bb9a`;
ship as its own PR with a release record.

`digest.ts` / `digest-persist.ts` / `synthesize.ts` are publication-safety and
thin-regeneration territory — ruling 17 (the shared persist guard refuses empty and thin
overwrites), ruling 18 (K=5 + majority-gid fill) and ruling 19 (publication guard) all bind.
Verify additive structured statistics, no digest regressions, and honest funnel
reconciliation.

Then: land, prepare a **separate** deploy, request authorization, and observe **at least one
complete day/digest cycle**.

### 5.3 — QF-C: evaluation control plane

Branch `codex/analysis-eval-control-plane-20260817`. Own delta from `05fdd2c`: **17
commits**, `src/lib/evals/*` (contracts, gates, runner, live-runner, eval-guard, score-map,
score-reduce, score-validation, isolation, evidence-recency-summary),
`scripts/analysis-eval.ts`, `scripts/model-routing-inspect.ts`, plus `map-worker.ts` and
`llm-match.ts` (H4).

Land after QF-A is clean, **with `ba35082` carried across** (H5). Per the plan it is
tooling and needs no standalone production soak — but only if H4 resolves to no runtime
behaviour change. `eval-guard.ts` is spend-adjacent: confirm it cannot dispatch a paid call
by default and that ruling 4's fail-closed cap discipline is intact.

### 5.4 — Conflict evaluator: seven reviewed PRs, default-off

Audited runtime `a2ddca8`, audit documentation `da44272`, base `7150b49`. Own delta: **106
commits, 101 src/scripts files**, cleanly additive — `src/app/conflicts`,
`src/components/conflicts`, `src/lib/conflicts`, `src/lib/evals`,
`src/integration/conflict-feature-off.itest.ts`, `src/integration/conflict-reference-repo.itest.ts`,
`src/integration/sql`, and an edit to `src/integration/authz-page-gate.itest.ts`. It touches
**none** of the map/provider files (H1 does not reach it). No `drizzle/` change.

Apply the audited seven-PR decomposition, in order. The per-gate branches
`codex/conflict-evaluations-p0-contract` … `p7-integration` carry the recorded verdicts:

1. Conflict domain and contract
2. Reference reports, editions, and windows
3. Evidence union
4. Combined scorer and goldens
5. Eval-plane conflict profile
6. Feature-off product UX
7. Backtest, soak design, audit reports, registers, and reviewer evidence

Binding rules from the operator:

- **PR 5 (the conflict eval profile) must rebase against the final QF
  `scripts/analysis-eval.ts`** — i.e. after 5.3 lands. This is the one hard ordering
  dependency between the two lines.
- Resolve documentation conflicts **chronologically**; never rewrite append-only history.
- Prove equivalence to the audited trees with `range-diff`, file hashes, and targeted tests.
- Run **full combined gates after all seven land**, not per-PR only.
- `src/app/conflicts` adds gated routes: **ruling 21** binds — the gate is the **first
  statement** of each page, before any data access, and each new route needs a row in
  `src/integration/authz-page-gate.itest.ts`'s ROUTES table. The branch already edits that
  file; verify the rows are actually there and that the itest passes.
- Deploy **once**, with `CONFLICTS_UI` **absent**, `FEATURE_AUTH_GATE=true`.
- Run feature-off / body-leak smoke tests. **Smoke only — no conflict shadow soak, do not
  enable the UI.**

The conflict work is dormant-merge-safe. Its real shadow soak stays blocked on
compound-unit calibration, assessment diagnostics, Iran keyword handling,
source-independence semantics, and sample-power sizing — record those as the standing
blockers, do not attempt them.

### 5.5 — Explicitly outside this release train

**`claude/local-model-ask-eval-20260817` stays out.** The audits identified a conceptual
collision between its Ask-specific CLI and the repository-owned QF control plane. Reconcile
that **separately**; do not let it be carried into any of these PRs. (Its own binding notes
also stand: local model ids stay OUT of `PRICES_PER_MTOK`, `ASK_ANSWER_MODEL` remains
`gpt-5` in every Vercel env, and no local model may be promoted without its own paid
scorecard.) `claude/business-planning-20260817` (1 docs commit) may be dispositioned
separately as ordinary docs.

## 6. Paid model evaluations — gated, not yours to start

Begin only after **all five** hold: (1) PR #5's 24-hour baseline soak passes — **already
PASS**; (2) QF-C is merged; (3) the QF eval-hardening list is implemented; (4) that
hardening covers both `modeReport` and conflict `conflictModeReport`; (5) evaluation caps
and candidate identity are **explicitly authorized** by the operator. Production model
activation remains a later decision, and **map stays hard-locked even after paid
evaluation**.

## 7. Uncommitted work in the primary checkout — adjudicate, do not sweep

- **Modified:** `docs/PARTNER-STRATEGY.md`.
- **Untracked, substantive:** `docs/GO-NO-GO-REGISTER-2026-08-23.md` (235 lines — a
  consolidated index of every human go/no-go decision point, including the launch,
  rights, quality and spend gates), `docs/OUTREACH-ROSTER-2026-08-23.md` (430 lines), and
  **13 prompt documents** under `docs/prompts/` dated 2026-08-17/18 — including the
  governing prompts for the very programs you are landing. Currently protected by nothing
  but the filesystem.
- **Untracked, do NOT commit:** `pnpm-lock.yaml` (7,171 lines) and `pnpm-workspace.yaml`.
  The repo is npm-tracked (`package-lock.json` is committed; `CLAUDE.md` says
  `npm install`). This is package-manager drift — flag it as an operator decision, do not
  resolve it by committing either lockfile.
- **Untracked, ignore:** `.claude/`, `.pnpm-store/`, `.worktrees/`.

Recommend, do not unilaterally execute, whether the docs and prompts should be committed
and on what branch.

## 8. Invariants that bind you

From `AGENTS.md` § Standing rulings. A merge that breaks one is a failed merge.

- **Ruling 5 — migrations:** never edit or delete an applied migration; evolve forward.
  `drizzle/9999_claim_source_trigger.sql` re-asserts without DROP and always applies last.
  **No strand in this backlog touches `drizzle/` — re-confirm, and keep it that way.**
- **Ruling 21 — authorization lives in the PAGE, not only the layout.** First statement,
  before any data access; new gated routes need ROUTES-table rows. Critical for 5.4.
- **Ruling 13 — extractor versioning.** Consumers filter through `map-versions.ts`. A
  version bump needs its own remap path (#33) and is not authorized. The four live versions
  are pinned as literal strings by test: `gpt-4o-mini:d73cc83ed8df`, `:75e0ff6403db`,
  `:15a6078371bd`, `:19c06260f149`.
- **Ruling 18 — mapreduce ships only its A/B-validated configuration** (K=5 votes,
  majority-gid fill). Do not lower `REDUCE_VOTES` or remove the fill.
- **Rulings 1–4, 17, 19, 20** — no ISW prose or source full text in user-facing output;
  every claim keeps ≥1 raw_document link; stub data never renders as fact; fail-closed
  spend caps; the shared persist guard refuses empty and thin overwrites; publication
  safety; named-person source fidelity.
- **Documentation discipline:** the decision log is **append-only**; every other standing
  section is **corrected in place** the moment it becomes wrong, with a log entry noting
  the correction. Never leave wrong standing text with the fix buried in a log entry.
- **Commit hygiene:** `area: imperative summary`, small and atomic, `main` always builds.
  **No vendor branding anywhere** — no `Co-Authored-By`, no "Generated with", no model or
  vendor names in commits, PRs, code comments, or file contents.
- The enforced pre-push hook runs typecheck + lint + test. Do not bypass it.

## 9. Deliverables

1. **`docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md`** — the register: every item,
   its verified facts, disposition, evidence, and for anything not landed the explicit
   reason and what would unblock it.
2. **One PR per landed strand**, each with its own release record, conflict ledger,
   `range-diff` fidelity proof, and a gate table measured on the exact reviewed tree.
3. **`AGENTS.md`** — standing sections corrected in place, plus dated decision-log entries
   recording what landed, what was closed as superseded, what stays parked and why, and
   the H6 supersession of the immutability posture.
4. **`docs/OPEN-TASKS.md`** — debt each landed strand introduces or closes.
5. An **operator action list**: which deploys now need authorization (with rollback targets
   named), what needs an env/cap decision, the §6 paid-evaluation gate status, and the
   package-manager question from §7.

## 10. Non-goals

Do not deploy without a per-stage go-ahead. Do not activate a model. Do not run a remap,
even dry. Do not invoke a cron, regenerate a digest, or make a paid evaluation call. Do not
change an env var, spend cap, or schedule. Do not write to the production database. Do not
enable `CONFLICTS_UI` or start a conflict shadow soak. Do not fix #87, #88, #89, #90, #91,
#97 or #98 as ride-alongs — each wants its own before/after measurement. Do not implement QF
Worktree D (design only). Do not carry `claude/local-model-ask-eval-20260817` into any of
these PRs.

## 11. Reporting discipline

Record what you measured, not what you expected. If a gate fails, say so with the output.
If a strand turns out to be unsafe to land, say that plainly and leave it parked — four of
these strands were parked on purpose, and the backlog existing is not itself a defect. If
you find that this prompt is wrong about any fact in §2–§4, correct it in your report and
proceed on the evidence.

---

## Addendum — execution-session additions (2026-08-25, adopted before work began)

Ground truth §2 was re-derived in full before these additions: `origin/main` = `33f405b`;
PR #12 open / #3 open / #1–#11 merged as stated; all named commits present; H1 verified
(`dropIsolatedSurrogates` absent from both integration branches, present on `main`); H2
verified (rebased routing branch 0 ahead / 24 behind); QF-A 6 commits, QF-C 17 commits
incl. `map-worker.ts` + `llm-match.ts`, conflict line 106 commits / 101 files touching no
map/provider file, none touching `drizzle/`; production `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`
healthy; Vercel env exactly 86 rows / 48 distinct names. No drift found.

The following steps are ADDED to the plan and bind this execution:

**A1 — Per-strand adversarial review of the REBASED tree, before each PR opens.**
`range-diff` proves fidelity to the audited tree; it does not prove the audited logic is
still correct against a `main` that has since absorbed PR #5 (routing seams), PR #7 (map
lease), and PR #10 (scalar-safe truncation). The 858bb9a / da44272 audits reviewed the
strands on their original bases, so every rebase creates unaudited interaction surface.
For QF-A, QF-C, and each conflict PR whose rebase resolved a non-trivial conflict: run a
multi-agent adversarial review (correctness + invariant lenses: rulings 4, 13, 17, 18, 19,
21; secret leakage; spend-guard discipline) over the rebased delta, adversarially verify
each finding, and record confirmed findings + dispositions in the strand's release record.

**A2 — Scripted H1 assertion as a recorded gate row.** After every rebase and before every
merge: `git grep -c dropIsolatedSurrogates -- src/lib/analysis/map-prompts.ts` (must be >0)
plus `npx vitest run src/lib/analysis/map-prompts.test.ts src/lib/analysis/map-request-wellformed.test.ts`
(must pass) on the candidate tree. Recorded per strand in its gate table with the tree SHA.

**A3 — Post-merge verification of `main`.** Merge locally and push so the enforced pre-push
hook (typecheck + lint + test) runs against the exact merged tree; keep the established
`Merge PR #N: <title>` merge-commit convention. If a merge is ever performed via the GitHub
UI/API instead, re-run the full local gates on fetched `main` immediately after.

**A4 — Vendor-branding scan before every push.** On the outgoing commit range and every PR
body: scan for `Co-Authored-By`, `Generated with`, and authoring-model/vendor names. (Model
id strings that are product configuration, e.g. `gpt-4o-mini` extractor versions, are data,
not branding, and stay.)

**A5 — Secret scan on any newly committed docs.** PR #3 salvage and any §7 docs the
operator later approves: scan for credential patterns (key prefixes, DSNs, tokens, session
strings) before commit.

**A6 — PR #12 numeric claims verified against the live record, not the report.** Read-only
DB checks of the closeout's key figures (batch/error counts, lease fence progression,
alreadyMapped resolution, backlog level) before merging, plus re-running the unit gate on
the exact PR tree.

**A7 — Completeness critic over the final register.** Enumerate every local branch, remote
branch, open/closed PR, and worktree; the adjudication register must carry a disposition
row for each (including the closeout/docs branches of already-merged PRs and the p0–p7
conflict branches). A final independent critic pass asks what is missing before the
register is committed.

**A8 — Evidence artifacts are committed, not ephemeral.** Each strand PR's release record
carries its conflict ledger, `range-diff` output (or a committed pointer to it), gate table
with tree SHAs, and the A1 review verdict.

**A9 — QF-C soak decision is escalated, not self-decided, if runtime behavior changes.**
If after rebase the QF-C delta still changes runtime behavior in `map-worker.ts` /
`llm-match.ts` beyond dispatch-neutral instrumentation, the "no standalone soak" plan line
is void: present the operator a soak recommendation with the merge held or landed-undeployed,
per their choice. (H4 anticipated this; A9 makes the escalation mandatory.)

**A10 — Primary-checkout isolation.** The primary checkout stays on
`claude/local-model-ask-eval-20260817` with its §7 uncommitted files untouched. All strand
work happens in fresh worktrees (`bnow-net-worktrees/rebase-*`); no commits are authored
from the primary checkout except this plan file's own addendum if the operator later
directs the §7 commit.
