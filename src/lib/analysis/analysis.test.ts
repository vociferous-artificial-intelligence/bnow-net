import { describe, expect, it } from "vitest";
import { detectLang } from "./lang";
import { estimatedJaccard, findNearDuplicates, minhashSignature, shingles } from "./minhash";
import { StubProvider } from "./stub-provider";
import type { AnalysisInputDoc } from "./provider";

describe("detectLang", () => {
  it("distinguishes ru / uk / en", () => {
    expect(detectLang("Российские войска продолжают наступление в этом районе")).toBe("ru");
    expect(detectLang("Ворог просунувся поблизу Торецька, українські підрозділи")).toBe("uk");
    expect(detectLang("Russian forces continued assaults near the town")).toBe("en");
    expect(detectLang("!!")).toBeNull();
  });
});

describe("minhash", () => {
  const a =
    "Russian forces conducted a missile strike on port infrastructure in Odesa Oblast overnight injuring three";
  const aDup =
    "Russian forces conducted a missile strike on the port infrastructure in Odesa Oblast overnight injuring 3";
  const b =
    "Ukrainian drones struck an oil refinery in Ryazan causing a large fire at the facility this morning";

  it("near-identical texts score high, unrelated low", () => {
    const ja = estimatedJaccard(minhashSignature(a), minhashSignature(aDup));
    const jb = estimatedJaccard(minhashSignature(a), minhashSignature(b));
    expect(ja).toBeGreaterThan(0.5);
    expect(jb).toBeLessThan(0.2);
  });

  it("groups near-duplicates, first-seen canonical", () => {
    const { groups, canonicalOf } = findNearDuplicates([a, b, aDup], 0.5);
    expect(canonicalOf.get(2)).toBe(0);
    expect(canonicalOf.get(1)).toBe(1);
    expect(groups.get(0)).toEqual([0, 2]);
  });

  it("handles short texts without crashing", () => {
    expect(shingles("one two").size).toBe(1);
    const { groups } = findNearDuplicates(["hi", "hi", "yo"], 0.5);
    expect(groups.size).toBeGreaterThan(0);
  });
});

describe("StubProvider", () => {
  const mkDoc = (id: number, content: string, reliability = 0.5): AnalysisInputDoc => ({
    id,
    title: null,
    content,
    lang: "en",
    sourceKey: `t.me/src${id}`,
    reliability,
    url: `https://t.me/src${id}/1`,
    publishedAt: null,
  });

  it("produces events whose claims cite only input docIds", async () => {
    const docs = [
      mkDoc(101, "Russian forces conducted a missile strike on port infrastructure in Odesa"),
      mkDoc(102, "Russian forces conducted missile strike on the port infrastructure in Odesa today"),
      mkDoc(103, "Ukrainian drones struck an oil refinery in Ryazan causing large fire"),
    ];
    const res = await new StubProvider().analyze("ua", "2026-07-04", docs);
    expect(res.events.length).toBeGreaterThan(0);
    const allIds = new Set(docs.map((d) => d.id));
    for (const ev of res.events)
      for (const c of ev.claims) {
        expect(c.docIds.length).toBeGreaterThan(0);
        for (const id of c.docIds) expect(allIds.has(id)).toBe(true);
      }
  });

  it("is deterministic", async () => {
    const docs = [mkDoc(1, "alpha bravo charlie delta echo foxtrot golf hotel india")];
    const r1 = await new StubProvider().analyze("ru", "2026-07-04", docs);
    const r2 = await new StubProvider().analyze("ru", "2026-07-04", docs);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
