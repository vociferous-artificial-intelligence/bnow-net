# AI Search Phase 6 — scoped investigation sessions, core (implementation report)

**Date:** 2026-07-20 · **Branch:** `codex/ai-search-ask-p6-sessions` (from
integration HEAD `54e86c4`, Phases 0–5) · **Commits:** `c98786a` (+ Gate 6 fix
commits) · **Gate:** `AI-SEARCH-GATE-6-2026-07-20.md`.

## Scope decision (honest bound)

The retention decision (§7.7; registers #13/#30) blocks ANY session rollout,
so **no UI ships** and `ASK_SESSIONS` stays OFF everywhere. This phase lands
the CORE the master prompt requires before rollout — schema, owner-gated
lifecycle, **delete/export ownership first**, the pure classifier/compaction,
and the reuse-turn money path — so enablement after the retention decision is
a flag flip plus UI work, not new money-path engineering.

## What shipped

- **Migration 0025** (additive, passive): `ask_sessions` + `ask_turns`
  (unique `(session_id, seq)`; unique `run_id` — a run belongs to at most one
  session). A session is an ORDERING over immutable runs; its continuity unit
  is the frozen EvidenceSnapshot (§7.1 — never a transcript).
- **sessions.ts**: create/get/list/append (owner-gated everywhere; turn cap
  20; 24 h idle TTL); `startSessionFromRun` requires the origin run to carry
  a snapshot; `latestSnapshot`; `buildHistoryBlock`;
  **owner-only `deleteSession`** (§7.7: turns removed, the linked runs'
  question/result/snapshot CONTENT nulled, the run + ask_usage ACCOUNTING
  rows retained as billing records) and **owner-only `exportSession`**
  (turns in order with question/result/snapshot).
- **Scope classifier** (`classifyFollowup`, pure, deterministic): suggests
  `reuse | expand | new` from theater/date/novel-entity signals ABSENT from
  the snapshot; it only ever SUGGESTS — nothing in the codebase enforces it
  (§7.3: the user's explicit choice always wins).
- **`compactHistory`** (§7.5): one structured line per prior turn (question +
  state + cited ids); only the MOST RECENT turn's answer appears verbatim,
  char-budgeted — input growth is linear in turn count, never quadratic
  (property-tested with 19 huge turns).
- **The REUSE money path**: `ask()` gains a `reuseSnapshot` branch —
  retrieval, embed, and rerank are structurally NEVER INVOKED (tripwire-
  mocked test + real-Postgres proof: zero provider reservations, null embed
  tokens); the guarded generation runs through the identical
  `answerFromEvidence` stage (validator, fidelity matrix, streaming rules
  all apply unchanged); `askWithLimits` threads `sessionReuse` with full
  allowance/idempotency/reservation semantics and **bypasses the exact
  cache in both directions** (a turn is scoped to ITS snapshot; `cacheCtx`
  stays null so the store block cannot fire); the SAME frozen snapshot is
  re-persisted onto the turn's run row, so every turn hydrates F11-safely
  via the Phase 4 snapshot-hydration path even after digest regeneration.
  `historyBlock` appends compacted context to the user message; when absent
  the prompt is byte-identical (empty-block test).
- **`runReuseFollowupTurn`**: flag-gated end-to-end wrapper — session
  ownership, snapshot load, history compaction, the ONE `askWithLimits`
  call, then `appendTurn` (refusals without a run identity consume no turn;
  replayed keys append no duplicate turn).

**Explicitly NOT shipped:** UI (rollout blocked); the `expand`/`new` turn
convenience wrappers (those turns are ordinary pipeline runs via the existing
entry points — a thin wrapper adds nothing until UI exists); retention sweep
for sessions (the operator retention decision defines it); analytics events.

## Proof (ledger P6-1..P6-3)

Unit **1,937/1,937 (156 files; +22)** — classifier fixtures incl.
determinism; compaction bounds; ownership/cap/idle/foreign-user guards;
delete's exact SQL surface (content nulled, NEVER a delete on
ask_runs/ask_usage); the reuse tripwire test (retrieveV2 + rerank never
invoked; snapshot evidence in selected order; legacy ignores the branch;
inert without the flag). Integration **61/61 (11 files; +5)** on a disposable
fork: start/ownership isolation; the reuse follow-up end-to-end through
enforce-mode `askWithLimits` ($0 offline, zero reservations, null embed
tokens, snapshot re-persisted); §7.7 delete semantics on real rows; export
ordering; snapshotless origin refused. Typecheck/lint/build green. Zero paid
calls; zero production writes.
