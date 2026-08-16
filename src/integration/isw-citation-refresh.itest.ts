import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the Workstream C citation auto-refresh: a pending
// isw_reports row + the real 2026-07-24 Iran Update fixture HTML produce
// sources / source_citations / source_theater_stats rows through the SAME
// loader the validation hook uses; a replay inserts nothing (unique keys) but
// still recomputes stats for every resolved source — so a run that committed
// citations and then lost its stats refresh is repaired by the next replay; a
// parse failure never downgrades the parsed row. Zero network, zero LLM.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { refreshReportCitations } = await import("@/lib/isw/load");

const FIXTURE_URL_REAL =
  "https://understandingwar.org/research/middle-east/iran-update-special-report-july-24-2026/";
// synthetic slugs + FAR-FUTURE dates: the branch is a fork of production, so a
// real url/date would collide with genuine rows via the two unique indexes.
// SEED_DATE_2 (partial-failure scenario) sorts after SEED_DATE so that
// last_cited_report_date advancing to it is an unambiguous repair signal.
const SEED_URL = "https://understandingwar.org/research/middle-east/iran-update-itest-refresh/";
const SEED_DATE = "2027-06-20";
const SEED_URL_2 = "https://understandingwar.org/research/middle-east/iran-update-itest-partial-failure/";
const SEED_DATE_2 = "2027-06-21";
const html = readFileSync(join(process.cwd(), "fixtures/isw/iran-update-2026-07-24.html"), "utf8");

let pool: Pool;
let reportId: number;
let reportId2: number;
const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

beforeAll(async () => {
  pool = new Pool({ connectionString: URL_ENV });
  await pool.query(
    `DELETE FROM source_citations WHERE report_id IN (SELECT id FROM isw_reports WHERE url = ANY($1))`,
    [[SEED_URL, SEED_URL_2]],
  );
  await pool.query(`DELETE FROM isw_reports WHERE url = ANY($1)`, [[SEED_URL, SEED_URL_2]]);
  const { rows } = await pool.query(
    `INSERT INTO isw_reports (url, theater, report_date, fetched_at, parse_status)
     VALUES ($1, 'ir', $2, now(), 'pending'), ($3, 'ir', $4, now(), 'pending') RETURNING id`,
    [SEED_URL, SEED_DATE, SEED_URL_2, SEED_DATE_2],
  );
  reportId = rows[0].id;
  reportId2 = rows[1].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM source_citations WHERE report_id = ANY($1)`, [[reportId, reportId2]]);
  await pool.query(`DELETE FROM isw_reports WHERE id = ANY($1)`, [[reportId, reportId2]]);
  await pool.end();
});

describe("citation auto-refresh (validation-path loader)", () => {
  it("parses the fetched HTML and loads citations idempotently", async () => {
    const first = await refreshReportCitations(query, reportId, FIXTURE_URL_REAL, "ir", html);
    expect(first).not.toBeNull();
    expect(first!.action).toBe("parsed");
    expect(first!.citationsInserted).toBeGreaterThan(10);

    const [report] = await query(
      `SELECT parse_status, endnote_count, citation_count FROM isw_reports WHERE id = $1`,
      [reportId],
    );
    expect(report.parse_status).toBe("parsed");
    expect(Number(report.endnote_count)).toBeGreaterThan(10);
    expect(Number(report.citation_count)).toBeGreaterThanOrEqual(first!.citationsInserted);

    const [cits] = await query(`SELECT count(*)::int AS n FROM source_citations WHERE report_id = $1`, [
      reportId,
    ]);
    expect(Number(cits.n)).toBe(first!.citationsInserted);

    // every citation resolved to a real sources row; stats rows exist for them
    const [orphans] = await query(
      `SELECT count(*)::int AS n FROM source_citations sc
       LEFT JOIN sources s ON s.id = sc.source_id WHERE sc.report_id = $1 AND s.id IS NULL`,
      [reportId],
    );
    expect(Number(orphans.n)).toBe(0);
    const [stats] = await query(
      `SELECT count(*)::int AS n FROM source_theater_stats sts
       WHERE sts.theater = 'ir' AND sts.source_id IN
         (SELECT source_id FROM source_citations WHERE report_id = $1)`,
      [reportId],
    );
    expect(Number(stats.n)).toBeGreaterThan(0);

    // LEGAL: no stored citation field carries prose — cues stay ≤60 chars
    const stored = await query(
      `SELECT raw_url, hedging_cue FROM source_citations WHERE report_id = $1`,
      [reportId],
    );
    for (const row of stored) {
      expect(String(row.raw_url)).toMatch(/^https?:\/\//);
      if (row.hedging_cue !== null) expect(String(row.hedging_cue).length).toBeLessThanOrEqual(60);
    }

    // replay: same HTML again -> zero new citations, counts unchanged
    const second = await refreshReportCitations(query, reportId, FIXTURE_URL_REAL, "ir", html);
    expect(second!.citationsInserted).toBe(0);
    const [cits2] = await query(`SELECT count(*)::int AS n FROM source_citations WHERE report_id = $1`, [
      reportId,
    ]);
    expect(Number(cits2.n)).toBe(Number(cits.n));
  });

  it("a later parse failure keeps the parsed state and its citations intact", async () => {
    const broken = await refreshReportCitations(query, reportId, FIXTURE_URL_REAL, "ir", "<html><body>maintenance</body></html>");
    expect(broken!.action).toBe("kept_prior");
    const [report] = await query(`SELECT parse_status FROM isw_reports WHERE id = $1`, [reportId]);
    expect(report.parse_status).toBe("parsed");
    const [cits] = await query(`SELECT count(*)::int AS n FROM source_citations WHERE report_id = $1`, [
      reportId,
    ]);
    expect(Number(cits.n)).toBeGreaterThan(10);
  });
});

describe("partial-failure repair (citations committed, stats refresh failed)", () => {
  it("a conflict-only replay repairs aggregates for the complete resolved source set", async () => {
    // run 1: every statement goes through EXCEPT the stats upsert — the exact
    // committed-citations-then-infrastructure-failure sequence the never-throws
    // wrapper is designed to swallow. Each pool.query autocommits (no wrapping
    // transaction), so the citations are durable when the refresh dies.
    let failStats = true;
    const failingQuery = (sql: string, params?: unknown[]) => {
      if (failStats && sql.includes("INSERT INTO source_theater_stats")) {
        failStats = false;
        return Promise.reject(new Error("injected infrastructure failure"));
      }
      return query(sql, params);
    };
    const first = await refreshReportCitations(failingQuery, reportId2, FIXTURE_URL_REAL, "ir", html);
    expect(first).toBeNull(); // wrapper swallowed the failure — validation unaffected

    // citations committed and the report honestly parsed, but NO ir stats row
    // anywhere reflects this report's far-future date yet
    const [report] = await query(`SELECT parse_status FROM isw_reports WHERE id = $1`, [reportId2]);
    expect(report.parse_status).toBe("parsed");
    const [cits] = await query(
      `SELECT count(*)::int AS n, count(DISTINCT source_id)::int AS srcs
       FROM source_citations WHERE report_id = $1`,
      [reportId2],
    );
    expect(Number(cits.n)).toBeGreaterThan(10);
    const [stale] = await query(
      `SELECT count(*)::int AS n FROM source_theater_stats
       WHERE theater = 'ir' AND last_cited_report_date >= $1::date`,
      [SEED_DATE_2],
    );
    expect(Number(stale.n)).toBe(0);

    // run 2 (replay, healthy connection): every citation conflicts — zero
    // inserted — yet stats recompute for EVERY source this report cites
    const second = await refreshReportCitations(query, reportId2, FIXTURE_URL_REAL, "ir", html);
    expect(second).not.toBeNull();
    expect(second!.action).toBe("parsed");
    expect(second!.citationsInserted).toBe(0);
    expect(second!.statsRefreshed).toBe(Number(cits.srcs));

    const [cits2] = await query(`SELECT count(*)::int AS n FROM source_citations WHERE report_id = $1`, [
      reportId2,
    ]);
    expect(Number(cits2.n)).toBe(Number(cits.n)); // replay duplicated nothing

    // repair proof: every cited source's ir stats row AND global sources row
    // now carry this report's date as last_cited (it is the corpus maximum)
    const [unrepairedTheater] = await query(
      `SELECT count(*)::int AS n
       FROM (SELECT DISTINCT source_id FROM source_citations WHERE report_id = $1) rs
       LEFT JOIN source_theater_stats sts ON sts.source_id = rs.source_id AND sts.theater = 'ir'
       WHERE sts.last_cited_report_date IS DISTINCT FROM $2::date`,
      [reportId2, SEED_DATE_2],
    );
    expect(Number(unrepairedTheater.n)).toBe(0);
    const [unrepairedGlobal] = await query(
      `SELECT count(*)::int AS n
       FROM (SELECT DISTINCT source_id FROM source_citations WHERE report_id = $1) rs
       JOIN sources s ON s.id = rs.source_id
       WHERE s.last_cited_report_date IS DISTINCT FROM $2::date`,
      [reportId2, SEED_DATE_2],
    );
    expect(Number(unrepairedGlobal.n)).toBe(0);
  });
});
