import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// Pool mocked with SQL-text dispatch (limits.test.ts convention); the atomic
// arithmetic itself is proven on real Postgres in src/integration/ask-runs.itest.ts —
// these tests pin the module's decision logic and fail-closed shapes.
const h = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(),
  expireResvMock: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));
vi.mock("../usage/reservations", () => ({
  expireStaleReservations: h.expireResvMock,
}));

const { askRunsEnforce, createRun, finalizeRun, reserveAllowance, expireStaleRuns } =
  await import("./runs");

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.expireResvMock.mockResolvedValue({ released: 0, ceilingSettled: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const RUN_ROW = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  user_email: "u@x.com",
  status: "created",
  state: null,
  result: null,
  finished_at: null,
  expired: false,
};

describe("askRunsEnforce", () => {
  it("only the literal '1' enforces", () => {
    expect(askRunsEnforce()).toBe(false);
    vi.stubEnv("ASK_RUNS_ENFORCE", "true");
    expect(askRunsEnforce()).toBe(false);
    vi.stubEnv("ASK_RUNS_ENFORCE", "1");
    expect(askRunsEnforce()).toBe(true);
  });
});

describe("createRun", () => {
  it("fresh insert returns replayed=false", async () => {
    h.queryMock.mockImplementation(async (sql: string) =>
      String(sql).includes("INSERT INTO ask_runs") ? { rows: [RUN_ROW] } : { rows: [] },
    );
    const r = await createRun({ runId: RUN_ROW.id, userEmail: "u@x.com", question: "q", idempotencyKey: "k1" });
    expect(r.replayed).toBe(false);
    expect(r.run.id).toBe(RUN_ROW.id);
    expect(h.endMock).toHaveBeenCalled();
  });

  it("conflict resolves the EXISTING run and reports replayed=true", async () => {
    const existing = { ...RUN_ROW, id: "11111111-2222-4333-8444-555555555555", status: "finished", state: "answered", result: { answer: "stored" }, finished_at: "2026-07-19T00:00:00Z" };
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_runs")) return { rows: [] }; // conflict
      if (String(sql).includes("FROM ask_runs")) return { rows: [existing] };
      return { rows: [] };
    });
    const r = await createRun({ runId: RUN_ROW.id, userEmail: "u@x.com", question: "q", idempotencyKey: "k1" });
    expect(r.replayed).toBe(true);
    expect(r.run.id).toBe(existing.id);
    expect(r.run.finishedAt).toBe(existing.finished_at);
    expect(r.run.result).toEqual({ answer: "stored" });
  });

  it("conflict with no resolvable row throws (caller fails closed)", async () => {
    h.queryMock.mockResolvedValue({ rows: [] });
    await expect(
      createRun({ runId: RUN_ROW.id, userEmail: "u@x.com", question: "q", idempotencyKey: "k1" }),
    ).rejects.toThrow("conflict resolution");
  });
});

describe("reserveAllowance", () => {
  it("insert wins -> ok and the run is marked authorized", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_allowance_reservations")) return { rows: [{ slot: 3 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const r = await reserveAllowance({ runId: RUN_ROW.id, userEmail: "u@x.com", limit: 5 });
    expect(r.ok).toBe(true);
    const authorize = h.queryMock.mock.calls.find((c) => String(c[0]).includes("status = 'authorized'"));
    expect(authorize).toBeTruthy();
  });

  it("zero rows + run already holds a slot -> ok (replay reuses its slot)", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_allowance_reservations")) return { rows: [], rowCount: 0 };
      if (String(sql).includes("SELECT 1 FROM ask_allowance_reservations")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect((await reserveAllowance({ runId: RUN_ROW.id, userEmail: "u@x.com", limit: 5 })).ok).toBe(true);
  });

  it("zero rows + no held slot -> user_limit refusal", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_allowance_reservations")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const r = await reserveAllowance({ runId: RUN_ROW.id, userEmail: "u@x.com", limit: 5 });
    expect(r).toEqual({ ok: false, reason: "user_limit" });
  });

  it("three consecutive slot collisions -> conservative 'unavailable' refusal", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO ask_allowance_reservations")) {
        throw new Error('duplicate key value violates unique constraint "ask_allowance_user_day_slot_idx"');
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await reserveAllowance({ runId: RUN_ROW.id, userEmail: "u@x.com", limit: 5 });
    expect(r).toEqual({ ok: false, reason: "unavailable" });
    const inserts = h.queryMock.mock.calls.filter((c) => String(c[0]).includes("INSERT INTO ask_allowance_reservations"));
    expect(inserts).toHaveLength(3); // bounded retry
  });

  it("any other DB failure fails CLOSED as 'unavailable'", async () => {
    h.queryMock.mockRejectedValue(new Error("connection refused"));
    const r = await reserveAllowance({ runId: RUN_ROW.id, userEmail: "u@x.com", limit: 5 });
    expect(r).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("finalizeRun / expireStaleRuns", () => {
  it("finalize returns true only when the conditional update matched", async () => {
    h.queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const result = { answer: "a" } as never;
    expect(await finalizeRun({ runId: RUN_ROW.id, state: "answered", result, settledCostUsd: 0.01 })).toBe(true);
    h.queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await finalizeRun({ runId: RUN_ROW.id, state: "answered", result, settledCostUsd: 0.01 })).toBe(false);
  });

  it("expiry is fail-soft on BOTH sweeps (never blocks the new run)", async () => {
    h.queryMock.mockRejectedValue(new Error("db down"));
    h.expireResvMock.mockRejectedValue(new Error("db down"));
    await expect(expireStaleRuns()).resolves.toBeUndefined();
  });
});
