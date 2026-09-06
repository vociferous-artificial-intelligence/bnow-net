# Step 05 — WS-3.0 decision memo + PLAN-WS-3: validation by conflict (Wave 1)

| | |
|---|---|
| Model / effort / mode | **Fable / xhigh / plan mode** — planning only |
| Worktree | `/Users/go/code/bnow-net-worktrees/48h-ws3-conflict-20260905` |
| Window | H0 → H4 |
| Depends on | — (step 06 runs in parallel in the separate `48h-ws3-gazetteer` worktree; it is decision-independent) |
| Decisions | D3, D4 (C1–C14 below) — list with recommendations, never decide |
| Spend | $0. No DB. |
| Closing report | `docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md` + `docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first. Planning only: no code, no migrations, no
DDL runs. Plan mode for the whole session; write both documents at the end.

## Goal

Two documents. (1) The WS-3.0 decision memo the handoff asks for, but grounded in what
actually shipped in `src/lib/conflicts/` and the three design docs — because the handoff's
WS-3.1/3.3 text contradicts the reviewed designs in two places (INDEX §1.3, §1.4). (2)
PLAN-WS-3 per handoff §0 item 2, PR-by-PR, for WS-3.1 → WS-3.5 plus the shadow-soak
enablement prep (WS-3.6 prep only). Steps 13, 14, 19, 24 execute from it.

## Read (re-verify; verified against 883e5e3 on 2026-09-05)

- Production unit: `src/app/api/cron/validate/route.ts:24`; `src/lib/validation/run.ts:45-57`
  (`referenceFor` maps ru AND ua to the ROCA row), `:74-281` (`validateDigest`), `:83-95`,
  `:96-122` (probe order, `break` at first hit, one `isw_reports` row per (theater, date) —
  a same-day second edition is unrepresentable), `:152-167` (gazetteer filter; `both` bullets
  land in both denominators; index alignment is load-bearing per the comment at :149-151),
  `:176-187`, `:219-226` (upsert on UNIQUE `(digest_id, isw_report_id)`, `schema.ts:325`);
  `schema.ts:133-152` (`isw_reports` UNIQUE `(theater, report_date)` :151), `:307-326`.
- `src/lib/validation/keywords.ts:5-41,43-62,82-93,109` (TOPONYMS are RU/UA only;
  `classifyTakeawayTheater` returns `both` on no signal); `src/lib/conflicts/lane-classifier.ts:114-130`
  (a separate `IRAN_GEO`).
- The domain library: `src/lib/conflicts/definitions.ts:96-129` (registry), `:132`;
  `lanes.ts:21-42`; `editions.ts:44-48,87-132,344-359,446-477` (normalization, finality rank
  evening > special > daily > plain > morning, `selectDailyFinal`); `eligibility.ts:103,213-219,287-314`
  (legacy claims: excluded from corpus recall, MEMBERS of published retention, labeled);
  `evidence-selection.ts` (40% cap); `evidence-records.ts:76-103,151`;
  `evidence-assembler.ts:8-12` (the real `CorpusRecallClaimSource` must filter through
  `map-versions.ts`); `scorer.ts:34-39` (persistable output carries ids/verdicts, never text —
  ruling 1); `match-contract.ts:45-49,107-119,259-282`; `llm-compatible-matcher.ts:25-26,46-73,101-116`;
  `keyword-matcher.ts:36-42,54-56,71,77-81,108-116` (the rung already returns a scored
  outcome with `keywordUnmatchable` — the recorded blocker is the missing `insufficient_data`
  diagnostic, not "unavailable"); `reference-repo-sql.ts:131-136,138-168`; `product-view.ts:1-20,94-147`
  (fixture-backed, no DB); `eval-profile.ts:71-80,104,270-276,401-404`; `feature.ts:24-36`
  (`requireConflictsUi` calls `notFound()`).
- Designs: `docs/designs/CONFLICT-REGION-EVALUATION.md` (contract; §8 :352-354 append-only;
  §11 cross-reference explainer; §12 "creates NO numbered migration"; lines 84-87 the headline
  label); `docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` §2 (:32-47 Option 1 REJECTED;
  :64-87 Option 3 CHOSEN), §4 (:121-166 the exact later migration operations), §5 (:174-236
  deferred hardening the durable backend must carry); `docs/designs/CONFLICT-SHADOW-SOAK.md:37-48`
  (shadow isolation), `:174-238` (§7 spend pins, §8 operator gates);
  `docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101` (the five blockers);
  `src/integration/sql/conflict-benchmark-reports.sql` (disposable DDL).
- Scoreboard reality: `src/lib/gate.ts:5-8` (public surface); `src/app/scoreboard/page.tsx:26`
  (`TARGETS.coverage=80`), `:37-52` (no gate, queries `validation_runs`), `:122` (column header
  key); `src/app/scoreboard/[country]/[date]/page.tsx:128` (renders claim text publicly);
  `src/app/sitemap.ts:16`; `src/app/robots.ts`; `src/app/conflicts/**` and
  `evidence/page.tsx:32-33` (gate order precedent); `src/integration/authz-page-gate.itest.ts`
  ROUTES table; AGENTS.md 2026-08-24 conflict-landing entry (≈1547-1559: the ROUTES-row
  obligation) and 2026-08-18 audit carry (≈1513, 1537-1539: `FEATURE_AUTH_GATE=true` wherever
  `CONFLICTS_UI` is set — already true in Production per ≈1598-1599).
- Migrations: `drizzle/` listing (0000–0027, `9999_claim_source_trigger.sql` last),
  `drizzle/meta/_journal.json`, `scripts/migrations-lib.ts:10-14,33-47`,
  `src/db/migrations.test.ts:60-80` (9999 last; 0027 additive pin — the pattern each new
  migration copies). `src/lib/isw/load.ts:284-290` (`refreshReportCitations` anchored to
  `isw_reports.id`).
- Import isolation both ways (confirmed): nothing in `src/lib/validation`, `src/lib/isw`,
  `src/app/api/cron` imports `src/lib/conflicts`; the conflict library imports validation
  exports (`match-contract.ts:45-49` etc.). `llm-match.ts` does NOT export `llmMatchOnce`
  (private at `:100`); the reserve → dispatch orchestration is at `:283-296` and `:309-316`
  (WS-3.4b adds the export).
- AGENTS.md rulings 1, 3, 5, 9, 12, 13, 14, 19, 21; handoff §4.3 and §6.

## Memo content — the decisions (each: options, evidence lines, recommendation, what changes)

C1 schema option for reference editions (Option 3 per the design vs the handoff's Option 1) ·
C2 unit of validation (adopt `CONFLICT_REGISTRY`; the new cron iterates `CONFLICT_DEFINITIONS`,
`referenceFor` stays for the per-country lens) · C3 denominator + label ("Key Takeaway
benchmark coverage", never "accuracy"; `both` counted once) · C4 edition policy (rows per
edition; observation per `(conflict, selectDailyFinal winner, day)` vs one per edition) · C5
citation anchoring on multi-edition days (only the daily-final edition links `isw_report_id`)
· C6 observation persistence (overwrite-on-revalidate like `validation_runs` vs append-only per
contract §8 — fixes the 0029 unique key) · C7 Iran/Levant gazetteer scope (English +
transliterations; one versioned module shared with `lane-classifier.ts`? — step 06 is already
building `iran-levant-v1`, coordinate) · C8 `legacy_only` gulf theaters (shipped contract vs
handoff) · C9 ROCA tracks (military only vs + nuclear/elite_politics = new
`evidencePolicyVersion`) · C10 country-scoreboard relabel copy and whether `/scoreboard` stays
public (if gated: `requireAcceptedUser` first, ROUTES row, sitemap/robots changes) — the
conflict view is a NEW gated route under `/conflicts/**` by default · C11 coverage target (no
interim target for conflict rows; reset after the soak) · C12 spend row for the shadow matcher
(`llm_match` shares `LLM_MATCH_DAILY_USD_CAP` with production vs `openai_eval` which needs
`EVAL_USD_CAP_DAILY` in all Vercel envs first — ruling 4) · C13 compound/negative unit
derivation for real takeaways (ship stamped `undetermined` vs block) · C14 validation-v3 vs v4
for the conflict-keyed dataset (INDEX D3, coordinate with WS-1.3).

## PLAN-WS-3 content

PR-by-PR with files, tests, rulings, fork-itest needs, and whether it is inert until the
cron is scheduled: 3.1a migration 0028 (promote the disposable DDL: `benchmark_report_editions`
+ `benchmark_series_days`; note whether drizzle-kit emits CHECK/partial unique indexes or the
SQL must be hand-authored after `db:generate`; additive-shape test per the 0027 pattern);
3.1b migration 0029 `conflict_validation_observations` (conflict id, reference edition id,
date, contributing digest ids, scorer output as ids/verdicts/counts only, matcher rung,
version identities; unique key per C6); 3.2a series/edition-aware discovery
(`src/lib/isw/edition-discovery.ts`, records editions instead of collapsing, politeFetch
spacing math, day-status monotone rule at SQL level); 3.2b `conflict-validate` cron route
(report-only, NOT added to `vercel.json` — scheduling is a WS-3.6 operator step); 3.3a
DB-backed claim sources (corpus recall + published retention; `map-versions.ts` filter — ruling
13; theater from `raw_documents.country_iso2`; how "published" and engine are determined —
name the columns); 3.3b live observation pipeline (assemble → select with the 40% cap → match
→ score → persist; ruling 14: corpora never merged; `classifyTakeawayTheater` becomes
attribution); 3.4b exported reserved single-vote dispatch + live matcher (ruling 9 ladder,
K=5, inert until scheduled); 3.5a conflict view on real observations behind `CONFLICTS_UI`
(ruling 3: the fixture provider never feeds it; ruling 21 gate-first + ROUTES row; ruling 19
labels) plus the country-row relabel; 3.6-prep: soak checklist with the five blockers'
disposition owners, `FEATURE_AUTH_GATE`/`robots.ts` items, spend pins. Acceptance for the
whole workstream restated with the corrected keyword-rung wording (INDEX §1.12). Migration
numbers per INDEX §4.

## Deliverable

Both documents, each ending with the COMMON §5 sections. In **Handoff**: rewrite instructions
for steps 13, 14, 19, 24 — which plan PRs, in what order, and which C-decisions each is
blocked on (so an unanswered decision stalls only that PR).
