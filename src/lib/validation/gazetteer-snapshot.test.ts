// RU/UA gazetteer byte-identity pin (48h step 06).
//
// The production keyword path — extractSignature / expandToponyms /
// classifyTakeawayTheater / matchScore — feeds `isw_reports.takeaways`
// (isw-extract.ts:56-64), the per-theater takeaway filter (run.ts:152-167) and
// the whole legacy scoreboard (score.ts:159-185). Splitting keywords.ts into a
// versioned gazetteer package must not move ONE of those numbers.
//
// This file is committed BEFORE the split, and the fixture it byte-compares
// against is generated from the PRE-SPLIT code. The proof is therefore the
// commit graph, not an assertion: after the refactor commit, `git diff` over
// this test and its fixture must be EMPTY while the suite stays green.
//
// Deliberate re-baselining is the explicit operator step
//   UPDATE_GAZETTEER_SNAPSHOT=1 npx vitest run src/lib/validation/gazetteer-snapshot.test.ts
// followed by a reviewed diff (the goldens.test.ts:13-20 convention). Doing that
// after the refactor DESTROYS the proof — the independent legacy-oracle
// differential in gazetteer/ru-ua-v1.test.ts exists so the algorithm stays
// pinned even then.
//
// LEGAL (ruling 1): the snapshot stores DERIVED data only — canonical toponym
// ids, action-class ids, theaters, scores, counts and hashes. No ISW prose and
// no corpus prose is written to disk; the corpus strings are repo-authored
// synthetic text and live only in this source file.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractTakeaways, extractTakeawaysWithText } from "./isw-extract";
import {
  classifyTakeawayTheater,
  expandToponyms,
  extractSignature,
  matchScore,
  MATCH_THRESHOLD,
} from "./keywords";

const SNAPSHOT_FILE = "fixtures/validation/gazetteer-snapshot-v1.json";
const ISW_FIXTURES = [
  "fixtures/isw/roca-2026-06-30.html",
  "fixtures/isw/iran-update-2026-07-24.html",
] as const;

/** Repo-authored synthetic probes (never ISW prose). Ordered and id-stable:
 *  the ids are what the snapshot records, and `corpusSha256` covers the texts,
 *  so a later corpus edit cannot hide behind a regeneration. */
const CORPUS: readonly { id: string; text: string }[] = [
  // --- every RU/UA toponym family, en/ru/uk ---
  { id: "c001", text: "Russian forces advanced near Pokrovsk overnight." },
  { id: "c002", text: "Враг наступает под Покровском и Красноармейском." },
  { id: "c003", text: "Ворог просунувся біля Куп'янська." },
  { id: "c004", text: "Fighting continued around Toretsk and Dzerzhinsk." },
  { id: "c005", text: "Shelling was reported near Chasiv Yar." },
  { id: "c006", text: "Konstantinovka and Kostyantynivka name the same town." },
  { id: "c007", text: "Units regrouped near Lyman and Siversk." },
  { id: "c008", text: "Fighting near Lymanske was reported." },
  { id: "c009", text: "Sloviansk and Kramatorsk remained under fire." },
  { id: "c010", text: "Vovchansk saw renewed assaults." },
  { id: "c011", text: "A drone strike hit Kharkiv." },
  { id: "c012", text: "The Sumykhimprom plant caught fire." },
  { id: "c013", text: "Orikhiv in Zaporizhzhia stayed static." },
  { id: "c014", text: "Kherson was shelled again." },
  { id: "c015", text: "Donetsk and Luhansk oblasts saw no change of control." },
  { id: "c016", text: "Velykyi Burluk was struck." },
  { id: "c017", text: "Novopavlivka and Velyka Novosilka were contested." },
  { id: "c018", text: "Hulyaipole held." },
  { id: "c019", text: "Kyiv air defense intercepted several drones." },
  { id: "c020", text: "Odesa and Odessa are the same port." },
  { id: "c021", text: "Dnipropetrovsk Oblast reported explosions." },
  { id: "c022", text: "Crimea and Sevastopol were targeted." },
  { id: "c023", text: "Moscow announced new measures." },
  { id: "c024", text: "Belgorod, Kursk and Bryansk reported cross-border fire." },
  { id: "c025", text: "A refinery in Rostov burned." },
  { id: "c026", text: "Ukrainian forces struck a refinery in Ryazan." },
  { id: "c027", text: "Yelabuga in Tatarstan was hit by a UAV." },
  { id: "c028", text: "SPIEF opened in Petersburg." },
  { id: "c029", text: "Dubna hosted the meeting." },
  { id: "c030", text: "North Korea and the DPRK were named as suppliers." },
  // --- every action class, en/ru/uk ---
  { id: "c031", text: "Massive drone strike overnight with Shahed and Geran airframes." },
  { id: "c032", text: "Подразделения штурмуют город и просунулись вперёд." },
  { id: "c033", text: "ППО збила 40 шахедів." },
  { id: "c034", text: "Putin and Zelensky discussed a ceasefire; sanctions were extended." },
  { id: "c035", text: "Casualties and losses were reported on both axes." },
  { id: "c036", text: "Обстрел вызвал пожар на нефтебазе." },
  { id: "c037", text: "Звільнення населеного пункту не підтверджено." },
  // --- deliberate behavioural quirks that MUST survive verbatim ---
  { id: "c038", text: "The architecture of the defense line was reinforced." },
  { id: "c039", text: "" },
  { id: "c040", text: "   " },
  { id: "c041", text: "POKROVSK, TORETSK, KUPIANSK" },
  { id: "c042", text: "Pokrovsk." },
  { id: "c043", text: "No place, no action, nothing at all here." },
  // --- Iran/Levant probes: MUST stay toponym-free on the default path ---
  { id: "c044", text: "Israeli aircraft struck a site near Natanz and Tehran." },
  { id: "c045", text: "A Houthi attack was reported in the Red Sea near Aden." },
  { id: "c046", text: "The IAEA said access to an enrichment hall was declined." },
  { id: "c047", text: "Shipping through the Strait of Hormuz was rerouted." },
  { id: "c048", text: "Hezbollah fired rockets from south Lebanon toward Haifa." },
  { id: "c049", text: "Kataib Hezbollah claimed a drone attack on Ain al-Asad." },
  { id: "c050", text: "Talks in Muscat and Doha covered the nuclear file." },
  { id: "c051", text: "Strikes were reported near Damascus and Deir ez-Zor." },
];

const IRAN_PROBE_IDS = ["c044", "c045", "c046", "c047", "c048", "c049", "c050", "c051"] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface SnapshotEntry {
  id: string;
  toponyms: string[];
  actions: string[];
  theater: string;
  expanded: string[];
}

function entryOf(id: string, text: string): SnapshotEntry {
  const sig = extractSignature(text);
  const toponyms = [...sig.toponyms];
  return {
    id,
    toponyms,
    actions: [...sig.actions],
    theater: classifyTakeawayTheater(toponyms),
    expanded: [...expandToponyms(new Set(toponyms))],
  };
}

function buildSnapshot(): Record<string, unknown> {
  const corpus = CORPUS.map((c) => entryOf(c.id, c.text));

  // every unordered pair with a non-zero score — pins matchScore AND the
  // threshold relation, storing ids and numbers only
  const pairs: { a: string; b: string; score: number; matches: boolean }[] = [];
  for (let i = 0; i < CORPUS.length; i += 1) {
    for (let j = i + 1; j < CORPUS.length; j += 1) {
      const s = matchScore(extractSignature(CORPUS[i].text), extractSignature(CORPUS[j].text));
      if (s > 0) {
        pairs.push({ a: CORPUS[i].id, b: CORPUS[j].id, score: s, matches: s >= MATCH_THRESHOLD });
      }
    }
  }

  const iswFixtures = ISW_FIXTURES.map((rel) => {
    const html = readFileSync(join(process.cwd(), rel), "utf8");
    return {
      path: rel,
      sha256: sha256(html),
      takeaways: extractTakeaways(html).map((t) => ({
        index: t.index,
        toponyms: t.toponyms,
        actions: t.actions,
        chars: t.chars,
        theater: classifyTakeawayTheater(t.toponyms),
        expanded: [...expandToponyms(new Set(t.toponyms))],
      })),
    };
  });

  return {
    snapshotVersion: 1,
    gazetteer: "ru-ua-v1",
    note: "derived signatures only - no ISW prose, no corpus prose (ruling 1)",
    matchThreshold: MATCH_THRESHOLD,
    corpusSha256: sha256(CORPUS.map((c) => `${c.id} ${c.text}`).join("")),
    corpus,
    pairs,
    iswFixtures,
  };
}

function snapshotBytes(): string {
  return `${JSON.stringify(buildSnapshot(), null, 2)}\n`;
}

describe("RU/UA gazetteer signature snapshot (byte-stable)", () => {
  const path = join(process.cwd(), SNAPSHOT_FILE);

  it("reproduces the committed snapshot BYTE-FOR-BYTE", () => {
    const bytes = snapshotBytes();
    if (process.env.UPDATE_GAZETTEER_SNAPSHOT === "1") {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, "utf8");
    }
    expect(
      existsSync(path),
      `missing ${SNAPSHOT_FILE} — generate it with UPDATE_GAZETTEER_SNAPSHOT=1 npx vitest run src/lib/validation/gazetteer-snapshot.test.ts and review the diff`,
    ).toBe(true);
    expect(bytes).toBe(readFileSync(path, "utf8"));
  });

  it("generation is deterministic: two independent builds produce identical bytes", () => {
    expect(snapshotBytes()).toBe(snapshotBytes());
  });

  it("the default keyword path carries NO Iran/Levant toponyms (leak pin)", () => {
    for (const id of IRAN_PROBE_IDS) {
      const probe = CORPUS.find((c) => c.id === id)!;
      expect(extractSignature(probe.text).toponyms.size, id).toBe(0);
    }
  });

  it("the committed snapshot recovers no ISW prose and no corpus prose", () => {
    const committed = readFileSync(path, "utf8");
    for (const c of CORPUS) {
      const words = c.text.split(/\s+/).filter(Boolean);
      for (let i = 0; i + 4 <= words.length; i += 1) {
        expect(committed.includes(words.slice(i, i + 4).join(" ")), c.id).toBe(false);
      }
    }
    for (const rel of ISW_FIXTURES) {
      // the raw bullets are read TRANSIENTLY here to prove their absence from
      // the committed bytes; they are never written anywhere
      const html = readFileSync(join(process.cwd(), rel), "utf8");
      for (const text of extractTakeawaysWithText(html).transientTexts) {
        const words = text.split(/\s+/).filter(Boolean);
        for (let i = 0; i + 6 <= words.length; i += 1) {
          expect(committed.includes(words.slice(i, i + 6).join(" ")), rel).toBe(false);
        }
      }
    }
  });
});
