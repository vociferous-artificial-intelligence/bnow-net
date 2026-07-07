import "./env";
import { neon } from "@neondatabase/serverless";

// Citation-weighted source parity: of the citations ISW made in the last 90
// days (per theater), what share went to sources we actually ingest (source
// has >=1 raw_document)? The 2026-07-05 baseline was 51% for the ru theater;
// the missing half was mostly X accounts. Run after the X adapter to log the
// new figure. Usage: npx tsx scripts/source-parity.ts

const sql = neon(process.env.DATABASE_URL!);

async function parity(theater: string, excludeXApi: boolean) {
  const rows = await sql`
    WITH recent AS (
      SELECT sc.source_id, count(*) AS citations
      FROM source_citations sc
      JOIN isw_reports ir ON ir.id = sc.report_id
      WHERE ir.theater = ${theater}
        AND ir.report_date > (SELECT max(report_date) FROM isw_reports WHERE theater = ${theater}) - interval '90 days'
      GROUP BY sc.source_id
    ),
    ingested AS (
      SELECT DISTINCT source_id FROM raw_documents
      WHERE source_id IS NOT NULL
        AND (NOT ${excludeXApi} OR adapter <> 'x_api')
    )
    SELECT
      count(*)::int AS cited_sources,
      count(*) FILTER (WHERE i.source_id IS NOT NULL)::int AS ingested_sources,
      sum(r.citations)::int AS citations,
      coalesce(sum(r.citations) FILTER (WHERE i.source_id IS NOT NULL), 0)::int AS ingested_citations
    FROM recent r LEFT JOIN ingested i ON i.source_id = r.source_id`;
  const r = rows[0];
  const pct = r.citations ? ((100 * r.ingested_citations) / r.citations).toFixed(1) : "n/a";
  console.log(
    `${theater} ${excludeXApi ? "without x_api" : "with    x_api"}: ` +
      `${r.ingested_sources}/${r.cited_sources} cited sources ingested, ` +
      `${r.ingested_citations}/${r.citations} citations = ${pct}% citation-weighted`,
  );
}

async function main() {
  for (const theater of ["ru", "ir"]) {
    await parity(theater, true);
    await parity(theater, false);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
