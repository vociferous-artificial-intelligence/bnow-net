import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

// ---------------------------------------------------------------------------
// #102 overflow paths against the REAL MAP_REF_ROW_CAP (step 21 / O3).
//
// The three paths the incident fix added — adaptive shedding, the hard-cap
// refusal, and the shed-exhaustion refusal — were unit-pinned only; the
// original itest covered drain/mirror/backfill and never crossed the cap.
// They are driven here at production scale with NO test-only seam and NO env
// override: one reference-mass seed on a single old day M, plus candidate days
// chosen relative to M, is enough to reach all three, because the shed loop
// drops the NEWEST old day and dedupRefDays is exactly +/-1 per candidate day.
// Which days carry the candidates therefore decides which path is reached:
//
//   candidates on M-3,M-2,M-1 + today  -> flood; refDays include M (over cap);
//                                         shedding M-1 drops M out -> proceed
//   candidates on M+1,M+2              -> 2 distinct days, NON-flood, so
//                                         freshCutoff is null and NOTHING can
//                                         shed -> hard-cap refusal
//   candidates on M+1..M+4 (no fresh)  -> flood; the mass on M survives every
//                                         shed -> exhaustion refusal
//
// M = today-12 keeps M-4 = today-16 comfortably inside MAP_EPOCH.

describe("dedup reference-window overflow against the real 75,000-row cap", () => {
  // The mass is a single server-side INSERT ... SELECT generate_series: 75,100
  // processed ir rows on ONE day, each with content far too short (and far too
  // uniform) to be a candidate or a dedup match, so its ONLY effect is on
  // countRefs(). Cleaned by primary-key range, which is index-driven — the
  // MARK-suffixed content also makes the file's cleanSeeded() a backstop.
  const MASS_ROWS = 75_100;
  const MASS_PREFIX = "fb-refmass-";
  const CAND_PREFIX = "fbrc-";
  let M = ""; // the reference-mass day
  let massFromId = 0;
  let massToId = 0;
  let massSeedMs = 0;
  let refsWithoutM = 0;

  const refCountOn = async (days: string[]): Promise<number> => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM raw_documents rd
        WHERE rd.processed = true AND rd.country_iso2 = 'ir'
          AND COALESCE(rd.published_at, rd.fetched_at)::date = ANY($1::date[])
          AND NOT EXISTS (SELECT 1 FROM doc_dedup dd WHERE dd.raw_document_id = rd.id)`,
      [days],
    );
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    M = shiftDay(today, -12);
    // Earlier describes leave their drained docs processed=true; re-neutralize
    // so each scenario below starts from an empty candidate set (fork-local).
    await pool.query(
      `UPDATE raw_documents SET processed = true WHERE country_iso2 = 'ir' AND processed = false`,
    );
    const before = await pool.query(`SELECT COALESCE(max(id), 0)::int AS id FROM raw_documents`);
    massFromId = Number(before.rows[0].id);
    const t0 = Date.now();
    await pool.query(
      `INSERT INTO raw_documents
         (adapter, external_id, url, title, content, content_hash, lang, country_iso2, published_at, processed)
       SELECT 'rss', $1 || g::text, 'https://example.test/' || $1 || g::text, NULL,
              'refmass ' || $2, md5($1 || g::text), 'en', 'ir', ($3 || 'T10:00:00Z')::timestamptz, true
         FROM generate_series(1, $4::int) g`,
      [MASS_PREFIX, MARK, M, MASS_ROWS],
    );
    massSeedMs = Date.now() - t0;
    const after = await pool.query(`SELECT COALESCE(max(id), 0)::int AS id FROM raw_documents`);
    massToId = Number(after.rows[0].id);

    // The proof only means what it says if the mass is what crosses the cap:
    // the post-shed window (M absent) must be UNDER the cap on the fork's own
    // data, and the window containing M must be over it.
    // dedupRefDays([M-3, M-2, today]) — the window the shed loop lands on:
    // M-1 is still IN it (it is M-2's +1 neighbour); only M itself drops out.
    refsWithoutM = await refCountOn([
      shiftDay(M, -4), shiftDay(M, -3), shiftDay(M, -2), shiftDay(M, -1),
      shiftDay(today, -1), today, shiftDay(today, 1),
    ]);
    expect(refsWithoutM).toBeLessThan(75_000);
    expect(await refCountOn([M])).toBeGreaterThan(75_000);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM raw_documents WHERE id > $1 AND id <= $2 AND external_id LIKE $3`,
      [massFromId, massToId, `${MASS_PREFIX}%`],
    );
  });

  // Each scenario seeds its own candidate days; the refusals deliberately leave
  // their documents processed=false, so they must not leak into the next one.
  afterEach(async () => {
    for (const table of ["doc_claims", "doc_map_state"]) {
      await pool.query(
        `DELETE FROM ${table} WHERE raw_document_id IN
           (SELECT id FROM raw_documents WHERE external_id LIKE $1)`,
        [`${CAND_PREFIX}%`],
      );
    }
    await pool.query(
      `DELETE FROM doc_dedup WHERE raw_document_id IN
         (SELECT id FROM raw_documents WHERE external_id LIKE $1)
         OR canonical_doc_id IN (SELECT id FROM raw_documents WHERE external_id LIKE $1)`,
      [`${CAND_PREFIX}%`],
    );
    await pool.query(`DELETE FROM raw_documents WHERE external_id LIKE $1`, [`${CAND_PREFIX}%`]);
  });

  it("sheds the NEWEST old day and proceeds instead of refusing hourly (adaptive shedding, real cap)", async () => {
    mockCreate.mockClear();
    // M-3, M-2, M-1 are old (< the fresh cutoff) and `today` is fresh: four
    // distinct days engage the flood split, and M-1's +/-1 window is what pulls
    // the mass day M into the reference set.
    const cOld3 = await seedDoc(`${CAND_PREFIX}old3`, shiftDay(M, -3), militaryText("juliet"));
    const cOld2 = await seedDoc(`${CAND_PREFIX}old2`, shiftDay(M, -2), militaryText("kilo"));
    const cShed = await seedDoc(`${CAND_PREFIX}shed`, shiftDay(M, -1), militaryText("lima"));
    const cFresh = await seedDoc(`${CAND_PREFIX}fresh`, today, militaryText("mike"));

    const counts = await runMapCycle({
      theaters: ["ir"],
      docCap: 10,
      leaseDriver: memoryMapLeaseDriver(),
    });

    // exactly one old day shed, carrying exactly one candidate with it
    expect(counts.refShedDays).toBe(1);
    expect(counts.refShedCandidates).toBe(1);
    // counts.selected still reports the PHYSICAL selection (four docs); the
    // shed candidate is simply not gated, mapped or marked this run
    expect(counts.selected).toBe(4);
    expect(counts.floodGuard).toEqual({ oldDays: 3, selectedOld: 3, selectedFresh: 1 });
    // the recount landed under the real cap — and on the fork's own data, which
    // is what makes 75,000 a measured boundary here rather than a mocked one
    expect(Number(counts.refRows)).toBeLessThanOrEqual(75_000);
    expect(Number(counts.refRows)).toBe(refsWithoutM);

    // the run PROCEEDED: the three surviving candidates reached a disposition
    for (const id of [cOld3, cOld2, cFresh]) {
      expect(await docState(id)).toEqual({ processed: true, mapRows: 1, dedupRows: 0 });
    }
    // the shed candidate keeps the out-of-window contract: no verdict, no mark,
    // still eligible for a later run
    expect(await docState(cShed)).toEqual({ processed: false, mapRows: 0, dedupRows: 0 });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("refuses BEFORE materialization when nothing can shed, marking nothing and dispatching nothing", async () => {
    mockCreate.mockClear();
    // two distinct days is within MAP_STEADY_SPAN_DAYS, so the non-flood path
    // runs and freshCutoff is null — the shed loop is unreachable by
    // construction, exactly the single-window/backfill terminal the cap exists
    // for. Both days' +/-1 windows contain the mass day M.
    const a = await seedDoc(`${CAND_PREFIX}cap-a`, shiftDay(M, 1), militaryText("november"));
    const b = await seedDoc(`${CAND_PREFIX}cap-b`, shiftDay(M, 2), militaryText("oscar"));

    await expect(
      runMapCycle({ theaters: ["ir"], docCap: 10, leaseDriver: memoryMapLeaseDriver() }),
    ).rejects.toThrow(/reference rows over \d+ days exceed the 75000-row cap — refusing before materialization/);

    // nothing marked, no verdict fabricated for the unexamined set, and the
    // refusal is genuinely BEFORE dispatch — $0 by control flow, not by policy
    for (const id of [a, b]) {
      expect(await docState(id)).toEqual({ processed: false, mapRows: 0, dedupRows: 0 });
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses loudly when shedding exhausts every candidate day with an empty fresh segment", async () => {
    mockCreate.mockClear();
    // four distinct days, ALL older than the fresh cutoff: the split engages,
    // the fresh segment is empty, and the mass day M sits one day BELOW the
    // oldest candidate — so it survives every shed and the loop runs out of
    // days. Without the third-round guard this shape completes ok=true having
    // dispositioned nothing, silently, every hour.
    const ids = [
      await seedDoc(`${CAND_PREFIX}ex-1`, shiftDay(M, 1), militaryText("papa")),
      await seedDoc(`${CAND_PREFIX}ex-2`, shiftDay(M, 2), militaryText("quebec")),
      await seedDoc(`${CAND_PREFIX}ex-3`, shiftDay(M, 3), militaryText("romeo")),
      await seedDoc(`${CAND_PREFIX}ex-4`, shiftDay(M, 4), militaryText("sierra")),
    ];

    await expect(
      runMapCycle({ theaters: ["ir"], docCap: 10, leaseDriver: memoryMapLeaseDriver() }),
    ).rejects.toThrow(/shedding exhausted every candidate day \(3 old days, empty fresh segment\)/);

    for (const id of ids) {
      expect(await docState(id)).toEqual({ processed: false, mapRows: 0, dedupRows: 0 });
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("records the seed cost so the proof's scale is auditable", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM raw_documents WHERE external_id LIKE $1`,
      [`${MASS_PREFIX}%`],
    );
    expect(Number(rows[0].n)).toBe(MASS_ROWS);
    console.log(
      `[#102 proof] reference mass ${MASS_ROWS} rows on ${M} seeded in ${massSeedMs}ms; ` +
        `post-shed reference window = ${refsWithoutM} rows (cap 75000)`,
    );
  });
});
