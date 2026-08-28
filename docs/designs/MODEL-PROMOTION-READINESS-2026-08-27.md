# Model promotion + map activation readiness (PREPARED, NOT EXECUTED) — draft 2026-08-27

Roadmap Phase 8 deliverable. Nothing here authorizes anything: promotion requires QF-C
paid results against the predeclared gates plus an operator decision; MAP activation is a
further separate gate. This template exists so that when authorization arrives, execution
is mechanical and nothing is decided under time pressure.

## 1. Promotion decision template (fill from a passing scorecard)

- Candidate: (workload, model, effort) — from `identity` in the passing results file.
- Evidence: scorecard verdict PASS at `docs/evals/analysis/ANALYSIS-EVAL-SCORECARD.md`
  (dataset version + content hash + promptHash + configKey + envKnobs, all stamped in the
  `proposedRegistryEntry` block); repetitions ≥ MIN_LIVE_REPETITIONS (3); baseline =
  gpt-4o-mini live over the SAME dataset and SAME capacity profile; zero hard-invariant
  violations; quality deltas ≥ 0 on every gated metric (QUALITY_MIN_DELTA=0 — resource
  savings never rescue a regression).
- Costs: measured per-case live meter vs the estimate; projected steady-state daily delta
  at production volumes (map ~1.35M in-tok/day baseline; reduce per §5 of the capacity
  audit).
- Registry action: add the `evaluated_candidate` row to
  `src/lib/llm/analysis-registry.ts` EXACTLY as proposed (a reviewed code PR — the
  scorecard only proposes); then, separately, the routing env for the workload.
- Decision-log entry: candidate, evidence pointers, caps posture, rollback, observation
  plan. No entry → no activation (ruling 6/registry contract).

## 2. Required #33 remap plan (MAP promotions only — the hard lock)

Any change to map model/effort/prompt/content-budget bumps `mapExtractorVersion`, and
every consumer filters to current versions: without a remap, history goes dark for the
new version (nothing double-counts — the guard is version filtering — but coverage
would restart from zero).

- Operator: `scripts/map-remap.ts` (deployed 2026-08-22, NEVER executed; dry-run-first,
  resumable, lease-safe, fail-closed flags, structurally cannot delete history).
- Sequence: (1) dry-run against production route → yield/cost estimate; (2) operator
  spend authorization sized from the dry run (corpus ≈ 400–500K epoch-eligible docs;
  at the measured ~214 prompt-tok/pair and the candidate's pricing — fill in at decision
  time; gpt-4o-mini-scale reference: full-corpus remap ≈ low tens of dollars, a frontier
  model is 20–60× that); (3) `--execute` in bounded batches inside `MAP_USD_CAP_DAILY`
  or a bounded override (the sanctioned mechanism, auto-expiring `_UNTIL`); (4)
  per-day disposition-coverage verification (the 2026-08-15 recovery's method).
- Double-count guard: `map-versions.ts` consumers stay pinned; the remap writes the NEW
  version only; old versions remain for audit. Verify zero cross-version mixing in
  digests via `extractor_version` grouping before flipping any digest window.

## 3. Extractor-version transition + rollback

- Transition: deploy the registry/env change → hourly map writes new-version claims →
  digest windows go thin for the new version until remap covers history → REMAP FIRST,
  THEN FLIP is the default order (avoid the #88-class window-empty fallback).
- Rollback: remove the routing env + redeploy (old build reads old version; new-version
  rows are inert to it — same property proven at the #86 rollback design). Digest
  regeneration NOT required on rollback; validation continues.
- Capacity-knob promotions (depth/fed) WITHOUT model change: fed (`REDUCE_GROUPS_FED`)
  does NOT touch extractor versions — env + redeploy + scoreboard watch only, rollback =
  unset env. Depth (`MAP_CONTENT_CHARS`) DOES bump the version → full §2 remap path.

## 4. Observation schedule (any promotion)

Deploy from the plain release clone; rollback target recorded first. Then: first natural
map cycle (:40) clean → 24h formal soak (PR #5's soak template: 24/24 cycles, one
dispatch identity, zero routing-gate failures) → scoreboard watch ≥ 1 week vs the
pre-promotion coverage baseline (the ruling-18 A/B figures remain the floor). Digest
engine mix + `openai_reduce`/`openai_map` daily spend tracked against the §1 projection.

## 5. Paid-matrix prerequisites checklist (state at 2026-08-27)

- [x] Harness capacity dimension + per-cell results files (PR #31)
- [x] 11-item hardening list implemented (pending review/merge; items 6+numeral fixtures
      ride corpus-v2)
- [ ] Corpus v2 committed (drafts machinery-verified, pending human review of the 14
      open questions + contract cap raise to 6,000)
- [ ] Baseline live run (gpt-4o-mini, reps ≥3) — first paid step, needs §6 authorization
- [ ] `EVAL_*` caps set in all envs BEFORE any live run (ruling 4 ordering)
- [ ] Operator §6 authorization: caps + candidate identity + matrix cells
- [ ] For map-model cells: #33 remap NOT required for eval (eval branch is disposable),
      required only for PRODUCTION activation.
