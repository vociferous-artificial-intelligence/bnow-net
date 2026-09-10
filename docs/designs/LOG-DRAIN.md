# Runtime log drain — design (OPEN-TASKS #93)

**Status: DESIGN + receiver implementation.** This document is the design half.
It is written to be readable on its own: it names the problem, the three sink
options with their real costs, the recommended shape, exactly which payload
fields are stored and which are never stored, the failure modes (including the
self-ingestion loop the receiver creates by existing), the operator
registration runbook and its ordering constraint, and the query the WS-3.6
shadow soak will run against the result.

**Nothing here is enabled by merging it.** The receiver ships default-inert:
with `LOG_DRAIN_SECRET` unset the route refuses every request with 503 and
writes nothing, and no drain exists in the Vercel project until an operator
creates one in the dashboard. There is no `vercel.json` change — drains are
project/team settings, not `vercel.json` keys.

---

## 1. The problem, precisely

Every soak verdict this project has issued rests on two sources: the
`cron_runs` self-report (a job's own counts payload, written by the job being
graded) and a bounded `vercel logs` tail. The tail is not evidence:

- `docs/OPEN-TASKS.md` #93 — the QF-B formal window 2026-08-22T02:00Z →
  2026-08-23T02:00Z had **zero** runtime-log coverage by the time it was
  closed; the verdict rested on `cron_runs` plus four independent durable
  stores plus out-of-band alert email.
- `docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md` — the same limitation is
  recorded again for the Ask-family observation window.

Two consequences follow, and both have already bitten:

1. **A self-report cannot classify its own failure.** The #86 closeout could
   not tell one provider `400` from another from `cron_runs` alone; the
   standing instruction that survives it ("a residual non-zero map
   `batchErrors` must be classified by signature from the runtime log before
   being attributed to anything") is currently **unexecutable** — the runtime
   log is gone within hours.
2. **A run that never returns leaves no narrative.** Ruling 10 gives us
   `finished_at IS NULL` as the timeout signal and #98's sweep classifies the
   row, but neither says *what the process was doing when it died*. The
   2026-08-31 map-flood OOM was diagnosed only because the session happened to
   capture the runtime log live, inside the incident.

WS-3.6's shadow soak requires in-window runtime-log coverage as an acceptance
input, so this is on the critical path, not merely hygiene.

**What exists today: nothing.** There is no drain route, no signature
verification, no receiver table, no `LOG_DRAIN_*` name in `.env.example`, and
no drain configured in the Vercel project.

---

## 2. Options

Costs below use Vercel's published Pro pricing and the observed shape of this
project's traffic (a private beta: the log volume is dominated by ~200
scheduled function invocations per day, not by user requests).

### (a) Neon receiver — a route of ours writing a table of ours **[RECOMMENDED]**

A `POST /api/logs/drain` route on the existing deployment verifies Vercel's
`x-vercel-signature`, parses the batch, and inserts bounded rows into a new
`runtime_logs` table in the same Neon database that already holds `cron_runs`.

- **Cost:** Vercel Drains volume is billed at **$0.50/GB** of uncompressed JSON
  (`https://vercel.com/docs/drains`, read 2026-09-06). At the projected volume
  below (§4) that is **cents per month**. Neon storage for 14 days of retained
  rows is ~20–60 MB — inside the existing plan. No new vendor, no new account,
  no new invoice.
- **Retention:** ours to choose, enforced by our own sweep. Recommended **14
  days** (§6).
- **Queryability — the deciding argument.** The soak evidence we actually need
  is *correlated*: "for the map cycle recorded in `cron_runs` row 12345, show
  every runtime log line from that deployment in that window". With the rows in
  Neon that is one `JOIN` in `scripts/sqlq.ts`; `scripts/audit-cron.ts` can
  grow a runtime-log column. With any external sink it is a manual
  cross-system reconciliation by hand, at exactly the moment (incident
  response, soak closeout) when hand reconciliation is least trustworthy.
- **Cost of ownership:** one route, one table, one sweep, ~1 day of work. The
  operational surface is small and already-familiar: it reuses the retention
  pattern of `src/lib/ask/retention.ts` and the batched-insert pattern the
  ingest adapters already use.
- **Honest downsides:** (i) the receiver runs on the deployment whose logs it
  ingests, which creates the self-ingestion loop of §7 — bounded, not
  eliminated; (ii) if the deployment is *down*, the receiver is down, and
  Vercel's retries plus its errored-drain notification are the only backstop —
  so this sink is weakest exactly during a total outage, which is the one
  failure mode `cron_runs` already covers well (no rows at all); (iii) log
  volume becomes database write volume, which is why the caps in §5 are
  load-bearing rather than decorative.

### (b) Hosted sink (Dash0, Datadog, or any custom endpoint we do not own)

- **Cost:** the same $0.50/GB Vercel drain volume **plus** the vendor's
  ingestion price, plus a new account, a new credential to rotate, and a new
  data-processor relationship to disclose. Retention is whatever the plan
  grants (commonly 3–7 days at entry tiers — i.e. often *worse* than what we
  would choose ourselves).
- **Upside:** genuinely better search UX, alerting, and it survives our own
  deployment being down.
- **Why not now:** the correlation problem above. Our evidence standard is
  "re-derive every figure from the durable record"; splitting that record
  across two systems with different clocks and different retention makes a
  closeout harder to audit, not easier. Revisit if log volume ever outgrows a
  Postgres table, or if we need alerting on log content (today `map-health`
  and the #103 watchdog own alerting, from database state).

### (c) Vercel log-retention extension

- Not an option in the shape we need: the drains product replaced configurable
  log storage, and dashboard log retention is a viewing window, not an
  exportable durable record. It also cannot be joined to `cron_runs`.
  Rejected.

### O1 — what the operator decision actually turns on

Decision O1 (INDEX §2) is **partly answered as of 2026-09-06**: the operator
confirmed the `vociferous` Vercel plan **does** support drains (they are a Pro
and Enterprise feature — `https://vercel.com/docs/drains`, read 2026-09-06).

The operator also noted that **"Neon does not support drains on the Launch
plan."** That is true and **irrelevant to this design**, and the point is
recorded here so it is not re-litigated: this design uses **no Neon feature
beyond ordinary `INSERT`/`DELETE` on a table we own**. The word "drain" appears
on both sides by coincidence of naming. Concretely —

- The *producer* is Vercel: it POSTs log batches to an HTTPS endpoint. That is
  the feature the plan must support, and it does.
- The *receiver* is our own Next.js route on our own deployment.
- The *sink* is a normal Postgres table (`runtime_logs`) in the database we
  already use. Neon sees ordinary parameterized writes, identical in kind to
  every `raw_documents` insert the ingest crons already perform.

There is no Neon-side log drain, log export, or streaming feature in this
design, so no Neon plan tier gates it.

**Still open under O1, for the operator, before PR 2 deploys** (each is a
one-line answer, none blocks writing or merging the code):

1. Confirm the above — that the Neon-plan remark was about a Neon feature this
   design does not use, and does not withhold authorization for the receiver.
2. Sink choice: (a) Neon receiver — the recommendation — vs (b) hosted.
3. Retention: 14 days (recommended) vs another number.
4. Registration mechanism: dashboard (recommended — `VERCEL_TOKEN` is expired
   per `docs/BLOCKERS.md`, and drains are a team-settings surface) vs REST API
   with a fresh token.
5. Log **sources** and **environment** to select at registration (§8
   recommends `lambda` only, `production` only).

---

## 3. Recommended shape

```
Vercel (production deployment, source=lambda)
  │  POST https://bnow.net/api/logs/drain
  │  x-vercel-signature: <hex HMAC-SHA1 of the raw body, keyed by the drain secret>
  │  body: NDJSON (one log object per line)
  ▼
src/app/api/logs/drain/route.ts
  │  1. secret unset?            → 503, nothing read, nothing written  (fail closed)
  │  2. signature missing/wrong? → 403, nothing written                (constant-time)
  │  3. parse, normalize, redact, truncate, drop self-ingestion rows
  │  4. cap the batch; one multi-row INSERT ... ON CONFLICT (id) DO NOTHING
  │  5. at most once per hour: bounded retention DELETE
  │  6. 200 {ok, received, stored, dropped}                            (fast, always)
  ▼
runtime_logs  (Neon, beside cron_runs)
```

The route is a **route, not a page**, so standing ruling 21 does not apply in
its usual form: there is no `requireAdmin`/`requireAcceptedUser` gate to place
as the first statement, because there is no session and no user. **The drain
signature is the entire authorization**, which is why it is verified before any
parse, any allocation past the raw body, and any database call. There is no
`GET` handler: the route exports `POST` only, so a browser GET is a 405 from
the framework and can leak nothing.

Nothing in `runtime_logs` is rendered on any user-facing surface. It is an
operator/eval store read by `scripts/sqlq.ts` and (later) `scripts/audit-cron.ts`.

---

## 4. What is stored, and what is never stored

Vercel's log-drain v1 schema is documented at
`https://vercel.com/docs/drains/reference/logs` (read 2026-09-06). It carries
substantially more than we want. The receiver **projects** it down — an
unlisted field is not stored, so a future Vercel schema addition cannot start
silently landing in our database.

### Stored (13 columns)

| Column | Source field | Why |
|---|---|---|
| `id` (PK) | `id` | Vercel's log-entry id. Primary key ⇒ a retried delivery is idempotent (`ON CONFLICT DO NOTHING`). |
| `logged_at` | `timestamp` (ms epoch) | When the line was emitted — the soak window axis. |
| `received_at` | — (`now()`) | When we stored it — the retention axis, and the delivery-lag measure. |
| `deployment_id` | `deploymentId` | Ties a line to a release, exactly as `/health`'s stamp does. |
| `source` | `source` | `lambda` / `edge` / `build` / `static` / … |
| `level` | `level` | `info` / `warning` / `error` / `fatal`. |
| `type` | `type` | `stdout` / `stderr` / `report` / `fatal` / … |
| `environment` | `environment` | `production` / `preview`. |
| `request_path` | `path`, else `proxy.path` | **Query string stripped at the first `?`** (see below). Identifies the cron route. |
| `request_id` | `requestId` | Correlates every line of one invocation. |
| `status_code` | `statusCode` | `-1` is Vercel's "lambda crashed with no response" — the OOM signature. |
| `message` | `message` | **Redacted then truncated** (below). |
| `message_sha256` | derived | SHA-256 of the *pre-truncation, post-redaction* message: lets a soak count distinct log signatures and group repeats without storing more text. |

### Never stored — and why each one

- **Request and response headers, and request/response bodies.** Vercel does
  not send them in the log schema and we never ask for them. Nothing in the
  receiver reads a header other than `x-vercel-signature`.
- **`proxy.clientIp`, `proxy.userAgent`, `proxy.referer`, `ja3Digest`,
  `ja4Digest`.** Personal data / fingerprinting surface with no soak value.
  Our Privacy Notice discloses GeoIP retention for analytics; it does not
  disclose a second IP store, and this design deliberately does not create one.
  (The team-wide **IP Address Visibility** toggle in Vercel Settings →
  Security & Privacy can hide IPs at source as defence in depth — §8 step 0.)
- **Query strings.** `proxy.path` is documented as "request path *with query
  parameters*". Our own cron URLs carry `?which=`/`?mode=`/`?date=` — harmless
  — but `/ask?q=<user question>` is not, and a stored query string would be an
  undisclosed second copy of Ask content outside `ASK_CONTENT_RETENTION_DAYS`.
  The receiver truncates the path at the first `?` before insert. The cron
  discriminator is therefore lost from `request_path`; it is recoverable from
  `cron_runs.job`, which is where it belongs.
- **`host`, `projectId`, `projectName`, `branch`, `buildId`, `entrypoint`,
  `destination`, `executionRegion`, `traceId`/`spanId`, the rest of `proxy`.**
  Constant, derivable, or unused. Add a column later if a real query needs one.

### Message handling — three transforms, in this order

1. **Redact credential shapes.** Our code does not log secrets, but an
   unhandled error can serialize one (a `postgres://…` connection string in a
   driver error is the realistic case). Before anything else the receiver
   replaces `postgres://`/`postgresql://` URLs, `Bearer <token>`, and
   `sk-`/`sk_`-prefixed keys with `[redacted]`. This is a safety net, not a
   licence to log secrets.
2. **Hash.** `message_sha256` over the redacted full message.
3. **Truncate to 2,000 code units with `wellFormedSlice`**
   (`src/lib/text/well-formed-slice.ts`) — the repo's standing truncation
   primitive (#86/#97 family; ruling recorded 2026-08-23). A plain `.slice()`
   here would be the same lone-surrogate defect in a new place, and although
   Postgres would accept it, the repaired primitive costs nothing. 2,000
   matches `cron_runs.error`'s existing clip.

**Legal note (ruling 1).** These are *our own* log lines, not ISW prose or
source full text. But a log line can quote the data it was processing, so:
truncate regardless, store internal-only, and never render `runtime_logs` on a
user-facing surface. If a future reader surfaces it, it must go through the
same review any internal store does.

### Volume

Roughly 200 scheduled invocations/day, each emitting on the order of 10–50
lines, plus a low private-beta request volume: **~5–10k entries/day**, ~500
bytes each uncompressed ⇒ **~2.5–5 MB/day ⇒ 75–150 MB/month ⇒ $0.04–$0.08/month**
of Vercel drain volume. Stored 14 days at ~300 bytes/row after projection:
**~70–140k rows, ~20–45 MB** in Neon. Both are noise. The caps in §5 exist for
the pathological case (a log storm during an incident), not the normal one.

---

## 5. Rate bounding — the receiver must never be the outage

Four independent bounds, all of which prefer *dropping data* to *blocking or
failing*:

1. **Body byte cap** (`LOG_DRAIN_MAX_BODY_BYTES`, default 4,000,000). A body
   over the cap is answered `200` with `stored: 0` and a `dropped` count. It is
   not a `4xx`: a non-2xx makes Vercel retry, and retrying an oversized body
   forever is worse than losing it. (Vercel's own function request-size limit
   already sits below this; the cap is belt-and-braces against a future limit
   change.)
2. **Batch row cap** (`LOG_DRAIN_MAX_ROWS`, default 1,000). Entries past the
   cap are dropped and counted; the first 1,000 are stored. One multi-row
   `INSERT` of ≤1,000 rows × 13 params is well inside any statement limit.
3. **Per-message truncation** (2,000 code units) bounds row width.
4. **Bounded retention delete** (§6) bounds the delete's work per pass, so the
   sweep can never turn one drain delivery into a long-running statement.

**Failure policy, stated as a contract:**

| Condition | Response | Rationale |
|---|---|---|
| `LOG_DRAIN_SECRET` unset/blank | **503**, no body read, no write | Fail closed (ruling-4 *shape*, though no spend is involved): an unconfigured receiver must not accept unauthenticated data. 503 also makes Vercel retry and, past its threshold, raise its errored-drain notification — which is the misconfiguration alarm. |
| Signature missing or mismatched | **403**, no write | Not our traffic. Constant-time comparison. |
| Body over cap / unparseable / zero valid entries | **200**, `stored: 0` | Never retry-storm on data we have decided not to keep. |
| Database insert fails | **500** | The one case where a retry genuinely helps: the batch is real, the signature was valid, and the delivery should come back. Bounded by Vercel's own retry policy. |
| Anything else thrown | **200** with `stored: 0` | Bookkeeping never breaks the producer. |

**The handler is log-silent.** It contains no `console.*` on any path,
including error paths — see §7. Its counters are returned in the response body
(which Vercel discards) and are visible as the *absence* of growth in
`runtime_logs`, not as log lines.

---

## 6. Retention

- Env `LOG_DRAIN_RETENTION_DAYS`, **default 14**. Invalid, blank or ≤0 falls
  back to 14 — this is not a spend cap, and failing closed here would mean
  "retain forever", the opposite of safe.
- 14 days because it must comfortably contain the longest observation window
  this program runs (48h) plus the time to *close* it (a QF-A window took three
  days to adjudicate), with room for a second look, while staying far short of
  anything that would make `runtime_logs` a long-term personal-data store.
- **The sweep lives inside the drain route only**, after the insert, throttled
  to at most once per hour per process — the `sweepAskRetentionThrottled`
  pattern (`src/lib/ask/retention.ts`), which piggybacks hygiene on a path that
  is already running.
- **It is deliberately NOT hooked into `withCronRun`/`startRun`.**
  `src/lib/usage/cron-run.ts` `startRun()` already carries two riders — the
  #98 timeout sweep and the #103 map watchdog — and runs at **every** cron
  start, i.e. at least every 15 minutes on the fast ingest. Adding a third
  rider there would put an unrelated `DELETE` on the critical path of every
  scheduled job in the system, for a table those jobs never read. The drain
  route runs often enough (many times an hour under any live drain) and is the
  only writer, so it is the correct host.
- The delete is bounded per pass:
  `DELETE FROM runtime_logs WHERE ctid IN (SELECT ctid FROM runtime_logs WHERE received_at < $1 LIMIT $2)` with `$2` = `LOG_DRAIN_SWEEP_LIMIT`
  (default 5,000). A backlog drains over successive hourly passes instead of
  one long statement.
- If the drain is paused or deleted, the sweep stops running and rows age
  without being removed. That is acceptable and recorded: a paused drain means
  no new rows either, and the operator deleting a drain should delete the table
  contents in the same gesture (§8 step 6).

---

## 7. The self-ingestion loop — stated, bounded, not hidden

**The receiver runs on the deployment whose logs it ingests.** Every drain
delivery is an invocation of `/api/logs/drain`, and that invocation itself
produces `lambda` log entries, which Vercel then delivers to
`/api/logs/drain`. The loop does not terminate by construction.

What makes it harmless is that it does not *amplify*:

- One delivery produces a **constant** number of new log entries (the platform's
  own per-invocation request/report lines), not a number proportional to the
  batch it just received — because the handler emits **no application log lines
  of its own on any path**. That is a hard requirement on the implementation,
  not a stylistic preference: a single `console.warn` in the error path would
  make every failed delivery generate a line that generates a delivery that
  fails and generates a line.
- Vercel batches multiple entries per delivery, so the steady state is a low
  constant rate (order: a handful of deliveries per batching interval), not
  growth.

Three mitigations, in order of strength:

1. **Drop at insert (implemented, always on).** Any entry whose `request_path`
   is the drain route itself is discarded before the insert and counted in the
   response's `dropped`. The table therefore never contains the loop, even if
   the loop is running. This costs the request, not the storage. *Residual,
   stated:* the filter keys on `path`/`proxy.path`, so a self-generated entry
   carrying **no** path field would not be recognised. That is why requirement 2
   is a requirement and not a preference — with a log-silent handler the only
   self-entries are the platform's own per-invocation request/report lines,
   which do carry a path.
2. **Log-silent handler (implemented, always on).** No `console.*` anywhere in
   the route or its library, so the loop's per-delivery cost stays constant.
3. **A 0% sampling rule at registration (recommended, operator action —
   §8 step 4).** Vercel's log-drain sampling rules run top to bottom, a request
   uses the first matching rule's rate, and unmatched requests are dropped
   (`https://vercel.com/docs/drains/reference/logs`, read 2026-09-06). So:
   *rule 1* — path prefix `/api/logs/drain`, **0%**; *rule 2* — blank prefix,
   **100%**. That kills the loop at the producer and is the only mitigation
   that removes the request cost as well as the storage cost. It is a dashboard
   setting, so it cannot be shipped in code; the receiver is correct with or
   without it.

A fourth option — hosting the receiver in a *separate* Vercel project — removes
the loop entirely but doubles the deployment surface, splits the database
credential, and makes the receiver's own health a second thing to watch. Not
recommended at this volume; recorded as the escape hatch if the loop ever
misbehaves.

---

## 8. Operator registration runbook

**Ordering constraint (ruling-4 *shape*).** Ruling 4 says to set a new cap env
in every Vercel environment **before** deploying the guard that reads it, or
you stop that pipeline. `LOG_DRAIN_SECRET` is not a spend cap, but it has the
same ordering property with the opposite failure direction: deploy first and
the receiver 503s every delivery until the secret appears, which trips Vercel's
errored-drain notification and looks like an incident. **So: secret first,
deploy second, register third.**

Concretely:

0. *(Optional, defence in depth.)* Vercel dashboard → Team **Settings** →
   **Security & Privacy** → **IP Address Visibility** → toggle off, so the text
   reads "IP addresses are hidden in your Drains". Team-wide. The receiver
   never stores `proxy.clientIp` regardless.
1. **Generate the secret** (any 32+ byte random hex/base64 string; it is a
   shared HMAC key, not a password).
2. **Set `LOG_DRAIN_SECRET` in Vercel — Production, Preview and Development —
   BEFORE the deploy.** Optionally set `LOG_DRAIN_RETENTION_DAYS=14`
   explicitly; leaving it unset applies the same default.
3. **Deploy** the receiver **from the plain release clone**
   `/Users/go/code/bnow-net-rel-20260823` (never a worktree — OPEN-TASKS #78,
   the blank `/health` stamp trap), per `docs/RELEASE-CHECKLIST.md`. The route is
   live but inert: no drain exists yet, so no request arrives.
   **NOTHING APPLIES MIGRATIONS ON DEPLOY.** `package.json`'s `build` is plain
   `next build`, `vercel.json` declares no `buildCommand`, and `db:migrate` is the
   manual `tsx scripts/migrate.ts` that `docs/RELEASE-CHECKLIST.md` step 11
   requires as its own line. Deploying the code without the migration is *safe* —
   the receiver is inert until the secret exists and a drain is registered — but
   registering a drain against a database with no `runtime_logs` table is not:
   every signed delivery reaches `insertRuntimeLogs`, throws, returns 500 (the one
   retryable status), Vercel retries it, and the errored-drain notification fires.
3b. **Apply migration 0029 — its own step, BEFORE step 4.** From the release
   clone: take the Neon backup branch first (RELEASE-CHECKLIST step 11, precedent
   `backup-pre-iran-recovery-2026-08-15` / `br-polished-block-atu0r968`), then
   `npm run db:migrate`, then confirm the marker landed:

   ```sql
   SELECT name FROM _migrations WHERE name LIKE '0029%';   -- expect exactly one row
   SELECT to_regclass('runtime_logs');                     -- expect: runtime_logs
   ```

   Until both answer, do not proceed to step 4. (As of 2026-09-08 production is
   still at 29 `_migrations` rows with `0027` as its newest numbered migration and
   `runtime_logs` absent — OPEN-TASKS #111.)
4. **Register the drain**: Vercel dashboard → **Team Settings** → **Drains** →
   **Add Drain** → data type **Logs** → select the `bnow-net` project.
   - **Additional configuration for logs**: sources **`lambda`** only
     (recommended — `static` and `edge` add volume with no soak value; add
     `build` temporarily if a build is under investigation); environment
     **`production`** only.
   - **Sampling rules**: *rule 1* path prefix `/api/logs/drain` at **0%**;
     *rule 2* blank prefix at **100%** (§7 mitigation 3). Order matters.
   - **Configure destination → Custom endpoint**:
     - **Endpoint URL**: `https://bnow.net/api/logs/drain`
     - **Format**: **NDJSON** (the receiver accepts JSON arrays and
       concatenated objects too, so either format works; NDJSON is what the
       tests pin as primary).
     - **Signature Verification Secret**: paste **the same value** as
       `LOG_DRAIN_SECRET`. Vercel auto-generates one — replace it, or copy
       Vercel's value into the env var instead; they must match exactly.
     - **Custom headers**: none.
   - **Create Drain.** Vercel tests the endpoint automatically on creation and
     the **Test** button re-tests at any time; a healthy receiver answers 200.
5. **Verify rows arrive** — within a few minutes:
   ```sql
   SELECT count(*)                     AS rows,
          count(DISTINCT deployment_id) AS deployments,
          min(logged_at), max(logged_at)
     FROM runtime_logs;
   ```
   run through `npx tsx scripts/sqlq.ts`. Expect a non-zero count, the current
   production `deploymentId`, and **zero** rows with
   `request_path = '/api/logs/drain'` (§7 mitigation 1).
6. **To retire the drain**: dashboard → Drains → **Pause** (reversible) or
   **Delete**, then `DELETE FROM runtime_logs` — a deleted drain stops the
   sweep, so the rows would otherwise age in place.

**Rotation.** Changing the secret is a two-step with a gap in which deliveries
fail: update the env var + redeploy, then update the drain's secret in the
dashboard (or the reverse). Vercel retries, so a short gap loses little; do it
outside an observation window.

---

## 9. The query the WS-3.6 soak will run

The point of the table is correlation with `cron_runs`. Three shapes, all
`SELECT`-only, all runnable through `scripts/sqlq.ts`.

**(a) In-window coverage — does the window have runtime-log evidence at all?**

```sql
SELECT count(*)                        AS lines,
       count(DISTINCT request_id)      AS invocations,
       count(DISTINCT deployment_id)   AS deployments,
       count(*) FILTER (WHERE level IN ('error','fatal')) AS error_lines,
       count(*) FILTER (WHERE status_code = -1)           AS crashed_invocations,
       min(logged_at), max(logged_at)
  FROM runtime_logs
 WHERE logged_at >= '2026-09-07T00:00:00Z'
   AND logged_at <  '2026-09-09T00:00:00Z';
```

`crashed_invocations` is the OOM/kill signature (`statusCode = -1` is Vercel's
"no response returned and the lambda crashed"); before this table it was
invisible to every closeout.

**(b) Distinct error signatures, so a residual counter can be classified.**
This is the standing instruction #86's closeout left unexecutable:

```sql
SELECT message_sha256,
       count(*)                              AS occurrences,
       min(logged_at) AS first_seen, max(logged_at) AS last_seen,
       min(left(message, 200))               AS sample
  FROM runtime_logs
 WHERE logged_at >= $1 AND logged_at < $2
   AND level IN ('error','fatal')
 GROUP BY message_sha256
 ORDER BY occurrences DESC
 LIMIT 50;
```

**(c) Join to the run being graded — every line of one cron invocation.**

```sql
SELECT r.job, r.started_at, r.finished_at, r.ok,
       l.logged_at, l.level, l.status_code, left(l.message, 300) AS message
  FROM cron_runs r
  JOIN runtime_logs l
    ON l.request_path = '/api/cron/map'
   AND l.logged_at >= r.started_at
   AND l.logged_at <  COALESCE(r.finished_at, r.started_at + interval '920 seconds')
 WHERE r.id = $1
 ORDER BY l.logged_at;
```

The `COALESCE` upper bound is the job family's `maxDuration` + sweep grace from
`JOB_MAX_DURATION_SEC` (`src/lib/usage/cron-run.ts`) — which is precisely the
window in which a run that left `finished_at IS NULL` (ruling 10) must have
died, and therefore where its last words are.

A soak closeout should report (a) for the whole window as its coverage claim,
(b) for classification, and (c) for any run that went `ok=false`, degraded, or
was swept.

---

## 10. Rulings

| Ruling | How this design satisfies it |
|---|---|
| 1 (legal) | `runtime_logs` is internal-only and never rendered user-facing; messages are our own lines, redacted and clipped to 2,000 units. |
| 3 (truth-in-UI) | Nothing here renders anywhere; no stub or fixture data reaches a surface. |
| 4 (spend) | No paid provider call exists on this path. The *ordering* discipline is borrowed: `LOG_DRAIN_SECRET` is set in Production before the receiver deploys (§8), and an unset secret fails closed (503, no write). |
| 5 (migrations) | `runtime_logs` is a new additive table; no applied migration is edited; `9999_claim_source_trigger.sql` stays last. |
| 10 (`cron_runs`) | The receiver is **not** a cron: it writes no `cron_runs` row, does not use `withCronRun`, and neither runs nor perturbs the timeout sweep or the map watchdog. |
| 21 (authorization in the page) | Not a page — an API route with no session and no user. The drain signature *is* the authorization, verified before any parse or query. No `GET` handler exists. It therefore takes no row in `authz-page-gate.itest.ts`'s `ROUTES` table (that harness boots pages and asserts on rendered bodies); the equivalent assertion — a bad signature returns no data — is a unit test plus a fork integration test. |

---

## 11. Debt this design knowingly accepts

- **The receiver shares the fate of the deployment it observes.** A total
  outage loses the log lines that would explain it. Mitigation is Vercel's
  retry plus its errored-drain notification; a hosted sink (option b) is the
  real fix if that case ever matters more than correlation does.
- **The self-ingestion loop is bounded, not eliminated**, without the operator
  sampling rule of §8 step 4.
- **Preview deployments are excluded** by the recommended registration.
  Deliberate: previews are noisy and are never the subject of a soak.
- **No alerting.** This table is evidence, not monitoring. Alerting stays with
  `map-health` and the #103 watchdog, which read database state — deliberately,
  because an alerting path that depends on log delivery fails silently when
  log delivery fails.
- **`request_path` loses the cron discriminator** (`?which=fast` etc.) to the
  query-string strip. Recover it from `cron_runs.job`.
- **The self-ingestion filter is path-keyed**, so it depends on the handler
  staying log-silent (§7 residual). A future contributor adding a `console.warn`
  to the route would not fail any test — it would slowly fill the table with the
  receiver's own noise. Worth a lint rule if the file ever grows.
