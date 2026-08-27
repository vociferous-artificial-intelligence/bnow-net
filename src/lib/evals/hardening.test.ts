// QF-C 11-item hardening pins (stage-5 work; every gate here is dormant/
// default-off — nothing dispatches). Items covered elsewhere: MIN_LIVE_
// REPETITIONS + baseline degraded standard (gates.test.ts), SAF-m3
// (live-runner.test.ts), recursive scripts scan (isolation.test.ts itself),
// fresh-ack + DB-free union pins (hardening-cli.test.ts, subprocess).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnalysisEvalDataset, EvalResultsFile } from "./contracts";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { buildWorkloadScorecard, reportIdentityMismatch, offlineIdentity } = await import("./runner");
const { numericValues, numeralsPreserved, scoreMapCase } = await import("./score-map");
const { validateAnalysisEvalDataset } = await import("./contracts");

function loadCommitted(workload: string): { ds: AnalysisEvalDataset; rf: EvalResultsFile } {
  const ds = JSON.parse(
    readFileSync(`docs/evals/analysis/${workload}-v1.json`, "utf8"),
  ) as AnalysisEvalDataset;
  expect(validateAnalysisEvalDataset(ds)).toEqual([]);
  const rf = JSON.parse(
    readFileSync(`docs/evals/analysis/results/${workload}-offline-fixtures.json`, "utf8"),
  ) as EvalResultsFile;
  return { ds, rf };
}

describe("C-A6-1: report-time identity recompute", () => {
  it("a tampered promptHash degrades the verdict to insufficient_data", () => {
    const { ds, rf } = loadCommitted("map");
    const tampered: EvalResultsFile = {
      ...rf,
      identity: { ...rf.identity, promptHash: "f".repeat(64) },
    };
    const sc = buildWorkloadScorecard(ds, tampered, null, false, rf.datasetContentHash);
    expect(sc.verdictResult.verdict).toBe("insufficient_data");
    expect(sc.verdictResult.reasons.join(" ")).toMatch(/does not recompute from the current tree/);
    expect(sc.proposedRegistryEntry).toBeNull();
  });

  it("an untampered committed file recomputes cleanly (no false alarm)", () => {
    const { ds, rf } = loadCommitted("map");
    expect(reportIdentityMismatch(ds, rf)).toBeNull();
  });
});

describe("C-A6-2: live baseline gating", () => {
  function liveShaped(rf: EvalResultsFile, configKey: string, model: string, runTag: string): EvalResultsFile {
    const results = Object.fromEntries(
      Object.entries(rf.results).map(([k, r]) => [k, { ...r, runId: runTag }]),
    );
    return { ...rf, configKey, identity: { ...rf.identity, model }, results };
  }

  it("a baseline whose header/identity disagree with the filename expectation degrades", () => {
    const { ds, rf } = loadCommitted("map");
    const judged = liveShaped(rf, "gpt-5", "gpt-5", "run-judged");
    const baseline = liveShaped(rf, "something-else", "not-default", "run-base");
    const sc = buildWorkloadScorecard(ds, judged, baseline, true, rf.datasetContentHash, {
      configKey: "gpt-4o-mini",
      model: "gpt-4o-mini",
    });
    const reasons = sc.verdictResult.reasons.join(" ");
    expect(sc.verdictResult.verdict).toBe("insufficient_data");
    expect(reasons).toMatch(/does not match its filename-derived key/);
    expect(reasons).toMatch(/not the default baseline model/);
  });

  it("shared runIds between judged and baseline degrade as a self-comparison", () => {
    const { ds, rf } = loadCommitted("map");
    const judged = liveShaped(rf, "gpt-5", "gpt-5", "run-shared");
    const baseline = liveShaped(rf, "gpt-4o-mini", "gpt-4o-mini", "run-shared");
    const sc = buildWorkloadScorecard(ds, judged, baseline, true, rf.datasetContentHash, {
      configKey: "gpt-4o-mini",
      model: "gpt-4o-mini",
    });
    expect(sc.verdictResult.verdict).toBe("insufficient_data");
    expect(sc.verdictResult.reasons.join(" ")).toMatch(/self-comparison/);
  });
});

describe("SCI-3b: numeral-preservation instrument", () => {
  it("extracts digits and number-words as values", () => {
    expect(numericValues("four drones and 2 tankers, 3.5 km")).toEqual([2, 3.5, 4]);
    expect(numericValues("no numbers here")).toEqual([]);
  });

  it("thousands separators parse as magnitudes, never decimals", () => {
    expect(numericValues("1,000 troops")).toEqual([1000]);
    expect(numericValues("1,000,000 rounds")).toEqual([1000000]);
    expect(numeralsPreserved("1,000 troops moved", "about 1000 troops moved")).toBe(true);
    expect(numeralsPreserved("1,000 troops moved", "1 truck moved")).toBe(false);
  });

  it("numeralsPreserved requires every reference value in the candidate", () => {
    expect(numeralsPreserved("four drones struck", "4 drones reportedly struck")).toBe(true);
    expect(numeralsPreserved("four drones struck", "five drones reportedly struck")).toBe(false);
    expect(numeralsPreserved("a strike occurred", "the strike hit 3 depots")).toBe(true);
  });

  it("is opt-in per case: checkNumerals flags a changed number as a failure", () => {
    const mk = (checkNumerals: boolean) =>
      ({
        id: "map-num-pin",
        workload: "map",
        partition: "typical",
        split: "development",
        provenance: "test",
        input: {
          theater: "ua",
          track: "military",
          docs: [
            {
              docId: 1,
              day: "2027-01-10",
              title: null,
              content: "Officials said four drones struck the depot near the bridge.",
              sourceKey: "s.example",
              reliability: 0.5,
            },
          ],
        },
        reference: {
          ...(checkNumerals ? { checkNumerals: true } : {}),
          expected: [
            {
              docId: 1,
              claims: [
                {
                  textGist: "four drones struck the depot near the bridge",
                  hedging: "claimed",
                },
              ],
            },
          ],
        },
      }) as never;
    const raw = JSON.stringify({
      results: [
        {
          docId: 1,
          claims: [
            {
              text_en: "five drones struck the depot near the bridge",
              quote_orig: null,
              claim_type: "factual",
              hedging: "claimed",
              entities: [],
              event_hint: null,
            },
          ],
        },
      ],
    });
    const flagged = scoreMapCase(mk(true), raw);
    expect(flagged.numeralMisses).toBe(1);
    expect(flagged.pass).toBe(false);
    const unflagged = scoreMapCase(mk(false), raw);
    expect(unflagged.numeralMisses).toBe(0);
  });
});

describe("A8-F1: scored-pair alignment excludes degraded pairs (direct pin)", () => {
  it("a schema-invalid row on one side removes the pair from the quality population, visibly", async () => {
    const { alignedComparison } = await import("./runner");
    const { ds, rf } = loadCommitted("map");
    const anyKey = Object.keys(rf.results)[0];
    const degradedBaseline: EvalResultsFile = {
      ...rf,
      results: {
        ...rf.results,
        [anyKey]: { ...rf.results[anyKey], status: "schema_invalid" },
      },
    };
    // v1 map results already contain deliberate fail-fixtures with degraded
    // statuses, so assert RELATIVE to the self-comparison baseline
    const before = alignedComparison(ds, rf, rf);
    const cmp = alignedComparison(ds, rf, degradedBaseline);
    expect(cmp.excludedDegradedPairs).toBe(before.excludedDegradedPairs + 1);
    expect(cmp.scoredAlignedKeys).toBe(before.scoredAlignedKeys - 1);
  });
});
