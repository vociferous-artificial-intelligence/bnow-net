# CP6 — resolve the five remaining PRs and finish the queue (agent prompt, 2026-09-10)

**You are the CP6 resolver.** The first CP6 agent (`docs/prompts/2026-09-10-48h-CP6-merge-queue.md`)
merged #90, #91, #92, #94 and stopped at #88, correctly: every remaining PR now conflicts on
GitHub. This prompt carries the operator's rulings on those conflicts and the authority the first
agent deliberately did not have — to **rebase each remaining PR in its own worktree, resolve the
named hunks exactly as ruled, force-push with lease, merge, and gate**. Nothing else is widened.

**Model / effort / mode.** Opus / xhigh, attended, a FRESH session (`/clear` or a new terminal)
in `/Users/go/code/bnow-net` on branch `main`:
`cd /Users/go/code/bnow-net && caffeinate -ims claude --model opus`, then paste this file.
Default permission prompts are fine — the operator is present and every push is worth a glance.
Do not reuse the first agent's session: its prompt forbids exactly the rebases you will do, and
its context carries a wrong first sweep it had to correct.

**Where you run.** Native macOS terminal only (never Cowork/remote-mount — `lsof`, `gh` and
`git worktree list` only tell the truth from the Mac, and a remote-mount session writes
`/sessions/…` gitdir paths). Your cwd is the main checkout; every worktree operation is
`git -C <worktree> …` — you never `cd` into a worktree and never create one.

---

## 0. State you inherit (verified by the first agent, 2026-09-10 ≈04:25 ET; re-verify in §1)

- `main` = `origin/main` = **`6a79553`** (merge of #94). Merged this queue: #90 `f73fffe`, #91
  `bcb523b`, #92 `387b7a0`, #94 `6a79553`. Gate at `6a79553`: typecheck ok · lint 0 errors ·
  **4,411 tests / 282 files** · build PASS · 32 `.sql` under `drizzle/`.
- Open: **#88, #86, #87, #89, #93**. All five conflict on GitHub; none conflicts locally
  because `.gitattributes` gives `docs/PROGRESS.md` and `docs/BLOCKERS.md` the `merge=union`
  driver, which GitHub does not honour. The `.gitattributes` comment says the procedure:
  "GitHub still reports the conflict; the local rebase then resolves it without hand-editing."
- GitHub-equivalent conflicts per PR (first agent's per-file three-way merge):

| PR | head branch | worktree to rebase in | conflicts on GitHub |
|---|---|---|---|
| #88 | `48h/ws2-routing-20260905-remediate-ws2-f06` | `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905` | `docs/PROGRESS.md` (1) |
| #86 | `48h/ws3-conflict-20260905-db-claim-sources` | `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` | `docs/PROGRESS.md` (1) |
| #87 | `48h/ws3-conflict-20260905-insufficient-data` | same | `docs/PROGRESS.md` (1) |
| #89 | `48h/ws2-routing-20260905-remediate-ws2` | `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905` | `docs/PROGRESS.md` (1) · `docs/OPEN-TASKS.md` (1) · `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md` (1) |
| #93 | `48h/ws3-conflict-20260905-live-observation` | `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` | `docs/PROGRESS.md` (1) · `src/app/api/cron/conflict-validate/route.ts` (1) |

- Containments: #89 contains #88's three commits (`96bd6b1`, `cfdf6de`, `5f724ab`); #93
  contains #86's `1a022ab`. A rebase onto a `main` that already has them drops those commits as
  already-applied — that is correct, not a loss. Confirm by commit count after each rebase.
- Both lanes' delivering sessions have exited (`status.sh` DEAD; `lsof` silent). The two
  worktrees above are therefore free to use, but §1 re-checks.
- The first agent's full conflict texts and marked-up files are in its scratchpad
  (`…/scratchpad/p89_opentasks`, `p89_audit`, `p93_route`, …). You do not need them: you will
  see the same hunks live in the rebase.

---

## 1. Preflight — once

```
cd /Users/go/code/bnow-net
git status --porcelain
git fetch --prune origin
git log --oneline -1 main
git log --oneline -1 origin/main
lsof -a -d cwd -c claude | grep bnow-net-worktrees
scripts/launch/status.sh
gh pr list --state open
git -C /Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905 status --short
git -C /Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905 branch --show-current
git -C /Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905 status --short
git -C /Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905 branch --show-current
ls /Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905/.env.local
cut -d= -f1 /Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905/.env.local
```

**Expect:** clean tree; both `git log` lines `6a79553` (or a later docs-only commit — read its
`--stat`; anything under `src/` or `drizzle/` is a STOP); `lsof` silent (the grep is on
`bnow-net-worktrees` because you are yourself a `claude` process with cwd
`/Users/go/code/bnow-net`); `status.sh` with no `run` session; exactly five open PRs (#86, #87,
#88, #89, #93); both worktrees with an empty `status --short` (ignored files do not show) and on
some branch (the lane branch or a step branch — either is fine, you will check out the PR
branches explicitly); the ws3-conflict `.env.local` present with exactly `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY` (#93's fork itest needs it; if it is
absent or holds any other key, STOP — posture is set only by `scripts/launch/env-posture.sh`,
run by the operator). Anything else: STOP and report.

---

## 2. The operator's rulings (signed 2026-09-10; apply exactly, nothing more)

**R-1 — `docs/PROGRESS.md` on every PR: resolved by the union driver during the rebase, never
by hand.** After each rebase, verify the file: both lanes' plan/execution blocks present, in
timestamp order, nothing duplicated, no conflict markers. If the driver leaves a marker (it
should not), STOP.

**R-2 — #89, `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md`: keep BOTH sections.** `## Lane C`
(already on `main` via #94) stays first; lane R's `## Lane R` is appended after it, whole. Do
not edit either section's text. Any shared preamble above the two sections: keep `main`'s
version and add nothing.

**R-3 — #89, `docs/OPEN-TASKS.md`: one `119.` entry with two sub-tables.** Both lanes filed a
`119.` with the same heading. Resolve to a single `119.` entry: `main`'s heading line; then
lane R's sub-table titled `Lane R — WS-2 register (#74)` with its ~20 rows and its three
residuals (a)(b)(c) verbatim; then lane C's sub-table titled `Lane C — WS-3 register (#78)`
verbatim (WS3-F11, N01, N02, N05–N10). Delete both lanes' closing sentences ("Lane C appends its
own rows to this entry after rebasing." / "Lane R's WS-2 rows belong to this same entry (PR
#89).") and replace with one line: `Both lanes' rows filed 2026-09-10 (PRs #89 and #94).`
`120.` is byte-identical on both sides — leave it; no renumbering anywhere.

**R-4 — #93, `src/app/api/cron/conflict-validate/route.ts`: BOTH sides.** The hunk is an
object literal where `main` (from #90) adds
`...(out.dayStatusReason === null ? {} : { dayStatusReason: out.dayStatusReason }),` and the
branch adds the five bounded observation keys (`editionKey`, `observationId`, `units`,
`matcherRung`, `skipped`) with their two-line ruling-1 comment. Resolution: the
`dayStatusReason` spread first, then the comment and the five keys, in the same object; no other
change. `route.test.ts` merges clean — run it and read its assertions; if the merged object
shape breaks an assertion, STOP with the failing test text (do not edit the test).

**R-5 — anything not named above that conflicts: STOP.** Paste the path and the hunk. In
particular any conflict under `src/`, `scripts/`, `drizzle/` or `src/db/schema.ts` other than
R-4's single hunk stops the queue, as does a second hunk in `route.ts`.

---

## 3. Per PR — in this order: **#88 → #86 → #87 → #89 → #93**

`<n>`, `<branch>`, `<wt>` come from the §0 table. Run the four cards for one PR to completion
before starting the next; `main` moves after every merge, so the next rebase is onto the new tip.

### 3.a Rebase in the PR's own worktree

```
cd /Users/go/code/bnow-net
lsof -a -d cwd -c claude | grep bnow-net-worktrees
git -C <wt> fetch --prune origin
git -C <wt> status --short
git -C <wt> checkout <branch>
git -C <wt> log --oneline origin/main..HEAD | wc -l
git -C <wt> rebase origin/main
git -C <wt> status --short
git -C <wt> log --oneline origin/main..HEAD
```

**Expect:** `lsof` silent; an empty `status --short` before the checkout; the pre-rebase commit
count matching §0 (3 / 2 / 2 / 28 / 5); for #88, #86, #87 the rebase completes with no stop
(union driver); for #89 and #93 it stops once with the R-2/R-3 (or R-4) files in `UU` — resolve
per §2, then `git -C <wt> add <files>` and `git -C <wt> rebase --continue`; after the rebase,
`status --short` empty and the commit count = §0's count minus the contained commits (#89: 25;
#93: 4). `git -C <wt> diff origin/main --stat -- drizzle src/db/schema.ts` must print nothing.
Never `--skip` a commit; never `git rebase --abort` and retry a different way — STOP instead.

Then the `PROGRESS.md` check (R-1):

```
git -C <wt> grep -n '^<<<<<<<\|^>>>>>>>\|^=======$' -- docs/PROGRESS.md docs/OPEN-TASKS.md docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md src/app/api/cron/conflict-validate/route.ts
git -C <wt> diff origin/main --stat -- docs/PROGRESS.md
```

**Expect:** no markers; `PROGRESS.md` differs from `main` only by this lane's own blocks.

### 3.b Gate in the worktree

```
cd <wt>
npm run typecheck && npm run lint && npm test
cd /Users/go/code/bnow-net
```

For **#93 only**, add the fork itest the step-19 report names for the route (read
`docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md` §Tests on the branch for the exact file
list — expected `src/integration/conflict-validate*.itest.ts` and the observation-store itest)
from inside the worktree: `npm run test:integration -- <files>`. Record the fork branch name the
runner prints and that it printed `deleted`. $0 — the worktree holds only the four Neon keys.

**Expect:** typecheck clean, lint 0 errors, unit count ≥ the current `main` reading (it will be
higher — this PR's tests), itest green for #93. A failure here is a STOP with the output; do not
patch code to make it pass.

### 3.c Push with lease, confirm GitHub agrees

```
git -C <wt> push --force-with-lease origin <branch>
cd /Users/go/code/bnow-net
gh pr view <n> --json baseRefName,headRefName,mergeable,mergeStateStatus -q '[.baseRefName,.headRefName,.mergeable,.mergeStateStatus]'
```

**Expect:** the push accepted; base `main`; `mergeable` reaching `MERGEABLE` / `CLEAN` within a
few polls (first poll often `UNKNOWN` — wait 10 s and re-view, up to 6 times). Still
`CONFLICTING` after the rebase: STOP with the output — do not rebase again.

### 3.d Merge and gate `main`

```
cd /Users/go/code/bnow-net
gh pr merge <n> --merge
git pull --ff-only
git log --oneline -1
npm run typecheck && npm run lint && npm test
LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= DATABASE_URL=postgres://x:y@localhost/z npm run build
ls drizzle | grep -c '\.sql$'
git diff --stat HEAD~1 HEAD -- drizzle src/db/schema.ts
```

**Expect:** a merge commit (record its SHA); gate green; unit count never lower than the previous
`main` reading (record before → after); build PASS; `32`; empty diff. A red gate on `main` is a
STOP — no revert, no fix, no next PR.

---

## 4. After #93 — close the queue, launch nothing

```
cd /Users/go/code/bnow-net
gh pr list --state open
git log --oneline --first-parent 6a79553..main
scripts/launch/status.sh
git worktree list
```

**Expect:** no open PR; five merge commits; no `run` session; no `prunable` or `/sessions/` entry.
Step 24's gate ("19 merged") is now true — say so in the report, **do not launch it**; the
operator launches from the plan's card 4.1. Do not write INDEX §10, the tracker, or any review
file: paste readings and the operator drafts the CP6 record.

---

## 5. Hard rules

- The five rebases and force-pushes in §3 are the only history rewrites you are authorized to
  make, on exactly the five head branches in §0, each once. Never touch a lane branch
  (`48h/ws2-routing-20260905`, `48h/ws3-conflict-20260905`, `48h/audit-ws3-20260905-remediate-ws3`),
  never `main`, never any branch of a merged PR.
- `lsof -a -d cwd -c claude | grep bnow-net-worktrees` before every rebase; a live session in a
  worktree is a STOP.
- Hand-edits only where R-2, R-3, R-4 say, only to the shape they say. No other file changes, no
  commits of your own (a `rebase --continue` re-authors the lane's commit; that is not a new
  commit). If a commit is unavoidable, `area: imperative summary`, no vendor branding.
- Never `.env.local`, never a launch, never a claim, never a provider call, never Vercel, never a
  migration applied anywhere. $0 (fork itests are $0 by posture).
- If a reading disagrees with §0 — a sixth PR, a different commit count, a conflict in a file
  not named — the reading wins: STOP and report it.

---

## 6. Report shape (paste this, nothing else)

```
CP6 resolve-and-finish — 2026-09-10
Start:  main = <sha>   unit = <n> / <m>
Per PR, in order (#88 #86 #87 #89 #93):
  #88  rebase: <k>→<k'> commits, PROGRESS via union, hand-resolved: none | push ok | mergeable CLEAN after <p> polls | merge=<sha> | main gate: typecheck ok, lint 0, unit <before>→<after>, build PASS, drizzle 32, diff empty
  #86  ...
  #89  hand-resolved: OPEN-TASKS 119 (two sub-tables), AUDIT-REMEDIATIONS (both sections) ...
  #93  hand-resolved: route.ts (spread + five keys); itest <files> on fork <name>, deleted ...
End:    main = <sha>, open PRs none, unit <n> / <m>, five merge commits listed
Stopped at (if any): <PR, card, exact output, conflict text, state left>
Incidents: <every extra poll, every surprise, or "none">
```
