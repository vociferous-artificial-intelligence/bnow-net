import { describe, expect, it } from "vitest";
import { chatParamsForModel } from "./llm-params";

describe("chatParamsForModel", () => {
  it("gpt-5: max_completion_tokens only — no temperature, no reasoning_effort", () => {
    expect(chatParamsForModel("gpt-5", 1200)).toEqual({ max_completion_tokens: 1200 });
  });

  it("gpt-5-mini / gpt-5-nano: max_completion_tokens, reasoning_effort passthrough", () => {
    expect(chatParamsForModel("gpt-5-mini", 500, { reasoningEffort: "minimal" })).toEqual({
      max_completion_tokens: 500,
      reasoning_effort: "minimal",
    });
    expect(chatParamsForModel("gpt-5-nano", 800, { reasoningEffort: "low" })).toEqual({
      max_completion_tokens: 800,
      reasoning_effort: "low",
    });
  });

  it("gpt-5: drops an explicit temperature (the family rejects it)", () => {
    expect(chatParamsForModel("gpt-5", 1200, { temperature: 0.7 })).toEqual({
      max_completion_tokens: 1200,
    });
  });

  it("gpt-4o-mini: max_tokens + default temperature 0.1, no reasoning_effort", () => {
    expect(chatParamsForModel("gpt-4o-mini", 700)).toEqual({ max_tokens: 700, temperature: 0.1 });
  });

  it("gpt-4o-mini: honors an explicit temperature override", () => {
    expect(chatParamsForModel("gpt-4o-mini", 700, { temperature: 0.9 })).toEqual({
      max_tokens: 700,
      temperature: 0.9,
    });
  });

  it("gpt-4o-mini: reasoning_effort is ignored on non-gpt-5 models", () => {
    expect(chatParamsForModel("gpt-4o-mini", 700, { reasoningEffort: "low" })).toEqual({
      max_tokens: 700,
      temperature: 0.1,
    });
  });
});
