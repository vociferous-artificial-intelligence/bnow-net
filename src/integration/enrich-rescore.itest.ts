import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCandidateQuery,
  buildRemainingQuery,
  candidatePredicate,
  selectionPredicate,
} from "@/lib/enrich/run";

// Real-Postgres coverage for the OpenSanctions selection predicate (the unit
// suite proves the SQL SHAPE; this proves the actual jsonb->>timestamptz and
// EXISTS behavior). The pure builders are executed against a disposable Neon
// branch:
//   (9)  normal mode selects only missing / stub-only rows;
//   (10) fixed-cutoff rescore selects stale/missing/stub rows, EXCLUDES rows
//        checked after the cutoff, and ADVANCES when a row is re-stamped;
//   (12) a malformed legacy checkedAt is selected (needs refresh) and never
//        raises a JSON-to-timestamptz cast error that aborts the batch;
//   (17) claim linkage is a PAID-SPEND boundary: every metadata variant below
//        exists as a linked/unlinked TWIN with identical kind + opensanctions
//        meta, so the only difference that can move a row in or out of the
//        candidate set is the claim_entities link.
//
// (17) is proven through the FULL production builders — buildCandidateQuery /
// buildRemainingQuery, not just candidatePredicate() — because the boundary lives
// in the builders' composition (selectionPredicate), and it is the builders whose
// rows feed the paid loop.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const CUTOFF = "2026-07-01T00:00:00Z";
// Any stamp later than CUTOFF: what a successful check writes (checkedAt = now).
const AFTER_CUTOFF = "2026-09-01T00:00:00.000Z";
// Larger than the whole eligible population (~1k rows in the prod fork), so a
// candidate query with this limit returns the complete set and can be compared
// against the remaining COUNT.
const BIG = 5000;

const NAME = (k: string, linked: boolean) =>
  `__itest_rescore_${k}_${linked ? "linked" : "unlinked"}__`;

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
const linkedIds: Record<string, number> = {};
const unlinkedIds: Record<string, number> = {};
const claimIds: number[] = [];
let multiId = 0; // linked to BOTH claims — must still appear exactly once
let docId = 0;

async function insertEntity(k: string, linked: boolean, os: unknown | null): Promise<number> {
  const meta = os === null ? {} : { opensanctions: os };
  const { rows } = await pool.query(
    `INSERT INTO entities (kind, name, meta) VALUES ('person', $1, $2::jsonb)
     ON CONFLICT (kind, name) DO UPDATE SET meta = EXCLUDED.meta
     RETURNING id`,
    [NAME(k, linked), JSON.stringify(meta)],
  );
  return rows[0].id as number;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });

  // A complete, traceable claim fixture: doc -> claims -> claim_sources, committed
  // in ONE transaction because claim_must_have_source is DEFERRABLE INITIALLY
  // DEFERRED and fires at COMMIT (traceability invariant, AGENTS.md ruling 2).
  const { rows: cty } = await pool.query(`SELECT id FROM countries WHERE iso2 = 'ua'`);
  const uaId = cty[0].id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const doc = await client.query(
      `INSERT INTO raw_documents (adapter, content, content_hash, country_iso2)
       VALUES ('manual', 'itest enrich claim-link fixture', '__itest_enrich_17_doc__', 'ua')
       RETURNING id`,
    );
    docId = doc.rows[0].id;
    for (const n of [1, 2]) {
      const claim = await client.query(
        `INSERT INTO claims (country_id, text) VALUES ($1, $2) RETURNING id`,
        [uaId, `__itest_enrich_17_claim_${n}__`],
      );
      claimIds.push(claim.rows[0].id);
      await client.query(`INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)`, [
        claim.rows[0].id,
        docId,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  for (const [k, os] of Object.entries(FIXTURES)) {
    linkedIds[k] = await insertEntity(k, true, os);
    unlinkedIds[k] = await insertEntity(k, false, os);
    await pool.query(
      `INSERT INTO claim_entities (claim_id, entity_id, role) VALUES ($1, $2, 'other')
       ON CONFLICT DO NOTHING`,
      [claimIds[0], linkedIds[k]],
    );
  }

  // multi: missing metadata, linked to TWO claims (duplicate-candidate probe)
  multiId = await insertEntity("multi", true, null);
  for (const cid of claimIds) {
    await pool.query(
      `INSERT INTO claim_entities (claim_id, entity_id, role) VALUES ($1, $2, 'other')
       ON CONFLICT DO NOTHING`,
      [cid, multiId],
    );
  }
});

afterAll(async () => {
  const all = [...Object.values(linkedIds), ...Object.values(unlinkedIds), multiId];
  // claim_entities first: entities.id has no ON DELETE CASCADE from claim_entities.
  await pool.query(`DELETE FROM claim_entities WHERE entity_id = ANY($1::int[])`, [all]);
  await pool.query(`DELETE FROM claims WHERE id = ANY($1::int[])`, [claimIds]); // cascades claim_sources
  await pool.query(`DELETE FROM raw_documents WHERE id = $1`, [docId]);
  await pool.query(`DELETE FROM entities WHERE id = ANY($1::int[])`, [all]);
  await pool.end();
});

/** Fixture keys selected by `pred`, restricted to the linked twins (isolated from
 *  prod-fork volume). Used for the metadata-only predicate tests. */
async function selectedLinked(pred: string, params: unknown[]): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT e.id FROM entities e WHERE e.id = ANY($1::int[]) AND ${pred}`,
    [Object.values(linkedIds), ...params],
  );
  const hit = new Set(rows.map((r) => r.id as number));
  return new Set(
    Object.entries(linkedIds)
      .filter(([, id]) => hit.has(id))
      .map(([k]) => k),
  );
}

/** Rows from the REAL candidate builder over the whole branch (BIG limit = the
 *  complete eligible set, so membership here is exactly what the paid loop sees). */
async function candidateRows(mode: "normal" | "rescore", before: string | null) {
  const q = buildCandidateQuery(mode, BIG, before);
  const { rows } = await pool.query(q.text, q.values);
  return rows as { id: number; mentions: number }[];
}

async function remainingCount(mode: "normal" | "rescore", before: string | null): Promise<number> {
  const q = buildRemainingQuery(mode, before);
  const { rows } = await pool.query(q.text, q.values);
  return rows[0].remaining as number;
}

describe("OpenSanctions candidate selection (live SQL)", () => {
  it("(9) normal metadata predicate matches only missing / stub-only rows", async () => {
    const got = await selectedLinked(candidatePredicate("normal", ""), []);
    expect(got).toEqual(new Set(["missing", "stub"]));
  });

  it("(10)+(12) rescore metadata predicate: stale/missing/stub/malformed, not fresh", async () => {
    const got = await selectedLinked(candidatePredicate("rescore", "$2"), [CUTOFF]);
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
    const before = await selectedLinked(selectionPredicate("rescore", "$2"), [CUTOFF]);
    expect(before.has("stale")).toBe(true);

    // simulate a successful rescore stamp (checkedAt = now, after the cutoff)
    await pool.query(
      `UPDATE entities SET meta = jsonb_set(meta, '{opensanctions,checkedAt}', to_jsonb($2::text))
       WHERE id = $1`,
      [linkedIds.stale, AFTER_CUTOFF],
    );

    const after = await selectedLinked(selectionPredicate("rescore", "$2"), [CUTOFF]);
    expect(after.has("stale")).toBe(false); // advanced past the cutoff
    // everything else still eligible (idempotent, resumable)
    expect(after.has("missing")).toBe(true);
    expect(after.has("malformed")).toBe(true);
  });

  it("(invariant) checkedAt == cutoff leaves the predicate (strict <)", async () => {
    // The route stamps checkedAt with the same instant it validated the cutoff
    // against, and the cutoff is <= that instant; the tightest case is
    // checkedAt == cutoff. Predicate is checkedAt < cutoff (strict), so the row
    // MUST leave — a freshly checked row is never re-billed under the same cutoff.
    await pool.query(
      `UPDATE entities SET meta = jsonb_set(meta, '{opensanctions,checkedAt}', to_jsonb($2::text))
       WHERE id = $1`,
      [linkedIds.staleSpace, CUTOFF],
    );
    const got = await selectedLinked(selectionPredicate("rescore", "$2"), [CUTOFF]);
    expect(got.has("staleSpace")).toBe(false);
  });
});

// (17) The paid-spend boundary, proven through the production builders.
describe("(17) claim-linked eligibility gates the paid loop", () => {
  it("normal mode returns linked missing/stub and EXCLUDES their unlinked twins", async () => {
    const ids = new Set((await candidateRows("normal", null)).map((r) => r.id));
    // linked twins: eligible
    expect(ids.has(linkedIds.missing)).toBe(true);
    expect(ids.has(linkedIds.stub)).toBe(true);
    // unlinked twins: identical kind + meta, zero claim links -> never billable
    expect(ids.has(unlinkedIds.missing)).toBe(false);
    expect(ids.has(unlinkedIds.stub)).toBe(false);
    // fresh non-stub metadata is out of normal mode regardless of linkage
    expect(ids.has(linkedIds.fresh)).toBe(false);
    expect(ids.has(unlinkedIds.fresh)).toBe(false);
  });

  it("rescore returns linked stale/missing/stub/malformed and EXCLUDES unlinked twins", async () => {
    const ids = new Set((await candidateRows("rescore", CUTOFF)).map((r) => r.id));
    for (const k of ["missing", "stub", "malformed", "emptyChecked", "nullChecked"]) {
      expect(ids.has(linkedIds[k]), `linked ${k} must be eligible`).toBe(true);
      expect(ids.has(unlinkedIds[k]), `unlinked ${k} must NOT be billable`).toBe(false);
    }
    // a linked FRESH row stays excluded — the cutoff still governs
    expect(ids.has(linkedIds.fresh)).toBe(false);
    // unlinked stale is metadata-eligible but has no claim link -> excluded
    expect(ids.has(unlinkedIds.stale)).toBe(false);
    expect(ids.has(unlinkedIds.staleSpace)).toBe(false);
  });

  it("an unlinked row is metadata-eligible yet absent from the candidate set", async () => {
    // Proves exclusion is caused by the LINK, not by the fixture being ineligible:
    // the same row matches the metadata predicate and is still never a candidate.
    const meta = await pool.query(
      `SELECT e.id FROM entities e WHERE e.id = $1 AND ${candidatePredicate("rescore", "$2")}`,
      [unlinkedIds.stale, CUTOFF],
    );
    expect(meta.rows).toHaveLength(1);
    const ids = new Set((await candidateRows("rescore", CUTOFF)).map((r) => r.id));
    expect(ids.has(unlinkedIds.stale)).toBe(false);
  });

  it("multiple claim links do not duplicate a candidate", async () => {
    const rows = await candidateRows("normal", null);
    const mine = rows.filter((r) => r.id === multiId);
    expect(mine).toHaveLength(1); // EXISTS + GROUP BY: one row, not one per link
    expect(mine[0].mentions).toBe(2); // ranking still counts BOTH links
  });

  it("remaining counts EXACTLY the claim-linked candidate population", async () => {
    for (const [mode, before] of [
      ["normal", null],
      ["rescore", CUTOFF],
    ] as const) {
      const rows = await candidateRows(mode, before);
      expect(rows.length, `${mode} population must fit under BIG`).toBeLessThan(BIG);
      // identical population => the completion signal cannot disagree with the loop
      expect(await remainingCount(mode, before), `${mode} remaining`).toBe(rows.length);
    }
  });

  // MUST RUN LAST: re-stamps every claim-linked eligible row on the DISPOSABLE
  // branch (a prod fork that the runner deletes), which invalidates the fixtures
  // above.
  it("remaining reaches zero once linked rows are re-stamped, though unlinked eligible rows remain", async () => {
    expect(await remainingCount("rescore", CUTOFF)).toBeGreaterThan(0);

    // what a completed paid pass would leave behind: checked, non-stub, stamped
    // after the fixed cutoff
    const stamped = await pool.query(
      `UPDATE entities AS e
          SET meta = jsonb_set(coalesce(e.meta,'{}'::jsonb), '{opensanctions}', $2::jsonb)
        WHERE ${selectionPredicate("rescore", "$1")}`,
      [
        CUTOFF,
        JSON.stringify({ stub: false, matched: false, sanctioned: false, checkedAt: AFTER_CUTOFF }),
      ],
    );
    expect(stamped.rowCount).toBeGreaterThan(0);

    expect(await remainingCount("rescore", CUTOFF)).toBe(0);
    expect(await remainingCount("normal", null)).toBe(0);

    // ...while unlinked rows that WOULD have been billed are still sitting there,
    // untouched and unpaid. This is the whole point of #17.
    const leftover = await pool.query(
      `SELECT count(*)::int AS n FROM entities e
        WHERE ${candidatePredicate("rescore", "$1")}
          AND NOT EXISTS (SELECT 1 FROM claim_entities ce WHERE ce.entity_id = e.id)`,
      [CUTOFF],
    );
    expect(leftover.rows[0].n).toBeGreaterThan(0);
  });
});
