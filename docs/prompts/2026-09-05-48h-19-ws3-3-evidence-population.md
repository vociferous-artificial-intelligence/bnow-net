# Step 19 — WS-3.3 evidence population + live observation pipeline (inert) (Wave 4, after CP3)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session with a 20-minute plan-mode preamble |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` (idle after 13b — check per COMMON §4.11), step branches `48h/ws3-conflict-20260905-db-claim-sources`, `48h/ws3-conflict-20260905-live-observation` cut from `origin/main` after CP3 |
| Window | H22 → H32 |
| Depends on | #63, #73 (0028, 0030), #70, #71 on `main`; #56 gazetteer; D4 signed (C2, C3, C8, C12, C13 = the memo); E5 authorizes the one `docs/evals/analysis/` conflict-results refresh for THIS step only |
| Rewrite from | PLAN-WS-3 §3.3a/3.3b; `docs/reviews/WS-3-1-OBSERVATIONS-2026-09-06.md` Handoff (observation table, `withCronRun(job, (counts, runId) => …)`, one observation per (conflict, winner edition, run)); `WS-3-2-EDITION-DISCOVERY-2026-09-06.md` Handoff (discovery API, `derived.units`, C5 link-only anchoring); `WS-3-1-PERSISTENCE-2026-09-06.md` Handoff (0028 names); `GAZETTEER-IRAN-LEVANT-V1-2026-09-05.md` Handoff (`gazetteerFor`, version strings, `insufficient_data`). COMMON §2.5: their "Prompt rewrites" sections bind. |
| Spend | $0. The matcher's paid path stays unreachable until the route is scheduled AND the spend row (C12) exists — pin it. |
| Closing report | `docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md` |

**DECISIONS BINDING — added 2026-09-08 (read before the plan-mode preamble).** D4 and E5 are
SIGNED: `AGENTS.md` decision-log entries "2026-09-06 (D4 — conflict-validation unit decisions
C1–C14 signed as recommended …)" and "2026-09-06 (E5 — one authorized write under
`docs/evals/analysis/`, scoped to step 19)". Take the E5 branch; do not print any
`AWAITING AUTHORIZATION`. Since this prompt was written: (1) **step 18's WS-3 audit register is
on `main`** — `docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md` (PR #78; 21 findings, 2
major, 0 blocker, every verdict merge-stands). Read its majors and minors before touching
`edition-discovery.ts` or anything that consumes `probe_failed` / `publication_gap`: WS3-F01
(403 conflation, OPEN-TASKS #114 — `probe_failed` means "could not tell", never "did not
publish"; gap confirmation is effectively unreachable on a throttled day), WS3-F02 (the `--dry`
finality substitution), WS3-F03 (an oversize non-report body can count as a published edition),
WS3-F04/F05 (edition-id mismatch unchecked; Iran signatures computed under the RU/UA gazetteer).
**Do not fix them here** — step 23 remediates; build so that your population logic does not
depend on the broken semantics, and say in the report which findings you had to route around.
(2) **OPEN-TASKS #116**: the June-2025 suffix slug shape is neither generated nor parsed —
**never run any discovery backfill over 2025-06-12 → 2025-06-24**; a measurable split-edition
window is 2026-02-28 → 2026-03-22 (`docs/reviews/C5M-PROBES-2026-09-07.md` R.17). (3)
**OPEN-TASKS #112**: to point `migrate.ts` at a fork set BOTH `DATABASE_URL` and
`DATABASE_URL_UNPOOLED` on the same command line; never `env -u`. (4) Migrations 0028/0029/0030
are on `main` but unapplied to production (#111) — a fork you create is at 0027 until you
migrate it yourself. (5) The worktree's `.env.local` is the trimmed four-key copy; that is all
this step needs. $0; the matcher's paid path stays unreachable and must be pinned so.

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then the memo, PLAN-WS-3 §3.3, and the
three upstream reports.

**Carried from step 06 (2026-09-06):** step 06 landed `insufficientData` + `gazetteerVersion`
on `ConflictMatchOutcome` (the keyword rung) only. The scorer-level per-unit
`insufficient_data` diagnostic (the landing doc's "denominator-unchanged third class") is THIS
step's work: thread it into `ConflictResultV1`, regenerate the one affected golden
(`cc-matcher-failclosed-013b#B-zero-valid-rounds`, `UPDATE_CONFLICT_GOLDENS=1`), and — only
with decision E5 signed — regenerate `docs/evals/analysis/results/conflict-{roca,iran}-v1-offline-fixtures.json`
and the conflict scorecard via `--offline --profile conflict --fresh --fresh-ack`
(deterministic, $0), with an exposure note in the report. If E5 is unsigned, keep the scorer
change on its own held branch so `hardening-cli.test.ts` stays green on the PR you open.

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
