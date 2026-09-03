// Corpus-v2 dataset composition. Pure and deterministic.
//
// A v2 dataset = the frozen v1 cases (input/reference/offline byte-frozen —
// contracts.test.ts pins the JSON-equal subset) followed by the admitted c2
// cases, under contractVersion 2 and a bumped datasetVersion. v1 files stay
// committed untouched as the historical record; the CLI's DATASETS table
// points the map/digest/validation workloads at the v2 files.

import type { AnalysisEvalCase, AnalysisEvalDataset } from "./contracts";

export function composeV2Dataset(
  v1: AnalysisEvalDataset,
  c2Cases: AnalysisEvalCase[],
  opts: { datasetVersion: string; createdAt: string },
): AnalysisEvalDataset {
  if (v1.contractVersion !== undefined) throw new Error("compose: the base dataset must be a v1-contract file");
  const ids = new Set(v1.cases.map((c) => c.id));
  for (const c of c2Cases) {
    if (c.workload !== v1.workload) throw new Error(`compose: case ${c.id} workload ${c.workload} != ${v1.workload}`);
    if (ids.has(c.id)) throw new Error(`compose: case id ${c.id} collides with a v1 case`);
    ids.add(c.id);
  }
  return {
    datasetVersion: opts.datasetVersion,
    contractVersion: 2,
    workload: v1.workload,
    createdAt: opts.createdAt,
    cases: [...v1.cases, ...c2Cases],
  };
}

/** the canonical dataset file bytes (datasetContentHash hashes exactly this) */
export function serializeDataset(ds: AnalysisEvalDataset): string {
  return JSON.stringify(ds, null, 2) + "\n";
}
