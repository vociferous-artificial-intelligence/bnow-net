import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskAnswerV2 } from "@/lib/ask/types";

// actions.ts is a "use server" module, but under vitest (no Next.js server-action
// bundling) it's just a plain async function — importable and unit-testable like
// any other module, per the workstream brief.

vi.mock("@/lib/gate", () => ({
  requireUser: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}));

const askWithLimitsMock = vi.fn();
vi.mock("@/lib/ask/limits", () => ({
  askWithLimits: (...args: unknown[]) => askWithLimitsMock(...args),
}));

const queryMock = vi.fn();
vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));

const { askAction } = await import("./actions");

function fullAnswer(): AskAnswerV2 {
  return {
    answer: "Some answer [c1].",
    citedClaimIds: [1],
    evidenceCount: 2,
    terms: [],
    provider: "stub",
    state: "answered",
    relatedClaimIds: [],
    window: null,
    totalMatching: 2,
    sampled: false,
    retrievalMode: "legacy",
  };
}

afterEach(() => {
  askWithLimitsMock.mockReset();
  queryMock.mockReset();
});

function formWith(question: string): FormData {
  const fd = new FormData();
  fd.set("question", question);
  return fd;
}

describe("askAction — the money-path guard's server half", () => {
  it("rejects a too-short question: returns prevState (null) unchanged, never calls askWithLimits (no charge)", async () => {
    const result = await askAction(null, formWith("hi"));
    expect(result).toBeNull();
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("passes the previous state through unchanged (not just null) on a short question", async () => {
    const prevState = { question: "old", result: fullAnswer(), cited: [], related: [] };
    const result = await askAction(prevState, formWith("  ab  "));
    expect(result).toBe(prevState);
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("rejects an empty question the same way", async () => {
    const result = await askAction(null, new FormData());
    expect(result).toBeNull();
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("runs the pipeline and resolves cited/related claims for a valid question", async () => {
    askWithLimitsMock.mockResolvedValue(fullAnswer());
    queryMock.mockResolvedValue([{ id: 1, text: "claim one", iso2: "ru", date: "2026-07-01" }]);

    const result = await askAction(null, formWith("did russia strike kyiv today"));

    expect(askWithLimitsMock).toHaveBeenCalledWith(
      "did russia strike kyiv today",
      "user@example.com",
    );
    expect(result?.question).toBe("did russia strike kyiv today");
    expect(result?.cited).toEqual([
      { id: 1, text: "claim one", iso2: "ru", date: "2026-07-01" },
    ]);
    expect(result?.related).toEqual([]);
  });

  it("truncates to 400 chars before dispatch, same floor as the API route", async () => {
    askWithLimitsMock.mockResolvedValue(fullAnswer());
    queryMock.mockResolvedValue([]);
    const long = "a".repeat(500);
    await askAction(null, formWith(long));
    expect(askWithLimitsMock).toHaveBeenCalledWith("a".repeat(400), "user@example.com");
  });
});
