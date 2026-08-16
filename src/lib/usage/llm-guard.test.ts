import { afterEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  DIGEST_DAILY_USD_CAP_DEFAULT,
  DIGEST_PROVIDER,
  MAP_DAILY_USD_CAP_DEFAULT,
  MAP_PROVIDER,
  ASK_DAILY_USD_CAP_DEFAULT,
  ASK_PROVIDER,
  LlmDisabledError,
  assertLlmEnabled,
  llmDailyUsdCap,
  digestGuardFromEnv,
  digestMaxOutputTokens,
  estimateUsd,
  isLlmDisabled,
  mapDailyUsdCap,
  mapGuardFromEnv,
  askDailyUsdCap,
  askGuardFromEnv,
} = await import("./llm-guard");

const SAVED = {
  LLM_DISABLE: process.env.LLM_DISABLE,
  LLM_DIGEST_USD_CAP: process.env.LLM_DIGEST_USD_CAP,
  LLM_DIGEST_MAX_OUTPUT_TOKENS: process.env.LLM_DIGEST_MAX_OUTPUT_TOKENS,
  LLM_SPRINT_USD_CAP: process.env.LLM_SPRINT_USD_CAP,
  MAP_SPRINT_USD_CAP: process.env.MAP_SPRINT_USD_CAP,
  MAP_USD_CAP_DAILY: process.env.MAP_USD_CAP_DAILY,
  MAP_USD_CAP_DAILY_OVERRIDE_USD: process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD,
  MAP_USD_CAP_DAILY_OVERRIDE_UNTIL: process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL,
  ASK_USD_CAP_DAILY: process.env.ASK_USD_CAP_DAILY,
  ASK_DAILY_REQUEST_CAP: process.env.ASK_DAILY_REQUEST_CAP,
  ASK_RUN_REQUEST_CAP: process.env.ASK_RUN_REQUEST_CAP,
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
    delete process.env.MAP_SPRINT_USD_CAP;
    const r = mapGuardFromEnv().tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total cap env unset");
  });
});

describe("map all-time backstop (MAP_SPRINT_USD_CAP, 2026-08-15 recovery)", () => {
  it("MAP_SPRINT_USD_CAP wins over the shared LLM_SPRINT_USD_CAP for the map guard only", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.LLM_SPRINT_USD_CAP = "10";
    process.env.MAP_SPRINT_USD_CAP = "40";
    expect(mapGuardFromEnv().cfg.totalCapUsd).toBe(40);
    // the other OpenAI paths keep the shared value — no unrelated headroom
    expect(digestGuardFromEnv().cfg.totalCapUsd).toBe(10);
    expect(askGuardFromEnv().cfg.totalCapUsd).toBe(10);
  });

  it("falls back to the shared LLM_SPRINT_USD_CAP when MAP_SPRINT_USD_CAP is unset", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.LLM_SPRINT_USD_CAP = "10";
    delete process.env.MAP_SPRINT_USD_CAP;
    expect(mapGuardFromEnv().cfg.totalCapUsd).toBe(10);
  });

  it("both unset -> null -> the guard fails closed", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    delete process.env.LLM_SPRINT_USD_CAP;
    delete process.env.MAP_SPRINT_USD_CAP;
    expect(mapGuardFromEnv().cfg.totalCapUsd).toBeNull();
  });
});

describe("map daily cap auto-expiring recovery override", () => {
  const NOW_BEFORE = new Date("2026-08-16T12:00:00Z");
  const NOW_AT = new Date("2026-08-17T13:00:00Z");
  const NOW_AFTER = new Date("2026-08-17T13:00:01Z");

  it("applies the override strictly before UNTIL and reverts at/after it with no redeploy", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD = "20";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL = "2026-08-17T13:00:00Z";
    expect(mapDailyUsdCap(NOW_BEFORE)).toBe(20);
    expect(mapDailyUsdCap(NOW_AT)).toBe(4); // expiry boundary is exact
    expect(mapDailyUsdCap(NOW_AFTER)).toBe(4);
  });

  it("a timezone-less UNTIL disables the override (never guesses a zone)", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD = "20";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL = "2026-08-17T13:00:00";
    expect(mapDailyUsdCap(NOW_BEFORE)).toBe(4);
  });

  it("an unparseable UNTIL or a missing pair member disables the override", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD = "20";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL = "not-a-date-Z";
    expect(mapDailyUsdCap(NOW_BEFORE)).toBe(4);
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL = "2026-08-17T13:00:00Z";
    delete process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD;
    expect(mapDailyUsdCap(NOW_BEFORE)).toBe(4);
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD = "20";
    delete process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL;
    expect(mapDailyUsdCap(NOW_BEFORE)).toBe(4);
  });

  it("an override can never turn a fail-closed (unset) base cap on", () => {
    delete process.env.MAP_USD_CAP_DAILY;
    process.env.VERCEL_ENV = "production";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD = "20";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL = "2026-08-17T13:00:00Z";
    expect(mapDailyUsdCap(NOW_BEFORE)).toBeNull();
  });

  it("offset timezones are accepted as explicit", () => {
    process.env.MAP_USD_CAP_DAILY = "4";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_USD = "20";
    process.env.MAP_USD_CAP_DAILY_OVERRIDE_UNTIL = "2026-08-17T09:00:00-04:00"; // = 13:00Z
    expect(mapDailyUsdCap(NOW_BEFORE)).toBe(20);
    expect(mapDailyUsdCap(NOW_AT)).toBe(4);
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

describe("ASK daily cap resolution (second gate; own env var, never the digest's)", () => {
  it("uses ASK_USD_CAP_DAILY when set — and ignores LLM_DIGEST_USD_CAP entirely", () => {
    process.env.ASK_USD_CAP_DAILY = "4";
    process.env.LLM_DIGEST_USD_CAP = "0.01"; // must have no effect on the ask guard
    expect(askDailyUsdCap()).toBe(4);
  });

  it("falls back to the documented default outside production", () => {
    delete process.env.ASK_USD_CAP_DAILY;
    delete process.env.VERCEL_ENV;
    expect(process.env.NODE_ENV).not.toBe("production"); // vitest runs as "test"
    expect(askDailyUsdCap()).toBe(ASK_DAILY_USD_CAP_DEFAULT);
    expect(ASK_DAILY_USD_CAP_DEFAULT).toBe(2);
  });

  it("fails closed (null) in production when ASK_USD_CAP_DAILY is unset", () => {
    delete process.env.ASK_USD_CAP_DAILY;
    process.env.LLM_DIGEST_USD_CAP = "2"; // the digest cap must NOT stand in for it
    process.env.VERCEL_ENV = "production";
    expect(askDailyUsdCap()).toBeNull();
  });

  it("an unset cap in production makes the guard refuse every reservation", () => {
    delete process.env.ASK_USD_CAP_DAILY;
    process.env.VERCEL_ENV = "production";
    process.env.LLM_SPRINT_USD_CAP = "25"; // total cap present: only the daily one is missing
    const g = askGuardFromEnv();
    expect(g.cfg.provider).toBe(ASK_PROVIDER);
    expect(ASK_PROVIDER).toBe("openai_ask");
    const r = g.tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("daily USD cap env unset");
  });

  it("an unset LLM_SPRINT_USD_CAP (all-time backstop) also fails closed", () => {
    process.env.ASK_USD_CAP_DAILY = "4";
    delete process.env.LLM_SPRINT_USD_CAP;
    const r = askGuardFromEnv().tryReserve();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("total cap env unset");
  });

  it("request caps read the exact env names, with the documented defaults", () => {
    delete process.env.ASK_DAILY_REQUEST_CAP;
    delete process.env.ASK_RUN_REQUEST_CAP;
    const dflt = askGuardFromEnv();
    expect(dflt.cfg.dailyRequestCap).toBe(500);
    expect(dflt.cfg.runRequestCap).toBe(10);
    process.env.ASK_DAILY_REQUEST_CAP = "123";
    process.env.ASK_RUN_REQUEST_CAP = "7";
    const tuned = askGuardFromEnv();
    expect(tuned.cfg.dailyRequestCap).toBe(123);
    expect(tuned.cfg.runRequestCap).toBe(7);
  });
});
