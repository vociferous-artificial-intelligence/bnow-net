import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests against a disposable Neon branch (scripts/test-integration.sh).
// Covers the invariants that unit tests can't: the claim->source constraint trigger
// fires at COMMIT; generateDigest persists a fully-traceable digest in one
// transaction; stub-marked docs never surface; scoreDigest works end-to-end on the
// saved ISW fixture.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
// generateDigest and friends read DATABASE_URL; point them at the branch, never prod
process.env.DATABASE_URL = URL;
process.env.ANALYSIS_PROVIDER = "stub";

const TEST_DATE = "2030-01-01"; // far future: guaranteed empty corpus on the fork

let pool: Pool;
let uaId: number;

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  const { rows } = await pool.query(`SELECT id FROM countries WHERE iso2 = 'ua'`);
  uaId = rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

describe("claim->source traceability trigger", () => {
  it("rejects a claim with no source link at COMMIT", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO claims (country_id, text, claim_date) VALUES ($1, 'orphan claim', $2)`,
        [uaId, TEST_DATE],
      );
      await expect(client.query("COMMIT")).rejects.toThrow(/no source documents/);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("accepts a claim linked to a document in the same transaction", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const doc = await client.query(
        `INSERT INTO raw_documents (adapter, content, content_hash, country_iso2)
         VALUES ('manual', 'itest doc', 'itest-hash-' || now()::text, 'ua') RETURNING id`,
      );
      const claim = await client.query(
        `INSERT INTO claims (country_id, text, claim_date) VALUES ($1, 'sourced claim', $2) RETURNING id`,
        [uaId, TEST_DATE],
      );
      await client.query(
        `INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)`,
        [claim.rows[0].id, doc.rows[0].id],
      );
      await client.query("COMMIT"); // must not throw
      // cleanup so later tests see a clean slate
      await client.query(`DELETE FROM claims WHERE id = $1`, [claim.rows[0].id]);
      await client.query(`DELETE FROM raw_documents WHERE id = $1`, [doc.rows[0].id]);
    } finally {
      client.release();
    }
  });
});

describe("generateDigest end-to-end (stub provider, seeded corpus)", () => {
  const seededIds: number[] = [];
  let stubDocId: number;

  beforeAll(async () => {
    const docs = [
      {
        title: "Russian forces struck Kharkiv with drones overnight",
        content:
          "Russian forces launched a drone strike on Kharkiv overnight, hitting energy infrastructure. Air defense intercepted several Shahed drones over the city.",
      },
      {
        title: "Drone strike on Kharkiv energy grid reported",
        content:
          "A missile and drone attack struck Kharkiv, damaging the energy grid. Officials reported air defense engaged Shahed drones over Kharkiv.",
      },
      {
        title: "Ukrainian forces advance near Kupyansk",
        content:
          "Ukrainian forces advanced near Kupyansk and captured new positions after an assault on the eastern bank.",
      },
    ];
    for (const d of docs) {
      const res = await pool.query(
        `INSERT INTO raw_documents (adapter, title, content, content_hash, country_iso2, published_at)
         VALUES ('manual', $1, $2, md5($2), 'ua', $3) RETURNING id`,
        [d.title, d.content, `${TEST_DATE}T10:00:00Z`],
      );
      seededIds.push(res.rows[0].id);
    }
    // a stub-marked doc in the same window MUST be excluded from the corpus
    const stub = await pool.query(
      `INSERT INTO raw_documents (adapter, title, content, content_hash, country_iso2, published_at)
       VALUES ('telegram_mtproto', 'stub doc',
               '[STUB FIXTURE] Russian forces struck Kharkiv — fixture content that must never surface',
               'itest-stub-hash', 'ua', $1) RETURNING id`,
      [`${TEST_DATE}T11:00:00Z`],
    );
    stubDocId = stub.rows[0].id;
  });

  it("persists a traceable digest and never cites stub-marked docs", async () => {
    const { generateDigest } = await import("../lib/analysis/digest");
    const result = await generateDigest("ua", TEST_DATE, "military");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("stub");
    expect(result!.claims).toBeGreaterThan(0);
    // corpus guard: only the 3 real docs were analyzable
    expect(result!.docsAnalyzed).toBeLessThanOrEqual(3);

    // every claim of this digest has >=1 source (traceability invariant, via SQL)
    const { rows: orphanRows } = await pool.query(
      `SELECT count(*)::int AS n FROM claims cl
       WHERE cl.digest_id = $1
         AND NOT EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.claim_id = cl.id)`,
      [result!.digestId],
    );
    expect(orphanRows[0].n).toBe(0);

    // the [STUB FIXTURE] doc is cited nowhere
    const { rows: stubCites } = await pool.query(
      `SELECT count(*)::int AS n FROM claim_sources WHERE raw_document_id = $1`,
      [stubDocId],
    );
    expect(stubCites[0].n).toBe(0);

    // and no claim text carries the marker
    const { rows: markedClaims } = await pool.query(
      `SELECT count(*)::int AS n FROM claims WHERE digest_id = $1 AND text LIKE '%STUB FIXTURE%'`,
      [result!.digestId],
    );
    expect(markedClaims[0].n).toBe(0);
  });

  it("regeneration is idempotent (upsert, no claim duplication)", async () => {
    const { generateDigest } = await import("../lib/analysis/digest");
    const first = await generateDigest("ua", TEST_DATE, "military");
    const again = await generateDigest("ua", TEST_DATE, "military");
    expect(again!.digestId).toBe(first!.digestId);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM claims WHERE digest_id = $1`,
      [again!.digestId],
    );
    expect(rows[0].n).toBe(again!.claims);
  });
});

describe("scoreDigest end-to-end on the saved ISW fixture", () => {
  it("parses the fixture and scores a synthetic digest against it", async () => {
    const { parseReport } = await import("../lib/isw/parse");
    const { extractTakeaways } = await import("../lib/validation/isw-extract");
    const { scoreDigest } = await import("../lib/validation/score");

    const html = readFileSync(join(process.cwd(), "fixtures", "isw", "roca-2026-06-30.html"), "utf8");
    const report = parseReport("https://example.org/fixture", html);
    expect(report.citations.length).toBeGreaterThan(50); // endnotes parsed

    const takeaways = extractTakeaways(html);
    expect(takeaways.length).toBeGreaterThanOrEqual(3); // key takeaways extracted

    const score = scoreDigest(
      takeaways,
      [
        { claimId: 1, text: "Russian forces advanced near Kupyansk", hedging: "claimed", docCount: 2, earliestDocAt: "2026-06-30T08:00:00Z" },
        { claimId: 2, text: "Drone strike hit Kharkiv energy infrastructure", hedging: "claimed", docCount: 1, earliestDocAt: "2026-06-30T09:00:00Z" },
      ],
      new Date("2026-06-30T23:00:00Z"),
    );
    expect(score.coveragePct).not.toBeNull();
    expect(score.coveragePct!).toBeGreaterThanOrEqual(0);
    expect(score.coveragePct!).toBeLessThanOrEqual(100);
    expect(Array.isArray(score.divergences)).toBe(true);
    expect(score.details.iswTakeaways).toBe(takeaways.length);
  });
});
