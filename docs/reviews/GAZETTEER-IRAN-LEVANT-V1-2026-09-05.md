# Iran/Levant gazetteer `iran-levant-v1` + `insufficient_data` diagnostic (48h step 06)

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-06-gazetteer-iran-levant.md` (WS-3.4a, Wave 1),
  under `docs/prompts/2026-09-05-48h-COMMON.md`.
- **Worktree:** `/Users/go/code/bnow-net-worktrees/48h-ws3-gazetteer-20260905`
  (`git rev-parse --show-toplevel` and `git branch --show-current` verified before any edit).
- **Branch:** `48h/ws3-gazetteer-20260905-gazetteer-iran-levant`.
- **Base SHA:** cut from `origin/main` **`dff58f2`** (`883e5e3` confirmed ancestor). `origin/main`
  advanced mid-session with the step 01 landing, so the branch was rebased onto
  **`8cb0e9e`** ("Merge PR #49: reconcile standing docs with main") and all gates re-run there.
  The rebase produced one conflict, in `docs/PROGRESS.md`; both sides were kept **verbatim** in
  timestamp order (the 2026-08-20 precedent, COMMON §4.1).
- **Spend: $0.** No database access, no provider call, no deploy, no environment change, no
  migration.
- **Prompt item 5 honoured:** nothing is wired into production `run.ts`; the per-country path
  keeps using `ru-ua-v1` through the re-exports. Step 19 wires the conflict path.

## Built

One PR: **`validation: versioned gazetteers (ru-ua-v1 unchanged, iran-levant-v1 new) +
insufficient_data diagnostic`**, five commits, deliberately ordered so that the byte-identity
claim is the commit graph rather than an assertion.

| commit | what |
|---|---|
| `docs: plan block for the Iran/Levant gazetteer step` | `docs/PROGRESS.md` |
| `validation: pin the RU/UA gazetteer signature snapshot before the split` | `src/lib/validation/gazetteer-snapshot.test.ts` + `fixtures/validation/gazetteer-snapshot-v1.json`, generated with the **pre-split** `keywords.ts` still in the tree |
| `validation: split keywords into a versioned gazetteer package (ru-ua-v1 verbatim)` | `gazetteer/{types,ru-ua-v1,match}.ts` + `keywords.ts` shim + `gazetteer/{ru-ua-v1,layering}.test.ts` |
| `validation: add the iran-levant-v1 gazetteer and the gazetteer registry` | `gazetteer/{iran-levant-v1,index}.ts` + `gazetteer/{iran-levant-v1,match,index}.test.ts` |
| `conflicts: add the insufficient_data class and gazetteer identity to the keyword rung` | `match-contract.ts`, `keyword-matcher.ts`, `fixture-matcher.ts`, `llm-compatible-matcher.ts`, `fixtures/gazetteer/iran-lane-probes-v1.json`, `keyword-matcher-iran.test.ts`, extended `keyword-matcher.test.ts`, `scorer.test.ts` literals |
| `validation: fail closed on empty gazetteer variants and inherited lookup keys` | two fail-open holes found in adversarial self-review of this branch's own new code (below) |

### 1. The gazetteer package (provisional C7 layout)

```
src/lib/validation/gazetteer/types.ts          Gazetteer | GazetteerVersion | MatchMode | Signature
                                               | RuUaTheater | IranTheater
src/lib/validation/gazetteer/ru-ua-v1.ts       the existing tables, MOVED VERBATIM + RU_UA_V1
src/lib/validation/gazetteer/match.ts          MATCH_THRESHOLD, matchScore, extractSignatureWith,
                                               expandToponymsWith, classifyTheaterWith
src/lib/validation/gazetteer/iran-levant-v1.ts IRAN_LEVANT_V1 (new)
src/lib/validation/gazetteer/index.ts          gazetteerFor / tryGazetteerFor / GAZETTEERS /
                                               GAZETTEER_KEYS / UnknownGazetteerError
```

`keywords.ts` is now a binding shim re-exporting its six historical symbols bound to `RU_UA_V1`.
**No consumer file changed**: `run.ts`, `score.ts`, `isw-extract.ts`, `analysis/stub-provider.ts`,
`conflicts/backtest-matrix.ts`, `evals/score-validation.ts`, `validation.test.ts` and
`backtest-matrix.test.ts` are byte-identical to `origin/main` across the whole branch. In
particular `backtest-matrix.ts:94` is untouched, so the purity pin at
`backtest-matrix.test.ts:88` (which asserts the literal `from "../validation/keywords"` in that
file's source) still holds.

`gazetteerFor(key)` is **fail-closed** (mirroring `conflicts/lanes.ts:161-169`) and keys on plain
strings — reference series (`roca`, `iran_update`), conflict ids (`russia_ukraine`,
`iran_regional`) and the version ids. It deliberately does **not** accept theater iso2 codes:
mapping a contributor theater onto a gazetteer is a scoring-policy decision for the caller, and
`ir` is not a reference series. Every returned object carries `version`.

### 2. `iran-levant-v1`

**106 canonical toponyms / 164 variants** (prompt asked for ≥60), English canonical forms plus
common transliteration variants, grouped by geography in comments: Iran interior · Gulf, straits
and the Red Sea approaches · Gulf states · Iraq · Syria · Lebanon · Israel and the Palestinian
territories · Yemen. Every canonical carries an `iran_regional` contributor theater
(`definitions.ts:110-128`): `ir` mapped, `il/sa/ae/qa/om/bh/kw` legacy_only, `both` for geography
no contributor theater owns (Iraq, Syria, Lebanon, Yemen, the waterways) — the treatment
`crimea` and `north_korea` already get in `ru-ua-v1`.

**Nine action classes**: the five `ru-ua-v1` ids kept with the same meaning, plus `nuclear`
(`enrich*`, `centrifuge*`, `iaea`, `uranium`, `jcpoa`, `safeguards`, `breakout`, `weaponiz*` …),
`militia` (`irgc`, `quds force`, `hezbollah`, `kataib hezbollah`, `pmf` / `popular mobilization` /
`hashd`, `houthi*`, `ansar allah`, `hamas`, `islamic jihad` …), `maritime` and `domestic`. The
last two are beyond the prompt's named list but are what the `maritime` and `domestic_security`
lanes need to score at all — the prompt asks for "the action lexicon deltas the Iran lanes need".

Two content rulings, both recorded in the file header:

- **Word-boundary match mode**, and it is load-bearing rather than cosmetic. Under the
  historical `text.includes(variant)` primitive, `aden` fires inside "bin Laden" and "Adenauer",
  `arak` inside "Karak", `qom` inside "Qomi", `homs` inside "Homsi", `gaza` inside "Gazans",
  `oman` inside "Romanian" and `hama` inside "Hamas". `match.test.ts` pins all of these in
  **both** directions — the false positives are asserted to occur when the same gazetteer is
  flipped to substring mode, so the mode is proven necessary, not merely claimed. The
  consequence is recorded too: `\b` is ASCII-`\w`-based, so a word-mode gazetteer must stay
  lowercase ASCII (test-enforced) and fa/ar script variants need a future `word-unicode` mode.
  `ru-ua-v1` stays on `"substring"` — which is also the only *correct* mode for its Cyrillic
  variants, since every Cyrillic character is a non-`\w` character.
- **Scale rule.** Entries are sub-national geography plus named maritime features, exactly as
  `ru-ua-v1` carries `pokrovsk` and `belgorod` but no `russia` or `ukraine`; a country-level
  canonical would give nearly every unit a toponym and make toponym overlap non-discriminating.
  The single exception is the six Gulf states, which are contributor theaters in their own right
  and are routinely the operational unit; each expands to its own places. Test-pinned in both
  directions.

No person names (ruling 20) — enforced by a denylist test. `lane-classifier.ts:114-130`'s
separate `IRAN_GEO` regex set answers a different question and is deliberately untouched.

### 3. `insufficient_data` — rung level only (decision E5)

`ConflictMatchOutcome` (`match-contract.ts:173,177`) gains two explicit-null fields, matching the
house style of `keywordUnmatchable: number | null`:

- `insufficientData: readonly string[] | null` — the unit ids with ZERO gazetteer signal AND zero
  action signal. That is "the rung cannot score this unit at all", which is a different statement
  from "the rung scored it and found no match". **Denominator-unchanged**: those units remain in
  the full declared-unit denominator as automatic misses exactly as before, and
  `keywordUnmatchable` remains *exactly* `insufficientData.length`, so register #8 M1's frozen
  definition is untouched — the array only names which units. Pinned.
- `gazetteerVersion: string | null` — a keyword result is only interpretable against the
  vocabulary that produced it.

`ConflictKeywordMatcher` takes an **optional** gazetteer defaulting to `RU_UA_V1`, so every
existing construction — the golden ladder variants, the `llm-compatible` adapter's fallback —
scores exactly as before. `fixture-matcher.ts` and `llm-compatible-matcher.ts` report `null` for
both; the ladder's keyword-fallback branch already spreads the fallback outcome, so pass-through
is pinned rather than reimplemented.

**`src/lib/conflicts/scorer.ts` is NOT touched, by decision.** See "Decisions" below.

### 4. Per-lane probes

`fixtures/gazetteer/iran-lane-probes-v1.json` — synthetic, repo-authored, provenance-stamped, and
deliberately **outside** `fixtures/conflicts/` so it can never enter `CONFLICT_FIXTURE_FILES`
(`fixture-corpus.ts:33`) or `conflictDatasetSourceFiles`
(`evals/conflict-validation-profile.ts:166`) and move a conflict dataset identity. All seven
`iran-lanes-v1` lanes, each with two positive units (with the claim each must pair with) and one
signal-bearing negative unit.

## Tests

| gate | before | after |
|---|---|---|
| `npm test` | **3,612 passed / 247 files** (measured on the branch point) | **3,704 passed / 254 files** |
| `npm run typecheck` | clean | clean |
| `npm run lint` | 0 errors / 3 warnings | 0 errors / 3 warnings (the same three pre-existing `no-unused-vars` warnings) |
| integration (`*.itest.ts`) | not run — **not applicable**: no DB access, no migration, no route, no page | — |
| spend | **$0** | **$0** |

New test files (7): `src/lib/validation/gazetteer-snapshot.test.ts`,
`gazetteer/{ru-ua-v1,match,iran-levant-v1,index,layering}.test.ts`,
`src/lib/conflicts/keyword-matcher-iran.test.ts`. Extended: `conflicts/keyword-matcher.test.ts`.
Literal-only edits: `conflicts/scorer.test.ts` (the two new fields on five outcome literals).

### The acceptance criteria, each verified

| criterion | result |
|---|---|
| `npm test` green with the new tests counted | 3,704 / 254, green |
| `git diff src/lib/validation/run.ts` empty | **empty** against both the original base and `origin/main` |
| snapshot test proves RU/UA behaviour unchanged | see below |
| every Iran lane scores ≥1 fixture unit without `keywordUnmatchable` | all 7 lanes score **both** positives with `keywordUnmatchable: 0` and `insufficientData: []` |
| `insufficient_data` appears only where intended | signal-bearing negatives are in neither the count nor the class, pinned per lane and in `keyword-matcher.test.ts` |

### The byte-identity proof

The snapshot fixture was generated and committed while the **pre-split** `keywords.ts` was still
in the tree. Three mechanical checks any reviewer can re-run:

```
git diff --stat 15fdd19 82a5dda -- fixtures/validation/gazetteer-snapshot-v1.json \
                                   src/lib/validation/gazetteer-snapshot.test.ts     # EMPTY
git diff --stat origin/main HEAD -- src/lib/validation/run.ts src/lib/validation/score.ts \
    src/lib/validation/isw-extract.ts src/lib/analysis/stub-provider.ts \
    src/lib/conflicts/backtest-matrix.ts src/lib/evals/score-validation.ts \
    src/lib/validation/validation.test.ts src/lib/conflicts/backtest-matrix.test.ts  # EMPTY
diff <(git show origin/main:src/lib/validation/keywords.ts | sed -n '5,110p') \
     <(sed -n '17,122p' src/lib/validation/gazetteer/ru-ua-v1.ts)                    # IDENTICAL
```

The snapshot records derived data only (ruling 1): canonical ids, action-class ids, theaters,
expansions, `matchScore` values and sha256s over the two ISW fixtures — no ISW prose and no
corpus prose reaches disk, and the committed bytes are asserted clean of both. It also records,
as a fact rather than a claim, that **all five** takeaways of
`fixtures/isw/iran-update-2026-07-24.html` extract **zero** toponyms under `ru-ua-v1` — which is
the blocker this step addresses, measured.

Because a snapshot can always be re-baselined by a later hand, `gazetteer/ru-ua-v1.test.ts`
carries an independent **legacy oracle**: the pre-split `extractSignature`/`expandToponyms`
bodies, verbatim, differentialled against the shipped functions over every declared variant
(~560 probes), both ISW fixtures and adversarial strings — including the quirks that must survive
(`"architecture"` → `strike`, `"Lymanske"` → `lyman`, `"Sumykhimprom"` → `sumy`). Insertion
**order** is compared, not set membership, because that order is persisted as
`isw_reports.takeaways[].toponyms`.

### Mutation checks (every guard proven to discriminate)

| mutant | result |
|---|---|
| swap two `TOPONYMS` keys | 2 failed / 9 (snapshot byte-compare + key-order literal) |
| `iran-levant-v1` `matchMode` → `"substring"` | 17 failed / 51 |
| rung stops collecting `insufficientData` ids | 5 failed / 29 |
| rung ignores its gazetteer parameter (the pre-repair state) | 8 failed / 16 |
| `keywords.ts` binds `iran-levant-v1` instead of `ru-ua-v1` | 10 failed / 24 |
| remove the empty-variant refusal | 2 failed / 29 |
| remove the own-property registry lookup | 1 failed / 5 |

### Adversarial self-review

`git diff | grep -inE 'key|secret|token|postgres://'` over this branch's own diff: **clean**.
No claim-to-source or rate-limit surface is touched (no ingest, no provider, no DB).

Two **fail-open** holes were found in this branch's own new code and fixed in the last commit —
both silent rather than loud, which is why they are worth recording:

1. An empty variant compiles to `new RegExp("aden|")`, which matches **every** string, so one
   stray entry would tag the whole corpus with that canonical. `compileTable` now refuses an
   empty variant and a variant-less canonical.
2. `gazetteerFor("toString")` resolved against `Object.prototype`, returned a truthy inherited
   value, walked straight past the fail-closed check and handed back `undefined` typed as a
   `Gazetteer`. The registry and `classifyTheaterWith` now do own-property lookups only.

## Rulings touched and how each is satisfied

- **Ruling 1 (no ISW prose in output).** The snapshot fixture and the probe fixture carry derived
  data and repo-authored synthetic text only; the snapshot test asserts the committed bytes
  contain no 4-word corpus fragment and no 6-word ISW-takeaway fragment. Where raw bullets are
  read at all, it is transiently and *in order to prove their absence*. The new
  `insufficientData` field carries unit **ids**, never unit text — the same data-minimization the
  scorer's output already keeps (`scorer.ts:34-39`).
- **Ruling 2 (traceability), Ruling 5 (migrations).** Untouched — no claim path, no `drizzle/`
  file, no `src/db/` file in the diff.
- **Ruling 3 (truth-in-UI).** No surface renders anything new; nothing is wired into a page or
  route. `product-view.ts` and `benchmark-headline.tsx` read `keywordUnmatchable`, whose value
  and meaning are unchanged.
- **Ruling 4 (fail-closed spend).** No paid call site exists in the diff.
  `matcher-import-hygiene.test.ts`'s Phase-4 purity scan still passes over `keyword-matcher.ts`
  and `match-contract.ts` (no env read, no provider SDK, no spend import, no `require`, no
  `fetch`), and the blanked-env adapter case still resolves from injected votes alone.
- **Ruling 13 (versioned extraction).** `mapExtractorVersion()` is not in the diff and no
  extractor version moves. The gazetteer is a *separate* versioned artifact; its version is now
  reported on the rung's outcome so a keyword result is never read against an unknown vocabulary.
- **Ruling 18 (`doc_claims` consumers go through `map-versions.ts`).** Untouched.
- **Ruling 20 (named people).** Person names are not toponyms and are not in the gazetteer;
  a denylist test enforces it. Organizations are action-class terms.
- **Ruling 21 (page-level gates).** No page, layout or route in the diff.
- **Register #8 M1 (the frozen `keywordUnmatchable` definition).** Preserved exactly:
  `keywordUnmatchable === insufficientData.length` is asserted, signal-bearing negative units are
  in neither, and the denominator is not touched.

## Citations re-verified

Every file:line the prompt named, checked against the tree and corrected where it had moved.

| prompt citation | verified |
|---|---|
| `src/lib/validation/keywords.ts:5-41` TOPONYMS | correct (pre-split) |
| `:43-62` ACTIONS | correct — `ACTIONS` at `:43`, `OBLAST_TOWNS` at `:66` |
| `:82-93` `TOPONYM_THEATER` | correct |
| `:≈100-110` `classifyTakeawayTheater` | **`:97-110`** (declaration at `:97`) |
| `src/lib/validation/run.ts:152-167` (production filter) | correct — `classifyTakeawayTheater` call at `:157`; **file byte-identical after this PR** |
| `src/lib/validation/score.ts` | present; imports at `:1-7`, uses at `:159-185`; untouched |
| `src/lib/conflicts/keyword-matcher.ts:36-42,54-56,71,77-81,108-116` | correct **before** this PR; the file is rewritten by it |
| `src/lib/conflicts/lane-classifier.ts:114-130` `IRAN_GEO` | **`:113-130`** (`const IRAN_GEO` at `:114`, block closes `:130`); untouched |
| `src/lib/conflicts/lanes.ts:21-42` (iran-lanes-v1 ×7) | correct — `IRAN_LANE_IDS` at `:33-42` |
| `src/lib/conflicts/definitions.ts:96-129` | correct — `CONFLICT_REGISTRY` at `:96`, `iran_regional` at `:110`, its `contributorTheaters` at `:117-126` |
| `docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101` | correct — §6, "assessment diagnostics (denominator-unchanged third class); the Iran keyword rung (pre-soak CODE change — the gazetteer is RU/UA-only)" |
| `docs/designs/CONFLICT-SHADOW-SOAK.md:37-48` | correct (shadow isolation) |
| `git grep -l "validation/keywords"` | 5 code importers + 2 test references; the literal grep MISSES the four intra-package relative importers (`./keywords` in `isw-extract.ts:2`, `run.ts:5`, `score.ts:7`, `validation.test.ts:5`) — true blast radius is 9 modules |
| `src/lib/validation/validation.test.ts` (where the `extractSignature` tests live; no `keywords.test.ts`) | correct; **passes unedited** |

New citations this step relies on:
`src/lib/evals/conflict-validation-profile.ts:166` (`conflictDatasetSourceFiles`) and `:174`
(`conflictDatasetContentHash`) · `scripts/analysis-eval.ts:440` (`refuseOnIdentityDrift`,
`process.exit(2)`) · `src/lib/evals/hardening-cli.test.ts:192` (the conflict offline resume pin) ·
`src/lib/conflicts/fixture-corpus.ts:33` (`CONFLICT_FIXTURE_FILES`) ·
`src/lib/conflicts/goldens.test.ts:13` (`UPDATE_CONFLICT_GOLDENS=1`, the documented regeneration
step — **never set in this session**).

## Decisions

### E5 — the scorer-level `insufficient_data` emission (RESOLVED for this step)

Threading the diagnostic into `ConflictResultV1` changes exactly one committed golden,
`cc-matcher-failclosed-013b#B-zero-valid-rounds` (its `u1` is the corpus's only signal-less unit
under a keyword rung). That is authorized by the prompt — but the golden file's bytes are one of
the three inputs to `conflictDatasetContentHash`
(`conflict-validation-profile.ts:166-193`), so regenerating it flips the conflict dataset
identity, `refuseOnIdentityDrift` exits 2 (`analysis-eval.ts:440-449`), and
`hardening-cli.test.ts:192` — which pins `--offline --profile conflict` resuming against the
committed `docs/evals/analysis/results/conflict-{roca,iran}-v1-offline-fixtures.json` with **no**
identity refusal and no rewrite — fails. Repairing that means writing under
`docs/evals/analysis/`, which this prompt and COMMON §3 forbid.

This was surfaced to the operator in plan mode and answered **option 1: rung-only in this PR**.
It was independently recorded on `main` as **decision E5** in
`docs/prompts/2026-09-05-48h-00-INDEX.md:158`: *"Authorize for step 19 only, with an exposure
note; step 06 lands the rung-level diagnostic alone (option 1 of its question) so its PR stays
inside the envelope."* This PR matches that ruling exactly: `scorer.ts` untouched,
`fixtures/conflicts/**` untouched, `docs/evals/analysis/**` untouched, `npm test` green.

**Consequence, recorded honestly:** the landing-report blocker is **half** closed. The rung can
now distinguish "cannot be scored" from "scored and missed", and the Iran vocabulary exists — but
no `ConflictResultV1`, no offline report, no product surface carries the per-unit class yet.

### C7 — module layout (open, provisional)

`src/lib/validation/gazetteer/` is built as the prompt's provisional default. The step-05 memo
may relocate it. The move is mechanical if so: the package has one inbound edge from production
(`keywords.ts`) and one from the conflict rung, and `layering.test.ts` pins the direction.

### New (no decision needed, recorded for step 19)

- The `maritime` and `domestic` action classes are beyond the prompt's named deltas. They are
  what the `maritime` and `domestic_security` lanes need to produce a shared action class at all;
  without them those two lanes cannot score under the conflict rung's action-class gate.
- `gazetteerFor` accepts no theater iso2 code, by design. Whoever wires the conflict path decides
  the theater→gazetteer policy.

## Debt and risks

1. **The blocker is half closed** (E5 above). Until step 19 lands the scorer emission, an Iran
   keyword-rung day still reports only a count, not the class.
2. **Word-mode residual false positives that a boundary cannot fix.** `tyre` (the British
   spelling of "tire"), `arak` (the spirit), `hama`, `negev`, `golan` and `oman` are one-word
   English collisions. Documented in the file header; the honest mitigation is that the conflict
   rung additionally requires a shared action class, so a lone spurious toponym cannot by itself
   manufacture a match.
3. **No fa/ar script variants.** `\b` is ASCII-`\w`-based, so a word-mode gazetteer must stay
   lowercase ASCII (test-enforced). Both populations' claim text is English (`doc_claims.text_en`,
   `claims.text`) and reference text is English, so this costs nothing today; a `word-unicode`
   mode using `\p{L}` lookarounds is the path if that changes.
4. **`iran-levant-v1` has never been measured against real Iran-update text.** Its recall is
   pinned only against 21 authored probe units. The first honest measurement is step 19's, on the
   real reference corpus; expect to append toponyms afterwards (append only — key order is
   load-bearing, and a content change once results are persisted under this version is a NEW
   version, not an edit).
5. **The Iran gazetteer is not wired anywhere.** `ConflictKeywordMatcher` defaults to `ru-ua-v1`;
   nothing selects the Iran set in any code path outside tests. That is prompt item 5, but it
   means the repair is inert until step 19.
6. **`backtest-matrix.ts:250`'s private `keywordUnmatchable(unitText)` helper** still calls the
   RU/UA-bound `extractSignature`, and `:243` early-returns `true` for `iran_regional` with the
   comment "L4: run.ts filters ru/ua only". It is a backtest diagnostic, not the rung, and was
   deliberately left alone — but it now describes a different vocabulary from the rung it models.
7. **Pre-existing, not introduced:** `expandToponyms`'s `expansions[t] ?? []` uses a bare index,
   so a persisted toponym literally named `constructor` would throw. Left byte-identical on
   purpose — the RU/UA path must not move. The new `classifyTheaterWith` does the own-property
   lookup properly.

## Proposed AGENTS.md changes

This PR makes no AGENTS.md standing line wrong, so nothing was edited (COMMON §4.7). For step 25:

**Directory map** — `src/lib/validation/` currently reads:

> `src/lib/validation/ ISW scoreboard: keyword gazetteer + majority-vote LLM matcher`

proposed:

> `src/lib/validation/ ISW scoreboard: versioned gazetteers (gazetteer/: ru-ua-v1 = the`
> `                    production keyword path via the keywords.ts shim; iran-levant-v1 =`
> `                    conflict-plane only, unwired) + majority-vote LLM matcher`

**Proposed decision-log entry (unsigned draft):**

> - **2026-09-06 (versioned gazetteers: `ru-ua-v1` unchanged, `iran-levant-v1` new;
>   `insufficient_data` at the keyword rung — branch/PR only, nothing wired)** The RU/UA keyword
>   tables moved verbatim out of `src/lib/validation/keywords.ts` into a versioned
>   `gazetteer/` package; `keywords.ts` is now a shim and **no consumer file changed**, with the
>   byte-identity proof carried by the commit graph (a signature snapshot generated from the
>   pre-split file, committed first, unchanged by the refactor commit) plus an independent
>   legacy-oracle differential. `iran-levant-v1` adds 106 canonical toponyms across Iran, the
>   Gulf, Iraq, the Levant, Israel/Palestine and Yemen with `iran_regional` contributor-theater
>   tags, and nine action classes. It matches with word boundaries rather than substrings, which
>   is load-bearing and pinned in both directions: under the historical `includes` primitive
>   `aden` fires inside "bin Laden", `arak` inside "Karak", `gaza` inside "Gazans". `ru-ua-v1`
>   keeps substring mode, which is also the only correct mode for its Cyrillic variants.
>   `ConflictMatchOutcome` gains `insufficientData` (the unit ids the keyword rung cannot score
>   at all) and `gazetteerVersion`; `keywordUnmatchable` remains exactly
>   `insufficientData.length`, so register #8 M1 and the full declared-unit denominator are
>   unchanged. Per-lane probes drive all seven `iran-lanes-v1` lanes through the rung and also
>   reproduce the pre-repair blocker under the default gazetteer. **The scorer emission into
>   `ConflictResultV1` is deliberately absent** — it would change one committed golden, whose
>   bytes feed `conflictDatasetContentHash` and would force a regeneration of the committed
>   conflict offline results under `docs/evals/analysis/`; that is decision E5, authorized for
>   step 19 only. Gates: typecheck/lint clean · unit 3,704/3,704 (254 files, from 3,612/247).
>   Zero paid calls, zero DB access, no migration, no env change, no deploy. Report:
>   `docs/reviews/GAZETTEER-IRAN-LEVANT-V1-2026-09-05.md`.

`docs/OPEN-TASKS.md` was not edited: no existing task covers the Iran keyword rung (the blocker
lives in the landing report §6 and `CONFLICT-SHADOW-SOAK.md`). If the operator wants it tracked,
the item to file is "the conflict scorer's per-unit `insufficient_data` emission + the E5 eval
artifact refresh (step 19)".

## Handoff

### The exported API step 19 imports

```ts
import {
  gazetteerFor,        // (key: string) => Gazetteer — FAIL-CLOSED, throws UnknownGazetteerError
  tryGazetteerFor,     // (key: string) => Gazetteer | null
  GAZETTEERS,          // Record<GazetteerVersion, Gazetteer>
  RU_UA_V1,
  IRAN_LEVANT_V1,
  extractSignatureWith, expandToponymsWith, classifyTheaterWith,
  matchScore, MATCH_THRESHOLD,
  type Gazetteer, type GazetteerVersion, type Signature,
} from "@/lib/validation/gazetteer";
```

Version strings: **`"ru-ua-v1"`** and **`"iran-levant-v1"`**.
Accepted `gazetteerFor` keys: `roca`, `russia_ukraine`, `ru-ua-v1`, `iran_update`,
`iran_regional`, `iran-levant-v1`. **Not** theater iso2 codes.

Wiring the conflict path is one line at the construction site:
`new ConflictKeywordMatcher(gazetteerFor(request.conflictId))`. The rung already reports
`gazetteerVersion`, so the result can stamp what actually scored.

### Goldens touched: **none**

`fixtures/conflicts/**` is byte-identical, verified by `git diff --stat` and by
`goldens.test.ts` passing with `UPDATE_CONFLICT_GOLDENS` **unset**. That variable was never set in
this session. The one new fixture, `fixtures/gazetteer/iran-lane-probes-v1.json`, lives outside
`fixtures/conflicts/` precisely so it cannot enter a conflict dataset's identity.

### What step 19 must do, and in what order

1. Wire the gazetteer by conflict id (one line, above), and stamp `gazetteerVersion` into the
   result's `versions` block so a keyword-rung day is interpretable.
2. Thread `insufficientData` through the scorer into `ConflictResultV1` — the natural home is a
   new optional per-unit key beside `missDiagnostic`, **denominator-unchanged**, plus the
   `keywordUnmatchableOf`-style cross-population agreement check (`scorer.ts:825-837` is the
   pattern; the two populations must report the same set, since it is a unit-only property).
3. **Then, and only then, the E5 sequence, in this order** — doing it out of order leaves the
   tree red:
   a. `UPDATE_CONFLICT_GOLDENS=1 npx vitest run src/lib/conflicts/goldens.test.ts`, then review
      the diff. Expect **exactly one** golden entry to change:
      `cc-matcher-failclosed-013b#B-zero-valid-rounds` (its `u1` is the corpus's only signal-less
      unit under a keyword rung). Any second changed entry means something else moved — stop.
   b. Regenerate the two committed conflict offline results and the scorecard under the E5
      authorization: `--offline --profile conflict --fresh --fresh-ack <configKey>` then
      `--profile conflict --report`. Deterministic, $0, zero provider contact — but it is a write
      under `docs/evals/analysis/`, so it needs the E5 exposure note in the step's report.
   c. Re-run `npx vitest run src/lib/evals/hardening-cli.test.ts` — it is the pin that catches
      the whole chain.
4. Measure `iran-levant-v1` against the real Iran reference corpus and append what is missing
   (append only; a content change once results persist under this version is a new version).

### Prompt rewrites recommended

- **Step 19's prompt** should carry the ordered E5 sequence above verbatim, and name
  `src/lib/evals/hardening-cli.test.ts:192` as the pin that fails if the eval artifacts are not
  refreshed. Without that, a session will regenerate the golden, see one unrelated test fail, and
  be tempted to revert a correct change.
- **Step 06's prompt** item 3 ("thread it through the conflict scorer's per-unit diagnostics")
  is superseded by E5 and should be amended to "add it to the rung's outcome; step 19 threads it
  through the scorer", so a future re-run of this step does not re-discover the conflict.
