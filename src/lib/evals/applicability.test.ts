import { afterEach, describe, expect, it } from "vitest";
import { classifyCaseApplicability } from "./applicability";
import type { AnalysisEvalCase, DigestEvalCase, EvalEnvKnobs, MapEvalCase } from "./contracts";
import { applyCapacityProfile } from "./capacity-profiles";
import { currentEnvKnobs, scoreOfflineCase } from "./runner";

const KNOBS = (over: Partial<EvalEnvKnobs>): EvalEnvKnobs => ({
  reduceVotes: 5,
  reduceMaxOutputTokens: 6000,
  mapOutTokensPerDoc: 200,
  mapContentChars: 1500,
  reduceGroupsFed: 200,
  ...over,
});

function mapCase(minMapContentChars?: number): MapEvalCase {
  return {
    id: "map-a-001",
    workload: "map",
    partition: "edge",
    split: "development",
    provenance: "authored-2026-08-27",
    input: {
      theater: "ua",
      track: "military",
      docs: [{ docId: 1, title: null, content: "x".repeat(50), lang: "en", day: "2026-08-01" }],
    },
    reference: { expected: [{ docId: 1, claims: [] }] },
    // deliberately unparseable rawOutput: an inapplicable case must be
    // classified WITHOUT touching the fixture (see the runner block below)
    offline: { fixtureId: "f1", rawOutput: "not json at all", expectation: "pass" },
    ...(minMapContentChars !== undefined
      ? { capacityMeta: { minMapContentChars } }
      : {}),
  };
}

function digestCase(exactReduceGroupsFed?: number): DigestEvalCase {
  return {
    id: "dig-a-001",
    workload: "digest",
    partition: "edge",
    split: "development",
    provenance: "authored-2026-08-27",
    input: {
      theater: "ua",
      track: "military",
      date: "2026-09-01",
      claims: [
        {
          id: 1,
          docId: 10,
          textEn: "A synthetic claim.",
          quoteOrig: null,
          quoteVerified: false,
          claimType: "factual",
          hedging: "claimed",
          entities: [],
          eventHint: null,
          claimDate: "2026-09-01",
          sourceDomain: null,
          sourceKey: null,
          reliability: null,
          adapter: "rss",
          platform: null,
          publishedAt: null,
        },
      ],
    },
    reference: {},
    offline: { fixtureId: "f1", votes: ["{}"], expectation: "pass" },
    ...(exactReduceGroupsFed !== undefined ? { capacityMeta: { exactReduceGroupsFed } } : {}),
  };
}

describe("classifyCaseApplicability", () => {
  it("map minMapContentChars has MIN semantics", () => {
    const c = mapCase(5100);
    expect(classifyCaseApplicability(c, KNOBS({ mapContentChars: 1500 })).applicable).toBe(false);
    expect(classifyCaseApplicability(c, KNOBS({ mapContentChars: 4000 })).applicable).toBe(false);
    expect(classifyCaseApplicability(c, KNOBS({ mapContentChars: 5100 })).applicable).toBe(true);
    expect(classifyCaseApplicability(c, KNOBS({ mapContentChars: 20000 })).applicable).toBe(true);
    const inap = classifyCaseApplicability(c, KNOBS({ mapContentChars: 1500 }));
    expect(inap.requirement).toEqual({ kind: "minMapContentChars", knob: "mapContentChars", required: 5100, actual: 1500 });
    expect(inap.reason).toContain("1500 < required 5100");
  });

  it("digest exactReduceGroupsFed has EXACT semantics (breaks both directions)", () => {
    const c = digestCase(400);
    expect(classifyCaseApplicability(c, KNOBS({ reduceGroupsFed: 200 })).applicable).toBe(false);
    expect(classifyCaseApplicability(c, KNOBS({ reduceGroupsFed: 400 })).applicable).toBe(true);
    const c200 = digestCase(200);
    expect(classifyCaseApplicability(c200, KNOBS({ reduceGroupsFed: 400 })).applicable).toBe(false);
    expect(classifyCaseApplicability(c200, KNOBS({ reduceGroupsFed: 200 })).applicable).toBe(true);
  });

  it("cases without capacity requirements are always applicable", () => {
    for (const c of [mapCase(), digestCase()] as AnalysisEvalCase[]) {
      const a = classifyCaseApplicability(c, KNOBS({ mapContentChars: 200, reduceGroupsFed: 50 }));
      expect(a.applicable).toBe(true);
      expect(a.requirement).toBeNull();
    }
  });
});

describe("scoreOfflineCase applicability integration", () => {
  afterEach(() => applyCapacityProfile("baseline")());

  it("classifies an unmet requirement WITHOUT touching the fixture", () => {
    // baseline knobs (1500) < required 5100; the fixture's rawOutput is
    // deliberately unparseable — a "score anyway" regression would surface as
    // schema_invalid instead of inapplicable
    const restore = applyCapacityProfile("baseline");
    try {
      const r = scoreOfflineCase(mapCase(5100), "map-vtest", "run1");
      expect(r.status).toBe("inapplicable");
      expect(r.checks.pass).toBe(false);
      expect(r.checks.failures[0]).toContain("structurally inapplicable");
      expect(r.applicability).toEqual({
        required: { minMapContentChars: 5100 },
        actual: { mapContentChars: 1500 },
        reason: expect.stringContaining("1500 < required 5100") as unknown as string,
      });
      expect(r.fixtureId).toBe("f1");
    } finally {
      restore();
    }
  });

  it("scores normally when the applied profile satisfies the requirement", () => {
    const restore = applyCapacityProfile("map-depth-full");
    try {
      expect(currentEnvKnobs().mapContentChars).toBe(20000);
      const r = scoreOfflineCase(mapCase(5100), "map-vtest", "run1");
      // now the fixture IS scored — and its garbage rawOutput surfaces as the
      // schema_invalid it really is
      expect(r.status).toBe("schema_invalid");
    } finally {
      restore();
    }
  });
});
