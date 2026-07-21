import { NextRequest, NextResponse } from "next/server";
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

      const sink = new PgRunEventSink(runId, (e: AskRunEvent) => send(encodeSseEvent(e)));
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
          // resubmission). Fallback: deliver the terminal on the wire without
          // an id — the live client renders it and clears its resume ref;
          // replay durability comes from the finalized run row (/result), with
          // the event-log gap bounded to this one failure.
          const type = result.provider === "cancelled" ? "run.cancelled" : "run.completed";
          try {
            if (type === "run.cancelled") {
              // One terminal per run — never run.cancelled AND run.completed.
              await sink.emit("run.cancelled", {});
            } else {
              await sink.emit("run.completed", { result });
            }
          } catch (e) {
            console.warn(
              `ask runs route: terminal persist failed — delivering unpersisted terminal: ${e instanceof Error ? e.message : e}`,
            );
            send(
              `event: ${type}\ndata: ${type === "run.cancelled" ? "{}" : JSON.stringify({ result })}\n\n`,
            );
          }
        }
      } finally {
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
