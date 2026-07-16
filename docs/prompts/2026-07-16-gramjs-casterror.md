# Claude Code handoff — #69 GramJS peer-type CastError noise

Recommended model: **Claude Opus 4.8**
Effort: **high**
Reason: the symptom is library-internal, non-fatal, production-only telemetry; the task needs
careful root-cause isolation without masking real errors. Fable 5 is an optional higher-cost
choice for the deepest long-running investigation.

## Repository and protocol

Work in `/home/go/code/bnow.net`. Read `AGENTS.md`, `docs/CURRENT-STATE.md`, OPEN-TASKS
#69, `docs/reviews/PRIVATE-BETA-READINESS-DELTA-2026-07-15.md`, and
`docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`. Preserve unrelated changes. Do not change
GitHub Actions. Never suppress a real Telegram error.

## Objective

Identify and eliminate GramJS `CastError` messages for `channelId` and `accessHash` emitted
during otherwise successful `ingest:mtproto` runs, while preserving exact signed 64-bit
values and all genuine error visibility.

## Current evidence

- `telegram` 2.26.22 is installed and is the current npm release.
- `src/lib/adapters/telegram-mtproto.ts::gramjsTgClient` imports from the single root module,
  converts stored text with `big-integer`, creates `Api.InputPeerChannel`, and passes it to
  `client.getMessages`.
- Local `InputPeerChannel` construction + `getBytes()` with production-shaped signed 64-bit
  values emits no error, so that alone is not a reproducer.
- GramJS `node_modules/telegram/tl/api.js` implements `assertType()` by `console.error(new
  CastError(...))` and continues serialization.
- Fresh production 24h: 24/24 runs green, 1,251 inserts, 960 channel selections, zero recorded
  errors; all 145 channel-state rows have `last_error IS NULL`.
- Vercel nevertheless groups roughly two error-stream lines per selected channel.

## Required investigation

1. Reproduce with the adapter's exact production-shaped boundary, not a toy constructor.
   Exercise `latestMessages`, `newerMessages`, and `olderMessages`, including cached peer
   reuse and resolve→serialize flow.
2. Capture `typeof`, constructor/class name, `bigInt.isInstance`, and exact decimal
   round-trip for the two offending fields at a narrow test seam. Never log the Telegram
   session or full secret material; peer ids/access hashes should be fixture values in tests.
3. Determine whether the warnings come from our request peer, GramJS's resolved/cached peer,
   a duplicated module instance, or a Node 24/library validator incompatibility.
4. Prefer a targeted fix in our adapter. Candidate directions must be proven, not guessed:
   retain the resolved `Api.InputPeerChannel` instance rather than text reconstruction;
   normalize through GramJS's own `returnBigInt`; remove a second module identity; or pin/patch
   a confirmed upstream validator defect.
5. Do not globally replace/wrap `console.error`, filter by message text, lower logging, or
   monkey-patch all GramJS errors. Genuine RPC, flood, auth, and parse failures must remain
   observable and continue updating `last_error`/cron counts as designed.

## Tests and acceptance criteria

- Add production-shaped regression fixtures with values beyond JS safe-integer range and
  negative access hashes; assert exact decimal round-trip and no `CastError` on all three
  message paths.
- Assert a deliberately invalid peer still emits/fails visibly, proving the solution is not
  blanket suppression.
- Keep existing adapter, dedupe, backfill, flood, and store tests green.
- Run typecheck, lint, unit tests, and any scoped integration tests without paid/network calls.
- Before production, provide a review note explaining the exact cause and why the fix is
  narrow. After separate deploy authorization, observe at least two scheduled 40-channel
  runs: zero peer `CastError` clusters, `ok=true`, zero recorded channel errors, and normal
  inserts/skips. Only then close #69.

Do not commit, push, deploy, or mutate production without explicit authorization.
