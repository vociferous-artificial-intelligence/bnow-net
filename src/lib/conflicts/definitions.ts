// The frozen conflict registry (Phase 1; contract §0/§2/§4/§5, decision
// register #4).
//
// A ConflictDefinition is CONFIGURATION, not state: two conflicts, each bound
// to one external reference series, one versioned lane taxonomy, one
// versioned evidence policy, and an explicit contributor roster. Theater is a
// coverage lens under the conflict layer (contract §0) — contributor theaters
// say where eligible evidence may come FROM today, never what the conflict IS,
// and a source's home country is neither necessary nor sufficient for
// relevance (contract §5).
//
// COMPARABILITY HONESTY (contract §5, register #4): il/gulf theaters have no
// map-stage doc_claims (legacy engine only). Their contributor entries are
// explicitly `legacy_only` and may NEVER be silently treated as
// map-comparable: legacy claims enter ONLY the published-retention population,
// labeled `legacy`; the corpus-recall population is current-version mapped
// claims only, and a legacy candidate's corpus-recall exclusion reason is
// `legacy_incomparable`. The comparability class lives ON the roster entry so
// no later phase can consume a contributor theater without seeing it.

import type { Track } from "../analysis/tracks";
import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import {
  LANE_TAXONOMIES,
  type ConflictLane,
  type LaneTaxonomyVersion,
} from "./lanes";
import { CONFLICT_IDS, isConflictId, type ConflictId, type ReferenceSeriesId } from "./vocabulary";

// ---------------------------------------------------------------------------
// Contributor theaters with an explicit comparability class
// ---------------------------------------------------------------------------

/** `mapped` = current-version map-stage doc_claims exist for this theater —
 *  eligible for BOTH pipeline questions (corpus recall AND published
 *  retention). `legacy_only` = legacy-engine digests only — eligible for the
 *  published-retention population EXCLUSIVELY, always labeled legacy there. */
export const THEATER_COMPARABILITIES = deepFreeze(["mapped", "legacy_only"] as const);
export type TheaterComparability = (typeof THEATER_COMPARABILITIES)[number];

export function isTheaterComparability(value: unknown): value is TheaterComparability {
  return typeof value === "string" && (THEATER_COMPARABILITIES as readonly string[]).includes(value);
}

export interface ContributorTheater {
  /** iso2 theater code (a coverage lens, never a nationality — ruling 11) */
  theater: string;
  comparability: TheaterComparability;
}

// ---------------------------------------------------------------------------
// Conflict definitions
// ---------------------------------------------------------------------------

/** Initial evidence-policy versions (contract §5). */
export const EVIDENCE_POLICY_VERSIONS = deepFreeze(["ru-ua-ev-v1", "iran-ev-v1"] as const);
export type ConflictEvidencePolicyVersion = (typeof EVIDENCE_POLICY_VERSIONS)[number];

export function isEvidencePolicyVersion(value: unknown): value is ConflictEvidencePolicyVersion {
  return typeof value === "string" && (EVIDENCE_POLICY_VERSIONS as readonly string[]).includes(value);
}

export interface ConflictDefinition {
  id: ConflictId;
  /** presentation only — the stable identity is `id` */
  displayName: string;
  referenceSeries: ReferenceSeriesId;
  /** the SAME frozen lane objects as LANE_TAXONOMIES[laneTaxonomyVersion] —
   *  identity, not a copy, so the two can never diverge */
  lanes: readonly ConflictLane[];
  laneTaxonomyVersion: LaneTaxonomyVersion;
  evidencePolicyVersion: ConflictEvidencePolicyVersion;
  contributorTheaters: readonly ContributorTheater[];
  contributorTracks: readonly Track[];
}

/** The frozen registry. russia_ukraine scores against ROCA over ru+ua mapped
 *  military evidence; iran_regional scores against the Iran Update over ir
 *  mapped military+nuclear+elite_politics evidence plus the labeled legacy
 *  il/gulf contributors (register #4 — il, plus the scaffolded gulf theaters
 *  bh and kw, exactly the designated legacy digest theaters). */
export const CONFLICT_REGISTRY: Readonly<Record<ConflictId, ConflictDefinition>> = deepFreeze({
  russia_ukraine: {
    id: "russia_ukraine",
    displayName: "Russia–Ukraine War",
    referenceSeries: "roca",
    lanes: LANE_TAXONOMIES["roca-lanes-v1"].lanes,
    laneTaxonomyVersion: "roca-lanes-v1",
    evidencePolicyVersion: "ru-ua-ev-v1",
    contributorTheaters: [
      { theater: "ru", comparability: "mapped" },
      { theater: "ua", comparability: "mapped" },
    ],
    contributorTracks: ["military"],
  },
  iran_regional: {
    id: "iran_regional",
    displayName: "Iran and Regional Conflict",
    referenceSeries: "iran_update",
    lanes: LANE_TAXONOMIES["iran-lanes-v1"].lanes,
    laneTaxonomyVersion: "iran-lanes-v1",
    evidencePolicyVersion: "iran-ev-v1",
    contributorTheaters: [
      { theater: "ir", comparability: "mapped" },
      { theater: "il", comparability: "legacy_only" },
      { theater: "bh", comparability: "legacy_only" },
      { theater: "kw", comparability: "legacy_only" },
    ],
    contributorTracks: ["military", "nuclear", "elite_politics"],
  },
});

/** All definitions, in CONFLICT_IDS order. */
export const CONFLICT_DEFINITIONS: readonly ConflictDefinition[] = deepFreeze(
  CONFLICT_IDS.map((id) => CONFLICT_REGISTRY[id]),
);

/** Registry lookup. Throws (typed) on an unknown id — never undefined, and
 *  never a prototype-chain property (the guard checks the id vocabulary, not
 *  object property presence). */
export function conflictDefinition(id: string): ConflictDefinition {
  if (!isConflictId(id)) {
    throw new ConflictDomainError("unknown_conflict", `unknown conflict id: ${JSON.stringify(id)}`);
  }
  return CONFLICT_REGISTRY[id];
}

/** Contributor theaters eligible for the corpus-recall population. */
export function mappedContributorTheaters(def: ConflictDefinition): readonly string[] {
  return def.contributorTheaters.filter((t) => t.comparability === "mapped").map((t) => t.theater);
}

/** Contributor theaters eligible ONLY for the published-retention population,
 *  always labeled legacy there (contract §5 comparability honesty). */
export function legacyContributorTheaters(def: ConflictDefinition): readonly string[] {
  return def.contributorTheaters
    .filter((t) => t.comparability === "legacy_only")
    .map((t) => t.theater);
}
