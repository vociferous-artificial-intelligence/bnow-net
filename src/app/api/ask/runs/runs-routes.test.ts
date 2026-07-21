import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  poolCount: { n: 0 },
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    constructor() {
      h.poolCount.n++;
    }
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

// Release hardening: no route module may construct a Pool at import time —
// a build-time import must stay connection-free.
const POOLS_AT_IMPORT = h.poolCount.n;

const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
  h.poolCount.n = 0;
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [{ at: "2026-07-19T00:00:00Z" }] });
  // Release hardening: the POST boundary consults the effective-feature
  // resolver — enable the progressive stack so the route semantics under test
  // are reachable; individual tests unset these to pin the boundary gate.
  vi.stubEnv("ASK_RUNS_ENFORCE", "1");
  vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
  vi.stubEnv("ASK_PROGRESSIVE", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("a terminal-persist failure NEVER rewrites a billed success as run.failed — the terminal is delivered unpersisted (supplementary Gate 2)", async () => {
    h.askWithLimitsMock.mockResolvedValue({
      answer: "Billed answer.",
      state: "answered",
      provider: "openai:gpt-5",
      citedClaimIds: [],
      evidenceCount: 0,
      terms: [],
      relatedClaimIds: [],
      window: null,
      totalMatching: 0,
      sampled: false,
      retrievalMode: "v2",
      runId: RUN_ID,
    });
    // The sink's INSERT for the terminal event fails (transient DB outage
    // after the run row was already finalized inside askWithLimits).
    h.queryMock.mockImplementation(async (_sql: string, params?: unknown[]) => {
      if (params?.[2] === "run.completed") throw new Error("db write refused");
      return { rows: [{ at: "t" }] };
    });
    const res = await postRun(
      req("/api/ask/runs", { method: "POST", body: JSON.stringify({ question: "what happened" }), headers: { "content-type": "application/json" } }),
    );
    const body = await new Response(res.body).text();
    expect(body).toContain("event: run.completed"); // the wire terminal
    expect(body).toContain('"answer":"Billed answer."');
    expect(body).not.toContain("run.failed"); // a billed success is never rewritten
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

  it("a replayed cancel marker never poisons the tail cursor: a LATER terminal still arrives, and the marker forwards exactly once (supplementary Gate 2)", async () => {
    const afterParams: number[] = [];
    let poll = 0;
    h.queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      if (String(sql).includes("FROM ask_run_events")) {
        poll++;
        const after = Number(params?.[1] ?? 0);
        afterParams.push(after);
        // Faithful `seq > after ORDER BY seq` over: marker at 1e6 from poll 1;
        // the orchestrator's run.cancelled (seq 6) persists from poll 2 on.
        const all =
          poll === 1
            ? [{ seq: 1_000_000, type: "cancel_requested", payload: {} }]
            : [
                { seq: 6, type: "run.cancelled", payload: {} },
                { seq: 1_000_000, type: "cancel_requested", payload: {} },
              ];
        return { rows: eventsRows(all.filter((e) => e.seq > after)) };
      }
      return { rows: [] };
    });
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    const body = await new Response(res.body).text();
    // the poll cursor never advanced into the marker range
    expect(afterParams.every((a) => a < 1_000_000)).toBe(true);
    expect(body).toContain("event: run.cancelled"); // the terminal WAS delivered
    // the marker forwarded exactly once despite reappearing on every poll
    expect(body.match(/event: cancel_requested/g)).toHaveLength(1);
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
    // REAL idempotency (supplementary Gate 2 fix): at most one marker per run —
    // the guarded INSERT writes nothing when a marker already exists, so a
    // repeated Stop click cannot append marker rows.
    expect(String(insert![0])).toContain("WHERE NOT EXISTS");
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

// ---- release hardening: server-side feature/cohort boundary ----------------------

describe("POST /api/ask/runs — effective-feature + cohort boundary (release hardening)", () => {
  const post = () =>
    postRun(
      req("/api/ask/runs", {
        method: "POST",
        body: JSON.stringify({ question: "what happened in kherson" }),
        headers: { "content-type": "application/json" },
      }),
    );

  it("404s BEFORE any money path when ASK_PROGRESSIVE is off", async () => {
    vi.stubEnv("ASK_PROGRESSIVE", "");
    const res = await post();
    expect(res.status).toBe(404);
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("404s when ASK_PROGRESSIVE=1 but enforce is not effective (no retention) — fail closed", async () => {
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "");
    const res = await post();
    expect(res.status).toBe(404);
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("404s for a user outside ASK_PROGRESSIVE_COHORT; serves a cohort member", async () => {
    vi.stubEnv("ASK_PROGRESSIVE_COHORT", "insider@example.com");
    const refused = await post();
    expect(refused.status).toBe(404);
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();

    vi.stubEnv("ASK_PROGRESSIVE_COHORT", "Insider@example.com, user@example.com");
    h.askWithLimitsMock.mockResolvedValue({
      answer: "A.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0,
      terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2",
    });
    const served = await post();
    expect(served.status).toBe(200);
    expect(h.askWithLimitsMock).toHaveBeenCalledTimes(1);
  });

  it("read-only events GET stays available with every feature flag off (rollback never orphans runs)", async () => {
    vi.stubEnv("ASK_PROGRESSIVE", "");
    vi.stubEnv("ASK_RUNS_ENFORCE", "");
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      return {
        rows: [
          { seq: 1, type: "run.completed", at: "t", payload: { result: { answer: "A." } } },
        ],
      };
    });
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    expect(res.status).toBe(200);
    const body = await new Response(res.body).text();
    expect(body).toContain("event: run.completed");
  });

  it("cancel POST stays owner-gated but NOT feature-gated (Stop works during rollback)", async () => {
    vi.stubEnv("ASK_PROGRESSIVE", "");
    vi.stubEnv("ASK_RUNS_ENFORCE", "");
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      return { rows: [] };
    });
    const res = await postCancel(req(`/api/ask/runs/${RUN_ID}/cancel`, { method: "POST" }), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    expect(res.status).toBe(200);
  });
});

// ---- release hardening: request-scoped connection lifecycle ----------------------

describe("connection lifecycle — one Pool per SSE invocation", () => {
  it("no Pool is constructed at module import time (build-safe)", () => {
    expect(POOLS_AT_IMPORT).toBe(0);
  });

  it("POST /api/ask/runs: N persisted events use ONE Pool, ended exactly once", async () => {
    h.askWithLimitsMock.mockImplementation(
      async (_q: string, _e: string, opts: { sink: { emit(t: string, p: object): Promise<void> } }) => {
        await opts.sink.emit("run.created", {});
        await opts.sink.emit("run.authorized", {});
        await opts.sink.emit("answer.started", {});
        return { answer: "A.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" };
      },
    );
    const res = await postRun(
      req("/api/ask/runs", { method: "POST", body: JSON.stringify({ question: "what happened" }), headers: { "content-type": "application/json" } }),
    );
    await new Response(res.body).text(); // drain to completion
    expect(h.poolCount.n).toBe(1); // one request-scoped pool, not one per event
    expect(h.endMock).toHaveBeenCalledTimes(1);
  });

  it("events GET: multiple tail polls share ONE Pool; the terminal closes it exactly once", async () => {
    let polls = 0;
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      polls++;
      if (polls < 3) return { rows: [] }; // two empty polls first
      return { rows: [{ seq: 1, type: "run.completed", at: "t", payload: { result: { answer: "A." } } }] };
    });
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    await new Response(res.body).text();
    expect(polls).toBeGreaterThanOrEqual(3);
    expect(h.poolCount.n).toBe(1); // owner check + every poll on one pool
    expect(h.endMock).toHaveBeenCalledTimes(1);
  });

  it("events GET: a client disconnect (aborted signal) stops polling and cleans up the pool", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT user_email")) return { rows: [{ user_email: "user@example.com" }] };
      return { rows: [] }; // never a terminal — only the abort can end the loop
    });
    const controller = new AbortController();
    controller.abort();
    const aborted = new NextRequest(`https://bnow.net/api/ask/runs/${RUN_ID}/events`, {
      signal: controller.signal,
    } as never);
    const res = await getEvents(aborted, { params: Promise.resolve({ id: RUN_ID }) });
    await new Response(res.body).text(); // resolves because the loop breaks on abort
    expect(h.poolCount.n).toBe(1);
    expect(h.endMock).toHaveBeenCalledTimes(1);
  });

  it("events GET: an ownership 404 still ends the pool it opened", async () => {
    h.queryMock.mockImplementation(async () => ({ rows: [] })); // unknown run
    const res = await getEvents(req(`/api/ask/runs/${RUN_ID}/events`), {
      params: Promise.resolve({ id: RUN_ID }),
    });
    expect(res.status).toBe(404);
    expect(h.poolCount.n).toBe(1);
    expect(h.endMock).toHaveBeenCalledTimes(1);
  });
});
