# Neon compute reduction — Phase 0 (pre-edit confirmation) — 2026-08-16

Scope: confirm the existing ingestion-cron system before the Candidate B schedule
edit (stagger the three hourly ingestion crons across :01–:03). This document
records what was VERIFIED against the repository at base commit
`26989f75b8e27442a2fcc44265e7f2907b6c53d4` (= `origin/main` = the commit Vercel
metadata records for the current production deployment
`dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC`, live-verified via `data-dpl-id` on
https://bnow.net/health during this run), what was verified read-only against
live infrastructure, and which numbers are ESTIMATES.

## 1. Observed schedules (vercel.json @ 26989f7 — the full cron table)

| Path | Schedule | Cadence | In scope? |
|---|---|---|---|
| `/api/cron/ingest?which=fast` | `*/15 * * * *` | every 15 min | no (unchanged) |
| `/api/cron/ingest?which=telegram` | `10 * * * *` | hourly :10 | YES → `1 * * * *` |
| `/api/cron/ingest?which=x` | `20 * * * *` | hourly :20 | YES → `2 * * * *` |
| `/api/cron/ingest?which=mtproto` | `35 * * * *` | hourly :35 | YES → `3 * * * *` |
| `/api/cron/map` | `40 * * * *` | hourly :40 | no (unchanged) |
| `/api/cron/digest?mode=finalize` | `0 2 * * *` | daily | no |
| `/api/cron/digest?mode=intraday&slot=kyiv-morning` | `0 4 * * *` | daily | no |
| `/api/cron/digest?mode=intraday&slot=eu-midday` | `0 10 * * *` | daily | no |
| `/api/cron/digest?mode=intraday&slot=us-afternoon` | `30 19 * * *` | daily | no |
| `/api/cron/validate` | `0 7 * * *` | daily | no |
| `/api/cron/enrich` | `0 8 * * *` | daily | no |
| `/api/cron/datadark` | `0 9 * * *` | daily | no |
| `/api/cron/trade` | `0 10 2 * *` | monthly | no |
| `/api/cron/materials` | `0 11 3 * *` | monthly | no |

All Vercel cron schedules evaluate in UTC. Minute-granularity hourly schedules
are production-proven on this project/plan already (the `*/15` fast cron fires
96×/day; the `:10/:20/:35/:40` hourly entries all fire on their minute — see
`cron_runs` history referenced in `docs/reviews/PIPELINE-AUDIT-2026-07.md` §8),
so `1/2/3 * * * *` are plan-compatible standard five-field expressions.

## 2. Affected route behavior (verified in code)

- All three moved schedules hit the SAME route, `src/app/api/cron/ingest/route.ts`,
  differing only in `?which=`. The route authenticates
  `Authorization: Bearer ${CRON_SECRET}` (fails closed when the env is unset),
  writes a `cron_runs` row at START via `withCronRun(cronJobName("ingest", which))`
  (AGENTS.md ruling 10 intact — `finished_at IS NULL` remains the timeout
  signal), and has `maxDuration = 300`.
- Adapter selection is purely `which`-keyed (`src/lib/ingest/run.ts`,
  `buildIngestAdapters`): telegram = web-preview roster, x = registry X accounts,
  mtproto = ROCA-top-120 roster. Nothing in adapter construction or fetch reads
  the wall clock's minute; theater/source selection is roster- and
  watermark-driven and is therefore UNCHANGED by a start-minute move.
- Duplicate deliveries / overlapping invocations:
  - every insert is content-hash deduped (`ON CONFLICT (content_hash) DO NOTHING`,
    `src/lib/ingest/run.ts:221`), so a duplicate or overlapping run cannot
    double-insert;
  - X is single-writer via the DB lease `x_api_lease` (TTL 120s,
    `src/lib/usage/x-lease.ts`) and cursor-based with a deliberate 30-minute
    watermark overlap (`overlapSec = 1800`, `src/lib/adapters/x-api.ts`);
    watermark advancement is insert-gated (`commitMarks()` after `insertDocs`);
  - MTProto is high-water-mark incremental with a 240s wall-clock budget
    (`TG_MTPROTO_TIME_BUDGET_MS`, under the route's 300s) and insert-gated marks;
  - telegram-web is a stateless preview scrape whose inserts are hash-deduped;
  - the ingest route itself has NO cross-invocation lock — the schedule's minute
    separation is the only thing keeping two ingest groups out of the same
    serverless window today. Candidate B deliberately narrows that separation
    (see §6).
- Map stays downstream at `:40` and is NOT moved. Its route comment
  ("never shares a schedule slot with the digest crons") remains true.
- Digest, validate, enrich, datadark, trade, materials schedules are untouched.
- No test anywhere asserts the `:10/:20/:35` minute positions. The only
  structural coupling to `vercel.json` is the digest group
  (`src/app/page.tsx` + `src/lib/cron/next-fire.ts`/`.test.ts` parse ONLY
  `/api/cron/digest` entries; `src/lib/time/digest-status.ts` pins the digest
  cadence) — all outside this change. `scripts/audit-cron.ts` groups by hour/job
  with no minute assumption.
- Non-schedule references to the old minutes exist ONLY as prose: code comments
  (`src/lib/usage/x-lease.ts:2`, `src/lib/adapters/x-gap-backfill.ts:14`,
  `scripts/x-gap-backfill.ts:12` say ":20 scheduled poll") and live-state docs
  (`docs/CURRENT-STATE.md:353-356` and `:59`, AGENTS.md "Quality/ops" crons
  line). These describe DEPLOYED production and therefore stay untouched on this
  branch (the branch is not deployed); they are listed in the Phase 1 report as
  the exact deploy-time doc corrections. Historical/append-only docs
  (`docs/DECISIONS.md`, `docs/PROGRESS.md`, dated reviews) keep their minutes as
  history, per the AGENTS.md maintenance rule.

## 3. Workload-duration evidence still available (all from repo records)

| Job | Duration evidence | Source |
|---|---|---|
| ingest:telegram | 126s measured — "the slowest cron" | docs/PROGRESS.md:635,645 (cron_runs id 8) |
| ingest:x | ~1–2 min derived (inserts span :20–:22) | docs/reviews/PIPELINE-AUDIT-2026-07.md §10c |
| ingest:mtproto | ≤240s by construction (time budget) | src/lib/adapters/telegram-mtproto.ts |
| ingest:fast | unknown; short (RSS/GDELT/procurement) | PIPELINE-AUDIT §8 (wall-clock UNKNOWN) |
| map | avg 33s / max 102s over 38 runs | docs/OPEN-TASKS.md #36 (ANSWERED) |
| digest | ~64s core / ~138s gulf measured (older engine) | PIPELINE-AUDIT §8 |
| validate | ~40–60s derived | PIPELINE-AUDIT §8 |

## 4. Live infrastructure facts (verified READ-ONLY during this run, 2026-08-17 ~01:30Z)

Via the Neon API (GET only, `.env.local` credentials):

- The project's read-write endpoints are FIXED at 1 CU: `autoscaling_limit_min_cu = 1`,
  `autoscaling_limit_max_cu = 1` — so active-compute cost is proportional to
  active MINUTES, and no autoscaling headroom absorbs a concurrency spike.
- `suspend_timeout_seconds = 0` on both endpoints = Neon's DEFAULT autosuspend,
  which is 300 s (5 minutes) of idle before scale-to-zero. The operator
  analysis's "five-minute scale-to-zero tail" assumption is therefore VERIFIED.
- Two endpoints exist: the production branch's (active) and one on the
  2026-07-21 backup branch (idle). Only the production endpoint is exercised by
  crons; the estimate below concerns it alone.

## 5. Candidate B — expected benefit (ESTIMATES, not guarantees)

No prior compute analysis exists in the repository or its git history (searched:
autosuspend / scale-to-zero / compute-unit / cron-cluster / Candidate / q30 —
zero hits). The following figures originate in the OPERATOR-PROVIDED analysis in
this run's brief; this Phase 0 re-derives them from the verified schedule,
measured durations (§3), and the verified 300s autosuspend (§4).

Reconstruction, one generic hour, assuming (a) DB-active time ≈ job wall-clock,
(b) suspension exactly 300 s after last activity, (c) NO non-cron traffic:

- Current schedule wake-windows: [:00–:07] (fast) + [:10–:27] (telegram :10 →
  ~:12, fast :15, x :20 → ~:22, +5 tail) + [:30–:51] (fast :30, mtproto :35 →
  ~:37..:39, map :40 → ~:41, fast :45, +5 tail) ≈ **45–46 active min/hour**.
  Matches the operator estimate (~46).
- Candidate B wake-windows: [:00–~:10] (fast + telegram :01 → ~:03, x :02 →
  ~:04, mtproto :03 → ~:05..:07, +5 tail) + [:15–:21] + [:30–:36] + [:40–:46]
  (map) merging with [:45–:51] (fast) → [:40–:51] ≈ **34–38 active min/hour**
  (upper end when telegram runs long ~126s+ or mtproto uses its full budget).
  Consistent with the operator estimate (37–38).
- Estimated improvement: **~17–19% of active compute** — an ESTIMATE. It has
  NOT been production-measured; the Phase 1 observation plan measures it.
- Candidate B intentionally leaves ~2 min/hour of theoretical savings on the
  table versus stacking all three at :00, to avoid maximal same-second
  concurrency (see §6).

Estimate limitations (all reduce realized savings; none reverse the direction):

1. **Non-cron traffic is excluded.** Any page view, API call, magic-link
   sign-in, or background query wakes the endpoint and extends/creates active
   windows the schedule math does not see. The product is an invite-only beta
   (operator-held accounts), so cron traffic plausibly dominates today, but the
   realized percentage will shrink as real usage grows. The 17–19% figure is a
   ceiling under cron-dominated load, not a guarantee.
2. **Long invocations still overlap.** telegram at 126s+ measured (and its
   maxDuration allows 300s) runs past the :02/:03 starts; mtproto may use its
   full 240s budget. The cluster window is bounded below by the slowest member,
   not by the sum — that is the point of clustering — but a pathological run
   (e.g. a 300s telegram scrape) stretches the :00 window accordingly.
3. **Fixed 1 CU (verified)** means savings scale linearly with active minutes —
   no autoscaling interactions — but also means the estimate cannot be improved
   by CU resizing within this change (a later, separately-approved phase).
4. Neon bills active endpoint time at second granularity, but the 300s
   autosuspend tail dominates short jobs: each isolated wake costs
   ~(job + 300s). The estimate assumes the default tail stays at 300s.

## 6. Peak-concurrency risks (disclosed)

- **:00-family collisions already exist and are unchanged**: fast ingest fires
  at :00 every hour; digests fire at 02:00/04:00/10:00 UTC, validate 07:00,
  enrich 08:00, datadark 09:00, and the 19:30 digest coincides with fast :30.
  Candidate B ADDS telegram/x/mtproto at :01/:02/:03 — so at 02/04/10 UTC the
  cluster window can hold up to 5 concurrent invocations (digest + fast +
  telegram + x + mtproto, staggered by 1-minute starts) instead of today's ≤2.
  Worst hour of the month (first adversarial review, finding 4): on the 2nd at
  10:00 UTC the monthly trade cron (`0 10 2 * *`) joins that same window — up
  to 6 concurrent invocations; materials (`0 11 3 * *`, 3rd at 11:00 UTC)
  falls outside any digest hour, so like the validate/enrich/datadark hours it
  reaches at most 5 concurrent. Digest, map, and materials allow the longest
  runtimes (`maxDuration = 800`), so a slow digest can span the whole :00–:03
  cluster window. Each job runs in its own serverless instance; the shared
  resource is the Neon endpoint (fixed 1 CU) and its connection pool.
- **Neon pooler pressure**: OPEN-TASKS #77 records that the map worker's session
  advisory lock can strand on pgbouncer when connections are shuffled — a
  failure mode correlated with connection pressure. Map at :40 is OUTSIDE the
  new cluster, so this change does not put the advisory-lock path inside the
  crowded minute, but higher concurrent connection counts at :00–:03 marginally
  raise pool-shuffling generally. Observation item in Phase 1.
- **Ingest groups run concurrently by design now**: telegram (started :01) will
  still be running when x (:02) and mtproto (:03) start. They touch disjoint
  adapters, share only `insertDocs` (hash-deduped inserts) and `sources` upserts
  (ON CONFLICT), and X keeps its own lease — no shared lock exists to contend.
  The known cross-group hazard is DB write contention on `raw_documents`, which
  is INSERT ... ON CONFLICT DO NOTHING — safe, at worst slower.
- Vercel duplicate deliveries/retries: unchanged by this edit; every group is
  idempotent (hash dedupe + watermarks), and duplicate invocation of the same
  group is already possible today under retries.

## 7. Rollback approach

Exact and trivial: restore the three schedule strings to `10 * * * *`,
`20 * * * *`, `35 * * * *` in `vercel.json` and redeploy. No state, no
migration, no env var, no code path depends on the new minutes.

## 8. Phase-0 verdict

**PASS.** The repository supports the proposed schedule-only change:

- the three targets are confirmed present at :10/:20/:35 with the expected paths
  and query strings;
- no code or test semantically depends on those minute positions;
- all three groups are idempotent under overlap/duplicate delivery;
- theater/source selection is start-time-independent;
- map stays downstream at :40; digest/validation/enrich/datadark/trade/materials
  are untouched;
- the 1-CU + 300s-autosuspend assumptions behind the savings estimate are
  verified against live Neon config (read-only);
- the expected benefit (~17–19% active-compute reduction) is plausible under the
  stated assumptions and is explicitly an ESTIMATE pending the Phase 1
  post-deployment observation window.
