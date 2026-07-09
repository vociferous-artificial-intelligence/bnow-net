import { describe, expect, it } from "vitest";
import {
  makeT,
  dict,
  ownDict,
  isLocale,
  parseLocaleParam,
  resolveLocale,
  fallbackChain,
  localesByPriority,
  LOCALE_REGISTRY,
  RTL_LOCALES,
  LOCALES,
  LOCALE_NAMES,
  DEFAULT_LOCALE,
  REQUIRED_NAMESPACES,
} from "./dictionaries";
import { dirFor } from "./server";

const NEW_LOCALES = ["de", "ar", "ja", "pl", "fr"] as const;
// Locales that ship a full own catalog (not English fallback stubs).
const TRANSLATED = ["uk", "de", "ar", "ja", "pl", "fr"] as const;

function tokensOf(s: string): Set<string> {
  return new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

describe("locale registry", () => {
  it("includes en, uk and the five new locales with required metadata", () => {
    for (const code of ["en", "uk", ...NEW_LOCALES] as const) {
      expect(isLocale(code)).toBe(true);
      const meta = LOCALE_REGISTRY[code];
      expect(meta.code).toBe(code);
      expect(meta.label).toBeTruthy(); // English label
      expect(meta.nativeLabel).toBeTruthy(); // native label
      expect(meta.dir === "ltr" || meta.dir === "rtl").toBe(true);
      expect(typeof meta.order).toBe("number");
      expect(isLocale(meta.fallback)).toBe(true);
    }
  });

  it("exposes native names for the selector", () => {
    expect(LOCALE_NAMES.de).toBe("Deutsch");
    expect(LOCALE_NAMES.ar).toBe("العربية");
    expect(LOCALE_NAMES.ja).toBe("日本語");
    expect(LOCALE_NAMES.pl).toBe("Polski");
    expect(LOCALE_NAMES.fr).toBe("Français");
  });

  it("orders locales by market priority, English first", () => {
    const order = localesByPriority().map((m) => m.code);
    expect(order[0]).toBe("en");
    expect(order[1]).toBe("uk");
    // strictly ascending order values, no duplicates
    const vals = localesByPriority().map((m) => m.order);
    expect([...vals]).toEqual([...vals].sort((a, b) => a - b));
    expect(new Set(vals).size).toBe(vals.length);
  });
});

describe("text direction", () => {
  it("Arabic is rtl; every other required locale is ltr", () => {
    expect(LOCALE_REGISTRY.ar.dir).toBe("rtl");
    expect(RTL_LOCALES.has("ar")).toBe(true);
    for (const code of ["en", "uk", "de", "ja", "pl", "fr"] as const) {
      expect(LOCALE_REGISTRY[code].dir).toBe("ltr");
      expect(RTL_LOCALES.has(code)).toBe(false);
    }
  });
});

describe("translation + fallback", () => {
  it("English returns keys; Ukrainian overrides where translated (no regression)", () => {
    expect(makeT("en")("nav.scoreboard")).toBe("scoreboard");
    expect(makeT("uk")("nav.scoreboard")).toBe("таблиця оцінок");
  });

  it("new locales translate core chrome", () => {
    expect(makeT("de")("nav.pricing")).toBe("Preise");
    expect(makeT("fr")("nav.pricing")).toBe("tarifs");
    expect(makeT("pl")("nav.scoreboard")).toBe("tabela walidacji");
    expect(makeT("ja")("nav.ask")).toBe("質問");
    expect(makeT("ar")("nav.signin")).toBe("تسجيل الدخول");
  });

  it("a locale with no catalog falls back to English per-key", () => {
    // es has no dict yet → English fallback
    expect(makeT("es")("nav.pricing")).toBe("pricing");
    expect(fallbackChain("es")).toEqual(["es", "en"]);
  });

  it("unknown key returns the key itself", () => {
    expect(makeT("en")("nonexistent.key")).toBe("nonexistent.key");
  });

  it("every English key resolves to a non-empty string for every locale", () => {
    const enKeys = Object.keys(dict("en"));
    for (const loc of LOCALES) {
      const t = makeT(loc);
      for (const k of enKeys) expect(t(k)).toBeTruthy();
    }
  });

});

describe("protected labels stay literal in every OWN catalog", () => {
  // Asserts against ownDict (the locale's actual translation, not the English
  // fallback) so a transliteration like تيليجرام / Telegrama is caught, not masked.
  const CASES: Array<{ key: string; literal: string }> = [
    { key: "home.tagline", literal: "OSINT" },
    { key: "home.footer", literal: "OSINT" },
    { key: "home.features.scored.body", literal: "ISW" },
    { key: "scoreboard.avg_coverage", literal: "ISW" },
    { key: "scoreboard.median_lead", literal: "ISW" },
    { key: "home.sub", literal: "Telegram" },
  ];
  for (const loc of TRANSLATED) {
    const own = ownDict(loc)!;
    for (const { key, literal } of CASES) {
      it(`${loc} ${key} keeps "${literal}" literal`, () => {
        // only meaningful when the locale actually translates the key
        if (own[key] !== undefined) expect(own[key]).toContain(literal);
      });
    }
  }
});

describe("interpolation", () => {
  it("replaces {name} placeholders and leaves none behind", () => {
    const out = makeT("de")("home.features.reliability.body", {
      sources: "6,985",
      citations: "251,000",
    });
    expect(out).toContain("6,985");
    expect(out).toContain("251,000");
    expect(out).not.toMatch(/\{[a-z]+\}/);
  });

  it("no catalog string has an unresolved placeholder when all vars are supplied", () => {
    // guards against a translation that renamed a {token}
    const vars = { sources: "1", citations: "2", docs: "3", runs: "4" };
    for (const loc of LOCALES) {
      const d = dict(loc);
      const t = makeT(loc);
      for (const key of Object.keys(d)) {
        expect(t(key, vars)).not.toMatch(/\{[a-z]+\}/);
      }
    }
  });

  it("every own translation preserves the exact placeholder set of the English source", () => {
    // catches a DROPPED or RENAMED {token} (which the leftover-token check cannot).
    const enDict = dict("en");
    for (const loc of TRANSLATED) {
      const own = ownDict(loc)!;
      for (const [key, value] of Object.entries(own)) {
        if (enDict[key] === undefined) continue;
        expect(tokensOf(value), `${loc} ${key}`).toEqual(tokensOf(enDict[key]));
      }
    }
  });
});

describe("message catalog namespaces", () => {
  it("English covers every required top-level namespace with at least one key", () => {
    const keys = Object.keys(dict("en"));
    for (const ns of REQUIRED_NAMESPACES) {
      expect(keys.some((k) => k.startsWith(`${ns}.`))).toBe(true);
    }
  });

  it("each translated locale's OWN catalog covers every required namespace", () => {
    // non-vacuous: checks the locale's real translations, not the English merge.
    for (const loc of TRANSLATED) {
      const keys = Object.keys(ownDict(loc)!);
      for (const ns of REQUIRED_NAMESPACES) {
        expect(keys.some((k) => k.startsWith(`${ns}.`)), `${loc} missing ${ns}`).toBe(true);
      }
    }
  });
});

describe("locale selection", () => {
  it("switcher accepts valid locales, rejects invalid ones", () => {
    for (const code of NEW_LOCALES) expect(parseLocaleParam(code)).toBe(code);
    expect(parseLocaleParam("en")).toBe("en");
    expect(parseLocaleParam("zz")).toBeNull();
    expect(parseLocaleParam("")).toBeNull();
    expect(parseLocaleParam(null)).toBeNull();
    expect(parseLocaleParam("de-DE")).toBeNull(); // only bare codes are selectable
  });

  it("isLocale guards new + existing locales", () => {
    expect(isLocale("uk")).toBe(true);
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("zz")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("resolveLocale honors priority: explicit > cookie > Accept-Language > default", () => {
    expect(resolveLocale({ explicit: "de", cookie: "fr", acceptLanguage: "ja" })).toBe("de");
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "ja" })).toBe("fr");
    expect(resolveLocale({ acceptLanguage: "ja,en;q=0.9" })).toBe("ja");
    expect(resolveLocale({ acceptLanguage: "pl-PL,pl;q=0.9,en;q=0.8" })).toBe("pl");
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ cookie: "zz", acceptLanguage: "xx" })).toBe(DEFAULT_LOCALE);
  });

  it("resolveLocale ranks Accept-Language by q-weight, not header order", () => {
    expect(resolveLocale({ acceptLanguage: "en;q=0.5, de;q=0.9" })).toBe("de");
    expect(resolveLocale({ acceptLanguage: "de;q=0.2, ja;q=0.9" })).toBe("ja");
    // equal (implicit) weights keep source order
    expect(resolveLocale({ acceptLanguage: "de, fr" })).toBe("de");
    // unsupported-but-higher-q is skipped for the next supported one
    expect(resolveLocale({ acceptLanguage: "zz;q=1.0, fr;q=0.4" })).toBe("fr");
  });
});

describe("no regression for existing en / uk", () => {
  it("English chrome values are unchanged", () => {
    const t = makeT("en");
    expect(t("nav.pricing")).toBe("pricing");
    expect(t("nav.signin")).toBe("sign in");
    expect(t("home.cta.subscribe")).toBe("Become a founding subscriber");
    expect(t("common.status")).toBe("status");
  });
  it("Ukrainian chrome values are unchanged (original five keys preserved)", () => {
    const t = makeT("uk");
    expect(t("nav.pricing")).toBe("тарифи");
    expect(t("nav.scoreboard")).toBe("таблиця оцінок");
    expect(t("home.cta.scoreboard")).toBe("Переглянути таблицю");
    expect(t("home.live")).toBe("У прямому ефірі: Росія · Україна · Іран");
    expect(t("common.status")).toBe("стан");
  });
});

describe("dirFor runtime path (feeds layout dir=)", () => {
  it("returns rtl only for Arabic among the required locales", () => {
    expect(dirFor("ar")).toBe("rtl");
    for (const loc of ["en", "uk", "de", "ja", "pl", "fr"] as const) {
      expect(dirFor(loc)).toBe("ltr");
    }
  });
});
