// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRunEvent,
  clearActiveRun,
  initialRunViewState,
  parseSseChunk,
  readActiveRun,
  resumeRun,
  runProgressiveAsk,
  storeActiveRun,
  type RunViewState,
  type SseRecord,
} from "./run-controller";

function sse(records: string[]): string {
  return records.join("");
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("parseSseChunk", () => {
  it("parses complete records, keeps the remainder, ignores heartbeats", () => {
    const seen: SseRecord[] = [];
    const remainder = parseSseChunk(
      'event: run.ref\ndata: {"runId":"x"}\n\n: hb\n\nid: 1\nevent: run.created\ndata: {}\n\nid: 2\nevent: partial',
      (r) => seen.push(r),
    );
    expect(seen.map((r) => r.event)).toEqual(["run.ref", "run.created"]);
    expect(seen[1].id).toBe(1);
    expect(remainder).toBe("id: 2\nevent: partial"); // incomplete block retained
  });
});

describe("applyRunEvent — the pure state machine (server facts only)", () => {
  it("folds the full happy sequence into phases and data", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, { id: null, event: "run.ref", data: `{"runId":"${RUN_ID}"}` });
    expect(s.runId).toBe(RUN_ID);
    s = applyRunEvent(s, { id: 1, event: "run.created", data: "{}" });
    s = applyRunEvent(s, { id: 2, event: "run.authorized", data: "{}" });
    expect(s.phase).toBe("starting");
    s = applyRunEvent(s, {
      id: 3,
      event: "retrieval.lexical_partial",
      data: JSON.stringify({ claims: [{ claimId: 1, text: "t", hedging: "claimed", claimDate: null, countryIso2: "ru", track: null, confidence: null, sourceDocIds: [] }], totalMatching: 40 }),
    });
    expect(s.phase).toBe("retrieving");
    expect(s.candidates?.claims).toHaveLength(1);
    expect(s.candidates?.totalMatching).toBe(40);
    s = applyRunEvent(s, {
      id: 4,
      event: "retrieval.completed",
      data: JSON.stringify({ candidatesCount: 120, totalMatching: 300, uniqueSources: 17, mode: "v2", window: null, currentThrough: "2026-07-18" }),
    });
    expect(s.phase).toBe("selecting");
    expect(s.retrieval?.uniqueSources).toBe(17);
    s = applyRunEvent(s, { id: 5, event: "rerank.completed", data: JSON.stringify({ selectedClaimIds: [3, 1, 2] }) });
    expect(s.phase).toBe("answering");
    expect(s.selectedCount).toBe(3);
    s = applyRunEvent(s, { id: 6, event: "answer.started", data: "{}" });
    s = applyRunEvent(s, { id: 7, event: "run.completed", data: JSON.stringify({ result: { answer: "A", state: "answered" } }) });
    expect(s.phase).toBe("done");
    expect(s.result?.answer).toBe("A");
    expect(s.lastSeq).toBe(7);
  });

  it("run.failed carries only the error class; unknown events just advance seq", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, { id: 1, event: "run.failed", data: '{"errorClass":"route_throw"}' });
    expect(s.phase).toBe("failed");
    expect(s.errorClass).toBe("route_throw");
    s = applyRunEvent(s, { id: 9, event: "future.event", data: "{}" });
    expect(s.lastSeq).toBe(9);
    expect(s.phase).toBe("failed"); // unchanged
  });

  it("the cancel marker's high seq range never pollutes lastSeq (reconnect stays correct)", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, { id: 2, event: "run.created", data: "{}" });
    s = applyRunEvent(s, { id: 1_000_001, event: "cancel_requested", data: "{}" });
    expect(s.lastSeq).toBe(2);
  });
});

describe("sessionStorage resume refs", () => {
  it("stores, reads, clears, and rejects malformed entries", () => {
    storeActiveRun({ runId: RUN_ID, lastSeq: 4, question: "q" });
    expect(readActiveRun()).toEqual({ runId: RUN_ID, lastSeq: 4, question: "q" });
    clearActiveRun();
    expect(readActiveRun()).toBeNull();
    window.sessionStorage.setItem("bnow_ask_active_run", "not json");
    expect(readActiveRun()).toBeNull();
  });
});

describe("runProgressiveAsk — one paid POST per gesture", () => {
  it("drives states from the stream and clears the resume ref on terminal", async () => {
    const body = sse([
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`,
      'id: 1\nevent: run.created\ndata: {}\n\n',
      'id: 2\nevent: run.completed\ndata: {"result":{"answer":"A","state":"answered"}}\n\n',
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(streamOf(body), { status: 200 }));
    const states: RunViewState[] = [];
    const final = await runProgressiveAsk("q", "key-1", { onState: (s) => states.push(s), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1); // exactly one POST
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/ask/runs");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(final.phase).toBe("done");
    expect(final.result?.answer).toBe("A");
    expect(readActiveRun()).toBeNull(); // cleared on terminal
  });

  it("a dropped stream resumes via the READ-ONLY GET — never a second POST", async () => {
    const dropped = sse([
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`,
      'id: 1\nevent: run.created\ndata: {}\n\n',
      // stream ends here without a terminal event
    ]);
    const tail = sse(['id: 2\nevent: run.completed\ndata: {"result":{"answer":"A"}}\n\n']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(streamOf(dropped), { status: 200 }))
      .mockResolvedValueOnce(new Response(streamOf(tail), { status: 200 }));

    const final = await runProgressiveAsk("q", "key-1", { onState: () => {}, fetchImpl });

    expect(final.phase).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = fetchImpl.mock.calls[1];
    expect(String(second[0])).toBe(`/api/ask/runs/${RUN_ID}/events?after=1`); // replay from lastSeq
    expect((second[1] as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("a failed submit reports honestly without any retry POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const final = await runProgressiveAsk("q", "key-1", { onState: () => {}, fetchImpl });
    expect(final.phase).toBe("failed");
    expect(final.errorClass).toBe("submit_429");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("resumeRun — mid-run refresh recovery", () => {
  it("mount recovery replays the FULL event log (after=0) to terminal with GETs only", async () => {
    const tail = sse(['id: 5\nevent: run.completed\ndata: {"result":{"answer":"A"}}\n\n']);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(streamOf(tail), { status: 200 }));
    storeActiveRun({ runId: RUN_ID, lastSeq: 4, question: "q" });

    const final = await resumeRun({ runId: RUN_ID, lastSeq: 4, question: "q" }, { onState: () => {}, fetchImpl });
    expect(final.phase).toBe("done");
    // supplementary Gate 2 fix: no seed ⇒ replay from 0 so the whole panel
    // rebuilds; the stored lastSeq only seeds live-continuation reconnects
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`/api/ask/runs/${RUN_ID}/events?after=0`);
    expect(readActiveRun()).toBeNull();
  });

  it("an ownership 404 fails honestly and clears the ref", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const final = await resumeRun({ runId: RUN_ID, lastSeq: 0, question: "q" }, { onState: () => {}, fetchImpl });
    expect(final.phase).toBe("failed");
    expect(final.errorClass).toBe("reconnect_404");
  });
});

describe("applyRunEvent — answer.section identity (supplementary Gate 2 recovery)", () => {
  const section = (id: number | null, text: string): SseRecord => ({
    id,
    event: "answer.section",
    data: JSON.stringify({ text, citedClaimIds: [1] }),
  });

  it("duplicate delivery of the same persisted section seq renders once", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, section(7, "First validated sentence. [c1]"));
    s = applyRunEvent(s, section(7, "First validated sentence. [c1]"));
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].seq).toBe(7);
  });

  it("distinct sections with distinct seqs both render, in release order", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, section(7, "First. [c1]"));
    s = applyRunEvent(s, section(8, "Second. [c1]"));
    expect(s.sections.map((x) => x.text)).toEqual(["First. [c1]", "Second. [c1]"]);
  });

  it("a section without a valid persisted seq advances the phase but never renders — and two id-less sections cannot collapse into one", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, section(null, "No identity A."));
    expect(s.phase).toBe("answering"); // the event type is still a server fact
    expect(s.sections).toHaveLength(0); // prose without replay identity is dropped fail-safe
    s = applyRunEvent(s, section(null, "No identity B."));
    expect(s.sections).toHaveLength(0); // dropped too — never a shared-sentinel collapse
    // valid sections still render afterwards (the drop is per-record, not sticky)
    s = applyRunEvent(s, section(9, "Valid. [c1]"));
    expect(s.sections.map((x) => x.text)).toEqual(["Valid. [c1]"]);
  });

  it("a late section after a terminal state is ignored entirely", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, { id: 5, event: "run.completed", data: '{"result":{"answer":"A"}}' });
    s = applyRunEvent(s, section(6, "Too late."));
    expect(s.phase).toBe("done");
    expect(s.sections).toHaveLength(0);
  });
});

describe("consumeStream rejection — a dropped read is a stream drop, not a crash", () => {
  function rejectingStream(firstChunk: string): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    let delivered = false;
    return new ReadableStream({
      pull(controller) {
        if (!delivered) {
          delivered = true;
          controller.enqueue(enc.encode(firstChunk));
        } else {
          controller.error(new TypeError("network changed"));
        }
      },
    });
  }

  it("a reader.read() rejection mid-POST-stream falls to the READ-ONLY resume — never a second POST", async () => {
    const first = sse([
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`,
      'id: 1\nevent: run.created\ndata: {}\n\n',
    ]);
    const tail = sse(['id: 2\nevent: run.completed\ndata: {"result":{"answer":"A"}}\n\n']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(rejectingStream(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(streamOf(tail), { status: 200 }));

    const final = await runProgressiveAsk("q", "key-1", {
      onState: () => {},
      fetchImpl,
      backoffMs: 0,
    });

    expect(final.phase).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(String(fetchImpl.mock.calls[1][0])).toBe(`/api/ask/runs/${RUN_ID}/events?after=1`);
    expect((fetchImpl.mock.calls[1][1] as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("a rejection during a resume read keeps retrying the GET within the budget", async () => {
    const first = sse(['id: 1\nevent: run.created\ndata: {}\n\n']);
    const tail = sse(['id: 2\nevent: run.completed\ndata: {"result":{"answer":"A"}}\n\n']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(rejectingStream(first), { status: 200 }))
      .mockResolvedValueOnce(new Response(streamOf(tail), { status: 200 }));

    const final = await resumeRun(
      { runId: RUN_ID, lastSeq: 0, question: "q" },
      { onState: () => {}, fetchImpl, backoffMs: 0 },
    );
    expect(final.phase).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      fetchImpl.mock.calls.every((c) => ((c[1] as RequestInit | undefined)?.method ?? "GET") === "GET"),
    ).toBe(true);
  });
});

describe("resumeRun — mount recovery rebuilds the WHOLE panel (supplementary Gate 2)", () => {
  it("replays from 0 (not the stored lastSeq), rebuilds candidates/retrieval/selection/sections/phase, and dedupes overlapping section replay", async () => {
    const fullReplay = sse([
      'id: 1\nevent: run.created\ndata: {}\n\n',
      `id: 2\nevent: retrieval.lexical_partial\ndata: ${JSON.stringify({ claims: [{ claimId: 4, text: "cand", hedging: "claimed", claimDate: null, countryIso2: "ua", track: null, confidence: null, sourceDocIds: [] }], totalMatching: 21 })}\n\n`,
      `id: 3\nevent: retrieval.completed\ndata: ${JSON.stringify({ candidatesCount: 12, totalMatching: 21, uniqueSources: 5, mode: "v2", window: null, currentThrough: "2026-07-19" })}\n\n`,
      'id: 4\nevent: rerank.completed\ndata: {"selectedClaimIds":[4,2]}\n\n',
      'id: 5\nevent: answer.section\ndata: {"text":"Released so far. [c4]","citedClaimIds":[4]}\n\n',
      // non-terminal cutoff — the client must reconnect from its lastSeq
    ]);
    const tail = sse([
      // the server replays seq 5 again (after=5 boundary races are the client's
      // problem to absorb) plus the terminal
      'id: 5\nevent: answer.section\ndata: {"text":"Released so far. [c4]","citedClaimIds":[4]}\n\n',
      'id: 6\nevent: run.completed\ndata: {"result":{"answer":"Full.","state":"answered"}}\n\n',
    ]);
    const calls: string[] = [];
    const midStates: RunViewState[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return calls.length === 1
        ? new Response(streamOf(fullReplay), { status: 200 })
        : new Response(streamOf(tail), { status: 200 });
    });

    const final = await resumeRun(
      { runId: RUN_ID, lastSeq: 5, question: "q" }, // the tab stored lastSeq 5
      { onState: (s) => midStates.push(s), fetchImpl, backoffMs: 0 },
    );

    // full replay from 0 despite the stored lastSeq
    expect(calls[0]).toBe(`/api/ask/runs/${RUN_ID}/events?after=0`);
    // the mid-run view rebuilt EVERYTHING from persisted events
    const mid = midStates.find((s) => s.phase === "answering" && s.sections.length > 0);
    expect(mid).toBeDefined();
    expect(mid!.candidates?.claims[0]?.text).toBe("cand");
    expect(mid!.retrieval?.uniqueSources).toBe(5);
    expect(mid!.selectedCount).toBe(2);
    // duplicate section replay across the reconnect rendered ONCE
    expect(final.sections.filter((s) => s.seq === 5)).toHaveLength(1);
    expect(final.phase).toBe("done");
  });

  it("pushes a busy state synchronously BEFORE the first network byte", async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async () => {
      order.push("fetch");
      return new Response(streamOf(sse(['id: 1\nevent: run.completed\ndata: {"result":{}}\n\n'])), { status: 200 });
    });
    await resumeRun(
      { runId: RUN_ID, lastSeq: 3, question: "q" },
      {
        onState: (s) => order.push(`state:${s.phase}:${s.runId}`),
        fetchImpl,
        backoffMs: 0,
      },
    );
    expect(order[0]).toBe(`state:starting:${RUN_ID}`); // busy view before any fetch
    expect(order[1]).toBe("fetch");
  });
});

describe("resumeRun — transient failures vs terminal 404 vs exhaustion", () => {
  it("a transient 502 retries within the budget and keeps the resume ref until terminal", async () => {
    const tail = sse(['id: 2\nevent: run.completed\ndata: {"result":{"answer":"A"}}\n\n']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(streamOf(tail), { status: 200 }));
    storeActiveRun({ runId: RUN_ID, lastSeq: 1, question: "q" });

    const final = await resumeRun(
      { runId: RUN_ID, lastSeq: 1, question: "q" },
      { onState: () => {}, fetchImpl, backoffMs: 0 },
    );
    expect(final.phase).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(readActiveRun()).toBeNull(); // cleared at terminal, not at the 502
  });

  it("reconnect exhaustion fails the view honestly but RETAINS the resume ref (a still-running paid run is never orphaned)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
    storeActiveRun({ runId: RUN_ID, lastSeq: 2, question: "q" });

    const final = await resumeRun(
      { runId: RUN_ID, lastSeq: 2, question: "q" },
      { onState: () => {}, fetchImpl, maxReconnects: 3, backoffMs: 0 },
    );
    expect(final.phase).toBe("failed");
    expect(final.errorClass).toBe("reconnect_exhausted");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // the ref survives: a refresh retries the $0 read-only resume
    expect(readActiveRun()).toEqual({ runId: RUN_ID, lastSeq: 2, question: "q" });
  });

  it("a genuine 404 stays terminal and clears the ref", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    storeActiveRun({ runId: RUN_ID, lastSeq: 2, question: "q" });
    const final = await resumeRun(
      { runId: RUN_ID, lastSeq: 2, question: "q" },
      { onState: () => {}, fetchImpl, backoffMs: 0 },
    );
    expect(final.phase).toBe("failed");
    expect(final.errorClass).toBe("reconnect_404");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // no retry burn on a terminal
    expect(readActiveRun()).toBeNull();
  });
});

describe("applyRunEvent — monotonic phases (Gate 2 inline findings)", () => {
  it("a late lexical_partial after retrieval.completed keeps the data but never regresses the phase", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, {
      id: 4,
      event: "retrieval.completed",
      data: JSON.stringify({ candidatesCount: 10, totalMatching: 10, uniqueSources: 3, mode: "v2", window: null, currentThrough: null }),
    });
    expect(s.phase).toBe("selecting");
    // out-of-order delivery: the unawaited partial's forward arrives late
    s = applyRunEvent(s, {
      id: 3,
      event: "retrieval.lexical_partial",
      data: JSON.stringify({ claims: [], totalMatching: 10 }),
    });
    expect(s.phase).toBe("selecting"); // no regression
    expect(s.candidates).not.toBeNull(); // the data still landed
  });

  it("terminal states are absorbing: replayed duplicates change nothing but the seq", () => {
    let s = initialRunViewState();
    s = applyRunEvent(s, { id: 5, event: "run.completed", data: '{"result":{"answer":"A"}}' });
    expect(s.phase).toBe("done");
    s = applyRunEvent(s, { id: 6, event: "retrieval.lexical_partial", data: '{"claims":[],"totalMatching":1}' });
    expect(s.phase).toBe("done");
    expect(s.lastSeq).toBe(6);
    s = applyRunEvent(s, { id: 7, event: "run.failed", data: '{"errorClass":"x"}' });
    expect(s.phase).toBe("done"); // a stray late failure cannot overwrite success
  });

  it("duplicate delivery of the same event is idempotent", () => {
    let s = initialRunViewState();
    const rr = { id: 5, event: "rerank.completed", data: '{"selectedClaimIds":[1,2]}' };
    s = applyRunEvent(s, rr);
    const again = applyRunEvent(s, rr);
    expect(again.phase).toBe(s.phase);
    expect(again.selectedCount).toBe(2);
    expect(again.lastSeq).toBe(5);
  });
});
