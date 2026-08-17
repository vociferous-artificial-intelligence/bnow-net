import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of remap mode (OPEN-TASKS #33) through the REAL
// runMapCycle against a disposable Neon branch, with the OpenAI client MOCKED
// at the shared factory seam — canned strict-JSON responses, usage stamped, so
// metering/spend paths run for real with ZERO provider traffic and zero paid
// calls. Proven here:
//   - eligibility: superseded-version docs are re-selected; current-version
//     final no-claims dispositions are NOT retried; mirrors and
//     never-dispositioned (processed=false, no doc_map_state) docs are
//     excluded entirely;
//   - append-only history: old extractor-version rows survive a remap intact
//     (rollback = revert the version; consumers filter per map-versions.ts);
//   - resume: completed (doc, track, current_version) pairs are skipped —
//     doc_map_state itself is the no-rebill checkpoint;
//   - lease safety: a held lease makes remap skip with zero writes; a lease
//     LOST between the billed response and persistence discards the parsed
//     results AFTER metering (provider_usage moved, map state did not);
//   - budget stops leave unprocessed targets eligible;
//   - dry remap runs write nothing at all (no lease row included).

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
process.env.OPENAI_API_KEY = ""; // the client is mocked; a leak would 401, not bill

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@/lib/analysis/openai-client", () => ({
  analysisOpenAiClient: () => ({ chat: { completions: { create: mockCreate } } }),
}));

const { runMapCycle } = await import("@/lib/analysis/map-worker");
const { MAP_LEASE_PROVIDER, memoryMapLeaseDriver, pgMapLeaseDriver } = await import(
  "@/lib/analysis/map-lease"
);
const { mapExtractorVersion } = await import("@/lib/analysis/map-prompts");

// canned response: one claim per docId echoed from the batch actually sent
mockCreate.mockImplementation(async (req: { messages: Array<{ content: string }> }) => {
  const user = req.messages[1].content;
  const ids = /in this order: ([0-9, ]+)/.exec(user)![1].split(", ").map(Number);
  return {
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            results: ids.map((docId) => ({
              docId,
              claims: [
                {
                  text_en: `Remapped claim for doc ${docId}`,
                  quote_orig: null,
                  claim_type: "factual",
                  hedging: "claimed",
                  entities: [],
                  event_hint: null,
                },
              ],
            })),
          }),
        },
      },
    ],
    usage: { prompt_tokens: 500, completion_tokens: 100 },
  };
});

// FAR-FUTURE day: the branch is a production fork — a real date would select
// genuine backlog into the cycle. Only seeded docs carry this published_at.
const DAY = "2027-07-15";
const MARK = "itest-map-remap";
const SUPERSEDED_VERSION = "gpt-4o-mini/itest-superseded-0000";
const CURRENT = mapExtractorVersion("military", "ir");

const militaryText = (tag: string) =>
  `Reports describe a missile strike near the ${tag} port and drone intercepts over shipping lanes; air defense batteries repositioned overnight. ${MARK}`;

let pool: Pool;
const seededIds: number[] = [];

async function seedDoc(externalId: string, content: string, processed: boolean): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO raw_documents (adapter, external_id, url, title, content, content_hash, lang, country_iso2, published_at, processed)
     VALUES ('rss', $1, $2, $3, $4, md5($1 || $4), 'en', 'ir', $5, $6) RETURNING id`,
    [externalId, `https://example.test/${externalId}`, `itest ${externalId}`, content, `${DAY}T10:00:00Z`, processed],
  );
  seededIds.push(rows[0].id);
  return rows[0].id;
}

async function seedState(docId: number, version: string, claimCount: number): Promise<void> {
  await pool.query(
    `INSERT INTO doc_map_state (raw_document_id, track, extractor_version, claim_count)
     VALUES ($1, 'military', $2, $3)`,
    [docId, version, claimCount],
  );
  if (claimCount > 0) {
    for (let i = 0; i < claimCount; i++) {
      await pool.query(
        `INSERT INTO doc_claims (raw_document_id, track, extractor_version, ordinal, text_en, claim_type, hedging, entities, claim_date)
         VALUES ($1, 'military', $2, $3, $4, 'factual', 'claimed', '[]', $5)`,
        [docId, version, i, `Old-version claim ${i} (${MARK})`, DAY],
      );
    }
  }
}

const SAVED = {
  MAP_SPRINT_USD_CAP: process.env.MAP_SPRINT_USD_CAP,
  LLM_SPRINT_USD_CAP: process.env.LLM_SPRINT_USD_CAP,
  MAP_USD_CAP_DAILY: process.env.MAP_USD_CAP_DAILY,
  LLM_DISABLE: process.env.LLM_DISABLE,
};

async function cleanSeeded(): Promise<void> {
  await pool.query(
    `DELETE FROM doc_claims WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content LIKE '%' || $1)`,
    [MARK],
  );
  await pool.query(
    `DELETE FROM doc_map_state WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content LIKE '%' || $1)`,
    [MARK],
  );
  await pool.query(
    `DELETE FROM doc_dedup WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content LIKE '%' || $1)
       OR canonical_doc_id IN (SELECT id FROM raw_documents WHERE content LIKE '%' || $1)`,
    [MARK],
  );
  await pool.query(`DELETE FROM raw_documents WHERE content LIKE '%' || $1`, [MARK]);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await cleanSeeded();
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [MAP_LEASE_PROVIDER]);
  process.env.MAP_SPRINT_USD_CAP = "100";
  process.env.LLM_SPRINT_USD_CAP = "100";
  process.env.MAP_USD_CAP_DAILY = "50";
  delete process.env.LLM_DISABLE;
});

afterAll(async () => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await cleanSeeded();
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [MAP_LEASE_PROVIDER]);
  await pool.end();
});

describe("remap eligibility + append-only history + resume", () => {
  it("remaps superseded docs, skips current no-claims dispositions, excludes mirrors and untouched docs", async () => {
    const superseded = await seedDoc("re-superseded", militaryText("eastern"), true);
    await seedState(superseded, SUPERSEDED_VERSION, 2);
    const currentNoClaims = await seedDoc("re-current-empty", militaryText("western"), true);
    await seedState(currentNoClaims, CURRENT, 0);
    const canonicalForMirror = await seedDoc("re-mirror-canonical", militaryText("southern"), true);
    await seedState(canonicalForMirror, CURRENT, 1); // seeds the claim row too
    const mirror = await seedDoc("re-mirror", militaryText("southern-mirror"), true);
    await pool.query(
      `INSERT INTO doc_dedup (raw_document_id, canonical_doc_id, method, score) VALUES ($1, $2, 'exact', 1)`,
      [mirror, canonicalForMirror],
    );
    const untouched = await seedDoc("re-untouched", militaryText("northern"), false);

    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, docCap: 500 }, counts);

    // selection: superseded + currentNoClaims + canonicalForMirror (all
    // canonical + dispositioned); mirror and untouched are excluded
    expect(Number(counts.selected)).toBe(3);
    expect(Number(counts.docTrackPairs)).toBe(1); // only the superseded doc needs work
    expect(Number(counts.claims)).toBe(1);
    expect(Number(counts.maxSelectedId)).toBeGreaterThanOrEqual(canonicalForMirror);
    expect((counts.lease as Record<string, unknown>).released).toBe(1);

    // the new current-version rows exist for the superseded doc
    const { rows: newRows } = await pool.query(
      `SELECT text_en FROM doc_claims WHERE raw_document_id = $1 AND extractor_version = $2`,
      [superseded, CURRENT],
    );
    expect(newRows.map((r) => r.text_en)).toEqual([`Remapped claim for doc ${superseded}`]);
    const { rows: newState } = await pool.query(
      `SELECT claim_count FROM doc_map_state WHERE raw_document_id = $1 AND extractor_version = $2`,
      [superseded, CURRENT],
    );
    expect(newState).toHaveLength(1);
    expect(newState[0].claim_count).toBe(1);

    // append-only: the superseded rows survive byte-for-byte in count
    const { rows: oldRows } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_claims WHERE raw_document_id = $1 AND extractor_version = $2`,
      [superseded, SUPERSEDED_VERSION],
    );
    expect(oldRows[0].n).toBe(2);
    const { rows: oldState } = await pool.query(
      `SELECT claim_count FROM doc_map_state WHERE raw_document_id = $1 AND extractor_version = $2`,
      [superseded, SUPERSEDED_VERSION],
    );
    expect(oldState[0].claim_count).toBe(2);

    // no-claims current disposition was treated as COMPLETED, not retried
    const { rows: emptyDoc } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_claims WHERE raw_document_id = $1`,
      [currentNoClaims],
    );
    expect(emptyDoc[0].n).toBe(0);

    // nothing was written for the mirror or the untouched doc; processed intact
    const { rows: flags } = await pool.query(
      `SELECT id, processed FROM raw_documents WHERE id = ANY($1) ORDER BY id`,
      [[mirror, untouched]],
    );
    expect(flags.find((r) => r.id === mirror)!.processed).toBe(true);
    expect(flags.find((r) => r.id === untouched)!.processed).toBe(false);
    const { rows: mirrorState } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_map_state WHERE raw_document_id = ANY($1)`,
      [[mirror, untouched]],
    );
    expect(mirrorState[0].n).toBe(0);
  });

  it("a rerun selects the same population but finds ZERO pairs — completed work is never redispatched", async () => {
    mockCreate.mockClear();
    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, docCap: 500 }, counts);
    expect(Number(counts.selected)).toBe(3);
    expect(Number(counts.docTrackPairs)).toBe(0);
    expect(Number(counts.llmCalls ?? 0)).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("the afterId cursor excludes already-scanned docs", async () => {
    const counts: Record<string, unknown> = {};
    const highWater = Math.max(...seededIds);
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, afterId: highWater, docCap: 500 }, counts);
    expect(Number(counts.selected)).toBe(0);
    expect(Number(counts.maxSelectedId)).toBe(highWater); // echoed back unchanged
  });
});

describe("lease safety", () => {
  it("a held lease makes remap skip with zero writes and zero dispatches", async () => {
    mockCreate.mockClear();
    expect(await pgMapLeaseDriver.tryAcquire("itest-holder", "tok-hold", 60_000)).not.toBeNull();
    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, docCap: 500 }, counts);
    expect(String(counts.skipped)).toContain("lease");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await pgMapLeaseDriver.release("tok-hold")).toBe(true);
  });

  it("a lease lost after the billed response is METERED then DISCARDED — no map state mutates", async () => {
    mockCreate.mockClear();
    const target = await seedDoc("re-lost-lease", militaryText("gulf"), true);
    await seedState(target, SUPERSEDED_VERSION, 1);

    // acquires fine, but every renewal reports the lease lost
    const lost = memoryMapLeaseDriver(() => 0);
    const lostDriver: typeof lost = {
      ...lost,
      renew: async () => false,
    };

    const usageBefore = await pool.query(
      `SELECT coalesce(sum(est_usd),0)::float AS usd, coalesce(sum(requests),0)::int AS req
       FROM provider_usage WHERE provider = 'openai_map'`,
    );
    const counts: Record<string, unknown> = {};
    await runMapCycle(
      { theaters: ["ir"], date: DAY, remap: true, docCap: 500, leaseDriver: lostDriver },
      counts,
    );

    // the physical call happened and was metered (billed-before-discarded)
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const usageAfter = await pool.query(
      `SELECT coalesce(sum(est_usd),0)::float AS usd, coalesce(sum(requests),0)::int AS req
       FROM provider_usage WHERE provider = 'openai_map'`,
    );
    expect(usageAfter.rows[0].req).toBe(usageBefore.rows[0].req + 1);
    expect(usageAfter.rows[0].usd).toBeGreaterThan(usageBefore.rows[0].usd);
    expect(Number(counts.leaseLostDiscards)).toBe(1);
    expect((counts.lease as Record<string, unknown>).lost).toBe(1);

    // but NOTHING mutated map state: the doc stays eligible for the new holder
    const { rows: state } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_map_state WHERE raw_document_id = $1 AND extractor_version = $2`,
      [target, CURRENT],
    );
    expect(state[0].n).toBe(0);
    const { rows: claims } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_claims WHERE raw_document_id = $1 AND extractor_version = $2`,
      [target, CURRENT],
    );
    expect(claims[0].n).toBe(0);

    // eligible again on a healthy rerun
    mockCreate.mockClear();
    const counts2: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, docCap: 500 }, counts2);
    expect(Number(counts2.docTrackPairs)).toBe(1);
    expect(Number(counts2.claims)).toBe(1);
  });
});

describe("budget stop during remap", () => {
  it("stops without marking unprocessed targets complete", async () => {
    mockCreate.mockClear();
    const target = await seedDoc("re-budget-stop", militaryText("strait"), true);
    await seedState(target, SUPERSEDED_VERSION, 1);
    // historical spend >= the all-time cap -> refusal before any call
    await pool.query(
      `INSERT INTO provider_usage (provider, day, requests, units, est_usd)
       VALUES ('openai_map', '2001-01-02', 1, 1, 1000.0)
       ON CONFLICT (provider, day) DO UPDATE SET est_usd = 1000.0`,
    );
    process.env.MAP_SPRINT_USD_CAP = "0.5";

    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, docCap: 500 }, counts);
    expect(counts.budgetStopCategory).toBe("total_cap");
    expect(mockCreate).not.toHaveBeenCalled();
    const { rows: state } = await pool.query(
      `SELECT count(*)::int AS n FROM doc_map_state WHERE raw_document_id = $1 AND extractor_version = $2`,
      [target, CURRENT],
    );
    expect(state[0].n).toBe(0); // still eligible once the cap is fixed

    process.env.MAP_SPRINT_USD_CAP = "100";
    await pool.query(`DELETE FROM provider_usage WHERE provider = 'openai_map' AND day = '2001-01-02'`);
  });
});

describe("dry remap runs", () => {
  it("write nothing — the lease row included — and report the estimate identity", async () => {
    mockCreate.mockClear();
    const before = await pool.query(
      `SELECT (SELECT count(*)::int FROM doc_claims) AS dc,
              (SELECT count(*)::int FROM doc_map_state) AS dms,
              (SELECT coalesce(jsonb_agg(state || jsonb_build_object('u', updated_at::text)), '[]'::jsonb)
                 FROM provider_state WHERE provider = $1) AS lease`,
      [MAP_LEASE_PROVIDER],
    );
    const counts: Record<string, unknown> = {};
    await runMapCycle({ theaters: ["ir"], date: DAY, remap: true, docCap: 500, dryRun: true }, counts);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(counts.estModel).toBe("gpt-4o-mini");
    expect(counts.remapVersions).toBeDefined();
    const after = await pool.query(
      `SELECT (SELECT count(*)::int FROM doc_claims) AS dc,
              (SELECT count(*)::int FROM doc_map_state) AS dms,
              (SELECT coalesce(jsonb_agg(state || jsonb_build_object('u', updated_at::text)), '[]'::jsonb)
                 FROM provider_state WHERE provider = $1) AS lease`,
      [MAP_LEASE_PROVIDER],
    );
    expect(after.rows[0]).toEqual(before.rows[0]); // dry runs touch NOTHING, lease state included
  });
});
