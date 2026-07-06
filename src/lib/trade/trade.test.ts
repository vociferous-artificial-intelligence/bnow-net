import { describe, expect, it } from "vitest";
import { parseComtrade } from "./comtrade";
import { computeDivergence, fmtM, type FlowPoint } from "./divergence";

describe("parseComtrade", () => {
  it("maps records, keeps only Russia partner + numeric values", () => {
    const json = {
      data: [
        { reporterCode: 51, reporterDesc: "Armenia", partnerCode: 643, flowCode: "X", cmdCode: "8542", period: "2023", primaryValue: 250000000, netWgt: 1200 },
        { reporterCode: 51, reporterDesc: "Armenia", partnerCode: 643, flowCode: "X", cmdCode: "TOTAL", period: "2023", primaryValue: 3500000000, netWgt: 0 },
        { reporterCode: 51, reporterDesc: "Armenia", partnerCode: 268, flowCode: "X", cmdCode: "8542", period: "2023", primaryValue: 999 }, // not Russia -> drop
        { reporterCode: 51, reporterDesc: "Armenia", partnerCode: 643, flowCode: "X", cmdCode: "85", period: "2023", primaryValue: null }, // null -> drop
      ],
    };
    const rows = parseComtrade(json, "Armenia");
    expect(rows.length).toBe(2);
    expect(rows[0].hsCode).toBe("8542");
    expect(rows[0].valueUsd).toBe(250000000);
    expect(rows[0].netWeightKg).toBe(1200);
    expect(rows[1].netWeightKg).toBeNull(); // 0 -> null
  });
  it("handles empty/malformed input", () => {
    expect(parseComtrade({}, "X")).toEqual([]);
    expect(parseComtrade(null, "X")).toEqual([]);
  });
});

describe("computeDivergence", () => {
  const flows: FlowPoint[] = [
    // Armenia chips: negligible pre-war, huge now -> appeared-from-nothing flag
    { reporterCode: 51, reporterName: "Armenia", hsCode: "8542", period: "2021", valueUsd: 500_000 },
    { reporterCode: 51, reporterName: "Armenia", hsCode: "8542", period: "2024", valueUsd: 300_000_000 },
    // Kazakhstan machinery: 4x baseline -> multiple flag
    { reporterCode: 398, reporterName: "Kazakhstan", hsCode: "84", period: "2021", valueUsd: 100_000_000 },
    { reporterCode: 398, reporterName: "Kazakhstan", hsCode: "84", period: "2024", valueUsd: 400_000_000 },
    // Georgia vehicles: flat -> not flagged
    { reporterCode: 268, reporterName: "Georgia", hsCode: "87", period: "2021", valueUsd: 50_000_000 },
    { reporterCode: 268, reporterName: "Georgia", hsCode: "87", period: "2024", valueUsd: 55_000_000 },
    // tiny flow: above threshold ratio but immaterial -> not flagged
    { reporterCode: 688, reporterName: "Serbia", hsCode: "9013", period: "2021", valueUsd: 10_000 },
    { reporterCode: 688, reporterName: "Serbia", hsCode: "9013", period: "2024", valueUsd: 1_000_000 },
  ];

  const rows = computeDivergence(flows);

  it("flags appeared-from-nothing dual-use surge", () => {
    const arm = rows.find((r) => r.reporterCode === 51 && r.hsCode === "8542")!;
    expect(arm.flagged).toBe(true);
    expect(arm.reason).toMatch(/appeared/);
  });
  it("flags multiple-of-baseline growth", () => {
    const kz = rows.find((r) => r.reporterCode === 398)!;
    expect(kz.flagged).toBe(true);
    expect(kz.multiple).toBe(4);
  });
  it("does not flag flat organic trade", () => {
    expect(rows.find((r) => r.reporterCode === 268)!.flagged).toBe(false);
  });
  it("does not flag immaterial flows despite high ratio", () => {
    expect(rows.find((r) => r.reporterCode === 688)!.flagged).toBe(false);
  });
  it("ranks flagged rows first, by delta", () => {
    expect(rows[0].flagged).toBe(true);
    const flaggedDeltas = rows.filter((r) => r.flagged).map((r) => r.deltaUsd);
    expect(flaggedDeltas).toEqual([...flaggedDeltas].sort((a, b) => b - a));
  });
});

describe("fmtM", () => {
  it("formats magnitudes", () => {
    expect(fmtM(3_500_000_000)).toBe("3.5B");
    expect(fmtM(250_000_000)).toBe("250M");
    expect(fmtM(10_000)).toBe("10K");
  });
});
