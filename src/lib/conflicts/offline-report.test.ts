// Offline report formatter tests (prompt §12 item G): benchmark-coverage
// language only, explicit numerators/denominators, unavailable ≠ zero, and
// no accuracy/truth wording.

import { describe, expect, it } from "vitest";
import { loadConflictFixtureScenarios } from "./fixture-corpus";
import { scoreFixtureScenario } from "./goldens";
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
