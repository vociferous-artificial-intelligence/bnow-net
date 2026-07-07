// One-off remediation (2026-07-06 hardening, Task 1 — truth-in-UI): purge stub
// fixture data that leaked into production tables. Idempotent; safe to re-run.
//
// 1. claims whose ONLY sources are stub docs -> deleted (fabricated-sourced);
//    claim_sources/claim_entities cascade.
// 2. remaining claim_sources rows pointing at stub docs -> deleted (mixed-source
//    claims keep their real sources).
// 3. stub raw_documents deleted (content-hash dedupe means they only return if a
//    stub adapter runs again — which production ingest no longer wires).
// 4. events left with no claims -> deleted (same invariant digest regen enforces).
// 5. entities.meta.opensanctions stripped everywhere — every record to date was
//    produced by the keyless stub; the next enrich run re-stamps sanitized
//    {matched:false, stub:true} records.
// 6. entity_links with source='stub' -> deleted.
//
// Affected digests (claims deleted) are reported at the end — regenerate them via
// /api/cron/digest?country=<iso2>&date=<date> after deploy.
import "./env";
import { Pool } from "@neondatabase/serverless";

const STUB_LIKE = "[STUB FIXTURE]%";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const affected = await client.query(
      `SELECT DISTINCT d.id AS digest_id, c.iso2, d.digest_date::text AS date, d.track
       FROM claim_sources cs
       JOIN raw_documents rd ON rd.id = cs.raw_document_id
       JOIN claims cl ON cl.id = cs.claim_id
       JOIN digests d ON d.id = cl.digest_id
       JOIN countries c ON c.id = d.country_id
       WHERE rd.content LIKE $1`,
      [STUB_LIKE],
    );

    const delClaims = await client.query(
      `DELETE FROM claims WHERE id IN (
         SELECT cl.id FROM claims cl
         WHERE EXISTS (
           SELECT 1 FROM claim_sources cs JOIN raw_documents rd ON rd.id = cs.raw_document_id
           WHERE cs.claim_id = cl.id AND rd.content LIKE $1)
         AND NOT EXISTS (
           SELECT 1 FROM claim_sources cs JOIN raw_documents rd ON rd.id = cs.raw_document_id
           WHERE cs.claim_id = cl.id AND rd.content NOT LIKE $1)
       ) RETURNING id`,
      [STUB_LIKE],
    );

    const delLinks = await client.query(
      `DELETE FROM claim_sources WHERE raw_document_id IN
         (SELECT id FROM raw_documents WHERE content LIKE $1) RETURNING claim_id`,
      [STUB_LIKE],
    );

    const delDocs = await client.query(
      `DELETE FROM raw_documents WHERE content LIKE $1 RETURNING id, adapter`,
      [STUB_LIKE],
    );

    const delEvents = await client.query(
      `DELETE FROM events e WHERE NOT EXISTS
         (SELECT 1 FROM claims c WHERE c.event_id = e.id) RETURNING id`,
    );

    const stripMeta = await client.query(
      `UPDATE entities SET meta = meta - 'opensanctions'
       WHERE meta ? 'opensanctions' RETURNING id`,
    );

    const delEdges = await client.query(
      `DELETE FROM entity_links WHERE source = 'stub' RETURNING id`,
    );

    await client.query("COMMIT");

    console.log("claims deleted (stub-only sources):", delClaims.rowCount);
    console.log("claim_sources links to stub docs deleted:", delLinks.rowCount);
    console.log("stub raw_documents deleted:", delDocs.rowCount, delDocs.rows.map((r) => r.adapter));
    console.log("claim-less events deleted:", delEvents.rowCount);
    console.log("entities' stub opensanctions meta stripped:", stripMeta.rowCount);
    console.log("stub entity_links deleted:", delEdges.rowCount);
    console.log("\ndigests needing regeneration:");
    for (const r of affected.rows)
      console.log(`  /api/cron/digest?country=${r.iso2}&date=${r.date.slice(0, 10)}&track=${r.track} (digest ${r.digest_id})`);
    if (affected.rows.length === 0) console.log("  none");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
