// Dry-run inspector for the cloud-model routing seam: prints the RESOLVED
// per-workload model/effort matrix exactly as the dispatch sites would see it,
// then exits. Makes NO provider request, opens NO database connection, and
// prints NO secret (model ids and env-var NAMES only).
//
//   npx tsx scripts/model-routing-inspect.ts
//   MAP_MODEL=gpt-5-mini MAP_REASONING_EFFORT=low npx tsx scripts/model-routing-inspect.ts
//   DIGEST_PROVIDER=anthropic npx tsx scripts/model-routing-inspect.ts
//
// A row whose "dispatch" column says BLOCKED would FAIL CLOSED at its call
// site before any reservation or billed call (model-config.ts contract).

import "./env";
import { ANALYSIS_WORKLOADS, workloadModelMatrix } from "../src/lib/llm/model-config";
import { ANALYSIS_PROVIDER_IDS, WORKLOAD_PROVIDER_ALLOWLIST } from "../src/lib/llm/providers";
import { PRICES_PER_MTOK } from "../src/lib/llm/pricing";
import { askAnswerModel, askRerankModel } from "../src/lib/ask/config";

const matrix = workloadModelMatrix();

const rows = matrix.map((c) => ({
  workload: c.workload,
  provider: `${c.provider}${c.providerSource === "workload" ? `(${c.providerEnvVar})` : ""}`,
  model: c.model,
  source: c.modelSource === "workload" ? c.modelEnvVar : c.modelSource === "openai_model" ? "OPENAI_MODEL" : "default",
  effort: c.reasoningEffort ?? (c.effortRaw !== null ? `INVALID(${c.effortRaw})` : "—"),
  priced: c.priced ? "yes" : "NO",
  approved: c.approved ? (c.approvalStatus ?? "yes") : "NO",
  dispatch:
    c.dispatchBlocked === null
      ? "ok"
      : c.dispatchBlocked.startsWith("MAP ACTIVATION BLOCKED")
        ? c.dispatchBlocked // already carries the hard-lock label
        : `BLOCKED: ${c.dispatchBlocked}`,
}));

console.log(
  `Analysis workload routing (resolved now, from this process's environment; quality registry ${matrix.length ? matrix[0].registryVersion : ""}):\n`,
);
for (const r of rows) {
  console.log(
    `  ${r.workload.padEnd(12)} provider=${r.provider.padEnd(26)} ${r.model.padEnd(16)} source=${r.source.padEnd(18)} effort=${String(r.effort).padEnd(10)} priced=${r.priced.padEnd(3)} approved=${r.approved.padEnd(8)} ${r.dispatch}`,
  );
}

console.log("\nAsk pipeline (NOT routed by model-config; scorecard-gated in src/lib/ask/registry.ts):");
console.log(`  ask.answer     ${askAnswerModel()}   (ASK_ANSWER_MODEL)`);
console.log(`  ask.rerank     ${askRerankModel()}   (ASK_RERANK_MODEL)`);

console.log(`\nMetering price table (src/lib/llm/pricing.ts, $/1M tokens): ${Object.keys(PRICES_PER_MTOK).join(", ")}`);
console.log(
  `Provider allowlist (src/lib/llm/providers.ts): ${ANALYSIS_WORKLOADS.map((w) => `${w}={${[...WORKLOAD_PROVIDER_ALLOWLIST[w]].join(",")}}`).join(" ")}`,
);
console.log(`Nameable provider ids (naming is NOT permission): ${ANALYSIS_PROVIDER_IDS.join(", ")}`);
console.log("Dispatch requires an allowlisted provider AND pricing for that provider AND a");
console.log("quality-registry approval for the exact (workload, provider, model, effort);");
console.log("an unknown/disallowed provider or an unpriced/unapproved model FAILS CLOSED,");
console.log("and any non-baseline map configuration is hard-locked (MAP ACTIVATION BLOCKED)");
console.log("pending the version-aware remap path + explicit operator authorization.");
console.log("\nNo provider request was made by this inspection.");
