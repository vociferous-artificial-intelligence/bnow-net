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

describe("contractVersion 2 (corpus-v2 capacity contract)", () => {
  /** two-doc v2 dataset with the full typed capacity surface exercised */
  function v2MapDataset(): AnalysisEvalDataset {
    const longDoc = "x".repeat(2400);
    const c: MapEvalCase = {
      id: "map-c2-test-001",
      workload: "map",
      partition: "edge",
      split: "development",
      provenance: "authored-2026-08-27",
      input: {
        theater: "ua",
        track: "military",
        docs: [
          {
            docId: 1,
            title: null,
            content: longDoc,
            lang: "en",
            day: "2026-08-01",
            capacity: {
              facts: [
                { key: "f-tail", startU16: 1700, endU16: 1780, positionBucket: "tail" },
                { key: "f-straddle", startU16: 1450, endU16: 1560, positionBucket: "mid", straddlesDefaultKnob1500: true },
              ],
              requiredMapContentChars: 1800,
              requiresContractCap: 6000,
            },
          },
          {
            docId: 2,
            title: null,
            content: "Quiet housekeeping note.",
            lang: "en",
            day: "2026-08-01",
            capacity: { quietControl: true },
          },
        ],
      },
      reference: {
        expected: [
          {
            docId: 1,
            claims: [
              {
                textGist: "tail fact gist",
                hedging: "claimed",
                capacity: { positionBucket: "tail", charOffsetU16: 1700, factKey: "f-tail" },
              },
            ],
          },
          { docId: 2, claims: [] },
        ],
      },
      offline: { fixtureId: "f1", rawOutput: "{}", expectation: "fail" },
      capacityMeta: { minMapContentChars: 1800, fictionalPersons: [] },
    };
    return {
      datasetVersion: "map-c2-test",
      contractVersion: 2,
      workload: "map",
      createdAt: "2026-08-27T00:00:00Z",
      cases: [c],
    };
  }

  it("accepts a fully annotated v2 map dataset", () => {
    expect(validateAnalysisEvalDataset(v2MapDataset(), "map")).toEqual([]);
  });

  it("fails closed on an unknown contractVersion", () => {
    const ds = v2MapDataset();
    (ds as { contractVersion: number }).contractVersion = 3;
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("unknown contractVersion 3"))).toBe(true);
  });

  it("caps v2 docs at 6000 and v1 docs at 1600", () => {
    const ds = v2MapDataset();
    const doc = (ds.cases[0] as MapEvalCase).input.docs[0];
    doc.content = "x".repeat(6001);
    expect(
      validateAnalysisEvalDataset(ds, "map").some((e) => e.includes("exceeds 6000 chars")),
    ).toBe(true);

    const v1 = minimalMapDataset();
    (v1.cases[0] as MapEvalCase).input.docs[0].content = "x".repeat(1601);
    expect(
      validateAnalysisEvalDataset(v1, "map").some((e) => e.includes("exceeds 1600 chars")),
    ).toBe(true);
  });

  it("rejects every capacity surface under the v1 contract", () => {
    const ds = v2MapDataset();
    delete (ds as { contractVersion?: 2 }).contractVersion;
    const c = ds.cases[0] as MapEvalCase;
    c.input.docs[0].content = "short"; // isolate the capacity-vs-version errors
    c.input.docs[1].content = "short";
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("doc 1 capacity metadata requires contractVersion 2"))).toBe(true);
    expect(errs.some((e) => e.includes("claim on doc 1 capacity metadata requires contractVersion 2"))).toBe(true);
    expect(errs.some((e) => e.includes("capacityMeta requires contractVersion 2"))).toBe(true);
  });

  it("rejects unknown capacity keys (strictly typed, never silently tolerated)", () => {
    const ds = v2MapDataset();
    const cap = (ds.cases[0] as MapEvalCase).input.docs[0].capacity as Record<string, unknown>;
    cap.mysteryKnob = 7;
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes('unknown key "mysteryKnob"'))).toBe(true);
  });

  it("rejects out-of-range offsets and bucket/offset mismatches", () => {
    const ds = v2MapDataset();
    const facts = (ds.cases[0] as MapEvalCase).input.docs[0].capacity!.facts!;
    facts[0].endU16 = 99_999;
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("endU16 <= content.length"))).toBe(true);

    const ds2 = v2MapDataset();
    const facts2 = (ds2.cases[0] as MapEvalCase).input.docs[0].capacity!.facts!;
    facts2[0].positionBucket = "early";
    expect(
      validateAnalysisEvalDataset(ds2, "map").some((e) => e.includes("positionBucket early != positionBucketForOffset(1700)")),
    ).toBe(true);

    const ds3 = v2MapDataset();
    const claimCap = (ds3.cases[0] as MapEvalCase).reference.expected[0].claims[0].capacity!;
    claimCap.positionBucket = "deep-tail";
    expect(
      validateAnalysisEvalDataset(ds3, "map").some((e) => e.includes("positionBucket deep-tail != positionBucketForOffset(1700)")),
    ).toBe(true);
  });

  it("rejects straddle-flag inconsistency in both directions", () => {
    const ds = v2MapDataset();
    const facts = (ds.cases[0] as MapEvalCase).input.docs[0].capacity!.facts!;
    facts[1].straddlesDefaultKnob1500 = false; // it does straddle
    expect(
      validateAnalysisEvalDataset(ds, "map").some((e) => e.includes("straddlesDefaultKnob1500 false inconsistent")),
    ).toBe(true);

    const ds2 = v2MapDataset();
    const facts2 = (ds2.cases[0] as MapEvalCase).input.docs[0].capacity!.facts!;
    delete facts2[1].straddlesDefaultKnob1500; // straddling fact must declare
    expect(
      validateAnalysisEvalDataset(ds2, "map").some((e) => e.includes("does not declare straddlesDefaultKnob1500")),
    ).toBe(true);
  });

  it("requires near-dupe pairs to be symmetric", () => {
    const ds = v2MapDataset();
    const c = ds.cases[0] as MapEvalCase;
    c.input.docs[1].capacity = { nearDupePairId: 1 }; // doc 1 does not point back
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("near-dupe pair is asymmetric"))).toBe(true);
  });

  it("requires quiet-control docs to expect zero claims", () => {
    const ds = v2MapDataset();
    const c = ds.cases[0] as MapEvalCase;
    c.reference.expected[1].claims = [{ textGist: "surprise", hedging: "claimed" }];
    const errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes("quietControl doc must expect zero claims"))).toBe(true);
  });

  it("pins the case-level minMapContentChars to the per-doc max", () => {
    const ds = v2MapDataset();
    (ds.cases[0] as MapEvalCase).capacityMeta!.minMapContentChars = 999;
    expect(
      validateAnalysisEvalDataset(ds, "map").some((e) =>
        e.includes("minMapContentChars must equal the max doc requiredMapContentChars (1800)"),
      ),
    ).toBe(true);
  });

  it("rejects an out-of-clamp exactReduceGroupsFed on digest capacityMeta", () => {
    const digest = loadDataset("digest");
    const c = JSON.parse(JSON.stringify(digest.cases[0])) as (typeof digest.cases)[0] & {
      capacityMeta?: Record<string, unknown>;
    };
    c.capacityMeta = { exactReduceGroupsFed: 450 };
    const errs = validateAnalysisEvalDataset(
      { ...digest, contractVersion: 2, cases: [c] },
      "digest",
    );
    expect(errs.some((e) => e.includes("exactReduceGroupsFed must be an integer in 50..400"))).toBe(true);
  });

  it("rejects compound number-word gists on checkNumerals cases, accepts digits", () => {
    const ds = v2MapDataset();
    const c = ds.cases[0] as MapEvalCase;
    c.reference.checkNumerals = true;
    c.reference.expected[0].claims[0].textGist = "two hundred drones downed";
    let errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes('compound number-words "two hundred"'))).toBe(true);

    c.reference.expected[0].claims[0].textGist = "twenty-one drones downed";
    errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.some((e) => e.includes('hyphenated number-words "twenty-one"'))).toBe(true);

    c.reference.expected[0].claims[0].textGist = "200 drones downed, four intercepted";
    errs = validateAnalysisEvalDataset(ds, "map");
    expect(errs.filter((e) => e.includes("number-words"))).toEqual([]);
  });

  it("rejects capacityMeta on reduce and validation workloads", () => {
    const reduce = loadDataset("reduce");
    const rc = JSON.parse(JSON.stringify(reduce.cases[0])) as (typeof reduce.cases)[0] & {
      capacityMeta?: Record<string, unknown>;
    };
    rc.capacityMeta = {};
    expect(
      validateAnalysisEvalDataset({ ...reduce, contractVersion: 2, cases: [rc] }, "reduce").some((e) =>
        e.includes("not defined for the reduce workload"),
      ),
    ).toBe(true);
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
