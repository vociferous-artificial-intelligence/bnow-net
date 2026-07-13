import { describe, expect, it } from "vitest";
import { knownPartnerCodes, partnerDisplayName } from "./partners";

// The 193 distinct partner_code values observed in prod trade_flows (2026-07-13).
const OBSERVED = [4, 8, 12, 20, 24, 28, 31, 32, 36, 40, 44, 48, 50, 51, 52, 56, 60, 68, 70, 72,
  76, 84, 86, 90, 92, 100, 104, 112, 116, 120, 124, 136, 144, 148, 152, 156, 162, 166, 170, 178,
  180, 184, 188, 191, 196, 203, 204, 208, 212, 214, 218, 222, 226, 231, 233, 234, 242, 246, 251,
  258, 260, 266, 268, 270, 276, 288, 292, 300, 304, 320, 324, 328, 332, 336, 340, 344, 348, 352,
  360, 368, 372, 376, 380, 384, 388, 392, 398, 400, 404, 410, 414, 417, 418, 422, 428, 430, 434,
  440, 442, 446, 450, 454, 458, 462, 466, 470, 478, 480, 484, 490, 496, 498, 499, 500, 504, 508,
  512, 516, 520, 528, 531, 533, 534, 540, 554, 562, 566, 579, 583, 584, 586, 591, 598, 600, 604,
  608, 612, 616, 620, 626, 634, 642, 643, 646, 654, 659, 660, 662, 666, 670, 674, 678, 682, 686,
  688, 690, 694, 699, 702, 703, 704, 705, 706, 710, 724, 740, 748, 752, 757, 762, 764, 768, 776,
  780, 784, 788, 792, 795, 796, 798, 800, 804, 807, 818, 826, 834, 858, 860, 862, 876, 882, 887, 894];

describe("partnerDisplayName", () => {
  it("names every production-observed partner code — no #NNN ever renders", () => {
    const known = new Set(knownPartnerCodes());
    for (const code of OBSERVED) {
      expect(known.has(code), `code ${code} missing from the M49 map`).toBe(true);
      const name = partnerDisplayName(code);
      expect(name.startsWith("#")).toBe(false);
      expect(name).not.toBe(`Partner code ${code}`);
    }
  });

  it("resolves the codes from the production defect report", () => {
    expect(partnerDisplayName(251)).toBe("France");
    expect(partnerDisplayName(376)).toBe("Israel");
    expect(partnerDisplayName(699)).toBe("India");
    expect(partnerDisplayName(682)).toBe("Saudi Arabia");
    expect(partnerDisplayName(170)).toBe("Colombia");
    expect(partnerDisplayName(368)).toBe("Iraq");
  });

  it("prefers the stored upstream description over the map", () => {
    expect(partnerDisplayName(490, "Other Asia, nes")).toBe("Other Asia, nes");
    expect(partnerDisplayName(490)).toBe("Taiwan");
    expect(partnerDisplayName(490, "  ")).toBe("Taiwan"); // blank stored falls through
  });

  it("labels an unknown code explicitly — a last resort, never a bare hash", () => {
    expect(partnerDisplayName(999999)).toBe("Partner code 999999");
  });
});
