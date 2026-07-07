// Intelligence tracks: parallel digest pipelines over the same raw_documents.
// 'military' is ISW-validated; 'elite_politics' (Kremlinology) tracks prosecutions,
// asset seizures, appointments and gang cases as factional-realignment signals.

export type Track = "military" | "elite_politics" | "nuclear";

export interface TrackConfig {
  track: Track;
  /** which countries run this track */
  countries: string[];
  /** doc prefilter: at least one lexicon hit required (case-insensitive) */
  lexicon: RegExp | null; // null = military's toponym/action filter (in stub-provider)
  systemPrompt: string | null; // null = provider default (military)
  validated: boolean; // scored against ISW?
  /** per-theater overrides: the RU-shaped defaults misfire on other theaters
   *  (Iran military needs proxy/maritime/IRGC framing, not toponym gazetteers) */
  lexiconByCountry?: Record<string, RegExp>;
  systemPromptByCountry?: Record<string, string>;
}

const ELITE_LEXICON = new RegExp(
  [
    // ru: courts / prosecution / security services
    "суд[аеу]?\\b", "арест", "задержан", "приговор", "уголовн", "обыск", "СИЗО",
    "прокурат", "следственн", "ФСБ", "СКР?\\b", "взятк", "коррупц", "хищени",
    "мошеннич", "конфискац", "национализац", "изъяти", "экстремист", "иноагент",
    "госизмен", "ОПГ", "банд[ыуе]", "криминальн", "авторитет",
    // elite churn
    "олигарх", "миллиардер", "губернатор", "мэр[аеу]?\\b", "министр", "замминистр",
    "отставк", "назначен", "уволен", "скончался", "погиб.{0,20}(бизнесмен|чиновник|депутат|генерал)",
    // en equivalents (Meduza EN / MT / Insider)
    "court", "arrest", "detained", "verdict", "sentenc", "criminal case", "raid",
    "prosecut", "embezzl", "briber", "corruption", "fraud", "asset seizure",
    "nationaliz", "oligarch", "billionaire", "governor", "dismissed", "resign",
    "foreign agent", "treason", "gang", "crime boss", "mafia",
    // Iran/Gulf elite politics (English-language sources)
    "cleric", "ayatollah", "IRGC", "Majlis", "Khamenei", "succession", "bonyad",
    "crown prince", "\\bemir\\b", "royal decree", "reshuffle", "purge",
  ].join("|"),
  "i",
);

// Shared entity-extraction discipline: the entity graph feeds sanctions matching,
// ownership resolution, /entities, /signals and /ask — junk degrades all five.
// Appended to every track prompt that extracts entities.
export const ENTITY_RULES = `ENTITY RULES — entities must be specific, trackable real-world actors:
- ONLY named individuals (first + last name where known), specific agencies/courts ("Investigative Committee", "St. Petersburg City Court"), named companies, named organizations/parties/armed groups.
- NEVER: unnamed or counted people ("five individuals", "an ex-official", "a schoolboy"); collectives ("civilians", "officials", "protesters", "forces personnel"); bare geography as an actor ("Moscow", "Ukraine", "Isfahan"); weapons/equipment/objects ("Su-27", "oil tankers"); diseases/weather/abstractions.
- Use ONE canonical English transliteration without titles/honorifics: "Ali Khamenei" not "Ayatollah Seyyed Ali Khamenei"; "Volodymyr Zelenskyy" not "Zelenskiy".
- If the actor cannot be named specifically, attach no entity at all.`;

export const ELITE_POLITICS_PROMPT = `You are an analyst tracking Russian ELITE POLITICS through open sources: criminal prosecutions, corruption cases, asset seizures/nationalizations, gang/organized-crime trials with political links, appointments, dismissals, and suspicious deaths of officials or businessmen.
Input: numbered source documents (id, source, reliability 0-1; Russian/Ukrainian/English).
Output: significant developments as events with specific claims.

ANALYTICAL FRAME — every event should answer where possible:
- WHO is targeted (person/company) and WHICH NETWORK/FACTION they belong to (patron, agency affiliation, region, industry).
- WHICH ORGAN is acting (FSB, Investigative Committee, Prosecutor General, MVD, courts) — the acting agency is itself a factional signal.
- WHAT the likely signal is (faction losing cover, asset redistribution, purge, intra-siloviki turf war). Mark such interpretations claimType='assessment', hedging='assessed'.

HARD RULES:
1. Every claim MUST cite docIds from the input. Never invent ids.
2. One atomic assertion per claim, English, <= 200 chars.
3. For each claim list involved entities: {name (canonical English), kind (person|agency|company|faction|org), role (defendant|prosecutor|target|beneficiary|appointee|dismissed|patron|other)}.
4. Facts get hedging claimed/confirmed/unverified per sourcing; factional interpretation is ALWAYS 'assessed'.
5. Ignore routine crime with no political/elite dimension.
6. event type: prosecution|asset_seizure|appointment|dismissal|elite_death|gang_case|other.
7. 4-10 events, most significant first.

${ENTITY_RULES}`;

// --- Iran military track (theater variant) ---
// The default military prompt and the RU/UA toponym relevance signal are useless
// for Iran: its military picture is proxy attacks, maritime incidents and
// IRGC/CENTCOM posture, not front lines. Quiet days are normal — the prompt says
// so explicitly rather than forcing event invention.

const IRAN_MILITARY_LEXICON = new RegExp(
  [
    // strikes / air defense
    "strike", "missile", "drone", "uav", "air defense", "air-defense", "intercept",
    "explosion", "airstrike", "shot down", "ballistic",
    // forces & commands
    "irgc", "revolutionary guard", "artesh", "basij", "quds force", "centcom",
    "fifth fleet", "idf", "israeli", "military exercise", "drill", "deployment",
    // proxies
    "hezbollah", "houthi", "hamas", "islamic jihad", "militia", "proxy",
    "kataib", "resistance",
    // maritime
    "hormuz", "strait", "tanker", "vessel", "seiz", "red sea", "gulf of oman",
    "bab el-mandeb", "shipping", "naval", "warship", "frigate",
    // facilities / nuclear-adjacent military
    "natanz", "fordow", "isfahan", "sabotage", "enrichment site",
    // Farsi/Arabic
    "سپاه", "پهپاد", "موشک", "حمله", "الحوثي", "حزب الله", "صاروخ", "هجوم",
  ].join("|"),
  "i",
);

const IRAN_MILITARY_PROMPT = `You are an OSINT analyst producing a daily IRAN-THEATER military/security digest.
Input: numbered source documents (id, source, reliability 0-1; English/Persian/Arabic).
Output: significant military-security developments as events with specific claims.

FOCUS (this theater is posture-and-proxy, not front lines):
- strikes and counterstrikes involving Iran, Israel, or the US (CENTCOM)
- IRGC / Artesh / Quds Force activity: deployments, exercises, commander statements, losses
- proxy and partner attacks: Hezbollah, Houthis (incl. Red Sea shipping), Iraqi militias, Palestinian Islamic Jihad
- maritime incidents: Strait of Hormuz, tanker seizures/harassment, naval movements
- air-defense activity, airspace closures, sabotage at military or nuclear facilities
- arms transfers and missile/drone program developments

HARD RULES:
1. Every claim MUST cite docIds from the input. Never invent ids.
2. One atomic assertion per claim, English (translate Persian/Arabic), <= 200 chars.
3. hedging: 'confirmed' for multi-party/visually corroborated; 'claimed' for single-party
   (state media claims stay 'claimed'); 'unverified' for uncorroborated; analytic
   judgments claimType='assessment', hedging='assessed'.
4. Weigh reliability: state-media (Press TV, IRNA) claims need corroboration before
   leading an event.
5. QUIET DAYS ARE NORMAL: if the day has no genuine military-security development,
   return fewer events (0-2) rather than inflating routine news into events.
6. 0-10 events, most significant first.

${ENTITY_RULES}`;

// --- Iran nuclear track ---
const NUCLEAR_LEXICON = new RegExp(
  [
    "enrich", "enrichment", "centrifuge", "IAEA", "Fordow", "Fordo", "Natanz",
    "Arak", "Bushehr", "Isfahan", "breakout", "\\bHEU\\b", "uranium", "reactor",
    "inspector", "safeguards", "JCPOA", "\\bUF6\\b", "cascade", "heavy water",
    "nuclear", "warhead", "weaponiz", "proliferat", "Grossi", "20 percent",
    "60 percent", "weapons-grade",
    // Farsi
    "هسته", "غنی", "سانتریفیوژ", "نطنز", "فوردو", "آژانس", "اورانیوم", "بوشهر",
  ].join("|"),
  "i",
);

const NUCLEAR_PROMPT = `You are a nonproliferation analyst tracking IRAN'S NUCLEAR PROGRAM through open sources.
Input: numbered source documents (id, source, reliability 0-1; English/Persian/Arabic).
Output: significant nuclear-related developments as events with specific claims.

FOCUS: enrichment level & stockpile changes, IAEA reporting/access/inspections, facility
activity (Natanz, Fordow, Isfahan, Arak, Bushehr), centrifuge installation/type, sabotage
or strikes on facilities, breakout-time implications, diplomatic status (JCPOA/talks),
weaponization indicators.

HARD RULES:
1. Every claim MUST cite docIds from the input. Never invent ids.
2. One atomic assertion per claim, English (translate Persian/Arabic), <= 200 chars.
3. Technical facts get hedging per sourcing (confirmed if IAEA/geolocated; claimed if
   single-party; unverified if uncorroborated). Analytic judgments (breakout estimates,
   intent) are claimType='assessment', hedging='assessed'.
4. For each claim list involved entities: {name, kind (person|agency|company|faction|org),
   role (target|operator|inspector|official|other)} — e.g. IAEA, AEOI, IRGC, facilities.
5. event type: enrichment|iaea|facility|sabotage|diplomacy|weaponization|other.
6. Do not sensationalize; distinguish reported from assessed. 4-10 events.

${ENTITY_RULES}`;

export const TRACKS: Record<Track, TrackConfig> = {
  military: {
    track: "military",
    // ru/ua are ISW-validated; Gulf wave runs the same security digest unvalidated
    // (reference analysis per docs/NEW-COUNTRY-PLAYBOOK.md step 2)
    countries: ["ru", "ua", "il", "ir", "sa", "ae", "qa", "om", "bh", "kw"],
    lexicon: null,
    systemPrompt: null,
    validated: true,
    lexiconByCountry: { ir: IRAN_MILITARY_LEXICON },
    systemPromptByCountry: { ir: IRAN_MILITARY_PROMPT },
  },
  elite_politics: {
    track: "elite_politics",
    // ru = Kremlinology; ir = clerical/IRGC/bonyad factions + succession
    countries: ["ru", "ir"],
    lexicon: ELITE_LEXICON,
    systemPrompt: ELITE_POLITICS_PROMPT,
    validated: false,
  },
  nuclear: {
    track: "nuclear",
    countries: ["ir"],
    lexicon: NUCLEAR_LEXICON,
    systemPrompt: NUCLEAR_PROMPT,
    validated: false,
  },
};

export function isEliteRelevant(text: string): boolean {
  return ELITE_LEXICON.test(text);
}

export function isNuclearRelevant(text: string): boolean {
  return NUCLEAR_LEXICON.test(text);
}
