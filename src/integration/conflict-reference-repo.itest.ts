import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the Phase 2 reference-report repository against the
// DISPOSABLE DDL in src/integration/sql/conflict-benchmark-reports.sql (NO
// numbered migration — the tables are created here and dropped in afterAll;
// the branch itself is a throwaway Neon fork). Proves: multi-edition
// insert/select determinism, idempotent replay/repair semantics identical to
// the in-memory backend (both route through the one merge authority), day
// statuses (confirmed gap vs probe failure, cleared by an arriving edition),
// the two-unique-index isw_reports trap being SIDESTEPPED (two same-date
// editions coexist while isw_reports keeps one anchor row), and
// citation-registry non-interference (identical counts before/after).
// Recorded limitation: final migration uniqueness/idempotency proof REMAINS
// the later integration gate — this disposable DDL cannot certify it.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { SqlReferenceReportRepository } = await import("@/lib/conflicts/reference-repo-sql");
const { InMemoryReferenceReportRepository } = await import("@/lib/conflicts/reference-repo");
const { parseEditionRecord, selectDailyFinal } = await import("@/lib/conflicts/editions");
const { serializeReferenceReportIdentity } = await import("@/lib/conflicts/serialization");

// FAR-FUTURE synthetic dates + synthetic slugs: the branch is a fork of
// production, so a real date/url could collide with genuine rows
const DAY_A = "2027-07-10";
const DAY_GAP = "2027-07-11";
const ANCHOR_URL = "https://understandingwar.org/research/middle-east/iran-update-itest-p2-anchor/";
const ANCHOR_DATE = "2027-07-09";

const editionRaw = (label: string, over: Partial<Record<string, unknown>> = {}) => ({
  identity: {
    series: "iran_update",
    editionKey: `iran_update:${DAY_A}:${label}`,
    reportDate: DAY_A,
    cutoffAt: null,
    publishedAt: null,
    scopeVersion: "iran-update-scope-v1",
    ...(over.identity as Record<string, unknown> | undefined),
  },
  provider: "isw",
  canonicalUrl: `https://understandingwar.org/research/middle-east/iran-update-${label === "special" ? "special-report-" : `${label}-special-report-`}july-10-2027/`,
  normVersion: "isw-edition-norm-v1",
  designatedFinal: null,
  cutoffTreatment: "missing",
  publishedTreatment: "missing",
  parseStatus: "pending",
  citationAnchorId: null,
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "identity")),
});

let pool: Pool;
let anchorId: number;
let registryBaseline: Record<string, number>;

const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

async function registryCounts(): Promise<Record<string, number>> {
  const [row] = await query(
    `SELECT (SELECT count(*) FROM isw_reports)::int AS reports,
            (SELECT count(*) FROM source_citations)::int AS citations,
            (SELECT count(*) FROM sources)::int AS sources,
            (SELECT count(*) FROM source_theater_stats)::int AS stats`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL_ENV });
  await query(`DROP TABLE IF EXISTS benchmark_report_editions`);
  await query(`DROP TABLE IF EXISTS benchmark_series_days`);
  const ddl = readFileSync(
    join(process.cwd(), "src/integration/sql/conflict-benchmark-reports.sql"),
    "utf8",
  );
  await query(ddl); // simple-query protocol: the whole file in one round trip
  await query(`DELETE FROM isw_reports WHERE url = $1`, [ANCHOR_URL]);
  const rows = await query(
    `INSERT INTO isw_reports (url, theater, report_date, parse_status)
     VALUES ($1, 'ir', $2, 'pending') RETURNING id`,
    [ANCHOR_URL, ANCHOR_DATE],
  );
  anchorId = Number(rows[0].id);
  registryBaseline = await registryCounts();
});

afterAll(async () => {
  await query(`DROP TABLE IF EXISTS benchmark_report_editions`);
  await query(`DROP TABLE IF EXISTS benchmark_series_days`);
  await query(`DELETE FROM isw_reports WHERE id = $1`, [anchorId]);
  await pool.end();
});

describe("conflict reference-report repository (disposable SQL)", () => {
  it("stores two same-date editions and returns them in the deterministic finality order", async () => {
    const repo = new SqlReferenceReportRepository(query);
    // insert LEAST-final first so any rows[0]-of-insert-order bug would show
    expect((await repo.upsertEdition(parseEditionRecord(editionRaw("morning")))).action).toBe(
      "inserted",
    );
    expect((await repo.upsertEdition(parseEditionRecord(editionRaw("evening")))).action).toBe(
      "inserted",
    );

    const day = await repo.editionsForDay("iran_update", DAY_A);
    expect(day.map((e) => e.identity.editionKey)).toEqual([
      `iran_update:${DAY_A}:evening`,
      `iran_update:${DAY_A}:morning`,
    ]);
    expect(selectDailyFinal(day).selected.identity.editionKey).toBe(
      `iran_update:${DAY_A}:evening`,
    );
    expect(await repo.dayStatus("iran_update", DAY_A)).toBe("published");

    // the two-unique-index trap is sidestepped: TWO editions for one
    // series/date coexist here while isw_reports holds NO row for the date
    const [n] = await query(
      `SELECT count(*)::int AS n FROM benchmark_report_editions WHERE series = 'iran_update' AND report_date = $1`,
      [DAY_A],
    );
    expect(Number(n.n)).toBe(2);
    const [ir] = await query(
      `SELECT count(*)::int AS n FROM isw_reports WHERE theater = 'ir' AND report_date = $1`,
      [DAY_A],
    );
    expect(Number(ir.n)).toBe(0);
  });

  it("replays are idempotent; repairs fill in without downgrade; SQL matches in-memory", async () => {
    const repo = new SqlReferenceReportRepository(query);
    const mem = new InMemoryReferenceReportRepository();
    await mem.upsertEdition(parseEditionRecord(editionRaw("morning")));
    await mem.upsertEdition(parseEditionRecord(editionRaw("evening")));

    // replay: unchanged in both backends, zero new rows
    const replaySql = await repo.upsertEdition(parseEditionRecord(editionRaw("evening")));
    const replayMem = await mem.upsertEdition(parseEditionRecord(editionRaw("evening")));
    expect(replaySql).toEqual(replayMem);
    expect(replaySql.action).toBe("unchanged");

    // repair: a later parse brings the anchors + parse status + citation link
    const richer = parseEditionRecord(
      editionRaw("evening", {
        identity: { cutoffAt: `${DAY_A}T18:00:00Z`, publishedAt: `${DAY_A}T23:00:00Z` },
        cutoffTreatment: "present",
        publishedTreatment: "present",
        parseStatus: "parsed",
        citationAnchorId: anchorId,
      }),
    );
    const repairSql = await repo.upsertEdition(richer);
    const repairMem = await mem.upsertEdition(richer);
    expect(repairSql).toEqual(repairMem);
    expect(repairSql.action).toBe("repaired");
    expect(repairSql.repairedFields).toEqual([
      "cutoff",
      "published",
      "parse_status",
      "citation_anchor",
    ]);

    // degraded replay of the ORIGINAL poor observation: nothing lost, both backends agree
    const degradeSql = await repo.upsertEdition(parseEditionRecord(editionRaw("evening")));
    const degradeMem = await mem.upsertEdition(parseEditionRecord(editionRaw("evening")));
    expect(degradeSql).toEqual(degradeMem);
    expect(degradeSql.action).toBe("unchanged");

    // round-tripped record is canonical and identical across backends
    const fromSql = await repo.getEdition(`iran_update:${DAY_A}:evening`);
    const fromMem = await mem.getEdition(`iran_update:${DAY_A}:evening`);
    expect(fromSql).not.toBeNull();
    expect(serializeReferenceReportIdentity(fromSql!.identity)).toBe(
      serializeReferenceReportIdentity(fromMem!.identity),
    );
    expect(fromSql!.identity.cutoffAt).toBe(`${DAY_A}T18:00:00.000Z`); // canonical UTC ISO form
    expect(fromSql!.parseStatus).toBe("parsed");
    expect(fromSql!.citationAnchorId).toBe(anchorId);
  });

  it("day statuses: probe failure, confirmed gap, and clearance by an arriving edition", async () => {
    const repo = new SqlReferenceReportRepository(query);
    expect(await repo.dayStatus("iran_update", DAY_GAP)).toBe("unknown");
    expect(await repo.recordDayStatus("iran_update", DAY_GAP, "probe_failed")).toEqual({
      status: "probe_failed",
      action: "set",
    });
    expect(await repo.recordDayStatus("iran_update", DAY_GAP, "publication_gap")).toEqual({
      status: "publication_gap",
      action: "set",
    });
    expect(await repo.recordDayStatus("iran_update", DAY_GAP, "probe_failed")).toEqual({
      status: "publication_gap",
      action: "kept_prior", // a failed probe never un-confirms a gap
    });
    // an edition arriving for the "gap" day repairs the record
    const arrived = await repo.upsertEdition(
      parseEditionRecord(
        editionRaw("special", {
          identity: { editionKey: `iran_update:${DAY_GAP}:special`, reportDate: DAY_GAP },
          canonicalUrl:
            "https://understandingwar.org/research/middle-east/iran-update-special-report-july-11-2027/",
        }),
      ),
    );
    expect(arrived.dayStatusCleared).toBe(true);
    expect(await repo.dayStatus("iran_update", DAY_GAP)).toBe("published");
    const [days] = await query(
      `SELECT count(*)::int AS n FROM benchmark_series_days WHERE series = 'iran_update' AND report_date = $1`,
      [DAY_GAP],
    );
    expect(Number(days.n)).toBe(0);
    // and recording a gap over the edition is refused
    expect(await repo.recordDayStatus("iran_update", DAY_GAP, "publication_gap")).toEqual({
      status: "published",
      action: "published_wins",
    });
  });

  it("DB CHECK constraints refuse a drifted edition key and inconsistent anchors", async () => {
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:evening', 'morning', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending')`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_key_shape/);
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status, cutoff_at)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:plain', 'plain', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending', now())`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_cutoff_consistent/);
  });

  it("citation registry is UNTOUCHED by every repository operation", async () => {
    // identical counts across isw_reports / source_citations / sources /
    // source_theater_stats — the repository only ever REFERENCES the anchor
    expect(await registryCounts()).toEqual(registryBaseline);
    const [anchor] = await query(
      `SELECT parse_status, endnote_count, citation_count FROM isw_reports WHERE id = $1`,
      [anchorId],
    );
    expect(anchor.parse_status).toBe("pending"); // never written by the repo
  });
});
