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
import { parseConflictPhaseRecords, type ConflictPhaseRecord } from "./phases";
import { parseReferenceReportIdentity, type ReferenceReportIdentity } from "./reference-report";
import { isConflictId, isReferenceSeriesId } from "./vocabulary";

// ---------------------------------------------------------------------------
// Stable stringify
// ---------------------------------------------------------------------------

/** JSON.stringify with recursively sorted object keys. Arrays keep their
 *  order (order is meaningful: lanes, precedence, rosters).
 *
 *  FAIL-CLOSED (Gate-1 MINOR-3): anything without one canonical JSON form
 *  throws a typed error instead of being silently coerced or dropped —
 *  undefined/function/symbol/bigint values (in properties or array slots,
 *  holes included), symbol-keyed properties, non-finite numbers, non-plain
 *  objects (class instances, Date, Map, Set, RegExp; toJSON is deliberately
 *  unsupported — determinism over convenience), and cycles (throw, never
 *  hang). Shared acyclic references (a DAG) are fine. */
export function stableStringify(value: unknown): string {
  return stringifyValue(value, "$", new Set());
}

function stringifyValue(value: unknown, path: string, inProgress: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new ConflictDomainError(
          "unserializable_value",
          `${path}: non-finite number ${String(value)} has no JSON form`,
        );
      }
      return JSON.stringify(value);
    case "object":
      break; // handled below
    default:
      // undefined, function, symbol, bigint
      throw new ConflictDomainError(
        "unserializable_value",
        `${path}: ${typeof value} has no JSON form (omit the key instead of storing undefined)`,
      );
  }
  const obj = value as object;
  if (inProgress.has(obj)) {
    throw new ConflictDomainError("unserializable_value", `${path}: cyclic reference`);
  }
  inProgress.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        // a hole reads as undefined and falls into the default case above
        parts.push(stringifyValue(obj[i], `${path}[${i}]`, inProgress));
      }
      return `[${parts.join(",")}]`;
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      throw new ConflictDomainError(
        "unserializable_value",
        `${path}: non-plain object (constructor ${String(
          (proto as { constructor?: { name?: string } })?.constructor?.name ?? "unknown",
        )}) has no canonical JSON form here`,
      );
    }
    if (Object.getOwnPropertySymbols(obj).length > 0) {
      throw new ConflictDomainError(
        "unserializable_value",
        `${path}: symbol-keyed properties have no JSON form`,
      );
    }
    const record = obj as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      parts.push(`${JSON.stringify(key)}:${stringifyValue(record[key], `${path}.${key}`, inProgress)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    inProgress.delete(obj);
  }
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

  // canonical-equality: the registry is frozen, so any drift is tampering.
  // stableStringify is fail-closed; an unserializable input value is itself
  // a validation failure here, never an escaping throw.
  const canonical = CONFLICT_REGISTRY[d.id];
  let rawBytes: string;
  try {
    rawBytes = stableStringify(raw);
  } catch (e) {
    errs.push(`definition for ${d.id} is not canonically serializable: ${(e as Error).message}`);
    return errs;
  }
  if (rawBytes !== stableStringify(canonical)) {
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

/** Serialize the CANONICAL registry projection (validated; a definition that
 *  is not deep-equal to its frozen registry entry refuses to serialize), so
 *  semantically equal inputs always produce byte-identical output. */
export function serializeConflictDefinition(def: ConflictDefinition): string {
  return stableStringify(parseConflictDefinition(def));
}

// ---------------------------------------------------------------------------
// Reference report identities
// ---------------------------------------------------------------------------

/** Serialize the parsed CANONICAL projection (unknown keys dropped, field set
 *  fixed — Gate-1 MINOR-2): semantically equal identities produce
 *  byte-identical output. Throws typed on an invalid identity. */
export function serializeReferenceReportIdentity(identity: ReferenceReportIdentity): string {
  return stableStringify(parseReferenceReportIdentity(identity));
}

export { parseReferenceReportIdentity };

// ---------------------------------------------------------------------------
// Phase records
// ---------------------------------------------------------------------------

/** Serialize the parsed CANONICAL projection of the whole set (per-record
 *  unknown keys dropped — Gate-1 MINOR-2). Throws typed on an invalid set. */
export function serializeConflictPhaseRecords(records: readonly ConflictPhaseRecord[]): string {
  return stableStringify(parseConflictPhaseRecords(records));
}

export { parseConflictPhaseRecords };
