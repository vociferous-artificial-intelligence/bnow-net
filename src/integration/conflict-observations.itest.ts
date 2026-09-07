import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Real-Postgres proof of the conflict observation store against the DURABLE
// table of migration 0030 (conflict_validation_observations), applied here by
// the repo's own migration runner (scripts/migrations-lib.ts runMigrations) on
// a throwaway Neon fork of production. Proves the C6 = (b) contract that the
// unit tests can only assert about statements:
//   * APPEND-ONLY — a second write for the same (conflict, edition, run group)
//     creates a NEW row and leaves the earlier row byte-identical;
//   * the partial unique key is the only duplicate guard, and it is INERT for
//     rows written outside a cron (cron_run_id NULL);
//   * the FK refuses an observation for an edition that does not exist;
//   * the headline is DERIVED at read time — three observations of one edition
//     leave three rows and the reader returns the latest one's headline;
//   * every row stamps unit_flags_version (D4/C13), enforced NOT NULL;
//   * a result carrying prose never reaches the database at all.
//
// The table is MIGRATED, never dropped here (the 0028 precedent): dropping it
// would leave every later itest in the same fork running against a schema whose
// _migrations marker says 0030 was applied. Cleanup deletes only this test's
// synthetic far-future rows and its own cron_runs rows.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { runMigrations } = await import("../../scripts/migrations-lib");
const {
  persistObservation,
  latestObservationsFor,
  OBSERVATION_INSERT_SQL,
  LATEST_OBSERVATIONS_SQL,
} = await import("@/lib/conflicts/observation-store");
const { ConflictDomainError } = await import("@/lib/conflicts/errors");
const { GOLDEN_RESULTS_FILE } = await import("@/lib/conflicts/goldens");
type ScoredResult = import("@/lib/conflicts/eval-profile").ConflictScoredResultV1;

// FAR-FUTURE synthetic dates: the branch is a fork of production, so a real
// report date could collide with a genuine discovered edition
const DAY_A = "2027-07-10";
const DAY_B = "2027-07-11";
const SERIES = "roca";
const CONFLICT = "russia_ukraine";
const ITEST_JOB = "itest:conflict-observations";
const SENTINEL = "SENTINELPROSE";

const GOLDENS = JSON.parse(readFileSync(join(process.cwd(), GOLDEN_RESULTS_FILE), "utf8")) as Record<
  string,
  unknown
>;

/** A real keyword-rung scored result (byte-pinned by goldens.test.ts), retargeted
 *  at a synthetic far-future edition. Only the report identity moves — every
 *  stamp, verdict and headline is the scorer's own output. */
function resultFor(day: string, matched?: number): ScoredResult {
  const r = JSON.parse(
    JSON.stringify(GOLDENS["cc-matcher-failclosed-013b#B-zero-valid-rounds"]),
  ) as ScoredResult;
  r.report.reportDate = day;
  r.report.editionKey = `${SERIES}:${day}:daily`;
  r.window!.reportDate = day;
  r.runGroupKey = [CONFLICT, r.report.editionKey, "retrospective", r.methodologyEpoch, "keyword", "k=0"].join("|");
  if (matched !== undefined) r.headline.corpusRecall.matched = matched;
  return r;
}

const STAMPS = {
  gazetteerVersion: "ru-ua-v1",
  unitFlagsVersion: "unit-flags-v0",
  editionNormVersion: "isw-edition-norm-v1",
  dailyFinalPolicy: "designated-final-v1",
  registryVersion: "conflict-registry-v1",
} as const;

let pool: Pool;
let editionA: number;
let editionB: number;
let runOne: number;
let runTwo: number;
let registryBaseline: Record<string, number>;

const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

async function registryCounts(): Promise<Record<string, number>> {
  const [row] = await query(
    `SELECT (SELECT count(*) FROM isw_reports)::int AS reports,
            (SELECT count(*) FROM source_citations)::int AS citations,
            (SELECT count(*) FROM validation_runs)::int AS validations,
            (SELECT count(*) FROM benchmark_report_editions)::int AS editions`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

async function observationCount(): Promise<number> {
  const [row] = await query(
    `SELECT count(*)::int AS n FROM conflict_validation_observations WHERE report_date >= DATE '2027-01-01'`,
  );
  return Number(row.n);
}

async function insertEdition(day: string): Promise<number> {
  const [row] = await query(
    `INSERT INTO benchmark_report_editions
       (series, provider, edition_key, edition_label, report_date, scope_version,
        cutoff_treatment, published_treatment, parse_status)
     VALUES ($1, 'fixture', $2, 'daily', $3, 'roca-scope-v1', 'missing', 'missing', 'pending')
     RETURNING id`,
    [SERIES, `${SERIES}:${day}:daily`, day],
  );
  return Number(row.id);
}

async function clearSyntheticRows() {
  await query(
    `DELETE FROM conflict_validation_observations WHERE report_date >= DATE '2027-01-01'`,
  );
  await query(`DELETE FROM benchmark_report_editions WHERE report_date >= DATE '2027-01-01'`);
  await query(`DELETE FROM cron_runs WHERE job = $1`, [ITEST_JOB]);
}

beforeAll(async () => {
  await runMigrations(URL_ENV!); // applies 0030 additively on the disposable fork
  pool = new Pool({ connectionString: URL_ENV });
  await clearSyntheticRows();
  editionA = await insertEdition(DAY_A);
  editionB = await insertEdition(DAY_B);
  const runs = await query(`INSERT INTO cron_runs (job) VALUES ($1), ($1) RETURNING id`, [
    ITEST_JOB,
  ]);
  [runOne, runTwo] = runs.map((r) => Number(r.id)).sort((a, b) => a - b);
  registryBaseline = await registryCounts();
});

afterAll(async () => {
  await clearSyntheticRows();
  await pool.end();
});

describe("conflict validation observations (migration 0030, real Postgres)", () => {
  it("the table comes from migration 0030 and re-applying it changes nothing", async () => {
    const [reg] = await query(
      `SELECT to_regclass('conflict_validation_observations')::text AS t`,
    );
    expect(reg.t).toBe("conflict_validation_observations");
    const markers = await query(`SELECT name FROM _migrations WHERE name LIKE '0030\\_%' ORDER BY name`);
    expect(markers.length).toBe(1);
    await runMigrations(URL_ENV!); // idempotent re-apply
    expect(await query(`SELECT name FROM _migrations WHERE name LIKE '0030\\_%'`)).toEqual(markers);

    // every version stamp is NOT NULL — D4/C13 requires unit_flags_version on
    // EVERY row, so a row without one must be unrepresentable, not merely absent
    const cols = await query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'conflict_validation_observations'
          AND column_name IN ('unit_flags_version', 'gazetteer_version', 'registry_version',
                              'daily_final_policy', 'edition_norm_version', 'observed_at')
        ORDER BY column_name`,
    );
    expect(cols.length).toBe(6);
    expect(cols.every((c) => c.is_nullable === "NO")).toBe(true);
    await expect(
      query(
        `INSERT INTO conflict_validation_observations
           (conflict_id, reference_edition_id, series, report_date, edition_key, evaluation_kind,
            result, matcher_rung, methodology_epoch, lane_taxonomy_version, evidence_policy_version,
            lane_classifier_version, actor_roster_version, scope_version, gazetteer_version,
            edition_norm_version, daily_final_policy, registry_version, window_end_source, run_group_key)
         VALUES ($1,$2,'roca',DATE '2027-07-10','k','retrospective','{}'::jsonb,'keyword','e','l','p','c','a','s','g','n','d','r','cutoff','rg')`,
        [CONFLICT, editionA],
      ),
    ).rejects.toThrow(/unit_flags_version/);
  });

  it("APPENDS: a second write for the same (conflict, edition, run group) adds a row and updates nothing", async () => {
    const result = resultFor(DAY_A);
    // NON-EMPTY array columns on real Postgres: the driver's JS-array -> int[]
    // / text[] mapping is exercised here, not only asserted at the JS boundary
    (result.versions as unknown as { extractorVersions: string[] }).extractorVersions = [
      "gpt-4o-mini:d73cc83ed8df",
      "gpt-4o-mini:75e0ff6403db",
    ];
    const first = await persistObservation(query, {
      referenceEditionId: editionA,
      result,
      contributingDigestIds: [31, 47],
      cronRunId: runOne,
      ...STAMPS,
    });
    const [arrays] = await query(
      `SELECT contributing_digest_ids, extractor_versions FROM conflict_validation_observations WHERE id = $1`,
      [first],
    );
    expect(arrays.contributing_digest_ids).toEqual([31, 47]);
    expect(arrays.extractor_versions).toEqual([
      "gpt-4o-mini:d73cc83ed8df",
      "gpt-4o-mini:75e0ff6403db",
    ]);
    const [before] = await query(
      `SELECT * FROM conflict_validation_observations WHERE id = $1`,
      [first],
    );

    // SAME conflict, SAME edition, SAME run_group_key — a different cron
    // invocation, which under C6 = (b) is a new independent observation
    const second = await persistObservation(query, {
      referenceEditionId: editionA,
      result,
      contributingDigestIds: [31, 47],
      cronRunId: runTwo,
      ...STAMPS,
    });
    expect(second).not.toBe(first);

    const rows = await query(
      `SELECT id, run_group_key, cron_run_id FROM conflict_validation_observations
        WHERE conflict_id = $1 AND reference_edition_id = $2 ORDER BY id`,
      [CONFLICT, editionA],
    );
    expect(rows.map((r) => Number(r.id))).toEqual([first, second]);
    expect(new Set(rows.map((r) => r.run_group_key)).size).toBe(1); // one run group
    expect(rows.map((r) => Number(r.cron_run_id))).toEqual([runOne, runTwo]);

    // the earlier row is byte-identical: nothing was overwritten
    const [after] = await query(`SELECT * FROM conflict_validation_observations WHERE id = $1`, [
      first,
    ]);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("the ONLY duplicate guard is per cron invocation, and it is inert without one", async () => {
    const before = await observationCount();
    // a third write reusing runOne collides with the partial unique index
    await expect(
      persistObservation(query, {
        referenceEditionId: editionA,
        result: resultFor(DAY_A),
        cronRunId: runOne,
        ...STAMPS,
      }),
    ).rejects.toThrow(/conflict_validation_observations_run_idx/);
    expect(await observationCount()).toBe(before);

    // two rows with NO cron run land freely — the index is partial, so an
    // append-only backfill or a manual observation is unconstrained
    const a = await persistObservation(query, {
      referenceEditionId: editionA,
      result: resultFor(DAY_A),
      ...STAMPS,
    });
    const b = await persistObservation(query, {
      referenceEditionId: editionA,
      result: resultFor(DAY_A),
      ...STAMPS,
    });
    expect(b).not.toBe(a);
    expect(await observationCount()).toBe(before + 2);
  });

  it("the FK refuses an observation for an edition that does not exist", async () => {
    const [maxRow] = await query(`SELECT COALESCE(max(id), 0)::int AS n FROM benchmark_report_editions`);
    const unknown = Number(maxRow.n) + 100_000;
    const before = await observationCount();
    // Postgres truncates identifiers at 63 bytes, so the STORED constraint name
    // is shorter than the one drizzle-kit wrote into 0030 — assert the name the
    // database actually reports
    await expect(
      persistObservation(query, {
        referenceEditionId: unknown,
        result: resultFor(DAY_A),
        ...STAMPS,
      }),
    ).rejects.toThrow(/conflict_validation_observations_reference_edition_id_benchmark/);
    expect(await observationCount()).toBe(before);
  });

  it("derives the current headline at READ time from the latest row per edition", async () => {
    // three observations of edition B, each a different headline numerator, in
    // ascending observed_at order; the newest is the "current" one
    const ids: number[] = [];
    for (const matched of [0, 1, 2]) {
      ids.push(
        await persistObservation(query, {
          referenceEditionId: editionB,
          result: resultFor(DAY_B, matched),
          ...STAMPS,
        }),
      );
    }
    const [{ n }] = await query(
      `SELECT count(*)::int AS n FROM conflict_validation_observations WHERE reference_edition_id = $1`,
      [editionB],
    );
    expect(Number(n)).toBe(3); // all three rows survive — the variance sample

    const latest = await latestObservationsFor(query, CONFLICT, {
      days: 400,
      now: () => new Date(`${DAY_B}T12:00:00Z`),
    });
    const forB = latest.filter((o) => o.referenceEditionId === editionB);
    expect(forB).toHaveLength(1); // one row per edition
    expect(forB[0].id).toBe(ids[2]);
    expect(forB[0].headline.corpusRecall.matched).toBe(2); // derived from the stored result
    expect(forB[0].unitFlagsVersion).toBe("unit-flags-v0");
    expect(forB[0].reportDate).toBe(DAY_B);

    // newest report day first, and edition A is still present with its own latest
    expect(latest[0].reportDate).toBe(DAY_B);
    expect(latest.some((o) => o.referenceEditionId === editionA)).toBe(true);
  });

  it("every stored row carries its unit-flags and gazetteer versions", async () => {
    const [row] = await query(
      `SELECT count(*)::int AS n FROM conflict_validation_observations
        WHERE report_date >= DATE '2027-01-01'
          AND (unit_flags_version IS NULL OR unit_flags_version = ''
               OR gazetteer_version IS NULL OR gazetteer_version = '')`,
    );
    expect(Number(row.n)).toBe(0);
  });

  it("a result carrying prose never reaches the database (ruling 1)", async () => {
    const poisoned = resultFor(DAY_A);
    (poisoned.contributionTotals as { bySource: Record<string, number> }).bySource = {
      [`${SENTINEL} Russian forces advanced near the settlement`]: 1,
    };
    const before = await observationCount();
    await expect(
      persistObservation(query, { referenceEditionId: editionA, result: poisoned, ...STAMPS }),
    ).rejects.toBeInstanceOf(ConflictDomainError);
    expect(await observationCount()).toBe(before);
    const [hit] = await query(
      `SELECT count(*)::int AS n FROM conflict_validation_observations WHERE result::text LIKE $1`,
      [`%${SENTINEL}%`],
    );
    expect(Number(hit.n)).toBe(0);
  });

  it("uses the DEPLOYED statements, and leaves the frozen tables untouched", async () => {
    expect(OBSERVATION_INSERT_SQL).toContain("INSERT INTO conflict_validation_observations");
    expect(OBSERVATION_INSERT_SQL).not.toMatch(/ON CONFLICT/i);
    expect(LATEST_OBSERVATIONS_SQL).toMatch(/DISTINCT ON \(reference_edition_id\)/);
    // isw_reports / source_citations / validation_runs are never written by this
    // module; benchmark_report_editions is only ever REFERENCED
    expect(await registryCounts()).toEqual(registryBaseline);
  });
});
