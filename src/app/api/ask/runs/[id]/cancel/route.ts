import { NextRequest, NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { requireAcceptedUser } from "@/lib/gate";
import { CANCEL_SEQ_BASE } from "@/lib/ask/events";

// Phase 3 cancel (contract §1.3): ownership-gated; records ONE idempotent
// cancel_requested marker event that the orchestrator's watchCancelMarker
// polls (aborting generation mid-stream; settlement is exactly-once server-
// side). The marker uses a dedicated high seq (CANCEL_SEQ_BASE) so it can
// NEVER collide with the orchestrating invocation's in-process counter
// (single-writer rule preserved for the 1..N range). Idempotency is real:
// the guarded INSERT writes at most one marker per run — a repeated Stop
// click inserts nothing (supplementary Gate 2 fix; multiple markers also
// widened the tail-poisoning batch in the events route).

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
       SELECT $1, $2, 'cancel_requested', '{}'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM ask_run_events WHERE run_id = $1 AND seq >= $2)
       ON CONFLICT (run_id, seq) DO NOTHING`,
      [id, CANCEL_SEQ_BASE],
    );
    // Acknowledged; the orchestrator's marker watch acts on it (2s poll).
    return NextResponse.json({ accepted: true, effective: "phase-3" });
  } finally {
    await pool.end();
  }
}
