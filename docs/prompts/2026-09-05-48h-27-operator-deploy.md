# Step 27 — Operator: deploy decision and close of the window (Wave 5, human)

| | |
|---|---|
| Who | Operator, native Mac, the plain release clone `/Users/go/code/bnow-net-rel-20260823` |
| Window | H46 → H48 (or the next morning — deploys are not time-boxed by the program) |
| Depends on | 26's per-PR verdict table; `docs/RELEASE-CHECKLIST.md` (step 03) on `main` |
| Spend | $0 for the deploy itself; the observation window may include natural cron spend under existing caps |
| Record | Decision-log entry per deploy (the checklist's template); program log close line |

No agent runs this step.

**ADDED 2026-09-09 — facts to have in front of you before step 1.**

- **Credentials first (tracker §4g).** The `.env.local` `DATABASE_URL` / `DATABASE_URL_UNPOOLED`
  in the main checkout carry the pre-rotation `neondb_owner` password and fail
  authentication; every fork-bound run used the control plane instead. `npm run db:migrate`
  from the release clone targets production through those two names, so refresh them in
  `/Users/go/code/bnow-net-rel-20260823/.env.local` (and the main checkout) from the Neon
  console BEFORE any production script, and prove it read-only:
  `npx tsx scripts/sqlq.ts "SELECT 1"`. #80 closes only when this is done.
- **DSN facts, settled 2026-09-11.** The `neondb_owner` password contains none of `#`, `?`, `/`
  (AUD-10's hazard is the password segment only; the `?sslmode=require&channel_binding=require`
  query string is parsed as a query and is fine; single quotes around the value in `.env.local`
  are fine). **`DATABASE_URL_UNPOOLED` must be set and must carry the same password:**
  `scripts/migrate.ts` reads `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, so unset means migrating
  through the pooler, and password-less means an authentication failure. It is the pooled
  string with `-pooler` removed from the host (Neon console: "Connection pooling" unticked).
  The guard accepts the pair because it compares hosts after stripping `-pooler`. Set both in
  the release clone's `.env.local` and the main checkout's; prove with
  `npx tsx scripts/sqlq.ts "SELECT 1"` before anything else.
- **Neon branches before you start:** expect the production branch plus the kept evaluation
  branch `br-weathered-forest-atmfaetu` (A6 — keep). Anything else is an orphan to identify
  first (list via the API one-liner in the tracker §6 item 4.1); the backup branch and the
  rehearsal fork you create here are transient — delete the rehearsal fork when done, keep
  the backup branch until the observation window closes.
- **The one hard ordering (A2 (b), signed; WS2-F04 corrected by step 23):** Neon backup branch →
  `npm run db:migrate` from the release clone (0028, 0029, 0030 — one recorded line each, then
  `SELECT name FROM _migrations WHERE name LIKE '00%' ORDER BY 1` shows 32 rows) → deploy the
  receiver → set `LOG_DRAIN_SECRET` in Production before the deploy that reads it → register
  the drain → `npx tsx scripts/audit-cron.ts` (safe at every point; prints "no drain registered
  yet" until it is). Never register a drain against a database without `runtime_logs`.
- **Env read-back (register gap G3), all three environments, names only in the record:**
  `ASK_EMBED_MODEL`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `ASK_PIPELINE`, `OPENAI_MODEL`, the
  five `<W>_PROVIDER` and `<W>_MODEL`, `DIGEST_PROVIDER`, `ANTHROPIC_API_KEY`, `LOG_DRAIN_SECRET`,
  `EVAL_*`, `CONFLICTS_UI`, `FEATURE_AUTH_GATE` — and **`MAP_CONTENT_CHARS`, which must be
  ABSENT** (R4). Expected today: `ASK_ANSWER_MODEL` / `ASK_RERANK_MODEL` / `ASK_PIPELINE` absent
  (WS2-F68); `DIGEST_PROVIDER` and `ANTHROPIC_API_KEY` absent — the Anthropic digest path stays
  DORMANT unless a separate signed decision enables it; `MAP_CONTENT_CHARS` absent.
- **What is code-ahead of production:** every PR since `883e5e3` (step 26's list). Nothing in
  this program deployed anything; production is still `8a19ade` unless a hotfix moved it — read
  `AGENTS.md` Current state before assuming.
- **Worktree cleanup (item 4) is a native-terminal act:** `git worktree remove` only for lanes
  whose PRs are merged; then `git worktree prune && git worktree list` from the Mac (a
  remote-mount session mislabels every worktree `prunable`).
- Sign the D-a…D-f entry's downstream effects if step 23 changed them; sign step 25's closing
  entry; append the INDEX §10 close line.


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
