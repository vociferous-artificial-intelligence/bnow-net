import { beforeEach, describe, expect, it, vi } from "vitest";

// /trade provenance regression (2026-07-13): latestTradeFetch used to run
// `max(fetched_at) WHERE partner_code = 643` with NO flow filter, so the
// materials job's US import rows (reporter 842, flow 'M', partner Russia among
// the suppliers) could stamp the /trade export page with THEIR fetch date.
// tradeFetchWindow now shares the exact cohort WHERE clause with getDivergence.

const { queryMock, endMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: vi.fn(() => ({ query: queryMock, end: endMock })),
}));

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { TRADE_COHORT_SQL, fetchWindowLabel, getDivergence, tradeFetchWindow } = await import("./run");

/** Rows as they live in trade_flows: the export cohort AND a newer materials-job
 *  import row that must never influence /trade provenance. */
const STORED_ROWS = [
  { reporter_code: 51, reporter_name: "Armenia", partner_code: 643, flow_code: "X", hs_code: "8542", period: "2024", value_usd: "1000", fetched_at: "2026-06-02 09:00:00+00" },
  { reporter_code: 398, reporter_name: "Kazakhstan", partner_code: 643, flow_code: "X", hs_code: "84", period: "2024", value_usd: "2000", fetched_at: "2026-06-02 09:05:00+00" },
  // materials job: US imports FROM Russia — same table, different cohort, NEWER fetch
  { reporter_code: 842, reporter_name: "USA", partner_code: 643, flow_code: "M", hs_code: "2844", period: "2024", value_usd: "9000", fetched_at: "2026-07-03 09:00:00+00" },
  // unrelated import row, partner not Russia
  { reporter_code: 842, reporter_name: "USA", partner_code: 682, flow_code: "M", hs_code: "2709", period: "2024", value_usd: "5000", fetched_at: "2026-07-03 09:00:00+00" },
];

/** Behavioral fake: applies the parameterized cohort WHERE clause the way
 *  Postgres would, so the tests prove the FILTER semantics, not just SQL text. */
function installCohortAwareQuery(rows = STORED_ROWS) {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    expect(sql).toContain(TRADE_COHORT_SQL); // both queries share ONE cohort definition
    const [partner, flow] = params as [number, string];
    const cohort = rows.filter((r) => r.partner_code === partner && r.flow_code === flow);
    if (/min\(fetched_at\)/.test(sql)) {
      const sorted = cohort.map((r) => r.fetched_at).sort();
      return {
        rows: [{ oldest: sorted[0] ?? null, newest: sorted[sorted.length - 1] ?? null }],
      };
    }
    return { rows: cohort };
  });
}

beforeEach(() => {
  queryMock.mockReset();
  endMock.mockReset();
  endMock.mockResolvedValue(undefined);
});

describe("tradeFetchWindow — provenance derives from the displayed cohort only", () => {
  it("ignores the materials job's newer import rows (flow M) and unrelated partners", async () => {
    installCohortAwareQuery();
    const w = await tradeFetchWindow("X");
    // The newest EXPORT-cohort fetch, not the 2026-07-03 materials fetch.
    expect(w).toEqual({ oldest: "2026-06-02 09:00:00+00", newest: "2026-06-02 09:05:00+00" });
    expect(queryMock.mock.calls[0][1]).toEqual([643, "X"]);
  });

  it("a newer relevant export row DOES move the window", async () => {
    installCohortAwareQuery([
      ...STORED_ROWS,
      { reporter_code: 792, reporter_name: "Türkiye", partner_code: 643, flow_code: "X", hs_code: "87", period: "2024", value_usd: "500", fetched_at: "2026-07-10 12:00:00+00" },
    ]);
    const w = await tradeFetchWindow("X");
    expect(w?.newest).toBe("2026-07-10 12:00:00+00");
    expect(w?.oldest).toBe("2026-06-02 09:00:00+00");
  });

  it("returns null on an empty cohort — never a borrowed date", async () => {
    installCohortAwareQuery([STORED_ROWS[2], STORED_ROWS[3]]); // only materials rows exist
    expect(await tradeFetchWindow("X")).toBeNull();
  });

  it("shares the exact cohort WHERE clause with getDivergence (drift-proof by construction)", async () => {
    installCohortAwareQuery();
    await tradeFetchWindow("X");
    await getDivergence("X");
    for (const [sql, params] of queryMock.mock.calls) {
      expect(sql).toContain(TRADE_COHORT_SQL);
      expect(params).toEqual([643, "X"]);
    }
  });

  it("getDivergence over the fake sees only the export cohort", async () => {
    installCohortAwareQuery();
    const rows = await getDivergence("X");
    // 842/M and 682/M rows are outside the cohort; only X-to-Russia reporters remain.
    const reporters = new Set(rows.map((r) => r.reporterCode));
    expect(reporters.has(842)).toBe(false);
  });
});

describe("fetchWindowLabel — wording never overstates freshness", () => {
  it("single date when the whole cohort was fetched the same day", () => {
    expect(
      fetchWindowLabel({ oldest: "2026-06-02 09:00:00+00", newest: "2026-06-02 11:00:00+00" }),
    ).toBe("last fetched 2026-06-02");
  });

  it("explicit range when reporters refreshed at different times", () => {
    expect(
      fetchWindowLabel({ oldest: "2026-06-02 09:00:00+00", newest: "2026-07-10 12:00:00+00" }),
    ).toBe("fetched between 2026-06-02 and 2026-07-10");
  });

  it("null window renders nothing", () => {
    expect(fetchWindowLabel(null)).toBeNull();
  });
});
