# WS-3.3 — evidence population + live observation pipeline (step 19)

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-19-ws3-3-evidence-population.md`, plus
  `docs/prompts/2026-09-05-48h-COMMON.md`, the WS-3.0 decision memo, PLAN-WS-3 §3.3a/3.3b/3.4b
  and the four upstream Handoff sections (WS-3.1 persistence, WS-3.1b observations, WS-3.2
  edition discovery, the step-06 gazetteer report).
- **Lane / worktree:** `48h-ws3-conflict-20260905`, run **UNATTENDED** with the trimmed
  four-key `.env.local` (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`,
  `NEON_API_KEY`). **No provider key exists in this worktree**, which is itself part of why
  the spend line below is `$0`.
- **Base SHA:** `origin/main` **`4b8e7e7`** (fetched at session start; unchanged at the last
  fetch before PR 3 was opened).
- **Branches / PRs — three, not two.** The scorer diagnostic was split out because it is the
  ONLY work in this step that writes under `docs/evals/analysis/`, and decision E5 asks for a
  PR body that shows the exact command and the changed golden. Isolating it makes that
  auditable instead of buried in a 20-file diff.

  | PR | branch | base | contents |
  |---|---|---|---|
  | [#86](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/86) | `…-db-claim-sources` | `main` | §3.3a — the DB-backed evidence populations |
  | [#87](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/87) | `…-insufficient-data` | `main` | the scorer `insufficient_data` diagnostic + the E5 regeneration |
  | [#93](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/93) | `…-live-observation` | **`…-db-claim-sources`** | §3.3b + §3.4b — the pipeline, the matcher, the route |

  **#93 is STACKED on #86.** The operator must run `gh pr edit 93 --base main` after #86
  merges. #87 is independent of both and shares only the PROGRESS plan-block commit.

- **Item (8) decision: BRANCH B.** `git log --oneline origin/main -- src/lib/isw/edition-discovery.ts
  src/lib/conflicts/observation-store.ts` at `4b8e7e7` returned only `9303047` (PR #70) and
  `ae4cd4a` (the 0030 store) — lane C's commits were NOT on `origin/main`, and
  `git show origin/main:src/lib/isw/edition-discovery.ts | grep -c 'classifyProbe\|probeIndeterminate'`
  returned **0**. Decided once, at the start of the pipeline PR, and not re-checked mid-PR.
  Consequences taken verbatim: `EDITION_UNITS_VERSION` on this tree is **`isw-unit-sig-v1`**
  and `unitSignaturesFrom` computes under the RU/UA gazetteer, so an Iran edition's stored
  `derived.units[].toponyms` are effectively EMPTY; the join is `sha256` then `ordinal`, never
  signatures; the winner's row id is resolved from `edition_key`; `probe_failed` is treated as
  "could not tell", never as "did not publish". None of it needs revisiting when lane C lands —
  see Handoff.
- **Spend: $0.** No paid provider call, no environment change, no migration, no deploy, no
  production write. `vercel.json`, `drizzle/`, `src/db/schema.ts` and `src/lib/validation/run.ts`
  are byte-unchanged against `origin/main` on every branch.

## Built

### PR #86 — `conflicts: DB-backed claim sources`

`src/lib/conflicts/db-claim-sources.ts` (+ test), `src/integration/conflict-db-claim-sources.itest.ts`.

`DbCorpusRecallClaimSource` and `DbPublishedRetentionClaimSource` implement the contracts at
`evidence-assembler.ts:150` and `:202`, which until now had only fixture loaders behind them.

- **Rulings 13 + 14 in one predicate.** The version filter is `versionFilterSql()`
  (`map-versions.ts:39`) ANDed **per theater** — `(rd.country_iso2 = 'ru' AND <ru's pairs>) OR
  (rd.country_iso2 = 'ua' AND <ua's pairs>)`. A flat OR over the union of every mapped theater's
  pairs (a natural reading of §3.3a's sketch) would let a `ru` document qualify on `ua`'s
  version, because `mapExtractorVersion(track, theater)` takes the theater into its basis.
- **Row grain.** Two statements per assembly: a distinct-claim query bounded at
  `EVIDENCE_MAX_INTAKE + 1` (`:148`), then an **unbounded** document query for exactly those
  ids. The `+1` trips the assembler's visible intake refusal instead of silently narrowing.
- **Ruling 3, both directions.** Corpus recall excludes a claim whose owning document is a stub
  adapter; published retention excludes a claim carrying **any** stub document (`NOT EXISTS`),
  rather than dropping the document and quietly lowering `independentSourceCount`. Stub-adapter
  mirrors are filtered out of both document joins.
- **Digest status, confirmed against the persist path** as §3.3a required:
  `digest-persist.ts:167-171` writes `'generated'` on insert AND on the regeneration
  `DO UPDATE`, so the member set is `('generated','published')` and `pending`/`failed` are not.
  Pinned by a test.
- A document that is both a claim source and a registered mirror keeps the **mirror** form —
  deflationary, since a mirror is breadth and never independent corroboration.
- `contributingDigestIds()` reports the distinct digests the last retention call read.

### PR #87 — `conflicts: thread the insufficient_data class through the scorer`

`eval-profile.ts` (`ConflictScoredResultV1.insufficientData?: readonly string[]`), `scorer.ts`
(`insufficientDataOf` + the stamp), `scorer.test.ts`, the one affected golden, the two committed
conflict offline-results files, `CONFLICT-EVAL-SCORECARD.{md,json}`, and an append-only entry in
`docs/reviews/EVAL-EXPOSURE-LEDGER.md`.

Denominator-unchanged; omitted when empty; cross-population disagreement refused the way
`keywordUnmatchableOf` refuses a count mismatch. See "Decisions needed" for the one piece of the
step-06 handoff deliberately not done.

### PR #93 — `conflicts: live observation pipeline behind conflict-validate`

`live-observation.ts`, `live-matcher.ts`, `unit-flags.ts`, `unit-lanes.ts`,
`unit-attribution.ts` (+ a test each) · `definitions.ts` gains `CONFLICT_REGISTRY_VERSION` ·
`matcher-import-hygiene.test.ts` extended · `llm-match.ts` (`matchCompletionRequest`,
`dispatchMatchVote`) · `llm-guard.ts` (`conflictMatchGuardFromEnv`, `CONFLICT_MATCH_PROVIDER`) ·
the cron route · `.env.example` · `src/integration/conflict-live-observation.itest.ts`.

`observeConflictDay(deps, def, day)`: `editionsForDay` → `selectDailyFinal`
(`editions.ts:628`) → re-fetch the winner → `extractTakeawaysWithText`
(`isw-extract.ts:67`) → units (`u<ordinal>`, lane, flags) → attribution → both assemblies →
`scoreConflictReport` → `persistObservation`. Attached behind the SAME unscheduled route.

## Tests

| gate | before | after |
|---|---|---|
| `main` (`4b8e7e7`) | — | **4,332 / 282** |
| PR #86 | 4,332 / 282 | **4,357 / 283** |
| PR #87 (cut from `main`) | 4,332 / 282 | **4,337 / 282** |
| PR #93 (stacked on #86) | 4,357 / 283 | **4,441 / 288** |

- `npm run typecheck` clean on every branch. `npm run lint`: **0 errors**, 3 pre-existing
  warnings (`validate/route.test.ts:7`, `hardening.test.ts:11`, `cron-run.test.ts:5`), none in a
  touched file.
- The enforced pre-push gate ran on every push. It **caught a real omission**: `no-delete.test.ts`
  refused both new itests until they were added to the pinned `raw_documents`-deleter inventory
  and `docs/RETENTION-AND-PRESERVATION.md`'s count sentence moved with them (8 → 9 → 10 itest
  files; ten → twelve statements).
- **Fork integration tests**, disposable Neon branches created and deleted by the runner:
  - `br-wandering-rice-atdn4n25` — `conflict-db-claim-sources.itest.ts` **9/9** (first run).
  - `br-young-bread-ath111iu` — `conflict-live-observation.itest.ts` 5/6, one failure from a
    test-side `now` injection (a `Date` where the reader wants `() => Date`); fixed and re-run.
  - `br-wispy-brook-atkhgugi` — both files together, **15/15** (live observation 6/6 + claim
    sources 9/9) on the final trees.
- **Spend line: $0.** Every fork run had `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` blanked and
  `CONFLICT_MATCH_USD_CAP_DAILY` deleted; the E5 regeneration printed the CLI's own
  "no DB, no provider, no client construction".

## Rulings touched and how each is satisfied

1. **Legal (no reference prose).** Unit text lives in `observeConflictDay`'s frame and in the
   matcher prompt only. A sentinel rides the first takeaway of the fixture page and is asserted
   absent from every INSERT parameter (unit) and from `result::text` and `unit_attribution::text`
   on the fork. `cron_runs.counts` receives only bounded tokens — an edition key, an id, a rung
   name, a skip reason. `persistObservation` re-audits the whole stored result independently.
2. **Traceability.** Documents are reached only through `doc_claims.raw_document_id` and
   `claim_sources`, plus registered `doc_dedup` mirrors. Nothing synthesizes a document, and the
   fork itest seeds `claims` + `claim_sources` in one transaction so the deferred trigger holds.
3. **Truth-in-UI.** `STUB_ADAPTER_NAMES` (`evidence-records.ts:151`) is excluded **at the
   query** in both populations and in both mirror joins — a stub row is HIDDEN, never labelled.
4. **Fail-closed spend.** Four refusals before any money, each earlier than the last, with
   `CONFLICT_MATCH_USD_CAP_DAILY` checked **before** a SpendGuard exists, before `guard.init()`
   reads the database and before any client is constructed. Pinned by spies on the SDK
   constructor, on `chat.completions.create` and on the query function. The guard's own
   `daily_usd_unset` refusal is pinned separately, so the early return is an optimisation of a
   real refusal rather than a substitute for one. New ledger row `llm_conflict_match`; the
   all-time backstop stays the shared `LLM_SPRINT_USD_CAP` (`spend-guard.ts:122`).
5. **Migrations.** None added, none edited. 0028/0029/0030 are applied by the itests'
   own `runMigrations` on the fork (`#111`: production is still at 0027).
8. **Metering inside the dispatch.** `dispatchMatchVote` records **before** the body is
   interpreted; a test drives two good rounds and three malformed ones and asserts **five**
   metered records, because the provider bills all five.
9. **`LLM_DISABLE` semantics.** The conflict matcher degrades (returns a refusal reason), it
   never throws — the same shape as `llm-match.ts`'s validation site. A test proves an
   observation is still persisted under `LLM_DISABLE=1`, on the keyword rung.
10. **`cron_runs`.** `withCronRun(job, (counts, runId) => …)` (`cron-run.ts:193`) supplies the
    provenance; `runId === null` is stored as "unattributed", never treated as an error.
11. **Theater is a lens.** `unit_attribution` records which contributor lens would be expected
    to cover a unit; it is never a filter, and the denominator stays every declared takeaway.
12. **Dedup verdicts.** Read (as mirrors), never written; no cross-theater collapse anywhere.
13. **Map versioning.** Only through `map-versions.ts`; the map activation lock is untouched.
14. **Per-theater corpora.** The two sources query by the def's theater set and the assemblies
    aggregate. There is no merged gather; the union IS the conflict's evidence set.
17. **No trusting a single run.** The store is append-only: a re-run under a new `cron_run_id`
    APPENDS, and the fork itest asserts the earlier row is byte-identical afterwards.
18. **K=5.** `MATCH_VOTES_DEFAULT`, and `MATCH_VOTES`/`MATCHER_MODE` are deliberately NOT read
    by the conflict path, so a production knob cannot retune the soak mid-window.

## Citations re-verified

Every line below was re-read on this tree; those that moved are given at their current position.

| citation | status |
|---|---|
| `evidence-assembler.ts:150` / `:202` — the two source contracts | correct |
| `evidence-assembler.ts:148` `EVIDENCE_MAX_INTAKE`; `:125` `ASSEMBLER_REPORT_KEYS` | correct |
| `evidence-records.ts:151` `STUB_ADAPTER_NAMES` | correct |
| `eligibility.ts:103` `LEGACY_CONTRIBUTOR_TRACKS`; `:281-283` retention never version-filters | correct |
| `map-versions.ts:39` `versionFilterSql` | correct (prompt said `:39-56`) |
| `digest-persist.ts:167-171` — the `'generated'` write, insert and DO UPDATE | correct; this is the §3.3a confirmation |
| `quality-funnel.ts:466` — the sanctioned `stats.engine` reader | correct |
| `synthesize.ts:739` — where the `engine: "mapreduce"` stamp is written | **moved**: the plan cited `:696` |
| `editions.ts:628` `selectDailyFinal` | **moved**: the plan cited `:446-477` |
| `editions.ts:526` `DAILY_FINAL_POLICY`; `:37` `EDITION_NORMALIZATION_VERSION` | **moved**: the WS-3.1b handoff cited `editions.ts:383` for the policy |
| `scorer.ts:497` — the unit-less report refusal | **moved**: the plan cited `:494-502` |
| `cron-run.ts:193` `withCronRun(job, (counts, runId) => …)` | correct |
| `model-config.ts:332` `dispatchIdentity` | correct |
| `spend-guard.ts:122` — the `>=` threshold test | correct |
| `isw-extract.ts:67` `extractTakeawaysWithText` | correct |
| `edition-discovery.ts:79` `EDITION_UNITS_VERSION = "isw-unit-sig-v1"`; `:197` `normalizeUnitTextForHash`; `:204` `unitSignaturesFrom` | correct **on branch B** |
| `gazetteer/ru-ua-v1.ts:109` `classifyTakeawayTheater` returns only `ru\|ua\|both` | correct — this is why the pipeline uses `classifyTheaterWith` (`gazetteer/match.ts:130`) |
| `hardening-cli.test.ts:192` — the eval-artifact pin | **moved to `:197-208`** |
| `AGENTS.md:1557` (step 24's ROUTES-obligation note, quoted by PLAN-WS-3) | not re-verified — outside this step's edits |

## Decisions needed

1. **`gazetteerVersion` in the result's `versions` block — I did NOT add it, and this is the one
   place I deviated from a signed handoff.** The step-06 gazetteer report's "what step 19 must
   do" item 1 asks for it. The later WS-3.1b observation design (2026-09-06) makes the row a
   PROJECTION of the result and takes `gazetteer_version` as a **caller-supplied** stamp
   *precisely because the result does not carry it* — which is what step 18's attack #3 ("prove
   no column can disagree with `result`") protects. Adding it to the result would create a second
   source of truth for one column, and the natural remedy — a cross-check inside
   `persistObservation` — is unavailable, because `observation-store.ts` is step 23 lane C's for
   this window. Interpretability is not lost: `conflict_validation_observations.gazetteer_version`
   is NOT NULL on every row. **Recommendation: ratify the omission**; if the operator wants it in
   the result too, it should land in the same PR as the store-side cross-check, not before.
2. **`CONFLICT_REGISTRY_VERSION` = `"conflict-registry-v1"`** — the WS-3.1b report listed this as
   its "Decisions needed #1" (no producing constant existed). I introduced it in `definitions.ts`
   with the value `conflict-observations.itest.ts` was already using, and documented the bump
   rule (roster/track/comparability changes bump it; a display-name edit does not).
   **Recommendation: ratify.** No decision is needed to keep it; one would be needed to change it.
3. **Three PRs instead of two, and #93 stacked on #86.** Mechanical consequence: after #86
   merges, `gh pr edit 93 --base main`. **Recommendation: merge #86, then #93, then #87 whenever.**
4. **`unattributed` as an attribution value** (not in any plan document). `classifyTheaterWith`
   returns `both` both for "spans two contributors" and for "recognised nothing", and on branch B
   every Iran unit falls into the second case. I emit `unattributed` for an empty toponym set so
   the row says the true thing. **Recommendation: ratify**; it is additive, bounded, and the
   step-24 view will want to render the two differently.

## Debt and risks

1. **The Iran attribution column is `unattributed` for every unit until lane C lands.** Not a
   defect of this PR — WS3-F05 is lane C's — but a soak-relevant one: an Iran observation written
   before that fix carries no attribution signal at all. It self-heals for NEW observations once
   the fixed module is on `main` (the pipeline reads the edition row, so no change here is
   needed); rows written before it do not. If any Iran observation is written between merge and
   the WS3-F05 fix, step 24 should exclude it from any attribution figure.
2. **`laneDiagnostics` is structurally always `{}` on the live corpus-recall path.** It is
   populated only from legacy-incomparable candidates that reach the assembler, and the DB
   corpus-recall source cannot emit one (it reads `doc_claims` under the current-version filter).
   Comparability honesty is therefore carried entirely by `incomparableTheaters`, which discloses
   the whole `legacy_only` roster on every assembly. The fork itest asserts exactly this rather
   than pretending the diagnostic fires. **Step 24 must not read an empty `laneDiagnostics` as
   "no comparability problem".**
3. **A pathological claim over `EVIDENCE_MAX_RECORD_TEXT_BYTES` (4,096) takes down its
   (conflict, day).** I deliberately did NOT filter it at the query: the assembler's refusal is
   visible and correct, the route's per-cell catch degrades one cell rather than the run, and
   silently dropping the claim would bias the population. Recorded so it is recognised if it ever
   fires.
4. **The published-retention `sourceReliability` is `MAX` over the claim's linked sources.** The
   contract says "the claim's primary source" without defining primary for a multi-source claim.
   MAX is deterministic and matches the reliability-first ordering; it is a choice, not a
   derivation, and a different definition would reorder the intake ceiling's cut.
5. **The paid rung has never dispatched.** Every assertion about it is against a mocked SDK. The
   first real `llm_conflict_match` row is future-observable and belongs to WS-3.6, after the
   ruling-4 cap ordering.
6. **`--fresh` left a `discardedRuns` provenance entry** in both committed conflict results files
   (PR #87), so they now declare themselves "not first-try". That is the tool being honest about
   an authorized regeneration, not a retried measurement — the offline conflict profile has no
   dispatch to retry. Recorded so a later reader does not read drift into it.
7. **Not re-checked:** whether lane C landed while PR 3 was being written. Item (8) says decide
   once; I did. If lane C merged in the interim, PR #93 still merges cleanly (it edits none of
   lane C's files) and gains the WS3-F05 benefit automatically.

## Handoff

### For step 24 (scoreboard + soak prep)

- **Read API.** `latestObservationsFor(query, conflictId, { days?, now? })` from
  `observation-store.ts` — latest row **per edition**, newest report day first; `days` defaults
  to 30 and is inclusive of today. **`now` is a FUNCTION** (`() => Date`), not a `Date` — this
  cost a fork-itest failure here. `StoredConflictObservation` carries
  `{ id, conflictId, referenceEditionId, series, reportDate, editionKey, matcherRung,
  runGroupKey, unitFlagsVersion, gazetteerVersion, cronRunId, observedAt, headline, result }`;
  `headline` is derived, never stored. The C4 "current day" rule — pick the row whose edition is
  the day's `selectDailyFinal` winner — is the READ MODEL's job and is deliberately not in the
  store.
- **Which columns are populated, RU/UA vs Iran.** Everything except two is identical.
  `gazetteer_version` is `ru-ua-v1` for `russia_ukraine` and `iran-levant-v1` for
  `iran_regional`. `unit_attribution` is a real theater tag for RU/UA and **`unattributed` for
  every Iran unit until lane C's WS3-F05 lands** (debt item 1). `dispatch` is NULL and
  `matcher_model` is NULL on every row this window can produce, because the paid rung is
  unreachable; `matcher_rung` is `keyword` and `votes_k` is `0`.
- **`unit_flags_version` is `unit-flags-v0` on every row**, so under D4/C13 **every number in
  this window is "compound handling undetermined — not soak-eligible"** and none of it may reach
  `/scoreboard`, a customer, or a report figure. Label it; do not publish it.
- **Is there a `publication_gap` row on the fork? No — zero.** Expected, and structurally so:
  gap confirmation needs every probe of the day to be a clean 404 plus an earlier `probe_failed`
  row, and neither fork run exercised discovery at all (the pipeline itests seed editions
  directly and inject the page). C15's same-session reopening trigger was not exercised. Under
  live throttling it is close to unreachable anyway — the 2026-09-08 C5-m re-run measured 403s
  suppressing real pages, so `probe_failed` today means "could not tell".
- **Soak checklist additions this step earns.** (a) `CONFLICT_MATCH_USD_CAP_DAILY` in ALL THREE
  Vercel environments BEFORE the `vercel.json` cron line — ruling 4, and the only ordering this
  step creates. (b) The route now WRITES observations as well as 0028 rows, so the N2 prohibition
  on a manual production GET covers more than it did. (c) The first real `llm_conflict_match`
  ledger row is the WS-3.6 money-path proof; record it when it happens.

### Merge note for the operator — ONE real conflict with lane C, and how to resolve it

Checked after PR #93 was opened (`gh pr view <n> --json files`): lane C's four PRs are open and
unmerged. Three of them touch nothing this step touches — **#91** is gazetteer-only, **#92** is
`observation-store.ts` only (and its WS3-F04 identity check is exactly what this pipeline already
satisfies: the id is resolved from `edition_key`, never caller-chosen), **#94** is docs.

**#90 and #93 both edit `src/app/api/cron/conflict-validate/route.ts` and its test**, and git
will report textual conflicts in about three hunks. **Every one is additive and independent —
resolve by KEEPING BOTH SIDES:**

| hunk | #90 adds | #93 adds |
|---|---|---|
| the counter declarations | `probeIndeterminate`, `throttledDays`, `unparseableBodyDays` | `observations`, `unitsScored`, `rungs`, `skips`, `matcherRefusals` |
| the per-cell body | `dayStatusReason` (spread, omitted when null) | the `observeConflictDay` call and its five cell keys |
| the `counts.*` block | `counts.probeIndeterminate`, `counts.dayStatusReasons` | `counts.observations`, `counts.unitsScored`, `counts.matcherRungs`, `counts.observationSkips`, `counts.matcherRefusals` |

The test conflicts the same way: the `cells` `toContainEqual({...})` assertion gains
`dayStatusReason` from one side and the five observation keys from the other; the merged object
carries all of them. Nothing needs re-deciding, and neither side's semantics change.

**Order does not matter**, but merging #90 first is marginally easier — then #93 rebases onto a
route that already has the discovery counters, and this step's counters are appended to them.

### For step 23 lane C

Nothing here edits `edition-discovery.ts` or `observation-store.ts`. When WS3-F05 lands and
`EDITION_UNITS_VERSION` starts stamping the gazetteer, the pipeline needs **no change**: it
reads `winner.derived.units[].toponyms` and passes them to `classifyTheaterWith(gazetteerFor(series), …)`,
so populated Iran toponyms flow through automatically, and `unit-attribution.test.ts`'s
"today's Iran editions attribute as `unattributed`" case is the one to revisit at that point
(it asserts the branch-B behaviour deliberately, not a permanent contract).

### Prompt rewrites this step earns

- **`docs/prompts/2026-09-05-48h-24-ws3-5-scoreboard-and-soak-prep.md`** — replace any
  "`latestObservationsFor(query, id, { now: <Date> })`" reading with `now: () => Date`; add
  "`unit_attribution` is `unattributed` on every Iran row written before WS3-F05"; add
  "`laneDiagnostics` is structurally `{}` on the live path — comparability honesty is
  `incomparableTheaters`"; and add the three soak-checklist items above.
- **PLAN-WS-3 §3.3b** — its "Files" list said the pipeline would add the route; it ATTACHES to
  the existing one (the WS-3.2 handoff already corrected this). Its `editions.ts:446-477`,
  `editions.ts:383` and `scorer.ts:494-502` citations have moved; the corrected positions are in
  the table above.

## Proposed AGENTS.md changes

This session made **no** edit to `AGENTS.md` (COMMON §4.7: not a governance step, and no
standing line was made mechanically wrong by these PRs — the `drizzle/` range is untouched at
`0000–0030`). Step 25 applies the following.

1. **Directory map, `src/lib/conflicts/` (`:87-89`).** WS-3.1 and WS-3.2 both proposed a
   correction to the "pure — no DB/provider/env" claim; this step makes a third change to the
   same lines, so here is one merged replacement that supersedes both.
   Before (verbatim):
   ```
   src/lib/conflicts/  conflict/region validation domain library (71 files, pure — no DB/
                       provider/env; CONFLICT_REGISTRY, lanes, scorer, match-contract);
                       imported by nothing in production (design docs in docs/designs/)
   ```
   After:
   ```
   src/lib/conflicts/  conflict/region validation domain library (pure except three named
                       files: reference-repo-sql.ts + observation-store.ts + db-claim-sources.ts
                       are Postgres backends, and live-matcher.ts is the ONE module that may
                       reach a provider — matcher-import-hygiene.test.ts pins that in both
                       directions; CONFLICT_REGISTRY, lanes, scorer, match-contract). Imported
                       in production only by the dormant, unscheduled conflict-validate route
                       and src/lib/isw/edition-discovery.ts (design docs in docs/designs/)
   ```
2. **Standing ruling 4, caps list** — add, after the `EMBED_USD_CAP_DAILY` clause:
   `CONFLICT_MATCH_USD_CAP_DAILY` (daily, the conflict shadow matcher's own
   `llm_conflict_match` ledger row; NO default of any kind, so unset = the paid rung refuses
   before any reservation and the keyword rung scores; must exist in all three Vercel
   environments BEFORE the conflict-validate cron line is added).
3. **Proposed decision-log entry** (append at the END of the log, in date order):

   > **2026-09-09 (WS-3.3 — DB-backed evidence populations + the live observation pipeline;
   > branch/PR only)** The conflict layer stops being fixture-fed. `db-claim-sources.ts` (PR #86)
   > implements the two evidence-source contracts against the live tables: corpus recall over
   > `doc_claims` with the current-version predicate taken from `map-versions.ts` and **ANDed per
   > theater** (a flat OR over every mapped theater's version pairs would let a `ru` document
   > qualify on `ua`'s version, because the theater is part of `mapExtractorVersion`'s basis —
   > ruling 13 and ruling 14 in one predicate), and published retention over the designated
   > digests, version-unfiltered, with legacy-engine claims MEMBERS and labeled from the digest's
   > own `structured.stats.engine` stamp (memo C8 kept as shipped). Both bound a distinct-claim
   > subquery at `EVIDENCE_MAX_INTAKE + 1` and then join documents unbounded, so a claim arrives
   > with its complete document list or not at all; stub adapters are excluded AT THE QUERY in
   > both populations and both mirror joins (ruling 3). The `('generated','published')` member
   > set was CONFIRMED against `digest-persist.ts:167-171` — the one persist path for both
   > engines writes `'generated'` on insert and on the regeneration `DO UPDATE` — and pinned.
   > `live-observation.ts` (PR #93) attaches the pipeline BEHIND THE SAME unscheduled
   > conflict-validate job: `editionsForDay` → `selectDailyFinal` (C4) → re-fetch the winner →
   > declared units → lane (`other_in_scope` collapse, explicit, because a reference unit can
   > never be dropped) + flags (`unit-flags-v0`: `negative` deflationary, `compound`
   > UNDETERMINED per C13) + attribution (C3: recorded, never a filter) → both assemblies →
   > `scoreConflictReport` → ONE appended observation. **The money path is real and unreachable,
   > for a reason that does not depend on the route staying unscheduled:** `createLiveMatcher`
   > refuses on an absent `CONFLICT_MATCH_USD_CAP_DAILY` BEFORE a SpendGuard is built, before
   > `guard.init()` reads the database and before any client is constructed, and the guard
   > independently refuses `daily_usd_unset` — both pinned, the first by spies on the SDK
   > constructor and the query function. The shadow matcher meters on its OWN row
   > `llm_conflict_match` (memo C12), never production's `llm_match`, and the single billed vote
   > round is EXTRACTED from the production matcher as `dispatchMatchVote` rather than copied, so
   > the request is byte-identical and ruling 8's meter-before-parse order is shared. Import
   > hygiene now pins the package's paid surface at exactly one file in both directions. Built on
   > **branch B** of the step's own fork in the road: lane C's WS3-F01…F05 fixes were not on
   > `origin/main` (`4b8e7e7`), so Iran editions' stored toponyms are RU/UA-derived and every
   > Iran `unit_attribution` is the honest `unattributed` rather than a conflating `both`; the
   > winner's row id is RESOLVED from `edition_key` (never caller-chosen, WS3-F04), and
   > `probe_failed` is read as "could not tell", never as "did not publish" (WS3-F01, #114).
   > PR #87 threads the keyword rung's `insufficient_data` class into `ConflictResultV1`,
   > denominator-unchanged, and under **decision E5** regenerates the one affected golden, the
   > two committed conflict offline-results files and the conflict scorecard — deterministic,
   > zero provider contact, recorded in `docs/reviews/EVAL-EXPOSURE-LEDGER.md`; both dataset
   > content hashes move because the golden bytes feed `conflictDatasetContentHash`, and verdicts
   > are unchanged. Gates: typecheck/lint clean · unit **4,332 → 4,357 (#86) / 4,337 (#87) /
   > 4,441 over 288 files (#93)** · fork itests **15/15** on `br-wispy-brook-atkhgugi`
   > (`conflict-live-observation` 6/6 + `conflict-db-claim-sources` 9/9), plus
   > `br-wandering-rice-atdn4n25` and `br-young-bread-ath111iu`, all deleted. `vercel.json`,
   > `drizzle/`, `src/db/schema.ts` and `src/lib/validation/run.ts` byte-unchanged. No migration,
   > no env/cap change, no deploy, no production write, no paid call, **$0**. One deliberate
   > deviation, recorded rather than silently taken: the step-06 handoff also asked for
   > `gazetteerVersion` inside the result's `versions` block, and it was NOT added — the WS-3.1b
   > design makes the row a projection of the result and takes that stamp from the caller
   > precisely because the result does not know it, so adding it would create a second source of
   > truth for one column with no available cross-check. Report:
   > `docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md`.
