# WS-3.0 — Conflict-validation decision memo (C1–C14, N1–N3)

| | |
|---|---|
| Step | 05 of the 48h program (`docs/prompts/2026-09-05-48h-05-plan-ws3-conflict.md`) |
| Model / effort / mode | Fable / xhigh / plan mode — planning only (model gate: Fable, no fallback) |
| Worktree / branch | `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` · `48h/ws3-conflict-20260905-step05-ws3-plan` |
| Base | `origin/main` `dff58f2` (2026-09-06; after `883e5e3`) |
| Companion | `docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md` (the PR-by-PR plan) |
| Status | **Every item below is LISTED with a recommendation. Nothing is decided.** The operator answers at Checkpoint 1 (INDEX §2 D4); an unanswered item stalls only the PRs §4 names. |
| Spend | $0. No DB access. No code. |

## 0. Why this memo differs from the handoff

The CTO handoff (`docs/prompts/2026-09-05-cto-roadmap-handoff.md` §4.3) describes WS-3.1/3.3/3.5
from the roadmap's memory of the conflict workstream. The reviewed designs and the code that
actually shipped in `src/lib/conflicts/` (71 files, three Fable audits, PRs #16–#22 landed
2026-08-24) say something different in four places, and this memo is grounded in the shipped
artifacts, not the handoff:

1. **Schema.** The handoff's WS-3.1 (add `series`/`edition` to `isw_reports`, relax the unique
   key) is Option 1 of `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` §2, which that design
   REJECTED (:32-47) in favour of Option 3 (:64-87) — new `benchmark_report_editions` +
   `benchmark_series_days`, `isw_reports` untouched. → C1.
2. **`legacy_only`.** The handoff says gulf legacy claims are "excluded from the numerator". The
   shipped contract excludes them from CORPUS RECALL only and keeps them as labeled MEMBERS of
   published retention (`eligibility.ts:213-219` vs `:287-314`). → C8.
3. **`/scoreboard` is public**, ungated and sitemap-listed (`gate.ts:5-8`, `sitemap.ts:16`,
   `scoreboard/page.tsx:37-52`). The handoff's WS-3.5 gate order would gate or 404 a public
   marketing surface. → C10.
4. **The Iran keyword rung already returns a scored outcome** (`keyword-matcher.ts:108-116`,
   `keywordUnmatchable` at `:77-81`). The recorded pre-soak blocker is the missing
   `insufficient_data` diagnostic plus the empty Iran gazetteer (register #12, landing §6), not
   "unavailable". Step 06 is building exactly that. → C7 and the restated acceptance.

## 1. The unit of validation — today versus proposed (evidence)

Today (`src/app/api/cron/validate/route.ts:24` → `src/lib/validation/run.ts:74-281`):

| Step | Where | What it does |
|---|---|---|
| theater loop | `route.ts:24` | `["ru","ua","ir"]` |
| reference | `run.ts:45-57` | `referenceFor` maps ru AND ua to the ROCA row (theater `ru`); ir to the Iran Update |
| digest | `run.ts:83-90` | one `military` digest for that ONE country |
| report | `run.ts:92-122` | one `isw_reports` row per `(theater, report_date)` (UNIQUE, `schema.ts:151`); probe candidates in likelihood order and `break` at the first 200 (>10 KB) — a same-day second edition is unrepresentable |
| filter | `run.ts:152-167` | ru/ua only: keep takeaways whose `classifyTakeawayTheater` is `both` or own side; `both` lands in BOTH denominators; index alignment load-bearing (`:145-151`) |
| candidates | `run.ts:176-187` | claims of that ONE digest (`cl.digest_id = $1`) |
| persist | `run.ts:219-226` | UPSERT on UNIQUE `(digest_id, isw_report_id)` (`schema.ts:325`) — revalidation overwrites |

Consequences the conflict contract fixes: one ROCA report → two country rows over overlapping
denominators (contract §1 item 7); Iran scores only the ir `military` digest, structurally
excluding `nuclear`/`elite_politics` and every il/gulf claim; the RU/UA-only gazetteer
(`keywords.ts:5-41`, `TOPONYM_THEATER :82-93`) returns `both` on no signal (`:109`).

Proposed (shipped, dormant): one reference edition → one declared-unit set → one eligible
conflict evidence set → one combined evaluation (contract §2). The registry
(`definitions.ts:96-129`) binds `russia_ukraine` → series `roca`, contributors ru+ua (`mapped`),
track `military`; `iran_regional` → `iran_update`, ir (`mapped`) + il/sa/ae/qa/om/bh/kw
(`legacy_only`), tracks military+nuclear+elite_politics. Nothing in `src/lib/validation`,
`src/lib/isw` or `src/app/api/cron` imports `src/lib/conflicts` today (confirmed), so the two
units can coexist through the shadow soak (soak design §2 :37-48).

## 2. The decisions

Format per item: options → evidence → recommendation → what changes → which PRs it blocks.

### C1 — Schema option for reference editions

**Options.** (1) Extend `isw_reports` forward: add `series`/`edition_label`/`cutoff_at`/…,
replace UNIQUE `(theater, report_date)` with `(series, report_date, edition_label)`, backfill
`ru→roca`, `ir→iran_update` (the handoff). (2) Additive child table FK'd to `isw_reports`.
(3) Provider-neutral `benchmark_report_editions` keyed by the domain `editionKey` +
`benchmark_series_days`, nullable `isw_report_id` FK, `isw_reports` untouched (the design).

**Evidence.** `isw_reports` carries UNIQUE `(url)` AND UNIQUE `(theater, report_date)`
(`schema.ts:150-151`); `run.ts:123` reads `reports[0]` of the theater/date query, safe today
ONLY because the unique index guarantees one row — relaxing it makes that read the forbidden
"arbitrary same-date rows[0]" the moment a second edition lands (design §2 :37-43).
`source_citations.report_id` FKs `isw_reports.id` (~351K rows) and `refreshReportCitations`
(`src/lib/isw/load.ts:284-290`) is anchored to that id — Option 1 forces every existing reader
to become edition-aware at once (design :44-46). Option 3 already exists as reviewed code: the
disposable DDL `src/integration/sql/conflict-benchmark-reports.sql`, `SqlReferenceReportRepository`
(`reference-repo-sql.ts`), the merge authority (`reference-repo.ts`), `normalizeIswEditionUrl`
(`editions.ts:87-132`, test-pinned against every URL `run.ts` can emit, design §6), and
`conflict-reference-repo.itest.ts` proving registry-count equality before/after every operation.
Design §4 (:121-172) records the EXACT later migration operations. `drizzle-kit` in this repo
already emits CHECK constraints (`check()` at `schema.ts:472` → `drizzle/0020_*.sql`) and
partial indexes (`.where(sql…)` at `schema.ts:716` → `drizzle/0023_*.sql`), so the five CHECKs
and the two partial unique indexes can be expressed in `schema.ts` and generated.

**Recommendation.** Option 3, exactly as design §4, plus the additive audit columns the design
allows (`created_at`; a bounded `anchor_journal jsonb` for the §5 anchor-change journal —
instants and treatments only, never prose).

**What changes.** The handoff's WS-3.1 sentence about `series`/`edition` columns on
`isw_reports` and the `ru→roca` backfill is superseded. No backfill in DDL. Registering the
existing `isw_reports` URLs as edition rows is an optional, idempotent, $0 operator script run
(N3), not a migration. `isw_reports`, `source_citations`, `sources`, `source_theater_stats`,
`validation_runs`: no change of any kind (design §4 item 7).

**Blocks.** PR 3.1a (step 13). INDEX §2 D4 already says "C1 Option 3 is required before step 13".

### C2 — Unit of validation

**Options.** (a) Adopt `CONFLICT_REGISTRY` as production truth: a new `conflict-validate` cron
iterates `CONFLICT_DEFINITIONS` (`definitions.ts:132`) and scores one observation per
`(conflict, selected edition, run)`; `referenceFor` and the production `validate` route stay
byte-identical as the per-country lens. (b) Rewrite the production `validate` route in place.
(c) Keep per-country as the only unit and bolt a conflict aggregation onto `validation_runs`.

**Evidence.** Contract §2 ("one report = one benchmark observation; RU/UA rows replaced in the
NEW conflict surface only — the existing scoreboard is untouched by default"); soak §2 (the soak
writes nothing user-facing and production behaviour must be byte-identical with the soak
running); the registry is frozen configuration with an explicit comparability class on every
contributor (`definitions.ts:12-19`). (b) would edit the frozen production stack before the
soak proves the new unit; (c) cannot represent Iran's multi-track, multi-theater evidence union
or same-day editions.

**Recommendation.** (a).

**What changes.** A new route `src/app/api/cron/conflict-validate/route.ts` (PR 3.2b), NOT
added to `vercel.json`; the production `validate` job, `validation_runs` and `/scoreboard`
numbers unchanged through the window. WS-3.7 (after the soak) is where the headline flips.

**Blocks.** PRs 3.2b, 3.3a, 3.3b.

### C3 — Denominator and label

**Options.** (a) Every declared Key Takeaway of the selected edition; public label
"Key Takeaway benchmark coverage"; `partial` = miss; each takeaway is ONE unit in ONE
denominator. (b) Production's `matchable` subset denominator (`score.ts` `matchableTakeaways`).
(c) Whole-report or atomic-proposition denominators.

**Evidence.** Contract §3 (:84-87) and register #2 freeze (a); `CONFLICT_HEADLINE_LABEL` is a
literal constant (`eval-profile.ts:104`) that `assertPersistableConflictResultV1` requires on
every persisted result (`:404`). `both` double-counting exists ONLY because `run.ts:155-167`
filters per country; the conflict path applies no theater filter, so the double count vanishes
by construction — `classifyTakeawayTheater` (`keywords.ts:97-110`) becomes an ATTRIBUTION
recorded beside the result (which contributor theater covered the unit), never a filter
(handoff WS-3.3 agrees). On the keyword rung the conflict evaluator keeps the FULL declared-unit
denominator and reports `keywordUnmatchable` (`keyword-matcher.ts:9-15`, `:77-81`) — a
disclosed divergence from production `scoreDigest` (register #8 M1). No "accuracy"/"truth"
language anywhere (contract §0, §11).

**Recommendation.** (a), as shipped. Attribution is stored in the observation row
(`unit_attribution` jsonb: unitId → `ru|ua|both` for ROCA via `TOPONYM_THEATER`; contributor
theater or `both` for Iran via the step-06 gazetteer's attribution map), not inside the frozen
`ConflictResultV1`.

**What changes.** Nothing in the scorer. The observation row gains `unit_attribution`
(PR 3.1b) and the pipeline fills it (PR 3.3b).

**Blocks.** PRs 3.1b (column), 3.3b.

### C4 — Edition policy

**Options.** (a) Persist every discovered edition; score ONE observation per
`(conflict, selectDailyFinal winner, day)` under `designated-final-v1`. (b) One observation per
edition (morning and evening both scored). (c) One row per day, collapsing editions (today's
behaviour, generalized).

**Evidence.** `editions.ts` normalizes the four observed Iran shapes and ROCA's one
(`:44-48`, `:87-132`), ranks finality evening 50 > special 40 > daily 35 > plain 30 > morning 20
(`:352-359`), and `selectDailyFinal` is a TOTAL ordering that throws on an empty set or
contradictory designation (`:446-477`). The design's implemented policy is `designated-final-v1`
(select ONE); per-edition scoring is representable but no aggregate-dedup method exists
(design §5 last bullet). Soak §3 counts "reports scored" per day and §9 aborts on
"edition selection non-determinism: the same day selecting different editions across repeated
runs" — both presume one selected edition per day. (c) re-creates the very defect C1 removes.

**Recommendation.** (a). Discovery (PR 3.2a) records EVERY edition; the cron scores only the
daily-final winner; because the observation table keys on `reference_edition_id`, scoring a
non-final edition later needs no migration. The "current headline" for a day is derived at read
time (the latest observation whose edition is the current daily-final winner) — never by
mutating an older row. The cron probes D-1 AND D-2 (`lookback=2`) so an evening edition
published after the D-1 run re-selects on the next run and produces a new observation for the
new winner (append-only, C6).

**What changes.** PR 3.2a never `break`s at the first hit; PR 3.3b calls `selectDailyFinal`
per `(series, day)`; the read model (PR 3.5a) implements the winner rule.

**Blocks.** PRs 3.2a, 3.3b, 3.5a.

### C5 — Citation anchoring on multi-edition days

**Options.** (a) Only the daily-final edition links `isw_report_id` (the step-05 prompt's
proposal). (b) Link-only by URL equality: an edition row gets `isw_report_id` iff an existing
`isw_reports` row for that `(theater, date)` has a `url` that normalizes to the same
`editionKey`; otherwise NULL (the step-14 prompt's default). (c) Link every edition of the day
to the day's one anchor row.

**Evidence.** `isw_reports.url` is UNIQUE (`schema.ts:150`) and is the canonical URL of exactly
ONE edition; production discovery inserts that one URL (`run.ts:110-118`, `ON CONFLICT (url)`)
and `refreshReportCitations` anchors citations to its id. `mergeEditionRecords` treats a
differing non-null `citationAnchorId` as an identity conflict (`reference-repo.ts:114-123`),
so (c) is refused by the merge authority and would also assert an anchor whose URL contradicts
the edition's own. (a) cannot be guaranteed without changing WHICH URL production inserts:
`run.ts:31-41` probes special → evening → morning → plain and stops at the first hit, while
finality ranks evening > special > plain > morning — on a day carrying both a `special` and an
`evening` shape, production anchors `special` and the daily-final winner is `evening`. Changing
the production probe order is an edit to the frozen validation stack (design §5 "discovery/sync
seam") and belongs to WS-3.7.

**Recommendation.** (b) as the Wave-1 rule (mechanical, truthful, zero writes to `isw_reports`).
State the consequence honestly in the observation: when the scored edition carries no anchor,
`citation_anchor = none` and the soak report's non-independence diagnostic (soak §10) reports
`unavailable` for that observation instead of borrowing a sibling edition's endnotes (a morning
and an evening report have different endnote lists). Step 14 measures, over the discovered
window, how many days have >1 edition and how often anchor ≠ final; WS-3.7 decides whether to
change the production probe order (or register the final edition's URL as the anchor) on that
evidence.

**What changes.** PR 3.2a implements the link-only lookup; PR 3.1b carries no extra column
(the edition row's nullable FK is the anchor); the 3.6-prep checklist carries the measurement.

**Blocks.** PR 3.2a.

### C6 — Observation persistence

**Options.** (a) Overwrite-on-revalidate: UNIQUE `(conflict_id, reference_edition_id)`,
`ON CONFLICT DO UPDATE` like `validation_runs` (`run.ts:219-226`). (b) Append-only: no overwrite
path; one row per `(conflict, edition, cron invocation)`; the headline derived at read time.

**Evidence.** Contract §8 (:346-355): "As-published results are never overwritten … append-only
by construction … durable storage is a later integration decision" — this IS that decision.
Soak §6 requires ≥3 INDEPENDENT runs of the SAME days per conflict and grades verdict flips
across them; `runGroupKey` (`scorer.ts:657-664`: conflict | editionKey | kind | epoch | matcher
kind | k) exists precisely to group repeated runs — overwrite would destroy the variance
instrument the soak is graded on. Ruling 17 ("never trust a lone regeneration") points the same
way. `withCronRun` already holds the `cron_runs` id (`cron-run.ts:182`) but does not pass it to
the callback.

**Recommendation.** (b). Concretely: `id serial PK`; `cron_run_id integer NULL REFERENCES
cron_runs(id)`; partial UNIQUE `(conflict_id, reference_edition_id, cron_run_id) WHERE
cron_run_id IS NOT NULL` (one observation per edition per invocation — a defensive duplicate
guard, not a revalidation key); index `(conflict_id, report_date DESC, observed_at DESC)`;
`observed_at timestamptz DEFAULT now()`; NO unique key on `(conflict, edition)` alone; no FK
into `validation_runs`. `withCronRun` gains an optional second callback argument `runId`
(additive; existing routes unaffected).

**What changes.** PR 3.1b's key; PR 3.2b's route passes `runId`; PR 3.5a's read model selects
the latest row per edition.

**Blocks.** PR 3.1b (INDEX/step 13: if C6 is unanswered, build 0028 only and hold 0029).

### C7 — Iran/Levant gazetteer scope and module layout

**Options.** (a) One versioned module `iran-levant-v1` under `src/lib/validation/gazetteer/`
(step 06's provisional layout), English canonical forms + transliteration variants, consumed by
the keyword rung via `gazetteerFor(series)`; `lane-classifier.ts` `IRAN_GEO` (`:114-130`)
stays a SEPARATE versioned regex set. (b) Unify: the classifier imports the gazetteer. (c) Add
fa/ar script variants.

**Evidence.** Both populations' claim text is English (`doc_claims.text_en`, `claims.text`)
and ISW text is English, so script variants add nothing to matching (step-06 prompt). The
classifier's version (`iran-classifier-v1`, `lane-classifier.ts:50-53`) is stamped into every
persisted result (`scorer.ts:598` `versions.laneClassifierVersion`) and its goldens are
byte-pinned (`fixtures/conflicts/goldens/golden-results-v1.json`, drift gate) — importing a
different pattern set into it is a classifier version bump plus golden regeneration plus a
register entry. The gazetteer's job is UNIT↔claim signature scoring on the keyword rung; the
classifier's job is claim SCOPE/LANE — two purposes, two versions. Person names are
ruling-20 territory and stay out of any toponym set.

**Recommendation.** (a), plus a TEST-only coupling: every `IRAN_GEO` pattern's canonical
toponym must exist in `iran-levant-v1` (so the two cannot silently diverge without a failing
test), and the observation row stamps `gazetteer_version` (step 06 exposes a `version` string
on every `gazetteerFor` result). Coordinate: step 06 lands at CP1; step 19 imports
`gazetteerFor(series)`; C7 asks step 06 for the consistency test as a follow-up, never a redo.

**What changes.** None to step 06's layout. PR 3.1b: `gazetteer_version` column. PR 3.3b:
keyword rung constructed with the series gazetteer + `insufficient_data` diagnostic.

**Blocks.** PR 3.3b (soft — the RU/UA gazetteer works today; Iran needs step 06 merged).

### C8 — `legacy_only` gulf theaters

**Options.** (a) Shipped contract: legacy-engine claims and `legacy_only` contributor theaters
are EXCLUDED from corpus recall (`legacy_incomparable`) and are MEMBERS of published retention,
labeled `legacy: true`. (b) Handoff: excluded from the numerator and displayed as such.

**Evidence.** `eligibility.ts:213-219` (P8 comparability, corpus recall) vs `:274-286` +
`:287-314` (retention: "legacy-engine claims are MEMBERS (labeled by the assembler)");
`evidence-records.ts:205-221` makes a legacy corpus-recall record a TYPE error and a labeled
retention record the only representation; `definitions.ts:12-19`, `:83-95` (register #4/#10:
the roster is the FULL il+gulf set, and the retention population must include every
digest-producing theater or the retention answer is falsified). Register #4 fixes the
retention population as the claims that GENUINELY appeared in designated digests "plus
designated il/gulf digests ONLY as labeled legacy contributors". Under (b) a unit whose only
matching evidence is a legacy il claim flips from `matched` to `miss` in the retention
headline — a methodology change: new `methodologyEpoch` (contract §8), register entry, golden
regeneration.

**Recommendation.** (a). Display: agreements already carry `legacy` per claim
(`ConflictAgreementClaimV1.legacy`, `eval-profile.ts:178`); the view adds a derived companion
count "matched with legacy-only evidence" beside the retention headline — no scorer change.
Corpus-recall lanes whose only evidence is legacy keep rendering "unavailable (incomparable
evidence)" (`evidence-assembler.ts:611-617`).

**What changes.** Nothing in code; the 3.5a view adds the companion count. If the operator
insists on (b): out of this window, new epoch.

**Blocks.** PR 3.3a (the retention source must include legacy theaters' `military` digests,
`LEGACY_CONTRIBUTOR_TRACKS`, `eligibility.ts:103`).

### C9 — ROCA tracks

**Options.** (a) `russia_ukraine.contributorTracks = ["military"]` (registry, Wave 1).
(b) Add `elite_politics` (ru runs it: the daily engine matrix is ru military + elite_politics,
AGENTS.md Analysis bullet) → `ru-ua-ev-v2`. (c) Add `nuclear` (no ru/ua nuclear track exists).

**Evidence.** `definitions.ts:108`; `EVIDENCE_POLICY_VERSIONS` (`:57`) is a frozen enum,
validated against the registry on every result (`eval-profile.ts:637-641`) and stamped in every
observation. A track change is an evidence-policy version bump: goldens regenerate, the
backtest matrix re-runs, a register entry records it. Whether ROCA `strategic_political` /
`force_generation` takeaways are missed FOR WANT OF elite_politics evidence is exactly what
the soak's §5.1 miss sample measures (a human searches the unfiltered window corpus and records
which stage dropped the evidence).

**Recommendation.** (a) for Wave 1 and the soak; record `ru-ua-ev-v2 (+elite_politics)` as a
post-soak candidate decided on the §5.1 evidence.

**What changes.** Nothing.

**Blocks.** Nothing.

### C10 — Country-scoreboard relabel and whether `/scoreboard` stays public

**Options.** (a) Keep `/scoreboard` public; relabel the country rows as evidence lenses by
copy only; the conflict view reuses the existing `/conflicts/**` routes (teaser tier
public-when-flag-on, evidence tier gated) with a DB-backed provider. (b) Gate `/scoreboard`
(`requireAcceptedUser` first statement, ROUTES row, sitemap/robots changes) and put the
conflict view on it. (c) A brand-new gated route family outside `/conflicts/**`.

**Evidence.** `gate.ts:5-8` lists scoreboard in the public surface; `sitemap.ts:16` lists it;
`robots.ts` allows it; `scoreboard/page.tsx:37-52` has no gate and queries `validation_runs`
directly; the detail page renders `claimText` publicly (`[country]/[date]/page.tsx:128`) —
a PRE-EXISTING posture this memo flags and does not adjudicate. The charter names "a public
validation scoreboard" as a product pillar. The conflict pages already exist behind
`CONFLICTS_UI` (`feature.ts:24-36`), with the guard order pinned (`evidence/page.tsx:32-33`:
`requireAcceptedUser()` first, `requireConflictsUi()` second) and the teaser/evidence tier split
(contract §11 access-tier pin). `product-view.ts:66-73` anticipated real results: "when real
results exist at enablement the same opaque-key route accepts a report/edition key without a
route change"; `BENCHMARK_KEY_SHAPE` (`:75`) admits neither `:` nor `_`, so an edition key needs
a bijective URL encoding (step 24 detail). Ruling 3: the fixture provider must never feed the
real view. Ruling 21: gate first; the ROUTES-row obligation for the gated evidence route is
recorded as DISCHARGED by `conflict-feature-off.itest.ts` under a flag-ON server
(AGENTS.md:1557; `authz-page-gate.itest.ts:79-84` explains why a ROUTES row in the flag-absent
harness can never pass its positive control).

**Recommendation.** (a). Copy: `dictionaries.ts` `scoreboard.col.theater` "theater" →
"evidence lens (country)"; append one sentence to `scoreboard.caveat`: "Each row scores one
country digest against the whole-conflict report; the RU and UA rows read the same ROCA report
through different lenses, so their denominators overlap and the rows are not additive."; the
same in every catalog (en uk de ar ja pl fr). Numbers untouched. The reciprocal link between
the two aggregations (contract §11(d)) is flag-guarded. **Correction to the step-24 sketch:**
the ROUTES-row obligation is met by extending `conflict-feature-off.itest.ts` (seed a real
observation row; anonymous bare + `RSC: 1` bodies carry no claim text; accepted control sees
it) — not by an `authz-page-gate` ROUTES row.

**What changes.** PR 3.5a (step 24) as above; `robots.ts` gains the gated evidence path
disallow now (harmless while the route 404s). If (b): sitemap/robots edits, a ROUTES row, and a
product regression on a marketing surface — not recommended.

**Blocks.** PR 3.5a.

### C11 — Coverage target for conflict rows

**Options.** (a) No interim target; conflict rows render numerator/denominator, n, label, rung.
(b) Reuse `TARGETS.coverage = 80` (`scoreboard/page.tsx:26`). (c) Set a new target now.

**Evidence.** Soak §1: the soak "is explicitly NOT for demonstrating a coverage improvement";
handoff WS-3.0: "set the new target AFTER the shadow soak, not before"; GO-NO-GO C1 fails at
15.6–20.7% against a denominator the rework redefines. Contract §6.4: percentages always carry
numerator/denominator; `unavailable` ≠ 0.

**Recommendation.** (a). The country rows keep their target; the reset is a WS-3.7 decision-log
entry citing the soak report.

**What changes.** PR 3.5a renders no target/bar colouring for conflict rows.

**Blocks.** PR 3.5a.

### C12 — Spend row for the shadow matcher

**Options.** (a) Share `llm_match` via `llmGuardFromEnv` (`llm-match.ts:224-235`:
`LLM_MATCH_DAILY_USD_CAP` default 3, `LLM_SPRINT_USD_CAP` backstop). (b) `openai_eval` via
`src/lib/evals/eval-guard.ts` (`EVAL_USD_CAP_DAILY` fail-closed, `EVAL_DAILY_REQUEST_CAP` 300,
`EVAL_RUN_REQUEST_CAP` 200) — the soak design §7's table. (c) A NEW dedicated row
`llm_conflict_match` built beside the other guards in `src/lib/usage/llm-guard.ts`:
`CONFLICT_MATCH_USD_CAP_DAILY` (fail-closed when unset), `CONFLICT_MATCH_DAILY_REQUEST_CAP`
default 300, `CONFLICT_MATCH_RUN_REQUEST_CAP` default 200, backstop `LLM_SPRINT_USD_CAP`.

**Evidence.** Ruling 4: every paid call passes `tryReserve()` and FAILS CLOSED when its cap env
is unset — `spend-guard.ts:112-117` refuses `cap_unset` / `daily_usd_unset` before any provider
client exists. (a) blends shadow spend into a PRODUCTION ledger, contradicting soak §7 ("eval
spend never blends into a production ledger") and letting a shadow budget stop starve the
production `validate` matcher on the same day. (b) needs `EVAL_USD_CAP_DAILY` in ALL Vercel
envs before the code deploys (no `EVAL_*` exists anywhere), AND a cron route importing
`src/lib/evals/*` violates the eval-library isolation contract (`eval-profile.ts:17-23`:
no non-test `src/` file outside the eval library may reference an evals module, because the
eval dispatch path bypasses the production registry approval). (c) satisfies both: own ledger
row, no isolation breach, and ruling 4's ordering is satisfied by INERTNESS — with the cap env
absent the guard refuses `daily_usd_unset` before client construction, the round is discarded,
and the ladder scores the day on the keyword rung (ruling 9). Expected volume once scheduled:
2 conflicts × 2 populations × 5 votes = 20 dispatches/day, tens of cents/month at
gpt-4o-mini validation prices.

**Recommendation.** (c). The soak design's §7 row name (`openai_eval`) was written for an
eval-plane run; the cron path supersedes it by register entry (N1) with every threshold
unchanged.

**What changes.** PR 3.4b adds `conflictMatchGuardFromEnv()`; the 3.6-prep checklist carries
"set `CONFLICT_MATCH_USD_CAP_DAILY` in ALL Vercel envs BEFORE adding the cron line"; `.env.example`
documents the three envs; N1.

**Blocks.** PRs 3.3b (matcher selection pin), 3.4b.

### C13 — Compound/negative unit derivation for real takeaways

**Options.** (a) Ship a versioned derivation seam `deriveUnitFlags(text) → {compound,
negative, version}` at `unit-flags-v0`: `negative` = a conservative regex heuristic
("no confirmed", "did not", "denied", "no … reported" — deflationary only); `compound` =
UNDETERMINED → `false`; stamp `unit_flags_version` on every observation; the view labels such
rows "compound handling undetermined — not soak-eligible". (b) Block 3.3b until a
human-calibrated `compound-v1` exists (register #12.1). (c) Ship an uncalibrated compound
heuristic and present it as the derivation.

**Evidence.** Register #11: every ladder rung emits `partial` on a compound unit (a headline
MISS; `match-contract.ts:325`, `keyword-matcher.ts:102`), so on a real Iran day a live headline
"could read 0/5 by construction". Register #12.1–3 make a specified, versioned, HUMAN-calibrated
derivation of `compound`, a measured compound rate, and an adjudication BLOCKING prerequisites
of the SOAK — not of report-only observation. Today `compound`/`negative` are hand-authored
fixture fields (`fixture-matcher.ts:204-217`); nothing derives them from real text. `negative`
affects the keyword rung alone (`keyword-matcher.ts:83`; the LLM adapter never reads it and the
production prompt already encodes absence semantics, `llm-match.ts:80`), so a false `negative:
true` can only suppress a keyword match — safe. Setting `compound: false` on a genuinely
compound unit lets a ladder rung attest `full` — the over-credit direction register #11 fails
closed against — which is why the version stamp and the "not soak-eligible" label are part of
the option, and why observations under `unit-flags-v0` are never compared with `compound-v1`
ones (the view groups by `unit_flags_version`).

**Recommendation.** (a). Do not block 3.3b: without observations there is nothing to calibrate
#12.2's measured rate against, and 3.2a's `derived.units` (ordinal + text hash) gives the
calibration exercise its stable unit identities. `compound-v1` is a WS-3.6 prerequisite PR
with its own register entry (3.6-prep checklist, blocker 1).

**What changes.** PR 3.3b ships the seam + `unit-flags-v0`; PR 3.1b carries
`unit_flags_version`; the 3.5a view labels it.

**Blocks.** PR 3.3b.

### C14 — validation-v3 vs v4 for the conflict-keyed dataset

**ANSWERED by the operator: INDEX §2 D3 = v4** ("Yes approve"). Recorded here, not
re-argued. Consequence for WS-3: nothing in this window touches `docs/evals/analysis/`;
`conflict-roca-v1` / `conflict-iran-v1` stay offline under the `validation` workload
(`eval-profile.ts:71-78`; `conflict-validation-profile.ts:42-46` "NO live path");
WS-3.7 creates the conflict-keyed validation-v4 AFTER WS-1.3 freezes the per-country v3, so
step 2's version identities stay stable. Coordination with WS-1.3 is naming only (contract
version, results basenames) — no shared file.

## 3. New decisions surfaced by this memo

- **N1 — supersede soak §7's provider row.** `docs/designs/CONFLICT-SHADOW-SOAK.md` §7 names
  `openai_eval` + `EVAL_USD_CAP_DAILY`; the cron path uses `llm_conflict_match` +
  `CONFLICT_MATCH_USD_CAP_DAILY` (C12). The design is "predeclared" — changing a threshold
  invalidates the soak — so the row-name supersession needs a register/decision entry stating
  every threshold is unchanged (daily $2, 300/day, 200/run, ≤$25 envelope, `LLM_SPRINT_USD_CAP`
  backstop). Recommendation: yes, at CP1, drafted in the 3.6-prep checklist.
- **N2 — manual invocation of the unscheduled route in production.** Once PR 3.2b deploys, a
  `GET /api/cron/conflict-validate` with `CRON_SECRET` WRITES `benchmark_report_editions` /
  `benchmark_series_days` (and, after 3.3b, observations) in production — a production write
  under COMMON §3. Recommendation: forbidden until the WS-3.6 scheduling entry, except an
  operator-signed bounded smoke (one date, one conflict) recorded in the decision log.
- **N3 — optional edition backfill from existing `isw_reports`.** A $0, idempotent operator
  script (`scripts/isw-refresh.ts --series … --backfill-from-isw-reports`) registering every
  existing ROCA/Iran URL as an edition row with `isw_report_id` linked (design §4 item 7).
  Production write to the new tables only. Recommendation: authorize after PR 3.2a merges and
  deploys, with a Neon backup branch (Iran-recovery precedent); it also gives register #12.2 its
  ≥1-month real sample for the compound-rate measurement.

## 4. Decision → PR blocking matrix

| PR (plan §) | Step | Blocked on | If unanswered at CP1 |
|---|---|---|---|
| 3.1a migration 0028 | 13 | C1 | stall (INDEX: C1 = Option 3 is required before step 13) |
| 3.1b migration 0029 | 13 | C6 (+ C3 column, C7 column, C13 column) | build 0028 only, hold 0029 |
| 3.2a edition discovery | 14 | C4, C5 | stall PR 1 of step 14 |
| 3.2b conflict-validate route | 14 | C2 | stall PR 2 of step 14 |
| 3.3a DB claim sources | 19 | C2, C8 | stall |
| 3.3b live observation | 19 | C2, C3, C8, C12, C13 (+ C4, step 06 merged) | stall |
| 3.4b live matcher | 19 | C12 | stall 3.4b only; 3.3b ships keyword-only |
| 3.5a conflict view + relabel | 24 | C10, C11 | stall |
| 3.6-prep checklist | 24 | none (records N1–N3) | proceeds |

C9 and C14 block nothing. N2/N3 are operator runs, not PR blockers.

---

## Scope

Prompt `docs/prompts/2026-09-05-48h-05-plan-ws3-conflict.md`; lane `48h-ws3-conflict`;
branch `48h/ws3-conflict-20260905-step05-ws3-plan` from `48h/ws3-conflict-20260905`; base
`origin/main` `dff58f2` (2026-09-06, on or after `883e5e3`). Read COMMON, INDEX §1/§2/§4,
handoff §0/§4.3/§6, the three conflict designs, the landing report §6, the P7 report §5.2, the
decision register #1–#13, the audit finding register (F-NEW-1, F-NEW-6, R-M-6), and every file
in the step's reading list. No forbidden file opened.

## Built

- `docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md` (this file).
- `docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md` (companion).
- `docs/PROGRESS.md` plan + execution blocks.
- PR: `docs: WS-3.0 decision memo + PLAN-WS-3 (step 05)` — docs only.

## Tests

No code changed; no test run. Unit count unchanged from `main` (3,612 / 247 files per the
2026-09-04 decision-log entry). Typecheck/lint not applicable to Markdown. No fork. Spend: $0.
No DB connection opened.

## Rulings touched and how each is satisfied (by the recommendations)

1 — every proposed table persists ids/hashes/enums/instants/counts; `derived.units` holds
ordinal + sha256 + signatures; the persist call is gated by `assertPersistableConflictResultV1`;
a sentinel test is required in PR 3.3b. 2 — no claim writes anywhere. 3 — stub adapters
excluded at the query (`STUB_ADAPTER_NAMES`) and the fixture provider never feeds the DB view.
4 — C12's guard fails closed on an unset cap before any client; cap env set in ALL envs before
scheduling. 5 — 0028/0029 forward-only, `9999` last, applied migrations untouched. 9 — the
inherited ladder unchanged; `LLM_DISABLE` degrades to keyword. 10 — the new job uses
`withCronRun` and the `JOB_MAX_DURATION_SEC` table. 12 — dedup untouched. 13 — corpus recall
filters through `map-versions.ts`. 14 — sources query per theater; assemblies aggregate; the
40% cap applies in `selectEvidence`. 19 — unmatched published claims keep the "BNOW-only
reported item" label with hedge. 21 — gate first on the evidence route; the flag-on body
harness discharges the ROUTES obligation.

## Citations re-verified

All verified at `dff58f2` unless marked. `run.ts:15,21,31,45-57,74-281,83-90,92-122,110-118,
123,145-151,152-167,176-187,219-226` ✓ · `validate/route.ts:24` ✓ · `schema.ts:52-57,133-153,
150,151,178-212,237-255,257-281,291-305,307-326,472,716,924-965,973-988` ✓ ·
`keywords.ts:5-41,43-62,82-93,97-110,109` ✓ · `lane-classifier.ts:50-53,114-130` ✓ ·
`definitions.ts:12-19,57,83-95,96-129,108,127,132` ✓ · `lanes.ts:21-42` ✓ ·
`editions.ts:44-48,87-132,344-359,352-359,446-477,504-527` ✓ · `eligibility.ts:103,213-219,
274-286,287-314` ✓ · `evidence-selection.ts:46,48` ✓ · `evidence-records.ts:76-103,151,
205-221` ✓ · `evidence-assembler.ts:8-12,148,150-244,611-617` ✓ · `scorer.ts:34-39,486-491,
596-607,657-664` ✓ · `match-contract.ts:45-49,107-119,259-282,299-330,325` ✓ ·
`llm-compatible-matcher.ts:25-26,46-49,63-73,101-116` ✓ · `keyword-matcher.ts:9-15,36-42,
54-56,71,77-81,83,102,108-116` ✓ · `reference-repo.ts:114-123` ✓ · `reference-repo-sql.ts:
131-136,138-168` ✓ · `product-view.ts:1-20,66-80,75,94-147` ✓ · `eval-profile.ts:17-23,
71-80,104,178,270-276,401-404,637-641` ✓ · `feature.ts:24-36` ✓ · `fixture-matcher.ts:
204-217` ✓ · `report-extract.ts:56,189,283` ✓ · `isw-extract.ts:67-92` ✓ · `llm-match.ts:
75-82,80,100,122-135,165,173-185,224-235,261-269,283-296,309-316` ✓ · `spend-guard.ts:
112-117` ✓ · `eval-guard.ts:18-30` ✓ · `conflict-validation-profile.ts:42-46` ✓ ·
`cron-run.ts:60-70,180-191` ✓ · `map-versions.ts:39-56` ✓ · `quality-funnel.ts:466` ✓ ·
`synthesize.ts:696` ✓ · `fetch-cache.ts:11` (HOST_SPACING_MS 2100) ✓ · `load.ts:284-290` ✓ ·
`gate.ts:5-8,29-39` ✓ · `scoreboard/page.tsx:26,37-52,122` ✓ · `scoreboard/[country]/[date]/
page.tsx:128` ✓ · `sitemap.ts:16` ✓ · `robots.ts:18-31` ✓ · `conflicts/[slug]/benchmark/[key]/
evidence/page.tsx:32-33` ✓ · `authz-page-gate.itest.ts:79-84,85-120` ✓ ·
`conflict-feature-off.itest.ts:1-25` ✓ · `migrations.test.ts:60-63,66-81` (prompt said :60-80;
the 0027 block runs to :81) · `migrations-lib.ts:10-14,23-66` (prompt said :33-47; `runMigrations`
spans :23-66) · `drizzle/` 0000–0027 + `9999` ✓ · `dictionaries.ts:316-345` (en), `:744-760`
(uk) ✓ · `vercel.json` (validate `0 7 * * *`, enrich `0 8 * * *`) ✓ ·
`CONFLICT-REGION-EVALUATION.md:84-87,346-355,352-354,359-378,407-466,470` ✓ ·
`CONFLICT-REFERENCE-REPORTS-SCHEMA.md:32-47,64-87,121-172,174-236` ✓ ·
`CONFLICT-SHADOW-SOAK.md:37-48,174-192,194-238,240-259` ✓ · `CONFLICT-EVALUATOR-LANDING-
2026-08-24.md:92-101` ✓ · `CONFLICT-EVALUATION-P7-REPORT-2026-08-17.md:482-591` ✓ ·
`CONFLICT-EVALUATION-DECISION-REGISTER-2026-08-17.md` #11 :136-162, #12 :164-206, #13 :208-222 ✓ ·
**AGENTS.md line drift:** the ROUTES-row obligation the prompt placed at ≈1547-1559 is at
`:1557`; the `FEATURE_AUTH_GATE=true`-wherever-`CONFLICTS_UI` rule (≈1513, 1537-1539) is at
`:1534-1535`; the Production flag state (≈1598-1599) ✓ `:1598-1599`; ruling 21's ROUTES-table
sentence `:490`.

## Decisions needed

C1–C13 as §2 (recommendations: C1 Option 3 · C2 registry unit via a new route · C3 declared
units, `both` once, attribution not filter · C4 every edition stored, daily-final scored ·
C5 link-only by URL equality · C6 append-only · C7 separate versioned modules, English only ·
C8 shipped contract · C9 military only · C10 public scoreboard + copy relabel, reuse
`/conflicts/**` · C11 no interim target · C12 dedicated `llm_conflict_match` row · C13
`unit-flags-v0` seam, soak still blocked); C14 answered (D3 = v4); N1–N3 as §3.

## Debt and risks

- `/scoreboard/[country]/[date]` renders claim text to anonymous readers (`page.tsx:128`) —
  pre-existing; not adjudicated by this memo; C10 keeps the surface public as is.
- Production probe order (special first) vs finality order (evening first): on a
  special+evening day the citation anchor and the daily-final edition differ (C5); measured
  by step 14, decided in WS-3.7.
- Claim ids are unstable across digest regeneration (claims DELETE+reINSERT; contract §1);
  observation agreements reference ids that may not resolve later — observations are labeled
  `retrospective`, and the snapshot capture path (`CONFLICT-SNAPSHOT-CAPTURE.md`) remains the
  only cure.
- `compound` undetermined under `unit-flags-v0` → possible over-credit until `compound-v1`
  (C13); disclosed by the version stamp; soak stays blocked on register #12.
- Two-run confirmation delays `publication_gap` by ≥24 h; unknown new slug shapes stay
  invisible to slug probing (design §9 prefers feed/index-backed discovery — future adapter).
- `withCronRun`'s optional `runId` argument touches a shared file (additive, small).
- The scoreboard copy relabel is the ONLY user-visible change in the window and needs all
  seven catalogs (en uk de ar ja pl fr) or a documented fallback.
- Vercel functions keep no disk cache across invocations: each cron run refetches its ≤10
  pages (bounded by politeFetch spacing; ≈21 s/run).

## Handoff

The PR-by-PR content, the per-PR blocking decisions and the exact rewrite text for steps 13,
14, 19 and 24 are in `PLAN-WS-3-validation-by-conflict-2026-09-05.md` § Handoff. What the
operator must do at CP1 for this lane: answer C1 and C6 (step 13 cannot start 0029 without C6),
C4/C5 (step 14), C2/C3/C8/C12/C13 (step 19), C10/C11 (step 24); sign N1; decide N2/N3 timing;
merge or cherry-pick both plan documents to `main` before pasting Wave 2 (INDEX Checkpoint 1).

## Proposed AGENTS.md changes

(For step 25; not applied here — write-lock.)

- Directory map: under `src/lib/…` add "conflicts (frozen registry, editions, eligibility,
  scorer — the conflict validation domain; dormant behind `CONFLICTS_UI`)" if PR #49 has not
  already added it; after step 13 merges, the `drizzle/` line reads "migrations 0000–0029 +
  `9999_claim_source_trigger.sql`" (the step-13 carve-out corrects that single line in place).
- Current-state Analysis bullet, after steps 13/14 merge and deploy: "Conflict validation:
  tables `benchmark_report_editions` / `benchmark_series_days` / `conflict_validation_observations`
  exist and are EMPTY in production; `/api/cron/conflict-validate` exists and is UNSCHEDULED;
  the production `validate` job and `validation_runs` are unchanged."
- Decision-log entry draft for CP1 (operator fills the answers):
  "**2026-09-0X (WS-3.0 conflict-validation decisions — C1–C13, N1–N3)** Operator answers to
  `docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md`: C1 = …; C2 = …; …; N1 = the
  shadow-soak §7 provider row is `llm_conflict_match` with `CONFLICT_MATCH_USD_CAP_DAILY`, every
  §7 threshold unchanged; N2 = manual invocation of `/api/cron/conflict-validate` in production
  is [forbidden until scheduling | one bounded smoke authorized: date, conflict]; N3 = edition
  backfill from `isw_reports` [authorized after PR 3.2a deploys, backup branch first | deferred].
  Binding until superseded: the production `validate` job, `validation_runs` and `/scoreboard`
  numbers are unchanged through the shadow window; no conflict number is published; the soak
  remains blocked on register #12 and the 3.6-prep checklist."
