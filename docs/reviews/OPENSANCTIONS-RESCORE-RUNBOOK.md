# OpenSanctions monthly rescore — operator runbook

Companion to `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md`. The code
(calendar-month accounting + fixed-cutoff resumable rescore) is deployed from merge `f9aaa9e`
(`dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`). **This runbook drives PAID production calls
— do not run it until the rescore gate is fully open (below).**

## Paid-rescore gate (all must be true before `--run`)

1. Private-beta readiness + canonical-identity persist are deployed (done).
2. X recovery/closeout complete (done — `f94d70c`; analyst-beta merged `2bf89ed`).
3. Entity cleanup **#61** is explicitly operator-approved AND
   `scripts/entities-cleanup.ts --apply` has been run after the canonical persist
   fix is live, with post-apply integrity checks passing.
4. **Done 2026-07-15:** merged + deployed; the live endpoint returned the new invalid-cutoff
   400s without entering provider work.
5. The operator **separately authorizes** the paid rescore after a fresh
   population/quota recount.

Do not spend quota matching entity rows that are about to be merged/dropped: run
cleanup #61 FIRST, then pick the cutoff, then rescore.

## Preconditions on the deployed endpoint

- Env (already set; verify, do not change without authorization):
  `OPENSANCTIONS_CALL_CAP=2000` (now a **calendar-month** request quota),
  `OPENSANCTIONS_DAILY_CALL_CAP=200`, `OPENSANCTIONS_RUN_CALL_CAP=120`,
  `OPENSANCTIONS_DAILY_USD_CAP=40`.
- `CRON_SECRET` present; `OPENSANCTIONS_API_KEY` present (live).

## Step 0 — recount the baseline (read-only)

Right before the run, record the exact population and current-month usage:

```sql
-- eligible population + how many are missing/stub-only
SELECT count(*) FILTER (WHERE true) AS eligible,
       count(*) FILTER (WHERE (meta->'opensanctions') IS NULL
                          OR (meta->'opensanctions'->>'stub')::boolean IS TRUE) AS missing_or_stub
FROM entities WHERE kind IN ('person','company','org','agency','faction');

-- calendar-month OpenSanctions requests already spent (UTC month)
SELECT coalesce(sum(requests),0) AS month_requests,
       round(coalesce(sum(est_usd),0)::numeric,4) AS month_est_usd
FROM provider_usage
WHERE provider='opensanctions' AND day >= date_trunc('month', now() AT TIME ZONE 'UTC');
```

Prove `month_requests + remaining_candidates <= 2000`. If not, the rescore is still
safe — it simply pauses on the monthly cap and **resumes after the UTC month reset**;
do NOT raise the quota to finish faster.

## Step 1 — pick ONE fixed cutoff and keep it for the whole rescore

Record a timezone-qualified ISO instant **after** cleanup #61 was applied and **no
later than now** — capturing the current instant when you start is the safe choice
(a future or timezone-less cutoff is rejected with 400):

```
BEFORE=$(date -u +%FT%TZ)      # a captured "now", e.g. 2026-07-15T14:30:00Z
```

Every invocation MUST use this exact same cutoff. Because each check stamps
`checkedAt = now` (at or after the cutoff), the same cutoff advances through the
corpus batch by batch — and a freshly checked row can never re-enter the strict
`checkedAt < before` predicate, so it is never billed twice.

## Step 2 — dry run (no calls)

```
npx tsx scripts/opensanctions-rescore.ts --before "$BEFORE"
```

Confirms the endpoint URL and pacing. Makes no network call.

## Step 3 — drive the rescore serially (paid; operator only)

Run ONE driver at a time (the guard snapshot is per invocation; concurrent runs
could each reserve up to the remaining monthly quota). On this WSL2 box the
vercel.app route needs the DNS pin:

```
CRON_SECRET=… NODE_OPTIONS="--require ./scripts/pin-dns.cjs" \
  npx tsx scripts/opensanctions-rescore.ts --before "$BEFORE" --run
```

The driver prints each batch (`checked / matched / sanctioned / failed / remaining /
stop`) and:

- continues after a `run_cap` stop or a clean full batch (a fresh invocation resets
  the per-run counter),
- **stops on `daily_cap`** — resume on the next UTC day (it does not busy-loop),
- **stops on `monthly_cap`** — the 2,000 quota is spent; resume after the UTC month
  reset,
- **stops on `completed`** — zero candidates remain for the cutoff.

Do NOT overlap the ordinary 08:00 UTC enrich cron; its calls count in the same daily
and monthly ledgers. Respect 120/run and 200/day — do not raise them to finish faster.

Alternative without the driver (equivalent, fully manual) — repeat until
`sanctions.completed` is true, watching `sanctions.remaining` and `sanctions.stopReason`:

```
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE/api/cron/enrich?only=sanctions&refresh=1&before=$BEFORE&limit=120" | jq .sanctions
```

## Step 4 — completion evidence (do NOT claim done on a green cron alone)

Completion requires ALL of:

- nonzero early `checked` counts,
- advancing entity coverage across batches (remaining strictly decreasing),
- a final batch with `remaining == 0` (`completed: true`),
- every entity in the Step-0 population now has `checkedAt >= BEFORE`
  (entities created after the cutoff are accounted separately, not required),
- `provider_usage` month totals match the sum of batch `checked` + failures.

Record before/after `checked / matched / sanctioned / failed` and month requests.

Verify no stub match surfaces as fact (truth-in-UI): entity + Ask surfaces already
NULL out `stub=true` / `osId LIKE 'NK-stub%'`; spot-check a rescored row.

## Rollback / safety

- Nothing here mutates `provider_usage` history or migrations.
- The endpoint fails closed if the caps are unset; a budget stop is a normal green
  run, never an HTTP error.
- To abort mid-rescore, just stop the driver — the next run resumes from the same
  cutoff with no double-work (already-fresh rows are past the cutoff).
