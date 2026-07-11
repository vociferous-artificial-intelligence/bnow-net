import { afterEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { embedGuardFromEnv, embedDailyUsdCap, EMBED_PROVIDER } = await import("./guard");

const SAVED = {
  sprint: process.env.LLM_SPRINT_USD_CAP,
  daily: process.env.EMBED_USD_CAP_DAILY,
  vercel: process.env.VERCEL_ENV,
  dReq: process.env.EMBED_DAILY_REQUEST_CAP,
  rReq: process.env.EMBED_RUN_REQUEST_CAP,
};

afterEach(() => {
  // restore mutated env so ordering never leaks between cases
  for (const [k, v] of [
    ["LLM_SPRINT_USD_CAP", SAVED.sprint],
    ["EMBED_USD_CAP_DAILY", SAVED.daily],
    ["VERCEL_ENV", SAVED.vercel],
    ["EMBED_DAILY_REQUEST_CAP", SAVED.dReq],
    ["EMBED_RUN_REQUEST_CAP", SAVED.rReq],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("embedGuardFromEnv", () => {
  it("uses provider openai_embed", () => {
    expect(EMBED_PROVIDER).toBe("openai_embed");
    expect(embedGuardFromEnv().cfg.provider).toBe("openai_embed");
  });

  it("fails closed on the total cap when LLM_SPRINT_USD_CAP is unset (null)", () => {
    delete process.env.LLM_SPRINT_USD_CAP;
    expect(embedGuardFromEnv().cfg.totalCapUsd).toBeNull();
  });

  it("reads LLM_SPRINT_USD_CAP as the all-time backstop", () => {
    process.env.LLM_SPRINT_USD_CAP = "5";
    expect(embedGuardFromEnv().cfg.totalCapUsd).toBe(5);
  });

  it("daily cap defaults to 1 outside production when EMBED_USD_CAP_DAILY is unset", () => {
    delete process.env.EMBED_USD_CAP_DAILY;
    delete process.env.VERCEL_ENV; // NODE_ENV is 'test' under vitest -> not production
    expect(embedDailyUsdCap()).toBe(1);
    expect(embedGuardFromEnv().cfg.dailyUsdCap).toBe(1);
  });

  it("daily cap fails closed (null) in production when EMBED_USD_CAP_DAILY is unset", () => {
    delete process.env.EMBED_USD_CAP_DAILY;
    process.env.VERCEL_ENV = "production";
    expect(embedDailyUsdCap()).toBeNull();
  });

  it("EMBED_USD_CAP_DAILY overrides the default", () => {
    process.env.EMBED_USD_CAP_DAILY = "2";
    expect(embedDailyUsdCap()).toBe(2);
  });

  it("request caps come from env with 2000/500 defaults", () => {
    delete process.env.EMBED_DAILY_REQUEST_CAP;
    delete process.env.EMBED_RUN_REQUEST_CAP;
    const cfg = embedGuardFromEnv().cfg;
    expect(cfg.dailyRequestCap).toBe(2000);
    expect(cfg.runRequestCap).toBe(500);
    process.env.EMBED_DAILY_REQUEST_CAP = "10";
    process.env.EMBED_RUN_REQUEST_CAP = "3";
    const cfg2 = embedGuardFromEnv().cfg;
    expect(cfg2.dailyRequestCap).toBe(10);
    expect(cfg2.runRequestCap).toBe(3);
  });
});
