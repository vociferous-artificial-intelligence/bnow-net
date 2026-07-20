# Ask run events — transport, event union, and EvidenceSnapshot freeze (Phase 2)

**Date:** 2026-07-19 · **Phase:** AI Search Phase 2 (`codex/ai-search-ask-p2-progressive`)
**Status:** frozen before the full build (master prompt §9 transport spike + §11.0
phase-entry requirement). Deviations need a decision-register entry.

## 1. Transport contract (production-shaped; no process-local fanout anywhere)

Three route handlers, all `requireAcceptedUser()`-gated, `maxDuration = 60`:

1. **`POST /api/ask/runs`** — the paid submission for the progressive client.
   Body `{question, idempotencyKey?}` (same validation as the action). The handler
   runs the SAME money path as the server action (`askWithLimits` semantics via the
   orchestrator) and returns an SSE `ReadableStream`. Every event is **persisted to
   `ask_run_events` BEFORE it is written to the wire** (persist-then-emit), so a
   dropped connection never loses an event — the client reconnects to (2) and
   replays. The terminal event carries today's full result payload; no answer
   streaming in Phase 2.
2. **`GET /api/ask/runs/[id]/events?after=<seq>`** — reconnect/replay. Verifies run
   OWNERSHIP (`ask_runs.user_email` = session email; anything else → 404), replays
   persisted events `seq > after` in order, then — while the run is non-terminal —
   **tails Postgres with bounded polling** (500ms interval, SSE heartbeat comment
   every 15s) until a terminal event or the route duration cutoff; the client
   reconnects with its last seq. **Zero provider calls, zero orchestration** — this
   invocation only reads. No in-memory emitter exists to depend on.
3. **`POST /api/ask/runs/[id]/cancel`** — Phase 2 stub: owner-gated, records a
   `cancel_requested` marker event; Phase 3 wires real cancel semantics.

SSE wire format: `id: <seq>` + `event: <type>` + `data: <json>` records, `: hb`
comments, `Cache-Control: no-store`, `X-Accel-Buffering: no`. The client uses a
fetch-based reader (EventSource cannot POST); reconnect passes `after=<last seq>`.

Free-GET contract: `GET /ask` remains prefill-only. The ONLY paid entries remain the
explicit authenticated POSTs (the server action; this runs route). The runs GET is
read-only by construction.

## 2. Event union (Phase 2 subset of review §5.2; payload allowlist tested)

| type | payload (allowlisted keys only) |
|---|---|
| `run.created` | `{}` |
| `run.authorized` | `{}` |
| `retrieval.lexical_partial` | `{claims: SnapshotClaim[] (top N=12), totalMatching}` — labelled **candidate claims (keyword pass)** |
| `retrieval.completed` | `{candidatesCount, totalMatching, uniqueSources, mode, window, currentThrough}` |
| `rerank.completed` | `{selectedClaimIds, relevantCount?}` |
| `rerank.skipped` | `{reasonClass: "pool_fits"\|"offline"\|"fallback"}` (internal class, generic UI label) |
| `answer.started` | `{}` |
| `run.completed` | `{result: AskAnswerV2}` (the terminal payload — same shape the action returns) |
| `run.failed` | `{errorClass}` (no message text, no stack, no prompt) |
| `cancel_requested` | `{}` (stub) |

Rules (binding): no chain-of-thought; no provider/model names; no prose beyond claim
text that `/search` already serves to the same accepted user; stage copy in the UI
derives ONLY from these events. A unit test walks every event constructor and
asserts payload keys against the allowlist.

## 3. EvidenceSnapshot (frozen shape; F11-safe; stored on the run row)

```ts
interface SnapshotClaim {
  claimId: number;            // display/dedupe hint — UNSTABLE across regeneration
  text: string;               // claim content (the F11 requirement)
  hedging: string;
  claimDate: string | null;
  countryIso2: string;
  track: string | null;
  confidence: number | null;
  sourceDocIds: number[];     // STABLE raw_documents ids
}
interface EvidenceSnapshot {
  version: 1;
  retrievalMode: RetrievalMode;
  window: TimeWindow | null;
  totalMatching: number;
  candidatesCount: number;
  corpusCurrentThrough: string | null;
  candidates: SnapshotClaim[];      // capped at ASK_CANDIDATES (300)
  selectedClaimIds: number[];       // post-rerank order, ids within THIS snapshot
  relevantCount?: number;
}
```

Storage: `ask_runs.evidence_snapshot jsonb` (0023, additive). Retention class: same
as `ask_runs.result` (register #13) — per-user, never analytics, operator retention
decision still open; revisit before Phase 6. Source-doc ids come from one batched
`claim_sources` query at snapshot-freeze time (the hydration prefetch the review
prescribes). Caches (Phase 4) and sessions (Phase 6) consume THIS shape.

## 4. Orchestrator seam

`src/lib/ask/orchestrator.ts` owns the run composition and the event sink;
`ask()` becomes a thin wrapper over it with a null sink (no duplicated business
rules — the Phase 2 risk list's mitigation). Retrieval arms go concurrent
(`Promise.allSettled`; the union/dedupe/composite-sort is order-insensitive, pinned
by a determinism test); `onPartial` fires the lexical event as soon as that arm
lands. Metering stays inside the stages; the orchestrator never touches guards.

## 5. Sequencing + flag

Event `seq` is assigned by the single orchestrating invocation (in-process counter —
one writer per run; the reconnect route only reads). `ASK_PROGRESSIVE=1` switches
the CLIENT transport; the server action remains fully functional as the no-JS/
rollback path (flag off ⇒ byte-identical current behavior). Migration 0023 adds
`ask_run_events` (unique (run_id, seq)), the snapshot column, and the register-#22
partial index `ask_runs(created_at) WHERE finished_at IS NULL` for the expiry sweep.

## 6. Spike proof obligations (before the client is built)

1. On a disposable fork: orchestrated run persists the exact expected event
   sequence; replay returns it byte-identically; `after=` filtering correct.
2. A reconnect during a non-terminal run tails to the terminal event via polling
   (no emitter), then closes.
3. Replay/tail invocations make zero provider calls (stub pipeline, $0).
4. Ownership: another user's run id → 404 on events/cancel.
5. p50 time-to-first-candidate (lexical partial) measured on production-shaped fork
   data; target < 2s.
