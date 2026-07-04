import "./env";
import { neon } from "@neondatabase/serverless";

// Recompute source-registry aggregates from source_citations x isw_reports.
// Full recompute -> idempotent. Run after every isw-load.
//
// Reliability score (documented formula, v1):
//   weighted mean of hedging classes on the source's citations
//   confirmed=1.0, assessed=0.75, unknown=0.5, claimed=0.4, unverified=0.15
//   (unknown = ISW unhedged declarative — mid-trust by design)
// Decay: last cited > 12 months before the newest report in the corpus.

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

async function main() {
  const res = await sql`
    WITH agg AS (
      SELECT
        sc.source_id,
        count(*)::int AS citation_count,
        min(ir.report_date) AS first_cited,
        max(ir.report_date) AS last_cited,
        count(*) FILTER (WHERE sc.hedging = 'confirmed')::int  AS h_confirmed,
        count(*) FILTER (WHERE sc.hedging = 'claimed')::int    AS h_claimed,
        count(*) FILTER (WHERE sc.hedging = 'unverified')::int AS h_unverified,
        count(*) FILTER (WHERE sc.hedging = 'assessed')::int   AS h_assessed,
        count(*) FILTER (WHERE sc.hedging = 'unknown')::int    AS h_unknown
      FROM source_citations sc
      JOIN isw_reports ir ON ir.id = sc.report_id
      GROUP BY sc.source_id
    ),
    corpus AS (SELECT max(report_date) AS newest FROM isw_reports)
    UPDATE sources s SET
      citation_count = a.citation_count,
      first_cited_report_date = a.first_cited,
      last_cited_report_date = a.last_cited,
      hedging_confirmed = a.h_confirmed,
      hedging_claimed = a.h_claimed,
      hedging_unverified = a.h_unverified,
      hedging_assessed = a.h_assessed,
      hedging_unknown = a.h_unknown,
      reliability_score = round((
        (a.h_confirmed * 1.0 + a.h_assessed * 0.75 + a.h_unknown * 0.5
         + a.h_claimed * 0.4 + a.h_unverified * 0.15)
        / a.citation_count)::numeric, 4),
      decayed = a.last_cited < (SELECT newest FROM corpus) - interval '12 months',
      status = CASE
        WHEN a.last_cited < (SELECT newest FROM corpus) - interval '12 months' THEN 'decayed'::source_status
        ELSE 'active'::source_status
      END
    FROM agg a
    WHERE s.id = a.source_id
    RETURNING s.id`;
  console.log(`materialized ${res.length} sources`);

  const stats = await sql`
    SELECT platform, count(*)::int n, round(avg(reliability_score)::numeric, 3) avg_rel,
           sum((decayed)::int)::int decayed
    FROM sources WHERE citation_count > 0
    GROUP BY platform ORDER BY n DESC`;
  console.table(stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
