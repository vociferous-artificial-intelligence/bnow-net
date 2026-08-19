# Neon compute reduction — Phase 1 (Candidate B cron clustering) — 2026-08-16/17

Schedule-only change staggering the three hourly ingestion crons across
:01–:03 so their database wake-ups cluster with the :00 fast-ingest fire
instead of spreading across the hour. Implementation branch only — **this
branch has not been deployed; savings have not been production-proven.**

- Base SHA: `26989f75b8e27442a2fcc44265e7f2907b6c53d4` (= `origin/main`; also
  the commit Vercel metadata records for the live production deployment
  `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC`, whose serving of bnow.net was verified
  read-only during this run)
- Implementation commit: `4a8da51` (`cron: stagger hourly ingestion starts
  across :01-:03 (Candidate B)`)
- Final SHA: the commit adding this report and the review-1 remediation — the
  branch tip of `codex/neon-cron-cluster-phase1-20260816` (exactly two commits
  on top of base)
- Phase 0 (system confirmation, verified assumptions, PASS verdict):
  `docs/reviews/NEON-COMPUTE-REDUCTION-PHASE-0-2026-08-16.md`

## 1. Complete before/after schedule table (vercel.json)

| Path | Before | After | Changed |
|---|---|---|---|
| `/api/cron/ingest?which=fast` | `*/15 * * * *` | `*/15 * * * *` | no |
| `/api/cron/ingest?which=telegram` | `10 * * * *` | **`1 * * * *`** | YES |
| `/api/cron/ingest?which=x` | `20 * * * *` | **`2 * * * *`** | YES |
| `/api/cron/ingest?which=mtproto` | `35 * * * *` | **`3 * * * *`** | YES |
| `/api/cron/map` | `40 * * * *` | `40 * * * *` | no |
| `/api/cron/digest?mode=finalize` | `0 2 * * *` | `0 2 * * *` | no |
| `/api/cron/digest?mode=intraday&slot=kyiv-morning` | `0 4 * * *` | `0 4 * * *` | no |
| `/api/cron/digest?mode=intraday&slot=eu-midday` | `0 10 * * *` | `0 10 * * *` | no |
| `/api/cron/digest?mode=intraday&slot=us-afternoon` | `30 19 * * *` | `30 19 * * *` | no |
| `/api/cron/validate` | `0 7 * * *` | `0 7 * * *` | no |
| `/api/cron/enrich` | `0 8 * * *` | `0 8 * * *` | no |
| `/api/cron/datadark` | `0 9 * * *` | `0 9 * * *` | no |
| `/api/cron/trade` | `0 10 2 * *` | `0 10 2 * *` | no |
| `/api/cron/materials` | `0 11 3 * *` | `0 11 3 * *` | no |

Machine-verified during the run: both files parse as JSON with the single
top-level `crons` key; 14 entries before and after; every entry holds exactly
`path` + `schedule`; every path/query string byte-identical; exactly THREE
schedule strings differ; all expressions are standard five-field cron with a
plain minute field. Production-code diff = these three strings and nothing
else (the only other committed files are this report, the Phase-0 report, and
a `docs/PROGRESS.md` plan entry).

## 2. Why Candidate B (:01/:02/:03) and not simultaneous :00 starts

Stacking telegram + x + mtproto at exactly :00 alongside fast ingest (and, at
02/04/10 UTC, a digest) maximizes same-second cold-start concurrency against a
FIXED 1-CU Neon endpoint (verified read-only: `autoscaling_limit_min_cu =
max_cu = 1`) with no autoscaling headroom, and puts every ingest group's
connection burst into one instant. The 1-minute stagger keeps the wake-ups
inside one autosuspend window (that is the whole saving) while spreading the
process cold starts and connection ramps — at the cost of roughly two
minutes/hour of theoretical additional savings, deliberately sacrificed.

## 3. Expected benefit — an ESTIMATE, not a measurement

Estimated **~17–19% reduction in Neon active compute** (operator-provided
analysis, re-derived in Phase 0 §5 from the verified schedule, measured job
durations, and the verified 300s default autosuspend: current ≈45–46 active
min/hour → Candidate B ≈34–38). The first adversarial review independently
re-derived the arithmetic and found the quoted range uses the pessimistic end
of its own window. HARD caveats (Phase 0 §5): the model excludes non-cron
traffic (any page view or query wakes the endpoint — the figure is a ceiling
under cron-dominated load), assumes the 300s autosuspend default stays, and
assumes DB-active ≈ job wall-clock. **No savings number in this branch is
measured; measurement happens only in the post-deployment observation window
(§7).**

## 4. Freshness and overlap implications

- Cadence of all three jobs stays hourly; only the minute moves. Nothing in
  code or tests reads the minute (verified: `next-fire.ts` + homepage parse
  ONLY the digest group; `audit-cron.ts` groups by hour; zero test asserts
  :10/:20/:35).
- One-time transition effect at deploy: the new minutes are earlier in the
  hour, so each job's next fire arrives ≤ ~58 minutes after its last old-slot
  fire (reviewer-bounded worst one-time gap ~42–51 min) — within the 3h
  X-staleness banner and 4h park threshold margins; the X watermark (30-min
  overlap, insert-gated) makes data loss impossible regardless.
- New overlap: telegram (126s measured, maxDuration 300s) is still running
  when x (:02) and mtproto (:03) start. Disjoint adapters; shared surfaces are
  concurrency-safe (`raw_documents` hash-dedupe insert, `sources` upsert, X
  paid work single-writer via DB lease, MTProto 240s budget + insert-gated
  marks). Worst case is slower runs, not corruption.
- Crowded-minute concurrency: up to 5 concurrent invocations at 02/04/10 UTC
  (digest + fast + the three staggered ingests); up to 6 on the 2nd of the
  month at 10:00 UTC when the monthly trade cron joins (review-1 finding,
  disclosed in Phase 0 §6). All are separate serverless instances contending
  only on the 1-CU endpoint and its pooler.

## 5. Quality gates — exact commands and actual results

All run in the worktree `/Users/go/code/bnow-net-worktrees/neon-cron-cluster-20260816`
(branch `codex/neon-cron-cluster-phase1-20260816`), Node v24.14.0 / npm 11.9.0:

| Command | Result |
|---|---|
| JSON parse + before/after cron enumeration (node script vs `git show 26989f7:vercel.json`) | PASS — exactly 3 schedule strings changed; paths byte-identical; 5-field valid |
| `git diff --check` | clean |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **2,123 passed / 2,123 (166 files)** |
| `npm run build` | see below — PASS with a documented env condition |
| `npm run test:integration` (disposable Neon fork; `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`X_API_KEY`/`OPENSANCTIONS_API_KEY`/`POSTMARK_SERVER_TOKEN`/`TELEGRAM_*` blanked; `LLM_DISABLE=1`) | **106 passed / 1 failed / 107 (17 files)** — the single failure is PRE-EXISTING on main, see below |

**Build env condition (pre-existing, not caused by this change):** a fresh
worktree has no `.env.local`, and `next build`'s page-data collection for
`/sitemap.xml` imports `@/db`, which throws when `DATABASE_URL` is unset. This
failure reproduces byte-for-byte on the UNMODIFIED base tree (proven by
stashing the change and rebuilding). With a syntactically valid dummy
`DATABASE_URL` (`postgresql://build:build@localhost:5432/build`, never
contacted — the build completed with zero connection attempts/errors) the
Candidate B tree builds green: exit 0, all routes emitted.

**Pre-existing integration failure (recorded verbatim):** command
`npm run test:integration -- src/integration/ask-events.itest.ts` (same env as
above) fails `AssertionError: expected 0 to be greater than 0` at
`src/integration/ask-events.itest.ts:100` (`snap!.candidates.length`) — the
Ask evidence snapshot draws zero candidates from the forked production
corpus. Reproduced identically THREE ways: full suite on this branch,
single-file on this branch, and single-file on UNMODIFIED `main` at
`26989f7` from the root clone. The branch touches no code at all (vercel.json
+ docs), and the failing suite is Ask transport — unrelated. It does not
undermine confidence in this change; the 30/30 `authz-page-gate` suite and all
other 106 tests pass. Flagged for the operator as a probable
production-data-drift or recent-corpus regression worth its own look.

## 6. Adversarial reviews and remediation

**Review 1** (isolated read-only agent, fresh context, against commit
`4a8da51`): **VERDICT: PASS.** Findings: (MINOR) Phase-0 §6's worst-hour
concurrency set omitted the monthly trade cron — **remediated**: §6 now
records the up-to-6-invocation window on the 2nd at 10:00 UTC, the materials
cron's placement, and the 800s digest/map `maxDuration`. (MINOR) The tree's
AGENTS.md/CURRENT-STATE production-deployment snapshot is stale — verified
PRE-EXISTING on `main` (the separate `codex/reconcile-live-state-20260816`
branch already corrects it); this branch deliberately touches no standing
live-state doc, so **adjudicated out of scope, no tree change**. All ten other
review dimensions returned no finding, including: exactly-three-strings diff
scope, cron syntax/UTC/plan compatibility, overlap/idempotency safety,
freshness/cursor margins, independently re-derived savings arithmetic,
disclosure honesty, exact rollback, no smuggled production action, commit
hygiene, and Phase-0 factual accuracy.

**Review 2** (second isolated read-only agent, fresh context, on the
corrected tree): **VERDICT: PASS.** Both review-1 findings verified RESOLVED
against the tree (remediated §6 facts re-checked file-by-file including the
6-way arithmetic; the branch confirmed to touch exactly three files, leaving
AGENTS.md/CURRENT-STATE for deploy time as §2 explains). Its independent pass
confirmed: exactly-three-strings diff scope with `git diff --check` clean; no
code or test depends on the old minutes (greps + `next-fire.ts` hour-numeric
regex + digest-only homepage filter re-verified); overlap/idempotency safety
in code (hash-dedupe insert, X lease/watermark, MTProto budget); estimates
labelled everywhere; no deploy/CI action or secret. It also observed a side
benefit: mtproto at :35 + its 240s budget could previously brush map's :40
start — at :03 it cannot. Three editorial NOTEs were folded into the docs
(materials also has `maxDuration = 800` and its hour, like validate/enrich/
datadark, peaks at 5 concurrent; one line-number citation corrected to
`x-gap-backfill.ts:14`). One NOTE is expected by construction: the
network-forbidden reviewer could not re-verify the live production
`data-dpl-id` claim, which this run verified directly.

## 7. Post-deployment observation plan (48–72 h; deployment NOT part of this branch)

Deploying this branch is a separate, operator-approved action. After it, watch
for 48–72 hours:

1. **Neon active-compute hours** (console/API, project `crimson-wave-84127605`,
   production endpoint `ep-jolly-glitter-at0968cv`): daily active hours vs the
   pre-deploy baseline; the estimate predicts roughly 45→35 active min/hour
   under cron-dominated load.
2. **Autosuspend/idle behavior**: endpoint suspend/resume cycle count and the
   long idle gaps (:04–:15, :21–:30, :46–:00 windows should now be quiet).
3. **Cron start/finish/failure durations**: `cron_runs` per job — start minute
   matches the new schedule; wall-clock durations comparable to baseline
   (telegram ~126s, x ~1–2 min, mtproto ≤240s); no new `ok=false`.
4. **Unfinished cron_runs**: rows with `finished_at IS NULL` older than their
   route's `maxDuration` (the ruling-10 timeout signal) — expect none beyond
   the historical baseline.
5. **Ingestion yield by adapter**: `raw_documents` inserted per hour per
   adapter (telegram web, x_api, mtproto, rss/gdelt) — hourly volumes should
   be unchanged (cadence identical, only the minute moved).
6. **Provider checkpoint progression**: X watermark (`provider_state x_api`)
   advancing hourly; no long-park alert; MTProto `telegram_channel_state`
   marks advancing; `lockSkips` / lease refusals not elevated.
7. **Map backlog age**: `map_health` freshness per theater unchanged (map at
   :40 untouched; ru/ua backlog drain continues at its own pace).
8. **Digest freshness**: digest crons unaffected — confirm 02/04/10/19:30
   runs and the homepage "Next update" panel behave identically.
9. **Database errors and connection pressure**: Postgres/pgbouncer errors in
   the :00–:03 window (connection refusals, advisory-lock `skipped` runs on
   the map cron per OPEN-TASKS #77's signature, statement timeouts) — the
   clustered minute is where new pressure would show first.

Also at deploy time (docs describe LIVE state, so they change with the deploy,
not with this branch): update `docs/CURRENT-STATE.md:353-356` and `:59`,
AGENTS.md's "Crons:" ops line, and the stale-prose comments
`src/lib/usage/x-lease.ts:2`, `src/lib/adapters/x-gap-backfill.ts:14`,
`scripts/x-gap-backfill.ts:12` (":20 scheduled poll" → ":02").

## 8. Rollback

Exact and trivial: restore the three schedule strings in `vercel.json` to
`10 * * * *`, `20 * * * *`, `35 * * * *` and redeploy. No state, migration,
env var, or code path depends on the new minutes.

## 9. Status

**This branch has not been deployed. Savings have not been production-proven.**
No environment variable, cron invocation, production write, migration, or paid
provider call occurred in this workstream. Deployment, the observation window
above, and any later q30/Neon-resizing phase each require separate approval.

Final status: **implementation-pass / deployment-and-observation-pending**

## 10. Deployment record (appended 2026-08-17 — post-review addendum; §§1–9 unchanged)

The separately approved deployment happened 2026-08-17. Everything above this
section is the pre-deployment review, preserved verbatim.

- Merge: PR #4 (head `ab8150d`, gate + integration green) merged to `main`
  2026-08-17T06:44:54Z as merge commit `9c5e9cb` (normal merge; reviewed commits
  preserved; branch retained). Merged diff re-verified: exactly the three
  schedule strings + three documentation files.
- Deploy: single CLI production deployment from the clean merged root clone
  (the Vercel project has no connected Git repository, so no auto-deploy
  exists): `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`, READY 06:47:53Z, build 44s,
  aliased bnow.net, Vercel git metadata `9c5e9cb`, `/health` stamps the commit
  (root-clone deploy — the OPEN-TASKS #78 worktree blank stamp did not recur).
  Deployed cron table verified entry-by-entry: telegram `1 * * * *`,
  x `2 * * * *`, mtproto `3 * * * *`; the other 11 entries byte-identical.
  No migration, no env change, no production DB write, no manual cron
  invocation, no paid provider call.
- First natural Candidate B cycle (07:00–07:05Z, plus the coincident daily
  validate) PASSED: fast 07:00:04/163.1s ok · validate 07:00:29/15.3s ok
  (normal `errors:1, validated:2` pattern, identical to 08-16) · telegram
  07:01:20→07:03:46/146.4s ok/114 inserted · x 07:02:07→07:02:50/43.4s ok/115
  inserted (lockSkips 0, budgetStops 0, requestFailures 0; lease released;
  watermark advanced) · mtproto 07:03:39→07:05:08/89.4s ok/295 inserted (40
  channel states advanced). The designed overlap (telegram still running at the
  x and mtproto starts) produced zero contention. One-time transition gaps:
  telegram 51 min / x 42 min / mtproto 28 min — inside §4's ~42–51 min
  reviewer bound (≤~58 min worst case). No 5xx, no auth failures, no duplicate
  storm; known noise only (procurement proxy-block, one quiet telegram-web
  preview, GramJS CastError #69). Map stayed at :40 and ran normally on the new
  artifact (07:40:42→07:43:43, 181.1s, ok, 377 claims); the pre-deploy 06:40
  map run completed cleanly across the deploy moment.
- Observation window (per §7): OPEN 2026-08-17T07:00:00Z, closing
  2026-08-19T07:00Z–2026-08-20T07:00Z. Neon anchor: cumulative
  `active_time_seconds` = 1,144,967 (~318.05h, 2026-08 billing period) read at
  06:45Z and unchanged at 07:48Z — the consumption API lags; the closing
  comparison must use settled values. **Savings remain an ESTIMATE (~17–19%)
  until the window closes.** PR #5 / model routing stays undeployed during the
  window.
- Rollback target `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC` (verified healthy
  pre-merge): NOT needed.

Final status: **deployed / first-cycle-pass / observation-window-open**

## 11. Observation-window closeout (appended 2026-08-19 — §§1–10 unchanged)

§10's `observation-window-open` status and its `~17–19%` estimate are
SUPERSEDED by this section. §§1–9 remain the pre-deployment review and §10 the
deployment/first-cycle record; both are preserved verbatim as historical
statements of what was known at the time.

**Verdict: PASS.** Candidate B remains deployed. No rollback. The gate closes
at 48 hours — no extension to 72 hours is required — and it is safe to proceed
to the routing-baseline release stage.

Exact window: **2026-08-17T07:00:00Z → 2026-08-19T07:00:00Z** (48h). The
deployment became READY at 2026-08-17T06:47:53Z; the formal window deliberately
opened at the following whole hour, so every measured hour ran the clustered
schedule end-to-end. Window close = 2026-08-19T07:00:00Z.

### 11.1 Compute (§7 item 1)

Hourly production-branch figures were read from Neon's **read-only**
branch-consumption endpoint, which does not wake the compute. The endpoint
reports `compute_unit_seconds`. The production endpoint is configured at
**exactly 1 CU**, so CU-seconds are treated here as active-compute seconds —
**that equivalence is an inference from the fixed 1-CU configuration, not
something Neon's API asserts.**

| Window | Compute | Active-compute | vs pre-deploy 24h |
|---|---:|---:|---:|
| Immediate pre-deploy 24h | 69,860 CU-s | 19.41 h | baseline |
| Post-deploy day 1 (24h) | 62,266 CU-s | 17.30 h | −10.9% |
| Post-deploy day 2 (24h) | 58,480 CU-s | 16.24 h | −16.3% |
| **Full post-deploy 48h** | **120,746 CU-s** | **33.54 h** | **−13.6%** |

The 48-hour line compares against **twice the immediate pre-deploy 24-hour
value (139,720 CU-s)** — no true 48-hours-before window was measured, so the
−13.6% is a doubled-24h comparison by construction, not a direct
48h-before/48h-after measurement.

Average active time fell from **48.51** to **41.93** minutes per wall-clock
hour: ≈**5.27 active-compute hours saved over 48 hours**, ≈**2.64 hours/day**.

**Practical result: a ~13–14% reduction — below the ~17–19% projected in §§1–9
and repeated in §10.** The projection's direction was right and the mechanism
held; its magnitude was optimistic. Report ~13–14% going forward.

### 11.2 Load counter-check (§7 item 5)

The saving is not an artifact of an unusually quiet ingestion period — core
ingest *rose*:

| Window | Documents inserted | vs pre-deploy 24h |
|---|---:|---:|
| Immediate pre-deploy 24h | 7,812 | baseline |
| Post-deploy day 1 | 9,623 | +23.2% |
| Post-deploy day 2 | 9,325 | +19.4% |
| **Full post-deploy 48h** | **18,948** | **+21.3%** vs doubled baseline |

Less compute while ingesting ~21% more documents is the intended scheduling
effect.

### 11.3 Operations (§7 items 3, 4, 6, 7, 8)

- **398/398 expected scheduled runs succeeded** in the exact window: fast
  ingest 192 · telegram 48 · x 48 · mtproto 48 · map 48 · digest finalize 2 ·
  digest intraday 6 · validate 2 · enrich 2 · datadark 2. Zero failed, zero
  killed, zero contention-skipped runs, and **zero new unfinished rows**.
- Five `finished_at IS NULL` rows remain in `cron_runs`, and **all five predate
  the deployment**: one telegram from 2026-07-28, three x from 2026-08-13, one
  telegram from 2026-08-15. These are pre-existing stale rows under the
  ruling-10 timeout signal, **not** Candidate B regressions.
- All 48 natural map cycles completed successfully at the unchanged :40 slot.
  Digest, validation, enrichment, and DataDark jobs completed normally, and
  production digests remained current. No stub data appeared anywhere.
- X: checkpoint healthy — no lock skips, no budget stops, no request failures.
- MTProto: current — 140 of 163 channels fetched since deployment, zero
  resolve errors.
- `map_health` still reports `stale_ir,stale_ru,stale_ua`. This is the
  **pre-existing ru/ua/ir backlog debt recorded at the deployment baseline**;
  it was **not resolved by this release**, and it is not a Candidate B
  regression or a contention event.

### 11.4 Errors and connection pressure (§7 item 9)

- Vercel recorded **zero production HTTP 5xx** responses in the window.
- The only error-level runtime records were the already-known, non-fatal GramJS
  peer-type `CastError` noise tracked as OPEN-TASKS #69. **No new error
  signature appeared.**
- No pgbouncer, connection-exhaustion, statement-timeout, advisory-lock, or
  `ECONNREFUSED` signature was found — the clustered :01–:03 minutes are where
  such pressure would have shown first.
- Database activity was normal: zero deadlocks, zero conflicts observed.
- `/health` reported **DB OK**, build **`9c5e9cb`**, deployment
  **`dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`**.

### 11.5 Release decision

Candidate B stays in production. The next stage is PR #5 (model-routing
baseline), which is reconciled against the `main` that results from merging
this closeout, fully retested, and then handled as its **own** separately
deployed 24-hour routing-equivalence soak with every candidate-model variable
unset.

**This closeout is documentation only. Merging it is not a deployment**: no
Vercel action, no environment-variable change, and no production write are part
of it, and production continues to run `9c5e9cb` on
`dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`.

### 11.6 What this closeout does NOT claim

Stated plainly so the verdict is not read as broader than the evidence:

- §7 item 2 (endpoint suspend/resume cycle counts and the specific quiet
  `:04–:15 / :21–:30 / :46–:00` idle gaps) was **not separately enumerated**.
  The drop from 48.51 to 41.93 active minutes per wall-clock hour is the
  observable consequence, and it is consistent with the predicted idle
  behavior, but the cycle-count check itself was not run.
- §7 item 3's per-job wall-clock **duration deltas were not tabulated** across
  the window. What is asserted is the disposition of every run: 398/398
  succeeded, none failed, none were killed, none skipped on contention, and no
  new unfinished row appeared. §10's first-cycle timings remain the only
  duration-level comparison on record.
- The `stale_ir,stale_ru,stale_ua` map backlog is **still open**. Nothing here
  claims it was resolved.
- The `~13–14%` figure is specific to this window's load and schedule; it is a
  measurement, not a guarantee about future months.

Final status: **deployed / observation-window-closed / PASS (measured ~13.6%)**
