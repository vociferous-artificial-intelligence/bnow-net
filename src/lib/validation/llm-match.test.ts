import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { majorityFromVotes, buildMatchUserPrompt } = await import("./llm-match");
import type { LlmMatch } from "./llm-match";
import type { ClaimForValidation } from "./score";

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

describe("buildMatchUserPrompt — well-formed UTF-16 clips (#97)", () => {
  const wf = (s: string) => (s as unknown as { isWellFormed(): boolean }).isWellFormed();
  const claim = (claimId: number, text: string) => ({ claimId, text }) as ClaimForValidation;
  const LONE_ESCAPE = /\\u[dD][89aAbB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F][0-9a-fA-F]{2})|(?<!\\u[dD][89aAbB][0-9a-fA-F]{2})\\u[dD][c-fC-F][0-9a-fA-F]{2}/;

  it("a takeaway pair straddling the 400-unit clip loses only the orphaned half", () => {
    const p = buildMatchUserPrompt(["t".repeat(399) + "\u{1F680}" + " beyond the clip"], []);
    const line = p.split("\n")[1];
    expect(line).toBe("[0] " + "t".repeat(399)); // 399 units, orphan dropped
    expect(wf(p)).toBe(true);
  });

  it("a claim pair straddling the 300-unit clip loses only the orphaned half", () => {
    const p = buildMatchUserPrompt([], [claim(7, "c".repeat(299) + "\u{1F9E8}" + " beyond")]);
    expect(p.endsWith("(7) " + "c".repeat(299))).toBe(true);
    expect(wf(p)).toBe(true);
  });

  it("repairs isolated surrogates in short takeaways and claims (under the clips)", () => {
    const p = buildMatchUserPrompt(["short \uD83D takeaway"], [claim(1, "short \uDE00 claim")]);
    expect(wf(p)).toBe(true);
    expect(p).toContain("[0] short  takeaway"); // orphan removed, never replaced
    expect(p).toContain("(1) short  claim");
  });

  it("collapses whitespace BEFORE clipping (historical order preserved)", () => {
    // 500 spaces collapse to one; the clip then lands inside the d-run — if the
    // clip ran first, almost nothing of the d-run would survive the collapse.
    const p = buildMatchUserPrompt(["a   b\n\nc" + " ".repeat(500) + "d".repeat(500)], []);
    const line = p.split("\n")[1];
    expect(line).toHaveLength(4 + 400); // "[0] " + exactly the 400-unit clip
    expect(line.startsWith("[0] a b c d")).toBe(true);
  });

  it("well-formed in-limit prompt bytes are unchanged (byte-exact)", () => {
    const take = "Українські сили 😀 відбили атаку; втрати не підтверджені.";
    const p = buildMatchUserPrompt([take], [claim(3, "claim text")]);
    expect(p).toBe("TAKEAWAYS:\n[0] " + take + "\n\nCLAIMS:\n(3) claim text");
  });

  it("over-limit text with no astral chars clips exactly as before", () => {
    const p = buildMatchUserPrompt(["t".repeat(450)], [claim(2, "c".repeat(350))]);
    expect(p.split("\n")[1]).toBe("[0] " + "t".repeat(400));
    expect(p.endsWith("(2) " + "c".repeat(300))).toBe(true);
  });

  it("the serialized request body carries no provider-rejecting lone escape", () => {
    const p = buildMatchUserPrompt(
      ["t".repeat(399) + "\u{1F680}" + " x", "lone \uD83D high"],
      [claim(9, "c".repeat(299) + "\u{1F9E8}" + " y")],
    );
    expect(LONE_ESCAPE.test(JSON.stringify({ messages: [{ role: "user", content: p }] }))).toBe(
      false,
    );
  });
});
