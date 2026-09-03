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

- **ACTIVE datasets (what the runner loads — `DATASETS` in
  `scripts/analysis-eval.ts`):** `map-v2.json`, `reduce-v1.json`,
  `digest-v2.json`, `validation-v2.json`. The v2 files (admitted 2026-09-03,
  `contractVersion: 2`) are UNIONS: every v1 case byte-frozen
  (input/reference/offline JSON-equal — test-pinned) followed by the admitted
  corpus-c2 cases.
- **Frozen historical v1 files:** `map-v1.json`, `digest-v1.json`,
  `validation-v1.json` stay committed byte-identical forever with their
  committed results (`results/{map,digest,validation}-offline-fixtures.json`)
  as the immutable historical record; nothing loads them at runtime, but the
  identity tests still pin them.
- `corpus-c2/` — the admitted c2 case fragments + `MANIFEST.json` (sha256 of
  the five preserved 2026-08-27 draft inputs and of each fragment).
  Deterministic regeneration chain, byte-exact end to end:
  `scripts/evals/corpus-v2/build-draft.py` (byte-identical to the preserved
  originals' generator) → the five drafts →
  `src/lib/evals/corpus-v2-admit.ts` (EVERY admission delta lives there,
  explicit) → fragments → `src/lib/evals/corpus-v2-compose.ts` → the v2
  files. Proof: `scripts/evals/corpus-v2/check-regen.sh` (needs python3) or
  `run-admit.ts --check` (fragments/datasets only).
- `results/map-v2-offline-fixtures[+<profile>].json`,
  `results/digest-v2-offline-fixtures[+reduce-fed-400].json`,
  `results/validation-v2-offline-fixtures.json` — COMMITTED v2 offline
  results, one per meaningful capacity cell (map: baseline / map-depth-4000 /
  map-depth-full; digest: baseline / reduce-fed-400): the committed fixtures
  scored through the real pipeline functions (a machinery proof, NOT a model
  evaluation).
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

## Case counts

Active (v2 unions; corpus-c2 admitted 2026-09-03 — 26 proposed, 26 admitted:
16 map + 7 digest + 3 validation, of which 21 development + 5 heldout):

| workload | cases | development | heldout (typ/edge/adv) | of which c2 |
|---|---|---|---|---|
| map (v2) | 34 | 26 | 8 (1/4/3) | 16 (3 heldout) |
| reduce (v1) | 14 | 9 | 5 (1/1/3) | 0 |
| digest (v2) | 17 | 13 | 4 (1/1/2) | 7 (1 heldout) |
| validation (v2) | 17 | 11 | 6 (1/4/1) | 3 (1 heldout) |

Historical v1 state (frozen, authored 2026-08-17): map 18 (13 dev / 5
heldout 1/2/2), reduce 14 (9/5 1/1/3), digest 10 (7/3 1/1/1), validation 14
(9/5 1/3/1). (`--validate-dataset` recomputes and prints both generations.)

## Provenance and content rules (binding)

- Every v1 case carries `provenance: "authored-2026-08-17"` — hand-authored
  and hand-checked, one at a time, by the workstream author. The corpus-c2
  cases carry `authored-2026-08-27; admitted-2026-09-03 after maintainer
  review …` — hand-authored via the deterministic (RNG-free, clock-free)
  generator preserved byte-identical at
  `scripts/evals/corpus-v2/build-draft.py`, then human-reviewed at admission
  (`docs/reviews/CORPUS-V2-ADMISSION-2026-09-03.md`). Model-generated cases
  are PROVISIONAL by policy and must be marked as such in `provenance`; no
  committed dataset contains any.
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
  ru/uk/fa/ar ones) was written for this repo. v1-contract docs stay short
  (< ~400 chars of substance; validator hard-caps 1,600). `contractVersion: 2`
  datasets may carry graded long CAPACITY docs up to the 6,000-UTF-16-unit
  DATASET safety ceiling — long bodies are deterministic synthetic
  channel-housekeeping filler around planted facts, never source text, and
  the ceiling is a fixture bound, NOT a production `MAP_CONTENT_CHARS`
  recommendation.
- The corpus-c2 fictional names: Arkady Luzhenkov, Omid Zangaraki, Yegor
  Stavitsky, the "Jabhat Sahil al-Fajr" group — none exist. The 260
  fed-population locality names are fused synthetic tokens (base+suffix;
  four real-pattern suffix rows were substituted at admission — Q10);
  `varn_strait` is a deliberately synthetic off-gazetteer theater sentinel.
  The Arabic case (`map-c2-adv-005`) has had NO native-speaker
  linguistic/safety review — it is development-split diagnostic until a
  human native-speaker review is recorded in a decision-log entry
  (OPEN-TASKS #104).
- **Known corpus-c2 limitation (recorded at admission, 2026-09-03 review):**
  in the c2 map cases every extractable gold fact is an actively-attributed
  "X said/reported Y" sentence while filler carries none — a candidate TUNED
  on this template could ace relevance selection and quiet-day precision
  without the underlying capability. Depth capacity remains honestly
  measured (no template reads past a truncation), the campaign evaluates
  generic models the heldout discipline forbids tuning on this corpus, and
  the affected signals are diagnostics/baseline-pairwise. The next corpus
  generation must interleave decoy attributed sentences in filler and vary
  fact framing.

## Immutability

A case's `input` and `reference` are FROZEN once committed. To change either,
mint a NEW case id — or bump the `datasetVersion` (new file, update
`DATASETS` in `scripts/analysis-eval.ts`) — so historical results files
never silently describe a different case. `notes`/`provenance` wording may be
corrected in place. Two corpus-c2 couplings this pins down explicitly:
`dig-c2-late-001` asserts `confirmed` via the CURRENT corroboration-promotion
rule (`finalizeEvents`/publication-guard as of the 2026-09-03 admission) — if
that rule ever changes, the case must be re-minted under a new id/dataset
version, never re-annotated in place; and the position buckets' 1500/4000
edges reference the production `MAP_CONTENT_CHARS` default and the
map-depth-4000 profile — a future default change needs a NEW flag name, not a
reinterpretation of `straddlesDefaultKnob1500`.

## Capacity applicability (corpus-v2)

A capacity case declares what configuration its expectations were authored
against: map `capacityMeta.minMapContentChars` (MIN semantics — facts past
the applied depth are unreadable) and digest `capacityMeta.exactReduceGroupsFed`
(EXACT semantics — fed-cutoff survivorship breaks in BOTH directions). The
scorer ALWAYS runs the production-aligned pipeline under the actually applied
knobs; when they cannot satisfy a case's declaration the run is classified
**structurally `inapplicable`** BEFORE any scoring or dispatch
(`src/lib/evals/applicability.ts`): recorded durably (completeness holds, no
insufficient_data rot), never scored, never machinery, never a quality data
point, zero estimated/billed calls. Each capacity cell's committed results
file therefore scores exactly the cases that cell can honestly measure — e.g.
`dig-c2-cap-003` (fed 400) is inapplicable in the baseline digest file and
scored in `+reduce-fed-400`.

## Capacity diagnostics (REPORT-ONLY — not gates)

The v2 corpus feeds five namespaced diagnostics, aggregated over scored rows
in `WorkloadAggregate.capacityDiagnostics` and rendered with explicit
`unavailable` states: `positionRecall.{early,mid,tail,deep-tail}`
(matched/expected over capacity-annotated expected claims, bucketed by fact
START offset — buckets: <400 / ≤1500 / ≤4000 / beyond), `straddleRecall`
(facts crossing offset 1500), `uniqueTailLoss` (lost / factKey-unique
tail facts), `tailEventRecall` (survived/fed decisive events; unfed reported
separately, excluded from any ratio — a capacity limitation is not a model
failure), `lateDocumentRecall` (cited / fed late groups). These are
UNVALIDATED diagnostics with no representative live baseline yet: they are
deliberately NOT in `QUALITY_GATE_METRICS` (byte-stability test-pinned), and
promoting any of them into a gate requires a live baseline distribution plus
a decision-log entry recording the threshold.

## Offline fixtures and the machinery proof

Map and digest cases carry committed candidate outputs (`offline.rawOutput` /
`offline.votes`): the raw JSON a model would have returned, authored by hand.
Some are compliant, some DELIBERATELY violate (under-fill, wrong docId,
truncation, fabricated quote, strengthened hedge, followed injection,
malformed JSON) with `offline.expectation: "fail"`. The offline run's
machinery-proof metric is `checks.pass === (expectation === "pass")` for every
APPLICABLE case (structurally inapplicable rows are classifications, not
machinery data points) — the committed v2 baseline cells hold it for every
applicable case, and the historical v1 record held 56/56. Reduce and
validation are deterministic pipelines; their `offline.expectation` declares
whether the reference checks should pass.

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
(reduceVotes / reduceMaxOutputTokens / mapOutTokensPerDoc / mapContentChars /
reduceGroupsFed).
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
- Exposure honesty: "heldout" means PROHIBITED FROM ITERATIVE TUNING, not
  secret — every heldout case (references and fixtures included) was visible
  during authoring and maintainer review. The corpus-c2 heldout candidates'
  freeze/exposure ledger, including the declared post-freeze mechanical
  deltas, lives in `docs/reviews/CORPUS-V2-ADMISSION-2026-09-03.md` §3. If a
  heldout case fails a future candidate run, do not tune against it: retire
  it to development in the NEXT dataset version and mint a genuinely new
  heldout case.

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
