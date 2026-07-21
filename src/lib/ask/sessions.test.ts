import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// The Pool mock also serves the transactional path (release hardening):
// connect() hands back a client sharing the SAME queryMock, so SQL-dispatch
// tests keep working; BEGIN/COMMIT/ROLLBACK land in queryMock's call log for
// the atomicity assertions; release() is a spy.
const h = vi.hoisted(() => ({
  queryMock: vi.fn(),
  endMock: vi.fn(),
  releaseMock: vi.fn(),
  askWithLimitsMock: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
    connect = async () => ({ query: h.queryMock, release: h.releaseMock });
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
  // Release hardening (features.ts): ASK_SESSIONS is only effective under
  // enforce mode with valid retention — stub the prerequisites so the
  // per-test ASK_SESSIONS stubs keep their original meaning.
  vi.stubEnv("ASK_RUNS_ENFORCE", "1");
  vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
});
afterEach(() => vi.unstubAllEnvs());

describe("flag", () => {
  it("sessions are OFF by default", () => {
    expect(askSessionsEnabled()).toBe(false);
  });

  it("ASK_SESSIONS=1 alone (no enforce/retention) stays OFF — fail closed", () => {
    vi.stubEnv("ASK_RUNS_ENFORCE", "");
    vi.stubEnv("ASK_SESSIONS", "1");
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
  // SQL-dispatch mocking (release hardening: appendTurn now runs inside ONE
  // transaction, so BEGIN/COMMIT/ROLLBACK interleave with the statements).
  function mockAppend(over: {
    session?: Record<string, unknown> | null;
    insert?: { rows: Array<{ seq: number }> } | Error;
  } = {}) {
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("SELECT status, last_active_at")) {
        if (over.session === null) return { rows: [] };
        return {
          rows: [{ status: "active", last_active_at: new Date().toISOString(), run_ok: true, ...(over.session ?? {}) }],
        };
      }
      if (s.includes("INSERT INTO ask_turns")) {
        if (over.insert instanceof Error) throw over.insert;
        return over.insert ?? { rows: [{ seq: 2 }] };
      }
      return { rows: [] };
    });
  }

  it("appendTurn enforces the turn cap ATOMICALLY inside the INSERT (HAVING refused -> turn_cap)", async () => {
    mockAppend({ insert: { rows: [] } }); // cap reached: the guarded INSERT writes nothing
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "turn_cap" });
    const insertSql = String(h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_turns"))![0]);
    expect(insertSql).toContain("HAVING coalesce(max(seq), 0) <");
    // the refusal transaction closes cleanly (no partial last_active bump)
    const sqls = h.queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("last_active_at = now()"))).toBe(false);
  });
  it("appendTurn refuses on a foreign/unknown session (ownership)", async () => {
    mockAppend({ session: null });
    const r = await appendTurn({ sessionId: "s", userEmail: "intruder", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
  it("appendTurn refuses on an idle session", async () => {
    mockAppend({ session: { last_active_at: new Date(Date.now() - 25 * 3600e3).toISOString() } });
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "idle" });
  });
  it("G6: appendTurn refuses a run the caller does not own OR that has no snapshot (run_ineligible)", async () => {
    mockAppend({ session: { run_ok: false } });
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "foreign-or-bare", scope: "expand" });
    expect(r).toEqual({ ok: false, reason: "run_ineligible" });
  });
  it("G6: a concurrent duplicate-run loser gets a TYPED race refusal AND the transaction rolls back", async () => {
    mockAppend({ insert: new Error('duplicate key value violates unique constraint "ask_turns_run_idx"') });
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: false, reason: "race" });
    const sqls = h.queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls).toContain("ROLLBACK"); // nothing partial survives
    expect(sqls.some((q) => q.includes("last_active_at = now()"))).toBe(false);
  });
  it("release hardening: a successful append runs SELECT..FOR UPDATE, INSERT, and the last_active bump inside ONE BEGIN/COMMIT", async () => {
    mockAppend();
    const r = await appendTurn({ sessionId: "s", userEmail: "u", runId: "r", scope: "reuse" });
    expect(r).toEqual({ ok: true, seq: 2 });
    const sqls = h.queryMock.mock.calls.map((c) => String(c[0]));
    const begin = sqls.indexOf("BEGIN");
    const commit = sqls.indexOf("COMMIT");
    const select = sqls.findIndex((q) => q.includes("SELECT status, last_active_at"));
    const insert = sqls.findIndex((q) => q.includes("INSERT INTO ask_turns"));
    const bump = sqls.findIndex((q) => q.includes("last_active_at = now()"));
    expect(String(sqls[select])).toContain("FOR UPDATE"); // serializes concurrent appends
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    for (const idx of [select, insert, bump]) {
      expect(idx).toBeGreaterThan(begin);
      expect(idx).toBeLessThan(commit);
    }
  });
});

describe("deleteSession — §7.7 content removal, accounting retained", () => {
  it("owner delete removes content from EVERY table that holds it (G6 high: events, cache, usage question) and never deletes accounting rows", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT 1 FROM ask_sessions")) return { rows: [{ "?": 1 }] };
      return { rows: [], rowCount: 2 };
    });
    const r = await deleteSession("s", "u");
    expect(r).toEqual({ deleted: true, turnsRemoved: 2 });
    const sqls = h.queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("DELETE FROM ask_run_events"))).toBe(true); // claim/answer text payloads
    expect(sqls.some((s) => s.includes("DELETE FROM ask_answer_cache"))).toBe(true); // question+result+snapshot copies
    expect(sqls.some((s) => s.includes("UPDATE ask_usage SET question = '[deleted]'"))).toBe(true); // question redacted
    expect(sqls.some((s) => s.includes("SET result = NULL") && s.includes("evidence_snapshot = NULL"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_turns"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM ask_sessions"))).toBe(true);
    // NEVER a delete on the accounting tables
    expect(sqls.some((s) => s.includes("DELETE FROM ask_usage") || s.includes("DELETE FROM ask_runs"))).toBe(false);
    // the cache delete joins on the ORIGINAL question — it must precede the redaction
    const cacheIdx = sqls.findIndex((s) => s.includes("DELETE FROM ask_answer_cache"));
    const redactIdx = sqls.findIndex((s) => s.includes("UPDATE ask_runs SET result = NULL"));
    expect(cacheIdx).toBeLessThan(redactIdx);
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

  function sessionMocks(over: { maxSeq?: number; status?: string; turns?: number } = {}) {
    const now = new Date().toISOString();
    const turnRows = Array.from({ length: over.turns ?? 1 }, (_, i) => ({
      seq: i + 1, run_id: `r${i + 1}`, scope: "new", created_at: now,
    }));
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM ask_sessions WHERE id = $1 AND user_email = $2") && s.includes("SELECT id"))
        return { rows: [{ id: "s", user_email: "u", title: "t", status: over.status ?? "active", created_at: now, last_active_at: now }] };
      if (s.includes("SELECT status, last_active_at")) return { rows: [{ status: "active", last_active_at: now, run_ok: true }] };
      if (s.includes("INSERT INTO ask_turns")) return { rows: [{ seq: (over.maxSeq ?? 1) + 1 }] };
      if (s.includes("evidence_snapshot IS NOT NULL")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      if (s.includes("SELECT t.seq, t.run_id")) return { rows: turnRows };
      if (s.includes("SELECT t.seq, r.question")) return { rows: [{ seq: 1, question: "orig q", state: "answered", result: { citedClaimIds: [1], answer: "orig answer" } }] };
      if (s.includes("SELECT t.seq FROM ask_turns")) return { rows: [] };
      return { rows: [] };
    });
  }

  it("flag ON: passes the frozen snapshot + compacted history to the ONE guarded money path and appends the turn", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    sessionMocks();
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
    // the turn was appended with scope reuse (seq computed inside the INSERT)
    const insert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_turns"));
    expect(insert?.[1]).toEqual(["s", "new-run", "reuse", MAX_SESSION_TURNS]);
  });

  it("G6: enforce-mode REFUSALS (state limit/error, runId PRESENT) consume no turn", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    sessionMocks();
    h.askWithLimitsMock.mockResolvedValue({ runId: "run-refusal", state: "limit", answer: "limit copy" });
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q2" });
    expect(r.ok).toBe(true);
    expect(h.queryMock.mock.calls.some((c) => String(c[0]).includes("INSERT INTO ask_turns"))).toBe(false);
  });

  it("G6: the turn cap refuses for $0 BEFORE the paid call", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    sessionMocks({ turns: 20 });
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q21" });
    expect(r).toEqual({ ok: false, reason: "turn_cap" });
    expect(h.askWithLimitsMock).not.toHaveBeenCalled(); // no billed-and-discarded answer
  });

  it("G6: an ended session refuses for $0 before the paid call", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    sessionMocks({ status: "ended" });
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q" });
    expect(r).toEqual({ ok: false, reason: "ended" });
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("G6: ASK_PIPELINE=legacy refuses instead of drifting to live retrieval", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    vi.stubEnv("ASK_PIPELINE", "legacy");
    // Release hardening: the feature resolver now forces sessions OFF on the
    // legacy pipeline, so the refusal fires even earlier as flag_off; the
    // in-module pipeline_legacy check remains as defense in depth.
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q" });
    expect(r).toEqual({ ok: false, reason: "flag_off" });
    expect(h.askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("G6: an idempotent REPLAY converges — an already-linked run returns its real seq; an orphaned billed run is attached now", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    // case 1: the replayed run already IS turn 2
    sessionMocks();
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      const now = new Date().toISOString();
      if (s.includes("SELECT id")) return { rows: [{ id: "s", user_email: "u", title: "t", status: "active", created_at: now, last_active_at: now }] };
      if (s.includes("evidence_snapshot IS NOT NULL")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      if (s.includes("SELECT t.seq, t.run_id")) return { rows: [{ seq: 1, run_id: "r1", scope: "new", created_at: now }] };
      if (s.includes("SELECT t.seq, r.question")) return { rows: [] };
      if (s.includes("SELECT t.seq FROM ask_turns")) return { rows: [{ seq: 2 }] };
      return { rows: [] };
    });
    h.askWithLimitsMock.mockResolvedValue({ runId: "orig-run", state: "answered", answer: "a", replayed: true });
    const linked = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q", idempotencyKey: "K" });
    expect(linked.ok && linked.seq).toBe(2); // the REAL seq, not a stale count

    // case 2: the replayed run was never linked (append failed last time) — attach it
    const now = new Date().toISOString();
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("SELECT id")) return { rows: [{ id: "s", user_email: "u", title: "t", status: "active", created_at: now, last_active_at: now }] };
      if (s.includes("SELECT status, last_active_at")) return { rows: [{ status: "active", last_active_at: now, run_ok: true }] };
      if (s.includes("INSERT INTO ask_turns")) return { rows: [{ seq: 2 }] };
      if (s.includes("evidence_snapshot IS NOT NULL")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      if (s.includes("SELECT t.seq, t.run_id")) return { rows: [{ seq: 1, run_id: "r1", scope: "new", created_at: now }] };
      if (s.includes("SELECT t.seq, r.question")) return { rows: [] };
      if (s.includes("SELECT t.seq FROM ask_turns")) return { rows: [] }; // orphaned
      return { rows: [] };
    });
    const attached = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q", idempotencyKey: "K" });
    expect(attached.ok && attached.seq).toBe(2);
    const insert = h.queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO ask_turns"));
    expect(insert?.[1]).toEqual(["s", "orig-run", "reuse", MAX_SESSION_TURNS]);
  });

  it("G6: a post-call append refusal RETURNS the billed result instead of discarding it", async () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    const now = new Date().toISOString();
    h.queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("SELECT id")) return { rows: [{ id: "s", user_email: "u", title: "t", status: "active", created_at: now, last_active_at: now }] };
      if (s.includes("evidence_snapshot IS NOT NULL")) return { rows: [{ evidence_snapshot: SNAPSHOT }] };
      if (s.includes("SELECT t.seq, t.run_id")) return { rows: [] };
      if (s.includes("SELECT t.seq, r.question")) return { rows: [] };
      // the racing arbiter refuses (session ended between pre-check and append)
      if (s.includes("SELECT status, last_active_at")) return { rows: [{ status: "ended", last_active_at: now, max_seq: 1, run_ok: true }] };
      return { rows: [] };
    });
    h.askWithLimitsMock.mockResolvedValue({ runId: "billed-run", state: "answered", answer: "the paid answer" });
    const r = await runReuseFollowupTurn({ sessionId: "s", userEmail: "u", question: "q" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("ended");
      expect(r.result?.answer).toBe("the paid answer"); // never discarded
    }
  });
});
