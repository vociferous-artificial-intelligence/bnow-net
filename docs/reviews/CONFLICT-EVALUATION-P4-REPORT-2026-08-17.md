# Phase 4 — combined scoring and diagnostics (implementation report)

Branch `codex/conflict-evaluations-p4-scoring` (from the Phase-3 merge
`323013e`). Phase 4 ships PURE modules only — the §6.3 match contract, three
matcher adapters (deterministic fixture oracle, live-compatible LLM shape,
keyword fallback), the pure combined scorer, non-additive §7 contribution,
the golden-result machinery, and the offline markdown formatter — plus the
additive `ConflictResultV1` extension and one ADDITIVE corpus scenario
(`cc-vague-claim-019`, the register-#9 deferred pin). **No DB surface, no
cron, no route, no UI, no edit to the frozen validation stack, no migration,
no paid call — paid dispatch is structurally impossible (no provider SDK
import, no env read; the live-compatible adapter requires an injected vote
function).** Commits: `6a88edf` (corpus pin), `38a1afb` (implementation),
`3e3064d` (tests + committed byte-stable goldens).

Provenance note (§7 below): this report was written by the closeout session
from the committed code, not from the original author's notes; judgment
calls in §3 are RECONSTRUCTED and marked as such.

## 1. Files and purposes

- `src/lib/conflicts/match-contract.ts` — the binding §6.3 matcher seam:
  matcher kinds/labels, `MatchableUnit`/`MatcherClaim`/`UnitClaimMatch`/
  `ConflictMatchOutcome` shapes, fail-closed vote parsing through the EXACT
  production `sanitizeMatches`, the inherited degradation-ladder resolution
  over usable rounds (production `majorityFromVotes`), compound→partial pair
  projection, and shared unit-list validation.
- `src/lib/conflicts/fixture-matcher.ts` — the deterministic oracle: a
  committed per-scenario (unitId, claimId, coverage) pair table over the
  frozen corpus, fail-closed table validation, structural population
  filtering, and the fixture→scorer unit projection (`declaredUnitsOf`).
- `src/lib/conflicts/keyword-matcher.ts` — ladder rung 3 over the production
  gazetteer machinery, with the three disclosed conflict divergences (full
  declared-unit denominator + `keywordUnmatchable`; negative units never
  match; compound units partial-only) and a structurally-honest label.
- `src/lib/conflicts/llm-compatible-matcher.ts` — the live-compatible
  adapter SHAPE: exact production prompt/schema exports, injected vote
  function, per-round discard-never-repair, ladder resolution, typed
  keyword-fallback delegation. No dispatch capability exists in this phase.
- `src/lib/conflicts/scorer.ts` — the pure combined scorer: one report +
  both P3 assemblies + one matcher → one `ConflictResultV1`; fail-closed
  match acceptance, headline/lane/verdict arithmetic, every binding stamp,
  the three result variants (scored / unavailable / publication gap).
- `src/lib/conflicts/contribution.ts` — §7 multi-label NON-ADDITIVE
  contribution: per-unit buckets over full-matched corpus-recall units,
  distinct-unit totals, mirror docs excluded from sources.
- `src/lib/conflicts/goldens.ts` — the ONE fixture→scorer wiring
  (`scoreFixtureScenario`), the matcher-fixture vote-variant replay, the
  golden scenario set, and byte-stable golden serialization.
- `src/lib/conflicts/offline-report.ts` — pure `ConflictResultV1` → markdown
  formatter (tests/offline review only; Phase 6 owns surfaces).
- `src/lib/conflicts/eval-profile.ts` — EXTENDED additively: the Phase-4
  result stamps/records (window/selection/versions/matcher/voteAudit/lanes/
  agreements/referenceOnly/bnowOnly/multiUnitClaims/independentSources/
  thinSourced/timing/contribution totals/runGroupKey/snapshot) and the
  binding runtime persistence gate `assertPersistableConflictResultV1`.
- `src/lib/conflicts/errors.ts` — four additive codes:
  `invalid_match_outcome`, `invalid_oracle_table`, `invalid_score_request`,
  `unpersistable_result`.
- `fixtures/conflicts/crosscutting-scenarios-v1.json` — +`cc-vague-claim-019`
  (ADDITIVE; register #9); README counts updated (41 scenarios / 44 units /
  52 claims / 54 docs; 37 included / 14 excluded).
- `fixtures/conflicts/goldens/golden-results-v1.json` — the committed
  byte-stable golden expected results (14 keys on the final tree: 12
  oracle-scored scenarios incl. both conflicts and a gap day, plus the
  ladder scenario × 2 vote variants; see §8 — `3d10068` added the
  sentinel-bearing scenario's entry after this section was first written).
- Tests: `match-contract.test.ts`, `keyword-matcher.test.ts`,
  `contribution.test.ts`, `scorer.test.ts` (synthetic/misbehaving-matcher
  unit tests), `scorer-acceptance.test.ts` (the 41-scenario acceptance
  loop), `scorer-legal-audit.test.ts` (reference-prose audit),
  `goldens.test.ts` (the byte drift gate), `offline-report.test.ts`;
  `fixture-corpus.test.ts` count pins bumped for the additive scenario.

## 2. The result contract as shipped (`ConflictResultV1` extension)

`ConflictScoredResultV1` (`eval-profile.ts:259-353`) gains the Phase-4
fields as OPTIONAL compile-time members (additive extension of the Phase-1
shape; V1 was unreleased and this phase is its first producer), with
presence enforced AT RUNTIME by `assertPersistableConflictResultV1`
(`eval-profile.ts:360-387`): a scored result missing any binding stamp
throws `unpersistable_result` and MUST NOT be persisted; unavailable/gap
variants pass because they carry no score. The scorer itself calls the gate
before returning (`scorer.ts:603`), so no scored result can even be
produced without the stamps. Mapping against the P3 §5 binding carried
conditions:

| P3 §5 condition | Shipped field | Notes |
|---|---|---|
| window inputs: reportDate, RAW cutoffAt/publishedAt, anchor treatments, `windowEndSource` | `window` (`ConflictWindowStampV1`, `eval-profile.ts:107-118`) + top-level `windowEndSource` | RAW anchors stamped verbatim; treatments from the P3 window ladder; start/end day span + day count included |
| effective selection limits (max/bytes/fraction) | `selection.limits` + per-population `eligibleCount`/`selectedCount`/`cappedOutCount`/`budgetOutCount`/`totalTextBytes` (`eval-profile.ts:120-134`) | a selection-starved day is visible in every stored result; the scorer refuses assemblies run under different limits (`scorer.ts:669-680`) |
| the five version identities | `laneTaxonomyVersion` + `evidencePolicyVersion` (top-level, Phase 1) + `versions.actorRosterVersion` / `.laneClassifierVersion` / `.extractorVersions` / `.scopeVersion` (`eval-profile.ts:138-146`, `scorer.ts:530-541`) | `extractorVersions` = sorted unique set observed on corpus-recall records ([] in fixture runs, which carry only the boolean discipline) |
| matcher identity | `matcher` (`ConflictMatcherStampV1`, `eval-profile.ts:150-159`) + top-level `matcherRung` | kind + label + votesK + model + each population call's own label/voteRounds; `matcher.label === matcherRung` is enforced by the persistence gate |
| per-vote audit | `voteAudit.{corpusRecall,publishedRetention}` (`eval-profile.ts:298-301`) | production `TakeawayVotes` shape keyed by unitId; null members on non-llm rungs |
| repeated-run grouping | `runGroupKey` (`scorer.ts:591-598`) | conflict \| editionKey \| kind \| epoch \| matcher kind \| k — identical inputs + matcher config share a key |
| methodology epoch | `methodologyEpoch` (common, `conflict-epoch-1`) | every variant carries it |
| snapshot identity | `snapshot: { ref: null }` (`eval-profile.ts:349-352`) | TYPED null until the Phase-5 `ConflictSnapshotRef` capture contract exists (register #5) — nothing can pretend to be an artifact |

Also shipped per prompt §12: report-level result (three-variant union,
`eval-profile.ts:412-415`); all-declared-unit + per-lane
numerator/denominator (headline + `lanes`); both populations' verdict maps,
agreement records, reference-only records, and in-scope-BNOW-only records
(corpus-recall COUNT only; renderable items from published retention only —
register #7 pin, `scorer.ts:556-572`); `unavailableReason` distinct states;
timing and source-independence diagnostics; `headlineLabel` pinned to the
literal "Key Takeaway benchmark coverage"; no reference prose anywhere.

Deliberately deferred: the atomic proposition-decomposition experiment
adapter (design §3 flagged-off experiment, "Phase 4 optional") was NOT
built — the anti-vague-claim rule ships instead as the generally-binding
§6.3 L1 rule plus the register-#9 corpus pin; a real
`ConflictSnapshotRef` and any durable storage (with it, the P3 condition-3
anchor-change journaling) remain Phase-5+; live vote-function wiring (spend
reservation per dispatch) is a later separately-reviewed step
(`llm-compatible-matcher.ts:15-23`).

## 3. Judgment calls (RECONSTRUCTED from the code by the closeout session)

1. **Atomic/compound policy as implemented** (reconstructed). A compound
   unit's coverage is decided by WHO attests it: ladder-rung matchers
   (llm-majority/llm/keyword) can never attest that one claim covers every
   proposition of a compound bullet, so they emit `coverage: "partial"` on
   compound units unconditionally (`match-contract.ts:299-322`
   `pairsFromLlmMatches`; `keyword-matcher.ts:95`); only the fixture
   oracle's committed pair table may carry `"full"` for a compound unit,
   and the scorer REFUSES full-compound coverage from any non-oracle kind
   (`scorer.ts:179-184`). Per-unit verdict: any full pair → `matched`;
   partial pairs only → `partial` (a headline MISS, register #2); no pair →
   `miss` (`scorer.ts:253`). Partial coverage on a NON-compound unit is a
   typed refusal (`scorer.ts:173-178`) — partial is the compound-bullet
   diagnostic only, so a matcher cannot invent fractional credit on atomic
   units.
2. **Vague-claim prevention (cc-vague-claim-019 wiring)** (reconstructed).
   The rule "one claim matches multiple units ONLY when materially
   equivalent to EACH independently" is enforced at three layers. (a) The
   oracle pair table gives the vague claim 9401 NO pair at all
   (`fixture-matcher.ts:119-120`) — it topically overlaps both distinct
   Houthi-maritime units and is equivalent to neither; the specific claim
   9402 pairs with u0 alone. (b) The scenario's `matcherFixture` block pins
   this from the corpus side (`expected.creditedUnits: []`), recounted
   against the live table by `scorer-acceptance.test.ts:47-59` and
   end-to-end (the vague claim appears in NO agreement record of either
   population, surfaces as a published-retention BNOW-only item, and
   `multiUnitClaims` is empty — `scorer-acceptance.test.ts:239-256`).
   (c) Legitimate multi-unit matches remain VISIBLE, never silent: the
   scorer emits `multiUnitClaims` (claimId → sorted unitIds,
   `scorer.ts:319-330`) whenever one claim pairs with ≥2 units. Note the
   honest limit: visibility is the mechanism for rung matchers — the
   scorer does not REFUSE multi-unit pairs (§6.3 permits them when each is
   independently equivalent), so live-adapter over-pairing is disclosed,
   not blocked (see §6 double-credit).
3. **Verdict-mapping edge cases** (reconstructed). `matched` wins over
   `partial` when a unit holds both full and partial pairs (`full.length >
   0` first, `scorer.ts:253`). `missDiagnostic: "incomparable_coverage"` is
   attached only when the verdict is `miss` AND the unit's lane carries the
   P3 `unavailable_incomparable` diagnostic (`scorer.ts:288-292`) — a
   `partial` verdict in an incomparable lane carries no sub-label, and the
   lane diagnostic is a CORPUS-RECALL statement only (the retention
   population scores with `laneDiagnostics: null`, `scorer.ts:474`).
   Duplicate (unit, claim) pairs and pairs naming undeclared units are
   typed refusals (`scorer.ts:153-171`). The headline `partialDiagnostic`
   is the count of DISTINCT units partial in EITHER population
   (`scorer.ts:482-486`) — a union, surfaced beside the headline, never
   inside it; each population's own verdict map carries the per-population
   truth.
4. **Fail-closed population acceptance** (reconstructed). A matcher outcome
   naming a claim that is not a member of the population being scored is
   REFUSED (`scorer.ts:160-166`) — "no match to a claim outside the
   declared conflict scope merely to avoid a miss" is mechanical. The
   oracle additionally filters structurally (it only returns pairs whose
   claimId is in the SUPPLIED claim list, `fixture-matcher.ts:179-184`),
   and the table deliberately LISTS pairs for claims the eligibility engine
   excludes (superseded 9309, mirror-only 9311, stub 9313) so the
   acceptance suite can prove they contribute NOTHING through the real
   pipeline (`scorer-acceptance.test.ts:259-281`) instead of hiding the
   discipline inside the table.
5. **Contribution semantics** (reconstructed). Computed over CORPUS-RECALL
   full-matched units only (`scorer.ts:302-315` feeds `fullMatchClaims`;
   partial units earn nothing — the compound-partial pin expects an empty
   map); the published-retention view derives its OWN table
   (`contributionPublishedRetention`), never mixed (§7 frozen population).
   Double-counting prevention: the headline `matched` increments once per
   UNIT regardless of pair count (`scorer.ts:253-255`), and bucket totals
   count DISTINCT matched units per bucket (`contribution.ts:70-88`), so
   nothing anywhere sums pair counts. The by-theater/track/source tables
   sum to "distinct matched units with ≥1 eligible contributor in that
   bucket" — deliberately NOT the headline numerator; totals carry the
   literal `nonAdditive: true` and both the scorer test and the golden test
   pin a bucket sum exceeding the numerator (`scorer.test.ts:259-287`).
   Sources are non-mirror doc domains only (`contribution.ts:59-63`).
6. **Matcher ladder mechanics** (reconstructed). Rung decision sites: the
   live-compatible adapter collects usable rounds (a throwing voteFn or
   malformed body is a DISCARDED round, `llm-compatible-matcher.ts:101-110`),
   then `resolveLadder` (`match-contract.ts:259-282`) applies production
   semantics unchanged — ≥3 usable → production `majorityFromVotes`
   (`llm-majority`); 1–2 usable → the FIRST usable round, labeled `llm`;
   0 usable → delegate to the injected `ConflictKeywordMatcher`
   (`llm-compatible-matcher.ts:116-119`), which labels itself. Vote parsing
   is discard-never-repair (`match-contract.ts:197-233`): a usable vote must
   parse to a `matches` array of schema-shaped entries (production
   `takeawayIndex` form or the offline `unitId` audit form); entries then
   pass through the EXACT production `sanitizeMatches` (unknown claimIds and
   sub-0.6 confidence fail closed to null; out-of-range unit refs dropped).
   When the two population calls resolve different rungs, the result label
   is the MORE degraded rung, and mixing the oracle with a ladder rung in
   one result is refused (`scorer.ts:696-713`).
7. **Oracle table design** (reconstructed). One committed entry per
   scenario ([] = matches nothing), keyed by scenario id
   (`fixture-matcher.ts:63-121`), performing NO text inference — it records
   the fixture author's pair-level intent, and everything downstream
   (verdicts, arithmetic, lanes, contribution, diagnostics) is SCORER
   derivation, so the acceptance loop tests real computation, not a
   copy-through. `oraclePairsFor` fail-closes on drift: a missing entry, an
   unknown unitId/claimId, or a duplicate pair throws
   `invalid_oracle_table` (`fixture-matcher.ts:128-162`), and the
   acceptance suite additionally asserts every table key names a real
   scenario (`scorer-acceptance.test.ts:36-45`).
8. **Keyword matcher honesty mechanism** (reconstructed). Structural, not
   behavioral: the outcome label is the LITERAL `"keyword"` in the return
   type (`keyword-matcher.ts:69`), `votes`/`voteRounds`/`votesK`/`model`
   are null literals (`keyword-matcher.ts:101-109`) — the module cannot
   represent a majority result; `fixture-oracle` has no ladder rank and
   `ladderDegradation` accepts `MatcherRung` only
   (`match-contract.ts:88-101`), so oracle labels cannot enter rung
   comparisons; the fallback slot in the adapter config is typed as the
   CONCRETE `ConflictKeywordMatcher` class (`llm-compatible-matcher.ts:60`)
   so the fallback can never be another LLM path. Divergences (all
   disclosed in the header): full declared-unit denominator with
   `keywordUnmatchable` counting signal-less units only (register #8 M1);
   negative/quiet-day units NEVER match (a signature cannot express
   absence-compatibility — the test proves bare production reuse WOULD
   have matched the quiet-day probe at 0.875, `keyword-matcher.test.ts:
   59-81`); compound units partial-only.
9. **Offline-report language choices** (reconstructed). Coverage-only
   vocabulary ("Key Takeaway benchmark coverage" / "Expert-benchmark
   coverage"); every ratio prints explicit `matched/denominator declared
   Key Takeaways` (`offline-report.ts:22-24`); unavailable renders as a
   provenance statement explicitly "distinct from a zero" and a
   publication gap prints NO ratio at all; the contribution section's
   heading is the §7 UI label with the non-additivity sentence inline
   (`offline-report.ts:65-69`); partial and keyword-rung notes explain the
   arithmetic beside the headline. The test bans
   accuracy/truth/correctness/veracity/ground-truth wording and the
   "full-report coverage" label by regex (`offline-report.test.ts:15,
   27-30`).
10. **Golden set selection and byte stability** (reconstructed). The 12
    oracle-scored ids + the ladder scenario × 2 vote variants
    (`goldens.ts:168-191`) cover: both conflicts, a publication-gap day,
    the gulf incomparable lane, compound-partial, retention gap, quiet
    day, the window-rung-2 pin, the two zero-states, the register-#9
    vague claim, both ladder rungs through the REAL live-compatible
    adapter with committed fixture votes, and the five register-#8 M4
    headline-pinned scenarios; `cc-regen-after-instant-007` is included
    SPECIFICALLY so the golden-file prose audit has its input-presence
    precondition (the sentinel provably entered the run, and the committed
    bytes are proven clean of it — `goldens.ts:181-186`). Byte stability:
    results are canonicalized through the fail-closed Phase-1
    `stableStringify` (recursively sorted keys) then pretty-printed with a
    trailing newline (`goldenBytes`, `goldens.ts:225-227`), so equal
    results always produce identical bytes. The drift gate lives in
    `goldens.test.ts:38-50`: every run regenerates through the real
    pipeline and byte-compares against the committed file; deliberate
    re-baselining is the explicit operator step
    `UPDATE_CONFLICT_GOLDENS=1 npx vitest run src/lib/conflicts/goldens.test.ts`
    followed by a reviewed diff. (Note for the caller's records: the
    re-baseline env var is `UPDATE_CONFLICT_GOLDENS=1`, not
    `REGEN_GOLDENS=1`.) A second test pins run-to-run byte determinism.

## 4. Acceptance coverage (deferred fixture expectations now asserted)

The acceptance loop (`scorer-acceptance.test.ts`) drives EVERY corpus
scenario through the real pipeline (loader → P3 assemblies → oracle →
scorer) and asserts, per scenario:

- **`expected.corpusRecall` / `expected.publishedRetention` unit-verdict
  maps** — exact `toEqual` on both per-unit maps (lines 87-88); a closing
  pin verifies the frozen maps use only matched/miss/partial vocabulary and
  that all 41 scenarios were iterated (lines 298-312).
- **The five register-#8 M4 `expected.headline` pins** (clean 1/1,
  retention gap 1/1 vs 0/1, compound partial 0/1+diagnostic, gulf 0/1,
  ladder variants) — lines 101-112 — PLUS full-report arithmetic for EVERY
  scenario: denominator = all declared units, matched = matched-verdict
  count, both populations (lines 114-126). Ladder-variant headlines are
  additionally golden-pinned (`goldens.test.ts:109-119`).
- **`expected.contribution` blocks** — projected theaters/tracks equality
  plus "every contributing unit is verdict-matched" (lines 129-142).
- **`expected.missDiagnostic` / `expected.laneDiagnostics`** — exact
  equality with `{}` defaults (lines 91-98); the gulf scenario's pair is
  also golden-pinned (`goldens.test.ts:100-106`).
- **`expected.independentSources`** — per-unit distinct non-mirror doc
  counts (lines 144-152).
- **`matcherFixture` ladder variants** — replayed through the REAL
  `LlmCompatibleMatcher` with the committed fixture votes:
  variant A (1 usable of 5) → label `llm`, voteRounds 1, full per-vote
  audit; variant B (0 usable of 5) → keyword rung, `keywordUnmatchable: 1`,
  full denominator; pinned `validVotes` recounted through the real parser
  (`match-contract.test.ts:195-248`) and scored end-to-end into the goldens.
- **`matcherFixture` vague-claim pin (register #9)** — table-level credited
  units [] + end-to-end zero credit (§3.2 above; lines 47-59, 239-256).
- **`expected.evaluationKinds` availability maps** — snapshot-anchored
  kinds return the honest `no_proven_snapshot` unavailable variant with NO
  headline (lines 198-218, 283-295); the three terminal states stay
  distinct (unavailable / 0-over-empty / 0-over-nonempty, lines 221-237).
- **`expected.eligibleCount`, `expected.windowEndSource`,
  `expected.hedgePreservation`** — flow into the selection stamp, the
  window stamp, and the agreement rows' unstrengthened hedges (lines
  155-185; hedge preservation re-proven in
  `scorer-legal-audit.test.ts:84-95`).

Fail-closed behavior against MISBEHAVING matchers (out-of-population
rescue, undeclared units, duplicate pairs, partial-on-atomic, non-oracle
full-compound, oracle/ladder label mixing, half-unavailable population
pairs, gap/report cross-wiring) is exercised with synthetic adapters in
`scorer.test.ts`. The legal audit (`scorer-legal-audit.test.ts`) scores ALL
41 scenarios plus both ladder variants and asserts the sentinel (proven
present in inputs first), every unit text, every 6-word unit fragment
(stride 3), and every claim text absent from every serialized result AND
every offline report; the same audit runs against the committed golden
bytes (`goldens.test.ts:122-150`).

## 5. Gates (exact, on the committed tree `3e3064d`)

| Gate | Result |
|---|---|
| typecheck | clean |
| lint | clean |
| unit (`npm test`) | **3,027 passed / 3,027 (213 files)** |
| conflicts package, east of UTC (`TZ=Asia/Tokyo npx vitest run src/lib/conflicts/`) | **625 passed / 625 (28 files)** |
| diff scope | confined to `src/lib/conflicts/` + `fixtures/conflicts/` (+ this report); freeze list untouched |
| standalone build | the implementation commit `38a1afb` builds standalone |
| golden regeneration proof | coordinator-run: the golden file was regenerated (`UPDATE_CONFLICT_GOLDENS=1`) and then byte-verified WITHOUT the regen flag — the committed bytes are exactly what the pipeline reproduces |
| clean diff / tree | `git diff --check` clean; tree clean |

Zero paid provider calls (structurally impossible in this phase), zero
production writes, no migration, no env change, no deploy, no push —
branch/worktree only. Integration suite not run: Phase 4 touches no itest
surface (pure modules + unit tests only).

## 6. Residual risks, addressed to the Gate-4 attack charter

Derived from the closeout session's code reading; each item states what the
code does and what a reviewer should still probe.

- **Denominator gaming.** The code: denominator = the request's unit list
  length; `assertMatchableUnits` enforces shape (ordinals = positions,
  unique ids) and lane ids fail closed against the frozen taxonomy; lane
  rows PARTITION the units (sums pinned equal to the denominator); the
  keyword rung keeps the full denominator with `keywordUnmatchable`
  disclosed; no subset score exists anywhere in the result. STILL PROBE:
  the scorer TRUSTS the caller-supplied unit list — in fixture runs it is
  derived from the frozen corpus, but the future real wiring (the
  Key-Takeaways parser output) is the actual denominator authority, and
  nothing in Phase 4 can detect a unit dropped BEFORE the request is
  built. The unit-extraction seam is the place to attack in the
  integration phase.
- **Double credit.** The code: one matched unit counts once regardless of
  pair count; duplicate pairs refused; contribution counts distinct units
  per bucket and is declared non-additive; partial earns nothing;
  multi-unit claims are surfaced in `multiUnitClaims`. STILL PROBE:
  (1) multi-unit pairing by a LIVE adapter is visible but not refused —
  §6.3 permits it when each pairing is independently equivalent, and only
  the oracle path is corpus-pinned; before any live run, decide whether a
  multi-unit pair above some count should require review. (2) The
  vague-claim pin binds the ORACLE table; a keyword-rung replay of
  cc-vague-claim-019 is not separately pinned (the vague claim would need
  to beat the 0.6 signature threshold on BOTH units to over-credit —
  worth an explicit probe). (3) The timing medians are computed per
  agreement PAIR, not per distinct claim (`scorer.ts:194-221` over
  `allPairClaims` pushed inside the agreement map at `scorer.ts:262-264`),
  so a claim matched to two units weighs twice in the lead median — a
  diagnostic-only skew, but worth confirming it is acceptable.
- **False cross-theater agreement.** The code: theater credit comes from
  the claim records the P3 eligibility engine admitted (roster/classifier/
  scope-gated); mirrors are excluded from populations (`mirror_only`),
  from independent-source counts, and from contribution sources; the
  out-of-population refusal blocks rescue matches from any theater.
  STILL PROBE: the keyword rung has NO actor/direction/status
  compatibility test — a same-toponym+action claim admitted from another
  contributor theater could cross-credit under `keyword`; the label
  discloses the rung, but Phase 6 must render keyword-rung results as
  degraded, and a reviewer should try recurring-template shapes
  (roca-recurring-template-007 is oracle-pinned empty but has no
  keyword-rung replay). **NARROWED at the Gate-4 remediation (science
  MINOR-2, reviewer-proven toponym-ONLY false agreement at score 0.625):
  the conflict keyword rung now also requires ≥1 shared canonical action
  class (conflict rung only; production keywords.ts untouched; zero golden
  or acceptance drift). Same-toponym SAME-action cross-credit remains the
  residual keyword-rung exposure. The vague-claim keyword replay is now
  pinned too (cc-vague-claim-019 → 0/2, claim 9401 credits nothing;
  gazetteer-scope-dependent, noted in the test).**
- **Missing-data inflation.** The code: unavailable results carry NO
  headline (never 0/0) and require BOTH assemblies to agree on the
  availability verdict and reason (`scorer.ts:376-420`); a gap carries no
  report identity at all; incomparable-coverage units stay in the
  denominator as MISSES (deflationary, register #8 H1); the three
  zero-ish states are distinct and pinned; timing medians return null
  rather than 0 when instants are unknown. STILL PROBE: the
  `missDiagnostic` sub-label depends on the P3 lane diagnostic, which is
  suppressed when a lane holds ANY comparable included record — an
  incomparable-class unit in a mixed lane misses WITHOUT the sub-label
  (honest arithmetic, reduced explanation); and `keywordUnmatchable` is
  identical across populations by construction
  (`scorer.ts:759-772`) — verify the claim that it is unit-only holds if
  the keyword matcher ever gains claim-dependent signal extraction.
- **Compound-takeaway over-credit.** The code: partial counts as a MISS in
  the headline; full-compound coverage is accepted from the oracle table
  ONLY and refused from every other kind; contribution excludes partial
  units; the offline report explains the diagnostic beside the headline.
  STILL PROBE: (1) the oracle table is human-committed — a reviewer
  should re-read the compound entries (`roca-compound-partial-009b` is
  the only compound pair today) against the scenario notes; (2) the
  headline `partialDiagnostic` is the UNION of distinct partial units
  across BOTH populations (`scorer.ts:482-486`) — one number beside two
  ratios; confirm Phase 6 renders it unambiguously (per-population partial
  counts are recoverable from the verdict maps and lane rows).
- **Reference-prose recovery.** The code: results carry unit identity as
  ids + structural metadata (lane, compound/negative flags, verdicts) and
  claim identity as ids + structural metadata — no unit text, no claim
  text (data minimization beyond production, which persists claim text
  elsewhere); the legal audit proves the sentinel present in inputs and
  absent from all 43 serialized results and offline reports; the
  committed golden bytes get the same audit; hedges are the claims' own.
  STILL PROBE: (1) ~~the fragment scan slides in 6-word windows at STRIDE
  3~~ — **PROVEN AND CLOSED at the Gate-4 remediation** (legal MINOR-1: the
  reviewer demonstrated an unaligned 6-word leak evading the stride-3 walk
  on the real corpus; both audits now slide at step 1, the fragment scan
  also runs against the offline-report string, and claim texts get their
  own fragment scan on every surface incl. the committed golden bytes);
  (2) `editionKey`/`reportDate`/`gapDate` are identity strings — the P3
  identity validator refuses prose-bearing keys for current-normVersion
  records, but a reviewer should confirm the refusal covers every path
  that can reach a persisted result. **Gate-4 addition (legal MINOR-2):
  the raw window anchors (`window.cutoffAtRaw/publishedAtRaw`) were an
  ungated free-text channel; the persistence gate now requires
  null / a valid explicit-timezone ISO instant / a bounded short token
  (≤64 chars, single line, no multiple spaces, no ". " — documented in
  `isPersistableRawAnchor`), the legal audit scans them as an explicit
  surface, and `reference-report.ts` carries the Phase-5 stored-error
  obligation comment for its raw-anchor error messages.**
- **Stamp-integrity probes found while writing this report** (not charter
  categories, recorded for Gate 4): (1) when ALL rounds of a k=5
  live-compatible run are unusable, the keyword fallback's outcome carries
  `votesK: null` — the REQUESTED vote budget is lost, the matcher stamp
  records `votesK: null`, and `runGroupKey` ends `|llm-compatible|k=0`
  (verified in the committed golden
  `cc-matcher-failclosed-013b#B-zero-valid-rounds`), so a fully-degraded
  k=5 run groups with a hypothetical k=0 configuration; the per-population
  labels disclose the rung. **BINDING Phase-5 obligation (Gate-4 science
  NOTE-3): if variance analysis groups on `runGroupKey`, carry the
  REQUESTED k through the keyword-fallback path first.** (2) In a
  mixed-rung result the stamp's single `votesK`/`model` come from the llm
  side while the top-level label is the more degraded rung — **CLOSED for
  the offline report at the Gate-4 remediation (legal MINOR-3): a
  mixed-rung render now shows BOTH per-population labels explicitly and
  can never read as "keyword with k=5"; any OTHER future aggregation must
  still read the per-population sub-stamps.**
- **Phase-6 rendering obligations (Gate-4 science NOTEs 2/4, recorded as
  binding):** (a) per-population PARTIAL counts must be rendered (the
  headline `partialDiagnostic` is the cross-population union; the
  per-population counts are recoverable from the verdict maps and lane
  rows and must not be presented as one number without saying so);
  (b) the timing medians are pair-weighted (a claim matched to two units
  weighs twice) — any Phase-6 rendering of information-lead medians must
  document that weighting beside the number.

## 7. Provenance note

The Phase-4 implementation was authored across two sessions interrupted by
session limits. The coordinator committed the final tree (`6a88edf`,
`38a1afb`, `3e3064d`), authored the goldens drift-gate test
(`goldens.test.ts`), and ran the golden regeneration/byte-verification
proof. This report was then written by the closeout session by reading the
committed code, tests, fixtures, and goldens in full; the judgment calls in
§3 are RECONSTRUCTED from the code (each with file:line evidence), not
transcribed from the original author's working notes. Where the code and
any earlier session narrative might disagree, the code as committed at
`3e3064d` is authoritative.

## 8. Closeout addendum (final tree; supersedes §5's numbers)

Two hardening commits landed after `3e3064d`, from the concurrent closeout
audit; this addendum records them and the final-tree gates. Two closeout
sessions raced on this branch and each wrote its own version of this
report; the intermediate report commits were consolidated (and finally
squashed) into the ONE report commit that carries this file, restoring
this detailed record and adding the present addendum, so no content from
either version is lost. The shorter text's unique material was its takeover audit
disposition, reproduced here: every §12 result-contract item, matching
requirement, and P3 §5.1 stamp was found DONE in the inherited tree and is
test-pinned; found MISSING and completed — the committed golden file +
drift gate (the inherited tree had `goldens.ts` and a README promise but no
committed goldens and no test), the adapter purity test, and the
no-composite structural pin; found PARTIAL and strengthened — the golden
matrix pins and the golden-file prose audit.

- **`3d10068` — golden-gate hardening.** `cc-regen-after-instant-007` joins
  the golden set (so the golden-file prose audit has its input-presence
  precondition — the sentinel provably enters the scored inputs and the
  committed bytes are proven clean of it), the golden file is regenerated
  (now 14 keys; the diff against `3e3064d` is ONLY the added entry —
  shared entries were byte-identical across two independent generations in
  two sessions, direct evidence for the determinism claim), and
  `goldens.test.ts` is replaced by the stronger gate: exact golden key-set
  equality, both conflicts asserted from the results, the five
  register-#8 headline-pinned scenarios covered, gulf
  missDiagnostic/laneDiagnostics golden-pinned, honest ladder rung labels
  on both vote variants with full-denominator keyword arithmetic, lane +
  contribution totals on every scored entry, and the committed-bytes prose
  audit. The re-baseline env var is `UPDATE_CONFLICT_GOLDENS=1` (also now
  documented in `fixtures/conflicts/README.md`).
- **`10fbaf3` — purity + no-composite pins.**
  `matcher-import-hygiene.test.ts` source-scans every Phase-4 module (no
  `process.env`, no provider-SDK import, no spend-machinery import, no
  `require(`, no `fetch(`) and imports + exercises the live-compatible
  adapter under a fully blanked environment (a full k=5 match resolves from
  injected votes alone) — the header's "import-safe with blanked env" claim
  is now test-pinned, not just stated. `scorer-legal-audit.test.ts` gains a
  key-name sweep over every serialized result and offline report refusing
  any field named like a blended quality number
  (`score|grade|rating|composite|overall`) — the §6.4 no-composite-score
  rule is structural.

Final gates (on the consolidated tree):

| Gate | Result |
|---|---|
| typecheck (`npx tsc --noEmit`) | clean |
| lint (`npm run lint`) | clean (0 problems) |
| unit (`npm test`) | **3,039 passed / 3,039 (214 files)** |
| conflicts, east of UTC (`TZ=Asia/Tokyo npx vitest run src/lib/conflicts/`) | **637 passed / 637 (29 files)** |
| clean diff / tree | `git diff --check` clean; tree clean |
| freeze boundary (`git diff 323013e..HEAD --stat`) | only `src/lib/conflicts/`, `fixtures/conflicts/` (additive scenario + goldens + README), `docs/reviews/` |

Zero paid provider calls, zero production writes, no migration, no env
change, no deploy, no push. Gate-4 reviewers should review
`6a88edf..HEAD` as one unit.

### Gate-4 remediation addendum (both reviewer rounds, this branch)

The legal/source-fidelity review returned PASS-WITH-MINORS and the
science/matcher review returned FAIL on `5b38007`; the science summary
otherwise found the arithmetic/verdict core verified-sound. Every finding
was remediated on this branch; goldens are BYTE-IDENTICAL throughout
(verified by the drift gate on every run — the anchor gate admits the
committed 26-char malformed token, the action-class gate changed no
committed expectation, and the zero-unit refusal touches no fixture).

- **Legal MINOR-1 (stride-3 evasion, proven)** — both prose audits slide at
  step 1; the fragment scan runs against the offline-report string; claim
  texts get their own fragment scan on every surface incl. the committed
  golden bytes.
- **Legal MINOR-2 (raw-anchor free-text channel)** — the persistence gate
  is the authority: `isPersistableRawAnchor` (null / ISO instant / bounded
  ≤64-char single-line token, heuristic documented) with typed
  `unpersistable_result` refusal; raw anchors added to the legal-audit
  scanned surfaces; Phase-5 stored-error obligation comment at the
  `reference-report.ts` raw-anchor error message.
- **Legal MINOR-3 (formatter)** — `formatConflictResultReport` refuses
  non-persistable scored input (no fabricated zeros); mixed-rung results
  render BOTH per-population matcher labels.
- **Legal NOTE-1** — the §0 non-independence caveat renders with headline
  coverage in the offline report (shipped early; Phase 6's own explainer
  obligation is unchanged and asserted as such in the test comment).
- **Science MAJOR-1 (0/0)** — `scoreConflictReport` refuses zero declared
  units ("a parse failure, not a benchmark observation") and the
  persistence gate refuses a zero denominator belt-and-braces.
- **Science MINOR-1 (thinSourced unpinned)** — the `<2` independent-doc
  boundary (2 is not thin, 1 is; mirrors add zero) and the hedge classes
  (claimed/unverified thin; confirmed/assessed not) are behaviorally
  pinned; the predicate itself matched the §6.4 contract as documented,
  so no code change. **Mutation-ledger disposition: this pin closes the
  science review's surviving M1 mutation** (a `<2`→`<1` mutation now
  fails these tests).
- **Science MINOR-2 (toponym-only false agreement, proven)** — the
  action-class compatibility gate LANDED (branch A): full suite + goldens
  byte-identical, so no revert was needed; the reviewer's exact probe is a
  named negative test.
- **Science MINOR-3 (duplicate vote entries)** — `pairsFromLlmMatches`
  dedupes keep-first (production llm-match parity); the schema-valid
  duplicate-pair vote now yields an llm-rung result with a single pair.
- **Science NOTE-1** — the vague-claim KEYWORD replay is pinned
  (cc-vague-claim-019 → 0/2 both populations; 9401 credits nothing).
- **Science NOTE-5** — the legal audit resolves scenarios by exact
  `#`-stripped id, not `startsWith`.
- **Science NOTEs-2/3/4** — recorded above in §6 as binding Phase-5/6
  obligations. **NOTE-6** — no change, as directed (the pinned-literal 0.6
  test design is load-bearing).

Remediation-round gates (exact): typecheck clean · lint clean ·
`npm test` **3,050 passed / 3,050 (214 files)** (baseline 3,039/214 + 11
new, zero regressions) · `TZ=Asia/Tokyo` conflicts **648 passed / 648
(29 files)** · `git diff --check` clean · tree clean · goldens
byte-identical.
