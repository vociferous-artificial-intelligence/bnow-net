import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// Auth mocked to an accepted user; the DB is a SQL-dispatch Pool mock. The
// persisted-event truths (sequences, replay equality, snapshots) are proven on
// real Postgres in src/integration/ — these tests pin the ROUTE semantics:
// ownership 404s, free-of-provider-calls replay, SSE shape, terminal close.
vi.mock("@/lib/gate", () => ({
  requireAcceptedUser: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}));

const h = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(),
  askWithLimitsMock: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));
vi.mock("@/lib/ask/limits", () => ({
  askWithLimits: (...args: unknown[]) => h.askWithLimitsMock(...args),
}));

const { POST: postRun } = await import("./route");
const { GET: getEvents } = await import("./[id]/events/route");
const { POST: postCancel } = await import("./[id]/cancel/route");

const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [{ at: "2026-07-19T00:00:00Z" }] });
});

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(`https://bnow.net${url}`, init as never);
}

describe("POST /api/ask/runs — the progressive paid submission", () => {
  it("streams run.ref, forwards persisted events, terminates with run.completed", async () => {
    h.askWithLimitsMock.mockImplementation(
      async (_q: string, _email: string, opts: { sink: { emit(t: string, p: object): Promise<void> }; runId: string }) => {
        await opts.sink.emit("run.created", {});
        await opts.sink.emit("run.authorized", {});
        return { answer: "A [c1].", state: "answered", provider: "openai:gpt-5", citedClaimIds: [1], evidenceCount: 1, terms: [], relatedClaimIds: [], window: null, totalMatching: 1, sampled: false, retrievalMode: "v2", runId: opts.runId };
      },
    );
    const res = await postRun(
      req("/api/ask/runs", {
        method: "POST",
        body: JSON.stringify({ question: "what happened in kherson" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    const body = await new Response(res.body).text();

    expect(body).toMatch(/^event: run\.ref\ndata: \{"runId":"[0-9a-f-]{36}"\}/);
    expect(body).toContain("event: run.created");
    expect(body).toContain("event: run.authorized");
    expect(body).toContain("event: run.completed");
    expect(body.indexOf("run.created")).toBeLessThan(body.indexOf("run.completed"));
    // the terminal event carries the full result payload
    expect(body).toContain('"answer":"A [c1]."');
    // money path: the ONE askWithLimits call received sink + runId + key opts
    expect(h.askWithLimitsMock).toHaveBeenCalledTimes(1);
    const opts = h.askWithLimitsMock.mock.calls[0][2] as { sink: unknown; runId: string; idempotencyKey?: string };
    expect(opts.sink).toBeTruthy();
    expect(opts.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses a too-short question with 400 before any pipeline call", async () => {
    const res = await postRun(
      req("/api/ask/runs", { method: "POST", body: JSON.stringify({ question: "hi" }), headers: { "content-type": "application/json" } }),
    );
    expect(res.status).toBe(400);
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("an unexpected askWithLimits throw still terminates the stream with run.failed (no message text)", async () => {
    h.askWithLimitsMock.mockRejectedValue(new Error("secret internals"));
    const res = await postRun(
      req("/api/ask/runs", { method: "POST", body: JSON.stringify({ question: "what happened" }), headers: { "content-type": "application/json" } }),
    );
    const body = await new Response(res.body).text();
    expect(body).toContain("event: run.failed");
    expect(body).toContain('"errorClass":"route_throw"');
    expect(body).not.toContain("secret internals");
  });
});

describe("GET /api/ask/runs/[id]/events — ownership-gated replay", () => {
  function eventsRows(rows: Array<{ seq: number; type: string; payload: object }>) {
    return rows.map((r) => ({ ...r, at: "t" }));
  }

  it("replays seq > after and closes after the terminal event; ZERO provider calls", async () => {
    h.queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      if (String(sql).includes("FROM ask_run_events")) {
        expect(params?.[1]).toBe(2); // after= threaded into the replay query
        return {
          rows: eventsRows([
            { seq: 3, type: "answer.started", payload: {} },
            { seq: 4, type: "run.completed", payload: { result: { answer: "A" } } },
          ]),
        };
      }
      return { rows: [] };
    });
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events?after=2`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    const body = await new Response(res.body).text();
    expect(body).toContain("id: 3\nevent: answer.started");
    expect(body).toContain("id: 4\nevent: run.completed");
    expect(h.askWithLimitsMock).not.toHaveBeenCalled(); // read-only by construction
  });

  it("another user's run is a 404 (never confirm a foreign run exists)", async () => {
    h.queryMock.mockImplementation(async (sql: string) =>
      String(sql).includes("SELECT user_email")
        ? { rows: [{ user_email: "someone-else@example.com" }] }
        : { rows: [] },
    );
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("unknown run id and malformed id are 404", async () => {
    h.queryMock.mockResolvedValue({ rows: [] });
    expect(
      (await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), { params: Promise.resolve({ id: RUN_ID }) })).status,
    ).toBe(404);
    expect(
      (await getEvents(req(`/api/ask/runs/not-a-uuid/events`), { params: Promise.resolve({ id: "not-a-uuid" }) }))
        .status,
    ).toBe(404);
  });

  it("tails until the terminal event arrives on a later poll", async () => {
    let poll = 0;
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      if (String(sql).includes("FROM ask_run_events")) {
        poll++;
        if (poll === 1) return { rows: eventsRows([{ seq: 1, type: "run.created", payload: {} }]) };
        return { rows: eventsRows([{ seq: 2, type: "run.completed", payload: { result: {} } }]) };
      }
      return { rows: [] };
    });
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    const body = await new Response(res.body).text();
    expect(poll).toBeGreaterThanOrEqual(2); // it actually polled
    expect(body).toContain("event: run.created");
    expect(body).toContain("event: run.completed");
  }, 15_000);
});

describe("POST /api/ask/runs/[id]/cancel — Phase 2 stub", () => {
  it("owner: records the idempotent marker and answers honestly (effective phase-3)", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      return { rows: [], rowCount: 1 };
    });
    const res = await postCancel(req(`/api/ask/runs/${RUN_ID}/cancel`, { method: "POST" }), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: true, effective: "phase-3" });
    const insert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_run_events"));
    expect(String(insert![0])).toContain("cancel_requested");
    expect(String(insert![0])).toContain("ON CONFLICT (run_id, seq) DO NOTHING");
  });

  it("non-owner is a 404 and nothing is written", async () => {
    h.queryMock.mockImplementation(async (sql: string) =>
      String(sql).includes("SELECT user_email")
        ? { rows: [{ user_email: "someone-else@example.com" }] }
        : { rows: [] },
    );
    const res = await postCancel(req(`/api/ask/runs/${RUN_ID}/cancel`, { method: "POST" }), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    expect(res.status).toBe(404);
    expect(h.queryMock.mock.calls.some((c) => String(c[0]).includes("INSERT"))).toBe(false);
  });
});
