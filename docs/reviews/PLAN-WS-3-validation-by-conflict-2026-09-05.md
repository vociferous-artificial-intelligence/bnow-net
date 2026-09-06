# PLAN-WS-3 — Validation by conflict (WS-3.1 → WS-3.5 + WS-3.6 prep), PR by PR

| | |
|---|---|
| Step | 05 of the 48h program (`docs/prompts/2026-09-05-48h-05-plan-ws3-conflict.md`), handoff §0 item 2 |
| Model / effort / mode | Fable / xhigh / plan mode — planning only |
| Worktree / branch | `48h-ws3-conflict-20260905` · `48h/ws3-conflict-20260905-step05-ws3-plan` |
| Base | `origin/main` `dff58f2` |
| Companion | `docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md` (C1–C14, N1–N3 — cited below as "memo Cn") |
| Executes in | steps 13 (3.1a/3.1b), 14 (3.2a/3.2b), 19 (3.3a/3.3b/3.4b), 24 (3.5a/3.6-prep) |
| Spend | $0 for every PR. Fork itests on disposable Neon branches. Nothing deploys, schedules, or flips a flag. |

## 1. Goal and non-goals

**Goal.** By the end of the window, `main` holds — inert, reviewed, fork-proven — everything a
report-only conflict shadow soak needs except its operator gates: durable edition/observation
tables (0028/0029), series-aware edition discovery, an unscheduled `conflict-validate` cron,
DB-backed evidence sources, the live observation pipeline with the keyword rung and an inert
paid rung, a DB-backed conflict view behind `CONFLICTS_UI`, the country-row relabel, and the
enablement checklist with the five blockers dispositioned.

**Non-goals (this window).** Scheduling the cron; setting any cap env or flag; any production
write (N2/N3 are operator runs); the shadow soak itself (WS-3.6); cutover / validation-v4
(WS-3.7); multi-theater N:M tagging (WS-3.8, #37); the pre-soak `conflict-epoch-2` PR
(assessment class, independence relabel, ordinals + canonical URL in the profile,
`compound-v1`); changing the production `validate` job, `validation_runs`, `/scoreboard`
numbers, digests, dedup, or source routing; any edit under `docs/evals/analysis/`.

## 2. Current state (verified at `dff58f2`)

- Production unit and its defects: memo §1 (`route.ts:24`, `run.ts:45-57`, `:83-122`,
  `:152-167`, `:176-187`, `:219-226`; `schema.ts:151`, `:325`).
- Domain library, pure and dormant: `src/lib/conflicts/` — registry (`definitions.ts:96-129`),
  lanes, editions + daily-final selection (`editions.ts`), window ladder
  (`evaluation-window.ts`), eligibility (8 predicates, `eligibility.ts`), assemblies with the
  binding real-backend query contracts (`evidence-assembler.ts:150-244`), 40% mix cap
  (`evidence-selection.ts:46`), matcher contract + ladder (`match-contract.ts:259-282`),
  keyword rung (`keyword-matcher.ts`), live-compatible adapter with an INJECTED vote function
  (`llm-compatible-matcher.ts:46-73`), pure scorer producing `ConflictResultV1`
  (`scorer.ts:371-671`) gated by `assertPersistableConflictResultV1` (`eval-profile.ts:401-497`),
  the disposable-SQL repository (`reference-repo-sql.ts`), fixture product view
  (`product-view.ts`), feature flag (`feature.ts:24-36`), soak instruments.
- Import isolation both ways, confirmed: nothing in `src/lib/validation`, `src/lib/isw`,
  `src/app/api/cron` imports `src/lib/conflicts`; the conflict library imports the validation
  EXPORTS only (`match-contract.ts:45-49`, `llm-compatible-matcher.ts:25-26`,
  `keyword-matcher.ts:36-42`). `llmMatchOnce` is private (`llm-match.ts:100`).
- Migrations: `drizzle/0000…0027` + `9999_claim_source_trigger.sql` last; journal idx 27;
  `migrations.test.ts:60-63` pins 9999 last, `:66-81` is the 0027 additive-shape pattern;
  `migrations-lib.ts:23-66` applies files atomically per file. `drizzle-kit` 0.31 emits CHECK
  (`schema.ts:472` → 0020) and partial indexes (`schema.ts:716` → 0023).
- Scoreboard: public, ungated, sitemap-listed (memo C10). Conflict routes: 404 before data
  access with the flag absent; evidence route gate order pinned (`evidence/page.tsx:32-33`).
- Blockers on record for the soak: landing §6 (:92-101); register #12; P7 §5.2 (:482-591);
  audit F-NEW-1 / F-NEW-6 / R-M-6.
- Step 06 (concurrent, `48h-ws3-gazetteer`) delivers `src/lib/validation/gazetteer/`
  (`ru-ua-v1` verbatim, `iran-levant-v1`, `gazetteerFor(series|conflictId)` with a `version`)
  and the keyword-rung `insufficient_data` diagnostic.

## 3. The PRs

Conventions for every PR: step branch `48h/<worktree>-20260905-<slug>` (dash form); plan-mode
preamble as the step prompt says; `npm run typecheck && npm run lint && npm test` green
before every commit; migration/DB PRs run their itests on a named disposable fork and report
the numbers; PR body mirrors Built / Tests / Rulings; AGENTS.md untouched except the single
standing line a PR makes wrong; OPEN-TASKS status lines only. Column and API names below are
the ones later steps import — change them only with a note in the closing report's Handoff.

### 3.1a — `db: migration 0028 — benchmark_report_editions + benchmark_series_days (promote disposable DDL)`

Step 13 · `48h-ws3-conflict` · branch `…-mig-0028-benchmark-editions` · blocked on **C1**.

**Files.** `src/db/schema.ts` (+2 tables), `drizzle/0028_<name>.sql` + `drizzle/meta/*` (generated),
`src/lib/conflicts/reference-repo-sql.ts` (retarget + §5 hardening), `src/lib/conflicts/errors.ts`
(+`edition_url_conflict`), `src/lib/isw/urls.ts` or `editions.ts` (+`canonicalizeIswUrl`),
`src/integration/conflict-reference-repo.itest.ts` (apply migrations via `runMigrations(URL)`),
`src/db/migrations.test.ts` (+0028 additive pin), delete `src/integration/sql/conflict-benchmark-reports.sql`
and reduce `src/integration/sql/README.md` to a pointer (CLAUDE.md scoped exception — say so in
the commit).

**Schema (design §4 :127-161, verbatim, plus two additive columns).**
`benchmark_report_editions`: `id serial PK`, `series text NOT NULL`, `provider text NOT NULL`,
`edition_key text NOT NULL`, `edition_label text NOT NULL`, `report_date date NOT NULL`,
`canonical_url text`, `norm_version text`, `scope_version text NOT NULL`, `cutoff_at timestamptz`,
`published_at timestamptz`, `cutoff_treatment text NOT NULL`, `published_treatment text NOT NULL`,
`designated_final boolean`, `parse_status text NOT NULL DEFAULT 'pending'`, `isw_report_id integer
REFERENCES isw_reports(id)` (default ON DELETE NO ACTION — deliberately), `derived jsonb NOT NULL
DEFAULT '{}'`, **`created_at timestamptz NOT NULL DEFAULT now()`**, **`anchor_journal jsonb NOT
NULL DEFAULT '[]'`** (entries `{at, field: "cutoff"|"published", from, to}` — instants only).
CHECKs: `…_key_shape`, `…_cutoff_consistent`, `…_published_consistent`, `…_label_shape`,
`…_isw_url`, plus the treatment/parse_status enums. Indexes: UNIQUE `(edition_key)`; UNIQUE
`(canonical_url) WHERE canonical_url IS NOT NULL`; `(series, report_date)`; UNIQUE
`(series, report_date) WHERE designated_final`.
`benchmark_series_days`: `series`, `report_date`, `status CHECK (publication_gap|probe_failed)`,
PK `(series, report_date)`.

**Hardening carried from design §5.** Edition insert + day-row clear in ONE transaction (a
single CTE statement, or `BEGIN … COMMIT` on a pooled client); `SELECT … FOR UPDATE` on the
read-merge-write path; SQLSTATE 23505 on `benchmark_report_editions_url_idx` mapped to the typed
`edition_url_conflict`; URLs canonicalized before storage (https, lowercase host without `www.`,
lowercase path, trailing slash — `normalizeIswEditionUrl` already tolerates the variants, the
canonical form makes byte-equality hold); the CASE-guarded `DAY_STATUS_UPSERT_SQL` stays the
monotone authority (`reference-repo-sql.ts:131-136`); the anchor journal appended whenever
`anchorChanged` is true.

**Tests.** Unit: merge semantics unchanged (existing `reference-repo.test.ts`), canonicalization
table, journal shape refuses non-instant values. `migrations.test.ts`: 0028 exists, only
`CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE … ADD CONSTRAINT`, no `DROP|DELETE|TRUNCATE|UPDATE`,
file sorts before `9999`. Fork itests: `migrations.itest.ts` (apply, re-apply idempotent) and
`conflict-reference-repo.itest.ts` retargeted (two same-date `iran_update` editions coexist
while `isw_reports` holds zero rows for that date; registry counts identical before/after every
operation; the URL-uniqueness backend divergence still asserted; the insert-then-clear ordering
pin; a concurrent-writer smoke with two clients).

**Acceptance.** `npm run db:generate` reproduces the SQL from `schema.ts` (any hand-authored
statement listed in the PR body — expected: none); `git diff src/db/schema.ts` additions only;
`git diff --stat drizzle/` = 0028 + meta; `9999` byte-identical; `isw_reports`,
`source_citations`, `sources`, `source_theater_stats`, `validation_runs` untouched.

**Rulings.** 1 (no prose column; `derived`/`anchor_journal` bounded), 5 (forward-only, 9999
last). **Inert:** yes — empty tables. **Estimate:** 2.5 h of step 13's 5 h.

### 3.1b — `db: migration 0029 — conflict_validation_observations`

Step 13 · same worktree · branch `…-mig-0029-conflict-observations` · blocked on **C6**
(plus columns from C3, C7, C13). If C6 is unanswered: ship 3.1a only and hold this PR.

**Schema.** `conflict_validation_observations`:
`id serial PK`; `conflict_id text NOT NULL CHECK (conflict_id ~ '^[a-z_]+$')`;
`reference_edition_id integer NOT NULL REFERENCES benchmark_report_editions(id)`;
`series text NOT NULL`; `report_date date NOT NULL`; `edition_key text NOT NULL`
(denormalized for reads; the FK is the identity);
`evaluation_kind text NOT NULL CHECK (operational_cutoff|at_publication|finalized|retrospective)`;
`contributing_digest_ids integer[] NOT NULL DEFAULT '{}'`;
`result jsonb NOT NULL` (the persistable `ConflictResultV1` and nothing else);
`unit_attribution jsonb NOT NULL DEFAULT '{}'` (unitId → attribution enum, memo C3);
`matcher_rung text NOT NULL CHECK (llm-majority|llm|keyword)` (`fixture-oracle` excluded on
purpose: the live path can never mint one); `matcher_model text`; `votes_k integer`;
`dispatch jsonb` (model/effort/registry/approval identity of the paid rung, null on keyword);
`methodology_epoch`, `lane_taxonomy_version`, `evidence_policy_version`,
`lane_classifier_version`, `actor_roster_version`, `scope_version`, `gazetteer_version`,
`unit_flags_version`, `edition_norm_version`, `daily_final_policy` — all `text NOT NULL`;
`extractor_versions text[] NOT NULL DEFAULT '{}'`; `registry_version text NOT NULL`;
`window_end_source text NOT NULL CHECK (cutoff|published|report_day)`;
`run_group_key text NOT NULL`; `cron_run_id integer REFERENCES cron_runs(id)`;
`observed_at timestamptz NOT NULL DEFAULT now()`.
Keys (memo C6): partial UNIQUE `(conflict_id, reference_edition_id, cron_run_id) WHERE
cron_run_id IS NOT NULL`; index `(conflict_id, report_date DESC, observed_at DESC)`; index
`(run_group_key)`. No FK into `validation_runs`; no overwrite path anywhere.

**Files.** `src/db/schema.ts`, `drizzle/0029_<name>.sql` + meta, `src/lib/conflicts/
observation-store.ts` (`persistObservation(query, row)`: calls
`assertPersistableConflictResultV1` first, refuses `evaluation_kind !== 'retrospective'` at the
app layer too, refuses any `matcherRung === 'fixture-oracle'`, returns the id; a
`latestObservationsFor(conflictId, {days})` reader used by 3.5a), `src/lib/usage/cron-run.ts`
(`withCronRun(job, (counts, runId) => …)` — optional second arg, additive),
`src/db/migrations.test.ts` (+0029 pin).

**Tests.** Schema test: every column is id/number/enum/instant/text-version/jsonb-of-ids
(a static table of allowed kinds); persist test over an in-memory query fn: a result carrying a
sentinel string anywhere outside allowed id/enum fields is refused before any write; a
non-retrospective result refused; a fixture-oracle rung refused; the only write is the exact
serialized result. Fork itest: insert two observations for one edition from two `cron_runs`
rows, a third with the same `cron_run_id` refused by the partial unique, reader returns the
latest per edition. `withCronRun` test: existing routes' behaviour byte-identical; `runId` is
the started row's id.

**Acceptance.** As 3.1a plus: `git diff src/lib/usage/cron-run.ts` is the one optional
parameter and nothing else.

**Rulings.** 1, 5, 10 (`cron_run_id` binds the observation to a ruling-10 row). **Inert:** yes.
**Estimate:** 2.5 h.

### 3.2a — `isw: series-aware edition discovery recording every edition (no collapse)`

Step 14 · `48h-ws3-gazetteer` · branch `…-edition-discovery` · rebase onto step 13's schema
before merge · blocked on **C4, C5**.

**Files.** `src/lib/isw/edition-discovery.ts` (new), `scripts/isw-refresh.ts` (+`--series`
mode in its own branch at the top of `main()`; `--theater` path byte-identical),
`fixtures/isw/` (+ one HTML fixture per shape: `roca-daily`, `iran-special`, `iran-evening`,
`iran-morning`, `iran-plain`, plus a 404 body and an oversize-but-not-report body),
`src/integration/conflict-edition-discovery.itest.ts` (new).

**Design.** `discoverEditions(deps, series, date)` where `deps = {repo: ReferenceReportRepository,
fetch = politeFetch, query: QueryFn}`: candidate URLs from the exported builders
(`iswUrlForDate` `run.ts:15`, `iranUpdateUrlCandidatesForDate` `:31`; `iranUpdateUrlForDate`
`:21` is subsumed by the candidate list — do not duplicate any of them); probe ALL shapes,
never `break`; a probe counts as an edition iff `status === 200 && html.length > 10_000` (the
production threshold, `run.ts:105`); per hit: `normalizeIswEditionUrl` (`editions.ts:87-132`)
→ `extractReportInstants(html, date)` (`report-extract.ts:283`; instants/treatments only) →
`extractTakeawaysWithText` (`isw-extract.ts:67-92`, transient) → `derived.units = [{ordinal,
sha256(normalizedText), toponyms, actions, chars}]` (ruling 1: signatures and hashes only, the
same rule as `isw_reports.derived`) → `parseStatus = units.length > 0 ? 'parsed' : 'failed'` →
`isw_report_id` by link-only lookup (`SELECT id FROM isw_reports WHERE theater = $1 AND
report_date = $2 AND url = $canonical`; memo C5; NULL otherwise) → `repo.upsertEdition`.
Day status when no shape hit: `probe_failed` if ANY probe was not a clean 404 (network error,
5xx, timeout, undersized body); `publication_gap` only when EVERY shape returned 404 AND a
`probe_failed` row from a run ≥ 24 h earlier already exists — the monotone
`probe_failed → publication_gap` transition (`editions.ts:504-527`) is the confirmation
mechanism, so a gap is never asserted from one run (the 2026-08-15 lesson). Returns
`{editions: [{editionKey, id, action, anchored}], dayStatus, probes: [{url, status, bytes}]}`
with NO html. Never writes `isw_reports` or `source_citations`; never calls
`refreshReportCitations`. politeFetch cost: ROCA 1 + Iran 4 = 5 probes/day × 2.1 s
(`fetch-cache.ts:11`) ≈ 10.5 s; a page hit needs no second fetch (the probe body is the page).
`isw-refresh --series roca|iran_update --from A --to B [--dry]` iterates `utcDayRange` and
prints one line per day; `--backfill-from-isw-reports` (N3, operator-run only) registers
existing `isw_reports` rows of the series' theater as edition rows by normalizing their URL —
zero network.

**Tests.** Per-shape fixture probes; morning found then evening in the same run → two edition
rows, `selectDailyFinal` = evening; replay is a no-op (`unchanged`); unknown shape refused
(never mislabeled `plain`); politeFetch call count pinned (5 for Iran-day, 1 for ROCA-day);
day-status monotonicity incl. the two-run gap confirmation; anchor link-only (fixture
`isw_reports` row with the evening URL → evening edition anchored, morning NULL); `derived`
carries no text (sentinel audit). Fork itest: discovery over fixture HTML against the migrated
repository; registry counts unchanged.

**Acceptance.** Unit green with counts; fork itest named; `git diff src/lib/validation/run.ts`
EMPTY; `vercel.json` unchanged; the `--theater` path of `isw-refresh.ts` is byte-identical
(diff shows only the new branch). Report the measurement C5 asks for over any real window the
operator lets `--dry` probe: days with >1 edition, and anchor ≠ final count.

**Rulings.** 1, 5 (uses 0028, no migration), 12/14 (untouched), scraper conventions (≥2 s,
robots, UA — inherited from politeFetch). **Inert:** yes (module + script). **Estimate:** 2.5 h
of step 14's 4 h.

### 3.2b — `cron: conflict-validate route (report-only entrypoint, unscheduled)`

Step 14 · same worktree · branch `…-conflict-validate-route` · blocked on **C2**.

**Files.** `src/app/api/cron/conflict-validate/route.ts` + `route.test.ts` (mirrors
`validate/route.test.ts`), `src/lib/usage/cron-run.ts` (`JOB_MAX_DURATION_SEC["conflict-validate"]
= 300` — the lockstep test reads route sources, so `export const maxDuration = 300` must match).

**Design.** `CRON_SECRET` bearer auth exactly like siblings; `withCronRun("conflict-validate",
async (counts, runId) => …)` (ruling 10); `?date=` default yesterday UTC; `?lookback=2` (probe
D-1 and D-2 — memo C4); `?conflict=` optional filter; iterates `CONFLICT_DEFINITIONS`
(`definitions.ts:132`), per conflict per day calls `discoverEditions(def.referenceSeries, day)`
and records counts (`editionsFound`, `editionsInserted`, `anchored`, `dayStatus`, `probes`,
`probeFailures`); `markDegraded` on thrown failures only (the #87 discipline — a `probe_failed`
day is benign). File header states: NOT in `vercel.json`; scheduling is a WS-3.6 operator step;
a manual production GET writes 0028 rows (memo N2). Step 19 attaches the observation pipeline
behind this same job (no second route).

**Tests.** 401 without secret; iterates both conflicts; counts shape; `degraded` only on throw;
`lookback` bounds (1–3, refuse others); route source declares `maxDuration = 300`.

**Acceptance.** `vercel.json` unchanged; `git diff src/lib/validation/run.ts` empty; unit
counts reported.

**Rulings.** 10. **Inert:** exists, unscheduled — callable only with the secret; N2 governs
manual use. **Estimate:** 1.5 h.

### 3.3a — `conflicts: DB-backed claim sources (corpus recall + published retention)`

Step 19 · `48h-ws3-conflict` · branch `…-db-claim-sources` · needs 13 merged · blocked on
**C2, C8**.

**Files.** `src/lib/conflicts/db-claim-sources.ts` (+ test), `src/integration/conflict-db-claim-sources.itest.ts`.

**Design — corpus recall (`DbCorpusRecallClaimSource`, contract `evidence-assembler.ts:150-200`).**
Claim-id subquery: `doc_claims dc JOIN raw_documents rd ON rd.id = dc.raw_document_id` WHERE
`rd.country_iso2 = ANY($mapped)` (`mappedContributorTheaters(def)`) AND `dc.track =
ANY($tracks)` AND `dc.claim_date BETWEEN $startDate AND $endDate` (window day span) AND the
version filter — the OR over mapped theaters of `versionFilterSql(theater, "dc", n)`
(`map-versions.ts:39-56`; ruling 13, the only sanctioned accessor) AND `rd.adapter <> ALL($stub)`
(`STUB_ADAPTER_NAMES`, `evidence-records.ts:151`; ruling 3) ORDER BY `s.reliability_score DESC
NULLS LAST, dc.id ASC` LIMIT `EVIDENCE_MAX_INTAKE + 1` (`evidence-assembler.ts:148`; the +1
sentinel trips the intake refusal). Then, for exactly those ids, the doc rows: the claim's own
`raw_documents` row (adapter, `platform` = `sources.platform` (enum; null when the doc has no source row), `sourceDomain` = `sources.domain` (URL host when absent),
`published_at`, `fetched_at`, `lang`) plus every `doc_dedup` row whose `canonical_doc_id` is
that doc (as docs with `mirrorOfDocId` = canonical id — breadth, never independence). Mapper
SETS `stub`, `published: false`, `engine: "mapreduce"`, `currentExtractorVersion: true`,
`extractorVersion: dc.extractor_version`, `hedging`, `claimDate`, `sourceReliability`
(`sources.reliability_score`, null when no source). Theater is `raw_documents.country_iso2`
(single-valued; N:M is WS-3.8).
**Published retention (`DbPublishedRetentionClaimSource`, contract `:202-244`).** Claim-id
subquery: `claims cl JOIN digests d ON d.id = cl.digest_id JOIN countries c ON c.id = d.country_id`
WHERE `(c.iso2, d.track)` ∈ the designated set — `mapped × def.contributorTracks ∪ legacy ×
LEGACY_CONTRIBUTOR_TRACKS` (`eligibility.ts:103`) — AND `d.status IN ('generated','published')`
(`digestStatusEnum`, `schema.ts:52-57`; step 19 confirms against `digest-persist.ts` which
value the persist path writes and pins it) AND `cl.claim_date BETWEEN …` (a NULL `claim_date`
is out — conservative, matches the engine's own treatment) ORDER BY reliability, id, LIMIT
`EVIDENCE_MAX_INTAKE + 1`; docs via `claim_sources cs JOIN raw_documents rd` (+ mirrors as
above). Engine per claim = the digest's `structured->'stats'->>'engine' = 'mapreduce'` →
`"mapreduce"`, else `"legacy"` — the sanctioned reader precedent (`quality-funnel.ts:466`; the
stamp is written at `synthesize.ts:696`). Mapper SETS `published: true`, `currentExtractorVersion:
true` with `extractorVersion: null` (retention never filters versions,
`eligibility.ts:281-283`), `stub` from adapter. Returns `contributingDigestIds` (distinct
`d.id` touched) for the observation row.

**Tests.** Unit over an injected `QueryFn` with fixture rows: mapped-only theaters, track set,
window bounds, version filter (a superseded version row never reaches intake), stub adapter
excluded at the query, row-grain rule (a claim arrives with ALL its docs), +1 sentinel triggers
`invalid_evidence_request`, legacy digest claims labeled `engine: "legacy"`, unpublished
digest excluded, all four disposition-critical booleans present (the assembler's intake
refuses otherwise). Fork itest: seed `raw_documents` (one stub), `doc_claims` (current +
superseded versions), `doc_dedup`, `digests` (mapreduce + legacy), `claims`, `claim_sources`;
run both assemblies end-to-end; assert `laneDiagnostics`, `legacyMemberCount`, and that
`ca.records` carry only current versions.

**Rulings.** 2 (docs joined through `claim_sources` / `doc_claims.raw_document_id`), 3, 13, 14
(per-theater predicates; the union is the conflict's evidence set, never a merged corpus).
**Inert:** library. **Estimate:** 2 h of step 19's 6 h.

### 3.3b — `conflicts: live observation pipeline behind conflict-validate (report-only, inert)`

Step 19 · same worktree · branch `…-live-observation` · needs 13, 14, 06 merged · blocked on
**C2, C3, C8, C12, C13** (C4 for the winner rule).

**Files.** `src/lib/conflicts/live-observation.ts` (+ test), `src/lib/conflicts/unit-flags.ts`
(`deriveUnitFlags`, `UNIT_FLAGS_VERSION = "unit-flags-v0"`), `src/lib/conflicts/unit-lanes.ts`
(`classifyReferenceUnit`), `src/lib/conflicts/unit-attribution.ts`, the 3.2b route (attach the
pipeline; counts), `src/integration/conflict-live-observation.itest.ts`.

**Design.** `observeConflictDay(deps, def, day)` → `editions = repo.editionsForDay(series, day)`;
none → record the day status in counts, no row; else `selectDailyFinal(editions)`
(`editions.ts:446-477`) → `politeFetch(winner.canonicalUrl)` → `extractTakeawaysWithText`
(transient; zero units = parse failure → count, no row — `scorer.ts:494-502`) → units:
`unitId = "u<ordinal>"`, `ordinal`, `text` (transient), `lane = classifyReferenceUnit(def, text)`
(wraps `classifyCandidate(def.id, {text, track: "military"})`; `off_scope`/`unclassified` →
`other_in_scope`, EXPLICIT; version = the classifier version), `{compound, negative} =
deriveUnitFlags(text)` (memo C13); `unit_attribution[unitId] = classifyTakeawayTheater(sig.toponyms)`
for ROCA and the step-06 gazetteer's contributor attribution for Iran — recorded, never a
filter (memo C3) → `EvidenceRequest{conflictId, kind: "retrospective", report: {series,
editionKey, reportDate, cutoffAt, publishedAt}, snapshot: null}` (only the allowlisted keys,
`evidence-assembler.ts:125-131`) → `assembleCorpusRecallEvidence(req, corpusSource)` and
`assemblePublishedRetentionEvidence(req, retentionSource)` (the 40% cap and byte budget apply in
`selectEvidence`) → `scoreConflictReport({conflictId, evaluationKind: "retrospective", report:
{…, units}, gap: null}, corpus, retention, matcher)` → `persistObservation` with the version
stamps (`gazetteer_version` from `gazetteerFor(series).version`, `unit_flags_version`,
`edition_norm_version`, `daily_final_policy`, `registry_version`, `dispatch` when the paid rung
ran, `cron_run_id = runId`, `contributing_digest_ids`). Matcher selection: `createLiveMatcher()`
from 3.4b when present (it degrades internally), else `new ConflictKeywordMatcher(gazetteerFor(series))`
with the `insufficient_data` diagnostic. Ruling 14: corpora are never merged — the sources
query by theater set and the assemblies aggregate. Ruling 12 untouched.

**Pins (tests).** With the route unscheduled nothing runs (no timer, no import-time IO);
`LLM_DISABLE=1` → an observation is still persisted on the `keyword` rung; with
`CONFLICT_MATCH_USD_CAP_DAILY` unset the paid rung constructs NO client and makes zero calls
(guard refuses `daily_usd_unset`; asserted via a spy on `analysisOpenAiClient`); the persisted
object contains no ISW text (sentinel takeaway text in the fixture HTML never appears in the
row — the corpus-audit rule); `evaluation_kind` is always `retrospective`; a day with two
editions persists ONE observation keyed to the finality winner; a re-run under a new
`cron_run_id` appends. Fork itest end-to-end: fixture HTML + seeded claims → keyword rung →
one row; `validation_runs` row count unchanged; `vercel.json` unchanged.

**Rulings.** 1, 3, 9 (ladder + `LLM_DISABLE` degrade), 10, 12, 13, 14, 17 (append-only, no
regeneration trust). **Inert:** behind the unscheduled route. **Estimate:** 3 h.

### 3.4b — `validation: exported reserved single-vote dispatch + conflicts: live matcher (inert)`

Step 19 · same worktree · may ride the 3.3b branch or `…-live-matcher` · blocked on **C12**.

**Files.** `src/lib/validation/llm-match.ts` (extract `matchCompletionRequest(dispatch, prompt)`
and export `dispatchMatchVote(client, guard, dispatch, prompt): Promise<{raw: string; usd}>`;
`llmMatchOnce` (`:100-136`) becomes a thin caller — request byte-identical, snapshot-pinned),
`src/lib/usage/llm-guard.ts` (+`conflictMatchGuardFromEnv()`: provider `llm_conflict_match`,
`totalCapUsd: envCap("LLM_SPRINT_USD_CAP")`, `dailyUsdCap: envCap("CONFLICT_MATCH_USD_CAP_DAILY")`
— strict, no default — `dailyRequestCap: envNum("CONFLICT_MATCH_DAILY_REQUEST_CAP", 300)`,
`runRequestCap: envNum("CONFLICT_MATCH_RUN_REQUEST_CAP", 200)`), `src/lib/conflicts/live-matcher.ts`
(+ test), `src/lib/conflicts/matcher-import-hygiene.test.ts` (extend: `live-matcher.ts` is the
ONLY conflicts module allowed to import the OpenAI client/guard), `.env.example` (three envs,
documented as "unset = the paid rung refuses; keyword rung scores").

**Design.** `createLiveMatcher()`: returns null when `!OPENAI_API_KEY || ANALYSIS_PROVIDER ===
"stub" || isLlmDisabled()` (caller uses the keyword matcher directly — ruling 9 site-specific
degrade, same as `llm-match.ts:248-255`); else `workloadDispatchConfig("validation")` (fail-closed
before any reserve — `:261-269`), `guard = conflictMatchGuardFromEnv(); await guard.init()`,
`client = analysisOpenAiClient()` constructed LAZILY inside the vote fn after a successful
`tryReserve()`; `voteFn = async (round, prompt) => { const r = guard.tryReserve(); if (!r.ok)
throw new Error(r.reason); return (await dispatchMatchVote(client(), guard, dispatch, prompt)).raw; }`
— `dispatchMatchVote` meters (`guard.record`) BEFORE parsing (ruling 8, `:127-131`), the adapter
parses through `parseMatcherVote` and discards malformed rounds; `new LlmCompatibleMatcher({votesK:
MATCH_VOTES_DEFAULT, voteFn, model: dispatch.model, keywordFallback: new
ConflictKeywordMatcher(gazetteerFor(series))})`; the ladder (`match-contract.ts:259-282`): ≥3
usable → `llm-majority`, 1–2 → `llm`, 0 → keyword. `dispatchIdentity(dispatch)` returned for the
observation's `dispatch` column. `maxRetries: 0` house rule inherited from the analysis client.

**Tests.** Mocked client: 5 reserves → 5 dispatches → majority; 2 usable → `llm`; guard refusal
on round 3 → 2 usable → `llm`; cap unset → zero client construction; `LLM_DISABLE` → null matcher;
metering recorded before a malformed body is discarded; production `llmMatchOnce` request
snapshot unchanged; `MATCH_VOTES`/`MATCHER_MODE` are NOT read by the conflict path (K is
`MATCH_VOTES_DEFAULT`). No fork itest.

**Rulings.** 4 (fail-closed before reserve and before client), 8 (metering inside the dispatch
helper), 9, 18 (K=5 majority inherited). **Inert:** unscheduled AND cap env absent. **Estimate:**
1 h.

### 3.5a — `scoreboard: conflict observations view (real rows only) + evidence-lens relabel`

Step 24 · `48h-ws3-gazetteer` · branch `…-conflict-observations-view` · needs 19 merged ·
blocked on **C10, C11**.

**Files.** `src/lib/conflicts/db-product-view.ts` (+ test), `src/lib/conflicts/benchmark-key.ts`
(bijective edition-key ⇄ URL-key encoding; update `BENCHMARK_KEY_SHAPE` and its test),
`src/app/conflicts/page.tsx`, `[slug]/page.tsx`, `[slug]/benchmark/[key]/page.tsx`,
`…/evidence/page.tsx` (swap the dynamic import to the DB provider; remove `SyntheticBanner`;
gate order UNCHANGED), `src/components/conflicts/*` (empty state; "compound handling
undetermined" label when `unit_flags_version` is `unit-flags-v0`; "matched with legacy-only
evidence" companion count; no target/bar for conflict rows), `src/i18n/dictionaries.ts`
(`scoreboard.col.theater`, `scoreboard.caveat` in all seven catalogs — memo C10 copy),
`src/app/robots.ts` (+`/conflicts/*/benchmark/*/evidence` disallow — the P7 §5.2 item-4 shape),
`src/integration/conflict-feature-off.itest.ts` (extend), page tests.

**Design.** `db-product-view.ts` reads 0029 through `latestObservationsFor`: per conflict the
latest observation per edition; per day the observation whose edition is the current
`selectDailyFinal` winner of `editionsForDay` (memo C4/C6); featured = most recent day with a
scored result; benchmark list = last N days. Evidence tier: published-retention agreements and
BNOW-only items joined LIVE to `claims` by id with `claim_sources`/`raw_documents` for the
trail; a missing id renders "claim no longer available (digest regenerated)" — never
fabricated. `product-view.ts` (fixtures) stays for tests/goldens only; a hygiene test pins that
`db-product-view.ts` imports no fixture module and no page imports `product-view.ts` (ruling 3
by construction; the synthetic banner retires with it — P7 §5.2 item 1's precondition for any
later flag-on). Label = `CONFLICT_HEADLINE_LABEL`; numerator/denominator beside every
percentage; `unavailable` distinct from 0; ruling-19 "BNOW-only reported item" + hedge on
unmatched published claims; the contract §11 explainers unchanged; reciprocal `/scoreboard` link
rendered only when the flag is on.

**Tests.** Unit: view selection rules over fixture rows (winner, latest, empty), key encoding
round-trip + shape refusals, the "page-level authorization gate" case on the evidence page
(gate before the first query), no-fixture-import hygiene. Fork itest (`conflict-feature-off.itest.ts`,
production build, budget 10 min): flag-absent phase unchanged; flag-on phase with a SEEDED
observation + claim rows: anonymous bare and `RSC: 1` GETs on the evidence route carry no
claim text, the accepted control does, the teaser pages carry counts only — this is the
recorded discharge of the ruling-21 ROUTES-row obligation (AGENTS.md:1557), NOT an
`authz-page-gate` ROUTES row.

**Acceptance.** Unit counts; itest named; `git diff vercel.json` empty; no env named as set;
country-row numbers on `/scoreboard` unchanged (page test snapshot of the query and the
rendered figures); relabel copy present in every catalog.

**Rulings.** 3, 19, 21. **Inert:** the conflict routes 404 while the flag is absent; the relabel
copy and the `robots.ts` line are LIVE on deploy (the window's only user-visible change).
**Estimate:** 3.5 h of step 24's 5 h.

### 3.6-prep — `docs: shadow-soak enablement checklist and blocker dispositions`

Step 24 · same worktree · branch `…-soak-prep` · blocked on nothing (records N1–N3).

**File.** `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md`.

**Content.** (a) The five landing-§6 blockers with owner + disposition:
1. compound-unit calibration — OPEN (register #12.1–3); shipped: `unit-flags-v0` + edition
   `derived.units` hashes as the calibration substrate; owner: the pre-soak `compound-v1` PR
   (human-calibrated, versioned, register entry) after N3's backfill gives #12.2 its ≥1-month
   sample; blocks the soak;
2. assessment/inference diagnostic class — OPEN; a vocabulary + scorer + goldens change;
   bundled with (4) into ONE pre-soak `conflict-epoch-2` PR (also carries P7 §5.2 4b: unit
   ordinals + canonical URL in the profile); owner WS-3.6; blocks the soak;
3. Iran keyword rung — CLOSED by step 06 (gazetteer + `insufficient_data`) and step 19 (wiring);
4. source-independence semantics (F-NEW-1 relabel + `sourceDomain`-grain diagnostic) — OPEN;
   rides the epoch-2 PR; blocks the soak's §10 report, not the observation pipeline;
5. sample-power sizing (R-M-6) — OPEN; soak-plan refinement before day 1 using
   `soak-instruments.ts`; owner = the soak authorization gate.
(b) Enablement items: `FEATURE_AUTH_GATE=true` in every environment where `CONFLICTS_UI=1`
(F-NEW-6; true in Production, AGENTS.md:1598-1599); robots/sitemap/metadata posture (P7 §5.2
item 4; the robots line lands in 3.5a); C12 envs `CONFLICT_MATCH_USD_CAP_DAILY=2`,
`CONFLICT_MATCH_DAILY_REQUEST_CAP=300`, `CONFLICT_MATCH_RUN_REQUEST_CAP=200` in ALL Vercel envs
BEFORE the cron line (ruling 4); the `vercel.json` diff, NOT applied:
`{"path": "/api/cron/conflict-validate", "schedule": "30 7 * * *"}` (after `validate` 07:00Z, before
`enrich` 08:00Z; keeps the 2026-08-17 clustering); the step-16 log-drain query for the
`conflict-validate` job; the soak window (21 days, ≥18 ROCA / ≥14 Iran reports, lane minima),
PASS and abort criteria quoted verbatim from the design §3–§6 and §9; the N1 register-entry text;
the N2 rule; the decision-log entry text for scheduling. (c) What is NOT enabled by this step:
everything.

**Estimate:** 1.5 h.

## 4. Migrations

Numbers per INDEX §4: **0028** (3.1a) and **0029** (3.1b) in step 13; 0030 `runtime_logs` in
step 16; 0031 `provider_usage.model` in step 11 only if R1 chooses the column. Each migration PR
rebases onto `main` and regenerates before merge (claim the next free number at rebase time;
never renumber a merged migration); `9999_claim_source_trigger.sql` stays last and unedited;
`migrations.test.ts` gains one additive-shape pin per file. Fork itests apply migrations
themselves with `runMigrations(URL)` (`scripts/migrations-lib.ts:23`; the harness does not).
Ruling 5: applied migrations untouched; everything forward-only; no backfill inside DDL.

## 5. Environment and cap changes (ruling-4 ordering)

| Env | Read by | Default when unset | When to set |
|---|---|---|---|
| `CONFLICT_MATCH_USD_CAP_DAILY` | 3.4b guard | refuse (`daily_usd_unset`) → keyword rung | ALL Vercel envs, BEFORE the cron line — a WS-3.6 operator step |
| `CONFLICT_MATCH_DAILY_REQUEST_CAP` | 3.4b | 300 | same time (optional) |
| `CONFLICT_MATCH_RUN_REQUEST_CAP` | 3.4b | 200 | same time (optional) |
| `LLM_SPRINT_USD_CAP` | 3.4b backstop | already set | — |
| `CONFLICTS_UI` | pages | absent = off | never in this window (P7 §5.2 item 1 precondition + decision-log entry) |
| `FEATURE_AUTH_GATE` | gate | true in Production | must be true wherever `CONFLICTS_UI=1` |

No `EVAL_*` env is involved (memo C12). Deploying the guard with its cap unset stops nothing
live: the path is inert by design.

## 6. Deploy path

Every PR deploys inert; deploy only through `docs/RELEASE-CHECKLIST.md` (step 03) from the
plain release clone after step 26's per-PR go/no-go (step 27). Live deltas at deploy: three
empty tables; one unscheduled route; the `robots.ts` disallow line; the scoreboard relabel
copy; `withCronRun`'s optional parameter. Rollback target = the previous production deployment
(no migration to unwind: tables are additive and empty). Smoke after deploy: `/health` stamp;
anonymous bare + `RSC: 1` on `/conflicts/*` still 404 with no conflict token; `/scoreboard`
renders the new copy with unchanged numbers; `GET /api/cron/conflict-validate` without the
secret → 401 (do NOT call it with the secret — N2).

## 7. Soak / proof plan

- Per-PR proof: the unit pins and fork itests named above (fork name + counts in each report).
- Pipeline demo on a fork ($0): step 19 runs `next build && next start` bound to a disposable
  branch with `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `POSTMARK_SERVER_TOKEN` blank and
  `LLM_DISABLE=1` (COMMON §4.8; `authz-page-gate.itest.ts` `serverEnv()` pattern), seeds
  claims, calls the route with a test secret, and shows one keyword-rung observation.
- The shadow soak proper is WS-3.6, gated by the 3.6-prep checklist and the soak design §8;
  not started in this window.

## 8. Exposure note

No PR reads or writes `docs/evals/analysis/`, the heldout split, the campaign artifacts, or
the reconciliation key. `fixtures/conflicts/goldens/` is untouched by 3.1–3.5 (step 06 may
regenerate a golden only where a fixture legitimately hits `insufficient_data`, listed in its
report). `conflict-roca-v1` / `conflict-iran-v1` stay offline.

## 9. Session estimates

Step 13: 5 h (3.1a 2.5, 3.1b 2.5). Step 14: 4 h (3.2a 2.5, 3.2b 1.5). Step 19: 6 h (3.3a 2,
3.3b 3, 3.4b 1). Step 24: 5 h (3.5a 3.5, 3.6-prep 1.5). Post-window: `conflict-epoch-2` PR
4–6 h; `compound-v1` = human calibration + 2 h; WS-3.6 soak = 1 session + 21–35 calendar days.

## 10. Operator decisions before the first PR

C1 (before step 13); C6 (before 3.1b); C4, C5 (before step 14); C2, C3, C8, C12, C13 (before
step 19); C10, C11 (before step 24); N1 (with C12); N2, N3 (operator runs, any time after
3.2a/3.2b deploy). C9 and C14 block nothing.

## 11. Acceptance for the whole workstream (restated)

A single ROCA edition produces exactly one `russia_ukraine` observation per run; the RU and UA
country rows keep their overlapping denominators but are labeled as evidence lenses; Iran
Update editions are distinct edition rows and only the daily-final one is scored per run;
**the Iran keyword rung scores `iran_regional` units through `iran-levant-v1` and reports
`insufficient_data` for units with no gazetteer or action signal, denominator unchanged — a
scored outcome with a diagnostic, never a bare scored zero for a gazetteer-less lane set and
never `unavailable`** (INDEX §1.12); every match is attributable to a contributor theater;
no ISW prose is persisted anywhere; no digest corpus is changed; the country scoreboard's
numbers are unchanged during the shadow window.

---

## Scope

As the memo: prompt `docs/prompts/2026-09-05-48h-05-plan-ws3-conflict.md`; lane
`48h-ws3-conflict`; branch `48h/ws3-conflict-20260905-step05-ws3-plan`; base `dff58f2`.

## Built

This document and the memo; PROGRESS.md blocks; one docs-only PR.

## Tests

None run — no code. Unit count unchanged (3,612 / 247 files on `main`). No fork. $0.

## Rulings touched and how each is satisfied

Per PR in §3; summary in the memo's Rulings section. The plan adds no ruling exception and
proposes no change to rulings 1–5.

## Citations re-verified

The memo's list applies in full. Plan-specific additions, all verified at `dff58f2`:
`run.ts:105` (the >10 KB threshold) ✓ · `evidence-assembler.ts:125-131,148` ✓ ·
`scorer.ts:371-671,494-502` ✓ · `llm-match.ts:100-136,248-255` ✓ · `cron-run.ts:60-70,180-191` ✓
· `map-versions.ts:39-56` ✓ · `quality-funnel.ts:466`, `synthesize.ts:696` ✓ ·
`schema.ts:52-57` ✓ · `fetch-cache.ts:11` ✓ · `product-view.ts:66-80` ✓ ·
`authz-page-gate.itest.ts:79-84,149-160` (`serverEnv()`) ✓ · `conflict-feature-off.itest.ts:1-25` ✓
· `migrations-lib.ts:23` ✓ · INDEX §4 migration table ✓ · `vercel.json` ✓ · AGENTS.md
`:1557`, `:1598-1599` (drifted from the prompt's ≈1547-1559 / ≈1598-1599; recorded).

## Decisions needed

Memo §2–§3 (C1–C13, N1–N3); C14 answered. Blocking matrix: memo §4 and this plan §10.

## Debt and risks

The memo's list, plus plan-level: (1) step 14 runs in `48h-ws3-gazetteer` and must rebase onto
step 13's schema before merge — table/column names above are the contract; (2) the
`withCronRun` optional parameter and `JOB_MAX_DURATION_SEC` entry are two small touches to a
shared reliability file — keep them in 3.1b/3.2b respectively and byte-pin existing behaviour;
(3) the `digests.status` value the persist path writes must be confirmed in step 19 before the
retention predicate is pinned; (4) `politeFetch` on Vercel refetches each run (no persistent
cache) — bounded, but the enablement checklist should note ISW host load (≈10 requests/run);
(5) the relabel copy touches seven catalogs; (6) the benchmark-key encoding is a public URL
identity — once real observations are linked it must never be re-keyed.

## Handoff — rewrite text for steps 13, 14, 19, 24

**Step 13 (`…-13-ws3-1-persistence.md`).** Keep as written with these edits: (i) in the header
table, `Depends on` → "05 (this plan §3.1a/3.1b); C1 = Option 3 (required); C6 (append-only
recommended); columns from C3/C7/C13 (`unit_attribution`, `gazetteer_version`,
`unit_flags_version`)"; (ii) PR 1: add "additive `created_at` and `anchor_journal jsonb`
(instants only); expect `db:generate` to emit every CHECK and partial index (precedents 0020,
0023) — list any hand-authored statement; map 23505 on the URL index to `edition_url_conflict`;
canonicalize URLs before storage; wrap insert+clear in one transaction"; (iii) PR 2: replace
the column paragraph with §3.1b's column list and keys verbatim; add "`withCronRun` gains an
optional second callback argument `runId` (additive); a `persistObservation` writer that calls
`assertPersistableConflictResultV1`, refuses non-retrospective and fixture-oracle results";
(iv) Handoff must name the final table/column names and the `persistObservation` /
`latestObservationsFor` signatures.

**Step 14 (`…-14-ws3-2-edition-discovery.md`).** (i) `Depends on` → "05; 13's 0028 names
(rebase before merge); C4 = every edition stored, daily-final scored; C5 = link-only by URL
equality"; (ii) PR 1: add the two-run `publication_gap` confirmation rule, the
`derived.units = [{ordinal, sha256, toponyms, actions, chars}]` payload, the `--dry` measurement
(days with >1 edition; anchor ≠ final count), and the optional `--backfill-from-isw-reports`
mode (operator-run only, N3); (iii) PR 2: add `?lookback=2`, `?conflict=`, the
`JOB_MAX_DURATION_SEC` entry + `maxDuration = 300`, and the header sentence "a manual production
GET writes 0028 rows — forbidden until N2 says otherwise"; (iv) Handoff must state the
`discoverEditions` signature and return shape.

**Step 19 (`…-19-ws3-3-evidence-population.md`).** Fill the SKETCH from §3.3a/3.3b/3.4b: PR 1
= §3.3a (queries, mappers, the four booleans, `contributingDigestIds`, the `digests.status`
confirmation); PR 2 = §3.3b (pipeline, `unit-flags-v0`, `classifyReferenceUnit`,
`unit_attribution`, the five pins) + §3.4b (`dispatchMatchVote`, `conflictMatchGuardFromEnv`,
`createLiveMatcher`, import hygiene); `Depends on` → "13, 14, 06 merged; C2, C3, C8, C12
(`llm_conflict_match` + `CONFLICT_MATCH_*`), C13 (`unit-flags-v0`); C4 winner rule"; Spend
line: "$0 — with `CONFLICT_MATCH_USD_CAP_DAILY` unset the paid rung refuses before any client;
pin it"; Handoff must give step 24 the `latestObservationsFor` reader, the observation row
shape, and the fork demo recipe.

**Step 24 (`…-24-ws3-5-scoreboard-and-soak-prep.md`).** (i) `Depends on` → "19 merged; C10 =
keep `/scoreboard` public, copy relabel, reuse `/conflicts/**` with a DB provider; C11 = no
target"; (ii) PR 1: REPLACE "a NEW gated route under `/conflicts/**`" with "the EXISTING
`/conflicts/**` routes switched to `db-product-view.ts`" and REPLACE "a row in the
authz-page-gate ROUTES table" with "extend `conflict-feature-off.itest.ts`: seed one
observation + claims, assert the three body cases under the flag-on server (the recorded
discharge of the ROUTES obligation — AGENTS.md:1557; a ROUTES row cannot pass its positive
control flag-absent)"; add the bijective benchmark-key encoding, the empty state, the
`unit-flags-v0` label, the legacy-only companion count, the seven-catalog relabel, and the
`robots.ts` disallow line; (iii) PR 2: use §3.6-prep's disposition list and the N1/N2 texts;
(iv) Acceptance: add "country-row numbers unchanged (snapshot)".

## Proposed AGENTS.md changes

As the memo's block (directory-map line for `src/lib/conflicts/`; the `drizzle/` range after
step 13; the Current-state sentence after steps 13/14 deploy; the CP1 decision-log entry draft).
Additionally for step 25, after step 19 merges: OPEN-TASKS status lines — #37 gains "conflict
layer works on primary tags + registry contributors (PLAN-WS-3 §3.3a)"; #79's drain note gains
"N3 backfill registers the same rows as edition rows"; #93 gains "the `conflict-validate` job
is a consumer of the drain query (3.6-prep)".
