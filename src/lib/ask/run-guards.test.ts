import { afterEach, describe, expect, it, vi } from "vitest";
import { AtomicReservationGuard } from "../usage/reservations";
import {
  answerCeilingUsd,
  buildAskRunGuards,
  embedCeilingUsd,
  rerankCeilingUsd,
} from "./run-guards";

// Gate 1 finding: the enforce-mode guard wiring (providers, stages, ceilings,
// caps) was previously tested nowhere — a swapped provider or a zero ceiling
// would have shipped green. These tests pin the construction; the end-to-end
// reservation flow through the real providers is integration-tested.

afterEach(() => vi.unstubAllEnvs());

describe("per-stage ceilings", () => {
  it("are strictly positive under defaults", () => {
    expect(answerCeilingUsd()).toBeGreaterThan(0);
    expect(rerankCeilingUsd()).toBeGreaterThan(0);
    expect(embedCeilingUsd()).toBeGreaterThan(0);
  });

  it("answer ceiling responds to the model and the output-token env", () => {
    const base = answerCeilingUsd();
    vi.stubEnv("ASK_ANSWER_MAX_OUTPUT_TOKENS", "5000"); // 2x the default 2500
    expect(answerCeilingUsd()).toBeGreaterThan(base);
    vi.unstubAllEnvs();
    vi.stubEnv("ASK_ANSWER_MODEL", "gpt-5-nano"); // cheaper model, cheaper ceiling
    expect(answerCeilingUsd()).toBeLessThan(base);
  });

  it("an UNKNOWN model still yields a positive (conservative) ceiling", () => {
    vi.stubEnv("ASK_ANSWER_MODEL", "totally-unknown-model");
    expect(answerCeilingUsd()).toBeGreaterThan(0); // price-table fallback {in:5,out:15}
  });

  it("ceilings dominate realistic per-call cost (never starve a legitimate call)", () => {
    // observed mean answer cost ≈ $0.011; the ceiling must sit well above it
    expect(answerCeilingUsd()).toBeGreaterThan(0.011);
  });
});

describe("buildAskRunGuards wiring", () => {
  it("constructs three atomic guards with the correct provider/stage/ceiling per stage", () => {
    const guards = buildAskRunGuards("11111111-2222-4333-8444-555555555555");
    for (const g of [guards.embed, guards.rerank, guards.answer]) {
      expect(g).toBeInstanceOf(AtomicReservationGuard);
    }
    const embed = guards.embed as AtomicReservationGuard;
    const rerank = guards.rerank as AtomicReservationGuard;
    const answer = guards.answer as AtomicReservationGuard;

    expect(embed.opts.provider).toBe("openai_embed"); // envelope isolation (invariant 4)
    expect(rerank.opts.provider).toBe("openai_ask");
    expect(answer.opts.provider).toBe("openai_ask");
    expect(embed.opts.stage).toBe("embed");
    expect(rerank.opts.stage).toBe("rerank");
    expect(answer.opts.stage).toBe("answer");
    expect(embed.opts.runId).toBe("11111111-2222-4333-8444-555555555555");

    expect(embed.opts.ceilingUsd).toBeCloseTo(embedCeilingUsd(), 10);
    expect(rerank.opts.ceilingUsd).toBeCloseTo(rerankCeilingUsd(), 10);
    expect(answer.opts.ceilingUsd).toBeCloseTo(answerCeilingUsd(), 10);
    // rerank and answer settle independently — distinct guard instances
    expect(rerank).not.toBe(answer);
  });

  it("guards read the SAME cap envs as the legacy guards (which caps apply never changes)", () => {
    vi.stubEnv("LLM_SPRINT_USD_CAP", "42");
    vi.stubEnv("ASK_USD_CAP_DAILY", "3");
    vi.stubEnv("EMBED_USD_CAP_DAILY", "0.5");
    const guards = buildAskRunGuards("11111111-2222-4333-8444-555555555555");
    expect((guards.answer as AtomicReservationGuard).opts.caps.totalCapUsd).toBe(42);
    expect((guards.answer as AtomicReservationGuard).opts.caps.dailyUsdCap).toBe(3);
    expect((guards.embed as AtomicReservationGuard).opts.caps.dailyUsdCap).toBe(0.5);
  });
});
