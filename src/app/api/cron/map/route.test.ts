import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The mutation-critical contract of the 2026-08-15 observability repair: a map
// run stopped by a daily/total/unset-cap budget refusal MUST record
// cron_runs.ok=false and return a machine-readable classification. 418
// consecutive budget-stopped production runs had recorded ok=true while
// doc_claims starved — these tests run the REAL withCronRun over a mocked @/db
// so the ok flag written to cron_runs is asserted, not inferred.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.CRON_SECRET = "test-secret";

const { runMapCycle, runScheduledMapHealth, dbQuery } = vi.hoisted(() => ({
  runMapCycle: vi.fn(),
  runScheduledMapHealth: vi.fn().mockResolvedValue(undefined),
  dbQuery: vi.fn(),
}));

vi.mock("@/lib/analysis/map-worker", () => ({ runMapCycle }));
vi.mock("@/lib/analysis/map-health", () => ({ runScheduledMapHealth }));
vi.mock("@/db", () => ({ rawSql: { query: dbQuery } }));

const { GET } = await import("./route");

function req(query = "", auth: string | null = "Bearer test-secret") {
  return new NextRequest(`https://bnow.net/api/cron/map${query}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

/** the ok value the route wrote to cron_runs (UPDATE ... SET ok = $2 ...) */
function writtenOk(): boolean | null {
  const update = dbQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE cron_runs"));
  return update ? (update[1] as unknown[])[1] as boolean : null;
}

function writtenError(): string | null {
  const update = dbQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE cron_runs"));
  return update ? ((update[1] as unknown[])[2] as string | null) : null;
}

beforeEach(() => {
  runMapCycle.mockReset();
  runScheduledMapHealth.mockClear();
  dbQuery.mockReset();
  dbQuery.mockImplementation(async (sql: string) =>
    String(sql).includes("INSERT INTO cron_runs") ? [{ id: 7 }] : [],
  );
});

function cycleResult(extra: Record<string, unknown>) {
  runMapCycle.mockImplementation(async (_opts, counts: Record<string, unknown>) => {
    Object.assign(counts, { selected: 1000, claims: 0, llmCalls: 0 }, extra);
    return counts;
  });
}

describe("auth and validation", () => {
  it("401 without the cron secret — no map work", async () => {
    const res = await GET(req("", "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runMapCycle).not.toHaveBeenCalled();
  });

  it("400 on a malformed date", async () => {
    const res = await GET(req("?date=2026-8-1"));
    expect(res.status).toBe(400);
    expect(runMapCycle).not.toHaveBeenCalled();
  });

  it("400 on a malformed after cursor or an unknown track", async () => {
    expect((await GET(req("?remap=1&after=abc"))).status).toBe(400);
    expect((await GET(req("?remap=1&track=vibes"))).status).toBe(400);
    expect(runMapCycle).not.toHaveBeenCalled();
  });

  it("400 on a malformed or zero cap — a bound must never be silently removed", async () => {
    // cap=0 yields LIMIT 0 -> selected=0, which the remap driver's sweep logic
    // reads as "day drained" (independent spend review 2026-08-21, MINOR-2)
    for (const bad of ["0", "00", "abc", "-1", "2.5", "1,000", " ", "NaN", "Infinity"]) {
      const res = await GET(req(`?cap=${encodeURIComponent(bad)}`));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad cap" });
    }
    expect(runMapCycle).not.toHaveBeenCalled();
  });

  it("a valid cap still rides through to the worker", async () => {
    runMapCycle.mockResolvedValueOnce({});
    const res = await GET(req("?cap=250&dry=1"));
    expect(res.status).toBe(200);
    expect(runMapCycle).toHaveBeenCalledWith(
      expect.objectContaining({ docCap: 250 }),
      expect.anything(),
    );
  });

  it("400 when after/track are passed without remap=1", async () => {
    expect((await GET(req("?after=10"))).status).toBe(400);
    expect((await GET(req("?track=military"))).status).toBe(400);
    expect(runMapCycle).not.toHaveBeenCalled();
  });
});

describe("remap mode", () => {
  it("records job map:remap, forwards remap opts, and skips the health check", async () => {
    cycleResult({ claims: 7, maxSelectedId: 4200 });
    const res = await GET(req("?remap=1&date=2026-07-30&theater=ir&after=100&track=military"));
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true);
    expect(runScheduledMapHealth).not.toHaveBeenCalled();
    expect(runMapCycle.mock.calls[0][0]).toMatchObject({
      date: "2026-07-30",
      theaters: ["ir"],
      remap: true,
      afterId: 100,
      track: "military",
    });
    const insert = dbQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO cron_runs"));
    expect((insert![1] as unknown[])[0]).toBe("map:remap");
  });

  it("a remap budget stop is classified exactly like a backfill stop", async () => {
    cycleResult({ budgetStop: "daily", budgetStopCode: "daily_usd", budgetStopCategory: "daily_cap" });
    const res = await GET(req("?remap=1&date=2026-07-30&theater=ir"));
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(false);
    expect(writtenOk()).toBe(false);
  });

  it("a dry remap run writes nothing and returns the estimate counts", async () => {
    cycleResult({ estUsd: 0.3, remapVersions: { "military:ir": "v" } });
    const res = await GET(req("?remap=1&dry=1&date=2026-07-30&theater=ir"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.dryRun).toBe(true);
    expect(dbQuery).not.toHaveBeenCalled();
    expect(runScheduledMapHealth).not.toHaveBeenCalled();
  });
});

describe("budget-stop health classification (cron_runs.ok)", () => {
  it("a total-cap stop records ok=false and returns the classification", async () => {
    cycleResult({
      budgetStop: "llm: budget stop — openai_map: total spend $10.0083 >= cap $10",
      budgetStopCode: "total_usd",
      budgetStopCategory: "total_cap",
    });
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.unhealthy).toBe("budget_stop");
    expect(body.budgetStopCategory).toBe("total_cap");
    expect((body.counts as Record<string, unknown>).selected).toBe(1000);
    expect(writtenOk()).toBe(false);
    expect(writtenError()).toContain("total spend $10.0083");
  });

  it("a daily-cap stop also records ok=false", async () => {
    cycleResult({ budgetStop: "daily", budgetStopCode: "daily_usd", budgetStopCategory: "daily_cap" });
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.budgetStopCategory).toBe("daily_cap");
    expect(writtenOk()).toBe(false);
  });

  it("cap_unset (fail-closed misconfiguration) records ok=false", async () => {
    cycleResult({ budgetStop: "unset", budgetStopCode: "cap_unset", budgetStopCategory: "cap_unset" });
    const res = await GET(req());
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(false);
    expect(writtenOk()).toBe(false);
  });

  it("the benign per-run request ceiling stays ok=true (the next run resumes)", async () => {
    cycleResult({ budgetStop: "run", budgetStopCode: "run_requests", budgetStopCategory: "run_cap" });
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(writtenOk()).toBe(true);
  });

  it("a clean productive run stays ok=true", async () => {
    cycleResult({ claims: 42, llmCalls: 5 });
    const res = await GET(req());
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true);
    expect(writtenOk()).toBe(true);
  });

  it("a run the worker marked degraded (batch errors) records ok=false with error NULL (#87)", async () => {
    cycleResult({
      claims: 42,
      llmCalls: 5,
      batchErrors: 2,
      batchErrorClasses: { invalid_body: 1, server_error: 1 },
      degraded: { category: "batch_errors", batchErrors: 2 },
    });
    const res = await GET(req());
    // the HTTP body still reports the cycle result; only the durable row flips
    expect(res.status).toBe(200);
    expect(writtenOk()).toBe(false);
    expect(writtenError()).toBeNull();
  });
});

describe("health-check wiring", () => {
  it("steady scheduled runs evaluate map health", async () => {
    cycleResult({ claims: 3 });
    await GET(req());
    expect(runScheduledMapHealth).toHaveBeenCalledTimes(1);
  });

  it("driver-paced backfill runs (?date=) do not evaluate health, but still classify stops", async () => {
    cycleResult({ budgetStop: "daily", budgetStopCode: "daily_usd", budgetStopCategory: "daily_cap" });
    const res = await GET(req("?date=2026-07-30&theater=ir"));
    expect(runScheduledMapHealth).not.toHaveBeenCalled();
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(false);
    expect(writtenOk()).toBe(false);
    // the theater constraint reached the worker
    expect(runMapCycle.mock.calls[0][0]).toMatchObject({ date: "2026-07-30", theaters: ["ir"] });
  });

  it("dry runs write nothing: no cron_runs row, no health evaluation", async () => {
    cycleResult({ estUsd: 0.12 });
    const res = await GET(req("?dry=1&date=2026-07-30"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.dryRun).toBe(true);
    expect(runScheduledMapHealth).not.toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled();
  });
});
