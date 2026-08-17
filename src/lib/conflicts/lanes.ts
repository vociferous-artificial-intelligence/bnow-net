// Versioned lane taxonomies (Phase 1; contract §4, frozen at Gate 0).
//
// Lane taxonomies are stable, versioned, and comparable over time. Lane
// assignment partitions the SAME declared reference units — lanes are never
// independent reports and never change the headline denominator. Every lane
// has a stable machine id and a SEPARATE human display label; `description`
// carries the contract's own §4 gloss verbatim where the contract gives one
// (null where it does not — nothing is invented beyond the frozen text).
//
// Lookup is FAIL-CLOSED: an unknown taxonomy version or lane id throws a
// typed ConflictDomainError — never a silent empty set, never undefined.

import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import type { ConflictId, ExclusionReason } from "./vocabulary";

// ---------------------------------------------------------------------------
// Lane ids (exactly the contract §4 sets)
// ---------------------------------------------------------------------------

export const ROCA_LANE_IDS = deepFreeze([
  "frontline_maneuver",
  "strikes_air_defense",
  "force_generation",
  "occupied_crossborder",
  "foreign_support",
  "russia_partners",
  "strategic_political",
  "other_in_scope",
] as const);
export type RocaLaneId = (typeof ROCA_LANE_IDS)[number];

export const IRAN_LANE_IDS = deepFreeze([
  "direct_kinetic",
  "proxy_partner",
  "maritime",
  "nuclear_diplomacy",
  "domestic_security",
  "regional_effects",
  "other_in_scope",
] as const);
export type IranLaneId = (typeof IRAN_LANE_IDS)[number];

export type ConflictLaneId = RocaLaneId | IranLaneId;

// ---------------------------------------------------------------------------
// Lanes and taxonomies
// ---------------------------------------------------------------------------

export interface ConflictLane {
  /** stable machine id — persisted, compared over time, never renamed */
  id: ConflictLaneId;
  /** human display label — presentation only, free to localize/reword */
  label: string;
  /** the contract §4 gloss, verbatim; null where §4 gives none */
  description: string | null;
}

export const LANE_TAXONOMY_VERSIONS = deepFreeze(["roca-lanes-v1", "iran-lanes-v1"] as const);
export type LaneTaxonomyVersion = (typeof LANE_TAXONOMY_VERSIONS)[number];

export function isLaneTaxonomyVersion(value: unknown): value is LaneTaxonomyVersion {
  return typeof value === "string" && (LANE_TAXONOMY_VERSIONS as readonly string[]).includes(value);
}

export interface LaneTaxonomy {
  version: LaneTaxonomyVersion;
  conflictId: ConflictId;
  lanes: readonly ConflictLane[];
}

const ROCA_LANES: readonly ConflictLane[] = [
  { id: "frontline_maneuver", label: "Front-line maneuver", description: null },
  {
    id: "strikes_air_defense",
    label: "Strikes and air defense",
    description: "long-range strikes and air defense, both directions",
  },
  {
    id: "force_generation",
    label: "Force generation",
    description: "mobilization, logistics, military industry",
  },
  {
    id: "occupied_crossborder",
    label: "Occupied territories and cross-border",
    description: "occupied territories incl. Crimea; cross-border ops incl. Kursk/Belgorod",
  },
  {
    id: "foreign_support",
    label: "Foreign support",
    description: "foreign military support and coalition decisions for Ukraine",
  },
  {
    id: "russia_partners",
    label: "Russia's partners",
    description: "DPRK, Iran, Belarus and other Russian enablement",
  },
  {
    id: "strategic_political",
    label: "Strategic-political",
    description: "decisions directly shaping the war",
  },
  { id: "other_in_scope", label: "Other in scope", description: null },
];

const IRAN_LANES: readonly ConflictLane[] = [
  {
    id: "direct_kinetic",
    label: "Direct kinetic",
    description: "direct Iran–Israel–US fighting / force posture",
  },
  {
    id: "proxy_partner",
    label: "Proxies and partners",
    description: "Hezbollah/Lebanon, Iraqi militias, Houthis/Yemen, Palestinian groups, Syria",
  },
  {
    id: "maritime",
    label: "Maritime",
    description: "Hormuz / Red Sea / Gulf shipping and bases",
  },
  {
    id: "nuclear_diplomacy",
    label: "Nuclear diplomacy",
    description: "program, IAEA, E3/EU, mediators",
  },
  {
    id: "domestic_security",
    label: "Domestic security",
    description: "Iranian internal security, elite politics, succession",
  },
  {
    id: "regional_effects",
    label: "Regional effects",
    description: "regional diplomacy, sanctions, military-economic effects",
  },
  { id: "other_in_scope", label: "Other in scope", description: null },
];

export const LANE_TAXONOMIES: Readonly<Record<LaneTaxonomyVersion, LaneTaxonomy>> = deepFreeze({
  "roca-lanes-v1": {
    version: "roca-lanes-v1",
    conflictId: "russia_ukraine",
    lanes: ROCA_LANES,
  },
  "iran-lanes-v1": {
    version: "iran-lanes-v1",
    conflictId: "iran_regional",
    lanes: IRAN_LANES,
  },
});

// ---------------------------------------------------------------------------
// Fail-closed lookups
// ---------------------------------------------------------------------------

/** The taxonomy for a version. Throws (typed) on an unknown version — a
 *  consumer holding a version string this registry does not know must stop,
 *  not proceed over an empty lane set. */
export function laneTaxonomy(version: string): LaneTaxonomy {
  if (!isLaneTaxonomyVersion(version)) {
    throw new ConflictDomainError(
      "unknown_lane_taxonomy_version",
      `unknown lane taxonomy version: ${JSON.stringify(version)}`,
    );
  }
  return LANE_TAXONOMIES[version];
}

/** Lane ids of a taxonomy version, in taxonomy order. Fail-closed on version. */
export function laneIds(version: string): readonly ConflictLaneId[] {
  return laneTaxonomy(version).lanes.map((lane) => lane.id);
}

/** Membership test for a lane id under a version. The VERSION is fail-closed
 *  (unknown version throws); the lane id is the value under test and returns
 *  a boolean. */
export function isLaneInTaxonomy(version: string, laneId: string): boolean {
  return laneTaxonomy(version).lanes.some((lane) => lane.id === laneId);
}

/** One lane by id under a version. Throws (typed) when the lane is not in the
 *  taxonomy. */
export function laneById(version: string, laneId: string): ConflictLane {
  const lane = laneTaxonomy(version).lanes.find((l) => l.id === laneId);
  if (!lane) {
    throw new ConflictDomainError(
      "unknown_lane",
      `lane ${JSON.stringify(laneId)} is not in taxonomy ${version}`,
    );
  }
  return lane;
}

// ---------------------------------------------------------------------------
// Evidence-eligibility record shape (contract §5)
// ---------------------------------------------------------------------------

/** The per-candidate eligibility outcome later phases record for EVERY
 *  candidate: included records carry the assigned lane plus free-form
 *  inclusion diagnostics (the fixture corpus's `lane:`/`actor:`/`geo:`/
 *  `track:`/`window:` prefixed strings); excluded records carry EXACTLY ONE
 *  bounded reason — the dominant one under the frozen precedence order
 *  (dominantExclusionReason). Membership described here is the CORPUS-RECALL
 *  candidate union; published-retention membership is a separate population
 *  (contract §6.1) and is never inferred from this record. */
export type EligibilityRecord =
  | { included: true; lane: ConflictLaneId; reasons: readonly string[] }
  | { included: false; reason: ExclusionReason };
