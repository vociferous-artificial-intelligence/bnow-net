# Paid-evaluation operator packet — 2026-09-03 (prepared, NOT executed)

Successor to `docs/reviews/OPERATOR-DECISION-PACKET-2026-08-28.md` §5, updated
for the corpus-v2 landing, then corrected 2026-09-03 when the operator
authorized the first campaign (baseline + gpt-5-nano, local-only, $6 ceiling
— see §3/§4/§6). **At the time of that correction nothing had run: no
`EVAL_*` variable exists anywhere durable, no baseline was dispatched, no
candidate was evaluated, the analysis registry is untouched (baseline-only,
zero `evaluated_candidate` entries).** Campaign results are recorded in
their own evaluation record, not by editing this packet.

## 1. What is now ready

The corpus-v2 datasets are ADMITTED and MERGED (`origin/main` `d96180b`, the
PR #42 merge; map-v2 34 cases /
digest-v2 17 / validation-v2 17 / reduce-v1 14; heldout 8/4/6/5; capacity
cases carry typed applicability metadata; capacity metrics are report-only
diagnostics). The QF-C hardening list is fully closed (item 6 + the numeral
fixtures landed with the corpus). The harness refuses live dispatch without
every guard below — fail-closed at multiple layers.

## 2. Exact baseline configuration (mandatory FIRST run)

- Model `gpt-4o-mini`, reasoning effort ABSENT, provider `openai`, registry
  `analysis-reg-v1`, approval `baseline` — the production-approved
  configuration. The live-eval path resolves this exact combination THROUGH
  the analysis approval registry (`analysisApproval`, status "baseline") and
  stamps `approval: "baseline"` into every artifact; any other priced
  combination takes the isolated evaluation bypass and is stamped
  `approval: "evaluation_candidate"` (baseline-identity repair, 2026-09-03).
- `--execute-live --repetitions 3` (MIN_LIVE_REPETITIONS) per LIVE workload
  cell (map, digest, validation). The reduce workload is a DETERMINISTIC
  offline pipeline: zero provider dispatch, zero cost — it appears in the
  overall report from its offline results and is never a paid live cell.
- The baseline runs BEFORE any candidate; candidate scorecards verdict only
  against a COMPLETE same-dataset-hash, same-profile baseline results file
  (pre-registered gates; a profiled candidate pairs only with a same-profile
  baseline).

## 3. Candidate identities and prices (operator to confirm)

Priced in `src/lib/llm/pricing.ts` (per MTok in/out): gpt-5-nano $0.05/$0.40 ·
gpt-5-mini $0.25/$2.00 · gpt-5 $1.25/$10.00 · gpt-4o $2.50/$10.00. An
unpriced model is refused by the live runner (`hasScorecard`/pricing gates).
**The initial authorized campaign is baseline (gpt-4o-mini) + gpt-5-nano
ONLY, both effort-absent.** gpt-5-mini is a LATER, separately authorized
decision (even if nano fails); gpt-5/gpt-4o later still. Effort variants
(e.g. `gpt-5-mini@low`) are distinct configKeys, cost separate runs, and are
NOT covered by the initial authorization.

## 4. Environment posture (ruling 4: caps set in ALL Vercel envs BEFORE any
code that reads them dispatches)

**This campaign is LOCAL-ONLY, as §9 item 1 expressly allows:** every
`EVAL_*` value lives only in the local env of the authorized session's
invocations — NOTHING is set in Vercel, corpus-v2 and the CLI-only
baseline-identity repair are NOT deployed (production stays on its current
release), and the disposable Neon branch is created and deleted through the
local process only. Ruling 4's set-caps-before-deploy ordering is satisfied
vacuously: no deployed code reads any `EVAL_*` variable.

- `EVAL_USD_CAP_DAILY` — **2** (USD/day), local env only. Fail-closed:
  unset ⇒ every reservation refuses.
- `EVAL_DATABASE_URL` — a DISPOSABLE Neon branch connection string, never
  production: the preflight refuses production-host equality (normalized,
  fail-closed on unparseable URLs) and requires `--db-ack <host>` naming the
  branch host exactly. Create the branch fresh per campaign; delete after.
- `LLM_SPRINT_USD_CAP=6` — campaign-local value for the eval invocations
  only: it caps the fresh `openai_eval` ledger row (which starts at zero in
  the disposable branch), making $6 the campaign's absolute expenditure
  ceiling. The production/Vercel value stays the untouched shared $10
  backstop; nothing deployed reads the campaign-local value.
- NO other variable changes. `ASK_*`, `MAP_*`, `X_*`, cron, cap, routing and
  flag settings are untouched by evaluation work.

## 5. Matrix cells and repetitions

Per-cell dry-run estimates: `docs/evals/analysis/CAPACITY-MATRIX-ESTIMATE.md`
(regenerated on the v2 corpus; the cells now genuinely diverge — baseline map
24 applicable cases, map-depth-4000 31, map-depth-full 34; digest 80 vs 70
calls). Recommended campaign, in order:

1. Baseline profile, the three LIVE workloads (map, digest, validation),
   gpt-4o-mini ×3 reps (the mandatory live baseline). Reduce is reported
   from its deterministic offline results — no dispatch, no cost.
2. Candidate (gpt-5-nano) baseline profile, the same three live workloads ×3.
3. Capacity cells for BOTH models: `--capacity map-depth-4000` (map),
   `--capacity reduce-fed-400` (digest) ×3. `map-depth-full` is NOT part of
   this campaign (a later decision after reviewing depth-4000 results).

Structurally inapplicable cases cost zero calls in every cell (never
dispatched) and are recorded as such — cells measure exactly what they can.

## 6. Cost estimates

Freshly generated 2026-09-03 (`--estimate` per intended cell, ×3 reps,
deliberate over-estimates): gpt-4o-mini baseline profile $1.0056 +
map-depth-4000 map $0.0507 + reduce-fed-400 digest $1.1940 = **$2.2503**;
gpt-5-nano same cells $0.6298 + $0.0272 + $0.7760 = **$1.4330**; campaign
total **$3.6833 expected**. The campaign's HARD absolute ceiling is **$6**,
enforced by the campaign-local `LLM_SPRINT_USD_CAP=6` on the fresh
`openai_eval` ledger (§4). A previous draft of this packet stated a $15
worst-case envelope — that was inconsistent as written: the $10 shared
backstop cannot support a $15 campaign without a separate cap decision, and
no such decision exists; the $6 ceiling supersedes it. The $2/day cap paces
the campaign across ~2–3 days; any daily-cap raise would need its own
authorization.

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
   env of the authorized session. **Resolved 2026-09-03: the first campaign
   is purely local (§4); no Vercel variable is set.**
2. Operator names the candidate list and confirms the cost envelope.
   **Resolved 2026-09-03: gpt-5-nano only; $2/day, $6 campaign ceiling.**
3. Operator explicitly authorizes the paid run (packet §5's four decisions).
   **Resolved 2026-09-03 for the baseline + gpt-5-nano cells of §5; the
   paid calls additionally wait for the baseline-identity repair PR to
   merge.**
4. The corpus-v2 PR is MERGED (this packet assumes the admitted datasets).
   **Resolved: merged as `d96180b`.**
