import { describe, expect, it } from "vitest";
import {
  CUTOFF_PATTERN_VERSION,
  extractDatePublished,
  extractDeclaredCutoff,
  extractReportInstants,
} from "./report-extract";

// All HTML here is SYNTHETIC fixture markup with fictional content: a few
// words of structural boilerplate (the "Data Cutoff:" label shape, JSON-LD
// keys) around invented values — never real report sentences.

const jsonLd = (v: string) => `<script type="application/ld+json">{"datePublished":"${v}","x":1}</script>`;

describe("extractDatePublished", () => {
  it("parses the observed JSON-LD form (+00:00 offset)", () => {
    const r = extractDatePublished(jsonLd("2026-07-24T23:08:59+00:00"));
    expect(r.outcome).toBe("parsed");
    expect(r.publishedAt).toBe("2026-07-24T23:08:59.000Z");
    expect(r.publishedAtMs).toBe(Date.parse("2026-07-24T23:08:59Z"));
    expect(r.conflicting).toBe(false);
  });

  it("tolerates whitespace around the colon (more robust than the production regex)", () => {
    const r = extractDatePublished(`{"datePublished" :  "2026-06-30T23:35:12Z"}`);
    expect(r.outcome).toBe("parsed");
    expect(r.publishedAt).toBe("2026-06-30T23:35:12.000Z");
  });

  it("absent when no declaration exists", () => {
    const r = extractDatePublished("<html><body><p>synthetic page</p></body></html>");
    expect(r).toMatchObject({ outcome: "absent", publishedAt: null, publishedAtMs: null });
  });

  it("a timezone-less value is MALFORMED, never interpreted in server-local time", () => {
    // production's `new Date("2026-07-24T23:08:59")` would silently read the
    // server zone — the exact divergence the contract forbids
    const r = extractDatePublished(jsonLd("2026-07-24T23:08:59"));
    expect(r).toMatchObject({ outcome: "malformed", publishedAt: null, publishedAtMs: null });
  });

  it("skips a malformed first declaration when a later one is valid", () => {
    const html = jsonLd("not-a-date") + jsonLd("2026-07-24T23:08:59Z");
    const r = extractDatePublished(html);
    expect(r.outcome).toBe("parsed");
    expect(r.publishedAt).toBe("2026-07-24T23:08:59.000Z");
    expect(r.conflicting).toBe(false);
  });

  it("uses the FIRST valid declaration and reports a conflict when they disagree", () => {
    const html = jsonLd("2026-07-24T23:08:59Z") + jsonLd("2026-07-25T01:00:00Z");
    const r = extractDatePublished(html);
    expect(r.outcome).toBe("parsed");
    expect(r.publishedAt).toBe("2026-07-24T23:08:59.000Z");
    expect(r.conflicting).toBe(true);
  });

  it("repeated IDENTICAL declarations are not a conflict", () => {
    const html = jsonLd("2026-07-24T23:08:59Z") + jsonLd("2026-07-24T23:08:59+00:00");
    const r = extractDatePublished(html);
    expect(r.outcome).toBe("parsed");
    expect(r.conflicting).toBe(false);
  });
});

describe("extractDeclaredCutoff", () => {
  it("parses the analyst-note label shape and anchors to the report date in ET", () => {
    const r = extractDeclaredCutoff("<p>Data Cutoff: 2:00 PM ET</p>", "2026-07-24");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-07-24T18:00:00.000Z"); // EDT −04:00
    expect(r.dstAmbiguousFirstOccurrence).toBe(false);
    expect(r.patternVersion).toBe(CUTOFF_PATTERN_VERSION);
  });

  it("ignores a neighboring non-cutoff time in the same block", () => {
    const html = "<p>Assessment as of: 6:00 PM ET. Data Cutoff: 12:15 PM ET.</p>";
    const r = extractDeclaredCutoff(html, "2026-06-30");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-06-30T16:15:00.000Z");
  });

  it("accepts the hyphenated lowercase 'data cut-off at' form", () => {
    const r = extractDeclaredCutoff("<p>data cut-off at 2:00 pm ET</p>", "2026-07-24");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-07-24T18:00:00.000Z");
  });

  it("skips tags and entities between label and time", () => {
    const html = `<p><strong>Data Cutoff:</strong>&nbsp;<span>2:00 PM ET</span></p>`;
    const r = extractDeclaredCutoff(html, "2026-07-24");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-07-24T18:00:00.000Z");
  });

  it("a PRIOR-report reference is not a declaration", () => {
    // body prose referring to the previous day's cutoff — must not be read
    // as this report's declared cutoff
    const html = "<li>counted since the last data cutoff at 2:00 PM ET on July 23.</li>";
    const r = extractDeclaredCutoff(html, "2026-07-24");
    expect(r).toMatchObject({ outcome: "absent", cutoffAt: null, cutoffAtMs: null });
  });

  it("a real declaration wins even with a prior-report reference on the page", () => {
    const html =
      "<p>Data Cutoff: 2:00 PM ET</p><li>counted since the previous data cutoff at 11:00 AM ET on July 23.</li>";
    const r = extractDeclaredCutoff(html, "2026-07-24");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-07-24T18:00:00.000Z");
  });

  it("honors an explicit declared date within the 7-day lookback", () => {
    const r = extractDeclaredCutoff("<p>Data Cutoff: 2:00 PM ET on July 23</p>", "2026-07-24");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-07-23T18:00:00.000Z");
  });

  it("resolves a yearless explicit date across a year boundary", () => {
    const r = extractDeclaredCutoff("<p>Data Cutoff: 3:00 PM ET on December 31</p>", "2026-01-02");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2025-12-31T20:00:00.000Z"); // EST −05:00, prior year
  });

  it("an explicit date outside [reportDate−7d, reportDate] is malformed, never guessed", () => {
    for (const day of ["July 1", "July 25"]) {
      const r = extractDeclaredCutoff(`<p>Data Cutoff: 2:00 PM ET on ${day}</p>`, "2026-07-24");
      expect(r).toMatchObject({ outcome: "malformed", cutoffAt: null });
    }
  });

  it("absent without any label; malformed when the label has no parseable ET time", () => {
    expect(extractDeclaredCutoff("<p>synthetic body</p>", "2026-07-24").outcome).toBe("absent");
    for (const bad of [
      "<p>Data Cutoff: soon</p>",
      "<p>Data Cutoff: 25:00 PM ET</p>",
      "<p>Data Cutoff: 2:00 PM GMT</p>",
      "<p>Data Cutoff: 13:70 PM ET</p>",
    ]) {
      const r = extractDeclaredCutoff(bad, "2026-07-24");
      expect(r).toMatchObject({ outcome: "malformed", cutoffAt: null, cutoffAtMs: null });
    }
  });

  it("two valid declarations that DISAGREE are conflicting — fail closed to the next rung", () => {
    const html = "<p>Data Cutoff: 2:00 PM ET</p><p>Data Cutoff: 4:00 PM ET</p>";
    const r = extractDeclaredCutoff(html, "2026-07-24");
    expect(r).toMatchObject({ outcome: "conflicting", cutoffAt: null, cutoffAtMs: null });
  });

  it("repeated identical declarations collapse (desktop/mobile duplication)", () => {
    const html = "<p>Data Cutoff: 2:00 PM ET</p><div><p>Data Cutoff: 2:00 PM ET</p></div>";
    const r = extractDeclaredCutoff(html, "2026-07-24");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-07-24T18:00:00.000Z");
  });

  it("handles the 12 AM/PM edges", () => {
    expect(extractDeclaredCutoff("<p>Data Cutoff: 12:00 PM ET</p>", "2026-07-24").cutoffAt).toBe(
      "2026-07-24T16:00:00.000Z", // noon EDT
    );
    expect(extractDeclaredCutoff("<p>Data Cutoff: 12:30 AM ET</p>", "2026-07-24").cutoffAt).toBe(
      "2026-07-24T04:30:00.000Z", // half past midnight EDT
    );
  });

  it("a cutoff in the spring-forward DST gap yields nonexistent_local_time", () => {
    const r = extractDeclaredCutoff("<p>Data Cutoff: 2:30 AM ET</p>", "2026-03-08");
    expect(r).toMatchObject({ outcome: "nonexistent_local_time", cutoffAt: null });
  });

  it("a cutoff in the repeated fall-back hour takes the first occurrence and says so", () => {
    const r = extractDeclaredCutoff("<p>Data Cutoff: 1:30 AM ET</p>", "2026-11-01");
    expect(r.outcome).toBe("parsed");
    expect(r.cutoffAt).toBe("2026-11-01T05:30:00.000Z"); // EDT, first occurrence
    expect(r.dstAmbiguousFirstOccurrence).toBe(true);
  });

  it("DST governs by date: the same wall time maps differently summer vs winter", () => {
    expect(extractDeclaredCutoff("<p>Data Cutoff: 2:00 PM ET</p>", "2026-07-24").cutoffAt).toBe(
      "2026-07-24T18:00:00.000Z",
    );
    expect(extractDeclaredCutoff("<p>Data Cutoff: 2:00 PM ET</p>", "2026-01-15").cutoffAt).toBe(
      "2026-01-15T19:00:00.000Z",
    );
  });
});

describe("extractReportInstants (combined + ordering diagnostic)", () => {
  const page = (cutoff: string, published: string) =>
    `${jsonLd(published)}<div class="analysts-note"><p>Data Cutoff: ${cutoff}</p></div>`;

  it("extracts both instants and reports a sane ordering", () => {
    const r = extractReportInstants(page("2:00 PM ET", "2026-07-24T23:08:59+00:00"), "2026-07-24");
    expect(r.cutoff.cutoffAt).toBe("2026-07-24T18:00:00.000Z");
    expect(r.published.publishedAt).toBe("2026-07-24T23:08:59.000Z");
    expect(r.cutoffAfterPublication).toBe(false);
  });

  it("cutoff-after-publication is a VISIBLE, NON-REJECTING diagnostic", () => {
    const r = extractReportInstants(page("11:00 PM ET", "2026-07-24T23:08:59Z"), "2026-07-24");
    // 11:00 PM EDT = 03:00Z next day — after publication
    expect(r.cutoff.outcome).toBe("parsed");
    expect(r.cutoff.cutoffAt).toBe("2026-07-25T03:00:00.000Z");
    expect(r.published.outcome).toBe("parsed");
    expect(r.cutoffAfterPublication).toBe(true); // diagnostic only; nothing rejected
  });

  it("no diagnostic when either instant is missing", () => {
    const r = extractReportInstants(`<p>Data Cutoff: 2:00 PM ET</p>`, "2026-07-24");
    expect(r.published.outcome).toBe("absent");
    expect(r.cutoffAfterPublication).toBe(false);
  });

  it("LEGAL: the returned object carries no prose from the input", () => {
    const html =
      `${jsonLd("2026-07-24T23:08:59Z")}<p>Fictional synthetic sentence about invented events. Data Cutoff: 2:00 PM ET</p>`;
    const serialized = JSON.stringify(extractReportInstants(html, "2026-07-24"));
    for (const word of ["Fictional", "synthetic", "sentence", "invented", "events"]) {
      expect(serialized).not.toContain(word);
    }
    // only instants, booleans, and bounded enum/version strings survive
    expect(serialized).toContain("2026-07-24T18:00:00.000Z");
    expect(serialized).toContain(CUTOFF_PATTERN_VERSION);
  });
});
