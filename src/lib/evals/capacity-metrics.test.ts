// Corpus-v2 capacity diagnostics: report-only metric computation in the map
// and digest scorers, plus the gate-list stability pin (Q5 adjudication:
// these metrics may NOT gate until a decision-log entry promotes them).

import { afterEach, describe, expect, it } from "vitest";
import type { ReduceClaim } from "../analysis/reduce";
import type { DigestEvalCase, MapEvalCase } from "./contracts";
import { QUALITY_GATE_METRICS } from "./gates";
import { scoreMapCase } from "./score-map";
import { scoreDigestCase } from "./score-reduce";

// ---- map ----------------------------------------------------------------------

function capMapCase(tailBucket: "tail" | "mid" = "tail"): MapEvalCase {
  const content = "f".repeat(2000);
  return {
    id: "map-cap-t",
    workload: "map",
    partition: "edge",
    split: "development",
    provenance: "test",
    input: {
      theater: "ua",
      track: "military",
      docs: [
        {
          docId: 1,
          title: null,
          content,
          lang: "en",
          day: "2026-08-01",
          capacity: {
            facts: [
              { key: "f-early", startU16: 100, endU16: 180, positionBucket: "early" },
              { key: "f-tail", startU16: 1700, endU16: 1790, positionBucket: "tail" },
              { key: "f-straddle", startU16: 1450, endU16: 1560, positionBucket: "mid", straddlesDefaultKnob1500: true },
            ],
          },
        },
      ],
    },
    reference: {
      expected: [
        {
          docId: 1,
          claims: [
            {
              textGist: "Drone strike damaged the grain warehouse near the river port",
              hedging: "claimed",
              capacity: { positionBucket: "early", charOffsetU16: 100, factKey: "f-early" },
            },
            {
              // deliberately unproduced by the fixture below — the tail loss
              textGist: "Sappers cordoned a munitions cache under the old depot",
              hedging: "claimed",
              // the bucket-flip kill: the scorer must read the DECLARED
              // bucket, not a hardcoded one
              capacity: { positionBucket: tailBucket, charOffsetU16: 1700, factKey: "f-tail" },
            },
            {
              textGist: "Rail traffic resumed at the junction after overnight repairs",
              hedging: "claimed",
              capacity: { positionBucket: "mid", charOffsetU16: 1450, factKey: "f-straddle" },
            },
          ],
        },
      ],
    },
    offline: { fixtureId: "t", rawOutput: "", expectation: "fail" },
  };
}

const CAP_MAP_OUTPUT = JSON.stringify({
  results: [
    {
      docId: 1,
      claims: [
        {
          text_en: "A drone strike damaged the grain warehouse near the river port.",
          quote_orig: null,
          claim_type: "factual",
          hedging: "claimed",
          event_hint: null,
          entities: [],
        },
        {
          text_en: "Rail traffic resumed at the junction after overnight repairs.",
          quote_orig: null,
          claim_type: "factual",
          hedging: "claimed",
          event_hint: null,
          entities: [],
        },
      ],
    },
  ],
});

describe("map capacity diagnostics (report-only)", () => {
  it("computes positionRecall / straddleRecall / uniqueTailLoss with exact denominators", () => {
    const checks = scoreMapCase(capMapCase(), CAP_MAP_OUTPUT);
    expect(checks.positionRecall).toEqual({
      early: { matched: 1, expected: 1 },
      mid: { matched: 1, expected: 1 },
      tail: { matched: 0, expected: 1 },
      "deep-tail": { matched: 0, expected: 0 },
    });
    expect(checks.straddleRecall).toEqual({ matched: 1, expected: 1 });
    // the tail fact is declared in exactly one doc and its claim went
    // unmatched — a unique-tail loss
    expect(checks.uniqueTailLoss).toEqual({ lost: 1, uniqueTail: 1 });
    // report-only: the tail miss shows up as ordinary recall failure, never
    // as a capacity-named failure string
    expect(checks.failures.some((f) => f.includes("positionRecall") || f.includes("uniqueTail"))).toBe(false);
  });

  it("moves the bucket cell when the declared bucket changes (no hardcoding)", () => {
    const checks = scoreMapCase(capMapCase("mid"), CAP_MAP_OUTPUT);
    expect(checks.positionRecall?.tail).toEqual({ matched: 0, expected: 0 });
    expect(checks.positionRecall?.mid).toEqual({ matched: 1, expected: 2 });
  });

  it("leaves the metrics undefined when no claim carries capacity metadata", () => {
    const c = capMapCase();
    for (const cl of c.reference.expected[0].claims) delete cl.capacity;
    const checks = scoreMapCase(c, CAP_MAP_OUTPUT);
    expect(checks.positionRecall).toBeUndefined();
    expect(checks.straddleRecall).toBeUndefined();
    expect(checks.uniqueTailLoss).toBeUndefined();
  });
});

// ---- digest -------------------------------------------------------------------

const OBJ = [
  "The grain silo", "A rail spur", "The pumping station", "A ferry pier", "The transformer yard",
  "A quarry office", "The bakery annex", "A tram depot", "The cannery gate", "A weather mast",
  "The brick kiln", "A sawmill shed", "The cold store", "A grain barge", "The signal tower",
  "A bus garage", "The print works", "A fish hatchery", "The lime works", "A pontoon ramp",
];
const VERB = [
  "lost power for an hour", "reopened after inspection", "reported minor flooding",
];

function fedClaims(n: number): ReduceClaim[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1001 + i,
    docId: 5001 + i,
    textEn: `${OBJ[i % 20]} ${VERB[Math.floor(i / 20)]} at Zarn${i}ovel.`,
    quoteOrig: null,
    quoteVerified: false,
    claimType: "factual" as const,
    hedging: "claimed" as const,
    entities: [],
    eventHint: null,
    claimDate: "2026-09-01",
    sourceDomain: `wire${i}.example`,
    sourceKey: null,
    reliability: Math.round((0.9 - 0.002 * i) * 1000) / 1000,
    adapter: "rss",
    platform: null,
    publishedAt: null,
  }));
}

function capDigestCase(claims: ReduceClaim[], meta: DigestEvalCase["capacityMeta"]): DigestEvalCase {
  return {
    id: "dig-cap-t",
    workload: "digest",
    partition: "edge",
    split: "development",
    provenance: "test",
    input: { theater: "ua", track: "military", date: "2026-09-01", claims },
    reference: {},
    offline: { fixtureId: "t", votes: [], expectation: "pass" },
    capacityMeta: meta,
  };
}

const vote = (events: unknown[]) => JSON.stringify({ events });

describe("digest capacity diagnostics (report-only)", () => {
  afterEach(() => {
    delete process.env.REDUCE_GROUPS_FED;
  });

  it("tailEventRecall separates survived/fed from unfed; lateDocumentRecall cites via representative text", () => {
    process.env.REDUCE_GROUPS_FED = "50";
    const claims = fedClaims(60);
    // rank order == claim order (singletons, strictly descending reliability):
    // rank 10 = id 1010 (fed under 50), rank 55 = id 1055 (unfed)
    const rank10 = claims[9];
    const ev = {
      title: "Report from the northern district",
      type: "strike",
      summary: "A facility outage was reported.",
      claims: [{ text: rank10.textEn, gids: [rank10.id] }],
    };
    const votes = [vote([ev]), vote([ev]), vote([ev]), vote([ev]), vote([ev])];
    const { checks } = scoreDigestCase(
      capDigestCase(claims, {
        exactReduceGroupsFed: 50,
        decisiveEvents: [
          { rank: 10, titlePattern: "northern district" },
          { rank: 55, titlePattern: "never survives" },
        ],
        lateClaimIds: [rank10.id, claims[54].id],
      }),
      votes,
    );
    // 60 textually distinct singletons under fed cutoff 50
    expect(checks.groupsFed).toBe(50);
    expect(checks.tailEventRecall).toEqual({ survived: 1, fed: 1, unfed: 1 });
    expect(checks.lateDocumentRecall).toEqual({ cited: 1, total: 1, unfed: 1 });
    // report-only: no capacity-named failure strings
    expect(checks.failures.filter((f) => f.includes("tailEvent") || f.includes("lateDocument"))).toEqual([]);
  });

  it("leaves the metrics undefined without capacityMeta or on pipeline refusal", () => {
    const claims = fedClaims(3);
    const none = scoreDigestCase(capDigestCase(claims, undefined), [
      vote([]), vote([]), vote([]), vote([]), vote([]),
    ]);
    expect(none.checks.tailEventRecall).toBeUndefined();

    const refused = scoreDigestCase(
      capDigestCase(claims, { decisiveEvents: [{ rank: 1, titlePattern: "x" }] }),
      ["not json", "{", ""],
    );
    expect(refused.checks.pipelineRefusal).toBe(true);
    expect(refused.checks.tailEventRecall).toBeUndefined();
  });
});

// ---- gate-list stability ------------------------------------------------------

describe("QUALITY_GATE_METRICS stability (Q5)", () => {
  it("capacity diagnostics are NOT gate metrics; promoting one is a visible act", () => {
    expect(QUALITY_GATE_METRICS).toEqual({
      map: ["recallMean", "precisionMean"],
      reduce: ["checksPassRate"],
      digest: ["checksPassRate"],
      validation: ["matchSetPrecision", "matchSetRecall"],
    });
  });
});
