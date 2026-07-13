# Coding-agent prompt — X historical gap recovery + bounded digest rescore

Work in `/home/go/code/bnow.net`. Read `AGENTS.md` completely before changing anything and obey
all standing rulings, especially traceability, fail-closed spend guards, map-version filtering,
K=5 reduce synthesis, digest overwrite protection, additive migrations, and documentation
maintenance. Preserve unrelated working-tree changes.

## Sequencing gate

Do not begin this implementation or any paid recovery until the private-beta readiness sprint in
`docs/prompts/2026-07-13-private-beta-readiness.md` is complete and deployed. In particular:

- Workstream B's deterministic digest-publication guard must be live before historical digests are
  regenerated.
- Workstream E's canonicalization code must be complete before the recovery creates/regenerates
  entity edges.
- OpenSanctions work is last. Do not run its fixed-cutoff rescore until this X recovery, mapping,
  digest regeneration, validation, and resulting entity baseline are complete.

## Objective

Make X/twitterapi.io ingestion watermark-safe, recover the unproven July 9–13 historical interval
with an exact cursor-complete and resumable query, then map the recovered evidence, regenerate the
affected RU/UA/IR digests through the deployed publication guard, and revalidate them against ISW.
Preserve before/after evidence and bound every paid stage.

Do not run paid calls, mutate production, change Vercel env values, deploy, or regenerate digests
during implementation. Implement and test first; return an operator runbook for separate approval.

## Verified production evidence

- `x_api` stopped during the 2026-07-09 20:20Z poll when the internal cumulative ledger reached
  approximately `$5.0001`.
- The last saved pre-freeze watermark was `2026-07-09T19:20:16Z`.
- The 20:20 run fetched 359 and inserted 215 but did not advance that watermark; it was incomplete.
- Even the prior run is not an auditable completeness boundary: the current five-page batch loop
  can exhaust its page limit with `has_next_page=true` while leaving `complete=true`.
- Caps were raised on 2026-07-13 and a manual restart poll fetched+inserted 1,889 documents.
- The next scheduled 14:20Z poll fetched 222, inserted 42, and advanced the live watermark to
  `2026-07-13T14:20:09Z`. Current steady-state polling is live.
- The restart traversed the stale window using the old page-limited implementation. It does not
  prove historical completeness and may have skipped older cursor pages.
- The provider balance was reported as 3.41M credits immediately after subscription, but it will
  change while steady-state polling continues. Re-read the dashboard balance and
  `provider_usage.x_api` immediately before any paid recovery. Never rely on this historical value.
- Production currently has `X_SPRINT_USD_CAP=75` and `X_DAILY_USD_CAP=2.50`. Those configured caps
  are not proof of funded provider balance and must not be treated as spending authorization.

The conservative fixed recovery range is the complete UTC interval:

```text
from 2026-07-09T00:00:00Z
to   2026-07-14T00:00:00Z
```

Already-ingested documents will deduplicate in Postgres but returned tweets are still billed. The
operator-side planning ceiling is 1M credits / `$10`; the eventual command must require an explicit
budget no larger than the separately approved amount.

## Relevant files

- `src/lib/adapters/x-api.ts`
- `src/lib/adapters/x-api.test.ts`
- `src/lib/adapters/types.ts`
- `src/lib/ingest/run.ts`
- `src/app/api/cron/ingest/route.ts`
- `src/lib/usage/spend-guard.ts`
- `src/lib/usage/cron-run.ts`
- `scripts/x-backfill.ts`
- `scripts/map-backfill.ts`
- `scripts/digest.ts`
- `scripts/validate.ts`
- `src/app/api/cron/map/route.ts`
- `src/app/api/cron/digest/route.ts`
- `src/app/api/cron/validate/route.ts`
- `src/lib/analysis/tracks.ts`
- `src/lib/analysis/digest-persist.ts`
- `src/lib/validation/run.ts`
- `src/db/schema.ts` (`provider_usage`, `provider_state`, `cron_runs`)
- `docs/OPEN-TASKS.md`
- `docs/PROGRESS.md`
- `AGENTS.md`

No schema migration should be necessary. Never edit an applied migration or
`drizzle/9999_claim_source_trigger.sql`.

## Required implementation

### 1. Make steady-state X watermarks insert-gated and truncation-safe

Refactor `XApiAdapter` so `fetchLatest()` never writes `x_api.lastPollAt` directly.

- A globally complete pass may prepare a pending watermark on the adapter.
- Implement `commitMarks()` so `runIngest()` persists that watermark only after `insertDocs()`
  succeeds. The existing runner already supports a post-insert mark commit.
- HTTP/timeout/parser errors, a SpendGuard refusal, or any batch that reaches
  `maxPagesPerBatch` while another cursor exists must make the pass incomplete.
- Partial documents may still be returned and inserted idempotently, but an incomplete pass must
  not prepare or commit a watermark.
- Expose numeric `runStats` through `cron_runs.counts.x_api`, including at least `requests`,
  `units`, `budgetStops`, `pageTruncations`, `lockSkips`, and `incomplete`.
- Preserve the existing steady-state page ceiling; make reaching it safe and visible rather than
  silently lossy.

Add focused tests proving insert failure, budget stop, request failure, parser failure, and a final
page with another cursor cannot advance the watermark. Prove a genuinely exhausted pass commits
only after insertion.

### 2. Serialize X paid work

Steady-state polling is live while the later historical recovery runs. Prevent concurrent X jobs
from loading stale SpendGuard snapshots and overshooting a cap.

- Add a narrow X-provider lease using existing Postgres state; no migration is expected.
- Both scheduled `XApiAdapter.fetchLatest()` and the recovery driver must acquire it before any
  paid call.
- The lease needs a unique owner, bounded expiry for crash recovery, refresh during long recovery,
  and owner-checked release in `finally`.
- A scheduled poll that finds the recovery lease held makes zero paid calls, records
  `lockSkips=1`, and leaves the live watermark unchanged.
- Never log secrets or authorization headers.
- Keep this X-specific; do not change concurrency semantics for unrelated providers.

Test acquisition, competing owner refusal, renewal, owner-only release, and expired-lease takeover.

### 3. Add an exact, cursor-complete recovery driver

Create `scripts/x-gap-backfill.ts`. It must default to a non-spending plan/validation mode; no API
request or database write without `--apply`.

Required arguments:

- `--from <ISO timestamp>`
- `--to <ISO timestamp>`
- `--budget-usd <positive number>`

Useful options may include `--apply`, `--batch-size` (default/max 20), `--spacing-ms` (at least
250ms for Starter's 5 QPS), and `--checkpoint-key`.

Behavior:

1. Load the same ranked account roster as production through `registryXAccounts()` and hash the
   roster into the checkpoint identity.
2. Query `/twitter/tweet/advanced_search` with exact `since_time` and `until_time`, `queryType=Latest`,
   and at most 20 `from:` accounts per batch.
3. Follow every cursor until `has_next_page=false`; recovery mode has no fixed page ceiling.
4. Pass every request through the existing `SpendGuard` and an additional command-scoped recovery
   budget. Record actual requests, returned units, credits, and estimated USD immediately.
5. Insert each successfully parsed page through `insertDocs()` before checkpointing beyond it.
6. Store a separate deterministic `provider_state` checkpoint containing range, roster hash, batch,
   next cursor, completed batches, counts, spend, and completion state. Never use the live `x_api`
   row as the recovery checkpoint.
7. Refuse resume if range/roster differ. A completed rerun is idempotent and makes no paid calls.
8. On budget stop, HTTP error, timeout, malformed payload, insert failure, or interruption: exit
   nonzero, preserve the last safe checkpoint, print an exact resume command, and release/expire
   the provider lease safely.
9. Because steady-state polling is already live and its watermark is newer, historical recovery
   must **not** move, replace, or reset `provider_state.provider='x_api'`. Verify it is unchanged
   except for legitimate scheduled polls outside the held lease.
10. Print human and machine-readable totals: accounts, batches, pages, returned, attributed,
    inserted, duplicates, unattributed results, requests, credits, USD, checkpoint, and status.

Tests must cover multi-page exhaustion, multiple batches, resume from cursor, insert-before-
checkpoint, budget stop, request/parser failure, duplicates, unknown authors, roster mismatch,
completed idempotency, lease contention, and live-watermark preservation.

### 4. Add a bounded map/regenerate/revalidate operator

Create `scripts/x-gap-rescore.ts` or cleanly extend/compose the existing scripts. Default behavior
must be read-only and require `--apply` for mutations or paid calls.

- Require `--from-date`, `--to-date`, `--budget-map-usd`, and `--budget-reduce-usd`.
- Refuse apply unless the matching X recovery checkpoint is globally complete.
- Refuse apply unless the operator explicitly acknowledges that private-beta Workstreams B and E
  are deployed. Never attempt to implement those workstreams here.
- Snapshot before-state under gitignored `data/outbox/`: provider usage, X documents by day/theater,
  live watermark/checkpoint, digest IDs/providers/timestamps/claim counts, and validation metrics.
- Extend `scripts/map-backfill.ts` with an optional bounded `--to`; preserve its dry-run-first
  estimate and oldest-first draining behavior.
- Drain the current map extractor version for the affected range without bypassing
  `mapExtractorVersion()`.
- Regenerate only the configured `TRACKS` matrix: RU military+elite politics, UA military, IR
  military+elite politics+nuclear. Use explicit day windows, the deployed mapreduce engine, K=5,
  and the shared persist path.
- Do not set `FORCE_REGEN=1` automatically. Report empty/thin overwrite refusals for operator review.
- Validate military digests only: RU/UA vs ROCA and IR vs Iran Update. Discover available ISW dates;
  a missing July 13 reference is pending, not a false success or fatal corruption.
- Do not send digest email.
- Write `before.json`, `after.json`, and a Markdown result with document/map/digest/validation deltas,
  actual spend, cron run IDs, refusals, pending references, and residual risks.

### 5. Documentation and standing state

After implementation only, document the code and dry-run commands without claiming production
recovery. Close/update OPEN-TASKS #38 and correct AGENTS standing text only after an authorized
production run proves cursor exhaustion, map completion, digest regeneration, validation, and two
healthy subsequent scheduled polls. Append decision-log history; do not rewrite historical reviews.

## Verification

Run without paid external calls:

- focused unit tests during development;
- `npm test`;
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- relevant disposable-Neon integration tests if DB selection/lease behavior warrants them.

Tests must not contact twitterapi.io, mutate production, or require real secrets.

## Production runbook requirements for the handoff

Return exact commands, but mark every paid/mutating command **DO NOT RUN WITHOUT OPERATOR APPROVAL**.
Immediately before the eventual run, the operator must:

1. re-read twitterapi.io credit balance;
2. query current `provider_usage.x_api` daily/all-time totals;
3. confirm the explicit recovery allowance fits both provider balance and BNOW caps;
4. avoid concurrent paid Ask/OpenSanctions evaluations and provider maintenance;
5. record the fixed range and checkpoint key;
6. run recovery to cursor exhaustion;
7. verify the live watermark was not moved backward;
8. map, regenerate, and validate serially;
9. verify two later scheduled polls and reconcile dashboard credits to the ledger.

Do not hardcode a future command's cap from the historical `$75` configuration. The command-scoped
budget and current funded balance are the governing authorization.

## Deliverable

Return files changed, tests, dry-run output, exact guarded rollout commands, maximum spend by stage,
rollback/resume instructions, unresolved risks, and explicit confirmation that implementation made
no paid calls, production mutations, deployments, or environment changes.
