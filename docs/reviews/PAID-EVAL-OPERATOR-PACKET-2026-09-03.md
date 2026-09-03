# Paid-evaluation operator packet — 2026-09-03 (prepared, NOT executed)

Successor to `docs/reviews/OPERATOR-DECISION-PACKET-2026-08-28.md` §5, updated
for the corpus-v2 landing. **Nothing here has run: no `EVAL_*` variable
exists, no baseline was dispatched, no candidate was evaluated, the analysis
registry is untouched (baseline-only, zero `evaluated_candidate` entries).**
Every item below is an operator decision + a later authorized session.

## 1. What is now ready

The corpus-v2 datasets are ADMITTED and merged-pending (map-v2 34 cases /
digest-v2 17 / validation-v2 17 / reduce-v1 14; heldout 8/4/6/5; capacity
cases carry typed applicability metadata; capacity metrics are report-only
diagnostics). The QF-C hardening list is fully closed (item 6 + the numeral
fixtures landed with the corpus). The harness refuses live dispatch without
every guard below — fail-closed at multiple layers.

## 2. Exact baseline configuration (mandatory FIRST run)

- Model `gpt-4o-mini`, reasoning effort ABSENT, provider `openai`, registry
  `analysis-reg-v1`, approval `baseline` — the production-approved
  configuration, dispatched through the normal registry path (no bypass).
- `--execute-live --repetitions 3` (MIN_LIVE_REPETITIONS) per workload cell.
- The baseline runs BEFORE any candidate; candidate scorecards verdict only
  against a COMPLETE same-dataset-hash, same-profile baseline results file
  (pre-registered gates; a profiled candidate pairs only with a same-profile
  baseline).

## 3. Candidate identities and prices (operator to confirm)

Priced in `src/lib/llm/pricing.ts` (per MTok in/out): gpt-5-nano $0.05/$0.40 ·
gpt-5-mini $0.25/$2.00 · gpt-5 $1.25/$10.00 · gpt-4o $2.50/$10.00. An
unpriced model is refused by the live runner (`hasScorecard`/pricing gates).
Recommended candidate order (cheapest first): gpt-5-nano, then gpt-5-mini;
gpt-5/gpt-4o only if the cheap tiers fail quality. Effort variants (e.g.
`gpt-5-mini@low`) are distinct configKeys and cost separate runs.

## 4. Environment posture (ruling 4: caps set in ALL Vercel envs BEFORE any
code that reads them dispatches)

- `EVAL_USD_CAP_DAILY` — recommend **2** (USD/day). Fail-closed today: unset
  ⇒ every reservation refuses.
- `EVAL_DATABASE_URL` — a DISPOSABLE Neon branch connection string, never
  production: the preflight refuses production-host equality (normalized,
  fail-closed on unparseable URLs) and requires `--db-ack <host>` naming the
  branch host exactly. Create the branch fresh per campaign; delete after.
- `LLM_SPRINT_USD_CAP` stays the shared all-time backstop (unchanged, $10).
- NO other variable changes. `ASK_*`, `MAP_*`, `X_*`, routing and flags are
  untouched by evaluation work.

## 5. Matrix cells and repetitions

Per-cell dry-run estimates: `docs/evals/analysis/CAPACITY-MATRIX-ESTIMATE.md`
(regenerated on the v2 corpus; the cells now genuinely diverge — baseline map
24 applicable cases, map-depth-4000 31, map-depth-full 34; digest 80 vs 70
calls). Recommended campaign, in order:

1. Baseline profile, all four workloads, gpt-4o-mini ×3 reps (the mandatory
   live baseline).
2. Candidate (gpt-5-nano) baseline profile, all four workloads ×3.
3. Capacity cells for BOTH models: `--capacity map-depth-4000` (map),
   `--capacity reduce-fed-400` (digest) ×3. `map-depth-full` optional after
   reviewing depth-4000 results.

Structurally inapplicable cases cost zero calls in every cell (never
dispatched) and are recorded as such — cells measure exactly what they can.

## 6. Cost estimates

Single-repetition, all cells, all workloads, gpt-4o-mini prices: **$1.44**
(deliberate over-estimate). Multiply by 3 repetitions and by ~2 models for
the full recommended campaign: **expected < $10 total; worst-case envelope
$15** (gpt-5-mini output prices roughly 3× the gpt-4o-mini figures on the
digest cells; the estimate heuristics already over-count). The $2/day cap
paces the campaign across ~3–5 days; raise to $5/day only if pacing matters
and say so in the authorization.

## 7. Pre-registered acceptance gates (no goalpost moves)

`src/lib/evals/gates.ts` constants as committed BEFORE any candidate result
existed: completeness (scope full, every key, heldout minima from results) →
hard invariants (wrongDocIds 0, heldout under-fill 0, strengthened hedges 0,
guard failures 0, fidelity failures 0, injection follows 0, repro failures 0,
schema-invalid 0, provider errors 0, metering equalities) → aligned-heldout
pairwise quality vs the baseline (map recall/precision means, digest/reduce
checksPassRate, validation match-set precision/recall; delta ≥ 0). Capacity
diagnostics are REPORT-ONLY and gate nothing. A PASS scorecard only ever
**PROPOSES** an `analysis-registry.ts` entry in report text.

## 8. What a PASS does NOT authorize

- No registry edit, no routing change, no production model activation.
- Map activation is additionally HARD-LOCKED (ruling 13) pending the #33
  remap path execution plus explicit operator activation authorization.
- Production remains on the existing deployment throughout; evaluation writes
  land only in the disposable eval branch + gitignored `live-*` results.

## 9. Blocked-until list (verbatim conditions)

1. Operator sets `EVAL_USD_CAP_DAILY` + `EVAL_DATABASE_URL` in all Vercel
   envs (ruling 4 ordering) — or, for a purely local campaign, in the local
   env of the authorized session.
2. Operator names the candidate list and confirms the cost envelope.
3. Operator explicitly authorizes the paid run (packet §5's four decisions).
4. The corpus-v2 PR is MERGED (this packet assumes the admitted datasets).
