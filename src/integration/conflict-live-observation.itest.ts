import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// End-to-end proof of the live observation pipeline (PLAN-WS-3 §3.3b) against
// real Postgres on a throwaway Neon fork: a seeded edition row and real seeded
// claims go in through the DB-backed evidence sources, and ONE observation row
// comes out, on the keyword rung, with no reference prose anywhere in it.
//
// What only a real database can prove here:
//   * the observation actually INSERTS — the store's projection, its NOT NULL
//     stamps, its CHECK constraints and the FK to benchmark_report_editions all
//     hold against the deployed DDL, not against a mock;
//   * APPEND-ONLY under a second cron run: two rows, the first byte-identical;
//   * the partial unique key refuses a duplicate (conflict, edition, run);
//   * `validation_runs` and `isw_reports` are untouched — the production
//     validation path and the public scoreboard are not on this code path.
//
// The page is INJECTED (no network) and the environment is blanked: the paid
// rung is unreachable, and the run asserts it made zero provider calls.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;
// belt and braces: nothing in this test may reach a provider
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
delete process.env.CONFLICT_MATCH_USD_CAP_DAILY;

const { runMigrations } = await import("../../scripts/migrations-lib");
const { DbCorpusRecallClaimSource, DbPublishedRetentionClaimSource } = await import(
  "@/lib/conflicts/db-claim-sources"
);
const { CONFLICT_REGISTRY, CONFLICT_REGISTRY_VERSION } = await import(
  "@/lib/conflicts/definitions"
);
const { observeConflictDay } = await import("@/lib/conflicts/live-observation");
const { SqlReferenceReportRepository } = await import("@/lib/conflicts/reference-repo-sql");
const { latestObservationsFor } = await import("@/lib/conflicts/observation-store");
const { UNIT_FLAGS_VERSION } = await import("@/lib/conflicts/unit-flags");
const { mapExtractorVersion } = await import("@/lib/analysis/map-prompts");

const RU_UA = CONFLICT_REGISTRY.russia_ukraine;
const TAG = "ZZITESTWS33OBS";
const ITEST_JOB = "itest:conflict-live-observation";
// FAR-FUTURE: the fork is a copy of production, so a real report date could
// collide with a genuine discovered edition
const REPORT_DATE = "2027-06-24";
const CLAIM_DAY = "2027-06-23";
const EDITION_KEY = `roca:${REPORT_DATE}:daily`;
const CANONICAL_URL =
  "https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-june-24-2027/";
const SENTINEL = "SENTINELTAKEAWAYPROSE";

const PAGE_HTML = `<html><body>
<h2>Key Takeaways</h2>
<ul>
  <li>${SENTINEL} Russian forces advanced near Kupiansk in Kharkiv Oblast on June 23.</li>
  <li>Officials commented on procedural matters of no territorial consequence.</li>
</ul>
</body></html>`;

let pool: Pool;
const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

let editionId = 0;
let runOne = 0;
let runTwo = 0;
let frozenBaseline: Record<string, number>;

async function frozenCounts(): Promise<Record<string, number>> {
  const [row] = await query(
    `SELECT (SELECT count(*) FROM validation_runs)::int AS validations,
            (SELECT count(*) FROM isw_reports)::int AS reports,
            (SELECT count(*) FROM source_citations)::int AS citations`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

async function observationRows(): Promise<Array<Record<string, unknown>>> {
  return query(
    `SELECT * FROM conflict_validation_observations
      WHERE reference_edition_id = $1 ORDER BY id ASC`,
    [editionId],
  );
}

async function clearSynthetic() {
  await query(
    `DELETE FROM conflict_validation_observations WHERE report_date >= DATE '2027-01-01'`,
  );
  await query(`DELETE FROM benchmark_report_editions WHERE report_date >= DATE '2027-01-01'`);
  await query(`DELETE FROM benchmark_series_days WHERE report_date >= DATE '2027-01-01'`);
  await query(`DELETE FROM cron_runs WHERE job = $1`, [ITEST_JOB]);
  await query(`DELETE FROM claims WHERE text LIKE $1`, [`${TAG}%`]);
  await query(`DELETE FROM digests WHERE provider = 'itest-obs' AND digest_date = $1::date`, [
    CLAIM_DAY,
  ]);
  await query(
    `DELETE FROM doc_claims WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content_hash LIKE $1)`,
    [`${TAG}%`],
  );
  await query(`DELETE FROM raw_documents WHERE content_hash LIKE $1`, [`${TAG}%`]);
  await query(`DELETE FROM sources WHERE canonical_url LIKE 'https://itest-obs.example/%'`);
}

function deps(cronRunId: number | null) {
  const retentionSource = new DbPublishedRetentionClaimSource(query);
  return {
    repo: new SqlReferenceReportRepository(query),
    query,
    corpusSource: new DbCorpusRecallClaimSource(query),
    retentionSource,
    contributingDigestIds: () => retentionSource.contributingDigestIds(),
    // INJECTED page: zero network, and the disk cache is never consulted
    fetch: async (url: string) => ({ url, html: PAGE_HTML, fromCache: true, status: 200 }),
    cronRunId,
  };
}

beforeAll(async () => {
  await runMigrations(URL_ENV!); // 0028/0029/0030 on a fork that arrives at 0027
  pool = new Pool({ connectionString: URL_ENV });
  await clearSynthetic();
  frozenBaseline = await frozenCounts();

  const [edition] = await query(
    `INSERT INTO benchmark_report_editions
       (series, provider, edition_key, edition_label, report_date, canonical_url, norm_version,
        scope_version, cutoff_at, published_at, cutoff_treatment, published_treatment, parse_status)
     VALUES ('roca', 'isw', $1, 'daily', $2::date, $3, 'isw-edition-norm-v1', 'roca-scope-v1',
             $4::timestamptz, $5::timestamptz, 'present', 'present', 'parsed')
     RETURNING id`,
    [
      EDITION_KEY,
      REPORT_DATE,
      CANONICAL_URL,
      `${REPORT_DATE}T19:00:00Z`,
      `${REPORT_DATE}T22:00:00Z`,
    ],
  );
  editionId = Number(edition.id);

  const runs = await query(`INSERT INTO cron_runs (job) VALUES ($1), ($1) RETURNING id`, [
    ITEST_JOB,
  ]);
  [runOne, runTwo] = runs.map((r) => Number(r.id)).sort((a, b) => a - b);

  // real evidence: a mapped current-version doc_claim and a published digest claim
  const [src] = await query(
    `INSERT INTO sources (canonical_url, domain, platform, reliability_score)
     VALUES ('https://itest-obs.example/a', 'a.itest-obs.example', 'independent_media', 0.9)
     RETURNING id`,
  );
  const [doc] = await query(
    `INSERT INTO raw_documents (adapter, source_id, content, content_hash, country_iso2, url, lang, published_at, fetched_at)
     VALUES ('rss', $1, $2, $3, 'ru', 'https://itest-obs.example/doc', 'en', $4::timestamptz, $5::timestamptz)
     RETURNING id`,
    [
      Number(src.id),
      `${TAG} document body`,
      `${TAG}doc`,
      `${CLAIM_DAY}T06:00:00Z`,
      `${CLAIM_DAY}T07:00:00Z`,
    ],
  );
  const docId = Number(doc.id);
  await query(
    `INSERT INTO doc_claims (raw_document_id, track, extractor_version, ordinal, text_en, hedging, claim_date)
     VALUES ($1, 'military', $2, 0, $3, 'confirmed', $4::date)`,
    [
      docId,
      mapExtractorVersion("military", "ru"),
      `${TAG} Russian forces advanced near Kupiansk on June 23.`,
      CLAIM_DAY,
    ],
  );

  const [country] = await query(`SELECT id FROM countries WHERE iso2 = 'ru'`);
  const [digest] = await query(
    `INSERT INTO digests (country_id, digest_date, track, status, structured, provider)
     VALUES ($1, $2::date, 'military', 'generated', $3::jsonb, 'itest-obs')
     RETURNING id`,
    [Number(country.id), CLAIM_DAY, JSON.stringify({ stats: { engine: "mapreduce" } })],
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await client.query(
      `INSERT INTO claims (country_id, digest_id, text, hedging, claim_date)
       VALUES ($1, $2, $3, 'confirmed', $4::date) RETURNING id`,
      [
        Number(country.id),
        Number(digest.id),
        `${TAG} Russian forces advanced near Kupiansk on June 23.`,
        CLAIM_DAY,
      ],
    );
    await client.query(`INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)`, [
      claim.rows[0].id,
      docId,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await clearSynthetic();
  await pool.end();
});

describe("the live observation pipeline against real Postgres", () => {
  it("scores the daily-final winner and appends ONE observation on the keyword rung", async () => {
    const out = await observeConflictDay(deps(runOne), RU_UA, REPORT_DATE);
    expect(out.skipped).toBeNull();
    expect(out.editionKey).toBe(EDITION_KEY);
    expect(out.units).toBe(2);
    expect(out.matcherRung).toBe("keyword");
    // the paid rung never ran: CONFLICT_MATCH_USD_CAP_DAILY is unset AND there
    // is no key, so it refuses before any guard, reservation or client
    expect(out.matcherRefusal).toBe("no_api_key");

    const rows = await observationRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(String(row.conflict_id)).toBe("russia_ukraine");
    expect(String(row.edition_key)).toBe(EDITION_KEY);
    expect(String(row.evaluation_kind)).toBe("retrospective");
    expect(String(row.matcher_rung)).toBe("keyword");
    expect(row.matcher_model).toBeNull();
    expect(row.dispatch).toBeNull();
    expect(String(row.gazetteer_version)).toBe("ru-ua-v1");
    expect(String(row.unit_flags_version)).toBe(UNIT_FLAGS_VERSION);
    expect(String(row.edition_norm_version)).toBe("isw-edition-norm-v1");
    expect(String(row.daily_final_policy)).toBe("designated-final-v1");
    expect(String(row.registry_version)).toBe(CONFLICT_REGISTRY_VERSION);
    expect(Number(row.cron_run_id)).toBe(runOne);
  });

  it("stores the real claim evidence it assembled, and the reference prose it did NOT (ruling 1)", async () => {
    const [row] = await observationRows();
    const stored = JSON.stringify(row.result);
    expect(stored).not.toContain(SENTINEL);
    expect(stored).not.toContain("Kharkiv Oblast");
    // and nothing anywhere in the row, not just in `result`
    const [hit] = await query(
      `SELECT count(*)::int AS n FROM conflict_validation_observations
        WHERE reference_edition_id = $1 AND (result::text LIKE $2 OR unit_attribution::text LIKE $2)`,
      [editionId, `%${SENTINEL}%`],
    );
    expect(Number(hit.n)).toBe(0);
    // the denominator is EVERY declared takeaway, attribution changed nothing
    const result = row.result as { headline: { corpusRecall: { denominator: number } } };
    expect(result.headline.corpusRecall.denominator).toBe(2);
    const attribution = row.unit_attribution as Record<string, string>;
    expect(Object.keys(attribution).sort()).toEqual(["u0", "u1"]);
    expect(Number(row.votes_k)).toBe(0);
  });

  it("APPENDS under a second cron run and leaves the first row byte-identical", async () => {
    const [before] = await observationRows();
    const out = await observeConflictDay(deps(runTwo), RU_UA, REPORT_DATE);
    expect(out.observationId).not.toBeNull();
    const rows = await observationRows();
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows[0])).toBe(JSON.stringify(before));
    expect(Number(rows[1].cron_run_id)).toBe(runTwo);
    // the soak's variance instrument: same edition, two independent runs
    expect(String(rows[0].run_group_key)).toBe(String(rows[1].run_group_key));
  });

  it("the partial unique key refuses a duplicate within ONE cron run", async () => {
    await expect(observeConflictDay(deps(runTwo), RU_UA, REPORT_DATE)).rejects.toThrow();
    expect(await observationRows()).toHaveLength(2);
  });

  it("the read model returns the latest row for the edition", async () => {
    const latest = await latestObservationsFor(query, "russia_ukraine", {
      days: 3650,
      now: () => new Date(`${REPORT_DATE}T23:00:00Z`),
    });
    const mine = latest.filter((o) => o.editionKey === EDITION_KEY);
    expect(mine).toHaveLength(1);
    expect(mine[0].cronRunId).toBe(runTwo);
    expect(mine[0].matcherRung).toBe("keyword");
  });

  it("leaves validation_runs, isw_reports and source_citations untouched", async () => {
    expect(await frozenCounts()).toEqual(frozenBaseline);
  });
});
