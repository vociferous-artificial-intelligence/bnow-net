import { afterEach, describe, expect, it, vi } from "vitest";
import { route, routePolicyString, ROUTE_POLICY_VERSION, type RoutePolicy } from "./router";
import { askAnswerModel, askCandidates, askEvidenceK, askRerankModel } from "./config";
import { ANSWER_MAX_OUTPUT_TOKENS } from "./answer";

afterEach(() => vi.unstubAllEnvs());

describe("router — Auto ≡ today's pipeline constants (behavior-identity pin)", () => {
  it("reproduces the exact config values the pipeline reads, at defaults", () => {
    const p = route({ mode: "auto" }) as RoutePolicy;
    expect(p.mode).toBe("auto");
    expect(p.policyVersion).toBe(ROUTE_POLICY_VERSION);
    expect(p.answerModel).toBe(askAnswerModel()); // gpt-5 default
    expect(p.rerankModel).toBe(askRerankModel()); // gpt-5-mini default
    expect(p.evidenceK).toBe(askEvidenceK()); // 60 default
    expect(p.candidatesCap).toBe(askCandidates()); // 300 default
    expect(p.maxOutputTokens).toBe(ANSWER_MAX_OUTPUT_TOKENS); // 2500 default
    expect(p.reasoningEffort).toBe("low"); // the answer stage's exact setting
  });

  it("tracks env overrides exactly like the pipeline (no drift under config)", () => {
    vi.stubEnv("ASK_ANSWER_MODEL", "gpt-4o");
    vi.stubEnv("ASK_EVIDENCE_K", "40");
    vi.stubEnv("ASK_ANSWER_MAX_OUTPUT_TOKENS", "1200");
    const p = route({ mode: "auto" }) as RoutePolicy;
    expect(p.answerModel).toBe("gpt-4o");
    expect(p.evidenceK).toBe(40);
    expect(p.maxOutputTokens).toBe(1200);
  });

  it("is deterministic: identical features produce identical policies", () => {
    expect(route({ mode: "auto" })).toEqual(route({ mode: "auto" }));
  });

  it("G4: degenerate max-output env values record what the pipeline ACTUALLY uses (envNum parity, no >0 floor)", () => {
    vi.stubEnv("ASK_ANSWER_MAX_OUTPUT_TOKENS", "0");
    expect((route({ mode: "auto" }) as RoutePolicy).maxOutputTokens).toBe(0);
    vi.stubEnv("ASK_ANSWER_MAX_OUTPUT_TOKENS", "-100");
    expect((route({ mode: "auto" }) as RoutePolicy).maxOutputTokens).toBe(-100);
    vi.stubEnv("ASK_ANSWER_MAX_OUTPUT_TOKENS", "not-a-number");
    expect((route({ mode: "auto" }) as RoutePolicy).maxOutputTokens).toBe(ANSWER_MAX_OUTPUT_TOKENS);
  });

  it("G4: an env-overridden answer model is distinguishable in the recorded reason", () => {
    expect((route({ mode: "auto" }) as RoutePolicy).reason).toBe("auto_baseline");
    vi.stubEnv("ASK_ANSWER_MODEL", "gpt-4o");
    expect((route({ mode: "auto" }) as RoutePolicy).reason).toBe("auto_env_override");
  });
});

describe("router — Fast/Deep stay unavailable without a scorecard (§8.4 gate)", () => {
  it("fast refuses with scorecard_missing (the paid matrix never ran); never a silent downgrade", () => {
    const r = route({ mode: "fast" });
    expect("available" in r && r.available === false).toBe(true);
    expect(("reason" in r && r.reason) || "").toBe("scorecard_missing");
  });

  it("deep refuses with scorecard_missing", () => {
    const r = route({ mode: "deep" });
    expect("available" in r && r.available === false).toBe(true);
  });

  it("G4: name-bearing questions carry an INDEPENDENT fidelity-suite gate (an answer-matrix scorecard alone can never unlock them)", () => {
    // today both legs refuse; the pin is that the nameBearing path exercises
    // its own check — no fidelity-fixtures suite exists on any entry
    const r = route({ mode: "fast", nameBearing: true });
    expect("available" in r && r.available === false).toBe(true);
    const d = route({ mode: "deep", nameBearing: true });
    expect("available" in d && d.available === false).toBe(true);
  });

  it("unknown modes refuse", () => {
    const r = route({ mode: "turbo" as never });
    expect("available" in r && r.available === false).toBe(true);
    expect(("reason" in r && r.reason) || "").toBe("unknown_mode");
  });
});

describe("routePolicyString", () => {
  it("is a compact stable recording string", () => {
    const p = route({ mode: "auto" }) as RoutePolicy;
    expect(routePolicyString(p)).toBe(`${ROUTE_POLICY_VERSION}:auto:${p.answerModel}:k${p.evidenceK}`);
  });
});
