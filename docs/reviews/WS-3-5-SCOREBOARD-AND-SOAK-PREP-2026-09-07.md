# WS-3.5 — conflict observations view + WS-3.6 soak-prep (step 24)

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-24-ws3-5-scoreboard-and-soak-prep.md` (the sketch as
  issued, including its 2026-09-09 DECISIONS BINDING block and the verbatim R.17 handoff), plus
  `docs/prompts/2026-09-05-48h-COMMON.md`, the WS-3.0 decision memo, PLAN-WS-3 §3.5a/§3.6-prep,
  and the step-19 report's Handoff.
- **Lane / worktree:** `48h-ws3-gazetteer-20260905`. Run **ATTENDED**, with the trimmed four-key
  `.env.local` (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY`).
  **No provider key exists in this worktree**, which is part of why the spend line is `$0`.
- **Base SHA:** `origin/main` **`23b5d7a`** (fetched at session start; unchanged at the last
  fetch before both PRs were opened).
- **Branches / PRs — two, independent, both based on `main`:**

  | PR | branch | contents |
  |---|---|---|
  | [#95](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/95) | `…-conflict-observations-view` | §3.5a — the DB-backed conflict view + the C10 relabel |
  | [#96](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/96) | `…-soak-prep` | §3.6-prep — the enablement checklist |

  **Neither is stacked.** Both branch from the lane branch at `origin/main` + one shared
  PROGRESS plan-block commit (`1e80d18`), which git merges identically from either side. No
  `gh pr edit --base` retarget is needed.
- **Spend: $0.** No paid provider call, no environment change, no migration applied to
  production, no deploy, no production write, no flag turned on. `vercel.json`, `drizzle/` and
  `src/db/schema.ts` are byte-unchanged on both branches.

## Built

### PR #95 — `scoreboard: conflict observations view (real rows only) + evidence-lens relabel`

**The read model — `src/lib/conflicts/db-product-view.ts` (+ test).** Reads
`conflict_validation_observations` through `latestObservationsFor` (latest row per EDITION,
because the store is append-only and deliberately has no "current" notion), then applies **memo
C4 at read time**: the day's editions are read through `ReferenceReportRepository.editionsForDay`,
`selectDailyFinal` picks the winner, and the winner's observation is the day's headline.

A day whose final edition has no observation is reported as **pending**, with a typed reason
(`final_edition_unobserved` / `daily_final_undetermined` / `editions_unavailable`). It is never
satisfied by promoting another edition's observation. That is the point of the whole module:
C5-m measured the citation anchor sitting on the NON-final edition on 1 of 8 multi-edition days,
and a "latest row wins" read model would reproduce that substitution silently. The unit test
seeds the morning observation as both first and newest, so a naive implementation fails it.

`selectDailyFinal`'s typed refusals are caught, not propagated: one contradictory day renders as
undetermined rather than 500-ing the page.

**Addressing — `src/lib/conflicts/benchmark-key.ts` (+ test).** Bijective edition-key ⇄ URL-key,
built from the two closed tables (`REFERENCE_SERIES_IDS`, `NORMALIZED_EDITION_LABELS`) so encode
and decode cannot drift when a label is added. `roca:2026-03-05:daily` ⇄ `roca-2026-03-05-daily`;
the fixed-width day is what makes the split unambiguous although `-` also separates. It satisfies
the route's existing `BENCHMARK_KEY_SHAPE` unchanged — the grammar does not widen — and refuses,
in both directions, anything it could not have minted: an unknown series, a label the
normalization table cannot produce, an impossible calendar day, the reserved fixture-only `final`
label, and every fixture golden key. The `SERIES_URL_SLUGS` reverse table asserts injectivity at
module load.

**Ruling 3 by module graph, not by review.** `db-product-view.ts` imports no fixture module, and
neither does any conflict page or component. That required moving the shared pure parts OUT of
the fixture provider, since resolving a slug or counting a union used to drag the fixture corpus
loader into the real pages' graph:

- `evidence-row.ts` — `PublishedEvidenceRow`, type-only;
- `result-summary.ts` — `publishedUnionCountOf`, `partialCountsOf`, plus the new
  `legacyOnlyMatchedCount` (memo C8);
- `product-slugs.ts` — `CONFLICT_SLUGS`, `conflictIdForSlug`, `slugForConflictId`.

All three are re-exported from `product-view.ts`, so its own test and the component tests are
unchanged. A source scan in `db-product-view.test.ts` pins three directions: the DB view imports
no fixture module; no conflict page and no conflict component does either; and the test-only
builders (`db-view.testkit.ts`, whose `.testkit.ts` suffix is what makes the scan exact) are
imported by tests only.

**Two components deleted.** `synthetic-banner.tsx` — orphaned, and actively dangerous to keep: a
banner declaring real observations a synthetic corpus is the opposite lie. `benchmark-run-list.tsx`
— page-unreachable after the swap, kept alive only by its own test, and its `product-view` import
would otherwise have forced the ruling-3 scan to carry an exemption for dead code. Both deletions
are under the CLAUDE.md scoped exception; the `benchmark-unavailable.test.tsx` block that covered
the run-list's unavailable row was removed with it and its header records why. `localization.test.tsx`'s
logical-alignment pin now scans the whole component directory instead of a hand-listed pair, so a
deletion cannot silently empty it again.

**The gated evidence view.** Claim TEXT and the source trail are joined LIVE from `claims` /
`claim_sources` / `raw_documents`, because ruling 1 keeps prose out of the observation table
entirely. Three predicates are enforced AT THE QUERY (`evidenceClaimSql`): the claim still
belongs to a digest with a published status (the same `('generated','published')` member set
step 19 confirmed against `digest-persist.ts`), it still has ≥1 `claim_sources` row (ruling 2),
and it carries NO stub-adapter document (ruling 3, the whole claim — dropping just the offending
document would quietly overstate independence). Every analytical field — theater, track, hedge,
legacy, confidence, ingest anchor, matched units — comes from the stored RESULT, because that is
what the evaluation saw and matching never restates it. A union claim the join no longer returns
is COUNTED with its id and omitted; it is never reconstructed and never silently dropped from the
count.

**Labels.** Memo C13's condition is a BANNER
(`src/components/conflicts/soak-eligibility-banner.tsx`) in the slot and at the prominence the
synthetic-corpus banner held, for the same reason: the previous banner said "these numbers are
not real", this one says "these numbers are real but systematically over-credited". It renders
whenever a displayed observation carries `unit-flags-v0` and disappears by itself when a
calibrated version replaces it. Memo C8's legacy-only companion count sits beside the headline
(members of the numerator, not excluded from it). Memo C11: no target and no target-coloured bar
on any conflict row — pinned by a test that also asserts no `target` string appears anywhere.

**`/scoreboard` (memo C10).** `scoreboard.col.theater` becomes `evidence lens (country)` in all
seven catalogs, and the non-additivity sentence is appended to `scoreboard.caveat`. Numbers,
columns, filter, order and limit unchanged, and the query itself is re-pinned by a test so a
future copy change cannot quietly move a figure. The reciprocal `/conflicts` link renders only
when `conflictsUiEnabled()` — a public page must not advertise a link that 404s — and a test
pins it absent for every other flag spelling. `robots.ts` disallows
`/conflicts/*/benchmark/*/evidence`; the teaser pages stay crawlable; no sitemap change
(`/conflicts` is not listed there and is not added).

### PR #96 — `docs: shadow-soak enablement checklist and blocker dispositions`

`docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md`. Five blocker dispositions with
owners (3 CLOSED by steps 06 + 19; 1, 2, 4, 5 open), the environment and flag preconditions in
ruling-4 order, the N2 / WS3-N06 / WS3-N07 operating rules, the `vercel.json` line printed as a
diff and NOT applied, the log-drain queries with the conflict job's own ceiling substituted for
the design's `map` example, and the window / lane minima / matcher thresholds / variance / cost
ceilings / abort criteria quoted from the design with "if this section and the design differ, the
design wins".

Three things it adds rather than restates are in **Decisions needed** and **Debt and risks** below.

## Tests

| Gate | Before | After |
|---|---|---|
| Unit tests | **4,557 / 290 files** (measured on `origin/main` `23b5d7a` in this worktree) | **4,599 / 293 files** |
| `npm run typecheck` | clean | clean |
| `npm run lint` | 3 warnings | 3 warnings (the same three pre-existing ones) |

**Fork integration test: `src/integration/conflict-feature-off.itest.ts` — 25/25 PASS** on
disposable Neon branch **`br-patient-bar-ath7n7n8`**, created and deleted by
`scripts/test-integration.sh`. (Two earlier runs on `br-weathered-art-atmx8r9q` and
`br-bitter-bread-atu2uzdo` failed on seeding collisions and are recorded in Debt below; all three
branches were deleted by the runner's `trap`.)

**This run is the recorded discharge of the ruling-21 ROUTES-row obligation for
`/conflicts/[slug]/benchmark/[key]/evidence`**, and it is now non-vacuous in a way it could not
have been before: the suite SEEDS two reference editions, one observation written through the
DEPLOYED `persistObservation` statement (never a hand-rolled INSERT), and one genuine published
digest claim with its source document. Without that, the fixture corpus being unreachable would
have made every "no claim text leaked" assertion pass against an empty page. What the run proves
over HTTP against a production build:

- anonymous bare GET on the evidence route: 307, and the BODY carries no claim text;
- anonymous `RSC: 1` GET: no claim text;
- **accepted session: 200 and the claim text IS present** — the positive control;
- teaser pages: 200, counts and edition keys, no claim text and no reference-unit material;
- every flag-on teaser body carries the C13 banner and NOT the retired synthetic-corpus one;
- the Iran day's DAILY FINAL is what renders, and the non-final morning edition's key 404s —
  memo C4 proven over HTTP, not only in unit tests;
- the flag-off phase is unchanged: 18 assertions, no conflict content in any body under any
  auth state.

**Spend on the itest: $0.** Provider keys are blanked in the spawned server, `LLM_DISABLE=1`, and
no provider key exists in this worktree at all.

`git diff vercel.json` is empty on both branches. No environment variable is named as set.

## Rulings touched and how each is satisfied

- **Ruling 1 (no reference prose).** The observation table structurally cannot hold prose, which
  is why claim text is joined live rather than stored. It is also why the itest's reference-unit
  leak probe had to be a lowercase gazetteer key: `EDITION_SIGNATURE_TOKEN_RE`
  (`editions.ts:275`) refuses anything else, and the first attempt — an uppercase sentinel —
  500-ed the page at `parseEditionRecord`. That failure is the ruling working.
- **Ruling 2 (traceability).** A claim renders only if it still has a `claim_sources` link;
  `EXISTS (SELECT 1 FROM claim_sources …)` in `evidenceClaimSql`.
- **Ruling 3 (truth-in-UI).** Enforced by module graph and scanned in both directions; the
  fixture provider is now unreachable from every page. Stub-adapter documents are excluded at the
  query, and a claim carrying any of them is withheld whole.
- **Ruling 13 / 14.** Untouched by this step — the version predicate and per-theater corpora live
  in step 19's `db-claim-sources.ts`, which this view consumes without altering.
- **Ruling 19.** Unmatched published claims keep the "BNOW-only reported item" lane treatment the
  evidence list already renders; the headline label stays the frozen
  `Key Takeaway benchmark coverage`, and a page test asserts the word "accuracy" appears nowhere.
- **Ruling 21.** `requireAcceptedUser()` is the FIRST statement of the evidence page and
  `requireConflictsUi()` immediately second, both before any query — pinned by the always-run
  "page-level authorization gate" unit case (invocation-order assertions, including that the DB
  is never touched on the feature-off path) and by the flag-ON fork itest over HTTP. **The
  obligation is discharged there, not by an `authz-page-gate` ROUTES row**: that harness boots
  flag-absent, so its positive control could never pass for a conflict route
  (`authz-page-gate.itest.ts:79-84`).
- **Ruling 10 / #98.** Untouched; noted in the checklist as the expected outcome of a dead-host
  probe run at `lookback = 2`.

## Citations re-verified

| Cited | State |
|---|---|
| `product-view.ts:66-73` "when real results exist … the same opaque-key route accepts a report/edition key without a route change" | **corrected to `:67-71`** (the docstring; unmoved by this step's edits). The encoding delivers exactly that — no route change |
| `product-view.ts:75` `BENCHMARK_KEY_SHAPE` admits neither `:` nor `_` | correct, and still at `:75` after this step's edits; the new encoding satisfies it unchanged, so nothing widened |
| `evidence/page.tsx:32-33` gate order | correct; preserved verbatim |
| `authz-page-gate.itest.ts:79-84` (why no ROUTES row) | correct |
| `feature.ts:24-36` `conflictsUiEnabled` / `requireConflictsUi` | correct |
| `gate.ts:5-8` public surface lists scoreboard; `sitemap.ts:16` lists it | correct; `/conflicts` is in neither |
| `scoreboard/page.tsx:26` `TARGETS.coverage = 80` | correct; untouched, and no conflict row uses it |
| `editions.ts:168` `editionKey = <series>:<reportDate>:<label>` | correct |
| `NORMALIZED_EDITION_LABELS`, `FIXTURE_FINAL_LABEL` | **corrected to `editions.ts:47-52` and `:56`** |
| `editions.ts:275` `EDITION_SIGNATURE_TOKEN_RE` | correct — and load-bearing, see Rulings |
| `observation-store.ts` `latestObservationsFor(query, id, { days?, now? })`, `now` is a FUNCTION | correct; the step-19 handoff's warning was heeded (the option is typed `() => Date`) |
| `unit-flags.ts:33` `UNIT_FLAGS_VERSION = "unit-flags-v0"` | correct |
| `llm-guard.ts:185-207` `llm_conflict_match` + the three cap names, no default | correct |
| `cron-run.ts:65` `"conflict-validate": 300`, `:72` `SWEEP_GRACE_SEC = 120` | correct |
| `conflict-validate/route.ts:52-53` `DEFAULT_LOOKBACK = 2`, `MAX_LOOKBACK = 3` | correct |
| `gate.ts:33-35` anonymous branch returns `null` when `FEATURE_AUTH_GATE !== "true"` | **corrected** — the memo-era citation was approximate; this is the exact range |
| `conflict-validation-profile.ts:42-46` "NO live path" | **corrected to `:42-45`** |
| lane C on `main`: `079065d` (F01), `2456c4f` (F03), `c1b0b31` (F05), `2217536`/`1031de8` (F07), `784d69a` | verified present — so prompt item (6) resolves to the "fixes landed" branch, and the checklist lists WS3-F01/F03 as CLOSED-in-code with a residual enablement check rather than as open blockers |

**Prompt item (7) honoured:** `roca`'s C5-m `multiEditionDays = 0` is stated in the checklist as a
property of the code (one candidate URL per ROCA day) and explicitly **never** cited as evidence
about ISW.

## Decisions needed

1. **[NEW — gate] May a `unit-flags-v0` number be shown on a PUBLIC surface when `CONFLICTS_UI`
   is turned on?** C13's binding condition says no number produced under `unit-flags-v0` may
   reach a customer; memo C10 (a) makes the `/conflicts` teaser tier public when the flag is on.
   Today they do not collide — the flag is absent everywhere and every conflict route 404s — so
   step 24 shipped the banner rather than a block. **At flag-on they collide directly.**
   Options: **(a)** land `compound-v1` before flag-on, so no `unit-flags-v0` number is ever
   public; **(b)** gate the teaser tier to `requireAcceptedUser` for the duration, which changes
   the shipped C10 access-tier split and needs its own entry; **(c)** accept the banner as
   sufficient public disclosure, a reading of "may not reach a customer" the words do not
   obviously support. **Recommendation: (a)** — blocker 1 blocks the soak anyway, so it costs
   nothing not already on the critical path, and it needs no new decision entry.
2. **[NEW — plan correction] Sample-power sizing (R-M-6) must absorb the measured
   `probe_failed` finding before day 1.** The design's §3 rationale that 21 days "covers at least
   one publication gap" cannot be relied on: gap confirmation requires every probe of the day to
   be a clean 404, and this host stops issuing them once its ~20-request not-found budget is
   spent. **Recommendation:** predeclare no threshold against `probe_failed` or
   `publication_gap` counts, and treat a zero-gap 21-day window as expected rather than
   anomalous. No code change; the sizing document is the place.
3. **[NEW — small, deferrable] Should `first_observed_at` be scheduled proactively rather than on
   C15's trigger?** §7 of the checklist gives a `cron_runs`-based detection procedure, but it is
   bookkeeping a human must actually perform, and §4.1's measurement makes the trigger close to
   unexercisable — so the column may never be added for the wrong reason ("we never saw it")
   rather than the right one. **Recommendation: hold.** C15 is signed and deliberately additive;
   the honest move is to record in the soak report that the trigger was unexercised and why,
   which §7 already requires.

Nothing else in this step's scope needed a decision: C10 and C11 were signed as recommended and
the recommended branch was taken; no `AWAITING AUTHORIZATION` line is printed.

## Debt and risks

- **Per-day edition reads.** The view issues one `editionsForDay` query per distinct observed
  report day (≤30 on the overview; the index passes `stopAfterResolvedDays: 1` and issues exactly
  one per conflict, pinned by a test). Acceptable for a dormant flag-gated surface; a batched
  `editionsForDays` on the repository interface is the fix if the surface is ever enabled and
  read often. Not taken here because it would change an interface with three implementations for
  no present benefit.
- **The view window is closed at 30 days and OPEN at the future end.** A benchmark key naming a
  day older than the window is deliberately not addressable (404) — that is the product rule, and
  it is what keeps the observation read bounded rather than unbounded for a hand-typed URL. There
  is no upper bound on `report_date`, so a mis-clocked future-dated observation would render.
  Left alone deliberately: the discovery path only registers real editions, and an upper bound
  would hide a genuinely wrong row rather than surface it.
- **`BenchmarkHeadline`'s unavailable branches are now page-unreachable.** `persistObservation`
  refuses a non-scored result, so no observation can be unavailable or a publication gap. The
  component keeps the branches and `benchmark-unavailable.test.tsx` keeps covering them — a
  defensive contract, not dead weight — but the fixture-only cases the old detail-page test
  exercised (publication gap, retention gap, empty eligible set) no longer have a page-level test
  because they no longer have a page-level path.
- **Two itest seeding collisions, both from the fork being a production copy**, recorded because
  the next author will hit them: `digests_country_date_track_idx` is unique on
  (country, date, track) and production already holds a ru/military digest for every recent day
  (fixed with a far-future digest day, the `conflict-observations.itest.ts` device); and the
  goldens' own claim ids (9xxx) very likely name REAL production claims, so the seeded result's
  published-retention union is retargeted onto the one claim the suite inserts.
- **The C13 banner is a label, not a mechanism.** Nothing prevents a screenshot of a
  `unit-flags-v0` figure from being pasted into a deck. The mechanism is that the flag is absent
  in every environment; decision 1 above is what turns the label into a policy at flag-on.
- **`scoreboard.caveat` exists only in the `en` and `uk` catalogs**; the other five fall back to
  English. The C10 sentence was appended to both that define it. Adding English text under a
  `de`/`fr`/`ar`/`ja`/`pl` key would be worse than the existing honest fallback, so it was not
  done — but the memo's "the same in every catalog" is satisfied for `scoreboard.col.theater`
  (all seven, translated, each marked `needs native review`) and not literally for the caveat.
- **Six of seven catalogs' new column label is machine-quality**, marked `// xx: needs native
  review` per the house convention. A native pass is owed before the relabel is quoted to a
  non-English customer.

## Handoff

### For step 26 (go/no-go) and step 27

- **Both PRs are inert on deploy in the only sense that matters:** every `/conflicts` route 404s
  while `CONFLICTS_UI` is absent, and it is absent in all three Vercel environments. The
  **user-visible delta of PR #95 is exactly two things**: the `/scoreboard` column label and
  caveat sentence, and the new `robots.ts` disallow line. Nothing else on any public surface
  changes. PR #96 is docs only.
- The `/scoreboard` query is byte-identical and re-pinned; the country rows' figures are
  unchanged. If step 26 wants one assertion to check, it is that test
  (`scoreboard/page.test.tsx`, "re-pins the query").
- **No migration** in either PR. The D10 order (0028/0029 step 13, 0030 step 16) is untouched.

### For WS-3.6 (whoever schedules the soak)

- `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md` is the checklist; the design
  remains the threshold authority and the checklist says so explicitly.
- **Decision 1 above is a gate on flag-on, not on the soak.** The soak does not need
  `CONFLICTS_UI` at all (design §2).
- **The soak should start from editions discovered after `c1b0b31`** (WS3-F05), or report the
  mixed population: Iran editions discovered before it carry RU/UA-derived signatures and
  therefore `unattributed`. That is honest and must not be back-filled.
- The first real `llm_conflict_match` ledger row is the money-path proof; step 19 asked for it to
  be recorded when it happens, and this step does not change that.

### Prompt rewrites this step earns

- **`docs/prompts/2026-09-05-48h-24-…md`** is fully consumed; no rewrite needed. For the record,
  its item (6) resolved to the "lane C has landed" branch, so the checklist lists WS3-F01/F03 as
  fixed-in-code with a residual measurement check rather than as open blockers with owner step 23.
- **PLAN-WS-3 §3.5a** — its Files list is accurate except that `product-view.ts` did not merely
  stay "for tests/goldens only": three pure modules were extracted from it so the DB view could
  satisfy the hygiene test at all. Anyone re-reading §3.5a should expect
  `evidence-row.ts`, `result-summary.ts` and `product-slugs.ts` in the diff. Its
  "`src/i18n/dictionaries.ts` (`scoreboard.col.theater`, `scoreboard.caveat` in all seven
  catalogs)" overstates the caveat: only two catalogs define it.
- **A future WS-3.6 prompt** should carry Decisions 1 and 2 above verbatim, because both are
  answered before day 1 or not at all.

## Proposed AGENTS.md changes

This session made **no** edit to `AGENTS.md` (COMMON §4.7: not a governance step, and no standing
line was made mechanically wrong — the `drizzle/` range is untouched at `0000–0030`). Step 25
applies the following.

1. **Directory map, `src/components/` line.** No change needed. **`src/lib/conflicts/`** — the
   step-19 report already proposes a merged replacement for those lines; this step adds one
   clause to it. After step 19's text, the phrase *"Imported in production only by the dormant,
   unscheduled conflict-validate route and `src/lib/isw/edition-discovery.ts`"* becomes:

   ```
   Imported in production by the dormant, unscheduled conflict-validate
   route, src/lib/isw/edition-discovery.ts, and the flag-gated /conflicts/**
   pages (through db-product-view.ts, which imports no fixture module —
   db-product-view.test.ts scans the tree in both directions)
   ```

2. **Proposed decision-log entry** (append at the END of the log, in date order):

   > **2026-09-10 (WS-3.5 — the conflict surfaces read real observations; WS-3.6 enablement
   > checklist; branch/PR only)** The `/conflicts/**` family stops reading the frozen fixture
   > corpus. `db-product-view.ts` (PR #95) reads `conflict_validation_observations` through
   > `latestObservationsFor` — latest row per EDITION, because the store is append-only and
   > deliberately has no "current" notion — and applies **memo C4 at read time**: the day's
   > editions are read, `selectDailyFinal` picks the winner, and only that edition's observation
   > is the day's headline. A day whose final edition is unevaluated renders as PENDING with a
   > typed reason and is NEVER satisfied by promoting another edition's row, which is exactly the
   > substitution the C5-m measurement found production's probe order making on 1 of 8
   > multi-edition days (2026-02-28 → 03-22, anchor `morning` vs daily-final `evening`).
   > **Ruling 3 is now enforced by module graph rather than by review:** the DB view imports no
   > fixture module and no conflict page or component does either, which required extracting
   > `evidence-row.ts`, `result-summary.ts` and `product-slugs.ts` out of the fixture provider
   > and is scanned in both directions, including that the test-only builders are imported by
   > tests only. `synthetic-banner.tsx` and `benchmark-run-list.tsx` are DELETED — the first
   > because declaring real observations a synthetic corpus is the opposite lie, the second
   > because it was page-unreachable and its fixture import would have forced the scan to carry
   > an exemption for dead code. `benchmark-key.ts` gives edition keys a bijective URL form built
   > from the two closed tables so the halves cannot drift, satisfying the route's existing key
   > grammar unchanged and refusing in both directions anything it could not have minted. The
   > gated evidence view joins claim TEXT and the source trail LIVE — ruling 1 keeps prose out of
   > the observation table — with the published-digest, has-a-source and no-stub-document
   > predicates AT THE QUERY, every analytical field taken from the evaluation rather than
   > restated, and a union claim that no longer renders COUNTED with its id rather than
   > reconstructed. **Memo C13 ships as a banner, not a filter:** every observation this window
   > can write stamps `unit-flags-v0`, whose `compound` derivation is undetermined in the
   > over-credit direction, so the surfaces carry "compound handling undetermined — not
   > soak-eligible" in the slot the synthetic banner held, and it disappears by itself when a
   > calibrated version lands. Memo C8's legacy-only companion count sits beside the headline;
   > memo C11 renders no target and no target-coloured bar. **Memo C10** relabels the
   > `/scoreboard` country rows as evidence lenses in all seven catalogs with the non-additivity
   > sentence appended to the caveat in the two that define it — numbers, columns, filter, order
   > and limit unchanged and re-pinned by a test — adds the flag-guarded reciprocal `/conflicts`
   > link, and disallows `/conflicts/*/benchmark/*/evidence` in `robots.ts` while the teaser
   > pages stay crawlable. **The ruling-21 ROUTES-row obligation is discharged by
   > `conflict-feature-off.itest.ts` under a flag-ON server**, which now SEEDS two editions, one
   > observation written through the deployed `persistObservation` statement, and one real
   > published claim — without that seed the leak assertions would have passed vacuously against
   > an empty page, since the fixture corpus is no longer reachable. 25/25 on disposable branch
   > `br-patient-bar-ath7n7n8`: anonymous bare and `RSC: 1` bodies carry no claim text, the
   > accepted session does (the positive control), the Iran day's daily final is what renders and
   > the non-final morning key 404s, and reference-unit material appears in no body at all. PR #96
   > adds the WS-3.6 enablement checklist: five blocker dispositions (the Iran keyword rung CLOSED
   > by steps 06+19; compound calibration, the assessment class, source-independence and
   > sample-power still open), the ruling-4 cap ordering for `CONFLICT_MATCH_USD_CAP_DAILY`, the
   > N2/WS3-N06/WS3-N07 operating rules, the `vercel.json` line printed as an UNAPPLIED diff, the
   > log-drain queries, and the design's thresholds quoted with the design named as the authority.
   > It records three things that are new rather than restated: the C5-m measurement makes
   > `publication_gap` effectively unreachable under this host's throttling, so no soak threshold
   > may be predeclared against `probe_failed` counts; C15's reopening trigger gets a
   > `cron_runs`-based detection procedure, because the table it fires on carries no timestamp;
   > and **C13 collides with C10's public teaser tier at flag-on**, raised as a gate with the
   > recommendation to land `compound-v1` first, not decided. Gates: typecheck/lint clean · unit
   > **4,557/290 → 4,599/293** · fork itest 25/25. **$0, no environment change, no migration, no
   > deploy, no flag turned on, `git diff vercel.json` empty.**
