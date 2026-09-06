# Step 29 — PLAN-WS-7: tradecraft legibility (ICD 203 / ICD 206 / ICS 206-01) (Wave 2, added 2026-09-06)

| | |
|---|---|
| Model / effort / mode | Opus / high / **plan mode** — planning only; the deliverable is one document (the addendum suggests Sonnet; use Opus because the two mapping tables are product judgments that need careful rationale) |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws7-tradecraft-20260905`, step branch `48h/ws7-tradecraft-20260905-step29-plan-ws7` |
| Window | H12 → H16 (start now; independent of every other lane) |
| Depends on | — |
| Decisions | T1 (nomenclature), T2 (access date), T3 (mapping tables) — list with recommendations; T3's two tables are DRAFTED as data with a per-cell rationale, never shipped |
| Spend | $0. No DB. |
| Closing report | `docs/reviews/PLAN-WS-7-tradecraft-legibility-2026-09-06.md` (the plan IS the report) |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then
`docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` in full (it is the specification —
its §0 template instructions, §2 principles, §4 briefs, §6 rulings and §7 guardrails apply), then
`docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`, `src/lib/registry/view-policy.ts`,
`src/components/claim-copy-model.ts`, `src/components/claim-evidence-model.ts`,
`src/app/registry/page.tsx`, `src/app/registry/[id]/page.tsx`,
`src/app/digests/[country]/[date]/page.tsx` (the claim query ≈:204), `src/db/schema.ts`
(`raw_documents` ≈185-192, `sources` ≈86-92, per-theater registry ≈119-124, `claims` ≈268-269,
the hedging enum ≈38-44), `src/lib/analysis/publication-guard.ts` (ruling 19 reads the raw enum),
`src/lib/analysis/map-prompts.ts:72` (the hedging vocabulary — NEVER changed by WS-7).

## Two program-level rulings that override the addendum

1. **WS-7.5 does NOT ride WS-3.1.** Step 13's migrations (0028/0029) keep `claims`, `sources`,
   `source_theater_stats`, `isw_reports`, `validation_runs` untouched by design pin. Plan WS-7.5 as
   its own additive migration for a LATER window (number claimed at rebase; `9999` last) and do
   not add the addendum's §3 sentences to the WS-3.0 memo or PLAN-WS-3. If `digests.source_summary`
   is wanted persisted (WS-7.3), it belongs in that same later migration; recommend compute-at-render
   for this window and say what it costs.
2. The addendum's decisions 9–11 are INDEX T1–T3 (the INDEX's D9 is already the injection author).

## Plan content (handoff §0 template)

Goal/non-goals; current state with re-verified file:line (the addendum's citations were verified at
`883e5e3`; re-verify at your base — `claim-copy-model.ts`, `claim-evidence-model.ts`, the registry
pages and the digest query are the load-bearing ones); PR-by-PR for WS-7.1, 7.2, 7.3, 7.4, 7.6 (each:
files, tests incl. the ruling-1 sentinel test, acceptance, rulings 1/2/3/12/14/16/19/21, hours, which
T-decision blocks it); WS-7.5 as the deferred migration design; the two T3 tables as data
(`ESTIMATIVE_MAP_V1`: hedging × corroboration → likelihood band + range + confidence level; the 1–6
credibility table) with one line of rationale per cell honoring the constraint "no cell renders above
'likely' or above 'moderate' from a single uncorroborated document"; the `/methodology` page's gate
posture (public — ruling 21 applies only if gated; no new env); deploy path (none in this window;
all WS-7 PRs are behaviour-identical for existing surfaces except the new copy mode and labels);
exposure note (nothing under `docs/evals/`); session estimates; the T decisions with recommendations.
Sequencing: 30 (crosswalk) and 31 (retention) start now in the `ws7-docs` worktree and need no
decision; 32 (citation mode) needs T2; 34 (estimative mapping) needs T3 signed; 33 (descriptors)
needs neither but must handle the #56 platform-root caveat.

## Deliverable

The plan, ending with the COMMON §5 sections. In **Handoff**: rewrite text for steps 30–34 (they are
sketches), the exact T3 table data blocks for the operator to sign, and the WS-7.5 migration design.
