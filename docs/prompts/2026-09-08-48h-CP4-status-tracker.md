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

**Stages 0, 1, 2, 2a: DONE. Stage 3 rows A and B(18) and step 34: DONE and landed (CP5,
INDEX §10 2026-09-08 line).** `main` = `25bdd27`, gate green 4,332 / 282, build PASS,
`gh pr list` empty.

**Current step: Stage 3 remainder — run from `docs/prompts/2026-09-09-48h-completion-plan.md`**
(it supersedes this file's §6 Stage 3 sheet; §1–§5 here stay the fact record). Morning order:
§2.1 sign D-a…D-f (drafted entry `docs/prompts/2026-09-09-48h-sign-Da-Df.md`) → §2.2 confirm
the step-23 marks (tabled in the rewritten step-23 prompt; one PENDING line to flip) → §2.3
env posture + `npm ci` for `ws3-conflict`, `ws2-routing`, `audit-ws3` → §2.4 commit → §2.5
launch **19, 23r, 23c in parallel** (23c moved to the `audit-ws3` worktree on 2026-09-09).
Then CP6 (19 first, then 23c, then 23r), 24 after 19 merges, 25 after everything, CP7, freeze,
26 on **Opus** (not Fable), 27.

**Rule learned at CP5 — stack PRs:** before merging any PR whose GitHub base is another PR's
branch, `gh pr edit <n> --base main`. #82/#83 were merged into their stack bases and had to be
re-landed as #85.

---

## 2. Stage-by-stage status

| Stage | State | Gate met? |
|---|---|---|
| 5.0 Stage 0 — housekeeping | **DONE** | yes |
| 5.1 Stage 1 — CP4 merge queue | **DONE** | yes |
| 5.2 Stage 2 — operator runs | **DONE 2026-09-08** — items 1–5 | yes |
| 5.2a Stage 2a — D7/R4 measured remap | **DONE 2026-09-08** — executed, $0.046263 | yes |
| 5.3 Stage 3 — build steps 18–34 | **IN PROGRESS** — 18, 20, 21, 32, 33, 34 merged (CP5); 19 / 23r / 23c launch in parallel (2026-09-09 plan §2); 24 after 19; 25 last | no |
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

**Item 4 — WS-1.1 ×3 capture run: DONE 2026-09-08 16:02Z (run) / 16:14Z (reconciled); commit
pending.** Branch confirmed as the kept evaluation branch by its `openai_eval` row
(`br-weathered-forest-atmfaetu` = `itest-1788469162388`). Cell `map-depth-full`. 18 requests /
$0.0039; `openai_eval` $0.2918/767 → $0.2957/785, exact; reconciliation 18/18/0/0, 0 budget
stops, 0 abandoned. 18/18 scored, 10 pass / 8 fail, injectionHits on 2 of 18; row 005 payload
not fed. Ledger entry: `EVAL-EXPOSURE-LEDGER.md` "2026-09-08 16:02Z"; decision-log entry
`AGENTS.md:1516`. Estimate of record = run card's 18 / $0.0112 (operator's own `--estimate`
output not captured). Branch retained (A6).

**Item 5 — #48 squash-relaunch, then #47: DONE 2026-09-08 13:10 ET.** #48 → `ac91519` /
merge `d0c981e`; #47 → `8cff524` / merge `81acadd`. `gh pr list --state open` = empty. Roster
proven absent from the pushed tip before merge. Four conflicts (AGENTS.md ×2 PRs, OPEN-TASKS,
HUMAN-SETUP-TODO, PARTNER-STRATEGY) resolved main-wins + hand re-placement; #47's OPEN-TASKS
item renumbered 108 → **115**. `AGENTS.md` 140,195 chars. Decision-log entry appended (commit
pending).

### 5.2a Stage 2a — DONE 2026-09-08

Executed attended in `48h-ws2-remap-20260905`. Closing note = **§19 of
`docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`**.

- Fork **`br-royal-resonance-atvgety1`**, created and **deleted** this session
  (`neon-branch.ts delete` returned `deleted br-royal-resonance-atvgety1`).
- Caps from the fork's copied ledger as (f10) requires: `T = $23.940010` →
  `MAP_SPRINT_USD_CAP=24.9400`; `D = $0.455843` → `MAP_USD_CAP_DAILY=1.4559`. Never a literal 10.
- `--theater ir --track military --from 2026-08-25 --to 2026-08-25 --execute --budget 1.00
  --limit 1000`. **701 pairs, 382 claims, $0.046263 actual vs $0.0765 modelled.**
- Reconciliation exact on four independent reads (ledger delta, `doc_claims`, `doc_map_state`,
  `cron_runs` = 24 all-ok). Baseline-version rows untouched at 53,006.
- **Measured unit cost $0.0660 per 1k doc-track pairs; estimator conservative by 1.65×**, within
  1.5% of the 2026-09-06 ledger cross-check's $0.067/1k prediction.
- No-rebill proven: checkpoint deleted, identical command re-run → 0 pairs, $0.0000.
- `MAP_CONTENT_CHARS` verified ABSENT from all three Vercel environments **before and after**,
  each listing carrying a positive control (§19.8).
- Production never contacted; still zero `map:remap` rows; `/health` 200 `DB OK` after teardown.
- Pre-push gate green before the run: typecheck + lint clean, **4,082 tests / 270 files**.

**Landed on `main` 2026-09-08 ≈15:45 ET** as `286474e` + `6e0e11c` (fast-forward from the lane
branch). Decision-log execution entry (§19.11's text) applied to `AGENTS.md` at the end of
`## Decision log` — Stage 3 sessions read a complete log, not a draft in a runbook.

**Neon credentials — two planes (runbook §4.1, verified against Vercel 2026-09-08).**
Control plane = `NEON_API_KEY` + `NEON_PROJECT_ID`: creates/deletes branches, cannot run SQL,
read only by `scripts/neon-branch.ts`, **local-only by design — absent from all three Vercel
environments** (the deployed app never creates or destroys a database; a leaked API key is
project-wide branch admin). Data plane = `DATABASE_URL` (pooled; local **and** production/preview)
and `DATABASE_URL_UNPOOLED` (direct; local-only, migrations only). A fork-bound run needs the
control-plane key and the DSN that `neon-branch.ts create` returns — never `.env.local`'s
`DATABASE_URL` — which is why §19 ran to completion with a stale local password.

### 5.3 Stage 3 — CURRENT (unblocked by 2a's gate)

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
[x] EVAL-EXPOSURE-LEDGER.md carries a capture-run entry with counts     — 2026-09-08 16:02Z entry, committed before item 5
[x] Both C5-m outputs in hand, verbatim   — C5M-PROBES-2026-09-07.md R.7/R.8 (39d572f); handoff = R.17
[x] gh pr list shows neither #47 nor #48                                — empty at 13:10 ET; d0c981e, 81acadd
[x] (recommended) (f1)–(f15) signed, 0 UNSIGNED markers                 — 1642971
```

---

## 3a. The Stage 2a gate (plan §5.2a) — ticked with evidence

```
[x] Dated closing note appended to MAP-REMAP-RUNBOOK-2026-09-06.md with the readings
                                          — §19 (final REMAP line, ledger before/after,
                                            doc_map_state @ new version, claims count)
[x] Both MAP_CONTENT_CHARS absence checks shown  — §19.8, before AND after, 46/28/20 rows
                                                   each with a positive control
[x] Fork deleted                          — br-royal-resonance-atvgety1, delete confirmed
[x] Production untouched                  — never contacted; zero map:remap rows; /health 200
[x] Tree clean, port 3000 free, next-env.d.ts byte-unchanged
```

---

## 4. Owed but unassigned — small items that must not be forgotten

| # | Item | Owner | When |
|---|---|---|---|
| a | **DONE** — #114 filed (`39d572f`); step-18 prompt carries #114, #116 and the §4.1 dry-path defect (residue closeout 2026-09-08). Step 23 owns R.15's decision 1 | done | — |
| a2 | **DONE 2026-09-08 — OPEN-TASKS #116 filed.** ~~File the June-2025 suffix slug shape~~ (`…-june-14-2025-{morning,evening}-edition/`, 11 days, neither generated by `run.ts:31-41` nor parsed by `editions.ts:73`; a backfill over 2025-06-12→06-24 manufactures phantom gaps). Next free OPEN-TASKS number is **115**; item 5's renumbered #47 entry then takes 116 (or the reverse, whichever lands first) | session, $0 docs | before Stage 3 row B |
| b | Step 24's prompt must carry **R.17 verbatim** (`C5M-PROBES-2026-09-07.md:1061-1105`), not the 2026-09-07 August text | session, when step 24's prompt is prepared | Stage 3 row C |
| c | Neon branch `itest-1788469162388` = `br-weathered-forest-atmfaetu`, alive since 2026-09-03. R.15 item 3 asks whether to delete it as an orphan. **Do NOT delete** until item 4 step 4.1 has checked its `provider_usage` ledger — it is the probable kept evaluation branch (A6 "keep until closeout"; D6 addendum ≈$0.15 on `openai_eval`). If 4.1 finds no `openai_eval` row, it is an orphan and may go. | operator, via item 4 | item 4 |
| d | `roca` C5-m multi-edition figure is 0 by construction (one candidate URL) — never cite it as evidence about ISW | note only | step 24 |
| e | **DONE 2026-09-08** — R.16's C5-m entry applied to `AGENTS.md` (after the #33 entry); §19.12's #33 status and §19.13's credentials rows applied too | done | — |
| g | ~~Rotate the `neondb_owner` password~~ **DONE for everything that runs.** Verified 2026-09-08 before Stage 2a: production `/health` authenticates (`DB OK`); the local `.env.local` DSN returns `password authentication failed for user 'neondb_owner'`. **This is a much narrower gap than first recorded here.** The designed local path is CONTROL PLANE — `scripts/test-integration.sh:11,22` and `scripts/neon-branch.ts` create a disposable branch with `NEON_API_KEY` and use the DSN the API returns, which always carries the role's CURRENT password. Stage 2a ran entirely on that path and never needed `.env.local`'s DSN. So the stale value blocks **only** operator scripts that deliberately target production through `DATABASE_URL` — `isw-refresh.ts`, `registry-materialize.ts`, `sqlq.ts` (the path the #79 drain used). Nothing else. **Still owed, low urgency:** refresh `.env.local` `DATABASE_URL`/`DATABASE_URL_UNPOOLED` before the next deliberate local-to-production script run; #80 does not close until then. See the plane split in `MAP-REMAP-RUNBOOK-2026-09-06.md` §4.1. | operator | before the next local script targets production |
| h | D6 addendum's "≈$0.15 on the branch" is stale (true pre-run total $0.2918 = campaign + step 1A); corrected in the 2026-09-08 entry, no edit to the addendum (append-only) | done | — |
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

### Stage 2a — D7/R4 measured remap run (attended, `48h-ws2-remap-20260905`, ≈$0.05)

Sources: `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` §3–§9; plan §5.2a; (f10)/(f11);
`scripts/launch/steps.tsv` row `22m` (attended=yes). Day under test **2026-08-25**, ir/military:
the 2026-09-06 dry run modelled **701 pairs / 36 batches / $0.0765** for it (runbook §10.2).
Version expected: `military:ir -> gpt-4o-mini:1bfad9e5e447`.

**Two things before the fork exists.** (1) §4g — rotate `neondb_owner` first; a fork inherits
the parent's role password, so rotating before the fork keeps the exposed credential out of it.
(2) The Vercel BEFORE check (A.3) — do not create the fork until it has printed nothing.

```
[ ] A.1  cd /Users/go/code/bnow-net && git status --porcelain (empty) && git fetch --prune origin
         lsof -a -d cwd -c claude | grep bnow                   (nothing)
[ ] A.2  Password rotated per §4g; .env.local updated; a quick read-only query proves the new DSN:
           npx tsx scripts/sqlq.ts "SELECT 1"
[ ] A.3  Vercel BEFORE (from the main checkout, which is linked to the project):
           npx vercel env ls production  | grep -c MAP_CONTENT_CHARS
           npx vercel env ls preview     | grep -c MAP_CONTENT_CHARS
           npx vercel env ls development | grep -c MAP_CONTENT_CHARS
         Expect 0 / 0 / 0. Keep the three full `env ls` outputs (paste into the closing note).
[ ] B.1  Worktree onto current main via the launch guard (claims step 22m, resets the lane):
           scripts/launch/launch.sh 22m
           scripts/launch/launch.sh 22m --go
         It prints "attended" and the worktree path; it launches nothing.
[ ] B.2  cd /Users/go/code/bnow-net-worktrees/48h-ws2-remap-20260905
         git log --oneline -1                                   (= origin/main tip, 81acadd or later)
         cp /Users/go/code/bnow-net/.env.local .
         git status --porcelain                                 (empty — .env.local is ignored)
         npm ci
         lsof -ti :3000                                         (nothing)
         npm run typecheck && npm run lint && npm test          (green)
         cp next-env.d.ts /tmp/next-env.d.ts.bak
[ ] C.1  Fork (never print the connection string):
           npx tsx scripts/neon-branch.ts create > /tmp/fork.json
           chmod 600 /tmp/fork.json
           python3 -c 'import json;print(json.load(open("/tmp/fork.json"))["branchId"])'
           python3 -c 'import json;print(json.load(open("/tmp/fork.json"))["connectionString"],end="")' > /tmp/fork_url
           chmod 600 /tmp/fork_url
         Record the branchId. Do NOT run db:migrate on it (already at production's 0027).
[ ] C.2  Read the caps off the fork's COPIED ledger:
           DATABASE_URL="$(cat /tmp/fork_url)" npx tsx scripts/sqlq.ts "SELECT round(sum(est_usd)::numeric,4) AS t FROM provider_usage WHERE provider='openai_map'"
           DATABASE_URL="$(cat /tmp/fork_url)" npx tsx scripts/sqlq.ts "SELECT coalesce(round(est_usd::numeric,4),0) AS d FROM provider_usage WHERE provider='openai_map' AND day=CURRENT_DATE"
         MAP_SPRINT_USD_CAP = T + 1.00 ; MAP_USD_CAP_DAILY = D + 1.00 (D = 0 if no row). Write both down.
         Also record the BEFORE row: same query as the AFTER in E.2.
[ ] D.1  Estimate server (keys blank, LLM_DISABLE=1):
           openssl rand -hex 16 > /tmp/remap_cron_secret && chmod 600 /tmp/remap_cron_secret
           cat > /tmp/remap-server-env.sh <<'EOF'
           export DATABASE_URL="$(cat /tmp/fork_url)"
           export CRON_SECRET="$(cat /tmp/remap_cron_secret)"
           export OPENAI_API_KEY=""
           export ANTHROPIC_API_KEY=""
           export POSTMARK_SERVER_TOKEN=""
           export RESEND_API_KEY=""
           export X_API_KEY=""
           export OPENSANCTIONS_API_KEY=""
           export LLM_DISABLE=1
           export MAP_CONTENT_CHARS=1499
           export AUTH_SECRET="remap-dry-run-local-secret"
           export NODE_ENV=production
           EOF
           chmod 600 /tmp/remap-server-env.sh
           source /tmp/remap-server-env.sh && ./node_modules/.bin/next build
           source /tmp/remap-server-env.sh && ./node_modules/.bin/next start -p 3000 > /tmp/remap-server.log 2>&1 &
           until curl -fsS http://localhost:3000/health >/dev/null; do sleep 1; done
           curl -s http://localhost:3000/health | grep -o "DB OK"
[ ] D.2  Estimate pass ($0), driver env in the SAME shell:
           export CRON_SECRET=$(cat /tmp/remap_cron_secret)
           export MAP_BACKFILL_BASE=http://localhost:3000
           npx tsx scripts/map-remap.ts --theater ir --track military --from 2026-08-25 --to 2026-08-25
         Expect ≈ eligible=4115 pairs=701 batches=36 est≈$0.0765, version military:ir -> gpt-4o-mini:1bfad9e5e447,
         and NO line containing "WOULD BE REFUSED". If "WOULD BE REFUSED" appears → STOP (§9), paste it.
[ ] E.1  Measured server (key set, LLM_DISABLE unset, caps set) — restart:
           pkill -f "next start -p 3000"
           cat > /tmp/remap-server-env-live.sh <<'EOF'
           export DATABASE_URL="$(cat /tmp/fork_url)"
           export CRON_SECRET="$(cat /tmp/remap_cron_secret)"
           export OPENAI_API_KEY="$(grep -m1 '^OPENAI_API_KEY=' /Users/go/code/bnow-net/.env.local | cut -d= -f2-)"
           export ANTHROPIC_API_KEY=""
           export POSTMARK_SERVER_TOKEN=""
           export RESEND_API_KEY=""
           export X_API_KEY=""
           export OPENSANCTIONS_API_KEY=""
           unset LLM_DISABLE
           export MAP_CONTENT_CHARS=1499
           export MAP_SPRINT_USD_CAP=<T+1.00>
           export MAP_USD_CAP_DAILY=<D+1.00>
           export AUTH_SECRET="remap-dry-run-local-secret"
           export NODE_ENV=production
           EOF
           chmod 600 /tmp/remap-server-env-live.sh
           source /tmp/remap-server-env-live.sh && ./node_modules/.bin/next start -p 3000 > /tmp/remap-server-live.log 2>&1 &
           until curl -fsS http://localhost:3000/health >/dev/null; do sleep 1; done
         (no rebuild needed — the env is read at start; MAP_CONTENT_CHARS unchanged)
[ ] E.2  The measured run — one day, bounded twice:
           npx tsx scripts/map-remap.ts --theater ir --track military --from 2026-08-25 --to 2026-08-25 --execute --budget 1.00 --limit 1000 2>&1 | tee /tmp/remap-run-20260908.txt
         Keep the final `REMAP …` line verbatim. Then the readings:
           DATABASE_URL="$(cat /tmp/fork_url)" npx tsx scripts/sqlq.ts "SELECT day::text, requests, round(est_usd::numeric,4) AS usd FROM provider_usage WHERE provider='openai_map' ORDER BY day DESC LIMIT 3"
           DATABASE_URL="$(cat /tmp/fork_url)" npx tsx scripts/sqlq.ts "SELECT count(*) AS rows, sum(claim_count) AS claims FROM doc_map_state WHERE extractor_version='gpt-4o-mini:1bfad9e5e447'"
           DATABASE_URL="$(cat /tmp/fork_url)" npx tsx scripts/sqlq.ts "SELECT count(*) AS claims FROM doc_claims WHERE extractor_version='gpt-4o-mini:1bfad9e5e447'"
         Expect ≈701 rows and actual USD in the $0.04–0.08 band (threshold semantics: may exceed by one batch).
[ ] F.1  Tear down, in this order:
           pkill -f "next start -p 3000"
           npx tsx scripts/neon-branch.ts delete <branchId>
           rm -f /tmp/fork_url /tmp/fork.json /tmp/remap-server-env.sh /tmp/remap-server-env-live.sh
           cp /tmp/next-env.d.ts.bak next-env.d.ts
           rm -rf data/remap-state/
           git status --porcelain                              (empty, or only ignored files)
           lsof -ti :3000                                      (nothing)
[ ] F.2  Vercel AFTER — the same three `env ls | grep -c MAP_CONTENT_CHARS` lines: 0 / 0 / 0.
[ ] G.1  Closing note appended to MAP-REMAP-RUNBOOK-2026-09-06.md as a new dated section (§19): branchId,
         T/D and the two caps as set, the estimate line, the final REMAP line, openai_map before/after,
         doc_map_state rows + claims at the new version, both Vercel checks verbatim (BEFORE and AFTER),
         fork deleted (time), threshold-semantics caveat. Plus the decision-log execution entry (end of
         `## Decision log`, date order) and the launch claim released. Paste me the raw readings and I
         draft both.
[ ] G.2  git add docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md AGENTS.md docs/prompts/2026-09-08-48h-CP4-status-tracker.md
         git commit -m 'docs: D7/R4 measured remap run - closing note and execution entry'
         git push origin main
```

**Halt conditions (runbook §9 applies — delete the fork before reporting):** `WOULD BE REFUSED` in
the estimate; `/health` not `DB OK`; the driver banner showing any base other than
`http://localhost:3000`; a `daily_cap`/`sprint_cap` stop at zero batches (caps computed wrong —
never raise a cap mid-run, recompute from C.2); any `MAP_CONTENT_CHARS` count other than 0 in
either Vercel check.

### Stage 3 — operator sequence — SUPERSEDED 2026-09-09 by `docs/prompts/2026-09-09-48h-completion-plan.md` (kept for the record; row A/B and CP5 are done)

#### (superseded text follows)

### Stage 3 — operator sequence (plan §5.3; one row at a time, gates between rows)

**The mechanics that prevent yesterday's double-launch:** every launch goes through
`scripts/launch/launch.sh <step> --go`, which takes an atomic claim
(`bnow-net-worktrees/claims/step-<n>/`), resets the step's worktree to `origin/main` on its lane
branch, checks the worktree's `.env.local` posture, and only then starts `claude -p` detached
with the prompt on stdin and a log in `bnow-net-worktrees/logs/step<n>.log`. A second `--go` for
the same step dies at the claim. `scripts/launch/status.sh` is the one screen to read instead of
memory. Never launch a step by pasting a prompt into a terminal by hand.

**Row A (now): steps 20, 32, 33, 21 — four worktrees, unattended allowed (steps.tsv attended=no).**

```
[ ] 3A.0  cd /Users/go/code/bnow-net && git status --porcelain (empty) && git fetch --prune origin
          git log --oneline -1 origin/main                    (the binding-blocks commit or later)
          lsof -a -d cwd -c claude | grep bnow                  (nothing)
          scripts/launch/status.sh                             (no live claims; read it once)
[ ] 3A.1  Env posture, per worktree, BEFORE launching (COMMON §4.10 — an unattended launch refuses
          if spend/deploy keys are present):
            for w in ws2-routing ws7-tradecraft ws7-docs ws4-ops; do
              f=/Users/go/code/bnow-net-worktrees/48h-$w-20260905/.env.local
              echo "== $w"; test -f "$f" && cut -d= -f1 "$f" || echo "(no .env.local)"
            done
          20 / 32 / 33: $0, no DB — remove .env.local entirely if present.
          21: needs a fork → keep ONLY DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_PROJECT_ID, NEON_API_KEY
              (the trimmed copy); no OPENAI/ANTHROPIC/POSTMARK/VERCEL lines.
[ ] 3A.2  Fresh toolchain per worktree (each gets its own node_modules — CP4 plan §5.4):
            for w in ws2-routing ws7-tradecraft ws7-docs ws4-ops; do
              (cd /Users/go/code/bnow-net-worktrees/48h-$w-20260905 && git checkout -- package-lock.json 2>/dev/null; npm ci --silent)
            done
[ ] 3A.3  Launch, one at a time, dry then go, reading each dry output before the go:
            scripts/launch/launch.sh 20 && scripts/launch/launch.sh 20 --go
            scripts/launch/launch.sh 32 && scripts/launch/launch.sh 32 --go
            scripts/launch/launch.sh 33 && scripts/launch/launch.sh 33 --go
            scripts/launch/launch.sh 21 && scripts/launch/launch.sh 21 --go
          Note 32 and 34 share a worktree (ws7-tradecraft): 34 cannot launch until 32 has merged.
[ ] 3A.4  Monitor: scripts/launch/status.sh every ~20 min; tail -5 bnow-net-worktrees/logs/step<n>.log
          A step is DELIVERED when its PR is open and its closing report exists in docs/reviews/.
          A step that prints AWAITING AUTHORIZATION or halts: read the log, do not relaunch — tell me.
```

**Row B (launchable now too — #70/#71 are on `main`): steps 18 (attended), 19.** Different
worktrees from row A (`audit-ws3`, `ws3-conflict`), so they may run alongside row A.

```
[ ] 3B.0  Step 18 is attended=yes: `scripts/launch/launch.sh 18 --go` claims + preps and PRINTS the
          session command; you run it in a terminal you can watch. Its prompt now carries #114, #116
          and the dry-path defect (2026-09-08 addition) and G2 (audit PR #63). Fan-out is bounded per
          CP4 §5.4 (3 refuters per major, 1 batched verification per PR, 1 completeness critic) —
          if the session proposes more, stop it.
[ ] 3B.1  Step 19 (unattended): env posture as for 21 (fork keys only), npm ci, then
            scripts/launch/launch.sh 19 && scripts/launch/launch.sh 19 --go
          E5 authorizes exactly ONE docs/evals/analysis/ refresh, this step only.
```

**CP5 merge queue — after each row delivers (attended, main checkout, same fence as CP4).**

```
[ ] CP5.0 lsof -a -d cwd -c claude | grep <worktree>   (the delivering session has exited)
          gh pr list --state open                       (the row's PRs, nothing else unexpected)
[ ] CP5.1 Per PR, BEFORE believing GitHub's DIRTY flag:
            mb=$(git merge-base origin/main origin/<branch>); git merge-tree $mb origin/main origin/<branch> | grep -c '^+<<<<<<<'
          0 → merge as-is. >0 → rebase in the PR's OWN worktree from the top of its stack with
          --update-refs; resolve only PROGRESS/BLOCKERS/OPEN-TASKS/decision-log tails; ANY conflict
          in code, drizzle/, or src/db/schema.ts STOPS the queue — paste it.
[ ] CP5.2 gh pr merge <n> --merge; git pull --ff-only; next PR.
[ ] CP5.3 Gate on post-merge main: npm run typecheck && npm run lint && npm test && (build)
            LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= DATABASE_URL=postgres://x:y@localhost/z npm run build
          Record unit count before/after and `ls drizzle | tail -4`.
[ ] CP5.4 One docs commit: INDEX §10 CP5 line (merge SHAs, gate figures, what was launched/not),
          tracker §2/§7 updated; push. Then `scripts/launch/status.sh` to confirm claims released.
```

**Row C — three independent gates, launch each when ITS gate is true:**

```
[ ] 3C.23 Steps 23r + 23c (remediate 17 + 18) — gate: step 18's register merged AND your
          accept / defer / fix mark on EVERY finding in both registers (#74's 71 + 18's). Efficient
          shape (plan §5.3): mark the 3 majors + the ~10 minors touching a spend path, gate, migration
          or production-visible behaviour as FIX; blanket-DEFER the rest into one OPEN-TASKS entry.
          Before launch, the session (me) adds to step 23's prompt: the marks, #110 (WS2-F06 fix),
          #112 (migrate.ts boundary guard), #114 + R.15 decision 1 (split 403), #116 (June-2025 slug
          shape), the WS2-F04 runbook-order correction if 25 has not landed it.
[ ] 3C.24 Step 24 — gate: step 19 merged. Before launch, the session adds to step 24's prompt the
          C5M report's R.17 handoff VERBATIM (window 2026-02-28→03-22; 8 multi-edition days, 1 anchor
          mismatch; iran figures are lower bounds; (f14)/C15 NOT exercised and structurally could not
          be; roca null instrument; 'real page served 200' is n=1) — it must NOT carry the August text.
[ ] 3C.34 Step 34 — gate: step 32 merged (shares ws7-tradecraft). T3 tables signed as drafted ((f9),
          T3-a/T3-b): ESTIMATIVE_MAP_V1, six invariants = the exhaustive test's spec.
```

**Row D — step 25 docs sync (gate: every row-C PR merged).** Its work order is the #74
register's 22-item stale-text list (two are do-not-apply); it also lands the WS2-F04 runbook
order correction if 23 did not, and runs the next archive pass under D5's normal 7-day window.

**Stage 3 closes when:** 20, 32, 33, 21, 18, 19, 23, 24, 34, 25 are all merged, the CP5/CP6
INDEX §10 lines exist, `scripts/launch/status.sh` shows no live claim, and `gh pr list` is
empty. Then Stage 4's four never-run checks (plan §5.4) are assigned and Stage 5's freeze begins.

**Prompt readiness (done 2026-09-08 before row A):** binding blocks added to the step-20 (signed
f-batch, `mapreduceProviderTag()` gate), step-21 (O3 signed; #111/#112) and step-32 (T4/T4-b:
disclosure BUILT and DARK, policy function, per-stage block, marker, test) prompts; step 18's
prompt carries #114/#116. Still owed before row C: the step-23 and step-24 prompt additions above.

**Stage 2 is closed when §3 shows four ticks with evidence.** Only then does this file's §1
move to Stage 2a — and that move is itself a logged edit here, not an assumption.

## 7. Log (append one line per state change, newest last)

- 2026-09-08 10:15 ET — tracker created from repo facts at `d7a5e40`. Current step: 5.2 item 4.
- 2026-09-08 10:40 ET — item 3 status qualified (§0 queries never run; passes 1/2 incomplete); §7 runsheets for items 4 and 5 added; Q1 open for operator.
- 2026-09-08 11:00 ET — `itest-1788469162388` re-read as the probable kept evaluation branch (creation time = campaign day); §4c flipped from "delete" to "do not delete"; item 4 step 4.1 now says how to confirm.
- 2026-09-08 11:20 ET — Q1(a) executed by operator; window 2026-02-28→03-22 chosen; item-3 prompt updated (§0.6, §8, §9); item 3 reopened as "one run owed"; June-2025 slug-shape finding queued for OPEN-TASKS.
- 2026-09-08 11:45 ET — item 5 recipe revised: both PRs conflict with post-step-15 AGENTS.md (merge-tree 2 + 3 hunks); #47's OPEN-TASKS item collides with #108; squash-and-hand-place procedure written.
- 2026-09-08 11:00 ET (14:35–14:50Z run) — item 3 DONE (`39d572f`): C5-m answered on 2026-02-28→03-22, 8 multi-edition days, 1 anchor mismatch (03-05); #114 filed; R.17 is step 24's handoff. §4 re-cut: a done, a2/e/f added, c re-read. Current step unchanged: item 4.
- 2026-09-08 12:20 ET — item 4 executed by operator (16:02Z); ledger + decision-log entries written by session; two [OPERATOR] blanks; owed g (password rotation) and h added.
- 2026-09-08 12:25 ET — item 4 reconciled 18/18/0/0; ledger blanks filled; item 4 DONE pending commit. Current step → item 5.
- 2026-09-08 13:15 ET — item 5 DONE (d0c981e, 81acadd); Stage 2 gate fully ticked; §1 moved to Stage 2a. Owed g (password rotation) and a2 (#116) flagged as pre-2a residue.
- 2026-09-08 13:40 ET — Stage 2a runsheet A.1–G.2 written into §6.
- 2026-09-08 15:50 ET — Stage 2a verified against the plan gate and landed on main (286474e, 6e0e11c); §19.11 entry applied to AGENTS.md; Neon two-plane note carried into §5.2a. Current step: Stage 3 (row A) after the residue closeout decision.
- 2026-09-08 16:05 ET — residue closeout: R.16 entry + credentials rows in AGENTS.md; #33 status + #116 in OPEN-TASKS; step-18 prompt line (#114, #116, dry-path defect). §4 a/a2/e closed. Next: Stage 3 row A launch sheet.
- 2026-09-08 16:30 ET — AGENTS.md archive passes 9 (eb4bf9f, policy) and 10 (c6e3dae, one-off cut to 2026-09-05): 147,701 → 126,660 chars, 205 entries preserved, both PASS; record entry appended. Next: Stage 3 row A launch sheet.
- 2026-09-08 16:50 ET — Stage 3 operator sequence written (§6); binding blocks added to prompts 20/21/32; §1 → row A launch.
- 2026-09-08 21:55 ET — CP5 landed: #78 #79 #80 #77 #84 #76 #75 #81 #85 + test fix 25bdd27; gate 4,332/282, build PASS. Two incidents recorded (permission mode; stack-base merges). §1 → launch 19 + operator marks for 23.
- 2026-09-09 (morning prep, remote session, docs only) — remainder plan written (`2026-09-09-48h-completion-plan.md`); step 23 prompt rewritten from sketch with marks tables; binding blocks added to 19/24/25/26/27; steps.tsv: 23c → audit-ws3, 26 → opus; D-a…D-f entry drafted for operator signature. §1 → the 09-09 plan §2. Nothing launched.
- 2026-09-09 (later, remote session, docs only) — reorder question answered (`docs/reviews/REORDER-23C-19-ANALYSIS-2026-09-09.md`): keep 19/23c parallel; 19 builds PR 1 first and consumes lane C's module for PR 2 if 23c is on origin/main; CP6 merges whichever delivers first (23c before 19 if both wait). Prompts 19/23, sign-Da-Df, steps.tsv updated. Nothing launched.
- 2026-09-10 — preliminaries closed: D-a…D-f inserted (e356adb); marks adjusted per second read (F01/F23 → drain bundle, F02/F31 split, WS3-F10 FIX); launch order in the 09-09 plan set to 23c → 23r → 19 with merge-on-delivery, so 19 PR 2 consumes lane C. Owed: operator flips the marks line, pushes.
- 2026-09-10 — CP6 agent prompt reviewed (`2026-09-10-48h-CP6-merge-queue.md`): lsof self-match fixed, order 90 91 92 94 88 86 87 89 93 (clean first, two predicted STOPs last), #119 collision reading at STOP 1, recommended rulings + resume procedure, drizzle check = 32 .sql + empty diff (plan card 3.4 corrected). Model: Opus/high attended.
- 2026-09-10 ≈04:30 ET — CP6 agent merged #90 f73fffe, #91 bcb523b, #92 387b7a0, #94 6a79553 (gate 4,411/282, build PASS, drizzle 32 .sql); stopped at #88: all five remaining PRs CONFLICTING on GitHub via PROGRESS.md (merge=union blind spot in card 3.2, recorded); #89 also OPEN-TASKS #119 collision + shared report; #93 route.ts one hunk. Rulings R-1..R-5 + resolver prompt `2026-09-10-48h-CP6-resolve-and-finish.md` (fresh session, Opus xhigh).
