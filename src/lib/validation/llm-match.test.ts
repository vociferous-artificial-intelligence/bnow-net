import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { majorityFromVotes } = await import("./llm-match");
import type { LlmMatch } from "./llm-match";

const vote = (takeawayIndex: number, claimId: number | null, confidence = 0.9): LlmMatch => ({
  takeawayIndex,
  claimId,
  confidence,
});

describe("majorityFromVotes", () => {
  it("confirms a match when a strict majority agrees on the same claim", () => {
    const rounds = [
      [vote(0, 42, 0.9)],
      [vote(0, 42, 0.8)],
      [vote(0, 42, 1.0)],
      [vote(0, null)],
      [vote(0, 17)],
    ];
    const { matches, votes } = majorityFromVotes(rounds, 1);
    expect(matches[0].claimId).toBe(42);
    expect(matches[0].confidence).toBeCloseTo(0.9); // mean of agreeing votes
    expect(votes[0]).toEqual({ i: 0, v: [42, 42, 42, null, 17], final: 42 });
  });

  it("rejects when votes split with no majority (2-2-1)", () => {
    const rounds = [
      [vote(0, 42)],
      [vote(0, 42)],
      [vote(0, 17)],
      [vote(0, 17)],
      [vote(0, null)],
    ];
    const { matches } = majorityFromVotes(rounds, 1);
    expect(matches[0].claimId).toBeNull();
  });

  it("rejects when null (no-match) wins the majority", () => {
    const rounds = [
      [vote(0, 42)],
      [vote(0, null)],
      [vote(0, null)],
      [vote(0, null)],
      [vote(0, 42)],
    ];
    const { matches, votes } = majorityFromVotes(rounds, 1);
    expect(matches[0].claimId).toBeNull();
    expect(votes[0].final).toBeNull();
  });

  it("treats a takeaway missing from a round as a null vote", () => {
    const rounds: LlmMatch[][] = [
      [vote(0, 42)],
      [vote(0, 42)],
      [], // model dropped the takeaway this round
      [vote(0, 42)],
      [],
    ];
    const { matches, votes } = majorityFromVotes(rounds, 1);
    expect(matches[0].claimId).toBe(42); // 3 of 5 still a majority
    expect(votes[0].v).toEqual([42, 42, null, 42, null]);
  });

  it("handles multiple takeaways independently over 3 rounds", () => {
    const rounds = [
      [vote(0, 1), vote(1, null)],
      [vote(0, 1), vote(1, 2)],
      [vote(0, 3), vote(1, 2)],
    ];
    const { matches } = majorityFromVotes(rounds, 2);
    expect(matches).toHaveLength(2);
    expect(matches[0].claimId).toBe(1); // 2/3 for claim 1
    expect(matches[1].claimId).toBe(2); // 2/3 for claim 2
  });

  it("returns all-null matches for zero takeaways or empty rounds", () => {
    expect(majorityFromVotes([], 0).matches).toEqual([]);
    const { matches } = majorityFromVotes([[], [], []], 1);
    expect(matches[0].claimId).toBeNull();
  });
});
