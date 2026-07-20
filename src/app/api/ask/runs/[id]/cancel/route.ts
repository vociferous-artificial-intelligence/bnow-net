import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { requireAcceptedUser } from "@/lib/gate";

// Phase 2 cancel STUB (contract §1.3): ownership-gated; records an idempotent
// cancel_requested marker event. Phase 3 wires real semantics (orchestrator
// checks between stages + provider AbortSignal + settlement). The marker uses a
// dedicated high seq range (1e6 + max) so it can NEVER collide with the
// orchestrating invocation's in-process counter (single-writer rule preserved
// for the 1..N range); ON CONFLICT DO NOTHING makes a double-cancel idempotent.

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCEL_SEQ_BASE = 1_000_000;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAcceptedUser();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`SELECT user_email FROM ask_runs WHERE id = $1`, [id]);
    const owner = (rows[0] as { user_email: string } | undefined)?.user_email ?? null;
    const email = user?.email ?? "anonymous";
    if (owner === null || owner !== email) return new NextResponse(null, { status: 404 });

    await pool.query(
      `INSERT INTO ask_run_events (run_id, seq, type, payload)
       SELECT $1, $2 + coalesce(max(seq) FILTER (WHERE seq >= $2), $2 - 1) - $2 + 1, 'cancel_requested', '{}'::jsonb
       FROM ask_run_events WHERE run_id = $1
       ON CONFLICT (run_id, seq) DO NOTHING`,
      [id, CANCEL_SEQ_BASE],
    );
    // Phase 2 semantics: acknowledged, not yet acted on (the pipeline does not
    // check the marker until Phase 3). Honest response shape.
    return NextResponse.json({ accepted: true, effective: "phase-3" });
  } finally {
    await pool.end();
  }
}
