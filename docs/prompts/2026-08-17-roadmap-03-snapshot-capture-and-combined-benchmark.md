# Roadmap 03 — snapshot capture + combined-benchmark shadow, soak, and launch

Turns the conflict-evaluations workstream from reviewed code into the product's true
headline metric: one combined expert-benchmark coverage result per reference report
(ROCA = RU+UA union; Iran Update = regional multi-track union), with corpus-recall vs
published-retention separated and honest snapshot provenance. Ends with the combined
scoreboard shipped beside — not replacing — the legacy per-country series.

## Read first

`AGENTS.md` · `docs/designs/CONFLICT-REGION-EVALUATION.md` · the conflict program's final
integration report, Phase 5 snapshot-provenance contract (`ConflictSnapshotRef`), and
Phase 7 predeclared shadow-soak plan · `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md`
· `src/lib/validation/`, `src/lib/scoreboard/`, the conflict modules and their tests ·
`docs/TIME-MODEL.md` · the quality-foundation report's snapshot decision (whether a
capture subsystem already exists — if it does, extend it; NEVER build a second one).

## Launch preconditions

Roadmap 02 fully landed and soaked; conflict code in production feature-off; the
control-plane eval CLI operational offline. Verify the Phase 7 soak plan's predeclared
thresholds exist in writing BEFORE any scoring runs — gates chosen after results are
invalid by the program's own contract.

## Authorization boundaries

Authorized with operator confirmation per phase: one additive forward migration for
snapshot capture; scheduled shadow evaluation runs writing to non-public tables; paid
majority-vote matching for the soak under an explicit envelope (operator sets the number
at launch; `llm_match` has cost $0.13 all-time — expect single-digit dollars) through
SpendGuard with per-attempt reservation and metering; the final feature-flag enablement
of the combined scoreboard. Not authorized: rewriting or deleting historical
`validation_runs`; persisting/rendering reference prose; substituting current state for a
historical snapshot; publishing any number whose soak gate did not pass; model or cap
changes.

## Phase A — snapshot capture path

Implement the immutable capture the conflict program designed but deliberately deferred:

- At a scheduled capture instant, freeze BOTH populations the evaluation kinds require:
  the current-version mapped/eligible claim corpus and the publication-guarded published
  output, per conflict, with captured-at instant, capture kind, policy version, content
  hash, and provenance — satisfying the `ConflictSnapshotRef` refusal contract.
- Captures are append-only artifacts; regeneration/backfill never mutates one.
- `operational_cutoff` / `at_publication` / `finalized` scoring becomes available only
  for dates with a real artifact; earlier dates stay `unavailable` with a provenance
  reason or are scored as explicitly labelled retrospectives. Never backfill a fake one.
- Storage bounded and measured (these can be large — design row counts before merging);
  disposable-Postgres integration tests for capture idempotency and immutability.

Gate A (two fresh reviewers): time/immutability lens; database/operations lens.

## Phase B — scheduled shadow evaluation

Wire the conflict evaluation to run per reference report on schedule, feature-off
publicly: discovery of the edition via the reviewed loader, evidence union assembly,
combined scoring against snapshots where available, epoch-labelled persistence. Keyword
fallback stays honestly labelled and never masquerades as a paid majority result.
Zero-provider fixture mode remains the default in tests.

Gate B (fresh reviewer): evaluation-science lens — denominator honesty, no post-hoc
scope changes, unavailable ≠ 0, edition determinism.

## Phase C — execute the predeclared soak

Run the Phase 7 soak exactly as predeclared: duration, minimum report counts per
conflict, lane representation, matcher precision/recall threshold on the human-review
sample, variance threshold across repetitions, query/cost ceiling. Human-review sample
is adjudicated by the operator. Record every result including failures. If the soak
fails a threshold, the outcome is a diagnosis note and a remediation loop — not a
threshold adjustment.

## Phase D — ship the combined scoreboard

On soak PASS only, enable the flag: combined result per report with "Key Takeaway
benchmark coverage" labelling, numerator/denominator beside every percentage,
corpus-recall vs published-retention distinguished, lane + contribution drilldowns
(non-additive, disclosed), the ISW shared-source/non-independence caveat prominent, and
the legacy per-country series retained side-by-side with epoch labels. Update the
scoreboard explainer and methodology copy; i18n keys for en (+uk if within existing
review budget, else tracked).

Gate D (two fresh reviewers): product-clarity/accessibility lens; legal/truth-in-UI lens
(attempt to recover reference prose from every persisted/rendered artifact).

## Completion

`docs/reviews/COMBINED-BENCHMARK-LAUNCH-<date>.md`: snapshot contract as built, soak
results vs predeclared thresholds, the first combined coverage baselines per conflict,
lane-level miss table (feeds roadmap 04), and residual risks. Update CURRENT-STATE and
OPEN-TASKS; one decision-log entry for the flag flip. Statuses:
`implementation-pass / flag-awaits-operator-confirmation`, `soak-failed / diagnosis`, or
`review-gate-blocked`.
