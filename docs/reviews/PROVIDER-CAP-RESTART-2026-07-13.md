# Provider cap restart — 2026-07-13

## Outcome

X ingestion and ordinary OpenSanctions gap-fill are live again. Full OpenSanctions rescoring remains
held until fixed-cutoff batching and calendar-month quota accounting ship.

## Configuration

The following values were set in Vercel Production, Preview, and Development before deployment:

| Variable | Value |
|---|---:|
| `X_SPRINT_USD_CAP` | 75 |
| `X_DAILY_USD_CAP` | 2.50 |
| `OPENSANCTIONS_CALL_CAP` | 2000 |
| `OPENSANCTIONS_DAILY_CALL_CAP` | 200 |
| `OPENSANCTIONS_RUN_CALL_CAP` | 120 |
| `OPENSANCTIONS_DAILY_USD_CAP` | 40 |

The OpenSanctions 2,000 value is intended as a calendar-month quota, but the deployed code currently
sums all historical `provider_usage` rows. Until the handoff patch ships, it behaves as an all-time
cap. Historical rows were not deleted or reset.

## Deployment

- Deployment: `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV`
- State: READY
- Alias: `bnow.net`
- Project-domain health: HTTP 200
- Vercel build: passed, including Next.js compile and TypeScript

## Runtime proof

### X / twitterapi.io

Authenticated production `ingest?which=x` completed in 193 seconds:

- fetched: 1,889
- inserted: 1,889
- errors: 0
- latest document fetch: 2026-07-13 14:15:33Z
- usage ledger: $5.0000 → $5.2834

This proves the runtime received the new caps; the prior frozen runs returned zero in about 0.1–0.2s.

### OpenSanctions

The operator's OpenSanctions dashboard showed exactly 300 calls before restart: 200 on July 7,
91 on July 8, and 9 on July 9. One authenticated **non-refresh** production gap-fill batch ran after
deployment:

- scanned/checked: 120/120
- matched: 92
- sanctioned: 22
- failed: 0
- budget stop: none
- live checked coverage: 300 → 420
- request ledger: 300 → 420

The unsafe `refresh=1` route was not invoked. Remaining eligible unchecked count is approximately
343, subject to entities added after the snapshot.

## Follow-up

Coding-agent handoff: `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md`.

It requires:

1. calendar-month total accounting for OpenSanctions while preserving all-time X semantics;
2. a required fixed `before` cutoff for resumable refresh batches;
3. strict route validation and observable stop/completion reasons;
4. tests for UTC month boundaries, cap precedence, and multi-batch forward progress;
5. a serial production runbook followed by a measured full rescore.
