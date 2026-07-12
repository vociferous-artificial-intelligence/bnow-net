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

describe("classifyTakeawayTheater", () => {
  it("frontline-Ukraine toponyms are ua-side", async () => {
    const { classifyTakeawayTheater } = await import("./keywords");
    expect(classifyTakeawayTheater(["pokrovsk"])).toBe("ua");
    expect(classifyTakeawayTheater(["kupyansk", "toretsk"])).toBe("ua");
  });
  it("Russia-territory toponyms are ru-side", async () => {
    const { classifyTakeawayTheater } = await import("./keywords");
    expect(classifyTakeawayTheater(["ryazan"])).toBe("ru");
    expect(classifyTakeawayTheater(["belgorod", "kursk"])).toBe("ru");
  });
  it("mixed, contested, or non-territorial takeaways are both", async () => {
    const { classifyTakeawayTheater } = await import("./keywords");
    expect(classifyTakeawayTheater(["pokrovsk", "ryazan"])).toBe("both");
    expect(classifyTakeawayTheater(["crimea"])).toBe("both");
    expect(classifyTakeawayTheater([])).toBe("both"); // political/casualties bullets
  });
});

describe("scoreDigest", () => {
  const takeaways = [
    { index: 0, toponyms: ["pokrovsk"], actions: ["advance"], chars: 100 },
    { index: 1, toponyms: ["ryazan"], actions: ["strike"], chars: 90 },
    { index: 2, toponyms: [], actions: [], chars: 50 }, // unmatchable
  ];
  const claims = [
    // earliestFetchedAt (ingest instant) deliberately later than earliestDocAt
    // (the source's own publish claim) — only the former feeds atPublish.
    { claimId: 1, text: "Российские войска штурмуют Покровск", hedging: "claimed", docCount: 3, earliestDocAt: "2026-06-30T08:00:00Z", earliestFetchedAt: "2026-06-30T10:00:00Z" },
    { claimId: 2, text: "Fire at chemical plant in Novosibirsk", hedging: "unverified", docCount: 1, earliestDocAt: null, earliestFetchedAt: null },
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

  it("atPublish shares the coverage denominator and gates on the ingest instant", () => {
    // Claim 1's evidence was fetched 10:00Z, well before ISW's 23:35Z publish —
    // the one agreement counts, so at-publish coverage == final coverage here.
    const s = scoreDigest(takeaways, claims, new Date("2026-06-30T23:35:00Z"));
    expect(s.atPublish).toEqual({
      coveragePct: 50,
      matchedBefore: 1,
      matchedTotal: 1,
      iswPublishedAt: "2026-06-30T23:35:00.000Z",
    });
  });

  it("atPublish drops agreements whose evidence was ingested after ISW published", () => {
    const lateClaims = claims.map((c) =>
      c.claimId === 1 ? { ...c, earliestFetchedAt: "2026-07-01T02:00:00Z" } : c,
    );
    const s = scoreDigest(takeaways, lateClaims, new Date("2026-06-30T23:35:00Z"));
    expect(s.coveragePct).toBe(50); // final coverage unchanged...
    expect(s.atPublish).toMatchObject({ coveragePct: 0, matchedBefore: 0, matchedTotal: 1 });
  });

  it("atPublish is null (undefined, not fabricated) without an ISW publish time", () => {
    const s = scoreDigest(takeaways, claims, null);
    expect(s.atPublish).toBeNull();
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

describe("scoreDigestWithMatches (llm matcher path)", () => {
  it("scores from precomputed matches over all takeaways", async () => {
    const { scoreDigestWithMatches } = await import("./score");
    const takeaways = [
      { index: 0, toponyms: ["donetsk"], actions: ["advance"], chars: 100 },
      { index: 1, toponyms: [], actions: [], chars: 80 },
    ];
    const claims = [
      { claimId: 5, text: "Russian forces liberated Malinovka", hedging: "claimed", docCount: 2, earliestDocAt: "2026-06-30T09:00:00Z", earliestFetchedAt: "2026-06-30T09:30:00Z" },
      { claimId: 6, text: "Unrelated economic item", hedging: "claimed", docCount: 1, earliestDocAt: null, earliestFetchedAt: null },
    ];
    const s = scoreDigestWithMatches(takeaways, claims, new Date("2026-06-30T23:00:00Z"), [
      { takeawayIndex: 0, claimId: 5, confidence: 0.85 },
      { takeawayIndex: 1, claimId: null, confidence: 0 },
    ]);
    expect(s.coveragePct).toBe(50);
    expect(s.timelinessHours).toBe(14);
    expect(s.divergences.filter((d) => d.kind === "agreement")).toHaveLength(1);
    expect(s.divergences.filter((d) => d.kind === "isw_only")).toHaveLength(1);
    expect(s.divergences.filter((d) => d.kind === "ours_only")).toHaveLength(1);
    expect(s.thinSourcedRate).toBe(0.5);
    // LLM path: atPublish divides by ALL takeaways (its coverage denominator);
    // claim 5's evidence (09:30Z) predates the 23:00Z publish.
    expect(s.atPublish).toMatchObject({ coveragePct: 50, matchedBefore: 1, matchedTotal: 1 });
    // agreement entries carry the ingest instant for the backfill/audit trail
    expect(s.divergences.find((d) => d.kind === "agreement")?.earliestFetchedAt).toBe(
      "2026-06-30T09:30:00Z",
    );
  });
});

describe("referenceFor / iranUpdateUrlForDate", () => {
  it("maps theaters to references", async () => {
    const { referenceFor, iranUpdateUrlForDate } = await import("./run");
    expect(referenceFor("ru")?.theater).toBe("ru");
    expect(referenceFor("ua")?.theater).toBe("ru");
    expect(referenceFor("ir")?.theater).toBe("ir");
    expect(referenceFor("sa")).toBeNull();
    expect(iranUpdateUrlForDate("2026-07-04")).toBe(
      "https://understandingwar.org/research/middle-east/iran-update-special-report-july-4-2026/",
    );
  });
});
