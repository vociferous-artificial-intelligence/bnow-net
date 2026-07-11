import { afterEach, describe, expect, it, vi } from "vitest";
import { envPositiveInt, envReportTheater } from "./config";

describe("env helpers", () => {
  it("envPositiveInt falls back on unset/non-numeric/zero/negative", () => {
    delete process.env.TEST_TOP_N_X;
    expect(envPositiveInt("TEST_TOP_N_X", 50)).toBe(50);
    process.env.TEST_TOP_N_X = "not-a-number";
    expect(envPositiveInt("TEST_TOP_N_X", 50)).toBe(50);
    process.env.TEST_TOP_N_X = "0";
    expect(envPositiveInt("TEST_TOP_N_X", 50)).toBe(50);
    process.env.TEST_TOP_N_X = "-5";
    expect(envPositiveInt("TEST_TOP_N_X", 50)).toBe(50);
    process.env.TEST_TOP_N_X = "120";
    expect(envPositiveInt("TEST_TOP_N_X", 50)).toBe(120);
    process.env.TEST_TOP_N_X = "120.9";
    expect(envPositiveInt("TEST_TOP_N_X", 50)).toBe(120);
    delete process.env.TEST_TOP_N_X;
  });

  it("envReportTheater: ru/ir pass, all/any -> null (pan-theater), else -> default", () => {
    delete process.env.TEST_REPORT_THEATER_X;
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ru")).toBe("ru"); // unset -> fallback
    process.env.TEST_REPORT_THEATER_X = "bogus";
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ru")).toBe("ru"); // typo -> fallback
    process.env.TEST_REPORT_THEATER_X = "ir";
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ru")).toBe("ir");
    process.env.TEST_REPORT_THEATER_X = "RU";
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ir")).toBe("ru"); // case-insensitive
    process.env.TEST_REPORT_THEATER_X = "all";
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ru")).toBeNull(); // explicit pan-theater
    process.env.TEST_REPORT_THEATER_X = "ANY";
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ru")).toBeNull();
    process.env.TEST_REPORT_THEATER_X = "";
    expect(envReportTheater("TEST_REPORT_THEATER_X", "ru")).toBe("ru"); // empty != pan-theater
    delete process.env.TEST_REPORT_THEATER_X;
  });
});

// The constants are resolved once at module load, so proving the env actually
// wires through to them means importing a FRESH copy of the module with the env
// set first (vi.resetModules drops the cached one).
describe("registry-size constants read their env overrides at load", () => {
  const KEYS = [
    "REGISTRY_TELEGRAM_TOP_N",
    "REGISTRY_TELEGRAM_TOP_N_MTPROTO",
    "REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.resetModules();
  });

  async function freshConfig() {
    for (const k of KEYS) saved[k] = process.env[k];
    vi.resetModules();
    return import("./config");
  }

  it("defaults to web=50, mtproto=120, theater=ru when the env is unset", async () => {
    for (const k of KEYS) delete process.env[k];
    const c = await freshConfig();
    expect(c.REGISTRY_TELEGRAM_TOP_N).toBe(50);
    expect(c.REGISTRY_TELEGRAM_TOP_N_MTPROTO).toBe(120);
    expect(c.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER).toBe("ru");
  });

  it("applies valid env overrides to the exported constants", async () => {
    process.env.REGISTRY_TELEGRAM_TOP_N = "40";
    process.env.REGISTRY_TELEGRAM_TOP_N_MTPROTO = "200";
    process.env.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER = "ir";
    const c = await freshConfig();
    expect(c.REGISTRY_TELEGRAM_TOP_N).toBe(40);
    expect(c.REGISTRY_TELEGRAM_TOP_N_MTPROTO).toBe(200);
    expect(c.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER).toBe("ir");
  });

  it("REPORT_THEATER=all opts the constant into pan-theater (null) for a code-free rollback", async () => {
    process.env.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER = "all";
    const c = await freshConfig();
    expect(c.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER).toBeNull();
  });

  it("falls back safely when the env values are invalid", async () => {
    process.env.REGISTRY_TELEGRAM_TOP_N = "0";
    process.env.REGISTRY_TELEGRAM_TOP_N_MTPROTO = "not-a-number";
    process.env.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER = "atlantis";
    const c = await freshConfig();
    expect(c.REGISTRY_TELEGRAM_TOP_N).toBe(50);
    expect(c.REGISTRY_TELEGRAM_TOP_N_MTPROTO).toBe(120);
    expect(c.REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER).toBe("ru");
  });
});
