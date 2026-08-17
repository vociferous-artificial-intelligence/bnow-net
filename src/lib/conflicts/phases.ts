// Conflict phase records (Phase 1; contract §4).
//
// Phases are IMMUTABLE, prospectively declared records. A phase may label,
// rank, or explain lanes; it may NOT retroactively exclude misses from the
// headline denominator. There is deliberately NO mutable "current phase"
// anywhere — resolution is the pure function phaseAt(records, conflictId,
// point), so history can never be rewritten by flipping a global.
//
// INTERVAL SEMANTICS (pinned by tests): a record covers the half-open
// interval [effectiveFrom, END).
//   - effectiveFrom: ISO day (00:00:00Z of that day, inclusive) or
//     explicit-timezone instant (inclusive).
//   - effectiveTo: null = open-ended; an ISO DAY is INCLUSIVE of that whole
//     UTC day (END = 00:00:00Z of the next day, so from=to describes a valid
//     one-day phase); an explicit-timezone INSTANT is EXCLUSIVE at exactly
//     that instant.
// Half-open intervals make adjacency unambiguous: a record ending where the
// next begins does not overlap it, and any in-range point resolves to exactly
// one record.
//
// RETROSPECTIVE DECLARATIONS (contract §4): declaredAt at-or-after the
// record's END means the phase was already over when declared — VALID, but
// flagged as a retrospective annotation, never as-published policy.

import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import { isIsoDay, isIsoInstant, parseIsoDayMs, parseIsoInstantMs } from "./instants";
import { isConflictId, type ConflictId } from "./vocabulary";

export interface ConflictPhaseRecord {
  conflictId: ConflictId;
  /** stable slug — lowercase letters/digits/underscore/hyphen, never renamed */
  phaseId: string;
  /** ISO day or explicit-timezone instant; inclusive start */
  effectiveFrom: string;
  /** null = open-ended; ISO day = inclusive of that whole UTC day; instant =
   *  exclusive end */
  effectiveTo: string | null;
  /** ISO day or explicit-timezone instant the record was declared at */
  declaredAt: string;
  policyVersion: string;
  provenance: string;
}

const PHASE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DAY_MS = 86_400_000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** ms of a day-or-instant string read as a POINT (day = its 00:00:00Z start),
 *  or null when malformed. */
function pointMs(value: string): number | null {
  if (isIsoDay(value)) return parseIsoDayMs(value);
  if (isIsoInstant(value)) return parseIsoInstantMs(value);
  return null;
}

/** ms of the record's EXCLUSIVE end, or null for open-ended / Infinity-style
 *  comparisons use effectiveEndMsOrInfinity. Assumes a validated record. */
function effectiveEndMs(record: ConflictPhaseRecord): number | null {
  if (record.effectiveTo === null) return null;
  if (isIsoDay(record.effectiveTo)) return parseIsoDayMs(record.effectiveTo)! + DAY_MS;
  return parseIsoInstantMs(record.effectiveTo)!;
}

function effectiveEndMsOrInfinity(record: ConflictPhaseRecord): number {
  return effectiveEndMs(record) ?? Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Per-record structural + semantic validation. [] = valid (house style).
 *  Retrospective declarations are NOT an error — see
 *  isRetrospectivePhaseRecord. */
export function validatePhaseRecord(raw: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["phase record: not an object"];
  const r = raw as Partial<ConflictPhaseRecord>;

  if (!isConflictId(r.conflictId)) {
    errs.push(`conflictId: unknown conflict ${JSON.stringify(r.conflictId)}`);
  }
  if (typeof r.phaseId !== "string" || !PHASE_ID_RE.test(r.phaseId)) {
    errs.push(
      `phaseId: must be a stable lowercase slug (${String(PHASE_ID_RE)}), got ${JSON.stringify(r.phaseId)}`,
    );
  }

  let fromMs: number | null = null;
  if (typeof r.effectiveFrom !== "string" || (fromMs = pointMs(r.effectiveFrom)) === null) {
    errs.push(
      `effectiveFrom: must be an ISO day or explicit-timezone instant, got ${JSON.stringify(r.effectiveFrom)}`,
    );
  }

  if (r.effectiveTo !== null) {
    if (typeof r.effectiveTo !== "string" || pointMs(r.effectiveTo) === null) {
      errs.push(
        `effectiveTo: must be null, an ISO day, or an explicit-timezone instant, got ${JSON.stringify(r.effectiveTo)}`,
      );
    } else if (fromMs !== null) {
      const endMs = effectiveEndMs({ ...(r as ConflictPhaseRecord) });
      if (endMs !== null && endMs <= fromMs) {
        errs.push(
          `effectiveTo: interval is empty or inverted (END ${r.effectiveTo} resolves at or before effectiveFrom ${r.effectiveFrom})`,
        );
      }
    }
  }

  if (typeof r.declaredAt !== "string" || pointMs(r.declaredAt) === null) {
    errs.push(
      `declaredAt: must be an ISO day or explicit-timezone instant, got ${JSON.stringify(r.declaredAt)}`,
    );
  }
  if (typeof r.policyVersion !== "string" || r.policyVersion.length === 0) {
    errs.push("policyVersion: must be a non-empty string");
  }
  if (typeof r.provenance !== "string" || r.provenance.length === 0) {
    errs.push("provenance: must be a non-empty string");
  }
  return errs;
}

/** Whole-set validation: every record valid, no duplicate (conflictId,
 *  phaseId), and no overlapping intervals within one conflict. [] = valid. */
export function validatePhaseRecords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ["phase records: not an array"];
  const errs: string[] = [];
  const valid: ConflictPhaseRecord[] = [];
  raw.forEach((record, i) => {
    const recordErrs = validatePhaseRecord(record);
    if (recordErrs.length > 0) {
      errs.push(...recordErrs.map((e) => `record[${i}]: ${e}`));
    } else {
      valid.push(record as ConflictPhaseRecord);
    }
  });

  const seen = new Set<string>();
  for (const record of valid) {
    // space separator: PHASE_ID_RE forbids whitespace (and conflict ids carry
    // none), so the key cannot collide across (conflictId, phaseId) pairs
    const key = `${record.conflictId} ${record.phaseId}`;
    if (seen.has(key)) {
      errs.push(`duplicate phase id ${record.phaseId} for conflict ${record.conflictId}`);
    }
    seen.add(key);
  }

  // pairwise overlap within each conflict (order-independent; half-open)
  const byConflict = new Map<ConflictId, ConflictPhaseRecord[]>();
  for (const record of valid) {
    const list = byConflict.get(record.conflictId) ?? [];
    list.push(record);
    byConflict.set(record.conflictId, list);
  }
  for (const [conflictId, records] of byConflict) {
    const sorted = [...records].sort((a, b) => pointMs(a.effectiveFrom)! - pointMs(b.effectiveFrom)!);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (pointMs(next.effectiveFrom)! < effectiveEndMsOrInfinity(prev)) {
        errs.push(
          `conflict ${conflictId}: phases ${prev.phaseId} and ${next.phaseId} overlap ` +
            `(${next.phaseId} starts before ${prev.phaseId} ends)`,
        );
      }
    }
  }
  return errs;
}

/** Parse + validate one record from unknown input. Throws typed. */
export function parseConflictPhaseRecord(raw: unknown): ConflictPhaseRecord {
  const issues = validatePhaseRecord(raw);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_phase_record", "invalid phase record", issues);
  }
  const r = raw as Record<string, unknown>;
  // canonical projection (extra keys dropped), frozen — records are immutable
  return deepFreeze({
    conflictId: r.conflictId as ConflictId,
    phaseId: r.phaseId as string,
    effectiveFrom: r.effectiveFrom as string,
    effectiveTo: r.effectiveTo as string | null,
    declaredAt: r.declaredAt as string,
    policyVersion: r.policyVersion as string,
    provenance: r.provenance as string,
  });
}

/** Parse + validate a record SET (cross-record rules included). Throws typed.
 *  The returned array and every record in it are frozen. */
export function parseConflictPhaseRecords(raw: unknown): readonly ConflictPhaseRecord[] {
  const issues = validatePhaseRecords(raw);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_phase_set", "invalid phase record set", issues);
  }
  return deepFreeze((raw as unknown[]).map((r) => parseConflictPhaseRecord(r)));
}

// ---------------------------------------------------------------------------
// Retrospective flagging and resolution
// ---------------------------------------------------------------------------

/** True when the record was declared AT or AFTER its own end — the phase was
 *  already over, so the label is a retrospective annotation (contract §4),
 *  never as-published policy. Open-ended records are never retrospective.
 *  Throws typed on an invalid record. */
export function isRetrospectivePhaseRecord(record: ConflictPhaseRecord): boolean {
  const issues = validatePhaseRecord(record);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_phase_record", "invalid phase record", issues);
  }
  const endMs = effectiveEndMs(record);
  if (endMs === null) return false;
  return pointMs(record.declaredAt)! >= endMs;
}

export type PhaseResolution =
  | { kind: "phase"; record: ConflictPhaseRecord; retrospective: boolean }
  | { kind: "no_phase" };

/** Resolve the phase in effect for `conflictId` at `point` (ISO day — read as
 *  its 00:00:00Z start — or explicit-timezone instant). PURE: no clocks, no
 *  state. Fails closed: an unknown conflict id, malformed point, or invalid
 *  record set throws typed rather than resolving over garbage. The
 *  no-record-in-effect case is an EXPLICIT outcome, never undefined. */
export function phaseAt(
  records: readonly ConflictPhaseRecord[],
  conflictId: string,
  point: string,
): PhaseResolution {
  if (!isConflictId(conflictId)) {
    throw new ConflictDomainError("unknown_conflict", `unknown conflict id: ${JSON.stringify(conflictId)}`);
  }
  const t = pointMs(point);
  if (t === null) {
    throw new ConflictDomainError(
      "invalid_instant",
      `phaseAt point must be an ISO day or explicit-timezone instant, got ${JSON.stringify(point)}`,
    );
  }
  const issues = validatePhaseRecords(records as unknown[]);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_phase_set", "invalid phase record set", issues);
  }
  for (const record of records) {
    if (record.conflictId !== conflictId) continue;
    const fromMs = pointMs(record.effectiveFrom)!;
    if (t >= fromMs && t < effectiveEndMsOrInfinity(record)) {
      return { kind: "phase", record, retrospective: isRetrospectivePhaseRecord(record) };
    }
  }
  return { kind: "no_phase" };
}
