// ru-ua-v1 pins (48h step 06).
//
// The gazetteer-snapshot fixture pins the DATA against a pre-split generation.
// This file pins the ALGORITHM independently: it carries the pre-split
// extractSignature / expandToponyms bodies verbatim as a LEGACY ORACLE and
// differentials them against the shipped code over every declared variant, both
// ISW fixtures, and a set of adversarial strings. A future hand that
// re-baselines the snapshot still has to get past this.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractTakeawaysWithText } from "../isw-extract";
import { expandToponyms, extractSignature } from "../keywords";
import { RU_UA_V1 } from "./ru-ua-v1";
import type { Signature } from "./types";

// --------------------------------------------------------------------------
// The legacy oracle — keywords.ts:117-133 as it stood before the split
// --------------------------------------------------------------------------

function legacyExtractSignature(text: string): Signature {
  const t = ` ${text.toLowerCase()} `;
  const toponyms = new Set<string>();
  for (const [canon, variants] of Object.entries(RU_UA_V1.toponyms))
    if (variants.some((v) => t.includes(v))) toponyms.add(canon);
  const actions = new Set<string>();
  for (const [canon, variants] of Object.entries(RU_UA_V1.actions))
    if (variants.some((v) => t.includes(v))) actions.add(canon);
  return { toponyms, actions };
}

function legacyExpandToponyms(toponyms: Set<string>): Set<string> {
  const out = new Set(toponyms);
  for (const t of toponyms) for (const town of RU_UA_V1.expansions[t] ?? []) out.add(town);
  return out;
}

function probes(): string[] {
  const out: string[] = ["", "   ", "no signal at all", "ARCHITECTURE", "Lymanske", "Sumykhimprom"];
  for (const variants of Object.values(RU_UA_V1.toponyms)) {
    for (const v of variants) {
      out.push(v, v.toUpperCase(), `Reports from ${v} overnight.`, `x${v}x`, `${v},`);
    }
  }
  for (const variants of Object.values(RU_UA_V1.actions)) {
    for (const v of variants) out.push(v, `Overnight ${v} was reported near Pokrovsk.`);
  }
  for (const rel of ["fixtures/isw/roca-2026-06-30.html", "fixtures/isw/iran-update-2026-07-24.html"]) {
    // transient only (ruling 1): read to compare two in-memory functions,
    // never persisted anywhere
    const html = readFileSync(join(process.cwd(), rel), "utf8");
    out.push(...extractTakeawaysWithText(html).transientTexts);
  }
  return out;
}

describe("ru-ua-v1 is the pre-split gazetteer, unchanged", () => {
  it("extractSignature equals the legacy oracle on every declared variant, both ISW fixtures, and adversarial strings", () => {
    const corpus = probes();
    expect(corpus.length).toBeGreaterThan(500);
    for (const text of corpus) {
      const shipped = extractSignature(text);
      const oracle = legacyExtractSignature(text);
      // insertion ORDER matters (it is persisted): compare arrays, not sets
      expect([...shipped.toponyms], JSON.stringify(text).slice(0, 80)).toEqual([...oracle.toponyms]);
      expect([...shipped.actions], JSON.stringify(text).slice(0, 80)).toEqual([...oracle.actions]);
    }
  });

  it("expandToponyms equals the legacy oracle over every canonical and every subset pair", () => {
    const canonicals = Object.keys(RU_UA_V1.toponyms);
    for (const a of canonicals) {
      expect([...expandToponyms(new Set([a]))], a).toEqual([...legacyExpandToponyms(new Set([a]))]);
      for (const b of canonicals) {
        const input = new Set([a, b]);
        expect([...expandToponyms(input)], `${a}+${b}`).toEqual([...legacyExpandToponyms(input)]);
      }
    }
    expect([...expandToponyms(new Set())]).toEqual([]);
    expect([...expandToponyms(new Set(["not_a_canonical"]))]).toEqual(["not_a_canonical"]);
  });

  it("declares the version and the substring match mode Cyrillic requires", () => {
    expect(RU_UA_V1.version).toBe("ru-ua-v1");
    expect(RU_UA_V1.matchMode).toBe("substring");
  });

  it("key order is frozen (it is persisted as isw_reports.takeaways[].toponyms)", () => {
    expect(Object.keys(RU_UA_V1.toponyms)).toEqual([
      "pokrovsk", "toretsk", "kupyansk", "chasiv_yar", "kostyantynivka", "lyman", "siversk",
      "sloviansk", "kramatorsk", "vovchansk", "kharkiv", "sumy", "zaporizhzhia", "kherson",
      "donetsk", "luhansk", "velykyi_burluk", "novopavlivka", "velyka_novosilka", "hulyaipole",
      "kyiv", "odesa", "dnipro", "crimea", "moscow", "belgorod", "kursk", "bryansk", "rostov",
      "ryazan", "tatarstan", "st_petersburg", "dubna", "north_korea",
    ]);
    expect(Object.keys(RU_UA_V1.actions)).toEqual([
      "strike", "advance", "air_defense", "political", "casualties",
    ]);
    expect(Object.keys(RU_UA_V1.expansions)).toEqual([
      "donetsk", "kharkiv", "zaporizhzhia", "luhansk", "kherson", "sumy",
    ]);
  });

  it("every canonical toponym carries a theater tag, and every expansion member is a canonical", () => {
    for (const canon of Object.keys(RU_UA_V1.toponyms)) {
      expect(RU_UA_V1.theaterOf[canon], canon).toMatch(/^(ru|ua|both)$/);
    }
    expect(Object.keys(RU_UA_V1.theaterOf).sort()).toEqual(Object.keys(RU_UA_V1.toponyms).sort());
    for (const [wide, members] of Object.entries(RU_UA_V1.expansions)) {
      expect(Object.keys(RU_UA_V1.toponyms), wide).toContain(wide);
      for (const m of members) expect(Object.keys(RU_UA_V1.toponyms), `${wide}->${m}`).toContain(m);
    }
  });
});
