# Source-reliability calibration design

Date: 2026-07-16
Scope: OPEN-TASKS #14, document-only design
Status: design complete; implementation intentionally not performed in this workstream

## Decision

Measure whether a source's **past** BNOW reliability score predicts ISW's **future**
hedging of that same source. Do not correlate the materialized score with the same
citations that created it: that would be a tautology, because v1 is already the weighted
mean of those hedging labels.

The primary reported metric is an out-of-sample, equal-source calibration error. Keep a
rank-discrimination measure and population coverage beside it; no single number should
hide a score that is well calibrated only because every source sits near the theater mean.

## Existing signal

`scripts/registry-materialize.ts` maps each citation label to an ordinal value:

| ISW hedging class | Value |
| --- | ---: |
| confirmed | 1.00 |
| assessed | 0.75 |
| unknown | 0.50 |
| claimed | 0.40 |
| unverified | 0.15 |

`unknown=0.50` is binding: it represents an unhedged ISW declarative, not a forced
classification. The global and per-theater source scores are in-sample means today.

## Evaluation frame

For each theater independently (`ru`, `ir`):

1. Choose a monthly cutoff `T`.
2. Build each source prediction `p(s,T)` from citations strictly before `T`.
3. Observe citations in `[T, T+90 days)` and compute `y(s,T)`, the mean ordinal label for
   that source in the holdout.
4. Include a source-window only with at least 10 training citations and 3 holdout
   citations. Report how many sources and holdout citations this excludes.
5. Roll the cutoff monthly across the history. A citation may occur in several rolling
   evaluation windows, so confidence intervals must resample source-window clusters, not
   pretend every row is independent.

Run global results only as a secondary view. Theater-specific behavior is the product
claim and avoids mixing ROCA and Iran Update editorial regimes.

## Metrics

### Primary: equal-source calibration error

Partition predictions into ten equal-count source quantiles within each theater/window.
For bin `b`, compare its mean prediction with its mean observed holdout value:

`ECE_source = Σ_b (n_b / N) × |mean(p_b) - mean(y_b)|`

Report this in ordinal points (range 0–0.85) and as a presentation score:

`calibration_score = 100 × max(0, 1 - ECE_source / 0.85)`

The error is the authoritative value; the 0–100 transform is only a reader-friendly
score. Weight each eligible source-window equally so GeneralStaff.ua cannot dominate the
answer through citation volume.

### Required companion measures

- **Citation-weighted ECE:** operational exposure if high-volume sources are wrong.
- **Equal-source MAE:** `mean(|p-y|)`, without binning.
- **Spearman rank correlation:** whether higher historical scores actually order future
  outcomes. Report the bootstrap 95% interval.
- **Calibration intercept and slope:** regress holdout means on predictions; ideal is
  intercept 0, slope 1. A flat slope exposes regression-to-the-mean even when ECE is low.
- **Eligibility coverage:** eligible sources / all cited sources and eligible holdout
  citations / all holdout citations.
- **Per-theater and time-slice table:** never publish only the global aggregate.

### Baselines

Compare v1 against:

1. the theater-wide historical mean assigned to every source; and
2. a citation-count-shrunk score that pulls sparse sources toward that theater mean.

The reliability system adds predictive value only if it improves calibration error and
rank discrimination over the constant baseline. The shrinkage comparison determines
whether the existing raw mean is too confident for sparse sources.

## Gates for a public scored dimension

Do not surface a headline score until all are true for a theater:

- at least 50 eligible source-windows and 500 holdout citations;
- at least four non-overlapping calendar quarters represented;
- bootstrap intervals are reported by source-window cluster;
- v1 beats the constant baseline on equal-source MAE;
- Spearman's lower 95% bound is above zero; and
- platform-root identities are removed (#56), because `facebook.com` pooling 26,195
  citations makes both calibration and concentration results invalid.

Until those gates pass, label the output **research calibration**, not a product KPI.

## Output contract

The first implementation should be a deterministic, read-only report artifact, not a DB
migration or scoreboard field. It should emit JSON plus Markdown containing:

- cutoff/window parameters and exact query boundary semantics;
- per-theater metrics, intervals, baselines, sample coverage, and bin rows;
- the hedging weight version and source canonicalization version;
- exclusion counts by reason; and
- a warning when #56 roots or insufficient samples are present.

Only after the historical report is reviewed should a separate product decision add a
stored validation dimension or UI copy.
