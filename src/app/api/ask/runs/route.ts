import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { requireAcceptedUser } from "@/lib/gate";
import { askWithLimits } from "@/lib/ask/limits";
import { progressiveAllowedFor } from "@/lib/ask/features";
import {
  encodeSseEvent,
  PgRunEventSink,
  type AskRunEvent,
} from "@/lib/ask/events";

// Phase 2 progressive submission (contract:
// docs/designs/ASK-RUN-EVENTS-TRANSPORT-2026-07-19.md §1.1). This is a PAID
// entry — the same money path as the server action (askWithLimits: gates,
// idempotency, reservations, logging all identical); only the response shape
// differs: an SSE stream of persist-then-emit run events, terminating with
// run.completed carrying the same payload the action would have returned.
//
// The free-GET /ask contract is untouched: this is an explicit authenticated
// POST. A replayed idempotency key returns its stored result as an immediate
// terminal event with zero provider calls (the replay's event log lives under
// the NEW request's run id, which has no run row — its GET replay is never
// needed because the terminal event already arrived).

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function POST(req: NextRequest) {
  const user = await requireAcceptedUser();
  // Release hardening: the progressive transport is gated AT THE BOUNDARY by
  // the same server-side resolver + cohort policy page.tsx renders from. A
  // hand-crafted POST while the feature stack is off (or from outside the
  // cohort) is refused BEFORE any money path — the route behaves as absent.
  // The read-only events/result GETs stay ungated by feature flags so a
  // rollback never orphans already-created (possibly billed) runs.
  if (!progressiveAllowedFor(user?.email ?? null)) {
    return new NextResponse(null, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    idempotencyKey?: string;
  };
  const question = (body.question ?? "").trim().slice(0, 400);
  if (question.length < 3) {
    return NextResponse.json({ error: "question too short" }, { status: 400 });
  }
  const rawKey = String(body.idempotencyKey ?? "");
  const idempotencyKey = /^[A-Za-z0-9_-]{8,128}$/.test(rawKey) ? rawKey : undefined;

  const runId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client gone: keep orchestrating — events persist, the client
          // reconnects via the replay route. Never abort a paid run because
          // the socket dropped (the money already moved or will settle).
        }
      };
      // Transport-level run reference (NOT a persisted run event): the client
      // needs the run id + its own last seq to reconnect. Heartbeat-class data.
      send(`event: run.ref\ndata: ${JSON.stringify({ runId })}\n\n`);

      // ONE request-scoped Pool for every event this invocation persists
      // (release hardening — previously a Pool per event); ended in finally.
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const sink = new PgRunEventSink(runId, pool, (e: AskRunEvent) => send(encodeSseEvent(e)));
      try {
        let result: Awaited<ReturnType<typeof askWithLimits>> | null = null;
        try {
          result = await askWithLimits(question, user?.email ?? null, {
            idempotencyKey,
            sink,
            runId,
          });
        } catch (e) {
          // askWithLimits is designed not to throw; this is the belt-and-braces
          // terminal so a stream never just hangs. No message text (error class only).
          console.warn(`ask runs route: unexpected throw: ${e instanceof Error ? e.message : e}`);
          try {
            await sink.emit("run.failed", { errorClass: "route_throw" });
          } catch {
            send(`event: run.failed\ndata: {"errorClass":"route_throw"}\n\n`);
          }
        }
        if (result !== null) {
          // The pipeline finished (billed and, under enforce, finalized on the
          // run row). A terminal-emit persist failure must NEVER rewrite that
          // success as run.failed (supplementary Gate 2 finding: the paid
          // answer became unreachable and the failure copy invited a re-billed
          // resubmission).
          //
          // Durability coherence (release hardening): the persisted event log
          // may claim completion ONLY when the run row durably finalized
          // (result.durable !== false — undefined means no durability verdict
          // was in play, e.g. a replayed stored result). When the row did NOT
          // finalize, persisting run.completed would contradict the row the
          // expiry sweep will mark expired; the terminal goes wire-only and
          // the payload's durable:false tells the client not to claim replay
          // durability. A persistABLE terminal gets a bounded persist retry
          // (a DB write only — the provider is never rerun). Each retry is a
          // fresh emit and therefore a fresh seq; a failed attempt leaves a
          // seq gap, which every reader tolerates (ordering is by seq, never
          // contiguity — the client reducer tracks max seq).
          const type = result.provider === "cancelled" ? "run.cancelled" : "run.completed";
          let persisted = false;
          if (result.durable !== false) {
            for (let attempt = 0; attempt < 3 && !persisted; attempt++) {
              try {
                if (type === "run.cancelled") {
                  // One terminal per run — never run.cancelled AND run.completed.
                  await sink.emit("run.cancelled", {});
                } else {
                  await sink.emit("run.completed", { result });
                }
                persisted = true;
              } catch (e) {
                if (attempt < 2) {
                  await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
                } else {
                  console.warn(
                    `ask runs route: terminal persist failed after 3 attempts — delivering unpersisted terminal: ${e instanceof Error ? e.message : e}`,
                  );
                }
              }
            }
          }
          if (!persisted) {
            // Wire-only terminal: the live client renders the billed answer
            // and clears its resume ref; durable:false (when set) keeps the
            // client from depending on /result or event replay for this run.
            send(
              `event: ${type}\ndata: ${type === "run.cancelled" ? "{}" : JSON.stringify({ result })}\n\n`,
            );
          }
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
