import { afterEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { applicableTracks, chunk, mapBatchMaxTokens, mapBatchSize, parseMapResults } = await import(
  "./map-worker"
);

const SAVED = {
  MAP_BATCH_SIZE: process.env.MAP_BATCH_SIZE,
  MAP_OUT_TOKENS_PER_DOC: process.env.MAP_OUT_TOKENS_PER_DOC,
};
afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const claim = (over: Record<string, unknown> = {}) => ({
  text_en: "Ukrainian forces struck an ammunition depot near Kharkiv.",
  quote_orig: "ВСУ нанесли удар по складу боеприпасов под Харьковом",
  claim_type: "factual",
  hedging: "claimed",
  event_hint: "strike on Kharkiv ammunition depot July 8",
  entities: [],
  ...over,
});

describe("parseMapResults — docId containment (anti-hallucination gate)", () => {
  it("drops a result entry citing a docId that was never sent, and counts it", () => {
    const raw = JSON.stringify({
      results: [
        { docId: 1, claims: [claim()] },
        { docId: 999, claims: [claim()] }, // invented id
      ],
    });
    const { perDoc, wrongDocIds } = parseMapResults(raw, [1, 2]);
    expect(wrongDocIds).toBe(1);
    expect(perDoc.has(999)).toBe(false);
    expect(perDoc.get(1)).toHaveLength(1);
  });

  it("keeps the first entry when the model repeats a docId", () => {
    const raw = JSON.stringify({
      results: [
        { docId: 1, claims: [claim()] },
        { docId: 1, claims: [claim(), claim()] },
      ],
    });
    const { perDoc, duplicateEntries } = parseMapResults(raw, [1]);
    expect(duplicateEntries).toBe(1);
    expect(perDoc.get(1)).toHaveLength(1);
  });

  it("a doc the model omits is simply absent — unmapped, retried later", () => {
    const raw = JSON.stringify({ results: [{ docId: 1, claims: [] }] });
    const { perDoc } = parseMapResults(raw, [1, 2]);
    expect(perDoc.has(2)).toBe(false);
    expect(perDoc.size).toBe(1);
  });
});

describe("parseMapResults — empty and malformed claims", () => {
  it("an empty claims array is a valid verdict (mapped, nothing relevant)", () => {
    const { perDoc } = parseMapResults(JSON.stringify({ results: [{ docId: 7, claims: [] }] }), [7]);
    expect(perDoc.get(7)).toEqual([]);
  });

  it("clamps to 3 claims per doc and drops blank-text claims", () => {
    const raw = JSON.stringify({
      results: [{ docId: 1, claims: [claim(), claim({ text_en: "  " }), claim(), claim(), claim()] }],
    });
    const { perDoc } = parseMapResults(raw, [1]);
    expect(perDoc.get(1)!.length).toBe(3);
  });

  it("clamps quote_orig to 300 chars and falls back to safe enum values", () => {
    const raw = JSON.stringify({
      results: [
        {
          docId: 1,
          claims: [
            claim({ quote_orig: "и".repeat(500), hedging: "definitely-true", claim_type: "vibes" }),
          ],
        },
      ],
    });
    const c = parseMapResults(raw, [1]).perDoc.get(1)![0];
    expect(c.quoteOrig!.length).toBe(300);
    expect(c.hedging).toBe("unknown");
    expect(c.claimType).toBe("factual");
  });

  it("drops entities without a usable name, keeps well-formed ones", () => {
    const raw = JSON.stringify({
      results: [
        {
          docId: 1,
          claims: [
            claim({
              entities: [
                { name: "Investigative Committee", kind: "agency", role: "prosecutor" },
                { name: "", kind: "person", role: "target" },
                { kind: "person", role: "target" },
              ],
            }),
          ],
        },
      ],
    });
    const c = parseMapResults(raw, [1]).perDoc.get(1)![0];
    expect(c.entities).toEqual([
      { name: "Investigative Committee", kind: "agency", role: "prosecutor" },
    ]);
  });

  it("throws on unparseable JSON (the caller's batch error path, not a silent empty)", () => {
    expect(() => parseMapResults("not json", [1])).toThrow(/unparseable/);
  });
});

describe("applicableTracks — the per-doc stage-D gate", () => {
  it("ru: military always applies; elite only on lexicon match", () => {
    const plain = {
      countryIso2: "ru",
      title: null,
      content: "Войска продвинулись на восточном направлении после артиллерийской подготовки.",
    };
    expect(applicableTracks(plain)).toEqual(["military"]);
    const elite = {
      countryIso2: "ru",
      title: "Арест замминистра",
      content: "Следственный комитет предъявил обвинение в получении взятки.",
    };
    expect(applicableTracks(elite)).toEqual(["military", "elite_politics"]);
  });

  it("ir: military is lexicon-gated (posture-and-proxy), nuclear on its own lexicon", () => {
    const chatter = { countryIso2: "ir", title: null, content: "Domestic football league results announced today in Tehran stadium." };
    expect(applicableTracks(chatter)).toEqual([]);
    const strike = { countryIso2: "ir", title: null, content: "Houthi forces launched a missile at a tanker in the Red Sea." };
    expect(applicableTracks(strike)).toEqual(["military"]);
    // IRGC is deliberately in BOTH the ir military and the elite lexicons
    const irgc = { countryIso2: "ir", title: null, content: "IRGC naval forces seized a tanker near the Strait of Hormuz." };
    expect(applicableTracks(irgc)).toEqual(["military", "elite_politics"]);
    const nuclear = { countryIso2: "ir", title: null, content: "IAEA inspectors reported enrichment at Fordow reached new levels." };
    expect(applicableTracks(nuclear)).toContain("nuclear");
  });

  it("ua: elite_politics is not configured, only military applies", () => {
    const doc = { countryIso2: "ua", title: "Суд", content: "арест чиновника за коррупцию" };
    expect(applicableTracks(doc)).toEqual(["military"]);
  });

  it("lexicon probe uses only the first 1500 chars, like digest stage D", () => {
    const doc = {
      countryIso2: "ru",
      title: null,
      content: "х".repeat(1500) + " арест коррупция Следственный комитет",
    };
    expect(applicableTracks(doc)).toEqual(["military"]);
  });
});

describe("micro-batch shaping", () => {
  it("chunk splits without dropping or duplicating", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });

  it("batch size defaults to 20 and clamps to the 10-25 design band edges", () => {
    delete process.env.MAP_BATCH_SIZE;
    expect(mapBatchSize()).toBe(20);
    process.env.MAP_BATCH_SIZE = "100";
    expect(mapBatchSize()).toBe(25);
    process.env.MAP_BATCH_SIZE = "1";
    expect(mapBatchSize()).toBe(5);
  });

  it("output budget is ~200 tok/doc with a floor, far below the 16,384 ceiling", () => {
    delete process.env.MAP_OUT_TOKENS_PER_DOC;
    expect(mapBatchMaxTokens(20)).toBe(4000);
    expect(mapBatchMaxTokens(1)).toBe(1000); // floor: a single dense doc can still answer
    expect(mapBatchMaxTokens(25)).toBeLessThan(16_384);
  });
});
