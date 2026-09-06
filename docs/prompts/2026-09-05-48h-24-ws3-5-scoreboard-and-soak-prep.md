# Step 24 — WS-3.5 conflict view on real observations + WS-3.6 shadow-soak enablement prep (no flag-on) — SKETCH (Wave 4)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session with a 20-minute plan-mode preamble |
| Worktree | `48h-ws3-gazetteer-20260905`, step branches `…/conflict-observations-view`, `…/soak-prep` (steps 19 and 23 use `48h-ws3-conflict`) |
| Window | H34 → H42 |
| Depends on | 19 merged; decisions C10 (scoreboard public vs gated; relabel copy), C11 (no interim target) |
| Rewrite from | PLAN-WS-3 §3.5a and §3.6-prep; the 19 report's Handoff (observation read API); the memo's C10/C11 answers |
| Spend | $0 |
| Closing report | `docs/reviews/WS-3-5-SCOREBOARD-AND-SOAK-PREP-2026-09-07.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then the memo, PLAN-WS-3, the 19 report,
`src/app/scoreboard/page.tsx`, `src/app/conflicts/**`, `src/lib/conflicts/product-view.ts`,
`src/lib/gate.ts`, `src/app/conflicts/**/evidence/page.tsx:32-33`, `src/integration/authz-page-gate.itest.ts`
(ROUTES table), `src/integration/conflict-feature-off.itest.ts`, `docs/designs/CONFLICT-SHADOW-SOAK.md`
§7-§8, `docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md` §6.

**Correction carried from step 05's plan (2026-09-06):** the ROUTES-row obligation for the
conflict view is discharged by extending `src/integration/conflict-feature-off.itest.ts`
(flag-on server, seeded observation, body assertions), NOT by adding a row to the
`authz-page-gate.itest.ts` ROUTES table — that harness runs flag-absent and its positive
control cannot pass (AGENTS.md ≈1557; `authz-page-gate.itest.ts:79-84`). The conflict view
reuses the existing `/conflicts/**` routes with a DB-backed provider; the teaser tier is
public when the flag is on, the evidence tier keeps `requireAcceptedUser` then
`requireConflictsUi`.

## Prompt shape (fill in at CP3)

PR 1 — `scoreboard: conflict observations view (real rows only) + evidence-lens relabel`:
a NEW gated route under `/conflicts/**` (default per C10) reading
`conflict_validation_observations` through a DB-backed `db-product-view.ts`; **ruling 3:**
the fixture provider (`product-view.ts`) can never feed this view — pin with a test that the
DB view module does not import fixtures; **ruling 21:** gate call is the FIRST statement of
the page (`requireAcceptedUser` then `requireConflictsUi` — evidence-page precedent), a row
in the authz-page-gate ROUTES table (the 2026-08-24 landing entry's obligation), and the unit
"page-level authorization gate" case; ruling 19 labels ("BNOW-only reported item") mapped
where unmatched claims render; the cross-reference explainer (contract §11); headline label
"Key Takeaway benchmark coverage", never "accuracy"; no target displayed for conflict rows
(C11). Country rows on `/scoreboard` relabeled as evidence lenses per C10's copy — numbers
untouched. If C10 gates `/scoreboard`: sitemap/robots changes and the ROUTES row, else none.

PR 2 — `docs: shadow-soak enablement checklist and blocker dispositions`:
`docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md` — the five recorded blockers
with owner + disposition (which are closed by steps 06/19, which stay open with the exact
follow-up), the enablement items (`FEATURE_AUTH_GATE=true` wherever `CONFLICTS_UI` is set —
already true in Production; `robots.ts` disallow for the gated routes — add the code if
missing; decision-log entry text), the spend pins (C12 row; `EVAL_USD_CAP_DAILY` in all envs
first if `openai_eval`), the `vercel.json` cron line to add (as a diff in the doc, NOT applied),
the log-drain query from step 16, and the soak window + PASS criteria from the design. No
flag is turned on by this step.

Acceptance: unit counts; the ROUTES-row itest runs on a fork (`npm run test:integration --
src/integration/authz-page-gate.itest.ts`, needs a production build — budget 10 min); `git
diff vercel.json` empty; no env named as set.
