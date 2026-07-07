import "./env";
import { neon } from "@neondatabase/serverless";

// Recompute source-registry aggregates from source_citations x isw_reports.
// Full recompute -> idempotent. Run after every isw-load.
//
// Theater-aware since 2026-07-06: per-theater aggregates land in
// source_theater_stats (ru = ROCA corpus, ir = Iran Update corpus); the global
// columns on `sources` aggregate across ALL theaters, so ME-only sources carry
// real stats instead of zombie zeros.
//
// Reliability score (documented formula, v1):
//   weighted mean of hedging classes on the source's citations
//   confirmed=1.0, assessed=0.75, unknown=0.5, claimed=0.4, unverified=0.15
//   (unknown = ISW unhedged declarative — mid-trust by design)
// Decay: last cited > 12 months before the newest report in the SAME theater.

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

async function main() {
  // 1. per-theater aggregates
  await sql`DELETE FROM source_theater_stats`;
  const theater = await sql`
    WITH corpus AS (
      SELECT theater, max(report_date) AS newest FROM isw_reports GROUP BY theater
    )
    INSERT INTO source_theater_stats
      (source_id, theater, citation_count, first_cited_report_date, last_cited_report_date,
       hedging_confirmed, hedging_claimed, hedging_unverified, hedging_assessed, hedging_unknown,
       reliability_score, decayed)
    SELECT
      sc.source_id,
      ir.theater,
      count(*)::int,
      min(ir.report_date),
      max(ir.report_date),
      count(*) FILTER (WHERE sc.hedging = 'confirmed')::int,
      count(*) FILTER (WHERE sc.hedging = 'claimed')::int,
      count(*) FILTER (WHERE sc.hedging = 'unverified')::int,
      count(*) FILTER (WHERE sc.hedging = 'assessed')::int,
      count(*) FILTER (WHERE sc.hedging = 'unknown')::int,
      round((
        (count(*) FILTER (WHERE sc.hedging = 'confirmed') * 1.0
         + count(*) FILTER (WHERE sc.hedging = 'assessed') * 0.75
         + count(*) FILTER (WHERE sc.hedging = 'unknown') * 0.5
         + count(*) FILTER (WHERE sc.hedging = 'claimed') * 0.4
         + count(*) FILTER (WHERE sc.hedging = 'unverified') * 0.15)
        / count(*))::numeric, 4),
      max(ir.report_date) < (SELECT newest FROM corpus c WHERE c.theater = ir.theater) - interval '12 months'
    FROM source_citations sc
    JOIN isw_reports ir ON ir.id = sc.report_id
    GROUP BY sc.source_id, ir.theater
    RETURNING source_id`;
  console.log(`theater stats rows: ${theater.length}`);

  // 2. global (all-theater) aggregates on sources
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
  console.log(`materialized ${res.length} sources (global)`);

  const stats = await sql`
    SELECT theater, count(*)::int n, round(avg(reliability_score)::numeric, 3) avg_rel,
           sum((decayed)::int)::int decayed
    FROM source_theater_stats
    GROUP BY theater ORDER BY n DESC`;
  console.table(stats);
  const zombies = await sql`
    SELECT count(*)::int AS zombie FROM sources s
    WHERE s.citation_count = 0
      AND EXISTS (SELECT 1 FROM source_citations sc WHERE sc.source_id = s.id)`;
  console.log(`cited-but-zero-count sources remaining: ${zombies[0].zombie}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
