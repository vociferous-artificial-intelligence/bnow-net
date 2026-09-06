// iran-levant-v1 data pins (48h step 06).
//
// This gazetteer is DATA, so its tests are structural invariants — the ones a
// well-meaning append would break: word-mode's ASCII precondition, the theater
// vocabulary, the expansion graph, ruling-20's no-person-names line, and the
// action terms the seven iran-lanes-v1 lanes depend on.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IRAN_LEVANT_V1 as G } from "./iran-levant-v1";
import { extractSignatureWith } from "./match";

const IRAN_THEATERS = ["ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "both"];
const SOURCE = readFileSync(join(process.cwd(), "src/lib/validation/gazetteer/iran-levant-v1.ts"), "utf8");

describe("iran-levant-v1 shape", () => {
  it("declares its version and the word-boundary match mode", () => {
    expect(G.version).toBe("iran-levant-v1");
    expect(G.matchMode).toBe("word");
  });

  it("carries at least 60 canonical toponyms across all six geography groups", () => {
    expect(Object.keys(G.toponyms).length).toBeGreaterThanOrEqual(60);
    for (const canon of [
      "tehran", "natanz", // Iran interior
      "hormuz", "red_sea", // Gulf and straits
      "baghdad", "ain_al_asad", // Iraq
      "beirut", "damascus", // Levant
      "tel_aviv", "gaza", // Israel/Palestine
      "sanaa", "hodeidah", // Yemen and the Red Sea littoral
    ]) {
      expect(Object.keys(G.toponyms), canon).toContain(canon);
    }
  });

  it("groups are sourced by geography in comments, not from any report text", () => {
    for (const heading of [
      "Iran interior", "Gulf, straits", "Gulf states", "Iraq", "Syria", "Lebanon",
      "Israel and the Palestinian territories", "Yemen",
    ]) {
      expect(SOURCE, heading).toContain(heading);
    }
  });
});

describe("iran-levant-v1 invariants", () => {
  it("every variant is lowercase ASCII — the precondition that makes word mode well-defined", () => {
    for (const [canon, variants] of Object.entries({ ...G.toponyms, ...G.actions })) {
      for (const v of variants) {
        expect(v, `${canon}: ${v}`).toMatch(/^[a-z0-9][a-z0-9 '-]*\*?$/);
        expect(v, `${canon}: ${v}`).toBe(v.toLowerCase());
      }
    }
  });

  it("a stem star appears only as the final character, and never on a toponym", () => {
    for (const variants of Object.values(G.toponyms)) {
      for (const v of variants) expect(v, v).not.toContain("*");
    }
    for (const variants of Object.values(G.actions)) {
      for (const v of variants) {
        const stars = v.split("*").length - 1;
        expect(stars, v).toBeLessThanOrEqual(1);
        if (stars === 1) expect(v.endsWith("*"), v).toBe(true);
      }
    }
  });

  it("no variant is declared under two canonicals", () => {
    for (const table of [G.toponyms, G.actions]) {
      const seen = new Map<string, string>();
      for (const [canon, variants] of Object.entries(table)) {
        for (const v of variants) {
          expect(seen.has(v), `${v} declared under both ${seen.get(v)} and ${canon}`).toBe(false);
          seen.set(v, canon);
        }
      }
    }
  });

  it("every canonical toponym carries a theater from the iran_regional contributor set", () => {
    expect(Object.keys(G.theaterOf).sort()).toEqual(Object.keys(G.toponyms).sort());
    for (const [canon, theater] of Object.entries(G.theaterOf)) {
      expect(IRAN_THEATERS, canon).toContain(theater);
    }
    // the mapped theater and each legacy_only theater are actually represented
    for (const t of IRAN_THEATERS) {
      expect(Object.values(G.theaterOf), t).toContain(t);
    }
  });

  it("every expansion key and every expansion member is a declared canonical", () => {
    const canonicals = Object.keys(G.toponyms);
    for (const [wide, members] of Object.entries(G.expansions)) {
      expect(canonicals, wide).toContain(wide);
      expect(members.length, wide).toBeGreaterThan(0);
      for (const m of members) {
        expect(canonicals, `${wide} -> ${m}`).toContain(m);
        expect(m, `${wide} -> ${m}`).not.toBe(wide);
      }
    }
  });

  it("carries NO person names (ruling 20: names are not toponyms)", () => {
    const names = [
      "khamenei", "khomeini", "soleimani", "nasrallah", "netanyahu", "pezeshkian",
      "raisi", "araghchi", "salami", "sinwar", "haniyeh", "bagheri", "assad",
    ];
    const allVariants = [
      ...Object.values(G.toponyms).flat(),
      ...Object.values(G.actions).flat(),
    ];
    for (const name of names) {
      for (const v of allVariants) {
        // "al-asad airbase" is a PLACE named for a person and is allowed; a bare
        // person name is not
        expect(v === name, `${name} appears as a bare variant`).toBe(false);
      }
    }
  });

  it("has no country-level canonical for the six states the SCALE RULE excludes", () => {
    const allVariants = new Set([...Object.values(G.toponyms).flat()]);
    for (const country of ["iran", "iraq", "syria", "lebanon", "israel", "yemen"]) {
      expect(allVariants.has(country), country).toBe(false);
    }
    // the six Gulf states ARE present (the documented exception)
    for (const canon of ["saudi_arabia", "uae", "qatar", "bahrain", "kuwait", "oman"]) {
      expect(Object.keys(G.toponyms), canon).toContain(canon);
    }
  });
});

describe("iran-levant-v1 action lexicon covers what the iran-lanes-v1 lanes need", () => {
  it("declares the nine action classes", () => {
    expect(Object.keys(G.actions)).toEqual([
      "strike", "advance", "air_defense", "political", "casualties",
      "nuclear", "militia", "maritime", "domestic",
    ]);
  });

  const terms: [string, string][] = [
    ["nuclear", "The IAEA requested access."],
    ["nuclear", "A centrifuge cascade was installed."],
    ["nuclear", "Enrichment continued to 60 percent."],
    ["militia", "The PMF issued a statement."],
    ["militia", "Kataib Hezbollah claimed the attack."],
    ["militia", "Ansar Allah announced a new campaign."],
    ["militia", "Houthi forces resumed operations."],
    ["militia", "Hezbollah fired a salvo."],
    ["militia", "The IRGC confirmed the deployment."],
    ["militia", "Quds Force officers travelled."],
    ["maritime", "A tanker was boarded."],
    ["maritime", "Commercial shipping rerouted."],
    ["domestic", "Protests spread to several cities."],
    ["domestic", "A crackdown followed the arrests."],
  ];
  for (const [cls, text] of terms) {
    it(`${cls}: ${JSON.stringify(text)}`, () => {
      expect([...extractSignatureWith(G, text).actions]).toContain(cls);
    });
  }
});
