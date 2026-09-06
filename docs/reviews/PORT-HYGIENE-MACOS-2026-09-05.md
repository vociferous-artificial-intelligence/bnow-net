# Port hygiene: WSL2 → macOS (48h program step 02)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-02-port-hygiene.md` (read `…-48h-COMMON.md` first,
  per its instruction).
- Lane/worktree: G, `/Users/go/code/bnow-net-worktrees/48h-gov2-20260905`.
- Branch: `48h/gov2-20260905-step02-port-hygiene`, cut from a fresh lane branch
  `48h/gov2-20260905` off `origin/main`.
- Base: `origin/main` `4e5b00f97daaf86423b5177da912643555b706e8` ("operator comments on
  plan decision"), fetched and recorded before any work.
- PR: [#50](../../pull/50) `scripts+docs: retire WSL2 assumptions after the macOS port`.

**Branch-naming note:** COMMON's step-branch pattern (`48h/<lane>-20260905/<step-slug>`)
collides with INDEX §4's lane-branch-creation command, which already creates
`48h/gov2-20260905` as a ref — git refuses a ref that is simultaneously a leaf and a
directory prefix of another ref. Used the same workaround the step-01 session (running
concurrently) independently hit and reported mid-turn: `48h/gov2-20260905-step02-port-hygiene`
(dash, not slash). Flagging again here so step 03 (same worktree, next branch) doesn't
re-discover it.

## Built

One PR, one commit, 25 files (22 modified, 2 deleted, 1 added), no source-behavior change:

- Deleted: `scripts/llm-redigest.sh` (dead, hard-coded `/home/go/code/bnow.net`, GNU
  `date -d`; CLAUDE.md scoped delete exception), `docs/NEXT-SESSION-PROMPT.md` (2026-07-06
  relic; confirmed no real inbound links — only meta-references in the two 48h planning
  docs describing it as a relic to delete).
- Added: `.nvmrc` (`22`).
- Rewrote `scripts/pin-dns.cjs`'s header comment as a documented WSL2 relic (kept
  functioning, not prescribed in new docs).
- Removed the "needs the DNS pin" instruction (reworded to state the real reason where a
  reason was needed) from: `CLAUDE.md`, `docs/CURRENT-STATE.md`, `scripts/opensanctions-rescore.ts`,
  `scripts/ab-mapreduce.ts`, `docs/prompts/2026-07-10-mtproto.md`,
  `docs/prompts/BUILD-mirror-trade.md`. Added a one-line macOS annotation (command/history
  preserved) to the two named living runbooks: `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`,
  `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md`.
- Fixed `/home/go` / `~/code/bnow.net` paths: `scripts/telegram-login.ts` (error message),
  `docs/SETUP-NEXT-WEEK.md:170`. Added a dated 2026-09-06 note to `docs/BLOCKERS.md`
  clarifying the `~/code/scenefiend/.env.local` path in the 2026-07-04 entry already
  resolves fine on the Mac; did not edit that line.
- Swapped GNU `date -d yesterday` for BSD `date -u -v-1d` in `docs/SETUP-NEXT-WEEK.md`'s
  smoke test, with an inline note for GNU-date readers.
- Reworded the "this box cannot reach api.openai.com" reasoning in
  `scripts/map-remap.ts`, `scripts/map-backfill.ts` (real reason: production
  metering/env live on Vercel; noted a local `next start` on a disposable Neon branch is
  now a valid non-production target), `scripts/telegram-getme.ts` (DNS-pin framing,
  reworded — the Mac needs no pin for either transport), and `scripts/isw-refresh.ts`
  (the "unpooled credentials are stale" note reworded as a one-time WSL2 `.env.local`
  fact, not a portability issue — confirmed the Mac's `.env.local` holds both
  `DATABASE_URL` and `DATABASE_URL_UNPOOLED` names, values not inspected).
- OPEN-TASKS #74: re-tested `npm run dev` on macOS (see Tests below) and recorded the
  result under the item; left closure to the operator per the prompt.
- `package.json`: `engines.node: ">=22"`. `.nvmrc`: `22`.
- `tsconfig.json`: explicit `"forceConsistentCasingInFileNames": true`.
- Added the two new host conventions (native-Mac-only worktree creation;
  plain-release-clone-only deploys) to CLAUDE.md § Commands & setup and AGENTS.md §
  Conventions; corrected `CLAUDE.md:34-35` and `README.md:41-42` to name the plain
  release clone.
- Reverted two incidental, out-of-scope auto-generated diffs before committing:
  `next-env.d.ts` (rewritten by `next dev`'s Turbopack path during the #74 test) and
  `package-lock.json` (153-line `libc` field diff from an npm-version difference on
  `npm install`, unrelated to any dependency change).

## Tests

- Baseline (before any edit): typecheck clean · lint 0 errors (3 pre-existing warnings,
  unrelated files) · unit **3,612 passed / 247 files**.
- After all edits: typecheck clean · lint 0 errors (same 3 pre-existing warnings) · unit
  **3,612 passed / 247 files** — unchanged, as expected for a docs/comment/config-only
  change with no test file touched.
- Enforced pre-push gate (typecheck+lint+test) ran again on push and printed
  `pre-push: all green`.
- OPEN-TASKS #74 macOS retest: copied `.env.local` from the primary checkout into the
  worktree (gitignored, never staged — verified with `git check-ignore -v .env.local`
  before and after), ran `npm run dev`, and `curl -s http://localhost:3000/` once: **HTTP
  200** in ~5s wall time with full server-rendered HTML, and the dev server log shows
  `✓ Ready` and a clean `GET / 200` with **no `ERR_INVALID_HTTP_RESPONSE`** anywhere in
  the log (the original defect's signature). This is a curl smoke test, not a real
  browser's client-side hydration check — recorded as such in OPEN-TASKS #74, per the
  prompt's own caveat.
- No fork itest run (no DB schema, migration, or query-path change in this PR).
- Spend: **$0.** No paid provider call of any kind; the `npm run dev` GET was a read
  against the Mac's local `.env.local` (which points at production Postgres, per repo
  convention — read-only, no LLM route hit, no email dispatch).

## Rulings touched and how each is satisfied

- **CLAUDE.md scoped delete exception** — used for the two deletions
  (`llm-redigest.sh`, `NEXT-SESSION-PROMPT.md`); both are dead/relic with no inbound
  code or doc references beyond meta-mentions in the planning docs that named them for
  deletion; reasons stated in the commit message per the exception's requirement.
  Nothing under `drizzle/` touched (migration additivity, ruling 5, not implicated).
- **AGENTS.md maintenance rule** — the AGENTS.md edit only appends to the standing
  § Conventions section (corrected/extended in place, not the append-only decision log);
  no decision-log entry was added or edited by this step.
- **Ruling 4 (spend, fail-closed caps)** — untouched; zero paid calls made or enabled by
  any edit; the reworded comments do not change any dispatch or cap logic, only prose.
- **Ruling 21 (gate as page's first statement)** — not implicated; no page/route code
  touched.
- **COMMON's no-vendor-branding rule / D12** — no `Co-Authored-By`, "Generated with", or
  model/vendor name in the commit message, PR title/body, or any file content; model
  names were not needed since this is pure hygiene work, not a reviewed audit.
- **AGENTS.md write-lock (INDEX §4)** — step 02 is one of the three governance steps
  (01/02/03) explicitly permitted to edit AGENTS.md during the window; the edit here is
  additive and scoped to § Conventions only, to minimize rebase conflict surface against
  step 01's broader AGENTS.md reconciliation (PR #49, open, not yet merged).

## Citations re-verified

Every file:line the prompt named was re-verified against the current tree before
editing; all matched exactly except where noted:

- `scripts/llm-redigest.sh` — confirmed dead via `git grep -n llm-redigest` (only the two
  48h planning docs mention it, as a deletion target).
- `scripts/pin-dns.cjs:2-7` — matched.
- `CLAUDE.md:36-38` — matched (the DNS-pin bullet).
- `docs/CURRENT-STATE.md:630-636` — matched exactly.
- `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md:93-97` — matched (the WSL2 sentence sits
  at 93-94 before the fenced command).
- `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md:83-84,187,216` — all three matched.
- `scripts/opensanctions-rescore.ts:35-36` — matched.
- `scripts/ab-mapreduce.ts:13` — matched.
- `docs/prompts/2026-07-10-mtproto.md:26` — matched.
- `docs/prompts/BUILD-mirror-trade.md:18` — matched.
- `scripts/telegram-login.ts:151-155` — matched; the literal path sits at line 154 inside
  the cited range.
- `docs/BLOCKERS.md:7` — matched.
- `docs/SETUP-NEXT-WEEK.md:170` — matched.
- `docs/NEXT-SESSION-PROMPT.md:3` (the `/home/go` path cited in INDEX §1.14) — matched;
  deleted the whole file per the finding.
- `docs/SETUP-NEXT-WEEK.md:188-189` — matched.
- `scripts/map-remap.ts:3-6`, `scripts/map-backfill.ts:4-6` — matched.
- `scripts/telegram-getme.ts:14-15` — matched.
- `scripts/isw-refresh.ts:40-42` — matched (comment at 40-41, the `const sql` line at 42
  left untouched, only the comment above it changed).
- `docs/OPEN-TASKS.md` #74 (line 700) — matched.
- `AGENTS.md:962-972` (§ Conventions) — the section header is at line 962 exactly, as
  cited; appended two bullets after the existing five, inside that range.
- `CLAUDE.md:34-35`, `README.md:41-42` — both matched exactly.

## Decisions needed

None. Per the prompt's own header, "Decisions: none (the Node pin is decision-free)" —
confirmed true for the whole step; nothing here touches spend, production data, or
`docs/evals/analysis/`.

## Debt and risks

- **The acceptance grep is not literally clean**, by design choice, not oversight.
  `git grep -n "WSL2"` and `git grep -n "/home/go"` still return hits beyond "archives and
  the pin-dns header" in three categories I judged out of scope for this step and did
  **not** touch:
  1. **True archives** per COMMON's explicit list — `docs/DECISIONS.md`,
     `docs/PROGRESS.md` (historical entries only; my new plan/execution blocks
     necessarily mention WSL2/`/home/go` while describing this very task), and dated
     `docs/reviews/*.md` other than the two named living runbooks (e.g.
     `AI-SEARCH-TEST-LEDGER-2026-07-19.md`, `ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md`,
     `PIPELINE-AUDIT-2026-07.md`, `REMEDIATION-NOTE-2026-07-13.md`,
     `SIGNED-OUT-LANDING-CONTRAST-2026-07-16.md`, `STAGE-3-REVIEW.md`,
     `BETA-INVITE-SIGNALS-X-RELIABILITY-NOTE-2026-07-15.md`,
     `POSTHOG-ANALYTICS-CHECKPOINT-2026-07-14.md`,
     `POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md`) — left verbatim as instructed.
  2. **The governing 48h program docs themselves**
     (`docs/prompts/2026-09-05-48h-00-INDEX.md`, `…-48h-COMMON.md`, and this step's own
     `…-48h-02-port-hygiene.md`) — these describe the migration project in the past/meta
     tense already ("the WSL2 box is history") and are read by every concurrent lane;
     editing them was not in the findings list and would risk destabilizing a document
     other sessions are actively reading mid-window. Left untouched.
  3. **Historical dated docs outside the INDEX §8 scan and not named in the findings
     list**: closed-task prompts (`docs/prompts/2026-07-16-73-signed-out-landing-contrast.md`
     and ~14 more dated `docs/prompts/BUILD-*.md` / `2026-07-*.md` session-kickoff
     specs), a dated design doc (`docs/designs/ANALYST-EVIDENCE-TRAIL-IMPLEMENTATION-PLAN-2026-07-14.md`),
     and historical eval-run records (`docs/evals/ASK-EVAL-2026-07-11.md`,
     `docs/evals/results-*.json`). I judged these equivalent in spirit to archives — frozen
     records of completed or superseded work, most already closed per AGENTS.md — and
     did not want to bulk-edit ~20 files never mentioned in the findings list without an
     explicit instruction to do so. **If the operator wants these swept too, that's a
     separate small follow-up** (mechanical, Sonnet-level, same pattern as this PR); I did
     not do it here to keep this diff exactly matched to the nine numbered findings.
  Full before/after grep output is in this PR's diff discussion; happy to re-run and
  extend if asked.
- **Merge-order dependency (flagged mid-turn by the operator, who hit the same issue on
  step 01):** this PR touches `AGENTS.md` and `CLAUDE.md`, and so does PR #49 (step 01,
  not yet merged). Checkpoint 1 says merge 01 → 02 → 03 in that order specifically
  because of this overlap. **Do not merge #50 before #49**; rebase #50 onto `main` after
  #49 lands (the AGENTS.md touch here is additive and scoped to § Conventions only, so
  the rebase should be low-conflict, but re-verify).
- `docs/BLOCKERS.md` item 1 (VERCEL_TOKEN expired) may itself be stale per D8/D11
  (operator: "VERCEL_TOKEN is valid and correctly scoped to bnow-net") — that's step 01's
  AGENTS.md correction to make, not this step's; the dated note I added here only
  addresses the path portability question, not the credential's live status.
  `CLAUDE.md:34-35`'s "VERCEL_TOKEN is expired" clause was likewise left untouched for
  the same reason (out of this step's declared scope).
  `docs/prompts/BUILD-mirror-trade.md:3`'s own `/home/go/code/bnow.net` boilerplate line
  (shared verbatim across 5 `BUILD-*.md` files) was left untouched for consistency across
  those near-identical files — only line 18 was in scope.

## Handoff

- Step 03 continues in this same worktree/session (per the lane table: `48h-gov2` runs
  02 → 03 as one session). The worktree already has `npm install` done, hooks configured,
  and a copy of `.env.local` (gitignored, untracked) for local DB reads — reuse it rather
  than re-copying.
- **Merge order:** #49 (step 01) → #50 (step 02) → step 03's PR, per Checkpoint 1 and the
  operator's mid-turn note. Rebase #50 onto `main` once #49 lands before merging.
- The residual `WSL2` / `/home/go` grep hits catalogued in Debt above are a known,
  reasoned gap, not an oversight — worth a one-line mention if step 25 (docs sync) or
  step 26 (final audit) re-runs this same grep and is surprised by non-zero results.
- Nothing here blocks or changes any other lane's work; no shared state (env, cap,
  schema, registry) was touched.

## Proposed AGENTS.md changes

None beyond what this PR already applies directly (the two Conventions bullets, applied
in place under the step 01/02/03 write-lock carve-out — see Rulings above). No
decision-log entry is proposed: this step made no decision requiring one (Node pin is
explicitly decision-free per the prompt).
