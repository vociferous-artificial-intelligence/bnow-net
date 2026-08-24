// Phase 6 product provider: slug/key identity, fail-closed golden loading,
// per-population partial counts, and the gated evidence feed's legal
// boundaries (published-only text, no takeaway text, no corpus-recall-only
// text, traceability re-checks).

import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import type { ConflictScoredResultV1 } from "./eval-profile";
import { loadConflictFixtureScenarios } from "./fixture-corpus";
import {
  benchmarkKeyOf,
  conflictIdForSlug,
  goldenKeyOfBenchmarkKey,
  loadBenchmarkDetail,
  loadConflictBenchmarks,
  loadConflictProductView,
  loadCorpusMarkers,
  loadEvidenceView,
  partialCountsOf,
  publishedEvidenceRows,
  slugForConflictId,
} from "./product-view";

describe("slug identity", () => {
  it("maps the two stable slugs to their conflicts and back", () => {
    expect(conflictIdForSlug("russia-ukraine")).toBe("russia_ukraine");
    expect(conflictIdForSlug("iran-regional")).toBe("iran_regional");
    expect(slugForConflictId("russia_ukraine")).toBe("russia-ukraine");
    expect(slugForConflictId("iran_regional")).toBe("iran-regional");
  });

  it("returns null for unknown slugs (page 404s)", () => {
    expect(conflictIdForSlug("russia_ukraine")).toBeNull(); // ids are not slugs
    expect(conflictIdForSlug("gaza")).toBeNull();
    expect(conflictIdForSlug("")).toBeNull();
  });
});

describe("benchmark keys", () => {
  it("round-trips plain and ladder-variant golden keys through URL-safe keys", () => {
    expect(benchmarkKeyOf("roca-ua-only-001b")).toBe("roca-ua-only-001b");
    expect(benchmarkKeyOf("cc-matcher-failclosed-013b#B-zero-valid-rounds")).toBe(
      "cc-matcher-failclosed-013b~B-zero-valid-rounds",
    );
    expect(goldenKeyOfBenchmarkKey("cc-matcher-failclosed-013b~B-zero-valid-rounds")).toBe(
      "cc-matcher-failclosed-013b#B-zero-valid-rounds",
    );
  });

  it("refuses malformed keys (fail closed before any lookup)", () => {
    expect(goldenKeyOfBenchmarkKey("../../etc/passwd")).toBeNull();
    expect(goldenKeyOfBenchmarkKey("a b")).toBeNull();
    expect(goldenKeyOfBenchmarkKey("~leading")).toBeNull();
    expect(goldenKeyOfBenchmarkKey("")).toBeNull();
  });
});

describe("corpus markers", () => {
  it("surfaces the fixture files' synthetic/provenance/disclaimer markers", () => {
    const markers = loadCorpusMarkers();
    expect(markers.synthetic).toBe(true);
    expect(markers.disclaimer).toContain("SYNTHETIC TEST FIXTURE");
    expect(markers.provenance.length).toBeGreaterThan(0);
  });
});

describe("loadConflictBenchmarks", () => {
  it("loads every committed golden for each conflict, validated, newest first", () => {
    const ru = loadConflictBenchmarks("russia_ukraine");
    const ir = loadConflictBenchmarks("iran_regional");
    expect(ru.length + ir.length).toBe(14); // the full committed golden map
    const ruDays = ru.map((e) =>
      e.result.state === "scored" ? e.result.report.reportDate : "gap",
    );
    expect([...ruDays].every((d, i, arr) => i === 0 || arr[i - 1] >= d)).toBe(true);
    // the ladder variants surface as distinct entries with variant ids
    const variants = ru.filter((e) => e.variantId !== null);
    expect(variants.map((v) => v.variantId).sort()).toEqual([
      "A-one-valid-round",
      "B-zero-valid-rounds",
    ]);
    // the publication gap is an iran entry with the unavailable state
    expect(
      ir.some(
        (e) => e.result.state === "unavailable" && e.result.unavailableReason === "publication_gap",
      ),
    ).toBe(true);
  });

  it("featured = newest scored entry", () => {
    const view = loadConflictProductView("iran_regional");
    expect(view.featured).not.toBeNull();
    expect(view.featured!.result.state).toBe("scored");
    // newest iran scored day in the committed corpus is 2026-08-09
    expect(
      view.featured!.result.state === "scored" && view.featured!.result.report.reportDate,
    ).toBe("2026-08-09");
  });
});

describe("loadBenchmarkDetail", () => {
  it("resolves a known key and rejects unknown/cross-conflict keys with null", () => {
    expect(loadBenchmarkDetail("russia_ukraine", "roca-ua-only-001b")).not.toBeNull();
    expect(loadBenchmarkDetail("iran_regional", "roca-ua-only-001b")).toBeNull();
    expect(loadBenchmarkDetail("russia_ukraine", "no-such-key")).toBeNull();
    expect(loadBenchmarkDetail("russia_ukraine", "../../x")).toBeNull();
  });
});

describe("partialCountsOf", () => {
  it("computes per-population counts and carries the union separately", () => {
    const detail = loadBenchmarkDetail("russia_ukraine", "roca-compound-partial-009b");
    const result = detail!.entry.result as ConflictScoredResultV1;
    const counts = partialCountsOf(result);
    expect(counts.corpusRecall).toBe(1);
    expect(counts.publishedRetention).toBe(1);
    expect(counts.union).toBe(1);
  });
});

describe("publishedEvidenceRows (the gated feed)", () => {
  const scenarios = loadConflictFixtureScenarios();
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

  it("joins matched published claims to their fixture text and source trail", () => {
    const view = loadEvidenceView("russia_ukraine", "roca-ua-only-001b");
    expect(view).not.toBeNull();
    expect(view!.rows).not.toBeNull();
    const rows = view!.rows!;
    expect(rows).toHaveLength(1);
    expect(rows[0].claimId).toBe(9001);
    expect(rows[0].text).toContain("reportedly repelled Russian mechanized assaults");
    expect(rows[0].theater).toBe("ua");
    expect(rows[0].hedge).toBe("claimed");
    expect(rows[0].docs[0].sourceDomain).toBe("frontline-wire.example");
    expect(rows[0].matchedUnits).toHaveLength(1);
  });

  it("NEVER emits reference-unit text: no row text equals or contains any unit text", () => {
    for (const conflictId of ["russia_ukraine", "iran_regional"] as const) {
      for (const entry of loadConflictBenchmarks(conflictId)) {
        if (entry.result.state !== "scored") continue;
        const scenario = scenarioById.get(entry.scenarioId)!;
        const unitTexts = [
          ...(scenario.report?.units ?? []),
          ...(scenario.reports ?? []).flatMap((r) => r.units),
        ].map((u) => u.text);
        const rows = publishedEvidenceRows(scenario, entry.result);
        for (const row of rows) {
          for (const unitText of unitTexts) {
            expect(row.text).not.toBe(unitText);
            expect(row.text.includes(unitText)).toBe(false);
          }
        }
      }
    }
  });

  it("returns only published, non-stub, source-linked claims across the whole corpus", () => {
    for (const conflictId of ["russia_ukraine", "iran_regional"] as const) {
      for (const entry of loadConflictBenchmarks(conflictId)) {
        if (entry.result.state !== "scored") continue;
        const scenario = scenarioById.get(entry.scenarioId)!;
        const byId = new Map(scenario.evidence.map((c) => [c.claimId, c]));
        for (const row of publishedEvidenceRows(scenario, entry.result)) {
          const claim = byId.get(row.claimId)!;
          expect(claim.published).toBe(true);
          expect(claim.stub).toBe(false);
          expect(row.docs.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("includes BNOW-only published items (quiet day) as unmatched rows", () => {
    const view = loadEvidenceView("russia_ukraine", "roca-quiet-day-010b");
    const rows = view!.rows!;
    expect(rows.length).toBeGreaterThan(0);
    const bnowOnly = rows.filter((r) => r.bnowOnlyLane !== null);
    expect(bnowOnly.length).toBeGreaterThan(0);
    expect(bnowOnly[0].matchedUnits).toHaveLength(0);
  });

  it("empty union renders as an empty list, not an invented one (retention gap)", () => {
    const view = loadEvidenceView("russia_ukraine", "roca-retention-gap-008b");
    expect(view!.rows).toEqual([]);
  });

  it("a gap record yields rows: null (unavailable, never an empty union)", () => {
    const view = loadEvidenceView("iran_regional", "cc-publication-gap-002");
    expect(view).not.toBeNull();
    expect(view!.rows).toBeNull();
  });

  it("fails closed when an agreement references a claim outside the published population", () => {
    const scenario = scenarioById.get("roca-ua-only-001b")!;
    const entry = loadConflictBenchmarks("russia_ukraine").find(
      (e) => e.goldenKey === "roca-ua-only-001b",
    )!;
    const result = entry.result as ConflictScoredResultV1;
    const tampered: ConflictScoredResultV1 = {
      ...result,
      agreements: {
        corpusRecall: result.agreements!.corpusRecall,
        publishedRetention: [
          {
            unitId: "u0",
            lane: "frontline_maneuver",
            claims: [{ ...result.agreements!.publishedRetention[0].claims[0], claimId: 424242 }],
          },
        ],
      },
    };
    expect(() => publishedEvidenceRows(scenario, tampered)).toThrow(ConflictDomainError);
  });
});
