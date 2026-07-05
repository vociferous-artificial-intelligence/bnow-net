import OpenAI from "openai";
import type { ClaimForValidation } from "./score";

// LLM-assisted semantic matching between ISW takeaways and our claims.
// ISW text is used TRANSIENTLY in the prompt (internal analysis, §8.6);
// only match verdicts are returned/persisted. Falls back to keyword
// matching upstream when no key is available.

export interface LlmMatch {
  takeawayIndex: number;
  claimId: number | null;
  confidence: number; // 0-1
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          takeawayIndex: { type: "integer" },
          claimId: { type: ["integer", "null"] },
          confidence: { type: "number" },
        },
        required: ["takeawayIndex", "claimId", "confidence"],
      },
    },
  },
  required: ["matches"],
} as const;

const SYSTEM = `You compare an expert analyst's daily takeaways against automated digest claims covering the same day and theater.
For EACH takeaway, decide whether any claim reports substantially the same event or development.
Rules:
- A match requires the same underlying event/development, not just the same topic.
- Villages belong to their front/oblast: a claim naming a specific village matches a takeaway about advances in that oblast/direction if consistent.
- "No confirmed advances" style takeaways match claims explicitly reporting absence/stalling, NOT claims asserting advances.
- claimId must come from the provided claim list. If nothing matches, claimId = null.
- confidence: 0.9+ same event, 0.7 same development described differently, below 0.6 do not match (return null).`;

export async function llmMatchTakeaways(
  takeawayTexts: string[],
  claims: ClaimForValidation[],
): Promise<LlmMatch[] | null> {
  if (!process.env.OPENAI_API_KEY || process.env.ANALYSIS_PROVIDER === "stub") return null;
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const user =
    "TAKEAWAYS:\n" +
    takeawayTexts.map((t, i) => `[${i}] ${t.replace(/\s+/g, " ").slice(0, 400)}`).join("\n") +
    "\n\nCLAIMS:\n" +
    claims.map((c) => `(${c.claimId}) ${c.text.replace(/\s+/g, " ").slice(0, 300)}`).join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "matches", schema: SCHEMA as never, strict: true },
      },
      temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content ?? '{"matches":[]}';
    const parsed = (JSON.parse(raw) as { matches: LlmMatch[] }).matches ?? [];
    // sanitize: valid indexes, valid claim ids, confidence gate
    const validClaims = new Set(claims.map((c) => c.claimId));
    return parsed
      .filter((m) => m.takeawayIndex >= 0 && m.takeawayIndex < takeawayTexts.length)
      .map((m) => ({
        ...m,
        claimId:
          m.claimId !== null && validClaims.has(m.claimId) && m.confidence >= 0.6
            ? m.claimId
            : null,
      }));
  } catch (e) {
    console.warn(`llm-match failed, falling back to keywords: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
