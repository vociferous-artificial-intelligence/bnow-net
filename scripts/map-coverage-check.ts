import "./env";
import { neon } from "@neondatabase/serverless";
import { versionFilterSql } from "../src/lib/analysis/map-versions";

// Shadow-map coverage spot check (MR sprint 2, TASK 5): for digest claims the
// PRODUCTION pipeline published in the backfill window, does the per-doc claim
// store hold a semantically matching claim on the same cited document?
//
// Read-only. Prints a stable pseudo-random sample of (digest claim, cited doc,
// that doc's map claims) tuples for hand-judging in the shadow report. A cited
// doc that the map filed as a mirror is resolved to its canonical first — the
// canonical carries the claims.
//
//   npx tsx scripts/map-coverage-check.ts [sampleSize=30]

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const sample = Number(process.argv[2] ?? 30);

  const rows = (await sql`
    SELECT cl.id AS claim_id, c.iso2, d.digest_date::text AS day, d.track,
           cl.hedging, cl.text AS digest_claim, cs.raw_document_id AS cited_doc
    FROM claims cl
    JOIN digests d ON d.id = cl.digest_id
    JOIN countries c ON c.id = d.country_id
    JOIN claim_sources cs ON cs.claim_id = cl.id
    WHERE d.digest_date BETWEEN '2026-07-04' AND '2026-07-09'
      AND c.iso2 IN ('ru', 'ua', 'ir')
    ORDER BY md5(cl.id::text || ':' || cs.raw_document_id::text)
    LIMIT ${sample}`) as Array<{
    claim_id: number;
    iso2: string;
    day: string;
    track: string;
    hedging: string;
    digest_claim: string;
    cited_doc: number;
  }>;

  let hasMapClaims = 0;
  let mappedEmpty = 0;
  let unmapped = 0;

  for (const [i, r] of rows.entries()) {
    // mirror? follow to canonical — the map stores claims on the canonical doc
    const dedup = (await sql`
      SELECT canonical_doc_id, method FROM doc_dedup WHERE raw_document_id = ${r.cited_doc}`) as Array<{
      canonical_doc_id: number;
      method: string;
    }>;
    const docId = dedup[0]?.canonical_doc_id ?? r.cited_doc;

    // current extractor versions only (OPEN-TASKS #35, via the accessor) —
    // superseded history rows must not count as coverage
    const vf = versionFilterSql(r.iso2, "dc", 2);
    const mapClaims = (await sql.query(
      `SELECT dc.track, dc.hedging, dc.text_en, dc.event_hint
       FROM doc_claims dc
       WHERE dc.raw_document_id = $1 AND ${vf.sql}
       ORDER BY dc.track, dc.ordinal`,
      [docId, ...vf.params],
    )) as Array<{
      track: string;
      hedging: string;
      text_en: string;
      event_hint: string | null;
    }>;
    const state = (await sql`
      SELECT track, claim_count FROM doc_map_state WHERE raw_document_id = ${docId}`) as Array<{
      track: string;
      claim_count: number;
    }>;

    const status =
      mapClaims.length > 0 ? "MAPPED+CLAIMS" : state.length > 0 ? "MAPPED-EMPTY" : "UNMAPPED";
    if (status === "MAPPED+CLAIMS") hasMapClaims++;
    else if (status === "MAPPED-EMPTY") mappedEmpty++;
    else unmapped++;

    console.log(`\n#${i + 1} [${status}] ${r.iso2}/${r.day}/${r.track} digest claim ${r.claim_id} → doc ${r.cited_doc}${dedup[0] ? ` (mirror→${docId}, ${dedup[0].method})` : ""}`);
    console.log(`  DIGEST [${r.hedging}]: ${r.digest_claim}`);
    for (const mc of mapClaims) {
      console.log(`  MAP    [${mc.hedging}] (${mc.track}): ${mc.text_en}`);
      if (mc.event_hint) console.log(`         hint: ${mc.event_hint}`);
    }
  }

  console.log(`\n== summary over ${rows.length} sampled (digest claim, cited doc) pairs ==`);
  console.log(`doc has map claims: ${hasMapClaims} · mapped but empty: ${mappedEmpty} · unmapped: ${unmapped}`);
  console.log(`(semantic hit rate is judged by hand in docs/reviews/MAP-SHADOW-RESULTS.md)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
