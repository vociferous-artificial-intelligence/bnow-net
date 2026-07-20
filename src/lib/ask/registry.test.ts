import { describe, expect, it } from "vitest";
import { hasScorecard, MODEL_REGISTRY, modelEntry, UNKNOWN_MODEL_PRICE } from "./registry";
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
});
