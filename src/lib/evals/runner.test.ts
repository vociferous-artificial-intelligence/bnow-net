import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// ---- provider/DB isolation spies (hoisted before any import below) -----------
// The estimate/offline/report paths must construct NO OpenAI client and open NO
// DB connection. These mocks replace the SDK and the serverless driver with
// constructor spies; the whole test file then exercises every non-live mode
// end-to-end over the REAL committed datasets and asserts the spies stayed
// silent.
const openAiCtor = vi.hoisted(() => vi.fn());
const poolCtor = vi.hoisted(() => vi.fn());
const dbTouched = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(opts?: unknown) {
      openAiCtor(opts);
    }
  },
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class MockPool {
    constructor(opts?: unknown) {
      poolCtor(opts);
    }
  },
  neon: () => {
    dbTouched();
    return () => Promise.reject(new Error("no DB in eval unit tests"));
  },
}));
vi.mock("@/db", () => {
  dbTouched();
  return { rawSql: { query: dbTouched } };
});

import type { AnalysisEvalDataset, MapEvalCase, ValidationEvalCase } from "./contracts";
import {
  OFFLINE_CONFIG_KEY,
  ZERO_METER,
  aggregateResults,
  buildAnalysisEstimatePlan,
  buildCandidatePrompt,
  buildWorkloadScorecard,
  datasetPromptHash,
  emptyEvalResultsFile,
  liveConfigKey,
  mergeEvalResults,
  offlineIdentity,
  pendingWork,
  renderAnalysisScorecardMarkdown,
  scoreOfflineCase,
} from "./runner";

const EVALS_DIR = join(__dirname, "..", "..", "..", "docs", "evals", "analysis");
const load = (f: string) => JSON.parse(readFileSync(join(EVALS_DIR, f), "utf8")) as AnalysisEvalDataset;

const MAP_DS = load("map-v1.json");
const REDUCE_DS = load("reduce-v1.json");
const DIGEST_DS = load("digest-v1.json");
const VALIDATION_DS = load("validation-v1.json");
const ALL = [MAP_DS, REDUCE_DS, DIGEST_DS, VALIDATION_DS];

describe("leakage prevention", () => {
  it("candidate prompts are built from input ONLY — a reference sentinel never appears", () => {
    const sentinel = "REFERENCE-SENTINEL-9F2C";
    const c: MapEvalCase = {
      id: "map-leak-probe",
      workload: "map",
      partition: "typical",
      split: "development",
      provenance: "test",
      input: {
        theater: "ua",
        track: "military",
        docs: [{ docId: 1, title: null, content: "A synthetic strike report about a depot.", lang: "en", day: "2026-08-01" }],
      },
      reference: {
        expected: [{ docId: 1, claims: [{ textGist: `gold answer ${sentinel}`, hedging: "claimed" }] }],
        mustMatch: [sentinel],
        mustNotMatch: [sentinel],
      },
      offline: { fixtureId: "t", rawOutput: "{}", expectation: "pass" },
    };
    const p = buildCandidatePrompt(c);
    expect(p.system).not.toContain(sentinel);
    expect(p.user).not.toContain(sentinel);
    expect(p.user).toContain("synthetic strike report"); // input DOES flow

    const v = VALIDATION_DS.cases[0] as ValidationEvalCase;
    const probe: ValidationEvalCase = JSON.parse(JSON.stringify(v));
    probe.reference.labels = [{ takeawayIndex: probe.input.takeaways[0].index, claimId: null }];
    (probe.reference as { notes?: string }).notes = sentinel;
    const vp = buildCandidatePrompt(probe);
    expect(vp.system + vp.user).not.toContain(sentinel);
  });

  it("--dev excludes the heldout split entirely", () => {
    const { work, excludedHeldout } = pendingWork(MAP_DS, null, {
      repetitions: 1,
      fresh: false,
      onlyIds: null,
      devOnly: true,
    });
    expect(excludedHeldout).toBeGreaterThan(0);
    expect(work.every((w) => w.evalCase.split !== "heldout")).toBe(true);
  });
});

describe("resume semantics (resumable by (caseId, repetition))", () => {
  const identity = offlineIdentity(REDUCE_DS);
  const base = {
    workload: REDUCE_DS.workload,
    configKey: OFFLINE_CONFIG_KEY,
    datasetVersion: REDUCE_DS.datasetVersion,
    identity,
  };

  it("skips completed keys, reruns them under --fresh, and --only forces exactly its ids", () => {
    const first = scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "run-1");
    const rf = mergeEvalResults(emptyEvalResultsFile(REDUCE_DS.workload, OFFLINE_CONFIG_KEY, REDUCE_DS.datasetVersion, identity), base, [first], ZERO_METER);

    const resumed = pendingWork(REDUCE_DS, rf, { repetitions: 1, fresh: false, onlyIds: null, devOnly: false });
    expect(resumed.work.length).toBe(REDUCE_DS.cases.length - 1);
    expect(resumed.work.some((w) => w.evalCase.id === REDUCE_DS.cases[0].id)).toBe(false);

    const fresh = pendingWork(REDUCE_DS, rf, { repetitions: 1, fresh: true, onlyIds: null, devOnly: false });
    expect(fresh.work.length).toBe(REDUCE_DS.cases.length);

    const only = pendingWork(REDUCE_DS, rf, {
      repetitions: 1,
      fresh: false,
      onlyIds: [REDUCE_DS.cases[0].id, "not-a-case"],
      devOnly: false,
    });
    expect(only.work.map((w) => w.evalCase.id)).toEqual([REDUCE_DS.cases[0].id]); // forced rerun
    expect(only.unknownIds).toEqual(["not-a-case"]); // surfaced for the caller to refuse on
  });

  it("repetitions expand the work keys and merge accumulates the meter", () => {
    const { work } = pendingWork(REDUCE_DS, null, { repetitions: 3, fresh: false, onlyIds: [REDUCE_DS.cases[0].id], devOnly: false });
    expect(work.map((w) => w.repetition)).toEqual([0, 1, 2]);

    const r0 = scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "run-1");
    let rf = mergeEvalResults(null, base, [r0], { attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 });
    rf = mergeEvalResults(rf, base, [{ ...r0, repetition: 1 }], { attempts: 3, reservations: 3, meterings: 2, erroredAttempts: 1 });
    expect(rf.meter).toEqual({ attempts: 5, reservations: 5, meterings: 4, erroredAttempts: 1 });
    expect(Object.keys(rf.results).sort()).toEqual([`${REDUCE_DS.cases[0].id}#r0`, `${REDUCE_DS.cases[0].id}#r1`]);
  });
});

describe("estimate mode", () => {
  it("is conservative, per-workload, and never dispatches (reduce estimates zero calls)", () => {
    const reduce = buildAnalysisEstimatePlan(REDUCE_DS, "gpt-5-mini", 1);
    expect(reduce.totalCalls).toBe(0);
    expect(reduce.totalUsd).toBe(0);

    const map = buildAnalysisEstimatePlan(MAP_DS, "gpt-5-mini", 2);
    expect(map.totalCalls).toBe(MAP_DS.cases.length * 2);
    expect(map.totalUsd).toBeGreaterThan(0);

    const digest = buildAnalysisEstimatePlan(DIGEST_DS, "gpt-5-mini", 1);
    // K=5 synthesis votes per digest case (ruling 18's shipped configuration)
    expect(digest.totalCalls).toBe(DIGEST_DS.cases.length * 5);
  });
});

describe("offline scoring + aggregation over the committed datasets", () => {
  function runAll(ds: AnalysisEvalDataset) {
    const identity = offlineIdentity(ds);
    let rf = emptyEvalResultsFile(ds.workload, OFFLINE_CONFIG_KEY, ds.datasetVersion, identity);
    const base = { workload: ds.workload, configKey: OFFLINE_CONFIG_KEY, datasetVersion: ds.datasetVersion, identity };
    for (const c of ds.cases) {
      rf = mergeEvalResults(rf, base, [scoreOfflineCase(c, ds.datasetVersion, "unit")], ZERO_METER);
    }
    return rf;
  }

  it("every committed fixture behaves exactly as its declared expectation (the machinery proof)", () => {
    for (const ds of ALL) {
      const rf = runAll(ds);
      const agg = aggregateResults(ds, rf, false);
      expect(agg.machinery.total, ds.workload).toBe(ds.cases.length);
      expect(agg.machinery.matched, ds.workload).toBe(ds.cases.length);
    }
  });

  it("the map fixture config trips the hard gates it was designed to demonstrate", () => {
    const rf = runAll(MAP_DS);
    const agg = aggregateResults(MAP_DS, rf, false);
    expect(agg.gate.wrongDocIdsTotal).toBeGreaterThan(0);
    expect(agg.gate.strengthenedHedgesTotal).toBeGreaterThan(0);
    expect(agg.gate.injectionFollowedCases).toBeGreaterThan(0);
    const sc = buildWorkloadScorecard(MAP_DS, rf, null, false);
    expect(sc.verdictResult.verdict).toBe("fail");
    expect(sc.proposedRegistryEntry).toBeNull();
  });

  it("clean workloads verdict insufficient_data without a baseline (never pass on candidate-only numbers)", () => {
    const rf = runAll(REDUCE_DS);
    const sc = buildWorkloadScorecard(REDUCE_DS, rf, null, false);
    expect(sc.judged.checks.passed).toBe(REDUCE_DS.cases.length);
    expect(sc.verdictResult.verdict).toBe("insufficient_data");
  });

  it("renders a scorecard that labels identity, split coverage, and verdict", () => {
    const rf = runAll(DIGEST_DS);
    const sc = buildWorkloadScorecard(DIGEST_DS, rf, null, false);
    const md = renderAnalysisScorecardMarkdown({
      generatedAt: "2026-08-17T00:00:00Z",
      scorecards: [sc],
      detail: [{ workload: "digest", configKey: OFFLINE_CONFIG_KEY, results: Object.values(rf.results) }],
      headerNote: "unit-test render",
    });
    expect(md).toContain("machinery proof");
    expect(md).toContain("heldout coverage");
    expect(md).toContain("VERDICT");
    expect(md).toContain("dig-adv-002-r1-drop-wash");
  });
});

describe("configuration identity", () => {
  it("prompt hashes are deterministic and workload-distinct; map identity carries extractor versions", () => {
    expect(datasetPromptHash(MAP_DS)).toBe(datasetPromptHash(MAP_DS));
    expect(datasetPromptHash(MAP_DS)).not.toBe(datasetPromptHash(DIGEST_DS));
    const id = offlineIdentity(MAP_DS);
    expect(id.approval).toBe("baseline");
    expect(id.extractorVersion).toContain("military/ua=");
    expect(offlineIdentity(REDUCE_DS).extractorVersion).toBeUndefined();
    expect(liveConfigKey("gpt-5-mini", "low")).toBe("gpt-5-mini@low");
    expect(liveConfigKey("gpt-5-mini", null)).toBe("gpt-5-mini");
  });
});

describe("provider/DB isolation of the non-live paths", () => {
  it("no OpenAI client was constructed and no DB was touched by anything this file ran", () => {
    expect(openAiCtor).not.toHaveBeenCalled();
    expect(poolCtor).not.toHaveBeenCalled();
    expect(dbTouched).not.toHaveBeenCalled();
  });
});
