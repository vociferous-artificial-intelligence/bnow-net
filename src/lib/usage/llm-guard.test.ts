import { afterEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  DIGEST_DAILY_USD_CAP_DEFAULT,
  DIGEST_PROVIDER,
  MAP_DAILY_USD_CAP_DEFAULT,
  MAP_PROVIDER,
  LlmDisabledError,
  assertLlmEnabled,
  llmDailyUsdCap,
  digestGuardFromEnv,
  digestMaxOutputTokens,
  estimateUsd,
  isLlmDisabled,
  mapDailyUsdCap,
  mapGuardFromEnv,
} = await import("./llm-guard");

const SAVED = {
  LLM_DISABLE: process.env.LLM_DISABLE,
  LLM_DIGEST_USD_CAP: process.env.LLM_DIGEST_USD_CAP,
  LLM_DIGEST_MAX_OUTPUT_TOKENS: process.env.LLM_DIGEST_MAX_OUTPUT_TOKENS,
  LLM_SPRINT_USD_CAP: process.env.LLM_SPRINT_USD_CAP,
  MAP_USD_CAP_DAILY: process.env.MAP_USD_CAP_DAILY,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("LLM kill-switch", () => {
  it("is off unless LLM_DISABLE=1 exactly", () => {
    delete process.env.LLM_DISABLE;
    expect(isLlmDisabled()).toBe(false);
    process.env.LLM_DISABLE = "0";
    expect(isLlmDisabled()).toBe(false);
    process.env.LLM_DISABLE = "true"; // only "1" arms it — no accidental truthiness
    expect(isLlmDisabled()).toBe(false);
    process.env.LLM_DISABLE = "1";
    expect(isLlmDisabled()).toBe(true);
  });

  it("assertLlmEnabled throws a typed error naming the call site", () => {
    process.env.LLM_DISABLE = "1";
    expect(() => assertLlmEnabled("digest extract")).toThrow(LlmDisabledError);
    try {
      assertLlmEnabled("digest extract");
    } catch (e) {
      expect((e as { code: string }).code).toBe("LLM_DISABLED");
      expect((e as Error).message).toContain("digest extract");
    }
  });

  it("assertLlmEnabled is a no-op when the switch is off", () => {
    delete process.env.LLM_DISABLE;
    expect(() => assertLlmEnabled("digest extract")).not.toThrow();
  });
});

describe("gpt-4o-mini pricing", () => {
  it("prices the audit's measured RU 07-08 digest call (7,697 in / 734 out)", () => {
    // audit §7c: $0.001595 compact lower bound
    expect(estimateUsd(7697, 734)).toBeCloseTo(0.001595, 6);
  });

  it("prices a 16,384-token truncated response the way the audit does", () => {
    // audit §4d/§7c: the two discarded UA 07-02 truncations
    expect(estimateUsd(9056, 16384) + estimateUsd(6104, 16384)).toBeCloseTo(0.0219, 4);
  });
});

describe("digest daily cap resolution", () => {
  it("uses LLM_DIGEST_USD_CAP when set", () => {
    process.env.LLM_DIGEST_USD_CAP = "3.5";
    expect(llmDailyUsdCap()).toBe(3.5);
  });

  it("falls back to the documented default outside production", () => {
    delete process.env.LLM_DIGEST_USD_CAP;
    delete process.env.VERCEL_ENV;
    expect(process.env.NODE_ENV).not.toBe("production"); // vitest runs as "test"
    expect(llmDailyUsdCap()).toBe(DIGEST_DAILY_USD_CAP_DEFAULT);
  });

  it("fails closed (null) in production when the cap env is unset", () => {
    delete process.env.LLM_DIGEST_USD_CAP;
    process.env.VERCEL_ENV = "production";
    expect(llmDailyUsdCap()).toBeNull();
  });

  it("an unset cap in production makes the guard refuse every reservation", async () => {
    delete process.env.LLM_DIGEST_USD_CAP;
    process.env.VERCEL_ENV = "production";
    process.env.LLM_SPRINT_USD_CAP = "25"; // total cap present: only the daily one is missing
    const g = digestGuardFromEnv();
    expect(g.cfg.provider).toBe(DIGEST_PROVIDER);
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("daily USD cap env unset");
  });

  it("an unset LLM_SPRINT_USD_CAP also fails closed", async () => {
    process.env.LLM_DIGEST_USD_CAP = "2";
    delete process.env.LLM_SPRINT_USD_CAP;
    const r = digestGuardFromEnv().tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total cap env unset");
  });
});

describe("map daily cap resolution (own env var, never the digest's)", () => {
  it("uses MAP_USD_CAP_DAILY when set — and ignores LLM_DIGEST_USD_CAP entirely", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.LLM_DIGEST_USD_CAP = "0.01"; // must have no effect on the map guard
    expect(mapDailyUsdCap()).toBe(4);
  });

  it("falls back to the documented default outside production", () => {
    delete process.env.MAP_USD_CAP_DAILY;
    delete process.env.VERCEL_ENV;
    expect(mapDailyUsdCap()).toBe(MAP_DAILY_USD_CAP_DEFAULT);
  });

  it("fails closed (null) in production when MAP_USD_CAP_DAILY is unset", () => {
    delete process.env.MAP_USD_CAP_DAILY;
    process.env.LLM_DIGEST_USD_CAP = "2"; // the digest cap must NOT stand in for it
    process.env.VERCEL_ENV = "production";
    expect(mapDailyUsdCap()).toBeNull();
  });

  it("an unset cap in production makes the guard refuse every reservation", () => {
    delete process.env.MAP_USD_CAP_DAILY;
    process.env.VERCEL_ENV = "production";
    process.env.LLM_SPRINT_USD_CAP = "25";
    const g = mapGuardFromEnv();
    expect(g.cfg.provider).toBe(MAP_PROVIDER);
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("daily USD cap env unset");
  });

  it("an unset LLM_SPRINT_USD_CAP (all-time backstop) also fails closed", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    delete process.env.LLM_SPRINT_USD_CAP;
    const r = mapGuardFromEnv().tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total cap env unset");
  });
});

describe("digest output ceiling", () => {
  it("defaults to 4096 and is env-tunable", () => {
    delete process.env.LLM_DIGEST_MAX_OUTPUT_TOKENS;
    expect(digestMaxOutputTokens()).toBe(4096);
    process.env.LLM_DIGEST_MAX_OUTPUT_TOKENS = "8192";
    expect(digestMaxOutputTokens()).toBe(8192);
  });
});
