import { describe, expect, it } from "vitest";
import { referenceFor } from "@/lib/validation/run";
import {
  DESCRIPTOR_LABEL,
  DESCRIPTOR_VERSION,
  ZERO_CITATION_SENTENCE,
  describeSource,
  descriptorScopeForCountry,
  hedgingShares,
  isPlatformRoot,
  type DescriptorSource,
  type DescriptorStats,
} from "./descriptor";

// GOLDEN-FILE TESTS (WS-7.3 acceptance). The descriptor is the artifact a methodology
// validator reads, so the full rendered string is pinned here rather than a substring:
// a wording change has to be made deliberately, in the diff, with the version constant
// in view. If one of these fails, decide whether the sentence changed on purpose — and
// if it did, bump DESCRIPTOR_VERSION.

const RSS_SOURCE: DescriptorSource = {
  canonicalUrl: "https://www.pravda.com.ua/news",
  domain: "pravda.com.ua",
  platform: "independent_media",
  status: "active",
  decayed: false,
};

const RSS_STATS: DescriptorStats = {
  citationCount: 400,
  firstCitedReportDate: "2022-03-04",
  lastCitedReportDate: "2026-08-14",
  hedging: { confirmed: 100, assessed: 80, unknown: 120, claimed: 60, unverified: 40 },
};

const ZERO_HEDGING = { confirmed: 0, assessed: 0, unknown: 0, claimed: 0, unverified: 0 };

describe("descriptor golden text", () => {
  it("renders a cited source: identity, corpus span, hedging profile, ruling-16 note, status, caveat", () => {
    const d = describeSource(RSS_SOURCE, RSS_STATS, { kind: "theater", theater: "ru" });
    expect(d.version).toBe(DESCRIPTOR_VERSION);
    expect(d.label).toBe(DESCRIPTOR_LABEL);
    expect(d.platformRoot).toBe(false);
    expect(d.text).toBe(
      "https://www.pravda.com.ua/news is an independent media outlet. " +
        "Cited in the ISW Russian Offensive Campaign Assessment 400 times between 2022-03-04 and 2026-08-14. " +
        "ISW hedged those citations 25% confirmed (ISW attached geolocation or independent confirmation), " +
        "20% assessed (ISW carried it as its own analytic judgment), " +
        "30% unknown (an unhedged ISW declarative), " +
        "15% claimed (ISW attributed it to the source without confirming it), " +
        "10% unverified (ISW carried it and marked it unconfirmed). " +
        "“unknown” is an unhedged ISW declarative — a statement ISW carried without a hedging cue — " +
        "and is held at mid-trust by design, not a missing classification. " +
        "The registry carries it as active. " +
        "This profile describes how ISW cited and hedged this source, not an independent audit of it; " +
        "BNOW performs no separate verification of the source itself.",
    );
  });

  it("names the Iran Update corpus for the ir theater and the global scope for the aggregate", () => {
    const ir = describeSource(RSS_SOURCE, RSS_STATS, { kind: "theater", theater: "ir" });
    expect(ir.text).toContain("Cited in the ISW/CTP Iran Update 400 times");
    const global = describeSource(RSS_SOURCE, RSS_STATS, { kind: "global" });
    expect(global.text).toContain("Cited in ISW reporting 400 times");
  });

  it("degrades a theater with no named reference corpus rather than throwing (the Gulf lens)", () => {
    // referenceFor() returns null for the Gulf theaters, so those sources render under the
    // global scope in practice; this pins the fallback if a theater key ever reaches here.
    const d = describeSource(RSS_SOURCE, RSS_STATS, { kind: "theater", theater: "sa" });
    expect(d.text).toContain("Cited in the ISW reference corpus for sa 400 times");
  });

  it("renders a zero-citation source as 'no ISW citation history', never 0%-everything", () => {
    const d = describeSource(
      { ...RSS_SOURCE, canonicalUrl: "https://example.org/desk" },
      {
        citationCount: 0,
        firstCitedReportDate: null,
        lastCitedReportDate: null,
        hedging: ZERO_HEDGING,
      },
      { kind: "theater", theater: "ru" },
    );
    expect(d.shares).toEqual([]);
    expect(d.text).toBe(
      "https://example.org/desk is an independent media outlet. " +
        `${ZERO_CITATION_SENTENCE} ` +
        "The registry carries it as active.",
    );
    expect(d.text).not.toContain("0%");
  });

  it("reports an unclassified citation history as a gap, not as a profile", () => {
    const d = describeSource(RSS_SOURCE, { ...RSS_STATS, hedging: ZERO_HEDGING }, { kind: "global" });
    expect(d.shares).toEqual([]);
    expect(d.text).toContain("No hedging classification is recorded for those citations.");
    expect(d.text).not.toContain("%");
  });

  it("omits the ruling-16 note when the source has no unknown-class citations", () => {
    const d = describeSource(
      RSS_SOURCE,
      { ...RSS_STATS, citationCount: 2, hedging: { ...ZERO_HEDGING, confirmed: 1, claimed: 1 } },
      { kind: "global" },
    );
    expect(d.text).toContain("50% confirmed");
    expect(d.text).not.toContain("held at mid-trust by design");
  });

  it("handles a single citation, an absent span and a one-day span", () => {
    const one = describeSource(
      RSS_SOURCE,
      {
        citationCount: 1,
        firstCitedReportDate: "2026-01-02",
        lastCitedReportDate: "2026-01-02",
        hedging: { ...ZERO_HEDGING, confirmed: 1 },
      },
      { kind: "global" },
    );
    expect(one.text).toContain("Cited in ISW reporting 1 time on 2026-01-02.");
    const nospan = describeSource(
      RSS_SOURCE,
      { ...RSS_STATS, firstCitedReportDate: null, lastCitedReportDate: null },
      { kind: "global" },
    );
    expect(nospan.text).toContain("400 times; no citation date span is recorded.");
  });

  it("trims a timestamped date column to the report date", () => {
    const d = describeSource(
      RSS_SOURCE,
      { ...RSS_STATS, firstCitedReportDate: "2022-03-04T00:00:00.000Z" },
      { kind: "global" },
    );
    expect(d.text).toContain("between 2022-03-04 and 2026-08-14");
  });

  it("renders decayed and dead status in the source's own words", () => {
    const decayed = describeSource({ ...RSS_SOURCE, status: "decayed", decayed: true }, RSS_STATS, {
      kind: "global",
    });
    expect(decayed.text).toContain("The registry carries it as decayed");
    const dead = describeSource({ ...RSS_SOURCE, status: "dead", decayed: false }, RSS_STATS, {
      kind: "global",
    });
    expect(dead.text).toContain("The registry carries it as dead");
  });

  it("falls back to the decayed boolean when status is absent or unrecognized", () => {
    const d = describeSource({ ...RSS_SOURCE, status: null, decayed: true }, RSS_STATS, {
      kind: "global",
    });
    expect(d.text).toContain("The registry carries it as decayed");
    const active = describeSource({ ...RSS_SOURCE, status: "wat", decayed: false }, RSS_STATS, {
      kind: "global",
    });
    expect(active.text).toContain("The registry carries it as active");
  });

  it("degrades an unknown platform value instead of throwing", () => {
    const d = describeSource({ ...RSS_SOURCE, platform: "carrier-pigeon" }, RSS_STATS, {
      kind: "global",
    });
    expect(d.text).toContain("is a source of unclassified type.");
  });
});

describe("descriptor — platform roots fail closed (#56)", () => {
  const ROOT: DescriptorSource = {
    canonicalUrl: "https://facebook.com/",
    domain: "facebook.com",
    platform: "other",
    status: "active",
    decayed: false,
  };

  it("renders the caveat and NO hedging profile for a known pooled root", () => {
    const d = describeSource(
      ROOT,
      {
        citationCount: 26_195,
        firstCitedReportDate: "2022-02-24",
        lastCitedReportDate: "2026-08-14",
        hedging: { confirmed: 5000, assessed: 5000, unknown: 6195, claimed: 5000, unverified: 5000 },
      },
      { kind: "theater", theater: "ru" },
    );
    expect(d.platformRoot).toBe(true);
    expect(d.shares).toEqual([]);
    expect(d.text).toBe(
      "https://facebook.com/ is a source of unclassified type. " +
        "Platform root — not a single publisher. This identity pools the citations of many " +
        "distinct pages, so no per-source profile is reported for it (OPEN-TASKS #56). " +
        "The registry carries it as active.",
    );
    expect(d.text).not.toMatch(/%/);
    expect(d.text).not.toContain("26,195");
  });

  it("classifies pooled roots without suppressing ordinary publishers", () => {
    // `canonicalSource()` (src/lib/isw/urls.ts:85-122) keys every non-social source by its
    // BARE HOST, so "has no path segment" cannot be the root test: it would suppress the
    // whole registry. These cases pin the corrected rule in both directions.
    const root = (
      canonicalUrl: string,
      platform: string | null = "other",
      domain: string | null = null,
    ) => isPlatformRoot({ canonicalUrl, domain, platform });

    // known multi-tenant hosts, cited at their root
    expect(root("https://facebook.com/")).toBe(true);
    expect(root("https://www.facebook.com")).toBe(true);
    expect(root("facebook.com")).toBe(true);
    expect(root("t.me", "telegram")).toBe(true);
    expect(root("", "other")).toBe(true); // unparseable identity fails closed
    expect(root("vk.com", "other", "vk.com")).toBe(true);

    // a segmented page BELOW a pooled root is a publisher
    expect(root("facebook.com/GeneralStaff.ua")).toBe(false);
    expect(root("t.me/rybar", "telegram")).toBe(false);
    expect(root("x.com/GeneralStaffUA", "x")).toBe(false);

    // an ordinary outlet keyed by its bare host keeps its profile — the whole point
    expect(root("pravda.com.ua", "independent_media")).toBe(false);
    expect(root("kyivindependent.com", "independent_media")).toBe(false);
    expect(root("mod.gov.ua", "gov")).toBe(false);

    // a per-identity platform with no account segment is pooled whatever host it carries
    expect(root("nitter.example", "x")).toBe(true);
    expect(root("nitter.example/someone", "x")).toBe(false);
  });

  it("never emits a hedging share array for a root, whatever the counts say", () => {
    const d = describeSource(
      { ...ROOT, canonicalUrl: "https://t.me" },
      {
        citationCount: 10,
        firstCitedReportDate: "2026-01-01",
        lastCitedReportDate: "2026-02-01",
        hedging: { ...ZERO_HEDGING, unknown: 10 },
      },
      { kind: "theater", theater: "ru" },
    );
    expect(d.shares).toHaveLength(0);
    expect(d.text).not.toContain("unhedged ISW declarative — ");
  });
});

describe("descriptor — hedging shares", () => {
  it("sums integer percentages to exactly 100 (largest remainder)", () => {
    const shares = hedgingShares({ confirmed: 1, assessed: 1, unknown: 1, claimed: 0, unverified: 0 });
    expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
    expect(shares.map((s) => s.percent)).toEqual([34, 33, 33, 0, 0]);
  });

  it("keeps the registry's display order and returns all five classes", () => {
    const shares = hedgingShares({ confirmed: 7, assessed: 0, unknown: 3, claimed: 0, unverified: 0 });
    expect(shares.map((s) => s.hedging)).toEqual([
      "confirmed",
      "assessed",
      "unknown",
      "claimed",
      "unverified",
    ]);
    expect(shares.map((s) => s.percent)).toEqual([70, 0, 30, 0, 0]);
  });

  it("returns all-zero shares for an empty profile rather than dividing by zero", () => {
    expect(hedgingShares(ZERO_HEDGING).every((s) => s.percent === 0)).toBe(true);
  });

  it("treats a negative or missing count as zero", () => {
    const shares = hedgingShares({ ...ZERO_HEDGING, confirmed: 4, claimed: -3 });
    expect(shares.find((s) => s.hedging === "claimed")?.count).toBe(0);
    expect(shares.find((s) => s.hedging === "confirmed")?.percent).toBe(100);
  });
});

describe("descriptor — ruling 1 sentinel and the moat fields", () => {
  // The registry detail page queries `SELECT * FROM sources`, so a descriptor input can
  // arrive carrying every column of the row — including `meta` jsonb. This fixture hands
  // the template ISW prose and document body text in fields it must never read, and pins
  // that none of it reaches any output string (ruling 1). It also pins that the reliability
  // score cannot ride along: the input types have no such field, so a caller passing one
  // gets it ignored.
  const SENTINEL = "ZZQSENTINELPROSEZZQ";
  const OVERWIDE = {
    ...RSS_SOURCE,
    name: `${SENTINEL} outlet`,
    meta: { takeaway: `Russian forces ${SENTINEL} advanced` },
    content: `${SENTINEL} document body`,
    reliability_score: 0.87,
    reliabilityScore: 0.87,
    hedging_cue: `${SENTINEL} according to`,
  } as unknown as DescriptorSource;

  it("emits no ISW prose, no document content and no reliability score", () => {
    const d = describeSource(OVERWIDE, RSS_STATS, { kind: "theater", theater: "ru" });
    expect(d.text).not.toContain(SENTINEL);
    for (const sentence of d.sentences) expect(sentence).not.toContain(SENTINEL);
    expect(d.text).not.toContain("0.87");
    expect(JSON.stringify(d)).not.toContain(SENTINEL);
    expect(JSON.stringify(d)).not.toContain("0.87");
  });

  it("states no hedging weight constant anywhere (the registry moat field)", () => {
    const d = describeSource(RSS_SOURCE, RSS_STATS, { kind: "global" });
    // confirmed 1.0 · assessed .75 · unknown .5 · claimed .4 · unverified .15
    for (const weight of ["1.0", "0.75", ".75", "0.5", ".5", "0.4", ".4", "0.15", ".15"]) {
      expect(d.text, `weight constant ${weight} leaked`).not.toContain(weight);
    }
  });

  it("never renders a letter grade or a headline score word", () => {
    const d = describeSource(RSS_SOURCE, RSS_STATS, { kind: "global" });
    expect(d.text).not.toMatch(/\b(reliability|score|grade|rating|rank)\b/i);
  });
});

describe("descriptor scope — parity with the authoritative country→corpus map", () => {
  // `referenceFor` (validation/run.ts) decides which ISW corpus a country validates against.
  // The descriptor's scope must not fork from it, or a digest would cite a per-theater
  // citation profile drawn from a corpus its claims were never validated against.
  const COUNTRIES = ["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "cn"];

  it("resolves the same corpus as referenceFor for every live and scaffolded country", () => {
    for (const iso2 of COUNTRIES) {
      const reference = referenceFor(iso2);
      const scope = descriptorScopeForCountry(iso2);
      if (reference) {
        expect(scope, iso2).toEqual({ kind: "theater", theater: reference.theater });
      } else {
        // no daily reference corpus (the Gulf lens) → the global aggregate, never an
        // empty per-theater profile
        expect(scope, iso2).toEqual({ kind: "global" });
      }
    }
  });

  it("is case-insensitive and falls back to the global scope on an unknown code", () => {
    expect(descriptorScopeForCountry("RU")).toEqual({ kind: "theater", theater: "ru" });
    expect(descriptorScopeForCountry("zz")).toEqual({ kind: "global" });
    expect(descriptorScopeForCountry("")).toEqual({ kind: "global" });
  });
});
