# RELEASE-CHECKLIST.md — production release, step by step

Codifies the release habit already followed (with drift) across the 2026-07-21 Ask
release, the 2026-08-15 Iran validation recovery, the 2026-08-20/22/23/24 routing/lease/
Unicode releases, the 2026-08-27/28 reliability queue, and the 2026-08-29 Ask-family
release (`docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md` §1–§7 is the fullest single
record and is cited throughout below). This file is the authority going forward — do not
invent a step the record does not contain, and do not drop one it does. Every release
gets its own dated record in `docs/reviews/` following this shape; this checklist is the
table of contents for that record, not a replacement for it.

**Never skip step 6.** Four releases in a row (2026-08-20 PR #5, 2026-08-24 release
train, and the two after) recorded every other step but not the `ASK_USD_CAP_DAILY`
headroom check (OPEN-TASKS #84, still OPEN as of 2026-08-27) — it never cost anything
only because `openai_ask` happened to be at $0 each time. Treat it as load-bearing as the
`/health` check.

## The checklist

1. **Baseline reconstruction.** Record: the PR's head SHA and check statuses (`gate`,
   `integration`); `origin/main`'s SHA after a fresh fetch; the current production
   deployment id via `/health` (HTTP 200, commit stamp, matching `data-dpl-id`, "DB OK");
   a clean working tree (both the primary checkout and the release clone); an env-posture
   listing by NAME ONLY — which cap/flag envs exist in Production/Preview/Development,
   confirming no stray `EVAL_*` or `CONFLICTS_UI` variable exists unless this release is
   the one authorized to add it. (Reference shape: ASK-FAMILY-RELEASE-2026-08-29.md §1.)

2. **Pre-deploy observation gate.** Read the last scheduled cron runs before merging —
   at minimum the most recent `digest:intraday`/`finalize` and `validate` rows — and sweep
   every row's **nested** `counts.*` object, not just its top-level `ok`/`error` (OPEN-TASKS
   #87: a run can carry `ok=true` while `counts.errors` or `counts.batchErrors` is nonzero).
   Classify any known-bounded condition (e.g. a monthly cap stop, an expected thin-regen
   overwrite refusal) explicitly rather than waving it through. (§2.)

3. **Merge with diff re-inspection.** Re-inspect the PR diff file-by-file immediately
   before merging and confirm it still matches the reviewed scope exactly — no drift, no
   unrelated file. After merging, verify the merged tree is **byte-identical** to the
   reviewed head (`git diff <merge-sha> <reviewed-head-sha>` empty) — this is what lets the
   PR's own integration-test and build evidence carry over to the deployed artifact
   without re-running them. (§3.)

4. **Release-clone preflight.** In the plain release clone (`/Users/go/code/bnow-net-rel-20260823`,
   never a worktree — OPEN-TASKS #78, see step 8), `git pull --ff-only` to the merged
   commit, verify the SHA, `git diff --check` clean, `npm run typecheck`, `npm run lint`,
   `npm test`. Re-verify the env posture from step 1 hasn't drifted. Record the rollback
   deployment id (the CURRENTLY live one, before this deploy replaces it). (§4.)

5. **Cap-env parity (ruling 4).** For every NEW cap/flag env this release's code reads
   for the first time, confirm it is already set in Production, Preview, **and**
   Development before deploying, and list the names in the release record. AGENTS.md
   ruling 4 is explicit: "Set a new cap env in ALL Vercel envs BEFORE deploying the guard
   that reads it, or you stop that pipeline" — this is a fail-closed guard, so a missing
   cap env doesn't degrade gracefully, it halts the pipeline the next time it runs.

6. **#84 headroom record — may not be skipped.** One read-only `provider_usage` SELECT
   comparing `ASK_USD_CAP_DAILY` against the day's real `openai_ask` usage so far, written
   into the release record verbatim (not just "checked — fine"). OPEN-TASKS #84: this
   check was skipped, undetected, on four consecutive deploys because the actual exposure
   happened to be $0 every time — that is luck, not evidence the check is unnecessary.
   #84 stays OPEN until a deploy's record actually contains this line; this checklist
   entry is what closes it, the next time it's followed.

7. **Rollback target recorded before deploy.** Not just "the previous deployment id" —
   the current floor of the rollback ladder (AGENTS.md's post-incident releases carry an
   explicit "never roll below `<sha>` — that reintroduces `<defect>`" ladder; read it
   before naming a target, don't just take the immediately-prior deployment on faith).

8. **Deploy from the plain clone only.** `npx vercel@latest deploy --prod --yes` from
   `/Users/go/code/bnow-net-rel-20260823` — **never a worktree**: a worktree's `.git` is a
   file (gitdir pointer), which defeats the Vercel CLI's git-metadata detection and
   renders `/health`'s commit stamp EMPTY (OPEN-TASKS #78, reproduced on
   `dpl_9xyqCLfZn6n8WTifQ6BpgpV9wJja`). The machine's logged-in Vercel CLI session is the
   deploy credential — `VERCEL_TOKEN` itself is a separate, currently-expired env (needed
   only for CI, not local CLI deploys; see AGENTS.md's credentials table for its current
   status before assuming either way).

9. **Post-deploy verification.** `/health` stamp equals the merged SHA exactly, DB OK.
   Authorization smoke per ruling 21: for every gated route, check the anonymous **bare
   GET body** and the **`RSC: 1` GET body** (not just the status code — a 307's body can
   still leak the gated page, ruling 21's whole point) for privileged tokens; classify
   every grep hit before trusting a "clean" result (§6 shows real examples: "claim" inside
   "disclaimer", a nav label, a router path echo — false positives that still need
   checking, not assuming). Then a natural-cadence observation window covering at least
   one of each recurring job type (map, digest finalize, digest intraday, validate) with
   zero new `ok=false`/unfinished/errored rows and zero new nested-`counts` errors,
   before calling the release closed. (§6–§7.)

10. **`--estimate` before any operator spend run.** Where a script offers a dry-run/
    `--estimate` mode, run it and read the modelled cost before the first real invocation
    that spends — never the other way around. This applies to every operator-run step in
    every runbook this checklist points at (e.g. `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`
    step 3, or a future map-backfill/remap run).

11. **Migration application is its own line, never bundled into a code deploy.** Record,
    separately from the deploy line: which numbered migration(s) applied
    (`npm run db:migrate` from the release clone, additivity per ruling 5), the Neon
    backup branch taken FIRST (name + branch id — precedent:
    `backup-pre-iran-recovery-2026-08-15` / `br-polished-block-atu0r968`, taken before any
    historical write, retained until the operator releases it; see
    `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`), and the decision-log entry
    recording both. The 2026-07-21 Ask release is the fullest precedent: backup branch
    taken first, migrations 0021–0027 applied and verified idempotent, decision-log entry
    written before the feature flags that depended on the new columns went live.

## Known gaps this checklist does not close

- **OPEN-TASKS #39** (no git→Vercel deploy integration): `git push` does not deploy.
  This checklist assumes a human or a future step explicitly runs step 8; it does not
  make deploys automatic. Status: **checklist codified here; Git integration still
  absent** — the Vercel project has no connected repository (AGENTS.md's credentials
  table / directory notes).
- **OPEN-TASKS #78** (worktree deploys ship no commit stamp): step 8 above is the
  mitigation (deploy from the plain clone, always); the underlying CLI limitation is not
  fixed.
- **OPEN-TASKS #84** stays open until step 6 is actually exercised on a real deploy and
  the release record shows it.

## Cross-references

- `CLAUDE.md` § Commands & setup's Deploy line points here.
- `README.md`'s Operations § Deploy line points here.
- `.github/workflows/ci.yml`'s `integration` job carries a comment: its green check is
  NOT evidence of a passing integration suite (it clean-skips without `NEON_API_KEY`) —
  every PR reports its own local disposable-fork integration run instead (step 4/§4
  above; the enforced pre-push gate at `.githooks/pre-push` is typecheck+lint+test only
  and does not include it).
