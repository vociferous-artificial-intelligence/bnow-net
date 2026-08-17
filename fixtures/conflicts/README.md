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
20. The Gate-0 remediation remints (register #7/#8) are incorporated; see
"Resolved at Gate 0" below.

## Files and counts

| file | conflict | scenarios | units | claims |
|---|---|---|---|---|
| `roca-scenarios-v1.json` | `russia_ukraine` | 10 | 10 | 11 |
| `iran-scenarios-v1.json` | `iran_regional` | 12 | 13 | 13 |
| `crosscutting-scenarios-v1.json` | mixed (per-scenario) | 18 | 19 | 26 |
| **total** | | **40** | **42** | **50** |

52 documents; 35 expected-included / 14 expected-excluded eligibility
records (one claim, in the publication-gap scenario, has no eligibility
record by design). Every exclusion uses the contract's bounded reason enum
in its FROZEN precedence order. Exactly FIVE scenarios carry
`expected.headline` pins (register #8 M4): `roca-ua-only-001b`,
`roca-retention-gap-008b`, `roca-compound-partial-009b`,
`iran-gulf-unavailable-010b`, `cc-matcher-failclosed-013b` — all other
scenarios deliberately carry none, because full-report golden arithmetic is
Phase 4's deliverable.

Counts machine-recounted (2026-08-17) with:

```
$ python3 -c "
import json
for f in ['roca-scenarios-v1.json','iran-scenarios-v1.json','crosscutting-scenarios-v1.json']:
    d = json.load(open(f))
    units = sum(len(r['units']) for s in d['scenarios'] for r in (s.get('reports') or ([s['report']] if s.get('report') else [])))
    claims = sum(len(s['evidence']) for s in d['scenarios'])
    docs = sum(len(c['docs']) for s in d['scenarios'] for c in s['evidence'])
    print(f, 'scenarios=%d units=%d claims=%d docs=%d' % (len(d['scenarios']), units, claims, docs))
"
roca-scenarios-v1.json scenarios=10 units=10 claims=11 docs=11
iran-scenarios-v1.json scenarios=12 units=13 claims=13 docs=13
crosscutting-scenarios-v1.json scenarios=18 units=19 claims=26 docs=28
```

(The crosscutting row reflects `cc-other-in-scope-018`, added ADDITIVELY at
the Phase 3 Gate-3 remediation; the recount above was re-run 2026-08-17
after the addition.)

## Immutability and the Gate-0 remints

A scenario's inputs and `expected` block are FROZEN once committed (same rule
as `docs/evals/analysis/README.md`): to change either, mint a NEW scenario id
or bump the file version (`-v2`). `notes` wording may be corrected in place.
`fixtureVersion` guards the schema shape, not the content.

Remints to date (each replaces its original wholesale; claim/doc ids are
retained because the original scenario ceases to exist):

| original | reminted as | why (register entry) |
|---|---|---|
| `roca-quiet-day-010` | `roca-quiet-day-010b` | NOTE-1 unit rewording (#7) |
| `roca-ua-only-001` | `roca-ua-only-001b` | M4 headline pin (#8) |
| `roca-retention-gap-008` | `roca-retention-gap-008b` | M4 headline pin (#8) |
| `roca-compound-partial-009` | `roca-compound-partial-009b` | M4 headline + partialDiagnostic (#8) |
| `iran-gulf-unavailable-010` | `iran-gulf-unavailable-010b` | H1 unavailable semantics (#8) |
| `cc-stub-leakage-011` | `cc-stub-leakage-011b` | M3 precedence + missing_source pins (#8) |
| `cc-matcher-failclosed-013` | `cc-matcher-failclosed-013b` | H2 matcher ladder + M1 denominator (#8) |

`cc-window-rung2-017` is NEW (M2, #8), not a remint. `cc-other-in-scope-018`
is NEW (Phase 3 Gate-3 evidence-review NOTE: the rung-6 other_in_scope gate
had no corpus pin), not a remint.

## Scenario schema

Top level per file:

- `synthetic` (bool, always `true`), `provenance`
  (`"authored-2026-08-17"`), `disclaimer` (string) — the legal-safety
  markers added by the Gate-0 product/legal remediation (register #7):
  every unit and claim is an invented hand-authored scenario; series ids
  and dates identify fixture SHAPE only.
- `fixtureVersion` (int) — schema shape version, `1`.
- `conflictId` — `"russia_ukraine"`, `"iran_regional"`, or `"mixed"`
  (crosscutting file only; the per-scenario `conflictId` is authoritative
  everywhere).
- `scenarios` (array).

Per scenario:

- `id` — kebab-case, stable, prefixed by file (`roca-`, `iran-`, `cc-`);
  a trailing letter (`-b`, ...) marks a remint superseding the unlettered
  original.
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
    timezone; `null` = missing; a deliberately malformed string ONLY in
    `cc-timestamps-003` and `cc-window-rung2-017`, marked in `notes`.
    Never guessed (section 9); a malformed value is recorded raw and
    treated as missing, sending the window END to the next rung of the
    frozen section 5 ladder.
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
  - `claimDate` — `YYYY-MM-DD` event/claim date (day-granular window
    membership per the frozen section 5 window; per-document instants
    drive the cutoff/publication diagnostics).
  - `docs[]` — source documents (`[]` ONLY in the `missing_source` pin,
    `cc-stub-leakage-011b` claim 9323 — a deliberately defective record
    the evaluator must refuse):
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
    excluded `stub_fixture` (ruling 3), regardless of whether the content
    is on-topic or off-scope (integrity precedes scope in the frozen
    precedence order).
- `expected` — the internally consistent expected outcome:
  - `eligibility` — map of claimId (string) to either
    `{ "included": true, "lane": <lane id>, "reasons": [<free-form
    diagnostic strings>] }` or `{ "included": false, "reason": <bounded
    enum> }`. The bounded exclusion enum, in its FROZEN precedence order
    (first match wins; contract section 5, register #6): `stub_fixture` →
    `missing_source` → `superseded_version` → `mirror_only` →
    `off_window` → `off_scope` → `legacy_incomparable` → `unclassified`
    (integrity before scope before comparability). Inclusion `reasons`
    are free-form diagnostics (`lane:`, `actor:`, `geo:`, `track:`,
    `window:` prefixes); ONLY exclusion reasons are enum-bounded. SCOPE
    NOTE: `eligibility` describes membership in the CORPUS-RECALL
    candidate union; published-retention population membership is carried
    by `published` + `engine` and asserted through `publishedRetention`
    (see `iran-gulf-unavailable-010b`).
  - `corpusRecall` / `publishedRetention` — map of unitId to `matched` |
    `miss` | `partial`, one per pipeline question (section 6.1).
    `partial` counts as a MISS in the headline numerator (section 3).
    There is NO per-unit `unavailable` verdict (section 3 as amended,
    register #8 H1): an incomparable-coverage unit is an HONEST miss
    carrying `missDiagnostic`, and `unavailable` exists only as the
    report-level `expected.evaluation` / `expected.evaluationKinds`
    states (section 6.2), always distinct from zero.
  - `missDiagnostic` (OPTIONAL) — `{ <unitId>: "incomparable_coverage" }`
    on units whose miss stems from an incomparable evidence class
    (`incomparable_coverage` is the only valid value for now;
    `iran-gulf-unavailable-010b`).
  - `laneDiagnostics` (OPTIONAL) — `{ <lane id>:
    "unavailable_incomparable" }`: the lane diagnostic table renders that
    lane as "unavailable (incomparable evidence)" instead of a bare 0%
    that would imply comparable-but-missed (section 5 comparability
    honesty as amended; only valid value for now is
    `unavailable_incomparable`). Replaces the pre-Gate-0
    `laneAvailability` field.
  - `headline` (ONLY in the five register-#8 M4 scenarios listed under
    "Files and counts") — `{ "corpusRecall": { "matched", "denominator"
    }, "publishedRetention": { "matched", "denominator" }, and optionally
    "partialDiagnostic": <count of partial verdicts> }`. `matched` counts
    `matched` verdicts only (partial = miss); `denominator` = the
    declared unit count. `partialDiagnostic` (only in
    `roca-compound-partial-009b`) surfaces compound under-credit beside
    the headline, never inside it. No other scenario carries a headline
    block: full-report golden arithmetic is P4's deliverable.
  - `windowEndSource` (OPTIONAL; pinned only in `cc-window-rung2-017`) —
    `cutoff` | `published` | `report_day`: which rung of the frozen
    section 5 END ladder bounded the evaluation window (section 6.4,
    register #8 M2 — recorded on every real evaluation so a cutoff-parser
    regression that silently widens windows is visible).
  - `contribution` — ONLY for units whose `corpusRecall` is `matched`:
    `{ <unitId>: { "theaters": [...], "tracks": [...] } }` (multi-label,
    non-additive). Computed over the CORPUS-RECALL matched units per the
    FROZEN section 7 population rule (register #6). Empty object when
    nothing matched.
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
- `matcherFixture` (`cc-matcher-failclosed-013b`) — pins the INHERITED
  degradation ladder (section 6.3 as amended; register #8 H2):
  `{ "inheritedLadder": <the ladder statement>, "variants": [ {
  "variantId", "votes": [5 raw vote strings], "expected": { "validVotes",
  "majorityReached", "rung": "llm-majority"|"llm"|"keyword",
  "matcherLabel", "voteRounds" (llm rung), "keywordUnmatchable" (keyword
  rung), "behavior" } } ] }`. Variant A pins 1-valid-of-5 → single-round
  scoring labeled `llm` (honestly non-majority, NOT keyword); variant B
  pins 0-valid-of-5 → keyword fallback labeled `keyword`. Malformed votes
  are discarded, never repaired; no label may masquerade as a majority.
  `keywordUnmatchable` (register #8 M1) counts signal-less declared units
  that the keyword rung keeps in the FULL denominator as automatic misses
  — the conflict evaluator's disclosed divergence from production
  `scoreDigest`'s matchable-subset denominator.
- `expected.evaluationKinds` — per-kind availability
  (`operational_cutoff`/`at_publication`/`finalized` `unavailable`,
  `retrospective` `"allowed"`; section 6.2).
- `expected.availability` — per-claim `{ atCutoff, atPublication }`
  booleans for the timing scenarios (BNOW ingest time governs; at-publish
  proxy semantics inherited, section 6.4).
- `expected.timeAnchors` — expected treatment of missing/malformed
  report timestamps (`missing` | `malformed_treated_as_missing`;
  `cc-timestamps-003`, `cc-window-rung2-017`).
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
  missing/malformed values in `cc-timestamps-003` and the malformed
  `cutoffAt` in `cc-window-rung2-017` (marked in their notes);
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
Later-phase tests MUST first assert the sentinel token was PRESENT in the run's inputs (else the audit is vacuous and must fail as not-run), and then grep their persisted outputs for `VELMORAN` and
fail on any hit: unit-derived signatures/hashes may persist, prose may
not (contract sections 9 and 11).

## Scenario inventory (every acceptance bullet -> scenario ids)

ROCA (`roca-scenarios-v1.json`):

| # | acceptance bullet | scenario id(s) |
|---|---|---|
| R1 | development supported only by a UA-tagged claim | `roca-ua-only-001b` |
| R2 | supported only by a RU-tagged source about an event inside Ukraine | `roca-ru-source-002` |
| R3 | occupied Crimea (or another `both` geography) | `roca-crimea-003` |
| R4 | North Korean military support | `roca-dprk-004` |
| R5 | EU/NATO/member-state decision directly shaping the war | `roca-coalition-005` |
| R6 | unrelated European domestic news that must be excluded | `roca-eu-domestic-006` |
| R7 | same town and action class on different dates (must NOT match; ruling-12 spirit) | `roca-recurring-template-007` |
| R8 | mapped-corpus match omitted from published output (corpusRecall matched, publishedRetention miss) | `roca-retention-gap-008b` |
| R9 | compound reference unit with partial evidence (`partial`, counted as miss in headline) | `roca-compound-partial-009b` |
| R10 | quiet/no-advance unit opposed by a positive advance claim (must NOT match) | `roca-quiet-day-010b` |

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
| I10 | Iran Update lane with no comparable mapped Gulf evidence — headline honest miss with `missDiagnostic`, lane diagnostic `unavailable (incomparable)`, never manufactured | `iran-gulf-unavailable-010b` |
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
| C11 | stub/fixture leakage attempt (`stub_fixture`) + frozen-precedence pins (stub∧off-scope → `stub_fixture`; no-source-link → `missing_source`) | `cc-stub-leakage-011b` |
| C12 | source text containing prompt instructions / fake schema fragments | `cc-injection-012` |
| C13 | malformed/truncated/empty matcher output and partial vote rounds (inherited ladder: `llm` rung at 1-2 usable, `keyword` at 0; `keywordUnmatchable` denominator pin) | `cc-matcher-failclosed-013b` |
| C14 | unavailable snapshot vs empty evidence vs genuinely zero matches (THREE distinct states) | `cc-state-unavailable-014`, `cc-state-zero-empty-015`, `cc-state-zero-nonempty-016` |
| C15 | attempts to recover reference prose | README audit rule above + sentinel in `cc-regen-after-instant-007` (not a scenario) |
| C16 | window END rung 2: malformed cutoff falls to `publishedAt`, recorded `windowEndSource` (window family of C3/C4; Gate-0 science M2) | `cc-window-rung2-017` |

## Resolved at Gate 0 (formerly "Contract ambiguities flagged")

The five ambiguities Phase 0 fixture authoring surfaced are now FROZEN in
the contract (section 5 window/precedence rules, section 7 contribution
population; decision register #6) and the two Gate-0 reviews added further
frozen semantics (register #7 product/legal, #8 scope/evaluation-science).
The fixtures pin each resolution:

1. **Evaluation window (frozen, §5 / #6):** `[reportDate − 2 days, END]`
   with END = `cutoffAt` when parseable → `publishedAt` when known → the
   exclusive end of the report date's UTC day; END inclusive where
   instants apply; claims day-granular. Pinned by
   `roca-recurring-template-007` (start-edge `window:in-edge` + off_window),
   `cc-state-zero-empty-015` (off_window), and `cc-window-rung2-017`
   (rung-2 END with `windowEndSource: "published"`).
2. **Contribution population (frozen, §7 / #6):** computed over
   CORPUS-RECALL matched units; a published-retention contribution table,
   when displayed, derives separately and is never mixed in. Pinned by
   `roca-retention-gap-008b` (contribution present despite retention miss).
3. **Lane tie-break (frozen, §5 / #6):** event geography wins over the
   actor roster; the actor still contributes to actor-level attribution.
   Pinned by `iran-houthi-maritime-004` (`maritime`, not `proxy_partner`).
4. **Exclusion-reason precedence (frozen, §5 / #6 — integrity → scope →
   comparability, first match wins):** `stub_fixture` → `missing_source`
   → `superseded_version` → `mirror_only` → `off_window` → `off_scope` →
   `legacy_incomparable` → `unclassified`. (The pre-Gate-0 revision of
   this README stated the opposite — scope over integrity — and was
   WRONG; the frozen order is authoritative.) Pinned by
   `cc-stub-leakage-011b` (stub∧off-scope → `stub_fixture`; docs-less →
   `missing_source`) and `iran-domestic-exclusion-009` (off_scope before
   legacy_incomparable).
5. **Cutoff boundary equality (frozen, §5 / #6):** "at or before" —
   equality inclusive. Pinned by `cc-dst-offset-004`.

Gate-0 additions pinned here: NO per-unit `unavailable` in headline
arithmetic (§3 / #8 H1 — `iran-gulf-unavailable-010b`); the inherited
matcher degradation ladder (§6.3 / #8 H2 — `cc-matcher-failclosed-013b`);
the keyword-fallback full-denominator rule with `keywordUnmatchable`
(§6.3 / #8 M1 — same scenario); `windowEndSource` recording (§6.4 / #8 M2
— `cc-window-rung2-017`); headline pins on exactly five scenarios (#8 M4).

## Validated

Ad hoc shell validation (no committed code, per the Phase 0 mandate),
re-run 2026-08-17 after the Gate-0 remints. The python3 heredoc asserts:
each file parses and carries the `synthetic`/`provenance`/`disclaimer`
markers; every unit and included-eligibility lane id is in the contract
section 4 taxonomy for the scenario's conflict; every exclusion reason is
in the bounded enum AND consistent with the frozen precedence order
(mechanically recomputing stub/missing-source/superseded/mirror/window/
legacy applicability per claim, including the frozen window ladder, and
asserting the expected reason is the first applicable — and that no
included claim has a mechanical exclusion); per-unit verdicts are valid
with NO corpus-recall `unavailable` (H1); contribution entries exist only
for corpus-recall-matched units; `headline` blocks exist in EXACTLY the
five register-#8 scenarios with matched/denominator/partialDiagnostic
recomputed from the per-unit verdicts; `missDiagnostic`/`laneDiagnostics`
values are bounded and sit on miss units / valid lanes; `windowEndSource`
matches the ladder-computed rung; the matcherFixture holds exactly two
5-vote variants whose pinned validVotes match a recount of actually
JSON-parseable votes and whose rungs are `llm` (variant A, voteRounds 1,
non-majority) and `keyword` (variant B, keywordUnmatchable 1);
scenario/claim/doc ids are globally unique; unit texts <= 320 and claim
texts <= 250 chars; hedging/engine values valid; legacy rows carry
`currentExtractorVersion: false`; the VELMORAN sentinel appears exactly
once across the three JSON files.

```
$ python3 - <<'EOF'   # (assertion script as described above)
roca-scenarios-v1.json: parses OK, 10 scenarios
iran-scenarios-v1.json: parses OK, 12 scenarios
crosscutting-scenarios-v1.json: parses OK, 17 scenarios
totals: scenarios=39 units=41 claims=48 docs=50 included=34 excluded=13
max unit text len=199 (cap 320); max claim text len=153 (cap 250); VELMORAN occurrences in JSON=1 (must be 1)
headline pins present in exactly: ['cc-matcher-failclosed-013b', 'iran-gulf-unavailable-010b', 'roca-compound-partial-009b', 'roca-retention-gap-008b', 'roca-ua-only-001b']
ALL CHECKS PASS: lanes valid per conflict; exclusion reasons bounded AND consistent with the frozen integrity->scope->comparability precedence; window ladder consistent (incl. rung-2 windowEndSource); verdicts valid with NO unit-level corpus-recall unavailable; contribution only for corpus-matched units; headline pins on exactly the five register-#8 scenarios with self-consistent arithmetic incl. partialDiagnostic; matcher variants pin the llm and keyword rungs with vote-usability recount; missDiagnostic/laneDiagnostics values bounded; ids unique; text caps respected; synthetic markers present
EOF
```
