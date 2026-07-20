// AI Search Phase 2: the progressive client's run state machine + transport
// driver. Framework-free (no React) so the reducer and SSE parsing are plain
// unit-testable functions; ask-form.tsx wires it to state. Contract:
// docs/designs/ASK-RUN-EVENTS-TRANSPORT-2026-07-19.md.
//
// Money rules encoded here: exactly ONE paid POST per submit gesture; every
// reconnect is the read-only GET replay (never a second POST); a mid-run
// refresh resumes from sessionStorage (runId + lastSeq) with zero new paid
// calls. Progress display derives ONLY from server events.

import type { AskAnswerV2 } from "./types";
import type { AskRunEventPayloads, SnapshotClaim } from "./events";

export type RunPhase =
  | "starting"
  | "retrieving"
  | "selecting"
  | "answering"
  | "done"
  | "failed";

export interface RunViewState {
  phase: RunPhase;
  runId: string | null;
  lastSeq: number;
  /** provisional keyword-pass candidates (server event, never inferred) */
  candidates: { claims: SnapshotClaim[]; totalMatching: number } | null;
  retrieval: AskRunEventPayloads["retrieval.completed"] | null;
  selectedCount: number | null;
  /** Phase 3: VALIDATED released answer sections, in release order, keyed by
   *  event seq so duplicate/replayed delivery is idempotent (G2S fix). The
   *  terminal payload replaces them (structural reconciliation). */
  sections: Array<AskRunEventPayloads["answer.section"] & { seq: number }>;
  result: AskAnswerV2 | null;
  errorClass: string | null;
}

export function initialRunViewState(): RunViewState {
  return {
    phase: "starting",
    runId: null,
    lastSeq: 0,
    candidates: null,
    retrieval: null,
    selectedCount: null,
    sections: [],
    result: null,
    errorClass: null,
  };
}

export interface SseRecord {
  id: number | null;
  event: string;
  data: string;
}

/** Phase ordering for monotonic advancement (Gate 2 inline finding): the
 *  lexical-partial emit is deliberately not awaited server-side, so its SSE
 *  forward can arrive AFTER retrieval.completed; replay can also re-deliver
 *  already-applied events. Phases therefore only move FORWARD, and the terminal
 *  states are absorbing — a late/duplicate event can never regress the UI. */
const PHASE_RANK: Record<RunPhase, number> = {
  starting: 0,
  retrieving: 1,
  selecting: 2,
  answering: 3,
  done: 4,
  failed: 4,
};

function advancePhase(current: RunPhase, proposed: RunPhase): RunPhase {
  return PHASE_RANK[proposed] >= PHASE_RANK[current] ? proposed : current;
}

/** Pure reducer: fold one server event into the view state. Unknown event
 *  types advance lastSeq only (forward compatibility); phase transitions are
 *  monotonic and terminal states absorbing (see PHASE_RANK). */
export function applyRunEvent(
  state: RunViewState,
  record: SseRecord,
): RunViewState {
  const next: RunViewState = { ...state };
  if (record.id !== null && record.id < 1_000_000) next.lastSeq = Math.max(next.lastSeq, record.id);
  // Terminal states are absorbing: only the seq may advance afterwards.
  if (state.phase === "done" || state.phase === "failed") return next;
  let payload: unknown = {};
  try {
    payload = record.data ? JSON.parse(record.data) : {};
  } catch {
    return next; // malformed data: ignore the record, keep the seq advance
  }
  switch (record.event) {
    case "run.ref": {
      const p = payload as { runId?: string };
      if (typeof p.runId === "string") next.runId = p.runId;
      return next;
    }
    case "run.created":
    case "run.authorized":
      next.phase = advancePhase(next.phase, "starting");
      return next;
    case "retrieval.lexical_partial": {
      const p = payload as AskRunEventPayloads["retrieval.lexical_partial"];
      next.phase = advancePhase(next.phase, "retrieving");
      // The candidate DATA still lands even when the phase is already past
      // retrieving (late delivery) — the panel may render it; the stage line
      // never moves backwards.
      next.candidates = { claims: p.claims ?? [], totalMatching: p.totalMatching ?? 0 };
      return next;
    }
    case "retrieval.completed":
      next.phase = advancePhase(next.phase, "selecting");
      next.retrieval = payload as AskRunEventPayloads["retrieval.completed"];
      return next;
    case "rerank.completed": {
      const p = payload as AskRunEventPayloads["rerank.completed"];
      next.selectedCount = p.selectedClaimIds?.length ?? null;
      next.phase = advancePhase(next.phase, "answering");
      return next;
    }
    case "rerank.skipped":
      next.phase = advancePhase(next.phase, "answering");
      return next;
    case "answer.started":
      next.phase = advancePhase(next.phase, "answering");
      return next;
    case "answer.section": {
      const p = payload as AskRunEventPayloads["answer.section"];
      next.phase = advancePhase(next.phase, "answering");
      // Section identity = the persisted event seq (the SSE record id). Every
      // persisted event carries one; a record WITHOUT a valid id is
      // contract-violating transport data, and prose with no replay identity
      // cannot be deduplicated — so its text is dropped fail-safe (the phase
      // advance above is still a server fact, and terminal reconciliation
      // renders the full validated answer regardless). Never a shared
      // sentinel id: that would silently collapse distinct id-less sections.
      const seq = record.id;
      if (
        seq !== null &&
        Number.isFinite(seq) &&
        typeof p.text === "string" &&
        p.text !== "" &&
        !next.sections.some((sec) => sec.seq === seq)
      ) {
        next.sections = [...next.sections, { ...p, seq }];
      }
      return next;
    }
    case "answer.validating":
      next.phase = advancePhase(next.phase, "answering");
      return next;
    case "run.cancelled":
      next.phase = "failed";
      next.errorClass = "cancelled";
      return next;
    case "run.completed": {
      const p = payload as AskRunEventPayloads["run.completed"];
      next.phase = "done";
      next.result = p.result ?? null;
      return next;
    }
    case "run.failed": {
      const p = payload as AskRunEventPayloads["run.failed"];
      next.phase = "failed";
      next.errorClass = p.errorClass ?? "unknown";
      return next;
    }
    default:
      return next;
  }
}

/** Incremental SSE parser: feed raw text chunks, get complete records. Returns
 *  the unconsumed buffer remainder. Handles multi-line records and ignores
 *  comment lines (heartbeats). */
export function parseSseChunk(
  buffer: string,
  onRecord: (record: SseRecord) => void,
): string {
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";
  for (const block of blocks) {
    let id: number | null = null;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // heartbeat/comment
      if (line.startsWith("id: ")) {
        const n = Number(line.slice(4));
        if (Number.isFinite(n)) id = n;
      } else if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      }
    }
    if (event !== "message" || dataLines.length > 0) {
      onRecord({ id, event, data: dataLines.join("\n") });
    }
  }
  return remainder;
}

// ---- sessionStorage resume (per tab) --------------------------------------------

const ACTIVE_RUN_KEY = "bnow_ask_active_run";

export interface ActiveRunRef {
  runId: string;
  lastSeq: number;
  question: string;
}

export function storeActiveRun(ref: ActiveRunRef): void {
  try {
    window.sessionStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(ref));
  } catch {}
}

export function readActiveRun(): ActiveRunRef | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRunRef;
    if (typeof parsed.runId !== "string" || typeof parsed.question !== "string") return null;
    return { runId: parsed.runId, lastSeq: Number(parsed.lastSeq) || 0, question: parsed.question };
  } catch {
    return null;
  }
}

export function clearActiveRun(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_RUN_KEY);
  } catch {}
}

// ---- transport drivers ----------------------------------------------------------

export interface DriveOpts {
  onState: (state: RunViewState) => void;
  fetchImpl?: typeof fetch;
  /** reconnect attempts after a dropped stream before giving up (default 5) */
  maxReconnects?: number;
  /** base backoff between reconnect attempts in ms (default 1000; the delay is
   *  base × (attempt + 1)). Injectable so tests do not wait wall-clock. */
  backoffMs?: number;
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  state: RunViewState,
  onState: (s: RunViewState) => void,
  question: string,
): Promise<RunViewState> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let current = state;
  // A rejected read (network reset, VPN drop, ERR_NETWORK_CHANGED) is a stream
  // DROP, not a crash: return the state so far and let the caller's read-only
  // resume path take over (G2S high finding: this was previously an unhandled
  // rejection that wedged the UI with runningRef stuck true).
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, (record) => {
        current = applyRunEvent(current, record);
        if (current.runId && current.phase !== "done" && current.phase !== "failed") {
          storeActiveRun({ runId: current.runId, lastSeq: current.lastSeq, question });
        }
        onState(current);
      });
    }
  } catch {
    return current; // dropped mid-read — resume handles the rest
  }
  return current;
}

/** Read-only reconnect loop: GET replay from lastSeq until terminal or the
 *  attempt budget runs out. NEVER issues a POST (never re-bills). */
export async function resumeRun(
  ref: ActiveRunRef,
  opts: DriveOpts,
  seed?: RunViewState,
): Promise<RunViewState> {
  const f = opts.fetchImpl ?? fetch;
  const max = opts.maxReconnects ?? 5;
  const backoff = opts.backoffMs ?? 1000;
  // Mount-resume (no seed): replay from 0 so the WHOLE panel rebuilds —
  // candidates, counts, sections, true phase (G2S finding: replaying only
  // seq > stored lastSeq rendered 'Starting' over a half-finished run). The
  // reducer is idempotent (monotonic phases, seq-deduped sections), so a full
  // replay is safe and $0. Live-consumer continuations (seed given) keep
  // replaying incrementally from lastSeq.
  let state: RunViewState =
    seed ?? { ...initialRunViewState(), runId: ref.runId, lastSeq: 0 };
  // Seed state is pushed IMMEDIATELY so the UI disables + shows the panel
  // before the first network byte (G2S finding: the resume window rendered an
  // enabled-looking idle form that silently swallowed gestures).
  opts.onState(state);
  let consecutive404 = 0;
  for (let attempt = 0; attempt < max; attempt++) {
    let res: Response;
    try {
      res = await f(`/api/ask/runs/${ref.runId}/events?after=${state.lastSeq}`, {
        headers: { Accept: "text/event-stream" },
      });
    } catch {
      await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
      continue;
    }
    if (res.status === 404) {
      // A 404 is terminal only when it REPEATS: the POST route announces
      // run.ref before askWithLimits commits the ask_runs row, so a drop/
      // refresh inside that creation window sees a 404 for a run that is
      // billing and executing — clearing the ref on the first one orphans it
      // (supplementary Gate 2 finding). A second consecutive 404 after
      // backoff is a genuine ownership/unknown run.
      consecutive404++;
      if (consecutive404 >= 2) {
        state = { ...state, phase: "failed", errorClass: `reconnect_${res.status}` };
        opts.onState(state);
        clearActiveRun();
        return state;
      }
      await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
      continue;
    }
    consecutive404 = 0;
    if (!res.ok || !res.body) {
      // Transient 5xx/4xx-other (or a bodiless response): retry within the
      // budget (G2S finding: a single 502 previously destroyed the resume ref
      // and orphaned the paid run).
      await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
      continue;
    }
    state = await consumeStream(res.body, state, opts.onState, ref.question);
    if (state.phase === "done" || state.phase === "failed") {
      clearActiveRun();
      return state;
    }
    // stream cut off before terminal (route duration): reconnect with lastSeq
  }
  // Reconnect budget exhausted. The run may STILL be executing (and billed)
  // server-side — clearing the resume ref here would orphan it: the next
  // refresh would show an idle form inviting a second paid gesture. Policy:
  // KEEP the ref (a refresh retries the $0 read-only resume; terminal replay
  // or a genuine 404 clears it) and fail the view honestly.
  state = { ...state, phase: "failed", errorClass: "reconnect_exhausted" };
  opts.onState(state);
  return state;
}

/** One submit gesture: exactly one paid POST; dropped streams resume via the
 *  read-only GET loop. */
export async function runProgressiveAsk(
  question: string,
  idempotencyKey: string,
  opts: DriveOpts,
): Promise<RunViewState> {
  const f = opts.fetchImpl ?? fetch;
  let state = initialRunViewState();
  opts.onState(state);
  let res: Response;
  try {
    res = await f("/api/ask/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question, idempotencyKey }),
    });
  } catch {
    state = { ...state, phase: "failed", errorClass: "submit_network" };
    opts.onState(state);
    return state;
  }
  if (!res.ok || !res.body) {
    state = { ...state, phase: "failed", errorClass: `submit_${res.status}` };
    opts.onState(state);
    return state;
  }
  state = await consumeStream(res.body, state, opts.onState, question);
  if (state.phase === "done" || state.phase === "failed") {
    clearActiveRun();
    return state;
  }
  // The POST stream ended without a terminal event (drop/cutoff). Resume
  // READ-ONLY — the run keeps executing server-side; never POST again.
  if (state.runId) {
    return resumeRun({ runId: state.runId, lastSeq: state.lastSeq, question }, opts, state);
  }
  state = { ...state, phase: "failed", errorClass: "stream_lost_before_ref" };
  opts.onState(state);
  return state;
}
