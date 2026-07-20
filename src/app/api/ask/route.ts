import { NextRequest, NextResponse } from "next/server";
import { askWithLimits, recordEntryTimings } from "@/lib/ask/limits";
import { clampMs, monotonicMs } from "@/lib/ask/timings";
import { requireAcceptedUser } from "@/lib/gate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireAcceptedUser(); // gated: subscriber tool, requires current acceptance
  // Phase 0 measurement: this route owns the run's apiTotalMs (its wrapper scope).
  // There is no post-answer source hydration here, so hydrateMs/totalMs stay
  // absent on API rows — the action's keys and this one never conflate.
  const t0 = monotonicMs();
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    idempotencyKey?: string;
  };
  const question = (body.question ?? "").trim().slice(0, 400);
  if (question.length < 3) {
    return NextResponse.json({ error: "question too short" }, { status: 400 });
  }
  // Phase 1: optional client idempotency key (same validation as the form). An
  // API caller that omits it keeps today's replay-unsafe-but-unchanged behavior.
  const rawKey = String(body.idempotencyKey ?? "");
  const idempotencyKey = /^[A-Za-z0-9_-]{8,128}$/.test(rawKey) ? rawKey : undefined;
  const result = await askWithLimits(question, user?.email ?? null, { idempotencyKey });
  if (result.runId) {
    await recordEntryTimings(result.runId, {
      apiTotalMs: clampMs(monotonicMs() - t0),
    });
  }
  return NextResponse.json(result, { status: result.provider === "limit" ? 429 : 200 });
}
