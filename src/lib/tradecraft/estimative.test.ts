import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_BANDS,
  CONFIDENCE_ORDER,
  CORROBORATION_TIERS,
  ESTIMATIVE_MAP_V1,
  ESTIMATIVE_MAP_VERSION,
  ESTIMATIVE_WITHHELD_LABEL,
  ICD203_RANGES,
  confidenceLabel,
  corroborationTier,
  estimateDerivation,
  estimateForClaim,
  formatPercentRange,
  likelihoodLabel,
  normalizeHedging,
  type AssignableBand,
  type ConfidenceLevel,
  type CorroborationTier,
  type HedgingClass,
} from "./estimative";
import type { ClaimEvidenceSummary } from "@/components/claim-evidence-model";

// WS-7.4 acceptance. The mapping table is operator-signed DATA (decision T3,
// 2026-09-07), so this file is its specification, not a smoke test: the six
// invariants named in the signature are pinned literally, and every hedging x
// tier cell is asserted by value. Any change to any cell is a NEW VERSION —
// this test must fail if a cell is edited in place, and that failure is correct.

const HEDGINGS: readonly HedgingClass[] = [
  "confirmed",
  "assessed",
  "claimed",
  "unverified",
  "unknown",
];
const TIERS: readonly Exclude<CorroborationTier, "none">[] = ["C0", "C1", "C2", "C3"];

function bandRank(band: AssignableBand): number {
  return ASSIGNABLE_BANDS.indexOf(band);
}
function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_ORDER.indexOf(level);
}

/** Counts that produce each tier, with the C3 case using two real platforms. */
function evidence(documents: number, channels: number, platforms: number): ClaimEvidenceSummary {
  return { documents, channels, platforms, earliestPublishedAt: null };
}
const TIER_FIXTURE: Record<Exclude<CorroborationTier, "none">, ClaimEvidenceSummary> = {
  C0: evidence(1, 1, 1),
  C1: evidence(3, 1, 1),
  C2: evidence(2, 2, 1),
  C3: evidence(4, 3, 2),
};

describe("corroboration tiers (PLAN-WS-7 §6.1)", () => {
  it("is a total function over the documented predicates", () => {
    expect(corroborationTier(evidence(0, 0, 0))).toBe("none");
    expect(corroborationTier(evidence(1, 1, 1))).toBe("C0");
    expect(corroborationTier(evidence(5, 1, 1))).toBe("C1");
    expect(corroborationTier(evidence(2, 2, 1))).toBe("C2");
    expect(corroborationTier(evidence(2, 2, 2))).toBe("C3");
    expect(corroborationTier(evidence(9, 7, 4))).toBe("C3");
  });

  it("a single document is C0 no matter what the other counts claim", () => {
    // one document cannot be two channels; the document count wins.
    expect(corroborationTier(evidence(1, 3, 3))).toBe("C0");
  });

  it("fails toward the lower tier on garbage counts rather than inventing corroboration", () => {
    expect(corroborationTier(evidence(Number.NaN, 9, 9))).toBe("none");
    expect(corroborationTier(evidence(-4, 9, 9))).toBe("none");
    expect(corroborationTier(evidence(3, Number.NaN, 9))).toBe("C1");
    expect(corroborationTier(evidence(3, 2, Number.POSITIVE_INFINITY))).toBe("C2");
    expect(corroborationTier(evidence(2.9, 1.9, 1.9))).toBe("C1");
    // the degenerate >=2 documents / 0 channels case the summarizer cannot emit
    expect(corroborationTier(evidence(4, 0, 0))).toBe("C1");
  });

  it("survives a missing summary object without throwing", () => {
    expect(corroborationTier(undefined as unknown as ClaimEvidenceSummary)).toBe("none");
  });
});

describe("ESTIMATIVE_MAP_V1 — every hedging class x every tier, by value", () => {
  const EXPECTED: Record<HedgingClass, Record<Exclude<CorroborationTier, "none">, string>> = {
    confirmed: {
      C0: "likely/moderate",
      C1: "likely/moderate",
      C2: "very likely/moderate",
      C3: "very likely/high",
    },
    assessed: {
      C0: "roughly even chance/low",
      C1: "roughly even chance/low",
      C2: "likely/moderate",
      C3: "likely/moderate",
    },
    claimed: {
      C0: "roughly even chance/low",
      C1: "roughly even chance/low",
      C2: "likely/moderate",
      C3: "likely/moderate",
    },
    unverified: {
      C0: "roughly even chance/low",
      C1: "roughly even chance/low",
      C2: "roughly even chance/moderate",
      C3: "likely/moderate",
    },
    unknown: {
      C0: "roughly even chance/low",
      C1: "roughly even chance/low",
      C2: "roughly even chance/moderate",
      C3: "likely/moderate",
    },
  };

  for (const hedging of HEDGINGS) {
    for (const tier of TIERS) {
      it(`${hedging} x ${tier} = ${EXPECTED[hedging][tier]}`, () => {
        const estimate = estimateForClaim(hedging, TIER_FIXTURE[tier]);
        expect(`${estimate.likelihood}/${estimate.confidence}`).toBe(EXPECTED[hedging][tier]);
        expect(estimate.tier).toBe(tier);
        expect(estimate.withheld).toBe(false);
        expect(estimate.version).toBe(ESTIMATIVE_MAP_VERSION);
        expect(estimate.range).toEqual(ICD203_RANGES[estimate.likelihood!]);
      });
    }
  }

  it("covers the whole grid — 5 x 4, no hole and no extra key", () => {
    expect(Object.keys(ESTIMATIVE_MAP_V1).sort()).toEqual([...HEDGINGS].sort());
    for (const hedging of HEDGINGS) {
      expect(Object.keys(ESTIMATIVE_MAP_V1[hedging]).sort()).toEqual([...TIERS].sort());
    }
  });
});

describe("the six invariants the T3 signature commits to", () => {
  it("1. C0 never exceeds `likely` and never exceeds `moderate`", () => {
    for (const hedging of HEDGINGS) {
      const cell = ESTIMATIVE_MAP_V1[hedging].C0;
      expect(bandRank(cell.likelihood), hedging).toBeLessThanOrEqual(bandRank("likely"));
      expect(confidenceRank(cell.confidence), hedging).toBeLessThanOrEqual(
        confidenceRank("moderate"),
      );
    }
  });

  it("2. `high` confidence occurs in exactly one cell: confirmed x C3", () => {
    const high: string[] = [];
    for (const hedging of HEDGINGS) {
      for (const tier of TIERS) {
        if (ESTIMATIVE_MAP_V1[hedging][tier].confidence === "high") high.push(`${hedging}:${tier}`);
      }
    }
    expect(high).toEqual(["confirmed:C3"]);
  });

  it("3. no cell is below `roughly even chance` and none is `almost certain`", () => {
    for (const hedging of HEDGINGS) {
      for (const tier of TIERS) {
        const band: string = ESTIMATIVE_MAP_V1[hedging][tier].likelihood;
        expect(ASSIGNABLE_BANDS as readonly string[], `${hedging}:${tier}`).toContain(band);
      }
    }
    // the four bands T3-b withholds are declared, and never appear in the table
    const table = JSON.stringify(ESTIMATIVE_MAP_V1);
    for (const band of ["almost no chance", "very unlikely", "unlikely", "almost certain"]) {
      expect(ICD203_RANGES[band as keyof typeof ICD203_RANGES]).toBeDefined();
      expect(table).not.toContain(`"${band}"`);
    }
    // "unlikely" must not sneak in as a substring of "very unlikely" either
    expect(table).not.toMatch(/unlikely/);
  });

  it("4. within every hedging row the band is monotone non-decreasing across C0 → C3", () => {
    for (const hedging of HEDGINGS) {
      const ranks = TIERS.map((tier) => bandRank(ESTIMATIVE_MAP_V1[hedging][tier].likelihood));
      expect(ranks, hedging).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("5. at any tier no hedging class exceeds `confirmed`'s band", () => {
    for (const tier of TIERS) {
      const ceiling = bandRank(ESTIMATIVE_MAP_V1.confirmed[tier].likelihood);
      for (const hedging of HEDGINGS) {
        expect(
          bandRank(ESTIMATIVE_MAP_V1[hedging][tier].likelihood),
          `${hedging} exceeds confirmed at ${tier}`,
        ).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("6. an out-of-enum hedging value resolves as `unknown`", () => {
    for (const junk of ["", "  ", "CONFIRMED?", "probable", "null", "0"]) {
      expect(normalizeHedging(junk), junk).toBe("unknown");
      expect(estimateForClaim(junk, TIER_FIXTURE.C2)).toEqual(
        estimateForClaim("unknown", TIER_FIXTURE.C2),
      );
    }
    expect(normalizeHedging(null)).toBe("unknown");
    expect(normalizeHedging(undefined)).toBe("unknown");
    // but a mis-CASED real value is the real value, not the fallback
    expect(normalizeHedging(" Confirmed ")).toBe("confirmed");
  });
});

describe("the two acceptance criteria the prompt names literally", () => {
  it("hedging `unknown` with a single document never renders above roughly even chance / low", () => {
    const estimate = estimateForClaim("unknown", TIER_FIXTURE.C0);
    expect(likelihoodLabel(estimate)).toBe("roughly even chance (45–55%)");
    expect(confidenceLabel(estimate)).toBe("low");
  });

  it("a `confirmed` claim with a single document is never `almost certain`", () => {
    const estimate = estimateForClaim("confirmed", TIER_FIXTURE.C0);
    expect(estimate.likelihood).toBe("likely");
    expect(estimate.range).toEqual([55, 80]);
    expect(estimate.confidence).toBe("moderate");
  });
});

describe("tier `none` fails closed", () => {
  const estimate = estimateForClaim("confirmed", evidence(0, 0, 0));

  it("withholds both axes rather than defaulting to a band", () => {
    expect(estimate.withheld).toBe(true);
    expect(estimate.likelihood).toBeNull();
    expect(estimate.range).toBeNull();
    expect(estimate.confidence).toBeNull();
    expect(estimate.credibility).toBe(6);
  });

  it("labels as `not assessable` on both axes", () => {
    expect(likelihoodLabel(estimate)).toBe(ESTIMATIVE_WITHHELD_LABEL);
    expect(confidenceLabel(estimate)).toBe(ESTIMATIVE_WITHHELD_LABEL);
    expect(estimateDerivation("confirmed", estimate)).toContain("no usable evidence document");
  });

  it("withholds for the strongest hedging class exactly as for the weakest", () => {
    for (const hedging of HEDGINGS) {
      expect(estimateForClaim(hedging, evidence(0, 0, 0)).withheld, hedging).toBe(true);
    }
  });
});

describe("AJP-2.1 information credibility (export-only, derived from the band)", () => {
  it("assigns 1 only to confirmed x C3", () => {
    const ones: string[] = [];
    for (const hedging of HEDGINGS) {
      for (const tier of TIERS) {
        if (estimateForClaim(hedging, TIER_FIXTURE[tier]).credibility === 1) {
          ones.push(`${hedging}:${tier}`);
        }
      }
    }
    expect(ones).toEqual(["confirmed:C3"]);
  });

  it("never assigns 4 or 5 (T3-b: BNOW has no refutation mechanism)", () => {
    for (const hedging of HEDGINGS) {
      for (const tier of [...TIERS, "none" as const]) {
        const summary = tier === "none" ? evidence(0, 0, 0) : TIER_FIXTURE[tier];
        const { credibility } = estimateForClaim(hedging, summary);
        expect([1, 2, 3, 6], `${hedging}:${tier}`).toContain(credibility);
      }
    }
  });

  it("cannot disagree with the band: 2 iff likely/very likely, 3 iff roughly even", () => {
    for (const hedging of HEDGINGS) {
      for (const tier of TIERS) {
        const e = estimateForClaim(hedging, TIER_FIXTURE[tier]);
        if (e.credibility === 1) continue;
        const expected = e.likelihood === "roughly even chance" ? 3 : 2;
        expect(e.credibility, `${hedging}:${tier}`).toBe(expected);
      }
    }
  });

  it("returns 6 — truth cannot be judged — when the tier is none", () => {
    expect(estimateForClaim("claimed", evidence(0, 0, 0)).credibility).toBe(6);
  });
});

describe("presentation helpers", () => {
  it("keeps the ICD 203 percentage range in the output for a PHIA reader to map", () => {
    expect(formatPercentRange([80, 95])).toBe("80–95%");
    expect(likelihoodLabel(estimateForClaim("confirmed", TIER_FIXTURE.C3))).toBe(
      "very likely (80–95%)",
    );
  });

  it("publishes the ICD 203 ranges exactly as the standard does", () => {
    expect(ICD203_RANGES).toEqual({
      "almost no chance": [1, 5],
      "very unlikely": [5, 20],
      unlikely: [20, 45],
      "roughly even chance": [45, 55],
      likely: [55, 80],
      "very likely": [80, 95],
      "almost certain": [95, 99],
    });
  });

  it("names both inputs and the version in the derivation sentence", () => {
    const derivation = estimateDerivation("claimed", estimateForClaim("claimed", TIER_FIXTURE.C2));
    expect(derivation).toContain('"claimed"');
    expect(derivation).toContain("C2");
    expect(derivation).toContain("estimative-map-v1");
  });

  it("carries the version constant on every estimate, withheld or not", () => {
    expect(estimateForClaim("confirmed", TIER_FIXTURE.C3).version).toBe("estimative-map-v1");
    expect(estimateForClaim("confirmed", evidence(0, 0, 0)).version).toBe("estimative-map-v1");
    expect(CORROBORATION_TIERS).toEqual(["none", "C0", "C1", "C2", "C3"]);
  });
});

describe("derived properties — observed, NOT part of the T3 signature", () => {
  // Recorded so a V2 author sees what V1 happened to satisfy beyond the six
  // signed invariants. A failure here is a design question, not a bug.
  it("confidence is also monotone non-decreasing across C0 → C3 in every row", () => {
    for (const hedging of HEDGINGS) {
      const ranks = TIERS.map((t) => confidenceRank(ESTIMATIVE_MAP_V1[hedging][t].confidence));
      expect(ranks, hedging).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("C0 and C1 are identical in every row, which is why the degenerate tier guard is safe", () => {
    for (const hedging of HEDGINGS) {
      expect(ESTIMATIVE_MAP_V1[hedging].C0, hedging).toEqual(ESTIMATIVE_MAP_V1[hedging].C1);
    }
  });

  it("`assessed`, `claimed`, `unverified` and `unknown` never reach `very likely`", () => {
    for (const hedging of HEDGINGS.filter((h) => h !== "confirmed")) {
      for (const tier of TIERS) {
        expect(ESTIMATIVE_MAP_V1[hedging][tier].likelihood, `${hedging}:${tier}`).not.toBe(
          "very likely",
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Import hygiene (matcher-import-hygiene.test.ts shape). The module is a
// presentation mapping that must never acquire an analytic input, and it is
// reachable from a "use client" component through claim-copy-model.ts, so its
// import graph is also a client bundle graph.
// ---------------------------------------------------------------------------

const FORBIDDEN_SOURCE: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "the database client", re: /(?:from\s*|import\s*\(\s*)["'][^"']*(?:@\/db|\/db\/index)["']/ },
  { name: "the source registry", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/registry\/[^"']*["']/ },
  { name: "the spend/usage layer", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/usage\/[^"']*["']/ },
  { name: "the LLM routing layer", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/llm\/[^"']*["']/ },
  { name: "the analysis provider stack", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/(?:provider|openai-provider|synthesize|digest|digest-persist|publication-guard)["']/ },
  { name: "the eval control plane", re: /(?:from\s*|import\s*\(\s*)["'][^"']*evals\/[^"']*["']/ },
  { name: "next/headers or server auth", re: /(?:from\s*|import\s*\(\s*)["'](?:next\/headers|server-only|@\/lib\/gate)["']/ },
  { name: "the environment", re: /process\.env/ },
  { name: "the network", re: /\bfetch\s*\(/ },
];

describe("estimative.ts stays a pure leaf", () => {
  const source = readFileSync(join(__dirname, "estimative.ts"), "utf8");

  for (const { name, re } of FORBIDDEN_SOURCE) {
    it(`does not reach ${name}`, () => {
      expect(re.test(source), `estimative.ts must not reach ${name}`).toBe(false);
    });
  }

  it("has no runtime import at all — its only import is type-only", () => {
    const imports = [...source.matchAll(/^import\s+(.*?)\s+from\s+["']([^"']+)["'];/gm)];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, clause, specifier] of imports) {
      expect(clause.startsWith("type "), `${specifier} is imported at runtime`).toBe(true);
    }
  });

  it("reads no reliability or confidence field (T3-a)", () => {
    // Scanned against the CODE, not the comments: the module's header explains
    // at length what it deliberately does not read, and those sentences must
    // stay readable without tripping their own guard.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/reliability/i);
    expect(code).not.toMatch(/claims\.confidence|reliability_score/);
    // `confidence` DOES appear in the code — as the OUTPUT axis. Assert it is
    // never read off an INPUT by pinning the only fields read from `evidence`.
    const reads = [...code.matchAll(/evidence\??\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(reads)).toEqual(new Set(["documents", "channels", "platforms"]));
  });

  it("scans a file that really exists and would really fail", () => {
    const guard = readFileSync(
      join(__dirname, "..", "analysis", "publication-guard.ts"),
      "utf8",
    );
    expect(FORBIDDEN_SOURCE.some(({ re }) => re.test(guard))).toBe(true);
  });
});
