import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { requireAcceptedUser } from "@/lib/gate";
import {
  CANCEL_SEQ_BASE,
  encodeSseEvent,
  readRunEvents,
  SSE_HEARTBEAT,
  TERMINAL_EVENT_TYPES,
} from "@/lib/ask/events";

// Phase 2 reconnect/replay (contract §1.2): OWNERSHIP-gated, read-only. Replays
// persisted events with seq > ?after in order, then — while the run is
// non-terminal — tails Postgres with bounded polling and SSE heartbeats until a
// terminal event or the route cutoff; the client reconnects with its last seq.
// ZERO provider calls, zero orchestration, no process-local fanout: this
// invocation only ever reads. Ownership failures and unknown runs are 404
// (never 403 — do not confirm a foreign run id exists).

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const POLL_MS = 500;
const HEARTBEAT_EVERY_MS = 15_000;
/** Leave margin under maxDuration so we close cleanly, not by platform kill. */
const TAIL_CUTOFF_MS = 50_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

async function runOwner(pool: Pool, runId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT user_email FROM ask_runs WHERE id = $1`, [runId]);
  return (rows[0] as { user_email: string } | undefined)?.user_email ?? null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAcceptedUser();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 });

  // ONE request-scoped Pool for the ownership check AND every tail poll
  // (release hardening — previously a fresh Pool per 500ms poll). Ended in
  // the stream's finally on terminal, client disconnect, and route cutoff.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let owner: string | null;
  try {
    owner = await runOwner(pool, id);
  } catch (e) {
    await pool.end().catch(() => {});
    throw e;
  }
  const email = user?.email ?? "anonymous";
  if (owner === null || owner !== email) {
    await pool.end().catch(() => {});
    return new NextResponse(null, { status: 404 });
  }

  const afterRaw = Number(req.nextUrl.searchParams.get("after") ?? "0");
  const after = Number.isFinite(afterRaw) && afterRaw > 0 ? Math.trunc(afterRaw) : 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {}
      };
      // The poll cursor advances ONLY through the orchestrator's 1..N seq range.
      // Cancel markers live at seq >= CANCEL_SEQ_BASE (a second writer): letting
      // one advance the cursor blinds every later poll to the orchestrator's
      // events — including the terminal (supplementary Gate 2 finding, executed
      // probe). Markers are forwarded once, tracked separately.
      let lastSeq = after;
      const forwardedMarkers = new Set<number>();
      let sawTerminal = false;
      const started = Date.now();
      let lastBeat = started;
      try {
        for (;;) {
          const events = await readRunEvents(id, lastSeq, pool);
          for (const e of events) {
            if (e.seq >= CANCEL_SEQ_BASE) {
              if (forwardedMarkers.has(e.seq)) continue;
              forwardedMarkers.add(e.seq);
              send(encodeSseEvent(e));
              continue; // never advances the poll cursor
            }
            send(encodeSseEvent(e));
            lastSeq = e.seq;
            if (TERMINAL_EVENT_TYPES.has(e.type)) sawTerminal = true;
          }
          if (sawTerminal) break;
          // The socket is gone: stop polling Postgres on its behalf (the run
          // keeps executing; the client reconnects read-only).
          if (req.signal?.aborted) break;
          if (Date.now() - started > TAIL_CUTOFF_MS) break; // client reconnects with lastSeq
          if (Date.now() - lastBeat >= HEARTBEAT_EVERY_MS) {
            send(SSE_HEARTBEAT);
            lastBeat = Date.now();
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } finally {
        try {
          await pool.end();
        } catch {}
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
