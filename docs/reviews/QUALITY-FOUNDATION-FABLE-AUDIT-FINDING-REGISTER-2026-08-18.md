# QF independent final audit — finding register (2026-08-18)

Maps every old and new finding to one of: **fixed** · **invalid** ·
**deferred-authorized** (deferred with explicit prompt/operator permission) ·
**deferred-unpermitted** (a real shortfall vs the governing prompt's letter,
disclosed or newly found, deferred without specific permission) · **unresolved**.
Verification evidence for each row is in the audit ledger, the twelve attack-agent
results (session workflow `wf_16477cec-d86`), and the two fresh reviewer reports.
Audited SHA: `7150b494d1399dddada6e7f917b1c0e76114d458`.

## 1. Prompt-A gap-audit leads (G1–G7) — audit adjudication

| Lead | Adjudication | Disposition |
|---|---|---|
| G1 untracked governing prompt | CONFIRMED independently (`git log --all` empty; 24+ siblings tracked; conflict program committed its own prompt at `f7127e2`) | **fixed** by this audit: committed verbatim at `2919970`, SHA-256 `7a55…6fcc` recorded |
| G2 false NUL-scan claim | CONFIRMED: literal 0x00 at `digest-persist.ts:286` in a changed file; byte pre-existing at `origin/main:243`; probable mechanism = grep binary-skip (the exact failure mode the program itself fixed in map-worker.ts) | **fixed** (evidence): dated correction appended to the integration report at `bd29d89`. The byte itself: **deferred-authorized** escape-only cleanup for a future PR (harmless separator; converting it now would touch source) |
| G3 final PASS binds `e5757ea`, not tip | CONFIRMED and BOUNDED: `git diff e5757ea..7150b49 -- ':!*.md' ':!.env.example'` = 0 lines; AGENTS.md entry moved verbatim; `.env.example` delta is comments documenting envs the reviewed code already read | **fixed** by this audit's Phase-4: two fresh reviews now bind `7150b49` exactly (§4 below) |
| G4 fence write-inert / chimera window | CONFIRMED with sharpened characterization: the window is the whole renew-to-COMMIT span, not one statement (L4-2); write gates are token re-checks; unique keys bound the damage to a mixed-generation claim set for one (doc,track,version) | **deferred-unpermitted** (disclosed): the prompt's "monotonically safe fencing" is only partially met; complete fix = fence column = schema change, an owned prerequisite for a post-deploy hardening PR. Not a merge blocker — the delivered lease is strictly safer than the advisory lock it replaces |
| G5 five C residuals before binding paid eval | CONFIRMED, and the list is INCOMPLETE — see C-A6-2, A8-F1, C-A6-3 (§3) | **deferred-authorized** (program-documented "close before first binding paid eval"), list EXTENDED by this audit |
| G6 harvest-script retry exemption | CONFIRMED as inherited routing-branch follow-up (routing report §12.3/§12.11.3); isolation.test.ts:119 hard-codes the filename skip with an authorization comment citing no document; zero OPEN-TASKS entry | **unresolved** (tracking): outside the QF diff; needs an OPEN-TASKS entry — recorded as owned prerequisite; do NOT modify Ask behavior in QF scope |
| G7 per-adapter fed-group stage bracketed | CONFIRMED disclosed (A report §5.3); prompt said "where meaningful" but permitted narrow instrumentation; program declined | **deferred-authorized** (disclosed deviation, reviewer-accepted). NOTE: the GLOBAL fed-group docs stage has a separate, undisclosed gap — FUNNEL-A12-1 (§3) |

## 2. Original program reviewer findings — verification status

Provenance first: all eight QF reviewer transcripts were recovered from session
storage (`d65be573…/subagents/`), every assistant message `claude-fable-5`/`xhigh`;
recovered verbatim verdicts match the integration report §12 row-by-row with zero
divergence; archived with hashes at
`bnow-net-audit-evidence-20260818/qf-reviewers-recovered-20260818/`.

| Gate / finding | Program disposition | Audit verification |
|---|---|---|
| A4 F1 (MAJOR, lexicon-skip vs backlog conflation) | fixed `a787500` | **fixed** — split verified in code + tests; but the pending label is still wrong for OFF-ROSTER theaters (new FUNNEL-A12-2, §3) |
| A4 F2 (legacy intraday asOf) / F3 (citation-link stub symmetry) | documented / fixed | **fixed/deferred-authorized** — verified (stub exclusion present in `citationLinksSql`; caveat documented §4) |
| B #1 `--track` remap wrote `processed` (MAJOR ×3 finders) | fixed `e364112` | **fixed** — verified in code + itest (my 119/119 includes the never-writes-processed case). Durability gap: no always-run pin (REMAP-1, §3) |
| B #2 NaN budget fail-open (MAJOR) | fixed | **fixed** — verified; sibling `--limit` NaN NOT swept (REMAP-3, §3) |
| B #3 missing route handshake (MAJOR) | fixed | **fixed** — verified; mid-drive rollback placement residual confirmed at tip (REMAP-4 NOTE) |
| B #4 version-blind checkpoint | fixed (versionsDigest) | **fixed** — verified; digest omits target base URL/database (REMAP-5 NOTE, cross-env reuse) |
| B #5–#10, #12 (renew cadence, stall-bound, released-count, over-budget resume, sweep reset, itest assertion) | fixed | **fixed** — spot-verified via tests present at tip + my full-suite/itest runs |
| B #6/#11 fence wording + chimera residual | documented/reworded | **deferred-unpermitted** (G4 row above); L4-2 found two code comments still absolute ("never a second writer") — evidence correction recorded in the audit report; comment wording fix = owned prerequisite |
| B #13–#17 NOTEs (observability, corrupt state, cap clamp, record() failure, dry-estimate model) | recorded | **deferred-authorized** — re-confirmed present at tip (L4-4..L4-7 corroborate; memory-vs-pg corrupt-`expiresAt` divergence is a new NOTE refinement) |
| C MAJOR-1 completeness / MAJOR-2 aligned pairwise / MAJOR-3 resume identity | fixed `0c42880` | **fixed** — verified in code + tests; two NEW holes beside them: baseline-side degraded-status denominators (A8-F1) and baseline-identity/filename trust (C-A6-2), §3 |
| C minors m4–m10, re-review minors 1–2, NOTE NEW-3/NEW-4 | fixed/adjudicated | **fixed** — spot-verified (report-time dataset-hash degrade demonstrated live by regeneration; heldout hiding verified; mixed-run indicator verified display-only per C-A67-4) |
| D 4 MAJORs (export content, append-only, supersession, subject identity) | fixed `ebb644c`+`a730d73` | **fixed** in design text — all four verified present; two new MINORs: no standalone D reviewer artifact in-repo (D-1; mitigated by transcript recovery) and the claim-key `<track>` derivation gap (D-2), §3 |
| Final safety/ops + final quality/science (PASS-WITH-MINORS on `e5757ea`) | recorded in §12 | **verified genuine** — transcripts recovered; the science reviewer's transcript contains a real `npm test` result (2,402) at the tip; both verdicts bind `e5757ea` exactly; tip `7150b49` re-reviewed by this audit's Phase 4 |

## 3. New findings from this audit (Phase 1/2 attack agents + inline verification)

Severity scale: MEDIUM = gate-integrity/contract, should fix before the named
milestone; MINOR = polish/doc; NOTE = observation. No BLOCKER or HIGH was found
by any of the twelve agents or the auditor's own verification.

### Gate-integrity MEDIUMs — all deferred with named owners (no source changed by this audit)

| ID | Finding | Disposition + owner milestone |
|---|---|---|
| C-A6-1 | `--report` gates only `datasetContentHash`; a stale/bogus promptHash renders a binding-looking PASS incl. `proposedRegistryEntry` (demonstrated live with a fabricated header) | **deferred-authorized** (program residual, sharpened) — close before FIRST binding paid eval; fix must cover BOTH report paths (QF `modeReport` + conflict `conflictModeReport`, per A14-F1) |
| C-A6-2 | Baseline chosen by FILENAME with zero header/identity cross-validation; byte-copy of the candidate as baseline self-compares to deltas 0 → PASS (demonstrated live); baseline identity absent from both artifacts | **deferred-unpermitted** (NEW — not in the program residual list) — close before first binding paid eval: gate filename↔configKey↔identity.model, print baseline identity, detect runId/rawOutputDigest overlap |
| C-A7-1 | No MIN_REPETITIONS anywhere; reps=1 stochastic candidate can PASS | **deferred-authorized** (program residual) — preset constant in gates.ts before first binding paid eval |
| C-A7-2 | `--fresh` bypasses the resume-identity refusal and erases run provenance; gitignored live results leave no VCS trace; re-roll-until-pass artifacts look first-try | **deferred-authorized** (program residual, sharpened) — require an explicit discard acknowledgement + persist prior-run digests; compensating control today = the openai_eval ledger on the acknowledged eval branch |
| A8-F1 | Aligned pairwise "identical case sets" aligns KEY presence, not scored status: baseline-side provider_error/schema_invalid rows silently shrink the baseline quality-mean denominators inside the aligned population | **deferred-unpermitted** (NEW) — same milestone; require scored-status alignment or fail the baseline like the judged file |
| A8-F2 | mustNotMatch precision pins absent from the ENTIRE gated heldout map split (0/5 cases); the README's declared precision mechanism does not protect the gate | **deferred-authorized** (program residual "thin heldout mustNotMatch", now quantified) — same milestone |
| C-A6-3 | Residual-list inaccuracy: envKnobs are NOT "printed" — absent from both scorecard artifacts entirely; knob drift invisible at report time | **fixed** (evidence): integration-report correction appended at `bd29d89`; the surfacing fix itself joins the same milestone |
| A9-1 | The lazy-`@/db` ordering keeping all four $0 modes DB-free rests on exactly three lazy edges with NO regression test (47-module eager closure enumerated; `src/db/index.ts` binds `DATABASE_URL` eagerly at module load; overwrite at `analysis-eval.ts:444` precedes first possible execution at `:486`) | **deferred-authorized** (program residual) — the pin must be authored UNION-AWARE (conflict branch adds a second dynamic import + its own exact-set pin, A14-F2) |
| L4-1 | Two of four lease-gated map write paths (mirror transaction; final `processed=true`) have ZERO lost-lease test coverage; B report claimed "unit-covered latch" for one | **fixed** (evidence): B-report correction at `bd29d89`. Unit pins = owned prerequisite, land with (or before) the deploying PR |
| REMAP-1 | "remap never writes processed" (the triple-found MAJOR's fix) is pinned ONLY by a Neon-gated itest; deleting `!opts.remap` passes the entire pre-push gate (ruling-21 companion-pin precedent applies) | **deferred-unpermitted** (NEW durability gap) — always-run unit pin, land with the deploying PR |
| FUNNEL-A12-1 | Prompt A2 minimum stage "distinct documents represented in fed groups" is persisted (`stats.docsAnalyzed`) but NOT surfaced by the funnel for mapreduce digests (absent from JSON; human mode prints a placeholder); A report claimed it reported | **fixed** (evidence): A-report correction at `bd29d89`. Surfacing fix = owned follow-up with the funnel-label wording items |
| FUNNEL-A12-2 | `pendingDocs` "cron will still drain" label FALSE for off-roster theaters (MAP_THEATERS ru,ua,ir vs TRACKS military's 10 countries; `currentVersion()` non-null so the not-configured warning never fires) | **deferred-authorized** (was an A residual NOTE; audit elevates to MEDIUM) — roster-awareness or caveat in the funnel report, same follow-up |
| A14-F1 | Conflict branch duplicates the report flow (`conflictModeReport`, no identity gate) and refactors loadResults; identity-gate remediations MERGE CLEAN while silently missing (or relocating into) the duplicated path — empirically demonstrated | **unresolved** (structural hazard): binds every C remediation above — each must be specified against BOTH paths and verified on the merged tree |

### MINORs

| ID | Finding | Disposition |
|---|---|---|
| REMAP-3 | `--limit <non-numeric>` → NaN silently disables the pair bound (same class as the fixed budget MAJOR, one flag over; spend still bounded by mandatory finite `--budget`) | **deferred-unpermitted** (NEW) — sweep sibling numeric flags before first remap execution |
| REMAP-5 (NOTE↑) | Checkpoint identity omits target base URL/database — cross-environment checkpoint reuse silently skips days | **deferred-unpermitted** (NEW) — same milestone |
| L4-2 | Code comments state "never a second writer" absolutely, contradicting the accepted chimera residual; the stall window is renew-to-COMMIT (up to ~100 networked statements for a 25-doc batch), not "single-statement" | **fixed** (evidence) in the audit report's characterization; comment/report wording fix = owned prerequisite |
| L4-3 | B report overstates itest strength ("proven live by the two-racer") and undercounts spend tests | **fixed** (evidence): correction at `bd29d89` (counts row) |
| A13-F1 | isolation.test.ts scans `scripts/` NON-recursively (src/ scan recurses); a future nested script evades tests 3–5; currently sound (no subdirectories exist) | **deferred-unpermitted** (NEW, latent) — one-line recursion fix at the eval-hardening milestone |
| A8-F3 | Gated heldout split covers only ru/fa languages; uk/ar are single dev-split cases; digest dataset has no ir case | **deferred-authorized** — corpus growth is the D-design/adjudication pipeline's purpose; record as corpus roadmap item |
| A10-1 | Harvest exemption is honest inherited debt but untracked: no OPEN-TASKS entry; isolation.test.ts authorization comment cites no document | **unresolved** — needs an OPEN-TASKS entry (owned prerequisite; no Ask behavior change in QF scope) |
| A-REC-1 | Exact skew-boundary equalities (published == asOf+skew; lag == −skew) behave correctly (empirically probed) but are not test-pinned | **deferred-unpermitted** (NEW, trivial) — two boundary pins at the next A touch |
| FUNNEL-A12-3 | "will NEVER map under this track" overstatement confirmed still at tip | **deferred-authorized** (final-review residual) — wording fix queued |
| FUNNEL-A12-4 | Citation share/conversion computed only for the adapter dimension; platform lacks rates; language absent citation-side | **deferred-authorized** ("where meaningful" qualifier) — record as follow-up; adapter dimension answers the IR X-dependency question |
| P16-1 / P16-2 | B report §5 and C report §7 carry stale pre-remediation counts under final-tree headings (final numbers correct in the integration report) | **fixed** (evidence): B counts corrected at `bd29d89`; C §7 noted in the audit report |
| D-1 | No standalone D reviewer artifact in-repo | **fixed** (evidence): transcript recovered + archived with hashes |
| D-2 | D design's claim-scoped key grammar embeds `<track>` but `claims` has no track column; derivation (via digest_id→digests.track) unstated; NULL digest_id edge | **deferred-authorized** — D is design-only; add the derivation note before implementation |
| QF-PROV-2 | QF reviewer transcripts existed only in prunable session storage | **fixed**: archived (see §2) |
| A14-F2 | A QF-side lazy-import pin authored as an exact-set assertion breaks the merged tree (conflict adds a second dynamic import + its own pin) | **unresolved** (constraint on A9-1's fix): author union-aware |

### NOTEs (recorded, no action required beyond the report)

L4-4 acquire-outcome classification race (self-documented); L4-5 deploy-overlap
window between advisory-lock and lease code (one cron period, self-healing);
L4-6 out-of-fence writes correctly scoped (ruling 8/10); L4-7 memory-vs-pg
corrupt-`expiresAt` divergence (both fail closed); A-REC-2 double-future lag
accounting (documented); A-REC-3 `timestampCoveragePct` widened to nullable vs
the prompt's sketch (documented, unambiguous — permitted); A-REC-4 fail-open
recency (disclosed deviation); A-REC-5 legacy intraday inflation (adjudicated);
FUNNEL-A12-5 mirror doc_claims skipped silently vs doc_map_state warns
(asymmetry); FUNNEL-A12-6 non-numeric stats bypass digest-side invariants;
FUNNEL-A12-7 day-string ordering (safe, letter-adjacent to A1's rule);
C-A67-4 MIXED-RUN + `--allow-heldout-rerun` are display-only; A13-F2 dry-run
prints a model live would refuse (fail-closed direction); A13-F3 eval "digest"
= production reduce-synthesis naming asymmetry; A8-F5 verdict LOGIC refined
after offline artifacts existed (threshold constants were not; no candidate
ever existed); QF-PROV-3 fold-in commits post-date their re-reviews (disclosed
pattern; tip-of-cycle escapes reviewer eyes — G3's shape); QF-PROV-4 Worktree B
authored by the coordinator thread (only REVIEWERS were claimed fresh — claim
true); QF-PROV-6 the QF prompt was authored by a different tool at operator
instruction (provenance completeness); A8-F6/ENV-1/P16-3 package-lock churn in
the audit worktree came from the audit's own npm install (restored, never
committed); P16-4 scorecard regeneration timeline consistent; REMAP-4 rollback
guard placement (disclosed); REMAP-6 track allowlist duplicated as literals
(fails closed); REMAP-7 = P16-1; A14-F3/F4 corroborations.

### Requirement classifications (Phase 1.3 summary)

- **Implemented/verified:** the overwhelming majority of A1/A2/A3, B1/B2/B3, C1–C5
  requirements — verified by agents against code with the full-suite/itest/smoke
  gates green (per-agent classifications retained in the workflow journal).
- **Permitted deferrals:** Worktree D implementation (design delivered + reviewed);
  per-adapter fed-group instrumentation (G7); corpus breadth beyond the compact
  initial 56; paid/live evaluation (mandated NOT to run).
- **Required-but-skipped (partial):** funnel surfacing of the global fed-group
  document stage (FUNNEL-A12-1); complete "monotonically safe fencing" (G4).
- **Implemented-after-review:** each gate cycle's fold-in commits (`a730d73`,
  `ce3c985`, `c40060e` hygiene, and tip `7150b49`) — docs-only or
  review-directed, disclosed; plus `ba35082` (cross-worktree reconciliation,
  covered by the final reviews at `e5757ea`).
- **Unsupported documentation claims (all now corrected or recorded):** NUL-scan
  row (G2); A report's funnel `docsAnalyzed` claim (FUNNEL-A12-1); B report's
  "unit-covered latch" cell (L4-1) and §5 stale counts (P16-1); C report §7
  stale heading (P16-2); residual list's "envKnobs printed" (C-A6-3);
  "never a second writer" absolutes (L4-2).

## 4. Phase-4 fresh exact-SHA reviewer findings

(Recorded after both reviews returned; see the reviewer reports committed beside
this register and the final audit report §Verdicts.)
