# Corpus-v2 review and admission — 2026-09-03

Status: IN PROGRESS (this header flips to FINAL at closeout; sections marked
[PENDING] are filled as phases complete).

Scope: maintainer review and admission of the 2026-08-27 eval-corpus-v2 draft
packet (operator decision packet §7; MODEL-PROMOTION-READINESS §5 checkbox
"Corpus v2 committed"). Offline, default-off. No paid call, no production DB
operation, no environment edit, no deploy, no migration. Branch:
`claude/eval-corpus-v2-20260903` (worktree
`/Users/go/code/bnow-net-worktrees/corpus-v2-20260903`, base `8a19ade`).

## 1. Preserved originals — integrity evidence

Originals: `/Users/go/code/bnow-net-eval-corpus-v2-draft-20260827/` +
`/Users/go/code/bnow-net-eval-corpus-v2-draft-20260827.MANIFEST.sha256`.

Verified 2026-09-03 (twice: `shasum -a 256 -c` against the original manifest,
then an independently computed full-tree sweep) — **8/8 OK, byte-identical**:

```
5d6a2932979411591ceb6ce1de44baf700f2d37cfb05bb680eca78f2eaa9a4a2  ./digest-late-c2-draft.json
fed9e8dbda4bbc581dd828e5040d18641d9dae39ecee157ef8a7b5f13d1a93fe  ./map-adversarial-c2-draft.json
efff8166c1bd159aacf280fbd1cec4c741c2b6136ec8edaf029a49a7ca3e09e3  ./map-capacity-c2-draft.json
ab0655fe728486786d61eecd450d64ed611ac580937eedca9de34f0de4eb5ecc  ./README-DRAFT.md
3388e6cd49b1f59969d4adf9eeaf84ba9cecf84fa4b368fad03100549718312b  ./reduce-capacity-c2-draft.json
00818a79e08cddd2a75463b4b56cb9b947da49c21b01a257c9c6d9ddffb709e1  ./tools/build.py
e52e627116d3962b08b656e6992eb083f246dfde8b3098a8203ed336d0398d95  ./tools/check.mts
c8f7429f8fac2e01e154b1caf2cf931274b6aa4453696da464b235fe98561d1e  ./validation-c2-draft.json
```

Actual inventory: exactly these 8 files, nothing extra, nothing missing.
All review edits happen ONLY in the working copy
`/Users/go/code/bnow-net-eval-corpus-v2-review-20260903/` or in new repository
files. Closeout re-verification: [PENDING].

## 2. Inventory reconciliation (binding)

**26 total cases = 21 development + 5 heldout candidates.** Per draft file:
map-capacity 10 (8 dev / 2 heldout) · map-adversarial 6 (5/1) · reduce/digest
fed-capacity 4 (4/0; workload=digest by design) · digest late/safety 3 (2/1) ·
validation 3 (2/1). By workload: map 16, digest 7, validation 3. By partition:
typical 4, edge 15, adversarial 7.

README-DRAFT.md line 71 claims "31 cases total — 26 development" — **wrong on
both numbers** and self-contradicted by the README's own per-set tables and
file map (10+6+4+3+3 = 26). Verified by scanning every case's `split` field.
The corrected inventory above is the binding one.

## 3. Heldout freeze ledger

Frozen 2026-09-03, BEFORE any contract/runner/scorer implementation work, from
the reviewed working copy (at that point byte-identical to the preserved
originals). Recipe: `jq -c '.cases[] | select(.id==$id)'` (resp. `| .input`,
`| .reference`, `| .offline`) piped to `shasum -a 256`.

Full-case hashes (draft basis):

```
a2cecda4cdaaa06d6ced858b57b1990d2ba8cc33378e6eeda7e8fcdfa901d878  map-c2-edge-004-pos5000-ir-taillost
e994e0448f0e3f5367db042999a3a7367ab268565f3f2b18d690ba0dd4cb5272  map-c2-edge-006-neardupe-ru-collapse
0c2a0582fb8865423847a27ffb11e6c875432df80189db0bfd4a1d6fa975c8e8  map-c2-adv-002-inject-deeptail-followed
7d1d736f9dd5a7e04ace953da5fda10410b9a7331657fdb860fbd08cd2a93d3e  dig-c2-safe-001-late-allegation-drop
51c540ec760126b99c67906be741c81fc2fea9538d37c35b443298c94294031a  val-c2-edge-002-compound-takeaway
```

Per-part hashes (input / reference / offline, draft basis):

```
map-c2-edge-004-pos5000-ir-taillost
  input=3307a9c11fec9ff42e3a15bc2aad055b3742ce2868b7423620ea6619bcf05e26
  reference=555bc0c349e3309b57fbc2db680e18e151acac2d33ad532e01ee95e9603443ed
  offline=1c6453140cfdbc0276f8d67a230feab94b4ad724e28e3034ed908086df120df6
map-c2-edge-006-neardupe-ru-collapse
  input=94c7a618e95f777ef26f3465659527d57ba589636b0c0655723b00f98728e3e9
  reference=122fc6dfe763278e9dcdb596888288cd3e55fedac50891e26eaf44761e9787e0
  offline=1be14b7c5b69d4ccabf36c1ad9fa5b1e68eefe0a72366740500639602b72dd6d
map-c2-adv-002-inject-deeptail-followed
  input=6dd31d9ea4558450b108da83bf8fcb3a8adb79e0415038fc889ef4883591eeca
  reference=e5f26267a4fe7788f2193b8e12cbe0e9bf5cfd31d8c233293597989d02489b1a
  offline=df4cffb6b453b4e759e848ac3c7cd6543204e431b0319b6800534e2e5769bfdd
dig-c2-safe-001-late-allegation-drop
  input=197f8d13bb47fd81841fe4508eee427d3f766c9634187956cd660875535050f0
  reference=a22160abff80c1661fa723a7befbcb74f96edacadbb40b118b436ff4cd6defab
  offline=f6960e03ae70ced3e04776b8ab94f2548673fdf9618ebae06e786da20de44772
val-c2-edge-002-compound-takeaway
  input=876a253f04a9b66726abd2015672211b7c5f463778909c256c4f29cf0fea7b59
  reference=c14b2e394375d648c1ba987bbe6698009c08ba85347e593b1f3f8edcf092f53c
  offline=f8a241cf845c162fbccca708264e1bdc554d377f9d84d5f5d0b80dc359f2aa5d
```

All values reproducible by the recipe above against the preserved originals.

**Exposure history (honest):** these five cases were fully visible during
drafting (2026-08-27, same authorship lineage) and during this admission
review, including their reference answers and offline fixtures. "Heldout" here
means PROHIBITED FROM ITERATIVE PROMPT/CONFIG TUNING — development runs use
`--dev` (which excludes the split), thresholds and prompts are tuned on
development cases only, and the heldout machinery runs ONCE after code freeze.
It does not mean secret or never viewed. Post-freeze deltas to heldout case
bytes (e.g. the mechanical typed-capacityMeta migration) are enumerated
below with per-part diffs against the frozen hashes; any delta touching
`input`/`reference`/`offline` semantics beyond mechanical re-shaping would
demote the case out of heldout.

**Post-freeze deltas (admitted basis, all declared and mechanical — no
verdict tuning):** every heldout case's `offline` fixture is BYTE-UNCHANGED
from the frozen basis (the verdict-bearing surface). Per case:

| case | input | reference | offline | delta content |
|---|---|---|---|---|
| map-c2-edge-004 | changed | changed | **unchanged** (1c645314…) | input: additive `capacity` annotations only (doc text verbatim); reference: mechanical position→`capacity` nesting + the DECLARED item-6 `mustNotMatch: ["\\bconfirmed\\b"]` pin + `checkNumerals: true` (both adjudicated before implementation; both inert against the committed fixture) |
| map-c2-edge-006 | changed | changed | **unchanged** (1be14b7c…) | same three declared deltas as edge-004 |
| map-c2-adv-002 | changed | **unchanged** (e5f26267…) | **unchanged** (df4cffb6…) | input: additive capacity annotations (injection offset, quiet flag, facts) |
| dig-c2-safe-001 | **unchanged** (197f8d13…) | **unchanged** (a22160ab…) | **unchanged** (f6960e03…) | only case-level capacityMeta (`lateClaimIds`), notes, provenance |
| val-c2-edge-002 | **unchanged** (876a253f…) | **unchanged** (c14b2e39…) | **unchanged** (f8a241cf…) | provenance only |

Admitted-basis full-case hashes (same recipe, against the committed v2 files):
edge-004 f7f49234a87a56f5aa50d6b8f93d5f5239d20c6b9ae3531cf812ea1583c47a92 ·
edge-006 98f6e2bd27e28a49be4816c5d610e8a210d8d714457ca3bb764af633133826f1 ·
adv-002 25071f330745ed2876008fff69ffec0ad85246f0b9603b8a833375573bf7f4a5 ·
safe-001 097b0d7c877dce88b5d77b099e6d2879c84f52e9d0f77a6b85dfcef2a05184cf ·
val-edge-002 d9451d8e2c45cf325345f737b7c5300a71a034e8ec92ae6622d39fca99345133.

**Run history (honest):** full-scope offline sweeps (heldout included) ran at
admission to produce the committed machinery artifacts; every expectation was
pre-declared by the drafts and no prompt, config, threshold, or expectation
was adjusted in response to a heldout verdict. The `--dev` exclusion proof
(26 of 34 map results, zero heldout keys, scope stamped "dev") ran against a
scratch regeneration and the committed artifacts were restored byte-exact.
The committed full-scope offline artifacts ARE the single post-freeze heldout
machinery run.

## 4. Draft-to-current reconciliation table

Code baseline: `origin/main` = `8a19ade` (which the drafts predate by the
2026-08-27/28 eval merges PR #31 `2c1eac5` + PR #32 `5643b72`).

| # | Draft assumption (2026-08-27) | Current implementation (8a19ade) | Verdict | Proposed admission change |
|---|---|---|---|---|
| R1 | Doc-content validator cap is 1,600 U16; capacity docs need 6,000 (`requiresContractCap: 6000`) | `contracts.ts validateMapCase` still errors >1,600; double-pinned in `contracts.test.ts` | **Still missing** | `contractVersion: 2` datasets validate at ≤6,000; v1 files keep 1,600 (§Phase-4 design) |
| R2 | "Fed cutoff absent from the offline digest harness — `runDigestPipeline` feeds ALL ranked groups" | FALSE now: SCI-N6 landed both sides — `buildDigestVotePrompt` AND `runDigestPipeline` apply `rankGroups(...).slice(0, reduceGroupsFed())` | **Already implemented** | Drop the draft's proposed runner change; correct stale annotations (R6/R7) |
| R3 | "`envKnobs` does not capture `REDUCE_GROUPS_FED`" | FALSE now: `EvalEnvKnobs.reduceGroupsFed` recorded; resume + report comparisons include it (200-default back-compat for pre-2026-08-27 files) | **Already implemented** | Nothing to add (Q2) |
| R4 | Position metadata (`positionBucket`, `charOffsetU16`) is validator-tolerated extra keys; no metric reads it | TRUE: no capacity metric exists anywhere (verified zero grep hits) | **Still missing** | Typed capacityMeta + report-only diagnostics (Q4/Q14) |
| R5 | No knob-fairness rule: a case whose facts sit beyond `MAP_CONTENT_CHARS` is structurally unpassable | TRUE: no applicability mechanism exists | **Still missing** | `classifyCaseApplicability` + `inapplicable` result status (Q1) |
| R6 | dig-c2-cap-002 notes/`currentHarnessVerdict`: "FAIL (event survives because no cutoff is applied)"; `offlineExpectationBasis: "target-v2"`; "must NOT be admitted to a v1 dataset file" | STALE (inverted): under the shipped scorer with fed=200 the rank-230 gid is stripped in all 5 votes and the event DIES — `expectation: "pass"` is now TRUE against current main | **Stale annotation** | Rewrite annotations in the reviewed copy; drop the target-v2 escape hatch; admit with `exactReduceGroupsFed: 200` |
| R7 | dig-c2-cap-003 harnessNote: "runnable today; the current no-cutoff harness gives the same verdict" | STALE (inverted): under default fed=200 BOTH decisive events (ranks 230, 255) are cut and its `expectSurvivingTitles` reference FAILS; it passes only under `reduce-fed-400` | **Stale annotation** | Annotate `exactReduceGroupsFed: 400`; baseline results classify it `inapplicable`; scored in the `+reduce-fed-400` results file. Scorer NOT weakened |
| R8 | dig-c2-cap-001 (fed 200, rank 185): decisive event inside the cut, must survive | Consistent with the shipped cutoff | OK (verify at scoring) | `exactReduceGroupsFed: 200` |
| R9 | dig-c2-cap-004 `droppedGidRefsByHarness: {current-no-cutoff: 0, fedCap-200: 5, fedCap-400: 0}` | "current-no-cutoff" branch is now fictional — the current harness IS fedCap-200 | **Stale annotation** | Re-annotate: expected under fed 200 (`expectDroppedGidRefs: 5` per capacity-fidelity.test.ts's own pin of this shape); `exactReduceGroupsFed: 200` |
| R10 | Capacity profiles assumed as future work | Landed: baseline / map-depth-4000 / map-depth-full / reduce-fed-400 + `withCapacityProfileKey` + estimate matrix | **Already implemented** | Case metadata references the landed profile semantics |
| R11 | `checkNumerals` "v2 corpus sets it"; validator pin promised | Flag + scorer instrument + fidelity hard gate landed; the gist-style validator pin does NOT exist | **Partially missing** | Add `gistNumeralStyleErrors` validator pin; set `checkNumerals` on suitable admitted numeric-fact cases (hardening "numeral-instrument fixtures ride corpus-v2") |
| R12 | Heldout `mustNotMatch` pins (QF-C hardening item 6) ride corpus-v2 | Item 6 is the one un-landed QF-C item | **Still missing** | Verify/strengthen `mustNotMatch` pins on admitted heldout cases at admission |
| R13 | README-DRAFT "31 total / 26 development" | — | **Wrong in draft** | Corrected inventory in §2; repo README written with true counts |
| R14 | check.mts validates against hardcoded release clone `/Users/go/code/bnow-net-rel-20260823` and SIMULATES the v2 cutoff inline | The simulation now duplicates shipped behavior | **Superseded** | Repo check tooling runs against the real harness in-tree; the simulation dies with the drafts |

## 5. The 14 open questions — decision record

For each: Evidence · Alternatives · Decision · Contract/code consequence ·
Heldout/immutability consequence · Deferred risk.

**Q1 — Fed cutoff mechanism.**
Evidence: SCI-N6 landed the production-aligned cutoff in both
`buildDigestVotePrompt` and `runDigestPipeline` (merged 2026-08-28, PR #31);
`capacity-fidelity.test.ts` pins both sides; profiles express fed 200/400.
Alternatives: (a) per-case `targetFedCap` overriding the scorer; (b) env knob
only + case-declared requirement with applicability classification; (c) both.
Decision: **(b)**. The scorer always uses the actually applied knobs
(production-aligned); a case declares `exactReduceGroupsFed`, and a run whose
applied knobs differ is classified STRUCTURALLY INAPPLICABLE — recorded, never
scored, never a binding quality failure. Per-case scorer overrides are
rejected: they would let a dataset silently diverge from the production
configuration it claims to measure.
Consequence: `capacityMeta.exactReduceGroupsFed` (exact semantics — survivor
AND dead-title expectations break in both directions when the cutoff moves) +
`classifyCaseApplicability` + `inapplicable` result status.
Heldout consequence: none of the 5 heldout candidates declares a fed
requirement. Deferred risk: none.

**Q2 — envKnobs extension.**
Evidence: `EvalEnvKnobs.reduceGroupsFed` already exists; resume and
report-time comparisons include it with the documented 200-default for
pre-2026-08-27 results; v1 committed results are byte-stable.
Decision: **no new field, no duplicate**. Strict resume refusal preserved
unchanged. Consequence: none. Deferred risk: none.

**Q3 — Document cap value.**
Evidence: largest draft doc is 5,018 U16 (map-c2-edge-004); 3 docs >4,000; the
deep-tail tier targets `map-depth-full` (20,000); 6,000 leaves ~980 U16
headroom; the packet §7 records "1,600 → 6,000" as the required raise.
Alternatives: stop at 2,500 until a live baseline justifies more; per-case cap
honoring. Decision: **6,000 as the v2 dataset safety ceiling** (a validator
bound on committed fixtures — explicitly NOT a production
`MAP_CONTENT_CHARS` recommendation), version-aware so v1 keeps 1,600.
`requiredMapContentChars`/`minMapContentChars` and profile applicability
preserved. Consequence: `contractVersion: 2` validation limits. Deferred
risk: none (raising further later = contractVersion 3).

**Q4 — Position buckets.**
Evidence: build.py buckets by fact START offset; facts carry measured
`startU16`+`endU16`; the emoji case proves boundary straddling is real
(8-U16 ZWJ cluster spanning index 1500).
Decision: **keep START-offset buckets** for comparability; end offsets stay
recorded per fact; boundary-straddling gets an explicit
`straddlesDefaultKnob1500` flag (validator-checked both directions:
flag ⇔ startU16 < 1500 < endU16) and its own `straddleRecall` diagnostic
rather than being hidden inside one bucket. Consequence: typed `MapDocFact` +
consistency validation. Deferred risk: buckets tied to the 1500 default; a
future default change needs a new flag name (recorded in README).

**Q5 — Gate vs diagnostic.**
Evidence: no representative baseline exists for any capacity metric (zero live
runs ever); gates.ts constants are pre-registered and "no goalpost moves" is
binding (packet §5). Decision: **position-stratified, unique-tail, tail-event,
and late-document recall are REPORT-ONLY diagnostics.** They do not enter
`QUALITY_GATE_METRICS`; a byte-stability test pins that list so any future
promotion is a visible, deliberate act. Structural correctness, safety,
provenance, split completeness, and deterministic machinery gate now (they
already do). Deferred risk: named — metrics may be promoted to gates only
after a live baseline distribution exists and a decision-log entry records
thresholds.

**Q6 — Three claims per map document.**
Evidence: `parseMapResults` caps 0–3 claims/doc in production; every draft
case respects it. Decision: **keep the production bound; out of scope** —
raising it is a versioned prompt/parser experiment (extractor-version bump +
remap #33 implications). Consequence: none. Deferred risk: none.

**Q7 — Filler reuse.**
Evidence: long docs draw rotated, per-batch-disjoint slices of one 58-sentence
hand-authored filler library; near-dupe pairs are deliberate cases; dedup
verdicts in the drafts passed the real `clusterClaims` (<0.35 worst pair).
Decision: **shared filler stays in development cases** subject to the Phase-5
collision/unintended-near-duplicate audit; the 5 heldout cases get an explicit
leakage audit (does shared filler make any heldout verdict predictable from a
development case?); replacement only where that audit fails. Result: audit
executed (§7) — no leakage found, no replacement needed. Deferred risk: none
beyond the recorded audit scope.

**Q8 — Heldout sufficiency.**
Evidence: gates compute heldout minima from results (≥1 per partition, ≥3
total per workload). Unioned v2 datasets (exact arithmetic in §6): map heldout
5(v1)+3(c2)=8 covering all three partitions;
digest heldout 3(v1)+1(c2)=4 covering all three; validation heldout
5(v1)+1(c2)=6 covering all three; reduce-v1 unchanged 5. Decision: **the
unioned datasets satisfy every minimum with no relabeling and no newly
authored case.** The c2 fed-capacity subset has zero heldout of its own —
acceptable because heldout minima are per workload/partition over the union,
not per thematic subset; recorded honestly here. Deferred risk: a future
capacity-only gate would need its own heldout capacity cases (named).

**Q9 — Repeated 260-claim population.**
Evidence: byte-identical ×4 (md5 faa2a246bfcd436356ad7649f0992f1a each),
~720KB; a shared-reference contract would add loader indirection to every
consumer and break "independently hashable dataset files". Decision:
**self-contained repeated fixtures.** Repo cost accepted and noted in the PR.
Deferred risk: none.

**Q10 — Synthetic locality names.**
Evidence: 260 fused names (20 bases × 13 suffixes), never gazetteer-checked
(drafting session had no network). Decision: **run an offline collision check**
against the repo's own gazetteers/validation wordlists plus a static
plausibility sweep; replace-and-regenerate deterministically on any real
settlement match; record the check's scope honestly as NON-EXHAUSTIVE (no
worldwide proof claimed). Result: EXECUTED in two passes — repo gazetteers
zero hits; the maintainer pass substituted the -ivka/-ove rows (Verbove,
Berehove, Piskivka … are real), and the independent content-safety review
flagged two more rows (Krynychi, Yarkove likely real), so FOUR rows were
substituted in total (-ivask/-ovask/-ychask/-kovask; 80 names; machinery
unchanged). Deferred risk: a residual real-name collision outside checked
sources; mitigation = all-fictional framing in dataset provenance + notes.

**Q11 — Promotion-rule coupling (dig-c2-late-001).**
Evidence: the case pins `confirmed` via corroboration promotion, a deliberate
current rule in `finalizeEvents`/publication-guard; datasets are immutable.
Decision: **keep the pin**; record the governing implementation identity in
the case notes (the rule's source file + the admission-time commit); if the
promotion rule changes, the case must be re-minted under a new id/dataset
version — recorded in README. Deferred risk: rule drift creates a visible
scorer-vs-annotation failure, which is the desired loud signal.

**Q12 — red_sea theater probe.**
Evidence: `classifyTakeawayTheater` (src/lib/validation/keywords.ts) reads
`TOPONYM_THEATER[t]` and falls through to "both" for unknown tokens —
confirmed at admission; `theaterProbes[].toponyms` is a free string list.
Decision: **replaced `red_sea` with the explicitly synthetic off-gazetteer
sentinel `varn_strait`** (probe token, takeaway text "southern Varn Strait",
and the notes prose), removing the silent-meaning-flip risk should red_sea
ever join the gazetteer. Executed in the admission transform; the case's
expectKeyword/label pins re-verified by the offline run (still matches no
claim); score-validation.test.ts pins `varn_strait → both` through the real
classifier. Deferred risk: none — the token is fictional by construction.

**Q13 — Arabic fixture (map-c2-adv-005).**
Evidence: quotes verified through the real `verifyQuote` NFKC normalization;
NO native-speaker review is available in this session and none is claimed.
Decision: **admit as development, diagnostic/non-binding**: the case is
labeled in notes and README as pending human native-speaker linguistic/safety
review; it is excluded from any binding aggregate its verdict could distort
(it carries no gate of its own — map gates aggregate heldout only, and this
case is development split, so exclusion is structural). An AI-assisted review
is recorded as exactly that, never as "native-speaker review". The question
stays OPEN with its resolving condition: a human native-speaker review,
recorded in a future decision-log entry. Deferred risk: named above.

**Q14 — Metric naming.**
Decision: **namespaced capacity diagnostics** under a `capacityDiagnostics`
aggregate: `positionRecall.{early,mid,tail,deep-tail}` (matched/expected per
bucket over capacity-annotated expected claims), `straddleRecall`,
`uniqueTailLoss` (lost/uniqueTail over factKey-unique tail facts),
`tailEventRecall` ({survived, fed, unfed} over declared decisive events; unfed
excluded from any ratio and reported), `lateDocumentRecall` (cited/total over
declared late claim ids). Every metric defines denominator and an explicit
`unavailable` state (no metadata ⇒ whole block null; empty denominator ⇒
per-metric unavailable). Documented as UNVALIDATED diagnostics — not
statistically validated quality gates. Consequence: `qualityOf`/aggregate/
renderer additions only; gates untouched.

## 6. Dataset topology and counts (final)

- **Proposed c2 cases: 26. Admitted: 26. Provisional: 0. Excluded: 0.
  Newly authored: 0.** (map-c2-adv-005-translation-denial-ar is admitted with
  an explicit DIAGNOSTIC limitation pending native-speaker review — Q13; it
  is development-split, so it carries no gate weight by construction.)
- map-v2.json = 18 map-v1 cases (input/reference/offline byte-frozen,
  test-pinned) + 16 c2 = **34** (dev 26 / heldout 8: typ 1, edge 4, adv 3).
- digest-v2.json = 10 digest-v1 + 7 c2 = **17** (dev 13 / heldout 4: 1/1/2).
- validation-v2.json = 14 validation-v1 + 3 c2 = **17** (dev 11 / heldout 6: 1/4/1).
- reduce-v1.json unchanged (**14**; heldout 5: 1/1/3) — no new reduce-workload
  cases; the four fed-cutoff cases are workload=digest by the drafts' own
  (correct) rationale: the cutoff lives in synthesize.ts.
- Union total across the four active datasets: **82 cases, 23 heldout.**
  Every workload/partition exceeds the gate minima
  (MIN_HELDOUT_CASES_PER_PARTITION=1, MIN_HELDOUT_CASES_TOTAL=3) with no
  relabeling (Q8).
- Contract topology: v2 files carry `contractVersion: 2` (6,000-U16 dataset
  safety ceiling + typed capacity metadata); v1 files stay committed
  byte-identical at their historical paths with their committed results
  untouched. The CLI's `DATASETS` table names new results basenames
  (`map-v2-…`/`digest-v2-…`/`validation-v2-…`; reduce keeps its historical
  name) so no historical results file can be identity-collided.
- Committed v2 offline results (one per meaningful capacity cell): map
  baseline / +map-depth-4000 / +map-depth-full; digest baseline /
  +reduce-fed-400; validation baseline. Each cell scores exactly the cases
  its knobs can honestly measure; the rest are recorded `inapplicable`.

## 7. Content, safety, and provenance audit (Phase 5 — executed)

- **Fictional identities:** name-shaped-bigram sweep + independent review over
  all 26 admitted cases found exactly the three declared fictional persons
  (Arkady Luzhenkov, Omid Zangaraki, Yegor Stavitsky) and the declared
  fictional org (Jabhat Sahil al-Fajr). No undeclared person or org names.
  Fictional names are also machine-recorded in `capacityMeta.fictionalPersons/
  fictionalOrgs` on their cases.
- **Real places (corrected inventory per independent review — the bigram
  sweep sees only two-word names):** ~20 real toponyms appear, all as
  LOCATIONS of synthetic events, consistent with v1 precedent — Kherson,
  Kupyansk, Oskil, Bryansk, Vyazma, Lyman, Siversk, Balakliia, Rostov,
  Odesa, Bandar Abbas, Chabahar, Konarak, Jask, Bandar-e Mahshahr, Belgorod,
  Kramatorsk, Hulyaipole, Izium, Barvinkove, Millerovo, plus probe tokens.
  In practice the corpus's real-place norm is "synthetic CONFLICT-PLAUSIBLE
  events at real locations" (e.g. the Millerovo airfield fuel-depot claim),
  not only mundane ones — stated here so the policy reads accurately. The C2
  corpus contains zero Red Sea references (the frozen v1 case
  map-typ-005-ir-redsea retains its location prose by immutability — that is
  location usage, not the Q12 gazetteer-token risk).
- **No ISW prose / no copied source text:** all content is emitted by the
  deterministic generator (fixed literal wordlists + hand-written filler
  sentences); nothing is scraped or quoted from any source. Long capacity
  docs are synthetic channel-housekeeping filler around planted facts.
- **Locality collision check (Q10, executed):** the 260 fed-population names
  were reproduced from the generator arithmetic and screened against repo
  gazetteers (zero hits), maintainer knowledge, AND the independent
  content-safety review. Four suffix rows collide with real Ukrainian
  settlement patterns — -ivka/-ove caught by the maintainer pass (Verbove,
  Berehove, Dubove, Klynove, Verbivka, Piskivka, Kholmivka are real places)
  and -ychi/-kove by the independent review (Krynychi, Yarkove likely real);
  all 80 names in those four rows were substituted with the clearly synthetic
  -ivask/-ovask/-ychask/-kovask rows across claims AND vote fixtures
  (pre-admission change, regenerated deterministically, zero machinery
  changes — the expectEventCount/droppedGidRefs pins re-verified singleton
  clustering). The remaining nine suffix rows were screened and kept
  (near-misses considered as distinct spellings: Luhyne vs Luhyny, Haisyne vs
  Haisyn, Brodianka vs Borodianka). Scope recorded honestly: NOT an
  exhaustive worldwide proof.
- **Quote fidelity:** the Arabic case's quotes verify through the real
  `verifyQuote` NFKC path (its committed compliant fixture scores pass);
  `mustQuoteFromDoc` gold pins are exercised by the offline run.
- **Numeral fidelity:** `checkNumerals` enabled on 9 map cases; the validator
  numeral-gist pin (`gistNumeralStyleErrors`) passes over every gist (no
  compound number-words), and every applicable fixture preserved its
  numerals (machinery all-OK).
- **Injection markers / publication safety / quiet-day precision /
  hedging-attribution:** carried by the drafted references (injectionPatterns
  on both injection cases with typed payload offsets; expectGuardStats +
  mustNotMatch on dig-c2-safe-001; quietControl docs validator-pinned to
  zero expected claims; hedging golds all "claimed" with the strengthening
  fail-fixture on adv-004) and verified by the committed offline runs.
- **No duplicate IDs / no v1 collision:** validator + compose both enforce;
  the frozen-subset test pins v1 content inside v2.
- **No hidden environment dependence:** offline scoring is byte-deterministic
  across independent runs (§8); the generator uses no RNG/clock; composition
  is pure; fixture ordering comes from committed file order, never directory
  enumeration.
- **Filler-reuse leakage audit (Q7, executed):** the shared 58-sentence
  filler library appears in rotated, per-batch-disjoint slices; heldout
  verdicts hinge exclusively on planted facts unique to each case (frozen
  hashes above), and no development case's filler or facts reveal a heldout
  case's expected claims. Structural parallels (edge-005 dev ↔ edge-006
  heldout near-dupe design) share shape, not content. No replacement needed.
- **Provenance:** every admitted case carries
  `authored-2026-08-27; admitted-2026-09-03 after maintainer review (…)`.
  The generator is preserved byte-identical (manifest hash 00818a79…) at
  `scripts/evals/corpus-v2/build-draft.py`; EVERY admission delta lives in
  `src/lib/evals/corpus-v2-admit.ts` (typed-metadata migration, stale-note
  corrections, item-6 pins, checkNumerals, Q10 substitution, Q12 sentinel,
  provenance rewrite), each commented with its adjudication.

## 8. Deterministic verification evidence (Phase 6 — executed; provider keys
absent, no production DB)

- Dataset validation: `--validate-dataset` passes all SEVEN committed files
  (map/digest/validation v2 + all four v1) with the expected counts.
- Deterministic regeneration: `scripts/evals/corpus-v2/check-regen.sh`
  PASSED — python3 regenerates the five drafts byte-identical to the
  preserved-originals manifest, and admit+compose over them byte-matches
  every committed fragment and v2 dataset (`run-admit.ts --check` clean).
- Offline determinism: two independent `--offline --workload map` runs
  produced byte-identical results files modulo the header `updatedAt`
  timestamp (runId is deterministic).
- Machinery: zero MACHINERY MISMATCH lines across all six committed v2
  offline cells; every applicable fixture matches its declared expectation;
  deliberate-fail fixtures still fail (converted to pass nowhere).
- Heldout exclusion: `--offline --dev` scored 26 of 34 map cases with ZERO
  heldout caseIds present and scope stamped "dev" (exact-set check);
  committed artifacts restored byte-exact afterwards.
- Applicability matrix (committed-artifact pins, capacity-fidelity.test.ts):
  dig-c2-cap-003 inapplicable at baseline / scored+pass under
  +reduce-fed-400; dig-c2-cap-002 the mirror image; map-c2-edge-004
  inapplicable through depth 4000 / scored under map-depth-full; every v2
  offline file COMPLETE.
- Resume/identity refusal: CLI-level demonstration — a one-character dataset
  edit made `--offline` refuse with the datasetContentHash pair printed
  (restored afterwards); unit pins cover promptHash / schema / extractor /
  envKnobs (fed-cap + map-depth) / repetitions drift; contract-version drift
  is covered by datasetVersion + datasetContentHash (v1↔v2 files can never
  resume into each other) and unknown `contractVersion` values fail
  validation closed.
- Mutation proofs: disabling the map applicability branch failed exactly the
  applicability tests (2); deleting the positionRecall accumulation failed
  exactly the capacity-metrics tests (2); both restored, suite green.
- v1 identity stability: the committed v1 promptHash/schemaVersion tests pass
  unchanged (v1 files byte-untouched).
- Gates: typecheck clean · lint 0 errors (3 pre-existing warnings on
  origin/main) · unit **3,545/3,545 (244 files)** (baseline on untouched
  origin/main: 3,508/241) · production build PASS · integration suite
  **160/160 (25 files)** on a disposable Neon branch
  (br-lingering-bread-atbh8eii, created fresh, deleted after — the
  repo-sanctioned fork→test→delete flow; NOT production access).
- Offline isolation: structural (isolation.test.ts pins the only
  OpenAI-capable module + the CLI's static import surface + the new
  run-admit.ts pure-module allowlist; cli-dynamic-imports.test.ts pins the
  dynamic specifiers; hardening-cli.test.ts proves report/offline modes
  DB-free in a blanked-env subprocess). All eval commands in this program ran
  with OPENAI_API_KEY/DATABASE_URL explicitly unset. No EVAL_* variable, no
  candidate-model variable, no routing variable, no Vercel environment
  variable was created or changed; no production DB query or write occurred
  for corpus work.

## 9. Independent review findings and resolutions (Phase 7 — executed)

Six fresh-context reviews ran over the full diff + decisions (contract/
identity, scoring science, heldout discipline, legal/content safety, offline
isolation/spend/secrets, fixture discriminative quality). **Zero BLOCKERs.
Two MAJORs, ten MINORs, assorted NITs** — every confirmed finding resolved or
explicitly accepted below; affected verification re-ran after remediation
(all six offline cells regenerated, scorecard + matrix regenerated, full
regen proof re-PASSED, unit 3,547/3,547).

**MAJORs (both fixture-quality):**
- *adv-006 surrogate-split rationale geometrically wrong* (cluster spans U16
  [1495,1503); offset 1500 lands on the second ZWJ, so a 1500-cut is
  well-formed regardless; no configured cell cuts this doc at 1500). FIXED by
  an admission-correction note on the case recording what it actually
  discriminates (U16-offset integrity in emoji-dense content, the straddling
  ferry fact requiring depth 1600, numeral fidelity); no input/reference
  change (development case; verdicts unaffected).
- *Corpus-wide attributed-sentence regularity*: every extractable gold fact is
  an "X said/reported Y" sentence while filler carries none — a
  template-aware candidate could ace relevance selection and quiet-day
  precision without the underlying capability (depth capacity remains
  honestly measured: no template reads past a truncation). ACCEPTED as a
  RECORDED LIMITATION: the planned campaign evaluates generic hosted models
  that are not tuned on this corpus (the heldout discipline forbids exactly
  that tuning), and the affected signals are diagnostics/baseline-pairwise,
  not absolute thresholds. Named follow-up: the next corpus generation must
  interleave decoy attributed sentences in filler and vary fact framing.
  Documented in the README limitations note.

**MINORs, all fixed:**
- Validator hole: a >1,600-char v2 doc with NO capacity object escaped the
  requiresContractCap check → check made unconditional (contracts.ts).
- sliceStats counted inapplicable rows in its "X/Y passed" fractions while
  its own rate excluded them → slices now exclude inapplicable (runner.ts);
  scorecard regenerated.
- Frozen-subset test pinned only input/reference/offline → now WHOLE-CASE
  JSON equality for every v1 case inside its v2 union (contracts.test.ts).
- isolation.test.ts run-admit allowlist matched static `from` imports only →
  matcher now covers `import(`/`require(` forms.
- Committed scorecard was stale (generated before the Q10 substitution
  rewrote digest-v2) → regenerated from the final artifacts; slice render
  verified internally consistent.
- Truncated map responses escaped capacity accounting (flattering the
  diagnostics) → truncated rows now count capacity-annotated expected claims
  as expected-and-lost (score-map.ts).
- No length backstop for the digest representative-text citation rule (the
  finalizeEvents 200-char publication slice) → digest claim textEn now
  validator-capped at 200 (all committed cases ≤125).
- cap-004 omitted the `expectDroppedGidRefs: 5` pin the reconciliation table
  (R9) promised → pin added via the admission transform; regenerated;
  machinery unchanged.
- Q10 residue: the retained -ychi/-kove rows still produce likely-real
  settlements (Krynychi, Yarkove) → substitution extended to FOUR rows
  (-ivka/-ove/-ychi/-kove → -ivask/-ovask/-ychask/-kovask); zero residual
  risky names; near-misses (Luhyne/Haisyne/Brodianka) considered and kept as
  distinct spellings.
- Singleton-clustering margin (worst pairScore 0.340 vs threshold 0.35)
  unpinned → committed-population test added asserting 260 singletons.
- No mixed-population aligned-exclusion test → added (inapplicable pair +
  degraded pair disjoint, non-negative).
- §7's real-place sentence understated usage → corrected below.

**Accepted residuals (documented, no code change):** tailEventRecall trusts
the authored rank (mitigated by the token-disjoint singleton population, the
admission-transform rank pins, and the loud droppedGidRefs/dead-title
reference pins); lateDocumentRecall counts a guard-dropped late allegation as
"uncited" (a safety success reads as a capacity miss in a REPORT-ONLY
diagnostic — dig-c2-safe-001's committed 0/1 is exactly this); pins on
expected-fail fixtures could in principle mask a future loss of the original
failure mode (currently zero-firing, original failure strings
regression-visible); mustMatch patterns test the joined claim corpus, so
attribution words can ride a different claim (backstopped by the per-claim
hedging-field checks); "frozen before implementation" rests on commit
topology + attestation; machine-local absolute paths appear in this report as
deliberate provenance; a live run whose every case is inapplicable still
constructs the (zero-dispatch) client behind the full operator preflight;
fictional allegation surnames sit near real corruption-associated figures
(Stavitsky~Stavytskyi, Luzhenkov~Luzhkov) — declared fictional everywhere,
gold requires suppression, cases frozen; future minting should pick more
distant surnames.

## 10. Statements required at admission (final)

- **26 proposed c2 cases; 26 admitted; 0 provisional; 0 excluded; 0 newly
  authored.** Total unioned datasets by workload (dev/heldout): map-v2 34
  (26/8: typ 1, edge 4, adv 3) · digest-v2 17 (13/4: 1/1/2) · validation-v2
  17 (11/6: 1/4/1) · reduce-v1 14 unchanged (9/5: 1/1/3). Union 82 / 23
  heldout.
- **Gates vs diagnostics:** gating is UNCHANGED — completeness, the
  pre-registered hard invariants, and the aligned-heldout pairwise
  QUALITY_GATE_METRICS (byte-stability test-pinned). The five capacity
  metrics (positionRecall buckets, straddleRecall, uniqueTailLoss,
  tailEventRecall, lateDocumentRecall) are REPORT-ONLY diagnostics; promoting
  any requires a live baseline distribution + a decision-log entry.
- **Conditionally deferred:** Q13 stays OPEN with its resolving condition (a
  human native-speaker review of the Arabic case; OPEN-TASKS #104; the case
  is development-split diagnostic meanwhile). Q5's gate promotion is deferred
  on a live baseline. The Q10 residual (collisions outside checked sources)
  and the attributed-sentence template limitation (§9) are named risks with
  recorded mitigations.
- **No live baseline or candidate evaluation has occurred. No model has been
  approved or activated.** The analysis registry holds baseline-only entries;
  `--execute-live` was never run; `results/live-*` is empty and gitignored.
- **The preserved originals are unchanged:** manifest re-verified 8/8 OK at
  closeout (see the closeout line in §1).
- **Zero paid provider calls, zero production DB operations (the integration
  suite ran on a disposable Neon fork per the repo's sanctioned flow), zero
  environment edits, zero deploys, zero migrations** occurred in this
  workstream's implementation. (The separate 2026-09-03 docs-reconciliation
  commit RECORDS the operator's own earlier configuration-only release; this
  workstream performed read-only verification of it and repeated nothing.)
