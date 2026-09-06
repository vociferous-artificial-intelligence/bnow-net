// The RU/UA gazetteer, version `ru-ua-v1` (48h step 06).
//
// MOVED VERBATIM from src/lib/validation/keywords.ts (lines 5-110 of the
// pre-split file): same identifiers, same key order, same array order, no
// sorting, no copies. Key order is load-bearing — it fixes Set insertion order,
// which is persisted as `isw_reports.takeaways[].toponyms` and compared in
// conflicts/backtest-matrix.ts:245 — so this table is edited by APPEND only,
// and never re-sorted.
//
// This is the production keyword gazetteer: every current caller of
// ../keywords.ts resolves here, and fixtures/validation/gazetteer-snapshot-v1.json
// (generated before the split) plus the legacy-oracle differential in
// ./ru-ua-v1.test.ts pin that the split moved nothing.

import type { Gazetteer } from "./types";

const TOPONYMS: Record<string, string[]> = {
  // canonical: [en, ru, uk, variants...]
  pokrovsk: ["pokrovsk", "покровск", "покровськ", "krasnoarmeysk", "красноармейск"],
  toretsk: ["toretsk", "торецк", "торецьк", "dzerzhinsk"],
  kupyansk: ["kupyansk", "kupiansk", "купянск", "куп'янськ", "купʼянськ"],
  chasiv_yar: ["chasiv yar", "часов яр", "часів яр"],
  kostyantynivka: ["kostyantynivka", "konstantinovka", "константиновка", "костянтинівка"],
  lyman: ["lyman", "лиман"],
  siversk: ["siversk", "северск", "сіверськ"],
  sloviansk: ["sloviansk", "славянск", "слов'янськ"],
  kramatorsk: ["kramatorsk", "краматорск", "краматорськ"],
  vovchansk: ["vovchansk", "волчанск", "вовчанськ"],
  kharkiv: ["kharkiv", "харьков", "харків"],
  sumy: ["sumy", "сумы", "суми"],
  zaporizhzhia: ["zaporizhzhia", "запорожье", "запоріжжя", "orikhiv", "оріхів", "орехов"],
  kherson: ["kherson", "херсон"],
  donetsk: ["donetsk", "донецк", "донецьк"],
  luhansk: ["luhansk", "луганск", "луганськ"],
  velykyi_burluk: ["velykyi burluk", "великий бурлук"],
  novopavlivka: ["novopavlivka", "новопавловка", "новопавлівка"],
  velyka_novosilka: ["velyka novosilka", "великая новоселка", "велика новосілка"],
  hulyaipole: ["hulyaipole", "гуляйполе"],
  kyiv: ["kyiv", "киев", "київ"],
  odesa: ["odesa", "odessa", "одесса", "одеса"],
  dnipro: ["dnipro", "днепр", "дніпро", "dnipropetrovsk"],
  crimea: ["crimea", "крым", "крим", "sevastopol", "севастополь"],
  moscow: ["moscow", "москва"],
  belgorod: ["belgorod", "белгород", "бєлгород"],
  kursk: ["kursk", "курск", "курськ"],
  bryansk: ["bryansk", "брянск", "брянськ"],
  rostov: ["rostov", "ростов"],
  ryazan: ["ryazan", "рязань"],
  tatarstan: ["tatarstan", "татарстан", "yelabuga", "елабуга"],
  st_petersburg: ["petersburg", "петербург", "spief", "пмэф"],
  dubna: ["dubna", "дубна"],
  north_korea: ["north korea", "dprk", "кндр", "северная корея", "північна корея"],
};

const ACTIONS: Record<string, string[]> = {
  strike: [
    "strike", "missile", "drone", "shahed", "geran", "attack", "hit", "удар", "ракет",
    "дрон", "шахед", "геран", "бпла", "uav", "обстрел", "обстріл", "атак", "вибух", "взрыв",
    "explosion", "fire at", "fire broke", "refinery fire", "пожар", "пожеж",
  ],
  advance: [
    "advance", "assault", "captur", "seiz", "liberat", "наступ", "штурм", "просунул",
    "просував", "зайня", "захват", "звільн", "освобо", "offensive",
  ],
  air_defense: [
    "air defense", "intercept", "shot down", "downed", "пво", "ппо", "збит", "сбит",
    "перехват", "перехопл",
  ],
  political: [
    "putin", "zelensky", "kremlin", "negotiat", "sanction", "путин", "путін", "зеленск",
    "зеленськ", "кремл", "переговор", "санкц", "ceasefire", "мобилизац", "мобілізац",
  ],
  casualties: ["casualt", "losses", "killed", "потер", "втрат", "загибл", "погиб"],
};

// Oblast-level names expand to their member towns for matching: ISW takeaways
// summarize at oblast level while ground sources name towns.
const OBLAST_TOWNS: Record<string, string[]> = {
  donetsk: [
    "pokrovsk", "toretsk", "chasiv_yar", "kostyantynivka", "lyman", "siversk",
    "sloviansk", "kramatorsk", "velyka_novosilka", "novopavlivka",
  ],
  kharkiv: ["kupyansk", "vovchansk", "velykyi_burluk"],
  zaporizhzhia: ["hulyaipole"],
  luhansk: [],
  kherson: [],
  sumy: [],
};

// Theater of each gazetteer toponym: 'ua' = inside Ukraine (frontline + rear),
// 'ru' = inside Russia, 'both' = covered from both sides (occupied Crimea) or
// non-territorial. RU and UA digests validate against the same whole-war ISW
// report; scoring a theater against the other side's takeaways deflates coverage.
export const TOPONYM_THEATER: Record<string, "ru" | "ua" | "both"> = {
  pokrovsk: "ua", toretsk: "ua", kupyansk: "ua", chasiv_yar: "ua",
  kostyantynivka: "ua", lyman: "ua", siversk: "ua", sloviansk: "ua",
  kramatorsk: "ua", vovchansk: "ua", kharkiv: "ua", sumy: "ua",
  zaporizhzhia: "ua", kherson: "ua", donetsk: "ua", luhansk: "ua",
  velykyi_burluk: "ua", novopavlivka: "ua", velyka_novosilka: "ua",
  hulyaipole: "ua", kyiv: "ua", odesa: "ua", dnipro: "ua",
  crimea: "both",
  moscow: "ru", belgorod: "ru", kursk: "ru", bryansk: "ru", rostov: "ru",
  ryazan: "ru", tatarstan: "ru", st_petersburg: "ru", dubna: "ru",
  north_korea: "both",
};

/** Which theater digest should be expected to cover a takeaway with these
 *  toponyms. No territorial signal (political/casualties bullets) -> both. */
export function classifyTakeawayTheater(toponyms: string[]): "ru" | "ua" | "both" {
  let ru = false;
  let ua = false;
  for (const t of toponyms) {
    const th = TOPONYM_THEATER[t];
    if (th === "ru") ru = true;
    else if (th === "ua") ua = true;
    else if (th === "both") return "both";
  }
  if (ru && ua) return "both";
  if (ru) return "ru";
  if (ua) return "ua";
  return "both";
}

export const RU_UA_V1: Gazetteer = {
  version: "ru-ua-v1",
  matchMode: "substring", // historical behaviour; also the only correct mode
  // for Cyrillic variants (JS `\b` is ASCII-`\w`-based) — see ./types.ts
  toponyms: TOPONYMS,
  actions: ACTIONS,
  expansions: OBLAST_TOWNS,
  theaterOf: TOPONYM_THEATER,
};
