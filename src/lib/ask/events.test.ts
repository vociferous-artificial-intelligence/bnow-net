import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const h = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));

const {
  encodeSseEvent,
  EVENT_PAYLOAD_ALLOWLIST,
  isAskRunEventType,
  LEXICAL_PARTIAL_MAX,
  NULL_EVENT_SINK,
  payloadKeyViolations,
  PgRunEventSink,
  readRunEvents,
  TERMINAL_EVENT_TYPES,
  toSnapshotClaim,
} = await import("./events");

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [{ at: "2026-07-19T00:00:00Z" }] });
});

describe("payload allowlist (contract §2 made testable)", () => {
  it("every event type has a closed key list and clean payloads pass", () => {
    expect(isAskRunEventType("run.created")).toBe(true);
    expect(isAskRunEventType("chain.of.thought")).toBe(false);
    expect(payloadKeyViolations("run.failed", { errorClass: "x" })).toEqual([]);
    expect(payloadKeyViolations("retrieval.completed", {
      candidatesCount: 1, totalMatching: 1, uniqueSources: 1, mode: "v2", window: null, currentThrough: null,
    })).toEqual([]);
  });

  it("flags any key outside the allowlist", () => {
    expect(payloadKeyViolations("run.failed", { errorClass: "x", message: "secret prose" })).toEqual(["message"]);
    expect(payloadKeyViolations("run.created", { prompt: "leak" })).toEqual(["prompt"]);
  });

  it("the sink REFUSES to persist a payload with unlisted keys (fail-closed, no partial write)", async () => {
    const sink = new PgRunEventSink("11111111-2222-4333-8444-555555555555", { query: h.queryMock });
    await expect(
      sink.emit("run.failed", { errorClass: "x", stack: "secret" } as never),
    ).rejects.toThrow("outside the allowlist");
    expect(h.queryMock).not.toHaveBeenCalled();
  });

  it("no allowlist entry admits prose-bearing keys like message/prompt/stack/answer", () => {
    for (const [type, keys] of Object.entries(EVENT_PAYLOAD_ALLOWLIST)) {
      for (const banned of ["message", "prompt", "stack", "answer"]) {
        expect(keys, type).not.toContain(banned);
      }
      // "text" is admitted ONLY for answer.section — VALIDATED released prose
      // (citation-filtered + fidelity-checked before emit), the same content
      // class as run.completed's result payload. Everything else stays text-free.
      if (type !== "answer.section") expect(keys, type).not.toContain("text");
    }
  });
});

describe("PgRunEventSink", () => {
  it("persists BEFORE forwarding (persist-then-emit) with monotonic seq", async () => {
    const order: string[] = [];
    h.queryMock.mockImplementation(async () => {
      order.push("persist");
      return { rows: [{ at: "t" }] };
    });
    const sink = new PgRunEventSink("11111111-2222-4333-8444-555555555555", { query: h.queryMock }, () => {
      order.push("forward");
    });
    await sink.emit("run.created", {});
    await sink.emit("run.authorized", {});
    expect(order).toEqual(["persist", "forward", "persist", "forward"]);
    expect(sink.lastSeq).toBe(2);
    const params = h.queryMock.mock.calls.map((c) => c[1] as unknown[]);
    expect(params[0][1]).toBe(1); // seq 1
    expect(params[1][1]).toBe(2); // seq 2
  });

  it("a persist failure THROWS to the orchestrator (an unreplayable event must not be skipped)", async () => {
    h.queryMock.mockRejectedValue(new Error("insert failed"));
    const sink = new PgRunEventSink("11111111-2222-4333-8444-555555555555", { query: h.queryMock });
    await expect(sink.emit("run.created", {})).rejects.toThrow("insert failed");
  });

  it("NULL_EVENT_SINK is a pure no-op", async () => {
    await expect(NULL_EVENT_SINK.emit("run.created", {})).resolves.toBeUndefined();
    expect(h.queryMock).not.toHaveBeenCalled();
  });
});

describe("replay + encoding", () => {
  it("readRunEvents filters seq > after in order", async () => {
    h.queryMock.mockResolvedValue({
      rows: [
        { seq: 3, type: "rerank.completed", at: "t3", payload: { selectedClaimIds: [1] } },
        { seq: 4, type: "run.completed", at: "t4", payload: { result: {} } },
      ],
    });
    const events = await readRunEvents("11111111-2222-4333-8444-555555555555", 2);
    expect(events.map((e) => e.seq)).toEqual([3, 4]);
    const sql = String(h.queryMock.mock.calls[0][0]);
    expect(sql).toContain("seq > $2");
    expect(sql).toContain("ORDER BY seq");
  });

  it("SSE records carry id (Last-Event-ID semantics), event, and json data", () => {
    const rec = encodeSseEvent({ seq: 7, type: "run.failed", at: "t", payload: { errorClass: "x" } });
    expect(rec).toBe('id: 7\nevent: run.failed\ndata: {"errorClass":"x"}\n\n');
  });

  it("terminal set is exactly run.completed + run.failed + run.cancelled (Phase 3)", () => {
    expect([...TERMINAL_EVENT_TYPES].sort()).toEqual(["run.cancelled", "run.completed", "run.failed"]);
  });
});

describe("snapshot mapping", () => {
  it("toSnapshotClaim carries content + stable doc ids, defaults docIds empty for partials", () => {
    const c = {
      claimId: 5, text: "claim text", hedging: "claimed", claimDate: "2026-07-01",
      countryIso2: "ru", track: "military", entities: [], confidence: 0.4,
      vectorScore: null, lexicalHit: true, compositeScore: 1,
    };
    expect(toSnapshotClaim(c)).toEqual({
      claimId: 5, text: "claim text", hedging: "claimed", claimDate: "2026-07-01",
      countryIso2: "ru", track: "military", confidence: 0.4, sourceDocIds: [],
    });
    expect(toSnapshotClaim(c, [11, 12]).sourceDocIds).toEqual([11, 12]);
    expect(LEXICAL_PARTIAL_MAX).toBeGreaterThan(0);
  });
});
