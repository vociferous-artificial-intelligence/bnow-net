import { describe, expect, it } from "vitest";
import { UNIT_FLAGS_VERSION, deriveUnitFlags } from "./unit-flags";

describe("deriveUnitFlags (memo C13, unit-flags-v0)", () => {
  it("stamps a version so a shipped derivation stays reconstructible", () => {
    expect(UNIT_FLAGS_VERSION).toBe("unit-flags-v0");
  });

  it("leaves `compound` UNDETERMINED — hard false, never guessed", () => {
    // C13's binding condition lives on this literal: `false` is the OVER-CREDIT
    // direction (compound downgrades a full match to partial), so it is
    // accepted only because every observation stamps the version and no number
    // produced under v0 may leave the internal view.
    const obviouslyCompound =
      "Russian forces advanced near Kupiansk and Ukrainian forces struck a depot in Crimea.";
    expect(deriveUnitFlags(obviouslyCompound).compound).toBe(false);
    expect(deriveUnitFlags("A single atomic assertion.").compound).toBe(false);
  });

  it("fires `negative` only on explicit absence/denial phrasing", () => {
    const negatives = [
      "Russian forces did not advance in the Kupiansk direction.",
      "There were no confirmed changes to the front line.",
      "No significant activity was reported in the south.",
      "The ministry denied reports of a strike.",
      "No new advances were confirmed near Siversk.",
    ];
    for (const text of negatives) {
      expect(deriveUnitFlags(text).negative, text).toBe(true);
    }
  });

  it("does NOT fire on ordinary reporting — a false positive suppresses a matchable unit", () => {
    const positives = [
      "Russian forces advanced near Kupiansk.",
      "Ukrainian forces struck a fuel depot in occupied Crimea.",
      "Iranian officials discussed enrichment work at Isfahan.",
      // "no" inside another word must not trip the patterns
      "Northern units repositioned overnight.",
      "Nothing in this sentence is an absence claim about advances.",
    ];
    for (const text of positives) {
      expect(deriveUnitFlags(text).negative, text).toBe(false);
    }
  });

  it("is total and deterministic — the soak's variance instrument depends on it", () => {
    for (const text of ["", "   ", "…", "NO CONFIRMED ADVANCES"]) {
      const a = deriveUnitFlags(text);
      const b = deriveUnitFlags(text);
      expect(a).toEqual(b);
      expect(typeof a.compound).toBe("boolean");
      expect(typeof a.negative).toBe("boolean");
    }
  });
});
