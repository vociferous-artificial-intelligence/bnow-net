// Intelligence tracks: parallel digest pipelines over the same raw_documents.
// 'military' is ISW-validated; 'elite_politics' (Kremlinology) tracks prosecutions,
// asset seizures, appointments and gang cases as factional-realignment signals.

export type Track = "military" | "elite_politics";

export interface TrackConfig {
  track: Track;
  /** which countries run this track */
  countries: string[];
  /** doc prefilter: at least one lexicon hit required (case-insensitive) */
  lexicon: RegExp | null; // null = military's toponym/action filter (in stub-provider)
  systemPrompt: string | null; // null = provider default (military)
  validated: boolean; // scored against ISW?
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
  ].join("|"),
  "i",
);

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
7. 4-10 events, most significant first.`;

export const TRACKS: Record<Track, TrackConfig> = {
  military: {
    track: "military",
    // ru/ua are ISW-validated; Gulf wave runs the same security digest unvalidated
    // (reference analysis per docs/NEW-COUNTRY-PLAYBOOK.md step 2)
    countries: ["ru", "ua", "il", "ir", "sa", "ae", "qa", "om", "bh", "kw"],
    lexicon: null,
    systemPrompt: null,
    validated: true,
  },
  elite_politics: {
    track: "elite_politics",
    countries: ["ru"],
    lexicon: ELITE_LEXICON,
    systemPrompt: ELITE_POLITICS_PROMPT,
    validated: false,
  },
};

export function isEliteRelevant(text: string): boolean {
  return ELITE_LEXICON.test(text);
}
