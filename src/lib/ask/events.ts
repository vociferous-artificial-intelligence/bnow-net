// AI Search Phase 2: the typed run-event union, its payload ALLOWLIST, the
// EvidenceSnapshot shape, and the Postgres-backed persist-then-emit sink.
// Contract: docs/designs/ASK-RUN-EVENTS-TRANSPORT-2026-07-19.md §2/§3 — payload
// keys are closed per event type (unit-tested); no chain-of-thought, no
// provider/model names, no prose beyond claim text /search already serves the
// same accepted user.

import { Pool } from "@neondatabase/serverless";
import type { AskAnswerV2, RetrievalMode, TimeWindow } from "./types";

// ---- EvidenceSnapshot (frozen contract §3; F11-safe) ----------------------------

export interface SnapshotClaim {
  /** display/dedupe hint — UNSTABLE across digest regeneration */
  claimId: number;
  /** claim content — the F11 requirement (ids alone dangle after regeneration) */
  text: string;
  hedging: string;
  claimDate: string | null;
  countryIso2: string;
  track: string | null;
  confidence: number | null;
  /** STABLE raw_documents ids */
  sourceDocIds: number[];
}

export interface EvidenceSnapshot {
  version: 1;
  retrievalMode: RetrievalMode;
  window: TimeWindow | null;
  totalMatching: number;
  candidatesCount: number;
  corpusCurrentThrough: string | null;
  /** capped at ASK_CANDIDATES, composite order */
  candidates: SnapshotClaim[];
  /** post-rerank order; ids resolve within THIS snapshot */
  selectedClaimIds: number[];
  relevantCount?: number;
}

// ---- event union ----------------------------------------------------------------

/** Claims shown in the lexical partial — the provisional candidate preview. */
export const LEXICAL_PARTIAL_MAX = 12;

export interface AskRunEventPayloads {
  "run.created": Record<string, never>;
  "run.authorized": Record<string, never>;
  "retrieval.lexical_partial": { claims: SnapshotClaim[]; totalMatching: number };
  "retrieval.completed": {
    candidatesCount: number;
    totalMatching: number;
    uniqueSources: number;
    mode: RetrievalMode;
    window: TimeWindow | null;
    currentThrough: string | null;
  };
  "rerank.completed": { selectedClaimIds: number[]; relevantCount?: number };
  "rerank.skipped": { reasonClass: "pool_fits" | "offline" | "fallback" };
  "answer.started": Record<string, never>;
  /** Phase 3 Increment B: one VALIDATED released section — complete sentences
   *  whose citations resolved and whose named-person fidelity passed (or was
   *  deterministically replaced) BEFORE release. Never a raw token delta. */
  "answer.section": { text: string; citedClaimIds: number[] };
  /** Phase 3: the terminal validation pass is running (the client shows
   *  "checking citations"; the final payload may replace streamed text). */
  "answer.validating": Record<string, never>;
  "run.completed": { result: AskAnswerV2 };
  "run.failed": { errorClass: string };
  /** Phase 3: the run was cancelled (Stop / cancel marker). Terminal; billed
   *  usage settled exactly once before this fires. */
  "run.cancelled": Record<string, never>;
  cancel_requested: Record<string, never>;
}

export type AskRunEventType = keyof AskRunEventPayloads;

export interface AskRunEvent<T extends AskRunEventType = AskRunEventType> {
  seq: number;
  type: T;
  at: string;
  payload: AskRunEventPayloads[T];
}

/** The closed payload-key allowlist per event type — the §2 rule made testable.
 *  A key not listed here must never appear in a persisted payload. */
export const EVENT_PAYLOAD_ALLOWLIST: { [T in AskRunEventType]: ReadonlyArray<string> } = {
  "run.created": [],
  "run.authorized": [],
  "retrieval.lexical_partial": ["claims", "totalMatching"],
  "retrieval.completed": [
    "candidatesCount",
    "totalMatching",
    "uniqueSources",
    "mode",
    "window",
    "currentThrough",
  ],
  "rerank.completed": ["selectedClaimIds", "relevantCount"],
  "rerank.skipped": ["reasonClass"],
  "answer.started": [],
  "answer.section": ["text", "citedClaimIds"],
  "answer.validating": [],
  "run.completed": ["result"],
  "run.failed": ["errorClass"],
  "run.cancelled": [],
  cancel_requested: [],
};

export function isAskRunEventType(s: string): s is AskRunEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_PAYLOAD_ALLOWLIST, s);
}

/** Validate a payload's keys against the allowlist (used by the sink in every
 *  mode and directly by tests). Returns the offending keys (empty = clean). */
export function payloadKeyViolations(type: AskRunEventType, payload: object): string[] {
  const allowed = new Set(EVENT_PAYLOAD_ALLOWLIST[type]);
  return Object.keys(payload).filter((k) => !allowed.has(k));
}

// ---- sink (persist-then-emit) ---------------------------------------------------

/** Event sink the orchestrator writes to. `emit` PERSISTS the event before the
 *  transport layer forwards it (contract §1) — a dropped connection never loses
 *  an event, and reconnect is a pure DB replay. */
export interface RunEventSink {
  emit<T extends AskRunEventType>(type: T, payload: AskRunEventPayloads[T]): Promise<void>;
}

/** No-op sink for the non-progressive paths (the server action / eval runner):
 *  ask() stays a thin wrapper over the orchestrator with zero event overhead. */
export const NULL_EVENT_SINK: RunEventSink = {
  async emit() {},
};

/** Postgres-backed sink for one run. seq is assigned in-process — exactly one
 *  orchestrating invocation writes a given run's events (the reconnect route
 *  only reads), so a plain counter is race-free. Persist failures THROW to the
 *  orchestrator, which downgrades the run honestly (an event the client may
 *  never be able to replay must not be silently skipped); the onEmitted hook
 *  lets the SSE encoder forward the row that was just persisted. */
export class PgRunEventSink implements RunEventSink {
  private seq = 0;

  constructor(
    private readonly runId: string,
    private readonly onEmitted?: (event: AskRunEvent) => void | Promise<void>,
  ) {}

  get lastSeq(): number {
    return this.seq;
  }

  async emit<T extends AskRunEventType>(type: T, payload: AskRunEventPayloads[T]): Promise<void> {
    const violations = payloadKeyViolations(type, payload);
    if (violations.length > 0) {
      throw new Error(`ask run event ${type}: payload keys outside the allowlist: ${violations.join(", ")}`);
    }
    const seq = ++this.seq;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `INSERT INTO ask_run_events (run_id, seq, type, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING at::text AS at`,
        [this.runId, seq, type, JSON.stringify(payload)],
      );
      const at = (rows[0] as { at: string }).at;
      await this.onEmitted?.({ seq, type, at, payload });
    } finally {
      await pool.end();
    }
  }
}

/** Read a run's persisted events with seq > after, in order (replay). */
export async function readRunEvents(runId: string, after = 0): Promise<AskRunEvent[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT seq, type, at::text AS at, payload FROM ask_run_events
       WHERE run_id = $1 AND seq > $2 ORDER BY seq`,
      [runId, after],
    );
    return (rows as Array<{ seq: number; type: string; at: string; payload: object }>).map((r) => ({
      seq: r.seq,
      type: r.type as AskRunEventType,
      at: r.at,
      payload: r.payload as never,
    }));
  } finally {
    await pool.end();
  }
}

// ---- snapshot building / persistence --------------------------------------------

import type { CandidateClaim } from "./types";

/** Map a pipeline candidate to the snapshot shape. sourceDocIds default [] —
 *  the lexical partial fires before source metadata exists; the frozen snapshot
 *  fills them from the claim_sources prefetch. */
export function toSnapshotClaim(c: CandidateClaim, sourceDocIds: number[] = []): SnapshotClaim {
  return {
    claimId: c.claimId,
    text: c.text,
    hedging: c.hedging,
    claimDate: c.claimDate,
    countryIso2: c.countryIso2,
    track: c.track,
    confidence: c.confidence,
    sourceDocIds,
  };
}

/** One batched claim_sources read for the candidate set — the "prefetch source
 *  metadata concurrently with rerank" step. Returns claimId -> stable
 *  raw_documents ids. Fail-soft to an empty map (snapshot then carries empty
 *  sourceDocIds; the terminal hydration still resolves sources as today). */
export async function fetchSourceDocIds(claims: CandidateClaim[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (claims.length === 0) return map;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT claim_id, raw_document_id FROM claim_sources WHERE claim_id = ANY($1::int[])`,
      [claims.map((c) => c.claimId)],
    );
    for (const r of rows as Array<{ claim_id: number; raw_document_id: number }>) {
      map.set(r.claim_id, [...(map.get(r.claim_id) ?? []), r.raw_document_id]);
    }
    return map;
  } catch (e) {
    console.warn(`fetchSourceDocIds failed (snapshot carries empty doc ids): ${e instanceof Error ? e.message : e}`);
    return map;
  } finally {
    await pool.end();
  }
}

/** Persist the frozen snapshot onto the run row. Fail-soft: the Phase 2 UI
 *  renders from events; a lost snapshot costs Phase 4 cache/Phase 6 session
 *  reuse for this one run, never the answer (registered behavior). */
export async function persistEvidenceSnapshot(runId: string, snapshot: EvidenceSnapshot): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`UPDATE ask_runs SET evidence_snapshot = $2::jsonb WHERE id = $1`, [
      runId,
      JSON.stringify(snapshot),
    ]);
  } catch (e) {
    console.warn(`persistEvidenceSnapshot failed (non-fatal): ${e instanceof Error ? e.message : e}`);
  } finally {
    await pool.end();
  }
}

/** Terminal event types — the tail loop stops once one is replayed. */
export const TERMINAL_EVENT_TYPES: ReadonlySet<AskRunEventType> = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
]);

/** One SSE record for an event (id = seq so Last-Event-ID semantics work). */
export function encodeSseEvent(e: AskRunEvent): string {
  return `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`;
}

export const SSE_HEARTBEAT = ": hb\n\n";
