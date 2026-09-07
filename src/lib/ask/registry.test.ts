import { describe, expect, it } from "vitest";
import {
  ASK_ANSWER_SUITE,
  ASK_RERANK_SUITE,
  hasScorecard,
  MODEL_REGISTRY,
  modelEntry,
  UNKNOWN_MODEL_PRICE,
} from "./registry";
import { estimateCostUsd } from "./limits";

describe("model registry — price parity with the metering table (Phase 4 deviation pin)", () => {
  it("every registry price reproduces estimateCostUsd EXACTLY (divergence fails here)", () => {
    for (const [model, entry] of Object.entries(MODEL_REGISTRY)) {
      const fromRegistry =
        (1_000_000 * entry.pricePerMTok.in + 500_000 * entry.pricePerMTok.out) / 1_000_000;
      expect(estimateCostUsd(model, 1_000_000, 500_000)).toBeCloseTo(fromRegistry, 10);
    }
  });

  it("the unknown-model fallback mirrors the metering backstop", () => {
    expect(estimateCostUsd("some-unknown-model", 1_000_000, 1_000_000)).toBeCloseTo(
      (UNKNOWN_MODEL_PRICE.in + UNKNOWN_MODEL_PRICE.out),
      10,
    );
    expect(modelEntry("some-unknown-model")).toBeNull();
  });
});

describe("scorecard gate (§8.4)", () => {
  it("only the production baseline carries answer-stage validation; Fast candidates carry none", () => {
    expect(hasScorecard("gpt-5", "v2-k60")).toBe(true);
    expect(hasScorecard("gpt-5-nano", "answer-matrix")).toBe(false); // paid matrix never ran
    expect(hasScorecard("gpt-5", "answer-matrix")).toBe(false); // even the baseline lacks the MATRIX suite
    expect(hasScorecard("nonexistent", "anything")).toBe(false);
  });

  it("R3: the two suite constants the money path gates on name a REAL suite on a real entry", () => {
    // A typo in either constant would make hasScorecard() false everywhere and
    // silently degrade every answer — so pin them against the registry itself,
    // not against a repeated literal.
    expect(ASK_ANSWER_SUITE).toBe("v2-k60");
    expect(ASK_RERANK_SUITE).toBe("v2-k60-rerank");
    expect(MODEL_REGISTRY["gpt-5"].scorecard?.suites).toContain(ASK_ANSWER_SUITE);
    expect(MODEL_REGISTRY["gpt-5-mini"].scorecard?.suites).toContain(ASK_RERANK_SUITE);
    // and the two stages do NOT share a suite: the rerank scorecard must never
    // let a model serve the answer stage
    expect(hasScorecard("gpt-5-mini", ASK_ANSWER_SUITE)).toBe(false);
    expect(hasScorecard("gpt-5", ASK_RERANK_SUITE)).toBe(false);
  });

  it("R3: no model in the registry is scorecarded for BOTH gated suites today", () => {
    const both = Object.keys(MODEL_REGISTRY).filter(
      (m) => hasScorecard(m, ASK_ANSWER_SUITE) && hasScorecard(m, ASK_RERANK_SUITE),
    );
    expect(both).toEqual([]);
  });
});
