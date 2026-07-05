import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractTakeaways } from "./isw-extract";
import { extractSignature, matchScore, MATCH_THRESHOLD } from "./keywords";
import { scoreDigest } from "./score";

const fixture = () =>
  readFileSync(join(process.cwd(), "fixtures", "isw", "roca-2026-06-30.html"), "utf8");

describe("extractSignature", () => {
  it("finds toponyms across languages", () => {
    expect(extractSignature("Ukrainian forces struck a refinery in Ryazan").toponyms).toContain("ryazan");
    expect(extractSignature("Враг наступает под Покровском").toponyms).toContain("pokrovsk");
    expect(extractSignature("Ворог просунувся біля Куп'янська").toponyms).toContain("kupyansk");
  });
  it("classifies actions across languages", () => {
    expect(extractSignature("massive drone strike overnight").actions).toContain("strike");
    expect(extractSignature("подразделения штурмуют город").actions).toContain("advance");
    expect(extractSignature("ППО збила 40 шахедів").actions).toContain("air_defense");
  });
});

describe("matchScore", () => {
  it("matches same toponym + action above threshold", () => {
    const a = extractSignature("Russian forces advanced near Pokrovsk");
    const b = extractSignature("Враг штурмует и просунулся у Покровска");
    expect(matchScore(a, b)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });
  it("different toponyms stay below threshold", () => {
    const a = extractSignature("drone strike on Ryazan refinery");
    const b = extractSignature("fighting near Pokrovsk continues with assaults");
    expect(matchScore(a, b)).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe("extractTakeaways on real report", () => {
  it("parses the Key Takeaways bullets as signatures only (no prose)", () => {
    const takeaways = extractTakeaways(fixture());
    expect(takeaways.length).toBeGreaterThanOrEqual(3);
    // derived data only: no text field
    for (const t of takeaways) {
      expect(t).not.toHaveProperty("text");
      expect(typeof t.chars).toBe("number");
    }
    // June 30 report mentions the long-range strike campaign (strike action)
    expect(takeaways.some((t) => t.actions.includes("strike"))).toBe(true);
  });
});

describe("scoreDigest", () => {
  const takeaways = [
    { index: 0, toponyms: ["pokrovsk"], actions: ["advance"], chars: 100 },
    { index: 1, toponyms: ["ryazan"], actions: ["strike"], chars: 90 },
    { index: 2, toponyms: [], actions: [], chars: 50 }, // unmatchable
  ];
  const claims = [
    { claimId: 1, text: "Российские войска штурмуют Покровск", hedging: "claimed", docCount: 3, earliestDocAt: "2026-06-30T08:00:00Z" },
    { claimId: 2, text: "Fire at chemical plant in Novosibirsk", hedging: "unverified", docCount: 1, earliestDocAt: null },
  ];

  it("computes coverage over matchable takeaways only", () => {
    const s = scoreDigest(takeaways, claims, new Date("2026-06-30T23:35:00Z"));
    expect(s.details.matchableTakeaways).toBe(2);
    expect(s.coveragePct).toBe(50); // pokrovsk matched, ryazan missed
    const kinds = s.divergences.map((d) => d.kind).sort();
    expect(kinds).toContain("agreement");
    expect(kinds).toContain("isw_only");
    expect(kinds).toContain("ours_only");
  });

  it("computes thin-sourced rate and timeliness lead", () => {
    const s = scoreDigest(takeaways, claims, new Date("2026-06-30T23:35:00Z"));
    expect(s.thinSourcedRate).toBe(0.5); // claim 2: 1 doc + unverified
    expect(s.timelinessHours).toBeCloseTo(15.6, 0); // 08:00 -> 23:35
  });

  it("null coverage when nothing matchable", () => {
    const s = scoreDigest([{ index: 0, toponyms: [], actions: [], chars: 10 }], claims, null);
    expect(s.coveragePct).toBeNull();
  });
});

describe("iswUrlForDate", () => {
  it("builds the predictable slug", async () => {
    const { iswUrlForDate } = await import("./run");
    expect(iswUrlForDate("2026-06-30")).toBe(
      "https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-june-30-2026/",
    );
    expect(iswUrlForDate("2026-07-04")).toContain("july-4-2026");
  });
});
