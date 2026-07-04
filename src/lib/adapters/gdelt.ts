import type { RawDoc, SourceAdapter } from "./types";

// GDELT DOC 2.0 API (keyless). We pull the last window of RU/UA-relevant articles.
// https://api.gdeltproject.org/api/v2/doc/doc

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string; // "20260704T120000Z"
  language: string;
  domain: string;
  sourcecountry: string;
}

export function gdeltToRawDoc(a: GdeltArticle, countryIso2: string): RawDoc {
  // seendate "20260704T120000Z" -> ISO
  const iso = a.seendate?.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
    "$1-$2-$3T$4:$5:$6Z",
  );
  const publishedAt = iso ? new Date(iso) : null;
  return {
    adapter: "gdelt",
    externalId: a.url,
    url: a.url,
    title: a.title?.trim() ?? null,
    content: a.title?.trim() ?? "", // GDELT gives metadata only; content = title
    lang: a.language?.toLowerCase().slice(0, 2) ?? null,
    countryIso2,
    publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
    sourceKey: a.domain?.toLowerCase() ?? null,
    meta: { sourcecountry: a.sourcecountry, gdelt: true },
  };
}

const QUERIES: Record<string, string> = {
  ru: '(russia OR russian) (military OR war OR strike OR offensive OR sanctions)',
  ua: '(ukraine OR ukrainian) (military OR war OR strike OR offensive OR drone)',
};

export class GdeltAdapter implements SourceAdapter {
  readonly name = "gdelt";
  readonly live = true;

  constructor(private countries: string[] = ["ru", "ua"]) {}

  async fetchLatest(): Promise<RawDoc[]> {
    const docs: RawDoc[] = [];
    for (const iso of this.countries) {
      const query = QUERIES[iso];
      if (!query) continue;
      const params = new URLSearchParams({
        query,
        mode: "artlist",
        maxrecords: "75",
        format: "json",
        timespan: "60min",
        sort: "datedesc",
      });
      try {
        const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
          headers: { "User-Agent": "BNOWBot/0.1 (+https://bnow.net/bot)" },
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          console.warn(`gdelt ${iso}: HTTP ${res.status}`);
          continue;
        }
        const text = await res.text();
        let json: { articles?: GdeltArticle[] };
        try {
          json = JSON.parse(text);
        } catch {
          console.warn(`gdelt ${iso}: non-JSON response (${text.slice(0, 80)})`);
          continue;
        }
        for (const a of json.articles ?? []) docs.push(gdeltToRawDoc(a, iso));
      } catch (e) {
        console.warn(`gdelt ${iso}: ${e instanceof Error ? e.message : e}`);
      }
      // GDELT hard limit: one request per 5 seconds
      await new Promise((r) => setTimeout(r, 5500));
    }
    return docs;
  }
}
