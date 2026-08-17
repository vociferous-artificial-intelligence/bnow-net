// Stable JSON round-trips for the Phase 1 domain objects (contract §13 P1
// exit criteria: configuration, versioning, and serialization).
//
// serialize* emits DETERMINISTIC JSON: object keys sorted recursively, array
// order preserved, no whitespace variance — byte-identical output for equal
// values, so hashes over serialized identities are stable. parse* validates
// UNKNOWN input and throws typed ConflictDomainError on any issue; a parsed
// value is always canonical (extra keys never survive).
//
// Definitions get the strongest rule: the registry is FROZEN, so
// parseConflictDefinition accepts only content deep-equal to the canonical
// CONFLICT_REGISTRY entry for its id and returns THE canonical frozen
// instance. A tampered serialized definition (edited lanes, swapped series,
// re-labeled comparability) can never deserialize silently.

import {
  CONFLICT_REGISTRY,
  isEvidencePolicyVersion,
  isTheaterComparability,
  type ConflictDefinition,
} from "./definitions";
import { ConflictDomainError } from "./errors";
import { isLaneTaxonomyVersion } from "./lanes";
import {
  parseConflictPhaseRecords,
  validatePhaseRecords,
  type ConflictPhaseRecord,
} from "./phases";
import {
  parseReferenceReportIdentity,
  validateReferenceReportIdentity,
  type ReferenceReportIdentity,
} from "./reference-report";
import { isConflictId, isReferenceSeriesId } from "./vocabulary";

// ---------------------------------------------------------------------------
// Stable stringify
// ---------------------------------------------------------------------------

/** JSON.stringify with recursively sorted object keys. Arrays keep their
 *  order (order is meaningful: lanes, precedence, rosters). undefined object
 *  properties are omitted, matching JSON.stringify. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${stableStringify(v)}`);
  }
  return `{${parts.join(",")}}`;
}

// ---------------------------------------------------------------------------
// Conflict definitions
// ---------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Structural validation PLUS canonical-equality against the frozen registry.
 *  [] = valid. */
export function validateConflictDefinition(raw: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["conflict definition: not an object"];
  const d = raw as Partial<ConflictDefinition>;

  if (!isConflictId(d.id)) {
    return [`id: unknown conflict ${JSON.stringify(d.id)}`];
  }
  if (typeof d.displayName !== "string" || d.displayName.length === 0) {
    errs.push("displayName: must be a non-empty string");
  }
  if (!isReferenceSeriesId(d.referenceSeries)) {
    errs.push(`referenceSeries: unknown series ${JSON.stringify(d.referenceSeries)}`);
  }
  if (!isLaneTaxonomyVersion(d.laneTaxonomyVersion)) {
    errs.push(`laneTaxonomyVersion: unknown version ${JSON.stringify(d.laneTaxonomyVersion)}`);
  }
  if (!isEvidencePolicyVersion(d.evidencePolicyVersion)) {
    errs.push(`evidencePolicyVersion: unknown version ${JSON.stringify(d.evidencePolicyVersion)}`);
  }
  if (!Array.isArray(d.lanes) || d.lanes.length === 0) {
    errs.push("lanes: must be a non-empty array");
  }
  if (!Array.isArray(d.contributorTheaters) || d.contributorTheaters.length === 0) {
    errs.push("contributorTheaters: must be a non-empty array");
  } else {
    const seen = new Set<string>();
    for (const t of d.contributorTheaters) {
      if (!isRecord(t) || typeof t.theater !== "string" || !isTheaterComparability(t.comparability)) {
        errs.push(`contributorTheaters: invalid entry ${JSON.stringify(t)}`);
        continue;
      }
      if (seen.has(t.theater)) errs.push(`contributorTheaters: duplicate theater ${t.theater}`);
      seen.add(t.theater);
    }
  }
  if (!Array.isArray(d.contributorTracks) || d.contributorTracks.length === 0) {
    errs.push("contributorTracks: must be a non-empty array");
  }
  if (errs.length > 0) return errs;

  // canonical-equality: the registry is frozen, so any drift is tampering
  const canonical = CONFLICT_REGISTRY[d.id];
  if (stableStringify(raw) !== stableStringify(canonical)) {
    errs.push(
      `definition for ${d.id} does not match the frozen registry entry ` +
        "(definitions are frozen configuration — a changed definition requires new versions in the registry, not a divergent serialized copy)",
    );
  }
  return errs;
}

/** Parse + validate from unknown input; returns THE canonical frozen registry
 *  instance. Throws typed on any issue. */
export function parseConflictDefinition(raw: unknown): ConflictDefinition {
  const issues = validateConflictDefinition(raw);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_conflict_definition", "invalid conflict definition", issues);
  }
  return CONFLICT_REGISTRY[(raw as ConflictDefinition).id];
}

export function serializeConflictDefinition(def: ConflictDefinition): string {
  return stableStringify(def);
}

// ---------------------------------------------------------------------------
// Reference report identities
// ---------------------------------------------------------------------------

export function serializeReferenceReportIdentity(identity: ReferenceReportIdentity): string {
  const issues = validateReferenceReportIdentity(identity);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_reference_report", "refusing to serialize an invalid reference report identity", issues);
  }
  return stableStringify(identity);
}

export { parseReferenceReportIdentity };

// ---------------------------------------------------------------------------
// Phase records
// ---------------------------------------------------------------------------

export function serializeConflictPhaseRecords(records: readonly ConflictPhaseRecord[]): string {
  const issues = validatePhaseRecords(records as unknown[]);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_phase_set", "refusing to serialize an invalid phase record set", issues);
  }
  return stableStringify(records);
}

export { parseConflictPhaseRecords };
