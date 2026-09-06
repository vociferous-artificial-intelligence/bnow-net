// Gazetteer registry pins (48h step 06).

import { describe, expect, it } from "vitest";
import {
  GAZETTEERS,
  GAZETTEER_KEYS,
  IRAN_LEVANT_V1,
  RU_UA_V1,
  UnknownGazetteerError,
  gazetteerFor,
  tryGazetteerFor,
} from "./index";

describe("gazetteerFor", () => {
  it("resolves reference series, conflict ids and version ids", () => {
    expect(gazetteerFor("roca")).toBe(RU_UA_V1);
    expect(gazetteerFor("russia_ukraine")).toBe(RU_UA_V1);
    expect(gazetteerFor("ru-ua-v1")).toBe(RU_UA_V1);
    expect(gazetteerFor("iran_update")).toBe(IRAN_LEVANT_V1);
    expect(gazetteerFor("iran_regional")).toBe(IRAN_LEVANT_V1);
    expect(gazetteerFor("iran-levant-v1")).toBe(IRAN_LEVANT_V1);
  });

  it("is FAIL-CLOSED on anything else — including theater codes, which are not a gazetteer key, and inherited Object keys", () => {
    for (const key of [
      "", "ir", "ua", "ROCA", "iran", "unknown",
      // a bare index would resolve these against Object.prototype and return a
      // truthy inherited value, walking straight past the fail-closed check
      "toString", "constructor", "__proto__", "hasOwnProperty", "valueOf",
    ]) {
      expect(() => gazetteerFor(key), key).toThrow(UnknownGazetteerError);
      expect(() => gazetteerFor(key), key).toThrow(/unknown gazetteer key/);
      expect(tryGazetteerFor(key), key).toBeNull();
    }
    // the refusal names the accepted keys rather than failing mutely
    expect(() => gazetteerFor("ir")).toThrow(/roca, russia_ukraine/);
  });

  it("every registered gazetteer carries a non-empty, unique version equal to its registry key", () => {
    const versions = Object.entries(GAZETTEERS).map(([key, gaz]) => {
      expect(gaz.version, key).toBe(key);
      expect(gaz.version.length, key).toBeGreaterThan(0);
      return gaz.version;
    });
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("every alias resolves to a registered version", () => {
    for (const [alias, version] of Object.entries(GAZETTEER_KEYS)) {
      expect(Object.keys(GAZETTEERS), alias).toContain(version);
    }
  });

  it("the two gazetteers have DISJOINT canonical toponym ids — a cross-gazetteer comparison can only score 0", () => {
    const ru = new Set(Object.keys(RU_UA_V1.toponyms));
    const overlap = Object.keys(IRAN_LEVANT_V1.toponyms).filter((k) => ru.has(k));
    expect(overlap).toEqual([]);
  });
});
