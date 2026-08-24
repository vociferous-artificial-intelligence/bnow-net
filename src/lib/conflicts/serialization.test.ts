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

  it("handles primitives and escapes strings", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(3)).toBe("3");
    expect(stableStringify('say "hi"')).toBe(JSON.stringify('say "hi"'));
  });

  it("shared ACYCLIC references (a DAG) are fine", () => {
    const shared = { x: 1 };
    expect(stableStringify({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
});

describe("stableStringify — fail-closed rejections (typed, never coerced or dropped)", () => {
  const expectUnserializable = (value: unknown) => {
    expect(() => stableStringify(value)).toThrowError(ConflictDomainError);
    try {
      stableStringify(value);
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("unserializable_value");
    }
  };

  it("rejects undefined property values (omit the key instead)", () => {
    expectUnserializable({ a: 1, gone: undefined });
  });

  it("rejects undefined array slots and holes", () => {
    expectUnserializable([1, undefined, 2]);
    const holey = [1, 2];
    delete (holey as unknown[])[1]; // a hole reads as undefined
    expectUnserializable(holey);
  });

  it("rejects top-level undefined, functions, symbols, and bigints", () => {
    expectUnserializable(undefined);
    expectUnserializable(() => 1);
    expectUnserializable(Symbol("x"));
    expectUnserializable(BigInt(10));
    expectUnserializable({ fn: () => 1 });
    expectUnserializable({ big: BigInt(10) });
  });

  it("rejects non-finite numbers", () => {
    expectUnserializable(Number.NaN);
    expectUnserializable(Number.POSITIVE_INFINITY);
    expectUnserializable({ a: Number.NEGATIVE_INFINITY });
  });

  it("rejects non-plain objects — Date, Map, Set, RegExp, class instances (toJSON deliberately unsupported)", () => {
    expectUnserializable(new Date(0));
    expectUnserializable(new Map());
    expectUnserializable(new Set([1]));
    expectUnserializable(/x/);
    class Thing {
      a = 1;
    }
    expectUnserializable(new Thing());
    expectUnserializable({ nested: new Date(0) });
  });

  it("accepts null-prototype objects (still plain data)", () => {
    const o = Object.create(null) as Record<string, unknown>;
    o.a = 1;
    expect(stableStringify(o)).toBe('{"a":1}');
  });

  it("rejects symbol-keyed properties", () => {
    expectUnserializable({ [Symbol("hidden")]: 1, a: 2 });
  });

  it("rejects cycles with a typed throw, never a hang", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expectUnserializable(cyclic);
    const arrCycle: unknown[] = [1];
    arrCycle.push(arrCycle);
    expectUnserializable(arrCycle);
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

  it("serializes the CANONICAL projection: an unknown extra key is dropped, output byte-identical (Gate-1 MINOR-2)", () => {
    const withExtra = { ...IDENTITY, annotation: "scratch note" };
    expect(serializeReferenceReportIdentity(withExtra)).toBe(
      serializeReferenceReportIdentity(IDENTITY),
    );
    expect(serializeReferenceReportIdentity(withExtra)).not.toContain("annotation");
  });

  it("parse output is frozen (a parsed identity is a value, not a scratch buffer)", () => {
    const parsed = parseReferenceReportIdentity({ ...IDENTITY });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() => {
      (parsed as { scopeVersion: string }).scopeVersion = "tampered";
    }).toThrow();
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

  it("serializes the CANONICAL projection: per-record unknown keys dropped, output byte-identical (Gate-1 MINOR-2)", () => {
    const withExtra = [{ ...PHASES[0], scratch: 1 }, PHASES[1]];
    expect(serializeConflictPhaseRecords(withExtra)).toBe(serializeConflictPhaseRecords(PHASES));
    expect(serializeConflictPhaseRecords(withExtra)).not.toContain("scratch");
  });

  it("parse outputs are frozen — array and records", () => {
    const parsed = parseConflictPhaseRecords(PHASES.map((p) => ({ ...p })));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed[0])).toBe(true);
    expect(() => {
      (parsed[0] as { phaseId: string }).phaseId = "tampered";
    }).toThrow();
    expect(() => {
      (parsed as unknown as unknown[]).push({});
    }).toThrow();
  });
});
