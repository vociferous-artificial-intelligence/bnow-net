import { NextRequest, NextResponse } from "next/server";
import { askWithLimits } from "@/lib/ask/limits";
import { requireUser } from "@/lib/gate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser(); // gated: interrogation is a subscriber tool
  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = (body.question ?? "").trim().slice(0, 400);
  if (question.length < 3) {
    return NextResponse.json({ error: "question too short" }, { status: 400 });
  }
  const result = await askWithLimits(question, user?.email ?? null);
  return NextResponse.json(result, { status: result.provider === "limit" ? 429 : 200 });
}
