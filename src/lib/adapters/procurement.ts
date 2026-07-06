import * as cheerio from "cheerio";
import type { RawDoc, SourceAdapter } from "./types";

// State-procurement watcher (zakupki.gov.ru). Tenders for fortifications, drones,
// prosthetics, military graves etc. are a capability + losses + regional-strain
// signal that precedes announcements (RUSSIA-DATA-ROADMAP §1, highest-value build).
//
// NOTE: zakupki.gov.ru is currently unreachable from both the build host and Vercel
// egress (see docs/BLOCKERS.md). The adapter is complete and wired; in production it
// fetches, and returns [] + logs when the host blocks us — it never injects fixture
// data as if it were real. The parser is exercised by tests against a saved fixture.
// Unblock paths: reachable mirror, residential/RU proxy, or the official OpenData FTP.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

export interface ProcurementDoc extends RawDoc {}

/** Parse a zakupki extended-search results HTML page into RawDocs. */
export function parseSearchResults(html: string, keyword: string): RawDoc[] {
  const $ = cheerio.load(html);
  const docs: RawDoc[] = [];
  $(".search-registry-entry-block, .registry-entry__block").each((_, el) => {
    const $el = $(el);
    const regNum = $el.find(".registry-entry__header-mid__number a, a[href*='regNumber']").first().text().trim();
    const href = $el.find(".registry-entry__header-mid__number a, a[href*='regNumber']").first().attr("href") ?? "";
    const subject = $el.find(".registry-entry__body-value").first().text().trim();
    const customer = $el.find(".registry-entry__body-href, .registry-entry__body-value").eq(1).text().trim();
    const priceText = $el.find(".price-block__value").first().text().replace(/[^\d.,]/g, "").replace(/\s/g, "");
    const region = $el.find("[class*='region']").first().text().trim() || null;
    if (!regNum && !subject) return;
    const url = href.startsWith("http") ? href : `https://zakupki.gov.ru${href}`;
    docs.push({
      adapter: "procurement",
      externalId: regNum || url,
      url,
      title: subject.slice(0, 300) || `Tender ${regNum}`,
      content: `${subject}${customer ? ` — заказчик: ${customer}` : ""}`.slice(0, 4000),
      lang: "ru",
      countryIso2: "ru",
      publishedAt: null,
      sourceKey: "zakupki.gov.ru",
      meta: {
        regNumber: regNum || null,
        customer: customer || null,
        priceRub: priceText || null,
        region,
        keyword,
        tender: true,
      },
    });
  });
  return docs;
}

// Keyword watch list — military capability, casualties, regional strain.
export const PROCUREMENT_KEYWORDS = [
  "фортификационных",
  "беспилотн",
  "РЭБ",
  "протезирование",
  "ритуальных услуг",
  "воинских захоронений",
  "маскировочных сетей",
  "мобилизационн",
];

export class ProcurementAdapter implements SourceAdapter {
  readonly name = "procurement";
  readonly live = true; // wired; returns [] when the host blocks us (logged)

  constructor(private keywords: string[] = PROCUREMENT_KEYWORDS) {}

  async fetchLatest(): Promise<RawDoc[]> {
    const docs: RawDoc[] = [];
    for (const kw of this.keywords) {
      const url =
        "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=" +
        encodeURIComponent(kw) +
        "&fz44=on&fz223=on&sortBy=UPDATE_DATE&pageNumber=1&recordsPerPage=_10";
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA },
          redirect: "follow",
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          console.warn(`procurement "${kw}": HTTP ${res.status}`);
          continue;
        }
        docs.push(...parseSearchResults(await res.text(), kw));
      } catch (e) {
        // expected while zakupki blocks our egress — see BLOCKERS.md
        console.warn(`procurement "${kw}": ${e instanceof Error ? e.message : e}`);
      }
      await new Promise((r) => setTimeout(r, 2100));
    }
    return docs;
  }
}
