import * as cheerio from "cheerio";
import type { RawDoc, SourceAdapter } from "./types";

// Keyless Telegram ingestion via the public t.me/s/<channel> web preview
// (last ~20 posts per channel). The MTProto adapter (stubbed) replaces this
// for history + higher fidelity once TELEGRAM_API_ID/HASH exist.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export function parseChannelPage(html: string, channel: string, countryIso2: string): RawDoc[] {
  const $ = cheerio.load(html);
  const docs: RawDoc[] = [];
  $(".tgme_widget_message").each((_, el) => {
    const $el = $(el);
    const post = $el.attr("data-post"); // "channel/1234"
    const text = $el.find(".tgme_widget_message_text").first().text().trim();
    const datetime = $el.find("time").attr("datetime");
    if (!post || !text) return;
    const publishedAt = datetime ? new Date(datetime) : null;
    docs.push({
      adapter: "telegram_web",
      externalId: post,
      url: `https://t.me/${post}`,
      title: null,
      content: text.slice(0, 8000),
      lang: null, // set downstream; most theater channels are ru/uk
      countryIso2,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
      sourceKey: `t.me/${channel.toLowerCase()}`,
      meta: {
        views: $el.find(".tgme_widget_message_views").first().text().trim() || null,
        hasMedia: $el.find(".tgme_widget_message_photo_wrap, video").length > 0,
      },
    });
  });
  return docs;
}

export class TelegramWebAdapter implements SourceAdapter {
  readonly name = "telegram_web";
  readonly live = true;

  constructor(
    private channels: Array<{ channel: string; countryIso2: string }>,
    private spacingMs = 1500,
  ) {}

  async fetchLatest(): Promise<RawDoc[]> {
    const docs: RawDoc[] = [];
    for (const { channel, countryIso2 } of this.channels) {
      try {
        const res = await fetch(`https://t.me/s/${encodeURIComponent(channel)}`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          console.warn(`telegram_web ${channel}: HTTP ${res.status}`);
          continue;
        }
        const html = await res.text();
        const parsed = parseChannelPage(html, channel, countryIso2);
        // channels with previews disabled return a join page with no messages
        if (parsed.length === 0) console.warn(`telegram_web ${channel}: 0 posts (preview off?)`);
        docs.push(...parsed);
      } catch (e) {
        console.warn(`telegram_web ${channel}: ${e instanceof Error ? e.message : e}`);
      }
      await new Promise((r) => setTimeout(r, this.spacingMs));
    }
    return docs;
  }
}
