# Conflict-evaluations final audit — Fresh Reviewer #3 (product / integration / compliance), 2026-08-18

## Model gate

Running as **`claude-fable-5`** (system prompt names the model id exactly; "Fable 5"), effort as
configured by the audit caller: **xhigh**. Gate passes on model identity.

## Exact target

**`a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`** (`a2ddca8`), tip of
`codex/conflict-evaluations-integration-20260817`; base `7150b494`. Verified detached HEAD in
`/Users/go/code/bnow-net-worktrees/conflict-audit-review-product-20260818`. This review binds only that SHA.

## Initial attack plan (written before reading any prior review artifact)

1. Verify worktree at a2ddca88; confirm 8 `--no-ff` phase merges from 7150b494, retained branches, no strays.
2. Read prompt §6/§15/§16/§17 and build my own deliverables checklist before any author report.
3. Walk the product surface bottom-up (app/components/product-copy/product-view): ruling-21 gate placement,
   unavailable/zero/incomparable as three DISTINCT renderings, q7 drill-back (reference URL, unit ordinals),
   conflict-vs-country clarity, mobile/RTL/a11y/print.
4. Independently confirm each KNOWN gap rather than trusting the list.
5. Audit gate-evidence honesty: which SHA each gate ran at (ad10fbd / 6b35622 / a2ddca8) and whether the record says so.
6. Narrow reproductions only (single test files); count lines; sanity-check the 7-PR decomposition against file clusters.
7. Only then read the audit ledger + evidence package as evidence-to-check; write this report.

## Inspected paths (all under the read-only worktree unless noted)

- `docs/prompts/2026-08-17-conflict-region-combined-evaluations.md` (§6, §15, §16, §17 read in full)
- `docs/reviews/CONFLICT-EVALUATION-{WORKSTREAM-INDEX,TEST-LEDGER,DECISION-REGISTER,P6-REPORT,P7-REPORT}-2026-08-17.md`
- `src/app/conflicts/page.tsx`, `[slug]/page.tsx`, `[slug]/benchmark/[key]/page.tsx`, `.../evidence/page.tsx` (+ tests)
- `src/components/conflicts/*` (headline, lane-table, run-list, diagnostics, presence, evidence-list, model, explainers, banner)
- `src/lib/conflicts/feature.ts`, `product-copy.ts`, `product-view.ts`, `reference-report.ts`, `editions.ts`, `et-time.test.ts`
- `fixtures/conflicts/README.md` + the three scenario files; `docs/designs/CONFLICT-REGION-EVALUATION.md`, `CONFLICT-SHADOW-SOAK.md`
- After the plan: `.../conflict-evaluations-final-audit-20260818/docs/reviews/CONFLICT-EVALUATION-FABLE-AUDIT-LEDGER-2026-08-18.md`
  and `/Users/go/code/bnow-net-audit-evidence-20260818/README.md` (checked, not adopted).

## Commands and results (narrow reproductions only; zero paid calls, no writes to the target)

- `git rev-parse HEAD` → a2ddca88…; `git log --graph 7150b494..a2ddca88` → exactly **8 `--no-ff` phase merges**
  (0df9106, 8fe9288, e7f4b8e, 323013e, c1a0a5e, 9a2db38, f7b563c, 4e900a6); phase branches p0–p7 all retained.
- `git diff --stat 7150b494..a2ddca88` → **125 files, +40,970 / −4** (matches the published tip figure).
- `git show --stat 6b35622 / 81a6949 / a2ddca8` → 6b35622 docs-only, 81a6949 docs-only, **a2ddca8 changes source**
  (benchmark `[key]/page.tsx` +3/−1; its test +14/−1).
- `npx vitest run` on 5 files (product-view, benchmark-unavailable, localization, `[slug]/page`, evidence page) →
  **44/44 PASS**, 0.97 s.
- Greps: no `metadata`/`generateMetadata` export in `src/app/conflicts/**`; no i18n usage in any conflict file; no external
  `href`/`reportUrl`/`understandingwar` anywhere in the conflict UI or `product-view.ts`; `grep -rn "atomiz" src/ scripts/`
  → **zero code hits**; only `-05:00` in fixtures is a prose `notes` field (crosscutting line 315); `iran-direct-kinetic-001`
  contains no US-strike actor; `docs/reviews/` holds exactly ten conflict files (no gate reports, no INTEGRATION doc, no P1 report).

## Findings by severity

**MEDIUM-1 — §6 deliverable gap: zero committed adversarial gate reports; 19 reviewer verdicts survive only as author
summaries.** Prompt §6 requires "one adversarial gate report per phase"; §15 requires each final review to name SHAs,
paths, findings, verdict. `docs/reviews/` contains none (contrast: the AI-SEARCH workstream committed GATE-0…GATE-7 files).
Verdicts exist only as author-transcribed tables (P7 report §1.4 lines 92–107, §11 lines 1095–1171) and merge messages.
Failure scenario: an operator or later auditor cannot re-derive reviewer independence or full finding lists from git; the
evidence package preserves nine transcripts but lives outside the repository and outside this branch. Cure at merge time:
commit the preserved reviewer outputs (or the package) alongside PR7.

**MEDIUM-2 — the record describes an artifact that does not exist.** DECISION-REGISTER #2 (line 19: atomic decomposition
"kept as a disabled experiment") and contract `docs/designs/CONFLICT-REGION-EVALUATION.md:301` ("the atomization
experiment") imply a built, flagged-off adapter; `grep -rn "atomiz"` over `src/` and `scripts/` finds no code. Only P4 §2
states the truth (never built — permitted by the prompt's "may be built only as"). Failure scenario: a future implementer
or PR reviewer searches for, or claims inheritance from, a phantom adapter; the register is supposed to be the truth
source. One-line register/contract correction needed before merge.

**MEDIUM-3 — terminal gate-evidence seam: two standing sentences are false at HEAD.** TEST-LEDGER lines 330–333 ("This
section is itself a docs-only commit … changes no source and the numbers remain valid at the resulting tip") and
WORKSTREAM-INDEX lines 122–123 ("only docs-only commits sit on top of it") were true when written but are false at
`a2ddca8`, which changes source; the in-repo unit figure (3,212) is stale at tip (true 3,213). The record is otherwise
unusually honest — it explicitly repudiates the stale `ad10fbd` citation, re-ran build/integration at `6b35622`, and ran
the first real browser matrix against the final tree — and the independent audit ledger (§5) replayed the complete battery
green at exactly `a2ddca8` (3,213/3,213; 151/151; 48-state overflow; 42 leak-free evidence bodies; CLI/network-kill
refusals re-run). But that replay lives on the audit branch: someone reading only the target branch would over-trust the
"final SHA" labels. Failure scenario: a future "gates were green at the tip" claim cites the ledger without noticing the
tip moved one source commit past the recorded runs.

**MEDIUM-4 (product) — q7 drill-back dead-ends at the reference report; independently confirmed as enablement blocker 4b.**
`ConflictReferenceReport` carries no URL (`reference-report.ts:24` — `editionKey` only; the edition machinery normalizes
URLs on intake, `editions.ts:87`, then drops them), no conflict surface renders any external link, and reference-only units
render as opaque ids (`diagnostics-module.tsx:115–118`) — while `/scoreboard` already links understandingwar.org
(`src/lib/validation/run.ts:17`) and shows takeaway ordinals + keywords. Failure scenario: an analyst on a benchmark record
cannot open the ISW report to verify a "reference-only takeaway" — the surface makes external validation harder, not
easier, defeating its headline use case. Correctly recorded as a BLOCKING pre-enablement item requiring a profile/epoch
change (P7 §5.2 item 4b); acceptable to merge dormant, unacceptable to enable.

**LOW-1 — two §16 acceptance bullets are presented as fully covered but are partial, undisclosed.** P7 §3 coverage table
maps `iran-direct-kinetic-001` to "direct Iran–Israel–US strikes" (fixture is Israel→IRGC only; no US-strike limb
exercised) and `cc-dst-offset-004` to "DST boundary and explicit-offset timestamps" (no fixture timestamp crosses a DST
transition; the only `-05:00` is prose in a notes field; the transition itself is unit-pinned in `et-time.test.ts:18–56`).
Ironic given the workstream's own partial-as-miss policy. Two small fixture remints + a table footnote cure it.

**LOW-2 — prompt-letter artifact misses.** No `CONFLICT-EVALUATION-INTEGRATION-2026-08-17.md` (§6 names it literally;
content lives in the P7 report under another name, rename unacknowledged); no P1 implementation report (disclosed honestly
at P7 lines 103–107). Failure scenario: an operator following §6's filenames finds a hole.

**LOW-3 — no page metadata and no i18n catalogs on a seven-locale product.** Zero `metadata` exports (root title
"BNOW.NET — validated OSINT intelligence" would stamp synthetic-data tabs/unfurls); all copy is English constants
(`product-copy.ts:10–13` records the deferral). Both recorded as enablement items 4/6 (P7 §5.2); fine dormant.

**LOW-4 — scoreboard→conflict reciprocal link unbuilt.** Contract line 463 requires the coexistence cross-reference
"linked from both surfaces when the flag is on"; only conflict→scoreboard ships (zero `/conflicts` references outside the
package). Condition is flag-on, so this is enablement-scoped; recorded as item 5.

**NOTE-1 — browser evidence artifacts live only in session scratchpads** (TEST-LEDGER:216, P6:257, P7:714 admit it);
nothing under `docs/reviews/assets`. The audit replay at the exact SHA is now the effective evidence of record.

## Categories checked with no finding

- **Conflict-vs-country clarity:** clean — `TERMINOLOGY_EXPLAINER` (three concepts), per-series
  `SCOREBOARD_COEXISTENCE_NOTES` (ROCA two-rows vs Iran one-row, correctly differentiated), "Country pages are unchanged
  and remain the evidence drill-down surface" on the index, legacy-theater labeling in both q7 lists.
- **Three distinct states:** clean — publication-gap and no-proven-snapshot render as worded provenance
  (`benchmark-headline.tsx:38–75`), genuine zero renders `Ratio` with n/d, incomparable lanes render
  `LANE_INCOMPARABLE_LABEL` (`lane-table.tsx:70`), zero-eligible gets its own qualifier; pinned by
  `benchmark-unavailable.test.tsx` and the C14 fixture trio; run-list unavailable cell is words, never a dash.
- **Authorization and feature posture:** clean — evidence page order is `requireAcceptedUser()` then
  `requireConflictsUi()` then data (`evidence/page.tsx:32–41`); teaser pages guard-first with dynamic provider import;
  flag is fail-closed `=1`-only (`feature.ts:24–26`); 42 anonymous evidence bodies leak-free at this SHA (audit replay).
- **Truth-in-UI (ruling 3):** clean — synthetic banner on every route (mutation-pinned), "Fixture demonstration" labels on
  overview/detail/evidence, and the BINDING recorded bar that `CONFLICTS_UI=1` on fixture data breaches ruling 3.
- **Worktree/merge truth:** clean — 8 `--no-ff` merges with verdict-bearing messages, all phase branches retained, base
  chain `7150b49 ← e5757ea` byte-identical non-md, freeze-list surfaces (drizzle, validation/ISW stack, scoreboard, nav,
  robots, i18n) untouched at 0 files.
- **Honest comparison language:** clean — the four-way backtest reports the gulf case as corpus 0/1 incomparable BESIDE
  published 1/1 legacy ("a method that wanted to look good would have reported 1/1 twice"); no committed artifact calls
  fixture gains production gains; soak plan thresholds are genuinely predeclared with register #12 blockers stated in the
  P7 body, not a footnote.
- **Mobile/RTL/a11y/print (code posture):** clean — `dir="ltr"` bidi isolation on numeric runs, logical `text-start/end`,
  unique accessible link names, sr-only labels inside scroll clips (390px bug found and fixed at Gate 6), print method
  stamps; verified in pixels at 6b35622 and re-swept at a2ddca8 by the audit replay.

## The proposed 7-PR decomposition (P7 §5.1) — reviewability judgment

Measured cluster sizes at the tip: `src/lib/conflicts` 18,423 lines (split across PRs 1–4 and 6), design docs + fixtures
8,431 (PRs 1–2), eval-profile cluster 5,456 (PR 5), app/components/integration 3,527 (PR 6), reviews/prompts 5,133 (PR 7).
**I endorse the decomposition** — it is dependency-honest (PR 5 is the only inherited-file touch and lands last among the
eval PRs; PR 6's sole shared-file touch is a six-line comment), each PR lands 3.5–8.5K lines of which roughly half is
tests/fixtures, and committed byte-stable goldens make PR 4 verifiable mechanically. Three refinements rather than a
different scheme: (a) split PR 1's bulky mechanical fixture JSON from the contract prose so the contract gets human eyes;
(b) attach the preserved reviewer outputs as per-PR gate evidence — impossible today from git alone (MEDIUM-1), and the
cheapest fix doubles as that finding's cure; (c) state explicitly that PR 6 must be cut by PATHS from the integration tip,
not from the p6 branch tip, because the closeout fixes (`06e80df`, `f58858d`, `a2ddca8`) to product files landed after the
phase merge. A single 40,970-line PR would be un-reviewable; this plan is genuinely reviewable.

## Separate weighings

- **Dormant merge safety: STRONG.** Zero freeze-list touches, no migration, fail-closed flag, feature-off body-tested at
  the exact SHA, zero paid calls; findings above are all record/enablement defects, none runtime.
- **Soak readiness: NOT READY — and honestly recorded.** Register #12's three blocking prerequisites (human-calibrated
  compound derivation, measured compound rate, attestation adjudication), the RU/UA-only gazetteer degeneracy, and the
  nonexistent live dispatch path all precede any soak; the plan itself is sound and predeclared.
- **Enablement readiness: NOT READY.** Ruling-3 bar (real results + banner retirement) plus items 4 (metadata/robots),
  4b (reference URL + unit ordinals — my MEDIUM-4), 4c (per-source buckets posture), 5 (reciprocal link), 6 (i18n).
  The committed operator checklist captures all of them; nothing here is silently carried.
- **Record integrity: GOOD WITH SEAMS.** The ledger's own "honest statement of record" repudiating the stale gate
  citation is exemplary; the residual seams are MEDIUM-1/2/3 above.

## Verdict

**PASS-WITH-MINORS** — this binds `a2ddca88f7740a148ebeb5372f9ce47dd72ffac4` only, as a dormant, flag-off merge candidate
whose record defects (commit reviewer evidence, correct the phantom-adapter register text and the two stale terminal
sentences) should be cured in the merge decomposition, and it neither authorizes a shadow soak nor `CONFLICTS_UI`
enablement, which remain gated on the recorded blockers.
