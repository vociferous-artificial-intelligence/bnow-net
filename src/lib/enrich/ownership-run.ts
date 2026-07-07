import { Pool } from "@neondatabase/serverless";
import { persistableLinks, resolveLinks } from "./ownership";

// Backfill entity_links for company/person entities that have none yet.
// Idempotent/resumable: only touches entities without outgoing links (unless refresh).

export interface OwnershipStats {
  scanned: number;
  resolved: number;
  linksCreated: number;
  failed: number;
  live: boolean;
}

export async function enrichOwnership(opts?: {
  limit?: number;
  refresh?: boolean;
}): Promise<OwnershipStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { ownershipLive } = await import("./ownership");
  const stats: OwnershipStats = {
    scanned: 0, resolved: 0, linksCreated: 0, failed: 0, live: ownershipLive(),
  };
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.kind, e.name FROM entities e
       WHERE e.kind IN ('company','person','org')
         ${opts?.refresh ? "" : "AND NOT EXISTS (SELECT 1 FROM entity_links l WHERE l.from_entity_id = e.id)"}
       ORDER BY e.id
       LIMIT $1`,
      [opts?.limit ?? 100],
    );
    stats.scanned = rows.length;

    for (const e of rows) {
      const resolved = await resolveLinks(e.name, e.kind);
      if (resolved === null) {
        stats.failed++;
        continue;
      }
      stats.resolved++;
      // stub edges are demo data — never written to the graph
      const links = persistableLinks(resolved);
      for (const link of links) {
        // get-or-create the counterpart entity
        const to = await pool.query(
          `INSERT INTO entities (kind, name) VALUES ($1, $2)
           ON CONFLICT (kind, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [link.toKind, link.toName.slice(0, 200)],
        );
        const toId = to.rows[0].id;
        if (toId === e.id) continue; // no self-loops
        const ins = await pool.query(
          `INSERT INTO entity_links (from_entity_id, to_entity_id, relation, source, since)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (from_entity_id, to_entity_id, relation, source) DO NOTHING
           RETURNING id`,
          [e.id, toId, link.relation, link.source, link.since],
        );
        if (ins.rows.length > 0) stats.linksCreated++;
      }
    }
    return stats;
  } finally {
    await pool.end();
  }
}
