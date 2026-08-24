// Conflict validation-workload profile tests (Phase 5, Gate-5 evidence):
// the built conflict datasets pass the INHERITED dataset validator; building
// is deterministic; offline scoring runs the real conflict pipeline and the
// additive payload rides validated; golden divergence is detected with
// VALUE-FREE failures; resume/repetition/result-key semantics are the
// inherited ones, untouched; the requested-k obligation (Gate-4 science
// NOTE-3) is pinned at the runGroupKey level; and the module is structurally
// provider-free.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateConflictCaseMetaV1, validateConflictResultIdentityV1 } from "../conflicts/eval-profile";
import { loadConflictFixtureScenarios } from "../conflicts/fixture-corpus";
import { stableStringify } from "../conflicts/serialization";
import { validateAnalysisEvalDataset, resultKey, type ValidationEvalCase } from "./contracts";
import {
  CONFLICT_CASE_PLANS,
  CONFLICT_DATASET_CREATED_AT,
  buildConflictEvalRun,
  conflictDatasetContentHash,
  conflictDatasetSourceFiles,
  divergentPaths,
  renderConflictSectionMarkdown,
  scoreConflictOfflineCase,
  type ConflictEvalRun,
  type ConflictValidationCaseChecks,
} from "./conflict-validation-profile";
import {
  OFFLINE_CONFIG_KEY,
  ZERO_METER,
  currentEnvKnobs,
  sha256,
  emptyEvalResultsFile,
  mergeEvalResults,
  offlineIdentity,
  pendingWork,
  resumeIdentityMismatch,
  runScopeFor,
  type ResultsFileHeader,
} from "./runner";

const CONFLICTS = ["russia_ukraine", "iran_regional"] as const;
const runs: Record<(typeof CONFLICTS)[number], ConflictEvalRun> = {
  russia_ukraine: buildConflictEvalRun("russia_ukraine"),
  iran_regional: buildConflictEvalRun("iran_regional"),
};

function headerFor(run: ConflictEvalRun): ResultsFileHeader {
  return {
    workload: "validation",
    configKey: OFFLINE_CONFIG_KEY,
    datasetVersion: run.dataset.datasetVersion,
    datasetContentHash: run.contentHash,
    identity: offlineIdentity(run.dataset),
    requestedRepetitions: 1,
    scope: runScopeFor(null, false),
    envKnobs: currentEnvKnobs(),
  };
}

describe("inherited dataset validation (Gate-5 requirement)", () => {
  for (const id of CONFLICTS) {
    it(`the built ${id} dataset passes validateAnalysisEvalDataset as a validation dataset`, () => {
      expect(validateAnalysisEvalDataset(runs[id].dataset)).toEqual([]);
      expect(validateAnalysisEvalDataset(runs[id].dataset, "validation")).toEqual([]);
    });
  }

  it("dataset ids/workload are the eval-profile pins; every case's conflict meta and expected golden validate", () => {
    expect(runs.russia_ukraine.dataset.datasetVersion).toBe("conflict-roca-v1");
    expect(runs.iran_regional.dataset.datasetVersion).toBe("conflict-iran-v1");
    for (const id of CONFLICTS) {
      expect(runs[id].dataset.workload).toBe("validation");
      for (const c of runs[id].dataset.cases) {
        const ref = (c as ValidationEvalCase).reference as unknown as Record<string, unknown>;
        expect(validateConflictCaseMetaV1(ref.conflictMeta)).toEqual([]);
        expect(validateConflictResultIdentityV1(ref.conflictResultV1)).toEqual([]);
      }
    }
  });

  it("heldout coverage per conflict clears the inherited minima (1 per partition, 3 total)", () => {
    for (const id of CONFLICTS) {
      const heldout = runs[id].dataset.cases.filter((c) => c.split === "heldout");
      expect(heldout.length).toBeGreaterThanOrEqual(3);
      for (const partition of ["typical", "edge", "adversarial"] as const) {
        expect(
          heldout.filter((c) => c.partition === partition).length,
          `${id}/${partition}`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("labels come from the committed oracle truth (spot pin: roca-ua-only-001b unit 0 → claim 9001)", () => {
    const c = runs.russia_ukraine.dataset.cases.find((x) => x.id === "roca-ua-only-001b")! as ValidationEvalCase;
    expect(c.reference.labels).toEqual([{ takeawayIndex: 0, claimId: 9001 }]);
  });

  it("the publication-gap case is a VALID validation case with zero takeaways and zero labels (nothing fabricated)", () => {
    const c = runs.iran_regional.dataset.cases.find((x) => x.id === "cc-publication-gap-002")! as ValidationEvalCase;
    expect(c.input.takeaways).toEqual([]);
    expect(c.reference.labels).toEqual([]);
    expect(c.input.claims.length).toBeGreaterThan(0);
  });
});

describe("deterministic building", () => {
  it("two independent builds produce byte-identical datasets and the same source hash", () => {
    for (const id of CONFLICTS) {
      const again = buildConflictEvalRun(id);
      expect(stableStringify(again.dataset)).toBe(stableStringify(runs[id].dataset));
      expect(again.contentHash).toBe(runs[id].contentHash);
      expect(again.contentHash).toBe(conflictDatasetContentHash(id));
    }
  });

  it("createdAt is the pinned derivation constant, never a wall clock", () => {
    for (const id of CONFLICTS) expect(runs[id].dataset.createdAt).toBe(CONFLICT_DATASET_CREATED_AT);
  });

  it("the canonical source set covers inputs AND references: scenario file(s) + crosscutting + the committed goldens", () => {
    expect(conflictDatasetSourceFiles("russia_ukraine")).toEqual([
      "fixtures/conflicts/roca-scenarios-v1.json",
      "fixtures/conflicts/crosscutting-scenarios-v1.json",
      "fixtures/conflicts/goldens/golden-results-v1.json",
    ]);
    expect(conflictDatasetSourceFiles("iran_regional")).toContain(
      "fixtures/conflicts/goldens/golden-results-v1.json",
    );
  });
});

describe("offline scoring through the REAL conflict pipeline", () => {
  it("every case of both conflicts scores pass=true against the committed goldens, with the additive payload riding", async () => {
    for (const id of CONFLICTS) {
      for (const c of runs[id].dataset.cases) {
        const r = await scoreConflictOfflineCase(runs[id], c.id, 0, "test-run");
        expect(r.status, c.id).toBe("scored");
        expect(r.checks.pass, c.id).toBe(true);
        expect(r.attempt).toBe(0);
        expect(r.latencyMs).toBeNull();
        expect(r.promptTokens).toBeNull();
        expect(r.completionTokens).toBeNull();
        expect(r.estUsd).toBeNull();
        expect(r.humanLabels).toBeNull();
        expect(r.graderJudgments).toBeNull();
        const checks = r.checks as ConflictValidationCaseChecks;
        expect(checks.conflictChecksVersion).toBe(1);
        expect(checks.conflictResultV1.version).toBe(1);
        expect(validateConflictResultIdentityV1(checks.conflictResultV1)).toEqual([]);
        if (checks.conflictResultV1.state === "scored") {
          // the persistence gate ran: binding stamps are present
          expect(checks.conflictResultV1.headlineLabel).toBe("Key Takeaway benchmark coverage");
          expect(checks.conflictResultV1.runGroupKey).toBeDefined();
          expect(checks.conflictResultV1.snapshot).toEqual({ ref: null });
        }
      }
    }
  });

  it("scoring is deterministic across repetitions: identical digest and runGroupKey per (case, rep 0/1)", async () => {
    const run = runs.russia_ukraine;
    const a = await scoreConflictOfflineCase(run, "roca-ua-only-001b", 0, "run-a");
    const b = await scoreConflictOfflineCase(run, "roca-ua-only-001b", 1, "run-b");
    expect(a.rawOutputDigest).toBe(b.rawOutputDigest);
    const ka = (a.checks as ConflictValidationCaseChecks).conflictResultV1;
    const kb = (b.checks as ConflictValidationCaseChecks).conflictResultV1;
    expect(ka.state).toBe("scored");
    if (ka.state === "scored" && kb.state === "scored") expect(ka.runGroupKey).toBe(kb.runGroupKey);
    expect(a.repetition).toBe(0);
    expect(b.repetition).toBe(1);
  });

  it("REQUESTED-k obligation (Gate-4 science NOTE-3): the fully-degraded ladder variant B groups at k=5 with variant A, never k=0", async () => {
    const run = runs.russia_ukraine;
    const a = await scoreConflictOfflineCase(run, "cc-matcher-failclosed-013b-a-one-valid-round", 0, "t");
    const b = await scoreConflictOfflineCase(run, "cc-matcher-failclosed-013b-b-zero-valid-rounds", 0, "t");
    const ra = (a.checks as ConflictValidationCaseChecks).conflictResultV1;
    const rb = (b.checks as ConflictValidationCaseChecks).conflictResultV1;
    if (ra.state !== "scored" || rb.state !== "scored") throw new Error("expected scored");
    expect(rb.matcherRung).toBe("keyword");
    expect(rb.runGroupKey!.endsWith("|llm-compatible|k=5")).toBe(true);
    expect(rb.runGroupKey).toBe(ra.runGroupKey);
    expect(rb.matcher!.votesK).toBe(5);
  });

  it("golden divergence is DETECTED, with value-free structural failures (no unit/claim text ever persisted)", async () => {
    const run = runs.russia_ukraine;
    const entry = run.entries.get("roca-ua-only-001b")!;
    const tamperedExpected = JSON.parse(JSON.stringify(entry.expected));
    tamperedExpected.headline.corpusRecall.matched = 0;
    const tamperedRun: ConflictEvalRun = {
      ...run,
      entries: new Map([...run.entries, ["roca-ua-only-001b", { ...entry, expected: tamperedExpected }]]),
    };
    const r = await scoreConflictOfflineCase(tamperedRun, "roca-ua-only-001b", 0, "t");
    expect(r.checks.pass).toBe(false);
    expect(r.checks.failures.length).toBe(1);
    expect(r.checks.failures[0]).toContain("$.headline.corpusRecall.matched");
    // stored-error discipline: no fixture prose in the durable failure string
    const scenario = loadConflictFixtureScenarios().find((s) => s.id === "roca-ua-only-001b")!;
    for (const unit of scenario.report?.units ?? []) {
      expect(r.checks.failures[0]).not.toContain(unit.text);
    }
    for (const claim of scenario.evidence) {
      expect(r.checks.failures[0]).not.toContain(claim.text);
    }
  });

  it("divergentPaths emits key paths only, capped, never values", () => {
    const paths = divergentPaths({ a: 1, b: { c: "x" } }, { a: 2, b: { c: "SECRETVALUE" } });
    expect(paths).toEqual(["$.a", "$.b.c"]);
    expect(paths.join("|")).not.toContain("SECRETVALUE");
    const wide = divergentPaths(
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 1])),
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 2])),
    );
    expect(wide.length).toBe(13);
    expect(wide[12]).toMatch(/more divergent path/);
  });
});

describe("inherited resume/repetition/result-key semantics (untouched, reused)", () => {
  it("pendingWork honors completed (caseId, repetition) keys and repetitions>1; mergeEvalResults keys by resultKey", async () => {
    const run = runs.iran_regional;
    const header = { ...headerFor(run), requestedRepetitions: 2 };
    const first = await scoreConflictOfflineCase(run, "iran-direct-kinetic-001", 0, "r1");
    let rf = mergeEvalResults(emptyEvalResultsFile(header), header, [first], ZERO_METER);
    expect(Object.keys(rf.results)).toEqual([resultKey("iran-direct-kinetic-001", 0)]);
    const { work } = pendingWork(run.dataset, rf, {
      repetitions: 2,
      fresh: false,
      onlyIds: null,
      devOnly: false,
    });
    // 6 cases × 2 reps − the 1 completed key
    expect(work.length).toBe(run.dataset.cases.length * 2 - 1);
    expect(
      work.some((w) => w.evalCase.id === "iran-direct-kinetic-001" && w.repetition === 0),
    ).toBe(false);
    expect(
      work.some((w) => w.evalCase.id === "iran-direct-kinetic-001" && w.repetition === 1),
    ).toBe(true);
    const second = await scoreConflictOfflineCase(run, "iran-direct-kinetic-001", 1, "r2");
    rf = mergeEvalResults(rf, header, [second], ZERO_METER);
    expect(Object.keys(rf.results).sort()).toEqual([
      resultKey("iran-direct-kinetic-001", 0),
      resultKey("iran-direct-kinetic-001", 1),
    ]);
  });

  it("identity-stable resume: same header resumes; a drifted source hash REFUSES (MAJOR-3 semantics inherited)", async () => {
    const run = runs.russia_ukraine;
    const header = headerFor(run);
    const r = await scoreConflictOfflineCase(run, "roca-ua-only-001b", 0, "r1");
    const rf = mergeEvalResults(emptyEvalResultsFile(header), header, [r], ZERO_METER);
    expect(resumeIdentityMismatch(rf, header)).toBeNull();
    const drifted = { ...header, datasetContentHash: "0".repeat(64) };
    expect(resumeIdentityMismatch(rf, drifted)).toContain("datasetContentHash");
    expect(() => mergeEvalResults(rf, drifted, [], ZERO_METER)).toThrowError(/identity changed/);
  });
});

describe("report section + purity", () => {
  it("renderConflictSectionMarkdown shows headline ratios with explicit numerator/denominator and the non-independence caveat", async () => {
    const run = runs.iran_regional;
    const header = headerFor(run);
    let rf = emptyEvalResultsFile(header);
    for (const c of run.dataset.cases) {
      rf = mergeEvalResults(rf, header, [await scoreConflictOfflineCase(run, c.id, 0, "t")], ZERO_METER);
    }
    // DEFAULT: heldout coverage/rung/run-group detail is MASKED (Gate-5 ops
    // NOTE-1 — the inherited --show-heldout-detail convention)
    const md = renderConflictSectionMarkdown(run, rf);
    expect(md).toContain("Key Takeaway benchmark coverage");
    expect(md).toContain("not independent confirmation");
    expect(md).toContain("heldout iteration channel"); // the masking note
    expect(md).toContain("| heldout (masked) | heldout (masked) | heldout (masked) |");
    // the heldout publication-gap case's coverage cell is hidden by default…
    expect(md).not.toContain("unavailable (publication_gap) — no score exists; distinct from 0");
    expect(md).toMatch(/corpus \d+\/\d+ · retained \d+\/\d+/); // development rows unmasked
    // "accuracy" may appear ONLY inside the "never accuracy" disclaimer
    expect(md.replaceAll("never accuracy", "")).not.toMatch(/accuracy/i);
    // …and revealed under the operator flag
    const mdFull = renderConflictSectionMarkdown(run, rf, true);
    expect(mdFull).toContain("unavailable (publication_gap) — no score exists; distinct from 0");
    expect(mdFull).not.toContain("heldout (masked)");
    expect(mdFull).not.toContain("heldout iteration channel");
  });

  it("contentHash covers the BUILT dataset, not only the source files (derivation identity)", () => {
    for (const id of CONFLICTS) {
      // the OLD file-only formula: an edit to CONFLICT_CASE_PLANS /
      // caseInputOf / caseLabelsOf / createdAt changed the built dataset
      // while this value stayed equal, so resume did not refuse. The folded
      // hash must differ from it (removing the fold makes them equal again —
      // the mutation kill).
      const fileOnly = sha256(
        conflictDatasetSourceFiles(id)
          .map((f) => `${f}:${sha256(readFileSync(join(process.cwd(), f)))}`)
          .join("\n"),
      );
      expect(runs[id].contentHash).not.toBe(fileOnly);
      // the dataset-passing and bare call forms agree (no drift between them)
      expect(conflictDatasetContentHash(id, runs[id].dataset)).toBe(runs[id].contentHash);
    }
  });

  it("the profile module is structurally provider-free: no env reads, no SDK import, no network primitives", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "evals", "conflict-validation-profile.ts"),
      "utf8",
    );
    expect(/process\.env/.test(src)).toBe(false);
    expect(/from\s+["']openai["']/.test(src)).toBe(false);
    expect(/\bfetch\s*\(/.test(src)).toBe(false);
    expect(/\brequire\s*\(/.test(src)).toBe(false);
    expect(src.includes("analysisOpenAiClient")).toBe(false);
  });

  it("the case plans and dataset cases agree one-to-one", () => {
    for (const id of CONFLICTS) {
      expect(runs[id].dataset.cases.map((c) => c.id)).toEqual(
        CONFLICT_CASE_PLANS[id].map((p) => p.caseId),
      );
    }
  });
});
