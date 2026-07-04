import { readFileSync } from "node:fs";
import { join } from "node:path";
import Parser from "rss-parser";
import { describe, expect, it } from "vitest";
import { gdeltToRawDoc } from "./gdelt";
import { itemToRawDoc, type RssFeedConfig } from "./rss";
import { parseChannelPage } from "./telegram-web";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "fixtures", "adapters", name), "utf8");

describe("rss itemToRawDoc", () => {
  const feed: RssFeedConfig = {
    url: "https://meduza.io/rss/en/all",
    sourceKey: "meduza.io",
    lang: "en",
    countryIso2: "ru",
    name: "Meduza (EN)",
  };

  it("maps real meduza feed items", async () => {
    const parser = new Parser();
    const parsed = await parser.parseString(fixture("meduza-en.rss.xml"));
    expect(parsed.items.length).toBeGreaterThan(5);
    const doc = itemToRawDoc(parsed.items[0], feed);
    expect(doc.adapter).toBe("rss");
    expect(doc.sourceKey).toBe("meduza.io");
    expect(doc.url).toMatch(/^https:\/\/meduza\.io/);
    expect(doc.content.length).toBeGreaterThan(0);
    expect(doc.publishedAt).toBeInstanceOf(Date);
  });

  it("survives items with missing fields", () => {
    const doc = itemToRawDoc({}, feed);
    expect(doc.content).toBe("");
    expect(doc.publishedAt).toBeNull();
    expect(doc.externalId).toBeNull();
  });

  it("rejects invalid dates", () => {
    const doc = itemToRawDoc({ pubDate: "not a date", title: "x" }, feed);
    expect(doc.publishedAt).toBeNull();
  });
});

describe("telegram parseChannelPage", () => {
  it("parses real t.me/s/rybar page", () => {
    const docs = parseChannelPage(fixture("tme-rybar.html"), "rybar", "ru");
    expect(docs.length).toBeGreaterThan(5);
    const d = docs[0];
    expect(d.adapter).toBe("telegram_web");
    expect(d.sourceKey).toBe("t.me/rybar");
    expect(d.externalId).toMatch(/^rybar\/\d+$/);
    expect(d.url).toMatch(/^https:\/\/t\.me\/rybar\/\d+$/);
    expect(d.content.length).toBeGreaterThan(10);
  });

  it("returns empty for non-channel html", () => {
    expect(parseChannelPage("<html><body>join to view</body></html>", "x", "ru")).toEqual([]);
  });
});

describe("gdeltToRawDoc", () => {
  it("converts seendate and maps fields", () => {
    const doc = gdeltToRawDoc(
      {
        url: "https://example.com/a",
        title: "Strike reported",
        seendate: "20260704T121500Z",
        language: "English",
        domain: "Example.com",
        sourcecountry: "US",
      },
      "ua",
    );
    expect(doc.publishedAt?.toISOString()).toBe("2026-07-04T12:15:00.000Z");
    expect(doc.sourceKey).toBe("example.com");
    expect(doc.lang).toBe("en");
    expect(doc.countryIso2).toBe("ua");
  });
});
