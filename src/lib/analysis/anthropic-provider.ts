import { assertLlmEnabled } from "../usage/llm-guard";
import type {
  AnalysisInputDoc,
  AnalysisProvider,
  DigestAnalysis,
  ExtractedEvent,
} from "./provider";
import { ENTITY_RULES } from "./tracks";

// Anthropic (Claude) analysis provider — same contract as the OpenAI provider.
// Plain fetch (no SDK dependency); requests strict JSON in the prompt and parses
// defensively. Downstream guards (docId validation, uncited-claim dropping) apply
// regardless of provider, so a malformed response degrades to an empty digest,
// never to fabricated citations. Selected by getProvider() when
// ANALYSIS_PROVIDER=anthropic, or automatically when only ANTHROPIC_API_KEY exists.

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

const SYSTEM = `You are an OSINT analyst producing a daily conflict digest.
Input: numbered source documents (id, source, reliability 0-1, text; Russian/Ukrainian/English).
Output: significant events of the day with specific claims, as JSON only.

HARD RULES:
1. Every claim MUST cite docIds — only ids that appear in the input. Never invent ids.
2. A claim is ONE atomic assertion in English (translate as needed), <= 200 chars.
3. hedging: 'confirmed' only for visually/geolocation-corroborated facts;
   'claimed' for single-party assertions; 'unverified' for uncorroborated reports;
   'assessed' for analytic judgments (mark those claimType='assessment').
4. Prefer events corroborated by multiple independent sources.
5. Weigh source reliability: low-reliability sources need corroboration before their
   claims lead an event.
6. 5-12 events, most significant first. Do not editorialize beyond the evidence.

${ENTITY_RULES}

Respond with ONLY a JSON object, no prose, matching:
{"events":[{"title":str,"type":"strike|advance|air_defense|political|economic|other","summary":str,"claims":[{"text":str,"claimType":"factual|assessment","hedging":"confirmed|claimed|unverified|assessed|unknown","docIds":[int],"entities":[{"name":str,"kind":"person|agency|company|faction|org","role":str}]}]}]}`;

/** Extract the first JSON object from a model response (tolerates code fences). */
export function parseEventsJson(raw: string): ExtractedEvent[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { events?: ExtractedEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

export class AnthropicProvider implements AnalysisProvider {
  readonly name = `anthropic:${MODEL}`;

  async analyze(
    countryIso2: string,
    date: string,
    docs: AnalysisInputDoc[],
    opts?: { systemPrompt?: string | null; track?: string },
  ): Promise<DigestAnalysis> {
    assertLlmEnabled("anthropic digest extract");
    const docLines = docs
      .map(
        (d) =>
          `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}) ${(
            (d.title ? d.title + ". " : "") + d.content
          )
            .replace(/\s+/g, " ")
            .slice(0, 400)}`,
      )
      .join("\n");

    const system = opts?.systemPrompt
      ? `${opts.systemPrompt}\n\nRespond with ONLY the JSON object described for the default digest format.`
      : SYSTEM;

    const request = () =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          temperature: 0.2,
          system,
          messages: [
            {
              role: "user",
              content: `Theater: ${countryIso2.toUpperCase()} · Date: ${date}\n\nDocuments:\n${docLines}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });

    let res = await request();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      res = await request();
    }
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((b) => b.type === "text")?.text ?? "";
    const events = parseEventsJson(raw);
    if (events.length === 0 && raw.length > 0 && !raw.includes('"events"'))
      console.error("anthropic-provider: response carried no events JSON");
    return { events, provider: this.name };
  }
}
