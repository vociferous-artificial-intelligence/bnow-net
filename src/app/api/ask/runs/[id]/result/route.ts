import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { requireAcceptedUser } from "@/lib/gate";
import { hydrateResultClaims } from "@/lib/ask/hydrate";
import type { AskAnswerV2 } from "@/lib/ask/types";

// Phase 2: the terminal render fetch. After run.completed arrives, the
// progressive client GETs the stored terminal payload PLUS the same cited/
// related source hydration the server action returns — one shared module
// (src/lib/ask/hydrate.ts), so the two render paths cannot drift. Ownership-
// gated, read-only, $0. A run without a stored result (still running, or
// expired) is a 404 — the client only calls this after the terminal event.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAcceptedUser();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let result: AskAnswerV2 | null = null;
  try {
    const { rows } = await pool.query(`SELECT user_email, result FROM ask_runs WHERE id = $1`, [id]);
    const row = rows[0] as { user_email: string; result: AskAnswerV2 | null } | undefined;
    const email = user?.email ?? "anonymous";
    if (!row || row.user_email !== email) return new NextResponse(null, { status: 404 });
    result = row.result;
  } finally {
    await pool.end();
  }
  if (!result) return new NextResponse(null, { status: 404 });

  const { cited, related } = await hydrateResultClaims(result);
  return NextResponse.json({ result, cited, related });
}
