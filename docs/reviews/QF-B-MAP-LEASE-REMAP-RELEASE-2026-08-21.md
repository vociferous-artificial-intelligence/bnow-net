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
| Repair commit (round 1 review remediation) | `11e0754f9b91a0e6c8ea16cc10fb359bb9abd6f9` |
| **Reviewed / PR-head SHA** | `85f364dfb31c7b5108a2fa67caba4e6445f54b3c` |
| **Merge commit** | `23a1280eceeb0bd41eb9302fe8fc7e80f971580b` (PR #7; parents `7336b9c` + `85f364d`; tree `45eee67…` byte-identical to the reviewed head) |
| **Production deployment** | `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`, READY 2026-08-22T01:02:29Z |
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

Run on a clean tree at each reviewed SHA (Node v24.14.0 / npm 11.9.0, macOS).
The table's headline column is the **merged head `85f364d`**; `11e0754` and
`028a123` are the two earlier reviewed SHAs, given where the numbers differ.

**Merged-head totals:** typecheck clean · lint 0 errors / 0 warnings · unit
**2,309 / 2,309 over 176 files** · production build PASS · disposable-Neon
integration **118 / 118 over 19 files** (branch `br-lucky-band-at3vcofl`,
created and deleted) · pre-push hook all green · migration / schedule /
lockfile deltas all **0 files** · secrets, generated files, conflict markers
and NUL bytes all clean. Baseline on `origin/main` `7336b9c`, measured in a
disposable worktree: **2,187 / 171** — so this release adds **+122 tests and
+5 test files** and removes `main`'s two NUL bytes from `map-worker.ts`.

| Gate | Command | Result at `11e0754` | at `028a123` |
|---|---|---|---|
| Clean tree | `git status --porcelain` | empty | empty |
| Whitespace | `git diff --check origin/main..HEAD` | clean | clean |
| Conflict markers | grep for added `<<<<<<<` / `=======` / `>>>>>>>` | none | none |
| Secrets | perl scan of every ADDED line for `sk-…`, `AKIA…`, private keys, credentialed DSNs, bearer tokens, `napi_…` | none | none |
| Generated files | no `.next/`, `out/`, `build/`, `coverage/`, `dist/`, `node_modules/` in the delta | none | none |
| **Migration** | `git diff --name-only origin/main..HEAD -- drizzle/ src/db/` | **0 files** | 0 files |
| **Schedule** | `… -- vercel.json .github/` | **0 files** | 0 files |
| **Lockfile / deps** | `… -- package.json package-lock.json` | **0 files** | 0 files |
| **Env** | only `.env.example` (+14/−5): comment-only, documents `MAP_LEASE_TTL_SEC` as an optional COMMENTED-OUT knob with a code default of 120s clamped to [30,600] | no requirement added | same |
| NUL bytes | perl scan of every changed `.ts` | none (and `map-worker.ts` becomes NUL-free vs `main`'s 2) | same |
| Typecheck | `npm run typecheck` | clean | clean |
| Lint | `npm run lint` | **0 errors, 0 warnings** | 0/0 |
| Unit suite | `npm test` | **2,294 passed / 2,294 · 176 files** | 2,270 / 175 |
| Baseline for comparison | `npm test` at `origin/main` `7336b9c`, measured in a disposable worktree | **2,187 / 171** (Δ +107 tests, +5 files) | — |
| Production build | dummy unroutable DSN `postgres://build:build@127.0.0.1:1/builddb`, `LLM_DISABLE=1`, every paid provider key blank | **PASS** | PASS |
| Integration suite | `npm run test:integration` — disposable Neon branch, created and DELETED, paid keys blank, `LLM_DISABLE=1` | **118 passed / 118 · 19 files** (`br-sparkling-math-atjvz01p`) | 118 / 19 (`br-frosty-block-atfvis7r`) |
| Targeted map itests | `… -- map-lease map-remap map-budget-stop` | **13 / 13 · 3 files** | 13 / 13 |
| Pre-push hook | `bash .githooks/pre-push` (explicit) | **all green** | all green |
| Remap CLI refusals | 12 malformed invocations against an UNROUTABLE base `http://127.0.0.1:1` | **all 12 refuse before phase 1** | 9 / 9 |

The refusal set: `--limit abc|0|-5|2.5`, `--cap abc|0`, `--budget abc --execute`,
`--execute` without `--budget`, `--track bogus`, and `--theater ru,ua|zz|RU`.
Each is proved to refuse BEFORE any route call by the absence of the phase-1
`map remap — …` header, which prints immediately before the first request. The
base was an unroutable loopback port, so no production contact was possible
even had a refusal failed to fire. **No live remap was executed at any point.**

`--theater` matching is deliberately exact and lower-case: `RU` is refused
rather than coerced, so the theater embedded in the checkpoint key can never
be ambiguous. The error names the allowed set.

### CI note

The repository has **no GitHub Actions secrets configured**, so CI's
`integration` job takes its `if [ -z "$NEON_API_KEY" ]` branch and exits 0
without running anything. **That green check is not evidence of an integration
run.** The mandatory evidence is the locally recorded disposable-Neon run
above. CI's `gate` job (typecheck + lint + `npm test`) does run for real.

### Mutation proofs

Every guard this change relies on was proved load-bearing by deleting it and
confirming the always-run suite fails — and fails on the intended cases only.

| Guard deleted | Result |
|---|---|
| `!opts.remap` on the final `processed=true` update | fails exactly the 2 remap pins |
| `stillOwner()` before the mirror / `doc_dedup` transaction | fails exactly that gate's 2 pins |
| `stillOwner()` in the final-flag condition | fails exactly that gate's pin |
| `stillOwner()` before `persistBatch` | fails exactly that gate's pin *(this one passed the entire suite until the review round)* |
| acquire's conflict-side free-or-expired `WHERE` | fails 2 lease-SQL pins |
| `renew`'s token predicate | fails its lease-SQL pin |
| `release`'s token predicate | fails its lease-SQL pin |
| `parseCountFlag` reduced to bare `Number()` | fails the numeric-flag sweep |
| `targetMatch` treating an absent target as consent | fails the discriminating checkpoint pin |
| the `--theater` allowlist | fails the theater refusal pin |
| `MAX_CONSECUTIVE_SKIPS` bound | fails the bounded-wait pin (via a tripwire, so it fails rather than hangs) |
| route `?cap=` validation | fails the malformed-cap pin |
| `reserve()` before the 429 retry | fails 4 spend-cardinality pins |
| `guard.record()` moved below `parseMapResults` | fails 3 meter-before-parse pins |

Every mutation was restored and the tree re-verified clean.

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

### Round 2 — focused re-review at `11e0754`

Both reviewers were re-commissioned against the exact remediated SHA, each
resumed with its own first-round context, and each asked to re-run its own
mutations and to attack the four NEW guards for false positives and caller
breakage.

| Reviewer | Re-review verdict | Result |
|---|---|---|
| Concurrency / Postgres / lease | **PASS-WITH-MINORS** | M4–M7 all flip from surviving to caught; 0 BLOCKER/HIGH/MAJOR/MEDIUM; 2 new MINOR/NOTE |
| Spend / versioning / remap-safety | **PASS-WITH-MINORS** | its two survivors (M5, M7) both caught; 0 BLOCKER/HIGH/MAJOR/**MEDIUM**; 5 new MINOR, 2 NOTE, none with dollar exposure |

Both verified the four new guards independently and found no false positive
and no broken caller: the `?cap=` validation breaks nothing (the Vercel cron
sends no query at all; both drivers send validated positive integers or the
hardcoded `cap=20000`); `TRACKS` is a zero-import pure data module so the
script's graph is unaffected; the 30-skip bound sits at a ~29-minute floor
against a ~23-minute worst-case legitimate hold (800s `maxDuration` + one TTL);
and `estDispatchBlocked` is produced by the *identical* function the live path
throws on, so it cannot manufacture a false abort, and it can never reach
`cron_runs` because dry results return before `withCronRun`.

The lease reviewer also **endorsed the #90 deferral** after re-deriving the
reachability itself, and noted that the new `map-lease-sql.test.ts` improves
#90's position: the acquire predicate's exact text is now pinned, so
implementing #90 must deliberately edit that assertion and cannot land
silently.

### Round 2 findings — all closed in this PR

| ID | Reviewer | Finding | Disposition |
|---|---|---|---|
| MINOR-A (lease) / NOTE-A (spend) | both | The `--theater` allowlist stopped one file short of its own stated standard: `scripts/map-backfill.ts` is in this delta, takes the same flag, and has the same "zero selected = day mapped" logic. Lower harm (no checkpoint, so the false completion is transient) but the same class. | **FIXED** — `normalizeTheaterFlag` and `MAP_DRIVER_THEATERS` now live in `map-backfill.ts` (the import direction both reviewers noted) and both drivers use them. |
| MINOR-C (spend) / NOTE-B (lease) | both | The allowlist newly refused `--theater IR`, which worked before because the route lowercases. | **FIXED** — the shared validator is case- and whitespace-insensitive and NORMALIZES, so `IR`, ` ir ` and `Ir` all work and all produce the same checkpoint key. Pinned, including that `IR` and `ir` resume each other. |
| MINOR-A (spend) | spend | The bounded-wait test exercised exactly ONE skip, so it could not distinguish "reset" from "no reset" — deleting `skips = 0` passed the full suite. Same non-discriminating shape as the MINOR-1 fixed one file over. | **FIXED** — a new case alternates skip/progress for more than twice the bound without ever being consecutive; the reviewer's exact mutation now fails. |
| MINOR-B (spend) / NOTE-A (lease) | both | `estDispatchBlocked`'s *production* was unpinned (only its consumption was), so deleting one line in `map-worker.ts` silently un-fixed NOTE-6. | **FIXED** — a worker-level dry-run pin under `MAP_MODEL=gpt-5`, plus a baseline control proving the field stays absent when nothing is blocked. |
| MINOR-D | spend | The allowlist patched one input path but the underlying false-COMPLETE stayed reachable: `--theater ru --track nuclear` (nuclear runs on `ir` only) and `--theater il` (allowlisted but outside the map worker's lens) both print a confident REMAP COMPLETE over zero work. | **FIXED, two ways** — an impossible (theater, track) pair is refused outright, and a range with zero eligible docs now prints an explicit ambiguity NOTE and a qualified `COMPLETE (nothing was eligible — see the NOTE above)`. Deliberately NOT an abort: a genuine idempotent re-run after a completed remap also finds zero eligible, and that case must still succeed. |
| MINOR-E | spend | OPEN-TASKS #91 described the `?cap=` hole that the same commit had already closed, sending a reader after a defect that no longer exists — the same class as the MINOR-5 just fixed. | **FIXED** — #91 now records the ACTUAL residual (`?theater=` is the last unvalidated route param) and notes what was closed. |
| NOTE-B | spend | `parseCountFlag` accepted `1e21`, which the route's `^\d+$` rejects — the CLI accept-set had become a strict superset of the route's. | **FIXED** — `Number.isSafeInteger`, pinned with `1e21` and `9007199254740993`. |
| NOTE-A (lease) | lease | superseded by MINOR-B's fix | closed |

Five further mutations were run against this round's guards (the reviewers'
own M14 and M16 among them) and **all five are caught**.

### Stopping rule, stated plainly

Round 2 produced no BLOCKER, HIGH, MAJOR or MEDIUM from either reviewer, and
every round-2 finding is closed above. Round 3 is a confirmation pass only. If
it surfaces further items at MINOR or below, they are recorded as tracked
follow-ups rather than fixed, because each additional fold-in round moves the
merged tree further from the tree that was adversarially reviewed — the exact
provenance failure (`QF-PROV-3` / `G3`) the independent audit criticised in the
program this work comes from.

## 8. Deploy, first lease cycle, and the open soak

### The single production deployment

Deployed **exactly once**, from a FRESH ISOLATED CLONE at
`/Users/go/code/bnow-net-deploy-20260822` — a real clone with a `.git`
DIRECTORY, not a git worktree, so the Vercel CLI's git-metadata detection
works and the build stamp carries the commit. This is the OPEN-TASKS #78
workaround, and it held: `/health` renders `23a1280`, the full merge SHA,
where the 2026-08-15 worktree deploy rendered an empty stamp.

```
npx vercel@59.1.4 deploy --prod --yes --scope vociferous
```

Pinned CLI `59.1.4`, explicit `--scope vociferous`, no `--force`, no preview,
one command, one deployment.

| Pre-deploy condition | Verified at 2026-08-22T01:01Z |
|---|---|
| Production still the PR #5 deployment | `data-dpl-id=dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ`, HTTP 200 |
| No map `cron_runs` row active | `finished_at IS NULL` count for `map%` = **0** |
| Deployed after a natural `:40` run finished | last map run started 00:40:21Z, **finished 00:43:48Z**, ok — deploy began 01:01:47Z, ~18 min later and ~38 min before the next `:40` |
| No `map_lease` row yet | 0 rows |
| Routing variables absent | 86 env rows / 48 distinct names, **name set byte-identical** to the pre-release listing; no `*_MODEL`, no `*_REASONING_EFFORT`, no `OPENAI_MODEL`, no `MAP_LEASE_TTL_SEC` |
| No migration required | `7336b9c..23a1280 -- drizzle/ src/db/` = 0 files |

| Post-deploy verification | Result |
|---|---|
| Deployment state | `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` ● Ready, target production |
| Aliases | `bnow.net`, `bnow-net.vercel.app`, `bnow-net-vociferous.vercel.app` |
| `/health` | HTTP 200, **DB OK** |
| Build stamp | **`23a1280`** = the merge SHA |
| `data-dpl-id` | `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` = the new deployment |
| Public routes | 11/11 return 200 (`/`, `/countries`, `/countries/ru`, `/scoreboard`, `/privacy`, `/terms`, `/access`, `/signin`, `/health`, `/robots.txt`, `/sitemap.xml`) |
| Runtime logs | 0 5xx; no routing, config, cap, or model-activation error |
| Environment | unchanged — no row added, removed, or rescoped by this session |

### Ruling 21 re-proven on the new build

Ten gated routes, each probed anonymously in BOTH modes, asserting on the
response **body** rather than the status code:

- **bare GET** — every gated route returns a body whose visible word set adds
  **ZERO words** beyond what the public `/signin` and `/` pages already
  render. The 307's body is the signin page, as designed.
- **`RSC: 1` GET** — returns HTTP 200 `text/x-component` carrying a gate
  DIRECTIVE, not a serialized page: `NEXT_REDIRECT;replace;/signin;307` for
  the seven `requireAcceptedUser`/`requireAdmin` routes and
  `NEXT_HTTP_ERROR_FALLBACK;404` for the three `requireAdminOr404` routes.

A first pass at this check flagged 16 false positives by grepping for words
like "coverage" and "reliability" — both of which live in the site nav and
footer on every page including the 404. The set-difference method against the
public pages is the one that actually discriminates, and it is clean.

### First natural lease cycle — the one that matters

No cron was invoked manually. The first scheduled `:40` after deployment:

| Signal | Required | Observed |
|---|---|---|
| `cron_runs.ok` | true | **true**, `error` null, 01:40:16Z → 01:43:01Z |
| `counts.lease.outcome` | `acquired` or honestly classified | **`acquired`** — a fresh acquire, correct: no `map_lease` row existed before this deploy |
| fence | positive, monotonic | **1** — the first acquisition in the row's life; every later holder must exceed it |
| renewals | expected | **57** across 15 provider attempts and every pre-write gate |
| `lost` | 0 | **0** |
| `released` | 1 | **1** — an actual clean handover, not a refused stale release (the code records 0 for a refused one) |
| paid call before acquisition | none | none — acquisition precedes `guard.init`, client construction and every dispatch |
| dispatch identity | baseline | **`gpt-4o-mini` / effort `null` / `analysis-reg-v1` / `baseline` / workload `map`** |
| extractor versions | unchanged | the same four as before the deploy: `d73cc83ed8df`, `75e0ff6403db`, `15a6078371bd`, `19c06260f149` — no drift |
| claims / spend | normal range | 138 claims, $0.0168 (prior runs: 125–216 claims, $0.0174–$0.0282) |
| `leaseLostDiscards` | 0 | **0** |
| lease state after completion | released, no live token | `provider_state.map_lease` = **`{"fence": 1}`** — fence preserved, token absent, i.e. FREE |
| advisory locks | none | **0** rows in `pg_locks` where `locktype='advisory'` — the OPEN-TASKS #77 mechanism is gone from production |
| contention | none unexplained | none |

`batchErrors` was 25 of 40 batches — the pre-existing OPEN-TASKS #86 rate,
unchanged by this release and unrelated to the lease.

### Formal lease soak — OPEN (superseded: see §9, CLOSED — PASS, 2026-08-23)

- **Start:** `2026-08-22T02:00:00Z` — the next clean UTC hour boundary after smoke completed (01:44Z)
- **End:** `2026-08-23T02:00:00Z`
- **`LEASE_SOAK_STATUS=OPEN`** as written by that session — it was NOT closed there and
  correctly refused to declare PASS. **Superseded 2026-08-23: `LEASE_SOAK_STATUS=CLOSED —
  PASS`**, recorded with its evidence and its bounds in §9 below.

Forbidden for the duration: remap execution (including any `--execute`
probe), any runtime deployment, any environment or cap change, any model
activation, any manual cron invocation, and any paid evaluation. Natural
scheduled provider activity is expected and permitted.

### Closeout checklist for the next session

Close the soak only if ALL of the following hold over
2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z:

1. **24 natural hourly map cycles**, none manually invoked.
2. `cron_runs.ok = true` for every one; **zero** `ok=false`, zero
   `finished_at IS NULL` among them. (Note: 5 unfinished rows from
   2026-07-28 … 2026-08-15 pre-date this release and are `ingest:*`, never
   `map` — exclude them by `started_at`, do not count them as failures.)
3. **Monotonic fences.** Every cycle's `counts.lease.fence` strictly exceeds
   the previous cycle's. The first cycle was fence 1, so a clean soak ends
   around fence 25. A REPEATED fence means two holders believed they
   acquired; a fence that jumps far means takeovers happened.
4. `counts.lease.outcome` is `acquired` on every cycle. An
   `expired_takeover` means the previous holder did not release — investigate
   before closing. `busy` or `error` on a scheduled run is unexplained
   contention and blocks the PASS.
5. `lost = 0` and `released = 1` on every cycle; `leaseLostDiscards = 0`.
6. `provider_state.map_lease` sits at `{"fence": N}` with **no token** between
   cycles.
7. **Baseline routing throughout:** every cycle's `counts.dispatch` is exactly
   `gpt-4o-mini` / `null` / `analysis-reg-v1` / `baseline`. No routing variable
   in any Vercel environment; env row count still 86 / 48 distinct names.
8. **No extractor-version drift:** `doc_claims` written during the soak carry
   only the four current versions.
9. **Stable metering and yield:** `openai_map` daily spend and claims/day in
   the historical band; no budget stop of any non-`run_cap` category.
10. Zero advisory locks in `pg_locks`. **Corrected 2026-08-23:** a `pg_locks` read is
    POINT-IN-TIME evidence and carries no window coverage — the Neon compute restarts
    (`pg_postmaster_start_time()` moved twice between the soak's close and its closeout),
    which resets every session-scoped lock regardless of what happened during the window.
    So this condition can only ever be a residue check, never soak evidence. The
    load-bearing fact is structural: the map path no longer calls `pg_try_advisory_lock`
    at all, so there is no advisory lock left to strand, and the durable evidence
    (`provider_state`, `cron_runs`) survives restarts. Satisfied as a residue check; see §9.
11. `REMAP_EXECUTED` still NO — no `map:remap` row in `cron_runs`, ever.

Useful query:

```sql
SELECT started_at, ok,
       counts->'lease'->>'outcome'   AS outcome,
       (counts->'lease'->>'fence')::int  AS fence,
       (counts->'lease'->>'lost')::int   AS lost,
       (counts->'lease'->>'released')::int AS released,
       counts->>'leaseLostDiscards'  AS discards,
       counts->'dispatch'->>'model'  AS model,
       counts->>'claims' AS claims, counts->>'estUsd' AS usd
FROM cron_runs
WHERE job LIKE 'map%'
  AND started_at >= '2026-08-22T02:00:00Z'
  AND started_at <  '2026-08-23T02:00:00Z'
ORDER BY started_at;
```

On PASS: close OPEN-TASKS #77, append a dated decision-log entry, and correct
the standing sections. On FAIL: roll back to
`dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` / `7336b9c` — a pure code rollback, since
this release carries no migration and no environment change, and the
`map_lease` row is inert to the old code.

### Remap remains unexecuted; the activation lock remains locked

`scripts/map-remap.ts` has NEVER been run against production or any deployed
route — not in this session, not in any prior one, and not as a probe. There
is no `map:remap` row in `cron_runs`. Deploying it changed nothing by itself.
The MAP activation hard lock is byte-unchanged and still refuses any
non-baseline configuration before any reservation, including on the remap
path. No model was activated; no environment variable was touched.

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


## 9. Formal soak closeout — CLOSED, PASS (2026-08-23)

`QF_B_SOAK_VERDICT=PASS` · `LEASE_SOAK_STATUS=CLOSED — PASS` ·
`ROLLBACK_RECOMMENDED=NO` · `REMAP_EXECUTED=NO`

Window **2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z**, closed 2026-08-23. Every
figure below was re-derived independently from the production record for this
closeout, not copied from the closing session's dossier: the same aggregate query
was re-run against `cron_runs`, `doc_claims`, `provider_state`, `provider_usage`
and `pg_locks`, and the deployment identity was re-fetched live. All timestamps
are read as TEXT through
`to_char(… AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` — never as a
driver-converted `Date`, which the Neon HTTP driver localizes.

### Deployment and tree identity (re-verified 2026-08-23)

| Check | Evidence |
|---|---|
| Production deployment | `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` — `data-dpl-id` on the live `/health` response |
| `/health` | HTTP 200, **DB OK**, build stamp **`23a1280`** (the merge SHA) |
| No successor deployment | `vercel ls --scope vociferous`: newest production deployment is 1 d old and is this one |
| Repository vs runtime | `git diff --name-status 23a1280 origin/main` = exactly five DOCUMENTATION files (`AGENTS.md`, `docs/CURRENT-STATE.md`, `docs/OPEN-TASKS.md`, `docs/PROGRESS.md`, this report). Zero runtime drift |
| Environment | 86 rows / 48 distinct names; zero `*_MODEL`, `*_REASONING_EFFORT`, `OPENAI_MODEL`, `ANALYSIS_ROUTING_*`, `MAP_LEASE_TTL_SEC` |

### The 11-point checklist, point by point

| # | Condition | Result | Evidence |
|--:|---|---|---|
| 1 | 24 natural hourly map cycles, none manually invoked | **PASS** | 24 rows; 24 distinct UTC hours; **0** rows with `EXTRACT(MINUTE) <> 40`; starts banded at `:40:16`/`:40:17` |
| 2 | `ok = true` for every one; zero `ok=false`, zero `finished_at IS NULL` | **PASS** | 24 `ok=true`, 0 `ok=false`, 0 unfinished, 0 non-null `error` |
| 3 | Monotonic fences | **PASS** | fences **2 → 25**, 24 distinct, every delta exactly +1; lease era overall is a gapless **1..35** (35 rows / 35 distinct fences), so no other process ever held the lease |
| 4 | `outcome = acquired` on every cycle | **PASS** | exactly ONE distinct value across all 24: `acquired`. No `expired_takeover`, `busy` or `error` anywhere in the lease era |
| 5 | `lost = 0`, `released = 1`, `leaseLostDiscards = 0` | **PASS** | 0 / 1 / 0 on all 24 (Σ 0 / 24 / 0) |
| 6 | `map_lease` = `{"fence": N}` with no token between cycles | **PASS** | `{"fence": 25}` at window close, `{"fence": 35}` when re-read between cycles for this closeout; `jsonb_object_keys` returns the single key `fence` in both cases |
| 7 | Baseline routing throughout; env unchanged | **PASS** | one distinct `counts.dispatch`: `gpt-4o-mini` / effort `null` / `analysis-reg-v1` / `baseline` / workload `map`. 86 env rows / 48 names, no routing variable |
| 8 | No extractor-version drift | **PASS** | in-window `doc_claims` carry only `d73cc83ed8df` (military, 2,678), `75e0ff6403db` (military, 848), `15a6078371bd` (elite_politics, 404), `19c06260f149` (nuclear, 65) — the four current versions and nothing else |
| 9 | Stable metering and yield; no non-`run_cap` budget stop | **PASS** | `llmCalls` 452 == `llmRequests` 452 (ruling 8). `provider_usage.openai_map` 08-22 = 449 requests / **$0.5043** against `MAP_USD_CAP_DAILY=4`; all-time **$17.0377** against `MAP_SPRINT_USD_CAP=40` — both read 2026-08-23T~12:2xZ; the all-time figure is a live running total, not a window quantity. Zero `budgetStop`/`budgetStopCategory`/`skipped`/`dispatchError` keys in any lease-era row |
| 10 | Zero advisory locks in `pg_locks` | **PASS as a residue check only** | 0 advisory locks. See the correction in §8: this reading is point-in-time and carries no window coverage (the Neon compute restarts). The structural fact is load-bearing instead — the map path no longer calls `pg_try_advisory_lock` |
| 11 | `REMAP_EXECUTED` still NO | **PASS** | `SELECT count(*) FROM cron_runs WHERE job ILIKE '%remap%'` → **0**, ever |

### Per-cycle record (re-queried 2026-08-23)

| # | start UTC | fin | fence | renew | lost | rel | disc | batches | berr | calls | claims | proc | estUSD |
|--:|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 1 | 08-22 02:40:16 | 02:44:05 | 2 | 61 | 0 | 1 | 0 | 42 | 25 | 17 | 147 | 531 | 0.0187 |
| 2 | 08-22 03:40:16 | 03:43:51 | 3 | 63 | 0 | 1 | 0 | 43 | 25 | 18 | 144 | 531 | 0.0166 |
| 3 | 08-22 04:40:16 | 04:44:27 | 4 | 63 | 0 | 1 | 0 | 43 | 25 | 18 | 186 | 531 | 0.0194 |
| 4 | 08-22 05:40:16 | 05:43:34 | 5 | 65 | 0 | 1 | 0 | 44 | 25 | 19 | 203 | 531 | 0.0237 |
| 5 | 08-22 06:40:17 | 06:43:40 | 6 | 65 | 0 | 1 | 0 | 44 | 25 | 19 | 184 | 531 | 0.0231 |
| 6 | 08-22 07:40:16 | 07:43:28 | 7 | 70 | 0 | 1 | 0 | 46 | 24 | 22 | 187 | 557 | 0.0252 |
| 7 | 08-22 08:40:17 | 08:43:37 | 8 | 62 | 0 | 1 | 0 | 42 | 24 | 18 | 160 | 557 | 0.0208 |
| 8 | 08-22 09:40:17 | 09:43:42 | 9 | 68 | 0 | 1 | 0 | 45 | 24 | 21 | 185 | 557 | 0.0241 |
| 9 | 08-22 10:40:16 | 10:43:20 | 10 | 64 | 0 | 1 | 0 | 43 | 24 | 19 | 140 | 557 | 0.0198 |
| 10 | 08-22 11:40:17 | 11:43:31 | 11 | 64 | 0 | 1 | 0 | 43 | 24 | 19 | 144 | 557 | 0.0202 |
| 11 | 08-22 12:40:17 | 12:43:43 | 12 | 64 | 0 | 1 | 0 | 43 | 24 | 19 | 160 | 557 | 0.0224 |
| 12 | 08-22 13:40:17 | 13:43:37 | 13 | 64 | 0 | 1 | 0 | 43 | 24 | 19 | 175 | 557 | 0.0218 |
| 13 | 08-22 14:40:16 | 14:43:36 | 14 | 68 | 0 | 1 | 0 | 45 | 24 | 21 | 190 | 557 | 0.0242 |
| 14 | 08-22 15:40:16 | 15:43:39 | 15 | 66 | 0 | 1 | 0 | 44 | 24 | 20 | 171 | 557 | 0.0223 |
| 15 | 08-22 16:40:17 | 16:43:33 | 16 | 59 | 0 | 1 | 0 | 41 | 25 | 16 | 137 | 537 | 0.017 |
| 16 | 08-22 17:40:17 | 17:43:43 | 17 | 63 | 0 | 1 | 0 | 43 | 25 | 18 | 178 | 537 | 0.0212 |
| 17 | 08-22 18:40:17 | 18:43:28 | 18 | 59 | 0 | 1 | 0 | 41 | 25 | 16 | 151 | 537 | 0.0178 |
| 18 | 08-22 19:40:16 | 19:43:38 | 19 | 61 | 0 | 1 | 0 | 42 | 25 | 17 | 162 | 537 | 0.0189 |
| 19 | 08-22 20:40:17 | 20:43:24 | 20 | 61 | 0 | 1 | 0 | 42 | 25 | 17 | 139 | 537 | 0.0178 |
| 20 | 08-22 21:40:17 | 21:43:54 | 21 | 67 | 0 | 1 | 0 | 44 | 25 | 21 | 170 | 537 | 0.0263 |
| 21 | 08-22 22:40:17 | 22:43:28 | 22 | 63 | 0 | 1 | 0 | 43 | 25 | 18 | 164 | 537 | 0.0219 |
| 22 | 08-22 23:40:16 | 23:43:34 | 23 | 71 | 0 | 1 | 0 | 47 | 25 | 22 | 168 | 537 | 0.0228 |
| 23 | 08-23 00:40:16 | 00:43:22 | 24 | 63 | 0 | 1 | 0 | 43 | 25 | 18 | 154 | 537 | 0.0206 |
| 24 | 08-23 01:40:17 | 01:43:45 | 25 | 67 | 0 | 1 | 0 | 45 | 25 | 20 | 196 | 537 | 0.0241 |
| **Σ 24** | 02:40:16Z | 01:43:45Z | **2–25** | **1541** | **0** | **24** | **0** | **1041** | **591** | **452** | **3995** | **13038** | **0.5107** |

Two derived invariants, both re-checked here: `renewals = batches + llmCalls + 2`
holds on **every** one of the 24 rows, so all **1,541** renewal attempts succeeded
and no 429 retry occurred; and `counts.claims` **3,995** equals the number of
`doc_claims` rows created inside the window, **3,995**, exactly.

### What the PASS does and does not establish

Established: the durable `provider_state.map_lease` is the live map-concurrency
mechanism in production, the pgbouncer-strandable session advisory lock is gone
from the map path, and 24 consecutive natural cycles acquired, renewed, wrote and
released cleanly with no drift in routing, versions, schedule, environment or spend.
**OPEN-TASKS #77 is closed on this basis.**

Not established, recorded as bounds rather than buried:

1. **No production contention was exercised.** `expired_takeover`, `busy`, the
   loss latch and the discard path never fired in any of the 35 lease-era cycles.
   Contention handling remains test-proven (`map-lease.itest.ts` plus the always-run
   unit pins on the four lease-gated write paths) and is NOT production-proven.
   Filed as OPEN-TASKS **#95**. The #77 claim itself is unaffected: that failure mode
   manifested as `skipped`, and there are none.
2. **No complete in-window runtime logs.** `vercel logs` caps at 100 records and no
   drain exists, so by closeout time there was zero runtime-log coverage of the
   formal window. The durable `cron_runs` record plus four stores the counts payload
   does not write (`doc_claims`, `doc_map_state`, `provider_state`, `provider_usage`)
   plus out-of-band operator email carry the evidence. Filed as OPEN-TASKS **#93**.
3. **`pg_locks` was PARTLY point-in-time evidence.** The only IN-WINDOW advisory-lock
   reading is the interim pass at 2026-08-22T21:33Z, which recorded `pg_locks` advisory =
   0 twice about ten minutes apart with `map_lease = {"fence": 20}` between cycles. Every
   later reading — including this closeout's — post-dates a Neon compute restart
   (`pg_postmaster_start_time()` has moved at least three times since the window closed,
   most recently 2026-08-23T12:25:24Z), so those readings carry no window coverage.
   Corrected in §8 item 10 above. What is NOT point-in-time is structural, and it is the
   load-bearing fact: a repository-wide grep for `pg_try_advisory_lock` /
   `pg_advisory_lock` / `pg_advisory_unlock` across `src/` and `scripts/` returns only two
   COMMENT lines in `map-lease.ts` and ZERO call sites, so there is no advisory lock left
   anywhere in the map path to strand.
4. **`counts.lease.lost` is the authoritative lease-loss signal**, not
   `leaseLostDiscards`, which can undercount when a `MapLeaseLostError` unwinds from a
   truncation-split recursion level. Filed as OPEN-TASKS **#96**. `lost` is 0 on all
   35 lease-era rows.
5. **Claims-reported == claims-persisted proves no rollback and no `ON CONFLICT`
   suppression** — a rolled-back persist would have over-counted. It does not prove
   that no work could ever have been discarded before either counter incremented.
6. **Do not claim "zero errors across every job."** Two in-window `digest:*` runs
   (`digest:finalize` 08-22T02:00:40Z, `digest:intraday` 08-22T10:03:16Z) and TWO after
   the window — `validate` 08-23T07:00:49Z
   (`{"date":"2026-08-22","errors":1,"validated":2}`, a NON-digest job) and
   `digest:intraday` 08-23T10:03:16Z — carried nested `counts.errors = 1` with
   `ok = true` and `error` null. That is pre-existing OPEN-TASKS **#87**, on code paths
   this release never touched — not a QF-B regression — and it is WIDER than #87's
   original `digest:finalize` scoping, which #87 now records. Nested `counts.*`
   sub-objects must be swept on every job, not just `ingest:x`.
7. **#85 and #90 remain open** — the two accepted lease residuals (fence column /
   mixed-generation interleave, which needs a migration; and the malformed-`map_lease`
   wedge, reviewer-confirmed unreachable from this codebase but latent).
8. **#86, #87 and #88 remain open.** In-window batch errors were **591 of 1,041
   batches — 56.8%** — which is #86's standing corpus damage, not a lease effect: the
   absolute per-cycle count is pinned at 22–25 and is byte-continuous across the deploy
   boundary (00:40 `berr=25` on the old advisory-lock build → 01:40 `berr=25` on the
   first lease build), while the daily series ramps continuously 08-15 4.9% → 08-23
   57.1% with no step at the deploy. #86 is the next repair, and it is isolated.

### OPEN-TASKS #38, closed on different evidence than recommended

The soak dossier proposed closing #38 on the four in-window map-health alert emails.
Those come from a different evaluator (`src/lib/analysis/map-health.ts`, job `map`),
so they prove the shared Postmark operator-alert transport but are **not** #38's
stated criterion, which is independent confirmation that an **X-health** incident /
recovery email reached the configured recipient. That criterion is now met directly:
the operator mailbox (`go@vociferous.nyc`) holds
`[BNOW] X ingestion unhealthy: incomplete, request_failures` delivered
**2026-08-22T18:05:46.635Z** (reasons `incomplete, request_failures`;
`requestFailures=2`, `incomplete=1`, `budgetStops=0`, `pageTruncations=0`,
`lockSkips=0`) against the `ingest:x` run 18:02:36Z→18:05:47Z carrying exactly those
counters plus `alertKind=1, alertReasons=2, alertDelivery=1`; and
`[BNOW] X ingestion recovered: resumed` delivered **2026-08-22T19:04:17.601Z**
(`requests=55`) against the run 19:02:36Z→19:04:18Z carrying
`alertKind=2, alertDelivery=1, requests=55`. TWO further independent incident/recovery
pairs sit in the same mailbox on 2026-08-21 (07:03:47.156Z / 08:03:34.077Z and
17:03:28.097Z / 21:05:19.126Z). The incident body's `requests=40 docs=311` arrives
quoted-printable-mangled as `requests@ docs11` (`=40`->`@`, `=31`->`1`); decoded it matches
`counts.x_api` exactly. **#38 is closed on that evidence.**

### Scope of the closeout session

Documentation only. No source file, migration, environment variable, cap, model,
routing rule, schedule or cron was changed; no deployment, promotion or rollback was
made; no cron was invoked; no remap was executed or dry-run; no paid provider call was
made; every database statement was a `SELECT`. The AGENTS.md decision-log archive move
to `docs/DECISIONS.md` was deliberately NOT performed and is filed as OPEN-TASKS #92.
