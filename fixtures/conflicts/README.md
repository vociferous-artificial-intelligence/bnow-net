# Conflict-evaluation acceptance fixtures (Phase 0)

The legally-safe acceptance fixture corpus for the conflict-evaluations
workstream, mandated by `docs/designs/CONFLICT-REGION-EVALUATION.md` (the
frozen contract) section 5 "test-mandated inclusions/exclusions" and by
`docs/reviews/CONFLICT-EVALUATION-P0-REPORT-2026-08-17.md` section 5. This
directory is DATA ONLY in Phase 0: no code consumes it yet; Phases 1-4 build
the consumers and MUST NOT edit committed scenario semantics (immutability
rule below).

Provenance: `authored-2026-08-17` — every scenario hand-authored and
hand-checked one at a time; zero model-generated-unreviewed content. Content
rules follow the house precedent in `docs/evals/analysis/README.md` (fictional
persons, no ISW prose, no source full text) and AGENTS.md rulings 1, 12, 19,
20.

## Files and counts

| file | conflict | scenarios | units | claims |
|---|---|---|---|---|
| `roca-scenarios-v1.json` | `russia_ukraine` | 10 | 10 | 11 |
| `iran-scenarios-v1.json` | `iran_regional` | 12 | 13 | 14 |
| `crosscutting-scenarios-v1.json` | mixed (per-scenario) | 16 | 16 | 20 |
| **total** | | **38** | **39** | **45** |

48 documents; 33 expected-included / 11 expected-excluded eligibility
records (one claim, in the publication-gap scenario, has no eligibility
record by design). Every exclusion uses the contract's bounded reason enum.

## Immutability

A scenario's inputs and `expected` block are FROZEN once committed (same rule
as `docs/evals/analysis/README.md`): to change either, mint a NEW scenario id
or bump the file version (`-v2`). `notes` wording may be corrected in place.
`fixtureVersion` guards the schema shape, not the content.

## Scenario schema

Top level per file:

- `fixtureVersion` (int) — schema shape version, `1`.
- `conflictId` — `"russia_ukraine"`, `"iran_regional"`, or `"mixed"`
  (crosscutting file only; the per-scenario `conflictId` is authoritative
  everywhere).
- `scenarios` (array).

Per scenario:

- `id` — kebab-case, stable, prefixed by file (`roca-`, `iran-`, `cc-`).
- `title` — short human title.
- `acceptanceRef` — the acceptance-corpus bullet this scenario covers
  (verbatim-ish; inventory table below).
- `conflictId` — `russia_ukraine` | `iran_regional`.
- `report` — the reference report/edition (or `null`, or replaced by
  `reports`; see extensions):
  - `series` — `roca` | `iran_update` (contract section 0).
  - `editionKey` — `<series>:<date>:<edition>` identity (section 9).
  - `reportDate` — `YYYY-MM-DD`.
  - `cutoffAt` — declared data-cutoff instant, ISO-8601 with explicit
    timezone; `null` = missing; a deliberately malformed string ONLY in the
    timestamp scenarios (`cc-timestamps-003`), marked in `notes`. Never
    guessed (section 9).
  - `publishedAt` — publication instant, same rules; `null` in
    `cc-timestamps-003`.
  - `units[]` — the declared reference units (the frozen denominator,
    section 3):
    - `unitId` — stable within the scenario (`u0`, `u1`; `m0` for the
      non-final morning edition in `cc-editions-001`).
    - `text` — AUTHORED SYNTHETIC takeaway-style sentence (content rules
      below), <= 320 chars.
    - `lane` — a lane id from the contract section 4 taxonomy for the
      scenario's conflict, exactly:
      `roca-lanes-v1`: `frontline_maneuver`, `strikes_air_defense`,
      `force_generation`, `occupied_crossborder`, `foreign_support`,
      `russia_partners`, `strategic_political`, `other_in_scope`;
      `iran-lanes-v1`: `direct_kinetic`, `proxy_partner`, `maritime`,
      `nuclear_diplomacy`, `domestic_security`, `regional_effects`,
      `other_in_scope`.
    - `compound` — `true` = multiple propositions in one bullet (section 3
      partial policy).
    - `negative` — `true` = quiet/no-advance style unit (section 6.3).
- `evidence[]` — BNOW-shaped claim records (the candidate union input):
  - `claimId` (int, globally unique across the three files),
    `theater` (`ru`/`ua`/`ir`/`il`/gulf codes), `track`
    (`military`/`nuclear`/`elite_politics`).
  - `text` — atomic BNOW-claim-shaped English text, <= 250 chars, hedged
    wording consistent with `hedging`.
  - `hedging` — `confirmed` | `claimed` | `unverified` | `assessed` |
    `unknown`.
  - `claimDate` — `YYYY-MM-DD` event/claim date.
  - `docs[]` — source documents:
    - `docId` (int, globally unique), `adapter` (`rss`/`gdelt`/
      `telegram-web`/`telegram-mtproto`/`x-api`), `platform` (`telegram`/
      `x`/`null`), `sourceDomain` (ALWAYS a `*.example` domain — never a
      real URL/handle).
    - `publishedAt` — source-declared publish instant (may be null/
      malformed/offset-form only in the timestamp scenarios, marked in
      notes); `fetchedAt` — BNOW ingest instant (>= publishedAt except
      where a scenario tests otherwise); `mirrorOfDocId` — non-null marks
      this doc a mirror/repost of another doc (mirror docs are never
      independent corroboration).
    - `sourceLanguage` (OPTIONAL) — original source language when the
      claim derives from translation (`iran-translation-hedge-012` only).
  - `engine` — `mapreduce` | `legacy`. Legacy rows model il/gulf
    legacy-engine digest claims: they may enter ONLY the
    published-retention population, labeled `legacy` (contract section 5
    comparability honesty). Convention: legacy rows carry
    `currentExtractorVersion: false` and the field is not consulted for
    them — their comparability class comes from `engine`, and their
    corpus-recall exclusion reason is `legacy_incomparable`, never
    `superseded_version`.
  - `currentExtractorVersion` — `false` on a mapreduce row = a
    superseded-extractor-version claim (excluded `superseded_version`;
    ruling 13/18 double-count prevention).
  - `published` — the claim genuinely appeared in a designated user-facing
    digest (the published-retention population of section 6.1).
  - `stub` — `true` ONLY in the stub-leakage scenario; must always be
    excluded `stub_fixture` (ruling 3).
- `expected` — the internally consistent expected outcome:
  - `eligibility` — map of claimId (string) to either
    `{ "included": true, "lane": <lane id>, "reasons": [<free-form
    diagnostic strings>] }` or `{ "included": false, "reason": <bounded
    enum> }`. The bounded exclusion enum is exactly the contract section 5
    list: `off_window`, `off_scope`, `superseded_version`, `stub_fixture`,
    `missing_source`, `legacy_incomparable`, `mirror_only`, `unclassified`.
    Inclusion `reasons` are free-form diagnostics (`lane:`, `actor:`,
    `geo:`, `track:`, `window:` prefixes); ONLY exclusion reasons are
    enum-bounded. SCOPE NOTE: `eligibility` describes membership in the
    CORPUS-RECALL candidate union; published-retention population
    membership is carried by `published` + `engine` and asserted through
    `publishedRetention` (see `iran-gulf-unavailable-010`).
  - `corpusRecall` / `publishedRetention` — map of unitId to `matched` |
    `miss` | `partial` | `unavailable`, one per pipeline question
    (section 6.1). `partial` counts as a MISS in the headline numerator
    (section 3); `unavailable` is a provenance state distinct from any
    zero (section 6.4).
  - `contribution` — ONLY for units whose `corpusRecall` is `matched`:
    `{ <unitId>: { "theaters": [...], "tracks": [...] } }` (multi-label,
    non-additive, section 7). Empty object when nothing matched. See
    ambiguity 2 below for the population choice.
  - `independentSourceNote` (OPTIONAL string) — expected corroboration
    semantics (mirrors never independent).
  - `notes` — what the scenario proves and which contract rule it would
    catch if violated. Notes are commentary, not assertions.

### Documented shape extensions (used only where listed)

- `reports[]` + `editionPolicy` (`cc-editions-001`) — replaces `report`
  for the multi-edition scenario; each report object adds
  `designatedFinal` (bool), and `expected.selectedEditionKey` names the
  edition whose units form the denominator (`editionPolicy:
  "designated_final"`; section 9 — no arbitrary `rows[0]`).
- `report: null` + `gapDate` (`cc-publication-gap-002`) — a true
  publication gap; `expected.evaluation: "unavailable"` and every per-unit
  map empty (nothing is fabricated).
- `digestRegeneratedAt` (`cc-regen-after-instant-007`) — instant the
  latest digest was regenerated, after every historical evaluation instant.
- `matcherFixture` (`cc-matcher-failclosed-013`) — `{ votes: [raw vote
  strings incl. empty/truncated/null/wrong-schema], expected: {
  validVotes, majorityReached, behavior } }`; documents that scoring must
  fail closed to the honestly-labeled keyword fallback (section 6.3).
- `expected.evaluationKinds` — per-kind availability
  (`operational_cutoff`/`at_publication`/`finalized` `unavailable`,
  `retrospective` `"allowed"`; section 6.2).
- `expected.availability` — per-claim `{ atCutoff, atPublication }`
  booleans for the timing scenarios (BNOW ingest time governs; at-publish
  proxy semantics inherited, section 6.4).
- `expected.timeAnchors` — expected treatment of missing/malformed
  report timestamps (`missing` | `malformed_treated_as_missing`).
- `expected.laneAvailability` — lane-level `unavailable` for
  incomparable-coverage lanes (`iran-gulf-unavailable-010`).
- `expected.eligibleCount` — pins the eligible-set size for the
  three-way `unavailable` vs empty-set-zero vs nonempty-set-zero
  distinction (`cc-state-*-014/015/016`).
- `expected.independentSources` — `{ unitId: count }` independent-source
  count (mirrors excluded).
- `expected.hedgePreservation` — `{ claimId: hedge }` pins that matching/
  translation never strengthened the hedge
  (`iran-translation-hedge-012`).

## Content rules (binding; per the Phase 0 mandate and house precedent)

- Unit texts are authored synthetic takeaway-STYLE sentences written from
  the contract's lane definitions — NEVER a reproduction or close
  paraphrase of any actual ISW/CTP published sentence (ruling 1: no ISW
  prose anywhere).
- Real place/geography names are allowed (Kupiansk, Crimea, Hormuz,
  Al Hudaydah, ...); real ORGANIZATION classes appear only generically
  (IAEA, NATO, EU, IRGC, Hezbollah, Houthi movement, "Russian forces",
  E3, "the general staff").
- Every named PERSON is FICTIONAL. This corpus names exactly one person:
  "Kazem Ravandust" (`iran-elite-succession-008`) — invented; no real
  official is named anywhere. One village name is also invented ("Stara
  Verbivka", `cc-superseded-version-008`), as is the corridor codename
  used as the audit sentinel.
- Every specific operation, quantity, and date-detail is invented; the
  scenarios describe the real conflicts' SHAPE, not real events.
- No source full text; no URLs to real articles (all `sourceDomain`
  values are `*.example`); no real social-media handles.
- Timestamps are ISO-8601 with explicit timezone EXCEPT the deliberate
  missing/malformed values in `cc-timestamps-003` (marked in its notes);
  `cc-dst-offset-004` deliberately mixes `-04:00` and `Z` forms of the
  same instant.
- Hedged claim wording always matches the `hedging` field; disputed or
  single-source assertions keep governing attribution (rulings 19/20
  spirit).

## Reference-prose audit rule (acceptance bullet C15)

Later phases must be able to prove that no persisted artifact (results
files, DB rows, reports, rendered surfaces) recovers reference-unit prose.
Standing audit rule for every later phase: **every persisted artifact must
be greppable clean of the unit texts' distinctive tokens.** To make that
check mechanical, exactly ONE unit text in this corpus carries a
distinctive sentinel token — the invented corridor codename **VELMORAN**
in `cc-regen-after-instant-007` `u0` (its only occurrence in the scenario
JSON; this README is the only other file that may contain it).
Later-phase tests MUST grep their persisted outputs for `VELMORAN` and
fail on any hit: unit-derived signatures/hashes may persist, prose may
not (contract sections 9 and 11).

## Scenario inventory (every acceptance bullet -> scenario ids)

ROCA (`roca-scenarios-v1.json`):

| # | acceptance bullet | scenario id(s) |
|---|---|---|
| R1 | development supported only by a UA-tagged claim | `roca-ua-only-001` |
| R2 | supported only by a RU-tagged source about an event inside Ukraine | `roca-ru-source-002` |
| R3 | occupied Crimea (or another `both` geography) | `roca-crimea-003` |
| R4 | North Korean military support | `roca-dprk-004` |
| R5 | EU/NATO/member-state decision directly shaping the war | `roca-coalition-005` |
| R6 | unrelated European domestic news that must be excluded | `roca-eu-domestic-006` |
| R7 | same town and action class on different dates (must NOT match; ruling-12 spirit) | `roca-recurring-template-007` |
| R8 | mapped-corpus match omitted from published output (corpusRecall matched, publishedRetention miss) | `roca-retention-gap-008` |
| R9 | compound reference unit with partial evidence (`partial`, counted as miss in headline) | `roca-compound-partial-009` |
| R10 | quiet/no-advance unit opposed by a positive advance claim (must NOT match) | `roca-quiet-day-010` |

Iran (`iran-scenarios-v1.json`):

| # | acceptance bullet | scenario id(s) |
|---|---|---|
| I1 | direct Iran-Israel-US strikes | `iran-direct-kinetic-001` |
| I2 | Hezbollah/Lebanon | `iran-hezbollah-002` |
| I3 | Iraqi militia activity | `iran-iraq-militia-003` |
| I4 | Houthi/Yemen maritime | `iran-houthi-maritime-004` |
| I5 | Hormuz or Gulf-base activity involving Oman/Bahrain/Qatar/UAE/Kuwait/Saudi Arabia | `iran-hormuz-gulf-005` |
| I6 | IAEA/nuclear evidence from the NUCLEAR track | `iran-iaea-nuclear-006` |
| I7 | E3/EU or mediator diplomacy | `iran-e3-diplomacy-007` |
| I8 | Iranian domestic security or succession from the ELITE track | `iran-elite-succession-008` |
| I9 | unrelated Israeli/Gulf domestic or commercial news that must be excluded | `iran-domestic-exclusion-009` |
| I10 | Iran Update lane with no comparable mapped Gulf evidence — lane `unavailable`, never manufactured | `iran-gulf-unavailable-010` |
| I11 | same proxy/actor in two DISTINCT events (must not cross-match) | `iran-two-events-011` |
| I12 | source-language translation must not strengthen hedge or attribution | `iran-translation-hedge-012` |

Cross-cutting (`crosscutting-scenarios-v1.json`):

| # | acceptance bullet | scenario id(s) |
|---|---|---|
| C1 | multiple same-date report editions + deterministic final selection | `cc-editions-001` |
| C2 | a true publication gap | `cc-publication-gap-002` |
| C3 | missing and malformed cutoff/publication timestamps | `cc-timestamps-003` |
| C4 | DST boundary and explicit-offset timestamps (same instant, identical treatment) | `cc-dst-offset-004` |
| C5 | evidence fetched after cutoff but before publication | `cc-fetch-after-cutoff-005` |
| C6 | source published before cutoff but ingested after publication | `cc-ingest-after-publication-006` |
| C7 | latest digest regenerated after the historical evaluation instant | `cc-regen-after-instant-007` |
| C8 | current and superseded extractor versions together | `cc-superseded-version-008` |
| C9 | mirrors/reposts across adapters (mirror_only; corroboration NOT independent) | `cc-mirror-adapters-009` |
| C10 | one authoritative source vs many dependent copies (independence = 1) | `cc-independence-010` |
| C11 | stub/fixture leakage attempt (`stub_fixture`) | `cc-stub-leakage-011` |
| C12 | source text containing prompt instructions / fake schema fragments | `cc-injection-012` |
| C13 | malformed/truncated/empty matcher output and partial vote rounds | `cc-matcher-failclosed-013` |
| C14 | unavailable snapshot vs empty evidence vs genuinely zero matches (THREE distinct states) | `cc-state-unavailable-014`, `cc-state-zero-empty-015`, `cc-state-zero-nonempty-016` |
| C15 | attempts to recover reference prose | README audit rule above + sentinel in `cc-regen-after-instant-007` (not a scenario) |

## Contract ambiguities flagged (NOT resolved here; each needs a P1/Gate-0 adjudication)

1. **Eligibility window width.** Contract section 5 predicate 2 says
   "within the evaluation window for the report" without freezing the
   width. These fixtures ASSUME `[reportDate - 2 days, cutoffAt]` and
   pin each scenario's expectation explicitly (`roca-recurring-template-007`
   marks its August 8 claim `window:in-edge`; `cc-state-zero-empty-015`
   excludes a late-July claim `off_window`). P1 must freeze the window
   and, if it differs, mint new scenario ids for the affected cases.
2. **Contribution population.** Section 7 counts "distinct matched units"
   without saying whether corpus-recall or published-retention matches
   feed the contribution table. These fixtures follow the mandated
   fixture shape: contribution attaches to CORPUS-RECALL matched units
   (so `roca-retention-gap-008` carries contribution despite its
   publishedRetention miss). Needs an explicit ruling before Phase 4
   renders any contribution table.
3. **Lane tie-break.** When the actor roster and event geography point to
   different lanes (a Houthi attack on Red Sea shipping: `proxy_partner`
   actor vs `maritime` geography), section 4 gives no precedence.
   `iran-houthi-maritime-004` pins event-geography precedence
   (`maritime`); the P1 deterministic classifier must freeze the rule.
4. **Exclusion-reason precedence.** Section 5 bounds each excluded
   candidate to ONE reason but sets no order when several apply
   (`iran-domestic-exclusion-009` claim 9110 is both off-scope and
   legacy-incomparable). Fixtures pin content-scope checks first
   (`off_scope` wins over comparability/integrity classes); integrity
   reasons (`stub_fixture`, `superseded_version`, `mirror_only`,
   `legacy_incomparable`) apply to content that IS in scope. P1 must
   freeze a total order.
5. **Cutoff boundary equality.** Section 6.2 says "at/before", which the
   fixtures read as inclusive (`cc-dst-offset-004`: a doc ingested at
   exactly the cutoff instant counts as available at cutoff). Minor, but
   P1 should state it.

## Validated

Ad hoc shell validation (no committed code, per the Phase 0 mandate), run
2026-08-17 from this directory. The python3 heredoc asserts: each file
parses; every unit and included-eligibility lane id is in the contract
section 4 taxonomy for the scenario's conflict; every exclusion reason is
in the bounded enum; every verdict is in {matched, miss, partial,
unavailable}; contribution entries exist only for corpus-recall-matched
units; scenario/claim/doc ids are globally unique; unit texts <= 320 and
claim texts <= 250 chars; hedging and engine values are valid; legacy rows
carry `currentExtractorVersion: false`; the VELMORAN sentinel appears
exactly once across the three JSON files.

```
$ python3 - <<'EOF'   # (assertion script as described above)
roca-scenarios-v1.json: parses OK, 10 scenarios
iran-scenarios-v1.json: parses OK, 12 scenarios
crosscutting-scenarios-v1.json: parses OK, 16 scenarios
totals: scenarios=38 units=39 claims=45 docs=48 included=33 excluded=11
max unit text len=199 (cap 320); max claim text len=153 (cap 250); VELMORAN occurrences in JSON=1 (must be 1)
ALL CHECKS PASS: lanes valid per conflict, exclusion reasons bounded, verdicts valid, contribution only for corpus-matched units, ids unique, text caps respected
EOF
```
