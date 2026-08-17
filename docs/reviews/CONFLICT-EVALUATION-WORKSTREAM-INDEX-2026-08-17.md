# Conflict/region evaluations — workstream index (2026-08-17)

Prompt: `docs/prompts/2026-08-17-conflict-region-combined-evaluations.md` (saved
untracked in the operator checkout). Local-only program: no push, no PR, no
merge to `main`, no deploy, no env change, no paid application-provider call,
no production write. All new runtime behavior is disabled by default.

## Base selection (rule 1 of the prompt's base-selection rules)

The quality-foundation program completed with an exact final review-passed
integration SHA before this workstream created any branch:

- **Reviewed SHA: `e5757ea`** on `codex/quality-foundation-integration-20260817`
  — full gates green at that SHA (unit 2,402/2,402 across 185 files; build
  PASS; full disposable-Neon suite 119/119; typecheck/lint/diff-check clean;
  $0 smokes; source scans) and BOTH final independent reviews
  (safety/operations, quality/science) returned PASS-WITH-MINORS against
  exactly that SHA with zero BLOCKER/MAJOR findings.
- **This workstream branches from `7150b49`**, the docs-only disposition
  commit atop `e5757ea` that records those two verdicts, relocates the
  decision-log entry (the one fix-before-merge review item), and documents the
  eval cap envs. Code is byte-identical to the reviewed SHA
  (`git diff e5757ea..7150b49 -- ':!*.md' ':!.env.example'` is empty; the
  `.env.example` delta is commented documentation). Branching from `7150b49`
  rather than bare `e5757ea` is deliberate: Phase 0's mandated reading list
  includes "its final integration report and both final independent review
  reports", which exist in complete form only at `7150b49`.
- Chain of custody: `7150b49` ← `e5757ea` ← … ← `05fdd2c` (local merge of
  `origin/main` `9c5e9cb` + reviewed routing tip `0e469f7`). NOTHING in this
  chain is on `origin/main`; the operator will select merge order later.

## Git-state audit at workstream start (read-only)

- `origin/main` = `9c5e9cb` (Candidate B cron clustering; the production
  deployment base). The Iran-validation recovery IS merged into main's history
  (`26989f7`). The routing branch `0e469f7` (PR #5) is unmerged and its
  worktree frozen. The operator checkout sits clean on `main`.
- Quality-foundation state: COMPLETE (terminal status
  `implementation-pass / merge-awaits-operator-review`); its integration
  worktree remains at `7150b49` and is not modified by this workstream.
- Migrations: applied through `0027` + the `9999` trigger (applies last). NO
  numbered migration is claimed by the quality foundation, by the adjudication
  design, or by THIS workstream — per the prompt, this workstream produces
  schema/API design and disposable SQL only.

## Worktree / branch map

| Path | Branch | Purpose |
|---|---|---|
| `/Users/go/code/bnow-net-worktrees/conflict-evaluations-20260817` | `codex/conflict-evaluations-integration-20260817` | this workstream's local integration branch (base `7150b49`) |
| (same worktree, phase checkouts) | `codex/conflict-evaluations-p0-contract` … `-p7-integration` | one branch per phase, each from the latest passing integration HEAD |

## Concurrent contact surfaces (freeze list)

Files/contracts this workstream must treat as owned elsewhere, consuming only
their documented extension points:

- **Eval control plane (QF Worktree C):** `src/lib/evals/*` — closed
  `AnalysisEvalWorkload` union (`map | reduce | digest | validation`) with
  exhaustive maps/switches in contracts, runner, gates, CLI, live dispatcher;
  results identity = (caseId, repetition) + header {datasetVersion,
  datasetContentHash, requestedRepetitions, scope, envKnobs, identity};
  verdicts require scope-full results-side completeness + heldout minima from
  results + identity-stable resume + complete hash-matched baseline. ONE
  runner, ONE `scripts/analysis-eval.ts` entry point. Phase 0 records the
  extension decision (validation profile vs one additive `conflict_validation`
  workload) BEFORE any control-plane edit.
- **Production validation stack:** `src/lib/validation/run.ts`, `score.ts`,
  `llm-match.ts` (its prompt/schema/sanitizer are exported for reuse — never
  fork), `keywords.ts`, `at-publish.ts`, `isw-extract.ts`; `src/lib/isw/load.ts`
  (the single citation-upsert authority — reuse, never fork), `parse.ts`,
  `urls.ts`; `src/app/api/cron/validate/route.ts`; `scripts/validate.ts`.
  Conflict logic is isolated FIRST behind new pure modules; any touch to these
  files is a narrow, documented seam.
- **Digest/claims surfaces:** `digests.structured.stats.evidenceRecency`
  (QF A, additive), `structured.stats.reduce.gidsCitedAnyVote/gidsMajority`
  (QF A), `persistDigest`'s required `asOf` + guard-before-verdict ordering,
  `map-versions.ts` (the ONLY sanctioned current-version accessor).
- **Map operations (QF B):** the `map_lease` provider_state key; remap mode's
  semantics (never writes `processed`); `scripts/map-remap.ts` checkpoint dir.
- **Schema constraints that bind Phase 2:** `isw_reports` has UNIQUE
  `(url)` AND UNIQUE `(theater, report_date)` — one row per theater/date, no
  edition representation; `validation_runs` has UNIQUE
  `(digest_id, isw_report_id)` and is UPSERTED in place by revalidation;
  `digests` rows are last-writer-wins with claims DELETE+reINSERTed per
  regeneration (no historical snapshots exist).
- **Shared docs:** `docs/OPEN-TASKS.md` (#33/#77 carry branch-state
  annotations from QF), `AGENTS.md` decision log (QF entry present),
  `docs/PROGRESS.md`.

## Phase status

| Phase | Branch | Status | Evidence |
|---|---|---|---|
| 0 recon/contract | `codex/conflict-evaluations-p0-contract` | **PASSED** (legal PASS + science PASS-WITH-MINORS on `ea35fbf` after FAIL→remediation) | contract; P0 report; fixtures; register #1-#9 |
| 1 domain | `codex/conflict-evaluations-p1-domain` | **PASSED** (architecture FAIL on `0d7ab8f` -> remediation -> PASS on `975cdcd`) | `src/lib/conflicts/` (10 modules, 196 tests); ledger P1; register #10 |
| 2 reference windows | `codex/conflict-evaluations-p2-reference` | **PASSED** (dual FAIL on `651b9d6` -> remediation -> PASS + PASS-WITH-MINORS on `e292ab3`) | schema design doc; P2 report; ledger P2; disposable SQL + itests |
| 3 evidence union | `codex/conflict-evaluations-p3-evidence` | **PASSED** (dual FAIL on `5f1844c` -> remediation -> PASS + PASS-WITH-MINORS on `9fef8b7`) | P3 report (binding carried conditions §5); ledger P3; 40-scenario acceptance corpus |
| 4 scoring | — | pending | |
| 5 eval adapter | — | pending | |
| 6 product UI | — | pending | |
| 7 integration | — | pending | |
