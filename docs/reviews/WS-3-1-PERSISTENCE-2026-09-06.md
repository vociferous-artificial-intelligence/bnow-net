# WS-3.1 persistence — migration 0028 (benchmark report editions); 0029 HELD

## Scope

| | |
|---|---|
| Prompt | `docs/prompts/2026-09-05-48h-13-ws3-1-persistence.md` (step 13 of the 48h program), plus the Handoff rewrite in `docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md` §"Handoff" (COMMON §2.5 makes that text part of the prompt) |
| Lane / worktree | `ws3-conflict` · `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` |
| Branch | `48h/ws3-conflict-20260905-mig-0028-benchmark-editions` (PR 1 = **#63**). **PR 2 was not built — see "Decisions needed".** |
| Base SHA | `origin/main` `29db301127e1d8cd94d132e722be15d99f44971c` (2026-09-06 18:30 ET, "48h program log — CP1 merge queue #50-#56 landed, Wave 2 launched"). The lane branch was fast-forwarded `2203150 → 29db301` before the step branch was cut. |
| Model / effort / mode | Opus / high / plain session with a plan-mode preamble |
| Spend | **$0.** No paid provider call, no production write, no deploy, no env change. Three disposable Neon forks, created and deleted by `scripts/test-integration.sh`. |

**Decision state at the top, because it bounds the deliverable.** The program log
entry this session's base carries says, verbatim: *"No CP1 decision was answered or
inferred by this pass."* Neither `AGENTS.md`'s decision log nor `docs/DECISIONS.md`
nor the INDEX §2 D4 row records an answer to **C1, C4 or C6**. The prompt's own
contingency is explicit in two places — header table (*"if C6 is unanswered, build
0028 only and hold 0029"*) and PLAN-WS-3 §3.1b (*"If C6 is unanswered: ship 3.1a
only and hold this PR"*) — so this session built **0028 only**. C1 is treated as
answered-by-construction only in the narrow sense that the pasted prompt's PR 1
section specifies Option 3 work concretely and was not rewritten; the formal C1
sign-off is still owed and is listed below.

## Built

**PR 1 — `db: migration 0028 — benchmark_report_editions + benchmark_series_days`**
(commit `2a37772`; branch pushed; **PR #63** — https://github.com/vociferous-artificial-intelligence/bnow-net/pull/63).

| File | Change |
|---|---|
| `src/db/schema.ts` | +2 tables, additions only (`git diff` has zero removed lines). `benchmarkReportEditions` (19 columns, 8 named CHECKs, 4 indexes incl. the two partial ones) and `benchmarkSeriesDays` (composite PK + status CHECK). |
| `drizzle/0028_lumpy_dragon_lord.sql` | Generated. 7 statements: 2 `CREATE TABLE`, 1 `ALTER TABLE … ADD CONSTRAINT` (the isw_reports FK), 4 `CREATE [UNIQUE] INDEX`. **Nothing hand-authored** — a second `npm run db:generate` prints "No schema changes, nothing to migrate". |
| `drizzle/meta/_journal.json`, `drizzle/meta/0028_snapshot.json` | Generated. Journal gains exactly one appended entry. |
| `src/db/migrations.test.ts` | +1 additive-shape pin for 0028 (the 0027 pattern at `:66-80`), keeping the "9999 last" pin untouched. |
| `src/lib/conflicts/reference-repo-sql.ts` | Retargeted at the durable tables + the design §5 hardening (below). |
| `src/lib/conflicts/editions.ts` | +`canonicalizeIswUrl` (pure, additive). |
| `src/lib/conflicts/errors.ts` | +2 additive codes: `edition_url_conflict`, `edition_write_contention`. |
| `src/integration/conflict-reference-repo.itest.ts` | Applies the real migrations with `runMigrations(URL)`; +4 new tests; the URL-conflict assertion strengthened to the typed code. |
| `src/integration/sql/conflict-benchmark-reports.sql` | **DELETED** (see below). |
| `src/integration/sql/README.md` | Reduced to a pointer + the standing rule for future disposable DDL. |
| `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` | Status banner + a per-bullet disposition on §5's nine deferrals (5 closed, 1 closed differently, 3 open). The reviewed paragraphs beneath are left verbatim. |
| `AGENTS.md` | ONE standing line corrected in place (`:116`, the `drizzle/` directory-map range `0000–0027` → `0000–0028`) — the single carve-out COMMON §4.7 allows. |
| `docs/PROGRESS.md` | Plan block + Execution bullets. |

### Delete vs pointer (the prompt asked which)

The disposable DDL file is **deleted**, not reduced to a pointer. Keeping a second
copy of a shape that now has a numbered migration is exactly the drift the
`migrations.test.ts` pins exist to prevent, and the itest no longer reads it.
`src/integration/sql/README.md` survives as the standing rule for any future
disposable DDL and records where the shape went. CLAUDE.md's scoped
delete/rename exception is what permits this; it is named in the commit message.

### The design §5 hardening, item by item

1. **Insert + day-row clear in ONE transaction.** `EDITION_UPSERT_SQL` is a single
   data-modifying CTE (`WITH ins AS (INSERT … ON CONFLICT (edition_key) DO NOTHING
   RETURNING id), cleared AS (DELETE FROM benchmark_series_days … RETURNING series)
   SELECT counts`). Both sub-statements run exactly once and commit or roll back
   together, so ordering is no longer load-bearing: a failed insert aborts the
   DELETE with it. Proven on real Postgres by a new itest that issues the
   *deployed* statement with a label-shape violation and shows the stored
   `probe_failed` row surviving.
2. **`SELECT … FOR UPDATE` on the read-merge-write path — closed DIFFERENTLY, and
   this is the one deliberate deviation from the plan's wording.** The repository's
   transport is a bare `QueryFn`: one autocommit statement per call, with no
   transaction handle to hold, so a row lock taken by a `SELECT … FOR UPDATE` would
   be released at statement end and would protect nothing. Instead the UPDATE is a
   **compare-and-swap**: every mutable column is guarded with `IS NOT DISTINCT
   FROM` against the exact value the merge was computed from, and a zero-row result
   means a concurrent writer landed first, so the loop re-reads and re-merges
   (bounded by `MERGE_ATTEMPT_LIMIT = 4`; exhaustion is the typed
   `edition_write_contention`, never a silent last-writer-wins). Because
   `mergeEditionRecords` is monotone and idempotent, the two writers' repairs
   converge to their **union** — the previous unguarded UPDATE over a stale read
   would have destroyed the winner's repair. Pinned twice: a unit test that lands a
   "concurrent" writer between the read and the UPDATE, and an itest that races two
   separate `Pool`s.
3. **Typed constraint errors.** SQLSTATE 23505 on
   `benchmark_report_editions_url_idx` maps to `ConflictDomainError`
   `edition_url_conflict`; the index name stays in the message as the evidence of
   which constraint refused. A unit test pins the constant against the literal that
   `migrations.test.ts` pins in the SQL, so a one-sided rename cannot silently
   revert the typed refusal to a raw driver error.
4. **Anchor-change journal.** A present → DIFFERENT-present anchor move now appends
   `{at, field: "cutoff"|"published", from, to}` (canonical UTC instants only) to
   the new `anchor_journal` column instead of destroying the displaced instant; a
   fill-in (null → value) is a repair, not a move, and journals nothing. The
   derivation is cross-checked against `mergeEditionRecords`'s own `anchorChanged`
   flag and refuses to write if they disagree. Reads fail closed
   (`parseStoredAnchorJournal`): anything that is not exactly an
   `{at, field, from, to}` instant entry — including an extra key carrying a
   sentence — throws. Length-bounded at `ANCHOR_JOURNAL_LIMIT = 50`.
5. **URL canonicalization before storage.** `canonicalizeIswUrl` (https, lowercase
   host without `www.`, lowercase path, exactly one trailing slash, query and
   fragment dropped) runs at the storage boundary before validation, so a
   scheme/`www`/trailing-slash spelling of the SAME edition now replays as
   `unchanged` instead of throwing `edition_merge_conflict` on byte-level merge
   equality. Scoped to `provider === "isw"` on purpose: the table is
   provider-neutral by design and a future provider brings its own canonicalizer
   rather than being forced through an ISW-host one that would refuse it. The
   in-memory backend deliberately still stores raw URLs (recorded divergence).
6. **The monotone day-status rule stays at SQL level.** `DAY_STATUS_UPSERT_SQL` is
   byte-unchanged and still exported so the itest proves the deployed statement.

## Tests

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | **0 errors** (3 pre-existing warnings, all in files this PR does not touch — `src/lib/usage/cron-run.test.ts` and two others) |
| `npm test` | **3,723 → 3,746 over 255 files** (+23; no new test file — the cases land in `reference-repo-sql.test.ts` +17, `editions.test.ts` +5, `migrations.test.ts` +1). Baseline from the INDEX §10 18:30 ET entry ("unit 3,612 → 3,723 (255 files)"). |
| `npm run test:integration -- src/integration/conflict-reference-repo.itest.ts` | **12/12** on fork `br-misty-night-at6upzs6` (an earlier identical run: 12/12 on `br-small-hill-atcivfts`). Log shows `applying 0028_lumpy_dragon_lord.sql (7 statements)` then `migrations up to date`. |
| `npm run test:integration -- src/integration/migrations-atomic.itest.ts` | **3/3** on fork `br-silent-hill-atmu00nh`, including "the REAL drizzle chain stays filename-ordered with 9999 last and is rerun-safe". |
| Spend | **$0** |

**A prompt-acceptance correction:** the acceptance line names
`src/integration/migrations.itest.ts`. No such file exists; the real-Postgres
migration proof is `src/integration/migrations-atomic.itest.ts` (run above), and
0028's own apply/re-apply proof is inside the conflict itest.

New itest cases: (a) the tables come from migration 0028 (`to_regclass` on both,
exactly one `_migrations` marker, a re-apply that changes nothing, and the two
audit columns present and NOT NULL); (b) the one-statement insert+clear rollback;
(c) the anchor journal on a moved cutoff, with a following fill-in journaling
nothing; (d) two `Pool`s racing on one edition converging to the union. All
pre-existing cases were kept, including the honestly-asserted in-memory/SQL
divergence on cross-key `canonical_url` uniqueness and the registry-untouched
count+tuple comparison.

## Rulings touched and how each is satisfied

- **Ruling 1 (no ISW prose).** No prose column exists in either table and the
  migration test asserts none is added (`/"(title|text|summary|body|prose|takeaway)"/`
  must not appear). `derived` is unwritten by this PR and keeps its
  signatures/hashes-only rule; `anchor_journal` holds instants and field names
  only, enforced fail-closed on read by `parseStoredAnchorJournal` and pinned with
  a case whose only fault is an extra key carrying a sentence.
- **Ruling 5 (migration additivity).** Forward-only: one new file, journal appended,
  no applied migration edited, `drizzle/9999_claim_source_trigger.sql` untouched and
  still last (`git diff --stat drizzle/` = `0028_*.sql` + the two meta files, nothing
  else). The additive-shape pin allows only `CREATE TABLE` on the two new tables,
  `CREATE [UNIQUE] INDEX` on the new table, and the FK `ADD CONSTRAINT`; every other
  statement fails it, and a destructive-verb scan runs after stripping the FK's
  `ON DELETE no action ON UPDATE no action` clause (the only place drizzle-kit
  spells those words). No backfill in DDL.
- **Design §4 item 7 (frozen tables).** `isw_reports`, `source_citations`,
  `sources`, `source_theater_stats` and `validation_runs` receive no change of any
  kind: asserted statically in `migrations.test.ts` (no `ALTER|DROP TABLE` naming
  them) and dynamically in the itest (identical registry counts AND a
  byte-comparison of the anchor row's tuple before/after every operation).
- **Ruling 10, 13, 19, 21:** untouched — this PR adds no route, no page, no cron
  bookkeeping and no extractor-version input.
- **Ruling 4 (spend):** no paid call site is added or reached; the tables are inert.

## Citations re-verified

| Cited | Status |
|---|---|
| `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` §2 (:32-87 options), §4 (:121-172 exact migration operations), §5 (deferrals) | correct; §4's column list matches the shipped table exactly, plus the two additive audit columns §4's last paragraph explicitly permits |
| `src/lib/conflicts/reference-repo-sql.ts:131-136` (`DAY_STATUS_UPSERT_SQL`) | correct at base; the constant is byte-unchanged, now at `:181-186` after the header and hardening grew |
| `src/db/schema.ts:150-151` (`isw_reports` two unique indexes) | correct (`isw_reports_url_idx`, `isw_reports_theater_date_idx` at `:150-151`) |
| `src/db/migrations.test.ts:66-80` (the 0027 additive pattern) | correct |
| `scripts/migrations-lib.ts` `runMigrations(URL)` | correct — `:23`, filename-sorted, atomic per file, marker-skipped |
| `src/integration/ask-billing.itest.ts:55` (the "apply migrations yourself" pattern) | correct (`await runMigrations(URL!)` in `beforeAll`) |
| `src/lib/conflicts/eval-profile.ts:401` (`assertPersistableConflictResultV1`) and `scorer.ts:34-39` (the ruling-1 contract comment) | **verified but NOT exercised by this PR** — they belong to migration 0029's writer, which is held |
| `vitest.integration.config.ts` `fileParallelism: false` | correct, and load-bearing: 0028 is the first migration a fork applies during an itest run, so serialized files are what keeps two `runMigrations` calls from racing on the same `CREATE TABLE` |

## Decisions needed

1. **C1 — schema option for reference editions.** *Still formally unanswered.* This
   PR is Option 3 as the prompt and PLAN-WS-3 §3.1a specify. If the operator lands
   C1 as anything other than Option 3, this PR is withdrawn rather than amended.
   **Recommendation: Option 3** (the memo's, on the evidence that Option 1 turns
   `run.ts:123`'s `reports[0]` into an arbitrary same-date pick the day a second
   edition lands).
2. **C6 — observation persistence (blocks 0029).** Unanswered, so **PR 2 was not
   built**. Options: (a) overwrite-on-revalidate, UNIQUE `(conflict_id,
   reference_edition_id)`; (b) append-only, no overwrite path, headline derived at
   read time. **Recommendation: (b)**, the memo's — the shadow soak is graded on
   verdict flips across ≥3 independent runs of the same days, and an overwrite key
   destroys exactly the variance instrument `runGroupKey` exists to group. The
   Handoff below carries the full 0029 shape under (b) and states precisely what
   changes under (a), so the follow-up session is a build, not a re-design.
3. **C4 — edition policy.** Not schema-blocking for 0028: `designated_final` and the
   partial unique `(series, report_date) WHERE designated_final` are the design's,
   and they hold under (a) *and* (b) of C4. It blocks step 14's discovery and the
   0029 scoring path. **Recommendation: (a)** — store every edition, score the
   daily-final winner.
4. **C3 / C7 / C13 columns** (`unit_attribution`, `gazetteer_version`,
   `unit_flags_version`) ride 0029 and are unanswered with it.
5. **D10 (migration numbering).** 0028 is claimed. If step 16's `runtime_logs`
   merges first, 0029 becomes 0030 at rebase time; nothing in this PR depends on
   the number.

## Debt and risks

- **0029 is not built.** Steps 14 (rebases onto 0028's names — those are final and
  listed below), 19 and 24 are unblocked only for the edition half.
- **The `edition_write_contention` refusal is a real, reachable terminal state.**
  Four lost CAS rounds on one edition throws instead of writing. Under the
  single-writer discovery cron this is unreachable; it is a fail-closed choice over
  an unbounded retry loop, and the loop bound is test-pinned.
- **The journal/merge disagreement guard is unreachable by any current input** — it
  fires only if `anchorJournalEntriesFor` and `mergeEditionRecords` ever disagree
  about what a present→present move is. It is defensive and deliberately untested;
  no test can construct the disagreement without mocking the merge authority.
- **`benchmark_report_editions_final_idx` violations still surface as raw driver
  errors** (only the URL index is typed, per the plan's wording). The itest asserts
  the raw index name. Worth typing when C4 lands, since designation is exactly what
  C4 governs.
- **In-memory vs SQL divergence widens by one item**: the SQL backend canonicalizes
  URLs, the in-memory backend does not. Asserted and commented, not hidden. The
  pre-existing cross-key `canonical_url` uniqueness divergence is unchanged.
- **New forks now apply 0028 during integration runs.** `fileParallelism: false`
  makes that safe today; a future change to that setting would make two itests race
  on the first application of any new migration.
- **`anchor_journal` is capped at 50 entries** — an anchor that flapped more than 50
  times loses its oldest moves. Anchor moves are exceptional by construction (a
  present→present move is already a visible repair).

## Handoff

### Final table and column names (steps 14, 19 and 24 import these)

`benchmark_report_editions` — `id`, `series`, `provider`, `edition_key`,
`edition_label`, `report_date`, `canonical_url`, `norm_version`, `scope_version`,
`cutoff_at`, `published_at`, `cutoff_treatment`, `published_treatment`,
`designated_final`, `parse_status`, `isw_report_id`, `derived`, `created_at`,
`anchor_journal`.
Indexes: `…_key_idx` UNIQUE `(edition_key)`; `…_url_idx` UNIQUE `(canonical_url)
WHERE canonical_url IS NOT NULL`; `…_series_date_idx` `(series, report_date)`;
`…_final_idx` UNIQUE `(series, report_date) WHERE designated_final`.
CHECKs: `…_key_shape`, `…_cutoff_consistent`, `…_published_consistent`,
`…_label_shape`, `…_isw_url`, `…_cutoff_treatment_check`,
`…_published_treatment_check`, `…_parse_status_check`.

`benchmark_series_days` — `series`, `report_date`, `status`; PK `(series,
report_date)`; CHECK `benchmark_series_days_status_check`.

Drizzle exports: `benchmarkReportEditions`, `benchmarkSeriesDays` (`src/db/schema.ts`).

New repository surface (`src/lib/conflicts/reference-repo-sql.ts`):
`new SqlReferenceReportRepository(query, { now?, mergeAttemptLimit? })`;
`upsertEdition`, `getEdition`, `editionsForDay`, `recordDayStatus`, `dayStatus`
(unchanged signatures) and the new
`anchorJournal(editionKey): Promise<readonly AnchorJournalEntry[]>` read model.
Exported constants for tests and callers: `EDITION_SELECT`, `EDITION_MERGE_SELECT`,
`EDITION_UPSERT_SQL`, `DAY_STATUS_UPSERT_SQL`, `EDITION_URL_INDEX`,
`MERGE_ATTEMPT_LIMIT`, `ANCHOR_JOURNAL_LIMIT`, `anchorJournalEntriesFor`,
`parseStoredAnchorJournal`. New pure export in `editions.ts`: `canonicalizeIswUrl`.
New error codes: `edition_url_conflict`, `edition_write_contention`.

### For the session that builds 0029 (do NOT start it before C6 is signed)

Build PLAN-WS-3 §3.1b verbatim on branch
`48h/ws3-conflict-20260905-mig-0029-conflict-observations`, cut from this PR's
branch (or from `main` after it merges), claiming the next free migration number at
rebase time. Under **C6 = (b), append-only** the keys are: partial UNIQUE
`(conflict_id, reference_edition_id, cron_run_id) WHERE cron_run_id IS NOT NULL`;
index `(conflict_id, report_date DESC, observed_at DESC)`; index `(run_group_key)`;
`cron_run_id integer REFERENCES cron_runs(id)`; `observed_at timestamptz NOT NULL
DEFAULT now()`; **no** unique key on `(conflict_id, reference_edition_id)` alone and
**no** overwrite path anywhere. Under **C6 = (a), overwrite-on-revalidate** the delta
is: UNIQUE `(conflict_id, reference_edition_id)`, an `ON CONFLICT DO UPDATE` in
`persistObservation`, and `cron_run_id` demoted to provenance — and the soak's
across-run variance instrument must then be re-planned, because repeated runs of one
day would no longer leave separate rows.

Everything else in §3.1b is C6-independent and can be lifted as written: the column
list, `reference_edition_id integer NOT NULL REFERENCES benchmark_report_editions(id)`
(the FK target is now durable and its name is final), `observation-store.ts`
(`persistObservation` calling `assertPersistableConflictResultV1`
(`src/lib/conflicts/eval-profile.ts:401`) first and refusing non-`retrospective`
kinds and any `fixture-oracle` rung; `latestObservationsFor`), the additive
`withCronRun(job, (counts, runId) => …)` second callback argument
(`src/lib/usage/cron-run.ts`; the run id is already held at `cron-run.ts:182`), and
the schema test that every column is id/number/enum/instant/text-version/jsonb-of-ids.
Copy this PR's `migrations.test.ts` pin shape — including the FK-clause strip before
the destructive-verb scan, which a `REFERENCES cron_runs(id)` column will need too.

### Prompt rewrites this report earns

- **`docs/prompts/2026-09-05-48h-13-ws3-1-persistence.md`** — replace the acceptance
  line's `src/integration/migrations.itest.ts` with
  `src/integration/migrations-atomic.itest.ts` (the named file does not exist), and
  note that PR 1 is done so a re-run of this step is PR 2 only.
- **`docs/prompts/2026-09-05-48h-14-ws3-2-edition-discovery.md`** — the 0028 names
  above are final; the discovery adapter should call `canonicalizeIswUrl` before
  handing a record to the repository (or rely on the repository doing it, which it
  now does for `provider: "isw"`), and it may use `anchorJournal()` for the
  anchor≠final measurement C5 asks step 14 to take.

### Proposed AGENTS.md changes (step 25 applies; this PR made only the one carve-out edit)

1. **Applied here, in place (the carve-out):** `AGENTS.md:116` directory map,
   `drizzle/  migrations 0000–0027` → `0000–0028`.
2. **Proposed, not applied:** directory map at `AGENTS.md:87-89`, the
   `src/lib/conflicts/` entry — after this PR "pure — no DB/provider/env" is wrong
   for one file (`reference-repo-sql.ts` now targets the durable 0028 tables; it was
   already SQL-shaped, but against disposable DDL). It is left for step 25 because it
   is not the line THIS PR makes wrong in the mechanical sense the carve-out covers.
   Before (`:87-89`, verbatim):
   `src/lib/conflicts/  conflict/region validation domain library (71 files, pure — no DB/`
   `                    provider/env; CONFLICT_REGISTRY, lanes, scorer, match-contract);`
   `                    imported by nothing in production (design docs in docs/designs/)`
   After:
   `src/lib/conflicts/  conflict/region validation domain library (71 files, pure except`
   `                    reference-repo-sql.ts — the Postgres backend for migration 0028's`
   `                    benchmark tables; CONFLICT_REGISTRY, lanes, scorer, match-contract);`
   `                    imported by nothing in production (design docs in docs/designs/)`
3. **Proposed decision-log entry** (append at the BOTTOM, after the operator signs C1):

   > **2026-09-06 (WS-3.1 — migration 0028: durable benchmark report editions;
   > branch/PR only)** Schema option 3 of
   > `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` §2 was promoted from
   > disposable integration DDL into `src/db/schema.ts` and **migration 0028**
   > (`benchmark_report_editions` + `benchmark_series_days`), generated entirely by
   > `drizzle-kit` with no hand-authored statement, plus the two additive audit
   > columns §4's last paragraph permits (`created_at`, a bounded `anchor_journal`).
   > `isw_reports`, `source_citations`, `sources`, `source_theater_stats` and
   > `validation_runs` receive no change of any kind — proven statically in
   > `migrations.test.ts` and dynamically on a fork by identical registry counts
   > plus a byte-comparison of the anchor row's tuple. `9999_claim_source_trigger.sql`
   > is untouched and still last. The design's §5 deferrals close with the durable
   > backend: insert + day-row clear are ONE data-modifying CTE; the read-merge-write
   > path is a bounded compare-and-swap (NOT `SELECT … FOR UPDATE` — the repository's
   > `QueryFn` transport is autocommit-per-statement, so a row lock would release at
   > statement end), which makes two writers' repairs converge to their union instead
   > of one overwriting the other; a `canonical_url` partial-unique violation maps to
   > the typed `edition_url_conflict`; a moved anchor appends an `{at, field, from,
   > to}` instant entry to `anchor_journal` instead of destroying the displaced
   > instant, with fail-closed reads; URLs are canonicalized before storage for
   > `provider: "isw"`. The disposable DDL file was DELETED (CLAUDE.md scoped
   > exception) and the itest now applies the real migrations with `runMigrations()`,
   > which is also the apply-once/reapply-safe proof the design recorded as a later
   > gate. **Migration 0029 (`conflict_validation_observations`) was NOT built:
   > decision C6 is unanswered and both the step prompt and PLAN-WS-3 §3.1b say to
   > ship 3.1a alone in that state.** Gates: typecheck/lint clean · unit 3,723 →
   > 3,746 (255 files) · `conflict-reference-repo.itest.ts` 12/12 and
   > `migrations-atomic.itest.ts` 3/3 on disposable Neon forks. Both tables are
   > additive and start empty; nothing in production imports the conflict layer; no
   > deploy, no env/cap change, no production write, no paid call, $0. Report:
   > `docs/reviews/WS-3-1-PERSISTENCE-2026-09-06.md`.
