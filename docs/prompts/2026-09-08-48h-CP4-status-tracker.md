# CP4 completion plan — status tracker (2026-09-08)

**What this file is.** A one-page, fact-only tracker for
`docs/prompts/2026-09-07-48h-CP4-and-completion-plan.md` §5. It exists because yesterday's
sessions lost track of which stage was live and worked on unassigned stages. It records, per
stage, exactly three things: the state, the evidence in the repo that proves it, and what (if
anything) is still owed. It authorizes nothing and adds no work of its own.

**Rules for any session reading this.**

1. Work only on **the current step** named in §1. Do not start the next stage until the current
   stage's gate is checked off in this file and the check is backed by a repo fact.
2. Every "done" needs a commit SHA, a file:line, or verbatim command output. No "done" from
   memory, from another session's chat, or from a prompt file's expectations.
3. If a check needs the Mac (`gh`, `npm`, Neon, Vercel, spend), stop and hand it to the
   operator with the exact command. Do not assume the result.
4. Update this file **before** moving on, then commit it with the work it records.

Verified against: `main` = `origin/main` = `d7a5e40`, tree clean, 2026-09-08 09:34–10:15 ET.
Open PRs (operator `gh pr list`, 09:34 ET): **#48**, **#47** — nothing else.

---

## 1. Where we are — read this first

**Current step: Stage 2 (§5.2), item 4 — the WS-1.1 ×3 capture run.** Operator-only (it
spends, ≈$0.01). Procedure: `docs/prompts/2026-09-07-48h-stage2-operator-runs.md` §4; an
agent-shaped version is at `Claude outputs/2026-09-07-stage2-item4-capture-run-agent-prompt.md`.

**Next step after that: Stage 2 item 5** — #48 squash-relaunch, then #47 merge. Operator-only
(`gh` + history rewrite). Procedure: same file, §5. Item 5 does not depend on item 4; the two
may be done in either order, but each is closed separately below.

**Stage 2 closes when the §5.2 gate (§3 below) has all four boxes ticked with evidence.**
Nothing in Stage 2a, 3, 4 or 5 starts before that.

---

## 2. Stage-by-stage status

| Stage | State | Gate met? |
|---|---|---|
| 5.0 Stage 0 — housekeeping | **DONE** | yes |
| 5.1 Stage 1 — CP4 merge queue | **DONE** | yes |
| 5.2 Stage 2 — operator runs | **IN PROGRESS** — items 1, 2, 3 done; items 4, 5 open | no |
| 5.2a Stage 2a — D7/R4 measured remap | **NOT STARTED** (unblocked: D7 is signed) | no |
| 5.3 Stage 3 — build steps 18–34 | **NOT STARTED** | no |
| 5.4 Stage 4 — review gates / four never-run checks | **NOT STARTED** (one hazard pre-filed, #112) | no |
| 5.5 Stage 5 — freeze, final audit, deploy | **NOT STARTED** (pre-deploy facts pre-filed, #111) | no |
| §6 detached sessions | **RESOLVED** | yes |

### 5.0 Stage 0 — DONE

- `origin/main` pushed: local `main` = `origin/main` (both `d7a5e40` today; `f6eca71` was the
  Stage 0 target and is an ancestor).
- #51 closed: recorded in INDEX §10, 2026-09-07 12:45–13:20 ET entry ("**#51 closed** (its tip
  is an ancestor of `main`…)"); `gh pr list` today shows no #51.
- Gate "open-PR list = #74, #71, #70, #48, #47" was true at the time; #74/#70/#71 have since
  merged in Stage 1.

### 5.1 Stage 1 — DONE

- Merges on `main`: **#74** `0924ed9`, **#70** `72da938`, **#71** `5f30cd3`; register bullet
  correction `8cf78ba` ((f4)) landed before #74 merged.
- Gate (INDEX §10, same entry): typecheck clean · lint 0 errors / 3 pre-existing warnings ·
  unit **4,015/267 → 4,082/270** · `npm run build` **PASS twice** (baseline `a512fc8`, post-merge
  `5f30cd3`) — register gap G4 closed.
- Closing docs commit: `08facaf` — INDEX §10 CP4 line, which also records the four unlogged
  2026-09-07 operator actions (`a5caeb7`, `3f09757`, `901078a`, Stage 0).
- WS2-F06 OPEN-TASKS entry filed as **#110** (`grep -c WS2-F06 docs/OPEN-TASKS.md` = 1).

### 5.2 Stage 2 — IN PROGRESS

**Item 1 — sign (f1)–(f15): DONE.** Commit `1642971` (2026-09-07 17:05 ET). Evidence:
`grep -c UNSIGNED AGENTS.md` = **0**; the D7 entry is at `AGENTS.md:1312`
("2026-09-07 (D7 — measured WS-2.3 remap run authorized on a disposable fork)"); `AGENTS.md` =
129,376 chars, under the 150k ceiling. Entries sit at the end of `## Decision log` per the
step-15 convention.

**Item 2 — #79 RU citation drain: DONE, fully recorded.**
- Execution entry: `AGENTS.md:1468` ("OPEN-TASKS #79 — RU ROCA citation registry drain —
  EXECUTED"), commit `61e970d`. Counts: pending 36 → 0; parsed 1,562 → 1,598; 5,421 citations
  inserted; 98 new sources; `ru` stats 7,068/0.571 → 7,174/0.572; cited-but-zero-count = 0.
- Backup branch `br-wispy-silence-atgxus3y` — entry states deleted **2026-09-07T21:28:43Z**,
  verified absent 2026-09-08 (`06b5c57` replaced the `17:XX` placeholder).
- Carry-backs: runbook §5 `||` claim corrected (`RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md:96`,
  "CORRECTED 2026-09-07"); OPEN-TASKS **#80** annotated (`docs/OPEN-TASKS.md:833ff`); the 26
  legacy `failed` reports filed as **#113** (`docs/OPEN-TASKS.md:1953`). Commit `982eedc`.

**Item 3 — C5-m probes: DONE 2026-09-08 (commit `39d572f`). C5-m is answered.**
- Window 2026-02-28 → 2026-03-22 (set by §0.3's production queries, recorded in the item-3
  prompt §0.6). Three passes on a migrated disposable fork `br-cold-fog-atmcvp28` (deleted
  14:50:43Z, verified absent). $0, zero production writes, production re-verified after.
- **The reading (pass 1, `C5M-PROBES-2026-09-07.md:731`): `iran_update` multiEditionDays 8,
  anchorNotFinalDays 1** — 2026-03-05, `isw_reports` anchored on the morning edition, daily-final
  is evening (1 of 8, lower bound; 2026-03-10 is the named unresolved day). `roca` 0/0 by
  construction (one candidate URL). Pass 2: `publicationGapDays` 0 on both — (f14)/C15's
  reopening trigger still not exercised, and on this host it is close to structural.
- **Step 24's handoff text is R.17** of that report (`C5M-PROBES-2026-09-07.md:1061`). It
  supersedes every August number. The 2026-09-07 "real pages still served 200" mitigation is
  **corrected** by R.10: three identical `roca` passes gave publishedDays 6 → 6 → 13, so the 403
  state suppresses real pages too.
- Records: report sections R.1–R.18; OPEN-TASKS **#114** filed (the `isCleanNotFound`/403
  conflation — closes §4a's first half); #111 confirmation line; PROGRESS plan + execution
  blocks. Decision-log entry drafted in **R.16, not applied** (write-lock) — owed to step 25 or
  to a Stage 2 closing docs commit. Launch claim taken (`claims/step-s2i3-c5m/`).
- The earlier August pass-0 record stands as the literal-(f8) record.

**Item 4 — WS-1.1 ×3 capture run: NOT DONE.** `docs/reviews/EVAL-EXPOSURE-LEDGER.md`'s last
entry is "2026-09-06 — concurrent-main rebase closeout"; there is no capture-run entry, no
`--capture-reconcile` output recorded. **← CURRENT STEP.**

**Item 5 — #48 squash-relaunch, then #47: NOT DONE.** `gh pr list` (09:34 ET) shows both;
`origin/docs/operator-notes-20260905` is 2 commits ahead (`d96c8f7`, `7a6d629` — the latter is
the roster add-commit that must never reach `main`), `origin/docs/land-aug17-branches-20260905`
is 2 ahead (`2ae5e55`, `793b5c8`). Recipe: stage-2 doc §5.1–§5.3.

### 5.2a Stage 2a — NOT STARTED (unblocked)

- Blocker cleared: D7 is signed (`AGENTS.md:1312`); `--base-ack` guard on `main`.
- No closing note exists: `MAP-REMAP-RUNBOOK-2026-09-06.md` ends at §18 and contains no
  2026-09-08 line. Fork not created. Vercel `MAP_CONTENT_CHARS` before/after checks not run.
- Binding values when it runs: `--budget 1.00 --limit 1000`; caps `T + 1.00` / `D + 1.00` read
  off the fork's copied ledger on the day (never a literal 10); `MAP_CONTENT_CHARS=1499` on the
  fork-bound server only. Attended, in `48h-ws2-remap-20260905`.

### 5.3 Stage 3 — NOT STARTED

`docs/PROGRESS.md` carries no planned block for steps 18, 19, 20, 21, 23, 24, 25, 32, 33 or 34
(newest block is the Stage 2 item 3 block, line 4463). No Stage 3 worktree has moved past its
CP-era tip. Row A (20, 32, 33, 21) is technically launchable; per this tracker's rule 1 it is
not launched until Stage 2's gate is ticked.

### 5.4 Stage 4 — NOT STARTED

Not applicable until Stage 3 merges exist. Pre-filed input: OPEN-TASKS **#112** (`env -u`
does not protect a script that imports `./env`; the prescriptive `env -u DATABASE_URL_UNPOOLED`
sites were corrected in `6d7438d`; proposed `migrate.ts` boundary guard belongs to step 23).

### 5.5 Stage 5 — NOT STARTED

Pre-filed input: OPEN-TASKS **#111** (0028/0029/0030 on `main`, unapplied to production —
production twice-verified at 29 migration rows / four new tables `to_regclass` NULL; the D10
log text vs file-name numbering inversion). Step 27's hard ordering constraint stands: migrate
before any drain registration.

### §6 detached sessions — RESOLVED

Operator `lsof` clean 2026-09-07; re-confirmed by the 2026-09-08 FINISH session (sole process).
Re-run `lsof -a -d cwd -c claude | grep bnow` immediately before any Stage 3 launch.

---

## 3. The Stage 2 gate (from the plan §5.2 and the stage-2 doc §6) — tick with evidence

```
[x] Decision log carries the #79 drain execution entry with counts, branchId, and an explicit
    deleted statement                     — AGENTS.md:1468, 61e970d + 06b5c57
[ ] EVAL-EXPOSURE-LEDGER.md carries a capture-run entry with counts     — item 4, open
[x] Both C5-m outputs in hand, verbatim   — C5M-PROBES-2026-09-07.md R.7/R.8 (39d572f); handoff = R.17
[ ] gh pr list shows neither #47 nor #48                                — item 5, open
[x] (recommended) (f1)–(f15) signed, 0 UNSIGNED markers                 — 1642971
```

---

## 4. Owed but unassigned — small items that must not be forgotten

| # | Item | Owner | When |
|---|---|---|---|
| a | ~~Route the `isCleanNotFound` finding~~ **DONE** — OPEN-TASKS #114 (`39d572f`). Still to add: one line in step 18's prompt naming #114 and `C5M-PROBES-2026-09-07.md` R.10; step 23 owns R.15's decision 1 (split 403 out of `probe_failed`, recommendation (b)) | session, $0 docs | before Stage 3 row B launches |
| a2 | **File the June-2025 suffix slug shape** (`…-june-14-2025-{morning,evening}-edition/`, 11 days, neither generated by `run.ts:31-41` nor parsed by `editions.ts:73`; a backfill over 2025-06-12→06-24 manufactures phantom gaps). Next free OPEN-TASKS number is **115**; item 5's renumbered #47 entry then takes 116 (or the reverse, whichever lands first) | session, $0 docs | before Stage 3 row B |
| b | Step 24's prompt must carry **R.17 verbatim** (`C5M-PROBES-2026-09-07.md:1061-1105`), not the 2026-09-07 August text | session, when step 24's prompt is prepared | Stage 3 row C |
| c | Neon branch `itest-1788469162388` = `br-weathered-forest-atmfaetu`, alive since 2026-09-03. R.15 item 3 asks whether to delete it as an orphan. **Do NOT delete** until item 4 step 4.1 has checked its `provider_usage` ledger — it is the probable kept evaluation branch (A6 "keep until closeout"; D6 addendum ≈$0.15 on `openai_eval`). If 4.1 finds no `openai_eval` row, it is an orphan and may go. | operator, via item 4 | item 4 |
| d | `roca` C5-m multi-edition figure is 0 by construction (one candidate URL) — never cite it as evidence about ISW | note only | step 24 |
| e | R.16's drafted decision-log entry for the C5-m result — apply at end of `## Decision log` in date order | operator or step 25 | Stage 2 close / step 25 |
| f | §4.1 dry-path finality defect (`DiscoveredEdition` has no `identity`; `--dry` substitutes probe order, `edition-discovery.ts:502-503`) — latent here (pass 0 = pass 1 on all 23 days), still a step 18 register / step 23 fix item | session | Stage 3 rows B/C |

## 5. What the 2026-09-07 FINISH prompt touched, mapped to plan sections

Executed 2026-09-08 ≈07:19 ET without full operator review. Verified afterwards against the
repo (five commits `982eedc`…`d7a5e40`, all docs-only, no production write, no spend).

| Plan section | What it did | Recorded? |
|---|---|---|
| 5.2 item 2 | Corrected the runbook `||` claim; annotated #80; filed #113; resolved the `17:XX` placeholder | yes — `982eedc`, `06b5c57` |
| 5.2 item 3 | Re-ran `iran_update` on a migrated disposable fork (`br-flat-butterfly-at7vohpt`, deleted 11:17:44Z); result byte-identical (124/79); diagnosed 403 mechanism | yes — `d7a5e40`, C5M report |
| 5.2 (stage-2 doc §3.1) | Corrected the `env -u` idiom in the two prompt files | yes — `6d7438d` |
| 5.3 (step 18/23/24 inputs) | Produced the `isCleanNotFound` finding and the (f14) non-exercise reading | **partial** — probe docs only; see §4a/§4b |
| 5.4 | Filed #112 (hazard) | yes |
| 5.5 | Filed #111 (pre-deploy facts) | yes |
| 5.2 items 4, 5 | Correctly stopped; not attempted | n/a |

It did not touch Stage 2a, did not launch any Stage 3 step, and did not deploy.

---

## 6. Runsheets for the open Stage 2 items (Mac, native terminal, one item at a time)

### Q1 — DECIDED 2026-09-08 10:25 ET: option (a); queries run; window found

§0.3's queries returned rows: split editions in 2025-06-14→06-24 (suffix slug form, **not
generatable by current code** — `run.ts:31-41`, `editions.ts:73`) and **2026-02-28→03-22**
(prefix form, measurable). The item-3 prompt now carries this as §0.6, supersedes its §0.5,
amends its §8 halt line, and its §9 paste block pins the window. Item 3's remaining work is one
attended, single-session run of that prompt (pass 0/1/2 on a fork, $0). New finding to route:
the June-2025 suffix slug shape → OPEN-TASKS, alongside the `isCleanNotFound` item (§4a).

#### (superseded text follows)

The paste block *"Read `…stage2-item3-c5m-probes.md` and execute it end to end … starting with
§0"* is **item 3 only**. It says nothing about items 4 or 5. Item 3's plan gate is already met by
pass 0. What that prompt would add is §0's two window-selection queries (2 min, $0, read-only on
production) and, only if they return rows, a new fork with passes 0/1/2 on the month they name
(~15–30 min, $0). Options: **(a)** run §0's two queries only, and let their answer decide
whether anything more is warranted — the prompt itself says "no rows → record the sentence and
stop"; **(b)** declare item 3 closed on the August pass-0 evidence and hand step 24 "no
denominator in the window measured; §0 window selection not performed". Either is a legitimate
close; pick one and log it in §7.

### Item 4 — WS-1.1 ×3 capture run (≈$0.01, operator only)

Source: stage-2 doc §4; run card `INJECTION-CASES-DEV-2026-09-05.md` §"Step 10 — operator-only
run card". **Cap discrepancy to resolve first:** the run card says `LLM_SPRINT_USD_CAP=0.50`,
the stage-2 doc and the CP4 plan say **$2.00 (D6/E15)**. The plan is later and cites the signed
entry; use **2.00** unless you decide otherwise, and record which you used in the ledger.

```
[ ] 4.0  cd /Users/go/code/bnow-net && git status --porcelain   (expect empty)
         git fetch --prune origin && git log --oneline -1 origin/main   (expect d7a5e40 or later, = main)
         lsof -a -d cwd -c claude | grep bnow                            (expect nothing)
[ ] 4.1  Identify the KEPT EVALUATION BRANCH. Its id is not in git. Candidate: `itest-1788469162388`
         (created 2026-09-03 20:59 UTC = the paid campaign day). List branches from the Mac:
           npx tsx -e 'import "./scripts/env"; fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/branches`,{headers:{Authorization:`Bearer ${process.env.NEON_API_KEY}`}}).then(r=>r.json()).then(j=>{for(const b of j.branches)console.log(b.id,b.name,b.created_at,b.default?"DEFAULT":"")})'
         Then get that branch's host (Neon console → branch → endpoint host; or add `/endpoints`
         to the same API path) and, with EVAL_DATABASE_URL pointed at it, confirm the ledger:
           DATABASE_URL="$EVAL_DATABASE_URL" npx tsx scripts/sqlq.ts "SELECT provider, sum(est_usd) FROM provider_usage GROUP BY 1"
         Expect an `openai_eval` row ≈ $0.15. If no such branch exists or the row is absent,
         STOP and say so — D6's cap arithmetic assumes that ≈$0.15; a fresh fork is a
         different (and un-authorized-as-written) shape. Record host + before-total; never the
         connection string.
[ ] 4.2  In the same shell, set (privately):
           export EVAL_DATABASE_URL='<kept-evaluation-branch-URL>'
           export EVAL_CAPTURE_DIR='/Users/go/code/bnow-net-injection-dev-20260908-capture'
           export EVAL_CAPTURE_RAW=1
           unset EVAL_CAPTURE_RAW_HELDOUT
           export EVAL_USD_CAP_DAILY=2
           export LLM_SPRINT_USD_CAP=2.00
         Never put these in Vercel. Capture dir is new and outside the repo.
[ ] 4.3  Decide NOW, and write down, whether you take the baseline cell or the
         `--capacity map-depth-full` cell (18 calls / $0.0064 vs $0.0112). If depth-full, add the
         flag to ALL THREE commands. Default: baseline.
[ ] 4.4  npx tsx scripts/analysis-eval.ts --estimate --workload map --model gpt-4o-mini \
           --dataset map-inj-dev-v1 --dev --repetitions 3
         Expect ≈ 18 calls / $0.0064. If materially different → STOP, do not run 4.5.
[ ] 4.5  npx tsx scripts/analysis-eval.ts --execute-live --workload map --model gpt-4o-mini \
           --dataset map-inj-dev-v1 --dev --repetitions 3 --db-ack <branch-host>
         (--db-ack must name the branch host exactly; preflight refuses production.)
         A cap hit is a STOP — do not raise the cap or reset the ledger.
[ ] 4.6  npx tsx scripts/analysis-eval.ts --capture-reconcile --workload map --model gpt-4o-mini \
           --dataset map-inj-dev-v1 --out /tmp/injection-dev-reconciliation.md
         Run this BEFORE reading any raw answer. Compare response/meter totals and USD to the
         branch's openai_eval row (after-total). Note unresolved/abandoned/orphan counts; keep them.
[ ] 4.7  Append the ledger entry to docs/reviews/EVAL-EXPOSURE-LEDGER.md — every field the run
         card's template names (date/time · operator/model · step 10 + D6 · files read / not read ·
         exact commands, profile, commit, dataset hash, branch host · heldout IDs seen (none) ·
         EVAL_CAPTURE_DIR, dev raw on, heldout raw off · est. vs actual requests and USD ·
         before/after own-row totals · reservations/responses/metered/abandoned/unresolved · 6 cases
         × 3 reps with row-005 "payload not fed" labeled · reconciliation path + capture hashes ·
         result, counts only — scope dev CANNOT verdict). No secrets, no raw source content.
[ ] 4.8  Matching decision-log line at the END of `## Decision log` in AGENTS.md (date order):
         "2026-09-08 (step 10 item 3 — WS-1.1 ×3 capture run EXECUTED)" with the counts.
[ ] 4.9  git add docs/reviews/EVAL-EXPOSURE-LEDGER.md AGENTS.md docs/prompts/2026-09-08-48h-CP4-status-tracker.md
         git commit -m 'docs: WS-1.1 x3 capture run - exposure ledger entry'
         git push origin main      (pre-push gate runs: typecheck + lint + test)
[ ] 4.10 Tick the ledger box in §3 of this file with the commit SHA; add a §7 line.
```

### Item 5 — #48 squash-relaunch, then #47 — REVISED 2026-09-08 (conflicts found)

**Why the stage-2 doc §5 recipe does not work as written.** Both PRs branch from `883e5e3`
(2026-09-04) and both modify `AGENTS.md`; step 15's compaction (`3f09757`, 2026-09-07)
restructured that file. `git merge-tree $(git merge-base main <br>) main <br>` → **#48: 2
conflict hunks (AGENTS.md); #47: 3 conflict hunks (AGENTS.md, docs/OPEN-TASKS.md,
docs/HUMAN-SETUP-TODO.md)**. `AGENTS.md` is not under the `merge=union` driver. So
`git merge --squash` halts on conflicts and GitHub refuses `gh pr merge`. Two further facts:
#47's new OPEN-TASKS item is numbered **108**, already taken on `main`; and both PRs' decision
entries (dated 2026-09-05) must be placed at the end of the 2026-09-05 run in `## Decision log`
— i.e. after the "48-hour execution program authorized" entry and before the first 2026-09-06
entry (`AGENTS.md:892` today) — never at EOF.

**Resolution rule for every conflict hunk: take `main` (`--ours` inside a squash merge), then
hand-add only the branch's genuinely new content, listed per PR below.** Native terminal only.

```
[ ] 5.0  cd /Users/go/code/bnow-net && git status --porcelain (empty) && git fetch --prune origin
         lsof -a -d cwd -c claude | grep bnow            (expect nothing)
         Keep the roster OUTSIDE git first:
           mkdir -p ~/operator-notes && git show origin/docs/operator-notes-20260905:docs/OUTREACH-ROSTER-2026-08-23.md > ~/operator-notes/OUTREACH-ROSTER-2026-08-23.md
         Extract the two decision entries you will re-insert by hand:
           git show origin/docs/operator-notes-20260905:AGENTS.md | awk '/^- \*\*2026-09-05 \(worktree estate cleanup/{f=1} f&&/^## /{exit} f' > /tmp/entry-48.md      (79 lines)
           git show origin/docs/land-aug17-branches-20260905:AGENTS.md | awk '/^- \*\*2026-09-05 \(2026-08-17 local-model/{f=1} f' > /tmp/entry-47.md   (31 lines)
           git show origin/docs/land-aug17-branches-20260905:docs/OPEN-TASKS.md | awk '/^### New \(from the 2026-09-05 worktree cleanup\)/{f=1} f' > /tmp/ot-47.md
         Skim all three: they are 2026-09-05 operator-era text; confirm nothing in them is now false.

---- #48 ----
[ ] 5.1  git worktree add /tmp/pr48-squash -b docs/operator-notes-20260905-squash origin/main
         cd /tmp/pr48-squash
         git merge --squash origin/docs/operator-notes-20260905        # WILL report conflict in AGENTS.md
         git checkout --ours AGENTS.md && git add AGENTS.md            # main's structure wins
         git rm -f docs/OUTREACH-ROSTER-2026-08-23.md                  # D1
         git status --short                                            # no U entries; roster absent
[ ] 5.2  Hand-add #48's two pieces of real content to AGENTS.md:
         (a) the decision entry: insert /tmp/entry-48.md immediately BEFORE the first line
             matching `^- \*\*2026-09-06` (blank line before and after it). Check:
               grep -n "^- \*\*2026-09-05 (worktree estate cleanup" AGENTS.md   → one hit, < the 2026-09-06 line
         (b) `## Conventions` already carries a worktree bullet on main (the remote-mount rule);
             the branch's extra sentence is "one per PR … REMOVED (`git worktree remove`) in the
             same session that merges its PR" — append that as ONE more bullet under
             `## Conventions`. Do not re-add the branch's copy of the whole tail.
         (c) AGENTS.md:143 says "#47 … and #48 … are open" — leave it; step 25 docs-sync owns
             snapshot text (note it in the commit message instead).
         wc -c AGENTS.md                                                # expect ≈ 135k, < 150,000
         git diff --cached --stat | tail -3 ; git diff --stat          # only the intended files
[ ] 5.3  git add AGENTS.md
         git commit -m 'docs: operator notes and 2026-09-05 cleanup record (squashed onto post-CP4 main; roster removed per D1)'
         git push --force-with-lease origin HEAD:docs/operator-notes-20260905
         git ls-tree -r --name-only origin/docs/operator-notes-20260905 | grep -i outreach     # expect NO output; if any → STOP
[ ] 5.4  cd /Users/go/code/bnow-net
         gh pr view 48 --json mergeable -q .mergeable       # expect MERGEABLE (give GitHub ~30 s)
         gh pr merge 48 --merge
         git pull --ff-only
         git push origin --delete docs/operator-notes-20260905
         git worktree remove --force /tmp/pr48-squash && git branch -D docs/operator-notes-20260905-squash

---- #47 ----
[ ] 5.5  git worktree add /tmp/pr47-squash -b docs/land-aug17-branches-20260905-squash origin/main
         cd /tmp/pr47-squash
         git merge --squash origin/docs/land-aug17-branches-20260905   # conflicts: AGENTS.md, docs/OPEN-TASKS.md, docs/HUMAN-SETUP-TODO.md
         git checkout --ours AGENTS.md docs/OPEN-TASKS.md docs/HUMAN-SETUP-TODO.md
         git add AGENTS.md docs/OPEN-TASKS.md docs/HUMAN-SETUP-TODO.md
         git status --short | grep '^U'                                # expect nothing
         (Everything else in the PR — 19 new eval/design files, the reconciliation report, the
          business-doc hunks main never touched — auto-merged and stays staged. HUMAN-SETUP-TODO's
          branch rewrite is dropped: the branch's own rule was "main wins on shared docs".)
[ ] 5.6  Hand-add #47's real content:
         (a) insert /tmp/entry-47.md BEFORE the first `^- \*\*2026-09-06` line in AGENTS.md
             (i.e. right after the #48 entry you placed in 5.2 — same 2026-09-05 run).
         (b) append /tmp/ot-47.md to the end of docs/OPEN-TASKS.md, RENUMBERED: `108.` →
             the next free number (`grep -n "^11[0-9]\. " docs/OPEN-TASKS.md | tail -1` — 113 today, so
             114 unless something landed first). Fix any "#108" self-reference inside the text.
         wc -c AGENTS.md                                                # < 150,000
[ ] 5.7  git add AGENTS.md docs/OPEN-TASKS.md
         git commit -m 'docs: land two preserved 2026-08-17 branches (squashed onto post-CP4 main; harness item renumbered)'
         git push --force-with-lease origin HEAD:docs/land-aug17-branches-20260905
         cd /Users/go/code/bnow-net
         gh pr view 47 --json mergeable -q .mergeable       # expect MERGEABLE
         gh pr merge 47 --merge
         git pull --ff-only
         git push origin --delete docs/land-aug17-branches-20260905
         git worktree remove --force /tmp/pr47-squash && git branch -D docs/land-aug17-branches-20260905-squash

---- close ----
[ ] 5.8  gh pr list --state open                                       # expect EMPTY
         npm run typecheck && npm run lint && npm test                  # docs-only, but the gate is the gate
         bash scripts/check-decision-log-move.sh                        # do NOT run — archive-pass check; an append fails it by design
[ ] 5.9  One line at the END of `## Decision log` (a 2026-09-08 entry goes after every 09-07 entry):
         "2026-09-08 (#48 re-landed squashed per D1; #47 landed) — the outreach roster now lives in
          operator notes outside git; both PRs' 2026-09-05 entries were re-placed in date order under
          the post-step-15 convention; #47's OPEN-TASKS item renumbered 108 → <n>."
         git add AGENTS.md docs/prompts/2026-09-08-48h-CP4-status-tracker.md
         git commit -m 'docs: stage 2 item 5 closed; #47/#48 landed'
         git push origin main
[ ] 5.10 Tick the gh-pr-list box in §3 with both merge SHAs; §7 log line.
```

**Halt conditions:** any `U` left in `git status` after the `--ours` step; the roster grep in
5.3 printing anything; `wc -c AGENTS.md` ≥ 150,000; `gh pr view … mergeable` not MERGEABLE
after the force-push (paste the output rather than retrying a different merge mode).

**Stage 2 is closed when §3 shows four ticks with evidence.** Only then does this file's §1
move to Stage 2a — and that move is itself a logged edit here, not an assumption.

## 7. Log (append one line per state change, newest last)

- 2026-09-08 10:15 ET — tracker created from repo facts at `d7a5e40`. Current step: 5.2 item 4.
- 2026-09-08 10:40 ET — item 3 status qualified (§0 queries never run; passes 1/2 incomplete); §7 runsheets for items 4 and 5 added; Q1 open for operator.
- 2026-09-08 11:00 ET — `itest-1788469162388` re-read as the probable kept evaluation branch (creation time = campaign day); §4c flipped from "delete" to "do not delete"; item 4 step 4.1 now says how to confirm.
- 2026-09-08 11:20 ET — Q1(a) executed by operator; window 2026-02-28→03-22 chosen; item-3 prompt updated (§0.6, §8, §9); item 3 reopened as "one run owed"; June-2025 slug-shape finding queued for OPEN-TASKS.
- 2026-09-08 11:45 ET — item 5 recipe revised: both PRs conflict with post-step-15 AGENTS.md (merge-tree 2 + 3 hunks); #47's OPEN-TASKS item collides with #108; squash-and-hand-place procedure written.
- 2026-09-08 11:00 ET (14:35–14:50Z run) — item 3 DONE (`39d572f`): C5-m answered on 2026-02-28→03-22, 8 multi-edition days, 1 anchor mismatch (03-05); #114 filed; R.17 is step 24's handoff. §4 re-cut: a done, a2/e/f added, c re-read. Current step unchanged: item 4.
