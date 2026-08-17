import { describe, expect, it } from "vitest";
import {
  CONFLICT_DEFINITIONS,
  CONFLICT_REGISTRY,
  conflictDefinition,
  isTheaterComparability,
  legacyContributorTheaters,
  mappedContributorTheaters,
} from "./definitions";
import { ConflictDomainError } from "./errors";
import { LANE_TAXONOMIES } from "./lanes";
import { CONFLICT_IDS } from "./vocabulary";

describe("registry integrity — russia_ukraine", () => {
  const def = CONFLICT_REGISTRY.russia_ukraine;

  it("binds to the ROCA series with the roca-lanes-v1 taxonomy and ru-ua-ev-v1 policy", () => {
    expect(def.id).toBe("russia_ukraine");
    expect(def.referenceSeries).toBe("roca");
    expect(def.laneTaxonomyVersion).toBe("roca-lanes-v1");
    expect(def.evidencePolicyVersion).toBe("ru-ua-ev-v1");
  });

  it("displayName is presentation, separate from the stable id", () => {
    expect(def.displayName).toBe("Russia–Ukraine War");
    expect(def.displayName).not.toBe(def.id);
  });

  it("lanes are the IDENTICAL frozen objects as the taxonomy — never a divergent copy", () => {
    expect(def.lanes).toBe(LANE_TAXONOMIES["roca-lanes-v1"].lanes);
  });

  it("contributor theaters are ru+ua, both mapped, no legacy contributors", () => {
    expect(def.contributorTheaters).toEqual([
      { theater: "ru", comparability: "mapped" },
      { theater: "ua", comparability: "mapped" },
    ]);
    expect(mappedContributorTheaters(def)).toEqual(["ru", "ua"]);
    expect(legacyContributorTheaters(def)).toEqual([]);
  });

  it("contributor tracks are military only", () => {
    expect(def.contributorTracks).toEqual(["military"]);
  });
});

describe("registry integrity — iran_regional", () => {
  const def = CONFLICT_REGISTRY.iran_regional;

  it("binds to the iran_update series with the iran-lanes-v1 taxonomy and iran-ev-v1 policy", () => {
    expect(def.id).toBe("iran_regional");
    expect(def.referenceSeries).toBe("iran_update");
    expect(def.laneTaxonomyVersion).toBe("iran-lanes-v1");
    expect(def.evidencePolicyVersion).toBe("iran-ev-v1");
    expect(def.displayName).toBe("Iran and Regional Conflict");
  });

  it("lanes are the identical frozen taxonomy objects", () => {
    expect(def.lanes).toBe(LANE_TAXONOMIES["iran-lanes-v1"].lanes);
  });

  it("ir is the ONLY mapped contributor; the FULL il+gulf theater set is explicitly legacy_only (register #4/#10)", () => {
    expect(mappedContributorTheaters(def)).toEqual(["ir"]);
    // grounded roster (Gate-1 MAJOR-1 remediation): every il/gulf theater in
    // scripts/seed.ts — il + sa/ae/qa/om (live RSS, digest-producing under the
    // cron's active-theater loop) + bh/kw (scaffolded; zero digests today is
    // harmless, omission of a digest-producing theater is not)
    expect(legacyContributorTheaters(def)).toEqual(["il", "sa", "ae", "qa", "om", "bh", "kw"]);
  });

  it("legacy contributors are NEVER representable as map-comparable — the class is on the roster entry", () => {
    for (const t of def.contributorTheaters) {
      if (t.theater !== "ir") expect(t.comparability).toBe("legacy_only");
    }
    // and the two views partition the roster exactly
    expect(
      [...mappedContributorTheaters(def), ...legacyContributorTheaters(def)].sort(),
    ).toEqual(def.contributorTheaters.map((t) => t.theater).sort());
  });

  it("contributor tracks are military + nuclear + elite_politics", () => {
    expect(def.contributorTracks).toEqual(["military", "nuclear", "elite_politics"]);
  });
});

describe("registry shape", () => {
  it("exactly the two conflicts, ids unique, CONFLICT_DEFINITIONS in CONFLICT_IDS order", () => {
    expect(Object.keys(CONFLICT_REGISTRY).sort()).toEqual([...CONFLICT_IDS].sort());
    expect(CONFLICT_DEFINITIONS.map((d) => d.id)).toEqual([...CONFLICT_IDS]);
    expect(new Set(CONFLICT_DEFINITIONS.map((d) => d.id)).size).toBe(CONFLICT_DEFINITIONS.length);
  });

  it("contributor theaters are unique within each definition", () => {
    for (const def of CONFLICT_DEFINITIONS) {
      const theaters = def.contributorTheaters.map((t) => t.theater);
      expect(new Set(theaters).size).toBe(theaters.length);
    }
  });

  it("every comparability value is from the bounded vocabulary", () => {
    for (const def of CONFLICT_DEFINITIONS) {
      for (const t of def.contributorTheaters) {
        expect(isTheaterComparability(t.comparability)).toBe(true);
      }
    }
    expect(isTheaterComparability("legacy")).toBe(false);
    expect(isTheaterComparability("comparable")).toBe(false);
  });

  it("the registry is deep-frozen — mutation attempts throw", () => {
    expect(Object.isFrozen(CONFLICT_REGISTRY)).toBe(true);
    expect(Object.isFrozen(CONFLICT_REGISTRY.iran_regional.contributorTheaters)).toBe(true);
    expect(() => {
      (CONFLICT_REGISTRY.iran_regional.contributorTheaters as unknown as unknown[]).push({
        theater: "eg",
        comparability: "mapped",
      });
    }).toThrow();
    expect(() => {
      (CONFLICT_REGISTRY.iran_regional.contributorTheaters[1] as { comparability: string }).comparability =
        "mapped";
    }).toThrow();
    expect(() => {
      (CONFLICT_REGISTRY.russia_ukraine as { displayName: string }).displayName = "tampered";
    }).toThrow();
  });
});

describe("conflictDefinition lookup", () => {
  it("returns the canonical frozen instance for known ids", () => {
    expect(conflictDefinition("russia_ukraine")).toBe(CONFLICT_REGISTRY.russia_ukraine);
    expect(conflictDefinition("iran_regional")).toBe(CONFLICT_REGISTRY.iran_regional);
  });

  it("throws typed on unknown ids — never undefined", () => {
    for (const bad of ["ru", "iran", "russia-ukraine", "", "IRAN_REGIONAL"]) {
      expect(() => conflictDefinition(bad)).toThrowError(ConflictDomainError);
      try {
        conflictDefinition(bad);
      } catch (e) {
        expect((e as ConflictDomainError).code).toBe("unknown_conflict");
      }
    }
  });

  it("is not fooled by prototype-chain property names", () => {
    expect(() => conflictDefinition("toString")).toThrowError(ConflictDomainError);
    expect(() => conflictDefinition("constructor")).toThrowError(ConflictDomainError);
  });
});
