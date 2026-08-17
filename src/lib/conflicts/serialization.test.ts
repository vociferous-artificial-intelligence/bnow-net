import { describe, expect, it } from "vitest";
import { CONFLICT_DEFINITIONS, CONFLICT_REGISTRY } from "./definitions";
import { ConflictDomainError } from "./errors";
import type { ConflictPhaseRecord } from "./phases";
import type { ReferenceReportIdentity } from "./reference-report";
import {
  parseConflictDefinition,
  parseConflictPhaseRecords,
  parseReferenceReportIdentity,
  serializeConflictDefinition,
  serializeConflictPhaseRecords,
  serializeReferenceReportIdentity,
  stableStringify,
  validateConflictDefinition,
} from "./serialization";

const IDENTITY: ReferenceReportIdentity = {
  series: "roca",
  editionKey: "roca:2026-08-01:final",
  reportDate: "2026-08-01",
  cutoffAt: "2026-08-01T19:00:00Z",
  publishedAt: null,
  scopeVersion: "roca-scope-v1",
};

const PHASES: ConflictPhaseRecord[] = [
  {
    conflictId: "russia_ukraine",
    phaseId: "attrition-1",
    effectiveFrom: "2026-06-01",
    effectiveTo: "2026-06-30",
    declaredAt: "2026-05-30T12:00:00Z",
    policyVersion: "ru-phase-policy-v1",
    provenance: "declared prospectively in fixture narrative",
  },
  {
    conflictId: "russia_ukraine",
    phaseId: "attrition-2",
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    declaredAt: "2026-06-29T12:00:00Z",
    policyVersion: "ru-phase-policy-v1",
    provenance: "declared prospectively in fixture narrative",
  },
];

describe("stableStringify", () => {
  it("emits identical bytes regardless of key insertion order", () => {
    const a = { b: 1, a: { d: [1, 2], c: null } };
    const b = { a: { c: null, d: [1, 2] }, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("preserves array order (order is meaningful for lanes/rosters/precedence)", () => {
    expect(stableStringify([2, 1])).toBe("[2,1]");
  });

  it("round-trips through JSON.parse losslessly", () => {
    const value = { z: "text", a: [true, null, 3.5], m: { y: 1, x: 2 } };
    expect(JSON.parse(stableStringify(value))).toEqual(value);
  });

  it("omits undefined object properties like JSON.stringify, and nulls undefined array slots", () => {
    expect(stableStringify({ a: 1, gone: undefined })).toBe('{"a":1}');
    expect(stableStringify([1, undefined, 2])).toBe("[1,null,2]");
  });

  it("handles primitives and escapes strings", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(3)).toBe("3");
    expect(stableStringify('say "hi"')).toBe(JSON.stringify('say "hi"'));
  });
});

describe("conflict definition round-trip", () => {
  it("every registry definition survives serialize → JSON.parse → parse and returns THE canonical instance", () => {
    for (const def of CONFLICT_DEFINITIONS) {
      const revived = parseConflictDefinition(JSON.parse(serializeConflictDefinition(def)));
      expect(revived).toBe(CONFLICT_REGISTRY[def.id]);
    }
  });

  it("serialization is deterministic", () => {
    expect(serializeConflictDefinition(CONFLICT_REGISTRY.iran_regional)).toBe(
      serializeConflictDefinition(CONFLICT_REGISTRY.iran_regional),
    );
  });

  it("rejects a TAMPERED definition — a legacy contributor silently relabeled mapped can never deserialize", () => {
    const tampered = JSON.parse(serializeConflictDefinition(CONFLICT_REGISTRY.iran_regional)) as {
      contributorTheaters: Array<{ theater: string; comparability: string }>;
    };
    const il = tampered.contributorTheaters.find((t) => t.theater === "il");
    il!.comparability = "mapped";
    expect(() => parseConflictDefinition(tampered)).toThrowError(ConflictDomainError);
    try {
      parseConflictDefinition(tampered);
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_conflict_definition");
    }
  });

  it("rejects edited lanes, swapped series, and smuggled extra keys", () => {
    const base = () => JSON.parse(serializeConflictDefinition(CONFLICT_REGISTRY.russia_ukraine));

    const editedLanes = base();
    editedLanes.lanes.pop();
    expect(validateConflictDefinition(editedLanes)).not.toEqual([]);

    const swappedSeries = base();
    swappedSeries.referenceSeries = "iran_update";
    expect(validateConflictDefinition(swappedSeries)).not.toEqual([]);

    const smuggled = base();
    smuggled.extraSurface = "not in the contract";
    expect(validateConflictDefinition(smuggled)).not.toEqual([]);
  });

  it("rejects structural garbage with precise messages", () => {
    expect(validateConflictDefinition(null)).toEqual(["conflict definition: not an object"]);
    expect(validateConflictDefinition({ id: "nope" })).toEqual([
      'id: unknown conflict "nope"',
    ]);
    const errs = validateConflictDefinition({
      id: "russia_ukraine",
      displayName: "",
      referenceSeries: "x",
      laneTaxonomyVersion: "y",
      evidencePolicyVersion: "z",
      lanes: [],
      contributorTheaters: [{ theater: "ru", comparability: "sorta" }, "junk"],
      contributorTracks: [],
    });
    expect(errs.length).toBeGreaterThanOrEqual(6);
  });

  it("rejects duplicate contributor theaters", () => {
    const dup = JSON.parse(serializeConflictDefinition(CONFLICT_REGISTRY.russia_ukraine)) as {
      contributorTheaters: unknown[];
    };
    dup.contributorTheaters.push({ theater: "ru", comparability: "mapped" });
    expect(
      validateConflictDefinition(dup).some((e) => e.includes("duplicate theater")),
    ).toBe(true);
  });
});

describe("reference report identity round-trip", () => {
  it("serialize → JSON.parse → parse is lossless", () => {
    expect(parseReferenceReportIdentity(JSON.parse(serializeReferenceReportIdentity(IDENTITY)))).toEqual(
      IDENTITY,
    );
  });

  it("serialization is stable across key order", () => {
    const reordered = {
      scopeVersion: IDENTITY.scopeVersion,
      publishedAt: IDENTITY.publishedAt,
      cutoffAt: IDENTITY.cutoffAt,
      reportDate: IDENTITY.reportDate,
      editionKey: IDENTITY.editionKey,
      series: IDENTITY.series,
    };
    expect(serializeReferenceReportIdentity(reordered)).toBe(
      serializeReferenceReportIdentity(IDENTITY),
    );
  });

  it("REFUSES to serialize an invalid identity — garbage can not round-trip in either direction", () => {
    expect(() =>
      serializeReferenceReportIdentity({ ...IDENTITY, reportDate: "2026-02-30" }),
    ).toThrowError(ConflictDomainError);
  });

  it("rejects malformed revived input", () => {
    expect(() => parseReferenceReportIdentity(undefined)).toThrowError(ConflictDomainError);
    expect(() =>
      parseReferenceReportIdentity({ ...IDENTITY, cutoffAt: "mid-afternoon" }),
    ).toThrowError(ConflictDomainError);
  });
});

describe("phase record set round-trip", () => {
  it("serialize → JSON.parse → parse is lossless", () => {
    expect(parseConflictPhaseRecords(JSON.parse(serializeConflictPhaseRecords(PHASES)))).toEqual(
      PHASES,
    );
  });

  it("REFUSES to serialize an invalid set (overlap)", () => {
    const overlapping = [PHASES[0], { ...PHASES[1], effectiveFrom: "2026-06-15" }];
    expect(() => serializeConflictPhaseRecords(overlapping)).toThrowError(ConflictDomainError);
  });

  it("rejects malformed revived input with the set-level typed error", () => {
    try {
      parseConflictPhaseRecords([PHASES[0], { ...PHASES[1], conflictId: "ua" }]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_phase_set");
    }
    expect(() => parseConflictPhaseRecords("[]")).toThrowError(ConflictDomainError);
  });

  it("an empty set is valid and round-trips (no phases declared yet is a legitimate state)", () => {
    expect(parseConflictPhaseRecords(JSON.parse(serializeConflictPhaseRecords([])))).toEqual([]);
  });
});
