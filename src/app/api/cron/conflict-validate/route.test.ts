import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mirrors validate/route.test.ts: the REAL withCronRun (its lazy @/db mocked)
// plus a mocked discoverEditions, so the tests pin the route's accounting and
// its #87 degraded discipline rather than the discovery module's behaviour.
// typed explicitly (rather than inferred from the implementation) so
// `mock.calls` keeps the params slot without an unused implementation parameter
const dbQuery = vi.fn<(sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>>(
  async (sql) => (/INSERT INTO cron_runs/.test(String(sql)) ? [{ id: 11 }] : []),
);
vi.mock("@/db", () => ({ rawSql: { query: dbQuery } }));

const discoverEditions = vi.fn();
vi.mock("@/lib/isw/edition-discovery", () => ({
  discoverEditions: (...a: unknown[]) => discoverEditions(...a),
}));

const { GET, DEFAULT_LOOKBACK, MAX_LOOKBACK } = await import("./route");

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/conflict-validate${query}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

function written(): { ok: boolean; error: string | null; counts: Record<string, unknown> } {
  const call = dbQuery.mock.calls.find(
    ([sql, params]) => /UPDATE cron_runs/.test(String(sql)) && Array.isArray(params),
  );
  expect(call).toBeDefined();
  const args = call![1] as unknown[];
  return {
    ok: args[1] as boolean,
    error: args[2] as string | null,
    counts: JSON.parse(args[3] as string) as Record<string, unknown>,
  };
}

const found = (over: Record<string, unknown> = {}) => ({
  editions: [
    { editionKey: "k", label: "evening", action: "inserted", parseStatus: "parsed", units: 3, anchoredReportId: 1 },
  ],
  dayStatus: "published",
  dayStatusAction: "editions_found",
  probes: [{}, {}, {}, {}],
  probeFailures: 0,
  probeIndeterminate: 0,
  probeIndeterminateReasons: { throttled: 0, unparseable_body: 0 },
  dayStatusReason: null,
  anchored: 1,
  ...over,
});

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  dbQuery.mockClear();
  discoverEditions.mockReset();
  discoverEditions.mockResolvedValue(found());
});

describe("conflict-validate auth and parameter refusals (before any run row)", () => {
  it("401s without the cron secret and opens no run row", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/conflict-validate", { headers: {} }),
    );
    expect(res.status).toBe(401);
    expect(dbQuery).not.toHaveBeenCalled();
    expect(discoverEditions).not.toHaveBeenCalled();
  });

  it("401s BEFORE parameter validation: an unauthenticated malformed request never gets a 400", async () => {
    // WS3-F09 / mutant M9. The gate IS first in the shipped code, but nothing
    // pinned the ORDER: every 401 case used VALID parameters and every 400 case
    // carried the secret, so moving the auth block below the checks passed
    // 11 / 11. An anonymous caller must learn nothing about parameter
    // validation, and a future reordering that slipped a query above the gate
    // must fail here (ruling 21's spirit, for a cron route).
    for (const q of [
      "?date=08-26-2026",
      "?date=2026-02-30",
      "?lookback=0",
      `?lookback=${MAX_LOOKBACK + 1}`,
      "?lookback=all",
      "?conflict=syria",
      "?date=08-26-2026&lookback=99&conflict=syria",
    ]) {
      dbQuery.mockClear();
      discoverEditions.mockClear();
      const res = await GET(
        new NextRequest(`http://localhost/api/cron/conflict-validate${q}`, { headers: {} }),
      );
      expect(res.status, q).toBe(401);
      expect(await res.json(), q).toEqual({ error: "unauthorized" });
      expect(dbQuery, q).not.toHaveBeenCalled();
      expect(discoverEditions, q).not.toHaveBeenCalled();
    }
  });

  it("401s when CRON_SECRET is unset, even with a bearer header (fail-closed)", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const res = await GET(
        new NextRequest("http://localhost/api/cron/conflict-validate?date=08-26-2026", {
          headers: { authorization: "Bearer " },
        }),
      );
      expect(res.status).toBe(401);
      expect(dbQuery).not.toHaveBeenCalled();
      expect(discoverEditions).not.toHaveBeenCalled();
    } finally {
      process.env.CRON_SECRET = saved;
    }
  });

  it("400s on a malformed date, an out-of-range lookback, and an unknown conflict", async () => {
    for (const q of [
      "?date=08-26-2026",
      "?date=2026-02-30",
      "?lookback=0",
      `?lookback=${MAX_LOOKBACK + 1}`,
      "?lookback=1.5",
      "?lookback=all",
      "?conflict=syria",
      "?conflict=",
    ]) {
      dbQuery.mockClear();
      const res = await GET(req(q));
      expect(res.status, q).toBe(400);
      // no cron_runs row, and above all no 0028 write for a malformed request
      expect(dbQuery, q).not.toHaveBeenCalled();
      expect(discoverEditions, q).not.toHaveBeenCalled();
    }
  });
});

describe("conflict-validate iteration (C2: the unit of validation is the conflict)", () => {
  it("iterates BOTH conflicts over the lookback window, newest day first", async () => {
    await GET(req("?date=2026-08-26"));
    expect(discoverEditions).toHaveBeenCalledTimes(2 * DEFAULT_LOOKBACK);
    const seen = discoverEditions.mock.calls.map(([, series, day]) => `${series}:${day}`);
    expect(seen).toEqual([
      "roca:2026-08-26",
      "roca:2026-08-25",
      "iran_update:2026-08-26",
      "iran_update:2026-08-25",
    ]);
  });

  it("?conflict= narrows to one definition and records which ones ran", async () => {
    await GET(req("?date=2026-08-26&conflict=iran_regional&lookback=1"));
    expect(discoverEditions).toHaveBeenCalledTimes(1);
    expect(discoverEditions.mock.calls[0][1]).toBe("iran_update");
    const w = written();
    expect(w.counts.conflicts).toEqual(["iran_regional"]);
    expect(w.counts.days).toEqual(["2026-08-26"]);
    expect(w.counts.lookback).toBe(1);
  });

  it("defaults the date to yesterday UTC", async () => {
    await GET(req("?lookback=1"));
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(written().counts.date).toBe(yesterday);
  });
});

describe("conflict-validate counts summary (report-only)", () => {
  it("totals editions, anchors, probes and day statuses across every cell", async () => {
    discoverEditions
      .mockResolvedValueOnce(found())
      .mockResolvedValueOnce(
        found({
          editions: [
            { label: "evening", action: "repaired", parseStatus: "parsed", units: 3, anchoredReportId: null },
            { label: "morning", action: "inserted", parseStatus: "failed", units: 0, anchoredReportId: null },
          ],
          anchored: 0,
        }),
      )
      .mockResolvedValueOnce(found({ editions: [], dayStatus: "probe_failed", probeFailures: 1, anchored: 0 }))
      .mockResolvedValueOnce(found({ editions: [], dayStatus: "publication_gap", anchored: 0 }));

    const res = await GET(req("?date=2026-08-26"));
    expect(res.status).toBe(200);
    const w = written();
    expect(w.ok).toBe(true);
    expect(w.counts.editionsFound).toBe(3);
    expect(w.counts.editionsInserted).toBe(2);
    expect(w.counts.editionsRepaired).toBe(1);
    expect(w.counts.anchored).toBe(1);
    expect(w.counts.probes).toBe(16);
    expect(w.counts.probeFailures).toBe(1);
    expect(w.counts.dayStatuses).toEqual({ published: 2, probe_failed: 1, publication_gap: 1 });
    expect(w.counts.errors).toBe(0);
    expect(w.counts.degraded).toBeUndefined();
    expect(w.counts.cells).toHaveLength(4);
    expect(w.counts.cells).toContainEqual({
      conflict: "iran_regional",
      series: "iran_update",
      date: "2026-08-25",
      editions: 0,
      dayStatus: "publication_gap",
      anchored: 0,
      probeFailures: 0,
    });
  });

  it("reports the #114 indeterminate split and stamps each throttled cell's reason", async () => {
    discoverEditions
      .mockResolvedValueOnce(found())
      .mockResolvedValueOnce(
        found({
          editions: [],
          dayStatus: "probe_failed",
          dayStatusReason: "throttled",
          probeFailures: 2,
          probeIndeterminate: 2,
          probeIndeterminateReasons: { throttled: 2, unparseable_body: 0 },
          anchored: 0,
        }),
      )
      .mockResolvedValueOnce(
        found({
          editions: [],
          dayStatus: "probe_failed",
          dayStatusReason: "unparseable_body",
          probeFailures: 1,
          probeIndeterminate: 1,
          probeIndeterminateReasons: { throttled: 0, unparseable_body: 1 },
          anchored: 0,
        }),
      )
      .mockResolvedValueOnce(found({ editions: [], dayStatus: "probe_failed", anchored: 0 }));

    await GET(req("?date=2026-08-26"));
    const w = written();
    expect(w.ok).toBe(true); // #87: an indeterminate day is still benign
    expect(w.counts.probeIndeterminate).toBe(3);
    expect(w.counts.dayStatusReasons).toEqual({ throttled: 1, unparseable_body: 1 });
    // the reason travels on the cell that has one, and ONLY on that cell
    const cells = w.counts.cells as Array<Record<string, unknown>>;
    expect(cells.filter((c) => "dayStatusReason" in c).map((c) => c.dayStatusReason)).toEqual([
      "throttled",
      "unparseable_body",
    ]);
  });

  it("a probe_failed day is BENIGN: the run stays ok=true (#87 discipline)", async () => {
    discoverEditions.mockResolvedValue(
      found({ editions: [], dayStatus: "probe_failed", probeFailures: 4, anchored: 0 }),
    );
    await GET(req("?date=2026-08-26"));
    const w = written();
    expect(w.ok).toBe(true);
    expect(w.error).toBeNull();
    expect(w.counts.probeFailures).toBe(16);
    expect(w.counts.degraded).toBeUndefined();
  });

  it("a THROWN cell degrades the run and the remaining cells still run", async () => {
    discoverEditions
      .mockResolvedValueOnce(found())
      .mockRejectedValueOnce(new Error("db exploded"))
      .mockResolvedValue(found());
    await GET(req("?date=2026-08-26"));
    expect(discoverEditions).toHaveBeenCalledTimes(4); // the throw did not abort the loop
    const w = written();
    expect(w.ok).toBe(false);
    expect(w.error).toBeNull(); // degraded signature, not a thrown-run shape
    expect(w.counts.errors).toBe(1);
    expect(w.counts.errorMessages).toEqual(["db exploded"]);
    expect(w.counts.degraded).toEqual({ errors: 1, category: "nested_errors" });
    expect(w.counts.editionsFound).toBe(3); // the three healthy cells still counted
  });
});

describe("conflict-validate stays dormant and unscheduled", () => {
  it("is NOT in vercel.json — scheduling is a WS-3.6 operator step", async () => {
    const { readFileSync } = await import("node:fs");
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: Array<{ path: string }>;
    };
    expect(vercel.crons?.some((c) => c.path.includes("conflict-validate"))).toBeFalsy();
  });

  it("declares maxDuration 300, matching its JOB_MAX_DURATION_SEC family entry", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/api/cron/conflict-validate/route.ts", "utf8");
    expect(src).toContain("export const maxDuration = 300;");
    const { JOB_MAX_DURATION_SEC } = await import("@/lib/usage/cron-run");
    expect(JOB_MAX_DURATION_SEC["conflict-validate"]).toBe(300);
  });

  it("writes no citation-registry table and calls no digest/validation path", async () => {
    const { readFileSync } = await import("node:fs");
    // comments are stripped first: the file header NAMES these tables in order
    // to state that it never writes them
    const src = readFileSync("src/app/api/cron/conflict-validate/route.ts", "utf8")
      .replace(/\/\*[^]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    for (const forbidden of [
      "INSERT INTO isw_reports",
      "source_citations",
      "refreshReportCitations",
      "validateDigest",
      "validation_runs",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
