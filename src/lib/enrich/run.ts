import { Pool } from "@neondatabase/serverless";
import { matchEntity } from "./opensanctions";

// Enrich entities lacking an OpenSanctions check. Idempotent + resumable: only
// touches rows whose meta->>'opensanctions' is null (or ?refresh re-checks all).
// Runs from Vercel (api.opensanctions.org is reachable there; not from the build host).

export interface EnrichStats {
  scanned: number;
  checked: number;
  matched: number;
  sanctioned: number;
  failed: number;
}

export async function enrichEntities(opts?: {
  limit?: number;
  refresh?: boolean;
  nowIso: string;
}): Promise<EnrichStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const stats: EnrichStats = { scanned: 0, checked: 0, matched: 0, sanctioned: 0, failed: 0 };
  try {
    const { rows } = await pool.query(
      `SELECT id, kind, name FROM entities
       WHERE kind IN ('person','company','org','agency','faction')
         ${opts?.refresh ? "" : "AND (meta->'opensanctions') IS NULL"}
       ORDER BY id
       LIMIT $1`,
      [opts?.limit ?? 200],
    );
    stats.scanned = rows.length;

    for (const e of rows) {
      const r = await matchEntity(e.name, e.kind);
      if (r === null) {
        stats.failed++;
        continue;
      }
      r.checkedAt = opts?.nowIso ?? "";
      await pool.query(
        `UPDATE entities SET meta = jsonb_set(coalesce(meta,'{}'::jsonb), '{opensanctions}', $2::jsonb)
         WHERE id = $1`,
        [e.id, JSON.stringify(r)],
      );
      stats.checked++;
      if (r.matched) stats.matched++;
      if (r.sanctioned) stats.sanctioned++;
    }
    return stats;
  } finally {
    await pool.end();
  }
}
