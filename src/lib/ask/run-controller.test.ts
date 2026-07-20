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
  it("replays from the stored seq to terminal with GETs only", async () => {
    const tail = sse(['id: 5\nevent: run.completed\ndata: {"result":{"answer":"A"}}\n\n']);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(streamOf(tail), { status: 200 }));
    storeActiveRun({ runId: RUN_ID, lastSeq: 4, question: "q" });

    const final = await resumeRun({ runId: RUN_ID, lastSeq: 4, question: "q" }, { onState: () => {}, fetchImpl });
    expect(final.phase).toBe("done");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`/api/ask/runs/${RUN_ID}/events?after=4`);
    expect(readActiveRun()).toBeNull();
  });

  it("an ownership 404 fails honestly and clears the ref", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const final = await resumeRun({ runId: RUN_ID, lastSeq: 0, question: "q" }, { onState: () => {}, fetchImpl });
    expect(final.phase).toBe("failed");
    expect(final.errorClass).toBe("reconnect_404");
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
