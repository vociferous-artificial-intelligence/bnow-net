# Checkpoint 4 — status assessment and completion plan (2026-09-07 morning)

**Status of this document.** Written from a read-only survey of `main` `d0a6927`, every `48h/*`
ref, all fourteen worktrees and every closing report in `docs/reviews/`. Every claim below was
verified twice — once by the surveying session and once by an independent verifier that was told
to try to refute it. Where a claim could not be verified from the repo (GitHub PR state, Vercel
env, anything needing `npm`), it is marked UNVERIFIED and the check is placed in the plan instead
of being asserted here. This file does not merge, decide, or authorize anything; it sequences
what is left and names the gate on each piece.

---

## 1. Where the program stands

`main` = `d0a6927`, clean. Base at H0 was `883e5e3`. Twenty-three step branches have landed
through CP1, CP2, CP2b and CP3. Waves 1 and 2 are complete; Wave 3 is half delivered; Waves 4
and 5 have not started.

| Wave | Steps | State |
|---|---|---|
| 0 (operator) | worktrees, Neon probe, #47/#48 | **partial** — #47 and #48 still unmerged |
| 1 (H0→H8) | 01–09 | **complete**, all merged |
| 2 (H8→H22) | 11, 12, 13, 16, 22, 29, 30, 31 | **complete**, all merged |
| 2 (H8→H22) | 10 (operator), 15 | **NOT DONE** — see §3 |
| 3 (H22→H34) | 11b, 13b, 14, 17 | 11b/13b merged; **14 unmerged**; **17 unmerged** |
| 3 (H22→H34) | 18, 19, 20, 21, 32, 33 | **not started** |
| 4 (H34→H44) | 23, 24, 25, 34 | **not started** |
| 5 (H44→H48) | 26, 27 | **not started** |
| side | 28 (reviewer instrument) | **not started**, off the critical path |

Wall clock is past H48. The program's *shape* held — twelve lanes, one reviewer, a checkpoint
merge queue per wave — and its two failure modes both showed up in the log and are worth carrying
forward: a launch list issued twice (fixed by COMMON §4.11), and one audit that planned 227 agents
and was stopped at ≈$30 (fixed by bounding the refutation fan-out up front, §5.3 below).

---

## 2. Ground truth — what is on `main`, what is not

**Merged and closed.** Steps 01–09, 11, 11b, 12, 13, 13b, 16, 22, 29, 30, 31 — PRs #49–#69, #72,
#73. Migrations `0000–0030` + `9999_claim_source_trigger.sql`. Post-CP3 gates recorded in
INDEX §10: typecheck clean, lint 0 errors (3 pre-existing warnings), unit **4,015 / 267 files**.

**Open, needing a merge — three PRs, two independent tips.**

| PR | branch | tip | base | textual conflict vs `main` | contents |
|---|---|---|---|---|---|
| **#74** | `48h/audit-ws2-20260905-finding-register` | `9521e44` | `d0a6927` = **main tip** | **none** | 5 files, all `docs/`, +5,464/−0. No code. |
| **#70** | `48h/ws3-gazetteer-20260905-edition-discovery` | `515dbca` | `a821695`, 26 commits behind | **none** | 20 files: `src/lib/isw/edition-discovery.ts`, `src/lib/conflicts/*`, fixtures |
| **#71** | `48h/ws3-gazetteer-20260905-conflict-validate-route` | `7566fd4` | `a821695` | **none** | 24 files = #70 **plus** the cron route and step 14's closing report |

Three facts the CP3 report did not record:

1. **#70 is fully contained in #71** (`515dbca` is an ancestor of `7566fd4`). They are one stack
   with one tip, not two independent merges.
2. **The GitHub DIRTY state is the `.gitattributes merge=union` artifact, again.**
   `git merge-tree <merge-base> origin/main origin/<branch>` emits **zero** conflict markers for
   all three. Files changed on both sides are `AGENTS.md`, `docs/PROGRESS.md` and (for #71 only)
   `src/lib/usage/cron-run.ts`.
3. **The `cron-run.ts` overlap CP3 flagged as a possible code conflict is disjoint.** `main`
   (from #73) widened `withCronRun`'s callback to `fn(counts, runId)` at `@@ -176,12 +176,22 @@`;
   the branch adds `"conflict-validate": 300` to `JOB_MAX_DURATION_SEC` at `@@ -62,6 +62,7 @@`.
   114 lines apart, no textual conflict. **This is textual mergeability only** — the new route
   calls the function `main` just re-signed, so the post-rebase typecheck is the real evidence.

**Open, not part of the 48h program.** `#47` (`docs/land-aug17-branches-20260905`) and `#48`
(`docs/operator-notes-20260905`) — both still unmerged; Wave 0 asked for both. UNVERIFIED: the
PR-number↔branch mapping for #47 comes from the handoff's own description, not from GitHub.

**Every other worktree tip is an ancestor of `main`.** Nothing is stranded. No branch has an
unpushed commit — local and `origin/` tips are identical for all three open branches. The only
dirty files anywhere are `package-lock.json` in three worktrees (COMMON §1 restore).

**The mutation worktrees are gone.** `.git/worktrees` holds exactly 14 entries, all `48h-*`; the
step-17 session removed its 17 scratch worktrees and pruned. (`git worktree list` run from a
remote mount reports every worktree "prunable" because the paths are not visible there — a mount
artifact. **Never run `git worktree prune` from a Cowork/remote session.**)

---

## 3. The two steps everyone is waiting on

### 3.1 Step 10 — operator runs — NOT DONE, and it blocks more than it looks

`AGENTS.md`'s `## Decision log` has no entry dated later than **2026-09-04**. None of the
≈25 drafts in `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md` — sections (a) through (e15),
all tagged `[UNSIGNED — operator]` — has been signed in. Under INDEX §2 an unsigned draft means
"not authorized", so as things stand:

- step 21 prints `AWAITING AUTHORIZATION: O3` and stops before building;
- step 34 prints `AWAITING AUTHORIZATION: T3` and stops;
- step 19's `docs/evals/analysis/` refresh is unauthorized (E5 is drafted, not signed);
- steps 24 and 25 copy C10/C11/D4 answers that exist only in a draft file.

Also outstanding in step 10: the **#79 RU citation drain** (runbook merged, never run), the
**WS-1.1 ×3 capture run** (the exposure ledger has step 07's entry and no run entry), the **#48
squash-relaunch** so the roster never enters `main`, and **#47**.

### 3.2 Step 15 — AGENTS.md compaction — NOT DONE, and the file is over its ceiling

`AGENTS.md` is **160,624 characters** / 1,951 lines with the decision log still inline.
INDEX §10 records D5 as "approve, 7-day inline window, **and keep below 150k characters**". The
file is 10.6k over. `docs/DECISIONS.md` has not been touched since 2026-07-19. Note the ceiling
lives only in the index and in the unsigned draft — it is not yet standing text in `AGENTS.md`
itself, which still states a "~300 lines" budget. Step 15 is gated on step 10 (entries signed)
and on no other `AGENTS.md`-touching PR being open — which means **after** #70/#71 and #74 land.

---

## 4. What step 17's audit actually delivered, and what it did not

PR #74 carries the register: **71 findings, 0 refuted, 3 major / 29 minor / 39 note, no blocker,
151 mutations run and reverted.** Per-PR verdicts: `#52 #57 #59 #60 #61 #65` **merge-stands**;
`#62 #64 #67` **fix-before-deploy**.

The three majors:

- **WS2-F04** (#64/#62) — the enablement runbook says secret → deploy → register → verify, and
  nothing applies migrations on deploy. Followed literally, the drain is registered against a
  database with no `runtime_logs` table and every signed delivery 500s and is retried.
- **WS2-F06** (pre-existing since `cea8cac`, 2026-07-11) — the documented `ASK_PIPELINE=legacy`
  rollback dispatches a paid completion with **no SpendGuard at all**. Not #67's to fix
  (decision **A1**: file as OPEN-TASKS and fix in step 23).
- **WS2-F07** (#67) — the "exact cache refuses `unscorecarded`" pin passes for the wrong reason,
  and so does the pre-existing pin it copied. Production code is correct; the evidence is not.
  Two-line test fix.

**Read this before treating the verdict column as a clearance** — the register says so itself.
Its honest limits: nothing ran against a database; no Vercel or Neon environment was read;
tree-wide `lint` and `build` were never run; three merges in range were out of scope (**#63**,
#58, #66); merge fidelity was never checked; minors and notes carry one verification each, not
three. **Fifteen coverage gaps (G2–G16) stand open**, two rated blocker-if-real. They are not
optional reading — §5.4 places each one.

Three new decisions the register raises and nobody has answered: **A1** (own WS2-F06 as an
OPEN-TASKS entry — recommended), **A2** (may #64 deploy before its enablement order is corrected
— recommended (b), fix the docs before *registration*), **A3** (accept the bounded verification
as this step's evidence — recommended, accept).

One internal contradiction to fix when #74 merges: the register's "For step 27" bullet still says
"the only PR whose verdict is not merge-stands is #64", which its own verdict table (#62, #64,
#67) and its 2026-09-07 #67 correction both overrule.

---

## 5. The plan

Five stages. Each stage names its **gate** — the thing that must be true before the next stage
starts. Nothing here deploys; step 27 is still the only deploy and it still runs last.

### 5.0 Stage 0 — housekeeping before anything moves (operator, ~10 min)

1. Confirm the two detached sessions are dead (§6), then in the main checkout:
   `git status --porcelain` (expect empty) and `git worktree list`.
2. `git fetch --prune origin` — this survey could not fetch, so every remote-tracking ref cited
   above is as of the Mac's last fetch on 2026-09-06.
3. `gh pr list --state open` — the PR-number mapping in §2 is inferred from branch names and
   report text; confirm it before merging anything.

**Gate:** clean tree, fetch done, PR list matches §2.

### 5.1 Stage 1 — CP4 merge queue (attended session, main checkout, $0, no deploy)

Same fence as CP2/CP3: you merge, you launch nothing, you delete no branch, you create no
worktree. `git pull --ff-only` after each merge.

| # | PR | procedure |
|---|---|---|
| 1 | **#74** audit finding register | Base is already main's tip and there is no conflict. Docs only. Merge as-is. **Before merging**, one edit on the branch: correct the "For step 27" bullet to name #62, #64 and #67 (§4). |
| 2 | **#70 → #71** step 14 | Rebase the stack **from the top** in `48h-ws3-gazetteer-20260905`: `git rebase --update-refs origin/main` on `…-conflict-validate-route`; the union driver resolves `docs/PROGRESS.md`; resolve the `AGENTS.md` directory-map tail by keeping both. **Do not hand-resolve `src/lib/usage/cron-run.ts`** — the hunks are disjoint and must auto-merge; if git raises a conflict there, stop and paste it. Force-push both with `--force-with-lease`, re-run the gate, then `gh pr edit 71 --base main` after #70 merges. |
| 3 | — | Because #70 ⊆ #71, GitHub may close #70 as merged when #71 lands. Merging #70 first is still the right order — it keeps the two reports separable. |

**Gate (all of these, on `main`, on the Mac — this cannot be run from a remote session because
`node_modules` is macOS-only):** `npm run typecheck` · `npm run lint` · `npm test` (expect ≥ 4,015
/ 267 growing by step 14's tests) · `npm run build` with a dummy `DATABASE_URL` — **the build has
never once been run in this window** (register gap G4) and #64 added an App Router route with
`runtime`/`dynamic`/`maxDuration` exports that the pre-push hook cannot see. Then one CP4 line in
INDEX §10, commit, push.

### 5.2 Stage 2 — operator runs, the unblocking stage (operator, ~2 h)

This is the highest-leverage hour in the whole remainder: four of the six remaining agent steps
are gated on it.

1. **Sign the decision entries.** Copy (a)–(e15) from `DECISION-ENTRIES-DRAFT-2026-09-05.md` into
   `AGENTS.md`'s decision log, appending at end of file until step 15 lands. Section (c)'s O1
   paragraph is superseded by (e10) — sign one, not both.
2. **Answer what is still open**, so no later step halts: **A1, A2, A3** (§4, all three have a
   recommendation), **O3** (step 21), **T3** (step 34 — the tables are in PLAN-WS-7 §6.1–6.3 and
   you said you wanted to read them post-29; they are on `main` now), **T4**, **T5**, **C5-m**,
   and **D7 / R4** (defer is a fine answer — step 22 already shipped its estimate mode).
3. **#79 RU citation drain** per `RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`: preflight SELECT →
   Neon backup branch → `--dry` → drain → `registry-materialize` → verify → decision-log entry
   with counts → delete the backup branch and say so.
4. **WS-1.1 ×3 capture run** per the run card in `INJECTION-CASES-DEV-2026-09-05.md`:
   `--estimate` first, `EVAL_DATABASE_URL` = the kept disposable branch (never production),
   campaign-local `LLM_SPRINT_USD_CAP` per D6 ($0.50–$2.00), `--capture-reconcile`, ledger entry.
5. **#48** — squash-relaunch so the roster commit never enters `main`'s history (step 10 item 5
   has the exact recipe); **#47** — merge.

**Gate:** `grep -c '2026-09-0[567]' AGENTS.md` shows the new entries; the exposure ledger has a
capture-run entry with counts; `gh pr list` no longer shows #47/#48.

### 5.3 Stage 3 — the remaining build steps (parallel, one session per worktree)

Launch order matters only through the dependencies; everything on the same row is parallel.

| Order | Steps | Worktree | Ready when | Notes |
|---|---|---|---|---|
| A | **20** WS-2.4 eval parity | `ws2-routing` | now | #60/#61 on `main`; R2 = no registry bump; do not collide with #67's `unscorecarded` literal |
| A | **32** WS-7.2 citation mode | `ws7-tradecraft` | now (T2 signed) | 29 + 30 merged |
| A | **33** WS-7.3 source descriptors | `ws7-docs` | now | 29 + 30 merged |
| A | **15** AGENTS.md compaction | `gov` | after Stage 1 **and** Stage 2 item 1 | no other `AGENTS.md` PR may be open — so it runs after #70/#71/#74 land, and the byte-identity check script is the proof |
| B | **18** WS-3 audit | `audit-ws3` | after #70/#71 merged | **must also cover PR #63** — register gap G2, blocker-if-real: #63 edits `src/db/migrations.test.ts` (the ruling-2 guard) and lands 0028, and #64's ruling-5 evidence sits on top of it |
| B | **19** WS-3.3 evidence population | `ws3-conflict` | after #70/#71 merged **and** D4/E5 signed | E5 authorizes exactly one `docs/evals/analysis/` refresh, this step only |
| B | **21** WS-4.2 reliability proofs | `ws4-ops` | after **O3 signed** | $0; refusal fires before dispatch |
| C | **23** remediate 17 + 18 | `ws2-routing` + `ws3-conflict` | after 18's register **and** your accept/defer marks on both registers | every fix needs a test that fails on the pre-fix code |
| C | **24** WS-3.5 scoreboard + soak prep | `ws3-gazetteer` | after 19 merged | no flag-on |
| C | **34** WS-7.4 likelihood mapping | `ws7-tradecraft` | after 32 merged **and T3 signed** | |
| D | **25** docs sync | `gov` | after every C merges **and** step 15 | the register's 22-item stale-standing-text list is the work order; two of its items are **do-not-apply** |
| E | **26** final audit | `audit-ws2` | after CP4 freeze | see §5.4 for what it must absorb |
| F | **27** deploy | release clone | after 26's go/no-go | only PRs with `go` and no new cap env |

Before step 23 can start you owe both registers an **accept / defer / fix** mark per finding.
71 findings is a lot to adjudicate line by line — the efficient shape is to mark the 3 majors and
the ~10 minors that touch a spend path, a gate, a migration or production-visible behaviour as
FIX, and blanket-DEFER the rest into one OPEN-TASKS entry. The register already tags which is
which.

### 5.4 Stage 4 — the review gates, stated once so no step re-invents them

**Per PR (unchanged from COMMON §5, restated because it is the cheap gate).** Pre-push hook =
typecheck + lint + test. Fork itests wherever a DB is touched, with the disposable branch name in
the report. A closing report in `docs/reviews/` with §7's sections in order. Report the unit
count before and after.

**Per merge.** Rebase in the PR's own worktree from the top of its stack with
`--update-refs`; resolve only PROGRESS/BLOCKERS/OPEN-TASKS/decision-log tails; **any** conflict in
code, `drizzle/`, or `src/db/schema.ts` stops the queue. Re-run the gate after the rebase, before
CI, before merge. Check `lsof -a -d cwd -c claude | grep <worktree>` first (COMMON §4.11).

**Per stage, the four checks this window has never run** — assign them explicitly rather than
hoping step 26 improvises them:

| Check | Register gap | Where it goes |
|---|---|---|
| Tree-wide `npm run build` at the frozen SHA | G4 | Stage 1 gate, and again at the CP4 freeze |
| Merge fidelity — `git range-diff <base>...<reviewed head> <base>...<merge>` for every merged PR | G12 | step 26, first task, before any finder runs |
| Read back the actual Vercel env values (`ASK_EMBED_MODEL`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `OPENAI_MODEL`, the five `<W>_PROVIDER`, `LOG_DRAIN_SECRET`) in all three environments | G3 | step 27's env posture listing — **and** it must happen before the drain is registered |
| `runtime-logs.itest.ts` on a fork with 0029 applied, plus the NUL / int4 / row-cap probes | G5 | step 21 (it already has a fork) or step 23's #64 remediation |

**Gaps to hand to step 26 as prompt text, not as hope:** G2 (audit #63 — give it to step 18
instead, it is already in that lane), G7 (`SpendGuard.cfg.provider` is a bare `string` and shares
row-key names with #60's `<W>_PROVIDER` routing envs — two lenses saw it and both declined, so no
finding exists), G10 (#67's `unscorecarded` answer renders with no degraded callout — a ruling-3
question nobody owned), G11 (#65's rehearsal spend claims taken on trust, and step 25 would write
one into standing text), G13 (silent doc reverts — one was found by accident, never swept),
G14 (`model-routing-inspect.ts` was rewritten and never run), G16 (per-PR test counts nobody
re-measured).

**Efficiency, learned the expensive way.** Step 17 planned 227 agents and was stopped at ≈$30
with 13 of 213 refutation votes cast; the finishing round then did the whole job with **20**.
Bound the fan-out *before* launching, not after: **three refuters for findings the finders rate
major, one batched verification per PR for minors and notes, one completeness critic** — and say
in the register that this is the protocol, as step 17's register does. Apply this to step 18 and
to step 26 from the first line of the prompt. Two other cost sinks worth avoiding: give each
scratch worktree its own `npm ci` rather than one shared `node_modules` (step 17's mutation counts
were measured under ~12 parallel vitest processes and one of them, `injection-dataset.test.ts`,
times out at 5 s under load and passes alone), and use `git clean -fd -e node_modules` because
`.gitignore`'s `node_modules/` pattern does not protect a symlink.

### 5.5 Stage 5 — freeze, final audit, deploy

CP4 freeze after 23–25 merge: record the frozen SHA, run the full gate **including `npm run
build`**, then step 26 (Fable / max / ultracode, read-only, bounded per §5.4) produces
`PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` and `docs/prompts/2026-09-07-next-48h-handoff.md` with a
per-PR deploy go/no-go. Step 27 deploys only PRs with `go` and no new cap env, through
`docs/RELEASE-CHECKLIST.md`, from the release clone `/Users/go/code/bnow-net-rel-20260823`.

**The one hard ordering constraint for step 27:** migration **0029** (`runtime_logs`) and **0030**
(conflict observations) must be applied by hand (`npm run db:migrate`, backup branch first)
**before** any log drain is registered. WS2-F04 is exactly this, and the runbook does not say it
yet — fixing that text is a step-23 or step-25 item, and it must land before registration.

---

## 6. The two detached sessions

`lsof` on 2026-09-07 07:34 ET showed two `claude` processes with no visible terminal:

| PID | cwd | what it is |
|---|---|---|
| 27800 | `/Users/go/code/bnow-net` | the main checkout — the CP3 merge session (reported done 21:49) or the survey session that followed it |
| 55035 | `…/48h-ws3-gazetteer-20260905` | started 20:58 ET, suspended; the duplicate step-14 session from the double-issued Wave 3 launch list (INDEX §10, 2026-09-06 21:35) |

**Both are safe to kill.** Verified across all fourteen worktrees: no unpushed commits anywhere
(local and `origin/` tips are identical for all three open branches), and the only uncommitted
files in the entire tree are `package-lock.json` in `ws1-adjudication`, `ws1-injection` and
`audit-ws3` — the churn COMMON §1 says to restore. The `ws3-gazetteer` worktree's HEAD is on the
**lane** branch `48h/ws3-gazetteer-20260905` (`a821695`, already an ancestor of `main`), not on
either step branch, so PID 55035 is not holding #70 or #71 hostage — but it is the worktree the
CP4 rebase needs, so confirm it is gone before Stage 1 item 2.

```
ps -o pid,lstart,etime,stat,command -p 27800 55035     # stat 'T' = suspended
lsof -a -d cwd -c claude | grep bnow                    # re-check
kill 55035 27800                                        # TERM first; kill -9 only if they linger
lsof -a -d cwd -c claude | grep bnow                    # must print nothing
```

A suspended (`T`) process will not respond to `TERM` until continued — `kill -CONT <pid>` then
`kill <pid>`, or `kill -9`. Nothing in either worktree needs saving first.

---

## 7. Open risks carried into the remainder

1. **Three majors gate the deploy** (§4). WS2-F04 is a runbook correction that must land before
   the drain is registered; WS2-F06 needs its own OPEN-TASKS entry and fix; WS2-F07 is two lines
   of test.
2. **No environment has ever been read.** Every "absent in every environment" claim in the window
   — including `.env.example:32` and `:59` — is taken from reports and `AGENTS.md`. Step 27's env
   posture listing is the first time it gets checked.
3. **`AGENTS.md` is 10.6k characters over the ceiling** and its decision log is 3 days stale.
   Every step that cites `AGENTS.md` line numbers is citing a file step 15 is about to renumber —
   which is why step 25 comes after step 15, and why the register's stale-text list is anchored by
   content as well as by line.
4. **One flaky unit test**, unrelated to any audited PR:
   `src/lib/evals/injection-dataset.test.ts` times out at ~5.1 s under full-suite subprocess load
   and passes alone. Route to the eval-plane owner; do not let it read as a regression.
5. **`CandidateDispatchIdentity.provider` is still `"openai" | "stub"`** (`contracts.ts:436`)
   although #60 added a provider dimension — the widening is step 20's PR-2.4-1, and #61's
   `headerIsLive` skip is keyed on that union.
6. **OPEN-TASKS #92 cites "AGENTS.md is 1,917 lines"**; it is 1,951. Small, but it is the task
   step 15 closes.

---

## 8. What this document did not verify

- **GitHub PR state.** `gh` is unavailable and `git fetch` cannot authenticate from the surveying
  session, so every PR number here is inferred from branch names and report text, and every
  remote-tracking ref is as of the Mac's last fetch on 2026-09-06. Stage 0 re-checks both.
- **Anything requiring `npm`.** `node_modules` holds darwin-arm64 binaries and the surveying
  session ran on Linux; no typecheck, lint, test or build was run. Every gate in §5 is a Mac gate.
- **Semantic mergeability of #70/#71.** `merge-tree` proves zero textual conflict. The post-rebase
  typecheck is the evidence that the new route agrees with `main`'s re-signed `withCronRun`.
- **The register's own findings.** They are reported here as the register states them; this
  document re-derived none of them.
