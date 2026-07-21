import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// Release hardening: the retention sweep's decision logic — what runs when,
// which cutoffs apply, what is preserved. The SQL effects are proven on real
// Postgres in src/integration/ask-retention.itest.ts.

const h = vi.hoisted(() => ({ queryMock: vi.fn(), endMock: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));

const { sweepAskRetention, sweepAskRetentionThrottled, resetRetentionSweepThrottle, RETENTION_SWEEP_INTERVAL_MS } =
  await import("./retention");

const NOW = new Date("2026-07-21T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [], rowCount: 2 });
  resetRetentionSweepThrottle();
});
afterEach(() => vi.unstubAllEnvs());

function sqlCalls(): string[] {
  return h.queryMock.mock.calls.map((c) => String(c[0]));
}

describe("sweepAskRetention", () => {
  it("does NOTHING (and returns null) without valid retention configuration", async () => {
    const r = await sweepAskRetention(NOW);
    expect(r).toBeNull();
    expect(h.queryMock).not.toHaveBeenCalled();
  });

  it("rollback safety: sweeps on RAW retention config even with every feature flag off", async () => {
    // no ASK_RUNS_ENFORCE / ASK_RUNS_SHADOW — flags fully rolled back
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
    const r = await sweepAskRetention(NOW);
    expect(r).not.toBeNull();
    expect(h.queryMock).toHaveBeenCalled(); // hygiene continues during rollback
  });

  it("redacts run/usage content, deletes events/cache/idle sessions at the configured cutoffs; accounting survives", async () => {
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
    vi.stubEnv("ASK_EVENTS_RETENTION_DAYS", "7");
    const r = await sweepAskRetention(NOW);
    expect(r).toEqual({
      runsRedacted: 2,
      usageRedacted: 2,
      eventsDeleted: 2,
      cacheDeleted: 2,
      sessionsDeleted: 2,
    });
    const sqls = sqlCalls();
    const runs = h.queryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE ask_runs"));
    expect(String(runs![0])).toContain("question = '[deleted]'");
    expect(String(runs![0])).toContain("result = NULL");
    expect(String(runs![0])).toContain("evidence_snapshot = NULL");
    expect(String(runs![0])).toContain("idempotency_key = 'expired:' || id::text");
    // the accounting columns are never touched by the redaction statement
    expect(String(runs![0])).not.toMatch(/settled_cost_usd|units|status|state/);
    expect(runs![1]).toEqual([new Date("2026-06-21T12:00:00Z").toISOString()]); // 30 days
    const events = h.queryMock.mock.calls.find((c) => String(c[0]).includes("DELETE FROM ask_run_events"));
    expect(events![1]).toEqual([new Date("2026-07-14T12:00:00Z").toISOString()]); // 7 days
    expect(sqls.some((s) => s.includes("UPDATE ask_usage SET question = '[deleted]'"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_answer_cache"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_turns"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_sessions"))).toBe(true);
  });

  it("cache rows sweep at min(cache TTL, content retention)", async () => {
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
    vi.stubEnv("ASK_CACHE_TTL_DAYS", "3");
    await sweepAskRetention(NOW);
    const cache = h.queryMock.mock.calls.find((c) => String(c[0]).includes("DELETE FROM ask_answer_cache"));
    expect(cache![1]).toEqual([new Date("2026-07-18T12:00:00Z").toISOString()]); // 3 days
  });
});

describe("sweepAskRetentionThrottled", () => {
  it("runs at most once per interval and never throws on failure", async () => {
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
    await sweepAskRetentionThrottled(NOW);
    const first = h.queryMock.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    await sweepAskRetentionThrottled(new Date(NOW.getTime() + 1000));
    expect(h.queryMock.mock.calls.length).toBe(first); // throttled

    await sweepAskRetentionThrottled(new Date(NOW.getTime() + RETENTION_SWEEP_INTERVAL_MS + 1000));
    expect(h.queryMock.mock.calls.length).toBeGreaterThan(first); // interval elapsed

    // failure is swallowed (housekeeping never costs an answer)
    resetRetentionSweepThrottle();
    h.queryMock.mockRejectedValue(new Error("db down"));
    await expect(sweepAskRetentionThrottled(NOW)).resolves.toBeUndefined();
  });
});
