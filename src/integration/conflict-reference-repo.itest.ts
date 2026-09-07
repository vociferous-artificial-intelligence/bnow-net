import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the reference-report repository against the DURABLE
// tables of migration 0028, applied here by the repo's own migration runner
// (scripts/migrations-lib.ts runMigrations — the integration harness does not
// apply migrations) on a throwaway Neon fork of production. Proves:
// multi-edition insert/select determinism, idempotent replay/repair semantics
// identical to the in-memory backend (both route through the one merge
// authority), day statuses (confirmed gap vs probe failure, cleared by an
// arriving edition), the two-unique-index isw_reports trap being SIDESTEPPED
// (two same-date editions coexist while isw_reports keeps one anchor row),
// citation-registry non-interference (identical counts before/after), and the
// design §5 hardening this migration carries: one-statement insert+clear,
// typed canonical_url conflicts, the anchor-change journal, and concurrent
// writers converging instead of overwriting.
//
// The tables are MIGRATED, never dropped here: dropping them would leave every
// later itest in the same fork running against a schema whose _migrations
// marker says 0028 was applied. Cleanup deletes only this test's synthetic
// far-future rows.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { runMigrations } = await import("../../scripts/migrations-lib");
const { SqlReferenceReportRepository, DAY_STATUS_UPSERT_SQL, EDITION_UPSERT_SQL } = await import(
  "@/lib/conflicts/reference-repo-sql"
);
const { ConflictDomainError } = await import("@/lib/conflicts/errors");
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
let anchorBaseline: Record<string, unknown>;

const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

// the anchor row's full relevant tuple — count equality alone cannot see a
// content UPDATE (report_date::text: driver `date` parsing is host-TZ-bound)
async function anchorTuple(): Promise<Record<string, unknown>> {
  const [row] = await query(
    `SELECT parse_status, endnote_count, citation_count, url, theater, report_date::text AS report_date
       FROM isw_reports WHERE id = $1`,
    [anchorId],
  );
  return row;
}

async function registryCounts(): Promise<Record<string, number>> {
  const [row] = await query(
    `SELECT (SELECT count(*) FROM isw_reports)::int AS reports,
            (SELECT count(*) FROM source_citations)::int AS citations,
            (SELECT count(*) FROM sources)::int AS sources,
            (SELECT count(*) FROM source_theater_stats)::int AS stats`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

// every date this test writes is far-future and synthetic, so the sweep can be
// date-scoped and cannot touch a real discovered edition on a production fork
async function clearSyntheticRows() {
  await query(`DELETE FROM benchmark_report_editions WHERE report_date >= DATE '2027-01-01'`);
  await query(`DELETE FROM benchmark_series_days WHERE report_date >= DATE '2027-01-01'`);
}

beforeAll(async () => {
  await runMigrations(URL_ENV!); // applies 0028 additively on the disposable fork
  pool = new Pool({ connectionString: URL_ENV });
  await clearSyntheticRows();
  await query(`DELETE FROM isw_reports WHERE url = $1`, [ANCHOR_URL]);
  const rows = await query(
    `INSERT INTO isw_reports (url, theater, report_date, parse_status)
     VALUES ($1, 'ir', $2, 'pending') RETURNING id`,
    [ANCHOR_URL, ANCHOR_DATE],
  );
  anchorId = Number(rows[0].id);
  registryBaseline = await registryCounts();
  anchorBaseline = await anchorTuple();
});

afterAll(async () => {
  await clearSyntheticRows();
  await query(`DELETE FROM isw_reports WHERE id = $1`, [anchorId]);
  await pool.end();
});

describe("conflict reference-report repository (migration 0028, real Postgres)", () => {
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

  it("a failed edition insert never erases a stored probe_failed day record", async () => {
    const repo = new SqlReferenceReportRepository(query);
    const D1 = "2027-07-12";
    const D2 = "2027-07-13";
    // D1's real plain-shape URL; D2 duplicates it byte-for-byte
    const dupUrl = "https://understandingwar.org/research/middle-east/iran-update-july-12-2027/";
    const d1Edition = editionRaw("plain", {
      identity: { editionKey: `iran_update:${D1}:plain`, reportDate: D1 },
      canonicalUrl: dupUrl,
    });
    // a CURRENT-normVersion record would be refused at validation by the
    // URL↔key cross-check, so the DB-level failure path is exercised with a
    // non-current-version record — exactly the class the app-layer
    // cross-validation cannot interpret
    const d2Edition = editionRaw("plain", {
      identity: { editionKey: `iran_update:${D2}:plain`, reportDate: D2 },
      canonicalUrl: dupUrl, // duplicates D1's URL → partial unique index
      normVersion: "isw-edition-norm-v0",
    });

    expect((await repo.upsertEdition(parseEditionRecord(d1Edition))).action).toBe("inserted");
    expect(await repo.recordDayStatus("iran_update", D2, "probe_failed")).toEqual({
      status: "probe_failed",
      action: "set",
    });

    // the D2 insert FAILS on the canonical_url partial unique index (a
    // different edition_key, so ON CONFLICT (edition_key) does not absorb
    // it) — the durable backend maps it to the typed domain error, keeping the
    // index name in the message as evidence of WHICH constraint refused ...
    const urlErr = await repo.upsertEdition(parseEditionRecord(d2Edition)).catch((e) => e);
    expect(urlErr).toBeInstanceOf(ConflictDomainError);
    expect((urlErr as InstanceType<typeof ConflictDomainError>).code).toBe("edition_url_conflict");
    expect((urlErr as Error).message).toMatch(/benchmark_report_editions_url_idx/);
    // ... and the stored discovery record SURVIVES: the failed insert must
    // not have cleared it (regression: the first backend deleted the day
    // row BEFORE the insert, so this exact failure erased probe_failed)
    expect(await repo.dayStatus("iran_update", D2)).toBe("probe_failed");
    const rows = await query(
      `SELECT status FROM benchmark_series_days WHERE series = 'iran_update' AND report_date = $1`,
      [D2],
    );
    expect(rows).toEqual([{ status: "probe_failed" }]);
    // and no D2 edition row exists
    expect(await repo.getEdition(`iran_update:${D2}:plain`)).toBeNull();

    // in-memory contract on the SAME sequence, asserted as it actually is:
    // canonical_url uniqueness across editions is a DB-level constraint with
    // no in-memory counterpart (its validation refuses only per-record and
    // same-key merge conflicts, and always before the clear), so the D2
    // upsert is ACCEPTED there and clears the day row — a real backend
    // divergence on constraint surface, not on clear-ordering semantics
    const mem = new InMemoryReferenceReportRepository();
    await mem.upsertEdition(parseEditionRecord(d1Edition));
    await mem.recordDayStatus("iran_update", D2, "probe_failed");
    const memResult = await mem.upsertEdition(parseEditionRecord(d2Edition));
    expect(memResult.action).toBe("inserted");
    expect(memResult.dayStatusCleared).toBe(true);
    expect(await mem.dayStatus("iran_update", D2)).toBe("published");
  });

  it("the DB refuses a second same-day designated-final edition", async () => {
    const repo = new SqlReferenceReportRepository(query);
    const D3 = "2027-07-14";
    const designated = (label: string) =>
      parseEditionRecord(
        editionRaw(label, {
          identity: { editionKey: `iran_update:${D3}:${label}`, reportDate: D3 },
          canonicalUrl: `https://understandingwar.org/research/middle-east/iran-update-${label}-special-report-july-14-2027/`,
          designatedFinal: true,
        }),
      );
    expect((await repo.upsertEdition(designated("morning"))).action).toBe("inserted");
    // selectDailyFinal's contradictory-designation refusal now has a DB twin:
    // persistence cannot hold two designated finals for one series/day
    await expect(repo.upsertEdition(designated("evening"))).rejects.toThrow(
      /benchmark_report_editions_final_idx/,
    );
    const day = await repo.editionsForDay("iran_update", D3);
    expect(day.map((e) => e.identity.editionKey)).toEqual([`iran_update:${D3}:morning`]);
  });

  it("the day-status upsert statement itself refuses a downgrade (DB-level monotone rule)", async () => {
    const repo = new SqlReferenceReportRepository(query);
    const D4 = "2027-07-15";
    expect(await repo.recordDayStatus("iran_update", D4, "publication_gap")).toEqual({
      status: "publication_gap",
      action: "set",
    });
    // bypass the app-layer transition rule and issue the repository's OWN
    // statement (imported, not copied) with a stale downgrade — the CASE
    // guard in the statement must keep the confirmed gap
    await query(DAY_STATUS_UPSERT_SQL, ["iran_update", D4, "probe_failed"]);
    expect(await repo.dayStatus("iran_update", D4)).toBe("publication_gap");
    // and the same statement still performs the legitimate upgrade
    const D5 = "2027-07-16";
    await query(DAY_STATUS_UPSERT_SQL, ["iran_update", D5, "probe_failed"]);
    await query(DAY_STATUS_UPSERT_SQL, ["iran_update", D5, "publication_gap"]);
    expect(await repo.dayStatus("iran_update", D5)).toBe("publication_gap");
  });

  it("DB CHECK constraints refuse drifted keys, malformed labels, missing isw URLs, and inconsistent anchors", async () => {
    // each probe violates exactly ONE constraint, so the asserted name is
    // deterministic
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status, canonical_url)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:evening', 'morning', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending',
                 'https://understandingwar.org/research/middle-east/iran-update-check-probe-1/')`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_key_shape/);
    // a colon-bearing label satisfies the concatenation check but not the
    // label grammar
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status, canonical_url)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:a:b', 'a:b', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending',
                 'https://understandingwar.org/research/middle-east/iran-update-check-probe-2/')`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_label_shape/);
    // provider isw without a canonical URL
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:plain', 'plain', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending')`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_isw_url/);
    // anchor/treatment consistency, BOTH directions and BOTH anchors:
    // an instant without 'present'…
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status, canonical_url, cutoff_at)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:plain', 'plain', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending',
                 'https://understandingwar.org/research/middle-east/iran-update-check-probe-3/', now())`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_cutoff_consistent/);
    // …'present' without an instant…
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status, canonical_url)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:plain', 'plain', $1,
                 'iran-update-scope-v1', 'present', 'missing', 'pending',
                 'https://understandingwar.org/research/middle-east/iran-update-check-probe-4/')`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_cutoff_consistent/);
    // …and the published-side twin
    await expect(
      query(
        `INSERT INTO benchmark_report_editions
           (series, provider, edition_key, edition_label, report_date, scope_version,
            cutoff_treatment, published_treatment, parse_status, canonical_url, published_at)
         VALUES ('iran_update', 'isw', 'iran_update:${DAY_A}:plain', 'plain', $1,
                 'iran-update-scope-v1', 'missing', 'missing', 'pending',
                 'https://understandingwar.org/research/middle-east/iran-update-check-probe-5/', now())`,
        [DAY_A],
      ),
    ).rejects.toThrow(/benchmark_report_editions_published_consistent/);
  });

  it("the tables come from migration 0028, not from test DDL", async () => {
    // the durable-wiring gate the design recorded as deferred: these tables now
    // exist because runMigrations applied the numbered file, and re-running it
    // is a no-op (the marker is present exactly once)
    const [reg] = await query(
      `SELECT to_regclass('benchmark_report_editions')::text AS editions,
              to_regclass('benchmark_series_days')::text AS days`,
    );
    expect(reg).toEqual({ editions: "benchmark_report_editions", days: "benchmark_series_days" });
    const markers = await query(
      `SELECT name FROM _migrations WHERE name LIKE '0028\\_%' ORDER BY name`,
    );
    expect(markers.length).toBe(1);
    await runMigrations(URL_ENV!); // idempotent re-apply
    const after = await query(`SELECT name FROM _migrations WHERE name LIKE '0028\\_%'`);
    expect(after).toEqual(markers);
    // the additive audit columns exist with their defaults
    const cols = await query(
      `SELECT column_name, column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'benchmark_report_editions'
          AND column_name IN ('created_at', 'anchor_journal') ORDER BY column_name`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(["anchor_journal", "created_at"]);
    expect(cols.every((c) => c.is_nullable === "NO")).toBe(true);
  });

  it("insert + day-row clear are ONE statement: a rolled-back insert clears nothing", async () => {
    const D6 = "2027-07-17";
    const repo = new SqlReferenceReportRepository(query);
    // seed a probe_failed record, then issue the DEPLOYED upsert statement
    // directly with a row that violates the label-shape CHECK
    expect(await repo.recordDayStatus("iran_update", D6, "probe_failed")).toEqual({
      status: "probe_failed",
      action: "set",
    });
    await expect(
      query(EDITION_UPSERT_SQL, [
        "iran_update",
        "isw",
        `iran_update:${D6}:BAD`,
        "BAD",
        D6,
        "https://understandingwar.org/research/middle-east/iran-update-atomic-probe/",
        "isw-edition-norm-v1",
        "iran-update-scope-v1",
        null,
        null,
        "missing",
        "missing",
        null,
        "pending",
        null,
        "{}",
      ]),
    ).rejects.toThrow(/benchmark_report_editions_label_shape/);
    // the DELETE half of the CTE rolled back with the INSERT half
    expect(await repo.dayStatus("iran_update", D6)).toBe("probe_failed");
  });

  it("a moved anchor leaves a journal entry instead of destroying the old instant", async () => {
    const D7 = "2027-07-18";
    const AT = "2027-08-01T00:00:00.000Z";
    const repo = new SqlReferenceReportRepository(query, { now: () => new Date(AT) });
    const withCutoff = (iso: string) =>
      parseEditionRecord(
        editionRaw("plain", {
          identity: {
            editionKey: `iran_update:${D7}:plain`,
            reportDate: D7,
            cutoffAt: iso,
            publishedAt: null,
          },
          canonicalUrl:
            "https://understandingwar.org/research/middle-east/iran-update-july-18-2027/",
          cutoffTreatment: "present",
        }),
      );
    expect((await repo.upsertEdition(withCutoff(`${D7}T18:00:00Z`))).action).toBe("inserted");
    const moved = await repo.upsertEdition(withCutoff(`${D7}T19:30:00Z`));
    expect(moved.action).toBe("repaired");
    expect(moved.anchorChanged).toBe(true);
    expect(await repo.anchorJournal(`iran_update:${D7}:plain`)).toEqual([
      { at: AT, field: "cutoff", from: `${D7}T18:00:00.000Z`, to: `${D7}T19:30:00.000Z` },
    ]);
    // a fill-in is a repair, not a move: it journals nothing
    const filled = await repo.upsertEdition(
      parseEditionRecord(
        editionRaw("plain", {
          identity: {
            editionKey: `iran_update:${D7}:plain`,
            reportDate: D7,
            cutoffAt: `${D7}T19:30:00Z`,
            publishedAt: `${D7}T23:00:00Z`,
          },
          canonicalUrl:
            "https://understandingwar.org/research/middle-east/iran-update-july-18-2027/",
          cutoffTreatment: "present",
          publishedTreatment: "present",
        }),
      ),
    );
    expect(filled.repairedFields).toEqual(["published"]);
    expect(filled.anchorChanged).toBe(false);
    expect((await repo.anchorJournal(`iran_update:${D7}:plain`)).length).toBe(1);
  });

  it("concurrent writers on one edition converge to the union of their repairs", async () => {
    // two SEPARATE clients, as two cron invocations would be: the read-merge-
    // write path is compare-and-swap, so a lost race re-reads and re-merges
    // rather than overwriting the winner's repair
    const D8 = "2027-07-19";
    const url = "https://understandingwar.org/research/middle-east/iran-update-july-19-2027/";
    const poolA = new Pool({ connectionString: URL_ENV });
    const poolB = new Pool({ connectionString: URL_ENV });
    const q = (p: Pool) => (sql: string, params?: unknown[]) =>
      p.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);
    try {
      const seed = new SqlReferenceReportRepository(query);
      const base = (over: Record<string, unknown>) =>
        parseEditionRecord(
          editionRaw("plain", {
            identity: { editionKey: `iran_update:${D8}:plain`, reportDate: D8, ...(over.identity as object) },
            canonicalUrl: url,
            ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "identity")),
          }),
        );
      expect((await seed.upsertEdition(base({}))).action).toBe("inserted");

      const [a, b] = await Promise.all([
        new SqlReferenceReportRepository(q(poolA)).upsertEdition(
          base({ identity: { cutoffAt: `${D8}T18:00:00Z` }, cutoffTreatment: "present" }),
        ),
        new SqlReferenceReportRepository(q(poolB)).upsertEdition(
          base({
            identity: { publishedAt: `${D8}T23:00:00Z` },
            publishedTreatment: "present",
            parseStatus: "parsed",
          }),
        ),
      ]);
      expect([a.action, b.action]).toEqual(["repaired", "repaired"]);
      const merged = await seed.getEdition(`iran_update:${D8}:plain`);
      expect(merged!.identity.cutoffAt).toBe(`${D8}T18:00:00.000Z`);
      expect(merged!.identity.publishedAt).toBe(`${D8}T23:00:00.000Z`);
      expect(merged!.parseStatus).toBe("parsed");
      const [n] = await query(
        `SELECT count(*)::int AS n FROM benchmark_report_editions WHERE report_date = $1`,
        [D8],
      );
      expect(Number(n.n)).toBe(1);
    } finally {
      await poolA.end();
      await poolB.end();
    }
  });

  it("citation registry is UNTOUCHED by every repository operation", async () => {
    // identical counts across isw_reports / source_citations / sources /
    // source_theater_stats — the repository only ever REFERENCES the anchor
    expect(await registryCounts()).toEqual(registryBaseline);
    // …and the anchor ROW itself is byte-identical: count equality cannot see
    // a content UPDATE, so the full relevant tuple (parse_status,
    // endnote_count, citation_count, url, theater, report_date) is compared
    // to the beforeAll baseline — pinned non-vacuous first
    expect(anchorBaseline.parse_status).toBe("pending");
    expect(anchorBaseline.url).toBe(ANCHOR_URL);
    expect(anchorBaseline.report_date).toBe(ANCHOR_DATE);
    expect(await anchorTuple()).toEqual(anchorBaseline);
  });
});
