import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  isRetrospectivePhaseRecord,
  parseConflictPhaseRecord,
  parseConflictPhaseRecords,
  phaseAt,
  validatePhaseRecord,
  validatePhaseRecords,
  type ConflictPhaseRecord,
} from "./phases";

// Synthetic phase records — invented ids and dates, no real editorial claim.
const ESCALATION: ConflictPhaseRecord = {
  conflictId: "iran_regional",
  phaseId: "escalation-a",
  effectiveFrom: "2026-06-01",
  effectiveTo: "2026-06-30",
  declaredAt: "2026-05-30T12:00:00Z",
  policyVersion: "iran-phase-policy-v1",
  provenance: "declared prospectively in fixture narrative",
};

const CONSOLIDATION: ConflictPhaseRecord = {
  conflictId: "iran_regional",
  phaseId: "consolidation-b",
  effectiveFrom: "2026-07-01",
  effectiveTo: null,
  declaredAt: "2026-06-28T09:00:00Z",
  policyVersion: "iran-phase-policy-v1",
  provenance: "declared prospectively in fixture narrative",
};

const RU_PHASE: ConflictPhaseRecord = {
  conflictId: "russia_ukraine",
  phaseId: "attrition-1",
  effectiveFrom: "2026-06-10T06:00:00Z",
  effectiveTo: "2026-06-20T06:00:00Z",
  declaredAt: "2026-06-09T00:00:00Z",
  policyVersion: "ru-phase-policy-v1",
  provenance: "declared prospectively in fixture narrative",
};

describe("validatePhaseRecord — valid shapes", () => {
  it("accepts a prospective day-granular record", () => {
    expect(validatePhaseRecord(ESCALATION)).toEqual([]);
  });

  it("accepts an open-ended record (effectiveTo null)", () => {
    expect(validatePhaseRecord(CONSOLIDATION)).toEqual([]);
  });

  it("accepts instant-granular boundaries", () => {
    expect(validatePhaseRecord(RU_PHASE)).toEqual([]);
  });

  it("accepts a ONE-DAY phase at day granularity (from = to, day-inclusive END)", () => {
    expect(
      validatePhaseRecord({ ...ESCALATION, effectiveFrom: "2026-06-05", effectiveTo: "2026-06-05" }),
    ).toEqual([]);
  });

  it("a RETROSPECTIVE declaration is VALID (flagged, not rejected)", () => {
    expect(
      validatePhaseRecord({ ...ESCALATION, declaredAt: "2026-08-01T00:00:00Z" }),
    ).toEqual([]);
  });
});

describe("validatePhaseRecord — impossible combinations", () => {
  it("rejects a non-object", () => {
    expect(validatePhaseRecord(null)).toHaveLength(1);
    expect(validatePhaseRecord("escalation-a")).toHaveLength(1);
    expect(validatePhaseRecord([ESCALATION])).toHaveLength(1);
  });

  it("rejects an unknown conflictId (theater codes included — never conflated)", () => {
    for (const bad of ["ir", "russia-ukraine", "gulf", "", undefined]) {
      const errs = validatePhaseRecord({ ...ESCALATION, conflictId: bad });
      expect(errs.some((e) => e.startsWith("conflictId:"))).toBe(true);
    }
  });

  it("rejects empty and unstable phaseIds", () => {
    for (const bad of ["", "Phase One", "ESCALATION", "esc/1", " escalation", "-lead", undefined, 7]) {
      const errs = validatePhaseRecord({ ...ESCALATION, phaseId: bad });
      expect(errs.some((e) => e.startsWith("phaseId:"))).toBe(true);
    }
  });

  it("rejects effectiveTo strictly before effectiveFrom", () => {
    const errs = validatePhaseRecord({
      ...ESCALATION,
      effectiveFrom: "2026-06-10",
      effectiveTo: "2026-06-01",
    });
    expect(errs.some((e) => e.includes("empty or inverted"))).toBe(true);
  });

  it("rejects an EMPTY instant-granular interval (from = to exclusive END)", () => {
    const errs = validatePhaseRecord({
      ...RU_PHASE,
      effectiveFrom: "2026-06-10T06:00:00Z",
      effectiveTo: "2026-06-10T06:00:00Z",
    });
    expect(errs.some((e) => e.includes("empty or inverted"))).toBe(true);
  });

  it("rejects malformed or timezone-less boundary values", () => {
    for (const field of ["effectiveFrom", "declaredAt"] as const) {
      for (const bad of ["2026-06-01T00:00:00", "June 1", "", 20260601, null]) {
        const errs = validatePhaseRecord({ ...ESCALATION, [field]: bad });
        expect(errs.some((e) => e.startsWith(`${field}:`))).toBe(true);
      }
    }
    const errs = validatePhaseRecord({ ...ESCALATION, effectiveTo: "2026-06-30T23:59:59" });
    expect(errs.some((e) => e.startsWith("effectiveTo:"))).toBe(true);
  });

  it("rejects empty policyVersion and provenance", () => {
    expect(
      validatePhaseRecord({ ...ESCALATION, policyVersion: "" }).some((e) =>
        e.startsWith("policyVersion:"),
      ),
    ).toBe(true);
    expect(
      validatePhaseRecord({ ...ESCALATION, provenance: "" }).some((e) =>
        e.startsWith("provenance:"),
      ),
    ).toBe(true);
  });
});

describe("validatePhaseRecords — cross-record rules", () => {
  it("accepts adjacent phases (half-open: one ends exactly where the next begins)", () => {
    expect(validatePhaseRecords([ESCALATION, CONSOLIDATION, RU_PHASE])).toEqual([]);
  });

  it("accepts instant-adjacency too", () => {
    const next: ConflictPhaseRecord = {
      ...RU_PHASE,
      phaseId: "attrition-2",
      effectiveFrom: "2026-06-20T06:00:00Z",
      effectiveTo: null,
    };
    expect(validatePhaseRecords([RU_PHASE, next])).toEqual([]);
  });

  it("rejects overlapping records for the SAME conflict", () => {
    const overlapping: ConflictPhaseRecord = {
      ...ESCALATION,
      phaseId: "escalation-overlap",
      effectiveFrom: "2026-06-15",
      effectiveTo: "2026-07-15",
    };
    const errs = validatePhaseRecords([ESCALATION, overlapping]);
    expect(errs.some((e) => e.includes("overlap"))).toBe(true);
  });

  it("day-INCLUSIVE effectiveTo overlaps a same-day-starting successor", () => {
    // ESCALATION covers ALL of 2026-06-30, so a phase starting 2026-06-30 overlaps
    const sameDayStart: ConflictPhaseRecord = {
      ...CONSOLIDATION,
      phaseId: "too-early",
      effectiveFrom: "2026-06-30",
    };
    const errs = validatePhaseRecords([ESCALATION, sameDayStart]);
    expect(errs.some((e) => e.includes("overlap"))).toBe(true);
  });

  it("an open-ended record overlaps EVERY later record of the same conflict", () => {
    const later: ConflictPhaseRecord = {
      ...CONSOLIDATION,
      phaseId: "after-open-ended",
      effectiveFrom: "2027-01-01",
      effectiveTo: "2027-02-01",
    };
    const errs = validatePhaseRecords([CONSOLIDATION, later]);
    expect(errs.some((e) => e.includes("overlap"))).toBe(true);
  });

  it("identical intervals in DIFFERENT conflicts never conflict", () => {
    const mirrored: ConflictPhaseRecord = {
      ...ESCALATION,
      conflictId: "russia_ukraine",
      phaseId: "escalation-a",
    };
    expect(validatePhaseRecords([ESCALATION, mirrored])).toEqual([]);
  });

  it("rejects a duplicate (conflictId, phaseId) even without overlap", () => {
    const dup: ConflictPhaseRecord = {
      ...ESCALATION,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-10",
    };
    const errs = validatePhaseRecords([ESCALATION, dup]);
    expect(errs.some((e) => e.includes("duplicate phase id"))).toBe(true);
  });

  it("prefixes per-record issues with the record index", () => {
    const errs = validatePhaseRecords([ESCALATION, { ...ESCALATION, phaseId: "" }]);
    expect(errs.some((e) => e.startsWith("record[1]:"))).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(validatePhaseRecords(ESCALATION)).toEqual(["phase records: not an array"]);
  });
});

describe("parse round-trip helpers", () => {
  it("parseConflictPhaseRecord returns a canonical record and drops extra keys", () => {
    const parsed = parseConflictPhaseRecord({ ...ESCALATION, smuggled: true });
    expect(parsed).toEqual(ESCALATION);
    expect("smuggled" in parsed).toBe(false);
  });

  it("parseConflictPhaseRecord throws typed on invalid input", () => {
    try {
      parseConflictPhaseRecord({ ...ESCALATION, conflictId: "ir" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_phase_record");
    }
  });

  it("parseConflictPhaseRecords enforces cross-record rules", () => {
    expect(parseConflictPhaseRecords([ESCALATION, CONSOLIDATION])).toEqual([
      ESCALATION,
      CONSOLIDATION,
    ]);
    try {
      parseConflictPhaseRecords([ESCALATION, { ...ESCALATION, effectiveFrom: "2026-06-02" }]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_phase_set");
    }
  });
});

describe("isRetrospectivePhaseRecord (contract §4 retrospective annotations)", () => {
  it("prospective declarations are not retrospective", () => {
    expect(isRetrospectivePhaseRecord(ESCALATION)).toBe(false);
    expect(isRetrospectivePhaseRecord(RU_PHASE)).toBe(false);
  });

  it("declaredAt after the phase ended IS retrospective (valid but flagged)", () => {
    expect(
      isRetrospectivePhaseRecord({ ...ESCALATION, declaredAt: "2026-08-01T00:00:00Z" }),
    ).toBe(true);
  });

  it("a mid-phase declaration is NOT retrospective", () => {
    expect(
      isRetrospectivePhaseRecord({ ...ESCALATION, declaredAt: "2026-06-15T12:00:00Z" }),
    ).toBe(false);
  });

  it("boundary: declaredAt exactly at the normalized END is retrospective (the phase is already over)", () => {
    // day-granular effectiveTo 2026-06-30 → END = 2026-07-01T00:00:00Z exclusive
    expect(
      isRetrospectivePhaseRecord({ ...ESCALATION, declaredAt: "2026-07-01T00:00:00Z" }),
    ).toBe(true);
    // one ms earlier is still inside the phase
    expect(
      isRetrospectivePhaseRecord({ ...ESCALATION, declaredAt: "2026-06-30T23:59:59.999Z" }),
    ).toBe(false);
    // instant-granular END behaves the same
    expect(
      isRetrospectivePhaseRecord({ ...RU_PHASE, declaredAt: "2026-06-20T06:00:00Z" }),
    ).toBe(true);
  });

  it("an open-ended record is never retrospective", () => {
    expect(
      isRetrospectivePhaseRecord({ ...CONSOLIDATION, declaredAt: "2030-01-01T00:00:00Z" }),
    ).toBe(false);
  });

  it("throws typed on an invalid record", () => {
    expect(() =>
      isRetrospectivePhaseRecord({ ...ESCALATION, phaseId: "" } as ConflictPhaseRecord),
    ).toThrowError(ConflictDomainError);
  });
});

describe("phaseAt — pure resolution, no mutable current phase", () => {
  const RECORDS = [ESCALATION, CONSOLIDATION, RU_PHASE];

  it("resolves a mid-phase instant", () => {
    const r = phaseAt(RECORDS, "iran_regional", "2026-06-15T10:00:00Z");
    expect(r).toEqual({ kind: "phase", record: ESCALATION, retrospective: false });
  });

  it("resolves a day point (read as its 00:00Z start)", () => {
    const r = phaseAt(RECORDS, "iran_regional", "2026-06-15");
    expect(r.kind).toBe("phase");
  });

  it("effectiveFrom is INCLUSIVE", () => {
    const r = phaseAt(RECORDS, "iran_regional", "2026-06-01T00:00:00Z");
    expect(r.kind === "phase" && r.record.phaseId).toBe("escalation-a");
  });

  it("day-granular effectiveTo covers its WHOLE day; the next 00:00Z belongs to the successor", () => {
    const lastMoment = phaseAt(RECORDS, "iran_regional", "2026-06-30T23:59:59.999Z");
    expect(lastMoment.kind === "phase" && lastMoment.record.phaseId).toBe("escalation-a");
    const boundary = phaseAt(RECORDS, "iran_regional", "2026-07-01T00:00:00Z");
    expect(boundary.kind === "phase" && boundary.record.phaseId).toBe("consolidation-b");
  });

  it("instant-granular END is exclusive: the exact end instant is OUT of the phase", () => {
    const inside = phaseAt(RECORDS, "russia_ukraine", "2026-06-20T05:59:59.999Z");
    expect(inside.kind === "phase" && inside.record.phaseId).toBe("attrition-1");
    expect(phaseAt(RECORDS, "russia_ukraine", "2026-06-20T06:00:00Z")).toEqual({
      kind: "no_phase",
    });
  });

  it("an open-ended phase covers arbitrarily late instants", () => {
    const r = phaseAt(RECORDS, "iran_regional", "2030-12-31T23:59:59Z");
    expect(r.kind === "phase" && r.record.phaseId).toBe("consolidation-b");
  });

  it("no record in effect → the EXPLICIT no_phase outcome (before any phase / in a gap / empty set)", () => {
    expect(phaseAt(RECORDS, "iran_regional", "2026-05-01T00:00:00Z")).toEqual({
      kind: "no_phase",
    });
    expect(phaseAt(RECORDS, "russia_ukraine", "2026-06-01T00:00:00Z")).toEqual({
      kind: "no_phase",
    });
    expect(phaseAt([], "iran_regional", "2026-06-15T00:00:00Z")).toEqual({ kind: "no_phase" });
  });

  it("gap between phases resolves to no_phase, not the nearest neighbor", () => {
    const gapped = [
      ESCALATION,
      { ...CONSOLIDATION, effectiveFrom: "2026-07-10" },
    ];
    expect(phaseAt(gapped, "iran_regional", "2026-07-05T00:00:00Z")).toEqual({
      kind: "no_phase",
    });
  });

  it("flags a retrospective record in its resolution", () => {
    const retro = { ...ESCALATION, declaredAt: "2026-09-01T00:00:00Z" };
    const r = phaseAt([retro], "iran_regional", "2026-06-15T00:00:00Z");
    expect(r.kind === "phase" && r.retrospective).toBe(true);
  });

  it("throws typed on an unknown conflict id", () => {
    expect(() => phaseAt(RECORDS, "ir", "2026-06-15T00:00:00Z")).toThrowError(ConflictDomainError);
    try {
      phaseAt(RECORDS, "ir", "2026-06-15T00:00:00Z");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("unknown_conflict");
    }
  });

  it("throws typed on a malformed or timezone-less point", () => {
    for (const bad of ["2026-06-15T10:00:00", "yesterday", ""]) {
      expect(() => phaseAt(RECORDS, "iran_regional", bad)).toThrowError(ConflictDomainError);
    }
    try {
      phaseAt(RECORDS, "iran_regional", "yesterday");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_instant");
    }
  });

  it("fails closed on an invalid record SET rather than resolving over garbage", () => {
    const overlapping = [ESCALATION, { ...ESCALATION, phaseId: "escalation-dup", effectiveFrom: "2026-06-15" }];
    expect(() => phaseAt(overlapping, "iran_regional", "2026-06-16T00:00:00Z")).toThrowError(
      ConflictDomainError,
    );
    try {
      phaseAt(overlapping, "iran_regional", "2026-06-16T00:00:00Z");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_phase_set");
    }
  });

  it("even an invalid record for ANOTHER conflict fails the resolution (corrupt input is corrupt input)", () => {
    const withBadOther = [ESCALATION, { ...RU_PHASE, phaseId: "" }];
    expect(() =>
      phaseAt(withBadOther as ConflictPhaseRecord[], "iran_regional", "2026-06-15T00:00:00Z"),
    ).toThrowError(ConflictDomainError);
  });
});
