import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  IRAN_LANE_IDS,
  LANE_TAXONOMIES,
  LANE_TAXONOMY_VERSIONS,
  ROCA_LANE_IDS,
  isLaneInTaxonomy,
  isLaneTaxonomyVersion,
  laneById,
  laneIds,
  laneTaxonomy,
} from "./lanes";

describe("lane id sets — exactly the contract §4 taxonomies", () => {
  it("roca-lanes-v1 lists exactly the eight ROCA lanes, in contract order", () => {
    expect(ROCA_LANE_IDS).toEqual([
      "frontline_maneuver",
      "strikes_air_defense",
      "force_generation",
      "occupied_crossborder",
      "foreign_support",
      "russia_partners",
      "strategic_political",
      "other_in_scope",
    ]);
  });

  it("iran-lanes-v1 lists exactly the seven Iran lanes, in contract order", () => {
    expect(IRAN_LANE_IDS).toEqual([
      "direct_kinetic",
      "proxy_partner",
      "maritime",
      "nuclear_diplomacy",
      "domestic_security",
      "regional_effects",
      "other_in_scope",
    ]);
  });

  it("taxonomy lane objects carry those ids exactly, in the same order", () => {
    expect(LANE_TAXONOMIES["roca-lanes-v1"].lanes.map((l) => l.id)).toEqual([...ROCA_LANE_IDS]);
    expect(LANE_TAXONOMIES["iran-lanes-v1"].lanes.map((l) => l.id)).toEqual([...IRAN_LANE_IDS]);
  });

  it("other_in_scope is present in BOTH taxonomies — never a silent drop", () => {
    for (const version of LANE_TAXONOMY_VERSIONS) {
      expect(LANE_TAXONOMIES[version].lanes.some((l) => l.id === "other_in_scope")).toBe(true);
    }
  });

  it("lane ids are unique within each taxonomy", () => {
    for (const version of LANE_TAXONOMY_VERSIONS) {
      const ids = LANE_TAXONOMIES[version].lanes.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("labels are separate from ids", () => {
  it("every lane has a non-empty human label that is NOT its machine id", () => {
    for (const version of LANE_TAXONOMY_VERSIONS) {
      for (const lane of LANE_TAXONOMIES[version].lanes) {
        expect(lane.label.length).toBeGreaterThan(0);
        expect(lane.label).not.toBe(lane.id);
        // ids are snake_case machine tokens; labels are human text
        expect(lane.id).toMatch(/^[a-z][a-z_]*$/);
      }
    }
  });

  it("description is the §4 gloss or null — present on the described lanes", () => {
    expect(laneById("roca-lanes-v1", "frontline_maneuver").description).toBeNull();
    expect(laneById("roca-lanes-v1", "russia_partners").description).toContain("DPRK");
    expect(laneById("iran-lanes-v1", "maritime").description).toContain("Hormuz");
    expect(laneById("iran-lanes-v1", "other_in_scope").description).toBeNull();
  });
});

describe("taxonomy metadata", () => {
  it("versions self-describe and bind to their conflicts", () => {
    expect(LANE_TAXONOMY_VERSIONS).toEqual(["roca-lanes-v1", "iran-lanes-v1"]);
    expect(LANE_TAXONOMIES["roca-lanes-v1"].version).toBe("roca-lanes-v1");
    expect(LANE_TAXONOMIES["roca-lanes-v1"].conflictId).toBe("russia_ukraine");
    expect(LANE_TAXONOMIES["iran-lanes-v1"].version).toBe("iran-lanes-v1");
    expect(LANE_TAXONOMIES["iran-lanes-v1"].conflictId).toBe("iran_regional");
  });

  it("taxonomies are deep-frozen — a mutation attempt throws", () => {
    expect(Object.isFrozen(LANE_TAXONOMIES)).toBe(true);
    expect(Object.isFrozen(LANE_TAXONOMIES["roca-lanes-v1"].lanes)).toBe(true);
    expect(Object.isFrozen(LANE_TAXONOMIES["iran-lanes-v1"].lanes[0])).toBe(true);
    expect(() => {
      (LANE_TAXONOMIES["roca-lanes-v1"].lanes as unknown as unknown[]).push({});
    }).toThrow();
    expect(() => {
      (LANE_TAXONOMIES["iran-lanes-v1"].lanes[0] as { label: string }).label = "tampered";
    }).toThrow();
  });
});

describe("fail-closed lookup", () => {
  it("laneTaxonomy returns the taxonomy for known versions", () => {
    expect(laneTaxonomy("roca-lanes-v1")).toBe(LANE_TAXONOMIES["roca-lanes-v1"]);
    expect(laneTaxonomy("iran-lanes-v1")).toBe(LANE_TAXONOMIES["iran-lanes-v1"]);
  });

  it("an unknown version throws typed — NEVER a silent empty set", () => {
    for (const bad of ["roca-lanes-v2", "iran-lanes", "", "ROCA-LANES-V1"]) {
      expect(() => laneTaxonomy(bad)).toThrowError(ConflictDomainError);
      try {
        laneTaxonomy(bad);
      } catch (e) {
        expect((e as ConflictDomainError).code).toBe("unknown_lane_taxonomy_version");
      }
    }
  });

  it("laneIds fails closed on version too", () => {
    expect(laneIds("iran-lanes-v1")).toEqual([...IRAN_LANE_IDS]);
    expect(() => laneIds("nope-v9")).toThrowError(ConflictDomainError);
  });

  it("isLaneInTaxonomy: boolean for lane membership, throw for unknown version", () => {
    expect(isLaneInTaxonomy("roca-lanes-v1", "frontline_maneuver")).toBe(true);
    expect(isLaneInTaxonomy("roca-lanes-v1", "direct_kinetic")).toBe(false); // iran lane, not roca
    expect(isLaneInTaxonomy("iran-lanes-v1", "direct_kinetic")).toBe(true);
    expect(isLaneInTaxonomy("iran-lanes-v1", "frontline_maneuver")).toBe(false);
    expect(() => isLaneInTaxonomy("unknown-v1", "frontline_maneuver")).toThrowError(
      ConflictDomainError,
    );
  });

  it("laneById throws typed on a lane the taxonomy does not contain", () => {
    expect(laneById("roca-lanes-v1", "foreign_support").id).toBe("foreign_support");
    expect(() => laneById("roca-lanes-v1", "maritime")).toThrowError(ConflictDomainError);
    try {
      laneById("roca-lanes-v1", "maritime");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("unknown_lane");
    }
  });

  it("isLaneTaxonomyVersion guard behavior", () => {
    expect(isLaneTaxonomyVersion("roca-lanes-v1")).toBe(true);
    expect(isLaneTaxonomyVersion("iran-lanes-v1")).toBe(true);
    expect(isLaneTaxonomyVersion("roca-lanes-v2")).toBe(false);
    expect(isLaneTaxonomyVersion(null)).toBe(false);
  });
});
