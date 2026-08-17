import { afterEach, describe, expect, it } from "vitest";
import {
  ANALYSIS_WORKLOADS,
  ModelConfigError,
  analysisChatParams,
  dispatchIdentity,
  resolveWorkloadModel,
  workloadDispatchConfig,
  workloadModelMatrix,
  type AnalysisWorkload,
} from "./model-config";
import { PRICES_PER_MTOK, estimateCostUsd } from "./pricing";

const ENV_VARS = [
  "OPENAI_MODEL",
  "MAP_MODEL",
  "MAP_REASONING_EFFORT",
  "REDUCE_MODEL",
  "REDUCE_REASONING_EFFORT",
  "DIGEST_MODEL",
  "DIGEST_REASONING_EFFORT",
  "VALIDATION_MODEL",
  "VALIDATION_REASONING_EFFORT",
  "ENTITY_AUDIT_MODEL",
  "ENTITY_AUDIT_REASONING_EFFORT",
] as const;

const SAVED = Object.fromEntries(ENV_VARS.map((k) => [k, process.env[k]]));
function clearAll() {
  for (const k of ENV_VARS) delete process.env[k];
}
afterEach(() => {
  for (const k of ENV_VARS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

const WORKLOAD_MODEL_ENV: Record<AnalysisWorkload, string> = {
  map: "MAP_MODEL",
  reduce: "REDUCE_MODEL",
  digest: "DIGEST_MODEL",
  validation: "VALIDATION_MODEL",
  entity_audit: "ENTITY_AUDIT_MODEL",
};

describe("resolveWorkloadModel — precedence", () => {
  it("with no variables every workload resolves to gpt-4o-mini (default source)", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      const c = resolveWorkloadModel(w);
      expect(c.model).toBe("gpt-4o-mini");
      expect(c.modelSource).toBe("default");
      expect(c.reasoningEffort).toBeNull();
      expect(c.dispatchBlocked).toBeNull();
    }
  });

  it("OPENAI_MODEL is the compatibility fallback for every workload", () => {
    clearAll();
    process.env.OPENAI_MODEL = "gpt-4o";
    for (const w of ANALYSIS_WORKLOADS) {
      const c = resolveWorkloadModel(w);
      expect(c.model).toBe("gpt-4o");
      expect(c.modelSource).toBe("openai_model");
    }
  });

  it("a workload override beats the global fallback — for that workload only", () => {
    clearAll();
    process.env.OPENAI_MODEL = "gpt-4o";
    for (const w of ANALYSIS_WORKLOADS) {
      process.env[WORKLOAD_MODEL_ENV[w]] = "gpt-5-mini";
      expect(resolveWorkloadModel(w).model).toBe("gpt-5-mini");
      expect(resolveWorkloadModel(w).modelSource).toBe("workload");
      for (const other of ANALYSIS_WORKLOADS) {
        if (other !== w) expect(resolveWorkloadModel(other).model).toBe("gpt-4o");
      }
      delete process.env[WORKLOAD_MODEL_ENV[w]];
    }
  });

  it("map and reduce are independent: REDUCE_MODEL never leaks into map", () => {
    clearAll();
    process.env.REDUCE_MODEL = "gpt-5-mini";
    expect(resolveWorkloadModel("map").model).toBe("gpt-4o-mini");
    expect(resolveWorkloadModel("reduce").model).toBe("gpt-5-mini");
    process.env.MAP_MODEL = "gpt-5";
    expect(resolveWorkloadModel("map").model).toBe("gpt-5");
    expect(resolveWorkloadModel("reduce").model).toBe("gpt-5-mini");
  });

  it("blank and whitespace-only values are ABSENT, and values are trimmed", () => {
    clearAll();
    process.env.MAP_MODEL = "";
    expect(resolveWorkloadModel("map").model).toBe("gpt-4o-mini");
    process.env.MAP_MODEL = "   ";
    expect(resolveWorkloadModel("map").model).toBe("gpt-4o-mini");
    expect(resolveWorkloadModel("map").modelSource).toBe("default");
    process.env.OPENAI_MODEL = "  ";
    expect(resolveWorkloadModel("digest").modelSource).toBe("default");
    process.env.MAP_MODEL = "  gpt-5  ";
    expect(resolveWorkloadModel("map").model).toBe("gpt-5");
  });

  it("resolves at CALL time — no import-time snapshot", () => {
    clearAll();
    expect(resolveWorkloadModel("map").model).toBe("gpt-4o-mini");
    process.env.MAP_MODEL = "gpt-5";
    expect(resolveWorkloadModel("map").model).toBe("gpt-5");
    delete process.env.MAP_MODEL;
    expect(resolveWorkloadModel("map").model).toBe("gpt-4o-mini");
  });
});

describe("reasoning effort validation", () => {
  it("accepts the documented allowlist (case-insensitive, trimmed) on reasoning models", () => {
    clearAll();
    process.env.REDUCE_MODEL = "gpt-5";
    for (const effort of ["minimal", "low", "medium", "high", " LOW ", "High"]) {
      process.env.REDUCE_REASONING_EFFORT = effort;
      const c = resolveWorkloadModel("reduce");
      // effort VALIDATION passes (the value parses and applies); the config is
      // still dispatch-blocked, but by the quality registry, never by effort
      expect(c.reasoningEffort).toBe(effort.trim().toLowerCase());
      expect(c.dispatchBlocked).not.toMatch(/REASONING_EFFORT/);
      expect(c.dispatchBlocked).toMatch(/approval/);
    }
  });

  it("absent or blank effort adds NOTHING (current payloads preserved)", () => {
    clearAll();
    expect(resolveWorkloadModel("map").reasoningEffort).toBeNull();
    process.env.MAP_REASONING_EFFORT = "   ";
    expect(resolveWorkloadModel("map").reasoningEffort).toBeNull();
    expect(resolveWorkloadModel("map").dispatchBlocked).toBeNull();
  });

  it("an invalid effort value fails closed at dispatch, per workload", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      process.env[`${WORKLOAD_MODEL_ENV[w].replace(/_MODEL$/, "")}_REASONING_EFFORT`] = "extreme";
      const c = resolveWorkloadModel(w);
      expect(c.dispatchBlocked).toMatch(/invalid .*REASONING_EFFORT/);
      expect(() => workloadDispatchConfig(w)).toThrow(ModelConfigError);
      delete process.env[`${WORKLOAD_MODEL_ENV[w].replace(/_MODEL$/, "")}_REASONING_EFFORT`];
    }
  });

  it("a valid effort on a NON-reasoning model fails closed (silent no-op forbidden)", () => {
    clearAll();
    process.env.MAP_REASONING_EFFORT = "low"; // model resolves to gpt-4o-mini
    const c = resolveWorkloadModel("map");
    expect(c.dispatchBlocked).toMatch(/non-reasoning model/);
    expect(() => workloadDispatchConfig("map")).toThrow(ModelConfigError);
  });

  it("efforts are independent between map and reduce", () => {
    clearAll();
    process.env.MAP_MODEL = "gpt-5";
    process.env.REDUCE_MODEL = "gpt-5-mini";
    process.env.MAP_REASONING_EFFORT = "low";
    expect(resolveWorkloadModel("map").reasoningEffort).toBe("low");
    expect(resolveWorkloadModel("reduce").reasoningEffort).toBeNull();
  });
});

describe("unpriced models fail closed", () => {
  it("a model with no PRICES_PER_MTOK entry cannot dispatch", () => {
    clearAll();
    process.env.DIGEST_MODEL = "gpt-5.6-frontier";
    const c = resolveWorkloadModel("digest");
    expect(c.priced).toBe(false);
    expect(c.dispatchBlocked).toMatch(/no entry in the metering price table/);
    expect(() => workloadDispatchConfig("digest")).toThrow(ModelConfigError);
    expect(() => workloadDispatchConfig("digest")).toThrow(/unpriced/);
  });

  it("pricing is NOT approval: every priced non-baseline model is quality-blocked", () => {
    clearAll();
    for (const model of Object.keys(PRICES_PER_MTOK)) {
      process.env.DIGEST_MODEL = model;
      if (model === "gpt-4o-mini") {
        expect(workloadDispatchConfig("digest").model).toBe(model);
      } else {
        const c = resolveWorkloadModel("digest");
        expect(c.priced).toBe(true);
        expect(c.approved).toBe(false);
        expect(c.dispatchBlocked).toMatch(/approval/);
        expect(() => workloadDispatchConfig("digest")).toThrow(ModelConfigError);
      }
    }
  });

  it("the typed error names the workload and never fires for valid config", () => {
    clearAll();
    process.env.ENTITY_AUDIT_MODEL = "not-a-model";
    try {
      workloadDispatchConfig("entity_audit");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ModelConfigError);
      expect((e as ModelConfigError).workload).toBe("entity_audit");
      expect((e as ModelConfigError).code).toBe("MODEL_CONFIG");
    }
    delete process.env.ENTITY_AUDIT_MODEL;
    expect(() => workloadDispatchConfig("entity_audit")).not.toThrow();
  });
});

describe("analysisChatParams — payload compatibility", () => {
  it("non-reasoning models keep the exact historical shape and key order", () => {
    const p = analysisChatParams(
      { reasoningCapable: false, reasoningEffort: null },
      { temperature: 0.2, maxCompletionTokens: 4096 },
    );
    expect(p).toEqual({ temperature: 0.2, max_completion_tokens: 4096 });
    expect(Object.keys(p)).toEqual(["temperature", "max_completion_tokens"]);
  });

  it("non-reasoning without a ceiling stays temperature-only (llm-match / entity-audit shape)", () => {
    const p = analysisChatParams(
      { reasoningCapable: false, reasoningEffort: null },
      { temperature: 0 },
    );
    expect(p).toEqual({ temperature: 0 });
  });

  it("reasoning models NEVER receive temperature", () => {
    const p = analysisChatParams(
      { reasoningCapable: true, reasoningEffort: null },
      { temperature: 0.2, maxCompletionTokens: 6000 },
    );
    expect(p).toEqual({ max_completion_tokens: 6000 });
    expect("temperature" in p).toBe(false);
  });

  it("reasoning models add reasoning_effort only when configured", () => {
    const p = analysisChatParams(
      { reasoningCapable: true, reasoningEffort: "medium" },
      { temperature: 0.2, maxCompletionTokens: 6000 },
    );
    expect(p).toEqual({ max_completion_tokens: 6000, reasoning_effort: "medium" });
    const bare = analysisChatParams(
      { reasoningCapable: true, reasoningEffort: "low" },
      { temperature: 0 },
    );
    expect(bare).toEqual({ reasoning_effort: "low" });
  });

  it("end to end: the approved baseline dispatches with the historical params everywhere", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      const d = workloadDispatchConfig(w);
      expect(d.model).toBe("gpt-4o-mini");
      expect(d.reasoningEffort).toBeNull();
      expect(d.approvalStatus).toBe("baseline");
      expect(analysisChatParams(d, { temperature: 0.2, maxCompletionTokens: 4000 })).toEqual({
        temperature: 0.2,
        max_completion_tokens: 4000,
      });
    }
  });
});

describe("pricing safety net behind the dispatch gate", () => {
  it("the unknown-model ceiling can never undercut any priced model", () => {
    // If a future price-table entry ever exceeds the conservative fallback,
    // the fallback stops being conservative — this pin forces raising it.
    const pt = 1_000_000;
    const ct = 1_000_000;
    const ceiling = estimateCostUsd("definitely-unknown-model", pt, ct);
    for (const model of Object.keys(PRICES_PER_MTOK)) {
      expect(ceiling).toBeGreaterThanOrEqual(estimateCostUsd(model, pt, ct));
    }
  });

  it("known-model estimates keep input/output separation (gpt-4o-mini parity)", () => {
    // byte-parity with the historical fixed-price estimator's arithmetic
    expect(estimateCostUsd("gpt-4o-mini", 7697, 734)).toBeCloseTo(
      (7697 * 0.15 + 734 * 0.6) / 1e6,
      12,
    );
    expect(estimateCostUsd("gpt-5", 1000, 0)).toBeCloseTo(1000 * 1.25 / 1e6, 12);
    expect(estimateCostUsd("gpt-5", 0, 1000)).toBeCloseTo(1000 * 10 / 1e6, 12);
  });
});

describe("quality-registry gate (pricing is not approval)", () => {
  it("baseline gpt-4o-mini with absent effort is approved for every workload", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      const c = resolveWorkloadModel(w);
      expect(c.approved).toBe(true);
      expect(c.approvalStatus).toBe("baseline");
      expect(c.registryVersion).toBe("analysis-reg-v1");
      expect(c.dispatchBlocked).toBeNull();
    }
  });

  it("a priced but unapproved model fails closed before dispatch, per workload", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      if (w === "map") continue; // map trips its own hard lock first — tested below
      process.env[WORKLOAD_MODEL_ENV[w]] = "gpt-5-nano"; // priced, never approved
      const c = resolveWorkloadModel(w);
      expect(c.priced).toBe(true);
      expect(c.approved).toBe(false);
      expect(() => workloadDispatchConfig(w)).toThrow(/approval/);
      delete process.env[WORKLOAD_MODEL_ENV[w]];
    }
  });

  it("an approved model with a non-approved effort fails closed (baseline allows absent only)", () => {
    clearAll();
    // gpt-4o-mini + any effort is caught by the non-reasoning check upstream —
    // the effort-approval rule is pinned directly in analysis-registry.test.ts;
    // here we pin the dispatch-level outcome: no effort env means approved,
    // and no priced+approved+effort combination exists that dispatches today.
    process.env.VALIDATION_REASONING_EFFORT = "low";
    expect(() => workloadDispatchConfig("validation")).toThrow(ModelConfigError);
  });
});

describe("MAP activation hard lock", () => {
  it("a priced (would-be-approvable) non-baseline map model is MAP ACTIVATION BLOCKED", () => {
    clearAll();
    process.env.MAP_MODEL = "gpt-5"; // priced and reasoning-capable
    const c = resolveWorkloadModel("map");
    expect(c.priced).toBe(true);
    expect(c.dispatchBlocked).toMatch(/^MAP ACTIVATION BLOCKED/);
    expect(c.dispatchBlocked).toMatch(/remap/);
    expect(() => workloadDispatchConfig("map")).toThrow(/MAP ACTIVATION BLOCKED/);
  });

  it("a validated non-null map effort on a reasoning model also trips the lock", () => {
    clearAll();
    process.env.MAP_MODEL = "gpt-5";
    process.env.MAP_REASONING_EFFORT = "low";
    expect(() => workloadDispatchConfig("map")).toThrow(/MAP ACTIVATION BLOCKED/);
  });

  it("the lock cannot activate historical/scheduled map processing via env alone", () => {
    clearAll();
    // even the global fallback cannot move map off its baseline
    process.env.OPENAI_MODEL = "gpt-5-mini";
    expect(() => workloadDispatchConfig("map")).toThrow(/MAP ACTIVATION BLOCKED/);
    // and the baseline itself still dispatches
    delete process.env.OPENAI_MODEL;
    expect(workloadDispatchConfig("map").model).toBe("gpt-4o-mini");
  });

  it("reduce is independent: a reduce override never trips the map lock", () => {
    clearAll();
    process.env.REDUCE_MODEL = "gpt-5-mini";
    // map stays baseline-dispatchable; reduce is approval-blocked (its own gate)
    expect(workloadDispatchConfig("map").model).toBe("gpt-4o-mini");
    expect(() => workloadDispatchConfig("reduce")).toThrow(/approval/);
    expect(() => workloadDispatchConfig("reduce")).not.toThrow(/MAP ACTIVATION/);
  });
});

describe("dispatchIdentity", () => {
  it("round-trips the exact dispatched configuration with registry identity", () => {
    clearAll();
    const d = workloadDispatchConfig("reduce");
    const id = dispatchIdentity(d);
    expect(id).toEqual({
      workload: "reduce",
      model: "gpt-4o-mini",
      reasoningEffort: null, // explicit null = absent, always answerable
      registryVersion: "analysis-reg-v1",
      approval: "baseline",
    });
  });
});

describe("workloadModelMatrix", () => {
  it("returns one row per workload, resolved from the live environment", () => {
    clearAll();
    process.env.VALIDATION_MODEL = "gpt-5-mini";
    const rows = workloadModelMatrix();
    expect(rows.map((r) => r.workload)).toEqual([
      "map",
      "reduce",
      "digest",
      "validation",
      "entity_audit",
    ]);
    expect(rows.find((r) => r.workload === "validation")!.model).toBe("gpt-5-mini");
    expect(rows.find((r) => r.workload === "map")!.model).toBe("gpt-4o-mini");
  });
});
