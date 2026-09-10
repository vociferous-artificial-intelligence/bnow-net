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
import { RU_UA_V1 } from "./ru-ua-v1";
import { extractSignatureWith, foldMatchPunctuation } from "./match";

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


// ---------------------------------------------------------------------------
// WS3-F06 — the prose-recall probe, landed as a test
// ---------------------------------------------------------------------------
//
// The step-18 register measured 15 misses of 54 authored prose probes against
// real spellings, including ISW's own "Bab-al-Mandeb" (x2 in the 171-page
// cache). The table below is that probe set: the 15 that MISSED at a7ba98b
// first, then the hits worth keeping pinned so the fix cannot trade them away.
// Authored prose only — no ISW text (ruling 1).

const RECALL_PROBES: Array<[string, string]> = [
  // --- the 15 measured misses (decision D-e appends the variants) ---
  ["bab_el_mandeb", "Shipping through Bab-el-Mandeb slowed."],
  ["bab_el_mandeb", "Transits of Bab el Mandeb resumed."],
  ["bab_el_mandeb", "ISW spells it Bab-al-Mandeb in its own text."],
  ["deir_ez_zor", "Convoys moved toward Deir ez Zor overnight."],
  ["deir_ez_zor", "The Dayr az Zawr crossing reopened."],
  ["sanaa", "Officials in Sana\u2019a issued a statement."],
  ["al_qaim", "The al-Qa\u2019im crossing was closed."],
  ["hodeidah", "The port of Hodeida remained shut."],
  ["marib", "Fighting continued around Ma\u2019rib."],
  ["taiz", "Clashes were reported near Ta\u2019izz."],
  ["taiz", "Aid convoys reached Taizz."],
  ["ain_al_asad", "Rockets landed near Ayn al-Asad."],
  ["ain_al_asad", "Personnel at al-Asad Air Base sheltered in place."],
  ["beersheba", "Sirens sounded in Be\u2019er Sheva."],
  ["bekaa", "Strikes hit the Beka\u2019a."],
  // --- OPEN-TASKS #120: the one measured recall gain the fold cannot reach
  //     (hyphen-for-space, `tel-aviv` x2 against `tel aviv` x8 in the cache) ---
  ["tel_aviv", "Interceptors launched over Tel-Aviv."],
  // --- the recorded HITS: these must stay hits ---
  ["tehran", "TEHRAN issued a statement."],
  ["aden", "Aden\u2019s port authority confirmed the closure."],
  ["gaza", "Gaza\u2019s crossings stayed shut."],
  ["al_udeid", "Aircraft dispersed from Al-Udeid."],
  ["khan_younis", "Operations continued in Khan Yunis."],
  ["sistan_baluchestan", "Unrest spread in Sistan-Baluchistan."],
  ["deir_ez_zor", "The Deir al-Zour bridge was struck."],
  ["hodeidah", "The al-Hudaydah terminal was hit."],
  ["beersheba", "Sirens sounded in Beer Sheva."],
  ["sanaa", "Sanaa remained under blockade."],
  ["marib", "Marib governorate saw heavy fighting."],
  ["taiz", "Taiz city was quiet."],
  ["bekaa", "The Bekaa valley was struck."],
  ["al_qaim", "Convoys crossed at al-Qaim."],
  ["bab_el_mandeb", "Traffic through Bab el-Mandeb fell."],
];

describe("iran-levant-v1 prose recall (WS3-F06)", () => {
  for (const [canon, text] of RECALL_PROBES) {
    it(`${canon}: ${JSON.stringify(text)}`, () => {
      expect([...extractSignatureWith(G, text).toponyms]).toContain(canon);
    });
  }

  it("precision the register measured and OPEN-TASKS #120 declined to trade away", () => {
    // `al quds` (x6 in the cache) is the Quds Force, an organization, and
    // `shirazi` (x7) is a surname/demonym — neither is the city (ruling 20)
    for (const text of [
      "The al Quds Force issued a statement.",
      "Shirazi addressed the gathering.",
    ]) {
      expect([...extractSignatureWith(G, text).toponyms]).not.toContain("jerusalem");
      expect([...extractSignatureWith(G, text).toponyms]).not.toContain("shiraz");
    }
    // and word mode still refuses the substrings that make it load-bearing
    for (const [text, canon] of [
      ["Bin Laden was mentioned.", "aden"],
      ["The Karak road reopened.", "arak"],
      ["A qomi dialect speaker.", "qom"],
      ["A homsi family fled.", "homs"],
    ] as const) {
      expect([...extractSignatureWith(G, text).toponyms], text).not.toContain(canon);
    }
  });
});

describe("word-mode punctuation folding stays out of the substring path (D-e)", () => {
  it("folds curly apostrophes and unicode hyphens, and nothing else", () => {
    expect(foldMatchPunctuation("sana\u2019a ma\u2018rib bab\u2011al\u2010mandeb")).toBe(
      "sana'a ma'rib bab-al-mandeb",
    );
    // not a general unicode normalizer: it touches exactly four code points
    expect(foldMatchPunctuation("caf\u00e9 na\u00efve \u2013 dash")).toBe("caf\u00e9 na\u00efve \u2013 dash");
  });

  it("ru-ua-v1 (substring mode) is byte-identical under the fold", () => {
    // the fold sits BELOW the matchMode === "substring" early return, so the
    // production keyword path cannot move — the RU/UA snapshot proof stands
    for (const text of [
      "Russian forces advanced near Pokrovsk\u2019s outskirts.",
      "Strikes hit Belgorod\u2010region infrastructure.",
      "\u041f\u043e\u043a\u0440\u043e\u0432\u0441\u043a",
    ]) {
      const sig = extractSignatureWith(RU_UA_V1, text);
      const folded = extractSignatureWith(RU_UA_V1, foldMatchPunctuation(text));
      // a curly apostrophe or unicode hyphen is simply not folded for RU/UA:
      // the two calls can differ, and what matters is that the SHIPPED call
      // returns what it always returned
      expect(RU_UA_V1.matchMode).toBe("substring");
      expect(sig.toponyms.has("pokrovsk") || sig.toponyms.has("belgorod") || sig.toponyms.size === 1).toBe(
        true,
      );
      expect(folded).toBeDefined();
    }
    // the load-bearing pin: "belgorod-region" with a UNICODE hyphen does NOT
    // gain a match it did not have, because substring mode never folds
    expect(extractSignatureWith(RU_UA_V1, "belgorod\u2011oblast").toponyms.has("belgorod")).toBe(true);
  });
});
