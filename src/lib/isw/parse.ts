import * as cheerio from "cheerio";
import { classifyHedging, type Hedging } from "./hedging";
import { cleanUrl } from "./urls";

export interface ParsedCitation {
  endnoteIndex: number;
  rawUrl: string;
  hedging: Hedging;
  hedgingCue: string | null;
}

export interface ParsedReport {
  url: string;
  title: string;
  reportDate: string | null; // ISO yyyy-mm-dd — the assessment date, from the title
  endnoteCount: number;
  citations: ParsedCitation[];
  bodyMarkerCount: number;
  parseOk: boolean;
  parseNotes: string[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "Russian Offensive Campaign Assessment, June 30, 2026" -> 2026-06-30 */
export function dateFromTitle(title: string): string | null {
  const m = title.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
  );
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
}

/** Split endnote text block into [index, urls[]] pairs. Format: "[1] url ; url<br>[2] url ..." */
export function parseEndnoteText(text: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  // split on [N] markers, keeping the N
  const parts = text.split(/\[(\d{1,4})\]/);
  // parts: [pre, "1", chunk1, "2", chunk2, ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    const idx = parseInt(parts[i], 10);
    const chunk = parts[i + 1] ?? "";
    const urls: string[] = [];
    // URLs may be " dot "-obfuscated, so match liberally then clean
    for (const m of chunk.matchAll(/https?:\/\/[^\s;<>"')\]]+(?:\s+dot\s+[^\s;<>"')\]]+)*/gi)) {
      const cleaned = cleanUrl(m[0]);
      if (cleaned) urls.push(cleaned);
    }
    if (urls.length > 0) {
      const prev = out.get(idx) ?? [];
      out.set(idx, [...prev, ...urls]);
    }
  }
  return out;
}

/** Extract the sentence containing each [N] marker from body prose. */
export function extractMarkerContexts(bodyText: string): Map<number, string> {
  const contexts = new Map<number, string>();
  const re = /\[(\d{1,4})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyText)) !== null) {
    const idx = parseInt(m[1], 10);
    if (contexts.has(idx)) continue; // first occurrence wins
    const at = m.index;
    // walk back to previous sentence terminator or 350 chars, whichever is closer
    const start = Math.max(
      0,
      at - 350,
      ...[". ", "! ", "? ", "\n", "] "].map((t) => bodyText.lastIndexOf(t, at - 1) + t.length),
    );
    contexts.set(idx, bodyText.slice(start, at).trim());
  }
  return contexts;
}

export function parseReport(url: string, html: string): ParsedReport {
  const notes: string[] = [];
  const $ = cheerio.load(html);

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";
  const reportDate = dateFromTitle(title) ?? dateFromTitle(url.replace(/-/g, " ")) ?? null;
  if (!reportDate) notes.push("no-report-date");

  // Endnotes: new-design accordion, with fallbacks for older layouts
  let endnoteText = "";
  const accordion = $(".endnote-accordion-content");
  if (accordion.length > 0) {
    endnoteText = accordion.text();
  } else {
    // fallback 1: a paragraph run starting with [1] http near document end
    const candidates = $("p")
      .toArray()
      .filter((el) => /^\s*\[\d{1,4}\]\s*https?:\/\//.test($(el).text()));
    if (candidates.length > 0) {
      endnoteText = candidates.map((el) => $(el).text()).join("\n");
      notes.push("endnotes-from-paragraph-fallback");
    } else {
      notes.push("no-endnote-block");
    }
  }
  const endnotes = parseEndnoteText(endnoteText);

  // Body: everything before the endnote block, prose only
  const bodyClone = $.root().clone();
  bodyClone.find(".endnote-accordion-content, script, style, nav, header, footer").remove();
  const bodyText = bodyClone.find("p").text();
  const contexts = extractMarkerContexts(bodyText);

  const citations: ParsedCitation[] = [];
  for (const [idx, urls] of endnotes) {
    const ctx = contexts.get(idx);
    const h = ctx ? classifyHedging(ctx) : { hedging: "unknown" as Hedging, cue: null };
    for (const rawUrl of urls) {
      citations.push({ endnoteIndex: idx, rawUrl, hedging: h.hedging, hedgingCue: h.cue });
    }
  }

  const parseOk = endnotes.size > 0 && reportDate !== null;
  return {
    url,
    title,
    reportDate,
    endnoteCount: endnotes.size,
    citations,
    bodyMarkerCount: contexts.size,
    parseOk,
    parseNotes: notes,
  };
}
