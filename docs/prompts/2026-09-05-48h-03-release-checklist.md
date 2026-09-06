# Step 03 — Release checklist (#39/#78/#84) + #79 drain runbook (Wave 1)

| | |
|---|---|
| Model / effort / mode | Sonnet / medium / plain session (continues from step 02) |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-gov2-20260905` |
| Window | H3 → H5 |
| Depends on | 02 (same session; separate PR) |
| Decisions | O2 (operator authorizes the #79 production-write run — you only write the runbook) |
| Spend | $0. Optional read-only preflight SELECT against production only if the operator says so. |
| Closing report | `docs/reviews/RELEASE-CHECKLIST-AND-79-RUNBOOK-2026-09-05.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Goal

Codify the release habit that is currently spread across `docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md`
§1-§7, `docs/CURRENT-STATE.md:609-629`, and AGENTS.md's 2026-08-27/28 entry (≈1646-1652), as
`docs/RELEASE-CHECKLIST.md`; make the #84 headroom record a checklist line that cannot be
skipped; and write the runbook for the #79 RU ROCA citation drain so the operator can run it
at step 10. One docs PR: `docs: release checklist (#39/#78/#84) and #79 RU citation drain runbook`.

## Read

`docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md` (all); `docs/CURRENT-STATE.md:600-650`;
AGENTS.md entries dated 2026-08-24 (QF-A, "standing 2026-08-03 separation" ≈1474-1477) and
2026-08-27/28 (≈1646-1652); `docs/OPEN-TASKS.md` #39 (:313-316), #78 (:802-810), #84
(:852-870), #79 (:811-817), #80 (:818-820); `scripts/isw-refresh.ts` (all 138 lines);
`scripts/registry-materialize.ts` (all); `scripts/sqlq.ts`; `src/app/health/page.tsx` (the
stamp reads `VERCEL_GIT_COMMIT_SHA` ≈:76); `docs/prompts/2026-08-15-iran-validation-recovery.md`
and `docs/reviews/IRAN-VALIDATION-RECOVERY*.md` §"backup branch" (≈:319-321) for the precedent.

## Do

### A. `docs/RELEASE-CHECKLIST.md`

A numbered checklist the release clone follows, faithful to the recorded sequence — do not
invent steps that the record does not contain, and do not drop any it does:

1. Baseline reconstruction: PR head SHA, checks green, `origin/main` SHA, production
   deployment id via `/health` (200, stamp, `data-dpl-id`, DB OK), clean tree, env-posture
   listing (names only; which caps exist; no `EVAL_*`/`CONFLICTS_UI` in prod).
2. Pre-deploy observation gate on the last scheduled runs (nested counts sweep per #87).
3. Merge with diff re-inspection; merged tree byte-identical to the reviewed head.
4. Release-clone preflight in `/Users/go/code/bnow-net-rel-20260823`: `git pull --ff-only`,
   verify the commit, `git diff --check`, typecheck, lint, unit.
5. **Cap-env parity (ruling 4):** for every new cap env the PR reads, confirm it is set in
   Production, Preview and Development BEFORE deploying; list them.
6. **#84 headroom record:** `ASK_USD_CAP_DAILY` vs the day's real `openai_ask` usage (one
   read-only SELECT on `provider_usage`), written into the release entry. Mark this line
   "may not be skipped; four consecutive deploys missed it".
7. Rollback target recorded before deploy (current ladder floor per AGENTS.md:123-127).
8. `npx vercel@latest deploy --prod --yes` from the plain clone only (#78: a worktree ships no
   commit stamp). Note the machine CLI session is the credential; `VERCEL_TOKEN` is expired.
9. Post-deploy: `/health` stamp equals the merged SHA, DB OK, authz smoke (bare GET + `RSC: 1`
   body check per ruling 21), natural-cadence observation window, decision-log entry with
   the deployment id.
10. `--estimate` where a script offers it, before any operator run that spends.
11. Migration application is its own line, never part of a code deploy: which numbered
    migrations are applied (`npm run db:migrate` from the release clone), the Neon backup
    branch taken first, and the decision-log line recording it.

Cross-link from `CLAUDE.md` (the deploy line step 02 rewrote), `README.md`, and OPEN-TASKS
#39/#78 (status: "checklist codified; Git integration still absent — the Vercel project has
no connected repo, AGENTS.md ≈769-771"). #84 stays open until a deploy actually records the
check; say so. Add one comment line to `.github/workflows/ci.yml`'s integration job: "green
here is NOT evidence — the job clean-skips when NEON_API_KEY is absent; PRs report local
fork runs" (a YAML comment; no behaviour change).

### B. `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`

For the operator to execute at step 10 (their authorization O2 — you do not run writes):

1. Preflight (read-only): `npx tsx scripts/sqlq.ts "SELECT parse_status, count(*)::int,
   max(report_date)::text FROM isw_reports WHERE theater='ru' GROUP BY 1"` — expected ≈36
   pending (OPEN-TASKS #79 figure from 2026-08-15; may differ). Note that `sqlq.ts` has no
   read-only guard (it executes any SQL).
2. Backup: `npx tsx scripts/neon-branch.ts create` (prints `{branchId, …}`; branches are
   auto-named `itest-<ts>` — note the id; Iran precedent) — keep until the decision-log entry
   is written, then `npx tsx scripts/neon-branch.ts delete <branchId>`.
3. Dry run: `npx tsx scripts/isw-refresh.ts --theater ru --dry` (DB-zero-write; fetches ISW
   pages politely at ≈2.1 s/host and fills `data/cache`; the Mac has no cache yet, so this
   takes minutes).
4. Drain: `npx tsx scripts/isw-refresh.ts --theater ru` (pending, oldest-first, `--limit`
   default 500), then `--retry-failed` if the dry run showed failed rows.
5. Materialize: `npx tsx scripts/registry-materialize.ts` (pure SQL, two phases: rebuild
   `source_theater_stats`, then `sources` aggregates; reads `DATABASE_URL_UNPOOLED ||
   DATABASE_URL` — confirm the unpooled URL is valid on the Mac or unset it for the run, #80).
6. Verify: re-run the preflight SELECT; `source_theater_stats` for `ru` has non-zero citation
   counts; scoreboard unchanged (this is registry data, not validation).
7. Record: decision-log entry (draft the text in the runbook: what ran, counts before/after,
   $0, backup branch name, deleted when).

State explicitly: no LLM import anywhere in either script (verified by reading the import
lines), so this is $0; network to understandingwar.org only.

## Tests / acceptance

Docs only; `npm test` unchanged. Every step in the checklist cites the record it came from.

## Report

Per COMMON §5. In **Handoff**: which checklist lines are new obligations vs codified habit;
the #79 runbook's expected counts; and the exact text step 10 should paste into the decision
log after the run.
