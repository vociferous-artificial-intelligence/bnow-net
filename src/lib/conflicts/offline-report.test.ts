// Offline report formatter tests (prompt §12 item G): benchmark-coverage
// language only, explicit numerators/denominators, unavailable ≠ zero, and
// no accuracy/truth wording.

import { describe, expect, it } from "vitest";
import type { ConflictResultV1 } from "./eval-profile";
import { loadConflictFixtureScenarios } from "./fixture-corpus";
import { scoreFixtureScenario } from "./goldens";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { LlmCompatibleMatcher } from "./llm-compatible-matcher";
import { formatConflictResultReport } from "./offline-report";

const scenarios = loadConflictFixtureScenarios();
const byId = new Map(scenarios.map((s) => [s.id, s]));

// accuracy/truth language is banned from every label surface (contract
// §5.9); "coverage" is the only sanctioned frame
const FORBIDDEN = /accura|truth|correctness|veracity|ground.?truth/i;

describe("formatConflictResultReport", () => {
  it("scored result: Key Takeaway benchmark coverage with explicit n/d, lanes, non-additive disclosure, stamps", async () => {
    const result = await scoreFixtureScenario(byId.get("roca-ua-only-001b")!);
    const report = formatConflictResultReport(result);
    expect(report).toContain("Key Takeaway benchmark coverage");
    expect(report).toContain("Expert-benchmark coverage");
    expect(report).toContain("1/1 declared Key Takeaways");
    expect(report).toContain("NON-ADDITIVE");
    expect(report).toContain("Matcher: kind fixture-oracle, label fixture-oracle");
    expect(report).toContain("END from cutoff");
    expect(report).not.toMatch(FORBIDDEN);
    // never labeled full-report coverage (contract §3)
    expect(report).not.toMatch(/full.?report coverage/i);
  });

  it("headline coverage always renders the §0 non-independence caveat", async () => {
    // NOTE: shipping this caveat in the offline report does NOT lift Phase
    // 6's own explainer obligation on its user-facing surfaces
    const result = await scoreFixtureScenario(byId.get("roca-ua-only-001b")!);
    const report = formatConflictResultReport(result);
    expect(report).toContain("ISW/CTP reads many of the same open sources");
    expect(report).toContain("agreement is not independent confirmation");
  });

  it("a stamp-stripped scored result REFUSES to render — no fabricated zeros", async () => {
    const result = await scoreFixtureScenario(byId.get("roca-ua-only-001b")!);
    if (result.state !== "scored") throw new Error("expected scored");
    const stripped = { ...result } as Record<string, unknown>;
    delete stripped.bnowOnly;
    expect(() =>
      formatConflictResultReport(stripped as unknown as ConflictResultV1),
    ).toThrowError(/MUST NOT be persisted/);
  });

  it("MIXED matcher rungs render BOTH per-population labels — never the degraded label beside k", async () => {
    const scenario = byId.get("roca-ua-only-001b")!;
    const claimId = scenario.evidence[0].claimId;
    // the corpus call's five rounds succeed (llm-majority); every retention
    // round fails → keyword fallback: a genuinely mixed-rung result
    let calls = 0;
    const matcher = new LlmCompatibleMatcher({
      votesK: 5,
      model: null,
      keywordFallback: new ConflictKeywordMatcher(),
      voteFn: async (round) => {
        if (round === 0) calls++;
        if (calls === 2) throw new Error("simulated transport failure");
        return JSON.stringify({ matches: [{ takeawayIndex: 0, claimId, confidence: 0.9 }] });
      },
    });
    const result = await scoreFixtureScenario(scenario, { matcher });
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.matcher!.corpusRecall.label).toBe("llm-majority");
    expect(result.matcher!.publishedRetention.label).toBe("keyword");
    const report = formatConflictResultReport(result);
    expect(report).toContain("MIXED rungs");
    expect(report).toContain("corpus recall llm-majority (k=5)");
    expect(report).toContain("published retention keyword — degraded");
    // the old single-line form would have read as "keyword with k=5"
    expect(report).not.toMatch(/label keyword, votes k=/);
    expect(report).not.toMatch(FORBIDDEN);
  });

  it("gulf-incomparable: the lane renders unavailable (incomparable evidence), the miss stays diagnosed", async () => {
    const result = await scoreFixtureScenario(byId.get("iran-gulf-unavailable-010b")!);
    const report = formatConflictResultReport(result);
    expect(report).toContain("unavailable (incomparable evidence)");
    expect(report).toContain("incomparable_coverage");
    expect(report).toContain("0/1 declared Key Takeaways"); // corpus recall
    expect(report).toContain("1/1 declared Key Takeaways"); // published retention
    expect(report).not.toMatch(FORBIDDEN);
  });

  it("publication gap: rendered as a provenance statement, never a zero", async () => {
    const result = await scoreFixtureScenario(byId.get("cc-publication-gap-002")!);
    const report = formatConflictResultReport(result);
    expect(report).toContain("UNAVAILABLE (publication gap)");
    expect(report).toContain("not a zero");
    expect(report).not.toContain("0/");
    expect(report).not.toMatch(FORBIDDEN);
  });

  it("unavailable snapshot kind: provenance statement naming the kind, no score", async () => {
    const result = await scoreFixtureScenario(byId.get("cc-state-unavailable-014")!, {
      kind: "operational_cutoff",
    });
    const report = formatConflictResultReport(result);
    expect(report).toContain("UNAVAILABLE (no_proven_snapshot)");
    expect(report).toContain("distinct from a zero");
    expect(report).not.toContain("declared Key Takeaways"); // no ratio rendered
    expect(report).not.toMatch(FORBIDDEN);
  });

  it("compound-partial: the partial diagnostic renders beside the headline, never inside it", async () => {
    const result = await scoreFixtureScenario(byId.get("roca-compound-partial-009b")!);
    const report = formatConflictResultReport(result);
    expect(report).toContain("0/1 declared Key Takeaways");
    expect(report).toContain("Partial diagnostic: 1 compound takeaway");
    expect(report).not.toMatch(FORBIDDEN);
  });
});
