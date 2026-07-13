# Coding-agent prompt — OpenSanctions monthly quota + resumable rescore

Work in `/home/go/code/bnow.net`. Read `AGENTS.md` completely before changing anything and obey all standing rulings, especially truth-in-UI, spend guards, additive migrations, documentation maintenance, and the pre-push verification gate. Preserve unrelated working-tree changes.

## Objective

Make OpenSanctions enrichment use the account's **2,000-request calendar-month quota** safely and make a full entity rescore deterministic, resumable, and bounded across multiple serverless invocations. Do not weaken the lifetime/sprint semantics used by X or other paid providers.

## Sequencing gate

This is the last of three coordinated workstreams. Do not implement or run it until:

1. `docs/prompts/2026-07-13-private-beta-readiness.md` is complete and deployed, including
   Workstream E entity canonicalization;
2. `docs/prompts/2026-07-13-x-gap-catchup-rescore.md` has completed its historical X recovery,
   mapping, digest regeneration, and validation; and
3. the post-X entity population is stable and any separately authorized deterministic entity
   merge is complete.

The eligible-entity and quota figures below are verified pre-X-recovery evidence, not hard-coded
completion criteria. Recount the fixed-cutoff population and current calendar-month usage before
the production rescore. Do not spend quota matching entity rows that are about to be merged.

Production limits are being configured separately as:

- `OPENSANCTIONS_CALL_CAP=2000`
- `OPENSANCTIONS_DAILY_CALL_CAP=200`
- `OPENSANCTIONS_RUN_CALL_CAP=120`
- `OPENSANCTIONS_DAILY_USD_CAP=40` (conservative ledger ceiling; the account allowance is request-based)

Current production evidence, verified after the 2026-07-13 cap deployment and one bounded
non-refresh gap-fill batch:

- Before restart, the OpenSanctions dashboard and `provider_usage` both showed exactly 300 `/match/default` calls: 200 on July 7, 91 on July 8, and 9 on July 9.
- There are currently 763 eligible entities (`person`, `company`, `org`, `agency`, `faction`),
  before the private-beta canonicalization and X historical regeneration work.
- The restart proof checked 120 previously unchecked entities: 92 matched, 22 sanctioned, zero failed, and no budget stop.
- 420 now have live OpenSanctions results; approximately 343 remain unchecked.
- Current aggregate results are 263 matched and 94 sanctioned.
- A complete fixed-cutoff rescore from this pre-X snapshot would consume 763 additional calls,
  bringing July usage from 420 to 1,183/2,000 and leaving 817 calls. Recalculate this projection
  after the preceding workstreams; entities added during the run must be accounted separately.
- The current guard sums all historical rows, so `OPENSANCTIONS_CALL_CAP` behaves as a lifetime cap and will not reset next month.
- The current `refresh=1` query removes the checked-state predicate entirely. Repeated bounded calls therefore select the same highest-priority rows instead of progressing through the corpus.

## Relevant files

- `src/lib/usage/spend-guard.ts`
- `src/lib/usage/spend-guard.test.ts`
- `src/lib/enrich/run.ts`
- `src/lib/enrich/opensanctions.ts`
- `src/app/api/cron/enrich/route.ts`
- `src/db/schema.ts` (`provider_usage` is one row per provider and UTC day)
- `src/lib/usage/cron-run.ts`
- `vercel.json`
- `scripts/sqlq.ts`
- `docs/OPEN-TASKS.md`
- `docs/PROGRESS.md`
- `AGENTS.md`

No schema migration should be necessary: the daily `provider_usage` rows already contain enough information for a calendar-month window. Never edit an applied migration.

## Required implementation

### 1. Add explicit total-cap accounting periods to SpendGuard

Extend `SpendGuardConfig` with an explicit total accounting period, using a narrow API such as `totalPeriod: "all_time" | "calendar_month"`. Preserve `"all_time"` as the default so every existing provider, especially `x_api`, retains byte-equivalent lifetime/sprint behavior unless it explicitly opts into monthly accounting.

For `calendar_month`, compute the first UTC date of the current month from the same clock/day used by the guard and load `totalUsd`/`totalRequests` only from `provider_usage.day >= monthStart`. Daily totals must remain limited to the current UTC day. Do not delete, rewrite, or zero historical usage rows at month boundaries.

Keep fail-closed behavior intact:

- A provider still requires either a valid total USD cap or total request cap.
- A missing/invalid required cap must refuse before any external call.
- Per-day and per-run caps still apply in addition to the monthly cap.
- X and existing LLM providers must not silently switch to monthly accounting.

It is acceptable to evolve `UsageStore.load` to receive a total-window start date (or equivalent), but keep the abstraction testable without Postgres. Avoid provider-name conditionals inside the generic guard.

Configure only OpenSanctions in `src/lib/enrich/run.ts` to use `calendar_month`; continue reading the quota value from `OPENSANCTIONS_CALL_CAP` for compatibility with the deployed environment.

### 2. Replace unsafe refresh semantics with a fixed-cutoff rescore

Make rescoring advance across repeated bounded calls. Use a fixed ISO timestamp supplied by the operator, for example:

`GET /api/cron/enrich?only=sanctions&refresh=1&before=2026-07-13T14:00:00.000Z&limit=200`

Required semantics:

- Normal mode remains unchanged: select never-checked or stub-only rows.
- Rescore mode selects eligible rows whose live `checkedAt` is strictly older than the fixed `before` cutoff, plus missing/stub-only rows.
- After a successful call, the persisted `checkedAt=nowIso` moves that entity beyond the cutoff, so the next invocation with the **same cutoff** advances to the next batch.
- Require and strictly validate `before` whenever `refresh=1`; return HTTP 400 before opening a paid enrichment loop if it is absent or invalid. Do not silently substitute the current time per invocation, because that recreates the repeat-selection bug.
- Preserve the existing compliance-value priority ordering among rows that remain eligible.
- Treat missing, empty, or malformed legacy `checkedAt` defensively as needing refresh; do not allow a JSON-to-timestamptz cast error to abort the batch.
- `only=sanctions` must ensure the unrelated ownership pass is not run during rescore.
- Keep `limit` bounded and validate it. A caller must not bypass `OPENSANCTIONS_RUN_CALL_CAP` or the route's serverless duration by passing an enormous limit.
- Do not make concurrent rescore requests. Document serial operation because the current guard snapshot is per invocation.

If a small operator script materially reduces mistakes, add an idempotent script that repeatedly calls the authenticated production endpoint serially with one fixed cutoff, prints each batch's counts, stops on `budgetStopped`, and never embeds or prints `CRON_SECRET`. It must not busy-loop across a daily cap. A runbook-only approach is acceptable if it is equally safe and unambiguous.

### 3. Improve observability

Ensure `cron_runs.counts.sanctions` makes progress auditable. Retain existing fields and, if useful, add non-sensitive fields such as the rescore cutoff and remaining-candidate count. Never store the API key, auth header, raw response bodies, or full OpenSanctions payloads in cron logs.

The endpoint must distinguish:

- successful calls/checks,
- provider/API failures,
- run-cap stop,
- daily-cap stop,
- monthly-cap stop,
- completed rescore (zero candidates remaining).

Do not turn a budget stop into an HTTP failure; preserve the existing resumable green-run behavior, but make the reason explicit in counts.

### 4. Documentation and standing-state maintenance

Update comments that currently call `OPENSANCTIONS_CALL_CAP` a lifetime/total cap to say it is a calendar-month request quota for OpenSanctions. Correct standing text in `AGENTS.md` in place, update/close `docs/OPEN-TASKS.md` item #41 only when the implementation and production verification are complete, append the decision log, and add a concise result entry to `docs/PROGRESS.md`. Do not rewrite the historical review `docs/reviews/STATE-2026-07-10.md`; it was accurate when written.

## Tests

Add focused unit tests proving:

1. all-time remains the default and still counts prior months;
2. calendar-month mode excludes prior-month usage;
3. calendar-month mode includes the first and last UTC day of the current month correctly;
4. the month boundary is UTC, independent of the machine's local timezone;
5. monthly request cap blocks exactly at 2,000 and allows at 1,999;
6. daily and run caps still win when lower;
7. missing cap still fails closed;
8. OpenSanctions opts into monthly mode while X remains all-time;
9. normal enrichment selects only missing/stub checks;
10. fixed-cutoff rescore selects stale/missing rows, excludes rows updated after the cutoff, and advances across two successive batches using the same cutoff;
11. missing/invalid `before` with `refresh=1` returns 400 and makes zero provider calls;
12. malformed legacy `checkedAt` cannot crash or skip the row;
13. stub results still cannot persist or render as factual sanctions data.

Use pure tests where possible. If SQL-selection behavior needs Postgres, add a focused Neon integration test following the repository's existing disposable-branch pattern; do not weaken or replace existing tests.

Run the full required verification:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- relevant integration tests if added or changed

## Production rollout and verification

Do not change production environment values unless explicitly authorized by the operator; they are being handled outside this coding task. After the patch is merged and deployed:

1. Verify the private-beta and X recovery checkpoints are complete.
2. Recount eligible entities and record the exact baseline population at the cutoff.
3. Query current-calendar-month `provider_usage` and prove baseline calls + remaining candidates fit
   within the 2,000-request quota; if not, preserve resumability and continue after the UTC month
   reset rather than raising the provider quota.
4. Record one fixed cutoff timestamp.
5. Invoke only the sanctions rescore serially with that exact cutoff.
6. Respect 120/run and 200/day. Do not raise those protections merely to finish faster.
7. Query `provider_usage` after every batch and stop before 2,000 monthly requests.
8. Continue on subsequent UTC days until zero candidates remain.
9. Verify every entity in the recorded cutoff population has a live `checkedAt >= cutoff`, with
   entities created afterward accounted separately; do not require the historical count 763.
10. Record before/after totals for checked, matched, sanctioned, failures, and monthly requests.
11. Verify no stub match appears in user-facing entity/Ask data.

Do not claim completion based only on a green cron. Completion requires nonzero early checks, advancing entity IDs/timestamps across batches, a final zero-candidate batch, and matching provider usage totals.

## Non-goals

- Do not alter OpenSanctions matching thresholds or infer new sanctions facts.
- Do not change X caps or X accounting semantics in this patch.
- Do not modify UI behavior except where required to preserve truth-in-UI.
- Do not reset or delete `provider_usage` history.
- Do not trigger paid production calls from tests.

## Deliverable

Return the implementation diff, test evidence, exact rollout commands/runbook, before/after production counts if rollout was authorized, and any residual risks. Keep the work on a dedicated branch and do not mix unrelated working-tree changes.
