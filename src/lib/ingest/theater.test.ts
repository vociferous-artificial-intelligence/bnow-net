import { describe, expect, it } from "vitest";
import { channelTheater } from "./config";
import { routeTheater } from "./theater";

describe("routeTheater", () => {
  it("routes Persian to the Iran theater whatever the source default", () => {
    // 3,401 Persian docs sat in the ru corpus for want of this rule (audit §9d)
    expect(routeTheater("fa", "ru")).toBe("ir");
    expect(routeTheater("fa", "ua")).toBe("ir");
    expect(routeTheater("fa", "ir")).toBe("ir");
  });

  it("keeps the long-standing uk -> ua convention", () => {
    expect(routeTheater("uk", "ru")).toBe("ua");
    expect(routeTheater("uk", "ua")).toBe("ua");
  });

  it("never routes Arabic by language: it spans ir/sa/ae/qa/om/il", () => {
    expect(routeTheater("ar", "ru")).toBe("ru");
    expect(routeTheater("ar", "sa")).toBe("sa");
    expect(routeTheater("ar", "ir")).toBe("ir");
  });

  it("falls back to the source default for every other language", () => {
    expect(routeTheater("ru", "ru")).toBe("ru");
    expect(routeTheater("en", "ir")).toBe("ir");
    expect(routeTheater(null, "ru")).toBe("ru");
    expect(routeTheater(undefined, "sa")).toBe("sa");
  });
});

describe("channelTheater", () => {
  it("routes the five Iranian registry channels to ir", () => {
    for (const c of ["nournews_ir", "mehrnews", "iribnews", "farsna", "defapress_ir"]) {
      expect(channelTheater(c)).toBe("ir");
    }
  });

  it("is case-insensitive (the registry stores channel names verbatim)", () => {
    expect(channelTheater("MehrNews")).toBe("ir");
    expect(channelTheater("IRIBNews")).toBe("ir");
  });

  it("defaults unknown registry channels to ru", () => {
    expect(channelTheater("rybar")).toBe("ru");
    expect(channelTheater("some_new_channel")).toBe("ru");
  });

  it("routes the channels' non-Persian posts too, which the language rule cannot", () => {
    // the 5 channels also published 12 en + 4 ar docs; only the override catches them
    expect(routeTheater("en", channelTheater("mehrnews"))).toBe("ir");
    expect(routeTheater("ar", channelTheater("iribnews"))).toBe("ir");
  });

  it("routes all 27 RU/UA-priority Ukrainian official/military pins to ua", () => {
    // registry-verified Ukrainian-theater sources (ROCA-cited, ~0 Iran, uk-dominant
    // docs); the uk->ua language rule alone misses their ru/en posts, so the
    // per-channel override is what actually routes them.
    const UA_PINS = [
      "v_zelenskiy_official",
      "vitaliy_klitschko",
      "ihor_terekhov",
      "synegubov",
      "ivan_fedorov_zp",
      "sbukr",
      "ukr_sof",
      "usf_army",
      "dsns_telegram",
      "ua_national_police",
      "prokuratura_kharkiv",
      "dnipropetrovskaoda",
      "odeskaoda",
      "odesamva",
      "chernigivskaoda",
      "khersonskaoda",
      "kyivoda",
      "mykolaivskaoda",
      "zoda_gov_ua",
      "dniproofficial",
      "sjtf_odes",
      "joint_forces_task_force",
      "wararchive_ua",
      "serhii_flash",
      "andriyshtime",
      "robert_magyar",
      "atesh_ua",
    ];
    expect(UA_PINS).toHaveLength(27);
    for (const c of UA_PINS) {
      expect(channelTheater(c), c).toBe("ua");
    }
  });

  it("is case-insensitive for the Ukrainian pins too", () => {
    expect(channelTheater("V_Zelenskiy_Official")).toBe("ua");
    expect(channelTheater("SBUkr")).toBe("ua");
    expect(channelTheater("SJTF_Odes")).toBe("ua");
  });

  it("still defaults an unrelated/unknown channel to ru (pins are exact-match only)", () => {
    for (const c of ["some_russian_milblogger", "rybar", "sjtf_odesa_typo"]) {
      expect(channelTheater(c), c).toBe("ru");
    }
  });
});
