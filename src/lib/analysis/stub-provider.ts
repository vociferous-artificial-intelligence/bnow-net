import { findNearDuplicates } from "./minhash";
import type {
  AnalysisInputDoc,
  AnalysisProvider,
  DigestAnalysis,
  ExtractedClaim,
  ExtractedEvent,
} from "./provider";

// Deterministic extractive fallback: cluster near-duplicate coverage, surface the
// most-corroborated clusters as events, claim text = representative doc's lead.
// No generation — every string is drawn from source documents (verbatim-attributed).

const EVENT_KEYWORDS: Array<[string, RegExp]> = [
  ["strike", /strike|missile|drone|shahed|udar|обстріл|удар|атак/i],
  ["advance", /advance|assault|captured|seized|наступ|штурм|просунул|зайняли/i],
  ["air_defense", /air defense|intercept|shot down|ппо|пво|збито/i],
  ["political", /putin|zelensky|kremlin|sanctions|negotiat|переговор/i],
  ["economic", /oil|gas|econom|ruble|budget|export/i],
];

function classifyType(text: string): string {
  for (const [type, re] of EVENT_KEYWORDS) if (re.test(text)) return type;
  return "other";
}

export class StubProvider implements AnalysisProvider {
  readonly name = "stub";

  async analyze(
    _country: string,
    _date: string,
    docs: AnalysisInputDoc[],
  ): Promise<DigestAnalysis> {
    const texts = docs.map((d) => `${d.title ?? ""} ${d.content}`.slice(0, 2000));
    const { groups } = findNearDuplicates(texts, 0.5);

    // rank clusters: corroboration count, then total reliability
    const ranked = [...groups.entries()]
      .map(([canonical, members]) => ({
        canonical,
        members,
        score:
          members.length +
          members.reduce((s, i) => s + (docs[i].reliability ?? 0.3), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const events: ExtractedEvent[] = ranked.map(({ canonical, members }) => {
      const rep = docs[canonical];
      const lead = (rep.title ?? rep.content).slice(0, 180).trim();
      const claim: ExtractedClaim = {
        text: lead,
        claimType: "factual",
        // extractive stub cannot judge hedging reliably -> claimed (attributed)
        hedging: "claimed",
        docIds: members.map((i) => docs[i].id),
      };
      return {
        title: lead.slice(0, 100),
        type: classifyType(lead),
        summary: `Reported by ${members.length} document(s); extractive digest (no LLM).`,
        claims: [claim],
      };
    });

    return { events, provider: this.name };
  }
}
