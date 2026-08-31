import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the steady-mode flood bounds (2026-08-31 incident)
// through the REAL runMapCycle against a disposable Neon branch: a backlog
// spanning many distinct days is drained oldest-days-first under the span cap
// while the fresh window keeps flowing, the dedup reference window stays
// day-bounded (counts.refRows), a near-duplicate pair STRADDLING the old/fresh
// partition still collapses through the one shared gate, and documents outside
// both windows are left untouched — no verdict, no processed mark — until a
// later invocation's window reaches them. The OpenAI client is mocked at the
// shared factory seam (zero paid calls); the lease is the in-memory driver.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
process.env.OPENAI_API_KEY = ""; // client mocked; a leak would 401, not bill

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@/lib/analysis/openai-client", () => ({
  analysisOpenAiClient: () => ({ chat: { completions: { create: mockCreate } } }),
}));

const { runMapCycle, shiftDay } = await import("@/lib/analysis/map-worker");
const { MAP_LEASE_PROVIDER, memoryMapLeaseDriver } = await import("@/lib/analysis/map-lease");

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
                  text_en: `Flood-bounds claim for doc ${docId}`,
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

const MARK = "itest-map-flood";

// Fixture-margin notes: distinct `tag` variants across adjacent days measure
// text2k jaccard ~0.50-0.69 — below the gate's 0.7 minhash threshold, and
// minhash is deterministic (fixed FNV seeds), so non-twin docs reliably stay
// canonical; keep tags multi-token-distinct when editing. Day seeds derive
// from the DB-clock `today` resolved once in beforeAll — a UTC midnight
// rollover mid-test could shift the fresh window by one day (accepted flake
// window of ~1 minute/day; re-run on failure at 00:00Z).
const militaryText = (tag: string) =>
  `Reports describe a missile strike near the ${tag} port and drone intercepts over shipping lanes; air defense batteries repositioned overnight. ${MARK}`;

let pool: Pool;
let today = ""; // DB-clock UTC day, resolved in beforeAll

async function seedDoc(externalId: string, day: string, content: string): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO raw_documents (adapter, external_id, url, title, content, content_hash, lang, country_iso2, published_at, processed)
     VALUES ('rss', $1, $2, $3, $4, md5($1 || $4), 'en', 'ir', $5, false) RETURNING id`,
    [externalId, `https://example.test/${externalId}`, `itest ${externalId}`, content, `${day}T10:00:00Z`],
  );
  return rows[0].id as number;
}

async function docState(id: number): Promise<{ processed: boolean; mapRows: number; dedupRows: number }> {
  const { rows } = await pool.query(
    `SELECT rd.processed,
            (SELECT count(*)::int FROM doc_map_state s WHERE s.raw_document_id = rd.id) AS map_rows,
            (SELECT count(*)::int FROM doc_dedup dd WHERE dd.raw_document_id = rd.id) AS dedup_rows
       FROM raw_documents rd WHERE rd.id = $1`,
    [id],
  );
  return { processed: rows[0].processed, mapRows: rows[0].map_rows, dedupRows: rows[0].dedup_rows };
}

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

const SAVED = {
  MAP_SPRINT_USD_CAP: process.env.MAP_SPRINT_USD_CAP,
  LLM_SPRINT_USD_CAP: process.env.LLM_SPRINT_USD_CAP,
  MAP_USD_CAP_DAILY: process.env.MAP_USD_CAP_DAILY,
  LLM_DISABLE: process.env.LLM_DISABLE,
};

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await cleanSeeded();
  await pool.query(`DELETE FROM provider_state WHERE provider = $1`, [MAP_LEASE_PROVIDER]);
  // The branch is a production fork carrying REAL unprocessed backlog; steady
  // mode has no date scoping, so neutralize the genuine ir backlog (fork-local,
  // disposable) — only this test's seeded docs stay eligible.
  await pool.query(`UPDATE raw_documents SET processed = true WHERE country_iso2 = 'ir' AND processed = false`);
  const { rows } = await pool.query(`SELECT (now() at time zone 'utc')::date::text AS d`);
  today = String(rows[0].d);
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

describe("steady-mode flood bounds end-to-end (real Postgres, mocked provider)", () => {
  it("drains a multi-week backlog oldest-days-first with a bounded reference window, keeps fresh input flowing, collapses a partition-straddling near-dupe, and leaves out-of-window docs untouched", async () => {
    const twinText = militaryText("shared-event-twin");
    // flood: three old days inside the span cap + a partition-straddling twin
    // (old at today-2, its identical fresh twin at today-1) + one fresh doc
    const d1 = await seedDoc("fb-old-a", shiftDay(today, -4), militaryText("alpha"));
    const d2 = await seedDoc("fb-old-b", shiftDay(today, -3), militaryText("bravo"));
    const aOld = await seedDoc("fb-twin-old", shiftDay(today, -2), twinText);
    const aFresh = await seedDoc("fb-twin-fresh", shiftDay(today, -1), twinText);
    const dFresh = await seedDoc("fb-fresh", today, militaryText("charlie"));

    const counts = await runMapCycle({
      theaters: ["ir"],
      docCap: 10,
      leaseDriver: memoryMapLeaseDriver(),
    });

    // the split engaged and both segments made progress in ONE invocation
    expect(counts.floodGuard).toEqual({ oldDays: 3, selectedOld: 3, selectedFresh: 2 });
    expect(counts.selected).toBe(5);
    // the reference window is day-bounded (±1 of five candidate days), not the
    // whole-history BETWEEN — on a real production fork an unbounded window
    // would be six figures
    expect(Number(counts.refRows)).toBeGreaterThan(0);
    expect(Number(counts.refRows)).toBeLessThan(50_000);

    // partition-straddling near-dupe collapsed through the one shared gate:
    // the fresh twin mirrors the old one (adjacent days, same theater) via the
    // exact-md5 arm, and is dispositioned WITHOUT any map/claim rows
    expect(counts.mirrors).toBe(1);
    expect(counts.mirrorsExact).toBe(1);
    const twin = await docState(aFresh);
    expect(twin).toEqual({ processed: true, mapRows: 0, dedupRows: 1 });
    const { rows: dedupRow } = await pool.query(
      `SELECT canonical_doc_id, method FROM doc_dedup WHERE raw_document_id = $1`,
      [aFresh],
    );
    expect(dedupRow[0]).toEqual({ canonical_doc_id: aOld, method: "exact" });

    // every selected canonical doc reached its genuine disposition
    for (const id of [d1, d2, aOld, dFresh]) {
      expect(await docState(id)).toEqual({ processed: true, mapRows: 1, dedupRows: 0 });
    }

    // ---- forward progress across invocations --------------------------------
    // a second, older cohort spanning FOUR distinct days: one run takes the
    // three oldest, the fourth day is untouched (no verdict, no mark), and the
    // following run's window reaches it
    const e1 = await seedDoc("fb-hist-a", shiftDay(today, -20), militaryText("delta"));
    const e2 = await seedDoc("fb-hist-b", shiftDay(today, -19), militaryText("echo"));
    const e3 = await seedDoc("fb-hist-c", shiftDay(today, -18), militaryText("foxtrot"));
    const e4 = await seedDoc("fb-hist-d", shiftDay(today, -17), militaryText("golf"));

    const run2 = await runMapCycle({
      theaters: ["ir"],
      docCap: 10,
      leaseDriver: memoryMapLeaseDriver(),
    });
    expect(run2.floodGuard).toEqual({ oldDays: 3, selectedOld: 3, selectedFresh: 0 });
    for (const id of [e1, e2, e3]) {
      expect(await docState(id)).toEqual({ processed: true, mapRows: 1, dedupRows: 0 });
    }
    // out-of-window doc: untouched, still eligible — nothing lost, nothing faked
    expect(await docState(e4)).toEqual({ processed: false, mapRows: 0, dedupRows: 0 });

    const run3 = await runMapCycle({
      theaters: ["ir"],
      docCap: 10,
      leaseDriver: memoryMapLeaseDriver(),
    });
    // one remaining distinct day -> ordinary (non-flood) path drains it
    expect(run3.floodGuard).toBeUndefined();
    expect(run3.selected).toBe(1);
    expect(await docState(e4)).toEqual({ processed: true, mapRows: 1, dedupRows: 0 });
  });

  it("a candidate exact-mirrors a FETCHED processed reference with identical content under a different title (revived exact arm, real SQL alias)", async () => {
    // The reference's title differs enough that text2k jaccard sits below the
    // 0.7 minhash threshold (measured ~0.66 — a thin but deterministic margin;
    // keep the titles strongly distinct if editing) — under the historical
    // snake_case md5
    // alias (contentMd5 undefined on reference rows) NEITHER arm would match
    // and the candidate would stay canonical, so this scenario fails if the
    // `AS "contentMd5"` alias is ever reverted.
    const sharedBody = militaryText("identical-body-for-exact-arm");
    const refDay = shiftDay(today, -1);
    const { rows } = await pool.query(
      `INSERT INTO raw_documents (adapter, external_id, url, title, content, content_hash, lang, country_iso2, published_at, processed)
       VALUES ('rss', $1, $2, $3, $4, md5($1 || $4), 'en', 'ir', $5, true) RETURNING id`,
      [
        "fb-exact-ref",
        "https://example.test/fb-exact-ref",
        "Entirely different headline about port logistics and customs paperwork backlog figures",
        sharedBody,
        `${refDay}T09:00:00Z`,
      ],
    );
    const refId = rows[0].id as number;
    const candId = await seedDoc("fb-exact-cand", today, sharedBody); // title "itest fb-exact-cand"

    const counts = await runMapCycle({
      theaters: ["ir"],
      docCap: 10,
      leaseDriver: memoryMapLeaseDriver(),
    });
    expect(counts.mirrorsExact).toBe(1);
    const { rows: verdict } = await pool.query(
      `SELECT canonical_doc_id, method FROM doc_dedup WHERE raw_document_id = $1`,
      [candId],
    );
    expect(verdict[0]).toEqual({ canonical_doc_id: refId, method: "exact" });
    expect(await docState(candId)).toEqual({ processed: true, mapRows: 0, dedupRows: 1 });
    // clean the extra processed reference (cleanSeeded keys on MARK content)
  });

  it("date-scoped backfill mode is unchanged: selects exactly its day with a 3-day reference window", async () => {
    const day = shiftDay(today, -40);
    const b1 = await seedDoc("fb-backfill-a", day, militaryText("hotel"));
    await seedDoc("fb-backfill-off-day", shiftDay(today, -39), militaryText("india"));
    const counts = await runMapCycle({
      theaters: ["ir"],
      date: day,
      docCap: 10,
      leaseDriver: memoryMapLeaseDriver(),
    });
    expect(counts.selected).toBe(1); // only the requested day
    expect(counts.floodGuard).toBeUndefined();
    expect(await docState(b1)).toEqual({ processed: true, mapRows: 1, dedupRows: 0 });
    // drain the leftover so the fork branch ends tidy for later tests
    await runMapCycle({ theaters: ["ir"], docCap: 10, leaseDriver: memoryMapLeaseDriver() });
  });
});
