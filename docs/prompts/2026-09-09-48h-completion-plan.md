# 48h program — completion plan from 2026-09-09 (the remainder, operator-first)

**What this file is.** The one document to open in the morning. It replaces the Stage 3 launch
sheet in `docs/prompts/2026-09-08-48h-CP4-status-tracker.md` §6 (superseded; the tracker's
§1–§5 stay the fact record) and carries `docs/prompts/2026-09-07-48h-CP4-and-completion-plan.md`
§5.3–§5.5 forward to where the code actually is.

**How to read it.** Every step is a self-contained card: **Where** (the exact directory you
run it in and the branch it expects), **Requires** (the state that must already be true — stated
in full, never "as in the previous step"), **Do** (one copy block, commands only — no comments,
because zsh on macOS mis-handles `#` inside a pasted block), **Expect** (what the output must
show before you go on). Nothing in a card depends on having read another card. Step numbers
(19, 23r, 26 …) are only labels; the worktree and path are always written out.

**Verified against:** `main` = `origin/main` = **`f55534e`** (2026-09-09, the CP5 record
commit), tree clean. Gate on `main` at `25bdd27`: typecheck clean · lint 0 errors · unit
**4,332 / 282** · `npm run build` PASS. Open PRs: none at CP5. Live claims: none.

**Two mechanics changed on 2026-09-09.** (1) Every `claude` the launcher starts or prints is
wrapped in `caffeinate -ims`, so the Mac cannot sleep under a running session; the pid the
claim records is `caffeinate`'s, which lives exactly as long as the session. (2)
`scripts/launch/env-posture.sh` sets every worktree's `.env.local` in one pass (trimmed
four-key copy for the lanes that need a Neon fork, removed everywhere else) — there are no
per-worktree copy steps anywhere below.

---

## 1. Map of what is left

Stage 3 has ten steps; six are merged (18, 20, 21, 32, 33, 34 — CP5). Four remain, then the
closing stages. Three lanes launch in parallel in the first hour: **19**, **23r**, **23c** —
the change from the 09-08 sheet, where 23c waited for 19 because they shared a worktree. The
reverse order (23c to completion, then 19) was analyzed on 2026-09-09
(`docs/reviews/REORDER-23C-19-ANALYSIS-2026-09-09.md`): it would cost lane C's whole duration
(6–8 h) on the critical path, so instead step 19 builds its claim-sources PR first and takes
lane C's fixed module for its second PR whenever 23c has merged by then — the data-quality gain
(a real `unit_attribution` for Iran instead of the constant `"both"`, honest per-day status
reasons) at zero schedule cost in the expected case.

| Step | Worktree (under `/Users/go/code/bnow-net-worktrees/`) | Lane branch | Attended | Launchable when | Prompt (`docs/prompts/`) | Report the launcher looks for (`docs/reviews/`) |
|---|---|---|---|---|---|---|
| **19** WS-3.3 evidence population | `48h-ws3-conflict-20260905` | `48h/ws3-conflict-20260905` | no | now | `2026-09-05-48h-19-ws3-3-evidence-population.md` | `WS-3-3-EVIDENCE-POPULATION-2026-09-06.md` |
| **23r** remediate WS-2 register | `48h-ws2-routing-20260905` | `48h/ws2-routing-20260905` | no | marks CONFIRMED (§2.2) | `2026-09-05-48h-23-remediate-audits.md` | `AUDIT-REMEDIATIONS-2026-09-07.md` (`## Lane R`) |
| **23c** remediate WS-3 register | `48h-audit-ws3-20260905` (moved here 09-09) | `48h/audit-ws3-20260905` | no | marks CONFIRMED + D-a…D-f signed (§2.1, §2.2) | same file (lane chosen by worktree) | same file (`## Lane C`) |
| **24** WS-3.5 scoreboard + soak prep | `48h-ws3-gazetteer-20260905` | `48h/ws3-gazetteer-20260905` | no | 19 merged | `2026-09-05-48h-24-ws3-5-scoreboard-and-soak-prep.md` | `WS-3-5-SCOREBOARD-AND-SOAK-PREP-2026-09-07.md` |
| **25** docs sync | `48h-gov-20260905` | `48h/gov-20260905` | no | 19, 23r, 23c, 24 merged; no open PR | `2026-09-05-48h-25-docs-sync.md` | `PROGRAM-48H-DOCS-SYNC-2026-09-07.md` |
| **26** final audit | `48h-audit-ws2-20260905` | `48h/audit-ws2-20260905` | **yes** | freeze SHA written into the prompt | `2026-09-05-48h-26-final-audit.md` (**Opus**) | `PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` |
| **27** deploy | release clone `/Users/go/code/bnow-net-rel-20260823` | — | operator | 26's verdict table | `2026-09-05-48h-27-operator-deploy.md` | decision-log entry per deploy |
| 28 reviewer instrument | none (manual, outside the repo) | — | operator | any time | `2026-09-05-48h-28-reviewer-instrument.md` | outside the repo |

Merge queues (CP6, CP7) and the freeze run in the main checkout `/Users/go/code/bnow-net` on
branch `main`. Launches always run from the main checkout too — the launcher finds the
worktree itself.

---

## 2. Morning block — Day 1, in this order (~40 minutes to three running sessions)

### 2.0 Preflight

**Where:** `/Users/go/code/bnow-net`, branch `main`, native macOS terminal (not a Cowork
session — `git worktree list` and `lsof` only tell the truth from the Mac).
**Requires:** nothing.

```
cd /Users/go/code/bnow-net
git status --porcelain
git fetch --prune origin
git log --oneline -1 origin/main
git log --oneline -1 main
lsof -a -d cwd -c claude | grep bnow
scripts/launch/status.sh
gh pr list --state open
```

**Expect:** `git status --porcelain` prints nothing; both `git log` lines show the same SHA,
`f55534e` or a later docs commit; `lsof` prints nothing; `status.sh` shows no CLAIM on any row and
its ledger lists only the 2026-09-08 launches; `gh pr list` prints nothing. Anything else: stop
and read it before continuing.

### 2.1 Sign D-a … D-f — one decision-log entry

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** you have read `docs/prompts/2026-09-09-48h-sign-Da-Df.md` — the drafted entry
answering the six questions in `docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md`
§Decisions needed. It takes the register's recommendations except **D-d**, which assigns the
N3 backfill mode to step 23 lane C instead of step 19 (because lane C now runs in the
`48h-audit-ws3-20260905` worktree alongside step 19 and owns `edition-discovery.ts` for this
window). Edit any option you decide differently before running this; if a change alters a
step-23 mark, move that id in the step-23 prompt's tables at §2.2.

```
cd /Users/go/code/bnow-net
python3 - <<'EOF'
p='AGENTS.md'
s=open(p,encoding='utf-8').read()
e=open('docs/prompts/2026-09-09-48h-sign-Da-Df.md',encoding='utf-8').read().strip()+'\n'
m='\n## Conventions'
i=s.index(m)
s=s[:i].rstrip('\n')+'\n\n'+e+s[i:]
open(p,'w',encoding='utf-8').write(s)
EOF
grep -c 'D-a … D-f — WS-3 audit register decisions signed' AGENTS.md
wc -c AGENTS.md
```

**Expect:** `1`, and a byte count under 150,000 (≈130,700). The entry now sits at the end of
`## Decision log`, immediately before `## Conventions`. Do not run
`scripts/check-decision-log-move.sh` here — it is the archive-pass check and an append fails it
by design.

### 2.2 Confirm the step-23 marks — one line

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** you have read §1 of `docs/prompts/2026-09-05-48h-23-remediate-audits.md`, which
tables every finding of both audit registers with a mark: the five majors FIX; minors and notes
that touch a spend path, a gate, a migration or production-visible behaviour FIX; docs-only
items routed to step 25; the rest DEFER into one OPEN-TASKS entry (#119). To change a mark, move
the finding id between table rows — nothing else in the file depends on it.

```
cd /Users/go/code/bnow-net
sed -i '' 's/^OPERATOR CONFIRMATION OF MARKS: PENDING$/OPERATOR CONFIRMATION OF MARKS: CONFIRMED 2026-09-09 by the operator, as tabled/' docs/prompts/2026-09-05-48h-23-remediate-audits.md
grep -n 'OPERATOR CONFIRMATION OF MARKS' docs/prompts/2026-09-05-48h-23-remediate-audits.md
```

**Expect:** exactly one line, reading `… CONFIRMED 2026-09-09 …`. A session launched while it
still reads PENDING prints `AWAITING AUTHORIZATION: step-23 marks` and stops.

### 2.3 Set every worktree's `.env.local` in one pass

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** `/Users/go/code/bnow-net/.env.local` exists and carries values for
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY` (the script refuses
otherwise; it only ever READS this file). The `DATABASE_URL` in it still carries the
pre-rotation password — harmless for fork work, which uses `NEON_API_KEY` and the DSN the API
returns.

```
cd /Users/go/code/bnow-net
scripts/launch/env-posture.sh --dry
scripts/launch/env-posture.sh
```

**Expect:** 14 worktrees listed. Posture `trimmed` with keys `DATABASE_URL
DATABASE_URL_UNPOOLED NEON_PROJECT_ID NEON_API_KEY` for `48h-ws3-conflict-20260905`,
`48h-ws2-routing-20260905`, `48h-audit-ws3-20260905`, `48h-ws3-gazetteer-20260905`,
`48h-ws4-ops-20260905`; posture `remove` and keys `absent` for the other nine; the last line
`posture OK: no worktree holds a spend or deploy key.` Exit code 0.

### 2.4 Fresh toolchain in the three worktrees launching now

**Where:** the three worktrees named in the block, each on its lane branch (whatever tip it
holds — the launcher resets it at launch).
**Requires:** §2.3 done (each worktree holds the trimmed `.env.local`, which is gitignored and
must not appear in `git status`).

```
for w in 48h-ws3-conflict-20260905 48h-ws2-routing-20260905 48h-audit-ws3-20260905; do echo "== $w"; cd /Users/go/code/bnow-net-worktrees/$w && git checkout -- package-lock.json 2>/dev/null; git status --short; npm ci --silent; done
cd /Users/go/code/bnow-net
```

**Expect:** under each `== …` heading, nothing from `git status --short` and no npm error. A
worktree with any status line is dirty and must not be launched into (COMMON §4.11) — stop and
tell me which file.

### 2.5 Commit the two signatures

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** §2.1 and §2.2 done. Everything else from the 2026-09-09 prep (this plan, the
prompt rewrites, `scripts/launch/steps.tsv`, `launch.sh`'s `caffeinate`, `env-posture.sh`, the
tracker) is already committed — `git log --oneline -3` shows the commit titled
`docs: 48h remainder plan (2026-09-09) …`.

```
cd /Users/go/code/bnow-net
git status --short
git add AGENTS.md docs/prompts/2026-09-05-48h-23-remediate-audits.md
git commit -m 'docs: D-a..D-f signed; step 23 marks confirmed'
git push origin main
git log --oneline -1 origin/main
```

**Expect:** `git status --short` lists exactly `AGENTS.md` and the step-23 prompt before the
add; the pre-push gate (typecheck + lint + test) green; `origin/main` at the new commit. Lane C
reads the D-a…D-f entry from `origin/main`, so a failed push blocks §2.8.

### 2.6 Launch step 19 — WS-3.3 evidence population

**Where:** run from `/Users/go/code/bnow-net`, branch `main`. Target worktree
`/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905`, lane branch
`48h/ws3-conflict-20260905` (the launcher resets it to `origin/main`). Unattended, Opus.
**Requires:** §2.3–§2.5 done; `scripts/launch/status.sh` shows no CLAIM on row 19.

```
cd /Users/go/code/bnow-net
export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'
scripts/launch/launch.sh 19
```

**Expect** (the dry run): `worktree : /Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905`,
`.env.local: present (trimmed — no spend/deploy keys)`, `launch opts: --dangerously-skip-permissions`,
the claim check passing, and the printed command containing `caffeinate -ims claude -p`. Then:

```
cd /Users/go/code/bnow-net
export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'
scripts/launch/launch.sh 19 --go
```

**Expect:** `LAUNCHED step 19 detached: pid …` and a log at
`/Users/go/code/bnow-net-worktrees/logs/step19.log`. `FAIL: session exited immediately` means
the claim was released and nothing runs — read the log lines it prints, do not relaunch.

### 2.7 Launch step 23r — remediate the WS-2 register (lane R)

**Where:** run from `/Users/go/code/bnow-net`, branch `main`. Target worktree
`/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905`, lane branch
`48h/ws2-routing-20260905` (reset to `origin/main` by the launcher). Unattended, Opus.
**Requires:** §2.2 confirmed and pushed (§2.5); the worktree holds the trimmed four-key
`.env.local` (§2.3); `status.sh` shows no CLAIM on row 23r. The session learns it is lane R
from its own worktree path.

```
cd /Users/go/code/bnow-net
export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'
scripts/launch/launch.sh 23r
scripts/launch/launch.sh 23r --go
```

**Expect:** the dry run shows the `48h-ws2-routing-20260905` path, `.env.local: present
(trimmed — no spend/deploy keys)`, `launch opts: --dangerously-skip-permissions`; the go prints
`LAUNCHED step 23r detached: pid …`; log at `/Users/go/code/bnow-net-worktrees/logs/step23r.log`.

### 2.8 Launch step 23c — remediate the WS-3 register (lane C)

**Where:** run from `/Users/go/code/bnow-net`, branch `main`. Target worktree
`/Users/go/code/bnow-net-worktrees/48h-audit-ws3-20260905`, lane branch
`48h/audit-ws3-20260905` (reset to `origin/main` by the launcher). Unattended, Opus.
**Requires:** §2.1 and §2.2 done AND pushed to `origin/main` (§2.5) — the session halts with
`AWAITING AUTHORIZATION: D-a…D-f` if the entry is not on `origin/main`; the worktree holds the
trimmed four-key `.env.local` (§2.3); `status.sh` shows no CLAIM on row 23c. The session
learns it is lane C from its own worktree path.

```
cd /Users/go/code/bnow-net
export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'
scripts/launch/launch.sh 23c
scripts/launch/launch.sh 23c --go
```

**Expect:** the dry run shows the `48h-audit-ws3-20260905` path, `.env.local: present (trimmed
— no spend/deploy keys)`, `launch opts: --dangerously-skip-permissions`; the go prints
`LAUNCHED step 23c detached: pid …`; log at `/Users/go/code/bnow-net-worktrees/logs/step23c.log`.

### 2.9 Confirm all three are running

**Where:** `/Users/go/code/bnow-net`.
**Requires:** §2.6–§2.8 each printed `LAUNCHED`.

```
cd /Users/go/code/bnow-net
scripts/launch/status.sh
```

**Expect:** rows 19, 23r, 23c each with a CLAIM and `SESSION pid:… run`; the lsof section lists
three `claude` processes with cwds `48h-ws3-conflict-20260905`, `48h-ws2-routing-20260905`,
`48h-audit-ws3-20260905`.

### 2.10 Monitor — every 20–30 minutes until each lane delivers

**Where:** `/Users/go/code/bnow-net`.
**Requires:** nothing beyond running sessions. Step 19 is the longest step in the program
(H22→H32 in the original schedule); the 23 lanes are shorter.

```
cd /Users/go/code/bnow-net
scripts/launch/status.sh
tail -5 /Users/go/code/bnow-net-worktrees/logs/step19.log
tail -5 /Users/go/code/bnow-net-worktrees/logs/step23r.log
tail -5 /Users/go/code/bnow-net-worktrees/logs/step23c.log
gh pr list --state open
```

**Expect / act on:** a lane is DELIVERED when `status.sh` shows its REPORT `yes` and a PR
number, and `gh pr list` shows the PR. A log line `AWAITING AUTHORIZATION: …` means an input
above was missing — fix it, then tell me; a relaunch needs the claim directory removed by hand
with a note in `/Users/go/code/bnow-net-worktrees/claims/launches.log`. Any other halt: read the
log, do not relaunch, tell me.

---

## 3. CP6 — merge queue for steps 19, 23c, 23r

Order: **whichever of 23c / 19 delivers first, then the other, then 23r.** Do not hold 23c for
19 — merge it the moment its session has exited, because step 19 checks `origin/main` before it
opens its observation-pipeline PR and consumes lane C's fixed module if it is there (its prompt,
item 8; `docs/reviews/REORDER-23C-19-ANALYSIS-2026-09-09.md`). If both are waiting at once, 23c
before 19. Lane C's `persistObservation` hunk is inside the function body and 19 only calls the
function, so neither order conflicts; 23r shares no file with either. Merge each PR only after
its delivering session has exited. Repeat card 3.1 → 3.3 per PR, then 3.4 once.

### 3.1 Fence and stack check — per PR

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** the PR's session has exited (its worktree no longer appears in `lsof`); you know
the PR number `<n>` and its head branch `<branch>` from `gh pr list`.

```
cd /Users/go/code/bnow-net
lsof -a -d cwd -c claude | grep bnow
git fetch --prune origin
gh pr view <n> --json baseRefName,headRefName,mergeable -q '[.baseRefName,.headRefName,.mergeable]'
```

**Expect:** `lsof` prints nothing for that worktree; `baseRefName` is `main`. If it is another
PR's branch, the PR is stacked — re-base it on GitHub first (CP5 incident: #82/#83 merged into
their stack bases and were re-landed as #85):

```
cd /Users/go/code/bnow-net
gh pr edit <n> --base main
gh pr view <n> --json baseRefName,mergeable -q '[.baseRefName,.mergeable]'
```

**Expect:** `main` and `MERGEABLE` (give GitHub ~30 s).

### 3.2 Conflict pre-check — per PR

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** 3.1 done for this PR; `<branch>` is its head branch name.

```
cd /Users/go/code/bnow-net
mb=$(git merge-base origin/main origin/<branch>); git merge-tree $mb origin/main origin/<branch> | grep -c '^+<<<<<<<'
```

**Expect:** `0` → merge as-is (3.3). Greater than 0 → rebase in the PR's OWN worktree (the one
named in §1 for that step) from the top of its stack with `--update-refs`, resolving only
PROGRESS / BLOCKERS / OPEN-TASKS / decision-log tails; any conflict in code, `drizzle/` or
`src/db/schema.ts` STOPS the queue — paste it to me.

### 3.3 Merge — per PR

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** 3.1 and 3.2 clean for this PR.

```
cd /Users/go/code/bnow-net
gh pr merge <n> --merge
git pull --ff-only
git log --oneline -1
```

**Expect:** a merge commit on `main`; record its SHA for the INDEX line.

### 3.4 Gate and record — once, after the last merge of the queue

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** 19, 23c and 23r merged and pulled (run it also after an early 23c merge if 19 is
still hours away — a green gate on `main` is what 19 rebases onto).

```
cd /Users/go/code/bnow-net
npm run typecheck && npm run lint && npm test
LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= DATABASE_URL=postgres://x:y@localhost/z npm run build
ls drizzle | tail -4
scripts/launch/status.sh
```

**Expect:** typecheck clean, lint 0 errors, unit count ≥ 4,332 (record before → after), build
PASS, and `ls drizzle | tail -4` = `0028_…`, `0029_runtime_logs…`, `0030_…`,
`9999_claim_source_trigger.sql` (no step in this queue may add a migration). Then paste me the
raw readings and I draft one docs commit: INDEX §10 CP6 line (merge SHAs, gate figures,
incidents), tracker §2 row 5.3 and §7 line. You commit it from `/Users/go/code/bnow-net` and
push.

---

## 4. Steps 24 and 25, and CP7

### 4.1 Launch step 24 — WS-3.5 scoreboard + soak prep

**Where:** run from `/Users/go/code/bnow-net`, branch `main`. Target worktree
`/Users/go/code/bnow-net-worktrees/48h-ws3-gazetteer-20260905`, lane branch
`48h/ws3-gazetteer-20260905` (reset to `origin/main` by the launcher). Unattended, Opus.
**Requires:** step 19's PR is merged on `main` (its report
`docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md` exists on `main`) — 23c/23r need not
be; the worktree holds the trimmed four-key `.env.local` (set by `scripts/launch/env-posture.sh`
— rerun it from `/Users/go/code/bnow-net` if unsure; it is idempotent); port 3000 is free (the
step builds and starts the app against a fork for the authz itest, with every spend key blanked
by the itest's own `serverEnv()`); the prompt already carries R.17 verbatim, C15's trigger and
the register's checklist items — nothing to paste.

```
cd /Users/go/code/bnow-net-worktrees/48h-ws3-gazetteer-20260905
git checkout -- package-lock.json 2>/dev/null; git status --short; npm ci --silent
lsof -ti :3000
cd /Users/go/code/bnow-net
export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'
scripts/launch/launch.sh 24
scripts/launch/launch.sh 24 --go
```

**Expect:** nothing from `git status --short` and nothing from `lsof -ti :3000`; the dry run
shows the `48h-ws3-gazetteer-20260905` path and `.env.local: present (trimmed — no spend/deploy
keys)`; the go prints `LAUNCHED step 24 detached: pid …`; log at
`/Users/go/code/bnow-net-worktrees/logs/step24.log`.

### 4.2 Merge step 24 (CP6b)

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** step 24's session has exited; its PR number `<n>` and head branch `<branch>` from
`gh pr list`. It touches `src/app/conflicts/**`, `src/integration/conflict-feature-off.itest.ts`
and docs; it must not add a migration or change `vercel.json`.

```
cd /Users/go/code/bnow-net
lsof -a -d cwd -c claude | grep 48h-ws3-gazetteer-20260905
git fetch --prune origin
gh pr view <n> --json baseRefName,headRefName,mergeable -q '[.baseRefName,.headRefName,.mergeable]'
mb=$(git merge-base origin/main origin/<branch>); git merge-tree $mb origin/main origin/<branch> | grep -c '^+<<<<<<<'
git diff origin/main...origin/<branch> --stat -- vercel.json drizzle src/db/schema.ts
gh pr merge <n> --merge
git pull --ff-only
npm run typecheck && npm run lint && npm test
LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= DATABASE_URL=postgres://x:y@localhost/z npm run build
```

**Expect:** `lsof` prints nothing; base `main` (else `gh pr edit <n> --base main` first);
conflict count `0` (else stop and paste); the `--stat` line prints nothing; gate green and
build PASS. Paste me the readings for the INDEX line.

### 4.3 Launch step 25 — docs sync

**Where:** run from `/Users/go/code/bnow-net`, branch `main`. Target worktree
`/Users/go/code/bnow-net-worktrees/48h-gov-20260905`, lane branch `48h/gov-20260905` (reset to
`origin/main` by the launcher). Unattended, **Sonnet** (per `scripts/launch/steps.tsv`).
**Requires:** steps 19, 23r, 23c and 24 all merged on `main`; `gh pr list --state open` empty;
the INDEX §10 CP6 line committed; the worktree holds no `.env.local` (env-posture.sh removes it
— rerun the script from `/Users/go/code/bnow-net` if unsure).

```
cd /Users/go/code/bnow-net-worktrees/48h-gov-20260905
git checkout -- package-lock.json 2>/dev/null; git status --short; npm ci --silent
ls .env.local
cd /Users/go/code/bnow-net
gh pr list --state open
export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'
scripts/launch/launch.sh 25
scripts/launch/launch.sh 25 --go
```

**Expect:** nothing from `git status --short`; `ls: .env.local: No such file or directory`;
`gh pr list` empty; the dry run shows the `48h-gov-20260905` path and `.env.local: absent`; the
go prints `LAUNCHED step 25 detached: pid …`; log at
`/Users/go/code/bnow-net-worktrees/logs/step25.log`.

### 4.4 Merge step 25 (CP7) and close Stage 3

**Where:** `/Users/go/code/bnow-net`, branch `main`.
**Requires:** step 25's session has exited; its PR `<n>` / `<branch>` from `gh pr list`. Docs
only — it must add no code.

```
cd /Users/go/code/bnow-net
lsof -a -d cwd -c claude | grep 48h-gov-20260905
git fetch --prune origin
gh pr view <n> --json baseRefName,headRefName,mergeable -q '[.baseRefName,.headRefName,.mergeable]'
mb=$(git merge-base origin/main origin/<branch>); git merge-tree $mb origin/main origin/<branch> | grep -c '^+<<<<<<<'
git diff origin/main...origin/<branch> --stat -- src scripts drizzle
gh pr merge <n> --merge
git pull --ff-only
npm run typecheck && npm run lint && npm test
wc -c AGENTS.md
gh pr list --state open
scripts/launch/status.sh
```

**Expect:** base `main`; conflict count `0` (a non-zero here is almost always the
`merge=union` tail on PROGRESS/OPEN-TASKS — rebase in `48h-gov-20260905` and retry); the
`--stat` line prints nothing; gate green; `AGENTS.md` under 150,000 bytes; no open PR; no live
claim. **Stage 3 is closed** when 18, 19, 20, 21, 23r, 23c, 24, 25, 32, 33, 34 are all merged
and the INDEX §10 carries CP5, CP6 and CP7 lines — paste me the readings and I draft the CP7
line and the tracker's 5.3 → DONE.

---

## 5. Stage 4 — the four never-run checks, assigned (plan §5.4)

| Check | Gap | Where it happens |
|---|---|---|
| Tree-wide `npm run build` at the frozen SHA | G4 | card 6.1, from `/Users/go/code/bnow-net` |
| Merge fidelity `git range-diff` for every merged PR | G12 | step 26's first task (in its prompt) |
| Read back actual Vercel env values in all three environments; `MAP_CONTENT_CHARS` absent | G3 | step 27, from the release clone, BEFORE any drain registration (in its prompt) |
| `runtime-logs.itest.ts` on a fork with 0029 + NUL / int4 / row-cap probes | G5 | **done by measurement in step 21**; step 23r inverts the three characterization cases |

One carry from CP5, folded into card 6.1: `hardening-cli.test.ts`'s verdict depends on the
runner's `.env.local`, so the unit suite must run once on the full-secret main checkout.

---

## 6. Stage 5 — freeze, final audit, deploy

### 6.1 Freeze

**Where:** `/Users/go/code/bnow-net`, branch `main`, native macOS terminal. This checkout holds
the full-secret `.env.local` — that is deliberate here (the CP5 carry above).
**Requires:** Stage 3 closed (card 4.4).

```
cd /Users/go/code/bnow-net
git status --porcelain
git fetch --prune origin
git log --oneline -1 origin/main
lsof -a -d cwd -c claude | grep bnow
npm run typecheck && npm run lint && npm test
LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= DATABASE_URL=postgres://x:y@localhost/z npm run build
git worktree prune && git worktree list
```

**Expect:** clean tree; `origin/main` = local `main` — that SHA is the **frozen SHA**; no live
session; gate green (record the unit count); build PASS; `git worktree list` shows no
`/sessions/` gitdir path and no `prunable` worktree. Then bind step 26's prompt to the SHA
(replace `<sha>` in the block with the frozen SHA before pasting):

```
cd /Users/go/code/bnow-net
sed -i '' 's/FROZEN-SHA-TBD/<sha>/' docs/prompts/2026-09-05-48h-26-final-audit.md
grep -n 'Freeze SHA' docs/prompts/2026-09-05-48h-26-final-audit.md
git add docs/prompts/2026-09-05-48h-26-final-audit.md
git commit -m 'docs: 48h freeze; step 26 prompt bound to the frozen SHA'
git push origin main
```

**Expect:** the `grep` line shows your SHA where `FROZEN-SHA-TBD` was; push green.

### 6.2 Launch step 26 — final audit (attended)

**Where:** run from `/Users/go/code/bnow-net`, branch `main`. Target worktree
`/Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905`, lane branch
`48h/audit-ws2-20260905` (reset to `origin/main` = the frozen SHA by the launcher). **Attended**;
model **Opus** (`scripts/launch/steps.tsv` row 26 — not Fable: step 18's register was authored
on Fable and step 17's was a Fable orchestration, and the final audit must not share a model
with the registers it re-refutes; if you want Fable for everything except the WS-3 items, write
that one sentence into the prompt's binding block (1) before launching). $0, read-only, no
`.env.local` (env-posture.sh removes it).
**Requires:** card 6.1 done and the bound prompt pushed.

```
cd /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905
git checkout -- package-lock.json 2>/dev/null; git status --short; npm ci --silent
ls .env.local
cd /Users/go/code/bnow-net
scripts/launch/launch.sh 26
scripts/launch/launch.sh 26 --go
```

**Expect:** nothing from `git status --short`; `ls: .env.local: No such file or directory`; the
`--go` claims, resets the lane to the frozen SHA and PRINTS a command of the form
`cd '/Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905' && caffeinate -ims claude --model 'opus'`
— it starts nothing itself. Run that printed command in a terminal you watch; when the session
is up, paste the contents of
`/Users/go/code/bnow-net/docs/prompts/2026-09-05-48h-26-final-audit.md`. Bounded fan-out is in
the prompt: three refuters per major, one batched verification per PR for minors and notes, one
completeness critic — if the session proposes more, stop it.

### 6.3 Step 27 — the deploy (operator)

**Where:** the release clone `/Users/go/code/bnow-net-rel-20260823` for every production
action; `/Users/go/code/bnow-net` only to read the audit.
**Requires:** step 26's report `docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` on `main`
with its per-PR verdict table; `docs/prompts/2026-09-05-48h-27-operator-deploy.md` read end to
end — its 2026-09-09 block carries everything below in full. In short: **first** refresh
`DATABASE_URL` and `DATABASE_URL_UNPOOLED` in `/Users/go/code/bnow-net-rel-20260823/.env.local`
and `/Users/go/code/bnow-net/.env.local` from the Neon console (the local values carry the
pre-rotation password; `db:migrate` targets production through them) and prove it read-only;
**then** the one hard ordering (A2 (b), signed): Neon backup branch → `npm run db:migrate` from
the release clone (0028, 0029, 0030) → deploy the receiver → `LOG_DRAIN_SECRET` in Production
before the deploy that reads it → register the drain → `npx tsx scripts/audit-cron.ts`; the
Vercel env read-back in all three environments with `MAP_CONTENT_CHARS`, `DIGEST_PROVIDER` and
`ANTHROPIC_API_KEY` expected absent (the Anthropic digest path stays dormant); deploy only PRs
the audit marks `go`.

```
cd /Users/go/code/bnow-net-rel-20260823
git fetch --prune origin
git checkout main
git pull --ff-only
git log --oneline -1
npx tsx scripts/sqlq.ts "SELECT 1"
```

**Expect:** the release clone at the frozen SHA (or the audit's docs commit after it), and
`SELECT 1` returning a row — proof the refreshed DSN authenticates. If it prints
`password authentication failed`, the refresh has not happened; stop before any migration.

---

## 7. Rules that bind every launch (learned the expensive way)

- **Never launch by pasting a prompt into a terminal.** Every launch is
  `scripts/launch/launch.sh <step> --go` from `/Users/go/code/bnow-net`; the claim directory
  under `/Users/go/code/bnow-net-worktrees/claims/` is the record.
- **`export CLAUDE_LAUNCH_OPTS='--dangerously-skip-permissions'` in the launching shell,
  every time** — a detached session without it reads and exits with no PR (four did on
  2026-09-08). The launcher refuses; do not work around the refusal.
- **Before merging any PR whose GitHub base is not `main`: `gh pr edit <n> --base main`.**
- **`lsof -a -d cwd -c claude | grep bnow` before any checkout, reset, launch or merge** touching
  a worktree; one session per worktree; a launch list is consumed once.
- **`.env.local` posture is set only by `scripts/launch/env-posture.sh`** — never by hand; it
  is idempotent, run it whenever in doubt.
- **Any conflict in code, `drizzle/` or `src/db/schema.ts` stops a merge queue.**
- **A `--dry` C5 figure is not evidence until WS3-F02 lands; a `probe_failed` day is
  "indeterminate", never "did not publish"** (WS3-F01, OPEN-TASKS #114).
- **A fork-bound `next build && next start` runs with every spend key blank and
  `LLM_DISABLE=1`** (COMMON §4.8).

---

## 8. Decisions that are yours, in one place

| # | Decision | Where it lands | Default if you say nothing |
|---|---|---|---|
| 1 | D-a … D-f (six WS-3 register questions) | `AGENTS.md` decision log, card 2.1 | the drafted entry (recommended options; D-d → lane C) |
| 2 | The step-23 marks | `docs/prompts/2026-09-05-48h-23-remediate-audits.md` §1, card 2.2 | as tabled |
| 3 | 23c in `48h-audit-ws3-20260905` alongside 19 (vs. after 19 in `48h-ws3-conflict-20260905`) | `scripts/launch/steps.tsv` row 23c | parallel; revert = one TSV cell + the D-d sentence |
| 4 | Step 26 model | `scripts/launch/steps.tsv` row 26 + its prompt (1) | Opus |
| 5 | Neon branch `itest-1788469162388` (`br-weathered-forest-atmfaetu`) | nothing until closeout | keep (A6) |
| 6 | `.env.local` DSN refresh (pre-rotation password) | card 6.3, before any local script targets production | do it at 6.3 |

---

## 9. What the 2026-09-09 prep changed (docs + launcher; $0; no code under `src/`; no launch)

- **New:** this file; `docs/prompts/2026-09-09-48h-sign-Da-Df.md` (drafted decision entry);
  `scripts/launch/env-posture.sh` (one-pass `.env.local` posture for all 14 worktrees).
- **`scripts/launch/launch.sh`:** every `claude` it starts or prints is wrapped in
  `caffeinate -ims`.
- **`scripts/launch/steps.tsv`:** 23c worktree → `48h-audit-ws3-20260905`; 26 model → `opus`;
  gate notes for 19, 23r, 23c, 24, 25, 26 rewritten to the current gates.
- **Rewritten:** `docs/prompts/2026-09-05-48h-23-remediate-audits.md` — from the 09-05 sketch
  to a full two-lane prompt (lane by worktree; binding facts at `f55534e`; marks tables with
  the PENDING confirmation line; step 20's closures F16/F17; step 21's G5 inversion handoff
  with the measured 5,461/5,462 boundary; #110/#112/#114/#116; #119 as the DEFER bundle; the
  six WS-3 decisions by id; the stack-PR rule).
- **Binding blocks appended:** step 19 (items 6–10); step 24 (gate, C10/C11, C15's trigger,
  register checklist, R.17 verbatim); step 25 (done-list, three work-order lists, facts standing
  text must say, OPEN-TASKS lines, disclosures); step 26 (Opus, `FROZEN-SHA-TBD`, merged-PR list
  with SHAs, range-diff first, G-gaps, hardening-cli carry, two eval-plane writers, dormant
  Anthropic path); step 27 (DSN refresh, A2 ordering, G3 list, code-ahead facts).
- **Tracker** `docs/prompts/2026-09-08-48h-CP4-status-tracker.md`: §1 points here; §6 Stage 3
  sheet marked superseded; §7 line.
- **Later on 2026-09-09:** `docs/reviews/REORDER-23C-19-ANALYSIS-2026-09-09.md` (should 23c
  run before 19?) — answer: adaptive shape; step 19 item 8 rewritten (PR 1 first, branch A/B
  check at PR 2), step 23's WS3-F04 row and CP6 order flipped to "whichever delivers first",
  D-d's clause, `steps.tsv` rows 19/23c.
- **Not changed:** INDEX §10 (operator-written), any file under `src/`, any `.env.local`, any
  worktree.
