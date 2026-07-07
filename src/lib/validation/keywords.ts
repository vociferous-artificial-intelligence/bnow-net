// Trilingual (en/ru/uk) signature extraction for event matching.
// Deterministic v1 matcher: shared toponym + compatible action class.
// An LLM provider can replace matching later; the metric definitions stay.

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

export interface Signature {
  toponyms: Set<string>;
  actions: Set<string>;
}

/** Expand oblast-level toponyms to include member towns (for the ISW side). */
export function expandToponyms(toponyms: Set<string>): Set<string> {
  const out = new Set(toponyms);
  for (const t of toponyms) for (const town of OBLAST_TOWNS[t] ?? []) out.add(town);
  return out;
}

export function extractSignature(text: string): Signature {
  const t = ` ${text.toLowerCase()} `;
  const toponyms = new Set<string>();
  for (const [canon, variants] of Object.entries(TOPONYMS))
    if (variants.some((v) => t.includes(v))) toponyms.add(canon);
  const actions = new Set<string>();
  for (const [canon, variants] of Object.entries(ACTIONS))
    if (variants.some((v) => t.includes(v))) actions.add(canon);
  return { toponyms, actions };
}

/** Match score in [0,1]: toponym overlap dominates, action agreement refines. */
export function matchScore(a: Signature, b: Signature): number {
  const sharedTopo = [...a.toponyms].filter((x) => b.toponyms.has(x)).length;
  const sharedAct = [...a.actions].filter((x) => b.actions.has(x)).length;
  if (sharedTopo === 0 && sharedAct === 0) return 0;
  const topoScore = sharedTopo > 0 ? Math.min(1, sharedTopo / 2) : 0;
  const actScore = sharedAct > 0 ? 0.5 : 0;
  // toponym match alone: 0.5+; toponym+action: up to 1.0; action alone: 0.25
  if (sharedTopo > 0) return Math.min(1, 0.5 + topoScore * 0.25 + actScore * 0.5);
  return 0.25;
}

export const MATCH_THRESHOLD = 0.6; // toponym + action agreement required
