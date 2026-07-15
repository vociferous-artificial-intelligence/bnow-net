# OpenSanctions monthly quota + resumable rescore — implementation note (2026-07-15)

Prompt: `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md`.
Branch: `codex/opensanctions-monthly-rescore` off clean main `651259e`
(tag `pre-opensanctions-monthly-20260715`).

**Status: MERGED + DEPLOYED 2026-07-15** (`f9aaa9e`, production
`dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`, READY + aliased bnow.net). Zero-paid live proof:
`/health` 200 on the deployment and authenticated future/timezone-less sanctions cutoffs both
returned the new 400 before cron/provider work; the July ledger remained 660 requests / $72.6000.
No paid provider calls, cleanup, env changes, or
migration. The paid production rescore remains gated (see §Gates).

## Follow-up: cutoff-safety hardening (2026-07-15, second commit on the branch)

A review of the first commit found the `before` cutoff validation too loose. Fixed:

- **No future cutoff.** `normalizeIsoInstant(raw, nowIso?)` now rejects a `before` later
  than the captured `nowIso`. A future cutoff would keep freshly-checked rows (checkedAt =
  now < future cutoff) inside the `checkedAt < before` predicate, re-billing them every
  invocation. Accepting only `before <= nowIso` guarantees `before <= checkedAt`, so a
  successful row always leaves the predicate.
- **Timezone required.** The cutoff must be a timezone-qualified ISO instant (`…Z` or a
  `±HH:MM`/`±HHMM` offset, `T` separator). A timezone-less string is rejected — `Date.parse`
  would read it in the server's local zone and silently shift the cutoff.
- **One captured instant.** The route captures `nowIso = new Date().toISOString()` **once**
  and uses it for BOTH `parseEnrichParams` validation and the `enrichEntities` checkedAt
  stamp, so the accepted cutoff is provably `<=` every row's stamp.
- **Boundary enforcement.** `enrichEntities` re-validates the cutoff against its `nowIso`
  and throws **before** opening any pool/loop, so a direct caller cannot bypass the route.
- **Contract clarified.** A sanctions refresh (`refresh=1` without `only=ownership`) requires
  the cutoff; an **ownership-only refresh** (`only=ownership&refresh=1`) has no cutoff and
  needs no `before` — deliberately revised and tested (the cutoff belongs to the sanctions
  pass; the Companies House ownership examples stay valid).
- **Script hardened.** `scripts/opensanctions-rescore.ts` rejects a future/timezone-less
  `--before` before any network call, requires a positive-integer `--max-batches`, and
  enforces the documented `--sleep-ms >= 2000` floor.

Tests +11 (unit 1484 → 1495): future→400/throw, timezone-less→400/throw, valid `Z` and
explicit-offset accepted, ownership-only refresh accepted without `before`, accepted cutoff
`<= nowIso`, and a real-Postgres boundary case proving `checkedAt == cutoff` leaves the
strict-`<` predicate (integration 26/7 → 27/7). typecheck/lint/build/integration all green.

## What was built

### 1. Calendar-month total accounting in SpendGuard (`src/lib/usage/spend-guard.ts`)

- `SpendGuardConfig.totalPeriod: "all_time" | "calendar_month"`, **default `all_time`** —
  omitted by X and every LLM/embedding guard, so their sprint/lifetime behavior is
  byte-equivalent.
- `calendar_month` loads `totalUsd/totalRequests` only from `provider_usage.day >= monthStart`,
  where `monthStartIso(now)` is the first UTC day of the month (UTC getters → timezone
  independent). Per-day totals stay the single UTC day. **History rows are never mutated or
  zeroed** at a month boundary — the window is a read filter.
- `UsageStore.load(provider, dayIso, totalStartIso)` gained the window arg; `pgUsageStore`
  applies `FILTER (WHERE $3::date IS NULL OR day >= $3::date)` to the total sums (null → all
  history). Kept testable without Postgres (memory store).
- `SpendGuard.init(now = new Date())` injects the clock so the month boundary is deterministic
  in tests. No provider-name conditionals inside the generic guard.
- `ReserveResult` gained a machine `code`; `stopCategory(res, period)` maps a refusal to
  `run_cap | daily_cap | monthly_cap | total_cap | cap_unset | not_initialized | null` (a total
  stop reads as `monthly_cap` only for a calendar_month provider). No string-matching the human
  reason.
- Fail-closed preserved: still requires a valid total USD **or** request cap; missing required
  cap or missing daily USD cap refuses before any call.

Only `opensanctionsGuardFromEnv()` (`src/lib/enrich/run.ts`) sets
`totalPeriod: "calendar_month"`. It still reads the quota from `OPENSANCTIONS_CALL_CAP` (env
name unchanged for deployed-config compatibility) — that value is now a **calendar-month request
quota**, documented in the code comments.

### 2. Fixed-cutoff resumable rescore (`src/lib/enrich/run.ts`, `src/app/api/cron/enrich/route.ts`)

- Normal mode (no `refresh`): unchanged — selects never-checked or stub-only rows.
- Rescore mode (`refresh=1`): selects live rows whose `checkedAt` is **strictly older than a
  fixed operator-supplied `before` cutoff**, plus missing/stub/malformed rows. Because each
  successful check stamps `checkedAt = now` (after the cutoff), the **same** cutoff advances to
  the next batch every invocation — the old non-advancing `refresh=1` (which dropped the
  checked-state predicate and re-selected the same priority prefix) is gone.
- `refresh=1` **requires** a valid ISO `before` (`parseEnrichParams` → HTTP **400 before any
  paid loop / cron row**); a per-invocation "now" is never substituted.
- The rescore predicate orders the `jsonb ->> 'checkedAt' :: timestamptz` cast **behind** a
  `CASE` whose earlier branches catch NULL/empty/`!~ '^[0-9]{4}-...'` — a malformed legacy value
  is treated as needs-refresh and the cast never runs on it, so no `JSON→timestamptz` error can
  abort the batch.
- `limit` clamped to `[1, run cap]` (route also 400s a non-integer / >1000 limit) so a caller
  cannot bypass the per-run cap or serverless duration. Compliance-value priority ORDER BY
  preserved. `only=sanctions` skips the ownership pass.
- Observability: `EnrichStats`/`cron_runs.counts.sanctions` gains `mode`, `cutoff`, `remaining`
  (eligible candidates left after the batch), `completed` (`remaining === 0`), and `stopReason`
  (the coarse category). No key, auth header, response body, or payload is ever logged. A budget
  stop stays a green run, never an HTTP error.

### 3. Operator tooling

- `scripts/opensanctions-rescore.ts`: **dry-run by default** (prints the plan + endpoint, no
  call). `--run` drives the deployed authenticated endpoint serially with one fixed cutoff,
  prints each batch's counts, **continues** past a `run_cap` stop (fresh invocation resets the
  per-run counter), **stops** on `daily_cap`/`monthly_cap`/config stop and on `completed`, never
  busy-loops a daily cap, and **never prints `CRON_SECRET`**. Bounded by `--max-batches` +
  inter-batch sleep.
- `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`: the gated operator runbook (recount, pick one
  cutoff, dry-run, serial drive, completion evidence, rollback).

## Tests — all 13 required cases

Unit (`npm test`: **1460 → 1484 / 129 → 131 files green**):

| # | case | where |
|---|------|-------|
| 1 | all_time default counts prior months | spend-guard.test |
| 2 | calendar_month excludes prior-month usage | spend-guard.test |
| 3 | calendar_month includes first & last UTC day | spend-guard.test |
| 4 | month boundary is UTC, tz-independent | spend-guard.test (`monthStartIso`) |
| 5 | monthly cap blocks at 2000, allows at 1999 | spend-guard.test |
| 6 | daily & run caps still win when lower | spend-guard.test |
| 7 | missing cap fails closed (even monthly) | spend-guard.test |
| 8 | OpenSanctions monthly while X stays all_time | run.test |
| 9 | normal selects only missing/stub | enrich-rescore.itest (live SQL) |
| 10 | rescore selects stale/missing, excludes post-cutoff, advances | enrich-rescore.itest |
| 11 | missing/invalid `before` + refresh → 400, zero calls | run.test + route.test |
| 12 | malformed legacy checkedAt cannot crash/skip | enrich-rescore.itest |
| 13 | stub result never persists/renders as fact | opensanctions.test (`sanitizeForPersist`) |

Integration (`npm run test:integration`, disposable Neon branch): **22/6 → 26/7 green**, run
this session — the saved `NEON_API_KEY` works again (branch create/run/delete verified; the
earlier 401 is cleared). `enrich-rescore.itest.ts` executes the production predicate builders
against real Postgres.

typecheck / lint / `next build`: clean.

## Decisions

- `OPENSANCTIONS_CALL_CAP` env **name kept** (deployed value = 2000) and reinterpreted as the
  monthly quota, avoiding an env rename + re-set during a launch window.
- A sanctions `refresh=1` requires `before`; the operator rescue path is
  `only=sanctions&refresh=1&before=...`. An ownership-only refresh has no sanctions cutoff and
  needs no `before`. Documented and tested in the route.
- Rescore is **not URL-addressable to re-run for free**: it's a paid, cap-guarded operation; the
  driver + runbook enforce serial operation (the guard snapshot is per invocation).
- The driver talks only to the endpoint (no DB coupling) so the endpoint's caps are the single
  source of truth for spend safety.

## Gates (paid production rescore stays CLOSED)

All must be true before `--run` / the paid rescore:

1. operator approves cleanup **#61** AND `scripts/entities-cleanup.ts --apply` is run after the
   canonical-identity persist fix is live, integrity checks passing;
2. **DONE 2026-07-15:** merged + deployed with the new cutoff contract proven live without a
   paid call;
3. fresh recount of eligible population + current-month `provider_usage`;
4. **separate** operator spend authorization.

Do not claim completion on a green cron: it requires nonzero early checks, strictly decreasing
`remaining` across batches, a final `completed: true` batch, every recorded-population entity at
`checkedAt >= cutoff`, and matching `provider_usage` month totals.

## Residual risks / debt

- The full SELECT ordering/limit is proven to *execute* against real Postgres; membership is
  asserted on isolated fixtures (prod-fork volume makes exact-count assertions on the ordered
  batch brittle). Acceptable — the predicate semantics are what matter and are fully covered.
- Rescore progress is measured by `remaining`; in a hypothetical all-failures batch the driver
  stops with a warning rather than looping (safety over completeness) — operator inspects.
- No migration was needed; if a future `provider_usage`-shape change arrives, the monthly window
  filter must move with it.
