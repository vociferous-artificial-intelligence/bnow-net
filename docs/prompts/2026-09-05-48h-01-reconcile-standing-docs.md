# Step 01 — Reconcile standing docs with `main` (Wave 1)

| | |
|---|---|
| Model / effort / mode | Sonnet / medium / plain session |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-gov-20260905` |
| Window | H0 → H2 |
| Depends on | — (first PR of the program; merges before 02, 03, 15) |
| Decisions | D11 (may correct AGENTS.md standing text now — INDEX recommends yes) |
| Spend | $0. No DB access needed. |
| Closing report | `docs/reviews/STANDING-DOCS-RECONCILIATION-2026-09-05.md` + `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Goal

Make AGENTS.md and the operator queues true to `origin/main` @ `883e5e3` and to the facts
in the handoff, so every later PR in the program can cite AGENTS.md as current. Draft — do
not append — the decision-log entries the operator will sign at H0/CP1. One docs-only PR.

## Read

`AGENTS.md` in full (yes, all 1,917 lines — you are the session that fixes it);
`docs/CURRENT-STATE.md`; `docs/OPEN-TASKS.md`; `docs/BLOCKERS.md`; `docs/HUMAN-SETUP-TODO.md`;
`docs/SETUP-NEXT-WEEK.md`; `docs/PROGRESS.md` (last 300 lines); the handoff §1 and §5;
INDEX §1 and §2. Run `git log --oneline -20 origin/main` and `git branch -a`.

## Do (in place, one commit each)

1. **Snapshot truth.** AGENTS.md:105 "verified 2026-09-03" bullet block: production is still
   `dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` / `8a19ade`, but `main` is now `883e5e3` — the merge of
   PR #46 (validation five-vote parity, `07579f6`) after PR #45 (`9854626`). State plainly that
   `main` is code-ahead of production by eval-plane-only PRs #45/#46 and that PRs #47/#48 are
   open (docs-only). Correct AGENTS.md:112 and :142 ("main == production") and
   CURRENT-STATE.md:25 and :642-644 in place.
2. **PR #46 merge record.** The 2026-09-04 PR-2 log entry (AGENTS.md ≈1874-1916) records no
   merge hash. Do NOT edit that entry. Draft a new dated entry (see 7) recording
   `883e5e3` as PR #46's merge commit.
3. **Credentials.** AGENTS.md:978 already says the Neon key works. Append a dated closure line
   to `docs/BLOCKERS.md` (it is a dated log — append, do not edit the 2026-07-15 item) saying
   the saved `NEON_API_KEY` works (PROGRESS.md:1502 same-day; disposable forks on 2026-09-03/04;
   Wave-0 probe result the operator gives you — if none is given, write "operator to confirm").
   Fix `docs/HUMAN-SETUP-TODO.md:49-50` in place. Leave VERCEL_TOKEN (expired; CLI session
   deploys) and ANTHROPIC_API_KEY (absent) as they are; correct `docs/SETUP-NEXT-WEEK.md:29-31`
   so it no longer advertises an Anthropic key as a drop-in alternative (the seam is unmetered
   and unregistered — OPEN-TASKS #83; step 09 hardens it).
4. **Stale OPEN-TASKS headers** (body text already says the truth; fix the header/status line,
   never the numbering): #89 (header :1104; the md5-arm repair that closes it is in #102's
   body :1542-1550); #92 (AGENTS.md is 1,917
   lines, 20 bullets after `## Operating protocol`, not ~1,040); #100 (`scripts/ask-eval-harvest.ts`
   IS on main with `new OpenAI()` at :190 — so #82 is live debt); #102 and #103 headers still
   say "fix in review"/"blind spot" while their STATUS says deployed. Add a cross-link from
   WS-1.5's gate item #81 to the handoff. Do not close anything the body does not say is closed.
5. **`#108`.** It does not exist. Add a one-line note under #100 or #107 that the handoff's
   "#108 withheld harness" refers to the parked branch `claude/local-model-ask-eval-20260817`
   (`docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-96`) unless the operator names
   another locator (INDEX R5).
6. **Directory map** (AGENTS.md:64-103): add `src/lib/conflicts/` (71-file pure domain library,
   imported by nothing in production), `src/lib/evals/`, `src/lib/embeddings/`,
   `src/lib/scoreboard/`, `src/lib/registry/`, `src/lib/analyst/`, `src/lib/analytics/`,
   `src/lib/cron/`, `docs/prompts/`, `docs/evals/`; fix the `drizzle/` line to say
   `0000–0027` + `9999`. One line each, matching the existing style.
7. **Draft decision-log entries** into `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md`, in
   the exact log format (`- **YYYY-MM-DD (title)** body…`, 2-space continuation, blank line
   between), one per item, each marked `[UNSIGNED — operator]`: (a) PR #46 merge record;
   (b) the 2026-09-05 step-1A execution as stated in handoff §1 (development-split ×3
   gpt-4o-mini baseline with capture, blinded labeling packet, artifacts outside the repo
   with SHA manifests; human labels pending) — write it as "as reported by the operator" and
   include the step-1 authorization language the successor plan proposes at
   `EVAL-SUCCESSOR-PLAN-2026-09-04.md:59-67`, because no in-repo entry records that
   authorization (INDEX §1.6); (c) one entry per H0 decision in INDEX §2 with the option
   fields blank for the operator to fill; (d) the 48-hour program itself (this index, the
   lanes, the "nothing deploys before step 26" rule). Do not append any of these to AGENTS.md.
8. **Correct the handoff itself** so the next planning session does not inherit stale
   claims: add a short "Corrections (2026-09-05, program index §1)" block at the top of
   `docs/prompts/2026-09-05-cto-roadmap-handoff.md` listing, one line each: DECISIONS.md not
   DECISION-LOG.md; NEON key works; WS-3.1 Option 3 per the design doc; `#108` locator; `#44`
   rescope; step-1 authorization recorded only by the entry you draft in 7(b); `docs/evals/README.md`
   is the Ask eval README (the analysis one is `docs/evals/analysis/README.md`). Do not edit
   the handoff body.
9. Record in the report every standing line you changed (file:line before → after).

## Tests / acceptance

`npm run lint` (markdown is not linted, but run it), `npm test` unchanged, `git diff --stat`
shows only the files above. No decision-log entry edited (`git diff AGENTS.md | grep '^-'`
must show no removed lines from below `## Decision log` except inside the standing
sections that were moved by earlier passes — if in doubt, none).

## Report

Per COMMON §5. In **Handoff**: the list of unsigned drafts; whether the operator confirmed
the Neon probe; the exact `main` SHA you verified; and any standing text you found wrong but
did not fix (with why).
