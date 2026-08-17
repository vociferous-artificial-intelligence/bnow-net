# Map reliability: durable lease + version-aware remap — 2026-08-17

Worktree B of the quality-foundation program. Two deliverables, both LOCAL-ONLY
(no deploy, no push, no production write, no paid provider call anywhere in
this workstream):

1. **Durable map lease** (`src/lib/analysis/map-lease.ts`) — replaces the
   session advisory lock whose pooled-connection stranding is OPEN-TASKS #77.
2. **Version-aware remap operator** (`scripts/map-remap.ts` + remap mode in
   `runMapCycle`) — the missing OPEN-TASKS #33 path required before any
   extractor/model/prompt version change can be applied to the historical
   corpus.

Branch: `codex/map-reliability-remap-20260817`, based on the program
integration base `05fdd2c` (= origin/main `9c5e9cb` + reviewed routing tip
`0e469f7`).

## 1. Why the advisory lock had to go

`pg_try_advisory_lock` is SESSION-scoped. Through the pooled Neon DSN,
pgbouncer may route the later `pg_advisory_unlock` to a DIFFERENT server
connection than the one holding the lock, leaving the lock held by an idle
backend forever; every later cycle records `skipped`. Observed twice in
production on 2026-08-15 (CURRENT-STATE "Known trap"; interim remedy was a
janitor that `pg_terminate_backend`s the stranded holder). The durable fix is
a lock that lives in a ROW, not a session: every lease operation is one
short, self-contained statement that any pooled connection can execute, and
broad backend termination is no longer part of normal operation.

## 2. Lease design and state machine

State: one `provider_state` row, key `map_lease` (the x_api lease and every
poll watermark are untouched). Shape:
`{ owner, token, fence, expiresAt }` — `owner` is diagnostics only; `token`
(crypto-random UUID) is the sole authorization for renew/release; `fence` is
a monotonic acquisition counter that SURVIVES release; `expiresAt` is
DB-generated (`now() + ttl`) and always compared against DB `now()`, so no
holder's wall clock participates in expiry.

```
        (no row / token null / expiresAt <= now())
   FREE/EXPIRED ── tryAcquire CAS ──> HELD(token T, fence F+1)
        HELD ── renew(T): full-TTL reset ──> HELD (same T, same F)
        HELD ── release(T) ──> FREE (fence F kept)
        HELD ── ttl lapses ──> EXPIRED (takeover-eligible; T may still renew
                               until a takeover CAS actually lands)
        EXPIRED ── tryAcquire CAS by T' ──> HELD(T', F+1); renew(T)/release(T)
                               now return false — the old holder has LOST
```

Outcomes are recorded in `cron_runs.counts.lease`: `outcome` (a label:
acquired / expired_takeover / busy / error) plus numeric `fence`, `renewals`,
`lost`, `released` — `released` reflects the ACTUAL release result (a stale
token's refused release records 0).

### Atomicity argument (the exact SQL)

- **Acquire** is a single `INSERT ... ON CONFLICT (provider) DO UPDATE ...
  WHERE token IS NULL OR expiresAt <= now() RETURNING`. Postgres takes the
  row lock for the upsert, evaluates the WHERE against the CURRENT row state
  under that lock, and either updates-and-returns or returns nothing. Two
  concurrent acquirers serialize on the row lock; the second re-evaluates the
  WHERE against the first's committed write and fails. There is no
  read-then-write window. (Proven live by the two-racer `Promise.all` case in
  `map-lease.itest.ts`.)
- **Renew** is `UPDATE ... WHERE token = $mine RETURNING` — it can only
  succeed while my token is still the row's token. A takeover replaces the
  token in the same CAS that grants ownership, so renew-vs-takeover races
  resolve either as "renewed, takeover refused (no longer expired)" or
  "taken over, renew returns false". In neither order do two holders exist.
- **Release** is `UPDATE ... WHERE token = $mine` that clears
  owner/token/expiresAt but PRESERVES fence. A stale holder's release is a
  refused no-op.
- **ABA:** a token is never reused (UUID per acquisition attempt), so a
  release-and-reacquire by anyone else invalidates every stale handle — the
  token IS the ABA protection. The monotonic fence orders diagnostics/log
  lines across crashes; no data write checks it (writes are gated by the
  token via the ownership re-check, not by a fence column).

### Where the lease gates the worker

`runMapCycle` acquires BEFORE any SpendGuard reservation, client
construction, or dispatch (`busy`/driver-`error` both return `skipped` with
zero paid calls and zero writes). During the run, ownership is re-verified —
a full-TTL renew — at EVERY PHYSICAL PROVIDER ATTEMPT (the `extractBatch`
keepalive: initial call, 429 retry after its 65s sleep, each truncation-split
level) and IMMEDIATELY BEFORE every map write (the mirror/doc_dedup
transaction, each `persistBatch` transaction, and the final `processed=true`
update). After a successful renew there are `ttl` (default 120s) of ownership
ahead, and each write is one short transaction (a batch is ≤25 docs; observed
batch persists are sub-second), so a takeover — which requires PROVEN expiry
— ordinarily cannot begin until long after the write commits.

**Residual windows, stated honestly (concurrency review 1, MINORs 1–2):**
(a) a single physical HTTP call can outlive the TTL (the SDK's own request
timeout is longer than 120s); the takeover is then legitimate, the stale
holder's next keepalive/ownership check fails and it discards its unpersisted
work — already metered — so the worst case is bounded duplicate BILLING of
in-flight batches (≤ concurrency), never a second writer under normal
operation. (b) The renew-before-write gate is not atomic with the write: a
pathological ≥TTL stall BETWEEN the renew executing on the DB and the write
transaction committing would let a superseded holder commit after a takeover.
The unique keys (`doc_claims(doc,track,version,ordinal)` + `doc_map_state`
PK, `ON CONFLICT DO NOTHING`) then prevent duplicates but not a
mixed-generation claim set for that one (doc, track, version) — first-writer-
wins per ordinal, with `doc_map_state.claim_count` from the first writer.
This requires a single-statement stall longer than the full TTL (≥120s) at
exactly the wrong instant; it is documented as the accepted residual rather
than papered over — eliminating it outright needs a fence column on the map
tables (a schema change deliberately out of this program's scope).

**Lost-lease money rule (ruling 8):** `extractBatch` meters every billed
response to `provider_usage` immediately after the response and BEFORE
parsing; the lease check runs after that. A lost lease therefore discards
parsed-but-unpersisted results whose spend is already recorded
(`counts.leaseLostDiscards`), and the docs stay eligible for the new holder.
Proven on real Postgres: the injected always-lose-renew driver run shows
provider_usage advancing by exactly the one billed call while doc_claims /
doc_map_state stay untouched and a healthy rerun re-selects the doc.

**Expiry vs route lifetime:** TTL is env-tunable (`MAP_LEASE_TTL_SEC`,
default 120, clamped [30, 600]) and always below the route's
`maxDuration = 800`s, so a run killed by the platform is recoverable within
one TTL — far inside the hourly cron gap. Ruling 10 is untouched: the
`cron_runs` row is still written at START by `withCronRun`.

**Dry runs skip the lease entirely** — a dry run must make ZERO writes
(provider_state included); its reads race nothing. Proven by the itest that
snapshots doc_claims/doc_map_state counts AND the lease row (state +
updated_at) before/after a dry remap run.

## 3. Remap mode (OPEN-TASKS #33)

Hourly eligibility is `processed = false`, so a version bump remaps NOTHING
historical. Remap mode (`runMapCycle({ remap: true, ... })`, route param
`remap=1`, cron job `map:remap`) changes exactly the selection:

- `processed` is IGNORED as an eligibility gate;
- mirrors are excluded structurally (`NOT EXISTS doc_dedup` — mirror verdicts
  are permanent and mirrors are never mapped);
- only docs the map has ALREADY dispositioned (`processed = true` or any
  `doc_map_state` row) are selected — never-touched `processed = false` docs
  stay the hourly worker's job, because remap must not re-run the dedup gate
  against a reference set that could contain its own candidates;
- the existing step-3 anti-join against `doc_map_state` at the CURRENT
  extractor versions (the same `mapExtractorVersion` authority production
  writes with) then keeps only (doc, track) pairs actually missing
  current-version work. A current-version row with `claim_count = 0` — a
  final "mapped, nothing relevant" verdict — SATISFIES the anti-join and is
  never retried; superseded-version rows do NOT satisfy it and are re-mapped.
- selection is id-ordered with an `after=<id>` cursor so docs that yield no
  work (lexicon mismatch, already current) are passed once per sweep instead
  of re-selected forever; the run reports `maxSelectedId` back to the driver.
- `--track` restricts applicability to one track.

Remap NEVER WRITES `processed` at all (review-1 remediation): its candidates
are either already `processed = true` (nothing to write) or partially-
dispositioned `processed = false` leftovers whose remaining tracks still
belong to the hourly worker — and a `--track`-restricted run sees only the
filtered track set, so marking from it would falsely finalize docs with other
applicable tracks unmapped. It never deletes `doc_claims` and never mutates
historical versions: old rows are append-only history and the rollback
(reverting the version restores them to every `map-versions.ts` consumer —
proven by the itest asserting the superseded rows survive a remap intact).

Dispatch is the UNMODIFIED production path: `workloadDispatchConfig("map")`
fails closed on unpriced / unapproved / activation-locked configurations
BEFORE any reservation, and the map activation hard lock is deliberately NOT
relaxed by this program — today the remap operator can only dispatch the
baseline model, which makes it a prompt-revision remap tool until an operator
explicitly authorizes a model activation. Every physical attempt takes a
fresh reservation and is metered before parsing (`map-worker-spend.test.ts`:
1:1:1 clean, 2:2:1 on a 429 manual retry, 3:3:3 on a truncation split,
unparseable responses still metered, refused re-reservation raises the typed
`LlmBudgetError` with no second physical call).

### The driver (`scripts/map-remap.ts`)

Drives the DEPLOYED route like `map-backfill.ts` (this box cannot reach
api.openai.com; bulk LLM work runs on Vercel). Contract:

- **Read-only default:** without `--execute` it only issues `dry=1&remap=1`
  calls — no LLM, no writes, no lease — and prints the exact target model,
  reasoning effort, extractor versions, eligible doc/pair counts, and the
  modelled cost. `--execute` additionally REQUIRES an explicit `--budget`.
- **Estimate method:** the route's dry remap run builds the real batches from
  the real eligibility query and models cost as `650 tokens/call framing +
  0.32 tok/char over the truncated doc lines` in, `135 tokens/doc` out,
  priced via `estimateCostUsd` for the resolved model — the same audited
  model the backfill driver has used since sprint 2, conservative against the
  measured $0.076/1K docs. Execution refuses when the estimate exceeds
  `--budget`, and aborts resumably when ACTUAL cumulative spend does.
- **Sweep-based completion proof:** a day is drained in id-cursor sweeps; the
  cursor advances ONLY on clean calls (no budget stop of any category, no
  lease loss, no batch errors), so a stopped call's unfinished docs are
  re-selected at the same cursor and the anti-join keeps already-finished
  pairs free. A day is marked complete ONLY when a full sweep finds ZERO
  doc-track pairs needing work; a sweep that did work is followed by a
  verification sweep (cursor reset), bounded by `MAX_SWEEPS = 5`, after which
  the day is loudly left incomplete. Cap exhaustion therefore can never mark
  unprocessed targets complete (unit- and integration-proven).
- **Typed stops:** server categories surface verbatim — `run_cap` benign,
  `daily_cap` waits (`--wait-daily`) or aborts resumable, `total_cap` /
  `cap_unset` abort for operator intervention, transport failures retry 3×
  then abort; a lease-busy `skipped` sleeps 60s without advancing the cursor.
- **Checkpointing:** the authoritative no-rebill record is `doc_map_state`
  itself (completed pairs are never re-dispatched — integration-proven by the
  zero-pair rerun). The local checkpoint file
  (`data/remap-state/<key>.json`, gitignored) only avoids re-SCANNING and
  lets an interrupted run resume mid-day; its `complete` flags carry a digest
  of the extractor versions they were proven under, and ANY version change
  resets the day states so the checkpoint can never outrank `doc_map_state`
  (review-1 remediation); `--limit` bounds attempted pairs per invocation.
- **Capability handshake:** the driver refuses to run against a route that
  does not speak remap mode (a remap-capable route always echoes
  `maxSelectedId`, empty days included) — pointing the tool at an old
  deployment can neither spend on the wrong selection nor checkpoint remap
  days "complete" (review-1 remediation).
- **Completion summary** prints pairs/claims/spend modelled-vs-actual and the
  append-only rollback note.

## 4. Failure table

| Failure | Behavior | Proof |
|---|---|---|
| Two simultaneous cycle starts | One acquires; other returns `skipped`, zero paid calls/writes | itest (concurrent CAS race) + unit |
| Crash / route timeout mid-run | Lease expires after ≤TTL; next run takes over with fence+1; unfinished docs re-selected (processed still false / pair still missing) | itest (expired takeover, fence 7→8) |
| Lease lost after billed response, before persist | Usage metered first; parsed results discarded; no map write; docs stay eligible | itest (provider_usage +1 req, zero doc_claims/doc_map_state, healthy rerun re-selects) |
| Lease lost before final `processed=true` | Update skipped; docs re-selected later (idempotent) | code path + unit-covered latch |
| DB down during acquire | `outcome: "error"` → treated as busy: zero paid calls, zero writes | unit (throwing driver) |
| DB down during renew | Fails safe as lost: stop writing, discard | code path (`stillOwner` catch) |
| Stale holder release/renew after takeover | Refused no-ops | itest + unit |
| Budget stop mid-remap | Typed category; targets remain eligible; driver aborts/waits without advancing cursor | itest + driver unit tests |
| 429 storms / truncation | Fresh reservation per physical attempt; every billed response metered pre-parse | unit (2:2:1, 3:3:3, unparseable-metered) |
| Persistent batch errors at one cursor | Driver stalls out loudly after 3 unclean calls; day left incomplete | driver unit test |
| Hourly cron vs manual remap | Same lease — cannot race silently; driver waits out `skipped` | itest (held lease → skip) + driver unit test |

## 5. Files changed

- `src/lib/analysis/map-lease.ts` (new) + `map-lease.test.ts` (12 tests)
- `src/lib/analysis/map-worker.ts` — lease integration (acquire before
  reserve/dispatch; renew-before-write gates; lost-lease latch), remap
  selection mode, cursor, dry-run identity fields, `extractBatch` exported
  for the cardinality tests
- `src/lib/analysis/map-worker-spend.test.ts` (new, 6 tests)
- `src/app/api/cron/map/route.ts` — `remap`/`after`/`track` params
  (validated), `map:remap` job name, health check skipped for driver-paced
  remap runs; + 5 new route tests
- `scripts/map-remap.ts` (new driver) + `scripts/map-remap.test.ts` (14 tests)
- `src/integration/map-lease.itest.ts` (new, 3 tests, real Postgres)
- `src/integration/map-remap.itest.ts` (new, 7 tests, real Postgres, OpenAI
  client mocked at the shared factory seam — zero provider traffic)
- `.env.example` — MAP_LEASE_TTL_SEC + corrected remap wording (the operator
  now exists; the activation lock stays)
- `.gitignore` — `data/remap-state/`

## 6. Gates (exact commands, this worktree, Node v24.14.0 / npm 11.9.0)

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `npx vitest run` (4 new/updated unit files) | 47/47 |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 errors, 0 warnings) |
| `npm test` | **2,232 passed / 2,232** (174 files; base was 2,187/171) — re-run on the remediated tree |
| `npm run test:integration -- map-lease map-remap map-budget-stop` (disposable Neon fork, created+deleted; paid keys blanked; OpenAI client mocked in the remap itest) | **12/12** |
| full `npm run test:integration` | run at commit time — see §7 |

## 7. No-production-execution statement

`scripts/map-remap.ts` was NEVER executed against production (or any deployed
route) during this program: every proof ran through unit seams or the
disposable Neon fork with the OpenAI client mocked. No paid provider call was
made, no production row was written, no environment variable was changed, and
the map activation lock is exactly as the routing branch shipped it. Running
the remap for real remains a separately authorized operator action (estimate
first; `--execute --budget` after review).

## 8. Adversarial reviews and remediation (2026-08-17)

Two fresh, isolated, read-only reviewers examined the full `05fdd2c..95d0a37`
diff in parallel. Both returned **FAIL** on the initial tree — the lease core
(CAS atomicity, renew/takeover ordering, DB-time expiry, pooled-connection
posture, dry-run purity, metering discipline) withstood every attack both
constructed, and every FAIL driver was in the remap semantic layer. All
findings and dispositions:

| # | Reviewer | Severity | Finding | Disposition |
|---|---|---|---|---|
| 1 | both (+author self-review, independently) | MAJOR | A `--track`-restricted remap marks partially-dispositioned `processed=false` leftovers `processed=true`, silently starving their other applicable tracks (ruling 13) | **FIXED**: remap mode never writes `processed` at all (step 6 skipped under `opts.remap`); new itest proves a partial leftover keeps `processed=false` with its military pair current-mapped |
| 2 | spend | MAJOR | `--budget <garbage>` → NaN disables BOTH driver budget gates (every comparison false) | **FIXED**: `driveMapRemap` fails closed on a non-finite/non-positive budget under `--execute`; same guard added to `driveMapBackfill` under `--apply` (the pre-existing precedent hole); unit tests pin both NaN and 0 |
| 3 | spend | MAJOR | No route-capability handshake: against an old deployed route the driver silently runs BACKFILL selection and checkpoints remap days "complete" | **FIXED**: phase 1 aborts when a dry response carries no `maxSelectedId` (a remap-capable route always echoes it, empty days included); live responses re-checked as defense; unit tests pin the abort |
| 4 | concurrency (MAJOR) / spend (MINOR) | — | Checkpoint `complete` flags are extractor-version-blind: rerunning after the next version bump silently no-ops | **FIXED**: the checkpoint stores a digest of the versions its flags were proven under; any change resets the day states (doc_map_state remains the no-rebill authority); unit test proves a v1-complete day re-drains under v2 |
| 5 | both | MINOR | Renew cadence: a 429 sleep or truncation-split tree could outlive the TTL with zero renewals → legitimate takeover + duplicate billing of in-flight work; report claimed "a live holder never expires" | **FIXED + REWORDED**: `extractBatch` takes a keepalive invoked before EVERY physical attempt (fresh-reservation point), so renewals track the batch tree; the report and module header now state the honest residual — a single HTTP call longer than the TTL can still expire the holder, bounded to duplicate billing, never a second writer |
| 6 | concurrency | MINOR | Renew-before-write not atomic with the write: a ≥TTL single-statement stall can produce a mixed-generation claim set; "defense in depth" overstated | **DOCUMENTED** (§2 residual b): requires a ≥120s stall at exactly the wrong instant; the complete fix is a fence column on the map tables — a schema change out of this program's scope, recorded as the accepted residual |
| 7 | both | MINOR | 3 consecutive benign `run_cap` stops at one cursor aborted the day as a stall despite genuine server-side progress | **FIXED**: only batch-error/lease-lost calls count toward the stall bound; run_cap loops at the same cursor (the anti-join shrinks the remaining pairs); unit test proves 4 consecutive run_cap calls still drain the day |
| 8 | spend | MINOR | MAX_SWEEPS left a permanent checkpoint dead-end ("later invocation" could never happen) | **FIXED**: sweep allowance resets per invocation; unit test proves the day retries and completes on the next run |
| 9 | spend | MINOR | `counts.lease.released = 1` recorded even for a refused release | **FIXED**: `MapLeaseHandle.release()` returns the actual outcome; counts record 0 on a refused/failed release |
| 10 | spend | MINOR | Resuming an already-over-budget checkpoint bought one more live call per invocation | **FIXED**: pre-flight budget check before phase 2; unit test proves zero live calls |
| 11 | concurrency | NOTE | Fence is write-inert — "fencing" framing overstated | **REWORDED** (§2): the token is the ABA protection; the fence orders diagnostics only |
| 12 | concurrency | NOTE | itest renew assertion (`toBeGreaterThanOrEqual`) would pass a no-op | **FIXED**: renew now uses a 300s TTL against a 60s grant and asserts a >120s delta — a no-op jsonb_set fails it |
| 13 | concurrency | NOTE | Stuck-lease observability: busy skips record ok=true; detection is via map-health staleness (≤2 days) + TTL self-heal (≤600s) | **RECORDED as designed**: strictly better than the advisory-lock strand (bounded self-heal vs indefinite); steady runs still evaluate map-health even when skipped |
| 14 | concurrency | NOTE | Corrupt-state edges (`{}` state resets fence to 1; garbage `expiresAt` makes the row unclaimable until manual repair) | **RECORDED**: no code path in this tree writes either shape to `map_lease` |
| 15 | both | NOTE | Dry estimate passes `cap=20000` with no route-side clamp; >20K-doc days under-estimate | **RECORDED**: same shape as the shipped backfill precedent; day corpora are an order of magnitude smaller |
| 16 | spend | NOTE | `SpendGuard.record()` failure after a billed response leaves it out of provider_usage | **RECORDED**: pre-existing store behavior, unchanged by this diff |
| 17 | spend | NOTE | A dry estimate under a non-baseline `MAP_MODEL` prices a model the activation lock will refuse at execution | **RECORDED**: execution fails loudly with zero spend; operator-confusion only |

### Gates re-run on the remediated tree

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 errors, 0 warnings) |
| `npm test` | **2,232 passed / 2,232** (174 files) |
| `npm run test:integration -- map-lease map-remap map-budget-stop` (disposable Neon fork) | all green, including the new never-writes-processed case |

Both reviewers received the remediation diff for a focused re-review.

### Focused re-review verdicts (remediated tip e364112)

- **Concurrency/DB re-review: PASS-WITH-MINORS.** Both MAJORs confirmed
  correctly and minimally fixed with non-vacuous coverage; MINOR-1 fixed with
  the residual honestly bounded; MINOR-2 remains by explicit, accurately-worded
  acceptance (fence-column schema change deferred). New NOTE-level edges
  recorded: an intra-invocation production rollback could slip a drained-day
  response past the live capability guard (the phase-1 handshake covers every
  invocation start); a legacy checkpoint without versionsDigest is trusted once
  (the state dir is new); a MAP_RUN_REQUEST_CAP=0 operator misconfiguration
  would hot-loop the driver; leaseLostDiscards undercounts mid-split-tree
  losses (diagnostics only).
- **Spend/versioning re-review: PASS-WITH-MINORS.** All three MAJORs and all
  six MINORs verified remediated in code with the exact constructed failure
  scenarios pinned by tests; no new reservation/metering/versioning/
  destructive-write issue; the keepalive changes no cardinality and never sits
  between a billed response and its record. NOTEs: the live capability guard's
  placement residual (as above); versionsDigest resets when a range gains its
  first eligible docs (re-scan only — conservative); and a PRE-EXISTING
  hygiene find — map-worker.ts carried two literal NUL bytes (the micro-batch
  group-key separator), which made grep classify the file as binary and
  silently skip it in source scans. Fixed after the re-review as an
  escape-only change (the separator is now written as the six-character
  backslash-u-0000 escape — byte-identical string semantics, tests green) so
  future reviews' greps cannot silently skip the map worker.
