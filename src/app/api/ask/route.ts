import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/ask/answer";
import { requireUser } from "@/lib/gate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await requireUser(); // gated: interrogation is a subscriber tool
  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = (body.question ?? "").trim().slice(0, 400);
  if (question.length < 3) {
    return NextResponse.json({ error: "question too short" }, { status: 400 });
  }
  const result = await ask(question);
  return NextResponse.json(result);
}
