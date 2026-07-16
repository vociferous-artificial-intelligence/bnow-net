# Beta invite UX · attributed signals · self-healing X ingestion — 2026-07-15

Branch `codex/beta-invite-signals-x-reliability` (worktree
`/home/go/code/bnow.net-beta-invite-signals-x-reliability`), base `origin/main` at `794d54e`.
Prompt: `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md`. **Zero paid provider
calls** during implementation or testing. Deployed 2026-07-16 as
`dpl_DhMh12dn4fdXCesEhXnpxw546Qkw`; production proof is recorded below.

Three coordinated workstreams. Gate: `npm run typecheck` + `npm run lint` clean, **`npm test`
1536/134 green** (was 1495/131 — +41 tests, +3 files), `npm run build` clean. No migration.

## Workstream A — magic-link single-use + preferred-browser guidance (#40)

- `src/lib/email/magic-link.ts`: the email now states the link is **single-use** and expires in
  24h, and gives the ordering rule — **copy the still-unopened link before opening it, then paste
  it into your preferred browser** (opening in any browser consumes it). The callback URL stays on
  its own line verbatim; `trackLinks:"None"` / `trackOpens:false` preserved.
- `src/app/signin/page.tsx`: the `?sent=1` confirmation carries the same rule. The generic
  "check your email" line is unchanged for every address (no invite-eligibility oracle).
- Token model unchanged (single-use, 24h `maxAge`, `/welcome/legal` redirect); never exposed to
  analytics/logs. Sign-in page stays hard-coded English (no partial i18n refactor).
- Tests: `email.test.ts` (URL verbatim + single-use/24h + copy-before-opening), `signin/page.test.tsx`
  (sent-state copy). `#40` closes only after the copy is live in prod.

## Workstream B — source-attributed named people on `/signals` (#58)

- **Access boundary unchanged (3 states):** anonymous → count-only teaser; signed-in-not-accepted →
  teaser + accept prompt; **accepted → full detail incl. names**. `toPublicSignal` still projects
  only `key/kind/theater/severity/headline/evidenceCount`.
- **Named individuals:** `detectPurge` computes `Signal.subjects` — one **stable representative per
  distinct qualifying canonical person** (shortest raw spelling, tie alphabetical; all of them,
  deterministically ordered). `subjects.length == uniquePersons.size` by construction. `subjects`
  is **not** copied by `toPublicSignal` and never appears in `headline`. Every semantic safeguard
  intact: person-only kind, `isPressureClaim` audited predicate, `canonicalKey` alias fold, unique
  claim ids, window/min-count, "automated pattern, not a confirmed campaign" qualification; ruling
  19 untouched; no "purge" conclusion restored.
- **Data-layer withholding proven:** the `/signals` page renders `subjects` + the attribution
  notice only inside the `accepted` branch; the page test asserts anonymous/unaccepted HTML
  contains **no** name, no `Named in the reporting`, no attribution text, and runs **no** evidence
  query. Accepted users get names via `subjects` AND the hedged claim quotes + sources.
- **Attribution notice:** a prominent Signals notice ("names appear because cited open sources
  identify them; inclusion is not BNOW's endorsement/accusation/opinion/independent assertion");
  i18n keys `signals.named_label` + `signals.attribution_disclaimer` (en + provisional uk, appended
  to the native-review inventory).
- **Terms (material change):** §9 gained the durable named-person rule; `CURRENT_TERMS_VERSION`
  1.0 → **1.1** (effective **2026-07-16** — the actual production rollout date, corrected from the
  initial 07-15 placeholder), forcing re-acceptance via the existing constant-driven
  gate; **Privacy unchanged at 1.2**. `policies.test.ts` pins the bump semantics
  (`isCurrentVersions("1.0","1.2")===false`). `policy_acceptances` untouched (no migration).
- `#58` closes only after names + disclaimer + Terms bump are live.

## Workstream C — self-healing X ingestion + alerts (#38 + #66)

Provider is **api.twitterapi.io** (adapter/provider `x_api`, header `X-API-Key`) — the third-party
service, never the official X API.

### Auto-catch-up state machine — `src/lib/adapters/x-auto-catchup.ts`

- The scheduled `ingest:x` run reads `x_api.lastPollAt`. When older than
  `X_PARK_THRESHOLD_SEC` (default **4h**, the lower bound of the observed 4–8h park boundary), it
  starts/resumes **one fixed window** `[oldWatermark, caughtUpTo)`; `caughtUpTo` is captured **once**
  and read back from the checkpoint on every resume (never recomputed).
- Reuses the proven `runGapBackfill` engine (no page ceiling, cursor-to-exhaustion,
  **insert-before-checkpoint**). Episode checkpoint key = the parked watermark instant, so the
  episode's hourly retries share one checkpoint.
- **Roster snapshot:** the roster is stored **inside** the checkpoint (`GapCheckpoint.roster`, added
  via the additive `runGapBackfill(..., {storeRoster:true})`) and fed back on resume — so
  minutes-scale registry drift cannot strand it. The manual gap-backfill keeps its stricter
  `rosterHash` refusal (it does not set `storeRoster`).
- **Spend:** shared `x_api` SpendGuard (existing `X_SPRINT_USD_CAP` / `X_DAILY_USD_CAP` /
  `X_DAILY_REQUEST_CAP`) with the per-run request cap set to `X_AUTO_CATCHUP_REQUEST_LIMIT`
  (env-tunable, clamped ≤ `X_RUN_REQUEST_CAP`) — no new USD allowance; the command budget is
  infinite so the guard is the sole spend bound. Catch-up and steady poll are **mutually exclusive
  per invocation** (parked → catch-up only; else steady), so they never both spend in one run;
  daily/total caps are cumulative across runs via the shared provider.
- **Lease:** the whole paid/checkpoint/advance sequence runs under the existing X lease; a poll that
  finds it held makes zero paid calls (`lockSkips`).
- **Watermark advance:** only on global completion, via a **compare-and-set** against the episode's
  starting watermark (`XWatermarkDriver.advance`) — never backward; a concurrent forward advance
  makes it a no-op. A crash-completed checkpoint finalizes the advance with **zero paid calls**.
- **Convergence / known edge:** a catch-up drains a fixed window; the tail that accrues *during*
  recovery is closed by the next run — a larger tail re-triggers catch-up (cascades, converging
  because recovery has no page ceiling), a smaller one is steady-drained. A residual tail between
  the steady poll's single-run capacity and the threshold would truncate — the #38 monitor **alerts**
  (`page_truncation`), so it is visible, not a silent re-bill; the operator lowers
  `X_PARK_THRESHOLD_SEC` or runs the manual gap-backfill. This is why full closure of #66 waits on
  production observation.

### Health monitor + operator alerts — `src/lib/adapters/x-health.ts`

- Pure `evaluateXHealth` (episode identity, cooldown dedup, recovery) + `runXHealthCheck` runner.
  Alerts on `pageTruncations`/`budgetStops`/`requestFailures`/unexpected `incomplete`, prolonged/
  parked staleness, repeated `fetched=0` polls (conservative consecutive threshold
  `X_EMPTY_ALERT_RUNS`, default 12), and a stuck catch-up (`X_STUCK_ALERT_RUNS`, default 2). One
  alert per episode within `X_ALERT_COOLDOWN_SEC` (default 6h) + one recovery notice. A valid
  lease-skip (another owner working) is neutral — no spam.
- **Delivery** via the existing `FEEDBACK_EMAIL` operator address + the shared email seam; no
  address/secret added to source. `no_recipient` / `failed` are recorded, never thrown — a monitor
  failure cannot fail ingestion.
- **Safe fields only:** timestamps/age, job, numeric counters, catch-up state + a cursor-PRESENT
  flag, batch index — **no** API key, auth header, provider body, tweet text, email list, or
  `CRON_SECRET`. The alert result is recorded in `cron_runs.counts.x_api` as numeric codes
  (`alertKind`/`alertDelivery`/`alertReasons`) even when the recipient is unset or Postmark fails.

### Adapter wiring — `src/lib/adapters/x-api.ts`

`fetchLatest` now: reset stats → auto-catch-up (if parked, it takes over, records catch-up stats,
runs the health step, returns `[]`) → else the unchanged steady poll → health step. `mode`
(1=steady/2=catch-up) + all counters land in `cron_runs.counts.x_api`. The steady-poll watermark
discipline is byte-for-byte preserved (all 13 prior fetch tests green); auto-catch-up + health are
injectable seams (tests) that default to prod wiring and stay inert when the watermark is fresh and
`FEEDBACK_EMAIL` is unset.

### X tests (zero network / zero paid)

`x-auto-catchup.test.ts` (15): park detection, fixed window + roster snapshot, multi-page/batch
drain, run-cap stop → resume-at-cursor, roster-drift resilience, request/insert failure preserve
+ never-advance, lease-held refusal, guard refusal, crash-complete finalize, stranded-snapshot
refusal, CAS backward-safety. `x-health.test.ts` (16): healthy/truncation/dedup/re-fire/recovery/
lease-neutral/persistent-empty/catch-up-episode/stuck-escalation/stranded, runner
sent/no_recipient/failed + persistence, and the safe-body assertions. `x-api.fetch.test.ts` (+2):
catch-up takes over vs steady poll runs.

## Rollout / rollback

- **Env before deploy:** confirm `SIGNIN_MODE=invite`, `FEEDBACK_EMAIL`, X key/caps present.
  New non-secret knobs are all optional with safe defaults (`X_PARK_THRESHOLD_SEC=14400`,
  `X_AUTO_CATCHUP_REQUEST_LIMIT`≤`X_RUN_REQUEST_CAP`, `X_ALERT_COOLDOWN_SEC=21600`,
  `X_EMPTY_ALERT_RUNS=12`, `X_STUCK_ALERT_RUNS=2`) — set them explicitly only to tune.
- **Rollback:** UI/legal regression → redeploy the prior good deployment (acceptance rows are
  append-only; never delete a Terms-1.1 row). X regression → the steady poll + lease are unchanged;
  raise `X_PARK_THRESHOLD_SEC` very high to effectively disable auto-catch-up while keeping
  insert-gated steady polling, then use the manual gap runbook under separate spend approval; never
  reset the watermark backward. Invite mode is an operator env choice, not a code rollback.

## Residual (blocks closing #38/#40/#58/#66)

`#40`/`#58` are closed by the 2026-07-16 operator/live proof below. `#38`/`#66` still need a real
scheduled recovery + healthy poll (or a separately-authorized bounded exercise with reconciled
`provider_usage`).

## Production operator/live proof — 2026-07-16

- **#40 CLOSED:** authorized production send to the standing test identity produced Postmark
  message `07b145bf-bb55-4d52-b873-67d03f086426` (Sent 12:07:34Z). Postmark's retained TextBody
  and the Gmail-rendered message both carry the single-use, 24-hour, and copy-before-opening
  preferred-browser guidance. `TrackLinks=None`. The server-level Postmark setting reports
  `TrackOpens=true` despite the per-message false request, but the retained raw MIME has only a
  text/plain part—no HTML/image part or open event—so open tracking is technically impossible for
  this message. The unmodified link authenticated the account and reached forced legal acceptance.
- **#58 CLOSED:** the stale account was redirected to `/welcome/legal`; after one transient root
  error recovered via the page's prescribed retry, the form showed required unchecked Terms 1.1
  and Privacy 1.2 controls with optional analytics initially off. Operator authorized acceptance;
  analytics stayed off, DB persisted an append-only 1.1/1.2 acceptance at 12:15:03Z and preference
  `denied`. Authenticated `/signals` rendered one attribution/non-endorsement notice, one nonempty
  qualifying subject list (23 names), and 47 evidence expanders. Fresh anonymous HTML on the exact
  deployment contained neither `Named in the reporting:` nor the notice and still showed the
  sign-in nudge. The test browser signed out after verification.
- **#38/#66 remain OPEN:** the first natural scheduled `ingest:x` run after deploy, cron 1555 at
  12:20:14Z, finished green with `mode=1`, `alertEvaluated=1`, `alertKind=0`, 382 docs / 46 requests,
  and zero failure/truncation/budget/incomplete counters. `x_api_health` persisted a clean state and
  no auto-catch-up checkpoint exists. This is real production-wiring evidence, but no natural park
  occurred, so it does not prove checkpoint resume→completion, unhealthy delivery, recovery notice,
  or the subsequent healthy poll required for closure. No paid incident was manufactured.
