import OpenAI from "openai";
import type {
  AnalysisInputDoc,
  AnalysisProvider,
  DigestAnalysis,
  ExtractedEvent,
} from "./provider";

// OpenAI structured-output extraction. Hard rules enforced downstream too:
// claims may only cite docIds present in the input batch; uncited claims are dropped.

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          type: {
            type: "string",
            enum: ["strike", "advance", "air_defense", "political", "economic", "other"],
          },
          summary: { type: "string" },
          claims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                claimType: { type: "string", enum: ["factual", "assessment"] },
                hedging: {
                  type: "string",
                  enum: ["confirmed", "claimed", "unverified", "assessed", "unknown"],
                },
                docIds: { type: "array", items: { type: "integer" } },
              },
              required: ["text", "claimType", "hedging", "docIds"],
            },
          },
        },
        required: ["title", "type", "summary", "claims"],
      },
    },
  },
  required: ["events"],
} as const;

const SYSTEM = `You are an OSINT analyst producing a daily conflict digest.
Input: numbered source documents (id, source, reliability 0-1, text; Russian/Ukrainian/English).
Output: significant events of the day with specific claims.

HARD RULES:
1. Every claim MUST cite docIds — only ids that appear in the input. Never invent ids.
2. A claim is ONE atomic assertion in English (translate as needed), <= 200 chars.
3. hedging: 'confirmed' only for visually/geolocation-corroborated facts;
   'claimed' for single-party assertions; 'unverified' for uncorroborated reports;
   'assessed' for analytic judgments (mark those claimType='assessment').
4. Prefer events corroborated by multiple independent sources; note single-source items as such.
5. Weigh source reliability: low-reliability sources need corroboration before their
   claims lead an event.
6. 5-12 events, most significant first. Do not editorialize beyond the evidence.`;

export class OpenAiProvider implements AnalysisProvider {
  readonly name = `openai:${MODEL}`;
  private client = new OpenAI();

  async analyze(
    countryIso2: string,
    date: string,
    docs: AnalysisInputDoc[],
  ): Promise<DigestAnalysis> {
    const docLines = docs
      .map(
        (d) =>
          `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}) ${(
            (d.title ? d.title + ". " : "") + d.content
          )
            .replace(/\s+/g, " ")
            .slice(0, 500)}`,
      )
      .join("\n");

    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Theater: ${countryIso2.toUpperCase()} · Date: ${date}\n\nDocuments:\n${docLines}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "digest", schema: RESPONSE_SCHEMA as never, strict: true },
      },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? '{"events":[]}';
    let events: ExtractedEvent[] = [];
    try {
      events = (JSON.parse(raw) as { events: ExtractedEvent[] }).events ?? [];
    } catch {
      console.error("openai-provider: unparseable response");
    }
    return { events, provider: this.name };
  }
}
