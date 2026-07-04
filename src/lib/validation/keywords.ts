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

export interface Signature {
  toponyms: Set<string>;
  actions: Set<string>;
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
