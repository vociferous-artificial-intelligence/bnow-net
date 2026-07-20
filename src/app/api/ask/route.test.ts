import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AskAnswerV2 } from "@/lib/ask/types";

// Auth: an accepted user, so these tests focus on the Phase 0 wrapper timing.
vi.mock("@/lib/gate", () => ({
  requireAcceptedUser: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}));

const askWithLimitsMock = vi.fn();
const recordEntryTimingsMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/ask/limits", () => ({
  askWithLimits: (...args: unknown[]) => askWithLimitsMock(...args),
  recordEntryTimings: (...args: unknown[]) => recordEntryTimingsMock(...args),
}));

const { POST, maxDuration } = await import("./route");

function answer(o: Partial<AskAnswerV2> = {}): AskAnswerV2 {
  return {
    answer: "A [c1].",
    citedClaimIds: [1],
    evidenceCount: 1,
    terms: [],
    provider: "openai:gpt-5",
    state: "answered",
    relatedClaimIds: [],
    window: null,
    totalMatching: 1,
    sampled: false,
    retrievalMode: "v2",
    ...o,
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("https://bnow.net/api/ask", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  askWithLimitsMock.mockReset();
  recordEntryTimingsMock.mockClear();
});

describe("POST /api/ask — Phase 0 wrapper timing", () => {
  it("pins maxDuration at 60", () => {
    expect(maxDuration).toBe(60);
  });

  it("patches ONLY apiTotalMs by runId — hydration keys stay absent on API rows", async () => {
    askWithLimitsMock.mockResolvedValue(answer({ runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }));
    const res = await post({ question: "what happened in kherson" });
    expect(res.status).toBe(200);

    expect(recordEntryTimingsMock).toHaveBeenCalledTimes(1);
    const [runId, patch] = recordEntryTimingsMock.mock.calls[0] as [string, Record<string, number>];
    expect(runId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(Object.keys(patch)).toEqual(["apiTotalMs"]);
    expect(patch.apiTotalMs).toBeGreaterThanOrEqual(0);
  });

  it("skips the patch when the payload has no runId (limit refusal wrote no row)", async () => {
    askWithLimitsMock.mockResolvedValue(answer({ provider: "limit", state: "limit" }));
    const res = await post({ question: "what happened in kherson" });
    expect(res.status).toBe(429); // existing limit contract unchanged
    expect(recordEntryTimingsMock).not.toHaveBeenCalled();
  });

  it("too-short question still 400s before any pipeline call", async () => {
    const res = await post({ question: "hi" });
    expect(res.status).toBe(400);
    expect(askWithLimitsMock).not.toHaveBeenCalled();
    expect(recordEntryTimingsMock).not.toHaveBeenCalled();
  });
});
