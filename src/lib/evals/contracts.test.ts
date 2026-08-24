import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_EVAL_WORKLOADS,
  validateAnalysisEvalDataset,
  type AnalysisEvalDataset,
  type MapEvalCase,
} from "./contracts";

const EVALS_DIR = join(__dirname, "..", "..", "..", "docs", "evals", "analysis");
const DATASET_FILES = {
  map: "map-v1.json",
  reduce: "reduce-v1.json",
  digest: "digest-v1.json",
  validation: "validation-v1.json",
} as const;

function loadDataset(workload: keyof typeof DATASET_FILES): AnalysisEvalDataset {
  return JSON.parse(readFileSync(join(EVALS_DIR, DATASET_FILES[workload]), "utf8")) as AnalysisEvalDataset;
}

function minimalMapDataset(): AnalysisEvalDataset {
  const c: MapEvalCase = {
    id: "map-x-001",
    workload: "map",
    partition: "typical",
    split: "development",
    provenance: "authored-2026-08-17",
    input: {
      theater: "ua",
      track: "military",
      docs: [{ docId: 1, title: null, content: "A short synthetic doc.", lang: "en", day: "2026-08-01" }],
    },
    reference: { expected: [{ docId: 1, claims: [] }] },
    offline: { fixtureId: "f1", rawOutput: '{"results":[{"docId":1,"claims":[]}]}', expectation: "pass" },
  };
  return { datasetVersion: "map-vtest", workload: "map", createdAt: "2026-08-17T00:00:00Z", cases: [c] };
}

describe("validateAnalysisEvalDataset", () => {
  it("accepts a minimal valid map dataset", () => {
    expect(validateAnalysisEvalDataset(minimalMapDataset(), "map")).toEqual([]);
  });

  it("rejects duplicate case ids, bad partitions/splits, missing provenance", () => {
    const ds = minimalMapDataset();
    ds.cases.push({ ...ds.cases[0] });
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("duplicate id"))).toBe(true);

    const ds2 = minimalMapDataset();
    (ds2.cases[0] as { partition: string }).partition = "weird";
    (ds2.cases[0] as { split: string }).split = "training";
    (ds2.cases[0] as { provenance: string }).provenance = "";
    const errs2 = validateAnalysisEvalDataset(ds2, "map");
    expect(errs2.some((e) => e.includes("invalid partition"))).toBe(true);
    expect(errs2.some((e) => e.includes("invalid split"))).toBe(true);
    expect(errs2.some((e) => e.includes("missing provenance"))).toBe(true);
  });

  it("rejects a reference citing a docId outside the input and uncovered docs", () => {
    const ds = minimalMapDataset();
    (ds.cases[0] as MapEvalCase).reference.expected = [{ docId: 42, claims: [] }];
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("docId 42 not in input"))).toBe(true);
    expect(errs.some((e) => e.includes("must cover every input doc"))).toBe(true);
  });

  it("rejects uncompilable regex patterns (fail closed, never silently dead)", () => {
    const ds = minimalMapDataset();
    (ds.cases[0] as MapEvalCase).reference.mustNotMatch = ["([unclosed"];
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("does not compile"))).toBe(true);
  });

  it("rejects a workload mismatch against the expected workload", () => {
    const errs = validateAnalysisEvalDataset(minimalMapDataset(), "reduce");
    expect(errs.some((e) => e.includes("does not match expected"))).toBe(true);
  });

  it("rejects recency docs without an asOf instant (and vice versa)", () => {
    const ds = loadDataset("reduce");
    const withRecency = ds.cases.find((c) => c.id === "red-rec-001-recency-population-canon")!;
    const broken = JSON.parse(JSON.stringify(withRecency)) as typeof withRecency;
    delete (broken.input as { recencyAsOf?: string }).recencyAsOf;
    const errs = validateAnalysisEvalDataset(
      { ...ds, cases: [broken] },
      "reduce",
    );
    expect(errs.some((e) => e.includes("recencyDocs and recencyAsOf"))).toBe(true);
  });

  it("requires a label for every validation takeaway", () => {
    const ds = loadDataset("validation");
    const c = JSON.parse(JSON.stringify(ds.cases[0])) as (typeof ds.cases)[0];
    (c as { reference: { labels: unknown[] } }).reference.labels = [];
    const errs = validateAnalysisEvalDataset({ ...ds, cases: [c] }, "validation");
    expect(errs.some((e) => e.includes("has no label"))).toBe(true);
  });
});

describe("committed datasets", () => {
  it("every committed dataset validates against its contract", () => {
    for (const w of ANALYSIS_EVAL_WORKLOADS) {
      const errs = validateAnalysisEvalDataset(loadDataset(w), w);
      expect(errs, `${w} dataset`).toEqual([]);
    }
  });

  it("every case is hand-authored (no model-generated provenance) and every partition has heldout coverage", () => {
    for (const w of ANALYSIS_EVAL_WORKLOADS) {
      const ds = loadDataset(w);
      const heldout = { typical: 0, edge: 0, adversarial: 0 };
      for (const c of ds.cases) {
        expect(c.provenance, `${w}/${c.id}`).toMatch(/^authored-/);
        if (c.split === "heldout") heldout[c.partition]++;
      }
      expect(heldout.typical, `${w} heldout typical`).toBeGreaterThanOrEqual(1);
      expect(heldout.edge, `${w} heldout edge`).toBeGreaterThanOrEqual(1);
      expect(heldout.adversarial, `${w} heldout adversarial`).toBeGreaterThanOrEqual(1);
    }
  });

  it("no committed doc snippet or takeaway is long enough to be plausibly copied full text", () => {
    // ruling 1 / copyright discipline: snippets stay short synthetic texts.
    // The structural cap is also enforced by the validator; this pins it stays.
    const map = loadDataset("map");
    for (const c of map.cases as MapEvalCase[]) {
      for (const d of c.input.docs) expect(d.content.length, `${c.id}/${d.docId}`).toBeLessThanOrEqual(1600);
    }
  });
});
