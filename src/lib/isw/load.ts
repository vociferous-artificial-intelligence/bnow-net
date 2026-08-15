// Shared, idempotent ISW citation loader (2026-08-15 Iran validation recovery,
// Workstream C).
//
// Before this module the endnote→registry path existed ONLY inside
// scripts/isw-load.ts, so no runtime code could refresh citations: every report
// the validation cron discovered stayed parse_status='pending' with zero
// citations forever (newest parsed Iran report: 2026-07-03). This is the single
// upsert authority now used by BOTH the script and the validation hook
// (refreshReportCitations), so the two paths cannot drift.
//
// Legal boundary (standing ruling 1): nothing here persists ISW prose. The
// only stored strings are cleaned citation URLs, canonical source keys/names,
// hedging enum values, and the ≤60-char hedging cue from hedging.ts.
//
// Idempotency: sources dedupe on canonical_url; citations dedupe on
// (report_id, raw_url, endnote_index); the report row is updated BY ID —
// never via ON CONFLICT (url) — which sidesteps the two-unique-index trap
// where a slug variant of an existing (theater, report_date) would collide.
// A parse failure NEVER downgrades an already-'parsed' report or touches its
// citations: prior good registry state stays intact.

import type { ParsedReport } from "./parse";
import { canonicalSource } from "./urls";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export interface CitationLoadResult {
  reportId: number;
  action: "parsed" | "failed" | "kept_prior";
  endnoteCount: number;
  citationCount: number;
  sourcesCreated: number;
  citationsInserted: number;
  /** (source_id, theater) rows refreshed in source_theater_stats */
  statsRefreshed: number;
}

/** Hedging weights — the documented v1 reliability formula
 *  (scripts/registry-materialize.ts); duplicated as SQL below. */
const RELIABILITY_SQL = `round((
        (count(*) FILTER (WHERE sc.hedging = 'confirmed') * 1.0
         + count(*) FILTER (WHERE sc.hedging = 'assessed') * 0.75
         + count(*) FILTER (WHERE sc.hedging = 'unknown') * 0.5
         + count(*) FILTER (WHERE sc.hedging = 'claimed') * 0.4
         + count(*) FILTER (WHERE sc.hedging = 'unverified') * 0.15)
        / count(*))::numeric, 4)`;

/**
 * Load one parsed report's endnote citations into the registry, keyed by an
 * EXISTING isw_reports row id. Re-running is a no-op (unique keys absorb every
 * replay). Returns honest counts; throws only on infrastructure errors.
 */
export async function loadParsedReportById(
  query: QueryFn,
  reportId: number,
  theater: string,
  parsed: ParsedReport,
): Promise<CitationLoadResult> {
  const current = await query(`SELECT parse_status FROM isw_reports WHERE id = $1`, [reportId]);
  if (current.length === 0) throw new Error(`isw_reports id ${reportId} not found`);
  const priorStatus = String(current[0].parse_status);

  if (!parsed.parseOk) {
    if (priorStatus === "parsed") {
      // layout change / partial fetch must not destroy good registry state
      return {
        reportId,
        action: "kept_prior",
        endnoteCount: 0,
        citationCount: 0,
        sourcesCreated: 0,
        citationsInserted: 0,
        statsRefreshed: 0,
      };
    }
    await query(`UPDATE isw_reports SET parse_status = 'failed', fetched_at = now() WHERE id = $1`, [
      reportId,
    ]);
    return {
      reportId,
      action: "failed",
      endnoteCount: parsed.endnoteCount,
      citationCount: 0,
      sourcesCreated: 0,
      citationsInserted: 0,
      statsRefreshed: 0,
    };
  }

  // 1. get-or-create sources for the canonical citation identities
  const wanted = new Map<string, { platform: string; name: string; domain: string }>();
  for (const c of parsed.citations) {
    const cs = canonicalSource(c.rawUrl);
    if (cs && !wanted.has(cs.key)) wanted.set(cs.key, cs);
  }
  let sourcesCreated = 0;
  const entries = [...wanted.entries()];
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach(([key, s], j) => {
      const o = j * 4;
      values.push(`($${o + 1}, $${o + 2}, $${o + 3}::platform, $${o + 4})`);
      params.push(key, s.domain, s.platform, s.name);
    });
    const created = await query(
      `INSERT INTO sources (canonical_url, domain, platform, name) VALUES ${values.join(",")}
       ON CONFLICT (canonical_url) DO NOTHING RETURNING id`,
      params,
    );
    sourcesCreated += created.length;
  }
  const keys = entries.map(([key]) => key);
  const srcRows = keys.length
    ? await query(`SELECT id, canonical_url FROM sources WHERE canonical_url = ANY($1)`, [keys])
    : [];
  const sourceIdByKey = new Map<string, number>(
    srcRows.map((r) => [String(r.canonical_url), Number(r.id)]),
  );

  // 2. citations (deduped by the (report_id, raw_url, endnote_index) index)
  const rows = parsed.citations
    .map((c) => {
      const cs = canonicalSource(c.rawUrl);
      if (!cs) return null; // self-citations / unparseable
      const sourceId = sourceIdByKey.get(cs.key);
      if (!sourceId) return null;
      return {
        sourceId,
        rawUrl: c.rawUrl,
        endnoteIndex: c.endnoteIndex,
        hedging: c.hedging,
        cue: c.hedgingCue,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  let citationsInserted = 0;
  const touchedSourceIds = new Set<number>();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((c, j) => {
      const o = j * 6;
      values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}::hedging, $${o + 6})`);
      params.push(reportId, c.sourceId, c.rawUrl, c.endnoteIndex, c.hedging, c.cue);
    });
    const inserted = await query(
      `INSERT INTO source_citations (report_id, source_id, raw_url, endnote_index, hedging, hedging_cue)
       VALUES ${values.join(",")} ON CONFLICT (report_id, raw_url, endnote_index) DO NOTHING RETURNING source_id`,
      params,
    );
    citationsInserted += inserted.length;
    for (const r of inserted) touchedSourceIds.add(Number(r.source_id));
  }

  // 3. honest status/count update, BY ID (never ON CONFLICT (url))
  await query(
    `UPDATE isw_reports SET parse_status = 'parsed', endnote_count = $2, citation_count = $3,
       title = COALESCE($4, title), fetched_at = now() WHERE id = $1`,
    [reportId, parsed.endnoteCount, parsed.citations.length, parsed.title || null],
  );

  // 4. incremental stats refresh for the touched sources only — per-row
  //   upserts, so readers never see an empty table (the full recompute in
  //   scripts/registry-materialize.ts remains the periodic backstop and also
  //   refreshes OTHER sources' decay as the newest report advances)
  const statsRefreshed = touchedSourceIds.size
    ? await refreshSourceStats(query, [...touchedSourceIds], theater)
    : 0;

  return {
    reportId,
    action: "parsed",
    endnoteCount: parsed.endnoteCount,
    citationCount: parsed.citations.length,
    sourcesCreated,
    citationsInserted,
    statsRefreshed,
  };
}

/** Recompute source_theater_stats (for one theater) + the global aggregates on
 *  sources, restricted to `sourceIds`. Upsert-only: no destructive window. */
export async function refreshSourceStats(
  query: QueryFn,
  sourceIds: number[],
  theater: string,
): Promise<number> {
  const stats = await query(
    `WITH corpus AS (
       SELECT max(report_date) AS newest FROM isw_reports WHERE theater = $2
     )
     INSERT INTO source_theater_stats
       (source_id, theater, citation_count, first_cited_report_date, last_cited_report_date,
        hedging_confirmed, hedging_claimed, hedging_unverified, hedging_assessed, hedging_unknown,
        reliability_score, decayed)
     SELECT
       sc.source_id, ir.theater, count(*)::int, min(ir.report_date), max(ir.report_date),
       count(*) FILTER (WHERE sc.hedging = 'confirmed')::int,
       count(*) FILTER (WHERE sc.hedging = 'claimed')::int,
       count(*) FILTER (WHERE sc.hedging = 'unverified')::int,
       count(*) FILTER (WHERE sc.hedging = 'assessed')::int,
       count(*) FILTER (WHERE sc.hedging = 'unknown')::int,
       ${RELIABILITY_SQL},
       max(ir.report_date) < (SELECT newest FROM corpus) - interval '12 months'
     FROM source_citations sc
     JOIN isw_reports ir ON ir.id = sc.report_id
     WHERE sc.source_id = ANY($1) AND ir.theater = $2
     GROUP BY sc.source_id, ir.theater
     ON CONFLICT (source_id, theater) DO UPDATE SET
       citation_count = EXCLUDED.citation_count,
       first_cited_report_date = EXCLUDED.first_cited_report_date,
       last_cited_report_date = EXCLUDED.last_cited_report_date,
       hedging_confirmed = EXCLUDED.hedging_confirmed,
       hedging_claimed = EXCLUDED.hedging_claimed,
       hedging_unverified = EXCLUDED.hedging_unverified,
       hedging_assessed = EXCLUDED.hedging_assessed,
       hedging_unknown = EXCLUDED.hedging_unknown,
       reliability_score = EXCLUDED.reliability_score,
       decayed = EXCLUDED.decayed
     RETURNING source_id`,
    [sourceIds, theater],
  );

  await query(
    `WITH agg AS (
       SELECT sc.source_id,
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
       WHERE sc.source_id = ANY($1)
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
     WHERE s.id = a.source_id`,
    [sourceIds],
  );
  return stats.length;
}

/**
 * Validation-path hook: parse endnotes from the SAME fetched HTML the takeaway
 * extractor uses (zero extra fetches, works on Vercel where no disk cache
 * exists) and load them idempotently. Never throws — a citation-refresh
 * failure must not cost a validation run. ISW prose stays transient: the HTML
 * is parsed in memory and only URLs/enums/counts/cues persist.
 */
export async function refreshReportCitations(
  query: QueryFn,
  reportId: number,
  reportUrl: string,
  theater: string,
  html: string,
): Promise<CitationLoadResult | null> {
  try {
    const { parseReport } = await import("./parse");
    const parsed = parseReport(reportUrl, html);
    return await loadParsedReportById(query, reportId, theater, parsed);
  } catch (e) {
    console.warn(
      `isw-load: citation refresh failed for report ${reportId} (validation unaffected): ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}
