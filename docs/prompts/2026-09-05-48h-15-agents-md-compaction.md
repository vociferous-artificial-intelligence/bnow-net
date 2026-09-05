# Step 15 — AGENTS.md compaction into `docs/DECISIONS.md` (#92, WS-6.2) (Wave 2, lane G)

| | |
|---|---|
| Model / effort / mode | Sonnet / medium / plain session — mechanical move with a byte-identity check script |
| Lane / worktree | G — `/Users/go/code/bnow-net-worktrees/48h-gov-20260905`, step branch `…/agents-md-compaction` |
| Window | H10 → H13, after step 01 (and the signed decision entries from step 10) are on `main` |
| Depends on | 01 merged; 10 done (so the entries you move are complete) |
| Decisions | D5 — approve; inline window (INDEX recommends 7 days); restore strict date order (recommended). If D5 is unanswered: print `AWAITING AUTHORIZATION: D5`, write only the check script, and stop. |
| Spend | $0 |
| Closing report | `docs/reviews/AGENTS-MD-COMPACTION-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first. This PR is a bulk edit and must be its own
PR (OPEN-TASKS #92 says so); never ride it on a release.

## Facts (verified 2026-09-05; re-verify line numbers after step 01's edits)

- AGENTS.md is 1,917 lines; the decision log is split: block 1 at ≈501-961 under
  `## Decision log` (15 entries, incl. the out-of-order 2026-08-31/09-01 entry at ≈914) and
  block 2 at ≈1040-1917 appended AFTER `## Operating protocol` (20 entries, 2026-08-21 …
  2026-09-04, plus whatever step 10 appended). Standing sections ≈578 lines; snapshot ≈256.
- The archive is **`docs/DECISIONS.md`** (1,480 lines; preamble :1-14 says entries move here
  verbatim and the preamble is corrected each pass; :16-19 records that a prior pass restored
  ascending date order while keeping text byte-identical — reordering is sanctioned, editing
  is not). Named by AGENTS.md:10, :98, :109, :497-498 and OPEN-TASKS #92 (:1149-1158). The
  handoff's `docs/DECISION-LOG.md` is NOT used (INDEX §1.1).
- Other docs cite log entries by DATE (never by line): CURRENT-STATE.md:27,191;
  OPEN-TASKS.md:271,346; reviews/MR3-CHECKPOINT.md:6; QF-A-…-CLOSEOUT-2026-08-27.md:4;
  AI-SEARCH-PHASE-0-measure-2026-07-19.md:8; EVAL-VALIDATION-PARITY-2026-09-04.md:152;
  CONFLICT-EVALUATOR-LANDING-2026-08-24.md:36; PENDING-MERGE-ADJUDICATION-2026-08-25.md:61,85;
  inside AGENTS.md: :307, :1144, :1475, :1480. Ruling numbers are cited ≈500 times across
  docs/ and src/ and must not change.

## Do

1. Write `scripts/check-decision-log-move.sh` (bash 3.2/BSD-clean, `#!/usr/bin/env bash`):
   extracts every entry header `- **YYYY-MM-DD` … `(` … `)**` and the full entry body from
   AGENTS.md + DECISIONS.md BEFORE (from `git show origin/main:…`) and AFTER, and asserts:
   every entry body present before is present byte-identical afterwards in exactly one file;
   the union is date-ascending within each file; no entry duplicated; the standing sections
   of AGENTS.md (everything outside the log) are byte-identical except the pointer text you
   add and the OPEN-TASKS/directory-map lines below. Keep the script (it is the acceptance
   test for every future archive pass).
2. Move: per D5's window, entries older than the window go to the END of
   `docs/DECISIONS.md` in ascending date order (byte-identical bodies); the remaining entries
   are reunified under `## Decision log` in ascending order (moving the block-2 entries up
   from below `## Operating protocol`); the out-of-order 2026-08-31/09-01 and the
   2026-08-18-carried-at-08-24 entries are placed by date (D5 says restore order; note the
   original placement in the DECISIONS.md preamble).
3. Update: `docs/DECISIONS.md` preamble (:1-14 → eighth pass, new split date, the ordering
   note); AGENTS.md:495-499 log header ("entries older than <date> live in
   `docs/DECISIONS.md`; append new entries at the end of this section"); OPEN-TASKS #92 →
   done with the script name; the AGENTS.md directory map line for `docs/DECISIONS`.
4. Do NOT touch the standing snapshot text (compacting it is a separate DECISION the report
   lists), rulings, conventions, credentials, protocol.

## Acceptance

`bash scripts/check-decision-log-move.sh` passes and its output is pasted into the report
(and `bash -n` of the script succeeds under `/bin/bash` 3.2); the DECISIONS.md preamble's
"last archived entry" date is verified against the actual last entry after the move;
`wc -l AGENTS.md` before/after; `git grep -c "decision log" docs/ src/` unchanged; a grep for
each dated cross-citation above still resolves to an entry in one of the two files.

## Report

Per COMMON §5, with the line counts and the script output. In **Handoff**: the new append
location for later steps (sessions after this merge append under `## Decision log`, not at end
of file — step 25 and the final audit must know), and the snapshot-compaction DECISION.
