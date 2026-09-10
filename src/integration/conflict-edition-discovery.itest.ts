import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of WS-3.2 edition discovery against the DURABLE
// migration-0028 tables on a throwaway Neon fork. Proves what the unit suite
// cannot: that the records discovery builds actually satisfy every CHECK and
// index the migration created, that `derived` round-trips through jsonb, that
// the link-only citation anchor resolves against a REAL isw_reports row, and —
// the load-bearing one — that discovery writes NOTHING to the citation
// registry (identical counts AND a byte-comparison of the anchor row's tuple).
//
// No network: the fetch seam is injected with fixture bodies. No provider call
// of any kind. Every date is far-future and synthetic, so the sweep is
// date-scoped and cannot touch a genuine row on a production fork.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { runMigrations } = await import("../../scripts/migrations-lib");
const { SqlReferenceReportRepository } = await import("@/lib/conflicts/reference-repo-sql");
const { selectDailyFinal } = await import("@/lib/conflicts/editions");
const { gazetteerFor } = await import("@/lib/validation/gazetteer");
const { backfillFromIswReports, discoverEditions, runSeriesDiscovery, editionUnitsVersion } =
  await import("@/lib/isw/edition-discovery");

const fixture = (rel: string) => readFileSync(join(process.cwd(), "fixtures/isw", rel), "utf8");
const MORNING_HTML = fixture("editions/iran-morning-2026-08-12.html");
const EVENING_HTML = fixture("editions/iran-evening-2026-08-12.html");

const DAY = "2027-08-12"; // far future: cannot collide with a real discovered row
const GAP_DAY = "2027-08-13";
const IRAN = "https://understandingwar.org/research/middle-east/";
const EVENING_URL = `${IRAN}iran-update-evening-special-report-august-12-2027/`;
const MORNING_URL = `${IRAN}iran-update-morning-special-report-august-12-2027/`;
/** far past the 48h gap-confirmation age for both synthetic days */
const NOW = () => new Date(`${GAP_DAY}T00:00:00Z`).getTime() + 30 * 86_400_000;

let pool: Pool;
let anchorId: number;
let registryBaseline: Record<string, number>;
let anchorBaseline: Record<string, unknown>;

const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

function fetchFrom(map: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    fn: async (url: string) => {
      calls.push(url);
      const html = map[url];
      return html === undefined
        ? { url, html: "", fromCache: false, status: 404 }
        : { url, html, fromCache: false, status: 200 };
    },
  };
}

const deps = (map: Record<string, string>) => {
  const { fn, calls } = fetchFrom(map);
  return {
    repo: new SqlReferenceReportRepository(query),
    query,
    fetch: fn,
    now: () => new Date(NOW()),
    calls,
  };
};

async function registryCounts(): Promise<Record<string, number>> {
  const [row] = await query(
    `SELECT (SELECT count(*) FROM isw_reports)::int AS reports,
            (SELECT count(*) FROM source_citations)::int AS citations,
            (SELECT count(*) FROM sources)::int AS sources,
            (SELECT count(*) FROM source_theater_stats)::int AS stats`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

async function anchorTuple(): Promise<Record<string, unknown>> {
  const [row] = await query(
    `SELECT parse_status, endnote_count, citation_count, url, theater, report_date::text AS report_date
       FROM isw_reports WHERE id = $1`,
    [anchorId],
  );
  return row;
}

async function clearSyntheticRows() {
  await query(`DELETE FROM benchmark_report_editions WHERE report_date >= DATE '2027-08-01'`);
  await query(`DELETE FROM benchmark_series_days WHERE report_date >= DATE '2027-08-01'`);
}

beforeAll(async () => {
  await runMigrations(URL_ENV!);
  pool = new Pool({ connectionString: URL_ENV });
  await clearSyntheticRows();
  await query(`DELETE FROM isw_reports WHERE url = $1`, [EVENING_URL]);
  // production's discovery would have inserted exactly ONE row for the day —
  // and on a two-a-day date its probe order can land on either edition. Here it
  // holds the EVENING url, so the link-only rule anchors evening and leaves
  // morning NULL (memo C5).
  const rows = await query(
    `INSERT INTO isw_reports (url, theater, report_date, parse_status)
     VALUES ($1, 'ir', $2, 'pending') RETURNING id`,
    [EVENING_URL, DAY],
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

describe("WS-3.2 edition discovery on the durable 0028 tables (real Postgres)", () => {
  it("records EVERY edition of a two-a-day date and anchors only the URL-equal one", async () => {
    const d = deps({ [EVENING_URL]: EVENING_HTML, [MORNING_URL]: MORNING_HTML });
    const out = await discoverEditions(d, "iran_update", DAY);

    expect(d.calls).toHaveLength(4); // all four shapes probed, never a break
    expect(out.dayStatus).toBe("published");
    expect(out.editions.map((e) => e.label)).toEqual(["evening", "morning"]);
    expect(out.anchored).toBe(1);

    const rows = await query(
      `SELECT edition_key, edition_label, canonical_url, parse_status, isw_report_id,
              designated_final, norm_version, scope_version, published_at, cutoff_at,
              published_treatment, cutoff_treatment, derived
         FROM benchmark_report_editions WHERE report_date = $1 ORDER BY edition_label`,
      [DAY],
    );
    expect(rows.map((r) => r.edition_key)).toEqual([
      `iran_update:${DAY}:evening`,
      `iran_update:${DAY}:morning`,
    ]);
    const evening = rows[0];
    const morning = rows[1];
    expect(Number(evening.isw_report_id)).toBe(anchorId);
    expect(morning.isw_report_id).toBeNull();
    expect(evening.canonical_url).toBe(EVENING_URL);
    expect(evening.parse_status).toBe("parsed");
    expect(evening.designated_final).toBeNull(); // discovery never designates
    expect(evening.scope_version).toBe("iran-update-scope-v1");
    expect(evening.published_treatment).toBe("present");

    // derived round-trips through jsonb as signatures + hashes only
    const derived = evening.derived as { units: Array<Record<string, unknown>>; unitsVersion: string };
    expect(derived.unitsVersion).toBe(editionUnitsVersion(gazetteerFor("iran_update")));
    expect(derived.units).toHaveLength(3);
    for (const u of derived.units) {
      expect(Object.keys(u).sort()).toEqual(["actions", "chars", "ordinal", "sha256", "toponyms"]);
      expect(String(u.sha256)).toMatch(/^[0-9a-f]{64}$/);
    }

    // …and the finality ordering reads back from the DB, not from insert order
    const stored = await new SqlReferenceReportRepository(query).editionsForDay("iran_update", DAY);
    expect(selectDailyFinal(stored).selected.identity.editionKey).toBe(`iran_update:${DAY}:evening`);
  });

  it("a replay is `unchanged` and inserts no duplicate row", async () => {
    const out = await discoverEditions(
      deps({ [EVENING_URL]: EVENING_HTML, [MORNING_URL]: MORNING_HTML }),
      "iran_update",
      DAY,
    );
    expect(out.editions.map((e) => e.action)).toEqual(["unchanged", "unchanged"]);
    const [n] = await query(
      `SELECT count(*)::int AS n FROM benchmark_report_editions WHERE report_date = $1`,
      [DAY],
    );
    expect(Number(n.n)).toBe(2);
  });

  it("an all-404 day stores probe_failed, and only a SECOND run confirms the gap", async () => {
    const one = await discoverEditions(deps({}), "iran_update", GAP_DAY);
    expect(one.dayStatus).toBe("probe_failed");
    let [row] = await query(
      `SELECT status FROM benchmark_series_days WHERE series = 'iran_update' AND report_date = $1`,
      [GAP_DAY],
    );
    expect(row.status).toBe("probe_failed");

    const two = await discoverEditions(deps({}), "iran_update", GAP_DAY);
    expect(two.dayStatus).toBe("publication_gap");
    [row] = await query(
      `SELECT status FROM benchmark_series_days WHERE series = 'iran_update' AND report_date = $1`,
      [GAP_DAY],
    );
    expect(row.status).toBe("publication_gap");
  });

  it("--dry over the same window writes nothing at all", async () => {
    const before = await query(
      `SELECT (SELECT count(*)::int FROM benchmark_report_editions WHERE report_date >= DATE '2027-08-01') AS editions,
              (SELECT count(*)::int FROM benchmark_series_days WHERE report_date >= DATE '2027-08-01') AS days`,
    );
    const summary = await runSeriesDiscovery(
      { series: "iran_update", from: DAY, to: GAP_DAY, dry: true },
      deps({ [EVENING_URL]: EVENING_HTML, [MORNING_URL]: MORNING_HTML }),
      () => {},
    );
    expect(summary.days).toBe(2);
    expect(summary.multiEditionDays).toBe(1);
    expect(summary.editions).toBe(2);
    expect(summary.publicationGapDays).toBe(1);
    expect(summary.anchorNotFinalDays).toBe(0); // the anchor IS the final edition here
    const after = await query(
      `SELECT (SELECT count(*)::int FROM benchmark_report_editions WHERE report_date >= DATE '2027-08-01') AS editions,
              (SELECT count(*)::int FROM benchmark_series_days WHERE report_date >= DATE '2027-08-01') AS days`,
    );
    expect(after).toEqual(before);
  });

  it("the citation registry is UNTOUCHED by discovery", async () => {
    expect(await registryCounts()).toEqual(registryBaseline);
    expect(anchorBaseline.parse_status).toBe("pending");
    expect(anchorBaseline.url).toBe(EVENING_URL);
    expect(anchorBaseline.report_date).toBe(DAY);
    expect(await anchorTuple()).toEqual(anchorBaseline);
  });
});

describe("WS3-F07 — the N3 backfill against real Postgres (zero network)", () => {
  // Runs LAST and cleans up after itself: it registers editions from the
  // synthetic isw_reports anchor row this file already owns.
  it("registers the anchor row as a PENDING edition, idempotently, and writes no registry row", async () => {
    await clearSyntheticRows();
    const repo = new SqlReferenceReportRepository(query);

    const dry = await backfillFromIswReports({ repo, query }, { series: "iran_update", dry: true, from: DAY, to: DAY }, () => {});
    expect(dry.theater).toBe("ir");
    expect(dry.rows).toBe(1); // the one synthetic anchor row inside the window
    const [{ n: afterDry }] = await query(
      `SELECT count(*)::int AS n FROM benchmark_report_editions WHERE report_date >= DATE '2027-08-01'`,
    );
    expect(Number(afterDry)).toBe(0); // --dry wrote nothing

    const live = await backfillFromIswReports({ repo, query }, { series: "iran_update", dry: false, from: DAY, to: DAY }, () => {});
    expect(live.rows).toBe(dry.rows);
    expect(live.inserted + live.unchanged + live.repaired + live.refused).toBe(live.rows);
    expect(live.inserted).toBe(1);

    const [row] = await query(
      `SELECT edition_key, edition_label, parse_status, isw_report_id, derived
         FROM benchmark_report_editions WHERE canonical_url = $1`,
      [EVENING_URL],
    );
    expect(row.edition_key).toBe(`iran_update:${DAY}:evening`);
    expect(row.edition_label).toBe("evening");
    expect(row.parse_status).toBe("pending");
    expect(Number(row.isw_report_id)).toBe(anchorId);
    expect(row.derived).toEqual({});

    // idempotent replay
    const again = await backfillFromIswReports({ repo, query }, { series: "iran_update", dry: false, from: DAY, to: DAY }, () => {});
    expect(again.inserted).toBe(0);
    expect(again.unchanged + again.repaired).toBe(live.inserted + live.unchanged + live.repaired);

    // and a later discovery run upgrades that row in place, no duplicate
    const out = await discoverEditions(deps({ [EVENING_URL]: EVENING_HTML }), "iran_update", DAY);
    expect(out.editions[0].action).toBe("repaired");
    const [upgraded] = await query(
      `SELECT parse_status, isw_report_id FROM benchmark_report_editions WHERE canonical_url = $1`,
      [EVENING_URL],
    );
    expect(upgraded.parse_status).toBe("parsed");
    expect(Number(upgraded.isw_report_id)).toBe(anchorId);

    // the citation registry never moved
    expect(await registryCounts()).toEqual(registryBaseline);
    expect(await anchorTuple()).toEqual(anchorBaseline);
    await clearSyntheticRows();
  });
});
