import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// Phase 6 acceptance pin (Gate 6): a REUSE follow-up makes ZERO retrieval and
// ZERO embed calls — structurally, because ask()'s reuse branch never invokes
// those stages. retrieveV2 and rerankCandidates are mocked as tripwires; the
// deterministic offline answer path proves the evidence really came from the
// frozen snapshot.

const h = vi.hoisted(() => ({
  retrieveV2Mock: vi.fn(),
  rerankMock: vi.fn(),
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));
vi.mock("./retrieve-v2", () => ({ retrieveV2: h.retrieveV2Mock }));
vi.mock("./rerank", () => ({
  rerankCandidates: h.rerankMock,
  rerankOfflineReason: () => "no OPENAI_API_KEY",
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));

const { ask } = await import("./answer");
import type { EvidenceSnapshot } from "./events";

const SNAPSHOT: EvidenceSnapshot = {
  version: 1,
  retrievalMode: "v2",
  window: null,
  totalMatching: 2,
  candidatesCount: 2,
  corpusCurrentThrough: "2026-07-18",
  candidates: [
    { claimId: 7, text: "Snapshot claim seven.", hedging: "claimed", claimDate: "2026-07-15", countryIso2: "ua", track: null, confidence: null, sourceDocIds: [10] },
    { claimId: 9, text: "Snapshot claim nine.", hedging: "confirmed", claimDate: "2026-07-16", countryIso2: "ru", track: null, confidence: null, sourceDocIds: [11] },
  ],
  selectedClaimIds: [9, 7],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [] });
  delete process.env.OPENAI_API_KEY; // offline: the deterministic stub answers
  delete process.env.ASK_PIPELINE;
});

describe("ask() — Phase 6 snapshot-reuse branch", () => {
  it("a reuse turn invokes NEITHER retrieval NOR rerank; evidence comes from the frozen snapshot in selected order", async () => {
    const res = await ask("Were drones intercepted?", { reuseSnapshot: SNAPSHOT });

    expect(h.retrieveV2Mock).not.toHaveBeenCalled(); // zero retrieval (and zero embed inside it)
    expect(h.rerankMock).not.toHaveBeenCalled(); // zero rerank call
    expect(res.provider).toBe("stub"); // offline deterministic path — $0
    // the deterministic answer cites the SNAPSHOT's claims, selected order first
    expect(res.citedClaimIds[0]).toBe(9);
    expect(res.citedClaimIds).toContain(7);
    expect(res.answer).toContain("Snapshot claim nine.");
    expect(res.retrievalMode).toBe("v2");
    expect(res.totalMatching).toBe(2);
  });

  it("the reuse turn re-persists the SAME snapshot onto its run row (F11 turn reproducibility)", async () => {
    await ask("follow-up", { reuseSnapshot: SNAPSHOT, snapshotRunId: "run-77" });
    const persist = h.queryMock.mock.calls.find((c) => String(c[0]).includes("SET evidence_snapshot"));
    expect(persist).toBeTruthy();
    expect(persist![1][0]).toBe("run-77");
    expect(JSON.parse(persist![1][1] as string)).toEqual(SNAPSHOT);
  });

  it("without reuseSnapshot the normal pipeline runs (retrieveV2 invoked — the branch is inert)", async () => {
    h.retrieveV2Mock.mockResolvedValue({
      claims: [],
      entities: [],
      terms: ["x"],
      window: null,
      totalMatching: 0,
      mode: "v2",
      embedUsage: undefined,
    });
    await ask("a normal question");
    expect(h.retrieveV2Mock).toHaveBeenCalledTimes(1);
  });

  it("legacy pipeline ignores reuseSnapshot (registered degenerate combination)", async () => {
    process.env.ASK_PIPELINE = "legacy";
    h.queryMock.mockResolvedValue({ rows: [] }); // legacy retrieve() SQL
    const res = await ask("q", { reuseSnapshot: SNAPSHOT });
    expect(h.retrieveV2Mock).not.toHaveBeenCalled(); // legacy path, not v2
    expect(res.retrievalMode).toBe("legacy");
  });
});
