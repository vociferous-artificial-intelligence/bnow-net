import * as cheerio from "cheerio";
import { extractSignature } from "./keywords";

// Extract ISW "Key Takeaways" as DERIVED data only: per-takeaway keyword
// signatures. Raw prose stays in the internal HTML cache; the DB stores
// signatures + ordinal only (legal guardrail, brief §8.6).

export interface IswTakeaway {
  index: number;
  toponyms: string[];
  actions: string[];
  /** rough length bucket for debugging parse quality, not content */
  chars: number;
}

export function extractTakeaways(html: string): IswTakeaway[] {
  const $ = cheerio.load(html);
  let items: string[] = [];

  // find the "Key Takeaways" heading, then collect the following list items
  const heading = $("h1,h2,h3,h4,strong,b")
    .filter((_, el) => /key takeaways/i.test($(el).text()))
    .first();

  if (heading.length > 0) {
    // walk forward through DOM siblings of the heading's block ancestor
    let node = heading.closest("p,h1,h2,h3,h4,div").first();
    for (let hops = 0; hops < 6 && items.length === 0; hops++) {
      node = node.next();
      if (node.length === 0) break;
      const lis = node.is("ul,ol") ? node.find("li") : node.find("ul li, ol li");
      if (lis.length > 0)
        items = lis.toArray().map((el) => $(el).text().trim()).filter(Boolean);
    }
  }

  // fallback: aria-label block (new WP layout renders takeaways in a labeled container)
  if (items.length === 0) {
    const container = $('[aria-label*="Key Takeaways" i]').first();
    if (container.length > 0)
      items = container
        .find("li")
        .toArray()
        .map((el) => $(el).text().trim())
        .filter(Boolean);
  }

  return items.map((text, i) => {
    const sig = extractSignature(text);
    return {
      index: i,
      toponyms: [...sig.toponyms],
      actions: [...sig.actions],
      chars: text.length,
    };
  });
}
