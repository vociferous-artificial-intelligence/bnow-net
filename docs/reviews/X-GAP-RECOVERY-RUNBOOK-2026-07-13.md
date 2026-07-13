# X gap recovery + bounded rescore — implementation note & operator runbook (2026-07-13)

Prompt: `docs/prompts/2026-07-13-x-gap-catchup-rescore.md`. Status: **IMPLEMENTED AND TESTED,
NOT RUN.** This session made **no paid calls, no production mutations, no deployments, and no
environment changes** — the only production contact was read-only SQL (plan/dry modes) and the
routine test/lint/build gate. OPEN-TASKS #38's recovery itself is still pending; every paid or
mutating command below is marked **DO NOT RUN WITHOUT OPERATOR APPROVAL**.

## What shipped

1. **Insert-gated, truncation-safe steady-state watermark** (`src/lib/adapters/x-api.ts`).
   `fetchLatest()` no longer writes `provider_state.x_api` — a globally complete pass (every
   batch cursor-exhausted, zero HTTP/parser failures, no budget stop, no page truncation)
   prepares a pending watermark that `runIngest()` persists via `commitMarks()` only **after**
   `insertDocs()` succeeds. A junk-200 body is now a parser failure (`isSearchPayload`), not an
   "empty page". Reaching the 5-page batch ceiling with another cursor pending keeps the ceiling
   but marks the pass incomplete and counts `pageTruncations` — the exact failure mode that made
   July 9–13 unprovable can no longer advance the watermark silently. Numeric `runStats`
   (`requests`, `units`, `budgetStops`, `pageTruncations`, `requestFailures`, `lockSkips`,
   `incomplete`, `docs`) now land in `cron_runs.counts.x_api` on every `ingest:x` run — the raw
   signal the green-but-empty monitor (#38's second half, still open) needs.
2. **X provider lease** (`src/lib/usage/x-lease.ts`): paid X work is single-writer. One atomic
   `provider_state` row (`x_api_lease` — never the `x_api` watermark row) with unique owner,
   120s TTL, per-page renewal, owner-checked release in `finally`, expired-lease takeover. A
   scheduled poll that finds the lease held makes **zero paid calls**, records `lockSkips=1`,
   and leaves the watermark unchanged. Unit tests cover the semantics; the SQL itself has a
   disposable-Neon integration test (`src/integration/x-lease.itest.ts`).
3. **Exact cursor-complete recovery driver** (`scripts/x-gap-backfill.ts`, engine + 14 tests in
   `src/lib/adapters/x-gap-backfill.ts[.test.ts]`). Plan mode by default (no API call, no DB
   write). `--apply`: `advanced_search` with exact `since_time`/`until_time`, `queryType=Latest`,
   ≤20 `from:` accounts per batch, **no page ceiling** — every cursor to `has_next_page=false`.
   Every request passes the shared SpendGuard AND the `--budget-usd` command allowance
   (cumulative across resumes). Pages insert **before** the checkpoint advances past them. The
   deterministic checkpoint (`provider_state.x_gap_backfill:<key>`: range, roster hash, batch
   index, next cursor, counts, spend, completion) refuses resume on range/roster/batch-size
   drift; a completed rerun is a paid-call-free no-op. Failures exit nonzero, preserve the last
   safe checkpoint, print the exact resume command, and release the lease.
4. **Bounded rescore operator** (`scripts/x-gap-rescore.ts`; pure gates + matrix in
   `src/lib/analysis/gap-rescore.ts`, unit tested). Read-only by default (before-snapshot +
   plan). `--apply` is refused unless the matching recovery checkpoint is globally complete AND
   `--ack-workstreams-be` is passed. Stages run serially against the DEPLOYED routes: map drain
   (via `driveMapBackfill`, estimate-first, oldest-first — `scripts/map-backfill.ts` gained a
   bounded `--to` and is now importable), digest regeneration for exactly the configured matrix
   (ru military+elite_politics, ua military, ir military+elite_politics+nuclear; explicit
   `?date=` day windows; deployed mapreduce engine, K=5, shared persist path with its
   publication/overwrite guards; **FORCE_REGEN never set** — refusals are reported), then
   military-only validation (missing same-day ISW report = **pending**, never failure). Writes
   `before.json`/`after.json`/`result.md` under gitignored `data/outbox/` with spend deltas,
   digest/validation deltas, cron run ids, refusals, and residual risks. Never sends email.

Tests: 1321/107 → **1364/111** green; typecheck, lint, `next build` clean. New integration test
included in the itest suite. `.gitignore` gained `data/outbox/` (the AGENTS directory map already
claimed it was ignored; it was not).

## Verified dry-run evidence (read-only, this session)

- `x-gap-backfill` plan mode: 364 registry accounts (hash `3f72060397c1327f`), 19 batches,
  live watermark `lastPollAt=1783970440`, fresh checkpoint. **Note: the roster is a live 90-day
  window — its hash WILL drift over days. Run recovery to completion promptly once started;
  a roster change mid-recovery refuses resume by design (start a new checkpoint key).**
- `x-gap-rescore` dry run: before-snapshot of 30 digests + 12 validation runs in range; the
  apply gate correctly refuses (no B/E ack, no complete checkpoint). X docs by day/theater in
  the window confirm the gap is real: 2026-07-09 ≈ 5.4K docs, **07-10/11/12 ≈ 31/18/27 docs**,
  07-13 ≈ 3.7K (the restart + steady polls).

## Preconditions for the production run (in order)

1. **Deploy current main first.** Two reasons: (a) the deployed :20 poller must be the
   lease-aware, insert-gated build before recovery runs — the OLD deployed adapter ignores the
   lease and writes the watermark directly; (b) the rescore regenerates digests through the
   DEPLOYED routes, and main carries the 2026-07-13 remediation (strengthened ruling-19
   publication guard, canonical-identity entity persist = Workstream E durability fix) that is
   not yet deployed. The `--ack-workstreams-be` flag is the operator attesting exactly this.
2. Private-beta sequencing (prompt §gate): B deployed ✓ (07-13 sprint), E code on main ✓ —
   deploy per (1). OpenSanctions rescore stays LAST, after this entire recovery completes.
3. Verify one scheduled `ingest:x` run on the new build is green and its
   `cron_runs.counts.x_api` carries the new counters (`incomplete=0`).

## Operator runbook

Every command below runs from the repo root on a box with `.env.local` (DB) — paid steps also
need `X_API_KEY` and X cap envs (see step 3). twitterapi.io DNS from this WSL2 box is untested;
if it fails, add `api.twitterapi.io` to `scripts/pin-dns.cjs` or run from a clean-DNS box.

**Step 0 — immediately before any paid call (never rely on historical figures):**

```bash
# current ledger (daily + all-time) and watermark
npx tsx scripts/sqlq.ts "SELECT day, requests, units, round(est_usd::numeric,4) AS usd FROM provider_usage WHERE provider='x_api' ORDER BY day DESC LIMIT 10"
npx tsx scripts/sqlq.ts "SELECT provider, state, updated_at FROM provider_state WHERE provider IN ('x_api','x_api_lease')"
```

Re-read the twitterapi.io dashboard credit balance. Confirm the recovery allowance (planning
ceiling **1M credits / $10**, actual figure = whatever is separately approved) fits BOTH the
funded balance and the BNOW caps. Do not run concurrent paid Ask/OpenSanctions evaluations or
provider maintenance during the window. Record the fixed range + checkpoint key.

**Step 1 — plan (read-only, safe):**

```bash
npx tsx scripts/x-gap-backfill.ts --from 2026-07-09T00:00:00Z --to 2026-07-14T00:00:00Z --budget-usd <approved-usd>
```

**Step 2 — recovery to cursor exhaustion — DO NOT RUN WITHOUT OPERATOR APPROVAL:**

```bash
X_SPRINT_USD_CAP=<current-prod-sprint-cap> X_DAILY_USD_CAP=<recovery-day-cap> X_RUN_REQUEST_CAP=<e.g. 4000> \
npx tsx scripts/x-gap-backfill.ts --from 2026-07-09T00:00:00Z --to 2026-07-14T00:00:00Z \
  --budget-usd <approved-usd> --checkpoint-key 2026-07-09_2026-07-14 --apply
```

Cap notes (ruling 4 — the guard fails closed if these are unset locally, which is the default):
`.env.local` deliberately carries no X caps, so they are set per-invocation. Do **not** copy the
historical `$75` here — the command budget + current funded balance are the authorization. The
local `X_DAILY_USD_CAP` must exceed today's ledger + the allowance or the guard stops the run
mid-way (that stop is safe and resumable). The default `X_RUN_REQUEST_CAP=200` would force a
resume every 200 requests; raising it for this invocation only is fine — `--budget-usd` and the
sprint cap still bound spend. **Side effect to accept or manage:** recovery spend lands in the
shared `provider_usage.x_api` day row, so prod's scheduled polls will budget-stop on their $2.50
daily cap for the rest of that UTC day (now watermark-safe: stopped polls do not advance the
watermark). Either accept the pause or temporarily raise `X_DAILY_USD_CAP` in Vercel prod and
revert after. While recovery holds the lease, scheduled polls log `lockSkips=1` — expected.

On any stop: the printed resume command continues from the exact cursor. A completed rerun is a
free no-op. Abort anytime with Ctrl-C — the checkpoint is already safe; the lease expires ≤120s.

**Step 3 — verify the watermark did not move backward (read-only):**

```bash
npx tsx scripts/sqlq.ts "SELECT state FROM provider_state WHERE provider='x_api'"   # lastPollAt >= step-0 value
npx tsx scripts/sqlq.ts "SELECT state FROM provider_state WHERE provider='x_gap_backfill:2026-07-09_2026-07-14'"  # complete: true
```

**Step 4 — rescore dry run (read-only, safe):**

```bash
npx tsx scripts/x-gap-rescore.ts --from-date 2026-07-09 --to-date 2026-07-13 --budget-map-usd 2 --budget-reduce-usd 2
```

**Step 5 — map → regenerate → validate, serially — DO NOT RUN WITHOUT OPERATOR APPROVAL:**

```bash
npx tsx scripts/x-gap-rescore.ts --from-date 2026-07-09 --to-date 2026-07-13 \
  --budget-map-usd <approved-map-usd> --budget-reduce-usd <approved-reduce-usd> \
  --checkpoint-key 2026-07-09_2026-07-14 --apply --ack-workstreams-be
```

All LLM spend happens server-side on Vercel under the prod caps (`MAP_USD_CAP_DAILY`,
`REDUCE_USD_CAP_DAILY`); the script's budgets are the operator-side bound and it stops issuing
calls when the `provider_usage` delta reaches them. Expect long wall-clock (30 digest calls,
minutes each). Review `result.md`: overwrite/publication-guard refusals are deliberate
(rulings 17/19) — any `FORCE_REGEN` decision is manual and operator-only. "pending" validations
(e.g. the July 13 ISW report before it publishes) rerun later or self-heal at the 07:00 cron.

**Step 6 — post-run:**

- Watch two subsequent scheduled `ingest:x` runs:
  `npx tsx scripts/sqlq.ts "SELECT id, started_at, ok, counts->'x_api' AS x FROM cron_runs WHERE job='ingest:x' ORDER BY id DESC LIMIT 4"`
  — expect `incomplete: 0`, `lockSkips: 0`, watermark advancing again.
- Reconcile the twitterapi.io dashboard credits against the `provider_usage.x_api` delta.
- Only then: close/update OPEN-TASKS #38, correct AGENTS.md standing text (this session
  deliberately did NOT claim recovery there), and proceed to the OpenSanctions rescore (LAST).

## Maximum spend by stage

| Stage | Bound | Enforced by |
|---|---|---|
| Recovery | `--budget-usd` (approved allowance; planning ceiling $10) | command budget + SpendGuard (sprint/daily/run caps), checked before every request |
| Map drain | `--budget-map-usd` | estimate-first abort + server-side `MAP_USD_CAP_DAILY` |
| Digest regen | `--budget-reduce-usd` | provider_usage delta check before each call + server-side `REDUCE_USD_CAP_DAILY` |
| Validation | ~$0.01–0.05/day-country (llm-match k=5) | server-side LLM caps; degrades to keyword matcher under `LLM_DISABLE` |

## Rollback / resume

- Recovery: resume = rerun the printed command (same checkpoint key). Start over = new
  `--checkpoint-key`. Nothing to roll back — inserts are hash-deduped raw docs, the live
  watermark is never written by recovery.
- Rescore: digests regenerate through the shared persist path (guarded); re-running is
  idempotent. Validation upserts per (digest, report).
- Code: plain revert of this commit; no migrations, no env changes shipped.

## Unresolved risks

- **Roster drift**: the registry roster is a rolling 90-day window (383 → 364 accounts already);
  a mid-recovery drift refuses resume by design. Finish the recovery in one sitting if possible.
- **twitterapi.io DNS from this box** is untested (pin-dns does not cover it yet).
- Recovery bills already-ingested tweets again (returned = billed); the July-9/13 edges are
  dense, so expect meaningful duplicate spend — the budget bounds it.
- `advanced_search` result completeness is the provider's guarantee; cursor exhaustion proves we
  drained what the API exposes for the window, not that the API indexes every historical tweet.
- The green-but-empty ALERT (#38 second half) is still open — the counters now exist in
  `cron_runs.counts.x_api`; the alerting itself is a follow-up.
