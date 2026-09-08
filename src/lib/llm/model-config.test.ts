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
import { PRICES_PER_MTOK, estimateCostUsd, pricedFor, type PriceTable } from "./pricing";
import { ANALYSIS_PROVIDER_IDS, WORKLOAD_PROVIDER_ALLOWLIST, type AnalysisProviderId } from "./providers";
import { analysisApproval } from "./analysis-registry";

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
  "MAP_PROVIDER",
  "REDUCE_PROVIDER",
  "DIGEST_PROVIDER",
  "VALIDATION_PROVIDER",
  "ENTITY_AUDIT_PROVIDER",
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

const WORKLOAD_PROVIDER_ENV: Record<AnalysisWorkload, string> = {
  map: "MAP_PROVIDER",
  reduce: "REDUCE_PROVIDER",
  digest: "DIGEST_PROVIDER",
  validation: "VALIDATION_PROVIDER",
  entity_audit: "ENTITY_AUDIT_PROVIDER",
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
      provider: "openai",
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

describe("provider dimension (2026-09-06) — allowlisted per workload, refused first", () => {
  it("absent <W>_PROVIDER resolves to openai from the default source, dispatchable", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      const c = resolveWorkloadModel(w);
      expect(c.provider).toBe("openai");
      expect(c.providerSource).toBe("default");
      expect(c.providerRaw).toBeNull();
      expect(c.providerEnvVar).toBe(WORKLOAD_PROVIDER_ENV[w]);
      expect(c.dispatchBlocked).toBeNull();
    }
  });

  it("a KNOWN but not-allowed provider is refused for every workload whose allowlist excludes it", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      if (WORKLOAD_PROVIDER_ALLOWLIST[w].has("anthropic")) continue; // digest, since 2026-09-06
      process.env[WORKLOAD_PROVIDER_ENV[w]] = "anthropic";
      const c = resolveWorkloadModel(w);
      expect(c.dispatchBlocked).toMatch(/not allowed for workload/);
      expect(c.dispatchBlocked).toContain(`provider "anthropic"`);
      expect(c.dispatchBlocked).toContain("allowed: openai");
      expect(c.providerAllowed).toBe(false);
      expect(() => workloadDispatchConfig(w)).toThrow(ModelConfigError);
      delete process.env[WORKLOAD_PROVIDER_ENV[w]];
    }
  });

  it("digest ADMITS anthropic and still dispatches nothing — the refusal moves down the ladder, it does not disappear", () => {
    // widening an allowlist is not an approval (providers.ts). The refusal
    // changes from "this vendor is not addressable" to "this vendor has no
    // priced, approved model", which is the gate the activation checklist is
    // written against — and it is still fail-closed before any reservation.
    clearAll();
    process.env.DIGEST_PROVIDER = "anthropic";
    expect(resolveWorkloadModel("digest").dispatchBlocked).toMatch(
      /requires an explicit DIGEST_MODEL/,
    );
    process.env.DIGEST_MODEL = "claude-not-priced";
    const c = resolveWorkloadModel("digest");
    expect(c.provider).toBe("anthropic");
    expect(c.providerAllowed).toBe(true);
    expect(c.model).toBe("claude-not-priced"); // never the gpt-4o-mini default
    expect(c.dispatchBlocked).toMatch(/is not priced for provider "anthropic"/);
    expect(() => workloadDispatchConfig("digest")).toThrow(ModelConfigError);
    // and no OpenAI model can slip through as an Anthropic one
    process.env.DIGEST_MODEL = "gpt-4o-mini";
    expect(resolveWorkloadModel("digest").dispatchBlocked).toMatch(
      /is not priced for provider "anthropic"/,
    );
  });

  it("openai_compatible is NAMEABLE but not allowed anywhere (vocabulary is not permission)", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      process.env[WORKLOAD_PROVIDER_ENV[w]] = "openai_compatible";
      expect(resolveWorkloadModel(w).dispatchBlocked).toMatch(/not allowed for workload/);
      delete process.env[WORKLOAD_PROVIDER_ENV[w]];
    }
  });

  it("MAP_PROVIDER=anthropic is refused by the ALLOWLIST, not by the map lock", () => {
    // ordering pin: the allowlist branch precedes the hard activation lock, so
    // a non-OpenAI map provider can never reach (or be masked by) the lock's
    // message — and the lock predicate itself is untouched (ruling 13).
    clearAll();
    process.env.MAP_PROVIDER = "anthropic";
    const c = resolveWorkloadModel("map");
    expect(c.dispatchBlocked).toMatch(/not allowed for workload "map"/);
    expect(c.dispatchBlocked).not.toContain("MAP ACTIVATION BLOCKED");
    expect(() => workloadDispatchConfig("map")).toThrow(/not allowed for workload/);
    // and the lock still fires on its own terms with the provider absent
    delete process.env.MAP_PROVIDER;
    process.env.MAP_MODEL = "gpt-5";
    expect(() => workloadDispatchConfig("map")).toThrow(/MAP ACTIVATION BLOCKED/);
  });

  it("<W>_PROVIDER=stub is refused with the offline-switch explanation", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      process.env[WORKLOAD_PROVIDER_ENV[w]] = "stub";
      const c = resolveWorkloadModel(w);
      expect(c.dispatchBlocked).toMatch(/not a dispatch provider/);
      expect(c.dispatchBlocked).toMatch(/ANALYSIS_PROVIDER=stub is the offline switch/);
      expect(() => workloadDispatchConfig(w)).toThrow(ModelConfigError);
      delete process.env[WORKLOAD_PROVIDER_ENV[w]];
    }
  });

  it("an UNKNOWN provider id is refused and the message lists the known ids", () => {
    clearAll();
    process.env.DIGEST_PROVIDER = "foo";
    const c = resolveWorkloadModel("digest");
    expect(c.dispatchBlocked).toMatch(/is not a known provider/);
    expect(c.dispatchBlocked).toContain("known: openai|anthropic|openai_compatible");
    expect(() => workloadDispatchConfig("digest")).toThrow(ModelConfigError);
  });

  it("the provider value is trimmed; a padded 'openai' resolves identically but from the env", () => {
    clearAll();
    const bare = resolveWorkloadModel("digest");
    process.env.DIGEST_PROVIDER = "  openai  ";
    const padded = resolveWorkloadModel("digest");
    expect(padded.provider).toBe("openai");
    expect(padded.dispatchBlocked).toBeNull();
    expect(padded.model).toBe(bare.model);
    expect(padded.providerSource).toBe("workload");
    expect(padded.providerRaw).toBe("openai");
    // blank/whitespace-only is ABSENT, exactly like the model envs
    process.env.DIGEST_PROVIDER = "   ";
    expect(resolveWorkloadModel("digest").providerSource).toBe("default");
  });

  it("pricedFor treats an ABSENT provider field as openai, never as 'any provider'", () => {
    expect(pricedFor("openai", "gpt-4o-mini")).toBe(true);
    expect(pricedFor("anthropic", "gpt-4o-mini")).toBe(false);
    expect(pricedFor("openai_compatible", "gpt-4o-mini")).toBe(false);
    expect(pricedFor("openai", "definitely-unknown-model")).toBe(false);
    const table: PriceTable = {
      "claude-x": { in: 1, out: 5, provider: "anthropic" },
      "gpt-4o-mini": { in: 0.15, out: 0.6 },
    };
    expect(pricedFor("anthropic", "claude-x", table)).toBe(true);
    expect(pricedFor("openai", "claude-x", table)).toBe(false);
    expect(pricedFor("openai", "gpt-4o-mini", table)).toBe(true);
    expect(pricedFor("anthropic", "gpt-4o-mini", table)).toBe(false);
  });

  it("every price row is priced for its OWN provider and no other (an absent field means openai)", () => {
    for (const [model, row] of Object.entries(PRICES_PER_MTOK)) {
      const owner = row.provider ?? "openai";
      for (const p of ANALYSIS_PROVIDER_IDS) {
        expect(pricedFor(p, model), `${model} priced for ${p}`).toBe(p === owner);
      }
    }
  });

  it("the dispatch config and the durable identity both carry the provider", () => {
    clearAll();
    for (const w of ANALYSIS_WORKLOADS) {
      expect(workloadDispatchConfig(w).provider).toBe("openai");
      expect(dispatchIdentity(workloadDispatchConfig(w)).provider).toBe("openai");
    }
  });

  it("workloadModelMatrix reports the provider and its source per row (and never leaks the map index into the allowlist parameter)", () => {
    clearAll();
    process.env.VALIDATION_PROVIDER = "openai";
    const rows = workloadModelMatrix();
    expect(rows.find((r) => r.workload === "validation")!.providerSource).toBe("workload");
    expect(rows.find((r) => r.workload === "map")!.providerSource).toBe("default");
    expect(rows.every((r) => r.provider === "openai")).toBe(true);
    expect(rows.every((r) => r.dispatchBlocked === null || r.workload === "validation")).toBe(true);
  });

  it("a REFUSED provider never changes the resolved model (ruling 13 read-side safety)", () => {
    // resolveWorkloadModel never throws and mapExtractorVersion's basis reads
    // cfg.model, so a provider that can never dispatch must not move the model
    // — otherwise a single unusable env would strand every doc_claims consumer
    clearAll();
    const baseline = Object.fromEntries(
      ANALYSIS_WORKLOADS.map((w) => [w, resolveWorkloadModel(w).model]),
    );
    for (const bad of ["anthropic", "openai_compatible", "stub", "nonsense"]) {
      for (const w of ANALYSIS_WORKLOADS) {
        // an ALLOWED provider is a different case: there the vendor's own
        // <W>_MODEL is the honest resolution, and it is exercised by the
        // digest case above. This pin is about REFUSED providers only.
        if (bad === "anthropic" && WORKLOAD_PROVIDER_ALLOWLIST[w].has("anthropic")) continue;
        process.env[WORKLOAD_PROVIDER_ENV[w]] = bad;
        const c = resolveWorkloadModel(w);
        expect(c.model).toBe(baseline[w]);
        expect(c.providerAllowed).toBe(false);
        expect(c.dispatchBlocked).not.toBeNull();
        delete process.env[WORKLOAD_PROVIDER_ENV[w]];
      }
    }
  });

  it("providerAllowed reports the allowlist verdict, so read-side consumers can scope a vendor the way the model is scoped", () => {
    clearAll();
    expect(resolveWorkloadModel("digest").providerAllowed).toBe(true); // default openai
    process.env.MAP_PROVIDER = "anthropic";
    expect(resolveWorkloadModel("map").providerAllowed).toBe(false);
    process.env.MAP_PROVIDER = "nonsense";
    expect(resolveWorkloadModel("map").providerAllowed).toBe(false);
  });

  it("the shipped allowlist is exactly this, and widening it is a diff here", () => {
    // spelled out per workload rather than asserted in a loop: an allowlist
    // entry is a routing permission, and a PR that adds one should have to
    // change a line that says so.
    expect(
      Object.fromEntries(ANALYSIS_WORKLOADS.map((w) => [w, [...WORKLOAD_PROVIDER_ALLOWLIST[w]]])),
    ).toEqual({
      map: ["openai"],
      reduce: ["openai"],
      digest: ["openai", "anthropic"],
      validation: ["openai"],
      entity_audit: ["openai"],
    });
  });
});

// The branches below are UNREACHABLE through the shipped {openai}-everywhere
// allowlist — the not-allowed refusal fires first. They are exercised against a
// WIDENED allowlist injected into resolveWorkloadModel (tests only, the same
// footing as analysisApproval's injected registry), so a future widening PR
// inherits a proven fail-closed ladder instead of untested code.
describe("provider dimension — post-widening ladder (injected allowlist, tests only)", () => {
  const WIDENED = {
    ...WORKLOAD_PROVIDER_ALLOWLIST,
    reduce: new Set<AnalysisProviderId>(["openai", "anthropic"]),
  };

  it("a non-openai provider requires its own <W>_MODEL — before pricing or approval", () => {
    clearAll();
    process.env.REDUCE_PROVIDER = "anthropic";
    const c = resolveWorkloadModel("reduce", WIDENED);
    expect(c.provider).toBe("anthropic");
    expect(c.model).toBe(""); // never the gpt-4o-mini default
    expect(c.dispatchBlocked).toMatch(/requires an explicit REDUCE_MODEL/);
    expect(c.dispatchBlocked).not.toMatch(/price table|approval/);
  });

  it("OPENAI_MODEL never names a model on another vendor", () => {
    clearAll();
    process.env.OPENAI_MODEL = "gpt-4o";
    process.env.REDUCE_PROVIDER = "anthropic";
    const c = resolveWorkloadModel("reduce", WIDENED);
    expect(c.model).toBe("");
    expect(c.dispatchBlocked).toMatch(/requires an explicit REDUCE_MODEL/);
  });

  it("a reasoning effort under a non-openai provider is refused with the provider wording", () => {
    clearAll();
    process.env.REDUCE_PROVIDER = "anthropic";
    process.env.REDUCE_MODEL = "claude-whatever";
    process.env.REDUCE_REASONING_EFFORT = "low";
    const c = resolveWorkloadModel("reduce", WIDENED);
    expect(c.reasoningCapable).toBe(false);
    expect(c.dispatchBlocked).toMatch(/accepts no reasoning effort in this release/);
    expect(c.dispatchBlocked).not.toMatch(/non-reasoning model/);
  });

  it("an OpenAI-priced model does NOT become priced by moving the provider", () => {
    clearAll();
    process.env.REDUCE_PROVIDER = "anthropic";
    process.env.REDUCE_MODEL = "gpt-4o-mini"; // priced for openai only
    const c = resolveWorkloadModel("reduce", WIDENED);
    expect(c.priced).toBe(false);
    expect(c.dispatchBlocked).toMatch(/is not priced for provider "anthropic"/);
  });

  it("widening the allowlist alone dispatches NOTHING: pricing and approval still gate", () => {
    clearAll();
    process.env.REDUCE_PROVIDER = "anthropic";
    process.env.REDUCE_MODEL = "claude-priced";
    // priced FOR anthropic only in a hypothetical injected table...
    const table: PriceTable = { "claude-priced": { in: 1, out: 5, provider: "anthropic" } };
    expect(pricedFor("anthropic", "claude-priced", table)).toBe(true);
    // ...but the SHIPPED table has no such row, so the ladder still refuses
    expect(resolveWorkloadModel("reduce", WIDENED).dispatchBlocked).toMatch(
      /is not priced for provider "anthropic"/,
    );
    // and the registry holds no anthropic approval for any workload
    for (const w of ANALYSIS_WORKLOADS) {
      expect(analysisApproval(w, "anthropic", "gpt-4o-mini", null).approved).toBe(false);
    }
  });

  it("widening is NOT reachable from a dispatch site: workloadDispatchConfig takes one argument", () => {
    // the injection point is deliberately absent from the dispatch entry point,
    // so no call site can widen its own allowlist (ruling 4 fail-closed)
    expect(workloadDispatchConfig.length).toBe(1);
    clearAll();
    process.env.REDUCE_PROVIDER = "anthropic";
    process.env.REDUCE_MODEL = "claude-whatever";
    expect(() => workloadDispatchConfig("reduce")).toThrow(/not allowed for workload/);
  });
});
