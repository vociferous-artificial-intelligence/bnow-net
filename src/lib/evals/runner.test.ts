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

import type {
  AnalysisEvalDataset,
  EvalResultsFile,
  MapEvalCase,
  ValidationEvalCase,
} from "./contracts";
import {
  OFFLINE_CONFIG_KEY,
  ZERO_METER,
  aggregateResults,
  alignedComparison,
  assertLiveOnlySelection,
  buildAnalysisEstimatePlan,
  buildCandidatePrompt,
  buildWorkloadScorecard,
  computeCompleteness,
  classifyCaseApplicability,
  currentEnvKnobs,
  datasetPromptHash,
  emptyEvalResultsFile,
  liveConfigKey,
  mergedScope,
  mergeEvalResults,
  offlineIdentity,
  pendingWork,
  renderAnalysisScorecardMarkdown,
  resumeIdentityMismatch,
  runScopeFor,
  scoreOfflineCase,
  sha256,
  type ResultsFileHeader,
} from "./runner";

const EVALS_DIR = join(__dirname, "..", "..", "..", "docs", "evals", "analysis");
const load = (f: string) => JSON.parse(readFileSync(join(EVALS_DIR, f), "utf8")) as AnalysisEvalDataset;

// the ACTIVE datasets the runner loads (corpus-v2 union files where bumped),
// so the leakage sentinel / estimate / pendingWork coverage includes the c2
// cases; reduce stays on v1 and an explicit v1-bytes test below keeps the
// frozen contract exercised
const MAP_DS = load("map-v2.json");
const REDUCE_DS = load("reduce-v1.json");
const DIGEST_DS = load("digest-v2.json");
const VALIDATION_DS = load("validation-v2.json");
const ALL = [MAP_DS, REDUCE_DS, DIGEST_DS, VALIDATION_DS];

function mkHeader(ds: AnalysisEvalDataset, overrides: Partial<ResultsFileHeader> = {}): ResultsFileHeader {
  return {
    workload: ds.workload,
    configKey: OFFLINE_CONFIG_KEY,
    datasetVersion: ds.datasetVersion,
    datasetContentHash: sha256(`content:${ds.datasetVersion}`),
    identity: offlineIdentity(ds),
    requestedRepetitions: 1,
    scope: "full",
    envKnobs: currentEnvKnobs(),
    ...overrides,
  };
}

function runAll(ds: AnalysisEvalDataset, headerOverrides: Partial<ResultsFileHeader> = {}): EvalResultsFile {
  const header = mkHeader(ds, headerOverrides);
  let rf = emptyEvalResultsFile(header);
  for (const c of ds.cases) {
    if (header.scope === "dev" && c.split === "heldout") continue;
    rf = mergeEvalResults(rf, header, [scoreOfflineCase(c, ds.datasetVersion, "unit")], ZERO_METER);
  }
  return rf;
}

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

  it("--dev excludes the heldout split entirely and stamps scope 'dev'", () => {
    const { work, excludedHeldout } = pendingWork(MAP_DS, null, {
      repetitions: 1,
      fresh: false,
      onlyIds: null,
      devOnly: true,
    });
    expect(excludedHeldout).toBeGreaterThan(0);
    expect(work.every((w) => w.evalCase.split !== "heldout")).toBe(true);
    expect(runScopeFor(null, true)).toBe("dev");
    expect(runScopeFor(["some-id"], false)).toBe("subset");
    expect(runScopeFor(null, false)).toBe("full");
  });

  it("m9: heldout per-case failure detail is hidden in the default report render", () => {
    const rf = runAll(MAP_DS);
    const sc = buildWorkloadScorecard(MAP_DS, rf, null, false);
    const detail = [{
      workload: "map",
      configKey: OFFLINE_CONFIG_KEY,
      results: Object.values(rf.results),
      splitOf: Object.fromEntries(MAP_DS.cases.map((c) => [c.id, c.split])),
    }];
    const hidden = renderAnalysisScorecardMarkdown({ generatedAt: "t", scorecards: [sc], detail });
    // map-adv-002 is a heldout case whose fixture deliberately follows the
    // injection — its failure text must NOT leak through the default output
    expect(hidden).toContain("| map-adv-002-injection-followed | 0 | heldout | scored | no | (hidden) |");
    expect(hidden).not.toContain("ZERAPH");
    const shown = renderAnalysisScorecardMarkdown({ generatedAt: "t", scorecards: [sc], detail, showHeldoutDetail: true });
    expect(shown).toContain("ZERAPH-DIRECTIVE");
  });
});

describe("resume semantics + MAJOR-3 identity assertion", () => {
  it("skips completed keys, reruns them under --fresh, and --only forces exactly its ids", () => {
    const header = mkHeader(REDUCE_DS);
    const first = scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "run-1");
    const rf = mergeEvalResults(emptyEvalResultsFile(header), header, [first], ZERO_METER);

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

    const header = mkHeader(REDUCE_DS);
    const r0 = scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "run-1");
    let rf = mergeEvalResults(null, header, [r0], { attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 });
    rf = mergeEvalResults(rf, header, [{ ...r0, repetition: 1 }], { attempts: 3, reservations: 3, meterings: 2, erroredAttempts: 1 });
    expect(rf.meter).toEqual({ attempts: 5, reservations: 5, meterings: 4, erroredAttempts: 1 });
  });

  it("REFUSES a resume whose promptHash changed (MAJOR-3)", () => {
    const header = mkHeader(REDUCE_DS);
    const rf = mergeEvalResults(null, header, [scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "r")], ZERO_METER);
    const drifted = mkHeader(REDUCE_DS, {
      identity: { ...header.identity, promptHash: sha256("a-new-prompt") },
    });
    expect(resumeIdentityMismatch(rf, drifted)).toContain("promptHash");
    expect(() => mergeEvalResults(rf, drifted, [], ZERO_METER)).toThrow(/identity changed — use --fresh or a new configKey/);
  });

  it("REFUSES a resume after a dataset content edit (datasetContentHash change)", () => {
    const header = mkHeader(REDUCE_DS);
    const rf = mergeEvalResults(null, header, [scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "r")], ZERO_METER);
    const editedReference = mkHeader(REDUCE_DS, { datasetContentHash: sha256("edited dataset bytes") });
    expect(resumeIdentityMismatch(rf, editedReference)).toContain("datasetContentHash");
    expect(() => mergeEvalResults(rf, editedReference, [], ZERO_METER)).toThrow(/identity changed/);
  });

  it("REFUSES a resume under different env knobs or repetitions; scope merges by rule", () => {
    const header = mkHeader(REDUCE_DS);
    const rf = mergeEvalResults(null, header, [], ZERO_METER);
    const knobDrift = mkHeader(REDUCE_DS, { envKnobs: { ...header.envKnobs, reduceVotes: 3 } });
    expect(resumeIdentityMismatch(rf, knobDrift)).toContain("envKnobs");
    const repDrift = mkHeader(REDUCE_DS, { requestedRepetitions: 3 });
    expect(resumeIdentityMismatch(rf, repDrift)).toContain("requestedRepetitions");

    expect(mergedScope(null, "dev")).toBe("dev");
    expect(mergedScope("dev", "full")).toBe("full"); // a full run completes the file
    expect(mergedScope("full", "subset")).toBe("full"); // --only preserves coverage
    expect(mergedScope("dev", "subset")).toBe("dev");
    expect(mergedScope("full", "dev")).toBe("full");
  });
});

describe("estimate mode", () => {
  it("is conservative, per-workload, and never dispatches (reduce estimates zero calls)", () => {
    const reduce = buildAnalysisEstimatePlan(REDUCE_DS, "gpt-5-mini", 1);
    expect(reduce.totalCalls).toBe(0);
    expect(reduce.totalUsd).toBe(0);

    // corpus-v2: baseline-inapplicable capacity cases cost ZERO calls (they
    // are never dispatched); applicable cases cost exactly one each
    const knobs = currentEnvKnobs();
    const applicableMap = MAP_DS.cases.filter((c) => classifyCaseApplicability(c, knobs).applicable).length;
    expect(applicableMap).toBe(24); // 34 minus the 10 depth-requiring cases
    const map = buildAnalysisEstimatePlan(MAP_DS, "gpt-5-mini", 2);
    expect(map.totalCalls).toBe(applicableMap * 2);
    expect(map.rows.filter((r) => r.calls === 0).length).toBe(MAP_DS.cases.length - applicableMap);
    expect(map.totalUsd).toBeGreaterThan(0);

    const digest = buildAnalysisEstimatePlan(DIGEST_DS, "gpt-5-mini", 1);
    // K=5 synthesis votes per digest case (ruling 18's shipped configuration);
    // dig-c2-cap-003 (exact fed 400) is baseline-inapplicable
    const applicableDigest = DIGEST_DS.cases.filter((c) => classifyCaseApplicability(c, knobs).applicable).length;
    expect(applicableDigest).toBe(DIGEST_DS.cases.length - 1);
    expect(digest.totalCalls).toBe(applicableDigest * 5);
  });
});

describe("completeness (MAJOR-1) + aggregation over the committed datasets", () => {
  it("every committed fixture behaves exactly as its declared expectation (the machinery proof)", () => {
    const knobs = currentEnvKnobs();
    for (const ds of ALL) {
      const rf = runAll(ds);
      const agg = aggregateResults(ds, rf, false);
      // corpus-v2: baseline-inapplicable capacity cases are recorded but are
      // NOT machinery data points; every APPLICABLE fixture must match
      const applicable = ds.cases.filter((c) => classifyCaseApplicability(c, knobs).applicable).length;
      expect(agg.machinery.total, ds.workload).toBe(applicable);
      expect(agg.machinery.matched, ds.workload).toBe(applicable);
      expect(agg.cases.inapplicable, ds.workload).toBe(ds.cases.length - applicable);
      expect(agg.completeness.complete, ds.workload).toBe(true);
      expect(agg.completeness.missingResults, ds.workload).toBe(0);
    }
  });

  it("a --dev file is INCOMPLETE and its verdict is insufficient_data even when every check passes", () => {
    const rf = runAll(REDUCE_DS, { scope: "dev" });
    const c = computeCompleteness(REDUCE_DS, rf);
    const heldoutCount = REDUCE_DS.cases.filter((x) => x.split === "heldout").length;
    expect(c.complete).toBe(false);
    expect(c.missingResults).toBe(heldoutCount);
    expect(c.missingHeldout).toBe(heldoutCount);
    expect(c.heldoutPresent).toEqual({ typical: 0, edge: 0, adversarial: 0 });
    const sc = buildWorkloadScorecard(REDUCE_DS, rf, null, false);
    expect(sc.verdictResult.verdict).toBe("insufficient_data");
    expect(sc.verdictResult.reasons.some((r) => r.includes('scope is "dev"'))).toBe(true);
  });

  it("missing repetitions count as missing keys (reps >= 2 arithmetic)", () => {
    const header = mkHeader(REDUCE_DS, { requestedRepetitions: 2 });
    let rf = emptyEvalResultsFile(header);
    for (const c of REDUCE_DS.cases) {
      // record repetition 0 only — every repetition-1 key is missing
      rf = mergeEvalResults(rf, header, [scoreOfflineCase(c, REDUCE_DS.datasetVersion, "unit")], ZERO_METER);
    }
    const comp = computeCompleteness(REDUCE_DS, rf);
    expect(comp.expectedResults).toBe(REDUCE_DS.cases.length * 2);
    expect(comp.missingResults).toBe(REDUCE_DS.cases.length);
    expect(comp.complete).toBe(false);
  });

  it("the map fixture config trips the hard gates it was designed to demonstrate", () => {
    const rf = runAll(MAP_DS);
    const agg = aggregateResults(MAP_DS, rf, false);
    expect(agg.gate.wrongDocIdsTotal).toBeGreaterThan(0);
    expect(agg.gate.strengthenedHedgesTotal).toBeGreaterThan(0);
    expect(agg.gate.injectionFollowedCases).toBeGreaterThan(0);
    expect(agg.bySplit.heldout.results).toBeGreaterThan(0);
    expect(agg.byPartition.adversarial.results).toBeGreaterThan(0);
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

  it("MAJOR-2: alignedComparison intersects (caseId, repetition) keys and isolates the heldout subset", () => {
    const judged = runAll(DIGEST_DS);
    // baseline missing two cases (one of them heldout)
    const header = mkHeader(DIGEST_DS, { configKey: "gpt-4o-mini" });
    let baseline = emptyEvalResultsFile(header);
    const heldoutId = DIGEST_DS.cases.find((c) => c.split === "heldout")!.id;
    const devId = DIGEST_DS.cases.find((c) => c.split === "development")!.id;
    for (const c of DIGEST_DS.cases) {
      if (c.id === heldoutId || c.id === devId) continue;
      baseline = mergeEvalResults(baseline, header, [scoreOfflineCase(c, DIGEST_DS.datasetVersion, "b")], ZERO_METER);
    }
    const aligned = alignedComparison(DIGEST_DS, judged, baseline);
    expect(aligned.alignedKeys).toBe(DIGEST_DS.cases.length - 2);
    const heldoutTotal = DIGEST_DS.cases.filter((c) => c.split === "heldout").length;
    expect(aligned.alignedHeldoutKeys).toBe(heldoutTotal - 1);
    expect(Number.isNaN(aligned.judgedQuality.checksPassRate)).toBe(false);
  });

  it("renders completeness, slices, and identity into the scorecard", () => {
    const rf = runAll(DIGEST_DS);
    const sc = buildWorkloadScorecard(DIGEST_DS, rf, null, false);
    const md = renderAnalysisScorecardMarkdown({
      generatedAt: "2026-08-17T00:00:00Z",
      scorecards: [sc],
      detail: [{
        workload: "digest",
        configKey: OFFLINE_CONFIG_KEY,
        results: Object.values(rf.results),
        splitOf: Object.fromEntries(DIGEST_DS.cases.map((c) => [c.id, c.split])),
      }],
      headerNote: "unit-test render",
    });
    expect(md).toContain("machinery proof");
    expect(md).toContain("completeness | scope=full");
    expect(md).toContain("split: heldout (gated)");
    expect(md).toContain("partition: adversarial");
    expect(md).toContain("VERDICT");
    expect(md).toContain("dig-adv-002-r1-drop-wash");
  });
});

describe("re-review minor 1: report-time dataset staleness", () => {
  it("an edited dataset flips a previously-pass-capable scorecard to insufficient_data", () => {
    const bytes = readFileSync(join(EVALS_DIR, "reduce-v1.json"));
    const currentHash = sha256(bytes);
    const editedHash = sha256(bytes.toString("utf8").replace('"expectTogether"', '"expectTogether "'));
    expect(editedHash).not.toBe(currentHash);

    // a complete judged file + complete baseline over the SAME recorded hash:
    // pass-capable against the dataset those runs actually saw
    const judged = runAll(REDUCE_DS, { datasetContentHash: currentHash });
    const baseline = runAll(REDUCE_DS, { configKey: "gpt-4o-mini", datasetContentHash: currentHash });
    const fresh = buildWorkloadScorecard(REDUCE_DS, judged, baseline, false, currentHash);
    expect(fresh.verdictResult.verdict).toBe("pass");

    // same files reported after a reference edit: the CURRENT dataset hash no
    // longer matches what the runs recorded — verdict degrades, deltas drop
    const stale = buildWorkloadScorecard(REDUCE_DS, judged, baseline, false, editedHash);
    expect(stale.verdictResult.verdict).toBe("insufficient_data");
    expect(stale.verdictResult.reasons[0]).toContain("dataset changed since this run");
    expect(stale.verdictResult.deltas).toBeNull();
    expect(stale.proposedRegistryEntry).toBeNull();
  });
});

describe("re-review minor 2: heldout re-roll opacity", () => {
  it("2a: a live --only selection touching heldout refuses without --allow-heldout-rerun", () => {
    const heldoutId = REDUCE_DS.cases.find((c) => c.split === "heldout")!.id;
    const devId = REDUCE_DS.cases.find((c) => c.split === "development")!.id;
    expect(() => assertLiveOnlySelection(REDUCE_DS, [devId, heldoutId], false)).toThrow(/HELDOUT[\s\S]*--allow-heldout-rerun/);
    expect(() => assertLiveOnlySelection(REDUCE_DS, [devId, heldoutId], true)).not.toThrow();
    expect(() => assertLiveOnlySelection(REDUCE_DS, [devId], false)).not.toThrow();
    expect(() => assertLiveOnlySelection(REDUCE_DS, null, false)).not.toThrow();
  });

  it("2b: a heterogeneous-run file is visible on its face (mixed-run indicator)", () => {
    const header = mkHeader(REDUCE_DS);
    let rf = emptyEvalResultsFile(header);
    for (const c of REDUCE_DS.cases) {
      rf = mergeEvalResults(rf, header, [scoreOfflineCase(c, REDUCE_DS.datasetVersion, "run-sweep")], ZERO_METER);
    }
    // a later targeted rerun replaces one key under a NEW runId
    const rerolled = { ...scoreOfflineCase(REDUCE_DS.cases[0], REDUCE_DS.datasetVersion, "run-reroll") };
    rf = mergeEvalResults(rf, header, [rerolled], ZERO_METER);
    const agg = aggregateResults(REDUCE_DS, rf, false);
    expect(agg.runs.mixedRun).toBe(true);
    expect(agg.runs.distinctRunIds).toEqual(["run-reroll", "run-sweep"]);
    expect(agg.runs.keysByRunId["run-reroll"]).toBe(1);
    expect(agg.runs.keysByRunId["run-sweep"]).toBe(REDUCE_DS.cases.length - 1);

    const sc = buildWorkloadScorecard(REDUCE_DS, rf, null, false);
    const md = renderAnalysisScorecardMarkdown({
      generatedAt: "t",
      scorecards: [sc],
      detail: [{ workload: "reduce", configKey: OFFLINE_CONFIG_KEY, results: Object.values(rf.results), splitOf: {} }],
    });
    expect(md).toContain("MIXED-RUN FILE");
    expect(md).toContain("run-reroll=1");

    // a single-run file carries no mixed-run flag
    const clean = aggregateResults(REDUCE_DS, runAll(REDUCE_DS), false);
    expect(clean.runs.mixedRun).toBe(false);
  });
});

describe("m7: vacuous precision handling in validation quality", () => {
  it("excludes vacuous (null) match-set precision from the mean and counts it", () => {
    const ds = VALIDATION_DS;
    const rf = runAll(ds);
    const agg = aggregateResults(ds, rf, false);
    // the committed set includes cases whose match-set predicts nothing on a
    // null-labelled takeaway (precision null = vacuous) — those must be
    // counted, not folded into the mean
    expect(agg.quality.matchSetPrecisionVacuousCount).toBeGreaterThan(0);
    expect(agg.quality.matchSetPrecision).not.toBeNaN();
    expect(agg.quality.matchSetPrecision).toBeLessThanOrEqual(1);
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
    const knobs = currentEnvKnobs();
    expect(knobs.reduceVotes).toBe(5);
    expect(knobs.mapOutTokensPerDoc).toBe(200);
  });
});

describe("provider/DB isolation of the non-live paths", () => {
  it("no OpenAI client was constructed and no DB was touched by anything this file ran", () => {
    expect(openAiCtor).not.toHaveBeenCalled();
    expect(poolCtor).not.toHaveBeenCalled();
    expect(dbTouched).not.toHaveBeenCalled();
  });
});
