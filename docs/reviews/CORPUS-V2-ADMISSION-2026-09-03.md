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
bytes (e.g. the mechanical typed-capacityMeta migration) are enumerated in
§[PENDING] with per-part diffs against the frozen hashes; any delta touching
`input`/`reference`/`offline` semantics beyond mechanical re-shaping would
demote the case out of heldout.

Post-freeze single heldout run: [PENDING]. Admitted-basis hashes: [PENDING].

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
development case?); replacement only where that audit fails. Result:
[PENDING]. Deferred risk: recorded in the audit outcome.

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
worldwide proof claimed). Result: [PENDING]. Deferred risk: a residual
real-name collision outside checked sources; mitigation = all-fictional
framing in dataset provenance + notes.

**Q11 — Promotion-rule coupling (dig-c2-late-001).**
Evidence: the case pins `confirmed` via corroboration promotion, a deliberate
current rule in `finalizeEvents`/publication-guard; datasets are immutable.
Decision: **keep the pin**; record the governing implementation identity in
the case notes (the rule's source file + the admission-time commit); if the
promotion rule changes, the case must be re-minted under a new id/dataset
version — recorded in README. Deferred risk: rule drift creates a visible
scorer-vs-annotation failure, which is the desired loud signal.

**Q12 — red_sea theater probe.**
Evidence: `classifyTakeawayTheater` gazetteer inspected at admission
[PENDING — confirm off-gazetteer status and fall-through-to-"both" behavior];
the probe's value is "off-gazetteer input falls through to both".
Decision: **replace `red_sea` with an explicitly synthetic off-gazetteer
sentinel token** if the probe contract accepts an arbitrary toponym cleanly
(it does — `theaterProbes[].toponyms` is a free string list); this removes the
silent-meaning-flip risk should `red_sea` ever join the gazetteer. A
regression test pins the sentinel as off-gazetteer. Executed form: [PENDING].
Deferred risk: none once synthetic.

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

## 6. Dataset topology and counts

[PENDING — filled at composition; planned:]
- map-v2.json = 18 map-v1 cases (input/reference/offline byte-frozen) + 16 admitted c2 = 34 (heldout 8: 5 v1 + 3 c2).
- digest-v2.json = 10 digest-v1 + 7 c2 = 17 (heldout 4: 3 v1 + 1 c2).
- validation-v2.json = 14 validation-v1 + 3 c2 = 17 (heldout 6: 5 v1 + 1 c2).
- reduce-v1.json unchanged (14; heldout 5).
- Proposed c2: 26. Admitted / provisional / excluded: [PENDING].

## 7. Content, safety, and provenance audit

[PENDING — Phase 5.]

## 8. Deterministic verification evidence

[PENDING — Phase 6.]

## 9. Independent review findings and resolutions

[PENDING — Phase 7.]

## 10. Statements required at admission

[PENDING — final: proposed/admitted counts, gate-vs-diagnostic listing,
conditionally deferred questions, no-live-eval / no-activation / originals
unchanged / zero-paid / zero-prod-DB / zero-env / zero-deploy / zero-migration
confirmations.]
