import { extractSignature } from "../validation/keywords";
import { findNearDuplicates } from "./minhash";
import { isEliteRelevant } from "./tracks";
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
    opts?: { systemPrompt?: string | null; track?: string },
  ): Promise<DigestAnalysis> {
    // relevance prefilter — track-specific lexicon for elite politics, otherwise
    // theater toponym / military action (drops housekeeping + off-topic reposts)
    const relevant =
      opts?.track === "elite_politics"
        ? docs.filter((d) =>
            isEliteRelevant(`${d.title ?? ""} ${d.content}`.slice(0, 1500)),
          )
        : docs.filter((d) => {
            const sig = extractSignature(`${d.title ?? ""} ${d.content}`.slice(0, 1500));
            return sig.toponyms.size > 0 || sig.actions.size > 0;
          });
    const pool = relevant.length >= 15 || opts?.track === "elite_politics" ? relevant : docs;
    if (pool.length === 0) return { events: [], provider: this.name };

    const texts = pool.map((d) => `${d.title ?? ""} ${d.content}`.slice(0, 2000));
    const { groups } = findNearDuplicates(texts, 0.5);

    // rank clusters: corroboration count, reliability, and topical specificity
    const ranked = [...groups.entries()]
      .map(([canonical, members]) => {
        const sig = extractSignature(texts[canonical]);
        return {
          canonical,
          members,
          score:
            members.length +
            members.reduce((s, i) => s + (pool[i].reliability ?? 0.3), 0) +
            sig.toponyms.size * 1.5 +
            sig.actions.size * 0.5,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const events: ExtractedEvent[] = ranked.map(({ canonical, members }) => {
      const rep = pool[canonical];
      const lead = (rep.title ?? rep.content).slice(0, 180).trim();
      const claim: ExtractedClaim = {
        text: lead,
        claimType: "factual",
        // extractive stub cannot judge hedging reliably -> claimed (attributed)
        hedging: "claimed",
        docIds: members.map((i) => pool[i].id),
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
