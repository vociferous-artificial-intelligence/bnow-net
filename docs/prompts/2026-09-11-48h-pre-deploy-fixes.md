# Pre-deploy fixes — the four go-after-fix items from step 26, plus AGENTS.md headroom (agent prompt, 2026-09-11)

**You are the pre-deploy fixer.** Step 26's final audit
(`docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md`, PR #98, merged) found the frozen tree
deployable with **no blocker and no no-go PR**, and named the things that must land before step
27 deploys: **AUD-02, AUD-03, AUD-04, AUD-05, AUD-06** — three documentation corrections, one
OPEN-TASKS status correction, and one local branch deletion. None is a code change. You do
exactly those, plus one governance move the operator has ruled on (§3), in one PR, and stop.

**Model / effort / mode.** Opus / high, attended, a fresh session. Where you run: the
`48h-gov-20260905` worktree — `/Users/go/code/bnow-net-worktrees/48h-gov-20260905` — on a
step branch cut from `origin/main`. Start from the main checkout so the launcher's discipline
holds even though this is not a numbered step:

```
cd /Users/go/code/bnow-net
git status --porcelain
git fetch --prune origin
lsof -a -d cwd -c claude | grep bnow-net-worktrees
git -C /Users/go/code/bnow-net-worktrees/48h-gov-20260905 status --short
git -C /Users/go/code/bnow-net-worktrees/48h-gov-20260905 checkout -B 48h/gov-20260905 origin/main
cd /Users/go/code/bnow-net-worktrees/48h-gov-20260905 && caffeinate -ims claude --model opus
```

(The operator runs the block above, then pastes this file into the session it opens. The
session's first act is `git rev-parse --show-toplevel` and `git branch --show-current`: the
toplevel must be `/Users/go/code/bnow-net-worktrees/48h-gov-20260905` and the branch
`48h/gov-20260905`; anything else is a STOP.)

**Read first:** `docs/prompts/2026-09-05-48h-COMMON.md` (§1, §3, §4.7, §5); then the audit
report's five major findings **in full** — each carries a file:line and an exact remediation;
the register's text is the authority for what you change, this prompt only bounds it.

---

## 1. Scope — exactly these, nothing more

Cut `48h/gov-20260905-pre-deploy-fixes` from the lane branch. One commit per item, titled
`<area>: AUD-0N — <imperative>`, no vendor branding anywhere.

| Item | What the register says (read it; do not work from this summary) | Where | Kind |
|---|---|---|---|
| **AUD-02** | The outreach roster (19 emails, 14 phone numbers, named third parties) is alive on the **local** branch `docs/operator-notes-20260905` in the main checkout, with an origin upstream configured; one push publishes it. D1 (2026-09-05) ruled the roster lives outside git. | `/Users/go/code/bnow-net` (local branch) | **operator act, not yours** — see §2; you only verify afterwards |
| **AUD-03** | PR #52 silently reverted PR #50's macOS port of the operator smoke test in `docs/SETUP-NEXT-WEEK.md` (`cd ~/code/bnow.net`, GNU `date -u -d yesterday`); step 27 runs that smoke test after adding `LOG_DRAIN_SECRET`. This is WS2-F09, routed to step 25 and missed. | `docs/SETUP-NEXT-WEEK.md` | docs |
| **AUD-04** | `AGENTS.md` lists ten routing envs; the code declares fifteen (`DIGEST_PROVIDER` among the missing); step 27's env read-back would run against the short list. | `AGENTS.md` standing text (one in-place correction, COMMON §4.7 allows it for the line the fix makes wrong — here the operator authorizes it explicitly) | docs, governance file |
| **AUD-05** | The WS-3.6 soak checklist has no migration gate for 0028/0030: followed as written, the first scheduled run writes before the tables exist, throws `42P01` per cell, marks degraded rather than failing. | `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md` (+ mirror in `docs/RELEASE-CHECKLIST.md` only if the register says so) | docs |
| **AUD-06** | OPEN-TASKS #79 still instructs a production write that already ran (2026-09-07, `AGENTS.md` entry "OPEN-TASKS #79 — RU ROCA citation registry drain — EXECUTED"); repeating it rebuilds `source_theater_stats` and changes which documents enter `ru` digests. | `docs/OPEN-TASKS.md` #79 status line | docs |

Not in scope, list them in the report instead: every minor and note in the register (the
AUD-01 implementation is filed as #121 in §3a, not done here); anything under `src/`,
`scripts/`, `drizzle/`.

## 2. AUD-02 — the operator's act, before you start

**Operator, in the main checkout, before opening this session** (the branch is local to that
checkout; a session in the gov worktree cannot see it and must not try):

```
cd /Users/go/code/bnow-net
ls -la ~/operator-notes/OUTREACH-ROSTER-2026-08-23.md
git branch --list docs/operator-notes-20260905
git ls-remote --heads origin docs/operator-notes-20260905
git branch -D docs/operator-notes-20260905
git branch --list docs/operator-notes-20260905
git ls-remote --heads origin docs/operator-notes-20260905
```

**Expect:** the roster file present outside git (Stage 2 item 5 saved it there on 2026-09-08 — if
it is missing, STOP and copy it out of the branch first: `git show docs/operator-notes-20260905:docs/OUTREACH-ROSTER-2026-08-23.md > ~/operator-notes/OUTREACH-ROSTER-2026-08-23.md`);
the local branch listed once, then `Deleted branch …`, then listed as nothing; `ls-remote`
printing nothing both times (the remote branch was deleted at Stage 2 item 5). The session
verifies the after-state in its report with `git -C /Users/go/code/bnow-net branch --list docs/operator-notes-20260905` (read-only, expect empty).

## 3. AGENTS.md headroom — ruled 2026-09-11, do it in the same PR

`AGENTS.md` is **148,686 bytes** — 1,314 under the 150,000 ceiling (D5). Step 27 must sign the
UNSIGNED closing entry (a small shrink) and append a deploy entry (2–4 k): it does not fit. D5's
7-day window has nothing eligible until 2026-09-13. **Ruling: a one-off deeper cut, the tenth-pass
precedent (2026-09-08):** move the **2026-09-06** run of entries, verbatim, to `docs/DECISIONS.md`
(the append-only archive), byte-identical, in order, none duplicated or invented; then append a
short record entry at the end of `## Decision log` in the tenth pass's wording ("twelfth archive
pass — one-off cut to 2026-09-07 under D5's ceiling; window not amended"). Prove it before
committing:

```
bash scripts/check-decision-log-move.sh HEAD
wc -c AGENTS.md
grep -c UNSIGNED AGENTS.md
```

**Expect:** PASS with lost-or-edited 0, duplicates 0, order ok in both files; `AGENTS.md` at or
below **≈135,000** (record the number); `UNSIGNED` still **1** — you do not sign the closing
entry. The AUD-04 correction (§1) is a standing-text edit in the same file; do it in its own
commit, then the archive pass in its own commit, so the archive check's diff is clean. Then
**§3a** in its own commit, after the archive pass.

## 3a. Two operator decisions, taken 2026-09-11 — append, then file the implementation

The operator answered both open questions the audit and step 24 raised. Append the two entries
below, verbatim, at the end of `## Decision log` (after your archive-pass record entry, before
`## Conventions`), dated 2026-09-11, each as one bullet in the log's house style. They are
signed by the operator's instruction to write them; do not mark them UNSIGNED.

- **T3-c — named-person allegations are routed to the estimative band's `withheld` path
  (AUD-01, option 1).** The 2026-09-11 final audit found that `ESTIMATIVE_MAP_V1` labels a
  disputed reputational allegation about a named person `likely (55–80%)` at exactly the
  two-document count that makes it publishable at all (`ALLEGATION_MIN_DOCS = 2`), because
  T3's constraints are keyed on document count, not content class, and the estimative module is
  by design unable to see `isPersonAllegation`. Decision: such claims take the existing,
  tested `withheld` path (`likelihood: null`, rendered "not assessable"), with the allegation
  flag supplied from outside the module — a server-passed boolean or a leaf module on the
  `attribution-labels.ts` precedent — so the import-hygiene invariant stands. Presentation only;
  nothing stored changes; no backfill. AUD-49 (corroboration counts `doc_dedup` mirrors as
  independent channels) is folded into the same implementation. Implementation is
  OPEN-TASKS #121, owned by the next program's first wave; not deploy-gating (all four render
  sites are accepted-user gated and the AJP-2.1 code is never rendered).
- **C13-b / C10-b — `compound-v1` lands before `CONFLICTS_UI` is turned on.** Step 24's report
  (Decisions needed 1) found that C13 ("no number produced under `unit-flags-v0` may reach a
  customer") and C10 (the `/conflicts` teaser tier is public at flag-on) collide the moment the
  flag flips. Decision: option (a) — build the `compound-v1` derivation and replace the
  heuristic before any environment sets `CONFLICTS_UI`; the C10 access split is unchanged and
  the shipped banner stays as interim disclosure on gated surfaces only. This is already the
  soak's blocker 1, so it adds nothing to the critical path. The WS-3.6 enablement checklist
  gains this as its first gate (do it in the AUD-05 edit, same PR).

Then file **OPEN-TASKS #121** (next free number; verify with `grep -n '^12[0-9]\. '
docs/OPEN-TASKS.md`): Tier 2, "route named-person allegations to the estimative `withheld` path
and fold `doc_dedup` mirrors out of `corroborationTier`" — cite AUD-01/AUD-49, T3-c, the file
lines the register names (`synthesize.ts:409-420`, `estimative.ts` withheld path, `reduce-io.ts:118-126`),
and the acceptance test: the claimed-hedged two-document person-allegation fixture from the
audit renders no band, and `independentSourceCount` and `corroborationTier` agree on the mirror
pair. Also add the compound-v1-first gate to the soak checklist as part of AUD-05.

Re-run after §3a: `wc -c AGENTS.md` (still comfortably under 150,000 — the two entries are
≈2.5 k) and `grep -c UNSIGNED AGENTS.md` = 1.

## 4. Gate, PR, report

```
npm run typecheck && npm run lint && npm test
git diff origin/main --stat -- src scripts drizzle package.json package-lock.json
git push -u origin 48h/gov-20260905-pre-deploy-fixes
gh pr create --base main --title "docs: pre-deploy fixes from the final audit (AUD-03/04/05/06) + twelfth archive pass" --body-file docs/reviews/PRE-DEPLOY-FIXES-2026-09-11.md
```

**Expect:** gate green with unit **4,599 / 293** unchanged (docs cannot move it — a change is a
STOP); the `--stat` line empty; PR base `main` (never stacked). Closing report
`docs/reviews/PRE-DEPLOY-FIXES-2026-09-11.md`, COMMON §5 sections, short: Scope · Built (the
five items with the register id, file, before → after) · Tests · Rulings touched (1, 5) ·
Decisions needed (none — T3-c and C13-b/C10-b were taken by the operator on 2026-09-11 and
appended in §3a; say so) · Debt (the minors and notes you did not
touch, by id) · Handoff for step 27 (the corrected smoke test, the fifteen env names for the
read-back, the soak checklist's new migration gate). Commit the report on the branch. Stop.

## 5. Hard rules

- Nothing under `src/`, `scripts/`, `drizzle/`, no lockfile change, no migration, no launch, no
  `.env.local`, no provider call, no Vercel. $0.
- `AGENTS.md`: the AUD-04 line in place, the archive move, the one record entry — and nothing
  else. Never edit an existing decision-log entry; never sign the UNSIGNED entry.
- The register's remediation text wins over this prompt's summaries; if they disagree, follow
  the register and say so in the report.
- If any item turns out to need a code change, do not make it: list it under Decisions needed
  and continue with the rest.
