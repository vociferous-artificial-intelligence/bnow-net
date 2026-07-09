import { describe, expect, it } from "vitest";
import {
  claimTokens,
  clusterClaims,
  independentSourceCount,
  isMetaClaim,
  pairScore,
  rankGroups,
  REDUCE_THRESHOLD,
  scoreGroup,
  type ReduceClaim,
} from "./reduce";

let nextId = 1;
function claim(over: Partial<ReduceClaim> = {}): ReduceClaim {
  return {
    id: over.id ?? nextId++,
    docId: 100,
    textEn: "Ukrainian forces struck eight tankers of the Russian shadow fleet",
    quoteOrig: null,
    quoteVerified: false,
    claimType: "factual",
    hedging: "claimed",
    entities: [],
    eventHint: null,
    claimDate: "2026-07-08",
    sourceDomain: "example.com",
    sourceKey: "example.com",
    reliability: 0.6,
    adapter: "rss",
    platform: null,
    publishedAt: "2026-07-08T10:00:00Z",
    ...over,
  };
}

describe("claimTokens", () => {
  it("drops stopwords, keeps numbers, lowercases", () => {
    const t = claimTokens("The forces struck 8 tankers of THE fleet");
    expect(t.has("the")).toBe(false);
    expect(t.has("of")).toBe(false);
    expect(t.has("8")).toBe(true);
    expect(t.has("struck")).toBe(true);
    expect(t.has("tankers")).toBe(true);
  });
});

describe("pairScore", () => {
  it("identical text scores 1", () => {
    const a = claim();
    const b = claim({ docId: 200, sourceDomain: "other.org" });
    expect(pairScore(a, b)).toBeCloseTo(1);
  });

  it("gates on claim_date more than one day apart (recurring templates)", () => {
    const a = claim({ claimDate: "2026-07-05" });
    const b = claim({ claimDate: "2026-07-08" });
    expect(pairScore(a, b)).toBe(-1);
    const c = claim({ claimDate: "2026-07-06" });
    expect(pairScore(a, c)).toBeGreaterThan(0);
  });

  it("renormalizes weights when one side lacks entities or hint", () => {
    const bare = claim();
    const withMeta = claim({
      entities: [{ name: "Russian Armed Forces", kind: "org", role: "actor" }],
      eventHint: "shadow fleet strikes",
    });
    // identical text, metadata only on one side -> still a perfect text match
    expect(pairScore(bare, withMeta)).toBeCloseTo(1);
  });

  it("entity and hint overlap lift a partial text match", () => {
    const a = claim({
      textEn: "Ukrainian forces struck eight tankers of the Russian shadow fleet overnight",
      entities: [{ name: "Ukrainian Armed Forces", kind: "org", role: "actor" }],
      eventHint: "shadow fleet tanker strikes",
    });
    const b = claim({
      textEn: "Ukraine hit eight shadow fleet tankers in one night",
      entities: [{ name: "Ukrainian forces", kind: "org", role: "actor" }], // alias folds
      eventHint: "shadow fleet tanker strikes",
    });
    const textOnly = pairScore(claim({ textEn: a.textEn }), claim({ textEn: b.textEn }));
    expect(pairScore(a, b)).toBeGreaterThan(textOnly);
    expect(pairScore(a, b)).toBeGreaterThanOrEqual(REDUCE_THRESHOLD);
  });
});

describe("clusterClaims", () => {
  it("groups same-event claims across docs and unions docIds", () => {
    const a = claim({ id: 1, docId: 10, sourceDomain: "meduza.io" });
    const b = claim({ id: 2, docId: 20, sourceDomain: "glavcom.ua" });
    const other = claim({
      id: 3,
      docId: 30,
      textEn: "CENTCOM launched new strikes on Iran over attacks on commercial ships",
    });
    const groups = clusterClaims([a, b, other]);
    expect(groups).toHaveLength(2);
    const merged = groups.find((g) => g.memberIds.includes(1))!;
    expect(merged.docIds).toEqual([10, 20]);
    expect(merged.memberIds).toEqual([1, 2]);
  });

  it("collapses in-doc near-dupes (same doc allowed in one group)", () => {
    const a = claim({ id: 1, docId: 10 });
    const b = claim({ id: 2, docId: 10 }); // identical wording, same doc
    const groups = clusterClaims([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].docIds).toEqual([10]);
    expect(groups[0].size).toBe(2);
    // one doc = one source: no self-corroboration
    expect(groups[0].independentSources).toBe(1);
    expect(groups[0].hedging).toBe("claimed");
  });

  it("does not percolate: A~B and B~C with A≁C keeps C out (star, not single-linkage)", () => {
    const a = claim({
      id: 1,
      docId: 10,
      textEn: "Ukrainian drones struck the Novorossiysk oil terminal overnight",
    });
    const b = claim({
      id: 2,
      docId: 20,
      sourceDomain: "other.org",
      textEn: "Drones struck the Novorossiysk oil terminal causing a fire at the port",
    });
    const c = claim({
      id: 3,
      docId: 30,
      textEn: "The fire at the Novorossiysk port terminal injured workers",
    });
    // sanity: the chain exists pairwise, but the ends do not match
    expect(pairScore(a, b)).toBeGreaterThanOrEqual(REDUCE_THRESHOLD);
    expect(pairScore(b, c)).toBeGreaterThanOrEqual(REDUCE_THRESHOLD);
    expect(pairScore(a, c)).toBeLessThan(REDUCE_THRESHOLD);
    const groups = clusterClaims([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.memberIds.includes(1))!.memberIds).toEqual([1, 2]);
    expect(groups.find((g) => g.memberIds.includes(3))!.memberIds).toEqual([3]);
  });

  it("drops self-referential meta-claims before clustering", () => {
    const groups = clusterClaims([
      claim({ id: 1, textEn: "No significant military-security claims found in this document." }),
      claim({ id: 2, textEn: "No significant military claims or developments reported." }),
      claim({ id: 3, docId: 30, textEn: "Ukraine does not need Taurus missiles, Pistorius said" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual([3]);
  });

  it("is deterministic regardless of input order", () => {
    const claims = [
      claim({ id: 5, docId: 50, sourceDomain: "a.com" }),
      claim({ id: 1, docId: 10, sourceDomain: "b.com" }),
      claim({
        id: 3,
        docId: 30,
        textEn: "IAEA inspectors returned to the Natanz enrichment facility",
      }),
    ];
    const forward = clusterClaims(claims);
    const reversed = clusterClaims([...claims].reverse());
    expect(forward).toEqual(reversed);
  });
});

describe("hedging promotion", () => {
  it("promotes claimed -> confirmed from two INDEPENDENT domains", () => {
    const groups = clusterClaims([
      claim({ id: 1, docId: 10, sourceDomain: "meduza.io" }),
      claim({ id: 2, docId: 20, sourceDomain: "glavcom.ua" }),
    ]);
    expect(groups[0].hedging).toBe("confirmed");
    expect(groups[0].promoted).toBe(true);
  });

  it("does NOT promote on same-domain corroboration (domain diversity required)", () => {
    const groups = clusterClaims([
      claim({ id: 1, docId: 10, sourceDomain: "t.me" }),
      claim({ id: 2, docId: 20, sourceDomain: "t.me" }),
    ]);
    expect(groups[0].hedging).toBe("claimed");
    expect(groups[0].promoted).toBe(false);
  });

  it("does NOT promote when the docs are doc_dedup mirrors of each other", () => {
    const mirrorOf = new Map([[20, 10]]); // doc 20 mirrors doc 10
    const groups = clusterClaims(
      [
        claim({ id: 1, docId: 10, sourceDomain: "meduza.io" }),
        claim({ id: 2, docId: 20, sourceDomain: "glavcom.ua" }),
      ],
      { mirrorOf },
    );
    expect(groups[0].hedging).toBe("claimed");
    expect(groups[0].promoted).toBe(false);
  });

  it("passes single-doc confirmed through unchanged (HARD RULE 3)", () => {
    const groups = clusterClaims([
      claim({ id: 1, docId: 10, hedging: "confirmed", sourceDomain: "meduza.io" }),
    ]);
    expect(groups[0].hedging).toBe("confirmed");
    expect(groups[0].promoted).toBe(false);
  });

  it("unknown-domain docs cannot prove independence", () => {
    const groups = clusterClaims([
      claim({ id: 1, docId: 10, sourceDomain: null }),
      claim({ id: 2, docId: 20, sourceDomain: null }),
    ]);
    expect(groups[0].hedging).toBe("claimed");
    expect(groups[0].independentSources).toBe(0);
  });

  it("assessment-only groups stay assessed; one factual member keeps the group factual", () => {
    const assessed = clusterClaims([
      claim({ id: 1, claimType: "assessment", hedging: "assessed" }),
      claim({ id: 2, docId: 200, claimType: "assessment", hedging: "assessed" }),
    ]);
    expect(assessed[0].claimType).toBe("assessment");
    expect(assessed[0].hedging).toBe("assessed");

    const mixed = clusterClaims([
      claim({ id: 1, claimType: "assessment", hedging: "assessed" }),
      claim({ id: 2, docId: 200, sourceDomain: "other.org", claimType: "factual" }),
    ]);
    expect(mixed[0].claimType).toBe("factual");
  });
});

describe("isMetaClaim", () => {
  it("matches the observed map artifacts", () => {
    for (const t of [
      "No significant military-security claims found in this document.",
      "No significant military claims were made in this document.",
      "No significant military claims or developments reported.",
      "No significant claims found in this document.",
      "No relevant claims in the document.",
    ]) {
      expect(isMetaClaim(t)).toBe(true);
    }
  });

  it("keeps real negations, including world-state quiet-day claims", () => {
    for (const t of [
      "Germany's Defense Minister stated that Ukraine does not need Taurus missiles.",
      "Israel's Defense Minister stated that Israel does not need permission to remain in Lebanon.",
      "NATO does not believe Russia will capture the entire Donbas by the end of 2027.",
      "No significant developments occurred along the Kupyansk axis.",
      "No relevant developments were reported in the Kherson direction.",
      "No notable developments on the Zaporizhzhia front.",
    ]) {
      expect(isMetaClaim(t)).toBe(false);
    }
  });
});

describe("hedging edge cases", () => {
  it("factual members hedged 'assessed' surface as assessed, not unknown", () => {
    const groups = clusterClaims([
      claim({ id: 1, claimType: "factual", hedging: "assessed" }),
    ]);
    expect(groups[0].claimType).toBe("factual");
    expect(groups[0].hedging).toBe("assessed");
  });

  it("an unparseable claim date fails the day gate closed", () => {
    const a = claim({ id: 1, claimDate: "not-a-date" });
    const b = claim({ id: 2, docId: 200 });
    expect(pairScore(a, b)).toBe(-1);
  });
});

describe("independentSourceCount", () => {
  it("counts distinct domains, folding mirror classes", () => {
    const docs = [
      { docId: 1, sourceDomain: "a.com" },
      { docId: 2, sourceDomain: "b.com" },
      { docId: 3, sourceDomain: "a.com" }, // same domain as 1
    ];
    expect(independentSourceCount(docs)).toBe(2);
    // 2 mirrors 1 -> b.com content is a.com content -> one class
    expect(independentSourceCount(docs, new Map([[2, 1]]))).toBe(1);
  });
});

describe("group fields", () => {
  it("confidence is the mean COALESCE(reliability, 0.3) over DISTINCT docs, not members", () => {
    const groups = clusterClaims([
      claim({ id: 1, docId: 10, reliability: 0.9, sourceDomain: "a.com" }),
      claim({ id: 2, docId: 10, reliability: 0.9, sourceDomain: "a.com" }), // same doc twice
      claim({ id: 3, docId: 20, reliability: null, sourceDomain: "b.com" }),
    ]);
    // per-doc mean = (0.9 + 0.3) / 2 = 0.6; a per-member mean would be 0.7
    expect(groups[0].confidence).toBeCloseTo(0.6);
    expect(groups[0].maxReliability).toBeCloseTo(0.9);
  });

  it("maxReliability has no hidden floor — an all-low-reliability group reports its real max", () => {
    const groups = clusterClaims([claim({ id: 1, reliability: 0.15 })]);
    expect(groups[0].maxReliability).toBeCloseTo(0.15);
  });

  it("drops junk entities and folds aliases via the canonicalization rules", () => {
    const groups = clusterClaims([
      claim({
        id: 1,
        entities: [
          { name: "Iran", kind: "org", role: "actor" }, // bare geography -> dropped
          { name: "IRGC", kind: "org", role: "actor" },
        ],
      }),
      claim({
        id: 2,
        docId: 200,
        entities: [
          { name: "Islamic Revolutionary Guard Corps", kind: "agency", role: "actor" },
          { name: "five individuals", kind: "person", role: "target" }, // collective -> dropped
        ],
      }),
    ]);
    expect(groups[0].entities).toHaveLength(1);
    // IRGC and the full name fold to one canonical key
    expect(["IRGC", "Islamic Revolutionary Guard Corps"]).toContain(groups[0].entities[0].name);
  });

  it("only VERIFIED quotes surface as evidence", () => {
    const unverified = clusterClaims([
      claim({ id: 1, quoteOrig: "какая-то цитата из источника", quoteVerified: false }),
    ]);
    expect(unverified[0].quote).toBeNull();

    const verified = clusterClaims([
      claim({ id: 1, docId: 10, quoteOrig: "какая-то цитата из источника", quoteVerified: true }),
    ]);
    expect(verified[0].quote).toEqual({ text: "какая-то цитата из источника", docId: 10 });
  });

  it("representative text comes from the most reliable member", () => {
    const groups = clusterClaims([
      claim({ id: 1, docId: 10, reliability: 0.4, textEn: "Ukrainian forces struck eight tankers of the Russian shadow fleet" }),
      claim({
        id: 2,
        docId: 20,
        reliability: 0.9,
        sourceDomain: "b.com",
        textEn: "Ukrainian forces struck eight tankers of Russia's shadow fleet",
      }),
    ]);
    expect(groups[0].text).toBe("Ukrainian forces struck eight tankers of Russia's shadow fleet");
  });
});

describe("ranking", () => {
  const NOW = Date.parse("2026-07-09T00:00:00Z");

  it("corroborated, reliable, fresh groups outrank singletons", () => {
    const big = clusterClaims([
      claim({ id: 1, docId: 10, sourceDomain: "a.com", reliability: 0.8 }),
      claim({ id: 2, docId: 20, sourceDomain: "b.com", reliability: 0.7 }),
    ])[0];
    const small = clusterClaims([
      claim({
        id: 3,
        docId: 30,
        reliability: 0.35,
        textEn: "Routine training exercise announced in a border region",
        publishedAt: "2026-07-01T00:00:00Z",
      }),
    ])[0];
    expect(scoreGroup(big, NOW)).toBeGreaterThan(scoreGroup(small, NOW));
    expect(rankGroups([small, big], NOW)[0].key).toBe(big.key);
  });

  it("REDUCE_THRESHOLD stays in a sane band (retune, don't drift)", () => {
    expect(REDUCE_THRESHOLD).toBeGreaterThanOrEqual(0.3);
    expect(REDUCE_THRESHOLD).toBeLessThanOrEqual(0.7);
  });
});
