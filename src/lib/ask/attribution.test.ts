import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attributeAskUsage,
  attributionCoverage,
  utcDay,
  type AskUsageRowSlice,
} from "./attribution";

/** A fully-null ask_usage slice; each test fills only the columns it means. */
function row(o: Partial<AskUsageRowSlice> & { day: string }): AskUsageRowSlice {
  return {
    costUsd: null,
    rerankModel: null,
    rerankPromptTokens: null,
    rerankCompletionTokens: null,
    rerankCostUsd: null,
    answerModel: null,
    answerPromptTokens: null,
    answerCompletionTokens: null,
    answerCostUsd: null,
    embedTokens: null,
    embedCostUsd: null,
    ...o,
  };
}

/** One complete v2 run: embed + rerank + answer all metered. */
function v2Run(day: string, answerModel: string, rerankModel: string | null = "gpt-5-mini") {
  return row({
    day,
    costUsd: 0.011,
    embedTokens: 100,
    embedCostUsd: 0.000002,
    rerankModel,
    rerankPromptTokens: rerankModel ? 20_000 : null,
    rerankCompletionTokens: rerankModel ? 500 : null,
    rerankCostUsd: rerankModel ? 0.006 : null,
    answerModel,
    answerPromptTokens: 15_000,
    answerCompletionTokens: 800,
    answerCostUsd: 0.005,
  });
}

describe("attributeAskUsage", () => {
  it("aggregates per (UTC day, stage, model) with exact sums", () => {
    const out = attributeAskUsage([
      v2Run("2026-09-01", "gpt-5"),
      v2Run("2026-09-01", "gpt-5"),
      v2Run("2026-09-01", "gpt-5-nano"),
      v2Run("2026-09-02", "gpt-5"),
    ]);

    const answer1 = out.find(
      (r) => r.day === "2026-09-01" && r.stage === "answer" && r.model === "gpt-5",
    );
    expect(answer1).toEqual({
      day: "2026-09-01",
      stage: "answer",
      model: "gpt-5",
      runs: 2,
      promptTokens: 30_000,
      completionTokens: 1_600,
      costUsd: 0.01,
    });

    const nano = out.find(
      (r) => r.day === "2026-09-01" && r.stage === "answer" && r.model === "gpt-5-nano",
    );
    expect(nano).toMatchObject({ runs: 1, promptTokens: 15_000, completionTokens: 800 });

    // day 2 is a separate bucket for the same model
    expect(
      out.find((r) => r.day === "2026-09-02" && r.stage === "answer" && r.model === "gpt-5"),
    ).toMatchObject({ runs: 1, costUsd: 0.005 });

    // the rerank bucket pools all three day-1 runs (same rerank model)
    expect(
      out.find((r) => r.day === "2026-09-01" && r.stage === "rerank" && r.model === "gpt-5-mini"),
    ).toMatchObject({ runs: 3, promptTokens: 60_000, completionTokens: 1_500 });

    // embed always attributes to null — ask_usage has no embed_model column
    const embed = out.filter((r) => r.stage === "embed");
    expect(embed.map((r) => r.model)).toEqual([null, null]);
    expect(embed[0]).toMatchObject({ day: "2026-09-01", runs: 3, promptTokens: 300 });
  });

  it("buckets a missing model name as null rather than dropping the spend", () => {
    const out = attributeAskUsage([
      row({ day: "2026-09-01", answerModel: null, answerPromptTokens: 10, answerCostUsd: 0.5 }),
      row({ day: "2026-09-01", answerModel: "gpt-5", answerPromptTokens: 10, answerCostUsd: 0.25 }),
    ]);
    expect(out.map((r) => [r.model, r.costUsd])).toEqual([
      ["gpt-5", 0.25],
      [null, 0.5],
    ]);
  });

  it("skips a stage that left no signal at all (refused answer, unused rerank)", () => {
    const out = attributeAskUsage([
      row({ day: "2026-09-01", costUsd: 0, embedTokens: 90, embedCostUsd: 0.0000018 }),
    ]);
    expect(out.map((r) => r.stage)).toEqual(["embed"]);
  });

  it("counts a zero-cost stage that DID run (rerank_model set, no tokens yet)", () => {
    const out = attributeAskUsage([row({ day: "2026-09-01", rerankModel: "gpt-5-mini" })]);
    expect(out).toEqual([
      {
        day: "2026-09-01",
        stage: "rerank",
        model: "gpt-5-mini",
        runs: 1,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
      },
    ]);
  });

  it("sorts by day, then pipeline stage order, then model with null last", () => {
    const out = attributeAskUsage([
      v2Run("2026-09-02", "gpt-5"),
      v2Run("2026-09-01", "gpt-5-nano"),
      row({ day: "2026-09-01", answerModel: null, answerCostUsd: 0.1 }),
      row({ day: "2026-09-01", answerModel: "aaa-model", answerCostUsd: 0.1 }),
    ]);
    expect(out.map((r) => `${r.day}/${r.stage}/${r.model ?? "null"}`)).toEqual([
      "2026-09-01/embed/null",
      "2026-09-01/rerank/gpt-5-mini",
      "2026-09-01/answer/aaa-model",
      "2026-09-01/answer/gpt-5-nano",
      "2026-09-01/answer/null",
      "2026-09-02/embed/null",
      "2026-09-02/rerank/gpt-5-mini",
      "2026-09-02/answer/gpt-5",
    ]);
  });

  it("returns nothing for no rows", () => {
    expect(attributeAskUsage([])).toEqual([]);
  });
});

describe("attributionCoverage", () => {
  it("reports the legacy pre-v2 remainder as unattributed", () => {
    // one v2 run (cost_usd 0.011; per-stage columns break out 0.011002 —
    // rounding drift the real rows also carry) plus a legacy row that carries
    // only the whole-pipeline cost
    const rows = [v2Run("2026-09-01", "gpt-5"), row({ day: "2026-08-01", costUsd: 0.02 })];
    const cov = attributionCoverage(rows);
    expect(cov.rows).toBe(2);
    expect(cov.totalCostUsd).toBeCloseTo(0.031, 12);
    expect(cov.attributedCostUsd).toBeCloseTo(0.011002, 12);
    expect(cov.unattributedCostUsd).toBeCloseTo(0.019998, 12);
  });
});

describe("utcDay", () => {
  it("takes the UTC calendar day, never a local one", () => {
    expect(utcDay(new Date("2026-09-02T03:30:00Z"))).toBe("2026-09-02");
    expect(utcDay("2026-09-02T00:30:00Z")).toBe("2026-09-02");
  });
});

describe("scripts/ask-model-attribution.ts is read-only", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../../scripts/ask-model-attribution.ts", import.meta.url)),
    "utf8",
  );
  /** Source with line and block comments removed, so prose about writes cannot
   *  mask (or manufacture) a finding. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("contains no write verb outside comments", () => {
    const hits = code.match(
      /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY)\b/gi,
    );
    expect(hits ?? []).toEqual([]);
  });

  it("queries ask_usage with a SELECT", () => {
    expect(code).toMatch(/SELECT[\s\S]*FROM ask_usage/);
  });

  it("never reaches a provider SDK", () => {
    expect(code.includes("new OpenAI(")).toBe(false);
    expect(/from\s*["']openai(?:\/[^"']*)?["']/.test(code)).toBe(false);
    expect(/(?:require|import)\s*\(\s*["']openai(?:\/[^"']*)?["']/.test(code)).toBe(false);
  });

  it("selects no question text", () => {
    expect(/\bquestion\b/i.test(code)).toBe(false);
  });
});
