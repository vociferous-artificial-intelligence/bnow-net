import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Release hardening 2026-08-17: no analysis workload may run with the OpenAI
// SDK's default auto-retries (maxRetries: 2), which let one SpendGuard
// reservation cover up to three physical billed attempts. Two pins:
// 1. the shared factory constructs with maxRetries: 0;
// 2. a source scan proves every analysis dispatch module constructs its client
//    ONLY through the factory (no bare `new OpenAI(` anywhere in the set).

const ctorSpy = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
  },
}));

import { analysisOpenAiClient } from "./openai-client";

describe("analysisOpenAiClient", () => {
  it("constructs the SDK client with auto-retries DISABLED", () => {
    analysisOpenAiClient();
    expect(ctorSpy).toHaveBeenCalledWith({ maxRetries: 0 });
  });
});

describe("analysis dispatch modules construct clients only via the factory", () => {
  const REPO_SRC = join(__dirname, "..", "..");
  /** Every module that dispatches a paid analysis-workload call. */
  const ANALYSIS_DISPATCH_MODULES = [
    "lib/analysis/map-worker.ts",
    "lib/analysis/synthesize.ts",
    "lib/analysis/openai-provider.ts",
    "lib/validation/llm-match.ts",
    "app/api/cron/entity-audit/route.ts",
  ];

  it("no bare `new OpenAI(` and no value-import of the SDK outside the factory", () => {
    for (const rel of ANALYSIS_DISPATCH_MODULES) {
      const src = readFileSync(join(REPO_SRC, rel), "utf8");
      expect(src.includes("new OpenAI("), `${rel} must not construct the SDK directly`).toBe(false);
      // type-only imports are fine; a VALUE import would allow construction
      expect(
        /import\s+OpenAI\s+from\s+["']openai["']/.test(src),
        `${rel} must import the SDK type-only (import type OpenAI ...)`,
      ).toBe(false);
      expect(src.includes("analysisOpenAiClient"), `${rel} must use the shared factory`).toBe(true);
    }
  });

  it("the factory itself pins maxRetries: 0 in source", () => {
    const src = readFileSync(join(REPO_SRC, "lib/analysis/openai-client.ts"), "utf8");
    expect(src).toContain("new OpenAI({ maxRetries: 0 })");
  });
});
