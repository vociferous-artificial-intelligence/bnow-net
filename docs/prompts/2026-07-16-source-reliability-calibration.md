# Claude Code handoff — #14 source-reliability calibration report

Recommended model: **Claude Opus 4.8**
Effort: **high**

Implement only after #56 Facebook segmentation is reviewed and deployed. Work in
`/home/go/code/bnow.net`; read `AGENTS.md`, `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`,
and the #56 research/handoff. Do not change GitHub Actions.

Build a deterministic **read-only** script that implements the time-split design exactly:
monthly cutoffs, 90-day holdouts, per-theater predictions from strictly prior citations,
10-train/3-holdout eligibility, equal-source ECE/MAE, citation-weighted ECE, Spearman,
calibration slope/intercept, clustered bootstrap intervals, constant and shrunk baselines,
and coverage/exclusion tables. Emit JSON plus Markdown with query boundaries, hedging-weight
version, source-canonicalization version, and warnings for platform roots or insufficient
samples.

Acceptance criteria:

- synthetic tests catch temporal leakage, incorrect unknown weighting, source-vs-citation
  weighting mistakes, rolling-window cluster handling, and empty/sparse theaters;
- a disposable-Neon fixture reproduces the report deterministically;
- the production run is SELECT-only and refuses to publish a headline when #56 roots or the
  design's population gates fail;
- no migration, scoreboard/UI field, provider call, or production write;
- report results are reviewed before any later product integration.

Run typecheck, lint, unit tests, and scoped integration tests. Do not commit, push, deploy,
or mutate production without explicit authorization.
