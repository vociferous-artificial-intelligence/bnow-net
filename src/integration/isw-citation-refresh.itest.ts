import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the Workstream C citation auto-refresh: a pending
// isw_reports row + the real 2026-07-24 Iran Update fixture HTML produce
// sources / source_citations / source_theater_stats rows through the SAME
// loader the validation hook uses; a replay inserts nothing (unique keys); a
// parse failure never downgrades the parsed row. Zero network, zero LLM.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { refreshReportCitations } = await import("@/lib/isw/load");

const FIXTURE_URL_REAL =
  "https://understandingwar.org/research/middle-east/iran-update-special-report-july-24-2026/";
// a synthetic slug + FAR-FUTURE date: the branch is a fork of production, so a
// real url/date would collide with genuine rows via the two unique indexes
const SEED_URL = "https://understandingwar.org/research/middle-east/iran-update-itest-refresh/";
const SEED_DATE = "2027-06-20";
const html = readFileSync(join(process.cwd(), "fixtures/isw/iran-update-2026-07-24.html"), "utf8");

let pool: Pool;
let reportId: number;
const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

beforeAll(async () => {
  pool = new Pool({ connectionString: URL_ENV });
  await pool.query(`DELETE FROM source_citations WHERE report_id IN (SELECT id FROM isw_reports WHERE url = $1)`, [
    SEED_URL,
  ]);
  await pool.query(`DELETE FROM isw_reports WHERE url = $1`, [SEED_URL]);
  const { rows } = await pool.query(
    `INSERT INTO isw_reports (url, theater, report_date, fetched_at, parse_status)
     VALUES ($1, 'ir', $2, now(), 'pending') RETURNING id`,
    [SEED_URL, SEED_DATE],
  );
  reportId = rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM source_citations WHERE report_id = $1`, [reportId]);
  await pool.query(`DELETE FROM isw_reports WHERE id = $1`, [reportId]);
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
