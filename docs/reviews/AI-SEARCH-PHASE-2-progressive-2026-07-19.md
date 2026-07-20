# AI Search Phase 2 — progressive retrieval, evidence-first UX (implementation report)

**Date:** 2026-07-19 · **Branch:** `codex/ai-search-ask-p2-progressive` (from
integration HEAD `82f93a8`, carrying Phases 0–1)
**Commits:** `5fb3a56` (work block), `49d5000` (frozen transport/snapshot contract),
`1d44370` (server side), `7146e8c` (transport proof), `67b93bd` (client),
`35fbffd` (browser screenshots)
**Contract:** `docs/designs/ASK-RUN-EVENTS-TRANSPORT-2026-07-19.md` — frozen BEFORE
the build (transport spike, event union + payload allowlist, F11-safe
EvidenceSnapshot, orchestrator seam, proof obligations).
**Independent gate:** `AI-SEARCH-GATE-2-2026-07-19.md` (separate adversarial pass).

## What was built

### Server

- **Migration 0023** (additive): `ask_run_events` (unique (run_id, seq)),
  `ask_runs.evidence_snapshot` jsonb, and the register-#22 partial index for the
  expiry sweep.
- **`events.ts`**: typed event union with a CLOSED payload allowlist (unit-enforced,
  fail-closed in the sink — an unlisted key refuses to persist), persist-then-emit
  `PgRunEventSink` (single-writer in-process seq), replay reader, snapshot builder
  (claim CONTENT + stable `raw_documents` ids), SSE encoding.
- **Concurrent retrieval**: `retrieveV2`'s vector and lexical arms run under
  `Promise.allSettled` with per-arm degrade semantics preserved; the union is
  order-insensitive (determinism pinned with a deliberately slow vector arm);
  `onLexicalPartial` fires the moment the keyword pass lands.
- **`ask()` as the orchestrator** (register #32): with a real sink it emits
  `retrieval.lexical_partial` → `retrieval.completed` (with uniqueSources from a
  source-doc prefetch that runs CONCURRENT with the rerank call) → `rerank.completed
  | rerank.skipped {pool_fits|offline|fallback}` → `answer.started`, and freezes the
  EvidenceSnapshot onto the run row. With the NULL sink (action/eval paths) behavior
  is byte-identical — proven by the unchanged suites.
- **Routes**: `POST /api/ask/runs` (the paid progressive submission — the SAME
  `askWithLimits` money path as the action, SSE response, transport-level `run.ref`
  first record); `GET /api/ask/runs/[id]/events?after=` (ownership-gated read-only
  replay + bounded Postgres tailing with heartbeats — zero provider calls, no
  process-local fanout anywhere); `POST .../cancel` (idempotent high-seq marker
  stub for Phase 3); `GET .../result` (ownership-gated hydrated terminal payload
  via the extracted shared `hydrate.ts` — one render contract for both transports).

### Client

- **`run-controller.ts`** (framework-free): incremental SSE parser, pure event
  reducer (unknown events tolerated; cancel-marker high seqs never pollute
  lastSeq), and transport drivers enforcing the money rules — exactly ONE paid
  POST per submit gesture; dropped streams and mid-run refreshes resume via the
  READ-ONLY replay route from a per-tab sessionStorage ref; reconnect budget
  bounded with honest failure states.
- **`RunProgress`**: renders ONLY server-event facts — candidate claims labelled
  "(keyword pass)" with total-vs-sample disclosure, candidate/source/currency
  counts, selected count. Candidate ≠ selected ≠ cited remain three distinct
  labels; no percentages, no invented confidence.
- **`AskForm` integration**: `ASK_PROGRESSIVE=1` (read server-side by the page)
  switches the submit to the run transport; the server action remains fully
  functional as the rollback AND the no-JS degradation (the form's action
  attribute is untouched — JS-off posts to the action even with the flag on).
  Terminal render = the SAME `AskResult` + analytics marker as the action path,
  fed by the hydrated-result endpoint.

## Proof (ledger P2-1…P2-5)

- Unit **1,778/1,778** (146 files; +40 over Phase 1): allowlist fail-closed,
  persist-then-emit ordering, event ordering + snapshot freeze, concurrent-arm
  determinism, route ownership/replay/tail semantics, controller money rules,
  jsdom progressive-vs-flag-off behavior.
- Integration **52/52** incl. the transport spike on real Postgres: exact persisted
  sequences, replay equality, snapshot content, read-only reads. **Measured
  time-to-first-candidate: p50 = 180ms** (target < 2s — 11× margin).
- **Browser verification on the PRODUCTION build** (dev never hydrates on this box,
  #74): 8/8 checks on a disposable branch with LLM_DISABLE=1 — one paid POST per
  gesture, prefill-only GETs, forged-intent zero calls, ownership 404, terminal
  parity (screenshots committed). $0 throughout; branch deleted.

## Exit criteria (review §11 Phase 2)

| Criterion | Status |
|---|---|
| Flag on: p50 time-to-first-candidate < 2s on production-shaped data | **pass — 180ms p50 measured** |
| Stage UI driven only by server events | **pass** (RunProgress renders event payloads exclusively; pinned) |
| Candidate vs selected vs cited labels distinct | **pass** |
| Refresh mid-run resumes without a second paid call | **pass** (jsdom + controller tests: resume is GET-only) |
| Flag off: byte-identical behavior | **pass** (suites unchanged; jsdom flag-off inertness; NULL-sink identity test) |
| Candidates are real stored non-stub claims | **pass** (events carry retrieval output only; stub vectors never scored — unchanged pipeline) |
| Money: GET /ask + forged intents bill nothing; replayed SSE triggers zero provider calls | **pass** (browser + route + itest proofs) |
| Independent adversarial gate | see `AI-SEARCH-GATE-2-2026-07-19.md` |

## Rollout / rollback

`ASK_PROGRESSIVE` unset (default) = current behavior exactly; the event tables are
passive. Enablement (operator-gated, after this workstream): migrate 0021–0023 →
deploy → verify SSE through the production proxy on bnow.net (heartbeats/buffering —
contract risk item) → flip for an internal cohort. Registered debt: event-log
retention (#30), sink connection weight (#33).
