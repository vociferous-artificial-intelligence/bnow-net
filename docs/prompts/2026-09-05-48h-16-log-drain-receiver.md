# Step 16 — WS-4.1 Vercel log drain: design + Neon receiver (`runtime_logs`) (Wave 2)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws4-ops-20260905`, step branches `…/log-drain-design`, `…/log-drain-receiver` |
| Window | H8 → H16 |
| Depends on | — for the design; decision O1 for the receiver (if unanswered, ship the design PR and build the receiver on its branch, held) |
| Decisions | O1 — partly answered 2026-09-06: the Vercel plan DOES support log drains. The operator also noted "Neon does not support drains on the Launch plan" — that concerns a Neon-side feature the design does NOT use: the receiver is our own Vercel route inserting into our own Postgres tables, which needs nothing from Neon beyond ordinary writes. State this plainly in the design doc and confirm with the operator before PR 2; sink/retention/registration otherwise per the recommendation. |
| Spend | $0. New env `LOG_DRAIN_SECRET` is named but NOT set anywhere by you. |
| Closing report | `docs/reviews/LOG-DRAIN-2026-09-06.md` (design + receiver record) |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Why

Every soak verdict to date rests on `cron_runs` self-reports plus a bounded `vercel logs`
tail (OPEN-TASKS #93 :1159-1165; ASK-FAMILY-RELEASE-2026-08-29.md:124-126). WS-3.6's shadow
soak requires runtime-log coverage. Nothing exists today: no drain route, no signature
verification, no `vercel.json` key (drains are project settings, not `vercel.json`), no env
name in `.env.example`.

## Read

`docs/OPEN-TASKS.md` #93; `vercel.json` (crons only); `src/lib/usage/cron-run.ts:120-150`
(the sweep-at-start pattern and start-row semantics); `src/lib/ask/retention.ts` (retention
sweep pattern); `src/db/schema.ts:871-881` (`cron_runs`); `src/app/api/cron/*/route.ts`
(secret-header auth pattern); `src/app/health/page.tsx`; AGENTS.md ruling 4, 5, 10, 21;
AGENTS.md ≈769-771 (no connected Git repo) and BLOCKERS.md:7-10 (`VERCEL_TOKEN` expired — the
dashboard/CLI session registers the drain). Vercel's log-drain payload format and signature
header: use the Vercel docs (WebFetch) and cite the URL and date read.

## PR 1 — `docs: log-drain design (#93)` → `docs/designs/LOG-DRAIN.md`

Options with cost/retention: (a) Neon receiver — new route + table + sweep, zero vendors,
queryable next to `cron_runs` with `scripts/sqlq.ts`/`audit-cron.ts`; (b) hosted sink
(vendor, retention by plan); (c) Vercel retention extension. Recommend (a) with 14-day
retention. Payload fields kept (deploymentId, source, requestPath/route, level, message
truncated to N chars, timestamp, requestId); what is NEVER stored (headers, bodies, anything
that could carry a secret or ISW text — messages are our own log lines but truncate and
hash-dedupe anyway); rate bounding (batch size caps; drop-with-counter over cap — never block
the request); ruling 21 note (a route, not a page — auth is the drain signature); the
registration steps for the operator (dashboard → Log Drains → endpoint + secret; needs the
`LOG_DRAIN_SECRET` set in Production before the receiver deploys — ruling-4-style ordering
even though it is not a spend cap); the soak query the WS-3.6 plan will run.

**Migration mechanics (every migration PR):** claim the next free number at rebase time
(INDEX §4 gives the intended order); never renumber a merged migration; `9999` stays last;
`npm run db:generate` must reproduce your SQL from `schema.ts` (hand-authored statements are
listed in the PR body); the fork itest applies migrations itself via
`scripts/migrations-lib.ts` `runMigrations(URL)` (the harness `scripts/test-integration.sh`
does NOT apply them — `ask-billing.itest.ts:55` is the pattern).

## PR 2 — `observability: log-drain receiver into Neon (runtime_logs, migration 0030)`

- Migration 0030 (INDEX §4 order — rebase after 0028/0029), `runtime_logs` per the design,
  indexed on `(received_at)` and `(deployment_id, received_at)`; additive test per the 0027
  pattern; 9999 last.
- `src/app/api/logs/drain/route.ts`: verifies the Vercel signature (HMAC over the raw body
  with `LOG_DRAIN_SECRET`; constant-time compare; unset secret → 503 and no insert — fail
  closed); parses NDJSON/JSON array per the docs; inserts in one batched statement; caps per
  request; returns 200 fast; never logs the body.
- **Self-ingestion filter:** the receiver runs on the deployment whose logs it ingests, so
  its own invocation logs come back to it — drop rows whose request path is the drain route
  itself, keep the handler log-silent, and cap batch size; document the loop in the design.
- Retention sweep: at most once per hour, delete rows older than the retention env
  (`LOG_DRAIN_RETENTION_DAYS`, default 14) — INSIDE the drain route only (bounded, after the
  insert). Never hook it into `withCronRun`/`startRun` — that path runs at every cron start.
- Precondition recorded in the design and the PR body: the operator confirmed at H0 that the
  Vercel plan supports log drains (O1). If not confirmed, PR 2 stays HELD.
- Tests: signature accept/reject/missing-secret; batch cap; retention arithmetic; a fork itest
  inserting and sweeping. Route added to the authz-page-gate ROUTES table? No — it is an API
  route, not a page; say so and add a body-leak assertion that a bad signature returns no data.
- `.env.example`: `LOG_DRAIN_SECRET`, `LOG_DRAIN_RETENTION_DAYS` with comments.

## Acceptance

Unit green (counts); fork itest name + result; `git diff vercel.json` empty; no env set
anywhere; the design doc names the exact operator registration steps and the ruling-4-style
ordering (secret in Production BEFORE deploy; deploy from the release clone; then register the
drain; then verify rows arrive).

## Report

Per COMMON §5. In **Handoff**: the SQL the soak will use, the deploy-order note for step 27,
and the O1 sub-decisions still open (plan tier).
