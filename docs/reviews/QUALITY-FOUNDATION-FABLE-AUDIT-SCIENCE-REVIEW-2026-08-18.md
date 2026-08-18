# QF Final Audit — Quality / Evaluation-Science Adversarial Review

- **Reviewer role:** fresh, independent quality/evaluation-science adversarial reviewer (final audit), no authoring context.
- **Model id / effort:** claude-fable-5 (verifiable from my own system context: "You are powered by the model named Fable 5. The exact model ID is claude-fable-5."). Effort: not directly visible in my system context; the spawn config states xhigh — I report the model id as verified and the effort as spawn-config-stated, not independently verifiable.
- **Review date:** 2026-08-18.
- **SHA reviewed (git rev-parse HEAD in my worktree):** `7150b494d1399dddada6e7f917b1c0e76114d458`
- **Base SHA:** `05fdd2c` (merge of origin/main `9c5e9cb` + reviewed routing tip `0e469f7`). Program diff `05fdd2c..7150b49`: 66 files, +20,727/−119.

## Process order statement

I wrote the initial attack plan below BEFORE reading any file under `docs/reviews/`, any
file in the evidence package (`/Users/go/code/bnow-net-audit-evidence-20260818`), or any
program-authored scorecard/README narrative. Order followed: (1) verified HEAD + clean
worktree, (2) read AGENTS.md/CLAUDE.md project instructions + the governing program
prompt (`docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md`, 760 lines, read
fully), (3) wrote this attack plan, (4) only then read code, tests, datasets, committed
artifacts, the program's own reports, and the evidence package.

## Initial attack plan (written before reading prior reports/evidence)

1. **asOf anchor dishonesty.** Legacy fixed-day digests may anchor asOf at wall clock
   (regeneration time) instead of the exclusive end of the analysis window; rolling runs
   may share one anchor with fixed runs. Check both engines reach one calculator with
   engine-correct anchors.
2. **Skew/future-timestamp inflation.** EVIDENCE_CLOCK_SKEW_MS may (a) clamp small-future
   ages to 0 silently, (b) treat beyond-skew future published_at as valid, or (c) drop the
   doc instead of falling back to fetched_at. Negative ages may enter percentile arrays.
3. **Denominator dishonesty.** evidenceWithin24hPct over all docs instead of timestamped
   docs; staleClaimsOver48hPct including unknown-age claims; null-vs-zero confusion on
   empty populations; timestampCoveragePct at documentCount=0.
4. **Percentile helper bugs.** Wrong interpolation/off-by-one at even counts and
   boundaries. Recompute 2–3+ pinned fixture values by hand.
5. **Pre-guard population leak.** Stats computed over model-proposed claims or before
   guardPublishedEvents; distinct-doc dedup failing; stub docs included.
6. **Boundary semantics.** within-24h inclusive, stale strictly >48h; lag negatives
   within/beyond skew; hunt off-by-one.
7. **Funnel version/mirror inflation.** Fake mutation tests; per-adapter conversion over
   the wrong corpus; false fan-out inequalities; dropped unknown reasons; silent repair
   instead of warnings; legacy coerced into map stages.
8. **Metric gaming.** Any funnel/recency metric improvable by dropping low-reliability
   sources, corroboration, or narrowing ingestion, without a counterbalancing stat.
9. **Timestamp anomalies in new code.** String-ordering comparisons, timezone-less Date
   parsing, future fetched_at, negative lag — anywhere in the diff.
10. **Corpus representativeness.** Every C2 category exercised by a real case id;
    multilingual ru/ua/ir coverage; partition arithmetic 56 = 18+14+10+14 and 38 dev / 18
    heldout; spot-read 10+ cases (fictional persons, no ISW prose, plausibility);
    mustNotMatch depth on heldout map cases.
11. **Leakage/circularity.** Prompt builders reading gold; sentinel test strength; heldout
    visible under --dev; heldout detail printed; --allow-heldout-rerun surfacing; any
    LLM-as-judge; gates.ts committed AFTER result artifacts (git log).
12. **Identity/resume holes.** --report gating only datasetContentHash while printing the
    rest; resume accepting changed config; --fresh re-rolls hiding prior attempts;
    aligned-pairwise fix on the wrong split or without baseline completeness/hash match.
13. **Variance theater.** requestedRepetitions=1 passing; no MIN_REPETITIONS; residual
    disclosure check.
14. **Missing-data laundering.** Completeness from the results file vs dataset;
    errors excluded from denominators; insufficient_data treated as pass; vacuous
    populations counted as pass.
15. **Scorer invalidity.** Reimplementation vs real production imports; empty/truncated/
    schema-invalid as partial credit; gist-jaccard orientation vs mustNotMatch precision.
16. **Aggregation gaming.** Micro/macro averaging; dev+heldout pooling; partition dilution;
    a mean hiding a catastrophic case.
17. **Preset-gates verification.** git log on gates.ts vs the commits adding result
    artifacts/scorecards.
18. **CLI honesty ($0 modes).** Run --validate-dataset/--estimate/--offline/--report in my
    worktree, verify zero provider/DB claims, restore with git checkout.

## Files and runtime paths inspected

- Worktree: `/Users/go/code/bnow-net-worktrees/qf-audit-reviewer-science-20260818` (detached at 7150b49; verified; clean before and after).
- Governing prompt: `/Users/go/code/bnow-net/docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md` (full).
- Full diffstat 05fdd2c..7150b49; full file reads of:
  - `src/lib/analysis/evidence-recency.ts` + `evidence-recency.test.ts` + `digest-asof.test.ts`
  - `src/lib/analysis/digest-persist.ts` + `digest-persist.test.ts` diff; `digest.ts` + `synthesize.ts` diffs; `synthesize.ts:505-640` (window/asOf derivation)
  - `src/lib/analysis/quality-funnel.ts` + `quality-funnel.test.ts`; `scripts/quality-funnel-report.ts`
  - `src/lib/evals/contracts.ts`, `runner.ts`, `gates.ts`, `score-map.ts`, `score-reduce.ts`, `score-validation.ts`, `evidence-recency-summary.ts`, `isolation.test.ts`, `runner.test.ts` (leakage/resume sections), `live-runner.ts` (dispatch/scoring sections)
  - `scripts/analysis-eval.ts` (full)
  - `src/lib/validation/llm-match.ts` diff (export refactor + sanitizeMatches extraction)
  - `src/lib/analysis/map-worker.ts` (candidate predicate), `map-lease.ts` (timestamp handling), `scripts/map-remap.ts` (date handling)
  - Datasets: `docs/evals/analysis/{map,reduce,digest,validation}-v1.json` (counts/splits/languages programmatically; 18 cases spot-read in full: map-typ-001, map-typ-006, map-edge-005, map-edge-007, map-adv-002, map-adv-005, red-typ-005, red-adv-001, red-adv-003, red-rec-002, dig-typ-002, dig-adv-001, dig-adv-002 (incl. its 5 fixture votes), val-typ-001, val-edge-001, val-edge-002, val-edge-003, val-adv-001)
  - `docs/evals/analysis/README.md`, `ANALYSIS-EVAL-SCORECARD.md` (committed), results/*.json (via regeneration diff)
  - After attack plan: `docs/reviews/EVIDENCE-QUALITY-OBSERVABILITY-2026-08-17.md` (§4 caveats, §5 deviations), `ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md` (§9 checklist, remediation sections), `QUALITY-FOUNDATION-INTEGRATION-2026-08-17.md` (§12 review table, §13 residuals, §14 PR decomposition), AGENTS.md program diff
  - Evidence package: README.md, `gap-audit__quality-foundation-program__*.md`, `qf-reviewers-recovered-20260818/` (README + prior final-quality-science reviewer's final message extracted from its transcript).

## Commands run with results

1. `git rev-parse HEAD` → `7150b494d1399dddada6e7f917b1c0e76114d458`; `git status --porcelain` → empty (clean).
2. `git diff --stat 05fdd2c..7150b49` → 66 files, +20,727/−119.
3. `git log 05fdd2c..7150b49 -- src/lib/evals/gates.ts` → df86ce8 (08-17 04:49), be1071c (05:20), 4f1d36d (05:31). First offline artifacts: c78ea01 (04:50); regenerated with every scoring change; final regeneration ba35082 is the last eval commit before docs closeout. No live/candidate results exist anywhere in the program ($0), so gates preceded all candidate results trivially; gate refinements are pre-registered in the file header and match commit history.
4. `npm install --no-audit --no-fund` → 778 packages.
5. `npx vitest run` on evidence-recency, digest-asof, digest-persist, quality-funnel tests → 72/72 pass. `npx vitest run src/lib/evals` → 106/106 pass (8 files).
6. `npx tsx scripts/analysis-eval.ts --validate-dataset` → all 4 datasets OK; heldout coverage map 1/2/2, reduce 1/1/3, digest 1/1/1, validation 1/3/1; "No DB, no provider, nothing written."
7. `npx tsx scripts/analysis-eval.ts --estimate --repetitions 3` → $0.2282 grand total; "no DB connection, no client construction, no LLM calls, nothing written."
8. `npx tsx scripts/analysis-eval.ts --offline --fresh` then `--report` → zero machinery mismatches; verdicts map=fail (by-design machinery proof), reduce/digest/validation=insufficient_data. **git diff vs committed artifacts: only `updatedAt`/`generatedAt` timestamp lines differ — the committed artifacts regenerate byte-identically under the final tip code.** Restored with `git checkout -- docs/evals/analysis package-lock.json`.
9. `npm test` (full suite at 7150b49) → **2,402/2,402 pass, 185 files** — exactly matches the integration report's claimed count.
10. `perl -ne 'print if /\x00/' src/lib/analysis/digest-persist.ts` → NUL byte found at line 286 (verifying the gap audit's G2 against the report's "zero NUL bytes in changed .ts files" claim at QUALITY-FOUNDATION-INTEGRATION §11 line 254).
11. `git diff --stat e5757ea..7150b49` → docs-only (.env.example, AGENTS.md, integration report) — the delta between the prior final reviews' SHA and this tip contains no runtime code.
12. Hand recomputations (no tooling): percentile pins 9.1 (p90 of 1..10), 2.5 (p50 of 1..4), 50.5 (median of [100,1]), 1.8 (p90 of [2,0]), 2/2/10 duplicate-population pins — all correct under rank=p/100·(n−1) linear interpolation. red-rec-002 full recomputation: ages [972h, 4h, 1h] → median 4 ✓, p90 = 4+0.8·968 = 778.4 ✓, within24 = 2/3 = 66.67 ✓, coverage 75 ✓, published/fetched/missing/future = 2/1/1/1 ✓, lags [970] with 2 invalid (−1h, −13h < −5min skew) ✓, zone-less doc 514 → missing ✓ (via the summary adapter's explicit-timezone guard).
13. Final: `git status --porcelain` → empty. **Worktree left clean.**

## Findings by severity

### BLOCKER

None.

### HIGH (MAJOR)

None.

### MEDIUM

None. (The three substantive evaluation-science holes below are MINOR because each is
already self-disclosed in the integration report's §13 residuals with a binding
"close before the FIRST paid evaluation whose verdict will be treated as binding"
condition, no paid evaluation ran or can run without separate operator authorization,
and the gates that exist fail in the safe direction meanwhile.)

### MINOR

**MINOR-1 — No preset MIN_REPETITIONS; a stochastic candidate at requestedRepetitions=1
can reach a full pass verdict; full-`--fresh` re-rolls are invisible.**
`src/lib/evals/gates.ts` contains no repetitions minimum (checked lines 21–48; the only
minima are heldout coverage). `computeScorecardVerdict` (gates.ts:190-297) passes a
complete scope-"full" single-repetition file. The paid-eval checklist
(`docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md` §9.3, "--repetitions >= 3 for
variance") is process, not preset code. Compounding: `scripts/analysis-eval.ts:487`
(`rf = (opts.fresh ? null : existing) ?? emptyEvalResultsFile(header)`) discards the
prior file on `--fresh`, so a completed fresh sweep carries a single runId — the
`runs.mixedRun` provenance indicator (runner.ts:781-783, 818) catches partial `--only`
re-rolls but NOT repeated whole-file fresh sweeps run until heldout luck lands.
Failure scenario: a marginal stochastic candidate is fresh-swept N times; the surviving
file shows one runId, complete coverage, rep=1, and can pass with zero variance evidence.
Disposition: **disclosed** verbatim in QUALITY-FOUNDATION-INTEGRATION §13 residuals
("a preset MIN_REPETITIONS constant in gates.ts … plus full-`--fresh` re-roll
visibility") as a close-before-binding-eval item; also found by the prior final science
review (its MINOR-3). Honest, but should be a one-constant fix in exactly the file whose
header says thresholds are pre-registered — I concur with the residual's closure condition.

**MINOR-2 — `--report` verdicts degrade only on datasetContentHash drift; promptHash /
schemaVersion / extractorVersion / envKnobs are printed but never recomputed against the
current tree.** `runner.ts buildWorkloadScorecard` (lines 879-931) takes only
`currentDatasetContentHash`; `scripts/analysis-eval.ts modeReport` (343-410) passes only
the dataset hash. Resume refuses on full identity drift (`resumeIdentityMismatch`,
runner.ts:364-387) but report does not. Failure scenario: a live candidate passes; the
map system prompt or an extractor version is then edited (dataset bytes unchanged); a
later `--report` still renders PASS + `proposedRegistryEntry` for a configuration that no
longer exists in the tree. The identity line prints the recorded hashes so it is
traceable by a careful reader, but the same argument already justified the dataset-hash
gate. Disposition: **disclosed** in §13 residuals ("`--report` should also recompute
promptHash/schema/extractor/envKnobs identity against the current tree"); prior science
review MINOR-2. Concur with the residual.

**MINOR-3 — Fidelity-pin depth on the gated (heldout) split is zero for map, and
precision instrumentation of the C2 "number preservation" category is absent.**
Measured from `docs/evals/analysis/map-v1.json`: all 5 heldout map cases carry 0
`mustNotMatch` and (except map-adv-005's 1 attribution `mustMatch` and map-adv-002's 1
injection pattern) no fidelity pins; the documented gist-leniency compensator ("Gist
matching is recall-oriented — mustNotMatch carries precision", README.md §"Gist
matching") rests on a single development-split case (map-edge-007). A location/identity
swap that keeps ≥0.5 token-jaccard counts as *matched*, inflating BOTH gated
aligned-heldout metrics (recallMean AND precisionMean, `score-map.ts:167-204`); the hard
fidelity gate (MAX_FIDELITY_FAILURES=0 over all splits) still binds via dev cases, but
those are exactly the cases visible to prompt iteration. Additionally, no map case pins
numerals: map-typ-006's gist carries "four drones" only as one jaccard token, so a
candidate reporting "five drones" scores a full match — the prompt's C2 map list names
"number preservation" explicitly and it has no dedicated falsifiable instrument in v1
(dates are structural — claim_date comes from the doc's day, not model output — so date
preservation is legitimately out of model reach; numbers are not). Same family applies
more weakly to digest: live runs score `candidateInvariantOnly` (score-reduce.ts:247-253)
where only 1 of 3 heldout digest cases (dig-adv-002) carries mustNotMatch pins.
Disposition: the map half is **disclosed** in §13 residuals ("heldout map cases need
mustNotMatch fidelity pins"); prior science review MINOR-4. The number-preservation gap
and the digest-live thinness are my additions to the same residual family — recommend
folding both into the same close-before-binding-eval item.

**MINOR-4 — One factually false gate claim in the integration report (independently
verified).** `docs/reviews/QUALITY-FOUNDATION-INTEGRATION-2026-08-17.md:254` asserts
"zero NUL bytes in changed .ts files"; `src/lib/analysis/digest-persist.ts:286`
(`entityCacheKey`, a file this program changed by +53 lines) carries a literal 0x00
separator — verified with a perl byte scan in my worktree. The byte is pre-existing on
origin/main and functionally harmless (a working cache-key separator; the program fixed
the identical pattern in map-worker.ts in c40060e), but the scan claim as written is
false, and it sits in a gate table whose value is precisely its factual reliability.
First surfaced by the evidence package's gap audit (G2); I re-verified rather than
trusting it. Fix is a one-line report correction (scope the claim to
"no NUL bytes introduced" or fix the byte like c40060e did).

**MINOR-5 — The recorded final review PASS verdicts bind e5757ea, not the tip.** Both
prior final reviews returned PASS-WITH-MINORS on `e5757ea`; the branch tip under audit is
`7150b49` (delta verified docs-only: .env.example, AGENTS.md, the report — no runtime
file). The report discloses this, and this audit closes the gap by issuing a verdict on
the exact tip, but strictly the prompt's "A final PASS applies only to the exact final
integration SHA" was not literally satisfied by the program itself (gap audit G3).

### NOTE

- **N1 — Legacy intraday asOf inflation (deliberate, disclosed twice).** A legacy digest
  regenerated mid-day anchors asOf at its fixed UTC-window END (`digest.ts:224-228`), so
  evidence ages are INFLATED relative to the run instant and `generationLagHours` clamps
  to 0 until the window closes. Direction is conservative (freshness reads worse, never
  better) and it is disclosed in EVIDENCE-QUALITY-OBSERVABILITY §4 and repeated in
  `scripts/quality-funnel-report.ts`'s how-to-read block with an explicit
  do-not-compare-head-to-head warning. No action needed.
- **N2 — Funnel "will NEVER map" notApplicable label overstates** (a lexicon change +
  remap could map it); disclosed residual wording nit (§13); appears in
  `quality-funnel.ts` comments and the HOW_TO_READ block.
- **N3 — Mirror doc_claims rows are silently skipped in `aggregateCorpus`
  (quality-funnel.ts:366 `continue`) without their own warning**, whereas mirror
  doc_map_state rows warn (line 356-360). In practice claims co-occur with a state row so
  the warning fires anyway; cosmetic asymmetry.
- **N4 — `aggregateDigest` reconciles `evidenceRecency.claimCount` against relational
  claims but not `evidenceRecency.documentCount` against relational citedDocs** — a cheap
  extra invariant that would catch a stub-exclusion asymmetry regression between the
  persist-time read and the citation-link read.
- **N5 — `--report` baseline discovery** (`scripts/analysis-eval.ts:356`,
  `loadResults(w, ANALYSIS_DEFAULT_MODEL)`) misses a baseline file recorded under
  `model@effort`. Fail-safe (missing baseline → insufficient_data, never a pass), but an
  operator could be confused about why the pairwise gate did not run.
- **N6 — `buildDigestVotePrompt` feeds ALL ranked groups** without production's
  `slice(0, reduceGroupsFed())` (runner.ts:126-139). Identical for v1 fixture sizes
  (documented "fixtures are far below reduceGroupsFed()"), would diverge from production
  prompts only for oversized future cases; `reduceGroupsFed` is also absent from
  EvalEnvKnobs for the same reason.
- **N7 — Cross-theater must-not-merge has no reduce eval case** — structurally excluded
  because the reduce input contract mirrors the production loader ("the dataset never
  mixes theaters in one case", contracts.ts:120-126); the production guarantee lives in
  `loadReduceClaims`' theater filter, outside the eval's reach. Validation-side theater
  filtering IS covered (val-edge-004, classifyTakeawayTheater probes).
- **N8 — Offline validation fixtures bypass `sanitizeMatches`** (live path applies it,
  live-runner.ts:393; offline `input.llmMatches` go straight to
  `scoreDigestWithMatches`). val-adv-001-fake-claimid proves the downstream identity
  check fail-closes anyway, so no dishonesty results.

## Categories explicitly checked with NO finding

1. **asOf anchors** — legacy = exclusive end of the fixed UTC gather day (matches stage
   1's `< $2::date + interval '1 day'` predicate, digest.ts:94-95/224-228); mapreduce day
   = window-end midnight (`to` = dayAfter, synthesize.ts:601-624), same instant as the
   ranking clock; rolling = injected/run clock. All three test-pinned (digest-asof.test.ts).
2. **Skew handling** — 5-minute EVIDENCE_CLOCK_SKEW_MS applied uniformly (cutoff and lag);
   within-skew future clamps to age 0 without anomaly count; beyond-skew increments
   futurePublishedTimestampCount and falls back to fetched under the same cutoff; no
   negative age can enter a percentile array (`Math.max(0, …)` at evidence-recency.ts:153).
3. **Published/fetched fallback + every v1 denominator** — re-derived independently from
   evidence-recency.ts:107-214 against the contract comments: timestampCoveragePct
   (null at 0 docs), evidenceWithin24hPct (denominator = usable timestamped docs, null
   when none), staleClaimsOver48hPct (denominator = claims with ≥1 usable timestamp, null
   when none), unknownAgeClaimPct (claimCount denominator, 0 at 0 claims). All honest.
4. **48h strictly-greater / 24h inclusive** — code `> 48 * HOUR_MS` and `<= 24 * HOUR_MS`;
   exact-boundary tests present (48h not stale, 48h+1ms stale; 24h in, 24h+1ms out).
5. **Percentile helper** — hand-recomputed five pinned values plus the dataset pin 778.4;
   empty/one/odd/even/duplicate/boundary all tested; single linear-interpolation method.
6. **Ingestion-lag validity** — asOf-independent; [−skew, 0) clamps to 0 and counts;
   < −skew excluded and counted invalid; missing-either-timestamp counted in neither.
7. **Post-publication-guard population, distinct-doc dedup, stub exclusion** — computed in
   persistDigest AFTER guardPublishedEvents and AFTER the overwrite verdict; docs read
   with `content NOT LIKE '[STUB FIXTURE]%'`; Map-keyed doc dedup + per-claim Set dedup;
   all test-pinned including the dropped-claim's-doc-leaves-the-population case.
8. **Both-engine equivalence + regeneration stability** — one calculator at the one shared
   persist boundary; regeneration test pins that only generatedAt/generationLagHours move.
9. **Funnel stage/unit honesty** — every count's unit documented (docs/claims/groups/
   events/links); no false monotone inequalities (fan-out documented); the three asserted
   invariants (docsWithClaims ≤ mapDispositions, mapClaims ≥ docsWithClaims,
   gid chain gidsMajority ≤ gidsCitedAnyVote ≤ groupsFed) genuinely hold by construction.
10. **Superseded-version and mirror exclusion; mutation tests** — the tests are REAL:
    fixtures include a current-version state row on a mirror and superseded rows on
    canonicals that WOULD inflate mapDispositions/mapClaims if unfiltered
    (quality-funnel.test.ts:72-114, 484-525, end-to-end through loadQualityFunnel with
    driver-realistic string ids); the pending/notApplicable mutation test fails both
    assertions under either uniform mutation.
11. **Reconciliation = warnings, never silent repair; unknown reasons preserved** —
    mirror-state anomaly, superseded-only, claim-count reconciliation, out-of-window
    citations, unrecognized dedup method and window mode all warn/record with raw labels.
12. **Legacy separation** — engine detection requires `stats.engine === "mapreduce"`;
    legacy digests report their own stages, never map stages; pre-hardening dispatch
    labeled explicitly.
13. **Per-adapter conversion denominators** — docConversionPct against the report-date
    eligible corpus only, labeled; cited-only adapters get null, not fabricated rates;
    linkSharePct null at zero links; funnel predicate matches the map worker's own
    candidate query (same COALESCE ::date bucket, epoch, length, stub filter).
14. **Metric gaming** — no composite or public score anywhere; recency/funnel are
    operator observability with warnings; eval hard gates (traceability, fidelity,
    injection, certainty, guard, reproducibility, schema, provider-error, metering) mean
    resource savings or corroboration-dropping cannot purchase a pass.
15. **Timestamp anomalies in new code** — none: lease expiry compares
    `(state->>'expiresAt')::timestamptz <= now()` in-database; remap uses utcDayRange;
    the eval recency adapter nulls zone-less strings BEFORE the canonical calculator
    (machine-independent verdicts); YYYY-MM-DD string comparisons (funnel window check)
    are order-safe by construction; timezone-offset parsing test-pinned.
16. **Corpus arithmetic + representativeness** — 56 = 18+14+10+14 ✓; 38 dev / 18 heldout ✓;
    each partition has ≥1 heldout case per workload ✓ (validate-dataset output);
    languages en/ru/uk/fa/ar across theaters ua/ru/ir ✓; every C2 category traced to a
    real case id (map: under-fill/wrong-docid/truncation/malformed/hedge-strengthen/
    location/injection×2/template/fabricated-quote/translation-strengthening/quiet-doc/
    multilingual; reduce: merge/split/day-gate/in-doc dupes/single-doc/mixed-type/mirror-
    corroboration/fresh-lowrel/namesakes/unknown-domains/meta/version-dupe/recency×2;
    digest: consensus/majority-death/gid-fill/out-of-set-gids/attributed-pass/vote-
    collapse/repro/trailing-attribution/R1-wash/prose-wash; validation:
    agreement/isw-only/ours-only/mixed/same-place-diff-action/multilingual-paraphrase/
    negation/theater/majority×2/at-publish×2/fake-claimid/thin-and-hedge) — sole depth
    exception recorded as MINOR-3 (numbers).
17. **Hand-authored honesty** — 18 cases spot-read in full: all persons fictional (Ramin
    Gholipour, Maksim Dorenko, Pavel Streshnev, Anton/Igor Velichko; fictional village
    Zaturyne; ZERAPH-DIRECTIVE marker), real toponyms only where the gazetteer requires,
    all snippets short synthetic prose, no ISW-shaped sentences; validator hard-caps
    lengths; a committed test asserts no snippet is long enough to be plausibly copied
    full text (contracts.test.ts:125).
18. **Leakage/circular grading** — sentinel test proves input-only prompt builders
    (sentinel in gists + mustMatch + mustNotMatch + notes; probed on map and validation;
    the digest builder consumes only `input` by type and construction); --dev excludes
    heldout entirely (scope "dev" → insufficient_data by construction); heldout per-case
    failure detail hidden by default with an explicit reveal flag, test-pinned including
    the ZERAPH non-leak; --only touching heldout refused without --allow-heldout-rerun
    and provenance-visible when allowed; NO model grader exists — humanLabels and
    graderJudgments are reserved null fields, and the isolation suite proves nothing
    outside live-runner can even reach the SDK.
19. **Gates preset before artifacts** — gates library (df86ce8, 04:49) precedes the first
    offline artifacts (c78ea01, 04:50); later gate refinements (be1071c, 4f1d36d,
    f45f05b) are review remediations pre-registered while zero candidate results existed
    anywhere ($0 program — live results are also gitignored, so none can be committed);
    artifacts were regenerated after every scoring change and the final committed
    artifacts regenerate byte-identically (modulo timestamps) under the tip code — no
    stale-artifact/final-code divergence.
20. **Identity/resume** — resumeIdentityMismatch covers workload/configKey/dataset
    version+contentHash/repetitions/model/effort/provider/approval/registryVersion/
    promptHash/schemaVersion/extractorVersion/envKnobs; merge throws on drift preserving
    the existing header verbatim; scope merge rules (subset preserves, full completes,
    dev never upgrades) are sound; aligned pairwise = present-key intersection restricted
    to heldout, requiring a COMPLETE baseline over the SAME datasetContentHash, with
    NaN/missing metrics → insufficient_data, never pass.
21. **Missing-data honesty** — completeness computed from RESULTS against the dataset
    (dataset coverage cannot be borrowed); schema_invalid/provider_error are present-but-
    failing (and each independently hard-fails the verdict); skipped = missing work;
    vacuous precision/recall populations excluded from means with visible *VacuousCount
    keys; a missing case cannot silently leave a denominator because the verdict is
    blocked before quality is consulted.
22. **Scorer validity** — score-map/score-reduce/score-validation import and run the REAL
    production functions (parseMapResults, verifyQuote, claimTokens, firesAffirmatively,
    clusterClaims, rankGroups, parseVote, mergeVotes, finalizeEvents,
    guardPublishedEvents, scoreDigest, scoreDigestWithMatches, extractSignature,
    classifyTakeawayTheater, majorityFromVotes, sanitizeMatches — verified import-by-
    import); truncated/schema-invalid outputs score recall/precision 0 unless nothing was
    expected (m7, applied to early returns too); live digest pins the shipped K=5 and
    refuses otherwise; validation keyword-path disagreements are measured (metrics),
    match-set disagreements are judged (failures) — correctly oriented.
23. **Aggregation** — equal-weight result pooling with identical rep counts per case;
    per-split and per-partition slices rendered; hard gates are counts over ALL results
    so no mean can hide a catastrophic case; per-case detail table lists every
    (case, repetition) row; repetitionSpread reported when reps > 1.
24. **$0 CLI honesty** — all four modes run in my worktree; outputs match their
    no-DB/no-provider claims; isolation tests statically prove estimate/offline/report/
    validate cannot construct a client; worktree restored clean afterwards.
25. **Prior-review provenance cross-check** — the recovered reviewer transcripts in the
    evidence package record model=claude-fable-5 for all QF reviewers, verdicts matching
    the integration report §12 row-by-row; the prior final science review's four MINORs
    correspond exactly to my independent findings (MINOR-1/2/3 here) plus the AGENTS.md
    misfiling, which 7150b49 fixed (entry now correctly inside the Decision log section,
    branch-only, nothing pre-recorded as live).

## Verdict rationale

The evidence-recency contract, funnel denominators, and the evaluation control plane
survive independent re-derivation intact: every pinned number I recomputed by hand is
exact, every mutation test is genuinely discriminating, the committed artifacts
regenerate byte-identically under the tip code, the full suite passes at the claimed
count, and the leakage/preset-gate/missing-data machinery is real rather than
performative. All findings are MINOR or NOTE; the three substantive evaluation-science
holes (repetitions/fresh-re-roll, report-time identity staleness, heldout fidelity-pin
thinness) are self-disclosed residuals bound to a close-before-first-binding-paid-eval
condition, and no paid evaluation ran. The two report-integrity nits (false NUL-scan
claim; PASS verdicts bound to e5757ea rather than the tip) are factual but harmless to
every metric and verdict, and this audit itself now binds a verdict to the exact tip.

VERDICT: PASS-WITH-MINORS (on 7150b494d1399dddada6e7f917b1c0e76114d458)
