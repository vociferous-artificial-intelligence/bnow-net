# Conflict/region combined evaluations — Phase 7 final integration report

**Workstream:** `docs/prompts/2026-08-17-conflict-region-combined-evaluations.md`
(committed in-tree; §15 is this phase's charter).
**Date:** 2026-08-18. **Author:** Phase 7 integration lead.
**Branch described:** `codex/conflict-evaluations-p7-integration`.
**Exact tip this report describes:** the eleven gates in §6 were run against
`ad10fbd`. The only commit after it on this branch is the SHA-recording commit
that writes these identifiers into §6 gate 11 and touches nothing but this
file; the `--no-ff` merge commit sits above that, and a one-line addendum on
the integration branch records the final integration SHA. All four identifiers
are in the §6 gate-11 table.

**Terminal status: `implementation-pass / merge-awaits-operator-review`** (see
§7 for the reasoning and the exact conditions attached to it).

**Local-only, throughout all eight phases.** No push, no PR, no merge to
`main`, no deploy, no environment change, no feature enablement, no production
database access, no migration, and **zero paid application-provider calls**.
Every matcher in this workstream is a deterministic fixture oracle or an
injected-vote adapter; the conflict profile's `--execute-live` is refused by
code before any client construction, and the whole conflict range constructs
**no provider client at all** (§6 gate 10).

---

## 1. Ancestry and merge audit

### 1.1 Base chain (verified against git, not against prose)

| Claim | Command | Result |
|---|---|---|
| The branch descends from the quality-foundation base `7150b49` | `git merge-base --is-ancestor 7150b49 HEAD` | **true** |
| …and therefore from the reviewed QF SHA `e5757ea` | `git merge-base --is-ancestor e5757ea HEAD` | **true** |
| `origin/main` is an ancestor (no divergence to reconcile) | `git merge-base --is-ancestor origin/main HEAD` | **true** |
| Nothing in the chain is on `origin/main` | `git rev-list --count origin/main..HEAD` | **143** commits ahead; `HEAD..origin/main` = **0** |

Chain of custody, oldest → newest:
`9c5e9cb` (origin/main, Candidate B cron clustering) → `05fdd2c` (QF merge of
the reviewed routing tip `0e469f7`) → … → `e5757ea` (the **reviewed** QF
integration SHA) → `7150b49` (docs-only disposition commit; this workstream's
base) → seven conflict phase merges → `f7b563c` (Phase 6 merge) → this phase.

`7150b49` is code-identical to `e5757ea`
(`git diff e5757ea..7150b49 -- ':!*.md' ':!.env.example'` is empty); the
`.env.example` delta is commented documentation. Branching there rather than at
bare `e5757ea` was deliberate and is recorded as decision-register entry #1.

### 1.2 Inherited quality-foundation commits (reviewed elsewhere, NOT this workstream's scope)

`git rev-list --count 9c5e9cb..7150b49` = **52 commits** (48 non-merge + 4
merges), **90 files changed, +23,321 / −229**. Its four merges are:

| SHA | Merge |
|---|---|
| `05fdd2c` | reviewed cloud-model-routing tip `0e469f7` into the QF integration base |
| `eee6a91` | Worktree A — evidence recency + conversion funnel (review-gated) |
| `b4b0299` | Worktree B — durable map lease + version-aware remap (review-gated) |
| `fa81c1b` | Worktree C — analysis eval control plane (review-gated) |

Its surface includes `src/lib/evals/*`, `src/lib/analysis/*`,
`src/lib/validation/{run,llm-match}.ts`, `src/app/api/cron/map/*`,
`scripts/{analysis-eval,map-remap,map-backfill,quality-funnel-report,model-routing-inspect}.ts`,
four itest files, `AGENTS.md`, `docs/OPEN-TASKS.md`, `docs/PROGRESS.md`,
`.env.example`, and `docs/evals/analysis/*`. **The operator reviews that scope
separately**; this report grades only the conflict range below it.

### 1.3 Conflict-workstream commits (this workstream's scope)

`git rev-list --count 7150b49..HEAD` = **97 commits** (89 non-merge + 8 phase
merges), **124 files changed, +39,737 / −4**. The only deletions in the whole
range are 4 lines in `scripts/analysis-eval.ts` (two helper signatures
refactored while adding the conflict profile's results-path handling).

| Phase merge | SHA | non-merge commits | files | insertions |
|---|---|---|---|---|
| P0 frozen contract + fixture corpus | `0df9106` | 9 | 10 | +5,752 |
| P1 pure conflict domain | `8fe9288` | 9 | 21 | +3,756 |
| P2 reference reports/editions/windows | `e7f4b8e` | 16 | 20 | +3,882 |
| P3 relevance-filtered evidence union | `323013e` | 13 | 19 | +4,953 |
| P4 combined scorer + goldens | `c1a0a5e` | 12 | 27 | +8,406 |
| P5 eval-plane profile + snapshot provenance | `9a2db38` | 12 | 26 | +6,892 |
| P6 feature-off product UX | `f7b563c` | 13 | 30 | +4,091 |

### 1.4 Every ledger-claimed SHA, verified against git

All 41 SHAs the test ledger and workstream index cite were checked with
`git cat-file -e` + `git merge-base --is-ancestor <sha> HEAD`. **Every one
exists and is an ancestor of this branch.** Phase tips and gate-verdict tips:

| Phase | initial gate tip (verdict) | remediation commits | re-review tip (verdict) | phase branch tip (Gate close) | phase merge |
|---|---|---|---|---|---|
| 0 | `40d6775` (FAIL + FAIL) | `f7127e2`, `cca5d9d`, `9bd42db` | `ea35fbf` (PASS + PASS-WITH-MINORS) | `4d7d08b` | `0df9106` |
| 1 | `0d7ab8f` (FAIL) | `63547de` … `975cdcd` | `975cdcd` (PASS) | `99fee4b` | `8fe9288` |
| 2 | `651b9d6` (FAIL + FAIL) | `f90322b` … `e292ab3` | `e292ab3` (PASS + PASS-WITH-MINORS) | `b0d3a23` | `e7f4b8e` |
| 3 | `5f1844c` (FAIL + FAIL) | `f6dcdaa` … `9fef8b7` | `9fef8b7` (PASS + PASS-WITH-MINORS) | `e64d008` | `323013e` |
| 4 | `5b38007` (FAIL + PASS-WITH-MINORS) | `8779233` … `192c082` | `192c082` (PASS + PASS) | `5219ba8` | `c1a0a5e` |
| 5 | `022d3c1` (FAIL + FAIL) | `82ad8c0` … `2e1422b` | `2e1422b` (PASS + PASS-WITH-MINORS) | `2be6466` | `9a2db38` |
| 6 | `1f70852` (PASS-WITH-MINORS ×2) | `04a55de` … `611f30e` | `611f30e` (MINORs closed) | `7ea15a9` | `f7b563c` |

Every phase merge is `--no-ff` with an explicit gate verdict in its message,
and every phase reached PASS or PASS-WITH-MINORS **after** remediation and a
**focused re-review at a named SHA**. **Phase 1 has no standalone report file**
— its evidence is the code (`src/lib/conflicts/`, 10 modules), the test-ledger
Phase-1 block, and decision-register entry #10. That is a documented gap in
report symmetry, not in review coverage; called out here so the operator is not
surprised by the missing `P1-REPORT` filename.

### 1.5 Range-wide surface audit vs `7150b49` (freeze list)

`git diff --name-only 7150b49..HEAD`, classified (recomputed at the FINAL integration SHA `35c5c34`; rows sum to 124):

| Area | files | note |
|---|---|---|
| `src/lib/conflicts/` | 69 | the whole pure domain + scorer + product view; new package |
| `src/components/conflicts/` | 12 | new |
| `src/app/conflicts/` | 8 | new routes (4 pages + 4 test files) |
| `docs/reviews/` | 10 | this workstream's reports/ledger/register/index |
| `src/integration/` | 5 | 2 new itests, 1 new SQL fixture + README, **1 six-line comment** in `authz-page-gate.itest.ts` |
| `src/lib/evals/` | 5 | conflict profile + 3 test files (additive; inherited plane byte-unchanged) |
| `docs/evals/` | 4 | conflict scorecard + 2 offline results artifacts |
| `docs/designs/` | 4 | evaluation contract, reference-report schema, snapshot capture |
| `scripts/analysis-eval.ts` | 1 | additive conflict profile (+281 / −4) |
| `fixtures/conflicts/` | 5 | the 41-scenario acceptance corpus + README + committed goldens |
| `docs/prompts/` | 1 | the workstream prompt, committed per register #7 |

**Statistics provenance (pre-final-review correction):** the range figures in
this section were originally computed at the Phase-6 merge `f7b563c` (the P7
branch parent) and labelled as the HEAD range. They are RECOMPUTED here at the
final integration SHA `35c5c34` — 97 commits (89 non-merge + 8 merges), 124
files, +39,737 / −4, and 149 ahead of `origin/main` — and the area table above
was corrected (it had omitted the `fixtures/conflicts/` row and miscounted
three others). The deletions figure (−4) was correct at every tip. No gate
verdict, safety claim, or merge-order conclusion depended on the stale
numbers. Correction commit: `b8341e9` (docs-only, atop the final integration
SHA; the gate battery of §6 ran at `ad10fbd` and is unaffected).

**Freeze-list verification — all NONE:**

- `drizzle/` — no file touched; `drizzle/meta/_journal.json` untouched;
  **no numbered migration exists in this range** (design §12, prompt §3).
- `src/db/` — no file touched (no schema change).
- `src/lib/validation/{run,score,keywords,llm-match,at-publish,isw-extract}.ts`
  — untouched. The backtest emulation **imports** `classifyTakeawayTheater` and
  `extractSignature`; it never forks or edits them.
- `src/lib/isw/*`, `src/app/api/cron/validate/route.ts`, `scripts/validate.ts`
  — untouched.
- `src/app/scoreboard/*`, `src/lib/scoreboard/*` — untouched.
- `src/lib/analysis/map-versions.ts` and the digest/claims surfaces — untouched.
- Navigation, `robots.ts`, `sitemap.ts`, metadata — untouched (verified in
  source, in the built manifests, and in served output at Gate 6).

The single freeze-adjacent edit in the range is a **six-line comment** in
`src/integration/authz-page-gate.itest.ts` explaining why the gated conflict
route is deliberately not a row in that flag-absent harness, with a pointer to
the flag-on harness that carries its body assertions. No assertion, route,
token, or fixture in that file changed.

---

## 2. Main-drift forecast

**Fetch:** `git fetch origin` succeeded read-only at **2026-08-18T10:39:41Z**.

**`origin/main` has NOT advanced.** It is still `9c5e9cb` ("Merge PR #4:
Candidate B cron clustering", 2026-08-17T02:44:53−04:00) — the same SHA the
workstream index recorded at Phase 0 — and it **is an ancestor of this
branch**. `git rev-list --count HEAD..origin/main` = **0**.

Therefore there is **no three-way conflict to forecast against main today**:
merging this line into `main` is a fast-forwardable superset, and no rebase or
late merge of `main` was performed (prompt §15 forbids it).

That does not make the forecast vacuous, because several sibling branches are
ahead of `main` and any of them may land first. Overlap of each against (a) the
inherited QF surface and (b) the conflict surface:

| Branch (tip) | ahead of main | overlaps QF surface | overlaps conflict surface | forecast |
|---|---|---|---|---|
| `origin/codex/candidate-b-production-closeout-20260817` (`8c38d57`) | 1 | `AGENTS.md`, `docs/PROGRESS.md` | **none** | trivial textual conflicts in two docs. **One real risk: it edits `eslint.config.mjs`** — a lint-rule change lands under 37k inserted lines of conflict code. Re-run `npm run lint` after that merge, whichever order. |
| `claude/local-model-ask-eval-20260817` (`8a0ca89`, the operator's current checkout) | 1 | `AGENTS.md`, `docs/PROGRESS.md`, `src/lib/llm/*` | **none at file level**; `docs/evals/` at directory level only (it writes `docs/evals/*`, the conflict range writes `docs/evals/analysis/*`) | see the flag below |
| `codex/reconcile-live-state-20260816` (`5559f51`) | 1 | `AGENTS.md`, `docs/{CURRENT-STATE,OPEN-TASKS,PROGRESS}.md` | none | docs-only textual conflicts |
| `claude/business-planning-20260817` (`dbd9572`) | 1 | none | none | no conflict |
| `codex/cloud-model-routing-seams-20260816` (`0e469f7`), `codex/evidence-quality-observability-20260817` (`74d0f40`), `codex/map-reliability-remap-20260817` (`c40060e`) | 5 / 12 / 13 | already merged **into** this line via the QF base | — | no action |

**Operator-review flag (prompt §2 / §15).** The ordinary checkout
`/Users/go/code/bnow-net` sits on `claude/local-model-ask-eval-20260817`, whose
name suggests an **evals CLI surface**. Inspected **by `git log --oneline` and
`git diff --name-only` only** — no file contents read, per the isolation rule.
It adds `scripts/ask-eval.ts` and `docs/evals/*` artifacts. There is **no
file-level collision** with this workstream (`scripts/analysis-eval.ts` vs
`scripts/ask-eval.ts`; `docs/evals/analysis/*` vs `docs/evals/*`), but there is
a **conceptual collision**: two eval CLIs and two `docs/evals` conventions.
The prompt's standing rule is "ONE control plane and ONE
`scripts/analysis-eval.ts` entry point". Whether `ask-eval` is a third entry
point that should later fold in is **an operator decision, not this
workstream's call** — recorded here, unresolved by design.

**Proposed later merge order (unchanged from the QF recommendation, and
re-verified here):**

1. **Quality foundation first** (`e5757ea`/`7150b49`) — it owns the control
   plane the conflict profile extends. Merging conflicts first would land
   `scripts/analysis-eval.ts`'s conflict hunks on a file that does not yet have
   the QF plane, guaranteeing a conflicted merge.
2. **Then this conflict line.** Since it is a strict descendant of the QF base,
   this is a fast-forward or a trivial merge once step 1 has landed.
3. **Any intervening numbered migration** generated between steps 1 and 2 is
   harmless: this range creates none, and the conflict schema work (P2) exists
   only as design + disposable test SQL that runs on throwaway forks.
4. The operator may of course choose the alternative — cherry-pick the QF
   plane, land docs branches first, or land nothing. The only ordering this
   report asserts as **binding** is QF-before-conflicts.

---

## 3. Four-way fixture backtest matrix

### 3.1 The binding caveat, first

> **These are fixture results. They are NOT production gains and must not be reported as coverage improvements on real ISW reports.**

Every number in §3 is computed over the **41-scenario synthetic corpus** in
`fixtures/conflicts/`, authored in Phase 0 to exercise the prompt §16
acceptance cases and frozen since. The corpus was designed to contain the
structural situations under test; finding them is confirmation that the
combined method *can represent* a case the legacy method structurally cannot,
and nothing more. It says nothing about how often those situations occur in
real ROCA or Iran Update reports, nor about the matcher's real accuracy —
that is what the shadow soak in §4 is for, and it has not been run.

### 3.2 How each of the four methods was computed

**Generator:** `src/lib/conflicts/backtest-matrix.ts` (committed), pinned by
`src/lib/conflicts/backtest-matrix.test.ts` (19 cases). The aggregates below
are asserted **exactly** in that test, and the test also asserts that this
report contains the generated table block byte-for-byte — so the numbers
cannot go stale relative to the corpus without a red suite.

- **Method 2 — combined ROCA** and **method 4 — combined Iran regional/
  multi-track** are the *shipped pipeline*, unmodified: the Phase-3 assembler
  for both populations → the deterministic Phase-4 fixture oracle → the pure
  Phase-4 scorer, exactly the wiring the goldens and the eval profile use
  (`scoreFixtureScenario`). Headline reported as published retention, with
  corpus recall beside it.
- **Method 1 — current separate RU/UA** and **method 3 — current Iran
  military-only** are an *emulation* of `src/lib/validation/{run,score,
  keywords}.ts`, which were read but **never modified**. The emulation
  imports `classifyTakeawayTheater` and `extractSignature` from production, so
  the theater filter under test is literally production's.

Emulation choices (L) and fidelity limits (F). The module's
`LEGACY_EMULATION_NOTES` constant enumerates the original **fourteen** (L1–L5,
F1–F9) and its test pins that count; **F10 below was added by the final
methodology review in the docs-only closeout round**, so the report currently
lists one more limit than the module constant. Folding F10 into the constant
(and its test) is a recorded enablement follow-up — deliberately not done in a
round whose mandate was no code change:

| tag | choice / limit |
|---|---|
| L1 | one row per country (ru, ua) against the SAME ROCA report — `referenceFor()` maps both to theater `ru` |
| L2 | per-country denominator = takeaways whose `classifyTakeawayTheater(extractSignature(text).toponyms)` is `both` or that country; `both` and toponym-less units therefore sit in **both** denominators |
| L3 | numerator population = that ONE country's ONE `military` digest's published claims (`run.ts` selects `d.track='military'` for one iso2 and reads only that digest's claims); stubs excluded (ruling 3) |
| L4 | Iran gets **no** takeaway filtering (`run.ts` filters ru/ua only), so the ir denominator is every declared unit, scored against ir `military` published claims only |
| L5 | an oracle `partial` pair counts as a legacy match — the legacy matcher has no partial concept |
| **F1** | **the legacy matcher is not re-run.** Production matches with k=5 paid LLM votes or the keyword gazetteer; both are forbidden here. Substituting the oracle gives the legacy method a **perfect-recall** matcher, so every legacy miss below is a **structural** miss (wrong population or denominator), never a matcher failure. CORRECTED at the final methodology review: this is *generous on recall but NOT an upper bound on legacy's measured coverage* — the oracle also removes legacy's FALSE POSITIVES (the deployed legacy path has no negative/quiet-day rule and no cross-date rule), so on precision-trap units like `roca-quiet-day-010b` and `roca-recurring-template-007` real legacy would likely score HIGHER than shown here. The structural conclusion is unaffected: combined-only units are population-unreachable for legacy no matter how its matcher behaves. This is the central emulation choice and the one a reviewer should attack first. |
| F2 | `scoreDigest`'s keyword-only `matchable` denominator reduction is **not** applied; applying it would inflate legacy coverage further on top of F1 |
| F3 | `partial` counts as a legacy match but a combined miss (contract §6.4) — deliberately anti-favourable to the combined method |
| F4 | "no country digest that day" is not representable in a fixture; a country with zero eligible claims still gets a row scoring 0 (flagged `empty pop.`). Production ru/ua military digests are produced daily, so the row-exists reading is the faithful one |
| F5 | production has no legacy "combined" aggregate; `union` columns are computed here as the fairest apples-to-apples legacy aggregate, while `sumDenominator` is what the current scoreboard actually presents |
| F6 | `unavailable`/gap are compared as **states**, not numbers — the legacy pipeline can only emit a row or no row |
| F7 | the corpus is synthetic and most scenarios declare ONE unit, so per-scenario percentages are degenerate; only aggregates carry signal, and even those are corpus-design artefacts |
| F8 | single-unit scenarios make production's "all N takeaways off-theater → no run" branch dominant (7 ROCA country rows vanish entirely below). A real 5+-bullet ROCA would **deflate** a denominator instead of **deleting** a row |
| F9 | everything is scored at evaluation kind `retrospective` — the only kind this workstream may mint (register #5). The snapshot-anchored `unavailable` state is not exercised here; probed for the record, the same scenarios at `at_publication` return `unavailable` / `no_proven_snapshot` |
| **F10** | **temporal asymmetry, inflation-direction (added by the final methodology review).** Combined eligibility spans `[reportDate − 2d, window END]` day-granular, while the emulated legacy numerator is ONE digest date; the real Iran Update fixture states the series' own lookback is ~24h. The combined method therefore sees roughly **3× the window** the legacy row does, and that difference flows toward the combined numerator. This asymmetry is NOT covered by contract §5's "deflationary" sentence (which is about within-window evidence rules), and it is not quantified on this corpus — every fixture scenario declares claims inside a single day. The soak's legacy side-by-side must therefore report a window diagnostic (§4). |

Zero provider contact: the module reads no environment variable, imports no
provider SDK, touches no spend machinery, and constructs no client — pinned by
a source scan and by a case that recomputes the whole matrix with the provider
and database env vars deleted.

### 3.3 The matrix

#### Russia–Ukraine / ROCA — legacy separate RU+UA rows vs one combined evaluation

| scenario | acceptance case | legacy ru row | legacy ua row | legacy union | combined corpus recall | combined published retention | combined-only | diagnostics |
|---|---|---|---|---|---|---|---|---|
| `roca-ua-only-001b` | ROCA: a development supported only by a UA-tagged claim | no row (all units off-theater) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `roca-ru-source-002` | ROCA: a development supported only by a RU-tagged source about an event inside Ukraine | no row (all units off-theater) | 0/1 (empty pop.) | 0/1 | 1/1 | 1/1 | u0 | — |
| `roca-crimea-003` | ROCA: occupied Crimea (or another `both` geography) | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `roca-dprk-004` | ROCA: North Korean military support | 1/1 | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | — | — |
| `roca-coalition-005` | ROCA: an EU/NATO/member-state decision directly shaping the war | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `roca-eu-domestic-006` | ROCA: unrelated European domestic news that must be excluded | 0/1 (empty pop.) | 0/1 (empty pop.) | 0/1 | 0/1 | 0/1 | — | — |
| `roca-recurring-template-007` | ROCA: same town and action class on different dates (must NOT match — ruling-12 spirit) | 0/1 (empty pop.) | 0/1 | 0/1 | 0/1 | 0/1 | — | — |
| `roca-retention-gap-008b` | ROCA: one mapped-corpus match omitted from published output (corpusRecall matched, publishedRetention miss) | no row (all units off-theater) | 0/1 (empty pop.) | 0/1 | 1/1 | 0/1 | — | — |
| `roca-compound-partial-009b` | ROCA: a compound reference unit with partial evidence (expected `partial`, counted as miss in headline) | no row (all units off-theater) | 1/1 | 1/1 | 0/1 | 0/1 | — | partial: 1 |
| `roca-quiet-day-010b` | ROCA: a quiet/no-advance unit opposed by a positive advance claim (must NOT match) | 0/1 (empty pop.) | 0/1 | 0/1 | 0/1 | 0/1 | — | — |
| `cc-timestamps-003` | Cross-cutting: missing and malformed cutoff/publication timestamps | no row (all units off-theater) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `cc-dst-offset-004` | Cross-cutting: DST boundary and explicit-offset timestamps (-04:00 vs Z same instant — identical treatment) | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `cc-fetch-after-cutoff-005` | Cross-cutting: evidence fetched after cutoff but before publication | no row (all units off-theater) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `cc-ingest-after-publication-006` | Cross-cutting: source published before cutoff but ingested after publication | 1/1 | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | — | — |
| `cc-regen-after-instant-007` | Cross-cutting: latest digest regenerated after the historical evaluation instant | no row (all units off-theater) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `cc-superseded-version-008` | Cross-cutting: current and superseded extractor versions together (superseded excluded with `superseded_version`) | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `cc-independence-010` | Cross-cutting: one authoritative source vs many dependent copies (independence = 1) | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |
| `cc-injection-012` | Cross-cutting: source text containing prompt instructions / fake schema fragments | 1/1 | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | — | — |
| `cc-matcher-failclosed-013b` | Cross-cutting: malformed/truncated/empty matcher output and partial vote rounds | 0/1 (empty pop.) | 1/2 | 1/2 | 1/2 | 1/2 | — | — |
| `cc-state-zero-nonempty-016` | Cross-cutting: unavailable snapshot vs empty evidence vs genuinely zero matches — state 3: matched 0 with nonempty eligible set | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | — | — |
| `cc-window-rung2-017` | Cross-cutting: missing and malformed cutoff/publication timestamps - window END rung 2 (windowEndSource: published; Gate-0 science M2) | 0/1 (empty pop.) | 1/1 | 1/1 | 1/1 | 1/1 | — | — |

**ROCA aggregate** (21 scenarios, 22 declared units): legacy presents 15/36 across two rows (41.7%, denominator double-counts `both` units); legacy union = 15/22 (68.2%); combined published retention = 15/22 (68.2%); combined corpus recall = 16/22 (72.7%); combined-only units = 1; legacy-only units = 1; legacy no-run scenarios = 0; legacy deleted country rows = 7; combined unavailable/gap = 0; combined incomparable units = 0; corpus-vs-published disagreements = 1.

#### Iran and Regional Conflict / Iran Update — legacy ir military-only vs one combined evaluation

| scenario | acceptance case | legacy ir military row | combined corpus recall | combined published retention | combined theaters | combined tracks | combined-only | diagnostics |
|---|---|---|---|---|---|---|---|---|
| `iran-direct-kinetic-001` | Iran: direct Iran–Israel–US strikes | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `iran-hezbollah-002` | Iran: Hezbollah/Lebanon | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `iran-iraq-militia-003` | Iran: Iraqi militia activity | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `iran-houthi-maritime-004` | Iran: Houthi/Yemen maritime | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `iran-hormuz-gulf-005` | Iran: Hormuz or Gulf-base activity involving Oman/Bahrain/Qatar/UAE/Kuwait/Saudi Arabia | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `iran-iaea-nuclear-006` | Iran: IAEA/nuclear evidence from the NUCLEAR track | 0/1 (empty pop.) | 1/1 | 1/1 | ir | nuclear | u0 | — |
| `iran-e3-diplomacy-007` | Iran: E3/EU or mediator diplomacy | 0/1 (empty pop.) | 1/1 | 1/1 | ir | nuclear | u0 | — |
| `iran-elite-succession-008` | Iran: Iranian domestic security or succession from the ELITE track | 0/1 (empty pop.) | 1/1 | 1/1 | ir | elite_politics | u0 | — |
| `iran-domestic-exclusion-009` | Iran: unrelated Israeli/Gulf domestic or commercial news that must be excluded | 0/1 (empty pop.) | 0/1 | 0/1 | — | — | — | — |
| `iran-gulf-unavailable-010b` | Iran: an Iran Update lane with no comparable mapped Gulf evidence — expected `unavailable` for that lane, never manufactured | 0/1 (empty pop.) | 0/1 | 1/1 | bh | military | u0 | lane maritime: unavailable_incomparable; u0: incomparable_coverage |
| `iran-two-events-011` | Iran: the same proxy/actor in two DISTINCT events (must not cross-match) | 1/2 | 1/2 | 1/2 | ir | military | — | — |
| `iran-translation-hedge-012` | Iran: source-language translation that must not strengthen hedge or attribution | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `cc-editions-001` | Cross-cutting: multiple same-date report editions + deterministic final selection | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `cc-publication-gap-002` | Cross-cutting: a true publication gap | no run | — | gap (no report) | — | — | — | — |
| `cc-mirror-adapters-009` | Cross-cutting: mirrors/reposts across adapters (mirror_only exclusion for the mirror; corroboration NOT independent) | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `cc-stub-leakage-011b` | Cross-cutting: stub/fixture leakage attempt (stub: true → excluded `stub_fixture`) | 0/1 (empty pop.) | 0/1 | 0/1 | — | — | — | — |
| `cc-state-unavailable-014` | Cross-cutting: unavailable snapshot vs empty evidence vs genuinely zero matches — state 1: unavailable snapshot | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `cc-state-zero-empty-015` | Cross-cutting: unavailable snapshot vs empty evidence vs genuinely zero matches — state 2: matched 0 with empty eligible set | 0/1 | 0/1 | 0/1 | — | — | — | — |
| `cc-other-in-scope-018` | Cross-cutting: other_in_scope gate (contract section 5 — a generic security signal ALONE never reaches other_in_scope; topic-less region mentions never reach it either) | 1/1 | 1/1 | 1/1 | ir | military | — | — |
| `cc-vague-claim-019` | Cross-cutting: atomic/compound policy — a vague claim overlapping two distinct units topically is materially equivalent to neither and receives credit for zero units (register #9 deferred pin; contract section 6.3 as amended, Gate-0 science L1) | 1/2 | 1/2 | 1/2 | ir | military | — | — |

**Iran Update aggregate** (20 scenarios, 21 declared units): legacy ir military-only = 12/21 (57.1%); combined published retention = 16/21 (76.2%); combined corpus recall = 15/21 (71.4%); combined-only units = 4; legacy-only units = 0; legacy no-run scenarios = 1; legacy deleted country rows = 0; combined unavailable/gap = 1; combined incomparable units = 1; corpus-vs-published disagreements = 1.

### 3.4 What the matrix actually shows (and what it does not)

**ROCA — the gain is presentational and compositional, NOT a coverage
increase.** Legacy union coverage and combined published-retention coverage are
**identical on this corpus: 15/22 both ways**. That is the honest headline, and
it is stated first deliberately. What differs:

1. **Denominator inflation.** The two country rows present a **36-unit
   denominator for 22 real declared units** (+63.6%), because `both` and
   toponym-less takeaways sit in both rows. One report, two competing
   denominators, neither of which is the report.
2. **Seven country rows do not exist at all.** In 7 of the 42 country-rows the
   filter removes every declared unit, and production's
   `all N takeaways off-theater` branch emits nothing. On a real multi-bullet
   ROCA that becomes silent denominator deflation instead (F8) — the same
   defect, harder to see.
3. **One development is invisible to both rows** (`roca-ru-source-002`, "a
   development supported only by a RU-tagged source about an event inside
   Ukraine"): the unit's toponym is inside Ukraine, so the ru row never sees
   it; the ua digest holds no matching claim, so the ua row scores it a miss.
   Legacy union: 0/1. Combined: 1/1, attributed to the **ru** theater bucket.
   This is the exact structural miss the prompt's §1 mission describes.
4. **One development goes the other way**, and it is reported here rather than
   buried: `roca-compound-partial-009b` is a compound unit with partial
   evidence. Legacy credits it (no partial concept); the combined headline
   counts `partial` as a miss and surfaces `partialDiagnostic: 1`. The combined
   method is **stricter** here, and the aggregate parity above is partly
   produced by that strictness cancelling the win in (3).
5. **Corpus recall and published retention separate** on
   `roca-retention-gap-008b`: 1/1 vs 0/1. The legacy single row has no
   vocabulary for "we had it and did not publish it".

**Iran Update — the gain is structural and large on this corpus.** Legacy
`12/21` vs combined published retention `16/21`. All four combined-only units
are cases the ir `military` digest cannot reach by construction:

| scenario | evidence lives in | legacy | combined |
|---|---|---|---|
| `iran-iaea-nuclear-006` (IAEA/nuclear) | ir **nuclear** track | 0/1 | 1/1 |
| `iran-e3-diplomacy-007` (E3/mediator diplomacy) | ir **nuclear** track | 0/1 | 1/1 |
| `iran-elite-succession-008` (domestic security/succession) | ir **elite_politics** track | 0/1 | 1/1 |
| `iran-gulf-unavailable-010b` (Gulf-base activity) | **bh** theater, legacy contributor | 0/1 | 1/1 |

**The gulf incomparability is preserved, not papered over.** On
`iran-gulf-unavailable-010b` the two questions genuinely disagree and both are
reported: **corpus recall 0/1** with `missDiagnostic: incomparable_coverage`
and lane `maritime: unavailable_incomparable`, beside **published retention
1/1** carried by a labeled legacy `bh` contributor. A method that wanted to
look good would have reported 1/1 twice. (Gate 6 closed a MINOR precisely here:
the surface now explains the population difference in both directions.)

**Three distinct states remain distinct.** `cc-publication-gap-002` is a gap in
both methods (legacy: no run; combined: `publication_gap`, no fabricated
edition identity) — never `0%`. `cc-state-zero-empty-015` (empty eligible set)
and `cc-state-zero-nonempty-016` (nonempty set, genuinely zero matches) both
score 0 with different provenance. And under a snapshot-anchored kind every
scenario returns `unavailable` / `no_proven_snapshot` rather than a number.

**What the matrix cannot tell you:** whether the combined method's coverage on
real reports is higher, lower, or unchanged; whether the matcher's precision is
adequate; how often `both`-classified takeaways occur in real ROCA bullets; and
whether the Iran corpus in production actually holds nuclear/elite/Gulf
evidence on any given day. Those are §4 questions.

---

## 4. Shadow-soak plan (PREDECLARED, NOT ENABLED)

The full plan is `docs/designs/CONFLICT-SHADOW-SOAK.md` (committed with this
report). It is **design only**: no flag is set, no cron exists, no live conflict
dispatch path exists (`--execute-live` is refused under `--profile conflict`),
and running it requires six operator gates. Predeclared summary:

| Parameter | Predeclared value |
|---|---|
| Duration | ≥ **21 consecutive days** (extend to 35 if minima unmet; then `insufficient_data`, never a scored pass) |
| Minimum reports | **≥18 ROCA**, **≥14 Iran Update** |
| Minimum declared units | **≥90 ROCA**, **≥70 Iran Update** |
| Lane representation | ru/ua: ≥1 unit in each of 5 named lanes, ≥5 units outside `frontline_maneuver`. ir: ≥1 unit in each of 5 named lanes, ≥10 outside `direct_kinetic`, ≥3 lanes with ≥2 units. `other_in_scope` excluded from minima |
| Cross-theater/track proof | **≥5 declared units** matched by non-`ir` theater or non-`military` track evidence, or the regional claim is unproven |
| Matcher grading | 120 stratified (unit, claim) pairs per conflict, seeded sampler; 30-pair double-labelled overlap; **Cohen's κ ≥ 0.70** or `label_quality_failed` |
| Thresholds | **precision ≥ 0.90** (hard FAIL below), **recall ≥ 0.75** (below ⇒ `pass_deflationary`), **false-agreement on negative/quiet units ≤ 0.02**, ≥95% of days on the `llm-majority` rung |
| Variance | ≥3 repeated runs of the same 5 days; **≤5 pp** headline spread, **≤5%** unit-verdict flips, **zero** `partial ↔ matched` flips |
| Cost/query ceilings | provider row `openai_eval`; `EVAL_USD_CAP_DAILY=2` (fail-closed when unset), `EVAL_DAILY_REQUEST_CAP=300`, `EVAL_RUN_REQUEST_CAP=200`, shared `LLM_SPRINT_USD_CAP` backstop **not raised**, total envelope **≤ $25**, `EVAL_DATABASE_URL` on a disposable branch with `--db-ack`, `maxRetries: 0` |
| Human review | the 120-pair sample per conflict, plus every false agreement quoted individually |
| Abort criteria | any non-`run_cap` budget stop; 80% of envelope before day 14; any write outside the eval store; interim precision < 0.85 at the day-7/day-14 checkpoints; two consecutive `keyword`-rung days; any non-`retrospective` scored persist; edition-selection non-determinism; any prose/full-text leak |

Operator gates before day 1: capture path proven (or `retrospective`-only, said
out loud); decision-log + register entries; cap envs set in **all** environments
before the reading code deploys (ruling 4 ordering); a reviewed live conflict
dispatch path (none exists); confirmed human labellers; legal review of soak
artifacts.

**Added by the final methodology review (all now in the plan document):**

- **Register #12's three BLOCKING prerequisites** — a versioned, human-
  calibrated derivation of `compound` for real takeaways; a measured compound
  rate over a real sample; and an explicit adjudication of the attestation
  rule against that measurement. Until these exist the primary metric is not
  well-defined on real inputs (§8.1), so no soak may start.
- **A second human sample — MISSES.** The 120-pair sample draws
  (unit, top-candidate-claim) pairs, so a claim wrongly excluded upstream by
  the lane classifier or the eligibility engine can NEVER enter it: the
  sample cannot see its own blind spot. N units scored `miss` are now sampled
  separately, with a human searching the UNFILTERED window corpus for
  evidence, against a declared threshold.
- **The `partial ↔ matched` variance criterion is VACUOUS as written** under
  register #11's attestation rule (no live rung can produce a compound
  `matched`, so the flip it forbids is unreachable). Marked as such and
  supplemented with a criterion that can actually fail.
- **Pair-level precision/recall must be reconciled against the headline.**
  Without it the report could publish 0.95/0.85 beside an Iran headline of
  0/5 and read as success.
- **A legacy side-by-side window diagnostic** (F10): report the day-span each
  method saw, so the ~3× window asymmetry is visible in the comparison rather
  than absorbed into it.
- **Non-independence MEASURED, not merely disclaimed** — see §8.1.

---

## 5. PR decomposition and operator decision list

### 5.1 Proposed PR order

The constraint that drives everything: **the conflict work extends the
inherited eval control plane and must not land before it.**

| # | PR | Contents | Depends on | Conflict risk |
|---|---|---|---|---|
| 0 | *(prerequisite, not this workstream)* quality foundation | `e5757ea` / `7150b49` | — | owns `src/lib/evals/*` + `scripts/analysis-eval.ts` |
| 1 | **conflict domain + contract** | `docs/designs/CONFLICT-REGION-EVALUATION.md`, `fixtures/conflicts/*`, P1 modules (`definitions`, `lanes`, `phases`, `vocabulary`, `instants`, `serialization`, `freeze`, `errors`) | 0 | none — all-new files |
| 2 | **reference reports, editions, windows** | P2 modules + `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` + `src/integration/sql/` + `conflict-reference-repo.itest.ts` | 1 | none — new files; **carries the deferred DDL as design + disposable SQL only** |
| 3 | **evidence union** | P3 modules (`eligibility`, `evidence-assembler`, `evidence-selection`, `lane-classifier`, `actor-rosters`, `evidence-records`, `fixture-corpus`) | 2 | none |
| 4 | **combined scorer + goldens** | P4 modules + `fixtures/conflicts/goldens/` | 3 | none. Reuses `llm-match.ts`/`keywords.ts` **through their existing exports**; neither file changes |
| 5 | **eval-plane conflict profile** | `src/lib/evals/conflict-validation-profile.ts` + tests, the additive hunks in `scripts/analysis-eval.ts`, `docs/evals/analysis/CONFLICT-*` | 0 **and** 4 | **the only PR that touches an inherited file.** Land last among the eval PRs; rebase on whatever `scripts/analysis-eval.ts` looks like at merge time |
| 6 | **feature-off product UX** | `src/app/conflicts/*`, `src/components/conflicts/*`, `feature.ts`, `product-view.ts`, `product-copy.ts`, `conflict-feature-off.itest.ts`, the 6-line comment in `authz-page-gate.itest.ts` | 4 | low; the comment hunk is the only shared-file touch |
| 7 | **P7 integration artifacts** | backtest matrix + test, shadow-soak design, this report, ledger/index/register updates | 1–6 | none |

Splitting further is possible but not recommended: PRs 1–4 are a single
contract whose tests cross-reference each other, and a reviewer reading them
out of order will re-litigate frozen decisions.

### 5.2 Everything required for a later deployment

**Migrations — the P2 deferred DDL (the only schema work in this workstream):**

- **None exists as a numbered migration, by design** (prompt §3, design §12).
  `drizzle/` and `drizzle/meta/_journal.json` are untouched.
- The intent is specified in `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md`
  and executed **only on throwaway Neon forks** by
  `src/integration/sql/conflict-benchmark-reports.sql`
  (`benchmark_report_editions` + companions; additive, no prose columns, the
  existing `isw_reports` row referenced by nullable FK and never changed).
- A future `conflict_snapshots` table is specified in
  `docs/designs/CONFLICT-SNAPSHOT-CAPTURE.md` §4 — also unwritten.
- **Operator action:** generate the real forward migration on the selected
  integration base, after all concurrent schema work is known; keep
  `9999_claim_source_trigger.sql` last (ruling 5).

**Feature flags:**

| Flag | Default | Meaning | Enable requires |
|---|---|---|---|
| `CONFLICTS_UI` | **absent = off**; the only ON spelling is `=1` | every conflict route `notFound()`s before data access | ruling-3 precondition below + a decision-log entry |
| *(eval-profile selection)* `--profile conflict` | CLI flag, not an env | offline fixture scoring only | nothing — it is already zero-provider and writes only eval artifacts |
| `EVAL_USD_CAP_DAILY`, `EVAL_DAILY_REQUEST_CAP`, `EVAL_RUN_REQUEST_CAP`, `EVAL_DATABASE_URL` | unset ⇒ **fail closed** | would govern any live conflict eval | set in ALL environments **before** deploying code that reads them |

> **BINDING (Gate-6 adjudication of record):** setting `CONFLICTS_UI=1` in any
> Vercel environment **while the surfaces are fixture-backed would breach
> standing ruling 3** (stub/fixture data must never render as fact). Real
> results plus retirement of the synthetic banner **must precede** enablement,
> recorded in a decision-log entry.

**Data backfills:** none required by this workstream, and none performed. A
future enablement needs (a) real conflict results, which needs (b) a live
conflict dispatch path that does not exist, and optionally (c) the snapshot
capture backfill described in the capture design — each separately gated.

**Report-discovery changes:** none shipped. `validateDigest`'s discovery is
untouched. P2 designs edition-aware discovery (multiple same-date editions,
designated-final selection, day-status records); wiring it to the live
validation cron is a later, separate change with its own review.

**Routes (all four `ƒ` dynamic, all `notFound()` when the flag is absent):**

- `/conflicts`, `/conflicts/[slug]`, `/conflicts/[slug]/benchmark/[key]`
  (public teaser tier: counts, lanes, scores, labels, methodology only)
- `/conflicts/[slug]/benchmark/[key]/evidence` (**gated**:
  `requireAcceptedUser()` first, then the feature guard, then data)

**Operator decisions required before any enablement** (the P5/P6 checklists,
consolidated — every item is unfinished today):

1. Ruling-3 precondition: real (non-fixture) results **and** synthetic-banner
   retirement, in a decision-log entry, **before** `CONFLICTS_UI=1` anywhere.
2. Snapshot capture path: build it under its own six gates, or accept
   `retrospective`-only labelling forever; either way a register entry
   superseding #5.
3. **Authorization-harness migration (ruling 21, BINDING):** when the
   fixture-backed `conflict-feature-off.itest.ts` is retired or rewritten, the
   gated evidence route MUST move into the `authz-page-gate.itest.ts` ROUTES
   table or an equivalent flag-on body-asserting harness, or it silently loses
   its body-level authorization proof.
4. **Robots/sitemap AND page-metadata posture review — unconditional at
   enablement.** Flag-on makes the teasers public and the gated evidence route
   a crawlable auth redirect, exactly the shape `robots.ts` disallows
   `/digests/` for. EXTENDED by final review #2: there is no conflict
   `metadata` export and no conflict layout, so the ROOT title
   ("BNOW.NET — validated OSINT intelligence") would apply to synthetic-data
   pages in browser tabs and link unfurls — the review must cover
   title/OpenGraph posture, not only crawl directives.
4b. **Reference-report URL and unit ordinals (final review #3 MINOR-4;
   enablement blocker, docs-only today).** The frozen result profile carries
   NO link to the external reference report (the P2 schema design specifies
   `canonical_url`, but the profile does not carry it), and reference-only
   units render as opaque ids (`u0 · Front-line maneuver · miss`) with no
   ordinal or keyword handle — while `/scoreboard` already renders
   "ISW takeaway #1 · keywords: …" and links the report. Ruling 1 forbids
   reproducing takeaway TEXT; it forbids neither an ordinal nor a hyperlink.
   Two items, BOTH requiring a profile/epoch change and BOTH preceding
   enablement, or q7 ("drill back into the evidence") stays a dead end for
   the surface's headline use case: (i) carry the reference report's canonical
   URL into the result profile and link it from the benchmark module;
   (ii) carry unit ORDINALS (and, if legally clean, the keyword handles the
   house scoreboard already ships) so a validator can find the bullet.
4c. **Per-source contribution buckets on an anonymous surface** (final review
   #3 NOTE-6): the teaser tier renders `bySource` domain buckets while the
   comparable house surface (`/registry`) is admin-only. Decide the posture at
   enablement — keep, aggregate, or gate.
5. Scoreboard reciprocal link (flag-guarded) so the two aggregations of one
   report point at each other, per contract §11(d).
6. i18n catalog integration for the conflict copy (currently English-only
   constants in `product-copy.ts`).
7. **Requested-k grouping** through the fallback rungs (the Gate-4 obligation
   discharged in P5's sanctioned re-baseline) — confirm the semantics still
   read correctly once a live matcher exists.
8. **Production-gazetteer follow-up** (Gate-4 NOTE): the keyword action-class
   gate deflates on non-canonical action wording ("shelled", "artillery
   struck"). Deflationary only, but it is a real recall cost on the keyword
   rung; owner is the production gazetteer, not this workstream.
9. Decide the `ask-eval` / `analysis-eval` CLI relationship (§2 flag).
10. Live conflict dispatch path: designing and reviewing one is a prerequisite
    for the soak, and nothing here authorizes it.
11. **`AGENTS.md` decision-log entry — deliberately NOT written by this
    workstream.** All eight phases left `AGENTS.md`, `docs/CURRENT-STATE.md`,
    `docs/PROGRESS.md`, and `docs/OPEN-TASKS.md` untouched, because the QF line
    and at least three sibling branches all edit those files and nothing here
    is live. The decision-log entry belongs to whichever merge actually lands
    this work; the material it needs is §1 (scopes), §5.2 (flags, DDL,
    checklist), and the ruling-3 / ruling-21 preconditions above. Writing it
    now would only manufacture a merge conflict.

---

## 6. The eleven full integration gates

Run on this branch, in this worktree, Node v24.14.0 / npm 11.9.0.

### Gate 1 — clean worktree + `git diff --check`

`git diff --check` → **clean** (no whitespace errors, no conflict markers).
Working tree clean at the gated commit; the only files added by Phase 7 are
`src/lib/conflicts/backtest-matrix.{ts,test.ts}`,
`docs/designs/CONFLICT-SHADOW-SOAK.md`, this report, and the ledger/index/
register updates. **PASS.**

### Gate 2 — targeted tests for every phase

Each phase's own test-file set, run in isolation:

| Phase | test files | tests | result |
|---|---|---|---|
| P1 pure domain (`definitions`, `lanes`, `phases`, `vocabulary`, `instants`, `serialization`) | 6 | **157** | pass |
| P2 reference/editions/windows (`editions`, `et-time`, `evaluation-window`, `reference-report`, `reference-repo`, `reference-repo-sql`, `report-extract`) | 7 | **100** | pass |
| P3 evidence union (`actor-rosters`, `eligibility`, `evidence-assembler`, `evidence-selection`, `lane-classifier`, `fixture-corpus`) | 6 | **240** | pass |
| P4 scoring (`match-contract`, `keyword-matcher`, `scorer`, `scorer-acceptance`, `scorer-legal-audit`, `contribution`, `goldens`, `offline-report`, `matcher-import-hygiene`) | 9 | **133** | pass |
| P5 eval plane (`eval-profile`, `snapshot-ref`, `evals/conflict-validation-profile`, `evals/conflict-cli-refusals`, `evals/conflict-profile-gate-spy`, `evals/cli-dynamic-imports`) | 6 | **78** | pass |
| P6 product UX (`feature`, `product-view`, `src/app/conflicts/**`, `src/components/conflicts/**`) | 7 | **65** | pass |
| P7 backtest matrix (`backtest-matrix`) | 1 | **19** | pass |
| whole `src/lib/conflicts` package | 33 | **723** | pass |

**PASS** — 0 failures in every set.

### Gate 3 — `npm run typecheck`

`tsc --noEmit` → **clean**, zero diagnostics. **PASS.**

### Gate 4 — `npm run lint`

`eslint` → **clean**, 0 errors / 0 warnings. **PASS.**

### Gate 5 — `npm test` (exact count)

**3,194 passed / 3,194 (227 files)**, 0 failed, 0 skipped.
Baseline at the P6 gate close was 3,175 / 226; Phase 7 adds exactly the 19
backtest-matrix cases in 1 new file, with **zero regressions anywhere**.
(For the longer arc: base `7150b49` = 2,402 / 185; the conflict workstream adds
792 tests across 42 files.) **PASS.**

### Gate 6 — production build with safe non-contact configuration

`npm run build` under `env -i` with only `PATH`, `HOME`, `NODE_ENV=production`,
`LLM_DISABLE=1`, `AUTH_SECRET` = a literal build-only placeholder, and
`DATABASE_URL` pointed at an unroutable host (`127.0.0.1:1`). **`CONFLICTS_UI`
absent** — the production default.

Result: **PASS, warning-free.** "✓ Compiled successfully"; static generation
8/8; all four conflict routes render as `ƒ (dynamic)`:
`/conflicts`, `/conflicts/[slug]`, `/conflicts/[slug]/benchmark/[key]`,
`/conflicts/[slug]/benchmark/[key]/evidence`. No route regressed to static, and
no existing route changed shape.

Recorded, not re-run: at Gate 6 the **product reviewer additionally built and
served with the flag ON against an unroutable `DATABASE_URL`** and got HTTP 200
on every conflict page — proving the conflict surfaces carry **zero runtime DB
dependency**. That evidence stands at `1f70852`; the routes have not changed
since except for the closing-round copy commits.

### Gate 7 — full disposable-Postgres integration suite

`npm run test:integration` via the inline-env pattern: `NEON_API_KEY`,
`NEON_PROJECT_ID`, `DATABASE_URL` read **inline** from
`/Users/go/code/bnow-net/.env.local` (never copied into this worktree, never
echoed), every paid provider key blanked (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `X_API_KEY`, `OPENSANCTIONS_API_KEY`,
`POSTMARK_SERVER_TOKEN` = ""), `LLM_DISABLE=1`, under `env -i`.

**150 passed / 150 (21 files)**, 0 failed — exactly the expected total
(QF base 127/20 + the 23-case `conflict-feature-off.itest.ts`). Disposable Neon
branch `br-wandering-cherry-atk3f7wh` created, used, and **deleted** (delete
confirmed in the run output). Duration 99.85 s. Zero production database
access. **PASS.**

### Gate 8 — fixture/offline/estimate/report CLIs with zero-provider proof

All runs under `env -i` with only `PATH`/`HOME` unless stated.

| Command | Result |
|---|---|
| `--profile conflict --validate-dataset` | exit 0 — `conflict-roca-v1`: 8 cases (heldout 1/1/1) `sourceHash=bb53aa70f176`; `conflict-iran-v1`: 6 cases (heldout 1/1/1) `sourceHash=83c39aaf3c5f`; "No DB, no provider, nothing written." |
| `--profile conflict --estimate` | exit 0 — 8 calls / est \$0.0018 + 6 calls / est \$0.0013 = **est \$0.0031**, explicitly labelled a **hypothetical** run with no live path |
| `--profile conflict --offline` | exit 0 — idempotent no-op against committed artifacts ("nothing to do — 8/6 results already recorded") |
| `--profile conflict --offline --fresh` | exit 0 — rescored all 14 cases through the real conflict pipeline; every case `status=scored pass=true expectation=pass machinery=OK`. Regenerated files are **byte-identical to the committed ones except one `updatedAt` header line each** (the inherited results-format field; exactly the P5-documented behaviour). Restored with `git checkout`. |
| `--profile conflict --report` | exit 0 — scorecard rebuilt; both verdicts `insufficient_data` (honest: a 14-case fixture dataset cannot clear the inherited gate minima). Regenerated file differs only in its `generatedAt` header. Restored. |

**Refusal probes, all with a fake OpenAI key, a fake Anthropic key,
`EVAL_USD_CAP_DAILY=99` and a fake `DATABASE_URL` present** — i.e. an
environment that *would* let a paid path run if the guard failed:

| Probe | Exit | Message |
|---|---|---|
| `--profile conflict --execute-live` | **2** | "--execute-live is not available with --profile conflict: the conflict profile has NO live dispatch path in this workstream" |
| `--profile=conflict --offline` | **2** | equals-form refused |
| `--PROFILE=conflict --offline` | **2** | equals-form refused (uppercase) |
| `-p=conflict --offline` | **2** | equals-form refused (short dash) |
| `--profile bogus --offline` | **2** | unknown profile |
| `--profile conflict --conflict not_a_conflict` | **2** | unknown conflict id |
| `--profile conflict --workload map` | **2** | workload/profile conflict refused |
| `--execute-live --workload validation --model gpt-4o-mini` (generic path) | **2** | "REFUSED (before any client construction): DB host not acknowledged: pass --db-ack …" |

Every refusal fires **before** any client construction and before any write.
**Zero provider contact across every command.** **PASS.**

*Honest note (not a finding, recorded for the reviewers):* an **unrecognized
dash token** under the conflict profile (e.g. `--profile conflict
--unknown-token`) is silently ignored and the **default offline mode** runs —
inherited generic-CLI behaviour. It cannot reach a paid path (offline is the
safe default and `--execute-live` is refused under this profile), but a
strict-unknown-flag refusal would be a cheap hardening for whoever owns the CLI.

### Gate 9 — browser matrix (cited, not redone)

Per the prompt, the Gate-6 matrix is **cited**, not re-executed; the routes have
not changed since it ran. Its artifacts were verified to exist in this session's
scratchpad:

- author matrix — `p6-browser/`: **56 files** (36 PNG + 3 PDF + CDP scripts and
  logs): 390 px / desktop / CDP light+dark / print / feature-off-404 / empty /
  partial-lane / unavailable states. It **found and fixed a real bug**: a
  390 px document overflow (`scrollWidth` 576) caused by sr-only table labels
  escaping the scroll clip — fixed in `50761e7`, re-measured `scrollWidth=390`
  everywhere in both themes.
- independent Gate-6 product-reviewer reproduction — `gate6-shots/` (10 files:
  1280 dark, 390 light, 390 **RTL/ar**, print PDFs) and `gate6-html/`
  (17 served-HTML captures). The reviewer closed the author's disclosed gaps:
  **driven Tab-walk (33 stops**, skip-link first, visible focus, no traps),
  **measured WCAG contrast (worst 5.03:1 — AA everywhere)**, print PDFs,
  320 px, and the ar-locale RTL pass.
- feature-off 404s re-proven over HTTP in both matrices, and again at the
  body level by the 23-case itest re-run in Gate 7 above.

**PASS (cited).**

### Gate 10 — source scan

| Check | Method | Result |
|---|---|---|
| **SDK auto-retries / client construction** | `git diff 7150b49..HEAD \| grep -iE '^\+.*(maxRetries\|retries\|retryConfig\|new OpenAI\|new Anthropic\|createClient)'` | **The conflict range constructs no provider client at all.** The only hits are three prose lines in the committed prompt document. The house rule (`maxRetries: 0`, metering inside `analyze()`) is therefore vacuously satisfied — there is nothing to configure. |
| **Reservation / metering order** | `grep -iE '^\+.*(tryReserve\|SpendGuard\|provider_usage\|reserve\()'` over the range | **NONE.** No spend machinery is touched, added, or bypassed. Paid-path ordering is untouched because no paid path is reachable. |
| **Provider SDK imports** | `grep -iE "^\+.*(from ['\"]openai\|from ['\"]@anthropic)"` | **NONE.** Additionally pinned by `matcher-import-hygiene.test.ts` (10 modules) and by the new backtest purity case. |
| **Environment files / credentials** | `git diff --name-only` filtered for `.env`/`credential`/`secret` | **NONE** — no env file is in the range. `.env.local` was read **inline** for Gate 7 and never copied, printed, or committed. |
| **Secret-shaped strings** | `grep -iE '^\+.*(sk-[A-Za-z0-9]{10,}\|AKIA…\|BEGIN.*PRIVATE KEY\|postgres://user:pass@)'` | one hit: `DATABASE_URL: "postgres://fake:fake@localhost:5432/fake"` in `src/lib/evals/conflict-cli-refusals.test.ts` — a deliberate unroutable test fixture, not a credential. |
| **Reference / source prose** | the committed sentinel-audit tests, re-run green in Gate 5: `fixture-corpus.test.ts` "assemblies never carry reference-unit text (sentinel present in input, absent in output)"; `scorer-legal-audit.test.ts` "sentinel present in inputs, absent from every serialized result and offline report"; `goldens.test.ts` "the committed golden bytes recover no reference prose, no claim text, and no sentinel"; `report-extract.test.ts` "the returned object carries no prose from the input"; plus the assembler's typed refusal of a prose-bearing `editionKey` | **PASS** — and the sentinel's *input presence* is proven before its output absence is asserted, so the audit cannot pass vacuously. |
| **Generated paid results** | inspected both committed artifacts | `configKey` is `offline-fixtures` on both; no `usd`, `cost`, `apiKey`, `sk-`, or `model":"gpt` string appears anywhere in either file. **No paid results exist in the tree.** |

**PASS.**

### Gate 11 — exact SHA table

| Role | SHA | Note |
|---|---|---|
| `origin/main` at fetch (2026-08-18T10:39:41Z) | `9c5e9cb` | unchanged since Phase 0; an ancestor of this branch |
| QF reviewed integration SHA | `e5757ea` | the review-passed base (both final reviews PASS-WITH-MINORS) |
| **Workstream base** | `7150b49` | docs-only atop `e5757ea`; register #1 |
| P0 tip / merge | `4d7d08b` / `0df9106` | gate verdicts at `ea35fbf` |
| P1 tip / merge | `99fee4b` / `8fe9288` | gate verdict at `975cdcd` |
| P2 tip / merge | `b0d3a23` / `e7f4b8e` | gate verdicts at `e292ab3` |
| P3 tip / merge | `e64d008` / `323013e` | gate verdicts at `9fef8b7` |
| P4 tip / merge | `5219ba8` / `c1a0a5e` | gate verdicts at `192c082` |
| P5 tip / merge | `2be6466` / `9a2db38` | gate verdicts at `2e1422b` |
| P6 tip / merge | `7ea15a9` / `f7b563c` | gate verdicts at `1f70852`, MINORs closed at `611f30e` |
| **P7 branch parent** | `f7b563c` | the tree these gates were run against, plus this phase's commits |
| **P7 gated tip** | **`ad10fbd`** | the exact tree all eleven gates above were run against (`a61a4e7` soak plan → `24a6dae` matrix + report → `ad10fbd` ledger + index) |
| **P7 branch tip** | **`de3acc4`** | `ad10fbd` + this one SHA-recording commit, which edits this report and nothing else |
| **Final integration tip** | **`4e900a6`** (the merge) → this docs-only addendum commit, which is the branch tip | the `--no-ff` merge of the P7 branch into `codex/conflict-evaluations-integration-20260817`, plus the one-line addendum commit recording it |
| **Migration status** | **NONE** | `drizzle/` and `drizzle/meta/_journal.json` untouched across the entire 97-commit range; the P2 DDL exists only as design + disposable fork-only SQL |

Test results at the gated tip: **unit 3,194 / 3,194 (227 files) · integration
150 / 150 (21 files) · typecheck clean · lint clean · build PASS ·
`git diff --check` clean · zero paid provider calls · zero production writes ·
no env change · no deploy · no push · no PR.**

---

## 7. Terminal status, and what it does and does not assert

### Status

**`implementation-pass / merge-awaits-operator-review`**

Justified against the prompt §17 completion list:

| §17 requirement | Status |
|---|---|
| Phases 0–7 have clear pass/blocked status and evidence | **yes** — §1.4 table; ledger; seven phase reports (P1's evidence is code + ledger + register #10, noted in §1.4) |
| Every implemented phase passed its independent adversarial gate after remediation | **yes** — 13 reviewer verdicts across 7 gates, each re-reviewed at a named SHA; **every gate went FAIL or PASS-WITH-MINORS first**, which is the evidence the reviews were real |
| One report ⇒ one combined benchmark result with contribution drilldowns, not duplicate country denominators | **yes** — §3.3; one headline per report/edition, non-additive contribution buckets |
| Iran model represents regional/multi-track evidence without indiscriminately adding Middle East documents | **yes** — 4 combined-only units from nuclear/elite/bh, while `iran-domestic-exclusion-009` and `cc-stub-leakage-011b` still score 0 |
| Declared-reference-unit and lane coverage stay distinguishable | **yes** — lane rows partition the same declared units; row sums equal the headline denominator |
| Corpus recall and published retention stay distinguishable | **yes** — separate verdict maps and headlines everywhere; §3.3 shows them disagreeing on two scenarios |
| Cutoff/publication/finalized/retrospective inputs immutable and honestly labelled | **yes** — the three snapshot kinds return `unavailable`/`no_proven_snapshot`; twin persistence guards make a scored snapshot-kind result unmintable |
| Report editions and publication gaps deterministic | **yes** — designated-final selection; a true gap carries no fabricated edition identity |
| No ISW/CTP prose or source full text persists or renders | **yes** — Gate 10 |
| Existing production behavior unchanged when flags are absent | **yes** — Gate 6 (flag-absent build), Gate 7 (23 body-level feature-off cases), and the untouched freeze list in §1.5 |
| No paid calls, production writes, deploys, pushes, PRs, or merges to `main` | **yes** — Gates 7, 8, 10 |
| The report suffices for an operator to decide merge order without chat history | **this document** — §1 (both scopes enumerated), §2 (drift + order), §5 (PRs + decisions) |

**Not `integration-blocked`:** there is no missing external branch, commit,
interface, or credential. The QF base exists and is reviewed; `origin/main` has
not moved; the Neon integration credentials worked; every gate ran.

**Not `review-gate-blocked` for phases 0–6:** all seven phase gates were
obtained and are recorded with verdicts and SHAs.

### The one honest qualification on this status

The prompt's §15 final step commissions **three fresh adversarial reviewers**
(methodology/science, safety/operations, product/analyst UX) against the exact
final SHA. **Those three reviews have not yet been performed at the time this
report is written** — by construction, since they must run against the SHA this
report creates. §8 is written *for* them: it states the residual risks
preemptively rather than waiting to be caught. A final PASS applies only to the
exact final SHA, and the operator should treat
`implementation-pass / merge-awaits-operator-review` as meaning **"all
implementable gates are green; the three final reviews are the remaining
gate"** — not as a claim that they passed. If the operator requires those three
verdicts before any merge decision, the correct reading of this workstream's
state is `implementation-pass` with the final review round outstanding; nothing
here self-certifies it.

---

## 8. Residual risks — written for the three final reviewers

Stated adversarially and honestly. Each item is something I would attack if I
were reviewing this branch cold.

### 8.1 For the methodology / evaluation-science reviewer

1. **The backtest's central emulation choice is generous to the incumbent, and
   you should verify that direction.** F1 gives the legacy method a *perfect*
   matcher (the oracle). If you think that overstates the legacy baseline, note
   which way it cuts: it makes the legacy method look **better**, so the
   combined method's residual wins are structural. But it also means the
   matrix says **nothing** about relative matcher quality — and the combined
   method's real-world value depends on a matcher that has never been run.
2. **ROCA shows no aggregate coverage gain** (15/22 vs 15/22). The report says
   so first, but a skim could still read the Iran numbers as "the method
   improves coverage". The defensible claim is narrower: it removes a
   double-counted denominator, restores 7 deleted country rows, and finds 1
   development that both rows structurally miss — while *losing* 1 unit to a
   stricter partial policy.
3. **Corpus-design circularity.** The corpus was authored in P0 to exercise the
   §16 acceptance list, and the combined method was built to handle those
   cases. Finding them is not independent evidence. Only the soak (§4) can
   break that circularity, and the soak has not run.
4. **The declared-unit denominator is the Key Takeaways list, not the report.**
   ISW's analytical content extends well beyond its takeaways. The label
   ("Key Takeaway benchmark coverage") is honest, but a reader may still
   over-read it as report-level coverage. Register #2 records the choice.
5. **`both`-by-default is load-bearing in the legacy emulation.** A takeaway
   with no recognized toponym defaults to `both` and lands in *both*
   denominators — the mechanism behind the 36-vs-22 inflation. That default
   lives in the production gazetteer, so the inflation magnitude is a
   *gazetteer* property, and a gazetteer improvement would shrink it without
   any conflict-layer change.
6. **The keyword rung diverges from production deliberately** (register #8 M1):
   the conflict evaluator keeps signal-less units in the full denominator as
   automatic misses, while production `scoreDigest` drops them. Deflationary
   and disclosed, but it means conflict and scoreboard numbers on the keyword
   rung are **not** comparable term-for-term.
7. **The shared-source caveat is a caveat, not a correction.** ISW/CTP consume
   sources BNOW also ingests; agreement is partly co-sourcing. Nothing here
   *quantifies* that dependence, and the soak plan does not attempt to either.
8. **Aggregation across reports is unweighted.** §3.3 sums units across
   scenarios; a real multi-day aggregate would need an explicit per-report vs
   per-unit weighting decision that this workstream has not made.
9. **`partial` as miss is a policy, not a measurement.** It is the conservative
   choice and it is pinned, but a compound-heavy report series will read as
   systematically lower than an atomic-heavy one.
10. **Matcher calibration is entirely unproven.** No precision/recall number
    exists for the conflict matcher against human labels — §4 predeclares the
    thresholds precisely because there is no data yet.

#### 8.1.a The primary metric is NOT yet well-defined on real inputs (final review #1, MEDIUM-1)

The final methodology review probed the two committed REAL ISW fixtures —
`fixtures/isw/roca-2026-06-30.html` and `fixtures/isw/iran-update-2026-07-24.html`
— through the PRODUCTION takeaway parser and read the resulting 9 bullets
(4 ROCA + 5 Iran Update). Every one of the 5 Iran takeaways is
multi-proposition; so are the ROCA bullets.

Against register #11's shipped attestation rule (every ladder rung emits
`partial` on a compound unit; `partial` is a headline miss; only the fixture
oracle may attest `full`), that means **a live Iran Update day could produce a
headline of 0/5 by construction** — not because the corpus lacked the
developments, but because no live rung is permitted to attest full coverage of
a compound bullet. On this synthetic corpus the effect is invisible: the
scenarios are overwhelmingly single-proposition, and the one compound scenario
(`roca-compound-partial-009b`) is *designed* to be partial.

Two consequences, both recorded rather than fixed (the round's mandate was no
code change, and the reviewer agreed no code change is required to merge):

- **`compound` has no derivation for real reports.** It is a hand-authored
  fixture field; nothing in the pipeline computes it from takeaway text. So
  the attestation rule's INPUT is undefined outside the corpus.
- **Therefore the headline metric is not well-defined on real inputs yet**, and
  register #12 makes a versioned human-calibrated `compound` derivation, a
  measured compound rate on a real sample, and an explicit adjudication of the
  attestation rule BLOCKING prerequisites for the soak.

#### 8.1.b Construct validity: assessments are not events (final review #1, MEDIUM-2)

Of the same 9 real bullets, roughly 4 are analytic ASSESSMENTS — statements
about intent, belief, capability, or opinion — rather than reports of discrete
events. A BNOW claim corpus built from event reporting cannot match those
under §6.3 material equivalence, however good the matcher is.

Today the only miss sub-label is `incomparable_coverage`, which is an
EVIDENCE-CLASS statement ("no comparable mapped evidence exists for this
lane"). So a rendered "1 of 4 (25%)" silently conflates two different
diagnoses: *we lacked the event* and *this bullet is not an event at all*.

Proposed (design only, NOT implemented, and deliberately denominator-neutral):
a THIRD purely-diagnostic unit class — assessment/inference — reported beside
the headline exactly as `partial` is, leaving the §3 denominator untouched.
Register #12 carries it as a required-before-soak diagnostic. Implementing it
is a profile change and needs its own review.

#### 8.1.c The keyword rung is degenerate for `iran_regional` (final review #1, MEDIUM-3)

The conflict keyword rung reuses the production gazetteer. That gazetteer's 34
canonical toponyms are RU/UA only — verified in this round by enumerating
`TOPONYMS` in `src/lib/validation/keywords.ts`: **zero** Iran, Gulf, Levant, or
Red Sea entries. Probed corpus-wide by the reviewer, `iran_regional` on the
keyword rung yields **0 matched / 0 partial, with only 13 of 20 units flagged
`keywordUnmatchable`** — so a keyword-rung Iran day publishes a scored 0/N
while the other 7 units render as ordinary misses rather than as unmatchable.

- **Required before soak (code, not done here):** for a conflict whose lanes
  have no gazetteer coverage the keyword rung must return `insufficient_data`
  rather than a scored zero. Recorded in register #12; not implemented in the
  closeout because it changes matcher behavior.
- **The shared-action-class gate, measured.** The Gate-4 narrowing (a keyword
  match additionally requires ≥1 shared canonical ACTION class) was measured by
  the reviewer over 10 realistic pairs: **precision 0.40, recall 0.33**, with a
  SUBSTRING false positive — "white" contains "hit", so the `strike` action
  class fires on unrelated text. The gate is still an improvement over
  toponym-only matching (which is what it replaced), but these numbers say the
  keyword rung is a degraded fallback in fact as well as in label. The
  substring-matching defect and the gazetteer stem gaps join the existing
  production-gazetteer follow-up item, now with numbers attached.
- **No test exercises the keyword rung on Iran text.** The rung's Iran behavior
  is unpinned in both directions; a soak-blocking fix should arrive with one.

#### 8.1.d Measure the non-independence instead of only disclaiming it (final review #1, MINOR-4)

Item 7 above says the shared-source caveat is "a caveat, not a correction", and
that the soak does not attempt to quantify it. The reviewer pointed out that
the repository already holds the data to quantify it at **zero provider cost**:
ISW's own endnote registry is in `source_citations` → `isw_reports` / `sources`
(~351K rows), and `raw_documents.source_id` points at the SAME `sources` table.

So for any scored report the fraction of matched units whose supporting
documents come from sources ISW cited IN THAT REPORT is computable directly.
That turns the §0 caveat from a disclaimer into a measurement, and it is now a
REQUIRED collected metric in the soak plan (design only; not implemented).

### 8.2 For the safety / operations reviewer

1. **Ruling 3 is the sharpest live risk.** The product surfaces are
   fixture-backed. `CONFLICTS_UI=1` in any deployed environment while that is
   true would render synthetic data as fact. The Gate-6 adjudication makes
   real-results + banner-retirement a binding precondition; verify that the
   default really is off in every spelling (only `=1` is ON; "true", "yes",
   "0", empty are all off) and that no committed config sets it.
2. **Ruling-21 harness continuity.** The gated evidence route's body-level
   authorization proof lives in the *flag-on* itest, not in the
   `authz-page-gate.itest.ts` ROUTES table (which runs flag-absent, where a
   positive control could never pass). Both files cross-reference the split.
   If the fixture itest is ever retired without migrating that row, the route
   silently loses its proof. It is recorded as a binding checklist item — but
   it is a checklist item, which is weaker than a test.
3. **Migration posture is "none", deliberately.** Verify that: `drizzle/` and
   the journal are untouched across all 97 commits, and the P2 DDL executes
   only on disposable forks. The corollary risk is that the *real* migration
   has never been reviewed as an applied artifact.
4. **Snapshot immutability is contract-level, not artifact-level.** The scorer
   and persistence gate validate the *ref's* structure; callers resolve the
   artifact. That is sound while the store is fixture-backed and unsound the
   moment a durable store exists — a durable store must re-verify at read.
   Recorded in the P5 residuals and in the capture design.
5. **Spend/metering: nothing to review, and that is the claim to check.** The
   range constructs no client, imports no SDK, and touches no SpendGuard call
   site. If you find any path from the conflict code to a paid provider, it is
   a BLOCKER — I could not construct one, including with a fake key and a cap
   present.
6. **The unknown-token fallthrough** in Gate 8's honest note: unrecognized
   dash tokens run the default offline mode instead of refusing. Safe today
   because offline is the default and live is refused under this profile;
   still worth a strict-unknown-flag pass by the CLI's owner.
7. **Concurrency/idempotency were exercised, but only on fixtures and forks.**
   The reference-repo itest ran on disposable Neon (including under
   `TZ=Asia/Tokyo`), and P2's date-read defect was found exactly that way.
   There is no production-scale concurrency evidence, because there is no
   production path.
8. **Query bounds exist and fail closed** (`EVIDENCE_MAX_INTAKE` with an
   overflow sentinel, selection ceilings, the NaN-safe limits guard from Gate
   3). They have never met a real corpus.
9. **`.env.local` handling.** It was read inline for Gate 7 only, never copied
   into the worktree, never echoed. Verify no credential material appears in
   any committed file or artifact (Gate 10 found none).
10. **Feature-off equivalence is proven at the body level, not merely by status
    code** — 23 itest cases assert on response bodies with statuses
    deliberately untrusted, in both flag-absent and flag-ephemeral-on servers.
    That is the right shape; confirm the positive controls are non-vacuous.

### 8.3 For the product / analyst-UX reviewer

1. **"Conflict" vs "country" is a genuinely new mental model**, and the
   scoreboard keeps its per-country rows. The contract requires reciprocal
   cross-reference links; the conflict side has the note, but the **scoreboard
   reciprocal link is flag-guarded and not yet built** (checklist item 5). An
   analyst arriving from `/scoreboard` today would not find the conflict view.
2. **Two numbers for one report will invite "which is right?"** The answer —
   different aggregations of one report, neither contradicting the other — is
   written into the copy. Judge whether it is prominent enough to survive a
   skim, because getting this wrong is worse than not shipping the surface.
3. **The synthetic banner must not be mistaken for a demo label.** Ruling 3
   forbids demo-labelled fixture data in production; the banner exists for the
   *local, operator-commissioned fixture review only*, and the enablement
   precondition is that it is **retired**, not softened.
4. **The overview's featured record is "newest scored"** — with this corpus a
   one-takeaway demonstration. Judge whether "Latest fixture benchmark day"
   reads clearly as synthetic to someone who did not build it.
5. **The contribution table's population differs from the headline's.** Buckets
   are computed over corpus-recall matches while the headline scores published
   output; on a retention-gap day the buckets can exceed the numerator. The
   Gate-6 closing round added a symmetric note explaining both directions —
   verify it actually lands for a reader who is not primed for it.
6. **Question 3 names actors, and no by-actor table is rendered.** The heading
   is contractual; the honest answer (actors contribute through lane
   assignment; a by-actor dimension is permitted but not computed) is pinned
   on both surfaces. Judge whether answering with an explanation is acceptable
   or whether the heading should change.
7. **`unavailable`, `0`, and "no report" are three different things**, rendered
   distinctly, and the gulf scenario exercises all the machinery. It is also
   the single most likely thing to be misread as failure. This is the case to
   attack hardest.
8. **Mobile/print/RTL were verified and one real bug was found and fixed**
   (390 px overflow). Print output is complete but unpolished — no page-break
   rules, wide tables print inside scroll wrappers.
9. **Accessibility was measured, not asserted:** 33-stop driven Tab-walk,
   skip-link first, visible focus, no traps; worst measured contrast 5.03:1
   (AA everywhere); 320 px and ar-locale RTL passes. Dark-mode contrast was
   inspected visually rather than measured numerically.
10. **i18n is absent.** The conflict copy is English-only constants; the
    surfaces render inside a seven-locale product. Checklist item 6.
11. **Does this make external validation easier?** My honest read: for the Iran
    Update, yes — one report, one number, with the cross-track and cross-theater
    evidence finally visible. For ROCA the gain is mostly *honesty* (one
    denominator instead of two overlapping ones) rather than *information*, and
    a reader expecting a better score will be disappointed. That expectation
    should be managed in the copy, not in the numbers.

---

## 9. Files added by Phase 7

| File | Purpose |
|---|---|
| `src/lib/conflicts/backtest-matrix.ts` | the four-way matrix generator: legacy emulation (production exports, read-only) + the shipped pipeline; pure, env-free, zero provider contact |
| `src/lib/conflicts/backtest-matrix.test.ts` | 19 cases — emulation-fidelity pins, exact aggregate pins, the named structural wins **and** the one direction the combined method is stricter, purity, determinism, and a check that this report contains the generated block verbatim |
| `docs/designs/CONFLICT-SHADOW-SOAK.md` | the predeclared, unenabled soak plan (§4) |
| `docs/reviews/CONFLICT-EVALUATION-P7-REPORT-2026-08-17.md` | this report |
| `docs/reviews/CONFLICT-EVALUATION-TEST-LEDGER-2026-08-17.md` | Phase 7 ledger block appended |
| `docs/reviews/CONFLICT-EVALUATION-WORKSTREAM-INDEX-2026-08-17.md` | Phase 7 row + final SHAs |


---

## 10. Closing note — the final SHAs

Recorded after the merge, as a docs-only addendum on the integration branch
(this section is the only change it makes):

| Identifier | SHA |
|---|---|
| P7 gated tip (the tree all eleven gates in §6 ran against) | `ad10fbd` |
| P7 branch tip (`ad10fbd` + the SHA-recording commit) | `de3acc4` |
| **Merge commit** — `--no-ff` of `codex/conflict-evaluations-p7-integration` into `codex/conflict-evaluations-integration-20260817`, message "merge phase 7: integration audit, backtest matrix, soak plan, final gates" | **`4e900a6`** |
| **FINAL INTEGRATION TIP** of `codex/conflict-evaluations-integration-20260817` | **this addendum commit** — a document cannot contain its own hash; resolve it with `git rev-parse --short codex/conflict-evaluations-integration-20260817`, and it is reported in the session's final output |

The merge is a fast-forwardable `--no-ff` of a branch that descended from the
integration tip `f7b563c`, so the merged tree is byte-identical to `de3acc4`'s
tree; the gate numbers in §6 therefore describe the merged content exactly.
This addendum commit edits only this file.

Local-only. Not pushed, no PR, not merged to `main`, not deployed, no
environment changed, no flag enabled, no production data touched, zero paid
provider calls.

---

## 11. The three mandated final adversarial reviews (2026-08-18)

All three ran against the final integration SHA **`b8341e9`** and returned
**PASS-WITH-MINORS**. Every finding is either fixed in the closeout rounds
below or recorded as a pre-soak / pre-enablement obligation. No reviewer
raised a BLOCKER or a MAJOR, and none asked for a scorer or matcher behavior
change as a merge condition.

### 11.1 Review #1 — methodology / evaluation science: PASS-WITH-MINORS

Scope: the metric's construct validity on REAL inputs, the backtest's
emulation honesty, and the soak plan's ability to fail. Its distinguishing
move was to stop trusting the synthetic corpus: it ran the two committed real
ISW fixtures through the PRODUCTION takeaway parser and read the 9 resulting
bullets, then probed the keyword rung corpus-wide and measured the Gate-4
shared-action-class gate over 10 realistic pairs. Findings: 3 MEDIUM + 3
MINOR, all documentation/register/soak-plan scope — the reviewer stated
explicitly that no code change is required, and the coordinator agreed.

| Finding | Disposition |
|---|---|
| MEDIUM-1 compound attestation narrows contract §3; `compound` has no derivation for real reports (9/9 real bullets multi-proposition ⇒ a live Iran headline could be 0/5 by construction) | Register **#11** records the rule AS SHIPPED, its divergence from §3, its fail-closed rationale, and its PROVISIONAL status; register **#12** makes derivation + measurement + adjudication BLOCKING before any soak; report §8.1.a reproduces the probe |
| MEDIUM-2 construct validity: ~4/9 real bullets are analytic ASSESSMENTS an event corpus cannot match, and `incomparable_coverage` is the only miss sub-label | §8.1.b proposes a THIRD purely-diagnostic unit class (denominator-neutral, reported as `partial` is); register #12 makes it a required-before-soak diagnostic. NOT implemented |
| MEDIUM-3 keyword rung degenerate for `iran_regional` (gazetteer is RU/UA-only — verified 34/34 canonical toponyms; 0 matched / 0 partial with 13 of 20 units flagged) + the action-gate measured at precision 0.40 / recall 0.33 with a substring false positive ("white" ⊃ "hit") | §8.1.c records both; register #12 lists `insufficient_data`-for-gazetteer-less-conflicts as a required-before-soak CODE change (not made here — it changes matcher behavior); the substring defect joins the production-gazetteer follow-up WITH the measured numbers; the absence of any Iran keyword-rung test is recorded |
| MINOR-1 backtest F1 overclaimed "most generous possible reading" | F1 corrected: generous on RECALL, not an upper bound on legacy's measured coverage (the oracle also removes legacy's false positives, and the deployed legacy path has no negative/quiet-day or cross-date rule). Numbers unchanged; the structural conclusion is unaffected |
| MINOR-2 temporal asymmetry absent from the F-list | Added as **F10** (inflation-direction, NOT covered by §5's "deflationary" sentence); the soak now requires a legacy side-by-side window diagnostic |
| MINOR-3 soak blind spots (pair-only sample; vacuous compound variance criterion; no pair↔headline reconciliation) | Soak plan §5.1 adds a REQUIRED miss sample searched against the UNFILTERED corpus with a ≤0.10 false-exclusion threshold; §6 marks the `partial ↔ matched` criterion vacuous under register #11 and supplements it; §10 requires the reconciliation |
| MINOR-4 measure the non-independence instead of disclaiming it | §8.1.d + soak §10: the endnote registry (`source_citations` → `isw_reports`/`sources`, joined via `raw_documents.source_id`) makes the ISW-cited-source fraction computable per report at zero provider cost — now a REQUIRED collected metric |

### 11.2 Review #2 — safety / operations: PASS-WITH-MINORS

Scope: fail-closed behavior, ruling-3 containment, authorization at the body
level, and what an untyped future DB mapper could smuggle past the intake.
Verification highlights, all independently executed: a **4-word / 1,317-window
prose scan over 71 persisted artifacts** with **zero hits** in any artifact; a
**23-case body-level authorization probe** including the signed-in-but-
**UNACCEPTED** tier that the authored suite does not cover; a
network-kill-switch CLI attack with fake keys present; and a four-layer
mutation test of the register-#5 refusal. It reached its own ruling-3
adjudication INDEPENDENTLY of the Gate-6 reviewer and agreed: **merging does
not breach ruling 3**, with the same enable-time precondition (real results +
banner retirement + a decision-log entry before `CONFLICTS_UI=1` anywhere).

| Finding | Disposition |
|---|---|
| M-1 intake omits the ruling-3-critical booleans (`stub`, `published`, `engine`, `currentExtractorVersion`) — an untyped mapper omitting `stub` admits a stub row as non-stub, since `undefined` is falsy | FIXED: `validateCandidateIntake` type-checks all four with typed `invalid_candidate_claim` refusals naming the field and never echoing values; the query contract's stub-adapter placeholder is replaced by the new exported `STUB_ADAPTER_NAMES` (evidence-records.ts, mirroring `src/lib/adapters/stubs.ts` and deliberately excluding `telegram_mtproto`, which is a REAL adapter since 2026-07-11) and states how a mapper must populate `stub` |
| M-2 `independentSourceCount` does not dedupe (a doc listed twice reported 2 and ESCAPED the thin-source diagnostic, disagreeing with the scorer's own deduped metric); `docId` unvalidated at both entry points (NaN passes `typeof === "number"`) | FIXED: Set-based dedupe by docId; `Number.isInteger(docId) && docId > 0` at BOTH the fixture loader and intake. Pinned: the duplicate probe now reports 1 and trips `thinSourced`, and the two independence metrics agree |
| M-3 row-grain vs LIMIT undocumented (one row per (claim, doc) ⇒ a LIMIT cuts at a ROW boundary, so the intake ceiling never trips while the last claim arrives with a truncated doc list); `PublishedRetentionClaimSource` had no contract at all | FIXED (contract text): the corpus-recall contract now requires bounding a DISTINCT-CLAIM subquery at `EVIDENCE_MAX_INTAKE + 1` and joining docs for exactly those ids — a claim arrives with its COMPLETE doc list or not at all — and states that the ceiling is a post-materialization assertion, not a pushdown. A full contract was written for `PublishedRetentionClaimSource` to the same standard (population, filters, ordering, bound, and its deliberate differences) |
| L-1 the ruling-3 banner was test-pinned on only 1 of 4 routes (deleting it from the other three left 760/760 green) | FIXED: a named banner assertion on each of the four route tests plus a flag-ON itest assertion over every teaser body. MUTATION-PROVEN: deleting the banner from each page fails exactly one named test on that route (4/4) |
| Operational checklist: page metadata/titles | §5.2 item 4 extended to title/OpenGraph posture; mirrored into P6 §12.6 |

### 11.3 Review #3 — product / analyst UX: PASS-WITH-MINORS

Scope: whether an analyst can read the numbers correctly, and whether the
surface's own honesty rules hold at every granularity. Independently measured
(and closing P6's own "NOT verified" keyboard item): a real **Tab-walk of
45/38 stops with zero missing focus rings**; canvas-resolved contrast with a
worst conflict-owned pair of **4.84:1 light / 7.61:1 dark**; **390px
`scrollWidth == clientWidth` on all seven pages**; print stamps rendering
**exactly once**; an unroutable-DB proof; and bad-input 404 behavior.

| Finding | Disposition |
|---|---|
| MINOR-1 a bare bold "0 of 1 (0%)" corpus card beside a 100% published card, on the very page whose lane table refuses that reading (register #8 H1 was applied at LANE granularity only; on a single-lane report the report-level corpus recall IS that lane) | FIXED: `PresenceModule` renders the lane table's amber qualifier + note (same copy constants) when EVERY corpus-recall unit carries `incomparable_coverage`. The published card keeps its real 1/1 — `missDiagnostic` is a corpus-recall statement by construction |
| MINOR-2 an EMPTY eligible set and a genuine zero were visually identical (the only signal lived in the COLLAPSED method stamps) — opposite diagnoses for an analyst | FIXED: a terse "(0 eligible claims in the corpus)" qualifier beside the ratio when `eligibleCount === 0`; both states pinned (zero-eligible renders it, a scored zero WITH candidates does not) |
| MINOR-3 the index card published a coverage % with neither the caveat nor the read-the-n instruction — the first number a visitor sees, outside any benchmark module | FIXED: both render on the card, pinned |
| MINOR-5 WCAG 2.4.4 — the two ladder-variant rows produced byte-identical accessible link names | FIXED: the variant is part of the accessible name; pinned by asserting all run-list link names are unique |
| MINOR-6 RTL numeric displacement + physical alignment | FIXED: `dir="ltr"` bidi isolation on the numeric runs in `Ratio` and `Counts` (a convention established for this package, documented in-code), logical `text-start`/`text-end` in both tables, pinned by a new `localization.test.tsx`; P6 §303's unverified RTL claim corrected in place |
| MINOR-7 the overview's featured record hid that it is an edge-case demonstration (the RU–UA overview features a malformed-cutoff sentinel, n=1, 100%) | FIXED: the detail page's "Fixture demonstration: …" line now renders on the overview too; pinned |
| MINOR-4 no path from a benchmark record to the external report; reference-only units are opaque ids | RECORDED as an enablement blocker in §5.2 items 4b (URL + ordinals, both requiring a profile/epoch change) and P6 §12.6. NOT implemented — the frozen profile is not changed in a closeout round |
| NOTE-3 evidence link on records with an empty union | FIXED on both surfaces: an explicit "no evidence view to open" line replaces the link (a sign-in wall in front of an empty view); pinned both ways |
| NOTE-2 detail contributor links lacked the overview's "; legacy engine" suffix | FIXED; pinned |
| NOTE-1 per-page `<title>` | RECORDED in §5.2 item 4 (metadata posture) — it is the same enablement review as review #2's finding |
| NOTE-4 unavailable records print with no audit identity | RECORDED: the method-stamps block renders only for scored results. An unavailable record's provenance IS its identity (kind + reason + report), which does render; carrying a stamp block for unavailable states is an enablement-time polish item |
| NOTE-5 390px last column off-screen (reorder so the scored population is visible first) | RECORDED, deliberately not done: the tables scroll inside their wrapper (measured `scrollWidth == clientWidth` on all seven pages, so nothing overflows the DOCUMENT), and column order is load-bearing for the run-list's reading order (day → demonstration → coverage → matcher → detail). Reordering is a design decision for the enablement pass, not a closeout edit |
| NOTE-6 per-source buckets on an anonymous surface vs admin-only `/registry` | RECORDED in §5.2 item 4c as an enablement posture decision |

### 11.4 What the closeout rounds did NOT change

No scorer, matcher, eligibility verdict, or selection behavior changed in a
way that moves a number: the committed goldens are **byte-identical** through
all three rounds (the drift gate ran green on every suite execution), and
`fixtures/conflicts/` was not touched. The intake and docId validations are
pure refusals of inputs no committed fixture contains; the independence dedupe
changes a count only when a document is listed twice, which no fixture does.
The three MEDIUM findings that WOULD change numbers — compound attestation,
the assessment class, and the keyword rung's `insufficient_data` return — are
deliberately left to register #12's pre-soak adjudication, with their evidence
recorded here.
