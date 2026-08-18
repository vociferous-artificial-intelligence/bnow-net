# Conflict evaluations — independent audit, Fresh Reviewer #1 (methodology / evaluation science)

Date: 2026-08-18. Reviewer: independent; did not author any part of the workstream.

## Model gate

- Model actually running: **claude-fable-5** (exact id from my system prompt: `claude-fable-5`).
- Effort: this session is the audit-designated **xhigh** run (the system prompt names the model
  but carries no effort field; the audit configuration set xhigh). Gate condition met — proceeding.

## Exact target

- Reviewed SHA: **a2ddca88f7740a148ebeb5372f9ce47dd72ffac4** (verified `git rev-parse HEAD` in
  `/Users/go/code/bnow-net-worktrees/conflict-audit-review-science-20260818`, detached at target).
- Base: 7150b494d1399dddada6e7f917b1c0e76114d458. Diff surface: 125 files, +40,970/−4.
- This review binds ONLY a2ddca88.

## Initial attack plan (written before reading any prior review artifact)

1. Verify SHA + diff surface; confirm all conflict code is new-module, dormant, default-off.
2. Denominator: how one-report/one-observation is enforced; unit dropping; edition handling; 0/0.
3. Primary-metric construct validity on REAL inputs: how `compound` is set outside fixtures; what
   verdict a compound unit can reach under each matcher rung; partial-as-miss arithmetic.
4. Analytic-assessment units: can an event-claim corpus match assessment bullets; is the miss
   taxonomy able to say "not an event"?
5. Matcher ladder: exact K=5 reuse; degradation labeling; keyword rung on iran_regional given the
   RU/UA gazetteer — compute the structural ceiling myself.
6. Source-independence construct: what `independentSourceCount` actually counts; whether
   `sourceDomain` participates; same-outlet/syndication overcount.
7. Backtest emulation honesty: verify each L/F note against the code; hunt for undisclosed
   choices (edition selection), unrendered counterfactuals, mischaracterization of the production
   scoreboard, and overgeneralized probe claims.
8. Aggregation/weighting; ISW co-sourcing caveat; whether the comparison answers a real analyst
   question; fixture circularity (single compound scenario, designed partial).
9. Narrow reproductions only: single test file + small tsx probes; zero paid calls; no goldens.

## Inspected paths (all in my read-only worktree at a2ddca88)

`docs/prompts/2026-08-17-conflict-region-combined-evaluations.md` (§5, §15–§17);
`docs/designs/CONFLICT-REGION-EVALUATION.md` (§2–§7); `docs/designs/CONFLICT-SHADOW-SOAK.md`
(§5–§7); `docs/reviews/CONFLICT-EVALUATION-P7-REPORT-2026-08-17.md` (§3, §7, §8.1);
`docs/reviews/CONFLICT-EVALUATION-DECISION-REGISTER-2026-08-17.md` (#2, #8, #10, #11, #12);
`src/lib/conflicts/{scorer.ts,match-contract.ts,keyword-matcher.ts,eligibility.ts,
backtest-matrix.ts,evidence-records.ts,evidence-assembler.ts,fixture-corpus.ts,goldens.ts,
contribution.ts,product-copy.ts,offline-report.ts}`; `src/lib/validation/{keywords.ts,
isw-extract.ts}`; `src/lib/scoreboard/summary.ts`; `fixtures/conflicts/*.json`;
`fixtures/isw/*.html`; tests: `backtest-matrix.test.ts`, `scorer.test.ts`,
`scorer-acceptance.test.ts`. Audit lead's ledger read LAST, as evidence to check.

## Commands run (narrow reproductions; zero provider contact; UPDATE_CONFLICT_GOLDENS never set)

1. `npx vitest run src/lib/conflicts/backtest-matrix.test.ts` → **19/19 PASS** (pins the §3.3
   aggregates and the byte-for-byte embedding of the table in the P7 report).
2. tsx probe P1 — corpus-wide iran_regional keyword rung: **units=21 full=0 partial=0
   keywordUnmatchable=13** (independently reproduces the MEDIUM-3 degeneracy).
3. tsx probe P2 — Iran text with action word, no gazetteer toponym: **matchScore=0.25 <
   MATCH_THRESHOLD=0.6** → keyword matches are structurally impossible for iran_regional
   (keywords.ts:139-149: action-only caps at 0.25; gazetteer TOPONYMS keywords.ts:5-41 is 34
   RU/UA-war entries, zero Iran/Gulf/Levant/Red-Sea — re-enumerated).
4. tsx probe P3 — two non-mirror docs, same `sourceDomain=en.mehrnews.com`:
   **independentSourceCount=2** (eligibility.ts:164-170 counts distinct non-mirror docIds only).
5. tsx probe P4 — production `extractTakeawaysWithText` over both committed real ISW fixtures:
   ROCA 4 takeaways (3 of 4 single-sentence), Iran Update 5 takeaways (all 2-sentence).

## Findings (ordered by severity)

**No BLOCKER, no HIGH** for the bar this verdict binds (dormant merge safety). The two
structurally largest science problems — (a) compound units can never be `matched` by any live
rung (match-contract.ts:325, keyword-matcher.ts:102; partial=miss at scorer.ts:265) with no
`compound` derivation existing for real reports, and (b) the iran_regional keyword rung is a
guaranteed scored 0/N — are REAL, I reproduced both independently, and they would be HIGH for
any soak; but register #11/#12 already record them accurately as BLOCKING prerequisites before
any soak, and the code affected is dormant. A gate that is honestly declared and mechanically
upstream of enablement is the correct disposition; I verified the register text matches the code.

- **MEDIUM-A (comparison honesty, doc): the F2 counterfactual is computed but never rendered.**
  backtest-matrix.ts:54-58 promises `legacyMatchableDropped` is "reported separately … so the
  direction is visible"; the field exists on `LegacyCountryRow` (line 134-135) but appears in
  neither `formatBacktestMatrixMarkdown` (lines 509-542) nor any aggregate nor
  `backtest-matrix.test.ts` (grep: zero hits). Failure scenario: an operator reading P7 §3.3
  compares legacy 68.2% union vs combined 68.2%/76.2% without seeing that under production's own
  keyword-rung denominator rule legacy union rises materially (audit lead recompute: 82.4% ROCA)
  — the one disclosed limit that would most flatter the incumbent is the one not shown. Fix is
  docs/rendering only.
- **MEDIUM-B (comparison honesty, doc): F5 mischaracterizes the production presentation.**
  backtest-matrix.ts:69-73 and P7 §3.3 ("legacy presents 15/36 across two rows") claim
  `sumDenominator` is "the denominator the current scoreboard actually presents".
  `src/lib/scoreboard/summary.ts:15-20` computes an unweighted per-run MEAN of `coverage_pct`;
  no production surface pools matched/denominator across ru+ua rows. The real defect (a `both`
  unit is double-WEIGHTED across two averaged rows) is smaller than the stated one (a
  double-COUNTED pooled denominator). Failure scenario: the decision document overstates the
  incumbent's dishonesty, biasing a merge/enablement comparison in the new method's favor.
- **MEDIUM-C (construct labeling): "independent" sources = distinct non-mirror docIds;
  `sourceDomain` is never consulted for independence** (eligibility.ts:164-170; scorer.ts:292-298
  unions non-mirror docIds per unit), while the SAME field drives the mix cap
  (evidence-selection.ts:188,223) and contribution buckets (contribution.ts:61). Probe P3: two
  same-outlet docs = 2 "independent". `THIN_SOURCED_NOTE` (product-copy.ts:127) says
  "independent source documents"; thin-sourced (scorer.ts:354-359) keys off this count. Failure
  scenario: one outlet publishing two items exempts a claimed/unverified claim from the
  thin-source diagnostic and renders "2 independent" on a future enabled surface; undetected
  cross-outlet syndication (doc_dedup is same-theater/±1-day minhash) inflates it further. Not
  recorded in P7 §8.1 (item 7 is ISW co-sourcing, a different dependence). Pre-soak fix: rename
  the label to "distinct non-mirror documents" or dedupe by domain, with a register entry.
- **MINOR-D: undisclosed designated-final-edition handoff in the legacy emulation.**
  backtest-matrix.ts:430-431 hands `selectedScenarioReport(...)` (the combined method's
  designated-final edition, fixture-corpus.ts:267-280) to `emulateLegacyScenario`; production
  legacy has no edition policy — it scores whatever row discovery stored. Not in L1–L5/F1–F10
  although the header (line 20-21) claims "every choice is enumerated". No differential on this
  corpus (cc-editions-001: 1/1 both methods), so disclosure-completeness only.
- **MINOR-E: F9 / P7 §3.4 overgeneralize the snapshot-kind probe.** "the same scenarios at
  `at_publication` return `unavailable`/`no_proven_snapshot`" and "every scenario returns …" are
  false for the gap scenario: evidence-assembler.ts:333 returns `publication_gap` BEFORE the
  kind check at :382, and the pin test (scorer-acceptance.test.ts:303-315) probes exactly one
  report-bearing scenario. Behavior is more honest than claimed (gap stays gap); the disclosure
  is imprecise and the "probed" claim is broader than the probe.
- **MINOR-F: register #12 / P7 §8.1.c say "13 of 20 units" flagged; the scored corpus holds 21
  declared units** (P7 §3.3 aggregate line: 20 scenarios, 21 declared units, 1 gap; probe P1:
  13 of 21). Off-by-one in the recorded narrative; conclusion unchanged (0 matchable either way).
  Also note the precise mechanism, sharper than the recorded one: the 8 unflagged units carry
  only ACTION signal, and action-only score caps at 0.25 < 0.6 (probe P2), so `keywordUnmatchable`
  undercounts structural unmatchability by design — supports #12's `insufficient_data` fix.
- **NOTE-G: register #11's "9/9 multi-proposition" is itself an uncalibrated judgment.** Probe
  P4: 3 of 4 ROCA bullets are single-sentence; roca[3] ("Neither … made confirmed advances") is
  a single negative proposition; roca[1] is a one-sentence assessment. The Iran 5/5 reading is
  supported (all 2-sentence causal assessments). This does not weaken #11/#12 — it strengthens
  #12.1's demand for a versioned, human-calibrated `compound` derivation before the rate is
  treated as measured.
- **NOTE-H: soak precision sample is underpowered for its own threshold.** 40 matcher-declared
  matches per conflict (soak §5) puts a ±~0.09 Wald interval on precision at p̂=0.90 — the
  pass/fail line sits inside the noise. Consider enlarging the match-side stratum before grading.
- **NOTE-I: thin-sourced excludes `unknown`-hedge single-doc claims** (scorer.ts:356 filters to
  claimed/unverified). Disclosed in product-copy.ts:127; a deliberate construct choice, but
  `unknown` is the mid-trust bucket (ruling 16) and a 1-doc `unknown` claim escapes the flag.
- **NOTE-J: the corpus holds exactly one compound unit** (`"compound": true` count: 1, in
  roca-scenarios-v1.json, designed partial), so the corpus cannot detect compound OVER-credit;
  the oracle-full path is pinned only synthetically (scorer.test.ts:221,239). Already disclosed
  in P7 §8.1.a; no new action beyond #12.

## Categories checked with NO finding

- **One-report/one-observation arithmetic**: single denominator = declared units of one edition
  (scorer.ts:548); lane rows partition the same units (laneRowsOf; sums test-pinned); zero-unit
  reports refused (scorer.ts:497-502); gap never fabricated (assembler:333, scorer gap branch);
  both assemblies must agree on identity/window/limits (scorer.ts:702-747).
- **Two-population separation**: type-level discriminants (evidence-records.ts:205-221);
  disagreement surfaced per unit; contribution populations kept separate (contribution over
  corpus-recall, retention table separate).
- **Out-of-population rescue matches refused** (scorer.ts:172-179); duplicate pairs refused;
  non-oracle full-on-compound refused (scorer.ts:191-196) — all fail-closed, tested.
- **Ladder/K=5 inheritance**: exact production `sanitizeMatches`/`majorityFromVotes` reused
  (match-contract.ts:45-49); rung labels cannot masquerade (typed; oracle unrankable; mixed
  oracle/ladder refused, scorer.ts:762-779); votesK/model disagreement refused.
- **Anti-gaming freeze**: eligibility receives only time anchors; report-object key allowlist
  enforced at runtime (evidence-assembler.ts:336-345); no unit-text field on candidates.
- **Aggregation**: unweighted micro-sums disclosed (P7 §8.1 item 8); no composite score anywhere.
- **ISW shared-source dependence**: disclosed in rendered copy (product-copy.ts:28) and turned
  into a required zero-cost soak measurement (§8.1.d via source_citations join).
- **Backtest determinism/number integrity**: 19/19 test reproduces every aggregate; report
  embeds the generated table byte-for-byte; F1's corrected direction (generous on recall, not an
  upper bound — removes legacy false positives) is accurately stated at P7 §3.2.
- **Analyst-question honesty**: §3.1/§3.4 state fixture-only scope first, ROCA parity first
  (15/22 both ways), and "what the matrix cannot tell you" — the committed artifacts nowhere
  claim a real-world gain.
- **Fixture circularity**: disclosed (§8.1 item 3); only the soak breaks it, and the soak is
  blocked on #12.

## Cross-check of the audit lead's ledger

Read after my own inspection. Its Phase-C items 1, 4 (edition handoff, F2 unrendered + recompute,
F5, F9 40+1 probe), 5, and 7 independently agree with my findings; nothing in it contradicted my
evidence; I did not adopt any conclusion I could not reproduce or re-derive (its F2/F4
counterfactual magnitudes are cited as its recomputation, marked as such above).

## Verdict

**PASS-WITH-MINORS** — this verdict binds ONLY the dormant, default-off merge safety of
a2ddca88 under the branch's own stated blocks: no shadow soak until every register #12
prerequisite plus MEDIUM-A/B (docs corrections) and MEDIUM-C (independence relabel-or-dedupe,
with a register entry) are closed, and no feature enablement until a soak has produced the
predeclared human-labelled precision/recall evidence.

Scientific readiness for a real soak: NOT met today — and the branch itself says so, accurately.
Feature-enablement readiness: not close, correctly blocked. Nothing I found leaks into production
behavior at this SHA with flags absent.
