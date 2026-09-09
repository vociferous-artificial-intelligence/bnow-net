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

**DECISIONS BINDING — added 2026-09-09 (read before the plan-mode preamble).** (1) Gate:
step 19 merged to `main` (its report `docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md`
exists on `main`; read its Handoff first). The launcher reset your lane branch
`48h/ws3-gazetteer-20260905` to `origin/main`; cut the two step branches from it. (2) C10 and
C11 are SIGNED as recommended — `AGENTS.md` entry "2026-09-06 (D4 — conflict-validation unit
decisions C1–C14 signed as recommended …)"; take the recommended branch, print no
`AWAITING AUTHORIZATION`. (3) **The C5-m handoff below (R.17 of
`docs/reviews/C5M-PROBES-2026-09-07.md`) supersedes every August figure**; the window is
2026-02-28 → 2026-03-22. (4) **C15's named reopening trigger, verbatim from the signed entry
"2026-09-07 (C15 — `publication_gap` two-run confirmation accepted as shipped …)":** *"any
`publication_gap` row whose confirming `probe_failed` row was written by the same backfill
run"* — the first time that observation is made, `first_observed_at timestamptz` is reopened
as a nullable-additive migration; until then no column is added. The soak checklist must say
how the soak would detect it. (5) **From the step-18 register (§Handoff "For step 24"):**
render `probe_failed` as *indeterminate* ("could not be confirmed"), never as a gap; expect
`publication_gap` to be rare-to-absent on this host until WS3-F01 lands (C15's trigger is
structurally unexercisable under throttling); the enablement checklist carries: never run a live
`--series` pass while the cron is scheduled (N06); `lookback` stays 2 (N07); a template change
on the host's error page is a phantom-edition hazard (WS3-F03) — check the 403/404 body size
against `MIN_REPORT_BYTES` at enablement. (6) **State of the WS-3 fixes at your launch is a
fact you check, not assume:** `git log --oneline origin/main -- src/lib/isw/edition-discovery.ts`
— if step 23 lane C's commits (WS3-F01 `classifyProbe` / `probeIndeterminate`, WS3-F02, F03)
are on `main`, the view may surface `probeIndeterminate`; if not, the checklist lists WS3-F01
and F03 as open blockers with owner step 23 and quotes #114 / #116. (7) `roca`'s C5-m
multi-edition figure is 0 by construction (one candidate URL) — never cite it as evidence
about ISW. (8) The worktree's `.env.local` is the trimmed four-key copy; the authz itest's
`serverEnv()` blanks every spend key — copy that pattern for the production build on the fork;
$0. (9) The report file name stays
`docs/reviews/WS-3-5-SCOREBOARD-AND-SOAK-PREP-2026-09-07.md`. Stacked PRs: say so in the report
(`gh pr edit <n> --base main` before merge).

**R.17 — verbatim (C5M-PROBES-2026-09-07.md):**

> These C5-m numbers were measured on a **migrated disposable Neon fork of production**
> (`br-cold-fog-atmcvp28`, since deleted), not on production: migrations 0028/0029/0030 are on
> `main` but unapplied to production (29 applied, newest numbered `0027`), so the literal probe
> returns `42P01` there. Discovery is web-driven and the fork's `isw_reports` is a
> copy-on-write image of production taken after the 2026-09-07 RU drain, so the anchor read is
> equivalent — but it is a fork reading and any report must say so.
>
> **The window is 2026-02-28 → 2026-03-22, not August.** August 2026 has zero multi-edition
> days; this window has eight.
>
> **Use pass 1 for `multiEditionDays` and `anchorNotFinalDays`; use pass 2 for
> `publicationGapDays`.** Pass 1: `iran_update` **multiEditionDays 8, anchorNotFinalDays 1**
> (2026-03-05, anchor `morning` vs daily-final `evening`), publishedDays 15, probeFailedDays 8,
> probes 92, probeFailures 49. `roca`: multiEditionDays 0 — a property of the code
> (`run.ts:49` yields one candidate URL), never evidence about ISW. Pass 2:
> `publicationGapDays` **0** on both.
>
> **Both Iran figures are LOWER BOUNDS.** Fourteen of 23 days were probed while
> understandingwar.org was answering 403 for not-found URLs, so a second edition on those days
> would not have been seen. **2026-03-10 is the named unresolved candidate** — `isw_reports`
> kept its *morning* edition, the same pattern that produced the 03-05 disagreement, and its
> evening shape returned 403 rather than a clean 404. If it resolves the other way the figure
> is 2 of 9.
>
> **`publicationGapDays = 0` does not test (f14)/C15.** Gap confirmation requires EVERY probe
> of the day to be a clean 404 (`edition-discovery.ts:377-379`, `isCleanNotFound` = `status ===
> 404` at `:226`); no day in any pass was all-404, so no gap was confirmed and C15's
> same-session reopening case never arose. On this host that is close to structural: once the ~20
> not-found request budget is spent, no further clean 404 is issued, so gap confirmation is
> effectively unreachable for windows longer than about a week. WS-3.6 should not predeclare
> soak thresholds against `probe_failed` / `publication_gap` without accounting for that.
>
> **`probe_failed` in these runs means "we could not tell", not "ISW did not publish"** — and
> that is measured, not argued: three identical `roca` passes over the same 23 days gave
> `publishedDays` 6 → 6 → 13 while `isw_reports` shows all 23 published, so every `probe_failed`
> day in that series was a false negative.
>
> **A WS-3 finding remains open against step 14's module** (`edition-discovery.ts`):
> `DiscoveredEdition` carries no `identity`, so the `--dry` path cannot run `selectDailyFinal`
> and silently substitutes probe order (`:502-503`). Filed for step 18's register and step 23's
> remediation. This run adds that pass 0 and pass 1 agreed on all 23 days *here*, so the defect
> is latent in this corpus — do not read that agreement as the defect being harmless.

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
