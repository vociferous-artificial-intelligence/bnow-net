# Step 25 — Docs sync: statuses, snapshot, cross-references, program log

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-25-docs-sync.md` plus its two dated addenda
  (2026-09-09, 2026-09-10) and `docs/prompts/2026-09-05-48h-COMMON.md`.
- Lane / worktree: `gov`, `/Users/go/code/bnow-net-worktrees/48h-gov-20260905`.
- Branch: `48h/gov-20260905-docs-sync`, cut from the lane branch `48h/gov-20260905`, which
  was up to date with `origin/main`.
- Base SHA: **`619986c`** — Stage 3 fully merged (steps 04–24 plus both governance PRs
  #47/#48) except this step; `gh pr list --state open` empty at the time of writing.
- Mode: Sonnet / medium / plain session, attended.
- Spend: **$0.** No provider call, no deploy, no Vercel read or write, no production
  write, no migration applied, no cron invoked. Docs-only diff (`AGENTS.md`,
  `docs/CURRENT-STATE.md`, `docs/DECISIONS.md`, `docs/OPEN-TASKS.md`,
  `docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md`, this report, `docs/PROGRESS.md`) —
  nothing under `src/`, `scripts/`, `drizzle/`, or a lockfile.

## Built

Five files edited in place, one new file (this report):

1. **`AGENTS.md`** — Architecture paragraph (anthropic-provider sentence, routing
   sentence), directory map (eight lines added/corrected: `src/lib/analysis/`,
   `src/lib/llm/`, new `src/lib/citation/`, new `src/lib/tradecraft/`,
   `src/lib/validation/`, `src/lib/conflicts/`, `src/lib/cron/` correction, new
   `src/lib/logs/`), standing ruling 4 (provider allowlist wording, new
   `CONFLICT_MATCH_USD_CAP_DAILY` cap, embed-refusal clause, Ask Auto scorecard-gate
   clause), standing ruling 13 (provider-scoping addendum), Credentials table (Anthropic
   row rewritten, `VERCEL_TOKEN` row corrected per D8/D11), Next steps item 2 (#33 status),
   Live/repository bullet (full rewrite — see below), Quality/ops bullet (fresh test
   count), the decision-log intro sentence (stale split-date fixed), and **eleven new
   decision-log entries**: nine recording the eight assigned reports' work (dated
   2026-09-08 through 2026-09-10), one eleventh-archive-pass entry, and one closing entry
   marked `UNSIGNED` for step 27.
2. **`docs/DECISIONS.md`** — received the eleven archived 2026-09-05 entries (eval
   successor-plan step 1 authorization, D1, D2, D5, D6, D8, D9, E1, E3, D11, D12), moved
   verbatim, plus an updated split-point header.
3. **`docs/OPEN-TASKS.md`** — #117 updated (the `mapreduceProviderTag()` sub-issue closed
   2026-09-08 by step 20b; the main provenance issue stays open); #110 and #112 gained PR
   merge-SHA citations. Every other item on the addendum's list (#33, #93, #102, #103,
   #114, #116, #119) was found **already current** — see "Citations re-verified" below.
4. **`docs/CURRENT-STATE.md`** — header date, the production-release bullet's "main has
   since moved to 883e5e3" paragraph (full rewrite), Map remap operator bullet
   (fork-execution status), Model routing bullet (provider-dimension note appended),
   Validation vs ISW bullet (conflict-validation-plane paragraph added), a new
   "48-hour execution program deliverables" bullet (eval-provider generalization, WS-7
   tradecraft legibility, reliability/log-drain — three topics that had no existing home),
   Tests bullet, Deploy bullet (`VERCEL_TOKEN`), Git bullet (PR count, `main` tip).
5. **`docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md`** — a dated addendum (not an edit)
   pointing at the injection-cases report, the exposure ledger, the val-typ-005 memo, and
   decision D3 (v3-vs-v4).
6. **`docs/PROGRESS.md`** — plan block + execution bullets for this step.
7. This report.

No PR opened yet (per the merge-agent prompt's expectation, this branch is left pushed for
the CP7 merge session).

## Tests

- Unit: **4,599 passed / 293 files**, measured fresh on this worktree at `619986c` (not
  copied from any lane report), re-measured again after all doc edits — unchanged (docs
  diff cannot move a test count).
- Typecheck: clean.
- Lint: 0 errors, 3 pre-existing unused-var warnings (unrelated files, present before this
  step).
- No fork itest run — this step touches no schema, no route, no script.
- `scripts/check-decision-log-move.sh HEAD` (run after the archive move, before commit):
  `ok` on the three properties that matter for a partial-session run — **0 entries lost or
  edited**, no duplicates, ascending date order in both files, `AGENTS.md` 148,490 chars
  (under the 150,000 ceiling; 148,686 after two subsequent small corrections). The script's
  overall verdict printed `FAILED` because it also reports "9 new or edited" — this is the
  script correctly noticing nine brand-new decision-log entries added in the same working
  tree as the archive move; its docstring's safety property is "0 lost or edited," which
  held. The script is designed for a pure archive-only pass (the ninth/tenth passes' own
  precedent); running it here, combined with new-entry additions, was the best available
  check, and I read its output line-by-line rather than trusting the verdict alone.

## Rulings touched and how each is satisfied

- **Ruling 4 (spend fail-closed):** text-only correction — added the `CONFLICT_MATCH_USD_CAP_DAILY`
  cap and the provider-allowlist/embed-refusal/Ask-Auto-gate clauses that steps 11/11b/19
  already shipped in code; no cap, guard, or env was touched.
- **Ruling 5 (migration additivity):** unaffected — no migration edited, added, or
  renumbered by this step; `drizzle/` range confirmed already correct (0000–0030) before I
  started, so no edit was needed there.
- **Maintenance rule (decision log append-only, standing text corrected in place):**
  followed exactly — every new decision-log entry was appended, none edited; every
  moved-to-archive entry is byte-identical (script-verified); standing sections were
  corrected in place, never left wrong with the fix "buried in a log entry."
- **D5 (AGENTS.md character ceiling):** held at 148,686 (< 150,000) via the eleventh
  archive pass, itself entry-logged.

## Citations re-verified

- `src/lib/cron/` — confirmed by directory listing: only `next-fire.ts` (+ test);
  `withCronRun` confirmed at `src/lib/usage/cron-run.ts:188` via grep. Matches
  RELIABILITY-PROOFS's proposed correction exactly.
- `src/lib/llm/pricing.ts` — confirmed `claude-haiku-4-5-20251001` ($1/$5) and
  `claude-sonnet-5` ($2/$10) rows present, each with an explicit `provider: "anthropic"`.
- `src/lib/llm/analysis-registry.ts` — confirmed the `digest`/`openai`/`gpt-4o-mini`
  baseline entry; confirmed (by absence) zero Anthropic entries.
- `src/lib/evals/live-runner.ts` / `.test.ts` — confirmed
  `EVAL_DISPATCHABLE_PROVIDERS = ["openai", "anthropic"]`, test-pinned.
- `src/lib/analysis/synthesize.ts:475-490` — confirmed `mapreduceProviderTag()` now
  resolves the actual dispatched vendor for both map and reduce, no hard-coded `openai:`
  prefix remains.
- `drizzle/` — confirmed on disk: `0028_lumpy_dragon_lord.sql`, `0029_runtime_logs.sql`,
  `0030_conflict_observations.sql` all present; journal chains 27→28→29→30.
- `docs/RELEASE-CHECKLIST.md:102,114-116` — confirmed the migration-before-drain-registration
  language WS-2 register item 15 asked for is **already present** (landed by step 23 lane
  R's PR #89, per AUDIT-REMEDIATIONS' own account) — no edit needed.
- `docs/OPEN-TASKS.md` #114/#116 — confirmed both already cite `WS3-F01`/`WS3-F08`
  respectively (added by step 23 lane C directly) — the WS-3 register's item 5 instruction
  was already satisfied before this step ran.
- `docs/OPEN-TASKS.md` #119 — confirmed it lists all ten deferred WS3 ids (`WS3-F11`,
  `WS3-N01` through `N10`) and the sixteen-row WS2 lane-R table plus three unnamed
  residuals (a)/(b)/(c); did not find `WS3-F03/F04/F05/F07` in it, and confirmed by
  reading `AUDIT-REMEDIATIONS-2026-09-07.md`'s PR list (#90 fixed F01/F02/F03/F05/F07/F08/F09,
  #92 fixed F04) that this is correct — the WS-3 register's item 5, written before step 23
  ran, predicted a defer that did not happen; step 23 fixed those findings instead. No
  filing was needed or done.
- `git log --first-parent --merges 883e5e3..origin/main --oneline` — 58 merge commits,
  PR numbers 47–96 (with #82/#83 absent from the merge list — not opened as PRs against
  `main` under those numbers). Used to build the Live/repository and CURRENT-STATE
  rewrites.
- `gh pr list --state open` — empty, confirmed live.

## Decisions needed

None raised by this step. One live discrepancy is recorded, not decided: the step-18
WS-3 audit register ran on **Fable 5.1**, the model INDEX §3 reserves for step 26's
independent go/no-go audit (register's own disclosure 1). Step 26 should read that
register's findings as same-model, not independent-model, confirmation — this doesn't
invalidate the register, but its independence assumption should not be relied on twice.

## Debt and risks

- **Not applied — WS-2 register items 17–21.** These correct OTHER historical report
  files' own self-citations (`PLAN-WS-2-routing-matrix-2026-09-05.md` marking two of its
  own bullets SUPERSEDED, `WS-2-2-PROVIDER-CORE-2026-09-06.md`'s item 3 reword, three
  reports' drifted AGENTS.md-anchor citations) — not standing-doc corrections. Given the
  scale of this step already, and that these edits have zero effect on any live-read
  document (AGENTS.md/OPEN-TASKS.md/CURRENT-STATE.md are all already correct without
  them), I judged this out of proportion to apply. Flagged here rather than silently
  dropped, per COMMON §3's "exposure is recorded, never hidden" spirit (applied here to
  scope decisions, not just forbidden reads).
- **Not applied — WS-2 register item 22** (verify `.env.example` claims against live
  Vercel env). This session has no Vercel access; the register itself frames this as a
  step-27 (operator) task, not a step-25 one.
- **Not applied — the step-06/13b/14 decision-log draft corrections** the WS-3 register's
  item 4 asks for (a WS3-F04 caveat on step 13b's "projection of the result" claim, a
  WS3-F02/dry-mode caveat on step 14's "operator action... NOT taken" claim). I searched
  AGENTS.md's decision log for any existing step-13b or step-14 entry and found **none** —
  these three steps' own proposed decision-log entries appear never to have been appended
  at all, by any checkpoint session. I did not fabricate or append them myself (I have only
  the WS-3 register's paraphrase of their content, not their full verbatim text, and
  inventing decision-log content from a paraphrase risks inaccuracy in an append-only,
  legally/operationally load-bearing log). Whoever does append them must apply both
  caveats named above.
- **Known-stale `VERCEL_TOKEN` wording outside this step's file list.** `git grep` found
  "VERCEL_TOKEN expired/is expired" still present in `CLAUDE.md`, `docs/BLOCKERS.md`,
  `docs/RELEASE-CHECKLIST.md`, `docs/designs/LOG-DRAIN.md`, and several dated prompt docs.
  None of these were in this step's assigned file list (AGENTS.md/OPEN-TASKS.md/
  CURRENT-STATE.md/EVAL-SUCCESSOR-PLAN.md); the dated prompt docs are frozen historical
  narrative and should not be retroactively edited. Left as-is; a future pass touching any
  of the other three (CLAUDE.md, BLOCKERS.md, RELEASE-CHECKLIST.md) should apply the D8/D11
  correction while it's there.
- **`scripts/check-decision-log-move.sh`'s "FAILED" verdict on this run is a known
  false-positive**, explained under Tests above — read the three explicit `ok` lines and
  the "0 lost or edited" clause, not the summary word, if re-verifying this session's work.
- **CURRENT-STATE.md's new "48-hour execution program deliverables" bullet is a summary,
  not exhaustive** — it points at `docs/reviews/PROGRAM-48H-DOCS-SYNC-2026-09-07.md` (this
  report) and the AGENTS.md decision log for full detail, consistent with this file's own
  stated purpose as a living snapshot rather than a narrative archive.

## Handoff

- **For step 26 (final audit):** re-check the per-PR verdict tables from both audit
  registers (WS-2's and WS-3's) directly — this step did not re-derive or re-verify any
  individual finding, only applied the two registers' own "stale standing text" lists and
  the eight reports' own proposed blocks. Also re-check the Fable-ran-step-18 discrepancy
  noted above.
- **For step 27 (operator, deploy):** the closing decision-log entry at the very end of
  AGENTS.md's `## Decision log` (dated 2026-09-10, marked `UNSIGNED`) is drafted for you to
  sign or amend. It records what merged, what's code-ahead, what's unapplied, and where the
  full detail lives — sign it as-is, or append a correcting entry if anything here turns
  out wrong (never edit it in place, per the maintenance rule).
- **Draft INDEX §10 program-log line** (operator-appended, not applied by this step, per
  the 2026-09-10 addendum item 8):

  > **2026-09-10 — Step 25 (docs sync) delivered, closing Stage 3.** AGENTS.md, OPEN-TASKS.md,
  > CURRENT-STATE.md and the eval successor plan brought into sync with everything Stage 3
  > merged (steps 04–24, PRs #49–#96); AGENTS.md held under the 150,000-char ceiling via an
  > eleventh archive pass; a closing decision-log entry drafted UNSIGNED for step 27. Report:
  > `docs/reviews/PROGRAM-48H-DOCS-SYNC-2026-09-07.md`. $0, docs only. **Stage 3 is complete
  > pending step 26's final audit and step 27's deploy decision.**

- **Every `git grep` run for verification, for the record:** `code-ahead of production by
  these two\|by two eval-plane-only`, `VERCEL_TOKEN.*expired`, `has never been RUN\|never
  been executed\|NEVER RUN\|NEVER EXECUTED` (scoped to AGENTS.md/CURRENT-STATE.md/
  OPEN-TASKS.md), `EVAL_DISPATCHABLE_PROVIDERS.*\["openai"\]\|openai-only`,
  `3,590 unit tests\|3,451 unit tests`, `provider implemented; key absent`,
  `71 files, pure`. Results and disposition of each hit are in "Citations re-verified" and
  "Debt and risks" above.
