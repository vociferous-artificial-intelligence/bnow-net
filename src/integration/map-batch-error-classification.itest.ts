import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// End-to-end proof of the #87 batch-error classification WIRING through the
// REAL runMapCycle: a dispatch that fails at transport level must land in
// counts as batchErrors > 0 + a fixed-vocabulary batchErrorClasses + the
// degraded marker. This kills the review-identified mutant (deleting the
// cycle-side tally or the finalizeBatchErrors call passes every unit test —
// they exercise the exported functions, not the wiring).
//
// Zero paid traffic and zero external traffic: OPENAI_BASE_URL points at an
// unroutable local port, so the SDK's request fails with a connection error
// before leaving the machine. The guard reserves normally (generous caps), so
// the failure takes the per-batch catch path — exactly the #87 signature.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const DAY = "2027-07-20"; // far-future: only our seeded docs match the cycle window
const MARK = "itest-map-batch-error-classification";
const VOCABULARY = ["invalid_body", "rate_limit", "server_error", "transport", "persist", "other"];

const MILITARY_TEXT =
  "Reports describe a missile strike and drone intercepts near the southern coast overnight; batteries repositioned. " +
  MARK;

const { runMapCycle } = await import("@/lib/analysis/map-worker");

let pool: Pool;
const seededIds: number[] = [];

const SAVED = {
  MAP_SPRINT_USD_CAP: process.env.MAP_SPRINT_USD_CAP,
  LLM_SPRINT_USD_CAP: process.env.LLM_SPRINT_USD_CAP,
  MAP_USD_CAP_DAILY: process.env.MAP_USD_CAP_DAILY,
  LLM_DISABLE: process.env.LLM_DISABLE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
};

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await pool.query(`DELETE FROM raw_documents WHERE content LIKE '%' || $1`, [MARK]);
  const { rows } = await pool.query(
    `INSERT INTO raw_documents (adapter, external_id, url, title, content, content_hash, lang, country_iso2, published_at, processed)
     VALUES ('rss', $1, $2, $3, $4, md5($1 || $4), 'en', 'ir', $5, false) RETURNING id`,
    [
      "batch-error-doc",
      "https://example.test/batch-error-doc",
      "itest batch error doc",
      MILITARY_TEXT,
      `${DAY}T10:00:00Z`,
    ],
  );
  seededIds.push(rows[0].id);
});

afterAll(async () => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (seededIds.length) {
    await pool.query(`DELETE FROM doc_claims WHERE raw_document_id = ANY($1)`, [seededIds]);
    await pool.query(`DELETE FROM doc_map_state WHERE raw_document_id = ANY($1)`, [seededIds]);
    await pool.query(
      `DELETE FROM doc_dedup WHERE raw_document_id = ANY($1) OR canonical_doc_id = ANY($1)`,
      [seededIds],
    );
  }
  await pool.query(`DELETE FROM raw_documents WHERE content LIKE '%' || $1`, [MARK]);
  await pool.end();
});

describe("map batch-error classification wiring (#87, real cycle)", () => {
  it("a transport-failed batch lands as batchErrors + fixed-vocabulary classes + degraded", async () => {
    process.env.MAP_SPRINT_USD_CAP = "40";
    process.env.LLM_SPRINT_USD_CAP = "40";
    process.env.MAP_USD_CAP_DAILY = "40";
    delete process.env.LLM_DISABLE;
    process.env.OPENAI_API_KEY = "sk-itest-never-used";
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:9"; // unroutable — fails pre-egress

    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, docCap: 50 }, counts);

    expect(Number(counts.batchErrors)).toBeGreaterThan(0);
    const classes = counts.batchErrorClasses as Record<string, number>;
    expect(classes).toBeDefined();
    expect(Object.keys(classes).length).toBeGreaterThan(0);
    for (const key of Object.keys(classes)) {
      expect(VOCABULARY).toContain(key); // content-safe: never raw message text
    }
    expect(counts.degraded).toMatchObject({ category: "batch_errors" });
    expect((counts.degraded as Record<string, unknown>).batchErrors).toBe(counts.batchErrors);
    // the failed docs stay eligible for the next cycle
    const doc = await pool.query(`SELECT processed FROM raw_documents WHERE id = $1`, [seededIds[0]]);
    expect(doc.rows[0].processed).toBe(false);
  }, 120_000);
});
