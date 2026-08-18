// Pure-scorer unit tests (Phase 4): fail-closed match acceptance, §7
// contribution semantics, denominator integrity, stamps, and the
// three-variant result union. The fixture-corpus acceptance loop lives in
// scorer-acceptance.test.ts; this file exercises the scorer against
// synthetic assemblies and deliberately misbehaving matchers.

import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  assertPersistableConflictResultV1,
  type ConflictResultV1,
  type ConflictScoredResultV1,
} from "./eval-profile";
import {
  assembleCorpusRecallEvidence,
  assemblePublishedRetentionEvidence,
  type EvidenceRequest,
} from "./evidence-assembler";
import type { CandidateClaim } from "./evidence-records";
import type {
  ConflictMatcher,
  ConflictMatchOutcome,
  MatchableUnit,
  UnitClaimMatch,
} from "./match-contract";
import { scoreConflictReport, type ConflictScoreRequest } from "./scorer";
import type { EvaluationKind } from "./vocabulary";

// ---------------------------------------------------------------------------
// Synthetic wiring (fictional content per house rules)
// ---------------------------------------------------------------------------

const REPORT = {
  series: "roca",
  editionKey: "roca:2026-08-10:final",
  reportDate: "2026-08-10",
  cutoffAt: "2026-08-10T19:45:00Z",
  publishedAt: "2026-08-10T23:30:00Z",
};

function unit(
  unitId: string,
  ordinal: number,
  text: string,
  overrides: Partial<MatchableUnit> = {},
): MatchableUnit {
  return { unitId, ordinal, text, lane: "frontline_maneuver", compound: false, negative: false, ...overrides };
}

const U0 = unit("u0", 0, "Synthetic forces repelled invented assaults northwest of Kupiansk.");
const U1 = unit("u1", 1, "Synthetic units advanced marginally near Siversk.", {});

let docSeq = 90000;
function claim(
  claimId: number,
  theater: string,
  text: string,
  overrides: Partial<CandidateClaim> = {},
): CandidateClaim {
  docSeq += 1;
  return {
    claimId,
    theater,
    track: "military",
    text,
    hedging: "claimed",
    claimDate: "2026-08-10",
    docs: [
      {
        docId: docSeq,
        adapter: "rss",
        platform: null,
        sourceDomain: `synthetic-${theater}.example`,
        publishedAt: "2026-08-10T06:00:00Z",
        fetchedAt: "2026-08-10T07:00:00Z",
        mirrorOfDocId: null,
        sourceLanguage: null,
      },
    ],
    engine: "mapreduce",
    currentExtractorVersion: true,
    extractorVersion: null,
    published: true,
    stub: false,
    sourceReliability: null,
    ...overrides,
  };
}

const UA_CLAIM = claim(1, "ua", "Ukrainian units repelled mechanized assaults northwest of Kupiansk on August 10.");
const RU_CLAIM = claim(2, "ru", "Russian channels claimed assaults northwest of Kupiansk were repelled on August 10.");
const UNPUBLISHED = claim(3, "ua", "Ukrainian units reportedly repelled an assault near Siversk on August 10.", { published: false });

async function assemblies(claims: readonly CandidateClaim[], kind: EvaluationKind = "retrospective") {
  const request: EvidenceRequest = {
    conflictId: "russia_ukraine",
    kind,
    report: { ...REPORT },
    snapshot: null,
  };
  const source = {
    corpusRecallCandidates: async () => claims,
    publishedRetentionCandidates: async () => claims.filter((c) => c.published),
  };
  return {
    corpus: await assembleCorpusRecallEvidence(request, source),
    retention: await assemblePublishedRetentionEvidence(request, source),
  };
}

function request(units: readonly MatchableUnit[], kind: EvaluationKind = "retrospective"): ConflictScoreRequest {
  return {
    conflictId: "russia_ukraine",
    evaluationKind: kind,
    report: { ...REPORT, units },
    gap: null,
  };
}

function fakeOracle(pairs: readonly UnitClaimMatch[]): ConflictMatcher {
  return {
    kind: "fixture-oracle",
    match: async (): Promise<ConflictMatchOutcome> => ({
      label: "fixture-oracle",
      matches: pairs,
      voteRounds: null,
      votesK: null,
      votes: null,
      keywordUnmatchable: null,
      model: null,
    }),
  };
}

function full(unitId: string, claimId: number): UnitClaimMatch {
  return { unitId, claimId, coverage: "full", confidence: null };
}

function expectScored(result: ConflictResultV1): ConflictScoredResultV1 {
  if (result.state !== "scored") throw new Error(`expected scored, got ${result.state}`);
  return result;
}

// ---------------------------------------------------------------------------

describe("fail-closed match acceptance", () => {
  it("REFUSES a match naming a claim outside the scored population (no out-of-scope rescue)", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    await expect(
      scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 777)])),
    ).rejects.toThrowError(/not a member of the scored population/);
  });

  it("an UNPUBLISHED claim is a corpus member but NOT a retention member — a pair to it never rescues retention", async () => {
    const { corpus, retention } = await assemblies([UNPUBLISHED]);
    // the oracle pair applies wherever the claim is a member: corpus only
    const soleUnit = unit("u1", 0, U1.text);
    const result = expectScored(
      await scoreConflictReport(
        request([soleUnit]),
        corpus,
        retention,
        // population filtering is the ORACLE's job in fixture-matcher.ts;
        // this fake applies the same rule inline
        {
          kind: "fixture-oracle",
          match: async (units, claims): Promise<ConflictMatchOutcome> => ({
            label: "fixture-oracle",
            matches: claims.some((c) => c.claimId === 3) ? [full("u1", 3)] : [],
            voteRounds: null,
            votesK: null,
            votes: null,
            keywordUnmatchable: null,
            model: null,
          }),
        },
      ),
    );
    expect(result.corpusRecall).toEqual({ u1: "matched" });
    expect(result.publishedRetention).toEqual({ u1: "miss" });
    expect(result.headline.corpusRecall).toEqual({ matched: 1, denominator: 1 });
    expect(result.headline.publishedRetention).toEqual({ matched: 0, denominator: 1 });
  });

  it("REFUSES matches on undeclared units, duplicate pairs, and partial coverage on non-compound units", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    await expect(
      scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("uX", 1)])),
    ).rejects.toThrowError(/undeclared unit/);
    await expect(
      scoreConflictReport(
        request([U0]),
        corpus,
        retention,
        fakeOracle([full("u0", 1), full("u0", 1)]),
      ),
    ).rejects.toThrowError(/duplicate match pair/);
    await expect(
      scoreConflictReport(
        request([U0]),
        corpus,
        retention,
        fakeOracle([{ unitId: "u0", claimId: 1, coverage: "partial", confidence: null }]),
      ),
    ).rejects.toThrowError(/partial is the compound-bullet diagnostic/);
  });

  it("REFUSES full coverage on a compound unit from any non-oracle matcher kind", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const compound = unit("u0", 0, U0.text, { compound: true });
    const buggyAdapter: ConflictMatcher = {
      kind: "llm-compatible",
      match: async (): Promise<ConflictMatchOutcome> => ({
        label: "llm",
        matches: [full("u0", 1)],
        voteRounds: 1,
        votesK: 5,
        votes: [{ unitId: "u0", votes: [1], final: 1 }],
        keywordUnmatchable: null,
        model: null,
      }),
    };
    await expect(
      scoreConflictReport(request([compound]), corpus, retention, buggyAdapter),
    ).rejects.toThrowError(/only the fixture oracle/);
    // the ORACLE may attest full compound coverage (its table carries it)
    const oracle = fakeOracle([full("u0", 1)]);
    const scored = expectScored(
      await scoreConflictReport(request([compound]), corpus, retention, oracle),
    );
    expect(scored.corpusRecall.u0).toBe("matched");
  });

  it("REFUSES a result mixing the fixture oracle with a ladder rung across populations", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    let call = 0;
    const mixed: ConflictMatcher = {
      kind: "fixture-oracle",
      match: async (): Promise<ConflictMatchOutcome> => {
        call += 1;
        return {
          label: call === 1 ? "fixture-oracle" : "keyword",
          matches: [],
          voteRounds: null,
          votesK: null,
          votes: null,
          keywordUnmatchable: call === 1 ? null : 0,
          model: null,
        };
      },
    };
    await expect(
      scoreConflictReport(request([U0]), corpus, retention, mixed),
    ).rejects.toThrowError(/mix the fixture oracle with a ladder rung/);
  });
});

describe("contribution (§7: multi-label, non-additive, corpus-recall population)", () => {
  it("a unit matched from two theaters credits BOTH buckets while counting ONCE in the headline", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM, RU_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(
        request([U0]),
        corpus,
        retention,
        fakeOracle([full("u0", 1), full("u0", 2)]),
      ),
    );
    expect(result.headline.corpusRecall).toEqual({ matched: 1, denominator: 1 });
    expect(result.contribution.u0.theaters).toEqual(["ru", "ua"]);
    expect(result.contribution.u0.tracks).toEqual(["military"]);
    expect(result.contribution.u0.sources).toEqual([
      "synthetic-ru.example",
      "synthetic-ua.example",
    ]);
    // totals count DISTINCT matched units per bucket; they are disclosed
    // non-additive and may exceed the headline numerator in aggregate
    expect(result.contributionTotals).toEqual({
      nonAdditive: true,
      byTheater: { ru: 1, ua: 1 },
      byTrack: { military: 1 },
      bySource: { "synthetic-ru.example": 1, "synthetic-ua.example": 1 },
    });
    // bucket sum (2) exceeds the headline numerator (1): the §7 shape
    const bucketSum = Object.values(result.contributionTotals!.byTheater).reduce((a, b) => a + b, 0);
    expect(bucketSum).toBeGreaterThan(result.headline.corpusRecall.matched);
  });

  it("partial-verdict units earn NO contribution; retention derives its own table separately", async () => {
    const compound = unit("u0", 0, U0.text, { compound: true });
    const { corpus, retention } = await assemblies([UA_CLAIM, UNPUBLISHED]);
    const result = expectScored(
      await scoreConflictReport(
        request([compound, U1]),
        corpus,
        retention,
        {
          kind: "fixture-oracle",
          match: async (units, claims): Promise<ConflictMatchOutcome> => ({
            label: "fixture-oracle",
            matches: [
              { unitId: "u0", claimId: 1, coverage: "partial", confidence: null },
              ...(claims.some((c) => c.claimId === 3) ? [full("u1", 3)] : []),
            ],
            voteRounds: null,
            votesK: null,
            votes: null,
            keywordUnmatchable: null,
            model: null,
          }),
        },
      ),
    );
    expect(result.corpusRecall).toEqual({ u0: "partial", u1: "matched" });
    expect(result.headline.corpusRecall).toEqual({ matched: 1, denominator: 2 });
    expect(result.headline.partialDiagnostic).toBe(1);
    // partial u0 contributes nothing; matched u1 (corpus recall) does
    expect(Object.keys(result.contribution)).toEqual(["u1"]);
    // retention never saw claim 3 (unpublished): its own table is empty
    expect(result.contributionPublishedRetention).toEqual({});
  });

  it("one claim matching two units is VISIBLE in multiUnitClaims", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(
        request([U0, U1]),
        corpus,
        retention,
        fakeOracle([full("u0", 1), full("u1", 1)]),
      ),
    );
    expect(result.multiUnitClaims!.corpusRecall).toEqual({ "1": ["u0", "u1"] });
    expect(result.headline.corpusRecall).toEqual({ matched: 2, denominator: 2 });
  });
});

describe("stamps and result variants", () => {
  it("every scored result passes the binding persistability gate; a stripped stamp fails it", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 1)])),
    );
    assertPersistableConflictResultV1(result);
    const stripped = { ...result };
    delete (stripped as Record<string, unknown>).window;
    expect(() => assertPersistableConflictResultV1(stripped)).toThrowError(
      /MUST NOT be persisted/,
    );
    const relabeled = { ...result, matcherRung: "llm-majority" as const };
    expect(() => assertPersistableConflictResultV1(relabeled)).toThrowError(/disagrees/);
  });

  it("window/selection/versions/matcher/runGroupKey/snapshot stamps carry the audit inputs", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 1)])),
    );
    expect(result.window).toMatchObject({
      reportDate: "2026-08-10",
      cutoffAtRaw: REPORT.cutoffAt,
      publishedAtRaw: REPORT.publishedAt,
      cutoffTreatment: "present",
      publishedTreatment: "present",
      windowEndSource: "cutoff",
      startDate: "2026-08-08",
      endDate: "2026-08-10",
      days: 3,
    });
    expect(result.selection!.limits).toMatchObject({ maxCandidates: 100 });
    expect(result.selection!.corpusRecall.eligibleCount).toBe(1);
    expect(result.versions).toEqual({
      actorRosterVersion: "ru-ua-roster-v1",
      laneClassifierVersion: "ru-ua-classifier-v1",
      extractorVersions: [],
      scopeVersion: "roca-scope-v1",
    });
    expect(result.matcher).toMatchObject({ kind: "fixture-oracle", label: "fixture-oracle" });
    expect(result.snapshot).toEqual({ ref: null });
    expect(result.runGroupKey).toBe(
      "russia_ukraine|roca:2026-08-10:final|retrospective|conflict-epoch-1|fixture-oracle|k=0",
    );
    // repeated runs share the key; a different matcher kind changes it
    const again = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 1)])),
    );
    expect(again.runGroupKey).toBe(result.runGroupKey);
    // timing: report published 23:30Z, ingest 07:00Z → 16.5h lead
    expect(result.timing!.corpusRecall.medianLeadHoursByIngest).toBe(16.5);
    expect(result.timing!.corpusRecall.medianLeadHoursBySourceDeclared).toBe(17.5);
  });

  it("a gap request without the gap block, or a scored request carrying one, is refused", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    await expect(
      scoreConflictReport(
        { conflictId: "russia_ukraine", evaluationKind: "retrospective", report: null, gap: null },
        corpus,
        retention,
        fakeOracle([]),
      ),
    ).rejects.toThrowError(ConflictDomainError);
    await expect(
      scoreConflictReport(
        {
          ...request([U0]),
          gap: { series: "roca", gapDate: "2026-08-10" },
        },
        corpus,
        retention,
        fakeOracle([]),
      ),
    ).rejects.toThrowError(/must not carry a gap/);
  });

  it("half-unavailable population pairs are refused (one availability verdict per report)", async () => {
    const { corpus } = await assemblies([UA_CLAIM], "operational_cutoff");
    const { retention } = await assemblies([UA_CLAIM]);
    await expect(
      scoreConflictReport(request([U0], "operational_cutoff"), corpus, retention, fakeOracle([])),
    ).rejects.toThrowError(/share one availability verdict/);
  });

  it("lane rows partition the declared units and never change the denominator", async () => {
    const strikes = unit("u1", 1, "Synthetic drone strike on invented infrastructure.", {
      lane: "strikes_air_defense",
    });
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(
        request([U0, strikes]),
        corpus,
        retention,
        fakeOracle([full("u0", 1)]),
      ),
    );
    expect(result.lanes).toEqual([
      {
        lane: "frontline_maneuver",
        units: 1,
        corpusRecall: { matched: 1, partial: 0, miss: 0 },
        publishedRetention: { matched: 1, partial: 0, miss: 0 },
        diagnostic: null,
      },
      {
        lane: "strikes_air_defense",
        units: 1,
        corpusRecall: { matched: 0, partial: 0, miss: 1 },
        publishedRetention: { matched: 0, partial: 0, miss: 1 },
        diagnostic: null,
      },
    ]);
    expect(result.lanes!.reduce((n, r) => n + r.units, 0)).toBe(
      result.headline.corpusRecall.denominator,
    );
  });
});
