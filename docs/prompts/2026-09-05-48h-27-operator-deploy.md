# Step 27 — Operator: deploy decision and close of the window (Wave 5, human)

| | |
|---|---|
| Who | Operator, native Mac, the plain release clone `/Users/go/code/bnow-net-rel-20260823` |
| Window | H46 → H48 (or the next morning — deploys are not time-boxed by the program) |
| Depends on | 26's per-PR verdict table; `docs/RELEASE-CHECKLIST.md` (step 03) on `main` |
| Spend | $0 for the deploy itself; the observation window may include natural cron spend under existing caps |
| Record | Decision-log entry per deploy (the checklist's template); program log close line |

No agent runs this step.

1. Read `docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` §deploy verdicts. Deploy only
   PRs marked **go** whose env/secret list is fully set in Production, Preview and
   Development (ruling 4 ordering) — docs and inert code first. Anything marked go-after-fix
   waits for its fix PR; anything reading `LOG_DRAIN_SECRET`, `EVAL_*`, `CONFLICTS_UI`, a new
   cap, or a migration stays undeployed until its prerequisite step in the checklist is done
   (set the secret → deploy the receiver → register the drain; apply 0028–0030 with
   `npm run db:migrate` from the release clone against production ONLY after a Neon backup
   branch and only if the audit marked the migration PR go).
2. Follow `docs/RELEASE-CHECKLIST.md` line by line, including the #84 headroom record (the
   line says it may not be skipped) and the rollback target.
3. Observation window per the checklist; decision-log entry per deploy with the deployment
   id, the migrations applied (if any), and the env names added.
4. Sign step 25's closing entry; append the final program-log line; delete the lane
   worktrees that have no unmerged work (`git worktree remove`), keep the others and list
   them in the next-48h handoff; `git worktree prune && git worktree list` must show no
   `/sessions/` gitdir paths (the orphan the handoff §4.6 rule came from).
5. If nothing is deployed in this window, write that as the decision-log entry: what is
   code-ahead of production and why it waits.
