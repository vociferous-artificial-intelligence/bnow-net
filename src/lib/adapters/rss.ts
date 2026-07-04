import Parser from "rss-parser";
import type { RawDoc, SourceAdapter } from "./types";

export interface RssFeedConfig {
  url: string;
  sourceKey: string; // registry key, usually the domain
  lang: string;
  countryIso2: string; // primary theater tag
  name: string;
}

const UA = "BNOWBot/0.1 (+https://bnow.net/bot)";
const parser = new Parser({ timeout: 20_000 });

export function itemToRawDoc(
  item: { guid?: string; link?: string; title?: string; contentSnippet?: string; content?: string; isoDate?: string; pubDate?: string },
  feed: RssFeedConfig,
): RawDoc {
  const content = (item.contentSnippet || item.content || item.title || "").trim().slice(0, 8000);
  const publishedAt = item.isoDate
    ? new Date(item.isoDate)
    : item.pubDate
      ? new Date(item.pubDate)
      : null;
  return {
    adapter: "rss",
    externalId: item.guid ?? item.link ?? null,
    url: item.link ?? null,
    title: item.title?.trim() ?? null,
    content,
    lang: feed.lang,
    countryIso2: feed.countryIso2,
    publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
    sourceKey: feed.sourceKey,
    meta: { feedUrl: feed.url, feedName: feed.name },
  };
}

export class RssAdapter implements SourceAdapter {
  readonly name = "rss";
  readonly live = true;

  constructor(private feeds: RssFeedConfig[]) {}

  async fetchLatest(): Promise<RawDoc[]> {
    const docs: RawDoc[] = [];
    for (const feed of this.feeds) {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          console.warn(`rss ${feed.name}: HTTP ${res.status}`);
          continue;
        }
        const xml = await res.text();
        const parsed = await parser.parseString(xml);
        for (const item of parsed.items ?? []) docs.push(itemToRawDoc(item, feed));
      } catch (e) {
        console.warn(`rss ${feed.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return docs;
  }
}
