// Gazetteer matching pins (48h step 06) — the two modes and their contracts.

import { describe, expect, it } from "vitest";
import { IRAN_LEVANT_V1 } from "./iran-levant-v1";
import {
  MATCH_THRESHOLD,
  classifyTheaterWith,
  expandToponymsWith,
  extractSignatureWith,
  matchScore,
} from "./match";
import { RU_UA_V1 } from "./ru-ua-v1";
import type { Gazetteer } from "./types";

const topo = (gaz: Gazetteer, text: string) => [...extractSignatureWith(gaz, text).toponyms];
const acts = (gaz: Gazetteer, text: string) => [...extractSignatureWith(gaz, text).actions];

describe("substring mode is exactly the historical includes() behaviour", () => {
  it("matches inside words, quirks included", () => {
    // the quirks are the point: substring mode is kept for RU/UA precisely so
    // nothing in production moves, warts and all
    expect(acts(RU_UA_V1, "The architecture was reinforced")).toContain("strike"); // "hit" inside "architecture"
    expect(topo(RU_UA_V1, "fighting near Lymanske")).toContain("lyman");
    expect(topo(RU_UA_V1, "the Sumykhimprom plant")).toContain("sumy");
  });
});

describe("word mode anchors variants and fixes the short-toponym collisions", () => {
  const cases: [string, string, boolean][] = [
    ["aden", "Fighting was reported in Aden.", true],
    ["aden", "A bin Laden-era compound was searched.", false],
    ["aden", "Konrad Adenauer wrote about it.", false],
    ["aden", "A gardener was interviewed.", false],
    ["arak", "The Arak reactor was discussed.", true],
    ["arak", "Karak saw protests.", false],
    ["qom", "A seminary in Qom issued a statement.", true],
    ["qom", "The Qomi dialect differs.", false],
    ["tyre", "Shelling was reported near Tyre.", true],
    ["tyre", "The tyres were replaced.", false],
    ["homs", "Strikes near Homs continued.", true],
    ["homs", "A Homsi family relocated.", false],
    ["gaza", "Operations in Gaza continued.", true],
    ["gaza", "Gazans queued for aid.", false],
    ["oman", "Talks were hosted by Oman.", true],
    ["oman", "A Romanian delegation arrived.", false],
    ["hama", "Fighting near Hama was reported.", true],
    ["hama", "Hamas issued a statement.", false],
  ];

  for (const [canon, text, expected] of cases) {
    it(`${expected ? "matches" : "does NOT match"} ${canon} in ${JSON.stringify(text)}`, () => {
      expect(topo(IRAN_LEVANT_V1, text).includes(canon)).toBe(expected);
    });
  }

  it("the same strings under substring mode WOULD false-positive (this is why the mode exists)", () => {
    const asSubstring: Gazetteer = { ...IRAN_LEVANT_V1, matchMode: "substring" };
    expect(topo(asSubstring, "A bin Laden-era compound was searched.")).toContain("aden");
    expect(topo(asSubstring, "Karak saw protests.")).toContain("arak");
    expect(topo(asSubstring, "Gazans queued for aid.")).toContain("gaza");
    expect(topo(asSubstring, "A Romanian delegation arrived.")).toContain("oman");
  });

  it("a trailing * is a stem match, and only on the right", () => {
    expect(acts(IRAN_LEVANT_V1, "an enrichment hall")).toContain("nuclear"); // enrich*
    expect(acts(IRAN_LEVANT_V1, "uranium was enriched")).toContain("nuclear");
    expect(acts(IRAN_LEVANT_V1, "forces advanced")).toContain("advance"); // advanc*
    expect(acts(IRAN_LEVANT_V1, "an advancing column")).toContain("advance");
    // left anchor survives the stem: "reenrichment" is not "enrich"
    expect(acts(IRAN_LEVANT_V1, "the deenrichment debate")).not.toContain("nuclear");
  });

  it("stems are chosen not to over-reach", () => {
    expect(acts(IRAN_LEVANT_V1, "the executive board met")).not.toContain("domestic");
    expect(acts(IRAN_LEVANT_V1, "an execution was reported")).toContain("domestic");
    expect(acts(IRAN_LEVANT_V1, "patriotic songs were played")).not.toContain("air_defense");
    expect(acts(IRAN_LEVANT_V1, "a Patriot battery deployed")).toContain("air_defense");
  });

  it("multi-word and hyphenated variants anchor at both ends", () => {
    expect(topo(IRAN_LEVANT_V1, "traffic through the Strait of Hormuz")).toContain("hormuz");
    expect(topo(IRAN_LEVANT_V1, "a drone hit Ain al-Asad")).toContain("ain_al_asad");
    expect(topo(IRAN_LEVANT_V1, "shipping near Bab el-Mandeb")).toContain("bab_el_mandeb");
  });
});

describe("expandToponymsWith", () => {
  it("adds members and never drops the input", () => {
    expect([...expandToponymsWith(IRAN_LEVANT_V1, new Set(["gaza"]))]).toEqual([
      "gaza", "rafah", "khan_younis",
    ]);
    expect([...expandToponymsWith(IRAN_LEVANT_V1, new Set(["tehran"]))]).toEqual(["tehran"]);
    expect([...expandToponymsWith(IRAN_LEVANT_V1, new Set())]).toEqual([]);
  });
});

describe("classifyTheaterWith", () => {
  it("resolves a single tag, collapses disagreement, and ignores unknowns", () => {
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["tehran", "natanz"])).toBe("ir");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["tehran", "haifa"])).toBe("both");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["hormuz"])).toBe("both");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["tehran", "hormuz"])).toBe("both");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, [])).toBe("both");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["not_a_place"])).toBe("both");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["not_a_place", "doha"])).toBe("qa");
  });
});

describe("matchScore is gazetteer-free and unchanged", () => {
  it("scores toponym overlap above the threshold and action-only below it", () => {
    const a = extractSignatureWith(IRAN_LEVANT_V1, "Israeli aircraft struck a site near Natanz");
    const b = extractSignatureWith(IRAN_LEVANT_V1, "An airstrike was reported at Natanz");
    expect(matchScore(a, b)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);

    const c = extractSignatureWith(IRAN_LEVANT_V1, "A drone strike near Baghdad");
    const d = extractSignatureWith(IRAN_LEVANT_V1, "A missile strike near Tabriz");
    expect(matchScore(c, d)).toBeLessThan(MATCH_THRESHOLD); // action only

    const e = extractSignatureWith(IRAN_LEVANT_V1, "nothing here at all");
    expect(matchScore(e, e)).toBe(0);
  });
});

describe("compilation fails closed rather than matching everything", () => {
  it("refuses an empty variant — `new RegExp(\"aden|\")` would tag every text", () => {
    const bad: Gazetteer = {
      ...IRAN_LEVANT_V1,
      toponyms: { ...IRAN_LEVANT_V1.toponyms, broken: ["aden", ""] },
    };
    expect(() => extractSignatureWith(bad, "completely unrelated text")).toThrow(
      /declares an empty variant/,
    );
  });

  it("refuses a canonical with no variants at all", () => {
    const bad: Gazetteer = {
      ...IRAN_LEVANT_V1,
      actions: { ...IRAN_LEVANT_V1.actions, broken: [] },
    };
    expect(() => extractSignatureWith(bad, "anything")).toThrow(/declares no variants/);
  });

  it("classifyTheaterWith ignores inherited Object keys instead of treating them as tags", () => {
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["toString", "__proto__", "doha"])).toBe("qa");
    expect(classifyTheaterWith(IRAN_LEVANT_V1, ["constructor"])).toBe("both");
  });
});
