import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Read-only schema/query smoke for the analyst evidence projections. Unit tests
// mock database wrappers and therefore cannot catch a renamed/mistyped live
// column; this runs only on the disposable Neon branch created by the integration
// runner.
const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: URL });
});

afterAll(async () => {
  await pool.end();
});

describe("analyst evidence query projections", () => {
  it("loads the digest projection with separate publication and ingestion timestamps", async () => {
    const ids = await pool.query(
      `SELECT d.id
       FROM digests d
       WHERE EXISTS (SELECT 1 FROM claims cl WHERE cl.digest_id = d.id)
       ORDER BY d.digest_date DESC, d.id DESC
       LIMIT 2`,
    );
    expect(ids.rows.length).toBeGreaterThan(0);

    const result = await pool.query(
      `SELECT cl.digest_id, cl.id AS claim_id, ev.id AS event_id, ev.title AS event_title,
              ev.type AS event_type, ev.summary AS event_summary,
              cl.text, cl.hedging, cl.confidence,
              rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
              s.id AS source_id, s.name AS source_name, s.canonical_url AS source_key,
              s.domain AS source_domain, s.reliability_score AS reliability,
              s.platform AS source_platform,
              rd.published_at::text AS published_at,
              rd.fetched_at::text AS fetched_at
       FROM claims cl
       JOIN events ev ON ev.id = cl.event_id
       JOIN claim_sources cs ON cs.claim_id = cl.id
       JOIN raw_documents rd ON rd.id = cs.raw_document_id
       LEFT JOIN sources s ON s.id = rd.source_id
       WHERE cl.digest_id = ANY($1::int[])
       ORDER BY ev.id, cl.id, rd.id`,
      [ids.rows.map((row) => row.id)],
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty("published_at");
    expect(result.rows[0]).toHaveProperty("fetched_at");
    expect(result.rows[0]).toHaveProperty("source_name");
    expect(result.rows[0]).toHaveProperty("source_domain");
    expect(result.rows[0].fetched_at).toBeTruthy();
  });

  it("loads one bulk claim projection used by Search, Ask, Signals, and entity timelines", async () => {
    const ids = await pool.query(
      `SELECT cl.id
       FROM claims cl
       WHERE cl.digest_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.claim_id = cl.id)
       ORDER BY cl.id DESC
       LIMIT 3`,
    );
    expect(ids.rows.length).toBeGreaterThan(0);

    const result = await pool.query(
      `SELECT cl.id AS claim_id, cl.text, cl.hedging,
              cl.claim_date::text AS claim_date,
              c.iso2 AS country_iso2, c.name AS country_name,
              dg.digest_date::text AS digest_date,
              rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
              s.id AS source_id, s.name AS source_name, s.canonical_url AS source_key,
              s.domain AS source_domain, s.platform::text AS source_platform,
              s.reliability_score AS reliability,
              rd.published_at::text AS published_at,
              rd.fetched_at::text AS fetched_at
       FROM claims cl
       JOIN countries c ON c.id = cl.country_id
       LEFT JOIN digests dg ON dg.id = cl.digest_id
       JOIN claim_sources cs ON cs.claim_id = cl.id
       JOIN raw_documents rd ON rd.id = cs.raw_document_id
       LEFT JOIN sources s ON s.id = rd.source_id
       WHERE cl.id = ANY($1::int[])
       ORDER BY cl.id, rd.id`,
      [ids.rows.map((row) => row.id)],
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(ids.rows.length);
    for (const row of result.rows) {
      expect(row.digest_date).toBeTruthy();
      expect(row.country_iso2).toMatch(/^[a-z]{2}$/);
      expect(row.fetched_at).toBeTruthy();
      expect(Object.hasOwn(row, "published_at")).toBe(true);
      expect(Object.hasOwn(row, "source_name")).toBe(true);
    }
  });
});
