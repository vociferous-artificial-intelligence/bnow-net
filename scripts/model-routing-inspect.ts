// Dry-run inspector for the cloud-model routing seam: prints the RESOLVED
// per-workload model/effort matrix exactly as the dispatch sites would see it,
// then exits. Makes NO provider request, opens NO database connection, and
// prints NO secret (model ids and env-var NAMES only).
//
//   npx tsx scripts/model-routing-inspect.ts
//   MAP_MODEL=gpt-5-mini MAP_REASONING_EFFORT=low npx tsx scripts/model-routing-inspect.ts
//
// A row whose "dispatch" column says BLOCKED would FAIL CLOSED at its call
// site before any reservation or billed call (model-config.ts contract).

import "./env";
import { workloadModelMatrix } from "../src/lib/llm/model-config";
import { PRICES_PER_MTOK } from "../src/lib/llm/pricing";
import { askAnswerModel, askRerankModel } from "../src/lib/ask/config";

const rows = workloadModelMatrix().map((c) => ({
  workload: c.workload,
  model: c.model,
  source: c.modelSource === "workload" ? c.modelEnvVar : c.modelSource === "openai_model" ? "OPENAI_MODEL" : "default",
  effort: c.reasoningEffort ?? (c.effortRaw !== null ? `INVALID(${c.effortRaw})` : "—"),
  priced: c.priced ? "yes" : "NO",
  dispatch: c.dispatchBlocked === null ? "ok" : `BLOCKED: ${c.dispatchBlocked}`,
}));

console.log("Analysis workload routing (resolved now, from this process's environment):\n");
for (const r of rows) {
  console.log(
    `  ${r.workload.padEnd(12)} ${r.model.padEnd(16)} source=${r.source.padEnd(18)} effort=${String(r.effort).padEnd(10)} priced=${r.priced.padEnd(3)} ${r.dispatch}`,
  );
}

console.log("\nAsk pipeline (NOT routed by model-config; scorecard-gated in src/lib/ask/registry.ts):");
console.log(`  ask.answer     ${askAnswerModel()}   (ASK_ANSWER_MODEL)`);
console.log(`  ask.rerank     ${askRerankModel()}   (ASK_RERANK_MODEL)`);

console.log(`\nMetering price table (src/lib/llm/pricing.ts, $/1M tokens): ${Object.keys(PRICES_PER_MTOK).join(", ")}`);
console.log("Unknown models: conservative ceiling in estimateCostUsd, but dispatch FAILS CLOSED first.");
console.log("\nNo provider request was made by this inspection.");
