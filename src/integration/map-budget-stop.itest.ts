import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the 2026-08-15 budget-stop contract, exercised through
// the REAL runMapCycle against a disposable Neon branch with the guard forced
// into refusal by seeded provider_usage + a tiny cap env. Because the refusal
// happens at tryReserve(), the cycle runs end-to-end with ZERO paid calls and
// zero OpenAI traffic (the key is blanked defensively anyway):
//   - LLM-needing docs stay processed=false (retried once the cap is fixed);
//   - dedup mirrors and no-applicable-track docs still reach their final
//     disposition (their verdicts cost nothing);
//   - counts carry the machine-readable stop classification;
//   - no doc_map_state rows and no new provider_usage appear.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
process.env.OPENAI_API_KEY = ""; // belt and braces: a leaked call would 401, not bill

const { runMapCycle } = await import("@/lib/analysis/map-worker");

// A FAR-FUTURE day: the integration branch is a fork of production, so any real
// date would select thousands of genuine backlog docs into the cycle. Only the
// seeded docs carry this published_at.
const DAY = "2027-06-15";
const MARK = "itest-map-budget-stop";
// Iran military lexicon hits ("missile", "strike", ...) -> the military track
// applies; the two LLM-needing docs are deliberately DISSIMILAR so the minhash
// near-dupe gate (threshold 0.7) cannot collapse one into the other.
const MILITARY_TEXT_A =
  "Reports describe a missile strike and drone intercepts near the southern coast overnight; batteries repositioned. " +
  MARK;
const MILITARY_TEXT_B =
  "Naval escorts resumed after an explosion damaged a tanker; officials blamed an airstrike and promised an inquiry into air defense readiness across the gulf shipping lanes. " +
  MARK;
const OFFTOPIC_TEXT =
  "A community bakery festival with folk music and a pottery fair drew large crowds downtown this weekend. " + MARK;

let pool: Pool;
const seededIds: number[] = [];

async function seedDoc(externalId: string, content: string): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO raw_documents (adapter, external_id, url, title, content, content_hash, lang, country_iso2, published_at, processed)
     VALUES ('rss', $1, $2, $3, $4, md5($1 || $4), 'en', 'ir', $5, false) RETURNING id`,
    [externalId, `https://example.test/${externalId}`, `itest ${externalId}`, content, `${DAY}T10:00:00Z`],
  );
  seededIds.push(rows[0].id);
  return rows[0].id;
}

const SAVED = {
  MAP_SPRINT_USD_CAP: process.env.MAP_SPRINT_USD_CAP,
  LLM_SPRINT_USD_CAP: process.env.LLM_SPRINT_USD_CAP,
  MAP_USD_CAP_DAILY: process.env.MAP_USD_CAP_DAILY,
  LLM_DISABLE: process.env.LLM_DISABLE,
};

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await pool.query(`DELETE FROM raw_documents WHERE content LIKE '%' || $1`, [MARK]);
  await pool.query(`DELETE FROM provider_usage WHERE provider = 'openai_map' AND day = '2001-01-01'`);
});

afterAll(async () => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (seededIds.length) {
    await pool.query(`DELETE FROM doc_claims WHERE raw_document_id = ANY($1)`, [seededIds]);
    await pool.query(`DELETE FROM doc_map_state WHERE raw_document_id = ANY($1)`, [seededIds]);
    await pool.query(`DELETE FROM doc_dedup WHERE raw_document_id = ANY($1) OR canonical_doc_id = ANY($1)`, [
      seededIds,
    ]);
  }
  await pool.query(`DELETE FROM raw_documents WHERE content LIKE '%' || $1`, [MARK]);
  await pool.query(`DELETE FROM provider_usage WHERE provider = 'openai_map' AND day = '2001-01-01'`);
  await pool.end();
});

describe("budget-stopped map cycle (total cap)", () => {
  it("classifies the stop, spends nothing, and never marks LLM-needing docs processed", async () => {
    // historical spend >= the all-time cap -> total_usd refusal before any call
    await pool.query(
      `INSERT INTO provider_usage (provider, day, requests, units, est_usd)
       VALUES ('openai_map', '2001-01-01', 1, 1, 1.0)
       ON CONFLICT (provider, day) DO UPDATE SET est_usd = 1.0`,
    );
    process.env.MAP_SPRINT_USD_CAP = "0.5";
    process.env.LLM_SPRINT_USD_CAP = "0.5";
    process.env.MAP_USD_CAP_DAILY = "4";
    delete process.env.LLM_DISABLE;

    const needsLlmA = await seedDoc("need-a", MILITARY_TEXT_A);
    const needsLlmB = await seedDoc("need-b", MILITARY_TEXT_B);
    // exact duplicate of A -> dedup mirror (never sent to the LLM)
    const mirror = await seedDoc("mirror-of-a", MILITARY_TEXT_A);
    const zeroTrack = await seedDoc("zero-track", OFFTOPIC_TEXT);

    const usageBefore = await pool.query(
      `SELECT coalesce(sum(est_usd),0)::float AS usd, coalesce(sum(requests),0)::int AS req
       FROM provider_usage WHERE provider = 'openai_map'`,
    );

    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, docCap: 500 }, counts);

    // machine-readable classification, zero LLM traffic
    expect(String(counts.budgetStop)).toContain("total spend");
    expect(counts.budgetStopCode).toBe("total_usd");
    expect(counts.budgetStopCategory).toBe("total_cap");
    expect(counts.llmCalls ?? 0).toBe(0);
    expect(counts.llmRequests ?? 0).toBe(0);

    // LLM-needing docs remain unprocessed (retryable once the cap is fixed)
    const { rows: pending } = await pool.query(
      `SELECT id, processed FROM raw_documents WHERE id = ANY($1) ORDER BY id`,
      [[needsLlmA, needsLlmB]],
    );
    expect(pending.map((r) => r.processed)).toEqual([false, false]);

    // free verdicts still land: the mirror is recorded + marked, the
    // no-applicable-track doc reaches its final disposition
    const { rows: mirrorRows } = await pool.query(
      `SELECT rd.processed, dd.canonical_doc_id, dd.method FROM raw_documents rd
       LEFT JOIN doc_dedup dd ON dd.raw_document_id = rd.id WHERE rd.id = $1`,
      [mirror],
    );
    expect(mirrorRows[0].processed).toBe(true);
    expect(mirrorRows[0].canonical_doc_id).toBe(needsLlmA);
    const { rows: ztRows } = await pool.query(`SELECT processed FROM raw_documents WHERE id = $1`, [zeroTrack]);
    expect(ztRows[0].processed).toBe(true);

    // no doc_map_state rows for any seeded doc, and the ledger did not move
    const { rows: stateRows } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_map_state WHERE raw_document_id = ANY($1)`,
      [seededIds],
    );
    expect(stateRows[0].n).toBe(0);
    const usageAfter = await pool.query(
      `SELECT coalesce(sum(est_usd),0)::float AS usd, coalesce(sum(requests),0)::int AS req
       FROM provider_usage WHERE provider = 'openai_map'`,
    );
    expect(usageAfter.rows[0]).toEqual(usageBefore.rows[0]);
  });

  it("a rerun after the cap is raised re-selects exactly the still-pending docs", async () => {
    // raise the cap but disable the LLM: selection/dedup runs, extraction is
    // refused by the typed kill-switch BEFORE any network call — proving the
    // stopped docs are still selectable without spending anything here
    process.env.MAP_SPRINT_USD_CAP = "100";
    process.env.LLM_DISABLE = "1";
    const counts: Record<string, unknown> = {};
    await expect(runMapCycle({ theaters: ["ir"], date: DAY, docCap: 500 }, counts)).rejects.toThrow(
      /LLM_DISABLE/,
    );
    expect(Number(counts.selected)).toBe(2); // exactly the two pending LLM docs
  });
});
