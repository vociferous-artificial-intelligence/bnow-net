import { describe, expect, it } from "vitest";
import { classifyTakeawayTheater } from "../validation/gazetteer";
import type { EditionUnitSignature } from "./editions";
import { UNATTRIBUTED, attributionFor, unitAttributionMap } from "./unit-attribution";

function sig(over: Partial<EditionUnitSignature> = {}): EditionUnitSignature {
  return { ordinal: 0, sha256: "a".repeat(64), toponyms: [], actions: [], chars: 100, ...over };
}

describe("attributionFor", () => {
  it("agrees with the RU/UA classifier on ROCA — it IS the versioned form of it", () => {
    for (const toponyms of [["kupiansk"], ["belgorod"], ["kupiansk", "belgorod"], ["crimea"]]) {
      expect(attributionFor("roca", toponyms)).toBe(classifyTakeawayTheater([...toponyms]));
    }
  });

  it("uses the Iran vocabulary for the Iran series, which the RU/UA one cannot express", () => {
    // classifyTakeawayTheater returns only ru|ua|both, so an Iran attribution is
    // unreachable through it (gazetteer/ru-ua-v1.ts:109)
    const iran = attributionFor("iran_update", ["tehran"]);
    expect(["ru", "ua"]).not.toContain(iran);
    expect(iran.length).toBeGreaterThan(0);
  });

  it("says `unattributed` — not `both` — when there is no toponym to read", () => {
    // `both` means "recognised toponyms spanning more than one contributor".
    // Reporting it for an empty signature would record "spans everything" for
    // what is really "nothing was recognised".
    expect(attributionFor("roca", [])).toBe(UNATTRIBUTED);
    expect(attributionFor("iran_update", [])).toBe(UNATTRIBUTED);
  });

  it("fails closed on an unknown series key rather than inventing a vocabulary", () => {
    expect(() => attributionFor("not_a_series", ["tehran"])).toThrow();
  });
});

describe("unitAttributionMap", () => {
  const units = [
    { unitId: "u0", ordinal: 0, sha256: "0".repeat(64) },
    { unitId: "u1", ordinal: 1, sha256: "1".repeat(64) },
  ];

  it("joins by sha256 FIRST, even when the ordinals disagree", () => {
    // the hash is the stable identity across runs; an edition re-published with
    // its bullets reordered must not hand u0 the other unit's signature
    const signatures = [
      sig({ ordinal: 7, sha256: "1".repeat(64), toponyms: ["belgorod"] }),
      sig({ ordinal: 9, sha256: "0".repeat(64), toponyms: ["kupiansk"] }),
    ];
    expect(unitAttributionMap("roca", units, signatures)).toEqual({
      u0: classifyTakeawayTheater(["kupiansk"]),
      u1: classifyTakeawayTheater(["belgorod"]),
    });
  });

  it("falls back to the ordinal when the text moved under the hash", () => {
    const signatures = [sig({ ordinal: 1, sha256: "f".repeat(64), toponyms: ["belgorod"] })];
    const out = unitAttributionMap("roca", units, signatures);
    expect(out.u1).toBe(classifyTakeawayTheater(["belgorod"]));
    expect(out.u0).toBe(UNATTRIBUTED);
  });

  it("records every unit — an unmatched one is `unattributed`, never omitted", () => {
    const out = unitAttributionMap("roca", units, []);
    expect(Object.keys(out).sort()).toEqual(["u0", "u1"]);
    expect(new Set(Object.values(out))).toEqual(new Set([UNATTRIBUTED]));
  });

  it("today's Iran editions attribute as `unattributed`, and that is the honest value", () => {
    // WS3-F05: until lane C's fix lands, derived.units[].toponyms for an Iran
    // edition are computed under the RU/UA gazetteer, so they arrive EMPTY.
    // The map says so rather than reporting `both` for every unit.
    const emptyIranSignatures = [sig({ ordinal: 0, sha256: "0".repeat(64), toponyms: [] })];
    const out = unitAttributionMap("iran_update", units, emptyIranSignatures);
    expect(out.u0).toBe(UNATTRIBUTED);
  });
});
