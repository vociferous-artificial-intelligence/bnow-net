# Analysis eval control plane — implementation report (2026-08-17)

Worktree C of the quality-foundation program. Branch
`codex/analysis-eval-control-plane-20260817` off `05fdd2c`. A repository-owned
evaluation control plane for the analysis workloads: MAP extraction, REDUCE
clustering, DIGEST synthesis, ISW-VALIDATION matching.

**Headline safety facts, stated plainly:**

- **NO paid model evaluation ran and NO candidate was evaluated in this
  program.** The live/paid runner mode is IMPLEMENTED but was NEVER EXECUTED —
  it is proven through mocked-SDK unit tests, static source guards, and
  estimate/offline runs only. Zero provider calls, zero DB connections, zero
  production writes, no env changes, no deploys.
- The design deliberately depends on **no hosted eval product**. The official
  OpenAI legacy Evals platform is scheduled read-only on 2026-10-31 and shut
  down on 2026-11-30 — verified 2026-08-17 against the live documentation at
  https://developers.openai.com/api/docs/guides/evals ("Evals will become
  read-only for existing users on October 31, 2026, and the platform is
  scheduled to shut down on November 30, 2026."). Everything here is
  checked-in JSON + deterministic TypeScript.

## 1. What was built

| Piece | Where |
|---|---|
| Contracts + hand-rolled validators (case/dataset/result/identity shapes; immutability + leakage rules) | `src/lib/evals/contracts.ts` |
| Map evaluator (real `parseMapResults` + `verifyQuote`; token-jaccard gold matching at exported `MAP_GIST_MATCH_THRESHOLD`; ruling-7 under-fill; ruling-16 strengthening; injection resistance; mustMatch/mustNotMatch with `firesAffirmatively` negation semantics) | `src/lib/evals/score-map.ts` |
| Reduce + digest evaluators (real `clusterClaims`/`rankGroups`/`parseVote`/`mergeVotes`/`finalizeEvents`/`guardPublishedEvents`; ruling-12 day gate; mirror-aware corroboration; ruling-18 K-majority; majority-gid fill; ruling-19 guard outcomes; byte-identical reproducibility) | `src/lib/evals/score-reduce.ts` |
| Evidence-recency probe (local structural mirror of the cross-worktree EvidenceRecencyStatsV1 shape; explicit-timezone-only parsing; negative-lag/future/missing accounting) | `src/lib/evals/evidence-recency-summary.ts` |
| Validation evaluator (real `scoreDigest`, `scoreDigestWithMatches`, `classifyTakeawayTheater`, `majorityFromVotes`, `computeAtPublish` via score outputs; both paths scored against human labels) | `src/lib/evals/score-validation.ts` |
| Preset gates + verdicts (written BEFORE any candidate result existed) | `src/lib/evals/gates.ts` |
| Pure runner parts (leak-safe prompt builders, identity hashing, estimate heuristics, (caseId, repetition) resume, aggregation, scorecard render) | `src/lib/evals/runner.ts` |
| Fail-closed live SpendGuard (`openai_eval` provider row) | `src/lib/evals/eval-guard.ts` |
| Live dispatch path (implemented, never executed; `evalDispatchConfig` registry bypass; metering invariants) | `src/lib/evals/live-runner.ts` |
| CLI (`--validate-dataset` / `--estimate` / `--offline` (default) / `--report` / `--execute-live`, plus `--fresh`/`--only`/`--dev`) | `scripts/analysis-eval.ts` |
| Datasets v1 (56 hand-authored cases) + committed offline results + sample baseline report | `docs/evals/analysis/` |
| Tests (8 new files, 86 new tests, plus the extended source scans in openai-client.test.ts) | `src/lib/evals/*.test.ts`, `src/lib/analysis/openai-client.test.ts` |

Two production files were touched, minimally:

- `src/lib/validation/llm-match.ts` — exported the exact production match
  prompt/schema (`MATCH_SYSTEM_PROMPT`, `MATCH_RESPONSE_SCHEMA`,
  `buildMatchUserPrompt`) and extracted the response sanitization as pure
  `sanitizeMatches()` (used by `llmMatchOnce` itself — behavior unchanged, its
  existing tests pass unmodified). Rationale: the eval must hash and dispatch
  the REAL prompt/schema, never a fork.
- `src/lib/analysis/openai-client.test.ts` — added `lib/evals/live-runner.ts`
  to the enumerated analysis dispatch modules (factory-only client
  construction, no bare `new OpenAI(`, no SDK value-import).

## 2. Dataset provenance

Every one of the 56 cases carries `provenance: "authored-2026-08-17"`: written
and hand-checked individually by this workstream (the numeric pins — coverage
percentages, timeliness medians, recency medians/p90s, guard-stat counts, gid
majorities — were computed by hand at authoring time and then confirmed by the
real pipeline functions in the offline run). Model-generated cases are
provisional by policy; v1 contains none.

Counts (partition / split detail in `docs/evals/analysis/README.md`): map 18,
reduce 14, digest 10, validation 14. Every C2 category has at least one case;
every partition of every workload has heldout coverage (the gates return
`insufficient_data` below the documented minimum: >= 1 heldout case per
partition and >= 3 total).

Cross-cutting adversarial coverage, by case id: prompt-injection with fake
schema fragments (`map-adv-001/002`), coordinated mirrors posing as
corroboration (`red-adv-001`), old article reposted under a fresh fetch
timestamp + negative-lag + future + timezone-less timestamps
(`red-rec-002`), recurring template on distant days (`map-adv-003`,
`red-typ-003`), fresh low-reliability vs older reliable source
(`red-adv-002`), translated text strengthening attribution (`map-adv-005`),
namesake collision (`red-adv-003`), disputed named-person allegation with
trailing non-governing attribution (`dig-adv-001`), confirmed subclaim beside
a disputed allegation — both the R1-drop wash (`dig-adv-002`) and the
kept-allegation prose wash (`dig-adv-003`), same place different action/date
(`red-typ-002`, `val-edge-001/003`), cross-theater misrouting
(`val-edge-004` theater probes; reduce input is single-theater by loader
contract — see §8), and superseded-extractor-version duplicates in one
population (`red-edge-003`, with the honest scope note in §8).

Legal/content rules (all held): no ISW prose anywhere — validation takeaways
are authored takeaway-style paraphrases; every named person/organization is
fictional; every source snippet (ru/uk/fa/ar included) is synthetic and short.

## 3. Leakage prevention

- The candidate prompt builders (`buildCandidatePrompt` and the three
  per-workload builders in `runner.ts`) take ONLY a case's `input`. Test-pinned
  in `runner.test.ts`: a case whose reference carries a sentinel string builds
  prompts that never contain it, while input content demonstrably flows.
- `split: "heldout"` cases are excluded from any `--dev` run (test-pinned);
  reports label heldout coverage; the README states the human discipline:
  never iterate prompts against heldout results.
- Live results never enter git (`docs/evals/analysis/results/live-*` is
  gitignored); `EvalCaseResult` stores only a sha256 `rawOutputDigest` of live
  output, never the text (test-pinned: the serialized live result does not
  contain the model text).

## 4. Metrics and preset thresholds

Deterministic checks are the ONLY scoring authority. `EvalCaseResult` keeps
`humanLabels` and `graderJudgments` as RESERVED null fields — no model grader
is implemented, and by contract a model must never grade its own output as
the sole authority. There is no open-ended "which answer feels better" judge
anywhere.

Hard invariants (any violation = FAIL; `src/lib/evals/gates.ts`, constants
frozen before any candidate existed): wrongDocIds must be 0 across all cases
(ruling 2 traceability); heldout under-fill cases must be 0 (ruling 7);
strengthened hedges must be 0 (ruling 16); all publication-guard cases pass
(ruling 19); all fidelity mustMatch/mustNotMatch checks pass (ruling 20
regex-proxy); zero injection follows; deterministic pipelines byte-identical
across two runs; zero schema-invalid/provider-error outputs; live metering
invariant `attempts == reservations` and `meterings == attempts −
erroredAttempts` (see §6).

Quality gates are PAIRWISE against a baseline aggregate with preset minimum
deltas (`QUALITY_MIN_DELTA = 0`, i.e. no regression): map recall/precision
means, reduce/digest checks-pass rate, validation match-set precision/recall
against human labels. **Candidate-only numbers can never pass** — a missing
baseline yields `insufficient_data`, and resource savings (latency/tokens/
cost, all reported per config) count as an improvement ONLY when the quality
verdict is `pass` (stated in code at the constants).

## 5. Runner safety design (every fail-closed path)

`--validate-dataset`, `--estimate`, `--offline`, `--report` construct NO
OpenAI client and open NO DB connection — spy-proven in `runner.test.ts`
(mocked SDK + driver + `@/db` with constructor/access spies that stay silent
while the whole offline/estimate/report machinery runs over the real
datasets), and structurally: `scripts/analysis-eval.ts` loads
`live-runner.ts` only via a dynamic import inside the live mode
(source-scan-pinned in `isolation.test.ts`).

Live mode requires ALL of, checked in `assertLivePreflight` BEFORE any client
construction or env mutation (each refusal unit-tested):

1. the explicit `--execute-live` flag;
2. `LLM_DISABLE` unset (kill-switch honored) and `ANALYSIS_PROVIDER != stub`
   (a stub run must never be scored as live);
3. `EVAL_DATABASE_URL` set and parseable — **`DATABASE_URL` is never read**;
   the runner overwrites `process.env.DATABASE_URL` with the eval URL so the
   spend ledger can only ever write to the acknowledged branch;
4. `--db-ack <host>` exactly matching the `EVAL_DATABASE_URL` host;
5. a real `OPENAI_API_KEY`;
6. both caps set to positive numbers: `LLM_SPRINT_USD_CAP` (shared all-time
   backstop) + `EVAL_USD_CAP_DAILY`. The `openai_eval` SpendGuard
   (`eval-guard.ts`, own `provider_usage` row, template `reduceGuardFromEnv`)
   additionally fails closed at `tryReserve` — and unlike reduce's guard it
   has NO out-of-production default for the daily cap: unset anywhere means
   refusal (unit-tested). No existing guard was touched.
7. `evalDispatchConfig(workload, model, effort)` — refuses unpriced models
   (pricing.ts stays the single price authority), invalid efforts, effort on
   non-reasoning models, and the `reduce` workload (deterministic, nothing to
   dispatch).

Mid-run: one FRESH `tryReserve` per physical attempt (the only retry is the
explicit 65s 429 loop, which reserves again); every RECEIVED response is
metered via `guard.record` BEFORE parsing/discarding (ruling 8 — truncated
and unparseable responses included, test-pinned with the billed token count
flowing into the record call); a budget stop aborts the whole run loudly with
an **INVALID RUN** message (completed cases stay durable; a rerun resumes by
(caseId, repetition)); a provider error is recorded as `provider_error`
(which the gates fail on) rather than silently skipped. Results write after
EVERY completed case.

Client discipline: `live-runner.ts` constructs only via
`analysisOpenAiClient()` (maxRetries: 0) and is enumerated in
`openai-client.test.ts`'s source scan.

Registry isolation: `evalDispatchConfig` bypasses the analysis-registry
approval and the map activation lock ONLY inside the eval library, stamping
`approval: "evaluation_candidate"` into every artifact. `isolation.test.ts`
proves by source scan that no file under `src/app/` and none of the five
production analysis dispatch modules import anything from `src/lib/evals`,
that no `src/lib` module outside the eval package does either, and that inside
the package only `live-runner.ts`/`eval-guard.ts` can reach the client factory
or the guard. A complete passing scorecard renders a PROPOSED registry entry
as text in the report (`proposedRegistryEntry`); nothing edits
`analysis-registry.ts`.

Negative CLI smoke (run for real, §7): `--execute-live` without its guards
refuses with exit 2 before any client construction.

## 6. One spec correction (metering invariant refinement)

The program spec's live gate reads "attempts == reservations == meterings". A
physical attempt that ERRORS before any response exists (429 first leg,
network failure, 5xx) is not billed by the provider and therefore cannot be
honestly metered — forcing the three-way equality would require fabricating a
usage record for an unbilled request. The implemented invariant is:
`attempts == reservations` (one fresh reservation per physical dispatch,
absolute) AND `meterings == attempts − erroredAttempts` (every received
response metered before parse). With zero errored attempts this reduces to
exactly the spec's equality. `erroredAttempts` is a fourth tracked counter in
every results file, and the gate + tests pin both directions.

## 7. Gates run (exact commands and numbers)

On the final tree (all run in this worktree):

1. `git diff --check` — clean (no output).
2. Targeted: `npx vitest run src/lib/evals/ src/lib/analysis/openai-client.test.ts src/lib/validation/llm-match.test.ts src/lib/validation/llm-match-guard.test.ts` — **11 files, 105 tests, all passing** (the 8 new files' 86 tests plus the 19 pre-existing tests of the touched/adjacent modules).
3. `npm run typecheck` — clean.
4. `npm run lint` — clean.
5. `npm test` — **2,273 tests / 179 files, all passing** (base was 2,187/171
   — reproduced green on unmodified `05fdd2c` before any change; +86 tests /
   +8 files, no existing assertion weakened or skipped).
6. CLI smokes, all zero-provider-contact:
   - `--validate-dataset` — all four datasets OK (17/14/10/14 cases; heldout
     coverage per partition printed).
   - `--estimate --model gpt-5-mini --repetitions 2` — prints the per-workload
     plan (map 34 calls / digest 100 / validation 28 / reduce 0; grand total
     $0.4702 — deliberately conservative), then "no DB connection, no client
     construction, no LLM calls, nothing written".
   - `--offline` — 55/55 cases scored, **machinery=OK on every case**
     (checks.pass matches each fixture's declared expectation; the deliberate
     violations fail for exactly their intended reasons — under-fill,
     wrongDocIds, truncation, schema-invalid, strengthened hedge, fabricated
     quote, injection follow, dropped attribution).
   - `--report --out docs/evals/analysis/BASELINE-OFFLINE-2026-08-17.md` —
     committed sample artifacts (md + json). Verdicts: map **FAIL by design**
     (the violating fixtures trip traceability/completeness/certainty/
     fidelity/injection/schema gates — the demonstration that the gates
     fire); reduce/digest/validation **insufficient_data** (all checks pass;
     no baseline aggregate exists, and candidate-only numbers never pass).
     The report is headlined: "machinery proof over committed fixtures — NOT
     a model evaluation; no paid calls were made."
   - Negative smoke: `OPENAI_API_KEY= EVAL_DATABASE_URL= npx tsx
     scripts/analysis-eval.ts --execute-live --workload map --model
     gpt-5-mini` -> `REFUSED (before any client construction): analysis-eval:
     EVAL_DATABASE_URL is not set ...`, exit 2.
7. No integration/Neon run: nothing in the committed default paths touches a
   DB (the only DB-capable path is the never-executed live mode, whose store
   wiring is exercised through the SpendGuard's injectable UsageStore in unit
   tests). No integration test is required for this worktree.

## 8. Honest scope notes / deviations

- **Digest live scoring is candidate-invariant-only.** Digest reference
  expectations (surviving/dead titles, exact counts, gid fills, guard-stat
  pins) are authored against the committed fixture votes; a live candidate's
  votes differ, so `scoreDigestCase(..., { candidateInvariantOnly: true })`
  skips them and keeps the structural verdicts (vote usability, out-of-set
  gids, pipeline refusal, reproducibility) plus the safety
  mustMatch/mustNotMatch patterns. Test-pinned. Post-guard prose is safe BY
  CONSTRUCTION for any vote set (that is the guard's contract), so the live
  digest signal is: schema validity, gid fidelity, event-count sanity, safety
  patterns, and resources.
- **Superseded-extractor-version filtering is SQL-side** (`map-versions.ts`
  `versionFilterSql`), not reachable from pure fixtures. `red-edge-003`
  simulates leaked duplicate rows and pins that corroboration is NOT inflated
  by them; the actual version filter stays covered by `map-versions.test.ts`
  and the reduce loader. Recorded rather than papered over.
- **Cross-theater non-merge** is a loader contract (`reduce-io.ts` feeds one
  (theater, track) per call; `ReduceClaim` carries no theater field), so it
  cannot be violated inside `clusterClaims`. Covered on the validation side by
  the theater-routing probes; documented in the README.
- **Map live truncation is scored as a finding, not split-retried.**
  Production halves a truncated batch and retries; the eval refuses to hide a
  candidate that truncates on an eval-sized (<=3-doc) batch. Noted in code.
- **Metering invariant refined** (§6).
- **`WorkloadScorecard` lives in `runner.ts`** (beside its builder) and the
  aggregate/verdict types in `gates.ts`, not all in `contracts.ts` as the
  spec sketched — the validators don't consume them and gates.ts owns the
  thresholds they cite. Shapes match the spec's field list.
- **Committed offline results ARE committed** (the spec's own carve-out):
  they are the sample baseline report inputs. Live results are gitignored
  under the `live-` prefix.

## 9. Future paid-eval authorization checklist (BLOCKED until authorized)

Mirrors `docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` §9. ALL
required, in order, per model per workload — none of it happened in this
program:

1. **Verified pricing**: operator-verified price row in
   `src/lib/llm/pricing.ts` (evalDispatchConfig refuses unpriced regardless).
2. **Compatibility probe**: one guarded, capped call proving the payload shape
   (temperature-free where reasoning, effort accepted, structured output
   honored) — runnable as `--execute-live --only <one dev case>` with
   repetitions 1 inside the caps.
3. **Representative paid evaluation inside caps**: `--estimate` first, then
   the baseline model (`gpt-4o-mini`) live over the same dataset (the pairwise
   gate needs its aggregate), then the candidate with `--repetitions >= 3`
   for variance, all under `EVAL_USD_CAP_DAILY` + `LLM_SPRINT_USD_CAP` and an
   acknowledged disposable eval branch. `--report` computes the preset
   verdict; heldout coverage rules apply.
4. **Map-specific**: activation additionally requires the version-aware remap
   path (OPEN-TASKS #33) — the eval bypass never unlocks the production map
   activation lock.
5. **Operator authorization + decision-log entry** (and a registry entry with
   status `evaluated_candidate` citing the scorecard) before any env change
   anywhere. The scorecard's `proposedRegistryEntry` text is the input to that
   decision, never a substitute for it.

## 10. Review remediation (2026-08-17, post-adversarial-review)

Both adversarial reviews returned PASS-WITH-MINORS (every committed artifact
verified honest) and converged on three MAJOR forward-looking gate-integrity
holes plus minors. All were remediated in this worktree. **Pre-registration:
every gate refinement below was made while NO candidate result exists
anywhere — registered before the first paid evaluation, not after seeing
one** (stated in `src/lib/evals/gates.ts` too; the git history of that file
is the registration record).

Disposition of every finding:

- **MAJOR-1 (scorecard completeness) — FIXED.** Results files now carry
  `requestedRepetitions`, `scope` ("full"/"dev"/"subset", set by the run
  mode), and `datasetContentHash` (sha256 over the dataset FILE bytes —
  inputs AND references, closing m8). `computeScorecardVerdict` gained a
  RESULTS-side completeness gate: pass/fail only for a scope-"full" file with
  every (caseId, repetition < requestedRepetitions) key present (scored /
  schema_invalid / provider_error count as PRESENT — failing results, not
  missing ones; a skipped row is missing work); anything else is
  `insufficient_data` naming the missing and missing-heldout counts. Heldout
  minima now come from the RESULTS (cases with every repetition present, per
  partition), never the dataset. The completeness numbers are written into
  the scorecard md AND json (not just stderr), the stderr missing arithmetic
  is repetition-aware (`cases × requestedRepetitions`), and the
  proposed-registry-entry text renders only on a pass — which now requires
  completeness. New negative CLI smoke (run for real, $0): a `--dev` offline
  run's file reports `INCOMPLETE (scope=dev): 5 of 14 keys missing (5
  heldout)` and verdicts `insufficient_data`; the same file was then
  COMPLETED to scope "full" by a subsequent full run (the mergedScope
  dev→full path), after which the committed report shows COMPLETE.
  Test-pinned in gates.test.ts + runner.test.ts (including the reps>=2
  missing-key arithmetic).
- **MAJOR-2 (aligned pairwise) — FIXED.** `alignedComparison()` (runner.ts)
  intersects the PRESENT (caseId, repetition) keys of the judged and
  baseline files and recomputes the gated quality on that intersection's
  HELDOUT subset (m4). The verdict additionally requires the baseline file
  to pass the MAJOR-1 completeness gate and to share the judged file's
  `datasetContentHash`; the scorecard prints both files' completeness and
  the aligned/aligned-heldout population sizes. Test-pinned (intersection
  arithmetic; incomplete-baseline and hash-mismatch refusals).
- **MAJOR-3 (resume relabels identity) — FIXED.** `resumeIdentityMismatch()`
  compares the existing file's full identity — promptHash, schemaVersion,
  extractorVersion, model, reasoningEffort, provider, approval,
  registryVersion, datasetVersion, datasetContentHash,
  requestedRepetitions, AND envKnobs — against the current run's; any drift
  refuses loudly ("identity changed — use --fresh or a new configKey") in
  BOTH the CLI (before any work) and `mergeEvalResults` itself, which now
  preserves the existing header verbatim instead of restamping it (only
  `scope` evolves, by the documented mergedScope rule: --only preserves the
  existing coverage claim, a full run completes to full, a dev resume never
  upgrades). Unit tests: a promptHash change refuses; a dataset content
  edit (datasetContentHash change) refuses; knob and repetition drift
  refuse.
- **m4 — FIXED.** Aggregates and the scorecard carry per-split
  (development/heldout) and per-partition (typical/edge/adversarial)
  breakdowns; the pairwise QUALITY gate is evaluated on the heldout subset
  only, with development numbers labeled diagnostic. Reasoning (documented
  at QUALITY_GATE_METRICS): heldout exists precisely so dev iteration
  cannot inflate the gated metric.
- **m5 + n5 — FIXED.** The gist-jaccard recall-orientation (location-swap
  leniency) is documented in the README ("Gist matching is recall-oriented —
  mustNotMatch carries precision") and here: gist matching is for recall;
  precision-critical distinctions (locations, identities, attribution) are
  pinned by mustMatch/mustNotMatch. New development-split case
  `map-edge-007-location-precision` (map now 18 cases, corpus 56) carries
  mustNotMatch patterns pinning the wrong-location claim shape, so the
  dataset exercises that path.
- **m6 — FIXED.** Prohibition checks (mustNotMatch, injectionPatterns) now
  scan produced `event_hint` and entity names in addition to text_en
  (production persists all three). mustMatch deliberately stays
  claim-text-only (a hint accidentally satisfying an attribution
  requirement would fail open) — documented in score-map.ts. Test: payloads
  hidden in event_hint and in an entity name are both caught.
- **m7 — FIXED.** Map precision with nothing produced is 1 only when nothing
  was expected, else 0 (the `? 1 : 1` mismatch removed); validation
  matchSet/keyword precision-recall means now EXCLUDE vacuous (null)
  populations and count them separately (`*VacuousCount`, printed in the
  scorecard as excluded-from-mean); an all-vacuous gated metric is NaN,
  which the pairwise gate reports as unavailable (insufficient_data), never
  a pass. Documented at qualityOf; test-pinned both sides.
- **m9 — FIXED.** `--report` hides per-case failure detail for heldout rows
  by default ("(hidden)"); `--show-heldout-detail` reveals it for operator
  calibration. Test-pinned: the heldout injection case's payload string does
  not appear in the default render and does with the flag. The committed
  baseline report uses the default (18 hidden rows).
- **m10 + safety MINOR-2 — FIXED.** Results headers record `envKnobs`
  (reduceVotes, reduceMaxOutputTokens, mapOutTokensPerDoc — via a new
  behavior-identical exported accessor in map-worker.ts — and
  mapContentChars); knob drift refuses a resume. Live digest preflight
  REFUSES when `reduceVotes() !== 5` (ruling 18: the shipped K is binding —
  an eval at K≠5 measures a non-shipped configuration). Tests both ways
  (REDUCE_VOTES=3 refuses digest, leaves map/validation unaffected; default
  K=5 passes).
- **safety MINOR-1 + NOTE-1 — FIXED.** isolation.test.ts now walks ALL of
  src/ (not just app/ + lib/) plus every script: nothing outside
  src/lib/evals imports the eval library; no script other than the eval CLI
  does, and the CLI's static eval imports are limited to contracts+runner;
  no static live-runner import exists anywhere (dynamic-only); no eval
  module except live-runner (and no script except the pre-existing,
  separately-authorized ask-eval-harvest.ts, which predates this program)
  value-imports/dynamically loads `openai` or contains `new OpenAI(`;
  EVALS_IMPORT_RE tightened to catch `from"..."` with no whitespace.
- **n4 — FIXED.** The machinery-proof headerNote is embedded in the
  scorecard JSON artifact as well as the markdown.
- **NOTE-3 — ACCEPTED, documented.** A mid-case abort (budget stop /
  process kill between dispatches of a multi-call case) can under-report
  that case's cost in the results FILE, because per-case cost is written
  only on case completion. The provider_usage ledger stays exactly correct
  regardless (metering is per-response through the SpendGuard), so no spend
  can be hidden; the file-level cost figure is a convenience view. Accepted
  as-is.
- **n1 — ADDED to README.** The dataset validator deliberately pins no vote
  count (k=4 in `dig-typ-003-gid-fill` is valid and constructs the
  median-loss shape); live digest evaluation always dispatches the shipped
  K=5 and refuses otherwise.
- **n2 / n3 — RECORDED as-is** per the review adjudication; no code change.

Gates after remediation (final tree): `git diff --check` clean · targeted
`npx vitest run src/lib/evals/ src/lib/analysis/openai-client.test.ts
src/lib/analysis/map-worker.test.ts src/lib/validation/llm-match.test.ts
src/lib/validation/llm-match-guard.test.ts` all passing · typecheck clean ·
lint clean · full `npm test` all passing (exact counts in the remediation
commit series / final report) · $0 CLI smokes: --validate-dataset (18/14/10/
14), --offline 56/56 machinery=OK, --report regenerated with completeness
rows, the NEW --dev insufficient_data smoke, and the --execute-live
no-guards refusal. The committed offline baseline artifacts were regenerated
in the new header shape. Zero paid calls throughout.
