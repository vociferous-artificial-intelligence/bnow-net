// Acceptance wiring for the frozen Phase 0 fixture corpus (Phase 3, contract
// §13 P3): every scenario's expected eligibility verdict must be reproduced by
// the REAL engine — loader → window ladder → classifier → eligibility →
// assemblies. A drifted roster, gazetteer, precedence order, or window rung
// fails here, scenario by scenario.

import { describe, expect, it } from "vitest";
import {
  CONFLICT_FIXTURE_FILES,
  FixtureEvidenceSource,
  loadConflictFixtureScenarios,
  selectedScenarioReport,
  type ConflictFixtureScenario,
} from "./fixture-corpus";
import {
  assembleCorpusRecallEvidence,
  assemblePublishedRetentionEvidence,
  eligibilityByClaim,
  type EvidenceRequest,
} from "./evidence-assembler";
import type { EvaluationKind } from "./vocabulary";

const scenarios = loadConflictFixtureScenarios();

function requestFor(
  scenario: ConflictFixtureScenario,
  kind: EvaluationKind = "retrospective",
): EvidenceRequest {
  const report = selectedScenarioReport(scenario);
  return {
    conflictId: scenario.conflictId,
    kind,
    report:
      report === null
        ? null
        : {
            series: report.series,
            editionKey: report.editionKey,
            reportDate: report.reportDate,
            cutoffAt: report.cutoffAt,
            publishedAt: report.publishedAt,
          },
    snapshot: null,
  };
}

async function assembleBoth(scenario: ConflictFixtureScenario, kind: EvaluationKind = "retrospective") {
  const source = new FixtureEvidenceSource(scenario);
  const corpus = await assembleCorpusRecallEvidence(requestFor(scenario, kind), source);
  const retention = await assemblePublishedRetentionEvidence(requestFor(scenario, kind), source);
  return { corpus, retention };
}

describe("fixture corpus loading", () => {
  it("loads all 39 scenarios from the three frozen files", () => {
    expect(CONFLICT_FIXTURE_FILES).toHaveLength(3);
    expect(scenarios).toHaveLength(39);
    // 48 claims total (README count)
    expect(scenarios.reduce((n, s) => n + s.evidence.length, 0)).toBe(48);
  });

  it("keeps scenario/claim/doc ids globally unique", () => {
    const ids = new Set<string>();
    const claimIds = new Set<number>();
    const docIds = new Set<number>();
    for (const s of scenarios) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      for (const c of s.evidence) {
        expect(claimIds.has(c.claimId)).toBe(false);
        claimIds.add(c.claimId);
        for (const d of c.docs) {
          expect(docIds.has(d.docId)).toBe(false);
          docIds.add(d.docId);
        }
      }
    }
  });
});

describe("acceptance: expected eligibility reproduced by the real engine", () => {
  for (const scenario of scenarios) {
    const expectedElig = scenario.expected.eligibility as Record<
      string,
      | { included: true; lane: string; reasons: string[] }
      | { included: false; reason: string }
    >;

    if (selectedScenarioReport(scenario) === null) {
      it(`${scenario.id}: publication gap → unavailable, no eligibility records`, async () => {
        const { corpus, retention } = await assembleBoth(scenario);
        expect(corpus).toEqual({
          status: "unavailable",
          population: "corpus_recall",
          conflictId: scenario.conflictId,
          kind: "retrospective",
          reason: "publication_gap",
        });
        expect(retention.status).toBe("unavailable");
        if (retention.status === "unavailable") {
          expect(retention.reason).toBe("publication_gap");
        }
        expect(Object.keys(expectedElig)).toHaveLength(0);
      });
      continue;
    }

    it(`${scenario.id}: corpus-recall eligibility matches the frozen expectations`, async () => {
      const { corpus } = await assembleBoth(scenario);
      expect(corpus.status).toBe("assembled");
      if (corpus.status !== "assembled") return;
      const actual = eligibilityByClaim(corpus.assembly);

      expect(Object.keys(actual).sort()).toEqual(Object.keys(expectedElig).sort());
      for (const [claimId, expectedRecord] of Object.entries(expectedElig)) {
        const got = actual[claimId];
        expect(got, `claim ${claimId}`).toBeDefined();
        if (expectedRecord.included) {
          expect(got.included, `claim ${claimId} should be included`).toBe(true);
          if (!got.included) continue;
          expect(got.lane, `claim ${claimId} lane`).toBe(expectedRecord.lane);
          expect([...got.reasons].sort(), `claim ${claimId} reasons`).toEqual(
            [...expectedRecord.reasons].sort(),
          );
        } else {
          expect(got.included, `claim ${claimId} should be excluded`).toBe(false);
          if (got.included) continue;
          expect(got.reason, `claim ${claimId} dominant reason`).toBe(expectedRecord.reason);
        }
      }
    });

    it(`${scenario.id}: published-retention membership follows register #4`, async () => {
      const { retention } = await assembleBoth(scenario);
      expect(retention.status).toBe("assembled");
      if (retention.status !== "assembled") return;
      // expected members: published claims whose corpus-recall disposition is
      // included OR excluded ONLY for comparability/version reasons (legacy
      // claims are retention members, labeled; superseded published output is
      // still published output)
      const expectedMembers = scenario.evidence
        .filter((c) => {
          if (!c.published) return false;
          const rec = expectedElig[String(c.claimId)];
          if (rec === undefined) return false;
          if (rec.included) return true;
          return rec.reason === "legacy_incomparable" || rec.reason === "superseded_version";
        })
        .map((c) => c.claimId)
        .sort((a, b) => a - b);
      const actualMembers = retention.assembly.records.map((r) => r.claimId).sort((a, b) => a - b);
      expect(actualMembers).toEqual(expectedMembers);
      for (const rec of retention.assembly.records) {
        const candidate = scenario.evidence.find((c) => c.claimId === rec.claimId);
        expect(rec.provenance).toBe(candidate?.engine);
        expect(rec.legacy).toBe(candidate?.engine === "legacy");
      }
    });

    const expectedLaneDiagnostics = scenario.expected.laneDiagnostics as
      | Record<string, string>
      | undefined;
    it(`${scenario.id}: lane diagnostics and eligible count`, async () => {
      const { corpus } = await assembleBoth(scenario);
      if (corpus.status !== "assembled") return;
      expect(corpus.assembly.laneDiagnostics).toEqual(expectedLaneDiagnostics ?? {});
      const expectedCount = scenario.expected.eligibleCount as number | undefined;
      if (expectedCount !== undefined) {
        expect(corpus.assembly.eligibleCount).toBe(expectedCount);
      }
    });
  }

  it("reproduces the README aggregate: 47 eligibility records, 34 included / 13 excluded", async () => {
    let included = 0;
    let excluded = 0;
    for (const scenario of scenarios) {
      if (selectedScenarioReport(scenario) === null) continue;
      const { corpus } = await assembleBoth(scenario);
      if (corpus.status !== "assembled") continue;
      included += corpus.assembly.records.length;
      excluded += corpus.assembly.excluded.length;
    }
    expect(included).toBe(34);
    expect(excluded).toBe(13);
    expect(included + excluded).toBe(47);
  });
});

describe("acceptance: window, editions, kinds, and diagnostics pins", () => {
  it("cc-window-rung2-017: malformed cutoff falls to the published END (windowEndSource pin)", async () => {
    const scenario = scenarios.find((s) => s.id === "cc-window-rung2-017")!;
    const { corpus } = await assembleBoth(scenario);
    expect(corpus.status).toBe("assembled");
    if (corpus.status !== "assembled") return;
    expect(corpus.assembly.windowEndSource).toBe("published");
    expect(corpus.assembly.window.cutoffTreatment).toBe("malformed_treated_as_missing");
  });

  it("cc-timestamps-003: anchors classified, never guessed; snapshot kinds unavailable", async () => {
    const scenario = scenarios.find((s) => s.id === "cc-timestamps-003")!;
    const { corpus } = await assembleBoth(scenario);
    expect(corpus.status).toBe("assembled");
    if (corpus.status !== "assembled") return;
    const anchors = scenario.expected.timeAnchors as Record<string, string>;
    expect(corpus.assembly.window.cutoffTreatment).toBe(anchors.cutoffAt);
    expect(corpus.assembly.window.publishedTreatment).toBe(anchors.publishedAt);
    expect(corpus.assembly.windowEndSource).toBe("report_day");

    const kinds = scenario.expected.evaluationKinds as Record<string, string>;
    for (const [kind, availability] of Object.entries(kinds)) {
      const { corpus: byKind } = await assembleBoth(scenario, kind as EvaluationKind);
      if (availability === "unavailable") {
        expect(byKind.status).toBe("unavailable");
        if (byKind.status === "unavailable") expect(byKind.reason).toBe("no_proven_snapshot");
      } else {
        expect(byKind.status).toBe("assembled");
      }
    }
  });

  for (const id of ["cc-regen-after-instant-007", "cc-state-unavailable-014"]) {
    it(`${id}: snapshot-anchored kinds refuse without a proving artifact`, async () => {
      const scenario = scenarios.find((s) => s.id === id)!;
      const kinds = scenario.expected.evaluationKinds as Record<string, string>;
      for (const [kind, availability] of Object.entries(kinds)) {
        const { corpus, retention } = await assembleBoth(scenario, kind as EvaluationKind);
        if (availability === "unavailable") {
          expect(corpus.status).toBe("unavailable");
          expect(retention.status).toBe("unavailable");
          if (corpus.status === "unavailable") expect(corpus.reason).toBe("no_proven_snapshot");
        } else {
          expect(corpus.status).toBe("assembled");
          expect(retention.status).toBe("assembled");
        }
      }
    });
  }

  it("cc-editions-001: the designated-final edition is selected deterministically", async () => {
    const scenario = scenarios.find((s) => s.id === "cc-editions-001")!;
    const { corpus } = await assembleBoth(scenario);
    expect(corpus.status).toBe("assembled");
    if (corpus.status !== "assembled") return;
    expect(corpus.assembly.editionKey).toBe(scenario.expected.selectedEditionKey);
  });

  it("availability diagnostics: ingest time governs; equality is at-or-before (004/005/006)", async () => {
    for (const id of [
      "cc-dst-offset-004",
      "cc-fetch-after-cutoff-005",
      "cc-ingest-after-publication-006",
    ]) {
      const scenario = scenarios.find((s) => s.id === id)!;
      const { corpus } = await assembleBoth(scenario);
      expect(corpus.status).toBe("assembled");
      if (corpus.status !== "assembled") continue;
      const expected = scenario.expected.availability as Record<
        string,
        { atCutoff: boolean; atPublication: boolean }
      >;
      for (const [claimId, avail] of Object.entries(expected)) {
        const rec = corpus.assembly.records.find((r) => String(r.claimId) === claimId);
        expect(rec, `${id} claim ${claimId}`).toBeDefined();
        expect(rec!.availability.atCutoff).toBe(avail.atCutoff);
        expect(rec!.availability.atPublication).toBe(avail.atPublication);
      }
    }
  });

  it("iran-translation-hedge-012: the hedge survives assembly unstrengthened", async () => {
    const scenario = scenarios.find((s) => s.id === "iran-translation-hedge-012")!;
    const { corpus, retention } = await assembleBoth(scenario);
    if (corpus.status !== "assembled" || retention.status !== "assembled") {
      throw new Error("expected assembled");
    }
    const pins = scenario.expected.hedgePreservation as Record<string, string>;
    for (const [claimId, hedge] of Object.entries(pins)) {
      for (const rec of [
        corpus.assembly.records.find((r) => String(r.claimId) === claimId),
        retention.assembly.records.find((r) => String(r.claimId) === claimId),
      ]) {
        expect(rec).toBeDefined();
        expect(rec!.hedge).toBe(hedge);
      }
    }
    // translation provenance stays visible on the doc
    const rec = corpus.assembly.records[0];
    expect(rec.docs.some((d) => d.sourceLanguage === "fa")).toBe(true);
  });

  it("mirror scenarios: independence counts mirrors as zero (009/010)", async () => {
    const mirror = scenarios.find((s) => s.id === "cc-mirror-adapters-009")!;
    const { corpus: mc } = await assembleBoth(mirror);
    if (mc.status !== "assembled") throw new Error("expected assembled");
    // the mirror claim is excluded mirror_only; the canonical claim keeps
    // independence 1 with the mirror relationship preserved on records
    expect(mc.assembly.records.map((r) => r.claimId)).toEqual([9310]);
    expect(mc.assembly.records[0].independentSourceCount).toBe(1);
    const excludedMirror = mc.assembly.excluded.find((e) => e.claimId === 9311)!;
    expect(excludedMirror.record).toEqual({ included: false, reason: "mirror_only" });

    const indep = scenarios.find((s) => s.id === "cc-independence-010")!;
    const { corpus: ic } = await assembleBoth(indep);
    if (ic.status !== "assembled") throw new Error("expected assembled");
    const rec = ic.assembly.records.find((r) => r.claimId === 9312)!;
    expect(rec.docs).toHaveLength(4);
    expect(rec.independentSourceCount).toBe(1);
    expect(rec.docs.filter((d) => d.mirrorOfDocId !== null)).toHaveLength(3);
  });

  it("iran-gulf-unavailable-010b: honest incomparable coverage, retention keeps the labeled legacy member", async () => {
    const scenario = scenarios.find((s) => s.id === "iran-gulf-unavailable-010b")!;
    const { corpus, retention } = await assembleBoth(scenario);
    if (corpus.status !== "assembled" || retention.status !== "assembled") {
      throw new Error("expected assembled");
    }
    // corpus recall: nothing enters; the lane reports unavailable_incomparable
    expect(corpus.assembly.records).toHaveLength(0);
    expect(corpus.assembly.laneDiagnostics).toEqual({ maritime: "unavailable_incomparable" });
    expect(corpus.assembly.incomparableTheaters).toEqual(["il", "sa", "ae", "qa", "om", "bh", "kw"]);
    // published retention: the bh legacy digest claim IS a member, labeled
    expect(retention.assembly.records.map((r) => r.claimId)).toEqual([9111]);
    expect(retention.assembly.records[0].legacy).toBe(true);
    expect(retention.assembly.records[0].provenance).toBe("legacy");
    expect(retention.assembly.legacyMemberCount).toBe(1);
  });

  it("roca-retention-gap-008b: corpus recall holds the claim, retention holds nothing", async () => {
    const scenario = scenarios.find((s) => s.id === "roca-retention-gap-008b")!;
    const { corpus, retention } = await assembleBoth(scenario);
    if (corpus.status !== "assembled" || retention.status !== "assembled") {
      throw new Error("expected assembled");
    }
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([9009]);
    expect(retention.assembly.records).toHaveLength(0);
  });

  it("three-state distinction: unavailable vs empty-eligible zero vs nonempty zero", async () => {
    // state 1: snapshot kind unavailable (provenance statement, no records)
    const s14 = scenarios.find((s) => s.id === "cc-state-unavailable-014")!;
    const { corpus: c14 } = await assembleBoth(s14, "operational_cutoff");
    expect(c14.status).toBe("unavailable");
    // state 2: assembled with an EMPTY eligible set
    const s15 = scenarios.find((s) => s.id === "cc-state-zero-empty-015")!;
    const { corpus: c15 } = await assembleBoth(s15);
    if (c15.status !== "assembled") throw new Error("expected assembled");
    expect(c15.assembly.eligibleCount).toBe(0);
    expect(c15.assembly.excluded).toHaveLength(2);
    // state 3: assembled with a NONEMPTY eligible set (the zero-match verdict
    // is the Phase 4 matcher's to produce)
    const s16 = scenarios.find((s) => s.id === "cc-state-zero-nonempty-016")!;
    const { corpus: c16 } = await assembleBoth(s16);
    if (c16.status !== "assembled") throw new Error("expected assembled");
    expect(c16.assembly.eligibleCount).toBe(2);
  });
});

describe("acceptance: reference-prose audit (sentinel rule)", () => {
  it("assemblies never carry reference-unit text (sentinel present in input, absent in output)", async () => {
    const scenario = scenarios.find((s) => s.id === "cc-regen-after-instant-007")!;
    const unitText = scenario.report!.units[0].text;
    // input-presence precondition (README audit rule: presence before
    // absence, else the audit is vacuous and must fail as not-run); the
    // sentinel is the unit's invented all-caps codename — extracted at
    // runtime, never spelled in committed code
    const sentinel = unitText.match(/\b[A-Z]{6,}\b/)?.[0];
    expect(sentinel).toBeDefined();
    const { corpus, retention } = await assembleBoth(scenario);
    const serialized = JSON.stringify({ corpus, retention });
    expect(serialized).not.toContain(sentinel!);
    // stronger: NO unit text from ANY scenario appears in its own assemblies
    for (const s of scenarios) {
      const report = selectedScenarioReport(s);
      if (report === null) continue;
      const { corpus: c, retention: r } = await assembleBoth(s);
      const out = JSON.stringify({ c, r });
      for (const unit of report.units) {
        expect(out).not.toContain(unit.text);
      }
    }
  });
});
