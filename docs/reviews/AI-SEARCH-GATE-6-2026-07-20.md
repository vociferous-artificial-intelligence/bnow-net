# AI Search Gate 6 — sessions review (scope, privacy, money)

**Date:** 2026-07-20 · **Subject:** the Phase 6 core (`c98786a`) on
`codex/ai-search-ask-p6-sessions` vs integration HEAD `54e86c4`.
**Method:** one independent reviewer agent (workflow `wf_6234dacc-844`;
154,797 tokens; executed probes with CJS module-interception harnesses — SQL
capture, real limits.ts refusal payloads, pure-function batteries) plus the
lead's inline pass. Sessions stay flag-off and rollout is retention-blocked,
but the delete/export deliverable is exactly what the retention decision will
be made against — the review weighted §7.7 accordingly.

## Verdict

**PASS after fixes** (fix commit `10f9d54`). 1 high + 5 medium + 3 low, all
confirmed by executed probes, all fixed and regression-pinned. Post-fix:
unit **1,945/1,945 (156 files)**, integration **61/61** (disposable fork
`br-cold-frog-atewraaq`, deleted), typecheck/lint/build green.

## Findings and dispositions

| # | Sev | Finding (probe-confirmed) | Disposition |
|---|---|---|---|
| G6-1 | high | §7.7 delete left full content copies in THREE side tables: ask_run_events (claim texts + streamed answer prose in payloads), ask_answer_cache (question+result+snapshot), ask_usage.question — the retention decision would have been made against a delete that silently retains content | **fixed**: events deleted, the owner's cache rows deleted (before question redaction — the join needs the original text), usage.question redacted with cost/token accounting retained; real-Postgres pins for all four surfaces |
| G6-2 | med | Enforce-mode $0 refusals (limit/budget/gate-unavailable) carry runIds and were appended as turns — burning the 20-turn cap and injecting refusal copy into subsequent prompts | **fixed**: turns are gated on terminal state (limit/error never append); pinned |
| G6-3 | med | Turn-cap/ended/idle were checked only AFTER the paid generation — a 21st follow-up billed a full answer and then discarded it | **fixed**: $0 pre-checks before the paid call; appendTurn stays the racing arbiter and its post-call refusals now RETURN the billed result; pinned both ways |
| G6-4 | med | An idempotency replay after a failed append permanently orphaned the billed run (and reported a stale seq); concurrent appends threw the raw driver error post-spend | **fixed**: replays converge (linked run → its real seq; orphaned run → attached now); unique-violation → typed "race" refusal; pinned |
| G6-5 | med | Snapshotless (non-progressive) expand turns made `latestSnapshot` silently fall back to the PRE-expand snapshot — silent scope regression with prior-answer prose from a wider corpus feeding the reuse prompt | **fixed**: appendTurn requires the run to carry a snapshot (`run_ineligible`) — snapshotless turns cannot enter a session at all; pinned |
| G6-6 | med | `ASK_PIPELINE=legacy` (the standing emergency rollback) silently turned "reuse" follow-ups into full live-retrieval asks recorded as scoped turns | **fixed**: follow-ups refuse with `pipeline_legacy`; pinned |
| G6-7 | low | appendTurn did not verify run ownership (defense-in-depth; read paths already failed closed) | **fixed**: folded into the G6-5 eligibility check (owner + snapshot) |
| G6-8 | low | The registered §7.7 replay residual was wrong: a content-deleted run's replay returned the FALSE question-mismatch copy | **fixed**: dedicated honest deleted-content copy in the replay branch; pinned |
| G6-9 | low | Classifier: "Did Putin respond?" swallowed the name (stopword-led pair); modal "may" read as the month | **fixed**: second-token retest + month-context requirement; suggestion-only posture unchanged |

## Checked clean (executed highlights)

Exact-cache bypass on reuse turns holds in BOTH directions (probe: zero
cache ops with `sessionReuse`; control run did lookup AND store). Reuse turns
make zero retrieval/embed/rerank calls by construction (tripwire pins).
Ownership on every read/write (foreign sessions behave as nonexistent;
foreign delete inert; run-per-one-session by unique index). Reuse turns
cannot hit the no-coverage shortcircuit or relevance boundary. F11 turn
reproducibility (byte-identical snapshot re-persisted; fail-soft persist
never costs the answer — and a lost persist now surfaces as an append
refusal WITH the result, not silent scope regression). History-block scope
drift contained (the citation filter + fidelity matrix bound what cited ids
can render; only the last validated answer's 1200 chars enter verbatim).
Per-turn billing through the one guarded money path. Migration 0025 additive;
9999 last. `ASK_SESSIONS` off leaves every path unreachable (no app/component
imports). Classifier is suggestion-only (nothing branches on it). Compaction
linear bound executed at 20 pathological turns (~8.6 KB).

## Acceptance (master prompt §13 subset for the flag-off core)

Reuse follow-up = zero retrieval/embed (structural + real-Postgres) · old
turns render their exact snapshot (F11 re-persist + Phase 4 hydration) ·
delete/export owner-only and complete (post-G6-1) · token growth bounded ·
per-turn billing metered · sessions DISABLED without the retention decision
(no UI, flag off everywhere) — rollout remains operator-blocked.
