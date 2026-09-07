# Step 13b — WS-3.1 conflict-observation migration (PLAN-WS-3 §3.1b; drafted as "0029") (Wave 3, follow-up to step 13)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session (15-minute plan-mode preamble, then execute) |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905`, step branch `48h/ws3-conflict-20260905-mig-observations` cut from `origin/main` after CP2b (#63 and #64 merged) |
| Window | after CP2b |
| Depends on | #63 AND #64 on `main` (CP2b done — `ls drizzle` shows 0029_runtime_logs.sql); D4 signed "all 14" (commit `c50721a`) = the memo's recommendations: C1 Option 3, C6 **(b) append-only**, C4 (a), C3/C7/C13 columns as the memo; step 13's report Handoff "For the session that builds 0029" |
| Decisions | none open |
| Migration number | **0030**, generated with `npx drizzle-kit generate --name conflict_observations` on a base that already has `0029_runtime_logs` (PR #64, merged at CP2b) — so the snapshot chain reads 0028 → 0029 → 0030 (`node -e` check: `0030_snapshot.json`.prevId === `0029_snapshot.json`.id). If `drizzle-kit` proposes any number other than 0030, or the generated SQL touches anything but the new observation table, stop and report. `9999_claim_source_trigger.sql` stays last. Never edit 0028 or 0029. |
| Spend | $0 beyond one disposable Neon fork for the itests (`scripts/test-integration.sh` creates and deletes it). This worktree's `.env.local` is the TRIMMED copy (COMMON §4.10) — confirm with `grep -c API_KEY .env.local` → only `NEON_API_KEY`. |
| Closing report | `docs/reviews/WS-3-1-OBSERVATIONS-2026-09-06.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then PLAN-WS-3 §3.1b, the WS-3.0 memo's
C3, C4, C6, C7, C13, and `docs/reviews/WS-3-1-PERSISTENCE-2026-09-06.md` — its Handoff carries
the final 0028 names and the exact observation-table shape under C6 = (b). Prove the
worktree before anything else.

## Do

Build §3.1b verbatim under C6 = (b): observations are append-only (no overwrite path, no
UNIQUE on `(conflict_id, reference_edition_id)`); the headline is derived at read time; the
C3 / C7 / C13 columns (`unit_attribution`, `gazetteer_version`, `unit_flags_version`) ride this
migration; keys and FKs to `benchmark_report_editions` exactly as the Handoff states. Drizzle
exports in `src/db/schema.ts`; repository surface in the style of
`src/lib/conflicts/reference-repo-sql.ts`; forward-only migration. Do not write to
`isw_reports` or `source_citations`; do not touch any applied migration.

Itests on a fork (the `runMigrations` pattern): a second write for the same
(conflict, edition, run group) creates a new row and updates nothing; read-time headline
derivation over ≥3 rows; the FK refuses an unknown edition; every row stamps
`unit_flags_version` (INDEX §2.4, D4/C13).

## Acceptance

typecheck / lint / unit green with the new tests counted; itests green on a fork with the
numbers in the report; `git diff drizzle/0028*` empty; the fork deleted and said so.

## Report

COMMON §5. Handoff: table, column and repository names for steps 19 and 24; the migration
number actually claimed; an "attack these first" list for step 18.
