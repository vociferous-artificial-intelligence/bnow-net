import { describe, expect, it } from "vitest";
import { estimateCostUsd, evaluateAllowance, limitMessage } from "./limits";

describe("/ask rate limiting", () => {
  it("allows under both caps", () => {
    const a = evaluateAllowance(5, 0.1, 20, 1.0);
    expect(a.allowed).toBe(true);
    expect(a.reason).toBe("ok");
  });

  it("blocks at the per-user daily limit", () => {
    expect(evaluateAllowance(20, 0.1, 20, 1.0).reason).toBe("user_limit");
    expect(evaluateAllowance(21, 0.1, 20, 1.0).allowed).toBe(false);
    expect(evaluateAllowance(19, 0.1, 20, 1.0).allowed).toBe(true);
  });

  it("blocks when the global daily budget is spent", () => {
    expect(evaluateAllowance(0, 1.0, 20, 1.0).reason).toBe("global_budget");
    expect(evaluateAllowance(0, 2.5, 20, 1.0).allowed).toBe(false);
  });

  it("user limit takes precedence in the message", () => {
    const a = evaluateAllowance(20, 5, 20, 1.0);
    expect(a.reason).toBe("user_limit");
    expect(limitMessage(a, 20)).toContain("20/day");
    const b = evaluateAllowance(0, 5, 20, 1.0);
    expect(limitMessage(b, 20)).toContain("budget");
  });

  it("estimates gpt-4o-mini cost from list price", () => {
    // 1500 prompt + 200 completion tokens ≈ $0.000345
    const c = estimateCostUsd("gpt-4o-mini", 1500, 200);
    expect(c).toBeCloseTo(0.000345, 6);
  });

  it("unknown models get a conservative over-estimate", () => {
    expect(estimateCostUsd("mystery-model", 1000, 1000)).toBeGreaterThan(
      estimateCostUsd("gpt-4o", 1000, 1000),
    );
  });
});
