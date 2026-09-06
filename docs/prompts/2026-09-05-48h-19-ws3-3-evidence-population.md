# Step 19 — WS-3.3 evidence population + live observation pipeline (inert) — SKETCH (Wave 3)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session with a 20-minute plan-mode preamble |
| Worktree | `48h-ws3-conflict-20260905`, step branches `…/db-claim-sources`, `…/live-observation` |
| Window | H22 → H32 |
| Depends on | 13 and 14 merged (tables + discovery API); 06 merged (gazetteer); decisions C2, C3, C8, C12, C13 |
| Rewrite from | PLAN-WS-3 §3.3a/3.3b, the 13/14 reports' Handoff sections (table names, discovery API), the 06 report (gazetteer API) |
| Spend | $0. The matcher's paid path stays unreachable until the route is scheduled AND the spend row (C12) exists — pin it. |
| Closing report | `docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then the memo, PLAN-WS-3 §3.3, and the
three upstream reports.

## Prompt shape (fill in at CP2)

PR 1 — `conflicts: DB-backed claim sources (corpus recall + published retention)`: implement
the real `CorpusRecallClaimSource` / published-retention source that
`evidence-assembler.ts:8-12` expects: `doc_claims` filtered through `map-versions.ts`
(`mapExtractorVersion()` — ruling 13); theater from `raw_documents.country_iso2` (single-valued;
N:M is WS-3.8); `published` and engine determined by the columns the plan names; stub
adapters excluded at query level (ruling 3); mapped contributors only; `legacy_only` rows per
C8. Unit tests over fixture rows; one fork itest.

PR 2 — `conflicts: live observation pipeline behind conflict-validate (report-only, inert)`:
per `(conflict, day)` from `CONFLICT_DEFINITIONS`: select the reference edition
(`selectDailyFinal`, C4) → assemble evidence from all mapped contributor theaters through
`evidence-selection.ts` with the 40% cap (ruling 14: corpora never merged; evaluation
aggregates) → units (compound/negative stamped `undetermined` per C13 unless a derivation
shipped) → keyword rung via `gazetteerFor(series)` (step 06) and, when the spend row exists,
the LLM rung through the exported reserved single-vote dispatch (`llm-match.ts` — WS-3.4b:
export `llmMatchOnce`-equivalent, K=5, majority via `resolveVoteRounds`, ruling 9 ladder) →
`scorer.ts` → persist the persistable shape into `conflict_validation_observations` (0029).
`classifyTakeawayTheater` becomes attribution (which contributor covered the unit), never a
filter. Ruling 12 unchanged. Pins: with the route unscheduled nothing runs; with
`LLM_DISABLE=1` the keyword rung still produces an observation; the paid rung is refused
before `tryReserve` when the C12 row/cap is absent; no ISW text reaches the persist call
(assert on the persisted object). Fork itest end-to-end over fixtures.

Acceptance: unit counts; fork itest; `vercel.json` unchanged; production `validate` untouched.
Handoff: what step 24 reads for the scoreboard view and the soak checklist.
