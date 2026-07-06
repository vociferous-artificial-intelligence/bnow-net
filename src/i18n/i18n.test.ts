import { describe, expect, it } from "vitest";
import { makeT, dict, isLocale, RTL_LOCALES, LOCALES } from "./dictionaries";

describe("i18n dictionaries", () => {
  it("English returns keys, Ukrainian overrides where translated", () => {
    expect(makeT("en")("nav.scoreboard")).toBe("scoreboard");
    expect(makeT("uk")("nav.scoreboard")).toBe("таблиця оцінок");
  });
  it("untranslated locale falls back to English per-key", () => {
    // fr has no dict yet → falls back to en
    expect(makeT("fr")("nav.pricing")).toBe("pricing");
  });
  it("unknown key returns the key itself", () => {
    expect(makeT("en")("nonexistent.key")).toBe("nonexistent.key");
  });
  it("every English key exists in the merged dict for each locale", () => {
    const enKeys = Object.keys(dict("en"));
    for (const loc of LOCALES) {
      const d = dict(loc);
      for (const k of enKeys) expect(d[k]).toBeTruthy();
    }
  });
  it("isLocale + RTL flags", () => {
    expect(isLocale("uk")).toBe(true);
    expect(isLocale("zz")).toBe(false);
    expect(RTL_LOCALES.has("ar")).toBe(true);
    expect(RTL_LOCALES.has("en")).toBe(false);
  });
});
