# Step 14 — WS-3.2 series/edition-aware reference discovery + report-only cron entrypoint (Wave 2, lane C2)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Lane / worktree | C2 — `/Users/go/code/bnow-net-worktrees/48h-conflict2-20260905`, step branches `…/edition-discovery`, `…/conflict-validate-route` |
| Window | H10 → H18 (start once step 13's table names are fixed — they may be in its PR before merge) |
| Depends on | 05; 13's schema (rebase onto 13 before merge); decisions C4, C5 |
| Decisions | C2 (unit of validation — the route iterates `CONFLICT_DEFINITIONS`), C4 (edition policy), C5 (citation anchoring on multi-edition days) |
| Spend | $0. Network to understandingwar.org only in tests that are fixture-backed (use `fixtures/isw/*`; never fetch live in unit tests). |
| Closing report | `docs/reviews/WS-3-2-EDITION-DISCOVERY-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then the memo and PLAN-WS-3 §3.2a/3.2b.
**Rewrite note:** at Checkpoint 1 the operator pastes C4/C5 answers here.

## Background you must not rediscover

`run.ts:96-122` probes candidate URLs in likelihood order and `break`s at the first 200 with
>10 KB HTML, then inserts ONE `isw_reports` row per `(theater, date)` — a second same-day
edition is never registered. `editions.ts:87-132` already normalizes every probe shape to a
label (roca: daily; iran_update: special|evening|morning|plain), refuses unknown shapes, and
ranks finality (`:352-359`; `selectDailyFinal` `:446-477`). `iswUrlForDate` /
`iranUpdateUrlCandidatesForDate` live at `run.ts:15-41` (already exported).
`refreshReportCitations(query, reportId, reportUrl, theater, html)` (`isw/load.ts:284-290`) is
anchored to `isw_reports.id`. `politeFetch` spaces hosts
≥2.1 s (`src/lib/fetch-cache.ts`), so probing 4 shapes/day ≈ 8 s — fine for a cron, note it.
Production `validate` cron and `validation_runs` are untouched by this step.

## PR 1 — `isw: series-aware edition discovery recording every edition (no collapse)`

`src/lib/isw/edition-discovery.ts`: for a `(series, date)` probe ALL shapes `editions.ts`
knows, record each found edition through the durable `SqlReferenceReportRepository` (0028
tables), update the day status by the monotone rule. **In this window discovery writes
ONLY the 0028 tables:** it never inserts or updates `isw_reports` or `source_citations` and
never calls `refreshReportCitations` — `isw_report_id` on an edition row is set only by
link-only lookup when an existing `isw_reports` row for that `(theater, date)` has the same
canonical URL, else NULL. The anchor rule for multi-edition days and for existing rows
(schema.ts:151 keeps UNIQUE `(theater, report_date)`; `run.ts:111-118` upserts on url) is
decision C5 — list it, do not implement it. Import the URL builders `run.ts` already exports
(`iswUrlForDate` :15, `iranUpdateUrlCandidatesForDate` :21, and the third builder at :31);
do not duplicate them.
`scripts/isw-refresh.ts` gains `--series roca|iran_update` that drives discovery for a date
window through the new module (existing `--theater` behaviour byte-identical; pin it).
Tests: fixture-backed probe fixtures per shape (`fixtures/isw/*`); day-status monotonicity;
"morning found first, evening later in the same run" yields two editions and the evening
final; unknown shape refused; politeFetch call count pinned. One itest on a fork exercising
the repository path.

## PR 2 — `cron: conflict-validate route (report-only entrypoint, unscheduled)`

`src/app/api/cron/conflict-validate/route.ts`: `CRON_SECRET` auth like siblings;
`withCronRun` start-row semantics (ruling 10); iterates `CONFLICT_DEFINITIONS`
(`definitions.ts:132`) per C2; for now performs discovery (PR 1) and writes a `cron_runs`
counts summary only — the observation pipeline arrives in step 19 behind the same route.
NOT added to `vercel.json` (scheduling is a WS-3.6 operator step — say so in the file
header). Route test mirrors `validate/route.test.ts`.

## Rulings

1 (nothing but ids/hashes persisted), 5 (uses 0028; no migration of its own), 10, 12 (no dedup
semantics change), 14 (no corpus touched).

## Acceptance

Unit green with counts; fork itest name + result; `git diff src/lib/validation/run.ts` is
EMPTY; `vercel.json` unchanged.

## Report

Per COMMON §5. In **Handoff**: the discovery API step 19 calls, the edition ids' shape, and
the soak-scheduling note for step 24.
