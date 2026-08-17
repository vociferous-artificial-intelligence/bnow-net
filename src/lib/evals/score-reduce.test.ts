import { describe, expect, it } from "vitest";
import type { DigestEvalCase, ReduceEvalCase } from "./contracts";
import { evidenceRecencySummary, parseInstant } from "./evidence-recency-summary";
import { scoreDigestCase, scoreReduceCase } from "./score-reduce";

// ---- fixture builders ----------------------------------------------------------

function rc(id: number, docId: number, textEn: string, o: Partial<ReduceEvalCase["input"]["claims"][number]> = {}) {
  return {
    id,
    docId,
    textEn,
    quoteOrig: null,
    quoteVerified: false,
    claimType: "factual" as const,
    hedging: "claimed" as const,
    entities: [],
    eventHint: null,
    claimDate: "2026-08-05",
    sourceDomain: null,
    sourceKey: null,
    reliability: null,
    adapter: "rss",
    platform: null,
    publishedAt: null,
    ...o,
  };
}

function reduceCase(
  claims: ReduceEvalCase["input"]["claims"],
  reference: ReduceEvalCase["reference"],
  extraInput: Partial<ReduceEvalCase["input"]> = {},
): ReduceEvalCase {
  return {
    id: "red-t",
    workload: "reduce",
    partition: "typical",
    split: "development",
    provenance: "test",
    input: { theater: "ua", track: "military", claims, ...extraInput },
    reference,
    offline: { expectation: "pass" },
  };
}

function digestCase(
  claims: DigestEvalCase["input"]["claims"],
  reference: DigestEvalCase["reference"],
): DigestEvalCase {
  return {
    id: "dig-t",
    workload: "digest",
    partition: "typical",
    split: "development",
    provenance: "test",
    input: { theater: "ua", track: "military", date: "2026-08-05", claims },
    reference,
    offline: { fixtureId: "t", votes: [], expectation: "pass" },
  };
}

const vote = (events: unknown[]) => JSON.stringify({ events });

// ---- reduce -------------------------------------------------------------------

describe("scoreReduceCase", () => {
  it("verifies merge + corroboration promotion through the REAL clusterClaims", () => {
    const claims = [
      rc(1, 101, "A drone strike damaged the oil depot near the port, causing a large fire.", {
        eventHint: "port oil depot drone strike", sourceDomain: "a.example", reliability: 0.8,
      }),
      rc(2, 102, "Drone strike set fire to an oil depot near the port.", {
        eventHint: "port oil depot strike", sourceDomain: "b.example", reliability: 0.4,
      }),
    ];
    const { checks } = scoreReduceCase(
      reduceCase(claims, {
        expectTogether: [[1, 2]],
        expectGroupCount: 1,
        expectGroups: [{ memberId: 1, hedging: "confirmed", promoted: true, independentSources: 2 }],
      }),
    );
    expect(checks.pass).toBe(true);
    expect(checks.reproducible).toBe(true);
  });

  it("fails loudly when an expectApart pair merges", () => {
    const claims = [
      rc(1, 101, "A drone strike damaged the oil depot near the port.", { sourceDomain: "a.example" }),
      rc(2, 102, "A drone strike damaged the oil depot near the port.", { sourceDomain: "b.example" }),
    ];
    const { checks } = scoreReduceCase(reduceCase(claims, { expectApart: [[1, 2]] }));
    expect(checks.pass).toBe(false);
    expect(checks.apartViolations).toBe(1);
  });

  it("mirror docs never count as independent corroboration", () => {
    const claims = [
      rc(1, 101, "Sources claim the highway checkpoint was seized at dawn.", { sourceDomain: "a.example" }),
      rc(2, 102, "Sources claim the checkpoint on the highway was seized at dawn.", { sourceDomain: "b.example" }),
    ];
    const { checks } = scoreReduceCase(
      reduceCase(claims, {
        expectGroups: [{ memberId: 1, promoted: false, independentSources: 1, hedging: "claimed" }],
      }, { mirrorOf: [[102, 101]] }),
    );
    expect(checks.pass).toBe(true);
  });

  it("enforces the ruling-12 day gate on identical distant-day text", () => {
    const claims = [
      rc(1, 101, "Nightly report: artillery fire recorded along the northern axis.", { claimDate: "2026-08-01" }),
      rc(2, 102, "Nightly report: artillery fire recorded along the northern axis.", { claimDate: "2026-08-04" }),
    ];
    const { checks } = scoreReduceCase(reduceCase(claims, { expectApart: [[1, 2]], expectGroupCount: 2 }));
    expect(checks.pass).toBe(true);
  });

  it("drops meta-claims but keeps world-state quiet-day claims", () => {
    const claims = [
      rc(1, 101, "No significant military claims found in this document."),
      rc(2, 102, "No significant developments occurred along the Kupyansk axis on Friday."),
    ];
    const { checks } = scoreReduceCase(
      reduceCase(claims, { expectMetaDropped: [1], expectGroupCount: 1, expectGroups: [{ memberId: 2 }] }),
    );
    expect(checks.pass).toBe(true);
    expect(checks.metaDropped).toBe(1);
  });
});

// ---- evidence recency ----------------------------------------------------------

describe("evidenceRecencySummary", () => {
  it("treats timezone-less timestamps as missing (deterministic, never local-time)", () => {
    expect(parseInstant("2026-08-10T06:00:00")).toBeNull();
    expect(parseInstant("2026-08-10T06:00:00Z")).not.toBeNull();
    expect(parseInstant("2026-08-10T06:00:00+03:00")).not.toBeNull();
  });

  it("counts negative ingestion lag as invalid and future publishes separately", () => {
    const s = evidenceRecencySummary(
      [
        { docId: 1, publishedAt: "2026-08-10T08:00:00Z", fetchedAt: "2026-08-10T07:00:00Z" }, // negative lag
        { docId: 2, publishedAt: "2026-08-11T00:00:00Z", fetchedAt: "2026-08-10T11:00:00Z" }, // future publish
        { docId: 3, publishedAt: "2026-08-10T06:00:00", fetchedAt: null }, // zone-less -> missing
      ],
      "2026-08-10T12:00:00Z",
    );
    expect(s.invalidIngestionLagCount).toBe(2); // doc 2's lag is also negative
    expect(s.futurePublishedTimestampCount).toBe(1);
    expect(s.missingTimestampCount).toBe(1);
    expect(s.fetchedTimestampFallbackUsed).toBe(1); // future publish falls back to fetchedAt
  });

  it("matches a hand-computed population (median/p90/within-24h)", () => {
    const s = evidenceRecencySummary(
      [
        { docId: 1, publishedAt: "2026-08-10T06:00:00Z", fetchedAt: null }, // 6h
        { docId: 2, publishedAt: "2026-08-09T12:00:00Z", fetchedAt: null }, // 24h
        { docId: 3, publishedAt: "2026-08-07T12:00:00Z", fetchedAt: null }, // 72h
        { docId: 4, publishedAt: "2026-08-10T09:00:00Z", fetchedAt: null }, // 3h
      ],
      "2026-08-10T12:00:00Z",
    );
    expect(s.medianEvidenceAgeHours).toBe(15);
    // canonical linear-interpolation percentile (src/lib/analysis/evidence-recency.ts):
    // ages [3,6,24,72], rank 0.9*(4-1)=2.7 -> 24 + 0.7*(72-24) = 57.6
    expect(s.p90EvidenceAgeHours).toBe(57.6);
    expect(s.evidenceWithin24hPct).toBe(75);
  });

  it("applies the canonical clock-skew tolerance (within-skew future clamps, not an anomaly)", () => {
    const s = evidenceRecencySummary(
      [
        // published 2 minutes past asOf — inside EVIDENCE_CLOCK_SKEW_MS: age
        // clamps to 0 and it is NOT counted futurePublished
        { docId: 1, publishedAt: "2026-08-10T12:02:00Z", fetchedAt: null },
        // fetched 2 minutes before published — within-skew negative lag clamps
        // to 0 and counts as a valid lag, not invalid
        { docId: 2, publishedAt: "2026-08-10T08:00:00Z", fetchedAt: "2026-08-10T07:58:00Z" },
      ],
      "2026-08-10T12:00:00Z",
    );
    expect(s.futurePublishedTimestampCount).toBe(0);
    expect(s.publishedTimestampUsed).toBe(2);
    expect(s.invalidIngestionLagCount).toBe(0);
    expect(s.medianIngestionLagHours).toBe(0);
  });

  it("refuses a timezone-less asOf outright", () => {
    expect(() => evidenceRecencySummary([], "2026-08-10T12:00:00")).toThrow(/explicit timezone/);
  });
});

// ---- digest -------------------------------------------------------------------

const CLAIM_A = rc(201, 301, "Drone strike damaged the fuel depot at the rail junction.", {
  eventHint: "fuel depot strike", sourceDomain: "a.example", reliability: 0.7,
});
const CLAIM_B = rc(202, 302, "Air defense intercepted twelve drones over the western district.", {
  eventHint: "western district intercepts", sourceDomain: "b.example", reliability: 0.6,
});

const EV_A = {
  title: "Sources report strikes at the rail junction",
  type: "strike",
  summary: "A drone strike reportedly damaged the fuel depot.",
  claims: [{ text: "Sources claim a drone strike damaged the fuel depot at the rail junction.", gids: [201] }],
};
const EV_B = {
  title: "Sources report drone intercepts",
  type: "strike",
  summary: "Air defense reportedly intercepted twelve drones.",
  claims: [{ text: "Air defense reportedly intercepted twelve drones over the western district.", gids: [202] }],
};

describe("scoreDigestCase", () => {
  it("enforces majority survival exactly like production mergeVotes (3-of-5 lives, 2-of-5 dies)", () => {
    const votes = [vote([EV_A]), vote([EV_A]), vote([EV_A]), vote([EV_B]), vote([EV_B])];
    const { checks } = scoreDigestCase(
      digestCase([CLAIM_A, CLAIM_B], {
        expectSurvivingTitles: ["rail junction"],
        expectDeadTitles: ["intercept"],
        expectEventCount: 1,
      }),
      votes,
    );
    expect(checks.pass).toBe(true);
    expect(checks.votesUsable).toBe(5);
    expect(checks.reproducible).toBe(true);
  });

  it("refuses the digest when usable votes fall below the majority (like synthesize.ts)", () => {
    const votes = [vote([EV_A]), "", "not json", "{", vote([EV_A])];
    const { checks } = scoreDigestCase(
      digestCase([CLAIM_A], { expectPipelineRefusal: true }),
      votes,
    );
    expect(checks.pass).toBe(true);
    expect(checks.pipelineRefusal).toBe(true);
    expect(checks.failedVotes).toBe(3);
  });

  it("counts out-of-set gid refs stripped by the REAL parseVote", () => {
    const bad = {
      ...EV_A,
      claims: [{ text: EV_A.claims[0].text, gids: [201, 999] }],
    };
    const votes = [vote([bad]), vote([bad]), vote([bad]), vote([bad]), vote([bad])];
    const { checks } = scoreDigestCase(
      digestCase([CLAIM_A], { expectDroppedGidRefs: 5, expectEventCount: 1 }),
      votes,
    );
    expect(checks.pass).toBe(true);
    expect(checks.droppedGidRefs).toBe(5);
  });

  it("applies the REAL publication guard: a dropped reputational allegation's prose never survives", () => {
    const confirmed = rc(251, 351, "Geolocated footage confirms the ammunition depot was destroyed.", {
      hedging: "confirmed", quoteVerified: true, sourceDomain: "geo.example", reliability: 0.9,
      eventHint: "ammunition depot destroyed",
    });
    const allegation = rc(252, 352, "A regional channel claimed colonel Pavel Streshnev embezzled fuel funds.", {
      sourceDomain: "b.example", reliability: 0.3, eventHint: "Streshnev embezzlement claim",
      entities: [{ name: "Pavel Streshnev", kind: "person", role: "defendant" }],
    });
    const evX = {
      title: "Depot destroyed amid Streshnev embezzlement speculation",
      type: "strike",
      summary: "Speculation ties colonel Pavel Streshnev to embezzled fuel funds.",
      claims: [
        { text: "Geolocated footage confirms the ammunition depot was destroyed.", gids: [251] },
        { text: "Colonel Pavel Streshnev embezzled fuel funds, a regional channel claimed.", gids: [252] },
      ],
    };
    const votes = Array.from({ length: 5 }, () => vote([evX]));
    const { checks } = scoreDigestCase(
      digestCase([confirmed, allegation], {
        expectGuardStats: { droppedClaims: 1, retitledEvents: 1, replacedSummaries: 1 },
        mustNotMatch: ["Streshnev", "embezzl"],
        expectHedging: [{ textMatch: "ammunition depot", hedging: "confirmed" }],
      }),
      votes,
    );
    expect(checks.pass).toBe(true);
    expect(checks.guardStats?.droppedClaims).toBe(1);
    expect(checks.mustNotMatchHits).toEqual([]);
  });

  it("candidateInvariantOnly skips fixture-conditional expectations but keeps safety patterns", () => {
    // votes that produce a DIFFERENT event count than the fixture expectation:
    // a live candidate is not judged on the fixture-authored counts...
    const votes = Array.from({ length: 5 }, () => vote([EV_A]));
    const { checks } = scoreDigestCase(
      digestCase([CLAIM_A, CLAIM_B], {
        expectEventCount: 2, // would fail an offline run
        mustNotMatch: ["forbidden-phrase"],
      }),
      votes,
      { candidateInvariantOnly: true },
    );
    expect(checks.pass).toBe(true); // ...but the safety pattern still applies:
    const withBad = Array.from({ length: 5 }, () =>
      vote([{ ...EV_A, claims: [{ text: "This forbidden-phrase slipped through, sources said.", gids: [201] }] }]),
    );
    const { checks: bad } = scoreDigestCase(
      digestCase([CLAIM_A], { mustNotMatch: ["forbidden-phrase"] }),
      withBad,
      { candidateInvariantOnly: true },
    );
    expect(bad.pass).toBe(false);
    expect(bad.mustNotMatchHits).toEqual(["forbidden-phrase"]);
  });
});
