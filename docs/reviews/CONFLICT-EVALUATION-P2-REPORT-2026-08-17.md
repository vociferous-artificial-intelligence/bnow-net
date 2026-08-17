# Phase 2 — reference reports, editions, and repository (implementation report)

Branch `codex/conflict-evaluations-p2-reference` (from the Phase-1 merge
`8fe9288`). Phase 2 ships PURE domain modules + a repository contract with two
backends and DISPOSABLE integration DDL only — **no numbered migration, no
cron, no route, no public UI, no edit to the frozen validation stack**.
Durable DB wiring is deferred to the operator-selected integration phase
(`docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md`). This report is the
committed author record; it also folds in the Gate-2 remediation round (both
reviewers' findings and their dispositions).

## 1. Files and purposes

- `src/lib/conflicts/editions.ts` — versioned URL→edition-label normalization
  (`isw-edition-norm-v1`; unknown shapes refused, never guessed), the
  `ReferenceEditionRecord` (Phase-1 identity + provider/provenance/treatments/
  parse status + `citationAnchorId`), URL↔key cross-validation, deterministic
  daily-final selection (`designated-final-v1`), and the day-status vocabulary
  + monotone transition rule (`publication_gap` vs `probe_failed`, never
  blurred).
- `src/lib/conflicts/et-time.ts` — pure DST-correct ET wall-clock→UTC
  conversion through the repo's single ET authority (`DISPLAY_TZ`), explicit
  spring-forward/fall-back outcomes, zero server-local reads.
- `src/lib/conflicts/report-extract.ts` — JSON-LD `datePublished` and declared
  "Data Cutoff" extraction (versioned `isw-cutoff-v1`); returns instants/
  booleans/enums ONLY (§5.8 legal boundary); cutoff-after-publication visible
  diagnostic.
- `src/lib/conflicts/evaluation-window.ts` — the frozen §5 window ladder with
  `windowEndSource`, inclusive-END instants, the exclusive report-day rung,
  and both the instant window and derived day span.
- `src/lib/conflicts/reference-repo.ts` — repository contract + the ONE merge
  authority (`mergeEditionRecords`, `nextStoredDayStatus` consumers) + the
  pure in-memory/fixture backend.
- `src/lib/conflicts/reference-repo-sql.ts` — disposable-SQL backend
  (integration tests only; nothing in production imports it), TZ-safe
  `report_date::text` reads, monotone `DAY_STATUS_UPSERT_SQL`.
- `src/integration/sql/conflict-benchmark-reports.sql` (+ its README) —
  disposable DDL: `benchmark_report_editions` (five named CHECKs, three
  unique/partial indexes) and `benchmark_series_days`.
- `src/integration/conflict-reference-repo.itest.ts` — real-Postgres proof on
  a throwaway Neon fork (8 tests; see §5 gates).
- Unit tests: `editions.test.ts`, `et-time.test.ts`, `report-extract.test.ts`,
  `evaluation-window.test.ts`, `reference-repo.test.ts`,
  `reference-repo-sql.test.ts`.
- `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` — the reviewed schema
  decision, EXACT later-migration ops, and the honest deferral list.

## 2. Schema decision (option 3) and rejected options

Chosen: **provider-neutral `benchmark_report_editions` keyed by the domain
`editionKey` + `benchmark_series_days` + a nullable `isw_report_id` adapter
FK** to the citation anchor. Rationale and the two rejections are recorded in
full in the design doc §2; in short:

- **Option 1 (extend `isw_reports`, relax its `(theater, report_date)` unique
  index) — REJECTED**: the frozen validation stack's `reports[0]` read is safe
  only BECAUSE of that index; relaxing it turns production reads into the
  forbidden arbitrary-rows[0] pick and forces every existing consumer to
  become edition-aware at once (largest blast radius despite smallest table
  count).
- **Option 2 (edition child table FK'd to `isw_reports`) — REJECTED (second
  choice)**: additive and loader-safe, but a future non-ISW benchmark has no
  parent row, forcing nullable-FK + duplicated columns that converge on
  option 3 anyway with an extra JOIN, and edition identity becomes
  DB-id-coupled instead of the domain `editionKey`.
- **Option 3 — CHOSEN**: ~351K citations untouched (integration-proven
  byte-identical anchor tuple + registry counts), morning+evening coexist
  under UNIQUE `(edition_key)`, provider-neutral, `isw/load.ts` remains the
  single citation writer, validation-cron discovery unchanged.

## 3. Judgment calls (binding as implemented; each test-pinned)

1. **Edition ordering `designated-final-v1`.** Total order, most-final first:
   designation rank (explicit `true` > undesignated `null` > explicit
   `false`) → label finality rank (`final` 90 > `evening` 50 > `special` 40 >
   `daily` 35 > `plain` 30 > `morning` 20) → `publishedAt` desc nulls-last →
   `cutoffAt` desc nulls-last → `editionKey` asc. Contradictory designation is
   refused in the app AND unrepresentable in the DB (partial unique index).
   Empty sets are refused — a gap/probe-failure is a first-class outcome,
   never fabricated over. A winner that itself carries an explicit
   `designatedFinal === false` is selected deterministically but flagged
   (`winnerExplicitlyNotFinal`) — refusal would make a whole day unavailable
   on a metadata quirk; visibility preserves honesty (Gate-2 m-1).
2. **ET/DST authority.** All ET wall-clock→UTC conversion goes through the
   repo's single authority (`DISPLAY_TZ = America/New_York`) via Intl
   round-trips of explicit epoch candidates; nothing reads a wall clock or the
   server zone. Spring-forward gap times convert to NO instant
   (`nonexistent_local_time`); fall-back ambiguous times resolve to the FIRST
   occurrence (daylight) under a fixed, test-pinned rule with the ambiguity
   reported.
3. **Cutoff pattern rules (`isw-cutoff-v1`).** Label shapes "data cutoff"/
   "data cut-off" joined by `:`/`at`/`as of`; tags/entities may sit between
   label and time. A PRIOR-report reference is excluded by a WORD-based guard
   over tag-stripped, entity-collapsed text: any of the preceding five words
   equal to last/previous/prior (Gate-2 m-2 — the earlier raw-16-char guard
   was markup-defeatable, a systematic window-WIDENING direction). Undated
   declarations anchor to the report date's ET day; an explicit
   "on <Month> <D>[, <YYYY>]" is honored within [reportDate − 7d, reportDate];
   a YEARLESS date tries {Y, Y−1} and accepts only the UNIQUE in-range
   candidate — anything else is malformed, never guessed.
4. **Asymmetric conflict policy.** `datePublished`: the FIRST valid
   declaration is used (production-compatible) and disagreement is a VISIBLE
   `conflicting: true` flag. Declared cutoff: two valid disagreeing
   declarations FAIL CLOSED (`conflicting` outcome → next window rung) —
   there is no production first-match precedent to stay compatible with, and
   picking one would silently choose a window. A malformed copy beside one
   clean value lets the clean value stand (rendering artifact, not a second
   declaration).
5. **Canonical-ISO normalization.** `parseEditionRecord` canonicalizes both
   anchors to the UTC `toISOString` form, so equal instants are BYTE-identical
   regardless of declared offset spelling — DB round-trips and in-memory
   records serialize identically and hash/merge equality never depends on
   formatting.
6. **Merge visibility rules.** Replays repair and never downgrade (parse rank
   `pending < failed < parsed`; a present anchor is never demoted);
   null→value fills are named repairs (`repairedFields`); a present→present
   anchor move sets `anchorChanged` (visible, never silent);
   `canonicalUrl`/`citationAnchorId` may fill in but a differing non-null
   value is a typed `edition_merge_conflict` (URL equality deliberately
   byte-level — canonicalization deferral recorded); designation flips are
   visible repairs and null never erases a designation.

## 4. Residual risks and adjudicated dispositions

Residual risks (a)–(i) — committed here (previously enumerated only in the
author's session report, which the DB review correctly flagged as existing in
no committed artifact):

- (a) **Durable migration proof deferred.** The disposable
  `CREATE TABLE IF NOT EXISTS` DDL on a throwaway fork cannot certify the real
  migration's apply-once/reapply-idempotent behavior under `scripts/migrate`;
  proven only when the numbered migration exists on the integration base.
- (b) **Concurrent-writer hardening unproven.** The SQL backend is
  read-merge-write with an `ON CONFLICT DO NOTHING` insert guard — correct
  single-writer; the durable path needs a transaction with
  `SELECT … FOR UPDATE` or a CASE-guarded `ON CONFLICT DO UPDATE` semantically
  identical to `mergeEditionRecords`.
- (c) **Insert+clear pair not transactional.** The single-writer erasure
  window (clear-before-insert destroying a stored `probe_failed` row on a
  failed insert) was closed by insert-then-clear ordering
  (regression-pinned); a crash BETWEEN the two statements can still leave a
  day row beside an edition — inert and self-healing (see dispositions) — and
  the durable upsert must wrap the pair in ONE transaction. Constraint
  violations currently surface as raw driver errors; the durable backend
  should type them.
- (d) **Discovery/sync seam unwired.** The frozen validation stack is
  untouched; edition rows come only from tests/fixtures until the integration
  phase, so the `isw_report_id` adapter link is exercised but not
  production-populated.
- (e) **Aggregation policy limited to `designated-final-v1`.** Score-each-
  edition is representable but unimplemented and unclaimed.
- (f) **Normalization is versioned to OBSERVED slug shapes.** A new ISW URL
  shape is a typed refusal, never a guessed label — correct, but an
  unmonitored integration seam could silently under-discover; adapter-level
  surfacing of refusals is integration-phase work.
- (g) **Backend divergence on cross-key `canonical_url` uniqueness.**
  DB-level only (partial unique index); the in-memory backend accepts the
  same sequence. Asserted honestly in the itest, recorded in the design §5,
  narrowed by the URL↔key cross-validation for current-normVersion records.
- (h) **Driver date parsing is host-TZ-sensitive.** Closed for `report_date`
  (`::text` casts + local-accessor `toIsoDay`, unit- and TZ=Asia/Tokyo-
  proven), but the discipline must be repeated for any future `date` column
  read in this module; `timestamptz` reads are safe (epoch round-trip).
- (i) **Cutoff extraction is a versioned heuristic.** Recall against future
  ISW copy edits is unproven; the five-word prior-reference window can
  false-EXCLUDE a genuine declaration preceded by an unrelated
  last/previous/prior — which falls a rung VISIBLY (`windowEndSource`). A
  rung-fall typically WIDENS the window END (publication and report-day ENDs
  trail the declared cutoff, often past UTC midnight), so the failure mode is
  visible-but-widening, never silent (direction corrected per Gate-2
  re-review R-1).

Accepted-as-documented dispositions from the Gate-2 **DB/legal review**:

- **Raced day row is inert + self-healing.** Between `recordDayStatus`'s
  edition-existence check and its insert, an arriving edition can strand a
  day row; it is INERT (`dayStatus` derives `published` from edition existence
  before consulting the row) and SELF-HEALING (any subsequent upsert replay
  clears it). Accepted; the durable transaction (risk c) removes it.
- **NULL-URL fixture rows.** Fixture-provider rows carry NULL `canonical_url`
  and therefore sit outside the partial unique URL index — by design
  (fixture-only; the `…_isw_url` CHECK forces every provider edition to carry
  its URL). Accepted as documented.
- **`derived` jsonb is review-controlled.** Reserved for legal-safe unit
  signatures/hashes (same rule as `isw_reports.derived`); no DB constraint
  claims to enforce the content rule — enforcement is review-level. Accepted
  as documented.

Residual dispositions from the Gate-2 **time/edition/immutability review**:

- (a) **Midnight-END day-span inclusion** is acceptable-as-documented — the
  only convention consistent with the frozen inclusive-END instant rule.
- (b) **Edition records are DISCOVERY METADATA, not as-published results** —
  adjudicated with two carried conditions: (1) persisted evaluation results
  must stamp their window INPUTS (cutoff/published instants alongside
  `windowEndSource`) — binds P4/P5; (2) durable anchor-change journaling per
  the design §5 deferral (`anchorChanged` must not remain a droppable return
  flag).
- (c) **`evening` > `special` finality rank** acceptable: the corpus eras are
  disjoint (two-a-day vs current daily form), the policy is versioned, and
  explicit designation overrides.
- (d) **Fall-back first-occurrence rule** is conservative and flagged
  (`dstAmbiguousFirstOccurrence`).
- (e) **Trailing out-of-range explicit date → malformed** is an acceptable
  false-negative: it falls a window rung visibly rather than guessing a date.

## 5. Gate-2 remediation round (this branch, 2026-08-17)

Pre-gate fidelity fixes `90e8da3` (insert-then-clear ordering + regression
itest) and `651b9d6` (`dayUnavailableReason` typed via the closed union).
Both Gate-2 reviewers then returned FAIL on `651b9d6`; every finding was
remediated in `f90322b`..`c511284` plus this report:

- **MAJOR (both reviewers): host-TZ day shift** — `report_date::text` in every
  SELECT + local-accessor `toIsoDay` (`f90322b`), proven under TZ=Asia/Tokyo.
- **DB MINOR-1/2** — label-grammar + isw-URL CHECKs, designated-final partial
  unique index, mirrored into the recorded ops (`946965c`, `c511284`).
- **DB MINOR-3** — monotone CASE-guarded day-status upsert, exported and
  integration-proven against the deployed statement (`f90322b`, `946965c`).
- **DB MINOR-4** — anchor non-interference upgraded to full-tuple byte
  equality; dead reads made live assertions (`946965c`).
- **DB NOTE-1/2/3/4** — FK NO ACTION rationale + op-5 NOT NULL alignment
  (`c511284`); URL↔key cross-validation with unit tests both ways
  (`4c296c3`); both anchor-consistency CHECK directions exercised
  (`946965c`).
- **Time m-1** — designation rank + `winnerExplicitlyNotFinal` (`4c296c3`).
- **Time m-2** — word-based tag-stripped prior-reference guard; pattern
  version kept at `isw-cutoff-v1` as a pre-merge repair of unreleased code
  (`f2053a9`).

## 6. Gates (exact, on the remediated tree `c511284`)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean |
| lint | `npm run lint` | clean (0 problems) |
| unit | `npm test` | **2,682 passed / 2,682 (199 files)** — pre-remediation branch baseline 2,675/198 + 7 new (2 `toIsoDay`, 3 designation-rank, 1 prior-reference guard, 1 URL↔key), zero regressions |
| clean diff / tree | `git diff --check`; `git status` | clean / clean |
| single itest, host TZ | `npm run test:integration -- src/integration/conflict-reference-repo.itest.ts` (disposable Neon fork, all provider keys blanked, `LLM_DISABLE=1`) | **8 passed / 8** |
| single itest, east of UTC | same with `TZ=Asia/Tokyo` | **8 passed / 8** (3/6 failed here before the MAJOR fix) |
| full integration | `npm run test:integration` | **127 passed / 127 (20 files)** — prior 125/20 + 2 new cases |

Zero paid provider calls, zero production writes, no migration, no env
change, no deploy, no push — branch/worktree only.
