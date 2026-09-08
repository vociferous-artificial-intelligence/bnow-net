# bnow-net — preserve unpushed work, land two stale branches, remove 31 worktrees (2026-09-05)

Recommended runner: Claude Code with Opus, reasoning effort medium, one session end to end
(Phase 2's cherry-pick resolution is the only judgment-heavy step; the rule there is spelled out).
Sonnet is acceptable for Phases 0, 1, 3, 4, 5, 6. Fable is not needed for any phase.

Run this in Claude Code from the main checkout: `cd /Users/go/code/bnow-net`. Every path below is
absolute. This is a git-hygiene task on a repo with a strict operating culture (read `AGENTS.md`
"Standing rulings" and "Operating protocol" on `origin/main` before starting — the copy in the
working tree is a month stale until Phase 4). It is docs-only from the repo's point of view: no
source, scorer, fixture, prompt, dataset, deploy, database, or paid-provider change is authorized.

## What is true right now (audited 2026-09-05 12:00–13:00 ET; verify, don't assume)

- Remote: `git@github.com:vociferous-artificial-intelligence/bnow-net.git`. Last fetch
  2026-09-04 18:02 ET; `origin/main` = `883e5e3` ("Merge PR #46"). The handoff written at 00:2x
  on the 5th confirms no later commit existed then.
- Main checkout `/Users/go/code/bnow-net` is on `claude/local-model-ask-eval-20260817` @ `8a0ca89`,
  1 ahead / 176 behind `origin/main`. Local `main` is `9c5e9cb`, 0 ahead / 176 behind (fast-forwardable).
- 31 registered worktrees (`git worktree list`), 2 standalone clones, 5 artifact folders. Full lists
  in Phases 1 and 3. All 31 worktrees have zero modified tracked files. Only three worktrees have
  untracked files (listed in Phase 1). Both clones are clean.
- 16 local branches exist on no remote ref (Phase 1 list). 14 of them carry history whose files
  already landed on `origin/main` via rebased PRs. Two carry content that exists nowhere else:
  `claude/business-planning-20260817` (`dbd9572`) and `claude/local-model-ask-eval-20260817` (`8a0ca89`).
- Two stale zero-byte lock files exist from an earlier read-only audit run through a folder mount:
  `/Users/go/code/bnow-net/.git/index.lock` and
  `/Users/go/code/bnow-net/.git/worktrees/87-digest-unicode-20260827/index.lock`.
- `.githooks/pre-push` runs `tsc --noEmit`, `eslint`, `vitest run` against the CURRENT working tree
  on every push. GitHub CI runs only on pushes to `main` and on pull requests.
- The project uses npm (`package-lock.json` tracked). `pnpm-lock.yaml`, `pnpm-workspace.yaml` and
  `.pnpm-store/` in the main checkout are strays.

## Hard rules for this task

1. Never `git push --force`, never delete or rename a remote branch, never `git branch -D`, never
   `git worktree remove --force`, never `git reset --hard`, never `git clean` outside the exact
   paths named in Phase 3. If a step refuses, stop and report — do not escalate to a forcing flag.
2. Never print, echo, cat, or diff the contents of any `.env*` file. Only variable names, byte
   counts, and hashes may appear in output. Never commit any `.env*` file.
3. Do not touch (read-only, verify only): `/Users/go/code/bnow-net-rel-20260823` (the release clone
   deploys come from), and the five artifact folders `bnow-net-audit-evidence-20260818`,
   `bnow-net-eval-campaign-20260903-artifacts`, `bnow-net-eval-corpus-v2-draft-20260827` (+ its
   `.MANIFEST.sha256` sibling), `bnow-net-eval-corpus-v2-review-20260903`,
   `bnow-net-eval-successor-1a-20260904-artifacts`. Phase 3 adds three small files to one
   `reports/` subfolder of the campaign artifacts; nothing else in those folders changes.
4. Do not run `npx tsx .cache/eval-scratch/build-packet.ts` or anything that regenerates
   `packet/` in the successor artifacts (the row-id salt regenerates and orphans labels).
5. No deploys (`vercel`), no Neon operations, no scripts that call a paid provider, no `npm run`
   other than `ci`, `lint`, `test`, `typecheck`.
6. Open PRs; do not merge them unless the operator has written "merge authorized" in this session.
7. When anything differs from "What is true right now" in a way that changes the plan (a worktree
   shows uncommitted changes not listed here; `origin/main` has moved and a listed branch is no
   longer an ancestor; a cherry-pick conflicts in a file not covered by the Phase 2 rule), stop,
   show the discrepancy, and wait.

## Phase 0 — Preflight (read-only except the two lock files)

1. `rm /Users/go/code/bnow-net/.git/index.lock /Users/go/code/bnow-net/.git/worktrees/87-digest-unicode-20260827/index.lock`
   — only if each is 0 bytes (`stat -f %z`). If either is non-zero, stop: a git process may be running.
2. `git fetch origin --prune`. Record the new `origin/main` sha. If it is not `883e5e3`, list the
   new commits (`git log --oneline 883e5e3..origin/main`) and re-run the ancestry checks in step 4
   before continuing.
3. `git status --porcelain` in the main checkout must show exactly: ` M docs/PARTNER-STRATEGY.md`
   plus untracked `.pnpm-store/`, `.worktrees/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
   `docs/GO-NO-GO-REGISTER-2026-08-23.md`, `docs/OUTREACH-ROSTER-2026-08-23.md`, sixteen
   `docs/prompts/2026-08-*.md` files, and this prompt file
   `docs/prompts/2026-09-05-worktree-cleanup-and-preserve.md` if it has been saved there.
   Anything else → rule 7.
   Of the sixteen prompt docs, FIVE already exist on `origin/main` and are byte-identical to it
   (verified 2026-09-05): `2026-08-17-conflict-region-combined-evaluations.md`,
   `2026-08-17-quality-foundation-fable-ultracode.md`, `2026-08-18-conflict-evaluations-fable-final-audit.md`,
   `2026-08-18-quality-foundation-fable-final-audit.md`, `2026-08-25-pending-merges-fable-adjudication.md`.
   Re-verify each with `git show origin/main:<path> | cmp -s - <path>` and, if identical, delete the
   local copy (`rm <path>`) — otherwise `git switch` in Phase 1 refuses ("untracked working tree
   files would be overwritten"). If any differs, stop (rule 7). The ELEVEN that exist nowhere else
   are `2026-08-17-roadmap-00-INDEX.md` … `2026-08-17-roadmap-09-hygiene-batch.md` (10) and
   `2026-08-17-local-model-ask-eval.md`.
4. For every branch in the Phase 1 push list, confirm `git branch -r --contains <branch>` is empty
   (still unpushed) and record `git rev-parse --short <branch>`. For every worktree in the Phase 3
   list whose branch is claimed merged, confirm `git merge-base --is-ancestor <sha> origin/main`.
5. Confirm `gh auth status` works. If `gh` is missing, install it (`brew install gh`) or plan to
   open PRs via the compare URLs GitHub prints on push.
6. Record disk baseline: `du -sh /Users/go/code/bnow-net* 2>/dev/null | sort -h | tail -40` and
   `du -shc /Users/go/code/bnow-net* | tail -1`.

## Phase 1 — Preserve: push the 16 unpushed branches, commit the main checkout's untracked docs

1. Push the 16 branches as ordinary branches, bypassing only the LOCAL hook (these are archival
   pushes, not PR pushes; the hook would run tests against the wrong working tree):
   `git push --no-verify origin <branch>` for each of:
   `claude/business-planning-20260817`, `claude/local-model-ask-eval-20260817`,
   `codex/analysis-eval-control-plane-20260817`, `codex/evidence-quality-observability-20260817`,
   `codex/conflict-evaluations-integration-20260817`, `codex/conflict-evaluations-final-audit-20260818`,
   `codex/conflict-evaluations-p0-contract`, `codex/conflict-evaluations-p1-domain`,
   `codex/conflict-evaluations-p2-reference`, `codex/conflict-evaluations-p3-evidence`,
   `codex/conflict-evaluations-p4-scoring`, `codex/conflict-evaluations-p5-adapter`,
   `codex/conflict-evaluations-p6-product`, `codex/conflict-evaluations-p7-integration`,
   `codex/quality-foundation-integration-20260817`, `codex/quality-foundation-final-audit-20260818`.
   Afterwards `git branch -r --contains <branch>` must be non-empty for all 16. GitHub CI will not
   run (it triggers only on `main` pushes and PRs).
2. Preserve the main checkout's uncommitted work on a new branch off `origin/main`:
   - `git diff -- docs/PARTNER-STRATEGY.md > /tmp/partner-strategy-20260905.patch` (31 added lines).
   - `git checkout -- docs/PARTNER-STRATEGY.md` (the working copy is now clean of tracked changes).
   - `git switch -c docs/operator-notes-20260905 origin/main`. Untracked files travel with the
     switch. (`PARTNER-STRATEGY.md` is byte-identical between `8a0ca89` and `origin/main`, so:)
   - `git apply --check /tmp/partner-strategy-20260905.patch && git apply /tmp/partner-strategy-20260905.patch`.
   - Copy the two orphan scratch scripts in as text so lint/tsc never see them:
     `mkdir -p docs/reviews/scratch-scripts` then copy
     `/Users/go/code/bnow-net-worktrees/87-digest-unicode-20260827/scripts/_measure-87-baseline.ts`
     → `docs/reviews/scratch-scripts/_measure-87-baseline.ts.txt` and
     `/Users/go/code/bnow-net-worktrees/97-reduce-wellformed-20260827/scripts/_measure-97-baseline.ts`
     → `docs/reviews/scratch-scripts/_measure-97-baseline.ts.txt`, with a three-line `README.md`
     saying where they came from and that they are untested one-off measurement scripts.
   - Stage ONLY: `docs/PARTNER-STRATEGY.md`, `docs/GO-NO-GO-REGISTER-2026-08-23.md`,
     `docs/OUTREACH-ROSTER-2026-08-23.md`, the eleven unique `docs/prompts/2026-08-17-*.md`,
     `docs/prompts/2026-09-05-worktree-cleanup-and-preserve.md` (this file, if present),
     `docs/reviews/scratch-scripts/*`. Do NOT stage `pnpm-*`, `.pnpm-store/`, `.worktrees/`, or
     any `.env*`. `git status --porcelain` after staging must show no `??` entries other than
     those four strays.
   - Before committing, scan `docs/OUTREACH-ROSTER-2026-08-23.md` and
     `docs/GO-NO-GO-REGISTER-2026-08-23.md` for personal phone numbers or personal (non-work) email
     addresses. Do not remove anything; just note in the eventual PR body whether such details are
     present so the operator can decide whether the roster belongs in the repo.
   - Commit: `docs: preserve operator notes, 2026-08 roadmap prompts, and orphan scratch scripts`.
   - Do not push yet (Phase 5 adds the cleanup record to this branch first).
3. Sanity: `git log --oneline -1`, `git status --porcelain` (only the four strays remain).

## Phase 2 — Land the two branches whose content exists nowhere else

Both commits are from 2026-08-17 against a tree that is now 176 commits older. Rule: **new files
land verbatim; for any file the branch MODIFIED that `origin/main` has ALSO changed since the
merge-base, `origin/main` wins entirely** (the branch is pushed, so its version is preserved and
linkable). Files the branch modified that `origin/main` has NOT touched since the merge-base take
the branch's edit.

1. `git switch -c docs/land-aug17-branches-20260905 origin/main`.
2. For `claude/business-planning-20260817` (`dbd9572`):
   - `MB=$(git merge-base origin/main claude/business-planning-20260817)`.
   - List `ADDED=$(git diff --diff-filter=A --name-only $MB dbd9572)` (expect exactly
     `docs/reviews/BUSINESS-DOCS-RECONCILIATION-2026-08-17.md`) and
     `MODIFIED=$(git diff --diff-filter=M --name-only $MB dbd9572)` (expect 11 files incl.
     `docs/STATUS-REPORT.md`).
   - `git cherry-pick -n dbd9572` (no commit). If it reports conflicts, that is expected for
     files in MODIFIED that main changed; continue with the rule.
   - For each file in MODIFIED: if `git diff --quiet $MB origin/main -- <file>` exits non-zero
     (main changed it), run `git checkout origin/main -- <file>`; otherwise keep the cherry-picked
     result. Record which files took the branch edit and which took main's version.
   - Every file in ADDED must now be present and byte-identical to `git show dbd9572:<file>`.
   - `git status` must show no unmerged paths; then
     `git commit -m "docs: land 2026-08-17 business-planning reconciliation (new files verbatim; main wins on shared docs)"`.
     If git still reports a cherry-pick in progress after the commit (`CHERRY_PICK_HEAD` exists),
     `git cherry-pick --quit` clears the state without touching the commit.
3. For `claude/local-model-ask-eval-20260817` (`8a0ca89`):
   - Same procedure. Expect ADDED = 21 files under `docs/designs/LOCAL-MODEL-ASK-EVAL-2026-08-17.md`,
     `docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md`, `docs/evals/ask-local-fixtures.json`,
     `docs/evals/raw-captures-2026-08-17/*.jsonl` (9), `docs/evals/results-v2-k60+gemma-*.json` (6),
     and MODIFIED containing `AGENTS.md` and `docs/PROGRESS.md` (both changed on main → main wins).
   - Do NOT replay the branch's `AGENTS.md`/`PROGRESS.md` edits. Instead append ONE decision-log
     bullet to `AGENTS.md`. Placement: although the file has a `## Decision log (append-only,
     dated)` section (line ~495), the twenty most recent bullets (2026-08-21 → 2026-09-04) sit at
     the very END of the file, after the `## Operating protocol` list. Match current practice:
     append your bullet after the last existing dated bullet at the end of the file, in the
     existing style (`- **2026-09-05 (…):** …`). Do not relocate existing entries. State: the 2026-08-17 local-model Ask
     evaluation artifacts (branch `claude/local-model-ask-eval-20260817`, commit `8a0ca89`) are
     landed verbatim under `docs/designs/` and `docs/evals/`; the commit's `AGENTS.md`/`PROGRESS.md`
     edits were not replayed because of 176 commits of drift and are viewable on the pushed branch;
     then one sentence with the scorecard's headline conclusion, quoted or paraphrased from
     `docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md` (read it; do not invent a result).
   - Verify the six `results-v2-k60+gemma-*.json` and nine `.jsonl` files contain no credentials
     (grep for `sk-`, `postgres://`, `npg_`, `Bearer `). If any hit, stop (rule 7).
   - `git commit -m "docs: land 2026-08-17 local-model Ask eval artifacts; record in decision log"`.
4. `npm ci` (node_modules currently matches the Aug-17 lockfile), then `npm run typecheck && npm run lint && npm test`
   must pass before pushing (docs-only branch; the suite is ~3,600 tests and should be green).
5. `git push -u origin docs/land-aug17-branches-20260905` (hook runs; let it).
6. Open a PR to `main` titled `docs: land two preserved 2026-08-17 branches (business-planning, local-model Ask eval)`.
   Body must include: the rule used; per file, whether the branch edit or main's version was kept;
   links to both pushed source branches; the statement that no code, scorer, fixture, dataset, or
   prompt changed. Do not merge (rule 6).

## Phase 3 — Remove the 31 worktrees, the stale clone, and the strays

Before removing anything, two preservation steps for the frozen campaign worktree:

1. Copy scratch tooling that exists nowhere else:
   `mkdir -p /Users/go/code/bnow-net-eval-campaign-20260903-artifacts/reports/scratch-scripts` and
   copy `eval-env.ts`, `ledger.ts`, `verify-cell.sh` from
   `/Users/go/code/bnow-net-worktrees/eval-campaign-20260903/.cache/eval-scratch/` into it. Verify
   with `cmp`. (They contain no secrets — the audit grepped them — but re-grep before copying.)
2. Carry the eval OpenAI key forward WITHOUT displaying it:
   `grep -q '^OPENAI_API_KEY=' /Users/go/code/bnow-net/.env.local || grep '^OPENAI_API_KEY=' /Users/go/code/bnow-net-worktrees/eval-campaign-20260903/.env.local >> /Users/go/code/bnow-net/.env.local`
   then confirm with `grep -c '^OPENAI_API_KEY=' /Users/go/code/bnow-net/.env.local` (must print 1).
   The campaign worktree's `.env.local` is the only local copy of that key.
3. Confirm the gitignored live results are already preserved (byte-compare; do not copy over):
   - `eval-successor-1a-20260904/docs/evals/analysis/results/live-{map,digest}-v2-gpt-4o-mini.json`
     and `live-validation-v2-gpt-4o-mini+votes5.json` vs
     `/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/backups/20260905T002223Z-final-closeout/results/`;
   - `eval-campaign-20260903/docs/evals/analysis/results/live-{map,validation,digest}-v2-gpt-4o-mini.json` vs
     `/Users/go/code/bnow-net-eval-campaign-20260903-artifacts/backups/20260904T135208Z-B3-digest-complete-PAUSED/`.
   All six must be identical. If any differs, stop (rule 7).

Then remove, from the main checkout, with plain `git worktree remove <path>` (no `--force`; it
refuses if a tree is dirty, which is the safety net):

```
/Users/go/code/bnow-net-97util-20260831
/Users/go/code/bnow-net-docs-closeout-20260901
/Users/go/code/bnow-net-incident-dedup-20260831
/Users/go/code/bnow-net-incident-watch-20260831
/Users/go/code/bnow-net-watch-hotfix
/Users/go/code/bnow-net-worktrees/87-digest-unicode-20260827        (has untracked scripts/_measure-87-baseline.ts — preserved in Phase 1; remove will refuse until you delete that one file first)
/Users/go/code/bnow-net-worktrees/87b-nested-errors-20260827
/Users/go/code/bnow-net-worktrees/97-ask-docs-20260829
/Users/go/code/bnow-net-worktrees/97-ask-wellformed-20260828
/Users/go/code/bnow-net-worktrees/97-reduce-wellformed-20260827     (same: scripts/_measure-97-baseline.ts, preserved in Phase 1)
/Users/go/code/bnow-net-worktrees/98-hung-sweep-20260827
/Users/go/code/bnow-net-worktrees/analysis-eval-control-plane-20260817
/Users/go/code/bnow-net-worktrees/conflict-evaluations-20260817
/Users/go/code/bnow-net-worktrees/conflict-evaluations-final-audit-20260818
/Users/go/code/bnow-net-worktrees/conflict-instruments-20260827
/Users/go/code/bnow-net-worktrees/corpus-v2-20260903
/Users/go/code/bnow-net-worktrees/docs-closeout-20260828
/Users/go/code/bnow-net-worktrees/eval-campaign-20260903             (only after steps 1–3 above)
/Users/go/code/bnow-net-worktrees/eval-capture-20260904
/Users/go/code/bnow-net-worktrees/eval-successor-1a-20260904         (only after step 3 above)
/Users/go/code/bnow-net-worktrees/eval-validation-parity-20260904
/Users/go/code/bnow-net-worktrees/evidence-quality-observability-20260817
/Users/go/code/bnow-net-worktrees/neon-cron-cluster-20260816
/Users/go/code/bnow-net-worktrees/qf-a-88-closeout-20260827
/Users/go/code/bnow-net-worktrees/qf-b-map-lease-remap-20260821
/Users/go/code/bnow-net-worktrees/qf-c-hardening-20260827
/Users/go/code/bnow-net-worktrees/qf-capacity-harness-20260827
/Users/go/code/bnow-net-worktrees/quality-foundation-final-audit-20260818
/Users/go/code/bnow-net-worktrees/quality-foundation-integration-20260817
/Users/go/code/bnow-net/.claude/worktrees/iran-validation-recovery
/Users/go/code/bnow-net/.worktrees/business-planning-20260817        (only after Phase 1 step 1 pushed its branch)
```

Gitignored files inside these trees (`node_modules/`, `.env.local` copies, `.next/`, `.cache/`,
empty `docs/evals/analysis/capture/`) go with them; `git worktree remove` handles ignored files
without `--force`. The `.env.local` copies are all duplicates of the main checkout's or the release
clone's (verified by hash) except the campaign one handled in step 2.

Then: `git worktree prune`; `git worktree list` must show only `/Users/go/code/bnow-net`.
`rmdir /Users/go/code/bnow-net-worktrees /Users/go/code/bnow-net/.worktrees` (both must be empty;
if not, stop and list contents). Leave `.claude/` alone apart from the removed worktree.

Remove the stale deploy clone: `rm -rf /Users/go/code/bnow-net-deploy-20260823` — it is a clean
clone of `main` @ `0aa3d7d` (145 commits behind), and its `.env.local` holds only a short-lived
`VERCEL_OIDC_TOKEN`. Confirm `git -C /Users/go/code/bnow-net-deploy-20260823 status --porcelain` is
empty and `git -C … rev-list --count origin/main..HEAD` is 0 immediately before deleting.

Remove the npm/pnpm strays from the main checkout: `.pnpm-store/`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml` (confirm `package-lock.json` is tracked and `package.json` has no
`"packageManager": "pnpm…"` first).

Delete only fully-merged local branches with the safe form, after Phase 4 puts the checkout on
`main`: `git branch -d <b>` for every local branch except `main` — lowercase `-d` refuses anything
not merged into the current branch, so the 16 archival branches and the two new `docs/*` branches
survive automatically. Report which were deleted and which were refused.

## Phase 4 — Put the main checkout on `main`

`git switch main && git pull --ff-only origin main` (local `main` is a strict ancestor; this must
fast-forward — if it does not, stop). Then `npm ci`. Confirm `AGENTS.md` now contains the
2026-09-04 decision-log entries and `git status --porcelain` is empty. Run the Phase 3 `git branch -d` sweep now.

## Phase 5 — Record the cleanup, push the notes branch, open its PR

1. `git switch docs/operator-notes-20260905`.
2. Append one decision-log bullet to `AGENTS.md` (`- **2026-09-05 (worktree estate cleanup; docs only):** …`),
   placed after the last dated bullet at the end of the file (see Phase 2 step 3 on placement),
   recording: 16 unpushed branches pushed; two 2026-08-17 branches landed via PR (name it);
   31 worktrees removed (count by location), `bnow-net-deploy-20260823` removed, release clone and
   the five artifact folders untouched; live eval results verified byte-identical to their artifact
   backups before removal; campaign scratch scripts copied to the campaign artifacts folder; the
   eval `OPENAI_API_KEY` carried into the main checkout's `.env.local`; disk before/after; main
   checkout moved from the Aug-17 branch to `main`.
3. Add one line to `## Conventions`:
   `- Worktrees: one per PR, created under /Users/go/code/bnow-net-worktrees/, and REMOVED (git worktree remove) in the same session that merges its PR. Deploys come only from the plain release clone.`
4. Commit `docs: record 2026-09-05 worktree cleanup; add worktree-removal convention`, then
   `npm run typecheck && npm run lint && npm test`, then `git push -u origin docs/operator-notes-20260905`
   and open the PR `docs: preserve operator notes and roadmap prompts; record worktree cleanup`.
   Include the PII note from Phase 1 in the body. Do not merge (rule 6).
5. `git switch main`.

## Phase 6 — Verify and report

Report, in this order, with command output pasted:
- `git worktree list` (one line), `git branch -vv` (all local branches with upstream state),
  `git branch -r --contains` proof for the 16 archival branches (one line each).
- The two PR URLs and their CI status.
- `du -shc /Users/go/code/bnow-net* | tail -1` before vs after.
- Integrity of the artifact folders you were not supposed to touch: for each `backups/*/`
  directory under the two eval artifacts folders, `cd` into it and run
  `shasum -a 256 -c MANIFEST.sha256 | grep -v ': OK$'` (empty output = all OK) — report pass/fail
  per directory, fix nothing.
- Confirmation that `grep -c '^OPENAI_API_KEY=' /Users/go/code/bnow-net/.env.local` prints 1 and
  that no `.env*` content appeared anywhere in the transcript.
- Anything that deviated from this document and how it was handled.
