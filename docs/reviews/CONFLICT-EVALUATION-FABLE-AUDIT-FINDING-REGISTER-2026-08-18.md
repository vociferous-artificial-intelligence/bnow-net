# Conflict-evaluations Fable final audit — finding register (2026-08-18)

Every old and new finding, mapped to exactly one disposition:
**fixed** (in the target tree or by this audit), **deferred** (recorded obligation with an
owner/stage), **invalid** (did not survive verification), or **unresolved** (real, not yet
owned). Severities are this audit's judgment at the frozen target
`a2ddca8` = `a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`.

## 1. Findings of the three original final reviews (ran at `b8341e9`, Opus 5)

| # | Finding (abbrev.) | Original disposition | This audit's verification | Register status |
|---|---|---|---|---|
| S-M1 | intake omitted stub/published/engine/currentExtractorVersion | fixed in `abbd807` | code read line-level; typed refusals present, values never echoed; suite pins green | **fixed** |
| S-M2 | independentSourceCount not deduped; docId unvalidated (NaN) | fixed in `abbd807` | Set-dedupe + positive-integer checks at both entry points verified | **fixed** |
| S-M3 | row-grain vs LIMIT undocumented; PublishedRetentionClaimSource contractless | fixed (contract text) | both contracts read; DISTINCT-CLAIM bound + post-materialization framing honest; no executable backend exists to bind (stated) | **fixed** (prose contract; executable proof deferred to the future DB mapper's own review) |
| S-L1 | banner pinned on 1 of 4 routes | fixed in `ae45bc1` | per-route + flag-ON itest assertions verified; itest 151/151 replayed | **fixed** |
| M-MED1 | compound attestation narrows contract §3; no `compound` derivation for real reports | recorded (register #11/#12) | code verified (`unit.compound ? "partial" : "full"` on both rungs); 9/9-multi-proposition consequence accepted | **deferred — BLOCKS soak** (register #12.1–3) |
| M-MED2 | ~4/9 real bullets are analytic assessments; only miss sub-label is incomparable_coverage | recorded | design-only diagnostic class; not implemented | **deferred — required before soak** (register #12) |
| M-MED3 | keyword rung degenerate for iran_regional; action-gate precision 0.40/recall 0.33 | recorded | gazetteer independently re-enumerated: 34 toponyms, all RU/UA, zero Iran/Gulf/Levant | **deferred — required-before-soak CODE change** (insufficient_data return) |
| M-MIN1/2 | F1 overclaim; F10 window asymmetry | fixed (docs) / F10 report-only | verified; `LEGACY_EMULATION_NOTES` still holds 14 entries (F10 absent from the module constant) | **fixed** (report) / **deferred** (constant fold-in, recorded follow-up) |
| M-MIN3/4 | soak blind spots; measure non-independence | fixed in soak design / recorded metric | soak doc carries miss-sample, vacuous-criterion marking, reconciliation, endnote-overlap metric | **fixed (design)** — execution deferred with the soak |
| P-MIN1/2/3/5/6/7, P-N2/N3 | presence-module 0%, zero-eligible, index caveat, link names, RTL, demonstration label, legacy suffix, empty-union evidence link | fixed in `06e80df`/`f58858d`/`a2ddca8` | line-level read + browser matrix re-verified at the tip (48-state overflow, q2/q7 sweep 0 inconsistent) | **fixed** |
| P-MIN4 | no path to the external report; opaque unit ordinals | recorded | q7 drill-back dead end confirmed | **deferred — BLOCKS enablement** (P7 §5.2 item 4b; profile/epoch change) |
| P-N1/N4/N5/N6 | page titles; unavailable print identity; 390px column order; per-source buckets | recorded | verified as stated | **deferred — enablement posture items** (P7 §5.2 items 4/4c) |

## 2. Prompt-A / gap-audit findings

| # | Finding | This audit's verification | Register status |
|---|---|---|---|
| G-1 | No per-phase adversarial gate report committed; 16 verdicts survive only as author summaries | reproduced (ten conflict files, zero reviewer reports) | **unresolved for the original 16** (partially mitigated: five verbatim reviewer transcripts hash-preserved in the evidence package; THIS audit commits its three reviewer reports, curing the pattern going forward) |
| G-2 | `CONFLICT-EVALUATION-INTEGRATION-2026-08-17.md` named by prompt §6, never created | reproduced | **unresolved** (naming deviation; content exists in the P7 report — a rename/alias note is a one-line docs fix for whoever merges) |
| G-3 | No P1 implementation report | reproduced; disclosed in P7 §1.4 | **deferred** (accepted, disclosed) |
| G-4 | Register #2 + contract §3 describe an atomization "disabled experiment/flagged-off adapter" — no such code exists | reproduced by grep | **fixed by this audit** — dated correction appended (audit remediation §, docs-only); the register itself is append-only and corrected by a new dated entry |
| G-5 | Gate-9 citation justified by a false "routes have not changed" | reproduced; cured by the 6b35622 full matrix + a2ddca8 targeted recheck + THIS audit's full replay at the tip | **fixed** (by later evidence; the false sentence remains in P7 §6 history with the ledger's honest-statement correction) |
| G-6 | Stale 150/150 integration figure | cured in `81a6949`; independently reproduced 151/151 at the tip | **fixed** |
| G-7 | Final reviews passed `b8341e9`, not the final SHA | cured by THIS audit: full battery + three fresh Fable verdicts at `a2ddca8` | **fixed** (for the current tip) |
| G-8 | §16 partials: US-strike limb; DST-boundary fixture (unit-test-only) | reproduced from fixtures | **deferred** (corpus additions; owner = pre-soak fixture pass) |
| G-9 | Browser evidence uncommitted (scratchpad-only) | reproduced; THIS audit's matrix results are in the committed ledger | **deferred** (artifact-committing policy = operator decision; ledger text now carries the measured numbers) |
| G-10 | Scoreboard→conflict reciprocal link unbuilt; i18n absent; metadata absent | reproduced | **deferred — enablement checklist** (P7 §5.2 items 4/5/6) |
| G-11 | OPEN-TASKS #37 never referenced by conflict docs | not re-litigated; consistent with prompt §11's "keep separate" | **deferred** (docs pointer, low) |

## 3. New findings of this audit (F-NEW)

| # | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-NEW-1 | MEDIUM | **Source-independence construct is document-grain but labeled source-grain in places.** `independentSourceCount` counts distinct non-mirror `docId`s; `sourceDomain` sits unused on every `CandidateDoc`; mirror links are the only dependence model — two articles from one outlet count as two "independent sources". The offline report's "<2 independent documents" is honest; the persisted schema names (`independentSources`, `independentSourceCount`), `THIN_SOURCED_NOTE` ("independent source documents"), and P7 "source-independence diagnostics" overclaim. | eligibility.ts:164; scorer.ts:298; product-copy.ts:127; offline-report.ts:98 | **deferred with teeth**: honest-label copy rename + a sourceDomain-grain diagnostic are PRE-SOAK requirements (schema rename rides the already-required profile/epoch change of P7 §5.2 4b); dated docs correction appended by this audit. Not remediated in code mid-audit: the metric feeds committed goldens. |
| F-NEW-2 | MEDIUM | **Stub truth has two unlinked authorities.** `STUB_ADAPTER_NAMES=["x","acled"]` (evidence-records.ts:151) mirrors stubs.ts by comment only; `stub-isolation.test.ts` builds its own local set and never compares the conflict copy. A future stub added to stubs.ts silently stays non-stub in the conflict mapper contract (ruling-3 hazard at the future DB wiring). | evidence-records.ts:137-151; stub-isolation.test.ts:18 | **deferred (owned prerequisite)**: one structural equality test (import xStub/acledStub, assert set-equality with the conflict constant) must land with or before the future DB-mapper PR; values match today; dormant now. |
| F-NEW-3 | MEDIUM-low | **F2's "reported separately … so the direction is visible" is false of the rendered output.** `matchableDropped` is computed per row but appears in neither the markdown table nor the aggregate. Recomputed counterfactual: with the keyword matchable reduction, legacy union = 14/17 (82.4%) ROCA / 6/8 (75.0%) Iran — materially higher than the rendered 68.2%/57.1% baselines, and invisible. | backtest-matrix.ts:134-135, 396-468, 509-541 | **fixed by this audit (docs)**: dated correction appended to P7 §3 with the recomputed numbers; rendering the field is a recorded follow-up for the module owner. |
| F-NEW-4 | LOW | **Undisclosed emulation choice: the legacy side receives the designated-final edition** (`emulateLegacyScenario` gets `selectedScenarioReport(...)`), while production scores whichever single `isw_reports` row discovery stored for (theater, date). Missing from L1–L5/F1–F10. | backtest-matrix.ts:428-431 | **fixed by this audit (docs)**: dated correction appended naming it (proposed L6); direction neutral on this corpus (one multi-edition scenario). |
| F-NEW-5 | MEDIUM-low | **F5 misstates what the production scoreboard presents.** `summary.ts` renders per-run rows and an UNWEIGHTED MEAN of `coverage_pct`; nothing presents the pooled `15/36`. The P7 aggregate sentence "legacy presents 15/36 across two rows" therefore describes the emulation's own construct, not the live surface. The double-counting critique itself survives (overlapping per-row denominators are real). | scoreboard summary.ts:14-25; backtest-matrix.ts F5; P7 §3.3 | **fixed by this audit (docs)**: dated correction appended re-labeling the pooled figure as an emulation construct. |
| F-NEW-6 | NOTE→enablement checklist | **Flag coupling: `CONFLICTS_UI=1` without `FEATURE_AUTH_GATE=true` serves the gated evidence page's claim text anonymously** (inherited `gate.ts` demo-parity: anonymous + gate-off ⇒ no redirect). Identical posture to /digests; production sets the flag, so no live exposure; but the enablement checklist must bind the pair explicitly. Discovered when this audit's first probe server omitted the flag (probe-fidelity note, ledger §5). | src/lib/gate.ts:30-39; evidence page guard order | **deferred — added to the enablement checklist by dated correction** (precondition: `FEATURE_AUTH_GATE=true` verified in the same env before `CONFLICTS_UI=1`). |
| F-NEW-7 | LOW | **F9/P7 §3.4 overgeneralize the snapshot probe**: "the same scenarios at `at_publication` return unavailable / `no_proven_snapshot`" — measured: 40× `no_proven_snapshot` + 1× `publication_gap` (the gap scenario). Honest direction, wrong universal. | probe (ledger §4.4); backtest-matrix.ts F9 | **fixed by this audit (docs)**: dated correction appended. |
| F-NEW-8 | LOW | **Stored-error echo inconsistency**: the pre-existing claimId/sourceReliability intake refusals interpolate `String(value)` while the M-1 refusals deliberately never echo; a mapper bug placing prose in `claimId` would echo it (console-only today; nothing persists these messages). | evidence-assembler.ts validateCandidateIntake first checks | **deferred (owned prerequisite)**: align with the no-echo discipline in the future DB-mapper PR. |
| F-NEW-9 | NOTE | **Index terminal-state staleness at the tip**: the workstream index instructs resolving the tip by `git rev-parse` (now `a2ddca8`) while its terminal bullet still carries `6b35622`-vintage figures (unit 3,212/228 vs the tip's 3,213/228; browser-matrix provenance in the ledger's last block only). | index :115-129 | **fixed by this audit (docs)**: dated correction appended to the index. |
| F-NEW-10 | NOTE | **Provenance-chain caveat**: the phase7-author and phase7-gate-verifier transcripts no longer exist at their recorded paths; their SHA-256-recorded verbatim exports in `bnow-net-audit-evidence-20260818/` are the surviving primary copies. 4 of 9 transcripts were re-verified directly on disk (all consistent). | ledger §1 | **deferred (accepted)**: no contradiction found; noted so future audits know the export is now primary. |
| F-NEW-11 | LOW | **Probe-fidelity self-report**: this audit's first browser probe mis-set the auth flag and used entity-escaped leak matching; both corrected and re-run to PASS (ledger §5 note). Recorded so the gate table cannot be read as first-try-clean. | ledger §5 | **fixed** (methodological, self-corrected in-session). |

## 4. Carried QF-boundary constraint

The QF audit's pre-paid-eval hardening list (report-time identity recompute, baseline identity
gating, MIN_REPETITIONS/`--fresh` provenance, heldout fidelity pins, union-aware lazy-`@/db`
regression pin, `--db-ack` production-host refusal) must be specified against BOTH
`modeReport` and `conflictModeReport` and verified on the merged tree. This audit confirmed the
conflict path does not weaken any inherited guarantee today (ledger §2) and that the QF items
remain **prerequisites before a first binding paid eval**, not dormant-merge blockers.

## 5. Fresh-review verdicts and reviewer-only findings (completed at closeout)

All three fresh reviews ran on `claude-fable-5` against exactly `a2ddca8` and returned
**PASS-WITH-MINORS** (0 BLOCKER / 0 HIGH each), binding dormant default-off merge safety only.
Their MEDIUMs converge with §3 above (independence construct = F-NEW-1; stub dual authority =
F-NEW-2; F2-hidden = F-NEW-3; F5 mislabel = F-NEW-5; flag coupling = F-NEW-6; row-grain
prose contract = S-M3's deferred executable proof; atomization phantom = G-4; missing gate
reports = G-1; q7 dead-end = P-MIN4). Findings not already registered:

| # | Sev | Reviewer | Finding | Disposition |
|---|---|---|---|---|
| R-P-3 | MEDIUM | product | Two terminal sentences in the committed record ("docs-only commits sit on top" — ledger final-SHA block; "changes no source" framing in the index terminal bullet) are FALSE at HEAD: `a2ddca8` itself changes source, so the in-repo gate record binds `6b35622` and only this audit's replay covers the true tip. | **fixed by this audit (docs)**: dated corrections appended to the ledger-owning report block and the index; the audit ledger §5 carries the tip-bound battery. |
| R-P-5 | LOW | product | The P7 §16 acceptance table presents the US-strike limb and the DST-transition case as FULLY covered; both are partial (US appears only as target/air-defense actor; the DST fixture is mid-DST with the transition unit-test-only). | **fixed by this audit (docs)** (dated correction); corpus additions stay deferred (G-8). |
| R-M-4 | MINOR | science | Register #12 / P7 §8.1.c record the Iran keyword-rung probe as "13 of 20 units flagged"; re-measured at the tip it is 13 of **21** declared units. | **fixed by this audit (docs)** (dated correction). |
| R-M-5 | NOTE | science | Register #11's "9/9 real bullets multi-proposition" is itself an uncalibrated two-report hand-judgment (the reviewer's own parser probe read 3/4 ROCA bullets as single-sentence); this is precisely what register #12.2's measured compound rate must settle. | **deferred** — subsumed by register #12.2. |
| R-M-6 | NOTE | science | The soak plan's 120-pair sample allocates ~40 pairs per precision stratum — underpowered for a 0.90 precision threshold (a single miscall moves the estimate ~2.5 pp). | **deferred** — soak-plan sizing refinement before day 1; owner = soak authorization gate. |
| R-S-4 | LOW | safety | Results-file persistence is a bare `writeFileSync` per case with no lock or atomic rename; two concurrent CLI invocations could interleave (single-process CLI today; the inherited path has the same shape). | **deferred** — owned with any future concurrent runner; specify against BOTH `modeOffline` paths (QF §4 constraint). |
| R-S-5 | LOW | safety | Duplicate docIds inside one claim's doc list are accepted silently (the M-2 dedupe corrects the count, so no behavioral harm; a refusal would surface mapper bugs earlier). | **deferred** — fold into the future DB-mapper intake review with F-NEW-2/F-NEW-8. |
| R-A-1 | NOTE | audit lead | The evidence package's per-file "+4/−1 / +15/−1" for `a2ddca8` quoted the `--stat` total-lines column; exact numstat is +3/−1 and +14/−1. | **fixed** (audit ledger corrected in `f9605fe`). |

## 6. Remediation performed by this audit (docs-only, after all three verdicts were recorded)

Dated corrections appended (never editing historical text — house precedent): P7 report
(§ audit-corrections: F-NEW-1/3/4/5/6/7, R-P-3, R-P-5, R-M-4), decision register (new dated
entry correcting #2's atomization phrasing and recording this audit), workstream index (dated
tip-provenance block). No source file, no test, no fixture, no golden, no contract changed —
the conflict integration branch still contains the exact audited tree, and no re-review
trigger fires. Code-level items (stub drift test, mapper-side row-grain test, no-echo
alignment, independence relabel/dedupe, keyword-rung insufficient_data, compound derivation)
are owned prerequisites listed in §1–§3, staged pre-mapper / pre-soak / pre-enablement.
