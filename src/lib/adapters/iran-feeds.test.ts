import { readFileSync } from "node:fs";
import { join } from "node:path";
import Parser from "rss-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RSS_FEEDS } from "../ingest/config";
import { canonicalSource } from "../isw/urls";
import { RssAdapter, itemToRawDoc, type RssFeedConfig } from "./rss";

// 2026-08-15 Iran validation recovery roster (Workstream D): fixture-based
// proof that each activated feed really is RSS/Atom, parses, attributes to the
// right canonical sourceKey and theater, and that its date behavior is what
// production will see (presstv/saba items carry NO per-item pubDate — their
// publishedAt is null and raw_documents falls back to fetched_at by design).

const parser = new Parser();

function feed(sourceKey: string): RssFeedConfig {
  const f = RSS_FEEDS.find((f) => f.sourceKey === sourceKey);
  if (!f) throw new Error(`feed ${sourceKey} not in RSS_FEEDS`);
  return f;
}

async function firstDocs(sourceKey: string, fixture: string) {
  const xml = readFileSync(join(process.cwd(), "fixtures/adapters", fixture), "utf8");
  const parsed = await parser.parseString(xml);
  expect(parsed.items?.length ?? 0).toBeGreaterThan(3);
  return (parsed.items ?? []).map((i) => itemToRawDoc(i, feed(sourceKey)));
}

describe("Iran recovery roster — fixture parses", () => {
  it("en.mehrnews.com: dated English items on the ir lens", async () => {
    const docs = await firstDocs("en.mehrnews.com", "en.mehrnews.com.rss.xml");
    for (const d of docs.slice(0, 5)) {
      expect(d.adapter).toBe("rss");
      expect(d.sourceKey).toBe("en.mehrnews.com");
      expect(d.countryIso2).toBe("ir");
      expect(d.url).toMatch(/^https:\/\/en\.mehrnews\.com\//);
      expect(d.content.length).toBeGreaterThan(0);
      expect(d.publishedAt).toBeInstanceOf(Date);
    }
  });

  it("radiofarda.com: dated Persian items (lang fa, explicit ir pin)", async () => {
    const docs = await firstDocs("radiofarda.com", "radiofarda.com.rss.xml");
    const f = feed("radiofarda.com");
    expect(f.lang).toBe("fa");
    const articles = docs.filter((d) => d.url?.includes("/a/"));
    expect(articles.length).toBeGreaterThan(3);
    for (const d of articles.slice(0, 5)) {
      expect(d.countryIso2).toBe("ir");
      expect(d.url).toMatch(/^https:\/\/www\.radiofarda\.com\//);
      expect(d.publishedAt).toBeInstanceOf(Date);
    }
  });

  it("sabanew.net: Arabic items with dates rss-parser normalizes to isoDate", async () => {
    const docs = await firstDocs("sabanew.net", "sabanew.net.rss.xml");
    const f = feed("sabanew.net");
    expect(f.lang).toBe("ar");
    for (const d of docs.slice(0, 5)) {
      expect(d.countryIso2).toBe("ir"); // coverage lens (ruling 11), never language-routed
      expect(d.url).toMatch(/^https?:\/\/www\.sabanew\.net\//);
      expect(d.publishedAt).toBeInstanceOf(Date);
      expect(d.externalId).toBeTruthy();
    }
  });

  it("presstv.ir: served from presstv.co.uk but item links stay presstv.ir (no canonical split)", async () => {
    const f = feed("presstv.ir");
    expect(f.url).toBe("https://www.presstv.co.uk/rss.xml");
    const docs = await firstDocs("presstv.ir", "presstv.ir.rss.xml");
    const articles = docs.filter((d) => d.url && d.url.includes("/Detail/"));
    expect(articles.length).toBeGreaterThan(3);
    for (const d of articles.slice(0, 5)) {
      expect(d.sourceKey).toBe("presstv.ir");
      expect(d.url).toMatch(/^https:\/\/(www\.)?presstv\.ir\//);
      expect(d.publishedAt).toBeNull(); // feed carries no per-item pubDate
    }
  });

  it("sanaacenter.org: dated English long-form items", async () => {
    const docs = await firstDocs("sanaacenter.org", "sanaacenter.org.rss.xml");
    for (const d of docs.slice(0, 3)) {
      expect(d.url).toMatch(/^https:\/\/sanaacenter\.org\//);
      expect(d.publishedAt).toBeInstanceOf(Date);
      expect(d.countryIso2).toBe("ir");
    }
  });

  it("alaraby.co.uk: the POLITICS-section feed only (never the 1.1MB full-site feed)", async () => {
    const f = feed("alaraby.co.uk");
    expect(f.url).toBe("https://www.alaraby.co.uk/rss/politics");
    const docs = await firstDocs("alaraby.co.uk", "alaraby.co.uk.rss.xml");
    for (const d of docs.slice(0, 5)) {
      expect(d.countryIso2).toBe("ir");
      expect(d.url).toMatch(/^https:\/\/www\.alaraby\.co\.uk\//);
      expect(d.publishedAt).toBeInstanceOf(Date);
      expect(d.content.length).toBeGreaterThan(0);
    }
    // politics-only: no sports/culture section links in the section feed
    expect(docs.some((d) => d.url?.includes("/sport/"))).toBe(false);
  });
});

describe("RSS roster invariants", () => {
  it("sourceKeys are unique and canonical (lowercase host, www-stripped, no path)", () => {
    const keys = RSS_FEEDS.map((f) => f.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of RSS_FEEDS) {
      const cs = canonicalSource(`https://${f.sourceKey}/`);
      expect(cs, f.sourceKey).not.toBeNull();
      expect(cs!.key, `sourceKey ${f.sourceKey} must equal its own canonical key`).toBe(f.sourceKey);
    }
  });

  it("the ir lens carries exactly the reviewed roster", () => {
    const ir = RSS_FEEDS.filter((f) => f.countryIso2 === "ir").map((f) => f.sourceKey);
    expect(ir.sort()).toEqual(
      [
        "al-monitor.com",
        "alaraby.co.uk",
        "en.mehrnews.com",
        "iranintl.com",
        "iranwire.com",
        "middleeasteye.net",
        "presstv.ir",
        "radiofarda.com",
        "sabanew.net",
        "sanaacenter.org",
      ].sort(),
    );
  });

  it("every feed pins an explicit theater — Arabic/Persian feeds never rely on language routing", () => {
    const known = new Set(["ru", "ua", "il", "ir", "sa", "ae", "qa", "om", "bh", "kw"]);
    for (const f of RSS_FEEDS) {
      expect(known.has(f.countryIso2), `${f.sourceKey} theater ${f.countryIso2}`).toBe(true);
      expect(f.lang).toMatch(/^[a-z]{2}$/);
    }
  });
});

describe("dead-feed isolation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("one dead/HTML feed cannot suppress the others in the same adapter pass", async () => {
    const good = readFileSync(join(process.cwd(), "fixtures/adapters/en.mehrnews.com.rss.xml"), "utf8");
    const dead: RssFeedConfig = { url: "https://dead.example/rss", sourceKey: "dead.example", lang: "en", countryIso2: "ir", name: "Dead" };
    const htmlNotRss: RssFeedConfig = { url: "https://html.example/rss", sourceKey: "html.example", lang: "en", countryIso2: "ir", name: "HTML" };
    const ok = feed("en.mehrnews.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes("dead.example")) throw new Error("network down");
        if (u.includes("html.example"))
          return new Response("<!DOCTYPE html><html><body>not a feed</body></html>", { status: 200 });
        return new Response(good, { status: 200 });
      }),
    );
    const docs = await new RssAdapter([dead, htmlNotRss, ok]).fetchLatest();
    expect(docs.length).toBeGreaterThan(3);
    expect(new Set(docs.map((d) => d.sourceKey))).toEqual(new Set(["en.mehrnews.com"]));
  });
});
