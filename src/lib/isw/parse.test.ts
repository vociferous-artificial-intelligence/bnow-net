import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyHedging } from "./hedging";
import { dateFromTitle, extractMarkerContexts, parseEndnoteText, parseReport } from "./parse";
import { canonicalSource, cleanUrl, deobfuscate } from "./urls";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "fixtures", "isw", name), "utf8");

describe("deobfuscate + cleanUrl", () => {
  it("reverses ISW ' dot ' obfuscation", () => {
    expect(deobfuscate("https://www.president dot gov.ua/news/x")).toBe(
      "https://www.president.gov.ua/news/x",
    );
  });
  it("strips trailing prose punctuation and tracking params", () => {
    expect(cleanUrl("https://t.me/rybar/12345;")).toBe("https://t.me/rybar/12345");
    expect(cleanUrl("https://example.com/a?utm_source=x&id=2")).toBe(
      "https://example.com/a?id=2",
    );
  });
  it("rejects non-urls", () => {
    expect(cleanUrl("not a url")).toBeNull();
  });
});

describe("canonicalSource", () => {
  it("collapses telegram posts to channel", () => {
    expect(canonicalSource("https://t.me/rybar/12345")?.key).toBe("t.me/rybar");
    expect(canonicalSource("https://t.me/s/DeepStateUA/999")?.key).toBe("t.me/deepstateua");
    expect(canonicalSource("https://t.me/rybar")?.platform).toBe("telegram");
  });
  it("collapses twitter/x statuses to account", () => {
    expect(canonicalSource("https://twitter.com/WarMonitor/status/1")?.key).toBe(
      "x.com/warmonitor",
    );
    expect(canonicalSource("https://x.com/GeoConfirmed/status/2")?.platform).toBe("x");
  });
  it("classifies gov and state media domains", () => {
    expect(canonicalSource("https://www.kremlin.ru/events/1")?.platform).toBe("gov");
    expect(canonicalSource("https://mil.gov.ua/news/1")?.platform).toBe("gov");
    expect(canonicalSource("https://tass.ru/armiya/1")?.platform).toBe("state_media");
    expect(canonicalSource("https://meduza.io/news/1")?.platform).toBe("independent_media");
  });
  it("drops ISW self-citations", () => {
    expect(
      canonicalSource("https://understandingwar.org/research/russia-ukraine/x/"),
    ).toBeNull();
  });
});

describe("dateFromTitle", () => {
  it("parses assessment date", () => {
    expect(dateFromTitle("Russian Offensive Campaign Assessment, June 30, 2026")).toBe(
      "2026-06-30",
    );
    expect(dateFromTitle("Russia-Ukraine Warning Update: February 27, 2022")).toBe(
      "2022-02-27",
    );
  });
  it("returns null when absent", () => {
    expect(dateFromTitle("Russian Offensive Campaign Assessment")).toBeNull();
  });
});

describe("parseEndnoteText", () => {
  it("splits [N] groups and extracts urls incl. obfuscated", () => {
    const text =
      "[1] https://t.me/mod_russia/100 ; https://www.president dot gov.ua/news/a\n" +
      "[2] https://twitter.com/x/status/5";
    const m = parseEndnoteText(text);
    expect(m.get(1)).toEqual([
      "https://t.me/mod_russia/100",
      "https://www.president.gov.ua/news/a",
    ]);
    expect(m.get(2)).toEqual(["https://twitter.com/x/status/5"]);
  });
});

describe("classifyHedging", () => {
  it("detects the four classes", () => {
    expect(classifyHedging("Geolocated footage published on June 29 shows...").hedging).toBe(
      "confirmed",
    );
    expect(
      classifyHedging("The Russian MoD claimed that forces seized the town").hedging,
    ).toBe("claimed");
    expect(classifyHedging("ISW cannot independently verify this report").hedging).toBe(
      "unverified",
    );
    expect(classifyHedging("ISW assesses that the offensive has culminated").hedging).toBe(
      "assessed",
    );
  });
  it("unverified beats claimed when both present", () => {
    const r = classifyHedging("sources claimed X, but ISW cannot independently verify");
    expect(r.hedging).toBe("unverified");
  });
});

describe("extractMarkerContexts", () => {
  it("captures the sentence before each marker", () => {
    const text =
      "Alpha happened today. The Russian MoD claimed beta occurred.[1] ISW assesses gamma.[2]";
    const ctx = extractMarkerContexts(text);
    expect(ctx.get(1)).toContain("claimed beta");
    expect(ctx.get(1)).not.toContain("Alpha");
    expect(ctx.get(2)).toContain("assesses gamma");
  });
});

describe("parseReport on 2026-06-30 fixture", () => {
  const parsed = parseReport(
    "https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-june-30-2026/",
    fixture("roca-2026-06-30.html"),
  );
  it("parses ok with date from title", () => {
    expect(parsed.parseOk).toBe(true);
    expect(parsed.reportDate).toBe("2026-06-30");
  });
  it("finds a realistic number of endnotes and citations", () => {
    expect(parsed.endnoteCount).toBeGreaterThan(40);
    expect(parsed.citations.length).toBeGreaterThan(60);
  });
  it("classifies hedging for a substantial share of citations", () => {
    // ISW's unhedged declaratives intentionally stay "unknown" (see hedging.ts),
    // so 100% is not the target; rules-first floor is 45%.
    const known = parsed.citations.filter((c) => c.hedging !== "unknown").length;
    expect(known / parsed.citations.length).toBeGreaterThan(0.45);
  });
  it("citations include telegram sources", () => {
    expect(parsed.citations.some((c) => c.rawUrl.includes("t.me/"))).toBe(true);
  });
});
