import { afterEach, describe, expect, it } from "vitest";
import {
  askAnswerModel,
  askCandidates,
  askEvidenceK,
  askLexicalTop,
  askPipeline,
  askRerankModel,
  askVectorTop,
} from "./config";

const KEYS = [
  "ASK_PIPELINE",
  "ASK_CANDIDATES",
  "ASK_EVIDENCE_K",
  "ASK_VECTOR_TOP",
  "ASK_LEXICAL_TOP",
  "ASK_ANSWER_MODEL",
  "ASK_RERANK_MODEL",
] as const;

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("askPipeline", () => {
  it("defaults to v2 (D4 gate passed 2026-07-11); only exactly 'legacy' rolls back", () => {
    delete process.env.ASK_PIPELINE;
    expect(askPipeline()).toBe("v2");
    process.env.ASK_PIPELINE = "legacy";
    expect(askPipeline()).toBe("legacy");
    for (const other of ["v2", "LEGACY", "legacy ", "vector", ""]) {
      process.env.ASK_PIPELINE = other;
      expect(askPipeline()).toBe("v2");
    }
  });
});

describe("numeric knobs — defaults, overrides, and safe flooring", () => {
  it("defaults", () => {
    expect(askCandidates()).toBe(300);
    expect(askEvidenceK()).toBe(60);
    expect(askVectorTop()).toBe(150);
    expect(askLexicalTop()).toBe(150);
  });

  it("valid overrides apply", () => {
    process.env.ASK_CANDIDATES = "500";
    process.env.ASK_EVIDENCE_K = "40";
    process.env.ASK_VECTOR_TOP = "200";
    process.env.ASK_LEXICAL_TOP = "80";
    expect(askCandidates()).toBe(500);
    expect(askEvidenceK()).toBe(40);
    expect(askVectorTop()).toBe(200);
    expect(askLexicalTop()).toBe(80);
  });

  it("floors floats and rejects zero / negative / non-numeric back to the default", () => {
    process.env.ASK_CANDIDATES = "12.9";
    expect(askCandidates()).toBe(12);
    for (const bad of ["0", "-5", "not-a-number", ""]) {
      process.env.ASK_VECTOR_TOP = bad;
      expect(askVectorTop()).toBe(150);
    }
  });
});

describe("model knobs", () => {
  it("default to the gpt-5 family and trim overrides", () => {
    expect(askAnswerModel()).toBe("gpt-5");
    expect(askRerankModel()).toBe("gpt-5-mini");
    process.env.ASK_ANSWER_MODEL = "  gpt-5-pro  ";
    expect(askAnswerModel()).toBe("gpt-5-pro");
    process.env.ASK_RERANK_MODEL = "   ";
    expect(askRerankModel()).toBe("gpt-5-mini"); // whitespace-only -> default
  });
});
