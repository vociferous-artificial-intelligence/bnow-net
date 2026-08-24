# Phase 3 — relevance-filtered evidence union (implementation report)

Branch `codex/conflict-evaluations-p3-evidence` (from the Phase-2 merge
`e7f4b8e`). Phase 3 ships PURE modules only — candidate/evidence records,
versioned actor rosters, the lane/scope classifier, the eight-predicate
eligibility engine, bounded mix-capped selection, and the two separate
evidence assemblies — plus fixture-corpus acceptance wiring. **No DB surface,
no cron, no route, no edit to the frozen validation stack, no migration.**
This report is the committed author record; it folds in the full Gate-3
remediation round (BOTH reviewers — query/perf/ops and
evidence/source-fidelity — returned FAIL on `5f1844c`; every finding is
dispositioned in §4).

## 1. Files and purposes

- `src/lib/conflicts/evidence-records.ts` — candidate-claim/doc shapes with
  key allowlists (fixture loader rebuilds against them), the anti-gaming
  enforcement statement (precise: time-anchors-only inputs, runtime report-key
  allowlist, test-audited output cleanliness), and the two population record
  types with incompatible discriminants.
- `src/lib/conflicts/actor-rosters.ts` — versioned actor rosters
  (`ru-ua-roster-v1` / `iran-roster-v1`): priority-ordered entries,
  strong/weak strength, entry-wide `requires` co-occurrence, and GUARDED
  operating-area pattern groups (post-Gate-3: a bare area token never grants
  scope).
- `src/lib/conflicts/lane-classifier.ts` — versioned deterministic lane/scope
  classifier (`ru-ua-classifier-v1` / `iran-classifier-v1`): six-rung ladder,
  gazetteer, keyword rules, region tokens, the rung-6 `other_in_scope` gate.
- `src/lib/conflicts/eligibility.ts` — the eight frozen §5 predicates for
  BOTH populations; dominant-reason precedence over ALL applicable reasons;
  availability diagnostics; the bounded `scopeDetail` sub-diagnostic;
  theater-comparability enforcement.
- `src/lib/conflicts/evidence-selection.ts` — deterministic total order,
  mix-capped bounded selection (null-platform exemption, round-robin
  overflow), pinned ceilings, fail-closed limits guard.
- `src/lib/conflicts/evidence-assembler.ts` — the TWO assemblies (corpus
  recall / published retention, structurally unconflatable), fail-closed
  request validation (gap/snapshot/series/identity/limits), candidate-intake
  validation, canonical byte-deterministic output, the binding real-backend
  query contract.
- `src/lib/conflicts/fixture-corpus.ts` — fail-closed fixture loader
  (allowlist rebuild; typed IO/JSON failures), deterministic scenario report
  selection, fixture-backed evidence sources, clean `assemblerReportOf`
  projection.
- `fixtures/conflicts/` — +`cc-other-in-scope-018` (additive; rung-6 gate
  pin); README counts updated (40 scenarios / 42 units / 50 claims / 52
  docs; 35 included / 14 excluded).
- Tests: one unit file per module plus `fixture-corpus.test.ts` (the
  39→40-scenario acceptance suite reproducing every frozen expectation
  through the REAL engine, aggregate-count pins, sentinel audit).

## 2. The sixteen judgment calls (author round; binding as implemented)

1. **Roster contents.** iran: IRGC, Hezbollah, Iranian-aligned Iraqi
   militias, Houthi, E3, IAEA, mediator-Oman, mediator-Qatar, Israeli/US
   forces. ru-ua: DPRK support, Belarus enablement, Iranian materiel
   support, NATO/EU/member-state decisions, and the WEAK `russian-forces`
   scope fallback. Versioned; revision = version bump, never in-place.
2. **Roster coarseness.** Houthi-associated operating areas (Yemen,
   Hudaydah, Al Salif, Red Sea) attribute to the houthi entry without the
   group named — GUARDED (post-Gate-3) by attack/military/shipping
   co-occurrence so a bare area mention is never the actor.
3. **Reason emission.** At most ONE `actor:` reason — the highest-priority
   STRONG hit (weak entries emit only with no geography and no strong hit);
   ALL hits stay on `actorHits` for attribution.
4. **Classifier precedence.** Six-rung ladder: geography lane → specialty
   track lane → strong-actor lane → keyword lane → frontline-toponym
   fallback → gated `other_in_scope`. Geography-over-actor is the FROZEN
   register #6 rule; the rest is versioned classifier policy.
5. **Frontline dual geo.** The ru-ua frontline gazetteer class emits
   `geo:ua-frontline` only when the FINAL lane is frontline_maneuver and
   downgrades to `geo:ua` otherwise (a strike ON a frontline town is an
   in-country strike, not maneuver geography) — fixture-pinned.
6. **Predicate→reason mapping.** P1 roster theater → off_scope; P2 window
   (missing/malformed claimDate conservatively off_window); P3–P5
   classifier → off_scope/unclassified; P6 non-designated track →
   off_scope, superseded mapreduce version → superseded_version; P7 stub →
   stub_fixture, zero docs → missing_source, all-mirror → mirror_only; P8
   legacy engine OR legacy_only theater → legacy_incomparable (corpus
   recall only). ALL applicable reasons are collected; the frozen
   precedence picks the dominant.
7. **Retention interpretation.** The published-retention population is
   claims that GENUINELY appeared in designated digests (register #4).
   Legacy claims are members, labeled, never map-equivalent. A PUBLISHED
   claim from a superseded extractor version IS a member — the retention
   question is what the published output contained, not which map version
   produced it. An UNPUBLISHED claim is outside the population's SCOPE:
   the off_scope reason with `scopeDetail: "not_published"` (documented
   reading; the frozen reason enum is unchanged).
8. **Lane-diagnostics rule.** A lane reports `unavailable_incomparable`
   only when it had legacy-incomparable in-scope evidence AND no comparable
   included record; the diagnostic never touches any denominator
   (register #8 H1 keeps affected units as headline misses).
9. **Mix-cap parameters.** The house ~40% fraction, applied per SOURCE
   DOMAIN and per PLATFORM of each record's primary (earliest-ingested
   non-mirror) doc; null platform EXEMPT from platform bucketing; overflow
   refill round-robins across capped domains (source-mix.ts semantics);
   coverage beats diversity on thin corpora; the cap never changes an
   eligibility verdict.
10. **Ordering key.** Reliability descending nulls-last, then claimId
    ascending — applied to the eligible set before selection, the selected
    set, `assembly.records`, and (claimId-asc) `assembly.excluded`; every
    output list is deterministic, byte-level.
11. **Prompt bounds.** 100 records / 48,000 total UTF-8 bytes / 4,096 bytes
    per record / 1,000-candidate intake ceiling; caller limits may only
    NARROW (the frozen mix fraction is itself a ceiling); all measured and
    recorded in `bounds`.
12. **Mirror semantics.** A mirror doc is NEVER independent corroboration
    (independence counts non-mirror docs only); an all-mirror claim is
    excluded `mirror_only`; mirror relationships are PRESERVED on records
    for diagnostics.
13. **Same actor/place, wrong event.** Assemblies carry NO per-unit
    verdicts; two distinct same-day events by one actor both enter the
    union; claim↔unit matching is the Phase 4 matcher's job. Documented at
    the classifier boundary.
14. **Snapshot refusals.** operational_cutoff / at_publication / finalized
    return `unavailable: no_proven_snapshot` (register #5); the request's
    `snapshot` field is typed `null` so nothing can pretend to be an
    artifact before Phase 5 defines one.
15. **No real DB in Phase 3.** All engines are pure; sources are
    interfaces; the fixture corpus is the acceptance backend. The REAL
    backend obligation is recorded as a binding query contract (§5 below),
    not left implicit.
16. **Sentinel audit.** Reference-unit text is present in fixture inputs
    and asserted ABSENT from every serialized assembly (per-scenario, all
    40) — the §5 anti-gaming freeze is test-audited at the output.

## 3. Gate-3 reviewer adjudications (recorded as confirmed)

- Retention membership for published-superseded claims: CONFIRMED correct
  (judgment call 7).
- `LEGACY_CONTRIBUTOR_TRACKS = ["military"]`: CONFIRMED grounded in the
  production track configuration (`src/lib/analysis/tracks.ts` — specialty
  tracks run only where configured; none of the legacy theaters).
- Missing/malformed claimDate → off_window: confirmed honest conservative
  treatment (documented in the predicate mapping).
- `unavailable_incomparable` masking by precedence (an off-scope legacy
  claim never reaches the lane diagnostic): confirmed honest — the
  diagnostic input is in-scope classified evidence only.
- Real-corpus recall gaps found by reviewer probes — a Kremlin appointment
  claim lands `unclassified`, a POW-exchange claim lands `off_scope` under
  the v1 classifier — RECORDED as candidates for the future labeled sample
  (residual (e) below), not silently tuned around.

## 4. Gate-3 remediation round (both reviewers, this branch)

Pre-gate fidelity fixes: `6fe6323` (series cross-wiring refusal, duplicate
claimId refusal, report-key allowlist + honest anti-gaming header,
deterministic records/excluded lists), `f5afa9c` (exclusion-diagnostic
dedupe + `window:in-cutoff-end`), `5f1844c` (dead export removed). Gate-3
FAIL findings remediated in `f6dcdaa`..`c9ff49b`:

- **Perf/ops MAJOR-1** — null-platform exemption + round-robin refill
  (`f6dcdaa`; flood tests re-pinned with all-null platforms — the
  reviewer's 20/0 probe is a named test).
- **Perf/ops MAJOR-2** — byte determinism: lane-sorted diagnostics,
  field-by-field doc rebuild + docId-asc canonical order, deterministic
  ingest tie-break, NaN/claimId intake validation; JSON.stringify equality
  pinned over shuffled candidates/docs/mirrors on both assemblies
  (`c9ff49b`, `ac07f8e`).
- **Perf/ops MAJOR-3** — `Number.isFinite` limits guard; the frozen mix
  fraction is the ceiling (1.0 no longer neutralizes the quota)
  (`f6dcdaa`).
- **Perf/ops MAJOR-4** — binding query contract on the source interface +
  `EVIDENCE_MAX_INTAKE` (1000) visible refusal, boundary-tested
  (`c9ff49b`).
- **Perf/ops MINOR-1/2/4, NOTE-1, NOTE-2** — doc extra-key non-leak test;
  limits validated in `prepare()` before any source fetch
  (counting-stub-proven); the uniqueness comment corrected (a TEST asserts
  fixture uniqueness; the runtime guard is the invariant); typed
  loader IO/JSON failures (temp-dir tested); per-record text ceiling
  ADDED (`EVIDENCE_MAX_RECORD_TEXT_BYTES = 4096`) — chosen over
  documenting-why-not, because a single oversized record measurably
  starves the byte-budget fill.
- **Evidence MAJOR-1** — guarded roster area tokens; all five probe
  sentences excluded; fixture hits preserved; header corrected; versions
  kept (pre-merge repair) (`3fb6b36`).
- **Evidence MINOR-1** — legacy_only theater → legacy_incomparable in
  corpus recall regardless of engine stamp (bh probe pinned) (`ac07f8e`).
- **Evidence MINOR-2** — bounded `scopeDetail` sub-diagnostic (four
  causes; precedence theater → track → not_published → content), additive
  like windowReason (`ac07f8e`).
- **Evidence NOTE-1** — editionKey shape-validated through the Phase 1/2
  identity validator (anchors deliberately nulled — the window ladder owns
  malformed-anchor treatment); prose-bearing keys refused (`c9ff49b`).
- **Evidence NOTE-2** — `cc-other-in-scope-018` additive corpus pin for
  the rung-6 gate; README counts + acceptance pins bumped (`957aefe`).

## 5. BINDING carried conditions (repository artifacts, not session folklore)

1. **Persisted evaluation results (Phase 4/5) MUST stamp their inputs:**
   the window inputs (reportDate, RAW cutoffAt/publishedAt, the computed
   `windowEndSource` and anchor treatments — carries the Gate-2 time
   review's condition), the EFFECTIVE selection limits
   (max/bytes/fraction), and the version identifiers that shaped the
   population: actor-roster version, classifier version, lane-taxonomy
   version, evidence-policy version, and (corpus recall) the extractor
   version set. A stored score without these cannot be audited or
   reproduced and MUST NOT be persisted.
2. **The future DB-backed claim source is bound by the query contract in
   `evidence-assembler.ts` (`CorpusRecallClaimSource`):** `doc_claims JOIN
   raw_documents ON raw_document_id`, filtered to the conflict's mapped
   contributor theaters (`rd.country_iso2`), designated tracks, the window
   day span, the CURRENT extractor-version set via
   `src/lib/analysis/map-versions.ts` (the only sanctioned accessor), and
   non-stub adapters; ordered reliability DESC NULLS LAST, id ASC; with an
   explicit `LIMIT <= EVIDENCE_MAX_INTAKE`. Supporting indexes exist
   today: `doc_claims_track_date_idx`, `raw_documents_country_idx`. The
   assembler REFUSES over-limit batches — the backend must filter at the
   query, never rely on truncation.
3. **Durable anchor-change journaling** (Gate-2 carry, restated): when
   edition records gain durable storage, present→present anchor moves must
   leave a queryable trace.

## 6. Residual risks

Query/perf/ops review:

- (a) The query contract is prose against today's schema — plan shape,
  LIMIT interaction with reliability ordering, and index sufficiency are
  unproven until the integration phase runs it on real data.
- (b) An `EVIDENCE_MAX_INTAKE` refusal in production needs an
  operator-visible surface (cron health wiring is outside Phase 3).
- (c) Byte determinism is proven against input-order variance; JSON key
  order remains insertion-order — a future field added inconsistently
  between code paths would change bytes without failing toEqual tests
  (the stringify tests catch input-order drift, not schema drift).

Evidence/source-fidelity review:

- (d) v1 classifier/roster recall gaps on the real corpus: the probe-found
  misses (Kremlin appointment → unclassified; POW exchange → off_scope)
  are the first entries of a future labeled sample for classifier v2 —
  deliberate refusals today, not silent inclusions.
- (e) The `requires` guards are keyword heuristics: novel attack phrasing
  in Houthi-associated waters that matches no guard keyword loses actor
  ATTRIBUTION (and scope only in rung-3 cases where no geography class
  hits) — versioned, revisable by roster version bump.
- (f) `scopeDetail` reports ONE cause under a fixed precedence when
  several apply; the full applicable set remains visible in
  `applicableExclusions`.
- (g) The rung-6 `other_in_scope` gate depends on the versioned
  GENERIC_SECURITY keyword list — now corpus-pinned from both sides
  (cc-other-in-scope-018) but still a heuristic surface.

## 7. Gates (exact, on the remediated tree `c9ff49b`)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean |
| lint | `npm run lint` | clean (0 problems) |
| unit | `npm test` | **2,920 passed / 2,920 (205 files)** — pre-round baseline 2,903/205 + 17 net new/updated cases, zero regressions |
| conflicts, east of UTC | `TZ=Asia/Tokyo npx vitest run src/lib/conflicts/` | **518 passed / 518 (20 files)** |
| clean diff / tree | `git diff --check`; `git status` | clean / clean |
| integration suite | — | **not run**: Phase 3 touches no itest surface (pure modules + unit tests only) |

Zero paid provider calls, zero production writes, no migration, no env
change, no deploy, no push — branch/worktree only.
