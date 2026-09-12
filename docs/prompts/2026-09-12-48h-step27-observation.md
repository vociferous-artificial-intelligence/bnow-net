# Step 27 — observation window read at 02:00Z (agent prompt, 2026-09-12)

**You are the observation reader.** Step 27 deployed `45fa81f` to production on 2026-09-11
(migrations 0028/0029/0030 applied 22:35Z, deployed ≈22:38Z, log drain registered ≈23:30Z).
Card 27.11 of `docs/prompts/2026-09-11-48h-step27-deploy-cards.md` names the readings that
close the first observation window. You take those readings **after the 02:00 UTC digest
finalize has finished**, classify each against the expectation below, and paste a report.
**You change nothing**: no write to any database, no env change, no deploy, no commit, no
launch, no provider call. Every command here is a SELECT or a read-only script. $0.

**Model / effort / mode.** Sonnet or Opus / low, attended or `claude -p`, in the release clone
`/Users/go/code/bnow-net-rel-20260823` on branch `main`:
`cd /Users/go/code/bnow-net-rel-20260823 && caffeinate -ims claude --model sonnet` then paste this
file. (Or the operator runs §2's blocks by hand — they are the whole job.)

**When.** Not before **02:20Z** (22:20 ET 2026-09-11): the `digest:finalize` cron fires at
02:00Z and the 2026-09-11 runs took 3–5 minutes; the `04:00Z` job is a second useful point but
not required. If you are started early, the first block tells you to wait — do not fake a
reading.

---

## 1. Preflight — which database, which deployment

```
cd /Users/go/code/bnow-net-rel-20260823
date -u
git log --oneline -1
grep -E '^DATABASE_URL(_UNPOOLED)?=' .env.local | sed -E 's#^([A-Z_]+=).*@([^/?]+)/.*#\1@\2#'
curl -s https://bnow.net/health
npx tsx scripts/sqlq.ts "SELECT max(started_at) AS newest_cron FROM cron_runs"
npx tsx scripts/sqlq.ts "SELECT started_at, finished_at, ok, error IS NOT NULL AS errored FROM cron_runs WHERE job = 'digest:finalize' AND started_at > now() - interval '3 hours' ORDER BY started_at DESC LIMIT 1"
```

**Expect:** the clock at or past 02:20Z; the clone at `45fa81f` or a later docs-only commit;
both DSN hosts `ep-jolly-glitter-at0968cv` (production — `-pooler` on the first, bare on the
second; any other host is a STOP: you are reading a snapshot, not production); `/health`
`build 45fa81f` and `DB OK`; `newest_cron` within fifteen minutes; **one `digest:finalize` row
started ≈02:00Z with `finished_at` set**. If that row is absent or has no `finished_at`, the
finalize has not run or has not finished — wait ten minutes and re-run this block; after
02:40Z with still no row, report that as the finding and stop.

## 2. The readings

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx scripts/sqlq.ts "SELECT job, started_at, ok, error IS NOT NULL AS errored, left(error,120) AS err, counts::text FROM cron_runs WHERE started_at > now() - interval '5 hours' ORDER BY started_at DESC"
npx tsx scripts/sqlq.ts "SELECT provider, day::text, requests, round(est_usd::numeric,4) AS usd FROM provider_usage WHERE day >= CURRENT_DATE - 1 ORDER BY day DESC, provider"
npx tsx scripts/sqlq.ts "SELECT count(*) AS embeds_since_deploy FROM claim_embeddings WHERE created_at > '2026-09-11T22:38:00Z'"
npx tsx scripts/sqlq.ts "SELECT c.iso2, d.track, d.digest_date::text, d.provider, d.updated_at FROM digests d JOIN countries c ON c.id = d.country_id WHERE d.updated_at > now() - interval '5 hours' ORDER BY d.updated_at DESC"
npx tsx scripts/sqlq.ts "SELECT count(*) AS rows, min(logged_at) AS first, max(logged_at) AS last, count(DISTINCT deployment_id) AS deployments FROM runtime_logs"
npx tsx scripts/sqlq.ts "SELECT source, count(*) FROM runtime_logs WHERE logged_at > now() - interval '1 hour' GROUP BY 1 ORDER BY 2 DESC"
npx tsx scripts/audit-cron.ts
curl -s -o /dev/null -w 'methodology %{http_code}\n' https://bnow.net/methodology
curl -s -o /dev/null -w 'conflicts %{http_code}\n' https://bnow.net/conflicts
curl -s -o /dev/null -w 'drain %{http_code}\n' https://bnow.net/api/logs/drain
```

If `claim_embeddings` has no `created_at` column (the first query errors), use
`SELECT count(*) FROM claim_embeddings` twice, ten minutes apart, and report the delta.

## 3. What each reading must show — classify, do not summarize

| Reading | Expect | Why it matters |
|---|---|---|
| `digest:finalize` ≈02:00Z | `ok = true`, no `error`, `counts.errors` 0 and no nonzero `batchErrors` | the first scheduled job through the new code's finalize path |
| `provider_usage` `openai_embed` for **2026-09-12** | a row with `requests > 0` | **PR #59's unpriced-model refusal did NOT fire** — the one item the audit could not settle from the repo; requests `0` or no row while finalize ran is a STOP-grade finding |
| `claim_embeddings` since 22:38Z | `> 0` | the same fact from the table side |
| `digests` updated since 02:00Z | one row per active theater/track for 2026-09-11, provider `openai:…` | finalize wrote digests, not stubs |
| every other `cron_runs` row since 21:00Z | `ok = true`; the only gap is the 21:45 and 22:00 `ingest:fast` rows lost in the password-rotation window | no regression from the deploy or the migration |
| `runtime_logs` | rows > 0, `last` within the hour, `deployments` ≥ 1, several `source` values in the last hour | the drain is delivering (registered ≈23:30Z) |
| `audit-cron` | prints a runtime-log coverage **number** and changes no verdict | the G5 coverage report the LOG-DRAIN work promised |
| `opensanctions` row for 2026-09-12 | present with 120 requests if the enrich cron still runs with a dead key (OPEN-TASKS #122); absent or 0 if the operator blanked the key | known condition — record which, do not treat as new |
| `/methodology` 200 · `/conflicts` 404 · `/api/logs/drain` 405 | as listed | the public page is up; the flag is still off; the receiver is live and rejecting unsigned GETs |

Anything outside these expectations: **paste the raw row(s), classify it if the table above
already names it, otherwise mark it UNCLASSIFIED and stop** — do not query further to explain
it, do not re-run a cron, do not touch the dashboard.

## 4. Report shape (paste this, nothing else)

```
Step 27 observation — first window — read at <date -u>
Deployment: /health build <sha>, DB OK — DSN host <host>
digest:finalize 02:00Z: <started/finished/ok/errors>
openai_embed 2026-09-12: <requests / usd>  · claim_embeddings since deploy: <n>   → #59 refusal fired? NO | YES
digests written since 02:00Z: <n rows: iso2/track/provider list>
cron_runs since 21:00Z: <n rows, all ok | exceptions listed>
runtime_logs: <rows, first, last, deployments, sources last hour>
audit-cron coverage: <the number line, verbatim>
opensanctions 2026-09-12: <row or absent> (#122)
routes: methodology <code> conflicts <code> drain <code>
UNCLASSIFIED: <none | the raw rows>
```

Then stop. The operator writes the release record (card 27.12) from this report; the second
and third nights' `openai_embed` reads, and the two-day `/digests` and `/search` checks for
#77 and #84, are the same §2 blocks re-run on 2026-09-13 and 2026-09-14.
