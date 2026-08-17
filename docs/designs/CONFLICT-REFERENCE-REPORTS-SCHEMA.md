# Conflict reference reports & editions — schema/API design (Phase 2)

Conflict-evaluations workstream, Phase 2 (2026-08-17). Binding inputs:
`docs/designs/CONFLICT-REGION-EVALUATION.md` §9 (reference series, editions,
discovery), §5 (evaluation-window ladder), §12 (migration posture); prompt
§10; decision register #1–#10. This document records the reviewed schema
choice and the EXACT later migration operations. **This workstream ships NO
numbered Drizzle migration**: the only SQL is disposable test DDL
(`src/integration/sql/`, see its README), and durable DB wiring is
**DEFERRED to the operator-selected integration phase**.

## 1. The constraint that forces a design

`isw_reports` carries TWO unique indexes: `(url)` AND `(theater,
report_date)` (`src/db/schema.ts:149-152`). One row per theater/date means
the table cannot represent two same-date editions (Iran morning + evening
updates exist in the observed corpus: 17 evening + 13 morning slugs), and
`validation/run.ts` reads `reports[0]` of that theater/date query — safe
today only BECAUSE the unique index guarantees a single row. Meanwhile
`source_citations.report_id` FKs `isw_reports.id` (~351K rows) and
`src/lib/isw/load.ts` is the single citation-upsert authority keyed BY id.
Any design must keep every citation row and both loaders untouched.

## 2. Options compared (the three mandated)

Criteria: (a) preserves ~351K citations with zero destructive rewrites;
(b) >1 edition per series/date despite the two-unique-index trap;
(c) future non-ISW benchmark; (d) smallest additive footprint;
(e) `isw/load.ts` stays the single citation-upsert authority;
(f) validation cron's slug-probe discovery keeps working unchanged.

### Option 1 — extend `isw_reports` via a forward migration

Add `edition_label`, `cutoff_at`, `published_at`, … and REPLACE the unique
`(theater, report_date)` with `(theater, report_date, edition_label)`.

- (a) FAIL-adjacent: the citation rows survive, but relaxing the unique
  index retroactively changes the meaning of every existing consumer.
  `run.ts` `SELECT … WHERE theater=$1 AND report_date=$2` then `reports[0]`
  becomes EXACTLY the forbidden "arbitrary same-date rows[0]" the moment a
  second edition lands — the frozen validation stack would need edits
  (freeze-list violation) or would silently pick an unordered row.
- (b) only by weakening the constraint that production correctness
  currently leans on. (c) poor: theater-keyed, ISW-shaped. (d) smallest in
  table count but LARGEST in blast radius. (e/f) violated in spirit: every
  existing reader must become edition-aware at once.
- REJECTED.

### Option 2 — additive edition child table FK'd to `isw_reports`

`isw_report_editions(report_id FK, edition_label, cutoff_at, …)`; the
parent row stays the one-per-theater/date citation anchor.

- (a) PASS (purely additive). (b) PASS: editions are children. (e/f) PASS:
  loaders untouched. (d) small.
- (c) FAIL: a future non-ISW benchmark has no `isw_reports` parent — the
  child would need a nullable FK plus duplicated series/date columns,
  converging on option 3 anyway with an extra JOIN and an ISW-shaped
  dependency baked into the conflict layer's primary key path. Edition
  identity also becomes DB-id-coupled (`report_id` + label) rather than the
  domain `editionKey`, so fixture/DB parity needs translation both ways.
- REJECTED (second choice).

### Option 3 — provider-neutral benchmark-report table + ISW adapter (CHOSEN)

One new table `benchmark_report_editions` keyed by the domain `editionKey`
(`<series>:<reportDate>:<label>`), one small `benchmark_series_days`
day-status table, and a **nullable** `isw_report_id` FK as the ISW adapter
link to the citation anchor.

- (a) PASS: `isw_reports`, `source_citations`, `sources` are not touched at
  all — proven by the integration test's before/after registry-count
  equality (`conflict-reference-repo.itest.ts`).
- (b) PASS: UNIQUE `(edition_key)` — morning+evening coexist; a DB CHECK
  pins `edition_key = series:report_date:edition_label` so the triple can
  never drift from the key.
- (c) PASS: `series` + `provider` columns are provider-neutral; an ISW
  edition is just `provider='isw'` with a link row.
- (d) PASS: two tables, three indexes, zero altered existing objects.
- (e) PASS: `isw/load.ts` remains the only writer of citations; the new
  table only ever REFERENCES `isw_reports.id`.
- (f) PASS: the validation cron keeps probing slugs and upserting its ONE
  `isw_reports` row per theater/date; a later sync (integration phase) can
  register each discovered URL as an edition row and link it. Discovery
  never has to move before the conflict surface needs it.
- **CHOSEN.**

## 3. Domain/API layer (implemented in this phase, pure)

- `src/lib/conflicts/editions.ts` — versioned URL→label normalization
  (`isw-edition-norm-v1`: `special`/`evening`/`morning`/`plain` for
  `iran_update`, `daily` for `roca`; unknown shapes REFUSED, never guessed;
  covers every probe URL `run.ts` can generate — test-pinned against the
  production builders); `ReferenceEditionRecord` (Phase 1
  `ReferenceReportIdentity` + provider/provenance/treatments/parse status +
  `citationAnchorId`); deterministic daily-final selection
  (`designated-final-v1`: explicit designation → label finality rank →
  publishedAt desc → cutoffAt desc → editionKey asc; TOTAL, test-pinned,
  fixture cc-editions-001); day statuses (`publication_gap` CONFIRMED vs
  `probe_failed`, never blurred — the 2026-08-15 lesson).
- `src/lib/conflicts/et-time.ts` — pure DST-correct ET wall-clock→UTC via
  the repo's `DISPLAY_TZ` authority; spring-forward gap and fall-back
  ambiguity are explicit outcomes.
- `src/lib/conflicts/report-extract.ts` — JSON-LD `datePublished` (≥ the
  production regex; timezone-less values are malformed, never server-local)
  and the declared "Data Cutoff:" ET time (versioned `isw-cutoff-v1`;
  prior-report references excluded; conflicting declarations fail closed);
  returns instants/booleans/enums ONLY (legal §5.8); includes the
  cutoff-after-publication ordering diagnostic (visible, non-rejecting).
- `src/lib/conflicts/evaluation-window.ts` — the frozen §5 ladder with
  `windowEndSource`, inclusive-END instants, the exclusive report-day rung,
  and BOTH the instant window and derived day span (day-granularity rule in
  the API; fixture cc-window-rung2-017 pinned).
- `src/lib/conflicts/reference-repo.ts` / `reference-repo-sql.ts` — ONE
  repository contract, two backends (pure in-memory/fixture; disposable
  SQL), both through the single merge authority: replays repair
  (missing→present anchors, parse upgrades, gap rows cleared by an arriving
  edition) and never duplicate or downgrade; identity-grade conflicts
  (URL/anchor-id/provider/scope) are typed errors.

## 4. EXACT later migration operations (recorded now, executed later)

To be generated as ONE forward Drizzle migration on the operator-selected
integration base (after all concurrent schema work is known), preserving
`9999_claim_source_trigger.sql` as the last-applied file:

1. `CREATE TABLE benchmark_report_editions` — columns exactly as in the
   disposable DDL `src/integration/sql/conflict-benchmark-reports.sql`:
   `id serial PK; series text NOT NULL; provider text NOT NULL;
   edition_key text NOT NULL; edition_label text NOT NULL;
   report_date date NOT NULL; canonical_url text NULL;
   norm_version text NULL; scope_version text NOT NULL;
   cutoff_at timestamptz NULL; published_at timestamptz NULL;
   cutoff_treatment text NOT NULL CHECK (present|missing|malformed_treated_as_missing);
   published_treatment text NOT NULL CHECK (same);
   designated_final boolean NULL;
   parse_status text NOT NULL DEFAULT 'pending' CHECK (pending|parsed|failed);
   isw_report_id integer NULL REFERENCES isw_reports(id);
   derived jsonb NOT NULL DEFAULT '{}'` plus the three named CHECKs
   (`…_key_shape`, `…_cutoff_consistent`, `…_published_consistent`).
2. `CREATE UNIQUE INDEX benchmark_report_editions_key_idx (edition_key)`.
3. `CREATE UNIQUE INDEX benchmark_report_editions_url_idx (canonical_url)
   WHERE canonical_url IS NOT NULL` (partial: fixture rows carry NULL).
4. `CREATE INDEX benchmark_report_editions_series_date_idx (series,
   report_date)`.
5. `CREATE TABLE benchmark_series_days (series text, report_date date,
   status text CHECK (publication_gap|probe_failed), PRIMARY KEY (series,
   report_date))`.
6. NO change of any kind to `isw_reports`, `source_citations`, `sources`,
   `source_theater_stats`, `validation_runs`, or any other existing object.
   No backfill in the migration itself (an optional idempotent backfill of
   edition rows from existing `isw_reports` urls via
   `normalizeIswEditionUrl` is an operator script decision, not DDL).

`derived` is reserved for legal-safe unit signatures/hashes only (same rule
as `isw_reports.derived`); no prose column exists and none may be added.
There are no `created_at`/`updated_at` columns in the disposable DDL; the
integration-phase migration may add audit timestamps if the operator wants
them (additive, default `now()` — DB-side provenance, not domain input).

## 5. Deferred to the later integration gate (recorded honestly)

- **Final migration uniqueness/idempotency proof.** The disposable DDL
  (`CREATE TABLE IF NOT EXISTS` on a throwaway fork) CANNOT certify the
  real migration's apply-once/reapply-safe behavior under
  `scripts/migrate` semantics; that proof happens when the numbered
  migration exists, on the integration base.
- **Concurrent-writer hardening.** The SQL backend is read-merge-write with
  an `ON CONFLICT DO NOTHING` insert guard — correct for single-writer
  discovery and integration tests, NOT proven under concurrent upserts.
  The durable path should either wrap upserts in a transaction with
  `SELECT … FOR UPDATE` or move the merge rules into a CASE-guarded
  `ON CONFLICT DO UPDATE`; either must stay semantically identical to
  `mergeEditionRecords` (the tests to reuse are already written).
- **Upsert atomicity + typed constraint errors.** The first disposable
  backend cleared the `benchmark_series_days` row BEFORE the edition
  insert, so a failed insert (e.g. a `canonical_url` duplicated from
  another day hitting the partial unique index, or a transient DB error)
  erased a stored `probe_failed` discovery record even single-writer; the
  window was closed by insert-then-clear ordering (regression-pinned in
  the itest). The durable integration-phase upsert must still wrap the
  insert + clear pair in ONE transaction — concurrent-writer hardening
  remains deferred (previous bullet). Separately, partial-unique
  `canonical_url` violations currently surface as raw driver errors from
  the disposable backend; the durable backend should map them to typed
  domain errors.
- **Discovery/sync seam.** Wiring the validation cron's discovered URLs
  into edition rows (and linking `isw_report_id`) is integration-phase
  work; the frozen validation stack is not edited by this phase. A
  feed/index-backed discovery source (preferred by §9 over
  date-to-one-slug construction) plugs in as a future provider adapter
  producing the same `ReferenceEditionRecord`s.
- **Multi-edition aggregation policy beyond designated-final.** The
  implemented policy is `designated-final-v1` (select ONE edition). The
  contract's alternative (score each edition separately) is representable
  (each edition is one observation) but no aggregate-dedup method is
  implemented or claimed.

## 6. Compatibility statements (verified in this phase)

- `npm test` unit suite: 2,598 baseline tests untouched and green; the
  conflicts package adds its own (fixture-pinned) tests.
- The integration test proves: two same-date `iran_update` editions coexist
  while `isw_reports` holds zero rows for that date (the trap sidestepped);
  registry counts (`isw_reports`/`source_citations`/`sources`/
  `source_theater_stats`) identical before/after every repository
  operation; the anchor row's `parse_status` never written by the repo.
- `normalizeIswEditionUrl` accepts every URL `iswUrlForDate` /
  `iranUpdateUrlCandidatesForDate` can emit (test-pinned against the real
  exports of the frozen `run.ts`).
