# Checkpoint 4 — status assessment and completion plan (2026-09-07, rev 2)

**Status of this document.** Written from a read-only survey of `main` `d0a6927`, every `48h/*`
ref, all fourteen worktrees and every closing report in `docs/reviews/`. Every claim below was
verified twice — once by the surveying session and once by an independent verifier that was told
to try to refute it. Where a claim could not be verified from the repo (GitHub PR state, Vercel
env, anything needing `npm`), it is marked UNVERIFIED and the check is placed in the plan instead
of being asserted here. This file does not merge, decide, or authorize anything; it sequences
what is left and names the gate on each piece.

**Revision 2 (2026-09-07 afternoon), against `main` `f6eca71`.** The morning survey (`d0a6927`)
was overtaken the same day by four operator actions: the CP1-batch decision entries were signed
into the log (`a5caeb7`), the eighth archive pass landed step 15's compaction (`3f09757`), the
operator answered **every** open decision and drafted them as sections (f1)–(f15) (`901078a`),
and Stage 0 §5.0 was run from the Mac (`lsof` clean, `git fetch --prune`, `gh pr list` read).
Stale claims are corrected in place; §0 lists every material change so the original survey
remains readable at `f6eca71`. Re-verified for this revision, from the Mac checkout:
`git merge-tree` zero conflict markers for all three open program PRs against `f6eca71`;
`AGENTS.md` = 98,038 characters; `grep WS2-F06 docs/OPEN-TASKS.md` = 0.

---

## 0. Delta since the morning survey

1. **Step 10 items 1–2 are done.** All CP1-batch entries signed into `AGENTS.md`'s log
   (`a5caeb7`, 32 entries; section (c)'s O1 correctly skipped as superseded). Every decision
   the plan listed as unanswered — A1, A2, A3, O3, T3 (tables), T4 + T4-b, T5, C5-m, D7, R4,
   C15, R14, R7-b — was answered 2026-09-07 and drafted as (f1)–(f15) of
   `DECISION-ENTRIES-DRAFT-2026-09-05.md` (`901078a`). INDEX §2.1 now reads **"NOTHING IS
   WAITING ON AN OPERATOR ANSWER"**. Steps 19, 21, 24, 25 and 34 are unblocked at the sheet
   level (§3.1 on the signing semantics).
2. **Step 15 is done** — executed by the operator directly on `main` as `3f09757`, not as a
   PR: `AGENTS.md` 189,651 → 98,038 characters (ceiling 150k), 29 pre-2026-08-31 entries moved
   verbatim to `docs/DECISIONS.md` (now 145 entries), the log reunified, OPEN-TASKS #92 closed
   both halves, acceptance script `scripts/check-decision-log-move.sh` added and PASS (183
   entries before, 183 after). **The end-of-file append convention is retired: new decision
   entries append at the end of `## Decision log`, in date order.** Every later step that adds
   an entry (25 above all) must follow the new convention.
3. **`gh pr list` shows SIX open PRs, not the five §2 predicted.** The sixth is **#51**
   (`48h/gov2-20260905-step03-release-checklist`), whose tip is an **ancestor of `main`** —
   its content landed at CP1 (`6eaef5d`). Close it; do not merge it. The #47/#48
   number↔branch mapping the survey marked UNVERIFIED is confirmed by the `gh` output.
4. **The two detached sessions are gone** — `lsof -a -d cwd -c claude | grep bnow` prints
   nothing (operator terminal, 2026-09-07). §6 is resolved; the `ws3-gazetteer` worktree is
   free for the CP4 rebase.
5. **`main` moved d0a6927 → f6eca71** (also: `d4d683d`/`a73f2e1` research, off the critical
   path, and this plan at `f6eca71`). The top three commits (`901078a`, `a73f2e1`, `f6eca71`)
   are **local-only — push before the CP4 queue**. Merge-tree re-verified against `f6eca71`:
   still zero conflict markers on #74, #70, #71; #70/#71's `AGENTS.md` hunk is the
   directory-map line for `src/lib/isw/` and survives the `3f09757` restructure; #74's base is
   no longer `main`'s tip but remains conflict-free.
6. **New carried actions from the answers** (placed in §5): file the **WS2-F06** OPEN-TASKS
   entry (A1's first half — still absent); the D7/R4 **measured remap run is now authorized**
   (operative `--budget` $1.00, $10 outer bound — see §5.2a); step 32's spec changed
   materially under T4/T4-b (disclosure BUILT and DARK); step 20b is fully unblocked (R6, R7,
   R7-b) but **`mapreduceProviderTag()` must be provider-aware before the Anthropic digest
   path is enabled** (f13); C5-m probes authorized, operator-run, feeding step 24.
7. **INDEX §10 has no 2026-09-07 entries.** The signing, the archive pass, the CP4 answers and
   the Stage-0 checks are so far unlogged; the CP4 §10 line (§5.1 gate) must cover them.
8. Housekeeping recorded elsewhere: OPEN-TASKS **#109** filed (batch APIs, design only, not
   this window); the remap runbook's colliding decision ids renumbered **R14/R15 → R16/R17**
   with a dated correction note.

---

## 1. Where the program stands

`main` = `f6eca71`, clean (top three commits local-only, unpushed). Base at H0 was `883e5e3`.
Twenty-three step branches have landed through CP1, CP2, CP2b and CP3. Waves 1 and 2 are
complete; Wave 3 is half delivered; Waves 4 and 5 have not started.

| Wave | Steps | State |
|---|---|---|
| 0 (operator) | worktrees, Neon probe, #47/#48 | **partial** — #47 and #48 still unmerged |
| 1 (H0→H8) | 01–09 | **complete**, all merged |
| 2 (H8→H22) | 11, 12, 13, 16, 22, 29, 30, 31 | **complete**, all merged |
| 2 (H8→H22) | 10 (operator) | **half done** — entries signed + every decision answered (2026-09-07); drain, capture run, #47/#48 remain — see §3.1 |
| 2 (H8→H22) | 15 | **DONE 2026-09-07** — operator, on `main` (`3f09757`) — see §3.2 |
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
Since CP3, six docs-only commits landed directly on `main` (§0 item 5); nothing in `src/`,
`drizzle/` or `scripts/` changed except the new `scripts/check-decision-log-move.sh`.

**Open but already landed — one PR.** **#51** (`48h/gov2-20260905-step03-release-checklist`)
shows open on GitHub, but its tip is an ancestor of `main` — the content merged at CP1
(`6eaef5d`). GitHub never detected the local merge. **Close it with a comment; merging it
again is wrong.**

**Open, needing a merge — three PRs, two independent tips.**

| PR | branch | tip | base | textual conflict vs `main` | contents |
|---|---|---|---|---|---|
| **#74** | `48h/audit-ws2-20260905-finding-register` | `9521e44` | `d0a6927`, 6 docs commits behind | **none** (re-verified vs `f6eca71`) | 5 files, all `docs/`, +5,464/−0. No code. |
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
(`docs/operator-notes-20260905`) — both still unmerged, both 2 commits ahead of `main`; Wave 0
asked for both. The PR-number↔branch mapping is now **VERIFIED** against the operator's
2026-09-07 `gh pr list` output.

**Every other worktree tip is an ancestor of `main`.** Nothing is stranded. No branch has an
unpushed commit — local and `origin/` tips are identical for all three open branches. The only
dirty files anywhere are `package-lock.json` in three worktrees (COMMON §1 restore).

**The mutation worktrees are gone.** `.git/worktrees` holds exactly 14 entries, all `48h-*`; the
step-17 session removed its 17 scratch worktrees and pruned. (`git worktree list` run from a
remote mount reports every worktree "prunable" because the paths are not visible there — a mount
artifact. **Never run `git worktree prune` from a Cowork/remote session.**)

---

## 3. The two steps everyone was waiting on — both cleared 2026-09-07

### 3.1 Step 10 — operator runs — items 1–2 done; the runs and #47/#48 remain

**Done.** `a5caeb7` signed the CP1-batch drafts — sections (a)–(e15), 32 entries — into
`AGENTS.md`'s `## Decision log`, skipping section (c)'s O1 as superseded (exactly as the
survey's Stage 2 prescribed). `901078a` then answered everything the survey listed as open — **A1, A2, A3, O3,
T3 (the tables themselves), T4 + T4-b, T5, C5-m, D7, R4, C15, R14, R7-b** — recorded the
operator's words verbatim in INDEX §2.2 and drafted the log entries as sections **(f1)–(f15)**.
So: step 21 no longer halts on O3, step 34 no longer halts on T3, step 19's
`docs/evals/analysis/` refresh is authorized (E5 signed in the log), and steps 24/25 copy
answers that are now in the log or in §2.2, not only in a draft.

**Signing semantics, stated once so no session re-litigates them.** The (f) entries are still
tagged `[UNSIGNED — operator]` and INDEX §2 still says an unsigned draft means "not
authorized". The operative reading — consistent with how T1–T3 ran in Wave 2 — is that the
**verbatim operator answer in INDEX §2.2 is the authorization**; the (f) draft is its
log-entry wording, and copying it into `AGENTS.md` is record-keeping owed at **step 25**
(901078a says so explicitly: "nothing is copied into AGENTS.md, which step 25 still owns").
A session that halts on an f-batch decision cites the §2.2 row and the (f) section and
proceeds; it does not wait for step 25. One disagreement makes this concrete rather than
theoretical: the **signed** R7 entry still says "Sonnet 5 held", and §2.1 makes the log
authoritative where sheet and log disagree — so §5.2 item 1 signs the batch in one ~10-minute
pass (new append convention — end of `## Decision log`, date order) **before step 20 launches**,
and step 25 has nothing left to sign.

**Still outstanding in step 10:** the **#79 RU citation drain** (O2 signed; runbook merged,
never run — no execution entry in the log), the **WS-1.1 ×3 capture run** (the exposure ledger
still has step 07's entry and no run entry), the **C5-m probes** (newly authorized, §5.2 item
3), the **#48 squash-relaunch**, and **#47**.

### 3.2 Step 15 — AGENTS.md compaction — DONE (operator, on `main`, `3f09757`)

Executed 2026-09-07 as a direct operator commit rather than a PR from the `gov` worktree, and
**before** #70/#71/#74 landed — the survey's "after" gate is moot because the branches' only
`AGENTS.md` hunk (the `src/lib/isw/` directory-map line) survives the restructure; merge-tree
re-verified clean. What landed, matching step 15's spec: 29 pre-2026-08-31 entries moved
**verbatim** to `docs/DECISIONS.md` (now 145 entries, ascending); the split log reunified under
`## Decision log`; `AGENTS.md` **189,651 → 98,038 characters**, clearing D5's 150k ceiling; the
maintenance rule now names the 7-day window, the ceiling and the check script; OPEN-TASKS #92
closed, both halves; `scripts/check-decision-log-move.sh` added as the standing acceptance test
for every future pass (this pass: 183 entries before, 183 after, PASS).

Two residues. (1) **The append convention changed**: entries go at the end of the
`## Decision log` section in date order — the end-of-file convention is retired. Steps 25 and
26 must know this; a tail appended at EOF would now land outside the log. (2) No closing
report or PR exists for step 15 (operator action on `main`); the CP4 §10 line carries the
record instead — §5.1 gate.

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

The three decisions the register raised were **answered 2026-09-07** (all as recommended;
drafts f2–f4): **A1** — WS2-F06 is owned as an OPEN-TASKS entry and fixed in step 23, *and
the entry still has to be filed* (`grep WS2-F06 docs/OPEN-TASKS.md` = 0 as of this revision —
§5.1 places it); **A2** — #64 may deploy; the runbook correction gates **registration**, and
the corrected order must be in front of the operator at the Vercel dashboard step (O1 puts
them there personally); **A3** — the bounded verification is accepted as step 17's evidence,
with its limits on the record and explicitly **not** as a deploy clearance.

One internal contradiction to fix when #74 merges: the register's "For step 27" bullet still says
"the only PR whose verdict is not merge-stands is #64", which its own verdict table (#62, #64,
#67) and its 2026-09-07 #67 correction both overrule.

---

## 5. The plan

Five stages. Each stage names its **gate** — the thing that must be true before the next stage
starts. Nothing here deploys; step 27 is still the only deploy and it still runs last.

### 5.0 Stage 0 — housekeeping before anything moves (operator, ~10 min)

**Run 2026-09-07 (operator terminal), with two items of residue.** Done: `lsof` shows both
detached sessions gone (§6); `git fetch --prune origin`; `gh pr list --state open` read — it
shows **six** open PRs, the five §2 predicted **plus #51**, whose content already landed
(§0 item 3). Remaining:

1. **Push `main`** — `901078a`, `a73f2e1` and `f6eca71` are local-only, and the CP4 rebases
   target `origin/main`. `git status --porcelain` (expect empty), then `git push origin main`.
2. **Close #51** (`gh pr close 51 --comment "landed at CP1 as 6eaef5d; branch tip is an
   ancestor of main"`). Do not merge it.

**Gate:** clean tree, `origin/main` = `f6eca71`, open-PR list = #74, #71, #70, #48, #47.

### 5.1 Stage 1 — CP4 merge queue (attended session, main checkout, $0, no deploy)

Same fence as CP2/CP3: you merge, you launch nothing, you delete no branch, you create no
worktree. `git pull --ff-only` after each merge.

| # | PR | procedure |
|---|---|---|
| 1 | **#74** audit finding register | No conflict (re-verified vs `f6eca71`). Docs only. Merge as-is. **Before merging**, one edit on the branch: correct the "For step 27" bullet in `WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md` to name #62, #64 and #67 — (f4) records the overrule. |
| 2 | **#70 → #71** step 14 | Rebase the stack **from the top** in `48h-ws3-gazetteer-20260905`: `git rebase --update-refs origin/main` on `…-conflict-validate-route`; the union driver resolves `docs/PROGRESS.md`; resolve the `AGENTS.md` directory-map tail by keeping both. **Do not hand-resolve `src/lib/usage/cron-run.ts`** — the hunks are disjoint and must auto-merge; if git raises a conflict there, stop and paste it. Force-push both with `--force-with-lease`, re-run the gate, then `gh pr edit 71 --base main` after #70 merges. |
| 3 | — | Because #70 ⊆ #71, GitHub may close #70 as merged when #71 lands. Merging #70 first is still the right order — it keeps the two reports separable. |

**Gate (all of these, on `main`, on the Mac — this cannot be run from a remote session because
`node_modules` is macOS-only):** `npm run typecheck` · `npm run lint` · `npm test` (expect ≥ 4,015
/ 267 growing by step 14's tests) · `npm run build` with a dummy `DATABASE_URL` — **the build has
never once been run in this window** (register gap G4) and #64 added an App Router route with
`runtime`/`dynamic`/`maxDuration` exports that the pre-push hook cannot see. Then one closing
docs commit: the CP4 line in INDEX §10 — which must also record the four unlogged 2026-09-07
operator actions (`a5caeb7` signing, `3f09757` archive pass, `901078a` CP4 answers, Stage 0) —
**plus the WS2-F06 OPEN-TASKS entry** (A1's first half; text is in the register's WS2-F06
finding and (f2)). Commit, push.

### 5.2 Stage 2 — operator runs, the unblocking stage (operator, ~1.5 h)

Items 1–2 of the original stage — sign the CP1 batch, answer the open decisions — were done
2026-09-07 (`a5caeb7`, `901078a`; §3.1). What remains:

1. *(~10 min — do before step 20 launches)* **Sign (f1)–(f15)** into `AGENTS.md`'s log —
   end of `## Decision log`, date order. Not just hygiene: the **signed R7 entry still says
   "Sonnet 5 held"** pending console-billing confirmation, while the $2/$10 resolution and the
   `claude-sonnet-5` id live only in unsigned (f1)/(f12) — and §2.1 makes the log authoritative
   where sheet and log disagree, so a literal-minded step-20b session would refuse the Sonnet
   row. (f1) states why the console-billing standard is relaxed; signing it closes the trap and
   the rest of the batch rides along. If skipped anyway, step 20's prompt must say "read
   (f1)/(f12) over the signed R7 entry", and step 25 signs.
2. **#79 RU citation drain** per `RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md` (O2 signed):
   preflight SELECT → Neon backup branch → `--dry` → drain → `registry-materialize` → verify →
   decision-log entry with counts → delete the backup branch and say so.
3. **C5-m probes** (authorized, (f8), zero writes, zero spend, ≈10 min including politeFetch
   spacing): `npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to
   2026-08-31 --dry` and the ROCA equivalent; **paste both outputs into step 24's prompt** —
   the probes authorize the measurement only, not the production probe-order change.
4. **WS-1.1 ×3 capture run** per the run card in `INJECTION-CASES-DEV-2026-09-05.md`:
   `--estimate` first, `EVAL_DATABASE_URL` = the kept disposable branch (never production),
   campaign-local `LLM_SPRINT_USD_CAP` = $2.00 per D6/E15, `--capture-reconcile`, ledger entry.
5. **#48** — squash-relaunch so the roster commit never enters `main`'s history (step 10 item 5
   has the exact recipe); **#47** — merge.

**Gate:** the decision log carries the drain execution entry with counts (an execution record
appends regardless of when the f-batch is signed); the exposure ledger has a capture-run entry
with counts; the two C5-m outputs are in hand for step 24; `gh pr list` no longer shows
#47/#48.

### 5.2a Stage 2a — the D7/R4 measured remap run (attended, `ws2-remap`, ≈$0.05, new)

Authorized 2026-09-07 ((f10)/(f11)) — the survey's "defer is a fine answer" is superseded.
Attended per COMMON §4.10 (a step that spends under a signed D7 entry is never unattended);
not on any other step's critical path and independent of the CP4 merges, so it slots wherever
an attended hour exists. The binding values, all from (f10)/(f11) — the runbook §8 is the
procedure:

- Operative `--budget` **C = $1.00**; the operator's **$10 is the outer bound**, so a second
  (theater, track) day needs no new approval. Never `--execute` without both `--budget` and
  `--limit 1000`.
- **The caps are not C.** `MAP_SPRINT_USD_CAP = T + C`, `MAP_USD_CAP_DAILY = D + C`, computed
  off the fork's **copied** ledger on the day (T was $23.0763 on 2026-09-06 — illustrative,
  re-read it). A literal `MAP_SPRINT_USD_CAP=10` refuses the first reservation.
- `MAP_CONTENT_CHARS=1499` on the fork-bound local server only; **verify it is ABSENT from all
  three Vercel environments before AND after**, and show both checks in the closing report —
  if it ever reaches Vercel, the hourly worker silently re-maps the whole corpus at production
  spend. (Step 27's G3 env read re-confirms absence later, as a backstop — it does not replace
  the run's own before/after checks.)
- `--base-ack` fail-closed guard protects against addressing production; loopback needs no ack.
- Record the final `REMAP …` line, the fork's `openai_map` row before/after, the
  `doc_map_state` rows at the new version, the claims count — then **delete the fork**.

**Gate:** dated closing note appended to `MAP-REMAP-RUNBOOK-2026-09-06.md` with those
readings, both MAP_CONTENT_CHARS absence checks shown, fork deleted.

### 5.3 Stage 3 — the remaining build steps (parallel, one session per worktree)

Launch order matters only through the dependencies; everything on the same row is parallel.

| Order | Steps | Worktree | Ready when | Notes |
|---|---|---|---|---|
| A | **20** WS-2.4 eval parity | `ws2-routing` | now | #60/#61 on `main`; R2 = no registry bump; do not collide with #67's `unscorecarded` literal. **20b is fully unblocked** — R6 (reuse caps, no new env), R7/R7-b rows: `claude-haiku-4-5-20251001` $1/$5, `claude-sonnet-5` $2/$10 (alias-repoint rider: re-verify at first invoice; **sign (f1)/(f12) first — the signed R7 entry still reads "Sonnet held"**, §5.2 item 1) — **but the provider-blind `mapreduceProviderTag()` must be fixed BEFORE the Anthropic digest path is enabled** ((f13); else a Claude-synthesized digest is durably stamped `openai:…`) |
| A | **32** WS-7.2 citation mode | `ws7-tradecraft` | now (T2, T4, T4-b answered) | 29 + 30 merged. **Spec changed by T4/T4-b ((f6)/(f13))**: citation mode itself ships with T2's access date; the AI-tool disclosure is **BUILT and DARK on every surface**, gated by a policy function on the `view-policy.ts` pattern (never a constant), structured **per stage** — `synthesis` from the dispatch identity, `extraction` renders "not recorded for this digest", never back-filled; output carries a `tool disclosure withheld` marker; a test pins the disclosure OFF for every resolvable role |
| A | **33** WS-7.3 source descriptors | `ws7-docs` | now | 29 + 30 merged |
| A | **21** WS-4.2 reliability proofs | `ws4-ops` | now — **O3 answered** ((f5); fork proofs accepted, drill logged as follow-up) | $0; refusal fires before dispatch; cite (f5)/§2.2 instead of halting |
| B | **18** WS-3 audit | `audit-ws3` | after #70/#71 merged | **must also cover PR #63** — register gap G2, blocker-if-real: #63 edits `src/db/migrations.test.ts` (the ruling-2 guard) and lands 0028, and #64's ruling-5 evidence sits on top of it |
| B | **19** WS-3.3 evidence population | `ws3-conflict` | after #70/#71 merged | D4 and E5 are signed in the log (`a5caeb7`); E5 authorizes exactly one `docs/evals/analysis/` refresh, this step only |
| C | **23** remediate 17 + 18 | `ws2-routing` + `ws3-conflict` | after 18's register **and** your accept/defer marks on both registers | every fix needs a test that fails on the pre-fix code; owns the **WS2-F06** fix (A1) and the WS2-F04 runbook correction if step 25 has not landed it |
| C | **24** WS-3.5 scoreboard + soak prep | `ws3-gazetteer` | after 19 merged | no flag-on; prompt carries the two **C5-m probe outputs** (Stage 2 item 3) and **C15's reopening trigger** verbatim — any `publication_gap` whose confirming `probe_failed` came from the same backfill run reopens `first_observed_at` ((f14)) |
| C | **34** WS-7.4 likelihood mapping | `ws7-tradecraft` | after 32 merged — **T3 tables signed as drafted** ((f9), with T3-a/T3-b) | `ESTIMATIVE_MAP_V1`; the six invariants in (f9) are the exhaustive test's spec; any cell change is a new version, never an edit |
| D | **25** docs sync | `gov` | after every C merges (step 15 already done) | the register's 22-item stale-standing-text list is the work order; two of its items are **do-not-apply**. Also: **sign (f1)–(f15) into the log** if Stage 2 item 1 was skipped — end of `## Decision log`, date order, UNSIGNED markers removed in the copies (the `a5caeb7` precedent) |
| E | **26** final audit | `audit-ws2` | after CP4 freeze | see §5.4 for what it must absorb; it audits a log whose append convention changed (§3.2) |
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
| Read back the actual Vercel env values (`ASK_EMBED_MODEL`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `OPENAI_MODEL`, the five `<W>_PROVIDER`, `LOG_DRAIN_SECRET` — and `MAP_CONTENT_CHARS`, which must be **absent**, per R4's hazard binding) in all three environments | G3 | step 27's env posture listing — **and** it must happen before the drain is registered |
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
yet — fixing that text is a step-23 or step-25 item, and it must land before registration. A2 is
now signed to that effect ((f3)): the gate is **registration**, not deploy, and the corrected
order must be in front of the operator at the Vercel dashboard step — O1 puts them there
personally, so the runbook is the document they will be holding.

---

## 6. The two detached sessions — RESOLVED

The morning survey found two `claude` processes with no visible terminal (PID 27800 in the main
checkout; PID 55035, suspended, in `48h-ws3-gazetteer-20260905` — the duplicate step-14 session
from the double-issued Wave 3 launch list). Both were verified safe to kill: no unpushed commits
anywhere across the fourteen worktrees, and the only uncommitted files were the
`package-lock.json` churn COMMON §1 says to restore. **On 2026-09-07 the operator's
`lsof -a -d cwd -c claude | grep bnow` printed nothing — both are gone.** The `ws3-gazetteer`
worktree (HEAD on the lane branch `a821695`, an ancestor of `main`) is free for the Stage 1
rebase. Re-run the same `lsof` line immediately before pasting any Stage 3 launch, per
COMMON §4.11.

---

## 7. Open risks carried into the remainder

1. **Three majors gate the deploy** (§4). WS2-F04 is a runbook correction that must land before
   the drain is registered; WS2-F06 needs its own OPEN-TASKS entry and fix; WS2-F07 is two lines
   of test.
2. **No environment has ever been read.** Every "absent in every environment" claim in the window
   — including `.env.example:32` and `:59` — is taken from reports and `AGENTS.md`. Step 27's env
   posture listing is the first time it gets checked.
3. **Step 15's renumbering has already happened** (`3f09757`) — any report or step written
   against pre-2026-09-07 `AGENTS.md` line numbers is citing a renumbered file. The register's
   stale-text list is anchored by content as well as by line, deliberately; treat bare line
   citations elsewhere with suspicion. The f-batch is the one remaining signing debt (§3.1),
   and until step 25 (or Stage 2 item 1) lands it, the authoritative record of the CP4 answers
   is INDEX §2.2 + the (f) drafts, split across two files.
4. **One flaky unit test**, unrelated to any audited PR:
   `src/lib/evals/injection-dataset.test.ts` times out at ~5.1 s under full-suite subprocess load
   and passes alone. Route to the eval-plane owner; do not let it read as a regression.
5. **`CandidateDispatchIdentity.provider` is still `"openai" | "stub"`** (`contracts.ts:436`)
   although #60 added a provider dimension — the widening is step 20's PR-2.4-1, and #61's
   `headerIsLive` skip is keyed on that union. Related and newly found ((f13)):
   `mapreduceProviderTag()` is provider-blind and hard-codes `openai:` — latent while the
   Anthropic path is dormant, an ordering gate for step 20b.
6. **`claude-sonnet-5` is an alias, not a dated snapshot** ((f12)) — if Anthropic repoints it
   to a snapshot at a different rate, the pricing row silently under-meters (the gpt-5-mini
   failure mode by another door). Rider on the record: re-verify the rate whenever the
   Anthropic digest path is next touched, and at the first real invoice.

---

## 8. What this document did not verify

- **GitHub PR state** was unverifiable by the morning survey (`gh` unavailable there); the
  operator's 2026-09-07 fetch + `gh pr list` closed that gap — the mapping is now confirmed,
  and it surfaced #51 (§0 item 3). Remote-tracking refs cited here are as of that fetch.
- **Anything requiring `npm`.** `node_modules` holds darwin-arm64 binaries and neither
  surveying session ran on the Mac natively; no typecheck, lint, test or build has been run
  since CP3. Every gate in §5 is a Mac gate, and the Stage 1 gate runs the window's first
  `npm run build`.
- **Semantic mergeability of #70/#71.** `merge-tree` proves zero textual conflict (re-proven
  against `f6eca71` for this revision). The post-rebase typecheck is the evidence that the new
  route agrees with `main`'s re-signed `withCronRun`.
- **The register's own findings.** They are reported here as the register states them; this
  document re-derived none of them.
- **Execution state of the Stage 2 runs.** "Not run" for the #79 drain and the WS-1.1 capture
  run is asserted from the absence of a log/ledger entry, which is what those runbooks make
  authoritative — not from reading Neon.
