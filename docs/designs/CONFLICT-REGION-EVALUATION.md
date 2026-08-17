# Conflict/region products and combined expert-benchmark evaluation — frozen contract

Phase 0 of the conflict-evaluations workstream (2026-08-17). This document is
the BINDING methodology and domain contract for phases 1–7. Changes after Gate
0 require a decision-register entry; changes after any result exists require a
new methodology epoch (§8). Base: quality-foundation reviewed SHA `e5757ea`
(branched at its docs-only disposition `7150b49`).

## 0. The three concepts, fixed vocabulary

| Concept | Meaning | Examples |
|---|---|---|
| **Country/theater** | where BNOW routes, ingests, publishes, and drills into evidence | `ru`, `ua`, `ir`, `il`, gulf codes |
| **Conflict/region** | the user-facing analytical object joining countries, actors, tracks, and transnational developments | `russia_ukraine`, `iran_regional` |
| **Benchmark scope** | the versioned editorial scope of ONE external reference series | `roca`, `iran_update` |

Country pages remain unchanged evidence/coverage lenses. The conflict layer
sits above them; nothing is deleted or re-keyed. The public concept is
**expert-benchmark coverage** — never "accuracy", "truth", or endorsement.
ISW/CTP reads many of the same open sources BNOW does; agreement is an
external quality gauge with a prominently disclosed non-independence caveat,
and divergence analysis is first-class.

## 1. Reproduced current state (Phase 0 baseline; confirmations against code)

The current flow, `src/app/api/cron/validate/route.ts` →
`src/lib/validation/run.ts` → `llm-match.ts`/`score.ts` → `/scoreboard`:

1. For each of `ru, ua, ir` (hard-coded list): select the date-D **military**
   digest for that ONE country (`run.ts:83-89`; other tracks never enter).
2. `referenceFor()` maps ru AND ua to the SAME ROCA report (`run.ts:48-49`);
   ir maps to the Iran Update with a 4-shape slug probe.
3. Report discovery: probe predictable slugs; insert a `pending`
   `isw_reports` row (UNIQUE `(url)`, UNIQUE `(theater, report_date)` — ONE
   row per theater/date, no edition concept).
4. Parse ONLY the "Key Takeaways" list (`isw-extract.ts`); prose transient;
   signatures persisted.
5. Per-theater takeaway filtering for ru/ua via `classifyTakeawayTheater`
   (toponym gazetteer; `both` stays in BOTH denominators; bullets with no
   recognized toponym default to `both` — on 2026-07-13 all five bullets
   stayed in both denominators).
6. Match the retained takeaways against the LATEST final-digest claims
   (k=5 majority LLM votes, keyword fallback), score, and UPSERT one
   `validation_runs` row per (digest, report) — revalidation overwrites.
7. Scoreboard renders per-country rows: **one ROCA report currently produces
   TWO country rows against overlapping denominators** (confirmed at code and
   by the 2026-07-13 audit: RU 20% + UA 0% from the same five takeaways), and
   **Iran validation scores only the ir `military` digest** — separate
   `nuclear` and `elite_politics` claims are structurally excluded, along with
   ALL il/gulf evidence.

Denominator table (current):

| Row | Denominator | Numerator | Known structural defects |
|---|---|---|---|
| ru | ROCA takeaways with theater ∈ {ru, both} | matched by ru military final claims | duplicate observation of one report; cross-corpus evidence invisible |
| ua | ROCA takeaways with theater ∈ {ua, both} | matched by ua military final claims | same; UA misses events whose evidence routed to ru corpus |
| ir | ALL Iran Update takeaways | matched by ir military final claims | regional/multi-track scope vs one-country-one-track output |

Other confirmed baseline facts: `digests` are last-writer-wins with claims
DELETE+reINSERTed per regeneration (NO historical snapshots exist);
`details.atPublish` is an evidence-availability proxy, not a bound on any
historical digest; `validation_runs` revalidation replaces divergences in
place; publication gaps (e.g. 2026-07-30, 08-01, 08-11..13 for Iran) simply
produce no run.

## 2. The benchmark unit (frozen)

```text
one reference report/edition
  -> one declared reference-unit set        (§3)
  -> one eligible conflict evidence set     (§5)
  -> one combined evaluation                (§6)
```

One report = one benchmark observation. RU/UA rows are replaced (in the NEW
conflict surface only — the existing scoreboard is untouched by default) by
one Russia–Ukraine War evaluation; Iran by one Iran-and-Regional-Conflict
evaluation. Country, theater, track, source, language, and actor become
CONTRIBUTION dimensions (§7), never duplicate headline scores.

## 3. Declared reference units (frozen denominator)

**The initial production-compatible denominator is every declared Key
Takeaway in the selected edition, and the public label is "Key Takeaway
benchmark coverage."** It is NOT whole-report coverage and is never labeled
"full-report" or shortened to "Iran Update coverage" for any subset.

- Extraction method: the existing Key-Takeaways parser (`isw-extract.ts`),
  hardened per Phase 2 but unchanged in scope. Every extracted unit enters the
  denominator; a unit is NEVER dropped because BNOW lacks a matching track or
  source — that is a real coverage gap and stays a miss.
- Match verdicts per unit: `matched` (substantially the same event/
  development, §6 matching rules), `miss`, and the DIAGNOSTIC verdict
  `partial` — a compound takeaway (multiple propositions in one bullet) where
  evidence covers some but not all propositions. **A `partial` is counted as a
  MISS in the headline numerator** (never as a fraction, never as a match);
  it is surfaced separately so compound-bullet under-credit is visible instead
  of silently inflated or deflated.
- Deliberately narrower subset scores (e.g. "kinetic/security subset") are
  permitted only as EXPLICITLY LABELED companions showing their own
  numerator/denominator beside the declared-unit result.
- **Atomic proposition decomposition is a DISABLED EXPERIMENT** (flagged-off
  adapter, Phase 4 optional): stable derived identifiers (reportEdition +
  unit ordinal + proposition ordinal + text hash), deterministic ordering and
  classification, no persisted prose, honest compound/partial exposure, a rule
  that one vague claim cannot satisfy several distinct propositions on topic
  overlap alone, and a human-labelled calibration fixture set REQUIRED before
  the method may even be proposed publicly. It never feeds the headline.

## 4. Lanes and phases (frozen taxonomies, versioned)

Lane taxonomies are stable, versioned (`laneTaxonomyVersion`), and comparable
over time. Initial sets:

**`iran_regional` lanes (`iran-lanes-v1`):** `direct_kinetic` (direct
Iran–Israel–US fighting / force posture), `proxy_partner` (Hezbollah/Lebanon,
Iraqi militias, Houthis/Yemen, Palestinian groups, Syria), `maritime`
(Hormuz / Red Sea / Gulf shipping and bases), `nuclear_diplomacy` (program,
IAEA, E3/EU, mediators), `domestic_security` (Iranian internal security,
elite politics, succession), `regional_effects` (regional diplomacy,
sanctions, military-economic effects), `other_in_scope`.

**`russia_ukraine` lanes (`roca-lanes-v1`):** `frontline_maneuver`,
`strikes_air_defense` (long-range strikes and air defense, both directions),
`force_generation` (mobilization, logistics, military industry),
`occupied_crossborder` (occupied territories incl. Crimea; cross-border ops
incl. Kursk/Belgorod), `foreign_support` (foreign military support and
coalition decisions for Ukraine), `russia_partners` (DPRK, Iran, Belarus and
other Russian enablement), `strategic_political` (decisions directly shaping
the war), `other_in_scope`.

Lane assignment applies to reference units (for lane coverage) and to
evidence (for contribution): deterministic keyword/actor classifiers with an
explicit `other_in_scope`/`unclassified` outcome — never a silent drop. Lane
coverage partitions the SAME declared units; lanes are never presented as
independent reports and never change the headline denominator.

**Phases** are immutable, prospectively declared records:
`{ conflictId, phaseId, effectiveFrom, effectiveTo, declaredAt, policyVersion,
provenance }`. A phase may label, rank, or explain lanes; it may NOT
retroactively exclude misses from the headline denominator. Backfilled phase
labels are retrospective annotations (marked `declaredAt` > `effectiveTo`
where applicable), never as-published policy. There is no mutable global
"current phase".

## 5. Evidence eligibility (frozen policy, versioned)

`evidencePolicyVersion` (initial `ru-ua-ev-v1` / `iran-ev-v1`) governs the
candidate union. **Relevance, not source geography**: a source's home country
is neither necessary nor sufficient.

Eligibility predicates (ALL versioned, ALL inspectable per record):

1. conflict/reference series membership;
2. claim/event time within the evaluation window for the report;
3. lane/topic classification in the conflict's lane set (with
   `other_in_scope` requiring an actor/geography hit — see 4/5);
4. actor/organization involvement (versioned actor rosters per conflict:
   e.g. DPRK-military-support, NATO/EU decisions FOR `russia_ukraine`;
   Hezbollah, Houthi, IRGC, IAEA, E3 FOR `iran_regional`);
5. event geography and cross-border relationship (occupied territories =
   in-scope for `russia_ukraine`; Hormuz/Red Sea = in-scope for
   `iran_regional`);
6. track ∈ the conflict's contributor tracks (`russia_ukraine`: military;
   `iran_regional`: military + nuclear + relevant elite_politics), at CURRENT
   extractor versions via `map-versions.ts` only;
7. ≥1 raw-document link and non-stub (rulings 2/3);
8. the record's engine comparability class (see below).

Every INCLUDED record carries: claim id, conflict, lane, contributing
theater/track, hedge, event time, source-document ids, earliest ingest time,
extractor-version identity, inclusion reasons. Every EXCLUDED candidate
carries one bounded reason: `off_window`, `off_scope`, `superseded_version`,
`stub_fixture`, `missing_source`, `legacy_incomparable`, `mirror_only`,
`unclassified`.

Test-mandated inclusions/exclusions (the §16 corpus): a UA-tagged claim
satisfying a ROCA development no RU digest retained; DPRK/NATO/EU/Moldova
developments materially concerning the war; Lebanese/Iraqi/Yemeni/Israeli/
US/Gulf/IAEA/E3/Omani evidence in-scope for the Iran Update; unrelated
Israeli domestic politics, generic Gulf business news, and unrelated EU news
EXCLUDED despite region membership.

**Comparability honesty:** il/gulf theaters have no map-stage `doc_claims`
(legacy engine only). Legacy-engine claims are NEVER silently treated as
map-stage-equivalent: they enter only the published-retention population
(they are published digest claims) and are labeled `legacy` there; the
corpus-recall population is current-version `doc_claims` only, and lanes
whose plausible evidence lives in non-mapped theaters report
`incomparableCoverage` honestly (e.g. an Iran Update Gulf-base lane with no
comparable mapped Gulf evidence reports `unavailable`, never a manufactured
zero or a silent inclusion).

**Frozen window and precedence rules (Phase 0 ambiguity resolutions —
decision register #6; the fixture corpus pins each):**

- **Evaluation window** per report: START = `reportDate − 2 days` (00:00Z of
  that day — covers the reference series' typical reporting lookback); END =
  `cutoffAt` when parseable, else `publishedAt` when known, else the
  EXCLUSIVE end of the report date's UTC day. The END boundary is INCLUSIVE
  ("at or before") wherever an instant comparison applies. Claims are
  day-granular (`claimDate` within the window's date span); per-document
  instants drive the cutoff/publication diagnostics.
- **Lane assignment precedence:** when actor roster and event geography
  disagree, EVENT GEOGRAPHY wins (a Houthi attack on Red Sea shipping is
  `maritime`, not `proxy_partner`; the actor still contributes to actor-level
  attribution).
- **Exclusion-reason precedence** (first match wins, integrity before scope
  before comparability): `stub_fixture` → `missing_source` →
  `superseded_version` → `mirror_only` → `off_window` → `off_scope` →
  `legacy_incomparable` → `unclassified`.

**Anti-gaming freeze:** evidence eligibility is computed WITHOUT the
reference report's content. The report text may be used by the matcher AFTER
candidate assembly; it may never decide which claims enter the union.
Mix caps (per source/platform, reusing the house ~40% cap pattern) bound any
single corpus from crowding the candidate set; deterministic ordering before
any LLM sees candidates; prompt/input sizes bounded and measured.

## 6. The combined evaluation (two questions, three clocks)

### 6.1 Two pipeline questions, never conflated

1. **Corpus recall:** did the current-version mapped/eligible claim corpus
   (doc_claims via the sanctioned accessors) contain the development?
2. **Published retention:** did an actual user-facing output retain a
   matching claim? **The published population is, until a first-class
   conflict digest exists, the versioned union of claims that genuinely
   appeared in the designated existing user-facing country/track digests**
   (`russia_ukraine`: ru+ua military digests; `iran_regional`: ir military +
   ir nuclear + ir elite_politics digests where present, plus designated
   il/gulf digests ONLY as labeled legacy contributors). Never a
   counterfactual conflict synthesis; never the whole mapped corpus; evidence
   existence never implies published retention.

### 6.2 Evaluation kinds (explicit labels; unavailable ≠ 0)

| Kind | Input snapshot | Availability rule |
|---|---|---|
| `operational_cutoff` | newest frozen BNOW state at/before the report's declared data cutoff | **`unavailable` until a separately reviewed capture path exists** (see below) |
| `at_publication` | newest frozen BNOW state at/before the report's `datePublished` | same |
| `finalized` | the designated D+1/final BNOW output | same (the current DB holds only latest-writer state, which is not a frozen final snapshot once later regenerations occur) |
| `retrospective` | a later re-evaluation under a named epoch over inputs that still exist | allowed NOW, explicitly labeled |

An enum row does not prove a snapshot exists. Until an immutable capture
artifact demonstrates the exact corpus AND published populations at the
required instant (a `ConflictSnapshotRef` with capture kind, capturedAt,
population hashes, policyVersion, provenance — Phase 5 contract), the three
non-retrospective kinds return `unavailable` with a provenance reason. This
workstream produces fixture results and labeled retrospectives ONLY. The
capture path is DESIGNED (Phase 5) but not built here; no competing snapshot
subsystem is created.

### 6.3 Matching rules (binding)

- Agreement = materially equivalent event/development: action, direction,
  actor, place, date/window, status, hedge, and important quantities must be
  compatible — never shared topic/place/actor alone.
- Negative/quiet-day units match only explicit absence/stalling claims.
- No match to a claim outside the declared conflict scope.
- One claim matching multiple units is visible and constrained by the
  compound policy (§3); hedge/attribution/identity/predicate/status/time/
  place/quantity are never strengthened by matching or by any conflict
  rendering; mirrors/reposts are never independent corroboration.
- K=5 majority semantics are inherited unchanged for any live-compatible LLM
  adapter (production `MATCH_SYSTEM_PROMPT`/`MATCH_RESPONSE_SCHEMA`/
  `sanitizeMatches` reused via their existing exports); the keyword fallback
  stays honestly labeled and can never masquerade as a majority result. NO
  paid runs in this workstream — a deterministic fixture matcher/oracle
  drives all tests and offline reports.

### 6.4 Metrics (each with explicit numerator/denominator/missing rule)

Per report evaluation: reference units total and per lane; mapped-corpus
matches/misses/coverage; published-output matches/misses/coverage
(coverage = matched/declared-units, per §3, partial counts as miss);
evidence-available-by-cutoff/publication where truthfully known (proxy
labeling inherited from `at-publish.ts` semantics); contribution counts (§7);
thin-sourced and independent-source diagnostics with explicit denominators;
information lead from BNOW ingest time (source-declared publish time shown
separately); in-scope BNOW-only items (only inside declared conflict scope);
matcher identity, votes, variance grouping, methodology epoch, input snapshot
identity; `unavailable`/`insufficient_data` states distinct from zero
everywhere. **No composite quality score.**

## 7. Contribution attribution (multi-label, non-additive — frozen)

- Each matched unit counts EXACTLY once in the headline numerator.
- Per dimension (theater/track/source/platform/language/actor): count the
  distinct matched units supported by ≥1 eligible contributor in that bucket.
- One matched unit may appear in several buckets; bucket totals may exceed
  the headline numerator. UI label: **"matched takeaways with evidence from
  …"**, with the non-additivity disclosed beside the table.
- No exclusive or fractional primary credit in this workstream.
- **Population (frozen):** contribution attribution is computed over the
  CORPUS-RECALL matched units (the diagnosis-oriented population); the
  published-retention view derives its own contribution table separately when
  displayed, never mixed into the corpus-recall one.

## 8. Epochs and record integrity

`methodologyEpoch` (initial `conflict-epoch-1`) stamps every result: lane
taxonomy version, evidence policy version, denominator method, matcher
identity, compound policy. A methodology change creates a NEW epoch and a
side-by-side retrospective series; it never silently rewrites old meaning.
As-published results are never overwritten (the fixture/retrospective store
is append-only by construction in this workstream; durable storage is a later
integration decision). Aggregates weight reports equally and disclose report
counts; small-denominator days render their n prominently.

## 9. Reference series, editions, and discovery (Phase 2 contract)

Model (design; NO numbered migration in this workstream — disposable SQL
only): stable series (`roca`, `iran_update`); canonical report URL + provider
identity; report/edition identity (`editionKey`); report date; declared
cutoff instant when parseable (else null, never guessed); publication instant
when present; discovery/fetch/parse status; `scopeVersion`; designated
daily-final status or an explicit multi-edition aggregation policy (dedupe
units, state the method); derived reference units as legal-safe signatures +
unit hashes only.

Schema options to compare in Phase 2 (per prompt): (1) extend `isw_reports`
forward; (2) an additive edition child table linked to the existing
report/citation rows; (3) a provider-neutral benchmark-report table with an
ISW adapter. Constraint driving the comparison: `isw_reports` UNIQUE
`(theater, report_date)` forbids same-date editions today, while the
citation registry FKs `isw_reports.id` — preserving citations intact is
mandatory. Publication gaps are represented, never fabricated; no arbitrary
same-date `rows[0]`; deterministic edition ordering; feed/index/corpus-backed
discovery preferred over date-to-one-slug construction; the reviewed
citation-refresh loader (`isw/load.ts`) is REUSED, with its idempotency,
host spacing, robots, caching, and never-downgrade-a-parse rules intact.

## 10. Eval control-plane extension decision (Phase 0, per prompt §3)

**Decision: a conflict-specific dataset profile and scoring adapter UNDER THE
EXISTING `validation` workload — no new workload.** Rationale recorded:

- The control plane's `validation` workload already scores
  takeaway↔claim matching with human-labelled pairs, theater probes, and the
  production matcher's exported prompt/schema/sanitizer. The conflict
  evaluation IS a validation-shaped task over a differently-assembled
  candidate set with a richer result payload — same dispatch identity, same
  (caseId, repetition) resume, same estimate/report modes.
- The conflict result payload (§6.4) rides as an additive VERSIONED payload
  inside the case reference/checks (`conflictResultV1`), not a rival
  top-level schema; the dataset profile is distinguished by dataset naming
  (`conflict-roca-v1`, `conflict-iran-v1`) and case-level metadata, keeping
  every exhaustive switch untouched.
- Honesty check (the prompt's overload test): nothing in the conflict cases
  misrepresents the validation contract — inputs are takeaway-shaped
  synthetic units + claim sets; checks extend the existing deterministic
  check vocabulary. If Phase 5 implementation discovers a semantic that
  genuinely cannot ride the validation contract without distortion, the
  fallback is the prompt's option (2) — one additive `conflict_validation`
  workload updating EVERY exhaustive surface in one coherent change — and
  that reversal requires a decision-register entry BEFORE the edit.

There remains one control plane and one `scripts/analysis-eval.ts`.

## 11. Flags, defaults, and surfaces (Phase 6 contract)

- All new runtime behavior OFF by default. `/scoreboard`, country pages,
  digests, validation cron, and navigation are behavior-identical when the
  new flags are absent.
- Proposed flag: `CONFLICTS_UI` (unset/absent = off). Every conflict route
  (`/conflicts`, `/conflicts/russia-ukraine`, `/conflicts/iran-regional`,
  benchmark detail beneath the conflict route — subject to repository IA
  review in Phase 6) calls the feature-off guard as the FIRST statement and
  returns `notFound()` before any conflict data access; gated routes (none
  planned — conflict pages are public-teaser-shaped unless IA review says
  otherwise) would put the ruling-21 gate first, then the feature guard.
  Bare-GET + `RSC: 1` feature-off body tests for every route.
- The Phase 6 "what changed" view renders ONLY claims that genuinely appeared
  in designated published digests (with originating digest/theater/track and
  source trail); hidden `doc_claims` support internal counts only and their
  text is never presented as published conflict intelligence. No new conflict
  synthesis is created or published.
- No ISW prose, no source full text, no provider/model names, no internal
  prompts, no hidden candidate evidence in any rendering. Percentages always
  carry numerator/denominator; `unavailable` renders distinctly from `0%`;
  the shared-source non-independence caveat is prominent.

## 12. Migration posture

This workstream creates NO numbered Drizzle migration and edits NO journal.
Phase 2 produces reviewed schema/API design + disposable test SQL; the real
forward migration is generated later on the operator-selected integration
base once all concurrent schema work (adjudication design, this workstream)
is known. `9999_claim_source_trigger.sql` ordering is preserved by whoever
generates it.

## 13. Phase exit criteria (index of what each phase must prove)

- P1: pure domain (definitions/lanes/phases/validation) — no DB/provider/
  existing-validation change; exhaustive unit tests.
- P2: report/edition/window model + discovery contract + disposable SQL;
  citation registry untouched and provably intact.
- P3: bounded relevance-filtered union with inclusion/exclusion reasons and
  the §16 adversarial cases; corpus-recall vs published-retention as separate
  functions.
- P4: pure combined scorer + fixture matcher/oracle + golden results for both
  conflicts; live-compatible adapter unexecuted.
- P5: control-plane adapter per §10 + `ConflictSnapshotRef` contract; refusal
  of cutoff/publication/finalized without a proving artifact.
- P6: feature-off UI with the seven analyst questions answered in order;
  browser matrix; accessibility.
- P7: integration, fixture backtest matrix (current separate RU/UA vs
  combined ROCA; current Iran military-only vs combined regional), shadow-soak
  PLAN (not enabled), PR decomposition, final three reviews.
