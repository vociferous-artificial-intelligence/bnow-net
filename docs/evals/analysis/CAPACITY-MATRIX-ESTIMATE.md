# Capacity-quality matrix — dry-run estimates (2026-08-27T21:30:11.049Z)

Model `gpt-4o-mini`, 1 repetition(s) per case. Estimates use the same deliberate
over-estimating heuristics as `--estimate`. NOTHING here dispatches: paid cells run only
under the QF-C §6 operator gate with EVAL_* caps set.

| profile | knobs | workload | cases | est calls | est tokens (in/out) | est $ |
|---|---|---|---|---|---|---|
| baseline | depth=1500 fed=<=200 outTok=200 | map | 18 | 18 | 21235/5400 | $0.0064 |
| baseline | depth=1500 fed=<=200 outTok=200 | reduce | 14 | 0 | 0/0 | $0.0000 |
| baseline | depth=1500 fed=<=200 outTok=200 | digest | 10 | 50 | 43865/100000 | $0.0666 |
| baseline | depth=1500 fed=<=200 outTok=200 | validation | 14 | 14 | 6095/3600 | $0.0031 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | map | 18 | 18 | 21235/5400 | $0.0064 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | reduce | 14 | 0 | 0/0 | $0.0000 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | digest | 10 | 50 | 43865/100000 | $0.0666 |
| map-depth-4000 | depth=4000 fed=<=200 outTok=400 | validation | 14 | 14 | 6095/3600 | $0.0031 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | map | 18 | 18 | 21235/5400 | $0.0064 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | reduce | 14 | 0 | 0/0 | $0.0000 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | digest | 10 | 50 | 43865/100000 | $0.0666 |
| map-depth-full | depth=20000 fed=<=200 outTok=500 | validation | 14 | 14 | 6095/3600 | $0.0031 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | map | 18 | 18 | 21235/5400 | $0.0064 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | reduce | 14 | 0 | 0/0 | $0.0000 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | digest | 10 | 50 | 43865/100000 | $0.0666 |
| reduce-fed-400 | depth=1500 fed=<=400 outTok=200 | validation | 14 | 14 | 6095/3600 | $0.0031 |

> HONESTY NOTE: with the v1 datasets these estimates barely differentiate across
> profiles — v1 fixture docs are short (validator cap 1,600 chars), so depth knobs
> change nothing yet. The capacity corpus (v2 datasets with graded long synthetic
> docs and >200-group reduce cases) is what makes the cells diverge; until it
> lands, this table is a harness proof, not a cost forecast.

Estimated grand total (all cells, all workloads): $0.3043

## Cells not expressible as env profiles (visible by design)
- **reduce-fed-800** — requires widening the production clamp in synthesize.ts reduceGroupsFed() (50..400 today) — a reviewed code change, not an env knob
- **reduce-hierarchical-all** — requires an unimplemented hierarchical reduce stage (design work, own A/B gate per ruling 18)
- **map-claims-adaptive** — requires a map PROMPT revision (the 0-3 claims/doc cap is prompt text, part of mapExtractorVersion's basis) — a versioned prompt change with its own eval

## Cap frame: EVAL_USD_CAP_DAILY (unset today — live dispatch refuses everywhere), EVAL_DAILY_REQUEST_CAP default 300, EVAL_RUN_REQUEST_CAP default 200. A cell whose est calls exceed 200 needs multiple runs; plan cells/day against the daily caps.
