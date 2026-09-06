# Release checklist (#39/#78/#84) + #79 RU citation drain runbook (48h program step 03)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-03-release-checklist.md` (COMMON read first).
- Lane/worktree: G, `/Users/go/code/bnow-net-worktrees/48h-gov2-20260905` (same session
  as step 02, per the lane table: "02 → 03 (one session)").
- Branch: `48h/gov2-20260905-step03-release-checklist`, cut from step 02's already-pushed
  tip `a37ada2` (not the bare lane branch) — deliberate, since this step cross-links the
  CLAUDE.md/README.md deploy lines step 02 rewrote, and I wanted those edits visible in
  the working tree while writing the cross-references.
- Base: ultimately `origin/main` `4e5b00f` (same as step 02; step 02's PR #50 is not yet
  merged, so this branch currently also carries step 02's commits — will need rebasing
  once #49 → #50 land, per step 02's own Handoff note).
- PR: to be opened after this report is committed (see below).

## Built

One PR (docs only, no source-behavior change), three commits' worth of content landing
in one commit on this branch:

- **`docs/RELEASE-CHECKLIST.md`** (new) — 11 numbered steps, each citing the record it
  came from: baseline reconstruction, pre-deploy observation gate (nested-`counts` sweep
  per #87), merge with diff re-inspection + byte-identity check, release-clone preflight,
  cap-env parity (ruling 4), the #84 headroom record marked "may not be skipped", rollback
  target from the current ladder floor, deploy-from-plain-clone-only (#78), post-deploy
  verification (ruling 21 body checks + natural-cadence observation), `--estimate` before
  spend, and migration application as its own line with backup-branch-first (Iran
  precedent). A "Known gaps" section states #39/#78/#84's real status honestly rather than
  claiming this document closes them outright.
- **`docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`** (new) — the operator
  runbook for OPEN-TASKS #79, to be run at step 10 under decision O2. Seven steps
  (preflight, backup, dry run, drain, materialize, verify, record), a cost-basis
  statement backed by actually reading `isw-refresh.ts`'s and `registry-materialize.ts`'s
  import lines (neither imports any LLM/OpenAI module), an explicit note that
  `scripts/sqlq.ts` has no read-only guard, and a draft decision-log entry template for
  the operator to fill in and paste after running.
- **Cross-links:** `CLAUDE.md`'s and `README.md`'s Deploy lines (the ones step 02
  rewrote) now each end with "Full sequence: `docs/RELEASE-CHECKLIST.md`."
  `docs/OPEN-TASKS.md` #39 and #78 each got a `STATUS 2026-09-06` line: "checklist
  codified" — explicitly not claiming either item is closed, since the underlying gaps
  (no Git→Vercel integration; worktree deploys still ship no stamp) are unchanged.
- **`.github/workflows/ci.yml`:** one comment line added above the `integration` job
  stating its green check is not evidence (clean-skips without `NEON_API_KEY`) and that
  PRs report local disposable-fork runs instead. No behavior change (YAML comment only).

## Tests

- Before: typecheck clean · lint 0 errors (3 pre-existing warnings, unrelated files) ·
  unit **3,612 passed / 247 files**.
- After: typecheck clean · lint 0 errors (same 3 warnings) · unit **3,612 passed / 247
  files** — unchanged, as expected for a docs + one YAML comment change.
- No fork itest run: no schema, migration, or query-path change in this PR.
- **Spend: $0.** No paid provider call. No production access of any kind, including
  reads: the prompt's own Spend line gates even the read-only preflight SELECT behind
  explicit operator say-so ("Optional read-only preflight SELECT against production only
  if the operator says so"), and O2 (the decision authorizing the #79 drain itself) is
  unsigned as of this session (see Decisions needed) — so this step documented every
  command for the operator to run, rather than running any of them, including the reads.

## Rulings touched and how each is satisfied

- **Ruling 4 (spend, fail-closed caps)** — not exercised, but directly documented: the
  checklist's step 5 states the exact AGENTS.md ruling-4 requirement (set new cap envs in
  ALL Vercel environments before deploying the guard that reads them) as a checklist gate,
  and the runbook explicitly notes neither script it drives can spend (no LLM import).
- **Ruling 5 (migration additivity)** — the checklist's step 11 states migrations are
  applied separately from code deploys, backup-branch-first, citing the Iran recovery
  precedent (`backup-pre-iran-recovery-2026-08-15`) and the 2026-07-21 Ask release
  (migrations 0021–0027). No migration is touched by this PR itself.
- **Ruling 21 (gate as page's first statement)** — the checklist's step 9 states the
  post-deploy authorization smoke must check response BODIES (bare GET + `RSC: 1`), not
  just status codes, and to classify every grep hit rather than trust a "clean" result at
  face value — directly encoding the ruling-21 lesson (a 307's body can still leak).
- **COMMON §4.9 (spend/production-write/eval-write authorization is never implied)** —
  honored: O2 is unsigned, so this step wrote the runbook and stopped; it did not run the
  preflight SELECT, the backup-branch creation, or any drain step. This PR is not marked
  HELD because it makes no request that needs O2 — only the runbook's own future
  execution does, and that's the operator's action at step 10, not this PR's.
- **No vendor branding** — none in the commit, PR, or file contents.
- **AGENTS.md write-lock** — not touched; this step's scope is CLAUDE.md, README.md,
  OPEN-TASKS.md, and two new docs files, none of which is AGENTS.md.

## Citations re-verified

- `docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md` — read in full; §1–§7 map directly to
  checklist steps 1, 2, 3, 4, and 9.
- `docs/CURRENT-STATE.md:600-650` — matched (verified against the file as it stands after
  step 02's edits to the WSL2/DNS bullet inside that range).
- AGENTS.md's 2026-08-24 QF-A entry, "standing 2026-08-03 separation" — cited at
  `AGENTS.md:1483` in my worktree (shifted +8 lines from the prompt's "~1474-1477" by step
  02's earlier Conventions-section addition at line 962; content matches).
- AGENTS.md's 2026-08-27/28 reliability-queue entry — matched at line 1654 (prompt cited
  "~1646-1652"; same +8-line shift).
- `docs/OPEN-TASKS.md` #39 — matched exactly at :313-316 as cited. #78 — actual text sits
  at **:805-813**, not the cited :802-810 (off by ~3 lines from intervening edits by other
  sessions). #79 — actual text at **:814-820**, not :811-817. #80 — actual text at
  **:821-823**, not :818-820. #84 — matched closely at :855-873 (cited :852-870, off by
  ~3). All four items' *content* matched the prompt's description; only line numbers had
  drifted. Corrected here per COMMON §4 ("cite the corrected line if it moved").
- `scripts/isw-refresh.ts` — read in full (141 lines with step 02's earlier comment
  reword, vs the prompt's "all 138 lines" — the 3-line growth is step 02's own edit to
  this file's header comment, verified benign).
- `scripts/registry-materialize.ts` — read in full (119 lines); confirmed the
  `DATABASE_URL_UNPOOLED || DATABASE_URL` fallthrough (line 20) matches OPEN-TASKS #80's
  description exactly.
- `scripts/sqlq.ts` — read in full (20 lines); confirmed no read-only guard (executes
  `process.argv[2]` verbatim via `sql.query`).
- `src/app/health/page.tsx:76` — matched exactly (`VERCEL_GIT_COMMIT_SHA?.slice(0, 7)`).
- `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md` backup-branch section — matched at
  :318-322 (prompt cited "~:319-321"; close, content matches: rollback paths + the named
  backup branch `backup-pre-iran-recovery-2026-08-15` / `br-polished-block-atu0r968`).
- `scripts/neon-branch.ts` — read in full; confirmed it always names branches
  `itest-<Date.now()>` with **no** custom-name argument — flagged explicitly in the
  runbook rather than silently assuming parity with the Iran recovery's differently-named
  branch.

## Decisions needed

- **O2** (CP1, per INDEX §2: "authorize production writes for `isw-refresh.ts --theater
  ru` + `registry-materialize`; take a Neon backup branch first?") — **unsigned** as of
  this session (the INDEX §2 table's Operator Comment column is blank for O2, unlike
  D1–D12/E1–E4/R1–R5/O1 which all carry an explicit operator answer). The recommendation
  in the table ("Authorize; take the backup branch — Iran precedent") is not itself an
  authorization; per COMMON §4.9 I did not run anything gated by it. **This does not
  block or HELD this PR** — the PR only writes the runbook. It blocks step 10's execution
  of that runbook until signed.

## Debt and risks

- The release checklist is a **living document going forward, not a retroactive audit**
  of every past release — I did not re-verify that every past deploy actually followed
  all 11 steps (that would be a separate archaeology task); I built it from the fullest
  single record (`ASK-FAMILY-RELEASE-2026-08-29.md`) plus the specific gaps OPEN-TASKS
  already names (#84's four-miss streak, #78's worktree-stamp defect, #39's missing git
  integration).
- The runbook's step 1 preflight count ("~36 pending") is the 2026-08-15 OPEN-TASKS #79
  figure, not re-verified live by this session (per the Spend-line gate above) — it may
  have drifted by the time step 10 runs; the runbook says so explicitly and tells the
  operator to trust the live query over the historical figure.
- `docs/RELEASE-CHECKLIST.md` step 8's VERCEL_TOKEN status is deliberately left hedged
  ("see AGENTS.md's credentials table for its current status before assuming either
  way") rather than asserting either "expired" or "valid" — D8/D11 record the operator
  confirming VERCEL_TOKEN is now valid and correctly scoped, but that correction belongs
  to step 01's AGENTS.md reconciliation (PR #49, not yet merged), not to this PR.
- This branch currently sits on top of step 02's commits (not the bare lane branch) —
  see Scope. Once #49 (step 01) and #50 (step 02) merge in order, this branch/PR needs a
  rebase onto the resulting `main` before it can merge cleanly; the diff itself (this
  step's actual new content) is independent of both and should rebase without conflict.

## Handoff

- **New obligations vs. codified habit:** steps 1–4, 7, 8, 9, 11 of the checklist codify
  what releases already did (drawn directly from `ASK-FAMILY-RELEASE-2026-08-29.md`).
  Steps 5 (cap-env parity as an explicit checklist line) and **6 (#84 headroom record) are
  the two genuinely NEW obligations** — #87's nested-`counts` sweep (step 2) was already
  informally practiced in recent releases but had never been written down as a checklist
  requirement before this PR. Step 10 (`--estimate` before spend) generalizes a pattern
  that already existed per-script (map-backfill, x-gap-backfill) into a standing release
  rule.
- **#79 runbook's expected counts:** ~36 `ru` reports pending (2026-08-15 figure, may have
  drifted — re-run the step 1 SELECT for the real number before trusting this). After a
  clean drain: pending → ~0, `source_theater_stats` for `ru` populated with a non-zero
  row count and average reliability score.
- **Exact decision-log text for step 10** to paste after running: the template block in
  `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`'s "Record" section (step 7) —
  fill in the bracketed values from the actual run's output.
- **Merge order:** #49 (step 01) → #50 (step 02) → this PR, per Checkpoint 1 and step
  02's own flagged dependency. Rebase this branch onto `main` after #50 lands.
- Nothing here blocks or changes any other lane's work; no shared state (env, cap,
  schema, registry) was touched, and no production access of any kind occurred.

## Proposed AGENTS.md changes

None. This step's scope is CLAUDE.md/README.md/OPEN-TASKS.md and two new `docs/` files;
it does not propose a decision-log entry (the future #79 drain's decision-log entry is
drafted as a *template* in the runbook itself, for the operator to fill in and sign when
they actually run it — that is a step-10 artifact, not a step-03 proposal).
