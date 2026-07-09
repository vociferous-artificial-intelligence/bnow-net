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

describe("detectLang minority languages", () => {
  it("tags Tatar, Bashkir, Chuvash, Chechen", () => {
    expect(detectLang("Татарстанда яңа мәчет ачылды, җәмәгать җыелды")).toBe("tt");
    expect(detectLang("Башҡортостанда ҡалала яңы мәктәп асылды, уҡыусылар килде")).toBe("ba");
    expect(detectLang("Шупашкарта ҫӗнӗ шкул уҫӑлчӗ, ачасем савӑнчӗҫ")).toBe("cv");
    expect(detectLang("Нохчийн республикехь керла школа схьайиллина, дуккха а бераш дӏахьаьжна")).toBe("ce");
  });
  it("still distinguishes ru/uk correctly", () => {
    expect(detectLang("Обычный русский текст про экономику и рынок")).toBe("ru");
    expect(detectLang("Звичайний український текст про економіку і ринок")).toBe("uk");
  });
});

describe("detectLang Persian/Arabic", () => {
  it("distinguishes Persian from Arabic", () => {
    expect(detectLang("ایران امروز درباره برنامه هسته‌ای گفتگو کرد و پاسخ داد")).toBe("fa");
    expect(detectLang("أعلنت الحكومة اليوم عن إجراءات جديدة بشأن الأمن والاقتصاد")).toBe("ar");
  });
  it("does not misfire on latin/cyrillic", () => {
    expect(detectLang("Iran nuclear talks resumed in Geneva this week")).toBe("en");
    expect(detectLang("Российские войска под Покровском продолжают наступление")).toBe("ru");
  });
});

describe("truncation ladder", () => {
  it("keeps the full ladder for a full batch", async () => {
    const { ladderSizes } = await import("./digest");
    expect(ladderSizes(100)).toEqual([100, 50, 25]);
    expect(ladderSizes(99)).toEqual([99, 50, 25]); // the audit's UA 07-02 exemplar
  });

  it("never re-sends an identical batch (audit O2: docs.length 26..50)", async () => {
    const { ladderSizes } = await import("./digest");
    for (let n = 26; n <= 50; n++) {
      const sizes = ladderSizes(n);
      expect(sizes[0]).toBe(n);
      // a rung >= n would slice to the same n docs and be billed for nothing
      expect(sizes.slice(1).every((s) => s < n)).toBe(true);
      expect(new Set(sizes).size).toBe(sizes.length);
    }
    expect(ladderSizes(30)).toEqual([30, 25]); // was [30, 50, 25]
    expect(ladderSizes(50)).toEqual([50, 25]); // was [50, 50, 25]
  });

  it("gives a <=25-doc batch no retry at all", async () => {
    const { ladderSizes } = await import("./digest");
    expect(ladderSizes(25)).toEqual([25]);
    expect(ladderSizes(10)).toEqual([10]);
    expect(ladderSizes(1)).toEqual([1]);
  });

  it("is strictly decreasing for every batch size", async () => {
    const { ladderSizes } = await import("./digest");
    for (let n = 1; n <= 200; n++) {
      const sizes = ladderSizes(n);
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    }
  });
});

describe("per-digest LLM accounting (structured.stats.llm)", () => {
  it("sums the whole ladder, so a truncated rung's wasted spend stays visible", async () => {
    const { summarizeLlmCalls } = await import("./digest");
    // audit §4d: UA 07-02 fired [99 truncated, 50 truncated, 25 success]
    const s = summarizeLlmCalls([
      { promptTokens: 9056, completionTokens: 16384, estUsd: 0.011189, truncated: true },
      { promptTokens: 6104, completionTokens: 16384, estUsd: 0.010746, truncated: true },
      { promptTokens: 3955, completionTokens: 1007, estUsd: 0.001197, truncated: false },
    ]);
    expect(s.calls).toBe(3);
    expect(s.truncationRetries).toBe(2);
    expect(s.promptTokens).toBe(19115);
    expect(s.completionTokens).toBe(33775);
    expect(s.estUsd).toBeCloseTo(0.02313, 5); // the audit's measured $0.02313
  });

  it("reports a clean single-call digest with no truncation", async () => {
    const { summarizeLlmCalls } = await import("./digest");
    const s = summarizeLlmCalls([
      { promptTokens: 7697, completionTokens: 734, estUsd: 0.001595, truncated: false },
    ]);
    expect(s).toEqual({
      calls: 1,
      promptTokens: 7697,
      completionTokens: 734,
      estUsd: 0.001595,
      truncationRetries: 0,
    });
  });
});

describe("anthropic provider response parsing", () => {
  it("parses plain JSON, fenced JSON, and rejects junk", async () => {
    const { parseEventsJson } = await import("./anthropic-provider");
    const ev = { title: "t", type: "strike", summary: "s", claims: [] };
    expect(parseEventsJson(JSON.stringify({ events: [ev] }))).toHaveLength(1);
    expect(parseEventsJson("```json\n" + JSON.stringify({ events: [ev] }) + "\n```")).toHaveLength(1);
    expect(parseEventsJson("Sure! Here you go: " + JSON.stringify({ events: [ev] }))).toHaveLength(1);
    expect(parseEventsJson("no json here")).toEqual([]);
    expect(parseEventsJson('{"events": "not-an-array"}')).toEqual([]);
  });
});
