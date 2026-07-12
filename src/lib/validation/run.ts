import { Pool } from "@neondatabase/serverless";
import { politeFetch } from "../fetch-cache";
import { extractTakeawaysWithText } from "./isw-extract";
import { classifyTakeawayTheater } from "./keywords";
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

/** ISW Iran Update slug: …/middle-east/iran-update-special-report-july-4-2026/ */
export function iranUpdateUrlForDate(date: string): string {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  return `https://understandingwar.org/research/middle-east/iran-update-special-report-${MONTH_NAMES[m - 1]}-${d}-${y}/`;
}

// Map a country/theater to its ISW reference: theater key + url builder.
// Only countries with a same-day expert benchmark are validatable.
export function referenceFor(countryIso2: string): { theater: string; urlForDate: (d: string) => string } | null {
  if (countryIso2 === "ru" || countryIso2 === "ua")
    return { theater: "ru", urlForDate: iswUrlForDate };
  if (countryIso2 === "ir")
    return { theater: "ir", urlForDate: iranUpdateUrlForDate };
  return null; // Gulf states have no daily reference yet
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
  const reference = referenceFor(countryIso2);
  if (!reference) return { error: `no validation reference for ${countryIso2}` };

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
      `SELECT id, url FROM isw_reports WHERE theater = $1 AND report_date = $2`,
      [reference.theater, date],
    );
    if (reports.length === 0) {
      // steady-state: report not yet in the corpus — ISW slugs are predictable
      const url = reference.urlForDate(date);
      const probe = await politeFetch(url);
      if (probe && probe.status === 200 && probe.html.length > 10_000) {
        const ins = await pool.query(
          `INSERT INTO isw_reports (url, theater, report_date, fetched_at, parse_status)
           VALUES ($1, $2, $3, now(), 'pending')
           ON CONFLICT (url) DO UPDATE SET fetched_at = now()
           RETURNING id, url`,
          [url, reference.theater, date],
        );
        reports = ins.rows;
      } else {
        return { error: `no reference report for ${countryIso2} ${date} (probe ${probe?.status ?? "failed"})` };
      }
    }
    const report = reports[0];

    const page = await politeFetch(report.url);
    if (!page || page.status !== 200 || page.html.length < 1000)
      return { error: `isw page fetch failed (${page?.status})` };

    const extraction = extractTakeawaysWithText(page.html);
    if (extraction.takeaways.length === 0) return { error: "no takeaways parsed" };

    // Per-theater takeaway filtering: RU and UA validate against the same
    // whole-war ROCA report — score each theater only against its own-side +
    // both-side takeaways, or coverage is structurally deflated. The FULL
    // extraction still gets persisted on isw_reports below. Re-index the
    // filtered set: llmMatchTakeaways numbers by array position while
    // scoreDigestWithMatches correlates on .index — they must stay aligned.
    let takeaways = extraction.takeaways;
    let transientTexts = extraction.transientTexts;
    let takeawaysFiltered = 0;
    if (countryIso2 === "ru" || countryIso2 === "ua") {
      const keep = extraction.takeaways.map((t) => {
        const th = classifyTakeawayTheater(t.toponyms);
        return th === "both" || th === countryIso2;
      });
      takeawaysFiltered = keep.filter((k) => !k).length;
      takeaways = extraction.takeaways
        .filter((_, i) => keep[i])
        .map((t, i) => ({ ...t, index: i }));
      transientTexts = extraction.transientTexts.filter((_, i) => keep[i]);
      if (takeaways.length === 0)
        return { error: `all ${extraction.takeaways.length} takeaways off-theater for ${countryIso2}` };
    }

    const publishedMatch = page.html.match(/"datePublished":"([^"]+)"/);
    const iswPublishedAt = publishedMatch ? new Date(publishedMatch[1]) : null;

    // earliest_doc_at (publish-or-fetch) feeds the info-lead metric;
    // earliest_fetched_at (ingest instant only) feeds the at-publish dual metric —
    // a source's own publish claim can predate our ingestion, so it must not
    // count as evidence we "had in hand" (docs/TIME-MODEL.md).
    const { rows: claimRows } = await pool.query(
      `SELECT cl.id, cl.text, cl.hedging,
              count(cs.raw_document_id)::int AS doc_count,
              min(COALESCE(rd.published_at, rd.fetched_at)) AS earliest_doc_at,
              min(rd.fetched_at) AS earliest_fetched_at
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
      earliestFetchedAt: r.earliest_fetched_at
        ? new Date(r.earliest_fetched_at).toISOString()
        : null,
    }));

    // semantic matching when a key is live; keyword gazetteer otherwise.
    // ISW texts are transient prompt inputs only — never persisted (§8.6).
    // Default is majority voting over MATCH_VOTES rounds (OPEN-TASKS #15);
    // per-vote detail lands in details.votes for auditability.
    const outcome = await llmMatchTakeaways(transientTexts, claims);
    const score = outcome
      ? scoreDigestWithMatches(takeaways, claims, iswPublishedAt, outcome.matches)
      : scoreDigest(takeaways, claims, iswPublishedAt);
    const matcher = outcome?.matcher ?? "keyword";

    // store derived signatures on the report (keywords only, no prose) — the
    // FULL unfiltered extraction; theater filtering is per-validation-run
    await pool.query(`UPDATE isw_reports SET derived = $1 WHERE id = $2`, [
      JSON.stringify({
        takeaways: extraction.takeaways,
        publishedAt: iswPublishedAt?.toISOString() ?? null,
      }),
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
        JSON.stringify({
          ...score.details,
          matcher,
          theater: countryIso2,
          takeawaysTotal: extraction.takeaways.length,
          takeawaysFiltered,
          // Dual coverage (jsonb, no schema change): evidence-in-hand at ISW
          // publish vs the headline (final) coverage_pct — same denominator.
          ...(score.atPublish ? { atPublish: score.atPublish } : {}),
          ...(outcome?.votes ? { votes: outcome.votes, voteRounds: outcome.voteRounds } : {}),
        }),
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
