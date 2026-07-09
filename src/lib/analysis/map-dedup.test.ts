import { describe, expect, it } from "vitest";
import { dedupGate, type DedupDoc } from "./map-dedup";

// The persistent dedup gate is what keeps the map from paying to extract the
// 2,562 exact duplicates + the near-dupe mass on every backfill (audit §9a).
// Verdicts must be same-theater and ±1 day only — collapsing a recurring
// template across distant days would misdate claims.

const LONG_A =
  "Ukrainian forces reported striking a Russian ammunition depot near Kharkiv overnight, " +
  "with secondary detonations visible for several hours according to local residents and " +
  "geolocated footage shared by monitoring channels across the region on Tuesday morning.";
const LONG_B =
  "Weather services issued a heat advisory for the southern coast, urging residents to stay " +
  "hydrated and avoid outdoor work at midday as temperatures approach seasonal records set " +
  "during the previous decade according to the national meteorological agency bulletin.";

let seq = 1;
function doc(over: Partial<DedupDoc> & { text?: string }): DedupDoc {
  const text = over.text ?? LONG_A;
  return {
    id: over.id ?? seq++,
    theater: over.theater ?? "ru",
    day: over.day ?? "2026-07-08",
    contentMd5: over.contentMd5 ?? `md5-of:${text.replace(/\s+/g, " ").trim()}`,
    text2k: text,
  };
}

describe("dedupGate — exact matching", () => {
  it("marks an exact same-theater same-day copy as a mirror of the earlier doc", () => {
    const a = doc({ id: 1 });
    const b = doc({ id: 2 });
    const { mirrors, canonical } = dedupGate([a, b], []);
    expect(canonical).toEqual([1]);
    expect(mirrors).toEqual([{ docId: 2, canonicalDocId: 1, method: "exact", score: 1 }]);
  });

  it("matches exact copies against already-mapped references, not just the batch", () => {
    const ref = doc({ id: 10 });
    const cand = doc({ id: 11 });
    const { mirrors, canonical } = dedupGate([cand], [ref]);
    expect(canonical).toEqual([]);
    expect(mirrors[0]).toMatchObject({ docId: 11, canonicalDocId: 10, method: "exact" });
  });

  it("never collapses across theaters — the map key is theater-scoped", () => {
    const ru = doc({ id: 1, theater: "ru" });
    const ir = doc({ id: 2, theater: "ir" });
    const { mirrors, canonical } = dedupGate([ru, ir], []);
    expect(mirrors).toEqual([]);
    expect(canonical).toEqual([1, 2]);
  });

  it("collapses ±1 day but NOT a recurring template 2+ days apart", () => {
    const monday = doc({ id: 1, day: "2026-07-06" });
    const tuesday = doc({ id: 2, day: "2026-07-07" });
    const thursday = doc({ id: 3, day: "2026-07-09" });
    const { mirrors, canonical } = dedupGate([monday, tuesday, thursday], []);
    expect(mirrors).toEqual([{ docId: 2, canonicalDocId: 1, method: "exact", score: 1 }]);
    // thursday is 2 days from tuesday (the surviving canonical is monday, 3 away)
    expect(canonical).toEqual([1, 3]);
  });
});

describe("dedupGate — minhash near-dupes", () => {
  it("collapses a lightly edited repost at >= 0.7 jaccard", () => {
    const orig = doc({ id: 1, text: LONG_A, contentMd5: "m1" });
    const repost = doc({
      id: 2,
      text: LONG_A + " Subscribe to our channel for more updates.",
      contentMd5: "m2", // different exact hash — only minhash can catch it
    });
    const { mirrors, canonical } = dedupGate([orig, repost], []);
    expect(canonical).toEqual([1]);
    expect(mirrors).toHaveLength(1);
    expect(mirrors[0].method).toBe("minhash");
    expect(mirrors[0].canonicalDocId).toBe(1);
    expect(mirrors[0].score).toBeGreaterThanOrEqual(0.7);
  });

  it("keeps genuinely different docs canonical", () => {
    const a = doc({ id: 1, text: LONG_A, contentMd5: "m1" });
    const b = doc({ id: 2, text: LONG_B, contentMd5: "m2" });
    const { mirrors, canonical } = dedupGate([a, b], []);
    expect(mirrors).toEqual([]);
    expect(canonical).toEqual([1, 2]);
  });

  it("near-dupe of an already-mapped reference mirrors to the reference id", () => {
    const ref = doc({ id: 50, text: LONG_A, contentMd5: "m1" });
    const cand = doc({
      id: 51,
      text: "UPDATE. " + LONG_A,
      contentMd5: "m2",
    });
    const { mirrors } = dedupGate([cand], [ref]);
    expect(mirrors[0]).toMatchObject({ docId: 51, canonicalDocId: 50, method: "minhash" });
  });

  it("a chain of near-dupes all point at the one surviving canonical", () => {
    const a = doc({ id: 1, text: LONG_A, contentMd5: "m1" });
    const b = doc({ id: 2, text: LONG_A + " More.", contentMd5: "m2" });
    const c = doc({ id: 3, text: LONG_A + " More details.", contentMd5: "m3" });
    const { mirrors, canonical } = dedupGate([a, b, c], []);
    expect(canonical).toEqual([1]);
    // b and c are both mirrors of accepted docs — never mirrors of a mirror
    for (const m of mirrors) expect(m.canonicalDocId).toBe(1);
  });

  it("respects the same-theater window for minhash too", () => {
    const ru = doc({ id: 1, text: LONG_A, contentMd5: "m1", theater: "ru" });
    const ua = doc({ id: 2, text: LONG_A + " More.", contentMd5: "m2", theater: "ua" });
    const { mirrors, canonical } = dedupGate([ru, ua], []);
    expect(mirrors).toEqual([]);
    expect(canonical).toEqual([1, 2]);
  });
});
