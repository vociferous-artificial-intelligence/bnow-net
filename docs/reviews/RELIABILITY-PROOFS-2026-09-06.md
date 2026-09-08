# WS-4.2 — reliability proofs on a Neon fork (step 21 closing report)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-21-reliability-proofs.md`, plus the relaunch
  handoff at `/Users/go/code/bnow-net-worktrees/logs/step21.readonly-20260908.log`
  (the 2026-09-08 read-only pass, whose corrected citations and test layout this
  session executed as written).
- Lane: `48h-ws4-ops-20260905`. Branch: `48h/ws4-ops-20260905-reliability-proofs`,
  cut from `origin/main` **`6913c57`** ("launch: refuse an unattended `--go` without a
  permission mode; steps 32/21 read-only handoffs"). The read-only pass named `a7ba98b`;
  `origin/main` moved to `6913c57` before this session started and that is the base used.
- Session ran **attended** (interactive, with write permission — the condition the
  read-only pass lacked).
- Authorization: **O3 is signed** — `AGENTS.md` decision log,
  *"2026-09-07 (O3 — fork proofs accepted for this window; the preview-deployment drill is
  follow-up)"*. Fork-based itest proofs are accepted as the #102/#103 live proof and the
  preview-deployment drill is explicitly follow-up. No `AWAITING AUTHORIZATION` line is
  owed and none is printed.
- No deploy, no Vercel environment change, no production write, no paid provider call,
  no migration created, no edit under `docs/evals/analysis/`, no registry or map-lock
  change.

## Built

Three commits on the step branch; one PR's worth of work.

**PR — `map: real-Postgres proofs of #102 shed/refusal and #103 pre-completion death detection`**

1. `6d421c7` — `map: prove the #102 overflow paths and #103 detection on a real fork`
   - `src/integration/map-flood-bounds.itest.ts` (+207): a new describe,
     *"dedup reference-window overflow against the real 75,000-row cap"*, with four cases.
   - `src/integration/map-watch-signals.itest.ts` (+145): a new describe,
     *"runMapWatchCheck end-to-end (#103): detect, throttle, dedupe, recover"*. The two
     existing describes are untouched, per the prompt's "extend, never rewrite".
2. `dfa75db` — `observability: measure the drain receiver's NUL, int4 and bind-cap failures`
   - `src/integration/runtime-logs.itest.ts` (+99): a new describe,
     *"G5 characterization: measured failure modes of the current receiver"*, three cases.
3. `8b2b62e` — `ops: correlate cron runs with runtime logs in the audit script`
   - `scripts/audit-cron.ts` (+63): the runtime-log section.
   - `src/lib/usage/cron-run.ts` (+9/−3): `ceilingCaseSql` exported, with an optional
     `jobExpr` so a caller can qualify the column in a join. The sweep's own call uses the
     default and its SQL is byte-identical.

### 1. #102 — the three overflow terminals, against the real cap

**No test-only cap seam was built, and none was needed.** The prompt offered one as a
fallback; it is not necessary, and a seam would have weakened the proof. One reference
mass on a single old day `M = today − 12` reaches **all three** paths against the real
`MAP_REF_ROW_CAP = 75_000`, because the shed loop drops the *newest* old day
(`map-worker.ts:674-700`) while `dedupRefDays` is exactly ±1 per candidate day
(`map-worker.ts:145-153`) — so *which days carry the candidates* decides which terminal is
reached:

| Candidate days | Path | What is asserted |
|---|---|---|
| `M−3, M−2, M−1` + `today` | flood split; `M−1`'s ±1 window pulls `M` in → over cap; shedding `M−1` drops `M` out → **proceed** | `refShedDays=1`, `refShedCandidates=1`, `selected=4` (the physical selection, unchanged by shedding), `refRows ≤ 75_000` **and equal to the fork's own measured density**, three candidates dispositioned, the shed one `processed=false` with no verdict and no map row |
| `M+1, M+2` | 2 distinct days ≤ `MAP_STEADY_SPAN_DAYS`, so the non-flood path runs, `freshCutoff` is `null` and the shed loop is unreachable → **hard-cap refusal** | rejects `/refusing before materialization/`; both docs untouched; the mocked provider is **never called** |
| `M+1 … M+4`, no fresh day | flood; the mass on `M` survives every shed → **exhaustion refusal** | rejects `/shedding exhausted every candidate day \(3 old days, empty fresh segment\)/`; all four untouched; provider never called |

The mass is one server-side `INSERT … SELECT … generate_series`: **75,100 rows** on `M`,
`processed=true`, `country_iso2='ir'`, content far too short and too uniform to be a
candidate or a dedup match, so its only effect is on `countRefs()`. It seeded in
**5,666 ms** and is dropped by primary-key range in the describe's `afterAll`. The
`beforeAll` asserts the two properties the proof depends on before any test runs: the
post-shed window is **under** the cap on the fork's own data, and the window containing
`M` is **over** it.

### 2. #103 — detection end-to-end on real Postgres

`runMapWatchCheck` is driven with the **real** `pgClaimWatchSlot`, the **real**
`loadProviderState`/`saveProviderState`, and the **real** five signal queries against a
production fork. Only the clock and the mail transport are injected — a test must not send
mail and must not wait six hours for a cooldown.

Four calls, in the incident's own shape (two `job='map'`, `ok=false`, `finished_at IS NULL`
rows — the #98 sweep signature):

1. **t₀ — detection.** `alert="unhealthy"`, `reasons=["map_timeouts"]`, `delivery="sent"`,
   one email, subject `[BNOW] map watchdog unhealthy: map_timeouts`, body carrying
   `sweptTimeouts=2` and asserted to contain no seeded run text, no SQL and no DSN
   (the numeric-only contract). State row: `episodeKey="map_timeouts"`, `lastAlertAtMs=t₀`.
   This call also exercises the **2026-09-01 first-evaluation hotfix on real Postgres**:
   the atomic claim's INSERT arm seeds a *partial* state row, and a missing episode key
   must read as "no episode", never as an episode clearing — the defect that shipped one
   spurious RECOVERED email at first deploy.
2. **t₀ + 1 s — the real slot throttle.** `throttled=true`, `evaluated=false`, no second
   email. This is the case a read-then-act throttle loses, and the reason the claim is one
   conditional statement.
3. **t₀ + 601 s — cooldown dedup.** Slot aged out, same episode, inside the 6 h cooldown:
   evaluated, `alert=null`, still one email, `lastAlertAtMs` unchanged. Episode identity
   survived a round trip through the row.
4. **t₀ + 1,202 s — recovery.** The rows finish, `sweptRecent` drops to 0,
   `alert="recovery"`, exactly one RECOVERED notice, `episodeKey` back to `null`.

**Determinism, stated plainly.** `startStaleMs` and `progressStaleMs` are set beyond any
reachable age via an explicit `MapWatchConfig`, so `map_timeouts` is the only problem the
evaluation can report. Without that, the episode key would depend on how stale the fork
happened to be when it was cut and the assertions would be luck rather than proof. The
test asserts that both isolated signals are nonetheless genuinely **present** on the fork
(`lastStartAgeSec` and `dispositionAgeSec` both non-null), so the isolation removes a
threshold, not a signal. Pre-existing swept rows in the lookback are pushed out of the
window rather than deleted (fork-local, disposable; the flood-bounds itest sets the
precedent) so the swept count starts at exactly 0 — **1 row** was shifted on this run.

### 3. Register gap G5 — measured, not asserted

The register's own limitation (`WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md:322-323`) was
that WS2-F03 and WS2-F26 "turn on PostgreSQL behaviour … asserted from documentation, not
measured". They are now measured, on a fork with 0029 applied. All three are
**characterization** tests, labelled in the file with a shouted `***STEP 23 FLIPS THESE.***`
— they pin the current, defective behaviour so the fix has a regression net.

| Finding | Predicted | **Measured** |
|---|---|---|
| WS2-F03 (NUL) | Postgres rejects `0x00`, whole delivery unstorable | `invalid byte sequence for encoding "UTF8": 0x00` — **confirmed**, and the clean co-batched entry is lost with the poisoned one (0 rows stored) |
| WS2-F03 (int4) | `status_code` truncated, not clamped | `value "2147483648" is out of range for type integer` — **confirmed** |
| WS2-F26 (bind cap) | 12 params/row, >5,461 rows breaks every INSERT | **confirmed with a refinement** — 5,462 rows fail with `bind message has 8 parameter formats but 0 parameters`; 5,461 rows still store all 5,461 |

**The WS2-F26 refinement matters and is worth carrying forward.** The failure is not a
clean "too many parameters" rejection: the wire protocol's 16-bit parameter count *wraps*
(5,462 × 12 = 65,544 ≡ **8** mod 65,536), and the server rejects a message it reads as
malformed. The reassuring half is that this can never mis-bind silently: the wrapped count
is strictly less than the `$1…$12N` placeholders the statement text carries, so the server
always errors. The fix is still the upper clamp the register proposed; the failure mode is
just louder and stranger than the finding described.

### 4. Log-drain handoff discharged

`scripts/audit-cron.ts` gains a runtime-log section: 24-hour coverage counters (lines,
distinct invocations, distinct deployments, error lines, and the
`status_code = -1` crashed-with-no-response signature), then the design's §9(c)
correlation join for every failed or killed run in the window.

Three properties the handoff required, each deliberate:

- **`to_regclass('public.runtime_logs')` is checked first.** Migration 0029 is on `main`
  but unapplied to production (OPEN-TASKS #111), so an unguarded query would abort the
  whole audit rather than degrade. Absent → one explanatory line.
- **An EMPTY table changes no verdict.** The section prints evidence only; every existing
  `WARNING`/`NO …` verdict above it is untouched. Zero rows prints *"no drain registered
  yet"* and says so is a fact about enablement, not a cron finding.
- **The correlation window is not a second copy of the ceiling arithmetic.**
  `ceilingCaseSql` is exported from `src/lib/usage/cron-run.ts` and reused, so the window
  in which a `finished_at IS NULL` run must have died is by construction the same window
  the #98 sweep classifies it with. A hard-coded 920 s would have drifted the first time a
  route's `maxDuration` changed.

## Tests

| Gate | Result |
|---|---|
| `npm test` | **4,082 passed / 270 files** — unchanged before and after (the new tests are all `*.itest.ts`, excluded from the unit include) |
| `npm run typecheck` | clean |
| `npm run lint` | clean — 0 errors, the same 3 pre-existing warnings (`validate/route.test.ts`, `hardening.test.ts`, `cron-run.test.ts`) |
| Fork integration | **28 passed / 3 files** on one shared disposable branch |

Fork run: `npm run test:integration -- src/integration/map-flood-bounds.itest.ts
src/integration/map-watch-signals.itest.ts src/integration/runtime-logs.itest.ts`
— all three files on **one** branch, as the handoff required.

- Branch **`br-long-hat-at1048v9`**, created and **deleted by the harness at the end of the
  run** (`deleted br-long-hat-at1048v9`).
- Wall clock **93.27 s** total: `map-flood-bounds` 82.4 s (7 tests — 3 pre-existing + 4
  new), `map-watch-signals` 5.7 s (3 tests — 2 pre-existing + 1 new),
  `runtime-logs` 4.6 s (18 tests — 15 pre-existing + 3 new). Migrations 0028/0029/0030
  applied additively on the fork by `runtime-logs`' `beforeAll`.
- Counts before → after: **19 → 28** integration tests in these three files
  (repo-wide: 160 → 169 across 25 files).
- Recorded numbers from the run: reference mass **75,100** rows on **2026-08-27** seeded in
  **5,666 ms**; post-shed reference window **24,642** rows against the 75,000 cap;
  **1** pre-existing swept map row neutralized; watchdog baseline
  `lastStartAgeSec=0 dispositionAgeSec=1327 eligibleWork=true`.

**Spend: $0.** Structural, not promised. The worktree `.env.local` is the trimmed
four-key Neon copy — it carries no `OPENAI_API_KEY`, no `ANTHROPIC_API_KEY` and no
Postmark token, so no paid client could be constructed even by accident. Beyond that:
the flood itest mocks the provider at `@/lib/analysis/openai-client` and both #102
refusals throw **before** any dispatch (asserted: the mock was never called); the
watchdog's mail transport is a spy; the drain path makes no provider call of any kind.

## Rulings touched and how each is satisfied

- **Ruling 4 (fail-closed spend).** Nothing here reserves or dispatches. The two #102
  refusals are asserted to throw before materialization *and* before any provider call,
  which is the same ordering ruling 4 demands of the money path — the assertion
  `expect(mockCreate).not.toHaveBeenCalled()` is the pin. No cap env was created, changed
  or read into a Vercel environment.
- **Ruling 10 (`cron_runs` honesty).** The #103 test seeds and reads the sweep signature
  (`ok=false`, `finished_at IS NULL`) and never fabricates a `finished_at` on any row it
  did not itself create. The recovery step sets `finished_at` only on the two rows this
  test inserted, scoped by their own id list. The audit script's correlation join *reads*
  `finished_at IS NULL` as the death signal and bounds the window by the sweep's own
  ceiling — it writes nothing.
- **Ruling 13 (map versioning / hard lock).** Untouched. No extractor-version basis input
  was set: `MAP_CONTENT_CHARS`, `MAP_MODEL` and `MAP_REASONING_EFFORT` appear nowhere in
  this diff, and the fork run used the baseline resolution. The map activation lock and
  `MAP_BASELINE` are not modified.
- **Ruling 5 (migration additivity).** No migration created or edited. `runtime-logs.itest`
  applies the existing 0028/0029/0030 to a disposable fork through the ordinary runner;
  `9999_claim_source_trigger.sql` still applies last, and the file's existing test asserting
  the `claim_must_have_source` trigger survives 0029 passed on this run.
- **Ruling 3 (truth-in-UI).** The seeded reference mass is fork-local, `content` carries
  the file's `MARK`, and it is dropped in `afterAll`; it is never a candidate, never
  produces a claim, and cannot reach a rendered surface. Nothing seeded here is a stub
  fixture in the `[STUB FIXTURE]` sense.
- **Truth in reporting.** Both OPEN-TASKS entries are **downgraded, not closed** — see the
  caveats section below. Per O3 that is the correct outcome, and the entries say so.

## Citations re-verified

Confirmed as written (`6913c57`):

- `src/lib/analysis/map-worker.ts` — `MAP_STEADY_SPAN_DAYS` **:113**,
  `MAP_FRESH_WINDOW_DAYS` **:119**, `MAP_REF_ROW_CAP = 75_000` **:130**, `dedupRefDays`
  **:145-153**, `selectSteadyCandidateRows` **:324**, the adaptive shed loop **:674-700**,
  the hard-cap refusal **:702-708**.
- `src/lib/analysis/map-watch.ts` — `evaluateMapWatch` **:123**, `loadMapWatchSignals`
  **:191**, `pgClaimWatchSlot` **:314**, `runMapWatchCheck` **:336**,
  `runScheduledMapWatch` **:419**, the `VITEST` inert guard **:428**.
- `src/lib/logs/drain.ts` — `maxRows()` **:85-87** (no upper clamp), `str()` **:196-201**,
  `int()` **:203-205**, the message path **:250-256**, `insertRuntimeLogs` **:339-368**
  (12 columns bound per row).
- `docs/designs/LOG-DRAIN.md` §9(c) — the correlation join and its `COALESCE` ceiling.

Corrected (the read-only pass's two moves, both re-verified here):

- The watchdog hook in `withCronRun`'s start path is **`src/lib/usage/cron-run.ts:144-151`**
  (the prompt's Facts block says `:143-150`).
- The #102 shed/refusal **unit** pins begin at **`map-worker-flood-bounds.test.ts:351`**
  (the prompt says `:380-465`; `:380` is the first `it`).

New, from this session:

- `withCronRun` is defined at **`src/lib/usage/cron-run.ts:188`**, and `JOB_MAX_DURATION_SEC`
  / `SWEEP_GRACE_SEC` at **:60-72**. `cron-run.ts` has **zero top-level imports** (`@/db` is
  lazy), which is what makes it safe for a `scripts/` file to import — verified before
  writing the audit change, not assumed.
- The register's G5 row and its limitation are `WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md`
  **:359** and **:322-323**; WS2-F03 is **:177**, WS2-F26 is **:196**.

## Decisions needed

**None blocking.** One item is raised for the record, and one is a scope observation:

1. **(new, minor) WS2-F26's failure mode is a protocol-count wrap, not a clean rejection.**
   The remediation the register proposed (clamp `LOG_DRAIN_MAX_ROWS` to 5,000) is
   unchanged and still correct. No decision is needed unless step 23 wants to *also* chunk
   large batches rather than clamp them — recommendation: **clamp only**, per the register;
   chunking adds a partial-batch failure mode the `ON CONFLICT DO NOTHING` idempotence
   would then have to cover across statements.
2. **WS2-F03 and WS2-F26 have no OPEN-TASKS entries** (`grep` finds neither in
   `docs/OPEN-TASKS.md`; only WS2-F06 was filed, as #110 under A1). They are tracked in the
   register and assigned to step 23, so nothing is lost — but if the operator wants the
   same durability A1 gave WS2-F06, they need filing. Recommendation: **leave as is**;
   step 23 is imminent and the register is the live document. Raising it here so the
   asymmetry is a choice rather than an oversight.

## Debt and risks

1. **The reference DENSITY is seeded; the CAP is real.** This is the honest boundary of
   the #102 proof. 75,000 is the shipped constant, the shed arithmetic and recount run
   against the fork's genuine data (24,642 rows), and both refusals' write-freedom is
   measured — but the 75,100 rows that cross the cap were inserted by the test, because no
   natural single-day `ir` window on the fork comes close. A replay of the incident's real
   densities is not what ran.
2. **Neither path has fired in production.** #102's shed/refusal and #103's detection are
   now fork-proven; they have still never been exercised by a natural event. Per O3 the
   preview-deployment drill is logged follow-up, not a blocker for this window.
3. **#95 is untouched.** The lease contention, takeover, busy, loss-latch and discard paths
   are still unexercised in production, and nothing here touches them.
4. **The G5 tests are designed to fail when step 23 succeeds.** Three `expect(message).not
   .toBe("")` assertions invert the moment the NUL strip, int4 clamp and row clamp land. The
   file shouts this in a block comment. If step 23 slips and someone else runs the suite,
   a red G5 describe means *the fix landed*, not a regression.
5. **The audit's new section is untested in the unit suite.** `scripts/audit-cron.ts` has no
   test file (it never did — it is an operator read-only script), so the `to_regclass` guard
   and the join were verified by reading and by typecheck, not by execution. Running it needs
   production `DATABASE_URL`, which this step does not do. It is read-only by construction;
   the risk is a broken query printing an error, not a write.
6. **Fork-clock flake window inherited.** The flood-bounds file's existing note applies to
   the new cases too: day seeds derive from the DB clock resolved once in `beforeAll`, so a
   UTC midnight rollover mid-file could shift the fresh window by one day. ~1 minute/day;
   re-run on failure at 00:00Z.

## Handoff

### For step 23 (the WS-2 fixes)

- **The regression net exists.** `src/integration/runtime-logs.itest.ts`, describe
  *"G5 characterization…"*. Flip all three when the hardening lands: each
  `expect(message).not.toBe("")` becomes an assertion that the batch stored, and the block
  comment must be rewritten with them. Do not delete the cases — the co-batched-clean-entry
  assertion in WS2-F03 is exactly what proves the fix restores the *delivery*, not just the
  row.
- **Measured error strings, so the fix can assert on the absence of the right thing:**
  `invalid byte sequence for encoding "UTF8": 0x00`;
  `value "2147483648" is out of range for type integer`;
  `bind message has 8 parameter formats but 0 parameters`.
- **WS2-F26's boundary is measured at 5,461/5,462 rows**, not inferred: 5,461 stores all
  5,461 rows in one statement; 5,462 fails. A clamp at 5,000 (the register's proposal) has
  461 rows of margin.
- WS2-F06 / #110 (the unguarded `ASK_PIPELINE=legacy` path) is untouched here — A1 assigns
  it to step 23 and nothing in this step interacts with it.

### For step 25 (AGENTS.md governance)

This step edited **no** standing section of AGENTS.md. Three items, two of them carried
forward from the read-only pass:

1. **Directory map correction (carried from the read-only pass; re-verified here).**
   Before: `src/lib/cron/     shared cron-route plumbing (withCronRun bookkeeping, ruling 10)`.
   `src/lib/cron/` contains only `next-fire.ts`; `withCronRun` is defined at
   `src/lib/usage/cron-run.ts:188`. After:
   `src/lib/cron/     cron scheduling helpers (next-fire); withCronRun lives in src/lib/usage/cron-run.ts`.
2. **D10's migration order is inverted relative to what landed** (carried; OPEN-TASKS #111
   already records it). As merged: `0028_lumpy_dragon_lord`, **`0029_runtime_logs`**,
   `0030_conflict_observations` — `runtime_logs` is 0029, not D10's planned 0030. Confirmed
   again on this run by the fork's migration output.
3. **Proposed decision-log entry** (append; do not edit an existing entry):

> - **2026-09-08 (#102 shed/refusal and #103 detection FORK-PROVEN under O3; register gap
>   G5 measured)** Step 21 discharged the O3 obligation with fork-based integration proofs
>   on disposable Neon branch `br-long-hat-at1048v9` (created and deleted in-session; 28
>   tests / 3 files / 93 s; **$0**, structural — the worktree `.env.local` carries only the
>   four Neon keys, the provider client is mocked and both refusals throw before dispatch).
>   **#102:** all three reference-window terminals now run against the REAL
>   `MAP_REF_ROW_CAP = 75_000` with **no test-only seam and no environment override** —
>   adaptive shedding (`refShedDays=1`, `refShedCandidates=1`, `refRows=24,642` measured
>   against the fork's own density, shed candidate untouched), the hard-cap refusal on the
>   non-flood path where nothing can shed, and shed exhaustion with an empty fresh segment.
>   Both refusals are asserted to mark nothing and dispatch nothing. **Honest boundary,
>   recorded:** the cap is real, the shed arithmetic and recount are real, but the density
>   that crosses the cap is a seeded 75,100-row mass on one day — no natural single-day `ir`
>   window approaches 75K. **#103:** `runMapWatchCheck` end-to-end with the real slot claim,
>   the real `provider_state` row and the five real signal queries; only the clock and mail
>   transport injected. Detection on the incident's own signature → real slot throttle at
>   +1 s → cooldown dedup at +601 s → exactly one RECOVERED notice at +1,202 s, with the
>   state row asserted at each step, and the 2026-09-01 first-evaluation hotfix exercised on
>   real Postgres. **Neither path has fired naturally in production**, so both OPEN-TASKS
>   headers are DOWNGRADED to "fork-proven", not closed; per O3 the preview-deployment drill
>   stays follow-up. **Register gap G5 closed by measurement:** WS2-F03's NUL rejection
>   (`invalid byte sequence for encoding "UTF8": 0x00`, whole delivery lost including the
>   clean co-batched entry) and int4 overflow are confirmed exactly as asserted from
>   documentation; WS2-F26 is confirmed **with a refinement** — the failure is a wire-protocol
>   parameter-count wrap (5,462 × 12 = 65,544 ≡ 8 mod 65,536), not a clean rejection, and it
>   can never mis-bind silently because the wrapped count is strictly below the statement's
>   placeholder count. The three probes are CHARACTERIZATION tests that step 23 inverts.
>   Also: `scripts/audit-cron.ts` gains a runtime-log coverage + correlation section, guarded
>   on `to_regclass` (0029 is unapplied to production, #111) and additive by construction —
>   an absent or empty `runtime_logs` changes no verdict. No deploy, no environment change,
>   no production write, no migration, no candidate model.
>   Record: `docs/reviews/RELIABILITY-PROOFS-2026-09-06.md`.

### For step 27 (the operator deploy) and WS-3.6 (the soak)

- The audit script now reports runtime-log coverage as a **number**, which is what the
  LOG-DRAIN report asked WS-3.6 to do rather than assert. Before the drain is registered it
  prints "no drain registered yet" and no verdict changes — so running `audit-cron` is safe
  and informative at every point in the enablement order.
- A2's ordering still binds: the migration must be applied before the drain is *registered*.
  This step confirms 0029 applies cleanly and additively on a fresh fork, and that the
  `claim_must_have_source` trigger survives it.

### Prompt rewrites recommended

- **Step 21's own prompt** (for the record): the test-only cap-seam fallback in "Prompt
  shape" item (1) can be struck — it was not needed, and the note "seeding 75K+ rows may
  exceed the hook timeout" is wrong in practice (5.7 s server-side for 75,100 rows).
- **Step 23's prompt** should name the G5 describe by file and title and state that its
  three cases are to be *inverted*, not deleted, and should carry the measured 5,461/5,462
  boundary.
