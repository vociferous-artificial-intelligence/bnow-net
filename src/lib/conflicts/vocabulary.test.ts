import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  CONFLICT_IDS,
  EVALUATION_KINDS,
  EVALUATION_KIND_AVAILABILITIES,
  EXCLUSION_REASONS,
  INITIAL_EVALUATION_KIND_AVAILABILITY,
  LANE_DIAGNOSTICS,
  MATCHER_RUNGS,
  METHODOLOGY_EPOCH,
  MISS_DIAGNOSTICS,
  REFERENCE_SERIES_IDS,
  UNAVAILABLE_REASONS,
  UNIT_VERDICTS,
  WINDOW_END_SOURCES,
  dominantExclusionReason,
  exclusionReasonPrecedence,
  isConflictId,
  isEvaluationKind,
  isExclusionReason,
  isLaneDiagnostic,
  isMatcherRung,
  isMissDiagnostic,
  isReferenceSeriesId,
  isUnavailableReason,
  isUnitVerdict,
  isWindowEndSource,
} from "./vocabulary";

describe("conflict and series identities", () => {
  it("exactly the two contract conflicts, in stable order", () => {
    expect(CONFLICT_IDS).toEqual(["russia_ukraine", "iran_regional"]);
  });

  it("exactly the two reference series", () => {
    expect(REFERENCE_SERIES_IDS).toEqual(["roca", "iran_update"]);
  });

  it("guards accept members and reject everything else", () => {
    expect(isConflictId("russia_ukraine")).toBe(true);
    expect(isConflictId("iran_regional")).toBe(true);
    // theater codes are a DIFFERENT concept and must never pass
    for (const notConflict of ["ru", "ua", "ir", "il", "roca", "", null, undefined, 3]) {
      expect(isConflictId(notConflict)).toBe(false);
    }
    expect(isReferenceSeriesId("roca")).toBe(true);
    expect(isReferenceSeriesId("iran_update")).toBe(true);
    for (const notSeries of ["russia_ukraine", "isw", "", null]) {
      expect(isReferenceSeriesId(notSeries)).toBe(false);
    }
  });

  it("initial methodology epoch is conflict-epoch-1", () => {
    expect(METHODOLOGY_EPOCH).toBe("conflict-epoch-1");
  });
});

describe("exclusion reasons — the frozen precedence order (contract §5, register #6)", () => {
  it("lists exactly the eight bounded reasons IN the frozen order (integrity → scope → comparability)", () => {
    expect(EXCLUSION_REASONS).toEqual([
      "stub_fixture",
      "missing_source",
      "superseded_version",
      "mirror_only",
      "off_window",
      "off_scope",
      "legacy_incomparable",
      "unclassified",
    ]);
  });

  it("precedence indices follow the array order", () => {
    EXCLUSION_REASONS.forEach((reason, i) => {
      expect(exclusionReasonPrecedence(reason)).toBe(i);
    });
  });

  it("precedence of an unknown reason throws typed — never a silent rank", () => {
    expect(() => exclusionReasonPrecedence("not_a_reason")).toThrowError(ConflictDomainError);
    try {
      exclusionReasonPrecedence("not_a_reason");
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_exclusion_reasons");
    }
  });

  it("guard accepts all eight and rejects near-misses", () => {
    for (const r of EXCLUSION_REASONS) expect(isExclusionReason(r)).toBe(true);
    for (const bad of ["stub", "offscope", "off-window", "", null, undefined]) {
      expect(isExclusionReason(bad)).toBe(false);
    }
  });
});

describe("dominantExclusionReason", () => {
  it("a single reason is its own dominant", () => {
    for (const r of EXCLUSION_REASONS) {
      expect(dominantExclusionReason([r])).toBe(r);
    }
  });

  it("stub ∧ off-scope → stub_fixture (the fixture-pinned integrity-before-scope case)", () => {
    expect(dominantExclusionReason(["off_scope", "stub_fixture"])).toBe("stub_fixture");
    expect(dominantExclusionReason(["stub_fixture", "off_scope"])).toBe("stub_fixture");
  });

  it("multi-reason dominance follows the frozen order regardless of input order", () => {
    expect(dominantExclusionReason(["off_window", "missing_source"])).toBe("missing_source");
    expect(dominantExclusionReason(["unclassified", "legacy_incomparable"])).toBe(
      "legacy_incomparable",
    );
    expect(dominantExclusionReason(["off_scope", "legacy_incomparable"])).toBe("off_scope");
    expect(dominantExclusionReason(["mirror_only", "superseded_version"])).toBe(
      "superseded_version",
    );
    expect(dominantExclusionReason(["off_window", "mirror_only"])).toBe("mirror_only");
    expect(
      dominantExclusionReason([
        "unclassified",
        "legacy_incomparable",
        "off_scope",
        "off_window",
        "mirror_only",
        "superseded_version",
        "missing_source",
        "stub_fixture",
      ]),
    ).toBe("stub_fixture");
  });

  it("duplicate reasons are harmless", () => {
    expect(dominantExclusionReason(["off_window", "off_window", "off_scope"])).toBe("off_window");
  });

  it("an empty list throws typed — it never invents a reason", () => {
    expect(() => dominantExclusionReason([])).toThrowError(ConflictDomainError);
    try {
      dominantExclusionReason([]);
    } catch (e) {
      expect((e as ConflictDomainError).code).toBe("invalid_exclusion_reasons");
    }
  });

  it("an unknown member throws typed even when a known reason is also present — fail closed, no silent survivor", () => {
    expect(() => dominantExclusionReason(["stub_fixture", "made_up"])).toThrowError(
      ConflictDomainError,
    );
  });
});

describe("windowEndSource (§5 END ladder provenance)", () => {
  it("exactly the three rungs, in ladder order", () => {
    expect(WINDOW_END_SOURCES).toEqual(["cutoff", "published", "report_day"]);
  });

  it("guard behavior", () => {
    for (const w of WINDOW_END_SOURCES) expect(isWindowEndSource(w)).toBe(true);
    for (const bad of ["cutoffAt", "publishedAt", "", null]) {
      expect(isWindowEndSource(bad)).toBe(false);
    }
  });
});

describe("evaluation kinds (§6.2, register #5)", () => {
  it("exactly the four kinds", () => {
    expect(EVALUATION_KINDS).toEqual([
      "operational_cutoff",
      "at_publication",
      "finalized",
      "retrospective",
    ]);
  });

  it("availability vocabulary is allowed | unavailable", () => {
    expect(EVALUATION_KIND_AVAILABILITIES).toEqual(["allowed", "unavailable"]);
  });

  it("initially, the three snapshot kinds are unavailable and ONLY retrospective is allowed", () => {
    expect(INITIAL_EVALUATION_KIND_AVAILABILITY).toEqual({
      operational_cutoff: "unavailable",
      at_publication: "unavailable",
      finalized: "unavailable",
      retrospective: "allowed",
    });
  });

  it("the availability table is frozen", () => {
    expect(Object.isFrozen(INITIAL_EVALUATION_KIND_AVAILABILITY)).toBe(true);
    expect(() => {
      (INITIAL_EVALUATION_KIND_AVAILABILITY as Record<string, string>).finalized = "allowed";
    }).toThrow();
  });

  it("guard behavior", () => {
    for (const k of EVALUATION_KINDS) expect(isEvaluationKind(k)).toBe(true);
    expect(isEvaluationKind("cutoff")).toBe(false);
    expect(isEvaluationKind(null)).toBe(false);
  });
});

describe("unavailable reasons — a CLOSED union (Gate-1 NOTE-5)", () => {
  it("exactly publication_gap and no_proven_snapshot", () => {
    expect(UNAVAILABLE_REASONS).toEqual(["publication_gap", "no_proven_snapshot"]);
  });

  it("guard rejects free text — no unbounded reason strings", () => {
    expect(isUnavailableReason("publication_gap")).toBe(true);
    expect(isUnavailableReason("no_proven_snapshot")).toBe(true);
    for (const bad of ["gap", "snapshot_missing", "unavailable", "", null, undefined]) {
      expect(isUnavailableReason(bad)).toBe(false);
    }
  });
});

describe("unit verdicts and diagnostics (§3, register #8 H1)", () => {
  it("exactly matched | miss | partial — NO unit-level unavailable", () => {
    expect(UNIT_VERDICTS).toEqual(["matched", "miss", "partial"]);
    expect(isUnitVerdict("unavailable")).toBe(false);
  });

  it("verdict guard behavior", () => {
    for (const v of UNIT_VERDICTS) expect(isUnitVerdict(v)).toBe(true);
    expect(isUnitVerdict("match")).toBe(false);
    expect(isUnitVerdict("")).toBe(false);
  });

  it("missDiagnostic is exactly incomparable_coverage", () => {
    expect(MISS_DIAGNOSTICS).toEqual(["incomparable_coverage"]);
    expect(isMissDiagnostic("incomparable_coverage")).toBe(true);
    expect(isMissDiagnostic("unavailable")).toBe(false);
  });

  it("laneDiagnostic is exactly unavailable_incomparable", () => {
    expect(LANE_DIAGNOSTICS).toEqual(["unavailable_incomparable"]);
    expect(isLaneDiagnostic("unavailable_incomparable")).toBe(true);
    expect(isLaneDiagnostic("incomparable_coverage")).toBe(false);
  });
});

describe("matcher rungs (§6.3 inherited degradation ladder)", () => {
  it("exactly llm-majority | llm | keyword, in ladder order", () => {
    expect(MATCHER_RUNGS).toEqual(["llm-majority", "llm", "keyword"]);
  });

  it("guard behavior — no label can masquerade as a different rung", () => {
    for (const r of MATCHER_RUNGS) expect(isMatcherRung(r)).toBe(true);
    for (const bad of ["majority", "llm_majority", "keyword-fallback", "", null]) {
      expect(isMatcherRung(bad)).toBe(false);
    }
  });
});

describe("frozen const arrays", () => {
  it("every vocabulary array refuses mutation", () => {
    for (const arr of [
      CONFLICT_IDS,
      REFERENCE_SERIES_IDS,
      EXCLUSION_REASONS,
      WINDOW_END_SOURCES,
      EVALUATION_KINDS,
      UNAVAILABLE_REASONS,
      UNIT_VERDICTS,
      MISS_DIAGNOSTICS,
      LANE_DIAGNOSTICS,
      MATCHER_RUNGS,
    ]) {
      // `as const` arrays are readonly at the type level; runtime pushes on a
      // non-frozen array would still succeed, so freeze-or-throw is what we
      // actually assert: a mutation attempt must not change the array.
      const before = [...arr];
      try {
        (arr as unknown as string[]).push("tampered");
      } catch {
        // frozen — expected
      }
      expect([...arr]).toEqual(before);
    }
  });
});
