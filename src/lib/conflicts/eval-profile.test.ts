// Adapter-interface compatibility proof (contract §10, register #3): a
// conflict dataset IS a valid dataset of the EXISTING `validation` workload —
// checked at compile time (assignability to the inherited types, no casts)
// AND at run time (the inherited dataset validator accepts a conflict-shaped
// dataset with its additive reference payload). No eval-library file is
// edited; only documented exports of the contracts module are consumed, and
// only HERE: the eval-library isolation contract forbids non-test src/ files
// from importing the eval library, so eval-profile.ts is structural and this
// test carries the real-type pins.

import { describe, expect, it } from "vitest";
import type {
  AnalysisEvalCase,
  AnalysisEvalDataset,
  AnalysisEvalWorkload,
  ValidationEvalCase,
} from "../evals/contracts";
import { validateAnalysisEvalDataset } from "../evals/contracts";
import { CONFLICT_REGISTRY } from "./definitions";
import {
  CONFLICT_EVAL_DATASET_IDS,
  CONFLICT_EVAL_PROFILES,
  CONFLICT_EVAL_WORKLOAD,
  validateConflictCaseMetaV1,
  validateConflictResultIdentityV1,
  type ConflictEvalDatasetOf,
  type ConflictPublicationGapResultV1,
  type ConflictResultV1,
  type ConflictScoredResultV1,
  type ConflictValidationEvalCaseOf,
} from "./eval-profile";
import { CONFLICT_IDS, METHODOLOGY_EPOCH } from "./vocabulary";

// The composed types — the inherited contracts flow in HERE, per the module's
// isolation note. These aliases compiling at all is part of the proof.
type ConflictCase = ConflictValidationEvalCaseOf<ValidationEvalCase>;
type ConflictDataset = ConflictEvalDatasetOf<AnalysisEvalDataset, ConflictCase>;

// Compile-time pin: the conflict workload literal is a member of the
// inherited workload union — if the control plane drops or renames
// `validation`, this file stops compiling.
const WORKLOAD_PIN: AnalysisEvalWorkload = CONFLICT_EVAL_WORKLOAD;

// ---------------------------------------------------------------------------
// A minimal, fully synthetic conflict case (fictional content, house rules)
// ---------------------------------------------------------------------------

const CONFLICT_RESULT: ConflictScoredResultV1 = {
  version: 1,
  state: "scored",
  conflictId: "russia_ukraine",
  methodologyEpoch: METHODOLOGY_EPOCH,
  laneTaxonomyVersion: "roca-lanes-v1",
  evidencePolicyVersion: "ru-ua-ev-v1",
  report: {
    series: "roca",
    editionKey: "roca:2026-08-01:final",
    reportDate: "2026-08-01",
    cutoffAt: "2026-08-01T19:00:00Z",
    publishedAt: null,
    scopeVersion: "roca-scope-v1",
  },
  evaluationKind: "retrospective",
  windowEndSource: "cutoff",
  headline: {
    corpusRecall: { matched: 1, denominator: 1 },
    publishedRetention: { matched: 0, denominator: 1 },
  },
  corpusRecall: { u0: "matched" },
  publishedRetention: { u0: "miss" },
  matcherRung: "llm-majority",
  contribution: { u0: { theaters: ["ua"], tracks: ["military"] } },
};

const CONFLICT_CASE: ConflictCase = {
  id: "conflict-roca-fixture-case-1",
  workload: "validation",
  partition: "typical",
  split: "development",
  provenance: "authored-2026-08-17",
  input: {
    takeaways: [
      {
        index: 0,
        text: "Fictional forces reportedly advanced near an invented village on the synthetic axis.",
      },
    ],
    claims: [
      {
        claimId: 101,
        text: "A fictional brigade advanced near the invented village, per synthetic reporting.",
        hedging: "claimed",
        docCount: 2,
        earliestDocAt: "2026-08-01T06:00:00Z",
        earliestFetchedAt: "2026-08-01T06:30:00Z",
      },
    ],
    iswPublishedAt: null,
  },
  reference: {
    labels: [{ takeawayIndex: 0, claimId: 101 }],
    conflictMeta: {
      version: 1,
      conflictId: "russia_ukraine",
      datasetId: "conflict-roca-v1",
    },
    conflictResultV1: CONFLICT_RESULT,
  },
  offline: { expectation: "pass" },
};

const CONFLICT_DATASET: ConflictDataset = {
  datasetVersion: "conflict-roca-v1",
  workload: CONFLICT_EVAL_WORKLOAD,
  createdAt: "2026-08-17T00:00:00Z",
  cases: [CONFLICT_CASE],
};

describe("compile-level compatibility with the inherited eval contracts", () => {
  it("a composed conflict case IS a ValidationEvalCase and an AnalysisEvalCase (assignability, no casts)", () => {
    const asValidation: ValidationEvalCase = CONFLICT_CASE;
    const asCase: AnalysisEvalCase = CONFLICT_CASE;
    expect(asValidation.workload).toBe("validation");
    expect(asCase.id).toBe("conflict-roca-fixture-case-1");
  });

  it("a composed conflict dataset IS an AnalysisEvalDataset (assignability, no casts)", () => {
    const asDataset: AnalysisEvalDataset = CONFLICT_DATASET;
    expect(asDataset.workload).toBe("validation");
  });

  it("the pinned workload is a member of the inherited workload union", () => {
    expect(WORKLOAD_PIN).toBe("validation");
  });
});

describe("runtime compatibility — the INHERITED validator accepts a conflict dataset", () => {
  it("validateAnalysisEvalDataset returns no errors for the conflict-shaped dataset", () => {
    expect(validateAnalysisEvalDataset(CONFLICT_DATASET)).toEqual([]);
  });

  it("and still returns no errors when asked specifically for the validation workload", () => {
    expect(validateAnalysisEvalDataset(CONFLICT_DATASET, "validation")).toEqual([]);
  });

  it("the additive payload does not shield inherited-contract violations: a broken label still fails", () => {
    const broken = {
      ...CONFLICT_DATASET,
      cases: [
        {
          ...CONFLICT_CASE,
          reference: { ...CONFLICT_CASE.reference, labels: [{ takeawayIndex: 5, claimId: 101 }] },
        },
      ],
    };
    const errs = validateAnalysisEvalDataset(broken);
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe("profile records (register #3)", () => {
  it("one profile per conflict, each riding the validation workload", () => {
    expect(Object.keys(CONFLICT_EVAL_PROFILES).sort()).toEqual([...CONFLICT_IDS].sort());
    for (const id of CONFLICT_IDS) {
      const p = CONFLICT_EVAL_PROFILES[id];
      expect(p.profileId).toBe("conflict-validation-profile-v1");
      expect(p.workload).toBe("validation");
      expect(p.conflictId).toBe(id);
      expect(p.datasetVersion).toBe(CONFLICT_EVAL_DATASET_IDS[id]);
      expect(p.methodologyEpoch).toBe(METHODOLOGY_EPOCH);
    }
  });

  it("dataset naming distinguishes the profile (§10): conflict-roca-v1 / conflict-iran-v1", () => {
    expect(CONFLICT_EVAL_DATASET_IDS).toEqual({
      russia_ukraine: "conflict-roca-v1",
      iran_regional: "conflict-iran-v1",
    });
  });

  it("profiles carry each conflict's own taxonomy and evidence-policy versions", () => {
    expect(CONFLICT_EVAL_PROFILES.russia_ukraine.laneTaxonomyVersion).toBe("roca-lanes-v1");
    expect(CONFLICT_EVAL_PROFILES.russia_ukraine.evidencePolicyVersion).toBe("ru-ua-ev-v1");
    expect(CONFLICT_EVAL_PROFILES.iran_regional.laneTaxonomyVersion).toBe("iran-lanes-v1");
    expect(CONFLICT_EVAL_PROFILES.iran_regional.evidencePolicyVersion).toBe("iran-ev-v1");
  });

  it("profile ↔ registry consistency: versions are DERIVED, never divergent (Gate-1 MINOR-4)", () => {
    for (const id of CONFLICT_IDS) {
      const def = CONFLICT_REGISTRY[id];
      const p = CONFLICT_EVAL_PROFILES[id];
      expect(p.laneTaxonomyVersion).toBe(def.laneTaxonomyVersion);
      expect(p.evidencePolicyVersion).toBe(def.evidencePolicyVersion);
    }
  });

  it("profiles and dataset ids are frozen", () => {
    expect(Object.isFrozen(CONFLICT_EVAL_PROFILES)).toBe(true);
    expect(Object.isFrozen(CONFLICT_EVAL_DATASET_IDS)).toBe(true);
    expect(() => {
      (CONFLICT_EVAL_PROFILES.russia_ukraine as { workload: string }).workload = "map";
    }).toThrow();
  });
});

describe("the ConflictResultV1 payload expresses the fixture vocabulary", () => {
  it("an unavailable result carries a reason and structurally has NO headline (unavailable ≠ 0/0)", () => {
    const unavailable: ConflictResultV1 = {
      version: 1,
      state: "unavailable",
      conflictId: "iran_regional",
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
      report: {
        series: "iran_update",
        editionKey: "iran_update:2026-08-02:final",
        reportDate: "2026-08-02",
        cutoffAt: null,
        publishedAt: null,
        scopeVersion: "iran-update-scope-v1",
      },
      evaluationKind: "operational_cutoff",
      unavailableReason: "no_proven_snapshot",
    };
    expect(unavailable.state).toBe("unavailable");
    expect("headline" in unavailable).toBe(false);
  });

  it("a scored result can carry the diagnostics vocabulary: partial verdicts, missDiagnostic, laneDiagnostics, keyword rung", () => {
    const scored: ConflictResultV1 = {
      ...CONFLICT_RESULT,
      conflictId: "iran_regional",
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
      report: {
        series: "iran_update",
        editionKey: "iran_update:2026-08-08:final",
        reportDate: "2026-08-08",
        cutoffAt: null,
        publishedAt: "2026-08-08T21:30:00Z",
        scopeVersion: "iran-update-scope-v1",
      },
      windowEndSource: "published",
      headline: {
        corpusRecall: { matched: 0, denominator: 2 },
        publishedRetention: { matched: 1, denominator: 2 },
        partialDiagnostic: 1,
      },
      corpusRecall: { u0: "miss", u1: "partial" },
      publishedRetention: { u0: "matched", u1: "miss" },
      missDiagnostic: { u0: "incomparable_coverage" },
      laneDiagnostics: { maritime: "unavailable_incomparable" },
      matcherRung: "keyword",
      keywordUnmatchable: 1,
      contribution: {},
    };
    expect(scored.state).toBe("scored");
    expect(scored.missDiagnostic?.u0).toBe("incomparable_coverage");
  });

  it("a TRUE publication gap (cc-publication-gap-002 shape) carries NO report/edition identity — only series + gapDate", () => {
    const gap: ConflictPublicationGapResultV1 = {
      version: 1,
      state: "unavailable",
      unavailableReason: "publication_gap",
      conflictId: "iran_regional",
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
      evaluationKind: "retrospective",
      series: "iran_update",
      gapDate: "2026-07-31",
    };
    const asResult: ConflictResultV1 = gap;
    expect("report" in asResult).toBe(false);
    expect("editionKey" in asResult).toBe(false);
    expect(validateConflictResultIdentityV1(gap)).toEqual([]);
  });
});

describe("validateConflictResultIdentityV1 — fail-closed identity validation (Gate-1 MINOR-4/MAJOR-2)", () => {
  it("accepts the scored and no-snapshot fixtures", () => {
    expect(validateConflictResultIdentityV1(CONFLICT_RESULT)).toEqual([]);
    const unavailable: ConflictResultV1 = {
      version: 1,
      state: "unavailable",
      unavailableReason: "no_proven_snapshot",
      conflictId: "russia_ukraine",
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: "roca-lanes-v1",
      evidencePolicyVersion: "ru-ua-ev-v1",
      evaluationKind: "operational_cutoff",
      report: CONFLICT_RESULT.report,
    };
    expect(validateConflictResultIdentityV1(unavailable)).toEqual([]);
  });

  it("REJECTS the reviewer's exact cross-conflict counterexample: russia_ukraine + iran-lanes-v1", () => {
    const errs = validateConflictResultIdentityV1({
      ...CONFLICT_RESULT,
      conflictId: "russia_ukraine",
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
    });
    expect(errs.some((e) => e.includes("iran-lanes-v1") && e.includes("roca-lanes-v1"))).toBe(true);
    expect(errs.some((e) => e.startsWith("evidencePolicyVersion:"))).toBe(true);
  });

  it("rejects a report whose series is not the conflict's reference series", () => {
    const errs = validateConflictResultIdentityV1({
      ...CONFLICT_RESULT,
      report: {
        ...CONFLICT_RESULT.report,
        series: "iran_update",
        editionKey: "iran_update:2026-08-01:final",
      },
    });
    expect(errs.some((e) => e.startsWith("report.series:"))).toBe(true);
  });

  it("rejects an unknown unavailableReason — the union is closed", () => {
    const errs = validateConflictResultIdentityV1({
      version: 1,
      state: "unavailable",
      unavailableReason: "mystery_outage",
      conflictId: "russia_ukraine",
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: "roca-lanes-v1",
      evidencePolicyVersion: "ru-ua-ev-v1",
      evaluationKind: "finalized",
      report: CONFLICT_RESULT.report,
    });
    expect(errs.some((e) => e.startsWith("unavailableReason:"))).toBe(true);
  });

  it("rejects a publication gap that smuggles a report identity (contract §9 — gaps are never fabricated)", () => {
    const errs = validateConflictResultIdentityV1({
      version: 1,
      state: "unavailable",
      unavailableReason: "publication_gap",
      conflictId: "iran_regional",
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
      evaluationKind: "retrospective",
      series: "iran_update",
      gapDate: "2026-07-31",
      report: CONFLICT_RESULT.report,
    });
    expect(errs.some((e) => e.startsWith("report:"))).toBe(true);
  });

  it("rejects a gap with the wrong series or a malformed gapDate, and gapDate on report-carrying variants", () => {
    const gapBase = {
      version: 1,
      state: "unavailable",
      unavailableReason: "publication_gap",
      conflictId: "iran_regional",
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: "iran-lanes-v1",
      evidencePolicyVersion: "iran-ev-v1",
      evaluationKind: "retrospective",
      series: "iran_update",
      gapDate: "2026-07-31",
    };
    expect(
      validateConflictResultIdentityV1({ ...gapBase, series: "roca" }).some((e) =>
        e.startsWith("series:"),
      ),
    ).toBe(true);
    expect(
      validateConflictResultIdentityV1({ ...gapBase, gapDate: "2026-02-30" }).some((e) =>
        e.startsWith("gapDate:"),
      ),
    ).toBe(true);
    expect(
      validateConflictResultIdentityV1({ ...CONFLICT_RESULT, gapDate: "2026-07-31" }).some((e) =>
        e.startsWith("gapDate:"),
      ),
    ).toBe(true);
  });

  it("rejects a scored result carrying an unavailableReason, unknown conflicts, bad versions and states", () => {
    expect(
      validateConflictResultIdentityV1({ ...CONFLICT_RESULT, unavailableReason: "no_proven_snapshot" }).some(
        (e) => e.startsWith("unavailableReason:"),
      ),
    ).toBe(true);
    expect(validateConflictResultIdentityV1({ ...CONFLICT_RESULT, conflictId: "ru" })).toEqual([
      'conflictId: unknown conflict "ru"',
    ]);
    expect(
      validateConflictResultIdentityV1({ ...CONFLICT_RESULT, version: 2 }).some((e) =>
        e.startsWith("version:"),
      ),
    ).toBe(true);
    expect(
      validateConflictResultIdentityV1({ ...CONFLICT_RESULT, state: "pending" }).some((e) =>
        e.startsWith("state:"),
      ),
    ).toBe(true);
    expect(validateConflictResultIdentityV1(null)).toEqual(["conflict result: not an object"]);
  });
});

describe("validateConflictCaseMetaV1 (Gate-1 MINOR-4)", () => {
  it("accepts a consistent meta", () => {
    expect(
      validateConflictCaseMetaV1({ version: 1, conflictId: "iran_regional", datasetId: "conflict-iran-v1" }),
    ).toEqual([]);
  });

  it("REJECTS the reviewer's exact counterexample: russia_ukraine + conflict-iran-v1", () => {
    const errs = validateConflictCaseMetaV1({
      version: 1,
      conflictId: "russia_ukraine",
      datasetId: "conflict-iran-v1",
    });
    expect(errs.some((e) => e.includes("conflict-iran-v1") && e.includes("conflict-roca-v1"))).toBe(
      true,
    );
  });

  it("rejects unknown conflicts, bad versions, and non-objects", () => {
    expect(
      validateConflictCaseMetaV1({ version: 1, conflictId: "ir", datasetId: "conflict-iran-v1" }),
    ).toEqual(['conflictId: unknown conflict "ir"']);
    expect(
      validateConflictCaseMetaV1({ version: 2, conflictId: "iran_regional", datasetId: "conflict-iran-v1" }).some(
        (e) => e.startsWith("version:"),
      ),
    ).toBe(true);
    expect(validateConflictCaseMetaV1("meta")).toEqual(["conflict case meta: not an object"]);
  });
});
