# WS-3.2 — series/edition-aware reference discovery + the report-only conflict-validate entrypoint

## Scope

| | |
|---|---|
| Prompt | `docs/prompts/2026-09-05-48h-14-ws3-2-edition-discovery.md` (step 14), plus the Handoff rewrite for step 14 in `docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md` §"Handoff — rewrite text for steps 13, 14, 19, 24" (COMMON §2.5 makes that text part of the prompt), and the 0028 names fixed by `docs/reviews/WS-3-1-PERSISTENCE-2026-09-06.md` §Handoff |
| Lane / worktree | `ws3-gazetteer` · `/Users/go/code/bnow-net-worktrees/48h-ws3-gazetteer-20260905` |
| Branches / PRs | PR 1 `48h/ws3-gazetteer-20260905-edition-discovery` → **#70**; PR 2 `48h/ws3-gazetteer-20260905-conflict-validate-route` → **#71** (stacked on #70; retarget to `main` after #70 merges) |
| Base SHA | `origin/main` **`a821695`** ("docs: steps 17 and 18 written in full…"). The session opened on `ef0bba8` and `origin/main` advanced twice mid-session; the final tree is rebased onto `a821695` and every gate below was re-run there. |
| Model / effort / mode | Opus / high / plain session |
| Attended? | **Unattended** (COMMON §4.10). The worktree carried the trimmed `.env.local` — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY` only, no provider or deploy credential — so a paid call or a deploy was structurally impossible from this session. |
| Decisions consumed | **D4 signed** ("yes sign all 14", INDEX §2.2). C2 = the route iterates `CONFLICT_DEFINITIONS`; C4 = store every edition, score the daily-final winner; C5 = link-only anchoring by URL equality. None was decided here. |
| Spend | **$0.** No paid provider call, no production write, no deploy, no environment change, no migration. Three disposable Neon forks, created and deleted by `scripts/test-integration.sh`. |

## Built

### PR 1 — `isw: series-aware edition discovery recording every edition (no collapse)` (#70)

| File | Change |
|---|---|
| `src/lib/isw/edition-discovery.ts` | **new** — the whole discovery module (probe loop, pure helpers, the `--series` window driver) |
| `src/lib/isw/edition-discovery.test.ts` | **new** — 33 cases |
| `fixtures/isw/editions/*` | **new** — five synthetic per-shape fixtures + a README recording that they are authored, not scraped |
| `src/lib/conflicts/editions.ts` | `derived` added to `ReferenceEditionRecord` with a CLOSED validated shape (`EditionUnitSignature`, `EditionDerived`, `validateEditionDerived`, `canonicalEditionDerived`, `EDITION_DERIVED_KEYS`, `EDITION_SIGNATURE_TOKEN_RE`, `EDITION_DERIVED_UNIT_LIMIT`, `EDITION_DERIVED_VERSION_RE`) |
| `src/lib/conflicts/reference-repo.ts` | `derived` merge rule in the ONE write authority; `"derived"` appended to `EDITION_REPAIRED_FIELDS`; new `DryRunReferenceReportRepository` decorator |
| `src/lib/conflicts/reference-repo-sql.ts` | `derived` in `EDITION_COLUMNS` / `EDITION_SELECT` / the CTE insert (`$16::jsonb`) / the compare-and-swap write list and guard (`derived IS NOT DISTINCT FROM $22::jsonb`) |
| `scripts/isw-refresh.ts` | `--series roca\|iran_update --from A --to B [--dry]` as the FIRST branch of `main()` |
| `scripts/isw-refresh.test.ts` | **new** — 6 cases pinning the `--theater` path and the mode gate |
| `src/integration/conflict-edition-discovery.itest.ts` | **new** — 5 fork cases |
| `src/integration/conflict-reference-repo.itest.ts` | one param added to the direct `EDITION_UPSERT_SQL` atomicity case (the statement now binds 16 parameters) |
| `AGENTS.md` | ONE standing line corrected in place (`:82`, the `src/lib/isw/` directory-map entry) — the single carve-out COMMON §4.7 allows |
| `docs/PROGRESS.md` | plan block + Execution bullets |

**What it does.** `discoverEditions({repo, query, fetch?, now?}, series, reportDate)` probes EVERY shape
the versioned normalization table knows and never `break`s — that is decision C4 in code. Production
discovery (`src/lib/validation/run.ts:102-105`) stops at the first hit and inserts ONE `isw_reports` row
per `(theater, report_date)` (`:114`, `ON CONFLICT (url)`), so a second same-day edition is never
registered and which of the two the corpus holds depends on probe ORDER, not on finality. Each hit is
recorded through `SqlReferenceReportRepository` — i.e. through the ONE merge authority
(`mergeEditionRecords` / `nextStoredDayStatus`) — so replay semantics cannot drift from the in-memory
backend. A probe counts as an edition iff `status === 200 && html.length > 10_000`, the SAME threshold
production applies (`run.ts:105`), so discovery can never register a page production would have skipped.

**What it does NOT write.** Only the migration-0028 tables. `isw_reports` and `source_citations` are
read-only to it and `refreshReportCitations` (`src/lib/isw/load.ts:284`) is never called; the production
validation path stays byte-identical and remains the sole registry writer. `isw_report_id` is set by the
C5 link-only lookup: an edition anchors iff the existing `isw_reports` row for its `(theater,
report_date)` — at most one, `isw_reports_theater_date_idx` (`schema.ts:151`) guarantees it — carries a
URL that canonicalizes to the same canonical URL. Siblings on a multi-edition day stay NULL rather than
borrowing another edition's endnote list.

**Deviation from the plan's wording, deliberately:** the plan specified the anchor lookup as
`SELECT id … AND url = $canonical`. Shipped as `SELECT id, url … WHERE theater = $1 AND report_date = $2`
with the comparison done on `canonicalizeIswUrl` of BOTH sides. It reads the same single row, and it
matches a `www.`/scheme/trailing-slash spelling of the same edition that a byte `=` would have missed —
strictly more faithful to "URL equality" and pinned by a test.

**Gaps are never fabricated.** A day with no hit records `probe_failed`. It hardens into
`publication_gap` only when a LATER run again sees every shape return a clean 404 (`status === 404`
exactly — a network failure, a retried 5xx or an undersized 200 is NOT a clean 404) **and** the report
day is at least 48 h old, measured from 00:00Z of the report date, i.e. ≥24 h after the day closed. The
monotone `probe_failed → publication_gap` transition (`editions.ts:692`) is the confirmation mechanism.

**The 0028 `derived` column gains its first writer.** The WS-3.1 PR created the column and left it
unwritten. `derived.units = [{ordinal, sha256, toponyms, actions, chars}]` plus a `unitsVersion` stamp,
carried through the same merge authority as every other field so the two backends cannot drift. The
shape is CLOSED and validated fail-closed: an unknown key is refused, a unit must hold exactly those five
fields, `sha256` must be 64 lowercase hex, signature tokens must match the canonical gazetteer key shape,
the payload is bounded at 200 units, and `units` and `unitsVersion` require each other. That is what makes
ruling 1 structural here rather than a matter of caller discipline. Merge rule: a non-empty incoming
payload wins (a re-parse is a refresh); an EMPTY one never erases a stored one, mirroring the
`parse_status` never-downgrade rule; an identical re-parse is `unchanged`.

**`scripts/isw-refresh.ts --series`** drives discovery across a date window, one line per day, and prints
the C5 measurement summary. `--dry` runs through the new `DryRunReferenceReportRepository`: reads
delegate, writes are COMPUTED through the same merge authority and discarded, so a measurement pass over
the production database makes ZERO writes while still reporting exactly what a live run would have done.

### PR 2 — `cron: conflict-validate route (report-only entrypoint, unscheduled)` (#71)

| File | Change |
|---|---|
| `src/app/api/cron/conflict-validate/route.ts` | **new** |
| `src/app/api/cron/conflict-validate/route.test.ts` | **new** — 11 cases |
| `src/lib/usage/cron-run.ts` | `JOB_MAX_DURATION_SEC` gains `"conflict-validate": 300` |

`CRON_SECRET` bearer auth exactly like its siblings; `withCronRun("conflict-validate", …)` start-row
semantics (ruling 10); iterates `CONFLICT_DEFINITIONS` (`definitions.ts:132`) per C2; `?date` defaults to
yesterday UTC; `?lookback` defaults to 2 (memo C4) and is bounded 1..3; `?conflict` narrows to one
definition. **Every parameter is validated BEFORE the run row is opened** — a malformed invocation leaves
no `cron_runs` row and, more importantly, writes no 0028 row from a silent default. Counts summary only;
step 19 attaches the observation pipeline behind this same job.

**#87 discipline:** only a THROWN cell degrades the run. A `probe_failed` day is a benign, self-healing
observation (ISW publishes late in the ET evening; a transient 5xx is routine) and must not flip a healthy
run. A thrown cell does not abort the loop.

**NOT in `vercel.json`.** The file header states it, and a test asserts it.

## Tests

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | **0 errors** (3 warnings, all pre-existing in files this step does not touch: `validate/route.test.ts`, `hardening.test.ts`, `cron-run.test.ts`) |
| `npm test` — base `a821695` | **3,914 over 263 files** (measured on the base, not quoted) |
| `npm test` — after PR 1 | **3,970 over 265 files** (+56) |
| `npm test` — after PR 2 | **3,981 over 266 files** (+11) |
| `npm run test:integration -- src/integration/conflict-edition-discovery.itest.ts src/integration/conflict-reference-repo.itest.ts` | **17/17 (5 + 12)** on disposable Neon fork **`br-long-rain-at2q7t3b`**; log shows `applying 0028…`, `applying 0029…`, `migrations up to date`. Earlier identical runs: 5/5 on `br-red-paper-atomtrew`, 12/12 on `br-rough-hill-at486d71` |
| enforced pre-push gate | green on both pushes |
| Spend | **$0** |

New unit cases by area: discovery 33 (`edition-discovery.test.ts`), `--series` CLI 6
(`scripts/isw-refresh.test.ts`), route 11, `derived` validation 8 (`editions.test.ts`), `derived` merge 5
(`reference-repo.test.ts`), `derived` SQL round-trip 3 (`reference-repo-sql.test.ts`), plus one existing
CAS pin extended.

Fork itest cases: (a) both editions of a two-a-day date recorded, all four shapes probed, only the
URL-equal one anchored, `derived` round-tripping through jsonb as signatures + hashes, and the finality
ordering read back from the DB rather than from insert order; (b) a replay is `unchanged` with no
duplicate row; (c) an all-404 day stores `probe_failed` and only a SECOND run confirms the gap, both
asserted on the stored `benchmark_series_days.status`; (d) `--dry` over the same window changes neither
row count; (e) the citation registry is UNTOUCHED — identical counts across `isw_reports` /
`source_citations` / `sources` / `source_theater_stats` AND a byte-comparison of the anchor row's tuple
against a `beforeAll` baseline pinned non-vacuous first.

### Acceptance (prompt §Acceptance)

- Unit green with counts — above.
- Fork itest name + result — `src/integration/conflict-edition-discovery.itest.ts`, 5/5 on
  `br-long-rain-at2q7t3b`.
- `git diff origin/main -- src/lib/validation/run.ts` — **EMPTY** (0 lines).
- `git diff origin/main -- vercel.json` — **EMPTY** (0 lines).
- Also empty: `git diff origin/main -- drizzle/ src/db/schema.ts` (no migration of its own).

## Rulings touched and how each is satisfied

- **Ruling 1 (no ISW prose).** The fetched page body is transient — it lives in `discoverEditions`'s
  stack frame and reaches only `extractReportInstants` and `extractTakeawaysWithText`. What persists is
  the edition identity, instants, treatments, enum values, version identifiers, URLs, and
  `derived.units`. `validateEditionDerived` makes a prose field UNREPRESENTABLE (unknown key refused;
  unit keys fixed to the five allowed; tokens must match `^[a-z0-9]+(?:_[a-z0-9]+)*$`), and a test over
  a REAL Iran page asserts every stored token is a member of the gazetteer's key vocabulary and that no
  three-word fragment of any bullet appears anywhere in the payload. The `probes` array the route records
  holds URL, status and byte count only.
- **Ruling 5 (migration additivity).** No migration; the step consumes 0028 as it stands.
  `git diff origin/main -- drizzle/ src/db/schema.ts` is empty, so `9999_claim_source_trigger.sql` is
  untouched and still last by construction.
- **Ruling 10 (`cron_runs` written at START; `finished_at IS NULL` is the timeout signal).** The route
  uses `withCronRun` unchanged. Its `JOB_MAX_DURATION_SEC` entry (300, matching `export const
  maxDuration = 300`) keeps the #98 sweep's ceiling truthful for the new family instead of letting it
  fall to the widest-ceiling fallback; the lockstep test enumerates route files and would have failed
  without it.
- **Ruling 12 (dedup verdicts).** No dedup path is reached; no dedup semantics change.
- **Ruling 14 (per-theater digest corpora).** No corpus is touched; no digest, claim or gather path is
  reached.
- **Ruling 13 (map extractor versions).** Untouched — no map input, no version basis, no `MAP_*` read.
- **Ruling 4 (spend).** No paid call site is added or reached. The module's only network primitive is
  `politeFetch`, which is unmetered by design.
- **Scraper conventions.** Inherited from `politeFetch` (≥2.1 s per host, `fetch-cache.ts:11`; the
  `BNOWBot/0.1` UA; disk cache). Cost is documented at the function: ROCA 1 probe/day, Iran Update 4, so
  a two-conflict two-day cron cycle spends ~21 s in fetch spacing alone.

## Citations re-verified

| Cited in the prompt / plan | Status on `a821695` |
|---|---|
| `run.ts:96-122` (probe loop, `break`, one row per `(theater, date)`) | correct in substance; the exact lines are `:102` (candidate loop), `:105` (`status === 200 && html.length > 10_000`, then `break`), `:107-118` (the `ON CONFLICT (url)` insert) |
| `run.ts:15` `iswUrlForDate` | **correct** |
| prompt's "`iranUpdateUrlCandidatesForDate` :21, and the third builder at :31" | **transposed.** `:21` is `iranUpdateUrlForDate`; `:31` is `iranUpdateUrlCandidatesForDate`. The plan (§3.2a) has it right. This step imports `iswUrlForDate` (`:15`) and `iranUpdateUrlCandidatesForDate` (`:31`); `iranUpdateUrlForDate` (`:21`) is subsumed by the candidate list and is deliberately not imported |
| `run.ts:44-56` `referenceFor` (the series→theater mapping) | `:45`; ru/ua → theater `"ru"`, ir → `"ir"` — the mapping `SERIES_ISW_THEATER` reproduces, pinned by test |
| `editions.ts:87-132` (normalization to a label; unknown shape refused) | **moved** — `normalizeIswEditionUrl` is now `:126` (WS-3.1 inserted `canonicalizeIswUrl` at `:98`) |
| `editions.ts:352-359` (finality rank), `:446-477` (`selectDailyFinal`) | **moved** — `EDITION_FINALITY_RANK` is `:534`, `selectDailyFinal` is `:628` (this PR's `derived` block adds ~130 lines above them) |
| `editions.ts:504-527` (monotone day-status transition) | **moved** — `nextStoredDayStatus` is `:692` |
| `isw/load.ts:284-290` `refreshReportCitations` | **correct** (`:284`) — and never called here |
| `fetch-cache.ts` ≥2.1 s host spacing | **correct** — `HOST_SPACING_MS = 2100` at `:11` |
| `definitions.ts:132` `CONFLICT_DEFINITIONS` | **correct** |
| `schema.ts:151` UNIQUE `(theater, report_date)` on `isw_reports` | **correct** (`isw_reports_theater_date_idx`); `:150` is `isw_reports_url_idx` |
| `report-extract.ts:283` `extractReportInstants` | **correct** |
| `isw-extract.ts:67-92` `extractTakeawaysWithText` | **correct** (`:67`) |
| WS-3.1 Handoff: 0028 table/column/index names, repository surface, `canonicalizeIswUrl`, `anchorJournal()` | **correct and used as final.** The repository canonicalizes for `provider: "isw"`, so discovery relies on that as the Handoff suggested (it also canonicalizes at the call site, so the value it stores in `isw_report_id` comparisons and in its own return shape is the canonical one) |
| `cron-run.ts:182` (the run id is already held, for step 19's `runId` argument) | **moved by one line** — `const id = await startRun(job)` is `:183`. Still additive and still available |
| PLAN-WS-3 §3.2b `withCronRun(job, (counts, runId) => …)` | **not yet available** — the second callback argument is PR 3.1b's additive change (step 13b) and has not landed. This route uses the current single-argument signature; step 19 adds the argument when it needs it |

## Decisions needed

1. **N2 — the manual production GET.** Already recorded (INDEX §2.3): a manual
   `GET /api/cron/conflict-validate` in production writes 0028 rows and is forbidden until the WS-3.6
   scheduling entry, except one operator-signed bounded smoke (one date, one conflict). **Nothing in
   this step needs it**, and the route header says so. No new decision — flagged only because the route
   now exists and is callable with the secret.
2. **The C5 measurement itself has not been taken.** The prompt asks step 14 to report "days with >1
   edition, and anchor ≠ final count" over "any real window the operator lets `--dry` probe". That is a
   run against the production database, and no signed authorization for it exists (O2 authorizes
   `--theater ru` writes for #79; it does not cover this). The instrument is built, tested and
   write-free; **the measurement is an operator action.** Recommendation: authorize
   `npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 --dry` and the
   ROCA equivalent — read-only against `isw_reports` and `benchmark_*`, ~4 probes/day × 31 days ≈ 4.5 min
   of politeFetch spacing per series, zero writes, zero spend. Its output is the evidence WS-3.7 needs to
   decide whether to change production's probe order.
3. **`benchmark_series_days` has no timestamp, so the plan's "a `probe_failed` row from a run ≥24 h
   earlier" is not verifiable.** Shipped as: an earlier run stored `probe_failed` AND the report day is
   ≥48 h old. Options: (a) accept as shipped (recommended — it is strictly two runs, and the day-age
   bound covers the late-publication case the 2026-08-15 lesson was actually about); (b) add
   `first_observed_at timestamptz` to `benchmark_series_days` in a later migration and require a real
   24 h separation. Under (a) the residual is: two runs minutes apart during ONE transient outage over an
   old window can still confirm a gap. Recorded in the module and in Debt below.
4. **Two operational notes for step 24 / WS-3.6 scheduling.** (i) `?lookback=2` costs 2 conflicts × 2
   days × (1 + 4) probes = 20 probes ≈ 42 s of politeFetch spacing per run, comfortably inside
   `maxDuration = 300` but not inside a 60 s ceiling if one is ever imposed. (ii) The route must be
   scheduled AFTER ISW's usual publication hour or every run will legitimately record `probe_failed` for
   the newest day; a daily run at or after the existing `validate` cron's `07:00Z` is the natural slot.

## Debt and risks

- **The gap-confirmation age bound is a proxy, not a proof** (decision 3 above). Documented at
  `confirmGapEligible` and test-pinned at the boundary in both directions.
- **`edition_write_contention` is reachable in principle** through discovery too: four lost CAS rounds on
  one edition throws instead of writing. Under the single-writer cron it is unreachable; the route
  classifies such a throw as a degraded cell rather than swallowing it.
- **`derived` widened the deployed statements.** `EDITION_UPSERT_SQL` now binds 16 parameters and the CAS
  binds 22. Any caller issuing those constants directly must be updated — one existed
  (`conflict-reference-repo.itest.ts`'s atomicity case) and it was. Both constants stay exported so the
  itest proves the deployed statement rather than a copy.
- **The in-memory ⇄ SQL divergence is unchanged in kind**: the in-memory backend still does not
  canonicalize URLs. `derived` does NOT add a new divergence — both backends route it through
  `canonicalEditionDerived`.
- **Discovery issues one anchor-lookup query per edition found** (≤4/day/series). Hoisting it to one
  query per day is a trivial future change; it is left per-edition because the C5 rule is per-edition and
  the cost is negligible against the 2.1 s fetch spacing.
- **The five per-shape fixtures are synthetic.** They exercise every branch of the probe loop offline
  without putting provider prose in the repository, but they cannot prove the extractor's behaviour on a
  real morning/evening pair — the repository holds no real two-a-day page. Mitigated by running the real
  ROCA and Iran fixtures through `unitSignaturesFrom` and the full record path; the residual is that
  "morning and evening of the SAME real day" is fixture-modelled, not corpus-proven.
- **Process incident, recorded rather than hidden.** Mid-session this worktree's `HEAD` moved from the
  step branch to the lane branch `48h/ws3-gazetteer-20260905` (which another process had fast-forwarded
  to `origin/main` `a821695`) without this session issuing the checkout — reflog entry
  `HEAD@{2026-09-06 20:58:18 -0400}: checkout: moving from …-edition-discovery to 48h/ws3-gazetteer-20260905`.
  The consequence was that the PROGRESS.md plan-block commit fell out of the branch and the first PR-1
  commit landed on the LANE branch. Repaired before pushing: the plan block was re-created on
  `a821695`, both work commits were rebased onto it with `git rebase --onto`, the two step branches were
  pointed at the right commits, and the lane branch was reset to `a821695` (its pre-incident value). No
  work was lost; every gate was re-run on the final tree. Worth a look by whoever is running the
  concurrent lanes — a shared `.git` means a stray `git checkout` in one place is observable in another.

## Handoff

### The discovery API step 19 calls

```ts
import { discoverEditions, type EditionDiscoveryResult } from "@/lib/isw/edition-discovery";

const out: EditionDiscoveryResult = await discoverEditions(
  { repo, query, fetch?, now? },   // repo: ReferenceReportRepository; query: QueryFn
  series,                          // ReferenceSeriesId — def.referenceSeries
  reportDate,                      // yyyy-mm-dd
);
```

`EditionDiscoveryResult` = `{ series, reportDate, editions, dayStatus, dayStatusAction, probes,
probeFailures, anchored }`, and each entry of `editions` is
`{ editionKey, label, canonicalUrl, action: "inserted"|"unchanged"|"repaired", repairedFields,
parseStatus, units, anchoredReportId }`. There is **no html anywhere in the return shape**. It throws
`ConflictDomainError` on builder drift (before any fetch) and lets a repository refusal
(`edition_url_conflict`, `edition_write_contention`) propagate.

**Step 19 does NOT call `discoverEditions` again for the scoring input.** Discovery has already written
the edition rows; the observation pipeline reads them back with
`repo.editionsForDay(series, day)` and picks the winner with `selectDailyFinal(...)` (C4). The reference
UNIT TEXTS it needs for matching are transient and are NOT in the edition row — the row carries only the
`derived.units` signatures. Step 19 must re-fetch the winner's `canonicalUrl` through `politeFetch` (the
page will be in the disk cache locally) and re-run `extractTakeawaysWithText`, exactly as production
`validateDigest` does. `derived.units[].sha256` is the stable identity to join those re-extracted units
back to what discovery saw — that is what memo C13 wants it for.

### The edition ids' shape

- Domain identity: `editionKey = "<series>:<reportDate>:<label>"`, e.g.
  `"iran_update:2026-08-12:evening"`. Labels are exactly the `NORMALIZED_EDITION_LABELS` members —
  `roca: ["daily"]`, `iran_update: ["special","evening","morning","plain"]`. Discovery can never emit
  anything else: an unknown shape is a typed refusal, never an invented label.
- Row identity for 0029/0030's `reference_edition_id` FK: `benchmark_report_editions.id` (serial). The
  repository surface does **not** return it. Step 19's `persistObservation` should resolve it with
  `SELECT id FROM benchmark_report_editions WHERE edition_key = $1` on the winner's key — a
  UNIQUE-indexed lookup (`benchmark_report_editions_key_idx`). If a helper is wanted, add
  `editionRowId(editionKey)` to `SqlReferenceReportRepository` in that PR; discovery does not need it.
- `derived` payload: `{ units: [{ordinal, sha256, toponyms, actions, chars}], unitsVersion:
  "isw-unit-sig-v1" }` or `{}`. `ordinal` is the 0-based declared order; `sha256` is over the
  whitespace-normalized unit text; `unitsVersion` must be bumped if either the hash normalization or the
  signature source changes, and two versions' unit sets must never be compared.

### Soak-scheduling note for step 24

The route exists, is auth-gated, and is **not** in `vercel.json`. Adding the cron line is the WS-3.6
operator step that turns it from dormant into a writer, and it must not precede the enablement checklist.
Two things belong on that checklist because of this step:

1. **Order with the cap.** Ruling 4's ordering (memo C12/N1): `CONFLICT_MATCH_USD_CAP_DAILY` must exist
   in ALL THREE Vercel environments BEFORE the cron line is added, never after. Nothing in this route
   spends today, so the ordering bites only once step 19's matcher lands behind it.
2. **Schedule slot and shape.** A daily run at or after `07:00Z` with the default `?lookback=2`; earlier
   than ISW's publication hour and every run legitimately records `probe_failed` for the newest day.
   Budget ~42 s of politeFetch spacing per run at two conflicts (`maxDuration = 300`).

Also for step 24's read model: a day's "current headline" edition is the `selectDailyFinal` winner over
`editionsForDay`, and `citation_anchor = none` is a legitimate, expected state on multi-edition days
(C5) — the view must render it as `unavailable`, never by borrowing a sibling edition's endnotes.

### Prompt rewrites this report earns

- **`docs/prompts/2026-09-05-48h-14-ws3-2-edition-discovery.md`** — the Background block's builder line
  reads "`iswUrlForDate` :15, `iranUpdateUrlCandidatesForDate` :21, and the third builder at :31". Replace
  with "`iswUrlForDate` :15, `iranUpdateUrlForDate` :21 (subsumed by the candidate list — do not import
  it), `iranUpdateUrlCandidatesForDate` :31". Also: `editions.ts`'s cited lines have all moved (see
  Citations above), and both PRs are now built, so a re-run of this step is a review, not a build.
- **`docs/prompts/2026-09-05-48h-19-ws3-3-evidence-population.md`** — add to `Depends on`: "#70/#71 on
  `main`; read `docs/reviews/WS-3-2-EDITION-DISCOVERY-2026-09-06.md` §Handoff first — `discoverEditions`
  is already wired behind `/api/cron/conflict-validate`, so PR 3.3b ATTACHES to that route rather than
  adding one, and the reference unit texts must be re-extracted from the winner's page (the edition row
  carries signatures and hashes only, joinable by `derived.units[].sha256`)."
- **`docs/prompts/2026-09-05-48h-24-ws3-5-scoreboard-and-soak-prep.md`** — add to the 3.6-prep checklist
  the two scheduling items above (cap-before-cron ordering; the ≥07:00Z slot with `?lookback=2`), and
  note that `citation_anchor = none` is an expected state the view must render as `unavailable`.

## Proposed AGENTS.md changes (step 25 applies; this step made only the one carve-out edit)

1. **Applied here, in place (the carve-out):** `AGENTS.md:82`, directory map.
   Before: `src/lib/isw/        crawler, endnote parser, hedging classifier, registry materializer`
   After: the same line plus two continuation lines naming `edition-discovery` as
   "series/edition-aware reference discovery writing only the 0028 benchmark tables — dormant,
   unscheduled".
2. **Proposed, not applied — the routes line in the Architecture block.** The product-surface diagram
   lists `src/app/            routes (public pages, /admin/*, /api/cron/*, /api/*)`, which stays true;
   nothing there needs changing. What DOES need a line once #70/#71 merge is the Current-state snapshot,
   which today says nothing about a conflict-validate entrypoint existing. Suggested addition to the
   **Product/access** bullet (or a new sentence in **Analysis**):
   > A report-only `GET /api/cron/conflict-validate` exists in the repository and is **not** in
   > `vercel.json`: it iterates `CONFLICT_DEFINITIONS`, runs WS-3.2 edition discovery, and writes only
   > the migration-0028 benchmark tables. Scheduling is a WS-3.6 operator step; a manual production GET
   > writes 0028 rows and is forbidden until the N2 decision says otherwise.
3. **Proposed, not applied — carried forward from WS-3.1's report and now MORE wrong**, the
   `src/lib/conflicts/` directory-map entry at `:87-89` still says "pure — no DB/provider/env". Two files
   now diverge, not one: `reference-repo-sql.ts` (the 0028 Postgres backend) and, as of this step,
   nothing else in that directory — but `src/lib/isw/edition-discovery.ts` now imports the conflicts
   layer from OUTSIDE it, which the entry's "imported by nothing in production" clause makes misleading.
   Suggested After:
   > `src/lib/conflicts/  conflict/region validation domain library (71 files, pure except`
   > `                    reference-repo-sql.ts — the Postgres backend for migration 0028's`
   > `                    benchmark tables; CONFLICT_REGISTRY, lanes, scorer, match-contract);`
   > `                    imported in production only by the dormant, unscheduled conflict-validate`
   > `                    route and src/lib/isw/edition-discovery.ts (design docs in docs/designs/)`
4. **Proposed decision-log entry** (append at the BOTTOM):

   > **2026-09-06/07 (WS-3.2 — series/edition-aware reference discovery + the report-only
   > conflict-validate entrypoint; branch/PR only)** Production discovery
   > (`src/lib/validation/run.ts:102-105`) probes candidate slugs in likelihood order, `break`s at the
   > first hit, and inserts ONE `isw_reports` row per `(theater, report_date)`, so a second same-day
   > edition is never registered and which of the two the corpus holds depends on probe ORDER rather
   > than on finality. `src/lib/isw/edition-discovery.ts` (PR #70) probes EVERY shape the versioned
   > normalization table knows and records each hit as its own edition row through
   > `SqlReferenceReportRepository` — decision **C4** (store every edition; the daily-final WINNER is
   > selected at scoring time by `selectDailyFinal`, never by discovery). It writes ONLY the
   > migration-0028 tables: `isw_reports` and `source_citations` are read-only to it and
   > `refreshReportCitations` is never called, so the production validation path stays byte-identical
   > and remains the sole registry writer — proven on a fork by identical registry counts plus a
   > byte-comparison of the anchor row's tuple. `isw_report_id` is set by the **C5** link-only lookup
   > (an edition anchors iff the day's existing `isw_reports` row carries a URL that canonicalizes to
   > the same canonical URL; siblings stay NULL rather than borrowing another edition's endnotes). A
   > day with no hit records `probe_failed` and hardens into `publication_gap` only on a LATER run that
   > again sees every shape return a clean 404 AND once the day is ≥48 h old — the 2026-08-15 lesson;
   > `benchmark_series_days` carries no timestamp, so "the earlier probe came from a run ≥24 h ago" is
   > NOT verifiable and the residual is recorded rather than claimed away. The 0028 `derived` column
   > gains its first writer, carried through the SAME merge authority as every other field:
   > `derived.units = [{ordinal, sha256, toponyms, actions, chars}]` + a version stamp, with a CLOSED
   > fail-closed shape (unknown key refused, tokens must be canonical gazetteer keys, sha256 64 hex,
   > bounded length) so standing ruling 1 is structural rather than a matter of caller discipline.
   > `scripts/isw-refresh.ts` gains `--series … [--dry]` as the FIRST branch of `main()` — the
   > `--theater` path is byte-identical and pinned both structurally and behaviourally — and `--dry`
   > runs through a new write-refusing repository decorator so the **C5 measurement over production
   > makes zero writes**; that measurement is an operator action and has NOT been taken. PR #71 adds
   > `GET /api/cron/conflict-validate`: `CRON_SECRET` auth, `withCronRun` (ruling 10), iterating
   > `CONFLICT_DEFINITIONS` per **C2**, `?date`/`?lookback` (1..3, default 2)/`?conflict`, every
   > parameter validated BEFORE the run row is opened, counts summary only, and only a THROWN cell
   > degrading the run (#87 discipline — a `probe_failed` day is benign). It is deliberately **NOT in
   > `vercel.json`**: scheduling is a WS-3.6 operator step, and a manual production GET writes 0028 rows
   > and is forbidden until the N2 decision says otherwise. Gates on the exact pushed trees:
   > typecheck/lint clean (0 errors) · unit **3,914 → 3,981 over 266 files** · fork itests 17/17
   > (`conflict-edition-discovery` 5/5 + `conflict-reference-repo` 12/12) on `br-long-rain-at2q7t3b` ·
   > `git diff origin/main` empty for `src/lib/validation/run.ts`, `vercel.json`, `drizzle/` and
   > `src/db/schema.ts`. No migration, no env/cap/model/schedule change, no deploy, no production write,
   > no paid call, $0. Report: `docs/reviews/WS-3-2-EDITION-DISCOVERY-2026-09-06.md`.
