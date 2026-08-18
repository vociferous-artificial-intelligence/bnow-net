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
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { LlmCompatibleMatcher } from "./llm-compatible-matcher";
import { scoreConflictReport, type ConflictScoreRequest } from "./scorer";
import { fixtureSnapshotRef } from "./snapshot-ref";
import type { EvaluationKind } from "./vocabulary";

function probeFixtureRef() {
  return fixtureSnapshotRef({
    conflictId: "russia_ukraine",
    locator: "fixtures/conflicts/roca-scenarios-v1.json",
    artifactBytes: "synthetic-probe-bytes",
    populations: { corpusRecallClaimIds: [1], publishedRetentionClaimIds: [1] },
    capturedAt: "2026-08-10T00:00:00Z",
  });
}

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

  it("snapshot refs are validated on EVERY path: a gap request with garbage refuses; a valid ref on a gap is not stamped", async () => {
    const gapCorpus = {
      status: "unavailable",
      population: "corpus_recall",
      conflictId: "russia_ukraine",
      kind: "retrospective",
      reason: "publication_gap",
    } as const;
    const gapRetention = {
      status: "unavailable",
      population: "published_retention",
      conflictId: "russia_ukraine",
      kind: "retrospective",
      reason: "publication_gap",
    } as const;
    const gapRequest = (snapshot: unknown): ConflictScoreRequest =>
      ({
        conflictId: "russia_ukraine",
        evaluationKind: "retrospective",
        report: null,
        gap: { series: "roca", gapDate: "2026-08-10" },
        snapshot,
      }) as ConflictScoreRequest;
    // garbage snapshot on a GAP request: an invalid ref is an invalid
    // REQUEST — previously it was silently dropped and a normal gap result
    // returned
    await expect(
      scoreConflictReport(gapRequest({ garbage: true }), gapCorpus, gapRetention, fakeOracle([])),
    ).rejects.toThrowError(/not a valid ConflictSnapshotRefV1/);
    // a VALID fixture ref on a gap: accepted, normal gap result, ref NOT
    // stamped — unavailable/gap variants carry no snapshot field BY DESIGN
    // (validation refuses garbage earlier; it never changes their shape)
    const gap = await scoreConflictReport(
      gapRequest(probeFixtureRef()),
      gapCorpus,
      gapRetention,
      fakeOracle([]),
    );
    expect(gap.state).toBe("unavailable");
    expect("snapshot" in gap).toBe(false);
  });

  it("register #5 twin guards: snapshot-anchored kinds can never MINT a scored result (scorer layer)", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    // probe (a): assembled populations + a snapshot evaluation kind, no ref
    await expect(
      scoreConflictReport(
        request([U0], "operational_cutoff"),
        corpus,
        retention,
        fakeOracle([full("u0", 1)]),
      ),
    ).rejects.toThrowError(/register #5/);
    // probe (b): an unresolved structurally-valid snapshot-kind ref does not
    // help — the kind-compat check no longer AFFIRMATIVELY stamps it
    const opRef = { ...probeFixtureRef(), captureKind: "operational_cutoff" as const };
    await expect(
      scoreConflictReport(
        { ...request([U0], "operational_cutoff"), snapshot: opRef },
        corpus,
        retention,
        fakeOracle([full("u0", 1)]),
      ),
    ).rejects.toThrowError(/register #5/);
  });

  it("register #5 twin guards: the persistence gate refuses too (gate layer)", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 1)])),
    );
    // a scored result relabeled to a snapshot kind cannot be persisted
    expect(() =>
      assertPersistableConflictResultV1({ ...result, evaluationKind: "operational_cutoff" }),
    ).toThrowError(/register #5/);
    // a stamped ref that cannot back the result's evaluation kind refuses
    const opRef = { ...probeFixtureRef(), captureKind: "at_publication" as const };
    expect(() =>
      assertPersistableConflictResultV1({ ...result, snapshot: { ref: opRef } }),
    ).toThrowError(/cannot back/);
  });

  it("sanctioned: retrospective + a valid fixture ref is scored, stamped, and persistable", async () => {
    const ref = probeFixtureRef();
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(
        { ...request([U0]), snapshot: ref },
        corpus,
        retention,
        fakeOracle([full("u0", 1)]),
      ),
    );
    expect(result.snapshot).toEqual({ ref });
    assertPersistableConflictResultV1(result);
  });

  it("a report with ZERO declared units refuses — a parse failure, never a 0/0 score", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    await expect(
      scoreConflictReport(request([]), corpus, retention, fakeOracle([])),
    ).rejects.toThrowError(/zero declared units/);
  });

  it("the persistence gate refuses a zero denominator (the forbidden 0/0), belt-and-braces", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 1)])),
    );
    const zeroDen = {
      ...result,
      headline: {
        corpusRecall: { matched: 0, denominator: 0 },
        publishedRetention: { matched: 0, denominator: 0 },
      },
    };
    expect(() => assertPersistableConflictResultV1(zeroDen)).toThrowError(/forbidden 0\/0/);
  });

  it("raw window anchors are bounded: sentence-bearing anchors refuse; the observed malformed token passes", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([full("u0", 1)])),
    );
    const sentence = {
      ...result,
      window: {
        ...result.window!,
        cutoffAtRaw:
          "The data cutoff for this synthetic report was two in the afternoon. Later reporting is excluded.",
      },
    };
    expect(() => assertPersistableConflictResultV1(sentence)).toThrowError(/bounded raw anchor/);
    const overlong = { ...result, window: { ...result.window!, publishedAtRaw: "x".repeat(65) } };
    expect(() => assertPersistableConflictResultV1(overlong)).toThrowError(/bounded raw anchor/);
    // the committed fixture's malformed-declaration token (26 chars, single
    // line) stays persistable — goldens unchanged
    const token = { ...result, window: { ...result.window!, cutoffAtRaw: "cutoff 1500 hrs local time" } };
    assertPersistableConflictResultV1(token);
  });

  it("thinSourced pins the <2-independent-docs boundary and the hedge classes (§6.4)", async () => {
    const mkDoc = (docId: number, mirrorOfDocId: number | null = null) => ({
      docId,
      adapter: "rss",
      platform: null,
      sourceDomain: `d${docId}.example`,
      publishedAt: "2026-08-10T06:00:00Z",
      fetchedAt: "2026-08-10T07:00:00Z",
      mirrorOfDocId,
      sourceLanguage: null,
    });
    const batch = [
      // exactly 2 independent docs, hedge claimed → NOT thin (the boundary)
      claim(21, "ua", "Synthetic assaults repelled near Kupiansk (two documents).", {
        docs: [mkDoc(95001), mkDoc(95002)],
      }),
      // 1 independent doc, hedge claimed → thin
      claim(22, "ua", "Synthetic assaults repelled near Kupiansk (one document).", {
        docs: [mkDoc(95003)],
      }),
      // 1 doc but hedge confirmed → NOT thin (hedge class matters)
      claim(23, "ua", "Synthetic assaults repelled near Kupiansk (confirmed report).", {
        hedging: "confirmed",
        docs: [mkDoc(95004)],
      }),
      // 1 doc, hedge unverified → thin (the other thin hedge class)
      claim(24, "ua", "Synthetic assaults repelled near Kupiansk (unverified report).", {
        hedging: "unverified",
        docs: [mkDoc(95005)],
      }),
      // 1 doc, hedge assessed → NOT thin (§6.4 names claimed/unverified only)
      claim(25, "ua", "Synthetic assaults repelled near Kupiansk (assessed report).", {
        hedging: "assessed",
        docs: [mkDoc(95006)],
      }),
      // 2 docs but one is a MIRROR → 1 independent, claimed → thin
      claim(26, "ua", "Synthetic assaults repelled near Kupiansk (mirrored report).", {
        docs: [mkDoc(95007), mkDoc(95008, 95007)],
      }),
    ];
    const { corpus, retention } = await assemblies(batch);
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, fakeOracle([])),
    );
    // thin = claims 22, 24, 26 of the 6 offered
    expect(result.thinSourced!.corpusRecall).toEqual({ count: 3, denominator: 6 });
    expect(result.thinSourced!.publishedRetention).toEqual({ count: 3, denominator: 6 });
  });

  it("a duplicate (unit, claim) entry inside one usable vote dedupes first-entry-wins (production parity)", async () => {
    const { corpus, retention } = await assemblies([UA_CLAIM]);
    // schema-valid vote repeating the same pair — production llm-match
    // tolerates this; the adapter must not hand the scorer a duplicate pair
    const vote = JSON.stringify({
      matches: [
        { takeawayIndex: 0, claimId: 1, confidence: 0.9 },
        { takeawayIndex: 0, claimId: 1, confidence: 0.8 },
      ],
    });
    const matcher = new LlmCompatibleMatcher({
      votesK: 1,
      model: null,
      keywordFallback: new ConflictKeywordMatcher(),
      voteFn: async () => vote,
    });
    const result = expectScored(
      await scoreConflictReport(request([U0]), corpus, retention, matcher),
    );
    expect(result.matcherRung).toBe("llm");
    expect(result.agreements!.corpusRecall).toHaveLength(1);
    expect(result.agreements!.corpusRecall[0].claims).toHaveLength(1);
    expect(result.headline.corpusRecall).toEqual({ matched: 1, denominator: 1 });
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
