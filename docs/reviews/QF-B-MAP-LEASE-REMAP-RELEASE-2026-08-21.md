# QF Worktree B — durable map lease + version-aware remap: rebase, repair, release (2026-08-21)

Takes the audited Quality-Foundation **Worktree B** (durable `provider_state`
map lease replacing the pooled-session advisory lock, plus the version-aware
remap operator) off the QF integration base, rebases the B-only delta onto
current `main`, repairs the audit findings that were still open against it,
and ships it as its own PR.

**Scope discipline:** this is B ONLY. Worktrees A, C and D, the conflict-
evaluation program, and every other QF strand stay unmerged. No migration, no
schedule change, no environment variable added/removed/rescoped, no lockfile
change, no model activated. **The remap operator is deployed but NEVER
executed** — not even a bounded probe. The MAP activation hard lock is
untouched and remains binding.

## 1. Identities

| Thing | SHA / id |
|---|---|
| Base before this PR (`origin/main`, PR #5 merge) | `7336b9c4fe74211dd5d2c49c36449b9159953db4` |
| Audited B source tip | `c40060e4e8d925c1c629f42b5b06959e08c2876b` |
| QF integration base B forked from | `05fdd2c` |
| Immutable QF integration target (NOT merged here) | `7150b494d1399dddada6e7f917b1c0e76114d458` |
| Independent audit tip | `858bb9a7507ddafc1ba1062c2df353aee0e91d9e` |
| Rebased B tip, before repairs | `405f78380cb26c96ebb0bbd191eb265d10c3832c` |
| Repair commit | `3c1c10c789213ddb6dc4061e5a59e933d6314b45` |
| Reviewed / PR-head SHA | *(§6)* |
| Merge commit | *(§7)* |
| Production deployment | *(§8)* |
| Rollback target | `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` / `7336b9c` |

Branch `codex/qf-b-map-lease-remap-20260821`, worktree
`/Users/go/code/bnow-net-worktrees/qf-b-map-lease-remap-20260821`. The
original B branch/worktree, the QF integration branch and the audit branch
were not modified.

## 2. PR #5 soak closure (independently reverified, read-only)

The 24-hour formal soak of the routing-seams release ran
**2026-08-20T22:00:00Z → 2026-08-21T22:00:00Z**. Reverified from the
production record on 2026-08-21T23:4xZ, not from the prior session's notes.

| Check | Evidence | Result |
|---|---|---|
| Production identity | `/health` → HTTP 200, `data-dpl-id=dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ`, build stamp `7336b9c`; `vercel inspect` → Ready, created 2026-08-20T21:00:27Z, aliased `bnow.net` + `bnow-net.vercel.app` | PASS |
| DB health | `/health` renders `DB OK` with live counts | PASS |
| `origin/main` | `7336b9c4fe74211dd5d2c49c36449b9159953db4`, PR #5 merge commit | PASS |
| Scheduled jobs in window | `cron_runs`: **199 total / 199 ok / 0 ok=false / 0 unfinished (`finished_at IS NULL`) / 0 errored** | PASS |
| Map cycles | 24/24 ok | PASS |
| Map dispatch identity | exactly ONE distinct `counts.dispatch` across all 24: `{model: gpt-4o-mini, reasoningEffort: null, registryVersion: analysis-reg-v1, approval: baseline, workload: map}` | PASS |
| Digest dispatch identity | 21 digests created in-window, exactly one distinct `structured.stats.llmDispatch`: baseline `gpt-4o-mini` / effort null / `analysis-reg-v1`, workload `digest` | PASS |
| Validation dispatch identity | 3 `validation_runs`, one distinct `details.dispatch`: baseline `gpt-4o-mini` / effort null / `analysis-reg-v1`, workload `validation`; matcher `llm-majority` | PASS |
| Routing-gate failures | zero `cron_runs` rows in-window matching `dispatchError` / `routing` / `unapproved` / `activation`, and zero non-null `error` | PASS |
| Routing variables absent | `vercel env ls --scope vociferous`: **86 rows / 48 distinct names**, and NONE of `{MAP,REDUCE,DIGEST,VALIDATION,ENTITY_AUDIT}_{MODEL,REASONING_EFFORT}`, `OPENAI_MODEL`, `ANALYSIS_ROUTING_*` — nor `MAP_LEASE_TTL_SEC` | PASS |
| 5xx | sampled production runtime logs: 94×200, 4×404, 2×0; zero 5xx | PASS |

**`PR5_SOAK_VERDICT=PASS`.** No environment row was changed by this session.

### Anomalies observed while closing the soak — ALL pre-existing, none caused by PR #5

Recorded because the standing documentation was wrong about them, not because
they gate this release. Owners in `docs/OPEN-TASKS.md` #86–#88.

1. **~50% of map micro-batches are rejected by the provider** with
   `400 Invalid body: failed to parse JSON value`. Daily rate: 0% through
   2026-07-15, first appearing 07-16 (7.1%) and climbing to a ~45–54%
   plateau; **flat across the PR #5 deploy boundary** (08-19 46.6% → 08-20
   45.4% → 08-21 52.7%), so it is not a routing regression. Root cause
   identified during this work: `mapDocLine` truncates with
   `body.slice(0, mapContentChars())` (`src/lib/analysis/map-prompts.ts:164`),
   a UTF-16 slice that can cut a surrogate PAIR in half; the lone surrogate
   survives `JSON.stringify` as an unpaired escape and the API rejects the
   whole request body. The growth curve matches the growth of emoji-bearing
   Telegram/X content in the corpus. **NOT fixed here** — `map-prompts.ts` is
   outside this PR's 14-file delta, and changing map extraction behaviour on
   the very deploy whose lease behaviour is being soaked would confound the
   soak. OPEN-TASKS #86 (Tier 1).
2. **`digest:finalize` records an in-run `errors: 1`** with the identical 400
   signature on some days (08-01, 08-03 ×2, 08-04, 08-15, 08-21) while
   `cron_runs.ok` stays true. Same root-cause family as #86. OPEN-TASKS #87.
3. **Zero digests have used the `mapreduce` engine since 2026-08-17** — all
   11/day fall back to legacy, and `provider_state.map_health` reads
   `stale_ir,stale_ru,stale_ua`. AGENTS.md's standing text claimed mapreduce
   was the live engine for ru/ua/ir; corrected in place. The map worker is
   healthy and writing ~4–6K claims/day, but into the *backlog* (old
   documents), so current-day digest windows find no current-version claims.
   OPEN-TASKS #88.
4. GramJS peer-type `CastError` noise continues (existing #69); responses stay 200.

## 3. Rebase — mechanical fidelity

```
git branch codex/qf-b-map-lease-remap-20260821 c40060e
git worktree add .../qf-b-map-lease-remap-20260821 codex/qf-b-map-lease-remap-20260821
git rebase --onto origin/main 05fdd2c
```

**Conflict ledger: EMPTY.** Zero conflicts, zero manual resolutions, no
`--continue`, no `rerere`. `main` changes nothing in B's 14 paths relative to
`05fdd2c` (`git diff --name-only 05fdd2c..origin/main -- <B paths>` → empty);
the `05fdd2c..origin/main` delta is PR #6's docs plus `eslint.config.mjs` and
three `x-gap-backfill`/`x-lease` one-liners, none of which B touches. B never
touched `AGENTS.md`, so there was no append-only documentation conflict to
resolve — nothing was reordered, summarized, or dropped.

`git range-diff 05fdd2c..c40060e 7336b9c..405f783` — all seven commits `=`:

```
1:  958e09e = 1:  7b2a66a map: durable provider_state lease replaces the session advisory lock
2:  97cc684 = 2:  82ee436 map: lease-gated writes + version-aware remap selection mode
3:  48e5652 = 3:  882507f map: resumable dry-run-first remap driver with typed stop handling
4:  beac2a9 = 4:  b233aa2 map: real-Postgres lease atomicity + remap eligibility integration tests
5:  95d0a37 = 5:  a49352a docs: map lease + remap review report; env example updates
6:  e364112 = 6:  1bc60e8 map: review-1 remediation (remap never writes processed, fail-closed
                          budgets, route handshake, version-aware checkpoint, per-attempt keepalive)
7:  c40060e = 7:  405f783 map: write the group-key NUL separator as an escape; record re-review verdicts
```

Path inventory identical (14 paths, byte-compared). Patch comparison:

| Comparison | Result |
|---|---|
| `git diff 05fdd2c..c40060e -- ':!*.md'` vs `git diff origin/main..405f783 -- ':!*.md'` | **byte-identical**, 124,060 bytes each |
| full patch including docs | **byte-identical** |

## 4. Audit findings — disposition

| ID | Severity | Finding | Disposition in this PR |
|---|---|---|---|
| **REMAP-1** | MEDIUM (durability) | "remap never writes `processed`" pinned ONLY by a Neon-gated itest; deleting `!opts.remap` passed the whole pre-push gate | **FIXED** — `map-worker-lease-writes.test.ts` adds an always-run pin over a *partially dispositioned* `processed=false` doc whose other applicable track is still hourly-worker work, plus a `--track`-filters-to-zero case, plus a non-vacuous hourly-mode CONTROL that DOES mark the identical fixture. Mutation-proven: deleting `!opts.remap` fails exactly the two remap pins and nothing else. |
| **L4-1** | MEDIUM | Two of four lease-gated write paths (mirror/`doc_dedup` transaction; final `processed=true`) had ZERO lost-lease coverage; the B report falsely claimed "unit-covered latch" for one | **FIXED** — both gates now have always-run pins that force lease loss at that exact gate and assert: the protected write does not happen, NO later write slips through (the whole write log is empty), the work stays eligible (a healthy rerun performs it), a stale-token release records `released: 0`, and no billed response was pending (`meterings === 0`) so ruling 8's meter-before-discard is not silently bypassed. Mutation-proven per gate. The false report cell is corrected in place with a dated note. |
| **REMAP-3** | MINOR | `--limit <non-numeric>` → NaN silently removed the pair bound (same class as the fixed `--budget` MAJOR, one flag over) | **FIXED** — `parseCountFlag`/`parseUsdFlag` in `scripts/map-backfill.ts` (shared; no import cycle) reject non-numeric, empty, non-finite, zero, negative and — for counts — fractional input. Applied at BOTH the CLI boundary and inside `driveMapRemap`/`driveMapBackfill`, so refusal happens before phase 1 issues a single call. `--cap` swept too: `--cap 0` would have selected nothing, which the sweep logic reads as "day drained". Existing finite-positive `--budget` behaviour retained (fractions still legal). |
| **REMAP-5** | MINOR (NOTE↑) | Checkpoint identity omitted the target base URL/database — cross-environment reuse silently skips days | **FIXED** — `remapTargetId()` binds the checkpoint to a normalized, credential-free route target (scheme+host+path; userinfo, query and fragment stripped; lowercased; trailing slash dropped). A checkpoint from another target, under other extractor versions, or with either binding absent, RESETS the scan-only day states. `doc_map_state` remains the sole no-rebill authority — a reset can cost a re-scan, never a rebill and never a silent skip. |
| **SAF-m4** | MINOR | a checkpoint *missing* `versionsDigest` was trusted once | **FIXED as part of REMAP-5** — a missing binding is now a mismatch, not consent. Costless: `data/remap-state/` is new and has never been written in production. |
| **L4-2 / SAF-n1** | MINOR | Code and report asserted "never a second writer"; the stall window was called "single-statement" | **FIXED** — every absolute withdrawn. `map-lease.ts`, `map-worker.ts` and the B report now state: the token/CAS lease is strictly safer than the advisory lock; the fence is DIAGNOSTIC-ONLY; writes re-check token ownership but are NOT statement-fenced; the residual window is the whole renew-to-COMMIT span (~100 round-trips for a 25-doc persist); a pathological full-TTL stall of that span can permit a mixed-generation first-writer-wins result for one (doc, track, version); eliminating it requires the deferred fence column, **OPEN-TASKS #85**, deliberately NOT implemented here. |
| **G1** | MEDIUM | governing QF prompt untracked while `AGENTS.md` cites it as a repo path | **FIXED** — committed verbatim from the blob the audit preserved at `2919970`; SHA-256 `7a556210e1ebbdcea964982c922c957b4cb64555e2fb10cf08a70261f33e6fcc` re-verified after checkout, and byte-identical to the operator's working copy. Not rewritten. |
| **G4 / fence column** | MEDIUM (deferred) | complete "monotonically safe fencing" needs a schema change | **DEFERRED, now tracked** as OPEN-TASKS #85. Explicitly out of scope: this PR ships no migration. |
| **SAF-n5** | NOTE | remap lease-busy wait loop unbounded | **Recorded, not changed** — operator-attended CLI, interrupt-and-resume safe. |
| **SAF-n6** | NOTE | `cycle()` constructs the OpenAI client even for zero-batch runs | **Recorded, not changed** — construction is not contact; production always has the key. |
| **L4-4/5/6/7** | NOTE | acquire-classification race, deploy-overlap window, out-of-fence writes, corrupt-state divergence | **Recorded, not changed.** The deploy-overlap window (advisory lock → row lease, one cron period, self-healing) is closed procedurally in §8. |

### One repair not on the audit's list

`scripts/map-remap.test.ts` carried a **clock-dependent assertion**
(`slept.some(ms => ms > 3_600_000)`) that fails whenever the suite runs inside
the last ~62 minutes before UTC midnight. Reproduced at **23:54Z on the
audited tip `c40060e`** — a real pre-existing flake in the enforced pre-push
gate and in CI, not something this rebase introduced. Repinned against the
same `msToNextUtcDay` helper the driver uses (±5s, tolerant of a midnight
rollover landing mid-test), plus a negative assertion that the 60s
lease-busy sleep is not what satisfied it. No behaviour change.

## 5. Preserved hard boundaries (B6) — how each is held

| Boundary | Held by | Pinned by |
|---|---|---|
| Lease acquired before reservation, client construction, paid call, write | `runMapCycle` acquires before `cycle()`; guard and client construction live inside `cycle` after acquisition | new ordering test asserting `lease.acquire` precedes `guard.init`, `guard.reserve`, `openai.construct`, `openai.call` and the first write, on a run that really extracts a claim |
| Busy lease means zero paid calls and zero writes | `lease.handle === null` returns `counts.skipped` before `cycle()` | new test: zero pool queries, zero client queries, zero reservations, zero client constructions |
| Driver error treated exactly like busy | `acquireMapLease` catch → `outcome: "error"`, handle null | new test |
| Renewal before every physical provider attempt | `extractBatch` keepalive | existing `map-worker-spend.test.ts` (keepalive before initial call, 429 retry, each split level) |
| Renewal immediately before every protected write | `stillOwner()` at the mirror txn, each `persistBatch`, the final flag | ALL THREE now have always-run pins, each mutation-proven. The `persistBatch` gate was pinned only by the Neon-gated itest until the independent review demonstrated it (MEDIUM-1); its pin also asserts the billed response was metered BEFORE the discard (ruling 8) |
| Stale release is a no-op | token-CAS `release` | `map-lease.test.ts` plus `counts.lease.released === 0` in both new lost-lease tests |
| Remap never deletes or rewrites historical claims | remap only INSERTs at current versions; superseded rows stay append-only history | new test asserting zero `DELETE`/`UPDATE` against `doc_claims` / `doc_map_state`, and zero `doc_dedup` writes in remap mode |
| Route capability handshake mandatory | phase-1 `maxSelectedId` check plus live re-check | existing driver tests |
| Remap cannot activate a model | dispatch goes through the unmodified `workloadDispatchConfig("map")` | new test: `MAP_MODEL=gpt-5` makes a remap cycle throw `MAP ACTIVATION BLOCKED` with zero reservations, zero client constructions, zero writes |
| Hourly behaviour and extractor versions unchanged | non-remap selection still `processed = false`, no cursor; versions still from `mapExtractorVersion()` | new tests assert both the selection SQL shape and that the version written to `doc_claims` is `mapExtractorVersion("military","ru")` |
| Dry runs take no lease and write nothing | `opts.dryRun` short-circuits before `acquireMapLease` | new test with a spy on `tryAcquire` |
| No schedule, migration, environment requirement, or lockfile change | — | §6 scans |

**Bonus hygiene this PR ships:** `main`'s `src/lib/analysis/map-worker.ts`
contains two literal NUL bytes, which makes `grep` classify the file as binary
and **silently skip it** in source scans — the exact failure mode that produced
audit finding G2. Commit `c40060e` (carried through this rebase) rewrites the
micro-batch group-key separator as a six-character backslash escape, so the map
worker becomes greppable on `main` for the first time. Verified: a NUL scan
finds two lines on `origin/main:src/lib/analysis/map-worker.ts` and none on
this branch's copy.

## 6. Exact-SHA gates

*(filled in against the reviewed SHA)*

## 7. Independent adversarial reviews

Two fresh, isolated reviewers, each in its own detached-HEAD worktree at the
exact committed SHA `028a1236`, each required to write its attack plan BEFORE
reading any of this change's reports, and each forbidden from contacting
production or making a paid call. Both left their worktrees clean.

**Model note, recorded honestly.** The governing prompt specifies Fable 5
reviewers. Both Fable 5 reviewers were launched and both terminated
immediately with a model-side safeguard error, so — under the operator's
explicit override for exactly this case — both were relaunched on Opus 5.
Each reviewer self-reported its identity: *"Opus 5 (1M context)", exact model
ID `claude-opus-5[1m]`*. Neither could observe its own sampling effort; both
correctly reported it as configured-by-spawner, not self-verified, rather than
guessing.

| Reviewer | Verdict | Findings |
|---|---|---|
| Concurrency / Postgres / lease | **PASS-WITH-MINORS** | 0 BLOCKER · 0 HIGH · 1 MEDIUM · 2 MINOR · 3 NOTE · 18 categories clean |
| Spend / versioning / remap-safety | **PASS-WITH-MINORS** | 0 BLOCKER · 0 HIGH · 1 MEDIUM · 6 MINOR · 7 NOTE · 13 categories clean |

Both independently reproduced typecheck clean, lint clean, unit 2,270/2,270
(175 files) and a production build PASS at the reviewed SHA, and both ran
their own source mutations. Between them they constructed 13 mutations; 10
were caught by the always-run suite and **3 survived** — those three are the
substance of the round.

### Convergent MEDIUM — both reviewers found it independently

**The `persistBatch` pre-write ownership gate had no always-run coverage.**
`map-worker.ts`'s `if (!(await stillOwner())) { stats.leaseLostDiscards += …;
return; }` is the third of four lease-gated write paths and the only one whose
writes come from a BILLED call — and deleting it left `npm test` fully green
(2,272/2,272), so the enforced pre-push gate could not see it. Its only cover
was the Neon-gated `map-remap.itest.ts`. This is exactly the defect class this
change's own REMAP-1 and L4-1 remediations were built to close for the other
two gates; the third was missed because the audit had recorded it as covered.

**FIXED.** Three new always-run cases pin it, including one asserting the
billed response was metered BEFORE the discard (ruling 8) via the event
ledger, plus a CONTROL proving the persist happens on the identical fixture
with a healthy lease. Mutation-proven: deleting the gate now fails exactly
that case. The release report's §5 row, which had implied the gate was
always-run, is corrected above.

### Other findings and their disposition

| ID | Reviewer | Sev | Finding | Disposition |
|---|---|---|---|---|
| MINOR (lease) | lease | MINOR | The three lease SQL predicates — the acquire CAS conflict `WHERE`, the token-bound `renew`, the token-bound `release` — had no always-run cover either; deleting any of them (mutations M5/M6/M7) passed `npm test`. Removing the release predicate lets a stale holder free the CURRENT holder's lease; removing the acquire predicate is split brain by construction. | **FIXED** — new `src/lib/analysis/map-lease-sql.test.ts` runs the REAL `pgMapLeaseDriver` against a fake `rawSql` and asserts on the SQL it actually issues: single-statement upsert on the PK, conflict-side free-or-expired guard, DB-clock expiry on both sides with no timestamp crossing from Node, fence increment, token-bound renew and release, fence-preserving release, and no advisory lock / transaction / session `SET` anywhere. All three of the reviewer's mutations now fail. |
| MINOR-1 | spend | MINOR | The "legacy checkpoint is NOT trusted" test was **non-discriminating**: it passed because the VERSIONS digest mismatched, so the target binding was never exercised. Mutating `targetMatch` to treat an absent target as consent kept the suite green. | **FIXED** — three new cases hold versions CONSTANT so only the target can decide: absent target is not consent, different target is not consent, matching target IS consent (zero live calls). The reviewer's exact mutation now fails. |
| MINOR-2 | spend | MINOR | `?cap=` was the one numeric route input with no validation. `cap=0` yields `LIMIT 0` → `selected=0`, which the sweep logic reads as **"day drained"**. Unreachable from the shipped drivers, reachable for any other `CRON_SECRET`-bearing caller. | **FIXED** — the route now validates `?cap=` exactly like `?after=` (`/^\d+$/` and non-zero) and 400s otherwise. This closes B3's "any touched sibling path": the route IS a touched sibling. Nine malformed inputs test-pinned, plus a positive control that a valid cap still reaches the worker. |
| MINOR-3 | spend | MINOR | `--theater` was unvalidated while its sibling `--track` was allowlisted. A plausible typo (`--theater ru,ua`) selects nothing, every day's first sweep returns zero pairs, every day is marked complete, and the run prints a confident **REMAP COMPLETE over zero work** — on a tool whose entire purpose is proving corpus coverage. | **FIXED** — `REMAP_THEATERS` is derived from the same `TRACKS` config `applicableTracks()` uses, so it cannot drift, and an unknown theater is refused before any call. |
| MINOR-4 | spend | MINOR | The lease-busy wait loop was unbounded (measured: 501 calls / ~8.3h with no exit), **and** `counts.skipped` is set on a lease-driver ERROR too, so an unreachable database was indistinguishable from a busy hourly worker. | **FIXED** — bounded by `MAX_CONSECUTIVE_SKIPS = 30` (~30 minutes) with a resumable abort naming both causes; the counter resets on any successful call. Pinned with a tripwire so an unbounded loop FAILS the test rather than hanging the suite. |
| MINOR-5 | spend | MINOR | Standing documentation asserted a production state that was false at the reviewed SHA — `AGENTS.md` and two `OPEN-TASKS` entries said the lease and remap operator were "deployed" before any deployment existed. AGENTS.md's own maintenance rule forbids wrong standing text. | **FIXED** — all three corrected to the state true at merge; the deployment identity is recorded only in the closeout entry appended after the deploy. |
| MINOR-6 | spend | MINOR | A `complete` day flag is invalidated by a version change and a target change but NOT by that day's document population changing, so a late-arriving document with a historical `published_at` (the X long-park catch-up does exactly this) is silently skipped by a re-run. | **DOCUMENTED** — explicit operator caveat in the driver header with the workaround (delete the checkpoint file); `doc_map_state` still prevents any rebilling. Not code-fixed: invalidating on population change needs a per-day count the checkpoint does not carry. |
| NOTE-6 | spend | NOTE | A dry run under a non-baseline `MAP_MODEL` printed `TARGET model=gpt-5` while the real run would refuse — fail-safe, but the pre-execution printout is the operator's decision surface. | **FIXED** — dry runs now surface `estDispatchBlocked`, the driver prints `!! THIS CONFIGURATION WOULD BE REFUSED AT EXECUTION`, and `--execute` aborts before phase 2 instead of discovering it as a wall of batch errors. |
| MINOR-1 (lease) | lease | MINOR | A `map_lease` row with a token but a broken `expiresAt` wedges the map stage **permanently while reporting `ok=true`** — the same shape as the 2026-07-29 outage. | **DEFERRED, tracked as OPEN-TASKS #90** with the exact fix. Both reviewers confirm no code path in this repository can produce such a row. Changing the core CAS predicate immediately before a 24-hour lease soak would trade a proven-unreachable failure mode for unproven SQL. |
| NOTE-2 (lease) | lease | NOTE | route numeric posture differed from the CLI's | superseded by MINOR-2's fix; residual recorded as OPEN-TASKS #91 |
| NOTE-1 | spend | NOTE | A live remap competes with the hourly worker for the same `MAP_USD_CAP_DAILY`, and can push the next scheduled run into a `daily_cap` stop (which by contract records `ok=false` and alerts). | **DOCUMENTED** — operator caveat in the driver header. |
| NOTE-2 | spend | NOTE | With OPEN-TASKS #86 standing (~45–54% per-batch provider rejection), P(a 20-batch call is clean) ≈ 1e-6, so the stall bound trips after 3 calls and **the operator as shipped cannot drain a day** until #86 lands. | **DOCUMENTED** — stated in the driver header and cross-referenced from #86. This is a strong argument for fixing #86 before any authorized remap. |
| NOTE-3/4/5/7 (spend), NOTE-1/3 (lease) | both | NOTE | run-cap counts billed not physical attempts (pre-existing, $0); ruling-8 letter vs substance (map meters in `extractBatch`, not `analyze()` — pre-existing architecture, substance upheld and now pinned); remap dry runs are heavy reads; `digest-persist.ts` still carries 1 NUL byte so the tree is not yet NUL-free; `leaseLostDiscards` undercounts on the split path; the pre-existing `DedupDoc` cast defect (already #89). | **Recorded**, no change. |

**Zero findings with non-zero dollar exposure.** Both reviewers state this
explicitly: no path on this delta lets a malformed input, a lost lease, a
retry, a truncation split, or a checkpoint cause a single unmetered or
duplicated billed call.

### Focused re-review

Every fix above is test-and-documentation plus three small guards
(route `?cap=` validation, the `--theater` allowlist, the bounded busy-wait,
and the dry-run refusal surface). Both reviewers were re-commissioned against
the exact new SHA to verify the remediations and to attack the new guards.
Their verdicts are in §7.1.

## 8. Deploy, rollback, and the lease soak

*(completed after deployment)*

### Rollback strategy

Single step, no data component: this release carries **no migration and no
environment change**, so rollback is purely a code rollback —
`npx vercel@59.1.4 promote dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ --scope vociferous`
(or redeploy `7336b9c`). The `provider_state.map_lease` row written by the new
code is inert to the old code, which uses `pg_try_advisory_lock` and never
reads that key, so no cleanup is required; conversely the old advisory lock is
session-scoped and dies with its backend.

### Deploy-overlap window (audit L4-5)

For at most one cron period the old build (advisory lock) and the new build
(row lease) could both consider themselves entitled to map. The window is
closed procedurally: deploy shortly AFTER a natural `:40` map run has finished
and with no active map `cron_runs` row, so the first lease-era run is the next
`:40`.

### Remap is not executed

`scripts/map-remap.ts` has never been run against production or any deployed
route, in this session or any prior one. Deploying it changes nothing by
itself: it is an operator CLI, read-only without `--execute`; `--execute`
additionally requires an explicit `--budget`, a remap-capable route handshake,
and a dispatch configuration the MAP activation lock still refuses for
anything but the baseline. Running it for real remains a separately authorized
operator action.
