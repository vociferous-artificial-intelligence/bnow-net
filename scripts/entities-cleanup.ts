// Entity-graph canonicalization: applies the deterministic rules pass from
// src/lib/entities/canonicalize.ts to the live DB.
//   npx tsx scripts/entities-cleanup.ts           # dry run (prints plan)
//   npx tsx scripts/entities-cleanup.ts --apply   # execute in one transaction
//   npx tsx scripts/entities-cleanup.ts --apply --orphans  # also delete
//       entities with zero claims and zero links (recreated on demand by the
//       digest get-or-create path, so this is always safe)
//   npx tsx scripts/entities-cleanup.ts --file reviewed.jsonl [--apply]
//       apply a REVIEWED LLM proposal file (from /api/cron/entity-audit) instead
//       of the rules plan; one {action:'delete'|'merge',id,intoId?,reason} per line
// Merges repoint claim_entities + entity_links to the canonical entity and add
// the merged name to its aliases. Drops remove claim_entities links first
// (claims themselves are untouched — they just lose the junk tag).
import { readFileSync } from "node:fs";
import "./env";
import { Pool } from "@neondatabase/serverless";
import { planCleanup, type CleanupPlan, type EntityRow } from "../src/lib/entities/canonicalize";

const APPLY = process.argv.includes("--apply");
const ORPHANS = process.argv.includes("--orphans");
const fileIdx = process.argv.indexOf("--file");
const FILE = fileIdx > -1 ? process.argv[fileIdx + 1] : null;

function planFromFile(path: string, rows: EntityRow[]): CleanupPlan {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const plan: CleanupPlan = { drops: [], merges: [] };
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const p = JSON.parse(line) as { action: string; id: number; intoId?: number; reason?: string };
    const e = byId.get(p.id);
    if (!e) {
      console.warn(`skip: entity ${p.id} not found`);
      continue;
    }
    if (p.action === "delete") {
      plan.drops.push({ id: p.id, name: e.name, reason: p.reason ?? "reviewed llm proposal" });
    } else if (p.action === "merge" && p.intoId && byId.has(p.intoId)) {
      plan.merges.push({
        fromId: p.id, fromName: e.name,
        intoId: p.intoId, intoName: byId.get(p.intoId)!.name,
        reason: p.reason ?? "reviewed llm proposal",
      });
    }
  }
  return plan;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT e.id, e.kind, e.name, count(ce.claim_id)::int AS claims
       FROM entities e LEFT JOIN claim_entities ce ON ce.entity_id = e.id
       GROUP BY e.id ORDER BY e.id`,
    );
    const plan = FILE ? planFromFile(FILE, rows as EntityRow[]) : planCleanup(rows as EntityRow[]);

    console.log(`entities: ${rows.length}`);
    console.log(`\nDROPS (${plan.drops.length}):`);
    for (const d of plan.drops) console.log(`  ${d.id} "${d.name}" — ${d.reason}`);
    console.log(`\nMERGES (${plan.merges.length}):`);
    for (const m of plan.merges)
      console.log(`  ${m.fromId} "${m.fromName}" -> ${m.intoId} "${m.intoName}" (${m.reason})`);

    // Affected-count summary (Workstream E requirement: the operator reviews
    // entity AND claim-edge impact before authorizing --apply). Repointed edges
    // are an upper bound: ON CONFLICT DO NOTHING collapses (claim, entity) pairs
    // both spellings tagged. claims/claim_sources are never touched — the
    // traceability invariant (ruling 2) is structurally unaffected.
    const claimsById = new Map((rows as EntityRow[]).map((r) => [r.id, r.claims]));
    const dropEdges = plan.drops.reduce((s, d) => s + (claimsById.get(d.id) ?? 0), 0);
    const mergeEdges = plan.merges.reduce((s, m) => s + (claimsById.get(m.fromId) ?? 0), 0);
    const { rows: edgeCount } = await client.query(
      `SELECT count(*)::int AS n FROM claim_entities`,
    );
    console.log(
      `\nSUMMARY: ${rows.length} entities -> ${rows.length - plan.drops.length - plan.merges.length} ` +
        `after (${plan.drops.length} drops, ${plan.merges.length} merges); ` +
        `claim_entities ${edgeCount[0].n} total — ${dropEdges} edges deleted with drops, ` +
        `<= ${mergeEdges} edges repointed by merges (claims/claim_sources untouched)`,
    );

    if (!APPLY) {
      console.log("\ndry run — pass --apply to execute");
      return;
    }

    await client.query("BEGIN");

    for (const m of plan.merges) {
      await client.query(
        `INSERT INTO claim_entities (claim_id, entity_id, role)
         SELECT claim_id, $2, role FROM claim_entities WHERE entity_id = $1
         ON CONFLICT DO NOTHING`,
        [m.fromId, m.intoId],
      );
      await client.query(`DELETE FROM claim_entities WHERE entity_id = $1`, [m.fromId]);
      await client.query(
        `INSERT INTO entity_links (from_entity_id, to_entity_id, relation, source, since, meta)
         SELECT $2, to_entity_id, relation, source, since, meta FROM entity_links
         WHERE from_entity_id = $1 AND to_entity_id <> $2
         ON CONFLICT DO NOTHING`,
        [m.fromId, m.intoId],
      );
      await client.query(
        `INSERT INTO entity_links (from_entity_id, to_entity_id, relation, source, since, meta)
         SELECT from_entity_id, $2, relation, source, since, meta FROM entity_links
         WHERE to_entity_id = $1 AND from_entity_id <> $2
         ON CONFLICT DO NOTHING`,
        [m.fromId, m.intoId],
      );
      await client.query(`DELETE FROM entity_links WHERE from_entity_id = $1 OR to_entity_id = $1`, [m.fromId]);
      await client.query(
        `UPDATE entities SET aliases = (
           SELECT to_jsonb(array(SELECT DISTINCT x FROM jsonb_array_elements_text(aliases || $2::jsonb) AS t(x)))
         ) WHERE id = $1`,
        [m.intoId, JSON.stringify([m.fromName])],
      );
      await client.query(`DELETE FROM entities WHERE id = $1`, [m.fromId]);
    }

    const dropIds = plan.drops.map((d) => d.id);
    if (dropIds.length > 0) {
      await client.query(`DELETE FROM claim_entities WHERE entity_id = ANY($1::int[])`, [dropIds]);
      await client.query(`DELETE FROM entities WHERE id = ANY($1::int[])`, [dropIds]);
    }

    let orphans = 0;
    if (ORPHANS) {
      const res = await client.query(
        `DELETE FROM entities e
         WHERE NOT EXISTS (SELECT 1 FROM claim_entities ce WHERE ce.entity_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM entity_links l WHERE l.from_entity_id = e.id OR l.to_entity_id = e.id)
         RETURNING id`,
      );
      orphans = res.rowCount ?? 0;
    }

    await client.query("COMMIT");
    const { rows: after } = await client.query(`SELECT count(*)::int AS n FROM entities`);
    console.log(
      `\nAPPLIED: ${plan.merges.length} merges, ${plan.drops.length} drops` +
        (ORPHANS ? `, ${orphans} orphans` : "") +
        ` — entities now: ${after[0].n}`,
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
