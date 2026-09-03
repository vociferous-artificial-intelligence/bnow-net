# Capacity-quality matrix — dry-run estimates (2026-09-03T13:37:33.182Z)

Model `gpt-4o-mini`, 1 repetition(s) per case. Estimates use the same deliberate
over-estimating heuristics as `--estimate`. NOTHING here dispatches: paid cells run only
under the QF-C §6 operator gate with EVAL_* caps set.

| profile | knobs | workload | cases | est calls | est tokens (in/out) | est $ |
|---|---|---|---|---|---|---|
| baseline | depth=1500 fed=<=200 outTok=200 | map | 34 | 24 | 29805/6600 | $0.0084 |
| baseline | depth=1500 fed=<=200 outTok=200 | reduce | 14 | 0 | 0/0 | $0.0000 |
| baseline | depth=1500 fed=<=200 outTok=200 | digest | 17 | 80 | 232310/480000 | $0.3228 |
| baseline | depth=1500 fed=<=200 outTok=200 | validation | 17 | 17 | 7464/4360 | $0.0037 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | map | 34 | 31 | 43831/17200 | $0.0169 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | reduce | 14 | 0 | 0/0 | $0.0000 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | digest | 17 | 80 | 232310/480000 | $0.3228 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | validation | 17 | 17 | 7464/4360 | $0.0037 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | map | 34 | 34 | 52100/23500 | $0.0219 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | reduce | 14 | 0 | 0/0 | $0.0000 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | digest | 17 | 80 | 232310/480000 | $0.3228 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | validation | 17 | 17 | 7464/4360 | $0.0037 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | map | 34 | 24 | 29805/6600 | $0.0084 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | reduce | 14 | 0 | 0/0 | $0.0000 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | digest | 17 | 70 | 132880/630000 | $0.3979 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | validation | 17 | 17 | 7464/4360 | $0.0037 |

> The corpus-v2 datasets (2026-09-03) carry graded long synthetic docs and
> >200-group fed-cutoff cases, so the cells now genuinely diverge: capacity
> cases a profile's knobs cannot satisfy are classified structurally
> INAPPLICABLE and cost ZERO calls in that cell (never dispatched), so each
> cell's estimate covers exactly the cases it would actually run. Estimates
> remain deliberate over-estimates, never a billing promise.

Estimated grand total (all cells, all workloads): $1.4371

## Cells not expressible as env profiles (visible by design)
- **reduce-fed-800** — requires widening the production clamp in synthesize.ts reduceGroupsFed() (50..400 today) — a reviewed code change, not an env knob
- **reduce-hierarchical-all** — requires an unimplemented hierarchical reduce stage (design work, own A/B gate per ruling 18)
- **map-claims-adaptive** — requires a map PROMPT revision (the 0-3 claims/doc cap is prompt text, part of mapExtractorVersion's basis) — a versioned prompt change with its own eval

## Cap frame: EVAL_USD_CAP_DAILY (unset today — live dispatch refuses everywhere), EVAL_DAILY_REQUEST_CAP default 300, EVAL_RUN_REQUEST_CAP default 200. A cell whose est calls exceed 200 needs multiple runs; plan cells/day against the daily caps.
