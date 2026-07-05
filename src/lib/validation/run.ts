import { Pool } from "@neondatabase/serverless";
import { politeFetch } from "../fetch-cache";
import { extractTakeawaysWithText } from "./isw-extract";
import { llmMatchTakeaways } from "./llm-match";
import { scoreDigest, scoreDigestWithMatches, type ClaimForValidation } from "./score";

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Predictable ISW slug for a date: …/russian-offensive-campaign-assessment-june-30-2026/ */
export function iswUrlForDate(date: string): string {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  return `https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-${MONTH_NAMES[m - 1]}-${d}-${y}/`;
}

// Validate a digest against the same-day ISW report. Idempotent upsert per
// (digest, isw_report). Works locally (reads HTML cache) and on Vercel (fetches).

export interface ValidationRunResult {
  countryIso2: string;
  date: string;
  validationRunId: number;
  coveragePct: number | null;
  thinSourcedRate: number;
  timelinessHours: number | null;
  agreements: number;
  iswOnly: number;
  oursOnly: number;
}

export async function validateDigest(
  countryIso2: string,
  date: string,
): Promise<ValidationRunResult | { error: string }> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: digests } = await pool.query(
      `SELECT d.id, d.created_at FROM digests d
       JOIN countries c ON c.id = d.country_id
       WHERE c.iso2 = $1 AND d.digest_date = $2 AND d.track = 'military'`,
      [countryIso2, date],
    );
    if (digests.length === 0) return { error: `no digest for ${countryIso2} ${date}` };
    const digestId: number = digests[0].id;

    let { rows: reports } = await pool.query(
      `SELECT id, url FROM isw_reports WHERE report_date = $1`,
      [date],
    );
    if (reports.length === 0) {
      // steady-state: today's report isn't in the backfilled corpus yet —
      // ISW's slug pattern is predictable (…-assessment-june-30-2026)
      const url = iswUrlForDate(date);
      const probe = await politeFetch(url);
      if (probe && probe.status === 200 && probe.html.length > 10_000) {
        const ins = await pool.query(
          `INSERT INTO isw_reports (url, report_date, fetched_at, parse_status)
           VALUES ($1, $2, now(), 'pending')
           ON CONFLICT (url) DO UPDATE SET fetched_at = now()
           RETURNING id, url`,
          [url, date],
        );
        reports = ins.rows;
      } else {
        return { error: `no isw report for ${date} (probe ${probe?.status ?? "failed"})` };
      }
    }
    const report = reports[0];

    const page = await politeFetch(report.url);
    if (!page || page.status !== 200 || page.html.length < 1000)
      return { error: `isw page fetch failed (${page?.status})` };

    const { takeaways, transientTexts } = extractTakeawaysWithText(page.html);
    if (takeaways.length === 0) return { error: "no takeaways parsed" };

    const publishedMatch = page.html.match(/"datePublished":"([^"]+)"/);
    const iswPublishedAt = publishedMatch ? new Date(publishedMatch[1]) : null;

    const { rows: claimRows } = await pool.query(
      `SELECT cl.id, cl.text, cl.hedging,
              count(cs.raw_document_id)::int AS doc_count,
              min(COALESCE(rd.published_at, rd.fetched_at)) AS earliest_doc_at
       FROM claims cl
       JOIN claim_sources cs ON cs.claim_id = cl.id
       JOIN raw_documents rd ON rd.id = cs.raw_document_id
       WHERE cl.digest_id = $1
       GROUP BY cl.id`,
      [digestId],
    );
    const claims: ClaimForValidation[] = claimRows.map((r) => ({
      claimId: r.id,
      text: r.text,
      hedging: r.hedging,
      docCount: r.doc_count,
      earliestDocAt: r.earliest_doc_at ? new Date(r.earliest_doc_at).toISOString() : null,
    }));

    // semantic matching when a key is live; keyword gazetteer otherwise.
    // ISW texts are transient prompt inputs only — never persisted (§8.6).
    const matches = await llmMatchTakeaways(transientTexts, claims);
    const score = matches
      ? scoreDigestWithMatches(takeaways, claims, iswPublishedAt, matches)
      : scoreDigest(takeaways, claims, iswPublishedAt);
    const matcher = matches ? "llm" : "keyword";

    // store derived signatures on the report (keywords only, no prose)
    await pool.query(`UPDATE isw_reports SET derived = $1 WHERE id = $2`, [
      JSON.stringify({ takeaways, publishedAt: iswPublishedAt?.toISOString() ?? null }),
      report.id,
    ]);

    const { rows: vr } = await pool.query(
      `INSERT INTO validation_runs
         (digest_id, isw_report_id, coverage_pct, unsupported_claim_rate, timeliness_hours, divergences, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (digest_id, isw_report_id) DO UPDATE SET
         run_at = now(), coverage_pct = $3, unsupported_claim_rate = $4,
         timeliness_hours = $5, divergences = $6, details = $7
       RETURNING id`,
      [
        digestId,
        report.id,
        score.coveragePct,
        score.thinSourcedRate,
        score.timelinessHours,
        JSON.stringify(score.divergences),
        JSON.stringify({ ...score.details, matcher }),
      ],
    );

    const kinds = score.divergences.reduce(
      (acc, d) => ((acc[d.kind] = (acc[d.kind] ?? 0) + 1), acc),
      {} as Record<string, number>,
    );

    return {
      countryIso2,
      date,
      validationRunId: vr[0].id,
      coveragePct: score.coveragePct,
      thinSourcedRate: score.thinSourcedRate,
      timelinessHours: score.timelinessHours,
      agreements: kinds.agreement ?? 0,
      iswOnly: kinds.isw_only ?? 0,
      oursOnly: kinds.ours_only ?? 0,
    };
  } finally {
    await pool.end();
  }
}
