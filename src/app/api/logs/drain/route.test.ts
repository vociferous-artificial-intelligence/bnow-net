import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The route's own contract: the drain signature is its whole authorization
// (there is no gate to place — ruling 21 is about pages), an unset secret
// fails closed BEFORE the body is read, and no rejected request reaches the
// database. @/db is mocked as a SPY, not a no-op, so "never touched the
// database" is an assertion rather than a hope.
const dbQuery = vi.fn(async (text: string, params?: unknown[]) => {
  void text;
  void params;
  return [] as Array<{ id: string }>;
});
vi.mock("@/db", () => ({ rawSql: { query: dbQuery } }));

const { POST } = await import("./route");
const { resetDrainSweepThrottle, DRAIN_ROUTE_PATH } = await import("@/lib/logs/drain");

const SECRET = "route-drain-secret";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha1", secret).update(Buffer.from(body, "utf8")).digest("hex");

function post(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://bnow.net/api/logs/drain", { method: "POST", body, headers });
}

function signed(body: string): NextRequest {
  return post(body, { "x-vercel-signature": sign(body) });
}

function line(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: `id-${Math.random().toString(36).slice(2)}`,
    deploymentId: "dpl_test",
    source: "lambda",
    timestamp: 1_757_000_000_000,
    level: "info",
    message: "hello",
    path: "/api/cron/map",
    ...over,
  });
}

const ENV = ["LOG_DRAIN_SECRET", "LOG_DRAIN_MAX_ROWS", "LOG_DRAIN_MAX_BODY_BYTES"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.LOG_DRAIN_SECRET = SECRET;
  dbQuery.mockClear();
  dbQuery.mockImplementation(async (text: string) =>
    /INSERT INTO runtime_logs/.test(text) ? [{ id: "stored" }] : [],
  );
  resetDrainSweepThrottle();
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("drain receiver authorization", () => {
  it("503s and touches nothing when LOG_DRAIN_SECRET is unset (fail closed)", async () => {
    delete process.env.LOG_DRAIN_SECRET;
    const res = await POST(signed(line()));
    expect(res.status).toBe(503);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("503s on a blank secret too", async () => {
    process.env.LOG_DRAIN_SECRET = "   ";
    expect((await POST(signed(line()))).status).toBe(503);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("403s a missing signature and writes nothing", async () => {
    const res = await POST(post(line()));
    expect(res.status).toBe(403);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("403s a signature made with the wrong secret and writes nothing", async () => {
    const body = line();
    const res = await POST(post(body, { "x-vercel-signature": sign(body, "wrong") }));
    expect(res.status).toBe(403);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("403s when the body was altered after signing, and leaks no data in the body", async () => {
    const signature = sign(line({ id: "a" }));
    const res = await POST(post(line({ id: "b" }), { "x-vercel-signature": signature }));
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "invalid signature" }));
    expect(text).not.toContain("runtime_logs");
    expect(text).not.toContain("id-");
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed batch", async () => {
    const body = `${line({ id: "a" })}\n${line({ id: "b" })}`;
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, received: 2, stored: 1, dropped: 0 });
    const inserts = dbQuery.mock.calls.filter(([t]) => /INSERT INTO runtime_logs/.test(t));
    expect(inserts).toHaveLength(1);
  });
});

describe("drain receiver bounds and behaviour", () => {
  it("drops its own invocations before the insert (self-ingestion loop)", async () => {
    const body = [line({ id: "self", path: DRAIN_ROUTE_PATH }), line({ id: "keep" })].join("\n");
    const res = await POST(signed(body));
    const json = (await res.json()) as { dropped: number };
    expect(json.dropped).toBe(1);
    const [, params] = dbQuery.mock.calls.find(([t]) => /INSERT INTO runtime_logs/.test(t))!;
    expect(JSON.stringify(params)).not.toContain(DRAIN_ROUTE_PATH);
  });

  it("caps the batch and never blocks on the overflow", async () => {
    process.env.LOG_DRAIN_MAX_ROWS = "3";
    const body = Array.from({ length: 10 }, (_, i) => line({ id: `x${i}` })).join("\n");
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: 10, dropped: 7 });
  });

  it("answers 200 with stored 0 for an oversized body — never a retryable status", async () => {
    process.env.LOG_DRAIN_MAX_BODY_BYTES = "10";
    const res = await POST(signed(line()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stored: 0, reason: "body_over_cap" });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("answers 200 with stored 0 for an unparseable body", async () => {
    const res = await POST(signed("this is not json at all"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stored: 0, dropped: 1 });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("answers 200 with stored 0 for an empty body", async () => {
    const res = await POST(signed(""));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, received: 0, stored: 0 });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("500s when the insert fails, so Vercel retries a real batch", async () => {
    dbQuery.mockImplementation(async () => {
      throw new Error("connection terminated");
    });
    const res = await POST(signed(line()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "store failed" });
  });

  it("sweeps once per process and never lets a sweep failure break ingestion", async () => {
    dbQuery.mockImplementation(async (text: string) => {
      if (/DELETE FROM runtime_logs/.test(text)) throw new Error("sweep boom");
      return [{ id: "stored" }];
    });
    const first = await POST(signed(line()));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, stored: 1 });
    expect(dbQuery.mock.calls.filter(([t]) => /DELETE FROM runtime_logs/.test(t))).toHaveLength(1);

    // second delivery in the same process: throttled, no second sweep attempt
    dbQuery.mockClear();
    dbQuery.mockImplementation(async () => [{ id: "stored" }]);
    await POST(signed(line()));
    expect(dbQuery.mock.calls.filter(([t]) => /DELETE FROM runtime_logs/.test(t))).toHaveLength(0);
  });

  it("writes no cron_runs row and runs no cron rider (ruling 10 untouched)", async () => {
    await POST(signed(line()));
    const sqlSeen = dbQuery.mock.calls.map(([t]) => t).join("\n");
    expect(sqlSeen).not.toMatch(/cron_runs/i);
    expect(sqlSeen).not.toMatch(/provider_state/i);
  });

  it("exports no GET handler — there is nothing to read back out of this route", async () => {
    const mod = (await import("./route")) as Record<string, unknown>;
    expect(mod.GET).toBeUndefined();
    expect(typeof mod.POST).toBe("function");
  });
});
