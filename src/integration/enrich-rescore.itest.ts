import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCandidateQuery,
  buildRemainingQuery,
  candidatePredicate,
} from "@/lib/enrich/run";

// Real-Postgres coverage for the OpenSanctions selection predicate (the unit
// suite proves the SQL SHAPE; this proves the actual jsonb->>timestamptz
// behavior). The pure builders are executed against a disposable Neon branch:
//   (9)  normal mode selects only missing / stub-only rows;
//   (10) fixed-cutoff rescore selects stale/missing/stub rows, EXCLUDES rows
//        checked after the cutoff, and ADVANCES when a row is re-stamped;
//   (12) a malformed legacy checkedAt is selected (needs refresh) and never
//        raises a JSON-to-timestamptz cast error that aborts the batch.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const CUTOFF = "2026-07-01T00:00:00Z";
const NAME = (k: string) => `__itest_rescore_${k}__`;

// name -> opensanctions meta (or null for "no opensanctions key at all")
const FIXTURES: Record<string, unknown | null> = {
  missing: null,
  stub: { stub: true, matched: false, checkedAt: "2026-08-01T00:00:00.000Z" }, // stub even if "fresh"
  fresh: { stub: false, matched: true, checkedAt: "2026-08-02T00:00:00.000Z" }, // after cutoff
  stale: { stub: false, matched: false, checkedAt: "2026-06-15T00:00:00.000Z" }, // before cutoff
  staleSpace: { stub: false, matched: false, checkedAt: "2026-06-15 12:00:00+00" }, // legacy space fmt
  malformed: { stub: false, matched: false, checkedAt: "not-a-date" }, // (12)
  emptyChecked: { stub: false, matched: false, checkedAt: "" },
  nullChecked: { stub: false, matched: false }, // opensanctions present, no checkedAt
};

let pool: Pool;
const ids: Record<string, number> = {};

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  for (const [k, os] of Object.entries(FIXTURES)) {
    const meta = os === null ? {} : { opensanctions: os };
    const { rows } = await pool.query(
      `INSERT INTO entities (kind, name, meta) VALUES ('person', $1, $2::jsonb)
       ON CONFLICT (kind, name) DO UPDATE SET meta = EXCLUDED.meta
       RETURNING id`,
      [NAME(k), JSON.stringify(meta)],
    );
    ids[k] = rows[0].id;
  }
});

afterAll(async () => {
  await pool.query(`DELETE FROM entities WHERE id = ANY($1::int[])`, [Object.values(ids)]);
  await pool.end();
});

/** Ids among the fixtures selected by `pred` (isolated from prod-fork volume). */
async function selected(pred: string, params: unknown[]): Promise<Set<string>> {
  const idList = Object.values(ids);
  const { rows } = await pool.query(
    `SELECT e.id FROM entities e WHERE e.id = ANY($1::int[]) AND ${pred}`,
    [idList, ...params],
  );
  const hit = new Set(rows.map((r) => r.id as number));
  return new Set(Object.entries(ids).filter(([, id]) => hit.has(id)).map(([k]) => k));
}

describe("OpenSanctions candidate selection (live SQL)", () => {
  it("(9) normal mode selects only missing / stub-only rows", async () => {
    // params: id array is $1, predicate has no before param
    const got = await selected(candidatePredicate("normal", ""), []);
    expect(got).toEqual(new Set(["missing", "stub"]));
  });

  it("(10)+(12) rescore selects stale/missing/stub/malformed, excludes fresh", async () => {
    // predicate before = $2 (id array is $1)
    const got = await selected(candidatePredicate("rescore", "$2"), [CUTOFF]);
    expect(got.has("fresh")).toBe(false); // checked AFTER the cutoff
    expect(got.has("stale")).toBe(true);
    expect(got.has("staleSpace")).toBe(true); // legacy space-format timestamp casts fine
    expect(got.has("missing")).toBe(true);
    expect(got.has("stub")).toBe(true);
    expect(got.has("malformed")).toBe(true); // (12) needs-refresh, no cast crash
    expect(got.has("emptyChecked")).toBe(true);
    expect(got.has("nullChecked")).toBe(true);
  });

  it("(10) advances: a re-stamped row leaves the selection under the same cutoff", async () => {
    const before = await selected(candidatePredicate("rescore", "$2"), [CUTOFF]);
    expect(before.has("stale")).toBe(true);

    // simulate a successful rescore stamp (checkedAt = now, after the cutoff)
    await pool.query(
      `UPDATE entities SET meta = jsonb_set(meta, '{opensanctions,checkedAt}', '"2026-09-01T00:00:00.000Z"'::jsonb)
       WHERE id = $1`,
      [ids.stale],
    );

    const after = await selected(candidatePredicate("rescore", "$2"), [CUTOFF]);
    expect(after.has("stale")).toBe(false); // advanced past the cutoff
    // everything else still eligible (idempotent, resumable)
    expect(after.has("missing")).toBe(true);
    expect(after.has("malformed")).toBe(true);
  });

  it("the full production builders execute without error against real Postgres", async () => {
    // exercises the CASE + ORDER BY + LIMIT and the COUNT, catching any SQL
    // syntax regression (membership is covered above; volume is prod-fork).
    const cand = buildCandidateQuery("rescore", 5, CUTOFF);
    const candRows = await pool.query(cand.text, cand.values);
    expect(Array.isArray(candRows.rows)).toBe(true);

    const rem = buildRemainingQuery("rescore", CUTOFF);
    const remRows = await pool.query(rem.text, rem.values);
    expect(typeof remRows.rows[0].remaining).toBe("number");

    const remNormal = buildRemainingQuery("normal", null);
    const remNormalRows = await pool.query(remNormal.text, remNormal.values);
    expect(typeof remNormalRows.rows[0].remaining).toBe("number");
  });
});
