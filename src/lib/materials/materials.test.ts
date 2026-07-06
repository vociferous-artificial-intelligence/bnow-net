import { describe, expect, it } from "vitest";
import { computeConcentration, riskScore, type SupplierFlow } from "./concentration";

describe("computeConcentration", () => {
  it("computes shares, HHI, top supplier, sensitive exposure", () => {
    const flows: SupplierFlow[] = [
      { partnerCode: 490, partnerName: "Taiwan", valueUsd: 900 },
      { partnerCode: 410, partnerName: "South Korea", valueUsd: 60 },
      { partnerCode: 392, partnerName: "Japan", valueUsd: 40 },
    ];
    const c = computeConcentration("8542", "2024", flows, [490, 156])!;
    expect(c.totalUsd).toBe(1000);
    expect(c.topSupplierName).toBe("Taiwan");
    expect(c.topSharePct).toBe(90);
    expect(c.top3SharePct).toBe(100);
    expect(c.hhi).toBeCloseTo(0.9 * 0.9 + 0.06 * 0.06 + 0.04 * 0.04, 2);
    expect(c.sensitiveSharePct).toBe(90); // Taiwan is sensitive
    expect(c.concentrated).toBe(true);
  });

  it("flags diversified imports as not concentrated", () => {
    const flows: SupplierFlow[] = [
      { partnerCode: 1, partnerName: "A", valueUsd: 250 },
      { partnerCode: 2, partnerName: "B", valueUsd: 250 },
      { partnerCode: 3, partnerName: "C", valueUsd: 250 },
      { partnerCode: 4, partnerName: "D", valueUsd: 250 },
    ];
    const c = computeConcentration("x", "2024", flows, [])!;
    expect(c.topSharePct).toBe(25);
    expect(c.hhi).toBeCloseTo(0.25, 2);
    expect(c.concentrated).toBe(false);
  });

  it("returns null on empty/zero flows", () => {
    expect(computeConcentration("x", "2024", [], [])).toBeNull();
    expect(computeConcentration("x", "2024", [{ partnerCode: 1, partnerName: "A", valueUsd: 0 }], [])).toBeNull();
  });

  it("risk score rises with concentration and exposure", () => {
    const highFlows: SupplierFlow[] = [{ partnerCode: 156, partnerName: "China", valueUsd: 950 }, { partnerCode: 9, partnerName: "X", valueUsd: 50 }];
    const lowFlows: SupplierFlow[] = [
      { partnerCode: 1, partnerName: "A", valueUsd: 250 }, { partnerCode: 2, partnerName: "B", valueUsd: 250 },
      { partnerCode: 3, partnerName: "C", valueUsd: 250 }, { partnerCode: 4, partnerName: "D", valueUsd: 250 },
    ];
    const high = riskScore(computeConcentration("x", "2024", highFlows, [156])!);
    const low = riskScore(computeConcentration("x", "2024", lowFlows, [])!);
    expect(high).toBeGreaterThan(low);
  });
});
