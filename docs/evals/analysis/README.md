# Analysis eval datasets (map / reduce / digest / validation)

The repository-owned evaluation control plane for the ANALYSIS workloads
(quality-foundation program, 2026-08-17). Contracts + validators:
`src/lib/evals/contracts.ts`. Evaluators: `src/lib/evals/score-{map,reduce,validation}.ts`
(score-reduce covers both the reduce clustering and the digest synthesis
pipeline). Preset gates: `src/lib/evals/gates.ts`. Runner:
`scripts/analysis-eval.ts` (see its header for every mode; `--offline` is the
default and touches no DB and no provider).

This harness deliberately depends on NO hosted eval product — the official
OpenAI legacy Evals platform is scheduled read-only 2026-10-31 and shut down
2026-11-30 (verified 2026-08-17 against
https://developers.openai.com/api/docs/guides/evals). Everything here is
repo-owned files + deterministic code.

## Files

- `map-v1.json`, `reduce-v1.json`, `digest-v1.json`, `validation-v1.json` —
  one dataset per workload (`AnalysisEvalDataset`).
- `results/<workload>-offline-fixtures.json` — COMMITTED offline results: the
  committed fixtures scored through the real pipeline functions. These are the
  sample baseline report inputs (a machinery proof, NOT a model evaluation).
- `results/live-*` — live candidate results. GITIGNORED; never committed.
- `BASELINE-OFFLINE-2026-08-17.md` (+ `.json`) — the committed sample report
  built by `--report` from the offline results.
- **Conflict-plane artifacts (2026-08-24 landing; NOT strays — do not delete or
  regenerate under the QF naming contract):** `CONFLICT-EVAL-SCORECARD.md`
  (+ `.json`) and `results/conflict-{roca,iran}-v1-offline-fixtures.json` belong
  to the conflict evaluation profile (`--profile conflict`,
  `src/lib/evals/conflict-validation-profile.ts`; datasets under
  `fixtures/conflicts/`). The two planes' file names, scorecard paths and
  regeneration paths are disjoint — the QF `<workload>-offline-fixtures.json`
  contract above describes only the four QF workloads.

## Case counts (v1, authored 2026-08-17)

| workload | cases | typical | edge | adversarial | development | heldout (typ/edge/adv) |
|---|---|---|---|---|---|---|
| map | 18 | 6 | 7 | 5 | 13 | 5 (1/2/2) |
| reduce | 14 | 6 | 4 | 4 | 9 | 5 (1/1/3) |
| digest | 10 | 3 | 4 | 3 | 7 | 3 (1/1/1) |
| validation | 14 | 5 | 7 | 2 | 9 | 5 (1/3/1) |

(`--validate-dataset` recomputes and prints these; the numbers above are the
authored v1 state.)

## Provenance and content rules (binding)

- Every case carries `provenance: "authored-2026-08-17"` — hand-authored and
  hand-checked, one at a time, by the workstream author. Model-generated cases
  are PROVISIONAL by policy and must be marked as such in `provenance`; the v1
  datasets contain none.
- **No ISW prose anywhere** (standing ruling 1). Validation takeaway texts are
  paraphrased, takeaway-STYLE texts written for this repo — never sentences
  from a real ISW report.
- **All named persons/organizations are FICTIONAL** (the
  `FidelityEvidenceClaim` precedent in `src/lib/ask/eval-set.ts`): Viktor
  Mergunov, Maksim Dorenko, Pavel Streshnev, Artur Nazhmetov, Ramin Gholipour,
  Anton/Igor Velichko, the "Amwaj al-Bahr" group, the village "Zaturyne" — none
  exist. Real PLACE names are used where the gazetteer requires them
  (Pokrovsk, Kursk, ...); institutions appear only as generic descriptors
  ("the defense ministry", "the general staff").
- **No copyrighted source full text.** Every doc snippet (including the
  ru/uk/fa/ar ones) was written for this repo and stays short (< ~400 chars of
  substance; validator hard-caps 1,600).

## Immutability

A case's `input` and `reference` are FROZEN once committed. To change either,
mint a NEW case id — or bump the `datasetVersion` (new file, update
`DATASET_FILES` in `scripts/analysis-eval.ts`) — so historical results files
never silently describe a different case. `notes`/`provenance` wording may be
corrected in place.

## Offline fixtures and the machinery proof

Map and digest cases carry committed candidate outputs (`offline.rawOutput` /
`offline.votes`): the raw JSON a model would have returned, authored by hand.
Some are compliant, some DELIBERATELY violate (under-fill, wrong docId,
truncation, fabricated quote, strengthened hedge, followed injection,
malformed JSON) with `offline.expectation: "fail"`. The offline run's
machinery-proof metric is `checks.pass === (expectation === "pass")` for every
case — the committed baseline holds 56/56. Reduce and validation are
deterministic pipelines; their `offline.expectation` declares whether the
reference checks should pass.

Because the map fixture set includes deliberate violations, the sample
report's map verdict is **FAIL — by design**: it demonstrates that the preset
hard gates (traceability, ruling-7 completeness, ruling-16 certainty,
injection, fidelity) actually fire. No paid call is involved anywhere in the
offline path.

## Gist matching is recall-oriented — mustNotMatch carries precision

Map gold matching uses token-jaccard against `textGist`
(`MAP_GIST_MATCH_THRESHOLD` in `score-map.ts`). That is a deliberately
RECALL-oriented rule: it tolerates rewording, but it would also accept a
claim whose few differing tokens carry a critical distinction — a location
swap ("grain terminal in Kherson" vs "grain terminal in Mykolaiv") can clear
the threshold on the shared tokens alone. Precision-critical distinctions
(locations, identities, attribution) must therefore be pinned with
`mustNotMatch` (affirmative-negation semantics) / `mustMatch` patterns, never
left to the gist. `map-edge-007-location-precision` exists to keep that path
exercised. Prohibition checks (`mustNotMatch`, `injectionPatterns`) scan the
produced claim text AND `event_hint` AND entity names — production persists
all three surfaces.

## Results files: completeness, scope, and identity

Every results file records `scope` ("full" / "dev" / "subset"),
`requestedRepetitions`, `datasetContentHash` (sha256 of the dataset file
bytes — a reference edit after a run is detectable), and `envKnobs`
(reduceVotes / reduceMaxOutputTokens / mapOutTokensPerDoc / mapContentChars).
The gates (pre-registered before any candidate result existed) only ever
issue pass/fail on a scope-"full" file with EVERY (caseId, repetition) key
present; anything else is `insufficient_data`. A resume whose configuration
identity (promptHash, schemaVersion, extractor versions, model/effort,
dataset version+content, repetitions, env knobs) drifted from the file's is
REFUSED — use `--fresh` or a new configKey. Pairwise candidate-vs-baseline
deltas are computed only over the aligned (caseId, repetition) intersection
of two COMPLETE files with the same `datasetContentHash`, restricted to the
heldout split (development numbers are diagnostics — heldout exists precisely
so dev iteration cannot inflate the gated metric).

`--report` hides per-case failure detail for heldout rows by default
(`--show-heldout-detail` reveals it for operator calibration) so the default
report output cannot become a heldout iteration channel.

Note on fixture vote counts: the dataset validator requires a non-empty
`offline.votes` array but pins no K — `dig-typ-003-gid-fill` deliberately
uses 4 votes to construct its median-loss shape. LIVE digest evaluation
always dispatches the shipped K=5 (ruling 18) and the runner REFUSES a live
digest run when `REDUCE_VOTES` resolves to anything else.

## Leakage prevention

The candidate prompt builders (`src/lib/evals/runner.ts buildCandidatePrompt`)
take ONLY a case's `input`; the `reference` (gold) can never reach a prompt —
test-pinned with a sentinel in `runner.test.ts`.

## Heldout discipline

- `split: "development"` — you may iterate prompts/configs against these
  results freely.
- `split: "heldout"` — verdict-only. **Humans must not iterate prompts against
  heldout results.** Use `--dev` while iterating (it excludes the heldout
  split entirely); run the full set only to produce a scorecard. Every report
  labels heldout coverage, and the gates return `insufficient_data` when any
  partition has zero heldout cases.

## Adding a case

1. Pick the workload file and a fresh id (`<wl>-<partition-tag>-NNN-slug`).
2. Write `input` (synthetic content only; fictional names; explicit-timezone
   timestamps) and `reference` (hand-compute every numeric pin — coverage,
   timeliness, recency stats — and record the arithmetic in `notes`).
3. For map/digest, author the `offline` fixture output and declare its
   `expectation` honestly.
4. `npx tsx scripts/analysis-eval.ts --validate-dataset --workload <wl>`.
5. `npx tsx scripts/analysis-eval.ts --offline --workload <wl>` and confirm
   `machinery=OK` on your case; regenerate the committed report if you intend
   it to be the new sample baseline.
6. Keep `contracts.test.ts`'s partition/heldout coverage assertions green.

## What a candidate evaluation would take (not run in this program)

Live mode (`--execute-live`) is implemented but was NEVER executed here — no
paid model evaluation ran and no candidate was evaluated. Its guards, spend
caps (`openai_eval` provider, `EVAL_USD_CAP_DAILY` + `LLM_SPRINT_USD_CAP`,
fail-closed), and the operator authorization checklist are documented in
`docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md`. A complete passing
scorecard can only ever PROPOSE an `analysis-registry.ts` entry in report
text; activation stays a separate operator decision.
