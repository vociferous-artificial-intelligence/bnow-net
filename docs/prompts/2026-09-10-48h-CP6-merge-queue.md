# CP6 — merge queue for steps 23c, 23r, 19 (agent prompt, 2026-09-10)

**You are the merge operator's agent.** You work the CP6 merge queue defined by
`docs/prompts/2026-09-09-48h-completion-plan.md` **§3** (cards 3.1 → 3.4) and bound by that
file's **§7** rules, plus `CLAUDE.md` and `AGENTS.md`. §3 is the authority; where this file
adds anything, it is either a verified fact about the nine PRs that are actually open or an
explicit instruction from the operator recorded on 2026-09-10. Nothing here loosens §3.

**Model / effort / mode.** Opus / high, attended, in a native terminal the operator watches
(`cd /Users/go/code/bnow-net && caffeinate -ims claude --model opus`, then paste this file). Not
Fable: nothing here needs depth — the work is fetch → pre-check → merge → gate with hard stops,
and the gate outputs are read, not judged. Not `xhigh` either; the discipline this queue needs
is carried by the STOP rules, not by reasoning effort. The operator is present because the two
predicted STOPs need a human ruling before anything else moves.

**Where you run.** A native macOS terminal session on the Mac, in `/Users/go/code/bnow-net`,
branch `main`. Not a Cowork/remote-mount session: `git worktree list`, `lsof` and `gh` only
tell the truth from the Mac, and a remote-mount worktree writes `/sessions/…` gitdir paths git
cannot resolve later (`CLAUDE.md`).

**You are not autonomous to the end.** Two conflicts are already predicted (below). At each
one you **STOP and hand back** — you do not resolve, rebase, force-push, or work around them.

---

## 1. Preflight — once, before any merge

```
cd /Users/go/code/bnow-net
git status --porcelain
git fetch --prune origin
git log --oneline -1 main
git log --oneline -1 origin/main
lsof -a -d cwd -c claude | grep bnow-net-worktrees
scripts/launch/status.sh
gh pr list --state open
npm run typecheck && npm run lint && npm test
```

**Expect:** `git status --porcelain` prints nothing. (The `lsof` grep is on
`bnow-net-worktrees`, not `bnow`: you are yourself a `claude` process whose cwd is
`/Users/go/code/bnow-net`, and the plan's operator-shell form `grep bnow` would match you and
read as a live session.) Both `git log` lines print the same SHA —
`4b8e7e7` ("docs: launch order 23c -> 23r -> 19…") or a later docs-only commit. `lsof` prints
**nothing** (all three delivering sessions exited; `status.sh` showed `DEAD` pids for 19, 23r
and 23c on 2026-09-10T02:0x). `gh pr list` shows the **nine** PRs in §2 and no others. The
gate is green and you have written down the **baseline unit count** (`main` at `25bdd27` read
`4,332 / 282`; re-read it here — it is the "before" of every later before→after).

Anything else — a dirty tree, `main` behind `origin/main`, a live `lsof` line, a tenth PR —
**STOP and report**. Do not start the queue.

---

## 2. The queue — exact order, and why it is that order

**Order (revised 2026-09-10 after the dry run): `#90 → #91 → #92 → #94 → #88 → #86 → #87 → #89 → #93`.**
The seven merges the dry run predicts clean go first, so the two predicted STOPs (#89 docs,
#93 code) fall at the end and the operator resolves both in one sitting instead of holding lane
19's clean PRs (#86, #87) behind lane R's docs conflict. Every within-lane ordering constraint
below is preserved (#88 before #89; #86 before #93). Card 3.2 decides at each PR regardless of
the prediction — if #86 or #87 pre-checks non-zero, STOP there. Do not skip, do not batch.

### Lane 23c (WS-3 register remediation) — `#90`, `#91`, `#92`, `#94`

| # | head branch | commits ahead of main |
|---|---|---|
| 90 | `48h/audit-ws3-20260905-discovery` | 9 |
| 91 | `48h/audit-ws3-20260905-gazetteer` | 2 |
| 92 | `48h/audit-ws3-20260905-observations` | 2 |
| 94 | `48h/audit-ws3-20260905-docs` | 3 |

Verified 2026-09-10: the four branches share **no commit and no file** — each is cut straight
from `main`, deliberately not a stack (lane C's own report, `## Lane C`, says so). Any order is
correct; use 90 → 91 → 92 → 94 so the docs PR lands last of its lane.

### Lane 23r (WS-2 register remediation) — `#88` **then** `#89`

| # | head branch | commits ahead of main |
|---|---|---|
| 88 | `48h/ws2-routing-20260905-remediate-ws2-f06` | 3 |
| 89 | `48h/ws2-routing-20260905-remediate-ws2` | 28 |

**`#88` must merge before `#89`; `#89` goes to the END of the queue (after #86, #87).** `#89`'s 28 commits *contain* `#88`'s three at their base
(`96bd6b1`, `cfdf6de`, `5f724ab`) — merging `#89` first swallows `#88` and leaves an empty PR
(the CP5 `#82`/`#83` incident in card 3.1 is the same shape). `#89`'s GitHub base is most
likely `48h/ws2-routing-20260905-remediate-ws2-f06`; GitHub usually retargets it to `main` on
its own once `#88` merges — **verify with 3.1, do not assume**, and if it is still pointing at
the f06 branch, `gh pr edit 89 --base main` before anything else.

### Lane 19 (WS-3.3 evidence population) — `#86` **then** `#87` **then** `#93`

| # | head branch | commits ahead of main |
|---|---|---|
| 86 | `48h/ws3-conflict-20260905-db-claim-sources` | 2 |
| 87 | `48h/ws3-conflict-20260905-insufficient-data` | 2 |
| 93 | `48h/ws3-conflict-20260905-live-observation` | 5 |

**`#86` and `#87` merge right after `#88`; `#93` is LAST in the queue** (after #89). `#93` contains `#86`'s commit `1a022ab`. `#86` and `#87` are siblings off the
shared docs commit `4f735f6` ("docs: plan block for WS-3.3 evidence population", which is also
the tip of the lane branch `48h/ws3-conflict-20260905`), so both may show a base of
`48h/ws3-conflict-20260905` and `#93` a base of the db-claim-sources branch — card 3.1 per PR,
`gh pr edit <n> --base main` where needed.

### Never merge a lane branch

`48h/audit-ws3-20260905-remediate-ws3` (+15) and `48h/ws3-conflict-20260905` (+1) are lane
working branches with **rebased duplicates** of the PR commits. They have no PR and they never
enter this queue. Only the nine head branches above.

---

## 3. Per PR — cards 3.1 → 3.3, verbatim

Run these for each PR, in queue order, one PR at a time.

**3.1 Fence and stack check**

```
cd /Users/go/code/bnow-net
lsof -a -d cwd -c claude | grep bnow-net-worktrees
git fetch --prune origin
gh pr view <n> --json baseRefName,headRefName,mergeable -q '[.baseRefName,.headRefName,.mergeable]'
```

Expect: `lsof` silent; `baseRefName` = `main`; `mergeable` = `MERGEABLE`. If the base is
another PR's branch: `gh pr edit <n> --base main`, wait ~30 s, re-view. If a **second**
`gh pr edit` would be needed, or `mergeable` stays `CONFLICTING` after the retarget, **STOP**.

**3.2 Conflict pre-check**

```
cd /Users/go/code/bnow-net
mb=$(git merge-base origin/main origin/<branch>); git merge-tree $mb origin/main origin/<branch> | grep -c '^+<<<<<<<'
```

Expect `0` → merge. **Greater than 0 → STOP** (§4). You do **not** rebase, resolve or
force-push anything in this queue; the operator decided on 2026-09-10 that both predicted
conflicts come back to them first, including the docs-only one.

**3.3 Merge**

```
cd /Users/go/code/bnow-net
gh pr merge <n> --merge
git pull --ff-only
git log --oneline -1
```

`--merge` only — never `--squash`, never `--rebase`, never the web UI. Record the merge SHA.

**3.4 Gate — after EVERY merge, all nine, not only the last** (operator's explicit ruling,
2026-09-10; a green `main` is what the next PR is measured against)

```
cd /Users/go/code/bnow-net
npm run typecheck && npm run lint && npm test
LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= DATABASE_URL=postgres://x:y@localhost/z npm run build
ls drizzle | grep -c '\.sql$'
git diff --stat HEAD~1 HEAD -- drizzle src/db/schema.ts
scripts/launch/status.sh
```

Expect: typecheck clean · lint **0 errors** · unit count **≥ 4,332** and never lower than the
previous merge's reading (record before → after for every PR) · build **PASS** · the migration
set unchanged.

> **Note on the drizzle line.** The plan's card 3.4 used `ls drizzle | tail -4`, whose fourth
> line on a correct tree is the `meta` directory — corrected in the plan on 2026-09-10 to the
> two lines above. The gate is **32 `.sql` files** (0000–0030 plus `9999_claim_source_trigger.sql`)
> and an empty `git diff --stat` for the merge just landed. Verified 2026-09-10: **none of the nine branches touches `drizzle/` or
> `src/db/schema.ts`.** If any migration or schema change appears, **STOP** — no step in this
> queue may add one.

A gate failure after a merge: **STOP immediately**. Do not revert, do not push a fix, do not
merge the next PR. Report the failing command and its output.

---

## 4. The two predicted STOPs

A dry run of the full queue on a scratch clone of the current refs (2026-09-10) predicts seven
clean merges and two conflicts. Treat this as a **prediction to be re-derived by card 3.2**,
not as a fact to act on — but it tells you where you are going.

| PR | 3.2 pre-check | note |
|---|---|---|
| #90 #91 #92 #94 #88 #86 #87 | `0` predicted | merge as-is, in that order |
| **#89** | **2 conflicts** | `docs/OPEN-TASKS.md` (1 hunk) and `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md` (1 hunk) — lane C's `#94` section meets lane R's. Docs only; no code file conflicts. **STOP #1.** |
| **#93** | **1 conflict** | `src/app/api/cron/conflict-validate/route.ts`, one hunk in the per-cell body: `HEAD`'s `dayStatusReason` spread (from `#90`) against the five observation cell keys (`editionKey`, `observationId`, `units`, `matcherRung`, `skipped`). `route.test.ts` merges clean. **STOP #2 — this is a code conflict; card 3.2 stops the queue on those unconditionally, and the operator asked specifically to be stopped here.** |

**At STOP #1, one extra reading (do it, paste it, do not act on it):** `main` carries no
OPEN-TASKS entry numbered **119** (`grep -c '^119\. ' docs/OPEN-TASKS.md` = 0 at `4b8e7e7`), and
both lanes were told "next free number is #119 — one lane files the DEFER bundle, the other
appends after rebasing". They ran in parallel. Report, for `origin/48h/audit-ws3-20260905-docs`
and `origin/48h/ws2-routing-20260905-remediate-ws2`, the output of
`git show <ref>:docs/OPEN-TASKS.md | grep -n '^1[12][0-9]\. '` — if both added a `119.` (or lane
C used 121+ while lane R used 119), the operator's resolution is a renumber-and-merge of the two
bundle tables into one entry, not a keep-both.

`#93`'s own merge note (`docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md`, "Merge note
for the operator") predicts three route hunks plus the test; the dry run says the counter
declarations and the `counts.*` block merged textually clean, leaving one. **Quote what card
3.2 actually reports — do not repeat either prediction as your result.**

### What to paste at a STOP

1. Which PR, which card, and the exact command output that stopped you.
2. Every conflicted path, with the number of `<<<<<<<` hunks in each.
3. The full conflict text of each hunk (`<<<<<<<` … `>>>>>>>`), unedited.
4. The state you are leaving behind — confirm `git status --porcelain` on `main` is **empty**,
   that no branch was rebased or force-pushed, and which PRs are already merged with their SHAs.
5. Nothing else. No proposed resolution applied, no `gh pr edit` beyond the single 3.1
   retarget, no worktree touched.

Then wait. The operator assesses and comes back with a decision.

### Recommended rulings (the operator's to sign at the STOP — not yours to apply)

- **STOP #1 (#89, docs only).** Resolution in the PR's OWN worktree
  `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905` on branch
  `48h/ws2-routing-20260905-remediate-ws2`: `git rebase origin/main`; in
  `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md` keep BOTH `## Lane C` and `## Lane R`
  sections (the step-23 prompt anticipated exactly this); in `docs/OPEN-TASKS.md` keep both
  lanes' entries and, if both filed a #119, merge the two DEFER tables under one `119.` heading
  with lane R's ids and lane C's ids in two sub-tables, renumbering any later entry lane C
  filed; `npm run typecheck && npm run lint && npm test`; `git push --force-with-lease`. This
  matches plan §3.2's "resolve only PROGRESS / BLOCKERS / OPEN-TASKS / decision-log tails" plus
  the one shared report file both lanes were told to append to.
- **STOP #2 (#93, code).** The hunk is `#90`'s `...dayStatusReason` spread meeting `#93`'s five
  observation keys in the same per-cell object; the intended result is BOTH — the reason
  spread stays and the five keys are added beside it — and `route.test.ts` merges clean. Same
  procedure in `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` on branch
  `48h/ws3-conflict-20260905-live-observation`, but because it is code the operator (or a
  session the operator runs in THAT worktree, never this one) resolves it, re-runs the gate
  there including the fork itest the step-19 report names for the route, and pushes with
  `--force-with-lease`. Then the queue resumes.

### Resuming after a STOP

You may be told "resume" in this same session or relaunched with this prompt. Either way:
re-run §1 in full (the unit baseline is now the reading after the last merged PR, not
`4,332`); for every PR in §2 run `gh pr view <n> --json state,mergeCommit -q '[.state,.mergeCommit.oid]'`
and skip the ones already `MERGED` (list them with their SHAs in the report); continue from the
first `OPEN` PR in queue order with card 3.1. Never re-merge, never touch a branch.

---

## 5. Hard rules (§7 of the plan, plus this queue's own)

- **Any conflict in code, `drizzle/` or `src/db/schema.ts` stops the queue.** So does any
  non-zero 3.2 count at all, in this run.
- `lsof -a -d cwd -c claude | grep bnow-net-worktrees` before every merge, not once at the start (the plan's `grep bnow` form is for the operator's own shell; it matches you).
- Before merging any PR whose base is not `main`: `gh pr edit <n> --base main`.
- Never rebase, reset, force-push, or create a worktree. This queue is fetch-merge-gate only.
- Never touch any `.env.local` (posture is `scripts/launch/env-posture.sh`'s alone), never
  launch a session, never consume a claim.
- No provider call, no deploy, no Vercel read or write, no migration applied anywhere. **$0.**
- If you commit anything at all (you should not need to): `area: imperative summary`, and **no
  vendor branding** — no `Co-Authored-By`, no "Generated with", no model or vendor names, in
  the message, the code comments, or the file contents.

---

## 6. What you deliver

Raw readings only — no docs commit, no review file, no INDEX or tracker edit. The operator
drafts the CP6 record from what you paste. One report, in this shape:

```
CP6 merge queue — 2026-09-10
Start:  main = <sha>   unit baseline = <n> tests / <m> files
Merged, in order (expected 90 91 92 94 88 86 87 89 93):
  #90  base=main  3.2=0  merge=<sha>  typecheck ok  lint 0  unit <before>→<after>  build PASS  drizzle 32 .sql, diff empty
  #91  ...
Stopped at: #<n>, card 3.<x>
  <the command and its output>
  <conflicted paths, hunk counts, full conflict text>
Left behind: main = <sha>, tree clean, nothing rebased or pushed
Not attempted: #<…>
Incidents: <every retarget, every retry, every surprise — or "none">
```

Report the numbers you actually read. If a reading disagrees with anything in this file — the
PR list, the commit containments, the predicted conflicts, the drizzle count — **the reading
wins and you say so in the report.**
