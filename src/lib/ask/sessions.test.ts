import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const h = vi.hoisted(() => ({ queryMock: vi.fn(), endMock: vi.fn(), askWithLimitsMock: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));
vi.mock("./limits", () => ({ askWithLimits: h.askWithLimitsMock }));

const {
  appendTurn,
  askSessionsEnabled,
  classifyFollowup,
  compactHistory,
  deleteSession,
  exportSession,
  MAX_SESSION_TURNS,
  runReuseFollowupTurn,
} = await import("./sessions");
import type { EvidenceSnapshot } from "./events";

const SNAPSHOT: EvidenceSnapshot = {
  version: 1,
  retrievalMode: "v2",
  window: null,
  totalMatching: 2,
  candidatesCount: 2,
  corpusCurrentThrough: "2026-07-18",
  candidates: [
    { claimId: 1, text: "Strikes were reported near Kharkiv overnight.", hedging: "claimed", claimDate: "2026-07-15", countryIso2: "ua", track: null, confidence: null, sourceDocIds: [10] },
    { claimId: 2, text: "Air defense engaged drones over Belgorod.", hedging: "confirmed", claimDate: "2026-07-16", countryIso2: "ru", track: null, confidence: null, sourceDocIds: [11] },
  ],
  selectedClaimIds: [1, 2],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("flag", () => {
  it("sessions are OFF by default", () => {
    expect(askSessionsEnabled()).toBe(false);
  });
});

describe("classifyFollowup — pure scope suggestions (§7.3; suggests, never overrides)", () => {
  it("a follow-up within the snapshot's theaters/entities suggests reuse", () => {
    expect(classifyFollowup("Were any drones intercepted?", SNAPSHOT).suggested).toBe("reuse");
  });
  it("a new theater absent from the snapshot suggests new retrieval", () => {
    const r = classifyFollowup("What about Iran's involvement?", SNAPSHOT);
    expect(r.suggested).toBe("new");
    expect(r.reason).toBe("theater_ir_absent");
  });
  it("a dated follow-up suggests expansion (the frozen window may not cover it)", () => {
    expect(classifyFollowup("what happened on 2026-07-01?", SNAPSHOT).suggested).toBe("expand");
  });
  it("a novel capitalized entity suggests expansion", () => {
    expect(classifyFollowup("Did Vladimir Sokolov comment?", SNAPSHOT).suggested).toBe("expand");
  });
  it("is deterministic", () => {
    const q = "Were any drones intercepted?";
    expect(classifyFollowup(q, SNAPSHOT)).toEqual(classifyFollowup(q, SNAPSHOT));
  });
});

describe("compactHistory — bounded deterministic context (§7.5)", () => {
  const turns = [
    { seq: 1, question: "Q one", state: "answered", citedClaimIds: [1, 2] },
    { seq: 2, question: "Q two", state: "insufficient", citedClaimIds: [], answer: "A".repeat(5000) },
  ];
  it("one structured line per turn; only the LAST turn's answer appears, truncated to budget", () => {
    const block = compactHistory(turns, 100);
    expect(block).toContain("T1: Q: Q one → answered [cited: 1,2]");
    expect(block).toContain("T2: Q: Q two → insufficient");
    const answerLine = block.split("\n").find((l) => l.startsWith("T2 answer:"))!;
    expect(answerLine.length).toBeLessThanOrEqual("T2 answer: ".length + 100);
  });
  it("token growth is bounded: the block grows linearly in turn COUNT, never with answer sizes of old turns", () => {
    const many = Array.from({ length: 19 }, (_, i) => ({
      seq: i + 1,
      question: `Q${i + 1} ` + "x".repeat(1000),
      state: "answered",
      citedClaimIds: [i],
      answer: "y".repeat(50_000), // old answers must NOT appear
    }));
    const block = compactHistory(many, 1200);
    expect(block.length).toBeLessThan(19 * 260 + 1300); // per-line cap + one answer budget
    expect(block).not.toContain("y".repeat(2000));
  });
  it("empty history is an empty block (byte-identical prompt downstream)", () => {
    expect(compactHistory([])).toBe("");
  });
});

describe("session lifecycle guards", () => {
  it("appendTurn refuses past the turn cap", async () => {
    h.queryMock.mockResolvedValueOnce({
      rows: [{ status: "active", last_active_at: new Date().toISOString(), max_seq: MAX_SESSION_TURNS }],
    });
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "turn_cap" });
  });
  it("appendTurn refuses on a foreign/unknown session (ownership)", async () => {
    h.queryMock.mockResolvedValueOnce({ rows: [] });
    const r = await appendTurn({ sessionId: "s", userEmail: "intruder", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
  it("appendTurn refuses on an idle session", async () => {
    h.queryMock.mockResolvedValueOnce({
      rows: [{ status: "active", last_active_at: new Date(Date.now() - 25 * 3600e3).toISOString(), max_seq: 1 }],
    });
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "idle" });
  });
});

describe("deleteSession — §7.7 content removal, accounting retained", () => {
  it("owner delete nulls linked runs' content and removes turns; accounting rows are never deleted", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT 1 FROM ask_sessions")) return { rows: [{ "?": 1 }] };
      return { rows: [], rowCount: 2 };
    });
    const r = await deleteSession("s", "u");
    expect(r).toEqual({ deleted: true, turnsRemoved: 2 });
    const sqls = h.queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("SET result = NULL") && s.includes("evidence_snapshot = NULL"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_turns"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_sessions"))).toBe(true);
    // NEVER a delete on the accounting tables
    expect(sqls.some((s) => s.includes("DELETE FROM ask_usage") || s.includes("DELETE FROM ask_runs"))).toBe(false);
  });
  it("a foreign user's delete does nothing", async () => {
    h.queryMock.mockResolvedValueOnce({ rows: [] });
    const r = await deleteSession("s", "intruder");
    expect(r.deleted).toBe(false);
    expect(h.queryMock.mock.calls.filter((c) => String(c[0]).includes("DELETE"))).toHaveLength(0);
  });
});

describe("exportSession ownership", () => {
  it("a foreign session exports null", async () => {
    h.queryMock.mockResolvedValue({ rows: [] });
    expect(await exportSession("s", "intruder")).toBeNull();
  });
});

describe("runReuseFollowupTurn — the $-bearing wiring", () => {
  it("flag OFF: refuses before any read or money path", async () => {
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q" });
    expect(r).toEqual({ ok: false, reason: "flag_off" });
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();
    expect(h.queryMock).not.toHaveBeenCalled();
  });

  it("flag ON: passes the frozen snapshot + compacted history to the ONE guarded money path and appends the turn", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    const now = new Date().toISOString();
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM ask_sessions WHERE id = $1 AND user_email = $2") && s.includes("SELECT id"))
        return { rows: [{ id: "s", user_email: "u", title: "t", status: "active", created_at: now, last_active_at: now }] };
      if (s.includes("evidence_snapshot IS NOT NULL")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      if (s.includes("SELECT t.seq, t.run_id")) return { rows: [] };
      if (s.includes("SELECT t.seq, r.question")) return { rows: [{ seq: 1, question: "orig q", state: "answered", result: { citedClaimIds: [1], answer: "orig answer" } }] };
      if (s.includes("SELECT status, last_active_at")) return { rows: [{ status: "active", last_active_at: now, max_seq: 1 }] };
      return { rows: [] };
    });
    h.askWithLimitsMock.mockResolvedValue({ runId: "new-run", state: "answered", answer: "follow-up" });

    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "Were drones intercepted?", idempotencyKey: "k1" });

    expect(r.ok).toBe(true);
    expect(h.askWithLimitsMock).toHaveBeenCalledTimes(1);
    const [q, email, opts] = h.askWithLimitsMock.mock.calls[0] as [string, string, { sessionReuse: { snapshot: EvidenceSnapshot; historyBlock: string }; idempotencyKey: string }];
    expect(q).toBe("Were drones intercepted?");
    expect(email).toBe("u");
    expect(opts.idempotencyKey).toBe("k1");
    expect(opts.sessionReuse.snapshot).toEqual(SNAPSHOT); // the FROZEN snapshot, verbatim
    expect(opts.sessionReuse.historyBlock).toContain("T1: Q: orig q → answered [cited: 1]");
    expect(opts.sessionReuse.historyBlock).toContain("orig answer");
    if (r.ok) expect(r.suggested).toBe("reuse");
    // the turn was appended with scope reuse
    const insert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_turns"));
    expect(insert?.[1]).toEqual(["s", 2, "new-run", "reuse"]);
  });

  it("a refusal without a run identity consumes NO turn", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    const now = new Date().toISOString();
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("SELECT id")) return { rows: [{ id: "s", user_email: "u", title: "t", status: "active", created_at: now, last_active_at: now }] };
      if (s.includes("evidence_snapshot IS NOT NULL")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      return { rows: [] };
    });
    h.askWithLimitsMock.mockResolvedValue({ state: "limit", answer: "limit copy" }); // no runId
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q2" });
    expect(r.ok).toBe(true);
    expect(h.queryMock.mock.calls.some((c) => String(c[0]).includes("INSERT INTO ask_turns"))).toBe(false);
  });
});
