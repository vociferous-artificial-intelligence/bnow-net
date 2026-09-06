# Standing docs reconciliation — 2026-09-05 (48h program step 01)

## Scope

Prompt: `docs/prompts/2026-09-05-48h-01-reconcile-standing-docs.md`, preceded by
`docs/prompts/2026-09-05-48h-COMMON.md` and `docs/prompts/2026-09-05-48h-00-INDEX.md`
(read in full). Lane/worktree: `48h-gov` at
`/Users/go/code/bnow-net-worktrees/48h-gov-20260905`. Branch:
`48h/gov-20260905-step01-reconcile-standing-docs` (the worktree and branch already existed
when this session began, apparently created by an earlier reconnaissance pass in this same
session that also ran `npm install`; this session adopted it rather than re-creating it —
noted as a deviation from the exact branch-naming convention
`48h/<lane>-20260905/<step-slug>` in Handoff below). Base: local `main` at `4e5b00f`
(`origin/main` is `883e5e3`; local `main` carries three additional unpushed commits —
`afeef2b` the CTO handoff, `a912c7a` the 48h program docs, `4e5b00f` the operator's
decision-sheet comments — which is why this worktree was cut from local `main`, not
`origin/main`: the program's own prompt files exist only there today). Commit: `84c3ad5`.

## Built

One docs-only commit, `84c3ad5` ("docs: reconcile standing docs with main (48h program
step 01)"), touching:

- `AGENTS.md` — snapshot header, the two "main == production" lines, directory-map
  additions, `drizzle/` range fix.
- `docs/CURRENT-STATE.md` — the matching production/`main` divergence correction in two
  places (the top-of-snapshot bullet and the "Git:" bullet near the file's end).
- `docs/OPEN-TASKS.md` — header/status corrections for #89, #92, #100, #102, #103; a
  cross-link from #81 to the roadmap handoff; a "#108 does not exist" note under #100.
- `docs/BLOCKERS.md` — a new 2026-09-05 dated section closing the 2026-07-15 NEON_API_KEY
  entry.
- `docs/HUMAN-SETUP-TODO.md` — corrected the stale "401" framing in §4.
- `docs/SETUP-NEXT-WEEK.md` — corrected the Anthropic-as-safe-fallback claim in §1.
- `docs/prompts/2026-09-05-cto-roadmap-handoff.md` — a "Corrections (2026-09-05, program
  index §1)" block added at the top; the body is untouched.
- `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md` (new) — unsigned draft decision-log
  entries: PR #46's merge hash, the step-1 authorization (as reported), one entry per H0
  decision already answered in the program index, and the program's own authorization.
- `docs/PROGRESS.md` — a plan block + execution summary for this session.

**Update:** the operator chose "push main, then push the step branch and open the PR." Local
`main`'s three prerequisite commits (`afeef2b`, `a912c7a`, `4e5b00f`) were pushed to
`origin/main` as a clean fast-forward (`883e5e3..4e5b00f`, pre-push gate green), then this
branch was pushed and opened as
[PR #49](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/49) against
`main`. `origin/main` now carries the 48-hour program's own founding docs, so every other
lane's worktree (created per INDEX §4 `git worktree add ... origin/main`) sees them without
needing the local-`main` workaround this step used.

## Tests

Unit: 3,612/3,612 (247 files), unchanged before and after (docs-only diff). Typecheck
clean. Lint: 0 errors, 3 pre-existing unused-var warnings in test files (unchanged, matches
AGENTS.md's own note). No fork/integration tests run — no DB-touching change. Spend: **$0**.

## Rulings touched and how each is satisfied

- **Maintenance rule (AGENTS.md:5-11).** Every correction was made in place in the standing
  section it belongs to; nothing wrong was left standing with a fix "buried in a log entry."
  No decision-log entry was edited (`git diff AGENTS.md | grep '^-'` shows deletions only
  from standing sections — the directory map, the snapshot header line, and the two
  "main == production" sentences — confirmed by re-running that exact grep after the
  commit; zero deleted lines from below `## Decision log`).
- **Ruling 5 (migrations, forward-only, `9999_claim_source_trigger.sql` last).** Untouched —
  no migration touched by this step; the `drizzle/` directory-map line was corrected for
  accuracy (0000–0027, not 0000–00NN) but no file under `drizzle/` changed.
- **COMMON §3 forbid list.** Not opened: `RECONCILIATION-KEY.json`,
  `AI-DIAGNOSTIC-ANALYSIS.md`, either eval-artifacts folder, the frozen eval-campaign
  worktree, `docs/evals/analysis/*.json`, `scripts/evals/corpus-v2/build-draft.py`, or any
  heldout content. This step's scope (standing docs, not eval-plane code) never required
  them.
- **COMMON §4 item 7 (AGENTS.md write-lock).** Step 01 is one of the five sessions
  authorized to edit AGENTS.md standing text this window (INDEX §4); every other proposed
  correction (the ones this step found but was not scoped to fix — see Debt below) is left
  for a later pass rather than applied here.
- **COMMON §4 item 9 (spend/production-write/eval-dataset authorization is never
  implied).** No run was made; the one authorization this step interacts with (D6, the
  step-1 capture-run ceiling) is drafted for signature, not executed.

## Citations re-verified

- AGENTS.md is 1,917 lines / 157,962 characters (measured this session before any edit;
  `wc -l`/`wc -c`) — matches INDEX §1.13's line count and confirms the operator's D5
  150k-char ceiling (packet §2) is currently exceeded, information carried into decision
  entry (c)/D5 in the draft file for step 15.
- The 2026-09-04 PR-1 and PR-2 decision-log entries end AGENTS.md at line 1917 exactly (no
  trailing content after); a new entry appends immediately after, which is what step 15
  (or the operator, on signing) will do — this step did not append it.
- OPEN-TASKS.md item numbers and line anchors: #89 header at (pre-edit) line 1104, #92 at
  1149, #100 at 1465, #102 at 1511, #103 at 1588, #81 at 825, #107 at 1669 (last item in the
  file — confirmed no #108 exists via full-file grep for "108").
  `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-96` (re-verified — the
  `claude/local-model-ask-eval-20260817` bullet, "Related debt now tracked: OPEN-TASKS
  #100") supports the "#108" locator note.
- `scripts/ask-eval-harvest.ts` re-verified present on `origin/main` (`git show
  origin/main:scripts/ask-eval-harvest.ts` succeeds) with `new OpenAI()` at line 190 —
  the #100 header's prior claim ("lives on the parked branch, not on `main`") is stale;
  corrected.
- `docs/BLOCKERS.md`'s 2026-07-15 entry (lines 74-79, unedited — the closure is a new
  appended section, per the maintenance discipline for a dated log) and
  `docs/PROGRESS.md:1502`-area text ("the saved `NEON_API_KEY` works again ... the earlier
  401 is cleared") re-verified — the exact wording is quoted in the new BLOCKERS.md
  section and in HUMAN-SETUP-TODO.md's correction.
- `docs/HUMAN-SETUP-TODO.md:49-50` re-verified as the exact stale "currently returns 401"
  lines named in the step prompt; corrected in place.
- `docs/SETUP-NEXT-WEEK.md` lines ~29-31 (the Anthropic paragraph in §1) re-verified and
  corrected; OPEN-TASKS #83 re-verified as the citation for "unmetered and unregistered."
- `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` §2 and the WS-3.1 Option-3 finding
  are taken from INDEX §1.3 as already-verified by the planning process; this step did not
  re-open the design doc (out of scope — WS-3 is step 05's territory), only added the
  correction pointer to the handoff.
- `docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md:59-67` re-verified and quoted verbatim in
  decision-entry draft (b).

## Decisions needed

None of the H0 decisions are newly raised by this step — they were already answered by the
operator in `docs/prompts/2026-09-05-48h-00-INDEX.md` §2, and this step's job was to turn
those answers into signable decision-log-format entries (see
`docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md`, section (c)). Two items surfaced while
drafting that the operator should look at directly rather than have this session guess:

- **D6's exact ceiling.** The operator wrote "$0.50 to $2.00" as a range, not a single
  figure; the successor plan's proposed authorization asks for one campaign-local
  `LLM_SPRINT_USD_CAP` value. The executing session (whichever runs the step-1 capture run)
  should either pick a value in that range and record it, or ask the operator to name one.
- **D9's model identity.** "Use Astra via openai key to 'author'" is ambiguous — INDEX §3
  defines Astra as "the second frontier model, used where independence from Fable's
  reasoning is the point," which reads as a distinct provider, not an OpenAI-hosted model.
  Step 07 (injection-case authorship) should confirm the concrete model/deployment this
  resolves to before proceeding, rather than assume.
- ~~Whether to push this branch / open a PR now.~~ **Resolved** — operator chose to push
  `main` first; PR #49 is open (see Handoff).

## Debt and risks

- **Not fixed, flagged only:** AGENTS.md's credentials-table VERCEL_TOKEN line still says
  "expired" with a CLI-live caveat; the operator's D8 answer ("VERCEL_TOKEN is valid and
  correctly scoped to bnow-net") is more precise than that table entry. Left uncorrected
  because it is outside this step's assigned edit list (the step prompt names specific
  lines/files; the credentials table's VERCEL_TOKEN row was not one of them), and because
  D11's authorization ("remove note VERCEL_TOKEN is working now retricted to bnow-net
  project") is closer to step 02/03's port-hygiene and release-checklist territory than to
  this step's standing-snapshot scope. Recorded in decision-entry draft (c)/D11 for
  whichever step picks it up.
- **`docs/PROGRESS.md`'s own PR-2 entry says "unit 3,608/3,608 (247 files)"** while
  AGENTS.md and the round-2 review report both say 3,612/3,612 for the same PR. Found while
  reading the PROGRESS.md tail; not fixed — PROGRESS.md is historical narrative rather than
  a standing section this step's write-lock authorizes editing, and a one-digit discrepancy
  in a narrative log is not one of the nine listed "Do" items. Flagged here rather than
  silently left.
- **The exposed worktree-creation deviation.** This step's worktree/branch were created
  before this session's own explicit worktree-creation step, apparently by an earlier
  reconnaissance-only sub-task in this same conversation that exceeded its stated scope
  (it was told to do read-only reconnaissance and instead also ran `git worktree add` and
  `npm install`). No standing-docs content was affected by that — it only prepared the
  environment — but the branch name it chose,
  `48h/gov-20260905-step01-reconcile-standing-docs`, does not match COMMON's
  `48h/<lane>-20260905/<step-slug>` convention exactly (dash before the slug instead of a
  slash). Left as-is rather than renamed, to avoid disturbing the worktree's git state; a
  later step should not copy this naming.
- **Wave-0 Neon probe.** This step did not itself run
  `npx tsx scripts/neon-branch.ts create`/`delete` (INDEX §0 Wave 0) — the evidence for
  "the key works" is the 2026-09-03/04 eval PRs' own disposable-fork integration runs
  (160+/25 files and more), which is strong but not the specific Wave-0 probe. Recorded as
  "operator to confirm" in the BLOCKERS.md closure note, per the step prompt's instruction.

## Handoff

- **AGENTS.md and CURRENT-STATE.md are now true to `origin/main` @ `883e5e3`** and to the
  facts in the handoff; every later PR in the program can cite them as current. The next
  session touching AGENTS.md under the write-lock is step 02/03 (single-line corrections
  only) or step 15 (compaction) — step 15 should also apply the credentials-table
  VERCEL_TOKEN wording fix noted above.
- **Unsigned decision-log entries are waiting in
  `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md`.** The operator should read section
  (c) especially — every H0 item they already answered in the index is drafted there in
  decision-log format, ready to copy into AGENTS.md's `## Decision log` (append at the
  file's end, per the standing convention until step 15 lands). This session did not
  append any of them itself.
- **Pushed and opened.** `origin/main` fast-forwarded to `4e5b00f` (`883e5e3..4e5b00f`,
  pre-push gate green, no force push), then this branch was pushed and
  [PR #49](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/49) opened
  against `main`. `origin/main` now carries the program's own founding docs (handoff, INDEX,
  COMMON, 28 step prompts, the operator's decision-sheet comments), so every other lane's
  worktree (`git worktree add ... origin/main` per INDEX §4) sees them directly — the
  local-`main` workaround this step needed no longer applies to later steps.
- **Next prompt to rewrite:** none — step 01 needed no SKETCH rewrite. Steps 02/03 (same
  worktree family, `48h-gov2`) can proceed once their worktree is cut from `origin/main`
  (now current) and PR #49 is merged, so they see the corrected AGENTS.md rather than the
  stale one.
