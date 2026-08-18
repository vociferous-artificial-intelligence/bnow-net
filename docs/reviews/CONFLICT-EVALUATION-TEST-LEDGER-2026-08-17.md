# Conflict-evaluations workstream — test ledger

Exact commands, counts, failures, timings per phase. Baseline (base commit
`7150b49`, this worktree, Node v24.14.0/npm 11.9.0):

| Stage | Command | Result |
|---|---|---|
| Base sanity (`7150b49`, fresh worktree) | `npm test` | **2,402 passed / 2,402 (185 files)** — matches the QF final tally exactly |
| Base sanity | `npx tsc --noEmit` | clean |

Entries appended per phase below.

## Phase 0 (branch `codex/conflict-evaluations-p0-contract`, tip `40d6775`)

| Gate | Command | Result |
|---|---|---|
| clean diff | `git diff --check` | clean |
| zero behavior change | `npm test` | **2,402 passed / 2,402 (185 files)** — identical to base (Phase 0 adds docs + fixture JSON only) |
| fixtures parse | python3 json.load × 3 files | roca 10 / iran 12 / crosscutting 16 scenarios OK |
| fixture content validation | ad hoc script (recorded in `fixtures/conflicts/README.md`) | ALL CHECKS PASS (lanes ∈ §4 taxonomies; exclusion reasons ∈ bounded enum; verdict vocab; contribution only on corpus-recall matches; global id uniqueness; text caps; the prose-audit sentinel token exactly once (spelled only in the fixture unit and its README, per the containment rule)) |

### Gate 0 remediation (tips `f7127e2` legal, `cca5d9d` + `9bd42db` science)

| Gate | Command | Result |
|---|---|---|
| clean diff | `git diff --check` | clean |
| zero behavior change | `npm test` at `9bd42db` | **2,402 passed / 2,402 (185 files)** — unchanged |
| fixture revalidation | extended ad hoc validator (transcript in fixtures README) | ALL CHECKS PASS — 39 scenarios / 41 units / 48 claims / 50 docs; precedence + headline arithmetic mechanically recomputed; sentinel containment 1 |

Gate 0 initial verdicts: product/legal **FAIL (narrow: HIGH-1 contract
incompleteness; fixtures legally clean)**; scope/science **FAIL (narrow: H1
unavailable-verdict hole, H2 matcher-ladder contradiction)**. Both remediated
(register #7/#8). Focused re-reviews on `ea35fbf`: product/legal **PASS**;
scope/evaluation-science **PASS-WITH-MINORS** (3 NOTEs — two fixed in the
Gate-0 closing commit, the vague-claim fixture pin deferred to P4 by register
#9). GATE 0: PASSED.

## Phase 1 (branch `codex/conflict-evaluations-p1-domain`, tip `975cdcd`)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author + coordinator + reviewer, independently) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **2,598 passed / 2,598 (193 files)** — base 2,402 + 196 conflicts-domain tests; zero base regressions |
| clean diff | `git diff --check` + tree | clean |
| scope | `git diff 0df9106..975cdcd --stat` | only `src/lib/conflicts/` (+ decision register); freeze list untouched |
| binary check | phases.ts NUL sweep | 0 NUL bytes in HEAD blob; forward diffs textual |

Gate 1 (independent architecture reviewer): initial verdict on `0d7ab8f`
**FAIL** — MAJOR-1 (iran_regional legacy contributor roster designated the two
digest-less scaffolded theaters and omitted the four digest-producing ones,
unsupported by any designation record) and MAJOR-2 (`ConflictResultV1` could
not express the fixture-pinned publication-gap `unavailable` result without
fabricating an edition identity), plus 4 MINORs / 5 NOTEs. Remediated in four
commits (`63547de`..`975cdcd`; register #10 records the roster designation).
Focused re-review on `975cdcd`: both MAJORs DISCHARGED (roster grounding
re-checked at source, compile-level gap-variant exclusion mutation-proven),
all MINOR/NOTE dispositions verified, judgment calls ratified. Remaining
NOTEs are non-blocking and carried to P2/P3 charters (cutoff-ordering
diagnostic, editionKey normalization, lane-helper routing).
**Verdict: PASS. GATE 1: PASSED.**

## Phase 2 (branch `codex/conflict-evaluations-p2-reference`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author, coordinator, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **2,682 passed / 2,682 (199 files)** at `e292ab3` (base 2,598 + Phase 2; conflicts suite green under TZ=America/New_York, UTC, Asia/Tokyo, Pacific/Kiritimati) |
| integration (full) | `npm run test:integration` (disposable Neon forks, paid keys blanked, LLM_DISABLE=1) | **127 passed / 127 (20 files)** — base 119 + 8 conflict-reference cases; the target file additionally run TWICE (normal + `TZ=Asia/Tokyo`, 8/8 each); all forks deleted |
| scope | range diffstat | only `src/lib/conflicts/`, `src/integration/`, `docs/designs/`, `docs/reviews/`; freeze list untouched; drizzle/journal untouched |
| legal | both reviewers' sweeps | no ISW prose persisted or persistable (extraction returns instants/enums/booleans only); no credentials/branding; sentinel absent |

Critical Gate 2 (two independent reviewers): initial verdicts on `651b9d6`
**FAIL + FAIL**, CONVERGING on the same MAJOR — the SQL backend read Postgres
`date` columns via `toISOString()` on driver values constructed at LOCAL
midnight, shifting every `report_date` read back one day east of UTC (proven
independently: 3/6 itest failures under TZ=Asia/Tokyo; a driver-faithful
oid-1082 probe). Time/edition review added m-1 (explicitly-not-final edition
could silently win daily-final selection) and m-2 (prior-reference guard
defeated by markup/intervening word — visible window-widening direction);
DB/legal review added 4 MINORs (DDL label/isw-url CHECKs, designated-final
partial unique index, non-monotone day-status upsert, count-shaped
non-interference proof) + 4 NOTEs. Remediated in six commits
(`f90322b`..`e292ab3`), incl. the committed P2 implementation report both
reviews required. Focused re-reviews on `e292ab3`: DB/legal **PASS** (all
findings discharged; TZ=Asia/Tokyo itest independently re-run 8/8);
time/edition **PASS-WITH-MINORS** (M-1/m-1/m-2 discharged with mutation
proofs; R-1 one-clause doc direction fix + R-2 cast-pin NOTE — both applied
in the Gate-2 closing commit). Adjudication of record: edition records are
DISCOVERY METADATA, not §8 as-published results, with two carried conditions
(persisted evaluation results stamp their window inputs — binds P4/P5;
durable anchor-change journaling — design §5 deferral).
**Verdicts: PASS + PASS-WITH-MINORS. GATE 2: PASSED.**

## Phase 3 (branch `codex/conflict-evaluations-p3-evidence`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author, coordinator, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **2,920 passed / 2,920 (205 files)** at `9fef8b7` (base 2,683 + Phase 3; conflicts package 518/518 also under TZ=Asia/Tokyo) |
| acceptance corpus | fixture-corpus.test.ts via the real engine | all **40** scenarios (39 + additive `cc-other-in-scope-018`) / 50 claims reproduced exactly; corpus additions-only (105 ins / 0 del) |
| scope | range diffstat | only `src/lib/conflicts/`, `fixtures/conflicts/` (additive), `docs/reviews/`; freeze list untouched; no itest surface touched (integration baseline stays 127/20) |
| legal | pre-gate + gate sweeps | no prose persisted or persistable; traceability shape enforced (no record without a non-mirror doc); rosters org/role-only; sentinel spelled zero times |

Critical Gate 3 (two independent reviewers): initial verdicts on `5f1844c`
**FAIL + FAIL**, non-overlapping MAJORs, all runtime-proven. Evidence/
source-fidelity: bare-token actor entries (yemen/al-salif/oman/belarus)
granted scope AND governed lanes for neutral claims (five probe sentences
admitted), contradicting the roster's containment claim; + corpus-recall
theater-comparability hole, off_scope sub-cause loss. Query/perf/ops: the
mix cap collapsed in the realistic all-null-platform corpus (20/0 flood
selection; reliability-first refill re-concentration), assemblies were not
byte-deterministic (3 instances), the limits guard failed OPEN on NaN, and
the future-DB contract lacked a bound query outline + intake ceiling.
Remediated in six commits (`f6dcdaa`..`9fef8b7`) incl. the committed P3
implementation report whose §5 carried conditions BIND P4/P5 (results stamp
window inputs + selection limits + roster/classifier/taxonomy/policy/
extractor versions). Focused re-reviews on `9fef8b7`: ops **PASS** (all
probes re-run; 7 mutations killed by named tests; pre-remediation behavior
cannot return unguarded); evidence **PASS-WITH-MINORS** (all discharged; 4
mutations; one NOTE-grade documented residual — the houthi guard's
shipping-token coarseness, versioned revision path recorded). The ops
re-review's overflow-sentinel NOTE (fetch EVIDENCE_MAX_INTAKE+1 so over-limit
days refuse visibly) is folded into the query contract in the closing commit.
**Verdicts: PASS + PASS-WITH-MINORS. GATE 3: PASSED.**

## Phase 4 (branch `codex/conflict-evaluations-p4-scoring`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (coordinator, four pre-gate verifiers, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **3,050 passed / 3,050 (214 files)** at `192c082` (base 2,920 + Phase 4; conflicts package 648/648 also under TZ=Asia/Tokyo) |
| goldens | drift gate (`goldens.test.ts`) | committed `fixtures/conflicts/goldens/golden-results-v1.json` (14 byte-stable results incl. 2 ladder variants) byte-identical through BOTH remediation rounds; regeneration deterministic |
| acceptance corpus | scorer-acceptance loop via the real pipeline | all **41** scenarios (40 + additive `cc-vague-claim-019`) reproduce every deferred expectation: verdict maps, 5 headline pins, contribution, missDiagnostic, laneDiagnostics, independentSources, matcherFixture ladder variants |
| scope | range diffstat | only `src/lib/conflicts/`, `fixtures/conflicts/` (additive), `docs/reviews/`; freeze list untouched; production `llm-match.ts`/`keywords.ts` reused via exports, never edited |
| purity | `matcher-import-hygiene.test.ts` + reviewer greps | no provider SDK import, no env-dependent path; full k=5 match under fully blanked env from injected votes; zero paid calls all rounds |

Phase 4 authorship note: implementation spanned two session-limit
interruptions; the coordinator committed the salvaged tree (impl commit
proven to build standalone) and the resumed takeover agent's hardening
converged with it — the race is disclosed in the P4 report §8. FOUR
independent pre-gate verifications (2 fidelity, 2 legal) were all clean
before the formal gate.

Critical Gate 4 (two independent reviewers): initial verdicts on `5b38007`
**FAIL (science) + PASS-WITH-MINORS (legal)**. Science MAJOR: `units: []`
produced a PERSISTABLE scored 0/0 headline (the §6.4-forbidden case); plus
thinSourced behaviorally unpinned (a boundary mutation survived all 637
tests), a proven keyword-rung toponym-only false agreement (Kharkiv probe,
0.625 ≥ 0.6 with no action compatibility), and duplicate-vote-entry
hard-fail. Legal MINORs, all empirically proven: stride-3 prose-scan
evadable by unaligned fragments; raw window anchors an ungated free-text
channel; offline formatter fabricated zeros on stripped input and
under-disclosed mixed rungs. Remediated in five commits
(`8779233`..`192c082`) with goldens byte-identical throughout (the new
keyword action-class gate landed with zero blast radius). Focused re-reviews
on `192c082`: **PASS + PASS** — every original probe re-run and caught,
including a mutation proving the persistence gate catches 0/0 end-to-end
even without the scorer refusal. NOTE-grade residuals recorded with owners:
≤64-char anchor-clause tightening option (P5); requested-k-through-fallback
(BINDING P5); per-population partial counts + pair-weighted timing-median
documentation (BINDING P6); action-gate deflation on non-canonical action
wording ("shelled"/"artillery struck" false-miss — deflationary only) →
production-gazetteer follow-up.
**Verdicts: PASS + PASS. GATE 4: PASSED.**

## Phase 5 (branch `codex/conflict-evaluations-p5-adapter`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (coordinator, both pre-gate verifiers, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **3,110 passed / 3,110 (219 files)** at the closing tip (base 3,050 + Phase 5; conflicts+evals green under TZ=Asia/Tokyo) |
| goldens | drift gate | byte-untouched EXCEPT the one sanctioned Gate-4-obligation re-baseline (2 keys in the ladder B-variant: votesK null->5, runGroupKey k=0->k=5), audited exact by both reviewers |
| CLI (zero-provider) | `scripts/analysis-eval.ts --profile conflict` modes with blanked env + fake-key probes | validate-dataset 8+6 cases OK; offline 14/14 with byte-identical committed artifacts (mod updatedAt); estimate $0.0031 explicitly hypothetical; every live/equals-form/unknown-token refusal exit 2 BEFORE client construction (subprocess-pinned) |
| scope | range diffstat | src/lib/{evals,conflicts}/ + scripts/analysis-eval.ts (sanctioned additive hunks only, classified line-by-line) + fixtures goldens (sanctioned) + docs; inherited evals plane byte-unchanged; isolation test unmodified 6/6 |

Critical Gate 5 (two independent reviewers): initial verdicts on `022d3c1`
**FAIL + FAIL**, non-overlapping MAJORs. Ops: the GNU `=` flag spelling was
silently discarded, bypassing the new refusals and reaching the GENERIC paid
live path's client construction under mixed spelling + provisioned env.
Control-plane: register #5's terminal rung was caller-skippable — the scorer
and persistence gate both passed a scored snapshot-kind result minted WITHOUT
resolution (two proven probe cells). Plus: snapshot refs silently dropped on
gap paths (both scorer and wiring layers), the adapter's persistence-gate
call mutation-uncovered (0/801 kill), dataset identity not covering
derivation logic, the dynamic-import pin gap, heldout unmasked in the
conflict report section. Remediated across `82ad8c0`..`2e1422b` (incl. the
register-#5 twin guards, the equals refusal, derivation-covered identity with
a sanctioned exact-line artifact refresh, the additive dynamic-import pin,
and the gap-branch wiring fix that closed the ops reviewer's mid-interruption
probe). Focused re-reviews on `2e1422b` (both re-run after a session-limit
interruption; orphaned reviewer worktrees verified clean and removed):
control-plane **PASS** (twin-guard property mutation-proven; derivation-gap
re-probed closed; artifact refresh audited line-by-line); ops
**PASS-WITH-MINORS** (all discharged; residual MINOR: the equals guard was
lowercase-long-form only — hardened to `/^-[^=\s]+=/` with uppercase/short-
dash pins in the Gate-5 closing commit). Register-#3 fallback trigger
adjudicated NOT met (workload honesty verified); no isolation-test amendment
needed; no new register entry required.
**Verdicts: PASS + PASS-WITH-MINORS. GATE 5: PASSED.**

## Phase 6 (branch `codex/conflict-evaluations-p6-product`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean |
| lint | `npm run lint` | clean (0 errors, 0 warnings) |
| unit | `npm test` | **3,166 passed / 3,166 (225 files)** (base 3,110/219 + 56 Phase-6 tests in 6 files; zero base regressions) |
| integration (full) | `npm run test:integration` (disposable Neon fork, paid keys blanked, LLM_DISABLE=1) | **150 passed / 150 (21 files)** — base 127/20 + 23 `conflict-feature-off.itest.ts` cases (production build; bare-GET + RSC + accepted-session BODY assertions, flag absent AND flag ephemeral-on; positive control non-vacuous); fork deleted |
| build | `npm run build` (flag absent, dummy non-contact env) | PASS, warning-free; all four conflict routes ƒ (dynamic) |
| guard-order mutation proofs | delete `requireAcceptedUser` from the evidence page; remove the overview's leading feature guard | fail exactly 3/7 and 2/9 cases respectively, nothing else; both reverted |
| browser matrix | production serve on :3141, flag injected ephemerally; headless Chrome 151 + CDP media emulation | screenshots/PDFs/metrics in session scratchpad; 390px document-overflow bug FOUND (sr-only labels escaping the scroll clip, scrollWidth 576) and FIXED (`50761e7`), re-measured scrollWidth=390 everywhere, light+dark; feature-off 404s re-proven over HTTP |
| clean diff | `git diff --check` + tree | clean at the closing commit |

Phase report: `docs/reviews/CONFLICT-EVALUATION-P6-REPORT-2026-08-17.md`
(IA decisions incl. the register-#8(g) scoreboard-coexistence adjudication,
guard-ordering table, seven-question mapping, rendering-obligation
fulfillment, browser-coverage honesty, judgment calls, residual risks).
Critical Gate 6 (product-clarity/accessibility + legal/authorization/
truth-in-UI reviewers): PENDING — to be run against the closing tip.
