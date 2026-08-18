// Contribution helpers (§7): multi-label buckets, mirror exclusion, and the
// disclosed non-additive totals. End-to-end semantics (once-per-headline,
// retention separation) are pinned in scorer.test.ts / the acceptance loop.

import { describe, expect, it } from "vitest";
import { contributionByUnit, contributionTotals, type ContributingClaim } from "./contribution";
import type { CandidateDoc } from "./evidence-records";

let docSeq = 95000;
function doc(sourceDomain: string, mirrorOfDocId: number | null = null): CandidateDoc {
  docSeq += 1;
  return {
    docId: docSeq,
    adapter: "rss",
    platform: null,
    sourceDomain,
    publishedAt: "2026-08-10T06:00:00Z",
    fetchedAt: "2026-08-10T07:00:00Z",
    mirrorOfDocId,
    sourceLanguage: null,
  };
}

function claim(claimId: number, theater: string, docs: CandidateDoc[]): ContributingClaim {
  return { claimId, theater, track: "military", docs };
}

describe("contributionByUnit", () => {
  it("dedupes and sorts theaters/tracks/sources; mirror docs never contribute a source", () => {
    const original = doc("origin.example");
    const input = new Map([
      [
        "u0",
        [
          claim(1, "ua", [original, doc("mirror-domain.example", original.docId)]),
          claim(2, "ru", [doc("origin.example")]),
        ],
      ],
    ]);
    expect(contributionByUnit(input)).toEqual({
      u0: {
        theaters: ["ru", "ua"],
        tracks: ["military"],
        sources: ["origin.example"], // mirror-domain.example excluded; dupes collapsed
      },
    });
  });

  it("empty inputs produce empty tables (matched-nothing days stay honest)", () => {
    expect(contributionByUnit(new Map())).toEqual({});
    expect(contributionTotals({})).toEqual({
      nonAdditive: true,
      byTheater: {},
      byTrack: {},
      bySource: {},
    });
  });
});

describe("contributionTotals", () => {
  it("counts DISTINCT matched units per bucket; totals are non-additive by declaration", () => {
    const totals = contributionTotals({
      u0: { theaters: ["ru", "ua"], tracks: ["military"], sources: ["a.example"] },
      u1: { theaters: ["ua"], tracks: ["military"], sources: ["a.example", "b.example"] },
    });
    expect(totals).toEqual({
      nonAdditive: true,
      byTheater: { ru: 1, ua: 2 },
      byTrack: { military: 2 },
      bySource: { "a.example": 2, "b.example": 1 },
    });
    // ua(2) + ru(1) = 3 > 2 matched units: the disclosed §7 shape — bucket
    // sums never claim to equal the headline numerator
    const sum = Object.values(totals.byTheater).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(2);
  });
});
