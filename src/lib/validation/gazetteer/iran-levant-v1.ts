// The Iran/Levant/Gulf gazetteer, version `iran-levant-v1` (48h step 06).
//
// WHY IT EXISTS: the conflict evaluator's keyword rung reuses the production
// gazetteer, which is RU/UA-only, so every `iran_regional` declared unit came
// back signal-less — the pre-soak blocker recorded in
// docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101. Measured, not
// assumed: fixtures/validation/gazetteer-snapshot-v1.json records all FIVE
// takeaways of fixtures/isw/iran-update-2026-07-24.html extracting zero
// toponyms under ru-ua-v1.
//
// LANGUAGE: claim text on both populations is English (`doc_claims.text_en`,
// `claims.text`) and reference text is English, so this is English canonical
// forms plus common transliteration variants — NOT fa/ar script. It also
// cannot be: this gazetteer runs in word-boundary mode and JS `\b` is
// ASCII-`\w`-based (./types.ts). Farsi/Arabic variants need a
// `"word-unicode"` mode first.
//
// SCALE RULE (deliberate, and the reason there is no `iran` or `israel`
// canonical): entries are SUB-NATIONAL geography plus named maritime features,
// exactly as ru-ua-v1 carries `pokrovsk` and `belgorod` but never `russia` or
// `ukraine`. A country-level canonical would give almost every unit a toponym
// and make toponym overlap non-discriminating. The single exception is the six
// Gulf states, which ARE contributor theaters of `iran_regional`
// (conflicts/definitions.ts:117-126) and are routinely the operational unit
// themselves; each expands to its own places through `expansions`.
//
// SOURCING: every group below is sourced by GEOGRAPHY (what the place is and
// where it sits), never from any reference-report text — no ISW prose entered
// this file (ruling 1).
//
// NOT PEOPLE (ruling 20): person names are not toponyms and are not here.
// Organizations (IRGC, Hezbollah, the PMF, Ansar Allah) are action-class
// terms, not toponyms. ./iran-levant-v1.test.ts denies a name list explicitly.
//
// RELATIONSHIP TO OTHER TABLES: this is NOT the lane classifier's `IRAN_GEO`
// (conflicts/lane-classifier.ts:113-130), which answers a different question
// (which lane does a candidate belong to) with its own versioned regex set, and
// is deliberately left alone. The action-class ids below echo but are NOT the
// `iran-lanes-v1` lane ids (conflicts/lanes.ts:33-42).
//
// EDITING: append only, never re-sort — key order fixes Set insertion order
// (./types.ts). A content change is a NEW VERSION, not an edit in place, once
// anything downstream persists results scored under this one.

import type { Gazetteer, IranTheater } from "./types";

const TOPONYMS: Record<string, string[]> = {
  // --- Iran interior: capital, nuclear-complex sites, provincial centers ---
  tehran: ["tehran", "teheran"],
  karaj: ["karaj"],
  qom: ["qom"],
  isfahan: ["isfahan", "esfahan"],
  natanz: ["natanz"],
  fordow: ["fordow", "fordo"],
  arak: ["arak", "khondab"],
  parchin: ["parchin"],
  bushehr: ["bushehr", "bushire"],
  tabriz: ["tabriz"],
  mashhad: ["mashhad"],
  shiraz: ["shiraz"],
  kermanshah: ["kermanshah"],
  khorramabad: ["khorramabad"],
  semnan: ["semnan"],
  yazd: ["yazd"],
  ahvaz: ["ahvaz", "ahwaz"],
  khuzestan: ["khuzestan"],
  zahedan: ["zahedan"],
  chabahar: ["chabahar"],
  sistan_baluchestan: ["sistan-baluchestan", "sistan and baluchestan", "sistan", "baluchestan"],
  bandar_abbas: ["bandar abbas", "bandar-abbas"],
  kharg: ["kharg island", "kharg"],

  // --- Gulf, straits and the Red Sea approaches (waterways: theater 'both') ---
  hormuz: ["strait of hormuz", "hormuz"],
  persian_gulf: ["persian gulf", "arabian gulf"],
  gulf_of_oman: ["gulf of oman"],
  gulf_of_aden: ["gulf of aden"],
  bab_el_mandeb: ["bab el-mandeb", "bab al-mandab", "bab al-mandeb"],
  red_sea: ["red sea"],

  // --- Gulf states (the SCALE RULE exception) and their places ---
  saudi_arabia: ["saudi arabia", "saudi"],
  riyadh: ["riyadh"],
  jeddah: ["jeddah", "jiddah"],
  dhahran: ["dhahran"],
  abqaiq: ["abqaiq", "buqayq"],
  yanbu: ["yanbu"],
  jizan: ["jizan", "jazan"],
  eastern_province: ["eastern province"],
  uae: ["united arab emirates", "uae"],
  abu_dhabi: ["abu dhabi"],
  dubai: ["dubai"],
  fujairah: ["fujairah"],
  qatar: ["qatar"],
  doha: ["doha"],
  al_udeid: ["al udeid", "al-udeid"],
  bahrain: ["bahrain"],
  manama: ["manama"],
  kuwait: ["kuwait"],
  kuwait_city: ["kuwait city"],
  oman: ["oman"],
  muscat: ["muscat"],
  duqm: ["duqm"],

  // --- Iraq (no contributor theater owns it: 'both') ---
  baghdad: ["baghdad"],
  erbil: ["erbil", "irbil", "arbil"],
  sulaymaniyah: ["sulaymaniyah", "sulaimaniya", "sulaimaniyah"],
  iraqi_kurdistan: ["iraqi kurdistan", "kurdistan region"],
  kirkuk: ["kirkuk"],
  mosul: ["mosul"],
  basra: ["basra", "basrah"],
  anbar: ["anbar", "al-anbar"],
  ain_al_asad: ["ain al-asad", "ain al asad", "al-asad airbase"],
  al_tanf: ["al-tanf", "al tanf"],
  al_qaim: ["al-qaim", "al qaim"],
  bukamal: ["bukamal", "albu kamal", "abu kamal"],

  // --- Levant: Syria ('both') ---
  damascus: ["damascus"],
  aleppo: ["aleppo"],
  homs: ["homs"],
  hama: ["hama"],
  idlib: ["idlib"],
  latakia: ["latakia"],
  tartus: ["tartus", "tartous"],
  deir_ez_zor: ["deir ez-zor", "deir ezzor", "deir al-zour", "deir al-zor"],
  palmyra: ["palmyra", "tadmur"],
  quneitra: ["quneitra"],
  golan: ["golan heights", "golan"],

  // --- Levant: Lebanon ('both') ---
  beirut: ["beirut"],
  dahiyeh: ["dahiyeh", "dahieh"],
  south_lebanon: ["south lebanon", "southern lebanon"],
  bekaa: ["bekaa valley", "bekaa", "beqaa"],
  baalbek: ["baalbek", "baalbeck"],
  nabatieh: ["nabatieh", "nabatiyeh"],
  tyre: ["tyre"],
  sidon: ["sidon", "saida"],

  // --- Israel and the Palestinian territories ---
  tel_aviv: ["tel aviv"],
  jerusalem: ["jerusalem", "al-quds"],
  haifa: ["haifa"],
  ashkelon: ["ashkelon"],
  ashdod: ["ashdod"],
  beersheba: ["beersheba", "beer sheva"],
  eilat: ["eilat"],
  negev: ["negev"],
  dimona: ["dimona"],
  nevatim: ["nevatim"],
  gaza: ["gaza strip", "gaza", "gazan"],
  rafah: ["rafah"],
  khan_younis: ["khan younis", "khan yunis"],
  west_bank: ["west bank"],
  jenin: ["jenin"],
  nablus: ["nablus"],

  // --- Yemen and the Red Sea littoral ('both') ---
  sanaa: ["sanaa", "sana'a"],
  hodeidah: ["hodeidah", "hudaydah", "al-hudaydah"],
  saada: ["saada", "sadah"],
  aden: ["aden"],
  marib: ["marib", "ma'rib"],
  taiz: ["taiz", "ta'izz"],
  ras_isa: ["ras isa"],
  socotra: ["socotra"],
};

// Action classes. The first five ids and meanings are ru-ua-v1's, so a reader
// comparing conflicts reads one vocabulary; `nuclear`, `militia`, `maritime`
// and `domestic` are the deltas the seven iran-lanes-v1 lanes need
// (conflicts/lanes.ts:33-42). A trailing `*` is a stem match (./types.ts);
// stems are chosen to avoid over-reach ("execution", never "execut*", which
// would swallow "executive").
const ACTIONS: Record<string, string[]> = {
  strike: [
    "strike", "strikes", "struck", "airstrike", "air strike", "missile", "ballistic",
    "cruise missile", "drone", "uav", "rocket*", "shelling", "shelled", "bomb",
    "bombing", "bombed", "bombardment", "attack*", "hit", "explosion", "blast",
  ],
  advance: [
    "advanc*", "assault*", "captur*", "seiz*", "offensive", "incursion", "raid*",
    "ground operation", "took control",
  ],
  air_defense: [
    "air defense", "air-defense", "air defence", "intercept*", "shot down", "shoot down",
    "downed", "iron dome", "david's sling", "arrow interceptor", "patriot", "thaad",
  ],
  political: [
    "sanction*", "snapback", "negotiat*", "talks", "ceasefire", "cease-fire", "truce",
    "summit", "diplomat*", "security council", "mediat*",
  ],
  casualties: ["casualt*", "killed", "wounded", "injur*", "death toll", "fatalities"],
  nuclear: [
    "enrich*", "centrifuge*", "iaea", "uranium", "jcpoa", "safeguards", "breakout",
    "weapons-grade", "weaponiz*", "heavy water", "fissile", "nuclear program",
    "nuclear programme", "inspector*",
  ],
  militia: [
    "irgc", "revolutionary guard", "quds force", "basij", "hezbollah",
    "kataib hezbollah", "harakat al-nujaba", "pmf", "popular mobilization", "hashd",
    "houthi*", "ansar allah", "hamas", "islamic jihad", "axis of resistance",
    "militia*", "proxy", "proxies",
  ],
  maritime: [
    "tanker*", "vessel*", "shipping", "merchant ship", "naval", "warship", "frigate",
    "destroyer", "boarding", "convoy", "escort", "transit*",
  ],
  domestic: [
    "protest*", "unrest", "crackdown", "arrest*", "detain*", "detention", "execution",
    "executions", "executed", "dissident*", "morality police", "internal security",
    "riot*", "security forces", "succession",
  ],
};

// Reference-side expansion, exactly the OBLAST_TOWNS idea (ru-ua-v1): the
// reference report summarizes at the wider level while ground sources name the
// place inside it.
const EXPANSIONS: Record<string, string[]> = {
  saudi_arabia: ["riyadh", "jeddah", "dhahran", "abqaiq", "yanbu", "jizan", "eastern_province"],
  uae: ["abu_dhabi", "dubai", "fujairah"],
  qatar: ["doha", "al_udeid"],
  bahrain: ["manama"],
  kuwait: ["kuwait_city"],
  oman: ["muscat", "duqm"],
  khuzestan: ["ahvaz"],
  sistan_baluchestan: ["zahedan", "chabahar"],
  persian_gulf: ["hormuz", "kharg", "bandar_abbas"],
  red_sea: ["bab_el_mandeb", "hodeidah", "ras_isa"],
  iraqi_kurdistan: ["erbil", "sulaymaniyah"],
  south_lebanon: ["tyre", "nabatieh", "sidon"],
  bekaa: ["baalbek"],
  gaza: ["rafah", "khan_younis"],
  west_bank: ["jenin", "nablus"],
};

/** Which contributor theater of `iran_regional` should be expected to cover a
 *  unit naming this place: `ir` is the mapped theater and `il, sa, ae, qa, om,
 *  bh, kw` are legacy_only (conflicts/definitions.ts:117-126). `both` marks
 *  geography no single contributor theater owns — Iraq, Syria, Lebanon, Yemen
 *  and the waterways — the same treatment `crimea` and `north_korea` get in
 *  ru-ua-v1. */
const THEATER_OF: Record<string, IranTheater> = {
  // Iran interior
  tehran: "ir", karaj: "ir", qom: "ir", isfahan: "ir", natanz: "ir", fordow: "ir",
  arak: "ir", parchin: "ir", bushehr: "ir", tabriz: "ir", mashhad: "ir", shiraz: "ir",
  kermanshah: "ir", khorramabad: "ir", semnan: "ir", yazd: "ir", ahvaz: "ir",
  khuzestan: "ir", zahedan: "ir", chabahar: "ir", sistan_baluchestan: "ir",
  bandar_abbas: "ir", kharg: "ir",
  // waterways
  hormuz: "both", persian_gulf: "both", gulf_of_oman: "both", gulf_of_aden: "both",
  bab_el_mandeb: "both", red_sea: "both",
  // Gulf states
  saudi_arabia: "sa", riyadh: "sa", jeddah: "sa", dhahran: "sa", abqaiq: "sa",
  yanbu: "sa", jizan: "sa", eastern_province: "sa",
  uae: "ae", abu_dhabi: "ae", dubai: "ae", fujairah: "ae",
  qatar: "qa", doha: "qa", al_udeid: "qa",
  bahrain: "bh", manama: "bh",
  kuwait: "kw", kuwait_city: "kw",
  oman: "om", muscat: "om", duqm: "om",
  // Iraq
  baghdad: "both", erbil: "both", sulaymaniyah: "both", iraqi_kurdistan: "both",
  kirkuk: "both", mosul: "both", basra: "both", anbar: "both", ain_al_asad: "both",
  al_tanf: "both", al_qaim: "both", bukamal: "both",
  // Syria
  damascus: "both", aleppo: "both", homs: "both", hama: "both", idlib: "both",
  latakia: "both", tartus: "both", deir_ez_zor: "both", palmyra: "both",
  quneitra: "both", golan: "both",
  // Lebanon
  beirut: "both", dahiyeh: "both", south_lebanon: "both", bekaa: "both",
  baalbek: "both", nabatieh: "both", tyre: "both", sidon: "both",
  // Israel and the Palestinian territories
  tel_aviv: "il", jerusalem: "il", haifa: "il", ashkelon: "il", ashdod: "il",
  beersheba: "il", eilat: "il", negev: "il", dimona: "il", nevatim: "il",
  gaza: "il", rafah: "il", khan_younis: "il", west_bank: "il", jenin: "il", nablus: "il",
  // Yemen
  sanaa: "both", hodeidah: "both", saada: "both", aden: "both", marib: "both",
  taiz: "both", ras_isa: "both", socotra: "both",
};

export const IRAN_LEVANT_V1: Gazetteer = {
  version: "iran-levant-v1",
  // word-boundary mode is load-bearing, not a preference: under substring
  // matching "aden" fires inside "laden", "arak" inside "Karak", "qom" inside
  // "qomi", "homs" inside "homsi" and "gaza" inside "gazans" — pinned in
  // ./match.test.ts
  matchMode: "word",
  toponyms: TOPONYMS,
  actions: ACTIONS,
  expansions: EXPANSIONS,
  theaterOf: THEATER_OF,
};
